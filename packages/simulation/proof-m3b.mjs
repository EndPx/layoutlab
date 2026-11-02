// M3b built-export headless proof: runs the dist bundle against the
// connected picking/packing slice with zero test-framework dependencies. Run
// after npm run build. Writes the sanitized proof JSON. No rendering,
// network, model API, or browser involved.
import assert from "node:assert";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  SIMULATION_VERSION,
  createOperationsController,
  parseOperationsScenario,
} from "./dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// --- Burst slice on main-warehouse geometry (gate 1) ---
const burstPath = join(repoRoot, "fixtures", "operations", "picking-packing-burst.json");
const burstBytes = readFileSync(burstPath, "utf8");
const burstSha = sha256(burstBytes);
const burstScenario = parseOperationsScenario(JSON.parse(burstBytes));
const runconfigPath = join(
  repoRoot, "fixtures", "operations", "picking-packing-burst.runconfig.json",
);
const runconfig = JSON.parse(readFileSync(runconfigPath, "utf8"));
const mainBytes = readFileSync(
  join(repoRoot, "fixtures", "operations", "main-warehouse.json"), "utf8",
);
const mainSha = sha256(mainBytes);
assert.equal(burstScenario.deliverySchedule.length, 0);
assert.equal(burstScenario.orderSchedule.length, 6);

const burst = createOperationsController({
  scenario: burstScenario,
  executionConfig: runconfig.executionConfig,
});
const CAP = 3_600_000;
let status = burst.getCompletionStatus();
let guard = 0;
while (status.stage === "IN_PROGRESS" && guard < 120) {
  burst.advanceTo(Math.min(burst.getClockMs() + 60_000, CAP));
  status = burst.getCompletionStatus();
  guard += 1;
}
assert.equal(status.stage, "SUPPORTED_STAGE_COMPLETE");
assert.deepEqual(
  [status.ready, status.selected, status.shipped],
  [6, 6, 0],
);
const bs = burst.snapshot();
assert.deepEqual(
  bs.orders.map((o) => o.state),
  Array(6).fill("READY_FOR_DISPATCH"),
);
assert.deepEqual(bs.counts, {
  selected: 6, excluded: 0, arrived: 6, packed: 6,
  readyForDispatch: 6, shipped: 0, backlog: 6, stageBacklog: 0,
});
assert.deepEqual(bs.checks, { conservation: [], capacity: [], safety: [] });
assert.ok(bs.maxConcurrentMoving.count >= 2);
assert.deepEqual(
  new Set(bs.orders.map((o) => o.packingResourceId)),
  new Set(["PACK-1", "PACK-2"]),
);
const operators = new Set(
  bs.timeline.filter((t) => t.unitId?.startsWith("PK-")).map((t) => t.unitId),
);
assert.ok(operators.size >= 2);
for (const id of ["PA-1", "PA-2"]) {
  const u = bs.units.find((x) => x.unitId === id);
  assert.deepEqual(u.task, { kind: "idle" });
  assert.deepEqual(u.carried, []);
}
const queueWaits = bs.waits.filter((w) =>
  ["BUSY_STATION", "QUEUE_FULL", "QUEUED_BEHIND_HEAD"].includes(w.reason),
);
assert.ok(queueWaits.length >= 1);
assert.ok(queueWaits.some((w) => w.endMs !== null && w.endMs > w.startMs));
// Motion audit: every grant retained once with its actual authorized
// envelope; no TRAFFIC wait overlaps admitted motion.
const motionKeys = bs.motionHistory.map((m) => `${m.unitId}:v${m.planVersion}`);
assert.ok(motionKeys.length > 0);
assert.equal(new Set(motionKeys).size, motionKeys.length);
assert.equal(
  bs.timeline.filter((t) => t.kind === "MOTION_GRANTED").length,
  motionKeys.length,
);
for (const m of bs.motionHistory) {
  for (const w of bs.waits) {
    if (w.unitId !== m.unitId || w.reason !== "TRAFFIC") continue;
    assert.equal(w.startMs < m.endMs && (w.endMs === null || w.endMs > m.startMs), false);
  }
}
assert.deepEqual(bs.inventory.dispatched, []);
assert.equal(bs.timeline.some((t) => t.kind === "SHIPPED"), false);
assert.equal(burst.getDiagnostic(), null);

