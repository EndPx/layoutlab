# Evidence and modeling limits

LayoutLab measures declared scenarios, orders and assignments under a deterministic model. A modeled travel reduction is not a measured customer saving and is not converted into labor, money, productivity or throughput without additional operational validation.

## Physical model

- Rack geometry is fixed during optimization. Results are complete end-state assignments; a physical relocation sequence, temporary staging and handling work are not simulated.
- The circular cart approximation, obstacle inflation, room clearances and 100 mm four-neighbor grid are conservative. A narrow passage can be rejected even when a more detailed maneuverability model could traverse it.
- Nearest-neighbor visit order with A* legs is deterministic and does not guarantee a globally shortest picking tour. Endpoint connectors follow the documented bounded collision-checked rule.
- X/Z are floor axes. Rack height supports fit checks and visualization, but travel does not model vertical levels, lifting, congestion, multiple pickers or vehicle dynamics.
- Each product represents one complete dedicated unit load/container. Fixed-orientation bounding-box fit does not establish real packability, rack load safety or handling suitability.
- Inventory sufficiency is assumed. Quantities report demand units but do not create repeated visits, deplete stock or trigger replenishment.
- Storage classes such as `ambient` and `cold` are compatibility labels. Temperature, hazardous-material rules and regulatory compliance are outside the model.

The user-facing method is a **Conservative 2D clearance model**. It is not a safety certification.

## Search and model behavior

- The heuristic and model have separate declared budgets. Their comparison is not an equal-compute evaluation or a claim of global optimality.
- A bounded search can return no improvement or exhaust its budget. `SEARCH_EXHAUSTED` does not prove no valid assignment exists.
- Invalid assignments, unreachable orders and computation exhaustion remain explicit. Partial distance must not be presented as complete workload travel, and an invalid baseline has no percentage improvement.
- Meta proposals are not authoritative measurements. Unknown references, duplicate occupancy, incompatibility, locks, relocation limits and stale revisions are checked independently.
- Model generation need not repeat exactly. Reproducibility means the same saved inputs and candidate assignments reproduce evaluator measurements without inference.
- Historical M3 live smoke observations, including failures and partial usage, remain documented in [LIVE_SMOKE.md](LIVE_SMOKE.md). They must not be silently merged with a later frozen benchmark protocol. Current sample counts and comparison results belong in [EVALUATION.md](EVALUATION.md).

## Assets and runtime

The browser rack geometry is derived from a revision-pinned NVIDIA SimReady asset. Conversion uses a simplified neutral material and discards original MDL/texture/physics features; it does not preserve SimReady physics metadata. Canonical rack dimensions and the evaluator remain independent of the visual mesh. See [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md).

Browser state and exported JSON are the persistence mechanisms. Native server run state is bounded and process-local; a server restart is not durable run storage. Reports should be exported when evidence must be retained. No database, external queue, account system or production service guarantee is provided by this MVP.

Local build/test success, a development server, actual model access, authentic asset loading and public deployment are separate evidence categories. Current deployment and authorization status are recorded in [MILESTONES.md](MILESTONES.md); local execution alone does not establish a deployed public service.
