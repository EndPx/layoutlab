// Operations scene-input boundary: the typed bridge between the canonical
// operations fixture and the warehouse renderer.
//
// The ONLY warehouse positions in the main environment come from parsing
// fixtures/operations/main-warehouse.json with @layoutlab/simulation.
// Visual bindings (fixtures/operations/main-warehouse.bindings.json)
// reference fixture IDs + measured source bounds/scaling and invent no
// positions. Container grids, deck mapping, and rack scaling all run
// through the shared simulation helpers, so the renderer cannot drift
// from the headless proof scripts. Later engine state will flow through
// this same OperationsScene shape (stock/selection overlays), never
// through hand-coded parallel arrays.
import {
  containerGrid,
  containersForStock,
  createOperationsController,
  deckIndexForAnchorY,
  parseOperationsExecutionConfig,
  parseOperationsScenario,
  rackAxisScale,
  type OperationsController,
  type OperationsScenario,
  type OperationsSnapshot,
} from "@layoutlab/simulation";
import bindingsJson from "../../../../fixtures/operations/main-warehouse.bindings.json";
import burstJson from "../../../../fixtures/operations/picking-packing-burst.json";
import burstRunconfigJson from "../../../../fixtures/operations/picking-packing-burst.runconfig.json";
import fixtureJson from "../../../../fixtures/operations/main-warehouse.json";
import carryPacketJson from "../../../../assets/cargo/carry-luggage-platform-a01.json";

export type Vec3Mm = { x: number; y: number; z: number };

export type SceneContainer = {
  asset: string;
  glbUrl: string;
  dxMm: number;
  dyMm: number;
  dzMm: number;
};

export type SceneLocation = {
  id: string;
  rackId: string;
  anchorMm: Vec3Mm;
  approachMm: { x: number; z: number };
  usableMm: { width: number; depth: number; height: number };
  deck: number;
  productId: string | null;
  quantity: number;
  unitsPerVisual: number;
  containers: SceneContainer[];
};

export type SceneRack = {
  id: string;
  positionMm: { x: number; z: number };
  dimsMm: { width: number; depth: number; height: number };
  scale: { x: number; y: number; z: number };
};

export type SceneUnit = {
  id: string;
  role: "picker" | "putaway";
  parkingMm: { x: number; z: number };
  loadCapacityUnits: number;
  footprintMm: { width: number; length: number; margin: number };
};

export type SceneResource = {
  id: string;
  kind: "receiving" | "packing" | "dispatch";
  service: { id: string; x: number; z: number }[];
  queue: { id: string; x: number; z: number }[];
  serviceCapacity: number;
};

export type SceneObstacle = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  visual: string;
};

export type ShellPlacement = {
  id: string;
  glbUrl: string;
  positionM: [number, number, number];
  yawDeg: number;
  cutawayYM: number | null;
};

export type CarryDock = { id: string; xM: number; yM: number; zM: number; yawDeg: number };

export type CarryCell = { id: string; x0Mm: number; z0Mm: number; wMm: number; dMm: number; hMm: number };

// Data-driven carry (cargo-C2): the carry packet is the single source of
// cart/tote bounds, whole-assembly normalization, equipment dock poses,
// fixed cell layout, cargo yaw, profile, and capacity. The renderer
// consumes this and refuses drifted geometry; it invents no poses.
export type SceneCarry = {
  model: string;
  crateGlbUrl: string;
  normalizationM: { x: number; y: number; z: number };
  docksUnitM: CarryDock[];
  cellsCrateLocalMm: CarryCell[];
  cargoYawDeg: number;
  capacityUnits: number;
  crateInteriorMm: { width: number; depth: number; floorTopY: number; rimY: number };
  deckTopYM: number;
  cartBoundsM: { min: [number, number, number]; max: [number, number, number] };
  crateBoundsM: { min: [number, number, number]; max: [number, number, number] };
};

export type OperationsScene = {
  scenario: OperationsScenario;
  roomMm: { width: number; depth: number };
  racks: SceneRack[];
  locations: SceneLocation[];
  units: SceneUnit[];
  resources: SceneResource[];
  obstacles: SceneObstacle[];
  floorTiles: { xM: number; zM: number; topYM: number }[];
  walls: ShellPlacement[];
  entrances: ShellPlacement[];
  stations: { id: string; glbUrl: string; centerMm: { x: number; z: number }; yawDeg: number }[];
  carry: SceneCarry;
  cartGlbUrl: string;
  rackGlbUrl: string;
  floorGlbUrl: string;
  containerGlbs: { asset: string; glbUrl: string; count: number; unitDimsMm: { width: number; depth: number; height: number } }[];
  counts: {
    racks: number;
    locations: number;
    products: number;
    stockEntries: number;
    units: number;
    resources: number;
    orders: number;
    deliveries: number;
    obstacles: number;
    containers: number;
  };
};

