# LayoutLab delivery checklist

Scope authority: [Implementation Brief v2](IMPLEMENTATION_BRIEF_V2.md). Codex plans, coordinates, and independently reviews. One Muse executor owns implementation files during each dispatch. Native Node processes only; no Docker or PostgreSQL. No push, deployment, or paid inference without authorization.

| Milestone | Acceptance gate | Status |
| --- | --- | --- |
| M0 | Environment and current official sources recorded; runtime Meta account/model access smoke evidence; revision-pinned rack asset feasibility experiment with units, bounds, license and conversion assessment | Accepted; environment/asset source reviewed, authenticated access and one actual inference run later verified in M3 |
| M1 | Strict runtime schemas, atomic assignment validation, conservative geometry/navigation, deterministic routing and objective; independently calculated expected values and required negative cases | Accepted: 75 tests, typecheck, build, consumer smoke and independent assertions pass |
| M2 | Browser load, manual edit, evaluate, compare, apply, persistence, report export and replay; English UI, 2D and basic 3D, revision protection | Accepted: 83 core tests, 22 browser tests; independent 390/1440 flow and replay checks pass |
| M3 | Server-side Meta interpretation and proposals with measured feedback; maximum 3 proposals and 4 requests including repairs; timeout, cancellation, concurrency and input limits; separate live evidence | Local and live smoke accepted: one authorized run, 4 real requests, 2 failed attempts + 1 valid worse proposal; baseline retained, replay matched |
| M4 | Bounded demand heuristic sharing evaluator; actual SimReady asset loaded, inspected and attributed; proxies clearly labeled until replaced | Accepted: 96 core + 41 API + 46 browser tests, independent heuristic/source/GLB/browser checks; final wording follow-up verified |
| M5 | Six frozen scenarios, three actual model runs each when authorized; first versus feedback and heuristic comparison, all failures and budgets recorded; deterministic report replay | Offline/fixture readiness accepted from clean source: six cases, 18 fixture trials, 72 local requests, zero real Meta; actual 18-trial benchmark awaits new authorization |
| M6 | Documentation and demo agree with evidence; GitHub repository layoutlab; deployment requires authorization and public verification | Local UI, native start, docs/demo and fresh Windows checkout accepted; public deployment awaits authorized target |

## Remaining delivery gates

User resumed on 2026-11-02 with "lanjut sampai selesai". M6A is accepted after coordinator diff/visual/measurement review and an actual full browser execution. The earlier paused handoff was archived privately; [RESUME_CHECKPOINT.md](RESUME_CHECKPOINT.md) now records the current delivery gates.

- [x] M6A: supplied visual reference, actual-state metric/status attribution, canonical labels/routes, responsive behavior and regressions accepted. Contract: [VISUAL_REFERENCE_PLAN.md](VISUAL_REFERENCE_PLAN.md); result: [VISUAL_IMPLEMENTATION.md](VISUAL_IMPLEMENTATION.md).
- [x] M6B: native production build/start, same-origin web/API, docs/demo and fresh committed Windows checkout accepted. No public deployment is implied by local production verification.
- [ ] M5 live benchmark: after clean source freeze and new paid authorization, six frozen scenarios times three runs, at most 72 Meta requests, actual failure/usage accounting and independent measurement replay. The earlier US$0.10 smoke authorization is consumed.
- [ ] M6 public deployment: user-authorized destination, public smoke checks and evidence. Deployment authorization is still absent.

Reviewed UI and native-runtime code are pushed to the private repository https://github.com/EndPx/layoutlab at code checkpoint d8a3a34b49ae9edccd0ab72d2315f98a99e8775d. Subsequent evidence/documentation commits do not change that tested application code. The initial inspection and older milestone notes below are historical checkpoints.

## Review contract

- For each milestone record results, principal files, commands and outcomes, independent findings, blockers and next gate.
- Review diffs and execution evidence before accepting a worker report. Passing implementer tests alone does not validate measurement.
- Independently compute known-distance routes, weighted frequency, relocation counts, invalid-baseline percentage behavior and candidate selection.
- Keep fixture/stub, live Meta inference, authentic asset integration, benchmark and deployment evidence separate.
- Never claim warehouse customer savings, safety certification, global optimality or model superiority beyond actual evidence.
- Credentials and source configuration stay private and server-side; sanitize evidence.

## Current inspection

- The workspace was empty and was not a Git repository. A new local main branch was initialized here.
- No applicable AGENTS.md was found in the workspace or inspected ancestor directories.
- Node v24.18.0, npm 11.8.0, Git 2.42.0.windows.2 and Orca 1.4.245 are available.
- GitHub CLI is authenticated as EndPx. No remote repository has been created yet.
- No product decision blocks M0. Missing credentials or paid-call authorization must be documented while independent deterministic work continues.

