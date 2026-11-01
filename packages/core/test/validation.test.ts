import { describe, expect, test } from "vitest";
import {
  applyProposal,
  createReport,
  evaluateBaseline,
  parseProposal,
  parseScenario,
  stableAssignmentKey,
  validateAssignment,
} from "../src/index.js";
import { codes, loadFixture, requirements } from "./helpers.js";

const oracle = () => loadFixture("test", "oracle-empty-room");
const req = () => requirements();

describe("schema strictness", () => {
  test("unknown fields are rejected", () => {
    const raw = JSON.parse(JSON.stringify(oracle()));
    expect(() => parseScenario({ ...raw, extra: 1 })).toThrow();
    expect(() => parseProposal({ scenarioRevision: 0, changes: [], rationale: "", extra: 1 })).toThrow();
  });

  test("duplicate entity ids are rejected", () => {
    const raw = JSON.parse(JSON.stringify(oracle()));
    raw.orders = [...raw.orders, structuredClone(raw.orders[0])];
    expect(() => parseScenario(raw)).toThrow();
  });

  test("bounds and safe integers are enforced", () => {
    const raw = () => JSON.parse(JSON.stringify(oracle()));
    const bad1 = raw();
    bad1.gridSizeMm = 200;
    expect(() => parseScenario(bad1)).toThrow();
    const bad2 = raw();
    bad2.orders[0].frequency = 1_000_001;
    expect(() => parseScenario(bad2)).toThrow();
    const bad3 = raw();
    bad3.packingPointMm.x = 10.5;
    expect(() => parseScenario(bad3)).toThrow();
    const bad4 = raw();
    bad4.schemaVersion = "other/9";
    expect(() => parseScenario(bad4)).toThrow();
  });

  test("small-scene input caps reject fast at parse time", () => {
    const base = () => JSON.parse(JSON.stringify(oracle()));
    const many = <T>(item: T, n: number, rename: (c: T, k: number) => void): T[] =>
      Array.from({ length: n }, (_, k) => {
        const c = structuredClone(item);
        rename(c, k);
        return c;
      });
    const overRacks = base();
    overRacks.racks = many(overRacks.racks[0], 33, (r, k) => { r.id = `R${k}`; });
    expect(() => parseScenario(overRacks)).toThrow();
    const overLocations = base();
    overLocations.locations = many(overLocations.locations[0], 129, (l, k) => { l.id = `L${k}`; });
    expect(() => parseScenario(overLocations)).toThrow();
    const overProducts = base();
    overProducts.products = many(overProducts.products[0], 65, (p, k) => { p.id = `P${k}`; });
    expect(() => parseScenario(overProducts)).toThrow();
    const overOrders = base();
    overOrders.orders = many(overOrders.orders[0], 129, (o, k) => { o.id = `O${k}`; });
    expect(() => parseScenario(overOrders)).toThrow();
    const overLines = base();
    overLines.orders[0].lines = many(overLines.orders[0].lines[0], 65, () => {});
    expect(() => parseScenario(overLines)).toThrow();
    const overTotal = base();
    overTotal.orders = many(overTotal.orders[0], 128, (o, k) => {
      o.id = `O${k}`;
      o.lines = many(o.lines[0], 64, () => {});
    });
    expect(() => parseScenario(overTotal)).toThrow();
    expect(() => parseProposal({
      scenarioRevision: 0,
      changes: many({ productId: "sku-a", locationId: "L1" }, 65, () => {}),
      rationale: "",
    })).toThrow();
    expect(() => requirements({ lockedProductIds: many("sku-a", 65, () => {}) })).toThrow();
  });

  test("invalid assignments stay representable for diagnosis", () => {
    const raw = JSON.parse(JSON.stringify(oracle()));
    raw.assignments = [
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-a", locationId: "L2" },
    ];
    const parsed = parseScenario(raw); // parses; validator diagnoses
    const v = validateAssignment(parsed, parsed.assignments, req(), parsed.assignments);
    expect(v.valid).toBe(false);
    expect(codes(v.errors)).toContain("ASSIGNMENT_DUPLICATE_PRODUCT");
    expect(codes(v.errors)).toContain("ASSIGNMENT_MISSING_PRODUCT");
  });
});