export type OperationsSelection =
  | { kind: "location"; id: string }
  | { kind: "rack"; id: string }
  | { kind: "unit"; id: string }
  | { kind: "resource"; id: string }
  | { kind: "order"; id: string }
  | null;

type Bindings = {
  bindingsVersion: string;
  fixtureId: string;
  containers: Record<string, { glb: string; unitDimsMm: { width: number; depth: number; height: number } }>;
  products: Record<string, { containerAsset: string; unitsPerVisual: number }>;
  racks: { glb: string; sourceSizeM: { x: number; y: number; z: number }; deckTopsMm: number[] };
  mobileUnits: { glb: string; yawDeg: number; carryPacket: string; equipmentCrates: { glb: string } };
  carryModel: string;
  stations: Record<string, { glb: string; centerMm: { x: number; z: number }; yawDeg: number }>;
  floor: { glb: string; tileMm: number; tilesX: number; tilesZ: number; topYMm: number };
  walls: { glb: string; cutawayYM: number; placements: { id: string; positionM: [number, number, number]; yawDeg: number }[] };
  entrances: { glb: string; cutawayYM: number; placements: { id: string; positionM: [number, number, number]; yawDeg: number }[] };
  obstacleVisuals: Record<string, { kind: string }>;
};

function glbUrl(repoPath: string): string {
  const prefix = "apps/web/public";
  if (!repoPath.startsWith(prefix)) {
    throw new Error(`binding GLB path must start with ${prefix}, got ${repoPath}`);
  }
  return repoPath.slice(prefix.length);
}

function asBindings(json: unknown): Bindings {
  if (typeof json !== "object" || json === null) throw new Error("bindings file is not an object");
  const b = json as Partial<Bindings>;
  if (b.bindingsVersion !== "layoutlab.operations-bindings/1") {
    throw new Error(`unsupported bindings version ${(b as { bindingsVersion?: unknown }).bindingsVersion}`);
  }
  for (const key of ["containers", "products", "racks", "mobileUnits", "stations", "floor", "walls", "entrances", "obstacleVisuals"] as const) {
    if (typeof b[key] !== "object" || b[key] === null) throw new Error(`bindings missing section ${key}`);
  }
  return b as Bindings;
}

let cached: OperationsScene | null = null;
let cachedError: string | null = null;

export function loadOperationsScene(): OperationsScene {
  if (cached) return cached;
  if (cachedError) throw new Error(cachedError);
  try {
    cached = buildOperationsScene();
    return cached;
  } catch (e) {
    cachedError = e instanceof Error ? e.message : String(e);
    throw e;
  }
}

export function buildOperationsScene(): OperationsScene {
  const scenario = parseOperationsScenario(fixtureJson);
  const bd = asBindings(bindingsJson);
  if (bd.fixtureId !== scenario.id) {
    throw new Error(`bindings target fixture ${bd.fixtureId}, loaded ${scenario.id}`);
  }
  return buildSceneFrom(scenario, bd);
}

