# Shared planning ↔ operations state contract (R3a proposal, not implemented)

Status: analysis and smallest-contract proposal only. No code was changed.
Field names below are the actual schemas in `packages/core/src/schema.ts`
(legacy planner) and `packages/simulation/src/schema.ts` (operations), not a
generic architecture.

## 0. Immediate decision (approved) vs later bridge — read this first

Source: [UNIFIED_WORKSPACE_REQUIREMENTS.md](UNIFIED_WORKSPACE_REQUIREMENTS.md)
(user-approved direction). This section is a **product/state decision that is
effective now**; §§1–4 are a **later, sequenced** engineering bridge. The
bridge is sequencing, not optional scope removal: the user has already
authorized stock reassignment in the product, so building it later needs no
new blanket permission. The specific architectural choices in §4 still need
explicit decisions, but they are decisions, not a re-approval gate. The
dependent UI task implements §0; it must not wait for, or be blocked by, the
bridge.

**Immediate (unified workspace):**

- The **Operations scene is the one canonical scenario** of the main
  workspace: `main-warehouse-1` (`fixtures/operations/main-warehouse.json`:
  6 racks, 24 slots `L01…L24`, products `P01…P12`, `initialStock`,
  `homeAssignments`, 28 orders / 12 deliveries, seed `main-warehouse-r1`,
  handling config from the run config). Viewer, baseline run, warehouse
  assistant, results/comparison and exports all consume this same active
  scenario. Operations scenarios carry no `revision` field, so scenario
  identity is `scenarioId` + content sha256 (the `fixtureSha256` pattern
  already used by `main-warehouse.bindings.json`); every assistant request,
  result and export must carry that identity.
- "Canonical" names the scenario family (`main-warehouse-1`), not a single
  silently chosen workload. Every run still carries an **explicitly selected
  workload**: the recorded 6-order burst (`picking-packing-burst.json`,
  zero inbound) and the 28-order/12-delivery full shift
  (`main-warehouse.json`) are two labeled selections over that family.
  Selecting the full shift for a baseline does not replace, relabel, or
  reinterpret the recorded 6-order burst context or its historical results;
  run identity (scenario hash + selected workload + execution config) is
  shown with every result.
- The three primary workflows (Storage Planning / Operations / Experiments
  as separate tabs) are removed. What remains in the main workspace as
  "experiments" is only the already-supported E3 surface (staffing counts
  and service-duration hypotheticals), labeled as assumptions
  ("what if this stage takes less time"), never as layout, assignment or
  traffic optimization.
- A scenario change creates a **new context**: prior results are labeled
  stale/previous and are never displayed as current measurements, and a
  recorded/imported report may only be shown with its own associated
  scenario explicitly loaded — never overlaid on an unrelated warehouse.
- The legacy planner (`fixtures/sample/warehouse-basic.json`, sku-a data,
  4-rack scenarios, `fixtures/benchmark/bm-*`) is **separate advanced /
  compatibility access only**: no primary tab, and it never feeds
  `main-warehouse-1` / P01 operations. Its product/location ids, assignments
  and travel results do not transfer into the canonical operations scenario
  in either direction.
- **No assignment or traffic optimization is advertised** in the unified
  workspace until the §3 bridge is actually connected and verified on the
  canonical scenario. Until then the assistant and UI may describe the
  warehouse and run supported duration/staffing hypotheticals only.
- Direct physical layout editing (move/rotate racks and stations, initial
  agent placement) is the separate L0–L3 track in
  [INTERACTIVE_LAYOUT_REQUIREMENTS.md](INTERACTIVE_LAYOUT_REQUIREMENTS.md),
  with its own draft/validate/simulate/compare contract. It is not part of
  the §3 assignment bridge, and duration-only experiments must not be
  relabeled as layout optimization.

**What §0 does NOT need:** no planner→operations data migration, no new
schema, and no bridge code. Unifying the workspace is achieved by making the
operations scenario the single context and demoting the planner to a
clearly separated compatibility surface.

**Later (sequenced, already authorized):** the quantity-aware bridge in §3,
gated only by the explicit decisions in §4. It is deliberately not built for
the unified UI, and nothing in §0 depends on it. Sequencing it after §0 is
not a scope removal and does not require fresh permission; §4 records the
choices to settle when its turn comes. Note that even the bridge would only
re-prioritize/move stock inside `main-warehouse-1`; it would never import the
legacy sku-a planner scenario.

## 0.1 Physical layout contract (immediate, separate from the stock bridge)

