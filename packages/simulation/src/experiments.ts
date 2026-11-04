// v3 controlled experiments (E3): run the SAME frozen scenario/config inputs
// under bounded candidate patches and compare engine-owned outcomes. Every
// candidate, including rejected and incomplete ones, stays in the export in
// its original order so any ranking can be recomputed offline. Nothing here
// invents traffic/picking policies or assignment optimization: the patch
// surface below is the whole intervention surface.
import { z } from "zod";
import {
  createOperationsController,
  operationsRunMetrics,
  parseOperationsExecutionConfig,
  recomputeOperationsReport,
  runOperationsToTermination,
  DEFAULT_OPERATIONS_SAFETY_CEILING_MS,
  type OperationsExecutionConfig,
  type OperationsReport,
  type OperationsTermination,
} from "./operations.js";
import {
  parseOperationsScenario,
  type OperationsScenario,
} from "./schema.js";
import {
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  SIMULATION_VERSION,
} from "./version.js";

// Bounded patch surface: the only scenario changes an experiment (or a
// model proposal) may make. Strictly validated; anything else is rejected.
export const operationsPatchSchema = z.strictObject({
  extraPickers: z.number().int().min(0).max(2).optional(),
  extraPutaway: z.number().int().min(0).max(2).optional(),
  packingDurationMs: z.number().int().min(1000).max(300000).optional(),
  dispatchDurationMs: z.number().int().min(1000).max(300000).optional(),
  receivingDurationMs: z.number().int().min(1000).max(300000).optional(),
});

export type OperationsPatch = z.infer<typeof operationsPatchSchema>;

export function parseOperationsPatch(value: unknown): OperationsPatch {
  return operationsPatchSchema.parse(value);
}

export function applyOperationsPatch(
  scenario: OperationsScenario,
  patch: OperationsPatch,
): OperationsScenario {
  const valid = parseOperationsPatch(patch);
  const next = structuredClone(scenario) as OperationsScenario;
  const cloneUnit = (role: "picker" | "putaway", n: number): void => {
    const template = next.mobileUnits.find((u) => u.role === role);
    if (!template) {
      throw new Error(`patch adds ${role} units but the scenario has no ${role} template`);
    }
    for (let i = 1; i <= n; i++) {
      const id = `${template.id}-X${i}`;
      if (next.mobileUnits.some((u) => u.id === id)) continue;
      // Park clones on the template parking slot offset along +x by whole
      // envelope widths so initial clearance stays satisfiable in open
      // fixtures; transport admission still verifies every position.
      const offset = (template.footprintMm.width + template.footprintMm.margin * 2) * i;
      next.mobileUnits.push({
        ...structuredClone(template),
        id,
        parkingSlotMm: { x: template.parkingSlotMm.x + offset, z: template.parkingSlotMm.z },
      });
    }
  };
  if (valid.extraPickers) cloneUnit("picker", valid.extraPickers);
  if (valid.extraPutaway) cloneUnit("putaway", valid.extraPutaway);
  for (const r of next.resources) {
    if (r.kind === "packing" && valid.packingDurationMs !== undefined) {
      r.serviceDurationMs = valid.packingDurationMs;
    }
    if (r.kind === "dispatch" && valid.dispatchDurationMs !== undefined) {
      r.serviceDurationMs = valid.dispatchDurationMs;
    }
    if (r.kind === "receiving" && valid.receivingDurationMs !== undefined) {
      r.serviceDurationMs = valid.receivingDurationMs;
    }
  }
  return parseOperationsScenario(next);
}

// --- Explicit intervention policy -------------------------------------------
// Free text is never authority: the caller lists the exact patch fields a
// comparison may touch, with optional tighter ranges. An absent policy
// allows the baseline (no changes) only, never implicitly everything.
export const INTERVENTION_FIELDS = [
  "extraPickers",
  "extraPutaway",
  "packingDurationMs",
  "dispatchDurationMs",
  "receivingDurationMs",
] as const;
export type InterventionField = (typeof INTERVENTION_FIELDS)[number];

