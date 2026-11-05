// Explicit current-source routing with immutable historical runtime registration.
import {
  createOperationsController,
  recomputeOperationsReport,
  type OperationsController,
  type OperationsCounts,
  type OperationsReport,
  type OperationsReportVerification,
} from "./operations.js";
import {
  verifyOperationsExperiment,
  type OperationsExperimentVerification,
} from "./experiments.js";
import type { OperationsScenario } from "./schema.js";
import { SIMULATION_VERSION } from "./version.js";
import * as archived010 from "../archive/0.1.0/runtime.mjs";
import * as archived011 from "../archive/0.1.1/runtime.mjs";

export interface OperationsReplayRuntime {
 createOperationsController: typeof createOperationsController;
 recomputeOperationsReport: typeof recomputeOperationsReport;
 verifyOperationsExperiment: typeof verifyOperationsExperiment;
}
export interface LayoutReplayRuntime {
 parseOperationsScenario: typeof import("./schema.js").parseOperationsScenario;
 parseOperationsExecutionConfig: typeof import("./operations.js").parseOperationsExecutionConfig;
 MAIN_WAREHOUSE_ATTACHMENTS: typeof import("./layout/attachments.js").MAIN_WAREHOUSE_ATTACHMENTS;
 buildStationAttachmentMap: typeof import("./layout/attachments.js").buildStationAttachmentMap;
 defaultApprovedConstraints: typeof import("./layout/contract.js").defaultApprovedConstraints;
 validateLayoutCandidate: typeof import("./layout/validator.js").validateLayoutCandidate;
 runLayoutComparison: typeof import("./layout/compare.js").runLayoutComparison;
 verifyLayoutComparison: typeof import("./layout/compare.js").verifyLayoutComparison;
 verifyRackLayoutComparison: typeof import("./layout/rack.js").verifyRackLayoutComparison;
 verifyRackRotationComparison: typeof import("./layout/rack-rotation.js").verifyRackRotationComparison;
 verifyAgentPlacementComparison: typeof import("./layout/agent-placement.js").verifyAgentPlacementComparison;
}
// Prepared historical entries; CURRENT still takes precedence in every public route.
export const ARCHIVED_RUNTIMES: Readonly<{ "0.1.0": OperationsReplayRuntime; "0.1.1": OperationsReplayRuntime & LayoutReplayRuntime }> = Object.freeze({
  "0.1.0": archived010,
  "0.1.1": archived011,
});

export const SUPPORTED_IMPLEMENTATION_VERSIONS = ["0.1.0", "0.1.1"] as const;
export type ImplementationVersion =
  (typeof SUPPORTED_IMPLEMENTATION_VERSIONS)[number];
export const CURRENT_IMPLEMENTATION_VERSION: ImplementationVersion =
  SIMULATION_VERSION as ImplementationVersion;
export const ARCHIVED_IMPLEMENTATION_VERSION: ImplementationVersion = "0.1.0";

export class UnsupportedImplementationVersionError extends Error {
  readonly implementationVersion: string;
  constructor(implementationVersion: string) {
    super(
      `unsupported operations implementation version ${JSON.stringify(implementationVersion)}; ` +
        `supported: ${SUPPORTED_IMPLEMENTATION_VERSIONS.join(", ")}`,
    );
    this.name = "UnsupportedImplementationVersionError";
    this.implementationVersion = implementationVersion;
  }
}

export function isSupportedImplementationVersion(
  value: unknown,
): value is ImplementationVersion {
  return (
    typeof value === "string" &&
    (SUPPORTED_IMPLEMENTATION_VERSIONS as readonly string[]).includes(value)
  );
}

function requireSupported(value: unknown): ImplementationVersion {
  if (!isSupportedImplementationVersion(value)) {
    throw new UnsupportedImplementationVersionError(
      typeof value === "string" ? value : String(value ?? ""),
    );
  }
  return value;
}

// Synchronous versioned factory for U1/L1 inspection: recorded contexts
// are inspected with their own engine, new contexts with the current one.
export function createOperationsControllerForVersion(
  opts: { scenario: OperationsScenario; executionConfig: unknown },
  implementationVersion: string,
): OperationsController {
  const version = requireSupported(implementationVersion);
  return version === CURRENT_IMPLEMENTATION_VERSION
    ? createOperationsController(opts)
    : ARCHIVED_RUNTIMES[version].createOperationsController(opts);
}

export type OperationsReportVerificationForVersion =
  OperationsReportVerification & {
    // The implementation that actually recomputed the report; null when
    // no supported implementation could be selected.
    verifierImplementationVersion: string | null;
  };

// Recompute a recorded report with its recorded implementation
// (report.versions.simulation). Absent/unsupported recordings fail as
// mismatches instead of being reinterpreted under the latest engine.
export function recomputeOperationsReportForVersion(
  report: OperationsReport,
): OperationsReportVerificationForVersion {
  const recorded =
    report && typeof report === "object"
      ? (report as OperationsReport).versions?.simulation
      : undefined;
  if (!isSupportedImplementationVersion(recorded)) {
    const counts = (report as OperationsReport | null)?.counts;
    return {
      ok: false,
      recomputedStage: "UNKNOWN",
      recomputedCounts: counts as OperationsCounts,
      recomputedClockMs: 0,
      mismatches: [
        `versions.simulation: recorded implementation ${JSON.stringify(recorded ?? null)} is absent or unsupported; ` +
          `supported: ${SUPPORTED_IMPLEMENTATION_VERSIONS.join(", ")}`,
      ],
      verifierImplementationVersion: null,
    };
  }
  const result =
    recorded === CURRENT_IMPLEMENTATION_VERSION
      ? recomputeOperationsReport(report)
      : ARCHIVED_RUNTIMES[recorded].recomputeOperationsReport(report);
  return { ...result, verifierImplementationVersion: recorded };
}

export type OperationsExperimentVerificationForVersion =
  OperationsExperimentVerification & {
    verifierImplementationVersion: string | null;
  };

// Rerun a recorded E3 comparison with its recorded implementation
// (versions.simulation of the experiment export).
export function verifyOperationsExperimentForVersion(
  exported: unknown,
): OperationsExperimentVerificationForVersion {
  const recorded =
    exported && typeof exported === "object"
      ? (exported as { versions?: { simulation?: unknown } }).versions
          ?.simulation
      : undefined;
  if (!isSupportedImplementationVersion(recorded)) {
    return {
      ok: false,
      mismatches: [
        `versions.simulation: recorded implementation ${JSON.stringify(recorded ?? null)} is absent or unsupported; ` +
          `supported: ${SUPPORTED_IMPLEMENTATION_VERSIONS.join(", ")}`,
      ],
      recomputedRankedCandidateIds: [],
      recomputedSelectedCandidateId: null,
      verifierImplementationVersion: null,
    };
  }
  const result =
    recorded === CURRENT_IMPLEMENTATION_VERSION
      ? verifyOperationsExperiment(exported)
      : ARCHIVED_RUNTIMES[recorded].verifyOperationsExperiment(exported);
  return { ...result, verifierImplementationVersion: recorded };
}
