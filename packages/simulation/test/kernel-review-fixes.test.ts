import { describe, expect, test } from "vitest";
import {
  EVENT_PRIORITY,
  createKernel,
  type Kernel,
  type KernelSnapshot,
} from "../src/index.js";

const cloneSnapshot = (snap: KernelSnapshot): Record<string, unknown> =>
  JSON.parse(JSON.stringify(snap)) as Record<string, unknown>;

describe("review fix: invalid snapshots restore (bound vs handler failures)", () => {
  test("global bound failure round-trips: e2 stays pending, e1 last processed", () => {
    const seen: string[] = [];
    const kernel = createKernel({
      maxProcessedEvents: 2,
      maxEventsPerTimestamp: 20,
      onEvent: (event) => void seen.push(event.id),
    });
    kernel.schedule({ id: "e0", timeMs: 0, priority: 0, kind: "probe" });
    kernel.schedule({ id: "e1", timeMs: 10, priority: 0, kind: "probe" });
    kernel.schedule({ id: "e2", timeMs: 20, priority: 0, kind: "probe" });
    const end = kernel.advanceTo(30);
    expect(end.status).toBe("invalid");
    expect(end.diagnostic).toContain("processed-event bound exceeded");
    expect(end.diagnostic).toContain("cannot execute e2");
    expect(seen).toEqual(["e0", "e1"]);
    expect(kernel.getProcessedTotal()).toBe(2);
    expect(kernel.getClockMs()).toBe(10);
    expect(kernel.getPendingCount()).toBe(1);
    const snap = kernel.snapshot();
    expect(snap.status).toBe("invalid");
    expect(snap.processedIds).toEqual(["e0", "e1"]);
    expect(snap.failedEvent?.id).toBe("e2");
    expect(snap.pending.map((e) => e.id)).toEqual(["e2"]);
    expect(snap.nextSequence).toBe(3);
    expect(snap.timestampOfCount).toBe(10);
    expect(snap.countAtTimestamp).toBe(1);

    // Own snapshot restores: status, diagnostic, failed event, pending
    // occupancy, and counters survive the round-trip.
    const seenAfter: string[] = [];
    const peer = createKernel({
      maxProcessedEvents: 2,
      maxEventsPerTimestamp: 20,
      onEvent: (event) => void seenAfter.push(event.id),
    });
    expect(() => peer.restore(cloneSnapshot(snap))).not.toThrow();
    expect(peer.snapshot()).toEqual(snap);
    expect(peer.getStatus()).toBe("invalid");
    // No retry, no callback after restoring invalid.
    expect(peer.stepEvent().status).toBe("invalid");
    expect(peer.stepEvent().eventId).toBe("e2");
    expect(peer.advanceTo(30).status).toBe("invalid");
    expect(seenAfter).toEqual([]);
    expect(() =>
      peer.schedule({ id: "x", timeMs: 30, priority: 0, kind: "probe" }),
    ).toThrow();
    expect(peer.cancel("e2")).toBe(false);
  });

  test("same-timestamp bound failure round-trips with exact counters", () => {
    const seen: string[] = [];
    const kernel = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 2,
      onEvent: (event) => void seen.push(event.id),
    });
    kernel.schedule({ id: "s0", timeMs: 10, priority: 10, kind: "probe" });
    kernel.schedule({ id: "s1", timeMs: 10, priority: 10, kind: "probe" });
    kernel.schedule({ id: "s2", timeMs: 10, priority: 10, kind: "probe" });
    const end = kernel.advanceTo(10);
    expect(end.status).toBe("invalid");
    expect(end.diagnostic).toContain("zero-time-work bound exceeded");
    expect(end.diagnostic).toContain("t=10");
    expect(end.diagnostic).toContain("cannot execute s2");
    expect(seen).toEqual(["s0", "s1"]);
    const snap = kernel.snapshot();
    expect(snap.processedIds).toEqual(["s0", "s1"]);
    expect(snap.failedEvent?.id).toBe("s2");
    expect(snap.pending.map((e) => e.id)).toEqual(["s2"]);
    expect(snap.timestampOfCount).toBe(10);
    expect(snap.countAtTimestamp).toBe(2);

    const peer = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 2,
      onEvent: () => {
        throw new Error("must not run after invalid restore");
      },
    });
    expect(() => peer.restore(cloneSnapshot(snap))).not.toThrow();
    expect(peer.snapshot()).toEqual(snap);
  });

  test("handler failure round-trips: boom is last processed, later stays pending", () => {
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
    kernel.schedule({ id: "ok", timeMs: 5, priority: 10, kind: "probe" });
    kernel.schedule({ id: "boom", timeMs: 10, priority: 10, kind: "probe" });
    kernel.schedule({ id: "later", timeMs: 15, priority: 10, kind: "probe" });
    const end = kernel.advanceTo(20);
    expect(end.status).toBe("invalid");
    expect(end.diagnostic).toBe("handler error on boom: conveyor jam");
    const snap = kernel.snapshot();
    expect(snap.processedIds).toEqual(["ok", "boom"]);
    expect(snap.failedEvent?.id).toBe("boom");
    expect(snap.pending.map((e) => e.id)).toEqual(["later"]);
    expect(snap.clockMs).toBe(10);

    const seenAfter: string[] = [];
    const peer = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 100,
      onEvent: (event) => void seenAfter.push(event.id),
    });
    expect(() => peer.restore(cloneSnapshot(snap))).not.toThrow();
    expect(peer.snapshot()).toEqual(snap);
    expect(peer.stepEvent().eventId).toBe("boom");
    expect(seenAfter).toEqual([]);
  });

  test("fabricated failure states are rejected", () => {
    const boundKernel = createKernel({
      maxProcessedEvents: 2,
      maxEventsPerTimestamp: 20,
      onEvent: () => {},
    });
    boundKernel.schedule({ id: "e0", timeMs: 0, priority: 0, kind: "probe" });
    boundKernel.schedule({ id: "e1", timeMs: 10, priority: 0, kind: "probe" });
    boundKernel.schedule({ id: "e2", timeMs: 20, priority: 0, kind: "probe" });
    boundKernel.advanceTo(30);
    const bound = boundKernel.snapshot();
    const boundPeer = (): Kernel =>
      createKernel({
        maxProcessedEvents: 2,
        maxEventsPerTimestamp: 20,
        onEvent: () => {},
      });

    // Failed id matches nothing.
    const ghost = cloneSnapshot(bound);
    (ghost.failedEvent as Record<string, unknown>).id = "ghost";
    expect(() => boundPeer().restore(ghost)).toThrow();

    // Bound diagnostic paired with a processed-last failure.
    const swapped = cloneSnapshot(bound);
    (swapped.failedEvent as Record<string, unknown>).id = "e1";
    expect(() => boundPeer().restore(swapped)).toThrow();

    // Failed event disagrees with its pending entry.
    const drifted = cloneSnapshot(bound);
    (drifted.failedEvent as Record<string, unknown>).timeMs = 999;
    expect(() => boundPeer().restore(drifted)).toThrow();

    // Diagnostic names a different event.
    const misdiag = cloneSnapshot(bound);
    misdiag.diagnostic = "processed-event bound exceeded: cannot execute e1";
    expect(() => boundPeer().restore(misdiag)).toThrow();

    // Handler failure relabeled as a pending bound failure.
    const handlerKernel = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 100,
      onEvent: (event) => {
        if (event.id === "boom") {
          throw new Error("jam");
        }
      },
    });
    handlerKernel.schedule({ id: "ok", timeMs: 5, priority: 10, kind: "probe" });
    handlerKernel.schedule({ id: "boom", timeMs: 10, priority: 10, kind: "probe" });
    handlerKernel.schedule({ id: "later", timeMs: 15, priority: 10, kind: "probe" });
    handlerKernel.advanceTo(20);
    const handler = handlerKernel.snapshot();
    const handlerPeer = (): Kernel =>
      createKernel({
        maxProcessedEvents: 100,
        maxEventsPerTimestamp: 100,
        onEvent: () => {},
      });
    const relabeled = cloneSnapshot(handler);
    const pendingLater = (relabeled.pending as Record<string, unknown>[])[0];
    relabeled.failedEvent = structuredClone(pendingLater);
    relabeled.diagnostic =
      "zero-time-work bound exceeded: 100 events already executed at t=15, cannot execute later";
    expect(() => handlerPeer().restore(relabeled)).toThrow();

    // Failed id parked in cancelled history.
    const cancelKernel = createKernel({
      maxProcessedEvents: 100,
      maxEventsPerTimestamp: 100,
      onEvent: () => {},
    });
    cancelKernel.schedule({ id: "a", timeMs: 10, priority: 10, kind: "probe" });
    cancelKernel.schedule({ id: "b", timeMs: 20, priority: 10, kind: "probe" });
    cancelKernel.cancel("a");
    const cancelSnap = cloneSnapshot(cancelKernel.snapshot());
    const pendingB = (cancelSnap.pending as Record<string, unknown>[])[0];
    const forged = structuredClone(pendingB);
    forged.id = "a";
    cancelSnap.failedEvent = forged;
    cancelSnap.diagnostic = "handler error on a: forged";
    cancelSnap.status = "invalid";
    expect(() => handlerPeer().restore(cancelSnap)).toThrow();
  });
});

