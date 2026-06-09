import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  LayoutDashboard,
  TrendingUp,
  Landmark,
  Bot,
  Briefcase,
  Settings,
  Search,
  Circle,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Sparkles,
  ChevronRight,
  Activity,
  AlertCircle,
} from "lucide-react";

/* ------------------------------------------------------------------
   FINANCE AI — Institutional Asset Management Terminal
   v0.1 POC · Demo build · Mock data layer (Bloomberg/B-pipe pending)
   ------------------------------------------------------------------ */

const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
`;

/* ----------------------------- MOCK DATA ---------------------------- */

const SEED_EQUITIES = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", price: 225.43, prev: 223.18, beta: 1.24, mcap: 3420, pe: 34.2, div: 0.44 },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Technology", price: 415.26, prev: 418.74, beta: 0.92, mcap: 3080, pe: 35.8, div: 0.72 },
  { ticker: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors", price: 132.65, prev: 128.91, beta: 1.71, mcap: 3260, pe: 65.4, div: 0.03 },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Communications", price: 168.22, prev: 167.05, beta: 1.04, mcap: 2080, pe: 24.6, div: 0.45 },
  { ticker: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Disc.", price: 185.94, prev: 187.32, beta: 1.18, mcap: 1950, pe: 47.1, div: 0.00 },
  { ticker: "META", name: "Meta Platforms", sector: "Communications", price: 572.11, prev: 564.83, beta: 1.28, mcap: 1450, pe: 28.3, div: 0.40 },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Consumer Disc.", price: 224.78, prev: 231.04, beta: 2.12, mcap: 718, pe: 76.5, div: 0.00 },
  { ticker: "BRK.B", name: "Berkshire Hathaway", sector: "Financials", price: 442.18, prev: 440.92, beta: 0.86, mcap: 955, pe: 11.2, div: 0.00 },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financials", price: 211.46, prev: 209.83, beta: 1.11, mcap: 605, pe: 12.4, div: 1.15 },
  { ticker: "V", name: "Visa Inc.", sector: "Financials", price: 281.93, prev: 280.04, beta: 0.95, mcap: 567, pe: 30.7, div: 0.59 },
  { ticker: "LLY", name: "Eli Lilly & Co.", sector: "Healthcare", price: 826.55, prev: 821.13, beta: 0.42, mcap: 786, pe: 78.9, div: 1.30 },
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy", price: 116.84, prev: 117.92, beta: 0.88, mcap: 461, pe: 14.1, div: 0.95 },
];

const SEED_BONDS = [
  { ticker: "US 3M", name: "US Treasury Bill 3M", yield: 4.32, bid: 99.18, ask: 99.20, dur: 0.25, rating: "AAA" },
  { ticker: "US 2Y", name: "US Treasury Note 2Y", yield: 4.18, bid: 99.04, ask: 99.07, dur: 1.92, rating: "AAA" },
  { ticker: "US 5Y", name: "US Treasury Note 5Y", yield: 4.12, bid: 98.21, ask: 98.24, dur: 4.61, rating: "AAA" },
  { ticker: "US 10Y", name: "US Treasury Note 10Y", yield: 4.28, bid: 97.42, ask: 97.46, dur: 8.74, rating: "AAA" },
  { ticker: "US 30Y", name: "US Treasury Bond 30Y", yield: 4.58, bid: 95.86, ask: 95.92, dur: 19.43, rating: "AAA" },
  { ticker: "AAPL 30", name: "Apple 3.85% 2043", yield: 5.12, bid: 88.34, ask: 88.41, dur: 12.18, rating: "AA+" },
  { ticker: "MSFT 50", name: "Microsoft 2.92% 2052", yield: 5.21, bid: 71.42, ask: 71.50, dur: 18.62, rating: "AAA" },
  { ticker: "JPM 28", name: "JPMorgan 4.49% 2028", yield: 4.86, bid: 99.18, ask: 99.24, dur: 3.41, rating: "A+" },
];

const YIELD_CURVE = [
  { tenor: "1M", yield: 4.36 },
  { tenor: "3M", yield: 4.32 },
  { tenor: "6M", yield: 4.24 },
  { tenor: "1Y", yield: 4.21 },
  { tenor: "2Y", yield: 4.18 },
  { tenor: "5Y", yield: 4.12 },
  { tenor: "7Y", yield: 4.19 },
  { tenor: "10Y", yield: 4.28 },
  { tenor: "20Y", yield: 4.51 },
  { tenor: "30Y", yield: 4.58 },
];

const INDICES = [
  { name: "S&P 500", price: 5824.13, chg: 0.42 },
  { name: "NASDAQ", price: 18573.94, chg: 0.68 },
  { name: "DOW", price: 42124.65, chg: -0.18 },
  { name: "RUSSELL 2K", price: 2218.41, chg: -0.34 },
  { name: "VIX", price: 14.62, chg: -2.81 },
  { name: "DXY", price: 103.84, chg: 0.12 },
  { name: "GOLD", price: 2738.50, chg: 0.74 },
  { name: "BRENT", price: 75.18, chg: -0.92 },
];

const PORTFOLIO = [
  { ticker: "AAPL", shares: 1200, cost: 178.42 },
  { ticker: "MSFT", shares: 800, cost: 312.16 },
  { ticker: "NVDA", shares: 4500, cost: 88.20 },
  { ticker: "BRK.B", shares: 300, cost: 398.55 },
  { ticker: "JPM", shares: 600, cost: 186.21 },
  { ticker: "V", shares: 450, cost: 245.80 },
];

/* ---------------------- Synthetic intraday series ---------------------- */
function buildIntraday(seed, points = 78) {
  const arr = [];
  let v = seed * 0.992;
  for (let i = 0; i < points; i++) {
    const drift = (Math.sin(i / 9) + Math.cos(i / 14) * 0.6) * 0.0015 * seed;
    const noise = (Math.random() - 0.5) * 0.003 * seed;
    v = v + drift + noise;
    arr.push({ t: i, v: Number(v.toFixed(2)) });
  }
  arr[arr.length - 1].v = seed;
  return arr;
}

/* ----------------------------- Helpers ------------------------------ */
const fmtMoney = (n) =>
  n >= 1e3
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(2);

const fmtPct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const fmtMcap = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)}T` : `${n}B`);

