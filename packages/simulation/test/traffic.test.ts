import { describe, expect, test } from "vitest";
import {
  discsConflict,
  minSeparationMovingMoving,
  minSeparationMovingStationary,
  pathRequiresZone,
  stationaryVsStationaryConflict,
  trajectoriesConflict,
  trajectoryVsStationaryConflict,
  zoneHoldsOverlap,
} from "../src/index.js";

describe("M3a swept-space traffic checks", () => {
  test("touching discs conflict (inclusive), separated discs clear", () => {
    // 600+600=1200: touching at exactly 1200 conflicts (conservative).
    expect(discsConflict(1200, 600, 600)).toBe(true);
    expect(discsConflict(1199.999, 600, 600)).toBe(true);
    expect(discsConflict(1200.001, 600, 600)).toBe(false);
    // Distinct radii 600+333=933: touching conflicts.
    expect(discsConflict(933, 600, 333)).toBe(true);
    expect(discsConflict(933.001, 600, 333)).toBe(false);
    expect(
      stationaryVsStationaryConflict({ x: 0, z: 0 }, 600, { x: 1200, z: 0 }, 600),
    ).toBe(true);
    expect(
      stationaryVsStationaryConflict({ x: 0, z: 0 }, 600, { x: 1201, z: 0 }, 600),
    ).toBe(false);
  });

  test("head-on segments collide between events (min over overlap)", () => {
    // A: (0,0)->(2000,0) over [0,2000]; B: (2000,0)->(0,0) over [0,2000].
    // Relative speed closes 4000 in 2000ms; min separation 0 at t=1000.
    const d = minSeparationMovingMoving(
      { fromX: 0, fromZ: 0, toX: 2000, toZ: 0, startMs: 0, endMs: 2000 },
      { fromX: 2000, fromZ: 0, toX: 0, toZ: 0, startMs: 0, endMs: 2000 },
    );
    expect(d).toBeCloseTo(0, 6);
  });

  test("disjoint parallel segments stay clear", () => {
    // Same timing, lanes 2000 apart (>1200): min stays 2000.
    const d = minSeparationMovingMoving(
      { fromX: 0, fromZ: 0, toX: 2000, toZ: 0, startMs: 0, endMs: 2000 },
      { fromX: 0, fromZ: 2000, toX: 2000, toZ: 2000, startMs: 0, endMs: 2000 },
    );
    expect(d).toBeCloseTo(2000, 6);
    expect(discsConflict(d, 600, 600)).toBe(false);
  });

  test("endpoints free but mid-segments collide (crossing diagonals)", () => {
    // A: (1000,2000)->(3000,2000); B: (2000,1000)->(2000,3000), both
    // [0,2000]. Endpoints pairwise >=1414 (free), crossing at (2000,2000).
    const a = {
      unitId: "A",
      radiusMm: 600,
      startMs: 0,
      endMs: 2000,
      destination: { x: 3000, z: 2000 },
      segments: [{ fromX: 1000, fromZ: 2000, toX: 3000, toZ: 2000, startMs: 0, endMs: 2000 }],
    };
    const b = {
      unitId: "B",
      radiusMm: 600,
      startMs: 0,
      endMs: 2000,
      destination: { x: 2000, z: 3000 },
      segments: [{ fromX: 2000, fromZ: 1000, toX: 2000, toZ: 3000, startMs: 0, endMs: 2000 }],
    };
    // Endpoint check alone would pass (all pairs >1200):
    for (const pa of [{ x: 1000, z: 2000 }, { x: 3000, z: 2000 }]) {
      for (const pb of [{ x: 2000, z: 1000 }, { x: 2000, z: 3000 }]) {
        expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeGreaterThan(1200);
      }
    }
    const c = trajectoriesConflict(a, b);
    expect(c.conflict).toBe(true);
    expect(c.detail?.minDistMm ?? 1e9).toBeLessThan(1200);
  });

  test("same crossing at different times is safe", () => {
    const a = {
      unitId: "A",
      radiusMm: 600,
      startMs: 0,
      endMs: 2000,
      destination: { x: 3000, z: 2000 },
      segments: [{ fromX: 1000, fromZ: 2000, toX: 3000, toZ: 2000, startMs: 0, endMs: 2000 }],
    };
    const b = {
      unitId: "B",
      radiusMm: 600,
      startMs: 3000,
      endMs: 5000,
      destination: { x: 2000, z: 3000 },
      segments: [{ fromX: 2000, fromZ: 1000, toX: 2000, toZ: 3000, startMs: 3000, endMs: 5000 }],
    };
    expect(trajectoriesConflict(a, b).conflict).toBe(false);
  });

  test("moving vs stopped agent in path conflicts", () => {
    const d = minSeparationMovingStationary(
      { fromX: 1000, fromZ: 2000, toX: 3000, toZ: 2000, startMs: 0, endMs: 2000 },
      { x: 2000, z: 2000 },
    );
    expect(d).toBeCloseTo(0, 6);
    const c = trajectoryVsStationaryConflict(
      {
        unitId: "M",
        radiusMm: 600,
        startMs: 0,
        endMs: 2000,
        destination: { x: 3000, z: 2000 },
        segments: [{ fromX: 1000, fromZ: 2000, toX: 3000, toZ: 2000, startMs: 0, endMs: 2000 }],
      },
      { x: 2000, z: 2000 },
      600,
    );
    expect(c.conflict).toBe(true);
  });

  test("zone holds are half-open: 0..4000 releases before 4000..8000", () => {
    expect(zoneHoldsOverlap(0, 4000, 4000, 8000)).toBe(false);
    expect(zoneHoldsOverlap(0, 4000, 3999, 8000)).toBe(true);
    expect(zoneHoldsOverlap(0, 4000, 0, 4000)).toBe(true);
  });

  test("pathRequiresZone inflates conservatively by the unit radius", () => {
    const zone = { minX: 2000, maxX: 4000, minZ: 1500, maxZ: 2500 };
    // Centerline through the zone requires it.
    expect(
      pathRequiresZone([{ x: 1000, z: 2000 }, { x: 5000, z: 2000 }], 600, zone),
    ).toBe(true);
    // Far lane (z=5000) does not.
    expect(
      pathRequiresZone([{ x: 1000, z: 5000 }, { x: 5000, z: 5000 }], 600, zone),
    ).toBe(false);
  });
});
