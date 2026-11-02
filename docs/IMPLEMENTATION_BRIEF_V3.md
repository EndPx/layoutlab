**LayoutLab — Integrated 3D Warehouse Operations Simulator**

**Implementation Brief v3**

**1. Mission**

Extend LayoutLab into an interactive warehouse operations simulator.

The user should be able to observe a warehouse operating over simulated time, with:

- Multiple incoming orders.
- Multiple workers and carts.
- Inbound deliveries.
- Receiving and put-away.
- Inventory stored in rack locations.
- Concurrent picking.
- Packing queues and service.
- Dispatch staging and shipment.
- Shared aisles and intersections.
- Congestion, waiting, and blocked operations.
- Measurable outcomes.

**Movement must be caused by the simulation engine.**

Workers must move because they have tasks. Queues must form because capacity is occupied. Inventory must move because an authorized process transfers it.

This is an operational simulation, not a prerecorded walkthrough.

Preserve the existing planning, assignment validation, deterministic routing, Meta integration, and report-verification components where they remain useful.

---

**2. Scope change from previous briefs**

The following previously deferred capabilities are now part of the target:

- Multiple simultaneous orders.
- Multiple mobile agents.
- Inventory reservation and depletion.
- Inbound stock.
- Shared resources and queues.
- Spatial conflicts between agents.
- Traffic waiting.
- Deadlock detection and bounded recovery.
- Time-based operational metrics.

The following remain outside scope unless separately approved:

- Real robot control.
- Photorealistic human behavior.
- Full forklift dynamics.
- Structural rack simulation.
- Falling goods or deformation.
- Real-world safety certification.
- Live warehouse management system integration.
- Unrestricted AI control of individual movements.

Describe the result as a **configured warehouse operations simulation**.

Do not describe it as a validated digital twin of a real facility without calibration and validation against that facility.

---

**3. Inspect the existing project before changing it**

First:

1. Read applicable repository instructions.
2. Inspect Git status.
3. Locate the current scene, evaluator, schemas, asset pipeline, model adapter, and tests.
4. Identify what can be reused.
5. Record which previous assumptions this expansion changes.
6. Create a bounded implementation backlog.
7. Implement one verified milestone at a time.

Do not rewrite working modules solely to adopt a new architecture.

Do not start Docker or install local PostgreSQL on this laptop.

Follow existing repository rules for coding agents, commits, pushes, and publication.

---

**4. Primary sources**

Use official sources for implementation contracts and research sources for conceptual guidance.

