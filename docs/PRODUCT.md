# LayoutLab deployed planner profile (v2)

This document describes the released storage-planning profile. The user has
explicitly expanded the target to [Implementation Brief v3](IMPLEMENTATION_BRIEF_V3.md);
its operations capabilities, contracts and delivery gates are tracked in
[V3_IMPLEMENTATION_PLAN.md](V3_IMPLEMENTATION_PLAN.md). The exclusions below
describe the old planner profile, not restrictions on the new simulator scope.

**Test warehouse changes before making them.**

LayoutLab helps a warehouse planner or operations analyst compare product-to-location assignments against picking demand and explicit constraints. A Meta-powered agent interprets the request and proposes assignments; an independent deterministic evaluator validates and measures every candidate. The application evaluates plans and does not execute warehouse movements.

The scope authority is [Implementation Brief v2](IMPLEMENTATION_BRIEF_V2.md). Implementation and evidence status are tracked in [MILESTONES.md](MILESTONES.md); quantitative evaluation belongs in [EVALUATION.md](EVALUATION.md), not in unqualified marketing claims.

## Planning workflow

1. Load a scenario with fixed racks, explicit storage locations, products and orders.
2. Inspect the current assignment, demand, compatibility and selected order route.
3. Evaluate the baseline with the shared core.
4. Enter a planning request and review the interpreted structured constraints.
5. Approve resolved requirements, including locks and the relocation budget.
6. Compare the demand heuristic, actual first model attempt and best valid model proposal with feedback. Retain failed attempts in the timeline.
7. Inspect relocations and method-specific budgets. The selected assignment may be the baseline, heuristic or a model proposal.
8. Apply a valid candidate only to the compatible scenario revision and settings.
9. Export the report and reproduce its deterministic measurements without new inference.

The controlled stub is a separate, explicitly labeled testing mode. Stub output is never live Meta inference. Real mode sends scenario details and the planning request to Meta Model API after consent. Contributor-mode data use is disclosed when that model is configured; keys remain on the server.

## Locked MVP decisions

| Area | Contract |
| --- | --- |
| Optimization | Product reassignment on fixed racks; no physical rack relocation |
| Allocation | One dedicated location per product; at most one product per location; no splitting |
| Capacity | The complete configured stored-load box must fit in one location, with fixed orientation |
| Compatibility | Storage-class labels, location/product allowlists, locks and relocation limit |
| Coordinates | Integer millimeters; X/Z floor axes; Y height; rack positions are footprint centers; renderer uses meters |
| Navigation | Conservative 2D clearance model; documented deterministic grid, connector and routing policy |
| Demand | One visit per distinct product per order; integer order frequency weights travel; quantity also reports units |
| Objective | Validity first, then weighted travel, relocation count and deterministic assignment tie-break |
| AI budget | At most three proposals and four model requests per run, including interpretation or repair; server deadline and cancellation |
| Runtime | Native Node processes; browser persistence and JSON exports; no Docker or PostgreSQL |
| Visual assets | Authentic converted NVIDIA rack geometry with documented provenance; visual meshes do not determine evaluator geometry |

## Evidence and exclusions

The [published evidence base](EVIDENCE_BASE.md) supports the problem's relevance. Current fixtures are declared synthetic. Neither a rendered warehouse nor successful inference proves real warehouse savings, safety, customer demand, model superiority or production readiness.

The MVP excludes rack movement, stock splitting, multi-level travel, multiple simultaneous pickers, congestion, forklift dynamics, replenishment, stock depletion, temperature simulation, hazardous-material compliance, WMS integration, floor-plan reconstruction, robot training, billing and user accounts. Storage classes are compatibility labels, not physical or regulatory simulations.

Details of the measurement model and its limits are documented in [METHODOLOGY.md](METHODOLOGY.md) and [LIMITATIONS.md](LIMITATIONS.md).
