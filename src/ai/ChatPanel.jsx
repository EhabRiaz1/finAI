import React, { useState } from "react";
import { Bot, History, Maximize2, SquarePen, X } from "lucide-react";
import { COLORS, MONO, SERIF } from "../lib/theme";
import { useChat } from "./ChatProvider";
import ChatThread from "./ChatThread";
import ChatHistory from "./ChatHistory";

/* ------------------------------------------------------------------
   Global slide-over chat panel — the AI is reachable from every page
   (TopBar button or ⌘J). Shares conversation state with the full
   AI Analyst page via ChatProvider.
   ------------------------------------------------------------------ */

export default function ChatPanel({ onOpenFullPage }) {
  const { panelOpen, setPanelOpen, newChat } = useChat();
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        maxWidth: "92vw",
        zIndex: 60,
        background: COLORS.bg,
        borderLeft: `1px solid ${COLORS.borderHi}`,
        boxShadow: panelOpen ? "-24px 0 60px rgba(0,0,0,0.55)" : "none",
        transform: panelOpen ? "translateX(0)" : "translateX(102%)",
        transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        <Bot size={15} color={COLORS.amber} strokeWidth={1.5} />
        <div style={{ fontFamily: SERIF, fontSize: 17, color: COLORS.text }}>Finance AI</div>
        <div style={{ fontFamily: MONO, fontSize: 8.5, padding: "2px 6px", border: `1px solid ${COLORS.amberDim}`, color: COLORS.amber, letterSpacing: 1.2 }}>
          ⌘J
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <IconButton
            title={showHistory ? "Back to chat" : "History"}
            onClick={() => setShowHistory((v) => !v)}
            active={showHistory}
          >
            <History size={14} />
          </IconButton>
          <IconButton title="New chat" onClick={() => { newChat(); setShowHistory(false); }}>
            <SquarePen size={14} />
          </IconButton>
          <IconButton
            title="Open full page"
            onClick={() => {
              setPanelOpen(false);
              onOpenFullPage?.();
            }}
          >
            <Maximize2 size={14} />
          </IconButton>
          <IconButton title="Close" onClick={() => setPanelOpen(false)}>
            <X size={15} />
          </IconButton>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {showHistory ? (
          <ChatHistory onSelect={() => setShowHistory(false)} />
        ) : (
          <ChatThread compact />
        )}
      </div>
    </div>
  );
}

function IconButton({ children, onClick, title, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ all: "unset", cursor: "pointer", padding: 6, color: active ? COLORS.amber : COLORS.textDim, display: "flex", alignItems: "center" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.amber)}
      onMouseLeave={(e) => (e.currentTarget.style.color = active ? COLORS.amber : COLORS.textDim)}
    >
      {children}
    </button>
  );
}
