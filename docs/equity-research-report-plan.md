<!-- /autoplan restore point: /Users/ehabriaz/.gstack/projects/EhabRiaz1-finAI/main-autoplan-restore-20260624-134746.md -->
# Equity Research Report — Implementation Plan

**Goal:** Add an "Equity Research Report" capability to the AI Analyst that generates a
professional, multi-method valuation report (modeled on `Report.pdf` — a Business Analysis &
Valuation report for TSMC) live as a downloadable document artifact, for any ticker the user
names. No Bloomberg, no fabricated numbers, no hallucination.

## Decisions locked with the user
- **Data source:** Free stack for now (SEC EDGAR primary + Finnhub free + FMP free + FRED + Yahoo),
  isolated behind one adapter so paid sources can be swapped in later. Multiple sources OK.
- **Output:** Rich document artifact rendered in a side panel, with **Download PDF**.
- **Math:** **Deterministic code engine** computes all valuation numbers; the AI only writes
  narrative around locked, pre-computed figures it cannot alter.
- **Qualitative / Bloomberg panels:** AI writes qualitative sections via `web_search` with inline
  **citations**; Bloomberg-only visual panels (supplier/customer concentration, geo-exposure) are
  replaced by tables computed from peer/segment data, or shown as "data unavailable" — never faked.

## What the report contains (from Report.pdf)
1. **Executive Summary** + recommendation (BUY/HOLD/SELL) with target vs market price.
2. **Industry & Strategic Analysis** — industry structure, Porter's Five Forces, strategy, vs peers.
3. **Accounting Analysis** — revenue recognition, PP&E/depreciation, R&D, tax, SBC, working
   capital, goodwill, one-time items, grants, net cash, adjustments.
4. **Financial Analysis** — 5-yr profitability table, DuPont decomposition, risk, peer cross-section.
5. **Forecasting** — assumptions (cost of capital, forecast inputs, multiples), 5-yr income
   statement, balance-sheet roll, cash flow.
6. **Valuation** — cost of capital, **Abnormal Earnings (primary)**, ROE mean-reversion scenarios,
   **DCF cross-check**, sensitivity grids (WACC × g), trading multiples comps (LTM/NTM), blended
   valuation summary.
7. **Recommendation** — why the gap exists, why HOLD vs BUY/SELL, what to watch, final note.

---

## Architecture (5 layers)

### Layer A — Data adapter (new edge function `get-fundamentals`)
Auth-gated, mirrors the existing `quote-lookup` pattern. Input: ticker (+ optional name for
disambiguation). Steps:
1. **Resolve identity:** Finnhub `profile2` (name, currency, shares, exchange, sector) +
   SEC `company_tickers.json` → CIK (when a filer exists).
2. **Fetch from free sources** in parallel, each datum tagged with `{source, asOf}`:
   - SEC EDGAR `companyfacts` → 5–6 yrs of IS/BS/CF line items (primary; covers 20-F filers like TSMC).
   - Finnhub `metric=all` (beta, margins, ROE, ratios), `peers`, `quote`.
   - FMP free `analyst-estimates` (forward consensus), peers, statement gaps.
   - FRED risk-free rate (country-aware: US `DGS10`, Taiwan `IRLTLT01TWM156N`).
   - Yahoo monthly prices for 5-yr beta.
3. **Normalize** into a canonical `Fundamentals` schema (figures in millions of reporting currency,
   consistent field names, multi-year arrays). Detect & record reporting currency + FX.
4. **Cache** in new tables (`fundamentals_cache`, `fundamentals_sources`) keyed by
   `(ticker, fiscal_year, statement)` with provenance, so numbers are stable and auditable.
5. **Return** the bundle + a **data-quality report** (present/missing fields, per-field source).

> Adapter is the only place that knows about providers. Engine + renderer never call APIs.

