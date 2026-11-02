// M2b built-export headless proof: runs the dist bundle against literal
// inventory + resource oracles with zero test-framework dependencies.
// Run after npm run build. Writes the sanitized proof JSON. No rendering,
// network, or model API involved.
import assert from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVENT_PRIORITY,
  createInventoryStore,
  createKernel,
  createServiceStation,
  parseOperationsScenario,
} from "./dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

// Independent micro scenario (synthetic, uncalibrated): 2 products,
// 4 locations, 1 picker + 1 put-away unit, receiving + packing.
const scenario = parseOperationsScenario({
  schemaVersion: "layoutlab.operations/1",
  engineVersion: "layoutlab.operations-engine/1",
  id: "m2b-proof",
  provenance: {
    category: "synthetic",
    description: "M2b proof micro scenario; synthetic, uncalibrated.",
    sourceUrls: [],
    assumptions: ["synthetic micro scenario for the M2b state proof"],
    inventedFields: ["all coordinates, capacities, and schedules"],
  },
  seed: "m2b-proof-001",
  units: { quantityUnit: "item", capacityUnit: "handling-unit" },
  geometry: {
    room: { widthMm: 6000, depthMm: 4000 },
    racks: [
      { id: "R1", positionMm: { x: 1000, z: 1000 }, dimensionsMm: { width: 2000, depth: 1000, height: 2000 } },
    ],
    obstacles: [],
  },
  products: [
    { id: "P-A", label: "Ambient widget", itemDimensionsMm: { width: 100, depth: 100, height: 100 }, handlingClass: "ambient", capacityCostUnits: 1 },
    { id: "P-B", label: "Chilled gadget", itemDimensionsMm: { width: 100, depth: 100, height: 100 }, handlingClass: "chilled", capacityCostUnits: 2 },
  ],
  locations: [
    { id: "L-A1", rackId: "R1", storageAnchorMm: { x: 1000, y: 500, z: 1000 }, approachPointMm: { x: 1000, z: 2200 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "ambient", maxQuantity: 100, restrictions: { eligibleHandlingClasses: ["ambient"] } },
    { id: "L-A2", rackId: "R1", storageAnchorMm: { x: 1500, y: 500, z: 1000 }, approachPointMm: { x: 1500, z: 2200 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "ambient", maxQuantity: 100, restrictions: { eligibleHandlingClasses: ["ambient"] } },
    { id: "L-B1", rackId: "R1", storageAnchorMm: { x: 2000, y: 500, z: 1000 }, approachPointMm: { x: 2000, z: 2200 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "chilled", maxQuantity: 100, restrictions: { eligibleHandlingClasses: ["chilled"], eligibleProductIds: ["P-B"] } },
    { id: "L-B2", rackId: "R1", storageAnchorMm: { x: 2500, y: 500, z: 1000 }, approachPointMm: { x: 2500, z: 2200 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "chilled", maxQuantity: 100, restrictions: { eligibleHandlingClasses: ["chilled"] } },
  ],
  initialStock: [{ locationId: "L-A1", productId: "P-A", quantity: 2 }],
  homeAssignments: [
    { productId: "P-A", locationId: "L-A1" },
    { productId: "P-B", locationId: "L-B1" },
  ],
  mobileUnits: [
    { id: "M-PICK-1", role: "picker", footprintMm: { width: 700, length: 1100, margin: 100 }, speedMmPerSecond: 1000, loadCapacityUnits: 20, eligibleHandlingClasses: ["ambient", "chilled"], parkingSlotMm: { x: 500, z: 500 } },
    { id: "M-PUT-1", role: "putaway", footprintMm: { width: 700, length: 1100, margin: 100 }, speedMmPerSecond: 800, loadCapacityUnits: 30, eligibleHandlingClasses: ["ambient", "chilled"], parkingSlotMm: { x: 900, z: 500 } },
  ],
  resources: [
    { id: "RES-RECV-1", kind: "receiving", servicePositions: [{ id: "S1", x: 5000, z: 500 }], queueSlots: [{ id: "Q1", x: 5000, z: 1200 }], serviceCapacity: 1, inputStagingCapacity: 0, outputStagingCapacity: 10, serviceDurationMs: 1000 },
    { id: "RES-PACK-1", kind: "packing", servicePositions: [{ id: "P1", x: 4000, z: 500 }], queueSlots: [{ id: "PQ1", x: 4000, z: 1200 }], serviceCapacity: 1, inputStagingCapacity: 40, outputStagingCapacity: 0, serviceDurationMs: 1000 },
  ],
  orderSchedule: [{ id: "O-1", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 2 }, { productId: "P-B", quantity: 1 }] }],
  deliverySchedule: [{ id: "D-1", arrivalTimeMs: 0, lines: [{ productId: "P-B", quantity: 1 }] }],
  policies: {
    reservePolicy: "full-order-all-or-none",
    run: { mode: "fixed-window", horizonMs: 3_600_000 },
    eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
  },
});

// --- Oracle 1: whole-order rollback then put-away unblock ---
const store = createInventoryStore(scenario);
assert.deepEqual(store.checkInvariants(), []);
const w1 = store.reserveOrder({ eventId: "p-r1", timeMs: 0, orderId: "O-1" });
assert.equal(w1.status, "waiting");
assert.deepEqual(store.available("P-A"), { stored: 2, reserved: 0, available: 2 });
store.acceptInbound({ eventId: "p-acc", timeMs: 10, deliveryId: "D-1", resourceId: "RES-RECV-1", productId: "P-B", quantity: 1 });
assert.equal(store.reserveOrder({ eventId: "p-r2", timeMs: 20, orderId: "O-1" }).status, "waiting");
assert.deepEqual(store.selectPutAwayLocation("P-B", 1), { status: "selectable", locationId: "L-B1" });
store.collectPutAway({ eventId: "p-col", timeMs: 30, deliveryId: "D-1", resourceId: "RES-RECV-1", unitId: "M-PUT-1", productId: "P-B", quantity: 1 });
store.placePutAway({ eventId: "p-put", timeMs: 40, deliveryId: "D-1", unitId: "M-PUT-1", locationId: "L-B1", productId: "P-B", quantity: 1 });
const r3 = store.reserveOrder({ eventId: "p-r3", timeMs: 50, orderId: "O-1" });
assert.equal(r3.status, "reserved");
assert.deepEqual(store.available("P-A"), { stored: 2, reserved: 2, available: 0 });
assert.deepEqual(store.available("P-B"), { stored: 1, reserved: 1, available: 0 });

// --- Oracle 2: picks, staging, pack, dispatch conserve stock ---
store.pick({ eventId: "p-pick-a", timeMs: 60, orderId: "O-1", unitId: "M-PICK-1", locationId: "L-A1", productId: "P-A", quantity: 2 });
store.pick({ eventId: "p-pick-b", timeMs: 61, orderId: "O-1", unitId: "M-PICK-1", locationId: "L-B1", productId: "P-B", quantity: 1 });
assert.equal(store.packingReadiness("O-1", "RES-PACK-1").ready, false);
store.transferToPacking({ eventId: "p-t-a", timeMs: 70, orderId: "O-1", unitId: "M-PICK-1", resourceId: "RES-PACK-1", productId: "P-A", quantity: 2 });
store.transferToPacking({ eventId: "p-t-b", timeMs: 71, orderId: "O-1", unitId: "M-PICK-1", resourceId: "RES-PACK-1", productId: "P-B", quantity: 1 });
assert.equal(store.packingReadiness("O-1", "RES-PACK-1").ready, true);
store.packOrder({ eventId: "p-pack", timeMs: 80, orderId: "O-1", resourceId: "RES-PACK-1" });
store.dispatchOrder({ eventId: "p-dsp", timeMs: 90, orderId: "O-1" });
assert.deepEqual(store.bucketTotals("P-A"), { receiving: 0, storage: 0, carried: 0, packing: 0, packed: 0, dispatched: 2, externalPending: 0 });
assert.deepEqual(store.bucketTotals("P-B"), { receiving: 0, storage: 0, carried: 0, packing: 0, packed: 0, dispatched: 1, externalPending: 0 });
assert.deepEqual(store.checkInvariants(), []);

// --- Oracle 3: two-job kernel timings, unblocked ---
function runStation(blockOutput) {
  const station = createServiceStation(scenario.resources[1]);
  const kernel = createKernel({
    maxProcessedEvents: 100,
    maxEventsPerTimestamp: 100,
    onEvent: (event, api) => {
      if (event.kind === "arrival") {
        const { jobId } = event.data;
        station.enqueue({ jobId, enqueueTimeMs: event.timeMs });
        const s = station.tryStart({ jobId, timeMs: event.timeMs, inputReady: true });
        if (s.status === "started") {
          api.schedule({ id: `done-${jobId}`, timeMs: s.startTimeMs + 1000, priority: EVENT_PRIORITY.COMPLETION, kind: "completion", data: { jobId } });
        }
      } else if (event.kind === "completion") {
        const { jobId } = event.data;
        if (blockOutput && jobId === "A") {
          station.completeService({ jobId, timeMs: event.timeMs, outputBlocked: true });
          api.schedule({ id: "open", timeMs: 1500, priority: EVENT_PRIORITY.COMPLETION, kind: "release" });
        } else {
          station.completeService({ jobId, timeMs: event.timeMs, outputBlocked: false });
          for (const job of station.snapshot().jobs) {
            if (job.state !== "queued") continue;
            const s = station.tryStart({ jobId: job.jobId, timeMs: event.timeMs, inputReady: true });
            if (s.status === "started") {
              api.schedule({ id: `done-${job.jobId}`, timeMs: s.startTimeMs + 1000, priority: EVENT_PRIORITY.COMPLETION, kind: "completion", data: { jobId: job.jobId } });
            }
          }
        }
      } else if (event.kind === "release") {
        station.releaseOutput({ jobId: "A", timeMs: event.timeMs });
        const s = station.tryStart({ jobId: "B", timeMs: event.timeMs, inputReady: true });
        if (s.status === "started") {
          api.schedule({ id: "done-B", timeMs: s.startTimeMs + 1000, priority: EVENT_PRIORITY.COMPLETION, kind: "completion", data: { jobId: "B" } });
        }
      }
    },
  });
  kernel.schedule({ id: "arr-A", timeMs: 0, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival", data: { jobId: "A" } });
  kernel.schedule({ id: "arr-B", timeMs: 0, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival", data: { jobId: "B" } });
  kernel.advanceTo(5000);
  return Object.fromEntries(station.snapshot().jobs.map((j) => [j.jobId, j]));
}
const free = runStation(false);
assert.deepEqual(
  [free.A.startTimeMs, free.A.finishTimeMs, free.B.startTimeMs, free.B.finishTimeMs, free.B.waitMs],
  [0, 1000, 1000, 2000, 1000],
);
const held = runStation(true);
assert.deepEqual(
  [held.A.startTimeMs, held.A.finishTimeMs, held.B.startTimeMs, held.B.finishTimeMs, held.B.waitMs],
  [0, 1000, 1500, 2500, 1500],
);

// --- Sanitized proof JSON (synthetic ids and counts only) ---
const proof = {
  provenance: {
    milestone: "v3-M2b",
    scenarioId: "m2b-proof",
    category: "synthetic",
    note: "Micro headless proof from the built @layoutlab/simulation bundle; not the full 6-rack operations scenario.",
    producedBy: "packages/simulation/proof-m2b.mjs",
  },
  inventory: {
    wholeOrderRollback: "O-1 (2A+1B) waited with 0 reserved while B short; receiving did not unblock; put-away to L-B1 unblocked",
    availableAfterReserve: { A: { stored: 2, reserved: 2, available: 0 }, B: { stored: 1, reserved: 1, available: 0 } },
    finalBuckets: {
      A: { dispatched: 2 },
      B: { dispatched: 1 },
    },
    conservation: "initial+accepted == dispatched (2A, 1B); all other buckets 0",
    invariants: [],
  },
  resources: {
    unblocked: { A: { start: 0, finish: 1000 }, B: { start: 1000, finish: 2000, wait: 1000 } },
    outputHeld: { A: { start: 0, finish: 1000 }, releaseAt: 1500, B: { start: 1500, finish: 2500, wait: 1500 } },
  },
};
const outDir = join(repoRoot, "fixtures", "operations", "oracles", "m2b");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "state-proof.json");
writeFileSync(outPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(`m2b proof ok: 2A+1B conserved to dispatched; timings 0/1000/1000/2000 and held 1500/2500; wrote ${outPath}`);
