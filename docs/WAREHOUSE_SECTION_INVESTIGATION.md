# W1 warehouse section investigation — SimReady original catalog

Isolated representative static section from the ORIGINAL SimReady Central catalog
(Structures, Racks, Containers, plus one Equipment cart per the V3-M1 update).
No change to the main app, current scene, core, API, benchmarks, R2 files, or `.env`.

Status: original W1 was reported but NOT accepted; this is the review-revision
(`warehouse-section-r2` fixture) addressing six independent Codex findings.
W1 as a whole is not accepted; Codex reviews.

## 1. Scope and authority updates applied mid-run

- Original W1: floor, wall, one rack with shelf slots, one product in a shelf,
  aisle + one pick approach, packing marker; isolated preview only.
- Coordinator update 1 (msg_573b6f8c3748): align with V3-M1 (several stored
  containers, one worker/cart unit, pick point + receiving/packing, explicit
  quantities); Equipment inspected after Structures/Racks/Containers; the 64 MB
  source cap REMOVED (still inspect BOM/closure before large fetches, verify
  hashes/licenses); prefer original portal models over hand-made props; custom
  replacement of a catalog component needs a coordinator decision.
- Coordinator update 2 (msg_daae286cd627): Orca browser allowed for app testing.
  W1 acceptance stayed on external Edge because verification was already
  running there; no browser substitution occurred.
- Review revision (this dispatch): sole-coder fixes inside owned W1 paths only.
  Main app/R2/core/API/benchmarks/`.env` read-only; no commit/push/paid calls.
  Browser: external Edge again (truthfully recorded in §8); Orca browser was
  allowed but not needed.

## 2. Sources (all read-only inputs preserved)

- Discovery: https://huggingface.co/spaces/nvidia/simready-central, source pin
  `15a2ab916b355627dee6a841c1ae622230cf1ba5`.
- Live catalog snapshot `.coordination/catalog-inspection/install_categories.json`
  (2.49 MB): Industrial/Warehouse Structures 22, Racks 34, Containers 318,
  Equipment 66. Per-package source revision `653d91e182011f357cf1644013cc94ddf194d349`
  for every selected package (NOT conflated with dataset HEAD / existing-rack pin
  `4763fbfaa4f8e97658e68b57d01b4c86659e08b5`).
- Alternative: `nvidia/PhysicalAI-SimReady-Warehouse-01@`
  `c7fe115cb79c7ddbd0532630d7768b5736b0ecc4` (CC-BY-4.0, ~15 GB, 753 assets).

## 3. Candidate evaluation (contents verified, not labels)

Minimal closure per package = root `sm_*.usd` + `base.usda` + `instances.usda`
+ `geometries.usd` + `materials.usda` + `Physics/physics.usda` (no textures,
no physics variants, no thumbnails). All staged bytes SHA-256-verified vs BOM
(+ first-MiB where the BOM lists it).

| Package | Category | Closure bytes | Geometry bytes | Verdict |
|---|---|---|---|---|
| environment_floor_a01 | Structures | 681,432 | 605,998 | SELECTED: 1 mesh, 6.0×6.0×0.10 m, exact room fit |
| structure_wall_straight_a01 | Structures | 5,148,648 | 4,764,906 | SELECTED: 1 mesh, 0.74×6.0×11.1 m, perimeter only |
| structure_wall_entrance_a01 | Structures | ~29.2 MB | 20,227,121 + 8.9 MB instances | rejected: 2.21 GB package, oversized for one section |
| rack_large_empty_a02 | Racks | 2,451,533 | 2,393,234 | SELECTED: 1 mesh + 3 FULL shelf decks (see below) |
| rack_h3m_s01 | Racks | ~17.7 MB | 17,567,403 | rejected: 17 MB geometry, unneeded after a02 verified |
| shelve_steel_heavyDuty_a06 | Racks | ~14.4 MB | 14,297,802 | standby, unneeded after a02 verified |
| storage_shelf_basic_a01 | Racks | ~49.2 MB | 49,110,128 | rejected: 49 MB geometry alone |
| box_cardboard_a01 | Containers | 97,484 | 38,587 | SELECTED: 1 mesh, 699×521×510 mm |
| crate_blue_a01 | Containers | 3,523,098 | 3,464,319 | SELECTED: 1 mesh, 605×405×253 mm, lattice sides |
| handTruck_convertible_steel_orange_a01 | Equipment | 6,258,225 | 6,120,564 | SELECTED cart (smallest warehouse-typical option) |
| cart_luggage_platform_a01 | Equipment | ~10.5 MB | 10,414,196 | rejected: larger than hand truck |
| palletJack_lowProfile_a01 | Equipment | ~10.1 MB | 9,999,165 | rejected: larger than hand truck |
| equipment_utility_cart_e01 | Equipment | ~17.3 MB | 17,202,220 | rejected: larger than hand truck |
| trolley_instrument_b01 | Equipment | ~5.5 MB | 5,404,109 | rejected: medical-style, less warehouse-typical |
| equipment_robot_trolley_a01 | Equipment | ~134 MB | 133,946,646 | rejected: 134 MB geometry |

