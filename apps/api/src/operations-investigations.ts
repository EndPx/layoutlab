// E4a bounded Meta investigation backend: question -> model-selected
// experiment (E3 engine) -> real measured feedback -> next choice ->
// evidence-linked recommendation. In-memory only (no durable-resume claim),
// one durable budget claim per investigation (wired in server.ts), at most
// 4 model requests and 3 proposed alternatives plus the baseline.
import {
  DEFAULT_OPERATIONS_SAFETY_CEILING_MS,
  OPERATIONS_EXPERIMENT_SCHEMA,
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  SIMULATION_VERSION,
  parseInterventionPolicy,
  parseOperationsExecutionConfig,
  parseOperationsPatch,
  parseOperationsScenario,
  runOperationsExperiment,
  verifyOperationsExperiment,
  type ExperimentCandidateResult,
  type InterventionPolicy,
  type OperationsExecutionConfig,
  type OperationsExperimentResult,
  type OperationsPatch,
  type OperationsScenario,
} from "@layoutlab/simulation";
import { API_VERSION, liveAvailable, sanitizeMessage, type ApiConfig } from "./config.js";
import { normalizeOperationsProviderPatch, OPERATIONS_PATCH_JSON_SCHEMA } from "./operations-api.js";
import { chatCompletionJson, type FetchLike, type ProviderDiagnostics, type ProviderUsage } from "./provider.js";

export const INVESTIGATION_SCHEMA = "layoutlab.operations-investigation/1" as const;
export const INVESTIGATION_PROMPT_VERSION = "layoutlab.operations-investigation-prompt/2";
export const MAX_INVESTIGATION_REQUESTS = 4;
export const MAX_INVESTIGATION_EXPERIMENTS = 3;
export const HYPOTHESIS_KIND = "model-assertion-not-measured-proof" as const;

type ApiErrorLike = Error & { code?: string; status?: number };
function apiError(code: string, status: number, message: string): ApiErrorLike {
  return Object.assign(new Error(message), { code, status });
}

// --- Strict typed input -------------------------------------------------------
// Free text (question) grants nothing: only interventionPolicy authorizes
// patch fields. An absent policy is the E3 default (baseline only).
export type InvestigationInput = {
  scenario: OperationsScenario;
  executionConfig: OperationsExecutionConfig;
  interventionPolicy: InterventionPolicy;
  safetyCeilingMs: number;
  question: string;
  mode: "live";
  consent: true;
};

const INPUT_KEYS = ["scenario", "executionConfig", "interventionPolicy", "safetyCeilingMs", "question", "mode", "consent"];

export function parseInvestigationInput(body: unknown): InvestigationInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw apiError("BAD_REQUEST", 400, "investigation body must be an object");
  }
  const raw = body as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!INPUT_KEYS.includes(key)) throw apiError("BAD_REQUEST", 400, `unknown investigation field ${key}`);
  }
  if (typeof raw["question"] !== "string" || raw["question"].trim().length === 0 || raw["question"].length > 2000) {
    throw apiError("BAD_REQUEST", 400, "question must be 1..2000 characters");
  }
  if (raw["mode"] !== "live" || raw["consent"] !== true) {
    throw apiError("BAD_REQUEST", 400, "investigation requires mode: 'live' and consent: true (explicit live selection and consent)");
  }
  let scenario: OperationsScenario;
  try {
    scenario = parseOperationsScenario(structuredClone(raw["scenario"]));
  } catch (e) {
    throw apiError("BAD_SCENARIO", 400, e instanceof Error ? e.message : "invalid scenario");
  }
  let executionConfig: OperationsExecutionConfig;
  try {
    executionConfig = parseOperationsExecutionConfig(structuredClone(raw["executionConfig"]));
  } catch (e) {
    throw apiError("BAD_REQUEST", 400, e instanceof Error ? e.message : "invalid executionConfig");
  }
  let interventionPolicy: InterventionPolicy = { allowedFields: [] };
  if (raw["interventionPolicy"] !== undefined) {
    try {
      interventionPolicy = parseInterventionPolicy(structuredClone(raw["interventionPolicy"]));
    } catch (e) {
      throw apiError("BAD_REQUEST", 400, e instanceof Error ? e.message : "invalid interventionPolicy");
    }
  }
  const ceiling = raw["safetyCeilingMs"];
  if (ceiling !== undefined && (!Number.isSafeInteger(ceiling) || (ceiling as number) < 1 || (ceiling as number) > 2_147_483_647)) {
    throw apiError("BAD_REQUEST", 400, "safetyCeilingMs must be an integer in 1..2147483647");
  }
  return {
    scenario,
    executionConfig,
    interventionPolicy,
    safetyCeilingMs: ceiling === undefined ? DEFAULT_OPERATIONS_SAFETY_CEILING_MS : (ceiling as number),
    question: raw["question"],
    mode: "live",
    consent: true,
  };
}

// --- Model action contract ------------------------------------------------------
// Meta strict mode: required lists every property; unchanged patch knobs are
// explicit nulls (same contract as the accepted one-shot proposal schema).
const PATCH_PROPS = OPERATIONS_PATCH_JSON_SCHEMA.properties;
export const INVESTIGATION_ACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: ["string", "null"], enum: ["run_experiment", "finish", null] },
    hypothesis: { type: ["string", "null"], maxLength: 500 },
    extraPickers: PATCH_PROPS.extraPickers,
    extraPutaway: PATCH_PROPS.extraPutaway,
    packingDurationMs: PATCH_PROPS.packingDurationMs,
    dispatchDurationMs: PATCH_PROPS.dispatchDurationMs,
    receivingDurationMs: PATCH_PROPS.receivingDurationMs,
    candidateId: { type: ["string", "null"], maxLength: 128 },
  },
  required: ["action", "hypothesis", "extraPickers", "extraPutaway", "packingDurationMs", "dispatchDurationMs", "receivingDurationMs", "candidateId"],
} as const;

const ACTION_KEYS = [...INVESTIGATION_ACTION_JSON_SCHEMA.required] as readonly string[];
const PATCH_KEYS = ["extraPickers", "extraPutaway", "packingDurationMs", "dispatchDurationMs", "receivingDurationMs"] as const;

type ModelAction =
  | { kind: "run_experiment"; hypothesis: string | null; patch: OperationsPatch }
  | { kind: "finish"; hypothesis: string | null; candidateId: string };

function parseModelAction(parsed: unknown): ModelAction {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("action must be an object");
  const rec = parsed as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    // Bound model-derived key names: they are persisted in diagnostics.
    if (!ACTION_KEYS.includes(key)) throw new Error(`unknown action key ${key.slice(0, 64)}`);
  }
  for (const key of ACTION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rec, key)) throw new Error(`missing action key ${key}`);
  }
  const hypothesis = rec["hypothesis"];
  if (hypothesis !== null && (typeof hypothesis !== "string" || hypothesis.length > 500)) {
    throw new Error("hypothesis must be null or a string of at most 500 characters");
  }
  const patchRaw: Record<string, unknown> = {};
  for (const key of PATCH_KEYS) patchRaw[key] = rec[key];
  const action = rec["action"];
  if (action === "run_experiment") {
    if (rec["candidateId"] !== null) throw new Error("run_experiment requires candidateId to be null");
    // Reuse the accepted strict provider-patch normalization (null = unchanged).
    return { kind: "run_experiment", hypothesis: hypothesis as string | null, patch: normalizeOperationsProviderPatch(patchRaw) };
  }
  if (action === "finish") {
    const hasPatchChange = PATCH_KEYS.some((k) => rec[k] !== null);
    if (hasPatchChange) throw new Error("finish requires every patch field to be null");
    if (typeof rec["candidateId"] !== "string" || rec["candidateId"].length === 0 || rec["candidateId"].length > 128) {
      throw new Error("finish requires candidateId (1..128 characters) naming an existing candidate");
    }
    return { kind: "finish", hypothesis: hypothesis as string | null, candidateId: rec["candidateId"] };
  }
  throw new Error("action must be run_experiment or finish");
}

function isNoChangePatch(patch: OperationsPatch): boolean {
  return PATCH_KEYS.every((f) => {
    const v = patch[f];
    return v === undefined || ((f === "extraPickers" || f === "extraPutaway") && v === 0);
  });
}
function canonicalPatch(patch: OperationsPatch): string {
  const out: Record<string, number> = {};
  for (const f of PATCH_KEYS) if (patch[f] !== undefined) out[f] = patch[f] as number;
  return JSON.stringify(out);
}

