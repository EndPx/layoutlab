# V3-M2b state review: atomic inventory + finite resources (headless)

Final coordinator verdict: accepted after the two review revisions. Final
verification: 148 simulation tests pass; package build and all four workspace
typechecks pass; Codex independently ran all 9 built-export assertion groups
successfully. See V3_M2B_INDEPENDENT_REVIEW.md. Earlier counts and pending
verdict wording below describe their respective historical review stages.
Per-position last-release timestamps now prevent backdated reuse of a lane;
same-time release/start and safe parallel use of a distinct lane remain valid.

Synthetic headless milestone only. No movement, traffic, lifecycle wiring,
UI, or Meta work is claimed. Visual reference `docs/UI_REFERENCE_V3.md`
(screen 06 Orders & inventory) was noted as the later consumer of this
state; no UI code was touched.

## Files

New:

- `packages/simulation/src/inventory.ts` — `createInventoryStore(scenario)`,
  physical buckets, reservations, validated transfers, executable invariants.
- `packages/simulation/src/resources.ts` — `createServiceStation(resource)`,
  FIFO queue/service/output-held state machine with explicit timeMs inputs.
- `packages/simulation/test/inventory.test.ts` — 7 acceptance tests.
- `packages/simulation/test/resources.test.ts` — 5 acceptance tests.
- `packages/simulation/proof-m2b.mjs` — built-export headless proof script.
- `fixtures/operations/oracles/m2b/state-proof.json` — sanitized proof output.

Edited:

- `packages/simulation/src/index.ts` — new exports only.

Untouched: schema/kernel/priorities/travel/environment semantics, all
existing tests and fixtures, main-warehouse fixture/bindings, apps, core,
assets, DESIGN.md, coordinator plans. No new dependencies. No schema change
was needed.

## API contracts

Inventory store (all mutating commands take `{eventId, timeMs, ...}`,
validate the whole transaction, then commit or leave state unchanged):

- `acceptInbound` — external delivery line → receiving staging of a
  receiving resource. Rejects over-acceptance and staging overflow.
- `collectPutAway` / `placePutAway` — receiving → carried (put-away role,
  delivery ownership) → storage. Storage checks: handling class,
  product restriction, fixed-orientation item fit, one product per slot,
  maxQuantity.
- `selectPutAwayLocation(productId, quantity)` — pure query: configured
  home first, then location-ID order; otherwise a joined blocker string.
- `reserveOrder` — full-order all-or-none from STORED stock only; short
  lines return `{status:"waiting", reason:"WAITING_FOR_STOCK", shortages}`.
  Retry of a reserved order replays without duplicating.
- `pick` — storage+reservation → carried (picker role, per-order owner,
  all-or-none cart admission). Partial picks keep exact remaining claims.
- `cancelReservation` — releases UNPICKED claims only; carried stock stays
  physical exactly once.
- `transferToPacking` — carried → packing staging for the same order only.
- `packingReadiness(orderId, resourceId)` — ready iff every requested line
  is physically staged; reservations and animation never count.
- `packOrder` / `dispatchOrder` — staged → packed → dispatched, gated on
  physical quantities only (service coordination belongs to the next slice).
- `available`, `bucketTotals`, `checkInvariants` (returns `string[]`,
  computed from live state), `snapshot` (frozen deep copy).
- Duplicate `eventId` with identical payload replays the recorded result;
  with a different payload it throws. Neither path re-applies state.

Resource station (time supplied by the caller/kernel; no internal clock):

- `enqueue` — assigns a concrete queue slot; a full queue returns
  `{status:"waiting-outside", reason:{code:"QUEUE_FULL", ...}}` and
  enqueues nothing.
- `tryStart({jobId, timeMs, inputReady})` — strict FIFO head only
  (`enqueueTimeMs`, then `jobId`); returns structured waits for
  `INPUT_NOT_READY` / `NOT_HEAD` / `NO_CAPACITY`.
