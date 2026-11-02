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
  deckIndexForAnchorY,
  parseOperationsScenario,
  rackAxisScale,
  type OperationsScenario,
} from "@layoutlab/simulation";
import bindingsJson from "../../../../fixtures/operations/main-warehouse.bindings.json";
import fixtureJson from "../../../../fixtures/operations/main-warehouse.json";

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
  cartGlbUrl: string;
  rackGlbUrl: string;
  floorGlbUrl: string;
  containerGlbs: { asset: string; glbUrl: string; count: number }[];
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
  | null;

type Bindings = {
  bindingsVersion: string;
  fixtureId: string;
  containers: Record<string, { glb: string; unitDimsMm: { width: number; depth: number; height: number } }>;
  products: Record<string, { containerAsset: string; unitsPerVisual: number }>;
  racks: { glb: string; sourceSizeM: { x: number; y: number; z: number }; deckTopsMm: number[] };
  mobileUnits: { glb: string; yawDeg: number };
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
  }));

  const containers = locations.reduce((n, l) => n + l.containers.length, 0);
  return {
    scenario,
    roomMm: { width: scenario.geometry.room.widthMm, depth: scenario.geometry.room.depthMm },
    racks,
    locations,
    units: scenario.mobileUnits.map((u) => ({ id: u.id, role: u.role, parkingMm: { ...u.parkingSlotMm } })),
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
