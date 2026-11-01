// M5 benchmark fixtures: six frozen synthetic scenarios with independent
// hand-computed values (open-room Manhattan math) plus meaningful heuristic
// and validity properties. Anchored to the existing 62000->26000/16000
// coordinator oracles; benchmark numbers below were derived by hand from the
// frozen geometry, not copied from implementation output.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createReport,
  evaluateBaseline,
  evaluateCandidate,
  parseRequirements,
  parseScenario,
  runHeuristic,
  validateScene,
  type Assignment,
} from "../src/index.js";

const IDS = [
  "bm-01-demand-skew",
  "bm-02-copick-cluster",
  "bm-03-tight-relocation",
  "bm-04-constraints",
  "bm-05-locked-frequent",
  "bm-06-unreachable-repair",
] as const;

function fixture(id: string): unknown {
  const url = new URL(`../../../fixtures/benchmark/${id}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

function contracts(): Record<string, unknown> {
  const url = new URL("../../../fixtures/benchmark/requirements.json", import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { contracts: Record<string, unknown> }).contracts;
}

function mapping(pairs: [string, string][]): Assignment[] {
  return pairs.map(([productId, locationId]) => ({ productId, locationId }));
}

describe("M5 benchmark fixtures", () => {
  it("freezes six valid synthetic scenes with fully specified contracts", () => {
    const req = contracts();
    for (const id of IDS) {
      const scenario = parseScenario(fixture(id));
      expect(scenario.id).toBe(id);
      expect(validateScene(scenario).ok).toBe(true);
      expect(scenario.provenance.category).toBe("synthetic");
      expect(scenario.provenance.assumptions.length).toBeGreaterThanOrEqual(1);
      const contract = parseRequirements(req[id]);
      expect(contract.unresolvedQuestions).toEqual([]);
    }
  });

  it("manifest pins exactly six scenario hashes plus requirements", () => {
    const url = new URL("../../../fixtures/benchmark/manifest.json", import.meta.url);
    const manifest = JSON.parse(readFileSync(url, "utf8")) as {
      benchmarkVersion: string;
      scenarios: { id: string; file: string; bytes: number; sha256: string }[];
      requirements: { file: string; bytes: number; sha256: string };
    };
    expect(manifest.benchmarkVersion).toBe("layoutlab.m5benchmark/1");
    expect(manifest.scenarios.map((s) => s.id)).toEqual([...IDS]);
    for (const entry of manifest.scenarios) {
      const raw = readFileSync(new URL(`../../../fixtures/benchmark/${entry.file}`, import.meta.url));
      expect(raw.length).toBe(entry.bytes);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(entry.sha256);
    }
    const reqRaw = readFileSync(new URL(`../../../fixtures/benchmark/${manifest.requirements.file}`, import.meta.url));
    expect(reqRaw.length).toBe(manifest.requirements.bytes);
    expect(createHash("sha256").update(reqRaw).digest("hex")).toBe(manifest.requirements.sha256);
  });

  it("anchors to the existing 62000/26000 and 16000 coordinator oracles", () => {
    const oracle = parseScenario(
      JSON.parse(readFileSync(new URL("../../../fixtures/test/heuristic-oracle.json", import.meta.url), "utf8")),
    );
    const req = parseRequirements({
      objective: "minimize_weighted_picking_travel",
      maxRelocatedProducts: 2,
      lockedProductIds: [],
      assumptions: [],
      unresolvedQuestions: [],
    });
    expect(evaluateBaseline(oracle, req).weightedTravelMm).toBe(62000);
    const swap = evaluateCandidate(
      oracle,
      req,
      mapping([["prod-A", "L-near"], ["prod-B", "L-far"]]),
      "swap",
    );
    expect(swap.valid).toBe(true);
    expect(swap.weightedTravelMm).toBe(26000);
    expect(swap.relocationCount).toBe(2);
    const empty = parseScenario(
      JSON.parse(readFileSync(new URL("../../../fixtures/test/oracle-empty-room.json", import.meta.url), "utf8")),
    );
    expect(evaluateBaseline(empty, req).weightedTravelMm).toBe(16000);
  });

  it("bm-01 demand skew: baseline 78000, swap 42000, heuristic 32000", () => {
    const scenario = parseScenario(fixture("bm-01-demand-skew"));
    const req = parseRequirements(contracts()["bm-01-demand-skew"]);
    // 10*6000 + 4*4000 + 1*2000 by hand.
    expect(evaluateBaseline(scenario, req).weightedTravelMm).toBe(78000);
    const swap = evaluateCandidate(
      scenario,
      req,
      mapping([["P-hi", "L-near"], ["P-mid", "L-mid"], ["P-lo", "L-far"]]),
      "swap",
    );
    expect(swap.valid).toBe(true);
    expect(swap.weightedTravelMm).toBe(42000);
    expect(swap.relocationCount).toBe(2);
    const heu = runHeuristic(scenario, req, {});
    expect(heu.candidate?.valid).toBe(true);
    expect(heu.candidate?.weightedTravelMm).toBe(32000);
    expect(heu.candidate?.relocationCount).toBe(3);
    expect(heu.evaluationsUsed).toBeLessThanOrEqual(heu.evaluationsBudget);
  });

  it("bm-02 co-pick cluster at brief scale: baseline 218000, hand repair 194000", () => {
    const scenario = parseScenario(fixture("bm-02-copick-cluster"));
    const req = parseRequirements(contracts()["bm-02-copick-cluster"]);
    expect(scenario.racks).toHaveLength(4);
    expect(scenario.locations).toHaveLength(12);
    expect(scenario.products).toHaveLength(10);
    expect(scenario.orders).toHaveLength(10);
    // 8*10000 + 6*10000 + 4*4000 + 3*2000 + 3*4000 + 2*6000 + 2*8000 + 6000 + 2*2000 + 6000 by hand.
    expect(evaluateBaseline(scenario, req).weightedTravelMm).toBe(218000);
    // Swap PA2 (far C3) with PC2 (near B0): pair A clusters at A1+B0 for
    // 8*4000 while O-C2 rises to 30000. Net 194000, 2 relocations.
    const repaired = evaluateCandidate(
      scenario,
      req,
      scenario.assignments.map((a) =>
        a.productId === "PA2" ? { ...a, locationId: "L-B0" } : a.productId === "PC2" ? { ...a, locationId: "L-C3" } : { ...a },
      ),
      "hand-repair",
    );
    expect(repaired.valid).toBe(true);
    expect(repaired.weightedTravelMm).toBe(194000);
    expect(repaired.relocationCount).toBe(2);
    const heu = runHeuristic(scenario, req, {});
    expect(heu.candidate?.valid).toBe(true);
    expect(heu.candidate?.weightedTravelMm).toBe(186000);
    expect(heu.candidate?.relocationCount).toBe(2);
    expect(heu.evaluationsUsed).toBeLessThanOrEqual(heu.evaluationsBudget);
  });

  it("bm-03 tight relocation: budget 1 admits the mid move, rejects the swap", () => {
    const scenario = parseScenario(fixture("bm-03-tight-relocation"));
    const req = parseRequirements(contracts()["bm-03-tight-relocation"]);
    expect(req.maxRelocatedProducts).toBe(1);
    expect(evaluateBaseline(scenario, req).weightedTravelMm).toBe(38000);
    const single = evaluateCandidate(scenario, req, mapping([["P-hi", "L-mid"], ["P-lo", "L-near"]]), "single");
    expect(single.valid).toBe(true);
    expect(single.weightedTravelMm).toBe(26000);
    expect(single.relocationCount).toBe(1);
    const swap = evaluateCandidate(scenario, req, mapping([["P-hi", "L-near"], ["P-lo", "L-far"]]), "swap");
    expect(swap.valid).toBe(false);
    expect(swap.errors.map((e) => e.code)).toContain("BUDGET_EXCEEDED");
    const heu = runHeuristic(scenario, req, {});
    expect(heu.candidate?.weightedTravelMm).toBe(26000);
    expect(heu.candidate?.relocationCount).toBeLessThanOrEqual(1);
  });

  it("bm-04 constraints: allowlist blocks the swap, baseline retained", () => {
    const scenario = parseScenario(fixture("bm-04-constraints"));
    const req = parseRequirements(contracts()["bm-04-constraints"]);
    expect(evaluateBaseline(scenario, req).weightedTravelMm).toBe(36000);
    const swap = evaluateCandidate(
      scenario,
      req,
      mapping([["P-a", "L-near"], ["P-b", "L-mid"], ["P-c", "L-far"]]),
      "swap",
    );
    expect(swap.valid).toBe(false);
    expect(swap.errors.map((e) => e.code)).toContain("PRODUCT_NOT_ALLOWED");
    const heu = runHeuristic(scenario, req, {});
    expect(heu.retainedBaseline).toBe(true);
    expect(heu.candidate?.weightedTravelMm).toBe(36000);
    // The undersized slot never becomes a destination.
    expect(heu.mapping.some((a) => a.locationId === "L-small")).toBe(false);
    const report = createReport(scenario, req, [{ name: "heuristic", mapping: heu.mapping }]);
    expect(report.outcome).toBe("NO_IMPROVEMENT_FOUND");
  });

  it("bm-05 locked frequent at brief scale: P-hot never moves, hand repair 210000", () => {
    const scenario = parseScenario(fixture("bm-05-locked-frequent"));
    const req = parseRequirements(contracts()["bm-05-locked-frequent"]);
    expect(req.lockedProductIds).toEqual(["P-hot"]);
    expect(scenario.racks).toHaveLength(4);
    expect(scenario.locations).toHaveLength(12);
    expect(scenario.products).toHaveLength(8);
    expect(scenario.orders).toHaveLength(10);
    // 2*10000 + 4*2000 + 3*8000 + 3*6000 + 2*6000 + 2*6000 + 4000 + 4000 + 10*10000 + 2*10000 by hand.
    expect(evaluateBaseline(scenario, req).weightedTravelMm).toBe(222000);
    const moved = evaluateCandidate(
      scenario,
      req,
      scenario.assignments.map((a) => (a.productId === "P-hot" ? { ...a, locationId: "L-A1" } : { ...a })),
      "moved-hot",
    );
    expect(moved.valid).toBe(false);
    expect(moved.errors.map((e) => e.code)).toContain("REQUIREMENT_LOCK_CHANGED");
    // Swap P2 (B3) with P6 (A2): O2 drops to 12000, O-23 to 16000, O6 rises
    // to 8000. Net 210000, 2 relocations.
    const repaired = evaluateCandidate(
      scenario,
      req,
      scenario.assignments.map((a) =>
        a.productId === "P2" ? { ...a, locationId: "L-A2" } : a.productId === "P6" ? { ...a, locationId: "L-B3" } : { ...a },
      ),
      "hand-repair",
    );
    expect(repaired.valid).toBe(true);
    expect(repaired.weightedTravelMm).toBe(210000);
    expect(repaired.relocationCount).toBe(2);
    const heu = runHeuristic(scenario, req, {});
    expect(heu.candidate?.valid).toBe(true);
    expect(heu.candidate?.weightedTravelMm).toBe(196000);
    expect(heu.candidate?.relocationCount).toBe(1);
    expect(heu.mapping.find((a) => a.productId === "P-hot")?.locationId).toBe("L-C3");
    expect(heu.evaluationsUsed).toBeLessThanOrEqual(heu.evaluationsBudget);
  });

  it("bm-06 unreachable baseline: invalid baseline, N/A improvement, reachable repair", () => {
    const scenario = parseScenario(fixture("bm-06-unreachable-repair"));
    const req = parseRequirements(contracts()["bm-06-unreachable-repair"]);
    const baseline = evaluateBaseline(scenario, req);
    expect(baseline.valid).toBe(false);
    expect(baseline.weightedTravelMm).toBeNull();
    expect(baseline.errors.map((e) => e.code)).toContain("UNREACHABLE_ORDER");
    const repair = evaluateCandidate(scenario, req, mapping([["P-x", "L-spare"], ["P-y", "L-ok"]]), "repair");
    expect(repair.valid).toBe(true);
    expect(repair.weightedTravelMm).toBe(12000);
    expect(repair.relocationCount).toBe(1);
    const report = createReport(scenario, req, [{ name: "repair", mapping: repair.assignment }]);
    expect(report.improvementPercents["repair"]).toBeNull();
    expect(report.outcome).toBe("VALID_ASSIGNMENT_FOUND");
    const heu = runHeuristic(scenario, req, {});
    expect(heu.candidate?.valid).toBe(true);
    expect(heu.candidate?.weightedTravelMm).toBe(12000);
  });
});
