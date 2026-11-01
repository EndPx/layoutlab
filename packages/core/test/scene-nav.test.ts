import { describe, expect, test } from "vitest";
import {
  buildNavContext,
  cartRadiusMm,
  connectEndpoint,
  evaluateCandidate,
  evaluateWorkload,
  navigationRadiusMm,
  pointNavigable,
  rackFootprint,
  segmentBlocked,
  shortestPathMm,
  validateScene,
} from "../src/index.js";
import { codes, loadFixture, requirements } from "./helpers.js";

const oracle = () => loadFixture("test", "oracle-empty-room");

describe("conservative clearance model", () => {
  test("cart 600x800 with margin 100 and passage 1400 gives radius 700", () => {
    const s = oracle();
    expect(cartRadiusMm(s.cart)).toBe(500); // sqrt(300^2+400^2)
    expect(navigationRadiusMm(s)).toBe(700); // max(500+100, 1400/2)
    expect(buildNavContext(s).navigationRadiusMm).toBe(700);
  });

  test("points at or inside the 700 mm wall band are rejected", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    expect(pointNavigable({ x: 699, z: 3000 }, s, nav)).toBe(false);
    expect(pointNavigable({ x: 700, z: 3000 }, s, nav)).toBe(false);
    expect(pointNavigable({ x: 701, z: 3000 }, s, nav)).toBe(true);
    expect(pointNavigable({ x: 1000, z: 1000 }, s, nav)).toBe(true);
  });

  test("yaw-aware rack footprints", () => {
    const base = oracle().racks[0]!;
    const axis = rackFootprint({ ...base, positionMm: { x: 3000, z: 3000 }, dimensionsMm: { width: 2000, depth: 1000, height: 1000 }, yawDeg: 0 });
    expect(axis).toEqual({ minX: 2000, maxX: 4000, minZ: 2500, maxZ: 3500 });
    const turned = rackFootprint({ ...base, positionMm: { x: 3000, z: 3000 }, dimensionsMm: { width: 2000, depth: 1000, height: 1000 }, yawDeg: 90 });
    expect(turned).toEqual({ minX: 2500, maxX: 3500, minZ: 2000, maxZ: 4000 });
  });

  test("rack out of bounds, overlap, and touching edges", () => {
    const s = oracle();
    const out = structuredClone(s);
    out.racks[0]!.positionMm = { x: 5900, z: 5900 }; // 400-wide rack exceeds 6000 room
    expect(codes(validateScene(out).issues)).toContain("RACK_OUT_OF_BOUNDS");

    const overlap = structuredClone(s);
    overlap.racks.push({ ...structuredClone(overlap.racks[0]!), id: "R1" });
    expect(codes(validateScene(overlap).issues)).toContain("RACK_OVERLAP");

    const touching = structuredClone(s);
    touching.racks = [
      { id: "R1", positionMm: { x: 2000, z: 3000 }, dimensionsMm: { width: 2000, depth: 1000, height: 1000 }, yawDeg: 0 },
      { id: "R2", positionMm: { x: 4000, z: 3000 }, dimensionsMm: { width: 2000, depth: 1000, height: 1000 }, yawDeg: 0 },
    ];
    expect(codes(validateScene(touching).issues)).not.toContain("RACK_OVERLAP");
  });

  test("packing and reference checks", () => {
    const s = oracle();
    const badPacking = structuredClone(s);
    badPacking.packingPointMm = { x: 500, z: 5500 }; // inside inflated R0
    expect(codes(validateScene(badPacking).issues)).toContain("PACKING_INVALID");
    const badRef = structuredClone(s);
    badRef.locations[0]!.rackId = "ghost";
    expect(codes(validateScene(badRef).issues)).toContain("LOCATION_UNKNOWN_RACK");
    const badPick = structuredClone(s);
    badPick.locations[0]!.pickPointMm = { x: 6100, z: 1000 };
    expect(codes(validateScene(badPick).issues)).toContain("PICK_POINT_OUT_OF_ROOM");
  });
});

