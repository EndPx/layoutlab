// E3 controlled experiments: explicit intervention policy, frozen common
// inputs, baseline always evaluated once, invalid/incomplete candidates
// retained in order, bounded termination, and offline recomputation that
// detects tampering. Expected oracle timestamps below are hand-derived
// literals (geometry arithmetic in the comment), never produced by the
// reporting helpers under test.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  createOperationsController,
  parseOperationsPatch,
  parseOperationsScenario,
  recomputeOperationsReport,
  runOperationsExperiment,
  runOperationsToTermination,
  verifyOperationsExperiment,
  type OperationsScenario,
} from "../src/index.js";

const BURST_FIXTURE = "../../fixtures/operations/picking-packing-burst.json";
const BURST_RUNCONFIG =
  "../../fixtures/operations/picking-packing-burst.runconfig.json";

function burstInputs() {
  return {
    scenario: parseOperationsScenario(JSON.parse(readFileSync(BURST_FIXTURE, "utf8"))),
    executionConfig: JSON.parse(readFileSync(BURST_RUNCONFIG, "utf8")).executionConfig,
  };
}

function burstExperiment() {
  const { scenario, executionConfig } = burstInputs();
  return runOperationsExperiment({
    scenario,
    executionConfig,
    interventionPolicy: { allowedFields: ["dispatchDurationMs"] },
    candidates: [
      { candidateId: "fast-dispatch", patch: { dispatchDurationMs: 1000 } },
      { candidateId: "slow-dispatch", patch: { dispatchDurationMs: 300000 } },
    ],
  });
}

// Hand oracle (same corridor arithmetic as the M3b micro oracle): empty
// room, z=2000 corridor, speed 1000mm/s so travel ms == distance mm.
// park(1000)->approach(3000)=2000; pick 500; approach->Q1(4200)=1200;
// Q1->S1(5200)=1000; unload 400; packing service is the patched knob.
// O1: move[0,2000] pick[2000,2500] move[2500,3700] move[3700,4700]
//     unload[4700,5100] pack starts 5100. The station spans 5100-2500=2600
//     and 10400-7800=2600 (its waitMs) include travel and unload after the
//     enqueue instant; they are NOT waiting time and never enter totalWaitMs.
// O2: picker freed at 5100, S1->approach 2200 => pick[7300,7800],
//     enqueue 7800, service arrival 10400, pack starts 10400.
// The only engine wait record is O2 NO_IDLE_PICKER 0..5100 (the single
// picker is busy with O1), so totalWaitMs is 5100 for both pack durations.
// Packing 1000ms: READY 6100 / 11400. Packing 2000ms: READY 7100 / 12400
// (lane is free for O2 either way, so only O1's finish moves).
function oracleScenario(run: OperationsScenario["policies"]["run"]): OperationsScenario {
  return parseOperationsScenario({
    schemaVersion: "layoutlab.operations/1",
    engineVersion: "layoutlab.operations-engine/1",
    id: "exp-oracle",
    provenance: {
      category: "synthetic",
      description: "experiment oracle; synthetic, uncalibrated",
      sourceUrls: [],
      assumptions: ["synthetic corridor geometry"],
      inventedFields: ["all coordinates"],
    },
    seed: "exp-oracle-1",
    units: { quantityUnit: "item", capacityUnit: "handling-unit" },
    geometry: {
      room: { widthMm: 6000, depthMm: 4000 },
      racks: [{ id: "R1", positionMm: { x: 5500, z: 500 }, dimensionsMm: { width: 200, depth: 200, height: 1000 } }],
      obstacles: [],
    },
    products: [{
      id: "P-A", label: "A",
      itemDimensionsMm: { width: 100, depth: 100, height: 100 },
      handlingClass: "ambient", capacityCostUnits: 1,
    }],
    locations: [{
      id: "L-A1", rackId: "R1",
      storageAnchorMm: { x: 1000, y: 500, z: 1000 },
      approachPointMm: { x: 3000, z: 2000 },
      usableDimensionsMm: { width: 500, depth: 400, height: 400 },
      storageClass: "ambient", maxQuantity: 10,
      restrictions: { eligibleHandlingClasses: ["ambient"] },
    }],
    initialStock: [{ locationId: "L-A1", productId: "P-A", quantity: 2 }],
    homeAssignments: [{ productId: "P-A", locationId: "L-A1" }],
    mobileUnits: [{
      id: "U1", role: "picker",
      footprintMm: { width: 600, length: 800, margin: 100 },
      speedMmPerSecond: 1000, loadCapacityUnits: 20,
      eligibleHandlingClasses: ["ambient"],
      parkingSlotMm: { x: 1000, z: 2000 },
    }],
    resources: [{
      id: "PACK-1", kind: "packing",
      servicePositions: [{ id: "S1", x: 5200, z: 2000 }],
      queueSlots: [{ id: "Q1", x: 4200, z: 2000 }],
      serviceCapacity: 1, inputStagingCapacity: 10, outputStagingCapacity: 10,
      serviceDurationMs: 1000,
    }],
    orderSchedule: [
      { id: "O1", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 1 }] },
      { id: "O2", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 1 }] },
    ],
    deliverySchedule: [],
    policies: {
      reservePolicy: "full-order-all-or-none",
      run,
      eventLimits: { maxProcessedEvents: 10000, maxEventsPerTimestamp: 1000 },
    },
  });
}

