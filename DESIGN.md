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

## 2. Layout (canonical geometry; validated draft edits)

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

## 9. Main warehouse environment (Operations Simulation mode)

Static-environment part of the v3 operations simulator, integrated into the
real LayoutLab interface (not an experiment page). Storage Planning (§1–§8)
remains fully functional as a mode; the operations scene is the second main
product view. The engine-owned motion/inventory slice arrives separately, so
this section contracts the STATIC scene only: configured/initial values are
shown truthfully and the not-running state is labeled; no looping motion, no
counting meters, no staged queues-as-activity.

### 9.1 Mode integration

- One app shell, three main modes: `Storage Planning` (existing planner) and
  `Operations Simulation` (this scene), switched by a top segmented control
  (`role="group"`, `aria-pressed`, testids `mode-planning` /
  `mode-operations`). Switching modes never mutates planner state: all
  planner hooks stay in `App`, so a scenario/model run survives a view
  switch and back. The bare URL defaults to Operations Simulation;
  `?mode=planning` and `?mode=experiments` select the other modes
  explicitly (tests name their mode instead of assuming a default).
- The operations layout reuses the console tokens (§1): same paper/surface/
  ink/accent/status palette, same type scale, radius, and disclosure
  patterns. Structure: mode bar → status band (fixture identity + honest
  not-running state) → workspace (entity list | warehouse viewport |
  inspector) → developer diagnostics (collapsed by default).
- Main-view labels are operational (entity identity, area names, selected
  information). Engineering data (dimensions, raw asset paths, fit logs,
  renderer counts, load errors) lives ONLY in the collapsed Developer
  diagnostics or the W1 page — never a huge diagnostics-as-product layout.

- Header is mode-separated (review revision): planning shows the planner
  scenario id/rev plus planner badges (Sample/Stub/Manual/Replay/Live/
  validity/live-used/fixture) with the Scenario menu and Export; operations
  shows the actual loaded operations scenario id from the shared
  `loadOperationsScene()` metadata (never a hardcoded id) plus an explicit
  `SYNTHETIC SAMPLE · CONFIGURED` badge (or `CONFIGURED SCENE` when the
  loaded provenance is not synthetic), with no planner badges/menu/export
  until an operations export exists. Planner state lives in `App`, so hiding
  the planner header controls never mutates it. If the operations fixture
  fails to load, the header shows `operations unavailable` + `LOAD FAILED`
  with no fake id or ready claim; the status band keeps the explicit
  `ENVIRONMENT READY · OPERATIONS CONNECTION PENDING` only on successful
  load. No operations runs are claimed.

### 9.2 Canonical data authority

- Single source: `fixtures/operations/main-warehouse.json`
  (`layoutlab.operations/1`, parsed by `@layoutlab/simulation`) for room,
  racks, storage anchors, approaches, products, initial stock, mobile
  parking, resources, queues, and obstacles. Visual binding
  (`fixtures/operations/main-warehouse.bindings.json`) references fixture
  IDs plus measured source bounds/scaling — never independent positions.
- Shared pure helpers (`@layoutlab/simulation` environment module) compute
  rack scaling, shelf-deck heights, and container grid placements from
  canonical dims + measured source AABBs; renderer and proof scripts both
  consume them, never separate hardcoded copies. Navigation reuses the core
  pathfinder through a probe-only occupancy adapter (W1 pattern); no
  second pathfinder.
- Stock visuals derive from declared `initialStock`: zero stock renders an
  empty slot, quantities map to containers through the explicit
  per-product `unitsPerVisual` in the bindings (one box is never one item
  by accident). Unused shelf surfaces render bare and are documented as
  not-counted. Source load/GLB errors surface as truthful status lines;
  nothing silently degrades to decorative cubes.

### 9.3 Scene, camera, materials

- Default overview is a readable isometric open-roof/cutaway of the whole
  room: sourced floor tiles, six rack bays with modeled shelf slots and
  stock, clear aisles, receiving entrance + staging, two recognizable
  packing workstations, dispatch staging + exit, explicit waiting bays and
  six parked carts. Camera presets: `Overview` (isometric), `Top`
  (same configuration, orthographic-ish plan), `Inspect` (frames the
  selected location/rack/agent/station), `Reset overview`. View-only
  orbit/zoom/pan; single render per state change, no auto-motion, honoring
  `prefers-reduced-motion`.
