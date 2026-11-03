// Operations 3D viewport: the engine-connected warehouse canvas.
//
// Persistent static setup (ONE renderer/scene/camera/asset load per mount)
// plus dynamic-only updates from the live engine snapshot: cart poses,
// shelf-stock visibility, carried loads, route overlays, approach markers,
// and labels. Snapshots, frames, and selections NEVER recreate the
// renderer, reload GLBs, or rebuild static geometry. Carts keep canonical
// yaw; only positions follow snapshot poses. Routes show the selected
// unit's CURRENT authorized granted plan split at the exact engine pose;
// pick stops are numbered done/todo markers with no connecting lines. A
// GLB that fails to load is reported truthfully in the status line and
// renders nothing: required models are never replaced by silent proxy
// cubes. Carried loads ride in the packet-driven equipment crates: 2 docks
// x 2 fixed cells at cargo yaw90, aggregated from the actual ledger;
// items render as labeled wireframe bounds markers sized from canonical
// SKU dims (never solid inventory models or whole storage boxes).
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { OperationsSnapshot } from "@layoutlab/simulation";
import { allocateCarryCells, carryMarkerPose, pickStopStates, sparseRouteArrowheads, splitRouteAtPose, unitOperationalLabel, visualContainersForQty, type OperationsScene, type OperationsSelection } from "../lib/operations";

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
  gpu: string | null;
  carryFit: string | null;
  renders: number;
  renderMsTotal: number;
  renderMsMax: number;
  renderSpanMs: number;
  assets: { url: string; status: "loading" | "loaded" | "error"; detail: string }[];
};

// Module-level GLB cache: one network fetch per URL per page lifetime.
// View setup/teardown never invalidates it, so the planner view and
// remounts share the same bytes.
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

type Label3D = { anchor: THREE.Vector3; chip: HTMLDivElement; leader: SVGLineElement; obj: CSS2DObject };

// Shared selection-marker material (one instance; per-update materials would
// churn GL programs on every snapshot).
const markerSelMatShared = new THREE.MeshBasicMaterial({ color: 0x0b6b6e });

type ContainerMeshState = {
  mesh: THREE.InstancedMesh;
  items: { locId: string; base: THREE.Matrix4 }[];
};

type ViewHandles = {
  mount: HTMLDivElement;
  statusEl: HTMLParagraphElement | null;
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  leaderSvg: SVGSVGElement;
  threeScene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  size: { w: number; h: number };
  labels3d: Label3D[];
  routeGroup: THREE.Group;
  markerGroup: THREE.Group;
  carryGroup: THREE.Group;
  cartOf: Map<string, THREE.Group>;
  containerMeshes: ContainerMeshState[];
  carryReady: boolean;
  cartBoundsNote: string | null;
  carryFitNote: string | null;
  loaded: Map<string, THREE.Group>;
  assetStatus: Map<string, { status: "loading" | "loaded" | "error"; detail: string }>;
  renderOnce: () => void;
  resizer: ResizeObserver;
};

