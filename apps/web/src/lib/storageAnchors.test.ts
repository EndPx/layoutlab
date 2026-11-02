// R1 storage-anchor checks. Expected coordinates are literal numbers
// derived by hand from fixture geometry — never the resolver twice.
import { describe, expect, test } from "vitest";
import { parseScenario, rackFootprint, type Scenario } from "@layoutlab/core";
import sampleJson from "../../../../fixtures/sample/warehouse-basic.json";
import {
  rectsOverlapInterior,
  resolveProductPlacements,
  resolveStorageAnchors,
  rotateRackLocal,
} from "./storageAnchors";

const sample = parseScenario(structuredClone(sampleJson));

// Hand-derived from fixtures/sample/warehouse-basic.json: each 1600x800
// rack holds 2 slots split across the width (slot centers +/-400mm).
const EXPECTED_CENTERS: Record<string, { x: number; z: number }> = {
  L1: { x: 900, z: 1500 },
  L2: { x: 1700, z: 1500 },
  L3: { x: 4300, z: 1500 },
  L4: { x: 5100, z: 1500 },
  L5: { x: 900, z: 4500 },
  L6: { x: 1700, z: 4500 },
  L7: { x: 4300, z: 4500 },
  L8: { x: 5100, z: 4500 },
};

describe("sample anchors", () => {
  test("all 8 locations resolve to literal inside-rack centers", () => {
    const { anchors, diagnostics } = resolveStorageAnchors(sample);
    expect(diagnostics).toEqual([]);
    expect(anchors.size).toBe(8);
    for (const [id, want] of Object.entries(EXPECTED_CENTERS)) {
      const a = anchors.get(id);
      expect(a, id).toBeDefined();
      expect(a!.centerMm).toEqual(want);
      expect(a!.baseYMm).toBe(0);
      expect(a!.layout).toBe("width-row");
      expect(a!.slotCount).toBe(2);
    }
    // Slot identity is stable: L1 is slot 0, L2 slot 1 of R1.
    expect(anchors.get("L1")!.slotIndex).toBe(0);
    expect(anchors.get("L2")!.slotIndex).toBe(1);
    // L1 slot rect: usable 800x600 centered at (900,1500).
    expect(anchors.get("L1")!.slotRectMm).toEqual({ minX: 500, maxX: 1300, minZ: 1200, maxZ: 1800 });
  });

  test("anchors are distinct from aisle pick points; inputs untouched", () => {
    const before = JSON.stringify(sample);
    const { anchors } = resolveStorageAnchors(sample);
    expect(JSON.stringify(sample)).toBe(before);
    const picks = new Map(sample.locations.map((l) => [l.id, l.pickPointMm]));
    // Every anchor sits inside a rack, every pick point in an aisle.
    expect(picks.get("L1")).toEqual({ x: 2900, z: 1500 });
    expect(anchors.get("L1")!.centerMm).toEqual({ x: 900, z: 1500 });
    for (const [id, a] of anchors) {
      const p = picks.get(id)!;
      expect(`${a.centerMm.x},${a.centerMm.z}`).not.toBe(`${p.x},${p.z}`);
    }
  });

  test("slot rects sit inside the core rack footprint (independent oracle)", () => {
    const { anchors } = resolveStorageAnchors(sample);
    const racks = new Map(sample.racks.map((r) => [r.id, r]));
    for (const [, a] of anchors) {
      const f = rackFootprint(racks.get(a.rackId)!);
      expect(a.slotRectMm.minX).toBeGreaterThanOrEqual(f.minX);
      expect(a.slotRectMm.maxX).toBeLessThanOrEqual(f.maxX);
      expect(a.slotRectMm.minZ).toBeGreaterThanOrEqual(f.minZ);
      expect(a.slotRectMm.maxZ).toBeLessThanOrEqual(f.maxZ);
    }
  });

  test("no interior overlap between sample slot rects", () => {
    const { anchors } = resolveStorageAnchors(sample);
    const list = [...anchors.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        expect(rectsOverlapInterior(list[i]!.slotRectMm, list[j]!.slotRectMm)).toBe(false);
      }
    }
    // Edge touch is adjacent, not overlap: L1/L2 share x=1300.
    expect(anchors.get("L1")!.slotRectMm.maxX).toBe(anchors.get("L2")!.slotRectMm.minX);
  });
});

