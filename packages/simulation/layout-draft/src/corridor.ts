import type { StationAttachment } from "./attachments.js";

// Minimal one-order corridor for the hand-derived timing oracle. Straight
// lane z=3000: parking (1000,3000) -> approach (3000,3000) -> queue
// (centre-2000,3000) -> service (centre,3000). Packing obstacle is centred
// at (centre,1100) with the main-fixture table size 1868x1220, so the lane
// clears it by 1290mm from its south edge. One picker, qty 2, one order.
export const CORRIDOR_EXECUTION_CONFIG = {
  pickDurationMsPerItem: 2000,
  unloadDurationMsPerItem: 1000,
} as const;
export const CORRIDOR_BASE_CENTRE_X = 8000;

export function buildCorridorScenario(packCentreX: number = CORRIDOR_BASE_CENTRE_X): unknown {
  return {
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: "l0-corridor-1",
    provenance: {
      category: "synthetic",
      description: "L0 one-order corridor oracle; synthetic, uncalibrated.",
      sourceUrls: [],
      assumptions: ["synthetic corridor for hand-derived timing only"],
      inventedFields: ["all coordinates, capacities, and schedules"],
    },
    seed: "l0-corridor-001",
    units: { quantityUnit: "item", capacityUnit: "handling-unit" },
    geometry: {
      room: { widthMm: 14000, depthMm: 6000 },
      racks: [{ id: "R1", positionMm: { x: 3000, z: 1500 }, dimensionsMm: { width: 2000, depth: 1000, height: 2000 } }],
      obstacles: [{ id: "OB-PACK1", minXMm: packCentreX - 934, minZMm: 490, maxXMm: packCentreX + 934, maxZMm: 1710 }],
    },
    products: [{ id: "P-A", label: "Widget", itemDimensionsMm: { width: 200, depth: 200, height: 200 }, handlingClass: "ambient", capacityCostUnits: 1 }],
    locations: [{
      id: "L-A1", rackId: "R1",
      storageAnchorMm: { x: 3000, y: 450, z: 1500 },
      approachPointMm: { x: 3000, z: 3000 },
      usableDimensionsMm: { width: 500, depth: 400, height: 400 },
      storageClass: "ambient", maxQuantity: 100,
      restrictions: { eligibleHandlingClasses: ["ambient"] },
    }],
    initialStock: [{ locationId: "L-A1", productId: "P-A", quantity: 10 }],
    mobileUnits: [{
      id: "PK-1", role: "picker",
      footprintMm: { width: 680, length: 1220, margin: 100 },
      speedMmPerSecond: 1000, loadCapacityUnits: 10,
      eligibleHandlingClasses: ["ambient"],
      parkingSlotMm: { x: 1000, z: 3000 },
    }],
    resources: [
      {
        id: "PACK-1", kind: "packing",
        servicePositions: [{ id: "PACK1-S1", x: packCentreX, z: 3000 }],
        queueSlots: [{ id: "PACK1-Q1", x: packCentreX - 2000, z: 3000 }],
        serviceCapacity: 1, inputStagingCapacity: 10, outputStagingCapacity: 10,
        serviceDurationMs: 10000,
      },
      {
        id: "DSP-1", kind: "dispatch",
        servicePositions: [{ id: "DSP-S1", x: 12000, z: 3000 }],
        queueSlots: [{ id: "DSP-Q1", x: 11000, z: 3000 }],
        serviceCapacity: 1, inputStagingCapacity: 10, outputStagingCapacity: 10,
        serviceDurationMs: 5000,
      },
    ],
    orderSchedule: [{ id: "O-1", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 2 }] }],
    deliverySchedule: [],
    policies: {
      reservePolicy: "full-order-all-or-none",
      run: { mode: "finite-cohort", arrivalCutoffMs: 0 },
      eventLimits: { maxProcessedEvents: 100000, maxEventsPerTimestamp: 10000 },
    },
  };
}

export function corridorAttachment(packCentreX: number = CORRIDOR_BASE_CENTRE_X): StationAttachment {
  return {
    stationId: "PACK-1",
    resourceId: "PACK-1",
    obstacleId: "OB-PACK1",
    assetRef: "warehouse-environment/table_packing_heavyduty_c01",
    centreMm: { x: packCentreX, z: 1100 },
    obstacleRectMm: { minXMm: packCentreX - 934, minZMm: 490, maxXMm: packCentreX + 934, maxZMm: 1710 },
    servicePositions: [{ id: "PACK1-S1", x: packCentreX, z: 3000 }],
    queueSlots: [{ id: "PACK1-Q1", x: packCentreX - 2000, z: 3000 }],
  };
}