describe("review fix: event payloads are bounded plain JSON", () => {
  const limits = { maxProcessedEvents: 100, maxEventsPerTimestamp: 100 };

  test.each([
    ["cyclic object", () => {
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      return cyclic;
    }],
    ["cyclic array", () => {
      const arr: unknown[] = [];
      arr.push(arr);
      return arr;
    }],
    ["Date instance", () => new Date()],
    ["Map instance", () => new Map([["a", 1]])],
    ["class instance", () => new (class Box { v = 1; })()],
    ["BigInt", () => 10n],
    ["NaN", () => Number.NaN],
    ["Infinity", () => Number.POSITIVE_INFINITY],
    ["nested undefined", () => ({ a: undefined })],
    ["function value", () => ({ run: () => {} })],
  ])("%s is rejected before state mutation", (_label, make) => {
    const kernel = createKernel({ ...limits, onEvent: () => {} });
    kernel.schedule({ id: "first", timeMs: 10, priority: 10, kind: "probe" });
    const before = kernel.snapshot();
    expect(() =>
      kernel.schedule({
        id: "bad",
        timeMs: 10,
        priority: 10,
        kind: "probe",
        data: make() as unknown,
      }),
    ).toThrow();
    // Clock, queue, sequence, and claimed ids are unchanged.
    expect(kernel.snapshot()).toEqual(before);
    expect(kernel.getClockMs()).toBe(before.clockMs);
    expect(kernel.getPendingCount()).toBe(before.pending.length);
    // The rejected id was never claimed: reuse succeeds.
    expect(
      kernel.schedule({
        id: "bad",
        timeMs: 10,
        priority: 10,
        kind: "probe",
        data: { ok: true },
      }),
    ).toBe("bad");
  });

  test("ordinary JSON data and null are accepted with immutable clones", () => {
    const received: unknown[] = [];
    const kernel = createKernel({
      ...limits,
      onEvent: (event) => void received.push(event.data),
    });
    const payload = { note: "hi", n: 1.5, b: true, arr: [1, 2], nested: { x: null } };
    kernel.schedule({
      id: "j",
      timeMs: 10,
      priority: 10,
      kind: "probe",
      data: payload,
    });
    kernel.schedule({ id: "u", timeMs: 11, priority: 10, kind: "probe" });
    kernel.schedule({
      id: "n",
      timeMs: 12,
      priority: 10,
      kind: "probe",
      data: null,
    });
    payload.note = "tampered";
    kernel.advanceTo(12);
    expect(received).toEqual([
      { note: "hi", n: 1.5, b: true, arr: [1, 2], nested: { x: null } },
      null,
      null,
    ]);
  });

  test("restore applies the same payload rules and stays atomic", () => {
    const kernel = createKernel({ ...limits, onEvent: () => {} });
    kernel.schedule({
      id: "a",
      timeMs: 10,
      priority: 10,
      kind: "probe",
      data: { v: 1 },
    });
    kernel.schedule({ id: "b", timeMs: 20, priority: 10, kind: "probe" });
    const before = kernel.snapshot();

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const badPayload = cloneSnapshot(before);
    (badPayload.pending as Record<string, unknown>[])[0].data = cyclic as unknown;
    expect(() => kernel.restore(badPayload)).toThrow();
    expect(kernel.snapshot()).toEqual(before);

    const badDate = cloneSnapshot(before);
    (badDate.pending as Record<string, unknown>[])[1].data =
      new Date() as unknown;
    expect(() => kernel.restore(badDate)).toThrow();
    expect(kernel.snapshot()).toEqual(before);

    const badBig = cloneSnapshot(before);
    (badBig.pending as Record<string, unknown>[])[0].data = 5n as unknown;
    expect(() => kernel.restore(badBig)).toThrow();
    expect(kernel.snapshot()).toEqual(before);

    // The kernel still runs normally after rejected restores.
    kernel.advanceTo(20);
    expect(kernel.getProcessedTotal()).toBe(2);
  });
});

