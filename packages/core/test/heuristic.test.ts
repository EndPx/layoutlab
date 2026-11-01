// M4 heuristic tests. Expected travel values are hand-computed from the
// fixture geometry (no implementation calls): packing (1000,1000),
// L-near pick (2000,1000) -> 1000 mm, L-far pick (4000,1000) -> 3000 mm,
// all on the 100 mm node grid with no intervening obstacles. A-only tour
// at far = 6000, B-only tour at near = 2000. Baseline (A far, B near) =
// 10*6000 + 1*2000 = 62000. Swap = 10*2000 + 1*6000 = 26000, relocations 2.
// Demand counts frequency per distinct product per order: A = 10 despite
// quantity 5, B = 1. Units reporting still uses quantity: 10*5 + 1*1 = 51.
import { describe, expect, it } from "vitest";
import {
  computeDemandFrequency,
  createNavBudget,
  evaluateBaseline,
  methodLabelFor,
  rankLocationsByPackingDistance,
  runHeuristic,
  type Scenario,
} from "../src/index.js";
import { loadFixture, requirements } from "./helpers.js";

function oracle(): Scenario {
  return loadFixture("test", "heuristic-oracle");
}

function productIds(mapping: { productId: string }[]): string[] {
  return [...mapping.map((a) => a.productId)].sort();
}

describe("M4 heuristic oracle", () => {
  it("baseline hand values: 62000 weighted, 51 units, quantities ignored for demand", () => {
    const scenario = oracle();
    const baseline = evaluateBaseline(scenario, requirements({ maxRelocatedProducts: 2 }));
    expect(baseline.valid).toBe(true);
    expect(baseline.weightedTravelMm).toBe(62000);
    expect(baseline.workload?.meanOrderDistanceMm).toBe(62000 / 11);
    expect(baseline.workload?.totalUnits).toBe(51);
    expect(computeDemandFrequency(scenario).get("prod-A")).toBe(10);
    expect(computeDemandFrequency(scenario).get("prod-B")).toBe(1);
  });

  it("ranks locations by reachable packing distance then id", () => {
    const ranks = rankLocationsByPackingDistance(oracle());
    expect(ranks).toEqual([
      { locationId: "L-near", distanceMm: 1000, reachable: true, status: "reachable" },
      { locationId: "L-far", distanceMm: 3000, reachable: true, status: "reachable" },
    ]);
  });

  it("finds the 26000-mm swap within budget 2", () => {
    const scenario = oracle();
    const result = runHeuristic(scenario, requirements({ maxRelocatedProducts: 2 }));
    expect(result.retainedBaseline).toBe(false);
    expect(result.mapping).toEqual([
      { productId: "prod-A", locationId: "L-near" },
      { productId: "prod-B", locationId: "L-far" },
    ]);
    expect(result.candidate?.valid).toBe(true);
    expect(result.candidate?.weightedTravelMm).toBe(26000);
    expect(result.candidate?.relocationCount).toBe(2);
    expect(result.greedyRejected).toBe(false);
    expect(result.demandRank).toEqual([
      { productId: "prod-A", demand: 10 },
      { productId: "prod-B", demand: 1 },
    ]);
    expect(result.evaluationsUsed).toBeLessThanOrEqual(result.evaluationsBudget);
    expect(result.evaluationsUsed).toBeGreaterThan(0);
    expect(productIds(result.mapping)).toEqual(["prod-A", "prod-B"]);
  });

  it("budget 1 with no empty location cannot swap; baseline retained", () => {
    const scenario = oracle();
    const result = runHeuristic(scenario, requirements({ maxRelocatedProducts: 1 }));
    expect(result.retainedBaseline).toBe(true);
    expect(result.mapping).toEqual(scenario.assignments);
    expect(result.candidate?.valid).toBe(true);
    expect(result.candidate?.weightedTravelMm).toBe(62000);
    expect(result.candidate?.relocationCount).toBe(0);
    expect(result.candidatesGenerated).toBeGreaterThanOrEqual(1);
    expect(result.candidatesSkippedDuplicate).toBeGreaterThanOrEqual(1);
  });

  it("locked high-demand product cannot move; baseline retained", () => {
    const scenario = oracle();
    const result = runHeuristic(
      scenario,
      requirements({ maxRelocatedProducts: 2, lockedProductIds: ["prod-A"] }),
    );
    expect(result.retainedBaseline).toBe(true);
    expect(result.candidate?.valid).toBe(true);
    expect(result.candidate?.weightedTravelMm).toBe(62000);
    expect(result.mapping.find((a) => a.productId === "prod-A")?.locationId).toBe("L-far");
  });

  it("incompatible near destination rejects the move; baseline retained", () => {
    const scenario = oracle();
    // Cold chain on the far slot only: baseline stays valid, the swap breaks.
    scenario.products[0]!.requiredStorageClass = "cold";
    scenario.locations.find((l) => l.id === "L-far")!.storageClass = "cold";
    const result = runHeuristic(scenario, requirements({ maxRelocatedProducts: 2 }));
    expect(result.retainedBaseline).toBe(true);
    expect(result.candidate?.valid).toBe(true);
    expect(result.candidate?.weightedTravelMm).toBe(62000);
  });
});

