# Manual packing-station layout review (L1)

Coordinator ACCEPTED 2026-11-05 after continuity revision and independent review. Application commit267af5a is deployed publicly; deployment evidence commit916318f. Evidence: evidence/sanitized/l1-public/review.json, evidence/sanitized/l1-continuity/coordinator-browser-review.json and sequential replay-check.json. L1 gate is released for L2. No inference or allowance change occurred. This implements manual translation; it does not complete L2/L3.

## Implemented flow

Run baseline -> Edit layout -> select PACK-1/PACK-2 (canvas selection or named selector) -> edit numeric X/Z -> leave field to snap to 100 mm -> Validate -> Test -> compare exact engine metrics -> Apply tested layout or Discard/Undo. Numeric controls support keyboard arrows. Pointer dragging is not implemented; the authorized accessible numeric alternative is used. One station moves per editing session, at most 5000 mm. No rotation, racks or initial-agent placement controls are offered. Muse physical-layout actions remain unavailable pending L2; duration hypotheticals remain separate.

The viewer remains in the workspace. Original footprint is dashed orange; proposed footprint is solid teal and the sourced model follows the transformed canonical bundle. Preview shows INITIAL conditions, with live playback paused and Run disabled. Invalid previews identify validator entity/blocker IDs and block Test/Apply. Editing clears current validation/comparison, while previous tests remain exportable. Reset/scenario changes clear the active editing session; workspace layout history remains previous evidence. Apply creates a fresh controller at initial conditions and retains the original controller reference; no actor is teleported in a live controller. Successive sessions use resolved current attachments and a fresh immutable parent; Reset retains the applied geometry. Return to original run restores the original scenario and retained controller clock/poses without discarding comparison history.

## Geometry and runtime authority

Accepted L0 modules are integrated at packages/simulation/src/layout and exported through the production simulation package. No engine algorithm or workload changes. The isolated L0 source remains intact for historical review, with all 20 regression oracles duplicated unchanged against the production export in layout-production.check.mjs. Browser and offline CLI use the same production verifier.

Main and burst attachment compatibility is independently checked in geometry-oracle.json and layout.test.ts. Literal PACK-1 move (20500,5000)->(20500,4000): service (20500,5900), queues z=5900/7600/9300, obstacle z=3390..4610; baseline service remains z=6900. Renderer receives candidate resources/obstacle geometry and viewerPlacement, while unchanged source asset materials, cargo construction and GLB cache remain intact. Validator rebuilds candidate navigation through the accepted engine navigation API.

Layout comparison supports current implementation 0.1.1 only. Passing recorded 0.1.0 rejects explicitly; recorded contexts are read-only in this editor. Existing U1 versioned playback/recompute still dispatches archived 0.1.0 correctly. Unsupported attachment contexts reject clearly. Exports record exact scenario/config/constraints identities and 0.1.1 reports; verifier rejects unsupported versions, altered candidate offsets and changed fixed service durations. Inputs are never adjusted to improve a layout. Evaluation ceiling is declared as 7200000 ms; full-shift results can be truncated and retain that label. The six-order browser fixture completes: actual comparison classified worse, not an improvement claim.

## Evidence and checks

- Production L0 oracles: node --test packages/simulation/layout-draft/test/layout-production.check.mjs (20 tests, including literal 28000->30000 ms corridor).
- Normal simulation suite: 25 files / 268 tests passed with npx vitest run --maxWorkers=1 --testTimeout=30000. Initial default concurrent run during Edge had three 5-second timeouts; no assertion failures; serial rerun passed without source/test assertion changes.
- Web helpers: 37 tests passed across layout, operations and workspace helpers. Simulation build, web typecheck and actual Vite production bundle passed. Vite reports the existing large bundle warning.
- Actual Microsoft Edge desktop and 390px mobile manual-layout tests passed: baseline, valid move, snap, validation, engine compare, exact export/recompute, invalid overlap, Test/Apply blocking, Undo, fresh Test/Apply, Reset/scenario invalidation and zero horizontal overflow. Both observed zero POST requests.
- evidence/sanitized/l1-manual contains desktop/mobile preview, invalid and comparison screenshots, browser summaries, full engine workflow recordings, exact comparison exports, geometry oracle and replay-review.json.
- replay-review.json verifies archived E3 0.1.0, clean current layout export, and rejection of candidate geometry/fixed-input tampering. E4 recorded public investigation also recomputed successfully using the existing offline script; no inference was executed.

