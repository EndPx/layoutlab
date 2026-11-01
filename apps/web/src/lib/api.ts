// Browser adapter for the M3 live API. Same-origin /api only: the browser
// never contacts Meta directly and never sees the server key.
import type { CandidateResult, PlanningRequirements } from "@layoutlab/core";

export type ApiStatus = {
  liveAvailable: boolean;
  reason: string | null;
  status: "ready" | "setup_required";
  baseUrl: string;
  modelId: string;
  promptVersion: string;
  apiVersion: string;
  coreVersion: string;
  budgets: { maxProposals: number; maxRequests: number; timeoutMs: number };
  concurrency: number;
  provider: "meta";
  providerKind: "meta" | "fixture" | "unsupported";
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
  provider: "meta";
  providerKind: "meta" | "fixture" | "unsupported";
  realMetaRequests: number;
  modelId: string;
  promptVersion: string;
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
  return request("/api/status", { signal }) as Promise<ApiStatus>;
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
  }) as Promise<RunSummary>;
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
  }) as Promise<RunSummary>;
}

export function cancelLiveRun(runId: string): Promise<RunSummary> {
  return request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: "{}" }) as Promise<RunSummary>;
}

export function getLiveRun(runId: string, signal?: AbortSignal): Promise<RunSummary> {
  return request(`/api/runs/${encodeURIComponent(runId)}`, { signal }) as Promise<RunSummary>;
}

export function getLiveReport(runId: string, signal?: AbortSignal): Promise<unknown> {
  return request(`/api/runs/${encodeURIComponent(runId)}/report`, { signal });
}