- Materials (R1, supersedes the W1 textureless paragraph): sibling v2
  derivatives preserve source geometry, st UVs, and per-face material
  splits for floor/rack/cart/box/crate. Box and crate embed their source
  PNG textures (Albedo/ORM/Normal); floor, rack, and cart use documented
  replacement PBR factors per source material because their texture
  closures are oversized or UDIM — source MDL fidelity is never claimed,
  and the verified v1 GLB stays as a per-asset fallback with role PBR
  (concrete, painted rack steel, cardboard, plastic, equipment). Lighting:
  shadow-mapped key light (PCF soft), hemisphere + fill, a modest
  PMREM RoomEnvironment fill so metals read as material, ACES tone
  mapping with sRGB output. Frame cost is measured, never claimed as
  60 fps (see `docs/WAREHOUSE_R1_RENDER_REVIEW.md`).
- Selection: location/rack/agent/station via list + native `<select>`
  (keyboard-operable); highlight pairs color with text/shape, never
  color alone. Instrumentation (`data-*` anchors/counts/camera/asset
  status) mirrors §6 for review.

### 9.4 Status truth for this static part

- The status band reads `Environment ready · operations connection
  pending` with the fixture id, counts (racks/slots/products/agents/
  orders), and the engine version it will connect to. Start/run controls
  for the engine are absent in this part (they arrive with the engine
  slice); nothing here moves, counts, or stages activity.
- Responsive: 1440/1586 three-column workspace; 768 stacked (viewport →
  entities → inspector); 390 single column with internal scroll, no
  page-level horizontal overflow, primary preset buttons ≥44px.

## 10. Accepted debt and limits

M3c playback debt also lands here: no new UI framework, fonts, or paid assets; the existing console tokens satisfy the v3 reference rhythm (no brand redesign); Playwright video is the recording method; no Lighthouse or 60fps claim without measurement (see section 11). Plain CSS (no Tailwind/shadcn) to stay offline and minimal — matches the
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

## 11. M3c operations playback binding (engine-connected)

Binds the accepted M3b engine (single picking/packing burst) to the MAIN
Operations Simulation view. Reference hierarchy comes from UI v3 packet 03
(compact header/status + simulation controls/clock, metric strip, dominant
cutaway warehouse, right agent/resource inspector, event timeline, queue
visibility), 06 (order lifecycle, stock reservation/reconciliation detail),
and 08 (ready / running / paused / blocked / stage-complete /
provider-not-used states). No invented animation, routes, or results: every
value, pose, and event is the actual engine snapshot at the shown clock.

### 11.1 Tokens, layout, and states

- No new tokens. The existing console palette already satisfies the packet
  rhythm (warm near-white paper, deep ink, teal actions, amber waits, green
  checks, 8px spacing, 6/10px radii, system sans + tabular/mono data). No
  brand redesign, no new fonts, no icon set (text + glyph status, never
  color alone).
- Layout follows reference 03 hierarchy: the operations workspace is
  (dominant warehouse viewport | right inspector ~380px). The compact
  entity `<select>` and label-layer control live at the inspector top
  (same testids); no separate left entity column. Inside the same mode:
  a metric strip under the status band, playback controls + sim clock in
  the status band, resource queues in the right column, and a
  committed-event timeline below the workspace in an explicit bounded
  scroll body (~180-240px desktop, keyboard-scrollable, sticky header;
  full history reachable without growing the page). Developer diagnostics
  stay collapsed (dimensions, asset paths, renderer counts, perf
  measurements). No fake Experiments/Compare/Reports destinations; the
  mode shell stays Storage Planning / Operations Simulation until a
  destination has working behavior. Planner layout (§2) is untouched.
- Sample identity is explicit: SYNTHETIC picking-packing-burst sample,
  scenario id + seed + runconfig durations in the status band. Run states:
  READY (clock 0, never started), RUNNING, PAUSED, BLOCKED (truthful engine
  diagnostic, state retained), STAGE COMPLETE (READY_FOR_DISPATCH counts;
  never all-shipped), LOAD FAILED. A model was not used in this run: a
  persistent provider-not-used line, never a LIVE claim; no planner badges,
  menu, or export leak into operations.
- Playback: Run/Pause, Reset (new engine from the same frozen inputs), Step
  event (actual stepEvent), 1x/4x/16x speeds, sim clock (mm:ss.mmm,
  presentation only). One controller instance per run, owned above the mode
  switch: leaving Operations pauses presentation but never destroys,
  reruns, or resets the run. Pause freezes the logical clock; speed
  changes reset the wall-time origin without touching configured
  durations. Reduced motion: default is paused, no autoplay; playback is
  explicit user-initiated engine stepping only.
