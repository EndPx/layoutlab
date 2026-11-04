# Full-shift diagnosis — main-warehouse-1, 8 h fixed window (R3a, read-only)

Status: diagnosis only. No engine, UI, fixture, or shared-output file was changed.
All runs used the accepted compiled simulation. The proposed fix was demonstrated
only on a private copy under `.coordination/r3-shift/private-sim/` and is **unmerged**.

## Verdict in one paragraph

The headline result (28 orders / 12 deliveries, 11 shipped, 17 backlog, all 12
deliveries `RECEIVING`, zero invariant errors, replay matched) is **mostly a valid
capacity outcome of an arithmetically infeasible inbound workload**, compounded by
**three real liveness gaps** that let a storage shortage cascade into an outbound
traffic deadlock. It is not a conservation defect, and `WINDOW_ENDED` with backlog
is the honest terminal state for this input. No workload data should be edited to
make the shift look complete.

## 1. Reproduction and provenance

| Item | Value |
| --- | --- |
| Source commit (git HEAD) | `ffed36c233a000953dd5bdc3ad730106f2ec2473` |
| Node | v24.18.0 |
| Scenario | `fixtures/operations/main-warehouse.json`, sha256 `c6e4f208835e31de2554850fa618953bb6f9a1b03c360b137c784bd5112660cb`, 23520 bytes (matches `main-warehouse.bindings.json`) |
| Run config | `fixtures/operations/picking-packing-burst.runconfig.json`, sha256 `48facb5cfd9083240b1ff561d4fb7689b36e63438eebf9429a3c89b4e727f7a1`; `pickDurationMsPerItem 2000`, `unloadDurationMsPerItem 1500` |
| Engine | `packages/simulation/dist/index.js` (workspace dist at HEAD, unmodified), engine `layoutlab.operations-engine/1`, schema `layoutlab.operations/1`, seed `main-warehouse-r1` |
| Window | `fixed-window`, horizon 28,800,000 ms |
| Reproduction | `node scripts/diagnose-full-shift-r3a.mjs` |

Reproduced exactly: counts `selected 28, arrived 28, packed 11, shipped 11,
backlog 17`; checks `conservation/capacity/safety` all empty;
`recomputeOperationsReport` ok with stage `WINDOW_ENDED`; wait mix
`NO_IDLE_PICKER ×13, TRAFFIC ×5, PUTAWAY_NO_LOCATION ×2,
RECEIVING_STAGING_FULL ×1, AWAITING_HEAD ×1` — identical to the coordinator probe.
Per-product before/after buckets conserve for all 12 products
(`physical = initial + accepted`, verified in
[evidence/sanitized/r3-shift-reproduction.json](../evidence/sanitized/r3-shift-reproduction.json)).

Final inventory truth: only **16 of 912 inbound items were ever accepted** (all
P01), 4 were stored, 8 remain in `RCV-1` staging, 4 sit on `PA-2`, and
`D-01` alone still has 68 items external-pending. Every other delivery has
accepted 0 items.

## 2. Exact blocker chain (first decisive events)

All times are simulation ms from the reproduced timeline
(`node scripts/diagnose-full-shift-timeline.mjs`).

1. **t=0** — `D-01` (P01×48 + P02×36 = 84 items) queues and starts on the single
   receiving lane `RCV-1` (serviceCapacity 1, service 120,000 ms, output staging
   capacity **8 handling units**, 2 queue positions).
2. **t=120,000** — service completes; `INBOUND_ACCEPTED D-01 P01x8` fills staging
   to its 8-unit cap. `RECEIVING_STAGING_FULL` opens and never closes. Acceptance
   is partial by design (`tryAcceptInbound`); the lane job is only completed when
   the delivery is **fully** accepted (`finishReceivingIfAccepted`), so `RCV-1`
   stays occupied by `D-01` for the rest of the shift.
