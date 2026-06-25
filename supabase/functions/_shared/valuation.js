/* ------------------------------------------------------------------
   DETERMINISTIC VALUATION ENGINE  (pure ESM JavaScript, AI-free)

   Runs unchanged in the Deno edge runtime AND under Node (for tests).
   The AI never computes these numbers — it only writes narrative around
   the locked ReportModel this module returns. Every figure here is
   reproducible from the input `Fundamentals` + `assumptions`.

   Methodology mirrors the source Business Analysis & Valuation report:
     - Abnormal Earnings (residual income) as the primary method
     - DCF cross-check (UFCF = NOPAT - ΔWorkingCapital, D&A ≈ Capex)
     - Trading multiples (forward P/E, EV/EBITDA) + peer comps
     - ROE mean-reversion scenarios (10-year residual income)
     - WACC × terminal-growth sensitivity grid
   All money figures are in millions of the reporting currency unless noted.
   ------------------------------------------------------------------ */

/** Sectors where the AE/DCF/EV-EBITDA framework is structurally invalid.
 *  The engine refuses to emit a target for these (see sectorGate). */
const EXCLUDED_SECTOR_RX =
  /(bank|insurance|insurer|reit|real estate|capital markets|thrift|mortgage)/i;

export const DEFAULT_ASSUMPTIONS = {
  marketRiskPremium: 0.055, // BAV course standard (mature-market premium)
  pretaxCostOfDebt: null, // default: riskFreeRate + 0.016 corporate spread
  corporateSpread: 0.016,
  taxRate: 0.2, // statutory, deliberately conservative
  terminalGrowth: 0.025,
  forecastYears: 5,
  y1Growth: null, // default: analyst consensus, else last-year growth
  operatingMargin: null, // default: trailing 3-yr average
  netMargin: null, // default: trailing 3-yr average
  capexPctRevenue: 0.3,
  wcPctDeltaRevenue: 0.1,
  terminalPE: 22,
  terminalEvEbitda: 15,
  industryMedianRoe: 0.15,
  retention: 1.0, // clean-surplus: payout is value-neutral under AE
  roeReversionYears: 10,
  // Recommendation bands on implied upside vs current price (model signal).
  buyThreshold: 0.15,
  sellThreshold: -0.15,
};

/* ----------------------------- helpers ----------------------------- */

const last = (a) => (Array.isArray(a) && a.length ? a[a.length - 1] : null);
const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const safeDiv = (a, b) => (b ? a / b : null);
/** Trailing n-year average of an array (uses the last n finite values). */
function trailingAvg(arr, n) {
  const vals = (arr ?? []).map(num).filter((v) => v != null);
  if (!vals.length) return null;
  const slice = vals.slice(-n);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}
