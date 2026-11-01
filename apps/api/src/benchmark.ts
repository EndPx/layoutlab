// M5 benchmark orchestration: OFFLINE (baseline+heuristic, zero model
// calls), FIXTURE (6x3=18 trials against a local fake transport), and LIVE
// (gated, fixed protocol, never invoked without explicit authorization).
// Pure orchestration over @layoutlab/core plus the real API server over HTTP;
// the key (live only) stays server-side and never enters args, logs, or output.
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CORE_VERSION,
  DEFAULT_HEURISTIC_MAX_EVALUATIONS,
  REPORT_VERSION,
  ROUTE_POLICY_ID,
  createReport,
  evaluateBaseline,
  parseRequirements,
  parseScenario,
  replayReport,
  runHeuristic,
  type CandidateResult,
  type PlanningRequirements,
  type Scenario,
} from "@layoutlab/core";
import { API_VERSION, loadConfig, type ApiConfig } from "./config.js";
import { PROMPT_VERSION } from "./prompts.js";
import { generationSettingsOf, type GenerationSettings, type ProviderUsage } from "./provider.js";
import {
  M5_FAILURE_VERSION,
  RACK_ASSET,
  replayFailureRecord,
  type M3ReportEnvelope,
  type M5FailureEnvelope,
} from "./runs.js";
import { createApp } from "./server.js";

export const BENCHMARK_VERSION = "layoutlab.m5benchmark/1";
export const BENCHMARK_IDS = [
  "bm-01-demand-skew",
  "bm-02-copick-cluster",
  "bm-03-tight-relocation",
  "bm-04-constraints",
  "bm-05-locked-frequent",
  "bm-06-unreachable-repair",
] as const;
export type BenchmarkId = (typeof BENCHMARK_IDS)[number];
export const TRIALS_PER_SCENARIO = 3;
export const MAX_REQUESTS_PER_TRIAL = 4;
export const TOTAL_REQUEST_BUDGET = 72; // 18 trials x 4 requests (interpretation included)
export const LIVE_MODEL_ID = "muse-spark-1.3-contributor";
export const INPUT_USD_PER_M = 0.1;
export const OUTPUT_USD_PER_M = 0.2;
export const PRICING_SOURCE = "https://dev.meta.ai/docs/pricing-rate-limits";
export const PROTOCOL_ID = "meta-chat-completions/json_schema-strict/1";
export const FIXTURE_MODEL_ID = "fixture-muse-shape";
const FIXTURE_KEY = "fixture-only-key-not-a-secret";

// Deterministic conservative service-cost bound: max serialized prompt bytes
// (the provider's refusal bound) at a conservative 4 tokens/char, plus 2048
// framing-slack tokens (carried from the M3 smoke preflight) and the full
// output token bound, at verified Contributor rates. A reservation, not a
// bill: taxes and invoice are never retrieved.
export function conservativeReservationUsd(requests: number, maxContextChars: number, maxOutputTokens: number): number {
  const inputTokensPerRequest = (maxContextChars + 20000) * 4 + 2048;
  return requests * ((inputTokensPerRequest * INPUT_USD_PER_M) / 1e6 + (maxOutputTokens * OUTPUT_USD_PER_M) / 1e6);
}

export function fullBenchmarkReservationUsd(config: ApiConfig): number {
  return conservativeReservationUsd(TOTAL_REQUEST_BUDGET, config.maxContextChars, config.maxCompletionTokens);
}

// Usage-estimated service cost from reported usage only. Partial when usage
// is incomplete (missing fields are excluded, never zero-filled); null when
// no response carried any usage. Never presented as billed usage.
export function usageEstimatedUsd(
  usage: ProviderUsage | null,
  usageIncomplete: boolean,
): { inputTokens: number | null; outputTokens: number | null; estimatedUsd: number; partial: boolean } | null {
  if (usage === null) return null;
  const input = usage.promptTokens ?? 0;
  const output = usage.completionTokens ?? 0;
  return {
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    estimatedUsd: (input * INPUT_USD_PER_M) / 1e6 + (output * OUTPUT_USD_PER_M) / 1e6,
    partial: usageIncomplete || usage.promptTokens === null || usage.completionTokens === null,
  };
}

export type BenchmarkManifest = {
  benchmarkVersion: typeof BENCHMARK_VERSION;
  frozenAt: string;
  sourceCommit: string;
  scenarios: { id: BenchmarkId; file: string; bytes: number; sha256: string }[];
  requirements: { file: string; bytes: number; sha256: string };
};

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function benchmarkDir(rootDir: string): string {
  return join(rootDir, "fixtures", "benchmark");
}

