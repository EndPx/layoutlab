// Pure main-warehouse environment geometry helpers (v3 static scene).
//
// Single source for rack scaling, shelf-deck heights, and container grid
// placements. The browser renderer AND the headless proof scripts both call
// these with canonical fixture dimensions + measured source bounds, so the
// rendered scene cannot drift from the verified geometry. No embedded
// measurements: every source size/deck arrives as an argument from the
// asset bindings (which the verify proof checks against manifests and
// actual GLB buffers). No rendering, no navigation, no kernel clock here;
// navigation reuses the core pathfinder through a probe-only adapter.

export type DimsMm = { width: number; depth: number; height: number };

export type AxisScale = { x: number; y: number; z: number };

export type GridPlacement = {
  /** Offset from the slot center in mm (X right, Z toward viewer south). */
  dxMm: number;
  dzMm: number;
  /** Height of the container base above the slot base in mm. */
  dyMm: number;
};

function assertPositiveInt(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer, got ${value}`);
  }
}

function assertDims(d: DimsMm, name: string): void {
  assertPositiveInt(d.width, `${name}.width`);
  assertPositiveInt(d.depth, `${name}.depth`);
  assertPositiveInt(d.height, `${name}.height`);
}

// Per-axis GLB scale: fit source meters (Y-up GLB: x = source x,
// y = source z-up, z = source y magnitude) to canonical rack mm.
// Scale applies in mesh-local space before yaw, matching the W1 rule.
export function rackAxisScale(
  sourceSizeM: { x: number; y: number; z: number },
  dimsMm: DimsMm,
): AxisScale {
  for (const [k, v] of Object.entries(sourceSizeM)) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new RangeError(`sourceSizeM.${k} must be a positive finite number, got ${v}`);
    }
  }
  assertDims(dimsMm, "dimsMm");
  return {
    x: dimsMm.width / 1000 / sourceSizeM.x,
    y: dimsMm.height / 1000 / sourceSizeM.z,
    z: dimsMm.depth / 1000 / sourceSizeM.y,
  };
}

// Shelf-deck top height in mm for a rack of the given canonical height.
// Deck heights scale linearly with the rack Y scale; the caller rounds to
// integer mm for storage anchors (documented sub-mm rounding).
export function deckTopYMm(
  sourceHeightM: number,
  sourceDeckZM: number,
  rackHeightMm: number,
): number {
  if (!Number.isFinite(sourceHeightM) || sourceHeightM <= 0) {
    throw new RangeError(`sourceHeightM must be positive, got ${sourceHeightM}`);
  }
  if (!Number.isFinite(sourceDeckZM) || sourceDeckZM < 0) {
    throw new RangeError(`sourceDeckZM must be non-negative, got ${sourceDeckZM}`);
  }
  assertPositiveInt(rackHeightMm, "rackHeightMm");
  return (sourceDeckZM * rackHeightMm) / sourceHeightM;
}

// Which shelf deck an anchor height sits on, or -1 when the anchor is not
// on any deck top (within tolerance). Anchors must resolve exactly; a -1
// is a fixture error, never silently snapped.
export function deckIndexForAnchorY(
  anchorYMm: number,
  deckTopsMm: number[],
  toleranceMm = 0.5,
): number {
  if (!Number.isFinite(anchorYMm)) {
    throw new RangeError(`anchorYMm must be finite, got ${anchorYMm}`);
  }
  for (let i = 0; i < deckTopsMm.length; i++) {
    if (Math.abs(anchorYMm - deckTopsMm[i]) <= toleranceMm) return i;
  }
  return -1;
}

// Exact container count for a stock quantity. Fractional containers do not
// exist: a non-multiple is a fixture error, never rounded silently.
export function containersForStock(
  quantity: number,
  unitsPerVisual: number,
): number {
  assertPositiveInt(quantity, "quantity");
  assertPositiveInt(unitsPerVisual, "unitsPerVisual");
  if (quantity % unitsPerVisual !== 0) {
    throw new RangeError(
      `stock quantity ${quantity} is not a multiple of unitsPerVisual ${unitsPerVisual}`,
    );
  }
  return quantity / unitsPerVisual;
}

// Deterministic centered row-major container grid inside a slot: fill X
// columns, then Z rows, then Y layers. Containers sit on the slot base
// (dy 0) unless stacked, in which case each layer rises exactly one
// container height (face-to-face contact, no interpenetration, no gaps).
// Throws when the count does not fit the usable box at true size —
// nothing is ever shrunk to fit.
export function containerGrid(
  usableMm: DimsMm,
  containerMm: DimsMm,
  count: number,
): { cols: number; rows: number; layers: number; placements: GridPlacement[] } {
  assertDims(usableMm, "usableMm");
  assertDims(containerMm, "containerMm");
  assertPositiveInt(count, "count");
  const cols = Math.floor(usableMm.width / containerMm.width);
  const rows = Math.floor(usableMm.depth / containerMm.depth);
  const layers = Math.floor(usableMm.height / containerMm.height);
  if (cols < 1 || rows < 1 || layers < 1) {
    throw new RangeError(
      `container ${containerMm.width}x${containerMm.depth}x${containerMm.height}mm ` +
        `does not fit usable ${usableMm.width}x${usableMm.depth}x${usableMm.height}mm`,
    );
  }
  const capacity = cols * rows * layers;
  if (count > capacity) {
    throw new RangeError(
      `count ${count} exceeds grid capacity ${capacity} ` +
        `(${cols}x${rows}x${layers}) at true size`,
    );
  }
  // Center the OCCUPIED grid (not the full capacity): leftover space splits
  // evenly on both sides so partial fills stay centered, never corner-hugging.
  const usedLayers = Math.ceil(count / (cols * rows));
  const placements: GridPlacement[] = [];
  let n = 0;
  for (let layer = 0; layer < usedLayers && n < count; layer++) {
    const inLayer = Math.min(count - n, cols * rows);
    const usedRows = Math.ceil(inLayer / cols);
    for (let row = 0; row < usedRows && n < count; row++) {
      const inRow = Math.min(inLayer - row * cols, cols);
      for (let col = 0; col < inRow && n < count; col++) {
        const gridW = inRow * containerMm.width;
        const gridD = usedRows * containerMm.depth;
        placements.push({
          dxMm: -gridW / 2 + containerMm.width * (col + 0.5),
          dzMm: -gridD / 2 + containerMm.depth * (row + 0.5),
          dyMm: layer * containerMm.height,
        });
        n++;
      }
    }
  }
  return { cols, rows, layers, placements };
}
