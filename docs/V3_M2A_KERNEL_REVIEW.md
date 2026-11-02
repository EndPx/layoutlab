# V3-M2a kernel review: runtime contracts + headless event/clock kernel

Muse implemented; Codex reviews and commits. Scope is ONLY versioned
operations inputs and deterministic headless scheduling. No inventory
mutation, lifecycle fulfillment, transport/traffic planner, UI, full
fixture, model call, or deployment in this slice.

## Files

New package `packages/simulation` (sole owned source):

- `package.json`, `tsconfig.json`, `tsconfig.build.json` — mirror
  `@layoutlab/core` conventions; deps `zod@4.6.7`, devDeps
  `@types/node@26.6.6`, `typescript@7.0.2`, `vitest@5.0.5` (exact
  installed versions, no new framework/service).
- `src/version.ts` — `SIMULATION_VERSION 0.1.0`,
  `OPERATIONS_SCHEMA_VERSION layoutlab.operations/1`,
  `OPERATIONS_ENGINE_VERSION layoutlab.operations-engine/1`.
- `src/schema.ts` — strict bounded `operationsScenarioSchema`,
  `parseOperationsScenario`, inferred `Operations*` types, bound
  constants. No `.default()` on essential fields.
- `src/priorities.ts` — frozen `EVENT_PRIORITY` ordering table.
- `src/travel.ts` — conservative `travelTimeMs` helper.
- `src/kernel.ts` — `createKernel` pure synchronous kernel.
- `src/index.ts` — explicit public export list.
- `smoke.mjs` — built-dist consumer probe (no test framework).
- `test/fixtures.ts` — tiny synthetic fixture builder (raw JSON).
- `test/schema.test.ts`, `test/kernel-order.test.ts`,
  `test/kernel-determinism.test.ts`, `test/kernel-bounds.test.ts`,
  `test/travel.test.ts` — 81 focused tests at first review.
- `test/kernel-review-fixes.test.ts` (21 tests),
  `test/schema-review-fixes.test.ts` (7 tests) — focused regressions for
  the four independent-review findings below; 109 tests total.

Minimal wiring: root `package.json` (workspace + build/test/typecheck
scripts) and `package-lock.json` (+18/−1 lines, npm-generated).
This review doc, plus implemented-vs-future accuracy notes in
`docs/V3_IMPLEMENTATION_PLAN.md` and `docs/RESUME_CHECKPOINT.md`.
No other existing source touched; legacy core/API/R2/UI/asset/fixture
bytes unchanged (see verification below).

## APIs, versions, and documented assumptions

Contracts (`layoutlab.operations/1`, engine
`layoutlab.operations-engine/1`, distinct from legacy
`layoutlab.scenario/1`):

- Integer mm coordinates/heights, integer ms times, integer item /
  handling-unit quantities; safe-integer + explicit caps, no coercion,
  `strictObject` everywhere (unknown keys rejected).
- Storage locations carry `storageAnchorMmXYZ`, `approachPointMmXZ`,
  usable dimensions, storage class, positive `maxQuantity`, and
  `restrictions` (eligible handling classes + optional product
  narrowing). Geometry holds room, racks, and in-area obstacle
  rectangles for later shared renderer/nav consumption; structural
  validation is not path/collision certification.
- Products: per-item dimensions, handling class, integer
  `capacityCostUnits` (item→handling-unit conversion), optional visual
  asset ref. One box is not one item.
- Mobile units: role picker/putaway, footprint + margin, bounded
  speed, load capacity, eligible classes, unique parking slot.
  Resources: receiving/packing/dispatch service positions, service
  capacity, input/output staging, distinct position/queue slots
  (no stacked coordinates), positive service durations. Packing is
  staffed; no mobile worker is double-allocated.
- Provenance (synthetic/reconstructed), storage-only initial stock,
  optional but then complete pre-run home assignment, scheduled order
  lines and inbound deliveries by arrival time (legacy
  `order.frequency` rejected as an unknown key), unit definitions,
  seed, `full-order-all-or-none` reserve policy (declared only;
  accounting starts M2b), per-run event limits, fixed-window horizon
  vs finite-cohort cutoff settings.
