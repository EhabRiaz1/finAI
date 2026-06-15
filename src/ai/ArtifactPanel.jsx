import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, RotateCcw, Sparkles, X } from "lucide-react";
import { COLORS, MONO, SANS, SERIF } from "../lib/theme";
import { colLetter, MAX_RENDER_ROWS, sheetWidth } from "../lib/grid";
import { useChat } from "./ChatProvider";

/* ------------------------------------------------------------------
   ArtifactPanel — polished editable spreadsheet grid. Click a cell to
   edit (commits immediately); the AI's proposed edits arrive as amber
   STAGED previews the user keeps (Apply) or reverts (Discard).
   ------------------------------------------------------------------ */

const COL_W = 116;
const GUTTER_W = 46;
const ROW_H = 30;

export default function ArtifactPanel() {
  const {
    activeArtifact, stagedEdits, closeArtifact, setActiveSheet,
    updateArtifactCell, applyStagedEdits, discardStagedEdits,
  } = useChat();

  const [editing, setEditing] = useState(null); // { r, c }
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setEditing(null); }, [activeArtifact?.id]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const sheetIdx = activeArtifact?.data?.activeSheet ?? 0;
  const sheet = activeArtifact?.data?.sheets?.[sheetIdx];

  const width = sheet ? sheetWidth(sheet) : 0;
  const allRows = sheet?.rows ?? [];
  const truncated = allRows.length > MAX_RENDER_ROWS;
  const rows = truncated ? allRows.slice(0, MAX_RENDER_ROWS) : allRows;

  // Staged edits for the visible sheet, keyed "r:c".
  const staged = useMemo(() => {
    const m = new Map();
    for (const e of stagedEdits.values()) if (e.sheet === sheetIdx) m.set(`${e.row}:${e.col}`, e);
    return m;
  }, [stagedEdits, sheetIdx]);
  const stagedCount = stagedEdits.size;

  if (!activeArtifact) return null;

  function startEdit(r, c) {
    const cur = staged.get(`${r}:${c}`)?.value ?? allRows[r]?.[c] ?? "";
    setDraft(cur === null ? "" : String(cur));
    setEditing({ r, c });
  }
  function commitEdit() {
    if (editing) updateArtifactCell(sheetIdx, editing.r, editing.c, draft);
    setEditing(null);
  }

  async function downloadXlsx() {
    const { exportXlsx } = await import("../lib/spreadsheet");
    exportXlsx(activeArtifact.data, activeArtifact.name);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: COLORS.bg, borderLeft: `1px solid ${COLORS.borderHi}` }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <FileSpreadsheet size={15} color={COLORS.amber} strokeWidth={1.6} />
        <div style={{ fontFamily: SERIF, fontSize: 16, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
          {activeArtifact.name || "Spreadsheet"}
        </div>
        <IconBtn title="Download .xlsx" onClick={downloadXlsx}><Download size={14} /></IconBtn>
        <IconBtn title="Close" onClick={closeArtifact}><X size={15} /></IconBtn>
      </div>

      {/* Sheet tabs */}
      {activeArtifact.data.sheets.length > 1 && (
        <div style={{ display: "flex", gap: 4, padding: "6px 10px", borderBottom: `1px solid ${COLORS.border}`, overflowX: "auto", flexShrink: 0 }}>
          {activeArtifact.data.sheets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              style={{ all: "unset", cursor: "pointer", padding: "4px 10px", fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, whiteSpace: "nowrap", color: i === sheetIdx ? COLORS.amber : COLORS.textDim, borderBottom: `2px solid ${i === sheetIdx ? COLORS.amber : "transparent"}` }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontFamily: MONO, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...corner }}> </th>
              {Array.from({ length: width }, (_, c) => (
                <th key={c} style={{ ...colHead, width: COL_W, minWidth: COL_W }}>{colLetter(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <td style={{ ...gutter }}>{r + 1}</td>
                {Array.from({ length: width }, (_, c) => {
                  const st = staged.get(`${r}:${c}`);
                  const raw = st ? st.value : row[c];
                  const isEditing = editing && editing.r === r && editing.c === c;
                  const isNum = typeof raw === "number";
                  return (
                    <td
                      key={c}
                      onClick={() => !isEditing && startEdit(r, c)}
                      title={st ? `AI staged: ${st.old ?? "(empty)"} → ${st.value ?? "(empty)"}` : undefined}
                      style={{
                        width: COL_W, minWidth: COL_W, height: ROW_H, maxWidth: COL_W,
                        padding: isEditing ? 0 : "0 8px",
                        borderRight: `1px solid ${COLORS.border}`,
                        borderBottom: `1px solid ${COLORS.border}`,
                        background: st ? "rgba(245,165,36,0.16)" : r % 2 ? "transparent" : "rgba(255,255,255,0.012)",
                        color: st ? COLORS.amber : COLORS.text,
                        textAlign: isNum ? "right" : "left",
                        cursor: "cell",
                        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                        boxShadow: st ? `inset 0 0 0 1px ${COLORS.amberDim}` : "none",
                      }}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                            if (e.key === "Escape") setEditing(null);
                          }}
                          style={{ width: "100%", height: ROW_H, boxSizing: "border-box", padding: "0 8px", background: COLORS.panelHi, border: `1px solid ${COLORS.amber}`, color: COLORS.text, fontFamily: MONO, fontSize: 12, outline: "none" }}
                        />
                      ) : (
                        raw === null || raw === undefined ? "" : String(raw)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {truncated && (
          <div style={{ padding: "10px 14px", fontFamily: MONO, fontSize: 10, color: COLORS.textMute, letterSpacing: 0.5 }}>
            Showing first {MAX_RENDER_ROWS.toLocaleString()} of {allRows.length.toLocaleString()} rows.
          </div>
        )}
      </div>

      {/* Staged-edit Apply/Discard bar */}
      {stagedCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: `1px solid ${COLORS.amberDim}`, background: "rgba(245,165,36,0.06)", flexShrink: 0 }}>
          <Sparkles size={14} color={COLORS.amber} />
          <div style={{ flex: 1, fontFamily: SANS, fontSize: 12.5, color: COLORS.text }}>
            Finance AI proposed <span style={{ color: COLORS.amber, fontFamily: MONO }}>{stagedCount}</span> change{stagedCount === 1 ? "" : "s"}.
          </div>
          <button onClick={discardStagedEdits} style={barBtn(false)}>
            <RotateCcw size={12} /> DISCARD
          </button>
          <button onClick={applyStagedEdits} style={barBtn(true)}>
            <Check size={12} /> APPLY
          </button>
        </div>
      )}
    </div>
  );
}

const colHead = {
  position: "sticky", top: 0, zIndex: 2,
  height: ROW_H, padding: "0 8px", textAlign: "center",
  background: COLORS.panel, color: COLORS.textMute,
  fontFamily: MONO, fontSize: 9, letterSpacing: 1,
  borderRight: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.borderHi}`,
};
const corner = {
  position: "sticky", top: 0, left: 0, zIndex: 3,
  width: GUTTER_W, minWidth: GUTTER_W, height: ROW_H,
  background: COLORS.panel, borderRight: `1px solid ${COLORS.borderHi}`, borderBottom: `1px solid ${COLORS.borderHi}`,
};
const gutter = {
  position: "sticky", left: 0, zIndex: 1,
  width: GUTTER_W, minWidth: GUTTER_W, height: ROW_H, textAlign: "center",
  background: COLORS.panel, color: COLORS.textMute,
  fontFamily: MONO, fontSize: 9,
  borderRight: `1px solid ${COLORS.borderHi}`, borderBottom: `1px solid ${COLORS.border}`,
};

function barBtn(primary) {
  return {
    all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: 1,
    color: primary ? COLORS.bg : COLORS.textDim,
    background: primary ? COLORS.amber : "transparent",
    border: `1px solid ${primary ? COLORS.amber : COLORS.border}`,
  };
}

function IconBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ all: "unset", cursor: "pointer", padding: 6, color: COLORS.textDim, display: "flex", alignItems: "center" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.amber)}
      onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
    >
      {children}
    </button>
  );
}
