# R1 Storage Anchors — review notes (Muse coder, Codex review)

## Outcome

R1 is implemented and verified. Products now render INSIDE rack slots in
both viewers at synthetic storage anchors resolved by one shared pure
helper; aisle `pickPointMm` approaches stay hidden unless a location is
selected or the selected order's route uses them. Routing endpoints,
travel math, and all run/apply/replay behavior are unchanged. No
playback was implemented (R2 gate below).

Review fixes (this pass, same R1 scope): an independent built-UI review
(`.coordination/review-r1-selection.mjs` →
`.coordination/r1-independent-selection-review.json`) reproduced 4 gaps
the first-pass tests missed — stale product selection across frames,
None leaving a marker/highlight, 3D camera reset on selection, and the
provenance ribbon covering chips at 390px. All 4 are fixed with focused
regressions; the first-pass R1 work is preserved, not redone.

## What changed (files)

- `apps/web/src/lib/storageAnchors.ts` (new): the single
  location→storage-pose resolver used by both views, plus product
  placements, yaw rotation, and diagnostics. Pure; never mutates input.
- `apps/web/src/lib/storageAnchors.test.ts` (new): 14 vitest checks with
  hand-derived literal coordinates (never the resolver twice).
- `apps/web/src/components/CenterView.tsx`: slot outlines + true-size
  product rects at anchors; approach dots + connectors only for
  `visibleApproachIds`; labels alternate above/below slots; rack ids
  redrawn above slots with halo; invalid stacks offset display-only and
  tagged `⚠×N`; no geometry for poses without anchors.
- `apps/web/src/components/ThreeView.tsx`: slot outlines + true-size
  product boxes at anchors (floor base, world axis-aligned, no extra
  rotation); one chip per location at the anchor (13 chips, 0 overlap);
  approach spheres only for `visibleApproachIds`, chipless; invalid
  stacks rise display-only in red; GLB/de-collision/route logic
  untouched; camera preserved across view-only selection and
  same-geometry frame/order changes (geometry-keyed restore, explicit
  reset still returns home). `data-anchors` / `data-approaches-shown` /
  `data-cam-pos` / `data-cam-dist` instrumentation.
- `apps/web/src/components/WarehousePanel.tsx`: computes one shared
  resolution per frame; native location `<select>`; compact anchor
  readout (`L1 storage (900, 1500, base 0) · approach (2900, 1500)`);
  collapsed storage-warnings `<details>` (sample: none). None option
  honestly labeled `None (order stops still shown)`; provenance ribbon
  moved from the 3D canvas overlay into the panel head (3D only, same
  text, zero density cost).
- `apps/web/src/components/LeftPanel.tsx`: per-row `Locate` button
  (selects product + its shown location), `Selected` /
  `⚠ Storage` badges, `aria-current` row; frame-aware anchor status.
- `apps/web/src/App.tsx`: selection state (validated against the scene,
  cleared on load/reset, follows reassignment); a selected product
  resolves its displayed location from the displayed assignment
  (`effectiveSelectedLocationId`), so frame/candidate switches move the
  highlight/readout/approach with the product and never show a stale
  explicit location; explicit location applies only with no product
  followed; None clears both. `visibleApproachIds` from the effective
  selection + each drawn route's evaluated visit sequence in its own
  frame. Route builder untouched.
- `apps/web/src/styles.css`: `.badge.warn`, `.mini-btn`,
  `tr[aria-current]`, `.anchor-readout`, `details.storage-warn`,
  `.tag3d.selected`, static `.proxy-ribbon` badge only.
- `apps/web/e2e/r1-storage-anchors.spec.ts` (new): 11 focused browser
  checks (anchors, approach reveal rules, readout, locate +
  reassignment, duplicate diagnosis, 3D parity, frame-aware selection
  both directions + second candidate, None-clears with route-stop
  exception, 3D pan+zoom preservation with reset-home, chip/overlay
  rectangles at 1440/768/390, keyboard + overflow).
- `DESIGN.md`: §8 storage-anchor conventions (written before the
  component edits) + §6 pointers; §9 renumber; review pass adds the
  frame-aware selection rule, None semantics, and camera-preservation
  states only (plus the depth-split wording fix below).
- Evidence: `evidence/sanitized/r1-*.png` (19 new files, listed below;
  the 9 `*-3d` files + `r1-1440-bench-diagnostics.png` refreshed to
  final behavior, 2D state files unchanged).

