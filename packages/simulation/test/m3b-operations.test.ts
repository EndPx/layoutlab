// M3b connected picking/packing slice: focused headless tests over the
// operations controller. Includes the independent hand-derived micro oracle
// (all expected timestamps are literals computed by hand below, never via
// travelTimeMs or the controller under test), stock/role/capacity/queue/
// output/unreachable gates, determinism (one-shot vs chunked vs speeds,
// reset, mid-horizon), and the 6-order main-geometry burst run.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  createOperationsController,
  parseOperationsScenario,
  type OperationsScenario,
} from "../src/index.js";

const MAIN_FIXTURE = "../../fixtures/operations/main-warehouse.json";
const BURST_FIXTURE = "../../fixtures/operations/picking-packing-burst.json";
const BURST_RUNCONFIG =
  "../../fixtures/operations/picking-packing-burst.runconfig.json";

type M3bMicroOpts = {
  id?: string;
  room?: { widthMm: number; depthMm: number };
  racks?: { id: string; x: number; z: number }[];
  obstacles?: { id: string; minX: number; minZ: number; maxX: number; maxZ: number }[];
  products?: { id: string; handlingClass?: string; costUnits?: number }[];
  locations?: {
    id: string;
    approach: { x: number; z: number };
    productId: string;
    stock: number;
    maxQuantity?: number;
  }[];
  homes?: { productId: string; locationId: string }[];
  units?: {
    id: string;
    role?: "picker" | "putaway";
    park: { x: number; z: number };
    speed?: number;
    capacity?: number;
    classes?: string[];
  }[];
  packing?: {
    id: string;
    service: { id: string; x: number; z: number }[];
    queue: { id: string; x: number; z: number }[];
    durationMs: number;
    inputCap: number;
    outputCap: number;
    cap?: number;
  }[];
  orders?: { id: string; arrival: number; lines: { productId: string; quantity: number }[] }[];
  run?: { mode: "fixed-window"; horizonMs: number } | { mode: "finite-cohort"; cutoffMs: number };
  seed?: string;
};

function m3bScenario(opts: M3bMicroOpts): OperationsScenario {
  const room = opts.room ?? { widthMm: 6000, depthMm: 4000 };
  const racks = opts.racks ?? [{ id: "R-FAR", x: room.widthMm - 500, z: 500 }];
  const products = opts.products ?? [{ id: "P-A" }];
  const locations = opts.locations ?? [
    { id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock: 2 },
  ];
  const homes =
    opts.homes ??
    products.map((p, i) => ({
      productId: p.id,
      locationId: (locations[i % locations.length] as { id: string }).id,
    }));
  const units = opts.units ?? [{ id: "U1", park: { x: 1000, z: 2000 } }];
  const packing = opts.packing ?? [
    {
      id: "PACK-1",
      service: [{ id: "S1", x: 5200, z: 2000 }],
      queue: [{ id: "Q1", x: 4200, z: 2000 }],
      durationMs: 1000,
      inputCap: 10,
      outputCap: 10,
    },
  ];
  const orders = opts.orders ?? [];
  const maxArrival = orders.reduce((n, o) => Math.max(n, o.arrival), 0);
  const run = opts.run
    ? opts.run.mode === "fixed-window"
      ? { mode: "fixed-window" as const, horizonMs: opts.run.horizonMs }
      : { mode: "finite-cohort" as const, arrivalCutoffMs: opts.run.cutoffMs }
    : { mode: "finite-cohort" as const, arrivalCutoffMs: maxArrival };
  return parseOperationsScenario({
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: opts.id ?? "m3b-micro",
    provenance: {
      category: "synthetic",
      description: "M3b micro operations fixture; synthetic, uncalibrated.",
      sourceUrls: [],
      assumptions: ["synthetic micro geometry for connected-slice tests"],
      inventedFields: ["all coordinates"],
    },
    seed: opts.seed ?? "m3b-test-001",
    units: { quantityUnit: "item", capacityUnit: "handling-unit" },
    geometry: {
      room,
      racks: racks.map((r) => ({
        id: r.id,
        positionMm: { x: r.x, z: r.z },
        dimensionsMm: { width: 200, depth: 200, height: 1000 },
      })),
      obstacles: (opts.obstacles ?? []).map((o) => ({
        id: o.id,
        minXMm: o.minX,
        minZMm: o.minZ,
        maxXMm: o.maxX,
        maxZMm: o.maxZ,
      })),
    },
    products: products.map((p) => ({
      id: p.id,
      label: `Micro ${p.id}`,
      itemDimensionsMm: { width: 100, depth: 100, height: 100 },
      handlingClass: p.handlingClass ?? "ambient",
      capacityCostUnits: p.costUnits ?? 1,
    })),
    locations: locations.map((l) => ({
      id: l.id,
      rackId: racks[0]?.id ?? "R-FAR",
      storageAnchorMm: { x: 1000, y: 500, z: 1000 },
      approachPointMm: { ...l.approach },
      usableDimensionsMm: { width: 500, depth: 400, height: 400 },
      storageClass: "ambient",
      maxQuantity: l.maxQuantity ?? Math.max(10, l.stock),
      restrictions: { eligibleHandlingClasses: ["ambient"] },
    })),
    initialStock: locations
      .filter((l) => l.stock > 0)
      .map((l) => ({
        locationId: l.id,
        productId: l.productId,
        quantity: l.stock,
      })),
    homeAssignments: homes,
    mobileUnits: units.map((u) => ({
      id: u.id,
      role: u.role ?? "picker",
      footprintMm: { width: 600, length: 800, margin: 100 },
      speedMmPerSecond: u.speed ?? 1000,
      loadCapacityUnits: u.capacity ?? 20,
      eligibleHandlingClasses: u.classes ?? ["ambient"],
      parkingSlotMm: { ...u.park },
    })),
    resources: packing.map((p) => ({
      id: p.id,
      kind: "packing",
      servicePositions: p.service.map((s) => ({ ...s })),
      queueSlots: p.queue.map((q) => ({ ...q })),
      serviceCapacity: p.cap ?? 1,
      inputStagingCapacity: p.inputCap,
      outputStagingCapacity: p.outputCap,
      serviceDurationMs: p.durationMs,
    })),
    orderSchedule: orders.map((o) => ({
      id: o.id,
      arrivalTimeMs: o.arrival,
      lines: o.lines.map((l) => ({ ...l })),
    })),
    deliverySchedule: [],
    policies: {
      reservePolicy: "full-order-all-or-none",
      run,
      eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
    },
  });
}

const EXEC = { pickDurationMsPerItem: 500, unloadDurationMsPerItem: 400 };

