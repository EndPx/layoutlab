import type { PointMm, Rack, Scenario } from "./schema.js";

export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

export function cartRadiusMm(cart: Scenario["cart"]): number {
  // ceil(sqrt((w/2)^2 + (l/2)^2)) == ceil(sqrt(w^2 + l^2) / 2)
  return Math.ceil(Math.sqrt(cart.widthMm ** 2 + cart.lengthMm ** 2) / 2);
}

export function navigationRadiusMm(scenario: Scenario): number {
  const cart = cartRadiusMm(scenario.cart) + scenario.cart.marginMm;
  const passage = Math.ceil(scenario.minimumPassageWidthMm / 2);
  return Math.max(cart, passage);
}

// Yaw-aware footprint: 90/270 swap width and depth. Centers are integer mm,
// so bounds can land on .5; halves are exact in floating point.
export function rackFootprint(rack: Rack): Rect {
  const swap = rack.yawDeg === 90 || rack.yawDeg === 270;
  const w = (swap ? rack.dimensionsMm.depth : rack.dimensionsMm.width) / 2;
  const d = (swap ? rack.dimensionsMm.width : rack.dimensionsMm.depth) / 2;
  return {
    minX: rack.positionMm.x - w,
    maxX: rack.positionMm.x + w,
    minZ: rack.positionMm.z - d,
    maxZ: rack.positionMm.z + d,
  };
}

export function inflateRect(rect: Rect, radiusMm: number): Rect {
  return {
    minX: rect.minX - radiusMm,
    maxX: rect.maxX + radiusMm,
    minZ: rect.minZ - radiusMm,
    maxZ: rect.maxZ + radiusMm,
  };
}

// Conservative: boundary counts as blocked, so a point exactly navigation
// radius from a wall or obstacle is rejected.
export function pointInRect(p: PointMm, rect: Rect): boolean {
  return p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ;
}

export function rectsOverlapInterior(a: Rect, b: Rect): boolean {
  // Touching edges are adjacent racks, not an overlap.
  return Math.max(a.minX, b.minX) < Math.min(a.maxX, b.maxX) &&
    Math.max(a.minZ, b.minZ) < Math.min(a.maxZ, b.maxZ);
}

function orientation(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const v = (bz - az) * (cx - bx) - (bx - ax) * (cz - bz);
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

function onSegment(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): boolean {
  return bx >= Math.min(ax, cx) && bx <= Math.max(ax, cx) &&
    bz >= Math.min(az, cz) && bz <= Math.max(az, cz);
}

function segmentsIntersect(
  p1: PointMm, p2: PointMm, p3: PointMm, p4: PointMm,
): boolean {
  const d1 = orientation(p3.x, p3.z, p4.x, p4.z, p1.x, p1.z);
  const d2 = orientation(p3.x, p3.z, p4.x, p4.z, p2.x, p2.z);
  const d3 = orientation(p1.x, p1.z, p2.x, p2.z, p3.x, p3.z);
  const d4 = orientation(p1.x, p1.z, p2.x, p2.z, p4.x, p4.z);
  if (d1 !== d2 && d3 !== d4) return true;
  if (d1 === 0 && onSegment(p3.x, p3.z, p1.x, p1.z, p4.x, p4.z)) return true;
  if (d2 === 0 && onSegment(p3.x, p3.z, p2.x, p2.z, p4.x, p4.z)) return true;
  if (d3 === 0 && onSegment(p1.x, p1.z, p3.x, p3.z, p2.x, p2.z)) return true;
  if (d4 === 0 && onSegment(p1.x, p1.z, p4.x, p4.z, p2.x, p2.z)) return true;
  return false;
}

// Inclusive: touching an inflated obstacle counts as collision.
export function segmentHitsRect(a: PointMm, b: PointMm, rect: Rect): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
  const corners: PointMm[] = [
    { x: rect.minX, z: rect.minZ },
    { x: rect.maxX, z: rect.minZ },
    { x: rect.maxX, z: rect.maxZ },
    { x: rect.minX, z: rect.maxZ },
  ];
  for (let i = 0; i < 4; i++) {
    const c1 = corners[i] as PointMm;
    const c2 = corners[(i + 1) % 4] as PointMm;
    if (segmentsIntersect(a, b, c1, c2)) return true;
  }
  return false;
}

export function segmentBlocked(a: PointMm, b: PointMm, obstacles: Rect[]): boolean {
  return obstacles.some((o) => segmentHitsRect(a, b, o));
}