Source: [INTERACTIVE_LAYOUT_REQUIREMENTS.md](INTERACTIVE_LAYOUT_REQUIREMENTS.md)
+ the unified-workspace addendum. Moving/rotating racks, moving stations and
initial agent placement are explicitly authorized for the NEW canonical
workspace (this overrides the historical v2 fixed-rack scope; old results
keep their provenance). This is a **geometry/layout contract**, distinct
from the §3 stock-assignment bridge: layout edits move physical entities
and their attachments; they move no stock quantities and change no
assignments. First priority is a manual **PACK-1** move end-to-end, then the
same transform proposed through the assistant with the **same validator**;
rack move/rotation (with attached slots/approaches) and initial-agent
positioning follow. An isolated new module for packing-station
transforms/validation is owned by the L0 worker; this document only fixes
the contract and the attachment map below — no engine edits here.

### Attachment map — PACK-1 (actual IDs/coords, no proximity guessing)

Authority: `fixtures/operations/main-warehouse.json` (resource + obstacle)
and `fixtures/operations/main-warehouse.bindings.json` (`stations.PACK-1`,
`centerMm`, `yawDeg`). Bindings state all positions come from the fixture;
nothing here is inferred from distance.

| Entity | ID / role | Canonical value |
| --- | --- | --- |
| Station resource | `PACK-1`, kind `packing` | `serviceCapacity 1`, `serviceDurationMs 90000`, `inputStagingCapacity 12`, `outputStagingCapacity 12` |
| Visual transform | bindings `stations.PACK-1` | asset `warehouse-environment/table_packing_heavyduty_c01`, `centerMm (20500, 5000)`, `yawDeg 0` |
| Blocking obstacle | `OB-PACK1` | `x 19566…21434`, `z 4390…5610` (1868×1220 mm; its center is exactly the visual center `(20500, 5000)`) |
| Service position | `PACK1-S1` | `(20500, 6900)` — offset `(0, +1900)` from station center |
| Queue slots | `PACK1-Q1/Q2/Q3` | `(22500, 6900)`, `(22500, 8600)`, `(22500, 10300)` — offsets `(+2000, +1900/+3600/+5300)` |

PACK-2 is the symmetric separate station (`OB-PACK2`, center `(20500,
11000)`, `PACK2-S1 (20500, 12900)`) and is never moved as a side effect of a
PACK-1 edit.

### Transform and validation rules (the one contract for manual + assistant edits)

- A station move is a rigid transform (translation for the first slice;
  rotation only when explicitly supported) about the bindings `centerMm`,
  applied identically to the visual transform, `OB-PACK1`, `PACK1-S1` and
  `PACK1-Q1…Q3` via the offsets above. Attached IDs never change; no entity
  is re-derived by proximity.
- Edits create a **draft candidate scenario**, never a mutation of a live
  run; the baseline scenario/results stay immutable. Agent repositioning
  (later slice) sets starting/parking positions only — it never teleports
  actors during an active simulation.
- The validator (shared by manual editing and assistant proposals) must
  re-check, on the transformed candidate: room bounds; obstacle overlap
  against racks/other obstacles; navigability and pairwise clearance of the
  service position, queue slots and affected approaches at the current
  unit disc radius (799 mm); and that navigation geometry is regenerated
  from the candidate (never visually rotated with stale navigation).
  Invalid placements are rejected with explicit reasons, no partial apply.
- Comparison discipline: baseline vs candidate run **identical** orders,
  deliveries, initial stock/assignments, service durations, worker
  counts/profiles, seed and handling config; only the layout transform
  differs unless the user explicitly changes another variable (disclosed
  in the result). Candidate/baseline contexts carry scenario id + hash;
  stale comparisons are invalidated, per §0. Duration-only experiments
  remain a separate, clearly labeled hypothetical and are never presented
  as layout optimization.
- Gates: L0 pure typed transform/attachment/validator + hand-oracles;
  U1 one canonical workspace; L1 manual PACK-1 editor end-to-end;
  L2 assistant proposals through the same contract with reviewed
  constraints; L3 racks/other entities. No layout capability is advertised
  before its gate passes.

## 1. The two state models today

