# Unified warehouse workspace — approved user direction

The Operations warehouse is the main LayoutLab experience. Remove Storage
Planning / Operations / Experiments as three primary workflows. The main
workspace has ONE active canonical operations scenario, including geometry,
product/location IDs, stock, workload, seed, handling config and revision
identity. The warehouse stays visible while running, inspecting, asking,
testing and comparing. Existing engine/report correctness is preserved.

## Layout and first interaction

Compact header: LayoutLab, scenario selector, Sample data label, Settings.
Small understandable metric row; dominant3D viewer about70–75% of the work
area; contextual right panel about25–30%; persistent Run warehouse/Pause/
Reset and1x/4x/16x controls; comparison summary appears only with results.
Start PAUSED. Intro: Run this warehouse, explore what slows it down, and test
changes. Prompt: Run the sample warehouse, then click a worker or station to
explore what happens. Keep top view and clear baseline/candidate labels.

Right panel has two mutually exclusive jobs: selected-object inspector OR
warehouse assistant. Click agent for actual task/cargo/wait reason, rack/slot
for products/stock, packing station for active work/queue. Empty space/Clear
selection/Back to assistant returns to assistant. No three long panels at once.
Use real entity IDs and engine-known explanations, never invented bottlenecks.

## Scenario and evidence contract

Use the Operations scene/data as authority. Legacy warehouse-basic/sku-a
planner cannot silently feed main-warehouse/P01 operations. Keep legacy
planner available only as clearly separate advanced/compatibility access if
needed; no primary tab and no cross-scenario result transfer. Assignment and
traffic optimization are not advertised until actually connected and verified.
The active scenario feeds viewer, baseline, assistant request, results and
exports. A scenario change creates a new context; old results are labeled
stale/previous and never displayed as current measurements. Imported/recorded
reports with other inputs need explicit loading of their associated scenario
or a separate clearly labeled inspection; never overlay an unrelated warehouse.

Only supported experiments are offered. Service-duration changes mean
hypothetical assumptions (what if this stage takes less time), not AI-discovered
physical interventions. Permissions are explicit. Keep Sample data, Recorded
AI example, assumptions, unavailable capabilities and incomplete results clear.

## Plain language

- Makespan: Time to finish all orders (only for a complete shipped cohort).
- valid-complete: Completed (qualify supported-stage-only completion if not shipped).
- exp-2: Option2, with a human description from its actual changed fields.
- dispatchDurationMs30000: Assume dispatch takes30seconds per order.
- Hypotheses & action trace: What LayoutLab tested.
- Recompute (server verifier): Verify these results.
- Free text grants nothing: Choose which changes LayoutLab may test.
- Schemas, versions, raw patches, request metadata, provider settings/budgets,
  imports and renderer diagnostics: appropriate Settings/Technical details/
  report drawer. Decisions and necessary spend consent stay visible at action.
Elapsed engine time, completion time and combined waiting time stay distinct.
Missing metrics are unavailable with explanation, never invented zero values.

## Acceptance

Open sample -> understand what to do -> run -> inspect an agent -> test a
supported change -> understand results, all with the same warehouse visible.
Test Run/Pause/Reset/speed, direct3D selection, clear selection, scenario
changes, stale results, recorded replay, candidate-vs-current inspection,
actual displayed/exported metric equality and offline verification. No hidden
paid request on load, playback, selection, reset, scenario change or replay.
Retain the user-approved anonymous site/replay and judge-only new inference.

This supersedes the three-tab primary UI, not the renderer/physics/asset
requirements. R1 renderer and R2 human work continue; the workspace redesign
must integrate them without duplicating canvases/controllers or editing their
files concurrently. Codex coordinates acceptance and ownership.

## Direct physical layout editing (latest approved scope)

Read INTERACTIVE_LAYOUT_REQUIREMENTS.md in addition to this workspace
contract. User explicitly changed the original fixed-rack boundary: direct
layout editing is PRIMARY. The first complete slice is moving a packing
station manually and then through Muse, using identical constraints and
validator. Add rack movement/rotation and initial-agent positioning next.
The one workspace must accommodate Run baseline -> Edit layout -> Validate
-> Test layout -> Compare, with immutable baseline and matched exogenous
inputs. Existing duration-only experiments must not be relabeled as layout
optimization. U1 builds the canonical workspace; L0/L1/L2 tasks provide the
actual layout contract/editor/Muse capabilities. Never ship fake controls.