describe("M4 heuristic bounds and determinism", () => {
  it("respects an explicit candidate-evaluation budget", () => {
    const scenario = oracle();
    const one = runHeuristic(scenario, requirements({ maxRelocatedProducts: 2 }), {
      maxCandidateEvaluations: 1,
    });
    expect(one.evaluationsBudget).toBe(1);
    expect(one.evaluationsUsed).toBeLessThanOrEqual(1);
    expect(one.candidate?.weightedTravelMm).toBe(26000);

    const zero = runHeuristic(scenario, requirements({ maxRelocatedProducts: 2 }), {
      maxCandidateEvaluations: 0,
    });
    expect(zero.evaluationsUsed).toBe(0);
    expect(zero.candidate).toBeNull();
    expect(zero.retainedBaseline).toBe(true);
    expect(zero.mapping).toEqual(scenario.assignments);
  });

  it("defaults non-finite budgets instead of bypassing the cap", () => {
    const scenario = oracle();
    const req = requirements({ maxRelocatedProducts: 2 });
    // NaN would make `evaluated.length >= budget` always false (unbounded
    // search); Infinity would blow past the hard cap. Both must default.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = runHeuristic(structuredClone(scenario), req, { maxCandidateEvaluations: bad });
      expect(result.evaluationsBudget).toBe(32);
      expect(result.evaluationsUsed).toBeLessThanOrEqual(32);
      expect(result.candidate?.weightedTravelMm).toBe(26000);
    }
    const fractional = runHeuristic(structuredClone(scenario), req, { maxCandidateEvaluations: 2.7 });
    expect(fractional.evaluationsBudget).toBe(2);
    const negative = runHeuristic(structuredClone(scenario), req, { maxCandidateEvaluations: -3 });
    expect(negative.evaluationsBudget).toBe(0);
    expect(negative.candidate).toBeNull();
    const huge = runHeuristic(structuredClone(scenario), req, { maxCandidateEvaluations: 10_000 });
    expect(huge.evaluationsBudget).toBe(256);
  });

  it("marks ranking exhaustion explicitly, never as unreachable, without throwing", () => {
    const scenario = oracle();
    const ranks = rankLocationsByPackingDistance(scenario, undefined, createNavBudget(0));
    expect(ranks).toEqual([
      { locationId: "L-far", distanceMm: null, reachable: false, status: "ranking-exhausted" },
      { locationId: "L-near", distanceMm: null, reachable: false, status: "ranking-exhausted" },
    ]);
    const result = runHeuristic(scenario, requirements({ maxRelocatedProducts: 2 }), {
      rankingBudget: createNavBudget(0),
    });
    expect(result.sceneOk).toBe(true);
    expect(result.rankingExhausted).toBe(true);
    // No reachable destinations: no moves or swaps admitted, baseline retained
    // through its own evaluation budget (ranking exhaustion is not physical).
    expect(result.retainedBaseline).toBe(true);
    expect(result.candidate?.valid).toBe(true);
    expect(result.candidate?.weightedTravelMm).toBe(62000);
    expect(result.locationRank.every((r) => r.status === "ranking-exhausted")).toBe(true);
  });

  it("returns INPUT_INVALID diagnostics for invalid scene geometry without searching", () => {
    const scenario = oracle();
    // Overlapping racks: R1 sits exactly on R0.
    scenario.racks.push({
      id: "R1",
      positionMm: { x: 500, z: 5500 },
      dimensionsMm: { width: 400, depth: 400, height: 2000 },
      yawDeg: 0,
    });
    const result = runHeuristic(scenario, requirements({ maxRelocatedProducts: 2 }));
    expect(result.sceneOk).toBe(false);
    expect(result.sceneIssues.map((i) => i.code)).toContain("RACK_OVERLAP");
    expect(result.candidate).toBeNull();
    expect(result.evaluationsUsed).toBe(0);
    expect(result.candidatesGenerated).toBe(0);
    expect(result.demandRank).toEqual([]);
    expect(result.locationRank).toEqual([]);
    expect(result.reason).toContain("INPUT_INVALID");
    expect(result.mapping).toEqual(scenario.assignments);
  });

  it("is deterministic across repeated runs", () => {
    const scenario = oracle();
    const req = requirements({ maxRelocatedProducts: 2 });
    const first = runHeuristic(structuredClone(scenario), req);
    const second = runHeuristic(structuredClone(scenario), req);
    expect(second).toEqual(first);
  });

  it("rejects an incomplete greedy mapping without dropping products", () => {
    const scenario = oracle();
    // Undemanded product C fits only L3, whose pick point sits inside rack
    // R1 (unreachable) far from the z=1000 routes. Greedy cannot place C,
    // but the complete A/B swap must still be found with C preserved.
    scenario.racks.push({
      id: "R1",
      positionMm: { x: 5000, z: 5000 },
      dimensionsMm: { width: 400, depth: 400, height: 2000 },
      yawDeg: 0,
    });
    scenario.locations.push({
      id: "L3",
      rackId: "R1",
      label: "Blocked slot",
      usableDimensionsMm: { width: 600, depth: 600, height: 800 },
      storageClass: "ambient",
      pickPointMm: { x: 5000, z: 5000 },
      allowedProductIds: ["prod-C"],
    });
    scenario.products.push({
      id: "prod-C",
      label: "Product C",
      storedLoadDimensionsMm: { width: 400, depth: 400, height: 400 },
      requiredStorageClass: "ambient",
      allowedLocationIds: ["L3"],
    });
    scenario.assignments.push({ productId: "prod-C", locationId: "L3" });

    const baseline = evaluateBaseline(scenario, requirements({ maxRelocatedProducts: 2 }));
    expect(baseline.valid).toBe(true);
    expect(baseline.weightedTravelMm).toBe(62000);

    const result = runHeuristic(scenario, requirements({ maxRelocatedProducts: 2 }));
    expect(result.greedyRejected).toBe(true);
    expect(result.greedyRejectReason).toContain("prod-C");
    expect(result.rankingExhausted).toBe(false);
    expect(result.locationRank.find((r) => r.locationId === "L3")?.status).toBe("unreachable");
    expect(result.retainedBaseline).toBe(false);
    expect(result.candidate?.valid).toBe(true);
    expect(result.candidate?.weightedTravelMm).toBe(26000);
    expect(productIds(result.mapping)).toEqual(["prod-A", "prod-B", "prod-C"]);
    expect(result.mapping.find((a) => a.productId === "prod-C")?.locationId).toBe("L3");
  });
});

describe("M4 method labels", () => {
  it("labels current, heuristic, meta-first, meta-feedback, and stub exactly", () => {
    expect(methodLabelFor("baseline")).toBe("current");
    expect(methodLabelFor("heuristic")).toBe("heuristic");
    expect(methodLabelFor("proposal-1")).toBe("meta-first");
    expect(methodLabelFor("proposal-2")).toBe("meta-feedback");
    expect(methodLabelFor("proposal-3")).toBe("meta-feedback");
    expect(methodLabelFor("stub-1")).toBe("stub");
    expect(methodLabelFor("custom-name")).toBe("other");
  });
});