| Concern | Legacy planner (`@layoutlab/core`) | Operations (`@layoutlab/simulation`) |
| --- | --- | --- |
| Product | `products[]`: `storedLoadDimensionsMm`, `requiredStorageClass`, `allowedLocationIds?`, `lockedLocationId?` | `products[]`: `itemDimensionsMm`, `handlingClass`, `capacityCostUnits`, `visualAssetRef?` |
| Location | `locations[]`: `usableDimensionsMm`, `storageClass`, `pickPointMm`, `allowedProductIds?`, `label` | `locations[]`: `usableDimensionsMm`, `storageClass`, `storageAnchorMm`, `approachPointMm`, `maxQuantity`, `restrictions{eligibleHandlingClasses, eligibleProductIds?}` |
| Assignment | `assignments[]`: one `{productId, locationId}` row per product (validator errors: `ASSIGNMENT_DUPLICATE_PRODUCT`, `ASSIGNMENT_MISSING_PRODUCT`, `LOCATION_OCCUPIED`) | `homeAssignments[]?`: one `{productId, locationId}` per product, must be complete if present; used **only** as pick/put-away source priority (home first, then location id) in `inventory.ts` `sourceOrder()` |
| Quantities / stock | **None.** No stock, capacity, or quantity field exists anywhere in the planner schema | `initialStock[]`: `{locationId, productId, quantity}` rows, many per product (main fixture: 23 rows, 2 slots per product, `L24` empty); slot invariant: one product per slot, `quantity ≤ maxQuantity` |
| Workload | `orders[]`: `{id, frequency, lines[]}` untimed templates used to weight 2D picking travel | `orderSchedule[]` / `deliverySchedule[]`: `{id, arrivalTimeMs, lines[]}` timed events, plus `mobileUnits[]`, `resources[]`, `policies` |
| Objective | `minimize_weighted_picking_travel`: weighted **2D travel distance (mm)** via `objective.ts`; `relocationCount`, `maxRelocatedProducts`, `lockedProductIds` in `PlanningRequirements` | Engine outcomes only: shipped/backlog, waits, makespan, invariant checks; **no travel objective** |
| Change surface | `AssignmentProposal{scenarioRevision, changes[{productId, locationId}], rationale}`; `applyProposal` rejects `STALE_REVISION`; `applyAssignment` returns revision+1 | E3 patch surface (`experiments.ts`) is limited to `extraPickers`, `extraPutaway`, `packingDurationMs`, `dispatchDurationMs`, `receivingDurationMs`. **No assignment or stock intervention exists.** |
| Compatibility rule | Product-side: `requiredStorageClass` vs location `storageClass`, `fitsFixedOrientation(storedLoad, usable)`, allowlists both sides | Location-side authority: `locationEligible()` = handling class ∈ `eligibleHandlingClasses`, product ∈ `eligibleProductIds`, `itemDimensionsMm` fit `usableDimensionsMm` |
| Identity | Own scenario fixtures (`fixtures/sample/`, `fixtures/benchmark/bm-*`) with their own ids/revision | `main-warehouse-1` (`L01…L24`, `P01…P12`); `main-warehouse.bindings.json` joins this fixture to render assets by sha256 — the only existing cross-artifact identity contract |

### Invariants that any bridge must respect

- Planner: a product has exactly one location; a location holds at most one
  product; locks (`lockedLocationId`, `lockedProductIds`) and
  `maxRelocatedProducts` bound proposals; proposals are revision-checked.
- Operations: a slot holds one product with `quantity ≤ maxQuantity`; stock of
  one product normally spans **two** slots plus staged/carried/packing buckets,
  all conserved (`initial + accepted = physical`); reservations name concrete
  `(locationId, quantity)` sources; eligibility is location-side and
  handling-class based; `homeAssignments` change *priority only*, never stock
  position.

## 2. Gap analysis (concrete, not generic)

1. **One-to-many collapse.** A planner move `P → L` cannot express the
   operations reality "P already sits in two slots (48 + 48), move 20 from
   `L01` to `L24`". Applying planner output naively would silently drop or
   invent the secondary stock row — the main fixture has 11 such secondary
   rows. Any contract must be quantity-explicit per source slot.
2. **Dimension semantics differ.** Planner `storedLoadDimensionsMm` (a stored
   load) vs operations `itemDimensionsMm` (one item) feed different fit
   checks; `capacityCostUnits` and `maxQuantity` have no planner analog, so
   the planner cannot know whether a target slot can hold the moved quantity.
3. **Compatibility is stated on opposite sides.** Planner checks
   product→location (`requiredStorageClass`, `allowedLocationIds`); operations
   enforces location→product (`eligibleProductIds`,
   `eligibleHandlingClasses`). The operations check must be the authority at
   apply time; planner results are advisory.
4. **Homes ≠ stock.** Changing `homeAssignments` alone reprioritizes future
   picks/put-aways without moving one item. A bridge must keep "priority
   change" and "physical relocation" as separate, labeled operations.
