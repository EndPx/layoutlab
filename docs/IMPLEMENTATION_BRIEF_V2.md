Berikut **brief LayoutLab versi revisi yang siap dikirim ke Muse**. Versi ini menggantikan rancangan sebelumnya: **MVP mengoptimalkan penempatan barang pada rak tetap**, sementara perubahan struktur rak menjadi pengembangan berikutnya.

Instruksinya dalam bahasa Inggris, dengan dasar masalah, sumber, batas kemampuan, dan acceptance criteria yang jelas.

---

**LayoutLab — Implementation Brief v2**

**Evidence-Based Warehouse Storage Planning with Meta Models and NVIDIA SimReady Assets**

**1. Mission and execution mandate**

Build **LayoutLab**, a warehouse planning application that helps users evaluate storage assignments against picking demand and operational constraints.

The application must:

1. Load a warehouse configuration with fixed racks and storage locations.
2. Load a set of products and picking orders.
3. Evaluate the current product-to-location assignment.
4. Generate alternative assignments using a Meta model.
5. Independently validate and measure every proposal.
6. Return evaluation feedback to the model for bounded revision.
7. Compare the results with a simple non-LLM heuristic.
8. Present a clear explanation and an exportable evaluation report.

Working tagline:

> Test warehouse changes before making them.

Product description:

> LayoutLab helps warehouse planners compare storage assignments using picking demand and explicit operational constraints. A Meta-powered agent proposes changes, while an independent evaluator measures their effects and provides feedback for revision.

This brief supersedes the earlier rack-movement-first specification.

In particular:

- Product reassignment is now the primary optimization action.
- Rack geometry remains fixed in the MVP.
- Physical rack relocation is outside the MVP.
- The application must not claim proven real-world savings before operational validation.

Inspect the actual workspace before implementation. Follow its applicable instructions and preserve existing work.

Do not insert LayoutLab into an unrelated project repository. Establish an appropriate project directory before scaffolding.

---

**2. Evidence behind the problem**

The problem is grounded in the following five sources.

These sources establish that picking travel, storage assignment, and warehouse configuration are meaningful operational concerns. They do not establish that LayoutLab has customers, achieves the same results, or outperforms existing software.

