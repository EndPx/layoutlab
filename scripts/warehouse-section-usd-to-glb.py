"""W1 USD -> GLB conversion, occurrence-preserving multi-mesh (scratch tooling, not app code).

Converts EVERY mesh occurrence (instance proxies included) with its own full
per-occurrence world transform. Repeated references to the same prototype are
never deduped away: each occurrence emits its own triangles. No buffer dedup
is performed at all.

Usage:
  w1usd/Scripts/python scripts/warehouse-section-usd-to-glb.py <root.usd> <out.glb> <r,g,b> <asset-name>

Contract:
- Source meters, Z-up (asserted); per-occurrence world matrix applied.
- Supported transforms: rigid rotation + translation only (orthonormal 3x3,
  det +1, verified per occurrence). Anything else (mirror, uniform or
  non-uniform scale, shear) FAILS explicitly; normals are rotated, never
  rescaled, so non-isometric input is rejected rather than mis-shaded.
- Triangulation, winding preserved: triangles pass through, convex n-gons
  use fan triangulation gated by a simplicity check (same-sign turns plus
  no edge intersection/spike, else the self-intersecting face FAILS
  explicitly instead of a silent wrong fan), concave n-gons use ear
  clipping in their Newell-plane projection (slightly non-planar authored
  quads are projected; documented approximation, sub-mm on selected
  assets). Ear clipping runs on CCW order and each output triangle is
  mapped back to the authored winding, so CW and CCW faces keep their
  orientation on every projection axis. A face that cannot be clipped
  (degenerate/self-intersecting) FAILS explicitly.
- Face-varying normals carried per corner as a non-indexed soup.
- Axes (x,y,z)Z -> (x,z,-y)Y (det +1); ground preserved; no scale baked.
- ONE fallback PBR color material (MDL/textures/UVs/subsets NOT preserved).
- Calibration: GLB bounds within 1mm of axis-mapped source world bounds.
"""
import json
import struct
import sys

from pxr import Usd, UsdGeom

root, out_path, rgb, asset = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
base = [float(x) for x in rgb.split(",")] + [1.0]
stage = Usd.Stage.Open(root)
assert stage, "stage failed to open: " + root
assert UsdGeom.GetStageMetersPerUnit(stage) == 1.0, "expected meters"
assert str(UsdGeom.GetStageUpAxis(stage)) == "Z", "expected Z-up source"
t = Usd.TimeCode.Default()

# Occurrence-preserving traversal: instance proxies expand every reference to
# every prototype (repeated, nested, and directly-placed meshes alike). No
# prototype-path dedup: each occurrence below emits its own triangles.
occs = [
    p for p in Usd.PrimRange(stage.GetPseudoRoot(), Usd.TraverseInstanceProxies())
    if p.IsA(UsdGeom.Mesh)
]
assert occs, "no meshes found"
for m in occs:
    mesh = UsdGeom.Mesh(m)
    assert mesh.GetNormalsInterpolation() == "faceVarying", f"expected faceVarying normals in {m.GetPath()}"
    assert str(mesh.GetSubdivisionSchemeAttr().Get(t)) == "none", f"expected unsmoothed {m.GetPath()}"

cache = UsdGeom.BBoxCache(t, [UsdGeom.Tokens.default_, UsdGeom.Tokens.render])
xc = UsdGeom.XformCache(t)
src_rng = cache.ComputeWorldBound(stage.GetDefaultPrim()).ComputeAlignedBox()
src_min, src_max = src_rng.GetMin(), src_rng.GetMax()


def zup_to_yup(v):
    x, y, z = v
    return (x, z, -y)


def check_rigid(path, w):
    """Reject non-isometric/mirrored occurrence transforms explicitly."""
    cols = [[w[r][c] for r in range(3)] for c in range(3)]
    for i in range(3):
        for j in range(3):
            d = sum(cols[i][k] * cols[j][k] for k in range(3))
            if abs(d - (1.0 if i == j else 0.0)) > 1e-6:
                sys.exit(
                    f"unsupported transform on {path}: local-to-world 3x3 is not "
                    f"a pure rotation (column orthonormality {d:.6f} != "
                    f"{1.0 if i == j else 0.0}); converter supports rigid "
                    f"rotation+translation only, no scale/mirror/shear"
                )
    det = (
        w[0][0] * (w[1][1] * w[2][2] - w[1][2] * w[2][1])
        - w[0][1] * (w[1][0] * w[2][2] - w[1][2] * w[2][0])
        + w[0][2] * (w[1][0] * w[2][1] - w[1][1] * w[2][0])
    )
    if det <= 0:
        sys.exit(
            f"unsupported transform on {path}: local-to-world determinant "
            f"{det:.6f} <= 0 (mirrored); converter supports rigid "
            f"rotation+translation only"
        )


