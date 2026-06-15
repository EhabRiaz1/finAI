import React, { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLORS, MONO } from "../lib/theme";

const NASDAQ_COLOR = "#a78bfa"; // violet — distinct from amber/cyan on the dark chart

// `days` slices the tail by trading-day count; `anchor` filters by a calendar
// date computed from the latest data point (so it works with seeded history).
const RANGES = [
  { key: "1D", days: 1 },
  { key: "1W", days: 5 },
  { key: "MTD", anchor: "mtd" },
  { key: "1M", days: 21 },
  { key: "YTD", anchor: "ytd" },
  { key: "1Y", days: 252 },
  { key: "All", anchor: "all" },
];

function sliceForRange(series, range) {
  const r = RANGES.find((x) => x.key === range);
  if (!r) return series;
  if (r.days != null) return series.slice(-r.days);
  if (r.anchor === "all") return series;
  const lastDate = series[series.length - 1].date; // "YYYY-MM-DD"
  const from = r.anchor === "mtd" ? `${lastDate.slice(0, 7)}-01` : `${lastDate.slice(0, 4)}-01-01`;
  return series.filter((d) => d.date >= from);
}

export default function PerformanceChart({ series, height = 280 }) {
  const [range, setRange] = useState("1Y");

  const data = useMemo(() => {
    if (!series?.length) return [];
    const sliced = sliceForRange(series, range);
    if (!sliced.length) return [];
    // Re-base to 0% from the start of the visible window.
    const p0 = sliced[0].portfolio || 1;
    const s0 = sliced[0].sp500 || 1;
    const q0 = sliced[0].nasdaq || 1;
    return sliced.map((d) => ({
      date: d.date,
      Portfolio: (d.portfolio / p0 - 1) * 100,
      "S&P 500": (d.sp500 / s0 - 1) * 100,
      NASDAQ: (d.nasdaq / q0 - 1) * 100,
    }));
  }, [series, range]);

  const last = data[data.length - 1];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "8px 12px 0" }}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            style={{
              all: "unset",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: 1,
              padding: "3px 8px",
              color: range === r.key ? COLORS.amber : COLORS.textMute,
              border: `1px solid ${range === r.key ? COLORS.amberDim : COLORS.border}`,
            }}
          >
            {r.key}
          </button>
        ))}
      </div>
      {last && (
        <div style={{ display: "flex", gap: 18, padding: "8px 12px 0", fontFamily: MONO, fontSize: 11 }}>
          <Legendish color={COLORS.amber} label="Portfolio" value={last.Portfolio} />
          <Legendish color={COLORS.cyan} label="S&P 500" value={last["S&P 500"]} />
          <Legendish color={NASDAQ_COLOR} label="NASDAQ" value={last.NASDAQ} />
        </div>
      )}
      <div style={{ height }}>
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
              <defs>
                <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.amber} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={COLORS.amber} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={COLORS.border} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: COLORS.textMute, fontSize: 9, fontFamily: MONO }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis tick={{ fill: COLORS.textMute, fontSize: 9, fontFamily: MONO }} axisLine={false} tickLine={false} orientation="right" width={46} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.borderHi}`, fontFamily: MONO, fontSize: 11 }}
                labelStyle={{ color: COLORS.textDim }}
                formatter={(v) => `${Number(v).toFixed(2)}%`}
              />
              <Area type="monotone" dataKey="Portfolio" stroke={COLORS.amber} strokeWidth={1.8} fill="url(#perfGrad)" dot={false} />
              <Line type="monotone" dataKey="S&P 500" stroke={COLORS.cyan} strokeWidth={1.4} dot={false} />
              <Line type="monotone" dataKey="NASDAQ" stroke={NASDAQ_COLOR} strokeWidth={1.4} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: COLORS.textDim, fontSize: 13 }}>
            Building performance history…
          </div>
        )}
      </div>
    </div>
  );
}

function Legendish({ color, label, value }) {
  const up = value >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 2, background: color, display: "inline-block" }} />
      <span style={{ color: COLORS.textDim }}>{label}</span>
      <span style={{ color: up ? COLORS.up : COLORS.down }}>{up ? "+" : ""}{value.toFixed(2)}%</span>
    </span>
  );
}
