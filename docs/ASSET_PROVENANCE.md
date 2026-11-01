# LayoutLab asset provenance (M4)

Single-sourced machine record: [assets/manifests/rack_large_empty_a01.manifest.json](../assets/manifests/rack_large_empty_a01.manifest.json).
License copy: [assets/licenses/rack_large_empty_a01-LICENSE.txt](../assets/licenses/rack_large_empty_a01-LICENSE.txt).
Browser derivative: `apps/web/public/assets/rack_large_empty_a01.glb` (served at `/assets/rack_large_empty_a01.glb`).

## 1. Source

- Dataset: `nvidia/simready-assets` ([dataset](https://huggingface.co/datasets/nvidia/simready-assets)).
- Package: `rack_large_empty_a01` ("rack with shelves", asset type `prop`).
- Pinned revision: `4763fbfaa4f8e97658e68b57d01b4c86659e08b5` (M0 pin, re-verified M4).
- Pattern: `https://huggingface.co/datasets/nvidia/simready-assets/resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/rack_large_empty_a01/<path>`.
- Root USD: `simready_usd/sm_rack_large_empty_a01_01.usd` (binary USDC crate).
- License: `CC-BY-4.0` (dataset tag, `com.nvidia.simready.packaging.json`, `.metadata/LICENSE.txt`).

Attribution: "Rack mesh derived from NVIDIA SimReady Assets package rack_large_empty_a01
(https://huggingface.co/datasets/nvidia/simready-assets), revision
4763fbfaa4f8e97658e68b57d01b4c86659e08b5, used under CC-BY-4.0. Geometry converted to GLB
with axis remap and a simplified neutral material; see discarded features. (c) NVIDIA
Corporation; changes by LayoutLab documented in this manifest."

## 2. Staged source bytes (all SHA-256-verified against the BOM)

| Path | Bytes | SHA-256 |
|---|---|---|
| `simready_usd/sm_rack_large_empty_a01_01.usd` | 25,823 | `55b2b06e…f8e14` |
| `simready_usd/payloads/base.usda` | 11,338 | `46defc3b…3ea3c19` |
| `simready_usd/payloads/instances.usda` | 10,470 | `e2d77450…2c49343` |
| `simready_usd/payloads/materials.usda` | 19,591 | `e739052f…6f67ca` |
| `simready_usd/payloads/Physics/physics.usda` | 9,360 | `a6932bd0…d3b1dcd3b7` |
| `simready_usd/payloads/geometries.usd` | 3,297,376 | `900dfcc1…c0e6e` (+ first-MiB `c69110a5…51f249`) |

Full hashes in the manifest. UDIM textures and `OmniPBR.mdl` were never downloaded (not needed;
original MDL is not preserved). Physics-variant payload layers were not staged (expected
warnings, geometry unaffected).

## 3. Observed source facts (usd-core, not assumed)

- Units: `metersPerUnit = 1.0`. Axes: Z-up. Default prim `/RootNode`.
- Visible rack: instance `/RootNode/Geometry/sm_rack_a01_obj_00`; geometry in prototype mesh
  `/__Prototype_1/sm_rack_a01_mesh_00` (22,504 points; 24,904 faces = 19,200 quads + 5,704 tris).
- Normals: face-varying (93,912 corners). Subdivision: none. Double-sided. UVs present.
- Transforms: identity on instance and mesh (verified via XformCache).
- World bounds (m): min (−1.999988, −1.03329, 0.0), max (1.999989, 1.033291, 3.010001).

## 4. Conversion

Toolchain (scratch TEMP venv + stdlib scripts; no Docker, Blender, or numpy):

1. `node scripts/m4-asset-fetch.mjs` — stage pinned bytes to TEMP, verify every SHA-256 vs BOM.
2. `<venv>/Scripts/python scripts/m4-usd-inspect.py <stage>/…/sm_rack_large_empty_a01_01.usd` — metadata + mesh inventory JSON.
3. `<venv>/Scripts/python scripts/m4-usd-to-glb.py <stage>/…/root.usd <out>.glb` — triangulate (winding-preserving fan), carry authored face-varying normals as a non-indexed soup, apply instance world matrix, rotate Z-up → Y-up `(x, y, z) → (x, z, −y)` (proper rotation, det +1), assert transformed bounds within 1 mm of mapped source.
4. `node scripts/m4-asset-verify.mjs <out>.glb` — independent container/JSON-chunk parse, bounds calibration, SHA-256.

Tool versions: Python 3.12.10, usd-core 26.11, Node v24.18.0.

Derivative: GLB 3,176,476 bytes, SHA-256 `571cc601…f8f8ae9ea`, 1 mesh / 1 TRIANGLES primitive,
44,104 triangles, 132,312 soup vertices, one neutral PBR material
(`layoutlab-neutral-rack`: baseColor 0.62/0.64/0.68, metallic 0.0, roughness 0.9, doubleSided).
GLB bounds (m, Y-up, ground origin): min (−1.999988, 0.0, −1.033291), max (1.999989, 3.010001, 1.03329)
— calibrated within 1 mm of the axis-mapped source. No scaling is baked into the GLB.

## 5. Canonical browser fit (evaluator-independent)

Per rack: `scale = (widthM / 3.999977, heightM / 3.010001, depthM / 2.066581)`,
`position = (centerXmm·0.001, 0, centerZmm·0.001)`, `rotationY = yawDeg`.
Scale applies in mesh-local space before yaw, so yaw 90/270 swaps the world footprint exactly
like the core footprint convention. Example (warehouse-basic R1–R4, 1600×2000×800 mm):
scale (0.4000023, 0.6644516, 0.3871128). The evaluator never reads the visual mesh; the 2D plan
is unaffected. Location markers, packing marker, and route line remain labeled development
proxies.

## 6. Discarded features (explicit)

SimReady physics payloads and MuJoCo/Newton/PhysX variants — **GLB conversion does NOT preserve
SimReady physics metadata**; mass (1170.4934) and centerOfMass (z 1.433); GeomSubset material
splits (2 subsets merged); UVs; MDL materials and UDIM textures; validation and runtime-testing
metadata; conformance/packaging metadata (kept as provenance records only).

## 7. Verification

- `m4-asset-verify.mjs`: container + bounds + hash PASS on the tracked bytes.
- Coordinator independent check passed (separately downloaded geometry, hash/bytes match,
  GLTF parse 1 mesh / 132,312 vertices / 44,104 triangles, source-mapped bounds, canonical
  footprint/ground height within 1 mm at all 4 yaws).
- Browser e2e: actual GLB loaded (`data-asset="simready-glb"`, 4 racks), first-rack bounding box
  within 0.01 m of canonical, screenshots retained, zero console/page errors.