## M0 review

- Result: native environment and pinned genuine NVIDIA rack feasibility experiment documented in M0_ENVIRONMENT.md and evidence/sanitized/m0.json. No app or browser asset integration yet.
- Independent checks: Meta catalog returned HTTP 401 authentication_error; npm registry versions for TypeScript/Vite/Vitest match report; JSON parses; original brief preserved.
- Review findings corrected by Muse: removed tautological assertion, replaced future timestamp with actual time, narrowed source-coverage claim to listed URLs, retained USD bounds inspection script and sanitized output.
- Blockers: application key is to be entered locally by user; inference budget authorization pending. USD-to-browser conversion remains for M4.
- Next gate: deterministic M1 core. Separate live inference gate remains open.

## M1 review

- Result: pure TypeScript core, strict schemas, fixed geometry, atomic proposals, bounded node-grid A*, connector lengths, nearest-neighbor routing, weighted metrics, ranking, revision helpers and verified report replay.
- Checks rerun by coordinator: 75 tests passed; typecheck/build/consumer smoke passed. Independent assertions passed for 16000 weighted travel, 3200 mean, 700 clearance, nonzero 44-mm connector case, forged route/version rejection and duplicate baseline preservation.
- Eight findings corrected by Muse: emitted package exports, omitted connectors, ID collisions, report envelope/version validation, connector regression, silent baseline deduplication, total input caps, full route measurement replay comparison.
- Method limits: bounded conservative grid/connector route; no global-tour guarantee or real-world savings claim. Core APIs require parsed inputs and evaluate-before-apply; M2 must enforce scene identity/settings at apply time.
- Next gate: M2 manual browser workflow and explicitly labeled controlled stub. Live inference, real browser asset integration, benchmark and deployment remain pending.
- GitHub repository https://github.com/EndPx/layoutlab created private at user request; origin configured; no push.

## M2 review

- Result: native React/Vite/Three.js app; manual assignment flow, explicit stub mode, constraints approval, bounded proposals, true grid-route display, guarded apply, persistence, historical export and report replay. Development proxies remain labeled.
- Checks: final 83 core tests and 22 Playwright tests pass; typecheck/build/smoke pass. Coordinator independently ran 390/1440 Chromium flows including invalid/valid edits, stub apply, historical export and Node replay with no page errors or page overflow.
- Review corrected trust-boundary validation, stale constraints, async run races, report identity/provenance, lost export after apply, plan readability, mobile overflow and shared e2e temporary-file collisions.
- Root replay comparison corrected to treat percentage record key order as immaterial while preserving route/array order and rejecting altered measurements; web workaround removed. Regression and independent Node checks pass.
- Authenticated Meta catalog now verified HTTP 200; configured muse-spark-1.3-contributor is listed. Evidence: evidence/sanitized/m0-auth-catalog.json. Key contents never exposed; inference calls remain zero and paid inference is not authorized.
- Next gate: M3 native API, bounded server-side Meta provider, interpretation approval and feedback loop. Fixture transport evidence must remain distinct from actual Meta inference.

## M3 review

- Result: native Express API, server-only Meta provider, prompt run ID with cancellable async interpretation, unresolved-question approval gate, bounded feedback loop, rate/concurrency/body/response limits, live-mode UI and report replay.
- Gates: 83 core + 32 API + 36 browser tests passed, no browser skips/failures; typecheck/build/smoke passed. Fixture transport only; no live Meta inference claimed.
- Coordinator independent HTTP oracle: four transport requests/three proposals; atomic invalid occupancy rejected; 16000-mm swap tie retains baseline; report replay matches. First inference cancellable by prompt run ID; no late post-cancel proposal. Reproduce after build with `node scripts/review-api.mjs` (loopback fake transport only).
- Independent configuration checks: explicit empty env override preserved; unsupported endpoint refused; local API status HTTP 200 confirms configured contributor model and brief caps. Web bundle contains zero matches for the configured private key (key not displayed).
- Reviewed fixes: streaming byte cap, first-request cancellation, terminal guards, fixture provenance, deterministic rate-map bounds, polling/cancel allowance, env loading/precedence, stale UI protection and actual mobile fixture coverage.
- Live gate: key and authenticated catalog available; actual paid inference remains unauthorized/unperformed. Heuristic and genuine browser asset integration remain M4. Deployment remains unauthorized.
- Push authorization: user explicitly authorized pushes after M2; coordinator owns reviewed milestone commits/pushes. M0-M2 remote main was verified at 1117396.

## Authorized live smoke

