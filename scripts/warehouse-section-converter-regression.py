"""W1 converter regression: repeated/nested instances + explicit negatives.

Durable synthetic checks for scripts/warehouse-section-usd-to-glb.py. All USD
is generated here (no catalog dependency); outputs go to
.coordination/warehouse-section/converter-regression/.

Positive:
  A. repeat-same-bounds: two references to ONE triangle prototype, second
     rotated 180deg + translated (1,1,0); both share the SAME aggregate AABB.
     Expected: exit 0, 2 triangles, second-occurrence vertex present.
  B. nested-transformed: one direct mesh + one instance in a nested translated
     group + one rotated/translated instance. Expected: exit 0, 3 triangles
     in 3 meshes, aggregate bounds exact, all normals unit length.

Positive:
  E. concave dart quad -> exit 0, 2 triangles, triangulated area == quad
     area (ear clipping, never a silent wrong fan).
  G. CCW concave quad -> exit 0, converted SIGNED area == +1.0 (literal).
  H. CW concave quad -> exit 0, converted SIGNED area == -1.0 (literal,
     winding preserved, never silently flipped to CCW).
  I. XZ-plane concave quads, CCW/CW -> signed areas +1.0/-1.0.
  J. YZ-plane concave quads, CCW/CW -> signed areas +1.0/-1.0.
  K. simple convex pentagon -> exit 0, 3 triangles, signed area literal
     (correctness is not achieved by forbidding every n-gon).
  G-K also assert carried normals stay consistent with output geometry.
Negative (converter must FAIL explicitly, never silently convert):
  C. mirrored instance (scale -1,1,1) -> "unsupported" failure.
  D. non-uniformly scaled instance (scale 2,1,1) -> "unsupported" failure.
  F. self-intersecting bow-tie quad -> explicit "degenerate" failure.
  L. self-crossing 5-point star (uniform turns) -> explicit
     "self-intersecting" failure, never a silent convex fan.

Exit 0 only if every case behaves as specified. Prints a JSON summary.
"""
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

from pxr import Gf, Usd, UsdGeom

HERE = Path(__file__).resolve().parent
CONVERTER = HERE / "warehouse-section-usd-to-glb.py"
D = Path(".coordination/warehouse-section/converter-regression")
D.mkdir(parents=True, exist_ok=True)


def write_triangle(path, points=((0, 0, 0), (1, 0, 0), (0, 1, 0))):
    asset = Usd.Stage.CreateNew(str(path))
    UsdGeom.SetStageUpAxis(asset, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(asset, 1)
    root = UsdGeom.Xform.Define(asset, "/Asset")
    asset.SetDefaultPrim(root.GetPrim())
    m = UsdGeom.Mesh.Define(asset, "/Asset/Triangle")
    m.CreatePointsAttr(list(points))
    m.CreateFaceVertexCountsAttr([3])
    m.CreateFaceVertexIndicesAttr([0, 1, 2])
    m.CreateNormalsAttr([(0, 0, 1)] * 3)
    m.SetNormalsInterpolation("faceVarying")
    m.CreateSubdivisionSchemeAttr("none")
    m.CreateDoubleSidedAttr(True)
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    m.CreateExtentAttr([(min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))])
    asset.GetRootLayer().Save()


def add_instance(stage, path, ref_file, prim="/Asset", translate=None, rotate_z=None, scale=None):
    x = UsdGeom.Xform.Define(stage, path)
    x.GetPrim().GetReferences().AddReference(str(ref_file), prim)
    x.GetPrim().SetInstanceable(True)
    if translate is not None:
        x.AddTranslateOp().Set(Gf.Vec3d(*translate))
    if rotate_z is not None:
        x.AddRotateZOp().Set(rotate_z)
    if scale is not None:
        x.AddScaleOp().Set(Gf.Vec3f(*scale))
    return x


