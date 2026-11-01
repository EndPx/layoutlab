import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Assignment, Scenario } from "@layoutlab/core";
import { RACK_GLB_URL, rackScaleFor } from "../lib/rackAsset";

const MM = 0.001; // mm -> m for the renderer only; measurement stays in mm in core.

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
  route: { points: { x: number; z: number }[] } | null;
}): React.JSX.Element {
  const { scenario, assignment, route } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    mount.dataset["asset"] = "loading";
    delete mount.dataset["racksLoaded"];
    delete mount.dataset["rackBbox"];
    if (statusRef.current) statusRef.current.textContent = "Racks: loading SimReady GLB…";

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      mount.textContent = "3D unavailable (no WebGL); 2D plan above remains authoritative.";
      return;
    }
    const W = Math.max(240, Math.min(640, mount.clientWidth || 420));
    const H = Math.round((W * 9) / 14);
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfbfcfe);
    // Y-up: floor is XZ, height is Y. Camera looks at the room center.
    const roomW = scenario.room.widthMm * MM;
    const roomD = scenario.room.depthMm * MM;
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
    camera.position.set(roomW * 0.5 + roomW * 0.7, Math.max(roomW, roomD) * 1.1, roomD * 0.5 + roomD * 0.9);
    camera.lookAt(roomW * 0.5, 0, roomD * 0.5);
    camera.up.set(0, 1, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(roomW / 2 + 5, 10, roomD / 2 + 4);
    scene.add(dir);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomD),
      new THREE.MeshStandardMaterial({ color: 0xeef1f6, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(roomW / 2, 0, roomD / 2);
    scene.add(floor);

    // Rack group: proxy boxes until the SimReady GLB resolves, then actual
    // rack meshes at canonical footprint centers with per-axis scaling + yaw.
    const rackGroup = new THREE.Group();
    scene.add(rackGroup);
    const proxyMat = new THREE.MeshStandardMaterial({ color: 0x9fb2c8, roughness: 0.8, metalness: 0.1 });
    for (const rack of scenario.racks) {
      const w = rack.dimensionsMm.width * MM;
      const h = rack.dimensionsMm.height * MM;
      const d = rack.dimensionsMm.depth * MM;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
      mesh.position.set(rack.positionMm.x * MM, h / 2, rack.positionMm.z * MM);
      mesh.rotation.y = (rack.yawDeg * Math.PI) / 180;
      mesh.userData["rackId"] = rack.id;
      rackGroup.add(mesh);
    }

    const locOf = new Map(assignment.map((a) => [a.locationId, a.productId]));
    const locMat = new THREE.MeshStandardMaterial({ color: 0x0e6e6e, roughness: 0.5, metalness: 0 });
    for (const loc of scenario.locations) {
      if (!locOf.has(loc.id)) continue;
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), locMat);
      marker.position.set(loc.pickPointMm.x * MM, 0.12, loc.pickPointMm.z * MM);
      scene.add(marker);
    }
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x0e6e6e, roughness: 0.5, metalness: 0 }),
    );
    pack.position.set(scenario.packingPointMm.x * MM, 0.15, scenario.packingPointMm.z * MM);
    scene.add(pack);

    if (route && route.points.length > 1) {
      const pts = route.points.map((p) => new THREE.Vector3(p.x * MM, 0.06, p.z * MM));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x0e6e6e }),
      );
      scene.add(line);
    }

    // Single render per state change: no animation loop, honors reduced motion.
    const renderOnce = (): void => {
      renderer?.render(scene, camera);
    };
    renderOnce();

    // Swap proxy racks for real SimReady GLB instances when the mesh arrives.
    // Guards: a stale scenario rebuild disposes this scene, so late loads
    // commit nothing. On failure the proxies stay with an explicit fallback.
    void loadRackGlb().then(
      (glb) => {
        if (cancelled) return;
        rackGroup.clear();
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
          const fmt = (v: THREE.Vector3): string =>
            `${round3(v.x)},${round3(v.y)},${round3(v.z)}`;
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
    return () => {
      cancelled = true;
      handle.dispose();
      mount.replaceChildren();
    };
  }, [scenario, assignment, route]);

  return (
    <div>
      <div ref={mountRef} data-testid="three-canvas" aria-label="3D scene with SimReady rack meshes (Y-up)" />
      <p className="mono" ref={statusRef} data-testid="three-asset-status">
        Racks: loading SimReady GLB…
      </p>
    </div>
  );
}
