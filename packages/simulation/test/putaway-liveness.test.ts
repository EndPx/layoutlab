// Put-away liveness regressions (private r3-liveness handoff).
// Production-intended location: packages/simulation/test/putaway-liveness.test.ts
// All expectations are derived from observed timeline events and ledger
// transfers in the same run (collect/place handling spans, stored/picked
// quantities), never from a travel-time helper under test.
import { describe, expect, test } from "vitest";
import {
  createOperationsController,
  parseOperationsScenario,
  type OperationsController,
  type OperationsScenario,
  type OperationsSnapshot,
} from "../src/index.js";

const EXEC = { pickDurationMsPerItem: 500, unloadDurationMsPerItem: 400 };

type Loc = { id: string; approach: { x: number; z: number }; productId: string; stock: number; maxQuantity?: number; eligible?: string[] };
type Unit = { id: string; role?: "picker" | "putaway"; park: { x: number; z: number }; capacity?: number; speed?: number };

function buildScenario(opts: {
  id: string;
  room?: { widthMm: number; depthMm: number };
  locations: Loc[];
  homes?: { productId: string; locationId: string }[];
  products?: { id: string }[];
  units: Unit[];
  deliveries?: { id: string; arrival: number; lines: { productId: string; quantity: number }[] }[];
  orders?: { id: string; arrival: number; lines: { productId: string; quantity: number }[] }[];
  horizonMs?: number;
}): OperationsScenario {
  const room = opts.room ?? { widthMm: 9000, depthMm: 5000 };
  const products = opts.products ?? [{ id: "P-A" }];
  const locations = opts.locations;
  const homes = opts.homes ?? products.map((p, i) => ({ productId: p.id, locationId: locations[i % locations.length]!.id }));
  return parseOperationsScenario({
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: opts.id,
    provenance: {
      category: "synthetic",
      description: "put-away liveness micro fixture; synthetic, uncalibrated",
      sourceUrls: [],
      assumptions: ["synthetic micro geometry for liveness regressions"],
      inventedFields: ["all coordinates, capacities, and schedules"],
    },
    seed: `${opts.id}-001`,
    units: { quantityUnit: "item", capacityUnit: "handling-unit" },
    geometry: {
      room,
      racks: [{ id: "R-FAR", positionMm: { x: room.widthMm - 500, z: 500 }, dimensionsMm: { width: 200, depth: 200, height: 1000 } }],
      obstacles: [],
    },
    products: products.map((p) => ({
      id: p.id,
      label: `Micro ${p.id}`,
      itemDimensionsMm: { width: 100, depth: 100, height: 100 },
      handlingClass: "ambient",
      capacityCostUnits: 1,
    })),
    locations: locations.map((l) => ({
      id: l.id,
      rackId: "R-FAR",
      storageAnchorMm: { x: 1000, y: 500, z: 1000 },
      approachPointMm: { ...l.approach },
      usableDimensionsMm: { width: 500, depth: 400, height: 400 },
      storageClass: "ambient",
      maxQuantity: l.maxQuantity ?? Math.max(10, l.stock),
      restrictions: {
        eligibleHandlingClasses: ["ambient"],
        ...(l.eligible ? { eligibleProductIds: l.eligible } : {}),
      },
    })),
    initialStock: locations.filter((l) => l.stock > 0).map((l) => ({ locationId: l.id, productId: l.productId, quantity: l.stock })),
    homeAssignments: homes,
    mobileUnits: opts.units.map((u) => ({
      id: u.id,
      role: u.role ?? "picker",
      footprintMm: { width: 600, length: 800, margin: 100 },
      speedMmPerSecond: u.speed ?? 1000,
      loadCapacityUnits: u.capacity ?? 20,
      eligibleHandlingClasses: ["ambient"],
      parkingSlotMm: { ...u.park },
    })),
    resources: [
      {
        id: "PACK-1",
        kind: "packing" as const,
        servicePositions: [{ id: "S1", x: 5200, z: 2000 }],
        queueSlots: [{ id: "Q1", x: 4200, z: 2000 }],
        serviceCapacity: 1,
        inputStagingCapacity: 50,
        outputStagingCapacity: 50,
        serviceDurationMs: 1000,
      },
      {
        id: "RCV-1",
        kind: "receiving" as const,
        servicePositions: [{ id: "RS1", x: 1500, z: 2000 }],
        queueSlots: [{ id: "RQ1", x: 800, z: 2000 }],
        serviceCapacity: 1,
        inputStagingCapacity: 20,
        outputStagingCapacity: 20,
        serviceDurationMs: 1000,
      },
    ],
    orderSchedule: (opts.orders ?? []).map((o) => ({ id: o.id, arrivalTimeMs: o.arrival, lines: o.lines.map((l) => ({ ...l })) })),
    deliverySchedule: (opts.deliveries ?? []).map((d) => ({ id: d.id, arrivalTimeMs: d.arrival, lines: d.lines.map((l) => ({ ...l })) })),
    policies: {
      reservePolicy: "full-order-all-or-none",
      run: { mode: "fixed-window" as const, horizonMs: opts.horizonMs ?? 300_000 },
      eventLimits: { maxProcessedEvents: 20000, maxEventsPerTimestamp: 1000 },
    },
  });
}