def run_converter(src, out):
    return subprocess.run(
        [sys.executable, str(CONVERTER), str(src), str(out), "0.5,0.5,0.5", "regression-case"],
        capture_output=True,
        text=True,
    )


def read_glb(path):
    b = Path(path).read_bytes()
    assert struct.unpack_from("<I", b, 0)[0] == 0x46546C67, "glb magic"
    jlen = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20 + jlen])
    blen = struct.unpack_from("<I", b, 20 + jlen)[0]
    blob = b[20 + jlen + 8:20 + jlen + 8 + blen]
    return j, blob


def accessor_floats(j, blob, idx):
    a = j["accessors"][idx]
    v = j["bufferViews"][a["bufferView"]]
    off = v.get("byteOffset", 0)
    n = a["count"] * 3
    return struct.unpack_from(f"<{n}f", blob, off), a


def soup_positions(j, blob):
    pos = []
    for m in j["meshes"]:
        for p in m["primitives"]:
            vals, _ = accessor_floats(j, blob, p["attributes"]["POSITION"])
            pos.extend(vals)
    return pos


def case_a():
    tri = D / "a-triangle.usda"
    write_triangle(tri)
    stage = Usd.Stage.CreateNew(str(D / "a-two-occurrences.usda"))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    root = UsdGeom.Xform.Define(stage, "/RootNode")
    stage.SetDefaultPrim(root.GetPrim())
    UsdGeom.Xform.Define(stage, "/RootNode/Geometry")
    add_instance(stage, "/RootNode/Geometry/A", tri.name)
    add_instance(stage, "/RootNode/Geometry/B", tri.name, translate=(1, 1, 0), rotate_z=180)
    stage.GetRootLayer().Save()
    run = run_converter(D / "a-two-occurrences.usda", D / "a-result.glb")
    assert run.returncode == 0, f"case A converter failed: {run.stderr[-400:]}"
    j, blob = read_glb(D / "a-result.glb")
    tris = sum(j["accessors"][p["attributes"]["POSITION"]]["count"] // 3
               for m in j["meshes"] for p in m["primitives"])
    assert tris == 2, f"case A: expected 2 triangles, got {tris}"
    assert len(j["meshes"]) == 2, f"case A: expected 2 occurrence meshes, got {len(j['meshes'])}"
    pos = soup_positions(j, blob)
    verts = [(pos[i], pos[i + 1], pos[i + 2]) for i in range(0, len(pos), 3)]
    # (1,0,-1) in Y-up exists ONLY in occurrence B (rotated+translated).
    assert any(abs(x - 1) < 1e-6 and abs(y) < 1e-6 and abs(z + 1) < 1e-6 for x, y, z in verts), \
        "case A: second-occurrence vertex (1,0,-1) missing"
    # Both occurrences share one aggregate AABB (the trap shape): x/y/z ranges
    # of occurrence A alone equal the whole-soup ranges.
    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    assert (min(xs), max(xs)) == (0.0, 1.0), f"case A x-range {min(xs)}..{max(xs)}"
    assert (min(ys), max(ys)) == (0.0, 0.0), f"case A y-range {min(ys)}..{max(ys)}"
    assert (min(zs), max(zs)) == (-1.0, 0.0), f"case A z-range {min(zs)}..{max(zs)}"
    return {"triangles": tris, "meshes": len(j["meshes"]), "secondOccurrenceVertex": True}