describe("assignment validation (brief 27)", () => {
  test("duplicate product assignment", () => {
    const s = oracle();
    const v = validateAssignment(s, [
      { productId: "sku-a", locationId: "L1" },
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L2" },
    ], req());
    expect(codes(v.errors)).toContain("ASSIGNMENT_DUPLICATE_PRODUCT");
  });

  test("duplicate location occupancy", () => {
    const s = oracle();
    const v = validateAssignment(s, [
      { productId: "sku-a", locationId: "L1" },
      { productId: "sku-b", locationId: "L1" },
    ], req());
    expect(v.valid).toBe(false);
    expect(codes(v.errors)).toContain("LOCATION_OCCUPIED");
  });

  test("missing product", () => {
    const s = oracle();
    const v = validateAssignment(s, [{ productId: "sku-a", locationId: "L1" }], req());
    expect(codes(v.errors)).toContain("ASSIGNMENT_MISSING_PRODUCT");
  });

  test("unknown location and unknown product", () => {
    const s = oracle();
    const v = validateAssignment(s, [
      { productId: "sku-a", locationId: "L-ghost" },
      { productId: "sku-ghost", locationId: "L1" },
    ], req());
    expect(codes(v.errors)).toContain("ASSIGNMENT_UNKNOWN_LOCATION");
    expect(codes(v.errors)).toContain("ASSIGNMENT_UNKNOWN_PRODUCT");
  });

  test("incompatible storage class", () => {
    const s = loadFixture("sample", "warehouse-basic");
    const moved = s.assignments.map((a) =>
      a.productId === "sku-f" ? { ...a, locationId: "L1" } : a
    );
    const v = validateAssignment(s, moved, req());
    expect(codes(v.errors)).toContain("CLASS_MISMATCH");
  });

  test("load dimensions exceeding location dimensions", () => {
    const s = oracle();
    const big = structuredClone(s);
    big.products[0]!.storedLoadDimensionsMm.width = 601; // L1 usable is 600
    const v = validateAssignment(big, big.assignments, req());
    expect(codes(v.errors)).toContain("DIMENSIONS_EXCEED");
  });

  test("fixed orientation: rotation does not count as fit", () => {
    const s = oracle();
    const rotated = structuredClone(s);
    // Load 600x400 would fit a 400x600 box only by rotating; fixed rule rejects.
    rotated.products[0]!.storedLoadDimensionsMm = { width: 600, depth: 601, height: 400 };
    const v = validateAssignment(rotated, rotated.assignments, req());
    expect(codes(v.errors)).toContain("DIMENSIONS_EXCEED");
  });

  test("locked assignment changed", () => {
    const s = loadFixture("sample", "warehouse-basic"); // sku-a locked to L1
    const moved = s.assignments.map((a) =>
      a.productId === "sku-a" ? { ...a, locationId: "L2" } : a
    );
    const v = validateAssignment(s, moved, req());
    expect(codes(v.errors)).toContain("LOCKED_LOCATION_CHANGED");
  });

  test("requirements lock and unknown lock", () => {
    const s = oracle();
    const moved = [
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L1" },
    ];
    const v = validateAssignment(s, moved, requirements({ lockedProductIds: ["sku-a"] }));
    expect(codes(v.errors)).toContain("REQUIREMENT_LOCK_CHANGED");
    const v2 = validateAssignment(s, s.assignments, requirements({ lockedProductIds: ["ghost"] }));
    expect(codes(v2.errors)).toContain("LOCKED_UNKNOWN_PRODUCT");
  });

  test("relocation budget exceeded, exact budget admitted", () => {
    const s = oracle();
    const swap = [
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L1" },
    ];
    const over = validateAssignment(s, swap, requirements({ maxRelocatedProducts: 1 }));
    expect(over.relocationCount).toBe(2);
    expect(codes(over.errors)).toContain("BUDGET_EXCEEDED");
    const exact = validateAssignment(s, swap, requirements({ maxRelocatedProducts: 2 }));
    expect(exact.valid).toBe(true);
  });

  test("allowlist violations and unknown allowlist refs", () => {
    const s = oracle();
    const withLists = structuredClone(s);
    withLists.locations[0]!.allowedProductIds = ["sku-b"];
    const v = validateAssignment(withLists, withLists.assignments, req());
    expect(codes(v.errors)).toContain("PRODUCT_NOT_ALLOWED");
    withLists.locations[0]!.allowedProductIds = ["sku-a", "ghost"];
    const v2 = validateAssignment(withLists, withLists.assignments, req());
    expect(codes(v2.errors)).toContain("ALLOWLIST_UNKNOWN_PRODUCT");
  });

  test("unknown product in order lines", () => {
    const s = oracle();
    const bad = structuredClone(s);
    bad.orders[0]!.lines.push({ productId: "ghost", quantity: 1 });
    const v = validateAssignment(bad, bad.assignments, req());
    expect(codes(v.errors)).toContain("ORDER_UNKNOWN_PRODUCT");
  });
});

