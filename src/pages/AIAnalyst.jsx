import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bot, History, SquarePen } from "lucide-react";
import { COLORS, MONO, SERIF } from "../lib/theme";
import { useChat } from "../ai/ChatProvider";
import ChatThread from "../ai/ChatThread";
import ChatHistory from "../ai/ChatHistory";
import ArtifactPanel from "../ai/ArtifactPanel";

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
  const { newChat, streaming, activeArtifact } = useChat();
  const [showHistory, setShowHistory] = useState(false);
  const [artifactWidth, setArtifactWidth] = useState(560);
  const bodyRef = useRef(null);
  const dragRef = useRef(false);

  // Draggable splitter between chat and the artifact panel.
  const onSplitMove = useCallback((e) => {
    if (!dragRef.current || !bodyRef.current) return;
    const rect = bodyRef.current.getBoundingClientRect();
    const w = rect.right - e.clientX;
    setArtifactWidth(Math.max(360, Math.min(w, rect.width - 380)));
  }, []);
  useEffect(() => {
    const up = () => { dragRef.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onSplitMove);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", onSplitMove); window.removeEventListener("mouseup", up); };
  }, [onSplitMove]);

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
          <button
            onClick={() => setShowHistory((v) => !v)}
            style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", border: `1px solid ${showHistory ? COLORS.amberDim : COLORS.border}`, color: showHistory ? COLORS.amber : COLORS.textDim, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.amber)}
            onMouseLeave={(e) => (e.currentTarget.style.color = showHistory ? COLORS.amber : COLORS.textDim)}
          >
            <History size={12} /> HISTORY
          </button>
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

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {showHistory && (
          <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${COLORS.border}`, minHeight: 0 }}>
            <ChatHistory onSelect={() => setShowHistory(false)} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <ChatThread suggestions={SUGGESTIONS} />
        </div>
        {activeArtifact && (
          <>
            <div
              onMouseDown={() => { dragRef.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
              style={{ width: 5, flexShrink: 0, cursor: "col-resize", background: COLORS.border }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.amberDim)}
              onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.border)}
              title="Drag to resize"
            />
            <div style={{ width: artifactWidth, flexShrink: 0, minHeight: 0 }}>
              <ArtifactPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