Browser runs use local Vite with no API at port 3001: status/budget GET proxy refusals are expected and paid actions remain unavailable. Layout comparison/recompute are browser-local and exercised the real production engine. This is not an API connectivity or deployed-site acceptance claim. Edge also reports the existing PCFSoftShadowMap fallback warning.

Offline verification: build the simulation workspace, then run node scripts/verify-layout-comparison.mjs evidence/sanitized/l1-manual/desktop-comparison.json. This checks full geometry, fixed inputs, both engine reports and deltas; it does not authenticate authorship.

## Remaining required scope

L2 must connect bounded Muse proposals to the SAME production contract and approved constraints. L3 must add rack movement/rotation and initial-agent positions with attachment/navigation tests. Human R2 assets and lanes are untouched. Pointer dragging remains a UI extension; accessible numeric editing is implemented. Coordinator review and L1 deployment are complete as recorded at the top; broader L2/L3 scope remains outstanding.

Final unchanged-oracle rerun: 20/20 production cases passed; final desktop manual + existing unified workspace regression 2/2 passed. Mobile manual 1/1 passed in the prior combined desktop/mobile run. git diff --check and final web typecheck passed. The latest desktop workflow recording and final-edge-summary.json are included.

## Coordinator revision: continuity and playback guards

Run and Step now guard the explicit layout-editing state, including asynchronous preview construction and preview errors; the existing preview-null check alone was insufficient. Draft Undo leaves the retained controller untouched. Apply captures the first original CurrentContext (scenario, config, implementation and controller), then creates a fresh candidate controller. Return to original run restores that complete retained context. Successive Apply sessions remount their draft editor against current geometry, and Reset only resets that current run, not the applied geometry; workspace history survives both operations.

resolveLayoutAttachments reconstructs each station's rigid translation from its canonical obstacle centre, constructs expected canonical relative service/queue/footprint offsets, and verifies the full attachment map. It then normalizes only those verified station attachments and runs the existing unrelated spatial compatibility guard. buildSceneForScenario uses this path for applied/exported scenarios and resolves ALL model centres, so a second station move preserves the first. No spatial guard was removed. Focused unit coverage checks PACK-1 then PACK-2, scene reopening and rejection of non-rigid queue changes and unrelated rack drift.

Revision evidence is in evidence/sanitized/l1-continuity. The focused Edge regression covers draft Run/Step disabled including an out-of-room preview failure, retained clock and poses after Undo, two sequential station validation/test/export/recompute/Apply sessions with an intervening Reset, and Return to original run preserving history. Final command results are recorded below.

Revision checks: web typecheck and Vite build passed; layout/operations/workspace helpers passed 38/38. Actual Edge continuity passed desktop 1/1 and mobile 1/1; both test sessions exported/recomputed each step and restored the exact retained original clock/poses. PACK-2 exports contain PACK-1 obstacle z=3390..4610 and PACK-2 z=11390..12610, proving both moved placements persist. Offline sequential replay passed and tampered PACK-1 queue in the second export rejected. No simulation/API/archive/asset changes were needed in this revision, and the coordinator-owned Vite process was reused without stopping it. No paid inference, commit, push or deployment occurred.

Final desktop Edge run on the final playback-label/guard bytes passed continuity + existing U1 regression 2/2; final-edge-summary.json and refreshed desktop-continuity.webm are included. git diff --check passed.
