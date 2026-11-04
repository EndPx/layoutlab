# Warehouse R1 render review — materials, lighting, solid carried cargo

Status: R1 implemented for independent review. No commit/push/deploy, zero
paid Meta calls. Engine, canonical scenario JSON, fixtures, API, and brand
assets are untouched (presentation only). Human locomotion (R2) and shared
planner/operations state (R3) are out of scope and not implemented here.

## 1. Diagnosis (verified before changing)

Baseline evidence (pre-R1 code, same probe method/viewports/camera):
`evidence/r1/baseline-*.png`, `evidence/r1/baseline-stats.json`.

| Claimed cause | Verdict | Evidence |
|---|---|---|
| Textureless fallback materials (washed-out) | CONFIRMED (primary) | Every v1 GLB parses to exactly 1 `layoutlab-fallback-*` material, 0 images, no `TEXCOORD_0` (box/crate/cart/rack/floor/walls/tables). Source MDL/textures/UVs were dropped by the W1 conversion. |
| Flat lighting, no shadows, no tone control | CONFIRMED | Pre-R1 `OperationsView` never enabled `shadowMap`, `toneMapping`, or `outputColorSpace`; hemisphere + 2 directionals only. Carts/crates float (baseline screenshots). |
| Moire/shimmer on racks | CONFIRMED visually | Dense repeated rack/crate geometry, textureless, aliases at overview distance in baseline captures. |
| Z-fighting / duplicate surfaces | NOT demonstrated | No visible flicker isolated in captures; floor tiles instance above the room outline and annotation fills use offsets. No surface was removed on speculation; canonical obstacles/footprints unchanged. |
| Label clutter | CONFIRMED (density, not missing code) | `decollide()` packing already existed; 24 slot chips + stops cover racks in `All`. Default stays Areas; residual chip-chip overlaps measured 4 at 390px overview and in tight inspect views. |
| Wireframe carried cargo | CONFIRMED (by design in C2) | Items were labeled wireframe bounds markers; shelf stock read flat for the same textureless reason. |

The predecessor run's `after-stats.json` also recorded 4× "Maximum update
depth exceeded" console errors. On the final bytes these do NOT reproduce:
full probe flow (load, presets, slot/cart inspect, 16× playback, 768/390,
Experiments inspection) on both the Vite dev server and the production
build produced zero React/page errors (see §7). They are treated as an
artifact of that interrupted session, and the final capture re-gates on
`errors` explicitly.

## 2. Material fidelity (per source asset)

Dataset for every row: `nvidia/simready-assets` at pinned revision
`653d91e182011f357cf1644013cc94ddf194d349`, license CC-BY-4.0 (copies in
`assets/licenses/`). Converter: `scripts/warehouse-usd-to-glb-v2.py`
(successor of the W1 script; same triangulation/bounds contract — v1↔v2
triangle counts and bounds verified identical per asset below). Selective
texture fetch: `scripts/warehouse-r1-textures-fetch.mjs` (6 files,
11,389,332 B, hashes in `assets/manifests/warehouse-r1-textures.manifest.json`).
Replacement factors: `scripts/warehouse-r1-materials.json`. Originals are
never overwritten; the renderer prefers the `-v2` sibling and falls back
per-asset to the verified v1 with a diagnostics note (never a proxy).

| Asset | v1 bytes → v2 bytes | Tris (v1=v2) | Bounds (GLB AABB, m) | v2 material mode | Loss / limitation |
|---|---|---|---|---|---|
| box_cardboard_a01 | 40,892 → 8,968,104 | 554 | 0.699×0.510×0.521 | TEXTURED: source Albedo+ORM+Normal PNGs embedded (3,577,615 / 2,858,551 / 2,476,917 B, SHA-256 in manifest) | MDL OmniPBR approximated by UsdPreviewSurface→glTF PBR; no MDL claim |
| crate_blue_a01 | 4,374,604 → 8,309,796 | 60,744 | 0.605×0.253×0.405 | TEXTURED: source Albedo+ORM+Normal embedded (822,814 / 743,855 / 909,580 B); `KHR_texture_transform` | Same MDL approximation |
| cart_luggage_platform_a01 | 13,467,192 → 17,965,452 | 186,990 | 0.671×0.953×1.219 | Splits + st UVs preserved (5 source materials); documented replacement PBR factors | Source texture closure 20,747,061 B at pinned revision NOT embedded (payload bound); surface response is a replacement |
| environment_floor_a01 | 630,164 → 841,720 | 8,738 | 6.000×0.100×6.000 | Splits + UVs (3 materials); replacement factors | Closure 172,617,737 B NOT embedded; replacement concrete/steel/yellow |
| rack_large_empty_a02 | 3,826,236 → 5,102,380 | 53,128 | 4.000×3.010×2.067 | Splits + UVs (2 materials: painted + bare steel); replacement factors | UDIM texture set (23,079,906 B) cannot be expressed in glTF; UVs preserved so a future tiled split remains possible |
| structure_wall_straight_a01 | 7,417,464 (v1 only) | 103,006 | — | Role PBR replacement (wall concrete) | No v2 attempted; textureless source conversion retained honestly |
| structure_wall_entrance_a01 | 32,534,440 (v1 only) | 451,752 | — | Role PBR replacement (entrance concrete) | Largest payload in scene; receive-only in shadow pass |
| table_packing_heavyduty_c01 | 7,099,840 (v1 only) | 98,594 | — | Role PBR replacement (packing green) | As above |

