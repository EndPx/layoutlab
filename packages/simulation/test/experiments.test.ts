// v3-M7 controlled experiments: same inputs, bounded patches, deterministic
// ranking, worse/incomplete outcomes preserved, invalid patches rejected.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  parseOperationsPatch,
  parseOperationsScenario,
  recomputeOperationsReport,
  runOperationsExperiment,
} from "../src/index.js";

const BURST_FIXTURE = "../../fixtures/operations/picking-packing-burst.json";
const BURST_RUNCONFIG =
  "../../fixtures/operations/picking-packing-burst.runconfig.json";

function burstExperiment() {
  const scenario = parseOperationsScenario(
    JSON.parse(readFileSync(BURST_FIXTURE, "utf8")),
  );
  const runconfig = JSON.parse(readFileSync(BURST_RUNCONFIG, "utf8"));
  return runOperationsExperiment({
    scenario,
    executionConfig: runconfig.executionConfig,
    candidates: [
      { candidateId: "baseline", patch: {} },
      { candidateId: "fast-dispatch", patch: { dispatchDurationMs: 1000 } },
      { candidateId: "slow-dispatch", patch: { dispatchDurationMs: 300000 } },
    ],
  });
}

describe("operations experiments", () => {
  test("ranks faster dispatch ahead of baseline and slow dispatch", () => {
    const result = burstExperiment();
    expect(result.schema).toBe("layoutlab.operations-experiment/1");
    expect(result.candidates).toHaveLength(3);
    for (const c of result.candidates) {
      expect(c.completionStage).toBe("SUPPORTED_STAGE_COMPLETE");
      expect(c.shipped).toBe(6);
      // Every candidate report independently recomputes.
      expect(recomputeOperationsReport(c.report).ok).toBe(true);
    }
    expect(result.rankedCandidateIds[0]).toBe("fast-dispatch");
    expect(result.rankedCandidateIds[2]).toBe("slow-dispatch");
    const fast = result.candidates.find((c) => c.candidateId === "fast-dispatch")!;
    const slow = result.candidates.find((c) => c.candidateId === "slow-dispatch")!;
    expect(fast.makespanMs).toBeLessThan(slow.makespanMs as number);
  });

  test("invalid patches are rejected before any run", () => {
    expect(() => parseOperationsPatch({ extraPickers: 9 })).toThrow();
    expect(() => parseOperationsPatch({ packingDurationMs: 5 })).toThrow();
    expect(() => parseOperationsPatch({ unknownKnob: 1 })).toThrow();
    expect(() =>
      runOperationsExperiment({
        scenario: parseOperationsScenario(
          JSON.parse(readFileSync(BURST_FIXTURE, "utf8")),
        ),
        executionConfig: JSON.parse(readFileSync(BURST_RUNCONFIG, "utf8")).executionConfig,
        candidates: [
          { candidateId: "dup", patch: {} },
          { candidateId: "dup", patch: {} },
        ],
      }),
    ).toThrow(/duplicate candidate/);
  });
});
