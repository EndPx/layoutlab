import {
  CORE_VERSION,
  REPORT_LIMITATIONS,
  REPORT_VERSION,
  ROUTE_POLICY_ID,
  createReport,
  replayReport,
  type Assignment,
  type PlanningRequirements,
  type Scenario,
} from "@layoutlab/core";

export const M2_ENVELOPE_VERSION = "layoutlab.m2export/1";
export const M3_ENVELOPE_VERSION = "layoutlab.m3report/1";
export const APP_VERSION = "0.3.0";
export const MAX_PROPOSALS_PER_RUN = 3;
export const MAX_MODEL_REQUESTS_PER_RUN = 4;
const MAX_ID_LEN = 128;

export type M2Provider = "stub" | "manual";

export type M2ExportEnvelope = {
  envelopeVersion: typeof M2_ENVELOPE_VERSION;
  runId: string;
  exportedAt: string;
  appVersion: string;
  coreVersion: string;
  reportVersion: string;
  routePolicy: string;
  provider: M2Provider;
  modelRequests: 0;
  budgets: { maxProposalsPerRun: number; maxModelRequestsPerRun: number; modelRequestsUsed: 0 };
  scenario: Scenario;
  requirements: PlanningRequirements;
  baseline: ReturnType<typeof createReport>["baseline"];
  candidates: ReturnType<typeof createReport>["candidates"];
  bestName: string | null;
  improvementPercents: Record<string, number | null>;
  outcome: ReturnType<typeof createReport>["outcome"];
  limitations: string[];
  provenance: Scenario["provenance"];
  assetProxyRefs: { rackId: string; proxy: string; note: string }[];
  mode: "STUB" | "MANUAL";
};

