# Put-away liveness review — hardened patches A/B/C (R3b, private, unmerged)

Status: implemented and verified **only** in the isolated private copy
`.coordination/r3-liveness/private-sim/`. Main `packages/simulation/src`,
tests, fixtures, and `dist` are untouched (baseline hashes below). Production
is **not** fixed; the coordinator lands the handoff patch through the normal
integration gate. Diagnosis background: [FULL_SHIFT_DIAGNOSIS.md](FULL_SHIFT_DIAGNOSIS.md).

## 1. Handoff artifacts

| Artifact | Value |
| --- | --- |
| Production-intended patch | `.coordination/r3-liveness/handoff/production-intended.patch`, sha256 `180BB7B51E85FCE387579AF932313FAB4C922D72EDFC0877D4F04F8802A613CC`, 1 file, +246/−62, applies cleanly to main `operations.ts` (`git apply --check` passes; an applied scratch copy is byte-identical to the private source modulo line endings) |
| Regression tests | `.coordination/r3-liveness/handoff/putaway-liveness.test.ts`, sha256 `BAEC8CB68B1559EC2825744705270549221BA419EA72464C02A38EAF62542AF8`; intended landing path `packages/simulation/test/putaway-liveness.test.ts` (its `../src/index.js` import resolves correctly there) |
| Private engine source | `.coordination/r3-liveness/private-sim/src/operations.ts`, sha256 `528213AFF31C730A6B08C80222582FCBDDE8906AA18B3F8E4CCEFC6B65E2E2BC` |
| Baseline (unchanged) | git HEAD `fc23b4a47d8f079530c52cf07a21ed0e7da3ac6d`; main `operations.ts` sha256 `6BAE27C229C1EFE983B2BDFA9C1D762A497ED9610BCB04C6CB5B66231E36AFCF` before and after this work; full table in `.coordination/r3-liveness/baseline-hashes.txt` |
| Evidence | `evidence/sanitized/r3-liveness-fullshift-main.json`, `evidence/sanitized/r3-liveness-burst.json`; runners `scripts/diagnose-putaway-liveness-fullshift.mjs`, `scripts/diagnose-putaway-liveness-explore.mjs` |

## 2. What changed (private `operations.ts` only; no `inventory.ts` change)

Patch A — placeable-sized collect, rechecked at every decision point.

- A shared `placeableQty(product, desired)` / `choosePlaceableCollect(...)`
  sizing is used at dispatch, on arrival at receiving
  (`onMovementCompleted` `to-receive`), and at collect completion. The R3a
  demonstration only sized at dispatch; its arrival path recomputed
  `min(staged, cart free)` and could still collect an unplaceable 4-load.
- Collecting claims are accounted: quantities another cart is already
  `collecting` for the same staged row are subtracted before sizing, so two
  carts cannot be assigned the same staged items during the handling window.
- Staged rows are scanned in declared delivery line order and the first
  *placeable* row is collected. Deliveries remain FIFO across deliveries;
  see the policy note in §6.

Patch B — blocked carts yield, with coupled task/transport state.

- A laden cart with no placeable quantity yields to its declared
  `parkingSlotMm` through normal transport admission (`requestMove`); the
  load and delivery are retained. No teleport, no cancellation of in-flight
  motion: yielding is only requested while the transport snapshot is `idle`,
  and only a granted/waiting move changes state.
- New task kind `yield-to-parking { deliveryId }` (both the internal
  `UnitTask` and the exported `OperationsUnitTaskView`). While it is set,
  dispatch never retasks the cart. On actual arrival at parking it becomes
  `awaiting-location` (`PUTAWAY_YIELD_PARKED` timeline entry) and selection
  retries from there. This closes the demonstration patch's hole: with the
  task left as `awaiting-location`, a mid-return dispatch could flip it to
  `to-store`, `requestMove` rejected as `ALREADY_MOVING`, and the cart
  arrived at parking stuck in `to-store`.
- Store moves are coupled the same way everywhere: the task becomes
  `to-store` only after the move is granted or waiting; a rejected move
  leaves the cart `awaiting-location` with its wait open.

Patch C — place-time revalidation; races never escape the handler.

- At `to-store` arrival, free space at the target slot is recomputed; if it
  is gone, the cart falls back to `awaiting-location` instead of scheduling
  a place that must fail.
