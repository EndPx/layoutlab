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

  test("sample per-order distances sum to 36800; B/D swap is 29800 and 19.0217%", () => {
    // Coordinator oracles (docs/INDEPENDENT_REVIEW_CASES.md): per-order
    // distances, weighted sums, and the improvement below are hand-derived
    // literals, not implementation output.
    const s = loadFixture("sample", "warehouse-basic");
    const freqOf = new Map(s.orders.map((o) => [o.id, o.frequency]));
    const sumOf = (orders: { orderId: string; distanceMm: number | null }[]): number =>
      orders.reduce((n, o) => n + (freqOf.get(o.orderId) as number) * (o.distanceMm as number), 0);
    const baseline = evaluateBaseline(s, req());
    const dist = new Map(baseline.workload!.orders.map((o) => [o.orderId, o.distanceMm]));
    expect(dist.get("O1")).toBe(3400);
    expect(dist.get("O2")).toBe(8000);
    expect(dist.get("O3")).toBe(7200);
    expect(sumOf(baseline.workload!.orders)).toBe(36800);
    expect(baseline.weightedTravelMm).toBe(36800);
    const swap = s.assignments.map((a) =>
      a.productId === "sku-b" ? { ...a, locationId: "L4" } : a.productId === "sku-d" ? { ...a, locationId: "L2" } : { ...a },
    );
    const comparison = compareCandidates(s, req(), [{ name: "b-d-swap", mapping: swap }]);
    const cand = comparison.ranked.find((c) => c.name === "b-d-swap")!;
    const swapDist = new Map(cand.workload!.orders.map((o) => [o.orderId, o.distanceMm]));
    expect(swapDist.get("O1")).toBe(3400);
    expect(swapDist.get("O2")).toBe(4600);
    expect(swapDist.get("O3")).toBe(7000);
    expect(sumOf(cand.workload!.orders)).toBe(29800);
    expect(cand.valid).toBe(true);
    expect(cand.weightedTravelMm).toBe(29800);
    expect(cand.relocationCount).toBe(2);
    // Percentage from exact integer millimeters, never displayed values.
    const baseMm = baseline.weightedTravelMm as number;
    const candMm = cand.weightedTravelMm as number;
    expect((100 * (baseMm - candMm)) / baseMm).toBeCloseTo(19.0217, 4);
    expect(comparison.improvementPercents["b-d-swap"]).toBeCloseTo(19.0217, 4);
  });
});
