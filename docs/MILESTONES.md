# LayoutLab delivery checklist

Scope authority: [Implementation Brief v2](IMPLEMENTATION_BRIEF_V2.md). Codex plans, coordinates, and independently reviews. One Muse executor owns implementation files during each dispatch. Native Node processes only; no Docker or PostgreSQL. No push, deployment, or paid inference without authorization.

| Milestone | Acceptance gate | Status |
| --- | --- | --- |
| M0 | Environment and current official sources recorded; runtime Meta account/model access smoke evidence; revision-pinned rack asset feasibility experiment with units, bounds, license and conversion assessment | Environment and asset experiment reviewed; authenticated inference blocked |
| M1 | Strict runtime schemas, atomic assignment validation, conservative geometry/navigation, deterministic routing and objective; independently calculated expected values and required negative cases | Accepted: 75 tests, typecheck, build, consumer smoke and independent assertions pass |
| M2 | Browser load, manual edit, evaluate, compare, apply, persistence, report export and replay; English UI, 2D and basic 3D, revision protection | Accepted: 83 core tests, 22 browser tests; independent 390/1440 flow and replay checks pass |
| M3 | Server-side Meta interpretation and proposals with measured feedback; maximum 3 proposals and 4 requests including repairs; timeout, cancellation, concurrency and input limits; separate live evidence | Local implementation accepted: 83 core + 32 API + 36 browser tests; actual Meta inference gate pending authorization |
| M4 | Bounded demand heuristic sharing evaluator; actual SimReady asset loaded, inspected and attributed; proxies clearly labeled until replaced | Pending |
| M5 | Six frozen scenarios, three actual model runs each when authorized; first versus feedback and heuristic comparison, all failures and budgets recorded; deterministic report replay | Pending |
| M6 | Documentation and demo agree with evidence; GitHub repository layoutlab requested for later; deployment requires authorization and public verification | Pending |

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
