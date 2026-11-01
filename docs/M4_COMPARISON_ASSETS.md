# M4 — Bounded demand heuristic + authentic SimReady rack asset (report)

Status: implemented, all gates green in this dispatch. No paid inference performed or
claimed (fixture transport only; the one-run M3 live allowance stays consumed and untouched).
No push, deployment, or M5/M6 work. Historical M2/M3 reports and the M3 live-smoke artifacts
replay unchanged.

## 1. Result

A deterministic demand heuristic (`demand-greedy-swaps/1`) runs before stub and model
proposals, evaluates every candidate through the existing core evaluator, and joins measured
feedback and best selection with its own explicit candidate-evaluation budget. The browser
loads an actual GLB converted from the pinned NVIDIA `rack_large_empty_a01` geometry (CC-BY-4.0)
for every rack; markers and route remain labeled proxies. Comparison shows current, heuristic,
Meta first, and Meta feedback-selected with exact method labels, actual per-method budgets, and
no equal-compute claim. On the sample scene the heuristic honestly wins (29,800 mm vs baseline
36,800 mm and every fixture proposal) and the UI reports that win as the heuristic's, never as
model improvement.

Honest numbers (sample `warehouse-basic` rev 0, budget 4, fixture transport): baseline 36,800;
heuristic 29,800 (2 relocations, 15/32 evaluations); model fixture proposals 35,600 / invalid /
36,000; best `heuristic` (IMPROVED_VALID_ASSIGNMENT). Independent oracle: baseline 62,000,
heuristic swap 26,000 (2 relocations), hand-computed. Full record:
`evidence/sanitized/m4-evidence.json` (providerKind `fixture`, realMetaRequests 0).

## 2. Heuristic method (`packages/core/src/heuristic.ts`)

- Demand frequency = sum of `order.frequency` per distinct product per order; quantities feed
  units reporting only (oracle pins A=10 despite quantity 5, units 51).
- Locations ranked by measured packing distance (shared aggregate A* budget), then id;
  unreachable trails by id; computation exhaustion is an explicit `ranking-exhausted` status,
  never mislabeled unreachable, and never throws into the UI.
- Locked products (product + requirements locks) stay; compatibility (class, allowlists,
  fixed-orientation fit) enforced; mappings always complete; relocation budget respected via
  bounded greedy repair (lowest-priority reverts first; moved set strictly shrinks).
- Candidates, in fixed order: one greedy construction (rejected outright when incomplete —
  never silent drops), bounded single moves into reachable empty compatible locations, bounded
  pairwise swaps on reachable baseline spots. Baseline-identical and duplicate mappings cost no
  evaluation. Non-finite budgets default instead of bypassing the cap.
- Every candidate evaluated through existing `evaluateCandidate`; selection mirrors core
  objective (travel, relocations, stable key). Result carries `evaluationsUsed/evaluationsBudget`
  plus generation/skip counters, demand/location ranks, and scene status.
- Fixed-scene gate (brief §13): invalid geometry returns INPUT_INVALID diagnostics with no
  ranking, search, or evaluation. Assignment-invalid baselines remain searchable.

## 3. Comparison attribution convention

- Meta first = actual attempt 1 (N/A when invalid, never first-valid substitution).
- Meta feedback-selected = best valid META proposal among all actual attempts, labeled with its
  winning iteration (N/A when none). The M3 smoke shape (2 failures, then valid 45,600 vs
  baseline 36,800) renders feedback-selected 45,600 with overall selection baseline 36,800.
- Overall selected spans baseline+heuristic+Meta and is labeled separately, so a retained
  baseline or heuristic win cannot be credited to Meta.
- Exact method labels (`current`, `heuristic`, `meta-first`, `meta-feedback`, `stub`, `other`)
  shared by core, API, and web. Every surface states actual budgets and that budgets differ
  across methods (no equal-compute claim).

## 4. Meta input context completeness (brief §20)

The scenario summary now carries `packingPointMm`, per-location `pickPointMm`, nav settings
(`cart`, `minimumPassageWidthMm`, `gridSizeMm`), configured allowlists (null when unconfigured),
split `demandFrequency`/`demandUnits`, and — for proposal summaries built after the heuristic —
reused measured `packingDistances` (evaluator data, never model estimates). Feedback carries
baseline-relative `changes` (sorted by productId) for every evaluated mapping including the
heuristic, and `bestValidSoFar` carries the winning mapping's changes. Best-so-far seeds from
the actual valid baseline with the shared objective (travel, relocations, stable key), so a
valid-but-worse heuristic is never labeled best. Fake-transport tests assert the model receives
these fields. Prompt version `layoutlab.m4prompt/1`; instructions unchanged.

## 5. API integration (`apps/api`)

- New `RUNNING_HEURISTIC` phase between baseline evaluation and the first proposal; heuristic
  consumes zero model requests. Heuristic result joins measured feedback (leading entry) and
  best selection; a heuristic win is reported honestly.
- Shared scene gate: creation rejects invalid geometry with 400 INPUT_INVALID before any run
  state or inference spend; approval carries a defense-in-depth FAILED path with no further spend.
- Compatible M3 envelope extension (version string unchanged, measurement untouched):
  `heuristic` block (counter, budget, method, reason, flags, candidate), `methodLabels`,
  `candidateBudgets`, `assetRefs` (GLB ref + hash per rack, locked to the manifest by test).
  The candidates-vs-proposals rule counts model mappings only, so legitimate heuristic+3-model
  reports pass; historical envelopes without the new blocks keep the original rules.