// --- Server-computed comparisons (the only numbers the explanation may cite) ---
export type CandidateComparisons = {
  baselineCandidateId: string;
  candidateId: string;
  shippedDelta: number | null;
  makespanDeltaMs: number | null;
  makespanImprovementPercent: number | null;
  totalWaitDeltaMs: number | null;
  totalWaitImprovementPercent: number | null;
};
function pct(base: number | null, cand: number | null): number | null {
  if (base === null || cand === null || base === 0) return null;
  return Math.round(((base - cand) / base) * 100 * 1e6) / 1e6;
}
export function computeComparisons(
  baseline: ExperimentCandidateResult,
  candidate: ExperimentCandidateResult,
): CandidateComparisons {
  const delta = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : b - a);
  return {
    baselineCandidateId: baseline.candidateId,
    candidateId: candidate.candidateId,
    shippedDelta: delta(baseline.shipped, candidate.shipped),
    makespanDeltaMs: delta(baseline.makespanMs, candidate.makespanMs),
    makespanImprovementPercent: pct(baseline.makespanMs, candidate.makespanMs),
    totalWaitDeltaMs: delta(baseline.totalWaitMs, candidate.totalWaitMs),
    totalWaitImprovementPercent: pct(baseline.totalWaitMs, candidate.totalWaitMs),
  };
}
function buildExplanation(
  candidate: ExperimentCandidateResult,
  baseline: ExperimentCandidateResult,
  comparisons: CandidateComparisons,
  improved: boolean,
): string {
  const fmt = (v: number | null): string => (v === null ? "n/a" : String(v));
  return (
    `Server-computed contrast in this synthetic scenario only: candidate ${candidate.candidateId} vs baseline ${baseline.candidateId} ` +
    `under declared patch ${JSON.stringify(candidate.patch ?? {})}: shipped ${fmt(candidate.shipped)} vs ${fmt(baseline.shipped)} ` +
    `(delta ${fmt(comparisons.shippedDelta)}), makespanMs ${fmt(candidate.makespanMs)} vs ${fmt(baseline.makespanMs)} ` +
    `(delta ${fmt(comparisons.makespanDeltaMs)} ms, improvement ${fmt(comparisons.makespanImprovementPercent)}%), ` +
    `totalWaitMs ${fmt(candidate.totalWaitMs)} vs ${fmt(baseline.totalWaitMs)} (delta ${fmt(comparisons.totalWaitDeltaMs)} ms). ` +
    (improved
      ? "The candidate ranks ahead of the baseline under the deterministic E3 ranking for this bounded contrast."
      : "No measured improvement over the baseline is claimed for this candidate.") +
    " This is a bounded contrast for the declared intervention in a synthetic scenario, not causal proof, not a global optimum, and not real warehouse savings."
  );
}

export type Recommendation = {
  candidateId: string;
  source: "model" | "deterministic-fallback";
  modelSelectedCandidateId: string | null;
  deterministicBestCandidateId: string | null;
  baselineCandidateId: string;
  improvedOverBaseline: boolean;
  comparisons: CandidateComparisons;
  explanation: string;
};

function buildRecommendation(
  comparison: OperationsExperimentResult,
  candidateId: string,
  source: "model" | "deterministic-fallback",
  modelSelectedCandidateId: string | null,
): Recommendation {
  const baseline = comparison.candidates.find((c) => c.candidateId === comparison.baselineCandidateId) as ExperimentCandidateResult;
  const candidate = comparison.candidates.find((c) => c.candidateId === candidateId) as ExperimentCandidateResult;
  const comparisons = computeComparisons(baseline, candidate);
  const ranked = comparison.rankedCandidateIds;
  const improved =
    candidateId !== comparison.baselineCandidateId &&
    ranked.includes(candidateId) &&
    ranked.includes(comparison.baselineCandidateId) &&
    ranked.indexOf(candidateId) < ranked.indexOf(comparison.baselineCandidateId);
  return {
    candidateId,
    source,
    modelSelectedCandidateId,
    deterministicBestCandidateId: comparison.selectedCandidateId,
    baselineCandidateId: comparison.baselineCandidateId,
    improvedOverBaseline: improved,
    comparisons,
    explanation: buildExplanation(candidate, baseline, comparisons, improved),
  };
}

// --- Records, trace, report -----------------------------------------------------
export type InvestigationState = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
export type InvestigationPhase = "EVALUATING_BASELINE" | "REQUESTING_MODEL" | "EVALUATING_EXPERIMENT" | "FINALIZING";

export type InvestigationRequestRecord = {
  index: number;
  status: "dispatched" | "ok" | "invalid-action" | "transport-error" | "aborted" | "guard-refused";
  responseId: string | null;
  usage: ProviderUsage | null;
  finishReason: string | null;
  durationMs: number | null;
  model: string | null;
  errorCode: string | null;
  error: string | null;
};

export type InvestigationTraceEntry = {
  seq: number;
  kind: "baseline" | "proposal" | "experiment" | "finish" | "recommendation";
  requestIndex: number | null;
  candidateId: string | null;
  patch: OperationsPatch | null;
  hypothesis: string | null;
  hypothesisKind: typeof HYPOTHESIS_KIND | null;
  status: string;
  reason: string | null;
  shipped: number | null;
  makespanMs: number | null;
  totalWaitMs: number | null;
  backlog: number | null;
};

export type InvestigationReport = {
  schema: typeof INVESTIGATION_SCHEMA;
  investigationId: string;
  runId: string;
  createdAt: string;
  completedAt: string | null;
  state: InvestigationState;
  outcome: string | null;
  lastError: string | null;
  input: {
    scenario: OperationsScenario;
    executionConfig: OperationsExecutionConfig;
    interventionPolicy: InterventionPolicy;
    safetyCeilingMs: number;
    question: string;
    mode: "live";
    consent: true;
  };
  scenarioId: string;
  seed: string;
  versions: {
    simulation: string;
    operationsSchema: string;
    operationsEngine: string;
    evaluator: string;
    experimentSchema: string;
    api: string;
    prompt: string;
  };
  provider: "meta";
  providerKind: ApiConfig["providerKind"];
  configuredModel: string;
  returnedModel: string | null;
  realMetaRequests: number;
  limits: { maxModelRequests: number; maxExperiments: number; maxCompletionTokens: number; timeoutMs: number };
  budget: { publicBudgetPerRunUsd: number; claimId: string | null; accounting: string };
  requestCount: number;
  experimentCount: number;
  requests: InvestigationRequestRecord[];
  trace: InvestigationTraceEntry[];
  comparison: OperationsExperimentResult | null;
  recommendation: Recommendation | null;
  assumptions: string[];
  limitations: string[];
};

export type InvestigationRecord = {
  id: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  state: InvestigationState;
  phase: InvestigationPhase;
  input: InvestigationInput;
  comparison: OperationsExperimentResult | null;
  executed: { candidateId: string; patch: OperationsPatch }[];
  trace: InvestigationTraceEntry[];
  requests: InvestigationRequestRecord[];
  rejected: { requestIndex: number; reason: string }[];
  modelRequestsUsed: number;
  experimentsUsed: number;
  modelSelectedCandidateId: string | null;
  recommendation: Recommendation | null;
  outcome: string | null;
  lastError: string | null;
  returnedModel: string | null;
  budgetClaimId: string | null;
  controller: AbortController;
  deadlineTimer: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
};

const VALID_CANDIDATE = new Set(["valid-complete", "valid-incomplete"]);

// Bounded deterministic operational context from the FROZEN inputs: what the
// model is investigating (current resources/service assumptions, worker
// roles/counts, workload and initial inventory). Facts only; no bottleneck
// is invented and nothing here is a measurement.
export type OperationalContext = {
  resources: { kind: string; count: number; serviceDurationMs: number[] }[];
  workers: { role: string; count: number }[];
  workload: {
    products: number;
    locations: number;
    orders: number;
    orderLines: number;
    orderedUnits: number;
    deliveries: number;
    deliveryLines: number;
    deliveredUnits: number;
    initialStockEntries: number;
    initialStockUnits: number;
  };
  execution: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number };
};

