import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { streamChat } from "./streamClient";

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

  /* --------------------------- streaming --------------------------- */

  const pushItem = useCallback((item) => {
    setDisplayItems((prev) => [...prev, { id: uid(), ...item }]);
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
    [pushItem, saveMessage],
  );

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      const convId = await ensureConversation(trimmed);
      apiMessagesRef.current.push({ role: "user", content: trimmed });
      pushItem({ kind: "user", text: trimmed });
      saveMessage(convId ?? conversationId, "user", trimmed);
      await runStream({ messages: apiMessagesRef.current }, convId ?? conversationId);
    },
    [streaming, ensureConversation, conversationId, pushItem, saveMessage, runStream],
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
    resolveConfirmation,
    abort,
    newChat,
    loadConversation,
    refreshConversations,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
