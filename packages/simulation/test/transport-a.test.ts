import { describe, expect, test } from "vitest";
import { createTransportController } from "../src/index.js";
import { microScenario } from "./transport-fixtures.js";

// Acceptance A: fixed micro geometry, 2000mm straight at 1000mm/s = 2000ms.
// Midpoint at 1000ms exact, end exact and persists. Chunked advance equals
// one-shot state/traces. No frame/speed dependence (kernel clock only).
describe("M3a transport acceptance A (authorized timing)", () => {
  const scenario = () =>
    microScenario({
      room: { widthMm: 6000, depthMm: 4000 },
      units: [{ id: "U1", speedMmPerSecond: 1000, parkingSlotMm: { x: 1000, z: 2000 } }],
    });

  test("2000mm at 1000mm/s grants 0..2000 with exact midpoint and end", () => {
    const c = createTransportController({ scenario: scenario() });
    const r = c.requestMove("U1", { x: 3000, z: 2000 });
    expect(r.status).toBe("granted");
    if (r.status !== "granted") return;
    expect(r.plan.startMs).toBe(0);
    expect(r.plan.endMs).toBe(2000);
    expect(r.plan.totalDistanceMm).toBe(2000);
    expect(r.plan.totalDurationMs).toBe(2000);
    expect(r.waitMs).toBe(0);
    // Midpoint at 1000ms exact (no teleport, linear authorized motion).
    expect(c.poseAt("U1", 1000)).toEqual({ x: 2000, z: 2000 });
    expect(c.poseAt("U1", 0)).toEqual({ x: 1000, z: 2000 });
    expect(c.poseAt("U1", 2000)).toEqual({ x: 3000, z: 2000 });
    // End persists thereafter (terminal occupancy, exact).
    c.advanceTo(2000);
    expect(c.poseAt("U1", 2000)).toEqual({ x: 3000, z: 2000 });
    expect(c.poseAt("U1", 5000)).toEqual({ x: 3000, z: 2000 });
    expect(c.snapshot().units[0]?.pose).toEqual({ x: 3000, z: 2000 });
  });

  test("chunked advance equals one-shot state", () => {
    const one = createTransportController({ scenario: scenario() });
    one.requestMove("U1", { x: 3000, z: 2000 });
    one.advanceTo(2000);
    const oneSnap = one.snapshot();

    const chunked = createTransportController({ scenario: scenario() });
    chunked.requestMove("U1", { x: 3000, z: 2000 });
    chunked.advanceTo(500);
    expect(chunked.poseAt("U1")).toEqual({ x: 1500, z: 2000 });
    chunked.advanceTo(1000);
    chunked.advanceTo(1500);
    chunked.advanceTo(2000);
    const chunkedSnap = chunked.snapshot();
    expect(chunkedSnap).toEqual(oneSnap);
    expect(JSON.stringify(chunkedSnap)).toBe(JSON.stringify(oneSnap));
  });
});