const round = (v, d = 2) => {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

/* --------------------------- sector gate --------------------------- */

export function sectorGate(f) {
  const sector = String(f?.sector ?? "");
  const ni = last(f?.netIncome);
  const rev = last(f?.revenue);
  if (EXCLUDED_SECTOR_RX.test(sector)) {
    return { ok: false, reason: `Sector "${sector}" requires a financials-specific valuation method (P/B, excess-return, embedded value) that this engine does not implement.` };
  }
  if (ni != null && ni <= 0) {
    return { ok: false, reason: "Trailing net income is zero or negative — the residual-income and earnings-multiple methods are not meaningful." };
  }
  if (rev != null && rev <= 0) {
    return { ok: false, reason: "No positive revenue — pre-revenue companies are out of scope for this model." };
  }
  return { ok: true };
}

/* ------------------------- cost of capital ------------------------- */

export function costOfCapital(f, a) {
  const rf = num(f.riskFreeRate) ?? 0.0428;
  const beta = num(f.beta) ?? 1.0;
  const mrp = num(a.marketRiskPremium);
  const ke = rf + beta * mrp;
  const taxRate = num(a.taxRate);
  const pretaxKd = num(a.pretaxCostOfDebt) ?? rf + num(a.corporateSpread);
  const kdAfterTax = pretaxKd * (1 - taxRate);

  const shares = num(f.sharesOut);
  const price = num(f.price);
  const mcap = shares != null && price != null ? shares * price : null;
  const debt = num(f.totalDebt != null ? last(f.totalDebt) ?? f.totalDebt : null) ?? num(last(f.totalDebt)) ?? 0;
  const totalCap = (mcap ?? 0) + (debt ?? 0);
  const wE = totalCap ? (mcap ?? 0) / totalCap : 1;
  const wD = totalCap ? (debt ?? 0) / totalCap : 0;
  const wacc = wE * ke + wD * kdAfterTax;

  return { rf, beta, mrp, ke, pretaxKd, kdAfterTax, taxRate, mcap, debt, wE, wD, wacc };
}

/* --------------------------- net debt ------------------------------ */

function resolveNetDebt(f) {
  if (f.netDebt != null) return num(f.netDebt);
  const debt = num(last(f.totalDebt));
  const cash = num(last(f.cashAndSTInvest));
  if (debt == null && cash == null) return null;
  return (debt ?? 0) - (cash ?? 0);
}

/* ------------------------- historical block ------------------------ */

export function historical(f) {
  const years = f.years ?? [];
  const rev = (f.revenue ?? []).map(num);
  const ni = (f.netIncome ?? []).map(num);
  const assets = (f.totalAssets ?? []).map(num);
  const equity = (f.totalEquity ?? []).map(num);

  const pct = (a, b) => (a != null && b ? a / b : null);
  const grossMargin = years.map((_, i) => pct(num(f.grossProfit?.[i]), rev[i]));
  const operatingMargin = years.map((_, i) => pct(num(f.operatingIncome?.[i]), rev[i]));
  const ebitdaMargin = years.map((_, i) => pct(num(f.ebitda?.[i]), rev[i]));
  const netMargin = years.map((_, i) => pct(ni[i], rev[i]));
  const effectiveTax = years.map((_, i) =>
    pct(num(f.incomeTaxExpense?.[i]), num(f.pretaxIncome?.[i])),
  );
  const revenueGrowth = years.map((_, i) => (i === 0 || !rev[i - 1] ? null : rev[i] / rev[i - 1] - 1));

  // DuPont uses average balances (avg of consecutive year-ends).
  const avg = (arr, i) => (i === 0 || arr[i] == null || arr[i - 1] == null ? arr[i] ?? null : (arr[i] + arr[i - 1]) / 2);
  const dupont = years.map((_, i) => {
    const avgAssets = avg(assets, i);
    const avgEquity = avg(equity, i);
    const nm = pct(ni[i], rev[i]);
    const at = safeDiv(rev[i], avgAssets);
    const em = safeDiv(avgAssets, avgEquity);
    const roe = safeDiv(ni[i], avgEquity);
    return { netMargin: nm, assetTurnover: at, equityMultiplier: em, roe };
  });

  // Working-capital cycle (latest year, if the pieces are present).
  const i = years.length - 1;
  const dso = num(f.receivables?.[i]) != null && rev[i] ? (f.receivables[i] / rev[i]) * 365 : null;
  const dio = num(f.inventory?.[i]) != null && num(f.cogs?.[i]) ? (f.inventory[i] / f.cogs[i]) * 365 : null;
  const dpo = num(f.payables?.[i]) != null && num(f.cogs?.[i]) ? (f.payables[i] / f.cogs[i]) * 365 : null;
  const ccc = dso != null && dio != null && dpo != null ? dso + dio - dpo : null;
  const currentRatio = num(f.currentAssets?.[i]) != null && num(f.currentLiabilities?.[i])
    ? f.currentAssets[i] / f.currentLiabilities[i]
    : null;

  return {
    years, revenue: rev, revenueGrowth,
    grossMargin, operatingMargin, ebitdaMargin, netMargin, effectiveTax,
    dupont,
    workingCapital: { dso, dio, dpo, ccc, currentRatio },
    latestRoe: last(dupont)?.roe ?? null,
  };
}

/* ----------------------------- forecast ---------------------------- */

export function forecast(f, a, coc) {
  const n = a.forecastYears;
  const baseRevenue = last(f.revenue);
  const baseYear = last(f.years);

  const y1Growth = num(a.y1Growth) ?? num(f.analystY1Growth) ?? last(historical(f).revenueGrowth) ?? a.terminalGrowth;
  const gTerminal = num(a.terminalGrowth);
  // Linear taper from Y1 growth to terminal growth across the horizon.
  const step = n > 1 ? (y1Growth - gTerminal) / (n - 1) : 0;
  const growth = Array.from({ length: n }, (_, t) => y1Growth - step * t);

  const opMargin = num(a.operatingMargin) ?? trailingAvg(historical(f).operatingMargin, 3);
  const nMargin = num(a.netMargin) ?? trailingAvg(historical(f).netMargin, 3);
  const tax = coc.taxRate;
  const capexPct = num(a.capexPctRevenue);
  const wcPct = num(a.wcPctDeltaRevenue);

  const years = [], revenue = [], ebit = [], nopat = [], netIncome = [];
  const deltaRevenue = [], deltaWC = [], capex = [], ebitda = [], fcf = [];
  let prevRev = baseRevenue;
  for (let t = 0; t < n; t++) {
    const rev = prevRev * (1 + growth[t]);
    const e = rev * opMargin;
    const np = e * (1 - tax);
    const ni = rev * nMargin;
    const dRev = rev - prevRev;
    const dWC = dRev * wcPct;
    const cx = rev * capexPct; // D&A is assumed ≈ capex (net-zero in UFCF)
    years.push(baseYear + t + 1);
    revenue.push(rev); ebit.push(e); nopat.push(np); netIncome.push(ni);
    deltaRevenue.push(dRev); deltaWC.push(dWC); capex.push(cx);
    ebitda.push(e + cx); // EBITDA = EBIT + D&A(≈capex), used by the EV/EBITDA multiple
    fcf.push(np - dWC); // UFCF = NOPAT − ΔWC (D&A and capex cancel)
    prevRev = rev;
  }

  // Clean-surplus book-value roll for the AE method (100% retention).
  const bvBegin = [], bvEnd = [];
  let bv = num(f.bookValueEquity) ?? last(f.totalEquity);
  for (let t = 0; t < n; t++) {
    bvBegin.push(bv);
    bv = bv + netIncome[t] * a.retention;
    bvEnd.push(bv);
  }

  return {
    years, growth, revenue, operatingMargin: opMargin, netMargin: nMargin,
    ebit, nopat, netIncome, ebitda, capex, deltaRevenue, deltaWC, fcf,
    bvBegin, bvEnd, baseRevenue, baseYear,
    assumptionsUsed: { y1Growth, terminalGrowth: gTerminal, operatingMargin: opMargin, netMargin: nMargin, taxRate: tax, capexPctRevenue: capexPct, wcPctDeltaRevenue: wcPct },
  };
}

/* ---------------- abnormal earnings (primary) ---------------------- */

export function abnormalEarnings(fc, coc, a, f) {
  const ke = coc.ke;
  const g = a.terminalGrowth;
  const rows = fc.years.map((yr, t) => {
    const begBV = fc.bvBegin[t];
    const ni = fc.netIncome[t];
    const normal = ke * begBV;
    const ae = ni - normal;
    const df = 1 / (1 + ke) ** (t + 1);
    return { year: yr, beginningBookValue: begBV, netIncome: ni, normalEarnings: normal, abnormalEarnings: ae, discountFactor: df, pvAbnormalEarnings: ae * df };
  });
  const sumPvAe = rows.reduce((s, r) => s + r.pvAbnormalEarnings, 0);
  const lastAe = last(rows).abnormalEarnings;
  const lastDf = last(rows).discountFactor;
  const terminalAe = lastAe * (1 + g);
  const terminalValue = ke > g ? terminalAe / (ke - g) : null;
  const pvTerminal = terminalValue != null ? terminalValue * lastDf : null;
  const bv0 = num(f.bookValueEquity) ?? last(f.totalEquity);
  const equityValue = bv0 + sumPvAe + (pvTerminal ?? 0);
  const perShare = safeDiv(equityValue, num(f.sharesOut));
  return { rows, currentBookValue: bv0, sumPvAe, terminalAe, terminalValue, pvTerminal, equityValue, perShare };
}

/* --------------------------- DCF cross-check ----------------------- */

export function dcf(fc, coc, a, f) {
  const w = coc.wacc;
  const g = a.terminalGrowth;
  const rows = fc.years.map((yr, t) => {
    const df = 1 / (1 + w) ** (t + 1);
    return { year: yr, freeCashFlow: fc.fcf[t], discountFactor: df, pvFreeCashFlow: fc.fcf[t] * df };
  });
  const sumPvFcf = rows.reduce((s, r) => s + r.pvFreeCashFlow, 0);
  const lastFcf = last(fc.fcf);
  const lastDf = last(rows).discountFactor;
  const terminalFcf = w > g ? (lastFcf * (1 + g)) / (w - g) : null;
  const pvTerminal = terminalFcf != null ? terminalFcf * lastDf : null;
  const enterpriseValue = sumPvFcf + (pvTerminal ?? 0);
  const netDebt = resolveNetDebt(f) ?? 0;
  const equityValue = enterpriseValue - netDebt;
  const perShare = safeDiv(equityValue, num(f.sharesOut));
  return { rows, sumPvFcf, terminalFcf, pvTerminal, enterpriseValue, netDebt, equityValue, perShare };
}

/* ----------------------------- multiples --------------------------- */

export function multiples(fc, coc, a, f) {
  const shares = num(f.sharesOut);
  const netDebt = resolveNetDebt(f) ?? 0;
  const y1Eps = safeDiv(fc.netIncome[0], shares);
  const y1Ebitda = fc.ebitda[0];

  const peShare = y1Eps != null ? y1Eps * a.terminalPE : null;
  const peEquity = peShare != null ? peShare * shares : null;

  const evEbitdaEv = y1Ebitda * a.terminalEvEbitda;
  const evEbitdaEquity = evEbitdaEv - netDebt;
  const evEbitdaShare = safeDiv(evEbitdaEquity, shares);

  return { y1Eps, y1Ebitda, peShare, peEquity, evEbitdaEv, evEbitdaEquity, evEbitdaShare };
}

/* --------------------- ROE mean-reversion scenarios ---------------- */

function roeScenario(roePath, bv0, ke, shares) {
  let begBV = bv0, sumPv = 0;
  const rows = roePath.map((roe, t) => {
    const ri = (roe - ke) * begBV;
    const df = 1 / (1 + ke) ** (t + 1);
    const pv = ri * df;
    sumPv += pv;
    const r = { year: t + 1, roe, beginningBookValue: begBV, residualIncome: ri, pv };
    begBV = begBV * (1 + roe); // 100% retention
    return r;
  });
  const equityValue = bv0 + sumPv;
  return { rows, pvResidualIncome: sumPv, terminalBookValue: bv0, equityValue, perShare: safeDiv(equityValue, shares) };
}

export function roeMeanReversion(f, coc, a, hist) {
  const N = a.roeReversionYears;
  const ke = coc.ke;
  const bv0 = num(f.bookValueEquity) ?? last(f.totalEquity);
  const shares = num(f.sharesOut);
  const roe0 = hist.latestRoe;
  if (roe0 == null) return null;
  const industry = num(f.industryMedianRoe) ?? num(a.industryMedianRoe);

  const linearTo = (target, years) =>
    Array.from({ length: N }, (_, t) => (t < years ? roe0 + (target - roe0) * ((t + 1) / years) : target));

  const scenarios = [
    { key: "sustain", label: "Sustain ROE", path: Array.from({ length: N }, () => roe0) },
    { key: "fade_industry", label: `Fade to industry (${N}Y)`, path: linearTo(industry, N) },
    { key: "fade_ke", label: `Fade to cost of equity (${N}Y)`, path: linearTo(ke, N) },
    { key: "fast_fade", label: "Fast fade (5Y to industry)", path: linearTo(industry, 5) },
  ];

  return {
    currentRoe: roe0, costOfEquity: ke, industryRoe: industry, horizon: N,
    scenarios: scenarios.map((s) => ({ ...s, ...roeScenario(s.path, bv0, ke, shares) })),
  };
}

/* ---------------------- WACC × g sensitivity grid ------------------ */

export function sensitivityGrid(fc, coc, a, f) {
  const baseW = coc.wacc, baseG = a.terminalGrowth;
  const waccs = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => round(baseW + d, 4));
  const gs = [-0.015, -0.0075, 0, 0.0075, 0.015].map((d) => round(baseG + d, 4));
  const grid = waccs.map((w) =>
    gs.map((g) => {
      if (w <= g) return null;
      const sumPv = fc.fcf.reduce((s, cf, t) => s + cf / (1 + w) ** (t + 1), 0);
      const lastDf = 1 / (1 + w) ** fc.fcf.length;
      const tv = (last(fc.fcf) * (1 + g)) / (w - g);
      const ev = sumPv + tv * lastDf;
      const eq = ev - (resolveNetDebt(f) ?? 0);
      return round(safeDiv(eq, num(f.sharesOut)), 2);
    }),
  );
  return { waccs, gs, grid, baseWacc: baseW, baseGrowth: baseG };
}