Total staged source: 18,160,420 bytes (36 files). Full packages sum to
~1.36 GB; downloaded subset is ~1.3% (geometry + structure only).

Observed source facts (usd-core 26.11, every asset): meters, Z-up,
default prim `/RootNode`, face-varying normals, UVs present,
subdivision none, double-sided. Five assets are single-occurrence with
identity (or near-identity, crate +0.08 mm Z) instance transforms; the hand
truck is 11 occurrences (wheels, frame, handle, body, locks, mounts) with
per-part translations — the M4 single-mesh converter provably does not cover
it, so a general converter was written (section 5). Real assets contain a few
concave n-gons (box 1, crate 4, cart 12 faces) and slightly non-planar
authored quads; the converter ear-clips concave faces instead of fanning them.

Shelf proof (rack_large_empty_a02): horizontal-face clusters at source Z
0.45/1.58/2.33 m spanning ~3.7–3.9 × 1.99 m each — three full-span shelf
decks, not just beams. "Empty" means unstocked, not shelf-less.

Materials observed (all pair UsdPreviewSurface with `mdl:OmniPBR`):
floor 3, wall 8, rack 2, box 1, crate 1, hand truck 7 (see manifests).
Textures/MDL never downloaded; GLBs use documented fallback colors.

## 4. Alternative comparison (metadata-only, no dataset download)

Root `physical_ai_simready_warehouse_01.usd` (27,933 B, staged) opened with
`Usd.Stage.LoadNone`: default prim `/World`, 6 sublayer paths
(transporter/floorplan/metro_racks/unloading/sorting/loading), only 9 prims
without sublayers (World + environment lights). Sublayers total ~10.4 MB and
reference into `Props/` (753 assets, ~15 GB).

Bounded supported recommendation: for THIS one bounded static section, the
original-catalog parts are the supported choice — bounded 18 MB closure,
explicit per-file BOM hashes, single-package provenance, and no Props chase.
The prebuilt scene stays a valid alternative for later full-warehouse work;
it was compared metadata-only (root + sublayer listing, no dataset download),
so no claim is made about its geometry quality or suitability beyond that.
No entry from the alternative repo was found in the inspected install-index
snapshot (not claimed universally undiscoverable).

## 5. Conversion (actual bytes, occurrence-preserving tool)

`scripts/warehouse-section-usd-to-glb.py`: EVERY mesh occurrence via
instance-proxy traversal (repeated, nested, and directly-placed meshes each
emit their own triangles; no prototype-path dedup, no buffer dedup),
per-occurrence world matrices, rigid rotation+translation only (orthonormal
3x3, det +1, verified per occurrence; mirror/scale/shear fail explicitly),
normals rotated (never rescaled), triangles pass through, convex n-gons
fan-triangulated behind a simplicity gate (same-sign turns plus no edge
intersection/spike, else the self-intersecting face fails explicitly
instead of a silent wrong fan), concave n-gons ear-clipped in the
Newell-plane projection with output triangles mapped back to the authored
CW/CCW winding on every projection axis (repeated-corner, zero-area, and
unclippable faces fail explicitly),
face-varying normals per corner as a non-indexed soup, Z-up → Y-up
`(x,y,z)→(x,z,−y)` (det +1), ground preserved, no scale baked, one fallback
PBR color per asset. Every GLB asserts transformed bounds within 1 mm of the
axis-mapped source bounds.

