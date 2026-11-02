# V3-M3b connected slice review: headless picking/packing to READY_FOR_DISPATCH

Final Codex verdict: accepted after two review revisions. Independent built
exports pass8/8 assertion groups, including the separate7400ms physical
oracle, horizon/empty-queue stepping, time validation, input/reset isolation,
zero-queue handoff and complete motion/wait audit. Final simulation suite231
tests passes. Earlier base/count descriptions below are historical stages;
the accepted scope remains HEADLESS picking/packing, not complete shipping
or a new public deployment. See V3_M3B_INDEPENDENT_REVIEW.md.

Muse implemented through Orca; Codex plans/coordinates/reviews. One bounded
vertical slice on ONE kernel, ending honestly at READY_FOR_DISPATCH. No
SHIPPED, no dispatch/inbound/putaway completion claim. Ponytail. No UI, paid
calls, commit, push, or deploy.

Base: main `a4f1088` (M2b inventory/resource state + M3a canonical nav/analytic
transport, 207 sim tests, 7 independent transport gates). All prior behavior
preserved. No other coder active. Public still R1.

## Files

New in `packages/simulation/src` (sole owned source plus fixture/proof):

- `operations.ts` — `createOperationsController`, strict
  `operationsExecutionConfigSchema` / `parseOperationsExecutionConfig`
  (`pickDurationMsPerItem`, `unloadDurationMsPerItem`; unknown keys rejected).
  Owns the ONE kernel; binds the M3a admission core via
  `createTransportDomain`; owns M2b inventory store + packing stations;
  order lifecycle; FIFO reservation/assignment; handling/packing completion
  commits; queue/service handshake; finite output attribution; snapshots
  with computed checks; completion + diagnostic.
- `test/m3b-operations.test.ts` — 24 tests (gates 1–4, config/capability,
  plus 9 independent-review revision regressions for findings 1–6, plus 2
  final time-boundary regressions).
- `proof-m3b.mjs` — built-export headless proof (no test framework).
- `fixtures/operations/picking-packing-burst.json` (30,705 bytes,
  `70ec57ab…5014b`) + `picking-packing-burst.runconfig.json`
  (pick 2000/item, unload 1500/item).
- `fixtures/operations/oracles/m3b/connected-slice-proof.json` (6,181 bytes,
  `d08963ed…68df30`).

Edited:

- `packages/simulation/src/transport.ts` — shared-kernel seam only: the
  identical admission core moved into exported `createTransportDomain`
  (bindable kernel, exposed `handleMovementCompleted`); standalone
  `createTransportController` is now a thin wrapper binding its own private
  kernel. No admission, interval, radius, reservation, or diagnostic change.
  Review revision adds one optional observation: `onGrant` receives a
  detached frozen plan+trajectory per successful grant on every path
  (explicit, dispatch, automatic retry); behavior is identical when absent.
- `packages/simulation/src/index.ts` — new exports only (operations,
  `createTransportDomain`/`TransportDomain`/`TransportGrantNotice`).

Untouched: M2b `inventory.ts`/`resources.ts` (no change needed; output
capacity enforced in the operations layer), kernel/priorities/travel/nav/
traffic/schema, all 207 existing tests, accepted main fixture + bindings,
web/API/core/assets/converters/benchmarks/`.env`/coordinator plans/DESIGN.
No new dependencies, frameworks, services, agents.

## One clock and exact handshakes

Arrivals, handling, packing service, and M3a movement run on ONE accepted
kernel owned by the operations controller: 0 completion
(`MOVEMENT_COMPLETED`, `HANDLING_COMPLETED`, `PACK_COMPLETED`), 10 arrival
(`ORDER_ARRIVAL`), 20 dispatch (`OPERATIONS_DISPATCH`). Movement/handling
starts commit synchronously inside dispatch/completion handlers and are
recorded on the timeline. No second clock, no manual time copy. Internal
trusted callbacks only; event data is plain JSON, never deserialized code.

- State: `CREATED -> [WAITING_FOR_STOCK] -> READY_FOR_PICKING -> PICKING ->
  WAITING_FOR_PACKING -> PACKING -> READY_FOR_DISPATCH`, each with its actual
  transition timestamp. No SHIPPED state exists in this slice.
- Transport: every leg is an M3a grant; handling starts only after the
  actual arrival/completion event re-verified pose + task phase. Inventory
  commits once, only at handling completion (`pick`), unload completion
  (`transferToPacking` all lines), pack completion (`packOrder`).
  Rejected/blocked/stale completions change nothing (phase/pose guards plus
  M2b idempotent event IDs).
- Queue: logical `enqueue` first (original request time retained across
  retries), then physical travel to the assigned slot coordinates.
  Travelling-to-queue vs arrived/waiting is explicit in the unit task.
  Controlled release: only the FIFO head's agent enters the queue zone;
  non-heads hold outside at pick approaches (see Deadlocks). The head whose
  lane is free takes an explicit approaching-job reservation while
  transport acquires and travels; `tryStart` runs only after arrival plus
  all input unloaded, preserving M2b FIFO/head/capacity semantics.
