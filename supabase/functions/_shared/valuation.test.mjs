/* ------------------------------------------------------------------
   Golden + invariant tests for the deterministic valuation engine.

   Run with:  node supabase/functions/_shared/valuation.test.mjs
   (Deno:     deno test --allow-read supabase/functions/_shared/)

   The golden case asserts the engine reproduces the source BAV report's
   TSMC outputs from a frozen Fundamentals fixture. Invariant tests assert
   structural properties that must hold for ANY input (balance, no-growth
   AE=DCF identity, monotonic sensitivity grid), so convention bugs that a
   single curve-fit fixture would miss are still caught.
   ------------------------------------------------------------------ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  computeReportModel, costOfCapital, forecast, abnormalEarnings, dcf, DEFAULT_ASSUMPTIONS,
} from "./valuation.js";

const here = dirname(fileURLToPath(import.meta.url));
const tsmc = JSON.parse(readFileSync(join(here, "fixtures", "tsmc.fundamentals.json"), "utf8"));

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, detail = "") {
  if (cond) { passed++; }
  else { failed++; fails.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}
/** Assert |actual-expected|/|expected| <= tol. */
function near(name, actual, expected, tol) {
  const a = Number(actual), e = Number(expected);
  const rel = e === 0 ? Math.abs(a) : Math.abs(a - e) / Math.abs(e);
  ok(name, Number.isFinite(a) && rel <= tol, `got ${round(a)} vs ${round(e)} (rel ${(rel * 100).toFixed(3)}%, tol ${(tol * 100).toFixed(2)}%)`);
}
const round = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);

/* =================== GOLDEN: TSMC reproduces the report =================== */
// The analyst rounded the 3-yr-average margins to 47% / 41% — pass as overrides.
const model = computeReportModel(tsmc, { operatingMargin: 0.47, netMargin: 0.41 });

ok("model.ok", model.ok === true, JSON.stringify(model.gate ?? {}));

// --- Cost of capital ---
near("Ke (CAPM)", model.costOfCapital.ke, 0.08275, 0.005);
near("WACC", model.costOfCapital.wacc, 0.0817, 0.01);

// --- Forecast (revenue, net income, book-value roll) ---
const expRev = [5142223, 6524196, 7747483, 8570653, 8784919];
model.forecast.revenue.forEach((v, i) => near(`forecast.revenue[Y${i + 1}]`, v, expRev[i], 0.004));
const expNI = [2108312, 2674920, 3176468, 3513968, 3601817];
model.forecast.netIncome.forEach((v, i) => near(`forecast.netIncome[Y${i + 1}]`, v, expNI[i], 0.004));
const expBV = [7463350, 10138271, 13314738, 16828706, 20430523];
model.forecast.bvEnd.forEach((v, i) => near(`forecast.bvEnd[Y${i + 1}]`, v, expBV[i], 0.004));

// --- Abnormal Earnings (primary) ---
near("AE equity value", model.abnormalEarnings.equityValue, 40078590, 0.02);
near("AE per share", model.abnormalEarnings.perShare, 1545.5, 0.02);
near("AE sum PV (Y1-5)", model.abnormalEarnings.sumPvAe, 8373949, 0.02);

// --- DCF cross-check ---
near("DCF enterprise value", model.dcf.enterpriseValue, 50416766, 0.02);
near("DCF per share", model.dcf.perShare, 2021.28, 0.02);

// --- Multiples ---
near("P/E value per share", model.multiples.peShare, 1788.6, 0.03);
near("EV/EBITDA per share", model.multiples.evEbitdaShare, 2367.41, 0.04);

// --- ROE mean reversion (Sustain scenario) ---
const sustain = model.roeMeanReversion.scenarios.find((s) => s.key === "sustain");
near("ROE sustain per share", sustain.perShare, 1886.01, 0.03);
ok("ROE scenarios ordered (sustain highest)",
  sustain.perShare > model.roeMeanReversion.scenarios.find((s) => s.key === "fast_fade").perShare);

// --- Historical margins + DuPont reproduce ---
near("gross margin 2025", model.historical.grossMargin[5], 0.599, 0.01);
near("operating margin 2025", model.historical.operatingMargin[5], 0.508, 0.01);
near("net margin 2025", model.historical.netMargin[5], 0.445, 0.01);
near("effective tax 2025", model.historical.effectiveTax[5], 0.17, 0.02);
near("DuPont ROE 2025", model.historical.dupont[5].roe, 0.353, 0.02);
near("DuPont asset turnover 2025", model.historical.dupont[5].assetTurnover, 0.52, 0.04);
near("DuPont equity multiplier 2025", model.historical.dupont[5].equityMultiplier, 1.52, 0.04);