function buildSceneFrom(scenario: OperationsScenario, bd: Bindings): OperationsScene {

  const racks: SceneRack[] = scenario.geometry.racks.map((r) => ({
    id: r.id,
    positionMm: { ...r.positionMm },
    dimsMm: { ...r.dimensionsMm },
    scale: rackAxisScale(bd.racks.sourceSizeM, r.dimensionsMm),
  }));

  const stockByLoc = new Map(scenario.initialStock.map((s) => [s.locationId, s]));
  const containerCounts = new Map<string, number>();
  const locations: SceneLocation[] = scenario.locations.map((loc) => {
    const deck = deckIndexForAnchorY(loc.storageAnchorMm.y, bd.racks.deckTopsMm);
    if (deck < 0) {
      throw new Error(`location ${loc.id} anchor y=${loc.storageAnchorMm.y} sits on no deck (fixture error)`);
    }
    const stock = stockByLoc.get(loc.id);
    if (!stock) {
      return {
        id: loc.id,
        rackId: loc.rackId,
        anchorMm: { ...loc.storageAnchorMm },
        approachMm: { ...loc.approachPointMm },
        usableMm: { ...loc.usableDimensionsMm },
        deck,
        productId: null,
        quantity: 0,
        unitsPerVisual: 0,
        containers: [],
      };
    }
    const bind = bd.products[stock.productId];
    if (!bind) throw new Error(`product ${stock.productId} has no visual binding`);
    const container = bd.containers[bind.containerAsset];
    if (!container) throw new Error(`container asset ${bind.containerAsset} unbound`);
    const count = containersForStock(stock.quantity, bind.unitsPerVisual);
    const grid = containerGrid(loc.usableDimensionsMm, container.unitDimsMm, count);
    const url = glbUrl(container.glb);
    containerCounts.set(bind.containerAsset, (containerCounts.get(bind.containerAsset) ?? 0) + count);
    return {
      id: loc.id,
      rackId: loc.rackId,
      anchorMm: { ...loc.storageAnchorMm },
      approachMm: { ...loc.approachPointMm },
      usableMm: { ...loc.usableDimensionsMm },
      deck,
      productId: stock.productId,
      quantity: stock.quantity,
      unitsPerVisual: bind.unitsPerVisual,
      containers: grid.placements.map((p) => ({
        asset: bind.containerAsset,
        glbUrl: url,
        dxMm: p.dxMm,
        dyMm: p.dyMm,
        dzMm: p.dzMm,
      })),
    };
  });

  const floorTiles: OperationsScene["floorTiles"] = [];
  for (let ix = 0; ix < bd.floor.tilesX; ix++) {
    for (let iz = 0; iz < bd.floor.tilesZ; iz++) {
      floorTiles.push({
        xM: ((ix + 0.5) * bd.floor.tileMm) / 1000,
        zM: ((iz + 0.5) * bd.floor.tileMm) / 1000,
        topYM: bd.floor.topYMm / 1000,
      });
    }
  }

  const containerGlbs = [...containerCounts.entries()].map(([asset, count]) => ({
    asset,
    glbUrl: glbUrl(bd.containers[asset]!.glb),
    count,
    unitDimsMm: { ...bd.containers[asset]!.unitDimsMm },
  }));

  const containers = locations.reduce((n, l) => n + l.containers.length, 0);
  return {
    scenario,
    roomMm: { width: scenario.geometry.room.widthMm, depth: scenario.geometry.room.depthMm },
    racks,
    locations,
    units: scenario.mobileUnits.map((u) => ({ id: u.id, role: u.role, parkingMm: { ...u.parkingSlotMm }, loadCapacityUnits: u.loadCapacityUnits, footprintMm: { ...u.footprintMm } })),
    resources: scenario.resources.map((r) => ({
      id: r.id,
      kind: r.kind,
      service: r.servicePositions.map((s) => ({ ...s })),
      queue: r.queueSlots.map((s) => ({ ...s })),
      serviceCapacity: r.serviceCapacity,
    })),
    obstacles: scenario.geometry.obstacles.map((o) => {
      const visual = bd.obstacleVisuals[o.id];
      if (!visual) throw new Error(`obstacle ${o.id} has no visual binding`);
      return { id: o.id, minX: o.minXMm, maxX: o.maxXMm, minZ: o.minZMm, maxZ: o.maxZMm, visual: visual.kind };
    }),
    floorTiles,
    walls: bd.walls.placements.map((p) => ({ id: p.id, glbUrl: glbUrl(bd.walls.glb), positionM: p.positionM, yawDeg: p.yawDeg, cutawayYM: bd.walls.cutawayYM })),
    entrances: bd.entrances.placements.map((p) => ({ id: p.id, glbUrl: glbUrl(bd.entrances.glb), positionM: p.positionM, yawDeg: p.yawDeg, cutawayYM: bd.entrances.cutawayYM })),
    stations: Object.entries(bd.stations).map(([id, s]) => ({ id, glbUrl: glbUrl(s.glb), centerMm: { ...s.centerMm }, yawDeg: s.yawDeg })),
    carry: buildSceneCarry(scenario, bd),
    cartGlbUrl: glbUrl(bd.mobileUnits.glb),
    rackGlbUrl: glbUrl(bd.racks.glb),
    floorGlbUrl: glbUrl(bd.floor.glb),
    containerGlbs,
    counts: {
      racks: scenario.geometry.racks.length,
      locations: scenario.locations.length,
      products: scenario.products.length,
      stockEntries: scenario.initialStock.length,
      units: scenario.mobileUnits.length,
      resources: scenario.resources.length,
      orders: scenario.orderSchedule.length,
      deliveries: scenario.deliverySchedule.length,
      obstacles: scenario.geometry.obstacles.length,
      containers,
    },
  };
}

function buildSceneCarry(scenario: OperationsScenario, bd: Bindings): SceneCarry {
  const packet = assertCarryPacketCompatible(scenario, bd.mobileUnits.carryPacket, bd.carryModel);
  return {
    model: packet.model,
    crateGlbUrl: glbUrl(bd.mobileUnits.equipmentCrates.glb),
    normalizationM: { ...packet.normalizationM },
    docksUnitM: packet.docksUnitM.map((d) => ({ id: d.id, xM: d.x, yM: d.crateOriginY, zM: d.z, yawDeg: d.yawDeg })),
    cellsCrateLocalMm: packet.cellsCrateLocalMm.map((c) => ({ id: c.id, x0Mm: c.x0, z0Mm: c.z0, wMm: c.w, dMm: c.d, hMm: c.h })),
    cargoYawDeg: packet.cargoYawDeg,
    capacityUnits: packet.capacityUnits,
    crateInteriorMm: { ...packet.crateInteriorMm },
    deckTopYM: packet.deckTopYM,
    cartBoundsM: { min: [...packet.sourceBoundsM.min], max: [...packet.sourceBoundsM.max] },
    crateBoundsM: { min: [...packet.crateBoundsM.min], max: [...packet.crateBoundsM.max] },
  };
}
// Operational truth: a unit is busy when it holds a task OR its wheels
// are engaged. Handling work (picking/unloading/queued/task-assigned)
// with idle transport is still busy — transport idleness alone never
// means worker idle (review: at 16957ms PK-1/PK-2 pick with idle
// transport while PK-3/PK-4 move, so 4/6 busy, not 2/6).
export function isUnitOperationallyBusy(u: {
  transportState: string;
  task: { kind: string };
}): boolean {
  return u.task.kind !== "idle" || u.transportState !== "idle";
}

