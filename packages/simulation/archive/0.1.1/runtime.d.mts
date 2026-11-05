// Declarations for the frozen 0.1.1 runtime bundle (runtime.mjs).
// Shapes are the current public types: the 0.1.1 controller/verifier are
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

export declare const SIMULATION_VERSION: "0.1.1";
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

import type { LayoutComparisonVerification } from '../../src/layout/compare.js';
import type { RackLayoutComparison } from '../../src/layout/rack.js';
import type { RackRotationComparison } from '../../src/layout/rack-rotation.js';
import type { AgentPlacementComparison } from '../../src/layout/agent-placement.js';
export declare function verifyLayoutComparison(report: unknown): Promise<LayoutComparisonVerification>;
export declare function verifyRackLayoutComparison(report: RackLayoutComparison): Promise<boolean>;
export declare function verifyRackRotationComparison(report: RackRotationComparison): Promise<boolean>;
export declare function verifyAgentPlacementComparison(report: AgentPlacementComparison): Promise<boolean>;

export declare const parseOperationsScenario: typeof import("../../src/index.js").parseOperationsScenario;
export declare const parseOperationsExecutionConfig: typeof import("../../src/index.js").parseOperationsExecutionConfig;
export declare const MAIN_WAREHOUSE_ATTACHMENTS: typeof import("../../src/index.js").MAIN_WAREHOUSE_ATTACHMENTS;
export declare const buildStationAttachmentMap: typeof import("../../src/index.js").buildStationAttachmentMap;
export declare const defaultApprovedConstraints: typeof import("../../src/index.js").defaultApprovedConstraints;
export declare const validateLayoutCandidate: typeof import("../../src/index.js").validateLayoutCandidate;
export declare const runLayoutComparison: typeof import("../../src/index.js").runLayoutComparison;
