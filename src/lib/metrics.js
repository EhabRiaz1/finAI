/* ------------------------------------------------------------------
   Portfolio risk/return analytics computed from daily price history.
   All functions are pure and operate on aligned daily return arrays.
   ------------------------------------------------------------------ */

const TRADING_DAYS = 252;

/** Daily simple returns from a price series (oldest -> newest). */
export function toReturns(prices) {
  const r = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev) r.push(prices[i] / prev - 1);
  }
  return r;
}

export function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

export function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

export function covariance(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(-n));
  const mb = mean(b.slice(-n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[a.length - n + i] - ma) * (b[b.length - n + i] - mb);
  return s / (n - 1);
}

/** Beta of asset returns vs benchmark returns. */
export function beta(assetRet, benchRet) {
  const varB = stdev(benchRet) ** 2;
  if (!varB) return 0;
  return covariance(assetRet, benchRet) / varB;
}

/**
 * CAPM expected (required) annual return: Re = Rf + beta*(Rm - Rf),
 * where Rm is the realized annualized benchmark return over the window.
 * rf is an annual rate, e.g. 0.0428.
 */
export function capm(assetRet, benchRet, rf = 0.0428) {
  const b = beta(assetRet, benchRet);
  const rm = mean(benchRet) * TRADING_DAYS;
  return rf + b * (rm - rf);
}

/** Annualized Jensen's alpha = realized return minus CAPM expected return. */
export function alpha(assetRet, benchRet, rf = 0.0428) {
  const ra = mean(assetRet) * TRADING_DAYS;
  return ra - capm(assetRet, benchRet, rf);
}

/** Annualized volatility. */
export function volatility(assetRet) {
  return stdev(assetRet) * Math.sqrt(TRADING_DAYS);
}

/** Annualized Sharpe ratio. */
export function sharpe(assetRet, rf = 0.0428) {
  const vol = stdev(assetRet);
  if (!vol) return 0;
  const excessDaily = mean(assetRet) - rf / TRADING_DAYS;
  return (excessDaily / vol) * Math.sqrt(TRADING_DAYS);
}

/** Max drawdown from a cumulative-value (or normalized return) series. */
export function maxDrawdown(values) {
  if (values.length < 2) return 0;
  let peak = values[0];
  let mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak ? (v - peak) / peak : 0;
    if (dd < mdd) mdd = dd;
  }
  return mdd;
}

/** Build a normalized (base 100) cumulative series from returns. */
export function cumulative(returns, base = 100) {
  const out = [base];
  let v = base;
  for (const r of returns) {
    v *= 1 + r;
    out.push(v);
  }
  return out;
}

/**
 * Compute a full metric set for a position/portfolio given aligned price arrays.
 * prices and bench are arrays of daily closes (oldest -> newest).
 */
export function computeMetrics(prices, bench, rf = 0.0428) {
  if (!prices || prices.length < 5) return null;
  const aRet = toReturns(prices);
  const bRet = bench && bench.length >= 5 ? toReturns(bench) : [];
  const cum = cumulative(aRet);
  return {
    beta: bRet.length ? beta(aRet, bRet) : null,
    alpha: bRet.length ? alpha(aRet, bRet, rf) : null,
    capm: bRet.length ? capm(aRet, bRet, rf) : null,
    volatility: volatility(aRet),
    sharpe: sharpe(aRet, rf),
    maxDrawdown: maxDrawdown(cum),
    totalReturn: prices[prices.length - 1] / prices[0] - 1,
  };
}