export function newRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `run-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function buildExportEnvelope(args: {
  scenario: Scenario;
  requirements: PlanningRequirements;
  entries: { name: string; mapping: Assignment[] }[];
  provider: M2Provider;
  runId: string;
}): M2ExportEnvelope {
  // Single report: core replay compares percentage records by canonical
  // sorted entries, so ranked-vs-entry key order needs no rebuild here.
  const report = createReport(args.scenario, args.requirements, args.entries);
  return {
    envelopeVersion: M2_ENVELOPE_VERSION,
    runId: args.runId,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    coreVersion: CORE_VERSION,
    reportVersion: REPORT_VERSION,
    routePolicy: ROUTE_POLICY_ID,
    provider: args.provider,
    modelRequests: 0,
    budgets: {
      maxProposalsPerRun: MAX_PROPOSALS_PER_RUN,
      maxModelRequestsPerRun: MAX_MODEL_REQUESTS_PER_RUN,
      modelRequestsUsed: 0,
    },
    scenario: report.scenario,
    requirements: report.requirements,
    baseline: report.baseline,
    candidates: report.candidates,
    bestName: report.bestName,
    improvementPercents: report.improvementPercents,
    outcome: report.outcome,
    limitations: [
      ...REPORT_LIMITATIONS,
      args.provider === "stub"
        ? "STUB provider: deterministic placeholder proposals, no Meta inference, no natural-language understanding."
        : "MANUAL provider: current assignment only, no generated proposals.",
      "3D scene uses DEVELOPMENT PROXIES; no SimReady asset loaded yet (M4).",
      "Full runtime Meta metadata comes in M3.",
    ],
    provenance: report.scenario.provenance,
    assetProxyRefs: report.scenario.racks.map((r) => ({
      rackId: r.id,
      proxy: "box",
      note: "DEVELOPMENT PROXY — no SimReady asset loaded yet (M4).",
    })),
    mode: args.provider === "stub" ? "STUB" : "MANUAL",
  };
}

export function replayEnvelope(json: unknown): {
  matchesSaved: boolean;
  mismatches: string[];
  provider: M2Provider;
  runId: string;
} {
  if (typeof json !== "object" || json === null) throw new Error("Import is not a JSON object.");
  const e = json as Record<string, unknown>;
  if (e["envelopeVersion"] !== M2_ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version (expected ${M2_ENVELOPE_VERSION}).`);
  }
  if (e["provider"] !== "stub" && e["provider"] !== "manual") {
    throw new Error("Envelope provider must be 'stub' or 'manual'.");
  }
  const provider = e["provider"] as M2Provider;
  // Provenance metadata is validated here; core replay alone cannot catch a
  // falsely claimed provider, budget, or timestamp.
  if (typeof e["runId"] !== "string" || e["runId"].length < 1 || e["runId"].length > MAX_ID_LEN) {
    throw new Error("Envelope runId must be a nonempty id.");
  }
  if (typeof e["exportedAt"] !== "string" || Number.isNaN(Date.parse(e["exportedAt"]))) {
    throw new Error("Envelope exportedAt must be a real timestamp.");
  }
  if (typeof e["appVersion"] !== "string" || e["appVersion"].length < 1) {
    throw new Error("Envelope appVersion must be nonempty.");
  }
  if (e["modelRequests"] !== 0) throw new Error("M2 envelopes must report modelRequests 0 (no live inference).");
  const budgets = e["budgets"] as Record<string, unknown> | undefined;
  if (!budgets || budgets["modelRequestsUsed"] !== 0) {
    throw new Error("M2 budgets must report modelRequestsUsed 0.");
  }
  if (budgets["maxProposalsPerRun"] !== MAX_PROPOSALS_PER_RUN) {
    throw new Error(`M2 maxProposalsPerRun must be ${MAX_PROPOSALS_PER_RUN}.`);
  }
  if (budgets["maxModelRequestsPerRun"] !== MAX_MODEL_REQUESTS_PER_RUN) {
    throw new Error(`M2 maxModelRequestsPerRun must be ${MAX_MODEL_REQUESTS_PER_RUN}.`);
  }
  if (!Array.isArray(e["candidates"])) throw new Error("Envelope candidates must be an array.");
  if (provider === "stub" && (e["candidates"] as unknown[]).length > MAX_PROPOSALS_PER_RUN) {
    throw new Error(`Stub envelopes hold at most ${MAX_PROPOSALS_PER_RUN} candidates.`);
  }
  if (provider === "manual" && (e["candidates"] as unknown[]).length !== 0) {
    throw new Error("Manual envelopes must hold zero generated candidates.");
  }
  if (e["mode"] !== (provider === "stub" ? "STUB" : "MANUAL")) {
    throw new Error("Envelope mode must match its provider.");
  }
  if (!Array.isArray(e["limitations"]) || (e["limitations"] as unknown[]).length < 1) {
    throw new Error("Envelope limitations must be nonempty.");
  }
  // Core replay recomputes every measurement without inference.
  const replayed = replayReport({
    reportVersion: e["reportVersion"],
    coreVersion: e["coreVersion"],
    routePolicy: e["routePolicy"],
    scenario: e["scenario"],
    requirements: e["requirements"],
    baseline: e["baseline"],
    candidates: e["candidates"],
    bestName: e["bestName"],
    improvementPercents: e["improvementPercents"],
    outcome: e["outcome"],
  });
  return {
    matchesSaved: replayed.matchesSaved,
    mismatches: replayed.mismatches,
    provider,
    runId: e["runId"] as string,
  };
}

