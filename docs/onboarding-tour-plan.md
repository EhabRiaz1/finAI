<!-- /autoplan restore point: /Users/ehabriaz/.gstack/projects/EhabRiaz1-finAI/main-autoplan-restore-20260616-164038.md -->
# Onboarding Tour — Rough Plan

## Intent (user)
New users should get a guided tour of the whole app with Next / Skip buttons. The
tour should show them how to add things (holdings, bonds, watchlist), and ideally
the tour itself can demonstrate by adding some stuff as it goes.

## What we're building on (current state)
- React 19 + Vite, Supabase auth + RLS. No router library — page navigation is the
  `active` state in `Terminal` (`finance_ai_app.jsx:31`), switched via `setActive`.
- `WelcomeIntro` (full-screen "Welcome, {name}" overlay) plays once per session from
  `Gate`, in-memory only (`introDone`), replays on each sign-in.
- Pages: Dashboard, Portfolio, Bonds, Balances, Research, Portfolio News, AI Analyst,
  (Admin). Sidebar nav in `Chrome.jsx`.
- "Add" flows: `AddPositionModal` (Portfolio, local `modal` state → `useHoldings.addEquity`),
  `AddBondForm`/`AddEquityForm`, watchlist via `useWatchlist`. All writes hit Supabase.
- No `data-tour` / id anchors exist on any element today.

## Proposed approach (rough)
1. A tour controller (overlay) that can: highlight a target element, show a tooltip
   with copy + Next / Back / Skip, and advance through an ordered step list.
2. Steps span pages, so the tour must be able to call `setActive` to navigate
   (Dashboard → Portfolio → Bonds → ...). Tour mounts inside `Terminal` (where
   `setActive` lives).
3. Add stable anchors (`data-tour="..."`) to the elements each step points at
   (sidebar items, "Add Position" button, ticker tape, AI button, etc.).
4. Steps that teach "how to add": point at the Add button, open the modal, explain
   fields. Possibly an interactive step where the tour opens `AddPositionModal`.
5. "Tour adds stuff": optionally have the tour insert a demo holding (e.g. AAPL) so
   the dashboard lights up, so the user sees what a populated terminal looks like.
6. Persist completion so the tour shows once (first run), with a way to replay it.
7. Entry: auto-start for brand-new users after `WelcomeIntro`; manual replay from a
   menu / help button.

## Open questions
- Should "the tour adds stuff" write into the user's REAL portfolio, or use a
  reversible/sandboxed demo? (Data integrity in a finance app.)
- Build custom vs. adopt a library (driver.js / react-joyride / shepherd)?
- Persist completion in localStorage vs. Supabase (per-user, cross-device)?
- How do tour steps drive page-local state like the Portfolio modal open/close?
---

# GSTACK /autoplan REVIEW REPORT
Mode: SELECTIVE EXPANSION · Voices: Claude subagent only ([subagent-only]; codex not installed)
Phases run: CEO → Design → Eng. DX skipped (end-user feature, not developer-facing).

## What already exists (reuse — don't rebuild)
| Need | Existing | File |
|---|---|---|
| Page navigation | `active` state + `setActive` | finance_ai_app.jsx:31,87 |
| One-time overlay pattern | `WelcomeIntro` (fixed inset, reduced-motion, onDone) | components/WelcomeIntro.jsx |
| Modal/scrim pattern | `AddPositionModal` (rgba scrim, COLORS.panel card, 1px border) | components/AddPositionModal.jsx:71 |
| Add-holding flow | `useHoldings.addEquity` → Supabase insert + `registerInstrument` | hooks/useHoldings.js:34,5 |
| Visual language | dark #0a0a0a, amber #f5a524, mono kickers, serif headlines, zero radius | lib/theme.js |
| Active-element highlight | sidebar active = 2px amber left-border + 5% amber fill | components/Chrome.jsx:154 |