export function operationalContextOf(scenario: OperationsScenario, executionConfig: OperationsExecutionConfig): OperationalContext {
  const resources = new Map<string, { kind: string; count: number; durations: Set<number> }>();
  for (const r of scenario.resources) {
    const entry = resources.get(r.kind) ?? { kind: r.kind, count: 0, durations: new Set<number>() };
    entry.count++;
    entry.durations.add(r.serviceDurationMs);
    resources.set(r.kind, entry);
  }
  const workers = new Map<string, number>();
  for (const u of scenario.mobileUnits) workers.set(u.role, (workers.get(u.role) ?? 0) + 1);
  const sum = (rows: { lines: { quantity: number }[] }[], pick: "lines" | "units"): number =>
    rows.reduce((acc, row) => acc + (pick === "lines" ? row.lines.length : row.lines.reduce((a, l) => a + l.quantity, 0)), 0);
  return {
    resources: [...resources.values()]
      .sort((a, b) => (a.kind < b.kind ? -1 : 1))
      .map((r) => ({ kind: r.kind, count: r.count, serviceDurationMs: [...r.durations].sort((a, b) => a - b) })),
    workers: [...workers.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([role, count]) => ({ role, count })),
    workload: {
      products: scenario.products.length,
      locations: scenario.locations.length,
      orders: scenario.orderSchedule.length,
      orderLines: sum(scenario.orderSchedule, "lines"),
      orderedUnits: sum(scenario.orderSchedule, "units"),
      deliveries: scenario.deliverySchedule.length,
      deliveryLines: sum(scenario.deliverySchedule, "lines"),
      deliveredUnits: sum(scenario.deliverySchedule, "units"),
      initialStockEntries: scenario.initialStock.length,
      initialStockUnits: scenario.initialStock.reduce((a, s) => a + s.quantity, 0),
    },
    execution: {
      pickDurationMsPerItem: executionConfig.pickDurationMsPerItem,
      unloadDurationMsPerItem: executionConfig.unloadDurationMsPerItem,
    },
  };
}

function candidateSummary(c: ExperimentCandidateResult): Record<string, unknown> {
  return {
    candidateId: c.candidateId,
    isBaseline: c.isBaseline,
    patch: c.patch,
    status: c.status,
    reason: c.reason,
    shipped: c.shipped,
    backlog: c.backlog,
    makespanMs: c.makespanMs,
    totalWaitMs: c.totalWaitMs,
  };
}

export class InvestigationStore {
  readonly investigations = new Map<string, InvestigationRecord>();

  constructor(
    private readonly config: ApiConfig,
    private readonly hooks: {
      beforeDispatch?: (record: InvestigationRecord) => void;
      isLegacyBusy?: () => boolean;
    } = {},
  ) {}

  get(id: string): InvestigationRecord | undefined {
    return this.investigations.get(id);
  }

  hasActive(): boolean {
    for (const r of this.investigations.values()) if (r.state === "RUNNING") return true;
    return false;
  }

  private effectiveLimits(): { maxRequests: number; maxExperiments: number } {
    return {
      maxRequests: Math.min(this.config.maxRequests, MAX_INVESTIGATION_REQUESTS),
      maxExperiments: Math.min(this.config.maxProposals, MAX_INVESTIGATION_EXPERIMENTS),
    };
  }

  create(input: InvestigationInput, budgetClaimId: string | null): InvestigationRecord {
    // Bounded memory: evict oldest terminal records past the shared run cap.
    if (this.investigations.size >= this.config.maxRuns) {
      let oldest: string | null = null;
      let oldestAt = "";
      for (const [id, r] of this.investigations) {
        if (r.state === "RUNNING") continue;
        if (oldest === null || r.createdAt < oldestAt) { oldest = id; oldestAt = r.createdAt; }
      }
      if (oldest !== null) {
        const r = this.investigations.get(oldest);
        if (r?.deadlineTimer) clearTimeout(r.deadlineTimer);
        this.investigations.delete(oldest);
      }
    }
    if (this.investigations.size >= this.config.maxRuns) {
      throw apiError("RUN_STORE_FULL", 429, "Investigation store is full; retry after older investigations expire.");
    }
    let active = 0;
    for (const r of this.investigations.values()) if (r.state === "RUNNING") active++;
    if (active >= this.config.concurrency || this.hooks.isLegacyBusy?.()) {
      throw apiError("CONCURRENCY_LIMIT", 429, "Server is busy (concurrency limit); retry shortly.");
    }
    const now = new Date();
    const record: InvestigationRecord = {
      id: globalThis.crypto.randomUUID(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.timeoutMs).toISOString(),
      completedAt: null,
      state: "RUNNING",
      phase: "EVALUATING_BASELINE",
      input: structuredClone(input),
      comparison: null,
      executed: [],
      trace: [],
      requests: [],
      rejected: [],
      modelRequestsUsed: 0,
      experimentsUsed: 0,
      modelSelectedCandidateId: null,
      recommendation: null,
      outcome: null,
      lastError: null,
      returnedModel: null,
      budgetClaimId,
      controller: new AbortController(),
      deadlineTimer: null,
      cancelled: false,
    };
    this.investigations.set(record.id, record);
    record.deadlineTimer = setTimeout(() => {
      record.controller.abort();
      if (record.state === "RUNNING") {
        record.state = "TIMED_OUT";
        record.completedAt = new Date().toISOString();
        record.lastError = "Investigation deadline exceeded; no further inference allowed.";
        this.finishFallback(record, "timed-out");
      }
    }, Math.max(1, Date.parse(record.expiresAt) - Date.now()));
    (record.deadlineTimer as unknown as { unref?: () => void }).unref?.();
    return record;
  }

  start(record: InvestigationRecord, fetchImpl: FetchLike): void {
    void this.runLoop(record, fetchImpl).catch((e: unknown) => {
      if (record.state === "RUNNING") {
        record.state = "FAILED";
        record.completedAt = new Date().toISOString();
        record.lastError = sanitizeMessage(e instanceof Error ? e.message : "Investigation failed unexpectedly.", this.config);
        this.finishFallback(record, "failed");
      }
    });
  }

  cancel(id: string): InvestigationRecord {
    const record = this.investigations.get(id);
    if (!record) throw apiError("UNKNOWN_INVESTIGATION", 404, "Unknown investigation id.");
    if (record.state !== "RUNNING") throw apiError("RUN_CLOSED", 409, `Investigation is already ${record.state}; it cannot be cancelled or restarted.`);
    record.cancelled = true;
    record.controller.abort();
    record.state = "CANCELLED";
    record.completedAt = new Date().toISOString();
    record.lastError = "Investigation cancelled; future model dispatch stopped, evidence and budget claim preserved.";
    this.finishFallback(record, "cancelled");
    if (record.deadlineTimer) clearTimeout(record.deadlineTimer);
    return record;
  }

  private died(record: InvestigationRecord): boolean {
    return record.controller.signal.aborted || record.state !== "RUNNING" || Date.now() >= Date.parse(record.expiresAt);
  }

  private settleDeath(record: InvestigationRecord): void {
    if (record.state !== "RUNNING") return;
    record.state = record.cancelled ? "CANCELLED" : "TIMED_OUT";
    record.completedAt = new Date().toISOString();
    record.lastError =
      record.state === "CANCELLED"
        ? "Investigation cancelled; in-flight result discarded, evidence and budget claim preserved."
        : "Investigation deadline exceeded; in-flight result discarded, no further inference allowed.";
    this.finishFallback(record, record.state === "CANCELLED" ? "cancelled" : "timed-out");
  }

  private trace(record: InvestigationRecord, entry: Omit<InvestigationTraceEntry, "seq">): void {
    record.trace.push({ seq: record.trace.length + 1, ...entry });
  }

  // Deterministic fallback is always labeled as such, never as a model pick.
  private finishFallback(record: InvestigationRecord, outcome: string): void {
    if (record.recommendation || !record.comparison) return;
    const best = record.comparison.selectedCandidateId;
    if (best === null) return;
    const cand = record.comparison.candidates.find((c) => c.candidateId === best);
    if (!cand || !VALID_CANDIDATE.has(cand.status)) return;
    record.recommendation = buildRecommendation(record.comparison, best, "deterministic-fallback", record.modelSelectedCandidateId);
    this.trace(record, {
      kind: "recommendation", requestIndex: null, candidateId: best, patch: null,
      hypothesis: null, hypothesisKind: null, status: "deterministic-fallback",
      reason: `no valid model finish; deterministic E3 best-found selected (${outcome})`,
      shipped: cand.shipped, makespanMs: cand.makespanMs, totalWaitMs: cand.totalWaitMs, backlog: cand.backlog,
    });
  }

  private complete(record: InvestigationRecord, outcome: string): void {
    record.phase = "FINALIZING";
    record.state = "COMPLETED";
    record.outcome = outcome;
    record.completedAt = new Date().toISOString();
    if (record.deadlineTimer) clearTimeout(record.deadlineTimer);
  }

  private fail(record: InvestigationRecord, message: string, outcome = "failed"): void {
    record.state = "FAILED";
    record.outcome = outcome;
    record.lastError = sanitizeMessage(message, this.config).slice(0, 1000);
    record.completedAt = new Date().toISOString();
    this.finishFallback(record, outcome);
    if (record.deadlineTimer) clearTimeout(record.deadlineTimer);
  }

