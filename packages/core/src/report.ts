import { z } from "zod";
import {
  improvementPercent,
  rankCandidates,
  selectBest,
  settingsFingerprint,
  stableAssignmentKey,
} from "./objective.js";
import { EVALUATION_BUDGET_REASON, evaluateWorkload } from "./routing.js";
import type {
  Assignment,
  PlanningRequirements,
  Scenario,
} from "./schema.js";
import {
  MAX_ASSIGNMENTS,
  MAX_ID_LEN,
  MAX_LINES_PER_ORDER,
  MAX_ORDERS,
  MAX_REPORT_CANDIDATES,
  MAX_TEXT_LEN,
  assignmentSchema,
  requirementsSchema,
  scenarioSchema,
} from "./schema.js";
import { buildNavContext, validateScene, type NavContext } from "./scene.js";
import { validateAssignment, type ValidationError } from "./validate.js";
import { CORE_VERSION, REPORT_VERSION, ROUTE_POLICY_ID } from "./version.js";
import type { WorkloadResult } from "./routing.js";

export type CandidateResult = {
  name: string;
  assignment: Assignment[];
  assignmentKey: string;
  valid: boolean;
  errors: ValidationError[];
  relocationCount: number;
  workload: WorkloadResult | null;
  weightedTravelMm: number | null;
  settingsFingerprint: string;
};

export function evaluateCandidate(
  scenario: Scenario,
  requirements: PlanningRequirements,
  mapping: Assignment[],
  name: string,
  nav: NavContext = buildNavContext(scenario),
): CandidateResult {
  const scene = validateScene(scenario, nav);
  const structural = validateAssignment(scenario, mapping, requirements, scenario.assignments);
  const errors: ValidationError[] = [
    ...scene.issues.map((i) => ({ code: i.code, message: i.message })),
    ...structural.errors,
  ];
  // No measurement on an invalid scene or structurally invalid assignment.
  let workload: WorkloadResult | null = null;
  if (scene.ok && structural.valid) {
    workload = evaluateWorkload(scenario, mapping, nav);
    if (workload.arithmeticOverflow) {
      errors.push({ code: "ARITHMETIC_OVERFLOW", message: "workload arithmetic exceeded safe integers" });
    }
    if (workload.budgetExhausted) {
      errors.push({
        code: "BUDGET_EXHAUSTED",
        message: "workload evaluation exceeded its computation budget",
      });
    }
    for (const order of workload.orders) {
      // Budget-halted orders are covered by BUDGET_EXHAUSTED, never
      // misreported as unreachable.
      if (!order.reachable && order.reason !== EVALUATION_BUDGET_REASON) {
        errors.push({
          code: "UNREACHABLE_ORDER",
          message: `order ${order.orderId} unreachable: ${order.reason}`,
        });
      }
    }
  }
  const valid = errors.length === 0;
  return {
    name,
    assignment: structuredClone(mapping),
    assignmentKey: stableAssignmentKey(mapping),
    valid,
    errors,
    relocationCount: structural.relocationCount,
    workload,
    weightedTravelMm: valid ? (workload?.weightedTravelMm ?? null) : null,
    settingsFingerprint: settingsFingerprint(scenario),
  };
}

export function evaluateBaseline(
  scenario: Scenario,
  requirements: PlanningRequirements,
  nav?: NavContext,
): CandidateResult {
  return evaluateCandidate(scenario, requirements, scenario.assignments, "baseline", nav);
}

export type Comparison = {
  baseline: CandidateResult;
  ranked: CandidateResult[];
  best: CandidateResult | null;
  improvementPercents: Record<string, number | null>;
};

export function compareCandidates(
  scenario: Scenario,
  requirements: PlanningRequirements,
  entries: { name: string; mapping: Assignment[]}[],
  nav: NavContext = buildNavContext(scenario),
): Comparison {
  const baseline = evaluateBaseline(scenario, requirements, nav);
  const evaluated = entries.map((e) => evaluateCandidate(scenario, requirements, e.mapping, e.name, nav));
  // Baseline first: stable sort keeps it ahead of full ties.
  const all = [baseline, ...evaluated.filter((c) => c.name !== "baseline")];
  const ranked = rankCandidates(all);
  const best = selectBest(all);
  const improvementPercents: Record<string, number | null> = {};
  for (const c of all) improvementPercents[c.name] = improvementPercent(baseline, c);
  return { baseline, ranked, best, improvementPercents };
}

