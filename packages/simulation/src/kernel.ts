import { MAX_ID_LEN, MAX_TIME_MS } from "./schema.js";
import { OPERATIONS_ENGINE_VERSION } from "./version.js";

// Pure synchronous v3-M2a event/clock kernel. Caller-driven: no timers,
// wall clock, randomness, network, or DOM anywhere; simulated time moves
// only through stepEvent/advanceTo. The onEvent hook is trusted internal
// reducer code registered by the caller (domain logic plugs in here in
// later milestones); executable code is never deserialized from scenario
// data. Queue-empty means the event queue is exhausted, never "all
// warehouse orders completed": kernel exhaustion is not business
// fulfillment, and this kernel manufactures no order/shipment metrics.
export const MAX_KERNEL_PRIORITY = 1_000_000;
export const MAX_PLAN_VERSION = 1_000_000_000;

export type KernelEventInput = {
  id: string;
  timeMs: number;
  priority: number;
  kind: string;
  data?: unknown;
  taskId?: string;
  planVersion?: number;
};

export type KernelEventView = {
  id: string;
  timeMs: number;
  priority: number;
  sequence: number;
  kind: string;
  data: unknown;
  taskId: string | null;
  planVersion: number | null;
};

export type KernelApi = {
  readonly clockMs: number;
  schedule: (input: KernelEventInput) => string;
  cancel: (eventId: string) => boolean;
  setTaskPlanVersion: (taskId: string, version: number) => void;
};

export type OnKernelEvent = (
  event: KernelEventView,
  api: KernelApi,
) => void;

export type KernelStatus = "ready" | "queue-empty" | "invalid";

export type StepResult = {
  status: KernelStatus;
  clockMs: number;
  processedTotal: number;
  eventId: string | null;
  diagnostic: string | null;
};

export type KernelSnapshotEvent = {
  id: string;
  timeMs: number;
  priority: number;
  sequence: number;
  kind: string;
  data: unknown;
  taskId: string | null;
  planVersion: number | null;
};

export type KernelSnapshot = {
  engineVersion: string;
  clockMs: number;
  status: KernelStatus;
  nextSequence: number;
  processedTotal: number;
  timestampOfCount: number;
  countAtTimestamp: number;
  maxProcessedEvents: number;
  maxEventsPerTimestamp: number;
  pending: KernelSnapshotEvent[];
  processedIds: string[];
  cancelledIds: string[];
  staleSkippedIds: string[];
  taskPlanVersions: { taskId: string; version: number }[];
  failedEvent: KernelSnapshotEvent | null;
  diagnostic: string | null;
};

export type KernelOptions = {
  initialEvents?: KernelEventInput[];
  maxProcessedEvents: number;
  maxEventsPerTimestamp: number;
  onEvent: OnKernelEvent;
};

export type Kernel = {
  schedule: (input: KernelEventInput) => string;
  cancel: (eventId: string) => boolean;
  setTaskPlanVersion: (taskId: string, version: number) => void;
  stepEvent: () => StepResult;
  advanceTo: (targetMs: number) => StepResult;
  snapshot: () => KernelSnapshot;
  restore: (snapshot: unknown) => void;
  reset: () => void;
  getClockMs: () => number;
  getStatus: () => KernelStatus;
  getProcessedTotal: () => number;
  getPendingCount: () => number;
};

type InternalEvent = {
  id: string;
  timeMs: number;
  priority: number;
  sequence: number;
  kind: string;
  data: unknown;
  taskId: string | null;
  planVersion: number | null;
};