describe("adversarial ids", () => {
  test("location @packing is reserved; product @packing stays legal", () => {
    const raw = JSON.parse(JSON.stringify(oracle()));
    raw.locations[0].id = "@packing";
    expect(() => parseScenario(raw)).toThrow();
    const renamed = structuredClone(oracle());
    renamed.products[0]!.id = "@packing";
    renamed.assignments[0]!.productId = "@packing";
    for (const order of renamed.orders) {
      for (const line of order.lines) {
        if (line.productId === "sku-a") line.productId = "@packing";
      }
    }
    const baseline = evaluateBaseline(renamed, req());
    expect(baseline.valid).toBe(true);
    expect(baseline.weightedTravelMm).toBe(16000);
  });

  test("programmatic reserved location id is a validation error", () => {
    const s = oracle();
    const bad = structuredClone(s);
    bad.locations[0]!.id = "@packing";
    const v = validateAssignment(bad, bad.assignments, req(), bad.assignments);
    expect(codes(v.errors)).toContain("RESERVED_LOCATION_ID");
  });

  test("delimiter-heavy ids cannot alias cache pairs or stable keys", () => {
    const renamed = structuredClone(oracle());
    renamed.products[0]!.id = "p>1";
    renamed.products[1]!.id = "p,2";
    renamed.locations[0]!.id = "L->1";
    renamed.locations[1]!.id = "L>2,";
    renamed.assignments = [
      { productId: "p>1", locationId: "L->1" },
      { productId: "p,2", locationId: "L>2," },
    ];
    for (const order of renamed.orders) {
      for (const line of order.lines) {
        line.productId = line.productId === "sku-a" ? "p>1" : "p,2";
      }
    }
    const baseline = evaluateBaseline(renamed, req());
    expect(baseline.valid).toBe(true);
    expect(baseline.weightedTravelMm).toBe(16000);
    // These two mappings shared one key under naive ->/, joining.
    const m1 = [{ productId: "a", locationId: "b,c->d" }];
    const m2 = [
      { productId: "a", locationId: "b" },
      { productId: "c", locationId: "d" },
    ];
    expect(stableAssignmentKey(m1)).not.toBe(stableAssignmentKey(m2));
  });
});

