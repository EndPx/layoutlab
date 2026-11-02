// v3-M2b finite-resource acceptance tests. Service-time examples run
// through the accepted kernel clock (no second clock): literal
// independent oracles pin FIFO timings, output-held blocking, queue
// backpressure, tie-breaks and retained age.
import { describe, expect, test } from "vitest";
import {
  EVENT_PRIORITY,
  createKernel,
  createServiceStation,
  type OperationsResource,
} from "../src/index.js";

function oneLaneResource(overrides: Partial<OperationsResource> = {}): OperationsResource {
  return {
    id: "RES-TEST-1",
    kind: "packing",
    servicePositions: [{ id: "S1", x: 100, z: 100 }],
    queueSlots: [{ id: "Q1", x: 100, z: 200 }],
    serviceCapacity: 1,
    inputStagingCapacity: 0,
    outputStagingCapacity: 0,
    serviceDurationMs: 1000,
    ...overrides,
  };
}

describe("M2b acceptance 4: two-job station timings via the kernel", () => {
  test("A/B arrive 0, duration 1000: A 0/1000, B 1000/2000, B waits 1000; at 1500 B still active", () => {
    const station = createServiceStation(oneLaneResource());
    const kernel = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 100,
      onEvent: (event, api) => {
        if (event.kind === "arrival") {
          const jobId = (event.data as { jobId: string }).jobId;
          const queued = station.enqueue({ jobId, enqueueTimeMs: event.timeMs });
          expect(queued.status).toBe("queued");
          const started = station.tryStart({ jobId, timeMs: event.timeMs, inputReady: true });
          if (started.status === "started") {
            api.schedule({
              id: `done-${jobId}`,
              timeMs: started.startTimeMs + 1000,
              priority: EVENT_PRIORITY.COMPLETION,
              kind: "completion",
              data: { jobId },
            });
          }
        } else if (event.kind === "completion") {
          const jobId = (event.data as { jobId: string }).jobId;
          const done = station.completeService({ jobId, timeMs: event.timeMs, outputBlocked: false });
          expect(done).toEqual({ status: "released", jobId, finishTimeMs: event.timeMs });
          for (const job of station.snapshot().jobs) {
            if (job.state !== "queued") continue;
            const started = station.tryStart({ jobId: job.jobId, timeMs: event.timeMs, inputReady: true });
            if (started.status === "started") {
              api.schedule({
                id: `done-${job.jobId}`,
                timeMs: started.startTimeMs + 1000,
                priority: EVENT_PRIORITY.COMPLETION,
                kind: "completion",
                data: { jobId: job.jobId },
              });
            }
          }
        }
      },
    });
    kernel.schedule({ id: "arr-A", timeMs: 0, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival", data: { jobId: "A" } });
    kernel.schedule({ id: "arr-B", timeMs: 0, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival", data: { jobId: "B" } });

    // Mid-run probe: at t=1500 B is active with no finish time.
    const mid = kernel.advanceTo(1500);
    expect(mid.status).toBe("ready");
    const midJobs = Object.fromEntries(station.snapshot().jobs.map((j) => [j.jobId, j]));
    expect(midJobs.A).toMatchObject({ state: "released", startTimeMs: 0, finishTimeMs: 1000 });
    expect(midJobs.B).toMatchObject({ state: "in-service", startTimeMs: 1000, finishTimeMs: null });

    const end = kernel.advanceTo(2500);
    expect(end.status).toBe("queue-empty");
    const jobs = Object.fromEntries(station.snapshot().jobs.map((j) => [j.jobId, j]));
    expect(jobs.A).toMatchObject({
      state: "released", enqueueTimeMs: 0, startTimeMs: 0, finishTimeMs: 1000, waitMs: 0,
    });
    expect(jobs.B).toMatchObject({
      state: "released", enqueueTimeMs: 0, startTimeMs: 1000, finishTimeMs: 2000, waitMs: 1000,
    });
  });

  test("blocked output at 1000: A holds the lane until explicit release at 1500, B finishes 2500", () => {
    const station = createServiceStation(oneLaneResource());
    const kernel = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 100,
      onEvent: (event, api) => {
        if (event.kind === "arrival") {
          const jobId = (event.data as { jobId: string }).jobId;
          station.enqueue({ jobId, enqueueTimeMs: event.timeMs });
          const started = station.tryStart({ jobId, timeMs: event.timeMs, inputReady: true });
          if (started.status === "started") {
            api.schedule({
              id: `done-${jobId}`,
              timeMs: started.startTimeMs + 1000,
              priority: EVENT_PRIORITY.COMPLETION,
              kind: "completion",
              data: { jobId },
            });
          }
        } else if (event.kind === "completion") {
          const jobId = (event.data as { jobId: string }).jobId;
          if (jobId === "A") {
            // Downstream blocked: A finishes work but keeps position S1.
            const held = station.completeService({ jobId, timeMs: event.timeMs, outputBlocked: true });
            expect(held).toEqual({ status: "output-held", jobId: "A", finishTimeMs: 1000, positionId: "S1" });
            // B cannot start while A holds the only lane.
            expect(station.tryStart({ jobId: "B", timeMs: event.timeMs, inputReady: true })).toEqual({
              status: "waiting", jobId: "B", reason: "NO_CAPACITY",
            });
            api.schedule({
              id: "downstream-open",
              timeMs: 1500,
              priority: EVENT_PRIORITY.COMPLETION,
              kind: "downstream-release",
            });
          } else {
            station.completeService({ jobId, timeMs: event.timeMs, outputBlocked: false });
          }
        } else if (event.kind === "downstream-release") {
          station.releaseOutput({ jobId: "A", timeMs: event.timeMs });
          const started = station.tryStart({ jobId: "B", timeMs: event.timeMs, inputReady: true });
          expect(started.status).toBe("started");
          if (started.status === "started") {
            api.schedule({
              id: "done-B",
              timeMs: started.startTimeMs + 1000,
              priority: EVENT_PRIORITY.COMPLETION,
              kind: "completion",
              data: { jobId: "B" },
            });
          }
        }
      },
    });
    kernel.schedule({ id: "arr-A", timeMs: 0, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival", data: { jobId: "A" } });
    kernel.schedule({ id: "arr-B", timeMs: 0, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival", data: { jobId: "B" } });
    const end = kernel.advanceTo(3000);
    expect(end.status).toBe("queue-empty");
    const jobs = Object.fromEntries(station.snapshot().jobs.map((j) => [j.jobId, j]));
    expect(jobs.A).toMatchObject({
      state: "released", startTimeMs: 0, finishTimeMs: 1000, positionId: null, enqueueTimeMs: 0,
    });
    expect(jobs.B).toMatchObject({
      state: "released", startTimeMs: 1500, finishTimeMs: 2500, waitMs: 1500, enqueueTimeMs: 0,
    });
  });
});

describe("M2b acceptance 4: backpressure, tie-breaks, age and validation", () => {
  test("full queue yields a structured upstream wait without erasing or fabricating", () => {
    const station = createServiceStation(oneLaneResource());
    expect(station.enqueue({ jobId: "A", enqueueTimeMs: 0 })).toEqual({
      status: "queued", jobId: "A", queueSlotId: "Q1",
    });
    expect(station.tryStart({ jobId: "A", timeMs: 0, inputReady: true }).status).toBe("started");
    expect(station.enqueue({ jobId: "B", enqueueTimeMs: 1 })).toEqual({
      status: "queued", jobId: "B", queueSlotId: "Q1",
    });
    // The only queue slot is taken: C waits upstream, explicitly.
    expect(station.enqueue({ jobId: "C", enqueueTimeMs: 2 })).toEqual({
      status: "waiting-outside",
      jobId: "C",
      reason: { code: "QUEUE_FULL", queueSlots: 1, queued: 1 },
    });
    const snap = station.snapshot();
    expect(snap.jobs.map((j) => j.jobId)).toEqual(["A", "B"]);
    expect(snap.jobs.find((j) => j.jobId === "B")).toMatchObject({ state: "queued", queueSlotId: "Q1" });
  });

  test("same-time enqueue breaks ties by job id; non-head and not-ready wait", () => {
    const station = createServiceStation(
      oneLaneResource({ queueSlots: [{ id: "Q1", x: 100, z: 200 }, { id: "Q2", x: 200, z: 200 }] }),
    );
    station.enqueue({ jobId: "B", enqueueTimeMs: 5 });
    station.enqueue({ jobId: "A", enqueueTimeMs: 5 });
    // B arrived first but A sorts first: B is not the head.
    expect(station.tryStart({ jobId: "B", timeMs: 5, inputReady: true })).toEqual({
      status: "waiting", jobId: "B", reason: "NOT_HEAD",
    });
    expect(station.tryStart({ jobId: "A", timeMs: 5, inputReady: false })).toEqual({
      status: "waiting", jobId: "A", reason: "INPUT_NOT_READY",
    });
    const started = station.tryStart({ jobId: "A", timeMs: 6, inputReady: true });
    expect(started).toEqual({ status: "started", jobId: "A", positionId: "S1", startTimeMs: 6, waitMs: 1 });
  });

  test("validation: duplicates, unknown jobs, early completion and bad releases", () => {
    const station = createServiceStation(oneLaneResource());
    station.enqueue({ jobId: "A", enqueueTimeMs: 0 });
    expect(() => station.enqueue({ jobId: "A", enqueueTimeMs: 1 })).toThrow(/duplicate job id/);
    expect(() => station.tryStart({ jobId: "ghost", timeMs: 0, inputReady: true })).toThrow(/unknown job/);
    station.tryStart({ jobId: "A", timeMs: 0, inputReady: true });
    // Duration 1000: completing at 999 is rejected, state unchanged.
    expect(() => station.completeService({ jobId: "A", timeMs: 999, outputBlocked: false })).toThrow(
      /no earlier than 1000/,
    );
    expect(station.snapshot().jobs[0]).toMatchObject({ state: "in-service", finishTimeMs: null });
    expect(() => station.releaseOutput({ jobId: "A", timeMs: 1000 })).toThrow(/nothing held/);
    expect(() => station.completeService({ jobId: "A", timeMs: 1000, outputBlocked: true })).not.toThrow();
    expect(station.snapshot().jobs[0]).toMatchObject({ state: "output-held", positionId: "S1" });
    expect(Object.isFrozen(station.snapshot())).toBe(true);
  });
});