Manifests: `assets/manifests/*-v2.manifest.json` (bytes + SHA-256 verified
against the shipped GLBs in this session; all OK). Role PBR for v1
fallbacks (`warehouseRender.ts:ROLE_PBR`) distinguishes concrete floor,
wall/entrance concrete, painted rack steel, cardboard, blue plastic,
cart equipment, and packing stations by color/roughness/metalness —
material boundaries are per-source-material splits, never one flat color
for a multi-material assembly. This fallback remains an explicit
limitation, not acceptance of the old washed-out result.

## 3. Lighting, camera, readability

- Shadow-mapped key light (PCFSoft, 2048², tuned bias/normalBias),
  hemisphere + fill, `ACESFilmicToneMapping` (exposure 1.06), sRGB output.
- One-time `PMREMGenerator` + `RoomEnvironment` fill
  (`environmentIntensity` 0.5) so metal replacement PBR reads as material
  instead of near-black under direct light alone; the key light and
  contact shadows stay dominant. Carts/racks/stations/cargo cast; floor
  and shelf goods receive; entrance/walls receive only (32 MB shell never
  enters the shadow pass or occludes the room).
- Texture anisotropy raised to the device maximum on textured v2 assets.
- Front walls/roof still clipped by the existing 2.5 m cutaway plane;
  room outline, aisles, and planning area stay unobscured. No canonical
  coordinate moved for aesthetics.
- Labels: default Areas + selected/focused entity; Slots/All unchanged in
  meaning (All diagnostic). Packing now searches above AND below the
  anchor and side columns, and chips whose anchors project behind the
  camera or far off-canvas are hidden instead of clamped into edge piles.
  Final static overlaps: 0 at every captured phase/size (overview/top/
  slot/empty/loaded/unloaded, 1586/768/390, Experiments inspection). The
  All diagnostic layer in one tight inspect view measured 1 overlapping
  pair among 32 chips — recorded, not hidden.
- Inspect framing: unit distance 5 m → 3.4 m with a steeper offset
  (0.5/0.72) so loaded totes read; order→unit 8 m → 5 m. Route arrows,
  true trajectories, canonical fixed yaw unchanged (heading is R2).

## 4. Solid carried cargo

Representation (explicit): each carried item is ONE sourced generic
carton mesh (`box_cardboard_a01` v2 geometry, source cardboard textures
when the derivative loaded) non-uniformly scaled so its rendered AABB
equals the declared SKU dimensions exactly (`scale = skuDim / cartonAabb`
per axis, yaw 90° applied by the instance matrix). This is a documented
representation transform of a generic carton — not a per-SKU model, and
not a storage crate shrunk to fit. Crate-bound SKUs (per
`visualAssetRef`: P07–P12) get a cool instance tint
(`[0.78, 0.88, 1.05]`) on the same carton mesh; cardboard SKUs (P01–P06)
stay untinted. Source-texture provenance stays with the carton asset.

Contract preserved: packet `cargo-c2-centered680x1220`, 2 docks × 2 cells
(220×320×160 mm), capacity 4, cargo yaw 90°, crate interior floor
(`floorTopY` 6 mm), whole-assembly normalization, SKU dimensions and
engine stock untouched. Allocation remains `allocateCarryCells` on
committed `unit.carried`; the pure plan (`planCargoTransforms`) rejects
unknown SKU / cell misfit / overflow and the view reports them instead of
drawing valid-looking cargo. Wireframe bounds share the carton geometry
and matrices and render only on the All diagnostic layer (a unit-box
twin at carton scale would outline the wrong size — fixed). One
persistent `InstancedMesh` pool (units × capacity = 24) is created once;
snapshot updates rewrite matrices/colors only — no geometry/material
churn on the 40 ms cadence. Empty carts show labeled empty equipment.