describe("atomic proposals", () => {
  test("partial proposal collides atomically without evicting", () => {
    const s = oracle();
    const applied = applyProposal(s, parseProposal({
      scenarioRevision: 0,
      changes: [{ productId: "sku-a", locationId: "L2" }],
      rationale: "partial",
    }));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    // B still present: nothing was silently evicted or dropped.
    expect(applied.finalMapping).toContainEqual({ productId: "sku-b", locationId: "L2" });
    const v = validateAssignment(s, applied.finalMapping, req());
    expect(v.valid).toBe(false);
    expect(codes(v.errors)).toContain("LOCATION_OCCUPIED");
  });

  test("every proposal starts from the original baseline", () => {
    const s = oracle();
    const first = applyProposal(s, parseProposal({
      scenarioRevision: 0,
      changes: [
        { productId: "sku-a", locationId: "L2" },
        { productId: "sku-b", locationId: "L1" },
      ],
      rationale: "swap",
    }));
    expect(first.ok).toBe(true);
    const second = applyProposal(s, parseProposal({
      scenarioRevision: 0,
      changes: [{ productId: "sku-a", locationId: "L2" }],
      rationale: "partial",
    }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // B comes from the baseline (L2), not from the first proposal (L1).
    expect(second.finalMapping).toContainEqual({ productId: "sku-b", locationId: "L2" });
  });

  test("proposal rejects stale revisions, unknown refs, duplicates", () => {
    const s = oracle();
    const stale = applyProposal(s, parseProposal({ scenarioRevision: 3, changes: [], rationale: "" }));
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(codes(stale.errors)).toContain("STALE_REVISION");

    const bad = applyProposal(s, parseProposal({
      scenarioRevision: 0,
      changes: [
        { productId: "sku-a", locationId: "ghost" },
        { productId: "ghost", locationId: "L1" },
        { productId: "sku-a", locationId: "L1" },
      ],
      rationale: "",
    }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(codes(bad.errors)).toContain("PROPOSAL_UNKNOWN_LOCATION");
    expect(codes(bad.errors)).toContain("PROPOSAL_UNKNOWN_PRODUCT");
    expect(codes(bad.errors)).toContain("PROPOSAL_DUPLICATE_PRODUCT");
  });

  test("empty change list retains the baseline", () => {
    const s = oracle();
    const applied = applyProposal(s, parseProposal({ scenarioRevision: 0, changes: [], rationale: "keep" }));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.finalMapping).toEqual(s.assignments);
  });

  test("empty proposal never repairs a duplicated baseline", () => {
    const s = oracle();
    const dup = structuredClone(s);
    dup.assignments = [
      { productId: "sku-a", locationId: "L1" },
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L2" },
    ];
    const applied = applyProposal(dup, parseProposal({ scenarioRevision: 0, changes: [], rationale: "" }));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.finalMapping).toEqual(dup.assignments);
    const v = validateAssignment(dup, applied.finalMapping, req(), dup.assignments);
    expect(codes(v.errors)).toContain("ASSIGNMENT_DUPLICATE_PRODUCT");
  });

  test("change to a duplicated baseline product is rejected as ambiguous", () => {
    const s = oracle();
    const dup = structuredClone(s);
    dup.assignments = [
      { productId: "sku-a", locationId: "L1" },
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L1" },
    ];
    const applied = applyProposal(dup, parseProposal({
      scenarioRevision: 0,
      changes: [{ productId: "sku-a", locationId: "L1" }],
      rationale: "",
    }));
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(codes(applied.errors)).toContain("PROPOSAL_AMBIGUOUS_BASELINE");
    // Untouched duplicates still materialize for validator diagnosis.
    const untouched = applyProposal(dup, parseProposal({
      scenarioRevision: 0,
      changes: [{ productId: "sku-b", locationId: "L2" }],
      rationale: "",
    }));
    expect(untouched.ok).toBe(true);
    if (!untouched.ok) return;
    expect(untouched.finalMapping.filter((a) => a.productId === "sku-a")).toHaveLength(2);
  });

  test("baseline input is never mutated", () => {
    const s = oracle();
    const before = JSON.stringify(s.assignments);
    applyProposal(s, parseProposal({
      scenarioRevision: 0,
      changes: [{ productId: "sku-a", locationId: "L2" }],
      rationale: "",
    }));
    evaluateBaseline(s, req());
    expect(JSON.stringify(s.assignments)).toBe(before);
  });

  test("invalid scene and invalid assignment are distinguished", () => {
    const badScene = structuredClone(oracle());
    badScene.racks[0]!.positionMm = { x: 100_000, z: 100_000 };
    const sceneReport = createReport(badScene, req(), []);
    expect(sceneReport.outcome).toBe("INPUT_INVALID");
    expect(codes(sceneReport.baseline.errors)).toContain("RACK_OUT_OF_BOUNDS");
    expect(sceneReport.baseline.workload).toBeNull();

    const s = oracle();
    const badMapping = [
      { productId: "sku-a", locationId: "L1" },
      { productId: "sku-b", locationId: "L1" },
    ];
    const assignReport = createReport(s, req(), [{ name: "bad", mapping: badMapping }]);
    expect(assignReport.outcome).not.toBe("INPUT_INVALID");
    expect(codes(assignReport.candidates[0]!.errors)).toContain("LOCATION_OCCUPIED");
    expect(assignReport.candidates[0]!.workload).toBeNull();
  });
});