- App/provider versions 0.4.0; core/evaluator versions unchanged (no measurement change).

## 6. Web integration (`apps/web`)

- Stub runs execute the heuristic first (sync, deterministic), then explicitly labeled stub
  proposals; live runs surface the server heuristic identically. Comparison table gains a Method
  column, a per-method budgets line, and the four-way summary (current / heuristic / Meta first /
  Meta feedback-selected + overall selected; stub best in stub mode). Heuristic candidates apply
  under the existing guards. Persistence keeps the heuristic separate from stub rows with strict
  validation; historical states restore.
- M2/M3 envelope validators accept the M4 extension and enforce heuristic presence/budget/label
  consistency; historical smoke and M2 envelopes replay without the new fields.
- 3D: one cached GLB fetch, one instance per rack with canonical per-axis scale + yaw at
  footprint centers; markers/packing/route unchanged proxies. Load status, instance count, and
  first-rack bbox are exposed as data attributes for tests; GLB failure falls back to labeled
  proxy boxes. 2D plan untouched.

## 7. Asset integration

Actual browser GLB from pinned source geometry (no handcrafted substitute), simplified neutral
material (original MDL not preserved), Z-up → Y-up with ground origin, bounds calibrated within
1 mm, canonical per-rack scaling, evaluator-independent. Full provenance, conversion contract,
discarded features, and attribution: [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md) and the manifest.
GLB conversion does NOT preserve SimReady physics metadata.

## 8. Principal files

- `packages/core/src/heuristic.ts`, `test/heuristic.test.ts` (13), `fixtures/test/heuristic-oracle.json`.
- `apps/api/src/runs.ts` (phase/feedback/selection/gates/envelope), `prompts.ts` (context),
  `config.ts` (heuristic budget, 0.4.0), `test/api.test.ts` (41).
- `apps/web/src/lib/{export,api,persist,rackAsset}.ts`, `App.tsx`, `BottomPanel/RightPanel/ThreeView`,
  `e2e/m4-heuristic-asset.spec.ts` (5×2 projects), `public/assets/rack_large_empty_a01.glb`.
- `assets/manifests/rack_large_empty_a01.manifest.json`, `assets/licenses/…-LICENSE.txt`.
- `scripts/m4-asset-fetch.mjs`, `m4-usd-inspect.py`, `m4-usd-to-glb.py`, `m4-asset-verify.mjs`,
  `m4-evidence.mjs`.
- `docs/M4_COMPARISON_ASSETS.md` (this file), `docs/ASSET_PROVENANCE.md`,
  `evidence/sanitized/m4-evidence.json`, `m4-*.png`.

## 9. Commands and actual results

| Command | Outcome |
|---|---|
| `npm test --workspace @layoutlab/core` | 5 files, 96 tests pass |
| `npm test --workspace @layoutlab/api` | 41 tests pass |
| `npm run typecheck` | clean (core + api + web) |
| `npm run build` | ok (core + api + web; pre-existing chunk-size note) |
| `npm run e2e --workspace @layoutlab/web` | 46 passed, 0 skipped, 0 console/page errors |
| `node scripts/review-api.mjs` | both coordinator HTTP oracles PASS unchanged |
| `node scripts/m4-asset-verify.mjs apps/web/public/assets/rack_large_empty_a01.glb` | PASS (44,104 tris, calibrated, hash match) |
| `node scripts/m4-evidence.mjs --core 96 --api 41 --e2e-pass 46 --e2e-skip 0` | `m4-evidence.json`, replay true |

## 10. Coordinator review gates addressed (this dispatch)

1. Attribution convention: actual-first/N/A, best-valid-Meta + iteration, separate overall
   selection (UI + envelopes + docs).
2. Heuristic bounds: non-finite budget default with tests; aggregate ranking budget with explicit
   exhaustion status (never unreachable, never throws); fixed-scene gate in core, API
   create/approve, and web generation with tests at each layer.
3. Independent GLB checks passed (coordinator-owned); browser load/scale/e2e gate kept and green.
4. Feedback best-so-far seeds from the valid baseline with the shared objective; trap test
   (valid 16000 baseline vs worse valid heuristic/proposal) keeps baseline best.
5. Meta context completeness: packing/approach points, nav settings, allowlists, split demand,
   measured distances, baseline-relative feedback mappings; fake-transport assertions on actual
   request bodies.

## 11. Findings, blockers, next gate

- The sample scene's heuristic (29,800) beats the M2 stub best (35,600) and every fixture model
  proposal; existing best-selection expectations were updated to the honest winner without
  weakening any test's original intent (invalids still displaced nothing among model attempts).
- Failure-then-valid Meta shapes (M3 smoke) now attribute correctly: feedback-selected shows the
  valid Meta result while overall selection retains the better baseline.
- M2/M3 screenshots regenerated by the suite were restored to committed bytes; M4 evidence has
  its own shots. `.coordination` outputs are gitignored script fallout, left for the coordinator.
- Blockers: none for M4. Paid inference remains unauthorized (no calls made); `.env` never read.
- Next gate: M5 benchmark — only on coordinator dispatch. Do not start M5/M6 from this report.

## 12. Follow-up copy fixes (M4 final, no logic change)

- Stub completion status now counts generated proposals separately from the heuristic
  candidate (`3 generated proposal(s) + 1 heuristic candidate` on the sample); max-3 stub,
  0 model requests, and the separate heuristic budget line are unchanged.
- Relocation reasons for the heuristic row are prefixed `heuristic`, never the provider
  label, in both stub and live comparison.
- 3D view heading is now `3D warehouse` (framework name removed from the product flow).
