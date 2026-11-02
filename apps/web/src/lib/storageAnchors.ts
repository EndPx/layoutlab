// R1 storage anchors: ONE shared location -> storage-pose resolver used by
// both the 2D plan and the 3D scene. Presentation only: anchors are
// synthetic (no input-schema field), derived from rack envelopes, usable
// dimensions, and stable slot identity. Routing always keeps using the
// immutable aisle pickPointMm; this module never mutates its inputs.
import type { Scenario, StorageLocation } from "@layoutlab/core";

export type AnchorLayout = "width-row" | "depth-col";

export type StorageAnchor = {
  locationId: string;
  rackId: string;
  slotIndex: number;
  slotCount: number;
  layout: AnchorLayout;
  /** Canonical mm XZ center inside the rack envelope. */
  centerMm: { x: number; z: number };
  /** Base height in mm (floor = 0; open GLB frame has no shelf deck). */
  baseYMm: number;
  yawDeg: 0 | 90 | 180 | 270;
  /** World axis-aligned usable footprint centered at centerMm. */
  slotRectMm: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export type AnchorDiagnostic = {
  locationId: string;
  productId: string | null;
  code: string;
  message: string;
};

export type ProductPlacement = {
  productId: string;
  locationId: string;
  anchor: StorageAnchor;
  /** World axis-aligned load footprint centered at the anchor. */
  loadRectMm: { minX: number; maxX: number; minZ: number; maxZ: number };
  loadHeightMm: number;
  fits: boolean;
  occupantIndex: number;
  occupantCount: number;
};

// Rack-local (lx, lz) -> world offset. Matches three.js rotationY(yawDeg)
// applied to slot offsets about the rack center, and the core footprint
// convention (90/270 swap width/depth).
export function rotateRackLocal(
  lx: number,
  lz: number,
  yawDeg: 0 | 90 | 180 | 270,
): { dx: number; dz: number } {
  // +0 normalizes -0 (negated exact zero) so centers compare cleanly.
  if (yawDeg === 90) return { dx: lz + 0, dz: -lx + 0 };
  if (yawDeg === 180) return { dx: -lx + 0, dz: -lz + 0 };
  if (yawDeg === 270) return { dx: -lz + 0, dz: lx + 0 };
  return { dx: lx + 0, dz: lz + 0 };
}

function fitsCell(
  loc: StorageLocation,
  cellW: number,
  cellD: number,
  rackH: number,
): boolean {
  const u = loc.usableDimensionsMm;
  return u.width <= cellW && u.depth <= cellD && u.height <= rackH;
}

export function resolveStorageAnchors(scenario: Scenario): {
  anchors: Map<string, StorageAnchor>;
  diagnostics: AnchorDiagnostic[];
} {
  const anchors = new Map<string, StorageAnchor>();
  const diagnostics: AnchorDiagnostic[] = [];
  const racks = new Map(scenario.racks.map((r) => [r.id, r]));
  const byRack = new Map<string, StorageLocation[]>();
  for (const loc of scenario.locations) {
    const list = byRack.get(loc.rackId) ?? [];
    list.push(loc);
    byRack.set(loc.rackId, list);
  }
  for (const list of byRack.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const loc of scenario.locations) {
    const rack = racks.get(loc.rackId);
    if (!rack) {
      diagnostics.push({
        locationId: loc.id,
        productId: null,
        code: "ANCHOR_MISSING_RACK",
        message: `location ${loc.id} references unknown rack ${loc.rackId}; no storage pose (routing approach unchanged)`,
      });
      continue;
    }
    const group = byRack.get(loc.rackId) ?? [];
    const n = group.length;
    const slotIndex = group.findIndex((l) => l.id === loc.id);
    const w = rack.dimensionsMm.width;
    const d = rack.dimensionsMm.depth;
    const h = rack.dimensionsMm.height;
    // Deterministic layout: width row first, depth column only when the
    // width row doesn't fit all but the depth column does;
    // otherwise width-row positions with per-location diagnostics.
    const widthFitsAll = group.every((l) => fitsCell(l, w / n, d, h));
    const depthFitsAll = group.every((l) => fitsCell(l, w, d / n, h));
    const layout: AnchorLayout = widthFitsAll ? "width-row" : depthFitsAll ? "depth-col" : "width-row";
    const cellW = layout === "width-row" ? w / n : w;
    const cellD = layout === "width-row" ? d : d / n;
    const lx = layout === "width-row" ? -w / 2 + (w * (slotIndex + 0.5)) / n : 0;
    const lz = layout === "width-row" ? 0 : -d / 2 + (d * (slotIndex + 0.5)) / n;
    if (!fitsCell(loc, cellW, cellD, h)) {
      const u = loc.usableDimensionsMm;
      diagnostics.push({
        locationId: loc.id,
        productId: null,
        code: "ANCHOR_SLOT_EXCEEDS_CELL",
        message:
          `location ${loc.id} usable ${u.width}x${u.depth}x${u.height}mm exceeds ` +
          `rack ${rack.id} slot cell ${cellW}x${cellD}mm (${layout}, slot ${slotIndex + 1}/${n}); ` +
          `no storage pose (routing approach unchanged)`,
      });
      continue;
    }
    const { dx, dz } = rotateRackLocal(lx, lz, rack.yawDeg);
    const cx = rack.positionMm.x + dx;
    const cz = rack.positionMm.z + dz;
    // Yaw 90/270 swaps the world footprint axes (core + GLB convention).
    const swap = rack.yawDeg === 90 || rack.yawDeg === 270;
    const uw = swap ? loc.usableDimensionsMm.depth : loc.usableDimensionsMm.width;
    const ud = swap ? loc.usableDimensionsMm.width : loc.usableDimensionsMm.depth;
    const slotRectMm = { minX: cx - uw / 2, maxX: cx + uw / 2, minZ: cz - ud / 2, maxZ: cz + ud / 2 };
    anchors.set(loc.id, {
      locationId: loc.id,
      rackId: rack.id,
      slotIndex,
      slotCount: n,
      layout,
      centerMm: { x: cx, z: cz },
      baseYMm: 0,
      yawDeg: rack.yawDeg,
      slotRectMm,
    });
  }
  return { anchors, diagnostics };
}

export function resolveProductPlacements(
  scenario: Scenario,
  assignment: { productId: string; locationId: string }[],
  anchors: Map<string, StorageAnchor>,
): { placements: ProductPlacement[]; diagnostics: AnchorDiagnostic[] } {
  const placements: ProductPlacement[] = [];
  const diagnostics: AnchorDiagnostic[] = [];
  const products = new Map(scenario.products.map((p) => [p.id, p]));
  const locations = new Map(scenario.locations.map((l) => [l.id, l]));
  // Every assignment row keeps its own placement (duplicates included);
  // occupant order follows assignment order for stable stacking.
  const perLocation = new Map<string, { productId: string }[]>();
  for (const a of assignment) {
    const list = perLocation.get(a.locationId) ?? [];
    list.push({ productId: a.productId });
    perLocation.set(a.locationId, list);
  }
  for (const [locationId, rows] of perLocation) {
    const anchor = anchors.get(locationId);
    const loc = locations.get(locationId);
    rows.forEach(({ productId }, occupantIndex) => {
      const product = products.get(productId);
      if (!product || !loc) {
        diagnostics.push({
          locationId,
          productId,
          code: "ANCHOR_UNKNOWN_REF",
          message: `assignment ${productId}@${locationId} references unknown product or location; not rendered`,
        });
        return;
      }
      if (!anchor) return; // slot-level diagnostic already recorded
      const swap = anchor.yawDeg === 90 || anchor.yawDeg === 270;
      const load = product.storedLoadDimensionsMm;
      const lw = swap ? load.depth : load.width;
      const ld = swap ? load.width : load.depth;
      const { x: cx, z: cz } = anchor.centerMm;
      const fits =
        load.width <= loc.usableDimensionsMm.width &&
        load.depth <= loc.usableDimensionsMm.depth &&
        load.height <= loc.usableDimensionsMm.height;
      if (!fits) {
        diagnostics.push({
          locationId,
          productId,
          code: "ANCHOR_LOAD_EXCEEDS_SLOT",
          message:
            `product ${productId} load ${load.width}x${load.depth}x${load.height}mm exceeds ` +
            `location ${locationId} usable ${loc.usableDimensionsMm.width}x${loc.usableDimensionsMm.depth}x` +
            `${loc.usableDimensionsMm.height}mm; drawn true-size with a warning (no shrinking)`,
        });
      }
      placements.push({
        productId,
        locationId,
        anchor,
        loadRectMm: { minX: cx - lw / 2, maxX: cx + lw / 2, minZ: cz - ld / 2, maxZ: cz + ld / 2 },
        loadHeightMm: load.height,
        fits,
        occupantIndex,
        occupantCount: rows.length,
      });
    });
  }
  return { placements, diagnostics };
}

/** Interior overlap only; edge-touching neighbors are valid, not a collision. */
export function rectsOverlapInterior(
  a: { minX: number; maxX: number; minZ: number; maxZ: number },
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  return Math.max(a.minX, b.minX) < Math.min(a.maxX, b.maxX) &&
    Math.max(a.minZ, b.minZ) < Math.min(a.maxZ, b.maxZ);
}
