import type { OperationsScenario } from "../schema.js";
import { contentSha256 } from "./hash.js";

// Physical layout draft contract (L0, revision 2). All coordinates are
// integer millimetres in the canonical scenario room frame: x in
// [0, room.widthMm], z in [0, room.depthMm], origin at the room corner
// (0,0). A target is either an absolute room-frame centre or a delta from
// the station's current room-frame centre; never mixed in one proposal.
export const LAYOUT_DRAFT_VERSION = "layoutlab.layout-draft/2" as const;
export const LAYOUT_COMPARISON_SCHEMA = "layoutlab.layout-comparison/2" as const;
export const COORDINATE_SYSTEM = "room-mm:x-east,z-north,origin-(0,0),integer-mm" as const;

export const SUPPORTED_KIND = "PACKING_STATION_TRANSLATION" as const;
// Forward-compatible kinds: recognised and explicitly UNSUPPORTED in L0.
// They are never silently ignored and never partially applied.
export const UNSUPPORTED_KINDS = [
  "RACK_QUARTER_TURN",
  "RACK_TRANSLATION",
  "AGENT_INITIAL_PLACEMENT",
] as const;
export type UnsupportedKind = (typeof UNSUPPORTED_KINDS)[number];

// Receiving is structurally locked in L0: it can never be a moved entity,
// even if an approved-constraints set omits it or allow-lists it.
export const LOCKED_ENTITY_IDS = ["RCV-1"] as const;

export type XzMm = { x: number; z: number };
export type RectMm = { minXMm: number; minZMm: number; maxXMm: number; maxZMm: number };

export type LayoutIssue = {
  code: string;
  severity: "error";
  entityId: string | null;
  relatedEntityId?: string;
  field?: string;
  message: string;
  // Diagnosis only: true when the candidate introduced this issue relative
  // to the baseline. Never used to suppress a remaining candidate error.
  introduced?: boolean;
};

// Approved constraints are authority supplied by the user/server context,
// independently of any untrusted (e.g. model-authored) proposal. A proposal
// carries no constraints and can never grant itself permissions or budgets.
export type ApprovedLayoutConstraints = {
  allowedEntityIds: string[];
  lockedEntityIds: string[];
  // Move budget: at most this many entities may actually move (a zero
  // delta moves zero entities and consumes no budget).
  maxMovedEntities: number;
  // Move budget: Chebyshev translation cap, max(|dx|, |dz|) in mm.
  maxTranslationMm: number;
  snapGridMm: number;
  // Matched-input guarantees, enforced by validator + verifier, not prose.
  requireSameWorkerCount: true;
  requireSameServiceDurations: true;
  requireSameWorkload: true;
  requireSameSeed: true;
};
/** @deprecated Renamed: constraints are always the approved set. */
export type LayoutConstraints = ApprovedLayoutConstraints;

export type PackingStationTranslationProposal = {
  kind: typeof SUPPORTED_KIND;
  proposalId: string;
  parent: {
    scenarioId: string;
    // sha256 of canonicalStringify(parsed baseline scenario). Operations
    // scenarios carry no revision field, so identity is id + content hash.
    scenarioContentSha256: string;
    schemaVersion: string;
    engineVersion: string;
  };
  entityId: string;
  target:
    | { mode: "ABSOLUTE_CENTER_MM"; centerMm: XzMm }
    | { mode: "DELTA_MM"; deltaMm: { dx: number; dz: number } };
};

export type UnsupportedLayoutProposal = {
  kind: UnsupportedKind;
  proposalId: string;
  entityId: string;
};

export type LayoutProposal = PackingStationTranslationProposal | UnsupportedLayoutProposal;

export function defaultApprovedConstraints(allowedEntityIds: string[]): ApprovedLayoutConstraints {
  return {
    allowedEntityIds: [...allowedEntityIds],
    lockedEntityIds: [...LOCKED_ENTITY_IDS],
    maxMovedEntities: 1,
    maxTranslationMm: 5000,
    snapGridMm: 100,
    requireSameWorkerCount: true,
    requireSameServiceDurations: true,
    requireSameWorkload: true,
    requireSameSeed: true,
  };
}
/** @deprecated Use defaultApprovedConstraints (approved-context builder). */
export const defaultConstraints = defaultApprovedConstraints;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function issue(code: string, entityId: string | null, message: string, field?: string): LayoutIssue {
  return { code, severity: "error", entityId, message, ...(field ? { field } : {}) };
}

