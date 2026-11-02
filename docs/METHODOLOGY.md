# LayoutLab methodology (M1 core)

Deterministic measurement definitions used by `@layoutlab/core`. All
measurements come from this evaluator; nothing here is inferred by a model.

## 1. Units and coordinates

- Integer millimeters for positions and dimensions. Renderer units (meters)
  are a view concern and never enter measurement.
- X and Z are floor axes, Y is height. The origin is the room corner
  (0, 0); the room spans `[0, widthMm] x [0, depthMm]`.
- Rack positions are footprint centers. Yaw is one of 0/90/180/270; 90/270
  swap width and depth in the footprint.
- Display rounding is presentation-only: the UI renders integer millimeters
  as one-decimal meters (`36800 mm` → `36.8 m`) and improvement as
  one-decimal percent (`19.0217…%` → `19.0%`). Percentages are always
  recomputed from exact integer millimeters, never from displayed values.
  Exact millimeters stay exposed in element titles and in every export.

## 2. Capacity semantics

- One product occupies exactly one location; one location holds at most one
  product. No splitting, no shared slots.
- The full stored load must fit the location's usable box under **fixed
  orientation**: width, depth, and height each fit without rotation.
- Compatibility, in check order: storage class match, location allowlist,
  product allowlist, fixed-orientation fit, product lock, requirements lock.
- Order quantities affect demand reporting (`totalUnits`) but never create
  repeat visits: each order visits the distinct product set once.
- Inventory sufficiency is assumed; replenishment is not modeled.
- Bounding-box fit does not prove packability, rack load safety, or
  handling suitability.

## 3. Conservative 2D clearance model

User-facing label: **conservative 2D clearance model**. Not a safety
certification or maneuverability assessment.

```text
cartRadiusMm       = ceil(sqrt(widthMm^2 + lengthMm^2) / 2)
navigationRadiusMm = max(cartRadiusMm + marginMm, ceil(minimumPassageWidthMm / 2))
```

- Rack footprints inflate by the navigation radius (inclusive boundary:
  touching counts as blocked).
- A point is navigable only when its clearance from every wall **strictly**
  exceeds the navigation radius and it lies outside every inflated rack.
  Example: navigation radius 700 rejects wall distances 699 and 700.
- Rack-vs-rack overlap uses interiors: touching edges are adjacent racks,
  not an overlap. Racks flush against room walls are allowed.
- Consequence: a corridor must clear strictly more than twice the
  navigation radius to guarantee traversal.

## 4. Navigation graph and A*

- Graph nodes sit at 100 mm multiples: node `(i, j)` is the floor point
  `(i*100, j*100)`, `0 <= i <= floor(widthMm/100)`. Grid size is fixed at
  100 mm by schema.
- Four-neighbor A* with Manhattan heuristic. Edge validation is required:
  adjacent free nodes are still rejected when their segment clips an
  inflated obstacle corner.
- Fixed tie-break everywhere: `(f, h, row j, column i)`, ascending.
- Endpoint connection: the endpoint itself must be navigable, otherwise it
  never connects (no teleport snap). The nearest free node within 2000 mm
  (squared distance, then row, then column) with a collision-free straight
  segment wins. Connector length is `ceil(Euclidean)`, never understated;
  on-node endpoints get connector 0.
- Measured path: `connector(a) + gridSteps * 100 + connector(b)`.
  Identical navigable points measure 0; identical unnavigable points are
  unreachable. Distinct points sharing a node measure nonzero connectors.
- No path (or no connection) yields null, meaning unreachable, never zero.

## 5. Routing policy (`nearest-neighbor-a-star/1`)

1. Start at packing. 2. Take the order's distinct products. 3. Repeatedly
   visit the nearest remaining pick point by shortest-path distance.
4. Distance ties break by product ID (code-unit `<` order). 5. Return to
   packing. The visit sequence is stored per order.
- The policy and all tie-breaks are identical across baseline, heuristic,
  and model candidates. The sequence may differ because locations differ.
- Nearest-neighbor is deterministic but not globally optimal.

## 6. Metrics

```text
orderDistanceMm      = packing -> visits -> packing, in mm
weightedTravelMm     = sum(frequency * orderDistanceMm)
meanOrderDistanceMm  = weightedTravelMm / sum(frequency)
```

- Any unreachable order: the order stays in the report with its reason,
  and complete workload travel and mean are null. Partial sums are never
  presented as the workload total.
- Mean is null when travel is incomplete or total frequency is 0.
- All aggregation uses checked safe-integer arithmetic; overflow marks the
  workload failed (`ARITHMETIC_OVERFLOW`) instead of wrapping.

## 7. Objective and comparison

- Hard constraints first. Among valid candidates: lowest weighted travel,
  then fewest relocations, then the stable assignment key (product-sorted
  pairs as JSON). Invalid candidates never outrank valid ones. The
  baseline, listed first, wins full ties.