| Derivative | Bytes | SHA-256 (prefix) | Triangles | Meshes |
|---|---|---|---|---|
| environment_floor_a01.glb | 630,164 | `dae36407…` | 8,738 | 1 |
| structure_wall_straight_a01.glb | 7,417,464 | `edde447d…` | 103,006 | 1 |
| rack_large_empty_a02.glb | 3,826,236 | `dff23ba8…` | 53,128 | 1 |
| box_cardboard_a01.glb | 40,892 | `b080b7d7…` | 554 | 1 |
| crate_blue_a01.glb | 4,374,604 | `dc2a0cc3…` | 60,744 | 1 |
| handTruck_convertible_steel_orange_a01.glb | 7,853,028 | `fda5e791…` | 108,976 | 11 |
| Total browser payload | 24,142,388 (23.02 MB) | — | 335,146 | 16 |

Floor/wall/rack/box reconversions are byte-identical (no CW concave faces,
fan gate clean). Crate/cart bytes changed ONLY in triangle corner order on
their 2/7 CW-wound concave faces (same vertex set, same counts, same
bounds, identical GLB JSON); hashes refreshed in manifests and provenance
accordingly. Triangle counts match the coordinator's independent occurrence
traversal exactly (hand truck 11 occurrences / 108,976 triangles: no part
was lost).

`scripts/warehouse-section-verify.mjs`: asserts bytes + SHA-256 + triangles +
mesh count vs tracked manifests, container/chunk-length integrity, TRIANGLES
mode, POSITION/NORMAL parity, buffer ranges, and authored POSITION min/max vs
actual buffer scan (1-micron tolerance for float64→float32 quantization);
plus corruption + tampered-length negatives in scratch — PASS.
`scripts/warehouse-section-converter-regression.py`: 14/14 (repeated
same-bounds instance, nested/transformed occurrences, concave ear-clip area
check, literal signed-winding CW/CCW cases on XY/XZ/YZ planes with
normal-consistency checks, valid pentagon, mirror / non-uniform-scale /
bow-tie / star explicit rejections) — PASS.
Full hashes and per-file source tables live in
`assets/manifests/warehouse-section-*.json`; license copies in
`assets/licenses/warehouse-section-*-LICENSE.txt`.

Discarded everywhere (explicit): physics payloads/variants, mass/CoM, MDL +
textures, UVs, per-material splits (merged), validation metadata.

Payload note: 24.14 MB staged source 18.16 MB is the measured W1 trade-off
for six full-fidelity sourced assets; no Draco/meshopt was installed just to
lower the number. Local load measured 521–858 ms for all 6 GLBs. No
decimation, no texture substitution.

## 6. Section fixture (synthetic W1 fixture, canonical coordinates preserved)

`experiments/warehouse-section/fixture.json` (`warehouse-section-r2`) is a
separate synthetic W1 fixture: room 6000×6000, rack R1 (1300,1500)
1600×800×2000 yaw 0, L1/L2 usable 800×600×1000 with canonical picks
(2900,1500)/(1300,2700), and packing (3000,3000) are preserved exactly from
`fixtures/sample/warehouse-basic.json` (which is untouched). Product bounds
are NOT the canonical nominal: they are ceiling integers of the measured
sourced-container geometry and are the fit authority here.

- Anchors (width-row, n=2, yaw 0): L1 (900,1500), L2 (1700,1500).
- Scaled shelf decks (Y-scale 2000/3010.001): 0.299/1.050/1.548 m.
- Products: sku-a unit 700×522×510 = ceil(box 699.435×521.152×509.927);
  sku-b unit 606×406×254 = ceil(crate 605.133×405.133×253.219). The canonical
  500×400×600 nominal is recorded only for traceability and is rejected as
  fit authority by the fit proof.
- Assignments with explicit quantities: L1 ← sku-a ×1 (box, deck 0);
  L2 ← sku-b ×2 (crates stacked on deck 0, offsets 0 / 253.219 mm
  source-normalized crate height, aggregate top 805.5 mm). Container visuals
  render at TRUE size (uniform 1.0, aspect preserved) — actual transformed
  AABBs verify full3Dfit inside the slot volumes in X/Y/Z, tops
  808.9/552.3/805.5 mm clear the next decks by 240.9/497.5/244.3 mm.
  Nothing was shrunk to hide a fit error. Three sourced containers total.
