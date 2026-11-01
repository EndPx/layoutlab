import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Assignment, Scenario } from "@layoutlab/core";

const MM = 0.001; // mm -> m for the renderer only; measurement stays in mm in core.

export function ThreeView(props: {
  scenario: Scenario;
  assignment: Assignment[];
  route: { points: { x: number; z: number }[] } | null;
}): React.JSX.Element {
  const { scenario, assignment, route } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
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

    const rackMat = new THREE.MeshStandardMaterial({ color: 0x9fb2c8, roughness: 0.8, metalness: 0.1 });
    for (const rack of scenario.racks) {
      const w = rack.dimensionsMm.width * MM;
      const h = rack.dimensionsMm.height * MM;
      const d = rack.dimensionsMm.depth * MM;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rackMat);
      mesh.position.set(rack.positionMm.x * MM, h / 2, rack.positionMm.z * MM);
      mesh.rotation.y = (rack.yawDeg * Math.PI) / 180;
      scene.add(mesh);
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
    renderer.render(scene, camera);
    const handle = renderer;
    return () => {
      handle.dispose();
      mount.replaceChildren();
    };
  }, [scenario, assignment, route]);

  return (
    <div>
      <div ref={mountRef} data-testid="three-canvas" aria-label="3D proxy scene (development proxies, Y-up)" />
      <p className="mono">Fixed racks shown at scenario scale; development proxies.</p>
    </div>
  );
}