const PROPOSAL_KEYS = ["kind", "proposalId", "parent", "entityId", "target"];
const PARENT_KEYS = ["scenarioId", "scenarioContentSha256", "schemaVersion", "engineVersion"];
const CONSTRAINT_KEYS = [
  "allowedEntityIds", "lockedEntityIds", "maxMovedEntities", "maxTranslationMm",
  "snapGridMm", "requireSameWorkerCount", "requireSameServiceDurations",
  "requireSameWorkload", "requireSameSeed",
];

export type ProposalParseResult =
  | { ok: true; supported: true; proposal: PackingStationTranslationProposal }
  | { ok: true; supported: false; proposal: UnsupportedLayoutProposal }
  | { ok: false; issues: LayoutIssue[] };

// Strict parse: unknown keys are rejected (so an agent-teleport field such
// as parkingSlotMm, or a self-granted constraints block, can never be
// smuggled into a packing translation).
export function parseLayoutProposal(value: unknown): ProposalParseResult {
  if (!isRecord(value)) {
    return { ok: false, issues: [issue("SCHEMA_INVALID", null, "proposal must be an object")] };
  }
  const kind = value["kind"];
  if (typeof kind === "string" && (UNSUPPORTED_KINDS as readonly string[]).includes(kind)) {
    const entityId = typeof value["entityId"] === "string" ? value["entityId"] : "";
    const proposalId = typeof value["proposalId"] === "string" ? value["proposalId"] : "";
    return { ok: true, supported: false, proposal: { kind: kind as UnsupportedKind, proposalId, entityId } };
  }
  if (kind !== SUPPORTED_KIND) {
    return { ok: false, issues: [issue("SCHEMA_INVALID", null, `unsupported proposal kind: ${String(kind)}`, "kind")] };
  }
  const issues: LayoutIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!PROPOSAL_KEYS.includes(key)) {
      issues.push(issue("SCHEMA_INVALID", null,
        key === "constraints"
          ? "proposal must not carry constraints: approved constraints are supplied separately by the user/server context"
          : `unknown proposal key: ${key}`, key));
    }
  }
  const proposalId = value["proposalId"];
  const entityId = value["entityId"];
  if (typeof proposalId !== "string" || proposalId.length === 0 || proposalId.length > 128) {
    issues.push(issue("SCHEMA_INVALID", null, "proposalId must be a string of 1..128 chars", "proposalId"));
  }
  if (typeof entityId !== "string" || entityId.length === 0 || entityId.length > 128) {
    issues.push(issue("SCHEMA_INVALID", null, "entityId must be a string of 1..128 chars", "entityId"));
  }
  const parent = value["parent"];
  if (!isRecord(parent)) {
    issues.push(issue("SCHEMA_INVALID", null, "parent must be an object", "parent"));
  } else {
    for (const key of Object.keys(parent)) {
      if (!PARENT_KEYS.includes(key)) issues.push(issue("SCHEMA_INVALID", null, `unknown parent key: ${key}`, `parent.${key}`));
    }
    for (const key of PARENT_KEYS) {
      if (typeof parent[key] !== "string" || (parent[key] as string).length === 0) {
        issues.push(issue("SCHEMA_INVALID", null, `parent.${key} must be a non-empty string`, `parent.${key}`));
      }
    }
  }
  const target = value["target"];
  let parsedTarget: PackingStationTranslationProposal["target"] | null = null;
  if (!isRecord(target)) {
    issues.push(issue("SCHEMA_INVALID", null, "target must be an object", "target"));
  } else if (target["mode"] === "ABSOLUTE_CENTER_MM") {
    const centre = target["centerMm"];
    if (!isRecord(centre) || !isInt(centre["x"]) || !isInt(centre["z"])) {
      issues.push(issue("SCHEMA_INVALID", typeof entityId === "string" ? entityId : null, "target.centerMm must have integer x/z (mm, room frame)", "target.centerMm"));
    } else {
      parsedTarget = { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: centre["x"] as number, z: centre["z"] as number } };
    }
    for (const key of Object.keys(target)) {
      if (!["mode", "centerMm"].includes(key)) issues.push(issue("SCHEMA_INVALID", null, `unknown target key: ${key}`, `target.${key}`));
    }
  } else if (target["mode"] === "DELTA_MM") {
    const delta = target["deltaMm"];
    if (!isRecord(delta) || !isInt(delta["dx"]) || !isInt(delta["dz"])) {
      issues.push(issue("SCHEMA_INVALID", typeof entityId === "string" ? entityId : null, "target.deltaMm must have integer dx/dz (mm, room frame)", "target.deltaMm"));
    } else {
      parsedTarget = { mode: "DELTA_MM", deltaMm: { dx: delta["dx"] as number, dz: delta["dz"] as number } };
    }
    for (const key of Object.keys(target)) {
      if (!["mode", "deltaMm"].includes(key)) issues.push(issue("SCHEMA_INVALID", null, `unknown target key: ${key}`, `target.${key}`));
    }
  } else {
    issues.push(issue("SCHEMA_INVALID", null, "target.mode must be ABSOLUTE_CENTER_MM or DELTA_MM", "target.mode"));
  }
  if (issues.length > 0 || !parsedTarget || !isRecord(parent)) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    supported: true,
    proposal: {
      kind: SUPPORTED_KIND,
      proposalId: proposalId as string,
      parent: {
        scenarioId: parent["scenarioId"] as string,
        scenarioContentSha256: parent["scenarioContentSha256"] as string,
        schemaVersion: parent["schemaVersion"] as string,
        engineVersion: parent["engineVersion"] as string,
      },
      entityId: entityId as string,
      target: parsedTarget,
    },
  };
}

