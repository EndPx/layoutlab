// M5 trust-boundary contracts: the shared failure-audit schema and the
// canonical input-reference gate. One Zod source for API, browser, and
// benchmark replay; tamper cases pin the bounds.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseScenario,
  replayFailureRecord,
  validateCanonicalRefs,
} from "../src/index.js";

function sampleScenario(): ReturnType<typeof parseScenario> {
  const url = new URL("../../../fixtures/sample/warehouse-basic.json", import.meta.url);
  return parseScenario(JSON.parse(readFileSync(url, "utf8")) as unknown);
}

function validAudit(): Record<string, unknown> {
  return {
    envelopeVersion: "layoutlab.m5failure/1",
    runId: "run-audit-1",
    exportedAt: new Date().toISOString(),
    apiVersion: "0.4.0",
    coreVersion: "0.1.0",
    routePolicy: "nearest-neighbor-a-star/1",
    provider: "meta",
    providerKind: "fixture",
    realMetaRequests: 0,
    modelId: "fixture-muse-shape",
    promptVersion: "layoutlab.m4prompt/1",
    generationSettings: { reasoningEffort: "low", maxCompletionTokens: 2000 },
    state: "TIMED_OUT",
    phase: "AWAITING_APPROVAL",
    outcome: null,
    reportAvailable: false,
    measurement: null,
    evaluationBoundary: "no approved report exists",
    modelRequestsUsed: 1,
    proposalsUsed: 0,
    budgets: { maxProposals: 3, maxRequests: 4, timeoutMs: 120000 },
    usageTotals: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    usageIncomplete: false,
    scenario: JSON.parse(JSON.stringify(sampleScenario())),
    requestText: "reduce travel",
    requirements: null,
    requirementsDraft: null,
    interpretedUnresolved: ["Is cold-chain relocation allowed?"],
    interpretError: null,
    interpretDiagnostics: { responseId: "chatcmpl-1", finishReason: "stop", errorCode: null },
    attempts: [],
    lastError: "deadline",
    limitations: ["failure audit"],
  };
}

describe("M5 failure-audit contract", () => {
  it("accepts a valid audit and states no approved report exists", () => {
    const replayed = replayFailureRecord(validAudit());
    expect(replayed).toEqual({
      valid: true,
      evaluated: false,
      provider: "meta",
      runId: "run-audit-1",
      state: "TIMED_OUT",
      notice: expect.stringContaining("No approved evaluation report exists"),
    });
    expect(replayed).not.toHaveProperty("matchesSaved");
  });

  it("rejects success claims and over-cap, fractional, or misshapen fields", () => {
    const tampered = (mutate: (e: Record<string, unknown>) => void): Record<string, unknown> => {
      const e = JSON.parse(JSON.stringify(validAudit())) as Record<string, unknown>;
      mutate(e);
      return e;
    };
    expect(() => replayFailureRecord(tampered((e) => { e["outcome"] = "NO_IMPROVEMENT_FOUND"; }))).toThrow(/outcome/);
    expect(() => replayFailureRecord(tampered((e) => { e["reportAvailable"] = true; }))).toThrow(/reportAvailable/);
    expect(() => replayFailureRecord(tampered((e) => { e["measurement"] = {}; }))).toThrow(/measurement/);
    expect(() => replayFailureRecord(tampered((e) => { e["attempts"] = [{}]; }))).toThrow(/attempts/);
    expect(() => replayFailureRecord(tampered((e) => { e["state"] = "COMPLETED"; }))).toThrow(/state/);
    expect(() => replayFailureRecord(tampered((e) => { e["modelRequestsUsed"] = 5; }))).toThrow(/modelRequestsUsed/);
    expect(() => replayFailureRecord(tampered((e) => {
      e["budgets"] = { maxProposals: 9, maxRequests: 99, timeoutMs: 999999 };
    }))).toThrow(/budgets/);
    expect(() => replayFailureRecord(tampered((e) => { e["modelRequestsUsed"] = 2.5; }))).toThrow(/modelRequestsUsed/);
    expect(() => replayFailureRecord(tampered((e) => { e["interpretedUnresolved"] = [{ q: 1 }]; }))).toThrow(
      /interpretedUnresolved/,
    );
    expect(() => replayFailureRecord(tampered((e) => {
      e["usageTotals"] = { promptTokens: 1.5, completionTokens: 0, totalTokens: 0 };
    }))).toThrow(/usageTotals/);
    expect(() => replayFailureRecord(tampered((e) => {
      e["generationSettings"] = { reasoningEffort: "low", maxCompletionTokens: 4000 };
    }))).toThrow(/generationSettings/);
    expect(() => replayFailureRecord(tampered((e) => { e["exportedAt"] = "not-a-time"; }))).toThrow(/exportedAt/);
    expect(() => replayFailureRecord("not-an-object")).toThrow();
  });
});

describe("M5 canonical input-reference gate", () => {
  it("passes intact scenarios", () => {
    expect(validateCanonicalRefs(sampleScenario())).toEqual({ ok: true, issues: [] });
  });

  it("flags unknown order products and immutable allowlist/lock refs", () => {
    const broken = sampleScenario();
    broken.orders[0]!.lines.push({ productId: "ghost-sku", quantity: 1 });
    broken.products[0]!.allowedLocationIds = ["L-ghost"];
    broken.locations[0]!.allowedProductIds = ["ghost-sku"];
    broken.products[1]!.lockedLocationId = "L-ghost";
    const check = validateCanonicalRefs(broken);
    expect(check.ok).toBe(false);
    expect(check.issues.map((i) => i.code).sort()).toEqual([
      "ALLOWLIST_UNKNOWN_LOCATION",
      "ALLOWLIST_UNKNOWN_PRODUCT",
      "LOCKED_UNKNOWN_LOCATION",
      "ORDER_UNKNOWN_PRODUCT",
    ]);
  });

  it("passes ordinary incompatible assignment baselines that search can repair", () => {
    // Occupancy and class violations are assignment-validator errors, not
    // canonical input failures: the gate must not reject them.
    const scenario = sampleScenario();
    scenario.assignments = [
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L2" },
      ...scenario.assignments.filter((a) => a.productId !== "sku-a" && a.productId !== "sku-b"),
    ];
    expect(validateCanonicalRefs(scenario).ok).toBe(true);
  });
});