// M3 live envelope: the server report is downloaded verbatim (never rebuilt
// client-side). Provenance metadata is validated here; measurements are
// recomputed by core replay without inference.
export function replayM3Envelope(json: unknown): {
  matchesSaved: boolean;
  mismatches: string[];
  provider: "meta";
  runId: string;
  modelId: string;
} {
  if (typeof json !== "object" || json === null) throw new Error("Import is not a JSON object.");
  const e = json as Record<string, unknown>;
  if (e["envelopeVersion"] !== M3_ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version (expected ${M3_ENVELOPE_VERSION}).`);
  }
  if (e["provider"] !== "meta") throw new Error("M3 envelope provider must be 'meta'.");
  if (typeof e["runId"] !== "string" || e["runId"].length < 1 || e["runId"].length > MAX_ID_LEN) {
    throw new Error("Envelope runId must be a nonempty id.");
  }
  if (typeof e["exportedAt"] !== "string" || Number.isNaN(Date.parse(e["exportedAt"]))) {
    throw new Error("Envelope exportedAt must be a real timestamp.");
  }
  if (typeof e["modelId"] !== "string" || e["modelId"].length < 1) {
    throw new Error("M3 envelope must name its model id.");
  }
  if (typeof e["promptVersion"] !== "string" || e["promptVersion"].length < 1) {
    throw new Error("M3 envelope must name its prompt version.");
  }
  const used = e["modelRequestsUsed"];
  const props = e["proposalsUsed"];
  if (typeof used !== "number" || !Number.isInteger(used) || used < 0 || used > MAX_MODEL_REQUESTS_PER_RUN) {
    throw new Error(`M3 modelRequestsUsed must be 0..${MAX_MODEL_REQUESTS_PER_RUN}.`);
  }
  if (typeof props !== "number" || !Number.isInteger(props) || props < 0 || props > MAX_PROPOSALS_PER_RUN) {
    throw new Error(`M3 proposalsUsed must be 0..${MAX_PROPOSALS_PER_RUN}.`);
  }
  if ((props as number) > (used as number)) {
    throw new Error("M3 proposalsUsed cannot exceed modelRequestsUsed.");
  }
  const budgets = e["budgets"] as Record<string, unknown> | undefined;
  const maxP = budgets?.["maxProposals"];
  const maxR = budgets?.["maxRequests"];
  const timeout = budgets?.["timeoutMs"];
  if (
    !budgets ||
    typeof maxP !== "number" || !Number.isInteger(maxP) || maxP < 0 || maxP > MAX_PROPOSALS_PER_RUN ||
    typeof maxR !== "number" || !Number.isInteger(maxR) || maxR < 0 || maxR > MAX_MODEL_REQUESTS_PER_RUN ||
    typeof timeout !== "number" || !Number.isInteger(timeout) || timeout <= 0 || timeout > 120000
  ) {
    throw new Error("M3 budgets must be integers within brief caps (3 proposals, 4 requests, 120000 ms).");
  }
  if ((used as number) > (maxR as number) || (props as number) > (maxP as number)) {
    throw new Error("M3 used counts cannot exceed budgets.");
  }
  // Explicit transport provenance: fixture runs made zero real Meta requests.
  if (e["providerKind"] !== "meta" && e["providerKind"] !== "fixture") {
    throw new Error("M3 envelope must declare providerKind 'meta' or 'fixture'.");
  }
  const real = e["realMetaRequests"];
  if (typeof real !== "number" || !Number.isInteger(real) || real < 0 || real > (used as number)) {
    throw new Error("M3 realMetaRequests must be an integer within used requests.");
  }
  if (e["providerKind"] === "fixture" && real !== 0) {
    throw new Error("M3 fixture envelopes must report realMetaRequests 0.");
  }
  if (e["providerKind"] === "meta" && real !== used) {
    throw new Error("M3 meta envelopes must account every request as a real Meta request.");
  }
  if (!Array.isArray(e["attempts"]) || (e["attempts"] as unknown[]).length !== props) {
    throw new Error("M3 attempts must match proposalsUsed.");
  }
  if (!Array.isArray(e["candidates"]) || (e["candidates"] as unknown[]).length > props) {
    throw new Error("M3 candidates cannot exceed proposalsUsed.");
  }
  if (!Array.isArray(e["limitations"]) || (e["limitations"] as unknown[]).length < 1) {
    throw new Error("Envelope limitations must be nonempty.");
  }
  const replayed = replayReport({
    reportVersion: e["reportVersion"],
    coreVersion: e["coreVersion"],
    routePolicy: e["routePolicy"],
    scenario: e["scenario"],
    requirements: e["requirements"],
    baseline: e["baseline"],
    candidates: e["candidates"],
    bestName: e["bestName"],
    improvementPercents: e["improvementPercents"],
    outcome: e["outcome"],
  });
  return {
    matchesSaved: replayed.matchesSaved,
    mismatches: replayed.mismatches,
    provider: "meta",
    runId: e["runId"] as string,
    modelId: e["modelId"] as string,
  };
}

export function replayAnyEnvelope(json: unknown): {
  matchesSaved: boolean;
  mismatches: string[];
  provider: string;
  runId: string;
} {
  const v = (json as Record<string, unknown> | null)?.["envelopeVersion"];
  if (v === M3_ENVELOPE_VERSION) return replayM3Envelope(json);
  return replayEnvelope(json);
}