// Short operational label: task-first, transport as secondary detail so
// handling with stopped wheels never reads as idle.
export function unitOperationalLabel(u: {
  transportState: string;
  task: { kind: string };
}): string {
  if (u.task.kind === "idle") {
    return u.transportState === "idle" ? "idle" : `idle · wheels ${u.transportState}`;
  }
  return `${u.task.kind} · wheels ${u.transportState}`;
}

// Live-stock visuals: full containers plus at most one partial container
// holding the remainder. Unlike the static environment helper this never
// throws, shrinks, or rounds when quantity is not a multiple of
// unitsPerVisual: the partial keeps the same full-size mesh and the UI
// labels it with its remaining item count. Zero stock renders nothing.
export function visualContainersForQty(
  quantity: number,
  unitsPerVisual: number,
): { full: number; partial: number } {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`stock quantity ${quantity} must be a non-negative integer`);
  }
  if (!Number.isInteger(unitsPerVisual) || unitsPerVisual <= 0) {
    throw new RangeError(`unitsPerVisual ${unitsPerVisual} must be a positive integer`);
  }
  return { full: Math.floor(quantity / unitsPerVisual), partial: quantity % unitsPerVisual };
}


// Derived-fixture compatibility: the picking/packing burst reuses the
// main-warehouse visual bindings only when its reused spatial state is
// spatially identical. Every room/rack/obstacle/location/resource/unit
// spatial id/dim/anchor/coord/footprint/park is compared field by field;
// any drift throws instead of silently reusing another fixture's bindings.
export function assertDerivedFixtureCompatible(
  parent: OperationsScenario,
  derived: OperationsScenario,
): void {
  const bad: string[] = [];
  const same = (label: string, a: unknown, b: unknown): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(label);
  };
  same("room", parent.geometry.room, derived.geometry.room);
  same(
    "racks",
    parent.geometry.racks.map((r) => [r.id, r.positionMm, r.dimensionsMm]),
    derived.geometry.racks.map((r) => [r.id, r.positionMm, r.dimensionsMm]),
  );
  same(
    "obstacles",
    parent.geometry.obstacles.map((o) => [o.id, o.minXMm, o.maxXMm, o.minZMm, o.maxZMm]),
    derived.geometry.obstacles.map((o) => [o.id, o.minXMm, o.maxXMm, o.minZMm, o.maxZMm]),
  );
  same(
    "locations",
    parent.locations.map((l) => [l.id, l.rackId, l.storageAnchorMm, l.approachPointMm, l.usableDimensionsMm]),
    derived.locations.map((l) => [l.id, l.rackId, l.storageAnchorMm, l.approachPointMm, l.usableDimensionsMm]),
  );
  // Every spatial assumption the binding reuses beyond static geometry:
  // resource identities, service/queue coordinates (markers, discs,
  // station mapping), and unit identities, roles, footprints (carry
  // envelope + radius), and parking slots (outlines, initial poses).
  // Changed workload/provenance (orders, deliveries, stock, seed,
  // policies) stays allowed; spatial drift refuses the bindings.
  same(
    "resources",
    parent.resources.map((r) => [r.id, r.kind, r.serviceCapacity, r.servicePositions, r.queueSlots]),
    derived.resources.map((r) => [r.id, r.kind, r.serviceCapacity, r.servicePositions, r.queueSlots]),
  );
  same(
    "mobileUnits",
    parent.mobileUnits.map((u) => [u.id, u.role, u.footprintMm, u.parkingSlotMm]),
    derived.mobileUnits.map((u) => [u.id, u.role, u.footprintMm, u.parkingSlotMm]),
  );
  if (bad.length > 0) {
    throw new Error(
      `derived fixture ${derived.id} is not spatially identical to ${parent.id}: ${bad.join(", ")} differ; refusing main-warehouse bindings`,
    );
  }
}

export type RouteSplit = {
  completed: { x: number; z: number }[];
  active: { x: number; z: number }[];
  split: { x: number; z: number };
  segmentIndex: number;
};

