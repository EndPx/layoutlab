import { describe, expect, test } from "vitest";
import {
  applyAssignment,
  buildNavContext,
  compareCandidates,
  createReport,
  evaluateBaseline,
  evaluateCandidate,
  evaluateWorkload,
  freezeScenario,
  improvementPercent,
  rankCandidates,
  replayReport,
  safeAdd,
  safeMul,
  selectBest,
  settingsFingerprint,
  stableAssignmentKey,
} from "../src/index.js";
import { codes, loadFixture, requirements } from "./helpers.js";

const oracle = () => loadFixture("test", "oracle-empty-room");
const req = () => requirements();

describe("routing policy and demand", () => {
  test("weighted travel 16000 and mean 3200 on the oracle workload", () => {
    const s = oracle();
    const w = evaluateWorkload(s, s.assignments, buildNavContext(s));
    expect(w.orders).toHaveLength(2);
    expect(w.orders[0]!.distanceMm).toBe(4000);
    expect(w.orders[0]!.visitSequence).toEqual(["sku-a", "sku-b"]);
    expect(w.orders[1]!.distanceMm).toBe(2000);
    expect(w.weightedTravelMm).toBe(16000);
    expect(w.totalFrequency).toBe(5);
    expect(w.meanOrderDistanceMm).toBe(3200);
    expect(w.reachableOrders).toBe(2);
  });

  test("quantities do not create repeat visits but feed demand reporting", () => {
    const s = oracle();
    const w = evaluateWorkload(s, s.assignments, buildNavContext(s));
    const single = w.orders.find((o) => o.orderId === "O-a")!;
    expect(single.distinctProductIds).toEqual(["sku-a"]);
    expect(single.visitSequence).toEqual(["sku-a"]);
    const qty1 = structuredClone(s);
    qty1.orders[1]!.lines = [{ productId: "sku-a", quantity: 1 }];
    const w1 = evaluateWorkload(qty1, qty1.assignments, buildNavContext(qty1));
    expect(w1.orders.find((o) => o.orderId === "O-a")!.distanceMm).toBe(single.distanceMm);
    // Demand reporting still reflects quantities: 3*2 + 2*7 = 20 units.
    expect(w.totalUnits).toBe(20);
  });

  test("route tie-break is deterministic and ID-based", () => {
    const s = oracle();
    const nav = buildNavContext(s);
    const first = evaluateWorkload(s, s.assignments, nav);
    const second = evaluateWorkload(structuredClone(s), structuredClone(s.assignments), buildNavContext(s));
    expect(first.orders[0]!.visitSequence).toEqual(second.orders[0]!.visitSequence);
    // Reversed line order cannot change the visit sequence.
    const reversed = structuredClone(s);
    reversed.orders[0]!.lines = [...reversed.orders[0]!.lines].reverse();
    const third = evaluateWorkload(reversed, reversed.assignments, buildNavContext(reversed));
    expect(third.orders[0]!.visitSequence).toEqual(["sku-a", "sku-b"]);
  });

  test("unreachable orders are preserved with null complete travel", () => {
    const s = loadFixture("test", "narrow-corridor");
    const result = evaluateCandidate(s, req(), s.assignments, "baseline");
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("UNREACHABLE_ORDER");
    expect(result.workload).not.toBeNull();
    expect(result.workload!.orders).toHaveLength(2);
    expect(result.workload!.orders.find((o) => o.orderId === "O-west")!.distanceMm).toBe(3000);
    expect(result.workload!.orders.find((o) => o.orderId === "O-east")!.reachable).toBe(false);
    expect(result.workload!.weightedTravelMm).toBeNull();
    expect(result.workload!.meanOrderDistanceMm).toBeNull();
    expect(result.weightedTravelMm).toBeNull();
  });

  test("safe arithmetic helpers reject unsafe results", () => {
    expect(safeAdd(1, 2)).toBe(3);
    expect(safeMul(3, 4000)).toBe(12000);
    expect(safeAdd(Number.MAX_SAFE_INTEGER, 1)).toBeNull();
    expect(safeMul(10_000, 1_000_000_000_000_000)).toBeNull();
  });

  test("workload overflow invalidates without throwing", () => {
    const s = oracle();
    const huge = structuredClone(s);
    // Schema-valid maxima cannot overflow on this geometry (10k * 1e6 * 2000
    // is 2e13), so this guard is exercised with a programmatic workload that
    // bypasses schema bounds, as defense in depth.
    huge.orders = [{ id: "O-huge", frequency: 5_000_000_000_000, lines: [{ productId: "sku-a", quantity: 1 }] }];
    const w = evaluateWorkload(huge, huge.assignments, buildNavContext(huge));
    expect(w.arithmeticOverflow).toBe(true);
    expect(w.weightedTravelMm).toBeNull();
    const result = evaluateCandidate(huge, req(), huge.assignments, "baseline");
    expect(result.valid).toBe(false);
    expect(codes(result.errors)).toContain("ARITHMETIC_OVERFLOW");
  });
});

