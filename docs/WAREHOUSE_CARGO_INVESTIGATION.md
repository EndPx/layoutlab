# Warehouse cargo investigation (C1): sourced picking cart + carrying container

> C2 status (2026-11-03): this C1 record is preserved as written; its false
> claims are corrected in §11 (seam, capacity, profile, deck, frame zones,
> arrangements) and integration is done and proven. See
> docs/V3_CARGO_C2_INTEGRATION_REVIEW.md for the integrated record.

Status: C1 proposal complete, Codex review pending. Nothing here is integrated:
no UI, simulation, canonical fixture, binding, benchmark, or env change was made.
The old hand truck stays the fallback/diagnostic until a follow-up (C2) integrates
the reviewed asset + profile and recalibrates navigation/slots.

Coordinator review: selected source geometry/deck support is accepted, but
the original capacity8/profile1320 proposal below is superseded for C2.
Independent scan matched186990 GLB triangles and all6 pinned source files
(10517375 bytes);25 support rays through actual GLB triangles hit the deck
at290.72893..290.72898mm. License copy is byte-identical to the previously
verified CC-BY-4.0 source license. See cargo-c1-independent-review.json.

C2 decision: translate the WHOLE cart/cargo assembly by +41.02388mm in GLB Z
to center its footprint, with no scaling. The measured centered Z bounds are
approximately +/-609.5458mm, supporting680x1220+100 (r799). Capacity is4
configured item/handling units, not8: each of2 crates has2 fixed220x320x160mm
cells, within the580x380x247 interior, and every current SKU fits a cell with
cargo yaw90. Eight P05 items would require563200mm2 of floor area vs440800
available and cannot form2 layers below247mm, so the original8u extrapolation
is not a general capacity proof. This is a conservative constructed capacity,
not a vendor weight rating or a maximum packing result.

C2 must replace the tiny crate-seam penetration with positive separation,
derive demands/dimensions from canonical data, integrate the actual asset,
and revalidate navigation/queues/full six-order run. No integration or whole
M3c acceptance is established by this source review alone.

## 1. Decision

- Cart: `cart_luggage_platform_a01` (SimReady original, CC-BY-4.0, rev
  `653d91e1`), whole bounds 671 x 1219 x 953mm.
- Carrying container: reuse the W1-accepted `crate_blue_a01` (605 x 405 x 253mm,
  open crate, interior 580 x 380 x 247mm) — no new container source needed.
- Deck: flat platform at 290.7mm over X +/-310 x cart-Y -505..+565
  (620 x 1070mm), witnessed by vertical-ray hits, not by maxY or bounding box.
- Two verified carry slots: crate bases at (0, 290.7, +/-202.5)mm, yaw 0.
  Full crate bottoms rest on the flat deck (zero overhang), 32/100mm clear of
  the end frames, 0.1mm seam contact (within the 1mm tolerance, logged).
- All 6 burst orders fit as declared single-layer arrangements on the crate
  floor (max top 166mm < 253mm rim, face contact allowed, no stacking, no
  protrusion). B-03 uses both slots; every other order uses one.
- Proposed unit profile: 680 x 1320 + 100 (origin-centered, r843). This is a
  measured-exact proposal (cart spans X +/-335.7, Y -568.5..+650.6 about its
  authored origin); the known 700x1300/r839 nav/slot failures already show a
  larger profile needs C2 recalibration — C1 does not silently install it.
- Proposed constructed capacity: 8 units (2 verified slots x 4 max units per
  constructed slot-load). All burst orders are <= 4 units, so all 6 are
  preserved. This replaces the unproven 96u; it is NOT a vendor payload rating
  (no kg claim anywhere).
- The e01 utility-cart + small-tote path was measured first and is BLOCKED:
  e01 trays are ~500x300 with ~305mm clearances, and 19 sourced tote candidates
  were fetched, BOM-verified, and measured without one fitting (section 2).

## 2. Equipment_utility_cart_e01: exact measurement + unsupported step

Method: `scripts/m4-usd-inspect.py` inventory + private vertical-ray probes
(fan-triangulated Moller-Trumbore over all 252,048 base-mesh triangles;
corner-count probes were misleading because large flat quads carry few
corners — the raycast is the ground truth here), plus a converted-GLB browser
render (`evidence/sanitized/cargo-c1-e01-utility-cart-iso.png`).

