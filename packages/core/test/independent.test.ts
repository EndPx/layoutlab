import { describe, expect, test } from "vitest";
import {
  buildNavContext,
  compareCandidates,
  evaluateBaseline,
  evaluateCandidate,
  navigationRadiusMm,
  pointNavigable,
  shortestPathMm,
} from "../src/index.js";
import { codes, loadFixture, requirements } from "./helpers.js";

// Direct assertions for docs/INDEPENDENT_REVIEW_CASES.md. Values below were
// supplied by the coordinator; the core must reproduce them exactly.

const oracle = () => loadFixture("test", "oracle-empty-room");
const req = () => requirements();

describe("empty-room distance and demand", () => {
  test("packing-A 1000, packing-B 1000, A-B 2000, tours 4000 and 2000", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    const packing = s.packingPointMm;
    const a = s.locations[0]!.pickPointMm;
    const b = s.locations[1]!.pickPointMm;
    expect(shortestPathMm(packing, a, s, nav)).toBe(1000);
    expect(shortestPathMm(packing, b, s, nav)).toBe(1000);
    expect(shortestPathMm(a, b, s, nav)).toBe(2000);
    const baseline = evaluateBaseline(s, req(), nav);
    expect(baseline.valid).toBe(true);
    const both = baseline.workload!.orders.find((o) => o.orderId === "O-both")!;
    const onlyA = baseline.workload!.orders.find((o) => o.orderId === "O-a")!;
    expect(both.distanceMm).toBe(4000);
    expect(onlyA.distanceMm).toBe(2000); // quantity 7 still yields one visit
  });

  test("weighted 16000, mean 3200, stable ID tie-break", () => {
    const s = oracle();
    const baseline = evaluateBaseline(s, req());
    expect(baseline.workload!.weightedTravelMm).toBe(16000);
    expect(baseline.workload!.meanOrderDistanceMm).toBe(3200);
    const again = evaluateBaseline(structuredClone(s), req());
    expect(again.workload!.orders[0]!.visitSequence).toEqual(
      baseline.workload!.orders[0]!.visitSequence,
    );
    expect(baseline.workload!.orders[0]!.visitSequence[0]).toBe("sku-a");
  });
});

describe("clearance and obstacles", () => {
  test("navigation radius is 700 and the wall band rejects 699", () => {
    const s = oracle();
    expect(navigationRadiusMm(s)).toBe(700);
    const nav = buildNavContext(s);
    expect(pointNavigable({ x: 699, z: 3000 }, s, nav)).toBe(false);
  });

  test("sub-1400 corridor untraversable despite valid endpoints", () => {
    const s = loadFixture("test", "narrow-corridor");
    const nav = buildNavContext(s);
    const packing = s.packingPointMm;
    const east = s.locations.find((l) => l.id === "L-east")!.pickPointMm;
    expect(pointNavigable(packing, s, nav)).toBe(true);
    expect(pointNavigable(east, s, nav)).toBe(true);
    expect(shortestPathMm(packing, east, s, nav)).toBeNull();
  });
});

describe("assignment and measurement", () => {
  const swap = [
    { productId: "sku-a", locationId: "L2" },
    { productId: "sku-b", locationId: "L1" },
  ];

  test("swap changes two products: budget 1 rejects, budget 2 admits", () => {
    const s = oracle();
    const rejected = evaluateCandidate(s, requirements({ maxRelocatedProducts: 1 }), swap, "swap");
    expect(rejected.relocationCount).toBe(2);
    expect(rejected.valid).toBe(false);
    expect(codes(rejected.errors)).toContain("BUDGET_EXCEEDED");
    const admitted = evaluateCandidate(s, requirements({ maxRelocatedProducts: 2 }), swap, "swap");
    expect(admitted.valid).toBe(true);
  });

  test("unreachable demand preserves the order and nulls travel and percent", () => {
    const s = loadFixture("test", "narrow-corridor");
    const comparison = compareCandidates(s, req(), []);
    expect(comparison.baseline.valid).toBe(false);
    expect(comparison.baseline.workload!.orders).toHaveLength(2);
    expect(comparison.baseline.weightedTravelMm).toBeNull();
    expect(comparison.improvementPercents["baseline"]).toBeNull();
  });

  test("invalid baseline yields no percentage even with a valid candidate", () => {
    const s = oracle();
    const broken = structuredClone(s);
    broken.assignments = [{ productId: "sku-a", locationId: "L1" }];
    const comparison = compareCandidates(broken, req(), [{ name: "fixed", mapping: s.assignments }]);
    expect(comparison.baseline.valid).toBe(false);
    expect(comparison.ranked.find((c) => c.name === "fixed")!.valid).toBe(true);
    expect(comparison.improvementPercents["fixed"]).toBeNull();
  });

  test("sample warehouse baseline evaluates valid", () => {
    const s = loadFixture("sample", "warehouse-basic");
    const baseline = evaluateBaseline(s, req());
    expect(codes(baseline.errors)).toEqual([]);
    expect(baseline.valid).toBe(true);
    expect(baseline.workload!.reachableOrders).toBe(3);
    expect(baseline.weightedTravelMm).toBeGreaterThan(0);
  });
});
