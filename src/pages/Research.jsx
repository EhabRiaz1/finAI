import React, { useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { COLORS, fmtMcap, fmtMoney, fmtPct, MONO, SANS, SERIF } from "../lib/theme";
import { Panel, PanelHeader, MetricCell } from "../components/ui";
import { TVAdvancedChart, TVCompanyProfile, TVFundamentalData, TVScreener, TVSymbolInfo, TVTimeline } from "../components/TradingView";

export default function Research({ equities, holdings, watchlist, selected, setSelected }) {
  const [view, setView] = useState("quote"); // quote | financials | screener
  const [query, setQuery] = useState("");

  const quotesByTicker = useMemo(() => new Map(equities.map((e) => [e.ticker, e])), [equities]);

  const universe = useMemo(() => {
    const set = new Set([
      ...holdings.map((h) => h.ticker),
      ...watchlist.items.map((w) => w.symbol),
      ...equities.map((e) => e.ticker),
    ]);
    return Array.from(set).sort();
  }, [holdings, watchlist.items, equities]);

  const symbol = (selected || universe[0] || "AAPL").toUpperCase();
  const q = quotesByTicker.get(symbol);
  const held = holdings.find((h) => h.ticker === symbol);

  useEffect(() => {
    if (!selected && universe.length) setSelected(universe[0]);
  }, [selected, universe, setSelected]);

  const filtered = query
    ? universe.filter((s) => s.includes(query.toUpperCase()))
    : universe;

  function submitSearch(e) {
    e.preventDefault();
    if (query.trim()) {
      setSelected(query.trim().toUpperCase());
      setQuery("");
    }
  }

  const chg = q && q.prev ? ((q.price - q.prev) / q.prev) * 100 : 0;
  const up = chg >= 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "100%", overflow: "hidden" }}>
      {/* Symbol list */}
      <div style={{ borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <form onSubmit={submitSearch} style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 6, alignItems: "center" }}>
          <Search size={14} color={COLORS.textMute} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker…"
            style={{ flex: 1, background: "transparent", border: "none", color: COLORS.text, fontFamily: MONO, fontSize: 12, outline: "none" }}
          />
        </form>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.map((s) => {
            const qq = quotesByTicker.get(s);
            const c = qq && qq.prev ? ((qq.price - qq.prev) / qq.prev) * 100 : 0;
            const isSel = s === symbol;
            return (
              <div
                key={s}
                onClick={() => setSelected(s)}
                style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", cursor: "pointer", fontFamily: MONO, fontSize: 12, background: isSel ? "rgba(245,165,36,0.07)" : "transparent", borderLeft: isSel ? `2px solid ${COLORS.amber}` : "2px solid transparent" }}
              >
                <span style={{ color: isSel ? COLORS.amber : COLORS.text }}>{s}</span>
                <span style={{ color: qq ? (c >= 0 ? COLORS.up : COLORS.down) : COLORS.textMute }}>{qq ? fmtPct(c) : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <div style={{ fontFamily: SERIF, fontSize: 30, color: COLORS.text }}>{symbol}</div>
            {q && (
              <>
                <div style={{ fontFamily: MONO, fontSize: 22, color: COLORS.text }}>{fmtMoney(q.price)}</div>
                <div style={{ fontFamily: MONO, fontSize: 14, color: up ? COLORS.up : COLORS.down }}>{fmtPct(chg)}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: COLORS.textDim }}>{q.name} · {q.sector}</div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["quote", "financials", "screener"].map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ all: "unset", cursor: "pointer", padding: "6px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: view === v ? COLORS.amber : COLORS.textDim, border: `1px solid ${view === v ? COLORS.amberDim : COLORS.border}` }}>
                {v.toUpperCase()}
              </button>
            ))}
            <button
              onClick={() => (watchlist.has(symbol) ? null : watchlist.add(symbol))}
              style={{ all: "unset", cursor: "pointer", padding: "6px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: watchlist.has(symbol) ? COLORS.amber : COLORS.textDim, border: `1px solid ${watchlist.has(symbol) ? COLORS.amberDim : COLORS.border}`, display: "flex", alignItems: "center", gap: 5 }}
            >
              <Star size={12} fill={watchlist.has(symbol) ? COLORS.amber : "none"} /> {watchlist.has(symbol) ? "WATCHING" : "WATCH"}
            </button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: view === "screener" ? 0 : 18 }}>
          {view === "screener" && <TVScreener height={680} />}

          {view === "quote" && (
            <>
              <Panel style={{ marginBottom: 14 }}>
                <TVSymbolInfo symbol={symbol} />
                <TVAdvancedChart symbol={symbol} />
              </Panel>

              {/* Native quote stats from cached Finnhub data */}
              {q && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                  <MetricCell label="Last" value={fmtMoney(q.price)} />
                  <MetricCell label="Prev Close" value={fmtMoney(q.prev)} />
                  <MetricCell label="Change" value={fmtPct(chg)} tone={up ? COLORS.up : COLORS.down} />
                  <MetricCell label="Mkt Cap" value={q.mcap ? fmtMcap(q.mcap) : "—"} />
                  <MetricCell label="P/E" value={q.pe ? q.pe.toFixed(1) : "—"} />
                  <MetricCell label="Beta" value={q.beta ? q.beta.toFixed(2) : "—"} />
                  <MetricCell label="Div Yield" value={q.div ? `${q.div.toFixed(2)}%` : "—"} />
                  <MetricCell label="Day Range" value={`${(q.price * 0.99).toFixed(2)}–${(q.price * 1.01).toFixed(2)}`} />
                </div>
              )}

              {held && (
                <Panel style={{ marginBottom: 14, padding: 16 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.amber, letterSpacing: 1.5, marginBottom: 8 }}>YOUR POSITION</div>
                  <div style={{ display: "flex", gap: 28, fontFamily: MONO, fontSize: 13, color: COLORS.text }}>
                    <span><span style={{ color: COLORS.textDim }}>Shares </span>{Number(held.shares).toLocaleString()}</span>
                    <span><span style={{ color: COLORS.textDim }}>Avg Cost </span>{fmtMoney(held.cost_per_share)}</span>
                    {q && <span><span style={{ color: COLORS.textDim }}>Mkt Val </span>{fmtMoney(q.price * Number(held.shares))}</span>}
                    {q && <span style={{ color: q.price >= held.cost_per_share ? COLORS.up : COLORS.down }}>
                      P&L {fmtPct(((q.price - held.cost_per_share) / held.cost_per_share) * 100)}
                    </span>}
                  </div>
                </Panel>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Panel>
                  <PanelHeader title="About" />
                  <TVCompanyProfile symbol={symbol} />
                </Panel>
                <Panel>
                  <PanelHeader title="News & Events" />
                  <TVTimeline symbol={symbol} />
                </Panel>
              </div>
            </>
          )}

          {view === "financials" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <Panel>
                <PanelHeader title="Fundamentals" />
                <TVFundamentalData symbol={symbol} />
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
