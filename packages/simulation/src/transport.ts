// v3-M3a kernel-owned transport controller. Pure headless admission over the
// accepted M2a kernel clock: no second clock, no browser frame authority,
// no inventory mutation (this module never imports inventory/resources).
//
// Policy (first, conservative whole-transit reservation, disclosed):
// - Each grant reserves its ENTIRE swept path for its ENTIRE transit
//   [startMs,endMs] (closed) plus every required exclusive zone for the
//   whole transit as half-open [startMs,endMs). Independent nonconflicting
//   paths move CONCURRENTLY; there is no global one-agent-at-a-time lock.
// - Atomic grants acquire path + required zones + safe downstream stopping
//   position (destination) together; any failure commits nothing, leaving
//   no stranded agent and no partial zone hold.
// - Narrow-aisle and intersection zones are both exclusive for the whole
//   transit in this first policy (intersections conservatively exclusive,
//   stronger than conflict-protected; disclosed throughput cost).
// - Destinations must lie FULLY CLEAR of all traffic zones (the whole
//   stopping envelope, same inflated-rect test as pathRequiresZone;
//   rejected otherwise), so zone release at completion never strands a
//   still-overlapping profile inside a zone. Terminal occupancy persists
//   at the destination until a replacement grant commits; zones release
//   at endMs (half-open handoff).
// - Initial spatial admission: parking slots must clear the room, static
//   racks/obstacles (declared rect + radius clearance), pairwise
//   conservative discs (same r600/closed-contact rule as movement:
//   center <= rA+rB+EPS rejects INITIAL_OVERLAP), and exclusive zones
//   (whole profile) before an executable controller is returned; failures
//   throw with a specific INITIAL_* reason and move/resize/delete nothing.
// - Movement trajectories are authorized piecewise-linear segments with
//   per-segment durations from travelTimeMs(distanceMm, speed). Snapshots
//   interpolate those AUTHORIZED trajectories at the kernel clock; no
//   teleport at start/end, no loops. Future UI uses read-only snapshots.
//
// Admission checks (in order, all before commit):
// 1. Static: room/footprint, obstacle overlap, destination outside zones,
//    static-only route exists (else REJECTED unreachable/oversize, never
//    zero travel). With-others route blocked => WAITING (temporary).
// 2. Dynamic swept: new trajectory vs other committed moving trajectories
//    (moving-moving overlap), vs other stationary discs (full interval),
//    terminal tails (N's [eP,eN] vs GP; P's [eN,eP] vs GN), terminals
//    mutually safe, zones exclusive (half-open overlap). Any conflict =>
//    WAITING with blocker unit/zone and original request age.
// Static failures REJECT; dynamic conflicts WAIT (blocker may move away).
// Retry happens only on meaningful release (movement completion) or an
// explicit bounded dispatch() pass; no busy-loop or zero-time polling.
//
// Plan versions/events: each unit's planVersion increments per grant;
// kernel.setTaskPlanVersion makes older completion events stale (kernel
// skips them, handler never runs). Completion event IDs are bounded
// deterministic internal IDs (stable unit index + plan version),
// independent of user ID length. Grants commit atomically: prevalidation
// and kernel scheduling happen BEFORE any unit/queue/hold mutation, so a
// failing grant leaves unit/waits/holds/version/clock unchanged with no
// phantom trajectory. Replacement validates the new plan BEFORE
// overwriting; moving replan is rejected (preserves old plan).
// Midroute cancellation is rejected as UNSAFE_MIDROUTE (motion continues
// to its safe endpoint; never false 'cancelled', never teleport to
// parking, never erased occupancy). Waiting cancellation releases the
// pending request only. Only UNUSED future allocations are ever released.
//
// Waits: FIFO by (requestTimeMs, unitId) stable; ageMs = clock-requestTime.
// Blocker attribution is witnessed or explicitly unknown: occupancy
// conflicts name the computed conflicting unit/zone, corridor/goal
// attribution names a singleton inflated-occupancy witness, and ambiguity
// reports {kind:"unknown",candidates} without inventing edges (unknown
// causes never fabricate a DEADLOCK_CYCLE). getDiagnostic reports bounded
// deadlock/impossible state when pending exists, nothing moves, and
// nothing is grantable now (no future release scheduled); otherwise null.
// No warehouse-lifecycle/shipment metrics.
//
// Isolation: every public return path hands out detached clones (granted
// plans additionally frozen); stored waits hold their own copies. Caller
// mutation of a result can never edit owned snapshot/diagnostic state,
// and caller-owned scenario objects are never re-read after construction.
import { EVENT_PRIORITY } from "./priorities.js";
import {
  MAX_KERNEL_PRIORITY,
  MAX_PLAN_VERSION,
  createKernel,
  type Kernel,
  type StepResult,
} from "./kernel.js";
import { createTransportNav, type TransportNav, type XzMm } from "./navigation.js";
import type { OperationsScenario, OperationsTrafficZone } from "./schema.js";
import { MAX_TIME_MS } from "./schema.js";
import { OPERATIONS_ENGINE_VERSION } from "./version.js";
import {
  pathRequiresZone,
  poseOnSegment,
  stationaryVsStationaryConflict,
  trajectoriesConflict,
  trajectoryVsStationaryConflict,
  trajectoryVsStationaryInWindowConflict,
  zoneHoldsOverlap,
  type TimedSegment,
  type Trajectory,
} from "./traffic.js";
import { travelTimeMs } from "./travel.js";
import {
  inflateRect,
  pointInRect,
  rectsOverlapInterior,
  type Rect,
} from "@layoutlab/core";

export type MoveDestination = { x: number; z: number };

export type WaitBlocker =
  | { kind: "unit"; blockerUnitId: string; reason: string }
  | { kind: "zone"; zoneId: string; holderUnitId: string; reason: string }
  // Explicit unknown/multiple cause: no single occupier could be witnessed
  // (zero or several candidates). Diagnostics must not invent wait-for
  // edges from these, so they can never fabricate a DEADLOCK_CYCLE.
  | { kind: "unknown"; reason: string; candidates: string[] };

