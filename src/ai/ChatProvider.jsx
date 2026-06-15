import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { streamChat } from "./streamClient";
import { applyEdits, artifactOverview } from "../lib/grid";
import { attachmentToBlocks } from "../lib/attachments";
import { loadArtifact, commitArtifact } from "../lib/artifactsApi";

/* ------------------------------------------------------------------
   ChatProvider — single source of truth for the AI assistant.
   - apiMessages (ref): canonical raw Anthropic messages, incl.
     tool_use / tool_result / thinking blocks, round-tripped verbatim.
   - displayItems (state): what the UI renders (user bubbles, markdown
     assistant text, tool chips, confirmation cards, notices).
   Shared by the full AI Analyst page and the global slide-over panel.
   ------------------------------------------------------------------ */

const ChatContext = createContext(null);
export const useChat = () => useContext(ChatContext);

let nextId = 1;
const uid = () => `it${nextId++}`;

const GREETING =
  "Finance AI online — I'm wired into your live portfolio and can read **and edit** everything: holdings, bonds, transactions, balances, watchlist. Tell me about trades you've made, ask what to buy or dump, request a full stock pitch, or have me review your past trading decisions. Any change I propose needs your approval first.";

function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Rebuild the display timeline from persisted raw API messages. */
function rebuildDisplay(apiMessages, writeLabels) {
  const items = [{ kind: "assistant_text", id: uid(), text: GREETING }];
  for (let i = 0; i < apiMessages.length; i++) {
    const m = apiMessages[i];
    if (m.role === "user") {
      const isToolResult = Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result");
      if (!isToolResult) items.push({ kind: "user", id: uid(), text: extractText(m.content) });
      continue;
    }
    const text = extractText(m.content);
    if (text.trim()) items.push({ kind: "assistant_text", id: uid(), text });
    const toolUses = Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_use") : [];
    const writes = toolUses.filter((tu) => writeLabels[tu.name]);
    if (!writes.length) continue;
    const next = apiMessages[i + 1];
    const results = new Map(
      Array.isArray(next?.content)
        ? next.content.filter((b) => b.type === "tool_result").map((b) => [b.tool_use_id, b])
        : [],
    );
    const resolved = writes.every((tu) => results.has(tu.id));
    items.push({
      kind: "confirmation",
      id: uid(),
      writes: writes.map((tu) => ({
        tool_use_id: tu.id,
        name: tu.name,
        label: writeLabels[tu.name] ?? tu.name,
        input: tu.input,
      })),
      read_results: [],
      status: !resolved
        ? "pending"
        : writes.some((tu) => {
              const r = results.get(tu.id);
              return r?.is_error && String(r.content).startsWith("User declined");
            })
          ? "rejected"
          : "approved",
    });
  }
  return items;
}

// Mirrors WRITE_LABELS in the edge function (display only).
export const WRITE_LABELS = {
  add_equity: "Add equity position",
  update_equity: "Update equity position",
  delete_equity: "Delete equity position",
  add_bond: "Add bond position",
  update_bond: "Update bond position",
  delete_bond: "Delete bond position",
  add_transaction: "Record transaction",
  delete_transaction: "Delete transaction",
  update_buying_power: "Update buying power",
  add_to_watchlist: "Add to watchlist",
  remove_from_watchlist: "Remove from watchlist",
};

