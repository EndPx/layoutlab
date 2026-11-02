// M3a built-export headless proof: runs the dist bundle against literal
// canonical-navigation + traffic-admitted transport oracles with zero
// test-framework dependencies. Run after npm run build. Writes the sanitized
// proof JSON. No rendering, network, model API, or browser involved.
import assert from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  SIMULATION_VERSION,
  createInventoryStore,
  createServiceStation,
  createTransportController,
  parseOperationsScenario,
  stationaryVsStationaryConflict,
} from "./dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

function microRaw({ id, room, racks, obstacles, zones, units }) {
  return {
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id,
    provenance: {
      category: "synthetic",
      description: "M3a proof micro scenario; synthetic, uncalibrated.",
      sourceUrls: [],
      assumptions: ["synthetic micro geometry for the M3a transport proof"],
      inventedFields: ["all coordinates"],
    },
    seed: "m3a-proof-001",
    units: { quantityUnit: "item", capacityUnit: "handling-unit" },
    geometry: {
      room,
      racks: racks.map((r) => ({
        id: r.id,
        positionMm: { x: r.x, z: r.z },
        dimensionsMm: { width: r.width, depth: r.depth, height: r.height },
      })),
      obstacles: obstacles ?? [],
      ...(zones ? { trafficZones: zones } : {}),
    },
    products: [
      { id: "P-A", label: "Micro widget", itemDimensionsMm: { width: 100, depth: 100, height: 100 }, handlingClass: "ambient", capacityCostUnits: 1 },
    ],
    locations: [
      { id: "L-A1", rackId: racks[0].id, storageAnchorMm: { x: racks[0].x, y: 500, z: racks[0].z }, approachPointMm: { x: 1000, z: 1000 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "ambient", maxQuantity: 10, restrictions: { eligibleHandlingClasses: ["ambient"] } },
    ],
    initialStock: [],
    mobileUnits: units.map((u) => ({
      id: u.id,
      role: "picker",
      footprintMm: { width: u.width ?? 600, length: u.length ?? 800, margin: u.margin ?? 100 },
      speedMmPerSecond: u.speed ?? 1000,
      loadCapacityUnits: 20,
      eligibleHandlingClasses: ["ambient"],
      parkingSlotMm: { ...u.park },
    })),
    resources: [
      { id: "RES-1", kind: "receiving", servicePositions: [{ id: "S1", x: room.widthMm - 500, z: room.depthMm - 500 }], queueSlots: [], serviceCapacity: 1, inputStagingCapacity: 0, outputStagingCapacity: 0, serviceDurationMs: 1000 },
    ],
    orderSchedule: [],
    deliverySchedule: [],
    policies: {
      reservePolicy: "full-order-all-or-none",
      run: { mode: "fixed-window", horizonMs: 3_600_000 },
      eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
    },
  };
}

const FAR = (room) => [{ id: "R-FAR", x: room.widthMm - 500, z: 500, width: 200, depth: 200, height: 1000 }];

// --- Oracle A: 2000mm straight at 1000mm/s = 2000ms, midpoint, persists ---
const roomA = { widthMm: 6000, depthMm: 4000 };
const scA = parseOperationsScenario(microRaw({
  id: "m3a-proof-a", room: roomA, racks: FAR(roomA),
  units: [{ id: "U1", park: { x: 1000, z: 2000 } }],
}));
const cA = createTransportController({ scenario: scA });
const rA = cA.requestMove("U1", { x: 3000, z: 2000 });
assert.equal(rA.status, "granted");
assert.deepEqual([rA.plan.startMs, rA.plan.endMs, rA.plan.totalDistanceMm, rA.plan.totalDurationMs], [0, 2000, 2000, 2000]);
assert.deepEqual(rA.plan.points[0], { x: 1000, z: 2000 });
assert.deepEqual(rA.plan.points[rA.plan.points.length - 1], { x: 3000, z: 2000 });
assert.deepEqual(cA.poseAt("U1", 0), { x: 1000, z: 2000 });
assert.deepEqual(cA.poseAt("U1", 1000), { x: 2000, z: 2000 });
assert.deepEqual(cA.poseAt("U1", 2000), { x: 3000, z: 2000 });
cA.advanceTo(2000);
assert.deepEqual(cA.poseAt("U1", 5000), { x: 3000, z: 2000 });
// Chunked vs one-shot identical.
const cA1 = createTransportController({ scenario: scA });
cA1.requestMove("U1", { x: 3000, z: 2000 });
cA1.advanceTo(2000);
const cA2 = createTransportController({ scenario: parseOperationsScenario(microRaw({ id: "m3a-proof-a", room: roomA, racks: FAR(roomA), units: [{ id: "U1", park: { x: 1000, z: 2000 } }] })) });
cA2.requestMove("U1", { x: 3000, z: 2000 });
cA2.advanceTo(500);
cA2.advanceTo(1000);
cA2.advanceTo(1500);
cA2.advanceTo(2000);
assert.equal(JSON.stringify(cA2.snapshot()), JSON.stringify(cA1.snapshot()));

// --- Oracle B: disjoint concurrent 0..2000; crossing waits ---
const roomB = { widthMm: 6000, depthMm: 4000 };
const scB = parseOperationsScenario(microRaw({
  id: "m3a-proof-b", room: roomB, racks: FAR(roomB),
  units: [{ id: "U1", park: { x: 1000, z: 1000 } }, { id: "U2", park: { x: 1000, z: 3000 } }],
}));
const cB = createTransportController({ scenario: scB });
const rB1 = cB.requestMove("U1", { x: 3000, z: 1000 });
const rB2 = cB.requestMove("U2", { x: 3000, z: 3000 });
assert.equal(rB1.status, "granted");
assert.equal(rB2.status, "granted");
assert.deepEqual([rB1.plan.startMs, rB1.plan.endMs], [0, 2000]);
assert.deepEqual([rB2.plan.startMs, rB2.plan.endMs], [0, 2000]);
assert.deepEqual(cB.poseAt("U1", 1000), { x: 2000, z: 1000 });
assert.deepEqual(cB.poseAt("U2", 1000), { x: 2000, z: 3000 });
cB.advanceTo(2000);
// Crossing endpoints-free/mids-collide: long cross, second waits.
const roomX = { widthMm: 6000, depthMm: 6000 };
const scX = parseOperationsScenario(microRaw({
  id: "m3a-proof-x", room: roomX, racks: [{ id: "R-FAR", x: 500, z: 5500, width: 200, depth: 200, height: 1000 }],
  units: [{ id: "U1", park: { x: 1000, z: 2000 } }, { id: "U2", park: { x: 3000, z: 700 } }],
}));
const cX = createTransportController({ scenario: scX });
assert.equal(cX.requestMove("U1", { x: 5000, z: 2000 }).status, "granted");
const rX2 = cX.requestMove("U2", { x: 3000, z: 5000 });
assert.equal(rX2.status, "waiting");
// Occupied goal waits (stopped agent).
const scO = parseOperationsScenario(microRaw({
  id: "m3a-proof-o", room: roomB, racks: FAR(roomB),
  units: [{ id: "U1", park: { x: 3000, z: 2000 } }, { id: "U2", park: { x: 1000, z: 2000 } }],
}));
const cO = createTransportController({ scenario: scO });
assert.equal(cO.requestMove("U2", { x: 3000, z: 2000 }).status, "waiting");

// --- Oracle C: exclusive zone 0..4000 / 4000..8000 ---
const roomC = { widthMm: 6000, depthMm: 4000 };
const scC = parseOperationsScenario(microRaw({
  id: "m3a-proof-c", room: roomC, racks: FAR(roomC),
  zones: [{ id: "Z-AISLE", kind: "narrow-aisle", minXMm: 2000, minZMm: 1500, maxXMm: 4000, maxZMm: 2500 }],
  units: [{ id: "U1", park: { x: 1000, z: 1400 } }, { id: "U2", park: { x: 1000, z: 2700 } }],
}));
const cC = createTransportController({ scenario: scC });
const rC1 = cC.requestMove("U1", { x: 5000, z: 1400 });
assert.equal(rC1.status, "granted");
assert.deepEqual([rC1.plan.startMs, rC1.plan.endMs], [0, 4000]);
assert.deepEqual(rC1.plan.requiredZones, ["Z-AISLE"]);
const rC2 = cC.requestMove("U2", { x: 5000, z: 2700 });
assert.equal(rC2.status, "waiting");
assert.equal(rC2.requestTimeMs, 0);
cC.advanceTo(4000);
const snapC = cC.snapshot().units.find((u) => u.unitId === "U2");
assert.equal(snapC.state, "moving");
assert.deepEqual([snapC.plan.startMs, snapC.plan.endMs], [4000, 8000]);
cC.advanceTo(8000);
assert.deepEqual(cC.poseAt("U1"), { x: 5000, z: 1400 });
assert.deepEqual(cC.poseAt("U2"), { x: 5000, z: 2700 });

// --- Oracle D: main fixture corrected (PACK 1 lane, 1500 min, 228 routes) ---
const mainBytes = readFileSync(join(repoRoot, "fixtures/operations/main-warehouse.json"), "utf8");
const mainSha = createHash("sha256").update(mainBytes).digest("hex");
const mainFx = parseOperationsScenario(JSON.parse(mainBytes));
assert.equal(mainFx.resources.find((r) => r.id === "PACK-1").serviceCapacity, 1);
assert.equal(mainFx.resources.find((r) => r.id === "PACK-2").serviceCapacity, 1);
createServiceStation(mainFx.resources.find((r) => r.id === "PACK-1"));
createServiceStation(mainFx.resources.find((r) => r.id === "PACK-2"));
const sqp = [];
for (const r of mainFx.resources) {
  for (const s of r.servicePositions) sqp.push(s);
  for (const q of r.queueSlots) sqp.push(q);
}
for (const u of mainFx.mobileUnits) sqp.push(u.parkingSlotMm);
let minD = Infinity;
for (let i = 0; i < sqp.length; i += 1) {
  for (let j = i + 1; j < sqp.length; j += 1) {
    const d = Math.hypot(sqp[i].x - sqp[j].x, sqp[i].z - sqp[j].z);
    if (d < minD) minD = d;
    assert.equal(stationaryVsStationaryConflict(sqp[i], 600, sqp[j], 600), false);
  }
}
assert.equal(minD, 1500);
// Old 600mm pitch overlaps (durable negative, literals only).
assert.equal(stationaryVsStationaryConflict({ x: 20500, z: 6900 }, 600, { x: 20500, z: 7500 }, 600), true);
assert.equal(stationaryVsStationaryConflict({ x: 20500, z: 14700 }, 600, { x: 20000, z: 14400 }, 600), true);

// --- Oracle E: unsafe cancel rejected; deadlock stuck; no inventory change ---
const scE = parseOperationsScenario(microRaw({
  id: "m3a-proof-e", room: roomA, racks: FAR(roomA),
  units: [{ id: "U1", park: { x: 1000, z: 2000 } }],
}));
const cE = createTransportController({ scenario: scE });
cE.requestMove("U1", { x: 3000, z: 2000 });
cE.advanceTo(1000);
const cancelE = cE.cancelPlan("U1");
assert.equal(cancelE.status, "rejected");
cE.advanceTo(2000);
assert.deepEqual(cE.poseAt("U1"), { x: 3000, z: 2000 });
const scH = parseOperationsScenario(microRaw({
  id: "m3a-proof-h", room: roomA, racks: FAR(roomA),
  units: [{ id: "U1", park: { x: 1000, z: 2000 } }, { id: "U2", park: { x: 3000, z: 2000 } }],
}));
const cH = createTransportController({ scenario: scH });
cH.requestMove("U1", { x: 3000, z: 2000 });
cH.requestMove("U2", { x: 1000, z: 2000 });
assert.equal(cH.getDiagnostic().status, "stuck");
const tinyFx = parseOperationsScenario({
  schemaVersion: "layoutlab.operations/1",
  engineVersion: "layoutlab.operations-engine/1",
  id: "m3a-proof-inv",
  provenance: { category: "synthetic", description: "proof", sourceUrls: [], assumptions: ["proof"], inventedFields: ["all"] },
  seed: "m3a-proof-inv",
  units: { quantityUnit: "item", capacityUnit: "handling-unit" },
  geometry: { room: { widthMm: 6000, depthMm: 4000 }, racks: [{ id: "R1", positionMm: { x: 1000, z: 1000 }, dimensionsMm: { width: 2000, depth: 1000, height: 2000 } }], obstacles: [] },
  products: [{ id: "P-A", label: "w", itemDimensionsMm: { width: 100, depth: 100, height: 100 }, handlingClass: "ambient", capacityCostUnits: 1 }],
  locations: [{ id: "L-A1", rackId: "R1", storageAnchorMm: { x: 1000, y: 500, z: 1000 }, approachPointMm: { x: 1000, z: 2200 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "ambient", maxQuantity: 10, restrictions: { eligibleHandlingClasses: ["ambient"] } }],
  initialStock: [{ locationId: "L-A1", productId: "P-A", quantity: 2 }],
  homeAssignments: [{ productId: "P-A", locationId: "L-A1" }],
  mobileUnits: [{ id: "M1", role: "picker", footprintMm: { width: 600, length: 800, margin: 100 }, speedMmPerSecond: 1000, loadCapacityUnits: 20, eligibleHandlingClasses: ["ambient"], parkingSlotMm: { x: 500, z: 500 } }],
  resources: [{ id: "R1", kind: "receiving", servicePositions: [{ id: "S1", x: 5000, z: 500 }], queueSlots: [], serviceCapacity: 1, inputStagingCapacity: 0, outputStagingCapacity: 0, serviceDurationMs: 1000 }],
  orderSchedule: [],
  deliverySchedule: [],
  policies: { reservePolicy: "full-order-all-or-none", run: { mode: "fixed-window", horizonMs: 3600000 }, eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 } },
});
const store = createInventoryStore(tinyFx);
const invBefore = JSON.stringify(store.snapshot());
const cI = createTransportController({ scenario: scE });
cI.requestMove("U1", { x: 3000, z: 2000 });
cI.advanceTo(2000);
assert.equal(JSON.stringify(store.snapshot()), invBefore);

// --- Sanitized proof JSON ---
const proof = {
  provenance: {
    milestone: "v3-M3a",
    category: "synthetic",
    note: "Micro headless proof from the built @layoutlab/simulation bundle; canonical-navigation + traffic-admitted transport substrate only, not connected operations.",
    producedBy: "packages/simulation/proof-m3a.mjs",
    seed: "m3a-proof-001",
    versions: {
      simulation: SIMULATION_VERSION,
      operationsSchema: OPERATIONS_SCHEMA_VERSION,
      operationsEngine: OPERATIONS_ENGINE_VERSION,
    },
  },
  oracleA: {
    route: { from: { x: 1000, z: 2000 }, to: { x: 3000, z: 2000 }, distanceMm: 2000, speedMmPerSecond: 1000 },
    interval: { startMs: 0, endMs: 2000 },
    poses: { at0: { x: 1000, z: 2000 }, at1000: { x: 2000, z: 2000 }, at2000: { x: 3000, z: 2000 }, at5000: { x: 3000, z: 2000 } },
    chunkedEqualsOneShot: true,
  },
  oracleB: {
    disjoint: {
      u1: { from: { x: 1000, z: 1000 }, to: { x: 3000, z: 1000 }, interval: [0, 2000] },
      u2: { from: { x: 1000, z: 3000 }, to: { x: 3000, z: 3000 }, interval: [0, 2000] },
      concurrent: true,
    },
    crossingEndpointsFreeMidsCollide: "U1 (1000,2000)->(5000,2000) granted; U2 (3000,700)->(3000,5000) waits (TRAJECTORY_CONFLICT)",
    occupiedGoalWaits: "U2 (1000,2000)->(3000,2000) waits while U1 sits at (3000,2000)",
  },
  oracleC: {
    zone: { id: "Z-AISLE", kind: "narrow-aisle", rectMm: { minX: 2000, minZ: 1500, maxX: 4000, maxZ: 2500 } },
    first: { unit: "U1", from: { x: 1000, z: 1400 }, to: { x: 5000, z: 1400 }, interval: [0, 4000] },
    second: { unit: "U2", from: { x: 1000, z: 2700 }, to: { x: 5000, z: 2700 }, wait: { requestTimeMs: 0, blockerZone: "Z-AISLE", holder: "U1" }, interval: [4000, 8000] },
    terminalPersists: { U1: { x: 5000, z: 1400 }, U2: { x: 5000, z: 2700 } },
  },
  oracleD: {
    mainFixture: { sha256: mainSha, bytes: mainBytes.length, historicalSha256: "31e8b3429183abf8636b47c5b00f2c0b81dd0d8a4e0fac42c3faf9e303320b4e" },
    packingLanes: { "PACK-1": 1, "PACK-2": 1 },
    queueClearance: { positions: 20, minPairwiseMm: 1500, radiusMm: 600 },
    old600mmPitchOverlaps: true,
  },
  oracleE: {
    unsafeMidrouteCancel: "rejected UNSAFE_MIDROUTE, motion continues to (3000,2000)",
    headOnDeadlock: "stuck DEADLOCK_CYCLE, poses retained, 2 pending",
    inventoryUnchanged: true,
  },
};
const outDir = join(repoRoot, "fixtures", "operations", "oracles", "m3a");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "transport-proof.json");
writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(`m3a proof ok: A 2000/2000 midpoint (2000,2000); B concurrent 0..2000 + crossing/occupied waits; C 0..4000/4000..8000; D ${mainSha.slice(0, 12)} min1500; E unsafe-rejected/stuck/inventory-clean; wrote ${outPath}`);
