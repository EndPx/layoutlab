// Declarations for the frozen 0.1.0 runtime bundle (runtime.mjs).
// Shapes are the current public types: the 0.1.0 controller/verifier are
// structurally identical at this boundary; only behavior differs.
import type {
  OperationsController,
  OperationsReport,
  OperationsReportVerification,
} from "../../src/operations.js";
import type {
  OperationsExperimentResult,
  OperationsExperimentVerification,
} from "../../src/experiments.js";
import type {
  OperationsExecutionConfig,
} from "../../src/operations.js";
import type { OperationsScenario } from "../../src/schema.js";

export declare const SIMULATION_VERSION: "0.1.0";
export declare function createOperationsController(opts: {
  scenario: OperationsScenario;
  executionConfig: unknown;
}): OperationsController;
export declare function recomputeOperationsReport(
  report: OperationsReport,
): OperationsReportVerification;
export declare function verifyOperationsExperiment(
  exported: unknown,
): OperationsExperimentVerification;
export declare function runOperationsExperiment(input: {
  scenario: OperationsScenario;
  executionConfig: OperationsExecutionConfig;
  candidates?: { candidateId: string; patch?: unknown }[];
  interventionPolicy?: unknown;
  safetyCeilingMs?: number;
}): OperationsExperimentResult;