Cart-local Z-up, identity instance transform (local == world), meters:

| Part | Measurement (mm) |
|---|---|
| Whole cart | X -401.2..+452.8 (854), Y +/-206.1 (412), Z 0..907.2 |
| Bottom tray floor | top 127.5 (panel 120.4..127.5), flat, spans X +/-250, Y +/-150 at 25mm scan (walls between 250..275 / 150..175) |
| Bottom tray rim | top ~214.1 (lips ~86 above floor) |
| Mid tray floor | top 438.1 (panel 431.0..438.1), same spans |
| Mid tray rim | top ~524.7 (lips ~86 above floor) |
| Bottom clearance | 127.5 -> 431.0 = 303.5 |
| Mid clearance | 438.1 -> 745.5 = 307.4 |
| Top tray | molded 792..820 with compartments + rim/handle to 907 — NOT a flat deck, excluded |
| Integral bins | binBig 159x222x205, bin 96x220x82 — far too small for 150..320mm items |
| Wheels | 4 casters, Z 0..75, X -297..+368, Y +/-167..190 |

Required tote envelope: footprint <= ~490x290, height <= ~290, open-top,
interior holding 3-4 items up to 320x220x160. Result of the bounded search
(all rev 653d91e1, all CC-BY-4.0, closures BOM-verified, whole bounds in mm):

| Round | Candidate | Bounds XxYxZ | Verdict |
|---|---|---|---|
| 1 | crate_blue_a02 | 612x412x240 | footprint too big |
| 1 | crate_green_a20 | 612x412x90 | footprint too big |
| 1 | container_gray_c04 | 600x400x428, lidded | footprint too big + lid |
| 1 | box_cardboard_open_a01 | 636x512x302 | too big |
| 1 | box_cardboard_open_a02 | 621x505x302 | too big |
| 2 | container_recycle_blue_b02 | 719x621x749, lidded | too big + lid |
| 2 | trashCan_office_gray_a03 | 400x300x500 | 500 tall vs 303/307 clearance |
| 2 | box_glove_a01 | 178x117x56 | too small for any item |
| 2 | crate_plywood_b01 | 1002x1009x1017 | far too big |
| 3 | storage_box_c01 | 474x547x408, lidded case | footprint + lid |
| 3 | trash_a01 | 388x290x585 | 585 tall vs clearance |
| 3 | waste_recycling_container_a01 | 495x529x827, wheeled | far too big |
| 3 | serviceTool_oil_pan_a01 | 389x220x77 open pan | footprint fits, but 220 outer depth < 220 item depth, so no 320x220 item fits inside (interior < exterior always) |
| 4 | serviceTool_oil_pan_b01 | 559x463x164 | footprint too big |
| 4 | serviceTool_oil_pan_c01 | 437x328x398 | 398 tall + 328 deep vs ~300 |
| 4 | trash_a02 | 400x300x500 | 500 tall vs clearance |
| 4 | trash_a03 | 375x265x434 | 434 tall vs clearance |
| 5 | container_plastic_grit_blue_b01 | 1553x1217x1724, wheeled+lidded | far too big |
| 5 | box_composition_open_a09 | 616x505x302 open box | footprint too big |

The remaining cached carts cannot substitute: luggage 671x1219 (kept, see
section 3), rolling dolly 1159x610, mobile 940x671, medical 753x906, catering
1058x483 all exceed 600x900/any tight profile, and mechanic_tool_cart
371.4x902.6 exceeds 900 by 2.6mm exactly (plus it is drawers, not a deck).
Per coordinator redirect, the catalog sweep stopped here: no compatible e01
pair exists in the measured set, and the exact unsupported step is
"tote footprint <= ~490x290 with height <= ~290 and 320x220x160 item capacity".

## 3. Selected cart: luggage platform deck/support (witnessed)

