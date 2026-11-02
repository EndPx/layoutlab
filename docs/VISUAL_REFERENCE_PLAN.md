# Reference interface implementation contract

Scope: apply the user-supplied LayoutLab screenshot to the existing working application. The visual reference is stored privately at `.coordination/layoutlab-reference.png`; it is not a product background or a source of numerical results. Implementation Brief v2 remains the product scope. Preserve evaluator/API behavior and all acceptance gates.

## Composition

- A slim white navigation bar: LayoutLab identity, warehouse/scenario breadcrumb, actual sample/provenance badge, scenario/import/reset controls, export action.
- Headline and short planning-purpose subtitle, with the actual selected-candidate status.
- Four metric cards: modeled picking travel, reachable orders, relocated products against the approved limit, assignment validity. Large values, smaller labels and explanatory captions, compact teal/green SVG icons in pale circular fields.
- Three-column desktop workspace: approximately 22.5% products/relocations, 50.5% warehouse, 25.5% planning/history, with narrow gutters and crisp light borders. Use the reference's 1586-pixel view as the primary desktop comparison and preserve usability at 1440, 768 and 390 pixels.
- Left: searchable actual products/assignments, demand badges, locks/changes, selected-candidate relocation list, Evaluate assignment action.
- Center: a dominant warehouse viewport with real 2D/3D and Current/Candidate controls, actual selected-order selector, route/previous-route legend and visibility controls, zoom/reset controls. Labels and paths remain anchored to canonical coordinates.
- Right: goal input, real structured requirements/approval, relocation stepper, constraint tags, bounded Generate/Cancel actions, actual proposal history. Put provider/setup/diagnostic details in a collapsible Developer settings region.
- Full-width bottom comparison and Apply selected assignment action. Preserve exact first-attempt versus best-valid-model attribution and show the selected method separately.

Use a compact sans-serif close to the reference, navy text, teal actions, white surfaces, pale blue-gray borders, restrained green validation and amber sample indicators. Extract actual tokens into DESIGN.md before components. Do not substitute a generic landing-page aesthetic or introduce a framework migration.

## Data and behavior contracts

- Every card uses the actual evaluated assignment selected for presentation, with a clear current/run-baseline frame. Weighted travel converts integer millimeters to meters for display; no image values are constants. Percentage is the existing core comparison result, only when comparable/valid.
- Reachable order counts must distinguish templates from frequency-weighted orders. The sample currently has three templates, not the illustrative twelve. N/A/incomplete states remain explicit.
- Relocations and approval limits come from the relevant frozen run requirements. Changed current requirements or revisions make historical candidates visibly stale and cannot enable apply.
- Product locations, demand and changed/locked badges use actual canonical data. In Candidate view show candidate destinations; manual edits remain available for Current view. View/camera controls do not mutate scenario geometry or revision.
- Numbered proposal history includes at most three generated attempts. The heuristic is a separate method, not a fourth model proposal. Failed/empty attempts remain visible with actual diagnostics.
- Sample/stub/fixture status is explicit. A configured key alone is not live inference. A live-used status requires configured official Meta mode and actual realMetaRequests greater than zero; replay is recorded evidence, not a new live call.
- Keep successful and failed report export/replay, cancellation, first-request cancellation, stale-state guards, persistence and reset behavior. Never replace them with demonstration state.
- Comparison labels use current, heuristic, actual first attempt, best valid model proposal with feedback and its iteration. In controlled sample mode label generated results as sample/stub, never Meta. Retaining baseline or a heuristic win is not model improvement.

## Warehouse truthfulness

Use the existing integrated NVIDIA GLB, canonical room/rack dimensions, footprint centers/yaw and millimeter-to-meter mapping. Use canonical picking points and packing point for labels/markers; no invented stored poses or physical obstacles from the reference photograph.

Use the existing evaluator-generated collision-checked polylines for current/candidate routes. A dashed orange current route and solid teal candidate route may be overlaid when both exist. If routes coincide or a route is unavailable, report the actual condition. Do not invent a separation or draw a straight shortcut through racks. Keep the Conservative 2D clearance model label and asset/proxy boundaries visible without exposing function names.

Improve actual scene composition, lighting, readable rack/location/packing labels and camera controls. No screenshot-as-viewport, fake warehouse image or hardcoded illustrative boxes/paths/results.

## Verification

- Update DESIGN.md and reuse documented primitives. Retain core/API tests and meaningful browser gates; adapt selectors to the changed real interface without removing assertions or hiding test-only UI.
- Verify empty, current, valid candidate, invalid/unreachable, stale, sample, fixture, configured-unused and live-used states using actual fixture/API state. No paid inference for this visual work.
- At 1586x1007 and 1440 desktop compare hierarchy/proportions/type/spacing with the reference. At 768/390 verify reflow and keyboard operation, no page overflow, accessible labels/focus/contrast, reduced motion.
- Verify metrics against actual evaluator outputs before and after manual edit/generation; check route/label coordinates and loaded GLB bounds/hash. Capture screenshots from real browser execution.
- Report measured performance/a11y findings and actual tool availability honestly. Do not claim a visual score or Lighthouse 100 without measurements, and do not hide product content or replace authentic assets to improve a score.
- No additional model/asset services requiring payment, no public deployment, no global agent-harness changes. Codex reviews/commits/pushes; Muse owns implementation.