function compareEvents(a: InternalEvent, b: InternalEvent): number {
  return (
    a.timeMs - b.timeMs || a.priority - b.priority || a.sequence - b.sequence
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Event payload contract: bounded reproducible plain JSON-compatible
// data for future reports. Plain objects/arrays, finite numbers, strings,
// booleans, null only; no cycles, class instances, Date/Map/Set,
// BigInt, functions, symbols, undefined (nested), or non-finite numbers.
// Depth, node-count, and string-payload bounds keep validation and cloning
// deterministic and cheap. Top-level undefined means "no data" (null).
const MAX_EVENT_DATA_DEPTH = 32;
const MAX_EVENT_DATA_NODES = 10_000;
const MAX_EVENT_DATA_STRING_CHARS = 262_144;

function validateEventData(data: unknown): void {
  if (data === undefined || data === null) {
    return;
  }
  type Frame = { value: unknown; depth: number; exit: object | null };
  const stack: Frame[] = [{ value: data, depth: 0, exit: null }];
  const path = new Set<object>();
  let nodes = 0;
  let stringChars = 0;
  while (stack.length > 0) {
    const frame = stack.pop() as Frame;
    if (frame.exit !== null) {
      path.delete(frame.exit);
      continue;
    }
    nodes += 1;
    if (nodes > MAX_EVENT_DATA_NODES) {
      throw new Error(
        `event data exceeds ${MAX_EVENT_DATA_NODES} JSON values`,
      );
    }
    const v = frame.value;
    const depth = frame.depth;
    if (v === null) {
      continue;
    }
    const t = typeof v;
    if (t === "boolean") {
      continue;
    }
    if (t === "string") {
      stringChars += (v as string).length;
      if (stringChars > MAX_EVENT_DATA_STRING_CHARS) {
        throw new Error(
          `event data exceeds ${MAX_EVENT_DATA_STRING_CHARS} string characters`,
        );
      }
      continue;
    }
    if (t === "number") {
      if (!Number.isFinite(v as number)) {
        throw new Error(
          "event data numbers must be finite (no NaN/Infinity)",
        );
      }
      continue;
    }
    if (
      t === "bigint" ||
      t === "function" ||
      t === "symbol" ||
      t === "undefined"
    ) {
      throw new Error(
        "event data must be plain JSON-compatible data (no bigint/function/symbol/undefined)",
      );
    }
    if (Array.isArray(v)) {
      if (path.has(v)) {
        throw new Error("event data must not contain cycles");
      }
      if (depth >= MAX_EVENT_DATA_DEPTH) {
        throw new Error(
          `event data exceeds max depth ${MAX_EVENT_DATA_DEPTH}`,
        );
      }
      path.add(v);
      stack.push({ value: null, depth: 0, exit: v });
      for (let i = v.length - 1; i >= 0; i -= 1) {
        stack.push({ value: v[i], depth: depth + 1, exit: null });
      }
      continue;
    }
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(
        "event data must be plain JSON objects/arrays (no Date/Map/class instances)",
      );
    }
    if (path.has(v as object)) {
      throw new Error("event data must not contain cycles");
    }
    if (depth >= MAX_EVENT_DATA_DEPTH) {
      throw new Error(
        `event data exceeds max depth ${MAX_EVENT_DATA_DEPTH}`,
      );
    }
    path.add(v as object);
    stack.push({ value: null, depth: 0, exit: v as object });
    const entries = Object.entries(v as Record<string, unknown>);
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const [key, child] = entries[i];
      stringChars += key.length;
      if (stringChars > MAX_EVENT_DATA_STRING_CHARS) {
        throw new Error(
          `event data exceeds ${MAX_EVENT_DATA_STRING_CHARS} string characters`,
        );
      }
      stack.push({ value: child, depth: depth + 1, exit: null });
    }
  }
}

function cloneData(data: unknown): unknown {
  if (data === undefined || data === null) {
    return null;
  }
  validateEventData(data);
  try {
    return structuredClone(data);
  } catch {
    throw new Error("event data must be plain JSON-compatible data");
  }
}

function freezeDeep<T>(value: T, seen?: WeakSet<object>): T {
  const guard = seen ?? new WeakSet<object>();
  if (Array.isArray(value)) {
    if (guard.has(value)) {
      return value;
    }
    guard.add(value);
    for (const item of value) {
      freezeDeep(item, guard);
    }
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    if (guard.has(value)) {
      return value;
    }
    guard.add(value);
    for (const key of Object.keys(value)) {
      freezeDeep(value[key], guard);
    }
    return Object.freeze(value);
  }
  return value;
}

function snapshotEventsEqual(
  a: InternalEvent,
  b: InternalEvent,
): boolean {
  return (
    a.id === b.id &&
    a.timeMs === b.timeMs &&
    a.priority === b.priority &&
    a.sequence === b.sequence &&
    a.kind === b.kind &&
    a.taskId === b.taskId &&
    a.planVersion === b.planVersion &&
    JSON.stringify(a.data ?? null) === JSON.stringify(b.data ?? null)
  );
}