def case_b():
    tri = D / "b-triangle.usda"
    write_triangle(tri)
    stage = Usd.Stage.CreateNew(str(D / "b-nested.usda"))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    root = UsdGeom.Xform.Define(stage, "/RootNode")
    stage.SetDefaultPrim(root.GetPrim())
    UsdGeom.Xform.Define(stage, "/RootNode/Geometry")
    direct = UsdGeom.Mesh.Define(stage, "/RootNode/Geometry/Direct")
    direct.CreatePointsAttr([(0, 0, 0), (1, 0, 0), (0, 1, 0)])
    direct.CreateFaceVertexCountsAttr([3])
    direct.CreateFaceVertexIndicesAttr([0, 1, 2])
    direct.CreateNormalsAttr([(0, 0, 1)] * 3)
    direct.SetNormalsInterpolation("faceVarying")
    direct.CreateSubdivisionSchemeAttr("none")
    direct.CreateDoubleSidedAttr(True)
    direct.CreateExtentAttr([(0, 0, 0), (1, 1, 0)])
    nest = UsdGeom.Xform.Define(stage, "/RootNode/Geometry/Nested")
    nest.AddTranslateOp().Set(Gf.Vec3d(10, 0, 0))
    add_instance(stage, "/RootNode/Geometry/Nested/N1", tri.name, translate=(0, 5, 0))
    add_instance(stage, "/RootNode/Geometry/R1", tri.name, translate=(0, 0, 3), rotate_z=90)
    stage.GetRootLayer().Save()
    run = run_converter(D / "b-nested.usda", D / "b-result.glb")
    assert run.returncode == 0, f"case B converter failed: {run.stderr[-400:]}"
    j, blob = read_glb(D / "b-result.glb")
    tris = sum(j["accessors"][p["attributes"]["POSITION"]]["count"] // 3
               for m in j["meshes"] for p in m["primitives"])
    assert tris == 3, f"case B: expected 3 triangles, got {tris}"
    assert len(j["meshes"]) == 3, f"case B: expected 3 occurrence meshes, got {len(j['meshes'])}"
    pos = soup_positions(j, blob)
    xs = pos[0::3]
    ys = pos[1::3]
    zs = pos[2::3]
    # Expected Y-up aggregate: D(0..1,0,-1..0) N(10..11,0,-6..-5) R(-1..0,3,-1..0).
    for got, exp, axis in ((min(xs), -1.0, "minX"), (max(xs), 11.0, "maxX"),
                           (min(ys), 0.0, "minY"), (max(ys), 3.0, "maxY"),
                           (min(zs), -6.0, "minZ"), (max(zs), 0.0, "maxZ")):
        assert abs(got - exp) < 1e-6, f"case B {axis}: {got} != {exp}"
    for m in j["meshes"]:
        for p in m["primitives"]:
            vals, _ = accessor_floats(j, blob, p["attributes"]["NORMAL"])
            for i in range(0, len(vals), 3):
                n = math.sqrt(vals[i] ** 2 + vals[i + 1] ** 2 + vals[i + 2] ** 2)
                assert abs(n - 1.0) < 1e-5, f"case B: non-unit normal {n}"
    return {"triangles": tris, "meshes": len(j["meshes"]), "boundsExact": True, "normalsUnit": True}


def negative(name, build, expect):
    build()
    run = run_converter(D / f"{name}.usda", D / f"{name}.glb")
    assert run.returncode != 0, f"case {name}: converter must FAIL but exited 0"
    tail = (run.stderr + run.stdout).lower()
    assert expect in tail, f"case {name}: stderr must name '{expect}': {(run.stderr)[-400:]}"
    return {"rejected": True, "matched": expect}


def build_mirror():
    tri = D / "c-triangle.usda"
    write_triangle(tri)
    stage = Usd.Stage.CreateNew(str(D / "c-mirror.usda"))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    root = UsdGeom.Xform.Define(stage, "/RootNode")
    stage.SetDefaultPrim(root.GetPrim())
    UsdGeom.Xform.Define(stage, "/RootNode/Geometry")
    add_instance(stage, "/RootNode/Geometry/M", tri.name, scale=(-1, 1, 1))
    stage.GetRootLayer().Save()


