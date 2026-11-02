// v3-M3b connected picking/packing slice (headless). One bounded vertical
// slice ending honestly at READY_FOR_DISPATCH: scheduled order arrivals ->
// atomic full-order reservations -> picker assignment -> reserved-rack
// approaches with handling-committed picks -> carried loads -> packing queue
// slots and service positions -> finite staffed packing -> READY_FOR_DISPATCH.
//
// ONE clock: arrivals, handling, packing service, and M3a movement events all
// run on ONE accepted M2a kernel owned here; the M3a admission core is bound
// via createTransportDomain (no second clock, no manual time copy). Ordering
// is 0 completion / 10 arrival / 20 dispatch; movement/handling starts commit
// synchronously inside dispatch/completion handlers and are recorded on the
// timeline (no separate START events needed). Internal trusted callbacks
// only; kernel event data is plain JSON, never deserialized code.
//
// Physical-commit rule: inventory moves ONLY at handling/service completion
// events after actual arrival. Requesting a move, a future reached time, a
// renderer pose query, or an animation never changes balances. Rejected,
// blocked, or stale events never mutate stock or order state: every commit
// site re-verifies phase, pose, reservation, capacity, and staging first.
//
// First-slice single-trip policy (disclosed): each order travels picker ->
// packing in ONE trip. An order no eligible picker can carry is rejected
// upfront with UNSUPPORTED_SINGLE_TRIP_REQUIRED and retained in the backlog;
// split-trip pickup stays an explicit v3-backlog item, never a partial drop.
// No dispatch/inbound/putaway completion is claimed: packed goods are finite
// per-resource output staging, never SHIPPED. Full output holds the resource
// with stock safe (M2b output-held), it never spills into an unbounded bucket.
import { z } from "zod";
import { EVENT_PRIORITY } from "./priorities.js";
import {
  createInventoryStore,
  type InventorySnapshot,
  type InventoryStore,
} from "./inventory.js";
import {
  createKernel,
  type Kernel,
  type KernelApi,
  type KernelEventView,
  type StepResult,
} from "./kernel.js";
import { footprintRadiusMm } from "./navigation.js";
import { createServiceStation, type ServiceStation } from "./resources.js";
import {
  MAX_SERVICE_DURATION_MS,
  MAX_TIME_MS,
  parseOperationsScenario,
  type OperationsScenario,
} from "./schema.js";
import {
  stationaryVsStationaryConflict,
  trajectoriesConflict,
  type Trajectory,
} from "./traffic.js";
import {
  createTransportDomain,
  type GrantedPlan,
  type MoveDestination,
  type TransportDomain,
  type TransportGrantNotice,
  type TransportSnapshot,
} from "./transport.js";
import {
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  SIMULATION_VERSION,
} from "./version.js";

// All M3b timing knobs live in this runtime-validated execution config; the
// proof saves the exact config used. Packing service time is NOT overridden
// here: staffed packing always uses the scenario resource's configured
// serviceDurationMs. Strict object: unknown keys are rejected, never ignored.
export const operationsExecutionConfigSchema = z.strictObject({
  pickDurationMsPerItem: z.number().int().min(1).max(MAX_SERVICE_DURATION_MS),
  unloadDurationMsPerItem: z.number().int().min(1).max(MAX_SERVICE_DURATION_MS),
});

export type OperationsExecutionConfig = z.infer<
  typeof operationsExecutionConfigSchema
>;

export function parseOperationsExecutionConfig(
  value: unknown,
): OperationsExecutionConfig {
  return operationsExecutionConfigSchema.parse(value);
}

export type OrderLifecycleState =
  | "CREATED"
  | "WAITING_FOR_STOCK"
  | "READY_FOR_PICKING"
  | "PICKING"
  | "WAITING_FOR_PACKING"
  | "PACKING"
  | "READY_FOR_DISPATCH";

export type OperationsOrderDiagnostic = {
  code: string;
  message: string;
  terminal: boolean;
};

export type OperationsOrderView = {
  orderId: string;
  arrivalTimeMs: number;
  state: OrderLifecycleState | "NOT_ARRIVED";
  timestamps: Partial<Record<OrderLifecycleState, number>>;
  lines: { productId: string; quantity: number }[];
  reservation: { productId: string; locationId: string; quantity: number }[];
  unitId: string | null;
  packingResourceId: string | null;
  queueSlotId: string | null;
  waitReason: string | null;
  diagnostic: OperationsOrderDiagnostic | null;
};

export type OperationsUnitTaskView =
  | { kind: "idle" }
  | { kind: "to-pick"; orderId: string; legIndex: number }
  | { kind: "picking"; orderId: string; legIndex: number }
  | { kind: "awaiting-queue-slot"; orderId: string; resourceId: string }
  | { kind: "awaiting-head"; orderId: string; resourceId: string }
  | { kind: "to-queue"; orderId: string; resourceId: string; slotId: string }
  | { kind: "in-queue"; orderId: string; resourceId: string; slotId: string }
  | { kind: "to-service"; orderId: string; resourceId: string }
  | {
      kind: "unloading";
      orderId: string;
      resourceId: string;
    }
  | { kind: "awaiting-staging"; orderId: string; resourceId: string }
  | { kind: "awaiting-service-start"; orderId: string; resourceId: string }
  | { kind: "to-vacate"; resourceId: string; slotId: string }
  | { kind: "to-parking" };

export type OperationsUnitView = {
  unitId: string;
  role: "picker" | "putaway";
  pose: MoveDestination;
  transportState: "moving" | "waiting" | "idle";
  task: OperationsUnitTaskView;
  waitReason: string | null;
  carried: { productId: string; quantity: number }[];
  carriedCostUnits: number;
  loadCapacityUnits: number;
  authorizedRoute: GrantedPlan | null;
};

export type OperationsPackingView = {
  resourceId: string;
  serviceCapacity: number;
  serviceDurationMs: number;
  inputStagingCapacity: number;
  outputStagingCapacity: number;
  approachingJobId: string | null;
  jobs: {
    jobId: string;
    state: string;
    enqueueTimeMs: number;
    queueSlotId: string | null;
    positionId: string | null;
    startTimeMs: number | null;
    finishTimeMs: number | null;
    waitMs: number | null;
  }[];
  packedOutput: { orderId: string; costUnits: number }[];
  outputUsedUnits: number;
};

export type OperationsTimelineEntry = {
  seq: number;
  timeMs: number;
  kind: string;
  orderId: string | null;
  unitId: string | null;
  detail: string;
};

export type OperationsWaitRecord = {
  unitId: string | null;
  orderId: string | null;
  reason: string;
  detail: string;
  startMs: number;
  endMs: number | null;
};

export type OperationsCounts = {
  selected: number;
  excluded: number;
  arrived: number;
  packed: number;
  readyForDispatch: number;
  shipped: number;
  // Unshipped orders (arrived - shipped). M3b never ships, so a finished
  // burst reports backlog 6: stage-complete is NOT all-shipped.
  backlog: number;
  // Picking/packing stage backlog (arrived - readyForDispatch).
  stageBacklog: number;
};

export type OperationsChecks = {
  conservation: string[];
  capacity: string[];
  safety: string[];
};

export type OperationsSnapshot = {
  scenarioId: string;
  seed: string;
  versions: {
    simulation: string;
    operationsSchema: string;
    operationsEngine: string;
  };
  executionConfig: OperationsExecutionConfig;
  clockMs: number;
  runMode: "fixed-window" | "finite-cohort";
  orders: OperationsOrderView[];
  excludedOrderIds: string[];
  units: OperationsUnitView[];
  inventory: InventorySnapshot;
  packing: OperationsPackingView[];
  timeline: OperationsTimelineEntry[];
  waits: OperationsWaitRecord[];
  // Every transport grant exactly once (explicit, dispatch, and automatic
  // movement-completion retries), with the authorized envelope actually
  // retained for the between-timestamps safety check.
  motionHistory: {
    unitId: string;
    planVersion: number;
    orderId: string | null;
    purpose: string;
    startMs: number;
    endMs: number;
    segmentCount: number;
  }[];
  maxConcurrentMoving: { count: number; atMs: number | null };
  counts: OperationsCounts;
  checks: OperationsChecks;
};

export type OperationsCompletion =
  | {
      stage: "SUPPORTED_STAGE_COMPLETE";
      ready: number;
      selected: number;
      shipped: number;
      backlog: number;
      stageBacklog: number;
      note: string;
    }
  | {
      stage: "IN_PROGRESS" | "BLOCKED" | "WINDOW_ENDED";
      ready: number;
      selected: number;
      created: number;
      backlog: number;
      stageBacklog: number;
      shipped: number;
      detail: string;
      reasons: { orderId: string; code: string; message: string }[];
    };

export type OperationsDiagnostic =
  | {
      status: "stuck";
      detail: string;
      transportWaits: {
        unitId: string;
        blocker: unknown;
        ageMs: number;
      }[];
      operationsWaits: { orderId: string; reason: string }[];
    }
  | { status: "kernel-invalid"; detail: string };

export type OperationsController = {
  getClockMs(): number;
  stepEvent(): StepResult;
  advanceTo(targetMs: number): StepResult;
  reset(): void;
  snapshot(): OperationsSnapshot;
  getCompletionStatus(): OperationsCompletion;
  getDiagnostic(): OperationsDiagnostic | null;
};

type PickLeg = {
  locationId: string;
  productId: string;
  quantity: number;
  approach: MoveDestination;
  committed: boolean;
};

type OrderRuntime = {
  idx: number;
  orderId: string;
  arrivalTimeMs: number;
  lines: { productId: string; quantity: number }[];
  created: boolean;
  state: OrderLifecycleState;
  timestamps: Partial<Record<OrderLifecycleState, number>>;
  diagnostic: OperationsOrderDiagnostic | null;
  reserveAttempt: number;
  shortages: { productId: string; requested: number; available: number }[];
  legs: PickLeg[];
  legsDone: number;
  unitId: string | null;
  packingResourceId: string | null;
  jobId: string | null;
  queueSlotId: string | null;
  queueRequestMs: number | null;
  jobEnqueued: boolean;
  unloadCommitted: boolean;
  packed: boolean;
  totalCostUnits: number;
  totalItems: number;
  eligibleChecked: boolean;
  waitReason: string | null;
};

type UnitTask =
  | { kind: "idle" }
  | { kind: "to-pick"; orderId: string; legIndex: number }
  | { kind: "picking"; orderId: string; legIndex: number }
  | { kind: "awaiting-queue-slot"; orderId: string; resourceId: string }
  | { kind: "awaiting-head"; orderId: string; resourceId: string }
  | { kind: "to-queue"; orderId: string; resourceId: string; slotId: string }
  | { kind: "in-queue"; orderId: string; resourceId: string; slotId: string }
  | { kind: "to-service"; orderId: string; resourceId: string }
  | { kind: "unloading"; orderId: string; resourceId: string }
  | { kind: "awaiting-staging"; orderId: string; resourceId: string }
  | { kind: "awaiting-service-start"; orderId: string; resourceId: string }
  | { kind: "to-vacate"; resourceId: string; slotId: string }
  | { kind: "to-parking" };

type UnitRuntime = {
  unitId: string;
  role: "picker" | "putaway";
  task: UnitTask;
};