/* --------------------------- peer comps ---------------------------- */

export function peerComps(f) {
  const peers = (f.peers ?? []).filter(Boolean);
  if (!peers.length) return null;
  const fields = ["grossMargin", "ebitdaMargin", "operatingMargin", "netMargin", "revGrowth1y", "debtToCapital", "pe", "evEbitda"];
  const stat = (key) => {
    const vals = peers.map((p) => num(p[key])).filter((v) => v != null).sort((x, y) => x - y);
    if (!vals.length) return null;
    const mid = Math.floor(vals.length / 2);
    const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    return { high: vals[vals.length - 1], low: vals[0], mean: vals.reduce((s, v) => s + v, 0) / vals.length, median };
  };
  return { peers, summary: Object.fromEntries(fields.map((k) => [k, stat(k)])) };
}

/* ----------------------- valuation summary ------------------------- */

export function valuationSummary(ae, dcfRes, mult, price, a) {
  const methods = [
    { name: "Abnormal Earnings (primary)", perShare: ae.perShare },
    { name: "DCF", perShare: dcfRes.perShare },
    { name: `P/E Multiple (${a.terminalPE}x)`, perShare: mult.peShare },
    { name: `EV/EBITDA Multiple (${a.terminalEvEbitda}x)`, perShare: mult.evEbitdaShare },
  ].filter((m) => m.perShare != null);

  const vals = methods.map((m) => m.perShare).sort((x, y) => x - y);
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  const impliedUpside = price ? median / price - 1 : null;
  let signal = "HOLD";
  if (impliedUpside != null) {
    if (impliedUpside >= a.buyThreshold) signal = "BUY";
    else if (impliedUpside <= a.sellThreshold) signal = "SELL";
  }
  const withVs = methods.map((m) => ({ ...m, vsPrice: price ? m.perShare / price - 1 : null }));
  return { methods: withVs, median, currentPrice: price, impliedUpside, signal, low: vals[0], high: vals[vals.length - 1] };
}

