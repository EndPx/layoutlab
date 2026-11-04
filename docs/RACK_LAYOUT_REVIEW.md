# Rack translation foundation review (L3a)

Implemented in `packages/simulation/src/layout/rack.ts`, narrowly exported by
`layout/index.ts`. This is an offline foundation; no viewer controls or renderer
integration is included. Rotation and initial-agent placement remain required
future milestones. No orientation field or arbitrary-object transform is accepted.

## Contract

`RackTranslationProposal` has literal kind `RACK_TRANSLATION`, with the same
parent identity and target shape as station translations. `buildRackAttachmentMap`
uses exact location.rackId ownership. `applyRackTranslation` verifies the entire
rack and owned-slot declaration against the canonical parsed parent. It returns
canonical scenario, transform, changed fields and viewerPlacement (rack plus all
owned slots); it never guesses an asset. Coordinates are canonical integer mm.
Only rack position and attached anchor/approach X/Z translate; storage Y, slot
volume, IDs, capacities, inventory, workload and operating assumptions remain.
Rebuild the map from each new parent for sequential edits.

`runRackLayoutComparison` requires approved constraints, execution config and a
positive integer safety ceiling. It reuses strict station target parsing, approved
constraints, hash/version/lock checks and movement budgets. Existing navigation
checks inspect every approach, resource and parking position for all eligible
profiles, and engine admission runs before execution. Rack footprints additionally
receive explicit room bounds checks. Named blockers are emitted only where
geometry proves them. Baseline-invalid/candidate-valid exports say
candidate-only-repaired and contain no fabricated baseline run.

The separate `layoutlab.rack-comparison/1` envelope freezes full parent scenario,
execution config, approved constraints, ownership declarations and termination
ceiling. `verifyRackLayoutComparison` reconstructs and reruns both eligible runs
and compares the full envelope. This is reproducibility checking, not a signature
or independent authentication of a claimed original scenario.

Existing `parseLayoutProposal`, station v2 exports and station comparison verifier
retain their old supported-kind contract. Use the explicit rack APIs for this
slice; the station parser still rejects rack transforms. Malformed/stale ownership
throws before comparison, rather than generating a portable rejection report.

## Verification evidence

- `npm run build --workspace @layoutlab/simulation`: passed (existing prebuild also builds core).
- `npx vitest run packages/simulation/src/layout/rack.test.ts packages/simulation/src/layout/rack-adversarial.test.ts`: passed, 8 tests with realistic 60-second case timeouts.
- `node --test packages/simulation/layout-draft/test/layout-production.check.mjs`: passed, 20/20 cases.
- `node scripts/layout-planning-test.mjs`: passed, 20/20 legacy compatibility cases.

Rack test literals: R1 centre (3000,1500) -> (4000,1500); L-A1 anchor
(3000,450,1500) -> (4000,450,1500); approach (3000,3000) -> (4000,3000).
No-op and inverse restore exact scenarios. Quantity and original input remain
unchanged. A 5000-mm east move overlaps OB-PACK1 and is rejected by name.
Sequential station then rack application preserves station geometry/resources.
JSON export reexecution passes; anchor Y, approach, rackId, unrelated obstacle and
stock quantity tampering fails. The independent rack corridor oracle moves R1 dz+1000: approach becomes
(3000,4000), parking->pick 2->3s, pick->queue 3->4s, queue->service 2s;
pick 4s, unload 2s, packing 10s and dispatch 5s remain fixed. Shipment is
28000->30000ms. The coordinator-owned `.coordination/review-l3a-oracle.mjs`
was preserved and rerun successfully with matching JSON evidence.

Adversarial tests additionally cover stale hash/schema/engine, lock/allow-list,
zero budget no-op, movement/snap budgets, rack footprint and storage anchor room
bounds, missing/extra/aliased/deformed ownership, named packing/dispatch/other-slot/
parking blockers, multiple sequential rack parents and stale intermediate parents,
and invalid-baseline repaired versus persisting errors. Input maps and their values
are snapshotted before the first await; returned transforms do not alias caller
attachments. Mutation-after-call and mutation-after-return regressions pass.
Reports include explicit runtime versions, reject unsupported versions before
replay, and use the existing production runOne/scopeFor/classifyImprovement helpers
for metrics, scope, deltas and classification. Totals, frozen seed/config, geometry,
schema and runtime metadata tampering are rejected by complete reexecution. No API compile, web build, model calls, package additions,
commit, push or deployment was performed.

Coordinator acceptance2026-11-05 (L3a foundation only): source snapshot/ownership/version checks reviewed; independent corridor oracle reexecuted with expected and actual28000->30000ms. Production metrics/scope/classification helpers reused; station compatibility evidence retained. Accepted for manual rack UI integration. Rotation and initial-agent placement remain required later gates; malformed ownership throws before measurement as documented. No public rack-control capability implied yet.