- Relocation count = products whose final location differs from the
  baseline (a swap counts two). Empty destinations are allowed.
- Improvement percent exists only when both results are valid, settings
  (room, racks, locations, products, orders, packing, cart, passage, grid,
  route policy) are identical, and baseline travel is positive:

```text
improvementPercent = 100 * (baseline - candidate) / baseline
```

- Otherwise the comparison is N/A (null), including invalid baselines and
  zero-travel baselines. A search without improvement is a valid outcome.
- Travel reduction is not converted to labor, monetary, or throughput
  improvement. Any future distance-to-time conversion must state its speed,
  units, and every additional assumption; bare hour claims are not allowed.

## 8. Validity layers

1. **Schema parse** (Zod, strict keys): types, safe-integer bounds,
   entity-ID uniqueness, grid literal 100, and small-scene caps
   (32 racks, 128 locations, 64 products, 128 assignments,
   128 orders, 64 lines/order, 4096 total lines, 64 changes,
   64 locks, 64 report candidates). Over-cap input fails fast at
   parse time. Invalid assignments stay representable so the
   validator can diagnose them.
2. **Scene validation**: rack bounds/overlap, rack references, pick points
   in room, packing navigable. A broken scene yields no measurement and
   report outcome `INPUT_INVALID`.
3. **Assignment validation**: completeness, references, occupancy,
   compatibility, locks, allowlist references, order references, budget.
4. **Workload evaluation**: reachability per demanded order; unreachable
   orders fail the candidate but stay reported.
5. **Computation budget**: at most 250,000 grid nodes and 200,000 A*
   expansions per workload evaluation. Exhaustion fails with
   `BUDGET_EXHAUSTED`, never misreported as unreachable.

## 9. Proposals, snapshots, replay

- Proposals are changes against the immutable original baseline: revision
  match, known references, no duplicate products, then atomic application
  of the complete mapping. Every proposal starts from the baseline, never
  from a previous proposal. Empty change lists are legal (retain).
- `freezeScenario` deep-freezes the run baseline; `applyAssignment`
  rejects stale revisions and returns revision + 1. It performs no
  validity check: callers evaluate first and apply only accepted results.
- Reports embed scenario, requirements, candidates, versions, route
  policy, and limitations. Replay re-parses all trusted inputs, rejects
  version/policy mismatches, recomputes everything without inference, and
  verifies full workload claims (orders, sequences, legs, distances,
  counts, flags) plus best name, percents, and outcome.
- Every saved comparison carries the full recomputation contract:
  scenario and provenance; products and locations; baseline and candidate
  assignments; orders and frequencies; requirements (locks, relocation
  budget); cart, navigation, grid, and routing-policy settings; evaluator
  versions; validity; per-order distance and visit sequence; weighted
  total; relocation count; and improvement where comparable. The existing
  core, M2 (manual/stub), and M3 (live) envelopes already embed all of
  these — no schema change is needed to verify a download.
- Public verification (no API, key, or network — pure core replay from
  the embedded inputs; saved totals are recomputed, never echoed, so
  tampered totals, sequences, or percentages fail):

```sh
node scripts/verify-report.mjs <exported-envelope.json>   # one manual/stub/live report or failure audit
node scripts/m5-benchmark.mjs replay <benchmark.json>      # full benchmark report
node scripts/independent-bfs.mjs <measured-report.json>    # independent oracle (small on-grid scenes only)
```

- Replay is measurement recomputation, not provenance authentication: it
  proves the saved measurements follow from the embedded inputs, not who
  produced the file. A failure audit validates its audit facts and
  explicitly reports that no approved measurement exists to match.

## 10. Performance bounds

- A* visits each node at most once per leg (closed set); per-leg work is
  O(nodes log nodes) worst case, far less on open rooms.
- Pairwise distances memoize per evaluation, so repeated orders and shared
  legs cost nothing after the first computation.
- Worst-case legs per order = distinct products + 1; legs per workload =
  sum over orders. The expansion budget caps total A* work deterministically.
- Observed (Node 24, Windows laptop): oracle fixture (3721 nodes)
  evaluates in single-digit ms; sample warehouse baseline (4 racks,
  8 locations, 3 orders) at ~13 ms per evaluation; full 75-test suite in
  ~2 s. Budgets, not wall-clock timeouts, bound core computation.

## 11. Deliberate limitations (M1)

- No demand heuristic yet (M4 handoff): rank/compare APIs are ready, the
  greedy assignment search is not implemented in core.
- No model provider, orchestration loop, timeouts, or cancellation in
  core (M3 owns run budgets; core budgets cover computation only).
- Grid 100 mm, four-neighborhood, Manhattan: narrow but valid passages
  under ~100 mm effective width may read unreachable (documented
  conservative behavior).
- Single cart, single trip per order, no congestion, no multi-level travel.
- Revision protection here covers the revision number; the M2 UI boundary
  must also check scenario identity and settings before applying results.
