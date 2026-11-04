// Unified-workspace helper regressions (plain language + identity).
//   npx --prefix packages/simulation vitest run --root . apps/web/src/lib/workspace.test.ts
import { describe, expect, it } from "vitest";
import {
  friendlyCandidateStatus,
  canonicalIdentity,
  replayVersion,
  assumptionSentence,
  completionLabel,
  formatFinishTime,
  humanOptionName,
  isStaleReport,
  remainingCounts,
} from "./workspace";

describe("plain-language mapping", () => {
  it("formats finish time as min/sec and keeps null unavailable", () => {
    expect(formatFinishTime(502000)).toBe("8min 22sec");
    expect(formatFinishTime(45000)).toBe("45sec");
    expect(formatFinishTime(null)).toBeNull();
  });
  it("names options from actual patches as assumptions", () => {
    expect(humanOptionName("exp-2", { dispatchDurationMs: 30000 }, false)).toBe(
      "Option 2 — Assume dispatch takes 30 seconds per order",
    );
    expect(humanOptionName("baseline", {}, true)).toBe("Current");
    expect(assumptionSentence("packingDurationMs", 45000)).toBe("Assume packing takes 45 seconds per order");
  });
  it("qualifies stage-only completion instead of claiming all shipped", () => {
    expect(completionLabel("SUPPORTED_STAGE_COMPLETE", 6, 6)).toBe("Completed");
    expect(completionLabel("SUPPORTED_STAGE_COMPLETE", 0, 6)).toContain("supported stage only");
  });
  it("keeps remaining distinct from arrived backlog", () => {
    expect(remainingCounts({ selected: 6, arrived: 2, shipped: 1 })).toEqual({
      remaining: 5,
      arrivedBacklog: 1,
      notYetArrived: 4,
    });
  });
  it("marks reports from another scenario/seed stale", () => {
    expect(isStaleReport({ scenarioId: "a", seed: "1" }, { scenarioId: "b", seed: "1" })).toBe(true);
    expect(isStaleReport({ scenarioId: "a", seed: "1" }, { scenarioId: "a", seed: "1" })).toBe(false);
    expect(isStaleReport(null, { scenarioId: "a", seed: "1" })).toBe(false);
  });
});

describe("complete canonical identity", () => {
  const input = { scenario: { id: "same", seed: "same", geometry: [1], orderSchedule: [2], stock: [3] }, executionConfig: { pick: 4 }, implementationVersion: "0.1.0" };
  it("accepts equivalent inputs independent of property order", () => {
    expect(isStaleReport(input, JSON.parse(JSON.stringify(input)))).toBe(false);
    expect(canonicalIdentity({ a: 1, b: 2 })).toBe(canonicalIdentity({ b: 2, a: 1 }));
  });
  for (const field of ["geometry", "orderSchedule", "stock"]) it(`detects changed ${field} with unchanged ID/seed`, () => {
    expect(isStaleReport(input, { ...input, scenario: { ...input.scenario, [field]: [99] } })).toBe(true);
  });
  it("detects configuration and implementation changes", () => {
    expect(isStaleReport(input, { ...input, executionConfig: { pick: 5 } })).toBe(true);
    expect(isStaleReport(input, { ...input, implementationVersion: "0.1.1" })).toBe(true);
  });
  it("rejects inconsistent replay versions", () => {
    const report = { versions: { simulation: "0.1.0" }, comparison: { versions: { simulation: "0.1.1" }, candidates: [] } };
    expect(() => replayVersion(report as never)).toThrow("Inconsistent");
  });
});

it("maps completed candidate status without changing raw report", () => { expect(friendlyCandidateStatus("valid-complete")).toBe("Completed"); expect(friendlyCandidateStatus("invalid")).toBe("Rejected"); });
