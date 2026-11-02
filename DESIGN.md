# LayoutLab M6A — DESIGN.md (reference-driven planner contract)

Product scope is the user brief (Implementation Brief v2 §23), not a redesign:
an English warehouse planning console for one scenario at a time. The
user-supplied screenshot (private `.coordination/layoutlab-reference.png`) is
the visual contract for hierarchy, panel proportions, typography, and spacing.
It is NOT a source of numbers: every value on screen comes from
`@layoutlab/core` evaluated against actual state. Reference-illustrative
results (28.4 m, 12 orders, "Candidate 2 selected") never appear as constants.

## 0. Reference extraction log

- Static visual reference supplied by the user; extracted by direct inspection
  (tokens, geometry, copy shape, states, responsive intent below). The
  frontend router's `references/design/image-to-code-skill.md` helper is
  absent locally (verified by directory listing), so no skill commands were
  used or invented; `frontend-design` guidance + manual extraction apply.
- No Imagen/lazyweb/brand rediscovery: a concrete reference was supplied, and
  paid generation is forbidden. No new fonts, icons, or rendering frameworks.
- Spatial pattern: StyleGallery holy-grail viewport shell (link only, no
  copied prose):
  https://raw.githubusercontent.com/changeroa/StyleGallery/main/patterns/viewport-shell/holy-grail.md
  Structure restated: top nav, headline band, metric strip, three-column
  workspace (products | warehouse | planning), full-width comparison. The
  document owns vertical scroll; panels constrain their own internals.
- Layers loaded for this work: `taste-skill` posture via existing console
  direction (operational brief, restraint correct), `layout-skill.md`
  (scroll ownership, min-width contracts), `stylegallery.md` (pattern
  citation), `perfection/README.md` (honest real-browser QA, no invented
  scores), `designpowers/lane-c-review.md` (post-build critique order:
  artifacts first, judgment second).
- M6A resume corrections (density/status/labels): `bundled:visual-coding`
  routes the 3D label fix to `bundled:web3d`, whose own scope excludes
  changes inside an existing multi-file framework project — so the
  existing viewer is extended with installed three addons only
  (OrbitControls incl. `listenToKeyEvents`, CSS2DRenderer), with API
  technique from the `threejs` plugin hub. Verified against installed
  three 0.187.0 sources (key pan calls `update()`, CSS2D writes the
  wrapper transform so screen offsets live on a child node).

## 1. Visual direction

Operational console with the reference's quiet SaaS surface. One memorable
element: the warehouse viewport itself (real 2D plan / SimReady 3D with true
route polylines). Everything around it stays quiet and dense so measurements
stay readable at 1586px and usable at 390px.

- Base: pale blue-gray paper `#edf1f6`, surfaces white `#ffffff`.
- Ink: navy `#12263f`. Muted text `#51607a` (≥4.5:1 on white).
- Borders: pale blue-gray `#d9e1ec`. Table headers `#f3f6fa` wash.
- Accent/actions: deep teal `#0b6b6e` (≥4.5:1 on white) for primary buttons
  and selected tabs. Focus ring: 2px solid `#0b6b6e` + 2px offset white.
- Status: valid green `#177245` on pale `#e7f5ec`; invalid `#b42318` on pale
  `#fdeceb`; warning/amber `#8a5a00` on pale `#fdf3e0`; info navy `#123a9e`
  on pale `#e7edff`. Every status pairs color with text + a glyph
  (✓ / ! / ×), never color alone.
- Routes: candidate solid teal `#0b6b6e`; current dashed orange `#d9730d`
  (dashed + labeled, never color alone).
- Demand pills (text + symbol, not color alone): low pale blue `#e7edff` +
  `○ Low`, mid pale amber `#fdf3e0` + `◐ Medium`, high pale red `#fdeceb` +
  `● High`. Demand dot scale keeps the same three steps in 2D legend.
- Product identity chips: small flat squares in distinct hues, always paired
  with the product id text (never color alone).
- Locked: amber `LOCK` badge + `aria-label` with the reason.
- Type: system stack only (offline, no webfont fetch).
  UI: `"Segoe UI", system-ui, -apple-system, sans-serif`.
  Data/IDs: `ui-monospace, "Cascadia Mono", Consolas, monospace`.
  Scale: 12 data / 13 dense / 14 body / 16 panel titles / 24 page headline /
  28 metric values.
