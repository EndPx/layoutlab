// v3-M2b finite service/queue state. Pure headless transitions with
// explicit timeMs arguments: the accepted kernel supplies time in
// examples/tests/proofs; this module builds no clock.
//
// Model per configured resource: queued jobs each hold one concrete
// queue slot; in-service and output-held jobs each hold one concrete
// service position. Concurrency equals serviceCapacity, which must not
// exceed the physical position count (rejected at construction, never
// silently minimized). FIFO order is (enqueueTimeMs, jobId); the original
// enqueue time is never rewritten, so waiting/retries keep their age.
// A zero-queue resource admits one direct-service job at the idle lane
// entrance (queueSlotId null, no invented coordinates); further jobs wait
// upstream and retry with their original age.
//
// States: queued -> in-service -> released, with completed-but-blocked
// output-held between service completion and explicit downstream
// release. A held job retains its occupied position until releaseOutput.
// Returning a slot grant never authorizes physical movement: allocation
// and movement stay distinct for the M3 controller. Service completion
// never ships an order and never touches inventory.
import {
  MAX_ID_LEN,
  MAX_TIME_MS,
  operationsResourceSchema,
  type OperationsResource,
} from "./schema.js";

export type ServiceJobState = "queued" | "in-service" | "output-held" | "released";

export type ServiceJobView = {
  jobId: string;
  state: ServiceJobState;
  enqueueTimeMs: number;
  queueSlotId: string | null;
  positionId: string | null;
  startTimeMs: number | null;
  finishTimeMs: number | null;
  waitMs: number | null;
};

export type EnqueueResult =
  // queueSlotId is null only for zero-queue direct-service admission: the
  // job waits at the idle lane entrance without invented coordinates.
  | { status: "queued"; jobId: string; queueSlotId: string | null }
  | {
      status: "waiting-outside";
      jobId: string;
      reason: { code: "QUEUE_FULL"; queueSlots: number; queued: number };
    };

export type StartResult =
  | { status: "started"; jobId: string; positionId: string; startTimeMs: number; waitMs: number }
  | { status: "waiting"; jobId: string; reason: "INPUT_NOT_READY" | "NOT_HEAD" | "NO_CAPACITY" };

export type CompleteResult =
  | { status: "released"; jobId: string; finishTimeMs: number }
  | { status: "output-held"; jobId: string; finishTimeMs: number; positionId: string };

export type ServiceSnapshot = {
  resourceId: string;
  serviceCapacity: number;
  serviceDurationMs: number;
  jobs: ServiceJobView[];
};

function assertId(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_ID_LEN) {
    throw new Error(`${what} must be a 1..${MAX_ID_LEN} character string`);
  }
  return value;
}

function assertTimeMs(value: unknown, what: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_TIME_MS) {
    throw new Error(`${what} must be a safe integer in 0..${MAX_TIME_MS}`);
  }
  return value as number;
}

function freezeDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) freezeDeep((value as Record<string, unknown>)[key]);
    return Object.freeze(value);
  }
  return value;
}

type Job = {
  jobId: string;
  state: ServiceJobState;
  enqueueTimeMs: number;
  queueSlotId: string | null;
  positionId: string | null;
  startTimeMs: number | null;
  finishTimeMs: number | null;
};

export type ServiceStation = {
  enqueue: (cmd: { jobId: string; enqueueTimeMs: number }) => EnqueueResult;
  tryStart: (cmd: { jobId: string; timeMs: number; inputReady: boolean }) => StartResult;
  completeService: (cmd: { jobId: string; timeMs: number; outputBlocked: boolean }) => CompleteResult;
  releaseOutput: (cmd: { jobId: string; timeMs: number }) => { status: "released"; jobId: string };
  snapshot: () => ServiceSnapshot;
};