/* ------------------------- Color tokens (styles) ----------------------- */
const COLORS = {
  bg: "#000000",
  panel: "#0a0a0a",
  panelHi: "#111111",
  border: "#1a1a1a",
  borderHi: "#262626",
  text: "#e5e5e5",
  textDim: "#737373",
  textMute: "#525252",
  amber: "#f5a524",
  amberDim: "#7a4f0a",
  cyan: "#22d3ee",
  up: "#22c55e",
  down: "#ef4444",
};

/* =================== TOP STATUS BAR =================== */
function TopBar({ now }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 24,
            fontStyle: "italic",
            letterSpacing: 0.3,
            color: COLORS.text,
          }}
        >
          Finance<span style={{ color: COLORS.amber, fontStyle: "normal", fontWeight: 400 }}> AI</span>
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            padding: "3px 7px",
            border: `1px solid ${COLORS.amberDim}`,
            color: COLORS.amber,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          v0.1 · POC
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: COLORS.textDim,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Circle size={7} fill={COLORS.up} stroke="none" />
          <span style={{ color: COLORS.up, letterSpacing: 1 }}>NYSE OPEN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Circle size={7} fill={COLORS.amber} stroke="none" />
          <span style={{ color: COLORS.amber, letterSpacing: 1 }}>MOCK FEED</span>
        </div>
        <div style={{ color: COLORS.text, letterSpacing: 1 }}>
          {now.toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}{" "}
          ET
        </div>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: `1px solid ${COLORS.borderHi}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.amber,
            fontFamily: "'Instrument Serif', serif",
            fontSize: 14,
          }}
          title="Omer Yahya"
        >
          O
        </div>
      </div>
    </div>
  );
}

/* =================== SCROLLING TICKER TAPE =================== */
function TickerTape({ equities }) {
  const items = [...equities, ...equities]; // duplicate for seamless loop
  return (
    <div
      style={{
        overflow: "hidden",
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.panel,
        height: 32,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 26,
          alignItems: "center",
          whiteSpace: "nowrap",
          height: "100%",
          paddingLeft: 18,
          animation: "fa-marquee 120s linear infinite",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        }}
      >
        {items.map((s, i) => {
          const chg = ((s.price - s.prev) / s.prev) * 100;
          const up = chg >= 0;
          return (
            <span key={`${s.ticker}-${i}`} style={{ display: "inline-flex", gap: 8 }}>
              <span style={{ color: COLORS.text, fontWeight: 500 }}>{s.ticker}</span>
              <span style={{ color: COLORS.textDim }}>{fmtMoney(s.price)}</span>
              <span style={{ color: up ? COLORS.up : COLORS.down }}>
                {up ? "▲" : "▼"} {fmtPct(chg)}
              </span>
              <span style={{ color: COLORS.textMute }}>|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* =================== SIDEBAR =================== */
function Sidebar({ active, setActive }) {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "equities", label: "Equities", icon: TrendingUp },
    { key: "bonds", label: "Bonds", icon: Landmark },
    { key: "ai", label: "AI Analyst", icon: Bot },
    { key: "portfolio", label: "Portfolio", icon: Briefcase },
  ];
  return (
    <div
      style={{
        width: 200,
        borderRight: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
      }}
    >
      <div
        style={{
          padding: "0 18px 14px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          color: COLORS.textMute,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        Workspace
      </div>
      {items.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 18px",
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? COLORS.amber : COLORS.textDim,
              borderLeft: isActive ? `2px solid ${COLORS.amber}` : "2px solid transparent",
              background: isActive ? "rgba(245,165,36,0.05)" : "transparent",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = COLORS.text;
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = COLORS.textDim;
            }}
          >
            <Icon size={15} strokeWidth={1.6} />
            <span>{label}</span>
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <button
        onClick={() => setActive("settings")}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 18px",
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: 13,
          color: COLORS.textMute,
        }}
      >
        <Settings size={15} strokeWidth={1.6} />
        <span>Settings</span>
      </button>
      <div
        style={{
          padding: "12px 18px",
          borderTop: `1px solid ${COLORS.border}`,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          color: COLORS.textMute,
          letterSpacing: 1.5,
          lineHeight: 1.6,
        }}
      >
        BLOOMBERG B-PIPE
        <br />
        <span style={{ color: COLORS.amber }}>● PENDING LICENSE</span>
      </div>
    </div>
  );
}

/* =================== STAT TILE =================== */
function StatTile({ label, value, change, isPct }) {
  const up = change >= 0;
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
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          color: COLORS.textMute,
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 19,
          color: COLORS.text,
          fontWeight: 500,
        }}
      >
        {isPct ? `${value.toFixed(2)}%` : fmtMoney(value)}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
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
    </div>
  );
}

/* =================== PANEL HEADER =================== */
function PanelHeader({ title, right }) {
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
      <div
        style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 18,
          color: COLORS.text,
          letterSpacing: 0.3,
        }}
      >
        {title}
      </div>
      {right && (
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: COLORS.textDim,
            letterSpacing: 1,
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}

/* =================== DASHBOARD =================== */
function Dashboard({ equities, setActive, setSelected }) {
  const movers = useMemo(() => {
    const withChg = equities.map((s) => ({
      ...s,
      chg: ((s.price - s.prev) / s.prev) * 100,
    }));
    return {
      gainers: [...withChg].sort((a, b) => b.chg - a.chg).slice(0, 4),
      losers: [...withChg].sort((a, b) => a.chg - b.chg).slice(0, 4),
    };
  }, [equities]);

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 32,
            color: COLORS.text,
            fontStyle: "italic",
          }}
        >
          Good morning, Omer.
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 13,
            color: COLORS.textDim,
            marginTop: 4,
          }}
        >
          Markets are open. Treasury 10Y at 4.28%, VIX subdued at 14.62.
        </div>
      </div>

      {/* Indices grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {INDICES.map((idx) => (
          <StatTile key={idx.name} label={idx.name} value={idx.price} change={idx.chg} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        {/* Movers */}
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
          <PanelHeader title="Movers" right="INTRADAY · MOCK" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ borderRight: `1px solid ${COLORS.border}` }}>
              <div
                style={{
                  padding: "8px 16px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: COLORS.up,
                  letterSpacing: 1.5,
                }}
              >
                ▲ GAINERS
              </div>
              {movers.gainers.map((s) => (
                <MoverRow key={s.ticker} stock={s} onClick={() => { setSelected(s.ticker); setActive("equities"); }} />
              ))}
            </div>
            <div>
              <div
                style={{
                  padding: "8px 16px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: COLORS.down,
                  letterSpacing: 1.5,
                }}
              >
                ▼ LOSERS
              </div>
              {movers.losers.map((s) => (
                <MoverRow key={s.ticker} stock={s} onClick={() => { setSelected(s.ticker); setActive("equities"); }} />
              ))}
            </div>
          </div>
        </div>

        {/* AI suggestions */}
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
          <PanelHeader title="AI Briefing" right="GENERATED 6:42 AM" />
          <div style={{ padding: 16, fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, color: COLORS.text, lineHeight: 1.7 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <Sparkles size={14} color={COLORS.amber} style={{ marginTop: 4, flexShrink: 0 }} />
              <div>
                <span style={{ color: COLORS.amber }}>Semis</span> remain the marginal driver of index returns. NVDA leads on incremental AI capex guidance from hyperscalers.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <Sparkles size={14} color={COLORS.amber} style={{ marginTop: 4, flexShrink: 0 }} />
              <div>
                10Y/2Y spread at <span style={{ color: COLORS.text, fontFamily: "'JetBrains Mono', monospace" }}>+10 bps</span> — recently un-inverted. Watch duration positioning into FOMC.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Sparkles size={14} color={COLORS.amber} style={{ marginTop: 4, flexShrink: 0 }} />
              <div>
                Energy underperforming on Brent weakness. Refiner crack spreads compressing.
              </div>
            </div>
            <button
              onClick={() => setActive("ai")}
              style={{
                all: "unset",
                cursor: "pointer",
                marginTop: 18,
                padding: "8px 14px",
                border: `1px solid ${COLORS.amberDim}`,
                color: COLORS.amber,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: 1.2,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              OPEN AI ANALYST <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MoverRow({ stock, onClick }) {
  const chg = ((stock.price - stock.prev) / stock.prev) * 100;
  const up = chg >= 0;
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "9px 16px",
        borderTop: `1px solid ${COLORS.border}`,
        cursor: "pointer",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.panelHi)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color: COLORS.text }}>{stock.ticker}</span>
      <span style={{ color: up ? COLORS.up : COLORS.down }}>{fmtPct(chg)}</span>
    </div>
  );
}

/* =================== EQUITIES =================== */
function Equities({ equities, selected, setSelected }) {
  const stock = equities.find((s) => s.ticker === selected) || equities[0];
  const series = useMemo(() => buildIntraday(stock.price), [stock.ticker, stock.price]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "440px 1fr", height: "100%" }}>
      {/* Watchlist */}
      <div
        style={{
          borderRight: `1px solid ${COLORS.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <PanelHeader title="Watchlist" right={`${equities.length} INSTR · LIVE`} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr",
            padding: "8px 16px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: COLORS.textMute,
            letterSpacing: 1.5,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div>TICKER</div>
          <div style={{ textAlign: "right" }}>LAST</div>
          <div style={{ textAlign: "right" }}>CHG%</div>
          <div style={{ textAlign: "right" }}>MCAP</div>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {equities.map((s) => {
            const chg = ((s.price - s.prev) / s.prev) * 100;
            const up = chg >= 0;
            const isSel = s.ticker === stock.ticker;
            return (
              <div
                key={s.ticker}
                onClick={() => setSelected(s.ticker)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr",
                  padding: "10px 16px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  cursor: "pointer",
                  background: isSel ? "rgba(245,165,36,0.07)" : "transparent",
                  borderLeft: isSel ? `2px solid ${COLORS.amber}` : "2px solid transparent",
                  transition: "all 120ms",
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = COLORS.panel; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <div>
                  <div style={{ color: COLORS.text }}>{s.ticker}</div>
                  <div style={{ color: COLORS.textMute, fontSize: 9, marginTop: 2 }}>{s.sector}</div>
                </div>
                <div style={{ color: COLORS.text, textAlign: "right" }}>{fmtMoney(s.price)}</div>
                <div style={{ color: up ? COLORS.up : COLORS.down, textAlign: "right" }}>{fmtPct(chg)}</div>
                <div style={{ color: COLORS.textDim, textAlign: "right" }}>{fmtMcap(s.mcap)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <StockDetail stock={stock} series={series} />
      </div>
    </div>
  );
}

function StockDetail({ stock, series }) {
  const chg = stock.price - stock.prev;
  const chgPct = (chg / stock.prev) * 100;
  const up = chg >= 0;
  const rf = 4.28;
  const mrp = 5.0;
  const coe = rf + stock.beta * mrp;

  return (
    <div style={{ padding: 20, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 38, color: COLORS.text }}>
              {stock.ticker}
            </div>
            <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, color: COLORS.textDim }}>
              {stock.name} · {stock.sector}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 6 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 32, color: COLORS.text, fontWeight: 500 }}>
              {fmtMoney(stock.price)}
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 15,
                color: up ? COLORS.up : COLORS.down,
              }}
            >
              {up ? "+" : ""}{chg.toFixed(2)} ({fmtPct(chgPct)})
            </div>
          </div>
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            padding: "4px 8px",
            border: `1px solid ${COLORS.border}`,
            color: COLORS.textDim,
            letterSpacing: 1.5,
          }}
        >
          NASDAQ · USD · DELAYED
        </div>
      </div>

      {/* Chart */}
      <div
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          padding: "14px 8px 8px",
          marginBottom: 16,
          height: 260,
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series}>
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={up ? COLORS.up : COLORS.down} stopOpacity={0.25} />
                <stop offset="100%" stopColor={up ? COLORS.up : COLORS.down} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke={COLORS.border} vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis
              domain={["dataMin - 1", "dataMax + 1"]}
              tick={{ fill: COLORS.textMute, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
              axisLine={false}
              tickLine={false}
              orientation="right"
              width={60}
            />
            <Tooltip
              contentStyle={{
                background: COLORS.bg,
                border: `1px solid ${COLORS.borderHi}`,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
              }}
              labelStyle={{ color: COLORS.textDim }}
              itemStyle={{ color: COLORS.amber }}
            />
            <ReferenceLine y={stock.prev} stroke={COLORS.textMute} strokeDasharray="2 4" />
            <Area type="monotone" dataKey="v" stroke={up ? COLORS.up : COLORS.down} strokeWidth={1.6} fill="url(#chartGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        <MetricCell label="P/E" value={stock.pe.toFixed(1)} />
        <MetricCell label="Mkt Cap" value={fmtMcap(stock.mcap)} />
        <MetricCell label="Beta" value={stock.beta.toFixed(2)} />
        <MetricCell label="Div Yield" value={`${stock.div.toFixed(2)}%`} />
        <MetricCell label="Prev Close" value={fmtMoney(stock.prev)} />
        <MetricCell label="Day Range" value={`${(stock.price * 0.991).toFixed(2)}–${(stock.price * 1.008).toFixed(2)}`} />
        <MetricCell label="52W High" value={fmtMoney(stock.price * 1.18)} />
        <MetricCell label="Avg Vol" value={`${(stock.mcap / 8).toFixed(0)}M`} />
      </div>

      {/* Cost of equity callout */}
      <div
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          padding: 16,
        }}
      >
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: COLORS.amber,
            letterSpacing: 1.5,
            marginBottom: 10,
          }}
        >
          COST OF EQUITY · CAPM
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.text }}>
          <div>
            <span style={{ color: COLORS.textDim }}>Rf </span>
            {rf.toFixed(2)}%
          </div>
          <span style={{ color: COLORS.textMute }}>+</span>
          <div>
            <span style={{ color: COLORS.textDim }}>β </span>
            {stock.beta.toFixed(2)}
          </div>
          <span style={{ color: COLORS.textMute }}>×</span>
          <div>
            <span style={{ color: COLORS.textDim }}>MRP </span>
            {mrp.toFixed(2)}%
          </div>
          <span style={{ color: COLORS.textMute }}>=</span>
          <div style={{ color: COLORS.amber, fontSize: 18, fontWeight: 500 }}>
            {coe.toFixed(2)}%
          </div>
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 11,
            color: COLORS.textDim,
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          Risk-free rate from US 10Y Treasury. Market risk premium held at 5.00% per house assumption.
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          color: COLORS.textMute,
          letterSpacing: 1.5,
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: COLORS.text }}>
        {value}
      </div>
    </div>
  );
}

