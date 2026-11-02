// v3-M2b inventory acceptance tests. Micro synthetic scenarios built
// below (NOT the full 6-rack target): exact small quantities pin the
// all-or-none reservation, cart/split-trip, receiving/put-away and
// conservation contracts with independent literals.
import { describe, expect, test } from "vitest";
import {
  createInventoryStore,
  parseOperationsScenario,
  type OperationsScenario,
} from "../src/index.js";

type Line = { productId: string; quantity: number };

function m2bScenario(options: {
  stock?: { locationId: string; productId: string; quantity: number }[];
  orders?: { id: string; lines: Line[] }[];
  deliveries?: { id: string; lines: Line[] }[];
  extraLocations?: {
    id: string;
    storageClass: string;
    maxQuantity: number;
    classes: string[];
    productIds?: string[];
    usable?: { width: number; depth: number; height: number };
  }[];
  pickerCap?: number;
  pickerClasses?: string[];
  receivingOutCap?: number;
  packingInCap?: number;
}): OperationsScenario {
  const locations: unknown[] = [
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
      id: "L-A2",
      rackId: "R1",
      storageAnchorMm: { x: 1500, y: 500, z: 1000 },
      approachPointMm: { x: 1500, z: 2200 },
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
      maxQuantity: 100,
      restrictions: { eligibleHandlingClasses: ["chilled"], eligibleProductIds: ["P-B"] },
    },
    {
      id: "L-B2",
      rackId: "R1",
      storageAnchorMm: { x: 2500, y: 500, z: 1000 },
      approachPointMm: { x: 2500, z: 2200 },
      usableDimensionsMm: { width: 500, depth: 400, height: 400 },
      storageClass: "chilled",
      maxQuantity: 100,
      restrictions: { eligibleHandlingClasses: ["chilled"] },
    },
  ];
  let anchor = 3000;
  for (const extra of options.extraLocations ?? []) {
    anchor += 500;
    locations.push({
      id: extra.id,
      rackId: "R1",
      storageAnchorMm: { x: anchor, y: 500, z: 1000 },
      approachPointMm: { x: anchor, z: 2200 },
      usableDimensionsMm: extra.usable ?? { width: 500, depth: 400, height: 400 },
      storageClass: extra.storageClass,
      maxQuantity: extra.maxQuantity,
      restrictions: extra.productIds
        ? { eligibleHandlingClasses: extra.classes, eligibleProductIds: extra.productIds }
        : { eligibleHandlingClasses: extra.classes },
    });
  }
  return parseOperationsScenario({
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: "m2b-test",
    provenance: {
      category: "synthetic",
      description: "M2b unit-test micro scenario; synthetic, uncalibrated.",
      sourceUrls: [],
      assumptions: ["synthetic micro scenario for inventory tests only"],
      inventedFields: ["all coordinates, capacities, and schedules"],
    },
    seed: "m2b-test-001",
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
        label: "Ambient widget",
        itemDimensionsMm: { width: 100, depth: 100, height: 100 },
        handlingClass: "ambient",
        capacityCostUnits: 1,
      },
      {
        id: "P-B",
        label: "Chilled gadget",
        itemDimensionsMm: { width: 100, depth: 100, height: 100 },
        handlingClass: "chilled",
        capacityCostUnits: 2,
      },
    ],
    locations,
    initialStock: options.stock ?? [],
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
        loadCapacityUnits: options.pickerCap ?? 20,
        eligibleHandlingClasses: options.pickerClasses ?? ["ambient", "chilled"],
        parkingSlotMm: { x: 500, z: 500 },
      },
      {
        id: "M-PUT-1",
        role: "putaway",
        footprintMm: { width: 700, length: 1100, margin: 100 },
        speedMmPerSecond: 800,
        loadCapacityUnits: 30,
        eligibleHandlingClasses: ["ambient", "chilled"],
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
        inputStagingCapacity: 0,
        outputStagingCapacity: options.receivingOutCap ?? 10,
        serviceDurationMs: 1000,
      },
      {
        id: "RES-PACK-1",
        kind: "packing",
        servicePositions: [{ id: "P1", x: 4000, z: 500 }],
        queueSlots: [{ id: "PQ1", x: 4000, z: 1200 }],
        serviceCapacity: 1,
        inputStagingCapacity: options.packingInCap ?? 40,
        outputStagingCapacity: 0,
        serviceDurationMs: 1000,
      },
    ],
    orderSchedule: (options.orders ?? []).map((o) => ({ id: o.id, arrivalTimeMs: 0, lines: o.lines })),
    deliverySchedule: (options.deliveries ?? []).map((d) => ({
      id: d.id,
      arrivalTimeMs: 0,
      lines: d.lines,
    })),
    policies: {
      reservePolicy: "full-order-all-or-none",
      run: { mode: "fixed-window", horizonMs: 3_600_000 },
      eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
    },
  });
}

