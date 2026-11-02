// v3-M3a swept-space traffic checks. Pure headless geometry over authorized
// piecewise-linear trajectories. No clock, no kernel, no inventory here;
// the transport controller owns time/admission/completion and calls these
// helpers for every grant.
//
// Conservative disc approximation (disclosed): each mobile unit is a disc
// with radiusMm = ceil(hypot(width,length)/2)+margin (per-unit, distinct
// radii supported). Two discs conflict when their center distance is
// <= rA+rB+CONTACT_EPS_MM (inclusive touching counts as conflict,
// conservative). CONTACT_EPS_MM=1e-6mm absorbs float interpolation error
// conservatively (slightly larger threshold, never smaller). This is NOT a
// forklift dynamics model, NOT a safety certification, and NOT a global
// deadlock-freedom claim.
//
// Interval conventions (documented):
// - Movement trajectories are CLOSED [startMs,endMs] (both inclusive). At
//   startMs the pose is exactly the start (no teleport); at endMs exactly
//   the destination, which persists thereafter as terminal occupancy.
// - Terminal occupancy is [endMs, +inf) at the destination until a
//   replacement grant commits. It is checked as a stationary disc.
// - Exclusive traffic-zone holds are HALF-OPEN [startMs,endMs) (end
//   exclusive) so a 0..4000 hold releases before a 4000..8000 grant at the
//   same instant. At the handoff instant the zone is free, but terminal
//   occupancy persists and is still checked via separation (positions must
//   be mutually safe).
// - Moving-vs-moving overlap is the closed intersection
//   [max(starts), min(ends)]; a single-instant overlap (endA==startB) is
//   checked at that instant (positions must clear).
// - Moving-vs-stationary checks the full movement interval against the
//   stationary disc, or a caller-provided window [winStart,winEnd] for
//   terminal-tail checks (e.g., N's [eP,eN] vs GP after P completes).
//
// Method: simultaneous piecewise-linear paths are compared ANALYTICALLY via
// minimum relative separation over overlapping intervals (relative motion
// is linear in t; closest approach via projection, clamped to the window).
// This protects the swept footprint BETWEEN events, not just node/edge
// matches or frame samples. Head-on, crossings, diagonals/connectors,
// stopped agents in path, occupied goals, and safe perpendicular routes at
// different times are all covered by the same segment-pair routine.
//
// Zones: pathRequiresZone inflates the zone rect by the unit radius
// (axis-aligned, inclusive) and checks centerline segments via core
// segmentHitsRect. Axis-aligned inflation is conservative at corners
// (may require a zone when the Euclidean disc only nears a corner);
// disclosed, never silently permissive. Zones are NOT obstacles.
import { inflateRect, segmentHitsRect, type Rect } from "@layoutlab/core";

// Conservative numerical tolerance for float interpolation (mm).
export const TRAFFIC_CONTACT_EPS_MM = 1e-6;

export type Xz = { x: number; z: number };

// Linear motion from (fromX,fromZ) at startMs to (toX,toZ) at endMs.
// Zero-duration implies zero-distance (from==to); callers must not build
// positive-distance zero-time segments (travelTimeMs>0 for distance>0).
export type TimedSegment = {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  startMs: number;
  endMs: number;
};

export type Trajectory = {
  unitId: string;
  radiusMm: number;
  segments: TimedSegment[];
  startMs: number;
  endMs: number;
  destination: Xz;
};

export function discsConflict(
  centerDistMm: number,
  radiusAmm: number,
  radiusBmm: number,
): boolean {
  return centerDistMm <= radiusAmm + radiusBmm + TRAFFIC_CONTACT_EPS_MM;
}

export function stationaryVsStationaryConflict(
  posA: Xz,
  radiusAmm: number,
  posB: Xz,
  radiusBmm: number,
): boolean {
  return discsConflict(
    Math.hypot(posA.x - posB.x, posA.z - posB.z),
    radiusAmm,
    radiusBmm,
  );
}

