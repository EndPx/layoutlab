# M2 — Manual browser workflow + controlled stub run (report)

Status: implemented, all gates green in this dispatch. No live Meta inference,
no heuristic, no real-asset conversion, no deployment (M3/M4 scope, untouched).

## 1. Result

A native React + Vite + Three.js planner at `apps/web` that loads a scenario,
evaluates it with `@layoutlab/core`, supports manual assignment edits with
visible invalid states, runs an explicitly labeled deterministic STUB proposal
loop (max 3, 0 model requests), compares baseline vs candidates with an
explicit relocation table, applies only valid results after scene identity +
revision + settings + requirements checks with re-evaluation, persists
versioned state, exports a versioned envelope, and replays imports through
core with mismatch reporting. The 2D plan draws true collision-checked route
polylines from a new core projection; the 3D scene is a labeled development
proxy. Verified at 1440px and 390px with zero console/page errors.

Honest numbers (core-computed, sample `warehouse-basic` rev 0, budget 4):
baseline 36800 mm weighted / 5257.1 mean; stub-1 (sku-b→L6) 35600,
stub-2 (sku-c→L6) 51200, stub-3 (sku-d→L6) 36000; best stub-1
(IMPROVED_VALID_ASSIGNMENT, +3.26%). Full record:
`evidence/sanitized/m2-evidence.json`.

## 2. Principal files

- `DESIGN.md` — visual-system contract (tokens, layout, a11y, skipped extras).
- `apps/web/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`,
  `playwright.config.ts` (desktop 1440 + mobile exact 390).
- `apps/web/src/App.tsx` — state, stub async loop, apply guards, export/replay.
- `apps/web/src/lib/`: `planner.ts` (demand/compat/relocations),
  `stub.ts` (deterministic generator), `persist.ts` (strict versioned storage),
  `export.ts` (envelope + provenance-validated replay).
- `apps/web/src/components/`: `LeftPanel`, `CenterView` (2D SVG),
  `ThreeView` (proxy), `RightPanel` (requirements gate + timeline),
  `BottomPanel` (comparison + relocation table).
- `apps/web/e2e/`: `m2-flow.spec.ts` (7 tests), `m2-boundary.spec.ts` (4 tests).
- `packages/core/src/nav.ts` (+`index.ts`, `test/scene-nav.test.ts`) — shared
  A* search with `astarNodePath`/`shortestPathPointsMm` display projection.
  No measurement change: distance derives from the shared path.
- `package.json`, `package-lock.json`, `.gitignore` — workspace + scripts.
- `README.md` — native start instructions.

## 3. Commands and actual results

| Command | Outcome |
|---|---|
| `npm test` (core) | 4 files, 83 tests pass (~1.7 s; 75 M1 + 6 polyline + 2 replay key-order) |
| `npm run typecheck` (core + web) | clean |
| `npm run build` (core + web) | `dist/index.js` + web bundle 909 kB (Three.js; size warning only) |
| `npm run smoke --workspace @layoutlab/core` | oracle 16000/3200/700 ok |
| `npx playwright test` (apps/web) | 22 passed (11 desktop + 11 mobile, ~36 s), 0 console/page errors |
| `node D:\tmp\m2-evidence.mjs` (throwaway probe) | `m2-evidence.json` with stub + replay evidence |

Browser flow covered end to end: load → evaluate → manual edit (valid and
invalid states) → approve → stub generate/compare → valid apply → export →
independent core replay + UI replay; stale apply, cancel, constraint-change
block, async races, malformed imports, tampered envelopes, malicious storage,
persistence reload, and 390/1440 overflow oracles.

## 4. Replay-mismatch investigation (coordinator-observed)

Symptom: main-flow export failed `replayed.matchesSaved` with
`mismatches: ["improvementPercents"]` once manual edits + apply were in the
path; the no-edit stub path always replayed. Expected: `matchesSaved: true`,
`mismatches: []`, baseline 36800, outcome per run.

Root cause (verified with a minimal Node reproduction, then removed): core
`createReport` stores candidates ranked but keys `improvementPercents` in
evaluation-entry order, and `replayReport` compares via order-sensitive
`JSON.stringify`. Any run whose ranked order differs from entry order (mixed
valid/invalid, or valid candidates with different travels) mismatches on key
order alone — measurements identical. Example: entries `[stub-1, stub-2]`
with travels 35600/51200 rank `[stub-1, stub-2]` vs saved ranked order after
a second candidate set; the invalid-candidate case mismatched deterministically.