const PATCH_BOUNDS: Record<InterventionField, { min: number; max: number }> = {
  extraPickers: { min: 0, max: 2 },
  extraPutaway: { min: 0, max: 2 },
  packingDurationMs: { min: 1000, max: 300000 },
  dispatchDurationMs: { min: 1000, max: 300000 },
  receivingDurationMs: { min: 1000, max: 300000 },
};

const rangeSchema = z.strictObject({
  min: z.number().int(),
  max: z.number().int(),
});

export const interventionPolicySchema = z
  .strictObject({
    allowedFields: z.array(z.enum(INTERVENTION_FIELDS)).max(5),
    ranges: z
      .strictObject({
        extraPickers: rangeSchema.optional(),
        extraPutaway: rangeSchema.optional(),
        packingDurationMs: rangeSchema.optional(),
        dispatchDurationMs: rangeSchema.optional(),
        receivingDurationMs: rangeSchema.optional(),
      })
      .optional(),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    for (const f of p.allowedFields) {
      if (seen.has(f)) ctx.addIssue({ code: "custom", message: `duplicate allowed field: ${f}` });
      seen.add(f);
    }
    for (const [field, range] of Object.entries(p.ranges ?? {})) {
      if (!range) continue;
      if (!p.allowedFields.includes(field as InterventionField)) {
        ctx.addIssue({ code: "custom", message: `range given for field that is not allowed: ${field}` });
      }
      const bounds = PATCH_BOUNDS[field as InterventionField];
      if (range.min > range.max || range.min < bounds.min || range.max > bounds.max) {
        ctx.addIssue({
          code: "custom",
          message: `range for ${field} must satisfy ${bounds.min} <= min <= max <= ${bounds.max}`,
        });
      }
    }
  });

export type InterventionPolicy = {
  allowedFields: InterventionField[];
  ranges?: Partial<Record<InterventionField, { min: number; max: number }>>;
};

export function parseInterventionPolicy(value: unknown): InterventionPolicy {
  return interventionPolicySchema.parse(value) as InterventionPolicy;
}

const STAFFING_FIELDS: InterventionField[] = ["extraPickers", "extraPutaway"];

function isNoChangePatch(patch: OperationsPatch): boolean {
  return INTERVENTION_FIELDS.every((f) => {
    const v = patch[f];
    return v === undefined || (STAFFING_FIELDS.includes(f) && v === 0);
  });
}

function policyViolation(patch: OperationsPatch, policy: InterventionPolicy): string | null {
  for (const f of INTERVENTION_FIELDS) {
    const v = patch[f];
    if (v === undefined) continue;
    if (STAFFING_FIELDS.includes(f) && v === 0) continue; // explicit zero adds nobody
    if (!policy.allowedFields.includes(f)) {
      return STAFFING_FIELDS.includes(f)
        ? `patch field ${f}=${v} adds workers but staffing is not allowed by the intervention policy (allowed: ${policy.allowedFields.join(", ") || "none"})`
        : `patch field ${f} is not allowed by the intervention policy (allowed: ${policy.allowedFields.join(", ") || "none"})`;
    }
    const range = policy.ranges?.[f];
    if (range && (v < range.min || v > range.max)) {
      return `patch field ${f}=${v} is outside the policy range ${range.min}..${range.max}`;
    }
  }
  return null;
}

// --- Experiment result -------------------------------------------------------

export type ExperimentCandidateStatus =
  | "valid-complete"
  | "valid-incomplete"
  | "checks-failed"
  | "invalid"
  | "error";

export type ExperimentCandidateResult = {
  candidateId: string;
  isBaseline: boolean;
  requestedPatch: unknown;
  patch: OperationsPatch | null;
  status: ExperimentCandidateStatus;
  reasonCode: string | null;
  reason: string | null;
  completionStage: string | null;
  shipped: number | null;
  backlog: number | null;
  stageBacklog: number | null;
  makespanMs: number | null;
  lastShippedAtMs: number | null;
  totalWaitMs: number | null;
  stopClockMs: number | null;
  termination: OperationsTermination | null;
  report: OperationsReport | null;
};

