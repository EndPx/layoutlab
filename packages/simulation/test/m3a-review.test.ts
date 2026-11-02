// M3a independent-review regression suite. One focused test per executed
// review finding (docs/V3_M3A_INDEPENDENT_REVIEW.md): initial spatial
// preflight, atomic grants with bounded event IDs, full-footprint zone
// envelopes, witnessed blocker attribution, and result isolation. Uses
// independent literals plus the exact review repro coordinates.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  createTransportController,
  createTransportNav,
  parseOperationsScenario,
  stationaryVsStationaryConflict,
} from "../src/index.js";
import { microScenario } from "./transport-fixtures.js";

const MAIN_FIXTURE = "../../fixtures/operations/main-warehouse.json";

describe("M3a review R1: initial spatial preflight", () => {
  test("overlapping initial footprints rejected (review: 1mm-apart r600 discs)", () => {
    const scenario = microScenario({
      room: { widthMm: 6000, depthMm: 5000 },
      units: [
        { id: "A", parkingSlotMm: { x: 1000, z: 2000 } },
        { id: "B", parkingSlotMm: { x: 1001, z: 2000 } },
      ],
    });
    const before = JSON.stringify(scenario);
    expect(() => createTransportController({ scenario })).toThrow(
      /INITIAL_OVERLAP/,
    );
    // Nothing moved, resized, or deleted: the source input is untouched.
    expect(JSON.stringify(scenario)).toBe(before);
  });

  test("touching envelopes rejected; 1200 rejects, 1201 accepts (uniform closed-contact rule)", () => {
    // Uniform rule: initial pairwise uses the same r600/closed-contact
    // disc check as movement. Rects [700..1300] and [1300..1900] touch
    // at x=1300 (0 gap): 600mm centers overlap discs (600 < 1200),
    // violating declared 100 margins => reject.
    expect(() =>
      createTransportController({
        scenario: microScenario({
          units: [
            { id: "U1", parkingSlotMm: { x: 1000, z: 2000 } },
            { id: "U2", parkingSlotMm: { x: 1600, z: 2000 } },
          ],
        }),
      }),
    ).toThrow(/INITIAL_OVERLAP/);
    expect(
      stationaryVsStationaryConflict(
        { x: 1000, z: 2000 },
        600,
        { x: 1600, z: 2000 },
        600,
      ),
    ).toBe(true);
    // Exact disc touch at 1200 rejects (closed contact, conservative).
    expect(() =>
      createTransportController({
        scenario: microScenario({
          units: [
            { id: "U1", parkingSlotMm: { x: 1000, z: 2000 } },
            { id: "U2", parkingSlotMm: { x: 2200, z: 2000 } },
          ],
        }),
      }),
    ).toThrow(/INITIAL_/);
    // 1mm beyond touch clears. Room 6000x4000 keeps both centers
    // wall-clear (600 radius) and far from R-FAR.
    expect(
      stationaryVsStationaryConflict(
        { x: 1000, z: 2000 },
        600,
        { x: 2201, z: 2000 },
        600,
      ),
    ).toBe(false);
    const c = createTransportController({
      scenario: microScenario({
        units: [
          { id: "U1", parkingSlotMm: { x: 1000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 2201, z: 2000 } },
        ],
      }),
    });
    expect(c.snapshot().units.map((u) => u.state)).toEqual(["idle", "idle"]);
  });

  test("room/obstacle/clearance/zone violations rejected with specific reasons", () => {
    // Declared footprint leaves the room (minX -200).
    expect(
      () =>
        createTransportController({
          scenario: microScenario({
            units: [{ id: "U1", parkingSlotMm: { x: 100, z: 2000 } }],
          }),
        }),
    ).toThrow(/INITIAL_ROOM_EXCEEDED/);
    // Declared footprint interior-overlaps an obstacle.
    expect(
      () =>
        createTransportController({
          scenario: microScenario({
            obstacles: [
              { id: "O1", minXMm: 900, minZMm: 1900, maxXMm: 1100, maxZMm: 2100 },
            ],
            units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
          }),
        }),
    ).toThrow(/INITIAL_OBSTACLE_OVERLAP/);
    // Rect disjoint (maxX 1300 < 1600) but center inside the inflated
    // obstacle (boundary-inclusive): clearance violation.
    expect(
      () =>
        createTransportController({
          scenario: microScenario({
            obstacles: [
              { id: "O1", minXMm: 1600, minZMm: 1900, maxXMm: 1800, maxZMm: 2100 },
            ],
            units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
          }),
        }),
    ).toThrow(/INITIAL_CLEARANCE/);
    // Room wall band: 500 <= 600 radius.
    expect(
      () =>
        createTransportController({
          scenario: microScenario({
            units: [{ id: "U1", parkingSlotMm: { x: 500, z: 2000 } }],
          }),
        }),
    ).toThrow(/INITIAL_CLEARANCE/);
    // Whole profile intersects the exclusive zone (review terminal literal).
    expect(
      () =>
        createTransportController({
          scenario: microScenario({
            room: { widthMm: 6000, depthMm: 5000 },
            trafficZones: [
              { id: "Z", kind: "narrow-aisle", minXMm: 2000, minZMm: 1500, maxXMm: 4000, maxZMm: 2500 },
            ],
            units: [{ id: "U1", parkingSlotMm: { x: 1500, z: 1400 } }],
          }),
        }),
    ).toThrow(/INITIAL_IN_ZONE/);
  });

  test("valid main canonical fixture still constructs", () => {
    const bytes = readFileSync(MAIN_FIXTURE, "utf8");
    const fx = parseOperationsScenario(JSON.parse(bytes));
    const c = createTransportController({ scenario: fx });
    expect(c.snapshot().units).toHaveLength(6);
    expect(c.getClockMs()).toBe(0);
  });
});