// Hand derivation for the oracle below (checked by hand, asserted as
// literals; no helper under test is used to compute expectations).
// Geometry (all corridors axis-aligned on z=2000 in an empty room, so every
// route is the straight segment; durations are ceil(mm*1000/1000) = mm):
//   park (1000,2000) -> approach (3000,2000): 2000mm = 2000ms
//   approach -> Q1 (4200,2000): 1200mm = 1200ms
//   Q1 -> S1 (5200,2000): 1000mm = 1000ms
//   S1 -> approach: 2200mm = 2200ms
// Handling: pick 1 item x 500 = 500ms; unload 1 item x 400 = 400ms.
// Packing: single lane, 1000ms service.
// O1: arrive 0, reserve, U1 assigned, move [0,2000]; pick [2000,2500];
//   enqueue pack-0 @2500 (Q1); move [2500,3700]; arrive Q1 3700 (head, lane
//   free); move [3700,4700]; arrive S1 4700; unload [4700,5100]; start 5100
//   (queue wait 5100-2500 = 2600); pack [5100,6100]; READY 6100.
//   U1 reuses to O2 @5100: move [5100,7300].
// O2: assigned @5100; arrive approach 7300; pick [7300,7800]; enqueue
//   pack-1 @7800 (Q1 free: pack-0 started @5100); move [7800,9000]; arrive
//   Q1 9000 (head, lane free: pack-0 released @6100); move [9000,10000];
//   arrive S1 10000; unload [10000,10400]; start 10400 (wait 10400-7800 =
//   2600, from ITS physical arrival, not O1's grant); pack [10400,11400];
//   READY 11400.
function oracleScenario(): OperationsScenario {
  return m3bScenario({
    id: "m3b-oracle",
    orders: [
      { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
      { id: "O2", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
    ],
    run: { mode: "finite-cohort", cutoffMs: 0 },
  });
}

describe("M3b gate 2: hand-derived micro oracle", () => {
  test("two sequential orders pack from physical arrivals with FIFO waits", () => {
    const c = createOperationsController({
      scenario: oracleScenario(),
      executionConfig: EXEC,
    });
    // Intermediate A @2000: arrival processed, pick handling scheduled for
    // 2500 but NOT committed: stored stock intact, nothing carried.
    c.advanceTo(2000);
    let s = c.snapshot();
    expect(
      s.inventory.storage.find((r) => r.locationId === "L-A1")?.quantity,
    ).toBe(2);
    expect(s.units.find((u) => u.unitId === "U1")?.carried).toEqual([]);
    expect(
      s.orders.find((o) => o.orderId === "O1")?.reservation,
    ).toEqual([{ productId: "P-A", locationId: "L-A1", quantity: 1 }]);
    // Intermediate B @4700: pick committed, unload handling scheduled for
    // 5100 but NOT committed: carried load held, no packing input staged.
    c.advanceTo(4700);
    s = c.snapshot();
    expect(s.units.find((u) => u.unitId === "U1")?.carried).toEqual([
      { productId: "P-A", quantity: 1 },
    ]);
    expect(s.inventory.packing).toEqual([]);
    expect(s.orders.find((o) => o.orderId === "O1")?.state).toBe(
      "WAITING_FOR_PACKING",
    );
    // Intermediate C @6000: unload committed and service started @5100, pack
    // completes @6100: staged input present, no packed goods yet.
    c.advanceTo(6000);
    s = c.snapshot();
    expect(s.inventory.packing).toEqual([
      { resourceId: "PACK-1", orderId: "O1", productId: "P-A", quantity: 1 },
    ]);
    expect(s.inventory.packed).toEqual([]);
    expect(s.orders.find((o) => o.orderId === "O1")?.state).toBe("PACKING");
    // Full run: hand-derived literals.
    c.advanceTo(20000);
    s = c.snapshot();
    const o1 = s.orders.find((o) => o.orderId === "O1");
    const o2 = s.orders.find((o) => o.orderId === "O2");
    expect(o1?.state).toBe("READY_FOR_DISPATCH");
    expect(o2?.state).toBe("READY_FOR_DISPATCH");
    expect(o1?.timestamps).toEqual({
      CREATED: 0,
      READY_FOR_PICKING: 0,
      PICKING: 0,
      WAITING_FOR_PACKING: 2500,
      PACKING: 5100,
      READY_FOR_DISPATCH: 6100,
    });
    expect(o2?.timestamps).toEqual({
      CREATED: 0,
      READY_FOR_PICKING: 0,
      PICKING: 5100,
      WAITING_FOR_PACKING: 7800,
      PACKING: 10400,
      READY_FOR_DISPATCH: 11400,
    });
    // FIFO pack starts from physical arrivals: O1 4700 + 400 unload = 5100;
    // O2 10000 + 400 unload = 10400 (not O1's grant time). Queue waits are
    // start minus original enqueue: 2600 each.
    const jobs = s.packing.find((p) => p.resourceId === "PACK-1")?.jobs ?? [];
    expect(jobs.map((j) => [j.jobId, j.startTimeMs, j.finishTimeMs, j.waitMs])).toEqual([
      ["pack-0", 5100, 6100, 2600],
      ["pack-1", 10400, 11400, 2600],
    ]);
    // Output staging is finite and attributed; nothing shipped.
    expect(
      s.packing.find((p) => p.resourceId === "PACK-1")?.packedOutput,
    ).toEqual([
      { orderId: "O1", costUnits: 1 },
      { orderId: "O2", costUnits: 1 },
    ]);
    expect(s.counts).toEqual({
      selected: 2,
      excluded: 0,
      arrived: 2,
      packed: 2,
      readyForDispatch: 2,
      shipped: 0,
      backlog: 2,
      stageBacklog: 0,
    });
    expect(s.inventory.dispatched).toEqual([]);
    expect(s.timeline.some((t) => t.kind === "SHIPPED")).toBe(false);
    // Exactly one pick + one unload + one pack transfer per order: no event
    // committed its transfer twice, even after advancing far past the end.
    expect(s.inventory.transfers).toHaveLength(6);
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    const completion = c.getCompletionStatus();
    expect(completion.stage).toBe("SUPPORTED_STAGE_COMPLETE");
    expect(completion).toMatchObject({ ready: 2, selected: 2, shipped: 0 });
    // Picker vacated the service position under transport and parked.
    const u1 = s.units.find((u) => u.unitId === "U1");
    expect(u1?.pose).toEqual({ x: 1000, z: 2000 });
    expect(u1?.task).toEqual({ kind: "idle" });
    expect(c.getDiagnostic()).toBeNull();
  });
});

describe("M3b gate 3: stock, role, capacity, queue, output, reachability", () => {
  test("stock-short order waits with zero reservation and untouched stock", () => {
    const c = createOperationsController({
      scenario: m3bScenario({
        id: "m3b-short",
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 5 }] },
        ],
      }),
      executionConfig: EXEC,
    });
    c.advanceTo(60000);
    const s = c.snapshot();
    const o1 = s.orders.find((o) => o.orderId === "O1");
    expect(o1?.state).toBe("WAITING_FOR_STOCK");
    expect(o1?.reservation).toEqual([]);
    expect(o1?.diagnostic?.terminal ?? false).toBe(false);
    // Stored stock is byte-identical to the initial 2: nothing reserved,
    // nothing picked, nothing carried.
    expect(
      s.inventory.storage.find((r) => r.locationId === "L-A1")?.quantity,
    ).toBe(2);
    expect(s.inventory.reservations).toEqual([]);
    expect(s.units.find((u) => u.unitId === "U1")?.carried).toEqual([]);
    expect(s.counts).toMatchObject({
      arrived: 1,
      readyForDispatch: 0,
      shipped: 0,
      backlog: 1,
      stageBacklog: 1,
    });
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    // No future input exists, so the order stays waiting with a bounded
    // diagnostic: never completed, never zero-distance travelled.
    expect(c.getCompletionStatus().stage).toBe("IN_PROGRESS");
    expect(
      s.timeline.filter((t) => t.kind === "PICK_COMMITTED"),
    ).toHaveLength(0);
    expect(s.units.find((u) => u.unitId === "U1")?.pose).toEqual({
      x: 1000,
      z: 2000,
    });
  });

  test("putaway-only fleet rejects picking upfront without touching stock", () => {
    const c = createOperationsController({
      scenario: m3bScenario({
        id: "m3b-role",
        units: [{ id: "PA-1", role: "putaway", park: { x: 1000, z: 2000 } }],
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
        ],
      }),
      executionConfig: EXEC,
    });
    c.advanceTo(60000);
    const s = c.snapshot();
    const o1 = s.orders.find((o) => o.orderId === "O1");
    expect(o1?.diagnostic).toMatchObject({
      code: "NO_ELIGIBLE_PICKER",
      terminal: true,
    });
    expect(o1?.reservation).toEqual([]);
    expect(
      s.inventory.storage.find((r) => r.locationId === "L-A1")?.quantity,
    ).toBe(2);
    expect(c.getCompletionStatus()).toMatchObject({ stage: "BLOCKED" });
  });

  test("oversize order is rejected upfront for single-trip with backlog note", () => {
    const c = createOperationsController({
      scenario: m3bScenario({
        id: "m3b-oversize",
        units: [
          { id: "U1", park: { x: 1000, z: 2000 }, capacity: 2 },
        ],
        locations: [
          { id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock: 10 },
        ],
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 5 }] },
        ],
      }),
      executionConfig: EXEC,
    });
    c.advanceTo(60000);
    const s = c.snapshot();
    const o1 = s.orders.find((o) => o.orderId === "O1");
    expect(o1?.diagnostic?.code).toBe("UNSUPPORTED_SINGLE_TRIP_REQUIRED");
    expect(o1?.diagnostic?.terminal).toBe(true);
    expect(o1?.diagnostic?.message).toMatch(/split-trip.*v3 backlog/);
    expect(o1?.reservation).toEqual([]);
    expect(
      s.inventory.storage.find((r) => r.locationId === "L-A1")?.quantity,
    ).toBe(10);
    expect(s.units.find((u) => u.unitId === "U1")?.carried).toEqual([]);
  });

  test("second job meets a full queue, holds its load, then recovers", () => {
    // One queue slot, two pickers: whoever enqueues second deterministically
    // meets QUEUE_FULL (the first job leaves the queue only at service
    // start, after travel plus unload). The holder keeps its load at a
    // valid position; both orders still finish with no loss.
    const c = createOperationsController({
      scenario: m3bScenario({
        id: "m3b-queuefull",
        room: { widthMm: 9000, depthMm: 7000 },
        racks: [{ id: "R-FAR", x: 8500, z: 500 }],
        products: [{ id: "P-A" }, { id: "P-B" }],
        locations: [
          { id: "L-A1", approach: { x: 3000, z: 4000 }, productId: "P-A", stock: 1 },
          { id: "L-B1", approach: { x: 7900, z: 5300 }, productId: "P-B", stock: 1 },
        ],
        units: [
          { id: "U1", park: { x: 1000, z: 1200 } },
          { id: "U2", park: { x: 8300, z: 5300 } },
        ],
        packing: [
          {
            id: "PACK-1",
            service: [{ id: "S1", x: 6500, z: 4500 }],
            queue: [{ id: "Q1", x: 6500, z: 2500 }],
            durationMs: 1000,
            inputCap: 10,
            outputCap: 10,
          },
        ],
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
          { id: "O2", arrival: 0, lines: [{ productId: "P-B", quantity: 1 }] },
        ],
      }),
      executionConfig: EXEC,
    });
    c.advanceTo(60000);
    const s = c.snapshot();
    const full = s.waits.filter((w) => w.reason === "QUEUE_FULL");
    expect(full.length).toBeGreaterThanOrEqual(1);
    for (const w of full) {
      // Every full-queue hold recovered: bounded wait with a real end.
      expect(w.endMs).not.toBeNull();
      expect(w.endMs as number).toBeGreaterThan(w.startMs);
    }
    expect(s.orders.map((o) => o.state)).toEqual([
      "READY_FOR_DISPATCH",
      "READY_FOR_DISPATCH",
    ]);
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    expect(c.getCompletionStatus().stage).toBe("SUPPORTED_STAGE_COMPLETE");
  });

  test("full output holds the lane with packed-pending stock safe", () => {
    // Output staging fits exactly one order: the second pack holds.
    const c = createOperationsController({
      scenario: m3bScenario({
        id: "m3b-output",
        packing: [
          {
            id: "PACK-1",
            service: [{ id: "S1", x: 5200, z: 2000 }],
            queue: [{ id: "Q1", x: 4200, z: 2000 }],
            durationMs: 1000,
            inputCap: 10,
            outputCap: 1,
          },
        ],
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
          { id: "O2", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
        ],
      }),
      executionConfig: EXEC,
    });
    c.advanceTo(60000);
    const s = c.snapshot();
    expect(s.orders.find((o) => o.orderId === "O1")?.state).toBe(
      "READY_FOR_DISPATCH",
    );
    const o2 = s.orders.find((o) => o.orderId === "O2");
    expect(o2?.state).toBe("PACKING");
    expect(o2?.waitReason).toBe("OUTPUT_BLOCKED");
    const job = s.packing
      .find((p) => p.resourceId === "PACK-1")
      ?.jobs.find((j) => j.jobId === "pack-1");
    expect(job?.state).toBe("output-held");
    // O2's staged input is intact and O1 alone is packed: no unbounded
    // packed bucket absorbed the overflow.
    expect(
      s.inventory.packing.filter((r) => r.orderId === "O2"),
    ).toEqual([{ resourceId: "PACK-1", orderId: "O2", productId: "P-A", quantity: 1 }]);
    expect(s.inventory.packed.filter((r) => r.orderId === "O2")).toEqual([]);
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    expect(c.getCompletionStatus()).toMatchObject({
      stage: "IN_PROGRESS",
      ready: 1,
      backlog: 2,
      stageBacklog: 1,
    });
  });

  test("unreachable approach stops that order and frees the picker", () => {
    // L-A1's approach sits inside a wall: static admission rejects the leg.
    // O1 stops with its reservation unpicked; the same picker still serves O2.
    const c = createOperationsController({
      scenario: m3bScenario({
        id: "m3b-unreachable",
        obstacles: [
          { id: "WALL", minX: 2500, maxX: 3500, minZ: 1500, maxZ: 2500 },
        ],
        products: [{ id: "P-A" }, { id: "P-B" }],
        locations: [
          { id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock: 1 },
          { id: "L-B1", approach: { x: 3000, z: 3300 }, productId: "P-B", stock: 1 },
        ],
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
          { id: "O2", arrival: 0, lines: [{ productId: "P-B", quantity: 1 }] },
        ],
      }),
      executionConfig: EXEC,
    });
    c.advanceTo(60000);
    const s = c.snapshot();
    const o1 = s.orders.find((o) => o.orderId === "O1");
    expect(o1?.diagnostic).toMatchObject({
      code: "UNREACHABLE_APPROACH",
      terminal: true,
    });
    // Reserved but never picked: the claim stands, storage untouched.
    expect(o1?.reservation).toEqual([
      { productId: "P-A", locationId: "L-A1", quantity: 1 },
    ]);
    expect(
      s.inventory.storage.find((r) => r.locationId === "L-A1")?.quantity,
    ).toBe(1);
    const o2 = s.orders.find((o) => o.orderId === "O2");
    expect(o2?.state).toBe("READY_FOR_DISPATCH");
    expect(o2?.unitId).toBe("U1");
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    expect(c.getCompletionStatus()).toMatchObject({ stage: "BLOCKED" });
  });
});

