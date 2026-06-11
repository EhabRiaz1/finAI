import React, { useState } from "react";
import { X } from "lucide-react";

const COLORS = {
  bg: "#000000",
  panel: "#0a0a0a",
  border: "#1a1a1a",
  borderHi: "#262626",
  text: "#e5e5e5",
  textDim: "#737373",
  amber: "#f5a524",
  down: "#ef4444",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: COLORS.bg,
  border: `1px solid ${COLORS.borderHi}`,
  color: COLORS.text,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 9,
  color: COLORS.textDim,
  letterSpacing: 1.2,
  marginBottom: 6,
  textTransform: "uppercase",
};

export default function AddEquityForm({ onSave, onClose, initial }) {
  const [ticker, setTicker] = useState(initial?.ticker ?? "");
  const [shares, setShares] = useState(initial?.shares ?? "");
  const [costPerShare, setCostPerShare] = useState(initial?.cost_per_share ?? "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchase_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!ticker.trim() || !shares || !costPerShare) {
      setError("Ticker, shares, and cost per share are required.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ticker: ticker.trim().toUpperCase(),
        shares: Number(shares),
        costPerShare: Number(costPerShare),
        purchaseDate: purchaseDate || null,
        notes: notes || null,
      });
      onClose();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.borderHi}`,
          width: 420,
          maxWidth: "92vw",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, color: COLORS.text }}>
            {initial ? "Edit Equity Position" : "Add Equity Position"}
          </div>
          <button type="button" onClick={onClose} style={{ all: "unset", cursor: "pointer", color: COLORS.textDim }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Ticker</label>
            <input style={inputStyle} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Shares</label>
              <input style={inputStyle} type="number" min="0" step="any" value={shares} onChange={(e) => setShares(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Cost / Share</label>
              <input style={inputStyle} type="number" min="0" step="any" value={costPerShare} onChange={(e) => setCostPerShare(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Purchase Date (optional)</label>
            <input style={inputStyle} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Notes (optional)</label>
            <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && (
            <div style={{ color: COLORS.down, fontSize: 12, marginBottom: 12, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            style={{
              all: "unset",
              cursor: saving ? "wait" : "pointer",
              width: "100%",
              textAlign: "center",
              padding: "10px 0",
              border: `1px solid ${COLORS.amber}`,
              color: COLORS.amber,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: 1.2,
            }}
          >
            {saving ? "SAVING…" : initial ? "UPDATE POSITION" : "ADD POSITION"}
          </button>
        </form>
      </div>
    </div>
  );
}