/* ----------------------- data quality report ----------------------- */

function dataQuality(f, gate) {
  const required = {
    revenue: (f.revenue ?? []).filter((v) => v != null).length >= 3,
    netIncome: (f.netIncome ?? []).filter((v) => v != null).length >= 3,
    bookValueEquity: num(f.bookValueEquity) != null || last(f.totalEquity) != null,
    sharesOut: num(f.sharesOut) != null,
    price: num(f.price) != null,
    beta: num(f.beta) != null,
    netDebt: resolveNetDebt(f) != null,
    peers: (f.peers ?? []).length > 0,
    balanceSheet: (f.totalAssets ?? []).filter((v) => v != null).length >= 2,
    analystEstimates: num(f.analystY1Growth) != null,
  };
  const missing = Object.entries(required).filter(([, ok]) => !ok).map(([k]) => k);
  const warnings = [...(f.dataQuality?.warnings ?? [])];
  if (!gate.ok) warnings.unshift(gate.reason);
  if (!required.peers) warnings.push("No peer set available — cross-sectional comparison and median multiples are omitted.");
  if (!required.analystEstimates) warnings.push("No analyst consensus — Year-1 growth falls back to the last reported growth rate.");
  if (!required.balanceSheet) warnings.push("Sparse balance-sheet history — DuPont decomposition may be incomplete.");
  return { sources: f.dataQuality?.sources ?? {}, requiredPresent: required, missing, warnings, degraded: missing.length > 0 || warnings.length > 0 };
}