export function ChatProvider({ children, onDataChanged }) {
  const apiMessagesRef = useRef([]);
  const seqRef = useRef(0);
  const abortRef = useRef(null);
  const persistRef = useRef(true); // flips off if the tables don't exist yet
  const onDataChangedRef = useRef(onDataChanged);
  onDataChangedRef.current = onDataChanged;

  const [displayItems, setDisplayItems] = useState(() => [
    { kind: "assistant_text", id: uid(), text: GREETING },
  ]);
  const [streaming, setStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [flashIds, setFlashIds] = useState(new Set());

  // Active spreadsheet artifact + the AI's staged (un-applied) cell edits.
  const [activeArtifact, setActiveArtifact] = useState(null); // { id, name, data }
  const [stagedEdits, setStagedEdits] = useState(() => new Map()); // "sheet:r:c" -> { sheet,row,col,old,value }
  const activeArtifactRef = useRef(null);
  activeArtifactRef.current = activeArtifact;

  /* ------------------------- persistence ------------------------- */

  const refreshConversations = useCallback(async () => {
    if (!persistRef.current) return;
    const { data, error } = await supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) {
      persistRef.current = false;
      return;
    }
    setConversations(data ?? []);
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const ensureConversation = useCallback(
    async (firstText) => {
      if (!persistRef.current) return null;
      if (conversationId) return conversationId;
      const { data, error } = await supabase
        .from("ai_conversations")
        .insert({ title: firstText.slice(0, 60) })
        .select("id")
        .single();
      if (error) {
        persistRef.current = false;
        return null;
      }
      setConversationId(data.id);
      refreshConversations();
      return data.id;
    },
    [conversationId, refreshConversations],
  );

  const saveMessage = useCallback(async (convId, role, content) => {
    if (!persistRef.current || !convId) return;
    seqRef.current += 1;
    const { error } = await supabase.from("ai_messages").insert({
      conversation_id: convId,
      seq: seqRef.current,
      role,
      content: typeof content === "string" ? [{ type: "text", text: content }] : content,
    });
    if (error) persistRef.current = false;
    else {
      await supabase
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convId);
    }
  }, []);

  const loadConversation = useCallback(async (id) => {
    if (!persistRef.current) return;
    const { data, error } = await supabase
      .from("ai_messages")
      .select("seq, role, content")
      .eq("conversation_id", id)
      .order("seq", { ascending: true });
    if (error) return;
    const msgs = (data ?? []).map((r) => ({ role: r.role, content: r.content }));
    apiMessagesRef.current = msgs;
    seqRef.current = data?.length ? data[data.length - 1].seq : 0;
    setConversationId(id);
    setDisplayItems(rebuildDisplay(msgs, WRITE_LABELS));
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    apiMessagesRef.current = [];
    seqRef.current = 0;
    setConversationId(null);
    setStreaming(false);
    setStatusLabel(null);
    setDisplayItems([{ kind: "assistant_text", id: uid(), text: GREETING }]);
  }, []);

  const renameConversation = useCallback(
    async (id, title) => {
      const clean = (title ?? "").trim();
      if (!clean) return;
      const { error } = await supabase
        .from("ai_conversations")
        .update({ title: clean.slice(0, 120) })
        .eq("id", id);
      if (!error) refreshConversations();
    },
    [refreshConversations],
  );

  const deleteConversation = useCallback(
    async (id) => {
      const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
      if (error) return;
      if (id === conversationId) newChat(); // the open one was deleted
      refreshConversations();
    },
    [conversationId, newChat, refreshConversations],
  );

  /* --------------------------- streaming --------------------------- */

  const pushItem = useCallback((item) => {
    setDisplayItems((prev) => [...prev, { id: uid(), ...item }]);
  }, []);

  /* ------------------------ artifacts ------------------------ */

  const openArtifact = useCallback(async (id) => {
    try {
      const row = await loadArtifact(id);
      setActiveArtifact({ id: row.id, name: row.name, data: row.data });
      setPanelOpen(true);
    } catch {
      /* artifact missing or not ours — ignore */
    }
  }, []);

  const closeArtifact = useCallback(() => {
    setActiveArtifact(null);
    setStagedEdits(new Map());
  }, []);

  const setActiveSheet = useCallback((idx) => {
    setActiveArtifact((prev) => (prev ? { ...prev, data: { ...prev.data, activeSheet: idx } } : prev));
  }, []);

  // Direct (manual) cell edit — commits immediately, no staging.
  const updateArtifactCell = useCallback((sheetIdx, row, col, value) => {
    setActiveArtifact((prev) => {
      if (!prev) return prev;
      const data = applyEdits(prev.data, sheetIdx, [{ row, col, value }]);
      commitArtifact(prev.id, data).catch(() => {});
      return { ...prev, data };
    });
  }, []);

  const discardStagedEdits = useCallback(() => setStagedEdits(new Map()), []);

  const applyStagedEdits = useCallback(() => {
    setStagedEdits((staged) => {
      if (!staged.size) return staged;
      setActiveArtifact((prev) => {
        if (!prev) return prev;
        const bySheet = new Map();
        for (const e of staged.values()) {
          if (!bySheet.has(e.sheet)) bySheet.set(e.sheet, []);
          bySheet.get(e.sheet).push({ row: e.row, col: e.col, value: e.value });
        }
        let data = prev.data;
        for (const [sheetIdx, edits] of bySheet) data = applyEdits(data, sheetIdx, edits);
        commitArtifact(prev.id, data).catch(() => {});
        return { ...prev, data };
      });
      return new Map();
    });
  }, []);

  const runStream = useCallback(
    async (body, convId) => {
      setStreaming(true);
      setStatusLabel(null);
      const controller = new AbortController();
      abortRef.current = controller;
      let currentTextId = null;

      const appendText = (text) => {
        if (currentTextId) {
          setDisplayItems((prev) =>
            prev.map((it) => (it.id === currentTextId ? { ...it, text: it.text + text } : it)),
          );
        } else {
          const id = uid();
          currentTextId = id;
          setDisplayItems((prev) => [...prev, { kind: "assistant_text", id, text }]);
        }
      };

      try {
        for await (const ev of streamChat(body, { signal: controller.signal })) {
          switch (ev.type) {
            case "message_start":
              currentTextId = null;
              break;
            case "text_delta":
              setStatusLabel(null);
              appendText(ev.text);
              break;
            case "thinking_delta":
              setStatusLabel((prev) => {
                const base = prev && prev.length < 200 ? prev : "";
                const next = (base + ev.text).trim();
                return next.length > 90 ? `…${next.slice(-88)}` : next;
              });
              break;
            case "status":
              setStatusLabel(ev.label);
              break;
            case "tool_activity":
              pushItem({ kind: "tool", label: ev.label, is_error: ev.is_error });
              break;
            case "assistant_snapshot":
              apiMessagesRef.current.push({ role: "assistant", content: ev.content });
              saveMessage(convId, "assistant", ev.content);
              break;
            case "tool_results_snapshot":
              // Mirror the tool_result user message the server appended,
              // so replayed histories stay valid (tool_use ↔ tool_result).
              apiMessagesRef.current.push({ role: "user", content: ev.content });
              saveMessage(convId, "user", ev.content);
              break;
            case "pending_confirmation":
              pushItem({
                kind: "confirmation",
                writes: ev.writes,
                read_results: ev.read_results ?? [],
                status: "pending",
              });
              break;
            case "data_changed": {
              onDataChangedRef.current?.(ev.changes);
              const ids = ev.changes.flatMap((c) => c.ids ?? []);
              if (ids.length) {
                setFlashIds((prev) => new Set([...prev, ...ids]));
                setTimeout(
                  () =>
                    setFlashIds((prev) => {
                      const next = new Set(prev);
                      ids.forEach((i) => next.delete(i));
                      return next;
                    }),
                  2600,
                );
              }
              break;
            }
            case "artifact_edit": {
              // The agent proposed cell edits — stage them as a live preview.
              if (!activeArtifactRef.current || activeArtifactRef.current.id !== ev.artifact_id) {
                openArtifact(ev.artifact_id);
              }
              setPanelOpen(true);
              setStagedEdits((prev) => {
                const next = new Map(prev);
                for (const e of ev.edits ?? []) {
                  next.set(`${ev.sheet}:${e.row}:${e.col}`, { sheet: ev.sheet, row: e.row, col: e.col, old: e.old, value: e.value });
                }
                return next;
              });
              break;
            }
            case "error":
              pushItem({ kind: "notice", text: `⚠︎ ${ev.message}` });
              break;
            case "done":
              break;
            default:
              break;
          }
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          pushItem({ kind: "notice", text: `⚠︎ ${err?.message ?? String(err)}` });
        }
      } finally {
        setStreaming(false);
        setStatusLabel(null);
        abortRef.current = null;
      }
    },
    [pushItem, saveMessage, openArtifact],
  );

  const sendMessage = useCallback(
    async (text, attachments = []) => {
      const trimmed = (text ?? "").trim();
      if ((!trimmed && !attachments.length) || streaming) return;
      const firstText = trimmed || (attachments[0]?.name ? `Attached ${attachments[0].name}` : "Attachment");
      const convId = await ensureConversation(firstText);

      // Build content blocks: text + attachments + an active-artifact note.
      const blocks = [];
      if (trimmed) blocks.push({ type: "text", text: trimmed });
      for (const att of attachments) blocks.push(...attachmentToBlocks(att));
      const art = activeArtifactRef.current;
      if (art && !attachments.some((a) => a.kind === "artifact")) {
        const ov = artifactOverview(art.data).map((s) => `sheet "${s.name}" (${s.rows}×${s.cols})`).join("; ");
        blocks.push({ type: "text", text: `[Active spreadsheet artifact — id=${art.id}, name="${art.name}": ${ov}. Use read_artifact / set_cells with this artifact_id.]` });
      }
      // Keep plain chats as a string (matches prior caching behavior).
      const content = blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : blocks;

      apiMessagesRef.current.push({ role: "user", content });
      pushItem({ kind: "user", text: trimmed, attachments: attachments.map((a) => ({ name: a.name, kind: a.kind })) });
      saveMessage(convId ?? conversationId, "user", content);
      await runStream({ messages: apiMessagesRef.current }, convId ?? conversationId);
    },
    [streaming, ensureConversation, conversationId, pushItem, saveMessage, runStream],
  );

  /**
   * Deep-dive a single stock: open the side panel, ask the AI for a verdict,
   * then parse + persist a Buy/Hold/Sell rating for the symbol. Returns the
   * verdict (or null if none was produced).
   */
  const analyzeStock = useCallback(
    async (symbol) => {
      const sym = (symbol ?? "").toUpperCase();
      if (!sym || streaming) return null;
      setPanelOpen(true);
      const prompt =
        `Do a deep-dive investment analysis on ${sym}. Cover the business, recent ` +
        `financials, valuation, key risks and catalysts, and how it fits my current ` +
        `portfolio and any position I hold in it. Be specific and decisive. Finish with ` +
        `exactly one line on its own, formatted precisely as: "RECOMMENDATION: BUY" or ` +
        `"RECOMMENDATION: HOLD" or "RECOMMENDATION: SELL".`;
      await sendMessage(prompt);

      // Pull the most recent assistant text and parse the verdict line.
      const msgs = apiMessagesRef.current;
      let text = "";
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          const t = extractText(msgs[i].content);
          if (t.trim()) { text = t; break; }
        }
      }
      const match = text.match(/RECOMMENDATION:\s*(BUY|HOLD|SELL)/i);
      if (!match) return null;
      const rating = match[1].toUpperCase();
      await supabase.from("ai_stock_ratings").upsert(
        { symbol: sym, rating, rationale: text.slice(0, 1000), updated_at: new Date().toISOString() },
        { onConflict: "user_id,symbol" },
      );
      return { symbol: sym, rating };
    },
    [streaming, sendMessage, setPanelOpen],
  );

  /** Resolve a pending confirmation card. approvals: [{tool_use_id, approved, reason?}] */
  const resolveConfirmation = useCallback(
    async (itemId, approvals) => {
      if (streaming) return;
      let readResults = [];
      setDisplayItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemId) return it;
          readResults = it.read_results ?? [];
          const anyApproved = approvals.some((a) => a.approved);
          return { ...it, status: anyApproved ? "approved" : "rejected" };
        }),
      );
      // The server builds the tool_result message (executing approved
      // writes) and echoes it back as tool_results_snapshot, which keeps
      // apiMessages in sync — nothing to reconstruct here.
      await runStream(
        {
          messages: apiMessagesRef.current,
          resume: { approvals, read_results: readResults },
        },
        conversationId,
      );
    },
    [streaming, conversationId, runStream],
  );

  const abort = useCallback(() => abortRef.current?.abort(), []);

  /* --------------------------- shortcuts --------------------------- */

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setPanelOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = {
    displayItems,
    streaming,
    statusLabel,
    panelOpen,
    setPanelOpen,
    conversationId,
    conversations,
    flashIds,
    sendMessage,
    analyzeStock,
    resolveConfirmation,
    abort,
    newChat,
    loadConversation,
    refreshConversations,
    renameConversation,
    deleteConversation,
    // artifacts
    activeArtifact,
    stagedEdits,
    openArtifact,
    closeArtifact,
    setActiveSheet,
    updateArtifactCell,
    applyStagedEdits,
    discardStagedEdits,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