5. **Metric mismatch.** Planner improvement is 2D weighted travel mm;
   operations acceptance is time-domain (shipped/backlog/waits/makespan under
   traffic, capacities, and service durations). A candidate that wins on
   travel can lose on makespan. The two numbers must never be equated or
   substituted.
6. **No shared revision/hash.** Planner has `revision`; operations scenarios
   have no revision field. The bindings file already establishes the pattern
   to reuse: content sha256 as identity (`fixtureSha256`).

## 3. Smallest reversible contract (later bridge — sequenced, authorized)

This bridge is **not** required by the unified workspace (§0) and must not
be built for it. It is the smallest design for quantity-aware assignment
editing on the canonical operations scenario, which the user has already
authorized as product scope; it is sequenced after §0/R3b, not contingent on
a new approval. Assignment optimization may be advertised only after the
bridge is connected and verified on identical workloads.

Add one bridge artifact, produced by planning and consumed by operations.
Nothing in either engine changes behavior for existing callers.

```jsonc
// AssignmentPlan (new, bridge-owned schema; strict object)
{
  "planVersion": "layoutlab.assignment-plan/1",
  "scenarioId": "main-warehouse-1",
  "scenarioSha256": "<sha256 of canonical operations scenario JSON>",
  "planRevision": 1,               // increments per accepted apply
  "relocationBudget": 4,           // max distinct products moved (from planner maxRelocatedProducts)
  "moves": [
    { "productId": "P11", "fromLocationId": "L21", "toLocationId": "L24", "quantity": 24 }
  ],
  "homeChanges": [
    { "productId": "P11", "toLocationId": "L24" }   // priority only; labeled, may be empty
  ],
  "lockedProductIds": ["P12"]      // translated from planner locks; moves naming them reject
}
```

Apply semantics (implement as `applyAssignmentPlan(scenario, plan)` beside
`applyOperationsPatch` in `packages/simulation/src/experiments.ts`):

- **Stale handling:** reject with `STALE_SCENARIO` if `scenarioId` or
  `scenarioSha256` does not match the target scenario (mirrors planner
  `STALE_REVISION`); never mutate the input — return a cloned scenario that
  must pass `parseOperationsScenario` (same pattern as `applyOperationsPatch`).
- **Validation (operations is authority):** for every move — product, source,
  and target exist; target passes `locationEligible` for the product; source
  holds ≥ `quantity` unreserved stock (plans apply pre-run, so reservations
  are empty; state this precondition); target free space
  (`maxQuantity − stored`) ≥ `quantity` after all moves in the plan are
  accounted in order; target slot is empty or already holds the same product;
  locked products reject; distinct moved products ≤ `relocationBudget`.
  Any failure rejects the whole plan with structured errors (planner
  `ValidationError` shape) and no partial state.
- **No silent drops:** stock rows not named by a move are carried over
  byte-identical; a move that empties a source keeps the row at quantity 0 or
  removes it explicitly in the diff report — the apply result must include a
  before/after stock table so dropped overflow is visible, never implicit.
- **Evaluation on identical workload:** baseline and candidate run the same
  frozen scenario inputs except the applied stock/home changes, through the
  existing experiment comparison (`runOperationsExperiment`-style) with the
  same `executionConfig`, seed, and horizon. Report both: planner-side
  `weightedTravelMm`/`relocationCount` (labeled "2D travel proxy") and
  operations-side shipped/backlog/wait histogram/invariant checks (labeled
  "simulated outcome"). Ranking by travel alone is not acceptance.
- **Reversibility:** a plan is data, not a migration. Discarding it restores
  the baseline exactly (input scenario unmutated; `planRevision` +
  `scenarioSha256` chain makes stale reports detectable: every operations
  report derived from a candidate must carry `scenarioSha256` of the scenario
  it actually ran, so a report against a superseded plan is identifiable).

## 4. Decisions that actually block implementation

Only three. Everything else (UI, persistence, naming) is downstream.

| # | Decision | Recommendation (from current data) |
| --- | --- | --- |
| D1 | What does a planner "relocation" mean when ops stock is split across two slots? | **Quantity-explicit partial moves** (`moves[]` above). The fixture proves split stock is the norm (23 rows / 12 products); a whole-product move primitive would be wrong on day one. |
| D2 | Is changing `homeAssignments` without moving stock a legal plan? | **Yes, but as a separate labeled `homeChanges` list** (priority-only). The engine already treats homes as priority, so forbidding it would invent semantics; merging it with physical moves would hide that no stock moved. |
| D3 | Which side owns locks and eligibility at apply time? | **Operations owns both.** Translate planner `lockedProductIds`/`lockedLocationId` into plan `lockedProductIds` at the bridge; enforce `locationEligible` + capacity in `applyAssignmentPlan`. Planner validation stays an advisory pre-check (its dimension and class fields do not map 1:1, §2.2–2.3). |