/* --------------------- internal consistency checks ----------------- */

function consistencyChecks(f, ae, dcfRes) {
  const checks = [];
  const i = (f.years ?? []).length - 1;
  const assets = num(f.totalAssets?.[i]);
  const equity = num(f.totalEquity?.[i]);
  const debt = num(f.totalDebt?.[i]);
  if (assets != null && equity != null) {
    const impliedLiab = assets - equity;
    checks.push({ name: "balance_sheet_identity", ok: impliedLiab >= 0, detail: `Assets ${round(assets, 0)} ≥ Equity ${round(equity, 0)}` });
  }
  if (ae.perShare != null && dcfRes.perShare != null) {
    const spread = Math.abs(ae.perShare - dcfRes.perShare) / ((ae.perShare + dcfRes.perShare) / 2);
    checks.push({ name: "ae_dcf_bracket", ok: spread < 0.6, detail: `AE vs DCF spread ${round(spread * 100, 1)}% (wide spread = high assumption sensitivity)` });
  }
  return checks;
}

/* --------------------------- main entry ---------------------------- */

/**
 * Compute the full, locked ReportModel from normalized Fundamentals.
 * @param {object} f Fundamentals (see get-fundamentals adapter / fixture).
 * @param {object} [overrides] Assumption overrides merged over DEFAULT_ASSUMPTIONS.
 * @returns {object} ReportModel — all numbers the report renders, plus provenance.
 */