- Radius: 6px controls, 10px panels/cards. Spacing 4/8/12/16/24.
  Metric/nav shadows: none; separation is border + wash only. No gradients,
  no glass, no decorative animation.

## 2. Layout (fixed rack geometry; UI never edits racks)

Desktop ≥1024px (primary comparison 1586×1007, also 1440):
page grid `nav / headline / metrics / workspace / comparison / footer`.
Density budget at 1586×1007 in the reference state (sample → approve →
stub → heuristic selected → O2, default 3D): workspace panels align
around ~560px, comparison heading near y≈800, whole initial page near
1007 (aim ≤1150px with the actual third proposal row). No browser zoom,
scaled page, clipped content, or tiny text buys this: all working
controls stay reachable through genuine accessible disclosures, which
may naturally expand the page when opened.
- Slim white nav (~52px): LayoutLab mark + breadcrumb
  ("Warehouse storage planner › {scenario}"), sample/provenance
  badges, one `Scenario` disclosure menu (Load sample, Load JSON,
  Import/Replay, Reset — same testids, same handlers), Export action
  (label reflects the exportable artifact). The menu overlays content
  (absolute dropdown), never shifts layout.
- Headline band: "A better place for every product." + planning-purpose
  subtitle; right side shows the actual selected-candidate status pill.
- Metric strip: 4 cards (picking travel, reachable orders, relocated
  products, assignment status). Large value, small label, explanatory
  caption, compact SVG icon in a pale circular field.
- Workspace: three columns ~22.5% / 50.5% / 25.5% with 12px gutters:
  left products/relocations, center warehouse viewport, right
  planning/history. Column min-widths are 0 with internal scroll; nothing
  forces page-level horizontal overflow.
- Left column: searchable products/assignments (filter is local only),
  single-line compact product rows (id + label + inline lock/changed/
  cold badges), demand pills, destination/compat inline, frame note,
  selected-candidate relocation list, Evaluate assignment action,
  Orders in a collapsed disclosure (actual template/weighted counts in
  the summary).
- Center column: dominant warehouse viewport with 2D/3D switch and
  Current/Candidate segmented control, frame-source note, order
  selector, route + previous route visibility toggles, legend, compact
  footer row, zoom/reset/pan controls. 2D is always available as a
  readable fallback; exactly one view is visible at a time. The 3D
  canvas height is clamped (~400px desktop) so the panel meets the
  workspace budget while the viewport still fills the panel; narrow
  canvases use 300px so 17+ labels can pack without overlap.
- Right column: one concise sample/no-inference note (stub) or the live
  request + consent flow (live), structured requirements + approval,
  relocation stepper (data-bound to the same budget value), constraint
  tags, compact locked-products disclosure (actual selection count in
  the summary), compact approval (banner only once approved),
  bounded Generate/Cancel, one-line run status, compact numbered
  proposal history (summary line + expandable rationale/diagnostics
  per attempt), one-line outcome, collapsed Developer settings.
  Provider radio, setup, budgets, and run diagnostics live in the
  collapsed Developer settings; display-only goal text moves there too
  (stub never reads it).
- Bottom: full-width comparison table (method, constraints, picking
  travel in meters, relocations, improvement) + one collapsed Run
  details disclosure (compute budgets + relocation list for the shown
  candidate; the left relocation plan stays visible) + Apply-selected
  action. The attribution summary stays visible: current, heuristic,
  actual first attempt (N/A when invalid, never first-valid
  substitution), best valid model proposal with its winning iteration;
  overall selected assignment is separate.
- Footer line: actual asset + evaluator provenance (SimReady ref,
  LayoutLab evaluation), methodology pointer.

768px: headline + metrics stack (2×2), workspace becomes one column in
order warehouse → products → planning; comparison table scrolls inside
its panel. 390px: single column nav → headline → metrics → warehouse →
products → planning → comparison; tables and viewport internals scroll
inside panels; primary buttons ≥44px tall; no page-level horizontal scroll.

## 3. Scroll ownership (load-bearing)

- The document owns vertical scroll. No nested vertical scrollbars except
  named internals: product list (`max-height` + auto),
  comparison/relocation tables (horizontal auto inside the panel only).
  Proposal history needs none (at most three compact rows + heuristic).
- Grid/flex children that bound scroll carry `min-width: 0` /
  `min-height: 0`; intrinsic grids use `minmax(min(…), 100%)` so tracks
  collapse instead of overflowing at 390px.
