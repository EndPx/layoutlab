// v3-M3a canonical navigation adapter. Pure headless module over UNMODIFIED
// core helpers: reuses the core 100mm-grid A* (shortestPathPointsMm),
// pointNavigable, inflateRect, segmentBlocked, and pointInRect. No pathfinder
// duplication, no core edits, no second clock.
//
// Geometry source: the operations scenario's room, racks (axis-aligned,
// yawDeg 0 under the core footprint convention), and ALL canonical obstacle
// rects (staging keep-clear, packing tables, entrance barriers/door bodies).
// Traffic zones are NEVER inflated here: they are admission policy, not
// physical obstacles. No unrelated background.
//
// Per-unit conservative disc: radiusMm(unit) =
// ceil(hypot(footprint.width, footprint.length)/2) + margin (e.g. 600x800+100
// gives 500+100=600mm; the canonical 680x1220+100 gives 699+100=799mm).
// Static checks inflate every rack/obstacle rect by the MOVING unit's radius
// and require the center outside (inclusive boundary counts as blocked,
// matching core). Declared footprints are axis-aligned rects centered at the
// slot: width along X, length along Z. A navigable center implies its
// declared rect is interior-disjoint from racks/obstacles and in-room,
// because the rect halves are smaller than the circumscribed radius.
//
// A route query excludes ONLY its own occupied footprint. All other
// occupancies are represented by their DECLARED CIRCUMSCRIBED DISCS (disc
// AABB +-rB inflated by the mover's radius rA), never by the smaller
// physical rect without margin: the planner must agree with the analytic
// continuous admission (center distance <= rA+rB+EPS conflicts), which
// compares discs. Planning against the smaller rect can return a shortest
// path hugging a stopped unit that admission then rejects, although a clear
// detour exists, and the grant waits forever on the same hugging path. The
// disc square's corners are conservative (up to ~1.42x the disc radius
// diagonally): planning may wait where admission would pass, never the
// reverse. Goals never include parking slots as destinations in the main
// proof, but the adapter supports any navigable destination.
//
// Distances: per-segment ceil(hypot(dx,dz)) in integer mm (conservative,
// never understates). Grid steps are exactly 100mm; off-grid connectors are
// ceiled Euclidean, matching core's connectEndpoint connectorMm. Total
// distance is the sum. Durations are derived by the transport layer via
// travelTimeMs(distanceMm, speedMmPerSecond); this adapter returns distances
// only, no time.
import {
  GRID_SIZE_MM,
  createNavBudget,
  inflateRect,
  pointInRect,
  pointNavigable,
  segmentBlocked,
  segmentHitsRect,
  shortestPathPointsMm,
  type NavContext,
  type PointMm,
  type Rect,
  type Scenario,
} from "@layoutlab/core";
import type { OperationsScenario } from "./schema.js";
import { TRAFFIC_CONTACT_EPS_MM } from "./traffic.js";

export type XzMm = { x: number; z: number };

export type UnitProfile = {
  unitId: string;
  footprintMm: { width: number; length: number; margin: number };
  speedMmPerSecond: number;
  parkingSlotMm: XzMm;
  radiusMm: number;
};

export type RouteSuccess = {
  status: "ok";
  points: XzMm[];
  distancesMm: number[];
  totalDistanceMm: number;
};

export type RouteFailureReason =
  | "UNKNOWN_UNIT"
  | "INVALID_COORDINATES"
  | "ROOM_EXCEEDED"
  | "OBSTACLE_OVERLAP"
  | "FROM_UNNAVIGABLE"
  | "TO_UNNAVIGABLE"
  | "OCCUPIED_GOAL"
  | "NO_PATH";

export type RouteFailure = {
  status: "rejected";
  reason: RouteFailureReason;
  message: string;
  blockerUnitId?: string;
  // Witnessed occupier candidates when the cause is ambiguous (or empty
  // when no single occupier can be blamed). Present only on
  // unit-aware failures where attribution was attempted.
  candidateUnitIds?: string[];
};

export type RouteResult = RouteSuccess | RouteFailure;