const ORACLE_EXEC = { pickDurationMsPerItem: 500, unloadDurationMsPerItem: 400 };

describe("operations experiments (E3)", () => {
  test("ranks faster dispatch ahead of baseline and slow dispatch; every report recomputes", { timeout: 120000 }, () => {
    const result = burstExperiment();
    expect(result.schema).toBe("layoutlab.operations-experiment/2");
    expect(result.candidates.map((c) => c.candidateId)).toEqual(["baseline", "fast-dispatch", "slow-dispatch"]);
    for (const c of result.candidates) {
      expect(c.status).toBe("valid-complete");
      expect(c.completionStage).toBe("SUPPORTED_STAGE_COMPLETE");
      expect(c.shipped).toBe(6);
      expect(recomputeOperationsReport(c.report!).ok).toBe(true);
    }
    expect(result.rankedCandidateIds).toEqual(["fast-dispatch", "baseline", "slow-dispatch"]);
    expect(result.selectedCandidateId).toBe("fast-dispatch");
    const fast = result.candidates.find((c) => c.candidateId === "fast-dispatch")!;
    const slow = result.candidates.find((c) => c.candidateId === "slow-dispatch")!;
    expect(fast.makespanMs).toBeLessThan(slow.makespanMs as number);
    expect(verifyOperationsExperiment(JSON.parse(JSON.stringify(result))).ok).toBe(true);
  });

  test("absent policy allows baseline only; denied staffing stays invalid and unranked", () => {
    const { scenario, executionConfig } = burstInputs();
    const result = runOperationsExperiment({
      scenario,
      executionConfig,
      candidates: [{ candidateId: "more-pickers", patch: { extraPickers: 1 } }],
    });
    expect(result.interventionPolicy).toEqual({ allowedFields: [] });
    const denied = result.candidates.find((c) => c.candidateId === "more-pickers")!;
    expect(denied.status).toBe("invalid");
    expect(denied.reason).toContain("staffing is not allowed");
    expect(denied.shipped).toBeNull();
    expect(denied.makespanMs).toBeNull();
    expect(denied.totalWaitMs).toBeNull();
    expect(denied.report).toBeNull();
    expect(result.rankedCandidateIds).toEqual(["baseline"]);
    expect(result.selectedCandidateId).toBe("baseline");
  });

  test("permitted service change is a synthetic assumption and matches the hand oracle", () => {
    const result = runOperationsExperiment({
      scenario: oracleScenario({ mode: "finite-cohort", arrivalCutoffMs: 0 }),
      executionConfig: ORACLE_EXEC,
      interventionPolicy: { allowedFields: ["packingDurationMs"], ranges: { packingDurationMs: { min: 1000, max: 5000 } } },
      candidates: [{ candidateId: "slow-pack", patch: { packingDurationMs: 2000 } }],
    });
    const baseline = result.candidates.find((c) => c.candidateId === "baseline")!;
    const slow = result.candidates.find((c) => c.candidateId === "slow-pack")!;
    // Literal hand-derived READY timestamps; no dispatch lane exists, so an
    // honest export claims shipped 0 and no makespan despite stage complete.
    expect(baseline.report!.orders.map((o) => o.timestamps.READY_FOR_DISPATCH)).toEqual([6100, 11400]);
    expect(slow.report!.orders.map((o) => o.timestamps.READY_FOR_DISPATCH)).toEqual([7100, 12400]);
    for (const c of [baseline, slow]) {
      expect(c.status).toBe("valid-complete");
      expect(c.shipped).toBe(0);
      expect(c.backlog).toBe(2);
      expect(c.stageBacklog).toBe(0);
      expect(c.makespanMs).toBeNull();
      expect(c.lastShippedAtMs).toBeNull();
    }
    expect(result.assumptions.join(" ")).toContain("synthetic service assumptions");
    // Wait categories independently: exactly one wait record (O2 waiting for
    // the busy picker, 0..5100) and the station enqueue-to-start spans of
    // 2600ms each, which are travel+unload, not waits. totalWaitMs sums only
    // wait records, hence 5100 for baseline and the 2000ms variant alike.
    expect(baseline.totalWaitMs).toBe(5100);
    expect(slow.totalWaitMs).toBe(5100);
    const direct = createOperationsController({
      scenario: oracleScenario({ mode: "finite-cohort", arrivalCutoffMs: 0 }),
      executionConfig: ORACLE_EXEC,
    });
    runOperationsToTermination(direct);
    const snap = direct.snapshot();
    expect(snap.waits).toEqual([
      { unitId: null, orderId: "O2", reason: "NO_IDLE_PICKER", detail: "all eligible pickers are tasked; FIFO age retained", startMs: 0, endMs: 5100 },
    ]);
    const jobs = snap.packing.find((p) => p.resourceId === "PACK-1")!.jobs;
    expect(jobs.map((j) => j.waitMs)).toEqual([2600, 2600]);
    expect(verifyOperationsExperiment(JSON.parse(JSON.stringify(result))).ok).toBe(true);
  });

  test("out-of-policy-range service change is invalid, not silently clamped", () => {
    const result = runOperationsExperiment({
      scenario: oracleScenario({ mode: "finite-cohort", arrivalCutoffMs: 0 }),
      executionConfig: ORACLE_EXEC,
      interventionPolicy: { allowedFields: ["packingDurationMs"], ranges: { packingDurationMs: { min: 1000, max: 5000 } } },
      candidates: [{ candidateId: "too-slow", patch: { packingDurationMs: 9000 } }],
    });
    const c = result.candidates.find((x) => x.candidateId === "too-slow")!;
    expect(c.status).toBe("invalid");
    expect(c.reason).toContain("outside the policy range");
  });

  test("invalid geometry from a permitted staffing clone is retained honestly", () => {
    const { scenario, executionConfig } = burstInputs();
    const result = runOperationsExperiment({
      scenario,
      executionConfig,
      interventionPolicy: { allowedFields: ["extraPickers"] },
      candidates: [{ candidateId: "more-pickers", patch: { extraPickers: 1 } }],
    });
    const c = result.candidates.find((x) => x.candidateId === "more-pickers")!;
    expect(c.status).toBe("invalid");
    expect(c.reason).toContain("infeasible");
    expect(c.report).toBeNull();
    expect(result.candidates[0]!.status).toBe("valid-complete");
    expect(result.rankedCandidateIds).toEqual(["baseline"]);
  });

  test("a bad candidate among valid ones erases nothing and keeps order", { timeout: 60000 }, () => {
    const { scenario, executionConfig } = burstInputs();
    const result = runOperationsExperiment({
      scenario,
      executionConfig,
      interventionPolicy: { allowedFields: ["dispatchDurationMs"] },
      candidates: [
        { candidateId: "fast-dispatch", patch: { dispatchDurationMs: 1000 } },
        { candidateId: "broken", patch: { dispatchDurationMs: 5 } },
        { candidateId: "slow-dispatch", patch: { dispatchDurationMs: 300000 } },
      ],
    });
    expect(result.candidates.map((c) => c.candidateId)).toEqual(["baseline", "fast-dispatch", "broken", "slow-dispatch"]);
    expect(result.candidates.map((c) => c.status)).toEqual(["valid-complete", "valid-complete", "invalid", "valid-complete"]);
    expect(result.candidates[2]!.reason).toContain("invalid patch");
    expect(result.rankedCandidateIds).toEqual(["fast-dispatch", "baseline", "slow-dispatch"]);
  });

  test("incomplete finite-cohort run is valid-incomplete with no fake makespan", () => {
    const scenario = parseOperationsScenario({
      ...(JSON.parse(JSON.stringify(oracleScenario({ mode: "finite-cohort", arrivalCutoffMs: 0 }))) as Record<string, unknown>),
      orderSchedule: [{ id: "O1", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 5 }] }],
    });
    const result = runOperationsExperiment({
      scenario,
      executionConfig: ORACLE_EXEC,
      safetyCeilingMs: 120000,
      candidates: [],
    });
    const baseline = result.candidates[0]!;
    expect(baseline.status).toBe("valid-incomplete");
    expect(baseline.completionStage).toBe("IN_PROGRESS");
    expect(baseline.shipped).toBe(0);
    expect(baseline.backlog).toBe(1);
    expect(baseline.makespanMs).toBeNull();
    expect(baseline.termination).toMatchObject({ stopReason: "safety-ceiling", stopClockMs: 120000, safetyCeilingMs: 120000 });
    expect(result.rankedCandidateIds).toEqual(["baseline"]);
  });

  test("fixed-window horizon ends the window; partial shipped time is not makespan", () => {
    const result = runOperationsExperiment({
      scenario: oracleScenario({ mode: "fixed-window", horizonMs: 3000 }),
      executionConfig: ORACLE_EXEC,
      candidates: [],
    });
    const baseline = result.candidates[0]!;
    expect(baseline.status).toBe("valid-incomplete");
    expect(baseline.completionStage).toBe("WINDOW_ENDED");
    expect(baseline.termination).toMatchObject({ mode: "fixed-window", horizonMs: 3000, stopClockMs: 3000, stopReason: "window-ended" });
    expect(baseline.makespanMs).toBeNull();
    expect(baseline.report!.orders[0]!.state).toBe("WAITING_FOR_PACKING");
  });

  test("no improvement selects the baseline; caller inputs stay unchanged", { timeout: 60000 }, () => {
    const { scenario, executionConfig } = burstInputs();
    const before = JSON.stringify({ scenario, executionConfig });
    const result = runOperationsExperiment({
      scenario,
      executionConfig,
      interventionPolicy: { allowedFields: ["dispatchDurationMs"] },
      candidates: [{ candidateId: "slow-dispatch", patch: { dispatchDurationMs: 300000 } }],
    });
    expect(result.selectedCandidateId).toBe("baseline");
    expect(result.rankedCandidateIds).toEqual(["baseline", "slow-dispatch"]);
    expect(JSON.stringify({ scenario, executionConfig })).toBe(before);
    expect(() => parseOperationsPatch({ unknownKnob: 1 })).toThrow();
    expect(() =>
      runOperationsExperiment({
        scenario, executionConfig,
        candidates: [
          { candidateId: "dup", patch: { dispatchDurationMs: 1000 } },
          { candidateId: "dup", patch: { dispatchDurationMs: 2000 } },
        ],
      }),
    ).toThrow(/duplicate candidate/);
  });

  test("tampered exports fail offline verification; legacy reports are not fully verified", { timeout: 120000 }, () => {
    const result = runOperationsExperiment({
      scenario: oracleScenario({ mode: "finite-cohort", arrivalCutoffMs: 0 }),
      executionConfig: ORACLE_EXEC,
      interventionPolicy: { allowedFields: ["packingDurationMs"] },
      candidates: [{ candidateId: "slow-pack", patch: { packingDurationMs: 2000 } }],
    });
    const exported = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(verifyOperationsExperiment(exported).ok).toBe(true);
    const tamper = (mutate: (e: typeof result) => void): string[] => {
      const copy = JSON.parse(JSON.stringify(result)) as typeof result;
      mutate(copy);
      return verifyOperationsExperiment(copy).mismatches;
    };
    expect(tamper((e) => { e.candidates[0]!.totalWaitMs = 0; }).join(" ")).toContain("totalWaitMs");
    expect(tamper((e) => { e.candidates[0]!.makespanMs = 1; }).join(" ")).toContain("makespanMs");
    expect(tamper((e) => { e.rankedCandidateIds = ["slow-pack", "baseline"]; }).join(" ")).toContain("rankedCandidateIds");
    expect(tamper((e) => { e.candidates[0]!.report!.counts.shipped = 9; }).join(" ")).toContain("counts.shipped");
    expect(tamper((e) => { e.candidates[0]!.report!.orders[0]!.timestamps.READY_FOR_DISPATCH = 1; }).join(" ")).toContain("timestamps");
    expect(tamper((e) => { e.commonInputs.scenario.initialStock[0]!.quantity = 1; }).length).toBeGreaterThan(0);
    expect(tamper((e) => { e.candidates.splice(1, 1); }).length).toBeGreaterThan(0);
    expect(tamper((e) => { e.versions.operationsEngine = "layoutlab.operations-engine/999"; }).join(" ")).toContain("versions.operationsEngine");
    // Report-level tampering: checks, clock, seed and missing rows.
    const report = JSON.parse(JSON.stringify(result.candidates[0]!.report)) as NonNullable<(typeof result.candidates)[0]["report"]>;
    expect(recomputeOperationsReport(report).ok).toBe(true);
    const badChecks = { ...report, checks: { ...report.checks, safety: ["fake"] } };
    expect(recomputeOperationsReport(badChecks).mismatches.join(" ")).toContain("checks.safety");
    const badClock = { ...report, clockMs: (report.clockMs as number) - 60000 };
    expect(recomputeOperationsReport(badClock).ok).toBe(false);
    const missingOrder = { ...report, orders: report.orders.slice(1) };
    expect(recomputeOperationsReport(missingOrder).mismatches.join(" ")).toContain("missing in saved report");
    const legacy = { ...report } as Record<string, unknown>;
    delete legacy["clockMs"]; delete legacy["termination"]; delete legacy["totalWaitMs"];
    delete legacy["makespanMs"]; delete legacy["lastShippedAtMs"];
    const legacyResult = recomputeOperationsReport(legacy as never);
    expect(legacyResult.ok).toBe(false);
    expect(legacyResult.mismatches.join(" ")).toContain("legacy report not fully verifiable");
  });

  test("review regressions: impossible/missing termination and fabricated reasons fail", () => {
    const result = runOperationsExperiment({
      scenario: oracleScenario({ mode: "finite-cohort", arrivalCutoffMs: 0 }),
      executionConfig: ORACLE_EXEC,
      candidates: [{ candidateId: "more-pickers", patch: { extraPickers: 1 } }],
    });
    const exported = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(verifyOperationsExperiment(exported).ok).toBe(true);
    const report = JSON.parse(JSON.stringify(result.candidates[0]!.report)) as NonNullable<(typeof result.candidates)[0]["report"]>;
    expect(recomputeOperationsReport(report).ok).toBe(true);
    // (1) Standalone report claiming a 1ms safety ceiling far below its stop.
    const ceilingLie = { ...report, termination: { ...report.termination!, stopReason: "safety-ceiling" as const, safetyCeilingMs: 1 } };
    const ceilingResult = recomputeOperationsReport(ceilingLie);
    expect(ceilingResult.ok).toBe(false);
    expect(ceilingResult.mismatches.join(" ")).toContain("safetyCeilingMs");
    // Impossible ceiling even under an otherwise-consistent stage reason.
    const impossible = { ...report, termination: { ...report.termination!, safetyCeilingMs: 1 } };
    expect(recomputeOperationsReport(impossible).mismatches.join(" ")).toContain("impossible ceiling");
    // Invalid stop reason and missing stop reason are rejected, not defaulted.
    const badReason = { ...report, termination: { ...report.termination!, stopReason: "finished" as never } };
    expect(recomputeOperationsReport(badReason).mismatches.join(" ")).toContain("invalid stop reason");
    const noReason = JSON.parse(JSON.stringify(report)) as typeof report;
    delete (noReason.termination as unknown as Record<string, unknown>)["stopReason"];
    expect(recomputeOperationsReport(noReason).mismatches.join(" ")).toContain("missing declared stop reason");
    // (2) Comparison without its declared termination policy must not pass.
    const noPolicy = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
    delete noPolicy["terminationPolicy"];
    const noPolicyResult = verifyOperationsExperiment(noPolicy);
    expect(noPolicyResult.ok).toBe(false);
    expect(noPolicyResult.mismatches.join(" ")).toContain("terminationPolicy.safetyCeilingMs");
    // Candidate termination missing its ceiling field likewise fails.
    const noCeiling = JSON.parse(JSON.stringify(result)) as typeof result;
    delete (noCeiling.candidates[0]!.termination as unknown as Record<string, unknown>)["safetyCeilingMs"];
    expect(verifyOperationsExperiment(noCeiling).ok).toBe(false);
    // (3) A fabricated success reason on the invalid candidate fails exactly.
    const fakeReason = JSON.parse(JSON.stringify(result)) as typeof result;
    const invalid = fakeReason.candidates.find((c) => c.status === "invalid")!;
    expect(invalid.reasonCode).toBe("POLICY_VIOLATION");
    invalid.reason = "Physics verified: all robots completed successfully";
    const fakeResult = verifyOperationsExperiment(fakeReason);
    expect(fakeResult.ok).toBe(false);
    expect(fakeResult.mismatches.join(" ")).toContain(".reason");
    // Valid labels require clean invariant checks (all fixtures here are
    // clean; the checks-failed label guards runs that are not).
    for (const c of result.candidates) {
      if (c.status === "valid-complete" || c.status === "valid-incomplete") {
        expect(c.report!.checks).toEqual({ conservation: [], capacity: [], safety: [] });
      }
    }
  });

  test("termination evidence: over-max ceiling and bare no-progress fail; legitimate stops pass", () => {
    // Bare partial export (caller drove the clock, null ceiling) verifies.
    const bare = createOperationsController({
      scenario: oracleScenario({ mode: "fixed-window", horizonMs: 3000 }),
      executionConfig: ORACLE_EXEC,
    });
    bare.advanceTo(3000);
    const bareReport = bare.exportReport();
    expect(bareReport.termination).toMatchObject({ safetyCeilingMs: null, stopReason: "window-ended" });
    expect(recomputeOperationsReport(bareReport).ok).toBe(true);
    // The same bare export claiming no-progress has no driver evidence.
    const bareLie = { ...bareReport, termination: { ...bareReport.termination!, stopReason: "no-progress" as const } };
    const bareLieResult = recomputeOperationsReport(bareLie);
    expect(bareLieResult.ok).toBe(false);
    expect(bareLieResult.mismatches.join(" ")).toContain("without run-driver evidence");
    // A ceiling above the engine MAX_TIME_MS is invalid declared evidence.
    const overCeiling = { ...bareReport, termination: { ...bareReport.termination!, safetyCeilingMs: 2147483648 } };
    const overResult = recomputeOperationsReport(overCeiling);
    expect(overResult.ok).toBe(false);
    expect(overResult.mismatches.join(" ")).toContain("invalid ceiling 2147483648");
    // A legitimate declared safety stop: driver termination attached to its
    // own report reconstructs exactly (stock-short order never completes).
    const stockScenario = parseOperationsScenario({
      ...(JSON.parse(JSON.stringify(oracleScenario({ mode: "finite-cohort", arrivalCutoffMs: 0 }))) as Record<string, unknown>),
      orderSchedule: [{ id: "O1", arrivalTimeMs: 0, lines: [{ productId: "P-A", quantity: 5 }] }],
    });
    const driver = createOperationsController({ scenario: stockScenario, executionConfig: ORACLE_EXEC });
    const driven = runOperationsToTermination(driver, 120000);
    expect(driven).toMatchObject({ stopReason: "safety-ceiling", stopClockMs: 120000 });
    const declared = driver.exportReport();
    declared.termination = driven;
    expect(recomputeOperationsReport(declared).ok).toBe(true);
    // But the same report with the reason swapped fails driver comparison.
    const swapped = { ...declared, termination: { ...driven, stopReason: "caller-stopped" as const } };
    expect(recomputeOperationsReport(swapped).ok).toBe(false);
  });
});
