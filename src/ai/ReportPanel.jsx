import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileText, Loader, Maximize2, Minimize2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COLORS, MONO, SANS, SERIF } from "../lib/theme";
import { useChat } from "./ChatProvider";

/* ------------------------------------------------------------------
   ReportPanel — renders an equity research report artifact (kind:"report").
   The report content is a print-clean "page" (white paper, dark ink) inside
   the dark panel chrome — the same layout doubles as the full-screen reading
   mode and the html2pdf export target. Every NUMBER comes from the locked
   model (model.* — computed by the deterministic engine, never the AI); the
   AI only fills `narrative[sectionKey]` prose, streamed in live.
   ------------------------------------------------------------------ */

const SECTIONS = [
  { key: "exec_summary", title: "Executive Summary", n: "" },
  { key: "industry", title: "Industry & Strategic Analysis", n: "1" },
  { key: "accounting", title: "Accounting Analysis", n: "2" },
  { key: "financial", title: "Financial Analysis", n: "3" },
  { key: "forecast", title: "Forecasting", n: "4" },
  { key: "valuation", title: "Valuation", n: "5" },
  { key: "recommendation", title: "Recommendation", n: "6" },
];

// Light "paper" palette for the document body.
const P = {
  paper: "#ffffff",
  ink: "#1b2330",
  sub: "#5c6675",
  rule: "#dfe3ea",
  band: "#33415c", // navy section bar (matches the source report)
  bandInk: "#ffffff",
  zebra: "#f6f7f9",
  cream: "#fbf3df", // highlighted value boxes
  creamBorder: "#e6d6a8",
  posBg: "#eaf6ec", neg: "#b3402f", pos: "#1f7a3d",
};

/* ----------------------------- formatters ----------------------------- */
const NF0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const i0 = (v) => (v == null || !Number.isFinite(+v) ? "—" : NF0.format(+v));
const f2 = (v) => (v == null || !Number.isFinite(+v) ? "—" : (+v).toFixed(2));
const pct = (v, d = 1) => (v == null || !Number.isFinite(+v) ? "—" : `${(+v * 100).toFixed(d)}%`);
const xmult = (v) => (v == null || !Number.isFinite(+v) ? "—" : `${(+v).toFixed(2)}x`);
const signedPct = (v, d = 1) => (v == null || !Number.isFinite(+v) ? "—" : `${+v >= 0 ? "+" : ""}${(+v * 100).toFixed(d)}%`);

export default function ReportPanel() {
  const { activeArtifact, closeArtifact } = useChat();
  const [expanded, setExpanded] = useState(false);
  const pageRef = useRef(null);

  const data = activeArtifact?.data ?? {};
  const model = data.model;
  const narrative = data.narrative ?? {};
  const status = data.status ?? "generating";
  const meta = model?.meta ?? {};
  const cur = meta.currency ?? "USD";

  const writtenKeys = useMemo(() => new Set(Object.keys(narrative).filter((k) => (narrative[k] ?? "").trim())), [narrative]);

  if (!activeArtifact) return null;

  async function downloadPdf() {
    const el = pageRef.current;
    if (!el) return;
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [10, 9, 13, 9],
          filename: `${meta.ticker ?? "equity"}-research-report.pdf`,
          image: { type: "jpeg", quality: 0.97 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(el)
        .save();
    } catch {
      window.print(); // graceful fallback if the lib fails to load
    }
  }

  const chrome = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: COLORS.bg, borderLeft: `1px solid ${COLORS.borderHi}` }}>
      {/* Dark chrome header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <FileText size={15} color={COLORS.amber} strokeWidth={1.6} />
        <div style={{ fontFamily: SERIF, fontSize: 16, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
          {activeArtifact.name || "Equity Research"}
        </div>
        <StatusPill status={status} done={writtenKeys.size} total={SECTIONS.length} />
        <IconBtn title={expanded ? "Exit full screen" : "Full screen"} onClick={() => setExpanded((v) => !v)}>
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </IconBtn>
        <IconBtn title="Download PDF" onClick={downloadPdf}><Download size={14} /></IconBtn>
        <IconBtn title="Close" onClick={closeArtifact}><X size={15} /></IconBtn>
      </div>

      {/* Section progress rail */}
      <div style={{ display: "flex", gap: 4, padding: "7px 12px", borderBottom: `1px solid ${COLORS.border}`, overflowX: "auto", flexShrink: 0 }}>
        {SECTIONS.map((s) => {
          const state = writtenKeys.has(s.key) ? "done" : status === "generating" ? "pending" : "done";
          return (
            <a key={s.key} href={`#sec-${s.key}`} title={s.title}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", fontFamily: MONO, fontSize: 9, letterSpacing: 0.5, whiteSpace: "nowrap", textDecoration: "none", color: state === "done" ? COLORS.amber : COLORS.textMute, border: `1px solid ${state === "done" ? COLORS.amberDim : COLORS.border}` }}>
              {state === "done" ? <Check size={9} /> : <Loader size={9} className="fa-spin" />}{s.title}
            </a>
          );
        })}
      </div>

      {/* Scrollable paper */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#3a3f47", padding: expanded ? "28px 0" : "16px 0" }}>
        {model ? <Page ref={pageRef} model={model} narrative={narrative} meta={meta} cur={cur} status={status} /> : <Empty />}
      </div>
      <style>{`@keyframes fa-spin{to{transform:rotate(360deg)}} .fa-spin{animation:fa-spin 0.9s linear infinite}`}</style>
    </div>
  );

  if (expanded) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>{chrome}</div>
      </div>
    );
  }
  return chrome;
}