export type OperationsExperimentResult = {
  schema: "layoutlab.operations-experiment/2";
  scenarioId: string;
  seed: string;
  versions: {
    simulation: string;
    operationsSchema: string;
    operationsEngine: string;
    evaluator: string;
  };
  commonInputs: { scenario: OperationsScenario; executionConfig: OperationsExecutionConfig };
  interventionPolicy: InterventionPolicy;
  terminationPolicy: { safetyCeilingMs: number };
  baselineCandidateId: string;
  candidates: ExperimentCandidateResult[];
  rankedCandidateIds: string[];
  selectedCandidateId: string | null;
  assumptions: string[];
};

export const OPERATIONS_EXPERIMENT_SCHEMA = "layoutlab.operations-experiment/2" as const;
export { DEFAULT_OPERATIONS_SAFETY_CEILING_MS };

function invalidCandidate(
  candidateId: string,
  isBaseline: boolean,
  requestedPatch: unknown,
  patch: OperationsPatch | null,
  reasonCode: string,
  reason: string,
): ExperimentCandidateResult {
  return {
    candidateId,
    isBaseline,
    requestedPatch: structuredClone(requestedPatch),
    patch: patch ? { ...patch } : null,
    status: "invalid",
    reasonCode,
    reason,
    completionStage: null,
    shipped: null,
    backlog: null,
    stageBacklog: null,
    makespanMs: null,
    lastShippedAtMs: null,
    totalWaitMs: null,
    stopClockMs: null,
    termination: null,
    report: null,
  };
}

// Deterministic ranking over valid candidates only: completed runs first
// (more shipped, then lower makespan, then lower total wait), incomplete
// runs after (more shipped, then lower backlog). Invalid/error candidates
// are never ranked, so they can never outrank the valid baseline.
function rankCandidates(candidates: ExperimentCandidateResult[]): string[] {
  const valid = candidates.filter((c) => c.status === "valid-complete" || c.status === "valid-incomplete");
  return [...valid]
    .sort((a, b) => {
      const ac = a.status === "valid-complete";
      const bc = b.status === "valid-complete";
      if (ac !== bc) return ac ? -1 : 1;
      if (a.shipped !== b.shipped) return (b.shipped ?? 0) - (a.shipped ?? 0);
      if (ac && bc) {
        const am = a.makespanMs ?? Number.POSITIVE_INFINITY;
        const bm = b.makespanMs ?? Number.POSITIVE_INFINITY;
        if (am !== bm) return am - bm;
        if (a.totalWaitMs !== b.totalWaitMs) return (a.totalWaitMs ?? 0) - (b.totalWaitMs ?? 0);
      }
      if (a.backlog !== b.backlog) return (a.backlog ?? 0) - (b.backlog ?? 0);
      return a.candidateId < b.candidateId ? -1 : 1;
    })
    .map((c) => c.candidateId);
}