- `completeService({jobId, timeMs, outputBlocked})` — rejects completion
  before `start + serviceDurationMs`; held jobs keep their position.
- `releaseOutput` — explicit downstream release frees the position.
- `snapshot` — frozen, FIFO-sorted job views with retained enqueue times.

## Capacity units chosen

- Storage `maxQuantity`: ITEM units per location.
- Cart `loadCapacityUnits`, receiving `outputStagingCapacity`, packing
  `inputStagingCapacity`: HANDLING-COST units
  (`sum(quantity × capacityCostUnits)` per product).
- Queue slots / service positions / `serviceCapacity`: POSITION/JOB
  counts. [Superseded: the initial `min(positions, serviceCapacity)`
  reading is replaced by constructor rejection when capacity exceeds
  physical positions; see revision.] Each in-service or output-held job
  holds exactly one position.
- Staging and queue units are never mixed: a packing queue of 3 slots and
  12 staging units are independent bounds.

## Checks (all green)

- `npm test --workspace @layoutlab/simulation`: 132/132 pass —
  120 pre-existing untouched-green plus 12 new (7 inventory, 5 resources).
- `npm run build --workspace @layoutlab/simulation`: pass.
- `npm run typecheck` (root, all 4 workspaces): pass.
- `node ./proof-m2b.mjs` (built `dist` bundle, no test framework): pass;
  wrote `fixtures/operations/oracles/m2b/state-proof.json`.
- Byte-equivalence: every rejected command in the tests asserts
  `snapshot()` JSON identical before/after.
- Snapshot isolation: snapshots are `Object.isFrozen`; detached-clone
  mutation leaves owned balances unchanged.

## Hand-oracle outcomes (literals, independently asserted in tests AND proof)

- Acceptance 1: O(2A+1B) vs stored 2A+0B → waiting, reserved A = 0;
  1B accepted to receiving → still waiting; put-away to home L-B1 →
  reserved; available A/B = 0/0; storage untouched until picks.
- Acceptance 2: P-B cost 2, 20-unit cart → 10+2 split trips; 11-at-once
  (22 units) rejected; role/unknown/duplicate/destination-full rejected
  byte-equivalent; cancel keeps 2 carried + 2 free; readiness flips only
  at 12/12 staged.
- Acceptance 3: 10/10 receiving fit, 11th rejected; home-then-ID
  selection (L-A1 → L-A2); class/product/size/overflow rejections.
- Acceptance 4 (kernel-driven): A 0→1000, B 1000→2000, B wait 1000;
  at t=1500 B in-service with no finish; blocked-output variant holds
  S1 until release at 1500, B 1500→2500.
- No dynamic-motion, traffic-safety, or shipment-from-service claim is
  made anywhere in the resource tests.

## Implemented vs remaining boundary

Implemented: auditable buckets, reservations, validated domain transfers,
transfer history, executable conservation checks, finite queue/service
state with output-held blocking. Deliberately NOT implemented (next
slices): movement/traffic admission authorizing these transfers, order and
inbound lifecycle controllers, packing/dispatch service↔transfer
handshakes, task dispatching, metrics/report recomputation, UI screens,
Meta tools. Calling `placePutAway`/`pick`/`transferToPacking` records a
transfer the (future) movement controller must authorize first; nothing
here simulates travel.

## Blockers and next gate

Blockers: none. One review note: packing resources in the canonical
fixture declare `serviceCapacity: 2` with a single service position; the
station enforces `min(positions, capacity) = 1` — confirm this reading
with the coordinator before the packing slice, or reconfigure positions.

Next gate: Codex review of this dispatch, then traffic-admitted transport
and the first connected scenario. Operations and Experimenter are NOT
complete.

## Revision: independent-review findings fixed (Codex post-fix verdict pending)

M2b is NOT accepted by this revision; the verdict belongs to the
coordinator after independent post-fix checks. All seven executed
counterexamples now behave per the review contracts; the coordinator's
`docs/V3_M2B_INDEPENDENT_REVIEW.md` and
`.coordination/m2b-independent-counterexamples-initial.json` are preserved
verbatim.