type ResourceRuntime = {
  resourceId: string;
  station: ServiceStation;
  approachingJobId: string | null;
  packedOutput: Map<string, number>;
  outputUsed: number;
  queueCoords: Map<string, MoveDestination>;
  serviceCoords: Map<string, MoveDestination>;
};

type RetainedTrajectory = {
  unitId: string;
  planVersion: number;
  orderId: string | null;
  purpose: string;
  trajectory: Trajectory;
};

function posesEqual(a: MoveDestination, b: MoveDestination): boolean {
  return a.x === b.x && a.z === b.z;
}

// Deep-freeze accepted run inputs at construction. Caller-held objects were
// already detached via structuredClone + strict re-parse; freezing makes the
// accepted run (and reset's reuse of it) immune to later caller mutation.
function deepFreezeAccepted<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeAccepted(item);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreezeAccepted((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

export function createOperationsController(opts: {
  scenario: OperationsScenario;
  executionConfig: unknown;
}): OperationsController {
  // Validate + deep-detach exact run inputs at construction (strict parsers
  // return fresh graphs; the clone first guarantees no caller alias
  // survives). Neither caller-held objects nor returned snapshots can alter
  // the accepted run; reset repeats these frozen inputs.
  const executionConfig = deepFreezeAccepted(
    parseOperationsExecutionConfig(structuredClone(opts.executionConfig)),
  );
  const scenario = deepFreezeAccepted(
    parseOperationsScenario(structuredClone(opts.scenario)),
  );
  // The full main 28-order + 12-delivery fixture is NOT executable as this
  // slice: inbound has no support yet, so nonempty deliveries are an
  // explicit unsupported capability, never silently ignored.
  if (scenario.deliverySchedule.length > 0) {
    throw new Error(
      `unsupported capability [UNSUPPORTED_DELIVERIES]: M3b covers picking/packing only; ` +
        `scenario carries ${scenario.deliverySchedule.length} inbound deliverie(s), ` +
        `which need a future receiving/put-away slice`,
    );
  }
  const packingConfigs = scenario.resources.filter((r) => r.kind === "packing");
  if (packingConfigs.length === 0) {
    throw new Error("M3b slice requires at least one packing resource");
  }
  // First-slice capability truth: single lane per station. The controller
  // drives one service position per resource; a multilane configuration
  // would silently serialize, so it is rejected before any stock/run
  // mutation with a specific code (main uses 2 separate stations).
  for (const cfg of packingConfigs) {
    if (cfg.servicePositions.length > 1 || cfg.serviceCapacity > 1) {
      throw new Error(
        `unsupported capability [UNSUPPORTED_MULTILANE]: M3b is single-lane-per-packing-station; ` +
          `resource ${cfg.id} advertises ${cfg.servicePositions.length} service position(s) / capacity ${cfg.serviceCapacity}; ` +
          `split lanes into separate single-lane stations or await per-position admission`,
      );
    }
  }

  const productCost = new Map<string, number>();
  const productClass = new Map<string, string>();
  for (const p of scenario.products) {
    productCost.set(p.id, p.capacityCostUnits);
    productClass.set(p.id, p.handlingClass);
  }
  const locationApproach = new Map<string, MoveDestination>();
  for (const l of scenario.locations) {
    locationApproach.set(l.id, {
      x: l.approachPointMm.x,
      z: l.approachPointMm.z,
    });
  }
  const unitCapacity = new Map<string, number>();
  const unitParking = new Map<string, MoveDestination>();
  const unitRadius = new Map<string, number>();
  for (const u of scenario.mobileUnits) {
    unitCapacity.set(u.id, u.loadCapacityUnits);
    unitParking.set(u.id, { x: u.parkingSlotMm.x, z: u.parkingSlotMm.z });
    unitRadius.set(u.id, footprintRadiusMm(u.footprintMm));
  }
  const packingConfigById = new Map(packingConfigs.map((r) => [r.id, r]));

  const runMode =
    scenario.policies.run.mode === "finite-cohort"
      ? "finite-cohort"
      : "fixed-window";
  const cutoffMs =
    scenario.policies.run.mode === "finite-cohort"
      ? scenario.policies.run.arrivalCutoffMs
      : null;
  const horizonMs =
    scenario.policies.run.mode === "fixed-window"
      ? scenario.policies.run.horizonMs
      : null;
  // Selected orders: every scheduled order within the finite-cohort cutoff
  // (or every order for fixed-window). Post-cutoff orders are recorded as
  // excluded and never receive arrival events.
  const selectedSpecs = scenario.orderSchedule
    .map((o, idx) => ({ spec: o, idx }))
    .filter(
      ({ spec }) => cutoffMs === null || spec.arrivalTimeMs <= cutoffMs,
    );
  const excludedOrderIds = scenario.orderSchedule
    .filter((o) => cutoffMs !== null && o.arrivalTimeMs > cutoffMs)
    .map((o) => o.id);
  const fifoSelected = [...selectedSpecs].sort(
    (a, b) =>
      a.spec.arrivalTimeMs - b.spec.arrivalTimeMs ||
      (a.spec.id < b.spec.id ? -1 : a.spec.id > b.spec.id ? 1 : 0),
  );

  type LiveState = {
    kernel: Kernel;
    domain: TransportDomain;
    store: InventoryStore;
    orders: Map<string, OrderRuntime>;
    units: Map<string, UnitRuntime>;
    resources: Map<string, ResourceRuntime>;
    timeline: OperationsTimelineEntry[];
    waits: OperationsWaitRecord[];
    trajectories: RetainedTrajectory[];
    maxConcurrentMoving: { count: number; atMs: number | null };
    dispatchSeq: number;
    dispatchPending: boolean;
    timelineSeq: number;
  };

  const orderCostOf = (lines: { productId: string; quantity: number }[]): number =>
    lines.reduce(
      (n, l) => n + (productCost.get(l.productId) ?? 0) * l.quantity,
      0,
    );

  const initState = (): LiveState => {
    // Every transport grant (explicit, dispatch, automatic movement-
    // completion retry) flows through one notification. The handler assigned
    // below retains the actual authorized trajectory once, closes the exact
    // TRAFFIC wait at grant time, and records an auditable timeline entry.
    // Explicit requestMove callers no longer retain/close directly, so no
    // duplicate history arises from explicit calls.
    const grantHandler: {
      current: ((grant: TransportGrantNotice) => void) | null;
    } = { current: null };
    const pendingPurpose = new Map<
      string,
      { orderId: string | null; purpose: string }
    >();
    const seenGrants = new Set<string>();
    const domain = createTransportDomain({
      scenario,
      onGrant: (grant) => grantHandler.current?.(grant),
    });
    const store = createInventoryStore(scenario);
    const orders = new Map<string, OrderRuntime>();
    for (const { spec, idx } of selectedSpecs) {
      const lines = spec.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
      }));
      orders.set(spec.id, {
        idx,
        orderId: spec.id,
        arrivalTimeMs: spec.arrivalTimeMs,
        lines,
        created: false,
        state: "CREATED",
        timestamps: {},
        diagnostic: null,
        reserveAttempt: 0,
        shortages: [],
        legs: [],
        legsDone: 0,
        unitId: null,
        packingResourceId: null,
        jobId: null,
        queueSlotId: null,
        queueRequestMs: null,
        jobEnqueued: false,
        unloadCommitted: false,
        packed: false,
        totalCostUnits: orderCostOf(lines),
        totalItems: lines.reduce((n, l) => n + l.quantity, 0),
        eligibleChecked: false,
        waitReason: null,
      });
    }
    const units = new Map<string, UnitRuntime>();
    for (const u of scenario.mobileUnits) {
      units.set(u.id, { unitId: u.id, role: u.role, task: { kind: "idle" } });
    }
    const resources = new Map<string, ResourceRuntime>();
    for (const cfg of packingConfigs) {
      const queueCoords = new Map<string, MoveDestination>();
      for (const q of cfg.queueSlots) {
        queueCoords.set(q.id, { x: q.x, z: q.z });
      }
      const serviceCoords = new Map<string, MoveDestination>();
      for (const s of cfg.servicePositions) {
        serviceCoords.set(s.id, { x: s.x, z: s.z });
      }
      resources.set(cfg.id, {
        resourceId: cfg.id,
        station: createServiceStation(cfg),
        approachingJobId: null,
        packedOutput: new Map(),
        outputUsed: 0,
        queueCoords,
        serviceCoords,
      });
    }
    const S: LiveState = {
      kernel: null as unknown as Kernel,
      domain,
      store,
      orders,
      units,
      resources,
      timeline: [],
      waits: [],
      trajectories: [],
      maxConcurrentMoving: { count: 0, atMs: null },
      dispatchSeq: 0,
      dispatchPending: false,
      timelineSeq: 0,
    };

    const record = (
      timeMs: number,
      kind: string,
      orderId: string | null,
      unitId: string | null,
      detail: string,
    ): void => {
      S.timelineSeq += 1;
      S.timeline.push({
        seq: S.timelineSeq,
        timeMs,
        kind,
        orderId,
        unitId,
        detail,
      });
    };

    const openWait = (
      unitId: string | null,
      orderId: string | null,
      reason: string,
      detail: string,
      startMs: number,
    ): void => {
      const open = S.waits.find(
        (w) => w.endMs === null && w.reason === reason &&
          w.unitId === unitId && w.orderId === orderId,
      );
      if (open) {
        open.detail = detail;
        return;
      }
      closeWaitsFor(unitId, orderId, startMs);
      S.waits.push({ unitId, orderId, reason, detail, startMs, endMs: null });
    };

    const closeWaitsFor = (
      unitId: string | null,
      orderId: string | null,
      endMs: number,
    ): void => {
      for (const w of S.waits) {
        if (w.endMs !== null) continue;
        if (unitId !== null && w.unitId === unitId) w.endMs = endMs;
        else if (orderId !== null && w.orderId === orderId && w.unitId === null) {
          w.endMs = endMs;
        }
      }
    };

    // Close ONLY the open TRAFFIC wait for one unit at its grant time.
    // Genuinely ongoing resource waits (QUEUE_FULL, BUSY_STATION, staging)
    // stay open and visible separately; they are never hidden as traffic.
    const closeTrafficWaitsFor = (unitId: string, endMs: number): void => {
      for (const w of S.waits) {
        if (w.endMs !== null) continue;
        if (w.unitId === unitId && w.reason === "TRAFFIC") w.endMs = endMs;
      }
    };

    const noteConcurrency = (now: number): void => {
      const active = S.domain.snapshot().activeCount;
      if (active > S.maxConcurrentMoving.count) {
        S.maxConcurrentMoving = { count: active, atMs: now };
      }
    };

    // Retain the ACTUAL authorized trajectory the transport core committed
    // (no rebuild, no mutable-input reread), so the BETWEEN-timestamps safety
    // check runs over the executed envelope for every grant path.
    const retainGrantedTrajectory = (
      unitId: string,
      planVersion: number,
      orderId: string | null,
      purpose: string,
      trajectory: Trajectory,
    ): void => {
      S.trajectories.push({
        unitId,
        planVersion,
        orderId,
        purpose,
        trajectory: {
          unitId: trajectory.unitId,
          radiusMm: trajectory.radiusMm,
          segments: trajectory.segments.map((s) => ({ ...s })),
          startMs: trajectory.startMs,
          endMs: trajectory.endMs,
          destination: { ...trajectory.destination },
        },
      });
    };

    // The one grant observer: every successful transport grant lands here
    // exactly once (explicit, dispatch, automatic retry). It closes the exact
    // TRAFFIC wait at grant time and records an auditable timeline entry, so
    // between-timestamp coverage is checkable and no wait silently overlaps
    // admitted motion. M3a admission authority is unchanged: this observes.
    grantHandler.current = (grant: TransportGrantNotice): void => {
      const key = `${grant.plan.unitId}:v${grant.plan.planVersion}`;
      if (seenGrants.has(key)) return;
      seenGrants.add(key);
      const pending = pendingPurpose.get(grant.plan.unitId);
      pendingPurpose.delete(grant.plan.unitId);
      const orderId = pending?.orderId ?? null;
      const purpose = pending?.purpose ?? "transport-grant";
      retainGrantedTrajectory(
        grant.plan.unitId,
        grant.plan.planVersion,
        orderId,
        purpose,
        grant.trajectory,
      );
      noteConcurrency(grant.plan.startMs);
      closeTrafficWaitsFor(grant.plan.unitId, grant.plan.startMs);
      record(
        grant.plan.startMs,
        "MOTION_GRANTED",
        orderId,
        grant.plan.unitId,
        `v${grant.plan.planVersion} ${purpose} ${grant.plan.startMs}..${grant.plan.endMs} -> (${grant.plan.destination.x},${grant.plan.destination.z})`,
      );
    };

    const requestDispatch = (now: number): void => {
      if (S.dispatchPending) return;
      S.dispatchPending = true;
      S.dispatchSeq += 1;
      S.kernel.schedule({
        id: `ops-dispatch-${S.dispatchSeq}`,
        timeMs: now,
        priority: EVENT_PRIORITY.DISPATCH,
        kind: "OPERATIONS_DISPATCH",
        data: { seq: S.dispatchSeq },
      });
    };

    const transition = (
      rt: OrderRuntime,
      next: OrderLifecycleState,
      now: number,
      unitId: string | null,
      detail: string,
    ): void => {
      rt.state = next;
      rt.timestamps[next] = now;
      record(now, next, rt.orderId, unitId, detail);
    };

    const diagnose = (
      rt: OrderRuntime,
      code: string,
      message: string,
      terminal: boolean,
      now: number,
    ): void => {
      rt.diagnostic = { code, message, terminal };
      record(now, "DIAGNOSTIC", rt.orderId, rt.unitId, `${code}: ${message}`);
    };

    const eligiblePickersFor = (rt: OrderRuntime): string[] => {
      const out: string[] = [];
      for (const u of scenario.mobileUnits) {
        if (u.role !== "picker") continue;
        let ok = true;
        for (const line of rt.lines) {
          const cls = productClass.get(line.productId);
          if (!cls || !u.eligibleHandlingClasses.includes(cls)) {
            ok = false;
            break;
          }
        }
        if (ok) out.push(u.id);
      }
      out.sort();
      return out;
    };

    const transportUnitById = (unitId: string) => {
      const found = S.domain
        .snapshot()
        .units.find((u) => u.unitId === unitId);
      if (!found) throw new Error(`unknown mobile unit: ${unitId}`);
      return found;
    };

    const isUnitFree = (unitId: string): boolean => {
      const t = S.units.get(unitId);
      if (!t || t.task.kind !== "idle") return false;
      return transportUnitById(unitId).state === "idle";
    };

    // An order-free unit heading to parking (or to a vacate slot) whose
    // movement still waits can be safely re-tasked: cancelling a WAITING
    // request releases only the pending request, preserving pose and (empty)
    // load. A unit already moving under a grant is left alone; it becomes
    // assignable on arrival.
    const tryStealForAssignment = (unitId: string): boolean => {
      const t = S.units.get(unitId);
      if (!t) return false;
      if (t.task.kind === "idle") {
        return transportUnitById(unitId).state === "idle";
      }
      if (t.task.kind !== "to-parking" && t.task.kind !== "to-vacate") {
        return false;
      }
      if (transportUnitById(unitId).state !== "waiting") return false;
      const cancelled = S.domain.cancelPlan(unitId);
      if (cancelled.status !== "cancelled") return false;
      pendingPurpose.delete(unitId);
      t.task = { kind: "idle" };
      closeWaitsFor(unitId, null, S.kernel.getClockMs());
      return true;
    };

    const requestUnitMove = (
      unitId: string,
      dest: MoveDestination,
      now: number,
      orderId: string | null,
      purpose: string,
    ): { status: "granted" | "waiting" | "rejected"; reason?: string } => {
      // Registered before the call so the one grant observer attributes
      // both immediate grants (synchronous, inside requestMove) and later
      // automatic retries of this same waiting request.
      pendingPurpose.set(unitId, { orderId, purpose });
      const res = S.domain.requestMove(unitId, { x: dest.x, z: dest.z });
      if (res.status === "granted") {
        // The grant observer already retained the actual trajectory,
        // closed the exact TRAFFIC wait at grant time, and recorded the
        // timeline entry. Nothing further here (no duplicate history).
        return { status: "granted" };
      }
      if (res.status === "waiting") {
        const b = res.blocker;
        const detail =
          b.kind === "unit"
            ? `traffic wait on unit ${b.blockerUnitId} (${b.reason})`
            : b.kind === "zone"
              ? `traffic wait on zone ${b.zoneId} held by ${b.holderUnitId} (${b.reason})`
              : `traffic wait (${b.reason}; candidates ${b.candidates.join(",") || "none"})`;
        openWait(unitId, orderId, "TRAFFIC", detail, now);
        return { status: "waiting" };
      }
      pendingPurpose.delete(unitId);
      return { status: "rejected", reason: `${res.reason.code}: ${res.reason.message}` };
    };

    const packingLoadOf = (resourceId: string): { active: number } => {
      let active = 0;
      for (const rt of S.orders.values()) {
        if (
          rt.packingResourceId === resourceId &&
          rt.state !== "READY_FOR_DISPATCH"
        ) {
          active += 1;
        }
      }
      return { active };
    };

    const choosePackingResource = (): string => {
      const ranked = [...S.resources.keys()]
        .map((id) => ({ id, active: packingLoadOf(id).active }))
        .sort((a, b) => a.active - b.active || (a.id < b.id ? -1 : 1));
      return (ranked[0] as { id: string }).id;
    };

    const laneBusy = (res: ResourceRuntime): boolean =>
      res.station
        .snapshot()
        .jobs.some(
          (j) => j.state === "in-service" || j.state === "output-held",
        );

    const queuedHeadJobId = (res: ResourceRuntime): string | null => {
      const queued = res.station
        .snapshot()
        .jobs.filter((j) => j.state === "queued")
        .sort(
          (a, b) =>
            a.enqueueTimeMs - b.enqueueTimeMs ||
            (a.jobId < b.jobId ? -1 : 1),
        );
      return queued[0]?.jobId ?? null;
    };

    // Attempt reservation + assignment + progress for all created orders.
    // Runs only on productive triggers (arrival, movement/handling/pack
    // completion); it never reschedules itself, so no zero-time loop exists.
    const runDispatch = (now: number): void => {
      // Pass 1: reserve FIFO orders that hold nothing yet.
      for (const { spec } of fifoSelected) {
        const rt = S.orders.get(spec.id) as OrderRuntime;
        if (!rt.created || rt.legs.length > 0 || rt.diagnostic?.terminal) {
          continue;
        }
        if (!rt.eligibleChecked) {
          rt.eligibleChecked = true;
          const eligible = eligiblePickersFor(rt);
          if (eligible.length === 0) {
            diagnose(
              rt,
              "NO_ELIGIBLE_PICKER",
              `no picker role covers all handling classes of order ${rt.orderId}; held, no stock touched`,
              true,
              now,
            );
            continue;
          }
          const fits = eligible.some(
            (id) => (unitCapacity.get(id) ?? 0) >= rt.totalCostUnits,
          );
          if (!fits) {
            diagnose(
              rt,
              "UNSUPPORTED_SINGLE_TRIP_REQUIRED",
              `order ${rt.orderId} needs ${rt.totalCostUnits} handling-cost units; ` +
                `no eligible picker carries it in one trip; split-trip pickup stays v3 backlog; ` +
                `held with zero reservation`,
              true,
              now,
            );
            continue;
          }
        }
        rt.reserveAttempt += 1;
        const res = S.store.reserveOrder({
          eventId: `inv-reserve-${rt.idx}-${rt.reserveAttempt}`,
          timeMs: now,
          orderId: rt.orderId,
        });
        if (res.status === "waiting") {
          rt.shortages = res.shortages;
          if (rt.state !== "WAITING_FOR_STOCK") {
            transition(
              rt,
              "WAITING_FOR_STOCK",
              now,
              null,
              `short: ${res.shortages.map((s) => `${s.productId} need ${s.requested} have ${s.available}`).join("; ")}`,
            );
          }
          rt.waitReason = "WAITING_FOR_STOCK";
          openWait(
            null,
            rt.orderId,
            "WAITING_FOR_STOCK",
            `short: ${res.shortages.map((s) => `${s.productId} ${s.available}/${s.requested}`).join("; ")}`,
            now,
          );
          continue;
        }
        closeWaitsFor(null, rt.orderId, now);
        rt.waitReason = null;
        rt.legs = res.sources.map((s) => {
          const approach = locationApproach.get(s.locationId);
          if (!approach) {
            throw new Error(`reservation references unknown location ${s.locationId}`);
          }
          return {
            locationId: s.locationId,
            productId: s.productId,
            quantity: s.quantity,
            approach: { ...approach },
            committed: false,
          };
        });
        transition(
          rt,
          "READY_FOR_PICKING",
          now,
          null,
          `reserved ${rt.legs.length} source leg(s)`,
        );
      }
      // Pass 2: bind idle eligible pickers to READY_FOR_PICKING orders, FIFO.
      for (const { spec } of fifoSelected) {
        const rt = S.orders.get(spec.id) as OrderRuntime;
        if (
          !rt.created ||
          rt.state !== "READY_FOR_PICKING" ||
          rt.unitId !== null ||
          rt.diagnostic?.terminal
        ) {
          continue;
        }
        const candidates = eligiblePickersFor(rt).filter(
          (id) =>
            (unitCapacity.get(id) ?? 0) >= rt.totalCostUnits &&
            (isUnitFree(id) || tryStealForAssignment(id)),
        );
        if (candidates.length === 0) {
          rt.waitReason = "NO_IDLE_PICKER";
          openWait(
            null,
            rt.orderId,
            "NO_IDLE_PICKER",
            "all eligible pickers are tasked; FIFO age retained",
            now,
          );
          continue;
        }
        const unitId = candidates[0] as string;
        rt.unitId = unitId;
        closeWaitsFor(null, rt.orderId, now);
        rt.waitReason = null;
        transition(rt, "PICKING", now, unitId, `assigned ${unitId}`);
        const first = rt.legs[0] as PickLeg;
        const unit = S.units.get(unitId) as UnitRuntime;
        unit.task = { kind: "to-pick", orderId: rt.orderId, legIndex: 0 };
        const pose = transportUnitById(unitId).pose;
        if (posesEqual(pose, first.approach)) {
          unit.task = { kind: "picking", orderId: rt.orderId, legIndex: 0 };
          schedulePickCompletion(unitId, rt, 0, now);
          continue;
        }
        const mv = requestUnitMove(
          unitId,
          first.approach,
          now,
          rt.orderId,
          `pick-leg-0:${first.locationId}`,
        );
        if (mv.status === "rejected") {
          unit.task = { kind: "idle" };
          rt.unitId = null;
          diagnose(
            rt,
            "UNREACHABLE_APPROACH",
            `static route to ${first.locationId} approach rejected (${mv.reason}); ` +
              `order held, no partial pick continues`,
            true,
            now,
          );
        }
      }
      // Pass 3: advance tasks that wait on domain state (queue slots,
      // service approach, staging space, parking returns).
      for (const unit of S.units.values()) {
        const t = unit.task;
        if (t.kind === "awaiting-queue-slot") {
          const rt = S.orders.get(t.orderId) as OrderRuntime;
          const res = S.resources.get(t.resourceId) as ResourceRuntime;
          tryEnqueue(rt, res, now);
        } else if (t.kind === "awaiting-head") {
          const rt = S.orders.get(t.orderId) as OrderRuntime;
          const res = S.resources.get(t.resourceId) as ResourceRuntime;
          releaseToQueue(rt, res, now);
        } else if (t.kind === "in-queue") {
          attemptServiceApproach(t.orderId, t.resourceId, now);
        } else if (t.kind === "awaiting-staging") {
          const rt = S.orders.get(t.orderId) as OrderRuntime;
          tryUnloadCommit(unit.unitId, rt, t.resourceId, now);
        } else if (t.kind === "awaiting-service-start") {
          const rt = S.orders.get(t.orderId) as OrderRuntime;
          tryServiceStart(unit.unitId, rt, t.resourceId, now);
        }
      }
      // Output-held retries (no dispatch drain exists in-slice, so a held
      // job normally stays held; the hook stays honest if space ever frees).
      // In-service jobs are left alone: their PACK_COMPLETED event fires at
      // the exact service end, and an early completeService would throw.
      for (const rt of S.orders.values()) {
        if (rt.state !== "PACKING" || rt.packed || !rt.packingResourceId) {
          continue;
        }
        const res = S.resources.get(rt.packingResourceId);
        const job = res?.station
          .snapshot()
          .jobs.find((j) => j.jobId === rt.jobId);
        if (job?.state === "output-held") {
          tryPackCommit(rt, now);
        }
      }
      // Idle units with no assignable work leave the service position
      // and return to parking; they never wander, and units already home
      // stay put. Departure is two-phase: a unit standing on a service
      // position first vacates to a logically free queue slot of the same
      // station (short hop that frees the lane for the next head under
      // transport, never a teleport), then attempts parking. If parking
      // waits, the unit holds its valid vacated position with its empty
      // load; it never erases itself to force progress.
      const pendingPickWork = [...S.orders.values()].some(
        (rt) =>
          rt.created &&
          rt.state === "READY_FOR_PICKING" &&
          rt.unitId === null &&
          !rt.diagnostic?.terminal,
      );
      if (!pendingPickWork) {
        for (const unit of S.units.values()) {
          if (unit.role !== "picker" || unit.task.kind !== "idle") continue;
          const home = unitParking.get(unit.unitId) as MoveDestination;
          const pose = transportUnitById(unit.unitId).pose;
          if (posesEqual(pose, home)) continue;
          const standingOn = [...S.resources.values()].find((res) =>
            [...res.serviceCoords.values()].some((p) => posesEqual(pose, p)),
          );
          if (standingOn) {
            const held = new Set(
              standingOn.station
                .snapshot()
                .jobs.filter((j) => j.state === "queued")
                .map((j) => j.queueSlotId)
                .filter((id): id is string => id !== null),
            );
            const freeSlot = [...standingOn.queueCoords.entries()]
              .filter(([id]) => !held.has(id))
              .sort(([a], [b]) => (a < b ? -1 : 1))[0];
            if (freeSlot) {
              const [slotId, dest] = freeSlot;
              unit.task = { kind: "to-vacate", resourceId: standingOn.resourceId, slotId };
              record(now, "VACATE_DEPART", null, unit.unitId, `leaving ${standingOn.resourceId} service for slot ${slotId}`);
              const mv = requestUnitMove(unit.unitId, dest, now, null, `vacate:${slotId}`);
              if (mv.status === "rejected") {
                unit.task = { kind: "idle" };
              }
              continue;
            }
          }
          unit.task = { kind: "to-parking" };
          const mv = requestUnitMove(unit.unitId, home, now, null, "parking-return");
          if (mv.status !== "granted" && mv.status !== "waiting") {
            unit.task = { kind: "idle" };
          }
        }
      }
    };

    const schedulePickCompletion = (
      unitId: string,
      rt: OrderRuntime,
      legIndex: number,
      now: number,
    ): void => {
      const leg = rt.legs[legIndex] as PickLeg;
      const at = now + leg.quantity * executionConfig.pickDurationMsPerItem;
      if (at > MAX_TIME_MS) {
        diagnose(
          rt,
          "TIME_BOUND_EXCEEDED",
          `pick handling for ${rt.orderId} leg ${legIndex} exceeds the ${MAX_TIME_MS}ms horizon bound; held with stock safe`,
          true,
          now,
        );
        return;
      }
      record(now, "PICK_STARTED", rt.orderId, unitId, `${leg.productId}x${leg.quantity} at ${leg.locationId}`);
      S.kernel.schedule({
        id: `ops-pick-${rt.idx}-${legIndex}`,
        timeMs: at,
        priority: EVENT_PRIORITY.COMPLETION,
        kind: "HANDLING_COMPLETED",
        data: {
          unitId,
          orderIdx: rt.idx,
          handling: "pick",
          legIndex,
        },
      });
    };

    const scheduleUnloadCompletion = (
      unitId: string,
      rt: OrderRuntime,
      resourceId: string,
      now: number,
    ): void => {
      const at = now + rt.totalItems * executionConfig.unloadDurationMsPerItem;
      if (at > MAX_TIME_MS) {
        diagnose(
          rt,
          "TIME_BOUND_EXCEEDED",
          `unload handling for ${rt.orderId} exceeds the ${MAX_TIME_MS}ms horizon bound; held with load safe`,
          true,
          now,
        );
        return;
      }
      record(now, "UNLOAD_STARTED", rt.orderId, unitId, `${rt.totalItems} item(s) at ${resourceId}`);
      S.kernel.schedule({
        id: `ops-unload-${rt.idx}`,
        timeMs: at,
        priority: EVENT_PRIORITY.COMPLETION,
        kind: "HANDLING_COMPLETED",
        data: { unitId, orderIdx: rt.idx, handling: "unload", resourceId },
      });
    };

    const firstServicePosition = (res: ResourceRuntime): MoveDestination => {
      const first = [...res.serviceCoords.values()][0] as MoveDestination;
      return { ...first };
    };

    // Logical queue slot first, then physical travel to its coordinates. A
    // full queue holds the agent at its current valid position with its
    // load; nothing is erased and no floor position is fabricated.
    const tryEnqueue = (
      rt: OrderRuntime,
      res: ResourceRuntime,
      now: number,
    ): void => {
      const unitId = rt.unitId as string;
      const unit = S.units.get(unitId) as UnitRuntime;
      if (!rt.jobId) {
        rt.jobId = `pack-${rt.idx}`;
        rt.queueRequestMs = now;
      }
      if (rt.jobEnqueued) return;
      const resEnqueue = res.station.enqueue({
        jobId: rt.jobId,
        // Original request time is retained across retries, so FIFO age is
        // never rewritten by a later successful attempt.
        enqueueTimeMs: rt.queueRequestMs as number,
      });
      if (resEnqueue.status === "waiting-outside") {
        unit.task = { kind: "awaiting-queue-slot", orderId: rt.orderId, resourceId: res.resourceId };
        rt.waitReason = "QUEUE_FULL";
        openWait(
          unitId,
          rt.orderId,
          "QUEUE_FULL",
          `${res.resourceId} queue holds ${resEnqueue.reason.queued}/${resEnqueue.reason.queueSlots}; ` +
            `holding position with ${rt.totalItems} carried item(s)`,
          now,
        );
        return;
      }
      if (resEnqueue.queueSlotId === null) {
        // Zero-queue direct service: the M2b primitive admits one job with
        // no queue slot. Route it physically to the actual service position
        // (no fictitious slot); a queue is not required to know the lane.
        rt.jobEnqueued = true;
        rt.queueSlotId = null;
        record(now, "DIRECT_ENQUEUED", rt.orderId, unitId, `${rt.jobId} -> ${res.resourceId} direct service (no queue slot)`);
        unit.task = { kind: "awaiting-head", orderId: rt.orderId, resourceId: res.resourceId };
        attemptDirectServiceApproach(rt, res, now);
        return;
      }
      rt.jobEnqueued = true;
      rt.queueSlotId = resEnqueue.queueSlotId;
      record(now, "QUEUE_ENQUEUED", rt.orderId, unitId, `${rt.jobId} -> ${res.resourceId} slot ${resEnqueue.queueSlotId}`);
      // Controlled release: only the queue head's agent enters the shared
      // queue zone. A non-head agent driving in early can park across the
      // head's corridor while domain-waiting on that same head: a traffic /
      // domain wait cycle with no release. Non-heads hold outside at their
      // pick approaches with FIFO age retained until they become head.
      unit.task = { kind: "awaiting-head", orderId: rt.orderId, resourceId: res.resourceId };
      releaseToQueue(rt, res, now);
    };

    const releaseToQueue = (
      rt: OrderRuntime,
      res: ResourceRuntime,
      now: number,
    ): void => {
      const unitId = rt.unitId as string;
      const unit = S.units.get(unitId) as UnitRuntime;
      if (unit.task.kind !== "awaiting-head") return;
      // Zero-queue direct handoff carries no slot: head straight for the
      // actual service position instead of travelling to a queue slot.
      if (rt.jobEnqueued && rt.queueSlotId === null) {
        attemptDirectServiceApproach(rt, res, now);
        return;
      }
      if (queuedHeadJobId(res) !== rt.jobId) {
        rt.waitReason = "AWAITING_HEAD";
        openWait(
          unitId,
          rt.orderId,
          "AWAITING_HEAD",
          `holding outside ${res.resourceId}; head job is ${queuedHeadJobId(res) ?? "none"}`,
          now,
        );
        return;
      }
      rt.waitReason = null;
      closeWaitsFor(unitId, rt.orderId, now);
      const slot = res.queueCoords.get(rt.queueSlotId as string) as MoveDestination;
      unit.task = {
        kind: "to-queue",
        orderId: rt.orderId,
        resourceId: res.resourceId,
        slotId: rt.queueSlotId as string,
      };
      const pose = transportUnitById(unitId).pose;
      if (posesEqual(pose, slot)) {
        unit.task = {
          kind: "in-queue",
          orderId: rt.orderId,
          resourceId: res.resourceId,
          slotId: rt.queueSlotId as string,
        };
        record(now, "QUEUE_ARRIVED", rt.orderId, unitId, `already at ${rt.queueSlotId}`);
        attemptServiceApproach(rt.orderId, res.resourceId, now);
        return;
      }
      const mv = requestUnitMove(unitId, slot, now, rt.orderId, `queue:${rt.jobId}`);
      if (mv.status === "rejected") {
        unit.task = { kind: "awaiting-head", orderId: rt.orderId, resourceId: res.resourceId };
        diagnose(
          rt,
          "UNREACHABLE_QUEUE",
          `static route to ${res.resourceId} slot ${rt.queueSlotId} rejected (${mv.reason}); held with load safe`,
          true,
          now,
        );
      }
    };

    // Zero-queue direct handoff: the FIFO head whose lane is free reserves
    // the service approach and drives straight from its valid upstream hold
    // (pick approach) to the actual service coordinates. No queue slot is
    // allocated or travelled to; a busy lane keeps the load at the upstream
    // spot with FIFO age retained. Service still starts only after actual
    // arrival plus full unload.
    const attemptDirectServiceApproach = (
      rt: OrderRuntime,
      res: ResourceRuntime,
      now: number,
    ): void => {
      const unitId = rt.unitId as string;
      const unit = S.units.get(unitId) as UnitRuntime;
      if (unit.task.kind !== "awaiting-head") return;
      if (queuedHeadJobId(res) !== rt.jobId) {
        rt.waitReason = "AWAITING_HEAD";
        openWait(
          unitId,
          rt.orderId,
          "AWAITING_HEAD",
          `holding upstream of ${res.resourceId}; head job is ${queuedHeadJobId(res) ?? "none"}`,
          now,
        );
        return;
      }
      if (laneBusy(res)) {
        const holder =
          res.station.snapshot().jobs.find(
            (j) => j.state === "in-service" || j.state === "output-held",
          )?.jobId ?? "unknown";
        rt.waitReason = "BUSY_STATION";
        openWait(
          unitId,
          rt.orderId,
          "BUSY_STATION",
          `${res.resourceId} lane held by ${holder}; holding upstream with ${rt.totalItems} carried item(s)`,
          now,
        );
        return;
      }
      if (res.approachingJobId !== null && res.approachingJobId !== rt.jobId) {
        rt.waitReason = "APPROACH_RESERVED";
        openWait(
          unitId,
          rt.orderId,
          "APPROACH_RESERVED",
          `${res.resourceId} approach reserved by ${res.approachingJobId}`,
          now,
        );
        return;
      }
      res.approachingJobId = rt.jobId;
      rt.waitReason = null;
      closeWaitsFor(unitId, rt.orderId, now);
      const dest = firstServicePosition(res);
      record(now, "SERVICE_APPROACH", rt.orderId, unitId, `${rt.jobId} -> ${res.resourceId} service position direct (no queue)`);
      unit.task = { kind: "to-service", orderId: rt.orderId, resourceId: res.resourceId };
      const pose = transportUnitById(unitId).pose;
      if (posesEqual(pose, dest)) {
        unit.task = { kind: "unloading", orderId: rt.orderId, resourceId: res.resourceId };
        scheduleUnloadCompletion(unitId, rt, res.resourceId, now);
        return;
      }
      const mv = requestUnitMove(unitId, dest, now, rt.orderId, `service-direct:${rt.jobId}`);
      if (mv.status === "rejected") {
        res.approachingJobId = null;
        unit.task = { kind: "awaiting-head", orderId: rt.orderId, resourceId: res.resourceId };
        diagnose(
          rt,
          "UNREACHABLE_SERVICE",
          `static route to ${res.resourceId} service position rejected (${mv.reason}); held upstream with load safe`,
          true,
          now,
        );
      }
    };

    // The FIFO head whose lane is free reserves the service approach
    // explicitly while transport acquires and travels; service itself starts
    // only after arrival plus full unload. A logical grant never teleports
    // the agent and never starts service early.
    const attemptServiceApproach = (
      orderId: string,
      resourceId: string,
      now: number,
    ): void => {
      const rt = S.orders.get(orderId) as OrderRuntime;
      const res = S.resources.get(resourceId) as ResourceRuntime;
      const unitId = rt.unitId as string;
      const unit = S.units.get(unitId) as UnitRuntime;
      if (unit.task.kind !== "in-queue") return;
      const head = queuedHeadJobId(res);
      if (head !== rt.jobId) {
        rt.waitReason = "QUEUED_BEHIND_HEAD";
        openWait(
          unitId,
          orderId,
          "QUEUED_BEHIND_HEAD",
          `head job is ${head ?? "none"}; FIFO age retained`,
          now,
        );
        return;
      }
      if (laneBusy(res)) {
        const holder =
          res.station.snapshot().jobs.find(
            (j) => j.state === "in-service" || j.state === "output-held",
          )?.jobId ?? "unknown";
        rt.waitReason = "BUSY_STATION";
        openWait(
          unitId,
          orderId,
          "BUSY_STATION",
          `${resourceId} lane held by ${holder}; holding queue slot ${rt.queueSlotId}`,
          now,
        );
        return;
      }
      if (res.approachingJobId !== null && res.approachingJobId !== rt.jobId) {
        rt.waitReason = "APPROACH_RESERVED";
        openWait(
          unitId,
          orderId,
          "APPROACH_RESERVED",
          `${resourceId} approach reserved by ${res.approachingJobId}`,
          now,
        );
        return;
      }
      res.approachingJobId = rt.jobId;
      rt.waitReason = null;
      closeWaitsFor(unitId, orderId, now);
      const dest = firstServicePosition(res);
      record(now, "SERVICE_APPROACH", orderId, unitId, `${rt.jobId} -> ${resourceId} service position`);
      unit.task = { kind: "to-service", orderId, resourceId };
      const pose = transportUnitById(unitId).pose;
      if (posesEqual(pose, dest)) {
        unit.task = { kind: "unloading", orderId, resourceId };
        scheduleUnloadCompletion(unitId, rt, resourceId, now);
        return;
      }
      const mv = requestUnitMove(unitId, dest, now, orderId, `service:${rt.jobId}`);
      if (mv.status === "rejected") {
        res.approachingJobId = null;
        unit.task = {
          kind: "in-queue",
          orderId,
          resourceId,
          slotId: rt.queueSlotId as string,
        };
        diagnose(
          rt,
          "UNREACHABLE_SERVICE",
          `static route to ${resourceId} service position rejected (${mv.reason}); held in queue with load safe`,
          true,
          now,
        );
      }
    };

    const packingStagedUnits = (resourceId: string): number => {
      let total = 0;
      for (const row of S.store.snapshot().packing) {
        if (row.resourceId !== resourceId) continue;
        total += (productCost.get(row.productId) ?? 0) * row.quantity;
      }
      return total;
    };

    // Unload commits every carried line at handling completion, once, and
    // only when downstream staging has room; otherwise the agent holds its
    // valid service position with its load.
    const tryUnloadCommit = (
      unitId: string,
      rt: OrderRuntime,
      resourceId: string,
      now: number,
    ): void => {
      if (rt.unloadCommitted || rt.state !== "WAITING_FOR_PACKING") return;
      const unit = S.units.get(unitId) as UnitRuntime;
      if (
        unit.task.kind !== "unloading" &&
        unit.task.kind !== "awaiting-staging"
      ) {
        return;
      }
      const cfg = packingConfigById.get(resourceId);
      if (!cfg) return;
      const staged = packingStagedUnits(resourceId);
      if (staged + rt.totalCostUnits > cfg.inputStagingCapacity) {
        unit.task = { kind: "awaiting-staging", orderId: rt.orderId, resourceId };
        rt.waitReason = "PACKING_STAGING_FULL";
        openWait(
          unitId,
          rt.orderId,
          "PACKING_STAGING_FULL",
          `${resourceId} staging ${staged}/${cfg.inputStagingCapacity} cost units; ` +
            `order needs ${rt.totalCostUnits}; holding service position with load`,
          now,
        );
        return;
      }
      rt.lines.forEach((line, lineIdx) => {
        S.store.transferToPacking({
          eventId: `inv-xfer-${rt.idx}-${lineIdx}`,
          timeMs: now,
          orderId: rt.orderId,
          unitId,
          resourceId,
          productId: line.productId,
          quantity: line.quantity,
        });
      });
      rt.unloadCommitted = true;
      rt.waitReason = null;
      closeWaitsFor(unitId, rt.orderId, now);
      record(now, "UNLOAD_COMMITTED", rt.orderId, unitId, `all ${rt.totalItems} item(s) staged at ${resourceId}`);
      tryServiceStart(unitId, rt, resourceId, now);
    };

    const tryServiceStart = (
      unitId: string,
      rt: OrderRuntime,
      resourceId: string,
      now: number,
    ): void => {
      const res = S.resources.get(resourceId) as ResourceRuntime;
      const unit = S.units.get(unitId) as UnitRuntime;
      if (!rt.unloadCommitted || !rt.jobEnqueued) return;
      const readiness = S.store.packingReadiness(rt.orderId, resourceId);
      if (!readiness.ready) {
        unit.task = { kind: "awaiting-service-start", orderId: rt.orderId, resourceId };
        rt.waitReason = "INPUT_NOT_READY";
        openWait(unitId, rt.orderId, "INPUT_NOT_READY", "staged input incomplete; cannot start service", now);
        return;
      }
      const started = res.station.tryStart({
        jobId: rt.jobId as string,
        timeMs: now,
        inputReady: true,
      });
      if (started.status === "waiting") {
        unit.task = { kind: "awaiting-service-start", orderId: rt.orderId, resourceId };
        rt.waitReason = `SERVICE_WAIT_${started.reason}`;
        openWait(unitId, rt.orderId, `SERVICE_WAIT_${started.reason}`, `service start deferred (${started.reason})`, now);
        return;
      }
      if (res.approachingJobId === rt.jobId) res.approachingJobId = null;
      rt.queueSlotId = null;
      unit.task = { kind: "idle" };
      rt.waitReason = null;
      closeWaitsFor(unitId, rt.orderId, now);
      record(
        now,
        "SERVICE_STARTED",
        rt.orderId,
        unitId,
        `${rt.jobId} at ${resourceId} position ${started.positionId} after ${started.waitMs}ms queue wait`,
      );
      transition(rt, "PACKING", now, null, `service started at ${resourceId}`);
      const cfg = packingConfigById.get(resourceId);
      const at = now + (cfg?.serviceDurationMs ?? 0);
      if (at > MAX_TIME_MS) {
        diagnose(
          rt,
          "TIME_BOUND_EXCEEDED",
          `packing service for ${rt.orderId} exceeds the ${MAX_TIME_MS}ms horizon bound; lane retained`,
          true,
          now,
        );
        return;
      }
      S.kernel.schedule({
        id: `ops-pack-${rt.idx}`,
        timeMs: at,
        priority: EVENT_PRIORITY.COMPLETION,
        kind: "PACK_COMPLETED",
        data: { orderIdx: rt.idx, resourceId },
      });
      // The picker is free for reuse or parking return; the next queue head
      // sees a busy lane until this service completes.
      requestDispatch(now);
    };

    // Pack commits only into finite per-resource output staging. A full
    // output holds the resource (M2b output-held) with packed-pending stock
    // safe in input staging; it never spills into an unbounded bucket.
    const tryPackCommit = (rt: OrderRuntime, now: number): void => {
      if (rt.state !== "PACKING" || rt.packed || !rt.packingResourceId) return;
      const res = S.resources.get(rt.packingResourceId) as ResourceRuntime;
      const job = res.station
        .snapshot()
        .jobs.find((j) => j.jobId === rt.jobId);
      if (!job || (job.state !== "in-service" && job.state !== "output-held")) {
        return;
      }
      const cfg = packingConfigById.get(res.resourceId);
      const cap = cfg?.outputStagingCapacity ?? 0;
      if (job.state === "in-service") {
        // Defensive: only the PACK_COMPLETED event (fired at start +
        // duration) may complete an in-service job; any earlier retry path
        // returns without touching service or stock.
        const earliest =
          (job.startTimeMs ?? 0) + (cfg?.serviceDurationMs ?? 0);
        if (now < earliest) return;
      }
      if (res.outputUsed + rt.totalCostUnits > cap) {
        if (job.state === "in-service") {
          res.station.completeService({
            jobId: rt.jobId as string,
            timeMs: now,
            outputBlocked: true,
          });
          record(now, "OUTPUT_HELD", rt.orderId, null, `${res.resourceId} output ${res.outputUsed}/${cap}; order needs ${rt.totalCostUnits}`);
        }
        rt.waitReason = "OUTPUT_BLOCKED";
        openWait(
          null,
          rt.orderId,
          "OUTPUT_BLOCKED",
          `${res.resourceId} output staging ${res.outputUsed}/${cap} cost units; ` +
            `no dispatch drain in M3b; lane retained with stock safe`,
          now,
        );
        return;
      }
      if (job.state === "in-service") {
        res.station.completeService({
          jobId: rt.jobId as string,
          timeMs: now,
          outputBlocked: false,
        });
      } else {
        S.store.packOrder({
          eventId: `inv-pack-${rt.idx}`,
          timeMs: now,
          orderId: rt.orderId,
          resourceId: res.resourceId,
        });
        res.station.releaseOutput({
          jobId: rt.jobId as string,
          timeMs: now,
        });
        rt.packed = true;
        res.packedOutput.set(rt.orderId, rt.totalCostUnits);
        res.outputUsed += rt.totalCostUnits;
        rt.waitReason = null;
        closeWaitsFor(null, rt.orderId, now);
        record(now, "PACK_COMMITTED", rt.orderId, null, `packed at ${res.resourceId} after output hold`);
        transition(rt, "READY_FOR_DISPATCH", now, null, `packed ${rt.totalItems} item(s); finite output staging, not shipped`);
        requestDispatch(now);
        return;
      }
      S.store.packOrder({
        eventId: `inv-pack-${rt.idx}`,
        timeMs: now,
        orderId: rt.orderId,
        resourceId: res.resourceId,
      });
      rt.packed = true;
      res.packedOutput.set(rt.orderId, rt.totalCostUnits);
      res.outputUsed += rt.totalCostUnits;
      rt.waitReason = null;
      closeWaitsFor(null, rt.orderId, now);
      record(now, "PACK_COMMITTED", rt.orderId, null, `packed at ${res.resourceId}`);
      transition(rt, "READY_FOR_DISPATCH", now, null, `packed ${rt.totalItems} item(s); finite output staging, not shipped`);
      requestDispatch(now);
    };

    const onMovementCompleted = (unitId: string, now: number): void => {
      const unit = S.units.get(unitId);
      if (!unit) return;
      const snap = transportUnitById(unitId);
      // Only an actual arrival advances a task: a still-moving unit (or any
      // mismatch the transport core already ignored) changes nothing here.
      if (snap.state === "moving") return;
      const t = unit.task;
      if (t.kind === "to-pick") {
        const rt = S.orders.get(t.orderId);
        const leg = rt?.legs[t.legIndex];
        if (!rt || rt.unitId !== unitId || !leg || !posesEqual(snap.pose, leg.approach)) {
          return;
        }
        unit.task = { kind: "picking", orderId: rt.orderId, legIndex: t.legIndex };
        record(now, "LEG_ARRIVED", rt.orderId, unitId, `at ${leg.locationId} approach`);
        schedulePickCompletion(unitId, rt, t.legIndex, now);
      } else if (t.kind === "to-queue") {
        const rt = S.orders.get(t.orderId);
        const res = S.resources.get(t.resourceId);
        const slot = res?.queueCoords.get(t.slotId);
        if (!rt || !res || !slot || !posesEqual(snap.pose, slot)) return;
        unit.task = { kind: "in-queue", orderId: rt.orderId, resourceId: t.resourceId, slotId: t.slotId };
        record(now, "QUEUE_ARRIVED", rt.orderId, unitId, `arrived ${t.slotId} holding ${rt.totalItems} item(s)`);
        attemptServiceApproach(rt.orderId, t.resourceId, now);
      } else if (t.kind === "to-service") {
        const rt = S.orders.get(t.orderId);
        const res = S.resources.get(t.resourceId);
        if (!rt || !res) return;
        if (!posesEqual(snap.pose, firstServicePosition(res))) return;
        unit.task = { kind: "unloading", orderId: rt.orderId, resourceId: t.resourceId };
        record(now, "SERVICE_ARRIVED", rt.orderId, unitId, `at ${t.resourceId} service position`);
        scheduleUnloadCompletion(unitId, rt, t.resourceId, now);
      } else if (t.kind === "to-vacate") {
        const res = S.resources.get(t.resourceId);
        const slot = res?.queueCoords.get(t.slotId);
        if (!slot || !posesEqual(snap.pose, slot)) return;
        unit.task = { kind: "idle" };
        record(now, "VACATED", null, unitId, `idle at ${t.resourceId} slot ${t.slotId}; parking next`);
      } else if (t.kind === "to-parking") {
        const home = unitParking.get(unitId) as MoveDestination;
        if (!posesEqual(snap.pose, home)) return;
        unit.task = { kind: "idle" };
        record(now, "PARKED", null, unitId, "idle at parking");
      } else {
        return;
      }
      noteConcurrency(now);
      requestDispatch(now);
    };

    const onHandlingCompleted = (event: KernelEventView, now: number): void => {
      const data = event.data as {
        unitId?: unknown;
        orderIdx?: unknown;
        handling?: unknown;
        legIndex?: unknown;
        resourceId?: unknown;
      } | null;
      const unitId = typeof data?.unitId === "string" ? data.unitId : null;
      const orderIdx = typeof data?.orderIdx === "number" ? data.orderIdx : null;
      const handling = data?.handling === "pick" || data?.handling === "unload" ? data.handling : null;
      if (unitId === null || orderIdx === null || handling === null) return;
      const spec = scenario.orderSchedule[orderIdx];
      const rt = spec ? S.orders.get(spec.id) : undefined;
      const unit = S.units.get(unitId);
      if (!rt || !rt.created || !unit) {
        record(now, "STALE_IGNORED", null, unitId, "handling for unknown order/unit; no mutation");
        return;
      }
      if (handling === "pick") {
        const legIndex = typeof data?.legIndex === "number" ? data.legIndex : -1;
        const leg = rt.legs[legIndex];
        const pose = transportUnitById(unitId).pose;
        if (
          unit.task.kind !== "picking" ||
          unit.task.orderId !== rt.orderId ||
          unit.task.legIndex !== legIndex ||
          !leg ||
          leg.committed ||
          rt.state !== "PICKING" ||
          rt.unitId !== unitId ||
          !posesEqual(pose, leg.approach)
        ) {
          record(now, "STALE_IGNORED", rt.orderId, unitId, "unexpected pick completion; no mutation");
          return;
        }
        S.store.pick({
          eventId: `inv-pick-${rt.idx}-${legIndex}`,
          timeMs: now,
          orderId: rt.orderId,
          unitId,
          locationId: leg.locationId,
          productId: leg.productId,
          quantity: leg.quantity,
        });
        leg.committed = true;
        rt.legsDone += 1;
        record(now, "PICK_COMMITTED", rt.orderId, unitId, `${leg.productId}x${leg.quantity} from ${leg.locationId}`);
        const nextIndex = legIndex + 1;
        if (nextIndex < rt.legs.length) {
          const next = rt.legs[nextIndex] as PickLeg;
          unit.task = { kind: "to-pick", orderId: rt.orderId, legIndex: nextIndex };
          if (posesEqual(pose, next.approach)) {
            unit.task = { kind: "picking", orderId: rt.orderId, legIndex: nextIndex };
            schedulePickCompletion(unitId, rt, nextIndex, now);
            return;
          }
          const mv = requestUnitMove(unitId, next.approach, now, rt.orderId, `pick-leg-${nextIndex}:${next.locationId}`);
          if (mv.status === "rejected") {
            diagnose(
              rt,
              "UNREACHABLE_APPROACH",
              `static route to ${next.locationId} approach rejected (${mv.reason}); ` +
                `partial load retained, no further pick continues`,
              true,
              now,
            );
          }
          return;
        }
        // All legs picked: choose a packing station and queue physically.
        transition(rt, "WAITING_FOR_PACKING", now, unitId, `carrying ${rt.totalItems} item(s)`);
        const resourceId = choosePackingResource();
        rt.packingResourceId = resourceId;
        const res = S.resources.get(resourceId) as ResourceRuntime;
        tryEnqueue(rt, res, now);
        return;
      }
      const resourceId = typeof data?.resourceId === "string" ? data.resourceId : null;
      const res = resourceId ? S.resources.get(resourceId) : undefined;
      const pose = transportUnitById(unitId).pose;
      if (
        !rt ||
        !res ||
        unit.task.kind !== "unloading" ||
        unit.task.orderId !== rt.orderId ||
        rt.unloadCommitted ||
        rt.state !== "WAITING_FOR_PACKING" ||
        !posesEqual(pose, firstServicePosition(res))
      ) {
        record(now, "STALE_IGNORED", rt?.orderId ?? null, unitId, "unexpected unload completion; no mutation");
        return;
      }
      tryUnloadCommit(unitId, rt, resourceId as string, now);
    };

    const onPackCompleted = (event: KernelEventView, now: number): void => {
      const data = event.data as { orderIdx?: unknown } | null;
      const orderIdx = typeof data?.orderIdx === "number" ? data.orderIdx : null;
      if (orderIdx === null) return;
      const spec = scenario.orderSchedule[orderIdx];
      const rt = spec ? S.orders.get(spec.id) : undefined;
      if (!rt || !rt.created) {
        record(now, "STALE_IGNORED", null, null, "pack completion for unknown order; no mutation");
        return;
      }
      if (rt.state !== "PACKING" || rt.packed) {
        record(now, "STALE_IGNORED", rt.orderId, null, "unexpected pack completion; no mutation");
        return;
      }
      tryPackCommit(rt, now);
    };

    const onArrival = (event: KernelEventView, now: number): void => {
      const data = event.data as { orderId?: unknown } | null;
      const orderId = typeof data?.orderId === "string" ? data.orderId : null;
      const rt = orderId ? S.orders.get(orderId) : undefined;
      if (!rt || rt.created) {
        record(now, "STALE_IGNORED", orderId, null, "unknown or duplicate arrival; no mutation");
        return;
      }
      rt.created = true;
      transition(rt, "CREATED", now, null, `arrived with ${rt.lines.length} line(s)`);
      requestDispatch(now);
    };

    const onEvent = (event: KernelEventView, api: KernelApi): void => {
      void api;
      const now = event.timeMs;
      if (event.kind === "MOVEMENT_COMPLETED") {
        // Transport commits the arrival (or ignores a stale one) first;
        // the operations follow-up re-verifies pose and task phase.
        S.domain.handleMovementCompleted(event, api);
        const data = event.data as { unitId?: unknown } | null;
        if (typeof data?.unitId === "string") {
          onMovementCompleted(data.unitId, now);
        }
        return;
      }
      switch (event.kind) {
        case "ORDER_ARRIVAL":
          onArrival(event, now);
          break;
        case "OPERATIONS_DISPATCH":
          S.dispatchPending = false;
          runDispatch(now);
          break;
        case "HANDLING_COMPLETED":
          onHandlingCompleted(event, now);
          break;
        case "PACK_COMPLETED":
          onPackCompleted(event, now);
          break;
        default:
          break;
      }
    };

    const kernel = createKernel({
      maxProcessedEvents: scenario.policies.eventLimits.maxProcessedEvents,
      maxEventsPerTimestamp:
        scenario.policies.eventLimits.maxEventsPerTimestamp,
      onEvent: (event, api) => {
        onEvent(event, api);
      },
    });
    S.kernel = kernel;
    S.domain.bindKernel(kernel);
    let arrivalSeq = 0;
    for (const rt of S.orders.values()) {
      arrivalSeq += 1;
      kernel.schedule({
        id: `ops-arrival-${arrivalSeq}`,
        timeMs: rt.arrivalTimeMs,
        priority: EVENT_PRIORITY.ARRIVAL,
        kind: "ORDER_ARRIVAL",
        data: { orderId: rt.orderId },
      });
    }
    return S;
  };

  const freezeValue = <T>(value: T): T => {
    if (Array.isArray(value)) {
      for (const item of value) freezeValue(item);
      return Object.freeze(value);
    }
    if (typeof value === "object" && value !== null) {
      for (const key of Object.keys(value)) {
        freezeValue((value as Record<string, unknown>)[key]);
      }
      return Object.freeze(value);
    }
    return value;
  };

  const describeBlocker = (waiting: {
    blocker:
      | { kind: "unit"; blockerUnitId: string; reason: string }
      | { kind: "zone"; zoneId: string; holderUnitId: string; reason: string }
      | { kind: "unknown"; reason: string; candidates: string[] };
  }): string => {
    const b = waiting.blocker;
    if (b.kind === "unit") return `TRAFFIC:unit:${b.blockerUnitId}:${b.reason}`;
    if (b.kind === "zone") {
      return `TRAFFIC:zone:${b.zoneId}:${b.holderUnitId}:${b.reason}`;
    }
    return `TRAFFIC:unknown:${b.reason}`;
  };

  const orderWaitReason = (
    S: LiveState,
    rt: OrderRuntime,
    transport: TransportSnapshot,
  ): string | null => {
    if (!rt.created || rt.diagnostic?.terminal) return null;
    if (rt.state === "READY_FOR_DISPATCH") return null;
    if (rt.state === "CREATED") return "DISPATCH_PENDING";
    if (rt.state === "WAITING_FOR_STOCK") return "WAITING_FOR_STOCK";
    if (rt.state === "READY_FOR_PICKING") {
      return rt.unitId === null ? "NO_IDLE_PICKER" : null;
    }
    if (rt.state === "PICKING") {
      if (!rt.unitId) return rt.waitReason;
      const tu = transport.units.find((u) => u.unitId === rt.unitId);
      if (tu?.state === "waiting" && tu.waiting) {
        return describeBlocker(tu.waiting);
      }
      return null;
    }
    if (rt.state === "WAITING_FOR_PACKING") {
      if (!rt.unitId || !rt.packingResourceId) return rt.waitReason;
      const tu = transport.units.find((u) => u.unitId === rt.unitId);
      if (tu?.state === "waiting" && tu.waiting) {
        return describeBlocker(tu.waiting);
      }
      const unit = S.units.get(rt.unitId);
      const res = S.resources.get(rt.packingResourceId);
      if (!unit || !res) return rt.waitReason;
      if (unit.task.kind === "awaiting-queue-slot") return "QUEUE_FULL";
      // Direct-service heads wait here on BUSY_STATION/APPROACH_RESERVED
      // too; report the honest reason instead of a fixed AWAITING_HEAD.
      if (unit.task.kind === "awaiting-head") {
        return rt.waitReason ?? "AWAITING_HEAD";
      }
      if (unit.task.kind === "awaiting-staging") return "PACKING_STAGING_FULL";
      if (unit.task.kind === "awaiting-service-start") {
        return rt.waitReason ?? "SERVICE_WAIT";
      }
      if (unit.task.kind === "in-queue") {
        const jobs = res.station.snapshot().jobs;
        const head =
          jobs
            .filter((j) => j.state === "queued")
            .sort(
              (a, b) =>
                a.enqueueTimeMs - b.enqueueTimeMs ||
                (a.jobId < b.jobId ? -1 : 1),
            )[0]?.jobId ?? null;
        if (head !== rt.jobId) return "QUEUED_BEHIND_HEAD";
        const busy = jobs.some(
          (j) => j.state === "in-service" || j.state === "output-held",
        );
        if (busy) return "BUSY_STATION";
        if (res.approachingJobId !== null && res.approachingJobId !== rt.jobId) {
          return "APPROACH_RESERVED";
        }
        return null;
      }
      return null;
    }
    // PACKING
    if (rt.packed || !rt.packingResourceId) return null;
    const res = S.resources.get(rt.packingResourceId);
    const job = res?.station.snapshot().jobs.find((j) => j.jobId === rt.jobId);
    if (job?.state === "output-held") return "OUTPUT_BLOCKED";
    return null;
  };

  const checkCapacity = (S: LiveState): string[] => {
    const violations: string[] = [];
    const inv = S.store.snapshot();
    for (const row of inv.carried) {
      let used = 0;
      for (const load of row.loads) {
        used += (productCost.get(load.productId) ?? 0) * load.quantity;
      }
      const cap = unitCapacity.get(row.unitId) ?? 0;
      if (used > cap) {
        violations.push(`unit ${row.unitId} carries ${used}/${cap} handling-cost units`);
      }
    }
    for (const [resourceId, res] of S.resources) {
      const cfg = packingConfigById.get(resourceId);
      if (!cfg) continue;
      let staged = 0;
      for (const row of inv.packing) {
        if (row.resourceId !== resourceId) continue;
        staged += (productCost.get(row.productId) ?? 0) * row.quantity;
      }
      if (staged > cfg.inputStagingCapacity) {
        violations.push(
          `packing ${resourceId} stages ${staged}/${cfg.inputStagingCapacity} input cost units`,
        );
      }
      if (res.outputUsed > cfg.outputStagingCapacity) {
        violations.push(
          `packing ${resourceId} holds ${res.outputUsed}/${cfg.outputStagingCapacity} output cost units`,
        );
      }
      const jobs = res.station.snapshot().jobs;
      // Only real queue-slot allocations count against queue capacity; a
      // zero-queue pending direct handoff (queueSlotId null) is distinct.
      const queued = jobs.filter(
        (j) => j.state === "queued" && j.queueSlotId !== null,
      ).length;
      if (queued > cfg.queueSlots.length) {
        violations.push(
          `packing ${resourceId} queues ${queued}/${cfg.queueSlots.length} jobs`,
        );
      }
      const busy = jobs.filter(
        (j) => j.state === "in-service" || j.state === "output-held",
      ).length;
      if (busy > cfg.servicePositions.length || busy > cfg.serviceCapacity) {
        violations.push(
          `packing ${resourceId} runs ${busy} job(s) on ${cfg.servicePositions.length} position(s)`,
        );
      }
    }
    return violations;
  };

  const checkSafety = (S: LiveState): string[] => {
    const violations: string[] = [];
    const transport = S.domain.snapshot();
    const discs = transport.units.map((u) => ({
      unitId: u.unitId,
      pose: u.pose,
      radius: unitRadius.get(u.unitId) ?? 0,
    }));
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = i + 1; j < discs.length; j += 1) {
        const a = discs[i] as { unitId: string; pose: MoveDestination; radius: number };
        const b = discs[j] as { unitId: string; pose: MoveDestination; radius: number };
        if (stationaryVsStationaryConflict(a.pose, a.radius, b.pose, b.radius)) {
          violations.push(`overlap at snapshot: ${a.unitId} vs ${b.unitId}`);
        }
      }
    }
    // BETWEEN-timestamps check over every authorized envelope retained: any
    // two time-overlapping trajectories must clear the M3a swept predicate.
    const kept = S.trajectories;
    for (let i = 0; i < kept.length; i += 1) {
      for (let j = i + 1; j < kept.length; j += 1) {
        const a = kept[i] as RetainedTrajectory;
        const b = kept[j] as RetainedTrajectory;
        // A unit never conflicts with itself: consecutive legs of one unit
        // share a handoff instant by construction (same M3a rule that only
        // checks committed plans against OTHER units).
        if (a.unitId === b.unitId) continue;
        const overlap =
          Math.max(a.trajectory.startMs, b.trajectory.startMs) <=
          Math.min(a.trajectory.endMs, b.trajectory.endMs);
        if (!overlap) continue;
        if (trajectoriesConflict(a.trajectory, b.trajectory).conflict) {
          violations.push(
            `swept conflict: ${a.unitId} (${a.purpose} ${a.trajectory.startMs}..${a.trajectory.endMs}) vs ` +
              `${b.unitId} (${b.purpose} ${b.trajectory.startMs}..${b.trajectory.endMs})`,
          );
        }
      }
    }
    return violations;
  };

  const buildSnapshot = (S: LiveState): OperationsSnapshot => {
    const transport = S.domain.snapshot();
    const inv = S.store.snapshot();
    const reservationOf = (
      orderId: string,
    ): { productId: string; locationId: string; quantity: number }[] => {
      const entry = inv.reservations.find((r) => r.orderId === orderId);
      if (!entry) return [];
      const out: { productId: string; locationId: string; quantity: number }[] = [];
      for (const line of entry.lines) {
        for (const src of line.sources) {
          out.push({
            productId: line.productId,
            locationId: src.locationId,
            quantity: src.remaining,
          });
        }
      }
      return out;
    };
    const orders: OperationsOrderView[] = fifoSelected.map(({ spec }) => {
      const rt = S.orders.get(spec.id) as OrderRuntime;
      return {
        orderId: rt.orderId,
        arrivalTimeMs: rt.arrivalTimeMs,
        state: rt.created ? rt.state : "NOT_ARRIVED",
        timestamps: { ...rt.timestamps },
        lines: rt.lines.map((l) => ({ ...l })),
        reservation: reservationOf(rt.orderId),
        unitId: rt.unitId,
        packingResourceId: rt.packingResourceId,
        queueSlotId: rt.queueSlotId,
        waitReason: orderWaitReason(S, rt, transport),
        diagnostic: rt.diagnostic ? { ...rt.diagnostic } : null,
      };
    });
    const units: OperationsUnitView[] = [...S.units.values()]
      .sort((a, b) => (a.unitId < b.unitId ? -1 : 1))
      .map((unit) => {
      const tu = transport.units.find((u) => u.unitId === unit.unitId) as {
        pose: MoveDestination;
        state: "moving" | "waiting" | "idle";
        plan: GrantedPlan | null;
        waiting: {
          blocker:
            | { kind: "unit"; blockerUnitId: string; reason: string }
            | { kind: "zone"; zoneId: string; holderUnitId: string; reason: string }
            | { kind: "unknown"; reason: string; candidates: string[] };
        } | null;
      };
      const carriedRow = inv.carried.find((c) => c.unitId === unit.unitId);
      const carried =
        carriedRow?.loads.map((l) => ({ ...l })) ?? [];
      const carriedCostUnits = carried.reduce(
        (n, l) => n + (productCost.get(l.productId) ?? 0) * l.quantity,
        0,
      );
      let waitReason: string | null = null;
      if (tu.state === "waiting" && tu.waiting) {
        waitReason = describeBlocker(tu.waiting);
      } else if ("orderId" in unit.task) {
        const rt = S.orders.get(unit.task.orderId);
        if (rt) waitReason = orderWaitReason(S, rt, transport);
      }
      const task = unit.task as OperationsUnitTaskView;
      return {
        unitId: unit.unitId,
        role: unit.role,
        pose: { ...tu.pose },
        transportState: tu.state,
        task: JSON.parse(JSON.stringify(task)) as OperationsUnitTaskView,
        waitReason,
        carried,
        carriedCostUnits,
        loadCapacityUnits: unitCapacity.get(unit.unitId) ?? 0,
        authorizedRoute: tu.plan
          ? (JSON.parse(JSON.stringify(tu.plan)) as GrantedPlan)
          : null,
      };
    });
    const packing: OperationsPackingView[] = [...S.resources.values()].map(
      (res) => {
        const cfg = packingConfigById.get(res.resourceId);
        return {
          resourceId: res.resourceId,
          serviceCapacity: cfg?.serviceCapacity ?? 0,
          serviceDurationMs: cfg?.serviceDurationMs ?? 0,
          inputStagingCapacity: cfg?.inputStagingCapacity ?? 0,
          outputStagingCapacity: cfg?.outputStagingCapacity ?? 0,
          approachingJobId: res.approachingJobId,
          jobs: res.station.snapshot().jobs.map((j) => ({ ...j })),
          packedOutput: [...res.packedOutput.entries()]
            .map(([orderId, costUnits]) => ({ orderId, costUnits }))
            .sort((a, b) => (a.orderId < b.orderId ? -1 : 1)),
          outputUsedUnits: res.outputUsed,
        };
      },
    );
    const arrived = orders.filter((o) => o.state !== "NOT_ARRIVED").length;
    const packedCount = [...S.orders.values()].filter((o) => o.packed).length;
    const ready = orders.filter((o) => o.state === "READY_FOR_DISPATCH").length;
    return freezeValue({
      scenarioId: scenario.id,
      seed: scenario.seed,
      versions: {
        simulation: SIMULATION_VERSION,
        operationsSchema: OPERATIONS_SCHEMA_VERSION,
        operationsEngine: OPERATIONS_ENGINE_VERSION,
      },
      executionConfig: { ...executionConfig },
      clockMs: S.kernel.getClockMs(),
      runMode,
      orders,
      excludedOrderIds: [...excludedOrderIds],
      units,
      inventory: inv,
      packing,
      timeline: S.timeline.map((t) => ({ ...t })),
      waits: S.waits.map((w) => ({ ...w })),
      motionHistory: S.trajectories.map((t) => ({
        unitId: t.unitId,
        planVersion: t.planVersion,
        orderId: t.orderId,
        purpose: t.purpose,
        startMs: t.trajectory.startMs,
        endMs: t.trajectory.endMs,
        segmentCount: t.trajectory.segments.length,
      })),
      maxConcurrentMoving: { ...S.maxConcurrentMoving },
      counts: {
        selected: orders.length,
        excluded: excludedOrderIds.length,
        arrived,
        packed: packedCount,
        readyForDispatch: ready,
        shipped: 0,
        backlog: arrived,
        stageBacklog: arrived - ready,
      },
      checks: {
        conservation: S.store.checkInvariants(),
        capacity: checkCapacity(S),
        safety: checkSafety(S),
      },
    });
  };

  const completionOf = (S: LiveState): OperationsCompletion => {
    const all = [...S.orders.values()];
    const ready = all.filter((o) => o.state === "READY_FOR_DISPATCH").length;
    const created = all.filter((o) => o.created).length;
    const reasons = all
      .filter((o) => o.diagnostic?.terminal)
      .map((o) => ({
        orderId: o.orderId,
        code: (o.diagnostic as OperationsOrderDiagnostic).code,
        message: (o.diagnostic as OperationsOrderDiagnostic).message,
      }));
    // backlog = arrived - shipped (unshipped); stageBacklog = arrived - ready.
    // M3b never ships, so backlog counts every arrived order even at stage
    // completion: SUPPORTED_STAGE_COMPLETE stays honest, never all-shipped.
    if (runMode === "finite-cohort") {
      if (all.length > 0 && ready === all.length) {
        return {
          stage: "SUPPORTED_STAGE_COMPLETE",
          ready,
          selected: all.length,
          shipped: 0,
          backlog: all.length,
          stageBacklog: 0,
          note: "all selected orders READY_FOR_DISPATCH; packed goods are finite output staging, nothing SHIPPED in M3b",
        };
      }
      if (
        reasons.length > 0 &&
        created === all.length &&
        ready + reasons.length === all.length
      ) {
        return {
          stage: "BLOCKED",
          ready,
          selected: all.length,
          created,
          backlog: created,
          stageBacklog: created - ready,
          shipped: 0,
          detail:
            "every selected order is ready or terminally blocked; state retained, no partial fulfillment",
          reasons,
        };
      }
      return {
        stage: "IN_PROGRESS",
        ready,
        selected: all.length,
        created,
        backlog: created,
        stageBacklog: created - ready,
        shipped: 0,
        detail: `${created}/${all.length} arrived, ${ready} ready for dispatch, ${created} unshipped backlog, ${created - ready} stage backlog`,
        reasons,
      };
    }
    const horizon =
      scenario.policies.run.mode === "fixed-window"
        ? scenario.policies.run.horizonMs
        : 0;
    if (S.kernel.getClockMs() >= horizon) {
      return {
        stage: "WINDOW_ENDED",
        ready,
        selected: all.length,
        created,
        backlog: created,
        stageBacklog: created - ready,
        shipped: 0,
        detail:
          `fixed window ended at ${horizon}ms with active/pending work and partial motion retained; ` +
          `this is not shipping completion`,
        reasons,
      };
    }
    return {
      stage: "IN_PROGRESS",
      ready,
      selected: all.length,
      created,
      backlog: created,
      stageBacklog: created - ready,
      shipped: 0,
      detail: `${created}/${all.length} arrived, ${ready} ready for dispatch, ${created} unshipped backlog, ${created - ready} stage backlog`,
      reasons,
    };
  };

  const diagnosticOf = (S: LiveState): OperationsDiagnostic | null => {
    const snap = S.kernel.snapshot();
    if (snap.status === "invalid") {
      return {
        status: "kernel-invalid",
        detail: snap.diagnostic ?? "kernel invalid",
      };
    }
    // A finished cohort is never globally stuck: post-completion parking
    // holds (units waiting on permanently parked colleagues) block no
    // operations progress. The unit-level waits stay visible in the
    // snapshot; the global diagnostic answers whether WORK is blocked.
    const allReady = [...S.orders.values()].every(
      (o) => o.state === "READY_FOR_DISPATCH",
    );
    if (allReady) return null;
    const t = S.domain.getDiagnostic();
    if (!t || t.status !== "stuck") return null;
    // A transport-alone wait is not a global deadlock while domain work
    // (handling, packing, arrivals, dispatch) is still scheduled: packing
    // completion can release a held lane and admit new movement.
    const pendingKinds = new Set(snap.pending.map((e) => e.kind));
    const futureRelease = [
      "MOVEMENT_COMPLETED",
      "HANDLING_COMPLETED",
      "PACK_COMPLETED",
      "ORDER_ARRIVAL",
      "OPERATIONS_DISPATCH",
    ].some((k) => pendingKinds.has(k));
    if (futureRelease) return null;
    const operationsWaits = S.waits
      .filter((w) => w.endMs === null && w.orderId !== null)
      .map((w) => ({ orderId: w.orderId as string, reason: w.reason }));
    return {
      status: "stuck",
      detail:
        `transport reports ${t.kind} with no moving units and no future release scheduled; ` +
        `operations waits retained (${operationsWaits.length}); no teleport or task deletion`,
      transportWaits: t.waits,
      operationsWaits,
    };
  };

  let S = initState();
  // Fixed-window horizon enforcement (no second clock, no timer): both
  // public paths stop EXACTLY at the horizon, retain pending events, stock,
  // and partial motion, and never execute anything after the window.
  // Repeated calls at/past the window do not progress; oversized-chunk and
  // at-horizon advances are byte-identical. Finite-cohort drain is uncapped.
  const cappedAdvanceTo = (targetMs: number): StepResult => {
    // Validate the REQUESTED time before capping, exactly like the kernel:
    // clamping first would silently coerce Infinity, unsafe integers, and
    // numeric strings into the window. Past-time/invalid-state behavior
    // stays the kernel's (checked on the clamped target below).
    if (
      !Number.isSafeInteger(targetMs) ||
      targetMs < 0 ||
      targetMs > MAX_TIME_MS
    ) {
      throw new Error(
        `advanceTo target must be an integer in 0..${MAX_TIME_MS}`,
      );
    }
    if (horizonMs === null) return S.kernel.advanceTo(targetMs);
    return S.kernel.advanceTo(Math.min(targetMs, horizonMs));
  };
  const cappedStepEvent = (): StepResult => {
    if (horizonMs === null) return S.kernel.stepEvent();
    if (S.kernel.getStatus() === "invalid") return S.kernel.stepEvent();
    const next = S.kernel.snapshot().pending[0];
    // Events exactly at the horizon are inside the window and execute.
    if (next && next.timeMs <= horizonMs) return S.kernel.stepEvent();
    // No executable event inside the window (next lies beyond it, or the
    // queue is empty): stop at the boundary without processing anything
    // past it. With an empty queue the kernel advances only the clock, so
    // no work, transfers, or events are fabricated.
    if (S.kernel.getClockMs() >= horizonMs) {
      return {
        status: S.kernel.getStatus(),
        clockMs: S.kernel.getClockMs(),
        processedTotal: S.kernel.getProcessedTotal(),
        eventId: null,
        diagnostic: null,
      };
    }
    return S.kernel.advanceTo(horizonMs);
  };
  return {
    getClockMs: () => S.kernel.getClockMs(),
    stepEvent: () => cappedStepEvent(),
    advanceTo: (targetMs: number) => cappedAdvanceTo(targetMs),
    reset: () => {
      S = initState();
    },
    snapshot: () => buildSnapshot(S),
    getCompletionStatus: () => completionOf(S),
    getDiagnostic: () => diagnosticOf(S),
  };
}