const snapJson = (store: ReturnType<typeof createInventoryStore>): string =>
  JSON.stringify(store.snapshot());

describe("M2b acceptance 1: whole-order stock-short rollback", () => {
  test("2A+1B need vs 2A+0B stored blocks all, put-away unblocks all", () => {
    const store = createInventoryStore(
      m2bScenario({
        stock: [{ locationId: "L-A1", productId: "P-A", quantity: 2 }],
        orders: [{ id: "O-1", lines: [{ productId: "P-A", quantity: 2 }, { productId: "P-B", quantity: 1 }] }],
        deliveries: [{ id: "D-1", lines: [{ productId: "P-B", quantity: 1 }] }],
      }),
    );
    expect(store.checkInvariants()).toEqual([]);

    // Short on B: NOTHING reserved, including the fully stocked A line.
    const r1 = store.reserveOrder({ eventId: "e-r1", timeMs: 0, orderId: "O-1" });
    expect(r1).toEqual({
      status: "waiting",
      orderId: "O-1",
      reason: "WAITING_FOR_STOCK",
      shortages: [{ productId: "P-B", requested: 1, available: 0 }],
    });
    expect(store.available("P-A")).toEqual({ stored: 2, reserved: 0, available: 2 });
    expect(store.available("P-B")).toEqual({ stored: 0, reserved: 0, available: 0 });
    expect(store.checkInvariants()).toEqual([]);

    // Accept 1B into receiving (1 item x cost 2 = 2/10 staging units):
    // still blocked, receiving stock is not pickable.
    store.acceptInbound({
      eventId: "e-acc1", timeMs: 10, deliveryId: "D-1",
      resourceId: "RES-RECV-1", productId: "P-B", quantity: 1,
    });
    expect(store.bucketTotals("P-B")).toEqual({
      receiving: 1, storage: 0, carried: 0, packing: 0, packed: 0, dispatched: 0, externalPending: 0,
    });
    const r2 = store.reserveOrder({ eventId: "e-r2", timeMs: 20, orderId: "O-1" });
    expect(r2.status).toBe("waiting");
    expect(store.checkInvariants()).toEqual([]);

    // Put-away selects the configured home L-B1 first.
    expect(store.selectPutAwayLocation("P-B", 1)).toEqual({ status: "selectable", locationId: "L-B1" });
    store.collectPutAway({
      eventId: "e-col1", timeMs: 30, deliveryId: "D-1",
      resourceId: "RES-RECV-1", unitId: "M-PUT-1", productId: "P-B", quantity: 1,
    });
    store.placePutAway({
      eventId: "e-put1", timeMs: 40, deliveryId: "D-1",
      unitId: "M-PUT-1", locationId: "L-B1", productId: "P-B", quantity: 1,
    });
    expect(store.bucketTotals("P-B").storage).toBe(1);
    expect(store.checkInvariants()).toEqual([]);

    // Now the full order reserves atomically; available hits zero but
    // physical stored quantities are untouched until picks.
    const r3 = store.reserveOrder({ eventId: "e-r3", timeMs: 50, orderId: "O-1" });
    expect(r3).toEqual({
      status: "reserved",
      orderId: "O-1",
      sources: [
        { productId: "P-A", locationId: "L-A1", quantity: 2 },
        { productId: "P-B", locationId: "L-B1", quantity: 1 },
      ],
    });
    expect(store.available("P-A")).toEqual({ stored: 2, reserved: 2, available: 0 });
    expect(store.available("P-B")).toEqual({ stored: 1, reserved: 1, available: 0 });
    expect(store.bucketTotals("P-A").storage).toBe(2);
    expect(store.bucketTotals("P-B").storage).toBe(1);
    expect(store.checkInvariants()).toEqual([]);

    // Retry cannot duplicate the reservation.
    const r4 = store.reserveOrder({ eventId: "e-r4", timeMs: 60, orderId: "O-1" });
    expect(r4.status).toBe("reserved");
    expect(store.available("P-A").reserved).toBe(2);
  });
});