// Split an authorized polyline at the EXACT engine pose: the pose rides
// its timed segment by construction (linear interpolation), so project
// it onto that segment and insert the pose itself as the split vertex.
// The whole polyline is preserved (no deleted points, no invented path);
// mid-segment poses never snap to the nearest grid vertex.
export function splitRouteAtPose(
  points: { x: number; z: number }[],
  pose: { x: number; z: number },
): RouteSplit | null {
  if (points.length < 2) return null;
  for (let k = 0; k < points.length; k++) {
    const p = points[k]!;
    if (p.x === pose.x && p.z === pose.z) {
      return {
        completed: points.slice(0, k + 1).map((q) => ({ ...q })),
        active: points.slice(k).map((q) => ({ ...q })),
        split: { x: pose.x, z: pose.z },
        segmentIndex: Math.min(k, points.length - 2),
      };
    }
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const t = ((pose.x - a.x) * dx + (pose.z - a.z) * dz) / len2;
    const tc = Math.min(1, Math.max(0, t));
    const px = a.x + dx * tc;
    const pz = a.z + dz * tc;
    const d = (px - pose.x) * (px - pose.x) + (pz - pose.z) * (pz - pose.z);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best < 0) return null;
  const split = { x: pose.x, z: pose.z };
  return {
    completed: [...points.slice(0, best + 1).map((q) => ({ ...q })), { ...split }],
    active: [{ ...split }, ...points.slice(best + 1).map((q) => ({ ...q }))],
    split,
    segmentIndex: best,
  };
}

// Sparse route arrowheads (publication presentation): placements at fixed
// arc-distance intervals along the ACTUAL active polyline. Each arrow
// sits exactly on its hosting segment (position interpolated, direction
// is the segment unit vector), so corners keep their true vertex path
// with no shortcuts or invented segments. The pose-split LINE is
// untouched; only direction cues are sparse (never one per 100mm grid
// point). Targets are spacing, 2*spacing, ... strictly below the total
// length, so the destination sphere keeps its own marker and short legs
// below one spacing show no arrowheads.
export const SPARSE_ARROW_SPACING_MM = 1750;

export type RouteArrowhead = {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  segmentIndex: number;
  distanceMm: number;
};

export function sparseRouteArrowheads(
  active: { x: number; z: number }[],
  spacingMm: number = SPARSE_ARROW_SPACING_MM,
): RouteArrowhead[] {
  if (!Number.isFinite(spacingMm) || spacingMm <= 0) {
    throw new RangeError(`arrow spacing ${spacingMm} must be a positive finite number`);
  }
  if (active.length < 2) return [];
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < active.length; i++) {
    const a = active[i]!;
    const b = active[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segLen.push(len);
    total += len;
  }
  const out: RouteArrowhead[] = [];
  let target = spacingMm;
  let seg = 0;
  let segStart = 0;
  while (target < total && seg < segLen.length) {
    while (seg < segLen.length && segStart + segLen[seg]! < target) {
      segStart += segLen[seg]!;
      seg += 1;
    }
    if (seg >= segLen.length) break;
    const a = active[seg]!;
    const b = active[seg + 1]!;
    const len = segLen[seg]!;
    if (len < 1e-9) {
      segStart += len;
      seg += 1;
      continue;
    }
    const t = Math.min(1, Math.max(0, (target - segStart) / len));
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    out.push({
      x: a.x + dx * t,
      z: a.z + dz * t,
      dirX: dx / len,
      dirZ: dz / len,
      segmentIndex: seg,
      distanceMm: target,
    });
    target += spacingMm;
  }
  return out;
}

export type PickStopState = { locId: string; done: boolean };

// Per-location pick states from one order reservation, in reservation
// order (deduped): remaining quantities sum per location, so a location
// at zero remaining everywhere is completed and anything with remaining
// items is still intent. Zero-remaining sources are never reported as
// unvisited future stops.
export function pickStopStates(
  reservation: { locationId: string; quantity: number }[],
): PickStopState[] {
  const order: string[] = [];
  const remaining = new Map<string, number>();
  for (const r of reservation) {
    if (!remaining.has(r.locationId)) {
      order.push(r.locationId);
      remaining.set(r.locationId, 0);
    }
    remaining.set(r.locationId, remaining.get(r.locationId)! + r.quantity);
  }
  return order.map((locId) => ({ locId, done: remaining.get(locId) === 0 }));
}

// Cargo-C2 carry packet: the single source of cart/tote bounds,
// whole-assembly normalization, equipment dock poses, fixed cell layout,
// cargo yaw, profile, and capacity. Values are verified against actual GLB
// bytes and canonical fixtures by scripts/warehouse-cargo-fit.mjs; the
// renderer consumes them and refuses drifted geometry.
const CARRY_PACKET_PATH = "assets/cargo/carry-luggage-platform-a01.json";