export function computeReportModel(f, overrides = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...(overrides ?? {}) };
  const gate = sectorGate(f);
  const quality = dataQuality(f, gate);

  if (!gate.ok) {
    return {
      ok: false,
      gate,
      meta: metaBlock(f, a),
      dataQuality: quality,
    };
  }

  const coc = costOfCapital(f, a);
  const hist = historical(f);
  const fc = forecast(f, a, coc);
  const ae = abnormalEarnings(fc, coc, a, f);
  const dcfRes = dcf(fc, coc, a, f);
  const mult = multiples(fc, coc, a, f);
  const roe = roeMeanReversion(f, coc, a, hist);
  const grid = sensitivityGrid(fc, coc, a, f);
  const peers = peerComps(f);
  const summary = valuationSummary(ae, dcfRes, mult, num(f.price), a);

  return {
    ok: true,
    meta: metaBlock(f, a),
    assumptions: a,
    costOfCapital: coc,
    historical: hist,
    forecast: fc,
    abnormalEarnings: ae,
    dcf: dcfRes,
    multiples: mult,
    roeMeanReversion: roe,
    sensitivityGrid: grid,
    peerComps: peers,
    valuationSummary: summary,
    consistency: consistencyChecks(f, ae, dcfRes),
    dataQuality: quality,
  };
}

function metaBlock(f, a) {
  return {
    ticker: f.ticker ?? null,
    name: f.name ?? f.ticker ?? null,
    exchange: f.exchange ?? null,
    sector: f.sector ?? null,
    currency: f.currency ?? "USD",
    currentPrice: num(f.price),
    sharesOutMillions: num(f.sharesOut),
    asOf: f.asOf ?? null,
    fiscalYears: f.years ?? [],
    reportingNote: `All figures in millions of ${f.currency ?? "USD"} unless noted. Per-share values in ${f.currency ?? "USD"}.`,
  };
}