Fit (independent recompute in `warehouseRender.test.ts`, cell rects and
AABBs re-derived, not re-calling the code under test):

| SKU | W×D×H (mm) | Yaw90 footprint in 220×320 cell | Result |
|---|---|---|---|
| P01 | 200×150×120 | 150×200 | fits |
| P02 | 300×200×150 | 200×300 | fits |
| P03 | 150×120×100 | 120×150 | fits |
| P04 | 220×160×130 | 160×220 | fits |
| P05 | 320×220×160 | 220×320 | fits (exact-fit, zero clearance — engine boundary, kept honest) |
| P06 | 140×110×90 | 110×140 | fits |
| P07 | 250×180×100 | 180×250 | fits |
| P08 | 280×190×110 | 190×280 | fits |
| P09 | 200×150×90 | 150×200 | fits |
| P10 | 290×200×120 | 200×290 | fits |
| P11 | 260×180×100 | 180×260 | fits |
| P12 | 190×140×80 | 140×190 | fits |

All 12 SKUs × all 4 cells: zero protrusion, rendered AABB equals declared
dims (6 decimal places), bottom rests on the interior floor. Empty →
0 items; partial quantity → exactly that many; 6 units → 4 drawn + overflow
reported; unknown SKU and an overfilled SKU (330×230×170) → rejected,
nothing drawn. World-center translation at a live pose (3000, 9200)
verified against the cell rect.

Browser proof (`final-stats.json` cargo cycle, PK-1):
`empty → P01#1@A0+P01#2@A1 → +P07#1@B0 → empty`, with
`data-solid-cargo` counts tracking the ledger; close-ups in
`final-1586-cart-empty/loaded/unloaded.png` and the 4× recording
`r1-engine-empty-loaded-unloaded.webm` (real engine, empty→loaded→
unloaded). At the loaded pause the inspector reads `P01 ×2 + P07 ×1 ·
3/4 cost units`, matching the drawn instances.

## 5. Runtime / performance (measured, no frame-rate claim)

Static renderer/scene/camera persist per mount; GLBs cached at module
level; cargo pooled (above). Shadow casters are bounded (shelf goods
receive-only). No source model was replaced by a procedural proxy and no
LOD/decimation was applied (that would require documented loss + fit
proof; the fidelity cost below is stated instead).

Device budget: the renderer string is inspected once at setup. On
software rasterizers (SwiftShader/llvmpipe — measured locally:
multi-second frames and renderer starvation under playback, versus
4.24 ms CPU/render on the AMD iGPU) shadow mapping and the PMREM fill
are disabled and `data-render-quality` reports
`software-reduced (shadows off, device budget)`; materials, textures,
tone mapping, geometry, and cargo are identical, and real GPUs report
`full (shadows on)`. This is a presentation-budget fallback, not a
visual acceptance mode — all screenshots and recordings here are from
the full mode in real Edge.

Scene cost is dominated by source geometry: 264 instanced shelf crates
× 60,744 tris ≈ 16.0 M of the overview total (plus 72 cartons × 554,
racks 6× 53,128, carts 6× 186,990, walls/tables). Renderer counts include
the shadow pass.

| Window (real Edge, AMD Radeon iGPU, D3D11) | Result |
|---|---|
| Overview static (1586) | 22,526,924 tris · 344 draws · 60 geometries · load ≈1150 ms |
| Active playback 6.098 s, overview camera (`final-framecost.json`) | 135 renders (22.1/s at the 40 ms snapshot cadence) · 4.24 ms CPU/render · 0 errors |
| Cargo-cycle window 4.981 s, inspect camera | 88 renders · 2.44 ms CPU/render · 19.4 M tris |

Baseline (pre-R1, same probe): 20,160,100 tris / 121 draws overview with
no shadow pass. The increase is the shadow pass plus v2 split primitives;
per-render CPU after removing a duplicated label-layout pass is in line
with baseline while adding shadows and textures. No 60 fps claim is made:
the presentation cadence is 25 Hz by design (DESIGN §11.3), and measured
render rate tracks it on this device.

## 6. Experiments / planner sharing

