// Consumer import smoke: runs the built dist bundle against the literal
// M2a oracles with zero test-framework dependencies. Run after npm run
// build. No rendering or model API involved.
import assert from "node:assert";
import {
  EVENT_PRIORITY,
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  createKernel,
  parseOperationsScenario,
  travelTimeMs,
} from "./dist/index.js";

assert.equal(OPERATIONS_SCHEMA_VERSION, "layoutlab.operations/1");
assert.equal(OPERATIONS_ENGINE_VERSION, "layoutlab.operations-engine/1");

// Travel-time literals, computed independently of the test suite.
assert.equal(travelTimeMs(1000, 3000), 334);
assert.equal(travelTimeMs(1501, 1000), 1501);
assert.equal(travelTimeMs(1, 3000), 1);
assert.equal(travelTimeMs(0, 3000), 0);

// Minimal contract parse: one rack, one location, one product, one agent,
// one resource, one order. Not a calibrated warehouse. Quantities and
// maxQuantity are structural capacity assumptions only (single-item
// fixed-orientation fit, not volumetric packing).
const scenario = parseOperationsScenario({
  schemaVersion: "layoutlab.operations/1",
  engineVersion: "layoutlab.operations-engine/1",
  id: "smoke-tiny",
  provenance: {
    category: "synthetic",
    description: "Built-bundle smoke fixture; synthetic micro scenario.",
    sourceUrls: [],
    assumptions: ["synthetic micro scenario for the built-bundle smoke probe"],
    inventedFields: ["all coordinates and capacities"],
  },
  seed: "smoke-001",
  units: { quantityUnit: "item", capacityUnit: "handling-unit" },
  geometry: {
    room: { widthMm: 6000, depthMm: 4000 },
    racks: [
      {
        id: "R1",
        positionMm: { x: 1000, z: 1000 },
        dimensionsMm: { width: 2000, depth: 1000, height: 2000 },
      },
    ],
    obstacles: [],
  },
  products: [
    {
      id: "P-A",
      label: "Smoke widget",
      itemDimensionsMm: { width: 200, depth: 200, height: 200 },
      handlingClass: "ambient",
      capacityCostUnits: 1,
    },
  ],
  locations: [
    {
      id: "L-A1",
      rackId: "R1",
      storageAnchorMm: { x: 1000, y: 500, z: 1000 },
      approachPointMm: { x: 1000, z: 2200 },
      usableDimensionsMm: { width: 500, depth: 400, height: 400 },
      storageClass: "ambient",
      maxQuantity: 100,
      restrictions: { eligibleHandlingClasses: ["ambient"] },
    },
  ],
  initialStock: [{ locationId: "L-A1", productId: "P-A", quantity: 40 }],
  homeAssignments: [{ productId: "P-A", locationId: "L-A1" }],
  mobileUnits: [
    {
      id: "M-1",
      role: "picker",
      footprintMm: { width: 700, length: 1100, margin: 100 },
      speedMmPerSecond: 1000,
      loadCapacityUnits: 20,
      eligibleHandlingClasses: ["ambient"],
      parkingSlotMm: { x: 500, z: 500 },
    },
  ],
  resources: [
    {
      id: "RES-RECV-1",
      kind: "receiving",
      servicePositions: [{ id: "S1", x: 5000, z: 500 }],
      queueSlots: [{ id: "Q1", x: 5000, z: 1200 }],
      serviceCapacity: 1,
      inputStagingCapacity: 10,
      outputStagingCapacity: 10,
      serviceDurationMs: 5000,
    },
  ],
  orderSchedule: [
    {
      id: "O-1",
      arrivalTimeMs: 0,
      lines: [{ productId: "P-A", quantity: 2 }],
    },
  ],
  deliverySchedule: [],
  policies: {
    reservePolicy: "full-order-all-or-none",
    run: { mode: "fixed-window", horizonMs: 3_600_000 },
    eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
  },
});
assert.equal(scenario.products[0].capacityCostUnits, 1);

// Ordering literal: at t=10, completion(0) before arrival(10) before
// FIFO ties; causal same-time insertion runs next among pending.
const seen = [];
const kernel = createKernel({
  maxProcessedEvents: 100,
  maxEventsPerTimestamp: 100,
  onEvent: (event, api) => {
    seen.push(event.id);
    if (event.id === "arr") {
      api.schedule({
        id: "causal",
        timeMs: 10,
        priority: EVENT_PRIORITY.DISPATCH,
        kind: "causal",
      });
    }
  },
});
kernel.schedule({
  id: "tie-b",
  timeMs: 10,
  priority: EVENT_PRIORITY.START,
  kind: "probe",
});
kernel.schedule({
  id: "comp",
  timeMs: 10,
  priority: EVENT_PRIORITY.COMPLETION,
  kind: "probe",
});
kernel.schedule({
  id: "arr",
  timeMs: 10,
  priority: EVENT_PRIORITY.ARRIVAL,
  kind: "probe",
});
kernel.schedule({
  id: "tie-a",
  timeMs: 10,
  priority: EVENT_PRIORITY.START,
  kind: "probe",
});
const end = kernel.advanceTo(10);
assert.equal(end.status, "queue-empty");
assert.deepEqual(seen, ["comp", "arr", "causal", "tie-b", "tie-a"]);
assert.equal(kernel.getClockMs(), 10);
console.log("smoke ok: dist bundle parses contracts, 334/1501/1/0, order comp/arr/causal/tie-b/tie-a");
