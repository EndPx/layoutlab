// Implementation-version provenance: the archived 0.1.0 runtime and the
// current 0.1.1 implementation stay separately selectable, recorded
// reports/experiments recompute with their own engine, and unsupported
// versions fail honestly. Expectations below are workload facts observed
// from the fixtures (shipped counts, clocks, metrics), not re-derivations
// of the engine's travel arithmetic.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  SIMULATION_VERSION,
  SUPPORTED_IMPLEMENTATION_VERSIONS,
  UnsupportedImplementationVersionError,
  createOperationsController,
  createOperationsControllerForVersion,
  isSupportedImplementationVersion,
  operationsRunMetrics,
  parseOperationsScenario,
  recomputeOperationsReportForVersion,
  runOperationsExperiment,
  runOperationsToTermination,
  verifyOperationsExperimentForVersion,
  type OperationsReport,
} from "../src/index.js";

const BURST_FIXTURE = "../../fixtures/operations/picking-packing-burst.json";
const MAIN_FIXTURE = "../../fixtures/operations/main-warehouse.json";
const RUNCONFIG = "../../fixtures/operations/picking-packing-burst.runconfig.json";

function horizonOf(scenario: ReturnType<typeof parseOperationsScenario>): number {
  const run = scenario.policies.run;
  return run.mode === "fixed-window" ? run.horizonMs : 0;
}

function burstInputs() {
  return {
    scenario: parseOperationsScenario(JSON.parse(readFileSync(BURST_FIXTURE, "utf8"))),
    executionConfig: JSON.parse(readFileSync(RUNCONFIG, "utf8")).executionConfig,
  };
}

describe("implementation version contracts", () => {
  test("input contracts stay /1 while the implementation is 0.1.1", () => {
    expect(OPERATIONS_SCHEMA_VERSION).toBe("layoutlab.operations/1");
    expect(OPERATIONS_ENGINE_VERSION).toBe("layoutlab.operations-engine/1");
    expect(SIMULATION_VERSION).toBe("0.1.1");
    expect(SUPPORTED_IMPLEMENTATION_VERSIONS).toEqual(["0.1.0", "0.1.1"]);
    expect(isSupportedImplementationVersion("0.1.0")).toBe(true);
    expect(isSupportedImplementationVersion("0.1.1")).toBe(true);
    expect(isSupportedImplementationVersion("0.2.0")).toBe(false);
    expect(isSupportedImplementationVersion(undefined)).toBe(false);
  });

  test("unsupported or absent versions reject, never fall back", () => {
    const inputs = burstInputs();
    expect(() => createOperationsControllerForVersion(inputs, "0.2.0")).toThrow(
      UnsupportedImplementationVersionError,
    );
    expect(() => createOperationsControllerForVersion(inputs, "")).toThrow(
      /unsupported operations implementation version/,
    );
    expect(() =>
      createOperationsControllerForVersion(inputs, undefined as unknown as string),
    ).toThrow(UnsupportedImplementationVersionError);
  });

  test("default controller is the current implementation", () => {
    const c = createOperationsController(burstInputs());
    expect(c.exportReport().versions.simulation).toBe("0.1.1");
  });
});

