"""M0 reproducible USD bounds inspection (scratch tooling, not app code).

Recreates the M0 rack-bounds observation. Requires a scratch venv with usd-core
and a scratch stage dir; NEVER installs into the repo (M0 ownership forbids it).

Setup (PowerShell, all under $env:TEMP, delete afterwards):
  python -m venv $env:TEMP/m0usd
  (& "$env:TEMP/m0usd/Scripts/python" -m pip install usd-core)  # observed 26.11
  node scripts/m0-asset-fetch.mjs   # tracked small files -> assets/m0-experiment/...
  # copy assets/m0-experiment/rack_large_empty_a01/simready_usd/{root, payloads/*.usda}
  # into $env:TEMP/m0stage/rack_large_empty_a01/simready_usd/ (same relative layout),
  # then download the pinned geometry crate (SHA-256 verified against BOM):
  #   .../resolve/4763fbfaa4f8e97658e68b57d01b4c86659e08b5/rack_large_empty_a01/
  #   simready_usd/payloads/geometries.usd  (3,297,376 bytes)

Usage:
  m0usd/Scripts/python scripts/m0-usd-bounds.py <m0stage/.../sm_rack_large_empty_a01_01.usd>

Prints stage metadata + aligned world bounds of the default prim as JSON.
Physics-variant payload warnings are expected (variant layers not staged) and do
not affect geometry bounds.
"""
import json
import sys

from pxr import Usd, UsdGeom

root = sys.argv[1]
stage = Usd.Stage.Open(root)
assert stage, "stage failed to open: " + root

meters = UsdGeom.GetStageMetersPerUnit(stage)
up = UsdGeom.GetStageUpAxis(stage)
assert meters == 1.0, f"expected metersPerUnit 1.0, got {meters}"
assert str(up) == "Z", f"expected Z-up stage, got {up}"
assert stage.HasDefaultPrim(), "stage must declare a default prim"

cache = UsdGeom.BBoxCache(Usd.TimeCode.Default(), [UsdGeom.Tokens.default_, UsdGeom.Tokens.render])
prim = stage.GetDefaultPrim()
rng = cache.ComputeWorldBound(prim).ComputeAlignedBox()
mn, mx = rng.GetMin(), rng.GetMax()
assert rng.GetVolume() > 0, "bounds must be non-empty"

xforms = {}
for path in ("/RootNode", "/RootNode/Geometry/sm_rack_a01_obj_00"):
    pr = stage.GetPrimAtPath(path)
    if pr:
        xforms[path] = [o.GetOpName() for o in UsdGeom.Xformable(pr).GetOrderedXformOps()]

print(json.dumps({
    "root": root,
    "metersPerUnit": meters,
    "upAxis": str(up),
    "defaultPrim": str(prim.GetPath()),
    "worldMin_m": [round(v, 6) for v in mn],
    "worldMax_m": [round(v, 6) for v in mx],
    "sizeXYZ_m": [round(mx[i] - mn[i], 6) for i in range(3)],
    "primCount": sum(1 for _ in stage.Traverse()),
    "xformOps": xforms,
}, indent=2))
