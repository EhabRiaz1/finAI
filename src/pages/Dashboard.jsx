import React, { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { COLORS, fmtMoney, fmtMoney0, fmtPct, MONO, SANS, SERIF } from "../lib/theme";
import { Panel, PanelHeader, StatTile } from "../components/ui";
import PerformanceChart from "../components/PerformanceChart";
import WatchlistCard from "../components/WatchlistCard";
import NewsList from "../components/NewsList";
import { usePerformance } from "../hooks/usePerformance";
import { useNews } from "../hooks/useNews";
import { marketValue as bondMarketValue } from "../lib/bonds";

export default function Dashboard({ equities, indices, holdings, bonds = [], balances, watchlist, name, setActive, setSelected }) {
  const quotesByTicker = useMemo(() => new Map(equities.map((e) => [e.ticker, e])), [equities]);
  const { series } = usePerformance(holdings);
  const { news } = useNews({ category: "general", limit: 7 });

  const rows = useMemo(() => {
    return holdings
      .map((h) => {
        const q = quotesByTicker.get(h.ticker);
        const price = q?.price ?? 0;
        const mv = price * Number(h.shares);
        const cb = Number(h.cost_per_share) * Number(h.shares);
        const pnl = mv - cb;
        return { ticker: h.ticker, sector: q?.sector ?? "—", shares: Number(h.shares), price, mv, cb, pnl, pnlPct: cb ? (pnl / cb) * 100 : 0 };
      })
      .sort((a, b) => b.mv - a.mv);
  }, [holdings, quotesByTicker]);

  const totalMV = rows.reduce((s, r) => s + r.mv, 0);
  const totalCB = rows.reduce((s, r) => s + r.cb, 0);
  const totalPnL = totalMV - totalCB;
  const cash = Number(balances?.cash ?? 0);
  const topPositions = rows.slice(0, 6);

  const bondsMV = useMemo(
    () => bonds.reduce((s, b) => s + bondMarketValue(b), 0),
    [bonds],
  );
  const grandTotal = totalMV + bondsMV;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (name || "").trim().split(/\s+/)[0] || "there";

  const valueCards = [
    { label: "Total Value", value: grandTotal, accent: COLORS.amber, sub: "Equities + Bonds" },
    { label: "Portfolio · Equities", value: totalMV, accent: COLORS.text, sub: `${rows.length} position${rows.length === 1 ? "" : "s"}` },
    { label: "Bonds", value: bondsMV, accent: COLORS.cyan, sub: `${bonds.length} holding${bonds.length === 1 ? "" : "s"}` },
  ];

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: SERIF, fontSize: 32, color: COLORS.text, fontStyle: "italic" }}>
          {greeting}, {firstName}.
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: COLORS.textDim, marginTop: 4 }}>
          Portfolio value ${fmtMoney(totalMV + cash)} · Unrealized P&L{" "}
          <span style={{ color: totalPnL >= 0 ? COLORS.up : COLORS.down }}>
            {totalPnL >= 0 ? "+" : ""}${fmtMoney0(totalPnL)} ({totalCB ? fmtPct((totalPnL / totalCB) * 100) : "0%"})
          </span>
        </div>
      </div>

      {/* Portfolio value breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        {valueCards.map((c) => (
          <div
            key={c.label}
            style={{ position: "relative", overflow: "hidden", background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "16px 18px" }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: c.accent, opacity: 0.7 }} />
            <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.5, textTransform: "uppercase" }}>
              {c.label}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 30, color: COLORS.text, marginTop: 8, lineHeight: 1 }}>
              ${fmtMoney0(c.value)}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: COLORS.textDim, letterSpacing: 0.5, marginTop: 8 }}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Market overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        {indices.length ? (
          indices.slice(0, 4).map((idx) => <StatTile key={idx.name} label={idx.name} value={idx.price} change={idx.chg} />)
        ) : (
          <div style={{ gridColumn: "1 / -1", color: COLORS.textDim, fontSize: 13, padding: 12 }}>Loading market overview…</div>
        )}
      </div>

      {/* Performance + portfolio snapshot */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 14 }}>
        <Panel>
          <PanelHeader title="My Performance" right="VS S&P 500 · NASDAQ" />
          <PerformanceChart series={series} />
        </Panel>
        <Panel>
          <PanelHeader title="My Top Positions" right={`${rows.length} HOLDINGS`} />
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr", padding: "8px 16px", fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, borderBottom: `1px solid ${COLORS.border}` }}>
            <div>TICKER</div>
            <div style={{ textAlign: "right" }}>MKT VAL</div>
            <div style={{ textAlign: "right" }}>WT%</div>
            <div style={{ textAlign: "right" }}>P&L%</div>
          </div>
          {topPositions.map((r) => {
            const up = r.pnl >= 0;
            return (
              <div
                key={r.ticker}
                onClick={() => { setSelected?.(r.ticker); setActive("research"); }}
                style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 0.9fr", padding: "10px 16px", fontFamily: MONO, fontSize: 12, borderBottom: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.panelHi)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ color: COLORS.amber }}>{r.ticker}</div>
                <div style={{ textAlign: "right", color: COLORS.text }}>{fmtMoney0(r.mv)}</div>
                <div style={{ textAlign: "right", color: COLORS.textDim }}>{totalMV ? ((r.mv / totalMV) * 100).toFixed(1) : "0"}%</div>
                <div style={{ textAlign: "right", color: up ? COLORS.up : COLORS.down }}>{fmtPct(r.pnlPct)}</div>
              </div>
            );
          })}
          {!topPositions.length && <div style={{ padding: 16, color: COLORS.textDim, fontSize: 13 }}>No positions yet.</div>}
        </Panel>
      </div>

      {/* Watchlist + trading news */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 14 }}>
        <WatchlistCard
          items={watchlist.items}
          quotesByTicker={quotesByTicker}
          onAdd={watchlist.add}
          onRemove={watchlist.remove}
          onSelect={(sym) => { setSelected?.(sym); setActive("research"); }}
        />
        <Panel style={{ display: "flex", flexDirection: "column" }}>
          <PanelHeader
            title="Trading News"
            right={<span onClick={() => setActive("news")} style={{ cursor: "pointer", color: COLORS.amber, display: "inline-flex", alignItems: "center", gap: 4 }}>MORE <ChevronRight size={12} /></span>}
          />
          <NewsList news={news} />
        </Panel>
      </div>
    </div>
  );
}