- At place completion, each carried load places only
  `min(carried, free now)` at the target. Any remainder stays carried, the
  cart returns to `awaiting-location`, and dispatch retries (another slot,
  or a yield). `placePutAway` is therefore only ever called with a quantity
  the ledger currently accepts for that slot/product; no capacity race can
  throw out of the event handler into `kernel-invalid`.
- Collect completion likewise revalidates staged quantity (it collects what
  is still staged if another cart took part of the row).
- Kernel/inventory event ids for put-away now include the unit id
  (`ops-putaway-<phase>-<unit>-…`, `inv-collect-<delivery>-<unit>-…`,
  `inv-place-<delivery>-<unit>-<product>-<location>-…`), so simultaneous
  carts cannot collide on an idempotency key.

Waits — `PUTAWAY_NO_LOCATION` lifecycle.

- A dedicated closer closes only that reason for that cart. The wait opens
  when a stationary laden cart is blocked, closes when a store or yield
  move starts, reopens on arrival at parking if still blocked, closes on
  partial-place resume and on full completion. No stale open wait survives
  completed work (the demonstration run left one open from t=168,100).
- Because intervals close at motion start, `operationsRunMetrics`
  `totalWaitMs` excludes movement and place/collect handling for this
  reason. The wait-exclusion regression asserts exactly that against the
  cart's granted `motionHistory` and its observed place-handling spans.

## 3. Regression tests (7, all passing on the private build)

File: `putaway-liveness.test.ts` (see §1). Expectations are derived from
observed timeline events and ledger state in the same run — collected/stored
quantities parsed from `PUTAWAY_COLLECTED`/`PUTAWAY_STORED` details and
handling spans compared with `quantity × pickDurationMsPerItem` — not from
recomputing travel times.

