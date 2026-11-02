// Unit tests for the shared environment geometry helpers. All expected
// values are independent literals computed by hand from the documented
// source measurements, not by calling the helpers under test.
import { describe, expect, it } from "vitest";
import {
  containerGrid,
  containersForStock,
  deckIndexForAnchorY,
  deckTopYMm,
  rackAxisScale,
} from "../src/environment.js";

// W1-measured rack_large_empty_a02 source bounds (m, Z-up):
// x +-1.999989, y +-1.033291, z 0..3.010001.
const A02 = { x: 3.999978, y: 2.066581, z: 3.010001 };
const A02_DECKS_Z = [0.45, 1.58, 2.33];

describe("rackAxisScale", () => {
  it("scales a 4000x2000x3010 rack near unity", () => {
    const s = rackAxisScale(A02, { width: 4000, depth: 2000, height: 3010 });
    // Independent literals: 4/3.999978, 3.01/3.010001, 2/2.066581.
    expect(s.x).toBeCloseTo(1.000006, 6);
    expect(s.y).toBeCloseTo(0.99999967, 6);
    expect(s.z).toBeCloseTo(0.967782, 6);
  });
  it("matches the W1 1600x800x2000 calibration", () => {
    const s = rackAxisScale(A02, { width: 1600, depth: 800, height: 2000 });
    expect(s.x).toBeCloseTo(0.400002, 6);
    expect(s.y).toBeCloseTo(0.664452, 6);
    expect(s.z).toBeCloseTo(0.387113, 6);
  });
  it("rejects non-positive source sizes", () => {
    expect(() => rackAxisScale({ x: 0, y: 1, z: 1 }, { width: 1, depth: 1, height: 1 })).toThrow(RangeError);
  });
});

describe("deckTopYMm", () => {
  it("maps source decks to mm for a 3010mm rack", () => {
    const tops = A02_DECKS_Z.map((z) => deckTopYMm(A02.z, z, 3010));
    // 0.45*3010/3.010001 = 449.99985...; rounds to exact integers.
    expect(tops[0]).toBeCloseTo(449.99985, 4);
    expect(tops[1]).toBeCloseTo(1579.99948, 4);
    expect(tops[2]).toBeCloseTo(2329.99923, 4);
    expect(tops.map(Math.round)).toEqual([450, 1580, 2330]);
  });
  it("rejects non-positive inputs", () => {
    expect(() => deckTopYMm(0, 0.45, 3010)).toThrow(RangeError);
    expect(() => deckTopYMm(A02.z, -1, 3010)).toThrow(RangeError);
  });
});

describe("deckIndexForAnchorY", () => {
  it("resolves anchors to decks and rejects off-deck heights", () => {
    expect(deckIndexForAnchorY(450, [450, 1580, 2330])).toBe(0);
    expect(deckIndexForAnchorY(1580, [450, 1580, 2330])).toBe(1);
    expect(deckIndexForAnchorY(2330, [450, 1580, 2330])).toBe(2);
    expect(deckIndexForAnchorY(1000, [450, 1580, 2330])).toBe(-1);
    expect(deckIndexForAnchorY(0, [450, 1580, 2330])).toBe(-1);
  });
});

describe("containersForStock", () => {
  it("requires exact multiples (no fractional containers)", () => {
    expect(containersForStock(48, 8)).toBe(6);
    expect(containersForStock(12, 12)).toBe(1);
    expect(() => containersForStock(50, 8)).toThrow(RangeError);
    expect(() => containersForStock(0, 8)).toThrow(RangeError);
  });
});

describe("containerGrid", () => {
  it("lays 6 boxes 2x3 in a 1900x1900x700 slot", () => {
    const g = containerGrid(
      { width: 1900, depth: 1900, height: 700 },
      { width: 700, depth: 522, height: 510 },
      6,
    );
    expect({ cols: g.cols, rows: g.rows, layers: g.layers }).toEqual({ cols: 2, rows: 3, layers: 1 });
    expect(g.placements).toHaveLength(6);
    // Centered: x offsets +-350, z offsets -522, 0, +522, all on deck (dy 0).
    const xs = [...new Set(g.placements.map((p) => p.dxMm))].sort((a, b) => a - b);
    const zs = [...new Set(g.placements.map((p) => p.dzMm))].sort((a, b) => a - b);
    expect(xs).toEqual([-350, 350]);
    expect(zs).toEqual([-522, 0, 522]);
    expect(g.placements.every((p) => p.dyMm === 0)).toBe(true);
    // Every placement stays inside the usable box.
    for (const p of g.placements) {
      expect(Math.abs(p.dxMm) + 350).toBeLessThanOrEqual(950);
      expect(Math.abs(p.dzMm) + 261).toBeLessThanOrEqual(950);
    }
  });
  it("lays 12 crates 3x4 in a 1900x1900x700 slot", () => {
    const g = containerGrid(
      { width: 1900, depth: 1900, height: 700 },
      { width: 606, depth: 406, height: 254 },
      12,
    );
    expect({ cols: g.cols, rows: g.rows, layers: g.layers }).toEqual({ cols: 3, rows: 4, layers: 2 });
    expect(g.placements).toHaveLength(12);
    expect(g.placements.every((p) => p.dyMm === 0)).toBe(true);
    for (const p of g.placements) {
      expect(Math.abs(p.dxMm) + 303).toBeLessThanOrEqual(950);
      expect(Math.abs(p.dzMm) + 203).toBeLessThanOrEqual(950);
    }
  });
  it("stacks a second layer exactly one container high", () => {
    const g = containerGrid(
      { width: 1900, depth: 1900, height: 700 },
      { width: 606, depth: 406, height: 254 },
      13,
    );
    expect(g.placements).toHaveLength(13);
    const top = g.placements.filter((p) => p.dyMm > 0);
    expect(top).toHaveLength(1);
    expect(top[0]?.dyMm).toBe(254);
  });
  it("throws instead of shrinking on overflow", () => {
    expect(() =>
      containerGrid(
        { width: 1900, depth: 1900, height: 700 },
        { width: 700, depth: 522, height: 510 },
        7,
      ),
    ).toThrow(RangeError);
    expect(() =>
      containerGrid(
        { width: 100, depth: 100, height: 100 },
        { width: 700, depth: 522, height: 510 },
        1,
      ),
    ).toThrow(RangeError);
  });
});