// Freeze geometry/orders/constraints: hash the six scenario files plus the
// fixed requirements contract. Re-run only to re-freeze deliberately; tests
// and the runner recheck these hashes and refuse on mismatch.
export function freezeManifest(rootDir: string): BenchmarkManifest {
  const dir = benchmarkDir(rootDir);
  let sourceCommit = "unknown";
  try {
    sourceCommit = execSync("git rev-parse HEAD", { cwd: rootDir, encoding: "utf8" }).trim();
  } catch {
    sourceCommit = "unknown";
  }
  const scenarios = BENCHMARK_IDS.map((id) => {
    const file = `${id}.json`;
    const bytes = readFileSync(join(dir, file));
    return { id, file, bytes: bytes.length, sha256: sha256Hex(bytes) };
  });
  const reqBytes = readFileSync(join(dir, "requirements.json"));
  const manifest: BenchmarkManifest = {
    benchmarkVersion: BENCHMARK_VERSION,
    frozenAt: new Date().toISOString(),
    sourceCommit,
    scenarios,
    requirements: { file: "requirements.json", bytes: reqBytes.length, sha256: sha256Hex(reqBytes) },
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export type LoadedBenchmark = {
  manifest: BenchmarkManifest;
  scenarios: Map<BenchmarkId, Scenario>;
  contracts: Map<BenchmarkId, PlanningRequirements>;
  requestTexts: Map<BenchmarkId, string>;
};

// Light per-trial re-verification: frozen fixture/contract bytes must not
// change under a running benchmark. No parse, just bytes+hash.
export function verifyBenchmarkHashes(rootDir: string, manifest: BenchmarkManifest): void {
  const dir = benchmarkDir(rootDir);
  for (const entry of manifest.scenarios) {
    const bytes = readFileSync(join(dir, entry.file));
    if (bytes.length !== entry.bytes || sha256Hex(bytes) !== entry.sha256) {
      throw new Error(`Benchmark fixture hash changed mid-run: ${entry.file}.`);
    }
  }
  const reqBytes = readFileSync(join(dir, manifest.requirements.file));
  if (reqBytes.length !== manifest.requirements.bytes || sha256Hex(reqBytes) !== manifest.requirements.sha256) {
    throw new Error("Benchmark requirements hash changed mid-run.");
  }
}

export function requestTextFor(id: BenchmarkId, contract: PlanningRequirements): string {
  const locks =
    contract.lockedProductIds.length > 0 ? ` Keep locked products fixed: ${contract.lockedProductIds.join(", ")}.` : "";
  return (
    `Reduce picking travel for the loaded orders on ${id}.` +
    ` Relocate no more than ${contract.maxRelocatedProducts} products.${locks}` +
    " Preserve storage compatibility."
  ).slice(0, 2000);
}

export function loadBenchmark(rootDir: string): LoadedBenchmark {
  const dir = benchmarkDir(rootDir);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as BenchmarkManifest;
  if (manifest.benchmarkVersion !== BENCHMARK_VERSION) throw new Error("Benchmark manifest version mismatch.");
  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length !== 6) {
    throw new Error("Benchmark manifest must freeze exactly 6 scenarios.");
  }
  const scenarios = new Map<BenchmarkId, Scenario>();
  for (const entry of manifest.scenarios) {
    if (!BENCHMARK_IDS.includes(entry.id)) throw new Error(`Benchmark manifest lists unknown scenario ${entry.id}.`);
    const bytes = readFileSync(join(dir, entry.file));
    if (bytes.length !== entry.bytes || sha256Hex(bytes) !== entry.sha256) {
      throw new Error(`Benchmark fixture hash mismatch: ${entry.file} changed since freeze.`);
    }
    const scenario = parseScenario(JSON.parse(bytes.toString("utf8")));
    if (scenario.id !== entry.id) throw new Error(`Benchmark fixture id mismatch in ${entry.file}.`);
    scenarios.set(entry.id, scenario);
  }
  const reqBytes = readFileSync(join(dir, manifest.requirements.file));
  if (reqBytes.length !== manifest.requirements.bytes || sha256Hex(reqBytes) !== manifest.requirements.sha256) {
    throw new Error("Benchmark requirements hash mismatch: requirements changed since freeze.");
  }
  const reqJson = JSON.parse(reqBytes.toString("utf8")) as {
    benchmarkRequirementsVersion: string;
    contracts: Record<string, unknown>;
  };
  if (reqJson.benchmarkRequirementsVersion !== "layoutlab.m5requirements/1") {
    throw new Error("Benchmark requirements version mismatch.");
  }
  const contracts = new Map<BenchmarkId, PlanningRequirements>();
  const requestTexts = new Map<BenchmarkId, string>();
  for (const id of BENCHMARK_IDS) {
    const contract = parseRequirements(reqJson.contracts[id]);
    if (contract.unresolvedQuestions.length !== 0) {
      throw new Error(`Benchmark contract for ${id} must be fully specified (no unresolved questions).`);
    }
    contracts.set(id, contract);
    requestTexts.set(id, requestTextFor(id, contract));
  }
  return { manifest, scenarios, contracts, requestTexts };
}

// Live preflight: official Contributor model, exact server generation caps,
// and explicit authorization covering the FULL conservative bound — before
// any live create POST. Refusals never touch the network.
export function preflightLive(
  config: ApiConfig,
  authorizeUsd: unknown,
): { ok: true; reservationUsd: number } | { ok: false; reason: string } {
  if (config.providerKind !== "meta") {
    return { ok: false, reason: `Live benchmark requires the official Meta base URL (got providerKind ${config.providerKind}).` };
  }
  if (config.modelId !== LIVE_MODEL_ID) {
    return { ok: false, reason: `Live benchmark requires exactly ${LIVE_MODEL_ID} (got ${config.modelId}).` };
  }
  if (!config.apiKeyPresent) return { ok: false, reason: "Live benchmark requires MODEL_API_KEY on the server." };
  if (
    config.maxProposals !== 3 || config.maxRequests !== MAX_REQUESTS_PER_TRIAL || config.timeoutMs !== 120000 ||
    config.maxCompletionTokens !== 2000
  ) {
    return {
      ok: false,
      reason:
        `Live benchmark requires exact server caps (3 proposals, 4 requests, 120000 ms, 2000 output tokens); ` +
        `got ${config.maxProposals}/${config.maxRequests}/${config.timeoutMs}/${config.maxCompletionTokens}.`,
    };
  }
  if (typeof authorizeUsd !== "number" || !Number.isFinite(authorizeUsd) || authorizeUsd <= 0) {
    return { ok: false, reason: "Live benchmark requires an explicit finite --authorize-usd amount greater than zero." };
  }
  const reservationUsd = fullBenchmarkReservationUsd(config);
  if (authorizeUsd < reservationUsd) {
    return {
      ok: false,
      reason:
        `Authorization $${authorizeUsd} is below the conservative full-run reservation $${reservationUsd.toFixed(6)} ` +
        `(${TOTAL_REQUEST_BUDGET} requests); refusing before any live request.`,
    };
  }
  return { ok: true, reservationUsd };
}

export type MethodRow = {
  name: string;
  method: "baseline" | "heuristic" | "meta";
  valid: boolean;
  reachableOrders: number | null;
  weightedTravelMm: number | null;
  meanOrderDistanceMm: number | null;
  relocationCount: number;
  improvementPercent: number | null;
};

function rowOf(
  candidate: CandidateResult,
  method: MethodRow["method"],
  improvementPercent: number | null,
): MethodRow {
  return {
    name: candidate.name,
    method,
    valid: candidate.valid,
    reachableOrders: candidate.workload?.reachableOrders ?? null,
    weightedTravelMm: candidate.weightedTravelMm,
    meanOrderDistanceMm: candidate.workload?.meanOrderDistanceMm ?? null,
    relocationCount: candidate.relocationCount,
    improvementPercent,
  };
}

export type TrialComparison = {
  baseline: MethodRow;
  heuristic: MethodRow | { available: false; reason: string };
  metaFirst: MethodRow | { available: false; reason: string };
  metaFeedback: (MethodRow & { winningIteration: string }) | { available: false; reason: string };
  selected: "baseline" | "heuristic" | "meta" | null;
};

function isRow(v: unknown): v is MethodRow {
  return typeof v === "object" && v !== null && !("available" in v);
}

// Per-trial comparison from an evaluated server report: current, bounded
// heuristic, ACTUAL first Meta attempt (N/A when invalid), best-valid Meta
// proposal with feedback (winning iteration, N/A when none), and the overall
// selected method kept separate so a baseline/heuristic win is never
// credited to Meta. Invalid baselines yield N/A improvement via core.
export function compareTrialReport(report: M3ReportEnvelope): TrialComparison {
  const pct = (name: string): number | null => report.improvementPercents[name] ?? null;
  const baseline = rowOf(report.baseline, "baseline", pct("baseline"));
  const heuristic = report.heuristic?.candidate
    ? rowOf(report.heuristic.candidate, "heuristic", pct(report.heuristic.candidate.name))
    : { available: false as const, reason: "heuristic produced no candidate" };
  const first = report.attempts[0];
  const metaFirst =
    first?.candidate && first.candidate.valid
      ? rowOf(first.candidate, "meta", pct(first.candidate.name))
      : { available: false as const, reason: "actual first Meta attempt was invalid or missing" };
  const validMeta = report.attempts.filter((a) => a.candidate?.valid && a.candidate.weightedTravelMm !== null);
  validMeta.sort((a, b) => {
    const ca = a.candidate as CandidateResult;
    const cb = b.candidate as CandidateResult;
    if ((ca.weightedTravelMm as number) !== (cb.weightedTravelMm as number)) {
      return (ca.weightedTravelMm as number) - (cb.weightedTravelMm as number);
    }
    if (ca.relocationCount !== cb.relocationCount) return ca.relocationCount - cb.relocationCount;
    return ca.assignmentKey < cb.assignmentKey ? -1 : ca.assignmentKey > cb.assignmentKey ? 1 : 0;
  });
  const best = validMeta[0];
  const metaFeedback =
    best?.candidate
      ? { ...rowOf(best.candidate, "meta", pct(best.candidate.name)), winningIteration: best.name }
      : { available: false as const, reason: "no valid Meta proposal in any iteration" };
  const label = report.bestName ? report.methodLabels[report.bestName] : undefined;
  const selected =
    label === "current" ? "baseline" : label === "heuristic" ? "heuristic" : label === "meta-first" || label === "meta-feedback" ? "meta" : null;
  return { baseline, heuristic, metaFirst, metaFeedback, selected };
}

export type TrialRecord = {
  scenarioId: BenchmarkId;
  trialIndex: number;
  runId: string | null;
  providerKind: "meta" | "fixture";
  realMetaRequests: number;
  interpretedDraft: unknown;
  normalization: string;
  reportAvailable: boolean;
  comparison: TrialComparison | null;
  // requestsUsed is the last OBSERVED server count (a lower bound when the
  // trial is ambiguous); requestsReserved is the cost bound committed before
  // the trial (live: 4, otherwise 0). Unknown actuals stay unknown: an
  // ambiguous trial never reports its observed 0 as an actual 0.
  requestsUsed: number;
  requestsReserved: number;
  ambiguous: { reason: string } | null;
  proposalsUsed: number;
  budgets: { maxProposals: number; maxRequests: number; timeoutMs: number };
  usageTotals: ProviderUsage | null;
  usageIncomplete: boolean;
  failure: { state: string; lastError: string | null } | null;
  notRun: { reason: string } | null;
  report: M3ReportEnvelope | null;
  failureRecord: M5FailureEnvelope | null;
};

export type ScenarioResult = {
  scenarioId: BenchmarkId;
  offline: { baseline: MethodRow; heuristic: MethodRow | { available: false; reason: string } };
  trials: TrialRecord[];
};

export type BenchmarkReport = {
  benchmarkVersion: typeof BENCHMARK_VERSION;
  generatedAt: string;
  mode: "offline" | "fixture" | "live";
  providerKind: "meta" | "fixture";
  realMetaRequests: number;
  freeze: {
    sourceCommit: string;
    sourceDirty: boolean;
    protocol: string;
    promptVersion: string;
    generationSettings: GenerationSettings;
    apiVersion: string;
    coreVersion: string;
    reportVersion: string;
    routePolicy: string;
    modelId: string;
    manifest: BenchmarkManifest;
    rackAsset: { assetId: string; glbSha256: string };
  };
  totals: {
    scenarios: number;
    trialsPlanned: number;
    trialsRun: number;
    trialsNotRun: number;
    modelRequests: number;
    realMetaRequests: number;
    failures: number;
    reportsAvailable: number;
    reportsMissing: number;
    requestsReserved: number;
    ambiguousTrials: number;
    requestsUnknown: boolean;
  };
  costs: {
    reservationUsd: number;
    usageEstimated: ReturnType<typeof usageEstimatedUsd>;
    invoiceUsd: null;
    invoiceNote: string;
    pricingSource: string;
  };
  scenarios: ScenarioResult[];
  limitations: string[];
};

export const BENCHMARK_LIMITATIONS = [
  "Conservative 2D clearance model: not a safety certification or complete maneuverability assessment.",
  "Nearest-neighbor routing is deterministic but not globally optimal.",
  "Travel reduction is not converted to labor, monetary, or throughput improvement.",
  "Benchmark scenarios are declared synthetic fixtures, not published datasets or reconstructions.",
  "Method budgets differ across baseline, heuristic, and Meta runs (no equal-compute claim).",
  "Fixture trials exercise orchestration only; they say nothing about live model behavior.",
  "Costs report a conservative reservation and a usage estimate separately; no invoice is retrieved and no complete billed usage is invented.",
] as const;

type HttpSummary = {
  runId: string;
  state: string;
  expiresAt: string;
  modelRequestsUsed: number;
  proposalsUsed: number;
  budgets: TrialRecord["budgets"];
  requirementsDraft: unknown;
  usageTotals: ProviderUsage | null;
  usageIncomplete: boolean;
  providerKind: "meta" | "fixture";
  realMetaRequests: number;
  lastError: string | null;
};

// Every runner HTTP call is bounded: a hung server must surface as an
// ambiguous trial (known run ID preserved), never a hung benchmark.
export const RUNNER_HTTP_TIMEOUT_MS = 30000;

async function postJson(
  apiBase: string,
  path: string,
  body: unknown,
  httpTimeoutMs: number,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(httpTimeoutMs),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

async function getJson(
  apiBase: string,
  path: string,
  httpTimeoutMs: number,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${apiBase}${path}`, { signal: AbortSignal.timeout(httpTimeoutMs) });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

async function pollTerminal(
  apiBase: string,
  runId: string,
  deadlineMs: number,
  httpTimeoutMs: number,
): Promise<HttpSummary> {
  for (;;) {
    const r = await getJson(apiBase, `/api/runs/${runId}`, httpTimeoutMs);
    const s = r.json as unknown as HttpSummary;
    if (typeof s.state !== "string") throw new Error(`Trial run ${runId} returned a malformed summary.`);
    if (s.state !== "INTERPRETING" && s.state !== "RUNNING") return s;
    if (Date.now() > deadlineMs) throw new Error(`Trial run ${runId} polling exceeded its deadline.`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Live journal callbacks: the caller persists the pending trial plus its
// reservation BEFORE create, the run ID immediately after 202 (before any
// poll/approval), and every observed step after. RAM alone never holds the
// only copy of a paid trial's identity.
export type TrialCallbacks = {
  onPending?: (trial: TrialRecord) => void;
  onCreated?: (trial: TrialRecord) => void;
  onProgress?: (trial: TrialRecord) => void;
};

export type TrialOptions = {
  trialIndex?: number;
  requestsReserved?: number;
  httpTimeoutMs?: number;
  callbacks?: TrialCallbacks;
};

function transportReason(e: unknown): string {
  const msg = e instanceof Error ? e.message : "unknown transport error";
  return msg.slice(0, 200);
}

// One benchmark trial against a running API server: create (run ID preserved
// immediately), interpret, approve with the PREDETERMINED scenario contract
// (the interpreted draft is retained for provenance; approval never uses it
// as-is), then collect the evaluated report — or, when evaluation never
// occurred, persist the failure audit and mark the report unavailable so the
// trial is never lost. No retries, no extra requests beyond the run budget.
//
// Transport/timeout/malformed failures never retry a paid step: after ONE
// read-only reconcile GET, an unreconciled trial is recorded AMBIGUOUS with
// its known run ID preserved. Observed counts stay lower bounds; the actual
// server-side count is unknown, never invented as 0.
export async function runTrial(
  apiBase: string,
  scenario: Scenario,
  contract: PlanningRequirements,
  requestText: string,
  opts: TrialOptions = {},
): Promise<TrialRecord> {
  const httpTimeoutMs = opts.httpTimeoutMs ?? RUNNER_HTTP_TIMEOUT_MS;
  const callbacks = opts.callbacks ?? {};
  const base: TrialRecord = {
    scenarioId: scenario.id as BenchmarkId,
    trialIndex: opts.trialIndex ?? 0,
    runId: null,
    providerKind: "fixture",
    realMetaRequests: 0,
    interpretedDraft: null,
    normalization: "",
    reportAvailable: false,
    comparison: null,
    requestsUsed: 0,
    requestsReserved: opts.requestsReserved ?? 0,
    ambiguous: null,
    proposalsUsed: 0,
    budgets: { maxProposals: 3, maxRequests: MAX_REQUESTS_PER_TRIAL, timeoutMs: 120000 },
    usageTotals: null,
    usageIncomplete: false,
    failure: null,
    notRun: null,
    report: null,
    failureRecord: null,
  };
  const markAmbiguous = (reason: string): TrialRecord => {
    base.ambiguous = { reason };
    callbacks.onProgress?.(base);
    return base;
  };
  const reconcile = async (): Promise<HttpSummary | null> => {
    if (!base.runId) return null;
    try {
      const r = await getJson(apiBase, `/api/runs/${base.runId}`, httpTimeoutMs);
      const s = r.json as unknown as HttpSummary;
      return r.status === 200 && typeof s.state === "string" ? s : null;
    } catch {
      return null;
    }
  };
  const observe = (summary: HttpSummary): void => {
    base.providerKind = summary.providerKind;
    base.realMetaRequests = summary.realMetaRequests;
    base.requestsUsed = summary.modelRequestsUsed;
    base.proposalsUsed = summary.proposalsUsed;
    base.budgets = summary.budgets;
    base.usageTotals = summary.usageTotals;
    base.usageIncomplete = summary.usageIncomplete;
    callbacks.onProgress?.(base);
  };
  callbacks.onPending?.(base); // pending trial + reservation journaled before create
  let created: { status: number; json: Record<string, unknown> };
  try {
    created = await postJson(apiBase, "/api/runs", { scenario, requestText, mode: "live", consent: true }, httpTimeoutMs);
  } catch (e) {
    // No run ID was observed: the server may or may not have created a run.
    return markAmbiguous(`create transport failed (${transportReason(e)}); server-side state unknown`);
  }
  if (created.status === 401 || created.status === 403) {
    base.failure = { state: "AUTH_DENIED", lastError: `create refused: HTTP ${created.status}` };
    callbacks.onProgress?.(base);
    return base;
  }
  if (created.status !== 202) {
    base.failure = {
      state: "CREATE_FAILED",
      lastError: `create failed: HTTP ${created.status} ${(created.json["message"] as string) ?? ""}`.slice(0, 300),
    };
    callbacks.onProgress?.(base);
    return base;
  }
  const runId = (created.json as unknown as HttpSummary).runId;
  if (typeof runId !== "string" || runId.length === 0) {
    return markAmbiguous("create returned 202 with a malformed run ID; server-side state unknown");
  }
  base.runId = runId; // preserved immediately; never recreated on interruption
  callbacks.onCreated?.(base);
  const expiresMs = Date.parse((created.json as unknown as HttpSummary).expiresAt);
  const deadlineMs = (Number.isFinite(expiresMs) ? expiresMs : Date.now() + 120000) + 15000;
  let summary: HttpSummary | null = null;
  try {
    summary = await pollTerminal(apiBase, runId, deadlineMs, httpTimeoutMs);
  } catch (e) {
    summary = await reconcile();
    if (!summary || summary.state === "INTERPRETING" || summary.state === "RUNNING") {
      return markAmbiguous(
        `poll failed (${transportReason(e)}) with an outstanding run; refusing paid retries`,
      );
    }
  }
  observe(summary);
  base.interpretedDraft = summary.requirementsDraft ?? null;
  if (summary.state === "AWAITING_APPROVAL") {
    const draft = summary.requirementsDraft as { unresolvedQuestions?: unknown } | null;
    const open = Array.isArray(draft?.unresolvedQuestions) ? (draft?.unresolvedQuestions as unknown[]).length : 0;
    base.normalization =
      `Predetermined benchmark contract approved; interpreted draft retained for provenance` +
      (open > 0 ? ` (${open} draft question(s) manually normalized away).` : " (draft carried no open questions).");
    let approved: { status: number; json: Record<string, unknown> };
    try {
      approved = await postJson(apiBase, `/api/runs/${runId}/approve`, { requirements: contract }, httpTimeoutMs);
    } catch (e) {
      const settled = await reconcile();
      if (!settled || settled.state === "AWAITING_APPROVAL") {
        return markAmbiguous(`approve transport failed (${transportReason(e)}); approval state unknown, not retried`);
      }
      observe(settled);
      summary = settled;
      approved = { status: 200, json: {} }; // reconcile proved the approval landed
    }
    if (approved.status !== 200) {
      base.failure = {
        state: "APPROVE_FAILED",
        lastError: `approve failed: HTTP ${approved.status} ${(approved.json["message"] as string) ?? ""}`.slice(0, 300),
      };
      callbacks.onProgress?.(base);
      return base;
    }
    const fresh = await reconcile();
    if (fresh) {
      observe(fresh);
      summary = fresh;
    }
  } else {
    base.normalization = "Run never reached approval; no contract was applied.";
  }
  let report: { status: number; json: Record<string, unknown> };
  try {
    report = await getJson(apiBase, `/api/runs/${runId}/report`, httpTimeoutMs);
  } catch (e) {
    return markAmbiguous(`report fetch failed (${transportReason(e)}); report availability unknown`);
  }
  if (report.status === 200) {
    const envelope = report.json as unknown as M3ReportEnvelope;
    base.report = envelope;
    base.reportAvailable = true;
    base.comparison = compareTrialReport(envelope);
    callbacks.onProgress?.(base);
    return base;
  }
  // Evaluation never occurred: persist the failure audit, mark the report
  // unavailable, and keep the trial. Never synthesize success metrics.
  let failure: { status: number; json: Record<string, unknown> };
  try {
    failure = await getJson(apiBase, `/api/runs/${runId}/failure-report`, httpTimeoutMs);
  } catch (e) {
    return markAmbiguous(`failure-report fetch failed (${transportReason(e)}); report availability unknown`);
  }
  if (failure.status === 200) {
    const envelope = failure.json as unknown as M5FailureEnvelope;
    base.failureRecord = envelope;
    base.failure = { state: envelope.state, lastError: envelope.lastError };
    callbacks.onProgress?.(base);
    return base;
  }
  base.failure = {
    state: summary.state,
    lastError: `report HTTP ${report.status}; failure-report HTTP ${failure.status}; ${summary.lastError ?? "no report"}`.slice(0, 300),
  };
  callbacks.onProgress?.(base);
  return base;
}

export function isAuthDenial(trial: TrialRecord): boolean {
  if (trial.failure?.state === "AUTH_DENIED") return true;
  const text = `${trial.failure?.lastError ?? ""} ${(trial.failureRecord?.lastError ?? "")}`;
  if (/HTTP 40[13]/.test(text)) return true;
  const codes = (trial.report?.attempts ?? []).map((a) => a.diagnostics?.errorCode);
  return codes.includes("AUTH_FAILED");
}

export function offlineScenario(scenario: Scenario, contract: PlanningRequirements): ScenarioResult["offline"] {
  const baseline = evaluateBaseline(scenario, contract);
  const report = createReport(scenario, contract, []);
  const heuristic = runHeuristic(scenario, contract, {});
  return {
    baseline: rowOf(baseline, "baseline", report.improvementPercents["baseline"] ?? null),
    heuristic: heuristic.candidate
      ? rowOf(
        heuristic.candidate,
        "heuristic",
        createReport(scenario, contract, [{ name: "heuristic", mapping: heuristic.mapping }]).improvementPercents["heuristic"] ?? null,
      )
      : { available: false as const, reason: "heuristic produced no candidate" },
  };
}

function totalsOf(scenarios: ScenarioResult[], mode: BenchmarkReport["mode"], reservationUsd: number): BenchmarkReport {
  const trials = scenarios.flatMap((s) => s.trials);
  const sumUsage = (key: "promptTokens" | "completionTokens" | "totalTokens"): number | null => {
    let sum = 0;
    let any = false;
    for (const t of trials) {
      const v = t.report?.usageTotals?.[key] ?? t.failureRecord?.usageTotals?.[key] ?? null;
      if (v !== null) {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  };
  const usageIncomplete = mode === "offline" ? false : trials.some((t) => t.usageIncomplete);
  const usageTotals =
    mode === "offline" ? null : { promptTokens: sumUsage("promptTokens"), completionTokens: sumUsage("completionTokens"), totalTokens: sumUsage("totalTokens") };
  return {
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    providerKind: mode === "live" ? "meta" : "fixture",
    realMetaRequests: trials.reduce((n, t) => n + t.realMetaRequests, 0),
    freeze: {
      sourceCommit: "unknown",
      sourceDirty: true,
      protocol: PROTOCOL_ID,
      promptVersion: PROMPT_VERSION,
      generationSettings: { reasoningEffort: "low", maxCompletionTokens: 2000 },
      apiVersion: API_VERSION,
      coreVersion: CORE_VERSION,
      reportVersion: REPORT_VERSION,
      routePolicy: ROUTE_POLICY_ID,
      modelId: mode === "live" ? LIVE_MODEL_ID : FIXTURE_MODEL_ID,
      manifest: {
        benchmarkVersion: BENCHMARK_VERSION,
        frozenAt: "",
        sourceCommit: "unknown",
        scenarios: [],
        requirements: { file: "", bytes: 0, sha256: "" },
      },
      rackAsset: { assetId: RACK_ASSET.assetId, glbSha256: RACK_ASSET.glbSha256 },
    },
    totals: {
      scenarios: scenarios.length,
      trialsPlanned: mode === "offline" ? 0 : scenarios.length * TRIALS_PER_SCENARIO,
      trialsRun: trials.filter((t) => t.notRun === null).length,
      trialsNotRun: trials.filter((t) => t.notRun !== null).length,
      modelRequests: trials.reduce((n, t) => n + t.requestsUsed, 0),
      realMetaRequests: trials.reduce((n, t) => n + t.realMetaRequests, 0),
      failures: trials.filter((t) => t.failure !== null).length,
      reportsAvailable: trials.filter((t) => t.reportAvailable).length,
      reportsMissing: trials.filter((t) => t.notRun === null && !t.reportAvailable).length,
      requestsReserved: trials.reduce((n, t) => n + t.requestsReserved, 0),
      ambiguousTrials: trials.filter((t) => t.ambiguous !== null).length,
      requestsUnknown: trials.some((t) => t.ambiguous !== null),
    },
    costs: {
      reservationUsd,
      usageEstimated: usageTotals === null ? null : usageEstimatedUsd(usageTotals, usageIncomplete),
      invoiceUsd: null,
      invoiceNote: "No invoice retrieved; reservation and usage estimate are reported separately and never merged.",
      pricingSource: PRICING_SOURCE,
    },
    scenarios,
    limitations: [...BENCHMARK_LIMITATIONS],
  };
}

export function buildOfflineBenchmark(rootDir: string): BenchmarkReport {
  const { manifest, scenarios, contracts } = loadBenchmark(rootDir);
  const results: ScenarioResult[] = BENCHMARK_IDS.map((id) => {
    const scenario = scenarios.get(id) as Scenario;
    const contract = contracts.get(id) as PlanningRequirements;
    return { scenarioId: id, offline: offlineScenario(scenario, contract), trials: [] };
  });
  const report = totalsOf(results, "offline", 0);
  report.freeze.manifest = manifest;
  report.freeze.sourceCommit = manifest.sourceCommit;
  report.freeze.sourceDirty = benchmarkSourceDirty(rootDir);
  return report;
}

// Ordered scripted fake transport for fixture trials: interpretation draft,
// then retain / heuristic-delta / retain proposals per trial. Deterministic
// orchestration exercise; valid by construction, never rigged invalid.
function fixtureScript(loaded: LoadedBenchmark): unknown[] {
  const script: unknown[] = [];
  for (const id of BENCHMARK_IDS) {
    const scenario = loaded.scenarios.get(id) as Scenario;
    const contract = loaded.contracts.get(id) as PlanningRequirements;
    const heuristic = runHeuristic(scenario, contract, {});
    const base = new Map(scenario.assignments.map((a) => [a.productId, a.locationId]));
    const deltas = heuristic.mapping
      .filter((a) => base.get(a.productId) !== a.locationId)
      .map((a) => ({ productId: a.productId, locationId: a.locationId }))
      .sort((x, y) => (x.productId < y.productId ? -1 : x.productId > y.productId ? 1 : 0));
    for (let t = 0; t < TRIALS_PER_SCENARIO; t++) {
      script.push({
        objective: "minimize_weighted_picking_travel",
        maxRelocatedProducts: contract.maxRelocatedProducts,
        lockedProductIds: [...contract.lockedProductIds],
        assumptions: ["fixture orchestration draft"],
        unresolvedQuestions: [],
      });
      script.push({ scenarioRevision: scenario.revision, changes: [], rationale: `Fixture trial ${t + 1}: retain baseline.` });
      script.push({
        scenarioRevision: scenario.revision,
        changes: deltas,
        rationale: `Fixture trial ${t + 1}: heuristic-shaped deltas (${deltas.length} moves).`,
      });
      script.push({ scenarioRevision: scenario.revision, changes: [], rationale: `Fixture trial ${t + 1}: retain again.` });
    }
  }
  return script;
}

export function benchmarkSourceCommit(rootDir: string): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: rootDir, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

// Readiness evidence flags uncommitted/dirty source: a dirty tree means HEAD
// predates the running code, so the coordinator commits and reruns validation
// before any live benchmark. Unknown git state is conservatively dirty.
export function benchmarkSourceDirty(rootDir: string): boolean {
  try {
    return execSync("git status --porcelain", { cwd: rootDir, encoding: "utf8" }).trim().length > 0;
  } catch {
    return true;
  }
}

// Authoritative running-server fingerprint: exact non-secret settings from
// GET /api/status. Local .env/config alone cannot prove what the server
// enforces, so live preflight and every trial check this before any create.
export type ServerFingerprint = {
  modelId: string;
  providerKind: string;
  maxProposals: number;
  maxRequests: number;
  timeoutMs: number;
  reasoningEffort: string;
  maxCompletionTokens: number;
  maxContextChars: number;
  maxResponseBytes: number;
  promptVersion: string;
  apiVersion: string;
  coreVersion: string;
  routePolicy: string;
  heuristicMaxEvaluations: number;
};

export async function readServerFingerprint(apiBase: string, httpTimeoutMs: number): Promise<ServerFingerprint> {
  const r = await getJson(apiBase, "/api/status", httpTimeoutMs);
  const s = r.json as Record<string, unknown>;
  const budgets = s["budgets"] as Record<string, unknown> | undefined;
  const gen = s["generationSettings"] as Record<string, unknown> | undefined;
  const caps = s["contextCaps"] as Record<string, unknown> | undefined;
  if (
    r.status !== 200 || typeof s["modelId"] !== "string" || typeof s["providerKind"] !== "string" ||
    typeof budgets?.["maxProposals"] !== "number" || typeof budgets?.["maxRequests"] !== "number" ||
    typeof budgets?.["timeoutMs"] !== "number" || typeof gen?.["reasoningEffort"] !== "string" ||
    typeof gen?.["maxCompletionTokens"] !== "number" || typeof caps?.["maxContextChars"] !== "number" ||
    typeof caps?.["maxResponseBytes"] !== "number" || typeof s["promptVersion"] !== "string" ||
    typeof s["apiVersion"] !== "string" || typeof s["coreVersion"] !== "string" ||
    typeof s["routePolicy"] !== "string" || typeof s["heuristicMaxEvaluations"] !== "number"
  ) {
    throw new Error(`Server fingerprint unreadable (status HTTP ${r.status}); refusing to start paid trials.`);
  }
  return {
    modelId: s["modelId"] as string,
    providerKind: s["providerKind"] as string,
    maxProposals: budgets["maxProposals"] as number,
    maxRequests: budgets["maxRequests"] as number,
    timeoutMs: budgets["timeoutMs"] as number,
    reasoningEffort: gen["reasoningEffort"] as string,
    maxCompletionTokens: gen["maxCompletionTokens"] as number,
    maxContextChars: caps["maxContextChars"] as number,
    maxResponseBytes: caps["maxResponseBytes"] as number,
    promptVersion: s["promptVersion"] as string,
    apiVersion: s["apiVersion"] as string,
    coreVersion: s["coreVersion"] as string,
    routePolicy: s["routePolicy"] as string,
    heuristicMaxEvaluations: s["heuristicMaxEvaluations"] as number,
  };
}

export function checkServerFingerprint(fp: ServerFingerprint, config: ApiConfig): { ok: true } | { ok: false; reason: string } {
  if (fp.providerKind !== "meta" || fp.providerKind !== config.providerKind) {
    return { ok: false, reason: `server providerKind ${fp.providerKind} does not match the frozen official protocol` };
  }
  if (fp.modelId !== LIVE_MODEL_ID || fp.modelId !== config.modelId) {
    return { ok: false, reason: `server model ${fp.modelId} is not the frozen ${LIVE_MODEL_ID}` };
  }
  const want = { maxProposals: 3, maxRequests: MAX_REQUESTS_PER_TRIAL, timeoutMs: 120000 };
  if (fp.maxProposals !== want.maxProposals || fp.maxRequests !== want.maxRequests || fp.timeoutMs !== want.timeoutMs) {
    return {
      ok: false,
      reason: `server budgets ${fp.maxProposals}/${fp.maxRequests}/${fp.timeoutMs} differ from the frozen 3/4/120000 caps`,
    };
  }
  if (fp.reasoningEffort !== "low" || fp.maxCompletionTokens !== 2000) {
    return { ok: false, reason: "server generation settings differ from the frozen reasoning-low/2000-token protocol" };
  }
  if (fp.maxContextChars !== config.maxContextChars || fp.maxResponseBytes !== config.maxResponseBytes) {
    return { ok: false, reason: "server context caps differ from the frozen cost-bound inputs" };
  }
  if (fp.promptVersion !== PROMPT_VERSION || fp.apiVersion !== API_VERSION || fp.coreVersion !== CORE_VERSION) {
    return { ok: false, reason: "server prompt/API/core versions differ from the frozen protocol" };
  }
  if (fp.routePolicy !== ROUTE_POLICY_ID) {
    return { ok: false, reason: "server route policy differs from the frozen evaluator" };
  }
  if (fp.heuristicMaxEvaluations !== DEFAULT_HEURISTIC_MAX_EVALUATIONS) {
    return {
      ok: false,
      reason: `server heuristic budget ${fp.heuristicMaxEvaluations} differs from the frozen ${DEFAULT_HEURISTIC_MAX_EVALUATIONS}`,
    };
  }
  return { ok: true };
}

// FIXTURE mode: complete 6x3=18-trial orchestration against a local fake
// transport plus the real API server on an ephemeral loopback port.
// providerKind fixture, realMetaRequests 0, no key material anywhere.
export async function runFixtureBenchmark(rootDir: string): Promise<BenchmarkReport> {
  const loaded = loadBenchmark(rootDir);
  const script = fixtureScript(loaded);
  let served = 0;
  let transportRequests = 0;
  const fake: Server = createServer((req, res) => {
    if (req.method !== "POST" || !((req.url ?? "").endsWith("/chat/completions"))) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("benchmark fixture: only POST */chat/completions");
      return;
    }
    req.resume();
    req.on("end", () => {
      transportRequests++;
      const contentJson = script[Math.min(served, script.length - 1)];
      served++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: `chatcmpl-benchmark-fixture-${served}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: FIXTURE_MODEL_ID,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(contentJson) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
      }));
    });
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const fakePort = (fake.address() as { port: number }).port;
  // Explicit fixture env: never inherit a real key or model id.
  const config = loadConfig({
    ...process.env,
    META_API_BASE_URL: `http://127.0.0.1:${fakePort}/v1`,
    META_MODEL_ID: FIXTURE_MODEL_ID,
    MODEL_API_KEY: FIXTURE_KEY,
  });
  if (config.providerKind !== "fixture") throw new Error("Fixture benchmark requires a loopback fake transport.");
  const { app } = createApp({ config });
  const api = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s as unknown as Server));
  });
  const apiBase = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
  try {
    const results: ScenarioResult[] = [];
    for (const id of BENCHMARK_IDS) {
      const scenario = loaded.scenarios.get(id) as Scenario;
      const contract = loaded.contracts.get(id) as PlanningRequirements;
      const requestText = loaded.requestTexts.get(id) as string;
      const trials: TrialRecord[] = [];
      for (let t = 0; t < TRIALS_PER_SCENARIO; t++) {
        const trial = await runTrial(apiBase, scenario, contract, requestText, { trialIndex: t });
        trials.push(trial);
      }
      results.push({ scenarioId: id, offline: offlineScenario(scenario, contract), trials });
    }
    if (transportRequests !== BENCHMARK_IDS.length * TRIALS_PER_SCENARIO * MAX_REQUESTS_PER_TRIAL) {
      throw new Error(`Fixture benchmark made ${transportRequests} transport requests, expected 72.`);
    }
    const report = totalsOf(results, "fixture", 0);
    report.freeze.manifest = loaded.manifest;
    report.freeze.sourceCommit = benchmarkSourceCommit(rootDir);
    report.freeze.sourceDirty = benchmarkSourceDirty(rootDir);
    report.freeze.generationSettings = generationSettingsOf(config);
    if (report.totals.realMetaRequests !== 0) throw new Error("Fixture benchmark must report realMetaRequests 0.");
    return report;
  } finally {
    await new Promise<void>((resolve) => api.close(() => resolve()));
    await new Promise<void>((resolve) => fake.close(() => resolve()));
  }
}

