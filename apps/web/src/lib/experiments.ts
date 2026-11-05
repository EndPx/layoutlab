import { runTimeoutCeiling } from "./api";
// E4b Experiments browser adapter and pure helpers. Same-origin /api only:
// no API key in the browser, no direct Meta requests. Report shapes mirror
// the accepted server types structurally; no Node-only API module is
// imported and no verifier logic is duplicated here.
import {
  runOperationsExperiment,
  type ExperimentCandidateResult,
  type InterventionPolicy,
  type OperationsExperimentResult,
  type OperationsPatch,
  type OperationsScenario,
} from "@layoutlab/simulation";
import { ApiError, getStatus, validProviderPair, type ApiStatus } from "./api";

export { ApiError, getStatus };
export type { ApiStatus };

export const DURATION_FIELDS = ["packingDurationMs", "dispatchDurationMs", "receivingDurationMs"] as const;
export type DurationField = (typeof DURATION_FIELDS)[number];
export const PATCH_BOUNDS: Record<DurationField, { min: number; max: number }> = {
  packingDurationMs: { min: 1000, max: 300000 },
  dispatchDurationMs: { min: 1000, max: 300000 },
  receivingDurationMs: { min: 1000, max: 300000 },
};
export const DURATION_LABELS: Record<DurationField, string> = {
  packingDurationMs: "Packing service duration",
  dispatchDurationMs: "Dispatch service duration",
  receivingDurationMs: "Receiving service duration",
};

export type DurationDraft = { checked: boolean; minMs: number; maxMs: number };
export type PermissionsDraft = Record<DurationField, DurationDraft>;

export function defaultPermissions(): PermissionsDraft {
  return {
    packingDurationMs: { checked: false, minMs: 1000, maxMs: 60000 },
    dispatchDurationMs: { checked: false, minMs: 1000, maxMs: 60000 },
    receivingDurationMs: { checked: false, minMs: 1000, maxMs: 60000 },
  };
}

/** Build the machine-readable policy from the draft, or list every error. */
export function buildPolicy(draft: PermissionsDraft): { policy: InterventionPolicy | null; errors: string[] } {
  const errors: string[] = [];
  const allowedFields: InterventionPolicy["allowedFields"] = [];
  const ranges: NonNullable<InterventionPolicy["ranges"]> = {};
  for (const field of DURATION_FIELDS) {
    const d = draft[field];
    if (!d.checked) continue;
    const bounds = PATCH_BOUNDS[field];
    if (!Number.isSafeInteger(d.minMs) || !Number.isSafeInteger(d.maxMs)) {
      errors.push(`${DURATION_LABELS[field]}: min and max must be whole milliseconds.`);
      continue;
    }
    if (d.minMs < bounds.min || d.maxMs > bounds.max || d.minMs > d.maxMs) {
      errors.push(`${DURATION_LABELS[field]}: range must satisfy ${bounds.min} ≤ min ≤ max ≤ ${bounds.max} ms.`);
      continue;
    }
    allowedFields.push(field);
    ranges[field] = { min: d.minMs, max: d.maxMs };
  }
  if (errors.length > 0) return { policy: null, errors };
  return { policy: { allowedFields, ...(Object.keys(ranges).length > 0 ? { ranges } : {}) }, errors };
}

export function policyEquals(a: InterventionPolicy, b: InterventionPolicy): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- Report shapes (structural mirror of the server export) -------------------

export type CandidateResult = ExperimentCandidateResult;
export type ComparisonResult = OperationsExperimentResult;

export type TraceEntry = {
  seq: number;
  kind: "baseline" | "proposal" | "experiment" | "finish" | "recommendation";
  requestIndex: number | null;
  candidateId: string | null;
  patch: OperationsPatch | null;
  hypothesis: string | null;
  hypothesisKind: string | null;
  status: string;
  reason: string | null;
  shipped: number | null;
  makespanMs: number | null;
  totalWaitMs: number | null;
  backlog: number | null;
};

