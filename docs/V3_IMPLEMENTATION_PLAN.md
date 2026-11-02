# LayoutLab v3 delivery plan and engine contracts

Authority: [Implementation Brief v3](IMPLEMENTATION_BRIEF_V3.md), supplied by
the user on2026-11-02. This is an explicit scope expansion. V2 evidence and
completed milestones remain historical evidence for the storage planner;
they do not prove operations simulation. This document is the v3-M0 contract
and backlog, not an implementation or simulation result.

Latest execution priority: [AI Warehouse Experimenter](EXPERIMENTER_DELIVERY_PLAN.md),
following the user's 2026-11-03 direction. The full v3 backlog stays visible;
the critical path is one correct operations scenario, controlled experiments,
bounded Meta tool use, inspectable evidence and release.
Environment requirements: [full-experience continuation](V3_FULL_EXPERIENCE_NEXT.md).
W1 is a diagnostic foundation. Close the current M2a review, then build the
coherent warehouse in the MAIN interface before connecting the first complete
multi-order/two-agent/inventory/packing-queue/shared-aisle operational slice.
Do not stop at asset validation or call the static main scene the finished
operations simulator.

## Current state and changes in assumptions

Reviewed R1 (`d039fa9`) is deployed at https://layoutlab.endpx.cloud behind
HTTPS and Basic Auth. Sample/manual/stub/report flows passed external Edge
verification; public inference remains unavailable pending its durable US$1
allowance guard. The six-scenario live planning benchmark completed18 runs/
72 real requests with all outputs retained. Neither deployment nor that
benchmark proves operational timings, inventory conservation or traffic.

R2 presentation playback is uncommitted/deferred, with a known panel-density
regression. Its exact-points helper may be reused only after review; its
animation clock must never become the operations engine clock. A binary
patch and new files were preserved privately before the scope change.

One Muse worker owns the representative asset-section task. Codex owns this
plan, coordination and independent review. No other coding worker edits its
files concurrently. Native Node/TypeScript remains the application stack;
no Docker, local PostgreSQL or renderer migration is required.

| Previous assumption | v3 contract |
|---|---|
| Quantity contributes to static demand; no depletion | Physical integer quantities transfer between explicit buckets; reservations are separate commitments |
| One demonstrated cart route | Multiple role-eligible mobile units with capacities, tasks, routes and protected stationary occupancy |
| Independent deterministic static routes | Static routes are only proposals for movement; space/time admission and swept-footprint checks authorize concurrent movement |
| Playback speed is presentation | Still presentation; configured engine travel/service times and all business outcomes are independent of frames/speed |
| One packing point, no service queues | Explicit receiving/packing/dispatch positions, finite staging and service capacities, non-overlapping queues |
| Static travel ranks candidates | Static travel stays a separate diagnostic; operations ranks valid complete runs by the declared lexicographic objective |
| Apply changes to planner revision | Operations placement is initialized before each controlled run; no instantaneous reassignment of running inventory |
| Geometry limited to racks and room | Operations geometry includes all in-area walls/columns/stations/traffic zones used by navigation and rendering |

## Reuse map and version boundaries

| Existing surface | Reuse / required extension |
|---|---|
| `packages/core/src/schema.ts`, validation/apply helpers | Preserve scenario/1 parsing, complete assignment constraints, locks, compatibility and relocation budgets; never reinterpret legacy stored-load dimensions as per-item dimensions |
| `geometry.ts`, `scene.ts`, `nav.ts`, `routing.ts` | Reuse bounds, conservative footprint clearance and grid paths; operations needs an explicit geometry adapter including additional obstacles and each supported agent profile |
| `objective.ts`, `report.ts`, independent BFS | Preserve static-ranking/report replay unchanged; operations needs a separately versioned result and recomputation path |
| `apps/api/src/provider.ts`, `runs.ts`, prompts | Preserve server-side key, consent, approval, cancellation, request/token caps; add operations patches/comparison requests only at v3-M7 |
| `storageAnchors.ts`, ThreeView and asset tooling | Reuse separation of storage/aisle positions and asset provenance; promote explicit storage anchors into the operations scenario, calibrated against actual shelves |
| Deferred `routePlayback.ts` | Candidate source for a read-only polyline/stop artifact; no authority over operations completion, inventory or metrics |

