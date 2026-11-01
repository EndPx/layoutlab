// M3 prompt version and Meta Chat Completions payload builders.
// Protocol: https://dev.meta.ai/docs/protocols/chat-completions with
// response_format.type=json_schema (see https://dev.meta.ai/docs/structured-output).
// developer role preferred; max_completion_tokens bounds output (max_output_tokens
// is rejected on Chat Completions). No tools, no reasoning-trace requests.
import {
  computeDemandFrequency,
  type CandidateResult,
  type LocationRank,
  type PlanningRequirements,
  type Scenario,
} from "@layoutlab/core";

// M4: evaluator feedback now leads with the measured heuristic result (and
// best-so-far seeds from it); instructions are otherwise unchanged.
// M4 context completeness (brief section 20): the scenario summary carries
// packing + approach points, nav settings, configured allowlists, split
// demand semantics, and measured packing distances; feedback carries
// baseline-relative mappings, not scores alone.
export const PROMPT_VERSION = "layoutlab.m4prompt/1";

export const INTERPRET_INSTRUCTION = [
  "You are LayoutLab's planning request interpreter.",
  "Read the user's planning request and the scenario summary.",
  "Output only the required structured requirements JSON.",
  "Rules:",
  "- objective is always minimize_weighted_picking_travel.",
  "- maxRelocatedProducts comes from the request when stated, else keep the supplied default.",
  "- lockedProductIds contains only product ids present in the scenario.",
  "- Record guesses in assumptions and open items in unresolvedQuestions.",
  "- Do not change geometry, dimensions, orders, or evaluator settings.",
  "- Do not invent products, locations, or measurements.",
].join("\n");

export const PROPOSAL_INSTRUCTION = [
  "You are LayoutLab's warehouse assignment proposal agent.",
  "",
  "Propose product-to-location changes for the supplied scenario.",
  "",
  "Rules:",
  "- Use only products and locations present in the input.",
  "- Preserve every product in the complete assignment.",
  "- Respect location compatibility and locked assignments.",
  "- Respect the relocation limit.",
  "- Do not change rack geometry, dimensions, order data, or evaluator settings.",
  "- Treat every proposal as changes applied to the original run baseline.",
  "- Return only the required structured proposal.",
  "- Keep the rationale concise.",
  "- Do not invent travel measurements or claim an improvement before evaluation.",
  "- Use evaluator feedback to revise your next proposal.",
  "- An empty change list is allowed when retaining the current assignment",
  "  is the best proposal you can make.",
].join("\n");

// Strict-subset JSON Schemas for response_format.json_schema.schema.
export const requirementsJsonSchema = {
  type: "object",
  properties: {
    objective: { type: "string", enum: ["minimize_weighted_picking_travel"] },
    maxRelocatedProducts: { type: "integer", minimum: 0, maximum: 64 },
    lockedProductIds: { type: "array", items: { type: "string" }, maxItems: 64 },
    assumptions: { type: "array", items: { type: "string" }, maxItems: 256 },
    unresolvedQuestions: { type: "array", items: { type: "string" }, maxItems: 256 },
  },
  required: ["objective", "maxRelocatedProducts", "lockedProductIds", "assumptions", "unresolvedQuestions"],
  additionalProperties: false,
} as const;

export const proposalJsonSchema = {
  type: "object",
  properties: {
    scenarioRevision: { type: "integer", minimum: 0 },
    changes: {
      type: "array",
      maxItems: 64,
      items: {
        type: "object",
        properties: {
          productId: { type: "string" },
          locationId: { type: "string" },
        },
        required: ["productId", "locationId"],
        additionalProperties: false,
      },
    },
    rationale: { type: "string", maxLength: 2000 },
  },
  required: ["scenarioRevision", "changes", "rationale"],
  additionalProperties: false,
} as const;

export type BaselineChange = { productId: string; locationId: string };

export type ProposalFeedback = {
  proposalName: string;
  valid: boolean;
  errors: string[];
  relocationCount: number | null;
  weightedTravelMm: number | null;
  // Baseline-relative changes of the evaluated mapping (sorted by productId),
  // null when the attempt produced no mapping. The model revises actual
  // placements from these, not from scores alone.
  changes: BaselineChange[] | null;
  bestValidSoFar: {
    name: string;
    weightedTravelMm: number;
    relocationCount: number;
    changes: BaselineChange[] | null;
  } | null;
};