function runToHorizon(scenario: OperationsScenario): { c: OperationsController; s: OperationsSnapshot } {
  const c = createOperationsController({ scenario, executionConfig: EXEC });
  c.advanceTo(300_000);
  return { c, s: c.snapshot() };
}

function qtyInDetail(detail: string): number {
  const m = /x(\d+)\b/.exec(detail);
  if (!m) throw new Error(`no quantity in detail: ${detail}`);
  return Number(m[1]);
}

function timelineQtySum(s: OperationsSnapshot, kind: string, unitId?: string): number {
  return s.timeline
    .filter((t) => t.kind === kind && (unitId === undefined || t.unitId === unitId))
    .reduce((n, t) => n + qtyInDetail(t.detail), 0);
}

function storageQty(s: OperationsSnapshot, locationId: string): number {
  return s.inventory.storage.find((r) => r.locationId === locationId)?.quantity ?? 0;
}

function receivingQty(s: OperationsSnapshot, deliveryId: string, productId: string): number {
  return s.inventory.receiving.find((r) => r.deliveryId === deliveryId && r.productId === productId)?.quantity ?? 0;
}

// Collect scenario shared by the race/yield tests: two put-away carts race
// for one slot (free 5, each cart holds 4), the loser places partially,
// yields to parking, and resumes as picks free space.
function raceScenario(id: string): OperationsScenario {
  return buildScenario({
    id,
    locations: [{ id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock: 5, maxQuantity: 10 }],
    units: [
      { id: "PA1", role: "putaway", park: { x: 1500, z: 3500 }, capacity: 4 },
      { id: "PA2", role: "putaway", park: { x: 1500, z: 650 }, capacity: 4 },
      { id: "U1", park: { x: 4500, z: 3500 } },
    ],
    deliveries: [{ id: "D1", arrival: 0, lines: [{ productId: "P-A", quantity: 8 }] }],
    orders: [
      { id: "O1", arrival: 40000, lines: [{ productId: "P-A", quantity: 2 }] },
      { id: "O2", arrival: 90000, lines: [{ productId: "P-A", quantity: 1 }] },
    ],
  });
}