// Canonical JSON for pairing checks: recursive sorted-key stringify so key
// order can never hide a mutated workload.
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${canonicalJson(val)}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

// Re-evaluate a saved benchmark report without inference: recompute every
// offline measurement, replay every embedded server report, validate every
// failure audit (explicit no-evaluation boundary), verify frozen hashes and
// settings, AND verify frozen pairing and coverage — each embedded
// report/audit must carry the exact frozen scenario and approved contract
// for its scenario slot (a self-consistent report on a mutated workload is
// rejected), the six scenario IDs appear exactly once, trial slots and
// indexes are exact per mode, and aggregate counts respect the caps. Never
// contacts a model.
export function replayBenchmarkReport(reportJson: unknown, rootDir: string): { matchesSaved: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const report = reportJson as BenchmarkReport;
  if (!report || typeof report !== "object") throw new Error("Benchmark report is not an object.");
  if (report.benchmarkVersion !== BENCHMARK_VERSION) throw new Error("Benchmark report version mismatch.");
  if (report.mode !== "offline" && report.mode !== "fixture" && report.mode !== "live") {
    throw new Error("Benchmark report mode must be offline, fixture, or live.");
  }
  if ((report.mode === "offline" || report.mode === "fixture") && report.providerKind !== "fixture") {
    mismatches.push("mode.providerKind");
  }
  if (report.mode === "live" && report.providerKind !== "meta") mismatches.push("mode.providerKind");
  const loaded = loadBenchmark(rootDir); // rechecks frozen hashes
  const frozen = report.freeze?.manifest;
  if (!frozen || JSON.stringify(frozen.scenarios) !== JSON.stringify(loaded.manifest.scenarios)) {
    throw new Error("Benchmark report manifest does not match the frozen fixtures.");
  }
  if (report.freeze?.promptVersion !== PROMPT_VERSION) mismatches.push("freeze.promptVersion");
  if (report.freeze?.protocol !== PROTOCOL_ID) mismatches.push("freeze.protocol");
  if (report.freeze?.coreVersion !== CORE_VERSION || report.freeze?.routePolicy !== ROUTE_POLICY_ID) {
    mismatches.push("freeze.coreVersion/routePolicy");
  }
  if (typeof report.freeze?.sourceDirty !== "boolean") mismatches.push("freeze.sourceDirty");
  if (!Array.isArray(report.scenarios) || report.scenarios.length !== 6) {
    throw new Error("Benchmark report must hold exactly 6 scenario results.");
  }
  const seenIds = new Set<string>();
  for (const saved of report.scenarios) {
    if (seenIds.has(saved.scenarioId)) mismatches.push(`coverage.duplicate-${saved.scenarioId}`);
    seenIds.add(saved.scenarioId);
  }
  for (const id of BENCHMARK_IDS) {
    if (!seenIds.has(id)) mismatches.push(`coverage.missing-${id}`);
  }
  for (const saved of report.scenarios) {
    const scenario = loaded.scenarios.get(saved.scenarioId);
    const contract = loaded.contracts.get(saved.scenarioId);
    if (!scenario || !contract) throw new Error(`Benchmark report lists unknown scenario ${saved.scenarioId}.`);
    const frozenScenario = canonicalJson(scenario);
    const frozenContract = canonicalJson(contract);
    const fresh = offlineScenario(scenario, contract);
    if (JSON.stringify(fresh) !== JSON.stringify(saved.offline)) mismatches.push(`${saved.scenarioId}.offline`);
    if (!Array.isArray(saved.trials)) throw new Error(`Benchmark scenario ${saved.scenarioId} trials must be an array.`);
    const wantSlots = report.mode === "offline" ? 0 : TRIALS_PER_SCENARIO;
    if (saved.trials.length !== wantSlots) {
      mismatches.push(`${saved.scenarioId}.trial-slots`);
      continue;
    }
    const indexes = saved.trials.map((t) => t.trialIndex).sort();
    if (JSON.stringify(indexes) !== JSON.stringify([...Array(wantSlots).keys()])) {
      mismatches.push(`${saved.scenarioId}.trial-indexes`);
    }
    for (const trial of saved.trials) {
      const tag = `${saved.scenarioId}.trial-${trial.trialIndex}`;
      if (trial.scenarioId !== saved.scenarioId) mismatches.push(`${tag}.scenario-id`);
      if (trial.notRun) {
        // Explicitly not run: bare record with a reason, nothing claimed.
        if (
          typeof trial.notRun.reason !== "string" || trial.notRun.reason.length === 0 || trial.runId !== null ||
          trial.report !== null || trial.failureRecord !== null || trial.comparison !== null ||
          trial.requestsUsed !== 0 || trial.requestsReserved !== 0 || trial.ambiguous !== null || trial.failure !== null
        ) {
          mismatches.push(`${tag}.not-run-shape`);
        }
        continue;
      }
      if (trial.reportAvailable && trial.report) {
        // Pairing first: the embedded report must be FOR this frozen slot.
        if (trial.report.scenario.id !== saved.scenarioId) mismatches.push(`${tag}.pairing-scenario-id`);
        if (canonicalJson(trial.report.scenario) !== frozenScenario) mismatches.push(`${tag}.pairing-scenario`);
        if (canonicalJson(trial.report.requirements) !== frozenContract) mismatches.push(`${tag}.pairing-requirements`);
        if (trial.runId === null || trial.report.runId !== trial.runId) mismatches.push(`${tag}.pairing-run-id`);
        const replayed = replayReport({
          reportVersion: trial.report.reportVersion,
          coreVersion: trial.report.coreVersion,
          routePolicy: trial.report.routePolicy,
          scenario: trial.report.scenario,
          requirements: trial.report.requirements,
          baseline: trial.report.baseline,
          candidates: trial.report.candidates,
          bestName: trial.report.bestName,
          improvementPercents: trial.report.improvementPercents,
          outcome: trial.report.outcome,
        });
        if (!replayed.matchesSaved) mismatches.push(`${tag}.measurements:${replayed.mismatches.join("+")}`);
        const freshComparison = compareTrialReport(trial.report);
        if (JSON.stringify(freshComparison) !== JSON.stringify(trial.comparison)) {
          mismatches.push(`${tag}.comparison`);
        }
        if (trial.report.promptVersion !== report.freeze.promptVersion) mismatches.push(`${tag}.promptVersion`);
        if (JSON.stringify(trial.report.generationSettings) !== JSON.stringify(report.freeze.generationSettings)) {
          mismatches.push(`${tag}.generationSettings`);
        }
        if (trial.report.providerKind !== report.providerKind) mismatches.push(`${tag}.providerKind`);
        if (trial.requestsUsed !== trial.report.modelRequestsUsed) mismatches.push(`${tag}.requestsUsed`);
        if (trial.proposalsUsed !== trial.report.proposalsUsed) mismatches.push(`${tag}.proposalsUsed`);
        if (trial.realMetaRequests !== trial.report.realMetaRequests) mismatches.push(`${tag}.realMetaRequests`);
      } else if (trial.failureRecord) {
        // Failure audits validate but never claim a measurement match; their
        // workload pairing is still exact.
        if (trial.failureRecord.scenario.id !== saved.scenarioId) mismatches.push(`${tag}.pairing-scenario-id`);
        if (canonicalJson(trial.failureRecord.scenario) !== frozenScenario) mismatches.push(`${tag}.pairing-scenario`);
        if (
          trial.failureRecord.requirements !== null &&
          canonicalJson(trial.failureRecord.requirements) !== frozenContract
        ) {
          mismatches.push(`${tag}.pairing-requirements`);
        }
        if (trial.runId === null || trial.failureRecord.runId !== trial.runId) mismatches.push(`${tag}.pairing-run-id`);
        const audit = replayFailureRecord(trial.failureRecord);
        if (audit.evaluated !== false) mismatches.push(`${tag}.failure-boundary`);
        if (trial.comparison !== null) mismatches.push(`${tag}.failure-comparison-must-be-null`);
        if (trial.requestsUsed !== trial.failureRecord.modelRequestsUsed) mismatches.push(`${tag}.requestsUsed`);
        if (trial.realMetaRequests !== trial.failureRecord.realMetaRequests) mismatches.push(`${tag}.realMetaRequests`);
      } else {
        mismatches.push(`${tag}.missing-report-and-audit`);
      }
    }
  }
  const trials = report.scenarios.flatMap((s) => s.trials);
  const count = {
    trialsRun: trials.filter((t) => t.notRun === null).length,
    trialsNotRun: trials.filter((t) => t.notRun !== null).length,
    modelRequests: trials.reduce((n, t) => n + t.requestsUsed, 0),
    realMetaRequests: trials.reduce((n, t) => n + t.realMetaRequests, 0),
    failures: trials.filter((t) => t.failure !== null).length,
    reportsAvailable: trials.filter((t) => t.reportAvailable).length,
    reportsMissing: trials.filter((t) => t.notRun === null && !t.reportAvailable).length,
    requestsReserved: trials.reduce((n, t) => n + t.requestsReserved, 0),
    ambiguousTrials: trials.filter((t) => t.ambiguous !== null).length,
  };
  if (report.totals.trialsRun !== count.trialsRun) mismatches.push("totals.trialsRun");
  if (report.totals.trialsNotRun !== count.trialsNotRun) mismatches.push("totals.trialsNotRun");
  if (report.totals.modelRequests !== count.modelRequests) mismatches.push("totals.modelRequests");
  if (report.totals.realMetaRequests !== count.realMetaRequests) mismatches.push("totals.realMetaRequests");
  if (report.totals.failures !== count.failures) mismatches.push("totals.failures");
  if (report.totals.reportsAvailable !== count.reportsAvailable) mismatches.push("totals.reportsAvailable");
  if (report.totals.reportsMissing !== count.reportsMissing) mismatches.push("totals.reportsMissing");
  if (report.totals.requestsReserved !== count.requestsReserved) mismatches.push("totals.requestsReserved");
  if (report.totals.ambiguousTrials !== count.ambiguousTrials) mismatches.push("totals.ambiguousTrials");
  if (report.totals.requestsUnknown !== (count.ambiguousTrials > 0)) mismatches.push("totals.requestsUnknown");
  if (count.modelRequests > TOTAL_REQUEST_BUDGET) mismatches.push("caps.modelRequests");
  if (count.realMetaRequests > TOTAL_REQUEST_BUDGET) mismatches.push("caps.realMetaRequests");
  if (report.providerKind === "fixture" && count.realMetaRequests !== 0) mismatches.push("caps.fixture-real-is-zero");
  return { matchesSaved: mismatches.length === 0, mismatches };
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`# LayoutLab M5 benchmark (${report.mode})`, "");
  lines.push(
    `Generated ${report.generatedAt} from ${report.freeze.sourceCommit} (${report.freeze.protocol}, prompt ${report.freeze.promptVersion}, ` +
      `reasoning ${report.freeze.generationSettings.reasoningEffort}, max ${report.freeze.generationSettings.maxCompletionTokens} output tokens).`,
  );
  lines.push(
    report.freeze.sourceDirty
      ? "Source: DIRTY (uncommitted changes; HEAD predates this run — commit and rerun validation before live)."
      : "Source: clean (HEAD matches this run).",
  );
  lines.push(
    `ProviderKind ${report.providerKind}; real Meta requests ${report.totals.realMetaRequests}; ` +
      `model requests observed ${report.totals.modelRequests} (reserved ${report.totals.requestsReserved}); ` +
      `trials run ${report.totals.trialsRun}/${report.totals.trialsPlanned}, ` +
      `not run ${report.totals.trialsNotRun}; reports available ${report.totals.reportsAvailable}, missing ${report.totals.reportsMissing}; ` +
      `ambiguous trials ${report.totals.ambiguousTrials}${report.totals.requestsUnknown ? " (actual counts UNKNOWN for ambiguous trials)" : ""}.`,
  );
  lines.push(
    `Costs: conservative reservation $${report.costs.reservationUsd.toFixed(4)}; ` +
      `usage estimate ${report.costs.usageEstimated ? `$${report.costs.usageEstimated.estimatedUsd.toFixed(6)}${report.costs.usageEstimated.partial ? " (partial)" : ""}` : "n/a"}; ` +
      "invoice not retrieved.",
  );
  lines.push("");
  if (report.mode === "live") {
    lines.push("Live Meta execution with explicit authorization. All attempts, failures, and missing reports are listed below.", "");
  } else if (report.mode === "fixture") {
    lines.push("Fixture transport only (realMetaRequests 0): orchestration exercise, not live model behavior.", "");
  } else {
    lines.push("Offline only: baseline plus bounded heuristic, zero model calls; every Meta row is N/A.", "");
  }
  const cell = (v: number | null): string => (v === null ? "N/A" : String(v));
  for (const s of report.scenarios) {
    lines.push(`## ${s.scenarioId}`, "");
    lines.push("| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |");
    lines.push("|---|---|---|---|---|---|---|");
    const base = s.offline.baseline;
    lines.push(`| current (offline) | ${base.valid} | ${cell(base.reachableOrders)} | ${cell(base.weightedTravelMm)} | ${cell(base.meanOrderDistanceMm)} | ${base.relocationCount} | ${cell(base.improvementPercent)} |`);
    const heu = s.offline.heuristic;
    lines.push(
      isRow(heu)
        ? `| heuristic (offline) | ${heu.valid} | ${cell(heu.reachableOrders)} | ${cell(heu.weightedTravelMm)} | ${cell(heu.meanOrderDistanceMm)} | ${heu.relocationCount} | ${cell(heu.improvementPercent)} |`
        : `| heuristic (offline) | N/A (${heu.reason}) | N/A | N/A | N/A | N/A | N/A |`,
    );
    if (report.mode === "offline") {
      lines.push("| Meta first | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |");
      lines.push("| Meta feedback | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |");
    } else {
      for (const t of s.trials) {
        if (t.notRun) {
          lines.push(`| trial ${t.trialIndex + 1} | NOT RUN (${t.notRun.reason}) | N/A | N/A | N/A | N/A | N/A |`);
          continue;
        }
        if (!t.comparison) {
          const why = t.ambiguous
            ? `AMBIGUOUS (${t.ambiguous.reason}; run ${t.runId ?? "unknown"})`
            : `report unavailable (${t.failure?.state ?? "unknown"})`;
          lines.push(`| trial ${t.trialIndex + 1} | ${why} | N/A | N/A | N/A | N/A | N/A |`);
          continue;
        }
        const mf = t.comparison.metaFirst;
        const mb = t.comparison.metaFeedback;
        lines.push(
          isRow(mf)
            ? `| trial ${t.trialIndex + 1} Meta first | ${mf.valid} | ${cell(mf.reachableOrders)} | ${cell(mf.weightedTravelMm)} | ${cell(mf.meanOrderDistanceMm)} | ${mf.relocationCount} | ${cell(mf.improvementPercent)} |`
            : `| trial ${t.trialIndex + 1} Meta first | N/A (${(mf as { reason: string }).reason}) | N/A | N/A | N/A | N/A | N/A |`,
        );
        lines.push(
          isRow(mb)
            ? `| trial ${t.trialIndex + 1} Meta feedback (${(mb as MethodRow & { winningIteration: string }).winningIteration}) | ${mb.valid} | ${cell(mb.reachableOrders)} | ${cell(mb.weightedTravelMm)} | ${cell(mb.meanOrderDistanceMm)} | ${mb.relocationCount} | ${cell(mb.improvementPercent)} |`
            : `| trial ${t.trialIndex + 1} Meta feedback | N/A (${(mb as { reason: string }).reason}) | N/A | N/A | N/A | N/A | N/A |`,
        );
        lines.push(`| trial ${t.trialIndex + 1} selected | ${t.comparison.selected ?? "none"} (${t.requestsUsed} requests) | N/A | N/A | N/A | N/A | N/A |`);
      }
    }
    lines.push("");
  }
  lines.push("## Limitations", "");
  for (const l of report.limitations) lines.push(`- ${l}`);
  lines.push("");
  if (report.mode !== "live") {
    lines.push("Actual live benchmark target: NOT RUN (no paid inference authorized or performed).", "");
  }
  return `${lines.join("\n")}`;
}

