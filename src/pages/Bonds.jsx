import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLORS, fmtMoney0, fmtNum, MONO, SANS, SERIF } from "../lib/theme";
import { ExternalLink } from "lucide-react";
import { Panel, PanelHeader, MetricCell } from "../components/ui";
import AddBondForm from "../components/AddBondForm";
import { annualIncome, bondAnalytics, marketValue, nominalValue, tvSymbol, yearsToMaturity } from "../lib/bonds";
import { useChat } from "../ai/ChatProvider";

// Coarse rating buckets for sorting / coloring (lower = stronger credit).
const RATING_RANK = {
  "AAA": 1, "AA+": 2, "AA": 3, "AA-": 4, "A+": 5, "A": 6, "A-": 7,
  "BBB+": 8, "BBB": 9, "BBB-": 10, "BB+": 11, "BB": 12, "BB-": 13,
  "B+": 14, "B": 15, "B-": 16,
};
function ratingTone(r) {
  const rank = RATING_RANK[r] ?? 99;
  if (rank <= 7) return COLORS.up; // investment grade A and above
  if (rank <= 10) return COLORS.cyan; // BBB
  return COLORS.amber; // sub-IG
}

export default function Bonds({ bonds, onAddBond, onRefresh }) {
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const flashIds = useChat()?.flashIds; // rows the AI just changed

  const rows = useMemo(() => {
    return (bonds ?? [])
      .map((b) => {
        const price = Number(b.purchase_price ?? 100);
        const nominal = nominalValue(b);
        const mv = marketValue(b, price);
        const income = annualIncome(b);
        const years = yearsToMaturity(b.maturity_date);
        const a = bondAnalytics({ coupon: b.coupon_rate, ytm: b.purchase_yield, years, price });
        return {
          ...b,
          price,
          nominal,
          mv,
          income,
          years,
          premium: mv - nominal,
          ytm: b.purchase_yield != null ? Number(b.purchase_yield) : null,
          coupon: Number(b.coupon_rate ?? 0),
          modDuration: a.modDuration,
          convexity: a.convexity,
        };
      })
      .sort((x, y) => y.mv - x.mv);
  }, [bonds]);

  const totals = useMemo(() => {
    const nominal = rows.reduce((s, r) => s + r.nominal, 0);
    const mv = rows.reduce((s, r) => s + r.mv, 0);
    const income = rows.reduce((s, r) => s + r.income, 0);
    const wCoupon = mv ? rows.reduce((s, r) => s + r.coupon * (r.mv / mv), 0) : 0;
    const wYtm = mv ? rows.reduce((s, r) => s + (r.ytm ?? 0) * (r.mv / mv), 0) : 0;
    const wDur = mv ? rows.reduce((s, r) => s + (r.modDuration ?? 0) * (r.mv / mv), 0) : 0;
    const wMat = mv ? rows.reduce((s, r) => s + (r.years ?? 0) * (r.mv / mv), 0) : 0;
    return { nominal, mv, income, wCoupon, wYtm, wDur, wMat, premium: mv - nominal };
  }, [rows]);

  const ladder = useMemo(() => {
    const byYear = {};
    for (const r of rows) {
      if (r.years == null) continue;
      const yr = new Date(r.maturity_date).getFullYear();
      byYear[yr] = (byYear[yr] ?? 0) + r.nominal;
    }
    return Object.entries(byYear)
      .map(([year, nominal]) => ({ year, nominal }))
      .sort((a, b) => Number(a.year) - Number(b.year));
  }, [rows]);

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontFamily: SERIF, fontSize: 28, color: COLORS.text }}>Bonds</div>
        <button type="button" onClick={() => setShowAdd(true)} style={{ all: "unset", cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: "4px 8px", border: `1px solid ${COLORS.amberDim}`, color: COLORS.amber }}>+ BOND</button>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: COLORS.textDim, marginBottom: 18 }}>
        Fixed-income portfolio · prices are indicative (last evaluated/traded marks) — live reference via the chart in each bond's detail.
      </div>

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
        <Tile label="Holdings" value={String(rows.length)} />
        <Tile label="Total Nominal" value={`$${fmtMoney0(totals.nominal)}`} />
        <Tile label="Market Value" value={`$${fmtMoney0(totals.mv)}`} />
        <Tile label="Premium / Discount" value={`${totals.premium >= 0 ? "+" : "-"}$${fmtMoney0(Math.abs(totals.premium))}`} tone={totals.premium >= 0 ? COLORS.up : COLORS.down} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <Tile label="Annual Income" value={`$${fmtMoney0(totals.income)}`} tone={COLORS.up} />
        <Tile label="Wtd Avg Coupon" value={`${totals.wCoupon.toFixed(2)}%`} />
        <Tile label="Wtd Avg YTM" value={`${totals.wYtm.toFixed(2)}%`} />
        <Tile label="Wtd Avg Duration" value={`${totals.wDur.toFixed(1)} yrs`} />
      </div>

      {/* Holdings table */}
      <Panel style={{ marginBottom: 14 }}>
        <PanelHeader title="Holdings" right={`${rows.length} BONDS · WTD AVG MAT ${totals.wMat.toFixed(1)}Y`} />
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1040 }}>
            <div style={{ ...gridRow, color: COLORS.textMute, fontSize: 9, letterSpacing: 1.2, padding: "10px 16px" }}>
              <div>ISSUER</div>
              <div>ISIN</div>
              <div style={{ textAlign: "right" }}>COUPON</div>
              <div style={{ textAlign: "right" }}>MATURITY</div>
              <div style={{ textAlign: "center" }}>RATING</div>
              <div style={{ textAlign: "right" }}>NOMINAL</div>
              <div style={{ textAlign: "right" }}>PRICE</div>
              <div style={{ textAlign: "right" }}>MKT VALUE</div>
              <div style={{ textAlign: "right" }}>YTM</div>
              <div style={{ textAlign: "right" }}>DUR</div>
              <div style={{ textAlign: "right" }}>WT%</div>
            </div>
            {rows.map((r) => {
              const isSel = selected && r.id === selected.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{ ...gridRow, cursor: "pointer", background: isSel ? "rgba(245,165,36,0.06)" : "transparent", borderLeft: isSel ? `2px solid ${COLORS.amber}` : "2px solid transparent", ...(flashIds?.has(r.id) ? { animation: "fa-flash 2.4s ease-out" } : {}) }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = COLORS.panelHi; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ color: COLORS.text }}>{(r.name ?? r.identifier).split(" ").slice(0, 3).join(" ")}<div style={{ color: COLORS.textMute, fontSize: 9, textTransform: "uppercase" }}>{r.bond_type}</div></div>
                  <div style={{ color: COLORS.textDim, fontSize: 11 }}>{r.identifier}</div>
                  <div style={{ textAlign: "right" }}>{r.coupon.toFixed(2)}%</div>
                  <div style={{ textAlign: "right", color: COLORS.textDim }}>{r.maturity_date ? new Date(r.maturity_date).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "—"}</div>
                  <div style={{ textAlign: "center", color: ratingTone(r.rating) }}>{r.rating ?? "—"}</div>
                  <div style={{ textAlign: "right", color: COLORS.textDim }}>{fmtMoney0(r.nominal)}</div>
                  <div style={{ textAlign: "right" }}>{r.price.toFixed(2)}</div>
                  <div style={{ textAlign: "right" }}>{fmtMoney0(r.mv)}</div>
                  <div style={{ textAlign: "right", color: COLORS.amber }}>{r.ytm != null ? `${r.ytm.toFixed(2)}%` : "—"}</div>
                  <div style={{ textAlign: "right", color: COLORS.textDim }}>{fmtNum(r.modDuration, 1)}</div>
                  <div style={{ textAlign: "right", color: COLORS.textDim }}>{totals.mv ? ((r.mv / totals.mv) * 100).toFixed(1) : "0"}%</div>
                </div>
              );
            })}
            {!rows.length && <div style={{ padding: 16, color: COLORS.textDim, fontSize: 13 }}>No bonds yet. Click + BOND to add one.</div>}
          </div>
        </div>
      </Panel>

      {/* Ladder + detail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 14 }}>
        <Panel>
          <PanelHeader title="Maturity Ladder" right="NOMINAL BY YEAR" />
          <div style={{ height: 260, padding: "12px 8px" }}>
            {ladder.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ladder} margin={{ left: 8, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={COLORS.border} vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: COLORS.textDim, fontSize: 10, fontFamily: MONO }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.textMute, fontSize: 9, fontFamily: MONO }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.borderHi}`, fontFamily: MONO, fontSize: 11 }} labelStyle={{ color: COLORS.textDim }} formatter={(v) => `$${fmtMoney0(v)}`} cursor={{ fill: "rgba(245,165,36,0.06)" }} />
                  <Bar dataKey="nominal" radius={[2, 2, 0, 0]}>
                    {ladder.map((d) => <Cell key={d.year} fill={COLORS.amber} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: COLORS.textDim, fontSize: 13 }}>No maturities to show.</div>
            )}
          </div>
        </Panel>

        {selected && (
          <Panel>
            <PanelHeader title={selected.name ?? selected.identifier} right={selected.rating ?? ""} />
            <div style={{ padding: 14 }}>
              {tvSymbol(selected) && (
                <div style={{ marginBottom: 14 }}>
                  <a
                    href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol(selected))}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", textDecoration: "none", border: `1px solid ${COLORS.amberDim}`, background: "rgba(245,165,36,0.05)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,165,36,0.12)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(245,165,36,0.05)")}
                  >
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.amber, letterSpacing: 0.5 }}>View chart on TradingView</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 0.5, marginTop: 3 }}>{tvSymbol(selected)}</div>
                    </div>
                    <ExternalLink size={15} color={COLORS.amber} strokeWidth={1.5} />
                  </a>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                <MetricCell label="Coupon" value={`${selected.coupon.toFixed(3)}%`} />
                <MetricCell label="YTM" value={selected.ytm != null ? `${selected.ytm.toFixed(2)}%` : "—"} tone={COLORS.amber} />
                <MetricCell label="Current Yield" value={`${((selected.coupon / selected.price) * 100).toFixed(2)}%`} />
                <MetricCell label="Price" value={selected.price.toFixed(2)} />
                <MetricCell label="Nominal" value={`$${fmtMoney0(selected.nominal)}`} />
                <MetricCell label="Market Value" value={`$${fmtMoney0(selected.mv)}`} />
                <MetricCell label="Prem/Disc" value={`${selected.premium >= 0 ? "+" : "-"}$${fmtMoney0(Math.abs(selected.premium))}`} tone={selected.premium >= 0 ? COLORS.up : COLORS.down} />
                <MetricCell label="Mod Duration" value={`${fmtNum(selected.modDuration, 2)} yrs`} />
                <MetricCell label="Convexity" value={fmtNum(selected.convexity, 1)} />
                <MetricCell label="Years to Mat" value={`${fmtNum(selected.years, 1)}`} />
                <MetricCell label="Annual Income" value={`$${fmtMoney0(selected.income)}`} tone={COLORS.up} />
                <MetricCell label="Type" value={(selected.bond_type ?? "—").toUpperCase()} />
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: COLORS.textMute, marginTop: 12, lineHeight: 1.5 }}>
                ISIN {selected.identifier}. Duration & convexity computed from coupon, YTM and term (semi-annual). Price is an indicative mark; the chart above reflects the latest available TradingView reference.
              </div>
            </div>
          </Panel>
        )}
      </div>

      {showAdd && (
        <AddBondForm
          onClose={() => setShowAdd(false)}
          onSave={async (payload) => { await onAddBond(payload); onRefresh?.(); }}
        />
      )}
    </div>
  );
}

const gridRow = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1.1fr 0.7fr 0.9fr 0.7fr 1fr 0.7fr 1fr 0.7fr 0.6fr 0.6fr",
  padding: "11px 16px",
  fontFamily: MONO,
  fontSize: 12,
  color: COLORS.text,
  borderBottom: `1px solid ${COLORS.border}`,
  alignItems: "center",
};

function Tile({ label, value, tone }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, marginBottom: 5 }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, color: tone ?? COLORS.text }}>{value}</div>
    </div>
  );
}
