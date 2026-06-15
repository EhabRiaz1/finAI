import React, { useState } from "react";
import { X } from "lucide-react";
import { COLORS, MONO, SANS, SERIF } from "../lib/theme";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: COLORS.bg,
  border: `1px solid ${COLORS.borderHi}`,
  color: COLORS.text,
  fontFamily: MONO,
  fontSize: 12,
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontFamily: MONO,
  fontSize: 9,
  color: COLORS.textDim,
  letterSpacing: 1.2,
  marginBottom: 6,
  textTransform: "uppercase",
};

/**
 * Manual position entry. Records the position you took at your broker:
 * adds/updates the holding and (optionally) logs a transaction.
 */
export default function AddPositionModal({ onClose, onSubmit, initial }) {
  const [ticker, setTicker] = useState(initial?.ticker ?? "");
  const [shares, setShares] = useState(initial?.shares ?? "");
  const [costPerShare, setCostPerShare] = useState(initial?.cost_per_share ?? "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchase_date ?? "");
  const [side, setSide] = useState("buy");
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [logTxn, setLogTxn] = useState(!initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!ticker.trim() || !shares || !costPerShare) {
      setError("Ticker, shares and price are required.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        ticker: ticker.trim().toUpperCase(),
        shares: Number(shares),
        costPerShare: Number(costPerShare),
        purchaseDate: purchaseDate || null,
        notes: notes || null,
        logTransaction: logTxn,
        side,
        commission: commission ? Number(commission) : 0,
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
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: COLORS.panel, border: `1px solid ${COLORS.borderHi}`, width: 440, maxWidth: "92vw", padding: 24, maxHeight: "92vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.text }}>
            {initial ? "Edit Position" : "Add Position"}
          </div>
          <button type="button" onClick={onClose} style={{ all: "unset", cursor: "pointer", color: COLORS.textDim }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: COLORS.textDim, marginBottom: 18 }}>
          Declare a position you took at your broker.
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
              <label style={labelStyle}>Avg Cost / Share</label>
              <input style={inputStyle} type="number" min="0" step="any" value={costPerShare} onChange={(e) => setCostPerShare(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Trade Date (optional)</label>
              <input style={inputStyle} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Commission</label>
              <input style={inputStyle} type="number" min="0" step="any" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Notes (optional)</label>
            <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {!initial && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontFamily: SANS, fontSize: 12, color: COLORS.textDim, cursor: "pointer" }}>
              <input type="checkbox" checked={logTxn} onChange={(e) => setLogTxn(e.target.checked)} />
              Also log this as a
              <select value={side} onChange={(e) => setSide(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "4px 8px" }}>
                <option value="buy">BUY</option>
                <option value="sell">SELL</option>
              </select>
              transaction
            </label>
          )}

          {error && <div style={{ color: COLORS.down, fontSize: 12, marginBottom: 12, fontFamily: SANS }}>{error}</div>}

          <button
            type="submit"
            disabled={saving}
            style={{ all: "unset", cursor: saving ? "wait" : "pointer", width: "100%", textAlign: "center", boxSizing: "border-box", padding: "11px 0", border: `1px solid ${COLORS.amber}`, color: COLORS.amber, fontFamily: MONO, fontSize: 11, letterSpacing: 1.2 }}
          >
            {saving ? "SAVING…" : initial ? "UPDATE POSITION" : "ADD POSITION"}
          </button>
        </form>
      </div>
    </div>
  );
}
