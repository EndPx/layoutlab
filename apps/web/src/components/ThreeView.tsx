import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Assignment, Scenario } from "@layoutlab/core";
import { RACK_GLB_URL, rackScaleFor } from "../lib/rackAsset";
import type { RoutePolyline } from "./CenterView";

const MM = 0.001; // mm -> m for the renderer only; measurement stays in mm in core.
const LABEL_GAP_PX = 10; // chip bottom floats this far above its anchor point
const LABEL_PAD_PX = 4; // minimum vertical gap between de-collided chips

// Module-level GLB cache: one network fetch per page lifetime, shared across
// renders and scenarios (the rack mesh is scenario-independent).
let glbCache: Promise<THREE.Group> | null = null;

function loadRackGlb(): Promise<THREE.Group> {
  if (!glbCache) {
    glbCache = new GLTFLoader().loadAsync(RACK_GLB_URL).then((gltf) => gltf.scene);
  }
  return glbCache;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function ThreeView(props: {
  scenario: Scenario;
  assignment: Assignment[];
  currentRoute: RoutePolyline | null;
  candidateRoute: RoutePolyline | null;
  showCurrent: boolean;
  showCandidate: boolean;
  active: boolean;
}): React.JSX.Element {
  const { scenario, assignment, currentRoute, candidateRoute, showCurrent, showCandidate, active } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const homeRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const renderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (!active) return;
    let cancelled = false;
    mount.dataset["asset"] = "loading";
    delete mount.dataset["racksLoaded"];
    delete mount.dataset["rackBbox"];
    delete mount.dataset["labelOverlap"];
    delete mount.dataset["cam"];
    if (statusRef.current) statusRef.current.textContent = "Racks: loading SimReady GLB…";

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      mount.textContent = "3D unavailable (no WebGL); 2D plan above remains authoritative.";
      return;
    }
    const W = Math.max(240, Math.min(960, mount.clientWidth || 640));
    // Desktop clamps so the center column meets the ~560px workspace
    // budget while the viewport still fills its panel; narrow canvases
    // get adequate height for 17+ labels (mobile page scrolls anyway).
    const H = W < 520 ? Math.max(300, Math.round((W * 9) / 14)) : Math.min(400, Math.round((W * 9) / 14));
    const size = { w: W, h: H };
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(W, H);
    labelRenderer.domElement.className = "labels3d";
    // Leader-line overlay (display only): thin SVG lines from each projected
    // canonical anchor to its displaced chip. Anchors never move.
    const leaderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    leaderSvg.setAttribute("class", "leaders3d");
    leaderSvg.setAttribute("aria-hidden", "true");
    leaderSvg.setAttribute("width", String(W));
    leaderSvg.setAttribute("height", String(H));
    mount.replaceChildren(renderer.domElement, leaderSvg, labelRenderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfbfcfe);
    // Y-up: floor is XZ, height is Y. Camera looks at the room center.
    const roomW = scenario.room.widthMm * MM;
    const roomD = scenario.room.depthMm * MM;
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
    // Overhead-leaning default at the same azimuth: racks occlude less of
    // the floor routes while the 3/4 aerial composition stays familiar.
    camera.position.set(roomW * 0.5 + roomW * 0.55, Math.max(roomW, roomD) * 1.3, roomD * 0.5 + roomD * 1.0);
    camera.lookAt(roomW * 0.5, 0, roomD * 0.5);
    camera.up.set(0, 1, 0);

    // User-driven orbit/zoom/pan only: no auto-motion, renders on change.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 40;
    controls.target.set(roomW * 0.5, 0, roomD * 0.5);
    controls.update();
    homeRef.current = { pos: camera.position.clone(), target: controls.target.clone() };
    controlsRef.current = controls;
    // Keyboard camera pan via the installed controls (arrow keys pan, update
    // dispatches change so the single-render contract holds).
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "3D warehouse view. Arrow keys pan the camera.");
    controls.listenToKeyEvents(renderer.domElement);

    // Hemisphere + key/fill: readable racks without inventing a photo studio.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe6f0, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(roomW / 2 + 5, 10, roomD / 2 + 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8f2f2, 0.35);
    fill.position.set(roomW / 2 - 6, 6, roomD / 2 - 5);
    scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomD),
      new THREE.MeshStandardMaterial({ color: 0xeef1f6, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(roomW / 2, 0, roomD / 2);
    scene.add(floor);

    // Label records: the CSS2D wrapper sits exactly on the canonical anchor;
    // the chip child carries display-only screen offsets from de-collision.
    type Label3D = { anchor: THREE.Vector3; chip: HTMLDivElement; leader: SVGLineElement };
    const labels3d: Label3D[] = [];
    const addLabel = (parent: THREE.Object3D, text: string, cls: string, x: number, y: number, z: number): void => {
      const wrap = document.createElement("div");
      wrap.className = "tag3d-wrap";
      const chip = document.createElement("div");
      chip.className = `tag3d ${cls}`;
      chip.textContent = text;
      wrap.appendChild(chip);
      const obj = new CSS2DObject(wrap);
      obj.position.set(x, y, z);
      parent.add(obj);
      const leader = document.createElementNS("http://www.w3.org/2000/svg", "line");
      leader.setAttribute("class", "leader3d");
      leaderSvg.appendChild(leader);
      labels3d.push({ anchor: new THREE.Vector3(x, y, z), chip, leader });
    };

    // Rack group: proxy boxes until the SimReady GLB resolves, then actual
    // rack meshes at canonical footprint centers with per-axis scaling + yaw.
    const rackGroup = new THREE.Group();
    scene.add(rackGroup);
    const proxyMat = new THREE.MeshStandardMaterial({ color: 0x9fb2c8, roughness: 0.8, metalness: 0 });
    for (const rack of scenario.racks) {
      const w = rack.dimensionsMm.width * MM;
      const h = rack.dimensionsMm.height * MM;
      const d = rack.dimensionsMm.depth * MM;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
      mesh.position.set(rack.positionMm.x * MM, h / 2, rack.positionMm.z * MM);
      mesh.rotation.y = (rack.yawDeg * Math.PI) / 180;
      mesh.userData["rackId"] = rack.id;
      rackGroup.add(mesh);
      addLabel(rackGroup, rack.id, "rack", rack.positionMm.x * MM, h + 0.1, rack.positionMm.z * MM);
    }

    const prodsOf = new Map<string, string[]>();
    for (const a of assignment) {
      const list = prodsOf.get(a.locationId) ?? [];
      list.push(a.productId);
      prodsOf.set(a.locationId, list);
    }
    const locMat = new THREE.MeshStandardMaterial({ color: 0x0b6b6e, roughness: 0.5, metalness: 0 });
    const emptyMat = new THREE.MeshStandardMaterial({ color: 0x9fb2c8, roughness: 0.7, metalness: 0 });
    for (const loc of scenario.locations) {
      const pids = prodsOf.get(loc.id) ?? [];
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), pids.length > 0 ? locMat : emptyMat);
      marker.position.set(loc.pickPointMm.x * MM, 0.12, loc.pickPointMm.z * MM);
      scene.add(marker);
      // One chip per location (id + every occupying product, invalid stacks
      // included). The marker stays on the canonical pick point; the chip
      // floats above with analytic screen-space de-collision so close pairs
      // (L1/L3, L5/L7) stay legible without moving any geometry.
      addLabel(
        scene,
        pids.length > 0 ? `${loc.id} · ${pids.join(", ")}` : `${loc.id} · empty`,
        "loc",
        loc.pickPointMm.x * MM,
        0.12,
        loc.pickPointMm.z * MM,
      );
    }
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x0b6b6e, roughness: 0.5, metalness: 0 }),
    );
    pack.position.set(scenario.packingPointMm.x * MM, 0.15, scenario.packingPointMm.z * MM);
    scene.add(pack);
    addLabel(scene, "PACK", "pack", scenario.packingPointMm.x * MM, 0.3, scenario.packingPointMm.z * MM);

    const drawRoute = (route: RoutePolyline, color: number, dashed: boolean): void => {
      if (route.points.length < 2) return;
      const pts = route.points.map((p) => new THREE.Vector3(p.x * MM, 0.06, p.z * MM));
      // Route-overlay treatment: genuine floor polylines drawn on top so
      // both paths stay followable past racks. Coordinates are unchanged;
      // the 2D plan remains the occlusion-free authority.
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        dashed
          ? new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.15, depthTest: false })
          : new THREE.LineBasicMaterial({ color, depthTest: false }),
      );
      line.renderOrder = 999;
      line.computeLineDistances();
      scene.add(line);
    };
    if (showCurrent && currentRoute) drawRoute(currentRoute, 0xd9730d, true);
    if (showCandidate && candidateRoute) drawRoute(candidateRoute, 0x0b6b6e, false);

    // True 2D greedy packing: project each canonical anchor, then place
    // every chip at the first candidate cell (above/below/side offsets)
    // that fits inside the canvas without overlapping a placed chip.
    // Only chip display positions change — markers, racks, and routes are
    // untouched. Residual overlap is instrumented, never hidden.
    const decollide = (): void => {
      if (cancelled || labels3d.length === 0) return;
      camera.updateMatrixWorld();
      type Item = { l: (typeof labels3d)[number]; sx: number; sy: number; w: number; h: number };
      const items: Item[] = labels3d.map((l) => {
        const p = l.anchor.clone().project(camera);
        // Fractional DOM size, not integer offsetWidth: real chips like
        // 69.359px round down to 69 and hide ~1.25px subpixel collisions.
        // Ceil + padding keeps a safe gap subpixel rounding cannot bridge.
        // (Translate transforms do not affect rect size.)
        const r = l.chip.getBoundingClientRect();
        return {
          l,
          sx: (p.x * 0.5 + 0.5) * size.w,
          sy: (-p.y * 0.5 + 0.5) * size.h,
          w: (r.width > 0 ? Math.ceil(r.width) : 80) + 4,
          h: (r.height > 0 ? Math.ceil(r.height) : 20) + 4,
        };
      });
      // Deterministic order: top anchors first, then left to right.
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
        left: cx - w / 2,
        top,
        right: cx + w / 2,
        bottom: top + h,
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
          // No free cell: least-overlap placement, clamped inside the
          // canvas. Still counted honestly in the residual below.
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
        // Leaders only when the chip left its natural perch above the anchor.
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
      renderer?.render(scene, camera);
      labelRenderer.render(scene, camera);
      decollide();
      mount.dataset["cam"] =
        `${round3(controls.target.x)},${round3(controls.target.y)},${round3(controls.target.z)}`;
    };
    renderRef.current = renderOnce;
    controls.addEventListener("change", renderOnce);
    // Keep renderer, labels, leaders, and aspect aligned with the container.
    const resizer = new ResizeObserver(() => {
      if (cancelled) return;
      const w = Math.max(240, Math.min(960, mount.clientWidth || 640));
      const h = w < 520 ? Math.max(300, Math.round((w * 9) / 14)) : Math.min(400, Math.round((w * 9) / 14));
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

    // Swap proxy racks for real SimReady GLB instances when the mesh arrives.
    // Guards: a stale scenario rebuild disposes this scene, so late loads
    // commit nothing. On failure the proxies stay with an explicit fallback.
    void loadRackGlb().then(
      (glb) => {
        if (cancelled) return;
        for (let i = rackGroup.children.length - 1; i >= 0; i--) {
          const child = rackGroup.children[i]!;
          if (!(child instanceof CSS2DObject)) rackGroup.remove(child);
        }
        const boxes: THREE.Box3[] = [];
        for (const rack of scenario.racks) {
          const instance = glb.clone();
          const s = rackScaleFor(rack.dimensionsMm);
          instance.scale.set(s.x, s.y, s.z);
          instance.position.set(rack.positionMm.x * MM, 0, rack.positionMm.z * MM);
          instance.rotation.y = (rack.yawDeg * Math.PI) / 180;
          instance.updateMatrixWorld(true);
          rackGroup.add(instance);
          boxes.push(new THREE.Box3().setFromObject(instance));
        }
        renderOnce();
        const first = boxes[0];
        mount.dataset["asset"] = "simready-glb";
        mount.dataset["racksLoaded"] = String(scenario.racks.length);
        if (first) {
          const fmt = (v: THREE.Vector3): string => `${round3(v.x)},${round3(v.y)},${round3(v.z)}`;
          mount.dataset["rackBbox"] = `${fmt(first.min)}:${fmt(first.max)}`;
        }
        if (statusRef.current) {
          statusRef.current.textContent =
            `Racks: SimReady GLB (${scenario.racks.length} loaded, CC-BY-4.0); markers/route: development proxies.`;
        }
      },
      () => {
        if (cancelled) return;
        mount.dataset["asset"] = "proxy-fallback";
        if (statusRef.current) {
          statusRef.current.textContent =
            "Racks: GLB unavailable, proxy boxes shown (fallback); 2D plan remains authoritative.";
        }
      },
    );

    const handle = renderer;
    const labelHandle = labelRenderer;
    return () => {
      cancelled = true;
      resizer.disconnect();
      controls.dispose();
      handle.dispose();
      labelHandle.domElement.remove();
      mount.replaceChildren();
      if (controlsRef.current === controls) controlsRef.current = null;
    };
  }, [scenario, assignment, currentRoute, candidateRoute, showCurrent, showCandidate, active]);

  const zoom3d = (f: number): void => {
    const controls = controlsRef.current;
    if (!controls) return;
    // Scale the CURRENT position-target offset: preserves the pan target and
    // orientation instead of flipping to the opposite side of home.
    const camera = controls.object;
    const offset = camera.position.clone().sub(controls.target);
    const next = Math.min(40, Math.max(1, offset.length() * f));
    camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
    controls.update();
    renderRef.current?.();
  };

  const reset3d = (): void => {
    const controls = controlsRef.current;
    const home = homeRef.current;
    if (!controls || !home) return;
    controls.object.position.copy(home.pos);
    controls.target.copy(home.target);
    controls.update();
    renderRef.current?.();
  };

  return (
    <div className="three-wrap">
      <div ref={mountRef} data-testid="three-canvas" aria-label="3D scene with SimReady rack meshes (Y-up)" />
      <div className="camrow cam3d" role="group" aria-label="3D camera controls">
        <button type="button" onClick={() => zoom3d(1 / 1.25)} data-testid="view-3d-zoom-in" aria-label="Zoom 3D in">+</button>
        <button type="button" onClick={() => zoom3d(1.25)} data-testid="view-3d-zoom-out" aria-label="Zoom 3D out">−</button>
        <button type="button" onClick={reset3d} data-testid="view-3d-reset" aria-label="Reset 3D view">⟳</button>
      </div>
      <p className="mono" ref={statusRef} data-testid="three-asset-status">
        Racks: loading SimReady GLB…
      </p>
    </div>
  );
}