3. **t=168,100 — first decisive blocker.** `PA-1` collects 4×P01 (cart capacity 4),
   then `selectPutAwayLocation(P01, 4)` fails: both eligible slots are full
   (`L01 48+4 > 48`, `L13 48+4 > 48`). `PUTAWAY_NO_LOCATION` opens for `PA-1`.
   The freed staging space immediately accepts 4 more P01, so acceptance reaches
   its hand-derived ceiling of 16 and stops: both put-away carts end up holding
   un-placeable 4-item loads or waiting on each other, and staging refills to 8.
4. **t=168,100 → 6,048,800** — picks gradually free `L01` (home-first sourcing).
   When cumulative freed space at one slot reaches 4, `PA-1` finally stores
   4×P01 at `L01` (the only `PUTAWAY_STORED` of the shift). This proves
   pick-freed space **is** usable for put-away (see §4).
5. **t=6,056,800** — empty `PA-1` at the `L01` approach (3000, 8800) tries to
   return to receiving and blocks on `PA-2` (`TRAFFIC TERMINAL_TAIL_CONFLICT`,
   never closes). `PA-2` reaches `RCV-1` at t=6,076,000, collects the next
   4×P01 at t=6,084,000, and immediately re-blocks on `PUTAWAY_NO_LOCATION`
   **while parked on the receiving service position** (4000, 14400). The two
   put-away units now mutually deadlock the two choke points.
6. **t=8,000,000 / 11,042,000 / 14,079,200** — pickers `PK-1` (O-09), `PK-2`
   (O-12), `PK-4` (O-15) block with `TRAFFIC OCCUPIED_GOAL` on the stationary
   `PA-1` disc (radius 799 mm at the `L01` approach, overlapping the `L02`/`L03`
   approaches). These waits run open for 14.7–20.8 M ms (4–5.8 h).
7. **t=13,019,600** — `PK-3` (O-14) waits `AWAITING_HEAD` behind packing job
   `pack-11` (O-12), whose picker `PK-2` is traffic-blocked and never arrives.
   With all four pickers tasked, **O-16…O-28 wait `NO_IDLE_PICKER`** (13 waits).
   Last ship is O-13 at t=12,235,300. Final: 11 shipped, O-09/O-12/O-14/O-15
   stuck mid-flow, 13 orders never started.

Deliveries `D-02…D-12` never start receiving service (`RECEIVING_STARTED ×1` in
the whole shift): `D-02` waits `NO_CAPACITY`, `D-03` `NOT_HEAD`, `D-04…D-12`
`QUEUE_FULL` on arrival, because `D-01`'s job never leaves the lane.

## 3. Why "all deliveries RECEIVING" is arithmetically forced

Hand-derived from the fixture alone (oracle O1,
`node scripts/diagnose-full-shift-oracles.mjs`, 25/25 checks pass):

- Total storage capacity 2,304; initial stock 2,160 (94%); free at t=0 is
  **144 items, all in `L24`** (the P11 overflow slot). Every other slot is
  exactly full (`quantity = maxQuantity`).
