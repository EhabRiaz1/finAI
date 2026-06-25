import React from "react";
import { COLORS, fmtMoney0, MONO, SANS, SERIF } from "../lib/theme";

/* ------------------------------------------------------------------
   Dashboard card: Modified Dietz return for the caller's own account.
   Period label is data-driven (`data.label`): "Since inception" when the
   account has a reset baseline, else "YTD". See docs/modified-dietz.md.
   ------------------------------------------------------------------ */

function pct(x) {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
}

export default function ModifiedDietzCard({ data }) {
  const ready = data?.ready;
  const ret = data?.ret ?? 0;
  const up = ret >= 0;
  const tone = up ? COLORS.up : COLORS.down;

  return (
    <div style={{ position: "relative", overflow: "hidden", background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "16px 18px" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: ready ? tone : COLORS.amber, opacity: 0.7 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.5, textTransform: "uppercase" }}>
          Modified Dietz Return
        </div>
      </div>

      {data?.loading ? (
        <div style={{ fontFamily: SERIF, fontSize: 26, color: COLORS.textDim, marginTop: 6 }}>Computing…</div>
      ) : ready ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontFamily: SERIF, fontSize: 32, color: tone, lineHeight: 1 }}>{pct(ret)}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: COLORS.textDim, letterSpacing: 0.5, textTransform: "uppercase" }}>{data?.label ?? "YTD"}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginTop: 12 }}>
            <Stat label="Start value" value={`$${fmtMoney0(data.bmv)}`} />
            <Stat label="Current value" value={`$${fmtMoney0(data.emv)}`} />
            <Stat label="Net flows" value={`${data.netFlows >= 0 ? "+" : "-"}$${fmtMoney0(Math.abs(data.netFlows))}`} />
            <Stat label="Gain (ex-flows)" value={`${data.gain >= 0 ? "+" : "-"}$${fmtMoney0(Math.abs(data.gain))}`} tone={data.gain >= 0 ? COLORS.up : COLORS.down} />
          </div>
        </>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 13, color: COLORS.textDim, marginTop: 8 }}>
          {data?.error ? "Return unavailable right now." : "Insufficient history to compute a return yet."}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 8.5, color: COLORS.textMute, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: tone ?? COLORS.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}