/* =================== BONDS =================== */
function Bonds({ bonds }) {
  return (
    <div style={{ display: "grid", gridTemplateRows: "320px 1fr", height: "100%" }}>
      {/* Yield curve */}
      <div style={{ padding: 20, borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, color: COLORS.text }}>
              US Treasury Yield Curve
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: COLORS.textDim, marginTop: 4, letterSpacing: 1 }}>
              SPOT · {new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <CurveStat label="10Y/2Y" value="+10 bps" />
            <CurveStat label="30Y/10Y" value="+30 bps" />
            <CurveStat label="3M/10Y" value="-4 bps" warn />
          </div>
        </div>
        <div style={{ height: 230 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={YIELD_CURVE} margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={COLORS.border} />
              <XAxis
                dataKey="tenor"
                tick={{ fill: COLORS.textDim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={{ stroke: COLORS.border }}
                tickLine={false}
              />
              <YAxis
                domain={[3.9, 4.8]}
                tick={{ fill: COLORS.textDim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v.toFixed(2)}%`}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.borderHi}`,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                }}
                labelStyle={{ color: COLORS.textDim }}
                itemStyle={{ color: COLORS.amber }}
                formatter={(v) => `${v.toFixed(2)}%`}
              />
              <Line
                type="monotone"
                dataKey="yield"
                stroke={COLORS.amber}
                strokeWidth={1.8}
                dot={{ fill: COLORS.amber, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bond table */}
      <div style={{ overflowY: "auto" }}>
        <PanelHeader title="Fixed Income Watchlist" right={`${bonds.length} INSTR · BID/ASK STREAMING`} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr 0.9fr 0.9fr 0.9fr 0.8fr 0.7fr",
            padding: "10px 18px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: COLORS.textMute,
            letterSpacing: 1.5,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div>TICKER</div>
          <div>DESCRIPTION</div>
          <div style={{ textAlign: "right" }}>YIELD</div>
          <div style={{ textAlign: "right" }}>BID</div>
          <div style={{ textAlign: "right" }}>ASK</div>
          <div style={{ textAlign: "right" }}>DUR</div>
          <div style={{ textAlign: "right" }}>RATING</div>
        </div>
        {bonds.map((b) => (
          <div
            key={b.ticker}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 2fr 0.9fr 0.9fr 0.9fr 0.8fr 0.7fr",
              padding: "11px 18px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: COLORS.text,
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            <div style={{ color: COLORS.amber }}>{b.ticker}</div>
            <div style={{ color: COLORS.textDim }}>{b.name}</div>
            <div style={{ textAlign: "right" }}>{b.yield.toFixed(2)}%</div>
            <div style={{ textAlign: "right", color: COLORS.up }}>{b.bid.toFixed(2)}</div>
            <div style={{ textAlign: "right", color: COLORS.down }}>{b.ask.toFixed(2)}</div>
            <div style={{ textAlign: "right", color: COLORS.textDim }}>{b.dur.toFixed(2)}</div>
            <div style={{ textAlign: "right", color: COLORS.textDim }}>{b.rating}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CurveStat({ label, value, warn }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: COLORS.textMute, letterSpacing: 1.5 }}>
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          color: warn ? COLORS.down : COLORS.text,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =================== AI ANALYST CHAT =================== */
const SYSTEM_PROMPT = `You are Finance AI — an institutional-grade equity research analyst and portfolio assistant built for asset managers. You are a technical, rigorous, no-fluff analyst writing for sophisticated buy-side users.

HOUSE ASSUMPTIONS (use unless the user overrides):
- Risk-free rate (Rf): 4.28% (current US 10Y Treasury — flag if user wants to update)
- Equity market risk premium (MRP): 5.00%
- Cost of equity via CAPM: Re = Rf + β · MRP
- WACC = (E/V)·Re + (D/V)·Rd·(1 − tax rate)
- For discounting in DCFs, always use WACC
- Default forecast horizon: 5 years explicit + terminal value
- Terminal growth (g): typically 2.0–2.5% unless justified otherwise

────────────────────────────────────────
STOCK PITCH FRAMEWORK (use this exact structure whenever the user asks for a pitch, valuation, or full analysis of a company):

1. THESIS — 3 to 4 punchy bullets. The elevator pitch.

2. BUSINESS OVERVIEW — segments, geographies, key revenue drivers, management quality, capital allocation track record.

3. INDUSTRY ANALYSIS — Porter's Five Forces
   For each force: rate Low / Medium / High and explain the driver.
   - Threat of new entrants (barriers: capital, regulation, scale, IP, brand)
   - Bargaining power of suppliers
   - Bargaining power of buyers
   - Threat of substitutes
   - Competitive rivalry (concentration, growth, differentiation)
   Synthesize: is this an attractive industry?

4. ACCOUNTING ADJUSTMENTS — earnings quality and red flags. Cover:
   - Revenue recognition aggressiveness (channel stuffing, bill-and-hold, % completion)
   - Operating lease capitalization (gross up assets and debt at PV of lease commitments)
   - R&D capitalization vs expensing
   - One-time / non-recurring items to normalize EBIT
   - Stock-based compensation — treat as real expense
   - Pension assumptions (discount rate, expected return on assets)
   - Off-balance-sheet vehicles, JVs, VIEs
   - Working capital quality — DSO, inventory days, payables stretching
   - Effective tax rate normalization
   - Goodwill / intangible impairment risk
   State each adjustment, the direction (increases/decreases reported earnings), and a rough magnitude.

5. FORECAST — 5-year explicit period, driver-based
   - Revenue: segment-level, volume × price where possible, with named drivers
   - Gross margin and EBIT margin trajectory with justification
   - Working capital as % of sales
   - Capex: split maintenance vs growth
   - D&A trajectory
   - Effective tax rate (normalized)
   Build Unlevered Free Cash Flow: EBIT(1−t) + D&A − Capex − ΔNWC

6. VALUATION — DCF
   - Show explicit WACC build: Re, Rd, E/V, D/V, tax rate
   - Project UFCF for years 1–5
   - Terminal value via Gordon growth: TV = UFCF₅ × (1+g) / (WACC − g)
   - Discount all cash flows to PV at WACC
   - Enterprise Value → equity value (subtract net debt, minorities; add cash, investments)
   - Implied share price vs current
   - Sensitivity table (WACC × terminal g, at minimum 3×3)

7. KEY RISKS — 3 to 5 risks (mix of cyclical, structural, idiosyncratic)

8. RECOMMENDATION — BUY / HOLD / SELL · Target price · Time horizon · Upside/downside vs current

────────────────────────────────────────
PORTFOLIO ALLOCATION questions: discuss in terms of strategic asset allocation, factor exposures (value, growth, quality, momentum, low-vol, size), concentration risk, and correlation. Reference modern portfolio theory where useful but stay practical.

COST OF CAPITAL questions: show every input. Always state Rf source, β source (regression window, frequency), MRP assumption. For WACC: show capital structure assumptions (book vs market), pre-tax cost of debt source (YTM on outstanding bonds), and marginal vs effective tax rate.

MACRO / SUPPLY CHAIN questions: discuss with named indicators (PMI, ISM, freight rates, container indices, commodity spreads, credit spreads, yield curve shape).

────────────────────────────────────────
HARD RULES:
- Be precise with numbers. Show calculations, not just outputs.
- When you do not have a live data source for a real company, label your numbers as illustrative estimates and recommend the user verify via the Bloomberg pipeline (pending integration).
- Use monospaced-style alignment for tables (just use plain text tables — they render fine).
- Institutional tone. Concise. No filler, no hedging language like "as an AI". Speak as an analyst on the desk.
- Acknowledge uncertainty in the right places — flag what is assumption vs. data.
- Never make up specific cited figures; if you estimate, say "est."
`;

const SUGGESTIONS = [
  "Calculate the cost of equity for NVDA",
  "Run a full stock pitch on Microsoft",
  "How should I think about portfolio allocation right now?",
  "What's the current state of semiconductor supply chains?",
];

function AIAnalyst() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Finance AI ready. I can help with portfolio allocation, cost of capital calculations, macro and supply-chain analysis, and full equity research pitches (Porter's 5 → accounting adjustments → forecast → DCF/WACC).\n\nDefault assumptions in use: Rf = 4.28% (10Y UST), MRP = 5.00%. Ask me anything.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send(text) {
    const userMsg = (text ?? input).trim();
    if (!userMsg || loading) return;
    const next = [...messages, { role: "user", content: userMsg }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = next.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });
      const data = await res.json();
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      setMessages((prev) => [...prev, { role: "assistant", content: text || "[no response]" }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error reaching model: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 20px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bot size={18} color={COLORS.amber} strokeWidth={1.5} />
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, color: COLORS.text }}>
            AI Analyst
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              padding: "3px 8px",
              border: `1px solid ${COLORS.amberDim}`,
              color: COLORS.amber,
              letterSpacing: 1.5,
              marginLeft: 8,
            }}
          >
            CLAUDE SONNET 4
          </div>
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: COLORS.textDim,
            letterSpacing: 1,
          }}
        >
          STOCK PITCH · PORTFOLIO · COST OF CAPITAL · MACRO
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 24px",
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          {messages.map((m, i) => (
            <Message key={i} msg={m} />
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
              <Avatar role="assistant" />
              <div style={{ display: "flex", gap: 4, alignItems: "center", paddingTop: 6 }}>
                <Dot delay={0} />
                <Dot delay={150} />
                <Dot delay={300} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div style={{ padding: "0 24px 12px" }}>
          <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "8px 14px",
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontSize: 12,
                  color: COLORS.textDim,
                  border: `1px solid ${COLORS.border}`,
                  transition: "all 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = COLORS.amber;
                  e.currentTarget.style.borderColor = COLORS.amberDim;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = COLORS.textDim;
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "14px 24px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask for a stock pitch, cost of equity, macro view…"
            style={{
              flex: 1,
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              padding: "12px 14px",
              color: COLORS.text,
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: 13,
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.amberDim)}
            onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{
              all: "unset",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              padding: "12px 18px",
              background: input.trim() && !loading ? COLORS.amber : "transparent",
              color: input.trim() && !loading ? COLORS.bg : COLORS.textMute,
              border: `1px solid ${input.trim() && !loading ? COLORS.amber : COLORS.border}`,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: 1.2,
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 150ms",
            }}
          >
            SEND <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ role }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 4,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isUser ? COLORS.panelHi : "transparent",
        border: `1px solid ${isUser ? COLORS.borderHi : COLORS.amberDim}`,
        color: isUser ? COLORS.text : COLORS.amber,
        fontFamily: isUser ? "'Instrument Serif', serif" : "inherit",
        fontSize: 14,
      }}
    >
      {isUser ? "O" : <Bot size={14} strokeWidth={1.5} />}
    </div>
  );
}

