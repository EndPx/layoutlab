// M3 run orchestration: server-owned immutable baselines, strict budgets,
// approval pause, bounded proposal loop with measured feedback. Pure
// orchestration over @layoutlab/core; transport is injectable for tests.
//
// Interpretation runs async after POST /runs returns the run ID promptly, so
// the first inference is cancellable via POST /runs/:id/cancel. Approval
// continues the SAME run (ID, request count, deadline preserved).
import {
  applyProposal,
  CORE_VERSION,
  createReport,
  evaluateBaseline,
  evaluateCandidate,
  freezeScenario,
  HEURISTIC_NAME,
  methodLabelFor,
  parseProposal,
  parseRequirements,
  parseScenario,
  REPORT_VERSION,
  ROUTE_POLICY_ID,
  runHeuristic,
  validateScene,
  type Assignment,
  type CandidateResult,
  type HeuristicResult,
  type MethodLabel,
  type PlanningRequirements,
  type Scenario,
} from "@layoutlab/core";
import { API_VERSION, sanitizeMessage, type ApiConfig, type ProviderKind } from "./config.js";
import {
  buildProposalUserContent,
  buildScenarioSummary,
  INTERPRET_INSTRUCTION,
  PROPOSAL_INSTRUCTION,
  PROMPT_VERSION,
  proposalJsonSchema,
  requirementsJsonSchema,
  type BaselineChange,
  type ProposalFeedback,
} from "./prompts.js";
import { chatCompletionJson, type FetchLike, type ProviderUsage } from "./provider.js";

export type RunState =
  | "INTERPRETING"
  | "AWAITING_APPROVAL"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

// Brief section 22 execution phases. The heuristic runs after the baseline
// and before the first model proposal (M4).
export type RunPhase =
  | "VALIDATING_INPUT"
  | "INTERPRETING"
  | "AWAITING_APPROVAL"
  | "EVALUATING_BASELINE"
  | "RUNNING_HEURISTIC"
  | "REQUESTING_PROPOSAL"
  | "VALIDATING_PROPOSAL"
  | "EVALUATING_PROPOSAL"
  | "FINALIZING";

// Browser rack asset provenance (single-sourced in the manifest; an API test
// locks these values to assets/manifests/rack_large_empty_a01.manifest.json
// and the tracked GLB bytes).
export const RACK_ASSET = {
  assetId: "rack_large_empty_a01",
  glbRef: "/assets/rack_large_empty_a01.glb",
  glbSha256: "571cc601bbbf8759977e05c5104a1d9381a682d2537942a238c68ebf8f8ae9ea",
  manifestRef: "assets/manifests/rack_large_empty_a01.manifest.json",
  license: "CC-BY-4.0",
} as const;

export type AssetRef = {
  rackId: string;
  kind: "simready-glb";
  ref: string;
  sha256: string;
  note: string;
};

export type HeuristicSummary = {
  name: typeof HEURISTIC_NAME;
  method: string;
  sceneOk: boolean;
  retainedBaseline: boolean;
  rankingExhausted: boolean;
  evaluationsUsed: number;
  evaluationsBudget: number;
  reason: string;
  candidate: CandidateResult | null;
};

export type CandidateBudgets = {
  heuristic: { evaluationsUsed: number; evaluationsBudget: number };
  model: { proposalsUsed: number; maxProposals: number; requestsUsed: number; maxRequests: number };
};

export type ProposalAttempt = {
  name: string;
  rationale: string;
  parseOk: boolean;
  parseError: string | null;
  applyOk: boolean;
  applyErrors: string[];
  candidate: CandidateResult | null;
  usage: ProviderUsage | null;
  durationMs: number;
  requestIndex: number;
  transportError: string | null;
};

export type RunRecord = {
  id: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  state: RunState;
  phase: RunPhase;
  phaseHistory: { phase: RunPhase; at: string }[];
  scenario: Scenario;
  requestText: string;
  requirementsDraft: PlanningRequirements | null;
  interpretedUnresolved: string[];
  interpretError: string | null;
  requirements: PlanningRequirements | null;
  baselinePreview: CandidateResult | null;
  baseline: CandidateResult | null;
  heuristic: HeuristicResult | null;
  attempts: ProposalAttempt[];
  modelRequestsUsed: number;
  proposalsUsed: number;
  bestName: string | null;
  outcome: string | null;
  lastError: string | null;
  usageTotals: ProviderUsage | null;
  usageIncomplete: boolean;
  durationsMs: number[];
  provider: "meta";
  modelId: string;
  promptVersion: string;
  controller: AbortController;
  deadlineTimer: ReturnType<typeof setTimeout> | null;
};

export type RunSummary = {
  runId: string;
  state: RunState;
  phase: RunPhase;
  phaseHistory: { phase: RunPhase; at: string }[];
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  modelRequestsUsed: number;
  proposalsUsed: number;
  budgets: { maxProposals: number; maxRequests: number; timeoutMs: number };
  requirementsDraft: PlanningRequirements | null;
  interpretedUnresolved: string[];
  interpretError: string | null;
  requirements: PlanningRequirements | null;
  baseline: CandidateResult | null;
  heuristic: HeuristicSummary | null;
  methodLabels: Record<string, MethodLabel>;
  candidateBudgets: CandidateBudgets;
  attempts: ProposalAttempt[];
  bestName: string | null;
  outcome: string | null;
  lastError: string | null;
  usageTotals: ProviderUsage | null;
  usageIncomplete: boolean;
  provider: "meta";
  providerKind: ProviderKind;
  realMetaRequests: number;
  modelId: string;
  promptVersion: string;
};

