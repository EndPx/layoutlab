// L2 preflight contract only. This module grants no inference or execution authority.
import { z } from "zod";
import { parseApprovedConstraints, type ApprovedLayoutConstraints } from "@layoutlab/simulation";

const id = z.string().min(1).max(128);
const mm = z.number().int().nonnegative().safe();
export const layoutRegionSchema = z.strictObject({
  entityId: id,
  minXMm: mm, minZMm: mm, maxXMm: mm, maxZMm: mm,
}).refine(r => r.minXMm <= r.maxXMm && r.minZMm <= r.maxZMm, "region bounds are reversed");

// An interpretation remains a suggestion until the separate approval endpoint
// accepts it. Fixed-input booleans are parsed by the production manual contract.
export const layoutInterpretationSchema = z.strictObject({
  objective: z.string().min(1).max(500),
  constraints: z.unknown(),
  allowedRegions: z.array(layoutRegionSchema).min(1).max(2),
});

export type LayoutInterpretation = {
  objective: string;
  constraints: ApprovedLayoutConstraints;
  allowedRegions: z.infer<typeof layoutRegionSchema>[];
};

export function parseLayoutInterpretation(value: unknown, stationIds: readonly string[]): LayoutInterpretation {
  const parsed = layoutInterpretationSchema.parse(value);
  const authority = parseApprovedConstraints(parsed.constraints);
  if (!authority.ok) throw new Error(authority.issues.map(i => i.message).join("; "));
  const constraints = authority.constraints;
  if (constraints.maxMovedEntities > 1 || constraints.maxTranslationMm > 5000 || constraints.snapGridMm !== 100) {
    throw new Error("L2 permits one station, at most 5000 mm translation, on the 100 mm grid");
  }
  if (new Set(constraints.allowedEntityIds).size !== constraints.allowedEntityIds.length ||
      constraints.allowedEntityIds.some(id => !stationIds.includes(id) || constraints.lockedEntityIds.includes(id))) {
    throw new Error("editable IDs must be unique unlocked packing stations");
  }
  if (!constraints.lockedEntityIds.includes("RCV-1")) throw new Error("receiving must remain locked");
  const regionIds = parsed.allowedRegions.map(r => r.entityId);
  if (new Set(regionIds).size !== regionIds.length ||
      regionIds.length !== constraints.allowedEntityIds.length ||
      constraints.allowedEntityIds.some(id => !regionIds.includes(id))) {
    throw new Error("each editable station requires exactly one allowed region");
  }
  return { objective: parsed.objective, constraints, allowedRegions: parsed.allowedRegions };
}

// Strict flattened provider output: no staffing, service, rack, or authority
// fields can be hidden inside a transform. Parent identity is supplied in the
// canonical request and must later pass the SAME production validator.
export const layoutActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("propose"),
    hypothesis: z.string().max(500),
    proposalId: id,
    entityId: id,
    parent: z.strictObject({ scenarioId: id, scenarioContentSha256: z.string().regex(/^[a-f0-9]{64}$/), schemaVersion: id, engineVersion: id }),
    centerMm: z.strictObject({ x: z.number().int().safe(), z: z.number().int().safe() }),
  }),
  z.strictObject({ action: z.literal("finish"), candidateId: id, hypothesis: z.string().max(500) }),
]);

export function parseLayoutAction(value: unknown) {
  const action = layoutActionSchema.parse(value);
  if (action.action === "finish") return action;
  return {
    action: action.action,
    hypothesis: action.hypothesis,
    proposal: {
      kind: "PACKING_STATION_TRANSLATION" as const,
      proposalId: action.proposalId,
      entityId: action.entityId,
      parent: action.parent,
      target: { mode: "ABSOLUTE_CENTER_MM" as const, centerMm: action.centerMm },
    },
  };
}