describe("objective and selection", () => {
  test("25 percent for valid 16000 vs 12000 under identical settings", () => {
    const s = oracle();
    const fp = settingsFingerprint(s);
    const base = { valid: true, weightedTravelMm: 16000, relocationCount: 0, settingsFingerprint: fp, assignmentKey: "a" };
    const cand = { valid: true, weightedTravelMm: 12000, relocationCount: 1, settingsFingerprint: fp, assignmentKey: "b" };
    expect(improvementPercent(base, cand)).toBe(25);
  });

  test("no misleading improvement for invalid baseline or mismatched settings", () => {
    const s = oracle();
    const fp = settingsFingerprint(s);
    const valid12k = { valid: true, weightedTravelMm: 12000, relocationCount: 1, settingsFingerprint: fp, assignmentKey: "b" };
    expect(improvementPercent({ ...valid12k, valid: false }, valid12k)).toBeNull();
    expect(improvementPercent(valid12k, { ...valid12k, valid: false })).toBeNull();
    expect(improvementPercent(valid12k, { ...valid12k, settingsFingerprint: "other" })).toBeNull();
    expect(improvementPercent({ ...valid12k, weightedTravelMm: 0 }, valid12k)).toBeNull();
  });

  test("invalid candidate cannot replace a valid best (end to end)", () => {
    const s = oracle();
    const invalid = [
      { productId: "sku-a", locationId: "L1" },
      { productId: "sku-b", locationId: "L1" },
    ];
    const comparison = compareCandidates(s, req(), [{ name: "invalid", mapping: invalid }]);
    expect(comparison.best?.name).toBe("baseline");
    expect(comparison.ranked[0]!.name).toBe("baseline");
  });

  test("ranking prefers travel, then relocations, then stable key", () => {
    const fp = "fp";
    const mk = (name: string, valid: boolean, travel: number | null, reloc: number, key: string) =>
      ({ name, valid, weightedTravelMm: travel, relocationCount: reloc, assignmentKey: key, settingsFingerprint: fp });
    const ranked = rankCandidates([
      mk("invalid-cheap", false, null, 0, "a"),
      mk("more-reloc", true, 12000, 2, "a"),
      mk("fewer-reloc", true, 12000, 1, "zzz"),
      mk("key-a", true, 12000, 1, "aaa"),
    ]);
    expect(ranked.map((c) => c.name)).toEqual(["key-a", "fewer-reloc", "more-reloc", "invalid-cheap"]);
    expect(selectBest(ranked)?.name).toBe("key-a");
    expect(selectBest([mk("x", false, null, 0, "a")])).toBeNull();
  });

  test("stable key ignores input order; fingerprint ignores assignment", () => {
    const s = oracle();
    const a = s.assignments;
    const b = [...a].reverse();
    expect(stableAssignmentKey(a)).toBe(stableAssignmentKey(b));
    const moved = structuredClone(s);
    moved.assignments = [...a].reverse();
    expect(settingsFingerprint(s)).toBe(settingsFingerprint(moved));
    const otherCart = structuredClone(s);
    otherCart.cart.marginMm = 101;
    expect(settingsFingerprint(s)).not.toBe(settingsFingerprint(otherCart));
  });

  test("end-to-end improvement: 16000 to 7000 is 56.25 percent", () => {
    const s = oracle();
    const extended = structuredClone(s);
    extended.locations.push({
      id: "L3",
      rackId: "R0",
      label: "Near slot",
      usableDimensionsMm: { width: 600, depth: 600, height: 800 },
      storageClass: "ambient",
      pickPointMm: { x: 1100, z: 1000 },
    });
    const mapping = [
      { productId: "sku-a", locationId: "L3" },
      { productId: "sku-b", locationId: "L2" },
    ];
    const comparison = compareCandidates(extended, req(), [{ name: "near", mapping }]);
    expect(comparison.baseline.weightedTravelMm).toBe(16000);
    expect(comparison.ranked.find((c) => c.name === "near")!.weightedTravelMm).toBe(7000);
    expect(comparison.improvementPercents["near"]).toBe(56.25);
    expect(comparison.best?.name).toBe("near");
  });
});

