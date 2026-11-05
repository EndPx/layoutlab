// Browser adapter for the M3 live API. Same-origin /api only: the browser
// never contacts Meta directly and never sees the server key.
import { assignmentSchema, requirementsSchema, type CandidateResult, type PlanningRequirements } from "@layoutlab/core";

export type ApiStatus = {
  budgetMode?: "capped" | "unlimited";
  budgetGuard?: "active" | "unlimited" | "not_configured" | "unavailable";
  liveAvailable: boolean;
  reason: string | null;
  status: "ready" | "setup_required";
  baseUrl: string;
  modelId: string;
  promptVersion: string;
  apiVersion: string;
  coreVersion: string;
  operationsImplementationVersion: string;
  budgets: { maxProposals: number; maxRequests: number; timeoutMs: number };
  concurrency: number;
  generationSettings?: GenerationSettings;
  provider: "meta" | "gater";
  providerKind: "meta" | "gater" | "fixture" | "unsupported";
};

export type AttemptDiagnostics = {
  responseId: string | null;
  finishReason: string | null;
  errorCode: string | null;
};

export type LiveAttempt = {
  name: string;
  rationale: string;
  parseOk: boolean;
  parseError: string | null;
  applyOk: boolean;
  applyErrors: string[];
  candidate: CandidateResult | null;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null } | null;
  durationMs: number;
  requestIndex: number;
  transportError: string | null;
  diagnostics: AttemptDiagnostics | null;
};

export type LiveHeuristic = {
  name: "heuristic";
  method: string;
  sceneOk: boolean;
  retainedBaseline: boolean;
  rankingExhausted: boolean;
  evaluationsUsed: number;
  evaluationsBudget: number;
  reason: string;
  candidate: CandidateResult | null;
};

export type RunSummary = {
  runId: string;
  state: "INTERPRETING" | "AWAITING_APPROVAL" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  phase: string;
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
  heuristic: LiveHeuristic | null;
  methodLabels: Record<string, string>;
  candidateBudgets: {
    heuristic: { evaluationsUsed: number; evaluationsBudget: number };
    model: { proposalsUsed: number; maxProposals: number; requestsUsed: number; maxRequests: number };
  };
  attempts: LiveAttempt[];
  bestName: string | null;
  outcome: string | null;
  lastError: string | null;
  usageTotals: LiveAttempt["usage"];
  usageIncomplete: boolean;
  provider: "meta" | "gater";
  providerKind: "meta" | "gater" | "fixture" | "unsupported";
  realMetaRequests: number;
  modelId: string;
  promptVersion: string;
  generationSettings?: GenerationSettings;
};

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>;
    throw new ApiError(
      typeof b["code"] === "string" ? (b["code"] as string) : `HTTP_${res.status}`,
      typeof b["message"] === "string"
        ? (b["message"] as string)
        : typeof b["reason"] === "string"
          ? (b["reason"] as string)
          : `Request failed: HTTP ${res.status}.`,
      res.status,
    );
  }
  return body;
}

export function getStatus(signal?: AbortSignal): Promise<ApiStatus> {
  return request("/api/status", { signal }).then(parseApiStatus);
}

export function createLiveRun(
  scenario: unknown,
  requestText: string,
  signal?: AbortSignal,
): Promise<RunSummary> {
  return request("/api/runs", {
    method: "POST",
    body: JSON.stringify({ scenario, requestText, mode: "live", consent: true }),
    signal,
  }).then(parseRunSummary);
}

