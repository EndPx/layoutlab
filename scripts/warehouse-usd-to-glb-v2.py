"""R1 USD -> GLB v2 conversion: source materials, UVs and splits preserved.

Successor to warehouse-section-usd-to-glb.py (v1). Same occurrence-preserving
geometry contract (rigid transforms only, winding-preserving triangulation,
face-varying normals, Z-up -> Y-up, 1mm bounds calibration), PLUS:

- Per-face material assignment from GeomSubset (materialBind family) with
  mesh-level UsdShade binding as fallback; one GLB primitive per material
  per mesh occurrence. A face claimed by two subsets FAILS explicitly.
- Face-varying `st` primvar carried to TEXCOORD_0 (V flipped to the glTF
  convention). Missing or non-faceVarying `st` FAILS explicitly instead of
  silently dropping UVs again.
- UsdPreviewSurface networks recovered per source material: Albedo ->
  baseColorTexture (sRGB), ORM -> metallicRoughnessTexture (glTF G/B match
  the USD roughness/metallic channel connections), Normal -> normalTexture.
  With --embed-textures the referenced PNGs (resolved at
  <root-usd-dir>/Textures/, where the source @../Textures/...@ paths land)
  are embedded byte-for-byte and hashed in the report. UDIM (<UDIM>) sets
  cannot be expressed in glTF and are never embedded.
- Materials that cannot be textured (UDIM, --no-textures, or a constant
  diffuse) use the documented replacement factors from
  scripts/warehouse-r1-materials.json and are named
  layoutlab-replacement-<source>; textured ones are named
  layoutlab-source-<source>. A source material with no config entry FAILS
  explicitly — no silent flat color is ever invented here.

Usage:
  python scripts/warehouse-usd-to-glb-v2.py <root.usd> <out.glb> <asset-name> \
      [--embed-textures|--no-textures] [materials.json]
"""
import hashlib
import json
import os
import struct
import sys

from pxr import Usd, UsdGeom, UsdShade

root, out_path, asset = sys.argv[1], sys.argv[2], sys.argv[3]
embed_textures = "--embed-textures" in sys.argv[4:]
materials_cfg = {}
_cfg_args = [a for a in sys.argv[4:] if a.endswith(".json")]
if _cfg_args:
    with open(_cfg_args[0], encoding="utf-8") as f:
        materials_cfg = json.load(f).get("materials", {})
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

# ---- Source material discovery (bindings + subsets + preview networks) ----
tex_dir = os.path.join(os.path.dirname(os.path.abspath(root)), "Textures")


def _conn_source_prim(shader_input):
    """Prim path of the shader feeding one UsdPreviewSurface input, or None."""
    conns = shader_input.GetAttr().GetConnections()
    if not conns:
        return None
    path = str(conns[0])
    return path.rsplit(".outputs:", 1)[0].strip("<>")


def _material_network(mat_prim):
    """Recover {albedo, orm, normal, uvScale, diffuseConstant} for one material."""
    net = {"albedo": None, "orm": None, "normal": None, "uvScale": (1.0, 1.0), "diffuseConstant": None}
    shaders = {}
    preview = None
    for child in mat_prim.GetChildren():
        if child.IsA(UsdShade.Shader):
            shaders[str(child.GetPath())] = UsdShade.Shader(child)
            if str(UsdShade.Shader(child).GetIdAttr().Get()) == "UsdPreviewSurface":
                preview = UsdShade.Shader(child)
    if preview is None:
        return net
    role_by_input = {"diffuseColor": "albedo", "roughness": "orm", "metallic": "orm", "normal": "normal"}
    for inp in preview.GetInputs():
        role = role_by_input.get(inp.GetBaseName())
        src = _conn_source_prim(inp)
        if role and src and src in shaders:
            tex = shaders[src]
            f = tex.GetInput("file").Get() if tex.GetInput("file") else None
            if f is not None:
                net[role] = str(f.path) if hasattr(f, "path") else str(f)
            st_src = _conn_source_prim(tex.GetInput("st")) if tex.GetInput("st") else None
            if st_src and st_src in shaders:
                scale_inp = shaders[st_src].GetInput("scale")
                if scale_inp and scale_inp.Get() is not None:
                    s = scale_inp.Get()
                    net["uvScale"] = (float(s[0]), float(s[1]))
        elif inp.GetBaseName() == "diffuseColor" and src is None:
            v = inp.Get()
            if v is not None:
                net["diffuseConstant"] = [float(v[0]), float(v[1]), float(v[2])]
    return net