- Unbroken strings (run ids, hashes, diagnostics) use
  `overflow-wrap: anywhere` inside their containers.

## 4. Primitives and states

- Buttons: primary (teal fill, white text), secondary (white, teal border),
  danger-ghost for Reset/Cancel. Disabled uses `aria-disabled` + reduced
  opacity + reason in `title` and adjacent text.
- Segmented controls (2D/3D, Current/Candidate): `role="group"` with
  `aria-pressed` buttons; selected is teal fill + white text + text label
  (never color alone). Switching views never mutates scenario state.
- Selects/inputs: visible `<label>`, error text under the field in invalid
  red with `role="alert"` for parse failures.
- Stepper: − / value / + bound to the same budget field; the number input
  stays editable and both write one value.
- Tables: monospace IDs, sticky header, row selection with `aria-selected`,
  invalid rows get `!` prefix + error summary line; selected row gets a
  pale teal wash + `Selected` pill.
- Badges: `SAMPLE`, `STUB`, `MANUAL`, `REPLAY`, `LIVE-USED`, `FIXTURE`,
  `INVALID`, `LOCK`, `CHANGED`, `COLD`, `STALE`, `PROXY` — uppercase 11–12px,
  border + text (no color-only meaning).
- Metric cards: icon + label + large value + caption. Empty state shows
  `N/A` with a direction to load a scenario. Values always derive from the
  presentation frame (§6); captions name the frame (current vs candidate).
- Proposal history: compact numbered rows 1..3 for generated attempts
  only (number + name + verdict + travel in the summary; full
  rationale/parse/apply diagnostics expandable per attempt); the
  heuristic is a separate labeled row, never a fourth proposal. Failed/
  empty attempts stay visible with actual diagnostics.
- Stale: changed current requirements or scene revision vs the frozen run
  shows a `STALE` banner and disables every apply path until re-run.
- Mode badge (primary status truth): derived from the ACTIVE run
  provenance, never the raw mode flag. `STUB` / `MANUAL` / `REPLAY`
  pass through; a completed live run shows `LIVE` only when the
  provider is the official Meta transport AND actual
  `realMetaRequests > 0`, otherwise `FIXTURE` when fixture requests
  ran. Old live/fixture runs never bleed into a new stub/replay: the
  `LIVE-USED` / `FIXTURE` badges render only while the live run is the
  active comparison. Configured-but-unused shows no live claim.
- Header validity tracks the PRESENTED frame (`title` names Current vs
  the candidate); the metric status card already does.
- Live-used: shown ONLY when the live provider is the official Meta
  transport (`providerKind "meta"`) AND actual `realMetaRequests > 0`
  on the active run. Configured-but-unused, fixture, and replay states
  keep their own honest labels. No hidden requests fire on view toggles.
- Developer-settings status names configuration truthfully, never a bare
  "Live ready": `Fixture ready — local loopback configured (0 real
  Meta) … Not live inference.` for fixture transport; `Meta ready —
  configured, not used … No completed Meta requests yet.` for an unused
  Meta transport; `Meta ready — USED by this run … N real Meta requests
  this run.` once the active run really used Meta.
- Disclosures (`Scenario` menu, `Developer settings`, locked products,
  history items, orders, run details) are native `<details>`/`<summary>`
  so they are keyboard-operable with zero custom focus code; the
  Scenario menu closes on selection. Summaries always carry actual
  state (counts, verdicts, travel), never placeholder text.
- Motion: route redraw + 150ms opacity fade on candidate switch only; all
  motion disabled under `prefers-reduced-motion`.

## 5. Presentation frame and data truth

One coherent presentation frame drives cards, warehouse overlays, and the
selected comparison row: the selected candidate assignment when a candidate
view is active, otherwise the current (baseline) assignment. Source labels
always name which frame is shown.

- Travel converts integer millimeters to meters for display
  (`36.8 m` style, 1 decimal); raw mm stays available in `title`/export.
  Improvement percent is the core `improvementPercent` result, shown only
  when comparable/valid, else `N/A`.
- Frozen frame rule: candidate percentages, relocation counts, and the
  comparison baseline always use the frozen run baseline evaluation plus
  the frozen run requirements — never the mutable edited scene. Stale runs
  are labeled `Run baseline (historical)` / `Historical run baseline`.
  The Current frame (cards, warehouse, left panel in Current view) uses
  the live edited scenario. The orange route overlay follows the live
  scene and says so when the scene differs from the run baseline.
