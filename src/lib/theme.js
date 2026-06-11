/* ------------------------------------------------------------------
   Shared design tokens, fonts and formatting helpers.
   ------------------------------------------------------------------ */

export const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
`;

export const COLORS = {
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

export const MONO = "'JetBrains Mono', monospace";
export const SERIF = "'Instrument Serif', serif";
export const SANS = "'IBM Plex Sans', sans-serif";

export const fmtMoney = (n) => {
  const v = Number(n ?? 0);
  return Math.abs(v) >= 1e3
    ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toFixed(2);
};

export const fmtMoney0 = (n) =>
  Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const fmtPct = (n) => `${Number(n) >= 0 ? "+" : ""}${Number(n ?? 0).toFixed(2)}%`;

export const fmtMcap = (n) => (Number(n) >= 1000 ? `${(n / 1000).toFixed(2)}T` : `${Number(n ?? 0).toFixed(0)}B`);

export const fmtNum = (n, d = 2) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d));