| Test | What it pins |
| --- | --- |
| free=1, 2, 3 collect on arrival | A cart starting away from receiving collects exactly the free quantity; collect/place spans equal `free × 500 ms`; slot ends at capacity; remainder stays staged; no open put-away wait |
| Valid capacity block | Full slot, no picks: nothing is ever collected, the cart stays parked/idle, delivery stays `PUTAWAY_PENDING`, checks empty, no `kernel-invalid` |
| Same-delivery row skip | Declared-first row (P-A, slot full) does not hide P-B: `D1 P-Bx2 collected`, P-B stored, P-A still staged, delivery honestly not `STORED` |
| Same-slot race → yield → resume → completion | Two carts each collect 4 toward one slot; loser stores `[1, 2, 1]` as picks free space; yields are real granted motions; delivery reaches `STORED`; both orders `READY_FOR_DISPATCH`; ledger identity `storage = 5 + stored(8) − picked(3) = 10`; every `PUTAWAY_NO_LOCATION` interval is disjoint from that cart's motions and place handling; no open wait at completion |
| Space frees mid-yield | A pick commits strictly inside the yield travel window and a dispatch (another cart's receiving arrival) runs in that window; a frozen mid-window snapshot shows the cart still `yield-to-parking` + `moving` with L-A2 already freed; its next store motion starts at/after the `PUTAWAY_YIELD_PARKED` time; the resumed run stays valid |

Negative controls (same test file, unmodified):

- Against the unpatched main source: **7 failed / 0 passed**.
- Against the R3a demonstration patch (`.coordination/r3-shift/`):
  **6 failed / 1 passed** (only the valid-block case passes). The free=1..3
  arrival tests, the row-skip test, and both race/yield tests catch exactly
  the demonstration gaps listed in the task.

## 4. Workload verification

Resource/throughput semantics are unchanged and explicit: receiving
`RCV-1` is a single lane (`serviceCapacity 1`, 120,000 ms service, staging
capacity 8 handling units); packing `PACK-1/2` single lanes at 90,000 ms;
dispatch `DSP-1` 60,000 ms; put-away carts `PA-1/PA-2` carry 4 handling
units at 1,000 mm/s; collect/place handling costs
`pickDurationMsPerItem` (2,000 ms canonical, 500 ms in the micro tests) per
item. No duration, capacity, speed, or workload data was altered anywhere.

| Run (private build) | Result |
| --- | --- |
| Canonical 28-order/12-delivery fixed window (28,800,000 ms) | **28/28 shipped, backlog 0**, `conservation/capacity/safety` all empty (safety includes swept-trajectory checks over 247 retained motions), offline report recomputation ok, no diagnostic. Deliveries all remain `RECEIVING` — the valid capacity outcome of §5. Accepted inbound 20×P01, 12 items stored (demonstration run: 24/4 with the same 28/28 outbound; the hardened sizing/claim rules change only how much infeasible inbound is handled, not outbound or the bound). Only open wait at horizon is the honest `RECEIVING_STAGING_FULL`. |
| 6-order zero-inbound burst (finite cohort) | `SUPPORTED_STAGE_COMPLETE`, 6/6 shipped, checks empty, recomputation ok. Order states, timestamps, counts, and stop clock (540,000 ms) are **byte-identical** to the accepted main-dist baseline run of the same fixture. |
| Full existing simulation suite against the isolated build | **259/259 passed** (252 existing incl. the 6-order burst and M3d inbound gates, + 7 new), run as `vitest run --maxWorkers=1` with the private build as root. Typecheck (`tsc -p tsconfig.json`) passes. One earlier attempt reported 15 `ENOENT` failures for `../../fixtures/…`; that was a working-directory artifact of the isolated copy, resolved by running with the repository package directory as cwd (identical suite then green) — no assertion was weakened. |

Root-level `npm test` was not used (its `pretest` rebuilds shared `dist`,
which is read-only in this lane, and the root run is known to time out);
the direct single-worker Vitest invocation above is the recorded gate.

## 5. Capacity arithmetic (diagnostic fact, not a target)

From the fixture alone: capacity 2,304, initial 2,160, inbound 912,
outbound 154. Global pooled unstoreable bound **614** (912 − 298 storable);
per-product dedicated-slot bound **695** (sum of per-product shortfalls;
only P11 fits). Every delivery contains a line exceeding even that
product's total possible freed storage. Full `STORED` completion of the
inbound workload is therefore infeasible without changing declared
capacities or the workload, and this work does not manufacture it: the fix
stops infeasible inbound from gridlocking feasible outbound, nothing more.
Sample order arrivals step 1,000,000 ms (~16.7 min, not an hour).

## 6. Policy choices made (for coordinator confirmation)

1. **Intra-delivery row skip.** Within one delivery, staged rows are tried
   in declared line order and the first placeable row is collected; a
   blocked head row stays staged. This preserves cross-delivery FIFO and
   receiving-lane occupancy/service rules exactly. No cross-delivery bypass
   was added: a later delivery is still not served ahead of a blocked head
   delivery's remaining staged stock.
2. **Yield target.** The declared per-unit `parkingSlotMm`, reached through
   transport admission. If the parking move is traffic-waiting, the cart
   holds its coupled `yield-to-parking` task until actual arrival; if the
   move is rejected, it stays blocked in place with its wait open.
3. **Wait segmentation.** Blocked waiting is measured only while the cart
   is stationary and laden-blocked; travel to parking/store and handling
   are excluded (§2). Delivery `waitReason` mirrors the same transitions.
4. **Collecting claims.** A cart already collecting a staged row claims
   that quantity for sizing purposes (staging itself is only debited at
   collect completion). Storage is *not* claimed: place-time revalidation
   (patch C) remains the authority there.
5. **Receiving lane policy (F2) unchanged.** A partially accepted delivery
   still holds `RCV-1` until fully accepted. Releasing or bypassing the
   lane remains an explicit policy decision for the coordinator; outbound
   liveness does not depend on it.

## 7. Version provenance plan (before any landing)

No version was bumped in the private copy and no migration exists in main
code. Landing this behavior must be provenance-visible:

1. Bump `OPERATIONS_ENGINE_VERSION` in `packages/simulation/src/version.ts`
   (e.g. `layoutlab.operations-engine/2`) in the same change that lands the
   patch, because snapshot `task.kind` gains `yield-to-parking` and
   put-away timing/waits change. `OPERATIONS_SCHEMA_VERSION`
   (`layoutlab.operations/1`, the scenario schema) does not change; the
   report schema (`layoutlab.operations-report/1`) does not change.
2. Historical reports, fixtures, and evidence keep the versions and hashes
   recorded with them. They are never reinterpreted under the new engine:
   `recomputeOperationsReport` already flags version mismatches, and a
   pre-change report recomputed after landing will honestly report a
   version/count mismatch rather than silently passing.
3. The burst and full-shift baselines must be re-recorded under the new
   engine version at landing time (the burst is expected to be identical,
   as verified here against the current baseline; the full-shift numbers in
   §4 become the first `/2` reference), with prior recordings preserved.
4. UI/report consumers that switch exhaustively on `task.kind` must handle
   `yield-to-parking` (rendered as a laden cart moving to parking) before
   the engine bump ships; until then the kind exists only privately.

## 8. Integration gate (what remains)

- Coordinator review of §6 policy choices and §7 version plan; then land
  `production-intended.patch` + `putaway-liveness.test.ts` into
  `packages/simulation/{src,test}`, run the package build/test/typecheck
  gates there, and re-run the full-shift and burst records under the bumped
  engine version.
- Re-run the R3b gates after the R2b worker+cart envelope lands (larger
  footprints change traffic waits; the liveness structure must hold).
- Unresolved by design: receiving-lane release/bypass policy (F2) and any
  workload/capacity change that would make inbound `STORED` feasible.
  Neither is required for outbound correctness, and neither is hidden by
  this patch.

## Coordinator private-patch acceptance (2026-11-04)

Independent execution reproduced28/28 outbound, empty reported invariants,
all-product inventory conservation, successful report replay and byte-identical
six-order burst reports. All7 private regression tests passed on rerun.
Evidence: `evidence/sanitized/r3b-independent-review.json`. Policies1�5 above
are approved within the existing modeled semantics; no new user permission
is needed. Inbound infeasibility is preserved. This accepts the private
algorithm for integration, not production deployment or physical certification.

The landing provenance plan is refined: preserve input schema/engine contract1,
bump the simulation implementation version to0.1.1, and retain a reproducible
0.1.0 runtime archive for exact historical report/inspection replay. Do not
blindly change the parser's engine-version literal and break preserved input
fixtures. Integration task .coordination/r3c-engine-integration-task.txt owns
this versioned-replay gate and coordinates the U1 consumer interface.

## R3c integration outcome (2026-11-04)

Landed in the main tree with the refined provenance plan above (the
section 7 engine-literal bump was NOT applied; the input contract stays
at /1):

1. The accepted 0.1.0 runtime was frozen BEFORE the patch as a
   browser-compatible single-file ESM archive
   (`packages/simulation/archive/0.1.0/runtime.mjs`, Vite lib build of
   `src/index.ts` + zod only; source commit a8a8809, per-source and
   bundle hashes in `archive/manifest.json`, notices in
   `archive/LICENSES.md`). The archived runtime reproduces the
   pre-patch dist exactly (full shift 11/28, burst 6/6, recomputation
   ok). The artifact is immutable; the build script refuses to rebuild
   it from newer sources.
2. `production-intended.patch` and the 7 regression tests landed in
   `packages/simulation/{src,test}`. `SIMULATION_VERSION` and the
   package version bumped to 0.1.1 (workspace dependency/lock metadata
   updated); `OPERATIONS_SCHEMA_VERSION` and
   `OPERATIONS_ENGINE_VERSION` remain `/1`.
3. Runtime selection is explicit and minimal
   (`src/runtime-selector.ts`): `createOperationsControllerForVersion`
   serves exactly 0.1.0 (archive) and 0.1.1 (current); unsupported or
   absent versions throw. `recomputeOperationsReportForVersion` and
   `verifyOperationsExperimentForVersion` dispatch on the recorded
   `versions.simulation` and stamp `verifierImplementationVersion`;
   the API investigation verifier does the same. Recorded E3/E4
   artifacts, including the live Meta investigation, still verify
   under 0.1.0 with no fake new Meta run.
4. Current 0.1.1 evidence: full shift 28/28 shipped, inbound still
   honestly blocked (`RECEIVING`), every inventory bucket conserved,
   burst metrics identical to 0.1.0 with distinct metadata
   (`evidence/sanitized/r3c-implementation-evidence.json`).
   Simulation suite 268/268 serial, API suite 160/160, core 111/111;
   build/typecheck pass for simulation and API. See
   `docs/ENGINE_IMPLEMENTATION_VERSIONS.md` for the version boundary
   U1/L1 consume. Remaining: U1 web wiring (versioned inspection and
   yield-to-parking presentation) and the final root/browser gate on
   coherent bytes; no deployment is claimed.