// Pose on a segment at absolute time tMs (clamped: before start returns
// from, after end returns to; exact at both ends, no teleport).
export function poseOnSegment(seg: TimedSegment, tMs: number): Xz {
  if (tMs <= seg.startMs || seg.endMs <= seg.startMs) {
    return { x: seg.fromX, z: seg.fromZ };
  }
  if (tMs >= seg.endMs) {
    return { x: seg.toX, z: seg.toZ };
  }
  const f = (tMs - seg.startMs) / (seg.endMs - seg.startMs);
  return {
    x: seg.fromX + (seg.toX - seg.fromX) * f,
    z: seg.fromZ + (seg.toZ - seg.fromZ) * f,
  };
}

type Vec = { x: number; z: number };

function velocityOf(seg: TimedSegment): Vec {
  const dt = seg.endMs - seg.startMs;
  if (dt <= 0) return { x: 0, z: 0 };
  return {
    x: (seg.toX - seg.fromX) / dt,
    z: (seg.toZ - seg.fromZ) / dt,
  };
}

function posAt(seg: TimedSegment, v: Vec, tMs: number): Vec {
  // Linear extrapolation consistent with poseOnSegment inside [start,end].
  // Callers only query t within the segment's overlap window, which lies
  // inside [start,end], so clamping never triggers here.
  const dt = tMs - seg.startMs;
  return { x: seg.fromX + v.x * dt, z: seg.fromZ + v.z * dt };
}

// Minimum |r0 + V*s| for s in [0, L]. Closed-form projection, clamped.
function minLinearDist(r0: Vec, v: Vec, lenMs: number): number {
  const vv = v.x * v.x + v.z * v.z;
  if (!(vv > 0) || lenMs <= 0) {
    return Math.hypot(r0.x, r0.z);
  }
  const tc = -(r0.x * v.x + r0.z * v.z) / vv;
  const c = tc < 0 ? 0 : tc > lenMs ? lenMs : tc;
  return Math.hypot(r0.x + v.x * c, r0.z + v.z * c);
}

// Minimum center separation between two segments over their overlapping
// time interval (closed intersection). Infinity when intervals are disjoint
// (no simultaneous occupancy to compare).
export function minSeparationMovingMoving(
  a: TimedSegment,
  b: TimedSegment,
): number {
  const t0 = Math.max(a.startMs, b.startMs);
  const t1 = Math.min(a.endMs, b.endMs);
  if (t0 > t1) return Infinity;
  const va = velocityOf(a);
  const vb = velocityOf(b);
  const pa0 = posAt(a, va, t0);
  const pb0 = posAt(b, vb, t0);
  const r0 = { x: pa0.x - pb0.x, z: pa0.z - pb0.z };
  const v = { x: va.x - vb.x, z: va.z - vb.z };
  return minLinearDist(r0, v, t1 - t0);
}

// Minimum distance from a moving segment to a fixed point over the
// segment's full interval [startMs,endMs].
export function minSeparationMovingStationary(
  seg: TimedSegment,
  stat: Xz,
): number {
  return minSeparationMovingStationaryInWindow(
    seg,
    stat,
    seg.startMs,
    seg.endMs,
  );
}

// Minimum distance over the overlap of the segment interval with an
// explicit window [winStartMs,winEndMs] (closed). Infinity when disjoint.
// Used for terminal-tail checks (e.g., N's [eP,eN] vs GP).
export function minSeparationMovingStationaryInWindow(
  seg: TimedSegment,
  stat: Xz,
  winStartMs: number,
  winEndMs: number,
): number {
  const t0 = Math.max(seg.startMs, winStartMs);
  const t1 = Math.min(seg.endMs, winEndMs);
  if (t0 > t1) return Infinity;
  const v = velocityOf(seg);
  const p0 = posAt(seg, v, t0);
  const r0 = { x: p0.x - stat.x, z: p0.z - stat.z };
  return minLinearDist(r0, v, t1 - t0);
}

export type ConflictDetail = {
  kind: "moving-moving" | "moving-stationary" | "stationary-stationary";
  minDistMm: number;
  requiredMm: number;
  segA?: number;
  segB?: number;
};

