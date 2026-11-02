import { describe, expect, test } from "vitest";
import {
  createTransportNav,
  footprintRadiusMm,
  footprintRect,
} from "../src/index.js";
import { microScenario } from "./transport-fixtures.js";

describe("M3a navigation adapter", () => {
  test("per-unit circumscribed radius: 600x800+100 = 600", () => {
    expect(footprintRadiusMm({ width: 600, length: 800, margin: 100 })).toBe(600);
    // Distinct profile: 400x400+50 => ceil(hypot(400,400)/2)=283 +50=333.
    expect(footprintRadiusMm({ width: 400, length: 400, margin: 50 })).toBe(333);
  });

  test("declared footprint rect is axis-aligned and centered", () => {
    expect(footprintRect({ x: 1000, z: 2000 }, { width: 600, length: 800 })).toEqual({
      minX: 700,
      maxX: 1300,
      minZ: 1600,
      maxZ: 2400,
    });
  });

  test("straight on-grid route reports exact segments and total", () => {
    const sc = microScenario({
      room: { widthMm: 6000, depthMm: 4000 },
      units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
    });
    const nav = createTransportNav(sc);
    const others = new Map();
    const r = nav.findRoute({ x: 1000, z: 2000 }, { x: 3000, z: 2000 }, "U1", others);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.totalDistanceMm).toBe(2000);
    expect(r.distancesMm.every((d) => d === 100)).toBe(true);
    expect(r.points[0]).toEqual({ x: 1000, z: 2000 });
    expect(r.points[r.points.length - 1]).toEqual({ x: 3000, z: 2000 });
  });

  test("off-grid endpoints connect via ceiled connectors", () => {
    const sc = microScenario({
      units: [{ id: "U1", parkingSlotMm: { x: 1050, z: 2050 } }],
    });
    const nav = createTransportNav(sc);
    const r = nav.findRoute({ x: 1050, z: 2050 }, { x: 3050, z: 2050 }, "U1", new Map());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    // Off-grid by (50,50): each connector ceil(hypot(50,50))=71 when the
    // nearest free node is the rounded grid point; total exceeds 2000.
    expect(r.totalDistanceMm).toBeGreaterThan(2000);
    expect(r.points[0]).toEqual({ x: 1050, z: 2050 });
    expect(r.points[r.points.length - 1]).toEqual({ x: 3050, z: 2050 });
  });

  test("route query excludes only its own footprint", () => {
    const sc = microScenario({
      units: [
        { id: "U1", parkingSlotMm: { x: 1000, z: 2000 } },
        { id: "U2", parkingSlotMm: { x: 3000, z: 2000 } },
      ],
    });
    const nav = createTransportNav(sc);
    // U1 at (1000,2000) routing to (3000,2000) while U2 sits at the goal:
    // own start excluded (navigable), goal blocked => OCCUPIED_GOAL.
    const others = new Map([["U2", { x: 3000, z: 2000 }]]);
    const r = nav.findRoute({ x: 1000, z: 2000 }, { x: 3000, z: 2000 }, "U1", others);
    expect(r.status).toBe("rejected");
    if (r.status !== "rejected") return;
    expect(r.reason).toBe("OCCUPIED_GOAL");
    expect(r.blockerUnitId).toBe("U2");
    // Same query without others: statically free.
    const s = nav.findStaticRoute({ x: 1000, z: 2000 }, { x: 3000, z: 2000 }, "U1");
    expect(s.status).toBe("ok");
  });

  test("unreachable/oversize/room failures are structured, never zero travel", () => {
    // Unbroken wall x2000..2500 spanning the full depth: inflated x1400..3100
    // blocks passage, while (1000,2000) and (4000,2000) stay navigable.
    const sc = microScenario({
      room: { widthMm: 6000, depthMm: 4000 },
      obstacles: [{ id: "O-BIG", minXMm: 2000, minZMm: 0, maxXMm: 2500, maxZMm: 4000 }],
      units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
    });
    const nav = createTransportNav(sc);
    // Goal inside the wall obstacle's footprint: OBSTACLE_OVERLAP.
    const inside = nav.findRoute({ x: 1000, z: 2000 }, { x: 2250, z: 2000 }, "U1", new Map());
    expect(inside.status).toBe("rejected");
    if (inside.status === "rejected") {
      expect(inside.reason).toBe("OBSTACLE_OVERLAP");
    }
    // Goal across an unbroken wall: static NO_PATH (both ends navigable).
    const across = nav.findRoute({ x: 1000, z: 2000 }, { x: 4000, z: 2000 }, "U1", new Map());
    expect(across.status).toBe("rejected");
    if (across.status === "rejected") {
      expect(across.reason).toBe("NO_PATH");
    }
    // Goal outside the room: ROOM_EXCEEDED (footprint leaves the room).
    const outside = nav.findRoute({ x: 1000, z: 2000 }, { x: 5900, z: 2000 }, "U1", new Map());
    expect(outside.status).toBe("rejected");
    if (outside.status === "rejected") {
      expect(["ROOM_EXCEEDED", "TO_UNNAVIGABLE"]).toContain(outside.reason);
    }
  });

  test("traffic zones are not obstacles for static routing", () => {
    const withZone = microScenario({
      trafficZones: [
        { id: "Z-1", kind: "narrow-aisle", minXMm: 1500, minZMm: 1500, maxXMm: 2500, maxZMm: 2500 },
      ],
      units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
    });
    const nav = createTransportNav(withZone);
    const r = nav.findStaticRoute({ x: 1000, z: 2000 }, { x: 3000, z: 2000 }, "U1");
    expect(r.status).toBe("ok");
  });
});