describe("snapshots, replay, and outcomes", () => {
  test("stale apply is rejected; fresh apply bumps the revision", () => {
    const s = oracle();
    const snapshot = freezeScenario(s);
    expect(Object.isFrozen(snapshot)).toBe(true);
    const fresh = applyAssignment(snapshot, s.assignments, 0);
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.scenario.revision).toBe(1);
    expect(fresh.scenario.assignments).toEqual(s.assignments);
    const stale = applyAssignment(snapshot, s.assignments, 1);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(codes(stale.errors)).toContain("STALE_REVISION");
  });

  test("report replay reproduces measurements", () => {
    const s = oracle();
    const report = createReport(s, req(), [
      { name: "swap", mapping: [{ productId: "sku-a", locationId: "L2" }, { productId: "sku-b", locationId: "L1" }] },
    ]);
    const roundTripped = JSON.parse(JSON.stringify(report));
    const replayed = replayReport(roundTripped);
    expect(replayed.matchesSaved).toBe(true);
    expect(replayed.mismatches).toEqual([]);
  });

  test("replay ignores improvementPercents key order on mixed valid/invalid reports", () => {
    const s = oracle();
    s.locations.push({
      id: "L3",
      rackId: "R0",
      label: "Near slot",
      usableDimensionsMm: { width: 600, depth: 600, height: 800 },
      storageClass: "ambient",
      pickPointMm: { x: 1100, z: 1000 },
    });
    const swap = [
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L1" },
    ];
    const near = [
      { productId: "sku-a", locationId: "L3" },
      { productId: "sku-b", locationId: "L2" },
    ];
    const doubleBooked = [
      { productId: "sku-a", locationId: "L1" },
      { productId: "sku-b", locationId: "L1" },
    ];
    // Entry order is deliberately unsorted: invalid first, then the slower
    // valid candidate, then the fastest.
    const entries = [
      { name: "invalid", mapping: doubleBooked },
      { name: "swap", mapping: swap },
      { name: "near", mapping: near },
    ];
    const report = createReport(s, req(), entries);
    expect(report.candidates.map((c) => c.name)).toEqual(["near", "swap", "invalid"]);
    const roundTripped = JSON.parse(JSON.stringify(report));
    const replayed = replayReport(roundTripped);
    expect(replayed.matchesSaved).toBe(true);
    expect(replayed.mismatches).toEqual([]);

    // Reordered percentage keys with identical values still match.
    const reordered = JSON.parse(JSON.stringify(report));
    const keys = Object.keys(reordered.improvementPercents).reverse();
    reordered.improvementPercents = Object.fromEntries(
      keys.map((k: string) => [k, reordered.improvementPercents[k]]),
    );
    const replayedReordered = replayReport(reordered);
    expect(replayedReordered.matchesSaved).toBe(true);
    expect(replayedReordered.mismatches).toEqual([]);
  });

  test("replay still rejects changed percentage values and tampered routes", () => {
    const s = oracle();
    s.locations.push({
      id: "L3",
      rackId: "R0",
      label: "Near slot",
      usableDimensionsMm: { width: 600, depth: 600, height: 800 },
      storageClass: "ambient",
      pickPointMm: { x: 1100, z: 1000 },
    });
    const report = createReport(s, req(), [
      { name: "invalid", mapping: [{ productId: "sku-a", locationId: "L1" }, { productId: "sku-b", locationId: "L1" }] },
      {
        name: "swap",
        mapping: [{ productId: "sku-a", locationId: "L2" }, { productId: "sku-b", locationId: "L1" }],
      },
      {
        name: "near",
        mapping: [{ productId: "sku-a", locationId: "L3" }, { productId: "sku-b", locationId: "L2" }],
      },
    ]);
    const changed = JSON.parse(JSON.stringify(report));
    changed.improvementPercents["near"] += 1;
    const replayedChanged = replayReport(changed);
    expect(replayedChanged.matchesSaved).toBe(false);
    expect(replayedChanged.mismatches).toContain("improvementPercents");

    const tampered = JSON.parse(JSON.stringify(report));
    tampered.candidates[0].workload.orders[0].visitSequence =
      [...tampered.candidates[0].workload.orders[0].visitSequence].reverse();
    const replayedTampered = replayReport(tampered);
    expect(replayedTampered.matchesSaved).toBe(false);
    expect(replayedTampered.mismatches).toContain("candidates");
  });

  test("replay rejects incompatible versions and route policy", () => {
    const saved = JSON.parse(JSON.stringify(createReport(oracle(), req(), [])));
    expect(() => replayReport({ ...saved, reportVersion: "layoutlab.report/99" })).toThrow();
    expect(() => replayReport({ ...saved, coreVersion: "9.9.9" })).toThrow();
    expect(() => replayReport({ ...saved, routePolicy: "other-policy/1" })).toThrow();
  });

  test("replay rejects malformed envelopes and mappings", () => {
    const saved = JSON.parse(JSON.stringify(createReport(oracle(), req(), [])));
    const missing = structuredClone(saved);
    delete missing.candidates;
    expect(() => replayReport(missing)).toThrow();
    const badMapping = structuredClone(saved);
    badMapping.baseline.assignment = [{ productId: "sku-a" }];
    expect(() => replayReport(badMapping)).toThrow();
    const extraKey = structuredClone(saved);
    extraKey.baseline.assignment = [{ productId: "sku-a", locationId: "L1", hack: true }];
    expect(() => replayReport(extraKey)).toThrow();
    expect(() => replayReport(null)).toThrow();
    expect(() => replayReport({})).toThrow();
  });

  test("replay rejects over-cap candidate lists", () => {
    const s = oracle();
    const entries = Array.from({ length: 65 }, (_, k) => ({ name: `c${k}`, mapping: s.assignments }));
    const saved = JSON.parse(JSON.stringify(createReport(s, req(), entries)));
    expect(() => replayReport(saved)).toThrow();
  });

  test("replay detects tampered route sequences and legs", () => {
    const tamperedSeq = JSON.parse(JSON.stringify(createReport(oracle(), req(), [])));
    tamperedSeq.baseline.workload.orders[0].visitSequence = ["sku-b", "sku-a"];
    const replayedSeq = replayReport(tamperedSeq);
    expect(replayedSeq.matchesSaved).toBe(false);
    expect(replayedSeq.mismatches).toContain("baseline");

    const tamperedLeg = JSON.parse(JSON.stringify(createReport(oracle(), req(), [])));
    tamperedLeg.baseline.workload.orders[0].legs[0].distanceMm += 1;
    tamperedLeg.baseline.workload.orders[0].distanceMm += 1;
    tamperedLeg.baseline.workload.weightedTravelMm += 3;
    tamperedLeg.baseline.weightedTravelMm += 3;
    const replayedLeg = replayReport(tamperedLeg);
    expect(replayedLeg.matchesSaved).toBe(false);
    expect(replayedLeg.mismatches).toContain("baseline");
  });

  test("replay detects tampered mappings and metrics", () => {
    const s = oracle();
    const swap = [{ productId: "sku-a", locationId: "L2" }, { productId: "sku-b", locationId: "L1" }];
    const tamperedMapping = JSON.parse(JSON.stringify(createReport(s, req(), [{ name: "swap", mapping: swap }])));
    tamperedMapping.candidates[0].assignment = s.assignments;
    const replayedMapping = replayReport(tamperedMapping);
    expect(replayedMapping.matchesSaved).toBe(false);
    expect(replayedMapping.mismatches).toContain("candidates");

    const tamperedMetric = JSON.parse(JSON.stringify(createReport(s, req(), [])));
    tamperedMetric.baseline.weightedTravelMm = 1;
    const replayedMetric = replayReport(tamperedMetric);
    expect(replayedMetric.matchesSaved).toBe(false);
    expect(replayedMetric.mismatches).toContain("baseline");
  });

  test("outcomes follow baseline and best validity", () => {
    const s = oracle();
    const swap = [
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L1" },
    ];
    // Symmetric swap keeps 16000: valid baseline, no improvement.
    expect(createReport(s, req(), [{ name: "swap", mapping: swap }]).outcome).toBe("NO_IMPROVEMENT_FOUND");
    const invalid = structuredClone(s);
    invalid.assignments = [{ productId: "sku-a", locationId: "L1" }];
    expect(createReport(invalid, req(), []).outcome).toBe("SEARCH_EXHAUSTED");
    expect(createReport(invalid, req(), [{ name: "fixed", mapping: s.assignments }]).outcome)
      .toBe("VALID_ASSIGNMENT_FOUND");
  });

  test("baseline evaluation is deterministic", () => {
    const s = oracle();
    const first = evaluateBaseline(s, req(), buildNavContext(s));
    const second = evaluateBaseline(structuredClone(s), req(), buildNavContext(s));
    expect(second).toEqual(first);
  });

  test("report carries versions, policy, limitations, and no secrets", () => {
    const report = createReport(oracle(), req(), []);
    expect(report.reportVersion).toBe("layoutlab.report/1");
    expect(report.coreVersion).toBe("0.1.0");
    expect(report.routePolicy).toBe("nearest-neighbor-a-star/1");
    expect(report.limitations.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toMatch(/api[_-]?key/iu);
  });
});