- Slot volumes: usable W×D about each anchor, Y 299.003–1299.003 mm.
  Declared tolerances: 0.01 mm buffer-noise epsilon, 0.5 mm face-contact
  tolerance for stacking (no downward rounding as authority).
- CART-HT1 hand truck parked (4200,2300) in explicit bay x 3900..4500,
  z 2100..2700 (actual footprint X 3949.5..4450.5, Z 2173.1..2653.7 inside
  the bay), clear of R1, the L1 pick marker, packing, and the PACK→L1
  approach corridor. Storage and approach references stay distinct.
- Floor true 6×6 slab top at y=0; wall true scale at (−0.34,0,6.0), world x
  −0.740..−0.000 adjacent to the west room edge (maxX aligned to 0 from
  measured bounds), display-only cutaway above 2.5 m (source 11.100 m height
  recorded, not rescaled), outside evaluator geometry.

Fit proof `scripts/warehouse-section-fit.mjs` (actual POSITION-buffer AABBs
vs slot volumes, shelf clearance, non-overlap, aggregates, plus an old-height
negative reproducing the 4.132 mm excess and a nominal-mismatch rejection) —
PASS. Nav proof `scripts/warehouse-section-nav-proof.mjs` (probe-only parked
occupancy adapter over unmodified core helpers, scenario bound to fixture/canonical data with literals asserted; 17-point / 1600 mm PACK→L1
path, all 16 swept segments avoid inflated R1 + inflated cart; old-bay + moved-rack negatives rejected; explicit 700 mm radius from cart 600×800+100 / passage
1400) — PASS as a static diagnostic, not multi-agent-safety validation.

## 7. Isolated preview (owned paths only)

- `experiments/warehouse-section/` — `index.html`, `main.js`, `fixture.json`.
  Three.js r0.187 via import map to the workspace-hoisted install (no CDN,
  no new packages). Views: isometric open-roof, top plan, inspect-selected;
  L1/L2 selection with slot/pick/fit readout; orbit/zoom; on-demand
  rendering (renders on load, view change, orbit — no animation loop).
  Inspector says full3Dfit only after X/Y/Z + deck clearance all pass,
  else footprint-only/exceeds (data-fit-l1/l2 attributes carry the verdicts
  for the gates; the authoritative actual-AABB proof is the fit script).
- `scripts/warehouse-section-serve.mjs` — loopback server (127.0.0.1:5183):
  `/` preview, `/fixture-assets/` GLBs, `/vendor/three/` existing install.
- Fetch `scripts/warehouse-section-fetch.mjs` + tracked
  `scripts/warehouse-section-fetch-closure.json`: exact 36-file pinned
  closure (18,160,420 bytes), bytes summed before network, per-file
  size+SHA verified, no private-scratch prerequisite; fresh empty-scratch
  reproduction verified byte-identical (36/36).
- Sourced vs custom: all 6 meshes are converted NVIDIA geometry; boundary
  loop, slot outlines, bay outline, approach sphere, PACK cube, leaders, and
  text chips are labeled custom display-only annotations. No route arrows, no
  cart animation, no roof/front walls, no internal obstacles. The main app
  never loads these files (separate server + separate directory).

## 8. External Edge verification (only browser used for acceptance)

Method: installed Playwright `chromium.launch({channel:'msedge',headless:false})`,
temporary test profile (no user cookies/passwords), 1440×900 viewport,
`scripts/warehouse-section-edge.mjs`. No Chromium/headless fallback, no
Orca-browser evidence relabeled. (Orca browser was allowed for this dispatch;
external Edge was used; the metrics file records the actual browser.)

- Browser: Microsoft Edge 156.0.4314.58, UA
  `…Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0` (Edg verified in-page).
- Gates asserted structurally (data attributes + measured chip rects, never
  UI-text substrings): `data-anchors="L1:900,1500;L2:1700,1500"`,
  `data-fit-l1/l2="full3Dfit"`, `data-cutaway="2.5"`, L1 slot (900,1500) +
  pick (2900,1500), L2 slot (1700,1500) + sku-b ×2, top-view L1/L2 chips
  visible and non-overlapping, 6 GLB requests, zero page console errors.
- Evidence: `evidence/sanitized/w1-iso.png`, `w1-top.png`,
  `w1-inspect-l2.png`, `w1-metrics.json` (+ `w1-provenance.json`). Every
  screenshot was opened and read; iso shows the complete floor with padding,
  adjacent cutaway wall, rack/containers/cart/packing readable; top keeps
  identifiable L1/L2 anchors with leaders; inspect stays useful.
