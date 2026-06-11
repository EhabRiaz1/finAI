import React, { useMemo, useState } from "react";
import { COLORS, MONO, SERIF } from "../lib/theme";
import { Panel, PanelHeader } from "../components/ui";
import NewsList from "../components/NewsList";
import { useNews } from "../hooks/useNews";

export default function PortfolioNews({ holdings, equities }) {
  const [tab, setTab] = useState("holdings"); // holdings | market
  const [sector, setSector] = useState("All");

  const quotesByTicker = useMemo(() => new Map(equities.map((e) => [e.ticker, e])), [equities]);
  const heldSymbols = useMemo(() => holdings.map((h) => h.ticker), [holdings]);

  const sectorMap = useMemo(() => {
    const map = {};
    for (const h of holdings) {
      const sec = quotesByTicker.get(h.ticker)?.sector ?? "—";
      if (!map[sec]) map[sec] = [];
      map[sec].push(h.ticker);
    }
    return map;
  }, [holdings, quotesByTicker]);

  const sectors = ["All", ...Object.keys(sectorMap).sort()];

  const { news: holdingsNews } = useNews({ category: "company", symbols: heldSymbols.length ? heldSymbols : ["__none__"], limit: 80 });
  const { news: marketNews } = useNews({ category: "general", limit: 40 });

  const filteredHoldingsNews = useMemo(() => {
    if (sector === "All") return holdingsNews;
    const syms = new Set(sectorMap[sector] ?? []);
    return holdingsNews.filter((n) => syms.has(n.symbol));
  }, [holdingsNews, sector, sectorMap]);

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: SERIF, fontSize: 28, color: COLORS.text }}>Portfolio News</div>
        <div style={{ display: "flex", gap: 4 }}>
          {[["holdings", "My Holdings"], ["market", "Market"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ all: "unset", cursor: "pointer", padding: "6px 14px", fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: tab === k ? COLORS.amber : COLORS.textDim, borderBottom: `2px solid ${tab === k ? COLORS.amber : "transparent"}` }}>
              {label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {tab === "holdings" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => setSector(s)}
              style={{ all: "unset", cursor: "pointer", padding: "5px 12px", fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, color: sector === s ? COLORS.amber : COLORS.textDim, border: `1px solid ${sector === s ? COLORS.amberDim : COLORS.border}` }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <Panel>
        <PanelHeader
          title={tab === "holdings" ? `Holdings News${sector !== "All" ? ` · ${sector}` : ""}` : "Market News"}
          right={tab === "holdings" ? `${heldSymbols.length} TICKERS` : "GENERAL"}
        />
        <NewsList
          news={tab === "holdings" ? filteredHoldingsNews : marketNews}
          emptyLabel={tab === "holdings" ? "No recent news for your holdings — refresh market data to pull the latest." : "No market news yet."}
        />
      </Panel>
    </div>
  );
}