The proposed pure TypeScript home is `packages/simulation`; implementation
is delegated to Muse in bounded tasks. It may depend on core geometry/types,
never React, Three.js, a network provider or browser globals. Do not duplicate
the static pathfinder or rewrite core to fit a new architecture. Review the
smallest compatible geometry extension before implementing it. A planner
diagnostic for operations inputs must use the SAME complete obstacle set;
silently projecting away walls for an old report is forbidden.

Use new explicit version identifiers such as `layoutlab.operations/1` and
`layoutlab.operations-report/1`. Existing scenario/report fixtures and
benchmark hashes remain unchanged. A legacy scenario can be used as planning
input, but it is not an executable operations scenario without explicit
stock, capacities, unit sizes, resources, schedules and policy configuration.

## Planned engine boundary

```ts
type SimulationTimeMs = number; // nonnegative safe integer
type Quantity = number;         // nonnegative safe integer, defined item unit
type OperationsRunMode = 'fixed-window' | 'finite-cohort';

// Contract shape; v3-M2a exports runtime schemas/types plus the headless
// kernel from @layoutlab/simulation (contracts + scheduling only; M2b+
// behavior such as inventory, lifecycle, and traffic is not implemented).
interface OperationsScenario {
  schemaVersion: 'layoutlab.operations/1';
  provenance: ScenarioProvenance;
  geometry: OperationsGeometry;
  products: UnitProductDefinition[];
  locations: OperationsStorageLocation[];
  initialStock: StockPosition[];
  mobileUnits: MobileUnitDefinition[];
  resources: ServiceAndStagingDefinition[];
  orderSchedule: ScheduledOrder[];
  deliverySchedule: ScheduledDelivery[];
  policies: OperationsPolicyConfiguration;
  seed: string;
}

interface OperationsEngine {
  stepEvent(): EngineStepResult;
  advanceTo(targetMs: SimulationTimeMs): EngineStepResult;
  snapshot(): OperationsSnapshot;
  exportRun(): OperationsReport;
}
```

Rendering receives immutable timestamped snapshots, authorized piecewise-
linear trajectories and structured reasons. It interpolates those trajectories
without changing event times. The UI owns pause/resume/playback speed and
camera; it cannot transfer inventory or declare order/service completion.
Reset creates an entirely fresh run from the saved initial configuration.

Canonical floor coordinates are integer millimeters in XZ; height is Y.
Operations locations carry explicit storage-anchor XYZ, approach XZ, usable
dimensions, class, maxQuantity and supported product/handling restrictions.
Resources and queue/parking/waiting slots carry positions, footprint bounds
and capacities. Rendered obstructions inside the planning area must be in
the navigation geometry. Outside cutaway structure must be clearly beyond
the modeled boundary and cannot imply accessible off-model destinations.

The first full synthetic scenario targets six fixed racks,24 locations,
12 products, four pickers, two put-away units, two staffed packing stations,
one receiving and one dispatch service position,40 scheduled orders and
several deliveries. All capacities and durations are explicit configuration,
not hidden constants or calibrated real-warehouse claims. The asset-section
proof is smaller and does not count as this full operations scenario.

## Clock, event ordering and bounded execution

Use integer milliseconds. A segment duration is conservatively rounded up
from its declared distance and speed; configured service/turn durations are
positive integer milliseconds. Zero-distance travel completes its logical
stop without an infinite chain of zero-time motion events. Document the
distance/partial-segment rounding in the implementation before metric cards.

Queue ordering is `(timeMs, eventPriority, monotonicSequence)`. Freeze and
export the priority table. Initial proposed priorities are completion/release,
external arrival, admission/dispatch, then movement/service start. Bookkeeping
transitions can be atomic audit records of the triggering event rather than
new clock events. No event may be scheduled in the past. Tests must pin the
behavior of same-time causal insertions and prevent unlimited zero-time work.

