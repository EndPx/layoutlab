import { describe, expect, test } from "vitest";
import { createTransportController } from "../src/index.js";
import { microScenario } from "./transport-fixtures.js";

// Acceptance B: real concurrent movement on disjoint lanes; head-on,
// crossing, and endpoints-free/mids-collide cases cannot overlap between
// events. Distinct radii, touching thresholds, off-grid connectors,
// stopped agents, occupied goals, and safe perpendiculars at different
// times are covered here and in traffic.test.ts.
describe("M3a transport acceptance B (concurrent swept admission)", () => {
  test("two disjoint 2000mm routes move concurrently 0..2000", () => {
    const c = createTransportController({
      scenario: microScenario({
        room: { widthMm: 6000, depthMm: 4000 },
        units: [
          { id: "U1", parkingSlotMm: { x: 1000, z: 1000 } },
          { id: "U2", parkingSlotMm: { x: 1000, z: 3000 } },
        ],
      }),
    });
    const r1 = c.requestMove("U1", { x: 3000, z: 1000 });
    const r2 = c.requestMove("U2", { x: 3000, z: 3000 });
    expect(r1.status).toBe("granted");
    expect(r2.status).toBe("granted");
    if (r1.status !== "granted" || r2.status !== "granted") return;
    expect([r1.plan.startMs, r1.plan.endMs]).toEqual([0, 2000]);
    expect([r2.plan.startMs, r2.plan.endMs]).toEqual([0, 2000]);
    // Both mid-transit at 1000ms (real concurrent movement, no 1-at-a-time).
    expect(c.poseAt("U1", 1000)).toEqual({ x: 2000, z: 1000 });
    expect(c.poseAt("U2", 1000)).toEqual({ x: 2000, z: 3000 });
    c.advanceTo(2000);
    expect(c.poseAt("U1")).toEqual({ x: 3000, z: 1000 });
    expect(c.poseAt("U2")).toEqual({ x: 3000, z: 3000 });
  });

  test("head-on swap cannot overlap (occupied goals + trajectory block)", () => {
    const c = createTransportController({
      scenario: microScenario({
        units: [
          { id: "U1", parkingSlotMm: { x: 1000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 3000, z: 2000 } },
        ],
      }),
    });
    // U1 wants U2's seat and vice versa: both goals occupied at t=0.
    const r1 = c.requestMove("U1", { x: 3000, z: 2000 });
    expect(r1.status).toBe("waiting");
    if (r1.status !== "waiting") return;
    expect(r1.blocker).toMatchObject({ kind: "unit", blockerUnitId: "U2" });
    const r2 = c.requestMove("U2", { x: 1000, z: 2000 });
    expect(r2.status).toBe("waiting");
    // Nothing moves; diagnostic reports the stuck pair (no teleport).
    expect(c.getDiagnostic()?.status).toBe("stuck");
    expect(c.poseAt("U1", 1000)).toEqual({ x: 1000, z: 2000 });
    expect(c.poseAt("U2", 1000)).toEqual({ x: 3000, z: 2000 });
  });

  test("crossing with free endpoints but colliding mids waits", () => {
    // Long crossing: endpoints pairwise safe (>1200), mids collide near
    // (3000,2000). U1 (1000,2000)->(5000,2000), U2 (3000,700)->(3000,5000).
    const c = createTransportController({
      scenario: microScenario({
        room: { widthMm: 6000, depthMm: 6000 },
        racks: [{ id: "R-FAR", x: 500, z: 5500, width: 200, depth: 200, height: 1000 }],
        units: [
          { id: "U1", parkingSlotMm: { x: 1000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 3000, z: 700 } },
        ],
      }),
    });
    const ends = [
      { x: 1000, z: 2000 },
      { x: 5000, z: 2000 },
      { x: 3000, z: 700 },
      { x: 3000, z: 5000 },
    ];
    for (let i = 0; i < ends.length; i += 1) {
      for (let j = i + 1; j < ends.length; j += 1) {
        const a = ends[i] as { x: number; z: number };
        const b = ends[j] as { x: number; z: number };
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1200);
      }
    }
    expect(c.requestMove("U1", { x: 5000, z: 2000 }).status).toBe("granted");
    const r2 = c.requestMove("U2", { x: 3000, z: 5000 });
    expect(r2.status).toBe("waiting");
    if (r2.status !== "waiting") return;
    expect(r2.blocker).toMatchObject({ kind: "unit", blockerUnitId: "U1" });
    expect(r2.ageMs).toBe(0);
  });

  test("stopped agent in path and occupied goal both wait", () => {
    // Uniform R2 correction: old U1(2000,2000)/U2(1000,2000) were only
    // 1000 apart (invalid under r600 envelopes). Safely separated starts
    // (2000 apart) with a genuinely blocked narrow corridor (review
    // walls): static route exists, occupied corridor blocks.
    const c = createTransportController({
      scenario: microScenario({
        room: { widthMm: 6000, depthMm: 5000 },
        obstacles: [
          { id: "TOP", minXMm: 2400, minZMm: 0, maxXMm: 3600, maxZMm: 1100 },
          { id: "BOTTOM", minXMm: 2400, minZMm: 2900, maxXMm: 3600, maxZMm: 5000 },
        ],
        units: [
          { id: "U1", parkingSlotMm: { x: 3000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 1000, z: 2000 } },
        ],
      }),
    });
    // U2's only corridor passes through parked U1 at (3000,2000).
    const mid = c.requestMove("U2", { x: 5000, z: 2000 });
    expect(mid.status).toBe("waiting");
    if (mid.status === "waiting") {
      expect(mid.blocker).toMatchObject({ kind: "unit", blockerUnitId: "U1" });
    }
    // Directly into the occupied seat also waits (occupied goal).
    const c2 = createTransportController({
      scenario: microScenario({
        units: [
          { id: "U1", parkingSlotMm: { x: 3000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 1000, z: 2000 } },
        ],
      }),
    });
    const goal = c2.requestMove("U2", { x: 3000, z: 2000 });
    expect(goal.status).toBe("waiting");
    if (goal.status === "waiting") {
      expect(goal.blocker).toMatchObject({ kind: "unit", blockerUnitId: "U1" });
    }
  });

  test("distinct radii admit correctly (small unit needs less room)", () => {
    const c = createTransportController({
      scenario: microScenario({
        room: { widthMm: 6000, depthMm: 4000 },
        units: [
          { id: "BIG", width: 600, length: 800, margin: 100, parkingSlotMm: { x: 1000, z: 1000 } },
          { id: "SML", width: 400, length: 400, margin: 50, parkingSlotMm: { x: 1000, z: 2300 } },
        ],
      }),
    });
    // Lanes 1300 apart: BIG+SML need 933, so concurrent is safe; two BIGs
    // would need 1200 and this same 1300 geometry would still pass, while
    // 900-apart lanes would split the two cases (unit-covered in traffic).
    const r1 = c.requestMove("BIG", { x: 3000, z: 1000 });
    const r2 = c.requestMove("SML", { x: 3000, z: 2300 });
    expect(r1.status).toBe("granted");
    expect(r2.status).toBe("granted");
  });

  test("safe perpendicular routes run at different times", () => {
    const scenario = () =>
      microScenario({
        room: { widthMm: 6000, depthMm: 6000 },
        racks: [{ id: "R-FAR", x: 500, z: 5500, width: 200, depth: 200, height: 1000 }],
        units: [
          { id: "U1", parkingSlotMm: { x: 1000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 3000, z: 700 } },
        ],
      });
    const c = createTransportController({ scenario: scenario() });
    // Long crossing: U1 (1000,2000)->(5000,2000), U2 (3000,700)->(3000,5000).
    // Concurrent start collides near (3000,2000): second waits.
    expect(c.requestMove("U1", { x: 5000, z: 2000 }).status).toBe("granted");
    expect(c.requestMove("U2", { x: 3000, z: 5000 }).status).toBe("waiting");
    // After U1 clears to (5000,2000) (2000 from x=3000), the completion
    // auto-retries and U2 runs alone 4000..8300 (4300mm at 1000mm/s).
    c.advanceTo(4000);
    const after = c.snapshot().units.find((u) => u.unitId === "U2");
    expect(after?.state).toBe("moving");
    expect(after?.plan?.startMs).toBe(4000);
    expect(after?.plan?.endMs).toBe(8300);
    c.advanceTo(8300);
    expect(c.poseAt("U2")).toEqual({ x: 3000, z: 5000 });
    expect(c.poseAt("U1")).toEqual({ x: 5000, z: 2000 });
  });
});
