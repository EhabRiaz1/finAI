/* ------------------------------------------------------------------
   Fixed-income analytics for the Bonds page. Pure functions computing
   duration, convexity and yields from coupon / YTM / maturity.
   ------------------------------------------------------------------ */

export function yearsToMaturity(maturityDate, from = new Date()) {
  if (!maturityDate) return null;
  const m = new Date(maturityDate).getTime();
  const t = (m - from.getTime()) / (365.25 * 24 * 3600 * 1000);
  return t > 0 ? t : 0;
}

/**
 * Nominal (face) value of a holding. We store face_value per unit (e.g. 1000)
 * and quantity (number of units), so nominal = face_value * quantity.
 */
export function nominalValue(bond) {
  return Number(bond.face_value ?? 0) * Number(bond.quantity ?? 0);
}

/** Market value from a clean price quoted as % of par. */
export function marketValue(bond, price) {
  const px = price ?? Number(bond.purchase_price ?? 100);
  return (px / 100) * nominalValue(bond);
}

/** Annual coupon income in currency. */
export function annualIncome(bond) {
  return (Number(bond.coupon_rate ?? 0) / 100) * nominalValue(bond);
}

/**
 * Macaulay & modified duration and convexity for a level-coupon bond.
 * coupon/ytm are annual percentages; years is term to maturity; m = freq/yr.
 */
export function bondAnalytics({ coupon, ytm, years, price }, m = 2) {
  const c = Number(coupon);
  const y = Number(ytm);
  const T = Number(years);
  if (!Number.isFinite(c) || !Number.isFinite(y) || !Number.isFinite(T) || T <= 0) {
    return { macaulay: null, modDuration: null, convexity: null, currentYield: null };
  }
  const n = Math.max(1, Math.round(T * m));
  const cpp = c / m; // coupon per period, in % of par
  const yper = y / 100 / m; // periodic yield, decimal

  let pv = 0;
  let weightedT = 0;
  let convexSum = 0;
  for (let t = 1; t <= n; t++) {
    const cf = t === n ? cpp + 100 : cpp;
    const disc = Math.pow(1 + yper, t);
    const pvt = cf / disc;
    pv += pvt;
    weightedT += t * pvt;
    convexSum += pvt * t * (t + 1);
  }
  if (!pv) return { macaulay: null, modDuration: null, convexity: null, currentYield: null };

  const macaulayPeriods = weightedT / pv;
  const macaulay = macaulayPeriods / m; // in years
  const modDuration = macaulay / (1 + yper);
  const convexity = convexSum / (pv * Math.pow(1 + yper, 2) * m * m);
  const currentYield = price ? (c / price) * 100 : null;

  return { macaulay, modDuration, convexity, currentYield };
}

/** Map our stored TradingView symbol (in notes) to a usable widget symbol. */
export function tvSymbol(bond) {
  const note = bond.notes ?? "";
  const match = note.match(/[A-Z]+:[A-Z0-9.]+/i);
  return match ? match[0] : null;
}