- Metrics derive directly from the snapshot: arrived/selected orders, ready
  for dispatch + packed, shipped (0 in this slice), unshipped backlog
  (arrived minus shipped), stage backlog (arrived minus ready), active
  agents (on task OR wheels engaged, of 6 — picking/unloading/queued
  handling with idle transport is busy, never idle; transport state is
  shown as secondary detail), packing queue as job count with the
  arrived-at-slot count beside it (jobs placed first, physical arrival
  separate). Captions define each term; stageBacklog 0 is never labeled
  overall backlog 0. Sample caption counts (orders, picker/putaway roles,
  packing lanes) derive from the loaded scenario, never hardcoded.

### 11.2 Scene truth (burst on canonical bindings)

- The burst runs on geometry spatially identical to main-warehouse-1; the
  web loader proves it with an explicit derived-fixture compatibility check
  (room, rack, obstacle, location, resource, and mobile-unit spatial
  ids/dims/anchors/coords/footprints/parks/roles compared field by field)
  instead of bypassing the fixture-id check. Changed workload/provenance
  (orders, deliveries, stock, seed, policies) stays allowed; any reused
  spatial assumption that drifts refuses the bindings (fail closed). The
  28-order + 12-delivery main schedule is never executed here (unsupported
  inbound).
- Shelf stock renders at storage anchors from the live ledger: full
  containers plus at most one clearly partial container (same full-size
  mesh) labeled with its remaining item count; zero stock hides the
  visuals. The web helper never throws, shrinks, or rounds when quantity
  is not a multiple of unitsPerVisual.
- Carried loads ride the integrated SimReady luggage-platform carts
  (cargo-C2): each unit cart carries 2 sourced equipment crates at the
  packet unit-frame dock poses on the ray-witnessed 290.7289mm deck
  (whole-assembly normalization +41.02388mm Z, centered 680x1220 r799,
  no independent shifts, canonical yaw kept per the holonomic disc
  assumption). Actual ledger lines allocate into the 4 fixed
  220x320x160 cells in stable SKU/item-ordinal order at cargo yaw90;
  each item renders as a SOLID sourced generic-carton mesh (R1:
  box_cardboard_a01 v2 geometry) non-uniformly scaled so its AABB equals
  its canonical SKU dims exactly, resting on the crate interior floor,
  pooled in one persistent InstancedMesh (matrices only per snapshot).
  Wireframe bounds survive only as a developer overlay on the All
  diagnostic label layer. Unknown SKU, cell misfit, or overflow is
  reported and never drawn as valid cargo. Empty totes render as labeled
  empty equipment. The carry packet is the single source of
  bounds/normalization/docks/cells/yaw/profile/capacity; cart or crate
  geometry drift from the packet bounds attaches nothing (fail closed).
  Attachment is visual only, never claimed as physics certification or
  packing certification.
- Routes show only the selected unit CURRENT authorized granted plan
  points at floor height: the whole authorized polyline is kept and its
  presentation splits completed vs active at the EXACT engine pose
  projected onto its timed segment (pose inserted as the split vertex;
  mid-segment poses never snap to the nearest grid vertex, no points
  deleted, no invented path). Numbered pick stops are markers with no
  connecting lines (intent is not admitted movement) and distinguish
  completed picks (remaining 0) from remaining intent; a zero-remaining
  reservation is never shown as an unvisited future stop. No plan means
  no path; the inspector states the idle/wait reason instead. Approach
  markers stay hidden until selected; product containers stay inside
  racks. The room outline is the true four corners
  (0,0),(W,0),(W,D),(0,D) — the same boundary navigation uses.
- Route direction uses SPARSE arrowheads on the unchanged active
  polyline only: modest cones (0.25m head length, 0.10m radius) placed
  at 1.75m arc-distance intervals along the actual segments, tangent
  to the hosting segment, never one per 100mm grid point, never a
  corner shortcut or invented segment. The pose-split LINE stays exact;
  arrowheads are presentation-only direction cues that preserve the
  clear floor path and cargo visibility.

### 11.3 Performance and responsiveness contract

- Persistent static setup: one renderer/scene/camera/asset load per mount;
  snapshots update poses, stock visibility, labels, and overlays only.
  Never recreate the renderer, reload GLBs, or rebuild static geometry on
  snapshot, frame, or selection. No semantic animation clock; the browser
  frame only advances the real engine and re-renders on snapshot change.