export type CarryPacket = {
  packetVersion: string;
  model: string;
  sourceBoundsM: { min: [number, number, number]; max: [number, number, number] };
  crateBoundsM: { min: [number, number, number]; max: [number, number, number] };
  normalizationM: { x: number; y: number; z: number };
  deckTopYM: number;
  crateInteriorMm: { width: number; depth: number; floorTopY: number; rimY: number };
  docksUnitM: { id: string; x: number; crateOriginY: number; z: number; yawDeg: number }[];
  cellsCrateLocalMm: { id: string; x0: number; z0: number; w: number; d: number; h: number }[];
  cargoYawDeg: number;
  capacityUnits: number;
  profile: { width: number; length: number; margin: number; radius: number };
};

function asCarryPacket(json: unknown): CarryPacket {
  if (typeof json !== "object" || json === null) throw new Error("carry packet is not an object");
  const p = json as Partial<CarryPacket>;
  if (p.packetVersion !== "layoutlab.cargo-carry/1") {
    throw new Error(`unsupported carry packet version ${(p as { packetVersion?: unknown }).packetVersion}`);
  }
  if (p.model !== "cargo-c2-centered680x1220") {
    throw new Error(`unsupported carry model ${(p as { model?: unknown }).model}`);
  }
  for (const key of ["sourceBoundsM", "crateBoundsM", "normalizationM", "crateInteriorMm", "docksUnitM", "cellsCrateLocalMm", "profile"] as const) {
    if (typeof p[key] !== "object" || p[key] === null) throw new Error(`carry packet missing section ${key}`);
  }
  if (!Array.isArray(p.docksUnitM) || p.docksUnitM.length !== 2) throw new Error("carry packet must declare exactly 2 unit-frame docks");
  if (!Array.isArray(p.cellsCrateLocalMm) || p.cellsCrateLocalMm.length !== 2) throw new Error("carry packet must declare exactly 2 cells per crate");
  if (p.cargoYawDeg !== 90) throw new Error(`carry packet cargo yaw must be 90, got ${String(p.cargoYawDeg)}`);
  if (p.capacityUnits !== 2 * 2) throw new Error(`carry packet capacity must be 2 crates x 2 cells = 4, got ${String(p.capacityUnits)}`);
  return p as CarryPacket;
}

// Carry compatibility: the bindings pointer must name the imported packet,
// the models must agree, and every unit's fixture footprint/capacity must
// equal the packet profile/capacity (no silent model drift).
export function assertCarryPacketCompatible(
  scenario: OperationsScenario,
  bindingsCarryPacket: unknown,
  bindingsCarryModel: unknown,
): CarryPacket {
  if (bindingsCarryPacket !== CARRY_PACKET_PATH) {
    throw new Error(`bindings carry packet ${String(bindingsCarryPacket)} is not the imported ${CARRY_PACKET_PATH}; refusing drifted carry data`);
  }
  const packet = asCarryPacket(carryPacketJson);
  if (bindingsCarryModel !== packet.model) {
    throw new Error(`bindings carry model ${String(bindingsCarryModel)} disagrees with packet ${packet.model}`);
  }
  for (const u of scenario.mobileUnits) {
    const fp = u.footprintMm;
    if (fp.width !== packet.profile.width || fp.length !== packet.profile.length || fp.margin !== packet.profile.margin) {
      throw new Error(`unit ${u.id} footprint ${fp.width}x${fp.length}+${fp.margin} disagrees with carry profile ${packet.profile.width}x${packet.profile.length}+${packet.profile.margin}`);
    }
    if (u.loadCapacityUnits !== packet.capacityUnits) {
      throw new Error(`unit ${u.id} capacity ${u.loadCapacityUnits} disagrees with carry capacity ${packet.capacityUnits}`);
    }
  }
  return packet;
}

export type CarryPlacement = {
  productId: string;
  itemOrdinal: number;
  crateIndex: number;
  cellId: string;
};

// Stable SKU/item-ordinal allocation of ACTUAL carried lines into fixed
// cells: lines expand in ledger order, each item takes the next cell
// (crate-major: A0, A1, B0, B1), ordinals count per SKU from 1. Overflow
// (beyond crateCount x cellsPerCrate) is reported, never silently dropped
// or stacked: the engine capacity check must already forbid it.
export function allocateCarryCells(
  carried: { productId: string; quantity: number }[],
  crateCount: number,
  cellsPerCrate: number,
  cellIds: string[],
): { placements: CarryPlacement[]; overflowUnits: number } {
  const placements: CarryPlacement[] = [];
  const ordinals = new Map<string, number>();
  let cell = 0;
  const total = crateCount * cellsPerCrate;
  for (const line of carried) {
    for (let k = 0; k < line.quantity; k++) {
      const ordinal = (ordinals.get(line.productId) ?? 0) + 1;
      ordinals.set(line.productId, ordinal);
      if (cell < total) {
        placements.push({
          productId: line.productId,
          itemOrdinal: ordinal,
          crateIndex: Math.floor(cell / cellsPerCrate),
          cellId: cellIds[cell % cellsPerCrate] as string,
        });
        cell += 1;
      }
    }
  }
  const units = carried.reduce((n, l) => n + l.quantity, 0);
  return { placements, overflowUnits: Math.max(0, units - total) };
}