export function buildScenarioSummary(
  scenario: Scenario,
  opts: {
    maxChars: number;
    requirements?: PlanningRequirements;
    baseline?: CandidateResult | null;
    // Measured packing distances reused from the heuristic location rank when
    // available (proposal summaries, built after the heuristic runs). These
    // are evaluator measurements, never model estimates.
    locationRank?: LocationRank[] | null;
  },
): string {
  const units = new Map<string, number>();
  for (const p of scenario.products) units.set(p.id, 0);
  for (const o of scenario.orders) {
    for (const l of o.lines) units.set(l.productId, (units.get(l.productId) ?? 0) + o.frequency * l.quantity);
  }
  // Distinct-order frequency is separate from quantity-weighted units: one
  // order visits each distinct product once.
  const frequency = computeDemandFrequency(scenario);
  const summary = {
    scenarioId: scenario.id,
    revision: scenario.revision,
    room: scenario.room,
    packingPointMm: scenario.packingPointMm,
    // Navigation settings the evaluator routes with (brief section 20 input).
    nav: {
      cart: scenario.cart,
      minimumPassageWidthMm: scenario.minimumPassageWidthMm,
      gridSizeMm: scenario.gridSizeMm,
    },
    racks: scenario.racks.map((r) => ({ id: r.id, positionMm: r.positionMm, dimensionsMm: r.dimensionsMm, yawDeg: r.yawDeg })),
    locations: scenario.locations.map((l) => ({
      id: l.id,
      rackId: l.rackId,
      storageClass: l.storageClass,
      usableDimensionsMm: l.usableDimensionsMm,
      pickPointMm: l.pickPointMm,
      allowedProductIds: l.allowedProductIds ?? null,
    })),
    products: scenario.products.map((p) => ({
      id: p.id,
      requiredStorageClass: p.requiredStorageClass,
      storedLoadDimensionsMm: p.storedLoadDimensionsMm,
      lockedLocationId: p.lockedLocationId ?? null,
      allowedLocationIds: p.allowedLocationIds ?? null,
      demandFrequency: frequency.get(p.id) ?? 0,
      demandUnits: units.get(p.id) ?? 0,
    })),
    packingDistances: opts.locationRank
      ? opts.locationRank.map((r) => ({ locationId: r.locationId, distanceMm: r.distanceMm, status: r.status }))
      : null,
    baselineAssignments: scenario.assignments,
    orders: scenario.orders.map((o) => ({ id: o.id, frequency: o.frequency, products: o.lines.map((l) => l.productId) })),
    requirements: opts.requirements
      ? { maxRelocatedProducts: opts.requirements.maxRelocatedProducts, lockedProductIds: opts.requirements.lockedProductIds }
      : null,
    baselineMetrics: opts.baseline
      ? {
          valid: opts.baseline.valid,
          weightedTravelMm: opts.baseline.weightedTravelMm,
          relocationCount: opts.baseline.relocationCount,
          errors: opts.baseline.errors.map((e) => e.code),
        }
      : null,
  };
  const text = JSON.stringify(summary);
  if (text.length > opts.maxChars) {
    throw new Error(`Scenario summary exceeds context bound (${text.length} > ${opts.maxChars}); refusing inference.`);
  }
  return text;
}

export function buildInterpretUserContent(requestText: string, scenarioSummary: string, defaults: PlanningRequirements): string {
  return [
    `Planning request: ${requestText}`,
    `Scenario summary: ${scenarioSummary}`,
    `Defaults: ${JSON.stringify({ maxRelocatedProducts: defaults.maxRelocatedProducts, lockedProductIds: defaults.lockedProductIds })}`,
    "Return the PlanningRequirements JSON object only.",
  ].join("\n");
}

export function buildProposalUserContent(
  scenarioSummary: string,
  requirements: PlanningRequirements,
  baseline: CandidateResult | null,
  feedback: ProposalFeedback[],
  attemptIndex: number,
): string {
  const lines = [
    `Scenario summary: ${scenarioSummary}`,
    `Approved constraints: ${JSON.stringify({ maxRelocatedProducts: requirements.maxRelocatedProducts, lockedProductIds: requirements.lockedProductIds })}`,
    baseline
      ? `Baseline: valid=${baseline.valid} travel=${baseline.weightedTravelMm ?? "n/a"} relocations=${baseline.relocationCount}`
      : "Baseline: unavailable",
    `Attempt ${attemptIndex + 1}: return the AssignmentProposal JSON object only.`,
  ];
  if (feedback.length > 0) {
    lines.push(`Evaluator feedback (most recent last): ${JSON.stringify(feedback)}`);
  } else {
    lines.push("Evaluator feedback: none yet (first proposal).");
  }
  return lines.join("\n");
}
