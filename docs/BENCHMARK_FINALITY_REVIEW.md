# M5 Benchmark Finality Review

Bounded correctness milestone. No paid inference in this task; all verification on local fake transport.

## Root cause

`runTrial` (`apps/api/src/benchmark.ts`) bounded the approve POST with an HTTP timeout. On timeout it ran one read-only reconcile GET: seeing `RUNNING` proved the approval landed, but the code then fetched `/report` immediately. The API server legitimately exports partial reports while `RUNNING` (requirements plus baseline exist), so the runner recorded a stale partial (e.g., 3 requests / 2 proposals), returned, and started the next slot while the model was still active. With concurrency 1 the next create got HTTP 429 `CONCURRENCY_LIMIT`. Repeated over 15 slots: 15 `CREATE_FAILED` with 0 requests and no run ID. The original third trial was affected the same way (partial 3/2, later reconciled terminal 4/3).

## Fix (benchmark consumer only; app partial-report behavior unchanged)

- After any accepted approval (direct 200 or reconciled), poll the same run ID to an actual terminal state before the final report and before the next slot. Same deadline, same 4-request / 3-proposal / 2000-token caps, no POST retry.
- Polls paced at 500 ms (below the API read limit); non-200, malformed, and unknown-state summaries throw conservatively into the existing ambiguous path. `pollTerminal` and `reconcile` both validate `state` against the existing `RunState` union, so `GARBAGE` cannot release a still-active slot. Unsettled outstanding runs stay `AMBIGUOUS` and stop the rest, as before.
- Per-trial usage and counters refresh from the terminal report or failure-audit envelope, not a stale summary; aggregates follow.
- Replay accepts conclusive `CREATE_FAILED` with strict shape only: state `CREATE_FAILED`, `HTTP 4xx` except auth-denial `401`/`403` in `lastError`, null run ID, zero requests and proposals, no report or audit, null comparison and ambiguity, empty normalization and draft, null usage. Bare missing reports, 5xx, auth-denial 401/403 in `CREATE_FAILED` shape, auth states, wrong counters, and pairing mismatches still fail.
- Exported pure `finalizeBenchmarkReport(scenarios, { mode, reservationUsd, provenance })`: validates one explicit phase/source entry per trial, aggregates through the single existing totals path (no duplicated math, no automatic resume). Caller sets freeze and persists the provenance manifest; the benchmark schema itself carries run IDs and reports, not phase labels.

## Files

- `apps/api/src/benchmark.ts`: `pollTerminal` pacing, status check, and `RunState` validation, `reconcile` `RunState` validation, post-approval terminal poll, envelope counters, replay `CREATE_FAILED` branch excluding 401/403, `finalizeBenchmarkReport` plus `PhasedTrialProvenance`.
- `apps/api/test/m5.test.ts`: `M5 post-approval finality` (approve timeout then terminal wait with exact 8-transport-request no-overlap check; unsettled run stays ambiguous; unknown `GARBAGE` state holds ambiguous with create-only POST), `M5 replay of conclusive create refusals` (accept strict 429 shape; accept 429 but reject 401/403 with identical strict shape; reject wrong counters, bare missing, 5xx, auth, pairing mismatch), `M5 phased finalizer` (zero-trial coverage; nonempty 18-trial happy path with independently asserted aggregates; missing/duplicate/unknown provenance rejection).
- `docs/BENCHMARK_FINALITY_REVIEW.md`: this report.

Untouched per ownership: core, math, prompts, model, provider, API server, fixture hashes, native, UI, deployment, agent, `.env`. No worker commit or push. Original `.coordination/m5-live-20261102-authorized` artifacts read-only and preserved immutably.

## Checks

- New focused tests: 429-vs-401/403 identical-shape replay and `GARBAGE`-state ambiguous hold fail on pre-fix code and pass after; phased nonempty happy path and missing/duplicate/unknown add coverage for existing validation with independently asserted aggregates (6/18/18/0/0/0/18/0/18/72/0/false).
- Independent replay proof (built exports, strict zero-request records from preserved live artifacts, verified via `/tmp` without overwriting): 429 `matchesSaved true`, 401/403 `matchesSaved false` with `missing-report-and-audit` after fix; pre-fix all three passed.
- Full `@layoutlab/api` suite rerun: prior report noted a port-allocation failure. First rerun in this task observed 3 files / 84 tests passed in 65s with no port failure; `m5.test.ts` alone 36 passed. All test servers use ephemeral ports (`listen 0`); no fixed ports held. Coordinator focused test `session57457` exited code 0 before edits; no concurrent test remained.
- `typecheck` and `build` for `@layoutlab/api` pass. No UI capture or full browser run: runner-only change.
- No paid calls, no server experiments, no continuation collector execution in this task.

## Remaining limits

- Original authorization cap 72 requests stands: 12 verified terminal Meta requests spent (3 trials at 4 each); the 15 refused slots never created a Model run, leaving at most 60 new requests for continuation. The 3 paid runs must never rerun.
- Coordinator-owned next steps after review: one-use continuation collector with strict roster and cap guards over the 15 unstarted slots, then the separate public budget-guard task. This diff implements neither.