  private async runLoop(record: InvestigationRecord, fetchImpl: FetchLike): Promise<void> {
    const { config } = this;
    const limits = this.effectiveLimits();
    const live = liveAvailable(config);
    if (!live.ok) {
      this.fail(record, live.reason ?? "Live inference unavailable.", "setup-required");
      return;
    }
    // Baseline runs locally BEFORE any paid dispatch. An invalid baseline
    // ends the investigation with zero model requests.
    record.phase = "EVALUATING_BASELINE";
    let comparison: OperationsExperimentResult;
    try {
      comparison = runOperationsExperiment({
        scenario: record.input.scenario,
        executionConfig: record.input.executionConfig,
        interventionPolicy: record.input.interventionPolicy,
        safetyCeilingMs: record.input.safetyCeilingMs,
        candidates: [{ candidateId: "baseline", patch: {} }],
      });
    } catch (e) {
      this.fail(record, `baseline experiment failed: ${e instanceof Error ? e.message : "engine error"}`, "baseline-failed");
      return;
    }
    record.comparison = comparison;
    const baseline = comparison.candidates.find((c) => c.candidateId === comparison.baselineCandidateId) as ExperimentCandidateResult;
    this.trace(record, {
      kind: "baseline", requestIndex: null, candidateId: baseline.candidateId, patch: baseline.patch,
      hypothesis: null, hypothesisKind: null, status: baseline.status, reason: baseline.reason,
      shipped: baseline.shipped, makespanMs: baseline.makespanMs, totalWaitMs: baseline.totalWaitMs, backlog: baseline.backlog,
    });
    if (!VALID_CANDIDATE.has(baseline.status)) {
      this.fail(record, `baseline is ${baseline.status}: ${baseline.reason ?? "no valid baseline"}; refusing inference`, "baseline-invalid");
      return;
    }
    if (this.died(record)) { this.settleDeath(record); return; }

    while (record.modelRequestsUsed < limits.maxRequests) {
      if (this.died(record)) { this.settleDeath(record); return; }
      const current = record.comparison as OperationsExperimentResult;
      const payload = {
        question: record.input.question,
        interventionPolicy: record.input.interventionPolicy,
        operationalContext: operationalContextOf(record.input.scenario, record.input.executionConfig),
        baseline: candidateSummary(current.candidates.find((c) => c.candidateId === current.baselineCandidateId) as ExperimentCandidateResult),
        results: current.candidates.map(candidateSummary),
        rejectedProposals: record.rejected,
        finishCandidateIds: current.rankedCandidateIds,
        experimentsRemaining: limits.maxExperiments - record.experimentsUsed,
        modelRequestsRemainingIncludingThisOne: limits.maxRequests - record.modelRequestsUsed,
      };
      const userContent = `Investigation feedback: ${JSON.stringify(payload)}\nReturn the operations_investigation_action JSON object only.`;
      // Context cap enforced BEFORE any dispatch (and before the claim is
      // touched): an oversized payload fails locally with zero new requests.
      if (userContent.length > config.maxContextChars) {
        this.fail(record, `model context exceeds bound (${userContent.length} > ${config.maxContextChars} chars); refusing inference`, "context-bound-exceeded");
        return;
      }
      // Persisted model-derived diagnostics are bounded and redacted.
      const boundReason = (s: string): string => sanitizeMessage(s, config).slice(0, 500);
      const requestRecord: InvestigationRequestRecord = {
        index: record.modelRequestsUsed + 1, status: "dispatched", responseId: null, usage: null,
        finishReason: null, durationMs: null, model: null, errorCode: null, error: null,
      };
      // Revalidate the durable claim immediately before EVERY dispatch.
      try {
        this.hooks.beforeDispatch?.(record);
      } catch (e) {
        const err = e as ApiErrorLike & { code?: string };
        requestRecord.status = "guard-refused";
        requestRecord.errorCode = err.code ?? "BUDGET_GUARD_UNAVAILABLE";
        requestRecord.error = sanitizeMessage(err instanceof Error ? err.message : "Budget guard unavailable.", config).slice(0, 500);
        record.requests.push(requestRecord);
        this.fail(record, requestRecord.error, "budget-guard-refused");
        return;
      }
      // Count the attempt BEFORE sending; every dispatched request (success,
      // timeout, malformed output) consumes the request budget and the claim.
      record.modelRequestsUsed++;
      record.requests.push(requestRecord);
      record.phase = "REQUESTING_MODEL";
      let result;
      try {
        result = await chatCompletionJson(
          config,
          {
            schemaName: "operations_investigation_action",
            schema: INVESTIGATION_ACTION_JSON_SCHEMA,
            developerInstruction:
              "You are LayoutLab's bounded operations investigator. Choose exactly ONE action as JSON. " +
              "action run_experiment proposes ONE experiment patch: include ALL keys (action, hypothesis, the five patch fields, candidateId); " +
              "set unchanged patch fields to null, candidateId to null. action finish recommends one existing candidate: candidateId names an id from finishCandidateIds, every patch field null. " +
              "hypothesis is your model assertion (a guess to test), NOT measured proof; server feedback metrics are the only measurements. " +
              "operationalContext describes the frozen current configuration (resource service durations are declared service assumptions, not measurements); results are actual engine measurements. " +
              "Use only patch fields allowed by interventionPolicy; staffing/service changes not listed there will be denied and retained as invalid. " +
              "Do not invent metrics, candidate ids, or interventions outside the five patch fields. No prose, no extra keys.",
            userContent,
          },
          record.controller.signal,
          fetchImpl,
        );
      } catch (e) {
        const err = e as ApiErrorLike & { diagnostics?: ProviderDiagnostics };
        requestRecord.durationMs = err.diagnostics?.durationMs ?? null;
        requestRecord.responseId = err.diagnostics?.responseId ?? null;
        requestRecord.finishReason = err.diagnostics?.finishReason ?? null;
        requestRecord.usage = err.diagnostics?.usage ?? null;
        requestRecord.model = err.diagnostics?.model ?? null;
        if (err.diagnostics?.model) record.returnedModel = err.diagnostics.model;
        requestRecord.errorCode = err.code ?? "TRANSPORT_ERROR";
        requestRecord.error = sanitizeMessage(err instanceof Error ? err.message : "Provider request failed.", config).slice(0, 500);
        if (this.died(record)) {
          requestRecord.status = "aborted";
          this.settleDeath(record);
          return;
        }
        requestRecord.status = "transport-error";
        this.fail(record, `provider request ${requestRecord.index} failed (${requestRecord.errorCode}): ${requestRecord.error}`, "provider-error");
        return;
      }
      requestRecord.status = "ok";
      requestRecord.responseId = result.responseId;
      requestRecord.usage = result.usage;
      requestRecord.finishReason = result.finishReason;
      requestRecord.durationMs = result.durationMs;
      requestRecord.model = result.model;
      record.returnedModel = result.model;
      if (this.died(record)) { this.settleDeath(record); return; }

      let action: ModelAction;
      try {
        action = parseModelAction(result.parsed);
      } catch (e) {
        // Malformed/invalid proposals are counted, preserved, and explained
        // to the model on the next request; never silently replaced.
        const reason = boundReason(`invalid action rejected: ${e instanceof Error ? e.message : "action failed validation"}`);
        requestRecord.status = "invalid-action";
        requestRecord.errorCode = "INVALID_ACTION";
        requestRecord.error = reason;
        record.rejected.push({ requestIndex: requestRecord.index, reason });
        this.trace(record, {
          kind: "proposal", requestIndex: requestRecord.index, candidateId: null, patch: null,
          hypothesis: null, hypothesisKind: null, status: "rejected", reason,
          shipped: null, makespanMs: null, totalWaitMs: null, backlog: null,
        });
        continue;
      }

      const hypothesis = action.hypothesis === null ? null : boundReason(action.hypothesis);
      if (action.kind === "run_experiment") {
        const reject = (rawReason: string): void => {
          const reason = boundReason(rawReason);
          record.rejected.push({ requestIndex: requestRecord.index, reason });
          this.trace(record, {
            kind: "proposal", requestIndex: requestRecord.index, candidateId: null, patch: action.patch,
            hypothesis, hypothesisKind: hypothesis ? HYPOTHESIS_KIND : null,
            status: "rejected", reason, shipped: null, makespanMs: null, totalWaitMs: null, backlog: null,
          });
        };
        if (record.experimentsUsed >= limits.maxExperiments) {
          reject(`experiment cap reached (${limits.maxExperiments} proposed alternatives); choose finish with an existing candidateId`);
          continue;
        }
        if (isNoChangePatch(action.patch)) {
          reject("no-change patch duplicates the baseline; it was already measured and is not rerun");
          continue;
        }
        const duplicate = record.executed.find((x) => canonicalPatch(x.patch) === canonicalPatch(action.patch));
        if (duplicate) {
          reject(`duplicate patch already measured as ${duplicate.candidateId}; its result stays visible in the feedback`);
          continue;
        }
        record.experimentsUsed++;
        const candidateId = `exp-${record.experimentsUsed}`;
        record.executed.push({ candidateId, patch: action.patch });
        this.trace(record, {
          kind: "proposal", requestIndex: requestRecord.index, candidateId, patch: action.patch,
          hypothesis, hypothesisKind: hypothesis ? HYPOTHESIS_KIND : null,
          status: "accepted", reason: null, shipped: null, makespanMs: null, totalWaitMs: null, backlog: null,
        });
        record.phase = "EVALUATING_EXPERIMENT";
        // Execute through the E3 engine: policy violations and infeasible
        // geometry are retained as invalid candidates, never invented away.
        record.comparison = runOperationsExperiment({
          scenario: record.input.scenario,
          executionConfig: record.input.executionConfig,
          interventionPolicy: record.input.interventionPolicy,
          safetyCeilingMs: record.input.safetyCeilingMs,
          candidates: [
            { candidateId: "baseline", patch: {} },
            ...record.executed.map((x) => ({ candidateId: x.candidateId, patch: x.patch })),
          ],
        });
        const cand = record.comparison.candidates.find((c) => c.candidateId === candidateId) as ExperimentCandidateResult;
        this.trace(record, {
          kind: "experiment", requestIndex: requestRecord.index, candidateId, patch: cand.patch,
          hypothesis: null, hypothesisKind: null, status: cand.status, reason: cand.reason,
          shipped: cand.shipped, makespanMs: cand.makespanMs, totalWaitMs: cand.totalWaitMs, backlog: cand.backlog,
        });
        continue;
      }

      // finish(candidateId): the id must reference an existing valid candidate.
      const currentNow = record.comparison as OperationsExperimentResult;
      const target = currentNow.candidates.find((c) => c.candidateId === action.candidateId);
      if (!target) {
        const reason = boundReason(`finish rejected: candidateId ${action.candidateId} does not exist (fabricated or unknown id); existing ids: ${currentNow.candidates.map((c) => c.candidateId).join(", ")}`);
        record.rejected.push({ requestIndex: requestRecord.index, reason });
        this.trace(record, {
          kind: "finish", requestIndex: requestRecord.index, candidateId: action.candidateId, patch: null,
          hypothesis, hypothesisKind: hypothesis ? HYPOTHESIS_KIND : null,
          status: "rejected", reason, shipped: null, makespanMs: null, totalWaitMs: null, backlog: null,
        });
        continue;
      }
      if (!VALID_CANDIDATE.has(target.status)) {
        const reason = boundReason(`finish rejected: candidate ${target.candidateId} is ${target.status} (${target.reason ?? "not valid"}); only valid candidates can be recommended`);
        record.rejected.push({ requestIndex: requestRecord.index, reason });
        this.trace(record, {
          kind: "finish", requestIndex: requestRecord.index, candidateId: action.candidateId, patch: null,
          hypothesis, hypothesisKind: hypothesis ? HYPOTHESIS_KIND : null,
          status: "rejected", reason, shipped: target.shipped, makespanMs: target.makespanMs, totalWaitMs: target.totalWaitMs, backlog: target.backlog,
        });
        continue;
      }
      record.modelSelectedCandidateId = action.candidateId;
      record.recommendation = buildRecommendation(currentNow, action.candidateId, "model", action.candidateId);
      this.trace(record, {
        kind: "finish", requestIndex: requestRecord.index, candidateId: action.candidateId, patch: null,
        hypothesis, hypothesisKind: hypothesis ? HYPOTHESIS_KIND : null,
        status: "accepted", reason: null,
        shipped: target.shipped, makespanMs: target.makespanMs, totalWaitMs: target.totalWaitMs, backlog: target.backlog,
      });
      this.trace(record, {
        kind: "recommendation", requestIndex: requestRecord.index, candidateId: action.candidateId, patch: null,
        hypothesis: null, hypothesisKind: null, status: "model",
        reason: record.recommendation.explanation,
        shipped: target.shipped, makespanMs: target.makespanMs, totalWaitMs: target.totalWaitMs, backlog: target.backlog,
      });
      this.complete(record, "model-recommendation");
      return;
    }

    // Request budget exhausted without a valid finish: honest fallback.
    this.finishFallback(record, "requests-exhausted");
    this.complete(record, "deterministic-fallback-requests-exhausted");
  }