function Empty() {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 40, fontFamily: SANS, color: P.sub }}>
      Building report…
    </div>
  );
}

/* ------------------------------- the page ------------------------------- */
const Page = React.forwardRef(function Page({ model, narrative, meta, cur, status }, ref) {
  const vs = model.valuationSummary ?? {};
  const warnings = model.dataQuality?.warnings ?? [];
  return (
    <div ref={ref} style={{ maxWidth: 820, margin: "0 auto", background: P.paper, color: P.ink, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.6, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
      <div style={{ padding: "44px 56px 56px" }}>
        {/* Cover */}
        <div style={{ borderBottom: `2px solid ${P.ink}`, paddingBottom: 18, marginBottom: 22 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: P.sub }}>EQUITY RESEARCH · ILLUSTRATIVE VALUATION</div>
          <div style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1.1, margin: "8px 0 4px" }}>{meta.name ?? meta.ticker}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: P.sub }}>
            {[meta.ticker, meta.exchange, meta.sector].filter(Boolean).join(" · ")}
            {meta.asOf ? ` · as of ${meta.asOf}` : ""}
          </div>
        </div>

        {/* Headline recommendation box */}
        <RecBox vs={vs} cur={cur} coc={model.costOfCapital} roe={model.historical?.latestRoe} status={status} />

        {warnings.length > 0 && (
          <Callout>
            <strong>Data quality.</strong> This report runs on a free data stack.{" "}
            {warnings.map((w, i) => <span key={i}>{w} </span>)}
          </Callout>
        )}

        {/* Sections */}
        <Section id="exec_summary" title="Executive Summary">
          <Prose md={narrative.exec_summary} status={status} />
        </Section>

        <Section id="industry" n="1" title="Industry & Strategic Analysis">
          <Prose md={narrative.industry} status={status} />
        </Section>

        <Section id="accounting" n="2" title="Accounting Analysis">
          <Prose md={narrative.accounting} status={status} />
        </Section>

        <Section id="financial" n="3" title="Financial Analysis">
          <HistoryTable h={model.historical} />
          <DupontTable h={model.historical} />
          {model.peerComps && <PeerTable pc={model.peerComps} />}
          <Prose md={narrative.financial} status={status} />
        </Section>

        <Section id="forecast" n="4" title="Forecasting">
          <AssumptionsTable model={model} cur={cur} />
          <ForecastTable model={model} cur={cur} />
          <Prose md={narrative.forecast} status={status} />
        </Section>

        <Section id="valuation" n="5" title="Valuation">
          <CostOfCapitalTable coc={model.costOfCapital} />
          <AeTable ae={model.abnormalEarnings} cur={cur} />
          <DcfTable dcf={model.dcf} cur={cur} />
          <MultiplesTable m={model.multiples} cur={cur} />
          {model.roeMeanReversion && <RoeTable roe={model.roeMeanReversion} price={meta.currentPrice} cur={cur} />}
          <SensitivityTable grid={model.sensitivityGrid} cur={cur} />
          <SummaryTable vs={vs} cur={cur} />
          <Prose md={narrative.valuation} status={status} />
        </Section>

        <Section id="recommendation" n="6" title="Recommendation">
          <RecBox vs={vs} cur={cur} coc={model.costOfCapital} roe={model.historical?.latestRoe} status={status} compact />
          <Prose md={narrative.recommendation} status={status} />
        </Section>

        {/* Sources + disclaimer footer */}
        <div style={{ marginTop: 34, paddingTop: 14, borderTop: `1px solid ${P.rule}`, fontFamily: MONO, fontSize: 9.5, color: P.sub, lineHeight: 1.7 }}>
          <div><strong>Data &amp; sources.</strong> {Object.entries(model.dataQuality?.sources ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "free public sources"}. {meta.reportingNote}</div>
          <div style={{ marginTop: 8 }}><strong>Disclaimer.</strong> This document is a model-generated, illustrative valuation for informational purposes only. The directional signal is a mechanical model output, not investment advice or a recommendation to buy or sell any security. Figures are estimates derived from third-party data that may be incomplete or inaccurate. Do your own research and consult a licensed advisor before making any investment decision.</div>
        </div>
      </div>
    </div>
  );
});