## Consensus across voices (CEO / Design / Eng)
| Dimension | Verdict | Note |
|---|---|---|
| Tour writes real holdings to Supabase? | **CONFIRMED: NO** (all 3, critical) | Corrupts NAV/returns/beta; breaks trust. Cross-phase theme. |
| 7-page march vs short arc | **CONFIRMED: short** (CEO+Design) | ≤5 steps, single "get your first position in" narrative. |
| Anchors are step-zero, not a footnote | **CONFIRMED** (Design+Eng) | No anchors exist; conditional page render = anchor-not-mounted race. |
| Controller in `Terminal` | **CONFIRMED: correct** | `setActive` lives there. Page-local modal state via TourContext bus. |
| Build custom vs library (driver.js) | **DISAGREE** (Design: custom for aesthetic; Eng: driver.js for geometry) | → taste decision, user gate. |
| Persistence | localStorage (CEO: cheap) vs Supabase per-user (Design+Eng) | auto-decided Supabase, mirror localStorage. |

## Architecture sketch (auto-decided)
```
Gate (WelcomeIntro, once/session)
  onDone ──▶ Terminal
              ├─ setActive(page)          (controller drives nav)
              ├─ <TourProvider>           (step list + imperative bus)
              │     controller: waitForAnchor → scrollIntoView → spotlight → tooltip
              │     bus events: 'open-add-position' etc.
              ├─ pages subscribe to bus (Portfolio forces its own `modal` state)
              └─ data-tour="..." anchors on STABLE containers (nav buttons, +POSITION, NAV tile, ASK AI)
persistence: profiles.onboarded_at (Supabase, RLS) + localStorage mirror for first-paint; ref-guard StrictMode
```

## Failure modes registry
| Mode | Trigger | Handling (auto-decided) |
|---|---|---|
| Anchor not mounted | setActive then measure before React commits / data loads | wait (MutationObserver/rAF retry) + timeout → centered tooltip, no spotlight |
| Empty portfolio (default new user) | NAV $0, no holding rows | steps point at empty-state CTA, not data rows |
| Spotlight on animated ticker | fa-marquee drift | don't anchor to ticker, or pause animation that step |
| Off-screen target | internal overflow:auto scroll | scrollIntoView before measure; re-measure on resize+scroll |
| StrictMode double effect | auto-start + complete-write fire twice | startedRef idempotency guard |
| Z-index collision | modal=1000, welcome=9999 | explicit scale in theme.js (backdrop 1500 / popover 1600); start only after introDone |
| Admin nav step | admin item only for admin@finance.ai | exclude admin; filter conditional steps |
| Narrow width | sidebar fixed 200px, desktop-locked | <720px → single centered card, no spotlight |

## NOT in scope (deferred)
- Activation funnel instrumentation (signup→first holding→returns). CEO voice rec; do first ideally, but separate work → TODOS.
- Full demo sandbox (`is_demo` column + edge-function seeding + remove-demo UI). Separate project if real seeding ever wanted.
- Responsive redesign of the terminal layout.

## Decision Audit Trail
| # | Phase | Decision | Class | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO | DX phase skipped | Mechanical | P3 | End-user feature; no dev-facing surface |
| 2 | Design | ≤5-step single-arc tour, not 7-page march | Taste→auto | P5+P1 | Coverage ≠ activation; reduce skip rate |
| 3 | Eng | Controller in Terminal + TourContext bus for page-local state | Mechanical | P5 | setActive lives there; avoids prop-drilling |
| 4 | Eng | Anchor wait + scrollIntoView + timeout fallback | Mechanical | P1 | Conditional rendering guarantees the race |
| 5 | Eng | Persist in Supabase (profiles.onboarded_at) + localStorage mirror, ref-guard | Taste→auto | P1 | Once-per-user beats per-device; StrictMode-safe |
| 6 | Design | Amber-outline spotlight + reduced-motion parity, no click-outside dismiss | Mechanical | P1+P5 | Matches existing language; dark-on-dark dimming fails |
| 7 | CEO | Funnel analytics + demo sandbox → NOT in scope | Mechanical | P3 | Separate work, not this feature |

## Decisions escalated to user (gate)
- **D1 Premise/approach**: tour-as-specced vs activation-first reframe.
- **D2 User challenge**: does the tour write real data? (all voices: no).
- **D3 Taste**: build custom vs driver.js (Design vs Eng disagree).