- User authorized one run, up to four real requests and 2,000 output tokens/request, total cap US$0.10. Run 9ede2950-4326-4dd9-93ec-f6de2dc8bfc0 used configured muse-spark-1.3-contributor and source b854f00.
- Actual: interpretation plus three proposal attempts; first two had no parseable message content; third was valid but 45600 mm versus baseline 36800 mm. Outcome NO_IMPROVEMENT_FOUND, baseline retained. Node and browser report replay matched.
- Usage is partial (usageIncomplete true); no exact charge or model-superiority claim. Conservative preflight cost bound US$0.0664192; invoice not retrieved. No second run or paid retry.
- Evidence and limitations: docs/LIVE_SMOKE.md and sanitized m3-live-smoke artifacts. Future failure handling must retain available usage/finish diagnostics for empty-content responses; historical missing values cannot be invented.

## M4 review

- Result: bounded demand heuristic with separate budgets/counters; baseline-aware measured feedback; exact first-attempt versus best-valid-Meta attribution; actual pinned NVIDIA rack geometry converted to GLB and browser-loaded with calibrated scale/yaw. Markers remain labeled proxies. Physics/MDL metadata is not preserved.
- Repo gates: 96 core + 41 API + 46 browser tests passed, typecheck/build passed. Final copy-only follow-up passed web typecheck/focused flow and independent 390/1440 UI assertions.
- Independent checks: 62000-to-26000-mm oracle with two relocations; budget-one retention; finite NaN normalization; invalid-scene no-search; ranking exhaustion distinguished; old real-Meta report replay preserved.
- Independent artifact check downloaded the pinned NVIDIA geometry and verified hash/bytes, parsed the GLB using Three.js, checked 44104 triangles, source-mapped bounds and canonical rack footprints/ground height at all four yaws. Independent browser checks verified delivered GLB hash, four loaded racks, actual bbox, no page overflow/errors, heuristic/stub separation and report replay at 390/1440.
- Input/feedback review completed: actual HTTP request now includes packing/approach/nav/allowlists, visit frequency separate from units, measured packing distances, and previous/best baseline-relative mapping changes. Invalid scene rejected before any transport call.
- Final display corrections: status counts three generated proposals separately from one heuristic; heuristic relocation reasons use the heuristic label; 3D heading contains no framework name. Updated screenshots retained.
- Next gate: M5 six frozen benchmark scenarios, failure diagnostics and a reviewed benchmark runner. No further paid inference is authorized; the one-run smoke allowance is consumed.

## M5 readiness review

- Result: six frozen synthetic fixtures with fixed contracts/hashes, including two at the brief's small-scene scale; offline/fixture/live-gated benchmark CLI; failed-output usage/finish diagnostics; one shared bounded failure-audit schema; pre-inference canonical-reference gate; lockfile metadata aligned.
- Repo gates: 110 core + 67 API + 50 browser tests passed; typecheck/build passed. Fixture benchmark completed 18 trials / 72 localhost transport requests / zero real Meta requests. Offline and fixture replay matched. Readiness artifacts initially identify uncommitted source; coordinator regenerates them from a committed clean checkpoint before live use.
- Independent BFS (no core geometry/navigation/routing helpers) matched all six baselines and heuristic assignment measurements, plus 81 valid assignments across 18 fixture reports. Known hand values 16000/62000/26000 and historical real-Meta report remain independently verified. Constraints, relocation counts, per-order routes and selected assignment were also checked.
- Independent HTTP checks passed input rejection before transport, four-request cap/three proposals, actual request context/mappings, first-request cancellation, empty-content usage/finish retention, secret redaction and explicit no-measurement audit export.
- Live runner review added authoritative preflight/per-trial server fingerprinting, atomic output claim, immediate pending/run-ID disk journal, HTTP timeouts, readonly reconciliation, ambiguity stop, frozen pairing/coverage checks, and conservative reservations. Target remains six scenarios x three trials, at most 72 actual Meta requests.
- Boundary: actual 18-trial Meta benchmark NOT RUN, no new paid allowance yet. Prior single M3 smoke is separate and fully consumed. No public deployment authorization.

## M6A reference-interface review