- Overview camera sits low (~30-35deg elevation) so shelf goods read on
  rack fronts instead of gray rack tops. Frame cost is instrumented via
  the data-render-ms dataset (diagnostics only). Resize handling guards
  against unchanged sizes and defers layout writes to rAF (no
  ResizeObserver loop errors; console errors are never suppressed).
- Presentation snapshot cadence is 40ms (~25Hz): the engine still
  advances every rAF to the monotonic wall target with all events
  processed and unchanged simulation durations; only the React
  snapshot/render commit is throttled, from the prior 150ms (~6.7Hz)
  policy. Pause freezes the logical clock; speed changes reset the
  wall origin only. Parity, Step/Reset, pause, mode, and speed
  semantics are unchanged.
- Active-window measurement over >=5s of real playback: baseline
  counters + performance.now sampled AFTER assets load and settle just
  before Run, end counters + time sampled after >=5s ACTIVE playback
  BEFORE Pause/screenshot/diagnostics/layout writes. Reported rates
  are deltas (delta renders / delta wall, delta CPU total / delta
  renders, same-window rAF/advances/snapshots); start/end counters
  and times ship in the JSON so arithmetic checks offline. Window
  maxima are never derived by subtracting lifetime maxima (lifetime
  maxima are labeled as such or omitted). Actual renders, rAF
  callbacks, engine advances, snapshots, render-CPU cost, GPU
  renderer string, asset payload bytes, and error count stay
  SEPARATE. Static load time is not FPS proof; no 60fps, mobile, or
  GPU-time claim without measurement. Full source geometry stays the
  default; a blocking bottleneck is reported with its exact
  measurement and bounded fix, never silently reduced.
- Desktop 1586x992/1440x900 three-column workspace; 768 stacked (viewport
  first); 390 single column; no page-level horizontal overflow; primary
  controls >=44px on narrow; keyboard-reachable controls with visible
  focus; status never color-alone.

## 12. Experiments destination (E4b)

Third main mode `Experiments` (`?mode=experiments`), added beside Storage
Planning and Operations Simulation without mutating either. The mode shell
is three segmented buttons (`mode-planning` / `mode-operations` /
`mode-experiments`, `role="group"` + `aria-pressed`). App owns the
experiments holder above the mode switch, so switching away and back never
creates a run, resets spend, or discards the active run id, frozen inputs,
or last report. No empty Compare/Reports/Orders destinations are promoted;
only working modes ship.

### 12.1 Reference and tokens

Hierarchy follows UI v3 packet 04 (question/permissions column + flexible
evidence region with baseline/candidate cards, run evidence, hypothesis,
experiment steps, results table), with 05 (matched-input compare, changed
fields), 07 (recompute, provenance, limitations), and 08 (ready / invalid /
blocked / no-improvement) as state references. Pictured numbers, models,
and unsupported actions (storage assignment, aisle/traffic policy) are
illustrative only and never shipped as constants or controls. Tokens are
the existing console tokens (§1): paper `#edf1f6`, surfaces white, ink
`#12263f`, accent teal `#0b6b6e`, same status colors, Segoe/system font,
mono data, 6/10px radii, 4/8/12/16/24 spacing. No new font, framework, or
dependency.

### 12.2 Layout

Desktop ≥1024px (readable at 1440 and 1586): status band (scenario id,
seed, versions, provenance) → two-column workspace: left question column
~350px (question textarea, allowed-changes permissions, live consent/
allowance, Start/Cancel, recorded/import actions) and a flexible evidence
region (baseline/candidate metric cards, progress + trace, comparison
table, details drawer, inspection mount, export/verify). The
question column never forces page overflow; the evidence tables scroll
inside their panels. 768px: single column, evidence after question.
390px: single column in order status → question → permissions → evidence;
primary buttons ≥44px; no page-level horizontal scroll. The document owns
vertical scroll; only named internals scroll (comparison table, trace,
timeline inside inspection).

### 12.3 Data truth and formatting

Every value comes from the frozen burst scenario
(`fixtures/operations/picking-packing-burst.json` + runconfig), the local
E3 `runOperationsExperiment` baseline, the investigation `report`
(`comparison`, `trace`, `requests`, `recommendation`), or the server
`/api/status` + `/api/budget` — never from the mockup. Scenario, workload
counts, seed, and versions render from actual data. Baseline runs locally
with zero model requests and shows shipped / backlog / makespan /
totalWait honestly. `totalWait` is always captioned as the summed engine
wait intervals (open intervals clipped at the report clock); no traffic
or packing submetrics are invented. Unavailable metrics render `—` plus a
reason, never `0`. Durations format as seconds with one decimal
(`502.4 s`, raw ms in `title`); improvement percents render at one decimal
in cards/tables with full server precision preserved in details and in
the exported JSON.