_subset_overlaps = []  # faces claimed by 2+ subsets (last wins, counted)
_mat_registry = []  # ordered GLB materials
_mat_index = {}  # source material name -> registry index
_mat_report = []


def register_material(mat_prim):
    name = mat_prim.GetName()
    if name in _mat_index:
        return _mat_index[name]
    net = _material_network(mat_prim)
    files = {k: net[k] for k in ("albedo", "orm", "normal") if net[k]}
    udim = any("<UDIM>" in v for v in files.values())
    textured = bool(embed_textures and net["albedo"] and not udim)
    entry = {"sourceName": name, "network": net, "textured": textured, "udim": udim}
    if textured:
        for role, authored in files.items():
            resolved = os.path.join(tex_dir, os.path.basename(authored))
            if not os.path.isfile(resolved):
                sys.exit(f"--embed-textures: source texture missing for {name}: {resolved} (authored {authored})")
            entry[role + "Path"] = resolved
        entry["glbName"] = f"layoutlab-source-{name}"
    else:
        cfg = materials_cfg.get(name)
        if cfg is None and net["diffuseConstant"] is not None:
            cfg = {"baseColorFactor": net["diffuseConstant"] + [1.0], "metallicFactor": 0.0,
                   "roughnessFactor": 0.6, "role": "source constant diffuse"}
        if cfg is None:
            sys.exit(f"no replacement factors configured for source material {name} "
                     f"(add it to scripts/warehouse-r1-materials.json; refusing a silent flat color)")
        entry["factors"] = cfg
        entry["glbName"] = f"layoutlab-replacement-{name}"
    _mat_index[name] = len(_mat_registry)
    _mat_registry.append(entry)
    _mat_report.append({"source": name, "glb": entry["glbName"], "textured": textured,
                        "udim": udim, "uvScale": list(net["uvScale"]),
                        "files": {k: os.path.basename(v) for k, v in files.items()}})
    return _mat_index[name]


def face_materials(mesh_prim):
    """Per-face GLB material index from subsets, mesh binding as fallback."""
    mesh = UsdGeom.Mesh(mesh_prim)
    counts = list(mesh.GetFaceVertexCountsAttr().Get(t) or [])
    bound, _rel = UsdShade.MaterialBindingAPI(mesh_prim).ComputeBoundMaterial()
    default_idx = register_material(bound.GetPrim()) if bound else None
    face_mat = [default_idx] * len(counts)
    for subset in UsdGeom.Subset.GetAllGeomSubsets(UsdGeom.Imageable(mesh_prim)):
        if str(subset.GetFamilyNameAttr().Get()) != "materialBind":
            continue
        smat, _r = UsdShade.MaterialBindingAPI(subset.GetPrim()).ComputeBoundMaterial()
        if not smat:
            sys.exit(f"subset {subset.GetPrim().GetPath()} has no bound material")
        idx = register_material(smat.GetPrim())
        for fi in list(subset.GetIndicesAttr().Get() or []):
            # Source subsets may overlap (the cart deck faces are claimed by
            # two materialBind subsets). USD gives no priority, so the LAST
            # subset in traversal order wins deterministically and every
            # overlap is counted in the report — never silently dropped.
            if face_mat[fi] is not None and face_mat[fi] != idx and face_mat[fi] != default_idx:
                _subset_overlaps.append(fi)
            face_mat[fi] = idx
    if any(i is None for i in face_mat):
        sys.exit(f"mesh {mesh_prim.GetPath()} has faces with no material binding")
    return face_mat