No core/API/schema/fixture/manifest/package/asset/route/report edits.
`.env`, `.coordination/m5-live-*`, and `evidence/sanitized/m5-*`
untouched. Fixture hashes: all 7 manifest entries re-verified match.

## Anchor derivation (declared synthetic assumptions)

Single floor row across rack width, slot `i` of `N` at local
`-w/2 + w·(i+0.5)/N`, z centered, base Y 0; depth-split only when the
width row doesn't fit all but the depth column does (comment +
DESIGN.md wording aligned to the code; no mapping change); yaw
90/270 swaps axes per
the core footprint and three.js `rotationY` direction (unit-pinned on
all four yaws); no multi-level stacking. Sample anchors: L1
(900,1500), L2 (1700,1500), L3 (4300,1500), L4 (5100,1500), L5
(900,4500), L6 (1700,4500), L7 (4300,4500), L8 (5100,4500), base 0.

## GLB calibration

Read-only vertex histogram of the integrated GLB (132,312 verts):
open upright+beam frame, concentrations ≈0.45 m and ≈2.30 m source
height, ground contact at uprights, no solid shelf deck — so floor
placement (base 0) is the only non-fabricated base. Screenshots show
true-size 500×400×600 boxes inside the scaled frames with no visible
beam clipping (beams are perimeter members; loads are interior).

## Commands and exact results

- `npx vitest run src/lib/storageAnchors.test.ts` (apps/web): 14/14
  pass — literal centers, slot-in-footprint via core `rackFootprint`
  oracle, no slot/load overlap, reassignment to L6, duplicate
  occupants kept, oversize-load diagnosis, 4-yaw fixtures, missing-rack
  / small-rack / depth-col / unknown-ref diagnostics.
- `npm run typecheck --workspace @layoutlab/web`: clean.
- `npm run build --workspace @layoutlab/web`: clean (pre-existing
  >500 kB chunk warning from the three.js bundle, unchanged).
- `npx playwright test --project=desktop` (7 suites incl. 11 R1):
  49/49 pass — incl. M6A baseline 36.8 m, heuristic 29.8 m with 2/4
  relocations, 1586 density (panels ≤640, 13 chips, 0 overlap), GLB
  bbox, report replay, fixture-not-live labeling, and the 4 new R1
  review regressions.
- `npx playwright test --project=mobile`: 49/49 pass.
- New R1 regressions also run against the production build itself
  (`vite preview` on :5173, Playwright `reuseExistingServer`):
  `r1-storage-anchors` 11/11 on desktop and 11/11 on mobile.
- Full 49+49 browser rerun actually done this pass (not carried
  evidence); sample baseline 36800 mm and heuristic 29800 mm with 2
  relocations unchanged; no canonical pick coords or fixture hashes
  changed.
- Independent built-UI review `node .coordination/review-r1-selection.mjs`
  (ephemeral `vite preview` + Chromium, stub only, status stubbed as
  setup-required, no model calls): all 4 findings now read fixed —
  Current frame readout/selected `L2` with stored `L2` (was stale `L4`
  readout), None with routes off gives 0 approaches + 0 selected rows
  (was 1/1), camera `3.211,0,2.884` unchanged across Locate (was reset
  to `3,0,3`), ribbon overlaps `[]` (was `[R1, L4 sku-d]`).
- Evidence run against `vite preview` of the production build: 0
  console/page errors; scrollWidth == viewport at 1440/768/390.
- No model calls: stub + local fixture transport only (`real Meta 0`).

## Proof paths (built viewer)

`evidence/sanitized/r1-{1440,768,390}-{valid,candidate,invalid}-{2d,3d}.png`
(18) + `r1-1440-bench-diagnostics.png`. Valid states select L1 so the
readout, approach dot, and connector are visible; candidate states show
the heuristic frame (B→L4, D→L2, O2, 47-pt route) with inline TO tags;
invalid states show the diagnosed sku-a+sku-f double occupancy at L1
(`⚠×2`, red, no route drawn for the invalid frame, no silent repair);
the benchmark capture shows 4 honest no-pose warnings with exact cell
numbers and routes still drawn. All 19 were visually inspected:
products inside GLB frames, readable labels/selection, no overflow;
approach dots appear only for the selected location/order stops.
Review pass: the 9 `*-3d` captures were re-taken with the ribbon in
the panel head (same states, same GLB frames) and
`r1-1440-bench-diagnostics.png` with the corrected None label; all 10
re-inspected (chips readable, no overlay, ⚠×2 invalid state intact).
The 9 `*-2d` state captures are byte-untouched — no 2D pixel changed.