Every scheduled event has a stable ID and optional owning task/plan version.
Stale plan events cannot move agents or transfer stock. Duplicate processing
cannot reapply a committed mutation. An explicit maximum event count and
same-time work bound stop with diagnostic state instead of silently dropping
events. Browser frames may be skipped; simulation events may not be skipped.

Fixed-window runs stop exactly at their configured simulation horizon and
retain active work/stock/occupancy. Finite-cohort runs stop new arrivals at the
declared cutoff and drain fulfillable work, or terminate with an explicit
unresolvable/limit diagnostic. They cannot spin forever awaiting impossible
stock. Playback1x/4x/16x and headless execution must produce identical final
logical results for the same inputs and seed.

## Inventory, task and resource contracts

Quantities use explicit product item units; load capacities use configured
handling units with a declared integer conversion per product. A visual box
may aggregate items, but it does not turn one box into one item. Unit size,
container capacity, stored-container geometry and cart footprint remain
distinct. Do not derive all capacities from volume alone without a defined
packing assumption.

Physical buckets: receiving/dock/staging, storage by location, carried by
mobile unit, packing/staging by order, packed outbound, dispatched. For each
product, initial physical stock plus accepted inbound equals the sum of all
physical buckets, including dispatched quantities. An external delivery not
yet admitted is tracked separately; acceptance must be an explicit event
with a physical capacity/position, never an invisible stock increment.

Transfers validate all removals/additions/capacities and commit atomically.
Reservations never add physical stock. Reserve the full order from eligible
stored stock atomically or reserve nothing; do not reserve not-yet-put-away
inbound stock. A large reserved order may create several capacity-bounded
trips while keeping the remaining reservation intact. Retry stock-waiting
orders on relevant stock availability, without duplicate reservations.

Initial put-away policy: prefer the configured home assignment, then an
eligible compatible empty/available location in stable location-ID order,
subject to capacity and one-product-per-storage-location compatibility.
Operational stock may occupy more than its planning home; picking routes
must use actual reserved source locations. The static home-assignment travel
diagnostic is labeled separately. If a simpler first slice restricts eligible
locations, that restriction must be explicit fixture configuration, not a
silent permanent scope reduction.

Agents carry one active task, respect role eligibility and carrying capacity,
and never wander when idle. FIFO is ordered by original enqueue time then
stable task ID; preserve age when waiting/replanning so retries do not lose
priority. Service resources model staffed packing without allocating an
extra mobile worker. Service, staging and downstream positions are acquired
according to a documented blocking policy. Occupancy persists while blocked;
queues use distinct physically valid slots rather than stacked coordinates.

Order and inbound lifecycles are the exact v3 transitions. Packing requires
all picked quantities to have arrived; shipment requires packing, dispatch
service completion and the physical transfer into dispatched quantities.
Animation arrival cannot advance these states.

## Movement, traffic and bounded recovery

Each mobile-unit profile defines footprint width/length/margin, bounded speed
and load capacity. A circumscribed-circle envelope is a permitted conservative
initial approximation, with radius derived from the full footprint and
margin; it is not a tiny point agent or a real forklift model.

Static A* output is a candidate path. The engine must admit time-overlapping
segments only after swept-space and dynamic-conflict checks. Node/edge
reservations alone do not prove physical separation. The implementation must
pin interval conventions, conservative numerical tolerance, turning envelope
and minimum separation, and test collisions BETWEEN event timestamps.

Narrow aisles have exclusive unit access; intersections are conflict zones;
pick approaches and services have finite occupancy. Acquire required segment
AND downstream stopping space atomically before entry. Never strand an agent
mid-aisle relying on an uncommitted next move. Terminal occupancy persists
until a replacement plan is committed. Loading/unloading/picking/waiting also
occupy space. Cancelling future plans releases only unused reservations and
preserves actual position, physical occupancy and carried stock.

Structured waits identify cause plus blocking resource/agent when known.
Build a wait-for graph and productive-progress diagnostics. Recovery is
bounded: reprioritize pending grants, release unused future reservations,
replan, use a reachable configured yielding bay if possible, otherwise stop
with a diagnostic. Never teleport, delete a task, erase carried stock or
release occupied space. No global deadlock-freedom or safety certification
claim follows from these local policies.

