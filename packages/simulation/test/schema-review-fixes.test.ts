import { describe, expect, test } from "vitest";
import { parseOperationsScenario } from "../src/index.js";
import { cloneRaw, tinyOperationsScenario } from "./fixtures.js";

const raw = () => cloneRaw(tinyOperationsScenario());

describe("review fix: dedicated product homes", () => {
  test("two product homes in one location are rejected", () => {
    const bad = raw();
    // Widen L-A1 so both products are eligible there: the only remaining
    // defect is the shared home location itself.
    const locations = bad.locations as Record<string, unknown>[];
    (locations[0].restrictions as Record<string, unknown>).eligibleHandlingClasses = [
      "ambient",
      "chilled",
    ];
    const homes = bad.homeAssignments as Record<string, unknown>[];
    homes[1].locationId = "L-A1";
    expect(() => parseOperationsScenario(bad)).toThrow("duplicate home location");
  });

  test("a cloned SKU pointing at the same home is rejected (repro shape)", () => {
    const bad = raw();
    const products = bad.products as Record<string, unknown>[];
    const clone = structuredClone(products[0]) as Record<string, unknown>;
    clone.id = "P-C";
    products.push(clone);
    const homes = bad.homeAssignments as Record<string, unknown>[];
    homes.push({ productId: "P-C", locationId: "L-A1" });
    expect(() => parseOperationsScenario(bad)).toThrow("duplicate home location");
  });

  test("distinct dedicated homes still parse with full coverage checks", () => {
    const scenario = parseOperationsScenario(tinyOperationsScenario());
    const homes = scenario.homeAssignments ?? [];
    expect(homes).toHaveLength(2);
    expect(new Set(homes.map((h) => h.locationId)).size).toBe(2);
    // Coverage, refs, and eligibility still enforced alongside dedication.
    const missing = raw();
    missing.homeAssignments = (
      missing.homeAssignments as Record<string, unknown>[]
    ).slice(0, 1);
    expect(() => parseOperationsScenario(missing)).toThrow();
  });
});

describe("review fix: single-item fixed-orientation fit", () => {
  test("oversized stock item is rejected even without homes", () => {
    const bad = raw();
    delete bad.homeAssignments;
    const products = bad.products as Record<string, unknown>[];
    // L-A1 usable width is 500: a 600-wide item cannot fit.
    (products[0].itemDimensionsMm as Record<string, unknown>).width = 600;
    expect(() => parseOperationsScenario(bad)).toThrow(
      "exceed location L-A1 usable dimensions (fixed orientation)",
    );
  });

  test("oversized home item is rejected even with empty stock", () => {
    const bad = raw();
    bad.initialStock = [];
    const products = bad.products as Record<string, unknown>[];
    // L-B1 usable height is 400: a 500-tall P-B item cannot fit its home.
    (products[1].itemDimensionsMm as Record<string, unknown>).height = 500;
    expect(() => parseOperationsScenario(bad)).toThrow(
      "exceed location L-B1 usable dimensions (fixed orientation)",
    );
  });

  test("an item that fits stock but not its reassigned home is rejected", () => {
    const bad = raw();
    const locations = bad.locations as Record<string, unknown>[];
    locations.push({
      id: "L-SMALL",
      rackId: "R1",
      storageAnchorMm: { x: 3000, y: 500, z: 1000 },
      approachPointMm: { x: 3000, z: 2200 },
      usableDimensionsMm: { width: 50, depth: 50, height: 50 },
      storageClass: "ambient",
      maxQuantity: 10,
      restrictions: { eligibleHandlingClasses: ["ambient"] },
    });
    const homes = bad.homeAssignments as Record<string, unknown>[];
    homes[0].locationId = "L-SMALL";
    // Stock (P-A at L-A1) still fits; only the home assignment is too small.
    expect(() => parseOperationsScenario(bad)).toThrow(
      "exceed location L-SMALL usable dimensions (fixed orientation)",
    );
  });

  test("exact-fit boundary passes: item equal to usable bounds fits", () => {
    const ok = raw();
    const products = ok.products as Record<string, unknown>[];
    // L-A1 usable is exactly 500 x 400 x 400.
    products[0].itemDimensionsMm = { width: 500, depth: 400, height: 400 };
    expect(() => parseOperationsScenario(ok)).not.toThrow();
  });
});