export type RequestRecord = {
  index: number;
  status: string;
  responseId: string | null;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null } | null;
  finishReason: string | null;
  durationMs: number | null;
  model: string | null;
  errorCode: string | null;
  error: string | null;
};

export type Recommendation = {
  candidateId: string;
  source: "model" | "deterministic-fallback";
  modelSelectedCandidateId: string | null;
  deterministicBestCandidateId: string | null;
  baselineCandidateId: string;
  improvedOverBaseline: boolean;
  comparisons: {
    baselineCandidateId: string;
    candidateId: string;
    shippedDelta: number | null;
    makespanDeltaMs: number | null;
    makespanImprovementPercent: number | null;
    totalWaitDeltaMs: number | null;
    totalWaitImprovementPercent: number | null;
  };
  explanation: string;
};

export type InvestigationReport = {
  schema: "layoutlab.operations-investigation/1";
  investigationId: string;
  runId: string;
  createdAt: string;
  completedAt: string | null;
  state: string;
  outcome: string | null;
  lastError: string | null;
  input: {
    scenario: OperationsScenario;
    executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number };
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
  provider: "meta" | "gater";
  providerKind: "meta" | "gater" | "fixture" | "unsupported";
  configuredModel: string;
  returnedModel: string | null;
  realMetaRequests: number;
  limits: { maxModelRequests: number; maxExperiments: number; maxCompletionTokens: number; timeoutMs: number };
  budget: { publicBudgetPerRunUsd: number; claimId: string | null; accounting: string };
  requestCount: number;
  experimentCount: number;
  requests: RequestRecord[];
  trace: TraceEntry[];
  comparison: ComparisonResult | null;
  recommendation: Recommendation | null;
  assumptions: string[];
  limitations: string[];
};

export type InvestigationSummary = {
  provider: "meta" | "gater";
  runId: string;
  investigationId: string;
  state: string;
  phase: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  providerKind: "meta" | "gater" | "fixture" | "unsupported";
  realMetaRequests: number;
  configuredModel: string;
  returnedModel: string | null;
  requestCount: number;
  experimentCount: number;
  limits: { maxModelRequests: number; maxExperiments: number; timeoutMs: number };
  trace: TraceEntry[];
  requests: RequestRecord[];
  recommendation: Recommendation | null;
  outcome: string | null;
  lastError: string | null;
  result: InvestigationReport | null;
  report: InvestigationReport | null;
};

type FiniteBudget = { perRunReservationUsd?: number; publicBudgetUsd?: number; capUsd?: number; reservedUsd?: number; committedUsd?: number; availableUsd?: number; entries?: number; accounting?: string };
export type BudgetInfo =
  | (FiniteBudget & { mode?: "capped"; guard: "active" | "not_configured" | "unavailable" })
  | { mode: "unlimited"; guard: "unlimited"; perRunReservationUsd: null; capUsd: null; reservedUsd: null; committedUsd: null; availableUsd: null; publicBudgetUsd?: never; entries?: never; accounting: string };

export type Provenance =
  | { kind: "live"; label: string }
  | { kind: "recorded-meta"; label: string }
  | { kind: "fixture"; label: string }
  | { kind: "imported"; label: string };

export function provenanceOf(report: InvestigationReport, source: "live" | "recorded" | "imported"): Provenance {
  if (report.providerKind === "unsupported") return { kind: "imported", label: "Declared unsupported provider / replay" };
  if (source === "live" && report.providerKind === "fixture") {
    return { kind: "fixture", label: "Fixture investigation — fake transport, 0 real Meta requests" };
  }
  if (report.providerKind === "gater") return { kind: source === "live" ? "live" : "imported", label: source === "live" ? (report.requestCount > 0 && report.returnedModel ? "Gater responses recorded this session (transport origin unverified)" : "Gater configured this session; no confirmed response") : source === "recorded" ? "Recorded declared Gater run / replay" : "Imported declared Gater report / replay" };
  if (source === "live") return { kind: "live", label: "Live investigation (this session)" };
  if (report.providerKind === "fixture") return { kind: "fixture", label: "Fixture report — fake transport, 0 real Meta requests" };
  return {
    kind: source === "recorded" ? "recorded-meta" : "imported",
    label: source === "recorded" ? "Recorded Meta run / replay" : "Imported declared Meta report / replay",
  };
}