export function approveLiveRun(
  runId: string,
  requirements: PlanningRequirements,
  signal?: AbortSignal,
): Promise<RunSummary> {
  return request(`/api/runs/${encodeURIComponent(runId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ requirements }),
    signal,
  }).then(parseRunSummary);
}

export function cancelLiveRun(runId: string): Promise<RunSummary> {
  return request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: "{}" }).then(parseRunSummary);
}

export function getLiveRun(runId: string, signal?: AbortSignal): Promise<RunSummary> {
  return request(`/api/runs/${encodeURIComponent(runId)}`, { signal }).then(parseRunSummary);
}

export function getLiveReport(runId: string, signal?: AbortSignal): Promise<unknown> {
  return request(`/api/runs/${encodeURIComponent(runId)}/report`, { signal });
}

export function getLiveFailureReport(runId: string, signal?: AbortSignal): Promise<unknown> {
  return request(`/api/runs/${encodeURIComponent(runId)}/failure-report`, { signal });
}

export type GenerationSettings = { reasoningEffort: "low" | "not-specified"; maxCompletionTokens: number };
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const nullableText = (v: unknown) => v === null || text(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const nullableNumber = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
export function validProviderPair(provider: unknown, kind: unknown, model?: unknown): boolean {
  return provider === "gater" ? kind === "gater" : provider === "meta" && ["meta", "fixture", "unsupported"].includes(String(kind));
}
export function validGenerationSettings(value: unknown, kind: unknown, model?: unknown): boolean {
  return record(value) && (value.reasoningEffort === "low" || kind === "gater" && value.reasoningEffort === "not-specified") && count(value.maxCompletionTokens) && value.maxCompletionTokens > 0 && value.maxCompletionTokens <= (kind === "gater" && model === "glm-5-3-flash" ? 8192 : 2000);
}
function budgets(v: unknown, kind?: unknown, model?: unknown): v is RunSummary["budgets"] {
  return record(v) && count(v.maxProposals) && v.maxProposals <= 3 && count(v.maxRequests) && v.maxRequests <= 4 && count(v.timeoutMs) && v.timeoutMs > 0 && v.timeoutMs <= runTimeoutCeiling(kind,model);
}
function usage(v: unknown): boolean {
  return v === null || record(v) && ["promptTokens", "completionTokens", "totalTokens"].every(k => v[k] === null || count(v[k]));
}
function candidate(v: unknown): boolean {
  if (v === null) return true;
  if (!record(v) || !text(v.name) || !Array.isArray(v.assignment) || !v.assignment.every(a => assignmentSchema.safeParse(a).success) || !text(v.assignmentKey) || typeof v.valid !== "boolean" || !Array.isArray(v.errors) || !v.errors.every(e => record(e) && text(e.code) && text(e.message)) || !count(v.relocationCount) || !nullableNumber(v.weightedTravelMm) || !text(v.settingsFingerprint)) return false;
  const w = v.workload;
  return w === null || record(w) && Array.isArray(w.orders) && w.orders.every(o => record(o) && text(o.orderId) && count(o.frequency) && strings(o.distinctProductIds) && count(o.units) && strings(o.visitSequence) && Array.isArray(o.legs) && o.legs.every(l => record(l) && text(l.fromId) && text(l.toId) && nullableNumber(l.distanceMm)) && nullableNumber(o.distanceMm) && typeof o.reachable === "boolean" && nullableText(o.reason)) && count(w.reachableOrders) && ["totalFrequency", "weightedTravelMm", "meanOrderDistanceMm", "totalUnits"].every(k => nullableNumber(w[k])) && typeof w.arithmeticOverflow === "boolean" && typeof w.budgetExhausted === "boolean";
}
export function parseApiStatus(value: unknown): ApiStatus {
  if (!record(value) || !validProviderPair(value.provider, value.providerKind) || typeof value.liveAvailable !== "boolean" || !nullableText(value.reason) || !["ready", "setup_required"].includes(String(value.status)) || !["baseUrl", "modelId", "promptVersion", "apiVersion", "coreVersion", "operationsImplementationVersion"].every(k => text(value[k])) || !budgets(value.budgets,value.providerKind,value.modelId) || !count(value.concurrency) || (value.providerKind === "gater" || value.generationSettings !== undefined) && !validGenerationSettings(value.generationSettings, value.providerKind, value.modelId)) throw new Error("Malformed API status");
  const mode = value.budgetMode, guard = value.budgetGuard;
  if (mode !== undefined || guard !== undefined) {
    if (mode !== "capped" && mode !== "unlimited" || !["active", "unlimited", "not_configured", "unavailable"].includes(String(guard)) || (mode === "unlimited") !== (guard === "unlimited")) throw new Error("Malformed allowance status");
  }
  return value as unknown as ApiStatus;
}
export function parseRunSummary(value: unknown): RunSummary {
  const v = value;
  const bad = () => { throw new Error("Malformed run summary"); };
  if (!record(v) || !validProviderPair(v.provider, v.providerKind)) return bad();
  if (!["runId", "phase", "createdAt", "expiresAt", "modelId", "promptVersion"].every(k => text(v[k])) || !["INTERPRETING", "AWAITING_APPROVAL", "RUNNING", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(String(v.state)) || !["completedAt", "interpretError", "bestName", "outcome", "lastError"].every(k => nullableText(v[k])) || !budgets(v.budgets,v.providerKind,v.modelId) || !count(v.modelRequestsUsed) || v.modelRequestsUsed > v.budgets.maxRequests || !count(v.proposalsUsed) || v.proposalsUsed > v.budgets.maxProposals || v.proposalsUsed > v.modelRequestsUsed || v.realMetaRequests !== (v.providerKind === "meta" ? v.modelRequestsUsed : 0)) return bad();
  if (!strings(v.interpretedUnresolved) || ![v.requirements, v.requirementsDraft].every(r => r === null || requirementsSchema.safeParse(r).success) || !candidate(v.baseline) || !usage(v.usageTotals) || typeof v.usageIncomplete !== "boolean" || !record(v.methodLabels) || !Object.values(v.methodLabels).every(text)) return bad();
  if ((v.providerKind === "gater" || v.generationSettings !== undefined) && !validGenerationSettings(v.generationSettings, v.providerKind, v.modelId)) return bad();
  if (!record(v.candidateBudgets) || !record(v.candidateBudgets.heuristic) || !record(v.candidateBudgets.model)) return bad();
  const h = v.candidateBudgets.heuristic, m = v.candidateBudgets.model;
  if (!count(h.evaluationsUsed) || !count(h.evaluationsBudget) || h.evaluationsUsed > h.evaluationsBudget || m.proposalsUsed !== v.proposalsUsed || m.requestsUsed !== v.modelRequestsUsed || m.maxRequests !== v.budgets.maxRequests || m.maxProposals !== v.budgets.maxProposals) return bad();
  if (v.heuristic !== null && (!record(v.heuristic) || v.heuristic.name !== "heuristic" || !text(v.heuristic.method) || !text(v.heuristic.reason) || !["sceneOk", "retainedBaseline", "rankingExhausted"].every(k => typeof (v.heuristic as Record<string, unknown>)[k] === "boolean") || !count(v.heuristic.evaluationsUsed) || !count(v.heuristic.evaluationsBudget) || v.heuristic.evaluationsUsed > v.heuristic.evaluationsBudget || !candidate(v.heuristic.candidate))) return bad();
  if (!Array.isArray(v.attempts) || v.attempts.length !== v.proposalsUsed || !v.attempts.every(a => record(a) && text(a.name) && text(a.rationale) && typeof a.parseOk === "boolean" && typeof a.applyOk === "boolean" && nullableText(a.parseError) && nullableText(a.transportError) && strings(a.applyErrors) && candidate(a.candidate) && usage(a.usage) && typeof a.durationMs === "number" && Number.isFinite(a.durationMs) && a.durationMs >= 0 && count(a.requestIndex) && a.requestIndex <= (v.modelRequestsUsed as number) && (a.diagnostics === null || record(a.diagnostics) && ["responseId", "finishReason", "errorCode"].every(k => nullableText((a.diagnostics as Record<string, unknown>)[k]))))) return bad();
  return v as unknown as RunSummary;
}

export function runTimeoutCeiling(kind: unknown, model: unknown): number { return kind === "gater" && model === "glm-5-3-flash" ? 360000 : 120000; }