describe("put-away liveness: placeable-sized collect", () => {
  test.each([1, 2, 3])(
    "free=%i: a cart starting away from receiving collects only the placeable quantity on arrival",
    (free) => {
      const scenario = buildScenario({
        id: `putaway-free${free}`,
        locations: [{ id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock: 10 - free, maxQuantity: 10 }],
        units: [
          { id: "U1", park: { x: 1000, z: 3300 } },
          { id: "PA1", role: "putaway", park: { x: 5300, z: 3300 } },
        ],
        deliveries: [{ id: "D1", arrival: 0, lines: [{ productId: "P-A", quantity: 4 }] }],
        orders: [],
        horizonMs: 120_000,
      });
      const c = createOperationsController({ scenario, executionConfig: EXEC });
      c.advanceTo(120_000);
      const s = c.snapshot();
      expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
      expect(c.getDiagnostic()).toBeNull();

      const started = s.timeline.find((t) => t.kind === "PUTAWAY_COLLECT_STARTED" && t.unitId === "PA1");
      const collected = s.timeline.find((t) => t.kind === "PUTAWAY_COLLECTED" && t.unitId === "PA1");
      const placeStarted = s.timeline.find((t) => t.kind === "PUTAWAY_PLACE_STARTED" && t.unitId === "PA1");
      const stored = s.timeline.find((t) => t.kind === "PUTAWAY_STORED" && t.unitId === "PA1");
      if (!started || !collected || !placeStarted || !stored) throw new Error("missing put-away events");

      // The quantity actually collected on arrival equals the free space,
      // and the observed handling spans match that collected/placed count.
      expect(qtyInDetail(collected.detail)).toBe(free);
      expect(collected.timeMs - started.timeMs).toBe(free * EXEC.pickDurationMsPerItem);
      expect(qtyInDetail(stored.detail)).toBe(free);
      expect(stored.timeMs - placeStarted.timeMs).toBe(free * EXEC.pickDurationMsPerItem);

      // Ledger: slot filled exactly to capacity; the unplaceable remainder
      // stays staged (honest block), nothing is carried or lost.
      expect(storageQty(s, "L-A1")).toBe(10);
      expect(receivingQty(s, "D1", "P-A")).toBe(4 - free);
      expect(s.units.find((u) => u.unitId === "PA1")?.carried).toEqual([]);
      expect(s.deliveries[0]?.state).toBe("PUTAWAY");
      expect(s.waits.filter((w) => w.reason === "PUTAWAY_NO_LOCATION" && w.endMs === null)).toEqual([]);
    },
  );

  test("valid capacity block: a full slot with no picks never collects and stays honestly blocked", () => {
    const scenario = buildScenario({
      id: "putaway-blocked0",
      locations: [{ id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock: 10, maxQuantity: 10 }],
      units: [
        { id: "U1", park: { x: 1000, z: 3300 } },
        { id: "PA1", role: "putaway", park: { x: 5300, z: 3300 } },
      ],
      deliveries: [{ id: "D1", arrival: 0, lines: [{ productId: "P-A", quantity: 2 }] }],
      orders: [],
      horizonMs: 120_000,
    });
    const c = createOperationsController({ scenario, executionConfig: EXEC });
    c.advanceTo(120_000);
    const s = c.snapshot();
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    expect(c.getDiagnostic()).toBeNull();
    expect(s.timeline.some((t) => t.kind === "PUTAWAY_COLLECTED")).toBe(false);
    expect(s.timeline.some((t) => t.kind === "PUTAWAY_STORED")).toBe(false);
    expect(s.deliveries[0]?.state).toBe("PUTAWAY_PENDING");
    expect(receivingQty(s, "D1", "P-A")).toBe(2);
    const pa = s.units.find((u) => u.unitId === "PA1");
    expect(pa?.task).toEqual({ kind: "idle" });
    expect(pa?.pose).toEqual({ x: 5300, z: 3300 });
  });

  test("an unplaceable first staged row does not hide a placeable row in the same delivery", () => {
    const scenario = buildScenario({
      id: "putaway-row-skip",
      products: [{ id: "P-A" }, { id: "P-B" }],
      locations: [
        { id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock: 5, maxQuantity: 5, eligible: ["P-A"] },
        { id: "L-B1", approach: { x: 3500, z: 2000 }, productId: "P-B", stock: 8, maxQuantity: 10, eligible: ["P-B"] },
      ],
      homes: [
        { productId: "P-A", locationId: "L-A1" },
        { productId: "P-B", locationId: "L-B1" },
      ],
      units: [
        { id: "U1", park: { x: 1000, z: 3300 } },
        { id: "PA1", role: "putaway", park: { x: 5300, z: 3300 } },
      ],
      deliveries: [{ id: "D1", arrival: 0, lines: [{ productId: "P-A", quantity: 2 }, { productId: "P-B", quantity: 2 }] }],
      orders: [],
      horizonMs: 120_000,
    });
    const c = createOperationsController({ scenario, executionConfig: EXEC });
    c.advanceTo(120_000);
    const s = c.snapshot();
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    // The second (placeable) row was collected and stored; the blocked head
    // row remains staged and the delivery is honestly not STORED.
    const collected = s.timeline.filter((t) => t.kind === "PUTAWAY_COLLECTED");
    expect(collected.map((t) => t.detail)).toEqual(["D1 P-Bx2 collected"]);
    expect(storageQty(s, "L-A1")).toBe(5);
    expect(storageQty(s, "L-B1")).toBe(10);
    expect(receivingQty(s, "D1", "P-A")).toBe(2);
    expect(receivingQty(s, "D1", "P-B")).toBe(0);
    expect(s.deliveries[0]?.state).toBe("PUTAWAY");
  });
});