describe("grid navigation", () => {
  test("known empty-room distances", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    const packing = s.packingPointMm;
    const a = s.locations[0]!.pickPointMm;
    const b = s.locations[1]!.pickPointMm;
    expect(shortestPathMm(packing, a, s, nav)).toBe(1000);
    expect(shortestPathMm(packing, b, s, nav)).toBe(1000);
    expect(shortestPathMm(a, b, s, nav)).toBe(2000);
  });

  test("A* is deterministic across runs", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    const a = s.locations[0]!.pickPointMm;
    const b = s.locations[1]!.pickPointMm;
    const first = shortestPathMm(a, b, s, nav);
    const second = shortestPathMm(a, b, s, buildNavContext(s));
    expect(first).toBe(second);
  });

  test("corridor narrower than 1400 mm is untraversable", () => {
    const s = loadFixture("test", "narrow-corridor");
    const nav = buildNavContext(s);
    expect(nav.navigationRadiusMm).toBe(700);
    const packing = s.packingPointMm;
    const east = s.locations.find((l) => l.id === "L-east")!.pickPointMm;
    // Both endpoints satisfy clearance; only the crossing fails.
    expect(pointNavigable(packing, s, nav)).toBe(true);
    expect(pointNavigable(east, s, nav)).toBe(true);
    expect(connectEndpoint(packing, s, nav)).not.toBeNull();
    expect(connectEndpoint(east, s, nav)).not.toBeNull();
    expect(shortestPathMm(packing, east, s, nav)).toBeNull();
  });

  test("widened corridor control is traversable", () => {
    const s = loadFixture("test", "narrow-corridor");
    const open = structuredClone(s);
    // 1800 mm gap: free band z[2800,3200] after 700 mm inflation.
    open.racks[0]!.positionMm = { x: 3000, z: 1050 };
    open.racks[0]!.dimensionsMm = { width: 2000, depth: 2100, height: 2000 };
    open.racks[1]!.positionMm = { x: 3000, z: 4950 };
    open.racks[1]!.dimensionsMm = { width: 2000, depth: 2100, height: 2000 };
    const nav = buildNavContext(open);
    const d = shortestPathMm(open.packingPointMm, open.locations[1]!.pickPointMm, open, nav);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
  });

  test("edge collision rejects segments crossing inflated obstacles", () => {
    const s = loadFixture("test", "narrow-corridor");
    const nav = buildNavContext(s);
    const packing = s.packingPointMm;
    const east = s.locations.find((l) => l.id === "L-east")!.pickPointMm;
    const westPick = s.locations.find((l) => l.id === "L-west")!.pickPointMm;
    // Endpoints pass point tests, but the straight crossing hits inflated R1.
    expect(pointNavigable(packing, s, nav)).toBe(true);
    expect(pointNavigable(east, s, nav)).toBe(true);
    expect(segmentBlocked(packing, east, nav.inflatedObstacles)).toBe(true);
    expect(segmentBlocked(packing, westPick, nav.inflatedObstacles)).toBe(false);
  });

  test("clearance-violating endpoints never connect (no teleport snap)", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    expect(connectEndpoint({ x: 500, z: 5500 }, s, nav)).toBeNull(); // rack center
    expect(connectEndpoint({ x: 699, z: 3000 }, s, nav)).toBeNull(); // wall band
    expect(connectEndpoint({ x: 1000, z: 1000 }, s, nav)).toEqual({
      node: { i: 10, j: 10 },
      connectorMm: 0,
    });
  });

  test("identical endpoints measure 0 when navigable, null when not", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    expect(shortestPathMm({ x: 1000, z: 1000 }, { x: 1000, z: 1000 }, s, nav)).toBe(0);
    expect(shortestPathMm({ x: 500, z: 5500 }, { x: 500, z: 5500 }, s, nav)).toBeNull();
  });

  test("distinct points sharing a node measure nonzero connectors", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    // Pick (1030,1000) shares packing node (10,10) with a 30 mm connector.
    expect(connectEndpoint({ x: 1030, z: 1000 }, s, nav)).toEqual({
      node: { i: 10, j: 10 },
      connectorMm: 30,
    });
    expect(shortestPathMm({ x: 1000, z: 1000 }, { x: 1030, z: 1000 }, s, nav)).toBe(30);
  });

  test("coordinator regression: distinct near points do not measure 0", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    // Both points share node (10,10): connectors 15 + 29, no grid steps.
    expect(shortestPathMm({ x: 1010, z: 1010 }, { x: 1020, z: 1020 }, s, nav)).toBe(44);
  });

  test("off-grid endpoint tour is 2486 mm", () => {
    const s = loadFixture("test", "offgrid-endpoints");
    const nav = buildNavContext(s);
    // Pick (2130,1070) connects to node (21,11): ceil(sqrt(1800)) = 43.
    expect(connectEndpoint(s.locations[0]!.pickPointMm, s, nav)).toEqual({
      node: { i: 21, j: 11 },
      connectorMm: 43,
    });
    // Leg: 0 + 12 grid steps + 43 connector = 1243; tour doubles it.
    expect(shortestPathMm(s.packingPointMm, s.locations[0]!.pickPointMm, s, nav)).toBe(1243);
    const workload = evaluateWorkload(s, s.assignments, nav);
    expect(workload.orders[0]!.distanceMm).toBe(2486);
  });

  test("tiny expansion budget halts without misreporting unreachable", () => {
    const s = loadFixture("test", "narrow-corridor");
    const nav = buildNavContext(s);
    const w = evaluateWorkload(s, s.assignments, nav, { maxExpansions: 50 });
    expect(w.budgetExhausted).toBe(true);
    expect(w.weightedTravelMm).toBeNull();
    // The finished order keeps its result; the halted one is marked, not lost.
    expect(w.orders.find((o) => o.orderId === "O-west")!.distanceMm).toBe(3000);
    expect(w.orders.find((o) => o.orderId === "O-east")!.reason).toBe("EVALUATION_BUDGET_EXHAUSTED");
  });

  test("oversized grid fails with BUDGET_EXHAUSTED, not unreachable", () => {
    const s = oracle();
    const huge = structuredClone(s);
    huge.room = { widthMm: 100_000, depthMm: 100_000 };
    huge.racks = [
      { id: "R1", positionMm: { x: 50_000, z: 25_000 }, dimensionsMm: { width: 2000, depth: 50_000, height: 2000 }, yawDeg: 0 },
      { id: "R2", positionMm: { x: 50_000, z: 75_000 }, dimensionsMm: { width: 2000, depth: 50_000, height: 2000 }, yawDeg: 0 },
    ];
    huge.packingPointMm = { x: 10_000, z: 50_000 };
    huge.locations[0]!.rackId = "R1";
    huge.locations[0]!.pickPointMm = { x: 10_000, z: 20_000 };
    huge.locations[1]!.rackId = "R2";
    huge.locations[1]!.pickPointMm = { x: 90_000, z: 50_000 };
    const result = evaluateCandidate(huge, requirements(), huge.assignments, "baseline");
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("BUDGET_EXHAUSTED");
    expect(codes(result.errors)).not.toContain("UNREACHABLE_ORDER");
  });
});
