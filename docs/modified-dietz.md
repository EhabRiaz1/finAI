# Modified Dietz Return — problems, fixes, and what shipped

## Context

The HSBC/Interactive Brokers **YTD Activity Statement** (`YTD HSBC 09:06:10.pdf`, Jan 1 – Jun 8 2026) is the *whole* master portfolio for OMER YAHYA. Inside financeAI that one portfolio was split across two accounts:

- `omer@financeai.app` ("app") — 16 equities + 5 bonds, **all** cash and **all** external flows
- `omer@finance.ai` ("dotai") — 11 equities, **no** cash, **no** flows

### Reconciliation vs the statement (verified)

- **Stock positions:** app ⊕ dotai = exactly the 27 open positions in the PDF, share-for-share, no overlap, no omission. Closed names (UNH, VZ) correctly absent.
- **Dividends (net):** app 975.41 + dotai 226.02 = **1,201.43** = PDF net dividends. ✓
- **External flows:** app `cash_transactions` 237,576.97 ≈ PDF Deposits & Withdrawals **237,581.10** (4.13 = NVO ADR fee). ✓
- **Ending cash:** app `account_balances.cash` **26,973.90** = PDF ending cash. ✓
- **Asymmetries:** all cash/flows live on app; dotai has no `account_balances` row; app's 5 bonds aren't in the (equities-only) statement; VOO had a future `purchase_date` (2026-06-15).

## The method

Modified Dietz is a money-weighted return that approximates time-weighting by weighting each **external** cash flow by the fraction of the period it was invested:

```
R = (EMV − BMV − F) / (BMV + Σ wᵢ·Fᵢ),   wᵢ = (T − tᵢ) / T
```

- **BMV/EMV** — portfolio value at period start/end.
- **F = Σ Fᵢ** — external flows only (deposits +, withdrawals −). **Trades and dividends are internal — never flows.**
- Numerator strips out money added/removed; denominator is the average capital at work.

### Worked household example (ground truth from the PDF)

BMV 573,744.36 · EMV 835,176.56 · F (deposits/withdrawals) 237,581.10 · T 158 days. The big 189,990 deposit lands 3 days before period end (weight ≈ 0.02).

```
gain        = 835,176.56 − 573,744.36 − 237,581.10 = 23,851.10   (= MTM + divs − WHT − fees − comm)
Σ wᵢ·Fᵢ     ≈ 14,800
R           = 23,851.10 / (573,744.36 + 14,800) ≈ +4.05% YTD
```

NAV grew **+261k**, but ~238k was deposits — the capital actually earned **~4%**. That gap is exactly why a naive "market value − cost" number misleads.

## Problems and fixes

| # | Problem | Fix |
|---|---------|-----|
| **P1** | **No BMV / no history.** `portfolio_snapshots` only start ~Jun 10; nothing covers the Jan 1 start. | Reconstruct on read by replaying the ledger backward over `price_history` (254 daily closes): `shares_start = shares_now − Σ signed trades after start`; `cash_start = cash_now − Σ cash events after start`; `BMV = Σ shares_start × close_at_start + cash_start`. (Phase-2: backfill `portfolio_snapshots` via the `backfill-history` function.) |
| **P2** | **Flows vs trades.** Buys/sells are internal, not flows. | Pull `F` from `cash_transactions` only; never feed `transactions` into F. (Schema already separates them.) |
| **P3** | **The split breaks per-account returns.** dotai has $0 cash and no flows; app holds 100% of cash/flows. | The accurate number is **household** (app ⊕ dotai), which reconciles to the PDF. Per-account is only valid if each account is internally consistent (its purchases funded by its own recorded cash). |
| **P4** | **Bonds aren't in the statement.** app's 5 bonds affect value but have no PDF source. | v1 is **equities-only**; bonds are out of scope (documented). |
| **P5** | **Cash must be a full ledger.** Historical cash = start + deposits + sale proceeds − purchases + dividends − fees (the PDF "Cash Report"). | Reconstruct cash from `cash_transactions` + `transactions` + `dividends` − fees; trust `account_balances.cash` only as the *current* EMV cash. |
| **P6** | **Dividends** lift return but aren't external flows. | Include received dividends in cash/EMV (handled by the cash-ledger reconstruction); never list them in F. |
| **P7** | **One huge late deposit (190k @ Jun 5)** makes single-period Dietz approximate. | The time-weighting handles it (weight ≈ 0.02). Phase-2: break at large flows and geometrically link sub-period Dietz for a true TWR. |
| **P8** | **Double-counting.** App stores `transactions.realized_pnl`. | Returns use values + flows only; `realized_pnl`/cost-basis P&L stay display-only. |
| **P9** | **Data hygiene.** dotai has no balance row; VOO `purchase_date` in the future; negative reconstructed start cash signals inconsistency. | Surfaced in the UI (see below). Should give dotai an `account_balances` row and record **inter-account transfers** so each sleeve is fundable; fix the VOO date. |

