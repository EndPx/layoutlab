// Micro scenario builder for M3a transport tests. Minimal valid
// layoutlab.operations/1 inputs with caller-chosen geometry/units/zones.
// Products/locations/resources are dummy-but-valid (transport never touches
// inventory); geometry carries the test. One far rack keeps location refs
// valid while leaving test corridors unobstructed unless the test adds its
// own racks/obstacles.
import { parseOperationsScenario } from "../src/index.js";
import type { OperationsScenario } from "../src/index.js";

export type MicroUnit = {
  id: string;
  role?: "picker" | "putaway";
  width?: number;
  length?: number;
  margin?: number;
  speedMmPerSecond?: number;
  parkingSlotMm: { x: number; z: number };
};

export type MicroOptions = {
  id?: string;
  room?: { widthMm: number; depthMm: number };
  racks?: { id: string; x: number; z: number; width: number; depth: number; height: number }[];
  obstacles?: { id: string; minXMm: number; minZMm: number; maxXMm: number; maxZMm: number }[];
  trafficZones?: { id: string; kind: "narrow-aisle" | "intersection"; minXMm: number; minZMm: number; maxXMm: number; maxZMm: number }[];
  units: MicroUnit[];
};

export function microScenario(opts: MicroOptions): OperationsScenario {
  const room = opts.room ?? { widthMm: 6000, depthMm: 4000 };
  const racks =
    opts.racks ??
    // Far corner (east-south), clear of the x1000..5000 / z700..3000 test
    // corridors with 600mm radius (checked: all micro starts/goals outside
    // the inflated 4900..6100 x -100..1100 rect).
    [{ id: "R-FAR", x: room.widthMm - 500, z: 500, width: 200, depth: 200, height: 1000 }];
  return parseOperationsScenario({
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: opts.id ?? "m3a-micro",
    provenance: {
      category: "synthetic",
      description: "M3a micro transport fixture; synthetic, uncalibrated.",
      sourceUrls: [],
      assumptions: ["synthetic micro geometry for transport admission tests"],
      inventedFields: ["all coordinates"],
    },
    seed: "m3a-micro-001",
    units: { quantityUnit: "item", capacityUnit: "handling-unit" },
    geometry: {
      room,
      racks: racks.map((r) => ({
        id: r.id,
        positionMm: { x: r.x, z: r.z },
        dimensionsMm: { width: r.width, depth: r.depth, height: r.height },
      })),
      obstacles: opts.obstacles ?? [],
      ...(opts.trafficZones ? { trafficZones: opts.trafficZones } : {}),
    },
    products: [
      {
        id: "P-A",
        label: "Micro widget",
        itemDimensionsMm: { width: 100, depth: 100, height: 100 },
        handlingClass: "ambient",
        capacityCostUnits: 1,
      },
    ],
    locations: [
      {
        id: "L-A1",
        rackId: racks[0]?.id ?? "R-FAR",
        storageAnchorMm: { x: racks[0]?.x ?? 500, y: 500, z: racks[0]?.z ?? 500 },
        approachPointMm: { x: 1000, z: 1000 },
        usableDimensionsMm: { width: 500, depth: 400, height: 400 },
        storageClass: "ambient",
        maxQuantity: 10,
        restrictions: { eligibleHandlingClasses: ["ambient"] },
      },
    ],
    initialStock: [],
    mobileUnits: opts.units.map((u) => ({
      id: u.id,
      role: u.role ?? "picker",
      footprintMm: {
        width: u.width ?? 600,
        length: u.length ?? 800,
        margin: u.margin ?? 100,
      },
      speedMmPerSecond: u.speedMmPerSecond ?? 1000,
      loadCapacityUnits: 20,
      eligibleHandlingClasses: ["ambient"],
      parkingSlotMm: { ...u.parkingSlotMm },
    })),
    resources: [
      {
        id: "RES-1",
        kind: "receiving",
        servicePositions: [{ id: "S1", x: room.widthMm - 500, z: room.depthMm - 500 }],
        queueSlots: [],
        serviceCapacity: 1,
        inputStagingCapacity: 0,
        outputStagingCapacity: 0,
        serviceDurationMs: 1000,
      },
    ],
    orderSchedule: [],
    deliverySchedule: [],
    policies: {
      reservePolicy: "full-order-all-or-none",
      run: { mode: "fixed-window", horizonMs: 3_600_000 },
      eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
    },
  });
}
