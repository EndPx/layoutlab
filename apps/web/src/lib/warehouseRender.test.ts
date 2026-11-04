// R1 solid-cargo planning: every carried item must land physically inside
// its fixed cart cell at exactly its declared SKU dimensions. The fit
// arithmetic below is written independently (cell rects and AABBs recomputed
// from the plan output), never by re-calling the code under test.
import { describe, expect, it } from "vitest";
import { loadOperationsScene } from "./operations";
import {
  cargoFamilyTint,
  derivativeUrlFor,
  isDerivativeUrl,
  planCargoTransforms,
  type CargoFamily,
} from "./warehouseRender";

const scene = loadOperationsScene();
const carry = scene.carry;
// Measured source carton (bindings sourceMeasuredMm for box_cardboard_a01,
// GLB Y-up: X width, Y height, Z depth). The renderer measures the same box
// from the loaded geometry; the plan math only needs the size.
const CARTON_SIZE_M = { x: 0.699435, y: 0.509927, z: 0.521152 };
const FLOOR_TOP_MM = carry.crateInteriorMm.floorTopY;

function plan(
  carried: { productId: string; quantity: number }[],
  skuOverride?: Map<string, { width: number; depth: number; height: number }>,
) {
  const skuDims = skuOverride ?? new Map(scene.scenario.products.map((p) => [p.id, p.itemDimensionsMm]));
  const familyOf = new Map<string, CargoFamily>(
    scene.scenario.products.map((p) => [p.id, p.id <= "P06" ? "cardboard" : "plastic"]),
  );
  return planCargoTransforms({
    units: [{ unitId: "PK-T", pose: { x: 0, z: 0 }, carried }],
    docks: carry.docksUnitM,
    cells: carry.cellsCrateLocalMm,
    floorTopYMm: FLOOR_TOP_MM,
    cargoYawDeg: carry.cargoYawDeg,
    skuDims,
    cartonSizeM: CARTON_SIZE_M,
    familyOf,
  });
}

describe("v2 derivative routing", () => {
  it("maps the five recovered assets to sibling derivatives", () => {
    expect(derivativeUrlFor("/assets/warehouse-section/box_cardboard_a01.glb")).toBe(
      "/assets/warehouse-section/box_cardboard_a01-v2.glb",
    );
    expect(derivativeUrlFor("/assets/warehouse-cargo/cart_luggage_platform_a01.glb")).toContain("-v2.glb");
    expect(isDerivativeUrl("/assets/warehouse-section/crate_blue_a01-v2.glb")).toBe(true);
  });
  it("leaves unrecovered assets on their verified originals", () => {
    expect(derivativeUrlFor("/assets/warehouse-section/structure_wall_straight_a01.glb")).toBeNull();
    expect(derivativeUrlFor("/assets/warehouse-environment/table_packing_heavyduty_c01.glb")).toBeNull();
  });
});

describe("solid cargo fit (all 12 SKUs x every cell)", () => {
  it("places each SKU inside its cell with zero protrusion at exact SKU dims", () => {
    for (const p of scene.scenario.products) {
      // Fill all 4 cells with this SKU (capacity is cost units, so 4 items).
      const { items, rejected, overflow } = plan([{ productId: p.id, quantity: 4 }]);
      expect(rejected, p.id).toEqual([]);
      expect(overflow).toEqual([]);
      expect(items, p.id).toHaveLength(4);
      const dims = p.itemDimensionsMm;
      items.forEach((it, i) => {
        const cell = carry.cellsCrateLocalMm.find((c) => c.id === it.cellId)!;
        const dock = carry.docksUnitM[it.crateIndex]!;
        // Crate-local center (unit pose is 0,0 in this plan).
        const lx = it.centerM.x * 1000 - dock.xM * 1000;
        const lz = it.centerM.z * 1000 - dock.zM * 1000;
        const ly = it.centerM.y * 1000 - dock.yM * 1000;
        // Yaw90 plan footprint: X = item depth, Z = item width.
        const hx = dims.depth / 2;
        const hz = dims.width / 2;
        expect(lx - hx, `${p.id} cell ${i} left`).toBeGreaterThanOrEqual(cell.x0Mm - 1e-6);
        expect(lx + hx, `${p.id} cell ${i} right`).toBeLessThanOrEqual(cell.x0Mm + cell.wMm + 1e-6);
        expect(lz - hz, `${p.id} cell ${i} back`).toBeGreaterThanOrEqual(cell.z0Mm - 1e-6);
        expect(lz + hz, `${p.id} cell ${i} front`).toBeLessThanOrEqual(cell.z0Mm + cell.dMm + 1e-6);
        expect(ly - dims.height / 2, `${p.id} cell ${i} bottom`).toBeCloseTo(FLOOR_TOP_MM, 6);
        expect(ly + dims.height / 2, `${p.id} cell ${i} top`).toBeLessThanOrEqual(FLOOR_TOP_MM + cell.hMm + 1e-6);
        // Rendered carton AABB equals the declared SKU dims exactly.
        expect(it.scale.x * CARTON_SIZE_M.x * 1000).toBeCloseTo(dims.width, 6);
        expect(it.scale.y * CARTON_SIZE_M.y * 1000).toBeCloseTo(dims.height, 6);
        expect(it.scale.z * CARTON_SIZE_M.z * 1000).toBeCloseTo(dims.depth, 6);
      });
    }
  });
});

