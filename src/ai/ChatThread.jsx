import React, { useEffect, useRef, useState } from "react";
import { Bot, FileSpreadsheet, FileText, Image as ImageIcon, Loader, Paperclip, Send, Square, UploadCloud, Wrench, X } from "lucide-react";
import { COLORS, MONO, SANS, SERIF } from "../lib/theme";
import { useChat } from "./ChatProvider";
import { ACCEPT } from "../lib/attachments";
import MarkdownMessage from "./MarkdownMessage";
import ConfirmationCard from "./ConfirmationCard";
import ThinkingIndicator from "./ThinkingIndicator";
import ModelPicker from "./ModelPicker";

/* ------------------------------------------------------------------
   Shared chat transcript + composer, used by both the full AI Analyst
   page and the global slide-over panel (single conversation state).
   Supports file attachments (drag-drop + picker): spreadsheets become
   editable artifacts; PDFs/images/text/Word become read context.
   ------------------------------------------------------------------ */

const DEFAULT_SUGGESTIONS = [
  "Analyze my portfolio's concentration and biggest risks",
  "I just bought a stock — help me log it",
  "Review my trading decisions and grade each one",
  "What should I trim or add right now? Check the latest news first.",
];

let attSeq = 0;

function kindIcon(kind, size = 12) {
  if (kind === "artifact") return <FileSpreadsheet size={size} />;
  if (kind === "image") return <ImageIcon size={size} />;
  return <FileText size={size} />;
}

function Avatar({ role }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        width: 26, height: 26, borderRadius: 4, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isUser ? COLORS.panelHi : "transparent",
        border: `1px solid ${isUser ? COLORS.borderHi : COLORS.amberDim}`,
        color: isUser ? COLORS.text : COLORS.amber,
        fontFamily: isUser ? SERIF : "inherit", fontSize: 13,
      }}
    >
      {isUser ? "O" : <Bot size={13} strokeWidth={1.5} />}
    </div>
  );
}

function ToolChip({ label, isError }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 10px" }}>
      <Wrench size={10} color={isError ? COLORS.down : COLORS.textMute} strokeWidth={1.5} />
      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, color: isError ? COLORS.down : COLORS.textMute }}>{label}</span>
    </div>
  );
}