Source: `nvidia/simready-assets@653d91e1`, package `cart_luggage_platform_a01`
(55,024,735-byte package; staged 6-file closure 10,517,375 bytes, all
BOM-verified; LICENSE sha identical to the W1 copy). Stage: meters, Z-up,
defaultPrim /RootNode. 6 meshes / 102,398 faces: platform+frames (identity
transform), 3 tires + 2 hubs at rigid offset transforms.

| Item | Measurement (mm, cart-local Z-up) |
|---|---|
| Whole bounds | X +/-335.7 (671.5), Y -568.5..+650.6 (1219.1), Z 0..952.5 |
| Deck plane | 290.7 flat (panel 285.8..290.7), over X +/-310, Y -505..+565 (620 x 1070) |
| -Y push handle | posts X +/-220..250, frame tubes to y -437 inner edge; top rail y -565..-540 at 921..952 (cantilevered past deck end) |
| +Y end frame | tube assembly, inner edge ~+505 at center; deck flat continues to +565 |
| Wheels | Y- tire pair X +/-262, Y -518..-314; Y+ tires/hubs Y +435..+651 (casters overhang the deck end by ~71) |
| Origin/axes | origin at floor center-X; Y asymmetric about origin (-568.5..+650.6) because of the +Y caster overhang; Z 0 at tire bottoms |
| Under-deck | support frame 239..243, axles/wheels below — no cargo contact |

GLB (Y-up) mapping `(x,y,z)Z -> (x,z,-y)Y` verified within 1mm:
x +/-335.725, y 0..952.532, z -650.570..+568.522; 6 meshes, 186,990 tris.

## 4. Carry slots + per-order constructed loads

Crate `crate_blue_a01` (W1-accepted, byte-identical reuse): outer
605.133 x 405.133 x 253.219; measured interior X +/-290, Z +/-190, floor top
+6.0, rim 253.3 (580 x 380 x 247 usable). Slots (yaw 0): A (0, 290.7, +202.5),
B (0, 290.7, -202.5). Crate bottoms (outer skin +0.08) rest on the 290.7 plane;
X +/-302.6 inside +/-310; A z -0.1..405.1 (32mm off the -Y frame zone);
B z -405.1..0.1 (100mm off the +Y tubes). Seam contact 0.1mm (tolerance 1mm).

Arrangements are crate-local mm `(x0, z0, yaw)` with item WxD (yaw90 swaps).
Every item bottom sits at floor +6.0 (single layer, witnessed); every top is
below the 253.3 rim; contacts are exact face touches (0.0 overlap):

| Order | Crate 1 | Crate 2 |
|---|---|---|
| B-01 (P01x2+P07) | P07 250x180 @(-290,-190); P01 200x150 @(-40,-190); P01 @(-40,-40) | — |
| B-02 (P03x2+P09x2) | P09 @(-290,-190); P09 @(-90,-190); P03 150x120 @(110,-190); P03 @(110,-70) | — |
| B-03 (P02+P05x2) | P05 320x220 @(-290,-190); P02 200x300 yaw90 @(30,-190) | P05 @(-160,-110) |
| B-04 (P11x2+P12) | P11 260x180 @(-290,-190); P11 @(-30,-190); P12 190x140 @(-290,-10) | — |
| B-05 (P04x2+P08) | P08 280x190 @(-290,-190); P04 220x160 @(-10,-190); P04 @(-10,-30) | — |
| B-06 (P06x2+P10) | P10 290x200 @(-290,-190); P06 140x110 @(0,-190); P06 @(0,-80) | — |

Units are all capacityCost 1: orders are 3,4,3,3,3,3u (max 4). Max units in
one constructed slot-load is 4 (B-02). Proposed capacity 8u = 2 slots x 4.
No volume-derived capacity, no kg/vendor rating, no new bin-packing product.

## 5. Profile proposal + C2 handoff

Loaded union == cart bounds (crates are inside it): X +/-335.7, Y -568.5..+650.6
about the authored origin. Proposed footprint 680x1320+100, origin-centered
(+/-340 contains +/-335.7 with 4.3mm; +/-660 contains -568.5..+650.6 with 9.4mm
at the tight end). Radius: sqrt(340^2+660^2)+100 = 842.4 -> r843 (ceiling, same
convention as the r641/r839 probes). The r839/700x1300 probe already fails
(DSP-Q2 unreachable, 10 slot pairs overlap, 4/6 ready), so r843 necessarily
needs the same C2 geometry/recovery recalibration — C1 proposes, C2 proves.
An alternative for C2 to consider: recenter the model -41mm in Y so the bounds
center sits on the unit origin, which would justify tighter 680x1220 bounds.

