import React from "react";
import { Bot, SquarePen } from "lucide-react";
import { COLORS, MONO, SERIF } from "../lib/theme";
import { useChat } from "../ai/ChatProvider";
import ChatThread from "../ai/ChatThread";

/* ------------------------------------------------------------------
   AI ANALYST — full-page chat. Shares conversation state with the
   global slide-over panel through ChatProvider.
   ------------------------------------------------------------------ */

const SUGGESTIONS = [
  "Analyze my portfolio's concentration and biggest risks",
  "I just bought a stock — help me log it",
  "Review my last 20 trades and grade each decision",
  "Which of my sells did I mistime? Show the what-if",
  "What patterns do you see in my losing trades?",
  "What should I trim or add right now? Check the latest news first.",
];

export default function AIAnalyst() {
  const { conversations, conversationId, loadConversation, newChat, streaming } = useChat();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bot size={18} color={COLORS.amber} strokeWidth={1.5} />
          <div style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.text }}>AI Analyst</div>
          <div style={{ fontFamily: MONO, fontSize: 9, padding: "3px 8px", border: `1px solid ${COLORS.amberDim}`, color: COLORS.amber, letterSpacing: 1.5, marginLeft: 8 }}>
            CLAUDE OPUS · FULL PORTFOLIO CONTROL
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {conversations.length > 0 && (
            <select
              value={conversationId ?? ""}
              disabled={streaming}
              onChange={(e) => e.target.value && loadConversation(e.target.value)}
              style={{
                background: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.textDim,
                fontFamily: MONO,
                fontSize: 10,
                padding: "6px 8px",
                letterSpacing: 0.5,
                outline: "none",
                maxWidth: 260,
              }}
            >
              <option value="">— history —</option>
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ?? "Untitled"}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={newChat}
            disabled={streaming}
            style={{ all: "unset", cursor: streaming ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", border: `1px solid ${COLORS.border}`, color: COLORS.textDim, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.amber)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
          >
            <SquarePen size={12} /> NEW CHAT
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatThread suggestions={SUGGESTIONS} />
      </div>
    </div>
  );
}