  buildReport(record: InvestigationRecord): InvestigationReport {
    const limits = this.effectiveLimits();
    const comparison = record.comparison ? structuredClone(record.comparison) : null;
    return {
      schema: INVESTIGATION_SCHEMA,
      investigationId: record.id,
      runId: record.id,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      state: record.state,
      outcome: record.outcome,
      lastError: record.lastError,
      input: structuredClone(record.input),
      scenarioId: record.input.scenario.id,
      seed: record.input.scenario.seed,
      versions: {
        simulation: SIMULATION_VERSION,
        operationsSchema: OPERATIONS_SCHEMA_VERSION,
        operationsEngine: OPERATIONS_ENGINE_VERSION,
        evaluator: INVESTIGATION_SCHEMA,
        experimentSchema: comparison?.schema ?? OPERATIONS_EXPERIMENT_SCHEMA,
        api: API_VERSION,
        prompt: INVESTIGATION_PROMPT_VERSION,
      },
      provider: "meta",
      providerKind: this.config.providerKind,
      configuredModel: this.config.modelId,
      returnedModel: record.returnedModel,
      realMetaRequests: this.config.providerKind === "meta" ? record.modelRequestsUsed : 0,
      limits: {
        maxModelRequests: limits.maxRequests,
        maxExperiments: limits.maxExperiments,
        maxCompletionTokens: this.config.maxCompletionTokens,
        timeoutMs: this.config.timeoutMs,
      },
      budget: {
        publicBudgetPerRunUsd: this.config.publicBudgetPerRunUsd,
        claimId: record.budgetClaimId,
        accounting:
          "one publicBudgetPerRunUsd conservative claim holds the whole investigation; it is committed in full after any dispatched request and released only when zero requests were dispatched. It is not an invoice or a confirmed provider price.",
      },
      requestCount: record.modelRequestsUsed,
      experimentCount: record.experimentsUsed,
      requests: structuredClone(record.requests),
      trace: structuredClone(record.trace),
      comparison,
      recommendation: record.recommendation ? structuredClone(record.recommendation) : null,
      assumptions: [
        "synthetic scenario: all workload, geometry and service values are constructed test inputs, not calibrated measurements",
        "service-duration patch values are synthetic service assumptions, not measured money or time savings",
        "hypotheses are model assertions, not measured causal proof; only engine feedback metrics are measurements",
        "inference provenance is recorded metadata only; offline verification reruns the engine and does not authenticate live inference",
      ],
      limitations: [
        "in-memory investigation state: no durable resume after a server restart",
        "staffing clones may be infeasible on current geometry; such candidates stay invalid and are never quietly relaxed",
        "no traffic/picking-policy or assignment interventions exist beyond the five patch fields",
      ],
    };
  }

  toSummary(record: InvestigationRecord): Record<string, unknown> {
    const limits = this.effectiveLimits();
    const terminalState = record.state !== "RUNNING";
    const report = terminalState ? this.buildReport(record) : null;
    return {
      runId: record.id,
      investigationId: record.id,
      state: record.state,
      phase: record.phase,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      completedAt: record.completedAt,
      provider: "meta",
      providerKind: this.config.providerKind,
      realMetaRequests: this.config.providerKind === "meta" ? record.modelRequestsUsed : 0,
      configuredModel: this.config.modelId,
      returnedModel: record.returnedModel,
      requestCount: record.modelRequestsUsed,
      experimentCount: record.experimentsUsed,
      limits: { maxModelRequests: limits.maxRequests, maxExperiments: limits.maxExperiments, timeoutMs: this.config.timeoutMs },
      trace: structuredClone(record.trace),
      requests: structuredClone(record.requests),
      recommendation: record.recommendation ? structuredClone(record.recommendation) : null,
      outcome: record.outcome,
      lastError: record.lastError,
      result: report,
      report,
    };
  }
}

// --- Offline verification -------------------------------------------------------
// Strict report-envelope + evidence verification. Reruns the E3 engine only
// (via verifyOperationsExperiment): this proves the saved measurements and
// recommendation arithmetic follow from the embedded synthetic inputs and
// that the envelope/trace are internally consistent. It does NOT
// authenticate live inference: provider provenance is recorded metadata.
// Missing mandatory evidence fails; it is never defaulted or invented.

