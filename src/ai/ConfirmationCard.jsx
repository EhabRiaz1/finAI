import React, { useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { COLORS, MONO, SANS } from "../lib/theme";

/* ------------------------------------------------------------------
   Confirmation card for AI-proposed writes. Nothing executes until
   the user approves here — the card lists every field of every
   proposed change. Collapses to a resolved ✓/✗ banner afterwards.
   ------------------------------------------------------------------ */

const FIELD_LABELS = {
  ticker: "Ticker",
  shares: "Shares",
  cost_per_share: "Cost / share",
  purchase_date: "Purchase date",
  notes: "Notes",
  id: "Row id",
  bond_type: "Type",
  identifier: "Identifier",
  name: "Name",
  face_value: "Face value",
  quantity: "Quantity",
  purchase_price: "Purchase price",
  purchase_yield: "Purchase yield",
  coupon_rate: "Coupon",
  maturity_date: "Maturity",
  rating: "Rating",
  symbol: "Symbol",
  asset_type: "Asset type",
  side: "Side",
  price: "Price",
  commission: "Commission",
  fees: "Fees",
  trade_time: "Trade time",
  realized_pnl: "Realized P&L",
  buying_power: "Buying power",
  cash: "Cash",
  instrument_type: "Instrument type",
};

function fmtValue(v) {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return String(v);
}

export default function ConfirmationCard({ item, onResolve, disabled }) {
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);
  const resolved = item.status !== "pending";
  const approved = item.status === "approved";

  const resolve = (ok) => {
    if (disabled || resolved) return;
    onResolve(
      item.id,
      item.writes.map((w) => ({
        tool_use_id: w.tool_use_id,
        approved: ok,
        ...(ok ? {} : reason.trim() ? { reason: reason.trim() } : {}),
      })),
    );
  };

  return (
    <div
      style={{
        border: `1px solid ${resolved ? COLORS.border : COLORS.amberDim}`,
        background: COLORS.panel,
        margin: "4px 0 14px",
        opacity: resolved && !approved ? 0.75 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderBottom: resolved ? "none" : `1px solid ${COLORS.border}`,
        }}
      >
        <ShieldAlert size={13} color={resolved ? COLORS.textDim : COLORS.amber} strokeWidth={1.5} />
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.4, color: resolved ? COLORS.textDim : COLORS.amber }}>
          {resolved ? (approved ? "APPROVED" : "DECLINED") : "CONFIRMATION REQUIRED"}
        </span>
        {resolved && (
          <span style={{ marginLeft: "auto", color: approved ? COLORS.up : COLORS.down }}>
            {approved ? <Check size={13} /> : <X size={13} />}
          </span>
        )}
      </div>

      {!resolved &&
        item.writes.map((w) => (
          <div key={w.tool_use_id} style={{ padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>
              {w.label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 4 }}>
              {Object.entries(w.input ?? {}).map(([k, v]) => (
                <React.Fragment key={k}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: COLORS.textDim, paddingTop: 2 }}>
                    {FIELD_LABELS[k] ?? k}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 12.5, color: COLORS.text }}>{fmtValue(v)}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}

      {resolved && (
        <div style={{ padding: "8px 14px", fontFamily: SANS, fontSize: 12, color: COLORS.textDim }}>
          {item.writes.map((w) => w.label).join(" · ")}
        </div>
      )}

      {!resolved && (
        <div style={{ padding: "10px 14px" }}>
          {showReason && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you declining? (optional — helps the AI adjust)"
              style={{
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 10,
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                padding: "8px 10px",
                color: COLORS.text,
                fontFamily: SANS,
                fontSize: 12,
                outline: "none",
              }}
            />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => resolve(true)}
              disabled={disabled}
              style={{
                all: "unset",
                cursor: disabled ? "not-allowed" : "pointer",
                padding: "8px 18px",
                background: COLORS.amber,
                color: COLORS.bg,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.2,
                fontWeight: 600,
              }}
            >
              APPROVE
            </button>
            <button
              onClick={() => (showReason ? resolve(false) : setShowReason(true))}
              disabled={disabled}
              style={{
                all: "unset",
                cursor: disabled ? "not-allowed" : "pointer",
                padding: "8px 18px",
                border: `1px solid ${COLORS.border}`,
                color: COLORS.textDim,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.2,
              }}
            >
              {showReason ? "CONFIRM DECLINE" : "DECLINE"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