- Parse rejects: missing anchor, zero where positive, unsafe /
  fractional / negative numerics, unknown keys/refs, duplicated
  order/agent/location/product/resource/delivery ids (orders and
  deliveries share one work-id namespace), incomplete/ineligible home
  coverage, stock over capacity / mixed products per location /
  ineligible pairs, duplicate parking, stacked slots, degenerate
  obstacles, arrivals past the horizon/cutoff, oversized schedules.
- Initial stock is storage-only with idle resources/empty mobile
  loads; arbitrary mid-run resume is explicitly not validated.

Kernel (`createKernel({ initialEvents?, maxProcessedEvents,
maxEventsPerTimestamp, onEvent })`):

- Ordering `(timeMs, priority, sequence)` with frozen priorities
  COMPLETION 0, ARRIVAL 10, DISPATCH 20, START 30; custom priorities
  allowed in 0..1,000,000. Same-time causal insertions enter among
  pending events (higher priority runs next); executed parents never
  reorder. No scheduling in the past; ids unique across the
  queued/processed/cancelled/stale lifetime; dequeue-before-dispatch
  gives at-most-once execution.
- Caller-driven `schedule/cancel/stepEvent/advanceTo/snapshot/
  restore/reset` plus clock/status/processed/pending getters. No
  timers, wall clock, randomness, network, or DOM. `onEvent` is
  trusted caller-registered reducer code; executable code is never
  deserialized from scenario data.
- Per-RUN processed-event bound plus per-SIMULATION-TIMESTAMP
  zero-time-work bound; neither resets on `advanceTo`/frame calls.
  `cancel(id)` removes pending execution without id reuse;
  `setTaskPlanVersion` (monotonic) makes older task-plan events stale:
  skipped deterministically, callback never invoked, trace retained
  in `staleSkippedIds`. Physical occupancy release stays a later
  controller responsibility.
- Handler errors and bound trips stop the run `invalid` with the
  failed event and diagnostic retained; no further callbacks, no
  success state, pending work kept (clock never jumps past due
  events). Failed events count as processed once, never retried.
  Queue-empty is kernel exhaustion, never an order-completion claim;
  snapshots carry engine version/clock/trace only (key set pinned by
  test), no manufactured SHIPPED/business metrics.
- Inputs cloned at entry, snapshots deep-copied and frozen, handler
  views cloned: no mutable aliasing. `restore` validates engine
  version, limits, shapes, lifetime id partition, clock/sequence
  consistency, and failure-state coherence, then re-sorts pending.
  `reset` restores the creation-time initial schedule exactly
  (post-reset snapshot deep-equals the creation snapshot).
- `travelTimeMs` computes exact `ceil(distanceMm*1000/speed)` via
  BigInt, rejects invalid/unsafe/overflow inputs, returns 0 for zero
  distance. Service durations are positive integer ms at the schema
  level; zero-distance logical actions are capped by the
  zero-time-work bound, not special-cased into loops.

## Exact commands and results (2026-11-03, Node v24.18.0, npm 11.8.0)

- `npm run typecheck --workspace @layoutlab/simulation` — pass.
- `npm run build --workspace @layoutlab/simulation` — pass.
- `npm test --workspace @layoutlab/simulation` — 5 files, 81 tests,
  all pass.
- `npm run smoke --workspace @layoutlab/simulation` — pass:
  `smoke ok: dist bundle parses contracts, 334/1501/1/0, order
  comp/arr/causal/tie-b/tie-a`.
- `npm run typecheck` (root) — pass across core, simulation, api, web.
- `npm run build` (root) — pass (only the pre-existing web chunk-size
  warning).
- `npm test` (root) — core 7 files/111 tests pass, simulation 5
  files/81 tests pass, api 3 files/84 tests pass; exit 0. Core run
  includes the frozen benchmark manifest hashes and the
  sample-36800/heuristic-29800 oracles unchanged.