export type ApprovedParseResult =
  | { ok: true; constraints: ApprovedLayoutConstraints }
  | { ok: false; issues: LayoutIssue[] };

// Strict parse of the approved context. Missing approved constraints are
// never defaulted: authority must be supplied explicitly.
export function parseApprovedConstraints(value: unknown): ApprovedParseResult {
  if (!isRecord(value)) {
    return { ok: false, issues: [issue("APPROVED_CONSTRAINTS_REQUIRED", null, "approved constraints must be supplied by the user/server context as an object, independently of the proposal")] };
  }
  const issues: LayoutIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!CONSTRAINT_KEYS.includes(key)) issues.push(issue("SCHEMA_INVALID", null, `unknown approved-constraints key: ${key}`, `approvedConstraints.${key}`));
  }
  const allowed = value["allowedEntityIds"];
  const locked = value["lockedEntityIds"];
  const maxMoved = value["maxMovedEntities"];
  const maxTranslation = value["maxTranslationMm"];
  const grid = value["snapGridMm"];
  if (!Array.isArray(allowed) || allowed.some((v) => typeof v !== "string")) {
    issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.allowedEntityIds must be a string array", "approvedConstraints.allowedEntityIds"));
  }
  if (!Array.isArray(locked) || locked.some((v) => typeof v !== "string")) {
    issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.lockedEntityIds must be a string array", "approvedConstraints.lockedEntityIds"));
  }
  if (!isInt(maxMoved) || (maxMoved as number) < 0) issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.maxMovedEntities must be a non-negative integer", "approvedConstraints.maxMovedEntities"));
  if (!isInt(maxTranslation) || (maxTranslation as number) < 0) issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.maxTranslationMm must be a non-negative integer", "approvedConstraints.maxTranslationMm"));
  if (!isInt(grid) || (grid as number) < 1) issues.push(issue("SCHEMA_INVALID", null, "approvedConstraints.snapGridMm must be a positive integer", "approvedConstraints.snapGridMm"));
  for (const flag of ["requireSameWorkerCount", "requireSameServiceDurations", "requireSameWorkload", "requireSameSeed"] as const) {
    if (value[flag] !== true) {
      issues.push(issue("SCHEMA_INVALID", null, `approvedConstraints.${flag} must be true: matched exogenous inputs are not optional`, `approvedConstraints.${flag}`));
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    constraints: {
      allowedEntityIds: [...(allowed as string[])],
      lockedEntityIds: [...(locked as string[])],
      maxMovedEntities: maxMoved as number,
      maxTranslationMm: maxTranslation as number,
      snapGridMm: grid as number,
      requireSameWorkerCount: true,
      requireSameServiceDurations: true,
      requireSameWorkload: true,
      requireSameSeed: true,
    },
  };
}

export function snapToGridMm(valueMm: number, gridMm: number): number {
  if (!Number.isSafeInteger(valueMm) || !Number.isSafeInteger(gridMm) || gridMm < 1) {
    throw new Error("snapToGridMm requires integer mm and a positive integer grid");
  }
  return Math.round(valueMm / gridMm) * gridMm;
}

export function resolveTargetCentre(
  proposal: PackingStationTranslationProposal,
  currentCentreMm: XzMm,
): { centreMm: XzMm; deltaMm: { dx: number; dz: number } } {
  if (proposal.target.mode === "ABSOLUTE_CENTER_MM") {
    const centreMm = { ...proposal.target.centerMm };
    return { centreMm, deltaMm: { dx: centreMm.x - currentCentreMm.x, dz: centreMm.z - currentCentreMm.z } };
  }
  const deltaMm = { ...proposal.target.deltaMm };
  return { centreMm: { x: currentCentreMm.x + deltaMm.dx, z: currentCentreMm.z + deltaMm.dz }, deltaMm };
}

