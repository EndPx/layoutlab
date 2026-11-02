// Operations 3D viewport: the main-environment warehouse canvas.
//
// Renders the canonical OperationsScene (fixture positions + bindings) with
// instanced sourced GLBs: floor tiles, six racks, 336 shelf containers,
// six parked carts, two packing stations, perimeter walls and two
// entrances (display-only cutaway above 2.5 m), staging outlines, waiting
// discs, and approach markers. Camera presets: Overview (isometric),
// Top (same configuration), Inspect (frames the selection), Reset.
// View-only orbit/zoom/pan; single render per state change; no auto-motion.
// A GLB that fails to load is reported truthfully in the status line and
// renders nothing: required models are never replaced by silent proxy cubes.
// Custom annotations (outlines, discs, markers, chips) are labeled as such
// in the developer diagnostics, following the W1 convention.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { OperationsScene, OperationsSelection } from "../lib/operations";

const MM = 0.001;
const LABEL_GAP_PX = 10;
const LABEL_PAD_PX = 4;

export type LabelLayer = "areas" | "slots" | "all";

export type OpsRenderStats = {
  triangles: number;
  drawCalls: number;
  geometries: number;
  containers: number;
  loadMs: number | null;
  assets: { url: string; status: "loading" | "loaded" | "error"; detail: string }[];
};

// Module-level GLB cache: one network fetch per URL per page lifetime.
const glbCache = new Map<string, Promise<THREE.Group>>();

function loadGlb(url: string): Promise<THREE.Group> {
  let p = glbCache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene);
    glbCache.set(url, p);
  }
  return p;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type MeshEntry = { geometry: THREE.BufferGeometry; material: THREE.Material };

function meshesOf(group: THREE.Group): MeshEntry[] {
  const out: MeshEntry[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      out.push({ geometry: o.geometry, material: o.material as THREE.Material });
    }
  });
  return out;
}