describe("product placements", () => {
  test("sample loads fit their slots with literal rects", () => {
    const { anchors } = resolveStorageAnchors(sample);
    const { placements, diagnostics } = resolveProductPlacements(sample, sample.assignments, anchors);
    expect(diagnostics).toEqual([]);
    expect(placements).toHaveLength(6);
    // sku-a load 500x400 centered at L1 (900,1500).
    const a = placements.find((p) => p.productId === "sku-a")!;
    expect(a.locationId).toBe("L1");
    expect(a.loadRectMm).toEqual({ minX: 650, maxX: 1150, minZ: 1300, maxZ: 1700 });
    expect(a.loadHeightMm).toBe(600);
    expect(a.fits).toBe(true);
    // Every load rect is contained in its slot rect.
    for (const p of placements) {
      const s = anchors.get(p.locationId)!.slotRectMm;
      expect(p.loadRectMm.minX).toBeGreaterThanOrEqual(s.minX);
      expect(p.loadRectMm.maxX).toBeLessThanOrEqual(s.maxX);
      expect(p.loadRectMm.minZ).toBeGreaterThanOrEqual(s.minZ);
      expect(p.loadRectMm.maxZ).toBeLessThanOrEqual(s.maxZ);
    }
    // Occupied loads never overlap each other.
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        expect(rectsOverlapInterior(placements[i]!.loadRectMm, placements[j]!.loadRectMm)).toBe(false);
      }
    }
  });

  test("reassignment moves the rendered product to the destination anchor", () => {
    const { anchors } = resolveStorageAnchors(sample);
    const moved = sample.assignments.map((a) =>
      a.productId === "sku-b" ? { productId: "sku-b", locationId: "L6" } : { ...a },
    );
    const { placements } = resolveProductPlacements(sample, moved, anchors);
    const b = placements.find((p) => p.productId === "sku-b")!;
    // L6 anchor (1700,4500); load 500x400 -> literal rect.
    expect(b.locationId).toBe("L6");
    expect(b.anchor.centerMm).toEqual({ x: 1700, z: 4500 });
    expect(b.loadRectMm).toEqual({ minX: 1450, maxX: 1950, minZ: 4300, maxZ: 4700 });
    // Anchors are assignment-independent: the map is unchanged by the move.
    expect(anchors.get("L2")!.centerMm).toEqual({ x: 1700, z: 1500 });
  });

  test("duplicate assignment keeps every occupant (never a Map overwrite)", () => {
    const { anchors } = resolveStorageAnchors(sample);
    const dup = [...sample.assignments.map((a) => ({ ...a })), { productId: "sku-f", locationId: "L1" }];
    const { placements } = resolveProductPlacements(sample, dup, anchors);
    const atL1 = placements.filter((p) => p.locationId === "L1").map((p) => p.productId).sort();
    expect(atL1).toEqual(["sku-a", "sku-f"]);
    const occupants = placements.filter((p) => p.locationId === "L1");
    expect(occupants.map((p) => p.occupantCount)).toEqual([2, 2]);
    expect(occupants.map((p) => p.occupantIndex).sort()).toEqual([0, 1]);
  });

  test("oversize load is diagnosed, still true-size", () => {
    const big: Scenario = {
      ...structuredClone(sample),
      products: sample.products.map((p) =>
        p.id === "sku-b"
          ? { ...p, storedLoadDimensionsMm: { width: 900, depth: 400, height: 600 } }
          : { ...p },
      ),
    };
    const { anchors } = resolveStorageAnchors(big);
    const { placements, diagnostics } = resolveProductPlacements(big, big.assignments, anchors);
    const b = placements.find((p) => p.productId === "sku-b")!;
    expect(b.fits).toBe(false);
    // True 900mm width centered at L2 (1700,1500): no shrinking.
    expect(b.loadRectMm).toEqual({ minX: 1250, maxX: 2150, minZ: 1300, maxZ: 1700 });
    expect(diagnostics.map((d) => d.code)).toContain("ANCHOR_LOAD_EXCEEDS_SLOT");
  });
});

function twoSlotScenario(yaw: 0 | 90 | 180 | 270): Scenario {
  const base = structuredClone(sample);
  return {
    ...base,
    id: `yaw-${yaw}`,
    racks: [
      {
        id: "R",
        positionMm: { x: 1000, z: 1000 },
        dimensionsMm: { width: 1600, depth: 800, height: 2000 },
        yawDeg: yaw,
      },
    ],
    locations: ["A", "B"].map((id) => ({
      id,
      rackId: "R",
      label: `slot ${id}`,
      usableDimensionsMm: { width: 800, depth: 600, height: 1000 },
      storageClass: "ambient",
      pickPointMm: { x: 3000, z: 1000 },
    })),
  };
}

