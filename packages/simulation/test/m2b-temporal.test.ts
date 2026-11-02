// M2b temporal-admission regressions: freed lanes cannot accept a start
// before their last release, or saved intervals would overlap on one lane.
import { describe, expect, test } from "vitest";
import { createServiceStation, type OperationsResource } from "../src/index.js";

function laneResource(overrides: Partial<OperationsResource> = {}): OperationsResource {
  return {
    id: "RES-TEMP-1",
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

describe("temporal admission: no historical lane reuse overlap", () => {
  test("A 0..1000 released rejects B start at 100 byte-equivalent", () => {
    const station = createServiceStation(laneResource());
    station.enqueue({ jobId: "A", enqueueTimeMs: 0 });
    station.tryStart({ jobId: "A", timeMs: 0, inputReady: true });
    station.enqueue({ jobId: "B", enqueueTimeMs: 0 });
    station.completeService({ jobId: "A", timeMs: 1000, outputBlocked: false });
    const before = JSON.stringify(station.snapshot());
    expect(() => station.tryStart({ jobId: "B", timeMs: 100, inputReady: true })).toThrow(
      /before lane release/,
    );
    expect(JSON.stringify(station.snapshot())).toBe(before);
  });

  test("held release 1500 rejects B 1499, accepts B 1500", () => {
    const station = createServiceStation(laneResource());
    station.enqueue({ jobId: "A", enqueueTimeMs: 0 });
    station.tryStart({ jobId: "A", timeMs: 0, inputReady: true });
    station.enqueue({ jobId: "B", enqueueTimeMs: 0 });
    station.completeService({ jobId: "A", timeMs: 1000, outputBlocked: true });
    station.releaseOutput({ jobId: "A", timeMs: 1500 });
    const before = JSON.stringify(station.snapshot());
    expect(() => station.tryStart({ jobId: "B", timeMs: 1499, inputReady: true })).toThrow(
      /before lane release/,
    );
    expect(JSON.stringify(station.snapshot())).toBe(before);
    expect(station.tryStart({ jobId: "B", timeMs: 1500, inputReady: true })).toEqual({
      status: "started",
      jobId: "B",
      positionId: "S1",
      startTimeMs: 1500,
      waitMs: 1500,
    });
  });

  test("two lanes grant a legitimately free lane and reject when both were busy", () => {
    const two = laneResource({
      id: "RES-TEMP-2",
      servicePositions: [
        { id: "S1", x: 100, z: 100 },
        { id: "S2", x: 200, z: 100 },
      ],
      queueSlots: [
        { id: "Q1", x: 100, z: 200 },
        { id: "Q2", x: 200, z: 200 },
      ],
      serviceCapacity: 2,
    });
    const station = createServiceStation(two);
    station.enqueue({ jobId: "A", enqueueTimeMs: 0 });
    station.enqueue({ jobId: "B", enqueueTimeMs: 0 });
    expect(station.tryStart({ jobId: "A", timeMs: 0, inputReady: true })).toMatchObject({
      positionId: "S1",
    });
    // Same-time parallel start on the second lane stays valid.
    expect(station.tryStart({ jobId: "B", timeMs: 0, inputReady: true })).toMatchObject({
      positionId: "S2",
    });
    station.completeService({ jobId: "A", timeMs: 1000, outputBlocked: false });
    station.completeService({ jobId: "B", timeMs: 1000, outputBlocked: false });
    station.enqueue({ jobId: "C", enqueueTimeMs: 0 });
    const before = JSON.stringify(station.snapshot());
    expect(() => station.tryStart({ jobId: "C", timeMs: 100, inputReady: true })).toThrow(
      /before lane release/,
    );
    expect(JSON.stringify(station.snapshot())).toBe(before);
    // Same-time release+start stays valid.
    expect(station.tryStart({ jobId: "C", timeMs: 1000, inputReady: true }).status).toBe("started");
  });

  test("two lanes: idle second lane accepts a historical start the used lane cannot", () => {
    const two = laneResource({
      id: "RES-TEMP-3",
      servicePositions: [
        { id: "S1", x: 100, z: 100 },
        { id: "S2", x: 200, z: 100 },
      ],
      queueSlots: [{ id: "Q1", x: 100, z: 200 }],
      serviceCapacity: 2,
    });
    const station = createServiceStation(two);
    station.enqueue({ jobId: "A", enqueueTimeMs: 0 });
    station.tryStart({ jobId: "A", timeMs: 0, inputReady: true });
    station.completeService({ jobId: "A", timeMs: 1000, outputBlocked: false });
    station.enqueue({ jobId: "B", enqueueTimeMs: 0 });
    // S1 was busy 0..1000; S2 was always free, so B at 100 grants S2.
    expect(station.tryStart({ jobId: "B", timeMs: 100, inputReady: true })).toEqual({
      status: "started",
      jobId: "B",
      positionId: "S2",
      startTimeMs: 100,
      waitMs: 100,
    });
  });
});