- `git status --short` — only the pre-existing R2
  modifications/untracked files, my `package.json` /
  `package-lock.json` wiring, `packages/simulation/`, and this doc
  set; `dist/` and `node_modules/` ignored. No `.env` change, no
  key/secret/token/password strings in new files, no paid calls, no
  commit/push, no other agents. No browser suite run: pure kernel
  changes claim no visual testing. The R2 density regression is
  untouched and stays separate.

## Independent oracles (literals, not implementation re-calls)

- Travel: 1000mm@3000mm/s=334ms, 1501mm@1000=1501ms, 1mm@3000=1ms,
  0mm=0ms; overflow past 2147483647ms rejected.
- Ordering at t=10: completion(0), arrival(10), then FIFO ties
  (tie-b before tie-a); causal child at priority 20 pinned between
  arrival parent and priority-30 waiter; earlier time beats higher
  priority.
- Cancellation removes execution, keeps the id claimed, records
  `cancelledIds`; stale plan events skip without callback and record
  `staleSkippedIds`.
- Step-one vs 10/40/160 chunkings vs one headless horizon produce the
  identical literal trace `0:o1, 40:trigger, 40:caused, 50:replan,
  100:new-plan, 120:done`, clock 160, and deep-equal snapshots.
- Zero-time chain with per-timestamp bound 8 executes exactly 8, then
  invalid naming the bound at t=10 with `chain-8` failed and 1
  pending; global bound 3 executes e0–e2, fails e3, clock stays 20;
  chunked vs one-shot bound trips are identical.
- Handler error on `boom` preserves `handler error on boom:
  conveyor jam`, runs nothing later, never retries.
- Reset deep-equals creation snapshot and replays the literal trace;
  backward/non-integer `advanceTo` rejected.

## Implemented vs not implemented

Implemented: versioned operations input contracts + parser + types;
frozen event ordering table; pure headless kernel with schedule,
step, advanceTo, cancel, plan-version staleness, snapshot/restore/
reset; travel-time rounding oracle; 109 focused tests + tiny synthetic
fixtures + built-bundle smoke probe.

Explicitly NOT in this slice: atomic inventory/reservation
accounting and order/inbound lifecycles (M2b); engine-owned
transport/picking/put-away motion and service transitions (M3);
swept-footprint checks, time-space admission, shared zones, fairness,
deadlock recovery (M4); the complete 6-rack/24-slot/12-product/
4-picker/2-putaway/2-packing/1-receiving/1-dispatch slice with
30–50 orders (M5); UI/clocks/controls/cameras/inspectors/overlays
(M6); candidate comparisons and Meta operations patches (M7);
adversarial benchmarks, public guard/release, demo (M8). No
operations report, no renderer, no Meta changes here.

## Blockers

None for M2a. Public Meta guard/key rollout and the deferred R2
regression remain external to this slice and were not touched.

## Review fixes (2026-11-03, same Node/npm toolchain)

Independent repro `.coordination/review-m2a.mjs` exposed four gaps; all
are closed by focused contract corrections in `packages/simulation`
only (no UI/core/API/asset/benchmark/`.env` changes, no commits).
No version bump: still `SIMULATION_VERSION 0.1.0`,
`layoutlab.operations/1`, `layoutlab.operations-engine/1` — these are
corrections inside the unaccepted M2a slice, not a new contract.

