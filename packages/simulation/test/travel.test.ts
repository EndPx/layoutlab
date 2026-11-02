import { describe, expect, test } from "vitest";
import { MAX_TIME_MS, travelTimeMs } from "../src/index.js";

describe("travel-time helper", () => {
  test.each([
    [1000, 3000, 334],
    [1501, 1000, 1501],
    [1, 3000, 1],
    [0, 3000, 0],
    [3000, 3000, 1000],
    [3001, 3000, 1001],
  ])("ceil(%i*1000/%i) = %i ms", (distance, speed, expected) => {
    expect(travelTimeMs(distance, speed)).toBe(expected);
  });

  test.each([
    ["zero speed", 100, 0],
    ["negative speed", 100, -5],
    ["fractional speed", 100, 1.5],
    ["unsafe speed", 100, 2 ** 53],
    ["negative distance", -1, 1000],
    ["fractional distance", 1.5, 1000],
    ["unsafe distance", 2 ** 53, 1000],
  ])("invalid input is rejected (%s)", (_label, distance, speed) => {
    expect(() => travelTimeMs(distance, speed)).toThrow();
  });

  test("overflow beyond the horizon bound is rejected exactly", () => {
    expect(() => travelTimeMs(Number.MAX_SAFE_INTEGER, 1)).toThrow();
    // Largest distance that still fits at 1000mm/s: floor bound/1000*1000
    // rounds up within the bound.
    const fits = Math.floor(MAX_TIME_MS / 1000) * 1000;
    expect(travelTimeMs(fits, 1000)).toBeLessThanOrEqual(MAX_TIME_MS);
    expect(() => travelTimeMs(fits + 1, 1)).toThrow();
  });
});