export type CarryMarkerPose = {
  xMm: number;
  yMm: number;
  zMm: number;
  yawDeg: number;
  fitsCell: boolean;
};

// Bounds-marker pose for one item inside its cell (crate-local mm): corner
// placement at the cell origin, universal cargo yaw90 (plan footprint
// X=itemD, Z=itemW), resting on the interior floor top. fitsCell re-checks
// the envelope so the renderer never draws an overfull cell as valid.
export function carryMarkerPose(
  dimsMm: { width: number; depth: number; height: number },
  cell: CarryCell,
  floorTopYMm: number,
  yawDeg: number,
): CarryMarkerPose {
  if (yawDeg !== 90) throw new RangeError(`cargo yaw must be 90, got ${yawDeg}`);
  const footX = dimsMm.depth;
  const footZ = dimsMm.width;
  return {
    xMm: cell.x0Mm + footX / 2,
    yMm: floorTopYMm + dimsMm.height / 2,
    zMm: cell.z0Mm + footZ / 2,
    yawDeg,
    fitsCell: footX <= cell.wMm && footZ <= cell.dMm && dimsMm.height <= cell.hMm,
  };
}

let burstCached: OperationsScene | null = null;
let burstCachedError: string | null = null;

// Default Operations sample: the SYNTHETIC picking-to-packing burst on
// validated canonical geometry. The 28-order + 12-delivery main schedule
// is never executed here (unsupported inbound); it stays available as a
// configured static scene through loadOperationsScene only.
export function loadBurstOperationsScene(): OperationsScene {
  if (burstCached) return burstCached;
  if (burstCachedError) throw new Error(burstCachedError);
  try {
    burstCached = buildBurstOperationsScene();
    return burstCached;
  } catch (e) {
    burstCachedError = e instanceof Error ? e.message : String(e);
    throw e;
  }
}

export function buildBurstOperationsScene(): OperationsScene {
  const parent = parseOperationsScenario(fixtureJson);
  const scenario = parseOperationsScenario(burstJson);
  assertDerivedFixtureCompatible(parent, scenario);
  const bd = asBindings(bindingsJson);
  if (bd.fixtureId !== parent.id) {
    throw new Error(`bindings target fixture ${bd.fixtureId}, expected parent ${parent.id}`);
  }
  return buildSceneFrom(scenario, bd);
}

// One engine for the default Operations run: burst scenario plus the
// validated runconfig handling durations. The controller deep-detaches
// its inputs, so the shared imports stay immutable.
export function createBurstController(): OperationsController {
  const scenario = parseOperationsScenario(burstJson);
  const runconfig = burstRunconfigJson as { executionConfig: unknown };
  const executionConfig = parseOperationsExecutionConfig(runconfig.executionConfig);
  return createOperationsController({ scenario, executionConfig });
}

// Experiments inspection (E4b): build the canonical scene/controller for an
// ARBITRARY executed scenario (baseline scenario + declared patch). Spatial
// drift refuses the main-warehouse bindings exactly like the burst check,
// so an unmapped candidate disables visualization instead of drawing an
// unrelated warehouse. Service durations are not spatial and stay allowed.
export function buildSceneForScenario(scenario: OperationsScenario): OperationsScene {
  const parent = parseOperationsScenario(fixtureJson);
  assertDerivedFixtureCompatible(parent, scenario);
  const bd = asBindings(bindingsJson);
  if (bd.fixtureId !== parent.id) {
    throw new Error(`bindings target fixture ${bd.fixtureId}, expected parent ${parent.id}`);
  }
  return buildSceneFrom(scenario, bd);
}

export function createControllerForScenario(
  scenario: OperationsScenario,
  executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number },
): OperationsController {
  return createOperationsController({ scenario, executionConfig });
}

export function burstScenarioAndConfig(): {
  scenario: OperationsScenario;
  executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number };
} {
  const scenario = parseOperationsScenario(burstJson);
  const runconfig = burstRunconfigJson as { executionConfig: unknown };
  const executionConfig = parseOperationsExecutionConfig(runconfig.executionConfig);
  return { scenario, executionConfig };
}