def mesh_st(mesh_prim, corner_count):
    """Face-varying st values aligned with faceVertexIndices order."""
    for pv in UsdGeom.PrimvarsAPI(mesh_prim).GetPrimvars():
        if pv.GetName() != "primvars:st":
            continue
        if str(pv.GetInterpolation()) != "faceVarying":
            sys.exit(f"st on {mesh_prim.GetPath()} is {pv.GetInterpolation()}, expected faceVarying")
        vals = list(pv.Get(t) or [])
        if pv.IsIndexed():
            idx = list(pv.GetIndices(t) or [])
            if len(idx) != corner_count:
                sys.exit(f"st index count {len(idx)} != corner count {corner_count} on {mesh_prim.GetPath()}")
            vals = [vals[i] for i in idx]
        if len(vals) != corner_count:
            sys.exit(f"st count {len(vals)} != corner count {corner_count} on {mesh_prim.GetPath()}")
        return vals
    sys.exit(f"mesh {mesh_prim.GetPath()} carries no primvars:st (refusing to drop UVs)")


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

    # Group corners by source material (subsets/binding), carrying st -> UV.
    face_mat = face_materials(mprim)
    sts = mesh_st(mprim, len(indices))
    groups = {}  # material index -> [pos, nrm, uv]
    order = []
    corner = 0
    tris = 0
    for fi, c in enumerate(counts):
        mi = face_mat[fi]
        if mi not in groups:
            groups[mi] = ([], [], [])
            order.append(mi)
        gp, gn, gu = groups[mi]
        face_pts = [points[indices[corner + k]] for k in range(c)]
        for tri in triangulate_face(str(mprim.GetPath()), fi, face_pts):
            for k in tri:
                ci = corner + k
                gp.extend(zup_to_yup(world_of(points[indices[ci]])))
                gn.extend(zup_to_yup(rot_n(normals[ci])))
                uv = sts[ci]
                gu.extend((float(uv[0]), 1.0 - float(uv[1])))
            tris += 1
        corner += c
    total_tris += tris
    for gp, _gn, _gu in groups.values():
        all_pos.extend(gp)
    leaf = str(mprim.GetPath()).split("/")[-1]
    name_use[leaf] = name_use.get(leaf, 0) + 1
    name = leaf if name_use[leaf] == 1 else f"{leaf}#{name_use[leaf]}"
    mesh_names.append(name)
    prims = []
    for mi in order:
        gp, gn, gu = groups[mi]
        vcount = len(gp) // 3
        pmin = [min(gp[i::3]) for i in range(3)]
        pmax = [max(gp[i::3]) for i in range(3)]
        pb = struct.pack(f"<{len(gp)}f", *gp)
        nb = struct.pack(f"<{len(gn)}f", *gn)
        ub = struct.pack(f"<{len(gu)}f", *gu)
        off = sum(len(b) for b in blobs)
        blobs += [pb, nb, ub]
        ai = len(accessors)
        accessors += [
            {"bufferView": len(views), "componentType": 5126, "count": vcount, "type": "VEC3", "min": pmin, "max": pmax},
            {"bufferView": len(views) + 1, "componentType": 5126, "count": vcount, "type": "VEC3"},
            {"bufferView": len(views) + 2, "componentType": 5126, "count": vcount, "type": "VEC2"},
        ]
        views += [
            {"buffer": 0, "byteOffset": off, "byteLength": len(pb), "target": 34962},
            {"buffer": 0, "byteOffset": off + len(pb), "byteLength": len(nb), "target": 34962},
            {"buffer": 0, "byteOffset": off + len(pb) + len(nb), "byteLength": len(ub), "target": 34962},
        ]
        prims.append({"attributes": {"POSITION": ai, "NORMAL": ai + 1, "TEXCOORD_0": ai + 2}, "material": mi, "mode": 4})
    meshes_out.append({"name": name, "primitives": prims})
    nodes.append({"mesh": len(meshes_out) - 1, "name": name})