function Dot({ delay }) {
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: "50%",
        background: COLORS.amber,
        animation: `fa-pulse 1.2s ease-in-out ${delay}ms infinite`,
        display: "inline-block",
      }}
    />
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
      <Avatar role={msg.role} />
      <div
        style={{
          flex: 1,
          paddingTop: 4,
          fontFamily: isUser ? "'IBM Plex Sans', sans-serif" : "'IBM Plex Sans', sans-serif",
          fontSize: 13.5,
          color: isUser ? COLORS.text : COLORS.text,
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {!isUser && (
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9,
              color: COLORS.amber,
              letterSpacing: 1.5,
              marginBottom: 6,
            }}
          >
            FINANCE AI
          </div>
        )}
        <div>{msg.content}</div>
      </div>
    </div>
  );
}

/* =================== PORTFOLIO =================== */
function Portfolio({ equities }) {
  const rows = PORTFOLIO.map((p) => {
    const ref = equities.find((e) => e.ticker === p.ticker);
    const price = ref?.price ?? 0;
    const mv = price * p.shares;
    const cb = p.cost * p.shares;
    const pnl = mv - cb;
    const pnlPct = (pnl / cb) * 100;
    return { ...p, price, mv, cb, pnl, pnlPct, beta: ref?.beta ?? 0 };
  });
  const totalMV = rows.reduce((s, r) => s + r.mv, 0);
  const totalCB = rows.reduce((s, r) => s + r.cb, 0);
  const totalPnL = totalMV - totalCB;
  const totalPnLPct = (totalPnL / totalCB) * 100;
  const portfolioBeta =
    rows.reduce((s, r) => s + r.beta * (r.mv / totalMV), 0);

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, color: COLORS.text, marginBottom: 18 }}>
        Portfolio
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <StatTile label="MARKET VALUE" value={totalMV} change={totalPnLPct} />
        <StatTile label="COST BASIS" value={totalCB} change={0} />
        <StatTile label="UNREALIZED P&L" value={totalPnL} change={totalPnLPct} />
        <StatTile label="PORT BETA" value={portfolioBeta} change={0} isPct={false} />
      </div>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
        <PanelHeader title="Holdings" right={`${rows.length} POSITIONS`} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 0.8fr 0.9fr 0.9fr 1fr 1fr 0.9fr 0.7fr",
            padding: "10px 16px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: COLORS.textMute,
            letterSpacing: 1.5,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div>TICKER</div>
          <div style={{ textAlign: "right" }}>SHARES</div>
          <div style={{ textAlign: "right" }}>COST</div>
          <div style={{ textAlign: "right" }}>LAST</div>
          <div style={{ textAlign: "right" }}>MKT VAL</div>
          <div style={{ textAlign: "right" }}>P&L</div>
          <div style={{ textAlign: "right" }}>P&L %</div>
          <div style={{ textAlign: "right" }}>WT %</div>
        </div>
        {rows.map((r) => {
          const up = r.pnl >= 0;
          return (
            <div
              key={r.ticker}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 0.8fr 0.9fr 0.9fr 1fr 1fr 0.9fr 0.7fr",
                padding: "11px 16px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                color: COLORS.text,
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ color: COLORS.amber }}>{r.ticker}</div>
              <div style={{ textAlign: "right" }}>{r.shares.toLocaleString()}</div>
              <div style={{ textAlign: "right", color: COLORS.textDim }}>{fmtMoney(r.cost)}</div>
              <div style={{ textAlign: "right" }}>{fmtMoney(r.price)}</div>
              <div style={{ textAlign: "right" }}>{fmtMoney(r.mv)}</div>
              <div style={{ textAlign: "right", color: up ? COLORS.up : COLORS.down }}>
                {up ? "+" : ""}{fmtMoney(r.pnl)}
              </div>
              <div style={{ textAlign: "right", color: up ? COLORS.up : COLORS.down }}>
                {fmtPct(r.pnlPct)}
              </div>
              <div style={{ textAlign: "right", color: COLORS.textDim }}>
                {((r.mv / totalMV) * 100).toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.panel,
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: 12,
          color: COLORS.textDim,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <AlertCircle size={14} color={COLORS.amber} />
        Portfolio CSV upload &amp; rebalancing optimization arrive in v0.2.
      </div>
    </div>
  );
}

/* =================== SETTINGS =================== */
function SettingsView() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, color: COLORS.text, marginBottom: 18 }}>
        Settings
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        <SettingsCard title="House Assumptions">
          <Row k="Risk-free rate (Rf)" v="4.28% — US 10Y" />
          <Row k="Market risk premium" v="5.00%" />
          <Row k="Beta source" v="5Y monthly regression" />
          <Row k="Default forecast horizon" v="5 years explicit" />
          <Row k="Terminal growth" v="2.25%" />
        </SettingsCard>
        <SettingsCard title="Data Connections">
          <Row k="Bloomberg B-PIPE" v={<span style={{ color: COLORS.amber }}>Pending license</span>} />
          <Row k="Refinitiv Eikon" v={<span style={{ color: COLORS.textMute }}>Not configured</span>} />
          <Row k="FRED (macro)" v={<span style={{ color: COLORS.up }}>Mock active</span>} />
          <Row k="SEC EDGAR" v={<span style={{ color: COLORS.up }}>Mock active</span>} />
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({ title, children }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
      <PanelHeader title={title} />
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: `1px solid ${COLORS.border}`,
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: 13,
      }}
    >
      <span style={{ color: COLORS.textDim }}>{k}</span>
      <span style={{ color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{v}</span>
    </div>
  );
}