| Source | Relevant finding | Evidence boundary |
|---|---|---|
| **DHL, 2020 — IDEA** | DHL reported reductions in employee travel of up to 50% and productivity increases of up to 30% in early commercial deployments using picking optimization. | Operator-reported results; maximum reported improvements, not universal averages. [Official source](https://group.dhl.com/en/media-relations/press-releases/2020/artificial-intelligence-dhl-algorithm-makes-e-fulfillment-more-effective.html) |
| **Daitum, 2023 — SA Power Networks** | Historical demand informed material relocation and grouping. The provider reported travel reductions of up to 25%. | Vendor case study with a named customer; not an independently audited public dataset. [Case study](https://daitum.com/advanced-warehouse-layout-sa-power-networks-case-study/) |
| **Logio — DHL/Humanic** | The provider reported a 22% reduction in picker walking distance following changes to layout, stock placement, and processes. An 8% productivity increase was described as potential. | Combined interventions; do not attribute the result to a single technique. [Case study](https://logio.com/case-studies/dhl) |
| **Araújo et al., 2026** | Company ERP data, time studies, and nine representative orders supported evaluation of storage/layout and routing alternatives. | Reported improvements are simulation-based estimates from one case, not measured post-deployment savings. [Research article](https://tge.sze.hu/tge/article/view/623) |
| **Suri et al., 2026** | ERP movements and measured process times were used to compare four warehouse layout alternatives with handling, capacity, and access trade-offs. | Supports structured decision support; does not validate LayoutLab’s specific implementation. [Research article](https://bioresources.cnr.ncsu.edu/resources/warehouse-layout-optimization-based-on-erp-driven-modeling-a-case-study-from-the-wood-industry/) |

Use these sources to support the problem statement.

Do not reuse their reported percentage improvements as LayoutLab’s performance claims.

Do not describe these five publications as five available datasets.

---

**3. Problem statement**

Warehouse picking performance depends partly on where products are stored and which products are picked together.

A storage assignment can create unnecessary travel when frequently requested products are far from the packing area or products commonly requested together are dispersed.

Changing assignments also introduces constraints:

- Some products or locations must remain fixed.
- Products must fit their assigned storage locations.
- Storage classes must be compatible.
- Required locations must be reachable.
- Relocation work may be limited.
- Improvements must be measured against the same demand workload.

The problem LayoutLab addresses is:

> Warehouse planners need a reproducible way to compare storage assignments against picking demand and operational constraints before changing the warehouse.

The initial project will test this problem through published evidence and explicit benchmark scenarios.

Direct customer interviews are not a prerequisite for this implementation.

---

**4. What the project must prove**

LayoutLab must demonstrate three separate things:

| Claim | Required evidence |
|---|---|
| The operational problem is meaningful | The five referenced industry and academic sources |
| The application performs its stated function | Working input, proposal, validation, measurement, comparison, and export flows |
| The Meta model contributes useful behavior | Measured comparison with a heuristic and with its own first proposal |

Do not merge these claims.

A relevant industry problem does not automatically prove product-market fit.

A working application does not automatically prove superior optimization.

A visually convincing scene does not establish measurement accuracy.

---

**5. Target role and primary workflow**

Initial target role:

> A warehouse planner or operations analyst evaluating storage assignments.

Do not restrict the product claim to small Indonesian warehouses unless later evidence supports that segment.

Primary workflow:

1. Open a warehouse scenario.
2. Inspect racks, locations, products, and orders.
3. Evaluate the current assignment.
4. Enter a planning requirement.
5. Review the interpreted constraints.
6. Generate and test alternatives.
7. Compare the current assignment, heuristic, and model proposals.
8. Inspect relocations and trade-offs.
9. Apply a selected candidate to the planning scene.
10. Export the report.

Example request:

> Reduce picking travel for the loaded orders. Keep product A in its current location, preserve cold-storage compatibility, and relocate no more than four products.

The application evaluates a plan. It does not execute warehouse movements.

---

**6. Locked MVP scope**

| Area | Decision |
|---|---|
| Warehouse | One rectangular floor |
| Racks | Fixed rectangular footprints |
| Storage locations | Explicit locations associated with racks |
| Product allocation | One dedicated location per product |
| Location occupancy | At most one product per location |
| Inventory splitting | Not supported |
| Optimization action | Reassign products to compatible locations |
| Picking demand | Orders containing product IDs and quantities |
| Route policy | One documented deterministic policy for every method |
| Navigation | Conservative 2D cart-clearance model |
| Model revisions | At most three proposals per run |
| Visualization | 2D plan and basic 3D scene |
| Storage | Browser persistence and JSON export |
| Runtime | Native Node processes |
| Database | Not required |
| Docker | Prohibited on this laptop |

Suggested initial scale:

- Four to six racks.
- Twelve to twenty storage locations.
- Eight to twelve products.
- Ten to twenty order templates.
- Integer frequencies for repeated order templates.

Use small scenes that are easy to inspect and evaluate.

---

**7. Explicit exclusions**

Do not add these before the MVP passes its gates:

- Physical rack relocation.
- SKU splitting across multiple locations.
- Multi-level travel.
- Forklift dynamics.
- Multiple simultaneous pickers.
- Congestion simulation.
- Replenishment optimization.
- Stock depletion simulation.
- Automated replenishment.
- Temperature simulation.
- Hazardous-material compliance.
- Warehouse management system integration.
- Automatic floor-plan reconstruction.
- Robot training.
- Billing, accounts, or organizations.
- Global optimality claims.

Storage classes such as `ambient` or `cold` are compatibility labels in the MVP. They are not physical simulations or regulatory assessments.

---

**8. Sources for implementation**

Use these official references when working on their corresponding components.

| Component | Reference |
|---|---|
| Event requirements and schedule | [Meta hackathon](https://dev.meta.ai/events/global-hackathon) |
| Meta model capabilities | [Meta API overview](https://dev.meta.ai/docs/overview) |
| Authentication and first request | [Meta quickstart](https://dev.meta.ai/docs/quickstart) |
| Request protocol compatibility | [Meta API protocols](https://dev.meta.ai/docs/protocols) |
| Asset discovery | [NVIDIA SimReady Central](https://huggingface.co/spaces/nvidia/simready-central) |
| Asset requirements and provenance | [SimReady documentation](https://docs.omniverse.nvidia.com/simready/latest/simready-central.html) |
| Candidate asset packages | [NVIDIA SimReady Assets](https://huggingface.co/datasets/nvidia/simready-assets) |
| Profiles and validation | [SimReady Foundation](https://github.com/NVIDIA/simready-foundation) |
| Revision-pinned downloads | [Hugging Face download guide](https://huggingface.co/docs/huggingface_hub/guides/download) |
| Source units | [OpenUSD linear units](https://openusd.org/release/api/group___usd_geom_linear_units__group.html) |
| Asset attribution | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) |
| Frontend | [React](https://react.dev/learn), [Vite](https://vite.dev/guide/) |
| Secret separation | [Vite environment variables](https://vite.dev/guide/env-and-mode) |
| Rendering | [Three.js](https://threejs.org/docs/) |
| Optional React renderer | [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction) |
| Optional styling | [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite) |
| Backend | [Express](https://expressjs.com/en/starter/basic-routing/) |
| Schema validation | [Zod](https://zod.dev/) |
| Core tests | [Vitest](https://vitest.dev/guide/) |
| Browser tests | [Playwright](https://playwright.dev/docs/intro) |
| Workspace management | [pnpm workspaces](https://pnpm.io/workspaces) |

Recheck current package requirements and model availability.

Do not install tools merely because they appear in this table.

---

**9. Data and fixture policy**

Support three evidence categories:

| Category | Meaning |
|---|---|
| Published evidence | Facts and results reported in the referenced sources |
| Reconstructed scenario | A scenario derived from sufficiently detailed published information |
| Synthetic benchmark | A deliberately constructed test scenario with declared assumptions |

Every fixture must identify its category.

Do not call a scenario a reconstruction if key dimensions, assignments, or orders were invented.

If a paper does not publish enough detail:

- Use it to justify the problem or evaluation method.
- Create a separate synthetic fixture.
- Label that fixture accurately.
- Do not imply the authors supplied its data.

Fixture metadata:

```ts
type FixtureProvenance = {
  category: "synthetic" | "reconstructed";
  description: string;
  sourceUrls: string[];
  assumptions: string[];
  inventedFields: string[];
};
```

The first working application may use entirely synthetic scenarios. Its claims must remain limited to those scenarios.

---

**10. Canonical data model**

Use integer millimeters for positions and dimensions.

Coordinate convention:

- X and Z are floor axes.
- Y is height.
- The origin is a documented room corner.
- Rack positions represent footprint centers.
- Renderer units are meters.

Starting contracts:

```ts
type PointMm = {
  x: number;
  z: number;
};

type DimensionsMm = {
  width: number;
  depth: number;
  height: number;
};

type YawDeg = 0 | 90 | 180 | 270;

type Rack = {
  id: string;
  positionMm: PointMm;
  dimensionsMm: DimensionsMm;
  yawDeg: YawDeg;
  assetId?: string;
};

type StorageLocation = {
  id: string;
  rackId: string;
  label: string;
  usableDimensionsMm: DimensionsMm;
  storageClass: string;
  pickPointMm: PointMm;
  allowedProductIds?: string[];
};

type Product = {
  id: string;
  label: string;
  storedLoadDimensionsMm: DimensionsMm;
  requiredStorageClass: string;
  allowedLocationIds?: string[];
  lockedLocationId?: string;
};

type Assignment = {
  productId: string;
  locationId: string;
};

type OrderLine = {
  productId: string;
  quantity: number;
};

type OrderTemplate = {
  id: string;
  frequency: number;
  lines: OrderLine[];
};

type CartProfile = {
  widthMm: number;
  lengthMm: number;
  marginMm: number;
};

type Scenario = {
  schemaVersion: string;
  id: string;
  revision: number;
  room: {
    widthMm: number;
    depthMm: number;
  };
  racks: Rack[];
  locations: StorageLocation[];
  products: Product[];
  assignments: Assignment[];
  orders: OrderTemplate[];
  packingPointMm: PointMm;
  cart: CartProfile;
  minimumPassageWidthMm: number;
  gridSizeMm: number;
  provenance: FixtureProvenance;
};
```

Complete the runtime schema before using these structures.

Use safe integer bounds and reject duplicate or broken references.

---

**11. Storage-capacity semantics**

Keep capacity modeling narrow and explicit.

For the MVP:

- Each product represents one stored unit load or dedicated product container.
- The complete configured load must fit in one location.
- A location holds at most one product.
- No stock is split across locations.
- Order quantities influence demand reporting but do not create repeated visits to the same product within one order.
- Inventory sufficiency is assumed.
- Replenishment is not modeled.

Compatibility checks:

1. Required storage class matches.
2. Product is allowed in the location.
3. Location is allowed for the product.
4. The stored-load bounding box fits the usable location dimensions under the permitted orientation rule.
5. Locked assignments remain unchanged.

Use a documented orientation rule. The simplest MVP rule is fixed load orientation.

Do not claim that bounding-box fit proves real-world packability, rack load safety, or handling suitability.

---

**12. Assignment validation**

A complete candidate must satisfy:

- Every product is assigned exactly once.
- Every assigned location exists.
- No location holds multiple products.
- All compatibility constraints pass.
- Locked products remain in their locations.
- The relocation budget is respected.
- Required picking locations are reachable.

Define relocation count:

```text
relocationCount =
  number of products whose final location differs from the baseline
```

A swap changes two products.

An empty location may be used as a destination.

Validate candidates atomically.

If proposals are expressed as changed assignments:

1. Start from the immutable baseline assignment.
2. Replace the listed product assignments.
3. Validate the complete final mapping.
4. Evaluate only that complete mapping.

Each proposal refers to the original run baseline. Do not ambiguously accumulate changes between iterations.

---

**13. Geometry and access model**

Rack geometry is fixed during optimization.

Validate the scene before running any assignment search:

- Rack footprints are within room bounds.
- Disallowed rack overlaps are absent.
- Packing and approach points are valid.
- Navigation settings are valid.

Some empty storage locations may be inaccessible. Such locations must not become valid destinations for products required by the workload unless accessibility is restored through an explicitly supported action.

The MVP does not support changing rack geometry to restore access.

Use a conservative circular representation of the cart:

```text
cartRadiusMm =
  ceil(sqrt((widthMm / 2)^2 + (lengthMm / 2)^2))

navigationRadiusMm =
  max(
    cartRadiusMm + marginMm,
    ceil(minimumPassageWidthMm / 2)
  )
```

Inflate obstacles and restrict the navigable area near room boundaries.

Document conservative approximations.

User-facing methodology label:

> Conservative 2D clearance model.

This is not a safety certification or complete maneuverability assessment.

---

**14. Routing policy**

Use one deterministic routing policy for all assignment methods.

Recommended MVP policy:

1. Start at the packing point.
2. Identify the distinct products required by an order.
3. Resolve their assigned picking locations.
4. Repeatedly visit the nearest remaining picking point using shortest-path distance.
5. Use a fixed ID-based tie-break.
6. Return to the packing point.

This is a nearest-neighbor visit policy with A* shortest paths between endpoints.

It is not a guarantee of the globally shortest tour.

The visit sequence may change when product locations change. The routing policy and tie-break rules must remain identical across methods.

Store the actual sequence in the report.

Navigation:

| Parameter | Decision |
|---|---|
| Grid | Initial 100 mm |
| Neighbors | Four directions |
| Heuristic | Manhattan distance |
| Edge validation | Required |
| Tie-break | Fixed and documented |
| Endpoint handling | Deterministic, bounded, collision-checked |

Do not route to rack centers.

Picking approach points must lie outside obstacles and be reachable under the configured agent model.

---

**15. Measurement definitions**

For each order:

```text
orderDistanceMm =
  distance from packing through all selected picking points
  and back to packing
```

Across the workload:

```text
weightedTravelMm =
  sum(order.frequency × orderDistanceMm)
```

Average per order:

```text
meanOrderDistanceMm =
  weightedTravelMm / sum(order.frequency)
```

If any required product cannot be reached:

- Mark the affected order unreachable.
- Preserve that order in reporting.
- Do not assign zero travel.
- Do not present partial travel as complete workload travel.

Primary metrics:

- Validity.
- Reachable orders.
- Weighted picking travel.
- Mean distance per order.
- Relocation count.

Secondary metrics:

- Candidate evaluations.
- Model calls.
- Run duration.
- Token usage when available.

Do not convert travel reduction into labor, monetary, or throughput improvement without an additional validated model.

---

**16. Objective and candidate selection**

Hard constraints always take precedence.

Among valid candidates, select in this order:

1. Lowest weighted travel.
2. Fewest relocated products.
3. Deterministic assignment tie-break.

Keep the current assignment if it is valid and no better valid candidate is found.

Percentage improvement is available only when:

- Both results are valid.
- The orders are identical.
- The route policy is identical.
- Geometry and cart settings are identical.
- Initial travel is greater than zero.

```text
improvementPercent =
  100 × (baselineTravelMm - candidateTravelMm)
      / baselineTravelMm
```

Otherwise show `N/A`.

A completed search without improvement is a valid application outcome.

---

**17. Non-LLM comparison methods**

Implement a demand-based heuristic.

Suggested method:

1. Compute product demand frequency from orders.
2. Rank products by picking frequency.
3. Rank locations by reachable distance from packing.
4. Assign high-frequency products to nearby compatible locations.
5. Preserve locks.
6. Respect the relocation budget.
7. Evaluate the resulting complete assignment.
8. Optionally perform bounded pair swaps.

Use a maximum candidate-evaluation count.

If greedy assignment produces an incomplete mapping, reject or repair it through a documented bounded method. Do not silently drop products.

Comparison methods:

| Method | Purpose |
|---|---|
| Current assignment | Operational baseline |
| Demand-based heuristic | Simple non-LLM baseline |
| Meta first proposal | Initial model behavior |
| Meta with feedback | Effect of bounded revision |

Report search budgets for each method.

Do not present unequal candidate budgets as equal-compute evaluation.

---

**18. Meta model responsibilities**

Use Meta inference for:

1. Interpreting the planning request.
2. Proposing product reassignments.
3. Revising from measured feedback.

A real runtime request is required.

Using Muse only as a coding assistant does not satisfy this requirement.

The Meta quickstart documents the current base URL, authentication setup, and example model identifiers. Verify the actual account before locking implementation details. [Meta quickstart](https://dev.meta.ai/docs/quickstart)

Initial configuration:

```dotenv
META_API_BASE_URL=https://api.meta.ai/v1
META_MODEL_ID=muse-spark-1.3
MODEL_API_KEY=

MAX_PROPOSALS_PER_RUN=3
MAX_MODEL_REQUESTS_PER_RUN=4
RUN_TIMEOUT_MS=120000
```

The configured model ID must be verified against account access.

Keep the provider integration small and replaceable.

Use the actual supported structured-output or tool-call format. [Meta API overview](https://dev.meta.ai/docs/overview), [protocol guidance](https://dev.meta.ai/docs/protocols)

---

**19. Requirement and proposal contracts**

Requirement interpretation:

```ts
type PlanningRequirements = {
  objective: "minimize_weighted_picking_travel";
  maxRelocatedProducts: number;
  lockedProductIds: string[];
  assumptions: string[];
  unresolvedQuestions: string[];
};
```

Proposal:

```ts
type AssignmentChange = {
  productId: string;
  locationId: string;
};

type AssignmentProposal = {
  scenarioRevision: number;
  changes: AssignmentChange[];
  rationale: string;
};
```

Example:

```json
{
  "scenarioRevision": 4,
  "changes": [
    {
      "productId": "sku-a",
      "locationId": "rack-1-slot-2"
    },
    {
      "productId": "sku-b",
      "locationId": "rack-3-slot-1"
    }
  ],
  "rationale": "Place the frequently requested product closer to packing while preserving storage compatibility."
}
```

Reject:

- Unknown products or locations.
- Duplicate product changes.
- Duplicate final occupancy.
- Locked-product changes.
- Unsupported fields.
- Stale revisions.
- Invalid dimensions or constraint overrides.
- Excessive changes.
- Nonconforming output.

The model proposes assignments. The evaluator determines validity and measurements.

---

**20. Runtime model instruction**

Use a concise instruction adapted to the supported protocol:

```text
You are LayoutLab's warehouse assignment proposal agent.

Propose product-to-location changes for the supplied scenario.

Rules:
- Use only products and locations present in the input.
- Preserve every product in the complete assignment.
- Respect location compatibility and locked assignments.
- Respect the relocation limit.
- Do not change rack geometry, dimensions, order data, or evaluator settings.
- Treat every proposal as changes applied to the original run baseline.
- Return only the required structured proposal.
- Keep the rationale concise.
- Do not invent travel measurements or claim an improvement before evaluation.
- Use evaluator feedback to revise your next proposal.
- An empty change list is allowed when retaining the current assignment
  is the best proposal you can make.
```

Provide:

- Scenario summary.
- Approved constraints.
- Baseline metrics.
- Product demand summaries.
- Previous proposal results.
- Best valid result so far.

Do not expose shell, filesystem, or arbitrary code execution tools to the runtime agent.

Do not request hidden reasoning traces.

---

**21. Feedback loop and execution limits**

Run sequence:

1. Freeze scenario, orders, and constraints.
2. Validate input.
3. Evaluate the current assignment.
4. Run the heuristic.
5. Request a model proposal.
6. Validate the proposal.
7. Evaluate its complete assignment.
8. Return structured feedback.
9. Repeat within budget.
10. Select the best valid candidate.
11. Finalize the report.

Feedback includes:

- Invalid assignments.
- Compatibility violations.
- Locked-product violations.
- Relocation count.
- Unreachable orders.
- Complete travel metrics when available.
- Best valid candidate so far.

Limits:

- Maximum three proposals.
- Maximum four model requests, including interpretation or repair.
- Server-enforced deadline.
- Bounded retry policy.
- User cancellation.
- Bounded concurrency.

Do not force an invalid first proposal for the demo.

---

**22. State and outcome semantics**

Execution states:

```text
IDLE
→ VALIDATING_INPUT
→ EVALUATING_BASELINE
→ RUNNING_HEURISTIC
→ REQUESTING_PROPOSAL
→ VALIDATING_PROPOSAL
→ EVALUATING_PROPOSAL
→ FINALIZING
→ COMPLETED
```

Allow a bounded return from evaluation to proposal generation.

Additional terminal states:

- `FAILED`
- `CANCELLED`
- `TIMED_OUT`

Outcomes:

| Outcome | Meaning |
|---|---|
| `IMPROVED_VALID_ASSIGNMENT` | A better valid assignment was found |
| `VALID_ASSIGNMENT_FOUND` | A valid assignment was found from an invalid baseline |
| `NO_IMPROVEMENT_FOUND` | No better valid result was found |
| `SEARCH_EXHAUSTED` | No valid result was found within the budget |
| `INPUT_INVALID` | The scenario could not be evaluated |

`SEARCH_EXHAUSTED` does not prove that no valid assignment exists.

Scene edits create new revisions. Reject applying a result to an incompatible revision.

---

**23. Interface**

Product language: English.

Primary screen:

| Area | Contents |
|---|---|
| Top bar | Scenario, revision, live/replay mode, reset, export |
| Left panel | Products, assignments, location compatibility, locks |
| Center | 2D/3D warehouse |
| Right panel | Planning request, interpreted requirements, proposal timeline |
| Bottom | Comparison and relocation list |

Primary actions:

- **Evaluate assignment**
- **Generate and test alternatives**
- **Cancel run**
- **Compare results**
- **Apply assignment**
- **Export report**
- **Reset scenario**

Visual features:

- Color products by identity or demand level.
- Highlight source and destination locations.
- Show selected order routes.
- Display location compatibility.
- Display locked products.
- Show before/after assignments.
- Keep a readable 2D view available.

The relocation list must be explicit:

| Product | Current location | Proposed location | Compatibility | Reason |
|---|---|---|---|---|

Do not use color as the sole indicator.

Animation must explain changes without hiding the underlying state.

---

**24. NVIDIA SimReady integration**

Use SimReady assets to represent fixed racks and selected warehouse objects.

The assets must support inspection of the scene. Their inclusion is not evidence that the optimization itself is accurate.

NVIDIA’s documentation explains discovery, profiles, metadata, and version references. Check the selected packages before use. [SimReady documentation](https://docs.omniverse.nvidia.com/simready/latest/simready-central.html)

Pipeline:

1. Select one rack asset.
2. Pin its source revision.
3. Download required dependencies.
4. Inspect units and transformed bounds.
5. Map visual dimensions to the canonical rack footprint.
6. Prepare a browser-compatible representation.
7. Validate scale and orientation.
8. Record conversion and attribution.

Keep evaluator metadata separate from visual mesh data.

Source units must be inspected rather than assumed. [OpenUSD units](https://openusd.org/release/api/group___usd_geom_linear_units__group.html)

Do not claim GLB conversion preserves SimReady physics metadata.

Use proxies during early development if necessary, with a visible development label. Actual integration remains incomplete until a real asset is loaded and documented.

---

**25. Architecture and repository**

Recommended stack:

- TypeScript.
- React + Vite.
- SVG for 2D.
- Three.js, optionally React Three Fiber.
- Small Node/Express API.
- Zod.
- Vitest.
- Playwright.
- Optional pnpm workspace.

Architecture:

```text
Web application
  ├─ Scenario editor
  ├─ Assignment inspector
  ├─ Warehouse viewer
  ├─ Run timeline
  └─ Comparison and export
          │
          ▼
Node API
  ├─ Request validation
  ├─ Bounded orchestration
  ├─ Meta provider
  └─ Report handling
          │
          ▼
Shared deterministic core
  ├─ Compatibility
  ├─ Assignment validation
  ├─ Geometry and navigation
  ├─ Routing policy
  ├─ Objective
  └─ Heuristic
```

Suggested structure:

```text
layoutlab/
  apps/
    web/
    api/
  packages/
    core/
  fixtures/
    sample/
    benchmark/
    test/
  assets/
    manifests/
    licenses/
  docs/
    PRODUCT.md
    EVIDENCE_BASE.md
    METHODOLOGY.md
    ASSET_PROVENANCE.md
    EVALUATION.md
    DEMO.md
    LIMITATIONS.md
  evidence/
    sanitized/
  .env.example
  README.md
```

The core must run without the browser and without a model key.

Avoid external queues, databases, and complex agent frameworks.

---

**26. Reports, privacy, and reproducibility**

Each report must contain:

- Schema version.
- Run ID and timestamp.
- Application/evaluator versions.
- Scenario snapshot.
- Orders.
- Requirements.
- Routing settings.
- Assignment candidates.
- Validation results.
- Route sequences and measurements.
- Model identifier.
- Prompt version.
- Request count.
- Timing and usage when available.
- Fixture provenance.
- Asset references.
- Outcome and limitations.

Reproducibility means:

> The same saved scenario and candidate assignment produce the same deterministic measurements.

It does not mean the model will generate identical proposals again.

Keep the API key server-side. Follow [Vite’s environment-variable boundaries](https://vite.dev/guide/env-and-mode).

Before inference, explain:

> Your scenario details and planning request are sent to Meta Model API to generate alternatives.

Use synthetic data by default.

Bound public access through request-size limits, rate limits, concurrency limits, and model budgets.

---

**27. Testing and evaluation**

Required deterministic tests:

- Duplicate product assignment.
- Duplicate location occupancy.
- Missing product.
- Unknown location.
- Incompatible storage class.
- Load dimensions exceeding location dimensions.
- Locked assignment changed.
- Relocation budget exceeded.
- Rack out of room bounds.
- Known-distance path.
- Unreachable endpoint.
- Deterministic route tie-break.
- Correct weighted order frequency.
- No misleading improvement for invalid baseline.
- Invalid candidate cannot replace a valid best candidate.
- Report reevaluation reproduces measurements.
- Stale result cannot be applied.

Browser acceptance:

1. Load scenario.
2. Evaluate current assignment.
3. Change one assignment manually.
4. Observe updated results.
5. Run optimization with a controlled stub.
6. Compare candidates.
7. Apply a valid result.
8. Export and verify.

Run live Meta smoke tests separately.

Evaluation target:

- Six frozen scenarios.
- Three model runs per scenario.
- Current assignment, heuristic, first proposal, and feedback result.
- Explicit request and candidate budgets.

Report actual sample counts and all failures.

Do not claim model superiority unless the results support it.

---

**28. Milestones and acceptance gates**

| Milestone | Deliverable | Acceptance gate |
|---|---|---|
| M0 | Environment, sources, model smoke test, asset experiment | Actual API access and asset feasibility documented |
| M1 | Schemas, assignment checks, routing, objective | Independently checkable core tests pass |
| M2 | Manual application flow | Load → edit → evaluate → compare → export works |
| M3 | Meta proposal and feedback loop | Real proposals are independently evaluated |
| M4 | Heuristic and real asset integration | Shared evaluator, documented provenance |
| M5 | Benchmark and failure handling | Actual results and reproducible reports |
| M6 | Deployment, demo, documentation | Public behavior matches published claims |

If blocked on credentials, continue independent deterministic work and mark live inference blocked.

If asset conversion is blocked, use labeled proxies and record the unresolved integration.

Do not report the entire project complete while required gates remain unfinished.

---

**29. Demo narrative**

The demo should show a planning decision supported by measurements.

Suggested sequence:

1. Show products dispersed across fixed racks.
2. Show the loaded order workload.
3. Evaluate the current assignment.
4. Enter a relocation limit and locked-product constraint.
5. Generate a proposal.
6. Show compatibility checks and route measurements.
7. Show a revision if one occurs.
8. Compare with the heuristic.
9. Export the report.

Opening:

> Where products are stored affects how far warehouse workers travel to fulfill orders. LayoutLab lets a planner compare assignment changes against the same orders and constraints before making a physical change.

Results:

> On this benchmark, the selected assignment relocated [actual count] products and changed modeled picking travel from [actual value] to [actual value].

Evidence statement:

> The operational problem is grounded in published warehouse cases and research. The results shown here come from our declared benchmark scenario.

Never present benchmark savings as savings already achieved by a warehouse customer.

---

**30. Final execution requirements**

Start by:

1. Inspecting the workspace.
2. Establishing the correct project directory.
3. Reading applicable repository instructions.
4. Creating a short implementation checklist.
5. Completing M0.
6. Building the deterministic core.
7. Completing one application flow.
8. Adding live Meta inference.
9. Adding comparison and evidence.
10. Preparing the demo.

Use native processes. Do not start Docker or install local PostgreSQL.

Make routine reversible implementation decisions independently.

Keep these statuses separate in the final report:

- Implemented.
- Tested with fixtures.
- Tested with live Meta inference.
- Asset integration verified.
- Deployed and verified.
- Blocked.
- Not implemented.

**The project succeeds when it turns a documented warehouse planning problem into a working, measurable decision-support workflow. Every numerical result must come from the evaluator, and every claim must remain within the evidence actually collected.**