- Result: reference hierarchy and compact desktop composition over actual evaluator state; Scenario menu, metric cards, searchable assignments, read-only candidate destinations, current/candidate overlays, camera controls, canonical leader labels, compact history and expandable settings/details.
- Gates: core 110 and API 68 tests, typecheck/build passed in the worker gate. Coordinator independently executed the final full browser suite: 76 passed, zero failed, skipped or flaky. A worker `--list` command had overwritten its JSON report; the coordinator reran the suite and preserved actual execution evidence in `evidence/sanitized/m6-browser-gates.json`.
- Independent checks: four widths (1586/1440/768/390), all actual metrics and frozen historical comparisons, 8000/4600-mm O2 polylines with 700-mm clearance, canonical markers, actual delivered GLB hash and 20 valid assignments across four stub exports. Sample 13-label and benchmark 17-label DOM rectangles have no overlap or out-of-viewport chips at all four widths.
- Findings corrected: excessive panel height, raw LIVE fixture badge, stale-baseline percentage mixing, zoom direction, resize alignment, label packing and subpixel dimensions, product identity hierarchy, recovery-test disclosure access. At 1586x1007 the workspace panels are about 561/577/576 px and comparison starts near y810. The real neutral rack mesh and canonical scenario differ from the reference photograph deliberately; image values/poses are not hardcoded.
- Evidence: `evidence/sanitized/m6-independent-review.json`, `m6-stub-report.json`, final `m6a-*` captures. `node scripts/independent-bfs.mjs evidence/sanitized/m6-stub-report.json` reproduces five valid assignment checks without core routing helpers.
- Blockers: no remaining M6A local blocker. Actual 18-trial Meta benchmark and public deployment remain separately gated.
- Next gate: M6B single native production start, consistent docs/demo, fresh committed Windows checkout. No new paid inference or deployment occurred in M6A.

## M6B native code and production-smoke review

- Result: root `npm start` serves the built planner and `/api` from the same loopback Node server. Static serving is limited to web dist; unknown API/resource paths are real 404s; missing web build gives explicit 503 guidance while API routes remain available. Node engines now reflect the installed test tooling; README, runtime instructions and demo use the actual UI/state sequence.
- Gates: typecheck/build clean; core 110, API 75 (seven new native-serving tests), browser 76 passed with zero failures/skips. The final browser JSON is an actual execution and was not overwritten by `--list`.
- Independent production checks at 1440/390: built HTML, original GLB bytes/MIME/hash, API JSON 404, missing resources and source/dotfile denial, manual edit, stub generation, apply/export/replay, ten BFS-verified valid assignments, no page errors/overflow or inference POSTs. Runtime API oracles still pass after serving changes, including budgets, first-request cancellation, redaction and failure-audit replay.
- Findings corrected: unnecessary shell fallback removed; demo reloads the pristine sample before its expected baseline; actual button labels and pre-approval-only failure-audit boundary corrected. Core failure wording now says no approved report exists, preserving previews, schema/version and evaluator behavior.
- Credential handling review: a discarded worker probe briefly renamed `.env` and restored it. The coordinator verified its presence and moved further keyless verification to an isolated checkout; no key values were printed. A Node child-process probe preserves an empty environment entry; the observed shell-launch behavior is not claimed as a general Windows/Node limitation.
- Evidence: `evidence/sanitized/m6b-code-gates.json`, `m6b-production-review.json`, and [M6_LOCAL_READINESS.md](M6_LOCAL_READINESS.md).
- Next gate: commit this reviewed code, then verify a fresh Windows checkout with `autocrlf=true`, `npm ci`, build and actual native startup without `.env`. This remains a local readiness gate; no public deployment or additional real Meta inference has occurred.

## Final local readiness and frozen evidence

- A fresh checkout of d8a3a34 with `core.autocrlf=true`, no `.env`, Node v24.18.0 and npm 11.8.0 passed `npm ci` (135 packages), `npm run build`, typecheck after build, and 110 core / 75 API tests. A first direct typecheck before build exposed compiled-API imports in browser test helpers; startup/check instructions now explicitly build first. Playwright Chromium already existed on the Windows host, so this is not a fresh operating-system claim.
- The exact Node entrypoint used by `npm start` was booted from a different working directory. A unique asset probe verified module-relative static serving; `/api/status` reported setup_required with no key. Native HTTP/built-browser checks at 1440/390 passed, with zero inference POSTs. The owned test process stopped, its probe was removed, and the checkout stayed clean. All seven frozen scenario/requirements files retained exact manifest bytes/hashes.
- Evidence: `evidence/sanitized/m6b-fresh-checkout.json` and `m6b-fresh-browser.json`. Offline and fixture benchmark artifacts were regenerated from clean d8a3a34; both CLI replays match. Independent BFS/constraints matched six offline cases and 81 valid assignments across 18 fixture reports (72 local requests, zero real Meta, zero scripted failures).
- All authorized local implementation and verification gates are complete. The actual 18-trial Meta benchmark still awaits the requested new service-cost authorization; public deployment awaits an authorized hosting target. Neither gate is marked complete, and no customer-savings or model-superiority claim follows from local evidence.
