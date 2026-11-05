# Direct editor review

Implemented and locally exercised in the integrated main Workspace. Public release and real provider acceptance belong to ROOT; this work made no Gater request, shared dist build, commit, push or deployment.

## Interaction contract

`lib/direct-editor.ts` is a typed prop bridge, with no global authority. Workspace owns its bridge state and passes its active-run/replay/assistant/busy guards. LayoutEditor owns candidate coordinates, quarter-turns, history and production proposal/apply/validate/compare calls; OperationsView only sends gestures. Each committed drag records one start snapshot; Escape, pointer cancellation, lost capture, selection/context changes and disabled/unmounted rendering cancel the gesture. Numeric fields share candidate pose state and production preview. Undo retains the original scenario and previous comparison evidence.

Dragging raycasts the nearest canonical selectable entity and intersects the ground plane, then snaps deltas to 100 mm. Orbit and click selection are suppressed for captured gestures. The immediate footprint is derived from production rack dimensions or the production attachment ghost. Production candidate scene publication waits until commit so pointer moves cannot rebuild the renderer mid-gesture. The existing GLB cache, human/cart/cargo paths and archived replay remain in place.

Automatic checks debounce 250 ms after committed or numeric changes, use existing production validators/comparisons, and reject stale revisions. Pending feedback never claims validity; invalid feedback names actual validator entity/code/related blocker, and the proposed footprint becomes red. Rack controls use only the existing supported quarter-turn proposal and retain its existing separate-translation/rotation gate. Test and explicit Apply remain required before an authoritative layout change.

## Local acceptance evidence

All browser checks used the installed `msedge` channel in headless desktop rendering, local Vite source port 5182, no paid inference. These are local production-engine checks, not public deployment evidence.

| Check | Evidence |
| --- | --- |
| Desktop PACK-1 drag 20500/5000 to 20500/3600; Undo; Validate/Test/Apply | edge-station-tested.png, numeric-station.json, drag-station.json |
| Numeric and drag export equivalence | export-equivalence.json: entire parsed production reports equal |
| Desktop R1 drag, gesture Escape restore, one Undo, supported +90 turn | edge-check.json and completed desktop video |
| Actual overlap blocker | overlap-feedback.json: R1 OVERLAP R2, physical rect interior overlap |
| Outside-placement rejection and disabled Apply | edge-invalid-rack.png, mobile-390/edge-invalid-rack.png |
| 390px rack drag/Undo/rotation and no overflow | mobile-390/edge-check.json |
| 390px PACK-1 drag and Undo; scenario change clears editor/validation | mobile-390/station-and-scenario-cancel.json, station-drag.png |
| Original controller restored after Apply/Return | return-original.json: original and restored clock both 15600 ms; edge-390-return.png |

Source verification: web TypeScript no-emit passed; direct-editor and rack-layout tests passed (5 tests); the earlier expanded run including rack-station-replay passed (6 tests, 3 files). Source tests cover snapping including negative deltas, immutable gesture starts, one history entry, cancellation preserving earlier history, no-op gestures and repeated cancellation; the rack/replay regressions exercise production attachments and exact replay.

## Evidence limits and retained attempts

Desktop and 390px checks are multiple bounded sessions, not one uninterrupted acceptance recording. Successful recordings include desktop `video/page@0c22d3e613043b621814479ba5c92b4f.webm` and mobile station/scenario `mobile-390/video/page@39175274a000562574af83795898dce5.webm`; other recordings include failed attempts and may be incomplete. Early test attempts missed small model geometry or used an incorrectly encoded degree symbol in the test locator; another was interrupted by concurrent Workspace HMR. These attempts were not treated as successful evidence; subsequent checks targeted visible canonical models after scrolling the canvas into view. Mouse-pointer interaction was tested at 390px, not physical touchscreen hardware. Pointer suppression and disable/unmount handling are implemented; exhaustive hardware orbit-device coverage is outside these checks. The public combined release and VPS inference gate remain ROOT responsibilities.

## Action-switch review correction

Translation and rotation remain separate production proposals. A pending rack translation disables all rotation controls and shows "Translation pending. Apply or Undo before rotating this rack." A pending rotation disables dragging, numeric translation and the Translate mode button and shows "Rotation pending. Apply or Undo before moving this rack." The same pure guard runs inside callbacks as well as controls, so stale callbacks cannot discard the other action. Undo restores the prior pose and unlocks the other action; Apply followed by a new edit supports sequential translation/rotation without combining unsupported proposals.

Rotation controls are keyboard-accessible inspector buttons and a viewport button. There is no rack-mounted Three.js rotation handle, and no arbitrary/free yaw. This review patch deliberately keeps that claim precise rather than introducing another picking surface.

Five direct-editor source tests passed, including both blocked action directions and Undo unlocking. The targeted Edge check is recorded separately in `action-guard-check.json`, with `action-guard-rotation.png` and executable `acceptance-action-guard.mjs`; earlier successful captures remain unchanged. No provider call, build, commit, push or release was needed for this correction.


Public frontend milestone29e54d1 is deployed. Root verified visible draft-only examples with no automatic POST, production PACK-1 drag/Undo/Validate/Test/Apply and exact original clock restoration on public site. Source/helper regressions19passed and server export-tree/webbuild/health checks passed. Two separate explicit live AI attempts returned upstream429CONCURRENT_LIMIT (no successful freshmodel response); both faithful failed reports verified and pages had zeroJSerrors. Existing earlier realAIproof remains historical. Evidence: evidence/sanitized/quality-wave1-public/ and quality-wave1-public-retry/. Rotation uses buttons, not a rack-mountedgizmo; model-language and broaderaction integration remain open.