// --- Valuation summary + recommendation ---
near("valuation median", model.valuationSummary.median, 1904.94, 0.03);
ok("recommendation HOLD", model.valuationSummary.signal === "HOLD", `got ${model.valuationSummary.signal} (upside ${round(model.valuationSummary.impliedUpside)})`);

/* =================== INVARIANTS (hold for any input) =================== */

// 1a. No-debt, no-premium: Ke must equal WACC (cost-of-capital wiring).
const flat = {
  ticker: "FLAT", name: "Flat Co", sector: "Technology", currency: "USD",
  price: 100, sharesOut: 1000, beta: 1.0, riskFreeRate: 0.05,
  bookValueEquity: 10000, netDebt: 0, totalDebt: 0,
  years: [2023, 2024, 2025],
  revenue: [9000, 9500, 10000], netIncome: [900, 950, 1000],
  operatingIncome: [1250, 1300, 1333.33], grossProfit: [4500, 4750, 5000],
  ebitda: [1250, 1300, 1333.33], pretaxIncome: [1250, 1300, 1333.33], incomeTaxExpense: [350, 350, 333.33],
  totalAssets: [10000, 10000, 10000], totalEquity: [10000, 10000, 10000],
};
const flatA = { ...DEFAULT_ASSUMPTIONS, marketRiskPremium: 0.0, taxRate: 0.25, terminalGrowth: 0.0, y1Growth: 0.0, operatingMargin: 0.13333333, netMargin: 0.1, capexPctRevenue: 0.0, wcPctDeltaRevenue: 0.0 };
const fcoc = costOfCapital(flat, flatA);
ok("invariant: Ke == WACC (no debt, no premium)", Math.abs(fcoc.ke - fcoc.wacc) < 1e-9, `${fcoc.ke} vs ${fcoc.wacc}`);

// 1b. Residual-income identity: a firm earning EXACTLY its cost of equity on
//     book value every year has zero abnormal earnings, so AE equity value
//     must equal current book value (the model's defining property). Build a
//     forecast where netIncome[t] = Ke * beginningBookValue[t].
const ke = 0.09;
const bv0 = 50000;
const synFc = (() => {
  const bvBegin = [], bvEnd = [], netIncome = [];
  let bv = bv0;
  for (let t = 0; t < 5; t++) { const ni = ke * bv; bvBegin.push(bv); netIncome.push(ni); bv += ni; bvEnd.push(bv); }
  return { years: [1, 2, 3, 4, 5], bvBegin, bvEnd, netIncome };
})();
const synAe = abnormalEarnings(synFc, { ke }, { ...DEFAULT_ASSUMPTIONS, terminalGrowth: 0.025 }, { bookValueEquity: bv0, sharesOut: 1000 });
near("invariant: zero-abnormal-earnings => value == book value", synAe.equityValue, bv0, 0.001);

// 2. Sensitivity grid monotonic: per-share rises as WACC falls and as g rises.
const grid = model.sensitivityGrid;
let monoOk = true;
for (let r = 0; r < grid.grid.length; r++) {
  for (let c = 1; c < grid.grid[r].length; c++) {
    if (grid.grid[r][c] != null && grid.grid[r][c - 1] != null && grid.grid[r][c] < grid.grid[r][c - 1]) monoOk = false; // rising g
  }
}
for (let c = 0; c < grid.waccs.length; c++) {
  for (let r = 1; r < grid.grid.length; r++) {
    const lo = grid.grid[r][c], hi = grid.grid[r - 1][c];
    if (lo != null && hi != null && lo > hi) monoOk = false; // higher WACC -> lower value
  }
}
ok("invariant: sensitivity grid monotonic in WACC and g", monoOk);

// 3. Balance-sheet identity holds in consistency checks.
ok("invariant: balance-sheet identity check passes",
  model.consistency.find((c) => c.name === "balance_sheet_identity")?.ok === true);

// 4. Sector gate refuses a bank.
const bank = computeReportModel({ ...tsmc, sector: "Banks", name: "Test Bank" });
ok("invariant: sector gate rejects banks", bank.ok === false && /financials-specific/.test(bank.gate.reason));

// 5. Negative earnings rejected.
const loss = computeReportModel({ ...tsmc, sector: "Biotechnology", netIncome: [-100, -200, -150, -300, -250, -400] });
ok("invariant: gate rejects negative trailing earnings", loss.ok === false);

/* ============================ report ============================ */
console.log(`\n  Valuation engine tests: ${passed} passed, ${failed} failed\n`);
if (failed) {
  console.log("  FAILURES:");
  for (const f of fails) console.log(`   ✗ ${f}`);
  console.log("");
  process.exit(1);
} else {
  console.log("  ✓ Golden TSMC report reproduced; all invariants hold.\n");
}