describe("M2b acceptance 2: cart capacity and split trips", () => {
  test("P-B costs 2 units: 20-unit cart splits 12 items across trips", () => {
    const store = createInventoryStore(
      m2bScenario({
        stock: [{ locationId: "L-B1", productId: "P-B", quantity: 12 }],
        orders: [{ id: "O-2", lines: [{ productId: "P-B", quantity: 12 }] }],
      }),
    );
    store.reserveOrder({ eventId: "e-r", timeMs: 0, orderId: "O-2" });
    // 10 items x 2 = 20/20 units: full cart, exact fit.
    store.pick({
      eventId: "e-p1", timeMs: 10, orderId: "O-2", unitId: "M-PICK-1",
      locationId: "L-B1", productId: "P-B", quantity: 10,
    });
    expect(store.bucketTotals("P-B")).toMatchObject({ storage: 2, carried: 10 });
    // One more item (22 units) overflows: rejected, byte-equivalent state.
    const before = snapJson(store);
    expect(() =>
      store.pick({
        eventId: "e-p-over", timeMs: 11, orderId: "O-2", unitId: "M-PICK-1",
        locationId: "L-B1", productId: "P-B", quantity: 1,
      }),
    ).toThrow(/over capacity/);
    expect(snapJson(store)).toBe(before);

    // First trip to packing (20/40 staging units); not ready yet.
    store.transferToPacking({
      eventId: "e-t1", timeMs: 20, orderId: "O-2", unitId: "M-PICK-1",
      resourceId: "RES-PACK-1", productId: "P-B", quantity: 10,
    });
    const mid = store.packingReadiness("O-2", "RES-PACK-1");
    expect(mid.ready).toBe(false);
    expect(mid.remaining).toEqual([{ productId: "P-B", quantity: 2 }]);

    // Second trip carries the exact remaining commitment: 2 x 2 = 4 units.
    store.pick({
      eventId: "e-p2", timeMs: 30, orderId: "O-2", unitId: "M-PICK-1",
      locationId: "L-B1", productId: "P-B", quantity: 2,
    });
    store.transferToPacking({
      eventId: "e-t2", timeMs: 40, orderId: "O-2", unitId: "M-PICK-1",
      resourceId: "RES-PACK-1", productId: "P-B", quantity: 2,
    });
    const done = store.packingReadiness("O-2", "RES-PACK-1");
    expect(done).toEqual({
      ready: true,
      requested: [{ productId: "P-B", quantity: 12 }],
      staged: [{ productId: "P-B", quantity: 12 }],
      remaining: [],
    });
    store.packOrder({ eventId: "e-pack", timeMs: 50, orderId: "O-2", resourceId: "RES-PACK-1" });
    store.dispatchOrder({ eventId: "e-dsp", timeMs: 60, orderId: "O-2" });
    expect(store.bucketTotals("P-B")).toMatchObject({ dispatched: 12 });
    expect(store.checkInvariants()).toEqual([]);
  });

  test("role, unknown-product, duplicate and destination-full failures leave state byte-equivalent", () => {
    const store = createInventoryStore(
      m2bScenario({
        stock: [
          { locationId: "L-B1", productId: "P-B", quantity: 11 },
          { locationId: "L-A1", productId: "P-A", quantity: 5 },
        ],
        orders: [{ id: "O-3", lines: [{ productId: "P-B", quantity: 11 }] }],
        deliveries: [{ id: "D-3", lines: [{ productId: "P-A", quantity: 3 }] }],
        extraLocations: [
          { id: "L-FULL", storageClass: "ambient", maxQuantity: 2, classes: ["ambient"] },
        ],
      }),
    );
    store.reserveOrder({ eventId: "e-r", timeMs: 0, orderId: "O-3" });
    const before = snapJson(store);

    // 11 items x 2 = 22 > 20: all-or-none admission rejects the whole pick.
    expect(() =>
      store.pick({
        eventId: "e-p-big", timeMs: 10, orderId: "O-3", unitId: "M-PICK-1",
        locationId: "L-B1", productId: "P-B", quantity: 11,
      }),
    ).toThrow(/over capacity/);
    // Put-away role cannot pick orders.
    expect(() =>
      store.pick({
        eventId: "e-p-role", timeMs: 10, orderId: "O-3", unitId: "M-PUT-1",
        locationId: "L-B1", productId: "P-B", quantity: 1,
      }),
    ).toThrow(/cannot pick/);
    // Unknown product.
    expect(() =>
      store.pick({
        eventId: "e-p-unk", timeMs: 10, orderId: "O-3", unitId: "M-PICK-1",
        locationId: "L-B1", productId: "P-X", quantity: 1,
      }),
    ).toThrow(/unknown product/);
    expect(snapJson(store)).toBe(before);

    // A recorded pick replays identically (no double-apply); the same
    // event id with a different payload is rejected outright.
    const first = store.pick({
      eventId: "e-p-dup", timeMs: 20, orderId: "O-3", unitId: "M-PICK-1",
      locationId: "L-B1", productId: "P-B", quantity: 5,
    });
    const replay = store.pick({
      eventId: "e-p-dup", timeMs: 20, orderId: "O-3", unitId: "M-PICK-1",
      locationId: "L-B1", productId: "P-B", quantity: 5,
    });
    expect(replay).toEqual(first);
    expect(store.bucketTotals("P-B").carried).toBe(5);
    const afterPick = snapJson(store);
    expect(() =>
      store.pick({
        eventId: "e-p-dup", timeMs: 20, orderId: "O-3", unitId: "M-PICK-1",
        locationId: "L-B1", productId: "P-B", quantity: 6,
      }),
    ).toThrow(/duplicate event id/);
    expect(snapJson(store)).toBe(afterPick);

    // Destination-full put-away fails atomically: fill L-FULL to 2/2,
    // then one more unit is rejected with state byte-equivalent.
    store.acceptInbound({
      eventId: "e-acc", timeMs: 30, deliveryId: "D-3",
      resourceId: "RES-RECV-1", productId: "P-A", quantity: 3,
    });
    store.collectPutAway({
      eventId: "e-col", timeMs: 31, deliveryId: "D-3",
      resourceId: "RES-RECV-1", unitId: "M-PUT-1", productId: "P-A", quantity: 3,
    });
    store.placePutAway({
      eventId: "e-put-a", timeMs: 32, deliveryId: "D-3",
      unitId: "M-PUT-1", locationId: "L-FULL", productId: "P-A", quantity: 1,
    });
    store.placePutAway({
      eventId: "e-put-b", timeMs: 32, deliveryId: "D-3",
      unitId: "M-PUT-1", locationId: "L-FULL", productId: "P-A", quantity: 1,
    });
    expect(store.selectPutAwayLocation("P-A", 2)).toMatchObject({ status: "selectable", locationId: "L-A1" });
    const beforeFull = snapJson(store);
    expect(() =>
      store.placePutAway({
        eventId: "e-put-full", timeMs: 33, deliveryId: "D-3",
        unitId: "M-PUT-1", locationId: "L-FULL", productId: "P-A", quantity: 1,
      }),
    ).toThrow(/exceeds maxQuantity/);
    expect(snapJson(store)).toBe(beforeFull);
    expect(store.checkInvariants()).toEqual([]);
  });

  test("partial pick then cancellation keeps carried stock exactly once", () => {
    const store = createInventoryStore(
      m2bScenario({
        stock: [{ locationId: "L-A1", productId: "P-A", quantity: 4 }],
        orders: [{ id: "O-4", lines: [{ productId: "P-A", quantity: 4 }] }],
      }),
    );
    store.reserveOrder({ eventId: "e-r", timeMs: 0, orderId: "O-4" });
    store.pick({
      eventId: "e-p1", timeMs: 10, orderId: "O-4", unitId: "M-PICK-1",
      locationId: "L-A1", productId: "P-A", quantity: 2,
    });
    store.cancelReservation({ eventId: "e-cancel", timeMs: 20, orderId: "O-4" });
    // Carried pair stays physical; the unpicked pair is free again.
    expect(store.bucketTotals("P-A")).toMatchObject({ storage: 2, carried: 2 });
    expect(store.available("P-A")).toEqual({ stored: 2, reserved: 0, available: 2 });
    expect(store.checkInvariants()).toEqual([]);
    // Physically carried goods still stage normally after cancellation.
    store.transferToPacking({
      eventId: "e-t", timeMs: 30, orderId: "O-4", unitId: "M-PICK-1",
      resourceId: "RES-PACK-1", productId: "P-A", quantity: 2,
    });
    expect(store.bucketTotals("P-A")).toMatchObject({ packing: 2, carried: 0 });
    expect(store.checkInvariants()).toEqual([]);
  });
});