Fix, corrected to the root layer in a follow-up (narrow core ownership
explicitly authorized as required correctness): `replayReport` now compares
`improvementPercents` as a keyed record via canonical sorted entries, so
insertion order alone can never mismatch identical values. Array, order, and
route measurement comparisons stay order-sensitive on purpose. The earlier
web-only double-`createReport` ranked rebuild in `export.ts` was the wrong
layer and has been removed; export builds one report. Regression tests cover
an unsorted mixed valid/invalid generated report (entry order
invalid/swap/near, ranked near/swap/invalid) plus reordered percentage keys
with identical values; a genuinely changed value and a tampered route still
fail. Verified: core-only Node `createReport` → `replayReport` matches for
unsorted entries with no web export; browser-exported envelopes replay
`matchesSaved: true` via built Node core and via the UI import path;
coordinator review script passes at 390 and 1440. No test was weakened; the
e2e asserts the real replay result.

## 5. Coordinator review rounds addressed (this dispatch)

1. Shared A* search (no duplicated evaluator/renderer search); tests assert
   on-grid/off-grid polyline length matches scalar with ceil connectors,
   every segment collision-free, sample baseline pinned at 36800.
2. Strict persisted schemas (core `assignmentSchema`, max 3 candidates,
   run identity id+revision+fingerprint+runId, approval only with matching
   validated snapshot); envelope provenance validation (modelRequests 0,
   budgets, stub cap, runId, timestamp, mode match); malicious-storage and
   tampered-metadata e2e.
3. Apply guards: current approved requirements must equal run requirements
   plus fresh re-evaluation; strict requirements parsing on approve with live
   re-validation; internal approved-snapshot guard for stub launch; run
   invalidation on load/reset; stale async loops commit nothing (sequence
   guard); route memo suppresses unreachable/budget failures; race e2e.
4. Run identity: original runId persisted/restored with restored-provenance
   label; manual exports mint fresh IDs; timeline says "mapping
   materialized", not "applied".
5. Export-after-apply contract: completed runs export the frozen run report
   under an explicit "Export run report" label ("Export current evaluation"
   otherwise) with a visible historical-scene notice.
6. Readability: 2D primary width, staggered two-line location labels, lock
   badge inside product cell, responsive 3D canvas, no core function names in
   UI copy, proxy/stub labels kept; screenshots inspected as images.
7. Overflow: `.app` explicit `minmax(0,1fr)` column + `min-width: 0` grid
   items + in-panel table scroll (no page clipping); e2e asserts
   `scrollWidth <= viewportSize().width + 1` at exact 390 and 1440.
8. Copy: header/title/notice free of milestone codes; 3D caption is
   user-meaningful; methodology stays in docs.

## 6. Review risks and limits

- Export chunk 909 kB (Three.js); fine for M2, consider code-splitting later.
- One transient mobile main-flow failure under 4-worker parallel load passed
  on isolated rerun and two full-suite reruns; download waits raised to 30 s.
- Stub proposes independent single moves to the first empty compatible slot,
  so several proposals can target the same location (each valid alone against
  the frozen baseline); intended for M2, not a heuristic.
- Core `improvementPercents` key-order sensitivity is fixed at the root
  (section 4); no export workaround remains. Follow-up e2e: first full run
  21/22 with the replay assertion passing and a desktop-only
  `playwright-export.json` unlink race (desktop/mobile projects share fixed
  `process.cwd()` filenames despite `fullyParallel: false`); per the
  coordinator's narrow authorization, specs now use per-test
  `testInfo.outputPath` temp files (no production changes), then 22/22 on
  two consecutive full runs (~33 s each).

## 7. Blockers and next gate

- Blockers: none for M2. Live inference stays unauthorized (0 model requests
  made or attempted); `.env` never read or printed; coordinator-owned dev
  server and `.coordination` files untouched.
- Next gate: M3 server-side Meta interpretation/proposals with measured
  feedback, budgets, and live evidence — only on coordinator dispatch. Do not
  start M3/M4 from this report.

## 8. Evidence (sanitized, no secrets)

`evidence/sanitized/`: `m2-evidence.json` (versions, metrics, stub outcomes,
replay, gates), `m2-desktop-1440.png`, `m2-mobile-390.png`, plus `-2d`/`-3d`
view crops. No live Meta, asset, benchmark, or deployment claims are made.