Experiments inspection mounts the same `OperationsPanel` →
`OperationsView`, so the improved renderer, cargo, and fallback behavior
apply there unchanged (`final-1586-experiments-inspect.png`; 0 overlaps).
Legacy planner `ThreeView` reuses only `prepareAssetGroup` for its
verified v1 rack (painted-steel role PBR; no UVs exist to texture). The
24-slot operations scenario is not substituted into the planner and no
shared state is claimed (R3).

## 7. Checks run (exact)

- `npm run typecheck` (root; core, simulation, api, web): PASS.
- `npm run build` (root): PASS.
- `npm test` at root runs core → simulation → api in sequence. Exact
  per-workspace results in this session: `@layoutlab/core` 7 files /
  111 tests PASS; `@layoutlab/simulation` 23 committed files / 252
  tests PASS (engine untouched by R1); `@layoutlab/api` 7 files / 160
  tests PASS — 523 committed tests in total. (An earlier draft of
  this section misattributed the api-only 160 as the root total; the
  per-workspace counts above are the corrected record.) The root
  chain currently also reports 1 failed suite,
  `layout-draft/test/layout-draft.test.mjs` ("No test suite found in
  file"): that is the parallel L0 worker's uncommitted WIP namespace,
  not a committed engine test and not an R1 file; all 23 committed
  simulation files pass.
- Web unit (web has no `test` script; run through the simulation
  workspace vitest runner from the repo root):
  `npx --prefix packages/simulation vitest run --root . apps/web/src/lib/warehouseRender.test.ts apps/web/src/lib/operations.test.ts apps/web/src/lib/storageAnchors.test.ts`
  → 46 PASS (`warehouseRender.test.ts` 10, incl. all-12-SKU fit,
  empty/partial/overflow/unknown/misfit, world-pose translation;
  `operations.test.ts` 22; `storageAnchors.test.ts` 14).
- E2E (targeted, real Edge `M3C_CHANNEL=msedge`, desktop project):
  operations-environment, m3c-operations-playback,
  m3c-operations-evidence, experiments, r1-storage-anchors.
  History: the first full run scored 34 passed / 2 failed. Both
  failures were one stale assertion (history, now corrected): the
  specs polled `ops-state-badge` for "STAGE COMPLETE", but the app
  has shown "COMPLETE · SHIPPED" for `SUPPORTED_STAGE_COMPLETE`
  since commit 2e08925 (verified in git; R1 never touched badge
  copy), while the runs themselves reached completion with parity
  intact. The two cases were then corrected to the actual
  supported-stage/shipped semantics — badge "COMPLETE · SHIPPED",
  exact on-screen shipped/backlog counts (`6 orders SHIPPED`,
  `unshipped backlog 0`, `stage backlog 0`, metric `6 / 0`), plus
  the existing headless stage (`SUPPORTED_STAGE_COMPLETE`) and
  signature parity at the same clock; a plain-language Completed
  badge in a future UI must keep those underlying count checks.
  Rerun solo in Edge after the correction: "playback recording to
  stage completion" PASS (37 s, exact clock 504343 ms) and "speeds
  reach stage completion with exact parity" PASS (42 s) — the
  targeted set is now fully green. Every R1-relevant gate passed,
  including "loaded operations evidence with exact parity",
  "loaded-cart closeup on a crated unit with exact parity",
  "playback performance over real renders with renderer facts",
  "responsive evidence at tablet 768 and narrow 390", all
  Experiments inspection tests, and the full R1 storage-anchor /
  planner camera / label suite. An earlier default-Chromium run of
  the same set under parallel capture load timed out in software GL;
  the documented evidence lane for this repo is real Edge, and the
  software-reduced mode above is the device-budget answer there.
- Historical-artifact preservation: tracked `m3c-final-*` / `e4b-*`
  captures under `evidence/sanitized/` are byte-identical to HEAD
  (verified: empty `git diff HEAD -- evidence/`; no blanket reset —
  per-path restore only). Disclosure: bytes regenerated by the
  first full run in the prior session were restored without
  preservation before this gate existed. From this gate on, new
  captures use the R1 override (`M3C_EVIDENCE_PREFIX=r1-regression`)
  and are preserved first under `evidence/r1/regression/` (this
  gate: `r1-regression-playback-1440-edge.webm`, 4,272,784 B, with
  `M3C_VIDEO=on`) before any tracked name is restored.
- Browser evidence: `node .coordination/r1-capture-final.mjs` +
  `r1-framecost.mjs` (real msedge, headless): parity + frame cost above;
  `errors` contains only 2 offline `/api` status probes (502 from the
  Vite proxy with no API server running) in the Experiments context —
  zero page errors, zero React errors, zero renderer errors.
- Engine parity: Reset → Step ×25 twice → identical
  `data-ops-signature` and clock (29200) in the browser; presentation
  reads snapshots only and never writes engine state. Git confirms no
  changes under `packages/`, `fixtures/`, or scenario JSON.

Screenshots (`evidence/r1/final-*`): overview/top/slot/cart-empty/
cart-loaded/cart-unloaded at 1586, overview at 768 and 390 (warehouse
scrolled into view — the predecessor 390 capture showed only the header
and is superseded), Experiments inspection at 1586. Before/after pairs
(`baseline-*` vs `final-*`) share viewport/camera/engine windows.

## 8. Limitations and remaining gaps

- Source MDL (OmniPBR) fidelity is claimed nowhere: box/crate use the
  UsdPreviewSurface approximation; floor/rack/cart use documented
  replacement factors (closures 172 MB / UDIM 23 MB / 20.7 MB not
  embedded). Walls/entrance/packing tables remain v1 textureless with
  role PBR.
- Overview triangle count (22.5 M) is the price of un-decimated source
  crates; measured cost is stated in §5. Any future LOD must document
  source/visual loss and re-prove cargo/shelf fit.
- P05 is an exact-fit SKU (220×320 footprint = cell): fits with zero
  clearance by the unchanged C2 contract; any future SKU growth fails
  closed visibly rather than rendering.
- All-layer diagnostic labels can still overlap by 1 pair in a tight
  inspect view (32 chips); default layers measure 0.
- No human figures, walking, turning, or heading rotation (R2); carts
  keep canonical yaw. No shared planner/operations state or full-shift
  execution (R3).

## 9. Boundary for the unified workspace / layout editing (future)

`OperationsView` public props stay reusable as-is:
`{ scene, snapshot, selection, labelLayer, onStats }` with selection
kinds `location | rack | unit | resource | order` (ids are the canonical
fixture ids) and `data-*` instrumentation (selection, anchors, carry,
solid-cargo, camera). For future direct object picking, instance mapping
already exists: cargo pool instance *i* ↔ `planCargoTransforms` item *i*
(unit, SKU, crate, cell); shelf `ContainerMeshState.items[i].locId` per
InstancedMesh entry; `cartOf` maps unit id → cart group; rack/floor
InstancedMesh indices follow `ops.racks` / `ops.floorTiles` order.

Renderer assumptions a candidate-aware layout layer must revisit (no
change made here): entrance label literals at (4, 2.7, 17.2) /
(20, 2.7, 17.2) in `OperationsView`; the 2.5 m cutaway plane constant;
`assertDerivedFixtureCompatible` (operations.ts) refusing any spatial
drift from the main-warehouse fixture — editable candidates must derive
bindings from candidate geometry instead; camera home already derives
from `roomMm`. Carry-packet bounds are equipment-local and unaffected by
warehouse layout edits.

Ownership freeze after this gate: `OperationsPanel.tsx` and `DESIGN.md`
are finished and frozen for the U1 unified-workspace worker (app shell,
contextual panel, CSS, selection integration). `OperationsView.tsx`,
`warehouseRender.ts`, and the source/v2 assets remain the R1 renderer
boundary until final coordinator acceptance; any further renderer
quality correction routes through the coordinator rather than
overlapping U1.

## Coordinator acceptance (2026-11-04)

Accepted as the bounded renderer/material/solid-cargo milestone. Independent
world-space triangle/winding multiset checks show all five v2 assets preserve
v1 geometry and bounds at micrometre precision; derivative and embedded-image
hashes match manifests. Evidence: independent-geometry-review.json in evidence/r1.
Final overview and loaded-cart captures were visually inspected; solid cargo
is visible inside source totes. Material replacements and lack of humans are
explicit remaining scope, not source-fidelity or full-physics claims.

The L0 Node test file became committed during this review. Its runner collision
was resolved by naming it layout-draft.check.mjs and retaining the explicit
node:test command; no test was removed. Coordinator reran L0:20/20, and the
ordinary simulation Vitest suite serially:23 files/252 tests, no failed suite.
The earlier WIP attribution above is historical. R1's two corrected Edge cases
remain passing. Renderer files are released for U1 selection/layout integration;
engine behavior integration is owned separately by R3c.
