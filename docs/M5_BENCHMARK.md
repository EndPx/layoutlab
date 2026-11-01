# M5 benchmark readiness + failure handling

Result: local readiness complete. The frozen 6-scenario benchmark runs offline
(baseline+heuristic, 0 model calls) and in fixture mode (complete 6x3=18-trial
orchestration, 72 transport requests, 0 real Meta requests), with honest
failure accounting end to end. The live Meta benchmark is implemented, gated,
and verified to refuse without authorization — and NOT RUN: no paid inference
was authorized or performed in M5.

## Protocol (frozen)

- Six declared-synthetic scenarios in `fixtures/benchmark/`, pinned by
  `manifest.json` sha256 over geometry/orders/constraints. Runner, replay, and
  tests recheck every hash and refuse on mismatch.
- Same predetermined approved contract (`requirements.json`) for baseline,
  heuristic, and model runs. Interpreted drafts are retained for provenance;
  approval uses the contract, with the manual normalization recorded per trial.
- Per-trial comparison keeps methods separate: current baseline, bounded
  heuristic, ACTUAL first Meta attempt (N/A when invalid), best-valid Meta
  proposal with feedback (winning iteration, N/A when none), and the overall
  selected method (baseline/heuristic/Meta) never credited across methods.
- Invalid baselines yield N/A improvement via core. Failure trials persist the
  failure audit with the report marked unavailable; ambiguous trials preserve
  the run ID with actual counts UNKNOWN (observed lower bound + reserved max).

## Scenario sizes (all valid scenes, fixed racks, canonical JSON)

| Scenario | Racks | Locations | Products | Orders | Baseline (mm) | Heuristic (mm) |
|---|---|---|---|---|---|---|
| bm-01-demand-skew | 2 | 4 | 3 | 3 | 78000 | 32000 (3 relocs) |
| bm-02-copick-cluster | 4 | 12 | 10 | 10 | 218000 | 186000 (2 relocs) |
| bm-03-tight-relocation | 2 | 3 | 2 | 2 | 38000 | 26000 (1 reloc) |
| bm-04-constraints | 2 | 4 | 3 | 3 | 36000 | 36000 retained |
| bm-05-locked-frequent | 4 | 12 | 8 | 10 | 222000 | 196000 (1 reloc) |
| bm-06-unreachable-repair | 2 | 3 | 2 | 2 | invalid (N/A) | 12000 repair |

bm-02 and bm-05 meet the brief small-scene scale (4 racks, 12 locations, 8-10
products, 10 order templates, no zero-frequency padding). All pick endpoints
are grid-aligned (100 mm multiples) for analytical verification. Baselines are
hand-derived open-room Manhattan tours; each scenario also pins a hand-checked
repair mapping (bm-01 swap 42000, bm-02 swap 194000, bm-03 single 26000, bm-04
swap rejected PRODUCT_NOT_ALLOWED, bm-05 swap 210000, bm-06 repair 12000).
The coordinator reports an independent BFS oracle reproducing all six
baselines (78000/218000/38000/36000/222000/null) and the bm-06 repair —
matching these values exactly. No scenario forces an invalid first Meta
proposal; nothing claims global optimality or real-world savings.

## Failure handling

- Empty/nonconforming provider output retains validated usage, finish reason,
  response ID, duration, and error classification as concise sanitized
  diagnostics (never message content or hidden reasoning). Available usage on
  failed attempts is summed; missing stays explicitly incomplete.
- Token counts must be safe nonnegative integers; fractional/overflowing
  values flag incomplete instead of claiming complete accounting. Diagnostic
  strings are key-redacted before any browser/report/log surface.
- Terminal failure/cancel/timeout before approval exports the `m5failure/1`
  audit (scenario/request/nullable requirements/phase/counters/diagnostics/
  source versions) with an explicit no-evaluation boundary — never a
  manual-success report. One shared Zod contract in core serves API, browser,
  and benchmark replay; tampered success claims, over-cap counts, fractional
  counts, and misshapen fields are rejected.
- The M3 smoke's original failure cause remains UNKNOWN. This work retains
  the diagnostics that were discarded then; it does not retrospectively fix
  or explain the original two empty responses.
