import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { COLORS, MONO } from "../lib/theme";
import { useChat } from "./ChatProvider";

/* ------------------------------------------------------------------
   Model selector. AUTO is a toggle: when on, the backend routes to the
   cheapest capable Claude tier and only the AUTO button shows. Toggle
   it off to reveal the explicit model dropdown. Claude models can edit
   the portfolio; OpenAI / DeepSeek / Gemini are read-only (dispatched
   to a different edge function in streamClient). The menu opens upward
   — it lives at the bottom of the composer.
   ------------------------------------------------------------------ */

const MODEL_GROUPS = [
  {
    label: "Claude — can edit",
    options: [
      ["claude-opus-4-8", "Claude Opus 4.8"],
      ["claude-sonnet-4-6", "Claude Sonnet 4.6"],
      ["claude-haiku-4-5", "Claude Haiku 4.5"],
      ["claude-fable-5", "Claude Fable 5"],
    ],
  },
  {
    label: "OpenAI — read-only",
    options: [
      ["openai:gpt-4o", "GPT-4o"],
      ["openai:gpt-4o-mini", "GPT-4o mini"],
    ],
  },
  {
    label: "DeepSeek — read-only",
    options: [
      ["deepseek:deepseek-v4-pro", "DeepSeek V4 Pro"],
      ["deepseek:deepseek-v4-flash", "DeepSeek V4 Flash"],
    ],
  },
  {
    label: "Gemini — read-only",
    options: [
      ["gemini:gemini-2.5-pro", "Gemini 2.5 Pro"],
      ["gemini:gemini-2.5-flash", "Gemini 2.5 Flash"],
    ],
  },
];

const DEFAULT_MODEL = "claude-opus-4-8";
export const canEdit = (m) => m === "auto" || m.startsWith("claude-");
const labelFor = (v) => {
  for (const g of MODEL_GROUPS) for (const [val, t] of g.options) if (val === v) return t;
  return v;
};

export default function ModelPicker({ compact = false }) {
  const { model, setModel, streaming } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isAuto = model === "auto";

  // Remember the last explicitly-picked model so toggling Auto off restores it.
  const lastConcrete = useRef(isAuto ? DEFAULT_MODEL : model);
  useEffect(() => { if (model !== "auto") lastConcrete.current = model; }, [model]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const readOnly = !isAuto && !canEdit(model);
  const fs = compact ? 10 : 10.5;

  const toggleAuto = () => {
    if (streaming) return;
    if (isAuto) { setModel(lastConcrete.current || DEFAULT_MODEL); setOpen(true); }
    else { setModel("auto"); setOpen(false); }
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}>
      {/* AUTO toggle */}
      <button
        type="button"
        disabled={streaming}
        onClick={toggleAuto}
        title={isAuto ? "Auto routing is on — click to pick a specific model" : "Turn on auto routing"}
        style={{
          all: "unset",
          cursor: streaming ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 9px",
          border: `1px solid ${isAuto ? COLORS.amberDim : "transparent"}`,
          background: isAuto ? COLORS.panelHi : "transparent",
          color: isAuto ? COLORS.amber : COLORS.textDim,
          fontFamily: MONO,
          fontSize: fs,
          letterSpacing: 1,
          opacity: streaming ? 0.55 : 1,
        }}
        onMouseEnter={(e) => { if (!streaming && !isAuto) e.currentTarget.style.color = COLORS.amber; }}
        onMouseLeave={(e) => { if (!isAuto) e.currentTarget.style.color = COLORS.textDim; }}
      >
        <Sparkles size={12} /> AUTO
      </button>

      {/* Explicit model dropdown — only when Auto is off */}
      {!isAuto && (
        <>
          {readOnly && (
            <span style={{ fontFamily: MONO, fontSize: 8.5, color: COLORS.textMute, letterSpacing: 0.5 }}>READ-ONLY</span>
          )}
          <button
            type="button"
            disabled={streaming}
            onClick={() => setOpen((o) => !o)}
            title="Choose model"
            onMouseEnter={(e) => { if (!streaming) e.currentTarget.style.color = COLORS.amber; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = open ? COLORS.amber : COLORS.textDim; }}
            style={{
              all: "unset",
              cursor: streaming ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 6px",
              color: open ? COLORS.amber : COLORS.textDim,
              fontFamily: MONO,
              fontSize: fs,
              letterSpacing: 0.5,
              opacity: streaming ? 0.55 : 1,
            }}
          >
            {labelFor(model)}
            <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        </>
      )}

      {open && !isAuto && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 80,
            minWidth: 240,
            maxHeight: 360,
            overflowY: "auto",
            background: COLORS.bg,
            border: `1px solid ${COLORS.borderHi}`,
            boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
            padding: "6px 0",
          }}
        >
          {MODEL_GROUPS.map((g) => (
            <div key={g.label}>
              <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 1, color: COLORS.textMute, padding: "9px 12px 4px", textTransform: "uppercase" }}>
                {g.label}
              </div>
              {g.options.map(([v, t]) => {
                const active = v === model;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setModel(v); setOpen(false); }}
                    style={{
                      all: "unset",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      width: "100%",
                      boxSizing: "border-box",
                      cursor: "pointer",
                      padding: "7px 12px",
                      fontFamily: MONO,
                      fontSize: 11,
                      color: active ? COLORS.amber : COLORS.text,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.panelHi)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span>{t}</span>
                    {active && <span style={{ color: COLORS.amber }}>✓</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