// --- Hand-derived micro oracle (gate 2): literals from the hand derivation
// in test/m3b-operations.test.ts, re-asserted here on the built bundle ---
function microRaw() {
  return {
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: "m3b-proof-oracle",
    provenance: {
      category: "synthetic",
      description: "M3b proof micro scenario; synthetic, uncalibrated.",
      sourceUrls: [],
      assumptions: ["synthetic micro geometry for the M3b proof oracle"],
      inventedFields: ["all coordinates"],
    },
    seed: "m3b-proof-001",
    units: { quantityUnit: "item", capacityUnit: "handling-unit" },
    geometry: {
      room: { widthMm: 6000, depthMm: 4000 },
      racks: [{ id: "R-FAR", positionMm: { x: 5500, z: 500 }, dimensionsMm: { width: 200, depth: 200, height: 1000 } }],
      obstacles: [],
    },
    products: [
      { id: "P-A", label: "Micro widget", itemDimensionsMm: { width: 100, depth: 100, height: 100 }, handlingClass: "ambient", capacityCostUnits: 1 },
    ],
    locations: [
      { id: "L-A1", rackId: "R-FAR", storageAnchorMm: { x: 1000, y: 500, z: 1000 }, approachPointMm: { x: 3000, z: 2000 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "ambient", maxQuantity: 10, restrictions: { eligibleHandlingClasses: ["ambient"] } },
    ],
    initialStock: [{ locationId: "L-A1", productId: "P-A", quantity: 2 }],
    homeAssignments: [{ productId: "P-A", locationId: "L-A1" }],
    mobileUnits: [
      { id: "U1", role: "picker", footprintMm: { width: 600, length: 800, margin: 100 }, speedMmPerSecond: 1000, loadCapacityUnits: 20, eligibleHandlingClasses: ["ambient"], parkingSlotMm: { x: 1000, z: 2000 } },
    ],
    resources: [
      { id: "PACK-1", kind: "packing", servicePositions: [{ id: "S1", x: 5200, z: 2000 }], queueSlots: [{ id: "Q1", x: 4200, z: 2000 }], serviceCapacity: 1, inputStagingCapacity: 10, outputStagingCapacity: 10, serviceDurationMs: 1000 },
    ],
    orderSchedule: [
      { id: "O1", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 1 }] },
      { id: "O2", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 1 }] },
    ],
    deliverySchedule: [],
    policies: {
      reservePolicy: "full-order-all-or-none",
      run: { mode: "finite-cohort", arrivalCutoffMs: 0 },
      eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
    },
  };
}
const EXEC = { pickDurationMsPerItem: 500, unloadDurationMsPerItem: 400 };
const oracle = createOperationsController({
  scenario: parseOperationsScenario(microRaw()),
  executionConfig: EXEC,
});
oracle.advanceTo(2000);
let os = oracle.snapshot();
assert.equal(os.inventory.storage.find((r) => r.locationId === "L-A1").quantity, 2);
assert.deepEqual(os.units.find((u) => u.unitId === "U1").carried, []);
oracle.advanceTo(4700);
os = oracle.snapshot();
assert.deepEqual(os.units.find((u) => u.unitId === "U1").carried, [
  { productId: "P-A", quantity: 1 },
]);
assert.deepEqual(os.inventory.packing, []);
oracle.advanceTo(6000);
os = oracle.snapshot();
assert.deepEqual(os.inventory.packing, [
  { resourceId: "PACK-1", orderId: "O1", productId: "P-A", quantity: 1 },
]);
assert.deepEqual(os.inventory.packed, []);
oracle.advanceTo(20000);
os = oracle.snapshot();
assert.deepEqual(
  os.orders.find((o) => o.orderId === "O1").timestamps,
  { CREATED: 0, READY_FOR_PICKING: 0, PICKING: 0, WAITING_FOR_PACKING: 2500, PACKING: 5100, READY_FOR_DISPATCH: 6100 },
);
assert.deepEqual(
  os.orders.find((o) => o.orderId === "O2").timestamps,
  { CREATED: 0, READY_FOR_PICKING: 0, PICKING: 5100, WAITING_FOR_PACKING: 7800, PACKING: 10400, READY_FOR_DISPATCH: 11400 },
);
assert.deepEqual(
  os.packing.find((p) => p.resourceId === "PACK-1").jobs.map((j) => [j.jobId, j.startTimeMs, j.finishTimeMs, j.waitMs]),
  [["pack-0", 5100, 6100, 2600], ["pack-1", 10400, 11400, 2600]],
);
assert.equal(os.inventory.transfers.length, 6);
assert.deepEqual(os.checks, { conservation: [], capacity: [], safety: [] });
assert.equal(oracle.getCompletionStatus().stage, "SUPPORTED_STAGE_COMPLETE");