describe("M2b acceptance 3: receiving capacity and put-away selection", () => {
  test("finite receiving staging, home-then-ID selection, no double accept", () => {
    const store = createInventoryStore(
      m2bScenario({
        stock: [{ locationId: "L-A1", productId: "P-A", quantity: 90 }],
        deliveries: [{ id: "D-9", lines: [{ productId: "P-A", quantity: 12 }] }],
        receivingOutCap: 10,
      }),
    );
    // 10 items x cost 1 = 10/10 staging units: exact fit.
    store.acceptInbound({
      eventId: "e-acc1", timeMs: 0, deliveryId: "D-9",
      resourceId: "RES-RECV-1", productId: "P-A", quantity: 10,
    });
    const before = snapJson(store);
    // One more item overflows staging: rejected, byte-equivalent.
    expect(() =>
      store.acceptInbound({
        eventId: "e-acc-over", timeMs: 1, deliveryId: "D-9",
        resourceId: "RES-RECV-1", productId: "P-A", quantity: 1,
      }),
    ).toThrow(/over capacity/);
    // Over-accepting beyond the delivery line is rejected too.
    expect(() =>
      store.acceptInbound({
        eventId: "e-acc-line", timeMs: 1, deliveryId: "D-9",
        resourceId: "RES-RECV-1", productId: "P-A", quantity: 3,
      }),
    ).toThrow(/only 2 .* pending/);
    expect(snapJson(store)).toBe(before);

    // Same event replays without creating stock twice.
    const again = store.acceptInbound({
      eventId: "e-acc1", timeMs: 0, deliveryId: "D-9",
      resourceId: "RES-RECV-1", productId: "P-A", quantity: 10,
    });
    expect(again).toEqual({ status: "accepted", deliveryId: "D-9", productId: "P-A", quantity: 10 });
    expect(store.bucketTotals("P-A").receiving).toBe(10);

    // Home L-A1 has 10 free (90/100): selected first.
    expect(store.selectPutAwayLocation("P-A", 10)).toEqual({ status: "selectable", locationId: "L-A1" });
    // 11 items cannot fit home: stable ID order falls to empty L-A2.
    expect(store.selectPutAwayLocation("P-A", 11)).toEqual({ status: "selectable", locationId: "L-A2" });
    // Chilled P-B never selects ambient locations.
    expect(store.selectPutAwayLocation("P-B", 1)).toEqual({ status: "selectable", locationId: "L-B1" });
    expect(store.checkInvariants()).toEqual([]);
  });

  test("class, product, one-product, oversize and overflow limits fail atomically", () => {
    const store = createInventoryStore(
      m2bScenario({
        stock: [{ locationId: "L-A1", productId: "P-A", quantity: 1 }],
        deliveries: [{ id: "D-5", lines: [{ productId: "P-B", quantity: 4 }] }],
        receivingOutCap: 10,
        extraLocations: [
          { id: "L-TINY", storageClass: "chilled", maxQuantity: 50, classes: ["chilled"], usable: { width: 10, depth: 10, height: 10 } },
        ],
      }),
    );
    store.acceptInbound({
      eventId: "e-acc", timeMs: 0, deliveryId: "D-5",
      resourceId: "RES-RECV-1", productId: "P-B", quantity: 4,
    });
    store.collectPutAway({
      eventId: "e-col", timeMs: 1, deliveryId: "D-5",
      resourceId: "RES-RECV-1", unitId: "M-PUT-1", productId: "P-B", quantity: 4,
    });
    const before = snapJson(store);
    // Wrong handling class: chilled P-B into ambient L-A2.
    expect(() =>
      store.placePutAway({
        eventId: "e-bad-class", timeMs: 2, deliveryId: "D-5",
        unitId: "M-PUT-1", locationId: "L-A2", productId: "P-B", quantity: 1,
      }),
    ).toThrow(/ineligible/);
    // One product per slot: P-B into L-A1 holding P-A (also class-blocked).
    expect(() =>
      store.placePutAway({
        eventId: "e-bad-mix", timeMs: 2, deliveryId: "D-5",
        unitId: "M-PUT-1", locationId: "L-A1", productId: "P-B", quantity: 1,
      }),
    ).toThrow(/ineligible|one product per slot/);
    // Oversize item: 100mm item into a 10mm usable box.
    expect(() =>
      store.placePutAway({
        eventId: "e-bad-size", timeMs: 2, deliveryId: "D-5",
        unitId: "M-PUT-1", locationId: "L-TINY", productId: "P-B", quantity: 1,
      }),
    ).toThrow(/exceed .* usable dimensions/);
    // Quantity overflow / non-positive / non-integer rejected.
    for (const [id, qty] of [["e-ov", 1_000_001], ["e-zero", 0], ["e-neg", -2], ["e-frac", 1.5]] as const) {
      expect(() =>
        store.placePutAway({
          eventId: id, timeMs: 2, deliveryId: "D-5",
          unitId: "M-PUT-1", locationId: "L-B1", productId: "P-B", quantity: qty,
        }),
      ).toThrow(/must be a safe integer in 1\.\.1000000/);
    }
    expect(snapJson(store)).toBe(before);
    // The valid destination still works after the failures.
    store.placePutAway({
      eventId: "e-put-ok", timeMs: 3, deliveryId: "D-5",
      unitId: "M-PUT-1", locationId: "L-B1", productId: "P-B", quantity: 4,
    });
    expect(store.bucketTotals("P-B").storage).toBe(4);
    expect(store.checkInvariants()).toEqual([]);
  });
});

