# Workspace P1 review — local review candidate

## Delivered

Existing design tokens and dependencies retained. Four actual-state metrics use a compact strip (two columns at 390px). Introduction appears once. Playback remains sticky; the desktop contextual panel scrolls independently with a 680px bound, while tablet/mobile use document scrolling. A concise guide explains that Run baseline measures a separate headless run; Run sample warehouse advances playback.

The free recorded AI example is outside the AI experiment selector and remains accessible for either experiment type. Service assumptions, consent and live controls use an explicit native disclosure. Opening the example does not create inference. Historical Meta, imported reports and local fixtures retain their source labels. Native Gater logic is untouched.

## Evidence and checks

- `M3C_CHANNEL=msedge npx --prefix apps/web playwright test --config apps/web/playwright.config.ts workspace-p1 --reporter=list`: **2 passed**, desktop and 390px mobile, 1.9 minutes, installed Edge.
- Flow covers playback/pause, inspector, manual baseline, packing move, snap/validate/test, exact recomputation/export, invalid overlap rejection, undo, apply/reset and scenario reset, recorded example loading, and zero POST requests.
- `npm run typecheck --workspace apps/web`: passed after final copy changes.
- Direct Vite production build passed; existing large-bundle warning remains. Shared sources were not rebuilt.
- `node scripts/verify-operations-investigation.mjs apps/web/public/evidence/e4a-live-investigation-f24a6a1.json`: PASS, embedded engine replay, historical Meta metadata with 3 requests and 2 experiments; does not authenticate inference provenance.
- `evidence/sanitized/workspace-p1/desktop-final.png` is 1920px; `mobile-final.png` is 390px, captured after all eight sourced assets loaded. Measured document width equals viewport width on both; viewer heights are 520px and 300px respectively.
- Additional entry/preview/comparison/invalid/recorded screenshots and exact comparison exports are in the same evidence folder. Entry captures are an intermediate iteration, not a pre-P1 baseline; no original pre-change screenshot was recovered.

## Review findings and remaining integration

Readable manual and free recorded paths are available without credentials. Validation and Apply gates remain intact. Desktop content has an explicit scroll owner; mobile action labels wrap and remain reachable. The scene is still pale and dense: renderer source/status diagnostics remain owned by OperationsView and should move to its expandable technical disclosure during P2. No OperationsView edits were made by this worker.

P1 does not close the overall product-quality milestone. P2 rendering, human motion/contact/clearance and editing gizmo limits remain separate. Full layout-result presentation still uses existing raw millisecond table headers; improving that without altering exact exports is remaining UI debt. API-backed service Verify was not exercised because no API server was running; offline exact historical replay passed. Screenshots show local working sources including concurrent renderer changes, and are not a deployed release claim. No commit, push, deployment, dependency installation, paid inference or key reads occurred.

## Coordinator review follow-up

Replaced the technical baseline guidance with plain purpose copy. Recorded/imported results now expose a nearby accessible comparison link regardless of experiment mode. Investigation progress is outside the service-settings disclosure so closing settings cannot hide it. LayoutResults labels now name units (orders and milliseconds), and each candidate has an exact change-from-baseline row with layout validity; missing measurements remain unavailable and invalid/worse/truncated evidence is retained.

New paired screenshots: `desktop-before-review.png` / `desktop-after-review.png` and `mobile-before-review.png` / `mobile-after-review.png`. These compare the predecessor P1 iteration with this review refinement, not the original public app; concurrent P2 rendering is visible and must not be attributed to P1. Final settled widths are exactly 1920 and 390 with no document overflow.

Added a real local API no-key fixture test for keyboard activation, result cue navigation and Verify; it asserts exactly one verification POST and zero transport/provider calls. Desktop passed; final mobile result is recorded below. Typecheck and Vite build passed after the final source changes. No API/core/shared-source rebuild or dependency installation occurred.

Ownership boundary was reported to coordinator: the visible source line is emitted inside OperationsView (P2-owned), while raw manual comparison identities and labels reside inside LayoutEditor (outside assigned P1 files). Workspace-owned renderer stats remain in existing Technical details. No hiding of provenance or edits to those disjoint files were used to bypass ownership.

Final follow-up result: **4 Edge tests passed (1.9 minutes)** across desktop and mobile. Both real local API Verify checks passed, superseding the earlier unexercised-API limitation. Each observed exactly one `/investigations/verify` POST and zero provider calls; keyboard activation and comparison navigation passed. `desktop-verified.json` and `mobile-verified.json` contain request evidence. Full-page verified screenshots were captured after result navigation, so the sticky playback bar is shown in its scrolled position; settled entry before/after screenshots are the layout comparison reference.

## Final P1 result-presentation freeze

LayoutEditor presentation ownership was explicitly extended for this pass. Human measure labels and consistent minute/second durations now replace raw keys and primary millisecond numbers in both LayoutEditor and LayoutResults. Signed changes use proposed minus original; count measures remain counts. Exact milliseconds remain in cell titles, expandable Technical details and unchanged exported reports. Input hashes/schema IDs and raw engine explanations moved to disclosure; previous-result identities also use disclosure. Changed entity, layout validity, evaluation scope and the explicit Apply choice remain visible. Mixed and worse outcomes have plain measured-criterion explanations; truncated output explicitly disclaims a full-run improvement. Missing/non-finite values stay unavailable.

No changes were made to controller state, transform construction, report adapters, evaluator calls, four report-schema replay branches, validation or Apply gates. Presentation reads the same raw values. The tested packing move is honestly worse: original and proposed finish at 502400 ms (8 min 22.4 s), original waiting 614900 ms (10 min 14.9 s), proposed waiting 623600 ms (10 min 23.6 s), delta +8700 ms (+8.7 s), shipped 6 to 6, remaining 0 to 0.

Validation:
- Focused formatter tests: 3 passed, including absent/non-finite values, signed subsecond and minute durations, count deltas and exact-unit disclosure.
- Existing P1 manual-flow Edge checks with additional presentation assertions: 2 passed, desktop/mobile, 1.9 minutes. Geometry, validation, exact recomputation, invalid candidate, undo/apply/reset and zero-POST gates were retained.
- Final focused comparison evidence checks: 2 passed, desktop/mobile, 43.6 seconds. Asserted 8 min 22.4 s, +8.7 s, 502400 ms title, worse-outcome meaning, exact detail disclosure, and no horizontal overflow even with details expanded.
- Final web typecheck and direct Vite build passed. Existing bundle warning remains. No shared-source rebuilds or new dependencies.
- Previously proven no-key API Verify remains valid; unrelated verification tests were not repeated in this presentation-only pass.

Final paired screenshots: `desktop-comparison-before-format.png` / `desktop-comparison-after-format.png`, and `mobile-comparison-before-format.png` / `mobile-comparison-after-format.png`. Desktop comparison captures use 1440px; prior settled entry review pairs use 1920px. Mobile uses 390px. Exact comparison exports remain alongside them. P1 is frozen for coordinator review; OperationsView source diagnostics belong to P2 and human realism/integrated release acceptance remains separate. No commit, push, deployment or inference was performed.