## Metrics, comparison and reproducible reports

Use v3 section30 definitions. Record arrived, shipped and backlog together;
lead-time statistics cover completed orders and disclose the unfinished
population. Per-agent mutually exclusive moving/handling/traffic-wait/
service-wait/idle intervals must reconcile to its observed time. Resource
service-busy, blocked-occupied and idle times are distinct. Do not sum time
categories across different entities as if they partition one common clock.
Travel totals recompute from executed segments, including a documented
partial-segment rule at a fixed horizon.

Controlled comparisons freeze schedules, initial stock, capacities, service
durations/distributions, traffic rules, seed and horizon/mode. Candidate
assignments are pre-run arrangements; reject a placement that cannot hold
its initial stock. Rearrangement effort is explicitly excluded, never shown
as zero measured relocation work. A capacity/staffing comparison is labeled
as an operating-assumption change, not pure slotting.

Finite-cohort ranking is lexicographic: valid invariants, required cohort
completion, completion time, mean lead time, total travel, relocation count.
Incomplete candidates remain visible and cannot outrank a valid completed
run by hiding backlog. Static travel is shown separately. No arbitrary
weighted score silently combines the metrics.

Operations reports embed schema/engine/policy versions, full scenario,
initial state, seed, pre-generated schedules, event-order rules, mode/horizon,
all outcomes, trajectories/transfers/resource-state evidence and diagnostics.
A new offline verifier must initialize and RUN the headless engine from
those inputs, then compare recomputed results; reading totals or validating
only a saved event-log hash is insufficient. It makes no model API call.
Critical invariant failures pause, retain diagnostic state and invalidate
ranking; partial results cannot be displayed as success.

Meta remains a bounded planner/interpreter/summarizer. It cannot mutate stock,
drive per-frame motion, execute code, change workloads silently or override
measurements. Existing request/proposal/token limits and server-only keys
remain in force. Existing monetary approvals are not expanded by v3: the
completed benchmark allowance cannot fund extra trials; public US$1 still
needs its persistent guard before activation. CPU-only comparative runs need
explicit event/run bounds but no extra model call by default.

## Milestone backlog and acceptance gates

Use v3 prefixes so these do not overwrite the historical v2 milestones.
Only one bounded Muse coding task is dispatched at a time; Codex independently
checks expected values, diffs, evidence and staged secrets before commit/push.

| Milestone | Bounded slices | Required acceptance evidence | Status |
|---|---|---|---|
| v3-M0 | Preserve supplied brief; inspect/reuse map; versioned engine boundary, semantics and backlog | All40 sections mapped to this plan/brief; no old readiness relabeled as simulator proof | Contract documented; runtime schemas/kernel separately accepted at M2a |
| v3-M1 / W1 | Catalog Structures/Racks/Containers, then Equipment; actual dependency closure/conversion; representative static section with several stored containers, aisle, one worker/cart unit, pick and receiving/packing position | Revision/license/path/dimension/material manifests, correct fit/navigation mapping, actual top/isometric/inspection screenshots in a recorded browser (Orca or Edge), payload/performance measurements; old viewer remains fallback | Accepted for six selected assets + one isolated static fixture; full integration/engine remain open; see WAREHOUSE_SECTION_INVESTIGATION.md |
| v3-M2a | Runtime schemas, pure scheduler/clock, snapshots/reset, explicit synthetic unit/capacity fixture | Literal equal-time ordering, duplicate/stale events, bounded zero-time chains, deterministic step/advance/reset; no browser dependency | Accepted:109 simulation tests, built smoke, independent travel/order and failure-shape/payload/home-assignment counterexamples; see V3_M2A_KERNEL_REVIEW.md |
| Main environment integration | Coherent sourced warehouse in actual LayoutLab interface, canonical storage/resources/parking, readable category materials, cutaway/top/inspection, diagnostics disclosed separately | Main-app isometric and top screenshots, source/fit/nav checks; no ghost capacity or simulated success | Next after M2a review; static part of the next connected milestone only |
| v3-M2b | Atomic inventory/reservations, order lifecycle, finite resources and queues | Independent conservation ledger, full-order all-or-none reservation, finite capacities, multiple orders, stock-wait retry, impossible-work termination | Not implemented |
| v3-M3 | One engine-owned transport/picking/put-away unit, trips and service transitions | Cart/location capacities, real bucket transfers, known travel/time oracle, source/destination/terminal occupancy, event-derived completion; visual snapshot parity | Not implemented |
| v3-M4 | Swept footprint checks, time-space admission, shared zones, fairness, bounded deadlock recovery | Opposing aisle/intersection/following/turn/pick-position tests, stationary occupancy, replan/cancel/finite-horizon protection, recoverable and impossible cycles, starvation checks | Not implemented |
| v3-M5 | Complete inbound/receiving/put-away/picking/packing/dispatch slice, full synthetic cohort | Six racks/24slots/12products/4pickers/2put-away/2packing/1receiving/1dispatch;30–50orders and deliveries, real traffic/packing/stock waits, conserved stock, complete or explicitly blocked cohort | Not implemented |
| v3-M6 | Storage Planning vs Operations modes, clocks/controls/cameras/inspectors/overlays | Entity explanations from engine,1x/4x/16x/headless equality, reset parity, no cosmetic queues, recorded browser desktop/mobile evidence | Not implemented |
| v3-M7 | Controlled candidate runs, separate static/operational objectives, bounded Meta operations patches | Same-input comparisons including worse/incomplete outcomes; invalid patches rejected; offline result recomputation; real inference separately authorized/labeled | Not implemented |
| v3-M8 | Adversarial benchmarks, evidence, public guard/release and demo | Full section36/37 test matrix, all10 demo beats, report recomputation, limits/docs aligned, reviewed release public DNS/TLS/auth/guard and actual recorded browser verification | R1 public preview only; simulator release not implemented |

