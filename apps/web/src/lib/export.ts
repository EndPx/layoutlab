import {
  CORE_VERSION,
  REPORT_LIMITATIONS,
  REPORT_VERSION,
  ROUTE_POLICY_ID,
  createReport,
  methodLabelFor,
  replayFailureRecord,
  replayReport,
  type Assignment,
  type FailureEnvelope,
  type PlanningRequirements,
  type Scenario,
} from "@layoutlab/core";
import { validGenerationSettings } from "./api";
import { webAssetRefs, type WebAssetRef } from "./rackAsset";

export const M2_ENVELOPE_VERSION = "layoutlab.m2export/1";
export const M3_ENVELOPE_VERSION = "layoutlab.m3report/1";
export const M5_FAILURE_VERSION = "layoutlab.m5failure/1";
export const APP_VERSION = "0.4.0";
export const MAX_PROPOSALS_PER_RUN = 3;
export const MAX_MODEL_REQUESTS_PER_RUN = 4;
export const MAX_HEURISTIC_EVALUATIONS = 256;
const MAX_ID_LEN = 128;

export type M4HeuristicMeta = {
  evaluationsUsed: number;
  evaluationsBudget: number;
  method: string;
  reason: string;
  retainedBaseline: boolean;
  sceneOk: boolean;
  rankingExhausted: boolean;
};

export type M4CandidateBudgets = {
  heuristic: { evaluationsUsed: number; evaluationsBudget: number };
  generated: { proposalsUsed: number; maxProposals: number };
};

const METHOD_LABELS = new Set(["current", "heuristic", "meta-first", "meta-feedback", "stub", "other"]);

function labelsFor(entries: { name: string }[]): Record<string, string> {
  const labels: Record<string, string> = { baseline: methodLabelFor("baseline") };
  for (const e of entries) labels[e.name] = methodLabelFor(e.name);
  return labels;
}

function checkHeuristicMeta(raw: unknown, what: string): void {
  if (raw === null) return;
  if (typeof raw !== "object" || raw === null) throw new Error(`${what} must be an object or null.`);
  const h = raw as Record<string, unknown>;
  const used = h["evaluationsUsed"];
  const budget = h["evaluationsBudget"];
  if (typeof used !== "number" || !Number.isInteger(used) || used < 0) {
    throw new Error(`${what}.evaluationsUsed must be a nonnegative integer.`);
  }
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 0 || budget > MAX_HEURISTIC_EVALUATIONS) {
    throw new Error(`${what}.evaluationsBudget must be 0..${MAX_HEURISTIC_EVALUATIONS}.`);
  }
  if ((used as number) > (budget as number)) throw new Error(`${what} used evaluations cannot exceed budget.`);
  if (typeof h["method"] !== "string" || (h["method"] as string).length < 1) {
    throw new Error(`${what}.method must be nonempty.`);
  }
  if (typeof h["reason"] !== "string") throw new Error(`${what}.reason must be a string.`);
  if (typeof h["retainedBaseline"] !== "boolean") throw new Error(`${what}.retainedBaseline must be boolean.`);
  if (typeof h["sceneOk"] !== "boolean") throw new Error(`${what}.sceneOk must be boolean.`);
  if (typeof h["rankingExhausted"] !== "boolean") throw new Error(`${what}.rankingExhausted must be boolean.`);
}

function checkMethodLabels(raw: unknown, names: string[], what: string): void {
  if (raw === undefined) return; // historical envelopes predate method labels
  if (typeof raw !== "object" || raw === null) throw new Error(`${what} must be a label record.`);
  const labels = raw as Record<string, unknown>;
  for (const name of ["baseline", ...names]) {
    const label = labels[name];
    if (typeof label !== "string" || !METHOD_LABELS.has(label)) {
      throw new Error(`${what} must label '${name}' with an exact method label.`);
    }
  }
}