export type M3ReportEnvelope = {
  envelopeVersion: "layoutlab.m3report/1";
  runId: string;
  exportedAt: string;
  appVersion: string;
  apiVersion: string;
  coreVersion: string;
  reportVersion: string;
  routePolicy: string;
  provider: "meta";
  providerKind: ProviderKind;
  realMetaRequests: number;
  modelId: string;
  promptVersion: string;
  state: RunState;
  phase: RunPhase;
  outcome: string | null;
  modelRequestsUsed: number;
  proposalsUsed: number;
  budgets: { maxProposals: number; maxRequests: number; timeoutMs: number };
  usageTotals: ProviderUsage | null;
  usageIncomplete: boolean;
  scenario: Scenario;
  requirements: PlanningRequirements;
  interpretedUnresolved: string[];
  baseline: CandidateResult;
  candidates: CandidateResult[];
  heuristic: HeuristicSummary | null;
  methodLabels: Record<string, MethodLabel>;
  candidateBudgets: CandidateBudgets;
  assetRefs: AssetRef[];
  attempts: ProposalAttempt[];
  feedback: ProposalFeedback[];
  bestName: string | null;
  improvementPercents: Record<string, number | null>;
  timingsMs: { createdAt: string; completedAt: string | null; durationsMs: number[] };
  limitations: string[];
};

export const M3_LIMITATIONS = [
  "Conservative 2D clearance model: not a safety certification or complete maneuverability assessment.",
  "Nearest-neighbor routing is deterministic but not globally optimal.",
  "Bounding-box fit does not prove real-world packability, rack load safety, or handling suitability.",
  "Travel reduction is not converted to labor, monetary, or throughput improvement.",
  "Demand heuristic runs before model proposals with its own candidate-evaluation budget; budgets differ across methods (no equal-compute claim).",
  "Rack meshes are SimReady GLB (CC-BY-4.0, see asset manifest); markers and route remain DEVELOPMENT PROXIES.",
] as const;