// LIVE mode (NOT invoked without coordinator authorization and execution):
// fixed 3 trials/scenario, at most 72 total network requests, full 4-request
// cost reservation BEFORE each trial, unique output directory with an atomic
// lock, authoritative /api/status fingerprint at preflight AND before every
// trial, immediate onCreated disk journaling, no paid retries or extra
// trials, and a full stop on conclusive auth/provider denial or an ambiguous
// outstanding run, with the remaining trials recorded as not run.
export async function runLiveBenchmark(
  rootDir: string,
  opts: { apiBase: string; outDir: string; authorizeUsd: number; config: ApiConfig },
): Promise<BenchmarkReport> {
  const loaded = loadBenchmark(rootDir);
  const preflight = preflightLive(opts.config, opts.authorizeUsd);
  if (!preflight.ok) throw new Error(`Live preflight refused: ${preflight.reason}`);
  // Source captured BEFORE the output claim: the run's own directory, lock,
  // and journal must not count as code drift. A dirty tree refuses the live
  // run outright — the coordinator commits first, then runs on clean source.
  const sourceCommit = benchmarkSourceCommit(rootDir);
  const sourceDirty = benchmarkSourceDirty(rootDir);
  if (sourceDirty) {
    throw new Error("Live benchmark refused: uncommitted source changes (commit first, then rerun on a clean tree).");
  }
  // Atomic claim: exclusive mkdir plus an O_EXCL lock file. No exists-check
  // first (TOCTOU): concurrent invocations on the same output race, one wins.
  try {
    mkdirSync(opts.outDir);
  } catch (e) {
    throw new Error(`Live output directory unavailable (refusing overwrite or duplicate run): ${opts.outDir}`);
  }
  const lockPath = join(opts.outDir, "benchmark.lock");
  try {
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), mode: "live" }), {
      flag: "wx",
    });
  } catch (e) {
    throw new Error("Live benchmark lock already present; refusing duplicate invocation.");
  }
  const writeJournal = (journal: unknown): void => {
    writeFileSync(join(opts.outDir, "checkpoint.json"), `${JSON.stringify(journal, null, 2)}\n`);
  };
  // Authoritative server fingerprint BEFORE any paid step: local config alone
  // cannot prove the running server's model, generation, or context caps.
  const fingerprint = await readServerFingerprint(opts.apiBase, RUNNER_HTTP_TIMEOUT_MS);
  const fpCheck = checkServerFingerprint(fingerprint, opts.config);
  if (!fpCheck.ok) throw new Error(`Live preflight refused: ${(fpCheck as { reason: string }).reason}.`);
  const freeze = {
    sourceCommit,
    sourceDirty,
    protocol: PROTOCOL_ID,
    promptVersion: PROMPT_VERSION,
    generationSettings: generationSettingsOf(opts.config),
    serverFingerprint: fingerprint,
    manifest: loaded.manifest,
  };
  writeFileSync(join(opts.outDir, "freeze.json"), `${JSON.stringify(freeze, null, 2)}\n`);
  const perTrialReservation = conservativeReservationUsd(MAX_REQUESTS_PER_TRIAL, opts.config.maxContextChars, opts.config.maxCompletionTokens);
  let reserved = 0;
  let usedRequests = 0;
  let stopped = false;
  let stopReason = "";
  const results: ScenarioResult[] = [];
  const journal: {
    pending: { scenarioId: string; trialIndex: number; runId: string | null; reservedUsd: number } | null;
    completed: { scenarioId: string; trialIndex: number; runId: string | null }[];
    usedRequests: number;
    reservedUsd: number;
  } = { pending: null, completed: [], usedRequests: 0, reservedUsd: 0 };
  const notRunTrial = (scenarioId: BenchmarkId, t: number): TrialRecord => ({
    scenarioId, trialIndex: t, runId: null, providerKind: "meta", realMetaRequests: 0,
    interpretedDraft: null, normalization: "", reportAvailable: false, comparison: null,
    requestsUsed: 0, requestsReserved: 0, ambiguous: null, proposalsUsed: 0,
    budgets: { maxProposals: 3, maxRequests: MAX_REQUESTS_PER_TRIAL, timeoutMs: 120000 },
    usageTotals: null, usageIncomplete: false, failure: null, notRun: { reason: stopReason },
    report: null, failureRecord: null,
  });
  for (const id of BENCHMARK_IDS) {
    const scenario = loaded.scenarios.get(id) as Scenario;
    const contract = loaded.contracts.get(id) as PlanningRequirements;
    const requestText = loaded.requestTexts.get(id) as string;
    const trials: TrialRecord[] = [];
    for (let t = 0; t < TRIALS_PER_SCENARIO; t++) {
      if (stopped) {
        trials.push(notRunTrial(id, t));
        continue;
      }
      if (usedRequests + MAX_REQUESTS_PER_TRIAL > TOTAL_REQUEST_BUDGET) {
        stopped = true;
        stopReason = `total network budget ${TOTAL_REQUEST_BUDGET} reached; remaining trials not run`;
        trials.push(notRunTrial(id, t));
        continue;
      }
      if (opts.authorizeUsd - reserved < perTrialReservation) {
        stopped = true;
        stopReason = `remaining authorization below the per-trial reservation $${perTrialReservation.toFixed(4)}; remaining trials not run`;
        trials.push(notRunTrial(id, t));
        continue;
      }
      // Per-trial fingerprint: a server settings change mid-run stops paid
      // trials before the next create (a mismatch could break the cost cap).
      let trialFp: ServerFingerprint;
      try {
        trialFp = await readServerFingerprint(opts.apiBase, RUNNER_HTTP_TIMEOUT_MS);
      } catch (e) {
        stopped = true;
        stopReason = `server fingerprint unreadable before ${id} trial ${t + 1}; remaining trials not run`;
        trials.push(notRunTrial(id, t));
        continue;
      }
      const trialFpCheck = checkServerFingerprint(trialFp, opts.config);
      if (!trialFpCheck.ok) {
        stopped = true;
        stopReason = `server fingerprint mismatch before ${id} trial ${t + 1} (${(trialFpCheck as { reason: string }).reason}); remaining trials not run`;
        trials.push(notRunTrial(id, t));
        continue;
      }
      // Per-trial frozen hash check: fixture/contract bytes must not change
      // under the run (the in-memory copies are never mutated either).
      try {
        verifyBenchmarkHashes(rootDir, loaded.manifest);
      } catch (e) {
        stopped = true;
        stopReason = `frozen benchmark bytes changed before ${id} trial ${t + 1} (${e instanceof Error ? e.message : "hash mismatch"}); remaining trials not run`;
        trials.push(notRunTrial(id, t));
        continue;
      }
      reserved += perTrialReservation; // full 4-request bound reserved BEFORE the trial
      const trialReservedUsd = reserved;
      const trial = await runTrial(opts.apiBase, scenario, contract, requestText, {
        trialIndex: t,
        requestsReserved: MAX_REQUESTS_PER_TRIAL,
        callbacks: {
          onPending: (tr) => {
            journal.pending = { scenarioId: id, trialIndex: t, runId: null, reservedUsd: trialReservedUsd };
            journal.reservedUsd = trialReservedUsd;
            writeJournal(journal);
            void tr;
          },
          onCreated: (tr) => {
            journal.pending = { scenarioId: id, trialIndex: t, runId: tr.runId, reservedUsd: trialReservedUsd };
            writeJournal(journal);
          },
          onProgress: (tr) => {
            journal.pending = { scenarioId: id, trialIndex: t, runId: tr.runId, reservedUsd: trialReservedUsd };
            writeJournal(journal);
          },
        },
      });
      usedRequests += trial.requestsUsed;
      journal.completed.push({ scenarioId: id, trialIndex: t, runId: trial.runId });
      journal.pending = null;
      journal.usedRequests = usedRequests;
      journal.reservedUsd = reserved;
      writeJournal(journal);
      if (trial.ambiguous) {
        stopped = true;
        stopReason = `ambiguous outstanding run on ${id} trial ${t + 1} (${trial.ambiguous.reason}); remaining trials not run, no paid retries`;
      } else if (isAuthDenial(trial)) {
        stopped = true;
        stopReason = `conclusive auth/provider denial on ${id} trial ${t + 1}; remaining trials not run`;
      }
      trials.push(trial);
    }
    results.push({ scenarioId: id, offline: offlineScenario(scenario, contract), trials });
  }
  const report = totalsOf(results, "live", preflight.reservationUsd);
  report.freeze.manifest = loaded.manifest;
  report.freeze.sourceCommit = freeze.sourceCommit;
  report.freeze.sourceDirty = freeze.sourceDirty;
  report.freeze.generationSettings = freeze.generationSettings;
  writeFileSync(join(opts.outDir, "benchmark.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(opts.outDir, "benchmark.md"), renderBenchmarkMarkdown(report));
  writeFileSync(join(opts.outDir, "failure-version.json"), JSON.stringify({ failureEnvelope: M5_FAILURE_VERSION }));
  return report;
}

export function writeBenchmarkFiles(report: BenchmarkReport, jsonPath: string, overwrite: boolean): { jsonPath: string; mdPath: string } {
  const mdPath = jsonPath.replace(/\.json$/, ".md");
  if (!overwrite && (existsSync(jsonPath) || existsSync(mdPath))) {
    throw new Error(`Refusing to overwrite existing benchmark output (pass --overwrite): ${jsonPath}`);
  }
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, renderBenchmarkMarkdown(report));
  return { jsonPath, mdPath };
}