tmin = [min(all_pos[i::3]) for i in range(3)]
tmax = [max(all_pos[i::3]) for i in range(3)]
exp_min = [src_min[0], src_min[2], -src_max[1]]
exp_max = [src_max[0], src_max[2], -src_min[1]]
cal = all(abs(tmin[i] - exp_min[i]) < 0.001 and abs(tmax[i] - exp_max[i]) < 0.001 for i in range(3))
assert cal, f"bounds {tmin}/{tmax} != mapped {exp_min}/{exp_max}"

# ---- Textures (embedded byte-for-byte) + GLB materials ----
images, gltf_textures, samplers = [], [], [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
_img_index = {}  # resolved path -> image index
_tex_index = {}  # (image index, uvScale) -> texture index
_tex_report = []
uses_transform = False


def texture_for(path, uv_scale):
    global uses_transform
    if path not in _img_index:
        with open(path, "rb") as f:
            data = f.read()
        off = sum(len(b) for b in blobs)
        blobs.append(data)
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data)})
        _img_index[path] = len(images)
        images.append({"bufferView": len(views) - 1, "mimeType": "image/png",
                       "name": os.path.basename(path)})
        _tex_report.append({"file": os.path.basename(path), "bytes": len(data),
                            "sha256": hashlib.sha256(data).hexdigest()})
    key = (_img_index[path], uv_scale)
    if key not in _tex_index:
        tex = {"source": _img_index[path], "sampler": 0}
        if tuple(uv_scale) != (1.0, 1.0):
            uses_transform = True
            tex["extensions"] = {"KHR_texture_transform": {"offset": [0.0, 0.0], "scale": list(uv_scale)}}
        _tex_index[key] = len(gltf_textures)
        gltf_textures.append(tex)
    return _tex_index[key]


gltf_materials = []
for entry in _mat_registry:
    net = entry["network"]
    if entry["textured"]:
        pbr = {"baseColorFactor": [1.0, 1.0, 1.0, 1.0], "metallicFactor": 1.0, "roughnessFactor": 1.0,
               "baseColorTexture": {"index": texture_for(entry["albedoPath"], net["uvScale"])}}
        if entry.get("ormPath"):
            pbr["metallicRoughnessTexture"] = {"index": texture_for(entry["ormPath"], net["uvScale"])}
        mat = {"name": entry["glbName"], "doubleSided": True, "pbrMetallicRoughness": pbr}
        if entry.get("normalPath"):
            mat["normalTexture"] = {"index": texture_for(entry["normalPath"], net["uvScale"]), "scale": 1.0}
    else:
        cfg = entry["factors"]
        mat = {"name": entry["glbName"], "doubleSided": True,
               "pbrMetallicRoughness": {"baseColorFactor": cfg["baseColorFactor"],
                                        "metallicFactor": cfg["metallicFactor"],
                                        "roughnessFactor": cfg["roughnessFactor"]}}
    gltf_materials.append(mat)

bin_blob = b"".join(blobs)
gltf = {
    "asset": {"version": "2.0", "generator": "LayoutLab R1 warehouse-usd-to-glb-v2.py (usd-core)"},
    "scene": 0,
    "scenes": [{"nodes": list(range(len(nodes))), "name": asset}],
    "nodes": nodes,
    "meshes": meshes_out,
    "materials": gltf_materials,
    "images": images,
    "textures": gltf_textures,
    "samplers": samplers,
    "accessors": accessors,
    "bufferViews": views,
    "buffers": [{"byteLength": len(bin_blob)}],
    "extensionsUsed": ["KHR_texture_transform"] if uses_transform else [],
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
    "calibratedWithin1mm": cal,
    "materials": _mat_report,
    "subsetOverlapsLastWins": len(_subset_overlaps),
    "texturesEmbedded": _tex_report,
    "extensionsUsed": gltf["extensionsUsed"],
}, indent=2))