export type ReportOutcome =
  | "IMPROVED_VALID_ASSIGNMENT"
  | "VALID_ASSIGNMENT_FOUND"
  | "NO_IMPROVEMENT_FOUND"
  | "SEARCH_EXHAUSTED"
  | "INPUT_INVALID";

export const REPORT_LIMITATIONS = [
  "Conservative 2D clearance model: not a safety certification or complete maneuverability assessment.",
  "Nearest-neighbor routing is deterministic but not globally optimal.",
  "Bounding-box fit does not prove real-world packability, rack load safety, or handling suitability.",
  "Travel reduction is not converted to labor, monetary, or throughput improvement.",
] as const;

export type EvaluationReport = {
  reportVersion: string;
  coreVersion: string;
  routePolicy: string;
  scenario: Scenario;
  requirements: PlanningRequirements;
  baseline: CandidateResult;
  candidates: CandidateResult[];
  bestName: string | null;
  improvementPercents: Record<string, number | null>;
  outcome: ReportOutcome;
  limitations: string[];
};

export function createReport(
  scenario: Scenario,
  requirements: PlanningRequirements,
  entries: { name: string; mapping: Assignment[]}[],
): EvaluationReport {
  const comparison = compareCandidates(scenario, requirements, entries);
  const { baseline, best } = comparison;
  const sceneInvalid = baseline.errors.some((e) =>
    ["RACK_OUT_OF_BOUNDS", "RACK_OVERLAP", "LOCATION_UNKNOWN_RACK", "PICK_POINT_OUT_OF_ROOM", "PACKING_INVALID"].includes(e.code)
  );
  let outcome: ReportOutcome;
  if (sceneInvalid) {
    outcome = "INPUT_INVALID";
  } else if (baseline.valid && best !== null && (best.weightedTravelMm as number) < (baseline.weightedTravelMm as number)) {
    outcome = "IMPROVED_VALID_ASSIGNMENT";
  } else if (baseline.valid) {
    outcome = "NO_IMPROVEMENT_FOUND";
  } else if (best !== null) {
    outcome = "VALID_ASSIGNMENT_FOUND";
  } else {
    outcome = "SEARCH_EXHAUSTED";
  }
  return {
    reportVersion: REPORT_VERSION,
    coreVersion: CORE_VERSION,
    routePolicy: ROUTE_POLICY_ID,
    scenario: structuredClone(scenario),
    requirements: structuredClone(requirements),
    baseline: comparison.baseline,
    candidates: comparison.ranked.filter((c) => c.name !== "baseline"),
    bestName: best?.name ?? null,
    improvementPercents: comparison.improvementPercents,
    outcome,
    limitations: [...REPORT_LIMITATIONS],
  };
}

// Replay envelope: versions and route policy must match this core exactly,
// and every trusted input (scenario, requirements, candidate assignments)
// is parsed and bounded. Extra informational fields on a saved report are
// ignored and recomputed, never trusted. Malformed or incompatible reports
// throw instead of replaying.
// Verified claims per candidate: the assignment input plus the complete
// workload measurement (sequences, legs, distances, counts, flags), so a
// tampered route detail cannot still verify. Free-text diagnostics such as
// error strings are recomputed, not compared.
const legClaimSchema = z.object({
  fromId: z.string().min(1).max(MAX_ID_LEN),
  toId: z.string().min(1).max(MAX_ID_LEN),
  distanceMm: z.number().int().min(0).nullable(),
});

const orderClaimSchema = z.object({
  orderId: z.string().min(1).max(MAX_ID_LEN),
  frequency: z.number().int().min(0),
  distinctProductIds: z.array(z.string().min(1).max(MAX_ID_LEN)).max(MAX_LINES_PER_ORDER),
  units: z.number().int().min(0),
  visitSequence: z.array(z.string().min(1).max(MAX_ID_LEN)).max(MAX_LINES_PER_ORDER),
  legs: z.array(legClaimSchema).max(MAX_LINES_PER_ORDER + 1),
  distanceMm: z.number().int().min(0).nullable(),
  reachable: z.boolean(),
  reason: z.string().max(MAX_TEXT_LEN).nullable(),
});

const workloadClaimSchema = z.object({
  orders: z.array(orderClaimSchema).max(MAX_ORDERS),
  reachableOrders: z.number().int().min(0),
  totalFrequency: z.number().int().min(0).nullable(),
  weightedTravelMm: z.number().int().min(0).nullable(),
  meanOrderDistanceMm: z.number().min(0).nullable(),
  totalUnits: z.number().int().min(0).nullable(),
  arithmeticOverflow: z.boolean(),
  budgetExhausted: z.boolean(),
});