## Review findings / limits

- 2D labels needed one iteration: aisle-era side stagger collided once
  anchors moved 800 mm apart, and slot fills covered rack ids. Fixed
  with parity-alternated above/below labels and rack ids redrawn above
  slots with a halo; TO/FROM folded into the id line.
- `rotateRackLocal` initially returned `-0` for negated exact zeros;
  normalized with `+0` (caught by the yaw unit test).
- Independent built-UI review found 4 gaps first-pass tests missed;
  all fixed this pass with exact regressions (evidence:
  `.coordination/r1-independent-selection-review.json` before →
  re-run after):
  1. Stale product selection across frames: candidate Locate sku-b
     then Current showed stored `L2` but readout/selected `L4`. Fixed
     with one frame-aware selection — a followed product resolves its
     displayed location from the displayed assignment (both
     directions + second-candidate coherence regressed); independent
     explicit location preserved when no product is followed; frozen
     and current frames never mixed.
  2. None left one approach dot + one selected row with both routes
     off. Fixed: None clears product and location selection (0 dots +
     0 rows regressed in 2D/3D), and the option now honestly reads
     `None (order stops still shown)` since a drawn route's stops
     still reveal (exception regressed).
  3. 3D selection rebuilt the scene and reset the camera
     (`3.211,0,2.884` → `3,0,3`). Fixed with a geometry-keyed
     camera restore for view-only selection and same-geometry
     frame/order changes (explicit reset still returns home;
     different geometry still resets). Pan+zoom preservation
     regressed with real `data-cam-pos`/`data-cam-dist`
     instrumentation, not target-as-zoom.
  4. At 390px the `SIMREADY RACKS · PROXY MARKERS` ribbon covered the
     `R1` / `L4 · sku-d` chips while `data-label-overlap` read 0
     (chip-chip only). Fixed by moving the ribbon (same text) into
     the panel head, outside the annotation viewport — first tried
     as a static block above the canvas, but that cost 23px and broke
     the 1586 density bound (`scrollHeight` 1203 > 1180), so it sits
     inline in the head row at zero height cost. Chip-vs-ribbon /
     camera-controls / status / clip rectangles regressed at
     1440/768/390; no labels, assets, or content hidden.
- Limits (documented in DESIGN.md §8): no vertical shelf stacking —
  benchmark scenes with 800×600 usable in 400×400 racks intentionally
  resolve to diagnostics (bm-04's small slot and bm-06's R-block slot
  still resolve); no capacity/temperature simulation; rack-id text can
  touch product boxes in dense generic geometry (display-only, haloed).
  R2 note: playback must avoid scene recreation per tick (camera
  restore here is a rebuild Band-Aid, not the animation design).
- Skills: Ponytail full throughout; `taste` preflight (no-op, tokens
  preserved); three.js hub loaded (established patterns only);
  `durable-test-collateral` complied (maintained unit + e2e kept);
  `web-frontend-suite` assessed and NOT applied — its Tier 1
  re-direction contradicts the preserve-reference constraint, and the
  stack is plain CSS React (no Tailwind/shadcn/GSAP). No missing tool
  blocked the work.

## R2 gate

Coordinator acceptance: the built-preview reproduction was rerun with explicit
assertions and all four findings passed. Candidate/current product selection
agrees with the displayed box, None clears selection with routes off, the
panned camera target persists, and the mobile ribbon no longer intersects
chips. The coordinator inspected the updated mobile GLB screenshot and
verified all seven frozen benchmark hashes. Evidence:
`evidence/sanitized/r1-independent-review.json`. The no-pose behavior for
insufficient benchmark rack geometry is accepted as a documented visualization
limit, with routing/evaluation unchanged. R1 is accepted; R2 may start.

R2 (evaluator path playback) can start per
`.coordination/route-playback-plan.md`: shared route artifact with
leg/stop indexes from the existing core path + visitSequence, picking
vs relocation view modes, floor arrows/numbered stops, play/pause/
restart/next-stop with reduced-motion and keyboard support — no
alternative router, no measured time claims.