### 12.4 Question and permissions

The planning question is free text (1..2000 chars) and grants nothing.
Permissions are a separate machine-readable control: checkboxes for the
three supported service-duration assumptions (`packingDurationMs`,
`dispatchDurationMs`, `receivingDurationMs`), each unchecked by default
with inclusive min/max ms inputs validated against the E3 bounds
1000..300000 and labeled hypothetical assumptions. Staffing
(`extraPickers`/`extraPutaway`) is shown disabled with the concrete
reason that current burst geometry cannot support added staff (parking
clones are infeasible and stay invalid in E3); no storage-assignment or
traffic-policy controls exist because the engine has no such patch field.
Question, policy, scenario, and execution config freeze per submitted
investigation. Editing the draft after a result marks that result as
from previous inputs; it is never reinterpreted as evidence for the new
text.

### 12.5 Live lifecycle

Same-origin typed adapter only (`POST` create returns a stable `runId`,
`GET` poll, `POST` cancel, `GET` report, plus `GET /api/status`,
`GET /api/budget`, `POST` verify). The browser holds no API key and never
contacts Meta directly. Starting requires explicit Live selection plus
Contributor-data consent; only the Start button can spend. Start is
disabled while a run is active, when the server reports no key /
unavailable transport, when the budget guard is unavailable, when
`availableUsd < perRunReservationUsd` (values read from `/api/budget`,
never hardcoded), when the question is empty, or without consent — each
with an adjacent reason. HTTP 400/402/429/503 and unknown/stale runs
surface without automatic resubmission. Polling runs about every 1s with
an `AbortController`, aborts obsolete polls, and clears its timer on
unmount; mode switching preserves `App`-owned run state and resumes the
same `runId`. Cancel keeps the partial trace/report and the truthful
terminal status. Progress shows phase, request/experiment counts against
their caps, run ids, hypotheses labeled `model assertion — not measured
proof`, accepted/rejected actions with reasons, and every candidate
(invalid, incomplete, and no-improvement included). Model-selected,
deterministic-best, and fallback recommendation are distinct fields; no
optimistic success is shown.

### 12.6 Inspection

Selecting a baseline/candidate offers engine inspection that reconstructs
a separate controller from that candidate's executed report scenario
(baseline scenario + declared patch, via the candidate `report`) plus the
frozen execution config, rendered through the existing `OperationsView` /
`OperationsPanel` behavior (camera presets, selection, Run/Pause/Step/
Reset/speed, actual engine replay only). It never overwrites the ongoing
Operations Simulation run, which lives in its own App holder. An invalid
report or geometry the canonical bindings cannot map disables
visualization with a reason instead of drawing an unrelated warehouse.
Duration-only changes appear in changed-fields, never as moved racks.
Renderer engineering data stays in the collapsed diagnostics. At most one
heavy 3D canvas is mounted: inspection mounts on demand and unmounts on
close or candidate change.

### 12.7 Recorded, import, export, verify

The accepted public report (`evidence/sanitized/e4a-live-investigation-f24a6a1.json`,
run `fd2247b1-…`, model `muse-spark-1.3-contributor`) is copied byte-for-byte
to `apps/web/public/evidence/` and loaded as `Recorded Meta run / replay`
with its original run id, model, and date — never presented as new or live
inference. Arbitrary investigation JSON imports through the same recorded
path; `providerKind: fixture` reports are labeled `Fixture`. Provenance
(recorded/imported/live) is stored separately from live configuration.
Loading, replaying, inspecting, exporting, and verifying make zero paid
requests. Export downloads the full investigation JSON exactly as held
(the report object, including partial failed/cancelled evidence), never
formatted UI totals. Recompute posts the report to the server verifier
(`verifyInvestigationExport`, engine-only, no key, no ledger mutation)
and shows the actual pass/mismatches plus the limitation that inference
provenance is recorded metadata, not authenticated proof; the offline CLI
command stays visible. No hardcoded PASS card.