- This machine: GLB bytes 24,142,388 (matches §5 exactly), triangles
  396,382 (scene total incl. 2nd crate instance + annotations), draw calls
  24, geometries 23; load 763–858 ms this run (521–858 ms across runs).
  Rendering is on-demand, so no FPS benchmark is claimed (idle loop
  measurements would be meaningless).

## 9. Regression checks

- `@layoutlab/core` suite: prior 111/111 evidence reused (core untouched by
  this probe-only revision; no rerun wasted). Baseline 36800 mm / heuristic
  29800 mm and frozen benchmark hashes unchanged (no core/fixture edits).
- `node --check` on all new JS + JSON parse on fixture/closure/manifests/metrics — OK.
- `scripts/warehouse-section-{fetch,verify,fit,nav-proof}` + converter
  regression — all PASS (see §§5–7).
- `git status`: new/owned-path changes only (W1 preview/scripts/manifests/
  GLBs/docs/evidence); R2 working-tree changes and coordinator-side doc edits
  untouched; no commit/push.
- Coordinator staging review: code/docs whitespace check passes; the six
  verbatim upstream license copies retain their trailing blank line, which
  produces the corresponding `blank line at EOF` warnings. Application key
  and private preview credentials were checked against staged content without
  printing either; neither is included.

## 10. Unsupported features / blockers / recommendation

- Unsupported (recorded, not hidden): MDL/OmniPBR materials, all PNG/UDIM
  textures, UVs, physics/colliders/mass, per-material splits, validation
  metadata. Visuals are flat fallback colors; crate lattice and rack decks
  still read clearly as real geometry. Converter verified scope: rigid rotation+translation only
  (mirror/scale/shear fail explicitly); triangles pass through; convex
  n-gons fan-triangulated behind a simplicity gate (same-sign turns plus
  no edge intersection/spike; self-intersecting polygons such as the
  5-point star fail explicitly, never a silent wrong fan); concave simple
  n-gons ear-clipped with authored CW/CCW winding preserved on every
  projection axis (literal signed-area regressions on XY/XZ/YZ planes,
  carried normals verified consistent with output geometry); repeated
  corners, zero-area faces, and unclippable faces fail explicitly.
- Remaining converter limits: slightly non-planar authored quads are
  triangulated in their Newell-plane projection (documented approximation,
  sub-mm on the selected assets; 4 tiny lock-detail quads on the hand
  truck have self-crossing projections and are ear-clipped as projected
  with vertex set and bounds exact); triangle faces are not independently
  validated for degeneracy. No Draco/meshopt, no decimation, no texture
  substitution, no new conversion framework or dependency.
- Nav proof is a static single-section diagnostic (one PACK->L1 path with
  parked-cart occupancy over unmodified core helpers; scenario bound to
  fixture room/racks + canonical moving profile, literals asserted, two
  negatives), not multi-agent safety validation; no dynamic traffic
  engine, no core/schema changes.
- Payload 24.14 MB / staged source 18.16 MB is the measured W1 trade-off;
  local load measured 521-858 ms for all 6 GLBs. Rendering is on-demand,
  so no FPS benchmark is claimed.
- Coordinator acceptance (2026-11-03): W1 is accepted for these six selected
  source assets and this single static representative fixture. The coordinator
  independently checked all36 staged source files /18,160,420 bytes, actual
  GLB position buffers and manifest hashes, all-axis container volumes and
  unit ceilings, and16 swept segments with a separate slab-intersection
  predicate. Independent CW/CCW/star counterexamples now behave as specified.
  The14 converter regressions and fit/nav/manifest-corruption checks passed;
  a fresh external Edge run recaptured all three views from the final asset
  bytes (652ms local load in that run). Frozen benchmark hashes matched.
- This accepts the disclosed lock-detail projected triangulation
  approximations for the selected visual assets only. It does not certify a
  universal USD/polygon converter, SimReady physics, multi-agent movement,
  mobile/remote performance, the full warehouse, or the operations engine.
  Evidence: `evidence/sanitized/w1-independent-review.json` plus refreshed
  `w1-metrics.json` and screenshots. Full integration and operational engine
  work proceed through the separate v3 gates.