- Generation: `reasoning_effort: low` (verified supported on Chat
  Completions; `none` returns HTTP 400 for Spark), max 2000 output tokens,
  strict 3-proposal/4-request budgets. Settings plus prompt/config versions
  are recorded in every summary and report.
- Canonical input gate: unknown order/allowlist/lock references refuse with
  INPUT_INVALID/400 before any transport request; ordinary incompatible or
  locked baselines still run because search can repair them.

## Live mode (implemented, gated, NOT RUN)

- `node scripts/m5-benchmark.mjs --mode live --authorize-usd <n>
  --confirm-live-spend` only. Refuses dirty source (commit first; source is
  captured before the output claim so own artifacts never count as drift),
  and refuses without the exact `muse-spark-1.3-contributor` model, exact
  server caps, an authoritative `/api/status` fingerprint match — model,
  budgets, generation, context caps, prompt/API/core versions, route policy,
  heuristic budget — checked at preflight AND before every trial, plus
  per-trial frozen-hash re-verification and authorization covering the FULL
  conservative reservation.
- Fixed 3 trials/scenario, at most 72 total network requests. Full 4-request
  reservation committed BEFORE each trial; atomic output dir + O_EXCL lock;
  pending/reservation journaled before create, run ID journaled immediately
  after 202; bounded HTTP timeouts; one read-only reconcile then AMBIGUOUS
  (no paid retries); full stop on auth denial or ambiguity.
- Conservative bound: max serialized prompt bytes at 4 tokens/char + 2048
  framing-slack tokens + 2000 output tokens at verified Contributor rates
  ($0.10/M in, $0.20/M out): $0.0664192/trial, $1.195546 full run. Reported
  separately from usage estimates; no invoice retrieved; no billed usage
  invented.

## Files

- `fixtures/benchmark/`: 6 scenarios + `requirements.json` + `manifest.json`.
- `apps/api/src/benchmark.ts`, `scripts/m5-benchmark.mjs` (run/replay/
  freeze-manifest), `packages/core/src/failure.ts` (shared audit contract).
- `packages/core/src/validate.ts` (canonical gate), `apps/api/src/
  provider.ts`, `runs.ts`, `server.ts` (diagnostics, audit, status settings).
- `apps/web/src/lib/export.ts`, `api.ts`, `App.tsx` (audit export/import).
- Evidence: `evidence/sanitized/m5-benchmark-offline.{json,md}`,
  `m5-benchmark-fixture.{json,md}` (sourceDirty=true: uncommitted M5 work).

## Commands and results

- `npm test --workspace @layoutlab/core`: 110 passed (96 + 9 fixture + 5 contract).
- `npm test --workspace @layoutlab/api`: 67 passed (41 + 26 M5 incl. fixture-18).
- `npm run typecheck` (3 workspaces) and `npm run build`: clean.
- `node scripts/review-api.mjs`: 4/4 PASS (existing oracle, incl. 16000 tie).
- `node scripts/m5-benchmark.mjs --mode offline`: 6 scenarios, 0 calls, replay true.
- `node scripts/m5-benchmark.mjs --mode fixture`: 18/18 trials, 72 requests, 0 real, 0 failures, replay true.
- `... --mode live` without flags / with $0.01: refused, zero network touch.
- Browser: 50/50 (46 + 4 M5 failure-audit) on the coordinator-restarted server.
- Historical M3 live-smoke report still replays; M2/M3/M4 bytes restored
  identical; no key material in evidence, bundle, logs, or reports.

## Review findings

- Coordinator scale/diagnostics/schema/canonical/live-safety/pairing reviews
  are all implemented and tested (see Commands). Independent BFS baselines
  match runner values exactly.
- Mid-task browser failures were a stale Vite cache serving an app bundle
  without the new core export (blank page); the coordinator restarted the web
  server and the fresh full suite is 50/50. No code workaround was needed.
- `appVersion` in new API reports corrected 0.3.0 → 0.4.0 (historical reports
  untouched). Root lockfile aligned to 0.4.0 for both apps. Full `npm ci` was
  deliberately skipped to keep the coordinator's dev server alive (`npm ls`
  validates the tree instead).

## Blockers and next gate

- Blocker: no benchmark allowance authorized — live execution is forbidden.
- Next gate (coordinator-owned): review, commit, rerun validation on the
  clean tree, then authorize and execute the live 18-trial benchmark. M5
  delivers readiness only; no M6 work started.