- Packing starts only when `packingReadiness` confirms every requested
  quantity physically staged. Staffed service uses the configured
  `serviceDurationMs` (90,000 main; 1,000 micro) with no mobile worker.
- Output: `packedOutput` attribution per resource/order in handling-cost
  units; physical balances stay authoritative in the M2b ledger (no
  duplication). Full output → `completeService(outputBlocked: true)` holds
  the lane with packed-pending stock safe in input staging.
- After unload the picker is reused for FIFO picks or departs in two phases
  (vacate the service position to a logically free station slot, then
  parking), all under transport; nothing teleports. Order-free units whose
  departure still waits can be safely re-tasked (waiting-cancel only).
- Pause is the absence of advance; fixed-window `advanceTo` AND `stepEvent`
  both stop exactly at the horizon with work and partial motion retained and
  never execute anything past the window (oversized-chunk and at-horizon
  advances are byte-identical; repeated calls past the window do not
  progress). A step with an empty future queue reaches the horizon by
  advancing only the clock (no fabricated work/transfers/events), and
  requested times are validated before horizon capping (invalid targets
  throw with the run untouched). Finite-cohort reports
  `SUPPORTED_STAGE_COMPLETE` only when
  every selected order is READY_FOR_DISPATCH — explicitly distinct from
  all-shipped (`backlog` counts unshipped orders, `stageBacklog` the
  picking/packing stage). Post-cutoff orders are excluded (schema bounds
  arrivals at the cutoff).
- Backlog truth: `backlog` = arrived − shipped (M3b never ships, so a
  finished burst reports 6); `stageBacklog` = arrived − readyForDispatch.
  Both appear in counts and every completion variant.
- Inputs are validated and deep-detached at construction (strict scenario +
  execution-config re-parse, then frozen): caller-held objects and returned
  snapshots can never alter the accepted run, and `reset` repeats the
  original frozen inputs.
- Zero-queue packing is a valid direct-service handshake: the admitted job
  drives from its upstream hold to the actual service coordinates with
  head/approach reservation (no fictitious slot); service starts only after
  actual arrival plus full unload; only real slot allocations count against
  queue capacity. A one-job direct run packs on the same 7400ms schedule.
- Motion audit: one grant observer retains every successful grant's actual
  authorized trajectory once (explicit, dispatch, automatic retry), closes
  the exact TRAFFIC wait at grant time, and records a `MOTION_GRANTED`
  timeline entry; the snapshot's `motionHistory` (unit+version unique) makes
  between-timestamps coverage checkable. M3a admission is unchanged.
- Capability: single lane per packing station. Multilane configurations
  (positions > 1 or capacity > 1) are rejected upfront with
  `UNSUPPORTED_MULTILANE` before any stock/run mutation; main uses 2
  separate single-lane stations.
- Dispatch runs only on productive triggers (arrival, movement/handling/
  pack completion) and never reschedules itself: no zero-time busy loop.
  Diagnostics: a transport-alone `IMPOSSIBLE_WAIT` is not reported while
  domain events remain scheduled; a finished cohort is never "stuck"
  (post-completion parking holds stay visible as unit waits).

## Fixture, config, provenance

`picking-packing-burst.json` derives from
`fixtures/operations/main-warehouse.json` (`ce33a9c5…edadef`, 22,374 bytes):
room, racks, obstacles, products, locations, initial stock, home
assignments, all 6 mobile units, and all resource coordinates/capacities/
durations unchanged. Constructed: id/seed/provenance, 6 burst orders
(B-01..B-06 at 0/5/10/15/20/25s, 3–4 items each, single-trip loads),
empty deliveries, finite-cohort cutoff 25000. Both PACK-1/PACK-2 run as
configured (1 lane each, 90s service); queue waits arise from that load.
Putaway units stay idle at occupied parking. The full 28-order + 12-delivery
main fixture is NOT executable here: nonempty deliveries throw
`UNSUPPORTED_DELIVERIES`. All handling durations live in the validated
`picking-packing-burst.runconfig.json`; no hidden constants.

## Deadlocks found and fixed (no forced green)

1. Queue-zone cycle: a non-head agent drove into the queue zone and parked
   across the head's corridor while domain-waiting on that same head
   (traffic/domain wait cycle, no release). Fix: head-gated queue release
   (only the head enters the queue zone).
2. Service-stranding cycle: terminally idle pickers sat on service positions
   with parking routes grazing permanently parked putaway units (M3a
   shortest-path hug vs the 1200mm disc envelope), blocking later heads.
   Fix: two-phase departure (vacate to a free station slot, then parking;
   hold honestly if parking waits).

Neither fix weakens admission: no orders deleted, no service shortened, no
obstacles removed, stationary protection intact. Residual limitation (kept
explicit): adversarial geometries where the only clear detour around a
permanent blocker is non-shortest can still deadlock; full yield/recovery
with waiting bays is v3 backlog.