const candidateClaimSchema = z.object({
  name: z.string().min(1).max(MAX_ID_LEN),
  assignment: z.array(assignmentSchema).max(MAX_ASSIGNMENTS),
  valid: z.boolean(),
  weightedTravelMm: z.number().int().min(0).nullable(),
  relocationCount: z.number().int().min(0).max(MAX_ASSIGNMENTS),
  workload: workloadClaimSchema.nullable(),
});

type CandidateClaim = z.infer<typeof candidateClaimSchema>;

function claimOf(c: CandidateResult): CandidateClaim {
  return {
    name: c.name,
    assignment: c.assignment,
    valid: c.valid,
    weightedTravelMm: c.weightedTravelMm,
    relocationCount: c.relocationCount,
    workload: c.workload === null
      ? null
      : {
        orders: c.workload.orders.map((o) => ({
          orderId: o.orderId,
          frequency: o.frequency,
          distinctProductIds: o.distinctProductIds,
          units: o.units,
          visitSequence: o.visitSequence,
          legs: o.legs.map((l) => ({ fromId: l.fromId, toId: l.toId, distanceMm: l.distanceMm })),
          distanceMm: o.distanceMm,
          reachable: o.reachable,
          reason: o.reason,
        })),
        reachableOrders: c.workload.reachableOrders,
        totalFrequency: c.workload.totalFrequency,
        weightedTravelMm: c.workload.weightedTravelMm,
        meanOrderDistanceMm: c.workload.meanOrderDistanceMm,
        totalUnits: c.workload.totalUnits,
        arithmeticOverflow: c.workload.arithmeticOverflow,
        budgetExhausted: c.workload.budgetExhausted,
      },
  };
}

const replayEnvelopeSchema = z.object({
  reportVersion: z.literal(REPORT_VERSION),
  coreVersion: z.literal(CORE_VERSION),
  routePolicy: z.literal(ROUTE_POLICY_ID),
  scenario: scenarioSchema,
  requirements: requirementsSchema,
  baseline: candidateClaimSchema,
  candidates: z.array(candidateClaimSchema).max(MAX_REPORT_CANDIDATES),
  bestName: z.string().min(1).max(MAX_ID_LEN).nullable(),
  improvementPercents: z.record(z.string(), z.number().nullable()).refine(
    (r) => Object.keys(r).length <= MAX_REPORT_CANDIDATES + 1,
    { message: "too many improvement entries" },
  ),
  outcome: z.enum([
    "IMPROVED_VALID_ASSIGNMENT",
    "VALID_ASSIGNMENT_FOUND",
    "NO_IMPROVEMENT_FOUND",
    "SEARCH_EXHAUSTED",
    "INPUT_INVALID",
  ]),
});

// Replay recomputes every saved candidate against the saved scenario and
// requirements. Determinism means a faithful replay matches exactly.
export function replayReport(reportJson: unknown): {
  report: EvaluationReport;
  matchesSaved: boolean;
  mismatches: string[];
} {
  const saved = replayEnvelopeSchema.parse(reportJson);
  const scenario = saved.scenario;
  const requirements = saved.requirements;
  const entries = saved.candidates.map((c) => ({ name: c.name, mapping: c.assignment }));
  const fresh = createReport(scenario, requirements, entries);
  const mismatches: string[] = [];
  const same = (label: string, a: unknown, b: unknown): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(label);
  };
  // Percentage records are keyed maps, not sequences: canonical sorted-entry
  // comparison so insertion order alone cannot mismatch identical values.
  // All array/order/route comparisons stay order-sensitive on purpose.
  const sameRecord = (label: string, a: Record<string, number | null>, b: Record<string, number | null>): void => {
    const canonical = (r: Record<string, number | null>): string =>
      JSON.stringify(Object.entries(r).sort(([ka], [kb]) => (ka < kb ? -1 : ka > kb ? 1 : 0)));
    if (canonical(a) !== canonical(b)) mismatches.push(label);
  };
  same("baseline", claimOf(fresh.baseline), saved.baseline);
  same("candidates", fresh.candidates.map(claimOf), saved.candidates);
  same("bestName", fresh.bestName, saved.bestName);
  sameRecord("improvementPercents", fresh.improvementPercents, saved.improvementPercents);
  same("outcome", fresh.outcome, saved.outcome);
  return { report: fresh, matchesSaved: mismatches.length === 0, mismatches };
}
