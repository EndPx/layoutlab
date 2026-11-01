import {
  assignmentSchema,
  parseRequirements,
  parseScenario,
  type Assignment,
  type PlanningRequirements,
  type Scenario,
} from "@layoutlab/core";

export const STORAGE_KEY = "layoutlab.m2.v1";
export const PERSIST_VERSION = 1;
export const MAX_PERSIST_BYTES = 1_000_000;
export const MAX_PERSIST_STUB = 3;
const MAX_NAME_LEN = 128;
const MAX_RATIONALE_LEN = 2000;
const MAX_FINGERPRINT_LEN = 200_000;

export type PersistedStubCandidate = { name: string; mapping: Assignment[]; rationale: string };

export type PersistedHeuristic = {
  mapping: Assignment[];
  rationale: string;
  evaluationsUsed: number;
  evaluationsBudget: number;
  retainedBaseline: boolean;
  reason: string;
  rankingExhausted: boolean;
};

export type PersistedState = {
  version: number;
  scenario: Scenario;
  requirements: PlanningRequirements;
  approved: boolean;
  approvedRequirements: PlanningRequirements | null;
  mode: "MANUAL" | "STUB" | "REPLAY";
  selectedCandidate: string | null;
  selectedOrderId: string | null;
  stubCandidates: PersistedStubCandidate[];
  stubBaselineRevision: number | null;
  stubBaselineId: string | null;
  stubBaselineFingerprint: string | null;
  stubRunId: string | null;
  heuristic: PersistedHeuristic | null;
};

export function savePersisted(state: PersistedState): void {
  try {
    const json = JSON.stringify(state);
    if (json.length > MAX_PERSIST_BYTES) return; // bounded persistence
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Storage full or unavailable: planner keeps running in memory.
  }
}

function parseHeuristic(raw: unknown): PersistedHeuristic | null {
  // Historical states predate the heuristic; absence restores as null.
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") throw new Error("bad heuristic");
  const h = raw as Record<string, unknown>;
  if (typeof h["rationale"] !== "string" || (h["rationale"] as string).length > MAX_RATIONALE_LEN) {
    throw new Error("bad heuristic rationale");
  }
  if (!Array.isArray(h["mapping"])) throw new Error("bad heuristic mapping");
  const mapping = (h["mapping"] as unknown[]).map((m) => assignmentSchema.parse(m));
  const used = h["evaluationsUsed"];
  const budget = h["evaluationsBudget"];
  if (typeof used !== "number" || !Number.isInteger(used) || used < 0 || used > 256) {
    throw new Error("bad heuristic evaluationsUsed");
  }
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 0 || budget > 256 || used > budget) {
    throw new Error("bad heuristic evaluationsBudget");
  }
  if (typeof h["retainedBaseline"] !== "boolean") throw new Error("bad heuristic retained flag");
  if (typeof h["reason"] !== "string") throw new Error("bad heuristic reason");
  if (typeof h["rankingExhausted"] !== "boolean") throw new Error("bad heuristic exhaustion flag");
  return {
    mapping,
    rationale: h["rationale"] as string,
    evaluationsUsed: used,
    evaluationsBudget: budget,
    retainedBaseline: h["retainedBaseline"] as boolean,
    reason: h["reason"] as string,
    rankingExhausted: h["rankingExhausted"] as boolean,
  };
}

function parseStubCandidates(raw: unknown): PersistedStubCandidate[] {
  if (!Array.isArray(raw)) throw new Error("bad stub candidates");
  if (raw.length > MAX_PERSIST_STUB) throw new Error("too many saved stub candidates");
  return raw.map((c) => {
    if (typeof c !== "object" || c === null) throw new Error("bad stub entry");
    const e = c as Record<string, unknown>;
    if (typeof e["name"] !== "string" || e["name"].length < 1 || e["name"].length > MAX_NAME_LEN) {
      throw new Error("bad stub name");
    }
    if (typeof e["rationale"] !== "string" || (e["rationale"] as string).length > MAX_RATIONALE_LEN) {
      throw new Error("bad stub rationale");
    }
    if (!Array.isArray(e["mapping"])) throw new Error("bad stub mapping");
    // Strict per-member validation with the core bounded schema; a crafted
    // row throws here instead of crashing the renderer or core later.
    const mapping = (e["mapping"] as unknown[]).map((m) => assignmentSchema.parse(m));
    return { name: e["name"] as string, mapping, rationale: e["rationale"] as string };
  });
}