export function createServiceStation(resource: OperationsResource): ServiceStation {
  // Validate with the shared schema and snapshot the configuration: later
  // caller mutation of duration/capacity/position arrays cannot alter this
  // station. Only the snapshot below is read afterwards.
  const cfg = operationsResourceSchema.parse(resource);
  const resourceId = cfg.id;
  const serviceCapacity = cfg.serviceCapacity;
  const serviceDurationMs = cfg.serviceDurationMs;
  const positionIds = cfg.servicePositions.map((s) => s.id);
  const queueIds = cfg.queueSlots.map((s) => s.id);
  if (serviceCapacity > positionIds.length) {
    throw new Error(
      `resource ${resourceId} serviceCapacity ${serviceCapacity} exceeds ${positionIds.length} service positions; ` +
        `reconcile configured positions with capacity before live admission`,
    );
  }
  // Narrow consistency checks mirroring scenario parsing: slot ids and
  // coordinates are unique within the resource (no shared floor position).
  const slotIds = [...cfg.servicePositions, ...cfg.queueSlots].map((s) => s.id);
  if (new Set(slotIds).size !== slotIds.length) {
    throw new Error(`resource ${resourceId} reuses a slot id`);
  }
  const slotCoords = [...cfg.servicePositions, ...cfg.queueSlots].map((s) => `${s.x},${s.z}`);
  if (new Set(slotCoords).size !== slotCoords.length) {
    throw new Error(`resource ${resourceId} stacks slots at one coordinate`);
  }
  const jobs = new Map<string, Job>();
  // Last release per service position: a freed lane cannot accept a start
  // before this time, or saved intervals would overlap on one lane.
  const positionReleasedAt = new Map<string, number>();

  const occupiedPositions = (): Set<string> => {
    const used = new Set<string>();
    for (const job of jobs.values()) {
      if ((job.state === "in-service" || job.state === "output-held") && job.positionId) {
        used.add(job.positionId);
      }
    }
    return used;
  };

  const occupiedQueueSlots = (): Set<string> => {
    const used = new Set<string>();
    for (const job of jobs.values()) {
      if (job.state === "queued" && job.queueSlotId) used.add(job.queueSlotId);
    }
    return used;
  };

  const queuedByFifo = (): Job[] =>
    [...jobs.values()]
      .filter((j) => j.state === "queued")
      .sort((a, b) => a.enqueueTimeMs - b.enqueueTimeMs || (a.jobId < b.jobId ? -1 : 1));

  const firstFree = (ids: string[], used: Set<string>): string | null => {
    for (const id of ids) {
      if (!used.has(id)) return id;
    }
    return null;
  };

  const station: ServiceStation = {
    enqueue: (cmd) => {
      const jobId = assertId(cmd.jobId, "jobId");
      const enqueueTimeMs = assertTimeMs(cmd.enqueueTimeMs, "enqueueTimeMs");
      if (jobs.has(jobId)) throw new Error(`duplicate job id: ${jobId}`);
      const queued = queuedByFifo();
      const slot = firstFree(queueIds, occupiedQueueSlots());
      // A full queue yields a structured upstream wait: the task is NOT
      // erased and NO floor position is fabricated for it.
      if (slot === null) {
        // Zero-queue direct service: one job may wait at the idle lane
        // entrance with no queue slot. A second job, or a busy lane, waits
        // upstream and retries later with its original enqueue age.
        if (queueIds.length === 0 && queued.length === 0) {
          const busyLanes = [...jobs.values()].filter(
            (j) => j.state === "in-service" || j.state === "output-held",
          ).length;
          if (busyLanes < serviceCapacity) {
            jobs.set(jobId, {
              jobId,
              state: "queued",
              enqueueTimeMs,
              queueSlotId: null,
              positionId: null,
              startTimeMs: null,
              finishTimeMs: null,
            });
            return { status: "queued", jobId, queueSlotId: null };
          }
        }
        return {
          status: "waiting-outside",
          jobId,
          reason: { code: "QUEUE_FULL", queueSlots: queueIds.length, queued: queued.length },
        };
      }
      jobs.set(jobId, {
        jobId,
        state: "queued",
        enqueueTimeMs,
        queueSlotId: slot,
        positionId: null,
        startTimeMs: null,
        finishTimeMs: null,
      });
      return { status: "queued", jobId, queueSlotId: slot };
    },

    tryStart: (cmd) => {
      const jobId = assertId(cmd.jobId, "jobId");
      const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
      if (typeof cmd.inputReady !== "boolean") throw new Error("inputReady must be a boolean");
      const job = jobs.get(jobId);
      if (!job) throw new Error(`unknown job ${jobId}`);
      if (job.state !== "queued") throw new Error(`job ${jobId} is ${job.state}, cannot start`);
      if (timeMs < job.enqueueTimeMs) {
        throw new Error(`job ${jobId} cannot start at ${timeMs} before enqueue ${job.enqueueTimeMs}`);
      }
      if (timeMs + serviceDurationMs > MAX_TIME_MS) {
        throw new Error(
          `job ${jobId} start ${timeMs}+duration ${serviceDurationMs} exceeds max time ${MAX_TIME_MS}`,
        );
      }
      if (!cmd.inputReady) return { status: "waiting", jobId, reason: "INPUT_NOT_READY" };
      const head = queuedByFifo()[0];
      if (!head || head.jobId !== jobId) return { status: "waiting", jobId, reason: "NOT_HEAD" };
      const busy = [...jobs.values()].filter(
        (j) => j.state === "in-service" || j.state === "output-held",
      ).length;
      const used = occupiedPositions();
      const freePosition = firstFree(positionIds, used);
      if (busy >= serviceCapacity || freePosition === null) {
        return { status: "waiting", jobId, reason: "NO_CAPACITY" };
      }
      const eligible = positionIds.find(
        (id) => !used.has(id) && (positionReleasedAt.get(id) ?? -1) <= timeMs,
      );
      if (eligible === undefined) {
        throw new Error(
          `job ${jobId} cannot start at ${timeMs} before lane release ${positionReleasedAt.get(freePosition)}`,
        );
      }
      job.state = "in-service";
      job.queueSlotId = null;
      job.positionId = eligible;
      job.startTimeMs = timeMs;
      return { status: "started", jobId, positionId: eligible, startTimeMs: timeMs, waitMs: timeMs - job.enqueueTimeMs };
    },

    completeService: (cmd) => {
      const jobId = assertId(cmd.jobId, "jobId");
      const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
      if (typeof cmd.outputBlocked !== "boolean") throw new Error("outputBlocked must be a boolean");
      const job = jobs.get(jobId);
      if (!job) throw new Error(`unknown job ${jobId}`);
      if (job.state !== "in-service") throw new Error(`job ${jobId} is ${job.state}, cannot complete`);
      const earliest = (job.startTimeMs ?? 0) + serviceDurationMs;
      if (timeMs < earliest) {
        throw new Error(`job ${jobId} completes no earlier than ${earliest}, got ${timeMs}`);
      }
      job.finishTimeMs = timeMs;
      if (cmd.outputBlocked) {
        // Finished work retains its occupied lane until explicit release.
        job.state = "output-held";
        return { status: "output-held", jobId, finishTimeMs: timeMs, positionId: job.positionId as string };
      }
      const lane = job.positionId as string;
      job.state = "released";
      job.positionId = null;
      positionReleasedAt.set(lane, timeMs);
      return { status: "released", jobId, finishTimeMs: timeMs };
    },

    releaseOutput: (cmd) => {
      const jobId = assertId(cmd.jobId, "jobId");
      const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
      const job = jobs.get(jobId);
      if (!job) throw new Error(`unknown job ${jobId}`);
      if (job.state !== "output-held") throw new Error(`job ${jobId} is ${job.state}, nothing held to release`);
      if (job.finishTimeMs !== null && timeMs < job.finishTimeMs) {
        throw new Error(`job ${jobId} cannot release at ${timeMs} before finish ${job.finishTimeMs}`);
      }
      const lane = job.positionId as string;
      job.state = "released";
      job.positionId = null;
      positionReleasedAt.set(lane, timeMs);
      return { status: "released", jobId };
    },

    snapshot: () => {
      const views: ServiceJobView[] = [...jobs.values()]
        .map((j) => ({
          jobId: j.jobId,
          state: j.state,
          enqueueTimeMs: j.enqueueTimeMs,
          queueSlotId: j.queueSlotId,
          positionId: j.positionId,
          startTimeMs: j.startTimeMs,
          finishTimeMs: j.finishTimeMs,
          waitMs: j.startTimeMs === null ? null : j.startTimeMs - j.enqueueTimeMs,
        }))
        .sort((a, b) => a.enqueueTimeMs - b.enqueueTimeMs || (a.jobId < b.jobId ? -1 : 1));
      return freezeDeep({
        resourceId,
        serviceCapacity,
        serviceDurationMs,
        jobs: views,
      });
    },
  };

  return station;
}