## Exact commands and results (Node v24.18.0)

- `npm run typecheck --workspace @layoutlab/simulation` — pass.
- `npm run build --workspace @layoutlab/simulation` — pass.
- `npm test --workspace @layoutlab/simulation` — 22 files, 231 tests pass
  (207 pre-existing green + 24 new).
- `node packages/simulation/proof-m3b.mjs` — pass; wrote
  `fixtures/operations/oracles/m3b/connected-slice-proof.json`.
- `npm run typecheck` (root) — pass across core, simulation, api, web.
- `node .coordination/review-m3a-postfix.mjs` — 7/7 pass (transport gates
  preserved after the seam refactor).
- `node .coordination/review-m3b-postfix.mjs` — 8/8 pass on rebuilt exports
  (final time-boundary revision: empty-queue step reaches the horizon,
  invalid targets rejected before capping).
- Core tests not rerun (no core edits). No browser suite (headless slice).
  No `.env` change, no secrets, no paid calls, no commit/push/deploy.

## Oracles (literals, not implementation re-calls)

- Burst: 6/6 READY_FOR_DISPATCH at 179700/139800/236300/277700/374200/
  340900 (SUPPORTED_STAGE_COMPLETE, shipped 0, backlog 6, stageBacklog 0);
  conservation/capacity/safety all empty; maxConcurrentMoving 3 @15000;
  28 motion grants, each unit+version unique, no TRAFFIC wait overlaps
  admitted motion (PK-3 wait 10000..15400 ends exactly at the 15400 grant);
  4 pickers operated; PACK-1 served B-01/B-04/B-05, PACK-2 served
  B-02/B-03/B-06; 4 real BUSY_STATION queue waits with positive durations
  (61400→139800, 106300→179700, 196900→236300, 220200→277700);
  PA-1/PA-2 idle at (15000,1200)/(18000,1200) with empty loads; every pick
  commit preceded by its leg arrival, every unload by its service arrival;
  dispatched bucket empty, no SHIPPED anywhere, diagnostic null.
- Micro: straight legs 2000/1200/1000/2200ms at 1000mm/s; pick 500/item,
  unload 400/item, single 1000ms lane. Pack starts 5100 (= 4700 physical
  arrival + 400) and 10400 (= 10000 + 400, from its own arrival, not O1's
  grant); FIFO waits 2600/2600; READY 6100/11400. Intermediate: @2000
  stored 2/carried 0; @4700 carried 1/staged 0; @6000 staged 1/packed 0.
  Exactly 6 transfers (one pick + unload + pack per order).
- Determinism: one-shot vs chunked 500/4000/1000/250 (headless 1x/4x/16x
  chunk choice) byte-identical snapshots; reset reruns identical;
  mid-horizon (fixed-window 3000) reports WINDOW_ENDED with 0 ready,
  backlog 2, stageBacklog 2, partial motion retained — never finished.
  Independent one-job oracle preserved: 2000 approach, 2500 pick, 6000
  service arrival, 6400 unload/pack start, 7400 pack finish (backlog 1,
  stageBacklog 0); zero-queue direct service hits the same 7400ms schedule.
- Negatives: stock-short waits with zero reservation and byte-identical
  stock; putaway-only fleet → NO_ELIGIBLE_PICKER; oversize →
  UNSUPPORTED_SINGLE_TRIP_REQUIRED with split-trip backlog note;
  second job meets QUEUE_FULL, holds its load, recovers; full output
  holds the lane (output-held) with staged stock safe; unreachable
  approach stops that order (reservation unpicked) and frees the picker
  for the next order. Main-fixture deliveries rejected, never ignored.

## Implemented vs NOT implemented

Implemented: one-kernel operations controller + lifecycle to
READY_FOR_DISPATCH; atomic reservations; eligible FIFO assignment;
reserved-approach travel; handling-committed picks/unloads; carried loads;
physical queue/service handshake with head-gated release and approaching
reservation (plus zero-queue direct handoff); finite staffed packing with
output attribution; two-phase departure; snapshots/timeline/waits/motion
audit/computed checks; completion + diagnostic; burst fixture + runconfig +
proof + 24 tests + this review +
`evidence/sanitized/v3-m3b-connected-slice.json`.

Explicitly NOT in this slice (next bounded tasks): dispatch/SHIPPED,
inbound deliveries, putaway completion, split-trip pickup, formal
operations report/CSV/UI/export/recompute, Meta/experimenter work,
whole-v3 lifecycle/shipment metrics. The v3 backlog is preserved.

## Blockers and next gate

Blockers: none for M3b. Next gate is the bounded dispatch/outbound slice
(or UI Operations wiring on these snapshots), then controlled experiments
per EXPERIMENTER_DELIVERY_PLAN. Awaiting Codex review before push and UI
work. Do not describe warehouse operations or the Experimenter as complete.
