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
// Dispatch ships only through a configured dispatch resource: packed goods
// wait in finite per-resource output staging until the dispatch-service
// completion moves them to dispatched stock and frees the staging. With no
// dispatch resource, READY_FOR_DISPATCH stays terminal. No inbound/putaway
// completion is claimed. Full output holds the resource with stock safe
// (M2b output-held), it never spills into an unbounded bucket.
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
  type TimedSegment,
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
  | "READY_FOR_DISPATCH"
  | "SHIPPED";

export type OperationsOrderDiagnostic = {
  code: string;
  message: string;
  terminal: boolean;
};

export type DeliveryLifecycleState =
  | "RECEIVING"
  | "PUTAWAY_PENDING"
  | "PUTAWAY"
  | "STORED";

export type OperationsDeliveryView = {
  deliveryId: string;
  arrivalTimeMs: number;
  state: DeliveryLifecycleState | "NOT_ARRIVED";
  timestamps: Partial<Record<DeliveryLifecycleState, number>>;
  lines: { productId: string; quantity: number }[];
  receivingResourceId: string | null;
  waitReason: string | null;
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
  dispatchResourceId: string | null;
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
  | { kind: "to-receive"; deliveryId: string; resourceId: string }
  | { kind: "collecting"; deliveryId: string; resourceId: string; productId: string; quantity: number }
  | { kind: "awaiting-location"; deliveryId: string }
  | { kind: "yield-to-parking"; deliveryId: string }
  | { kind: "to-store"; deliveryId: string; locationId: string }
  | { kind: "storing"; deliveryId: string; locationId: string }
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
  deliveries: OperationsDeliveryView[];
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
    segments?: TimedSegment[];
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
  exportReport(): OperationsReport;
};

export type OperationsTermination = {
  mode: "fixed-window" | "finite-cohort";
  horizonMs: number | null;
  arrivalCutoffMs: number | null;
  // Null in a bare exportReport: the caller drove the clock, so no safety
  // ceiling was in force. Experiment runs always record a real ceiling.
  safetyCeilingMs: number | null;
  stopClockMs: number;
  stopReason:
    | "stage-complete"
    | "blocked"
    | "window-ended"
    | "safety-ceiling"
    | "no-progress"
    | "caller-stopped";
};

export type OperationsReport = {
  schema: "layoutlab.operations-report/1";
  scenarioId: string;
  seed: string;
  versions: OperationsSnapshot["versions"];
  scenario: OperationsScenario;
  executionConfig: OperationsExecutionConfig;
  completionStage: string;
  counts: OperationsCounts;
  orders: { orderId: string; state: string; timestamps: Partial<Record<OrderLifecycleState, number>> }[];
  deliveries: {
    deliveryId: string;
    state: string;
    timestamps?: Partial<Record<DeliveryLifecycleState, number>>;
  }[];
  checks: OperationsChecks;
  // E3 evidence extension on the same /1 schema: historical reports without
  // these fields still load, but the verifier flags the missing evidence
  // instead of calling them fully verified.
  clockMs?: number;
  termination?: OperationsTermination;
  totalWaitMs?: number;
  makespanMs?: number | null;
  lastShippedAtMs?: number | null;
};

export const DEFAULT_OPERATIONS_SAFETY_CEILING_MS = 7_200_000;

// Total wait from engine wait records only (e.g. NO_IDLE_PICKER, traffic,
// queue-full holds); open intervals clip at the actual report clock, never
// at a hidden cap. A packing station job waitMs (enqueue to service start)
// includes picker travel and unload after enqueue, so it is not waiting
// time and is never summed into totalWaitMs.
export function operationsRunMetrics(
  snapshot: OperationsSnapshot,
  completionStage: string,
): { totalWaitMs: number; makespanMs: number | null; lastShippedAtMs: number | null } {
  const totalWaitMs = snapshot.waits.reduce(
    (n, w) => n + Math.max(0, (w.endMs ?? snapshot.clockMs) - w.startMs),
    0,
  );
  const shippedTimes = snapshot.orders
    .map((o) => o.timestamps.SHIPPED)
    .filter((t): t is number => typeof t === "number");
  const lastShippedAtMs = shippedTimes.length > 0 ? Math.max(...shippedTimes) : null;
  // A makespan exists only for a complete intended cohort: stage complete
  // with every selected order shipped. Partial shipped maxima stay visible
  // as lastShippedAtMs and are never relabeled.
  const completeCohort =
    completionStage === "SUPPORTED_STAGE_COMPLETE" &&
    snapshot.counts.selected > 0 &&
    snapshot.counts.shipped === snapshot.counts.selected;
  return { totalWaitMs, makespanMs: completeCohort ? lastShippedAtMs : null, lastShippedAtMs };
}

// Drive a controller to its declared end: finite-cohort completion/block,
// the fixed-window horizon, or the explicit safety ceiling, whichever first.
// Chunk targets always move forward, so a run parked at a ceiling stops
// instead of advancing to the same time in a loop.
export function runOperationsToTermination(
  controller: OperationsController,
  safetyCeilingMs: number = DEFAULT_OPERATIONS_SAFETY_CEILING_MS,
): OperationsTermination {
  if (
    !Number.isSafeInteger(safetyCeilingMs) ||
    safetyCeilingMs < 1 ||
    safetyCeilingMs > MAX_TIME_MS
  ) {
    throw new Error(`safetyCeilingMs must be an integer in 1..${MAX_TIME_MS}`);
  }
  const run = controller.exportReport().scenario.policies.run;
  const mode = run.mode;
  const horizonMs = mode === "fixed-window" ? run.horizonMs : null;
  const arrivalCutoffMs = mode === "finite-cohort" ? run.arrivalCutoffMs : null;
  let stopReason: OperationsTermination["stopReason"] = "caller-stopped";
  for (let guard = 0; guard < 100_000; guard += 1) {
    const stage = controller.getCompletionStatus().stage;
    const clock = controller.getClockMs();
    if (stage === "SUPPORTED_STAGE_COMPLETE") { stopReason = "stage-complete"; break; }
    if (stage === "BLOCKED") { stopReason = "blocked"; break; }
    if (stage === "WINDOW_ENDED") { stopReason = "window-ended"; break; }
    if (clock >= safetyCeilingMs) { stopReason = "safety-ceiling"; break; }
    const target =
      mode === "fixed-window"
        ? Math.min(horizonMs as number, safetyCeilingMs)
        : Math.min(clock + 60_000, safetyCeilingMs);
    if (target <= clock) {
      stopReason =
        mode === "fixed-window" && safetyCeilingMs >= (horizonMs as number)
          ? "window-ended"
          : "safety-ceiling";
      break;
    }
    controller.advanceTo(target);
    if (controller.getClockMs() <= clock) { stopReason = "no-progress"; break; }
  }
  return {
    mode,
    horizonMs,
    arrivalCutoffMs,
    safetyCeilingMs,
    stopClockMs: controller.getClockMs(),
    stopReason,
  };
}

export type OperationsReportVerification = {
  ok: boolean;
  recomputedStage: string;
  recomputedCounts: OperationsCounts;
  recomputedClockMs: number;
  mismatches: string[];
};