describe("put-away liveness: same-slot race, yield, waits, completion", () => {
  test("two carts selecting the same slot place partially, yield, resume, and close every wait on completion", () => {
    const { c, s } = runToHorizon(raceScenario("putaway-race-complete"));
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    expect(c.getDiagnostic()).toBeNull();

    // Both carts collected 4 toward the same slot (free 5 at collect time).
    expect(timelineQtySum(s, "PUTAWAY_COLLECTED", "PA1")).toBe(4);
    expect(timelineQtySum(s, "PUTAWAY_COLLECTED", "PA2")).toBe(4);
    // The winner stored 4; the loser stored 1, then 2, then 1 as picks
    // freed space — never more than the slot could take, never losing stock.
    const pa2Stored = s.timeline.filter((t) => t.kind === "PUTAWAY_STORED" && t.unitId === "PA2").map((t) => qtyInDetail(t.detail));
    expect(pa2Stored).toEqual([1, 2, 1]);

    // Observed handling spans match the quantities handled in each event.
    const pa1CollectStart = s.timeline.find((t) => t.kind === "PUTAWAY_COLLECT_STARTED" && t.unitId === "PA1");
    const pa1Collected = s.timeline.find((t) => t.kind === "PUTAWAY_COLLECTED" && t.unitId === "PA1");
    if (!pa1CollectStart || !pa1Collected) throw new Error("missing PA1 collect events");
    expect(pa1Collected.timeMs - pa1CollectStart.timeMs).toBe(4 * EXEC.pickDurationMsPerItem);
    const pa2FirstPlace = s.timeline.find((t) => t.kind === "PUTAWAY_PLACE_STARTED" && t.unitId === "PA2");
    const pa2FirstStored = s.timeline.find((t) => t.kind === "PUTAWAY_STORED" && t.unitId === "PA2");
    if (!pa2FirstPlace || !pa2FirstStored) throw new Error("missing PA2 place events");
    expect(pa2FirstStored.timeMs - pa2FirstPlace.timeMs).toBe(1 * EXEC.pickDurationMsPerItem);

    // Ledger conservation from the snapshot buckets: everything accepted is
    // stored or picked; the slot ends exactly full after 3 picks.
    const storedTotal = timelineQtySum(s, "PUTAWAY_STORED");
    const pickedTotal = timelineQtySum(s, "PICK_COMMITTED");
    expect(storedTotal).toBe(8);
    expect(pickedTotal).toBe(3);
    expect(storageQty(s, "L-A1")).toBe(5 + storedTotal - pickedTotal);

    // The blocked cart yielded to parking (a real granted motion, no
    // teleport) and the delivery completed; no put-away wait is left open.
    expect(s.motionHistory.some((m) => m.unitId === "PA2" && m.purpose === "putaway-blocked-parking")).toBe(true);
    expect(s.timeline.some((t) => t.kind === "PUTAWAY_YIELD_PARKED" && t.unitId === "PA2")).toBe(true);
    expect(s.deliveries[0]?.state).toBe("STORED");
    expect(s.orders.map((o) => o.state)).toEqual(["READY_FOR_DISPATCH", "READY_FOR_DISPATCH"]);
    expect(s.waits.filter((w) => w.reason === "PUTAWAY_NO_LOCATION" && w.endMs === null)).toEqual([]);
    expect(s.units.find((u) => u.unitId === "PA2")?.task).toEqual({ kind: "idle" });
    expect(s.units.find((u) => u.unitId === "PA2")?.carried).toEqual([]);

    // Waiting time excludes the cart's own motion and place handling: no
    // PUTAWAY_NO_LOCATION interval for PA2 overlaps its granted motions or
    // its place-handling spans.
    const pa2Motions = s.motionHistory.filter((m) => m.unitId === "PA2");
    const placeStarts = s.timeline.filter((t) => t.kind === "PUTAWAY_PLACE_STARTED" && t.unitId === "PA2");
    const placeEnds = s.timeline.filter((t) => t.kind === "PUTAWAY_STORED" && t.unitId === "PA2");
    const handling = placeStarts.map((st, i) => ({ startMs: st.timeMs, endMs: placeEnds[i]!.timeMs }));
    for (const w of s.waits.filter((x) => x.unitId === "PA2" && x.reason === "PUTAWAY_NO_LOCATION")) {
      const end = w.endMs ?? s.clockMs;
      for (const m of pa2Motions) {
        expect(w.startMs >= m.endMs || end <= m.startMs).toBe(true);
      }
      for (const h of handling) {
        expect(w.startMs >= h.endMs || end <= h.startMs).toBe(true);
      }
    }
  });

  test("space freeing mid-yield does not retask the cart until it actually parks", () => {
    const scenario = buildScenario({
      id: "putaway-mid-yield",
      locations: [
        { id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock: 5, maxQuantity: 10 },
        { id: "L-A2", approach: { x: 4500, z: 3500 }, productId: "P-A", stock: 10, maxQuantity: 10 },
      ],
      homes: [{ productId: "P-A", locationId: "L-A2" }],
      units: [
        { id: "PA1", role: "putaway", park: { x: 3000, z: 3500 }, capacity: 4 },
        { id: "PA2", role: "putaway", park: { x: 1500, z: 650 }, capacity: 4 },
        { id: "PKA", park: { x: 4500, z: 800 } },
        { id: "PKB", park: { x: 6500, z: 800 } },
      ],
      deliveries: [
        { id: "D1", arrival: 0, lines: [{ productId: "P-A", quantity: 8 }] },
        { id: "D2", arrival: 54500, lines: [{ productId: "P-A", quantity: 1 }] },
      ],
      orders: [{ id: "O1", arrival: 53000, lines: [{ productId: "P-A", quantity: 2 }] }],
    });

    // First pass: learn the yield window from observed events.
    const probe = runToHorizon(scenario);
    expect(probe.s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    const yieldMotion = probe.s.motionHistory.find((m) => m.unitId === "PA2" && m.purpose === "putaway-blocked-parking");
    const pickCommit = probe.s.timeline.find((t) => t.kind === "PICK_COMMITTED" && t.unitId === "PKA");
    const parked = probe.s.timeline.find((t) => t.kind === "PUTAWAY_YIELD_PARKED" && t.unitId === "PA2");
    if (!yieldMotion || !pickCommit || !parked) throw new Error("missing yield/pick/parked events");

    // The pick freed L-A2 strictly inside the yield travel window, and the
    // next store motion for the yielding cart starts no earlier than the
    // actual parking arrival.
    expect(pickCommit.timeMs).toBeGreaterThan(yieldMotion.startMs);
    expect(pickCommit.timeMs).toBeLessThan(yieldMotion.endMs);
    expect(parked.timeMs).toBe(yieldMotion.endMs);
    const nextStore = probe.s.motionHistory.find(
      (m) => m.unitId === "PA2" && m.purpose.startsWith("putaway-store:") && m.startMs >= yieldMotion.startMs,
    );
    if (!nextStore) throw new Error("missing post-yield store motion");
    expect(nextStore.startMs).toBeGreaterThanOrEqual(parked.timeMs);

    // A dispatch genuinely ran during the yield window (another cart's
    // receiving arrival), at a moment when L-A2 was already freed.
    const dispatchDuring = probe.s.timeline.find(
      (t) => t.kind === "PUTAWAY_AT_RECEIVING" && t.unitId === "PA1" && t.timeMs > pickCommit.timeMs && t.timeMs < parked.timeMs,
    );
    if (!dispatchDuring) throw new Error("no dispatch landed inside the yield window");

    // Second pass: freeze the clock inside the yield window, after that
    // dispatch. The yielding cart must still be in its coupled yield task
    // and physically moving — not retasked to store early.
    const c2 = createOperationsController({ scenario, executionConfig: EXEC });
    c2.advanceTo(dispatchDuring.timeMs);
    const mid = c2.snapshot();
    const pa2Mid = mid.units.find((u) => u.unitId === "PA2");
    expect(pa2Mid?.task).toEqual({ kind: "yield-to-parking", deliveryId: "D1" });
    expect(pa2Mid?.transportState).toBe("moving");
    expect(storageQty(mid, "L-A2")).toBe(8);
    expect(mid.checks).toEqual({ conservation: [], capacity: [], safety: [] });

    // Resuming the same run still places stock and never goes invalid.
    c2.advanceTo(300_000);
    const done = c2.snapshot();
    expect(done.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    expect(c2.getDiagnostic()).toBeNull();
    expect(timelineQtySum(done, "PUTAWAY_STORED", "PA2")).toBeGreaterThanOrEqual(1);
  });
});
