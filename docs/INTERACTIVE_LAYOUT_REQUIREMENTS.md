# Interactive layout planning — approved scope change

Latest user direction supersedes the original fixed-rack scope for the NEW
main workspace. Historical v2 assignment evaluator/results retain their old
scope and provenance. Do not rewrite history or claim the current deployed
service-duration experimenter already supports physical layout changes.

## Product and operational story

Use one distributor/e-commerce warehouse. Inbound: supplier delivery ->
receiving staging -> configured inspection/acceptance service (assume goods
conform; no complex QA model) -> putaway -> rack stock. Outbound: customer
order information -> reserve stock -> picker travels/picks -> packing queue
and service -> dispatch staging/service -> shipped leaves warehouse.
Customers do not appear as walking agents. Stages run concurrently. Stock
is conserved through staged, stored, reserved, carried, packed and dispatched
buckets. Packing complete is not shipped. Legitimate shortages/queues remain.

## Primary interaction and first vertical slice

Run baseline -> Edit layout -> Validate -> Test layout -> Compare outcomes.
Users move/rotate racks, reposition stations, and configure initial agent
starting/parking positions in the SAME workspace. Move/rotate controls,
grid snapping, undo, clear selection and invalid-placement explanations are
required. Edits create a DRAFT candidate, not mutations to a live run.
Agent repositioning never teleports actors during active simulation.

Priority1: move one PACKING STATION manually, validate and simulate it, then
Muse can propose/test a packing-station move with the SAME constraints and
validator. Follow with one rack including attached slots/approaches and
rotation, then supported combinations/entities. Do not silently reduce the
accepted full scope to the first slice. Rotation support and limits must be
explicit; never accept visually rotated objects with stale navigation.

Canonical transformations update attached storage anchors, product display,
picking approaches, station service/queue positions, station obstacles and
visual transforms, navigation and starting positions. Use explicit attachment
ownership, not proximity guesses. Rendering and engine consume the same
validated candidate geometry; maintain IDs/units/source geometry semantics.

Baseline scenario/results stay immutable. Compare candidates using IDENTICAL
orders/deliveries/frequencies where applicable, initial stock/assignments,
service assumptions, worker counts/profiles, seed and evaluation policy.
Other variables change only by explicit user choice, with the changed-variable
set disclosed. Version/hash every context and invalidate stale comparisons.

## Muse workflow

Interpret natural-language goals and editable-object constraints -> user
reviews/edits and approves structured constraints -> read canonical geometry,
allowed areas/access/workload/resources and actual baseline -> propose
concrete object transforms -> preview old ghost vs proposed placement ->
validate -> simulate -> feedback/revise within existing bounded request and
proposal limits -> explain measured trade-offs citing run IDs. No movement
before user applies a candidate. Renderer coordinates never inferred from
screenshots. Engine owns per-worker motion/collision, not Muse.

Example: at most2 racks and1 packing station may move, receiving locked,
worker count and service durations unchanged. Enforce all constraints in
validator; free text/model confidence cannot authorize extra changes.
Keep invalid, worse and no-improvement proposals. Do not claim Muse beats a
heuristic without equal-budget tests. Existing service-duration hypotheticals
stay clearly separate from physical layout decisions.

## Gates

L0: pure typed packing-station edit/attachment contract, validator, reproducible
baseline/candidate comparison and hand-oracles. U1: one canonical workspace.
L1: manual packing-station editor end-to-end (selection/preview/snap/undo/
validation/test/compare) on U1. L2: bounded Muse uses that SAME contract with
reviewed constraints. L3: rack move/rotation and other supported entities,
including initial-agent placement, with equal geometric/navigation checks.
No layout capability is advertised before its gate passes. R1 render/cargo,
R2 humans/kinematics and R3 liveness fixes remain required parallel/dependent
work, not replaced by this new scope.