// Independently recompute a report: rerun its embedded scenario/config
// headlessly to the report's explicit clock and compare completeness of
// IDs, counts, states, timestamps, checks, versions, seed, clock and
// derived metrics. Saved totals are never echoed as proof. Historical
// reports without the E3 evidence fields are flagged, not verified.
export function recomputeOperationsReport(
  report: OperationsReport,
): OperationsReportVerification {
  const mismatches: string[] = [];
  const fail = (stage: string, counts: OperationsCounts, clock: number): OperationsReportVerification => ({
    ok: false, recomputedStage: stage, recomputedCounts: counts, recomputedClockMs: clock, mismatches,
  });
  if (!report || typeof report !== "object") {
    mismatches.push("report must be an object");
    return fail("UNKNOWN", (report as OperationsReport | null)?.counts as OperationsCounts, 0);
  }
  if (report.schema !== "layoutlab.operations-report/1") {
    mismatches.push(`unsupported report schema ${String(report.schema)}`);
    return fail("UNKNOWN", report.counts, 0);
  }
  let scenario: OperationsScenario;
  try {
    scenario = parseOperationsScenario(report.scenario);
  } catch (e) {
    mismatches.push(`scenario: ${e instanceof Error ? e.message : "invalid scenario"}`);
    return fail("UNKNOWN", report.counts, 0);
  }
  try {
    parseOperationsExecutionConfig(report.executionConfig);
  } catch (e) {
    mismatches.push(`executionConfig: ${e instanceof Error ? e.message : "invalid execution config"}`);
    return fail("UNKNOWN", report.counts, 0);
  }
  if (report.scenarioId !== scenario.id) {
    mismatches.push(`scenarioId: report ${String(report.scenarioId)} != scenario ${scenario.id}`);
  }
  if (report.seed !== scenario.seed) {
    mismatches.push(`seed: report ${String(report.seed)} != scenario ${scenario.seed}`);
  }
  const expectedVersions = {
    simulation: SIMULATION_VERSION,
    operationsSchema: OPERATIONS_SCHEMA_VERSION,
    operationsEngine: OPERATIONS_ENGINE_VERSION,
  };
  for (const key of Object.keys(expectedVersions) as (keyof typeof expectedVersions)[]) {
    if (report.versions?.[key] !== expectedVersions[key]) {
      mismatches.push(`versions.${key}: report ${String(report.versions?.[key])} != current ${expectedVersions[key]}`);
    }
  }
  const hasClock = typeof report.clockMs === "number" && Number.isSafeInteger(report.clockMs);
  if (!hasClock) mismatches.push("clockMs: missing E3 clock evidence (legacy report not fully verifiable)");
  if (!report.termination) mismatches.push("termination: missing E3 termination evidence (legacy report not fully verifiable)");
  if (report.totalWaitMs === undefined) mismatches.push("totalWaitMs: missing E3 metric evidence (legacy report not fully verifiable)");
  if (report.makespanMs === undefined) mismatches.push("makespanMs: missing E3 metric evidence (legacy report not fully verifiable)");
  if (report.lastShippedAtMs === undefined) mismatches.push("lastShippedAtMs: missing E3 metric evidence (legacy report not fully verifiable)");

  let c: OperationsController;
  try {
    c = createOperationsController({ scenario: report.scenario, executionConfig: report.executionConfig });
  } catch (e) {
    mismatches.push(`run: ${e instanceof Error ? e.message : "controller failed"}`);
    return fail("UNKNOWN", report.counts, 0);
  }
  if (hasClock) {
    if ((report.clockMs as number) > 0) c.advanceTo(report.clockMs as number);
  } else {
    runOperationsToTermination(c);
  }
  const s = c.snapshot();
  const stage = c.getCompletionStatus().stage;
  const rc = s.counts;
  if (s.scenarioId !== scenario.id) mismatches.push(`recomputed scenarioId ${s.scenarioId} != scenario ${scenario.id}`);
  if (s.seed !== scenario.seed) mismatches.push(`recomputed seed ${s.seed} != scenario ${scenario.seed}`);
  if (hasClock && s.clockMs !== report.clockMs) {
    mismatches.push(`clockMs: report ${String(report.clockMs)} != recomputed ${s.clockMs}`);
  }
  const countKeys = Object.keys(rc) as (keyof OperationsCounts)[];
  for (const key of countKeys) {
    if (report.counts?.[key] !== rc[key]) {
      mismatches.push(`counts.${key}: report ${String(report.counts?.[key])} != recomputed ${rc[key]}`);
    }
  }
  for (const key of Object.keys(report.counts ?? {})) {
    if (!(countKeys as string[]).includes(key)) mismatches.push(`counts.${key}: unexpected saved count key`);
  }
  if (stage !== report.completionStage) {
    mismatches.push(`completionStage: report ${String(report.completionStage)} != recomputed ${stage}`);
  }
  const sameTimestamps = (
    a: Record<string, number | undefined>,
    b: Record<string, number | undefined>,
  ): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (a[k] !== b[k]) return false;
    return true;
  };
  const checkRows = (
    label: string,
    saved: { id: string; state: string; timestamps?: Record<string, number> }[],
    fresh: { id: string; state: string; timestamps: Record<string, number> }[],
    requireTimestamps: boolean,
  ): void => {
    const savedIds = new Set<string>();
    for (const row of saved) {
      if (savedIds.has(row.id)) mismatches.push(`${label} ${row.id}: duplicate saved row`);
      savedIds.add(row.id);
    }
    const freshById = new Map(fresh.map((r) => [r.id, r]));
    for (const row of saved) {
      const r = freshById.get(row.id);
      if (!r) { mismatches.push(`${label} ${row.id}: missing on recomputation`); continue; }
      if (r.state !== row.state) mismatches.push(`${label} ${row.id}: report ${row.state} != recomputed ${r.state}`);
      if (row.timestamps === undefined) {
        if (requireTimestamps) mismatches.push(`${label} ${row.id}: missing timestamps evidence`);
      } else if (!sameTimestamps(row.timestamps, r.timestamps)) {
        mismatches.push(`${label} ${row.id}: timestamps report ${JSON.stringify(row.timestamps)} != recomputed ${JSON.stringify(r.timestamps)}`);
      }
    }
    for (const r of fresh) {
      if (!savedIds.has(r.id)) mismatches.push(`${label} ${r.id}: missing in saved report`);
    }
  };
  checkRows(
    "order",
    (report.orders ?? []).map((o) => ({ id: o.orderId, state: o.state, timestamps: o.timestamps as Record<string, number> })),
    s.orders.map((o) => ({ id: o.orderId, state: o.state, timestamps: o.timestamps as Record<string, number> })),
    true,
  );
  checkRows(
    "delivery",
    (report.deliveries ?? []).map((d) => ({ id: d.deliveryId, state: d.state, timestamps: d.timestamps as Record<string, number> | undefined })),
    s.deliveries.map((d) => ({ id: d.deliveryId, state: d.state, timestamps: d.timestamps as Record<string, number> })),
    true,
  );
  const metrics = operationsRunMetrics(s, stage);
  if (report.totalWaitMs !== undefined && report.totalWaitMs !== metrics.totalWaitMs) {
    mismatches.push(`totalWaitMs: report ${String(report.totalWaitMs)} != recomputed ${metrics.totalWaitMs}`);
  }
  if (report.makespanMs !== undefined && report.makespanMs !== metrics.makespanMs) {
    mismatches.push(`makespanMs: report ${String(report.makespanMs)} != recomputed ${String(metrics.makespanMs)}`);
  }
  if (report.lastShippedAtMs !== undefined && report.lastShippedAtMs !== metrics.lastShippedAtMs) {
    mismatches.push(`lastShippedAtMs: report ${String(report.lastShippedAtMs)} != recomputed ${String(metrics.lastShippedAtMs)}`);
  }
  for (const key of ["conservation", "capacity", "safety"] as const) {
    const savedChecks = report.checks?.[key];
    if (!Array.isArray(savedChecks) || JSON.stringify(savedChecks) !== JSON.stringify(s.checks[key])) {
      mismatches.push(`checks.${key}: report ${JSON.stringify(savedChecks)} != recomputed ${JSON.stringify(s.checks[key])}`);
    }
  }
  if (report.termination) {
    const t = report.termination;
    const run = scenario.policies.run;
    if (t.mode !== run.mode) mismatches.push(`termination.mode: report ${String(t.mode)} != scenario ${run.mode}`);
    const wantHorizon = run.mode === "fixed-window" ? run.horizonMs : null;
    const wantCutoff = run.mode === "finite-cohort" ? run.arrivalCutoffMs : null;
    if (t.horizonMs !== wantHorizon) mismatches.push(`termination.horizonMs: report ${String(t.horizonMs)} != scenario ${String(wantHorizon)}`);
    if (t.arrivalCutoffMs !== wantCutoff) mismatches.push(`termination.arrivalCutoffMs: report ${String(t.arrivalCutoffMs)} != scenario ${String(wantCutoff)}`);
    if (hasClock && t.stopClockMs !== report.clockMs) mismatches.push(`termination.stopClockMs: report ${String(t.stopClockMs)} != clockMs ${String(report.clockMs)}`);
    if (t.stopClockMs !== s.clockMs) mismatches.push(`termination.stopClockMs: report ${String(t.stopClockMs)} != recomputed clock ${s.clockMs}`);
    if (
      t.safetyCeilingMs !== null &&
      (typeof t.safetyCeilingMs !== "number" || !Number.isSafeInteger(t.safetyCeilingMs) || t.safetyCeilingMs < 1 || t.safetyCeilingMs > MAX_TIME_MS)
    ) {
      mismatches.push(`termination.safetyCeilingMs: invalid ceiling ${String(t.safetyCeilingMs)}`);
    }
    // Declared termination must be complete and consistent with the actual
    // replayed stop: a ceiling below the stop clock is impossible evidence,
    // a safety-ceiling stop lands exactly on its ceiling, and the stop
    // reason must match the recomputed stage. Missing fields are rejected,
    // never defaulted.
    const STOP_REASONS = ["stage-complete", "blocked", "window-ended", "safety-ceiling", "no-progress", "caller-stopped"];
    if (t.stopReason === undefined) {
      mismatches.push("termination.stopReason: missing declared stop reason");
    } else if (!STOP_REASONS.includes(t.stopReason)) {
      mismatches.push(`termination.stopReason: invalid stop reason ${String(t.stopReason)}`);
    }
    if (t.safetyCeilingMs === undefined) {
      mismatches.push("termination.safetyCeilingMs: missing declared ceiling (null means caller drove the clock)");
    }
    if (typeof t.stopClockMs !== "number" || !Number.isSafeInteger(t.stopClockMs)) {
      mismatches.push(`termination.stopClockMs: missing or invalid stop clock ${String(t.stopClockMs)}`);
    }
    if (typeof t.safetyCeilingMs === "number" && typeof t.stopClockMs === "number" && t.safetyCeilingMs < t.stopClockMs) {
      mismatches.push(`termination.safetyCeilingMs: ceiling ${t.safetyCeilingMs} is below the actual stop clock ${t.stopClockMs} (impossible ceiling)`);
    }
    if (t.stopReason === "safety-ceiling") {
      if (typeof t.safetyCeilingMs !== "number") {
        mismatches.push("termination: stopReason safety-ceiling requires a numeric safetyCeilingMs");
      } else if (t.safetyCeilingMs !== t.stopClockMs) {
        mismatches.push(`termination: safety-ceiling stop must land on its ceiling ${t.safetyCeilingMs}, saved stop clock is ${String(t.stopClockMs)}`);
      }
    }
    // A numeric ceiling is driver evidence: reconstruct the run driver on
    // a fresh controller and require the declared stop to match it exactly,
    // so no-progress (or any reason) is evidenced, not freely asserted.
    if (typeof t.safetyCeilingMs === "number" && Number.isSafeInteger(t.safetyCeilingMs) && t.safetyCeilingMs >= 1 && t.safetyCeilingMs <= MAX_TIME_MS) {
      try {
        const driver = createOperationsController({ scenario: report.scenario, executionConfig: report.executionConfig });
        const driven = runOperationsToTermination(driver, t.safetyCeilingMs);
        if (driven.stopClockMs !== t.stopClockMs) mismatches.push(`termination.stopClockMs: declared ${String(t.stopClockMs)} != driver-reconstructed ${driven.stopClockMs} at ceiling ${t.safetyCeilingMs}`);
        if (driven.stopReason !== t.stopReason) mismatches.push(`termination.stopReason: declared ${String(t.stopReason)} != driver-reconstructed ${driven.stopReason} at ceiling ${t.safetyCeilingMs}`);
      } catch (e) {
        mismatches.push(`termination: driver reconstruction failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
    // A bare export (null ceiling) has no driver evidence: only the actual
    // stage reason, or caller-stopped while in progress, may be claimed.
    if (t.safetyCeilingMs === null && (t.stopReason === "no-progress" || t.stopReason === "safety-ceiling")) {
      mismatches.push(`termination.stopReason: ${String(t.stopReason)} cannot be asserted without run-driver evidence (declare a numeric safetyCeilingMs)`);
    }
    const reasonForStage =
      stage === "SUPPORTED_STAGE_COMPLETE" ? ["stage-complete"]
      : stage === "BLOCKED" ? ["blocked"]
      : stage === "WINDOW_ENDED" ? ["window-ended"]
      : ["safety-ceiling", "no-progress", "caller-stopped"];
    if (STOP_REASONS.includes(t.stopReason) && !reasonForStage.includes(t.stopReason)) {
      mismatches.push(`termination.stopReason: saved ${String(t.stopReason)} is inconsistent with recomputed stage ${stage}`);
    }
  }
  return { ok: mismatches.length === 0, recomputedStage: stage, recomputedCounts: rc, recomputedClockMs: s.clockMs, mismatches };
}

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
  dispatchResourceId: string | null;
  jobId: string | null;
  queueSlotId: string | null;
  queueRequestMs: number | null;
  jobEnqueued: boolean;
  partialTrips: number;
  dispatchJobId: string | null;
  dispatchEnqueued: boolean;
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
  | { kind: "to-receive"; deliveryId: string; resourceId: string }
  | { kind: "collecting"; deliveryId: string; resourceId: string; productId: string; quantity: number }
  | { kind: "awaiting-location"; deliveryId: string }
  | { kind: "yield-to-parking"; deliveryId: string }
  | { kind: "to-store"; deliveryId: string; locationId: string }
  | { kind: "storing"; deliveryId: string; locationId: string }
  | { kind: "to-parking" };

type DeliveryRuntime = {
  idx: number;
  deliveryId: string;
  arrivalTimeMs: number;
  lines: { productId: string; quantity: number }[];
  created: boolean;
  state: DeliveryLifecycleState;
  timestamps: Partial<Record<DeliveryLifecycleState, number>>;
  receivingResourceId: string | null;
  receivingJobId: string | null;
  jobEnqueued: boolean;
  serviceDone: boolean;
  waitReason: string | null;
};

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
  // Inbound: scheduled deliveries arrive externally, are accepted into
  // finite receiving staging through the receiving lane(s), and put-away
  // units store them into canonical locations before orders can reserve
  // that stock. Deliveries never teleport into storage.
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
  // Dispatch is optional: with no dispatch resource, packed orders honestly
  // remain READY_FOR_DISPATCH. With one, the same single-lane discipline as
  // packing applies (split lanes into separate stations instead).
  const dispatchConfigs = scenario.resources.filter((r) => r.kind === "dispatch");
  for (const cfg of dispatchConfigs) {
    if (cfg.servicePositions.length > 1 || cfg.serviceCapacity > 1) {
      throw new Error(
        `unsupported capability [UNSUPPORTED_MULTILANE]: dispatch is single-lane-per-station; ` +
          `resource ${cfg.id} advertises ${cfg.servicePositions.length} service position(s) / capacity ${cfg.serviceCapacity}; ` +
          `split lanes into separate single-lane stations or await per-position admission`,
      );
    }
  }
  const dispatchConfigById = new Map(dispatchConfigs.map((r) => [r.id, r]));
  const receivingConfigs = scenario.resources.filter((r) => r.kind === "receiving");
  for (const cfg of receivingConfigs) {
    if (cfg.servicePositions.length > 1 || cfg.serviceCapacity > 1) {
      throw new Error(
        `unsupported capability [UNSUPPORTED_MULTILANE]: receiving is single-lane-per-station; ` +
          `resource ${cfg.id} advertises ${cfg.servicePositions.length} service position(s) / capacity ${cfg.serviceCapacity}`,
      );
    }
  }
  const receivingConfigById = new Map(receivingConfigs.map((r) => [r.id, r]));
  if (scenario.deliverySchedule.length > 0 && receivingConfigs.length === 0) {
    throw new Error(
      "unsupported capability [UNSUPPORTED_DELIVERIES]: scenario schedules inbound deliveries but configures no receiving resource",
    );
  }

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
    dispatchStations: Map<string, ServiceStation>;
    receivingStations: Map<string, ServiceStation>;
    receivingCoords: Map<string, MoveDestination>;
    deliveries: Map<string, DeliveryRuntime>;
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
        dispatchResourceId: null,
        jobId: null,
        queueSlotId: null,
        queueRequestMs: null,
        jobEnqueued: false,
        partialTrips: 0,
        dispatchJobId: null,
        dispatchEnqueued: false,
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
      dispatchStations: new Map(
        dispatchConfigs.map((cfg) => [cfg.id, createServiceStation(cfg)]),
      ),
      receivingStations: new Map(
        receivingConfigs.map((cfg) => [cfg.id, createServiceStation(cfg)]),
      ),
      receivingCoords: new Map(
        receivingConfigs.map((cfg) => [
          cfg.id,
          { x: cfg.servicePositions[0]!.x, z: cfg.servicePositions[0]!.z },
        ]),
      ),
      deliveries: new Map(
        scenario.deliverySchedule.map((d, idx) => [
          d.id,
          {
            idx,
            deliveryId: d.id,
            arrivalTimeMs: d.arrivalTimeMs,
            lines: d.lines.map((l) => ({ ...l })),
            created: false,
            state: "RECEIVING" as DeliveryLifecycleState,
            timestamps: {},
            receivingResourceId: null,
            receivingJobId: null,
            jobEnqueued: false,
            serviceDone: false,
            waitReason: null,
          },
        ]),
      ),
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
          // Split-trip: an order larger than one cart is carried in several
          // capacity-bounded trips. Only an order whose single items exceed
          // every eligible cart can never move.
          const maxItemCost = Math.max(
            ...rt.lines.map((l) => productCost.get(l.productId) ?? 0),
          );
          const fits = eligible.some(
            (id) => (unitCapacity.get(id) ?? 0) >= maxItemCost,
          );
          if (!fits) {
            diagnose(
              rt,
              "UNSUPPORTED_SINGLE_TRIP_REQUIRED",
              `order ${rt.orderId} has items costing ${maxItemCost} handling-cost units; ` +
                `no eligible picker can carry even one item; held with zero reservation`,
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
        const maxItemCost = Math.max(
          ...rt.lines.map((l) => productCost.get(l.productId) ?? 0),
        );
        const candidates = eligiblePickersFor(rt).filter(
          (id) =>
            (unitCapacity.get(id) ?? 0) >= maxItemCost &&
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
        // Split legs into cart-bounded chunks for the assigned picker, so a
        // leg larger than one cart is picked across several trips.
        {
          const cap = unitCapacity.get(unitId) ?? 0;
          const chunked: PickLeg[] = [];
          for (const leg of rt.legs) {
            const cost = productCost.get(leg.productId) ?? 0;
            const perTrip = cost > 0 ? Math.max(1, Math.floor(cap / cost)) : leg.quantity;
            let remaining = leg.quantity;
            while (remaining > 0) {
              const qty = Math.min(remaining, perTrip);
              chunked.push({ ...leg, quantity: qty, committed: false });
              remaining -= qty;
            }
          }
          rt.legs = chunked;
        }
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
      tryAdvanceReceiving(now);
      tryAdvancePutAway(now);
      tryAdvanceDispatch(now);
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
      const pendingPutAwayWork = [...S.deliveries.values()].some(
        (d) =>
          d.created &&
          (d.state === "PUTAWAY_PENDING" || d.state === "PUTAWAY") &&
          deliveryReceivingRemaining(d.deliveryId) > 0,
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
      // Put-away units vacate storage/receiving positions once no staged
      // inbound remains, so pickers can reach the same approaches.
      if (!pendingPutAwayWork) {
        for (const unit of S.units.values()) {
          if (unit.role !== "putaway" || unit.task.kind !== "idle") continue;
          const home = unitParking.get(unit.unitId) as MoveDestination;
          const pose = transportUnitById(unit.unitId).pose;
          if (posesEqual(pose, home)) continue;
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
      const carriedRow = S.store.snapshot().carried.find((c) => c.unitId === unitId);
      const carriedItems = (carriedRow?.loads ?? []).reduce((n, l) => n + l.quantity, 0);
      const at = now + carriedItems * executionConfig.unloadDurationMsPerItem;
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
      record(now, "UNLOAD_STARTED", rt.orderId, unitId, `${carriedItems} carried item(s) at ${resourceId}`);
      S.kernel.schedule({
        id: `ops-unload-${rt.idx}-t${rt.partialTrips}`,
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
      // Transfer only what the cart physically carries (one split-trip load).
      const carriedRow = S.store.snapshot().carried.find((c) => c.unitId === unitId);
      const loads = (carriedRow?.loads ?? []).filter((l) => l.quantity > 0);
      const carriedItems = loads.reduce((n, l) => n + l.quantity, 0);
      const carriedCost = loads.reduce(
        (n, l) => n + (productCost.get(l.productId) ?? 0) * l.quantity,
        0,
      );
      if (carriedItems === 0) return;
      const staged = packingStagedUnits(resourceId);
      if (staged + carriedCost > cfg.inputStagingCapacity) {
        unit.task = { kind: "awaiting-staging", orderId: rt.orderId, resourceId };
        rt.waitReason = "PACKING_STAGING_FULL";
        openWait(
          unitId,
          rt.orderId,
          "PACKING_STAGING_FULL",
          `${resourceId} staging ${staged}/${cfg.inputStagingCapacity} cost units; ` +
            `load needs ${carriedCost}; holding service position with load`,
          now,
        );
        return;
      }
      loads.forEach((load) => {
        S.store.transferToPacking({
          eventId: `inv-xfer-${rt.idx}-t${rt.partialTrips}-${load.productId}`,
          timeMs: now,
          orderId: rt.orderId,
          unitId,
          resourceId,
          productId: load.productId,
          quantity: load.quantity,
        });
      });
      rt.waitReason = null;
      closeWaitsFor(unitId, rt.orderId, now);
      if (rt.legsDone < rt.legs.length) {
        // Split-trip: stage this load, then return for the remaining legs.
        // Packing service starts only after the final trip stages the rest.
        rt.partialTrips += 1;
        record(now, "PARTIAL_UNLOAD_COMMITTED", rt.orderId, unitId, `trip ${rt.partialTrips}: ${carriedItems} item(s) staged at ${resourceId}; ${rt.legs.length - rt.legsDone} leg(s) remain`);
        const next = rt.legs[rt.legsDone] as PickLeg;
        const pose = transportUnitById(unitId).pose;
        unit.task = { kind: "to-pick", orderId: rt.orderId, legIndex: rt.legsDone };
        if (posesEqual(pose, next.approach)) {
          unit.task = { kind: "picking", orderId: rt.orderId, legIndex: rt.legsDone };
          schedulePickCompletion(unitId, rt, rt.legsDone, now);
          return;
        }
        const mv = requestUnitMove(unitId, next.approach, now, rt.orderId, `pick-leg-${rt.legsDone}:${next.locationId}`);
        if (mv.status === "rejected") {
          diagnose(
            rt,
            "UNREACHABLE_APPROACH",
            `static route back to ${next.locationId} approach rejected (${mv.reason}); staged load retained`,
            true,
            now,
          );
        }
        return;
      }
      rt.unloadCommitted = true;
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

    // Dispatch: packed orders queue FIFO on the configured dispatch lane(s)
    // and ship only at dispatch-service completion. Packed stock stays in
    // finite packing output staging until the ship commit frees it. With no
    // dispatch resource configured, READY_FOR_DISPATCH remains terminal.
    const tryAdvanceDispatch = (now: number): void => {
      if (S.dispatchStations.size === 0) return;
      const ready = [...S.orders.values()]
        .filter((o) => o.created && o.state === "READY_FOR_DISPATCH" && o.packed)
        .sort(
          (a, b) =>
            (a.timestamps.READY_FOR_DISPATCH ?? 0) -
              (b.timestamps.READY_FOR_DISPATCH ?? 0) || a.idx - b.idx,
        );
      for (const rt of ready) {
        if (!rt.dispatchEnqueued) {
          let bestId: string | null = null;
          let bestLoad = Number.POSITIVE_INFINITY;
          for (const [id, station] of S.dispatchStations) {
            const load = station
              .snapshot()
              .jobs.filter(
                (j) => j.state === "queued" || j.state === "in-service",
              ).length;
            if (load < bestLoad || (load === bestLoad && (bestId === null || id < bestId))) {
              bestId = id;
              bestLoad = load;
            }
          }
          if (bestId === null) return;
          const station = S.dispatchStations.get(bestId) as ServiceStation;
          const jobId = `dsp-job-${rt.idx}`;
          const enq = station.enqueue({ jobId, enqueueTimeMs: now });
          if (enq.status === "waiting-outside") {
            rt.waitReason = "DISPATCH_QUEUE_FULL";
            openWait(
              null,
              rt.orderId,
              "DISPATCH_QUEUE_FULL",
              `dispatch queues full; packed output retained at ${rt.packingResourceId}`,
              now,
            );
            continue;
          }
          rt.dispatchEnqueued = true;
          rt.dispatchJobId = jobId;
          rt.dispatchResourceId = bestId;
          record(now, "DISPATCH_QUEUED", rt.orderId, null, `queued on ${bestId}`);
        }
        const station = S.dispatchStations.get(
          rt.dispatchResourceId as string,
        ) as ServiceStation;
        const job = station
          .snapshot()
          .jobs.find((j) => j.jobId === rt.dispatchJobId);
        if (!job || job.state !== "queued") continue;
        const head = station
          .snapshot()
          .jobs.filter((j) => j.state === "queued")
          .sort(
            (a, b) =>
              a.enqueueTimeMs - b.enqueueTimeMs ||
              (a.jobId < b.jobId ? -1 : 1),
          )[0];
        if (head?.jobId !== rt.dispatchJobId) {
          rt.waitReason = "DISPATCH_QUEUED_BEHIND_HEAD";
          continue;
        }
        const started = station.tryStart({
          jobId: rt.dispatchJobId as string,
          timeMs: now,
          inputReady: true,
        });
        if (started.status === "waiting") {
          rt.waitReason = `DISPATCH_WAIT_${started.reason}`;
          continue;
        }
        rt.waitReason = null;
        closeWaitsFor(null, rt.orderId, now);
        record(
          now,
          "DISPATCH_STARTED",
          rt.orderId,
          null,
          `${rt.dispatchJobId} at ${rt.dispatchResourceId} position ${started.positionId}`,
        );
        const cfg = dispatchConfigById.get(rt.dispatchResourceId as string);
        const at = now + (cfg?.serviceDurationMs ?? 0);
        if (at > MAX_TIME_MS) {
          diagnose(
            rt,
            "TIME_BOUND_EXCEEDED",
            `dispatch service for ${rt.orderId} exceeds the ${MAX_TIME_MS}ms horizon bound; packed output retained`,
            true,
            now,
          );
          continue;
        }
        S.kernel.schedule({
          id: `ops-dispatch-done-${rt.idx}`,
          timeMs: at,
          priority: EVENT_PRIORITY.COMPLETION,
          kind: "DISPATCH_COMPLETED",
          data: { orderIdx: rt.idx },
        });
      }
    };

    const onDispatchCompleted = (event: KernelEventView, now: number): void => {
      const data = event.data as { orderIdx?: unknown } | null;
      const orderIdx = typeof data?.orderIdx === "number" ? data.orderIdx : null;
      if (orderIdx === null) return;
      const spec = scenario.orderSchedule[orderIdx];
      const rt = spec ? S.orders.get(spec.id) : undefined;
      if (!rt || !rt.created) {
        record(now, "STALE_IGNORED", null, null, "dispatch completion for unknown order; no mutation");
        return;
      }
      const station = rt.dispatchResourceId
        ? S.dispatchStations.get(rt.dispatchResourceId)
        : undefined;
      const job = station
        ?.snapshot()
        .jobs.find((j) => j.jobId === rt.dispatchJobId);
      if (
        rt.state !== "READY_FOR_DISPATCH" ||
        !rt.packed ||
        !station ||
        !job ||
        job.state !== "in-service"
      ) {
        record(now, "STALE_IGNORED", rt.orderId, null, "unexpected dispatch completion; no mutation");
        return;
      }
      station.completeService({
        jobId: rt.dispatchJobId as string,
        timeMs: now,
        outputBlocked: false,
      });
      S.store.dispatchOrder({
        eventId: `inv-dispatch-${rt.idx}`,
        timeMs: now,
        orderId: rt.orderId,
      });
      // Free the finite packing output this order occupied.
      if (rt.packingResourceId) {
        const res = S.resources.get(rt.packingResourceId);
        if (res && res.packedOutput.has(rt.orderId)) {
          res.packedOutput.delete(rt.orderId);
          res.outputUsed -= rt.totalCostUnits;
        }
      }
      rt.waitReason = null;
      closeWaitsFor(null, rt.orderId, now);
      transition(rt, "SHIPPED", now, null, `dispatched via ${rt.dispatchResourceId}; goods left the warehouse`);
      requestDispatch(now);
    };

    // Route a loaded picker to its packing station. The first trip creates
    // and enqueues the packing job; split-trip returns rejoin that job.
    const deliverToPacking = (unitId: string, rt: OrderRuntime, now: number): void => {
      if (rt.state === "PICKING") {
        transition(rt, "WAITING_FOR_PACKING", now, unitId, `carrying load toward packing (trip ${rt.partialTrips + 1})`);
      }
      if (!rt.packingResourceId) {
        rt.packingResourceId = choosePackingResource();
      }
      const res = S.resources.get(rt.packingResourceId) as ResourceRuntime;
      if (!rt.jobEnqueued) {
        tryEnqueue(rt, res, now);
        return;
      }
      const unit = S.units.get(unitId) as UnitRuntime;
      unit.task = { kind: "awaiting-head", orderId: rt.orderId, resourceId: res.resourceId };
      releaseToQueue(rt, res, now);
    };

    // ---- Inbound: receiving acceptance + put-away orchestration ----
    const receivingStagedCost = (resourceId: string): number => {
      let total = 0;
      for (const row of S.store.snapshot().receiving) {
        if (row.resourceId !== resourceId) continue;
        total += (productCost.get(row.productId) ?? 0) * row.quantity;
      }
      return total;
    };

    const deliveryExternalRemaining = (deliveryId: string): number => {
      let total = 0;
      for (const row of S.store.snapshot().externalPending) {
        if (row.deliveryId === deliveryId) total += row.quantity;
      }
      return total;
    };

    const deliveryReceivingRemaining = (deliveryId: string): number => {
      let total = 0;
      for (const row of S.store.snapshot().receiving) {
        if (row.deliveryId === deliveryId) total += row.quantity;
      }
      return total;
    };

    // Accept as much of the delivery as finite receiving staging holds.
    // Returns true when nothing remains external.
    const tryAcceptInbound = (dt: DeliveryRuntime, now: number): boolean => {
      const resourceId = dt.receivingResourceId as string;
      const cfg = receivingConfigById.get(resourceId);
      if (!cfg) return false;
      let staged = receivingStagedCost(resourceId);
      for (const line of dt.lines) {
        const pending =
          S.store
            .snapshot()
            .externalPending.find(
              (r) => r.deliveryId === dt.deliveryId && r.productId === line.productId,
            )?.quantity ?? 0;
        if (pending <= 0) continue;
        const cost = productCost.get(line.productId) ?? 0;
        const fits =
          cost > 0
            ? Math.max(0, Math.floor((cfg.outputStagingCapacity - staged) / cost))
            : pending;
        const qty = Math.min(pending, fits);
        if (qty <= 0) continue;
        S.store.acceptInbound({
          eventId: `inv-accept-${dt.idx}-${line.productId}-${now}`,
          timeMs: now,
          deliveryId: dt.deliveryId,
          resourceId,
          productId: line.productId,
          quantity: qty,
        });
        staged += cost * qty;
        record(now, "INBOUND_ACCEPTED", null, null, `${dt.deliveryId} ${line.productId}x${qty} into ${resourceId} staging`);
      }
      return deliveryExternalRemaining(dt.deliveryId) === 0;
    };

    const finishReceivingIfAccepted = (dt: DeliveryRuntime, now: number): void => {
      if (!dt.serviceDone || dt.state !== "RECEIVING") return;
      if (!tryAcceptInbound(dt, now)) {
        dt.waitReason = "RECEIVING_STAGING_FULL";
        openWait(null, null, "RECEIVING_STAGING_FULL", `${dt.deliveryId} waits for receiving staging space`, now);
        return;
      }
      const station = S.receivingStations.get(dt.receivingResourceId as string);
      const job = station?.snapshot().jobs.find((j) => j.jobId === dt.receivingJobId);
      if (station && job?.state === "in-service") {
        station.completeService({ jobId: dt.receivingJobId as string, timeMs: now, outputBlocked: false });
      }
      dt.waitReason = null;
      closeWaitsFor(null, null, now);
      dt.state = "PUTAWAY_PENDING";
      dt.timestamps.PUTAWAY_PENDING = now;
      record(now, "RECEIVING_DONE", null, null, `${dt.deliveryId} fully accepted; put-away pending`);
      requestDispatch(now);
    };

    const tryAdvanceReceiving = (now: number): void => {
      for (const dt of S.deliveries.values()) {
        if (!dt.created || dt.state !== "RECEIVING") continue;
        if (dt.serviceDone) {
          finishReceivingIfAccepted(dt, now);
          continue;
        }
        if (!dt.jobEnqueued) {
          let bestId: string | null = null;
          let bestLoad = Number.POSITIVE_INFINITY;
          for (const [id, station] of S.receivingStations) {
            const load = station.snapshot().jobs.filter((j) => j.state === "queued" || j.state === "in-service").length;
            if (load < bestLoad || (load === bestLoad && (bestId === null || id < bestId))) {
              bestId = id;
              bestLoad = load;
            }
          }
          if (bestId === null) return;
          const station = S.receivingStations.get(bestId) as ServiceStation;
          const jobId = `rcv-job-${dt.idx}`;
          const enq = station.enqueue({ jobId, enqueueTimeMs: now });
          if (enq.status === "waiting-outside") {
            dt.waitReason = "RECEIVING_QUEUE_FULL";
            continue;
          }
          dt.jobEnqueued = true;
          dt.receivingJobId = jobId;
          dt.receivingResourceId = bestId;
          record(now, "RECEIVING_QUEUED", null, null, `${dt.deliveryId} queued on ${bestId}`);
        }
        const station = S.receivingStations.get(dt.receivingResourceId as string) as ServiceStation;
        const job = station.snapshot().jobs.find((j) => j.jobId === dt.receivingJobId);
        if (!job || job.state !== "queued") continue;
        const started = station.tryStart({ jobId: dt.receivingJobId as string, timeMs: now, inputReady: true });
        if (started.status === "waiting") {
          dt.waitReason = `RECEIVING_WAIT_${started.reason}`;
          continue;
        }
        dt.waitReason = null;
        record(now, "RECEIVING_STARTED", null, null, `${dt.deliveryId} at ${dt.receivingResourceId}`);
        const cfg = receivingConfigById.get(dt.receivingResourceId as string);
        const at = now + (cfg?.serviceDurationMs ?? 0);
        if (at > MAX_TIME_MS) continue;
        S.kernel.schedule({
          id: `ops-receive-done-${dt.idx}`,
          timeMs: at,
          priority: EVENT_PRIORITY.COMPLETION,
          kind: "RECEIVE_COMPLETED",
          data: { deliveryIdx: dt.idx },
        });
      }
    };

    const carriedCostOf = (unitId: string): number => {
      const row = S.store.snapshot().carried.find((c) => c.unitId === unitId);
      let total = 0;
      for (const load of row?.loads ?? []) {
        total += (productCost.get(load.productId) ?? 0) * load.quantity;
      }
      return total;
    };

    // Put-away liveness helpers (private r3-liveness hardening).
    const closePutAwayWait = (unitId: string, endMs: number): void => {
      for (const w of S.waits) {
        if (w.endMs === null && w.unitId === unitId && w.reason === "PUTAWAY_NO_LOCATION") {
          w.endMs = endMs;
        }
      }
    };

    const freeAtLocation = (locationId: string, productId: string): number => {
      const cfg = scenario.locations.find((l) => l.id === locationId);
      if (!cfg) return 0;
      const slot = S.store.snapshot().storage.find((r) => r.locationId === locationId);
      if (!slot) return 0;
      if (slot.productId !== null && slot.productId !== productId) return 0;
      return Math.max(0, cfg.maxQuantity - slot.quantity);
    };

    // Largest q in 1..desired that one eligible slot can take right now.
    const placeableQty = (productId: string, desired: number): number => {
      for (let q = Math.min(desired, Number.MAX_SAFE_INTEGER); q >= 1; q -= 1) {
        if (q > desired) continue;
        if (S.store.selectPutAwayLocation(productId, q).status === "selectable") return q;
      }
      return 0;
    };

    const stagedRowsInDeliveryOrder = (
      dt: DeliveryRuntime,
      resourceId?: string,
    ): { deliveryId: string; resourceId: string; productId: string; quantity: number }[] => {
      const order = new Map(dt.lines.map((l, i) => [l.productId, i] as const));
      return S.store
        .snapshot()
        .receiving.filter(
          (r) =>
            r.deliveryId === dt.deliveryId &&
            r.quantity > 0 &&
            (resourceId === undefined || r.resourceId === resourceId),
        )
        .sort(
          (a, b) =>
            (order.get(a.productId) ?? 999) - (order.get(b.productId) ?? 999) ||
            (a.productId < b.productId ? -1 : 1),
        );
    };

    // First placeable staged row of this delivery (declared line order).
    // Quantities another unit is already collecting for the same staged row
    // are claimed: they leave staging only at collect completion, so sizing
    // against the raw staged quantity would double-assign the same items.
    const choosePlaceableCollect = (
      dt: DeliveryRuntime,
      unitId: string,
      resourceId?: string,
    ): { resourceId: string; productId: string; quantity: number } | null => {
      const capacity = unitCapacity.get(unitId) ?? 0;
      const carried = carriedCostOf(unitId);
      for (const row of stagedRowsInDeliveryOrder(dt, resourceId)) {
        let claimed = 0;
        for (const other of S.units.values()) {
          if (other.unitId === unitId) continue;
          if (
            other.task.kind === "collecting" &&
            other.task.deliveryId === dt.deliveryId &&
            other.task.productId === row.productId &&
            other.task.resourceId === row.resourceId
          ) {
            claimed += other.task.quantity;
          }
        }
        const available = row.quantity - claimed;
        if (available <= 0) continue;
        const cost = productCost.get(row.productId) ?? 0;
        const fits = cost > 0 ? Math.floor((capacity - carried) / cost) : available;
        if (fits <= 0) continue;
        const qty = placeableQty(row.productId, Math.min(available, fits));
        if (qty > 0) return { resourceId: row.resourceId, productId: row.productId, quantity: qty };
      }
      return null;
    };

    const schedulePutAwayHandling = (
      unitId: string,
      dt: DeliveryRuntime,
      phase: "collect" | "place",
      quantity: number,
      locationId: string | null,
      now: number,
    ): void => {
      const at = now + quantity * executionConfig.pickDurationMsPerItem;
      if (at > MAX_TIME_MS) return;
      record(now, phase === "collect" ? "PUTAWAY_COLLECT_STARTED" : "PUTAWAY_PLACE_STARTED", null, unitId, `${dt.deliveryId} ${quantity} item(s)${locationId ? ` -> ${locationId}` : ""}`);
      S.kernel.schedule({
        id: `ops-putaway-${phase}-${unitId}-${dt.idx}-${now}`,
        timeMs: at,
        priority: EVENT_PRIORITY.COMPLETION,
        kind: "PUTAWAY_COMPLETED",
        data: { unitId, deliveryIdx: dt.idx, phase, locationId },
      });
    };

    const tryAdvancePutAway = (now: number): void => {
      // Retry units holding a collected load with no eligible location yet.
      for (const unit of S.units.values()) {
        if (unit.task.kind === "yield-to-parking") continue;
        if (unit.task.kind !== "awaiting-location") continue;
        const carriedRow = S.store.snapshot().carried.find((c) => c.unitId === unit.unitId);
        const load = carriedRow?.loads.find((l) => l.quantity > 0);
        if (!load) {
          closePutAwayWait(unit.unitId, now);
          unit.task = { kind: "idle" };
          continue;
        }
        const snap = transportUnitById(unit.unitId);
        if (snap.state !== "idle") continue;
        const dt = S.deliveries.get(unit.task.deliveryId) as DeliveryRuntime;
        const fitQty = placeableQty(load.productId, load.quantity);
        if (fitQty <= 0) {
          dt.waitReason = "PUTAWAY_NO_LOCATION";
          openWait(unit.unitId, null, "PUTAWAY_NO_LOCATION", `${load.productId} has no eligible storage location yet`, now);
          const home = unitParking.get(unit.unitId);
          if (home && !posesEqual(snap.pose, home)) {
            const mv = requestUnitMove(unit.unitId, home, now, null, "putaway-blocked-parking");
            if (mv.status !== "rejected") {
              unit.task = { kind: "yield-to-parking", deliveryId: dt.deliveryId };
              closePutAwayWait(unit.unitId, now);
            }
          }
          continue;
        }
        const sel = S.store.selectPutAwayLocation(load.productId, fitQty);
        if (sel.status !== "selectable") continue;
        const dest = locationApproach.get(sel.locationId) as MoveDestination;
        closePutAwayWait(unit.unitId, now);
        dt.waitReason = null;
        if (posesEqual(snap.pose, dest)) {
          const placeQty = Math.min(load.quantity, freeAtLocation(sel.locationId, load.productId));
          if (placeQty <= 0) {
            dt.waitReason = "PUTAWAY_NO_LOCATION";
            openWait(unit.unitId, null, "PUTAWAY_NO_LOCATION", `${load.productId} has no eligible storage location yet`, now);
            continue;
          }
          unit.task = { kind: "storing", deliveryId: dt.deliveryId, locationId: sel.locationId };
          schedulePutAwayHandling(unit.unitId, dt, "place", placeQty, sel.locationId, now);
        } else {
          const mv = requestUnitMove(unit.unitId, dest, now, null, `putaway-store:${sel.locationId}`);
          if (mv.status === "rejected") {
            dt.waitReason = "PUTAWAY_NO_LOCATION";
            openWait(unit.unitId, null, "PUTAWAY_NO_LOCATION", `${load.productId} has no eligible storage location yet`, now);
            continue;
          }
          unit.task = { kind: "to-store", deliveryId: dt.deliveryId, locationId: sel.locationId };
        }
      }
      for (const unit of S.units.values()) {
        if (unit.role !== "putaway" || unit.task.kind !== "idle") continue;
        // Oldest delivery with staged goods wins (FIFO by arrival, then idx).
        const candidates = [...S.deliveries.values()]
          .filter((d) => d.created && (d.state === "RECEIVING" || d.state === "PUTAWAY_PENDING" || d.state === "PUTAWAY") && deliveryReceivingRemaining(d.deliveryId) > 0)
          .sort((a, b) => a.arrivalTimeMs - b.arrivalTimeMs || a.idx - b.idx);
        const dt = candidates[0];
        if (!dt) return;
        const chosen = choosePlaceableCollect(dt, unit.unitId);
        if (!chosen) continue;
        if (dt.state === "PUTAWAY_PENDING") {
          dt.state = "PUTAWAY";
          dt.timestamps.PUTAWAY = now;
        }
        // A delivery still in RECEIVING keeps that state until acceptance
        // completes; put-away draining happens concurrently.
        dt.waitReason = null;
        unit.task = { kind: "to-receive", deliveryId: dt.deliveryId, resourceId: chosen.resourceId };
        const dest = S.receivingCoords.get(chosen.resourceId) as MoveDestination;
        const pose = transportUnitById(unit.unitId).pose;
        if (posesEqual(pose, dest)) {
          unit.task = { kind: "collecting", deliveryId: dt.deliveryId, resourceId: chosen.resourceId, productId: chosen.productId, quantity: chosen.quantity };
          schedulePutAwayHandling(unit.unitId, dt, "collect", chosen.quantity, null, now);
        } else {
          const mv = requestUnitMove(unit.unitId, dest, now, null, `putaway-collect:${dt.deliveryId}`);
          if (mv.status === "rejected") {
            unit.task = { kind: "idle" };
          } else {
            unit.task = { kind: "to-receive", deliveryId: dt.deliveryId, resourceId: chosen.resourceId };
          }
        }
      }
    };

    const onDeliveryArrival = (event: KernelEventView, now: number): void => {
      const data = event.data as { deliveryId?: unknown } | null;
      const deliveryId = typeof data?.deliveryId === "string" ? data.deliveryId : null;
      const dt = deliveryId ? S.deliveries.get(deliveryId) : undefined;
      if (!dt || dt.created) {
        record(now, "STALE_IGNORED", null, null, "unknown or duplicate delivery arrival; no mutation");
        return;
      }
      dt.created = true;
      dt.timestamps.RECEIVING = now;
      record(now, "DELIVERY_ARRIVED", null, null, `${dt.deliveryId} arrived with ${dt.lines.length} line(s)`);
      requestDispatch(now);
    };

    const onReceiveCompleted = (event: KernelEventView, now: number): void => {
      const data = event.data as { deliveryIdx?: unknown } | null;
      const deliveryIdx = typeof data?.deliveryIdx === "number" ? data.deliveryIdx : null;
      if (deliveryIdx === null) return;
      const spec = scenario.deliverySchedule[deliveryIdx];
      const dt = spec ? S.deliveries.get(spec.id) : undefined;
      if (!dt || !dt.created || dt.state !== "RECEIVING" || dt.serviceDone) {
        record(now, "STALE_IGNORED", null, null, "unexpected receiving completion; no mutation");
        return;
      }
      dt.serviceDone = true;
      finishReceivingIfAccepted(dt, now);
    };

    const onPutAwayCompleted = (event: KernelEventView, now: number): void => {
      const data = event.data as { unitId?: unknown; deliveryIdx?: unknown; phase?: unknown; locationId?: unknown } | null;
      const unitId = typeof data?.unitId === "string" ? data.unitId : null;
      const deliveryIdx = typeof data?.deliveryIdx === "number" ? data.deliveryIdx : null;
      const phase = data?.phase === "collect" || data?.phase === "place" ? data.phase : null;
      if (unitId === null || deliveryIdx === null || phase === null) return;
      const spec = scenario.deliverySchedule[deliveryIdx];
      const dt = spec ? S.deliveries.get(spec.id) : undefined;
      const unit = S.units.get(unitId);
      if (!dt || !unit) {
        record(now, "STALE_IGNORED", null, unitId, "put-away completion for unknown delivery/unit; no mutation");
        return;
      }
      if (phase === "collect") {
        if (unit.task.kind !== "collecting" || unit.task.deliveryId !== dt.deliveryId) {
          record(now, "STALE_IGNORED", null, unitId, "unexpected put-away collect; no mutation");
          return;
        }
        const collectedProduct = unit.task.productId;
        const taskedQty = unit.task.quantity;
        const collectedResource = unit.task.resourceId;
        const stagedNow =
          S.store
            .snapshot()
            .receiving.find(
              (r) =>
                r.deliveryId === dt.deliveryId &&
                r.resourceId === collectedResource &&
                r.productId === collectedProduct,
            )?.quantity ?? 0;
        if (stagedNow <= 0) {
          unit.task = { kind: "idle" };
          record(now, "STALE_IGNORED", null, unitId, "staged stock already collected by another unit; no mutation");
          requestDispatch(now);
          return;
        }
        const collectedQty = Math.min(taskedQty, stagedNow);
        S.store.collectPutAway({
          eventId: `inv-collect-${dt.idx}-${unitId}-${now}`,
          timeMs: now,
          deliveryId: dt.deliveryId,
          resourceId: collectedResource,
          unitId,
          productId: collectedProduct,
          quantity: collectedQty,
        });
        record(now, "PUTAWAY_COLLECTED", null, unitId, `${dt.deliveryId} ${collectedProduct}x${collectedQty} collected`);
        finishReceivingIfAccepted(dt, now);
        const fitQty = placeableQty(collectedProduct, collectedQty);
        if (fitQty <= 0) {
          unit.task = { kind: "awaiting-location", deliveryId: dt.deliveryId };
          dt.waitReason = "PUTAWAY_NO_LOCATION";
          openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${collectedProduct} has no eligible storage location yet`, now);
          requestDispatch(now);
          return;
        }
        const sel = S.store.selectPutAwayLocation(collectedProduct, fitQty);
        if (sel.status !== "selectable") {
          unit.task = { kind: "awaiting-location", deliveryId: dt.deliveryId };
          dt.waitReason = "PUTAWAY_NO_LOCATION";
          openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${collectedProduct} has no eligible storage location yet`, now);
          requestDispatch(now);
          return;
        }
        closePutAwayWait(unitId, now);
        dt.waitReason = null;
        const dest = locationApproach.get(sel.locationId) as MoveDestination;
        const pose = transportUnitById(unitId).pose;
        if (posesEqual(pose, dest)) {
          const placeQty = Math.min(collectedQty, freeAtLocation(sel.locationId, collectedProduct));
          if (placeQty <= 0) {
            unit.task = { kind: "awaiting-location", deliveryId: dt.deliveryId };
            dt.waitReason = "PUTAWAY_NO_LOCATION";
            openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${collectedProduct} has no eligible storage location yet`, now);
            requestDispatch(now);
            return;
          }
          unit.task = { kind: "storing", deliveryId: dt.deliveryId, locationId: sel.locationId };
          schedulePutAwayHandling(unitId, dt, "place", placeQty, sel.locationId, now);
        } else {
          const mv = requestUnitMove(unitId, dest, now, null, `putaway-store:${sel.locationId}`);
          if (mv.status === "rejected") {
            unit.task = { kind: "awaiting-location", deliveryId: dt.deliveryId };
            dt.waitReason = "PUTAWAY_NO_LOCATION";
            openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${collectedProduct} has no eligible storage location yet`, now);
            requestDispatch(now);
            return;
          }
          unit.task = { kind: "to-store", deliveryId: dt.deliveryId, locationId: sel.locationId };
        }
        return;
      }
      // place
      const locationId = typeof data?.locationId === "string" ? data.locationId : null;
      if (unit.task.kind !== "storing" || unit.task.deliveryId !== dt.deliveryId || locationId === null) {
        record(now, "STALE_IGNORED", null, unitId, "unexpected put-away place; no mutation");
        return;
      }
      const carriedRow = S.store.snapshot().carried.find((c) => c.unitId === unitId);
      if (!carriedRow || carriedRow.loads.every((l) => l.quantity <= 0)) {
        closePutAwayWait(unitId, now);
        unit.task = { kind: "idle" };
        requestDispatch(now);
        return;
      }
      let remainder = false;
      for (const load of carriedRow.loads) {
        if (load.quantity <= 0) continue;
        const placeQty = Math.min(load.quantity, Math.max(0, freeAtLocation(locationId, load.productId)));
        if (placeQty > 0) {
          S.store.placePutAway({
            eventId: `inv-place-${dt.idx}-${unitId}-${load.productId}-${locationId}-${now}`,
            timeMs: now,
            deliveryId: dt.deliveryId,
            unitId,
            locationId,
            productId: load.productId,
            quantity: placeQty,
          });
          record(now, "PUTAWAY_STORED", null, unitId, `${dt.deliveryId} ${load.productId}x${placeQty} stored at ${locationId}`);
        }
        if (placeQty < load.quantity) remainder = true;
      }
      if (remainder) {
        unit.task = { kind: "awaiting-location", deliveryId: dt.deliveryId };
        dt.waitReason = "PUTAWAY_NO_LOCATION";
        openWait(unitId, null, "PUTAWAY_NO_LOCATION", `remaining put-away load has no eligible storage location yet`, now);
        requestDispatch(now);
        return;
      }
      closePutAwayWait(unitId, now);
      dt.waitReason = null;
      unit.task = { kind: "idle" };
      if (
        deliveryExternalRemaining(dt.deliveryId) === 0 &&
        deliveryReceivingRemaining(dt.deliveryId) === 0 &&
        ![...S.units.values()].some((u) => (S.store.snapshot().carried.find((c) => c.unitId === u.unitId)?.loads ?? []).some((l) => l.quantity > 0) && (u.task.kind !== "idle"))
      ) {
        dt.state = "STORED";
        dt.timestamps.STORED = now;
        dt.waitReason = null;
        record(now, "DELIVERY_STORED", null, null, `${dt.deliveryId} fully stored`);
      }
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
      if (t.kind === "to-receive") {
        const dt = S.deliveries.get(t.deliveryId);
        const dest = S.receivingCoords.get(t.resourceId);
        if (!dt || !dest || !posesEqual(snap.pose, dest)) return;
        const chosen = choosePlaceableCollect(dt, unitId, t.resourceId);
        if (!chosen) {
          const home = unitParking.get(unitId) as MoveDestination;
          if (posesEqual(snap.pose, home)) {
            unit.task = { kind: "idle" };
          } else {
            unit.task = { kind: "to-parking" };
            const mv = requestUnitMove(unitId, home, now, null, "parking-return");
            if (mv.status !== "granted" && mv.status !== "waiting") {
              unit.task = { kind: "idle" };
            }
          }
        } else {
          unit.task = { kind: "collecting", deliveryId: dt.deliveryId, resourceId: t.resourceId, productId: chosen.productId, quantity: chosen.quantity };
          record(now, "PUTAWAY_AT_RECEIVING", null, unitId, `at ${t.resourceId} for ${dt.deliveryId}`);
          schedulePutAwayHandling(unitId, dt, "collect", chosen.quantity, null, now);
        }
      } else if (t.kind === "yield-to-parking") {
        const dt = S.deliveries.get(t.deliveryId);
        const home = unitParking.get(unitId) as MoveDestination;
        if (!dt || !posesEqual(snap.pose, home)) return;
        unit.task = { kind: "awaiting-location", deliveryId: dt.deliveryId };
        record(now, "PUTAWAY_YIELD_PARKED", null, unitId, `parked with load for ${dt.deliveryId}; selection retries`);
      } else if (t.kind === "to-store") {
        const dt = S.deliveries.get(t.deliveryId);
        const dest = locationApproach.get(t.locationId);
        if (!dt || !dest || !posesEqual(snap.pose, dest)) return;
        const carriedRow = S.store.snapshot().carried.find((c) => c.unitId === unitId);
        const firstLoad = carriedRow?.loads.find((l) => l.quantity > 0);
        if (!firstLoad) {
          closePutAwayWait(unitId, now);
          unit.task = { kind: "idle" };
        } else {
          const freeHere = freeAtLocation(t.locationId, firstLoad.productId);
          if (freeHere <= 0) {
            unit.task = { kind: "awaiting-location", deliveryId: dt.deliveryId };
            dt.waitReason = "PUTAWAY_NO_LOCATION";
            openWait(unitId, null, "PUTAWAY_NO_LOCATION", `${firstLoad.productId} has no eligible storage location yet`, now);
          } else {
            unit.task = { kind: "storing", deliveryId: dt.deliveryId, locationId: t.locationId };
            record(now, "PUTAWAY_AT_LOCATION", null, unitId, `at ${t.locationId} for ${dt.deliveryId}`);
            schedulePutAwayHandling(unitId, dt, "place", Math.min(firstLoad.quantity, freeHere), t.locationId, now);
          }
        }
      } else if (t.kind === "to-pick") {
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
          (rt.state !== "PICKING" && rt.state !== "WAITING_FOR_PACKING") ||
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
        // Split-trip boundary: a full cart delivers its partial load to
        // packing staging before picking the remaining legs.
        if (nextIndex < rt.legs.length) {
          const nextLeg = rt.legs[nextIndex] as PickLeg;
          const nextCost = (productCost.get(nextLeg.productId) ?? 0) * nextLeg.quantity;
          const carriedNow = carriedCostOf(unitId);
          const capNow = unitCapacity.get(unitId) ?? 0;
          if (carriedNow > 0 && carriedNow + nextCost > capNow) {
            deliverToPacking(unitId, rt, now);
            return;
          }
        }
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
        // All legs picked: deliver (first trip enqueues; split-trip returns
        // rejoin the already-enqueued job).
        deliverToPacking(unitId, rt, now);
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
        case "DISPATCH_COMPLETED":
          onDispatchCompleted(event, now);
          break;
        case "DELIVERY_ARRIVAL":
          onDeliveryArrival(event, now);
          break;
        case "RECEIVE_COMPLETED":
          onReceiveCompleted(event, now);
          break;
        case "PUTAWAY_COMPLETED":
          onPutAwayCompleted(event, now);
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
    let deliverySeq = 0;
    for (const dt of S.deliveries.values()) {
      deliverySeq += 1;
      kernel.schedule({
        id: `ops-delivery-${deliverySeq}`,
        timeMs: dt.arrivalTimeMs,
        priority: EVENT_PRIORITY.ARRIVAL,
        kind: "DELIVERY_ARRIVAL",
        data: { deliveryId: dt.deliveryId },
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
    if (rt.state === "READY_FOR_DISPATCH") return rt.waitReason;
    if (rt.state === "SHIPPED") return null;
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
    const deliveries: OperationsDeliveryView[] = scenario.deliverySchedule.map((spec) => {
      const dt = S.deliveries.get(spec.id) as DeliveryRuntime;
      return {
        deliveryId: dt.deliveryId,
        arrivalTimeMs: dt.arrivalTimeMs,
        state: dt.created ? dt.state : "NOT_ARRIVED",
        timestamps: { ...dt.timestamps },
        lines: dt.lines.map((l) => ({ ...l })),
        receivingResourceId: dt.receivingResourceId,
        waitReason: dt.waitReason,
      };
    });
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
        dispatchResourceId: rt.dispatchResourceId,
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
    const shippedCount = orders.filter((o) => o.state === "SHIPPED").length;
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
      deliveries,
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
        segments: t.trajectory.segments.map((segment) => ({ ...segment })),
      })),
      maxConcurrentMoving: { ...S.maxConcurrentMoving },
      counts: {
        selected: orders.length,
        excluded: excludedOrderIds.length,
        arrived,
        packed: packedCount,
        readyForDispatch: ready,
        shipped: shippedCount,
        backlog: arrived - shippedCount,
        stageBacklog: arrived - ready - shippedCount,
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
    const shipped = all.filter((o) => o.state === "SHIPPED").length;
    // backlog = arrived - shipped (unshipped); stageBacklog counts only the
    // picking/packing stage (arrived - ready - shipped).
    const done = ready + shipped;
    if (runMode === "finite-cohort") {
      const hasDispatch = S.dispatchStations.size > 0;
      const deliveriesStored =
        S.deliveries.size === 0 ||
        [...S.deliveries.values()].every((d) => d.created && d.state === "STORED");
      if (
        all.length > 0 &&
        deliveriesStored &&
        (hasDispatch ? shipped === all.length : done === all.length)
      ) {
        return {
          stage: "SUPPORTED_STAGE_COMPLETE",
          ready,
          selected: all.length,
          shipped,
          backlog: all.length - shipped,
          stageBacklog: 0,
          note:
            shipped === all.length
              ? "all selected orders SHIPPED through the configured dispatch lane(s)"
              : "all selected orders READY_FOR_DISPATCH; no dispatch resource configured, nothing SHIPPED",
        };
      }
      if (
        reasons.length > 0 &&
        created === all.length &&
        done + reasons.length === all.length
      ) {
        return {
          stage: "BLOCKED",
          ready,
          selected: all.length,
          created,
          backlog: created - shipped,
          stageBacklog: created - done,
          shipped,
          detail:
            "every selected order is ready/shipped or terminally blocked; state retained, no partial fulfillment",
          reasons,
        };
      }
      // Bounded stuck reporting: when every arrival is in, no future release
      // is scheduled, and the transport diagnostic confirms a deadlock with
      // retained waits, IN_PROGRESS would never advance again. Report BLOCKED
      // with the preserved orders/state and the witnessed cause instead of
      // hanging forever. This never validates a blocked run: only
      // SUPPORTED_STAGE_COMPLETE (6 READY here) passes the integration gate.
      const stuck = diagnosticOf(S);
      if (stuck && stuck.status === "stuck" && created === all.length) {
        const stuckReasons = [...reasons];
        for (const w of stuck.operationsWaits) {
          stuckReasons.push({
            orderId: w.orderId,
            code: `STUCK_${w.reason}`,
            message: stuck.detail,
          });
        }
        if (stuckReasons.length === reasons.length) {
          for (const o of all) {
            if (o.state !== "READY_FOR_DISPATCH") {
              stuckReasons.push({
                orderId: o.orderId,
                code: "TRANSPORT_STUCK",
                message: stuck.detail,
              });
            }
          }
        }
        return {
          stage: "BLOCKED",
          ready,
          selected: all.length,
          created,
          backlog: created - shipped,
          stageBacklog: created - done,
          shipped,
          detail:
            `stuck with no scheduled release: ${stuck.detail}; ` +
            `${created}/${all.length} arrived, ${ready} ready for dispatch, ` +
            `${created - shipped} unshipped backlog, ${created - done} stage backlog; ` +
            `orders/state preserved, no teleport or task deletion`,
          reasons: stuckReasons,
        };
      }
      return {
        stage: "IN_PROGRESS",
        ready,
        selected: all.length,
        created,
        backlog: created - shipped,
        stageBacklog: created - done,
        shipped,
        detail: `${created}/${all.length} arrived, ${ready} ready for dispatch, ${created - shipped} unshipped backlog, ${created - done} stage backlog`,
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
        backlog: created - shipped,
        stageBacklog: created - done,
        shipped,
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
      backlog: created - shipped,
      stageBacklog: created - done,
      shipped,
      detail: `${created}/${all.length} arrived, ${ready} ready for dispatch, ${created - shipped} unshipped backlog, ${created - done} stage backlog`,
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
      (o) => o.state === "READY_FOR_DISPATCH" || o.state === "SHIPPED",
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
      "DISPATCH_COMPLETED",
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
    exportReport: (): OperationsReport => {
      const snap = buildSnapshot(S);
      const stage = completionOf(S).stage;
      const metrics = operationsRunMetrics(snap, stage);
      const run = scenario.policies.run;
      return {
        schema: "layoutlab.operations-report/1",
        scenarioId: snap.scenarioId,
        seed: snap.seed,
        versions: { ...snap.versions },
        scenario: structuredClone(scenario) as OperationsScenario,
        executionConfig: { ...executionConfig },
        completionStage: stage,
        counts: { ...snap.counts },
        orders: snap.orders.map((o) => ({
          orderId: o.orderId,
          state: o.state,
          timestamps: { ...o.timestamps },
        })),
        deliveries: snap.deliveries.map((d) => ({
          deliveryId: d.deliveryId,
          state: d.state,
          timestamps: { ...d.timestamps },
        })),
        checks: {
          conservation: [...snap.checks.conservation],
          capacity: [...snap.checks.capacity],
          safety: [...snap.checks.safety],
        },
        clockMs: snap.clockMs,
        termination: {
          mode: run.mode,
          horizonMs: run.mode === "fixed-window" ? run.horizonMs : null,
          arrivalCutoffMs: run.mode === "finite-cohort" ? run.arrivalCutoffMs : null,
          safetyCeilingMs: null,
          stopClockMs: snap.clockMs,
          stopReason:
            stage === "SUPPORTED_STAGE_COMPLETE"
              ? "stage-complete"
              : stage === "BLOCKED"
                ? "blocked"
                : stage === "WINDOW_ENDED"
                  ? "window-ended"
                  : "caller-stopped",
        },
        totalWaitMs: metrics.totalWaitMs,
        makespanMs: metrics.makespanMs,
        lastShippedAtMs: metrics.lastShippedAtMs,
      };
    },
  };
}