export function OperationsView(props: {
  scene: OperationsScene;
  selection: OperationsSelection;
  labelLayer: LabelLayer;
  onStats: (stats: OpsRenderStats) => void;
}): React.JSX.Element {
  const { scene: ops, selection, labelLayer, onStats } = props;
  const [preset, setPreset] = useState<"overview" | "top" | "inspect" | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const savedCamRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const homeRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const statsRef = useRef<OpsRenderStats>({ triangles: 0, drawCalls: 0, geometries: 0, containers: 0, loadMs: null, assets: [] });
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    const t0 = performance.now();
    delete mount.dataset["cam"];
    delete mount.dataset["camPos"];
    delete mount.dataset["camDist"];
    delete mount.dataset["labelOverlap"];
    mount.dataset["anchors"] = ops.locations
      .map((l) => `${l.id}:${l.anchorMm.x},${l.anchorMm.z},${l.anchorMm.y}`)
      .join(";");
    mount.dataset["containers"] = String(ops.counts.containers);
    mount.dataset["selection"] = selection ? `${selection.kind}:${selection.id}` : "none";
    mount.dataset["labelLayer"] = labelLayer;
    mount.dataset["preset"] = preset ?? "manual";
    if (statusRef.current) statusRef.current.textContent = "Environment: loading sourced geometry…";

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      mount.textContent = "3D unavailable (no WebGL); the fixture data tables in diagnostics remain available.";
      return;
    }
    renderer.localClippingEnabled = true;
    const W = Math.max(240, Math.min(1100, mount.clientWidth || 700));
    const H = W < 520 ? Math.max(300, Math.round((W * 9) / 14)) : Math.min(460, Math.round((W * 9) / 16));
    const size = { w: W, h: H };
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(W, H);
    labelRenderer.domElement.className = "labels3d";
    const leaderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    leaderSvg.setAttribute("class", "leaders3d");
    leaderSvg.setAttribute("aria-hidden", "true");
    leaderSvg.setAttribute("width", String(W));
    leaderSvg.setAttribute("height", String(H));
    mount.replaceChildren(renderer.domElement, leaderSvg, labelRenderer.domElement);

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0xfbfcfe);
    const roomW = ops.roomMm.width * MM;
    const roomD = ops.roomMm.depth * MM;
    const center = new THREE.Vector3(roomW / 2, 0, roomD / 2);
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 300);
    const overviewPos = new THREE.Vector3(center.x + 11, 20, center.z + 12);
    camera.position.copy(overviewPos);
    camera.lookAt(center);
    camera.up.set(0, 1, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 1;
    controls.maxDistance = 80;
    controls.target.copy(center);
    controls.update();
    homeRef.current = { pos: overviewPos.clone(), target: center.clone() };
    // The operations geometry never changes, so every rebuild (selection,
    // label layer) keeps the user's camera, including chosen presets.
    const saved = savedCamRef.current;
    if (saved) {
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
      controls.update();
    }
    controlsRef.current = controls;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "3D operations warehouse view. Arrow keys pan the camera.");
    controls.listenToKeyEvents(renderer.domElement);

    threeScene.add(new THREE.HemisphereLight(0xffffff, 0xdfe6f0, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(center.x + 8, 18, center.z + 8);
    threeScene.add(key);
    const fill = new THREE.DirectionalLight(0xe8f2f2, 0.35);
    fill.position.set(center.x - 10, 10, center.z - 8);
    threeScene.add(fill);

    type Label3D = { anchor: THREE.Vector3; chip: HTMLDivElement; leader: SVGLineElement };
    const labels3d: Label3D[] = [];
    // Inspect focus: hide non-selected chips farther than 9 m from the
    // inspected anchor so distant labels cannot pile onto a close view.
    const focus = ((): { x: number; y: number; z: number } | null => {
      if (preset !== "inspect" || !selection) return null;
      if (selection.kind === "location") {
        const l = ops.locations.find((x) => x.id === selection.id);
        return l ? { x: l.anchorMm.x * MM, y: l.anchorMm.y * MM, z: l.anchorMm.z * MM } : null;
      }
      if (selection.kind === "rack") {
        const r = ops.racks.find((x) => x.id === selection.id);
        return r ? { x: r.positionMm.x * MM, y: 1.2, z: r.positionMm.z * MM } : null;
      }
      if (selection.kind === "unit") {
        const u = ops.units.find((x) => x.id === selection.id);
        return u ? { x: u.parkingMm.x * MM, y: 0.7, z: u.parkingMm.z * MM } : null;
      }
      const r = ops.resources.find((x) => x.id === selection.id);
      if (!r?.service[0]) return null;
      const st = ops.stations.find((x) => x.id === selection.id);
      return st ? { x: ((st.centerMm.x + r.service[0].x) / 2) * MM, y: 0.6, z: ((st.centerMm.z + r.service[0].z) / 2) * MM } : { x: r.service[0].x * MM, y: 0.6, z: r.service[0].z * MM };
    })();
    const addLabel = (text: string, cls: string, x: number, y: number, z: number): void => {
      if (focus && !cls.includes("selected")) {
        const dx = x - focus.x, dy = y - focus.y, dz = z - focus.z;
        if (dx * dx + dy * dy + dz * dz > 81) return;
      }
      const wrap = document.createElement("div");
      wrap.className = "tag3d-wrap";
      const chip = document.createElement("div");
      chip.className = `tag3d ${cls}`;
      chip.textContent = text;
      wrap.appendChild(chip);
      const obj = new CSS2DObject(wrap);
      obj.position.set(x, y, z);
      threeScene.add(obj);
      const leader = document.createElementNS("http://www.w3.org/2000/svg", "line");
      leader.setAttribute("class", "leader3d");
      leaderSvg.appendChild(leader);
      labels3d.push({ anchor: new THREE.Vector3(x, y, z), chip, leader });
    };

    const assetStatus = new Map<string, { status: "loading" | "loaded" | "error"; detail: string }>();
    const statAssets = (): OpsRenderStats["assets"] =>
      [...assetStatus.entries()].map(([url, s]) => ({ url, status: s.status, detail: s.detail }));
    const reportStatus = (): void => {
      const entries = [...assetStatus.entries()];
      const failed = entries.filter(([, s]) => s.status === "error");
      const loading = entries.filter(([, s]) => s.status === "loading");
      if (statusRef.current) {
        statusRef.current.textContent =
          failed.length > 0
            ? `Environment geometry INCOMPLETE: ${failed.map(([u]) => u).join(", ")} failed (${failed[0]?.[1].detail}); showing loaded assets only.`
            : loading.length > 0
              ? `Environment: loading sourced geometry (${entries.length - loading.length}/${entries.length})…`
              : `Environment: ${entries.length} sourced assets loaded (CC-BY-4.0 NVIDIA SimReady derivatives); outlines/markers/chips are custom annotations.`;
      }
      mount.dataset["assets"] = entries.map(([u, s]) => `${u.split("/").pop()}:${s.status}`).join(";");
    };

    // Custom annotations (labeled as such): staging outlines, waiting discs,
    // parking outlines, service markers, approach marker for the selection.
    const annoGroup = new THREE.Group();
    threeScene.add(annoGroup);
    const zoneLineMat = new THREE.LineBasicMaterial({ color: 0x8a5a00 });
    const zoneFillMat = new THREE.MeshBasicMaterial({ color: 0x8a5a00, transparent: true, opacity: 0.06, depthWrite: false });
    const discMat = new THREE.MeshBasicMaterial({ color: 0x0b6b6e, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    const discSelMat = new THREE.MeshBasicMaterial({ color: 0x0b6b6e, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const markerSelMat = new THREE.MeshBasicMaterial({ color: 0x0b6b6e });

    const roomOutline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.03, 0),
        new THREE.Vector3(roomW, 0.03, 0),
        new THREE.Vector3(roomW, 0.03, roomD),
        new THREE.Vector3(0, 0.03, roomD),
      ]),
      new THREE.LineBasicMaterial({ color: 0x1a2333 }),
    );
    annoGroup.add(roomOutline);

    for (const o of ops.obstacles) {
      if (o.visual !== "staging-zone") continue;
      const y = 0.02;
      annoGroup.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(o.minX * MM, y, o.minZ * MM),
          new THREE.Vector3(o.maxX * MM, y, o.minZ * MM),
          new THREE.Vector3(o.maxX * MM, y, o.maxZ * MM),
          new THREE.Vector3(o.minX * MM, y, o.minZ * MM),
        ]),
        zoneLineMat,
      ));
      const fillPlane = new THREE.Mesh(new THREE.PlaneGeometry((o.maxX - o.minX) * MM, (o.maxZ - o.minZ) * MM), zoneFillMat);
      fillPlane.rotation.x = -Math.PI / 2;
      fillPlane.position.set(((o.minX + o.maxX) / 2) * MM, y, ((o.minZ + o.maxZ) / 2) * MM);
      annoGroup.add(fillPlane);
    }

    const discGeo = new THREE.CircleGeometry(0.45, 24);
    for (const r of ops.resources) {
      for (const q of r.queue) {
        const selected = selection?.kind === "resource" && selection.id === r.id;
        const disc = new THREE.Mesh(discGeo, selected ? discSelMat : discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(q.x * MM, 0.03, q.z * MM);
        annoGroup.add(disc);
      }
      for (const s of r.service) {
        const selected = selection?.kind === "resource" && selection.id === r.id;
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), selected ? markerSelMat : markerMat);
        marker.position.set(s.x * MM, 0.3, s.z * MM);
        annoGroup.add(marker);
      }
    }

    // Parking outlines: declared 600x800 unit footprints at each slot.
    const parkLineMat = new THREE.LineBasicMaterial({ color: 0x51607a });
    for (const u of ops.units) {
      const hw = 0.3, hl = 0.4;
      const cx = u.parkingMm.x * MM, cz = u.parkingMm.z * MM;
      annoGroup.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(cx - hw, 0.025, cz - hl),
          new THREE.Vector3(cx + hw, 0.025, cz - hl),
          new THREE.Vector3(cx + hw, 0.025, cz + hl),
          new THREE.Vector3(cx - hw, 0.025, cz + hl),
        ]),
        parkLineMat,
      ));
    }

    const shownApproaches = new Set<string>();
    if (selection?.kind === "location") {
      const loc = ops.locations.find((l) => l.id === selection.id);
      if (loc) {
        shownApproaches.add(loc.id);
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), markerSelMat);
        marker.position.set(loc.approachMm.x * MM, 0.16, loc.approachMm.z * MM);
        annoGroup.add(marker);
      }
    }
    mount.dataset["approachesShown"] = [...shownApproaches].join(",");

    const showAreas = labelLayer === "areas" || labelLayer === "all";
    const showSlots = labelLayer === "slots" || labelLayer === "all";
    const isSel = (kind: string, id: string): boolean => selection?.kind === kind && selection.id === id;
    if (showAreas) {
      for (const r of ops.racks) {
        addLabel(`${r.id}${isSel("rack", r.id) ? " ◆Selected" : ""}`, isSel("rack", r.id) ? "rack selected" : "rack", r.positionMm.x * MM, r.dimsMm.height * MM + 0.25, r.positionMm.z * MM);
      }
      for (const r of ops.resources) {
        const s0 = r.service[0]!;
        const kindLabel = r.kind === "receiving" ? "Receiving" : r.kind === "packing" ? "Packing" : "Dispatch";
        addLabel(`${r.id} · ${kindLabel}${isSel("resource", r.id) ? " ◆Selected" : ""}`, isSel("resource", r.id) ? "loc selected" : "loc", s0.x * MM, 1.5, s0.z * MM);
      }
      // Unit chips stagger in height so the six parking labels separate in
      // top view (display only; leaders still start at the true anchors).
      ops.units.forEach((u, i) => {
        addLabel(`${u.id} · ${u.role}${isSel("unit", u.id) ? " ◆Selected" : ""}`, isSel("unit", u.id) ? "loc selected" : "loc", u.parkingMm.x * MM, 1.7 + (i % 3) * 0.7, u.parkingMm.z * MM);
      });
      addLabel("Receiving entrance", "pack", 4, 2.7, 17.2);
      addLabel("Dispatch exit", "pack", 20, 2.7, 17.2);
    }
    for (const l of ops.locations) {
      const selected = isSel("location", l.id);
      if (showSlots || selected) {
        const stock = l.productId ? `${l.productId} ×${l.quantity}` : "empty";
        addLabel(`${l.id} · ${stock}${selected ? " ◆Selected" : ""}`, selected ? "loc selected" : "loc", l.anchorMm.x * MM, (l.anchorMm.y + l.usableMm.height) * MM + 0.15, l.anchorMm.z * MM);
      }
    }

    const decollide = (): void => {
      if (cancelled || labels3d.length === 0) return;
      camera.updateMatrixWorld();
      type Item = { l: (typeof labels3d)[number]; sx: number; sy: number; w: number; h: number };
      const items: Item[] = labels3d.map((l) => {
        const p = l.anchor.clone().project(camera);
        const r = l.chip.getBoundingClientRect();
        return {
          l,
          sx: (p.x * 0.5 + 0.5) * size.w,
          sy: (-p.y * 0.5 + 0.5) * size.h,
          w: (r.width > 0 ? Math.ceil(r.width) : 80) + 4,
          h: (r.height > 0 ? Math.ceil(r.height) : 20) + 4,
        };
      });
      items.sort((a, b) => a.sy - b.sy || a.sx - b.sx);
      type Rect = { left: number; top: number; right: number; bottom: number };
      const placed: Rect[] = [];
      const overlapsPlaced = (r: Rect): boolean =>
        placed.some(
          (p) =>
            Math.min(r.right, p.right) - Math.max(r.left, p.left) > 0 &&
            Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top) > 0,
        );
      const inside = (r: Rect): boolean => r.left >= 2 && r.top >= 2 && r.right <= size.w - 2 && r.bottom <= size.h - 2;
      const rectAt = (cx: number, top: number, w: number, h: number): Rect => ({
        left: cx - w / 2, top, right: cx + w / 2, bottom: top + h,
      });
      for (const it of items) {
        const baseTop = it.sy - LABEL_GAP_PX - it.h;
        const stepY = it.h + LABEL_PAD_PX;
        const stepX = it.w / 2 + 8;
        const cands: [number, number][] = [[it.sx, baseTop]];
        for (let k = 1; k <= 6; k++) cands.push([it.sx, baseTop - k * stepY]);
        cands.push([it.sx, baseTop + stepY], [it.sx, baseTop + 2 * stepY]);
        for (const s of [-1, 1]) {
          cands.push([it.sx + s * stepX, baseTop], [it.sx + s * 2 * stepX, baseTop]);
          for (let k = 1; k <= 3; k++) {
            cands.push([it.sx + s * stepX, baseTop - k * stepY]);
            cands.push([it.sx + s * stepX, baseTop + k * stepY]);
            cands.push([it.sx + s * 2 * stepX, baseTop - k * stepY]);
          }
          cands.push([it.sx + s * 2 * stepX, baseTop + stepY]);
        }
        for (let k = 3; k <= 6; k++) cands.push([it.sx, baseTop + k * stepY]);
        let best: Rect | null = null;
        for (const [cx, top] of cands) {
          const r = rectAt(cx, top, it.w, it.h);
          if (inside(r) && !overlapsPlaced(r)) {
            best = r;
            break;
          }
        }
        if (!best) {
          let bestCost = Infinity;
          let bx = it.sx;
          let bt = baseTop;
          for (const [cx, top] of cands) {
            const r = rectAt(cx, top, it.w, it.h);
            let cost = 0;
            for (const p of placed) {
              const ox = Math.min(r.right, p.right) - Math.max(r.left, p.left);
              const oy = Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top);
              if (ox > 0 && oy > 0) cost += ox * oy;
            }
            if (!inside(r)) cost += 1e9;
            if (cost < bestCost) {
              bestCost = cost;
              bx = cx;
              bt = top;
            }
          }
          const left = Math.min(Math.max(bx - it.w / 2, 2), Math.max(2, size.w - it.w - 2));
          const top = Math.min(Math.max(bt, 2), Math.max(2, size.h - it.h - 2));
          best = { left, top, right: left + it.w, bottom: top + it.h };
        }
        placed.push(best);
        const cx = (best.left + best.right) / 2;
        const dx = cx - it.sx;
        const dy = best.top - baseTop;
        it.l.chip.style.transform =
          `translate(-50%,-100%) translate(${Math.round(dx * 10) / 10}px,${Math.round((-LABEL_GAP_PX + dy) * 10) / 10}px)`;
        it.l.leader.setAttribute("x1", String(Math.round(it.sx * 10) / 10));
        it.l.leader.setAttribute("y1", String(Math.round(it.sy * 10) / 10));
        it.l.leader.setAttribute("x2", String(Math.round(cx * 10) / 10));
        it.l.leader.setAttribute("y2", String(Math.round(best.bottom * 10) / 10));
        it.l.leader.style.display =
          Math.abs(dx) > 4 || best.bottom < it.sy - LABEL_GAP_PX - 6 || best.top > it.sy - 2 ? "" : "none";
      }
      let overlap = 0;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i]!;
          const b = placed[j]!;
          if (
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0
          ) {
            overlap++;
          }
        }
      }
      mount.dataset["labelOverlap"] = String(overlap);
      mount.dataset["labelCount"] = String(labels3d.length);
    };

    const renderOnce = (): void => {
      if (cancelled) return;
      renderer?.render(threeScene, camera);
      labelRenderer.render(threeScene, camera);
      decollide();
      mount.dataset["cam"] =
        `${round3(controls.target.x)},${round3(controls.target.y)},${round3(controls.target.z)}`;
      mount.dataset["camPos"] =
        `${round3(camera.position.x)},${round3(camera.position.y)},${round3(camera.position.z)}`;
      mount.dataset["camDist"] = String(round3(camera.position.distanceTo(controls.target)));
      if (renderer) {
        statsRef.current = {
          ...statsRef.current,
          triangles: renderer.info.render.triangles,
          drawCalls: renderer.info.render.calls,
          geometries: renderer.info.memory.geometries,
          containers: ops.counts.containers,
          assets: statAssets(),
        };
        mount.dataset["tris"] = String(renderer.info.render.triangles);
        mount.dataset["draws"] = String(renderer.info.render.calls);
      }
    };
    renderRef.current = renderOnce;
    controls.addEventListener("change", renderOnce);
    // Manual orbiting leaves the preset (labels return to the full set).
    // update() dispatches "change", never "start", so presets never loop.
    controls.addEventListener("start", () => {
      if (!cancelled && preset !== null) setPreset(null);
    });
    const resizer = new ResizeObserver(() => {
      if (cancelled) return;
      const w = Math.max(240, Math.min(1100, mount.clientWidth || 700));
      const h = w < 520 ? Math.max(300, Math.round((w * 9) / 14)) : Math.min(460, Math.round((w * 9) / 16));
      size.w = w;
      size.h = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer?.setSize(w, h);
      labelRenderer.setSize(w, h);
      leaderSvg.setAttribute("width", String(w));
      leaderSvg.setAttribute("height", String(h));
      renderOnce();
    });
    resizer.observe(mount);
    renderOnce();

    // Sourced geometry: instanced single-mesh assets, cloned multi-mesh
    // groups. Failures report truthfully and render nothing for that asset.
    const rackUrl = ops.rackGlbUrl;
    const floorUrl = ops.floorGlbUrl;
    const cartUrl = ops.cartGlbUrl;
    const wallUrl = ops.walls[0]?.glbUrl ?? "";
    const entranceUrl = ops.entrances[0]?.glbUrl ?? "";
    const stationUrls = [...new Set(ops.stations.map((s) => s.glbUrl))];
    const allUrls = [...new Set([rackUrl, floorUrl, cartUrl, wallUrl, entranceUrl, ...stationUrls, ...ops.containerGlbs.map((c) => c.glbUrl)].filter(Boolean))];
    for (const u of allUrls) assetStatus.set(u, { status: "loading", detail: "pending" });
    reportStatus();

    const dummy = new THREE.Object3D();
    const placeInstance = (mesh: THREE.InstancedMesh, i: number, xM: number, yM: number, zM: number, yawDeg: number, sx = 1, sy = 1, sz = 1): void => {
      dummy.position.set(xM, yM, zM);
      dummy.rotation.set(0, (yawDeg * Math.PI) / 180, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    };

    void (async () => {
      const loaded = new Map<string, THREE.Group>();
      await Promise.all(allUrls.map(async (u) => {
        try {
          loaded.set(u, await loadGlb(u));
          assetStatus.set(u, { status: "loaded", detail: "ok" });
        } catch (e) {
          assetStatus.set(u, { status: "error", detail: e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160) });
        }
        if (!cancelled) reportStatus();
      }));
      if (cancelled) return;

      // Floor tiles: top surface at y=0 from the actual geometry bounds.
      const floorGroup = floorUrl ? loaded.get(floorUrl) : undefined;
      if (floorGroup) {
        const [entry] = meshesOf(floorGroup);
        if (entry) {
          entry.geometry.computeBoundingBox();
          const topY = entry.geometry.boundingBox?.max.y ?? 0.1;
          const inst = new THREE.InstancedMesh(entry.geometry, entry.material, ops.floorTiles.length);
          ops.floorTiles.forEach((t, i) => placeInstance(inst, i, t.xM, t.topYM - topY, t.zM, 0));
          inst.instanceMatrix.needsUpdate = true;
          threeScene.add(inst);
        }
      }
      // Racks at canonical centers with per-axis scale.
      const rackGroup = rackUrl ? loaded.get(rackUrl) : undefined;
      if (rackGroup) {
        const [entry] = meshesOf(rackGroup);
        if (entry) {
          const inst = new THREE.InstancedMesh(entry.geometry, entry.material, ops.racks.length);
          ops.racks.forEach((r, i) =>
            placeInstance(inst, i, r.positionMm.x * MM, 0, r.positionMm.z * MM, 0, r.scale.x, r.scale.y, r.scale.z));
          inst.instanceMatrix.needsUpdate = true;
          threeScene.add(inst);
        }
      }
      // Shelf containers: one InstancedMesh per container asset.
      for (const cg of ops.containerGlbs) {
        const group = loaded.get(cg.glbUrl);
        if (!group) continue;
        const [entry] = meshesOf(group);
        if (!entry) continue;
        const items: { x: number; y: number; z: number }[] = [];
        for (const l of ops.locations) {
          for (const c of l.containers) {
            if (c.glbUrl !== cg.glbUrl) continue;
            items.push({
              x: (l.anchorMm.x + c.dxMm) * MM,
              y: (l.anchorMm.y + c.dyMm) * MM,
              z: (l.anchorMm.z + c.dzMm) * MM,
            });
          }
        }
        const inst = new THREE.InstancedMesh(entry.geometry, entry.material, Math.max(items.length, 1));
        inst.count = items.length;
        items.forEach((p, i) => placeInstance(inst, i, p.x, p.y, p.z, 0));
        inst.instanceMatrix.needsUpdate = true;
        threeScene.add(inst);
      }
      // Walls + entrances with the display-only cutaway above 2.5 m.
      const cutaway = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.5);
      const addShell = (placements: typeof ops.walls): void => {
        for (const pl of placements) {
          const group = loaded.get(pl.glbUrl);
          if (!group) continue;
          const clone = group.clone(true);
          clone.position.set(pl.positionM[0], pl.positionM[1], pl.positionM[2]);
          clone.rotation.y = (pl.yawDeg * Math.PI) / 180;
          clone.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              const mat = (o.material as THREE.Material).clone();
              mat.clippingPlanes = pl.cutawayYM === null ? null : [cutaway];
              o.material = mat;
            }
          });
          threeScene.add(clone);
        }
      };
      addShell(ops.walls);
      addShell(ops.entrances);
      // Packing stations at true scale.
      for (const st of ops.stations) {
        const group = loaded.get(st.glbUrl);
        if (!group) continue;
        const clone = group.clone(true);
        clone.position.set(st.centerMm.x * MM, 0, st.centerMm.z * MM);
        clone.rotation.y = (st.yawDeg * Math.PI) / 180;
        threeScene.add(clone);
      }
      // Parked carts at true scale.
      for (const u of ops.units) {
        const group = loaded.get(cartUrl);
        if (!group) break;
        const clone = group.clone(true);
        clone.position.set(u.parkingMm.x * MM, 0, u.parkingMm.z * MM);
        threeScene.add(clone);
      }
      statsRef.current = { ...statsRef.current, loadMs: Math.round(performance.now() - t0), assets: statAssets() };
      renderOnce();
      onStatsRef.current({ ...statsRef.current });
    })();

    const handle = renderer;
    return () => {
      savedCamRef.current = { pos: camera.position.clone(), target: controls.target.clone() };
      cancelled = true;
      resizer.disconnect();
      controls.dispose();
      handle.dispose();
      labelRenderer.domElement.remove();
      mount.replaceChildren();
      if (controlsRef.current === controls) controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, selection, labelLayer, preset]);

  const applyPreset = (name: "overview" | "top" | "inspect" | "reset"): void => {
    const controls = controlsRef.current;
    const home = homeRef.current;
    if (!controls || !home) return;
    setPreset(name === "reset" ? "overview" : name);
    const camera = controls.object;
    if (name === "overview" || name === "reset") {
      camera.position.copy(home.pos);
      controls.target.copy(home.target);
    } else if (name === "top") {
      const c = home.target;
      camera.position.set(c.x, 34, c.z + 0.02);
      controls.target.copy(c);
    } else {
      const t = inspectTarget();
      if (!t) return;
      camera.position.set(t.x + t.dist * 0.55, t.y + t.dist * 0.62, t.z + t.dist * 0.55);
      controls.target.set(t.x, t.y, t.z);
    }
    controls.update();
    renderRef.current?.();
  };

  const inspectTarget = (): { x: number; y: number; z: number; dist: number } | null => {
    if (!selection) return null;
    if (selection.kind === "location") {
      const l = ops.locations.find((x) => x.id === selection.id);
      if (!l) return null;
      return { x: l.anchorMm.x * MM, y: l.anchorMm.y * MM + 0.6, z: l.anchorMm.z * MM, dist: 9 };
    }
    if (selection.kind === "rack") {
      const r = ops.racks.find((x) => x.id === selection.id);
      if (!r) return null;
      return { x: r.positionMm.x * MM, y: 1.2, z: r.positionMm.z * MM, dist: 11 };
    }
    if (selection.kind === "unit") {
      const u = ops.units.find((x) => x.id === selection.id);
      if (!u) return null;
      return { x: u.parkingMm.x * MM, y: 0.7, z: u.parkingMm.z * MM, dist: 7 };
    }
    const r = ops.resources.find((x) => x.id === selection.id);
    if (!r || !r.service[0]) return null;
    // Packing stations frame the table AND its service point (midpoint);
    // receiving/dispatch frame their service point (floor zones).
    const st = ops.stations.find((x) => x.id === selection.id);
    if (st) {
      return { x: ((st.centerMm.x + r.service[0].x) / 2) * MM, y: 0.6, z: ((st.centerMm.z + r.service[0].z) / 2) * MM, dist: 10 };
    }
    return { x: r.service[0].x * MM, y: 0.6, z: r.service[0].z * MM, dist: 9 };
  };

  const zoom = (f: number): void => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const offset = camera.position.clone().sub(controls.target);
    const next = Math.min(80, Math.max(1, offset.length() * f));
    camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
    controls.update();
    renderRef.current?.();
  };

  return (
    <div className="three-wrap">
      <div ref={mountRef} data-testid="ops-canvas" aria-label="3D operations warehouse view (Y-up)" />
      <div className="camrow cam3d ops-presets" role="group" aria-label="Operations camera presets">
        <button type="button" onClick={() => applyPreset("overview")} data-testid="ops-preset-overview">Overview</button>
        <button type="button" onClick={() => applyPreset("top")} data-testid="ops-preset-top">Top</button>
        <button
          type="button"
          onClick={() => applyPreset("inspect")}
          data-testid="ops-preset-inspect"
          disabled={!selection}
          title={selection ? `Inspect ${selection.kind} ${selection.id}` : "Select a location, rack, agent, or station first"}
        >
          Inspect
        </button>
        <button type="button" onClick={() => applyPreset("reset")} data-testid="ops-preset-reset">Reset overview</button>
        <button type="button" onClick={() => zoom(1 / 1.25)} data-testid="ops-zoom-in" aria-label="Zoom operations view in">+</button>
        <button type="button" onClick={() => zoom(1.25)} data-testid="ops-zoom-out" aria-label="Zoom operations view out">−</button>
      </div>
      <p className="mono" ref={statusRef} data-testid="ops-asset-status">
        Environment: loading sourced geometry…
      </p>
    </div>
  );
}
