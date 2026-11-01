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
  parseProposal,
  parseRequirements,
  parseScenario,
  REPORT_VERSION,
  ROUTE_POLICY_ID,
  type Assignment,
  type CandidateResult,
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

// Brief section 22 execution phases (heuristic is M4 and stays absent).
export type RunPhase =
  | "VALIDATING_INPUT"
  | "INTERPRETING"
  | "AWAITING_APPROVAL"
  | "EVALUATING_BASELINE"
  | "REQUESTING_PROPOSAL"
  | "VALIDATING_PROPOSAL"
  | "EVALUATING_PROPOSAL"
  | "FINALIZING";

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
  "No demand heuristic yet (M4); comparison is baseline vs model proposals only.",
  "3D scene uses DEVELOPMENT PROXIES; no SimReady asset loaded yet (M4).",
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

function feedbackOf(attempts: ProposalAttempt[]): ProposalFeedback[] {
  let best: ProposalFeedback["bestValidSoFar"] = null;
  const out: ProposalFeedback[] = [];
  for (const a of attempts) {
    if (a.candidate?.valid && a.candidate.weightedTravelMm !== null) {
      const cand = { name: a.name, weightedTravelMm: a.candidate.weightedTravelMm, relocationCount: a.candidate.relocationCount };
      if (
        best === null ||
        cand.weightedTravelMm < best.weightedTravelMm ||
        (cand.weightedTravelMm === best.weightedTravelMm && cand.relocationCount < best.relocationCount)
      ) {
        best = cand;
      }
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
      bestValidSoFar: best ? { ...best } : null,
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
      const entries = record.attempts
        .filter((a) => a.candidate !== null)
        .map((a) => ({ name: a.name, mapping: (a.candidate as CandidateResult).assignment }));
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
      let summary: string;
      try {
        summary = buildScenarioSummary(record.scenario, {
          maxChars: this.config.maxContextChars,
          requirements: approved,
          baseline: record.baseline,
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
        const feedback = feedbackOf(record.attempts);
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
    const entries: { name: string; mapping: Assignment[] }[] = record.attempts
      .filter((a) => a.candidate !== null)
      .map((a) => ({ name: a.name, mapping: (a.candidate as CandidateResult).assignment }));
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
      attempts: structuredClone(record.attempts),
      feedback: feedbackOf(record.attempts),
      bestName: report.bestName,
      improvementPercents: structuredClone(report.improvementPercents),
      timingsMs: { createdAt: record.createdAt, completedAt: record.completedAt, durationsMs: [...record.durationsMs] },
      limitations: [...M3_LIMITATIONS],
    };
  }
}
