import React, { useEffect, useMemo, useState } from "react";
import { Phone, Search, Sparkles, Star } from "lucide-react";
import { COLORS, fmtMcap, fmtMoney, fmtPct, MONO, SANS, SERIF } from "../lib/theme";
import { Panel, PanelHeader, MetricCell } from "../components/ui";
import { TVAdvancedChart, TVCompanyProfile, TVFundamentalData, TVScreener, TVSymbolInfo } from "../components/TradingView";
import NewsList from "../components/NewsList";
import { useChat } from "../ai/ChatProvider";
import { useNews } from "../hooks/useNews";
import { useStockRatings } from "../hooks/useStockRatings";
import { useQuoteLookup } from "../hooks/useQuoteLookup";

export default function Research({ equities, holdings, watchlist, selected, setSelected }) {
  const [view, setView] = useState("quote"); // quote | financials | screener
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState([]); // tickers searched this session
  const [analyzing, setAnalyzing] = useState(false);

  const { analyzeStock, streaming } = useChat();
  const { ratingFor, reload: reloadRatings } = useStockRatings();
  const { quotes: lookedUp, lookup } = useQuoteLookup();

  const cachedQuotes = useMemo(() => new Map(equities.map((e) => [e.ticker, e])), [equities]);

  // Merge cached quotes with on-demand lookups so any opened ticker shows a
  // name + day-change %, not just the ones already tracked in the cache.
  const quotesByTicker = useMemo(() => {
    const m = new Map(cachedQuotes);
    for (const [sym, lu] of Object.entries(lookedUp)) {
      if (lu?.found && !m.has(sym)) {
        m.set(sym, { ticker: sym, name: lu.name, sector: lu.sector, price: lu.price, prev: lu.prev_close, mcap: lu.mcap });
      }
    }
    return m;
  }, [cachedQuotes, lookedUp]);

  const universe = useMemo(() => {
    const set = new Set([
      ...holdings.map((h) => h.ticker),
      ...watchlist.items.map((w) => w.symbol),
      ...equities.map((e) => e.ticker),
      ...recent,
    ]);
    return Array.from(set).sort();
  }, [holdings, watchlist.items, equities, recent]);

  const symbol = (selected || universe[0] || "AAPL").toUpperCase();
  const q = quotesByTicker.get(symbol);
  const held = holdings.find((h) => h.ticker === symbol);
  const rating = ratingFor(symbol);

  // Fetch a quote for the open symbol when it isn't in the cache.
  useEffect(() => {
    if (symbol && !cachedQuotes.has(symbol)) lookup(symbol);
  }, [symbol, cachedQuotes, lookup]);

  // Per-symbol company news (Finnhub-cached); fall back to general market news.
  const { news: symbolNews } = useNews({ category: "company", symbols: [symbol], limit: 30 });
  const { news: generalNews } = useNews({ category: "general", limit: 30 });
  const eventsNews = symbolNews.length ? symbolNews : generalNews;

  useEffect(() => {
    if (!selected && universe.length) setSelected(universe[0]);
  }, [selected, universe, setSelected]);

  const upperQuery = query.trim().toUpperCase();
  const filtered = query ? universe.filter((s) => s.includes(upperQuery)) : universe;
  const noExactMatch = upperQuery && !universe.includes(upperQuery);
  const queryName = lookedUp[upperQuery]?.found ? lookedUp[upperQuery].name : null;

  // Look up the typed ticker (debounced) so the "View …" row can show its name.
  useEffect(() => {
    if (!noExactMatch) return;
    const t = setTimeout(() => lookup(upperQuery), 350);
    return () => clearTimeout(t);
  }, [upperQuery, noExactMatch, lookup]);

  function pick(sym) {
    const t = (sym ?? "").trim().toUpperCase();
    if (!t) return;
    setSelected(t);
    setRecent((r) => (r.includes(t) ? r : [t, ...r]));
    setQuery("");
  }

  function submitSearch(e) {
    e.preventDefault();
    if (query.trim()) pick(query);
  }

  async function runAnalysis() {
    if (analyzing || streaming) return;
    setAnalyzing(true);
    try {
      await analyzeStock(symbol);
      await reloadRatings();
    } finally {
      setAnalyzing(false);
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
            placeholder="Search any ticker…"
            style={{ flex: 1, background: "transparent", border: "none", color: COLORS.text, fontFamily: MONO, fontSize: 12, outline: "none" }}
          />
        </form>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {noExactMatch && (
            <div
              onClick={() => pick(upperQuery)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", borderBottom: `1px solid ${COLORS.border}`, background: "rgba(245,165,36,0.05)" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: COLORS.amber }}>View {upperQuery}</div>
                {queryName && <div style={{ fontFamily: SANS, fontSize: 10.5, color: COLORS.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{queryName}</div>}
              </div>
              <span style={{ color: COLORS.textMute, fontFamily: MONO, fontSize: 12, flexShrink: 0 }}>→</span>
            </div>
          )}
          {filtered.map((s) => {
            const qq = quotesByTicker.get(s);
            const c = qq && qq.prev ? ((qq.price - qq.prev) / qq.prev) * 100 : 0;
            const isSel = s === symbol;
            return (
              <div
                key={s}
                onClick={() => pick(s)}
                style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", cursor: "pointer", fontFamily: MONO, fontSize: 12, background: isSel ? "rgba(245,165,36,0.07)" : "transparent", borderLeft: isSel ? `2px solid ${COLORS.amber}` : "2px solid transparent" }}
              >
                <span style={{ color: isSel ? COLORS.amber : COLORS.text }}>{s}</span>
                <span style={{ color: qq ? (c >= 0 ? COLORS.up : COLORS.down) : COLORS.textMute }}>{qq ? fmtPct(c) : "—"}</span>
              </div>
            );
          })}
          {!filtered.length && !noExactMatch && (
            <div style={{ padding: "14px", color: COLORS.textDim, fontFamily: SANS, fontSize: 12 }}>No matches.</div>
          )}
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
              {rating && <RecommendationBadge rating={rating} />}

              <Panel style={{ marginBottom: 14, overflow: "hidden" }}>
                <TVSymbolInfo symbol={symbol} height={92} />
              </Panel>

              <Panel style={{ marginBottom: 14, overflow: "hidden" }}>
                <TVAdvancedChart symbol={symbol} height={760} />
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
                <Panel style={{ height: 460, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <PanelHeader title="About" right={q?.sector ?? ""} />
                  {q && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}` }}>
                      <MiniStat label="Mkt Cap" value={q.mcap ? fmtMcap(q.mcap) : "—"} />
                      <MiniStat label="P/E" value={q.pe ? q.pe.toFixed(1) : "—"} />
                      <MiniStat label="Beta" value={q.beta ? q.beta.toFixed(2) : "—"} />
                      <MiniStat label="Div Yield" value={q.div ? `${q.div.toFixed(2)}%` : "—"} />
                    </div>
                  )}
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <TVCompanyProfile symbol={symbol} height="100%" />
                  </div>
                </Panel>
                <Panel style={{ height: 460, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <PanelHeader title="News & Events" right={symbolNews.length ? symbol : "MARKET"} />
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                    <NewsList news={eventsNews} emptyLabel={`No recent news for ${symbol}.`} />
                  </div>
                </Panel>
              </div>

              {/* Ask Finance AI · or call a FinanceAI-approved advisor */}
              <div style={{ marginTop: 18, paddingBottom: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "stretch" }}>
                  <button
                    onClick={runAnalysis}
                    disabled={analyzing || streaming}
                    style={{ ...ctaBtn(COLORS.amber), cursor: analyzing || streaming ? "wait" : "pointer", background: "rgba(245,165,36,0.06)" }}
                    onMouseEnter={(e) => { if (!analyzing && !streaming) e.currentTarget.style.background = "rgba(245,165,36,0.14)"; }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(245,165,36,0.06)")}
                  >
                    <Sparkles size={20} />
                    <span>{analyzing ? `Analyzing ${symbol}…` : `What does Finance AI think of ${symbol}?`}</span>
                  </button>

                  <a
                    href="tel:+14019992799"
                    style={{ ...ctaBtn(COLORS.cyan), textDecoration: "none", background: "rgba(34,211,238,0.06)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(34,211,238,0.14)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(34,211,238,0.06)")}
                  >
                    <Phone size={19} />
                    <span>Talk to a FinanceAI-approved financial advisor</span>
                  </a>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 8 }}>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: COLORS.textMute, textAlign: "center" }}>
                    Opens a deep-dive in the AI panel and saves a Buy / Hold / Sell verdict.
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: COLORS.textMute, textAlign: "center" }}>
                    Connects you to a licensed advisor · +1 (401) 999-2799
                  </div>
                </div>
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

const RATING_TONE = { BUY: COLORS.up, HOLD: COLORS.amber, SELL: COLORS.down };

function RecommendationBadge({ rating }) {
  const tone = RATING_TONE[rating.rating] ?? COLORS.amber;
  const when = rating.updated_at
    ? new Date(rating.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", marginBottom: 14, border: `1px solid ${tone}`, background: `${tone}14` }}
    >
      <Sparkles size={16} color={tone} />
      <div style={{ fontFamily: SANS, fontSize: 13.5, color: COLORS.text }}>
        Finance AI recommends{" "}
        <span style={{ fontFamily: MONO, fontWeight: 700, letterSpacing: 1, color: tone }}>{rating.rating}</span>
      </div>
      {when && <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: COLORS.textMute, letterSpacing: 0.5 }}>{when}</div>}
    </div>
  );
}

// Shared style for the two equal call-to-action buttons (AI / advisor).
function ctaBtn(color) {
  return {
    all: "unset",
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    textAlign: "center",
    padding: "20px 18px",
    border: `1px solid ${color}`,
    color,
    fontFamily: SERIF,
    fontStyle: "italic",
    fontSize: 19,
    lineHeight: 1.2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  };
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 8.5, color: COLORS.textMute, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: COLORS.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}