## 6. Conversion + material losses

Unmodified `scripts/warehouse-section-usd-to-glb.py` (rigid transforms only,
fan + ear-clipping triangulation with explicit degenerate refusal, winding
preserved, one fallback PBR color). Luggage cart: 102,398 source faces ->
186,990 GLB tris, no failures, no waiver, calibrated within 1mm. Losses (same
class as W1, recorded in the manifest): physics payloads/variants, MDL
(5 declared materials) + PNG/UDIM textures (never downloaded), UVs (present,
unused), per-material splits merged into `[0.72, 0.70, 0.66]` doubleSided
fallback, validation metadata kept as provenance only. Crate: W1 derivative
reused byte-identical (no re-conversion, no drift).

## 7. Reproduction (clean inputs)

```
node scripts/warehouse-cargo-fetch.mjs            # 6 files, 10,517,375 B, pinned+verified
STAGE_DIR=<empty> node scripts/warehouse-cargo-fetch.mjs   # clean-room repeat (tested)
<w1usd-venv>/Scripts/python scripts/m4-usd-inspect.py <stage>/simready_usd/sm_cart_luggage_platform_a01_01.usd
<w1usd-venv>/Scripts/python scripts/warehouse-section-usd-to-glb.py <stage>/...usd apps/web/public/assets/warehouse-cargo/cart_luggage_platform_a01.glb 0.72,0.70,0.66 cart_luggage_platform_a01
node scripts/warehouse-cargo-verify.mjs           # cart + crate reuse + 2 negatives + fit proof
node scripts/warehouse-cargo-fit.mjs              # deck/frames/profile/loads/capacity + 3 negatives
node experiments/warehouse-cargo-section/serve.mjs  # 127.0.0.1:5191 (CARGOC1_PORT), diagnostic viewer
node .coordination/cargo-shot.mjs <iso|top|side> <out.png>  # real Edge, temp profile
```

Browser: real Edge (x86 install) via Playwright `msedge` channel + temporary
profile, SwiftShader flags, 1440x900 viewport; zero console/page errors on
every evidence shot. No external Chrome, no Orca CLI rendering used.

## 8. Integration recommendation (for C2, NOT done here)

1. Bindings: new `mobileUnits` asset entry for
   `warehouse-cargo/cart_luggage_platform_a01` (glb + manifest + fallback
   material note + yaw convention: cart length along unit length axis);
   keep the hand-truck entry as fallback/diagnostic.
2. Fixtures: set `footprintMm` 680x1320+100 and `loadCapacityUnits` 8 in BOTH
   `fixtures/operations/main-warehouse.json` and `picking-packing-burst.json`
   (parent + burst consistently), plus provenance notes.
3. Guards: extend `assertDerivedFixtureCompatible` expectations to the new
   footprint/capacity (it compares field-by-field and must keep refusing drift).
4. Carry pose: replace `CART_CARRY_SUPPORT_Y_M`/`CART_LOAD_LIP_MM` lip logic
   with the witnessed deck (290.7 + two slot poses + crate dims); reuse the
   per-order arrangement table for carried-item labels.
5. Geometry milestone: recalibrate aisles/queues/parking/nav for r843 and
   re-run the burst to READY_FOR_DISPATCH (expected to need layout recovery
   work given the r839 probe failures); refresh M3c evidence on real Edge.
6. Review gate: Codex reviews this C1 package before any of the above lands;
   C1 does not declare M3c complete.

## 9. Artifact inventory (new files only; no existing file modified)

