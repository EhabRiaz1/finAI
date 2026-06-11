import React, { useEffect, useRef, useState } from "react";
import { Bot, Send, Square, Wrench } from "lucide-react";
import { COLORS, MONO, SANS, SERIF } from "../lib/theme";
import { useChat } from "./ChatProvider";
import MarkdownMessage from "./MarkdownMessage";
import ConfirmationCard from "./ConfirmationCard";
import ThinkingIndicator from "./ThinkingIndicator";

/* ------------------------------------------------------------------
   Shared chat transcript + composer, used by both the full AI Analyst
   page and the global slide-over panel (single conversation state).
   ------------------------------------------------------------------ */

const DEFAULT_SUGGESTIONS = [
  "Analyze my portfolio's concentration and biggest risks",
  "I just bought a stock — help me log it",
  "Review my trading decisions and grade each one",
  "What should I trim or add right now? Check the latest news first.",
];

function Avatar({ role }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 4,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isUser ? COLORS.panelHi : "transparent",
        border: `1px solid ${isUser ? COLORS.borderHi : COLORS.amberDim}`,
        color: isUser ? COLORS.text : COLORS.amber,
        fontFamily: isUser ? SERIF : "inherit",
        fontSize: 13,
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
      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, color: isError ? COLORS.down : COLORS.textMute }}>
        {label}
      </span>
    </div>
  );
}

export default function ChatThread({ suggestions = DEFAULT_SUGGESTIONS, compact = false }) {
  const { displayItems, streaming, statusLabel, sendMessage, resolveConfirmation, abort } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [displayItems, statusLabel, streaming]);

  const submit = (text) => {
    const value = (text ?? input).trim();
    if (!value || streaming) return;
    setInput("");
    sendMessage(value);
  };

  const showSuggestions = displayItems.filter((it) => it.kind === "user").length === 0;
  const maxWidth = compact ? "100%" : 880;
  const pad = compact ? "14px 16px" : "20px 24px";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: pad }}>
        <div style={{ maxWidth, margin: "0 auto" }}>
          {displayItems.map((it) => {
            if (it.kind === "user") {
              return (
                <div key={it.id} style={{ display: "flex", gap: 12, marginBottom: 18 }}>
                  <Avatar role="user" />
                  <div style={{ flex: 1, paddingTop: 4, fontFamily: SANS, fontSize: 13.5, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {it.text}
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
                    <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.amber, letterSpacing: 1.5, marginBottom: 6 }}>
                      FINANCE AI
                    </div>
                    <MarkdownMessage text={it.text} />
                  </div>
                </div>
              );
            }
            if (it.kind === "tool") {
              return (
                <div key={it.id} style={{ marginLeft: 38 }}>
                  <ToolChip label={it.label} isError={it.is_error} />
                </div>
              );
            }
            if (it.kind === "confirmation") {
              return (
                <div key={it.id} style={{ marginLeft: 38 }}>
                  <ConfirmationCard item={it} onResolve={resolveConfirmation} disabled={streaming} />
                </div>
              );
            }
            if (it.kind === "notice") {
              return (
                <div key={it.id} style={{ marginLeft: 38, marginBottom: 14, fontFamily: SANS, fontSize: 12.5, color: COLORS.down }}>
                  {it.text}
                </div>
              );
            }
            return null;
          })}

          {streaming && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <Avatar role="assistant" />
              <div style={{ flex: 1, paddingTop: 5, minWidth: 0 }}>
                <ThinkingIndicator label={statusLabel} />
              </div>
            </div>
          )}
        </div>
      </div>

      {showSuggestions && (
        <div style={{ padding: compact ? "0 16px 10px" : "0 24px 12px" }}>
          <div style={{ maxWidth, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                style={{ all: "unset", cursor: "pointer", padding: "7px 12px", fontFamily: SANS, fontSize: 11.5, color: COLORS.textDim, border: `1px solid ${COLORS.border}` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = COLORS.amber;
                  e.currentTarget.style.borderColor = COLORS.amberDim;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = COLORS.textDim;
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: compact ? "12px 16px" : "14px 24px" }}>
        <div style={{ maxWidth, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask, instruct, or report a trade — I can edit your portfolio…"
            style={{ flex: 1, minWidth: 0, background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "11px 13px", color: COLORS.text, fontFamily: SANS, fontSize: 13, outline: "none" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.amberDim)}
            onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
          />
          {streaming ? (
            <button
              onClick={abort}
              title="Stop"
              style={{ all: "unset", cursor: "pointer", padding: "11px 14px", border: `1px solid ${COLORS.borderHi}`, color: COLORS.text, display: "flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 10.5, letterSpacing: 1 }}
            >
              <Square size={10} fill={COLORS.text} /> STOP
            </button>
          ) : (
            <button
              onClick={() => submit()}
              disabled={!input.trim()}
              style={{
                all: "unset",
                cursor: input.trim() ? "pointer" : "not-allowed",
                padding: "11px 16px",
                background: input.trim() ? COLORS.amber : "transparent",
                color: input.trim() ? COLORS.bg : COLORS.textMute,
                border: `1px solid ${input.trim() ? COLORS.amber : COLORS.border}`,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.2,
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              SEND <Send size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