function checkAssetRefs(raw: unknown, what: string): void {
  if (raw === undefined) return; // historical envelopes predate GLB refs
  if (!Array.isArray(raw)) throw new Error(`${what} must be an array.`);
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) throw new Error(`${what} entries must be objects.`);
    const r = entry as Record<string, unknown>;
    if (typeof r["rackId"] !== "string" || (r["rackId"] as string).length < 1) {
      throw new Error(`${what} entries must name a rackId.`);
    }
    if (r["kind"] !== "simready-glb") throw new Error(`${what} kind must be 'simready-glb'.`);
    if (typeof r["ref"] !== "string" || (r["ref"] as string).length < 1) {
      throw new Error(`${what} entries must carry a ref.`);
    }
    if (typeof r["sha256"] !== "string" || !/^[0-9a-f]{64}$/.test(r["sha256"] as string)) {
      throw new Error(`${what} entries must carry a 64-hex sha256.`);
    }
    if (typeof r["note"] !== "string") throw new Error(`${what} entries must carry a note.`);
  }
}

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
  heuristic: M4HeuristicMeta | null;
  methodLabels: Record<string, string>;
  candidateBudgets: M4CandidateBudgets;
  assetRefs: WebAssetRef[];
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
  heuristic?: M4HeuristicMeta | null;
}): M2ExportEnvelope {
  // Single report: core replay compares percentage records by canonical
  // sorted entries, so ranked-vs-entry key order needs no rebuild here.
  const report = createReport(args.scenario, args.requirements, args.entries);
  const heuristic = args.heuristic ?? null;
  const stubCount = args.entries.filter((e) => e.name !== "heuristic").length;
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
      ...(args.provider === "stub"
        ? ["Demand heuristic runs before stub proposals with its own candidate-evaluation budget; budgets differ across methods (no equal-compute claim)."]
        : []),
      "Rack meshes are SimReady GLB (CC-BY-4.0); markers and route remain development proxies.",
      "Full runtime Meta metadata comes in M3.",
    ],
    provenance: report.scenario.provenance,
    heuristic,
    methodLabels: labelsFor(args.entries),
    candidateBudgets: {
      heuristic: {
        evaluationsUsed: heuristic?.evaluationsUsed ?? 0,
        evaluationsBudget: heuristic?.evaluationsBudget ?? 0,
      },
      generated: { proposalsUsed: stubCount, maxProposals: MAX_PROPOSALS_PER_RUN },
    },
    assetRefs: webAssetRefs(report.scenario.racks.map((r) => r.id)),
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
  const names = (e["candidates"] as Record<string, unknown>[]).map((c) => c["name"]);
  const stubNames = names.filter((n) => n !== "heuristic");
  const heuristicNames = names.filter((n) => n === "heuristic");
  // The heuristic is a separate method with its own budget: at most 3 stub
  // proposals plus at most 1 heuristic candidate. Historical envelopes
  // without a heuristic block keep the original stub-only rule.
  if (provider === "stub" && stubNames.length > MAX_PROPOSALS_PER_RUN) {
    throw new Error(`Stub envelopes hold at most ${MAX_PROPOSALS_PER_RUN} stub candidates.`);
  }
  if (provider === "stub" && heuristicNames.length > 1) {
    throw new Error("Stub envelopes hold at most 1 heuristic candidate.");
  }
  if (provider === "manual" && (e["candidates"] as unknown[]).length !== 0) {
    throw new Error("Manual envelopes must hold zero generated candidates.");
  }
  if (e["heuristic"] !== undefined) {
    checkHeuristicMeta(e["heuristic"], "M2 heuristic");
    const hasMeta = e["heuristic"] !== null;
    if (hasMeta !== (heuristicNames.length === 1)) {
      throw new Error("M2 heuristic metadata must match the heuristic candidate presence.");
    }
  }
  checkMethodLabels(
    e["methodLabels"],
    names.filter((n): n is string => typeof n === "string"),
    "M2 methodLabels",
  );
  checkAssetRefs(e["assetRefs"], "M2 assetRefs");
  const candidateBudgets = e["candidateBudgets"] as Record<string, Record<string, unknown>> | undefined;
  if (candidateBudgets !== undefined) {
    const h = candidateBudgets["heuristic"];
    const g = candidateBudgets["generated"];
    if (
      !h || typeof h["evaluationsUsed"] !== "number" || typeof h["evaluationsBudget"] !== "number" ||
      (h["evaluationsUsed"] as number) > (h["evaluationsBudget"] as number)
    ) {
      throw new Error("M2 candidateBudgets.heuristic must report used evaluations within budget.");
    }
    if (
      !g || typeof g["proposalsUsed"] !== "number" || g["proposalsUsed"] !== stubNames.length ||
      g["maxProposals"] !== MAX_PROPOSALS_PER_RUN
    ) {
      throw new Error("M2 candidateBudgets.generated must match the stub candidate count.");
    }
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
  provider: "meta" | "gater";
  runId: string;
  modelId: string;
} {
  if (typeof json !== "object" || json === null) throw new Error("Import is not a JSON object.");
  const e = json as Record<string, unknown>;
  if (e["envelopeVersion"] !== M3_ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version (expected ${M3_ENVELOPE_VERSION}).`);
  }
  if (e["provider"] !== "meta" && e["provider"] !== "gater") throw new Error("M3 envelope provider must be meta or gater.");
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
  if (e["providerKind"] !== "meta" && e["providerKind"] !== "fixture" && e["providerKind"] !== "gater") {
    throw new Error("M3 envelope must declare providerKind meta, gater, or fixture.");
  }
  if ((e.provider === "gater") !== (e.providerKind === "gater")) throw new Error("Inconsistent M3 provider pairing.");
  if ((e.providerKind === "gater" || e.generationSettings !== undefined) && !validGenerationSettings(e.generationSettings, e.providerKind)) throw new Error("Malformed M3 generation settings.");
  const real = e["realMetaRequests"];
  if (typeof real !== "number" || !Number.isInteger(real) || real < 0 || real > (used as number)) {
    throw new Error("M3 realMetaRequests must be an integer within used requests.");
  }
  if ((e["providerKind"] === "fixture" || e["providerKind"] === "gater") && real !== 0) {
    throw new Error("M3 fixture/Gater envelopes must report realMetaRequests 0.");
  }
  if (e["providerKind"] === "meta" && real !== used) {
    throw new Error("M3 meta envelopes must account every request as a real Meta request.");
  }
  if (!Array.isArray(e["attempts"]) || (e["attempts"] as unknown[]).length !== props) {
    throw new Error("M3 attempts must match proposalsUsed.");
  }
  if (!Array.isArray(e["candidates"])) throw new Error("M3 candidates must be an array.");
  const m3Names = (e["candidates"] as Record<string, unknown>[]).map((c) => c["name"]);
  const m3Heuristic = m3Names.filter((n) => n === "heuristic").length;
  if (m3Heuristic > 1) throw new Error("M3 candidates hold at most 1 heuristic candidate.");
  // The heuristic is a separate method with its own budget: legitimate
  // heuristic+3-model reports must not trip the model-proposal cap.
  // Historical envelopes without a heuristic block keep the original rule.
  const m3Model = m3Names.length - m3Heuristic;
  if (m3Model > props) {
    throw new Error("M3 model candidates cannot exceed proposalsUsed.");
  }
  if (e["heuristic"] !== undefined) {
    const h = e["heuristic"] as Record<string, unknown> | null;
    if (h !== null) {
      if (typeof h !== "object") throw new Error("M3 heuristic must be an object or null.");
      if (h["name"] !== "heuristic") throw new Error("M3 heuristic block must be named 'heuristic'.");
      checkHeuristicMeta(
        {
          evaluationsUsed: h["evaluationsUsed"],
          evaluationsBudget: h["evaluationsBudget"],
          method: h["method"],
          reason: h["reason"],
          retainedBaseline: h["retainedBaseline"],
          sceneOk: h["sceneOk"],
          rankingExhausted: h["rankingExhausted"],
        },
        "M3 heuristic",
      );
      const hasCandidate = h["candidate"] !== null && h["candidate"] !== undefined;
      if (hasCandidate !== (m3Heuristic === 1)) {
        throw new Error("M3 heuristic candidate must match the heuristic candidate presence.");
      }
    } else if (m3Heuristic === 1) {
      throw new Error("M3 null heuristic block cannot accompany a heuristic candidate.");
    }
  }
  if (e["methodLabels"] !== undefined) {
    const expected = labelsFor(m3Names.filter((n): n is string => typeof n === "string").map(name => ({ name })));
    if (e["provider"] === "gater") {
      for (const name of Object.keys(expected)) {
        if (expected[name] === "meta-first") expected[name] = "gater-first";
        if (expected[name] === "meta-feedback") expected[name] = "gater-feedback";
      }
    }
    const actual = e["methodLabels"] as Record<string, unknown> | null;
    if (!actual || typeof actual !== "object" || Object.keys(actual).length !== Object.keys(expected).length ||
        Object.entries(expected).some(([name, label]) => actual[name] !== label)) {
      throw new Error("M3 methodLabels must match exact provider method labels.");
    }
  }
  checkAssetRefs(e["assetRefs"], "M3 assetRefs");
  const m3Budgets = e["candidateBudgets"] as Record<string, Record<string, unknown>> | undefined;
  if (m3Budgets !== undefined) {
    const h = m3Budgets["heuristic"];
    const m = m3Budgets["model"];
    if (
      !h || typeof h["evaluationsUsed"] !== "number" || typeof h["evaluationsBudget"] !== "number" ||
      (h["evaluationsUsed"] as number) > (h["evaluationsBudget"] as number)
    ) {
      throw new Error("M3 candidateBudgets.heuristic must report used evaluations within budget.");
    }
    if (
      !m || m["proposalsUsed"] !== props || m["requestsUsed"] !== used ||
      m["maxProposals"] !== maxP || m["maxRequests"] !== maxR
    ) {
      throw new Error("M3 candidateBudgets.model must match the used counts and budgets.");
    }
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
    provider: e["provider"] as "meta" | "gater",
    runId: e["runId"] as string,
    modelId: e["modelId"] as string,
  };
}

export type FailureReplay = {
  valid: true;
  evaluated: false;
  provider: "meta" | "gater";
  runId: string;
  state: FailureEnvelope["state"];
  notice: string;
};

// Failure-audit import via the one shared core contract: validates the
// record and explicitly reports that no approved evaluation report exists.
// Never claims "matches saved measurements" — nothing approved to match.
export function replayFailureEnvelope(json: unknown): FailureReplay {
  return replayFailureRecord(json);
}

export function replayAnyEnvelope(json: unknown): {
  matchesSaved: boolean;
  mismatches: string[];
  provider: string;
  runId: string;
  failure?: FailureReplay;
} {
  const v = (json as Record<string, unknown> | null)?.["envelopeVersion"];
  if (v === M3_ENVELOPE_VERSION) return replayM3Envelope(json);
  if (v === M5_FAILURE_VERSION) {
    const failure = replayFailureEnvelope(json);
    return { matchesSaved: false, mismatches: [], provider: failure.provider, runId: failure.runId, failure };
  }
  return replayEnvelope(json);
}