describe("yaw transforms", () => {
  test("slot centers rotate with the rack (three.js rotationY direction)", () => {
    // Local slots at (-400,0) and (+400,0); rotationY maps
    // 0:(x,z) 90:(z,-x) 180:(-x,-z) 270:(-z,x) about (1000,1000).
    const want: Record<number, [{ x: number; z: number }, { x: number; z: number }]> = {
      0: [{ x: 600, z: 1000 }, { x: 1400, z: 1000 }],
      90: [{ x: 1000, z: 1400 }, { x: 1000, z: 600 }],
      180: [{ x: 1400, z: 1000 }, { x: 600, z: 1000 }],
      270: [{ x: 1000, z: 600 }, { x: 1000, z: 1400 }],
    };
    for (const yaw of [0, 90, 180, 270] as const) {
      const { anchors, diagnostics } = resolveStorageAnchors(twoSlotScenario(yaw));
      expect(diagnostics).toEqual([]);
      expect(anchors.get("A")!.centerMm).toEqual(want[yaw]![0]);
      expect(anchors.get("B")!.centerMm).toEqual(want[yaw]![1]);
      // 90/270 swap the world footprint axes like the core footprint.
      const rect = anchors.get("A")!.slotRectMm;
      const w = rect.maxX - rect.minX;
      const d = rect.maxZ - rect.minZ;
      if (yaw === 90 || yaw === 270) {
        expect([w, d]).toEqual([600, 800]);
      } else {
        expect([w, d]).toEqual([800, 600]);
      }
    }
  });

  test("rotateRackLocal matches the resolver on all four yaws", () => {
    expect(rotateRackLocal(-400, 0, 0)).toEqual({ dx: -400, dz: 0 });
    expect(rotateRackLocal(-400, 0, 90)).toEqual({ dx: 0, dz: 400 });
    expect(rotateRackLocal(-400, 0, 180)).toEqual({ dx: 400, dz: 0 });
    expect(rotateRackLocal(-400, 0, 270)).toEqual({ dx: 0, dz: -400 });
  });
});

describe("diagnostics", () => {
  test("missing rack yields no pose", () => {
    const broken = structuredClone(sample);
    broken.locations = broken.locations.map((l) => (l.id === "L1" ? { ...l, rackId: "RX" } : l));
    const { anchors, diagnostics } = resolveStorageAnchors(broken);
    expect(anchors.has("L1")).toBe(false);
    expect(diagnostics.find((d) => d.locationId === "L1")!.code).toBe("ANCHOR_MISSING_RACK");
    expect(anchors.size).toBe(7);
  });

  test("benchmark-small rack (400x400, usable 800x600) cannot host a slot", () => {
    const small = structuredClone(sample);
    small.racks = small.racks.map((r) => ({
      ...r,
      dimensionsMm: { width: 400, depth: 400, height: 2000 },
    }));
    const { anchors, diagnostics } = resolveStorageAnchors(small);
    expect(anchors.size).toBe(0);
    expect(diagnostics).toHaveLength(8);
    expect(new Set(diagnostics.map((d) => d.code))).toEqual(new Set(["ANCHOR_SLOT_EXCEEDS_CELL"]));
  });

  test("depth-split rack resolves along the depth axis", () => {
    const tall = structuredClone(sample);
    tall.racks = [
      {
        id: "R",
        positionMm: { x: 1000, z: 1000 },
        dimensionsMm: { width: 800, depth: 1600, height: 2000 },
        yawDeg: 0,
      },
    ];
    tall.locations = ["A", "B"].map((id) => ({
      id,
      rackId: "R",
      label: `slot ${id}`,
      usableDimensionsMm: { width: 600, depth: 800, height: 1000 },
      storageClass: "ambient",
      pickPointMm: { x: 3000, z: 1000 },
    }));
    const { anchors, diagnostics } = resolveStorageAnchors(tall);
    expect(diagnostics).toEqual([]);
    expect(anchors.get("A")!.layout).toBe("depth-col");
    expect(anchors.get("A")!.centerMm).toEqual({ x: 1000, z: 600 });
    expect(anchors.get("B")!.centerMm).toEqual({ x: 1000, z: 1400 });
  });

  test("unknown assignment refs are diagnosed, never crash", () => {
    const { anchors } = resolveStorageAnchors(sample);
    const { placements, diagnostics } = resolveProductPlacements(
      sample,
      [{ productId: "sku-zzz", locationId: "L1" }],
      anchors,
    );
    expect(placements).toHaveLength(0);
    expect(diagnostics.map((d) => d.code)).toContain("ANCHOR_UNKNOWN_REF");
  });
});
