# Human telemetry acceptance

Focused source-level acceptance passed: 1 file, 3 tests with installed Vitest 5.0.5; simulation no-emit TypeScript check exited 0. Commands from repository root:

```
./node_modules/.bin/vitest.cmd run packages/simulation/test/human-telemetry.test.ts
./node_modules/.bin/tsc.cmd --noEmit -p packages/simulation/tsconfig.json
```

The six-order finite burst compares the entire exported report with immutable archived 0.1.1, plus inventory, counts, orders, timeline, and history metadata. Historical history has no segments; replay recomputation still succeeds. No report version/schema/output change was observed.

The actual controller exposes six finite scalar fields per segment, matching history boundaries/counts. A sampled active grant midpoint matches the authoritative controller pose using interpolation, with a separate literal interpolation/clamping oracle. Returned snapshots are deeply frozen: scalar assignments and array splice throw TypeError, and subsequent controller snapshots and completed reports remain identical to an independently driven controller. Reset empties history and reproduces a fresh paired run.

Limitations: only one active segment is sampled against controller pose; total traveled distance and every grant endpoint are not independently checked. Zero-duration stationary interpolation is covered by a literal oracle, not a controller-generated zero-duration grant. Unknown-version rejection is covered by the existing human-archive-routing test, not rerun here. Renderer replay fallback for unknown segment fields is outside this source-only acceptance. Acceptance is therefore partial against the full requested matrix, despite the focused executable tests passing.

An initial reset comparison used different clock-driving schedules and exposed a 50ms terminal sampling difference; paired identical driving passes. This is not attributed to telemetry. No source algorithm, web, archive or shared dist was modified; no paid call, credentials, commit, push or deployment was performed. Evidence is in evidence/sanitized/human-telemetry/.

## Bounded matrix closure

The two added targeted cases now pass (2 passed, 3 existing cases skipped; 1 file). Simulation no-emit typecheck again exits 0. The prior three tests and archive-parity case are unchanged. Closure commands:

```
./node_modules/.bin/vitest.cmd run packages/simulation/test/human-telemetry.test.ts -t 'matches every burst grant|represents an actual transport'
./node_modules/.bin/tsc.cmd --noEmit -p packages/simulation/tsconfig.json
```

A single event-stepped finite six-order run records all observed authorizedRoute plans keyed by unitId and planVersion. Every retained history grant must have a corresponding independently observed plan, with equal segment count, route-point endpoints, Euclidean total distance (1e-6 tolerance), grant start/end, and contiguous adjacent positions/times. Positive-distance segments require positive duration. Unique retained grants and observed plans have equal cardinality, covering all grants retained during this run regardless of explicit/queued/automatic admission path. The test bounds the run at 10000 events and requires successful stage completion.

Operations deliberately bypasses a no-op first approach in src/operations.ts:1502-1505: equal pose sets picking and schedules pick completion without requesting transport. The equivalent next-leg bypass is at 3076. Consequently the actual zero-distance grant is exercised at the transport controller boundary using a controlled unit initially at the approach (1000,1000), requesting that same destination. It grants one point, zero distance, zero duration, equal start/end and an empty actual onGrant trajectory; advancing preserves pose. This exercises the production single-point/empty-segment branch in src/transport.ts:588-591 without fabricating a grant.

These tests close the bounded telemetry matrix gaps identified above; no telemetry defect was found. This supersedes the earlier partial verdict for source/controller telemetry only, and does not claim renderer fallback or public deployment verification. New evidence: closure-vitest.txt and closure-typecheck.txt in evidence/sanitized/human-telemetry/.