def _fan_blocker(proj, eps):
    """Return why a same-turn-sign polygon must not be fanned, else None.

    A convex polygon has no non-adjacent edge intersection and no
    backtracking spike; anything found here means the face is
    self-intersecting/degenerate despite uniform turn signs (e.g. a star).
    Per-face relative eps only; no global tolerance.
    """
    n = len(proj)

    def orient(ax, ay, bx, by, cx, cy):
        return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    def on_seg(px, py, qx, qy, rx, ry, tol):
        return (
            qx >= min(px, rx) - tol
            and qx <= max(px, rx) + tol
            and qy >= min(py, ry) - tol
            and qy <= max(py, ry) + tol
        )

    def sgn(o):
        return 0 if abs(o) <= eps else (1 if o > 0 else -1)

    tol = eps**0.5
    for i in range(n):
        i2 = (i + 1) % n
        for j in range(i + 1, n):
            j2 = (j + 1) % n
            p1, p2, p3, p4 = proj[i], proj[i2], proj[j], proj[j2]
            if len({i, i2} & {j, j2}) > 0:
                # Adjacent pair: only a backtracking spike is degenerate
                # (collinear incident edges pointing away from each other).
                shared = ({i, i2} & {j, j2}).pop()
                a = i if i != shared else i2
                b = j if j != shared else j2
                o = orient(proj[a][0], proj[a][1], proj[shared][0], proj[shared][1], proj[b][0], proj[b][1])
                if abs(o) <= eps:
                    d1x = proj[shared][0] - proj[a][0]
                    d1y = proj[shared][1] - proj[a][1]
                    d2x = proj[b][0] - proj[shared][0]
                    d2y = proj[b][1] - proj[shared][1]
                    if d1x * d2x + d1y * d2y < 0:
                        return f"backtracking spike at corner {shared}"
                continue
            o1 = orient(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1])
            o2 = orient(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1])
            o3 = orient(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1])
            o4 = orient(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1])
            s1, s2, s3, s4 = sgn(o1), sgn(o2), sgn(o3), sgn(o4)
            if s1 == 0 and s2 == 0 and s3 == 0 and s4 == 0:
                xs = sorted((p1[0], p2[0], p3[0], p4[0]))
                ys = sorted((p1[1], p2[1], p3[1], p4[1]))
                if max(xs[2] - xs[1], ys[2] - ys[1]) > tol:
                    return f"collinear overlap of edges {i}-{i2} and {j}-{j2}"
                continue
            if s1 * s2 < 0 and s3 * s4 < 0:
                return f"edges {i}-{i2} and {j}-{j2} cross"
            if s1 == 0 and on_seg(p1[0], p1[1], p3[0], p3[1], p2[0], p2[1], tol):
                return f"corner {j} touches edge {i}-{i2}"
            if s2 == 0 and on_seg(p1[0], p1[1], p4[0], p4[1], p2[0], p2[1], tol):
                return f"corner {j2} touches edge {i}-{i2}"
            if s3 == 0 and on_seg(p3[0], p3[1], p1[0], p1[1], p4[0], p4[1], tol):
                return f"corner {i} touches edge {j}-{j2}"
            if s4 == 0 and on_seg(p3[0], p3[1], p2[0], p2[1], p4[0], p4[1], tol):
                return f"corner {i2} touches edge {j}-{j2}"
    return None


