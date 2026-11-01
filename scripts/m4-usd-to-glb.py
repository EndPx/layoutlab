"""M4 USD -> GLB conversion (scratch tooling, not app code).

Converts the staged revision-pinned rack mesh into a browser-compatible GLB
derived from actual source geometry (no handcrafted substitute). Requires a
scratch venv with usd-core; NEVER installs into the repo. Stdlib only besides
pxr (no numpy) to keep the tool chain minimal.

Setup (PowerShell, all under $env:TEMP, delete afterwards):
  python -m venv $env:TEMP/m4usd
  (& "$env:TEMP/m4usd/Scripts/python" -m pip install usd-core)  # observed 26.11
  node scripts/m4-asset-fetch.mjs   # pinned bytes -> TEMP stage, BOM-verified

Usage:
  m4usd/Scripts/python scripts/m4-usd-to-glb.py <stage/.../root.usd> <out.glb>

Conversion contract (also recorded in the asset manifest):
- Source: meters, Z-up, identity instance/mesh transforms (asserted, then the
  instance world matrix is still applied generally).
- Geometry: the single prototype mesh; quads/n-gons fan-triangulated with
  winding preserved (USD and glTF are both CCW-front).
- Normals: authored face-varying normals carried per corner; the GLB is a
  non-indexed triangle soup so shading matches the source.
- Axes: Z-up -> Y-up rotation (x, y, z) -> (x, z, -y) (proper rotation,
  det +1); ground origin preserved (source z=0 -> GLB y=0). No scaling is
  baked: per-rack canonical scaling happens in the browser from manifest
  numbers, and the evaluator never reads the visual mesh.
- Material: ONE simplified neutral unlit-by-texture PBR material
  (documented; original MDL + UDIM textures NOT preserved).
- Discarded (documented): SimReady physics payloads/variants, mass/com,
  GeomSubset material splits, UVs, MDL materials, textures, validation and
  runtime-testing metadata. GLB conversion does NOT preserve SimReady
  physics metadata.

Prints a JSON summary with source bounds, transformed bounds, triangle
counts, and the calibration check. Missing texture / physics-variant payload
warnings are expected (those layers are not staged) and do not affect
geometry.
"""
import json
import struct
import sys

from pxr import Usd, UsdGeom

root, out_path = sys.argv[1], sys.argv[2]
stage = Usd.Stage.Open(root)
assert stage, "stage failed to open: " + root
assert UsdGeom.GetStageMetersPerUnit(stage) == 1.0, "expected meters"
assert str(UsdGeom.GetStageUpAxis(stage)) == "Z", "expected Z-up source"
t = Usd.TimeCode.Default()

# The visible rack is an instanceable Xform; real geometry lives in its
# prototype (single mesh). Generic lookup: first instance under
# /RootNode/Geometry, first mesh under its prototype.
geo = stage.GetPrimAtPath("/RootNode/Geometry")
inst = next((c for c in geo.GetChildren() if c.IsInstance()), None)
assert inst, "no instance prim under /RootNode/Geometry"
proto = inst.GetPrototype()
meshes = [c for c in proto.GetChildren() if c.IsA(UsdGeom.Mesh)]
assert len(meshes) == 1, f"expected exactly 1 prototype mesh, got {len(meshes)}"
mesh = UsdGeom.Mesh(meshes[0])

counts = list(mesh.GetFaceVertexCountsAttr().Get(t) or [])
indices = list(mesh.GetFaceVertexIndicesAttr().Get(t) or [])
points = list(mesh.GetPointsAttr().Get(t) or [])
normals = list(mesh.GetNormalsAttr().Get(t) or [])
assert points and counts and indices, "mesh must carry points/faces"
assert mesh.GetNormalsInterpolation() == "faceVarying", "expected face-varying normals"
assert len(normals) == len(indices), "face-varying normals must match face-vertex order"
assert str(mesh.GetSubdivisionSchemeAttr().Get(t)) == "none", "expected unsmoothed mesh"
assert bool(mesh.GetDoubleSidedAttr().Get(t)) is True, "expected double-sided mesh"

cache = UsdGeom.BBoxCache(t, [UsdGeom.Tokens.default_, UsdGeom.Tokens.render])
world = UsdGeom.XformCache(t).GetLocalToWorldTransform(inst)
# Identity expected (M0); still applied generally below.
is_identity = all(abs(world[i][j] - (1.0 if i == j else 0.0)) < 1e-9 for i in range(4) for j in range(4))

src_rng = cache.ComputeWorldBound(stage.GetDefaultPrim()).ComputeAlignedBox()
src_min, src_max = src_rng.GetMin(), src_rng.GetMax()