export function loadPersisted(): { ok: true; state: PersistedState } | { ok: false; error: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, error: "Browser storage is unavailable." };
  }
  if (raw === null) return { ok: false, error: "empty" };
  if (raw.length > MAX_PERSIST_BYTES) return { ok: false, error: "Saved state exceeds 1 MB; ignoring." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Saved state is not valid JSON; starting fresh." };
  }
  if (typeof json !== "object" || json === null) return { ok: false, error: "Saved state has wrong shape." };
  const r = json as Record<string, unknown>;
  if (r["version"] !== PERSIST_VERSION) return { ok: false, error: "Saved state version mismatch; starting fresh." };
  try {
    const scenario = parseScenario(r["scenario"]);
    const requirements = parseRequirements(r["requirements"]);
    const approved = r["approved"];
    const approvedRequirementsRaw = r["approvedRequirements"];
    const mode = r["mode"];
    const selectedCandidate = r["selectedCandidate"];
    const selectedOrderId = r["selectedOrderId"];
    const stubBaselineRevision = r["stubBaselineRevision"];
    const stubBaselineId = r["stubBaselineId"];
    const stubBaselineFingerprint = r["stubBaselineFingerprint"];
    const stubRunId = r["stubRunId"];
    if (typeof approved !== "boolean") throw new Error("bad approved flag");
    // Approved restores only with the same validated requirements snapshot.
    let approvedRequirements: PlanningRequirements | null = null;
    if (approvedRequirementsRaw !== null && approvedRequirementsRaw !== undefined) {
      approvedRequirements = parseRequirements(approvedRequirementsRaw);
    }
    const approvedRestored =
      approved === true &&
      approvedRequirements !== null &&
      JSON.stringify(approvedRequirements) === JSON.stringify(requirements);
    if (mode !== "MANUAL" && mode !== "STUB" && mode !== "REPLAY") throw new Error("bad mode");
    if (selectedCandidate !== null && typeof selectedCandidate !== "string") throw new Error("bad selection");
    if (selectedOrderId !== null && typeof selectedOrderId !== "string") throw new Error("bad order");
    const stubCandidates = parseStubCandidates(r["stubCandidates"]);
    // The heuristic travels separately from stub proposals (distinct method,
    // own budget); a "heuristic" row inside stubCandidates is rejected.
    if (stubCandidates.some((c) => c.name === "heuristic")) throw new Error("heuristic must persist separately");
    const heuristic = parseHeuristic(r["heuristic"]);
    if (stubBaselineRevision !== null && typeof stubBaselineRevision !== "number") {
      throw new Error("bad stub revision");
    }
    if (stubBaselineId !== null && typeof stubBaselineId !== "string") throw new Error("bad stub scene id");
    if (
      stubBaselineFingerprint !== null &&
      (typeof stubBaselineFingerprint !== "string" || stubBaselineFingerprint.length > MAX_FINGERPRINT_LEN)
    ) {
      throw new Error("bad stub fingerprint");
    }
    if (
      stubRunId !== null &&
      (typeof stubRunId !== "string" || stubRunId.length < 1 || stubRunId.length > MAX_NAME_LEN)
    ) {
      throw new Error("bad stub run id");
    }
    // Candidates without full run identity are discarded, never trusted.
    const hasIdentity =
      stubBaselineRevision !== null &&
      stubBaselineId !== null &&
      stubBaselineFingerprint !== null &&
      stubRunId !== null;
    if (stubCandidates.length > 0 && !hasIdentity) throw new Error("stub candidates lack run identity");
    return {
      ok: true,
      state: {
        version: PERSIST_VERSION,
        scenario,
        requirements,
        approved: approvedRestored,
        approvedRequirements: approvedRestored ? approvedRequirements : null,
        mode,
        selectedCandidate: selectedCandidate as string | null,
        selectedOrderId: selectedOrderId as string | null,
        stubCandidates,
        stubBaselineRevision: stubBaselineRevision as number | null,
        stubBaselineId: stubBaselineId as string | null,
        stubBaselineFingerprint: stubBaselineFingerprint as string | null,
        stubRunId: stubRunId as string | null,
        heuristic,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Saved scenario failed validation; starting fresh.";
    return { ok: false, error: msg };
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