Fixes (smallest coherent changes, same modules):

- Fulfillment history: cumulative per-order picked/packed/dispatched
  survives cancellation. Re-reserve acquires remaining demand only
  (pick-1-of-2, cancel, re-reserve yields 1, carried total 2); a fully
  picked order rejects re-reserve as already fulfilled. Pack/dispatch/pick
  after terminal fulfillment reject under new event ids. Cancel still
  releases outstanding claims only and never recreates picked stock.
  `checkInvariants` now bounds every order line (picked/packed/dispatched
  and picked+outstanding vs demand; order-owned physical equals cumulative
  picks), not just product conservation.
- Idempotency gate is scoped by operation name: same event id under a
  different command rejects byte-equivalent; same op + same payload
  replays unchanged.
- Receiving staging is keyed by resource AND delivery AND product:
  collecting D2/P01 when only D1/P01 was accepted rejects and leaves D1
  stock available; two deliveries of one SKU keep distinct provenance
  through partial collection/put-away. Snapshot receiving rows and
  invariants reflect the attribution.
- Causal time: start before enqueue and release before finish reject
  without allocating; start+duration beyond `MAX_TIME_MS` fails before
  allocation. Old enqueue age is preserved: delayed/retried starts keep
  `waitMs = start - enqueue`, never negative.
- Constructor validates with the shared `operationsResourceSchema`
  (unchanged field semantics) plus narrow slot id/coordinate uniqueness,
  then snapshots duration/capacity/positions: caller mutation cannot alter
  behavior (mutated duration 0 still completes at configured 1000).
- Zero-queue direct service: an idle lane admits one job with
  `queueSlotId: null` (no invented coordinates); a busy lane or a second
  job waits upstream as `QUEUE_FULL` and retries with its original age.
  Two jobs complete legally end to end.
- `serviceCapacity` above the physical position count is rejected at
  construction; the silent `min(positions, capacity)` is gone.

API/semantics changes: `EnqueueResult` queued `queueSlotId` widened to
`string | null` (null only for zero-queue direct admission);
`InventorySnapshot.receiving` rows gain `deliveryId`; new
`InventorySnapshot.fulfillment` per-order cumulative history; new
`operationsResourceSchema` export (schema + index, validator reuse only);
`reserveOrder` shortages now report remaining demand after partial picks;
terminal pack/dispatch/pick/reserve rejections as above.

Capacity units: unchanged (storage `maxQuantity` ITEM units; cart and
staging HANDLING-COST units; queue/service POSITION counts). Concurrency
now equals `serviceCapacity`, which must not exceed physical positions.

Checks: `npm test --workspace @layoutlab/simulation` 144/144 pass
(132 pre-existing untouched-green, incl. original two-job 0/1000/1000/2000
and blocked-output 1500/2500 literals, plus 12 new review regressions);
`npm run build --workspace @layoutlab/simulation` pass; root `npm run
typecheck` (all 4 workspaces) pass; `node ./proof-m2b.mjs` pass with
refreshed `fixtures/operations/oracles/m2b/state-proof.json`; all seven
counterexample scenarios plus the capacity rejection re-verified against
the rebuilt bundle with byte-equivalent snapshots on every rejection.

Pending next-integration blocker (main fixture untouched here):
`fixtures/operations/main-warehouse.json` PACK-1 declares
`serviceCapacity: 2` with positions `[PACK1-S1]` and PACK-2 declares
`serviceCapacity: 2` with `[PACK2-S1]`; constructing live stations from
either now throws. The connected-scene task must reconcile canonical
positions and UI: most likely set each packing station to 1 lane
(`serviceCapacity: 1`), unless the scene intends 2 lanes per station, in
which case add explicit non-overlapping second positions (e.g. `PACK1-S2`
/ `PACK2-S2` with distinct coordinates, no shared floor position) plus
the inspector update. Static environment acceptance is not live capacity
proof.
