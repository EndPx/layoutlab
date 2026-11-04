import { createOperationsController, operationsRunMetrics, parseOperationsExecutionConfig, recomputeOperationsReport, runOperationsToTermination, DEFAULT_OPERATIONS_SAFETY_CEILING_MS, type OperationsExecutionConfig, type OperationsReport, type OperationsTermination } from "../operations.js";
import { parseOperationsScenario, type OperationsScenario } from "../schema.js";
import { OPERATIONS_ENGINE_VERSION, OPERATIONS_SCHEMA_VERSION, SIMULATION_VERSION } from "../version.js";
import {
  applyPackingStationTranslation,
  buildStationAttachmentMap,
  diffPaths,
  type StationAttachment,
} from "./attachments.js";
import {
  LAYOUT_COMPARISON_SCHEMA,
  LAYOUT_DRAFT_VERSION,
  parseApprovedConstraints,
  parseLayoutProposal,
  type ApprovedLayoutConstraints,
} from "./contract.js";
import { canonicalStringify, contentSha256 } from "./hash.js";
import { validateLayoutCandidate, type LayoutValidation } from "./validator.js";

export type RunMetrics = {
  completionStage: string;
  shipped: number;
  backlog: number;
  stageBacklog: number;
  totalWaitMs: number;
  makespanMs: number | null;
  lastShippedAtMs: number | null;
  stopClockMs: number;
};

export type LayoutDelta = {
  shipped: number;
  backlog: number;
  stageBacklog: number;
  totalWaitMs: number;
  makespanMs: number | null;
  lastShippedAtMs: number | null;
  stopClockMs: number;
};

export type Improvement = "improved" | "worse" | "mixed" | "no-improvement" | "not-measured";
export type Measurement = "measured" | "candidate-only-repaired" | "not-measured";

// Declared decision criterion. lastShippedAtMs is a within-window timing
// observation only; a full-cohort completion time exists solely as
// makespanMs, which the engine produces only for a complete shipped cohort.
export const DECISION_CRITERION =
  "Pareto over available fields: shipped (higher better), makespanMs (lower better, complete cohorts only), lastShippedAtMs (lower better, within-window timing only, never a completion claim), totalWaitMs (lower better), backlog (lower better). Better somewhere and worse nowhere = improved; the mirror = worse; both directions = mixed; all equal = no-improvement." as const;

export type EvaluationScope = {
  runMode: "fixed-window" | "finite-cohort";
  horizonMs: number | null;
  arrivalCutoffMs: number | null;
  safetyCeilingMs: number;
  ordersInScenario: number;
  baselineStopReason: string | null;
  candidateStopReason: string | null;
  // True when a run stopped at the safety ceiling or before the fixed
  // window horizon: only part of the scenario window was evaluated.
  truncated: boolean;
  fullHorizonEvaluated: boolean;
};

export type LayoutComparisonResult = {
  schema: typeof LAYOUT_COMPARISON_SCHEMA;
  layoutDraftVersion: typeof LAYOUT_DRAFT_VERSION;
  versions: { simulation: string; operationsSchema: string; operationsEngine: string };
  proposal: unknown;
  approvedConstraints: ApprovedLayoutConstraints;
  approvedConstraintsSha256: string;
  commonInputs: { scenario: OperationsScenario; executionConfig: OperationsExecutionConfig };
  attachments: StationAttachment[];
  terminationPolicy: { safetyCeilingMs: number };
  parentIdentity: { scenarioId: string; scenarioContentSha256: string };
  candidateIdentity: { scenarioContentSha256: string } | null;
  executionConfigSha256: string;
  transform: { entityId: string; fromCentreMm: { x: number; z: number }; toCentreMm: { x: number; z: number }; deltaMm: { dx: number; dz: number } } | null;
  attachmentsBefore: StationAttachment | null;
  attachmentsAfter: StationAttachment | null;
  viewerPlacement: StationAttachment | null;
  changedFields: string[];
  candidateScenario: OperationsScenario | null;
  validation: LayoutValidation;
  baselineValid: boolean;
  candidateValid: boolean;
  measurement: Measurement;
  evaluationScope: EvaluationScope;
  decisionCriterion: typeof DECISION_CRITERION;
  explanation: string;
  baselineReport: OperationsReport | null;
  candidateReport: OperationsReport | null;
  baselineMetrics: RunMetrics | null;
  candidateMetrics: RunMetrics | null;
  baselineTermination: OperationsTermination | null;
  candidateTermination: OperationsTermination | null;
  delta: LayoutDelta | null;
  improvement: Improvement;
  assumptions: string[];
};

