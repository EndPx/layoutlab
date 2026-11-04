# Rack quarter-turn foundation review (L3c)

This is an offline simulation/layout foundation, not a public rotation control.
The coordinator's current public proof reference is L3b `132758f`; that proof does
not advertise rotation. UI rotation and initial-agent placement remain subsequent
gates. No web, API, asset, engine, navigation or schema file changed in this slice.

## Representation and convention

`packages/simulation/src/layout/rack-rotation.ts` adds:

- `RackQuarterTurnProposal`: exact keys kind `RACK_QUARTER_TURN`, proposalId,
  parent identity, entityId and relative quarterTurns 1, 2 or 3.
- `ApprovedRackRotation`: separately supplied allowedRackIds, lockedRackIds,
  allowedQuarterTurns, maxRotatedRacks and maxQuarterTurns.
- `applyRackQuarterTurn`, `resolveRackOrientations`,
  `runRackRotationComparison` and `verifyRackRotationComparison`.

Positive turns match Three.js positive Y yaw: `(dx,dz) -> (dz,-dx)` for +90deg.
All calculations use exact integer-mm swaps/sign changes around the current rack
centre. Odd turns swap the canonical scenario rack's world-axis width/depth;
height stays fixed. These existing dimensions are the navigation footprint, so
this bakes the exact axis-aligned rectangle without any new engine/schema fields
or runtime bump. 180deg retains the footprint dimensions but rotates attachments.
Four successive +90deg transforms and +90/+270 inverses restore the exact scenario.
Arbitrary angles, fractional turns, turn 0/4 and extra proposal fields reject.

Every exact rackId-owned storage anchor and approach rotates rigidly. Storage Y,
local usable dimensions, capacities/restrictions, product/item dimensions, stock,
workload, seed, service settings and staffing remain unchanged. Ownership uses a
complete attachment map verified against the current scenario, never proximity.
The canonical template and approved authority are trusted caller context; a
proposal cannot supply its own authority or canonical frame.

## Asset frame and reopening

The returned viewerPlacement contains the owned attachment bundle and an assetFrame:
canonical rack ID, current centre, unique absolute quarterTurns/yawDeg, convention,
intrinsicDimensionsMm and localSlots in the canonical asset frame. Source asset
scaling must use intrinsicDimensionsMm, then apply yaw. **Do not scale a source
rack using the swapped world footprint**. Future rendering must rotate local
container grids and their model orientations with that same asset frame; intrinsic
product and slot sizes stay unchanged. No asset reference, yaw or material is guessed.

`resolveRackOrientations(scenario, canonicalScenario)` tries the four exact rigid
reconstructions for each rack, including dimensions and every full owned slot.
It returns a frame only when exactly one reconstruction matches. It needs no edit
history or external orientation state; the trusted canonical template identifies
the source asset frame. It rejects missing/extra racks, slot reassignment/deformation,
changed local dimensions/Y and ambiguous cases. An empty rectangular rack has
0/180 ambiguity; a square rack with all witnesses at its centre has four-way
ambiguity. Both reject rather than silently choosing yaw. Main fixture slots give
unique orientation for all racks and remain reopenable after rotation/translation.
The existing web translation resolver is intentionally untouched; integrating this
new frame resolver and local product yaw is the next UI gate.

## Authority, validation and comparison

Strict parent content hash/scenario/schema/engine and locks reuse the accepted
production identity checker. Rotation authority additionally checks allowed turn
counts and budgets. A proposal rotates one rack; maxRotatedRacks must allow one.
The turn budget charges the literal positive relative count: +270 costs three,
not a silently optimized -90. Repeated edits bind the immediate previous parent.
Malformed proposals, ambiguous/nonrigid frames or ownership fail before measurement.
Validly structured rejected authority/geometry creates a replayable rejection.

The existing geometryAccessIssuesFor validator checks baked room bounds, physical
overlap and every required approach/resource/parking route under existing mobile
profiles, including unrelated entities. Existing controller admission runs for
both sides. Reports use production runOne, scopeFor and classifyImprovement;
no second simulator/evaluator exists. Invalid baselines have no fabricated baseline
run; repairs are candidate-only with null delta/not-measured classification.

The distinct `layoutlab.rack-rotation-comparison/1` report contains frozen full
baseline/canonical/config/authority/attachments, runtime metadata, derived bundle,
validation, metrics, scope, deltas and classification. Its verifier rejects unknown
schema/runtime versions, reconstructs both scenarios and reruns admitted reports,
then compares the entire envelope. This is reproducibility, not authentication of
an arbitrary supplied canonical template. Station-v2 and rack-translation-v1
contracts/verifiers retain their existing meaning and versions.

## Literal and adversarial evidence

For main R1 centre (4000,6000), original L01 anchor (3000,450,6000) and approach
(3000,8800), literal expectations are:

| Relative yaw | Anchor x,y,z | Approach x,z | World width x depth |
| --- | --- | --- | --- |
| +90 | 4000,450,7000 | 6800,7000 | 2000 x 4000 |
| +180 | 5000,450,6000 | 5000,3200 | 4000 x 2000 |
| +270 | 4000,450,5000 | 1200,5000 | 2000 x 4000 |

Tests cover exact four-turn/inverse restoration, station+translation+rotation
sequencing, source/intrinsic dimensions and stock preservation, scenario-only unique
reopening, empty/symmetric ambiguity, bad footprint/anchor/Y/ownership, self-authority,
stale hash/schema/engine, locks, turn/budget rejection, out-of-room swapped footprint,
named dispatch and unrelated L-OTHER/R1 approach blockers, pre-await snapshots and
full report tampering (anchors, orientation, local volume, stock, totals, frozen seed,
versions and attachment IDs). A separate synthetic larger-room case proves rotation
can repair a blocked baseline without fabricating comparative metrics; no canonical
fixture is changed for that test.

The corridor +90 run actually shipped at 28000 -> 31600ms and is worse under the
existing engine; no geometric shortcut or desired outcome replaces its route timing.
The canonical main +90 run is valid and replay-verifies, classified improved within
its measured window. It is explicitly truncated at the 2-hour ceiling of an 8-hour
horizon, with null full-cohort makespan. See `evidence/sanitized/l3c` for full reports
and replay summaries; these are offline results, not public rotation proof.

## Checks

- `npm run build --workspace @layoutlab/simulation`: pass (existing prebuild also builds core).
- `npx vitest run packages/simulation/src/layout/rack-rotation.test.ts packages/simulation/src/layout/rack.test.ts packages/simulation/src/layout/rack-adversarial.test.ts`: 15/15 pass (7 new rotation cases).
- `node --test packages/simulation/layout-draft/test/layout-production.check.mjs`: 20/20 pass.
- `node scripts/layout-planning-test.mjs`: 20/20 legacy fixture cases pass.
- Exported rotation API replay of corridor and main reports: pass; accepted station/rack reports reverified separately.

No paid calls, new packages, commit, push or deployment were performed.

Coordinator foundation acceptance2026-11-05: independent review-l3c.mjs reexecuted corridor export and matched28000->31600ms. After+90 rack footprint extends toz2500; cart radius799 requiresz3300 bypass, initial travel5600mm rather than2000, other3000/2000mm legs and4/2/10/5s handling/services unchanged. MainR1 literal anchor4000,450,7000 andapproach6800,7000 verified. Baked-world footprint/local intrinsic-frame representation and separateauthority reviewed. Ready for rotationUI after current agent-position UI fileownership release. No publicrotation capability yet. Accepted agent-placement API exports were added in the same index coordination; module itself acceptedc910e64.