| Topic | Source |
|---|---|
| Original asset discovery portal | [NVIDIA SimReady Central](https://huggingface.co/spaces/nvidia/simready-central) |
| Asset packaging, profiles, and provenance | [SimReady documentation](https://docs.omniverse.nvidia.com/simready/latest/simready-central.html) |
| General asset collection | [NVIDIA SimReady Assets](https://huggingface.co/datasets/nvidia/simready-assets) |
| Optional complete warehouse candidate | [PhysicalAI-SimReady-Warehouse-01](https://huggingface.co/datasets/nvidia/PhysicalAI-SimReady-Warehouse-01) |
| Complete warehouse usage notes | [Warehouse dataset README](https://huggingface.co/datasets/nvidia/PhysicalAI-SimReady-Warehouse-01/blob/main/README.md) |
| Revision-pinned downloads | [Hugging Face download guide](https://huggingface.co/docs/huggingface_hub/guides/download) |
| Source units | [OpenUSD linear units](https://openusd.org/release/api/group___usd_geom_linear_units__group.html) |
| Discrete-event process concepts | [SimPy basic concepts](https://simpy.readthedocs.io/en/latest/simpy_intro/basic_concepts.html) |
| Capacity-limited resources and queues | [SimPy shared resources](https://simpy.readthedocs.io/en/latest/simpy_intro/shared_resources.html) |
| Multi-agent movement assumptions | [Stern et al., Multi-Agent Pathfinding](https://arxiv.org/abs/1906.08291) |
| Time-space reservation concepts | [Reservation table documentation](https://w9-pathfinding.readthedocs.io/stable/mapf/ReservationTable.html) |
| Rendering | [Three.js](https://threejs.org/docs/) |
| Optional React rendering | [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction) |
| Meta integration | [Meta API overview](https://dev.meta.ai/docs/overview), [quickstart](https://dev.meta.ai/docs/quickstart), [protocols](https://dev.meta.ai/docs/protocols) |
| Runtime validation | [Zod](https://zod.dev/) |
| Core tests | [Vitest](https://vitest.dev/guide/) |
| Browser tests | [Playwright](https://playwright.dev/docs/intro) |

SimPy is a reference for event and resource semantics. Its documentation describes processes interacting through events and waiting for capacity-limited resources. This does not require replacing the existing TypeScript stack with Python. [Process concepts](https://simpy.readthedocs.io/en/latest/simpy_intro/basic_concepts.html), [resource concepts](https://simpy.readthedocs.io/en/latest/simpy_intro/shared_resources.html)

The navigation references describe techniques and assumptions. They do not certify our implementation.

---

**5. Target experience**

When a simulation starts, the user should see:

- Deliveries arriving at receiving.
- Receiving work consuming capacity and time.
- Put-away workers collecting received loads.
- Loads transported to compatible rack locations.
- Orders arriving and waiting for inventory or workers.
- Pickers collecting reserved quantities.
- Carts moving through shared aisles.
- Agents waiting when access is unavailable.
- Completed picks transferred to packing staging.
- Packing stations processing orders.
- Finished packages moving to dispatch.
- Shipments leaving the simulated warehouse.

Selecting an entity must explain its current behavior.

Examples:

> Worker 03 is waiting for access to Aisle B.

> Order 018 is waiting for Product C inventory.

> Packing Station 02 is processing Order 011.

All statuses must originate from simulation state.

---

**6. Initial scenario**

Implement a small but complete scenario first.

Suggested starting configuration:

| Element | Initial target |
|---|---:|
| Floors | 1 |
| Fixed racks | 6 |
| Storage locations | Approximately 24 |
| Products | Approximately 12 |
| Mobile picking agents | 4 |
| Mobile put-away agents | 2 |
| Packing stations | 2 |
| Receiving service positions | 1 |
| Dispatch service positions | 1 |
| Orders | 30–50 scheduled orders |
| Inbound deliveries | Several scheduled deliveries |

These are implementation targets for a synthetic scenario, not operational claims.

For the first version:

- Treat a worker and assigned cart as one mobile unit.
- Model packing stations as staffed service resources.
- Do not also allocate a mobile worker to packing unless that staffing relationship is explicitly modeled.
- Use a small number of clearly defined load types.

Keep all capacities configurable.

---

**7. Simulation architecture**

Separate the engine from rendering.

```text
Scenario configuration
        │
        ▼
Simulation engine
 ├─ Event scheduler and clock
 ├─ Order lifecycle
 ├─ Inventory and reservations
 ├─ Tasks and dispatching
 ├─ Service resources and queues
 ├─ Navigation and traffic reservations
 ├─ Invariant checks
 └─ Metrics and event log
        │
        ▼
Timestamped state / snapshots
        │
        ▼
3D viewer and operational dashboard
```

The engine must run headlessly.

Rendering must not determine:

- When an order completes.
- How long a worker takes.
- Whether inventory is available.
- Whether a collision occurs.
- Queue priority.
- Business metrics.

Use integer millimeters for canonical geometry and an integer simulation-time unit.

Document time rounding.

---

**8. Clock and event scheduling**

Maintain a simulation clock independent of browser frame rate.

Events may include:

```text
DELIVERY_ARRIVED
RECEIVING_STARTED
RECEIVING_COMPLETED
PUTAWAY_ASSIGNED
MOVEMENT_STARTED
MOVEMENT_COMPLETED
PUTAWAY_COMPLETED
ORDER_ARRIVED
INVENTORY_RESERVED
PICKING_ASSIGNED
PICK_STARTED
PICK_COMPLETED
PACKING_QUEUED
PACKING_STARTED
PACKING_COMPLETED
DISPATCH_STARTED
ORDER_SHIPPED
TRAFFIC_WAIT_STARTED
TRAFFIC_WAIT_ENDED
REPLAN_REQUESTED
DEADLOCK_DETECTED
```

Use deterministic ordering for equal-time events, such as:

```text
simulation timestamp
→ documented event priority
→ monotonic event sequence
```

Prevent unbounded zero-time event loops.

Playback at `1×`, `4×`, or `16×` must produce identical simulation outcomes for the same scenario and seed.

If the browser cannot keep up, reduce visual updates. Do not silently discard simulation events.

---

**9. Warehouse 3D environment**

The scene must read as a warehouse interior.

Include:

- Floor.
- Partial walls and building structure.
- Receiving entrance.
- Receiving staging.
- Storage racks and shelves.
- Products or containers inside rack slots.
- Aisles.
- Safe waiting bays.
- Packing staging and stations.
- Dispatch staging and exit.
- Agent idle/parking positions.

Default view:

> Open-roof cutaway with an isometric camera.

Additional views:

- Top view.
- Selected location.
- Selected agent.
- Selected station.
- Reset overview.

Avoid a default camera blocked by walls or roof.

Do not add visible obstacles that the navigation engine ignores.

---

**10. SimReady asset selection**

Prioritize the original SimReady Central catalog.

The user supplied a screenshot showing:

```text
Industrial
└─ Warehouse
   ├─ Containers
   ├─ Equipment
   ├─ Supplies
   ├─ Racks
   ├─ Structures
   ├─ Barriers
   ├─ Signs
   └─ Security
```

Inspect actual items in these categories.

Start with:

1. Structures.
2. Racks.
3. Containers.
4. Equipment.

Do not infer an asset’s contents solely from its category.

For each selected item, record:

- Source repository.
- Immutable revision.
- Asset path.
- License.
- Dependencies.
- Units.
- Transformed bounds.
- Preparation/conversion method.
- Modifications.
- Attribution.

SimReady combines OpenUSD content with metadata and validation requirements for particular uses. Inspect the selected package rather than assuming all required behavior is supplied. [SimReady documentation](https://docs.omniverse.nvidia.com/simready/latest/simready-central.html)

Use the separate complete warehouse dataset as an alternative candidate, not an automatic replacement. Its README describes a prebuilt warehouse scene intended for Isaac Sim; browser compatibility remains an integration task. [Dataset README](https://huggingface.co/datasets/nvidia/PhysicalAI-SimReady-Warehouse-01/blob/main/README.md)

---

**11. Asset integration gate**

Before integrating a large scene, prove one representative section:

- One structural element.
- One rack.
- Several visible stored containers.
- One navigable aisle.
- One worker/cart unit.
- One picking location.
- One receiving or packing position.

Verify:

- Scale.
- Axis orientation.
- Material loading.
- Shelf placement.
- Bounds.
- Browser performance.
- Dependency completeness.

Use a lightweight custom warehouse shell if necessary. Clearly identify which components are custom and which are sourced.

Do not download the entire dataset without first inspecting dependency and payload requirements.

Do not assume a small root USD file contains the full scene.

---

**12. Canonical spatial model**

Use one canonical geometry model for planning, navigation, and visualization.

Every storage location needs:

```ts
type StorageLocation = {
  id: string;
  rackId: string;
  storageAnchorMm: {
    x: number;
    y: number;
    z: number;
  };
  approachPointMm: {
    x: number;
    z: number;
  };
  usableDimensionsMm: {
    width: number;
    depth: number;
    height: number;
  };
  storageClass: string;
  maxQuantity: number;
};
```

The storage anchor belongs inside the shelf.

The approach point belongs on the accessible aisle floor.

Receiving, packing, dispatch, and waiting areas also require explicit positions and capacities.

Do not place every queued agent at the same coordinate.

---

**13. Products, containers, and physical quantities**

Use explicit quantities and units.

For the first version:

- A product has a defined unit size and handling class.
- A load/container has a bounded quantity or capacity.
- A mobile agent cannot carry more than its configured capacity.
- Large orders may require multiple trips.
- Packing cannot begin until the required quantities have arrived.
- Put-away cannot exceed destination capacity.

If products use different capacity units, define a consistent conversion model or prohibit incompatible combinations.

Do not treat “one box” and “one item” as interchangeable.

Visual containers may aggregate multiple units, but the mapping must be documented.

---

**14. Inventory accounting**

Inventory must be authoritative and conserved.

Track physical quantities in explicit buckets:

- Receiving/staging.
- Storage locations.
- Mobile containers.
- Packing/staging.
- Packed outbound.
- Dispatched.

Reservations are commitments against physical stock, not additional physical stock.

For each product:

```text
Initial stock + accepted inbound quantities
=
receiving stock
+ storage stock
+ in-transit stock
+ packing stock
+ packed outbound stock
+ dispatched quantities
```

Required invariants:

- No negative physical quantity.
- Reserved storage quantity cannot exceed available eligible stock.
- A transfer removes from one bucket and adds to another atomically.
- A failed task cannot duplicate or destroy inventory.
- Repeated event processing cannot apply the same transfer twice.

Keep event IDs and task IDs for traceability.

---

**15. Order reservation policy**

Start with a documented full-order reservation policy:

1. An order arrives.
2. Check all required quantities.
3. Reserve all required storage quantities atomically, or reserve none.
4. If insufficient, enter `WAITING_FOR_STOCK`.
5. Retry when relevant put-away completes.

This avoids partially reserving multiple orders indefinitely without a clear policy.

Do not reserve inbound quantities as immediately pickable storage.

For the initial version, an order may wait until received goods are physically put away.

If a different policy is later introduced, evaluate it as a separate configured policy.

---

**16. Order lifecycle**

```text
CREATED
→ WAITING_FOR_STOCK
→ READY_FOR_PICKING
→ PICKING
→ WAITING_FOR_PACKING
→ PACKING
→ READY_FOR_DISPATCH
→ DISPATCHING
→ SHIPPED
```

Not every order must enter `WAITING_FOR_STOCK`.

Record timestamps for each transition.

An order must not become `SHIPPED` merely because its animation reaches the exit.

Shipment completion requires the corresponding engine event and inventory transfer.

---

**17. Inbound lifecycle**

```text
SCHEDULED
→ ARRIVED
→ WAITING_FOR_RECEIVING
→ RECEIVING
→ RECEIVED
→ WAITING_FOR_PUTAWAY
→ IN_PUTAWAY
→ STORED
```

Receiving has finite capacity.

Received goods occupy finite staging space.

If staging is full:

- Hold further processing according to a documented policy.
- Preserve the load’s physical location.
- Do not overlap loads or discard them.

Put-away must select a compatible destination with sufficient remaining capacity.

If none exists, expose the blocking reason.

---

**18. Tasks and mobile agents**

Mobile task types:

- Put-away.
- Picking.
- Transport to packing staging.
- Transport to dispatch staging if represented by a mobile role.
- Return to idle or parking position.

Starting agent states:

```text
IDLE
ASSIGNED
MOVING
WAITING_FOR_TRAFFIC
WAITING_FOR_SERVICE
LOADING
UNLOADING
PICKING
BLOCKED
```

Task dispatcher:

- Respect role eligibility.
- Assign only available agents.
- Use a documented FIFO rule with deterministic tie-breaking initially.
- Avoid assigning one agent to multiple active tasks.
- Record task waiting time.
- Add aging where necessary to prevent starvation.

Do not make idle agents wander solely to create activity.

---

**19. Packing and dispatch resources**

Packing stations have:

- Finite service capacity.
- Input staging.
- A service-time configuration.
- Output staging or transfer rules.

An order occupies a packing resource for its configured service duration.

If no station is available, it waits in a real modeled queue.

Dispatch also has finite capacity and a documented release rule.

For the first version, scheduled or continuous dispatch service is sufficient. A moving truck model is optional; the underlying shipment process is required.

Avoid introducing full truck-routing simulation.

---

**20. Movement model**

Initially support a conservative worker-with-cart profile.

Agent properties:

```ts
type MobileAgentProfile = {
  footprintWidthMm: number;
  footprintLengthMm: number;
  clearanceMarginMm: number;
  speedMmPerSecond: number;
  loadCapacity: number;
};
```

Use a conservative footprint for navigation.

If using a circumscribed circle, document the approximation and inflate static obstacles appropriately.

Do not support visibly different vehicle sizes while evaluating all of them as the same tiny point.

For the first version:

- Use piecewise-linear movement along validated routes.
- Use bounded speed.
- Add explicit turning/service delays where configured.
- Do not claim acceleration, braking, or steering dynamics unless implemented.

---

**21. Multi-agent collision prevention**

Independent A* paths are insufficient for concurrent motion.

Plan and authorize movement in space and time.

Prevent:

- Two footprints occupying conflicting space simultaneously.
- Opposite-direction traversal of the same narrow segment.
- Unsafe following gaps.
- Overlap during turns.
- Conflicting intersection entry.
- Arrival into an occupied service position.

MAPF literature explicitly distinguishes movement and conflict assumptions; document ours. [Stern et al.](https://arxiv.org/abs/1906.08291)

Use time-space reservations as an implementation pattern. Reservation systems can constrain both nodes and edges at particular times. [Reservation-table reference](https://w9-pathfinding.readthedocs.io/stable/mapf/ReservationTable.html)

Do not claim that point reservations alone guarantee non-overlapping physical footprints.

---

**22. Aisles, intersections, and waiting bays**

Classify traffic areas.

| Area | Initial policy |
|---|---|
| Narrow aisle | Exclusive access by one mobile unit at a time |
| Intersection | Reserve the conflict zone before entry |
| Picking approach | Capacity-limited service position |
| Waiting bay | Explicit physical position |
| Wide aisle | Use nonconflicting reserved paths; remain conservative |
| Parking area | Individual non-overlapping idle positions |

The narrow-aisle policy is deliberately conservative. State that it may underestimate throughput.

Before entering a constrained segment:

1. Verify the segment reservation.
2. Verify the destination or downstream waiting position is available.
3. Acquire the needed reservations atomically.
4. Enter only after authorization.

An agent must not stop halfway through a narrow aisle because its next expected position was never available.

Queue visually outside the constrained segment.

---

**23. Continuous movement checks**

Check movement over the interval, not only at sample timestamps.

For each authorized movement:

- Validate the swept footprint against static obstacles.
- Check time-overlapping trajectories against other agents.
- Preserve minimum configured separation.
- Reserve occupancy during picking, loading, unloading, and waiting.

If using discretized time:

- Document the quantum.
- Round travel durations conservatively.
- Include swept-space checks or conservative occupancy envelopes between steps.
- Do not allow high playback speed to skip collision checks.

The renderer interpolates approved engine movement. It cannot create an independently eased path that clips through obstacles.

Visual heading changes may be smoothed only if the footprint assumptions remain valid.

---

**24. Waiting, fairness, and deadlocks**

Represent waiting causes explicitly:

- Waiting for stock.
- Waiting for an eligible worker.
- Waiting for an aisle.
- Waiting for a picking position.
- Waiting for receiving capacity.
- Waiting for packing.
- Waiting for dispatch.
- Waiting for downstream space.

Do not count legitimate service waiting as a deadlock.

Maintain a wait-for relationship for resource conflicts.

Detect:

- Cycles in resource waiting where applicable.
- Prolonged absence of productive progress.
- Repeated replanning with no movement.
- Starvation.

Bounded recovery:

1. Reorder pending grants using a documented priority rule.
2. Release unused future reservations.
3. Preserve current physical occupancy.
4. Replan affected agents.
5. Move a yielding agent to a reachable waiting bay when possible.
6. Stop with a diagnostic if recovery fails.

Never teleport, pass through another agent, or silently delete a task.

Do not claim global deadlock freedom from a local recovery heuristic.

---

**25. Endpoints and reservation lifetime**

Destinations remain occupied while an agent is stopped there.

Do not automatically free a destination merely because the movement ended.

If using finite-horizon planning:

- Keep the agent’s terminal occupancy protected until a replacement plan is committed.
- Ensure every issued plan can stop safely within its reserved region.
- Avoid plans that rely on uncommitted future movement by another agent.

When cancellation or replanning occurs:

- Cancel future events and reservations consistently.
- Preserve actual position and carried inventory.
- Recompute the task continuation.
- Do not release space still physically occupied.

---

**26. User interface**

Provide two main modes:

**Storage Planning**

- Inspect assignments.
- Generate alternatives.
- Compare static and operational results.

**Operations Simulation**

- Observe the complete running warehouse.
- Inspect agents, orders, queues, and inventory.

Suggested layout:

```text
Scenario · Run status · Simulation clock · Speed · Controls

Arrived | Shipped | Backlog | Mean lead time | Traffic waiting

┌────────────────┬───────────────────────────┬──────────────────┐
│ Orders         │                           │ Inspector        │
│ Agents         │       Warehouse 3D        │ Selected entity  │
│ Resources      │                           │ State and reason │
│ Inventory      │                           │ Task / queue     │
└────────────────┴───────────────────────────┴──────────────────┘

Event timeline · Run diagnostics · Compare runs
```

Use operational labels rather than internal error codes in the main interface.

Expose diagnostic details in an expandable panel.

---

**27. 3D visual behavior**

Show:

- Products inside shelves.
- Loads on carts while in transit.
- Receiving and dispatch staging.
- Queues at designated positions.
- Active work at stations.
- Agent orientation and movement.
- Selected route and next destination.
- Status colors plus text/icons.

Show route arrows primarily for the selected agent.

Optional overlays:

- Aisle occupancy.
- Reserved zones.
- Congestion heatmap.
- Waiting-time heatmap.
- Storage demand.
- Navigation footprints.

Do not draw every route simultaneously by default.

The warehouse must remain understandable during a busy run.

---

**28. Selection and explanation**

Clicking an agent shows:

- Role.
- Task.
- Order/load ID.
- Current destination.
- Carried quantity.
- Distance traveled.
- State.
- Waiting reason.
- Blocking agent or resource, when known.

Clicking an order shows:

- Arrival time.
- Required products.
- Reservation status.
- Picked quantities.
- Current phase.
- Queue duration.
- Completion/shipment time if available.

Clicking a station shows:

- Capacity.
- Occupancy.
- Queue.
- Busy/idle/blocked time.

Example:

> Worker 04 is waiting at Bay B2 because Aisle A is reserved by Worker 01.

This explanation must be derived from structured engine state.

---

**29. Simulation controls**

Provide:

- Start.
- Pause.
- Resume.
- Reset.
- Step one event.
- Playback speed.
- Follow selected agent.
- Reset camera.
- Toggle overlays.

For the first version, editing layout or operating parameters requires a paused run and a new scenario/run.

Do not instantaneously apply a new storage assignment to a running inventory state.

For candidate comparisons:

- Initialize separate runs from a controlled initial state.
- Treat candidate placement as a pre-run arrangement.
- State whether rearrangement effort is excluded.

If live physical relocation is added later, it must be represented by actual transport tasks and inventory transfers.

---

**30. Metrics**

Define metrics before implementing dashboard cards.

| Metric | Definition |
|---|---|
| Arrived orders | Orders whose arrival event occurred |
| Shipped orders | Orders whose shipment event completed |
| Backlog | Arrived orders not shipped |
| Lead time | Shipment time minus order arrival time |
| Picking travel | Distance traveled during picking tasks |
| Put-away travel | Distance traveled during put-away tasks |
| Traffic waiting | Time blocked by movement access |
| Resource waiting | Time waiting for service capacity |
| Stock waiting | Time waiting for required inventory |
| Resource utilization | Busy time divided by the defined available resource time |
| Completion time | Time when all eligible cohort orders are shipped |

Keep productive handling, moving, waiting, and idle categories distinct.

Do not sum overlapping time categories as though they were mutually exclusive.

For lead time, disclose that completed-order averages exclude unfinished orders. Always show backlog beside them.

---

**31. Run modes and fair comparisons**

Support two explicit evaluation modes.

**Fixed-window mode**

- Run for a defined simulated duration.
- Report completed orders, backlog, waiting, and inventory state.
- Do not hide incomplete orders.

**Finite-cohort mode**

- Use a fixed order and delivery schedule.
- Stop new arrivals after the configured cutoff.
- Continue until all fulfillable work completes or a blocked condition is diagnosed.
- Report total completion time and individual lead times.

If stock supply is insufficient and no event can resolve it, report unfulfilled work. Do not run forever.

Compare candidates using identical:

- Order schedules.
- Delivery schedules.
- Initial stock.
- Resource capacities.
- Service-time assumptions.
- Traffic policy.
- Random seeds.
- Evaluation horizon/mode.

---

**32. Randomness and reproducibility**

Begin with deterministic service durations.

Introduce randomness only through explicit distributions.

For fair comparisons:

- Pre-generate external order and delivery schedules.
- Use seeded random sources.
- Key stochastic service samples to stable logical identities where appropriate.
- Avoid changing all random samples merely because one candidate generates a different event sequence.

Save:

- Scenario.
- Seed.
- Policy configuration.
- Engine version.
- Event ordering rules.
- Initial state.
- External schedules.

The same configuration must produce the same logical result regardless of rendering frame rate or playback speed.

---

**33. Meta model integration**

Meta may:

- Interpret a planning request.
- Produce schema-validated scenario changes.
- Propose storage assignments.
- Request bounded comparative runs.
- Summarize measured outcomes.

Meta must not:

- Decide per-frame collision avoidance.
- Directly alter inventory balances.
- Overwrite measured results.
- Bypass compatibility rules.
- Change the benchmark workload silently.
- Execute arbitrary code.

Keep decision-making bounded.

Example supported request:

> Compare the current assignment with an alternative that moves no more than four products while keeping Product A fixed.

Example scenario request:

> Compare one and two packing stations using the same workload.

The second request changes staffing/capacity assumptions and must be presented as such. Do not call it a pure slotting improvement.

---

**34. Optimization objective**

Preserve static distance evaluation as a fast diagnostic.

Add operational evaluation as a separate result.

Suggested initial objective for finite-cohort comparisons:

1. Zero invariant violations.
2. All required orders completed, or explicitly report the candidate incomplete.
3. Lowest cohort completion time.
4. Lowest mean order lead time.
5. Lowest total travel.
6. Fewest product relocations.

The exact objective must be visible in run configuration.

Do not silently combine incompatible metrics into an arbitrary score.

A shorter picking route may produce worse congestion. Display the trade-off instead of hiding it.

---

**35. Evidence and claims**

Retain the previous evidence-audit corrections.

The original industry sources motivate the problem, but their reported savings have not been independently reproduced by us.

Use:

- Published sources for context.
- Explicit synthetic scenarios for initial development.
- LayoutLab-generated reports for our measured results.

Do not claim:

- Proven real warehouse savings.
- Safety certification.
- Accurate human behavior.
- Validated forklift operation.
- Production readiness from a successful animation.

Each screenshot or report should identify whether the scenario is synthetic, reconstructed, or operationally calibrated.

---

**36. Required tests**

**Inventory**

- Reservation cannot exceed eligible stock.
- Transfers conserve quantities.
- Duplicate event processing cannot duplicate stock.
- Insufficient stock blocks an order.
- Put-away releases appropriate waiting orders.
- Location and cart capacities are enforced.

**Lifecycle**

- Orders cannot skip required stages.
- Packing cannot start before all required picks arrive.
- Shipment cannot precede packing completion.
- Receiving and staging capacities cause waiting.
- Agent/task ownership is consistent.

**Navigation**

- Two agents approaching a narrow aisle from opposite ends.
- Two agents entering an intersection simultaneously.
- A following agent approaching a stopped agent.
- Two agents requesting the same picking point.
- Footprint checks during turns.
- Stationary destination remains occupied.
- Replanning preserves current occupancy.
- Finite-horizon plans stop safely.

**Deadlock and fairness**

- Detect a constructed waiting cycle.
- Recover when a reachable waiting bay exists.
- Diagnose failure when recovery is impossible.
- Prevent indefinite starvation in the supported scenario.

**Determinism**

- Headless and visual runs agree.
- Playback speed does not change results.
- Identical scenario and seed reproduce results.
- Reset restores the complete initial state.

**Reporting**

- Backlog is not hidden.
- Time categories reconcile.
- Travel totals reconcile with movement segments.
- Exported reports can be recomputed.

---

**37. Runtime diagnostics**

Keep a development monitor for:

- Footprint overlap violations.
- Inventory conservation failures.
- Capacity violations.
- Invalid transitions.
- Stale events.
- Orphaned tasks.
- Reservation leaks.
- Deadlock incidents.
- Starvation warnings.
- Event count and processing rate.

On a critical invariant failure:

1. Pause the run.
2. Preserve the diagnostic state.
3. Identify the entities and last relevant events.
4. Mark the run invalid for comparison.
5. Do not continue displaying success metrics.

“Zero observed overlaps in these tests” is acceptable after measurement. An unconditional safety guarantee is not.

---

**38. Implementation milestones**

| Milestone | Work | Acceptance gate |
|---|---|---|
| **M0** | Inspect current project and update scope/contracts | Reuse plan, interfaces, and backlog documented |
| **M1** | Representative warehouse section | Correctly scaled assets, shelf products, approach points, navigable geometry |
| **M2** | Headless order, inventory, and resource engine | Multiple orders complete with conservation and capacity tests |
| **M3** | Single-agent transport connected to engine | Real inventory transfers and measured movement |
| **M4** | Multiple agents and reservations | Conflict scenarios pass without overlap or teleporting |
| **M5** | Receiving, put-away, packing, dispatch integration | Finite workload flows through the complete system |
| **M6** | 3D state synchronization and inspectors | Visual state agrees with engine snapshots |
| **M7** | Candidate comparison and Meta planning | Same-input comparative runs and schema-validated proposals |
| **M8** | Benchmark, deployment, and demo | Reproducible reports, documented limits, verified public behavior |

These gates may be developed in small connected slices. Do not wait until the end to integrate rendering.

Do not call the entire simulator complete when only one happy-path order works.

---

**39. Required demonstration**

The final demonstration should show:

1. A recognizable warehouse with goods stored inside racks.
2. Multiple orders arriving over time.
3. Multiple agents performing different tasks.
4. A visible traffic wait caused by shared access.
5. A packing queue caused by finite capacity.
6. An inbound delivery being received and put away.
7. An order progressing because stock becomes available.
8. Inspection of an agent’s actual waiting reason.
9. A controlled comparison between planning alternatives.
10. Exported results and limitations.

Events must arise from a documented scenario.

Do not create cosmetic traffic jams or artificial metric changes disconnected from the engine.

---

**40. Deliverables and completion report**

Deliver:

- Working 3D warehouse environment.
- Asset manifest and attribution.
- Canonical geometry and location mapping.
- Headless simulation engine.
- Inventory and lifecycle implementation.
- Multi-agent movement coordination.
- Queue and resource management.
- Deadlock diagnostics and supported recovery.
- UI controls and entity inspectors.
- Meta integration.
- Test fixtures and results.
- Reproducible comparison reports.
- Setup and deployment instructions.
- Known limitations.

Final status must distinguish:

- Implemented.
- Tested headlessly.
- Tested visually.
- Tested with live Meta inference.
- Asset integration verified.
- Deployed and verified.
- Blocked.
- Not implemented.

**Start by inspecting the repository and implementing the first representative warehouse section plus the engine contracts. Continue through the milestones without silently reducing the target to decorative animation.**

**The defining requirement is that the visible warehouse and the simulated warehouse are the same system: every movement, wait, stock transfer, queue, and reported result must have an accountable cause in the engine.**