export function runOperationsExperiment(input: {
  scenario: OperationsScenario;
  executionConfig: OperationsExecutionConfig;
  candidates?: { candidateId: string; patch?: unknown }[];
  interventionPolicy?: unknown;
  safetyCeilingMs?: number;
  terminationPolicy?: { safetyCeilingMs?: number };
}): OperationsExperimentResult {
  if (!input || typeof input !== "object") throw new Error("experiment input must be an object");
  // Freeze common inputs up front: caller objects are cloned and re-parsed,
  // never mutated, and every candidate derives from these same inputs.
  const scenario = parseOperationsScenario(structuredClone(input.scenario));
  const executionConfig = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
  const policy: InterventionPolicy =
    input.interventionPolicy === undefined
      ? { allowedFields: [] }
      : parseInterventionPolicy(structuredClone(input.interventionPolicy));
  const safetyCeilingMs =
    input.safetyCeilingMs ?? input.terminationPolicy?.safetyCeilingMs ?? DEFAULT_OPERATIONS_SAFETY_CEILING_MS;
  if (!Number.isSafeInteger(safetyCeilingMs) || safetyCeilingMs < 1 || safetyCeilingMs > 2_147_483_647) {
    throw new Error("safetyCeilingMs must be an integer in 1..2147483647");
  }
  const rawCandidates = input.candidates ?? [];
  if (!Array.isArray(rawCandidates)) throw new Error("candidates must be an array");
  if (rawCandidates.length > 8) {
    throw new Error("experiment allows at most 8 total candidates including baseline");
  }
  const seen = new Set<string>();
  for (const c of rawCandidates) {
    if (!c || typeof c !== "object" || typeof c.candidateId !== "string" || c.candidateId.length === 0 || c.candidateId.length > 128) {
      throw new Error("each candidate needs a candidateId of 1..128 characters");
    }
    if (seen.has(c.candidateId)) throw new Error(`duplicate candidate id ${c.candidateId}`);
    seen.add(c.candidateId);
  }
  // Baseline: the first parseable no-change candidate, evaluated once. Any
  // other no-change candidate is a retained duplicate, not a second run.
  const parsedRaw = rawCandidates.map((c) => {
    try {
      return { ok: true as const, patch: parseOperationsPatch(c.patch ?? {}) };
    } catch {
      return { ok: false as const, patch: null };
    }
  });
  const baselineIdx = parsedRaw.findIndex((p) => p.ok && isNoChangePatch(p.patch as OperationsPatch));
  if (seen.has("baseline")) {
    const reserved = rawCandidates.findIndex((c) => c.candidateId === "baseline");
    if (reserved !== baselineIdx) {
      throw new Error("candidateId baseline is reserved for the empty-patch baseline");
    }
  }
  type Ordered = { candidateId: string; requestedPatch: unknown; auto: boolean };
  let ordered: Ordered[];
  let baselineCandidateId: string;
  if (baselineIdx >= 0) {
    ordered = rawCandidates.map((c) => ({ candidateId: c.candidateId, requestedPatch: c.patch ?? {}, auto: false }));
    baselineCandidateId = (rawCandidates[baselineIdx] as { candidateId: string }).candidateId;
  } else {
    if (rawCandidates.length >= 8) {
      throw new Error("experiment allows at most 8 total candidates including baseline; add an empty-patch baseline or drop a candidate");
    }
    ordered = [
      { candidateId: "baseline", requestedPatch: {}, auto: true },
      ...rawCandidates.map((c) => ({ candidateId: c.candidateId, requestedPatch: c.patch ?? {}, auto: false })),
    ];
    baselineCandidateId = "baseline";
  }

  const candidates: ExperimentCandidateResult[] = [];
  let baselineSeen = false;
  for (const entry of ordered) {
    const isBaseline = entry.candidateId === baselineCandidateId;
    let patch: OperationsPatch;
    try {
      patch = parseOperationsPatch(structuredClone(entry.requestedPatch ?? {}));
    } catch (e) {
      candidates.push(invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, null, "INVALID_PATCH",
        `invalid patch: ${e instanceof Error ? e.message : "patch failed validation"}`));
      continue;
    }
    if (isNoChangePatch(patch)) {
      if (baselineSeen) {
        candidates.push(invalidCandidate(entry.candidateId, false, entry.requestedPatch, patch, "DUPLICATE_BASELINE",
          `duplicate baseline: no-change patch already evaluated once as ${baselineCandidateId}`));
        continue;
      }
      baselineSeen = true;
    }
    const violation = policyViolation(patch, policy);
    if (violation) {
      candidates.push(invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, patch, "POLICY_VIOLATION", violation));
      continue;
    }
    let patched: OperationsScenario;
    try {
      patched = applyOperationsPatch(scenario, patch);
    } catch (e) {
      candidates.push(invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, patch, "PATCHED_SCENARIO_INVALID",
        `patched scenario invalid: ${e instanceof Error ? e.message : "patch produced an invalid scenario"}`));
      continue;
    }
    let controller;
    try {
      controller = createOperationsController({ scenario: patched, executionConfig });
    } catch (e) {
      candidates.push(invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, patch, "PATCHED_SCENARIO_INFEASIBLE",
        `patched scenario infeasible: ${e instanceof Error ? e.message : "controller rejected the patched scenario"}`));
      continue;
    }
    try {
      const termination = runOperationsToTermination(controller, safetyCeilingMs);
      const report = controller.exportReport();
      const snap = controller.snapshot();
      const metrics = operationsRunMetrics(snap, report.completionStage);
      const complete = report.completionStage === "SUPPORTED_STAGE_COMPLETE";
      // Invariant evidence gates the label: a run with nonempty conservation,
      // capacity or safety check failures is never called valid, even at a
      // terminal stage. Its report and metrics stay attached as evidence.
      const failedChecks = (["conservation", "capacity", "safety"] as const)
        .filter((k) => report.checks[k].length > 0)
        .map((k) => `${k}: ${report.checks[k].join("; ")}`);
      const checksFailed = failedChecks.length > 0;
      candidates.push({
        candidateId: entry.candidateId,
        isBaseline,
        requestedPatch: structuredClone(entry.requestedPatch),
        patch: { ...patch },
        status: checksFailed ? "checks-failed" : complete ? "valid-complete" : "valid-incomplete",
        reasonCode: checksFailed ? "CHECKS_FAILED" : complete ? null : "RUN_INCOMPLETE",
        reason: checksFailed
          ? `invariant checks failed (${failedChecks.join(" | ")}); run is not valid, report preserved as evidence`
          : complete ? null : `run stopped ${termination.stopReason} at ${termination.stopClockMs}ms with stage ${report.completionStage}; backlog retained, no makespan claimed`,
        completionStage: report.completionStage,
        shipped: report.counts.shipped,
        backlog: report.counts.backlog,
        stageBacklog: report.counts.stageBacklog,
        makespanMs: metrics.makespanMs,
        lastShippedAtMs: metrics.lastShippedAtMs,
        totalWaitMs: metrics.totalWaitMs,
        stopClockMs: termination.stopClockMs,
        termination,
        report,
      });
    } catch (e) {
      candidates.push({
        ...invalidCandidate(entry.candidateId, isBaseline, entry.requestedPatch, patch, "RUN_ERROR",
          `run error: ${e instanceof Error ? e.message : "engine run failed"}`),
        status: "error",
      });
    }
  }
  const rankedCandidateIds = rankCandidates(candidates);
  return {
    schema: OPERATIONS_EXPERIMENT_SCHEMA,
    scenarioId: scenario.id,
    seed: scenario.seed,
    versions: {
      simulation: SIMULATION_VERSION,
      operationsSchema: OPERATIONS_SCHEMA_VERSION,
      operationsEngine: OPERATIONS_ENGINE_VERSION,
      evaluator: OPERATIONS_EXPERIMENT_SCHEMA,
    },
    commonInputs: { scenario: structuredClone(scenario), executionConfig: { ...executionConfig } },
    interventionPolicy: structuredClone(policy),
    terminationPolicy: { safetyCeilingMs },
    baselineCandidateId,
    candidates,
    rankedCandidateIds,
    selectedCandidateId: rankedCandidateIds[0] ?? null,
    assumptions: [
      "synthetic scenario: all workload, geometry and service values are constructed test inputs, not calibrated measurements",
      "service-duration patch values are synthetic service assumptions, not measured money or time savings",
      "only the listed intervention fields may differ between candidates; orders, deliveries, initial inventory, seed, geometry, navigation and execution config stay frozen",
      "offline recomputation proves saved values follow from the embedded inputs, not who produced the file",
    ],
  };
}

