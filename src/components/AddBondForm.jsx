import React, { useState } from "react";
import { X } from "lucide-react";

const COLORS = {
  bg: "#000000",
  panel: "#0a0a0a",
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

export default function AddBondForm({ onSave, onClose, initial }) {
  const [bondType, setBondType] = useState(initial?.bond_type ?? "sovereign");
  const [identifier, setIdentifier] = useState(initial?.identifier ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [faceValue, setFaceValue] = useState(initial?.face_value ?? "1000");
  const [quantity, setQuantity] = useState(initial?.quantity ?? "1");
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchase_price ?? "");
  const [purchaseYield, setPurchaseYield] = useState(initial?.purchase_yield ?? "");
  const [couponRate, setCouponRate] = useState(initial?.coupon_rate ?? "");
  const [maturityDate, setMaturityDate] = useState(initial?.maturity_date ?? "");
  const [rating, setRating] = useState(initial?.rating ?? "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchase_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !faceValue || !quantity) {
      setError("Identifier, face value, and quantity are required.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        bondType,
        identifier: identifier.trim(),
        name: name || null,
        faceValue: Number(faceValue),
        quantity: Number(quantity),
        purchasePrice: purchasePrice ? Number(purchasePrice) : null,
        purchaseYield: purchaseYield ? Number(purchaseYield) : null,
        couponRate: couponRate ? Number(couponRate) : null,
        maturityDate: maturityDate || null,
        rating: rating || null,
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
          width: 480,
          maxWidth: "92vw",
          padding: 24,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, color: COLORS.text }}>
            {initial ? "Edit Bond Position" : "Add Bond Position"}
          </div>
          <button type="button" onClick={onClose} style={{ all: "unset", cursor: "pointer", color: COLORS.textDim }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Bond Type</label>
            <select
              style={inputStyle}
              value={bondType}
              onChange={(e) => setBondType(e.target.value)}
            >
              <option value="sovereign">Sovereign</option>
              <option value="government">Government</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Identifier / CUSIP</label>
            <input style={inputStyle} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="US 10Y or CUSIP" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name (optional)</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Apple 3.85% 2043" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Face Value</label>
              <input style={inputStyle} type="number" min="0" step="any" value={faceValue} onChange={(e) => setFaceValue(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Quantity</label>
              <input style={inputStyle} type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Purchase Price</label>
              <input style={inputStyle} type="number" min="0" step="any" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Purchase Yield %</label>
              <input style={inputStyle} type="number" min="0" step="any" value={purchaseYield} onChange={(e) => setPurchaseYield(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Coupon Rate %</label>
              <input style={inputStyle} type="number" min="0" step="any" value={couponRate} onChange={(e) => setCouponRate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Rating</label>
              <input style={inputStyle} value={rating} onChange={(e) => setRating(e.target.value)} placeholder="AAA" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Maturity Date</label>
              <input style={inputStyle} type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Purchase Date</label>
              <input style={inputStyle} type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Notes</label>
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
            {saving ? "SAVING…" : initial ? "UPDATE BOND" : "ADD BOND"}
          </button>
        </form>
      </div>
    </div>
  );
}
