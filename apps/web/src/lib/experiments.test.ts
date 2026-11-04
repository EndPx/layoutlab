// E4b pure-helper regressions. Run with the simulation workspace runner:
//   npx --prefix packages/simulation vitest run --root . apps/web/src/lib/experiments.test.ts
import { describe, expect, it } from "vitest";
import {
  buildPolicy,
  changedFields,
  defaultPermissions,
  formatPercent,
  formatSeconds,
  parseInvestigationReport,
  provenanceOf,
  runLocalBaseline,
  type InvestigationReport,
} from "./experiments";
import { burstScenarioAndConfig } from "./operations";

describe("permissions policy", () => {
  it("defaults to no allowed fields (nothing granted)", () => {
    const { policy, errors } = buildPolicy(defaultPermissions());
    expect(errors).toEqual([]);
    expect(policy?.allowedFields).toEqual([]);
  });

  it("builds ranges only for checked fields", () => {
    const draft = defaultPermissions();
    draft.dispatchDurationMs = { checked: true, minMs: 1000, maxMs: 60000 };
    const { policy, errors } = buildPolicy(draft);
    expect(errors).toEqual([]);
    expect(policy).toEqual({
      allowedFields: ["dispatchDurationMs"],
      ranges: { dispatchDurationMs: { min: 1000, max: 60000 } },
    });
  });

  it("rejects inverted and out-of-bounds ranges", () => {
    const draft = defaultPermissions();
    draft.packingDurationMs = { checked: true, minMs: 60000, maxMs: 1000 };
    expect(buildPolicy(draft).errors.join(" ")).toContain("Packing");
    const draft2 = defaultPermissions();
    draft2.receivingDurationMs = { checked: true, minMs: 10, maxMs: 999999 };
    expect(buildPolicy(draft2).errors.join(" ")).toContain("Receiving");
  });
});

describe("display formatting", () => {
  it("formats ms as seconds with one decimal and null as em dash", () => {
    expect(formatSeconds(502400)).toBe("502.4 s");
    expect(formatSeconds(1000)).toBe("1.0 s");
    expect(formatSeconds(null)).toBe("—");
    expect(formatSeconds(undefined)).toBe("—");
  });
  it("formats percents at one decimal", () => {
    expect(formatPercent(20.959395)).toBe("21.0%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("changed fields and import validation", () => {
  it("shows duration before/after from the actual baseline scenario", () => {
    const { scenario, executionConfig } = burstScenarioAndConfig();
    const comparison = runLocalBaseline(scenario, executionConfig);
    const baseline = comparison.candidates[0]!;
    const rows = changedFields(scenario, baseline);
    const dispatch = rows.find((r) => r.field === "dispatchDurationMs")!;
    expect(dispatch.before).toContain("60000 ms");
    expect(dispatch.changed).toBe(false);
    const patched = { ...baseline, patch: { dispatchDurationMs: 30000 } };
    const rows2 = changedFields(scenario, patched as typeof baseline);
    expect(rows2.find((r) => r.field === "dispatchDurationMs")?.after).toContain("30000 ms");
    expect(rows2.find((r) => r.field === "dispatchDurationMs")?.changed).toBe(true);
  });

  it("rejects malformed imports with reasons", () => {
    expect(parseInvestigationReport(null).error).toContain("not a JSON object");
    expect(parseInvestigationReport({ schema: "other/1" }).error).toContain("Unsupported schema");
    expect(parseInvestigationReport({ schema: "layoutlab.operations-investigation/1" }).error).toContain("runId");
  });

  it("rejects near-valid reports with missing or wrong-type UI-consumed fields", () => {
    const good = {
      schema: "layoutlab.operations-investigation/1",
      runId: "r1", createdAt: "2026-11-04T00:00:00.000Z", completedAt: null,
      state: "COMPLETED", outcome: "model-recommendation", lastError: null,
      input: { scenario: { id: "s", seed: "x", resources: [], mobileUnits: [], orderSchedule: [], deliverySchedule: [], products: [], locations: [] }, executionConfig: { pickDurationMsPerItem: 1, unloadDurationMsPerItem: 1 }, interventionPolicy: { allowedFields: [] }, safetyCeilingMs: 1000, question: "q", mode: "live", consent: true },
      scenarioId: "s", seed: "x",
      versions: { simulation: "0.1.0", operationsSchema: "layoutlab.operations/1", operationsEngine: "layoutlab.operations-engine/1", evaluator: "layoutlab.operations-investigation/1", experimentSchema: "layoutlab.operations-experiment/2", api: "0.4.0", prompt: "p" },
      provider: "meta", providerKind: "fixture", configuredModel: "m", returnedModel: "m", realMetaRequests: 0,
      limits: { maxModelRequests: 4, maxExperiments: 3, maxCompletionTokens: 2000, timeoutMs: 1000 },
      budget: { publicBudgetPerRunUsd: 0.25, claimId: null, accounting: "a" },
      requestCount: 0, experimentCount: 0, requests: [], trace: [],
      comparison: null, recommendation: null, assumptions: [], limitations: [],
    };
    expect(parseInvestigationReport(structuredClone(good)).error).toBeNull();
    const noCreated = structuredClone(good) as Record<string, unknown>;
    delete noCreated["createdAt"];
    expect(parseInvestigationReport(noCreated).error).toContain("createdAt");
    const badState = { ...structuredClone(good), state: 42 };
    expect(parseInvestigationReport(badState).error).toContain("state");
    const badLimits = structuredClone(good) as { limits: unknown };
    badLimits.limits = { maxModelRequests: "4" };
    expect(parseInvestigationReport(badLimits).error).toContain("limits");
    const badTrace = structuredClone(good) as { trace: unknown };
    badTrace.trace = [{ seq: "1", kind: "baseline" }];
    expect(parseInvestigationReport(badTrace).error).toContain("trace");
    const badCandidate = structuredClone(good) as { comparison: unknown };
    badCandidate.comparison = { baselineCandidateId: "baseline", candidates: [{ candidateId: "baseline", shipped: "6" }], rankedCandidateIds: [], selectedCandidateId: null };
    expect(parseInvestigationReport(badCandidate).error).toContain("candidate");
  });

  it("labels fixture reports as fixture, never live", () => {
    const fake = { providerKind: "fixture" } as InvestigationReport;
    expect(provenanceOf(fake, "imported").kind).toBe("fixture");
    const meta = { providerKind: "meta" } as InvestigationReport;
    expect(provenanceOf(meta, "recorded").label).toContain("Recorded Meta run");
    expect(provenanceOf(fake, "live").label).toContain("Fixture investigation");
    expect(provenanceOf(meta, "live").label).toContain("Live investigation");
  });
});