- `scripts/warehouse-cargo-fetch.mjs`, `scripts/warehouse-cargo-fetch-closure.json`
- `scripts/warehouse-cargo-fit.mjs`, `scripts/warehouse-cargo-verify.mjs`
- `assets/manifests/warehouse-cargo-cart_luggage_platform_a01.manifest.json`
- `assets/licenses/warehouse-cargo-cart_luggage_platform_a01-LICENSE.txt`
- `apps/web/public/assets/warehouse-cargo/cart_luggage_platform_a01.glb` (13,467,192 B)
- `experiments/warehouse-cargo-section/` (serve.mjs, index.html, main.js, fixture.json, fixture-unloaded.json)
- `docs/WAREHOUSE_CARGO_INVESTIGATION.md` (this file)
- `evidence/sanitized/cargo-c1-{cart-unloaded-iso,loaded-iso,loaded-top,loaded-side,e01-utility-cart-iso}.png`
- Private work/temps under `.coordination/` (probes, inspect JSONs, tote BOMs, shot helper)

## 10. Remaining blockers

- Codex review of this package (required before integration).
- C2 geometry milestone: r843 nav/slot recalibration + burst re-proof + M3c evidence refresh.
- No further tote search is recommended: the e01 path is closed by measurement
  (section 2), and the luggage+crate pair carries full-size containers, so no
  small tote is needed.

## 11. C2 corrections (2026-11-03; supersedes the false C1 claims below)

The C1 record above is preserved; each item states the C1 claim, why it was
false or unsupported, and the corrected C2 fact with its proof. Source
measurements (cart/crate bounds, fetch closure, license) stand unchanged.

1. Seam interpenetration (§4: "Seam contact 0.1mm (tolerance 1mm)").
   FALSE framing: docks at ±202.5 with 405.133mm-deep crates overlap
   0.133mm; calling overlap "contact" inside a tolerance waived a real
   penetration. C2: docks at ±203.1 with a measured +1.0667mm POSITIVE
   gap (406.2 centers vs 405.133 depth), no waiver
   (scripts/warehouse-cargo-fit.mjs "ok seam").
2. Capacity 8u (§4: "Proposed capacity 8u = 2 slots x 4"). UNSUPPORTED:
   it assumed any 4 units ride one slot-load. C2: conservative 4 =
   2 crates x 2 fixed 220x320x160 cells at universal cargo yaw90; all
   12 canonical SKUs and all 6 burst orders (3,4,3,3,3,3 items) proven
   to allocate; 8x largest-SKU load rejected at proof and engine level.
   No kg/vendor payload claim.
3. Profile 680x1320 r843 origin-centered (§5). SUPERSEDED by the §5
   alternative C2 adopted: centered 680x1220+100 (r799) with
   whole-assembly normalization +41.02388024330139mm GLB Z (no scale,
   no independent shifts). Loaded union verified inside ±340/±610.
4. Deck 290.7 nominal (§3/§4). REFINED: 25 rays through actual GLB deck
   triangles hit 290.72893..290.72898mm; deckTopYM 0.2907289 (1-micron
   band); crateOriginY = deck - scanned crateMinY (0.2906467), so
   bottoms rest EXACTLY on deck. Support proven by zero-intrusion
   vertex/edge/volume checks, not only rect containment.
5. Frame zones (§3: "-Y inner edge -437" / "+Y ~+505"; §4 "32/100mm"
   clearances). Those were USD-eyeball approximations. MEASURED
   (cart-frame GLB z): low deck-edge rails at +419.53/-476.21mm, tall
   end frames at +435.08/-491.95mm. True end clearances: A 13.86mm,
   B 70.54mm (contact-free, proof-guarded).
6. Per-order arrangement table (§4). SUPERSEDED by fixed-cell
   allocation: B-01..B-06 demands are byte-identical (exact-match
   guarded), but placements are now stable SKU/item-ordinal cells
   (A0/A1/B0/B1) via allocateCarryCells, not ad-hoc crate-local stacks.
7. Integration recommendation (§8) and blockers (§10). DONE in C2:
   bindings carry the luggage-platform fleet entry + carry packet +
   exact scene SHA; both fixtures carry 680x1220+100 cap 4 with
   verified slots; renderer uses deck/docks/cells (toe-lip logic
   removed); hand truck is fallback/diagnostic only; burst re-proven
   6/6 READY with the consistent disc-occupancy planner; M3c evidence
   refreshed (m3c-final series; v3-m3c/cargo-c1 history preserved).