describe("M3b gate 4: determinism, reset, horizon", () => {
  test("one-shot vs chunked vs headless speeds agree exactly", () => {
    const one = createOperationsController({
      scenario: oracleScenario(),
      executionConfig: EXEC,
    });
    one.advanceTo(20000);
    const expected = JSON.stringify(one.snapshot());
    for (const chunk of [500, 4000, 1000, 250]) {
      const c = createOperationsController({
        scenario: oracleScenario(),
        executionConfig: EXEC,
      });
      for (let t = chunk; t <= 20000; t += chunk) c.advanceTo(t);
      expect(JSON.stringify(c.snapshot())).toBe(expected);
    }
  });

  test("reset reruns fresh to the identical outcome", () => {
    const c = createOperationsController({
      scenario: oracleScenario(),
      executionConfig: EXEC,
    });
    c.advanceTo(20000);
    const expected = JSON.stringify(c.snapshot());
    c.reset();
    expect(c.getClockMs()).toBe(0);
    expect(c.getCompletionStatus().stage).toBe("IN_PROGRESS");
    c.advanceTo(20000);
    expect(JSON.stringify(c.snapshot())).toBe(expected);
  });

  test("fixed-window horizon stops with work retained, never finished", () => {
    const scenario = m3bScenario({
      id: "m3b-window",
      orders: [
        { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
        { id: "O2", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
      ],
      run: { mode: "fixed-window", horizonMs: 3000 },
    });
    const c = createOperationsController({ scenario, executionConfig: EXEC });
    c.advanceTo(3000);
    const s = c.snapshot();
    expect(s.clockMs).toBe(3000);
    // Active orders and backlog are not counted finished at mid-horizon.
    expect(s.counts).toMatchObject({
      arrived: 2,
      readyForDispatch: 0,
      shipped: 0,
      backlog: 2,
      stageBacklog: 2,
    });
    // Partial motion is retained: U1 is mid-leg toward Q1 [2500,3700].
    expect(s.units.find((u) => u.unitId === "U1")?.transportState).toBe(
      "moving",
    );
    const completion = c.getCompletionStatus();
    expect(completion.stage).toBe("WINDOW_ENDED");
    expect(completion.stage).not.toBe("SUPPORTED_STAGE_COMPLETE");
  });
});

describe("M3b config and capability gates", () => {
  test("execution config is strictly validated", () => {
    const scenario = oracleScenario();
    expect(() =>
      createOperationsController({ scenario, executionConfig: {} }),
    ).toThrow();
    expect(() =>
      createOperationsController({
        scenario,
        executionConfig: { ...EXEC, extra: 1 },
      }),
    ).toThrow();
    expect(() =>
      createOperationsController({
        scenario,
        executionConfig: { ...EXEC, pickDurationMsPerItem: 0 },
      }),
    ).toThrow();
  });

  test("nonempty deliveries are an explicit unsupported capability", () => {
    const main = parseOperationsScenario(
      JSON.parse(readFileSync(MAIN_FIXTURE, "utf8")),
    );
    expect(main.deliverySchedule.length).toBeGreaterThan(0);
    expect(() =>
      createOperationsController({ scenario: main, executionConfig: EXEC }),
    ).toThrow(/UNSUPPORTED_DELIVERIES/);
  });
});

describe("M3c dispatch: packed orders ship through DSP-1", () => {
  test("six burst orders ship end-to-end with dispatched stock conserved", () => {
    const scenario = parseOperationsScenario(
      JSON.parse(readFileSync(BURST_FIXTURE, "utf8")),
    );
    const runconfig = JSON.parse(readFileSync(BURST_RUNCONFIG, "utf8"));
    const c = createOperationsController({
      scenario,
      executionConfig: runconfig.executionConfig,
    });
    const CAP = 3_600_000;
    let status = c.getCompletionStatus();
    let guard = 0;
    while (status.stage === "IN_PROGRESS" && guard < 120) {
      c.advanceTo(Math.min(c.getClockMs() + 60_000, CAP));
      status = c.getCompletionStatus();
      guard += 1;
    }
    expect(status.stage).toBe("SUPPORTED_STAGE_COMPLETE");
    expect(status).toMatchObject({ shipped: 6, backlog: 0, stageBacklog: 0 });
    const s = c.snapshot();
    expect(s.orders.map((o) => o.state)).toEqual([
      "SHIPPED",
      "SHIPPED",
      "SHIPPED",
      "SHIPPED",
      "SHIPPED",
      "SHIPPED",
    ]);
    expect(s.counts).toMatchObject({
      selected: 6,
      arrived: 6,
      packed: 6,
      readyForDispatch: 0,
      shipped: 6,
      backlog: 0,
      stageBacklog: 0,
    });
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    // Dispatched bucket holds exactly the ordered quantities per order.
    for (const o of s.orders) {
      for (const line of o.lines) {
        const row = s.inventory.dispatched.find(
          (d) => d.orderId === o.orderId && d.productId === line.productId,
        );
        expect(row?.quantity).toBe(line.quantity);
      }
      expect(o.timestamps.READY_FOR_DISPATCH).toBeTypeOf("number");
      expect(o.timestamps.SHIPPED).toBeGreaterThan(
        o.timestamps.READY_FOR_DISPATCH as number,
      );
    }
    // Single dispatch lane (serviceCapacity 1, 60000ms): SHIPPED times are
    // strictly ordered with at least one service duration between neighbors.
    const shippedTimes = s.orders
      .map((o) => o.timestamps.SHIPPED as number)
      .sort((a, b) => a - b);
    for (let i = 1; i < shippedTimes.length; i++) {
      expect(shippedTimes[i]! - shippedTimes[i - 1]!).toBeGreaterThanOrEqual(60_000);
    }
    expect(s.timeline.some((t) => t.kind === "SHIPPED")).toBe(true);
  });
});

describe("M3b gate 1: main-geometry picking/packing burst", () => {
  test(
    "six burst orders reach READY_FOR_DISPATCH with waits and clean checks",
    () => {
      const scenario = parseOperationsScenario(
        JSON.parse(readFileSync(BURST_FIXTURE, "utf8")),
      );
      const runconfig = JSON.parse(readFileSync(BURST_RUNCONFIG, "utf8"));
      const c = createOperationsController({
        scenario,
        executionConfig: runconfig.executionConfig,
      });
      const CAP = 3_600_000;
      let status = c.getCompletionStatus();
      let guard = 0;
      while (status.stage === "IN_PROGRESS" && guard < 120) {
        c.advanceTo(Math.min(c.getClockMs() + 60_000, CAP));
        status = c.getCompletionStatus();
        guard += 1;
      }
      expect(status.stage).toBe("SUPPORTED_STAGE_COMPLETE");
      expect(status).toMatchObject({ selected: 6, shipped: 6, backlog: 0 });
      const s = c.snapshot();
      expect(s.orders.map((o) => o.state)).toEqual([
        "SHIPPED",
        "SHIPPED",
        "SHIPPED",
        "SHIPPED",
        "SHIPPED",
        "SHIPPED",
      ]);
      expect(s.counts).toMatchObject({
        selected: 6,
        arrived: 6,
        packed: 6,
        readyForDispatch: 0,
        shipped: 6,
        backlog: 0,
        stageBacklog: 0,
      });
      // Computed-from-state checks, never pass cards.
      expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
      // At least two agents moved concurrently (observed, not asserted).
      expect(s.maxConcurrentMoving.count).toBeGreaterThanOrEqual(2);
      // Both packing stations served orders as configured one lane each.
      const stations = new Set(
        s.orders.map((o) => o.packingResourceId).filter(Boolean),
      );
      expect(stations).toEqual(new Set(["PACK-1", "PACK-2"]));
      for (const p of s.packing) {
        expect(p.serviceCapacity).toBe(1);
      }
      // At least two declared pickers operated; putaway units stayed idle
      // at their occupied parking with empty loads.
      const operators = new Set(
        s.timeline.filter((t) => t.unitId?.startsWith("PK-")).map((t) => t.unitId),
      );
      expect(operators.size).toBeGreaterThanOrEqual(2);
      for (const id of ["PA-1", "PA-2"]) {
        const u = s.units.find((x) => x.unitId === id);
        expect(u?.task).toEqual({ kind: "idle" });
        expect(u?.carried).toEqual([]);
      }
      expect(s.units.find((u) => u.unitId === "PA-1")?.pose).toEqual({
        x: 15000,
        z: 1200,
      });
      expect(s.units.find((u) => u.unitId === "PA-2")?.pose).toEqual({
        x: 18000,
        z: 1200,
      });
      // At least one real packing queue wait attributed to a busy station,
      // with a genuine positive duration.
      const queueWaits = s.waits.filter(
        (w) =>
          w.reason === "BUSY_STATION" ||
          w.reason === "QUEUE_FULL" ||
          w.reason === "QUEUED_BEHIND_HEAD",
      );
      expect(queueWaits.length).toBeGreaterThanOrEqual(1);
      expect(
        queueWaits.some(
          (w) => w.endMs !== null && (w.endMs as number) > w.startMs,
        ),
      ).toBe(true);
      // Every physical commit was preceded by its actual arrival: picks by
      // leg arrivals, unloads by service arrivals.
      const before = (kind: string, orderId: string): number =>
        s.timeline.find((t) => t.kind === kind && t.orderId === orderId)
          ?.timeMs ?? Number.POSITIVE_INFINITY;
      for (const o of s.orders) {
        const picks = s.timeline.filter(
          (t) => t.kind === "PICK_COMMITTED" && t.orderId === o.orderId,
        );
        expect(picks.length).toBeGreaterThanOrEqual(1);
        for (const p of picks) {
          expect(
            s.timeline.some(
              (t) =>
                t.kind === "LEG_ARRIVED" &&
                t.orderId === o.orderId &&
                t.timeMs <= p.timeMs,
            ),
          ).toBe(true);
        }
        const unload = before("UNLOAD_COMMITTED", o.orderId);
        const serviceArrival = before("SERVICE_ARRIVED", o.orderId);
        expect(unload).toBeGreaterThanOrEqual(serviceArrival);
      }
      // Dispatch shipped every order: dispatched stock is attributed per
      // order and every order passed through READY_FOR_DISPATCH first.
      expect(s.inventory.dispatched.length).toBeGreaterThanOrEqual(6);
      expect(s.timeline.some((t) => t.kind === "SHIPPED")).toBe(true);
      for (const o of s.orders) {
        expect(o.timestamps.READY_FOR_DISPATCH).toBeTypeOf("number");
      }
      expect(c.getDiagnostic()).toBeNull();
    },
    120000,
  );
});

function runBurstToCompletion() {
  const scenario = parseOperationsScenario(
    JSON.parse(readFileSync(BURST_FIXTURE, "utf8")),
  );
  const runconfig = JSON.parse(readFileSync(BURST_RUNCONFIG, "utf8"));
  const c = createOperationsController({
    scenario,
    executionConfig: runconfig.executionConfig,
  });
  const CAP = 3_600_000;
  let status = c.getCompletionStatus();
  let guard = 0;
  while (status.stage === "IN_PROGRESS" && guard < 120) {
    c.advanceTo(Math.min(c.getClockMs() + 60_000, CAP));
    status = c.getCompletionStatus();
    guard += 1;
  }
  return c;
}

// Codex independent-micro geometry: park (1000,2500), approach (3000,2500),
// queue (5000,2500), service (6500,2500) at 1000mm/s. Hand-derived literals:
// approach 2000, pick 2500, service arrival 6000, unload/pack start 6400,
// pack finish 7400. Queue leg 2000+1500 equals the direct 3500, so the
// zero-queue direct handoff must hit the same schedule.
function codexMicroScenario(
  queue: { id: string; x: number; z: number }[],
): OperationsScenario {
  return m3bScenario({
    id: "m3b-codex-micro",
    room: { widthMm: 10000, depthMm: 6000 },
    racks: [{ id: "R1", x: 3000, z: 1000 }],
    obstacles: [
      { id: "TABLE", minX: 6000, minZ: 500, maxX: 7000, maxZ: 1300 },
    ],
    products: [{ id: "P01" }],
    locations: [
      { id: "L01", approach: { x: 3000, z: 2500 }, productId: "P01", stock: 1 },
    ],
    units: [{ id: "U1", park: { x: 1000, z: 2500 }, speed: 1000 }],
    packing: [
      {
        id: "PACK",
        service: [{ id: "S", x: 6500, z: 2500 }],
        queue,
        durationMs: 1000,
        inputCap: 10,
        outputCap: 10,
      },
    ],
    orders: [{ id: "O", arrival: 0, lines: [{ productId: "P01", quantity: 1 }] }],
    run: { mode: "finite-cohort", cutoffMs: 0 },
  });
}

describe("M3b review revision: independent findings 1-6", () => {
  test("finding 1: fixed window never executes past the horizon on either path", () => {
    const mk = () =>
      m3bScenario({
        id: "m3b-window-cap",
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
        ],
        run: { mode: "fixed-window", horizonMs: 3000 },
      });
    // Oversized advance stops exactly at the horizon with work retained.
    const c = createOperationsController({ scenario: mk(), executionConfig: EXEC });
    c.advanceTo(20000);
    expect(c.getClockMs()).toBe(3000);
    const s = c.snapshot();
    expect(s.orders.find((o) => o.orderId === "O1")?.state).toBe(
      "WAITING_FOR_PACKING",
    );
    expect(s.inventory.packed).toEqual([]);
    expect(s.units.find((u) => u.unitId === "U1")?.transportState).toBe(
      "moving",
    );
    expect(c.getCompletionStatus().stage).toBe("WINDOW_ENDED");
    // Oversized chunks vs at-horizon advance are byte-identical.
    const d = createOperationsController({ scenario: mk(), executionConfig: EXEC });
    d.advanceTo(3000);
    expect(JSON.stringify(c.snapshot())).toBe(JSON.stringify(d.snapshot()));
    // Repeated calls past the window do not progress.
    c.advanceTo(20000);
    c.advanceTo(20000);
    expect(c.getClockMs()).toBe(3000);
    expect(JSON.stringify(c.snapshot())).toBe(JSON.stringify(d.snapshot()));
  });

  test("finding 1: stepEvent stops at the horizon without processing beyond-window work", () => {
    const mk = () =>
      m3bScenario({
        id: "m3b-window-step",
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
        ],
        run: { mode: "fixed-window", horizonMs: 3000 },
      });
    const c = createOperationsController({ scenario: mk(), executionConfig: EXEC });
    let guard = 0;
    while (c.getClockMs() < 3000 && guard < 50) {
      c.stepEvent();
      guard += 1;
    }
    expect(c.getClockMs()).toBe(3000);
    const before = JSON.stringify(c.snapshot());
    // The next event lies beyond the window: stepping neither processes it
    // nor moves the clock.
    const r = c.stepEvent();
    expect(c.getClockMs()).toBe(3000);
    expect(r.eventId).toBeNull();
    expect(JSON.stringify(c.snapshot())).toBe(before);
    // Matches the at-horizon advance exactly.
    const d = createOperationsController({ scenario: mk(), executionConfig: EXEC });
    d.advanceTo(3000);
    expect(before).toBe(JSON.stringify(d.snapshot()));
  });

  test("finding 2: backlog counts unshipped orders, stageBacklog the packing stage", () => {
    const c = createOperationsController({
      scenario: oracleScenario(),
      executionConfig: EXEC,
    });
    c.advanceTo(6000);
    expect(c.snapshot().counts).toMatchObject({
      arrived: 2,
      readyForDispatch: 0,
      shipped: 0,
      backlog: 2,
      stageBacklog: 2,
    });
    c.advanceTo(6100);
    expect(c.snapshot().counts).toMatchObject({
      arrived: 2,
      readyForDispatch: 1,
      shipped: 0,
      backlog: 2,
      stageBacklog: 1,
    });
    const mid = c.getCompletionStatus();
    expect(mid.stage).toBe("IN_PROGRESS");
    if (mid.stage === "IN_PROGRESS") {
      expect(mid.backlog).toBe(2);
      expect(mid.stageBacklog).toBe(1);
    }
    c.advanceTo(20000);
    const done = c.getCompletionStatus();
    expect(done.stage).toBe("SUPPORTED_STAGE_COMPLETE");
    if (done.stage === "SUPPORTED_STAGE_COMPLETE") {
      expect(done).toMatchObject({
        ready: 2,
        selected: 2,
        shipped: 0,
        backlog: 2,
        stageBacklog: 0,
      });
    }
  });

  test("finding 3: caller mutation cannot alter the accepted run or reset", () => {
    const mk = () =>
      m3bScenario({
        id: "m3b-immutable",
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
        ],
      });
    const raw = mk();
    const exec = { ...EXEC };
    const c = createOperationsController({ scenario: raw, executionConfig: exec });
    raw.id = "MUTATED";
    raw.mobileUnits[0]!.role = "putaway";
    raw.initialStock[0]!.quantity = 99;
    exec.pickDurationMsPerItem = 1;
    c.advanceTo(20000);
    const s = c.snapshot();
    expect(s.scenarioId).toBe("m3b-immutable");
    expect(s.executionConfig).toEqual(EXEC);
    expect(s.orders.find((o) => o.orderId === "O1")?.diagnostic).toBeNull();
    expect(s.orders.find((o) => o.orderId === "O1")?.state).toBe(
      "READY_FOR_DISPATCH",
    );
    expect(
      s.orders.find((o) => o.orderId === "O1")?.timestamps?.READY_FOR_DISPATCH,
    ).toBe(6100);
    // Returned snapshots are frozen views: mutating one cannot touch the run.
    expect(Object.isFrozen(s)).toBe(true);
    try {
      (s.orders[0] as { state: string }).state = "CREATED";
    } catch {
      // frozen: assignment throws in strict mode
    }
    expect(
      c.snapshot().orders.find((o) => o.orderId === "O1")?.state,
    ).toBe("READY_FOR_DISPATCH");
    // Reset repeats the original frozen inputs with the identical outcome.
    c.reset();
    expect(c.getClockMs()).toBe(0);
    c.advanceTo(20000);
    const r = c.snapshot();
    expect(r.scenarioId).toBe("m3b-immutable");
    expect(JSON.stringify(r)).toBe(JSON.stringify(s));
    // A fresh controller from pristine inputs agrees byte-for-byte.
    const fresh = createOperationsController({
      scenario: mk(),
      executionConfig: EXEC,
    });
    fresh.advanceTo(20000);
    expect(JSON.stringify(fresh.snapshot())).toBe(JSON.stringify(s));
  });

  test("positive oracle preserved: independent one-job 2000/2500/6000/6400/7400", () => {
    const c = createOperationsController({
      scenario: codexMicroScenario([{ id: "Q", x: 5000, z: 2500 }]),
      executionConfig: EXEC,
    });
    const phases: Record<string, object> = {};
    for (const time of [2000, 2499, 2500, 6000, 6399, 6400, 7399, 7400]) {
      c.advanceTo(time);
      const s = c.snapshot();
      phases[time] = {
        storage: s.inventory.storage[0]?.quantity,
        carried: s.units[0]?.carried.reduce((a, x) => a + x.quantity, 0),
        staged: s.inventory.packing.reduce((a, x) => a + x.quantity, 0),
        packed: s.inventory.packed.reduce((a, x) => a + x.quantity, 0),
      };
    }
    expect(phases).toEqual({
      2000: { storage: 1, carried: 0, staged: 0, packed: 0 },
      2499: { storage: 1, carried: 0, staged: 0, packed: 0 },
      2500: { storage: 0, carried: 1, staged: 0, packed: 0 },
      6000: { storage: 0, carried: 1, staged: 0, packed: 0 },
      6399: { storage: 0, carried: 1, staged: 0, packed: 0 },
      6400: { storage: 0, carried: 0, staged: 1, packed: 0 },
      7399: { storage: 0, carried: 0, staged: 1, packed: 0 },
      7400: { storage: 0, carried: 0, staged: 0, packed: 1 },
    });
    const s = c.snapshot();
    expect(s.orders[0]?.timestamps).toEqual({
      CREATED: 0,
      READY_FOR_PICKING: 0,
      PICKING: 0,
      WAITING_FOR_PACKING: 2500,
      PACKING: 6400,
      READY_FOR_DISPATCH: 7400,
    });
    expect(s.counts).toMatchObject({
      arrived: 1,
      readyForDispatch: 1,
      shipped: 0,
      backlog: 1,
      stageBacklog: 0,
    });
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
  });

  test("finding 4: zero-queue direct service packs on the same 7400ms schedule", () => {
    const c = createOperationsController({
      scenario: codexMicroScenario([]),
      executionConfig: EXEC,
    });
    c.advanceTo(20000);
    const s = c.snapshot();
    const o = s.orders.find((x) => x.orderId === "O");
    expect(o?.state).toBe("READY_FOR_DISPATCH");
    expect(o?.diagnostic).toBeNull();
    expect(o?.timestamps).toEqual({
      CREATED: 0,
      READY_FOR_PICKING: 0,
      PICKING: 0,
      WAITING_FOR_PACKING: 2500,
      PACKING: 6400,
      READY_FOR_DISPATCH: 7400,
    });
    // Direct handoff taken: no fictitious queue slot or queue leg.
    expect(s.timeline.some((t) => t.kind === "DIRECT_ENQUEUED")).toBe(true);
    expect(
      s.motionHistory.some((m) => m.purpose === "service-direct:pack-0"),
    ).toBe(true);
    expect(s.motionHistory.some((m) => m.purpose.startsWith("queue:"))).toBe(
      false,
    );
    // Service started only after actual arrival plus full unload.
    expect(
      s.timeline.find((t) => t.kind === "SERVICE_ARRIVED")?.timeMs,
    ).toBe(6000);
    expect(
      s.timeline.find((t) => t.kind === "UNLOAD_COMMITTED")?.timeMs,
    ).toBe(6400);
    expect(s.packing[0]?.jobs[0]?.startTimeMs).toBe(6400);
    expect(s.inventory.transfers).toHaveLength(3);
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    expect(s.counts).toMatchObject({ backlog: 1, stageBacklog: 0 });
  });

  test("finding 4: zero-queue second job holds upstream with FIFO age, never shares the lane", () => {
    const c = createOperationsController({
      scenario: m3bScenario({
        id: "m3b-direct-two",
        room: { widthMm: 9000, depthMm: 7000 },
        racks: [{ id: "R-FAR", x: 8500, z: 500 }],
        products: [{ id: "P-A" }, { id: "P-B" }],
        locations: [
          { id: "L-A1", approach: { x: 3000, z: 4000 }, productId: "P-A", stock: 1 },
          { id: "L-B1", approach: { x: 7900, z: 5300 }, productId: "P-B", stock: 1 },
        ],
        units: [
          { id: "U1", park: { x: 1000, z: 1200 } },
          { id: "U2", park: { x: 8300, z: 5300 } },
        ],
        packing: [
          {
            id: "PACK-1",
            service: [{ id: "S1", x: 6500, z: 4500 }],
            queue: [],
            durationMs: 10000,
            inputCap: 10,
            outputCap: 10,
          },
        ],
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
          { id: "O2", arrival: 0, lines: [{ productId: "P-B", quantity: 1 }] },
        ],
      }),
      executionConfig: EXEC,
    });
    c.advanceTo(90000);
    const s = c.snapshot();
    expect(s.orders.map((o) => o.state)).toEqual([
      "READY_FOR_DISPATCH",
      "READY_FOR_DISPATCH",
    ]);
    expect(s.orders.every((o) => o.diagnostic === null)).toBe(true);
    // The loser held upstream and recovered with its load intact.
    const full = s.waits.filter((w) => w.reason === "QUEUE_FULL");
    expect(full.length).toBeGreaterThanOrEqual(1);
    for (const w of full) {
      expect(w.endMs).not.toBeNull();
      expect(w.endMs as number).toBeGreaterThan(w.startMs);
    }
    // FIFO age retained: the second job's enqueue time is its original pick
    // completion, requested while the first job still held the lane.
    const jobs = s.packing.find((p) => p.resourceId === "PACK-1")?.jobs ?? [];
    expect(jobs).toHaveLength(2);
    const byEnqueue = [...jobs].sort((a, b) => a.enqueueTimeMs - b.enqueueTimeMs);
    const first = byEnqueue[0]!;
    const second = byEnqueue[1]!;
    expect(second.enqueueTimeMs).toBeLessThan(first.finishTimeMs ?? 0);
    // One position is never occupied twice: service intervals do not overlap.
    const byStart = [...jobs].sort(
      (a, b) => (a.startTimeMs ?? 0) - (b.startTimeMs ?? 0),
    );
    expect(byStart[1]?.startTimeMs ?? 0).toBeGreaterThanOrEqual(
      byStart[0]?.finishTimeMs ?? 0,
    );
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
  });

  test("finding 5: every grant closes its traffic wait at grant time with unique history", () => {
    const c = runBurstToCompletion();
    expect(c.getCompletionStatus().stage).toBe("SUPPORTED_STAGE_COMPLETE");
    const s = c.snapshot();
    // Unique unit+version history, one entry per grant.
    const keys = s.motionHistory.map((m) => `${m.unitId}:v${m.planVersion}`);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    // Timeline audit matches the retained history exactly.
    const granted = s.timeline.filter((t) => t.kind === "MOTION_GRANTED");
    expect(granted.length).toBe(keys.length);
    for (const m of s.motionHistory) {
      expect(
        granted.some((t) => t.unitId === m.unitId && t.timeMs === m.startMs),
      ).toBe(true);
    }
    // No TRAFFIC wait overlaps admitted motion: every wait ends at or before
    // the grant it precedes, and none stays open through a transit.
    for (const m of s.motionHistory) {
      for (const w of s.waits) {
        if (w.unitId !== m.unitId || w.reason !== "TRAFFIC") continue;
        const overlaps =
          w.startMs < m.endMs && (w.endMs === null || w.endMs > m.startMs);
        expect(overlaps).toBe(false);
      }
    }
    // Independent positive: the burst PK-3 wait 10000..15600 ends exactly at
    // the 15600 automatic grant while the agent moves under it. (Cargo-C2
    // model: r799 geometry + consistent disc occupancy shift the honest
    // grant from the historical 600-profile 15400; the historical timing is
    // preserved in git history and oracles, never rewritten.)
    const pk3 = s.waits.filter(
      (w) => w.unitId === "PK-3" && w.reason === "TRAFFIC" && w.startMs === 10000,
    );
    expect(pk3.length).toBeGreaterThanOrEqual(1);
    for (const w of pk3) expect(w.endMs).toBe(15600);
    expect(
      s.motionHistory.filter((m) => m.unitId === "PK-3" && m.startMs === 15600),
    ).toHaveLength(1);
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
  }, 120000);

  test("finding 6: multilane packing configurations are rejected upfront", () => {
    const twoLane = m3bScenario({
      id: "m3b-multilane",
      packing: [
        {
          id: "PACK-1",
          service: [
            { id: "S1", x: 5200, z: 1900 },
            { id: "S2", x: 5200, z: 2100 },
          ],
          queue: [{ id: "Q1", x: 4200, z: 2000 }],
          durationMs: 1000,
          inputCap: 10,
          outputCap: 10,
        },
      ],
      orders: [{ id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] }],
    });
    expect(() =>
      createOperationsController({ scenario: twoLane, executionConfig: EXEC }),
    ).toThrow(/UNSUPPORTED_MULTILANE/);
    const twoCap = m3bScenario({
      id: "m3b-multilane-cap",
      packing: [
        {
          id: "PACK-1",
          service: [{ id: "S1", x: 5200, z: 2000 }],
          queue: [{ id: "Q1", x: 4200, z: 2000 }],
          durationMs: 1000,
          inputCap: 10,
          outputCap: 10,
          cap: 2,
        },
      ],
      orders: [{ id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] }],
    });
    expect(() =>
      createOperationsController({ scenario: twoCap, executionConfig: EXEC }),
    ).toThrow(/UNSUPPORTED_MULTILANE/);
  });
});

