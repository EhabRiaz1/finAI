import React from "react";
import { COLORS, fmtMoney0, MONO, SANS, SERIF } from "../lib/theme";

/* ------------------------------------------------------------------
   Dashboard card: YTD return via the Modified Dietz method. Headline is
   the HOUSEHOLD figure (all linked accounts combined) — the real
   whole-portfolio return — with the single account's sleeve return
   shown beneath. Marked BETA. See docs/modified-dietz.md.
   ------------------------------------------------------------------ */

function pct(x) {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
}

export default function ModifiedDietzCard({ data }) {
  const hh = data?.household;
  const acct = data?.account;
  const ready = hh?.ready;
  const ret = hh?.ret ?? 0;
  const up = ret >= 0;
  const tone = up ? COLORS.up : COLORS.down;
  const members = data?.members ?? 1;

  return (
    <div style={{ position: "relative", overflow: "hidden", background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "16px 18px" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: ready ? tone : COLORS.amber, opacity: 0.7 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.5, textTransform: "uppercase" }}>
          Modified Dietz Return
        </div>
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: COLORS.amber, border: `1px solid ${COLORS.amberDim}`, padding: "1px 5px" }}>BETA</span>
      </div>

      {data?.loading ? (
        <div style={{ fontFamily: SERIF, fontSize: 26, color: COLORS.textDim, marginTop: 6 }}>Computing…</div>
      ) : ready ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontFamily: SERIF, fontSize: 32, color: tone, lineHeight: 1 }}>{pct(ret)}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: COLORS.textDim, letterSpacing: 0.5 }}>
              YTD{members > 1 ? ` · household · ${members} accounts` : ""}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginTop: 12 }}>
            <Stat label="Start value" value={`$${fmtMoney0(hh.bmv)}`} />
            <Stat label="Current value" value={`$${fmtMoney0(hh.emv)}`} />
            <Stat label="Net flows" value={`${hh.netFlows >= 0 ? "+" : "-"}$${fmtMoney0(Math.abs(hh.netFlows))}`} />
            <Stat label="Gain (ex-flows)" value={`${hh.gain >= 0 ? "+" : "-"}$${fmtMoney0(Math.abs(hh.gain))}`} tone={hh.gain >= 0 ? COLORS.up : COLORS.down} />
          </div>
          {members > 1 && acct?.ready && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.border}`, fontFamily: MONO, fontSize: 10.5, color: COLORS.textDim, display: "flex", justifyContent: "space-between" }}>
              <span>This account (sleeve)</span>
              <span style={{ color: acct.ret >= 0 ? COLORS.up : COLORS.down }}>{pct(acct.ret)}</span>
            </div>
          )}
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