### Layer B — Valuation engine (new pure module `valuation.ts`, deterministic, AI-free)
Takes `Fundamentals` + assumptions → fully-computed, **locked** `ReportModel` JSON:
- **History:** revenue growth, gross/op/EBITDA/net margins, effective tax, **DuPont** (net margin ×
  asset turnover × equity multiplier = ROE), CCC/DSO/DIO/DPO, liquidity/solvency ratios.
- **Cost of capital:** CAPM `Re = Rf + β·MRP`; after-tax `Kd`; **WACC** (market-weighted).
- **Forecast:** condensed 5-yr (Y1 growth tapering linearly → terminal g; margin assumptions; NOPAT;
  net income; book-value roll under clean-surplus).
- **Abnormal Earnings / Residual Income (primary):** `BV₀ + Σ PV(NIₜ − Ke·BV_begin) + PV(terminal)`
  → per-share.
- **DCF cross-check:** UFCF, discount at WACC, Gordon terminal, EV → less net debt → per-share.
- **Multiples:** P/E & EV/EBITDA applied to forecast; **peer comps** table (LTM/NTM) from peer data.
- **ROE mean-reversion scenarios:** Sustain / Fade-to-industry / Fade-to-Ke / Fast-fade → per-share.
- **Sensitivity grids:** WACC × terminal-g grid; margin sensitivity.
- **Summary:** blended median, vs current price, BUY/HOLD/SELL band logic.
- Assumptions exposed + overridable; defaults match the BAV conventions already in `prompt.ts`
  (MRP 5.0%, g 2.0–2.5%, etc.).
- **Validation:** internal-consistency checks (balance sheet balances, margins in range, AE vs DCF
  bracket) → anomalies flagged in the data-quality report.

**Golden test:** unit-test the engine against `Report.pdf`'s TSMC numbers (AE 1,545.50, DCF 2,021.28,
DuPont/ROE 35.3%, WACC 8.17%, the full forecast + AE/DCF tables) within tolerance before trusting it.

### Layer C — Report artifact model + renderer
- **DB:** reuse `ai_artifacts` (already has a `kind` column) with new `kind: "report"`. Data =
  ordered **block document** `{ blocks: [...], model: ReportModel, sources: [...], meta }` where
  block types are `heading | paragraph | table | kpi-box | recommendation-box | callout | citations`.
- **Renderer:** new `ReportPanel.jsx` (sibling of `ArtifactPanel.jsx`), wired into the same
  resizable side-panel layout (`AIAnalyst.jsx` splitter, `ChatProvider` artifact state). Styled to
  match Report.pdf (section headers, banded tables, highlighted recommendation/valuation boxes),
  with section nav.
- **PDF export (free, no new heavy deps for v1):** dedicated print stylesheet + `window.print()`
  → "Download PDF". Optional later upgrade to a server-side or `html2pdf`-based exact renderer.

### Layer D — AI assembly (numbers locked, prose generated)
- New tool `generate_research_report(ticker)` in `ai-analyst/tools.ts`: calls `get-fundamentals` →
  `valuation.ts` → creates the `report` artifact pre-filled with all computed tables/numbers and a
  section scaffold, then streams a new `report_section` / `artifact_create` SSE event handled in
  `ChatProvider`.
- AI fills **narrative slots only**, section by section. System-prompt rules: **never invent or
  alter a number** — reference locked tokens from `ReportModel`; for qualitative sections (industry,
  Five Forces, accounting, risks) use `web_search` and attach **inline citations**; unsupported
  claims are dropped or flagged; missing data renders as "n/a — data unavailable."
- **Token/latency:** 16k tokens/turn + ~100s soft deadline → generate section-by-section across the
  existing agentic loop; numbers pre-computed keeps each turn bounded.

### Layer E — Entry point (quick button + conversational kickoff)
- Add a quick button / suggestion chip **"Generate an equity research report"** to
  `AIAnalyst.jsx` `SUGGESTIONS` and `ChatThread` `DEFAULT_SUGGESTIONS`.