// Conservative circumscribed disc for a rectangular footprint plus margin.
// Matches core cartRadiusMm({widthMm,lengthMm})+margin for the same inputs.
export function footprintRadiusMm(footprint: {
  width: number;
  length: number;
  margin: number;
}): number {
  return Math.ceil(Math.hypot(footprint.width, footprint.length) / 2) + footprint.margin;
}

// Axis-aligned declared footprint rect centered at pos.
export function footprintRect(
  center: XzMm,
  footprint: { width: number; length: number },
): Rect {
  return {
    minX: center.x - footprint.width / 2,
    maxX: center.x + footprint.width / 2,
    minZ: center.z - footprint.length / 2,
    maxZ: center.z + footprint.length / 2,
  };
}

// Stationary-other occupancy for consistent conservative planning: the other
// unit's declared circumscribed disc (AABB +-rB) inflated by the mover's
// radius rA. The square COVERS the analytic admission disc (conflict iff
// center distance <= rA+rB+EPS), so a path whose swept centerline avoids the
// closed square always clears admission for this occupier; the +EPS closes
// the inclusive-contact convention exactly. Corners over-approximate the
// disc diagonally (documented conservative behavior): the planner may report
// a corridor blocked where the analytic check would pass, but it never
// returns a hugging path that admission then rejects.
export function occupancyRectFor(
  moverRadiusMm: number,
  otherPose: XzMm,
  otherRadiusMm: number,
): Rect {
  const half = otherRadiusMm + moverRadiusMm + TRAFFIC_CONTACT_EPS_MM;
  return {
    minX: otherPose.x - half,
    maxX: otherPose.x + half,
    minZ: otherPose.z - half,
    maxZ: otherPose.z + half,
  };
}

function ceilDist(a: XzMm, b: XzMm): number {
  return Math.ceil(Math.hypot(a.x - b.x, a.z - b.z));
}

function isSafeIntPair(p: unknown): p is XzMm {
  if (typeof p !== "object" || p === null) return false;
  const { x, z } = p as Record<string, unknown>;
  return Number.isSafeInteger(x) && Number.isSafeInteger(z);
}

export type TransportNav = {
  readonly roomMm: { widthMm: number; depthMm: number };
  readonly rackRects: Rect[];
  readonly obstacleRects: Rect[];
  readonly unitProfiles: ReadonlyMap<string, UnitProfile>;
  radiusForUnit(unitId: string): number;
  rectForUnitAt(unitId: string, pos: XzMm): Rect;
  // Static-only navigability (racks+obstacles, no other units). Used to
  // distinguish truly unreachable (static) from temporarily blocked (units).
  isStaticNavigable(point: XzMm, forUnitId: string): boolean;
  // Full navigability including other occupancies (declared rects at given
  // poses, excluding forUnitId itself). otherPoses maps unitId->pose.
  isNavigable(
    point: XzMm,
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm>,
  ): boolean;
  findRoute(
    from: XzMm,
    to: XzMm,
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm>,
  ): RouteResult;
  findStaticRoute(from: XzMm, to: XzMm, forUnitId: string): RouteResult;
  // Witnessed occupiers whose inflated rects touch a static corridor
  // centerline (sorted unitIds). Evidence for corridor-blocked attribution;
  // callers must report unknown/multiple causes when this is not a
  // singleton, never invent a blocker from ID order.
  blockingCandidatesOnCorridor(
    points: XzMm[],
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm>,
  ): string[];
};

