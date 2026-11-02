import { describe, expect, test } from "vitest";
import { createTransportController } from "../src/index.js";
import { microScenario } from "./transport-fixtures.js";

// Acceptance C: two units compete for one declared exclusive zone. Parallel
// lanes 1300 apart are trajectory-safe (600+600=1200) but share the zone,
// so the second waits. Whole-transit holds: first 0..4000, second granted
// at 4000 and finishing 8000. Endpoints/holding bays outside the zone and
// mutually safe. No arbitrary sleep (retry on completion). The first
// completed unit remains an obstacle (terminal persists).
describe("M3a transport acceptance C (exclusive zone)", () => {
  const scenario = () =>
    microScenario({
      id: "m3a-zone",
      room: { widthMm: 6000, depthMm: 4000 },
      trafficZones: [
        { id: "Z-AISLE", kind: "narrow-aisle", minXMm: 2000, minZMm: 1500, maxXMm: 4000, maxZMm: 2500 },
      ],
      units: [
        { id: "U1", parkingSlotMm: { x: 1000, z: 1400 } },
        { id: "U2", parkingSlotMm: { x: 1000, z: 2700 } },
      ],
    });

  test("first holds 0..4000, second waits then 4000..8000", () => {
    const c = createTransportController({ scenario: scenario() });
    const r1 = c.requestMove("U1", { x: 5000, z: 1400 });
    expect(r1.status).toBe("granted");
    if (r1.status !== "granted") return;
    expect([r1.plan.startMs, r1.plan.endMs]).toEqual([0, 4000]);
    expect(r1.plan.requiredZones).toEqual(["Z-AISLE"]);

    const r2 = c.requestMove("U2", { x: 5000, z: 2700 });
    expect(r2.status).toBe("waiting");
    if (r2.status !== "waiting") return;
    expect(r2.requestTimeMs).toBe(0);
    expect(r2.ageMs).toBe(0);
    expect(r2.blocker).toMatchObject({ kind: "zone", zoneId: "Z-AISLE", holderUnitId: "U1" });

    // No progress before release: still waiting at t=3999 with original age.
    c.advanceTo(3999);
    expect(c.poseAt("U1", 3999).x).toBeLessThan(5000);
    const snap = c.snapshot();
    const w = snap.units.find((u) => u.unitId === "U2")?.waiting;
    expect(w?.ageMs).toBe(3999);
    expect(w?.requestTimeMs).toBe(0);

    // Release at 4000 grants the waiter (no sleep, completion-triggered).
    c.advanceTo(4000);
    expect(c.poseAt("U1")).toEqual({ x: 5000, z: 1400 });
    const after = c.snapshot().units.find((u) => u.unitId === "U2");
    expect(after?.state).toBe("moving");
    expect(after?.plan?.startMs).toBe(4000);
    expect(after?.plan?.endMs).toBe(8000);
    c.advanceTo(8000);
    expect(c.poseAt("U2")).toEqual({ x: 5000, z: 2700 });
    // First terminal persists (remains an obstacle; never auto-released).
    expect(c.poseAt("U1")).toEqual({ x: 5000, z: 1400 });
  });

  test("completed unit remains an obstacle (occupied goal still waits)", () => {
    const c = createTransportController({ scenario: scenario() });
    c.requestMove("U1", { x: 5000, z: 1400 });
    c.advanceTo(4000);
    // U1 sits at (5000,1400) with no plan and empty queue: still occupied.
    // A new move into its seat waits rather than overlapping; with nothing
    // moving and nothing grantable, the bounded diagnostic reports stuck
    // (impossible wait, retained, no teleport/deletion).
    const r = c.requestMove("U2", { x: 5000, z: 1400 });
    expect(r.status).toBe("waiting");
    if (r.status === "waiting") {
      expect(r.blocker).toMatchObject({ kind: "unit", blockerUnitId: "U1" });
    }
    const d = c.getDiagnostic();
    expect(d?.status).toBe("stuck");
    if (d?.status === "stuck") expect(d.kind).toBe("IMPOSSIBLE_WAIT");
  });
});
