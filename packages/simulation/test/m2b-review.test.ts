// M2b independent-review regressions. Each test pins one executed
// counterexample finding (plus the terminal repeat flow) with exact small
// quantities; rejected commands assert byte-equivalent snapshots.
import { describe, expect, test } from "vitest";
import {
  MAX_TIME_MS,
  createInventoryStore,
  createServiceStation,
  parseOperationsScenario,
  type OperationsResource,
  type OperationsScenario,
} from "../src/index.js";

type Line = { productId: string; quantity: number };

function reviewScenario(options: {
  stock?: { locationId: string; productId: string; quantity: number }[];
  orders?: { id: string; lines: Line[] }[];
  deliveries?: { id: string; lines: Line[] }[];
}): OperationsScenario {
  return parseOperationsScenario({
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: "m2b-review-test",
    provenance: {
      category: "synthetic",
      description: "M2b review regression micro scenario; synthetic, uncalibrated.",
      sourceUrls: [],
      assumptions: ["synthetic micro scenario for review regression tests only"],
      inventedFields: ["all coordinates, capacities, and schedules"],
    },
    seed: "m2b-review-001",
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
      { id: "P-B", label: "Chilled gadget", itemDimensionsMm: { width: 100, depth: 100, height: 100 }, handlingClass: "chilled", capacityCostUnits: 1 },
    ],
    locations: [
      { id: "L-A1", rackId: "R1", storageAnchorMm: { x: 1000, y: 500, z: 1000 }, approachPointMm: { x: 1000, z: 2200 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "ambient", maxQuantity: 100, restrictions: { eligibleHandlingClasses: ["ambient"] } },
      { id: "L-A2", rackId: "R1", storageAnchorMm: { x: 1500, y: 500, z: 1000 }, approachPointMm: { x: 1500, z: 2200 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "ambient", maxQuantity: 100, restrictions: { eligibleHandlingClasses: ["ambient"] } },
      { id: "L-B1", rackId: "R1", storageAnchorMm: { x: 2000, y: 500, z: 1000 }, approachPointMm: { x: 2000, z: 2200 }, usableDimensionsMm: { width: 500, depth: 400, height: 400 }, storageClass: "chilled", maxQuantity: 100, restrictions: { eligibleHandlingClasses: ["chilled"] } },
    ],
    initialStock: options.stock ?? [],
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
    orderSchedule: (options.orders ?? []).map((o) => ({ id: o.id, arrivalTimeMs: 0, lines: o.lines })),
    deliverySchedule: (options.deliveries ?? []).map((d) => ({ id: d.id, arrivalTimeMs: 0, lines: d.lines })),
    policies: {
      reservePolicy: "full-order-all-or-none",
      run: { mode: "fixed-window", horizonMs: 3_600_000 },
      eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
    },
  });
}

function laneResource(overrides: Partial<OperationsResource> = {}): OperationsResource {
  return {
    id: "RES-REV-1",
    kind: "packing",
    servicePositions: [{ id: "S1", x: 100, z: 100 }],
    queueSlots: [{ id: "Q1", x: 100, z: 200 }],
    serviceCapacity: 1,
    inputStagingCapacity: 0,
    outputStagingCapacity: 0,
    serviceDurationMs: 1000,
    ...overrides,
  };
}

const snapJson = (store: ReturnType<typeof createInventoryStore>): string =>
  JSON.stringify(store.snapshot());

describe("review 1: cancel/re-reserve acquires remaining demand only", () => {
  test("pick 1 of 2, cancel, re-reserve 1: carried total is 2, never 3", () => {
    const store = createInventoryStore(
      reviewScenario({
        stock: [{ locationId: "L-A1", productId: "P-A", quantity: 6 }],
        orders: [{ id: "O", lines: [{ productId: "P-A", quantity: 2 }] }],
      }),
    );
    expect(store.reserveOrder({ eventId: "r1", timeMs: 0, orderId: "O" }).status).toBe("reserved");
    store.pick({ eventId: "p1", timeMs: 1, orderId: "O", unitId: "M-PICK-1", locationId: "L-A1", productId: "P-A", quantity: 1 });
    store.cancelReservation({ eventId: "c1", timeMs: 2, orderId: "O" });
    // Outstanding claim released; the picked unit stays physical exactly once.
    expect(store.bucketTotals("P-A")).toMatchObject({ storage: 5, carried: 1 });
    const r2 = store.reserveOrder({ eventId: "r2", timeMs: 3, orderId: "O" });
    expect(r2).toEqual({
      status: "reserved",
      orderId: "O",
      sources: [{ productId: "P-A", locationId: "L-A1", quantity: 1 }],
    });
    // The old over-pick (2 more against demand 2 with 1 picked) is rejected.
    const before = snapJson(store);
    expect(() =>
      store.pick({ eventId: "p-bad", timeMs: 4, orderId: "O", unitId: "M-PICK-1", locationId: "L-A1", productId: "P-A", quantity: 2 }),
    ).toThrow(/picked 1\/2/);
    expect(snapJson(store)).toBe(before);
    store.pick({ eventId: "p2", timeMs: 4, orderId: "O", unitId: "M-PICK-1", locationId: "L-A1", productId: "P-A", quantity: 1 });
    expect(store.bucketTotals("P-A").carried).toBe(2);
    expect(store.checkInvariants()).toEqual([]);
  });

  test("terminal fulfillment cannot repeat under new event ids", () => {
    const store = createInventoryStore(
      reviewScenario({
        stock: [{ locationId: "L-A1", productId: "P-A", quantity: 2 }],
        orders: [{ id: "O", lines: [{ productId: "P-A", quantity: 2 }] }],
      }),
    );
    store.reserveOrder({ eventId: "r", timeMs: 0, orderId: "O" });
    store.pick({ eventId: "p", timeMs: 1, orderId: "O", unitId: "M-PICK-1", locationId: "L-A1", productId: "P-A", quantity: 2 });
    store.transferToPacking({ eventId: "t", timeMs: 2, orderId: "O", unitId: "M-PICK-1", resourceId: "RES-PACK-1", productId: "P-A", quantity: 2 });
    store.packOrder({ eventId: "pack", timeMs: 3, orderId: "O", resourceId: "RES-PACK-1" });
    store.dispatchOrder({ eventId: "dsp", timeMs: 4, orderId: "O" });
    expect(store.bucketTotals("P-A")).toMatchObject({ dispatched: 2 });
    const before = snapJson(store);
    expect(() => store.packOrder({ eventId: "pack2", timeMs: 5, orderId: "O", resourceId: "RES-PACK-1" })).toThrow(/not ready/);
    expect(() => store.dispatchOrder({ eventId: "dsp2", timeMs: 6, orderId: "O" })).toThrow(/insufficient/);
    expect(() =>
      store.pick({ eventId: "p2", timeMs: 7, orderId: "O", unitId: "M-PICK-1", locationId: "L-A1", productId: "P-A", quantity: 1 }),
    ).toThrow(/picked 2\/2/);
    expect(snapJson(store)).toBe(before);
    // Once the reservation is gone a fulfilled order cannot reopen either.
    store.cancelReservation({ eventId: "c", timeMs: 8, orderId: "O" });
    expect(() => store.reserveOrder({ eventId: "r2", timeMs: 9, orderId: "O" })).toThrow(/already fulfilled/);
    expect(store.checkInvariants()).toEqual([]);
  });
});

describe("review 2: idempotency is scoped by operation", () => {
  test("same event id under a different command rejects byte-equivalent", () => {
    const store = createInventoryStore(
      reviewScenario({
        stock: [{ locationId: "L-A1", productId: "P-A", quantity: 2 }],
        orders: [{ id: "O", lines: [{ productId: "P-A", quantity: 2 }] }],
      }),
    );
    store.reserveOrder({ eventId: "same", timeMs: 0, orderId: "O" });
    const before = snapJson(store);
    expect(() => store.cancelReservation({ eventId: "same", timeMs: 0, orderId: "O" })).toThrow(/duplicate event id/);
    expect(snapJson(store)).toBe(before);
    expect(store.available("P-A").reserved).toBe(2);
    // Same op + same payload still replays without duplicating.
    expect(store.reserveOrder({ eventId: "same", timeMs: 0, orderId: "O" }).status).toBe("reserved");
    expect(store.available("P-A").reserved).toBe(2);
    expect(store.checkInvariants()).toEqual([]);
  });
});

describe("review 3: receiving keeps delivery attribution", () => {
  test("unaccepted D2 cannot collect D1 stock; D1 stock stays available", () => {
    const store = createInventoryStore(
      reviewScenario({
        deliveries: [
          { id: "D1", lines: [{ productId: "P-A", quantity: 1 }] },
          { id: "D2", lines: [{ productId: "P-B", quantity: 1 }] },
        ],
      }),
    );
    store.acceptInbound({ eventId: "a1", timeMs: 0, deliveryId: "D1", resourceId: "RES-RECV-1", productId: "P-A", quantity: 1 });
    const before = snapJson(store);
    expect(() =>
      store.collectPutAway({ eventId: "c-bad", timeMs: 1, deliveryId: "D2", resourceId: "RES-RECV-1", unitId: "M-PUT-1", productId: "P-A", quantity: 1 }),
    ).toThrow(/for delivery D2/);
    expect(snapJson(store)).toBe(before);
    store.collectPutAway({ eventId: "c1", timeMs: 2, deliveryId: "D1", resourceId: "RES-RECV-1", unitId: "M-PUT-1", productId: "P-A", quantity: 1 });
    expect(store.snapshot().carried.find((c) => c.unitId === "M-PUT-1")).toMatchObject({ owner: "delivery:D1" });
    expect(store.checkInvariants()).toEqual([]);
  });

  test("two deliveries of the same SKU keep distinct provenance through partial collection", () => {
    const store = createInventoryStore(
      reviewScenario({
        deliveries: [
          { id: "D1", lines: [{ productId: "P-A", quantity: 2 }] },
          { id: "D2", lines: [{ productId: "P-A", quantity: 2 }] },
        ],
      }),
    );
    store.acceptInbound({ eventId: "a1", timeMs: 0, deliveryId: "D1", resourceId: "RES-RECV-1", productId: "P-A", quantity: 2 });
    store.acceptInbound({ eventId: "a2", timeMs: 1, deliveryId: "D2", resourceId: "RES-RECV-1", productId: "P-A", quantity: 2 });
    expect(store.snapshot().receiving).toEqual([
      { resourceId: "RES-RECV-1", deliveryId: "D1", productId: "P-A", quantity: 2 },
      { resourceId: "RES-RECV-1", deliveryId: "D2", productId: "P-A", quantity: 2 },
    ]);
    store.collectPutAway({ eventId: "c1", timeMs: 2, deliveryId: "D1", resourceId: "RES-RECV-1", unitId: "M-PUT-1", productId: "P-A", quantity: 1 });
    store.placePutAway({ eventId: "put1", timeMs: 3, deliveryId: "D1", unitId: "M-PUT-1", locationId: "L-A2", productId: "P-A", quantity: 1 });
    store.collectPutAway({ eventId: "c2", timeMs: 4, deliveryId: "D2", resourceId: "RES-RECV-1", unitId: "M-PUT-1", productId: "P-A", quantity: 2 });
    expect(store.snapshot().receiving).toEqual([
      { resourceId: "RES-RECV-1", deliveryId: "D1", productId: "P-A", quantity: 1 },
      { resourceId: "RES-RECV-1", deliveryId: "D2", productId: "P-A", quantity: 0 },
    ]);
    expect(store.snapshot().carried.find((c) => c.unitId === "M-PUT-1")).toMatchObject({ owner: "delivery:D2" });
    expect(store.checkInvariants()).toEqual([]);
  });
});

describe("review 4: resource causal time", () => {
  test("start before enqueue and release before finish reject without mutating", () => {
    const station = createServiceStation(laneResource());
    station.enqueue({ jobId: "A", enqueueTimeMs: 100 });
    const before = JSON.stringify(station.snapshot());
    expect(() => station.tryStart({ jobId: "A", timeMs: 50, inputReady: true })).toThrow(/before enqueue/);
    expect(JSON.stringify(station.snapshot())).toBe(before);
    expect(station.snapshot().jobs[0]).toMatchObject({ state: "queued", positionId: null });

    station.tryStart({ jobId: "A", timeMs: 100, inputReady: true });
    station.completeService({ jobId: "A", timeMs: 1100, outputBlocked: true });
    const held = JSON.stringify(station.snapshot());
    expect(() => station.releaseOutput({ jobId: "A", timeMs: 1 })).toThrow(/before finish/);
    expect(JSON.stringify(station.snapshot())).toBe(held);
    expect(station.snapshot().jobs[0].state).toBe("output-held");
  });

  test("start whose finish would exceed max time fails before allocation", () => {
    const station = createServiceStation(laneResource());
    station.enqueue({ jobId: "A", enqueueTimeMs: 0 });
    const before = JSON.stringify(station.snapshot());
    expect(() => station.tryStart({ jobId: "A", timeMs: MAX_TIME_MS, inputReady: true })).toThrow(/exceeds max time/);
    expect(JSON.stringify(station.snapshot())).toBe(before);
    expect(station.snapshot().jobs[0]).toMatchObject({ state: "queued", positionId: null });
  });

  test("delayed retry keeps its original age: old enqueue, current start", () => {
    const station = createServiceStation(laneResource());
    station.enqueue({ jobId: "A", enqueueTimeMs: 0 });
    expect(station.tryStart({ jobId: "A", timeMs: 5000, inputReady: true })).toEqual(
      { status: "started", jobId: "A", positionId: "S1", startTimeMs: 5000, waitMs: 5000 },
    );
  });
});

describe("review 5: constructor snapshots configuration", () => {
  test("caller mutation of duration/capacity/positions cannot alter behavior", () => {
    const cfg = laneResource();
    const station = createServiceStation(cfg);
    station.enqueue({ jobId: "A", enqueueTimeMs: 0 });
    station.tryStart({ jobId: "A", timeMs: 0, inputReady: true });
    cfg.serviceDurationMs = 0;
    cfg.serviceCapacity = 99;
    cfg.servicePositions.push({ id: "SMUGGLED", x: 1, z: 1 });
    cfg.queueSlots.length = 0;
    expect(() => station.completeService({ jobId: "A", timeMs: 0, outputBlocked: false })).toThrow(/no earlier than 1000/);
    expect(station.completeService({ jobId: "A", timeMs: 1000, outputBlocked: false })).toEqual(
      { status: "released", jobId: "A", finishTimeMs: 1000 },
    );
    expect(station.snapshot()).toMatchObject({ serviceCapacity: 1, serviceDurationMs: 1000 });
  });

  test("reused slot ids and stacked coordinates are rejected at construction", () => {
    expect(() =>
      createServiceStation(laneResource({
        servicePositions: [{ id: "S1", x: 100, z: 100 }],
        queueSlots: [{ id: "S1", x: 200, z: 200 }],
      })),
    ).toThrow(/reuses a slot id/);
    expect(() =>
      createServiceStation(laneResource({
        servicePositions: [{ id: "S1", x: 100, z: 100 }],
        queueSlots: [{ id: "Q1", x: 100, z: 100 }],
      })),
    ).toThrow(/stacks slots/);
  });
});

describe("review 6: zero-queue direct service", () => {
  test("idle lane admits without queue coordinates and completes two jobs legally", () => {
    const station = createServiceStation(laneResource({ queueSlots: [] }));
    expect(station.enqueue({ jobId: "A", enqueueTimeMs: 0 })).toEqual({ status: "queued", jobId: "A", queueSlotId: null });
    // A second job while A waits at the entrance waits upstream, not at a fabricated slot.
    expect(station.enqueue({ jobId: "B", enqueueTimeMs: 1 })).toEqual({
      status: "waiting-outside", jobId: "B", reason: { code: "QUEUE_FULL", queueSlots: 0, queued: 1 },
    });
    expect(station.tryStart({ jobId: "A", timeMs: 2, inputReady: false })).toEqual(
      { status: "waiting", jobId: "A", reason: "INPUT_NOT_READY" },
    );
    expect(station.tryStart({ jobId: "A", timeMs: 2, inputReady: true })).toEqual(
      { status: "started", jobId: "A", positionId: "S1", startTimeMs: 2, waitMs: 2 },
    );
    // Lane busy: B still waits upstream and is NOT stored (retry keeps its age).
    expect(station.enqueue({ jobId: "B", enqueueTimeMs: 1 }).status).toBe("waiting-outside");
    expect(station.completeService({ jobId: "A", timeMs: 1002, outputBlocked: false })).toEqual(
      { status: "released", jobId: "A", finishTimeMs: 1002 },
    );
    expect(station.enqueue({ jobId: "B", enqueueTimeMs: 1 })).toEqual({ status: "queued", jobId: "B", queueSlotId: null });
    expect(station.tryStart({ jobId: "B", timeMs: 1002, inputReady: true })).toEqual(
      { status: "started", jobId: "B", positionId: "S1", startTimeMs: 1002, waitMs: 1001 },
    );
    expect(station.completeService({ jobId: "B", timeMs: 2002, outputBlocked: false }).status).toBe("released");
    const jobs = Object.fromEntries(station.snapshot().jobs.map((j) => [j.jobId, j]));
    expect(jobs.A).toMatchObject({ state: "released", startTimeMs: 2, finishTimeMs: 1002 });
    expect(jobs.B).toMatchObject({ state: "released", startTimeMs: 1002, finishTimeMs: 2002, waitMs: 1001 });
  });
});

describe("review 7: capacity beyond physical positions is rejected", () => {
  test("serviceCapacity 2 with one position throws at construction", () => {
    expect(() => createServiceStation(laneResource({ serviceCapacity: 2 }))).toThrow(
      /serviceCapacity 2 exceeds 1 service positions/,
    );
  });
});