describe("M3b cargo-C2: bounded stuck reporting and capacity-4 admission", () => {
  test("permanently occupied queue slot reports bounded BLOCKED, never hangs IN_PROGRESS", () => {
    // PA (putaway, never assigned) idles exactly on PACK-1 Q1. U1 picks its
    // item, enqueues onto Q1, and waits OCCUPIED_GOAL forever with no future
    // release scheduled: completion must be bounded BLOCKED with the
    // preserved order/load and the witnessed cause.
    const c = createOperationsController({
      scenario: m3bScenario({
        id: "m3b-c2-stuck",
        locations: [{ id: "L-A1", approach: { x: 2400, z: 2000 }, productId: "P-A", stock: 2 }],
        units: [
          { id: "U1", park: { x: 1000, z: 2000 }, capacity: 4 },
          { id: "PA", role: "putaway", park: { x: 4200, z: 2000 }, capacity: 4 },
        ],
        orders: [{ id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] }],
      }),
      executionConfig: EXEC,
    });
    c.advanceTo(60000);
    const status = c.getCompletionStatus();
    expect(status.stage).toBe("BLOCKED");
    if (status.stage !== "BLOCKED") return;
    expect(status).toMatchObject({ ready: 0, selected: 1, created: 1, shipped: 0, backlog: 1, stageBacklog: 1 });
    expect(status.detail).toMatch(/stuck with no scheduled release/);
    expect(status.reasons).toHaveLength(1);
    expect(status.reasons[0]).toMatchObject({ orderId: "O1", code: "STUCK_TRAFFIC" });
    const d = c.getDiagnostic();
    expect(d?.status).toBe("stuck");
    // Preserved state: the order still waits with its picked load, nothing
    // teleported, deleted, or partially fulfilled.
    const s = c.snapshot();
    const order = s.orders.find((o) => o.orderId === "O1");
    expect(order?.state).toBe("WAITING_FOR_PACKING");
    expect(order?.waitReason).toMatch(/TRAFFIC/);
    expect(s.units.find((u) => u.unitId === "U1")?.carried).toEqual([
      { productId: "P-A", quantity: 1 },
    ]);
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
    // Bounded: further advances change nothing about the verdict.
    c.advanceTo(120000);
    expect(c.getCompletionStatus().stage).toBe("BLOCKED");
    expect(c.snapshot().orders.find((o) => o.orderId === "O1")?.state).toBe("WAITING_FOR_PACKING");
  });

  test("capacity 4 admits a 4u order and rejects an 8u order upfront", () => {
    const mk = (qty: number, stock: number) =>
      createOperationsController({
        scenario: m3bScenario({
          id: "m3b-c2-cap",
          units: [{ id: "U1", park: { x: 1000, z: 2000 }, capacity: 4 }],
          locations: [{ id: "L-A1", approach: { x: 3000, z: 2000 }, productId: "P-A", stock }],
          orders: [{ id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: qty }] }],
        }),
        executionConfig: EXEC,
      });
    const ok = mk(4, 4);
    ok.advanceTo(60000);
    expect(ok.getCompletionStatus().stage).toBe("SUPPORTED_STAGE_COMPLETE");
    const big = mk(8, 8);
    big.advanceTo(60000);
    const status = big.getCompletionStatus();
    expect(status.stage).toBe("BLOCKED");
    if (status.stage !== "BLOCKED") return;
    expect(status.reasons).toHaveLength(1);
    expect(status.reasons[0]).toMatchObject({ orderId: "O1", code: "UNSUPPORTED_SINGLE_TRIP_REQUIRED" });
    // Rejected upfront: zero reservation, stock and loads untouched.
    const s = big.snapshot();
    expect(s.orders.find((o) => o.orderId === "O1")?.state).toBe("CREATED");
    expect(s.units.find((u) => u.unitId === "U1")?.carried).toEqual([]);
    expect(s.inventory.storage).toEqual([{ locationId: "L-A1", productId: "P-A", quantity: 8 }]);
    expect(s.checks).toEqual({ conservation: [], capacity: [], safety: [] });
  });
});

