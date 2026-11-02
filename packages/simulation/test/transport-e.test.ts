import { describe, expect, test } from "vitest";
import {
  createInventoryStore,
  createTransportController,
  parseOperationsScenario,
} from "../src/index.js";
import { microScenario } from "./transport-fixtures.js";
import { tinyOperationsScenario } from "./fixtures.js";

// Acceptance E: invalid/replaced/cancelled/stale/blocked requests fail
// atomically or preserve the valid old plan; unsafe midroute cancellation
// never clears future safety; deadlock/impossible waits are bounded
// diagnostics (no teleport/task deletion); transport never mutates inventory.
describe("M3a transport acceptance E (atomicity/cancel/diagnostic)", () => {
  test("invalid replacement preserves the old waiting request", () => {
    const c = createTransportController({
      scenario: microScenario({
        units: [
          { id: "U1", parkingSlotMm: { x: 3000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 1000, z: 2000 } },
        ],
      }),
    });
    const w1 = c.requestMove("U2", { x: 3000, z: 2000 });
    expect(w1.status).toBe("waiting");
    const before = JSON.stringify(c.snapshot());
    // Invalid coordinates (non-integer) fail atomically, old wait preserved.
    const bad = c.requestMove("U2", { x: 1.5, z: 2000 } as unknown as { x: number; z: number });
    expect(bad.status).toBe("rejected");
    expect(JSON.stringify(c.snapshot())).toBe(before);
    expect(c.snapshot().units.find((u) => u.unitId === "U2")?.state).toBe("waiting");
  });

  test("replan while moving is rejected and the old plan is preserved", () => {
    const c = createTransportController({
      scenario: microScenario({
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    });
    expect(c.requestMove("U1", { x: 3000, z: 2000 }).status).toBe("granted");
    const before = JSON.stringify(c.snapshot());
    const r = c.requestMove("U1", { x: 1000, z: 3000 });
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.reason.code).toBe("ALREADY_MOVING");
    expect(JSON.stringify(c.snapshot())).toBe(before);
    c.advanceTo(1000);
    expect(c.poseAt("U1")).toEqual({ x: 2000, z: 2000 });
  });

  test("unsafe midroute cancellation is rejected; motion continues (no false cancelled)", () => {
    const c = createTransportController({
      scenario: microScenario({
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    });
    c.requestMove("U1", { x: 3000, z: 2000 });
    c.advanceTo(1000);
    const cancel = c.cancelPlan("U1");
    expect(cancel.status).toBe("rejected");
    if (cancel.status === "rejected") expect(cancel.reason.code).toBe("UNSAFE_MIDROUTE");
    // Motion continues to the safe endpoint; occupancy never erased.
    c.advanceTo(2000);
    expect(c.poseAt("U1")).toEqual({ x: 3000, z: 2000 });
    expect(c.snapshot().units[0]?.planVersion).toBe(1);
  });

  test("waiting cancellation releases only the pending request", () => {
    const c = createTransportController({
      scenario: microScenario({
        units: [
          { id: "U1", parkingSlotMm: { x: 3000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 1000, z: 2000 } },
        ],
      }),
    });
    expect(c.requestMove("U2", { x: 3000, z: 2000 }).status).toBe("waiting");
    expect(c.cancelPlan("U2")).toEqual({ status: "cancelled", unitId: "U2" });
    // Pose preserved (still parked), nothing teleported, nothing else moved.
    expect(c.poseAt("U2")).toEqual({ x: 1000, z: 2000 });
    expect(c.snapshot().pendingCount).toBe(0);
  });

  test("head-on deadlock is a bounded stuck diagnostic, not teleport/deletion", () => {
    const c = createTransportController({
      scenario: microScenario({
        units: [
          { id: "U1", parkingSlotMm: { x: 1000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 3000, z: 2000 } },
        ],
      }),
    });
    c.requestMove("U1", { x: 3000, z: 2000 });
    c.requestMove("U2", { x: 1000, z: 2000 });
    const d = c.getDiagnostic();
    expect(d?.status).toBe("stuck");
    if (d?.status !== "stuck") return;
    expect(d.kind).toBe("DEADLOCK_CYCLE");
    expect(d.waits).toHaveLength(2);
    // State retained: both still parked, both still waiting.
    expect(c.poseAt("U1")).toEqual({ x: 1000, z: 2000 });
    expect(c.poseAt("U2")).toEqual({ x: 3000, z: 2000 });
    expect(c.snapshot().pendingCount).toBe(2);
  });

  test("transport never mutates inventory", () => {
    const sc = parseOperationsScenario(tinyOperationsScenario());
    const store = createInventoryStore(sc);
    const before = JSON.stringify(store.snapshot());
    const t = createTransportController({
      scenario: microScenario({
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    });
    t.requestMove("U1", { x: 3000, z: 2000 });
    t.advanceTo(2000);
    t.requestMove("U1", { x: 1000, z: 2000 });
    t.advanceTo(4000);
    expect(JSON.stringify(store.snapshot())).toBe(before);
    expect(store.checkInvariants()).toEqual([]);
  });
});