// --- Offline comparison verification -----------------------------------------

export type OperationsExperimentVerification = {
  ok: boolean;
  mismatches: string[];
  recomputedRankedCandidateIds: string[];
  recomputedSelectedCandidateId: string | null;
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

// Rerun every candidate from common inputs + patch + policy and compare all
// saved metrics, reports and ranking. Tampered common inputs, policy
// violations, missing candidates/orders, timestamps, waits, makespans,
// counts and versions all surface as mismatches.
export function verifyOperationsExperiment(exported: unknown): OperationsExperimentVerification {
  const mismatches: string[] = [];
  const none = { recomputedRankedCandidateIds: [] as string[], recomputedSelectedCandidateId: null };
  if (!exported || typeof exported !== "object") {
    return { ok: false, mismatches: ["experiment export must be an object"], ...none };
  }
  const exp = exported as OperationsExperimentResult;
  if (exp.schema === ("layoutlab.operations-experiment/1" as string)) {
    return { ok: false, mismatches: ["legacy experiment schema layoutlab.operations-experiment/1 lacks policy/common-input evidence; not fully verifiable"], ...none };
  }
  if (exp.schema !== OPERATIONS_EXPERIMENT_SCHEMA) {
    return { ok: false, mismatches: [`unsupported experiment schema ${String(exp.schema)}`], ...none };
  }
  let scenario: OperationsScenario;
  let executionConfig: OperationsExecutionConfig;
  let policy: InterventionPolicy;
  try {
    scenario = parseOperationsScenario(structuredClone(exp.commonInputs?.scenario));
    executionConfig = parseOperationsExecutionConfig(structuredClone(exp.commonInputs?.executionConfig));
    policy = parseInterventionPolicy(structuredClone(exp.interventionPolicy));
  } catch (e) {
    return { ok: false, mismatches: [`common inputs/policy: ${e instanceof Error ? e.message : "invalid"}`], ...none };
  }
  if (exp.scenarioId !== scenario.id) mismatches.push(`scenarioId: saved ${String(exp.scenarioId)} != common scenario ${scenario.id}`);
  if (exp.seed !== scenario.seed) mismatches.push(`seed: saved ${String(exp.seed)} != common scenario ${scenario.seed}`);
  const wantVersions = {
    simulation: SIMULATION_VERSION,
    operationsSchema: OPERATIONS_SCHEMA_VERSION,
    operationsEngine: OPERATIONS_ENGINE_VERSION,
    evaluator: OPERATIONS_EXPERIMENT_SCHEMA,
  };
  for (const k of Object.keys(wantVersions) as (keyof typeof wantVersions)[]) {
    if (exp.versions?.[k] !== wantVersions[k]) {
      mismatches.push(`versions.${k}: saved ${String(exp.versions?.[k])} != current ${wantVersions[k]}`);
    }
  }
  // Declared termination metadata is required evidence: a missing or
  // malformed ceiling is rejected here, never silently defaulted.
  const declaredCeiling = (exp.terminationPolicy as { safetyCeilingMs?: unknown } | undefined)?.safetyCeilingMs;
  if (
    !exp.terminationPolicy || typeof exp.terminationPolicy !== "object" ||
    typeof declaredCeiling !== "number" || !Number.isSafeInteger(declaredCeiling) ||
    declaredCeiling < 1 || declaredCeiling > 2_147_483_647
  ) {
    return { ok: false, mismatches: [...mismatches, "terminationPolicy.safetyCeilingMs: missing or invalid declared termination metadata; verifier does not invent it"], ...none };
  }
  if (!Array.isArray(exp.candidates) || exp.candidates.length === 0) {
    return { ok: false, mismatches: [...mismatches, "candidates: missing or empty"], ...none };
  }
  const savedIds = exp.candidates.map((c) => c.candidateId);
  if (new Set(savedIds).size !== savedIds.length) mismatches.push("candidates: duplicate candidate ids in saved export");
  let rerun: OperationsExperimentResult;
  try {
    rerun = runOperationsExperiment({
      scenario,
      executionConfig,
      interventionPolicy: policy,
      safetyCeilingMs: declaredCeiling,
      candidates: exp.candidates.map((c) => ({ candidateId: c.candidateId, patch: structuredClone(c.requestedPatch ?? {}) })),
    });
  } catch (e) {
    return { ok: false, mismatches: [...mismatches, `rerun: ${e instanceof Error ? e.message : "rerun failed"}`], ...none };
  }
  const freshById = new Map(rerun.candidates.map((c) => [c.candidateId, c]));
  if (canonical(savedIds) !== canonical(rerun.candidates.map((c) => c.candidateId))) {
    mismatches.push(`candidates: saved order/ids [${savedIds.join(",")}] != recomputed [${rerun.candidates.map((c) => c.candidateId).join(",")}] (missing or extra candidates)`);
  }
  for (const saved of exp.candidates) {
    const fresh = freshById.get(saved.candidateId);
    if (!fresh) { mismatches.push(`candidate ${saved.candidateId}: missing on recomputation`); continue; }
    if (saved.patch) {
      const violation = policyViolation(saved.patch, policy);
      if (violation && (saved.status === "valid-complete" || saved.status === "valid-incomplete")) {
        mismatches.push(`candidate ${saved.candidateId}: saved as valid but violates policy: ${violation}`);
      }
    }
    // Candidate-level termination must be present and agree with the
    // comparison ceiling; reasons are deterministic evidence and are
    // compared exactly (code and text), so fabricated prose fails.
    if (saved.status === "valid-complete" || saved.status === "valid-incomplete" || saved.status === "checks-failed") {
      if (!saved.termination || typeof saved.termination !== "object") {
        mismatches.push(`candidate ${saved.candidateId}.termination: missing declared termination`);
      } else {
        if (saved.termination.safetyCeilingMs !== declaredCeiling) {
          mismatches.push(`candidate ${saved.candidateId}.termination.safetyCeilingMs: saved ${String(saved.termination.safetyCeilingMs)} != comparison ceiling ${declaredCeiling}`);
        }
        if (saved.termination.stopClockMs !== saved.stopClockMs) {
          mismatches.push(`candidate ${saved.candidateId}.termination.stopClockMs: saved ${String(saved.termination.stopClockMs)} != candidate stopClockMs ${String(saved.stopClockMs)}`);
        }
        if (typeof saved.termination.stopReason !== "string" || saved.termination.stopReason.length === 0) {
          mismatches.push(`candidate ${saved.candidateId}.termination.stopReason: missing declared stop reason`);
        }
      }
    }
    const fields: (keyof ExperimentCandidateResult)[] = [
      "isBaseline", "patch", "status", "reasonCode", "reason", "completionStage", "shipped", "backlog", "stageBacklog",
      "makespanMs", "lastShippedAtMs", "totalWaitMs", "stopClockMs", "termination",
    ];
    for (const f of fields) {
      if (canonical(saved[f]) !== canonical(fresh[f])) {
        mismatches.push(`candidate ${saved.candidateId}.${f}: saved ${canonical(saved[f])} != recomputed ${canonical(fresh[f])}`);
      }
    }
    if (canonical(saved.report) !== canonical(fresh.report)) {
      mismatches.push(`candidate ${saved.candidateId}.report: saved report differs from recomputed report (counts/timestamps/checks/clock/metrics)`);
    }
    if (saved.report && fresh.patch) {
      try {
        const reconstructed = applyOperationsPatch(scenario, fresh.patch);
        if (canonical(saved.report.scenario) !== canonical(reconstructed)) {
          mismatches.push(`candidate ${saved.candidateId}: saved per-run scenario differs from common inputs + patch (tampered common or per-run inputs)`);
        }
      } catch { /* invalid candidates already compared by status */ }
      const rep = recomputeOperationsReport(saved.report);
      for (const m of rep.mismatches) mismatches.push(`candidate ${saved.candidateId}.report: ${m}`);
    }
  }
  if (canonical(exp.rankedCandidateIds) !== canonical(rerun.rankedCandidateIds)) {
    mismatches.push(`rankedCandidateIds: saved ${canonical(exp.rankedCandidateIds)} != recomputed ${canonical(rerun.rankedCandidateIds)}`);
  }
  if (exp.selectedCandidateId !== rerun.selectedCandidateId) {
    mismatches.push(`selectedCandidateId: saved ${String(exp.selectedCandidateId)} != recomputed ${String(rerun.selectedCandidateId)}`);
  }
  if (exp.baselineCandidateId !== rerun.baselineCandidateId) {
    mismatches.push(`baselineCandidateId: saved ${String(exp.baselineCandidateId)} != recomputed ${String(rerun.baselineCandidateId)}`);
  }
  return {
    ok: mismatches.length === 0,
    mismatches,
    recomputedRankedCandidateIds: rerun.rankedCandidateIds,
    recomputedSelectedCandidateId: rerun.selectedCandidateId,
  };
}