## What shipped (v1, BETA)

- **`src/lib/modifiedDietz.js`** — pure `modifiedDietz({ bmv, emv, flows, start, end })`.
- **`src/hooks/useModifiedDietz.js`** — per-account (RLS-scoped) YTD reconstruction: fetches `transactions` / `cash_transactions` / `dividends`, loads `price_history` near Jan 1 for every ticker ever held, rebuilds BMV/EMV, computes the return. Flags `cashStartNegative` when the ledger looks inconsistent.
- **`src/components/ModifiedDietzCard.jsx`** + Dashboard wiring — a card titled **"Modified Dietz Return"** with a **BETA** badge, the YTD %, and sub-stats (start value, current value, net flows, gain). Shows an "approximate — ledger looks split" note when start cash reconstructs negative.

### Known limitation (why BETA)

The dashboard runs as the logged-in user under RLS, so it can only compute the **account-level** figure, not the household one. For the split data this is approximate:

| Scope | YTD Modified Dietz | Notes |
|-------|--------------------|-------|
| **Household** (app ⊕ dotai) | **≈ +4.0%** | Accurate; reconciles to the HSBC statement |
| **app account, per-account** | **≈ +12.5%** | What the card shows; reconstructed `cash_start = −74,555` (← split inconsistency, flagged) |

The ~8-point gap is the split: app carries every deposit but only its own purchases, so replaying backward yields impossible negative starting cash. The BETA badge + the in-card note + this doc make that explicit.

## Phase-2 to make it "final"

1. **Household scope** — aggregate both accounts (service-role path, like `admin-api`) so the dashboard can show the accurate ~4% with a "this account / household" toggle.
2. **Fix the data split** — give dotai an `account_balances` row and model **inter-account transfers** as flows (netting to zero at household level) so each account becomes internally consistent.
3. **Backfill `portfolio_snapshots`** by replaying the ledger over `price_history`, and drive the performance chart + a **monthly-linked TWR** off it (P7).
4. **Bonds** in scope (P4) once a mark/flow source exists.

---

## Update — what was actually built (resolves P1–P3, P5)

The per-account card was confirmed wrong **because of the split**: reconstructing each sleeve's start-of-year cash gave **app −74,555** and **dotai +115,770** — impossible mirror artifacts that **sum to +41,215**, exactly the statement's Dec-31 cash. dotai's "1.83%" was the phantom +115k inflating its denominator.

Implemented (all three approved options):

1. **Household linking** — `account_households` table (migration), both accounts seeded into one `household_id`.
2. **Fixed the split data** — gave dotai an `account_balances` row (cash 0) and inserted 24 tagged `cash_transactions` (`type='transfer'`) recording the inter-account transfers that funded dotai's trades. Result: per-sleeve cash now reconstructs correctly (app +41,441, dotai −226 ≈ 0).
3. **`portfolio-return` edge function** (service role, JWT-gated to the caller's own household) — computes household Modified Dietz (transfers excluded as internal) **and** the caller's sleeve (transfers included). Dashboard card (`usePortfolioReturn` → `ModifiedDietzCard`) shows the **household** figure as the headline with the sleeve return beneath. It values closed positions (VZ/UNH) via a trade-price fallback, so its BMV (574,958) ≈ the statement's Dec-31 NAV (573,744).
4. **Daily snapshots backfilled** — replayed each account's ledger over `price_history` into `portfolio_snapshots` (113 daily points/account, Jan 2 → today) for a clean value series (also future-feeds the performance chart).

### Final confirmed numbers (YTD 2026)

| Scope | Modified Dietz | BMV | EMV |
|-------|----------------|-----|-----|
| **Household (to today)** — what the card shows | **≈ +6.2%** | 574,958 | 849,868 |
| Household (Jan 1 → Jun 8, statement-exact) | +4.05% | 573,744 | 835,177 |
| app sleeve (to today) | +7.2% | — | — |
| dotai sleeve (to today) | +2.9% | — | — |

The to-today **6.2%** is ~2 points above the statement's 4.05% purely because the market rose in the 8 days after the Jun-8 cutoff (no DB activity after Jun 5). Remaining residual: snapshot first-day value (563,530) is ~1.7% under the statement NAV because the snapshot `mv` join omits closed tickers lacking `price_history`; the card's function avoids this via the trade-price fallback. Anchoring snapshots to the statement NAV would remove that last bit.