function newRunId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `run-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function terminal(state: RunState): boolean {
  return state === "COMPLETED" || state === "FAILED" || state === "CANCELLED" || state === "TIMED_OUT";
}

function setPhase(record: RunRecord, phase: RunPhase): void {
  record.phase = phase;
  record.phaseHistory.push({ phase, at: new Date().toISOString() });
  // Defense cap; real runs record fewer than 16 transitions.
  if (record.phaseHistory.length > 32) record.phaseHistory.splice(0, record.phaseHistory.length - 32);
}

type BestSoFar = {
  name: string;
  weightedTravelMm: number;
  relocationCount: number;
  assignmentKey: string;
  changes: BaselineChange[] | null;
};

// Baseline-relative changes of a mapping (sorted by productId), so feedback
// shows actual placements. Null without a baseline mapping to diff against.
function relativeChanges(
  baselineMapping: Assignment[] | undefined,
  mapping: Assignment[] | undefined,
): BaselineChange[] | null {
  if (!baselineMapping || !mapping) return null;
  const base = new Map(baselineMapping.map((a) => [a.productId, a.locationId]));
  return mapping
    .filter((a) => base.get(a.productId) !== a.locationId)
    .map((a) => ({ productId: a.productId, locationId: a.locationId }))
    .sort((x, y) => (x.productId < y.productId ? -1 : x.productId > y.productId ? 1 : 0));
}

// Shared objective for best-so-far: lowest travel, fewest relocations,
// stable assignment key. Identical ordering to core selection.
function beats(challenger: BestSoFar, incumbent: BestSoFar | null): boolean {
  if (incumbent === null) return true;
  if (challenger.weightedTravelMm !== incumbent.weightedTravelMm) {
    return challenger.weightedTravelMm < incumbent.weightedTravelMm;
  }
  if (challenger.relocationCount !== incumbent.relocationCount) {
    return challenger.relocationCount < incumbent.relocationCount;
  }
  return challenger.assignmentKey < incumbent.assignmentKey;
}

function feedbackOf(
  baseline: CandidateResult | null,
  heuristic: HeuristicResult | null,
  attempts: ProposalAttempt[],
): ProposalFeedback[] {
  // Seed with the actual valid baseline: a valid-but-worse heuristic must
  // never be labeled bestValidSoFar. Invalid baselines seed null.
  let best: BestSoFar | null = null;
  if (baseline?.valid && baseline.weightedTravelMm !== null) {
    best = {
      name: "baseline",
      weightedTravelMm: baseline.weightedTravelMm,
      relocationCount: baseline.relocationCount,
      assignmentKey: baseline.assignmentKey,
      changes: [],
    };
  }
  const snapshot = (): ProposalFeedback["bestValidSoFar"] =>
    best
      ? {
          name: best.name,
          weightedTravelMm: best.weightedTravelMm,
          relocationCount: best.relocationCount,
          changes: best.changes,
        }
      : null;
  const out: ProposalFeedback[] = [];
  // Measured heuristic feedback leads: the model revises against it.
  if (heuristic?.candidate) {
    const h = heuristic.candidate;
    const hChanges = relativeChanges(baseline?.assignment, heuristic.mapping);
    if (h.valid && h.weightedTravelMm !== null) {
      const cand: BestSoFar = {
        name: HEURISTIC_NAME,
        weightedTravelMm: h.weightedTravelMm,
        relocationCount: h.relocationCount,
        assignmentKey: h.assignmentKey,
        changes: hChanges,
      };
      if (beats(cand, best)) best = cand;
    }
    out.push({
      proposalName: HEURISTIC_NAME,
      valid: h.valid,
      errors: h.errors.map((e) => `${e.code}: ${e.message}`.slice(0, 300)).slice(0, 12),
      relocationCount: h.relocationCount,
      weightedTravelMm: h.weightedTravelMm,
      changes: hChanges,
      bestValidSoFar: snapshot(),
    });
  }
  for (const a of attempts) {
    const aChanges = relativeChanges(baseline?.assignment, a.candidate?.assignment);
    if (a.candidate?.valid && a.candidate.weightedTravelMm !== null) {
      const cand: BestSoFar = {
        name: a.name,
        weightedTravelMm: a.candidate.weightedTravelMm,
        relocationCount: a.candidate.relocationCount,
        assignmentKey: a.candidate.assignmentKey,
        changes: aChanges,
      };
      if (beats(cand, best)) best = cand;
    }
    const errors: string[] = [];
    if (!a.parseOk && a.parseError) errors.push(`PARSE: ${a.parseError}`);
    errors.push(...a.applyErrors);
    if (a.candidate) errors.push(...a.candidate.errors.map((e) => `${e.code}: ${e.message}`.slice(0, 300)));
    if (a.transportError) errors.push(`TRANSPORT: ${a.transportError}`);
    out.push({
      proposalName: a.name,
      valid: a.candidate?.valid ?? false,
      errors: errors.slice(0, 12),
      relocationCount: a.candidate?.relocationCount ?? null,
      weightedTravelMm: a.candidate?.weightedTravelMm ?? null,
      changes: aChanges,
      bestValidSoFar: snapshot(),
    });
  }
  return out;
}

function accumulateUsage(record: RunRecord, usage: ProviderUsage | null): void {
  if (usage === null) {
    record.usageIncomplete = true;
    return;
  }
  for (const k of ["promptTokens", "completionTokens", "totalTokens"] as const) {
    if (usage[k] === null) record.usageIncomplete = true;
  }
  if (record.usageTotals === null) {
    record.usageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  const t = record.usageTotals;
  // Sum only reported values; missing stays missing via usageIncomplete flag.
  if (usage.promptTokens !== null) t.promptTokens = (t.promptTokens ?? 0) + usage.promptTokens;
  else t.promptTokens = t.promptTokens ?? 0;
  if (usage.completionTokens !== null) t.completionTokens = (t.completionTokens ?? 0) + usage.completionTokens;
  else t.completionTokens = t.completionTokens ?? 0;
  if (usage.totalTokens !== null) t.totalTokens = (t.totalTokens ?? 0) + usage.totalTokens;
  else t.totalTokens = t.totalTokens ?? 0;
}

function realRequests(record: RunRecord, config: ApiConfig): number {
  // Only the official Meta endpoint counts; fixture and unsupported make none.
  return config.providerKind === "meta" ? record.modelRequestsUsed : 0;
}

function heuristicSummaryOf(heuristic: HeuristicResult | null): HeuristicSummary | null {
  if (!heuristic) return null;
  return {
    name: HEURISTIC_NAME,
    method: heuristic.method,
    sceneOk: heuristic.sceneOk,
    retainedBaseline: heuristic.retainedBaseline,
    rankingExhausted: heuristic.rankingExhausted,
    evaluationsUsed: heuristic.evaluationsUsed,
    evaluationsBudget: heuristic.evaluationsBudget,
    reason: heuristic.reason,
    candidate: heuristic.candidate ? structuredClone(heuristic.candidate) : null,
  };
}

// Shared fixed-scene gate (brief section 13): invalid geometry must surface
// INPUT_INVALID diagnostics before any assignment search or paid inference.
// An assignment-invalid baseline is still searchable and passes this gate.
function assertSceneValid(scenario: Scenario): void {
  const check = validateScene(scenario);
  if (!check.ok) {
    const err = new Error(
      `Scene geometry invalid (INPUT_INVALID: ${check.issues.map((i) => i.code).join(", ")}). ` +
        "Fix racks, locations, or packing before running search or inference.",
    ) as Error & { code?: string };
    err.code = "INPUT_INVALID";
    throw err;
  }
}

function candidateBudgetsOf(record: RunRecord, config: ApiConfig): CandidateBudgets {
  return {
    heuristic: {
      evaluationsUsed: record.heuristic?.evaluationsUsed ?? 0,
      evaluationsBudget: record.heuristic?.evaluationsBudget ?? config.heuristicMaxEvaluations,
    },
    model: {
      proposalsUsed: record.proposalsUsed,
      maxProposals: config.maxProposals,
      requestsUsed: record.modelRequestsUsed,
      maxRequests: config.maxRequests,
    },
  };
}

// Exact method labels over baseline plus every evaluated candidate mapping.
// Attempts without a mapping (parse/apply/transport failures) carry no label.
function methodLabelsOf(record: RunRecord): Record<string, MethodLabel> {
  const labels: Record<string, MethodLabel> = { baseline: "current" };
  if (record.heuristic?.candidate) labels[HEURISTIC_NAME] = methodLabelFor(HEURISTIC_NAME);
  for (const a of record.attempts) {
    if (a.candidate) labels[a.name] = methodLabelFor(a.name);
  }
  return labels;
}

function assetRefsOf(scenario: Scenario): AssetRef[] {
  return scenario.racks.map((r) => ({
    rackId: r.id,
    kind: "simready-glb",
    ref: RACK_ASSET.glbRef,
    sha256: RACK_ASSET.glbSha256,
    note: `SimReady ${RACK_ASSET.assetId} GLB (${RACK_ASSET.license}); manifest ${RACK_ASSET.manifestRef}.`,
  }));
}

function reportEntries(record: RunRecord): { name: string; mapping: Assignment[] }[] {
  const entries: { name: string; mapping: Assignment[] }[] = [];
  // Heuristic first: it ran before the model proposals and joins measured
  // best selection on equal footing (budgets reported separately).
  if (record.heuristic?.candidate) {
    entries.push({ name: HEURISTIC_NAME, mapping: record.heuristic.mapping });
  }
  for (const a of record.attempts) {
    if (a.candidate !== null) entries.push({ name: a.name, mapping: a.candidate.assignment });
  }
  return entries;
}

export function toSummary(record: RunRecord, config: ApiConfig): RunSummary {
  return {
    runId: record.id,
    state: record.state,
    phase: record.phase,
    phaseHistory: structuredClone(record.phaseHistory),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    completedAt: record.completedAt,
    modelRequestsUsed: record.modelRequestsUsed,
    proposalsUsed: record.proposalsUsed,
    budgets: { maxProposals: config.maxProposals, maxRequests: config.maxRequests, timeoutMs: config.timeoutMs },
    requirementsDraft: record.requirementsDraft ? structuredClone(record.requirementsDraft) : null,
    interpretedUnresolved: [...record.interpretedUnresolved],
    interpretError: record.interpretError,
    requirements: record.requirements ? structuredClone(record.requirements) : null,
    baseline: record.baseline ? structuredClone(record.baseline) : record.baselinePreview ? structuredClone(record.baselinePreview) : null,
    heuristic: heuristicSummaryOf(record.heuristic),
    methodLabels: methodLabelsOf(record),
    candidateBudgets: candidateBudgetsOf(record, config),
    attempts: structuredClone(record.attempts),
    bestName: record.bestName,
    outcome: record.outcome,
    lastError: record.lastError,
    usageTotals: record.usageTotals ? { ...record.usageTotals } : null,
    usageIncomplete: record.usageIncomplete,
    provider: "meta",
    providerKind: config.providerKind,
    realMetaRequests: realRequests(record, config),
    modelId: record.modelId,
    promptVersion: record.promptVersion,
  };
}

export class RunStore {
  readonly runs = new Map<string, RunRecord>();
  activeInference = 0;

  constructor(private readonly config: ApiConfig) {}

  get(id: string): RunRecord | undefined {
    return this.runs.get(id);
  }

  private evictIfNeeded(): void {
    if (this.runs.size < this.config.maxRuns) return;
    // Evict oldest terminal run; never evict active inference.
    let oldest: string | null = null;
    let oldestAt = "";
    for (const [id, r] of this.runs) {
      if (!terminal(r.state)) continue;
      if (oldest === null || r.createdAt < oldestAt) {
        oldest = id;
        oldestAt = r.createdAt;
      }
    }
    if (oldest !== null) {
      const r = this.runs.get(oldest);
      if (r?.deadlineTimer) clearTimeout(r.deadlineTimer);
      this.runs.delete(oldest);
    }
  }

  private acquireSlot(): boolean {
    if (this.activeInference >= this.config.concurrency) return false;
    this.activeInference++;
    return true;
  }

  private releaseSlot(): void {
    this.activeInference = Math.max(0, this.activeInference - 1);
  }

  private armDeadline(record: RunRecord): void {
    const delay = Math.max(1, Date.parse(record.expiresAt) - Date.now());
    record.deadlineTimer = setTimeout(() => {
      record.controller.abort();
      if (!terminal(record.state)) {
        record.state = "TIMED_OUT";
        record.completedAt = new Date().toISOString();
        record.lastError = "Run deadline exceeded; no further inference allowed.";
        this.finishReportFields(record);
      }
    }, delay);
    // Do not keep the process alive for long deadlines in tests.
    (record.deadlineTimer as unknown as { unref?: () => void }).unref?.();
  }

  private clearDeadline(record: RunRecord): void {
    if (record.deadlineTimer) {
      clearTimeout(record.deadlineTimer);
      record.deadlineTimer = null;
    }
  }

  private finishReportFields(record: RunRecord): void {
    // Best/outcome from evaluated candidates only; parse/apply failures have
    // no mapping and stay in the timeline, never in the core report.
    if (record.requirements && record.baseline) {
      const entries = reportEntries(record);
      try {
        const report = createReport(record.scenario, record.requirements, entries);
        record.bestName = report.bestName;
        record.outcome = report.outcome;
      } catch {
        record.bestName = record.bestName ?? null;
        record.outcome = record.outcome ?? null;
      }
    }
  }

  private wasCancelled(record: RunRecord): boolean {
    return (record as { __cancelled?: boolean }).__cancelled === true;
  }

  // Post-await guard: cancel/deadline wins over ANY outcome, including a
  // late transport success. Returns true when the run died while awaiting.
  private diedAwaiting(record: RunRecord): boolean {
    return record.controller.signal.aborted || terminal(record.state) || Date.now() >= Date.parse(record.expiresAt);
  }

  private settleAwaitingDeath(record: RunRecord, what: string): void {
    if (!terminal(record.state)) {
      record.state = this.wasCancelled(record) ? "CANCELLED" : "TIMED_OUT";
      record.completedAt = new Date().toISOString();
      record.lastError =
        record.state === "CANCELLED"
          ? `Run cancelled; ${what} was discarded.`
          : `Run deadline exceeded; ${what} was discarded, no further inference allowed.`;
    }
  }

  // Synchronous creation: validates, freezes, arms the deadline, and returns
  // the run ID promptly. Interpretation starts separately (async) so the
  // first inference is cancellable by ID.
  createRun(scenarioInput: unknown, requestText: string): RunRecord {
    const scenario = parseScenario(scenarioInput);
    const frozen = freezeScenario(scenario);
    // Scene gate before any run state, slot, or inference spend.
    assertSceneValid(frozen);
    this.evictIfNeeded();
    if (this.runs.size >= this.config.maxRuns) {
      const err = new Error("Run store is full; retry after older runs expire.") as Error & { code?: string };
      err.code = "RUN_STORE_FULL";
      throw err;
    }
    if (!this.acquireSlot()) {
      const err = new Error("Server is busy (concurrency limit); retry shortly.") as Error & { code?: string };
      err.code = "CONCURRENCY_LIMIT";
      throw err;
    }
    const now = new Date();
    const record: RunRecord = {
      id: newRunId(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.timeoutMs).toISOString(),
      completedAt: null,
      state: "INTERPRETING",
      phase: "VALIDATING_INPUT",
      phaseHistory: [],
      scenario: frozen,
      requestText: requestText.slice(0, 2000),
      requirementsDraft: null,
      interpretedUnresolved: [],
      interpretError: null,
      requirements: null,
      baselinePreview: null,
      baseline: null,
      heuristic: null,
      attempts: [],
      modelRequestsUsed: 0,
      proposalsUsed: 0,
      bestName: null,
      outcome: null,
      lastError: null,
      usageTotals: null,
      usageIncomplete: false,
      durationsMs: [],
      provider: "meta",
      modelId: this.config.modelId,
      promptVersion: PROMPT_VERSION,
      controller: new AbortController(),
      deadlineTimer: null,
    };
    setPhase(record, "VALIDATING_INPUT");
    this.runs.set(record.id, record);
    this.armDeadline(record);
    return record;
  }

  // Background interpretation for a run created by createRun. Releases the
  // concurrency slot when done. Never throws to the caller.
  startInterpretation(record: RunRecord, fetchImpl: FetchLike): void {
    void this.runInterpretation(record, fetchImpl).catch((e: unknown) => {
      // Defense in depth: unexpected failures end the run loudly, never hang it.
      if (!terminal(record.state)) {
        record.state = "FAILED";
        record.completedAt = new Date().toISOString();
        record.lastError = sanitizeMessage(
          e instanceof Error ? e.message : "Interpretation failed unexpectedly.",
          this.config,
        );
      }
      console.error(`layoutlab run ${record.id} interpretation failed: ${(record.lastError ?? "").slice(0, 200)}`);
    });
  }

  private async runInterpretation(record: RunRecord, fetchImpl: FetchLike): Promise<void> {
    try {
      setPhase(record, "INTERPRETING");
      if (record.modelRequestsUsed >= this.config.maxRequests) {
        record.state = "FAILED";
        record.lastError = "Model request budget exhausted before interpretation.";
        record.completedAt = new Date().toISOString();
        return;
      }
      if (this.diedAwaiting(record)) {
        this.settleAwaitingDeath(record, "interpretation");
        return;
      }
      const frozen = record.scenario;
      const defaults: PlanningRequirements = {
        objective: "minimize_weighted_picking_travel",
        maxRelocatedProducts: Math.min(4, this.config.maxProposals + 1),
        lockedProductIds: [],
        assumptions: [],
        unresolvedQuestions: [],
      };
      let summary: string;
      try {
        summary = buildScenarioSummary(frozen, { maxChars: this.config.maxContextChars });
      } catch (e) {
        record.state = "FAILED";
        record.lastError = sanitizeMessage(e instanceof Error ? e.message : "Context bound exceeded.", this.config);
        record.completedAt = new Date().toISOString();
        return;
      }
      // Count the attempt BEFORE sending; failures still consume budget.
      record.modelRequestsUsed++;
      const result = await chatCompletionJson(
        this.config,
        {
          schemaName: "planning_requirements",
          schema: requirementsJsonSchema,
          developerInstruction: INTERPRET_INSTRUCTION,
          userContent: [
            `Planning request: ${record.requestText}`,
            `Scenario summary: ${summary}`,
            `Defaults: ${JSON.stringify({ maxRelocatedProducts: defaults.maxRelocatedProducts, lockedProductIds: defaults.lockedProductIds })}`,
            "Return the PlanningRequirements JSON object only.",
          ].join("\n"),
        },
        record.controller.signal,
        fetchImpl,
      ).catch((e: unknown) => ({ __error: e as Error & { code?: string } }) as const);
      // Cancel/deadline wins even over a late success: discard, never write a draft.
      if (this.diedAwaiting(record)) {
        this.settleAwaitingDeath(record, "interpretation result");
        return;
      }
      const badInterpretOutput = (message: string): void => {
        // Bad structured output consumes budget but still allows manual approval.
        record.interpretError = sanitizeMessage(`Interpretation output failed validation: ${message}`.slice(0, 500), this.config);
        const fallback: PlanningRequirements = {
          objective: "minimize_weighted_picking_travel",
          maxRelocatedProducts: Math.min(4, 64),
          lockedProductIds: [],
          assumptions: ["Interpretation failed; preview uses default constraints."],
          unresolvedQuestions: [],
        };
        try {
          record.baselinePreview = evaluateBaseline(frozen, fallback);
        } catch {
          record.baselinePreview = null;
        }
      };
      if (typeof result === "object" && result !== null && "__error" in result) {
        const e = (result as { __error: Error & { code?: string } }).__error;
        if (e.code === "PARSE_ERROR" || e.code === "RESPONSE_TOO_LARGE") {
          accumulateUsage(record, null); // usage unknown for the discarded response
          badInterpretOutput(e.message);
        } else {
          record.state = "FAILED";
          record.lastError = sanitizeMessage(e.message, this.config);
          record.completedAt = new Date().toISOString();
          return;
        }
      } else {
        const ok = result as { parsed: unknown; usage: ProviderUsage | null; durationMs: number };
        record.durationsMs.push(ok.durationMs);
        accumulateUsage(record, ok.usage);
        try {
          const draft = parseRequirements(ok.parsed);
          record.requirementsDraft = draft;
          record.interpretedUnresolved = [...draft.unresolvedQuestions];
          record.baselinePreview = evaluateBaseline(frozen, draft);
        } catch (e) {
          badInterpretOutput(e instanceof Error ? e.message : "invalid");
        }
      }
      if (!terminal(record.state)) {
        record.state = "AWAITING_APPROVAL";
        setPhase(record, "AWAITING_APPROVAL");
      }
    } finally {
      this.releaseSlot();
      if (terminal(record.state)) this.clearDeadline(record);
    }
  }

  async approveRun(
    id: string,
    requirementsInput: unknown,
    fetchImpl: FetchLike,
  ): Promise<RunRecord> {
    const record = this.runs.get(id);
    if (!record) {
      const err = new Error(`Unknown run ${id}.`) as Error & { code?: string };
      err.code = "UNKNOWN_RUN";
      throw err;
    }
    if (terminal(record.state)) {
      const err = new Error(
        record.state === "CANCELLED"
          ? "Run was cancelled; it cannot be completed."
          : record.state === "TIMED_OUT"
            ? "Run deadline expired; budgets preserved, no further inference allowed."
            : `Run is already ${record.state}; approval is closed.`,
      ) as Error & { code?: string };
      err.code = record.state === "TIMED_OUT" ? "RUN_EXPIRED" : "RUN_CLOSED";
      throw err;
    }
    if (record.state !== "AWAITING_APPROVAL") {
      const err = new Error(
        record.state === "INTERPRETING"
          ? "Interpretation is still running; wait for approval to open."
          : `Run is ${record.state}; approval is not open.`,
      ) as Error & { code?: string };
      err.code = "RUN_CLOSED";
      throw err;
    }
    // Expiry during approval preserves deadline/budgets: no reset, no inference.
    if (Date.now() >= Date.parse(record.expiresAt) || record.controller.signal.aborted) {
      record.state = "TIMED_OUT";
      record.completedAt = new Date().toISOString();
      record.lastError = "Run deadline expired during approval; budgets preserved, no further inference allowed.";
      this.clearDeadline(record);
      const err = new Error(record.lastError) as Error & { code?: string };
      err.code = "RUN_EXPIRED";
      throw err;
    }
    let approved: PlanningRequirements;
    try {
      approved = parseRequirements(requirementsInput);
    } catch (e) {
      const err = new Error(`Requirements invalid: ${e instanceof Error ? e.message : "parse failed"}`) as Error & {
        code?: string;
      };
      err.code = "BAD_REQUIREMENTS";
      throw err;
    }
    // Unresolved questions are never silently ignored: approval requires
    // explicitly normalized constraints with every question resolved.
    if (approved.unresolvedQuestions.length > 0) {
      const err = new Error(
        `Requirements carry ${approved.unresolvedQuestions.length} unresolved question(s); resolve or remove them before approval: ${approved.unresolvedQuestions.slice(0, 3).join(" | ").slice(0, 300)}`,
      ) as Error & { code?: string };
      err.code = "UNRESOLVED_QUESTIONS";
      throw err;
    }
    // Unknown lock refs are rejected at approval (clear error, no inference consumed).
    const products = new Set(record.scenario.products.map((p) => p.id));
    for (const lock of approved.lockedProductIds) {
      if (!products.has(lock)) {
        const err = new Error(`Requirements lock unknown product ${lock}.`) as Error & { code?: string };
        err.code = "BAD_REQUIREMENTS";
        throw err;
      }
    }
    // Defense-in-depth scene gate: creation already enforces it, so reaching
    // here with invalid geometry ends the run without search or inference.
    if (!validateScene(record.scenario).ok) {
      record.requirements = structuredClone(approved);
      Object.freeze(record.requirements);
      record.state = "FAILED";
      record.completedAt = new Date().toISOString();
      record.lastError = "Scene geometry invalid (INPUT_INVALID); no heuristic, proposals, or further inference.";
      this.clearDeadline(record);
      this.finishReportFields(record);
      return record;
    }
    if (!this.acquireSlot()) {
      const err = new Error("Server is busy (concurrency limit); retry shortly.") as Error & { code?: string };
      err.code = "CONCURRENCY_LIMIT";
      throw err;
    }
    // Single-flight: everything above is synchronous with no await, so a
    // concurrent second approve observes RUNNING and gets RUN_CLOSED below.
    // The same run ID, request count, and deadline continue (never reset).
    record.requirements = structuredClone(approved);
    Object.freeze(record.requirements);
    record.state = "RUNNING";
    try {
      setPhase(record, "EVALUATING_BASELINE");
      record.baseline = evaluateBaseline(record.scenario, approved);
      // Bounded demand heuristic BEFORE any model proposal: deterministic,
      // no inference, joins measured feedback and best selection.
      setPhase(record, "RUNNING_HEURISTIC");
      record.heuristic = runHeuristic(record.scenario, approved, {
        maxCandidateEvaluations: this.config.heuristicMaxEvaluations,
      });
      let summary: string;
      try {
        // Proposal summary is built after the heuristic runs, so it reuses
        // the measured location rank (evaluator data, never model estimates).
        summary = buildScenarioSummary(record.scenario, {
          maxChars: this.config.maxContextChars,
          requirements: approved,
          baseline: record.baseline,
          locationRank: record.heuristic?.locationRank ?? null,
        });
      } catch (e) {
        record.state = "FAILED";
        record.lastError = sanitizeMessage(e instanceof Error ? e.message : "Context bound exceeded.", this.config);
        record.completedAt = new Date().toISOString();
        this.finishReportFields(record);
        return record;
      }
      // Bounded proposal loop: at most maxProposals attempts within maxRequests total.
      while (record.proposalsUsed < this.config.maxProposals && record.modelRequestsUsed < this.config.maxRequests) {
        if (this.diedAwaiting(record)) {
          this.settleAwaitingDeath(record, "proposal loop");
          this.finishReportFields(record);
          return record;
        }
        const attemptIndex = record.proposalsUsed;
        const name = `proposal-${attemptIndex + 1}`;
        const feedback = feedbackOf(record.baseline, record.heuristic, record.attempts);
        const userContent = buildProposalUserContent(summary, approved, record.baseline, feedback, attemptIndex);
        // Count before sending; never reset when continuing after approval or error.
        setPhase(record, "REQUESTING_PROPOSAL");
        record.modelRequestsUsed++;
        record.proposalsUsed++;
        const started = Date.now();
        const result = await chatCompletionJson(
          this.config,
          {
            schemaName: "assignment_proposal",
            schema: proposalJsonSchema,
            developerInstruction: PROPOSAL_INSTRUCTION,
            userContent,
          },
          record.controller.signal,
          fetchImpl,
        ).catch((e: unknown) => ({ __error: e as Error & { code?: string } }) as const);
        // Late success after cancel/deadline: discard, append no candidate, run no more calls.
        if (this.diedAwaiting(record)) {
          this.settleAwaitingDeath(record, `late ${name} result`);
          record.attempts.push({
            name,
            rationale: "",
            parseOk: false,
            parseError: record.lastError,
            applyOk: false,
            applyErrors: [],
            candidate: null,
            usage: null,
            durationMs: Date.now() - started,
            requestIndex: record.modelRequestsUsed,
            transportError: record.lastError,
          });
          record.completedAt = record.completedAt ?? new Date().toISOString();
          this.finishReportFields(record);
          return record;
        }
        if (typeof result === "object" && result !== null && "__error" in result) {
          const e = (result as { __error: Error & { code?: string } }).__error;
          // Bad structured output consumes budget and feeds back to the next
          // attempt; transport failure ends the run (no blind retries).
          const msg = sanitizeMessage(e.message, this.config);
          if (e.code === "PARSE_ERROR" || e.code === "RESPONSE_TOO_LARGE") {
            accumulateUsage(record, null); // usage unknown for the discarded response
            record.attempts.push({
              name,
              rationale: "",
              parseOk: false,
              parseError: msg.slice(0, 500),
              applyOk: false,
              applyErrors: [],
              candidate: null,
              usage: null,
              durationMs: Date.now() - started,
              requestIndex: record.modelRequestsUsed,
              transportError: null,
            });
            continue;
          }
          record.attempts.push({
            name,
            rationale: "",
            parseOk: false,
            parseError: msg.slice(0, 500),
            applyOk: false,
            applyErrors: [],
            candidate: null,
            usage: null,
            durationMs: Date.now() - started,
            requestIndex: record.modelRequestsUsed,
            transportError: msg.slice(0, 500),
          });
          record.state = "FAILED";
          record.lastError = msg;
          record.completedAt = new Date().toISOString();
          this.finishReportFields(record);
          return record;
        }
        const ok = result as { parsed: unknown; usage: ProviderUsage | null; durationMs: number; jsonText: string };
        record.durationsMs.push(ok.durationMs);
        accumulateUsage(record, ok.usage);
        setPhase(record, "VALIDATING_PROPOSAL");
        // Strict parse; failure consumes budget and feeds back to the next attempt.
        let parsedProposal: { scenarioRevision: number; changes: { productId: string; locationId: string }[]; rationale: string } | null = null;
        let parseError: string | null = null;
        try {
          parsedProposal = parseProposal(ok.parsed);
        } catch (e) {
          parseError = sanitizeMessage(
            `Proposal output failed validation: ${e instanceof Error ? e.message : "invalid"}`.slice(0, 500),
            this.config,
          );
        }
        if (!parsedProposal || parseError) {
          record.attempts.push({
            name,
            rationale: "",
            parseOk: false,
            parseError,
            applyOk: false,
            applyErrors: [],
            candidate: null,
            usage: ok.usage,
            durationMs: ok.durationMs,
            requestIndex: record.modelRequestsUsed,
            transportError: null,
          });
          continue;
        }
        // Every proposal reapplies to the original frozen baseline.
        const applied = applyProposal(record.scenario, parsedProposal);
        if (!applied.ok) {
          record.attempts.push({
            name,
            rationale: parsedProposal.rationale,
            parseOk: true,
            parseError: null,
            applyOk: false,
            applyErrors: applied.errors.map((e) => `${e.code}: ${e.message}`.slice(0, 300)),
            candidate: null,
            usage: ok.usage,
            durationMs: ok.durationMs,
            requestIndex: record.modelRequestsUsed,
            transportError: null,
          });
          continue;
        }
        setPhase(record, "EVALUATING_PROPOSAL");
        const candidate = evaluateCandidate(record.scenario, approved, applied.finalMapping, name);
        record.attempts.push({
          name,
          rationale: parsedProposal.rationale,
          parseOk: true,
          parseError: null,
          applyOk: true,
          applyErrors: [],
          candidate,
          usage: ok.usage,
          durationMs: ok.durationMs,
          requestIndex: record.modelRequestsUsed,
          transportError: null,
        });
      }
      // Loop ended by budget. Terminal cancel/timeout can never become
      // completed here: the loop-top and post-await guards return first.
      if (!terminal(record.state)) {
        setPhase(record, "FINALIZING");
        record.state = "COMPLETED";
        record.completedAt = new Date().toISOString();
      }
      this.finishReportFields(record);
      return record;
    } finally {
      this.releaseSlot();
      if (terminal(record.state)) this.clearDeadline(record);
    }
  }

  cancel(id: string): RunRecord {
    const record = this.runs.get(id);
    if (!record) {
      const err = new Error(`Unknown run ${id}.`) as Error & { code?: string };
      err.code = "UNKNOWN_RUN";
      throw err;
    }
    if (terminal(record.state)) {
      const err = new Error(`Run is already ${record.state}; cancellation is closed.`) as Error & { code?: string };
      err.code = "RUN_CLOSED";
      throw err;
    }
    (record as { __cancelled?: boolean }).__cancelled = true;
    record.controller.abort();
    record.state = "CANCELLED";
    record.completedAt = new Date().toISOString();
    record.lastError = "Run cancelled by user; in-flight model request was aborted.";
    this.finishReportFields(record);
    this.clearDeadline(record);
    return record;
  }

  buildReport(id: string): M3ReportEnvelope {
    const record = this.runs.get(id);
    if (!record) {
      const err = new Error(`Unknown run ${id}.`) as Error & { code?: string };
      err.code = "UNKNOWN_RUN";
      throw err;
    }
    if (!record.requirements || !record.baseline) {
      const err = new Error("Run has no approved requirements yet; report is not available.") as Error & {
        code?: string;
      };
      err.code = "RUN_NOT_COMPLETED";
      throw err;
    }
    const entries = reportEntries(record);
    // Deterministic recompute without inference; reuse core report contracts.
    const report = createReport(record.scenario, record.requirements, entries);
    return {
      envelopeVersion: "layoutlab.m3report/1",
      runId: record.id,
      exportedAt: new Date().toISOString(),
      appVersion: "0.3.0",
      apiVersion: API_VERSION,
      coreVersion: CORE_VERSION,
      reportVersion: REPORT_VERSION,
      routePolicy: ROUTE_POLICY_ID,
      provider: "meta",
      providerKind: this.config.providerKind,
      realMetaRequests: realRequests(record, this.config),
      modelId: record.modelId,
      promptVersion: record.promptVersion,
      state: record.state,
      phase: record.phase,
      outcome: report.outcome,
      modelRequestsUsed: record.modelRequestsUsed,
      proposalsUsed: record.proposalsUsed,
      budgets: { maxProposals: this.config.maxProposals, maxRequests: this.config.maxRequests, timeoutMs: this.config.timeoutMs },
      usageTotals: record.usageTotals ? { ...record.usageTotals } : null,
      usageIncomplete: record.usageIncomplete,
      scenario: structuredClone(record.scenario),
      requirements: structuredClone(record.requirements),
      interpretedUnresolved: [...record.interpretedUnresolved],
      baseline: structuredClone(report.baseline),
      candidates: structuredClone(report.candidates),
      heuristic: heuristicSummaryOf(record.heuristic),
      methodLabels: methodLabelsOf(record),
      candidateBudgets: candidateBudgetsOf(record, this.config),
      assetRefs: assetRefsOf(record.scenario),
      attempts: structuredClone(record.attempts),
      feedback: feedbackOf(record.baseline, record.heuristic, record.attempts),
      bestName: report.bestName,
      improvementPercents: structuredClone(report.improvementPercents),
      timingsMs: { createdAt: record.createdAt, completedAt: record.completedAt, durationsMs: [...record.durationsMs] },
      limitations: [...M3_LIMITATIONS],
    };
  }
}