// Identity, allowed-list and locked checks against the APPROVED context.
export async function validateProposalAgainstBaseline(
  proposal: PackingStationTranslationProposal,
  baseline: OperationsScenario,
  supportedEntityIds: ReadonlySet<string>,
  approved: ApprovedLayoutConstraints,
): Promise<LayoutIssue[]> {
  const issues: LayoutIssue[] = [];
  const entityId = proposal.entityId;
  if (proposal.parent.scenarioId !== baseline.id) {
    issues.push(issue("STALE_REVISION", entityId, `parent scenarioId ${proposal.parent.scenarioId} != baseline ${baseline.id}`, "parent.scenarioId"));
  }
  const actualHash = await contentSha256(baseline);
  if (proposal.parent.scenarioContentSha256 !== actualHash) {
    issues.push(issue("STALE_REVISION", entityId, `parent scenarioContentSha256 ${proposal.parent.scenarioContentSha256} != baseline content ${actualHash}`, "parent.scenarioContentSha256"));
  }
  if (proposal.parent.schemaVersion !== baseline.schemaVersion) {
    issues.push(issue("SCHEMA_VERSION_MISMATCH", entityId, `parent schemaVersion ${proposal.parent.schemaVersion} != baseline ${baseline.schemaVersion}`, "parent.schemaVersion"));
  }
  if (proposal.parent.engineVersion !== baseline.engineVersion) {
    issues.push(issue("SCHEMA_VERSION_MISMATCH", entityId, `parent engineVersion ${proposal.parent.engineVersion} != baseline ${baseline.engineVersion}`, "parent.engineVersion"));
  }
  // Structural locks always apply, even if the approved set omits them or
  // allow-lists the entity: locked wins over allowed.
  const locked = new Set<string>([...LOCKED_ENTITY_IDS, ...approved.lockedEntityIds]);
  if (locked.has(entityId)) {
    issues.push(issue("LOCKED_ENTITY", entityId, `entity ${entityId} is locked and may not move`, "entityId"));
  } else if (!approved.allowedEntityIds.includes(entityId)) {
    issues.push(issue("NOT_ALLOWED", entityId, `entity ${entityId} is not in approved allowedEntityIds [${approved.allowedEntityIds.join(", ")}]`, "entityId"));
  }
  if (!supportedEntityIds.has(entityId)) {
    issues.push(issue("UNSUPPORTED_ENTITY", entityId, `entity ${entityId} has no validated packing-station attachment bundle in L0`, "entityId"));
  }
  return issues;
}

export function validateResolvedTransform(
  proposal: PackingStationTranslationProposal,
  currentCentreMm: XzMm,
  approved: ApprovedLayoutConstraints,
): { centreMm: XzMm; deltaMm: { dx: number; dz: number }; issues: LayoutIssue[] } {
  const { centreMm, deltaMm } = resolveTargetCentre(proposal, currentCentreMm);
  const issues: LayoutIssue[] = [];
  const entityId = proposal.entityId;
  const grid = approved.snapGridMm;
  if (centreMm.x % grid !== 0 || centreMm.z % grid !== 0 || deltaMm.dx % grid !== 0 || deltaMm.dz % grid !== 0) {
    issues.push(issue("OFF_GRID", entityId, `target centre (${centreMm.x},${centreMm.z}) / delta (${deltaMm.dx},${deltaMm.dz}) is off the ${grid}mm snap grid`, "target"));
  }
  // Budget counts actual movement: a zero delta moves zero entities and
  // consumes no move/translation budget, at any approved budget level.
  const movedEntities = deltaMm.dx === 0 && deltaMm.dz === 0 ? 0 : 1;
  if (movedEntities > approved.maxMovedEntities) {
    issues.push(issue("MOVE_BUDGET_EXCEEDED", entityId, `proposal moves ${movedEntities} entity(ies) but approved budget maxMovedEntities=${approved.maxMovedEntities}`, "approvedConstraints.maxMovedEntities"));
  }
  const chebyshev = Math.max(Math.abs(deltaMm.dx), Math.abs(deltaMm.dz));
  if (chebyshev > approved.maxTranslationMm) {
    issues.push(issue("MOVE_BUDGET_EXCEEDED", entityId, `translation Chebyshev ${chebyshev}mm exceeds approved budget maxTranslationMm=${approved.maxTranslationMm}mm`, "approvedConstraints.maxTranslationMm"));
  }
  return { centreMm, deltaMm, issues };
}