describe("archived 0.1.0 replay", () => {
  test("burst metrics are identical across implementations, metadata is distinct", () => {
    const runs = (["0.1.0", "0.1.1"] as const).map((v) => {
      const c = createOperationsControllerForVersion(burstInputs(), v);
      const termination = runOperationsToTermination(c);
      const snap = c.snapshot();
      const report = c.exportReport();
      return {
        v,
        report,
        termination,
        counts: snap.counts,
        metrics: operationsRunMetrics(snap, c.getCompletionStatus().stage),
      };
    });
    const [oldRun, newRun] = runs as [(typeof runs)[0], (typeof runs)[0]];
    expect(oldRun.report.versions.simulation).toBe("0.1.0");
    expect(newRun.report.versions.simulation).toBe("0.1.1");
    expect(oldRun.counts).toEqual(newRun.counts);
    expect(oldRun.counts.shipped).toBe(6);
    expect(oldRun.metrics).toEqual(newRun.metrics);
    expect(oldRun.termination.stopClockMs).toBe(newRun.termination.stopClockMs);
  });

  test("full shift: archived 11/28, current 28/28, inbound still blocked", { timeout: 120_000 }, () => {
    const scenario = parseOperationsScenario(JSON.parse(readFileSync(MAIN_FIXTURE, "utf8")));
    const executionConfig = JSON.parse(readFileSync(RUNCONFIG, "utf8")).executionConfig;
    const shipped = (v: string) => {
      const c = createOperationsControllerForVersion({ scenario, executionConfig }, v);
      c.advanceTo(horizonOf(scenario));
      const s = c.snapshot();
      return { shipped: s.counts.shipped, checks: s.checks, deliveryStates: [...new Set(s.deliveries.map((d) => d.state))] };
    };
    const oldRun = shipped("0.1.0");
    const newRun = shipped("0.1.1");
    expect(oldRun.shipped).toBe(11);
    expect(newRun.shipped).toBe(28);
    for (const r of [oldRun, newRun]) {
      expect(r.checks).toEqual({ conservation: [], capacity: [], safety: [] });
      expect(r.deliveryStates).toEqual(["RECEIVING"]);
    }
  });

  test("recorded 0.1.0 report recomputes only under its own implementation", { timeout: 120_000 }, () => {
    const c = createOperationsControllerForVersion(burstInputs(), "0.1.0");
    runOperationsToTermination(c);
    const report = c.exportReport();
    const viaDispatch = recomputeOperationsReportForVersion(report);
    expect(viaDispatch.ok).toBe(true);
    expect(viaDispatch.verifierImplementationVersion).toBe("0.1.0");
    // A 0.1.0 full-shift report relabeled as current fails: the current
    // engine ships 28 orders where 0.1.0 shipped 11, so counts diverge.
    const scenario = parseOperationsScenario(JSON.parse(readFileSync(MAIN_FIXTURE, "utf8")));
    const oldFull = createOperationsControllerForVersion(
      { scenario, executionConfig: JSON.parse(readFileSync(RUNCONFIG, "utf8")).executionConfig },
      "0.1.0",
    );
    oldFull.advanceTo(horizonOf(scenario));
    const relabeled = structuredClone(oldFull.exportReport()) as OperationsReport;
    relabeled.versions = { ...relabeled.versions, simulation: "0.1.1" };
    const wrong = recomputeOperationsReportForVersion(relabeled);
    expect(wrong.ok).toBe(false);
    expect(wrong.verifierImplementationVersion).toBe("0.1.1");
    expect(wrong.mismatches.length).toBeGreaterThan(0);
    // An unsupported recording is rejected honestly, with no verifier.
    const unknown = structuredClone(report) as OperationsReport;
    unknown.versions = { ...unknown.versions, simulation: "9.9.9" };
    const rejected = recomputeOperationsReportForVersion(unknown);
    expect(rejected.ok).toBe(false);
    expect(rejected.verifierImplementationVersion).toBeNull();
    expect(rejected.mismatches.join(" ")).toContain("unsupported");
  });

  test("recorded 0.1.0 experiment verifies through the dispatch", async () => {
    const archived = await import("../archive/0.1.0/runtime.mjs");
    const { scenario, executionConfig } = burstInputs();
    const saved = archived.runOperationsExperiment({
      scenario,
      executionConfig,
      candidates: [{ candidateId: "baseline", patch: {} }],
    });
    expect(saved.versions.simulation).toBe("0.1.0");
    const verified = verifyOperationsExperimentForVersion(saved);
    expect(verified.ok).toBe(true);
    expect(verified.verifierImplementationVersion).toBe("0.1.0");
  });

  test("recorded current experiment verifies through the dispatch", () => {
    const { scenario, executionConfig } = burstInputs();
    const exp = runOperationsExperiment({ scenario, executionConfig, candidates: [{ candidateId: "baseline", patch: {} }] });
    expect(exp.versions.simulation).toBe("0.1.1");
    const verified = verifyOperationsExperimentForVersion(exp);
    expect(verified.ok).toBe(true);
    expect(verified.verifierImplementationVersion).toBe("0.1.1");
    const unknown = structuredClone(exp) as typeof exp;
    unknown.versions = { ...unknown.versions, simulation: "9.9.9" };
    const rejected = verifyOperationsExperimentForVersion(unknown);
    expect(rejected.ok).toBe(false);
    expect(rejected.verifierImplementationVersion).toBeNull();
  });

  test("archive artifact matches its manifest hash (tampering is detectable)", () => {
    const manifest = JSON.parse(readFileSync("archive/manifest.json", "utf8"));
    const bundle = readFileSync("archive/0.1.0/runtime.mjs");
    const sha = createHash("sha256").update(bundle).digest("hex").toUpperCase();
    expect(manifest.implementationVersion).toBe("0.1.0");
    expect(manifest.bundle.sha256).toBe(sha);
    expect(manifest.bundle.bytes).toBe(bundle.length);
    expect(manifest.sources["packages/simulation/src/version.ts"]).toBeTruthy();
  });
});
