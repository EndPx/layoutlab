// Tiny explicit synthetic fixture for M2a contract tests. Deliberately
// minimal (1 rack, 2 locations, 2 products, 2 agents, 1 resource, 2
// orders, 1 delivery): it exercises the contract surface and is NOT the
// 6-rack/24-slot/12-product/40-order full synthetic target, nor any
// calibrated-warehouse claim. Returns raw JSON so tests can clone,
// mutate, and assert parse rejection. Quantities and maxQuantity here are
// structural capacity assumptions only: the M2a contract validates
// single-item fixed-orientation fit, not volumetric packing, so no
// geometric capacity claim follows from these numbers.
export function tinyOperationsScenario(): unknown {
  return {
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: "m2a-tiny",
    provenance: {
      category: "synthetic",
      description: "M2a unit-test micro scenario; synthetic, uncalibrated.",
      sourceUrls: [],
      assumptions: ["synthetic micro scenario for contract tests only"],
      inventedFields: ["all coordinates, capacities, and schedules"],
    },
    seed: "m2a-tiny-001",
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
      obstacles: [
        { id: "O-WALL", minXMm: 0, minZMm: 0, maxXMm: 6000, maxZMm: 100 },
      ],
    },
    products: [
      {
        id: "P-A",
        label: "Ambient widget",
        itemDimensionsMm: { width: 200, depth: 200, height: 200 },
        handlingClass: "ambient",
        capacityCostUnits: 1,
      },
      {
        id: "P-B",
        label: "Chilled gadget",
        itemDimensionsMm: { width: 300, depth: 200, height: 200 },
        handlingClass: "chilled",
        capacityCostUnits: 2,
        visualAssetRef: "simready/container-a",
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
      {
        id: "L-B1",
        rackId: "R1",
        storageAnchorMm: { x: 2000, y: 500, z: 1000 },
        approachPointMm: { x: 2000, z: 2200 },
        usableDimensionsMm: { width: 500, depth: 400, height: 400 },
        storageClass: "chilled",
        maxQuantity: 50,
        restrictions: {
          eligibleHandlingClasses: ["chilled"],
          eligibleProductIds: ["P-B"],
        },
      },
    ],
    initialStock: [
      { locationId: "L-A1", productId: "P-A", quantity: 40 },
      { locationId: "L-B1", productId: "P-B", quantity: 10 },
    ],
    homeAssignments: [
      { productId: "P-A", locationId: "L-A1" },
      { productId: "P-B", locationId: "L-B1" },
    ],
    mobileUnits: [
      {
        id: "M-PICK-1",
        role: "picker",
        footprintMm: { width: 700, length: 1100, margin: 100 },
        speedMmPerSecond: 1000,
        loadCapacityUnits: 20,
        eligibleHandlingClasses: ["ambient", "chilled"],
        parkingSlotMm: { x: 500, z: 500 },
      },
      {
        id: "M-PUT-1",
        role: "putaway",
        footprintMm: { width: 700, length: 1100, margin: 100 },
        speedMmPerSecond: 800,
        loadCapacityUnits: 30,
        eligibleHandlingClasses: ["ambient"],
        parkingSlotMm: { x: 900, z: 500 },
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
      {
        id: "O-2",
        arrivalTimeMs: 60000,
        lines: [
          { productId: "P-A", quantity: 1 },
          { productId: "P-B", quantity: 3 },
        ],
      },
    ],
    deliverySchedule: [
      {
        id: "D-1",
        arrivalTimeMs: 30000,
        lines: [{ productId: "P-B", quantity: 5 }],
      },
    ],
    policies: {
      reservePolicy: "full-order-all-or-none",
      run: { mode: "fixed-window", horizonMs: 3_600_000 },
      eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
    },
  };
}

export function cloneRaw(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