def triangulate_face(path, face_index, pts):
    """Return triangle corner triples for one face, winding preserved.

    Triangles pass through; convex n-gons use fan triangulation gated by a
    simplicity check (self-intersecting polygons FAIL explicitly instead of
    a silent wrong fan); concave n-gons use ear clipping in the
    Newell-plane projection with output triangles mapped back to the
    authored (CW or CCW) winding. Faces that cannot be clipped
    (degenerate/self-intersecting) FAIL explicitly.
    """
    n = len(pts)
    if n == 3:
        return [(0, 1, 2)]
    if n < 3:
        sys.exit(f"unsupported degenerate face with {n} vertices in {path} face {face_index}")
    # Newell normal to pick the projection plane.
    nx = ny = nz = 0.0
    for i in range(n):
        x0, y0, z0 = pts[i]
        x1, y1, z1 = pts[(i + 1) % n]
        nx += (y0 - y1) * (z0 + z1)
        ny += (z0 - z1) * (x0 + x1)
        nz += (x0 - x1) * (y0 + y1)
    ax = abs(nx)
    ay = abs(ny)
    az = abs(nz)
    if max(ax, ay, az) == 0.0:
        sys.exit(f"unsupported degenerate (zero-area) face in {path} face {face_index}")
    drop = 0 if ax >= ay and ax >= az else (1 if ay >= az else 2)
    proj = [tuple(v for k, v in enumerate(p) if k != drop) for p in pts]
    edges = [
        (proj[(i + 1) % n][0] - proj[i][0], proj[(i + 1) % n][1] - proj[i][1])
        for i in range(n)
    ]
    scale = max(ex * ex + ey * ey for ex, ey in edges)
    if scale == 0.0:
        sys.exit(f"unsupported degenerate face in {path} face {face_index}")
    eps = 1e-9 * scale
    for i in range(n):
        for j in range(i + 1, n):
            dx = proj[i][0] - proj[j][0]
            dy = proj[i][1] - proj[j][1]
            if dx * dx + dy * dy <= eps:
                sys.exit(
                    f"unsupported degenerate/self-intersecting face in {path} face {face_index}: "
                    f"repeated corner {i}/{j} in projection"
                )
    sign = 0
    convex = True
    for i in range(n):
        ex0, ey0 = edges[i]
        ex1, ey1 = edges[(i + 1) % n]
        c = ex0 * ey1 - ey0 * ex1
        if abs(c) <= eps:
            continue
        s = 1 if c > 0 else -1
        if sign == 0:
            sign = s
        elif s != sign:
            convex = False
            break
    if convex:
        # Same-sign turns alone do not prove simplicity (a star has uniform
        # turns): refuse the fan when edges intersect or spike instead of a
        # silent wrong triangulation.
        blocker = _fan_blocker(proj, eps)
        if blocker is not None:
            sys.exit(
                f"unsupported degenerate/self-intersecting face in {path} face {face_index}: "
                f"self-intersecting polygon ({blocker}); convex fan refused"
            )
        return [(0, i, i + 1) for i in range(1, n - 1)]
    # Ear clipping on the projected polygon. Clipping runs on CCW corner
    # order; output triangles are mapped back to the authored winding below.
    area2 = sum(proj[i][0] * proj[(i + 1) % n][1] - proj[(i + 1) % n][0] * proj[i][1] for i in range(n))
    if abs(area2) <= eps:
        sys.exit(f"unsupported degenerate/self-intersecting face in {path} face {face_index}")
    idx = list(range(n))
    reversed_winding = area2 < 0
    if reversed_winding:
        idx.reverse()

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def in_tri(p, a, b, c):
        c1 = cross(p, a, b)
        c2 = cross(p, b, c)
        c3 = cross(p, c, a)
        return (c1 > eps and c2 > eps and c3 > eps) or (c1 < -eps and c2 < -eps and c3 < -eps)

    tris = []
    guard = n * n
    while len(idx) > 3 and guard > 0:
        guard -= 1
        ear = -1
        m = len(idx)
        for k in range(m):
            prev, cur, nxt = idx[(k - 1) % m], idx[k], idx[(k + 1) % m]
            if cross(proj[prev], proj[cur], proj[nxt]) <= eps:
                continue  # reflex (or collinear): not an ear tip
            ok = True
            for j in idx:
                if j in (prev, cur, nxt):
                    continue
                if in_tri(proj[j], proj[prev], proj[cur], proj[nxt]):
                    ok = False
                    break
            if ok:
                ear = k
                break
        if ear == -1:
            sys.exit(f"unsupported degenerate/self-intersecting face in {path} face {face_index}")
        m = len(idx)
        prev, cur, nxt = idx[(ear - 1) % m], idx[ear], idx[(ear + 1) % m]
        tris.append((prev, cur, nxt))
        del idx[ear]
    if guard <= 0 or len(idx) != 3:
        sys.exit(f"unsupported degenerate/self-intersecting face in {path} face {face_index}")
    tris.append((idx[0], idx[1], idx[2]))
    if reversed_winding:
        # Ear clipping ran on the reversed (CCW) order: flip each triangle
        # back so CW faces keep their authored orientation instead of being
        # silently converted to CCW. Same vertices, same area magnitude.
        tris = [(a, c, b) for (a, b, c) in tris]
    return tris