def build_scale():
    tri = D / "d-triangle.usda"
    write_triangle(tri)
    stage = Usd.Stage.CreateNew(str(D / "d-scale.usda"))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    root = UsdGeom.Xform.Define(stage, "/RootNode")
    stage.SetDefaultPrim(root.GetPrim())
    UsdGeom.Xform.Define(stage, "/RootNode/Geometry")
    add_instance(stage, "/RootNode/Geometry/S", tri.name, scale=(2, 1, 1))
    stage.GetRootLayer().Save()


def case_e():
    stage = Usd.Stage.CreateNew(str(D / "e-concave.usda"))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    root = UsdGeom.Xform.Define(stage, "/RootNode")
    stage.SetDefaultPrim(root.GetPrim())
    UsdGeom.Xform.Define(stage, "/RootNode/Geometry")
    # Dart quad: (0.5,0.5) is a reflex vertex (concave). Shoelace area = 1.
    m = UsdGeom.Mesh.Define(stage, "/RootNode/Geometry/Dart")
    m.CreatePointsAttr([(0, 0, 0), (2, 0, 0), (0.5, 0.5, 0), (0, 2, 0)])
    m.CreateFaceVertexCountsAttr([4])
    m.CreateFaceVertexIndicesAttr([0, 1, 2, 3])
    m.CreateNormalsAttr([(0, 0, 1)] * 4)
    m.SetNormalsInterpolation("faceVarying")
    m.CreateSubdivisionSchemeAttr("none")
    m.CreateDoubleSidedAttr(True)
    m.CreateExtentAttr([(0, 0, 0), (2, 2, 0)])
    stage.GetRootLayer().Save()
    run = run_converter(D / "e-concave.usda", D / "e-result.glb")
    assert run.returncode == 0, f"case E converter failed: {run.stderr[-400:]}"
    j, blob = read_glb(D / "e-result.glb")
    tris = sum(j["accessors"][p["attributes"]["POSITION"]]["count"] // 3
               for m in j["meshes"] for p in m["primitives"])
    assert tris == 2, f"case E: expected 2 triangles, got {tris}"
    pos = soup_positions(j, blob)
    area = 0.0
    for t in range(0, len(pos) // 9):
        ax, ay, az = pos[9 * t:9 * t + 3]
        bx, by, bz = pos[9 * t + 3:9 * t + 6]
        cx, cy, cz = pos[9 * t + 6:9 * t + 9]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        area += 0.5 * math.sqrt((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2)
    assert abs(area - 1.0) < 1e-6, f"case E: triangulated area {area} != quad area 1.0"
    return {"triangles": tris, "areaPreserved": True}


def build_bowtie():
    stage = Usd.Stage.CreateNew(str(D / "f-bowtie.usda"))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    root = UsdGeom.Xform.Define(stage, "/RootNode")
    stage.SetDefaultPrim(root.GetPrim())
    UsdGeom.Xform.Define(stage, "/RootNode/Geometry")
    # Bow-tie quad: edges (0,0)-(1,1) and (0,1)-(1,0) cross; no valid area.
    m = UsdGeom.Mesh.Define(stage, "/RootNode/Geometry/Bowtie")
    m.CreatePointsAttr([(0, 0, 0), (1, 1, 0), (0, 1, 0), (1, 0, 0)])
    m.CreateFaceVertexCountsAttr([4])
    m.CreateFaceVertexIndicesAttr([0, 1, 2, 3])
    m.CreateNormalsAttr([(0, 0, 1)] * 4)
    m.SetNormalsInterpolation("faceVarying")
    m.CreateSubdivisionSchemeAttr("none")
    m.CreateDoubleSidedAttr(True)
    m.CreateExtentAttr([(0, 0, 0), (1, 1, 0)])
    stage.GetRootLayer().Save()


def newell_unit(pts):
    nx = ny = nz = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0, z0 = pts[i]
        x1, y1, z1 = pts[(i + 1) % n]
        nx += (y0 - y1) * (z0 + z1)
        ny += (z0 - z1) * (x0 + x1)
        nz += (x0 - x1) * (y0 + y1)
    l = math.sqrt(nx * nx + ny * ny + nz * nz)
    assert l > 0, "synthetic face must have nonzero Newell normal"
    return (nx / l, ny / l, nz / l)


def write_face_case(name, pts):
    stage = Usd.Stage.CreateNew(str(D / f"{name}.usda"))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    root = UsdGeom.Xform.Define(stage, "/RootNode")
    stage.SetDefaultPrim(root.GetPrim())
    m = UsdGeom.Mesh.Define(stage, "/RootNode/Mesh")
    m.CreatePointsAttr(list(pts))
    m.CreateFaceVertexCountsAttr([len(pts)])
    m.CreateFaceVertexIndicesAttr(list(range(len(pts))))
    # Authored normals consistent with the authored winding by construction.
    m.CreateNormalsAttr([newell_unit(pts)] * len(pts))
    m.SetNormalsInterpolation("faceVarying")
    m.CreateSubdivisionSchemeAttr("none")
    m.CreateDoubleSidedAttr(True)
    m.CreateExtentAttr([
        (min(p[0] for p in pts), min(p[1] for p in pts), min(p[2] for p in pts)),
        (max(p[0] for p in pts), max(p[1] for p in pts), max(p[2] for p in pts)),
    ])
    stage.GetRootLayer().Save()


def converted_signed_area(glb_path, axes):
    """Summed triangle signed area in source-plane axes (inverse axis map)."""
    j, blob = read_glb(glb_path)
    total = 0.0
    tris = 0
    for m in j["meshes"]:
        for p in m["primitives"]:
            vals, _ = accessor_floats(j, blob, p["attributes"]["POSITION"])
            for t in range(0, len(vals) // 9):
                tri = []
                for k in range(3):
                    # Inverse of (x,y,z)Z -> (x,z,-y)Y: x=X, y=-Z, z=Y.
                    gx, gy, gz = vals[9 * t + 3 * k:9 * t + 3 * k + 3]
                    src = (gx, -gz, gy)
                    tri.append((src[axes[0]], src[axes[1]]))
                total += sum(tri[i][0] * tri[(i + 1) % 3][1] - tri[(i + 1) % 3][0] * tri[i][1] for i in range(3)) / 2
                tris += 1
    return total, tris


def assert_normals_consistent(glb_path, label):
    """Every output triangle's geometric normal must agree (not oppose) the
    carried per-corner normals; a silent winding flip would invert them."""
    j, blob = read_glb(glb_path)
    checked = 0
    for m in j["meshes"]:
        for p in m["primitives"]:
            pos, _ = accessor_floats(j, blob, p["attributes"]["POSITION"])
            nrm, _ = accessor_floats(j, blob, p["attributes"]["NORMAL"])
            for t in range(0, len(pos) // 9):
                ax, ay, az = pos[9 * t:9 * t + 3]
                bx, by, bz = pos[9 * t + 3:9 * t + 6]
                cx, cy, cz = pos[9 * t + 6:9 * t + 9]
                gx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
                gy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
                gz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
                gl = math.sqrt(gx * gx + gy * gy + gz * gz)
                assert gl > 0, f"{label}: degenerate output triangle {t}"
                nx = sum(nrm[9 * t + 3 * k] for k in range(3))
                ny = sum(nrm[9 * t + 3 * k + 1] for k in range(3))
                nz = sum(nrm[9 * t + 3 * k + 2] for k in range(3))
                nl = math.sqrt(nx * nx + ny * ny + nz * nz)
                cos = (gx * nx + gy * ny + gz * nz) / (gl * nl)
                assert cos > 0.9, f"{label}: triangle {t} geometric normal opposes carried normals (cos={cos:.3f})"
                checked += 1
    assert checked > 0, f"{label}: no triangles checked"
    return checked


def signed_quad_case(name, pts, axes, expect):
    write_face_case(name, pts)
    run = run_converter(D / f"{name}.usda", D / f"{name}.glb")
    assert run.returncode == 0, f"case {name} converter failed: {run.stderr[-400:]}"
    got, tris = converted_signed_area(D / f"{name}.glb", axes)
    assert tris == 2, f"case {name}: expected 2 triangles, got {tris}"
    assert abs(got - expect) < 1e-6, f"case {name}: signed area {got:.6f} != literal {expect}"
    assert (got > 0) == (expect > 0), f"case {name}: sign flip {got:.6f} vs {expect}"
    checked = assert_normals_consistent(D / f"{name}.glb", name)
    return {"signedArea": round(got, 6), "literal": expect, "triangles": tris, "normalsConsistent": checked}


def case_k_pentagon():
    pts = [(math.cos(2 * math.pi * i / 5), math.sin(2 * math.pi * i / 5), 0) for i in range(5)]
    write_face_case("k-pentagon", pts)
    run = run_converter(D / "k-pentagon.usda", D / "k-pentagon.glb")
    assert run.returncode == 0, f"case K converter failed: {run.stderr[-400:]}"
    got, tris = converted_signed_area(D / "k-pentagon.glb", (0, 1))
    expect = 2.5 * math.sin(2 * math.pi / 5)  # regular pentagon, R=1
    assert tris == 3, f"case K: expected 3 triangles, got {tris}"
    assert abs(got - expect) < 1e-6, f"case K: signed area {got:.6f} != literal {expect:.6f}"
    checked = assert_normals_consistent(D / "k-pentagon.glb", "k-pentagon")
    return {"signedArea": round(got, 6), "literal": round(expect, 6), "triangles": tris, "normalsConsistent": checked}


def build_star():
    pts = [(math.cos(2 * math.pi * i / 5), math.sin(2 * math.pi * i / 5), 0) for i in [0, 2, 4, 1, 3]]
    write_face_case("l-star", pts)


results = {}
results["A_repeat_same_bounds"] = case_a()
results["B_nested_transformed"] = case_b()
results["C_mirror_rejected"] = negative("c-mirror", build_mirror, "unsupported")
results["D_nonuniform_scale_rejected"] = negative("d-scale", build_scale, "unsupported")
results["E_concave_earclipped"] = case_e()
results["F_bowtie_rejected"] = negative("f-bowtie", build_bowtie, "degenerate")
results["G_ccw_signed"] = signed_quad_case(
    "g-ccw", [(0, 0, 0), (2, 0, 0), (0.5, 0.5, 0), (0, 2, 0)], (0, 1), 1.0)
results["H_cw_signed"] = signed_quad_case(
    "h-cw", [(0, 2, 0), (0.5, 0.5, 0), (2, 0, 0), (0, 0, 0)], (0, 1), -1.0)
results["I_xz_ccw"] = signed_quad_case(
    "i-xz-ccw", [(0, 0, 0), (2, 0, 0), (0.5, 0, 0.5), (0, 0, 2)], (0, 2), 1.0)
results["I_xz_cw"] = signed_quad_case(
    "i-xz-cw", [(0, 0, 2), (0.5, 0, 0.5), (2, 0, 0), (0, 0, 0)], (0, 2), -1.0)
results["J_yz_ccw"] = signed_quad_case(
    "j-yz-ccw", [(0, 0, 0), (0, 2, 0), (0, 0.5, 0.5), (0, 0, 2)], (1, 2), 1.0)
results["J_yz_cw"] = signed_quad_case(
    "j-yz-cw", [(0, 0, 2), (0, 0.5, 0.5), (0, 2, 0), (0, 0, 0)], (1, 2), -1.0)
results["K_valid_pentagon"] = case_k_pentagon()
results["L_star_rejected"] = negative("l-star", build_star, "self-intersecting")
(D / "summary.json").write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
print("CONVERTER-REGRESSION: PASS 14/14 (10 positive incl 6 signed-winding, 4 explicit negatives)")