/* ------------------------------ primitives ------------------------------ */
function Section({ id, n, title, children }) {
  return (
    <section id={`sec-${id}`} style={{ marginTop: 26, breakInside: "avoid" }}>
      <div style={{ background: P.band, color: P.bandInk, padding: "7px 12px", fontFamily: SERIF, fontSize: 18, letterSpacing: 0.3 }}>
        {n ? `${n}. ` : ""}{title}
      </div>
      <div style={{ paddingTop: 12 }}>{children}</div>
    </section>
  );
}

function Callout({ children }) {
  return (
    <div style={{ display: "flex", gap: 9, background: P.cream, border: `1px solid ${P.creamBorder}`, padding: "10px 13px", margin: "14px 0", fontFamily: SANS, fontSize: 12, lineHeight: 1.55, color: "#6b5618" }}>
      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

function Prose({ md, status }) {
  if (!md || !md.trim()) {
    return (
      <div style={{ fontFamily: SANS, fontSize: 12.5, color: P.sub, fontStyle: "italic", padding: "4px 0" }}>
        {status === "generating" ? "Writing this section…" : "No narrative for this section."}
      </div>
    );
  }
  return <div style={{ marginTop: 4 }}><ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{md}</ReactMarkdown></div>;
}

// Light markdown theme for the paper.
const MD = {
  p: ({ children }) => <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.62 }}>{children}</p>,
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: P.ink }}>{children}</strong>,
  h2: ({ children }) => <h2 style={{ fontFamily: SERIF, fontSize: 19, margin: "16px 0 8px" }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontFamily: SERIF, fontSize: 16, margin: "14px 0 6px" }}>{children}</h3>,
  ul: ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "0 0 10px", paddingLeft: 20 }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 4, fontSize: 13.5, lineHeight: 1.55 }}>{children}</li>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: "#1f4e8c", textDecoration: "underline" }}>{children}</a>,
  em: ({ children }) => <em>{children}</em>,
  table: ({ children }) => <table style={{ borderCollapse: "collapse", width: "100%", margin: "8px 0", fontSize: 12 }}>{children}</table>,
  th: ({ children }) => <th style={{ border: `1px solid ${P.rule}`, padding: "5px 8px", background: P.zebra, textAlign: "left", fontFamily: MONO, fontSize: 10 }}>{children}</th>,
  td: ({ children }) => <td style={{ border: `1px solid ${P.rule}`, padding: "5px 8px" }}>{children}</td>,
  blockquote: ({ children }) => <blockquote style={{ borderLeft: `3px solid ${P.rule}`, margin: "8px 0", padding: "2px 12px", color: P.sub }}>{children}</blockquote>,
};

/** Generic banded table. `head` = array of header cells. `rows` = array of
 *  { cells: [{ v, align?, bold?, hi? }] }. `caption` optional. */