export function classifyImprovement(baseline: RunMetrics, candidate: RunMetrics): Improvement {
  const signs: number[] = [];
  const push = (candidateValue: number, baselineValue: number, higherIsBetter: boolean): void => {
    if (candidateValue === baselineValue) return;
    signs.push((candidateValue > baselineValue) === higherIsBetter ? 1 : -1);
  };
  push(candidate.shipped, baseline.shipped, true);
  if (baseline.makespanMs !== null && candidate.makespanMs !== null) push(candidate.makespanMs, baseline.makespanMs, false);
  if (baseline.lastShippedAtMs !== null && candidate.lastShippedAtMs !== null) push(candidate.lastShippedAtMs, baseline.lastShippedAtMs, false);
  push(candidate.totalWaitMs, baseline.totalWaitMs, false);
  push(candidate.backlog, baseline.backlog, false);
  if (signs.length === 0) return "no-improvement";
  if (signs.every((s) => s > 0)) return "improved";
  if (signs.every((s) => s < 0)) return "worse";
  return "mixed";
}

function runOne(scenario: OperationsScenario, config: OperationsExecutionConfig, ceiling: number): { report: OperationsReport; metrics: RunMetrics; termination: OperationsTermination } {
  const controller = createOperationsController({ scenario: structuredClone(scenario), executionConfig: structuredClone(config) });
  const termination = runOperationsToTermination(controller, ceiling);
  const report = controller.exportReport();
  const snapshot = controller.snapshot();
  const metrics = operationsRunMetrics(snapshot, report.completionStage);
  const fullReport: OperationsReport = {
    ...report,
    clockMs: snapshot.clockMs,
    termination,
    totalWaitMs: metrics.totalWaitMs,
    makespanMs: metrics.makespanMs,
    lastShippedAtMs: metrics.lastShippedAtMs,
  };
  return {
    report: fullReport,
    termination,
    metrics: {
      completionStage: report.completionStage,
      shipped: report.counts.shipped,
      backlog: report.counts.backlog,
      stageBacklog: report.counts.stageBacklog,
      totalWaitMs: metrics.totalWaitMs,
      makespanMs: metrics.makespanMs,
      lastShippedAtMs: metrics.lastShippedAtMs,
      stopClockMs: termination.stopClockMs,
    },
  };
}

function scopeFor(baseline: OperationsScenario, ceiling: number, baselineTerm: OperationsTermination | null, candidateTerm: OperationsTermination | null): EvaluationScope {
  const run = baseline.policies.run;
  const horizonMs = run.mode === "fixed-window" ? run.horizonMs : null;
  const truncated = [baselineTerm, candidateTerm].some((t) =>
    t !== null && (t.stopReason === "safety-ceiling" || (horizonMs !== null && t.stopClockMs < horizonMs)));
  return {
    runMode: run.mode,
    horizonMs,
    arrivalCutoffMs: run.mode === "finite-cohort" ? run.arrivalCutoffMs : null,
    safetyCeilingMs: ceiling,
    ordersInScenario: baseline.orderSchedule.length,
    baselineStopReason: baselineTerm?.stopReason ?? null,
    candidateStopReason: candidateTerm?.stopReason ?? null,
    truncated,
    fullHorizonEvaluated: !truncated,
  };
}