describe("M2b acceptance 5: snapshot isolation and executable invariants", () => {
  test("returned snapshots are frozen copies; ledger math is recomputed independently", () => {
    const store = createInventoryStore(
      m2bScenario({
        stock: [
          { locationId: "L-A1", productId: "P-A", quantity: 6 },
          { locationId: "L-B1", productId: "P-B", quantity: 4 },
        ],
        orders: [
          { id: "O-9", lines: [{ productId: "P-A", quantity: 3 }, { productId: "P-B", quantity: 2 }] },
        ],
        deliveries: [{ id: "D-9", lines: [{ productId: "P-B", quantity: 2 }] }],
      }),
    );
    store.reserveOrder({ eventId: "e-r", timeMs: 0, orderId: "O-9" });
    store.pick({
      eventId: "e-p", timeMs: 10, orderId: "O-9", unitId: "M-PICK-1",
      locationId: "L-A1", productId: "P-A", quantity: 3,
    });
    store.acceptInbound({
      eventId: "e-acc", timeMs: 11, deliveryId: "D-9",
      resourceId: "RES-RECV-1", productId: "P-B", quantity: 2,
    });
    expect(store.checkInvariants()).toEqual([]);

    const snap = store.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => {
      (snap as unknown as { storage: unknown }).storage = [];
    }).toThrow();
    // Mutating a detached clone cannot reach owned state.
    const clone = JSON.parse(JSON.stringify(snap)) as typeof snap;
    clone.storage[0].quantity = 999999;
    clone.carried[0].loads.push({ productId: "P-A", quantity: 999999 });
    expect(store.bucketTotals("P-A")).toMatchObject({ storage: 3, carried: 3 });
    expect(store.checkInvariants()).toEqual([]);

    // Independent conservation recomputation from the snapshot shape:
    // initial + accepted == all physical buckets, per product.
    const physical = (pid: string): number => {
      const t = store.bucketTotals(pid);
      return t.receiving + t.storage + t.carried + t.packing + t.packed + t.dispatched;
    };
    expect(physical("P-A")).toBe(6); // 6 initial + 0 accepted
    expect(physical("P-B")).toBe(6); // 4 initial + 2 accepted
    expect(store.available("P-A")).toEqual({ stored: 3, reserved: 0, available: 3 });
    expect(store.available("P-B")).toEqual({ stored: 4, reserved: 2, available: 2 });

    // Transfer history carries stable ids, time, product, qty, from/to/owner.
    const log = snap.transfers;
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]).toMatchObject({ seq: 1, eventId: "e-p", timeMs: 10, productId: "P-A", quantity: 3 });
    expect(log[0].from).toBe("storage:L-A1");
    expect(log[0].to).toBe("carried:M-PICK-1");
    expect(log[0].owner).toBe("order:O-9");
    expect(log.map((t) => t.seq)).toEqual(log.map((_, i) => i + 1));
  });
});
