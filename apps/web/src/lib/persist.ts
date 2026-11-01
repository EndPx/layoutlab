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