1. Invalid bound snapshots now restore. `restore` accepts both genuine
   failure shapes: a dequeued handler failure (failed event is the last
   processed id, still pending-free) and an unexecuted bound failure
   (failed event retained as the head of pending, e.g. e2 pending with
   e1 last processed). Fabricated states are rejected: unknown or
   cancelled/stale failed ids, failed entries disagreeing with their
   pending row, diagnostics naming another event, handler diagnostics
   on pending failures and vice versa, and bound diagnostics whose
   bound is not actually exhausted (global: processedTotal at cap;
   timestamp: failed timestamp's count at cap). Restored-invalid runs
   keep diagnostic/failed/pending/clock, never retry, never invoke
   `onEvent`.
2. Event payloads are bounded plain JSON, validated before any state
   mutation: plain objects/arrays, finite numbers, strings, booleans,
   null; cycles, Date/Map/Set/class instances, BigInt, functions,
   symbols, nested undefined, and non-finite numbers rejected (depth
   32, 10k values, 256k string chars). Rejected `schedule` calls leave
   clock/queue/sequence/claimed ids unchanged (the id stays reusable).
   `restore` enforces the same payload rules atomically: a malformed
   snapshot leaves the kernel exactly as it was.
3. Restore shape hardening: duplicate pending sequences rejected,
   lifetime id count must equal `nextSequence`, `queue-empty`/`ready`
   pin pending occupancy, and timestamp/counter coherence is enforced
   (`timestampOfCount` within clock, `countAtTimestamp` within
   processed total and the per-timestamp cap, processed total within
   the run cap, zero-work counters zero). Shape checks reject malformed
   input; they do not authenticate past history — a future report
   verifier reruns from inputs. Genuine snapshots (valid mid-run,
   both invalid kinds), `reset` (including from invalid), and
   step-vs-chunk draining are regression-pinned.
4. Dedicated planning homes plus single-item fit. Duplicate home
   location ids are rejected; product coverage, ref resolution, and
   eligibility checks are unchanged. A product whose exact item
   dimensions exceed its location's usable bounds under fixed
   orientation (no rotation) is rejected for both `initialStock` and
   `homeAssignments`. No volumetric packing: fixture/smoke quantities
   and `maxQuantity` are documented structural capacity assumptions,
   and exact-fit boundaries pass.

Files changed: `src/kernel.ts` (payload validation, failure-state and
shape validation, `reset` clones genesis outside the payload size
bound), `src/schema.ts` (dedicated homes, fixed-orientation fit),
`test/fixtures.ts` + `smoke.mjs` (structural-capacity scope comments
only), the two new regression files above. Travel literals
334/1501/1/0 and event-order semantics unchanged.

Checks (2026-11-03): sim typecheck/build/test/smoke pass (7 files,
109 tests, incl. all 81 pre-existing); root typecheck and root build
pass (only the pre-existing web chunk-size warning); independent
repro after rebuild shows invalid-snapshot round-trip PASS
(`restoreError: null`), cyclic rejected at schedule before mutation,
duplicate sequences rejected, shared homes rejected. Prior
111-core/84-API results reused: no legacy/root integration change.
No browser suite: pure kernel/schema changes claim no visual testing.

Remaining limits: no volumetric/multi-item packing, no rotation
policy, no inventory/lifecycle/transport/traffic/UI/report scope —
those stay in later slices. After acceptance, sequencing follows the
coordinator-owned `docs/V3_FULL_EXPERIENCE_NEXT.md` (main-app
warehouse environment first, then the engine-owned operations slice).

## Next M2b gate

Coordinator acceptance (2026-11-03): the rebuilt independent counterexample
probe now asserts genuine invalid-snapshot round-trip, pre-mutation cyclic
payload rejection, duplicate-sequence rejection and dedicated-home rejection.
Travel334/1501/1/0 and a separately authored same-time causal-order trace
match literal expectations; the built-consumer smoke passes. Code and
workspace diffs reviewed, with legacy/R2/assets unchanged. M2a is accepted
as runtime contracts and a scheduling kernel, without inventory or operations
completion claims. Proof: `evidence/sanitized/v3-m2a-independent-review.json`.

Execution order now follows `V3_FULL_EXPERIENCE_NEXT.md`: coherent warehouse
in the MAIN application first, then M2b/movement/traffic to complete the first
real concurrent operations slice. The M2b domain gate remains:

Atomic inventory/reservations, order lifecycle, finite resources and
queues on top of these contracts and this kernel: independent
conservation ledger, full-order all-or-none reservation against
eligible stored stock (no inbound-as-pickable), finite capacities,
multiple orders, stock-wait retry on relevant put-away, and explicit
termination for impossible work. No whole-v3 dispatch.