export type GrantedPlan = {
  unitId: string;
  planVersion: number;
  destination: MoveDestination;
  points: MoveDestination[];
  distancesMm: number[];
  totalDistanceMm: number;
  totalDurationMs: number;
  startMs: number;
  endMs: number;
  requiredZones: string[];
};

export type MoveResult =
  | { status: "granted"; plan: GrantedPlan; waitMs: number }
  | {
      status: "waiting";
      unitId: string;
      destination: MoveDestination;
      requestTimeMs: number;
      ageMs: number;
      blocker: WaitBlocker;
    }
  | {
      status: "rejected";
      unitId: string;
      reason: { code: string; message: string; blockerUnitId?: string };
    };

export type CancelResult =
  | { status: "cancelled"; unitId: string }
  | { status: "rejected"; unitId: string; reason: { code: string; message: string } };

export type UnitSnapshot = {
  unitId: string;
  pose: MoveDestination;
  state: "moving" | "waiting" | "idle";
  planVersion: number;
  plan: GrantedPlan | null;
  waiting: {
    destination: MoveDestination;
    requestTimeMs: number;
    ageMs: number;
    blocker: WaitBlocker;
  } | null;
};

export type TransportSnapshot = {
  engineVersion: string;
  clockMs: number;
  units: UnitSnapshot[];
  pendingCount: number;
  activeCount: number;
};

export type TransportDiagnostic =
  | {
      status: "stuck";
      kind: "DEADLOCK_CYCLE" | "IMPOSSIBLE_WAIT";
      detail: string;
      cycle?: string[];
      waits: { unitId: string; blocker: WaitBlocker; ageMs: number }[];
    }
  | {
      status: "kernel-invalid";
      detail: string;
    };

export type TransportController = {
  getClockMs(): number;
  getKernelStatus(): string;
  stepEvent(): StepResult;
  advanceTo(targetMs: number): StepResult;
  requestMove(
    unitId: string,
    destination: MoveDestination,
    requestTimeMs?: number,
  ): MoveResult;
  cancelPlan(unitId: string): CancelResult;
  poseAt(unitId: string, timeMs?: number): MoveDestination;
  snapshot(): TransportSnapshot;
  dispatch(): MoveResult[];
  getDiagnostic(): TransportDiagnostic | null;
};

type InternalUnit = {
  unitId: string;
  speed: number;
  radius: number;
  currentPose: MoveDestination;
  plan: GrantedPlan | null;
  trajectory: Trajectory | null;
  planVersion: number;
  waiting: { destination: MoveDestination; requestTimeMs: number; blocker: WaitBlocker } | null;
};

type ZoneHold = { zoneId: string; unitId: string; planVersion: number; startMs: number; endMs: number };

function freezeDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      freezeDeep((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

function isXz(value: unknown): value is MoveDestination {
  if (typeof value !== "object" || value === null) return false;
  const { x, z } = value as Record<string, unknown>;
  return Number.isSafeInteger(x) && Number.isSafeInteger(z);
}

function completionEventId(unitIndex: number, version: number): string {
  // Bounded deterministic internal ID, independent of user ID length: a
  // 128-character unit ID still yields a short kernel event ID. Stable
  // unit index (scenario order) plus the unit's monotonic plan version
  // keeps every completion ID unique without crypto or truncation.
  return `transport-complete-u${unitIndex}-v${version}`;
}

function cloneWaitBlocker(blocker: WaitBlocker): WaitBlocker {
  switch (blocker.kind) {
    case "unit":
      return {
        kind: "unit",
        blockerUnitId: blocker.blockerUnitId,
        reason: blocker.reason,
      };
    case "zone":
      return {
        kind: "zone",
        zoneId: blocker.zoneId,
        holderUnitId: blocker.holderUnitId,
        reason: blocker.reason,
      };
    case "unknown":
      return {
        kind: "unknown",
        reason: blocker.reason,
        candidates: [...blocker.candidates],
      };
  }
}

function unitOrUnknownBlocker(
  blockerUnitId: string | undefined,
  candidateUnitIds: string[] | undefined,
  reason: string,
): WaitBlocker {
  if (blockerUnitId !== undefined) {
    return { kind: "unit", blockerUnitId, reason };
  }
  return { kind: "unknown", reason, candidates: [...(candidateUnitIds ?? [])] };
}

function cloneGrantedPlan(plan: GrantedPlan): GrantedPlan {
  return {
    ...plan,
    destination: { ...plan.destination },
    points: plan.points.map((p) => ({ ...p })),
    distancesMm: [...plan.distancesMm],
    requiredZones: [...plan.requiredZones],
  };
}

export function createTransportController(opts: {
  scenario: OperationsScenario;
  maxProcessedEvents?: number;
  maxEventsPerTimestamp?: number;
}): TransportController {
  const scenario = opts.scenario;
  const nav: TransportNav = createTransportNav(scenario);
  const zones: OperationsTrafficZone[] = scenario.geometry.trafficZones ?? [];
  const zoneRects = new Map<string, Rect>();
  for (const z of zones) {
    zoneRects.set(z.id, { minX: z.minXMm, maxX: z.maxXMm, minZ: z.minZMm, maxZ: z.maxZMm });
  }

  const units = new Map<string, InternalUnit>();
  for (const u of scenario.mobileUnits) {
    units.set(u.id, {
      unitId: u.id,
      speed: u.speedMmPerSecond,
      radius: nav.radiusForUnit(u.id),
      currentPose: { x: u.parkingSlotMm.x, z: u.parkingSlotMm.z },
      plan: null,
      trajectory: null,
      planVersion: 0,
      waiting: null,
    });
  }
  // Stable unit index in scenario order for bounded internal event IDs.
  const unitOrder = new Map<string, number>();
  scenario.mobileUnits.forEach((u, i) => unitOrder.set(u.id, i));
  // Initial spatial admission (M3a-R1, uniform R2): every parking slot
  // must be a physically executable start before an executable controller
  // is returned. Failures throw with a specific geometry reason; nothing
  // is moved, resized, or deleted. Pairwise admission uses the SAME
  // declared conservative disc radius and inclusive-contact epsilon as
  // stationary/moving admission (stationaryVsStationaryConflict): center
  // separation <= rA+rB+EPS rejects INITIAL_OVERLAP. Rect-interior
  // non-overlap is insufficient: edge-touching rects (0 gap) violate the
  // declared margins, and touching discs (1200 for two r600) are traffic
  // conflicts. Initial poses must also clear every exclusive zone by the
  // whole profile, consistent with the endpoint-envelope policy below.
  for (const u of scenario.mobileUnits) {
    const park = { x: u.parkingSlotMm.x, z: u.parkingSlotMm.z };
    const rect = nav.rectForUnitAt(u.id, park);
    const radius = nav.radiusForUnit(u.id);
    if (
      rect.minX < 0 ||
      rect.minZ < 0 ||
      rect.maxX > nav.roomMm.widthMm ||
      rect.maxZ > nav.roomMm.depthMm
    ) {
      throw new Error(
        `initial admission rejected [INITIAL_ROOM_EXCEEDED]: unit ${u.id} declared footprint [${rect.minX}..${rect.maxX}]x[${rect.minZ}..${rect.maxZ}] at (${park.x},${park.z}) leaves the ${nav.roomMm.widthMm}x${nav.roomMm.depthMm} room`,
      );
    }
    for (let i = 0; i < nav.rackRects.length; i += 1) {
      const rackRect = nav.rackRects[i] as Rect;
      if (rectsOverlapInterior(rect, rackRect)) {
        throw new Error(
          `initial admission rejected [INITIAL_OBSTACLE_OVERLAP]: unit ${u.id} declared footprint at (${park.x},${park.z}) overlaps rack ${scenario.geometry.racks[i]?.id ?? i}`,
        );
      }
    }
    for (let i = 0; i < nav.obstacleRects.length; i += 1) {
      const obsRect = nav.obstacleRects[i] as Rect;
      if (rectsOverlapInterior(rect, obsRect)) {
        throw new Error(
          `initial admission rejected [INITIAL_OBSTACLE_OVERLAP]: unit ${u.id} declared footprint at (${park.x},${park.z}) overlaps obstacle ${scenario.geometry.obstacles[i]?.id ?? i}`,
        );
      }
    }
    // Clearance mirrors pointNavigable exactly (wall band + inflated
    // racks/obstacles) with a specific reason per cause.
    if (
      park.x <= radius ||
      park.z <= radius ||
      park.x >= nav.roomMm.widthMm - radius ||
      park.z >= nav.roomMm.depthMm - radius
    ) {
      throw new Error(
        `initial admission rejected [INITIAL_CLEARANCE]: unit ${u.id} center (${park.x},${park.z}) is within its ${radius}mm radius of the room wall band`,
      );
    }
    const inflatedHits: string[] = [];
    for (let i = 0; i < nav.rackRects.length; i += 1) {
      if (
        pointInRect(
          { x: park.x, z: park.z },
          inflateRect(nav.rackRects[i] as Rect, radius),
        )
      ) {
        inflatedHits.push(`rack ${scenario.geometry.racks[i]?.id ?? i}`);
      }
    }
    for (let i = 0; i < nav.obstacleRects.length; i += 1) {
      if (
        pointInRect(
          { x: park.x, z: park.z },
          inflateRect(nav.obstacleRects[i] as Rect, radius),
        )
      ) {
        inflatedHits.push(
          `obstacle ${scenario.geometry.obstacles[i]?.id ?? i}`,
        );
      }
    }
    if (inflatedHits.length > 0) {
      throw new Error(
        `initial admission rejected [INITIAL_CLEARANCE]: unit ${u.id} center (${park.x},${park.z}) violates ${radius}mm clearance at ${inflatedHits.join(", ")}`,
      );
    }
    for (const [zoneId, zoneRect] of zoneRects) {
      if (pathRequiresZone([park], radius, zoneRect)) {
        throw new Error(
          `initial admission rejected [INITIAL_IN_ZONE]: unit ${u.id} profile at (${park.x},${park.z}) intersects exclusive zone ${zoneId}; configure holding bays fully clear of zones`,
        );
      }
    }
  }
  {
    const order = [...units.keys()];
    for (let i = 0; i < order.length; i += 1) {
      const aId = order[i] as string;
      const aUnit = units.get(aId) as InternalUnit;
      const aPose = aUnit.currentPose;
      for (let j = i + 1; j < order.length; j += 1) {
        const bId = order[j] as string;
        const bUnit = units.get(bId) as InternalUnit;
        const bPose = bUnit.currentPose;
        if (
          stationaryVsStationaryConflict(
            aPose,
            aUnit.radius,
            bPose,
            bUnit.radius,
          )
        ) {
          const dist = Math.hypot(aPose.x - bPose.x, aPose.z - bPose.z);
          throw new Error(
            `initial admission rejected [INITIAL_OVERLAP]: units ${aId} at (${aPose.x},${aPose.z}) r${aUnit.radius} and ${bId} at (${bPose.x},${bPose.z}) r${bUnit.radius} conflict (center ${dist}mm <= ${aUnit.radius + bUnit.radius} + EPS, same closed-contact rule as movement)`,
          );
        }
      }
    }
  }
  // Pending in FIFO (requestTimeMs, unitId) order. Each waiting unit appears
  // at most once (replacement swaps in place).
  let pending: { unitId: string; destination: MoveDestination; requestTimeMs: number }[] = [];
  let holds: ZoneHold[] = [];

  const sortPending = (): void => {
    pending.sort(
      (a, b) => a.requestTimeMs - b.requestTimeMs || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0),
    );
  };

  const currentPoses = (excludeUnitId?: string): Map<string, XzMm> => {
    const m = new Map<string, XzMm>();
    for (const [id, u] of units) {
      if (id === excludeUnitId) continue;
      // Other moving units contribute their ACTUAL pose at the kernel clock
      // for static route blocking (conservative snapshot obstacle).
      m.set(id, { ...poseAtInternal(id, kernel.getClockMs()) });
    }
    return m;
  };

  const kernel: Kernel = createKernel({
    maxProcessedEvents: opts.maxProcessedEvents ?? scenario.policies.eventLimits.maxProcessedEvents,
    maxEventsPerTimestamp: opts.maxEventsPerTimestamp ?? scenario.policies.eventLimits.maxEventsPerTimestamp,
    onEvent: (event, api) => {
      if (event.kind !== "MOVEMENT_COMPLETED") return;
      const data = event.data as { unitId?: unknown; planVersion?: unknown } | null;
      const unitId = typeof data?.unitId === "string" ? data.unitId : null;
      const version = typeof data?.planVersion === "number" ? data.planVersion : null;
      if (unitId === null || version === null) return;
      const u = units.get(unitId);
      // Stale completions never move an agent: the kernel already skips
      // plan-version-stale events, and this guard covers defensive mismatch
      // (e.g., restored state): only the current version commits.
      if (!u || !u.plan || !u.trajectory) return;
      if (u.planVersion !== version || u.plan.planVersion !== version) return;
      if (event.taskId !== unitId) return;
      u.currentPose = { ...u.plan.destination };
      holds = holds.filter(
        (h) => !(h.unitId === unitId && h.planVersion === version),
      );
      u.plan = null;
      u.trajectory = null;
      void api;
      // Meaningful release: exactly one bounded retry pass over pending.
      retryPendingInternal();
    },
  });

  const poseAtInternal = (unitId: string, timeMs: number): MoveDestination => {
    const u = units.get(unitId);
    if (!u) throw new Error(`unknown mobile unit: ${unitId}`);
    if (!u.trajectory || !u.plan) {
      return { ...u.currentPose };
    }
    const traj = u.trajectory;
    if (timeMs <= traj.startMs) {
      const first = traj.segments[0];
      if (!first) return { ...u.currentPose };
      return { x: first.fromX, z: first.fromZ };
    }
    if (timeMs >= traj.endMs) {
      return { ...traj.destination };
    }
    for (const seg of traj.segments) {
      if (timeMs >= seg.startMs && timeMs <= seg.endMs) {
        return poseOnSegment(seg, timeMs);
      }
    }
    return { ...traj.destination };
  };

  const buildTrajectory = (
    unitId: string,
    points: MoveDestination[],
    distancesMm: number[],
    startMs: number,
  ): { trajectory: Trajectory; planTimes: { startMs: number; endMs: number; totalDurationMs: number }; segments: TimedSegment[] } | { error: string } => {
    const u = units.get(unitId) as InternalUnit;
    const segments: TimedSegment[] = [];
    let t = startMs;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const from = points[i] as MoveDestination;
      const to = points[i + 1] as MoveDestination;
      const dist = distancesMm[i] as number;
      let dur: number;
      try {
        dur = travelTimeMs(dist, u.speed);
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
      const segStart = t;
      const segEnd = segStart + dur;
      if (segEnd > MAX_TIME_MS) {
        return { error: `route duration exceeds max time ${MAX_TIME_MS}` };
      }
      segments.push({
        fromX: from.x,
        fromZ: from.z,
        toX: to.x,
        toZ: to.z,
        startMs: segStart,
        endMs: segEnd,
      });
      t = segEnd;
    }
    // Zero-point route (start==destination, single point): zero segments,
    // zero duration, closed [start,start]. No motion events beyond the
    // completion at startMs (bounded by the kernel timestamp cap).
    const endMs = segments.length === 0 ? startMs : t;
    const trajectory: Trajectory = {
      unitId,
      radiusMm: u.radius,
      segments,
      startMs,
      endMs,
      destination: { ...(points[points.length - 1] as MoveDestination) },
    };
    return {
      trajectory,
      planTimes: { startMs, endMs, totalDurationMs: endMs - startMs },
      segments,
    };
  };

  const requiredZonesFor = (points: MoveDestination[], radius: number): string[] => {
    const out: string[] = [];
    for (const [zoneId, rect] of zoneRects) {
      if (pathRequiresZone(points, radius, rect)) out.push(zoneId);
    }
    out.sort();
    return out;
  };

  // Terminal stopping envelope: a destination is inside a zone when the
  // unit's whole profile at the destination intersects it, using the same
  // conservative inflated-rect test as pathRequiresZone (center-only
  // checks would release a hold while the footprint still overlaps).
  const destinationInZone = (
    dest: MoveDestination,
    radiusMm: number,
  ): string | null => {
    for (const [zoneId, rect] of zoneRects) {
      if (pathRequiresZone([dest], radiusMm, rect)) return zoneId;
    }
    return null;
  };

  // Full admission attempt for a fresh requestTime (grant time = clock).
  // Returns granted/waiting/rejected WITHOUT mutating pending on rejected
  // (atomic); on waiting the caller enqueues; on granted the caller commits.
  // When called from retry, originalRequestTimeMs preserves FIFO age.
  const attemptGrant = (
    unitId: string,
    destination: MoveDestination,
    grantTimeMs: number,
    originalRequestTimeMs: number,
  ): MoveResult => {
    const u = units.get(unitId);
    if (!u) {
      return {
        status: "rejected",
        unitId,
        reason: { code: "UNKNOWN_UNIT", message: `unknown mobile unit: ${unitId}` },
      };
    }
    if (!isXz(destination)) {
      return {
        status: "rejected",
        unitId,
        reason: { code: "INVALID_DESTINATION", message: "destination must be safe-integer XZ mm" },
      };
    }
    // Destinations whose stopping envelope intersects an exclusive zone
    // are rejected (policy): endpoints stay fully clear so zone release
    // at completion is safe.
    const insideZone = destinationInZone(destination, u.radius);
    if (insideZone) {
      return {
        status: "rejected",
        unitId,
        reason: {
          code: "DESTINATION_IN_ZONE",
          message: `destination (${destination.x},${destination.z}) stopping envelope intersects exclusive zone ${insideZone}; configure holding bays fully clear of zones`,
        },
      };
    }
    const from = { ...poseAtInternal(unitId, grantTimeMs) };
    // For a moving unit this path is unreachable (requestMove rejects moving
    // before attemptGrant), so `from` is the stationary current pose.
    const others = currentPoses(unitId);
    // Static-only route first: failure here is truly unreachable/oversize.
    const staticRoute = nav.findStaticRoute(from, destination, unitId);
    if (staticRoute.status === "rejected") {
      return {
        status: "rejected",
        unitId,
        reason: {
          code: staticRoute.reason,
          message: staticRoute.message,
          blockerUnitId: staticRoute.blockerUnitId,
        },
      };
    }
    // With-others route: failure here is temporary unit blockage => wait.
    // Attribution is witnessed or explicitly unknown: a singleton witness
    // blames one unit, ambiguity reports unknown/multiple causes with the
    // witnessed candidates. ID order is never used as causal evidence.
    const dynRoute = nav.findRoute(from, destination, unitId, others);
    if (dynRoute.status === "rejected") {
      if (dynRoute.reason === "OCCUPIED_GOAL") {
        return {
          status: "waiting",
          unitId,
          destination: { ...destination },
          requestTimeMs: originalRequestTimeMs,
          ageMs: grantTimeMs - originalRequestTimeMs,
          blocker: unitOrUnknownBlocker(
            dynRoute.blockerUnitId,
            dynRoute.candidateUnitIds,
            "OCCUPIED_GOAL",
          ),
        };
      }
      if (dynRoute.reason === "NO_PATH") {
        // Static path exists but unit-aware path does not: occupancies
        // block every corridor. Witness from the static centerline vs
        // inflated occupancies; ambiguity stays unknown, never invented.
        const candidates = nav.blockingCandidatesOnCorridor(
          staticRoute.points,
          unitId,
          others,
        );
        return {
          status: "waiting",
          unitId,
          destination: { ...destination },
          requestTimeMs: originalRequestTimeMs,
          ageMs: grantTimeMs - originalRequestTimeMs,
          blocker:
            candidates.length === 1
              ? {
                  kind: "unit",
                  blockerUnitId: candidates[0] as string,
                  reason: "CORRIDOR_BLOCKED",
                }
              : { kind: "unknown", reason: "CORRIDOR_BLOCKED", candidates },
        };
      }
      // FROM/TO unnavigable under units but static said ok: treat as wait
      // (another unit's occupancy covers the endpoint now), witnessed or
      // explicitly unknown.
      return {
        status: "waiting",
        unitId,
        destination: { ...destination },
        requestTimeMs: originalRequestTimeMs,
        ageMs: grantTimeMs - originalRequestTimeMs,
        blocker: unitOrUnknownBlocker(
          dynRoute.blockerUnitId,
          dynRoute.candidateUnitIds,
          dynRoute.reason,
        ),
      };
    }
    const built = buildTrajectory(unitId, dynRoute.points, dynRoute.distancesMm, grantTimeMs);
    if ("error" in built) {
      return {
        status: "rejected",
        unitId,
        reason: { code: "DURATION_OVERFLOW", message: built.error },
      };
    }
    const { trajectory } = built;
    const requiredZones = requiredZonesFor(dynRoute.points, u.radius);

    // Other committed moving trajectories (deterministic unitId order).
    const othersMoving = [...units.values()]
      .filter((o) => o.unitId !== unitId && o.trajectory && o.plan)
      .sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
    for (const o of othersMoving) {
      const ot = o.trajectory as Trajectory;
      const mm = trajectoriesConflict(trajectory, ot);
      if (mm.conflict) {
        return {
          status: "waiting",
          unitId,
          destination: { ...destination },
          requestTimeMs: originalRequestTimeMs,
          ageMs: grantTimeMs - originalRequestTimeMs,
          blocker: { kind: "unit", blockerUnitId: o.unitId, reason: "TRAJECTORY_CONFLICT" },
        };
      }
    }
    // Other stationary discs (idle/waiting at current poses).
    const othersStationary = [...units.values()]
      .filter((o) => o.unitId !== unitId && !o.trajectory)
      .sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
    for (const o of othersStationary) {
      const c = trajectoryVsStationaryConflict(trajectory, o.currentPose, o.radius);
      if (c.conflict) {
        // Destination-close vs mid-path: both wait on the same blocker;
        // distinguish for explanation.
        const destClose = stationaryVsStationaryConflict(
          destination,
          u.radius,
          o.currentPose,
          o.radius,
        );
        return {
          status: "waiting",
          unitId,
          destination: { ...destination },
          requestTimeMs: originalRequestTimeMs,
          ageMs: grantTimeMs - originalRequestTimeMs,
          blocker: {
            kind: "unit",
            blockerUnitId: o.unitId,
            reason: destClose ? "OCCUPIED_GOAL" : "STOPPED_AGENT_IN_PATH",
          },
        };
      }
    }
    // Terminal tails vs other moving goals (conservative whole-transit):
    // N's [eP,eN] vs GP and P's [eN,eP] vs GN, plus terminal-terminal.
    for (const o of othersMoving) {
      const ot = o.trajectory as Trajectory;
      const oGoal = (o.plan as GrantedPlan).destination;
      if (ot.endMs <= trajectory.endMs) {
        const c = trajectoryVsStationaryInWindowConflict(
          trajectory,
          oGoal,
          o.radius,
          ot.endMs,
          trajectory.endMs,
        );
        if (c.conflict) {
          return {
            status: "waiting",
            unitId,
            destination: { ...destination },
            requestTimeMs: originalRequestTimeMs,
            ageMs: grantTimeMs - originalRequestTimeMs,
            blocker: { kind: "unit", blockerUnitId: o.unitId, reason: "TERMINAL_TAIL_CONFLICT" },
          };
        }
      }
      if (trajectory.endMs <= ot.endMs) {
        const c = trajectoryVsStationaryInWindowConflict(
          ot,
          destination,
          u.radius,
          trajectory.endMs,
          ot.endMs,
        );
        if (c.conflict) {
          return {
            status: "waiting",
            unitId,
            destination: { ...destination },
            requestTimeMs: originalRequestTimeMs,
            ageMs: grantTimeMs - originalRequestTimeMs,
            blocker: { kind: "unit", blockerUnitId: o.unitId, reason: "TERMINAL_TAIL_CONFLICT" },
          };
        }
      }
      if (
        stationaryVsStationaryConflict(destination, u.radius, oGoal, o.radius)
      ) {
        return {
          status: "waiting",
          unitId,
          destination: { ...destination },
          requestTimeMs: originalRequestTimeMs,
          ageMs: grantTimeMs - originalRequestTimeMs,
          blocker: { kind: "unit", blockerUnitId: o.unitId, reason: "TERMINAL_OVERLAP" },
        };
      }
    }
    // Terminals vs other stationary (idle/waiting) goals: covered above by
    // trajectory-vs-stationary (destination is the trajectory end), but keep
    // the explicit check for a clear OCCUPIED_GOAL reason (already handled).
    // Exclusive zones (half-open overlap with committed holds).
    for (const zoneId of requiredZones) {
      for (const h of holds) {
        if (h.zoneId !== zoneId) continue;
        if (
          zoneHoldsOverlap(trajectory.startMs, trajectory.endMs, h.startMs, h.endMs)
        ) {
          return {
            status: "waiting",
            unitId,
            destination: { ...destination },
            requestTimeMs: originalRequestTimeMs,
            ageMs: grantTimeMs - originalRequestTimeMs,
            blocker: {
              kind: "zone",
              zoneId,
              holderUnitId: h.unitId,
              reason: "ZONE_EXCLUSIVE",
            },
          };
        }
      }
    }
    // All clear: build the granted plan value (commit happens in the caller
    // so replacement can validate BEFORE overwriting).
    const plan: GrantedPlan = {
      unitId,
      planVersion: u.planVersion + 1,
      destination: { ...destination },
      points: dynRoute.points.map((p) => ({ ...p })),
      distancesMm: [...dynRoute.distancesMm],
      totalDistanceMm: dynRoute.totalDistanceMm,
      totalDurationMs: trajectory.endMs - trajectory.startMs,
      startMs: trajectory.startMs,
      endMs: trajectory.endMs,
      requiredZones: [...requiredZones],
    };
    return {
      status: "granted",
      plan,
      waitMs: grantTimeMs - originalRequestTimeMs,
    };
  };

  const commitGrant = (
    unitId: string,
    granted: Extract<MoveResult, { status: "granted" }>,
    trajectory: Trajectory,
  ): void => {
    const u = units.get(unitId) as InternalUnit;
    const newVersion = granted.plan.planVersion;
    // Prevalidate every failure-prone part BEFORE committing grant state,
    // and schedule the completion BEFORE mutating unit/queue/hold state:
    // any throw below leaves unit/waits/holds/version/clock unchanged
    // with no phantom trajectory. Completion owns the terminal commit;
    // stale versions can never move.
    if (EVENT_PRIORITY.COMPLETION > MAX_KERNEL_PRIORITY) {
      throw new Error("completion priority exceeds kernel bound");
    }
    if (
      !Number.isSafeInteger(newVersion) ||
      newVersion < 0 ||
      newVersion > MAX_PLAN_VERSION
    ) {
      throw new Error(
        `grant plan version ${newVersion} outside 0..${MAX_PLAN_VERSION}`,
      );
    }
    const eventId = completionEventId(
      unitOrder.get(unitId) as number,
      newVersion,
    );
    kernel.schedule({
      id: eventId,
      timeMs: granted.plan.endMs,
      priority: EVENT_PRIORITY.COMPLETION,
      kind: "MOVEMENT_COMPLETED",
      data: {
        unitId,
        planVersion: newVersion,
        destination: { ...granted.plan.destination },
      },
      taskId: unitId,
      planVersion: newVersion,
    });
    try {
      kernel.setTaskPlanVersion(unitId, newVersion);
    } catch (err) {
      kernel.cancel(eventId);
      throw err;
    }
    u.planVersion = newVersion;
    u.plan = cloneGrantedPlan(granted.plan);
    u.trajectory = trajectory;
    u.waiting = null;
    pending = pending.filter((p) => p.unitId !== unitId);
    for (const zoneId of granted.plan.requiredZones) {
      holds.push({
        zoneId,
        unitId,
        planVersion: newVersion,
        startMs: granted.plan.startMs,
        endMs: granted.plan.endMs,
      });
    }
  };

  // Rebuild the trajectory for a granted plan (same inputs => same times).
  // Used only at commit, immediately after attemptGrant validated.
  const trajectoryForGranted = (
    unitId: string,
    granted: Extract<MoveResult, { status: "granted" }>,
  ): Trajectory => {
    const u = units.get(unitId) as InternalUnit;
    const built = buildTrajectory(
      unitId,
      granted.plan.points,
      granted.plan.distancesMm,
      granted.plan.startMs,
    );
    if ("error" in built) {
      throw new Error(`grant trajectory rebuild failed: ${built.error}`);
    }
    void u;
    return built.trajectory;
  };

  const enqueueWaiting = (
    unitId: string,
    destination: MoveDestination,
    requestTimeMs: number,
    blocker: WaitBlocker,
  ): void => {
    const u = units.get(unitId) as InternalUnit;
    u.waiting = {
      destination: { ...destination },
      requestTimeMs,
      blocker: cloneWaitBlocker(blocker),
    };
    pending = pending.filter((p) => p.unitId !== unitId);
    pending.push({ unitId, destination: { ...destination }, requestTimeMs });
    sortPending();
  };

  const retryPendingInternal = (): void => {
    // One bounded FIFO pass; grants schedule completions (future releases),
    // waits stay queued with refreshed blockers/ages. No looping.
    const order = [...pending];
    for (const entry of order) {
      const u = units.get(entry.unitId);
      if (!u || u.plan) continue;
      const attempt = attemptGrant(
        entry.unitId,
        entry.destination,
        kernel.getClockMs(),
        entry.requestTimeMs,
      );
      if (attempt.status === "granted") {
        commitGrant(entry.unitId, attempt, trajectoryForGranted(entry.unitId, attempt));
      } else if (attempt.status === "waiting") {
        enqueueWaiting(entry.unitId, entry.destination, entry.requestTimeMs, attempt.blocker);
      } else {
        // Static rejection on retry (should not occur: static was valid at
        // enqueue and static geometry never changes). Retain the wait and
        // expose the rejection as the blocker reason rather than dropping
        // the task (never teleport/delete).
        enqueueWaiting(entry.unitId, entry.destination, entry.requestTimeMs, {
          kind: "unit",
          blockerUnitId: entry.unitId,
          reason: attempt.reason.code,
        });
      }
    }
  };

  const controller: TransportController = {
    getClockMs: () => kernel.getClockMs(),
    getKernelStatus: () => kernel.getStatus(),
    stepEvent: () => kernel.stepEvent(),
    advanceTo: (targetMs: number) => kernel.advanceTo(targetMs),

    requestMove: (unitId, destination, requestTimeMs) => {
      if (kernel.getStatus() === "invalid") {
        throw new Error(
          `cannot request move: kernel is invalid (${kernel.snapshot().diagnostic})`,
        );
      }
      const clock = kernel.getClockMs();
      const reqTime = requestTimeMs ?? clock;
      if (!Number.isSafeInteger(reqTime) || reqTime < 0 || reqTime > MAX_TIME_MS) {
        return {
          status: "rejected",
          unitId,
          reason: { code: "INVALID_REQUEST_TIME", message: "requestTimeMs must be a safe integer in 0..MAX_TIME_MS" },
        };
      }
      if (reqTime !== clock) {
        return {
          status: "rejected",
          unitId,
          reason: {
            code: "REQUEST_TIME_MISMATCH",
            message: `requestTimeMs ${reqTime} must equal the kernel clock ${clock} (no past/future requests)`,
          },
        };
      }
      const u = units.get(unitId);
      if (!u) {
        return {
          status: "rejected",
          unitId,
          reason: { code: "UNKNOWN_UNIT", message: `unknown mobile unit: ${unitId}` },
        };
      }
      if (u.plan) {
        // Replacement while moving: validate nothing, preserve the valid
        // old plan atomically (replan-while-moving rejected in M3a).
        return {
          status: "rejected",
          unitId,
          reason: {
            code: "ALREADY_MOVING",
            message: `unit ${unitId} has an active plan v${u.planVersion} to (${u.plan.destination.x},${u.plan.destination.z}); replan-while-moving is rejected and the old plan is preserved`,
          },
        };
      }
      const hadWaiting = u.waiting !== null;
      const oldWaiting = u.waiting
        ? {
            destination: { ...u.waiting.destination },
            requestTimeMs: u.waiting.requestTimeMs,
            blocker: cloneWaitBlocker(u.waiting.blocker),
          }
        : null;
      // Validate the replacement BEFORE overwriting: attemptGrant is
      // side-effect-free (no pending/kernel mutation), so a rejection
      // preserves the old waiting request byte-for-byte.
      const attempt = attemptGrant(unitId, destination, clock, reqTime);
      if (attempt.status === "rejected") {
        // Preserve old waiting (if any) atomically.
        if (hadWaiting && oldWaiting && !u.waiting) {
          u.waiting = oldWaiting;
        }
        return attempt;
      }
      if (attempt.status === "granted") {
        commitGrant(unitId, attempt, trajectoryForGranted(unitId, attempt));
        // Detached and frozen: caller-owned result, never an owned alias.
        return {
          status: "granted",
          plan: freezeDeep(cloneGrantedPlan(attempt.plan)),
          waitMs: attempt.waitMs,
        };
      }
      enqueueWaiting(unitId, destination, reqTime, attempt.blocker);
      // Detached clone: mutating the returned blocker must not touch the
      // stored wait, the snapshot, or the diagnostic.
      return {
        status: "waiting",
        unitId,
        destination: { ...destination },
        requestTimeMs: reqTime,
        ageMs: clock - reqTime,
        blocker: cloneWaitBlocker(attempt.blocker),
      };
    },

    cancelPlan: (unitId) => {
      const u = units.get(unitId);
      if (!u) {
        return {
          status: "rejected",
          unitId,
          reason: { code: "UNKNOWN_UNIT", message: `unknown mobile unit: ${unitId}` },
        };
      }
      if (u.plan) {
        // Unsafe midroute cancellation: reject, keep committed motion to
        // its safe endpoint. Never false-'cancelled', never teleport,
        // never erased occupancy.
        return {
          status: "rejected",
          unitId,
          reason: {
            code: "UNSAFE_MIDROUTE",
            message: `unit ${unitId} is moving under plan v${u.planVersion}; cancellation rejected and motion continues to (${u.plan.destination.x},${u.plan.destination.z})`,
          },
        };
      }
      if (u.waiting) {
        u.waiting = null;
        pending = pending.filter((p) => p.unitId !== unitId);
        return { status: "cancelled", unitId };
      }
      return {
        status: "rejected",
        unitId,
        reason: { code: "NOTHING_TO_CANCEL", message: `unit ${unitId} has no active plan or waiting request` },
      };
    },

    poseAt: (unitId, timeMs) => {
      const t = timeMs ?? kernel.getClockMs();
      if (!Number.isSafeInteger(t) || t < 0 || t > MAX_TIME_MS) {
        throw new Error("poseAt timeMs must be a safe integer in 0..MAX_TIME_MS");
      }
      return poseAtInternal(unitId, t);
    },

    snapshot: () => {
      const clock = kernel.getClockMs();
      const list: UnitSnapshot[] = [...units.values()]
        .sort((a, b) => (a.unitId < b.unitId ? -1 : 1))
        .map((u) => {
          const pose = poseAtInternal(u.unitId, clock);
          const state = u.plan ? "moving" : u.waiting ? "waiting" : "idle";
          return {
            unitId: u.unitId,
            pose,
            state,
            planVersion: u.planVersion,
            plan: u.plan
              ? {
                  ...u.plan,
                  destination: { ...u.plan.destination },
                  points: u.plan.points.map((p) => ({ ...p })),
                  distancesMm: [...u.plan.distancesMm],
                  requiredZones: [...u.plan.requiredZones],
                }
              : null,
            waiting: u.waiting
              ? {
                  destination: { ...u.waiting.destination },
                  requestTimeMs: u.waiting.requestTimeMs,
                  ageMs: clock - u.waiting.requestTimeMs,
                  blocker: cloneWaitBlocker(u.waiting.blocker),
                }
              : null,
          };
        });
      return freezeDeep({
        engineVersion: OPERATIONS_ENGINE_VERSION,
        clockMs: clock,
        units: list,
        pendingCount: pending.length,
        activeCount: [...units.values()].filter((u) => u.plan).length,
      });
    },

    dispatch: () => {
      if (kernel.getStatus() === "invalid") {
        throw new Error("cannot dispatch: kernel is invalid");
      }
      const order = [...pending];
      const results: MoveResult[] = [];
      for (const entry of order) {
        const u = units.get(entry.unitId);
        if (!u || u.plan) continue;
        const attempt = attemptGrant(
          entry.unitId,
          entry.destination,
          kernel.getClockMs(),
          entry.requestTimeMs,
        );
        if (attempt.status === "granted") {
          commitGrant(entry.unitId, attempt, trajectoryForGranted(entry.unitId, attempt));
          results.push({
            status: "granted",
            plan: freezeDeep(cloneGrantedPlan(attempt.plan)),
            waitMs: attempt.waitMs,
          });
        } else if (attempt.status === "waiting") {
          enqueueWaiting(entry.unitId, entry.destination, entry.requestTimeMs, attempt.blocker);
          results.push({
            status: "waiting",
            unitId: entry.unitId,
            destination: { ...entry.destination },
            requestTimeMs: entry.requestTimeMs,
            ageMs: kernel.getClockMs() - entry.requestTimeMs,
            blocker: cloneWaitBlocker(attempt.blocker),
          });
        } else {
          enqueueWaiting(entry.unitId, entry.destination, entry.requestTimeMs, {
            kind: "unit",
            blockerUnitId: entry.unitId,
            reason: attempt.reason.code,
          });
          results.push({
            status: "waiting",
            unitId: entry.unitId,
            destination: { ...entry.destination },
            requestTimeMs: entry.requestTimeMs,
            ageMs: kernel.getClockMs() - entry.requestTimeMs,
            blocker: { kind: "unit", blockerUnitId: entry.unitId, reason: attempt.reason.code },
          });
        }
      }
      return results;
    },

    getDiagnostic: () => {
      const snap = kernel.snapshot();
      if (snap.status === "invalid") {
        return { status: "kernel-invalid", detail: snap.diagnostic ?? "kernel invalid" };
      }
      if (pending.length === 0) return null;
      const moving = [...units.values()].filter((u) => u.plan).length;
      if (moving > 0) return null;
      // Nothing moves and something waits: dry-run grantability now (no
      // commit). If anything would grant, progress is possible via dispatch.
      for (const entry of pending) {
        const attempt = attemptGrant(
          entry.unitId,
          entry.destination,
          kernel.getClockMs(),
          entry.requestTimeMs,
        );
        if (attempt.status === "granted") return null;
      }
      // Stuck: no moving releases scheduled, nothing grantable now. Retain
      // all waits; report cycle vs impossible. Wait entries are detached
      // clones, never owned aliases.
      const waits = pending.map((entry) => {
        const u = units.get(entry.unitId) as InternalUnit;
        const blocker: WaitBlocker = u.waiting?.blocker ?? {
          kind: "unknown",
          reason: "UNKNOWN",
          candidates: [],
        };
        return {
          unitId: entry.unitId,
          blocker: cloneWaitBlocker(blocker),
          ageMs: kernel.getClockMs() - entry.requestTimeMs,
        };
      });
      // Wait-for edges unit->unit (zone waits point at the holder unit).
      // Unknown/multiple causes contribute NO edge: inventing one could
      // fabricate a DEADLOCK_CYCLE from ambiguous evidence.
      const edges = new Map<string, string>();
      for (const w of waits) {
        if (w.blocker.kind === "unknown") continue;
        const target =
          w.blocker.kind === "unit" ? w.blocker.blockerUnitId : w.blocker.holderUnitId;
        edges.set(w.unitId, target);
      }
      // Cycle search over waiting units only (bounded: <=64 nodes).
      for (const start of waits.map((w) => w.unitId)) {
        const seen: string[] = [start];
        let cur = edges.get(start);
        while (cur !== undefined && edges.has(cur)) {
          if (cur === start) {
            return {
              status: "stuck",
              kind: "DEADLOCK_CYCLE",
              detail: `deadlock cycle among waiting units: ${[...seen, start].join(" -> ")}; retained, no teleport or task deletion`,
              cycle: [...seen, start],
              waits,
            };
          }
          if (seen.includes(cur)) break;
          seen.push(cur);
          cur = edges.get(cur);
        }
      }
      const unknownCount = waits.filter(
        (w) => w.blocker.kind === "unknown",
      ).length;
      const unknownNote =
        unknownCount > 0
          ? `; ${unknownCount} wait(s) have unknown/multiple causes (no invented edges)`
          : "";
      return {
        status: "stuck",
        kind: "IMPOSSIBLE_WAIT",
        detail: `${pending.length} waiting, 0 moving, 0 grantable now and no future release scheduled; retained for operator dispatch (no teleport/task deletion)${unknownNote}`,
        waits,
      };
    },
  };

  return controller;
}