// Versioned inspection (R3c contract): recorded/candidate runs replay on
// their recorded implementation, never silently on the latest engine. The
// factory is wired by name so this module still typechecks before R3c's
// compiled export lands; a missing factory or unknown version fails closed.
import * as simulationNs from "@layoutlab/simulation";
export function currentImplementationVersion(): string {
  const ns = simulationNs as unknown as Record<string, unknown>;
  return typeof ns["CURRENT_IMPLEMENTATION_VERSION"] === "string"
    ? (ns["CURRENT_IMPLEMENTATION_VERSION"] as string)
    : typeof ns["SIMULATION_VERSION"] === "string"
      ? (ns["SIMULATION_VERSION"] as string)
      : "unknown";
}
export function createControllerForVersioned(
  scenario: OperationsScenario,
  executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number },
  implementationVersion: string,
): OperationsController {
  const ns = simulationNs as unknown as Record<string, unknown>;
  const factory = ns["createOperationsControllerForVersion"];
  if (typeof factory === "function") {
    return (factory as (opts: unknown, v: string) => OperationsController)(
      { scenario, executionConfig },
      implementationVersion,
    );
  }
  const current = currentImplementationVersion();
  if (implementationVersion !== current) {
    throw new Error(
      `Unsupported implementation version ${implementationVersion}: recorded inspection needs engine ${implementationVersion}, current engine is ${current}, and no versioned runtime is available yet. Nothing was replayed on the wrong engine.`,
    );
  }
  return createOperationsController({ scenario, executionConfig });
}

export function burstHandlingDurations(): { pickDurationMsPerItem: number; unloadDurationMsPerItem: number } {
  const runconfig = burstRunconfigJson as { executionConfig: unknown };
  return parseOperationsExecutionConfig(runconfig.executionConfig);
}

// Canonical signature of one engine snapshot for UI-vs-headless parity:
// stable field order, engine array order (deterministic), explicit nulls.
// The node twin lives in apps/web/e2e/helpers/ops-signature.mjs and is
// intentionally written independently (oracle, not shared code).
export function buildOpsSnapshotSignature(snap: OperationsSnapshot): string {
  const lines: string[] = [];
  lines.push(`clock=${snap.clockMs}`);
  const c = snap.counts;
  lines.push(`counts=${c.selected},${c.arrived},${c.packed},${c.readyForDispatch},${c.shipped},${c.backlog},${c.stageBacklog}`);
  lines.push(
    `orders=${snap.orders.map((o) => `${o.orderId}:${o.state}:${o.unitId ?? "-"}:${o.packingResourceId ?? "-"}:${o.queueSlotId ?? "-"}`).join(";")}`,
  );
  lines.push(
    `units=${snap.units
      .map(
        (u) =>
          `${u.unitId}:${u.pose.x},${u.pose.z}:${u.transportState}:${u.task.kind}:${u.carried.map((l) => `${l.productId}x${l.quantity}`).join("+") || "-"}:${u.carriedCostUnits}:${u.authorizedRoute ? `${u.authorizedRoute.planVersion}:${u.authorizedRoute.points.map((p) => `${p.x},${p.z}`).join("|")}` : "-"}`,
      )
      .join(";")}`,
  );
  lines.push(
    `packing=${snap.packing
      .map((p) =>
        `${p.resourceId}:${p.approachingJobId ?? "-"}:${p.jobs
          .map((j) => `${j.jobId}:${j.state}:${j.queueSlotId ?? "-"}:${j.positionId ?? "-"}:${j.startTimeMs ?? "-"}:${j.finishTimeMs ?? "-"}:${j.waitMs ?? "-"}`)
          .join(",")}:${p.packedOutput.map((o) => `${o.orderId}x${o.costUnits}`).join("+") || "-"}:${p.outputUsedUnits}`,
      )
      .join(";")}`,
  );
  lines.push(`storage=${snap.inventory.storage.map((s) => `${s.locationId}:${s.productId ?? "-"}:${s.quantity}`).join(";")}`);
  lines.push(`packingStock=${snap.inventory.packing.map((s) => `${s.resourceId}:${s.orderId}:${s.productId}:${s.quantity}`).join(";")}`);
  lines.push(`packed=${snap.inventory.packed.map((s) => `${s.orderId}:${s.productId}:${s.quantity}`).join(";")}`);
  lines.push(
    `reservations=${snap.inventory.reservations.map((r) => `${r.orderId}:${r.lines.map((l) => `${l.productId}:${l.requested}:${l.picked}:${l.sources.map((s) => `${s.locationId}x${s.remaining}`).join("+")}`).join(",")}`).join(";")}`);
  const last = snap.timeline[snap.timeline.length - 1];
  lines.push(`timeline=${snap.timeline.length}:${last ? `${last.seq}:${last.timeMs}:${last.kind}:${last.orderId ?? "-"}:${last.unitId ?? "-"}` : "empty"}`);
  lines.push(`waits=${snap.waits.map((w) => `${w.unitId ?? "-"}:${w.orderId ?? "-"}:${w.reason}:${w.startMs}:${w.endMs ?? "-"}`).join(";")}`);
  lines.push(`checks=${snap.checks.conservation.join(",")}|${snap.checks.capacity.join(",")}|${snap.checks.safety.join(",")}`);
  return lines.join("\n");
}
