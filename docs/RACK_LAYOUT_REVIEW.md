# Rack layout review (L3a foundation and L3b manual UI)

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

## L3b manual rack translation UI

Manual station/rack selection is implemented in `apps/web/src/components/LayoutEditor.tsx`:
accessible Rack selector (R1–R6), canvas rack selection while editing, integer-mm
X/Z fields with 100mm snapping, original dashed footprint, candidate model/outline,
and Validate -> Test -> Apply / Discard. Editing pauses the current run and revokes
pending assistant preview authority through the existing clearPreview sequence gate.
Preview/testing never replace the current controller; Apply creates a new controller
from the candidate INITIAL scenario. Reset preserves applied geometry; Return to
original restores the original run. Rotation and initial-agent placement remain
required future gates. Muse rack proposals are not enabled.

`apps/web/src/lib/operations.ts` reconstructs every rack's rigid translation from
canonical rack ID and compares the complete exact rackId-owned slot bundle before
normalizing only the declared rack/anchor/approach coordinates for the existing
unrelated-geometry guard. Storage Y, slot dimensions/restrictions/capacity, rack
size and source models cannot drift. Rack geometry, product grid origins, labels
and approach markers derive from the same scene. No invented assets were added.
`OperationsView.tsx` exposes the actual rack instance-matrix translations for
browser assertions. The ghost reuses the existing dashed-original/solid-candidate
rendering with rack dimensions.

`apps/web/src/lib/manual-layout.ts` adapts station-v2 and rack-v1 metrics for display
only. History and downloads retain their original discriminated raw envelopes;
station exports are unchanged. `scripts/verify-layout-comparison.mjs` dispatches
only those two schemas to the accepted verifiers and clearly rejects unknown
schemas. Local browser recomputation and this CLI require no API/model key.

The canonical burst R1 move (4000,6000) -> (4000,5000) produced 6 shipped in both
runs, makespan 502400 -> 501600ms (delta -800ms) and combined waiting
614900 -> 605800ms (delta -9100ms), classified improved by the existing evaluator.
These are fixture observations, not a universal rack-placement claim. Moving R1
onto R2 produces named OVERLAP and blocks Test/Apply.

Helper verification: 11/11 tests across layout, rack-layout, layout-results and
rack-station-replay pass. The latter reexecutes a station-v2 comparison on an
applied rack parent and resolves it through the existing L2 recorded-proposal
resolver with exact matching inputs. Web typecheck and Vite production build pass;
the existing large-bundle warning remains. No root install or API compile ran.

Real Edge evidence is in `evidence/sanitized/l3b`: desktop and 390px preview,
invalid-placement, results and canonical-main screenshots; exact rack reports;
browser assertions and recording. The focused browser test uses the actual engine
and canonical main/burst data, with no fixture replacement or model calls. Existing
U1 workspace, L1 station editor and preview-revocation regressions run alongside it;
mocked delay tests remain explicitly labelled MOCK and are not live-provider proof.


The canonical-main UI export is explicitly truncated: 8-hour configured horizon,
2-hour evaluation ceiling, both runs stopped at the safety ceiling. It reports
last-shipped timing delta -2000ms with unchanged shipped/backlog/wait totals and
null full-cohort makespan. Its improved classification is within this measured
window only, not full-shift completion evidence.

During expanded browser QA, a new actual-matrix assertion caught a diagnostic
attached to floor instances rather than rack instances. The diagnostic was moved
to the rack block without weakening the assertion. `regression-run.json` retains
that historical desktop failure plus 12 passing U1/L1/revocation regressions and
a passing mobile rack case; the separate final rack run is the corrected evidence.
The 35-second WebM clip is a real Edge recording trimmed without reencoding using
Playwright's already-installed FFmpeg; it is not a generated animation.

Final L3b commands and evidence:

- `npx tsc --noEmit -p apps/web/tsconfig.json`: pass.
- `npx vite build` from `apps/web`: pass (existing chunk-size warning).
- `npx vitest run apps/web/src/lib/rack-station-replay.test.ts apps/web/src/lib/layout-results.test.ts apps/web/src/lib/rack-layout.test.ts apps/web/src/lib/layout.test.ts`: 11/11 pass.
- From `apps/web`, `M3C_CHANNEL=msedge M3C_VIDEO=on npx playwright test e2e/manual-rack.spec.ts`: 2/2 pass, desktop and 390px; see `final-rack-run.json`.
- The U1/L1/preview-revocation run: all 12 regression cases pass; see the retained `regression-run.json` and diagnostic correction note above.
- `M3C_CHANNEL=msedge npx playwright test e2e/layout-continuity.spec.ts`: 2/2 pass; advanced-clock/controller continuity in desktop and 390px, see `continuity-run.json`.
- `node scripts/verify-layout-comparison.mjs <export>`: four main/burst desktop/mobile rack exports pass; modified totals and unknown schemas reject. See `keyless-replay.json`. An existing station-v2 export also reverified successfully.

`desktop-*.png` and `mobile-*.png` cover previews, measured results, overlap,
blocked approaches and main-window results. `desktop-walkthrough-35s.webm` is the
short recording; `recording-frame.png` was decoded and visually inspected to
confirm real browser footage. Browser JSON captures shelf locations/quantities,
sequential applied rack centres and absence of POST calls in the rack flow.
No simulation behavior, API, fixtures, engine, navigation, human assets or motion
namespace changed; the owned validator change only removes its trailing EOF blank.
No paid calls, package additions, root install, API compile, commit, push or deploy.

Coordinator L3b acceptance2026-11-05: independent Edge observed actual R1 instanceZ5000, every R1 anchor/approach delta-1000, unchanged Y/quantity/other locations and baseline; export reexecuted successfully. Burst fixture6 orders: makespan502400->501600ms and totalWait614900->605800ms, a fixture-specific modeled improvement. Main8h scenario retains explicit2h truncation. Existing L1 artifact bytes restored; current station regression captures retained separately in l3b/station-regression. Numeric rack editing accepted; rotation/initial-agent placement and model rack proposals remain pending. Public release still requires coordinator native deploy/smoke.