/* =================== STATUS BAR =================== */
function StatusBar() {
  return (
    <div
      style={{
        height: 26,
        borderTop: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        color: COLORS.textMute,
        letterSpacing: 1.5,
      }}
    >
      <div style={{ display: "flex", gap: 18 }}>
        <span><Activity size={9} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} color={COLORS.up} /> CONNECTED · MOCK</span>
        <span>LATENCY 0 MS</span>
        <span>LAST TICK 00:00.4S</span>
      </div>
      <div>
        FINANCE AI · OMER YAHYA · ROTMAN FIP
      </div>
    </div>
  );
}

/* =================== MAIN APP =================== */
export default function App() {
  const [active, setActive] = useState("dashboard");
  const [selected, setSelected] = useState("AAPL");
  const [equities, setEquities] = useState(SEED_EQUITIES);
  const [now, setNow] = useState(new Date());

  // simulate live price ticks
  useEffect(() => {
    const id = setInterval(() => {
      setEquities((prev) =>
        prev.map((s) => {
          const drift = (Math.random() - 0.5) * 0.0015 * s.price;
          const newPrice = Math.max(0.01, s.price + drift);
          return { ...s, price: Number(newPrice.toFixed(2)) };
        })
      );
      setNow(new Date());
    }, 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        minHeight: "100vh",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'IBM Plex Sans', sans-serif",
        overflow: "hidden",
      }}
    >
      <style>{`
        ${FONTS}
        @keyframes fa-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes fa-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: ${COLORS.bg}; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; }
        ::-webkit-scrollbar-thumb:hover { background: ${COLORS.borderHi}; }
        body { margin: 0; }
      `}</style>

      <TopBar now={now} />
      <TickerTape equities={equities} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar active={active} setActive={setActive} />
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {active === "dashboard" && (
            <Dashboard equities={equities} setActive={setActive} setSelected={setSelected} />
          )}
          {active === "equities" && (
            <Equities equities={equities} selected={selected} setSelected={setSelected} />
          )}
          {active === "bonds" && <Bonds bonds={SEED_BONDS} />}
          {active === "ai" && <AIAnalyst />}
          {active === "portfolio" && <Portfolio equities={equities} />}
          {active === "settings" && <SettingsView />}
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