Brand: the header uses the generated square symbol
(`apps/web/public/brand/layoutlab-symbol-v1.png`, 1254×1254) at a fixed
24×24 beside the live-text `LayoutLab` wordmark (the image is decorative;
the text carries the name), and the same PNG is the `image/png` favicon at
its actual size in `apps/web/index.html`. The horizontal lockup
(`layoutlab-logo-v1.png`, 2172×724) stays a master asset; masters are never
redrawn or edited. Fixed dimensions prevent layout shift.

### 12.8 States and accessibility

Ready (no run), running (phase + counts), provider unavailable, budget
exhausted, malformed import, invalid/no-improvement candidates, stale
draft-after-result, recorded replay, and inspection-unavailable each have
distinct text + glyph states, never color alone. All controls have
visible labels; question, permissions, selects, and actions are
keyboard-reachable with the §1 focus ring; run status uses
`aria-live="polite"`; long ids wrap (`overflow-wrap: anywhere`);
`prefers-reduced-motion` disables transitions. Honest limits from §10–§11
stand: no Lighthouse/60fps/mobile-3D claim without measurement.

## 13. Unified warehouse workspace (U1)

The three primary Storage Planning / Operations Simulation / Experiments
tabs are replaced by ONE Operations-based workspace (`WarehouseWorkspace`).
One active `OperationsScenario` + execution config + implementation version
is the input identity (Settings shows it); it feeds the viewer, the live
baseline, assistant submissions, results and exports. Legacy planner data
(four-rack `warehouse-basic`) never feeds the six-rack P01..P12 warehouse:
the planner stays behind explicit legacy access (`?mode=planning`, or
Settings → Advanced) with its own state and reports, and
`?mode=experiments` / `?mode=operations` are compatibility aliases to the
same workspace (assistant / warehouse).

Layout: compact header (logo, scenario selector, Sample data, Settings);
plain-language metric row (scheduled, shipped, remaining including
not-yet-arrived with arrived backlog separate, elapsed engine time; "Time
to finish all orders" only for a completed shipped cohort; combined
waiting time distinct and allowed to exceed elapsed time). The warehouse
viewer is ~72% with a contextual right panel ~28% (stacked on narrow
screens). Starts PAUSED with a persistent Run warehouse / Pause / Reset /
Step and 1x/4x/16x bar; speed is presentation-only. The right panel is
either the selected-object inspector or the warehouse assistant, never
both. Direct canvas picking raycasts through instance IDs to canonical
unit/location/rack/resource IDs (drag/orbit ignored; empty ground, Clear
selection, or Back to assistant returns to the assistant); the entity
dropdown remains as an accessible fallback. Results stay below the same
viewer: Current vs proposed cards with human option names derived from
actual patches ("Option 2 — Assume dispatch takes 30 seconds per order"),
an expandable comparison, "What LayoutLab tested", exact-report Export
and "Verify these results". Recorded/candidate inspection replays the
report's recorded implementation via the versioned controller factory
(never the latest engine silently); selecting an option retains the
Current controller untouched and Return restores it. Scenario changes
create a new context and keep earlier reports as stale/previous.
Assignment/traffic optimization and layout editing are not advertised in
this workspace; only supported hypothetical service-time changes are
offered. No POST spends on mount, playback, selection, reset, scenario
change, replay, export or verify.


## L3b manual rack translation extension

The existing console tokens and controls remain the contract. Physical layout
adds an accessible Rack selector alongside the station selector, canonical integer
mm fields, 100mm snapping, and the existing Validate / Test / Apply / Discard
sequence. An orange dashed original footprint and teal candidate footprint accompany
the sourced rack model; labels, cargo anchors and approaches use the same candidate
scene. Invalid previews name proven blocker IDs and disable Test/Apply. Rotation
and initial-agent placement remain explicit later gates; Muse remains station-only.
The document owns scrolling at desktop and 390px, using existing wrapping actions.

## Human heading and carried cargo integration

Workers now use a deterministic source-length0.5m two-step cycle from authoritative snapshot distance; snapshot clock controls movement/waits and Pause/Reset. Source forward -Z uses shared PI plus engine heading for the entire worker/cart/tote assembly, with identical cargo offset/yaw transforms. Engine anchors and accounting are unchanged. Heading changes are instantaneous visualization; current traffic clearance uses cart footprints and does not certify human-body safety. Archived snapshots without movement segments retain a disclosed grounded stopped pose. See docs/HUMAN_VIEWER_INTEGRATION.md and new human-main-viewer/release evidence for validation and limitations; earlier static-only integration notes are superseded.