- Reachable orders distinguish order templates from frequency-weighted
  orders (`3 / 3 templates · 7 weighted orders` on the sample); the
  reference's illustrative 12 is never shown.
- Relocations and the approval limit come from the relevant frozen run
  requirements; manual edits and alternate fixtures update every value.
- Demand is explicit visit frequency/units semantics: per-product ordered
  units = Σ order.frequency × quantity, bucketed low/mid/high with the
  unit count shown. Nothing is hardcoded from the reference.
- All original workflows are preserved: load/import/manual edit/
  evaluate/approve/generate/cancel/compare/select/apply/stale guard/
  persist/reset/success + failure export/replay. Controller and network
  semantics in `App.tsx` stay intact; this milestone only restructures
  presentation.

## 6. 2D and 3D contract

2D SVG: room rect, rack footprints from core `rackFootprint` (centers +
yaw), storage slots + product boxes at storage anchors (§8), picking
approaches only when selected (§8), packing point, product labels
(distinct text, never color alone), source/destination highlight
(dashed outline + `FROM`/`TO` tags on storage slots). Route overlays use real core `shortestPathPointsMm`
polylines for the selected actual order: solid teal candidate route and
dashed orange current route, each with a visibility toggle. If the routes
coincide or a route is unavailable, the view reports the actual condition
(`Routes coincide for this order/selection` / `Visit-order schematic —
not collision-checked`) instead of inventing a separation or drawing a
straight shortcut through racks. Camera = viewBox zoom (+/− buttons +
keyboard), drag/keyboard pan, reset; panning never moves racks. Keep the
`Fixed racks · Conservative 2D routing` label.

3D: Three.js Y-up scene, mm→m scale 0.001, actual NVIDIA SimReady GLB rack
instances at canonical footprint centers with per-axis scale + yaw (keep
the scale/yaw contract and `data-asset`/`data-racks-loaded`/`data-rack-bbox`
instrumentation). Rack/location/PACK/product-id labels anchor to canonical
mm coordinates via three addons (CSS2D labels, OrbitControls zoom/pan),
readable and keyboard-resettable; no auto-motion, single render per state
change (plus control-change renders). View-only selection and
same-geometry frame/order/route changes preserve the camera
(position, target, zoom); only loading different geometry resets to
home, and reset always returns to the actual home (`data-cam` target,
`data-cam-pos`, `data-cam-dist` instrument this). GLB load failure keeps the labeled
proxy fallback with an explicit status line. Product boxes and chips sit on
storage anchors (§8); approach markers appear only when selected (§8);
chips use true 2D greedy packing (first-fit candidate cells
above/below/sides of the projected anchor, inside-canvas and
non-overlapping — display only) with thin leader lines drawn from each
projected canonical anchor to its displaced chip — leaders begin at
actual pick/rack/PACK coordinates, never anywhere else. Narrow canvases
(<520px) get 300px height for 17+ labels; desktop keeps the 400px clamp.
Residual two-axis overlap is instrumented (`data-label-overlap`), not
hidden; readable 2D stays one tap away on small screens. Keyboard camera pan
uses installed `OrbitControls.listenToKeyEvents` on a focusable canvas
(`data-cam` exposes the target for tests). Route overlays use the genuine
core polylines at floor height with an on-top overlay treatment
(`depthTest` off, high `renderOrder`) under a slightly overhead default
camera so both paths stay followable past racks; coordinates are
unchanged and the 2D plan remains the occlusion-free authority. No
invented stored poses, obstacles, or screenshot backgrounds.

## 7. Accessibility constraints

Contrast ≥4.5:1 body, ≥3:1 large text; visible focus on all controls;
reading/tab order matches visual order (nav → headline → metrics →
warehouse → products → planning → comparison); keyboard-reachable view
toggle, order select, candidate select, zoom/reset, stepper, and all
actions; `aria-live="polite"` for evaluation/generation status; no
color-only signals (demand, validity, locks, from/to, routes all have
text/symbol); reduced motion honored; 390px has no page-level horizontal
scroll; touch targets ≥44px for primary actions.

## 8. Storage anchors (R1): inside-rack products, aisle approaches

Every storage location has two presentation references, resolved by one
shared pure web helper (`storageAnchors.ts`) used identically by the 2D
plan and the 3D scene:

