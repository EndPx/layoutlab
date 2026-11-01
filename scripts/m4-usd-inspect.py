"""M4 reproducible USD geometry inspection (scratch tooling, not app code).

Reads the staged revision-pinned rack source and prints stage metadata plus a
mesh inventory as JSON. Requires a scratch venv with usd-core; NEVER installs
into the repo.

Setup (PowerShell, all under $env:TEMP, delete afterwards):
  python -m venv $env:TEMP/m4usd
  (& "$env:TEMP/m4usd/Scripts/python" -m pip install usd-core)  # observed 26.11
  node scripts/m4-asset-fetch.mjs   # pinned bytes -> TEMP stage, BOM-verified

Usage:
  m4usd/Scripts/python scripts/m4-usd-inspect.py <stage/.../sm_rack_large_empty_a01_01.usd>

Prints stage metadata + per-mesh inventory (points, faces, triangulation need,
normals/uv presence, local-to-world transform, world bounds). Missing texture /
physics-variant payload warnings are expected (those layers are not staged)
and do not affect geometry.
"""
import json
import sys

from pxr import Usd, UsdGeom

root = sys.argv[1]
stage = Usd.Stage.Open(root)
assert stage, "stage failed to open: " + root

meters = UsdGeom.GetStageMetersPerUnit(stage)
up = UsdGeom.GetStageUpAxis(stage)
assert stage.HasDefaultPrim(), "stage must declare a default prim"

cache = UsdGeom.BBoxCache(Usd.TimeCode.Default(), [UsdGeom.Tokens.default_, UsdGeom.Tokens.render])
prim = stage.GetDefaultPrim()
rng = cache.ComputeWorldBound(prim).ComputeAlignedBox()
mn, mx = rng.GetMin(), rng.GetMax()

def all_mesh_prims():
    seen = set()
    for pr in stage.Traverse():
        if pr.IsA(UsdGeom.Mesh) and str(pr.GetPath()) not in seen:
            seen.add(str(pr.GetPath()))
            yield pr, None
        if pr.IsInstance():
            for child in pr.GetPrototype().GetChildren():
                if child.IsA(UsdGeom.Mesh) and str(child.GetPath()) not in seen:
                    seen.add(str(child.GetPath()))
                    yield child, pr

xcache = UsdGeom.XformCache(Usd.TimeCode.Default())

meshes = []
for pr, inst in all_mesh_prims():
    mesh = UsdGeom.Mesh(pr)
    counts = mesh.GetFaceVertexCountsAttr().Get(Usd.TimeCode.Default()) or []
    indices = mesh.GetFaceVertexIndicesAttr().Get(Usd.TimeCode.Default()) or []
    points = mesh.GetPointsAttr().Get(Usd.TimeCode.Default()) or []
    normals = mesh.GetNormalsAttr().Get(Usd.TimeCode.Default())
    uvs = UsdGeom.PrimvarsAPI(pr).GetPrimvar("st").Get(Usd.TimeCode.Default())
    non_tri = sum(1 for c in counts if c != 3)
    anchor = inst if inst is not None else pr
    xform = xcache.GetLocalToWorldTransform(anchor)
    wr = cache.ComputeWorldBound(anchor).ComputeAlignedBox()
    wmn, wmx = wr.GetMin(), wr.GetMax()
    meshes.append({
        "path": str(pr.GetPath()),
        "instance": str(inst.GetPath()) if inst is not None else None,
        "points": len(points),
        "faces": len(counts),
        "indices": len(indices),
        "nonTriangleFaces": non_tri,
        "hasNormals": normals is not None and len(normals) > 0,
        "normalsInterpolation": str(mesh.GetNormalsInterpolation()),
        "hasUVs": uvs is not None,
        "doubleSided": bool(mesh.GetDoubleSidedAttr().Get(Usd.TimeCode.Default())),
        "subdivision": str(mesh.GetSubdivisionSchemeAttr().Get(Usd.TimeCode.Default())),
        "localToWorld": [[round(v, 6) for v in row] for row in xform],
        "worldMin_m": [round(v, 6) for v in wmn],
        "worldMax_m": [round(v, 6) for v in wmx],
    })

print(json.dumps({
    "root": root,
    "metersPerUnit": meters,
    "upAxis": str(up),
    "defaultPrim": str(prim.GetPath()),
    "worldMin_m": [round(v, 6) for v in mn],
    "worldMax_m": [round(v, 6) for v in mx],
    "sizeXYZ_m": [round(mx[i] - mn[i], 6) for i in range(3)],
    "primCount": sum(1 for _ in stage.Traverse()),
    "meshCount": len(meshes),
    "totalPoints": sum(m["points"] for m in meshes),
    "totalFaces": sum(m["faces"] for m in meshes),
    "meshes": meshes,
}, indent=2))