export function createKernel(options: KernelOptions): Kernel {
  if (!isRecord(options)) {
    throw new Error("kernel options must be an object");
  }
  const { maxProcessedEvents, maxEventsPerTimestamp, onEvent } = options;
  if (
    !Number.isSafeInteger(maxProcessedEvents) ||
    maxProcessedEvents < 1
  ) {
    throw new Error("maxProcessedEvents must be a positive safe integer");
  }
  if (
    !Number.isSafeInteger(maxEventsPerTimestamp) ||
    maxEventsPerTimestamp < 1
  ) {
    throw new Error("maxEventsPerTimestamp must be a positive safe integer");
  }
  if (typeof onEvent !== "function") {
    throw new Error("onEvent must be a function");
  }

  let clockMs = 0;
  let nextSequence = 0;
  let pending: InternalEvent[] = [];
  let idsEver = new Set<string>();
  let processedIds: string[] = [];
  let cancelledIds: string[] = [];
  let staleSkippedIds: string[] = [];
  let taskPlanVersions = new Map<string, number>();
  let timestampOfCount = 0;
  let countAtTimestamp = 0;
  let invalid = false;
  let failedEvent: InternalEvent | null = null;
  let diagnostic: string | null = null;

  const statusOf = (): KernelStatus =>
    invalid ? "invalid" : pending.length === 0 ? "queue-empty" : "ready";

  const viewOf = (e: InternalEvent): KernelEventView => ({
    id: e.id,
    timeMs: e.timeMs,
    priority: e.priority,
    sequence: e.sequence,
    kind: e.kind,
    data: cloneData(e.data),
    taskId: e.taskId,
    planVersion: e.planVersion,
  });

  const insertSorted = (e: InternalEvent): void => {
    let lo = 0;
    let hi = pending.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareEvents(pending[mid], e) < 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    pending.splice(lo, 0, e);
  };

  const checkValid = (action: string): void => {
    if (invalid) {
      throw new Error(`cannot ${action}: kernel is invalid (${diagnostic})`);
    }
  };

  const schedule = (input: KernelEventInput): string => {
    checkValid("schedule");
    if (!isRecord(input)) {
      throw new Error("event must be an object");
    }
    const { id, timeMs, priority, kind } = input as Record<string, unknown>;
    if (typeof id !== "string" || id.length < 1 || id.length > MAX_ID_LEN) {
      throw new Error("event id must be a 1..128 character string");
    }
    if (
      !Number.isSafeInteger(timeMs) ||
      (timeMs as number) < 0 ||
      (timeMs as number) > MAX_TIME_MS
    ) {
      throw new Error(`event ${id} has timeMs outside 0..${MAX_TIME_MS}`);
    }
    if (
      !Number.isSafeInteger(priority) ||
      (priority as number) < 0 ||
      (priority as number) > MAX_KERNEL_PRIORITY
    ) {
      throw new Error(`event ${id} has priority outside 0..${MAX_KERNEL_PRIORITY}`);
    }
    if (typeof kind !== "string" || kind.length < 1 || kind.length > MAX_ID_LEN) {
      throw new Error(`event ${id} has an invalid kind`);
    }
    const rawTaskId = (input as Record<string, unknown>).taskId;
    const rawPlanVersion = (input as Record<string, unknown>).planVersion;
    if (
      rawTaskId !== undefined &&
      (typeof rawTaskId !== "string" ||
        rawTaskId.length < 1 ||
        rawTaskId.length > MAX_ID_LEN)
    ) {
      throw new Error(`event ${id} has an invalid taskId`);
    }
    if (
      rawPlanVersion !== undefined &&
      (!Number.isSafeInteger(rawPlanVersion) ||
        (rawPlanVersion as number) < 0 ||
        (rawPlanVersion as number) > MAX_PLAN_VERSION)
    ) {
      throw new Error(`event ${id} has a planVersion outside 0..${MAX_PLAN_VERSION}`);
    }
    if ((timeMs as number) < clockMs) {
      throw new Error(`event ${id} is scheduled in the past`);
    }
    if (idsEver.has(id)) {
      throw new Error(`duplicate event id: ${id}`);
    }
    const event: InternalEvent = {
      id,
      timeMs: timeMs as number,
      priority: priority as number,
      sequence: nextSequence,
      kind,
      data: cloneData((input as Record<string, unknown>).data),
      taskId: (rawTaskId as string | undefined) ?? null,
      planVersion: (rawPlanVersion as number | undefined) ?? null,
    };
    nextSequence += 1;
    idsEver.add(id);
    insertSorted(event);
    return id;
  };

  const cancel = (eventId: string): boolean => {
    // Cancelling on an invalid kernel is a no-op: the queue is retained
    // for diagnosis and no further execution happens either way.
    if (invalid) {
      return false;
    }
    const index = pending.findIndex((e) => e.id === eventId);
    if (index < 0) {
      return false;
    }
    pending.splice(index, 1);
    cancelledIds.push(eventId);
    return true;
  };

  const setTaskPlanVersion = (taskId: string, version: number): void => {
    checkValid("set a task plan version");
    if (
      typeof taskId !== "string" ||
      taskId.length < 1 ||
      taskId.length > MAX_ID_LEN
    ) {
      throw new Error("taskId must be a 1..128 character string");
    }
    if (
      !Number.isSafeInteger(version) ||
      version < 0 ||
      version > MAX_PLAN_VERSION
    ) {
      throw new Error(`plan version outside 0..${MAX_PLAN_VERSION}`);
    }
    const current = taskPlanVersions.get(taskId) ?? 0;
    if (version < current) {
      throw new Error(
        `plan version for task ${taskId} cannot move backward`,
      );
    }
    taskPlanVersions.set(taskId, version);
  };

  const invalidate = (event: InternalEvent, reason: string): StepResult => {
    invalid = true;
    failedEvent = event;
    diagnostic = reason;
    return {
      status: "invalid",
      clockMs,
      processedTotal: processedIds.length,
      eventId: event.id,
      diagnostic: reason,
    };
  };

  const apiFor = (now: number): KernelApi => ({
    clockMs: now,
    schedule,
    cancel,
    setTaskPlanVersion,
  });

  const stepEvent = (): StepResult => {
    if (invalid) {
      return {
        status: "invalid",
        clockMs,
        processedTotal: processedIds.length,
        eventId: failedEvent?.id ?? null,
        diagnostic,
      };
    }
    const next = pending[0];
    if (!next) {
      return {
        status: "queue-empty",
        clockMs,
        processedTotal: processedIds.length,
        eventId: null,
        diagnostic: null,
      };
    }
    // Stale plan events are skipped deterministically: the trace records
    // the skip and the callback never runs. Physical occupancy release
    // is later controller responsibility, not a kernel traffic feature.
    const currentVersion =
      next.taskId === null ? null : (taskPlanVersions.get(next.taskId) ?? 0);
    if (
      currentVersion !== null &&
      (next.planVersion ?? 0) < currentVersion
    ) {
      pending.shift();
      clockMs = next.timeMs;
      staleSkippedIds.push(next.id);
      return {
        status: statusOf(),
        clockMs,
        processedTotal: processedIds.length,
        eventId: next.id,
        diagnostic: `stale event skipped: ${next.id} (task ${next.taskId} plan v${next.planVersion ?? 0} < v${currentVersion})`,
      };
    }
    // Per-RUN processed-event bound and per-SIMULATION-TIMESTAMP
    // zero-time-work bound. Neither resets on advanceTo/frame calls, so
    // 1x/4x/16x chunkings cannot diverge.
    if (processedIds.length >= maxProcessedEvents) {
      return invalidate(
        next,
        `processed-event bound exceeded: ${maxProcessedEvents} events already processed, cannot execute ${next.id}`,
      );
    }
    const atTimestamp =
      next.timeMs === timestampOfCount ? countAtTimestamp : 0;
    if (atTimestamp >= maxEventsPerTimestamp) {
      return invalidate(
        next,
        `zero-time-work bound exceeded: ${maxEventsPerTimestamp} events already executed at t=${next.timeMs}, cannot execute ${next.id}`,
      );
    }
    // Dequeue before invoking the hook so one event can never execute
    // twice, even if the handler schedules causally at the same time.
    pending.shift();
    clockMs = next.timeMs;
    if (next.timeMs === timestampOfCount) {
      countAtTimestamp += 1;
    } else {
      timestampOfCount = next.timeMs;
      countAtTimestamp = 1;
    }
    // Counted as processed once dequeued: a throwing handler stops the
    // run invalid, and the failed event is never retried (at-most-once).
    processedIds.push(next.id);
    try {
      onEvent(viewOf(next), apiFor(next.timeMs));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return invalidate(next, `handler error on ${next.id}: ${message}`);
    }
    return {
      status: statusOf(),
      clockMs,
      processedTotal: processedIds.length,
      eventId: next.id,
      diagnostic: null,
    };
  };

  const advanceTo = (targetMs: number): StepResult => {
    if (!Number.isSafeInteger(targetMs) || targetMs < 0 || targetMs > MAX_TIME_MS) {
      throw new Error(`advanceTo target must be an integer in 0..${MAX_TIME_MS}`);
    }
    if (targetMs < clockMs) {
      throw new Error("advanceTo target is in the past");
    }
    if (invalid) {
      return {
        status: "invalid",
        clockMs,
        processedTotal: processedIds.length,
        eventId: failedEvent?.id ?? null,
        diagnostic,
      };
    }
    let lastId: string | null = null;
    let lastDiagnostic: string | null = null;
    // Process every due event, including causally inserted ones, in
    // deterministic order. When a bound trips, the run stops invalid
    // with pending work retained: nothing is silently discarded and the
    // clock never jumps past unprocessed due events.
    while (!invalid && pending.length > 0 && pending[0].timeMs <= targetMs) {
      const result = stepEvent();
      lastId = result.eventId;
      lastDiagnostic = result.diagnostic;
    }
    if (invalid) {
      return {
        status: "invalid",
        clockMs,
        processedTotal: processedIds.length,
        eventId: lastId,
        diagnostic: lastDiagnostic,
      };
    }
    clockMs = targetMs;
    return {
      status: statusOf(),
      clockMs,
      processedTotal: processedIds.length,
      eventId: lastId,
      diagnostic: null,
    };
  };

  const snapshotOf = (e: InternalEvent): KernelSnapshotEvent => ({
    id: e.id,
    timeMs: e.timeMs,
    priority: e.priority,
    sequence: e.sequence,
    kind: e.kind,
    data: cloneData(e.data),
    taskId: e.taskId,
    planVersion: e.planVersion,
  });

  const snapshot = (): KernelSnapshot => {
    const versions = [...taskPlanVersions.entries()]
      .map(([taskId, version]) => ({ taskId, version }))
      .sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));
    // Deep copies throughout: the snapshot is never a mutable alias of
    // kernel internals, and it is frozen for good measure.
    return freezeDeep({
      engineVersion: OPERATIONS_ENGINE_VERSION,
      clockMs,
      status: statusOf(),
      nextSequence,
      processedTotal: processedIds.length,
      timestampOfCount,
      countAtTimestamp,
      maxProcessedEvents,
      maxEventsPerTimestamp,
      pending: pending.map(snapshotOf),
      processedIds: [...processedIds],
      cancelledIds: [...cancelledIds],
      staleSkippedIds: [...staleSkippedIds],
      taskPlanVersions: versions,
      failedEvent: failedEvent ? snapshotOf(failedEvent) : null,
      diagnostic,
    });
  };

  const restore = (value: unknown): void => {
    if (!isRecord(value)) {
      throw new Error("snapshot must be an object");
    }
    const s = value as Record<string, unknown>;
    if (s.engineVersion !== OPERATIONS_ENGINE_VERSION) {
      throw new Error("snapshot engineVersion mismatch");
    }
    const intIn = (v: unknown, min: number, max: number): v is number =>
      Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
    if (!intIn(s.clockMs, 0, MAX_TIME_MS)) {
      throw new Error("snapshot has an invalid clockMs");
    }
    if (
      s.status !== "ready" &&
      s.status !== "queue-empty" &&
      s.status !== "invalid"
    ) {
      throw new Error("snapshot has an invalid status");
    }
    if (!intIn(s.nextSequence, 0, Number.MAX_SAFE_INTEGER)) {
      throw new Error("snapshot has an invalid nextSequence");
    }
    if (!intIn(s.processedTotal, 0, Number.MAX_SAFE_INTEGER)) {
      throw new Error("snapshot has an invalid processedTotal");
    }
    if (!intIn(s.timestampOfCount, 0, MAX_TIME_MS)) {
      throw new Error("snapshot has an invalid timestampOfCount");
    }
    if (!intIn(s.countAtTimestamp, 0, Number.MAX_SAFE_INTEGER)) {
      throw new Error("snapshot has an invalid countAtTimestamp");
    }
    if (s.maxProcessedEvents !== maxProcessedEvents) {
      throw new Error("snapshot maxProcessedEvents mismatch");
    }
    if (s.maxEventsPerTimestamp !== maxEventsPerTimestamp) {
      throw new Error("snapshot maxEventsPerTimestamp mismatch");
    }
    const readEvent = (v: unknown, what: string): InternalEvent => {
      if (!isRecord(v)) {
        throw new Error(`snapshot ${what} must be an object`);
      }
      const e = v as Record<string, unknown>;
      if (
        typeof e.id !== "string" ||
        e.id.length < 1 ||
        e.id.length > MAX_ID_LEN
      ) {
        throw new Error(`snapshot ${what} has an invalid id`);
      }
      if (!intIn(e.timeMs, 0, MAX_TIME_MS)) {
        throw new Error(`snapshot ${what} has an invalid timeMs`);
      }
      if (!intIn(e.priority, 0, MAX_KERNEL_PRIORITY)) {
        throw new Error(`snapshot ${what} has an invalid priority`);
      }
      if (!intIn(e.sequence, 0, Number.MAX_SAFE_INTEGER)) {
        throw new Error(`snapshot ${what} has an invalid sequence`);
      }
      if (
        typeof e.kind !== "string" ||
        e.kind.length < 1 ||
        e.kind.length > MAX_ID_LEN
      ) {
        throw new Error(`snapshot ${what} has an invalid kind`);
      }
      if (
        e.taskId !== null &&
        (typeof e.taskId !== "string" ||
          e.taskId.length < 1 ||
          e.taskId.length > MAX_ID_LEN)
      ) {
        throw new Error(`snapshot ${what} has an invalid taskId`);
      }
      if (
        e.planVersion !== null &&
        !intIn(e.planVersion, 0, MAX_PLAN_VERSION)
      ) {
        throw new Error(`snapshot ${what} has an invalid planVersion`);
      }
      return {
        id: e.id,
        timeMs: e.timeMs as number,
        priority: e.priority as number,
        sequence: e.sequence as number,
        kind: e.kind,
        data: cloneData(e.data),
        taskId: (e.taskId as string | null) ?? null,
        planVersion: (e.planVersion as number | null) ?? null,
      };
    };
    if (!Array.isArray(s.pending)) {
      throw new Error("snapshot pending must be an array");
    }
    const restoredPending = (s.pending as unknown[]).map((v, i) =>
      readEvent(v, `pending[${i}]`),
    );
    const readIds = (v: unknown, what: string): string[] => {
      if (!Array.isArray(v)) {
        throw new Error(`snapshot ${what} must be an array`);
      }
      for (const id of v) {
        if (typeof id !== "string" || id.length < 1 || id.length > MAX_ID_LEN) {
          throw new Error(`snapshot ${what} has an invalid id`);
        }
      }
      return [...(v as string[])];
    };
    const restoredProcessed = readIds(s.processedIds, "processedIds");
    const restoredCancelled = readIds(s.cancelledIds, "cancelledIds");
    const restoredStale = readIds(s.staleSkippedIds, "staleSkippedIds");
    if (!Array.isArray(s.taskPlanVersions)) {
      throw new Error("snapshot taskPlanVersions must be an array");
    }
    const restoredVersions = new Map<string, number>();
    for (const entry of s.taskPlanVersions as unknown[]) {
      if (!isRecord(entry)) {
        throw new Error("snapshot taskPlanVersions entries must be objects");
      }
      const { taskId, version } = entry as Record<string, unknown>;
      if (
        typeof taskId !== "string" ||
        taskId.length < 1 ||
        taskId.length > MAX_ID_LEN
      ) {
        throw new Error("snapshot has an invalid task plan taskId");
      }
      if (!intIn(version, 0, MAX_PLAN_VERSION)) {
        throw new Error("snapshot has an invalid task plan version");
      }
      if (restoredVersions.has(taskId)) {
        throw new Error(`snapshot duplicates task plan ${taskId}`);
      }
      restoredVersions.set(taskId, version as number);
    }
    const restoredFailed =
      s.failedEvent === null
        ? null
        : readEvent(s.failedEvent, "failedEvent");
    if (
      s.diagnostic !== null &&
      (typeof s.diagnostic !== "string" || s.diagnostic.length < 1)
    ) {
      throw new Error("snapshot has an invalid diagnostic");
    }
    // Lifetime id consistency: every id appears in exactly one of the
    // pending/processed/cancelled/stale sets. The failed event is NOT a
    // separate claim: a dequeued handler failure is the last processed id,
    // while an unexecuted bound failure stays retained in pending. Shape
    // checks below reject malformed snapshots; they do not authenticate
    // past history (a future report verifier reruns from inputs).
    const seen = new Set<string>();
    const claim = (eventId: string, what: string): void => {
      if (seen.has(eventId)) {
        throw new Error(`snapshot id ${eventId} appears twice (${what})`);
      }
      seen.add(eventId);
    };
    const pendingSequences = new Set<number>();
    for (const e of restoredPending) {
      claim(e.id, "pending");
      if ((e.timeMs as number) < (s.clockMs as number)) {
        throw new Error(`snapshot pending event ${e.id} is in the past`);
      }
      if ((e.sequence as number) >= (s.nextSequence as number)) {
        throw new Error(`snapshot pending event ${e.id} has a stale sequence`);
      }
      if (pendingSequences.has(e.sequence as number)) {
        throw new Error(
          `snapshot pending events share sequence ${e.sequence as number}`,
        );
      }
      pendingSequences.add(e.sequence as number);
    }
    for (const eventId of restoredProcessed) {
      claim(eventId, "processed");
    }
    for (const eventId of restoredCancelled) {
      claim(eventId, "cancelled");
    }
    for (const eventId of restoredStale) {
      claim(eventId, "stale");
    }
    if (restoredProcessed.length !== (s.processedTotal as number)) {
      throw new Error("snapshot processedTotal disagrees with processedIds");
    }
    // Each schedule consumes one id and one sequence number, so the live
    // lifetime count must exactly equal nextSequence.
    if (seen.size !== (s.nextSequence as number)) {
      throw new Error(
        "snapshot nextSequence disagrees with lifetime id count",
      );
    }
    // Status/pending shape: valid states pin pending occupancy.
    if (s.status === "queue-empty" && restoredPending.length !== 0) {
      throw new Error("queue-empty snapshot must have no pending events");
    }
    if (s.status === "ready" && restoredPending.length === 0) {
      throw new Error("ready snapshot must have pending events");
    }
    // Basic timestamp/counter coherence (bounds the kernel itself keeps).
    const snapClock = s.clockMs as number;
    const snapProcessedTotal = s.processedTotal as number;
    const snapTimestampOfCount = s.timestampOfCount as number;
    const snapCountAtTimestamp = s.countAtTimestamp as number;
    if (snapTimestampOfCount > snapClock) {
      throw new Error("snapshot timestampOfCount exceeds clockMs");
    }
    if (snapCountAtTimestamp > snapProcessedTotal) {
      throw new Error("snapshot countAtTimestamp exceeds processedTotal");
    }
    if (snapCountAtTimestamp > (s.maxEventsPerTimestamp as number)) {
      throw new Error(
        "snapshot countAtTimestamp exceeds maxEventsPerTimestamp",
      );
    }
    if (snapProcessedTotal > (s.maxProcessedEvents as number)) {
      throw new Error("snapshot processedTotal exceeds maxProcessedEvents");
    }
    if (snapProcessedTotal === 0) {
      if (snapCountAtTimestamp !== 0 || snapTimestampOfCount !== 0) {
        throw new Error(
          "snapshot counters impossible without processed events",
        );
      }
    } else if (snapCountAtTimestamp === 0) {
      throw new Error(
        "snapshot countAtTimestamp impossible for processed work",
      );
    }
    if (s.status === "invalid") {
      if (!restoredFailed || s.diagnostic === null) {
        throw new Error("invalid snapshot must carry a failed event and diagnostic");
      }
      const failedId = restoredFailed.id;
      const inPending = restoredPending.some((e) => e.id === failedId);
      const inProcessed = restoredProcessed.includes(failedId);
      const isLastProcessed =
        restoredProcessed[restoredProcessed.length - 1] === failedId;
      const inCancelled = restoredCancelled.includes(failedId);
      const inStale = restoredStale.includes(failedId);
      if (inCancelled || inStale) {
        throw new Error(
          "snapshot failed event must not be a cancelled or stale id",
        );
      }
      if (inPending) {
        const peer = restoredPending.find(
          (e) => e.id === failedId,
        ) as InternalEvent;
        if (!snapshotEventsEqual(peer, restoredFailed)) {
          throw new Error(
            "snapshot failed event disagrees with its pending entry",
          );
        }
      } else if (!isLastProcessed) {
        if (!inProcessed) {
          throw new Error(
            "snapshot failed event id matches no pending or processed entry",
          );
        }
        throw new Error(
          "snapshot failed event must be the last processed id",
        );
      }
      const diagnostic = s.diagnostic as string;
      if (!diagnostic.includes(failedId)) {
        throw new Error("snapshot diagnostic disagrees with failed event");
      }
      // Cross-check the failure kind named by the diagnostic so a bound
      // diagnostic cannot validate a processed-last failure and vice versa.
      if (diagnostic.startsWith("handler error on ")) {
        if (!isLastProcessed || inPending) {
          throw new Error(
            "snapshot handler failure must be the last processed id",
          );
        }
        if (!diagnostic.startsWith(`handler error on ${failedId}:`)) {
          throw new Error("snapshot diagnostic disagrees with failed event");
        }
      } else if (diagnostic.includes("bound exceeded")) {
        if (!inPending) {
          throw new Error(
            "snapshot bound failure must retain the failed event pending",
          );
        }
        if (!diagnostic.includes(`cannot execute ${failedId}`)) {
          throw new Error("snapshot diagnostic disagrees with failed event");
        }
        // A genuine bound failure trips only when its bound is actually
        // exhausted: the global bound with processedTotal at the cap, or
        // the timestamp bound with the failed timestamp's count at the
        // cap. Anything else is a relabeled foreign failure.
        const globalTripped =
          snapProcessedTotal === (s.maxProcessedEvents as number);
        const timestampTripped =
          snapTimestampOfCount === restoredFailed.timeMs &&
          snapCountAtTimestamp === (s.maxEventsPerTimestamp as number);
        if (diagnostic.startsWith("processed-event bound exceeded")) {
          if (!globalTripped) {
            throw new Error(
              "snapshot global-bound failure disagrees with processedTotal",
            );
          }
        } else if (diagnostic.startsWith("zero-time-work bound exceeded")) {
          if (!timestampTripped) {
            throw new Error(
              "snapshot timestamp-bound failure disagrees with timestamp counters",
            );
          }
        } else if (!globalTripped && !timestampTripped) {
          throw new Error(
            "snapshot bound failure matches no exhausted bound",
          );
        }
      }
    } else if (restoredFailed !== null || s.diagnostic !== null) {
      throw new Error("valid snapshot must not carry failure state");
    }
    restoredPending.sort(compareEvents);
    // An unexecuted bound failure always trips on the head of the queue,
    // so after the deterministic re-sort it must still be first.
    if (
      s.status === "invalid" &&
      restoredFailed &&
      (s.diagnostic as string).includes("bound exceeded") &&
      restoredPending.length > 0 &&
      restoredPending[0].id !== restoredFailed.id
    ) {
      throw new Error(
        "snapshot bound failed event must be the next pending event",
      );
    }
    clockMs = s.clockMs as number;
    nextSequence = s.nextSequence as number;
    pending = restoredPending;
    idsEver = seen;
    processedIds = restoredProcessed;
    cancelledIds = restoredCancelled;
    staleSkippedIds = restoredStale;
    taskPlanVersions = restoredVersions;
    timestampOfCount = s.timestampOfCount as number;
    countAtTimestamp = s.countAtTimestamp as number;
    invalid = s.status === "invalid";
    failedEvent = restoredFailed;
    diagnostic = (s.diagnostic as string | null) ?? null;
  };

  const initialEvents = options.initialEvents ?? [];
  if (!Array.isArray(initialEvents)) {
    throw new Error("initialEvents must be an array");
  }
  for (const event of initialEvents) {
    schedule(event);
  }
  // Genesis capture: reset() restores this exact state, so a snapshot
  // taken right after creation deep-equals a snapshot taken after reset.
  const genesis: KernelSnapshot = snapshot();

  const kernel: Kernel = {
    schedule,
    cancel,
    setTaskPlanVersion,
    stepEvent,
    advanceTo,
    snapshot,
    restore,
    // Genesis is kernel-produced and already validated: clone it without
    // the event-payload size bound (a large valid snapshot is not event
    // data) and let restore() re-validate shape.
    reset: () => restore(structuredClone(genesis)),
    getClockMs: () => clockMs,
    getStatus: statusOf,
    getProcessedTotal: () => processedIds.length,
    getPendingCount: () => pending.length,
  };
  return kernel;
}
