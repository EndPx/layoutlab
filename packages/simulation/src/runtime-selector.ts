// Explicit implementation-version selector. Exactly two operations
// implementations are supported: the archived 0.1.0 runtime (immutable
// bundle in archive/0.1.0, statically imported so this stays synchronous
// and browser-compatible) and the current source implementation.
// New runs use the current implementation via createOperationsController;
// recorded reports/experiments are reexecuted with the implementation
// they record. An unsupported or absent version fails honestly here —
// nothing silently falls back to the latest engine.
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
import * as archived from "../archive/0.1.0/runtime.mjs";

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
    : archived.createOperationsController(opts);
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
      : archived.recomputeOperationsReport(report);
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
      : archived.verifyOperationsExperiment(exported);
  return { ...result, verifierImplementationVersion: recorded };
}
