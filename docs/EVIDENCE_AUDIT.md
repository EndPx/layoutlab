# E1 evidence audit — implementation report

One focused milestone. Detailed source audit lives in [EVIDENCE_BASE.md](EVIDENCE_BASE.md) (single home); this file reports what was changed, checked, and left open at E1 acceptance. No paid benchmark was run during E1. Subsequent authorized execution is recorded in [EVALUATION.md](EVALUATION.md); the historical pending notes below describe the E1 checkpoint.

## Files changed

- `docs/EVIDENCE_BASE.md` — full audit: per-source result/usage table, Araújo arithmetic with caveats (72.11% compatible with 72 rounding; 54 vs 56.44, 66 vs 70.26, annual/hour gaps unresolved, not fraud), page-8 159.6-baseline reconciling note, all eight primary URLs, evidence vocabulary, "not found" scope, executor vs coordinator checks.
- `docs/EVALUATION.md` — frozen fixture provenance matrix (purpose/behavior/values/motivation/simplifications from actual data); bm-04 uniqueness now cites exhaustive proof; display-rounding note.
- `docs/METHODOLOGY.md` — display-rounding rule (exact mm; 1-decimal m/% display-only; titles/exports keep exact mm), report recomputation field contract (all fields already embedded; no schema change), public verification commands, measurement-vs-provenance distinction, future time-conversion rule.
- `README.md`, `docs/DEMO.md` — affected copy only: evidence pointer + `node scripts/verify-report.mjs <report.json>`.
- `scripts/verify-report.mjs` (new, no dependencies) — single-envelope verification via pure core replay, no API/key/network; handles core/M2/M3 reports and M5 failure audits.
- `packages/core/test/independent.test.ts` — sample oracles from coordinator literals: per-order 3400/8000/7200 → 36800; B/D swap 3400/4600/7000 → 29800, 2 relocations, 19.0217% from exact mm.
- `packages/core/test/benchmark-fixtures.test.ts` — bm-04 exhaustive proof: 24 complete assignments, only the baseline valid.
- `apps/web/e2e/m6a-reference.spec.ts` — one assertion: metric title exposes exact `36800 mm`.

Inspected, no change needed: `docs/PRODUCT.md`, `docs/LIMITATIONS.md` (no false claims found); coordinator-owned `MILESTONES.md`/`RESUME_CHECKPOINT.md`, `IMPLEMENTATION_BRIEF_V2.md`, frozen fixtures/manifests, UI/layout, native serving, deps, `.env` (never read).

## Claims corrected

- External percentages are now explicitly operator/vendor-reported or published-not-reproduced; no external saving is presented as a LayoutLab achievement, and fixtures are labeled constructed synthetic (no reconstruction claims, no external datasets).
- No mockup constants found in code (28.4 m / 22.8% absent; 36.8 m appears only as computed/expected values). Sample 36.8 m computes from the fixture; fixtures were not calibrated to any image.
- No presentation files exist in the repo (searched); none created.

## Checks and results

- `npm run build` ✓, `npm run typecheck` ✓ (build first, per browser-helper requirement).
- Core: 111/111 pass (incl. 2 new/extended). API: 75/75 pass (incl. full fixture-benchmark and replay-rejection suites).
- New CLI: PASS on `m6-stub-report.json` (M2, best heuristic) and `m3-live-smoke-report.json` (M3 historical, best baseline); FAIL on tampered total/sequence/percentage with `baseline`/`candidates`/`improvementPercents` labels; failure audit validates with explicit no-approved-measurement notice. Existing benchmark replays still match (offline + fixture).
- Targeted browser: `m6a-reference -g "sample load shows actual baseline truth"` 2/2 pass (desktop + mobile), incl. new exact-mm title assertion. No full browser run (no UI/export behavior changed).
- All eight primary URLs returned HTTP 200/206 this turn; DHL/Logio/Daitum/Araújo-abstract headline figures confirmed on primary pages; Araújo arithmetic rechecked (coordinator PDF details incorporated as attributed).

## Limitations and blockers

- External operational results remain published-not-independently-reproduced by design; Araújo Table 1 vs narrative reconciliation is unresolved in the published material.
- Live 18-trial benchmark not run yet. User authorization up to US$1.50 was granted before this audit; execution follows audit acceptance and clean commit. No public deploy yet.
- None blocking: tree holds only the files above, uncommitted for coordinator review.

## Coordinator acceptance

Accepted after source/diff review and independent network-disabled recomputation checks. Correct core/stub/historical-live reports pass; changes to saved totals, visit sequences, percentages, input frequencies or constraints fail with nonzero exit. Five valid assignments match the independent BFS, and independent constraint enumeration confirms the bm-04 toy contract admits only one of 24 complete assignments. PDF/arithmetic inspection is bounded and is not external operational-results reproduction. The final small follow-up ran 9 focused independent tests and core typecheck; prior full 111-core/75-API and 2-browser evidence remains applicable because no application behavior or evaluator changed.