- Clicking sends a kickoff prompt; the AI **asks the user for the ticker or company name**, resolves
  ambiguity (e.g. "Apple" → AAPL; confirm), then runs `generate_research_report`.

---

## Anti-hallucination guardrails (explicit)
- Numbers flow **only** from the locked `ReportModel`; prompt forbids fabrication.
- Every fundamental datum carries `source` + `asOf`; report ends with a **Data & Sources** appendix.
- Missing data → explicit "data unavailable," never guessed.
- Qualitative claims require `web_search` citations (footnotes section).
- Engine consistency checks flag anomalies; currency handled natively (TWD for TSMC) with FX noted.

---

## Phasing
- **Phase 0 — Data foundation:** `get-fundamentals` edge fn + normalization + cache tables +
  data-quality report. Validate on TSMC + a few US names.
- **Phase 1 — Valuation engine:** deterministic `valuation.ts`, unit-tested to reproduce Report.pdf
  TSMC outputs (golden fixture).
- **Phase 2 — Report artifact + renderer + PDF:** new `kind`, `ReportPanel`, print CSS, side-panel wiring.
- **Phase 3 — AI assembly:** `generate_research_report` tool, system-prompt flow, narrative slots,
  citations, quick button + conversational kickoff.
- **Phase 4 — Polish:** styling parity with Report.pdf, error/edge states, international-coverage
  banner, "continue" handling for long reports.

## Key risks
- **Free-tier international coverage** (non-20-F foreign listings) is thin → mitigated by adapter
  isolation + data-quality banner + later paid swap.
- **Engine correctness** → mitigated by the TSMC golden test.
- **Long-report token limits** → mitigated by pre-computed numbers + section-by-section streaming.
- **XBRL normalization** (tag vari/mapping across filers) → start with a curated tag map, expand.

---

# GSTACK REVIEW REPORT (/autoplan)

Codex unavailable (binary absent) → all voices ran as Claude-subagent-only `[subagent-only]`.
UI scope: yes (ReportPanel, quick button, renderer). DX scope: no (no external developer surface;
api/cli grep hits were substrings of "Capital"). Phases run: CEO → Design → Eng. DX phase skipped.

## Cross-phase themes (flagged independently in 2+ phases — high-confidence)
- **T-A. `window.print()` ≠ publication-quality PDF.** Design C2 + Eng M10. The headline deliverable
  can't be met by print(); inline dark-theme styles bleed, tables/page-breaks/banded rows break.
- **T-B. Generation flow does not fit the envelope; partial report is the default failure.** Eng C3 +
  Design H1. 16k tokens/turn, 15-iteration loop, ~100s soft deadline vs a 7-section report with
  per-section web_search. Plus: no defined channel writes narrative INTO the artifact today.
- **T-C. TSMC/IFRS is the HARD data case, not a safe golden fixture; free coverage overpromised.**
  CEO C2/H3 + Eng H4. EDGAR companyfacts for 20-F/IFRS (`ifrs-full`) is sparse; us-gaap ≠ ifrs-full tags.
