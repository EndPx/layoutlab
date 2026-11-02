import { describe, expect, test } from "vitest";
import {
  EVENT_PRIORITY,
  createKernel,
  type Kernel,
} from "../src/index.js";

const limits = { maxProcessedEvents: 1000, maxEventsPerTimestamp: 1000 };

function probeKernel(seen: string[]): Kernel {
  return createKernel({ ...limits, onEvent: (event) => void seen.push(event.id) });
}

describe("kernel event ordering", () => {
  test("at t=10 completion(0) runs before arrival(10) before FIFO ties", () => {
    const seen: string[] = [];
    const kernel = probeKernel(seen);
    // Scheduled out of order on purpose: tie-b (seq 0), completion (1),
    // arrival (2), tie-a (3). Priority beats insertion; ties keep FIFO.
    kernel.schedule({ id: "tie-b", timeMs: 10, priority: EVENT_PRIORITY.START, kind: "probe" });
    kernel.schedule({ id: "comp", timeMs: 10, priority: EVENT_PRIORITY.COMPLETION, kind: "probe" });
    kernel.schedule({ id: "arr", timeMs: 10, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    kernel.schedule({ id: "tie-a", timeMs: 10, priority: EVENT_PRIORITY.START, kind: "probe" });
    const end = kernel.advanceTo(10);
    expect(end.status).toBe("queue-empty");
    expect(seen).toEqual(["comp", "arr", "tie-b", "tie-a"]);
    expect(kernel.getClockMs()).toBe(10);
  });

  test("same-time causal insertion runs next among pending, parents never reorder", () => {
    const seen: string[] = [];
    const kernel = createKernel({
      ...limits,
      onEvent: (event, api) => {
        seen.push(event.id);
        if (event.id === "parent") {
          // Higher priority than the pending waiter, lower than the
          // already-executed completion: pinned between them.
          api.schedule({ id: "child", timeMs: 10, priority: EVENT_PRIORITY.DISPATCH, kind: "probe" });
        }
      },
    });
    kernel.schedule({ id: "comp", timeMs: 10, priority: EVENT_PRIORITY.COMPLETION, kind: "probe" });
    kernel.schedule({ id: "parent", timeMs: 10, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    kernel.schedule({ id: "waiter", timeMs: 10, priority: EVENT_PRIORITY.START, kind: "probe" });
    kernel.advanceTo(10);
    expect(seen).toEqual(["comp", "parent", "child", "waiter"]);
  });

  test("earlier time always beats higher priority", () => {
    const seen: string[] = [];
    const kernel = probeKernel(seen);
    kernel.schedule({ id: "late-urgent", timeMs: 20, priority: EVENT_PRIORITY.COMPLETION, kind: "probe" });
    kernel.schedule({ id: "early-lazy", timeMs: 5, priority: EVENT_PRIORITY.START, kind: "probe" });
    kernel.advanceTo(20);
    expect(seen).toEqual(["early-lazy", "late-urgent"]);
  });

  test("scheduling in the past or with a duplicate id is rejected", () => {
    const kernel = probeKernel([]);
    kernel.schedule({ id: "a", timeMs: 10, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    kernel.advanceTo(10);
    expect(() =>
      kernel.schedule({ id: "late", timeMs: 9, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" }),
    ).toThrow();
    expect(() =>
      kernel.schedule({ id: "a", timeMs: 11, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" }),
    ).toThrow();
  });
});

describe("kernel cancellation", () => {
  test("cancel removes execution without reusing the id", () => {
    const seen: string[] = [];
    const kernel = probeKernel(seen);
    kernel.schedule({ id: "doomed", timeMs: 10, priority: EVENT_PRIORITY.COMPLETION, kind: "probe" });
    kernel.schedule({ id: "kept", timeMs: 10, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    expect(kernel.cancel("doomed")).toBe(true);
    expect(kernel.cancel("doomed")).toBe(false);
    expect(kernel.cancel("unknown")).toBe(false);
    kernel.advanceTo(10);
    expect(seen).toEqual(["kept"]);
    // The cancelled id stays claimed for the run lifetime.
    expect(() =>
      kernel.schedule({ id: "doomed", timeMs: 20, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" }),
    ).toThrow();
    expect(kernel.snapshot().cancelledIds).toEqual(["doomed"]);
  });

  test("a handler can cancel a pending event deterministically", () => {
    const seen: string[] = [];
    const kernel = createKernel({
      ...limits,
      onEvent: (event, api) => {
        seen.push(event.id);
        if (event.id === "first") {
          expect(api.cancel("second")).toBe(true);
        }
      },
    });
    kernel.schedule({ id: "first", timeMs: 10, priority: EVENT_PRIORITY.COMPLETION, kind: "probe" });
    kernel.schedule({ id: "second", timeMs: 20, priority: EVENT_PRIORITY.COMPLETION, kind: "probe" });
    kernel.advanceTo(20);
    expect(seen).toEqual(["first"]);
  });
});

describe("kernel stale plan versions", () => {
  test("stale task events are skipped, never invoked, with a deterministic trace", () => {
    const seen: string[] = [];
    const kernel = createKernel({
      ...limits,
      onEvent: (event, api) => {
        seen.push(event.id);
        if (event.id === "replan") {
          api.setTaskPlanVersion("T-1", 2);
        }
      },
    });
    kernel.schedule({ id: "old-plan", timeMs: 10, priority: EVENT_PRIORITY.START, kind: "move", taskId: "T-1", planVersion: 1 });
    kernel.schedule({ id: "replan", timeMs: 5, priority: EVENT_PRIORITY.DISPATCH, kind: "replan" });
    kernel.schedule({ id: "new-plan", timeMs: 15, priority: EVENT_PRIORITY.START, kind: "move", taskId: "T-1", planVersion: 2 });
    const end = kernel.advanceTo(20);
    expect(end.status).toBe("queue-empty");
    expect(seen).toEqual(["replan", "new-plan"]);
    const snap = kernel.snapshot();
    expect(snap.staleSkippedIds).toEqual(["old-plan"]);
    expect(snap.processedIds).toEqual(["replan", "new-plan"]);
  });

  test("current-plan events still execute after a version bump", () => {
    const seen: string[] = [];
    const kernel = probeKernel(seen);
    kernel.setTaskPlanVersion("T-9", 3);
    kernel.schedule({ id: "v3", timeMs: 10, priority: EVENT_PRIORITY.START, kind: "move", taskId: "T-9", planVersion: 3 });
    kernel.schedule({ id: "v2", timeMs: 11, priority: EVENT_PRIORITY.START, kind: "move", taskId: "T-9", planVersion: 2 });
    kernel.advanceTo(11);
    expect(seen).toEqual(["v3"]);
    expect(kernel.snapshot().staleSkippedIds).toEqual(["v2"]);
  });

  test("plan versions cannot move backward", () => {
    const kernel = probeKernel([]);
    kernel.setTaskPlanVersion("T-1", 2);
    expect(() => kernel.setTaskPlanVersion("T-1", 1)).toThrow();
  });
});

describe("kernel isolation", () => {
  test("mutating the schedule input afterwards does not affect the kernel", () => {
    const seen: { time: number; note: string }[] = [];
    const kernel = createKernel({
      ...limits,
      onEvent: (event) =>
        seen.push({ time: event.timeMs, note: (event.data as { note: string }).note }),
    });
    const input = {
      id: "m",
      timeMs: 10,
      priority: EVENT_PRIORITY.ARRIVAL,
      kind: "probe",
      data: { note: "original" },
    };
    kernel.schedule(input);
    input.timeMs = 99;
    (input.data as { note: string }).note = "tampered";
    kernel.advanceTo(10);
    expect(seen).toEqual([{ time: 10, note: "original" }]);
  });

  test("mutating an exported snapshot does not change actual processing", () => {
    const seen: string[] = [];
    const kernel = probeKernel(seen);
    kernel.schedule({ id: "a", timeMs: 10, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    kernel.schedule({ id: "b", timeMs: 20, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    const snap = kernel.snapshot() as unknown as Record<string, unknown>;
    expect(() => {
      (snap.pending as Record<string, unknown>[]).length = 0;
      snap.clockMs = 999;
    }).toThrow();
    kernel.advanceTo(20);
    expect(seen).toEqual(["a", "b"]);
    expect(kernel.getClockMs()).toBe(20);
  });

  test("mutating a handler-side event view does not corrupt the kernel", () => {
    const kernel = createKernel({
      ...limits,
      onEvent: (event) => {
        (event.data as { note: string }).note = "tampered";
        (event as unknown as Record<string, unknown>).id = "renamed";
      },
    });
    kernel.schedule({
      id: "v",
      timeMs: 10,
      priority: EVENT_PRIORITY.ARRIVAL,
      kind: "probe",
      data: { note: "original" },
    });
    kernel.advanceTo(10);
    expect(kernel.snapshot().processedIds).toEqual(["v"]);
  });
});
