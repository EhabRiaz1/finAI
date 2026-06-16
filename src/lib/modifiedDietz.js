/* ------------------------------------------------------------------
   Modified Dietz — money-weighted period return that approximates a
   time-weighted return by weighting each EXTERNAL cash flow by the
   fraction of the period it was invested.

     R = (EMV - BMV - F) / (BMV + Σ wᵢ·Fᵢ),   wᵢ = (T - tᵢ) / T

   - BMV / EMV: portfolio value at the start / end of the window.
   - flows: EXTERNAL flows only (deposits +, withdrawals −). Trades and
     dividends are internal and must NOT be passed here.
   ------------------------------------------------------------------ */

const DAY = 86400000;

/**
 * @param {object}   p
 * @param {number}   p.bmv    beginning market value
 * @param {number}   p.emv    ending market value
 * @param {Array<{date: Date|number|string, amount: number}>} p.flows  external flows (signed)
 * @param {Date|number|string} p.start  window start
 * @param {Date|number|string} p.end    window end
 * @returns {null | { ret, bmv, emv, netFlows, gain, days }}
 */
export function modifiedDietz({ bmv, emv, flows = [], start, end }) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const T = (e - s) / DAY;
  if (!(T > 0) || !Number.isFinite(bmv) || !Number.isFinite(emv)) return null;

  let F = 0;
  let weighted = 0;
  for (const f of flows) {
    const amt = Number(f.amount) || 0;
    const t = (new Date(f.date).getTime() - s) / DAY;
    const w = Math.min(1, Math.max(0, (T - t) / T)); // clamp flows outside the window
    F += amt;
    weighted += amt * w;
  }

  const denom = bmv + weighted;
  if (!(Math.abs(denom) > 1e-9)) return null;

  const gain = emv - bmv - F;
  return { ret: gain / denom, bmv, emv, netFlows: F, gain, days: T };
}