function explain(measurement: Measurement, scope: EvaluationScope, baseline: RunMetrics | null, candidate: RunMetrics | null, improvement: Improvement): string {
  const scopeText = scope.truncated
    ? `Evaluation is truncated: runs stopped before the full ${scope.horizonMs !== null ? `${scope.horizonMs}ms fixed-window horizon` : "cohort"} (safety ceiling ${scope.safetyCeilingMs}ms); only orders shipped inside the evaluated window are counted (${candidate?.shipped ?? 0} candidate / ${baseline?.shipped ?? 0} baseline of ${scope.ordersInScenario} scheduled), which is not a full-cohort completion.`
    : "The full declared horizon/cohort was evaluated.";
  if (measurement === "not-measured") return `No measured performance: the candidate is not valid, so no engine outcome is claimed. ${scopeText}`;
  if (measurement === "candidate-only-repaired") {
    return `The baseline is invalid and has no fabricated valid measurement; the candidate repairs the baseline errors and is shown as a candidate-only preview with no delta or improvement claim. ${scopeText}`;
  }
  return `Measured under identical exogenous inputs. Decision: ${improvement} under the declared criterion. Baseline shipped ${baseline?.shipped}, candidate shipped ${candidate?.shipped}; makespan ${baseline?.makespanMs ?? "n/a (incomplete cohort)"} -> ${candidate?.makespanMs ?? "n/a (incomplete cohort)"}; last shipped within window ${baseline?.lastShippedAtMs ?? "n/a"} -> ${candidate?.lastShippedAtMs ?? "n/a"} (timing only, not completion); total wait ${baseline?.totalWaitMs} -> ${candidate?.totalWaitMs}. ${scopeText}`;
}