- Inbound is 912 items against 154 ordered items. Even if all 28 orders ship,
  storing all inbound needs 2,918 > 2,304. Two distinct lower bounds follow,
  and they must not be conflated. The **global pooled bound is 614**: total
  capacity that can ever hold new stock is 2,304 − (2,160 − 154) = 298 items,
  so 912 − 298 = **614 inbound items can never be stored** even if freed space
  were perfectly fungible across products. It is not, because each slot is
  dedicated (`eligibleProductIds` singleton), so the tighter **per-product
  bound is 695**: summing, per product, `max(0, inbound − (initial free in
  that product's eligible slots + that product's ordered quantity))` gives
  695 (P01 60, P02 51, P03 70, P04 62, P05 48, P06 67, P07 57, P08 70,
  P09 72, P10 59, P11 0, P12 79). The 81-item gap between 695 and 614 is
  capacity stranded in the wrong products (notably P11's 144 free). Maximum
  storable per product (= initial free + total ordered) is e.g. P01 72 vs 12,
  P12 96 vs 17, P09 84 vs 12. **Only P11 fits** (72 inbound vs 144 free + 9
  ordered). Stronger still, every one of the 12 deliveries contains at least
  one line whose quantity alone exceeds that product's maximum storable, so
  no delivery can reach `STORED` without changing declared capacities or the
  workload. Neither bound is a defect to engineer around.
- Therefore zero deliveries reaching `STORED` in aggregate is a valid capacity
  outcome for this fixture. The genuine problem is *how* the system degrades:
  partially-accepted `D-01` pins the single receiving lane (head-of-line), and
  the blocked put-away units gridlock outbound picking, which itself is fully
  feasible (154 items, ample picker/packing throughput as the first 11 orders
  show: each ships within ~200 s of its arrival; sample order arrivals step
  1,000,000 ms apart — about 16.7 minutes, not an hour — and deliveries step
  2,400,000 ms).

## 4. Can pick-freed space be used for put-away? Yes — with a granularity limit

Yes. Picks and put-away share the same storage ledger (`inventory.ts`):
`pick()` decrements slot quantity, and the `awaiting-location` retry loop in
`tryAdvancePutAway` re-runs `selectPutAwayLocation` on every dispatch. The
canonical run demonstrates it end-to-end (step 4 above: picks freed ≥4 at `L01`,
`PA-1` stored at t=6,056,800). Two limits govern the rate:

- **Whole-load, single-slot placement.** Orchestration always selects for the
  full carried quantity (cart load 4) in one slot
  (`slot.quantity + quantity > maxQuantity` rejects). Pick sizes are 1–6 items
  spread by home-first sourcing, so a slot typically frees 1–3 at a time —
  unusable until cumulative picks at that one slot reach 4. The ledger itself
  already supports partial placement (oracle O2: with free=2,
  `select(P01,2)` finds `L01` and `placePutAway(…,2)` succeeds); the
  orchestration never asks.
- **No destination reservation.** Selection is advisory; placement re-validates
  at place time and currently *throws* (see §5, defect D3).

## 5. Classification

| # | Finding | Class | Evidence |
| --- | --- | --- | --- |
| F1 | Inbound exceeds declared storage (global bound 614; per-product bound 695; only P11 fits) | Infeasible input / valid capacity backlog | Oracle O1 arithmetic; §3 |
| F2 | `D-01` (84 items) through 8-unit staging + blocked put-away pins `RCV-1`; D-02…D-12 never start | Under-specified policy (service-completion = full acceptance; single-lane FIFO) | t=120,000 chain; `RECEIVING_STARTED ×1` |
| F3 | Put-away collects a fixed 4-item chunk and requires it to fit one slot whole | Policy gap (smallest-fix candidate A) | t=168,100; oracle O2 |
| F4 | A put-away unit in `awaiting-location` parks indefinitely on the receiving service position; existing parking/vacate logic only covers `idle` units with no pending work | **Implementation liveness gap** (fix candidate B) | `PA-2` at (4000,14400) from t=6,084,000; waits open to horizon |
| F5 | Stationary `PA-1` disc blocks picker legs (`OCCUPIED_GOAL`); no yield, timeout, or deadlock recovery in traffic waits | Safety hold correct; liveness recovery absent/under-specified | Waits 14.7–20.8 M ms open |
| F6 | Place-time capacity is assumed from select time; `placePutAway` throw escapes the event handler → `kernel-invalid` abort | **Confirmed latent defect** (fix candidate C). Masked in the canonical run by traffic serialization; demonstrated end-to-end on the private patched copy (`handler error … location L01 47+4 exceeds maxQuantity 48`, advance status `invalid` at t=6,106,400) | Private demo probe `.coordination/r3-shift/patched-demo.json` (first run) |
| F7 | Conservation, capacity, safety checks empty; offline replay matches | No defect | Reproduction §1 |

Negative controls preserved: with every eligible slot genuinely full, even a
1-item receipt correctly blocks (`select(P01,1)` → blocked, oracle O2), and the
minimal controller case with free=0 leaves the delivery un-stored while the
order still ships from initial stock (oracle O3). The receipt→putaway→dispatch
path itself is sound when a destination genuinely fits (oracle O3 positive:
delivery `STORED`, order `SHIPPED`, `L01` 44−2+4=46 exactly).

## 6. Proposed smallest fix (unmerged, privately demonstrated)

Three small changes, all in `packages/simulation/src/operations.ts`
(no `inventory.ts` change; the ledger already supports them). Full diff:
`.coordination/r3-shift/proposed-patch.diff`.

- **Patch A — placeable-sized collect.** In `tryAdvancePutAway`, size the
  collect chunk to the largest quantity (≤ cart free space) that
  `selectPutAwayLocation` currently accepts; if none fits even 1 item, do not
  collect (the unit stays parked instead of loading up at receiving).
- **Patch B — blocked put-away yields.** In the `awaiting-location` retry, if
  no location is selectable and the unit is idle away from parking, move it to
  its parking slot (load retained, task unchanged); selection keeps retrying
  from parking on every dispatch.
- **Patch C — place-time revalidation.** In `onPutAwayCompleted` (place),
  recompute free space at the target slot, place only what fits, keep any
  remainder carried, and fall back to `awaiting-location` — never let
  `placePutAway` throw out of the handler (fixes F6).

Demonstration (`node scripts/diagnose-full-shift-patched-demo.mjs`, private
copy only): **outbound completes 28/28 shipped, backlog 0**, invariant checks
empty, replay verification ok. Inbound stays honestly blocked (accepted rises
16 → 24 P01 items, 4 put-away stores), deliveries remain `RECEIVING` — the
arithmetic of §3 is untouched, as it must be. This is evidence the three gaps
cause the outbound cascade; it is **not** a merged fix and not a claim that the
shift "passes".

Known hardening items before any merge: close/reopen `PUTAWAY_NO_LOCATION`
wait records consistently across yield/store transitions (the demo leaves one
stale open wait), re-check patch A against deliveries whose first staged row
is unplaceable while a later row would fit, and add the regression probes
below to `packages/simulation/test/m3b-operations.test.ts` (or a new
`putaway-liveness.test.ts`).

**R3b follow-up (private, still unmerged).** The hardened version of A/B/C
now lives in `.coordination/r3-liveness/` with regression tests and a
production-intended patch; see
[PUTAWAY_LIVENESS_REVIEW.md](PUTAWAY_LIVENESS_REVIEW.md). This diagnosis
§§1–5 (reproduction, blocker chain, capacity arithmetic) is unchanged
historical fact; §6's demonstration numbers (accepted 24, 4 stores) describe
the demonstration patch only and are superseded — not reinterpreted — by the
hardened run recorded in the review (accepted 20, 12 stored, same 28/28
outbound, same honest `RECEIVING` deliveries). Production is not fixed until
the coordinator lands that patch.

## 7. What was not done

No root build was run and `packages/simulation/dist` was not touched (R1 lane
active); package test suites were therefore not run in this lane — the
simulation `pretest` rebuilds `dist`. Verification here is reproduction +
independent oracles against the accepted dist, which R3b must complement with
the package suite after its own build. Human/cart envelope work (R2b) is a
dependency for final picker geometry only; nothing here assumes it.

## 8. Next gates (summary; detail in the R3b tasks of the contract doc)

1. R3b-1 (engine): land patches A–C + wait bookkeeping with regression tests;
   gates in §6 and the contract doc. Honest acceptance: O-09/O-12/O-14/O-15
   complete, zero `NO_IDLE_PICKER` waits, invariants + replay green, burst
   fixture results unchanged.
2. R3b-2 (honest full-shift selector): expose the original 28+12 schedule
   beside the burst with per-stage blocked reasons from the snapshot;
   `WINDOW_ENDED` + backlog shown as a valid result, never relabeled.
3. R3b-3 (shared state): implement the planning↔operations contract in
   [SHARED_PLANNING_OPERATIONS_CONTRACT.md](SHARED_PLANNING_OPERATIONS_CONTRACT.md).
4. Explicit policy decision (not a silent fix): whether the receiving lane
   should release before full acceptance / allow lane bypass — currently
   under-specified (F2). Recommendation: decide during R3b scoping; the
   diagnosis does not require it to fix outbound.