function Table({ caption, head, rows }) {
  return (
    <div style={{ margin: "12px 0", breakInside: "avoid" }}>
      {caption && <div style={{ background: "#4b5563", color: "#fff", padding: "5px 10px", fontFamily: MONO, fontSize: 10, letterSpacing: 1 }}>{caption}</div>}
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5, fontFamily: SANS }}>
        {head && (
          <thead>
            <tr>{head.map((h, i) => (
              <th key={i} style={{ border: `1px solid ${P.rule}`, padding: "5px 9px", background: "#eef1f5", textAlign: i === 0 ? "left" : "right", fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.4, color: P.ink, whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ background: r.section ? "#39414e" : ri % 2 ? P.zebra : "#fff" }}>
              {r.section ? (
                <td colSpan={head ? head.length : r.cells.length} style={{ border: `1px solid ${P.rule}`, padding: "4px 9px", color: "#fff", fontFamily: MONO, fontSize: 9.5, letterSpacing: 1 }}>{r.section}</td>
              ) : r.cells.map((c, ci) => (
                <td key={ci} style={{ border: `1px solid ${P.rule}`, padding: "5px 9px", textAlign: c.align ?? (ci === 0 ? "left" : "right"), fontWeight: c.bold ? 600 : 400, background: c.hi ? P.cream : undefined, fontVariantNumeric: "tabular-nums" }}>{c.v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------- tables ------------------------------- */
function RecBox({ vs, cur, coc, roe, status, compact }) {
  const sig = vs.signal ?? "—";
  const sigColor = sig === "BUY" ? P.pos : sig === "SELL" ? P.neg : "#9a7b1e";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: P.rule, border: `1px solid ${P.rule}`, margin: compact ? "6px 0 12px" : "0 0 18px" }}>
      <Kpi label="Current Price" v={`${i0(vs.currentPrice)} ${cur}`} />
      <Kpi label="Blended Target (median)" v={`${i0(vs.median)} ${cur}`} />
      <Kpi label="Implied Upside" v={signedPct(vs.impliedUpside)} color={vs.impliedUpside >= 0 ? P.pos : P.neg} />
      <Kpi label="Model Signal" v={sig} color={sigColor} hi />
      {!compact && <>
        <Kpi label="Abnormal Earnings (primary)" v={`${i0(vs.methods?.find((m) => m.name.startsWith("Abnormal"))?.perShare)} ${cur}`} small />
        <Kpi label="DCF cross-check" v={`${i0(vs.methods?.find((m) => m.name === "DCF")?.perShare)} ${cur}`} small />
        <Kpi label="WACC" v={pct(coc?.wacc, 2)} small />
        <Kpi label="Latest ROE" v={pct(roe, 1)} small />
      </>}
    </div>
  );
}
function Kpi({ label, v, color, hi, small }) {
  return (
    <div style={{ background: hi ? P.cream : "#fff", padding: small ? "8px 11px" : "11px 13px" }}>
      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.6, color: P.sub, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: small ? 18 : 23, color: color ?? P.ink, marginTop: 2 }}>{v}</div>
    </div>
  );
}

function HistoryTable({ h }) {
  if (!h) return null;
  const yrs = h.years ?? [];
  const head = ["Metric", ...yrs];
  const row = (label, arr, fmt) => ({ cells: [{ v: label }, ...yrs.map((_, i) => ({ v: fmt(arr?.[i]) }))] });
  return (
    <Table caption="PROFITABILITY THROUGH TIME (figures in millions of reporting currency)" head={head} rows={[
      row("Revenue", h.revenue, i0),
      row("Revenue Growth YoY", h.revenueGrowth, (v) => pct(v)),
      row("Gross Margin", h.grossMargin, (v) => pct(v)),
      row("Operating Margin", h.operatingMargin, (v) => pct(v)),
      row("EBITDA Margin", h.ebitdaMargin, (v) => pct(v)),
      row("Net Margin", h.netMargin, (v) => pct(v)),
      row("Effective Tax Rate", h.effectiveTax, (v) => pct(v)),
    ]} />
  );
}

function DupontTable({ h }) {
  if (!h?.dupont) return null;
  const yrs = h.years ?? [];
  const head = ["DuPont Decomposition", ...yrs];
  const row = (label, pick, fmt) => ({ cells: [{ v: label }, ...yrs.map((_, i) => ({ v: fmt(pick(h.dupont[i])) }))] });
  return (
    <Table head={head} rows={[
      row("Net Margin (NI / Revenue)", (d) => d?.netMargin, (v) => pct(v)),
      row("Asset Turnover (Rev / Avg Assets)", (d) => d?.assetTurnover, xmult),
      row("Equity Multiplier (Assets / Equity)", (d) => d?.equityMultiplier, xmult),
      row("ROE (NI / Avg Equity)", (d) => d?.roe, (v) => pct(v)),
    ]} />
  );
}

function PeerTable({ pc }) {
  const peers = pc.peers ?? [];
  if (!peers.length) return null;
  const cols = [["grossMargin", "Gross", (v) => pct(v, 0)], ["ebitdaMargin", "EBITDA", (v) => pct(v, 0)], ["operatingMargin", "Op", (v) => pct(v, 0)], ["netMargin", "Net", (v) => pct(v, 0)], ["pe", "P/E", xmult], ["evEbitda", "EV/EBITDA", xmult]];
  const hasMetrics = peers.some((p) => cols.some(([k]) => p[k] != null));
  const head = ["Peer", ...cols.map((c) => c[1])];
  const rows = peers.map((p) => ({ cells: [{ v: p.name ?? p.ticker }, ...cols.map(([k, , fmt]) => ({ v: p[k] != null ? fmt(p[k]) : "—" }))] }));
  return (
    <Table caption={hasMetrics ? "PEER CROSS-SECTION" : "PEER SET (metrics unavailable on the free tier)"} head={hasMetrics ? head : ["Peer ticker"]} rows={hasMetrics ? rows : peers.map((p) => ({ cells: [{ v: p.name ?? p.ticker }] }))} />
  );
}

function AssumptionsTable({ model, cur }) {
  const c = model.costOfCapital, a = model.assumptions, f = model.forecast.assumptionsUsed;
  const r = (l, v, note) => ({ cells: [{ v: l }, { v }, { v: note, align: "left" }] });
  return (
    <Table caption="ASSUMPTIONS" head={["Input", "Value", "Basis"]} rows={[
      { section: "COST OF CAPITAL" },
      r("Risk-Free Rate", pct(c.rf, 2), "10Y government yield (currency-matched)"),
      r("Equity Risk Premium", pct(c.mrp, 2), "Mature-market premium"),
      r("Beta", f2(c.beta), "5-year levered beta"),
      r("Cost of Equity (CAPM)", pct(c.ke, 2), "Rf + β × ERP"),
      r("Pre-Tax Cost of Debt", pct(c.pretaxKd, 2), "Rf + corporate spread"),
      r("Effective Tax Rate", pct(c.taxRate, 0), "Statutory (conservative)"),
      r("After-Tax Cost of Debt", pct(c.kdAfterTax, 2), "Kd × (1 − tax)"),
      r("WACC", pct(c.wacc, 2), "Market-value weighted"),
      { section: "FORECAST INPUTS" },
      r("Y1 Revenue Growth", pct(f.y1Growth, 1), "Consensus / last reported"),
      r("Terminal Growth", pct(f.terminalGrowth, 2), "Long-run nominal GDP"),
      r("Operating Margin", pct(f.operatingMargin, 1), "Trailing 3-yr average"),
      r("Net Margin", pct(f.netMargin, 1), "Trailing 3-yr average"),
      r("Capex / Revenue", pct(f.capexPctRevenue, 0), "≈ D&A (net-zero in UFCF)"),
      r("Working Capital / ΔRevenue", pct(f.wcPctDeltaRevenue, 0), "Standard assumption"),
      { section: "MULTIPLES" },
      r("Terminal P/E", xmult(a.terminalPE), "Sector multiple"),
      r("Terminal EV/EBITDA", xmult(a.terminalEvEbitda), "Sector multiple"),
    ]} />
  );
}

function ForecastTable({ model, cur }) {
  const f = model.forecast, h = model.historical, ae = model.abnormalEarnings;
  const li = h.revenue.length - 1;
  const y0 = {
    growth: null, revenue: h.revenue[li], opMargin: h.operatingMargin[li],
    ebit: (h.revenue[li] ?? 0) * (h.operatingMargin[li] ?? 0),
    nopat: null, netMargin: h.netMargin[li], netIncome: (h.revenue[li] ?? 0) * (h.netMargin[li] ?? 0),
    bv: ae.currentBookValue,
  };
  const cols = [`${f.baseYear} A`, ...f.years.map((y) => `${y} E`)];
  const head = ["Line Item", ...cols];
  const r = (label, y0v, arr, fmt, bold) => ({ cells: [{ v: label, bold }, { v: fmt(y0v) }, ...arr.map((v) => ({ v: fmt(v), bold }))] });
  return (
    <Table caption={`5-YEAR FORECAST (millions of ${cur})`} head={head} rows={[
      r("Revenue Growth", y0.growth, f.growth, (v) => pct(v, 1)),
      r("Revenue", y0.revenue, f.revenue, i0, true),
      r("Operating Margin", y0.opMargin, f.years.map(() => f.operatingMargin), (v) => pct(v, 1)),
      r("EBIT", y0.ebit, f.ebit, i0),
      r("NOPAT (EBIT × (1−tax))", y0.nopat, f.nopat, i0),
      r("Net Margin", y0.netMargin, f.years.map(() => f.netMargin), (v) => pct(v, 1)),
      r("Net Income", y0.netIncome, f.netIncome, i0, true),
      r("Book Value of Equity (end)", y0.bv, f.bvEnd, i0),
    ]} />
  );
}

function CostOfCapitalTable({ coc }) {
  const r = (l, v) => ({ cells: [{ v: l }, { v }] });
  return (
    <Table caption="5.1 COST OF CAPITAL" head={["Component", "Value"]} rows={[
      r("Risk-Free Rate", pct(coc.rf, 2)), r("Equity Risk Premium", pct(coc.mrp, 2)), r("Beta", f2(coc.beta)),
      r("Cost of Equity (CAPM)", pct(coc.ke, 2)), r("Pre-Tax Cost of Debt", pct(coc.pretaxKd, 2)),
      r("After-Tax Cost of Debt", pct(coc.kdAfterTax, 2)), r("WACC", pct(coc.wacc, 2)),
    ]} />
  );
}

function AeTable({ ae, cur }) {
  if (!ae?.rows) return null;
  const yrs = ae.rows.map((r) => `Y${r.year - ae.rows[0].year + 1}`);
  const head = ["Abnormal Earnings (primary)", ...yrs];
  const row = (label, pick, fmt) => ({ cells: [{ v: label }, ...ae.rows.map((r) => ({ v: fmt(pick(r)) }))] });
  return (
    <>
      <Table caption="5.2 ABNORMAL EARNINGS VALUATION" head={head} rows={[
        row("Beginning Book Value", (r) => r.beginningBookValue, i0),
        row("Net Income", (r) => r.netIncome, i0),
        row("Normal Earnings (Ke × Beg BV)", (r) => r.normalEarnings, i0),
        row("Abnormal Earnings", (r) => r.abnormalEarnings, i0),
        row("Discount Factor (Ke)", (r) => r.discountFactor, f2),
        row("PV of Abnormal Earnings", (r) => r.pvAbnormalEarnings, i0),
      ]} />
      <Table head={["Component", `Value (${cur} mm) / per share`]} rows={[
        { cells: [{ v: "Current Book Value (Y0)" }, { v: i0(ae.currentBookValue) }] },
        { cells: [{ v: "Sum PV of Abnormal Earnings (Y1–Y5)" }, { v: i0(ae.sumPvAe) }] },
        { cells: [{ v: "Terminal Value (Gordon, end of Y5)" }, { v: i0(ae.terminalValue) }] },
        { cells: [{ v: "PV of Terminal Value" }, { v: i0(ae.pvTerminal) }] },
        { cells: [{ v: "AE Equity Value", bold: true }, { v: i0(ae.equityValue), bold: true }] },
        { cells: [{ v: "AE Value Per Share", bold: true }, { v: `${f2(ae.perShare)} ${cur}`, bold: true, hi: true }] },
      ]} />
    </>
  );
}

function DcfTable({ dcf, cur }) {
  if (!dcf?.rows) return null;
  const yrs = dcf.rows.map((r) => `Y${r.year - dcf.rows[0].year + 1}`);
  const head = ["DCF Cross-Check", ...yrs];
  const row = (label, pick, fmt) => ({ cells: [{ v: label }, ...dcf.rows.map((r) => ({ v: fmt(pick(r)) }))] });
  return (
    <>
      <Table caption="5.5 DCF VALUATION (CROSS-CHECK)" head={head} rows={[
        row("Free Cash Flow (NOPAT − ΔWC)", (r) => r.freeCashFlow, i0),
        row("Discount Factor (WACC)", (r) => r.discountFactor, f2),
        row("PV of Free Cash Flow", (r) => r.pvFreeCashFlow, i0),
      ]} />
      <Table head={["Component", `Value (${cur} mm) / per share`]} rows={[
        { cells: [{ v: "Sum PV of FCF" }, { v: i0(dcf.sumPvFcf) }] },
        { cells: [{ v: "PV of Terminal Value" }, { v: i0(dcf.pvTerminal) }] },
        { cells: [{ v: "Enterprise Value" }, { v: i0(dcf.enterpriseValue) }] },
        { cells: [{ v: "Less: Net Debt (negative = net cash)" }, { v: i0(dcf.netDebt) }] },
        { cells: [{ v: "DCF Equity Value", bold: true }, { v: i0(dcf.equityValue), bold: true }] },
        { cells: [{ v: "DCF Value Per Share", bold: true }, { v: `${f2(dcf.perShare)} ${cur}`, bold: true, hi: true }] },
      ]} />
    </>
  );
}

function MultiplesTable({ m, cur }) {
  if (!m) return null;
  return (
    <Table caption="5.7 TRADING MULTIPLES" head={["Method", "Per Share"]} rows={[
      { cells: [{ v: `Forward P/E × Y1 EPS (${f2(m.y1Eps)} ${cur})` }, { v: `${f2(m.peShare)} ${cur}` }] },
      { cells: [{ v: "Forward EV/EBITDA × Y1 EBITDA" }, { v: `${f2(m.evEbitdaShare)} ${cur}` }] },
    ]} />
  );
}

function RoeTable({ roe, price, cur }) {
  const head = ["Scenario", "Per Share", "vs Current Price"];
  const rows = (roe.scenarios ?? []).map((s) => ({
    cells: [{ v: s.label }, { v: `${i0(s.perShare)} ${cur}` }, { v: price ? signedPct(s.perShare / price - 1) : "—", align: "right" }],
  }));
  return <Table caption={`5.4 ROE MEAN REVERSION (${roe.horizon}-YEAR · current ROE ${pct(roe.currentRoe, 1)}, Ke ${pct(roe.costOfEquity, 2)})`} head={head} rows={rows} />;
}

function SensitivityTable({ grid, cur }) {
  if (!grid?.grid) return null;
  const head = ["WACC ↓ / g →", ...grid.gs.map((g) => pct(g, 2))];
  const mid = Math.floor(grid.waccs.length / 2); // base case sits at the grid center
  const rows = grid.waccs.map((w, ri) => ({
    cells: [{ v: pct(w, 2), bold: true }, ...grid.grid[ri].map((cell, gi) => ({ v: cell == null ? "—" : i0(cell), hi: cell != null && ri === mid && gi === mid }))],
  }));
  return <Table caption={`5.6 SENSITIVITY — DCF PER SHARE (${cur})`} head={head} rows={rows} />;
}

function SummaryTable({ vs, cur }) {
  const head = ["Method", "Per Share", "vs Current Price"];
  const rows = (vs.methods ?? []).map((m) => ({
    cells: [{ v: m.name }, { v: `${i0(m.perShare)} ${cur}` }, { v: signedPct(m.vsPrice) }],
  }));
  rows.push({ cells: [{ v: "Median (blended target)", bold: true }, { v: `${i0(vs.median)} ${cur}`, bold: true, hi: true }, { v: signedPct(vs.impliedUpside), bold: true, hi: true }] });
  return <Table caption="5.8 VALUATION SUMMARY" head={head} rows={rows} />;
}

/* ----------------------------- chrome bits ----------------------------- */
function StatusPill({ status, done, total }) {
  const generating = status === "generating";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", fontFamily: MONO, fontSize: 9, letterSpacing: 0.8, color: generating ? COLORS.amber : COLORS.up, border: `1px solid ${generating ? COLORS.amberDim : "#1f5132"}` }}>
      {generating ? <Loader size={9} className="fa-spin" /> : <Check size={9} />}
      {generating ? `WRITING ${done}/${total}` : "COMPLETE"}
    </span>
  );
}

function IconBtn({ children, onClick, title }) {
  return (
    <button onClick={onClick} title={title}
      style={{ all: "unset", cursor: "pointer", padding: 6, color: COLORS.textDim, display: "flex", alignItems: "center" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.amber)}
      onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}>
      {children}
    </button>
  );
}