// All segment pairs with overlapping time; first conflict (deterministic
// pair order: segA asc, then segB asc) is reported. Endpoints look-free
// but mid-segments collide is caught here (e.g., crossing diagonals whose
// endpoints are mutually safe).
export function trajectoriesConflict(
  a: Trajectory,
  b: Trajectory,
): { conflict: boolean; detail: ConflictDetail | null } {
  const required = a.radiusMm + b.radiusMm + TRAFFIC_CONTACT_EPS_MM;
  for (let i = 0; i < a.segments.length; i += 1) {
    for (let j = 0; j < b.segments.length; j += 1) {
      const d = minSeparationMovingMoving(
        a.segments[i] as TimedSegment,
        b.segments[j] as TimedSegment,
      );
      if (d === Infinity) continue;
      if (d <= required) {
        return {
          conflict: true,
          detail: {
            kind: "moving-moving",
            minDistMm: d,
            requiredMm: a.radiusMm + b.radiusMm,
            segA: i,
            segB: j,
          },
        };
      }
    }
  }
  return { conflict: false, detail: null };
}

export function trajectoryVsStationaryConflict(
  traj: Trajectory,
  stat: Xz,
  statRadiusMm: number,
): { conflict: boolean; detail: ConflictDetail | null } {
  const required = traj.radiusMm + statRadiusMm + TRAFFIC_CONTACT_EPS_MM;
  for (let i = 0; i < traj.segments.length; i += 1) {
    const d = minSeparationMovingStationary(
      traj.segments[i] as TimedSegment,
      stat,
    );
    if (d <= required) {
      return {
        conflict: true,
        detail: {
          kind: "moving-stationary",
          minDistMm: d,
          requiredMm: traj.radiusMm + statRadiusMm,
          segA: i,
        },
      };
    }
  }
  return { conflict: false, detail: null };
}

export function trajectoryVsStationaryInWindowConflict(
  traj: Trajectory,
  stat: Xz,
  statRadiusMm: number,
  winStartMs: number,
  winEndMs: number,
): { conflict: boolean; detail: ConflictDetail | null } {
  const required = traj.radiusMm + statRadiusMm + TRAFFIC_CONTACT_EPS_MM;
  for (let i = 0; i < traj.segments.length; i += 1) {
    const d = minSeparationMovingStationaryInWindow(
      traj.segments[i] as TimedSegment,
      stat,
      winStartMs,
      winEndMs,
    );
    if (d === Infinity) continue;
    if (d <= required) {
      return {
        conflict: true,
        detail: {
          kind: "moving-stationary",
          minDistMm: d,
          requiredMm: traj.radiusMm + statRadiusMm,
          segA: i,
        },
      };
    }
  }
  return { conflict: false, detail: null };
}

// Half-open zone-hold overlap: [sA,eA) vs [sB,eB) overlap iff
// max(starts) < min(ends) (strict). Same-instant handoff (eA==sB) is free.
export function zoneHoldsOverlap(
  startAMs: number,
  endAMs: number,
  startBMs: number,
  endBMs: number,
): boolean {
  return Math.max(startAMs, startBMs) < Math.min(endAMs, endBMs);
}

// Conservative zone requirement: any centerline point/segment touching the
// zone inflated by the unit radius (axis-aligned, inclusive) requires the
// zone for the whole transit. Corners are conservative (see header).
export function pathRequiresZone(
  points: Xz[],
  radiusMm: number,
  zone: Rect,
): boolean {
  if (points.length === 0) return false;
  const inflated = inflateRect(zone, radiusMm);
  if (points.length === 1) {
    const p = points[0] as Xz;
    return (
      p.x >= inflated.minX &&
      p.x <= inflated.maxX &&
      p.z >= inflated.minZ &&
      p.z <= inflated.maxZ
    );
  }
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i] as Xz;
    const b = points[i + 1] as Xz;
    if (segmentHitsRect(a, b, inflated)) return true;
  }
  return false;
}

export function pointInZoneInclusive(p: Xz, zone: Rect): boolean {
  return (
    p.x >= zone.minX &&
    p.x <= zone.maxX &&
    p.z >= zone.minZ &&
    p.z <= zone.maxZ
  );
}
