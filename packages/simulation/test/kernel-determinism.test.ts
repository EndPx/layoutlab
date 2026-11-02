import { describe, expect, test } from "vitest";
import {
  EVENT_PRIORITY,
  OPERATIONS_ENGINE_VERSION,
  createKernel,
  type Kernel,
} from "../src/index.js";

const limits = { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 };

// Shared script: mixed times/priorities, a same-time causal insertion, a
// mid-run cancellation, and a stale plan skip. Every chunking below runs
// this identical script headlessly: no rendering or model API involved.
function scriptedKernel(seen: string[]): Kernel {
  // The script is the creation-time initial schedule, so reset() replays it.
  return createKernel({
    ...limits,
    onEvent: (event, api) => {
      seen.push(`${event.timeMs}:${event.id}`);
      if (event.id === "trigger") {
        api.schedule({ id: "caused", timeMs: 40, priority: EVENT_PRIORITY.DISPATCH, kind: "probe" });
        api.cancel("cancelled");
      }
      if (event.id === "replan") {
        api.setTaskPlanVersion("T-1", 2);
      }
    },
    initialEvents: [
      { id: "o1", timeMs: 0, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival" },
      { id: "trigger", timeMs: 40, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival" },
      { id: "cancelled", timeMs: 80, priority: EVENT_PRIORITY.START, kind: "move" },
      { id: "old-plan", timeMs: 90, priority: EVENT_PRIORITY.START, kind: "move", taskId: "T-1", planVersion: 1 },
      { id: "replan", timeMs: 50, priority: EVENT_PRIORITY.DISPATCH, kind: "replan" },
      { id: "new-plan", timeMs: 100, priority: EVENT_PRIORITY.START, kind: "move", taskId: "T-1", planVersion: 2 },
      { id: "done", timeMs: 120, priority: EVENT_PRIORITY.COMPLETION, kind: "completion" },
    ],
  });
}

function drainBySteps(kernel: Kernel, horizon: number): void {
  let guard = 100000;
  while (kernel.getClockMs() < horizon && guard-- > 0) {
    const result = kernel.stepEvent();
    if (result.status !== "ready") {
      break;
    }
  }
  expect(guard).toBeGreaterThan(0);
  kernel.advanceTo(horizon);
}

function drainByChunks(kernel: Kernel, horizon: number, chunk: number): void {
  for (let t = chunk; t < horizon; t += chunk) {
    kernel.advanceTo(t);
  }
  kernel.advanceTo(horizon);
}

describe("kernel determinism across step sizes", () => {
  test("step-one vs 1x/4x/16x chunkings vs one headless horizon agree exactly", () => {
    const horizon = 160;
    const runs: { seen: string[]; clock: number; snapshot: unknown }[] = [];

    const byStepsSeen: string[] = [];
    const bySteps = scriptedKernel(byStepsSeen);
    drainBySteps(bySteps, horizon);
    runs.push({ seen: byStepsSeen, clock: bySteps.getClockMs(), snapshot: bySteps.snapshot() });

    // 1x/4x/16x-equivalent chunk sizes over the same horizon.
    for (const chunk of [10, 40, 160]) {
      const seen: string[] = [];
      const kernel = scriptedKernel(seen);
      drainByChunks(kernel, horizon, chunk);
      runs.push({ seen, clock: kernel.getClockMs(), snapshot: kernel.snapshot() });
    }

    // Independent literal expectation for the script (not a copy of the
    // implementation): trigger@40 inserts caused@40(p20) and cancels
    // cancelled@80; replan@50 stales old-plan@90.
    const expected = [
      "0:o1",
      "40:trigger",
      "40:caused",
      "50:replan",
      "100:new-plan",
      "120:done",
    ];
    for (const run of runs) {
      expect(run.seen).toEqual(expected);
      expect(run.clock).toBe(horizon);
      expect(run.snapshot).toEqual(runs[0].snapshot);
    }
    // Queue exhaustion is kernel state, not a business completion claim.
    expect(bySteps.getStatus()).toBe("queue-empty");
  });

  test("causal chains cannot run past the horizon slice they were yielded to", () => {
    const seen: string[] = [];
    const kernel = probeAtHorizon(seen);
    kernel.advanceTo(10);
    expect(seen).toEqual(["first"]);
    expect(kernel.getPendingCount()).toBe(1);
    kernel.advanceTo(20);
    expect(seen).toEqual(["first", "second"]);
  });

  function probeAtHorizon(seen: string[]): Kernel {
    return createKernel({
      ...limits,
      onEvent: (event, api) => {
        seen.push(event.id);
        if (event.id === "first") {
          api.schedule({ id: "second", timeMs: 20, priority: EVENT_PRIORITY.COMPLETION, kind: "probe" });
        }
      },
      initialEvents: [
        { id: "first", timeMs: 10, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" },
      ],
    });
  }
});

describe("kernel clock discipline", () => {
  test("backward and non-integer advanceTo targets are rejected", () => {
    const kernel = createKernel({ ...limits, onEvent: () => {} });
    kernel.advanceTo(10);
    expect(() => kernel.advanceTo(9)).toThrow();
    expect(() => kernel.advanceTo(10.5)).toThrow();
    expect(() => kernel.advanceTo(Number.NaN)).toThrow();
    expect(kernel.getClockMs()).toBe(10);
  });

  test("reset restores the exact initial state", () => {
    const seen: string[] = [];
    const kernel = scriptedKernel(seen);
    const genesis = kernel.snapshot();
    kernel.advanceTo(160);
    expect(seen.length).toBeGreaterThan(0);
    kernel.reset();
    expect(kernel.snapshot()).toEqual(genesis);
    expect(kernel.getClockMs()).toBe(0);
    expect(kernel.getProcessedTotal()).toBe(0);
    expect(kernel.getStatus()).toBe("ready");
    // And the reset kernel replays identically.
    seen.length = 0;
    kernel.advanceTo(160);
    expect(seen).toEqual([
      "0:o1",
      "40:trigger",
      "40:caused",
      "50:replan",
      "100:new-plan",
      "120:done",
    ]);
  });
});

describe("kernel snapshot restore", () => {
  test("a restored peer continues identically and preserves order", () => {
    const seenA: string[] = [];
    const kernelA = scriptedKernel(seenA);
    kernelA.advanceTo(45);
    const mid = kernelA.snapshot();

    const seenB: string[] = [];
    const kernelB = createKernel({
      ...limits,
      onEvent: (event, api) => {
        seenB.push(`${event.timeMs}:${event.id}`);
        if (event.id === "replan") {
          api.setTaskPlanVersion("T-1", 2);
        }
      },
    });
    kernelB.restore(JSON.parse(JSON.stringify(mid)));
    kernelA.advanceTo(160);
    kernelB.advanceTo(160);
    expect(kernelB.snapshot()).toEqual(kernelA.snapshot());
    expect(seenB).toEqual(["50:replan", "100:new-plan", "120:done"]);
  });

  test("tampered snapshots are rejected", () => {
    const kernel = scriptedKernel([]);
    kernel.advanceTo(45);
    const good = JSON.parse(JSON.stringify(kernel.snapshot())) as Record<string, unknown>;
    const peer = (): Kernel =>
      createKernel({ ...limits, onEvent: () => {} });

    const engine = structuredClone(good);
    engine.engineVersion = "other/9";
    expect(() => peer().restore(engine)).toThrow();

    const dup = structuredClone(good);
    (dup.processedIds as string[]).push((dup.processedIds as string[])[0]);
    expect(() => peer().restore(dup)).toThrow();

    const past = structuredClone(good);
    ((past.pending as Record<string, unknown>[])[0].timeMs as number) = 0;
    expect(() => peer().restore(past)).toThrow();

    const limitsMismatch = structuredClone(good);
    limitsMismatch.maxProcessedEvents = 5;
    expect(() => peer().restore(limitsMismatch)).toThrow();

    expect(() => peer().restore(null)).toThrow();
    expect(() => peer().restore("nope")).toThrow();
  });

  test("snapshots carry engine version, clock, and trace, never business metrics", () => {
    const kernel = scriptedKernel([]);
    kernel.advanceTo(160);
    const snap = kernel.snapshot();
    expect(snap.engineVersion).toBe(OPERATIONS_ENGINE_VERSION);
    expect(Object.keys(snap).sort()).toEqual(
      [
        "cancelledIds",
        "clockMs",
        "countAtTimestamp",
        "diagnostic",
        "engineVersion",
        "failedEvent",
        "maxEventsPerTimestamp",
        "maxProcessedEvents",
        "nextSequence",
        "pending",
        "processedIds",
        "processedTotal",
        "staleSkippedIds",
        "status",
        "taskPlanVersions",
        "timestampOfCount",
      ].sort(),
    );
  });
});