meshes_out, nodes, accessors, views = [], [], [], []
blobs = []
all_pos = []
total_tris = 0
mesh_names = []
name_use = {}
for mprim in occs:
    mesh = UsdGeom.Mesh(mprim)
    counts = list(mesh.GetFaceVertexCountsAttr().Get(t) or [])
    indices = list(mesh.GetFaceVertexIndicesAttr().Get(t) or [])
    points = list(mesh.GetPointsAttr().Get(t) or [])
    normals = list(mesh.GetNormalsAttr().Get(t) or [])
    assert points and counts and indices, f"mesh {mprim.GetPath()} must carry points/faces"
    assert len(normals) == len(indices), f"faceVarying count {mprim.GetPath()}"
    # Full per-occurrence world transform (instance chain + prototype-local
    # offsets resolved by USD for this proxy prim).
    w = xc.GetLocalToWorldTransform(mprim)
    check_rigid(str(mprim.GetPath()), w)

    def world_of(p):
        x, y, z = p[0], p[1], p[2]
        return (
            w[0][0] * x + w[1][0] * y + w[2][0] * z + w[3][0],
            w[0][1] * x + w[1][1] * y + w[2][1] * z + w[3][1],
            w[0][2] * x + w[1][2] * y + w[2][2] * z + w[3][2],
        )

    def rot_n(n):
        x, y, z = n[0], n[1], n[2]
        return (
            w[0][0] * x + w[1][0] * y + w[2][0] * z,
            w[0][1] * x + w[1][1] * y + w[2][1] * z,
            w[0][2] * x + w[1][2] * y + w[2][2] * z,
        )

    pos, nrm = [], []
    corner = 0
    tris = 0
    for fi, c in enumerate(counts):
        face_pts = [points[indices[corner + k]] for k in range(c)]
        for tri in triangulate_face(str(mprim.GetPath()), fi, face_pts):
            for k in tri:
                pos.extend(zup_to_yup(world_of(points[indices[corner + k]])))
                nrm.extend(zup_to_yup(rot_n(normals[corner + k])))
            tris += 1
        corner += c
    total_tris += tris
    all_pos.extend(pos)
    vcount = tris * 3
    pmin = [min(pos[i::3]) for i in range(3)]
    pmax = [max(pos[i::3]) for i in range(3)]
    pb = struct.pack(f"<{len(pos)}f", *pos)
    nb = struct.pack(f"<{len(nrm)}f", *nrm)
    off = sum(len(b) for b in blobs)
    blobs += [pb, nb]
    ai = len(accessors)
    accessors += [
        {"bufferView": len(views), "componentType": 5126, "count": vcount, "type": "VEC3", "min": pmin, "max": pmax},
        {"bufferView": len(views) + 1, "componentType": 5126, "count": vcount, "type": "VEC3"},
    ]
    views += [
        {"buffer": 0, "byteOffset": off, "byteLength": len(pb), "target": 34962},
        {"buffer": 0, "byteOffset": off + len(pb), "byteLength": len(nb), "target": 34962},
    ]
    leaf = str(mprim.GetPath()).split("/")[-1]
    name_use[leaf] = name_use.get(leaf, 0) + 1
    name = leaf if name_use[leaf] == 1 else f"{leaf}#{name_use[leaf]}"
    mesh_names.append(name)
    meshes_out.append({"name": name, "primitives": [{"attributes": {"POSITION": ai, "NORMAL": ai + 1}, "material": 0, "mode": 4}]})
    nodes.append({"mesh": len(meshes_out) - 1, "name": name})

tmin = [min(all_pos[i::3]) for i in range(3)]
tmax = [max(all_pos[i::3]) for i in range(3)]
exp_min = [src_min[0], src_min[2], -src_max[1]]
exp_max = [src_max[0], src_max[2], -src_min[1]]
cal = all(abs(tmin[i] - exp_min[i]) < 0.001 and abs(tmax[i] - exp_max[i]) < 0.001 for i in range(3))
assert cal, f"bounds {tmin}/{tmax} != mapped {exp_min}/{exp_max}"

bin_blob = b"".join(blobs)
gltf = {
    "asset": {"version": "2.0", "generator": "LayoutLab W1 warehouse-section-usd-to-glb.py (usd-core)"},
    "scene": 0,
    "scenes": [{"nodes": list(range(len(nodes))), "name": asset}],
    "nodes": nodes,
    "meshes": meshes_out,
    "materials": [{
        "name": f"layoutlab-fallback-{asset}",
        "doubleSided": True,
        "pbrMetallicRoughness": {"baseColorFactor": base, "metallicFactor": 0.0, "roughnessFactor": 0.9},
    }],
    "accessors": accessors,
    "bufferViews": views,
    "buffers": [{"byteLength": len(bin_blob)}],
    "extensionsUsed": [],
}
jb = json.dumps(gltf, separators=(",", ":")).encode()
while len(jb) % 4:
    jb += b" "
while len(bin_blob) % 4:
    bin_blob += b"\x00"
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(bin_blob)) + struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(bin_blob), 0x004E4942) + bin_blob
with open(out_path, "wb") as f:
    f.write(glb)
print(json.dumps({
    "out": out_path, "glbBytes": len(glb), "asset": asset, "meshCount": len(occs), "meshNames": mesh_names,
    "triangles": total_tris, "soupVertices": total_tris * 3,
    "sourceBoundsMin_m": [round(v, 6) for v in src_min], "sourceBoundsMax_m": [round(v, 6) for v in src_max],
    "glbBoundsMin_m": [round(v, 6) for v in tmin], "glbBoundsMax_m": [round(v, 6) for v in tmax],
    "calibratedWithin1mm": cal, "material": f"fallback {base[:3]} (MDL/textures/UVs/subsets NOT preserved)",
}, indent=2))