Explicitly **not** blocking: whether the planner heuristic should consume
`capacityCostUnits` (it should not in this contract — capacity is enforced at
apply time), and any UI presentation of plans.

## 5. R3b implementation tasks

Ownership respects the parallel lanes: R1 owns renderer/cargo, R2/R2b own
human assets and the worker+cart envelope, R3b owns the items below. The
worker+cart envelope (R2b) may change unit footprints/speeds; R3b must
re-run its full-shift gates after R2b lands, but does not depend on it to
start (current disc model is the baseline).

### R3b-1 — Put-away liveness (engine)

- **Files:** `packages/simulation/src/operations.ts` only (patches A–C in
  [FULL_SHIFT_DIAGNOSIS.md](FULL_SHIFT_DIAGNOSIS.md) §6 plus wait-record
  bookkeeping); tests in `packages/simulation/test/` (extend
  `m3b-operations.test.ts` or new `putaway-liveness.test.ts`). Diff reference:
  `.coordination/r3-shift/proposed-patch.diff` (private, unmerged).
- **Oracles/gates:** free=2 partial drain and free=0 negative control (oracle
  O2 shapes as tests); two-unit place-race never yields `kernel-invalid`;
  canonical full shift: O-09/O-12/O-14/O-15 complete, zero `NO_IDLE_PICKER`
  waits, invariant checks empty, replay ok, deliveries still honestly
  `RECEIVING` (no workload edits); burst fixture
  (`picking-packing-burst.json`) counts/timestamps unchanged; full simulation
  test suite + typecheck green after a lane-owned build.

### R3b-2 — Honest full-shift baseline in the unified workspace (dependent UI task)

- **Scope:** owned by the dependent UI task implementing §0 and
  [UNIFIED_WORKSPACE_REQUIREMENTS.md](UNIFIED_WORKSPACE_REQUIREMENTS.md);
  this contract only supplies the engine facts it must display. No fixture
  changes. The unified baseline runs the canonical 28-order/12-delivery
  `main-warehouse-1` schedule (the 6-order burst remains a small diagnostic,
  not the main experience), labeled sample/synthetic data.
- **Oracles/gates:** running the baseline shows shipped/backlog by stage,
  per-order and per-delivery blocked reasons from snapshot waits
  (`PUTAWAY_NO_LOCATION`, `RECEIVING_STAGING_FULL`, traffic/`NO_IDLE_PICKER`
  as applicable), invariant checks, and offline recomputation status;
  `WINDOW_ENDED` with backlog renders as a complete honest result. Viewer,
  assistant requests, results and exports all carry the same
  `scenarioId` + sha256; results from a previous scenario are labeled stale.
  No copy may claim warehouse completion from reaching the horizon, and no
  assignment/traffic optimization is advertised (see §0).

### R3b-3 — Planning↔operations bridge (sequenced, authorized)

- **Start condition:** sequencing after R3b-1/R3b-2. Quantity-aware
  assignment editing on the canonical scenario is already authorized
  product scope, so no new permission gate applies; the §4 decisions
  (D1–D3) are settled as implementation choices when this starts. Not part
  of the unified-workspace delivery and not a dependency of R3b-1/R3b-2.
- **Files:** new plan schema + `applyAssignmentPlan` in
  `packages/simulation/src/experiments.ts` (or a new
  `packages/simulation/src/assignment-plan.ts` exported from `index.ts`);
  planner side read-only (consume `AssignmentProposal`-shaped input at the
  bridge; `@layoutlab/core` unchanged unless D3 translation needs a helper).
- **Oracles/gates:** stale-hash plan rejected; locked product move rejected;
  over-capacity/ ineligible target rejected with structured errors; un-named
  stock rows byte-identical after apply (secondary stock preservation proof);
  baseline vs candidate compared on identical workload with both metric
  families labeled; reports carry the ran scenario's sha256.

### Explicitly deferred (needs a policy decision, not code first)

- Receiving lane release/bypass semantics (diagnosis F2): whether a
  partially-accepted delivery should free the lane, and whether later
  deliveries may overtake a blocked head. Decide in R3b scoping with the
  warehouse-realism requirements visible; do not fold into R3b-1 silently.
- Human+cart envelope effects on the traffic waits (R2b): re-run R3b-1 gates
  after R2b; the liveness fixes must hold for the larger combined envelope.