def world_of(p):
    x, y, z = p[0], p[1], p[2]
    return (
        world[0][0] * x + world[1][0] * y + world[2][0] * z + world[3][0],
        world[0][1] * x + world[1][1] * y + world[2][1] * z + world[3][1],
        world[0][2] * x + world[1][2] * y + world[2][2] * z + world[3][2],
    )

def rot_norm(n):
    x, y, z = n[0], n[1], n[2]
    return (
        world[0][0] * x + world[1][0] * y + world[2][0] * z,
        world[0][1] * x + world[1][1] * y + world[2][1] * z,
        world[0][2] * x + world[1][2] * y + world[2][2] * z,
    )

def zup_to_yup(v):
    x, y, z = v
    return (x, z, -y)

# Fan-triangulate with winding preserved; expand to a non-indexed soup so
# each corner keeps its authored face-varying normal.
pos, nrm = [], []
corner = 0
triangles = 0
for c in counts:
    fan = [(0, i, i + 1) for i in range(1, c - 1)]
    for a, b, d in fan:
        for k in (corner + a, corner + b, corner + d):
            p = world_of(points[indices[k]])
            n = rot_norm(normals[k])
            pos.extend(zup_to_yup(p))
            nrm.extend(zup_to_yup(n))
        triangles += 1
    corner += c

vcount = triangles * 3
tmin = [min(pos[i::3]) for i in range(3)]
tmax = [max(pos[i::3]) for i in range(3)]

# Calibration: transformed bounds must equal the source world bounds with
# axes mapped (x->x, y->z-size, z->y-size) within 1 mm.
exp_min = [src_min[0], src_min[2], -src_max[1]]
exp_max = [src_max[0], src_max[2], -src_min[1]]
calibrated = all(
    abs(tmin[i] - exp_min[i]) < 0.001 and abs(tmax[i] - exp_max[i]) < 0.001
    for i in range(3)
)
assert calibrated, f"transformed bounds {tmin}/{tmax} != mapped source {exp_min}/{exp_max}"

pos_bytes = struct.pack(f"<{len(pos)}f", *pos)
nrm_bytes = struct.pack(f"<{len(nrm)}f", *nrm)
bin_blob = pos_bytes + nrm_bytes

NEUTRAL = [0.62, 0.64, 0.68, 1.0]  # simplified neutral gray; MDL not preserved
gltf = {
    "asset": {"version": "2.0", "generator": "LayoutLab M4 m4-usd-to-glb.py (usd-core)"},
    "scene": 0,
    "scenes": [{"nodes": [0], "name": "rack_large_empty_a01"}],
    "nodes": [{"mesh": 0, "name": "sm_rack_a01_mesh_00"}],
    "meshes": [{
        "name": "sm_rack_a01_mesh_00",
        "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1},
            "material": 0,
            "mode": 4,
        }],
    }],
    "materials": [{
        "name": "layoutlab-neutral-rack",
        "doubleSided": True,
        "pbrMetallicRoughness": {
            "baseColorFactor": NEUTRAL,
            "metallicFactor": 0.0,
            "roughnessFactor": 0.9,
        },
    }],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": vcount,
         "type": "VEC3", "min": tmin, "max": tmax},
        {"bufferView": 1, "componentType": 5126, "count": vcount, "type": "VEC3"},
    ],
    "bufferViews": [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_bytes), "byteLength": len(nrm_bytes), "target": 34962},
    ],
    "buffers": [{"byteLength": len(bin_blob)}],
    "extensionsUsed": [],
}
json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
while len(json_bytes) % 4:
    json_bytes += b" "
while len(bin_blob) % 4:
    bin_blob += b"\x00"
glb = (
    struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(bin_blob))
    + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    + struct.pack("<II", len(bin_blob), 0x004E4942) + bin_blob
)
with open(out_path, "wb") as f:
    f.write(glb)

print(json.dumps({
    "out": out_path,
    "glbBytes": len(glb),
    "instancePrim": str(inst.GetPath()),
    "meshPrim": str(mesh.GetPrim().GetPath()),
    "worldTransformWasIdentity": is_identity,
    "sourcePoints": len(points),
    "sourceFaces": len(counts),
    "triangles": triangles,
    "soupVertices": vcount,
    "sourceBoundsMin_m": [round(v, 6) for v in src_min],
    "sourceBoundsMax_m": [round(v, 6) for v in src_max],
    "glbBoundsMin_m": [round(v, 6) for v in tmin],
    "glbBoundsMax_m": [round(v, 6) for v in tmax],
    "calibratedWithin1mm": calibrated,
    "material": "simplified neutral PBR (MDL/UDIM textures NOT preserved)",
    "discarded": ["SimReady physics payloads/variants", "mass/centerOfMass",
                  "GeomSubset material splits", "UVs", "MDL materials/textures",
                  "validation/runtime-testing metadata"],
}, indent=2))