/** Small file chip used in the composer and inside user bubbles. */
function FileChip({ name, kind, status, onRemove }) {
  const tone = status === "error" ? COLORS.down : status === "ready" || !status ? COLORS.amber : COLORS.textDim;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, maxWidth: 220, padding: "5px 8px", border: `1px solid ${status === "error" ? COLORS.down : COLORS.border}`, background: COLORS.panel }}>
      <span style={{ color: tone, display: "flex" }}>
        {status === "parsing" ? <Loader size={12} className="fa-spin" /> : kindIcon(kind)}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 10.5, color: status === "error" ? COLORS.down : COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      {onRemove && (
        <button onClick={onRemove} style={{ all: "unset", cursor: "pointer", color: COLORS.textMute, display: "flex" }} title="Remove">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export default function ChatThread({ suggestions = DEFAULT_SUGGESTIONS, compact = false }) {
  const { displayItems, streaming, statusLabel, sendMessage, resolveConfirmation, abort, openArtifact } = useChat();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]); // { id, name, kind, status, error, descriptor }
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [displayItems, statusLabel, streaming]);

  const autosize = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  useEffect(() => { autosize(textareaRef.current); }, [input]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? []);
    for (const file of files) {
      const id = `att${++attSeq}`;
      setAttachments((prev) => [...prev, { id, name: file.name, status: "parsing" }]);
      try {
        const { ingestFile } = await import("../lib/fileIngest");
        const desc = await ingestFile(file);
        setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "ready", kind: desc.kind, descriptor: desc } : a)));
        if (desc.kind === "artifact") openArtifact(desc.artifactId);
      } catch (e) {
        setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "error", error: e.message } : a)));
      }
    }
  }

  function onDrop(e) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  }

  const ready = attachments.filter((a) => a.status === "ready").map((a) => a.descriptor);
  const parsing = attachments.some((a) => a.status === "parsing");
  const canSend = (input.trim() || ready.length) && !parsing && !streaming;

  const submit = (text) => {
    const value = (text ?? input).trim();
    const atts = attachments.filter((a) => a.status === "ready").map((a) => a.descriptor);
    if ((!value && !atts.length) || streaming || parsing) return;
    setInput("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMessage(value, atts);
  };

  const showSuggestions = displayItems.filter((it) => it.kind === "user").length === 0 && !attachments.length;
  const maxWidth = compact ? "100%" : 880;
  const pad = compact ? "14px 16px" : "20px 24px";

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
      onDrop={onDrop}
    >
      <style>{`@keyframes fa-spin{to{transform:rotate(360deg)}} .fa-spin{animation:fa-spin 0.9s linear infinite}`}</style>

      {/* Drag-and-drop overlay */}
      {dragging && (
        <div style={{ position: "absolute", inset: 8, zIndex: 40, borderRadius: 4, border: `2px dashed ${COLORS.amber}`, background: "rgba(245,165,36,0.08)", backdropFilter: "blur(2px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
          <UploadCloud size={34} color={COLORS.amber} strokeWidth={1.4} />
          <div style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.text }}>Drop to add</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: COLORS.textDim, letterSpacing: 1 }}>SPREADSHEETS · PDF · IMAGES · DOCS</div>
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: pad }}>
        <div style={{ maxWidth, margin: "0 auto" }}>
          {displayItems.map((it) => {
            if (it.kind === "user") {
              return (
                <div key={it.id} style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                  <Avatar role="user" />
                  <div style={{ flex: 1, paddingTop: 4, minWidth: 0 }}>
                    {it.text && (
                      <div style={{ fontFamily: SANS, fontSize: 13.5, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{it.text}</div>
                    )}
                    {it.attachments?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: it.text ? 8 : 0 }}>
                        {it.attachments.map((a, i) => <FileChip key={i} name={a.name} kind={a.kind} status="ready" />)}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (it.kind === "assistant_text") {
              if (!it.text.trim()) return null;
              return (
                <div key={it.id} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <Avatar role="assistant" />
                  <div style={{ flex: 1, paddingTop: 3, minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.amber, letterSpacing: 1.5, marginBottom: 6 }}>FINANCE AI</div>
                    <MarkdownMessage text={it.text} />
                  </div>
                </div>
              );
            }
            if (it.kind === "tool") {
              return <div key={it.id} style={{ marginLeft: 38 }}><ToolChip label={it.label} isError={it.is_error} /></div>;
            }
            if (it.kind === "confirmation") {
              return <div key={it.id} style={{ marginLeft: 38 }}><ConfirmationCard item={it} onResolve={resolveConfirmation} disabled={streaming} /></div>;
            }
            if (it.kind === "notice") {
              return <div key={it.id} style={{ marginLeft: 38, marginBottom: 14, fontFamily: SANS, fontSize: 12.5, color: COLORS.down }}>{it.text}</div>;
            }
            return null;
          })}

          {streaming && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <Avatar role="assistant" />
              <div style={{ flex: 1, paddingTop: 5, minWidth: 0 }}><ThinkingIndicator label={statusLabel} /></div>
            </div>
          )}
        </div>
      </div>

      {showSuggestions && (
        <div style={{ padding: compact ? "0 16px 10px" : "0 24px 12px" }}>
          <div style={{ maxWidth, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                style={{ all: "unset", cursor: "pointer", padding: "7px 12px", fontFamily: SANS, fontSize: 11.5, color: COLORS.textDim, border: `1px solid ${COLORS.border}` }}
                onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.amber; e.currentTarget.style.borderColor = COLORS.amberDim; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textDim; e.currentTarget.style.borderColor = COLORS.border; }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: compact ? "12px 16px" : "14px 24px" }}>
        <div style={{ maxWidth, margin: "0 auto" }}>
          {/* Pending attachment chips */}
          {attachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {attachments.map((a) => (
                <FileChip
                  key={a.id}
                  name={a.status === "error" ? `${a.name} — ${a.error}` : a.name}
                  kind={a.kind}
                  status={a.status}
                  onRemove={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                />
              ))}
            </div>
          )}

          {/* Unified composer card: textarea on top, toolbar (attach + model
              selector, then send) along the bottom inside the same border. */}
          <div style={{ border: `1px solid ${focused ? COLORS.amberDim : COLORS.border}`, background: COLORS.panel, transition: "border-color 0.15s" }}>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />

            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Ask, instruct, attach a spreadsheet to edit…"
              style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", outline: "none", resize: "none", color: COLORS.text, fontFamily: SANS, fontSize: 13, lineHeight: 1.5, padding: "12px 14px 8px", maxHeight: 160, overflowY: "auto", display: "block" }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderTop: `1px solid ${COLORS.border}` }}>
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach files"
                style={{ all: "unset", cursor: "pointer", padding: "7px 8px", color: COLORS.textDim, display: "flex", alignItems: "center" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.amber)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
              >
                <Paperclip size={16} />
              </button>

              <ModelPicker compact />

              {streaming ? (
                <button onClick={abort} title="Stop" style={{ all: "unset", marginLeft: "auto", cursor: "pointer", padding: "8px 10px", border: `1px solid ${COLORS.borderHi}`, color: COLORS.text, display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, letterSpacing: 1 }}>
                  <Square size={10} fill={COLORS.text} /> STOP
                </button>
              ) : (
                <button
                  onClick={() => submit()}
                  disabled={!canSend}
                  title="Send"
                  style={{ all: "unset", marginLeft: "auto", cursor: canSend ? "pointer" : "not-allowed", padding: "8px 11px", background: canSend ? COLORS.amber : "transparent", color: canSend ? COLORS.bg : COLORS.textMute, border: `1px solid ${canSend ? COLORS.amber : COLORS.border}`, display: "flex", alignItems: "center" }}
                >
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
