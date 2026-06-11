import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { COLORS, fmtMoney, fmtPct, MONO, SERIF } from "../lib/theme";

export function Panel({ children, style }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, ...style }}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.text, letterSpacing: 0.3 }}>
        {title}
      </div>
      {right && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: COLORS.textDim, letterSpacing: 1 }}>
          {right}
        </div>
      )}
    </div>
  );
}

export function StatTile({ label, value, change, isPct, prefix }) {
  const up = Number(change) >= 0;
  const showChange = change !== undefined && change !== null;
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 19, color: COLORS.text, fontWeight: 500 }}>
        {prefix}
        {isPct ? `${Number(value).toFixed(2)}%` : fmtMoney(value)}
      </div>
      {showChange && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: up ? COLORS.up : COLORS.down,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {fmtPct(change)}
        </div>
      )}
    </div>
  );
}

export function MetricCell({ label, value, tone }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "10px 12px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.5, marginBottom: 4 }}>
        {String(label).toUpperCase()}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 14, color: tone ?? COLORS.text }}>{value}</div>
    </div>
  );
}

export function Badge({ children, color = COLORS.textDim, border = COLORS.borderHi }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 9,
        padding: "3px 7px",
        border: `1px solid ${border}`,
        color,
        letterSpacing: 1.5,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}