// --- Formatting (display only; raw values stay in title/export) -------------

/** Milliseconds → seconds with one decimal, e.g. 502400 → "502.4 s". */
export function formatSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Percent at one decimal for display; full precision stays in details. */
export function formatPercent(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(1)}%`;
}

export function metricCell(value: number | null | undefined, unavailableReason: string): { text: string; title: string } {
  if (value === null || value === undefined) return { text: "—", title: unavailableReason };
  return { text: String(value), title: unavailableReason };
}

// --- Changed fields -----------------------------------------------------------

export type ChangedField = { field: string; label: string; before: string; after: string; changed: boolean };

function baselineDurations(scenario: OperationsScenario): Record<DurationField, number[]> {
  const out: Record<DurationField, number[]> = { packingDurationMs: [], dispatchDurationMs: [], receivingDurationMs: [] };
  const kindOf: Record<DurationField, string> = {
    packingDurationMs: "packing",
    dispatchDurationMs: "dispatch",
    receivingDurationMs: "receiving",
  };
  for (const field of DURATION_FIELDS) {
    const vals = [...new Set(scenario.resources.filter((r) => r.kind === kindOf[field]).map((r) => r.serviceDurationMs))].sort((a, b) => a - b);
    out[field] = vals;
  }
  return out;
}

/** Before/after for one candidate: baseline service assumptions vs the patch. */
export function changedFields(scenario: OperationsScenario, candidate: CandidateResult): ChangedField[] {
  const base = baselineDurations(scenario);
  const patch = (candidate.patch ?? {}) as OperationsPatch;
  const rows: ChangedField[] = [];
  for (const field of DURATION_FIELDS) {
    const before = base[field].length > 0 ? base[field].map((v) => `${v} ms (${formatSeconds(v)})`).join(", ") : "— (no such resource)";
    const value = patch[field];
    const after = value === undefined ? `${before} (unchanged)` : `${value} ms (${formatSeconds(value)})`;
    rows.push({ field, label: DURATION_LABELS[field], before, after, changed: value !== undefined });
  }
  for (const field of ["extraPickers", "extraPutaway"] as const) {
    const value = patch[field];
    rows.push({
      field,
      label: field === "extraPickers" ? "Extra pickers" : "Extra putaway",
      before: "0 (staffing fixed)",
      after: value === undefined ? "0 (unchanged)" : `${value} added`,
      changed: value !== undefined && value !== 0,
    });
  }
  return rows;
}

// --- Import validation (bounded structure the UI reads; numeric
// recomputation stays on the server verifier — nothing is re-evaluated here)

const REPORT_STATES = new Set(["RUNNING", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]);
const PROVIDER_KINDS = new Set(["meta", "gater", "fixture", "unsupported"]);
const TRACE_KINDS = new Set(["baseline", "proposal", "experiment", "finish", "recommendation"]);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNumOrNull = (v: unknown): boolean => v === null || (typeof v === "number" && Number.isFinite(v));
const isInt = (v: unknown): boolean => typeof v === "number" && Number.isSafeInteger(v);

export function parseInvestigationReport(value: unknown): { report: InvestigationReport | null; error: string | null } {
  const bad = (error: string): { report: null; error: string } => ({ report: null, error });
  if (!isRec(value)) return bad("File is not a JSON object; an investigation export object is required.");
  const r = value as Record<string, unknown>;
  if (r["schema"] !== "layoutlab.operations-investigation/1") {
    return bad(`Unsupported schema ${String(r["schema"])}; expected layoutlab.operations-investigation/1.`);
  }
  if (!isStr(r["runId"]) || r["runId"].length === 0) return bad("Report is missing its runId (string required).");
  if (!isStr(r["createdAt"]) || Number.isNaN(Date.parse(r["createdAt"]))) return bad("Report createdAt must be an ISO date string; the UI cannot date this run.");
  if (r["completedAt"] !== null && !isStr(r["completedAt"])) return bad("Report completedAt must be a string or null.");
  if (!isStr(r["state"]) || !REPORT_STATES.has(r["state"])) return bad(`Report state must be one of ${[...REPORT_STATES].join("/")}.`);
  if (r["outcome"] !== null && !isStr(r["outcome"])) return bad("Report outcome must be a string or null.");
  if (r["lastError"] !== null && !isStr(r["lastError"])) return bad("Report lastError must be a string or null.");
  if (!isStr(r["providerKind"]) || !PROVIDER_KINDS.has(r["providerKind"])) return bad("Report providerKind must be meta, gater, fixture, or unsupported.");
  if (!isStr(r["configuredModel"]) || r["configuredModel"].length === 0) return bad("Report configuredModel (string) is required.");
  if (r["returnedModel"] !== null && !isStr(r["returnedModel"])) return bad("Report returnedModel must be a string or null.");
  if (!isInt(r["realMetaRequests"]) || !isInt(r["requestCount"]) || !isInt(r["experimentCount"])) {
    return bad("Report realMetaRequests/requestCount/experimentCount must be integers.");
  }
  if (!(r.provider === "gater" ? r.providerKind === "gater" : r.provider === "meta" && r.providerKind !== "gater")) return bad("Inconsistent provider provenance.");
  if ((r.requestCount as number) < 0 || (r.realMetaRequests as number) !== (r.providerKind === "meta" ? r.requestCount : 0)) return bad("Invalid provider request accounting.");
  const versions = r["versions"];
  if (!isRec(versions) || ["simulation", "operationsSchema", "operationsEngine", "evaluator", "experimentSchema", "api", "prompt"].some((k) => !isStr(versions[k]))) {
    return bad("Report versions must carry simulation/operationsSchema/operationsEngine/evaluator/experimentSchema/api/prompt strings.");
  }
  const limits = r["limits"];
  if (!isRec(limits) || !isInt(limits["maxModelRequests"]) || !isInt(limits["maxExperiments"]) || !isInt(limits["maxCompletionTokens"]) || !isInt(limits["timeoutMs"])) {
    return bad("Report limits.maxModelRequests/maxExperiments/maxCompletionTokens/timeoutMs must be integers.");
  }
  if ((limits.maxCompletionTokens as number) < 1 || (limits.maxCompletionTokens as number) > (r.providerKind === "gater" && r.configuredModel === "glm-5-3-flash" ? 8192 : 2000)) return bad("Report token ceiling invalid for provider/model.");
  if ((limits.timeoutMs as number) < 1 || (limits.timeoutMs as number) > runTimeoutCeiling(r.providerKind,r.configuredModel)) return bad("Report timeout exceeds provider/model ceiling.");
  const budget = r["budget"];
  if (!isRec(budget) || typeof budget["publicBudgetPerRunUsd"] !== "number" || !(budget["claimId"] === null || isStr(budget["claimId"])) || !isStr(budget["accounting"])) {
    return bad("Report budget must carry a numeric publicBudgetPerRunUsd, claimId (string or null), and accounting text.");
  }
  const input = r["input"];
  if (!isRec(input) || !isRec(input["scenario"]) || !isRec(input["executionConfig"])) {
    return bad("Report is missing input.scenario / input.executionConfig; it cannot be inspected or verified.");
  }
  const scenario = input["scenario"] as Record<string, unknown>;
  if (!isStr(scenario["id"]) || !isStr(scenario["seed"]) || !Array.isArray(scenario["resources"]) || !Array.isArray(scenario["mobileUnits"]) || !Array.isArray(scenario["orderSchedule"]) || !Array.isArray(scenario["deliverySchedule"]) || !Array.isArray(scenario["products"]) || !Array.isArray(scenario["locations"])) {
    return bad("Report input.scenario must carry id/seed strings and resources/mobileUnits/orderSchedule/deliverySchedule/products/locations arrays.");
  }
  for (const res of scenario["resources"] as unknown[]) {
    if (!isRec(res) || !isStr(res["kind"]) || typeof res["serviceDurationMs"] !== "number") {
      return bad("Report input.scenario.resources rows must carry kind and numeric serviceDurationMs.");
    }
  }
  const execCfg = input["executionConfig"] as Record<string, unknown>;
  if (typeof execCfg["pickDurationMsPerItem"] !== "number" || typeof execCfg["unloadDurationMsPerItem"] !== "number") {
    return bad("Report input.executionConfig must carry numeric pick/unload durations.");
  }
  const policy = input["interventionPolicy"];
  if (!isRec(policy) || !Array.isArray(policy["allowedFields"]) || (policy["allowedFields"] as unknown[]).some((f) => !isStr(f))) {
    return bad("Report input.interventionPolicy.allowedFields must be a string array.");
  }
  if (!isStr(input["question"]) || !isInt(input["safetyCeilingMs"])) return bad("Report input.question (string) and safetyCeilingMs (integer) are required.");
  if (!Array.isArray(r["trace"]) || !Array.isArray(r["requests"])) return bad("Report is missing its trace/requests evidence arrays.");
  for (const row of r["requests"] as unknown[]) {
    if (!isRec(row) || !isInt(row["index"]) || !isStr(row["status"]) || !(row["usage"] === null || isRec(row["usage"])) || !isNumOrNull(row["durationMs"])) {
      return bad("Report requests rows must carry integer index, string status, usage (object or null), and numeric-or-null durationMs.");
    }
  }
  for (const row of r["trace"] as unknown[]) {
    if (!isRec(row) || !isInt(row["seq"]) || !isStr(row["kind"]) || !TRACE_KINDS.has(row["kind"] as string) || !isStr(row["status"]) || !isNumOrNull(row["shipped"]) || !isNumOrNull(row["makespanMs"]) || !isNumOrNull(row["totalWaitMs"]) || !isNumOrNull(row["backlog"])) {
      return bad("Report trace rows must carry integer seq, a known kind, string status, and numeric-or-null shipped/makespanMs/totalWaitMs/backlog.");
    }
  }
  const comparison = r["comparison"];
  if (comparison !== null) {
    if (!isRec(comparison) || !Array.isArray(comparison["candidates"]) || !isStr(comparison["baselineCandidateId"]) || !Array.isArray(comparison["rankedCandidateIds"])) {
      return bad("Report comparison must carry baselineCandidateId, rankedCandidateIds, and a candidates array.");
    }
    for (const cand of comparison["candidates"] as unknown[]) {
      if (!isRec(cand) || !isStr(cand["candidateId"]) || typeof cand["isBaseline"] !== "boolean" || !isStr(cand["status"]) || !isNumOrNull(cand["shipped"]) || !isNumOrNull(cand["backlog"]) || !isNumOrNull(cand["makespanMs"]) || !isNumOrNull(cand["totalWaitMs"]) || !(cand["report"] === null || isRec(cand["report"]))) {
        return bad("Report comparison candidate rows must carry candidateId, isBaseline, status, numeric-or-null metrics, and report (object or null).");
      }
      const candReport = cand["report"];
      if (isRec(candReport) && (!isRec(candReport["scenario"]) || !Array.isArray(candReport["orders"]))) {
        return bad(`Candidate ${String(cand["candidateId"])} report must carry its executed scenario and orders array for inspection.`);
      }
    }
  }
  const recommendation = r["recommendation"];
  if (recommendation !== null) {
    if (!isRec(recommendation) || !isStr(recommendation["candidateId"]) || !isStr(recommendation["explanation"]) || !isRec(recommendation["comparisons"])) {
      return bad("Report recommendation must carry candidateId, explanation, and comparisons.");
    }
  }
  if (!Array.isArray(r["assumptions"]) || !Array.isArray(r["limitations"])) return bad("Report assumptions/limitations arrays are required.");
  return { report: value as unknown as InvestigationReport, error: null };
}

// --- Local baseline (zero model requests) -------------------------------------

export function runLocalBaseline(
  scenario: OperationsScenario,
  executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number },
): ComparisonResult {
  return runOperationsExperiment({
    scenario,
    executionConfig,
    interventionPolicy: { allowedFields: [] },
    candidates: [{ candidateId: "baseline", patch: {} }],
  });
}

// --- Inspection inputs ----------------------------------------------------------

export function inspectionInputs(
  report: InvestigationReport,
  candidateId: string,
): { scenario: OperationsScenario; executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number } } | { error: string } {
  const candidate = report.comparison?.candidates.find((c) => c.candidateId === candidateId);
  if (!candidate) return { error: `Candidate ${candidateId} is not in this report.` };
  if (!candidate.report) {
    return { error: `Candidate ${candidateId} is ${candidate.status} (${candidate.reason ?? "no executed run"}); there is no executed scenario to inspect.` };
  }
  return { scenario: candidate.report.scenario, executionConfig: report.input.executionConfig };
}

// --- Same-origin API --------------------------------------------------------------

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

export function parseBudgetStatus(value: unknown): BudgetInfo {
  if (!isRec(value) || !["active", "unlimited", "not_configured", "unavailable"].includes(String(value["guard"]))) throw new Error("Invalid budget status");
  const fields = ["capUsd", "reservedUsd", "committedUsd", "availableUsd", "perRunReservationUsd"];
  if (value["guard"] === "unlimited") {
    if (value["mode"] !== "unlimited" || fields.some(k => value[k] !== null) || value["publicBudgetUsd"] !== undefined || value["entries"] !== undefined || typeof value["accounting"] !== "string") throw new Error("Invalid unlimited budget");
  } else {
    if (value["mode"] !== undefined && value["mode"] !== "capped") throw new Error("Invalid capped mode");
    if (value["guard"] === "active" && fields.some(k => typeof value[k] !== "number" || !Number.isFinite(value[k]) || value[k] < 0)) throw new Error("Missing capped total");
    if (Object.entries(value).some(([k,v]) => k.endsWith("Usd") && (typeof v !== "number" || !Number.isFinite(v) || v < 0))) throw new Error("Invalid monetary total");
    if (value["entries"] !== undefined && (typeof value["entries"] !== "number" || !Number.isSafeInteger(value["entries"]) || value["entries"] < 0)) throw new Error("Invalid entry count");
  }
  return value as unknown as BudgetInfo;
}
export function getBudget(signal?: AbortSignal): Promise<BudgetInfo> {
  return request("/api/budget", { signal }).then(parseBudgetStatus);
}

export function createInvestigation(input: {
  scenario: unknown;
  executionConfig: unknown;
  interventionPolicy: InterventionPolicy;
  question: string;
}, signal?: AbortSignal): Promise<InvestigationSummary> {
  return request("/api/operations/investigations", {
    method: "POST",
    body: JSON.stringify({ ...input, mode: "live", consent: true }),
    signal,
  }) .then(parseInvestigationSummary);
}

export function getInvestigation(runId: string, signal?: AbortSignal): Promise<InvestigationSummary> {
  return request(`/api/operations/investigations/${encodeURIComponent(runId)}`, { signal }) .then(parseInvestigationSummary);
}

export function cancelInvestigation(runId: string): Promise<InvestigationSummary> {
  return request(`/api/operations/investigations/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    body: "{}",
  }) .then(parseInvestigationSummary);
}