describe("review fix: restore shape and counter hardening", () => {
  const limits = { maxProcessedEvents: 100, maxEventsPerTimestamp: 100 };

  test("duplicate pending sequences are rejected", () => {
    const kernel = createKernel({ ...limits, onEvent: () => {} });
    kernel.schedule({ id: "q0", timeMs: 10, priority: 0, kind: "probe" });
    kernel.schedule({ id: "q1", timeMs: 10, priority: 0, kind: "probe" });
    const bad = cloneSnapshot(kernel.snapshot());
    const pending = bad.pending as Record<string, unknown>[];
    pending[1].sequence = pending[0].sequence;
    const peer = createKernel({ ...limits, onEvent: () => {} });
    expect(() => peer.restore(bad)).toThrow();
  });

  test("nextSequence must match the lifetime id count", () => {
    const kernel = createKernel({ ...limits, onEvent: () => {} });
    kernel.schedule({ id: "a", timeMs: 10, priority: 10, kind: "probe" });
    kernel.schedule({ id: "b", timeMs: 20, priority: 10, kind: "probe" });
    const good = kernel.snapshot();
    expect(good.nextSequence).toBe(2);
    const peer = (): Kernel => createKernel({ ...limits, onEvent: () => {} });

    const inflated = cloneSnapshot(good);
    inflated.nextSequence = 999;
    expect(() => peer().restore(inflated)).toThrow();

    const shrunk = cloneSnapshot(good);
    shrunk.nextSequence = 1;
    expect(() => peer().restore(shrunk)).toThrow();
  });

  test("impossible status/pending shapes are rejected", () => {
    const kernel = createKernel({ ...limits, onEvent: () => {} });
    kernel.schedule({ id: "a", timeMs: 10, priority: 10, kind: "probe" });
    const ready = cloneSnapshot(kernel.snapshot());
    const peer = (): Kernel => createKernel({ ...limits, onEvent: () => {} });

    const readyEmpty = cloneSnapshot(kernel.snapshot());
    readyEmpty.pending = [];
    expect(() => peer().restore(readyEmpty)).toThrow();

    const emptyKernel = createKernel({ ...limits, onEvent: () => {} });
    const emptyBad = cloneSnapshot(emptyKernel.snapshot());
    expect(emptyBad.status).toBe("queue-empty");
    emptyBad.pending = ready.pending;
    expect(() => peer().restore(emptyBad)).toThrow();

    const validWithFailure = cloneSnapshot(kernel.snapshot());
    validWithFailure.failedEvent = (ready.pending as Record<string, unknown>[])[0];
    validWithFailure.diagnostic = "handler error on a: forged";
    expect(() => peer().restore(validWithFailure)).toThrow();

    const invalidBare = cloneSnapshot(kernel.snapshot());
    invalidBare.status = "invalid";
    expect(() => peer().restore(invalidBare)).toThrow();
  });

  test("impossible timestamp/counter shapes are rejected", () => {
    const kernel = createKernel({ ...limits, onEvent: () => {} });
    kernel.schedule({ id: "a", timeMs: 10, priority: 10, kind: "probe" });
    kernel.schedule({ id: "b", timeMs: 20, priority: 10, kind: "probe" });
    kernel.advanceTo(10);
    const good = kernel.snapshot();
    expect(good.processedTotal).toBe(1);
    expect(good.clockMs).toBe(10);
    const peer = (): Kernel => createKernel({ ...limits, onEvent: () => {} });

    const futureStamp = cloneSnapshot(good);
    futureStamp.timestampOfCount = (good.clockMs as number) + 100;
    expect(() => peer().restore(futureStamp)).toThrow();

    const countBeyondProcessed = cloneSnapshot(good);
    countBeyondProcessed.countAtTimestamp =
      (good.processedTotal as number) + 5;
    expect(() => peer().restore(countBeyondProcessed)).toThrow();

    const countBeyondCap = cloneSnapshot(good);
    countBeyondCap.countAtTimestamp =
      (good.maxEventsPerTimestamp as number) + 1;
    expect(() => peer().restore(countBeyondCap)).toThrow();

    const fresh = createKernel({ ...limits, onEvent: () => {} });
    fresh.schedule({ id: "x", timeMs: 50, priority: 10, kind: "probe" });
    const zeroWork = cloneSnapshot(fresh.snapshot());
    zeroWork.countAtTimestamp = 1;
    expect(() => peer().restore(zeroWork)).toThrow();
  });

  test("genuine snapshots restore, reset, and chunk identically", () => {
    const script = (seen: string[]): Kernel =>
      createKernel({
        ...limits,
        onEvent: (event, api) => {
          seen.push(`${event.timeMs}:${event.id}`);
          if (event.id === "trigger") {
            api.schedule({
              id: "caused",
              timeMs: 40,
              priority: EVENT_PRIORITY.DISPATCH,
              kind: "probe",
            });
          }
        },
        initialEvents: [
          { id: "o1", timeMs: 0, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival" },
          { id: "trigger", timeMs: 40, priority: EVENT_PRIORITY.ARRIVAL, kind: "arrival" },
          { id: "done", timeMs: 120, priority: EVENT_PRIORITY.COMPLETION, kind: "completion" },
        ],
      });
    const seenA: string[] = [];
    const kernelA = script(seenA);
    const genesis = kernelA.snapshot();
    kernelA.advanceTo(45);
    const mid = kernelA.snapshot();

    // Mid-run restore into a peer continues identically.
    const seenB: string[] = [];
    const peer = createKernel({
      ...limits,
      onEvent: (event) => void seenB.push(`${event.timeMs}:${event.id}`),
    });
    peer.restore(cloneSnapshot(mid));
    kernelA.advanceTo(160);
    peer.advanceTo(160);
    expect(peer.snapshot()).toEqual(kernelA.snapshot());
    expect(seenB).toEqual(["120:done"]);

    // Reset restores genesis exactly, even from an invalid run.
    const bad = createKernel({
      maxProcessedEvents: 1,
      maxEventsPerTimestamp: 100,
      onEvent: () => {},
      initialEvents: [
        { id: "k0", timeMs: 0, priority: 0, kind: "probe" },
        { id: "k1", timeMs: 10, priority: 0, kind: "probe" },
      ],
    });
    const badGenesis = bad.snapshot();
    bad.advanceTo(50);
    expect(bad.getStatus()).toBe("invalid");
    bad.reset();
    expect(bad.snapshot()).toEqual(badGenesis);

    kernelA.reset();
    expect(kernelA.snapshot()).toEqual(genesis);

    // Step-one vs chunked draining agree exactly.
    const drainSteps = (kernel: Kernel): void => {
      let guard = 1000;
      while (kernel.getStatus() === "ready" && guard-- > 0) {
        kernel.stepEvent();
      }
      expect(guard).toBeGreaterThan(0);
      kernel.advanceTo(160);
    };
    const seenC: string[] = [];
    const bySteps = script(seenC);
    drainSteps(bySteps);
    const seenD: string[] = [];
    const byChunks = script(seenD);
    byChunks.advanceTo(40);
    byChunks.advanceTo(160);
    expect(seenC).toEqual(seenD);
    expect(bySteps.snapshot()).toEqual(byChunks.snapshot());
    expect(seenC).toEqual(["0:o1", "40:trigger", "40:caused", "120:done"]);
  });
});