export function createTransportNav(
  scenario: OperationsScenario,
): TransportNav {
  const roomMm = {
    widthMm: scenario.geometry.room.widthMm,
    depthMm: scenario.geometry.room.depthMm,
  };
  const rackRects: Rect[] = scenario.geometry.racks.map((r) => ({
    minX: r.positionMm.x - r.dimensionsMm.width / 2,
    maxX: r.positionMm.x + r.dimensionsMm.width / 2,
    minZ: r.positionMm.z - r.dimensionsMm.depth / 2,
    maxZ: r.positionMm.z + r.dimensionsMm.depth / 2,
  }));
  const obstacleRects: Rect[] = scenario.geometry.obstacles.map((o) => ({
    minX: o.minXMm,
    maxX: o.maxXMm,
    minZ: o.minZMm,
    maxZ: o.maxZMm,
  }));
  const profiles = new Map<string, UnitProfile>();
  for (const u of scenario.mobileUnits) {
    profiles.set(u.id, {
      unitId: u.id,
      footprintMm: { ...u.footprintMm },
      speedMmPerSecond: u.speedMmPerSecond,
      parkingSlotMm: { x: u.parkingSlotMm.x, z: u.parkingSlotMm.z },
      radiusMm: footprintRadiusMm(u.footprintMm),
    });
  }

  // Minimal core Scenario: pointNavigable/shortestPathPointsMm only read
  // scenario.room at runtime (nav comes from our NavContext). Cast avoids a
  // dummy full-scenario build and any core type widening.
  const coreScenario = { room: roomMm } as Scenario;
  const cols = Math.floor(roomMm.widthMm / GRID_SIZE_MM);
  const rows = Math.floor(roomMm.depthMm / GRID_SIZE_MM);

  const radiusForUnit = (unitId: string): number => {
    const p = profiles.get(unitId);
    if (!p) throw new Error(`unknown mobile unit: ${unitId}`);
    return p.radiusMm;
  };

  const rectForUnitAt = (unitId: string, pos: XzMm): Rect => {
    const p = profiles.get(unitId);
    if (!p) throw new Error(`unknown mobile unit: ${unitId}`);
    return footprintRect(pos, p.footprintMm);
  };

  const buildNav = (
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm> | null,
  ): NavContext => {
    const self = profiles.get(forUnitId);
    if (!self) throw new Error(`unknown mobile unit: ${forUnitId}`);
    const r = self.radiusMm;
    const cartR = Math.ceil(
      Math.hypot(self.footprintMm.width, self.footprintMm.length) / 2,
    );
    const inflated: Rect[] = [
      ...rackRects.map((rc) => inflateRect(rc, r)),
      ...obstacleRects.map((oc) => inflateRect(oc, r)),
    ];
    if (otherPoses) {
      for (const [otherId, pose] of otherPoses) {
        if (otherId === forUnitId) continue;
        const other = profiles.get(otherId);
        if (!other) continue;
        // Stationary B as its declared circumscribed disc (AABB +-rB),
        // inflated by A's moving radius rA: consistent with the analytic
        // rA+rB admission, never the smaller physical rect without margin.
        inflated.push(occupancyRectFor(r, pose, other.radiusMm));
      }
    }
    return {
      cartRadiusMm: cartR,
      navigationRadiusMm: r,
      inflatedObstacles: inflated,
      cols,
      rows,
    };
  };

  const isStaticNavigable = (point: XzMm, forUnitId: string): boolean => {
    if (!isSafeIntPair(point)) return false;
    return pointNavigable(
      point as PointMm,
      coreScenario,
      buildNav(forUnitId, null),
    );
  };

  const isNavigable = (
    point: XzMm,
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm>,
  ): boolean => {
    if (!isSafeIntPair(point)) return false;
    return pointNavigable(
      point as PointMm,
      coreScenario,
      buildNav(forUnitId, otherPoses),
    );
  };

  const rectOverlapsActual = (rect: Rect): boolean =>
    [...rackRects, ...obstacleRects].some(
      (o) =>
        Math.max(rect.minX, o.minX) < Math.min(rect.maxX, o.maxX) &&
        Math.max(rect.minZ, o.minZ) < Math.min(rect.maxZ, o.maxZ),
    );

  const rectInRoom = (rect: Rect): boolean =>
    rect.minX >= 0 &&
    rect.minZ >= 0 &&
    rect.maxX <= roomMm.widthMm &&
    rect.maxZ <= roomMm.depthMm;

  // Witnessed occupiers: other units whose disc occupancy square (declared
  // disc AABB +-rB inflated by the mover's radius rA, exactly mirroring
  // buildNav) contains the point (inclusive, matching pointInRect). Sorted
  // unitIds. Center distance is NOT used: with distinct profiles the nearest
  // unit may not be the one whose square actually covers the point.
  const occupiersContaining = (
    point: XzMm,
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm>,
  ): string[] => {
    const self = profiles.get(forUnitId) as UnitProfile;
    const out: string[] = [];
    for (const [otherId, pose] of otherPoses) {
      if (otherId === forUnitId) continue;
      const other = profiles.get(otherId);
      if (!other) continue;
      if (
        pointInRect(
          point as PointMm,
          occupancyRectFor(self.radiusMm, pose, other.radiusMm),
        )
      ) {
        out.push(otherId);
      }
    }
    out.sort();
    return out;
  };

  const blockingCandidatesOnCorridor = (
    points: XzMm[],
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm>,
  ): string[] => {
    const self = profiles.get(forUnitId);
    if (!self) throw new Error(`unknown mobile unit: ${forUnitId}`);
    const out: string[] = [];
    for (const [otherId, pose] of otherPoses) {
      if (otherId === forUnitId) continue;
      const other = profiles.get(otherId);
      if (!other) continue;
      const inflated = occupancyRectFor(self.radiusMm, pose, other.radiusMm);
      let touches = false;
      if (points.length <= 1) {
        touches =
          points.length === 1 &&
          pointInRect(points[0] as PointMm, inflated);
      } else {
        for (let i = 0; i + 1 < points.length; i += 1) {
          if (
            segmentHitsRect(
              points[i] as PointMm,
              points[i + 1] as PointMm,
              inflated,
            )
          ) {
            touches = true;
            break;
          }
        }
      }
      if (touches) out.push(otherId);
    }
    out.sort();
    return out;
  };

  const routeFromContext = (
    from: XzMm,
    to: XzMm,
    nav: NavContext,
  ): RouteResult => {
    let pts: PointMm[] | null;
    try {
      pts = shortestPathPointsMm(
        from as PointMm,
        to as PointMm,
        coreScenario,
        nav,
        createNavBudget(),
      );
    } catch (err) {
      // Budget exhaustion is a pathfinder resource failure, never a route.
      // Surface as NO_PATH with the underlying message for diagnosis.
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "rejected",
        reason: "NO_PATH",
        message: `no path: ${message}`,
      };
    }
    if (pts === null) {
      return { status: "rejected", reason: "NO_PATH", message: "no path" };
    }
    // Defense in depth: re-verify every swept segment avoids the inflated
    // set (the core call already guarantees this; a violation here is an
    // internal invariant failure, never silently admitted).
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i] as PointMm;
      const b = pts[i + 1] as PointMm;
      if (segmentBlocked(a, b, nav.inflatedObstacles)) {
        return {
          status: "rejected",
          reason: "NO_PATH",
          message: "route segment violates inflated obstacles",
        };
      }
    }
    const points: XzMm[] = pts.map((p) => ({ x: p.x, z: p.z }));
    const distancesMm: number[] = [];
    for (let i = 0; i + 1 < points.length; i += 1) {
      distancesMm.push(
        ceilDist(points[i] as XzMm, points[i + 1] as XzMm),
      );
    }
    const totalDistanceMm = distancesMm.reduce((n, d) => n + d, 0);
    return { status: "ok", points, distancesMm, totalDistanceMm };
  };

  const classifyEndpoints = (
    from: XzMm,
    to: XzMm,
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm> | null,
  ): RouteFailure | null => {
    if (!profiles.has(forUnitId)) {
      return {
        status: "rejected",
        reason: "UNKNOWN_UNIT",
        message: `unknown mobile unit: ${forUnitId}`,
      };
    }
    if (!isSafeIntPair(from) || !isSafeIntPair(to)) {
      return {
        status: "rejected",
        reason: "INVALID_COORDINATES",
        message: "route endpoints must be safe-integer XZ mm",
      };
    }
    const self = profiles.get(forUnitId) as UnitProfile;
    // Oversize/room/obstacle checks use the ACTUAL declared rect at the
    // destination (not the inflated center): a rect that leaves the room or
    // overlaps a rack/obstacle interior is rejected structurally, never as
    // zero travel.
    const toRect = footprintRect(to, self.footprintMm);
    if (!rectInRoom(toRect)) {
      return {
        status: "rejected",
        reason: "ROOM_EXCEEDED",
        message: `destination (${to.x},${to.z}) footprint leaves the room`,
      };
    }
    if (rectOverlapsActual(toRect)) {
      return {
        status: "rejected",
        reason: "OBSTACLE_OVERLAP",
        message: `destination (${to.x},${to.z}) footprint overlaps a rack/obstacle`,
      };
    }
    const nav = buildNav(forUnitId, otherPoses);
    if (!pointNavigable(from as PointMm, coreScenario, nav)) {
      // Attribute the blocked start to a witnessed occupier only when the
      // start is statically free (otherwise the cause is static geometry).
      // A singleton witness blames one unit; ambiguity (zero or many)
      // travels as candidates so callers report unknown/multiple causes
      // instead of inventing a blocker from ID order.
      let fromBlocker: string | undefined;
      let fromCandidates: string[] | undefined;
      if (otherPoses) {
        const staticNav = buildNav(forUnitId, null);
        if (pointNavigable(from as PointMm, coreScenario, staticNav)) {
          const witnesses = occupiersContaining(from, forUnitId, otherPoses);
          if (witnesses.length === 1) {
            fromBlocker = witnesses[0];
          } else {
            fromCandidates = witnesses;
          }
        }
      }
      return {
        status: "rejected",
        reason: "FROM_UNNAVIGABLE",
        message: `start (${from.x},${from.z}) violates clearance`,
        ...(fromBlocker !== undefined ? { blockerUnitId: fromBlocker } : {}),
        ...(fromCandidates !== undefined
          ? { candidateUnitIds: fromCandidates }
          : {}),
      };
    }
    if (!pointNavigable(to as PointMm, coreScenario, nav)) {
      // Distinguish occupied goal (inside another unit's inflated occupancy
      // rect) from static unnavigability when other poses are present.
      if (otherPoses) {
        const staticNav = buildNav(forUnitId, null);
        if (pointNavigable(to as PointMm, coreScenario, staticNav)) {
          // Statically free but blocked by units: blame only a witnessed
          // occupier (singleton). Ambiguity travels as candidates, never
          // as a nearest-center guess (distinct profiles can make the
          // nearest center a unit whose rect does not cover the goal).
          const witnesses = occupiersContaining(to, forUnitId, otherPoses);
          if (witnesses.length === 1) {
            return {
              status: "rejected",
              reason: "OCCUPIED_GOAL",
              message: `destination (${to.x},${to.z}) blocked by unit occupancy`,
              blockerUnitId: witnesses[0],
            };
          }
          return {
            status: "rejected",
            reason: "OCCUPIED_GOAL",
            message: `destination (${to.x},${to.z}) blocked by ambiguous unit occupancy (${witnesses.length} candidates)`,
            candidateUnitIds: witnesses,
          };
        }
      }
      return {
        status: "rejected",
        reason: "TO_UNNAVIGABLE",
        message: `destination (${to.x},${to.z}) violates clearance`,
      };
    }
    return null;
  };

  const findRoute = (
    from: XzMm,
    to: XzMm,
    forUnitId: string,
    otherPoses: ReadonlyMap<string, XzMm>,
  ): RouteResult => {
    const early = classifyEndpoints(from, to, forUnitId, otherPoses);
    if (early) return early;
    return routeFromContext(from, to, buildNav(forUnitId, otherPoses));
  };

  const findStaticRoute = (
    from: XzMm,
    to: XzMm,
    forUnitId: string,
  ): RouteResult => {
    const early = classifyEndpoints(from, to, forUnitId, null);
    if (early) {
      // Static query has no occupancies: map OCCUPIED_GOAL back to
      // TO_UNNAVIGABLE (cannot occur, but keep the contract total).
      if (early.reason === "OCCUPIED_GOAL") {
        return { ...early, reason: "TO_UNNAVIGABLE" };
      }
      return early;
    }
    return routeFromContext(from, to, buildNav(forUnitId, null));
  };

  return {
    roomMm,
    rackRects: [...rackRects],
    obstacleRects: [...obstacleRects],
    unitProfiles: profiles,
    radiusForUnit,
    rectForUnitAt,
    isStaticNavigable,
    isNavigable,
    findRoute,
    findStaticRoute,
    blockingCandidatesOnCorridor,
  };
}