describe("M3a review R2: atomic grants, bounded event IDs", () => {
  test("128-char unit ID movement completes exactly once", () => {
    const long = "U".repeat(128);
    const c = createTransportController({
      scenario: microScenario({
        units: [{ id: long, parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    });
    const r = c.requestMove(long, { x: 3000, z: 2000 });
    expect(r.status).toBe("granted");
    if (r.status !== "granted") return;
    expect(r.plan.planVersion).toBe(1);
    const adv = c.advanceTo(2000);
    expect(adv.processedTotal).toBe(1);
    expect(c.poseAt(long)).toEqual({ x: 3000, z: 2000 });
    // Exactly once: no duplicate completion after the first.
    expect(c.advanceTo(5000).processedTotal).toBe(1);
    expect(c.snapshot().activeCount).toBe(0);
    // Second grant (v2) schedules a distinct internal event ID.
    expect(c.requestMove(long, { x: 1000, z: 2000 }).status).toBe("granted");
    expect(c.advanceTo(7000).processedTotal).toBe(2);
    expect(c.poseAt(long)).toEqual({ x: 1000, z: 2000 });
  });

  test("rejected requests leave snapshots identical, no phantom trajectory", () => {
    const scenario = () =>
      microScenario({
        obstacles: [
          { id: "O1", minXMm: 4900, minZMm: 1900, maxXMm: 5100, maxZMm: 2100 },
        ],
        trafficZones: [
          { id: "Z", kind: "narrow-aisle", minXMm: 2000, minZMm: 1500, maxXMm: 4000, maxZMm: 2500 },
        ],
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      });
    const c = createTransportController({ scenario: scenario() });
    const attemptRejection = (
      fn: () => unknown,
      code: string,
    ): void => {
      const before = JSON.stringify(c.snapshot());
      const clock = c.getClockMs();
      const r = fn() as { status: string; reason?: { code: string } };
      expect(r.status).toBe("rejected");
      expect(r.reason?.code).toBe(code);
      expect(JSON.stringify(c.snapshot())).toBe(before);
      expect(c.getClockMs()).toBe(clock);
    };
    attemptRejection(
      () =>
        c.requestMove("U1", { x: 1.5, z: 2000 } as unknown as {
          x: number;
          z: number;
        }),
      "INVALID_DESTINATION",
    );
    attemptRejection(
      () => c.requestMove("U1", { x: 5950, z: 2000 }),
      "ROOM_EXCEEDED",
    );
    attemptRejection(
      () => c.requestMove("U1", { x: 5000, z: 2000 }),
      "OBSTACLE_OVERLAP",
    );
    attemptRejection(
      () => c.requestMove("U1", { x: 1500, z: 1400 }),
      "DESTINATION_IN_ZONE",
    );
    attemptRejection(
      () => c.requestMove("NOPE", { x: 3000, z: 2000 }),
      "UNKNOWN_UNIT",
    );
    attemptRejection(
      () => c.requestMove("U1", { x: 3000, z: 2000 }, 999),
      "REQUEST_TIME_MISMATCH",
    );
    // No phantom trajectory: parked pose, idle, zero processed events.
    expect(c.poseAt("U1")).toEqual({ x: 1000, z: 2000 });
    expect(c.snapshot().activeCount).toBe(0);
    expect(c.advanceTo(3000).processedTotal).toBe(0);
  });

  test("replan while moving rejected atomically (grant path, not only waits)", () => {
    const c = createTransportController({
      scenario: microScenario({
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    });
    expect(c.requestMove("U1", { x: 3000, z: 2000 }).status).toBe("granted");
    const before = JSON.stringify(c.snapshot());
    const r = c.requestMove("U1", { x: 1000, z: 3000 });
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.reason.code).toBe("ALREADY_MOVING");
    expect(JSON.stringify(c.snapshot())).toBe(before);
  });
});

describe("M3a review R3: full footprint vs exclusive zone", () => {
  const zoned = () =>
    microScenario({
      room: { widthMm: 6000, depthMm: 5000 },
      trafficZones: [
        { id: "Z", kind: "narrow-aisle", minXMm: 2000, minZMm: 1500, maxXMm: 4000, maxZMm: 2500 },
      ],
      units: [
        { id: "A", parkingSlotMm: { x: 1000, z: 1400 } },
        { id: "B", parkingSlotMm: { x: 1000, z: 2700 } },
      ],
    });

  test("terminal overlapping zone rejected (review literal), other unit free", () => {
    // Terminal (1500,1400) is 509.9mm from the zone corner (2000,1500):
    // center outside, profile (r600) still intersecting.
    expect(Math.hypot(1500 - 2000, 1400 - 1500)).toBeLessThan(600);
    const c = createTransportController({ scenario: zoned() });
    const a = c.requestMove("A", { x: 1500, z: 1400 });
    expect(a.status).toBe("rejected");
    if (a.status === "rejected") {
      expect(a.reason.code).toBe("DESTINATION_IN_ZONE");
    }
    // No hold was taken, so B's zone-requiring move grants immediately.
    const b = c.requestMove("B", { x: 5000, z: 2700 });
    expect(b.status).toBe("granted");
    if (b.status === "granted") expect(b.plan.requiredZones).toEqual(["Z"]);
  });

  test("touch threshold: inflated boundary rejects, 1mm outside grants", () => {
    const c = createTransportController({
      scenario: microScenario({
        room: { widthMm: 6000, depthMm: 5000 },
        trafficZones: [
          { id: "Z", kind: "narrow-aisle", minXMm: 2000, minZMm: 1500, maxXMm: 4000, maxZMm: 2500 },
        ],
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    });
    // x=1400 is exactly the inflated minX (2000-600): inclusive => inside.
    const touch = c.requestMove("U1", { x: 1400, z: 2000 });
    expect(touch.status).toBe("rejected");
    if (touch.status === "rejected") {
      expect(touch.reason.code).toBe("DESTINATION_IN_ZONE");
    }
    // 1mm outside the envelope grants; the route still requires Z because
    // its x=1400 grid node touches the inflated rect (path admission
    // stays conservative, consistent with the original oracle).
    const edge = c.requestMove("U1", { x: 1399, z: 2000 });
    expect(edge.status).toBe("granted");
    if (edge.status === "granted") expect(edge.plan.requiredZones).toEqual(["Z"]);
    // A fully clear route needs no zone.
    const clear = createTransportController({
      scenario: microScenario({
        room: { widthMm: 6000, depthMm: 5000 },
        trafficZones: [
          { id: "Z", kind: "narrow-aisle", minXMm: 2000, minZMm: 1500, maxXMm: 4000, maxZMm: 2500 },
        ],
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    }).requestMove("U1", { x: 1300, z: 2000 });
    expect(clear.status).toBe("granted");
    if (clear.status === "granted") expect(clear.plan.requiredZones).toEqual([]);
  });

  test("conservative corner: Euclidean-clear but rect-overlapping rejected", () => {
    // (1500,1000) is 707.1mm from corner (2000,1500): the r600 disc
    // clears, but the inflated rect contains it => rejected, consistent
    // with pathRequiresZone admission (never silently permissive).
    expect(Math.hypot(1500 - 2000, 1000 - 1500)).toBeGreaterThan(600);
    const c = createTransportController({
      scenario: microScenario({
        room: { widthMm: 6000, depthMm: 5000 },
        trafficZones: [
          { id: "Z", kind: "narrow-aisle", minXMm: 2000, minZMm: 1500, maxXMm: 4000, maxZMm: 2500 },
        ],
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    });
    const r = c.requestMove("U1", { x: 1500, z: 1000 });
    expect(r.status).toBe("rejected");
    if (r.status === "rejected") expect(r.reason.code).toBe("DESTINATION_IN_ZONE");
  });

  test("zero-distance endpoint grants and completes exactly once", () => {
    const c = createTransportController({ scenario: zoned() });
    const r = c.requestMove("A", { x: 1000, z: 1400 });
    expect(r.status).toBe("granted");
    if (r.status !== "granted") return;
    expect(r.plan.totalDistanceMm).toBe(0);
    expect(r.plan.totalDurationMs).toBe(0);
    expect([r.plan.startMs, r.plan.endMs]).toEqual([0, 0]);
    expect(r.plan.requiredZones).toEqual([]);
    expect(c.advanceTo(0).processedTotal).toBe(1);
    expect(c.advanceTo(100).processedTotal).toBe(1);
    expect(c.poseAt("A")).toEqual({ x: 1000, z: 1400 });
    expect(c.snapshot().units.find((u) => u.unitId === "A")?.state).toBe("idle");
  });
});

describe("M3a review R4: actual blocker evidence", () => {
  const corridor = () =>
    microScenario({
      room: { widthMm: 6000, depthMm: 5000 },
      obstacles: [
        { id: "TOP", minXMm: 2400, minZMm: 0, maxXMm: 3600, maxZMm: 1100 },
        { id: "BOTTOM", minXMm: 2400, minZMm: 2900, maxXMm: 3600, maxZMm: 5000 },
      ],
      units: [
        { id: "A-unrelated", parkingSlotMm: { x: 1000, z: 3800 } },
        { id: "U-mover", parkingSlotMm: { x: 1000, z: 2000 } },
        { id: "Z-blocker", parkingSlotMm: { x: 3000, z: 2000 } },
      ],
    });

  test("corridor names the actual witness, not the smallest ID (review literal)", () => {
    const c = createTransportController({ scenario: corridor() });
    const r = c.requestMove("U-mover", { x: 5000, z: 2000 });
    expect(r.status).toBe("waiting");
    if (r.status !== "waiting") return;
    expect(r.blocker).toEqual({
      kind: "unit",
      blockerUnitId: "Z-blocker",
      reason: "CORRIDOR_BLOCKED",
    });
  });

  test("ambiguous goal reports unknown with candidates, no false deadlock", () => {
    // Uniform R2 correction (exposed by the new gate): old B(2000,1500)/
    // C(2000,2600) were 1100 apart (invalid under r600 envelopes). C moved
    // to z2800 (B-C 1300, valid); goal (2000,2050) still inside both
    // inflated rects (550/750 in z, within 1000), preserving ambiguity.
    const scenario = microScenario({
      room: { widthMm: 6000, depthMm: 6000 },
      units: [
        { id: "U", parkingSlotMm: { x: 1000, z: 800 } },
        { id: "B", parkingSlotMm: { x: 2000, z: 1500 } },
        { id: "C", parkingSlotMm: { x: 2000, z: 2800 } },
      ],
    });
    // Nav-level: both inflated rects cover the goal.
    const nav = createTransportNav(scenario);
    const direct = nav.findRoute(
      { x: 1000, z: 800 },
      { x: 2000, z: 2050 },
      "U",
      new Map([
        ["B", { x: 2000, z: 1500 }],
        ["C", { x: 2000, z: 2800 }],
      ]),
    );
    expect(direct.status).toBe("rejected");
    if (direct.status !== "rejected") return;
    expect(direct.reason).toBe("OCCUPIED_GOAL");
    expect(direct.blockerUnitId).toBeUndefined();
    expect(direct.candidateUnitIds).toEqual(["B", "C"]);
    // Transport-level: unknown cause, and the stuck diagnostic must not
    // invent a deadlock cycle from the ambiguous wait.
    const c = createTransportController({ scenario });
    const r = c.requestMove("U", { x: 2000, z: 2050 });
    expect(r.status).toBe("waiting");
    if (r.status !== "waiting") return;
    expect(r.blocker).toEqual({
      kind: "unknown",
      reason: "OCCUPIED_GOAL",
      candidates: ["B", "C"],
    });
    const d = c.getDiagnostic();
    expect(d?.status).toBe("stuck");
    if (d?.status !== "stuck") return;
    expect(d.kind).toBe("IMPOSSIBLE_WAIT");
    expect(d.waits[0]?.blocker).toMatchObject({ kind: "unknown" });
  });

  test("distinct profiles: actual occupier blamed, not the nearest center", () => {
    // Goal (3000,2000) is nearer to N (708.1) than to F (750), but only
    // F's inflated rect covers the goal.
    expect(Math.hypot(3000 - 2900, 2000 - 2701)).toBeLessThan(
      Math.hypot(3000 - 3750, 2000 - 2000),
    );
    const c = createTransportController({
      scenario: microScenario({
        units: [
          { id: "U", parkingSlotMm: { x: 1000, z: 2000 } },
          {
            id: "N",
            width: 200,
            length: 200,
            margin: 0,
            parkingSlotMm: { x: 2900, z: 2701 },
          },
          { id: "F", parkingSlotMm: { x: 3750, z: 2000 } },
        ],
      }),
    });
    const r = c.requestMove("U", { x: 3000, z: 2000 });
    expect(r.status).toBe("waiting");
    if (r.status !== "waiting") return;
    expect(r.blocker).toEqual({
      kind: "unit",
      blockerUnitId: "F",
      reason: "OCCUPIED_GOAL",
    });
  });
});

describe("M3a review R5: result isolation", () => {
  test("mutating a returned waiter cannot edit owned snapshot/diagnostic", () => {
    const c = createTransportController({
      scenario: microScenario({
        room: { widthMm: 6000, depthMm: 5000 },
        obstacles: [
          { id: "TOP", minXMm: 2400, minZMm: 0, maxXMm: 3600, maxZMm: 1100 },
          { id: "BOTTOM", minXMm: 2400, minZMm: 2900, maxXMm: 3600, maxZMm: 5000 },
        ],
        units: [
          { id: "A-unrelated", parkingSlotMm: { x: 1000, z: 3800 } },
          { id: "U-mover", parkingSlotMm: { x: 1000, z: 2000 } },
          { id: "Z-blocker", parkingSlotMm: { x: 3000, z: 2000 } },
        ],
      }),
    });
    const r = c.requestMove("U-mover", { x: 5000, z: 2000 });
    expect(r.status).toBe("waiting");
    if (r.status !== "waiting" || r.blocker.kind !== "unit") return;
    r.blocker.blockerUnitId = "FAKE";
    r.destination.x = 9999;
    const owned = c.snapshot().units.find((u) => u.unitId === "U-mover");
    expect(owned?.waiting?.blocker).toEqual({
      kind: "unit",
      blockerUnitId: "Z-blocker",
      reason: "CORRIDOR_BLOCKED",
    });
    expect(owned?.waiting?.destination).toEqual({ x: 5000, z: 2000 });
    const d = c.getDiagnostic();
    expect(d?.status).toBe("stuck");
    if (d?.status !== "stuck") return;
    expect(d.waits[0]?.blocker).toMatchObject({
      kind: "unit",
      blockerUnitId: "Z-blocker",
    });
  });

  test("dispatch results detached; granted plans frozen", () => {
    const waiting = createTransportController({
      scenario: microScenario({
        units: [
          { id: "U1", parkingSlotMm: { x: 3000, z: 2000 } },
          { id: "U2", parkingSlotMm: { x: 1000, z: 2000 } },
        ],
      }),
    });
    expect(waiting.requestMove("U2", { x: 3000, z: 2000 }).status).toBe("waiting");
    const out = waiting.dispatch();
    expect(out).toHaveLength(1);
    const first = out[0];
    expect(first?.status).toBe("waiting");
    if (first?.status !== "waiting" || first.blocker.kind !== "unit") return;
    first.blocker.blockerUnitId = "FAKE";
    expect(
      waiting.snapshot().units.find((u) => u.unitId === "U2")?.waiting?.blocker,
    ).toMatchObject({ kind: "unit", blockerUnitId: "U1" });

    const moving = createTransportController({
      scenario: microScenario({
        units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
      }),
    });
    const g = moving.requestMove("U1", { x: 3000, z: 2000 });
    expect(g.status).toBe("granted");
    if (g.status !== "granted") return;
    expect(Object.isFrozen(g.plan)).toBe(true);
    expect(Object.isFrozen(g.plan.destination)).toBe(true);
    expect(Object.isFrozen(g.plan.points)).toBe(true);
    expect(Object.isFrozen(g.plan.points[0])).toBe(true);
  });

  test("post-construction scenario mutation cannot affect the controller", () => {
    const scenario = microScenario({
      units: [{ id: "U1", parkingSlotMm: { x: 1000, z: 2000 } }],
    });
    const c = createTransportController({ scenario });
    // Hostile caller-owned mutations after construction.
    scenario.mobileUnits[0]!.parkingSlotMm.x = 9999;
    scenario.geometry.obstacles.push({
      id: "EVIL",
      minXMm: 0,
      minZMm: 0,
      maxXMm: 6000,
      maxZMm: 4000,
    });
    scenario.geometry.trafficZones = [
      { id: "Z-EVIL", kind: "narrow-aisle", minXMm: 0, minZMm: 0, maxXMm: 6000, maxZMm: 4000 },
    ];
    scenario.geometry.room.widthMm = 1500;
    // Owned config is detached: original pose, original 2000mm grant.
    expect(c.snapshot().units[0]?.pose).toEqual({ x: 1000, z: 2000 });
    const r = c.requestMove("U1", { x: 3000, z: 2000 });
    expect(r.status).toBe("granted");
    if (r.status !== "granted") return;
    expect([r.plan.startMs, r.plan.endMs]).toEqual([0, 2000]);
    expect(r.plan.requiredZones).toEqual([]);
  });
});