describe("honest empty / partial / overflow / unknown / misfit", () => {
  it("empty cart plans no cargo", () => {
    expect(plan([]).items).toEqual([]);
  });
  it("partial quantity plans exactly that many items", () => {
    const { items } = plan([{ productId: "P01", quantity: 2 }]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.itemOrdinal)).toEqual([1, 2]);
  });
  it("overflow beyond the 4 fixed cells is reported, never drawn", () => {
    const { items, overflow } = plan([{ productId: "P01", quantity: 6 }]);
    expect(items).toHaveLength(4);
    expect(overflow).toEqual([{ unitId: "PK-T", units: 2 }]);
  });
  it("unknown SKU is rejected visibly, not drawn", () => {
    const { items, rejected } = plan([{ productId: "P99", quantity: 1 }]);
    expect(items).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toContain("missing SKU dims/cell/dock");
  });
  it("an SKU that overfills its cell is rejected, not shrunk", () => {
    const dims = new Map(scene.scenario.products.map((p) => [p.id, p.itemDimensionsMm]));
    dims.set("P01", { width: 330, depth: 230, height: 170 });
    const { items, rejected } = plan([{ productId: "P01", quantity: 1 }], dims);
    expect(items).toEqual([]);
    expect(rejected[0]!.reason).toContain("overfills cell");
  });
  it("world center translates by the live unit pose (no aesthetic offset)", () => {
    const skuDims = new Map(scene.scenario.products.map((p) => [p.id, p.itemDimensionsMm]));
    const { items } = planCargoTransforms({
      units: [{ unitId: "PK-T", pose: { x: 3000, z: 9200 }, carried: [{ productId: "P07", quantity: 1 }] }],
      docks: carry.docksUnitM,
      cells: carry.cellsCrateLocalMm,
      floorTopYMm: FLOOR_TOP_MM,
      cargoYawDeg: carry.cargoYawDeg,
      skuDims,
      cartonSizeM: CARTON_SIZE_M,
      familyOf: new Map<string, CargoFamily>([["P07", "plastic"]]),
    });
    expect(items).toHaveLength(1);
    const it = items[0]!;
    const dock = carry.docksUnitM[it.crateIndex]!;
    // World center minus unit pose minus dock origin = crate-local center,
    // which must sit inside the assigned cell rect (independent recompute).
    const cell = carry.cellsCrateLocalMm.find((c) => c.id === it.cellId)!;
    const lx = it.centerM.x * 1000 - 3000 - dock.xM * 1000;
    const lz = it.centerM.z * 1000 - 9200 - dock.zM * 1000;
    expect(lx).toBeGreaterThanOrEqual(cell.x0Mm);
    expect(lx).toBeLessThanOrEqual(cell.x0Mm + cell.wMm);
    expect(lz).toBeGreaterThanOrEqual(cell.z0Mm);
    expect(lz).toBeLessThanOrEqual(cell.z0Mm + cell.dMm);
    expect(it.family).toBe("plastic");
    expect(skuDims.get("P07")).toEqual({ width: 250, depth: 180, height: 100 });
  });
  it("families tint distinctly", () => {
    expect(cargoFamilyTint("cardboard")).toEqual([1, 1, 1]);
    expect(cargoFamilyTint("plastic")).not.toEqual([1, 1, 1]);
  });
});