const REPORT_KEYS = [
  "schema", "investigationId", "runId", "createdAt", "completedAt", "state", "outcome", "lastError",
  "input", "scenarioId", "seed", "versions", "provider", "providerKind", "configuredModel", "returnedModel",
  "realMetaRequests", "limits", "budget", "requestCount", "experimentCount", "requests", "trace",
  "comparison", "recommendation", "assumptions", "limitations",
];
const VERSION_KEYS = ["simulation", "operationsSchema", "operationsEngine", "evaluator", "experimentSchema", "api", "prompt"];
const LIMIT_KEYS = ["maxModelRequests", "maxExperiments", "maxCompletionTokens", "timeoutMs"];
const BUDGET_KEYS = ["publicBudgetPerRunUsd", "claimId", "accounting"];
const REQUEST_KEYS = ["index", "status", "responseId", "usage", "finishReason", "durationMs", "model", "errorCode", "error"];
const TRACE_KEYS = ["seq", "kind", "requestIndex", "candidateId", "patch", "hypothesis", "hypothesisKind", "status", "reason", "shipped", "makespanMs", "totalWaitMs", "backlog"];
const RECOMMENDATION_KEYS = ["candidateId", "source", "modelSelectedCandidateId", "deterministicBestCandidateId", "baselineCandidateId", "improvedOverBaseline", "comparisons", "explanation"];
const COMPARISONS_KEYS = ["baselineCandidateId", "candidateId", "shippedDelta", "makespanDeltaMs", "makespanImprovementPercent", "totalWaitDeltaMs", "totalWaitImprovementPercent"];
const REQUEST_STATUSES = new Set(["dispatched", "ok", "invalid-action", "transport-error", "aborted", "guard-refused"]);
const TRACE_KINDS = new Set(["baseline", "proposal", "experiment", "finish", "recommendation"]);
const INVESTIGATION_STATES = new Set(["RUNNING", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function hasExactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(obj).sort();
  const want = [...keys].sort();
  return actual.length === want.length && actual.every((k, i) => k === want[i]);
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}
function isIntOrNull(v: unknown): boolean {
  return v === null || (typeof v === "number" && Number.isSafeInteger(v));
}
function isStrOrNull(v: unknown, max = 2000): boolean {
  return v === null || (typeof v === "string" && v.length <= max);
}

export function verifyInvestigationExport(exported: unknown): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const bad = (m: string): void => { mismatches.push(m); };
  if (!isRecord(exported)) return { ok: false, mismatches: ["investigation export must be an object"] };
  const exp = exported as unknown as InvestigationReport;
  const raw = exported;

  // No secrets may travel in an export.
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (lk === "authorization" || lk === "apikey" || lk === "api_key" || lk === "model_api_key") bad(`secret-bearing key exported: ${k}`);
      walk(val);
    }
  };
  walk(exported);

  // --- Strict envelope -----------------------------------------------------
  if (!hasExactKeys(raw, REPORT_KEYS)) bad(`report envelope keys must be exactly ${REPORT_KEYS.join(",")}`);
  if (exp.schema !== INVESTIGATION_SCHEMA) bad(`unsupported investigation schema ${String(exp.schema)}`);
  if (typeof exp.investigationId !== "string" || exp.investigationId.length === 0) bad("investigationId must be a non-empty string");
  if (exp.runId !== exp.investigationId) bad("runId must equal investigationId");
  if (typeof exp.createdAt !== "string" || exp.createdAt.length === 0) bad("createdAt must be a non-empty string");
  if (!INVESTIGATION_STATES.has(exp.state)) bad(`state invalid: ${String(exp.state)}`);
  if (exp.state !== "RUNNING" && (typeof exp.completedAt !== "string" || exp.completedAt.length === 0)) {
    bad("completedAt is mandatory for a terminal investigation");
  }
  if (!isStrOrNull(exp.completedAt) || !isStrOrNull(exp.outcome, 200) || !isStrOrNull(exp.lastError, 2000)) bad("completedAt/outcome/lastError have invalid shapes");
  if (exp.provider !== "meta") bad("provider must be meta");
  if (exp.providerKind !== "meta" && exp.providerKind !== "fixture" && exp.providerKind !== "unsupported") bad(`providerKind invalid: ${String(exp.providerKind)}`);
  if (typeof exp.configuredModel !== "string" || exp.configuredModel.length === 0 || exp.configuredModel.length > 128) bad("configuredModel must be a non-empty string");
  if (!isStrOrNull(exp.returnedModel, 128)) bad("returnedModel must be a string or null");
  if (!Array.isArray(exp.assumptions) || exp.assumptions.some((a) => typeof a !== "string") ||
      !Array.isArray(exp.limitations) || exp.limitations.some((a) => typeof a !== "string")) {
    bad("assumptions/limitations must be string arrays");
  }

  // Declared versions must be the current accepted versions, not invented.
  if (!isRecord(raw["versions"]) || !hasExactKeys(raw["versions"], VERSION_KEYS)) {
    bad("versions envelope is missing or has wrong keys");
  } else {
    const wantVersions: Record<string, string> = {
      simulation: SIMULATION_VERSION,
      operationsSchema: OPERATIONS_SCHEMA_VERSION,
      operationsEngine: OPERATIONS_ENGINE_VERSION,
      evaluator: INVESTIGATION_SCHEMA,
      experimentSchema: OPERATIONS_EXPERIMENT_SCHEMA,
      api: API_VERSION,
      prompt: INVESTIGATION_PROMPT_VERSION,
    };
    for (const k of VERSION_KEYS) {
      if ((raw["versions"] as Record<string, unknown>)[k] !== wantVersions[k]) bad(`versions.${k}: saved ${String((raw["versions"] as Record<string, unknown>)[k])} != current ${wantVersions[k]}`);
    }
  }

  // Input envelope + full reparse.
  let parsedScenario: OperationsScenario | null = null;
  let parsedConfig: OperationsExecutionConfig | null = null;
  let parsedPolicy: InterventionPolicy | null = null;
  if (!isRecord(raw["input"]) || !hasExactKeys(raw["input"], INPUT_KEYS)) {
    bad("input envelope is missing or has wrong keys");
  } else {
    const input = raw["input"];
    if (typeof input["question"] !== "string" || (input["question"] as string).trim().length === 0 || (input["question"] as string).length > 2000) bad("input.question must be 1..2000 characters");
    if (input["mode"] !== "live" || input["consent"] !== true) bad("input must record mode live and consent true");
    if (!Number.isSafeInteger(input["safetyCeilingMs"]) || (input["safetyCeilingMs"] as number) < 1 || (input["safetyCeilingMs"] as number) > 2_147_483_647) bad("input.safetyCeilingMs out of range");
    try {
      parsedScenario = parseOperationsScenario(structuredClone(input["scenario"]));
      parsedConfig = parseOperationsExecutionConfig(structuredClone(input["executionConfig"]));
      parsedPolicy = parseInterventionPolicy(structuredClone(input["interventionPolicy"]));
    } catch (e) {
      bad(`input reparse failed: ${e instanceof Error ? e.message : "invalid input"}`);
    }
    if (parsedScenario) {
      if (exp.scenarioId !== parsedScenario.id) bad("scenarioId differs from input scenario");
      if (exp.seed !== parsedScenario.seed) bad("seed differs from input scenario");
    }
  }

  // Declared limits: hard caps AND the declared (possibly lower) limits.
  let limitsOk = false;
  if (!isRecord(raw["limits"]) || !hasExactKeys(raw["limits"], LIMIT_KEYS)) {
    bad("limits envelope is missing or has wrong keys");
  } else {
    const l = raw["limits"] as Record<string, unknown>;
    const intIn = (v: unknown, min: number, max: number): boolean => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
    if (!intIn(l["maxModelRequests"], 0, MAX_INVESTIGATION_REQUESTS)) bad("limits.maxModelRequests must be an integer in 0..4");
    if (!intIn(l["maxExperiments"], 0, MAX_INVESTIGATION_EXPERIMENTS)) bad("limits.maxExperiments must be an integer in 0..3");
    if (!intIn(l["maxCompletionTokens"], 1, 2000)) bad("limits.maxCompletionTokens must be an integer in 1..2000");
    if (!intIn(l["timeoutMs"], 1, 120000)) bad("limits.timeoutMs must be an integer in 1..120000");
    limitsOk = intIn(l["maxModelRequests"], 0, MAX_INVESTIGATION_REQUESTS) && intIn(l["maxExperiments"], 0, MAX_INVESTIGATION_EXPERIMENTS);
  }
  if (!isRecord(raw["budget"]) || !hasExactKeys(raw["budget"], BUDGET_KEYS)) {
    bad("budget envelope is missing or has wrong keys");
  } else {
    const b = raw["budget"] as Record<string, unknown>;
    if (typeof b["publicBudgetPerRunUsd"] !== "number" || !Number.isFinite(b["publicBudgetPerRunUsd"]) || (b["publicBudgetPerRunUsd"] as number) <= 0) bad("budget.publicBudgetPerRunUsd must be a positive number");
    if (!isStrOrNull(b["claimId"], 256)) bad("budget.claimId must be a string or null");
    if (typeof b["accounting"] !== "string" || (b["accounting"] as string).length === 0) bad("budget.accounting must be a non-empty string");
  }

  // Request rows: exact shape, sequential indices, declared-limit counts.
  const requests = Array.isArray(exp.requests) ? exp.requests : null;
  if (!requests) {
    bad("requests must be an array");
  } else {
    if (requests.length > MAX_INVESTIGATION_REQUESTS) bad("requests exceed the 4-request hard cap");
    requests.forEach((r, i) => {
      if (!isRecord(r) || !hasExactKeys(r, REQUEST_KEYS)) { bad(`requests[${i}] envelope has wrong keys`); return; }
      if (r.index !== i + 1) bad(`requests[${i}].index must be ${i + 1}`);
      if (!REQUEST_STATUSES.has(r.status)) bad(`requests[${i}].status invalid: ${r.status}`);
      if (!isStrOrNull(r.responseId, 128) || !isStrOrNull(r.finishReason, 128) || !isStrOrNull(r.model, 128) || !isStrOrNull(r.errorCode, 128) || !isStrOrNull(r.error, 1000)) bad(`requests[${i}] diagnostics have invalid shapes`);
      if (!(r.durationMs === null || (typeof r.durationMs === "number" && r.durationMs >= 0))) bad(`requests[${i}].durationMs invalid`);
      if (r.usage !== null) {
        if (!isRecord(r.usage) || !hasExactKeys(r.usage, ["promptTokens", "completionTokens", "totalTokens"]) ||
            !isIntOrNull(r.usage["promptTokens"]) || !isIntOrNull(r.usage["completionTokens"]) || !isIntOrNull(r.usage["totalTokens"])) {
          bad(`requests[${i}].usage has invalid shape`);
        }
      }
    });
  }
  const dispatched = (requests ?? []).filter((r) => r.status !== "guard-refused");
  if (exp.requestCount !== dispatched.length) bad(`requestCount ${String(exp.requestCount)} != dispatched requests ${dispatched.length}`);
  if (limitsOk && dispatched.length > (exp.limits.maxModelRequests as number)) bad(`dispatched requests ${dispatched.length} exceed declared limits.maxModelRequests ${String(exp.limits.maxModelRequests)}`);
  const wantReal = exp.providerKind === "meta" ? dispatched.length : 0;
  if (exp.realMetaRequests !== wantReal) bad(`realMetaRequests ${String(exp.realMetaRequests)} != ${wantReal} for providerKind ${String(exp.providerKind)}`);
  const lastModel = [...(requests ?? [])].reverse().find((r) => r.model !== null)?.model ?? null;
  if (exp.returnedModel !== lastModel) bad(`returnedModel ${String(exp.returnedModel)} != last recorded request model ${String(lastModel)}`);

  // Comparison evidence (mandatory except a zero-request local failure).
  const comparison = exp.comparison;
  if (!comparison) {
    if (!(exp.state === "FAILED" && exp.requestCount === 0 && Array.isArray(exp.trace) && exp.trace.length === 0 && exp.recommendation === null)) {
      bad("comparison missing: mandatory baseline/comparison evidence is absent");
    }
    return { ok: mismatches.length === 0, mismatches };
  }
  const e3 = verifyOperationsExperiment(comparison);
  for (const m of e3.mismatches) bad(`comparison: ${m}`);
  // The COMPLETE parsed input must equal the E3 common inputs actually run.
  if (parsedScenario && canonicalJson(parsedScenario) !== canonicalJson(comparison.commonInputs.scenario)) bad("input scenario differs from comparison commonInputs.scenario (different frozen input than measured)");
  if (parsedConfig && canonicalJson(parsedConfig) !== canonicalJson(comparison.commonInputs.executionConfig)) bad("input executionConfig differs from comparison commonInputs.executionConfig");
  if (parsedPolicy && canonicalJson(parsedPolicy) !== canonicalJson(comparison.interventionPolicy)) bad("input interventionPolicy differs from comparison interventionPolicy");
  if (isRecord(raw["input"]) && raw["input"]["safetyCeilingMs"] !== comparison.terminationPolicy.safetyCeilingMs) bad("input safetyCeilingMs differs from comparison termination policy");

  const candById = new Map(comparison.candidates.map((c) => [c.candidateId, c]));
  const baseline = candById.get(comparison.baselineCandidateId);
  const alternatives = comparison.candidates.filter((c) => c.candidateId !== comparison.baselineCandidateId);
  if (alternatives.length > MAX_INVESTIGATION_EXPERIMENTS) bad("comparison holds more than 3 proposed alternatives plus baseline");
  if (limitsOk && alternatives.length > (exp.limits.maxExperiments as number)) bad(`comparison alternatives ${alternatives.length} exceed declared limits.maxExperiments ${String(exp.limits.maxExperiments)}`);
  if (exp.experimentCount !== alternatives.length) bad(`experimentCount ${String(exp.experimentCount)} != comparison alternatives ${alternatives.length}`);

  // --- Trace: strict entries, chronological seq/request links, bijection ---
  const trace = Array.isArray(exp.trace) ? exp.trace : null;
  if (!trace) {
    bad("trace must be an array");
    return { ok: mismatches.length === 0, mismatches };
  }
  const metricsEqual = (t: InvestigationTraceEntry, c: ExperimentCandidateResult): boolean =>
    t.shipped === c.shipped && t.makespanMs === c.makespanMs && t.totalWaitMs === c.totalWaitMs && t.backlog === c.backlog;
  let lastRequestIndex = 0;
  trace.forEach((t, i) => {
    if (!isRecord(t) || !hasExactKeys(t, TRACE_KEYS)) { bad(`trace[${i}] envelope has wrong keys`); return; }
    if (t.seq !== i + 1) bad(`trace[${i}].seq must be ${i + 1} (chronological)`);
    if (!TRACE_KINDS.has(t.kind)) bad(`trace[${i}].kind invalid: ${t.kind}`);
    if (typeof t.status !== "string" || t.status.length === 0) bad(`trace[${i}].status must be a non-empty string`);
    if (!isStrOrNull(t.reason, 5000)) bad(`trace[${i}].reason has invalid shape`);
    if (!isStrOrNull(t.candidateId, 128) || (t.candidateId !== null && t.candidateId.length === 0)) bad(`trace[${i}].candidateId has invalid shape`);
    if (!isStrOrNull(t.hypothesis, 500)) bad(`trace[${i}].hypothesis exceeds its bound`);
    if (t.hypothesis !== null && t.hypothesisKind !== HYPOTHESIS_KIND) bad(`trace[${i}] hypothesis is not labeled as a model assertion`);
    if (t.hypothesis === null && t.hypothesisKind !== null) bad(`trace[${i}].hypothesisKind must be null without a hypothesis`);
    if (!isIntOrNull(t.shipped) || !isIntOrNull(t.makespanMs) || !isIntOrNull(t.totalWaitMs) || !isIntOrNull(t.backlog)) bad(`trace[${i}] metrics have invalid shapes`);
    if (t.patch !== null) {
      try { parseOperationsPatch(structuredClone(t.patch)); } catch { bad(`trace[${i}].patch is not a valid bounded patch`); }
    }
    if (t.requestIndex !== null) {
      if (!Number.isSafeInteger(t.requestIndex) || t.requestIndex < 1 || t.requestIndex > (requests?.length ?? 0)) {
        bad(`trace[${i}].requestIndex ${String(t.requestIndex)} does not reference a recorded request`);
      } else {
        if (t.requestIndex < lastRequestIndex) bad(`trace[${i}].requestIndex breaks chronological order`);
        lastRequestIndex = t.requestIndex;
      }
    }
  });

  // Baseline: exactly one, first, fully equal to the E3 baseline candidate.
  const baselineEntries = trace.filter((t) => t.kind === "baseline");
  if (baselineEntries.length !== 1) bad(`trace must hold exactly one baseline entry, found ${baselineEntries.length}`);
  const baselineEntry = baselineEntries[0];
  if (baselineEntry && baseline) {
    if (baselineEntry.seq !== 1 || baselineEntry.requestIndex !== null) bad("baseline trace entry must be first with no request link");
    if (baselineEntry.candidateId !== comparison.baselineCandidateId) bad("baseline trace candidateId differs from comparison baseline");
    if (baselineEntry.status !== baseline.status || baselineEntry.reason !== baseline.reason) bad("baseline trace status/reason differ from comparison");
    if (canonicalJson(baselineEntry.patch) !== canonicalJson(baseline.patch)) bad("baseline trace patch differs from comparison");
    if (!metricsEqual(baselineEntry, baseline)) bad("baseline trace measurements differ from comparison");
  }

  // Bijection: every executed alternative has exactly one accepted proposal
  // and one experiment entry, linked to the same request, fully compared.
  const acceptedProposals = trace.filter((t) => t.kind === "proposal" && t.status === "accepted");
  const experimentEntries = trace.filter((t) => t.kind === "experiment");
  if (acceptedProposals.length !== alternatives.length) bad(`accepted proposals ${acceptedProposals.length} != executed alternatives ${alternatives.length}`);
  if (experimentEntries.length !== alternatives.length) bad(`experiment trace entries ${experimentEntries.length} != executed alternatives ${alternatives.length}`);
  for (const cand of alternatives) {
    const props = acceptedProposals.filter((t) => t.candidateId === cand.candidateId);
    const exps = experimentEntries.filter((t) => t.candidateId === cand.candidateId);
    if (props.length !== 1) { bad(`candidate ${cand.candidateId}: expected exactly one accepted proposal trace entry, found ${props.length}`); continue; }
    if (exps.length !== 1) { bad(`candidate ${cand.candidateId}: expected exactly one experiment trace entry, found ${exps.length}`); continue; }
    const prop = props[0] as InvestigationTraceEntry;
    const expEntry = exps[0] as InvestigationTraceEntry;
    if (prop.requestIndex === null || prop.requestIndex !== expEntry.requestIndex) bad(`candidate ${cand.candidateId}: proposal/experiment request links differ`);
    if (expEntry.seq <= prop.seq) bad(`candidate ${cand.candidateId}: experiment must follow its proposal`);
    if (canonicalJson(prop.patch) !== canonicalJson(cand.patch)) bad(`candidate ${cand.candidateId}: proposal patch differs from comparison patch`);
    if (canonicalJson(expEntry.patch) !== canonicalJson(cand.patch)) bad(`candidate ${cand.candidateId}: experiment patch differs from comparison patch`);
    if (expEntry.status !== cand.status || expEntry.reason !== cand.reason) bad(`candidate ${cand.candidateId}: experiment status/reason differ from comparison`);
    if (!metricsEqual(expEntry, cand)) bad(`candidate ${cand.candidateId}: experiment measurements differ from comparison`);
  }
  for (const t of acceptedProposals) {
    if (!t.candidateId || !candById.has(t.candidateId) || t.candidateId === comparison.baselineCandidateId) bad(`accepted proposal references non-alternative candidate ${String(t.candidateId)}`);
  }
  for (const t of experimentEntries) {
    if (!t.candidateId || !candById.has(t.candidateId)) bad(`experiment trace references unknown candidate ${String(t.candidateId)}`);
  }
  // Rejected proposals (incl. malformed actions): evidence with no candidate
  // and no claimed measurements.
  for (const t of trace.filter((x) => x.kind === "proposal" && x.status === "rejected")) {
    if (t.candidateId !== null) bad("rejected proposal must not reference a candidate");
    if (t.shipped !== null || t.makespanMs !== null || t.totalWaitMs !== null || t.backlog !== null) bad("rejected proposal must not claim measurements");
    if (typeof t.reason !== "string" || t.reason.length === 0) bad("rejected proposal must record its reason");
    if (t.requestIndex === null) bad("rejected proposal must link its model request");
  }
  for (const t of trace.filter((x) => x.kind === "proposal" && x.status !== "accepted" && x.status !== "rejected")) {
    bad(`proposal trace status invalid: ${t.status}`);
  }
  // Finish entries: accepted must target an existing valid candidate with
  // equal measurements. Rejected finishes are retained evidence and MAY
  // reference an unknown/rejected target (that is why they were rejected),
  // provided status/reason/request linkage is recorded.
  let acceptedFinish: InvestigationTraceEntry | null = null;
  for (const t of trace.filter((x) => x.kind === "finish")) {
    if (t.requestIndex === null) bad("finish trace entry must link its model request");
    if (!t.candidateId) { bad("finish trace entry must record its target candidateId"); continue; }
    const target = candById.get(t.candidateId);
    if (t.status === "accepted") {
      acceptedFinish = t;
      if (!target) bad(`accepted finish references unknown candidate ${t.candidateId}`);
      else {
        if (!VALID_CANDIDATE.has(target.status)) bad(`accepted finish target ${t.candidateId} is not valid (${target.status})`);
        if (!metricsEqual(t, target)) bad(`accepted finish measurements differ from candidate ${t.candidateId}`);
      }
    } else if (t.status === "rejected") {
      if (typeof t.reason !== "string" || t.reason.length === 0) bad("rejected finish must record its reason");
      if (target) {
        for (const f of ["shipped", "makespanMs", "totalWaitMs", "backlog"] as const) {
          if (t[f] !== null && t[f] !== target[f]) bad(`rejected finish measurements differ from candidate ${t.candidateId}`);
        }
      }
    } else {
      bad(`finish trace status invalid: ${t.status}`);
    }
  }

  // Recommendation evidence: existing valid candidate, server arithmetic.
  const rec = exp.recommendation;
  const recommendationEntries = trace.filter((t) => t.kind === "recommendation");
  if (rec) {
    if (!isRecord(rec) || !hasExactKeys(rec as unknown as Record<string, unknown>, RECOMMENDATION_KEYS)) bad("recommendation envelope has wrong keys");
    const cand = candById.get(rec.candidateId);
    if (!baseline || !cand) {
      bad(`recommendation references unknown candidate ${rec.candidateId}`);
    } else {
      if (!VALID_CANDIDATE.has(cand.status)) bad(`recommendation candidate ${rec.candidateId} is not valid (${cand.status})`);
      if (rec.baselineCandidateId !== comparison.baselineCandidateId) bad("recommendation baselineCandidateId differs from comparison");
      if (rec.deterministicBestCandidateId !== comparison.selectedCandidateId) {
        bad(`recommendation deterministicBestCandidateId ${String(rec.deterministicBestCandidateId)} != recomputed ${String(comparison.selectedCandidateId)}`);
      }
      if (!isRecord(rec.comparisons) || !hasExactKeys(rec.comparisons as unknown as Record<string, unknown>, COMPARISONS_KEYS)) bad("recommendation comparisons envelope has wrong keys");
      const want = computeComparisons(baseline, cand);
      if (canonicalJson(rec.comparisons) !== canonicalJson(want)) {
        bad(`recommendation comparisons differ from recomputed: saved ${canonicalJson(rec.comparisons)} != recomputed ${canonicalJson(want)}`);
      }
      const ranked = comparison.rankedCandidateIds;
      const wantImproved =
        rec.candidateId !== comparison.baselineCandidateId && ranked.includes(rec.candidateId) &&
        ranked.includes(comparison.baselineCandidateId) && ranked.indexOf(rec.candidateId) < ranked.indexOf(comparison.baselineCandidateId);
      if (rec.improvedOverBaseline !== wantImproved) bad("recommendation improvedOverBaseline differs from recomputed ranking");
      if (rec.explanation !== buildExplanation(cand, baseline, want, wantImproved)) {
        bad("recommendation explanation differs from server-computed contrast (fabricated or stale numbers)");
      }
      if (rec.source === "model") {
        if (rec.modelSelectedCandidateId !== rec.candidateId) bad("model recommendation must name its model-selected candidate");
        if (!acceptedFinish || acceptedFinish.candidateId !== rec.candidateId) bad("model recommendation has no accepted finish trace entry for its candidate");
      } else if (rec.source === "deterministic-fallback") {
        if (rec.candidateId !== rec.deterministicBestCandidateId) bad("fallback recommendation must select the deterministic best-found candidate");
        if (rec.modelSelectedCandidateId !== null && rec.modelSelectedCandidateId !== rec.candidateId) {
          const modelCand = comparison.candidates.find((c) => c.candidateId === rec.modelSelectedCandidateId);
          if (!modelCand) bad("fallback records a fabricated model-selected candidate");
        }
      } else {
        bad(`recommendation source invalid: ${String(rec.source)}`);
      }
      // Recommendation trace mirrors the recommendation exactly.
      if (recommendationEntries.length !== 1) bad(`expected exactly one recommendation trace entry, found ${recommendationEntries.length}`);
      const recEntry = recommendationEntries[0];
      if (recEntry) {
        if (recEntry.candidateId !== rec.candidateId || recEntry.status !== rec.source) bad("recommendation trace differs from recommendation");
        if (!metricsEqual(recEntry, cand)) bad("recommendation trace measurements differ from its candidate");
        if (rec.source === "model" && acceptedFinish && recEntry.requestIndex !== acceptedFinish.requestIndex) bad("model recommendation trace must link the accepted finish request");
        if (rec.source === "deterministic-fallback" && recEntry.requestIndex !== null) bad("fallback recommendation trace must not claim a model request");
      }
    }
  } else {
    if (recommendationEntries.length !== 0) bad("recommendation trace exists without a recommendation");
    if (exp.state === "COMPLETED") bad("completed investigation must carry a recommendation (model or labeled fallback)");
  }
  return { ok: mismatches.length === 0, mismatches };
}