export async function runLayoutComparison(input: {
  baselineScenario: unknown;
  executionConfig: unknown;
  proposal: unknown;
  attachments: StationAttachment[];
  // Approved authority from the user/server context (required).
  approvedConstraints: unknown;
  safetyCeilingMs?: number;
  implementationVersion?: string;
}): Promise<LayoutComparisonResult> {
  if (input.implementationVersion !== undefined && input.implementationVersion !== SIMULATION_VERSION) throw new Error(`Layout editing supports current implementation ${SIMULATION_VERSION} only; recorded ${input.implementationVersion} remains read-only.`);
  const baseline = parseOperationsScenario(structuredClone(input.baselineScenario));
  const executionConfig = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
  const ceiling = input.safetyCeilingMs ?? DEFAULT_OPERATIONS_SAFETY_CEILING_MS;
  if (!Number.isSafeInteger(ceiling) || ceiling < 1 || ceiling > 2_147_483_647) {
    throw new Error("safetyCeilingMs must be an integer in 1..2147483647");
  }
  const approvedParsed = parseApprovedConstraints(input.approvedConstraints);
  const attachments = buildStationAttachmentMap(baseline, input.attachments);
  const validation = await validateLayoutCandidate({
    baselineScenario: baseline,
    proposal: input.proposal,
    attachments,
    approvedConstraints: input.approvedConstraints,
    executionConfig,
  });
  const parsed = parseLayoutProposal(input.proposal);
  let bundle: ReturnType<typeof applyPackingStationTranslation> | null = null;
  if (parsed.ok && parsed.supported && attachments.has(parsed.proposal.entityId)) {
    try {
      bundle = applyPackingStationTranslation(baseline, parsed.proposal, attachments);
    } catch {
      bundle = null;
    }
  }
  const candidate = bundle?.scenario ?? null;
  const approvedConstraints: ApprovedLayoutConstraints = approvedParsed.ok
    ? approvedParsed.constraints
    : {
        allowedEntityIds: [], lockedEntityIds: [], maxMovedEntities: 0, maxTranslationMm: 0, snapGridMm: 1,
        requireSameWorkerCount: true, requireSameServiceDurations: true, requireSameWorkload: true, requireSameSeed: true,
      };
  const base = {
    schema: LAYOUT_COMPARISON_SCHEMA,
    layoutDraftVersion: LAYOUT_DRAFT_VERSION,
    versions: { simulation: SIMULATION_VERSION, operationsSchema: OPERATIONS_SCHEMA_VERSION, operationsEngine: OPERATIONS_ENGINE_VERSION },
    proposal: structuredClone(input.proposal),
    approvedConstraints: structuredClone(approvedConstraints),
    approvedConstraintsSha256: await contentSha256(approvedConstraints),
    commonInputs: { scenario: structuredClone(baseline), executionConfig: structuredClone(executionConfig) },
    attachments: structuredClone(input.attachments),
    terminationPolicy: { safetyCeilingMs: ceiling },
    parentIdentity: { scenarioId: baseline.id, scenarioContentSha256: await contentSha256(baseline) },
    executionConfigSha256: await contentSha256(executionConfig),
    decisionCriterion: DECISION_CRITERION,
    assumptions: [
      "synthetic scenario inputs are constructed test inputs, not calibrated measurements",
      "baseline and candidate share identical orders, deliveries, initial stock, seed, worker profiles/count, service durations and execution config; only the moved station's attached coordinates differ",
      "an invalid candidate returns no measured performance; worse, mixed and no-improvement candidates are retained honestly",
    ] as string[],
  } as const;
  const candidateIdentity = candidate ? { scenarioContentSha256: await contentSha256(candidate) } : null;
  const bundleFields = {
    candidateIdentity,
    transform: bundle ? structuredClone(bundle.transform) : null,
    attachmentsBefore: bundle ? structuredClone(bundle.attachmentsBefore) : null,
    attachmentsAfter: bundle ? structuredClone(bundle.attachmentsAfter) : null,
    viewerPlacement: bundle ? structuredClone(bundle.viewerPlacement) : null,
    changedFields: bundle ? [...bundle.changedFields] : [],
    candidateScenario: candidate ? structuredClone(candidate) : null,
    validation,
    baselineValid: validation.baselineValid,
    candidateValid: validation.candidateValid,
  };
  if (!validation.candidateValid || !candidate) {
    const scope = scopeFor(baseline, ceiling, null, null);
    return {
      ...base, ...bundleFields, measurement: "not-measured", evaluationScope: scope,
      explanation: explain("not-measured", scope, null, null, "not-measured"),
      baselineReport: null, candidateReport: null, baselineMetrics: null, candidateMetrics: null,
      baselineTermination: null, candidateTermination: null, delta: null, improvement: "not-measured",
    };
  }
  if (!validation.baselineValid) {
    const candidateRun = runOne(candidate, executionConfig, ceiling);
    const scope = scopeFor(baseline, ceiling, null, candidateRun.termination);
    return {
      ...base, ...bundleFields, measurement: "candidate-only-repaired", evaluationScope: scope,
      explanation: explain("candidate-only-repaired", scope, null, candidateRun.metrics, "not-measured"),
      baselineReport: null, candidateReport: candidateRun.report,
      baselineMetrics: null, candidateMetrics: candidateRun.metrics,
      baselineTermination: null, candidateTermination: candidateRun.termination,
      delta: null, improvement: "not-measured",
    };
  }
  const baselineRun = runOne(baseline, executionConfig, ceiling);
  const candidateRun = runOne(candidate, executionConfig, ceiling);
  const delta: LayoutDelta = {
    shipped: candidateRun.metrics.shipped - baselineRun.metrics.shipped,
    backlog: candidateRun.metrics.backlog - baselineRun.metrics.backlog,
    stageBacklog: candidateRun.metrics.stageBacklog - baselineRun.metrics.stageBacklog,
    totalWaitMs: candidateRun.metrics.totalWaitMs - baselineRun.metrics.totalWaitMs,
    makespanMs: baselineRun.metrics.makespanMs !== null && candidateRun.metrics.makespanMs !== null
      ? candidateRun.metrics.makespanMs - baselineRun.metrics.makespanMs : null,
    lastShippedAtMs: baselineRun.metrics.lastShippedAtMs !== null && candidateRun.metrics.lastShippedAtMs !== null
      ? candidateRun.metrics.lastShippedAtMs - baselineRun.metrics.lastShippedAtMs : null,
    stopClockMs: candidateRun.metrics.stopClockMs - baselineRun.metrics.stopClockMs,
  };
  const improvement = classifyImprovement(baselineRun.metrics, candidateRun.metrics);
  const scope = scopeFor(baseline, ceiling, baselineRun.termination, candidateRun.termination);
  return {
    ...base, ...bundleFields, measurement: "measured", evaluationScope: scope,
    explanation: explain("measured", scope, baselineRun.metrics, candidateRun.metrics, improvement),
    baselineReport: baselineRun.report, candidateReport: candidateRun.report,
    baselineMetrics: baselineRun.metrics, candidateMetrics: candidateRun.metrics,
    baselineTermination: baselineRun.termination, candidateTermination: candidateRun.termination,
    delta, improvement,
  };
}

