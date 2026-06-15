import React, { useState } from "react";
import { Check, Pencil, SquarePen, Trash2, X } from "lucide-react";
import { COLORS, MONO, SANS } from "../lib/theme";
import { useChat } from "./ChatProvider";

/* ------------------------------------------------------------------
   Reusable conversation history list — shared by the slide-over panel
   and the full AI Analyst page. Select, rename, or delete past chats.
   ------------------------------------------------------------------ */

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatHistory({ onSelect }) {
  const {
    conversations,
    conversationId,
    loadConversation,
    renameConversation,
    deleteConversation,
    newChat,
    streaming,
  } = useChat();

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const startEdit = (c) => {
    setEditingId(c.id);
    setDraft(c.title ?? "");
    setConfirmId(null);
  };
  const commitEdit = () => {
    if (editingId) renameConversation(editingId, draft);
    setEditingId(null);
  };

  const select = (id) => {
    if (streaming) return;
    loadConversation(id);
    onSelect?.();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <button
        onClick={() => {
          newChat();
          onSelect?.();
        }}
        disabled={streaming}
        style={{ all: "unset", cursor: streaming ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", margin: "10px 12px 6px", border: `1px solid ${COLORS.amberDim}`, color: COLORS.amber, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2 }}
      >
        <SquarePen size={13} /> NEW CHAT
      </button>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px" }}>
        {!conversations.length && (
          <div style={{ padding: "18px 14px", color: COLORS.textDim, fontFamily: SANS, fontSize: 12.5 }}>
            No conversations yet.
          </div>
        )}

        {conversations.map((c) => {
          const isActive = c.id === conversationId;
          const isEditing = editingId === c.id;
          return (
            <div
              key={c.id}
              className="chat-history-row"
              style={{ position: "relative", padding: "9px 10px", marginBottom: 2, cursor: isEditing ? "default" : "pointer", background: isActive ? "rgba(245,165,36,0.07)" : "transparent", borderLeft: isActive ? `2px solid ${COLORS.amber}` : "2px solid transparent" }}
              onClick={() => !isEditing && select(c.id)}
              onMouseEnter={(e) => { if (!isActive && !isEditing) e.currentTarget.style.background = COLORS.panelHi; }}
              onMouseLeave={(e) => { if (!isActive && !isEditing) e.currentTarget.style.background = "transparent"; }}
            >
              {isEditing ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{ flex: 1, minWidth: 0, background: COLORS.bg, border: `1px solid ${COLORS.amberDim}`, color: COLORS.text, fontFamily: SANS, fontSize: 12.5, padding: "5px 7px", outline: "none" }}
                  />
                  <IconBtn title="Save" onClick={commitEdit}><Check size={13} /></IconBtn>
                  <IconBtn title="Cancel" onClick={() => setEditingId(null)}><X size={13} /></IconBtn>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 12.5, color: isActive ? COLORS.amber : COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.title || "Untitled"}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 0.5, marginTop: 3 }}>
                      {relativeTime(c.updated_at)}
                    </div>
                  </div>
                  <div className="chat-history-actions" style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {confirmId === c.id ? (
                      <>
                        <IconBtn title="Confirm delete" danger onClick={() => { deleteConversation(c.id); setConfirmId(null); }}><Check size={13} /></IconBtn>
                        <IconBtn title="Cancel" onClick={() => setConfirmId(null)}><X size={13} /></IconBtn>
                      </>
                    ) : (
                      <>
                        <IconBtn title="Rename" onClick={() => startEdit(c)}><Pencil size={12} /></IconBtn>
                        <IconBtn title="Delete" danger onClick={() => setConfirmId(c.id)}><Trash2 size={12} /></IconBtn>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{ all: "unset", cursor: "pointer", padding: 5, color: COLORS.textMute, display: "flex", alignItems: "center" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = danger ? COLORS.down : COLORS.amber)}
      onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textMute)}
    >
      {children}
    </button>
  );
}