// --- Determinism: one-shot vs chunked vs headless speeds (gate 4) ---
const oneShot = JSON.stringify(os);
for (const chunk of [500, 4000, 1000, 250]) {
  const c = createOperationsController({
    scenario: parseOperationsScenario(microRaw()),
    executionConfig: EXEC,
  });
  for (let t = chunk; t <= 20000; t += chunk) c.advanceTo(t);
  assert.equal(JSON.stringify(c.snapshot()), oneShot);
}
const resettable = createOperationsController({
  scenario: parseOperationsScenario(microRaw()),
  executionConfig: EXEC,
});
resettable.advanceTo(20000);
resettable.reset();
resettable.advanceTo(20000);
assert.equal(JSON.stringify(resettable.snapshot()), oneShot);

// --- Negative spot checks on the built bundle (gate 3 samples) ---
const mainScenario = parseOperationsScenario(JSON.parse(mainBytes));
assert.throws(
  () => createOperationsController({ scenario: mainScenario, executionConfig: EXEC }),
  /UNSUPPORTED_DELIVERIES/,
);
const shortRaw = microRaw();
shortRaw.orderSchedule = [
  { id: "O1", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 5 }] },
];
const shortRun = createOperationsController({
  scenario: parseOperationsScenario(shortRaw),
  executionConfig: EXEC,
});
shortRun.advanceTo(60000);
assert.equal(
  shortRun.snapshot().orders.find((o) => o.orderId === "O1").state,
  "WAITING_FOR_STOCK",
);
assert.deepEqual(shortRun.snapshot().inventory.reservations, []);

// --- Sanitized proof JSON (exact inputs + config + versions + outputs) ---
const proof = {
  provenance: {
    milestone: "v3-M3b",
    category: "synthetic",
    note: "First connected picking/packing slice (headless) from the built @layoutlab/simulation bundle: scheduled orders -> reservations -> concurrent picks -> packing queues -> READY_FOR_DISPATCH. No SHIPPED stage; no dispatch/inbound/putaway completion claimed.",
    producedBy: "packages/simulation/proof-m3b.mjs",
    seed: burstScenario.seed,
    versions: {
      simulation: SIMULATION_VERSION,
      operationsSchema: OPERATIONS_SCHEMA_VERSION,
      operationsEngine: OPERATIONS_ENGINE_VERSION,
    },
    inputs: {
      burstFixture: { bytes: burstBytes.length, sha256: burstSha },
      parentMainFixture: { bytes: mainBytes.length, sha256: mainSha },
      runconfig: runconfig.executionConfig,
    },
  },
  burst: {
    completion: status,
    clockMs: bs.clockMs,
    counts: bs.counts,
    checks: bs.checks,
    maxConcurrentMoving: bs.maxConcurrentMoving,
    orders: bs.orders.map((o) => ({
      orderId: o.orderId, state: o.state, timestamps: o.timestamps,
      unitId: o.unitId, packingResourceId: o.packingResourceId,
    })),
    queueWaits: queueWaits.map((w) => ({
      orderId: w.orderId, unitId: w.unitId, reason: w.reason,
      startMs: w.startMs, endMs: w.endMs,
    })),
    operatingPickers: [...operators].sort(),
    timelineEvents: bs.timeline.length,
    motionGrants: bs.motionHistory.length,
    motionHistoryUnique: true,
    trafficWaitsOverlapMotion: false,
  },
  oracle: {
    note: "Hand-derived literals: 2000mm@1000mm/s=2000ms legs; pick 500ms/item; unload 400ms/item; single 1000ms packing lane.",
    o1: os.orders.find((o) => o.orderId === "O1").timestamps,
    o2: os.orders.find((o) => o.orderId === "O2").timestamps,
    packJobs: os.packing.find((p) => p.resourceId === "PACK-1").jobs.map((j) => ({
      jobId: j.jobId, startTimeMs: j.startTimeMs,
      finishTimeMs: j.finishTimeMs, waitMs: j.waitMs,
    })),
    transfers: os.inventory.transfers.length,
    intermediate: {
      at2000Stored: 2,
      at4700Carried: 1,
      at4700Staged: 0,
      at6000Staged: 1,
      at6000Packed: 0,
    },
  },
  determinism: {
    oneShotEqualsChunked500: true,
    oneShotEqualsChunked4000: true,
    oneShotEqualsChunked1000: true,
    oneShotEqualsChunked250: true,
    resetEqualsFresh: true,
  },
  negatives: {
    mainFixtureDeliveriesRejected: "UNSUPPORTED_DELIVERIES",
    stockShortWaitsWithZeroReservation: true,
  },
};
const outDir = join(repoRoot, "fixtures", "operations", "oracles", "m3b");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "connected-slice-proof.json");
writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(
  `m3b proof ok: burst 6/6 READY_FOR_DISPATCH maxConcurrent=${bs.maxConcurrentMoving.count} queueWaits=${queueWaits.length} checks clean; ` +
  `oracle O1 READY@6100 O2 READY@11400 waits 2600/2600; chunked+reset identical; wrote ${outPath}`,
);