No gate is waived because another milestone has a successful animation.
Test evidence distinguishes headless, browser Orca, external Edge, actual source assets,
fixture/stub, live Meta and deployed release. If an integration fails, retain
the exact failed step and current working fallback rather than claiming the
representative section or full simulator complete.

## Source contracts consulted for M0

- [SimPy process concepts](https://simpy.readthedocs.io/en/latest/simpy_intro/basic_concepts.html)
  motivate event-driven processes; TypeScript remains the implementation.
- [SimPy shared resources](https://simpy.readthedocs.io/en/latest/simpy_intro/shared_resources.html)
  describe finite resource ownership, release and FIFO waiting.
- [Stern et al.](https://arxiv.org/abs/1906.08291) distinguish MAPF assumptions
  and objectives; no generic point-agent guarantee is inherited.
- [ReservationTable documentation](https://w9-pathfinding.readthedocs.io/stable/mapf/ReservationTable.html)
  documents vertex/edge reservations and optional destination reservation;
  LayoutLab must additionally enforce physical envelopes and persistent occupancy.

Asset source pins and download planning remain in the W1 investigation,
including original SimReady Central discovery. The user's newest instruction
also allows browser Orca for application testing, rendering and performance,
in addition to asset discovery/downloads. External Edge remains allowed.
Record the actual browser/engine/version, viewport and measurement method;
do not relabel historical Edge evidence as Orca or vice versa. Download the actual
dependencies needed after inspection; the earlier64MB scratch investigation
limit is no longer a reason to omit necessary source assets.

The newest instruction also prioritizes actual catalog models for warehouse
objects. Do not pass hand-made floor/building/rack/container/equipment
substitutes as the required asset integration. Functional annotations and
navigation overlays are distinct from warehouse asset geometry. If a sourced
component is demonstrably unsuitable, record the failed step and resolve
the fallback with the coordinator before substituting a custom object.

Coverage index: brief sections1–6 map to authority/scope/initial scenario;
7–8 to engine boundary/clock;9–12 to v3-M1/spatial model;13–19 to inventory,
tasks and resources;20–25 to movement/traffic/recovery;26–29 to v3-M6;
30–32 to metrics/run modes/reproducibility;33–34 to v3-M7;35–37 to evidence,
invariants and the test matrix;38–40 to the milestone backlog and final
delivery gates. No capability in those ranges is marked implemented by this
contract document.
