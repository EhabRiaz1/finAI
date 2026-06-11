import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { COLORS, fmtMoney, fmtPct, MONO } from "../lib/theme";
import { PanelHeader } from "./ui";

export default function WatchlistCard({ items, quotesByTicker, onAdd, onRemove, onSelect }) {
  const [adding, setAdding] = useState(false);
  const [symbol, setSymbol] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!symbol.trim()) return;
    try {
      await onAdd(symbol);
      setSymbol("");
      setAdding(false);
    } catch (_e) {
      /* ignore */
    }
  }

  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column" }}>
      <PanelHeader
        title="Watchlist"
        right={
          <button onClick={() => setAdding((v) => !v)} style={{ all: "unset", cursor: "pointer", color: COLORS.amber, display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10 }}>
            <Plus size={12} /> ADD
          </button>
        }
      />
      {adding && (
        <form onSubmit={submit} style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
          <input
            autoFocus
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="TICKER"
            style={{ flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.borderHi}`, color: COLORS.text, fontFamily: MONO, fontSize: 12, padding: "6px 8px", outline: "none" }}
          />
          <button type="submit" style={{ all: "unset", cursor: "pointer", color: COLORS.amber, border: `1px solid ${COLORS.amberDim}`, padding: "4px 10px", fontFamily: MONO, fontSize: 10 }}>ADD</button>
        </form>
      )}
      <div style={{ overflowY: "auto", maxHeight: 320 }}>
        {!items.length && (
          <div style={{ padding: 16, color: COLORS.textDim, fontSize: 12 }}>No symbols yet. Add tickers to track.</div>
        )}
        {items.map((it) => {
          const q = quotesByTicker.get(it.symbol);
          const chg = q && q.prev ? ((q.price - q.prev) / q.prev) * 100 : 0;
          const up = chg >= 0;
          return (
            <div
              key={it.id}
              style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center", padding: "9px 12px", borderTop: `1px solid ${COLORS.border}`, fontFamily: MONO, fontSize: 12 }}
            >
              <span onClick={() => onSelect?.(it.symbol)} style={{ color: COLORS.text, cursor: "pointer" }}>{it.symbol}</span>
              <span style={{ color: COLORS.textDim, textAlign: "right" }}>{q ? fmtMoney(q.price) : "—"}</span>
              <span style={{ color: up ? COLORS.up : COLORS.down, textAlign: "right", minWidth: 64 }}>{q ? fmtPct(chg) : "—"}</span>
              <button onClick={() => onRemove(it.id)} style={{ all: "unset", cursor: "pointer", color: COLORS.textMute, display: "flex" }}>
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
