import { describe, expect, test } from "vitest";
import {
  EVENT_PRIORITY,
  createKernel,
  type Kernel,
} from "../src/index.js";

describe("kernel execution bounds", () => {
  test("a zero-time self-scheduling chain stops invalid with a diagnostic, no hang", () => {
    let executions = 0;
    const kernel = createKernel({
      maxProcessedEvents: 10000,
      maxEventsPerTimestamp: 8,
      onEvent: (event, api) => {
        executions += 1;
        api.schedule({
          id: `chain-${executions}`,
          timeMs: event.timeMs,
          priority: EVENT_PRIORITY.START,
          kind: "chain",
        });
      },
      initialEvents: [
        { id: "chain-0", timeMs: 10, priority: EVENT_PRIORITY.START, kind: "chain" },
      ],
    });
    const end = kernel.advanceTo(10);
    expect(end.status).toBe("invalid");
    expect(end.diagnostic).toContain("zero-time-work bound exceeded");
    expect(end.diagnostic).toContain("t=10");
    expect(executions).toBe(8);
    expect(kernel.getProcessedTotal()).toBe(8);
    expect(kernel.getClockMs()).toBe(10);
    // Pending work is retained for diagnosis, never silently discarded.
    expect(kernel.getPendingCount()).toBe(1);
    expect(kernel.snapshot().failedEvent?.id).toBe("chain-8");
  });

  test("the global processed-event bound stops invalid with the failed event retained", () => {
    const seen: string[] = [];
    const kernel = createKernel({
      maxProcessedEvents: 3,
      maxEventsPerTimestamp: 1000,
      onEvent: (event) => void seen.push(event.id),
    });
    for (let i = 0; i < 5; i += 1) {
      kernel.schedule({ id: `e${i}`, timeMs: i * 10, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    }
    const end = kernel.advanceTo(100);
    expect(end.status).toBe("invalid");
    expect(end.diagnostic).toContain("processed-event bound exceeded");
    expect(seen).toEqual(["e0", "e1", "e2"]);
    expect(kernel.getProcessedTotal()).toBe(3);
    expect(kernel.getPendingCount()).toBe(2);
    expect(kernel.snapshot().failedEvent?.id).toBe("e3");
    // The clock never jumps past the unprocessed due event.
    expect(kernel.getClockMs()).toBe(20);
  });

  test("bounds do not reset between advanceTo calls: chunked and one-shot agree", () => {
    const script = (kernel: Kernel): void => {
      for (let i = 0; i < 6; i += 1) {
        kernel.schedule({ id: `s${i}`, timeMs: 10, priority: EVENT_PRIORITY.START, kind: "probe" });
      }
    };
    const chunked = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 4,
      onEvent: () => {},
    });
    script(chunked);
    chunked.advanceTo(5);
    const chunkedEnd = chunked.advanceTo(10);

    const oneshot = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 4,
      onEvent: () => {},
    });
    script(oneshot);
    const oneshotEnd = oneshot.advanceTo(10);

    expect(chunkedEnd).toEqual(oneshotEnd);
    expect(chunkedEnd.status).toBe("invalid");
    expect(chunked.snapshot()).toEqual(oneshot.snapshot());
  });

  test("a handler error stops invalid, preserves the failed event, runs nothing later", () => {
    const seen: string[] = [];
    const kernel = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 100,
      onEvent: (event) => {
        seen.push(event.id);
        if (event.id === "boom") {
          throw new Error("conveyor jam");
        }
      },
    });
    kernel.schedule({ id: "ok", timeMs: 5, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    kernel.schedule({ id: "boom", timeMs: 10, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    kernel.schedule({ id: "later", timeMs: 15, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" });
    const end = kernel.advanceTo(20);
    expect(end.status).toBe("invalid");
    expect(end.diagnostic).toBe("handler error on boom: conveyor jam");
    expect(seen).toEqual(["ok", "boom"]);
    const snap = kernel.snapshot();
    expect(snap.failedEvent?.id).toBe("boom");
    expect(snap.diagnostic).toBe("handler error on boom: conveyor jam");
    expect(snap.processedIds).toEqual(["ok", "boom"]);
    // The failed event counts as processed exactly once: never retried.
    const again = kernel.stepEvent();
    expect(again.status).toBe("invalid");
    expect(again.eventId).toBe("boom");
    expect(seen).toEqual(["ok", "boom"]);
    expect(() =>
      kernel.schedule({ id: "after", timeMs: 20, priority: EVENT_PRIORITY.ARRIVAL, kind: "probe" }),
    ).toThrow();
    // Cancelling on an invalid kernel is a safe no-op, not a revival.
    expect(kernel.cancel("later")).toBe(false);
  });
});