- **T-D. Full 22-page report is the wrong v1; engine + compact card is the 10x.** CEO H1 + Design C1
  (a 22-page doc can't live in a 360–560px panel). Same `ReportModel`, smaller surface first.

## CEO dual voices — consensus (subagent-only; Codex N/A)
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| 1. Premises valid? | NO — "free data reproduces Bloomberg-grade BAV" untested/overstated | N/A | flagged |
| 2. Right problem? | PARTIAL — engine yes; full-PDF-for-any-ticker no (card is 10x) | N/A | flagged |
| 3. Scope calibrated? | NO — sector generality (banks/insurers/pre-rev) breaks silently | N/A | flagged |
| 4. Alternatives explored? | NO — $20/mo paid data not costed vs free-stack plumbing | N/A | flagged |
| 5. Market/legal risk? | NO — BUY/SELL on a real 2-person portfolio, no disclaimer layer | N/A | flagged |
| 6. 6-month trajectory? | RISK — XBRL tag-map maintenance sink | N/A | flagged |

## Design litmus — consensus (subagent-only)
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Reading surface right? | NO — 22pg in narrow panel; need full-screen reading mode = print surface | N/A | flagged |
| States specified? | NO — generating/partial/error/disambiguation/interrupted/regenerate undesigned | N/A | flagged |
| PDF fidelity? | NO — print() can't match Report.pdf | N/A | flagged |
| Aesthetic decided? | NO — dark-terminal vs print-clean page fork unresolved | N/A | flagged |
| Disambiguation UX? | NO — left to free chat; reuse ConfirmationCard | N/A | flagged |
| Progress feedback? | NO — multi-minute wait on a one-line spinner | N/A | flagged |

## Eng dual voices — consensus (subagent-only)
| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| 1. Architecture sound? | PARTIAL — engine in edge fn good; `kind` reuse needs real plumbing | N/A | flagged |
| 2. Test coverage? | NO — no Deno test harness; golden fixture must be frozen JSON + invariants | N/A | flagged |
| 3. Perf/limits? | NO — token/iter/deadline envelope blown; large report JSON bloats every turn | N/A | flagged |
| 4. Security? | PARTIAL — SSRF via ticker; EDGAR UA; FMP key/RLS in user-JWT fn | N/A | flagged |
| 5. Error paths? | NO — `artifact_create`/`report_section` events don't exist; partial-report unhandled | N/A | flagged |
| 6. Deploy risk? | RISK — IFRS/restatement/FX normalization underestimated | N/A | flagged |

## Decision Audit Trail
| # | Phase | Decision | Class | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | Eng | Valuation engine runs in edge fn (Deno), forbid client copy | Mechanical | P5 explicit | Tool runs server-side; locked model must constrain narrative; no drift |
| 2 | Eng | Add `kind` switch in AIAnalyst/ChatProvider/ArtifactPanel + new `artifact_open` SSE event | Mechanical | P1 complete | Panel is hard-wired to `.sheets`; reports render blank without it |
| 3 | Eng | Narrative = bounded structured-output fan-out (1 call/section, parallel, deadline-guarded), assembled server-side; web_search up front | Mechanical | P5 explicit | Agentic per-section interleave blows 15-iter/100s budget; partial-report default |
| 4 | Eng | Artifact carries `status: generating\|complete`; resumable; tool returns compact ref not full model | Mechanical | P1 complete | Avoids half-written ambiguity + prompt bloat across the loop |
| 5 | Eng | EDGAR fetch wrapper: mandated User-Agent + ~10 req/s limiter; cache company_tickers.json | Mechanical | P1 complete | EDGAR 403s without UA; 1MB map shouldn't refetch |
| 6 | Eng | Cache tables app-global: public/auth read, service-role write; FMP key via env/scoped client | Mechanical | P5 explicit | Fundamentals aren't user data; anon JWT can't read app_config under RLS |
| 7 | Eng | Ticker allowlist `^[A-Z0-9.\-]{1,12}$`; CIK only from cached map; encodeURIComponent all segments | Mechanical | P1 complete | SSRF / injection on user-supplied ticker |
| 8 | Eng | Golden test = frozen `tsmc.fundamentals.json` → engine; assert intermediate line items + invariants (BS balances, AE=DCF at no-growth, monotonic grids); separate normalizer replay test; wire `deno test` | Mechanical | P1 complete | Curve-fit final number proves nothing; convention bugs pass otherwise |
| 9 | CEO | Add compliance/disclaimer layer; reframe output as "model signal / illustrative range" | Mechanical | P1 complete | BUY/SELL on a real 2-person portfolio with institutional styling = reliance risk |
| 10 | Eng | Sector-gate the engine: refuse/switch method for banks/insurers/REITs and NI≤0 | Mechanical | P1 complete | AE/EV-EBITDA/net-debt undefined for financials; silent-wrong otherwise |
| 11 | Design | Live section-outline rail; open panel at compute-time (tables instant), stream prose; design error/partial/disambiguation states | Mechanical | P1 complete | Multi-minute wait needs visible progress; unhappy path is the common path |
| 12 | Design | Reuse `ConfirmationCard` for ticker disambiguation | Mechanical | P4 DRY | Wrong ticker → minutes wasted; plumbing already exists |

## NOT in scope (v1, deferred)
- IFRS/20-F full parity beyond best-effort (TSMC = known-degraded path).
- Financials/insurers/REITs/pre-revenue valuation methods (sector-gated out).
- Assumption-override re-run flow ("re-run with WACC 9%") — defer unless trivial.
- Server-side / pixel-exact PDF renderer beyond the v1 choice.

## What already exists (reuse, don't rebuild)
- Artifact persistence + side-panel + staged-edit pattern (`ai_artifacts`, ArtifactPanel, ChatProvider).
- SSE streaming protocol + agentic loop + web_search (ai-analyst).
- Finnhub/FRED/Yahoo fetchers + market cache tables; FMP key in app_config; ConfirmationCard; MarkdownMessage GFM tables.

## GATE OUTCOME — APPROVED (with overrides)
User decisions at the final gate:
- **v1 = Engine + full report (phased).** Build the deterministic engine first as a golden-tested
  internal milestone, then proceed to the full multi-section Report.pdf-style document artifact.
  (User kept the full-report goal; engine-first de-risks it.)
- **Coverage = US us-gaap 10-K filers reliable; TSMC/IFRS supported-but-degraded** behind a
  data-quality banner, golden numbers sourced from Finnhub/FMP rather than EDGAR.
- **PDF/surface = print-clean light "page"** that doubles as full-screen reading mode AND the
  html2pdf export target; dark panel chrome around it. (window.print() rejected.)
- **Recommendation = model-signal wrapper** — BUY/HOLD/SELL kept but labeled "model signal /
  illustrative range" with on-screen + PDF-footer disclaimer. Compliance layer added regardless.

All 12 mechanical fixes in the Decision Audit Trail are accepted as part of the plan.

## Revised build order (kickoff)
1. **Phase 1 — Data adapter** (`get-fundamentals` edge fn): EDGAR companyfacts (us-gaap tag map +
   restatement dedup by `filed`) + UA/rate-limit wrapper + cached ticker→CIK map; Finnhub/FMP(best-
   effort)/FRED/Yahoo enrichment; SSRF allowlist; app-global cache tables; data-quality report.
2. **Phase 2 — Valuation engine** (`valuation.ts`, pure Deno): history/DuPont, CAPM/WACC, 5-yr
   forecast, **Abnormal Earnings (primary)**, DCF, multiples+peer comps, ROE mean-reversion,
   sensitivity grids, sector-gate. Golden test vs frozen `tsmc.fundamentals.json` + invariant tests;
   wire `deno test`. **This is the internal milestone — numbers proven before any report wraps them.**
3. **Phase 3 — Report artifact + renderer**: new `kind:"report"` block-document model; `ReportPanel`
   (light page + outline rail + states) with `kind`-switch in AIAnalyst/ChatProvider/ArtifactPanel;
   `artifact_open` SSE event; `status: generating|complete`; html2pdf export from the page subtree.
4. **Phase 4 — AI assembly + entry**: `generate_research_report` tool (engine → artifact, compact
   tool-result ref); bounded structured-output narrative fan-out (1 call/section, parallel, deadline-
   guarded, web_search up front, assembled server-side); citations; disclaimer/model-signal layer;
   quick button + ConfirmationCard disambiguation kickoff.
