import { describe, expect, test } from "vitest";
import { parseOperationsScenario } from "../src/index.js";
import { cloneRaw, tinyOperationsScenario } from "./fixtures.js";

describe("M3a traffic zones (optional schema field)", () => {
  test("fixtures without trafficZones parse unchanged (backward compat)", () => {
    const raw = tinyOperationsScenario() as Record<string, unknown>;
    const geom = (raw.geometry ?? {}) as Record<string, unknown>;
    expect("trafficZones" in geom).toBe(false);
    const parsed = parseOperationsScenario(raw);
    expect(parsed.geometry.trafficZones).toBeUndefined();
  });

  test("valid narrow-aisle and intersection zones parse", () => {
    const raw = cloneRaw(tinyOperationsScenario());
    const geom = raw.geometry as Record<string, unknown>;
    geom.trafficZones = [
      { id: "Z-A", kind: "narrow-aisle", minXMm: 1000, minZMm: 1000, maxXMm: 2000, maxZMm: 1500 },
      { id: "Z-B", kind: "intersection", minXMm: 3000, minZMm: 1000, maxXMm: 3500, maxZMm: 2000 },
    ];
    const parsed = parseOperationsScenario(raw);
    expect(parsed.geometry.trafficZones?.map((z) => z.id)).toEqual(["Z-A", "Z-B"]);
  });

  test("degenerate zone rectangle is rejected", () => {
    const raw = cloneRaw(tinyOperationsScenario());
    (raw.geometry as Record<string, unknown>).trafficZones = [
      { id: "Z-BAD", kind: "narrow-aisle", minXMm: 2000, minZMm: 1000, maxXMm: 2000, maxZMm: 1500 },
    ];
    expect(() => parseOperationsScenario(raw)).toThrow(/degenerate traffic zone/);
  });

  test("zone exceeding room bounds is rejected", () => {
    const raw = cloneRaw(tinyOperationsScenario());
    (raw.geometry as Record<string, unknown>).trafficZones = [
      // Tiny room is 6000x4000; maxX 7000 exceeds width.
      { id: "Z-OOB", kind: "intersection", minXMm: 1000, minZMm: 1000, maxXMm: 7000, maxZMm: 1500 },
    ];
    expect(() => parseOperationsScenario(raw)).toThrow(/exceeds room bounds/);
  });

  test("duplicate zone ids are rejected", () => {
    const raw = cloneRaw(tinyOperationsScenario());
    (raw.geometry as Record<string, unknown>).trafficZones = [
      { id: "Z-DUP", kind: "narrow-aisle", minXMm: 1000, minZMm: 1000, maxXMm: 2000, maxZMm: 1500 },
      { id: "Z-DUP", kind: "intersection", minXMm: 3000, minZMm: 1000, maxXMm: 3500, maxZMm: 2000 },
    ];
    expect(() => parseOperationsScenario(raw)).toThrow(/duplicate id: Z-DUP/);
  });

  test("unknown zone kind is rejected", () => {
    const raw = cloneRaw(tinyOperationsScenario());
    (raw.geometry as Record<string, unknown>).trafficZones = [
      { id: "Z-X", kind: "wide-aisle", minXMm: 1000, minZMm: 1000, maxXMm: 2000, maxZMm: 1500 },
    ];
    expect(() => parseOperationsScenario(raw)).toThrow();
  });
});