- Storage anchor (presentation only): canonical mm XZ center + base Y
  (floor, 0) + rack yaw, derived from the location's rack envelope,
  usable dimensions, and stable identity (sorted slot index within the
  rack). Products render INSIDE rack slots at this anchor with their
  true `storedLoadDimensionsMm`, centered in the usable footprint. No
  input-schema field exists; the anchor is never routed to and never
  portrayed as measured warehouse data.
- Picking approach (evaluator truth): the existing immutable
  `pickPointMm` aisle point. All route endpoints, visit sequences, and
  travel math keep using it exactly as before; the route path is
  unchanged by this milestone.

Synthetic presentation assumptions (declared, not measured): single
floor row of slots across the rack width (slot i of N at local
`-w/2 + w·(i+0.5)/N`, z centered, base Y 0); depth-split tried only if
width-split doesn't fit all but depth-split does; yaw 90/270 swaps
width/depth exactly like the core footprint convention and the GLB
`rotationY` mapping; no multi-level stacking (usable height must fit
the rack height). GLB calibration: the integrated rack mesh is an open
upright+beam frame (vertex histogram peaks ≈0.45 m and ≈2.30 m source
height, ground contact at the uprights, no solid shelf deck), so floor
placement is the only non-fabricated base. A location whose usable box
cannot fit its slot cell, whose rack is missing, or whose product load
exceeds the usable box gets an unavailable-placement warning in the
warehouse diagnostics and on its product row — never an aisle
inventory marker and never a plausible fabricated pose. Invalid
duplicate assignments render EVERY occupant (stacked/tagged `×N` with
a warning), never a Map overwrite that hides one.

Visual roles: rack footprint (existing) → slot outline (usable
footprint, dashed) → product box (true load footprint) → location
label at the storage anchor. Approach floor markers are hidden by
default and appear only for the selected location or the selected
order's actual pick approaches (visit sequence of the displayed
frame); unselected locations show no aisle dot. FROM/TO relocation
tags sit on storage slots. Selection highlight (outline + `Selected`
text, leader lines in 3D) never moves a canonical anchor. Frame
switch moves products and labels to the frame's assignment while
route endpoints resolve from the same frame's `pickPointMm`.

Selection and accessibility: location selection is a native
`<select>` in the warehouse footer (keyboard-operable, all locations
+ none); product rows carry a small `Locate` button that selects the
product and its location; everything is reachable by keyboard with
visible focus, and selection/validity/occupancy always pair color
with text or shape (never color alone). A selected product resolves
its displayed location from the displayed assignment, so Current/
candidate frame switches and selected-candidate changes move the
highlight, footer readout, and approach dot with the product (never
a stale explicit location, never a mix of frozen and current frames);
the explicit dropdown location applies only when no product is
followed. Choosing None clears both product and location selection;
order-stop approaches from drawn routes still show, and the None
label (`None (order stops still shown)`) states that exception.
Instrumentation for review:
the footer readout names the selected location's storage anchor and
approach coordinates in mm (`L1 storage (900, 1500, base 0) ·
approach (2900, 1500)`), and both views expose anchor coordinates via
`data-*` attributes; route metadata still reports true polyline point
counts. Panel density, scroll ownership, camera controls, frame
rules, and all honest sample/stub/live labels from §1–§7 are
unchanged.

Limits: no multi-level shelf stacking, no physical capacity or
temperature simulation, no playback (R2). Benchmark scenes whose
usable boxes exceed their small rack envelopes (e.g. 800×600 usable
in 400×400 racks) intentionally resolve to unavailable-placement
diagnostics; only geometrically fittable slots render.

## 9. Accepted debt and limits

Plain CSS (no Tailwind/shadcn) to stay offline and minimal — matches the
existing stack, so no framework migration. No virtualized tables (MVP
scale ≤64 products). No react-grab/react-scan/react-doctor installs: the
React Dev Tooling Gate's `npx` installs would add dependencies and network
surface for a milestone scoped to minimal presentation changes; static
`tsc` + real Playwright browser QA (including render-behavior assertions
on actual controls) cover this milestone instead, recorded honestly in
`docs/VISUAL_IMPLEMENTATION.md`. No Lighthouse-100 claim without
measurement; no hidden content or asset swaps for scores. No paid
services, no deployment, no global harness changes. The reference
warehouse photograph is style/composition guidance only and never ships
as a background or geometry.