describe("M3b final revision: time-boundary edge cases", () => {
  test("fixed-window step with an empty future queue reaches the horizon without fabricating work", () => {
    const mk = () =>
      m3bScenario({
        id: "m3b-window-drain",
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
        ],
        run: { mode: "fixed-window", horizonMs: 20000 },
      });
    const c = createOperationsController({
      scenario: mk(),
      executionConfig: EXEC,
    });
    let guard = 0;
    while (c.getCompletionStatus().stage !== "WINDOW_ENDED" && guard < 120) {
      c.stepEvent();
      guard += 1;
    }
    expect(c.getCompletionStatus().stage).toBe("WINDOW_ENDED");
    expect(c.getClockMs()).toBe(20000);
    // No fabricated work: the step-driven run matches the advance-driven
    // run byte-for-byte, and the order kept its physical 6100 READY time.
    const d = createOperationsController({
      scenario: mk(),
      executionConfig: EXEC,
    });
    d.advanceTo(20000);
    expect(JSON.stringify(c.snapshot())).toBe(JSON.stringify(d.snapshot()));
    expect(
      c.snapshot().orders.find((o) => o.orderId === "O1")?.timestamps
        ?.READY_FOR_DISPATCH,
    ).toBe(6100);
    // Repeated steps past the boundary are stable.
    const before = JSON.stringify(c.snapshot());
    const r = c.stepEvent();
    expect(r.eventId).toBeNull();
    expect(c.getClockMs()).toBe(20000);
    expect(JSON.stringify(c.snapshot())).toBe(before);
  });

  test("invalid advance targets are rejected before horizon coercion, valid ones still clamp", () => {
    const mk = () =>
      m3bScenario({
        id: "m3b-window-validate",
        orders: [
          { id: "O1", arrival: 0, lines: [{ productId: "P-A", quantity: 1 }] },
        ],
        run: { mode: "fixed-window", horizonMs: 3000 },
      });
    for (const target of [Infinity, NaN, 1e20, "1000000"] as const) {
      const c = createOperationsController({
        scenario: mk(),
        executionConfig: EXEC,
      });
      c.advanceTo(2500);
      const before = JSON.stringify(c.snapshot());
      expect(() => c.advanceTo(target as unknown as number)).toThrow(
        /advanceTo target must be an integer/,
      );
      expect(c.getClockMs()).toBe(2500);
      expect(JSON.stringify(c.snapshot())).toBe(before);
    }
    // Positive: a valid oversized advance still clamps, and past-time
    // still throws the kernel error with the clock untouched.
    const c = createOperationsController({
      scenario: mk(),
      executionConfig: EXEC,
    });
    c.advanceTo(20000);
    expect(c.getClockMs()).toBe(3000);
    expect(() => c.advanceTo(2000)).toThrow(/in the past/);
    expect(c.getClockMs()).toBe(3000);
  });
});