export function OperationsView(props: {
  scene: OperationsScene;
  snapshot: OperationsSnapshot | null;
  selection: OperationsSelection;
  labelLayer: LabelLayer;
  onStats: (stats: OpsRenderStats) => void;
}): React.JSX.Element {
  const { scene: ops, snapshot, selection, labelLayer, onStats } = props;
  const [preset, setPreset] = useState<"overview" | "top" | "inspect" | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const viewRef = useRef<ViewHandles | null>(null);
  const homeRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const savedCamRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const statsRef = useRef<OpsRenderStats>({ triangles: 0, drawCalls: 0, geometries: 0, containers: 0, loadMs: null, gpu: null, carryFit: null, renders: 0, renderMsTotal: 0, renderMsMax: 0, renderSpanMs: 0, assets: [] });
  const renderWallFirstRef = useRef<number | null>(null);
  const renderWallLastRef = useRef<number | null>(null);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  // Latest dynamic inputs for the persistent view (read by updateDynamic).
  const dynRef = useRef({ snapshot, selection, labelLayer, preset });
  dynRef.current = { snapshot, selection, labelLayer, preset };
  const updateRef = useRef<(() => void) | null>(null);

  // Live stock per slot from the engine ledger; static initial stock before
  // the first snapshot arrives.
  const stockOf = (locId: string): { productId: string | null; quantity: number } => {
    const snap = dynRef.current.snapshot;
    const loc = ops.locations.find((l) => l.id === locId);
    const stored = snap?.inventory.storage.find((s) => s.locationId === locId);
    if (!stored) return { productId: loc?.productId ?? null, quantity: loc?.quantity ?? 0 };
    return { productId: stored.productId, quantity: stored.quantity };
  };

  // Pose per unit from the engine snapshot; parking before it arrives.
  const poseOf = (unitId: string): { x: number; z: number } => {
    const snap = dynRef.current.snapshot;
    const live = snap?.units.find((u) => u.unitId === unitId);
    if (live) return { x: live.pose.x, z: live.pose.z };
    const u = ops.units.find((x) => x.id === unitId);
    return u ? { x: u.parkingMm.x, z: u.parkingMm.z } : { x: 0, z: 0 };
  };

  // ---- Dynamic update: poses, stock visibility, carried loads, route and
  // markers, labels. Runs on snapshot/selection/label/preset change and
  // once after async GLB loads finish. Never touches static geometry.
  const updateDynamic = (): void => {
    const v = viewRef.current;
    if (!v || !v.mount.isConnected) return;
    const { snapshot: snap, selection: sel, labelLayer: layer, preset: pre } = dynRef.current;
    const mount = v.mount;
    mount.dataset["selection"] = sel ? `${sel.kind}:${sel.id}` : "none";
    mount.dataset["labelLayer"] = layer;
    mount.dataset["preset"] = pre ?? "manual";
    mount.dataset["clock"] = String(snap?.clockMs ?? -1);
    mount.dataset["poses"] = ops.units.map((u) => {
      const p = poseOf(u.id);
      return `${u.id}:${p.x},${p.z}`;
    }).join(";");

    // Cart poses follow snapshot poses exactly (canonical yaw kept).
    for (const [id, cart] of v.cartOf) {
      const p = poseOf(id);
      cart.position.set(p.x * MM, 0, p.z * MM);
    }

    // Shelf-stock visibility from the live ledger: full containers plus at
    // most one partial (same mesh), zero stock hides every instance.
    let visibleContainers = 0;
    for (const cm of v.containerMeshes) {
      const perLoc = new Map<string, number>();
      for (const it of cm.items) perLoc.set(it.locId, (perLoc.get(it.locId) ?? 0) + 1);
      const seen = new Map<string, number>();
      const hide = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -100, 0);
      cm.items.forEach((it, i) => {
        const k = seen.get(it.locId) ?? 0;
        seen.set(it.locId, k + 1);
        const loc = ops.locations.find((l) => l.id === it.locId);
        const stock = stockOf(it.locId);
        const upv = loc?.unitsPerVisual ?? 0;
        let show = true;
        if (snap && loc && upv > 0) {
          const { full, partial } = visualContainersForQty(stock.quantity, upv);
          show = k < full + (partial > 0 ? 1 : 0);
        }
        if (show) visibleContainers += 1;
        cm.mesh.setMatrixAt(i, show ? it.base : hide);
      });
      cm.mesh.instanceMatrix.needsUpdate = true;
    }
    mount.dataset["visibleContainers"] = String(visibleContainers);

    // Carried loads (cargo-C2, packet-driven): each unit's cart carries 2
    // sourced equipment crates at the unit-frame dock poses (static
    // children of the cart group, always rendered; empty totes are labeled
    // empty equipment). Actual ledger lines (u.carried) allocate into the 4
    // fixed cells in stable SKU/item-ordinal order; each item renders as a
    // labeled wireframe bounds marker sized from its canonical SKU dims at
    // cargo yaw90, resting on the crate interior floor. No solid inventory
    // models, no whole storage boxes, nothing from nowhere: unallocated
    // overflow or a cell misfit is reported, never drawn as valid. Cart or
    // crate geometry drift from the packet bounds draws nothing (fail closed).
    while (v.carryGroup.children.length > 0) {
      const child = v.carryGroup.children[0]!;
      v.carryGroup.remove(child);
      const mesh = child as THREE.Mesh;
      (mesh.geometry as THREE.BufferGeometry | undefined)?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    }
    const carryNotes: string[] = [];
    const skuDims = new Map(ops.scenario.products.map((p) => [p.id, p.itemDimensionsMm]));
    if (snap) {
      if (!v.carryReady) {
        carryNotes.push(v.cartBoundsNote ?? "carry pending (cart/crate geometry not loaded yet)");
      } else {
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xd97706 });
        const fillMat = new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.12, depthWrite: false });
        const docks = ops.carry.docksUnitM;
        for (const u of snap.units) {
          if (u.carried.length === 0) {
            carryNotes.push(`${u.unitId}: empty equipment (2 labeled totes, 0 cells filled)`);
            continue;
          }
          const { placements, overflowUnits } = allocateCarryCells(
            u.carried.map((l) => ({ productId: l.productId, quantity: l.quantity })),
            docks.length,
            ops.carry.cellsCrateLocalMm.length,
            ops.carry.cellsCrateLocalMm.map((c) => c.id),
          );
          const parts: string[] = [];
          for (const pl of placements) {
            const dims = skuDims.get(pl.productId);
            const cell = ops.carry.cellsCrateLocalMm.find((c) => c.id === pl.cellId);
            const dock = docks[pl.crateIndex];
            if (!dims || !cell || !dock) {
              carryNotes.push(`${u.unitId} ${pl.productId}#${pl.itemOrdinal}: missing SKU dims/cell/dock, nothing drawn`);
              continue;
            }
            const pose = carryMarkerPose(dims, cell, ops.carry.crateInteriorMm.floorTopY, ops.carry.cargoYawDeg);
            if (!pose.fitsCell) {
              carryNotes.push(`${u.unitId} ${pl.productId}#${pl.itemOrdinal}: ${dims.width}x${dims.depth}x${dims.height} overfills cell ${dock.id}${cell.id}, nothing drawn`);
              continue;
            }
            const geo = new THREE.BoxGeometry(dims.width * MM, dims.height * MM, dims.depth * MM);
            const marker = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
            const fill = new THREE.Mesh(geo, fillMat);
            const wx = u.pose.x * MM + (dock.xM + pose.xMm * MM);
            const wy = dock.yM + pose.yMm * MM;
            const wz = u.pose.z * MM + (dock.zM + pose.zMm * MM);
            marker.position.set(wx, wy, wz);
            marker.rotation.y = (pose.yawDeg * Math.PI) / 180;
            fill.position.copy(marker.position);
            fill.rotation.y = marker.rotation.y;
            v.carryGroup.add(marker);
            v.carryGroup.add(fill);
            parts.push(`${pl.productId}#${pl.itemOrdinal}@${dock.id}${cell.id}`);
          }
          if (overflowUnits > 0) {
            carryNotes.push(`${u.unitId}: OVERFLOW +${overflowUnits}u beyond 4 fixed cells (engine capacity breach, extras not drawn)`);
          }
          if (parts.length > 0) carryNotes.push(`${u.unitId}: ${parts.join("+")}`);
        }
      }
    }
    const fitSummary = !v.carryReady
      ? (v.cartBoundsNote ?? "carry pending (cart/crate geometry not loaded yet)")
      : `carry ${ops.carry.model}: 2 equipment docks x 2 cells (yaw90), wireframe bounds markers from canonical SKU dims (not solid models)${carryNotes.length > 0 ? `; ${carryNotes.join(" | ")}` : "; no carried loads"}`;
    v.carryFitNote = fitSummary;
    statsRef.current = { ...statsRef.current, carryFit: fitSummary };
    mount.dataset["carry"] = carryNotes.join(" | ");

    // Route overlay for the selected unit: CURRENT authorized granted plan
    // only, whole polyline kept, completed vs active split at the EXACT
    // engine pose on its timed segment (pose inserted as the split
    // vertex; mid-segment poses never snap to a grid vertex). Nothing is
    // drawn without a plan.
    while (v.routeGroup.children.length > 0) {
      const child = v.routeGroup.children[0]!;
      v.routeGroup.remove(child);
      const mesh = child as THREE.Mesh;
      (mesh.geometry as THREE.BufferGeometry | undefined)?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    }
    let routeShown = "none";
    let routeSplit = "none";
    let routeArrows = "0";
    const routeUnit = sel?.kind === "unit" ? snap?.units.find((u) => u.unitId === sel.id) : undefined;
    const plan = routeUnit?.authorizedRoute ?? null;
    const split = plan && routeUnit ? splitRouteAtPose(plan.points, routeUnit.pose) : null;
    if (plan && routeUnit && split) {
      routeShown = `${routeUnit.unitId}:v${plan.planVersion}:${plan.points.length}pts`;
      routeSplit = `${split.split.x},${split.split.z}:seg${split.segmentIndex}`;
      const toVec = (p: { x: number; z: number }): THREE.Vector3 => new THREE.Vector3(p.x * MM, 0.06, p.z * MM);
      const doneMat = new THREE.LineBasicMaterial({ color: 0x51607a });
      const activeMat = new THREE.LineBasicMaterial({ color: 0x0b6b6e });
      if (split.completed.length >= 2) {
        v.routeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(split.completed.map(toVec)), doneMat));
      }
      const activePts = split.active.map(toVec);
      if (activePts.length >= 2) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(activePts), activeMat);
        line.renderOrder = 10;
        (line.material as THREE.LineBasicMaterial).depthTest = false;
        v.routeGroup.add(line);
        // Sparse direction cones along the active leg: modest heads at
        // 1.75m arc intervals on the ACTUAL engine segments (tangent to
        // the hosting segment), never one per 100mm grid point. The
        // pose-split LINE above stays exact; one shared
        // geometry/material serves the whole batch.
        const arrows = sparseRouteArrowheads(split.active);
        routeArrows = String(arrows.length);
        const coneGeo = new THREE.ConeGeometry(0.1, 0.25, 10);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0x0b6b6e, depthTest: false, transparent: true });
        const coneUp = new THREE.Vector3(0, 1, 0);
        for (const arrow of arrows) {
          const cone = new THREE.Mesh(coneGeo, coneMat);
          cone.position.set(arrow.x * MM, 0.12, arrow.z * MM);
          cone.quaternion.setFromUnitVectors(coneUp, new THREE.Vector3(arrow.dirX, 0, arrow.dirZ));
          cone.renderOrder = 11;
          v.routeGroup.add(cone);
        }
      }
      const dest = toVec(plan.points[plan.points.length - 1]!);
      const destMarker = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), new THREE.MeshBasicMaterial({ color: 0x0b6b6e, depthTest: false }));
      destMarker.position.copy(dest).setY(0.2);
      destMarker.renderOrder = 11;
      v.routeGroup.add(destMarker);
    }
    mount.dataset["routeShown"] = routeShown;
    mount.dataset["routeSplit"] = routeSplit;
    mount.dataset["routeArrows"] = routeArrows;

    // Markers: selected-location approach, plus numbered pick stops for the
    // selected unit's order or the selected order (approach points only —
    // future intent gets no connecting lines).
    while (v.markerGroup.children.length > 0) {
      const child = v.markerGroup.children[0]!;
      v.markerGroup.remove(child);
      (child as THREE.Mesh).geometry?.dispose?.();
    }
    const shownApproaches: string[] = [];
    const stopChips: { n: number; x: number; z: number; done: boolean }[] = [];
    const addApproachDot = (xMm: number, zMm: number): void => {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), markerSelMatShared);
      marker.position.set(xMm * MM, 0.16, zMm * MM);
      v.markerGroup.add(marker);
    };
    if (sel?.kind === "location") {
      const loc = ops.locations.find((l) => l.id === sel.id);
      if (loc) {
        shownApproaches.push(loc.id);
        addApproachDot(loc.approachMm.x, loc.approachMm.z);
      }
    }
    const stopsOrderId = sel?.kind === "order"
      ? sel.id
      : sel?.kind === "unit"
        ? (snap?.units.find((u) => u.unitId === sel.id)?.task as { orderId?: string } | undefined)?.orderId ?? null
        : null;
    const stopsOrder = stopsOrderId ? snap?.orders.find((o) => o.orderId === stopsOrderId) : undefined;
    if (stopsOrder && stopsOrder.reservation.length > 0) {
      pickStopStates(stopsOrder.reservation).forEach((s, i) => {
        const loc = ops.locations.find((l) => l.id === s.locId);
        if (!loc) return;
        shownApproaches.push(s.locId);
        addApproachDot(loc.approachMm.x, loc.approachMm.z);
        stopChips.push({ n: i + 1, x: loc.approachMm.x, z: loc.approachMm.z, done: s.done });
      });
    }
    mount.dataset["approachesShown"] = [...new Set(shownApproaches)].join(",");
    mount.dataset["routeStops"] = stopChips.map((s) => `${s.n}:${s.x},${s.z}:${s.done ? "done" : "todo"}`).join(";");

    // Labels (rebuilt cheaply; static geometry untouched).
    for (const l of v.labels3d) {
      v.threeScene.remove(l.obj);
      l.chip.parentElement?.remove();
    }
    v.labels3d.length = 0;
    while (v.leaderSvg.firstChild) v.leaderSvg.removeChild(v.leaderSvg.firstChild);
    const focus = ((): { x: number; y: number; z: number } | null => {
      if (pre !== "inspect" || !sel) return null;
      if (sel.kind === "location") {
        const l = ops.locations.find((x) => x.id === sel.id);
        return l ? { x: l.anchorMm.x * MM, y: l.anchorMm.y * MM, z: l.anchorMm.z * MM } : null;
      }
      if (sel.kind === "rack") {
        const r = ops.racks.find((x) => x.id === sel.id);
        return r ? { x: r.positionMm.x * MM, y: 1.2, z: r.positionMm.z * MM } : null;
      }
      if (sel.kind === "unit" || sel.kind === "order") {
        const unitId = sel.kind === "unit" ? sel.id : stopsOrder?.unitId ?? null;
        const p = unitId ? poseOf(unitId) : null;
        if (p) return { x: p.x * MM, y: 0.7, z: p.z * MM };
        const first = stopsOrder?.reservation[0] ? ops.locations.find((l) => l.id === stopsOrder.reservation[0]!.locationId) : undefined;
        return first ? { x: first.anchorMm.x * MM, y: 0.6, z: first.anchorMm.z * MM } : null;
      }
      const r = ops.resources.find((x) => x.id === sel.id);
      if (!r?.service[0]) return null;
      const st = ops.stations.find((x) => x.id === sel.id);
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
      v.threeScene.add(obj);
      const leader = document.createElementNS("http://www.w3.org/2000/svg", "line");
      leader.setAttribute("class", "leader3d");
      v.leaderSvg.appendChild(leader);
      v.labels3d.push({ anchor: new THREE.Vector3(x, y, z), chip, leader, obj });
    };
    const showAreas = layer === "areas" || layer === "all";
    const showSlots = layer === "slots" || layer === "all";
    const isSel = (kind: string, id: string): boolean => sel?.kind === kind && sel.id === id;
    if (showAreas) {
      for (const r of ops.racks) {
        addLabel(`${r.id}${isSel("rack", r.id) ? " ◆Selected" : ""}`, isSel("rack", r.id) ? "rack selected" : "rack", r.positionMm.x * MM, r.dimsMm.height * MM + 0.25, r.positionMm.z * MM);
      }
      for (const r of ops.resources) {
        const s0 = r.service[0]!;
        const kindLabel = r.kind === "receiving" ? "Receiving" : r.kind === "packing" ? "Packing" : "Dispatch";
        addLabel(`${r.id} · ${kindLabel}${isSel("resource", r.id) ? " ◆Selected" : ""}`, isSel("resource", r.id) ? "loc selected" : "loc", s0.x * MM, 1.5, s0.z * MM);
      }
      ops.units.forEach((u, i) => {
        const live = snap?.units.find((x) => x.unitId === u.id);
        const p = poseOf(u.id);
        const extra = live ? ` · ${unitOperationalLabel(live)}${live.carried.length > 0 ? ` + ${live.carried.map((l) => `${l.productId}×${l.quantity}`).join("+")}` : ""}` : "";
        addLabel(`${u.id} · ${u.role}${extra}${isSel("unit", u.id) ? " ◆Selected" : ""}`, isSel("unit", u.id) ? "loc selected" : "loc", p.x * MM, 1.7 + (i % 3) * 0.7, p.z * MM);
      });
      addLabel("Receiving entrance", "pack", 4, 2.7, 17.2);
      addLabel("Dispatch exit", "pack", 20, 2.7, 17.2);
    }
    for (const l of ops.locations) {
      const selected = isSel("location", l.id);
      if (showSlots || selected) {
        const stock = stockOf(l.id);
        const upv = l.unitsPerVisual;
        let stockText = "empty";
        if (stock.productId && stock.quantity > 0) {
          stockText = `${stock.productId} ×${stock.quantity}`;
          if (upv > 0) {
            const { partial } = visualContainersForQty(stock.quantity, upv);
            if (partial > 0) stockText += ` (partial ×${partial})`;
          }
        } else if (stock.productId) {
          stockText = `${stock.productId} ×0`;
        }
        addLabel(`${l.id} · ${stockText}${selected ? " ◆Selected" : ""}`, selected ? "loc selected" : "loc", l.anchorMm.x * MM, (l.anchorMm.y + l.usableMm.height) * MM + 0.15, l.anchorMm.z * MM);
      }
    }
    for (const s of stopChips) {
      addLabel(`Stop ${s.n}${s.done ? " ✓done" : ""}`, "pack", s.x * MM, 0.9, s.z * MM);
    }
    if (v.carryReady && (sel?.kind === "unit" || (sel?.kind === "order" && stopsOrder?.unitId))) {
      const unitId = sel.kind === "unit" ? sel.id : stopsOrder!.unitId!;
      const live = snap?.units.find((x) => x.unitId === unitId);
      const p = poseOf(unitId);
      const { placements } = allocateCarryCells(
        (live?.carried ?? []).map((l) => ({ productId: l.productId, quantity: l.quantity })),
        ops.carry.docksUnitM.length,
        ops.carry.cellsCrateLocalMm.length,
        ops.carry.cellsCrateLocalMm.map((c) => c.id),
      );
      ops.carry.docksUnitM.forEach((dock, crateIndex) => {
        const inside = placements.filter((pl) => pl.crateIndex === crateIndex).map((pl) => `${pl.productId}#${pl.itemOrdinal}`);
        addLabel(
          `crate ${dock.id} · ${inside.length > 0 ? inside.join("+") : "empty equipment"}`,
          "pack selected",
          p.x * MM + dock.xM,
          dock.yM + 0.45,
          p.z * MM + dock.zM,
        );
      });
    }
    if (stopsOrder && (sel?.kind === "order" || (sel?.kind === "unit" && stopsOrderId))) {
      const unitP = stopsOrder.unitId ? poseOf(stopsOrder.unitId) : null;
      if (unitP && sel?.kind === "order") {
        addLabel(`${stopsOrder.orderId} · ${stopsOrder.state} · ${stopsOrder.unitId ?? "unassigned"}`, "loc selected", unitP.x * MM, 2.6, unitP.z * MM);
      }
    }

    v.renderOnce();
  };
  updateRef.current = updateDynamic;

  // ---- Persistent setup: renderer, camera, lights, static annotations,
  // sourced geometry. Runs once per scene identity; teardown only at true
  // unmount (or scene replacement) and never invalidates the GLB cache.
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
    if (statusRef.current) statusRef.current.textContent = "Environment: loading sourced geometry…";

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      mount.textContent = "3D unavailable (no WebGL); the fixture data tables in diagnostics remain available.";
      return;
    }
    {
      const gl = renderer.getContext();
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "") : "";
      statsRef.current = { ...statsRef.current, gpu: gpu || null };
    }
    renderer.localClippingEnabled = true;
    const W = Math.max(240, Math.min(1100, mount.clientWidth || 700));
    const H = W < 520 ? Math.max(300, Math.round((W * 9) / 14)) : Math.min(520, Math.round((W * 9) / 16));
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
    const overviewPos = new THREE.Vector3(center.x + 12, 11, center.z + 13);
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
    const saved = savedCamRef.current;
    if (saved) {
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
      controls.update();
    }
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

    const handles: ViewHandles = {
      mount,
      statusEl: statusRef.current,
      renderer,
      labelRenderer,
      leaderSvg,
      threeScene,
      camera,
      controls,
      size,
      labels3d: [],
      routeGroup: new THREE.Group(),
      markerGroup: new THREE.Group(),
      carryGroup: new THREE.Group(),
      cartOf: new Map(),
      containerMeshes: [],
      carryReady: false,
      cartBoundsNote: null,
      carryFitNote: null,
      loaded: new Map(),
      assetStatus: new Map(),
      renderOnce: () => {},
      resizer: new ResizeObserver(() => {}),
    };
    threeScene.add(handles.routeGroup);
    threeScene.add(handles.markerGroup);
    threeScene.add(handles.carryGroup);
    viewRef.current = handles;

    const assetStatus = handles.assetStatus;
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

    // Static annotations (labeled as such): room outline, staging zones,
    // waiting discs, service markers, parking outlines.
    const annoGroup = new THREE.Group();
    threeScene.add(annoGroup);
    const zoneLineMat = new THREE.LineBasicMaterial({ color: 0x8a5a00 });
    const zoneFillMat = new THREE.MeshBasicMaterial({ color: 0x8a5a00, transparent: true, opacity: 0.06, depthWrite: false });
    const discMat = new THREE.MeshBasicMaterial({ color: 0x0b6b6e, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

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
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(q.x * MM, 0.03, q.z * MM);
        annoGroup.add(disc);
      }
      for (const s of r.service) {
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), markerMat);
        marker.position.set(s.x * MM, 0.3, s.z * MM);
        annoGroup.add(marker);
      }
    }

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

    const decollide = (): void => {
      if (cancelled || handles.labels3d.length === 0) return;
      camera.updateMatrixWorld();
      type Item = { l: Label3D; sx: number; sy: number; w: number; h: number };
      const items: Item[] = handles.labels3d.map((l) => {
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
      mount.dataset["labelCount"] = String(handles.labels3d.length);
    };

    const renderOnce = (): void => {
      if (cancelled) return;
      const r0 = performance.now();
      renderer?.render(threeScene, camera);
      labelRenderer.render(threeScene, camera);
      decollide();
      const cpu = performance.now() - r0;
      const s = statsRef.current;
      const wall = performance.now();
      if (renderWallFirstRef.current === null) renderWallFirstRef.current = wall;
      renderWallLastRef.current = wall;
      statsRef.current = {
        ...s,
        renders: s.renders + 1,
        renderMsTotal: s.renderMsTotal + cpu,
        renderMsMax: Math.max(s.renderMsMax, cpu),
        renderSpanMs: wall - (renderWallFirstRef.current ?? wall),
      };
      mount.dataset["renders"] = String(statsRef.current.renders);
      mount.dataset["renderMs"] = String(Math.round(cpu * 10) / 10);
      // Raw lifetime render-CPU total (full precision) so active-window
      // deltas divide exactly offline; window maxima are never derived
      // from lifetime maxima, so no max dataset is offered here.
      mount.dataset["renderCpuTotal"] = String(statsRef.current.renderMsTotal);
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
    handles.renderOnce = renderOnce;
    controls.addEventListener("change", renderOnce);
    // Manual orbiting leaves the preset (labels return to the full set).
    controls.addEventListener("start", () => {
      if (!cancelled && dynRef.current.preset !== null) setPreset(null);
    });
    let resizeQueued = false;
    const resizer = new ResizeObserver(() => {
      if (cancelled) return;
      // Guarded + deferred: skip unchanged sizes and run layout writes on
      // rAF so canvas resizing never feeds a ResizeObserver loop (console
      // errors are never suppressed; the loop is fixed at the root).
      if (cancelled || resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        if (cancelled) return;
        const w = Math.max(240, Math.min(1100, mount.clientWidth || 700));
        const h = w < 520 ? Math.max(300, Math.round((w * 9) / 14)) : Math.min(520, Math.round((w * 9) / 16));
        if (w === size.w && h === size.h) return;
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
    });
    handles.resizer = resizer;
    resizer.observe(mount);

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
      const loaded = handles.loaded;
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
      // Shelf containers: one InstancedMesh per asset; per-instance base
      // matrices are retained so live stock only toggles visibility.
      for (const cg of ops.containerGlbs) {
        const group = loaded.get(cg.glbUrl);
        if (!group) continue;
        const [entry] = meshesOf(group);
        if (!entry) continue;
        const items: { x: number; y: number; z: number; locId: string }[] = [];
        for (const l of ops.locations) {
          for (const c of l.containers) {
            if (c.glbUrl !== cg.glbUrl) continue;
            items.push({
              x: (l.anchorMm.x + c.dxMm) * MM,
              y: (l.anchorMm.y + c.dyMm) * MM,
              z: (l.anchorMm.z + c.dzMm) * MM,
              locId: l.id,
            });
          }
        }
        const inst = new THREE.InstancedMesh(entry.geometry, entry.material, Math.max(items.length, 1));
        inst.count = items.length;
        items.forEach((p, i) => placeInstance(inst, i, p.x, p.y, p.z, 0));
        inst.instanceMatrix.needsUpdate = true;
        threeScene.add(inst);
        const state: ContainerMeshState = { mesh: inst, items: [] };
        const m = new THREE.Matrix4();
        items.forEach((p, i) => {
          inst.getMatrixAt(i, m);
          state.items.push({ locId: p.locId, base: m.clone() });
        });
        handles.containerMeshes.push(state);
      }
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
      for (const st of ops.stations) {
        const group = loaded.get(st.glbUrl);
        if (!group) continue;
        const clone = group.clone(true);
        clone.position.set(st.centerMm.x * MM, 0, st.centerMm.z * MM);
        clone.rotation.y = (st.yawDeg * Math.PI) / 180;
        threeScene.add(clone);
      }
      // One cart assembly per unit at its parking slot; the dynamic update
      // moves the unit groups to snapshot poses (canonical yaw kept). Each
      // assembly is the sourced cart mesh shifted by the packet
      // normalization plus 2 sourced equipment crates at the unit-frame
      // dock poses (one frame, no independent shifts). Enabled only when
      // BOTH loaded geometries match the packet bounds (1mm); drift draws
      // nothing (fail closed, never a floating guess).
      const cartGroup = cartUrl ? loaded.get(cartUrl) : undefined;
      const crateGroup = ops.carry.crateGlbUrl ? loaded.get(ops.carry.crateGlbUrl) : undefined;
      const boundsDrift = (group: THREE.Group, min: readonly [number, number, number], max: readonly [number, number, number]): number => {
        const box = new THREE.Box3().setFromObject(group);
        return Math.max(
          Math.abs(box.min.x - min[0]),
          Math.abs(box.min.y - min[1]),
          Math.abs(box.min.z - min[2]),
          Math.abs(box.max.x - max[0]),
          Math.abs(box.max.y - max[1]),
          Math.abs(box.max.z - max[2]),
        );
      };
      if (cartGroup) {
        const box = new THREE.Box3().setFromObject(cartGroup);
        mount.dataset["cartBounds"] = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map(round3).join(",");
      }
      if (crateGroup) {
        const box = new THREE.Box3().setFromObject(crateGroup);
        mount.dataset["crateBounds"] = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map(round3).join(",");
      }
      const cartDrift = cartGroup ? boundsDrift(cartGroup, ops.carry.cartBoundsM.min, ops.carry.cartBoundsM.max) : Infinity;
      const crateDrift = crateGroup ? boundsDrift(crateGroup, ops.carry.crateBoundsM.min, ops.carry.crateBoundsM.max) : Infinity;
      if (cartGroup && crateGroup && cartDrift <= 0.001 && crateDrift <= 0.001) {
        handles.carryReady = true;
        mount.dataset["carryModel"] = ops.carry.model;
        mount.dataset["carryDocks"] = ops.carry.docksUnitM.map((d) => `${d.id}:${d.xM},${d.yM},${d.zM}`).join(";");
        for (const u of ops.units) {
          const assembly = new THREE.Group();
          const cartMesh = cartGroup.clone(true);
          cartMesh.position.set(ops.carry.normalizationM.x, ops.carry.normalizationM.y, ops.carry.normalizationM.z);
          assembly.add(cartMesh);
          for (const dock of ops.carry.docksUnitM) {
            const tote = crateGroup.clone(true);
            tote.position.set(dock.xM, dock.yM, dock.zM);
            tote.rotation.y = (dock.yawDeg * Math.PI) / 180;
            assembly.add(tote);
          }
          assembly.position.set(u.parkingMm.x * MM, 0, u.parkingMm.z * MM);
          threeScene.add(assembly);
          handles.cartOf.set(u.id, assembly);
        }
      } else {
        handles.cartBoundsNote = `BLOCKER carry geometry drifted (cart ${cartDrift === Infinity ? "missing" : cartDrift.toFixed(3)}m, crate ${crateDrift === Infinity ? "missing" : crateDrift.toFixed(3)}m vs packet); equipment + markers refused, nothing attached`;
        mount.dataset["carryModel"] = "refused";
        // Units still need pose groups so selection/markers work; they carry nothing.
        for (const u of ops.units) {
          const assembly = new THREE.Group();
          assembly.position.set(u.parkingMm.x * MM, 0, u.parkingMm.z * MM);
          threeScene.add(assembly);
          handles.cartOf.set(u.id, assembly);
        }
      }
      statsRef.current = { ...statsRef.current, loadMs: Math.round(performance.now() - t0), assets: statAssets() };
      // Static geometry is complete: apply the current dynamic state once.
      updateRef.current?.();
      onStatsRef.current({ ...statsRef.current });
    })();

    // First paint with whatever dynamic state is already known.
    updateRef.current?.();

    return () => {
      savedCamRef.current = viewRef.current
        ? { pos: viewRef.current.camera.position.clone(), target: viewRef.current.controls.target.clone() }
        : savedCamRef.current;
      cancelled = true;
      resizer.disconnect();
      controls.dispose();
      renderer.dispose();
      labelRenderer.domElement.remove();
      // Dispose only owned annotation/overlay resources; cached GLB
      // geometries/materials stay alive in the module cache for remounts
      // and the planner view.
      threeScene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh instanceof THREE.Mesh && (mesh.geometry as THREE.BufferGeometry | undefined)) {
          const g = mesh.geometry;
          const cached = [...handles.loaded.values()].some((grp) => meshesOf(grp).some((e) => e.geometry === g));
          if (!cached) g.dispose();
        }
      });
      mount.replaceChildren();
      if (viewRef.current === handles) viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops]);

  // Dynamic inputs flow through the persistent view without rebuilding it.
  useEffect(() => {
    updateRef.current?.();
  }, [snapshot, selection, labelLayer, preset]);

  // Report fresh render stats after dynamic updates (draws/tris/gpu/carry).
  useEffect(() => {
    onStats({ ...statsRef.current });
  }, [snapshot, selection, onStats]);

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
      const p = poseOf(selection.id);
      return { x: p.x * MM, y: 0.7, z: p.z * MM, dist: 7 };
    }
    if (selection.kind === "order") {
      const o = snapshot?.orders.find((x) => x.orderId === selection.id);
      if (o?.unitId) {
        const p = poseOf(o.unitId);
        return { x: p.x * MM, y: 0.7, z: p.z * MM, dist: 8 };
      }
      const first = o?.reservation[0] ? ops.locations.find((l) => l.id === o.reservation[0]!.locationId) : undefined;
      if (first) return { x: first.anchorMm.x * MM, y: 0.6, z: first.anchorMm.z * MM, dist: 9 };
      return null;
    }
    const r = ops.resources.find((x) => x.id === selection.id);
    if (!r || !r.service[0]) return null;
    const st = ops.stations.find((x) => x.id === selection.id);
    if (st) {
      return { x: ((st.centerMm.x + r.service[0].x) / 2) * MM, y: 0.6, z: ((st.centerMm.z + r.service[0].z) / 2) * MM, dist: 10 };
    }
    return { x: r.service[0].x * MM, y: 0.6, z: r.service[0].z * MM, dist: 9 };
  };

  const applyPreset = (name: "overview" | "top" | "inspect" | "reset"): void => {
    const v = viewRef.current;
    const home = homeRef.current;
    if (!v || !home) return;
    setPreset(name === "reset" ? "overview" : name);
    const { controls } = v;
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
    v.renderOnce();
  };

  const zoom = (f: number): void => {
    const v = viewRef.current;
    if (!v) return;
    const { controls } = v;
    const camera = controls.object;
    const offset = camera.position.clone().sub(controls.target);
    const next = Math.min(80, Math.max(1, offset.length() * f));
    camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
    controls.update();
    v.renderOnce();
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
          title={selection ? `Inspect ${selection.kind} ${selection.id}` : "Select an order, location, rack, agent, or station first"}
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