export type LayoutComparisonVerification = {
  ok: boolean;
  mismatches: string[];
  // What the replay actually verified: a measured comparison, a
  // candidate-only repair preview, or a recorded rejection. A verified
  // rejection proves the rejection reproduces; it is not a valid layout.
  kind: "measured" | "candidate-only-repaired" | "rejection" | null;
  recomputedImprovement: Improvement | null;
  recomputedCandidateSha256: string | null;
};

const REQUIRED_FIELDS = [
  "schema", "layoutDraftVersion", "versions", "proposal", "approvedConstraints",
  "approvedConstraintsSha256", "commonInputs", "attachments", "terminationPolicy",
  "parentIdentity", "candidateIdentity", "executionConfigSha256", "transform",
  "attachmentsBefore", "attachmentsAfter", "viewerPlacement", "changedFields",
  "candidateScenario", "validation", "baselineValid", "candidateValid",
  "measurement", "evaluationScope", "decisionCriterion", "explanation",
  "baselineReport", "candidateReport", "baselineMetrics", "candidateMetrics",
  "baselineTermination", "candidateTermination", "delta", "improvement", "assumptions",
] as const;

// Offline verifier: validate the full declared envelope (schema, versions,
// approved constraints, scope, criterion), reconstruct the candidate from
// baseline + proposal + attachments under the declared approved context,
// rerun the engine, and compare every saved field. Missing or tampered
// declared fields fail; nothing is defaulted or invented.
export async function verifyLayoutComparison(exported: unknown): Promise<LayoutComparisonVerification> {
  const mismatches: string[] = [];
  const none = { kind: null, recomputedImprovement: null, recomputedCandidateSha256: null };
  if (typeof exported !== "object" || exported === null) {
    return { ok: false, mismatches: ["layout comparison export must be an object"], ...none };
  }
  const exp = exported as LayoutComparisonResult;
  for (const field of REQUIRED_FIELDS) {
    if (!(field in exp) || (exp as Record<string, unknown>)[field] === undefined) {
      mismatches.push(`missing declared field: ${field}`);
    }
  }
  if (mismatches.length > 0) return { ok: false, mismatches, ...none };
  if (exp.schema !== LAYOUT_COMPARISON_SCHEMA) {
    mismatches.push(`unsupported layout comparison schema ${String(exp.schema)} (legacy exports lack the revision-2 envelope and are not fully verifiable)`);
  }
  if (exp.layoutDraftVersion !== LAYOUT_DRAFT_VERSION) {
    mismatches.push(`layoutDraftVersion: saved ${String(exp.layoutDraftVersion)} != current ${LAYOUT_DRAFT_VERSION}`);
  }
  const wantVersions = { simulation: SIMULATION_VERSION, operationsSchema: OPERATIONS_SCHEMA_VERSION, operationsEngine: OPERATIONS_ENGINE_VERSION };
  if (canonicalStringify(exp.versions) !== canonicalStringify(wantVersions)) {
    mismatches.push(`versions: saved ${canonicalStringify(exp.versions)} != current ${canonicalStringify(wantVersions)}`);
  }
  if (exp.decisionCriterion !== DECISION_CRITERION) {
    mismatches.push("decisionCriterion: saved criterion differs from the declared criterion");
  }
  const approvedParsed = parseApprovedConstraints(exp.approvedConstraints);
  if (!approvedParsed.ok) {
    for (const iss of approvedParsed.issues) mismatches.push(`approvedConstraints: ${iss.message}`);
    return { ok: false, mismatches, ...none };
  }
  if (exp.approvedConstraintsSha256 !== (await contentSha256(exp.approvedConstraints))) {
    mismatches.push("approvedConstraintsSha256: saved hash != recomputed approved-constraints hash");
  }
  // A structurally invalid proposal is a legitimate recorded rejection:
  // it is verified by replaying the rejection exactly (below), never by
  // calling the layout valid or running a candidate simulation. Envelope,
  // approved authority and recorded-rejection tampering still fail.
  const parsedProposal = parseLayoutProposal(exp.proposal);
  const recordedRejection = !parsedProposal.ok || !parsedProposal.supported;
  if (recordedRejection && exp.measurement !== "not-measured") {
    mismatches.push("proposal is structurally invalid/unsupported but the export does not record a not-measured rejection");
  }
  let baseline: OperationsScenario;
  let executionConfig: OperationsExecutionConfig;
  try {
    baseline = parseOperationsScenario(structuredClone(exp.commonInputs?.scenario));
    executionConfig = parseOperationsExecutionConfig(structuredClone(exp.commonInputs?.executionConfig));
  } catch (error) {
    return { ok: false, mismatches: [...mismatches, `common inputs: ${error instanceof Error ? error.message : "invalid"}`], ...none };
  }
  if (exp.parentIdentity?.scenarioId !== baseline.id) {
    mismatches.push(`parentIdentity.scenarioId: saved ${String(exp.parentIdentity?.scenarioId)} != scenario ${baseline.id}`);
  }
  if (exp.parentIdentity?.scenarioContentSha256 !== (await contentSha256(baseline))) {
    mismatches.push("parentIdentity.scenarioContentSha256: saved hash != recomputed baseline content hash");
  }
  if (exp.executionConfigSha256 !== (await contentSha256(executionConfig))) {
    mismatches.push("executionConfigSha256: saved hash != recomputed execution config hash");
  }
  const ceiling = exp.terminationPolicy?.safetyCeilingMs;
  if (typeof ceiling !== "number" || !Number.isSafeInteger(ceiling) || ceiling < 1 || ceiling > 2_147_483_647) {
    return { ok: false, mismatches: [...mismatches, "terminationPolicy.safetyCeilingMs: missing or invalid; verifier does not invent it"], ...none };
  }
  // Declared-measurement consistency: no invented or missing evidence.
  if (exp.measurement === "measured" && (!exp.baselineReport || !exp.candidateReport || !exp.baselineMetrics || !exp.candidateMetrics || !exp.delta)) {
    mismatches.push("measurement is 'measured' but reports/metrics/delta are missing");
  }
  if (exp.measurement === "candidate-only-repaired" && (exp.baselineReport !== null || !exp.candidateReport || exp.delta !== null || exp.improvement !== "not-measured")) {
    mismatches.push("measurement is 'candidate-only-repaired' but baseline evidence, delta or improvement label is fabricated");
  }
  if (exp.measurement === "not-measured" && (exp.baselineReport !== null || exp.candidateReport !== null || exp.delta !== null || exp.improvement !== "not-measured")) {
    mismatches.push("measurement is 'not-measured' but reports/delta/improvement claim measured performance");
  }
  let rerun: LayoutComparisonResult;
  try {
    rerun = await runLayoutComparison({
      baselineScenario: baseline,
      executionConfig,
      proposal: structuredClone(exp.proposal),
      attachments: structuredClone(exp.attachments ?? []),
      approvedConstraints: structuredClone(exp.approvedConstraints),
      safetyCeilingMs: ceiling,
    });
  } catch (error) {
    return { ok: false, mismatches: [...mismatches, `rerun: ${error instanceof Error ? error.message : "rerun failed"}`], ...none };
  }
  const compareField = (label: string, saved: unknown, fresh: unknown): void => {
    if (canonicalStringify(saved) !== canonicalStringify(fresh)) mismatches.push(`${label}: saved value differs from recomputed value`);
  };
  compareField("versions", exp.versions, rerun.versions);
  compareField("approvedConstraints", exp.approvedConstraints, rerun.approvedConstraints);
  compareField("candidateScenario", exp.candidateScenario, rerun.candidateScenario);
  compareField("transform", exp.transform, rerun.transform);
  compareField("attachmentsBefore", exp.attachmentsBefore, rerun.attachmentsBefore);
  compareField("attachmentsAfter", exp.attachmentsAfter, rerun.attachmentsAfter);
  compareField("viewerPlacement", exp.viewerPlacement, rerun.viewerPlacement);
  compareField("changedFields", exp.changedFields, rerun.changedFields);
  compareField("validation", exp.validation, rerun.validation);
  compareField("baselineValid/candidateValid", [exp.baselineValid, exp.candidateValid], [rerun.baselineValid, rerun.candidateValid]);
  compareField("measurement", exp.measurement, rerun.measurement);
  compareField("evaluationScope", exp.evaluationScope, rerun.evaluationScope);
  compareField("explanation", exp.explanation, rerun.explanation);
  compareField("baselineReport", exp.baselineReport, rerun.baselineReport);
  compareField("candidateReport", exp.candidateReport, rerun.candidateReport);
  compareField("baselineMetrics", exp.baselineMetrics, rerun.baselineMetrics);
  compareField("candidateMetrics", exp.candidateMetrics, rerun.candidateMetrics);
  compareField("baselineTermination", exp.baselineTermination, rerun.baselineTermination);
  compareField("candidateTermination", exp.candidateTermination, rerun.candidateTermination);
  compareField("delta", exp.delta, rerun.delta);
  if (exp.improvement !== rerun.improvement) {
    mismatches.push(`improvement: saved ${String(exp.improvement)} != recomputed ${rerun.improvement}`);
  }
  if (canonicalStringify(exp.candidateIdentity) !== canonicalStringify(rerun.candidateIdentity)) {
    mismatches.push("candidateIdentity: saved candidate hash differs from reconstruction");
  }
  if (exp.candidateScenario && rerun.candidateScenario && canonicalStringify(exp.candidateScenario) !== canonicalStringify(rerun.candidateScenario)) {
    const tampered = diffPaths(rerun.candidateScenario, exp.candidateScenario).slice(0, 8);
    mismatches.push(`candidateScenario reconstruction drift at: ${tampered.join(", ")}`);
  }
  for (const [label, report] of [["baselineReport", exp.baselineReport], ["candidateReport", exp.candidateReport]] as const) {
    if (!report) continue;
    const recomputed = recomputeOperationsReport(report);
    for (const mismatch of recomputed.mismatches) mismatches.push(`${label}: ${mismatch}`);
  }
  return {
    ok: mismatches.length === 0,
    mismatches,
    kind: rerun.measurement === "measured" ? "measured" : rerun.measurement === "candidate-only-repaired" ? "candidate-only-repaired" : "rejection",
    recomputedImprovement: rerun.improvement,
    recomputedCandidateSha256: rerun.candidateIdentity?.scenarioContentSha256 ?? null,
  };
}