export function getInvestigationReport(runId: string, signal?: AbortSignal): Promise<InvestigationReport> {
  return request(`/api/operations/investigations/${encodeURIComponent(runId)}/report`, { signal }) .then(decodeInvestigationReport);
}

export function verifyInvestigation(report: InvestigationReport, signal?: AbortSignal): Promise<{ ok: boolean; mismatches: string[]; verifierImplementationVersion: string | null }> {
  return request("/api/operations/investigations/verify", {
    method: "POST",
    body: JSON.stringify({ report }),
    signal,
  }) as Promise<{ ok: boolean; mismatches: string[]; verifierImplementationVersion: string | null }>;
}

export function decodeInvestigationReport(value: unknown): InvestigationReport {
  const parsed = parseInvestigationReport(value);
  if (!parsed.report) throw new Error(parsed.error ?? "Malformed investigation report");
  return parsed.report;
}
export function parseInvestigationSummary(value: unknown): InvestigationSummary {
  const v = value;
  const bad = () => { throw new Error("Malformed investigation summary"); };
  if (!isRec(v) || !validProviderPair(v.provider, v.providerKind) || !["runId", "investigationId", "phase", "createdAt", "expiresAt", "configuredModel"].every(k => isStr(v[k])) || !REPORT_STATES.has(String(v.state)) || !["completedAt", "returnedModel", "outcome", "lastError"].every(k => v[k] === null || isStr(v[k]))) return bad();
  if (isRec(v.limits) && (typeof v.limits.timeoutMs !== "number" || v.limits.timeoutMs < 1 || v.limits.timeoutMs > runTimeoutCeiling(v.providerKind,v.configuredModel))) return bad();
  if (!isInt(v.requestCount) || (v.requestCount as number) < 0 || !isInt(v.experimentCount) || (v.experimentCount as number) < 0 || v.realMetaRequests !== (v.providerKind === "meta" ? v.requestCount : 0) || !isRec(v.limits) || !["maxModelRequests", "maxExperiments", "timeoutMs"].every(k => isInt((v.limits as Record<string, unknown>)[k])) || (v.requestCount as number) > (v.limits.maxModelRequests as number) || (v.experimentCount as number) > (v.limits.maxExperiments as number)) return bad();
  if (!Array.isArray(v.requests) || !v.requests.every(r => isRec(r) && isInt(r.index) && isStr(r.status) && isNumOrNull(r.durationMs) && (r.usage === null || isRec(r.usage) && ["promptTokens", "completionTokens", "totalTokens"].every(k => isNumOrNull((r.usage as Record<string, unknown>)[k]))))) return bad();
  if (!Array.isArray(v.trace) || !v.trace.every(r => isRec(r) && isInt(r.seq) && TRACE_KINDS.has(String(r.kind)) && isStr(r.status) && ["shipped", "makespanMs", "totalWaitMs", "backlog"].every(k => isNumOrNull(r[k])))) return bad();
  for (const key of ["result", "report"]) {
    if (v[key] !== null) {
      const report = decodeInvestigationReport(v[key]);
      if (report.provider !== v.provider || report.providerKind !== v.providerKind || report.requestCount !== v.requestCount || report.realMetaRequests !== v.realMetaRequests || report.runId !== v.runId) return bad();
    }
  }
  if (v.recommendation !== null && (!isRec(v.recommendation) || !isStr(v.recommendation.candidateId) || !isStr(v.recommendation.explanation) || !isRec(v.recommendation.comparisons))) return bad();
  return v as unknown as InvestigationSummary;
}
