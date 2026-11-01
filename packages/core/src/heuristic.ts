// Bounded demand heuristic (M4). Pure, deterministic, no model, no browser.
// Demand frequency is the sum of order.frequency over the orders that contain
// a product (distinct per order); quantities feed units reporting only and
// never create repeat visits or demand weight. High-demand products are
// matched to nearby reachable locations; locks, compatibility, the complete
// mapping, and the relocation budget are always preserved.
//
// Candidate strategy (fixed order, all complete mappings, all evaluated
// through the existing core evaluator):
//  1. One greedy construction: locked products stay, movable products in
//     demand order take the nearest compatible reachable free location.
//     Repaired to the relocation budget by reverting the lowest-priority
//     moves first (bounded: every product reverts at most once per round,
//     the moved set shrinks every round). An incomplete greedy mapping is
//     rejected outright, never silently dropped or partially applied.
//  2. Bounded single moves of movable products into reachable, baseline-
//     empty, compatible locations (demand order x distance order).
//  3. Bounded pairwise swaps between movable products whose baseline
//     locations are both reachable and cross-compatible (demand order).
// Baseline-identical and duplicate mappings cost no evaluation. Selection
// mirrors the core objective: lowest weighted travel, fewest relocations,
// stable assignment key. No equal-compute claim: every result carries its
// own explicit candidate-evaluation budget and counter. Fixed-scene geometry
// is validated before any search (invalid scene yields INPUT_INVALID with no
// ranking, search, or evaluation); location ranking shares one aggregate A*
// budget and marks computation exhaustion explicitly, never as unreachable.
import { stableAssignmentKey, selectBest } from "./objective.js";
import { BudgetExhausted, createNavBudget, shortestPathMm, type NavBudget } from "./nav.js";
import { evaluateCandidate, type CandidateResult } from "./report.js";
import { buildNavContext, validateScene, type NavContext, type SceneIssue } from "./scene.js";
import type {
  Assignment,
  PlanningRequirements,
  Product,
  Scenario,
  StorageLocation,
} from "./schema.js";
import { fitsFixedOrientation, relocationCount } from "./validate.js";

export const HEURISTIC_NAME = "heuristic";
export const HEURISTIC_METHOD = "demand-greedy-swaps/1";
export const DEFAULT_HEURISTIC_MAX_EVALUATIONS = 32;
export const MAX_HEURISTIC_EVALUATIONS = 256;

// Exact method labels shared by core, API, and web so comparison tables and
// reports never conflate the heuristic with model improvement.
export type MethodLabel =
  | "current"
  | "heuristic"
  | "meta-first"
  | "meta-feedback"
  | "stub"
  | "other";

export function methodLabelFor(candidateName: string): MethodLabel {
  if (candidateName === "baseline") return "current";
  if (candidateName === HEURISTIC_NAME) return "heuristic";
  if (candidateName === "proposal-1") return "meta-first";
  if (/^proposal-\d+$/.test(candidateName)) return "meta-feedback";
  if (/^stub-\d+$/.test(candidateName)) return "stub";
  return "other";
}

// Sum of order.frequency per distinct product per order. Quantity is ignored
// here on purpose: one order visits each distinct product once.
export function computeDemandFrequency(scenario: Scenario): Map<string, number> {
  const demand = new Map<string, number>();
  for (const p of scenario.products) demand.set(p.id, 0);
  for (const order of scenario.orders) {
    for (const productId of new Set(order.lines.map((l) => l.productId))) {
      demand.set(productId, (demand.get(productId) ?? 0) + order.frequency);
    }
  }
  return demand;
}

export type LocationRankStatus = "reachable" | "unreachable" | "ranking-exhausted";

export type LocationRank = {
  locationId: string;
  distanceMm: number | null;
  reachable: boolean;
  status: LocationRankStatus;
};

// Reachable locations by shortest packing distance, then id; unreachable
// locations trail by id; computation-exhausted locations trail last, with an
// explicit status that is never mislabeled physically unreachable. Ranking
// shares ONE aggregate A* budget across all locations (never a fresh budget
// per location), so worst-case ranking work stays bounded; when it runs out,
// the remaining locations keep the explicit ranking-exhausted status and the
// heuristic proceeds with the ranked reachable subset. Only reachable
// locations are ever heuristic destinations.
export function rankLocationsByPackingDistance(
  scenario: Scenario,
  nav: NavContext = buildNavContext(scenario),
  rankingBudget: NavBudget = createNavBudget(),
): LocationRank[] {
  const ranks: LocationRank[] = [];
  let exhausted = false;
  for (const l of scenario.locations) {
    if (exhausted) {
      ranks.push({ locationId: l.id, distanceMm: null, reachable: false, status: "ranking-exhausted" });
      continue;
    }
    let d: number | null;
    try {
      d = shortestPathMm(scenario.packingPointMm, l.pickPointMm, scenario, nav, rankingBudget);
    } catch (e) {
      if (!(e instanceof BudgetExhausted)) throw e;
      exhausted = true;
      ranks.push({ locationId: l.id, distanceMm: null, reachable: false, status: "ranking-exhausted" });
      continue;
    }
    ranks.push({
      locationId: l.id,
      distanceMm: d,
      reachable: d !== null,
      status: d !== null ? "reachable" : "unreachable",
    });
  }
  const order = { reachable: 0, unreachable: 1, "ranking-exhausted": 2 } as const;
  ranks.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.status !== "reachable" || b.status !== "reachable") {
      return a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0;
    }
    const da = a.distanceMm as number;
    const db = b.distanceMm as number;
    if (da !== db) return da - db;
    return a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0;
  });
  return ranks;
}

export type HeuristicOptions = {
  maxCandidateEvaluations?: number;
  nav?: NavContext;
  rankingBudget?: NavBudget;
};

export type HeuristicResult = {
  name: typeof HEURISTIC_NAME;
  method: typeof HEURISTIC_METHOD;
  // Fixed-scene gate (brief section 13): an invalid scene returns
  // INPUT_INVALID diagnostics with no ranking, no search, and no evaluation.
  sceneOk: boolean;
  sceneIssues: SceneIssue[];
  // Complete mapping: every product exactly once. Baseline copy when retained.
  mapping: Assignment[];
  // Core evaluation of mapping, or null when the budget allowed no evaluation.
  candidate: CandidateResult | null;
  retainedBaseline: boolean;
  // True when location ranking exhausted its aggregate computation budget;
  // exhausted locations are explicitly marked, never called unreachable.
  rankingExhausted: boolean;
  // Explicit budget/counter: every evaluateCandidate call inside runHeuristic,
  // including the retained-baseline confirmation evaluation.
  evaluationsUsed: number;
  evaluationsBudget: number;
  candidatesGenerated: number;
  candidatesSkippedDuplicate: number;
  candidatesSkippedBudget: number;
  greedyRejected: boolean;
  greedyRejectReason: string | null;
  demandRank: { productId: string; demand: number }[];
  locationRank: LocationRank[];
  reason: string;
};

function compatible(product: Product, location: StorageLocation): boolean {
  if (product.requiredStorageClass !== location.storageClass) return false;
  if (location.allowedProductIds !== undefined && !location.allowedProductIds.includes(product.id)) {
    return false;
  }
  if (product.allowedLocationIds !== undefined && !product.allowedLocationIds.includes(location.id)) {
    return false;
  }
  return fitsFixedOrientation(product, location);
}

function byDemandThenId(
  demand: Map<string, number>,
): (a: Product, b: Product) => number {
  return (a, b) => {
    const da = demand.get(a.id) ?? 0;
    const db = demand.get(b.id) ?? 0;
    if (da !== db) return db - da;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

export function runHeuristic(
  scenario: Scenario,
  requirements: PlanningRequirements,
  opts: HeuristicOptions = {},
): HeuristicResult {
  const nav = opts.nav ?? buildNavContext(scenario);
  // Non-finite budgets (NaN/Infinity) default instead of bypassing the cap:
  // NaN would make every `>= budget` comparison false and unbound the search.
  const rawBudget = opts.maxCandidateEvaluations ?? DEFAULT_HEURISTIC_MAX_EVALUATIONS;
  const finiteBudget = Number.isFinite(rawBudget) ? Math.floor(rawBudget) : DEFAULT_HEURISTIC_MAX_EVALUATIONS;
  const budget = Math.max(0, Math.min(MAX_HEURISTIC_EVALUATIONS, finiteBudget));
  // Scene gate first: invalid fixed geometry means INPUT_INVALID with no
  // ranking, no assignment search, and no candidate evaluation. An
  // assignment-invalid baseline is still searchable and passes this gate.
  const scene = validateScene(scenario, nav);
  if (!scene.ok) {
    const codes = scene.issues.map((i) => i.code).join(", ");
    return {
      name: HEURISTIC_NAME,
      method: HEURISTIC_METHOD,
      sceneOk: false,
      sceneIssues: scene.issues,
      mapping: scenario.assignments.map((a) => ({ ...a })),
      candidate: null,
      retainedBaseline: true,
      rankingExhausted: false,
      evaluationsUsed: 0,
      evaluationsBudget: budget,
      candidatesGenerated: 0,
      candidatesSkippedDuplicate: 0,
      candidatesSkippedBudget: 0,
      greedyRejected: false,
      greedyRejectReason: null,
      demandRank: [],
      locationRank: [],
      reason: `scene geometry invalid (INPUT_INVALID: ${codes}); assignment search not started`,
    };
  }
  const demand = computeDemandFrequency(scenario);
  const demandRank = [...scenario.products]
    .sort(byDemandThenId(demand))
    .map((p) => ({ productId: p.id, demand: demand.get(p.id) ?? 0 }));
  const locationRank = rankLocationsByPackingDistance(scenario, nav, opts.rankingBudget ?? createNavBudget());
  const rankingExhausted = locationRank.some((r) => r.status === "ranking-exhausted");
  const reachableNear = locationRank.filter((r) => r.status === "reachable");

  const products = new Map(scenario.products.map((p) => [p.id, p]));
  const locations = new Map(scenario.locations.map((l) => [l.id, l]));
  const locked = new Set<string>();
  for (const p of scenario.products) {
    if (p.lockedLocationId !== undefined || requirements.lockedProductIds.includes(p.id)) {
      locked.add(p.id);
    }
  }
  const movable = [...scenario.products].filter((p) => !locked.has(p.id)).sort(byDemandThenId(demand));
  const baselineByProduct = new Map(scenario.assignments.map((a) => [a.productId, a.locationId]));
  const baselineKey = stableAssignmentKey(scenario.assignments);
  const baselineOccupied = new Set(scenario.assignments.map((a) => a.locationId));

  const seen = new Set<string>([baselineKey]);
  const admitted: Assignment[][] = [];
  let duplicates = 0;
  const admit = (mapping: Assignment[]): void => {
    const key = stableAssignmentKey(mapping);
    if (seen.has(key)) {
      duplicates++;
      return;
    }
    seen.add(key);
    admitted.push(mapping);
  };
  let generated = 0;

  // 1. Greedy construction with bounded budget repair.
  let greedyRejected = false;
  let greedyRejectReason: string | null = null;
  {
    const greedy = new Map<string, string>();
    const occupied = new Set<string>();
    for (const p of scenario.products) {
      if (!locked.has(p.id)) continue;
      const at = baselineByProduct.get(p.id);
      if (at === undefined) {
        greedyRejected = true;
        greedyRejectReason = `locked product ${p.id} has no baseline location; greedy rejected`;
        break;
      }
      greedy.set(p.id, at);
      occupied.add(at);
    }
    if (!greedyRejected) {
      for (const p of movable) {
        let placed: string | null = null;
        for (const r of reachableNear) {
          if (occupied.has(r.locationId)) continue;
          const loc = locations.get(r.locationId);
          if (!loc || !compatible(p, loc)) continue;
          placed = r.locationId;
          break;
        }
        if (placed === null) {
          greedyRejected = true;
          greedyRejectReason =
            `no reachable compatible free location for ${p.id}; incomplete greedy mapping rejected`;
          break;
        }
        greedy.set(p.id, placed);
        occupied.add(placed);
      }
    }
    if (!greedyRejected) {
      // Completeness guard: every product placed exactly once.
      if (greedy.size !== scenario.products.length) {
        greedyRejected = true;
        greedyRejectReason = "greedy placed a partial product set; incomplete mapping rejected";
      } else {
        let mapping: Assignment[] = [...greedy].map(([productId, locationId]) => ({ productId, locationId }));
        // Bounded repair: revert lowest-priority moves until within budget.
        // Each round reverts at least one product to its baseline spot, so
        // the moved set strictly shrinks and the loop always terminates.
        const priority = new Map(demandRank.map((d, i) => [d.productId, i]));
        for (;;) {
          const moved = mapping.filter((a) => baselineByProduct.get(a.productId) !== a.locationId);
          if (moved.length <= requirements.maxRelocatedProducts) break;
          moved.sort((a, b) => {
            const pa = priority.get(a.productId) ?? 0;
            const pb = priority.get(b.productId) ?? 0;
            if (pa !== pb) return pb - pa; // lowest demand priority first
            return a.productId < b.productId ? 1 : a.productId > b.productId ? -1 : 0;
          });
          const victim = moved[0] as Assignment;
          const next = new Map(mapping.map((a) => [a.productId, a.locationId]));
          const home = baselineByProduct.get(victim.productId);
          if (home === undefined) break; // product missing from baseline: cannot repair further
          next.set(victim.productId, home);
          // A revert that collides restores the occupant home too; the moved
          // set still shrinks by at least the victim.
          for (const [pid, lid] of next) {
            if (pid !== victim.productId && lid === home && baselineByProduct.get(pid) !== lid) {
              const occupantHome = baselineByProduct.get(pid);
              if (occupantHome !== undefined) next.set(pid, occupantHome);
            }
          }
          mapping = [...next].map(([productId, locationId]) => ({ productId, locationId }));
        }
        generated++;
        admit(mapping);
      }
    }
  }

  // 2. Single moves into reachable baseline-empty compatible locations.
  if (requirements.maxRelocatedProducts >= 1) {
    for (const p of movable) {
      const from = baselineByProduct.get(p.id);
      for (const r of reachableNear) {
        if (baselineOccupied.has(r.locationId)) continue;
        if (r.locationId === from) continue;
        const loc = locations.get(r.locationId);
        if (!loc || !compatible(p, loc)) continue;
        const mapping = scenario.assignments.map((a) =>
          a.productId === p.id ? { productId: p.id, locationId: r.locationId } : { ...a },
        );
        // Products missing from the baseline mapping stay missing here too:
        // the core validator reports them, the heuristic never invents rows.
        if (!mapping.some((a) => a.productId === p.id)) continue;
        generated++;
        admit(mapping);
      }
    }
  }

  // 3. Pairwise swaps between movable products on reachable baseline spots.
  if (requirements.maxRelocatedProducts >= 2) {
    const reachableSet = new Set(reachableNear.map((r) => r.locationId));
    for (let i = 0; i < movable.length; i++) {
      for (let j = i + 1; j < movable.length; j++) {
        const a = movable[i] as Product;
        const b = movable[j] as Product;
        const locA = baselineByProduct.get(a.id);
        const locB = baselineByProduct.get(b.id);
        if (!locA || !locB || locA === locB) continue;
        if (!reachableSet.has(locA) || !reachableSet.has(locB)) continue;
        const spotA = locations.get(locA);
        const spotB = locations.get(locB);
        if (!spotA || !spotB || !compatible(a, spotB) || !compatible(b, spotA)) continue;
        const mapping = scenario.assignments.map((row) => {
          if (row.productId === a.id) return { productId: a.id, locationId: locB };
          if (row.productId === b.id) return { productId: b.id, locationId: locA };
          return { ...row };
        });
        generated++;
        admit(mapping);
      }
    }
  }

  // Evaluate admitted mappings in generator order within the explicit budget.
  const evaluated: CandidateResult[] = [];
  let skippedBudget = 0;
  for (const mapping of admitted) {
    if (evaluated.length >= budget) {
      skippedBudget++;
      continue;
    }
    evaluated.push(evaluateCandidate(scenario, requirements, mapping, HEURISTIC_NAME, nav));
  }

  const validEvaluated = evaluated.filter((c) => c.valid);
  const best = selectBest(validEvaluated);
  if (best !== null) {
    return {
      name: HEURISTIC_NAME,
      method: HEURISTIC_METHOD,
      sceneOk: true,
      sceneIssues: [],
      mapping: structuredClone(best.assignment),
      candidate: best,
      retainedBaseline: false,
      rankingExhausted,
      evaluationsUsed: evaluated.length,
      evaluationsBudget: budget,
      candidatesGenerated: generated,
      candidatesSkippedDuplicate: duplicates,
      candidatesSkippedBudget: skippedBudget,
      greedyRejected,
      greedyRejectReason,
      demandRank,
      locationRank,
      reason: `heuristic best valid: ${best.weightedTravelMm} mm, ${best.relocationCount} relocations`,
    };
  }

  // No valid heuristic candidate: retain the baseline mapping, confirmed
  // through the same evaluator when the budget allows one evaluation.
  const baselineCopy = scenario.assignments.map((a) => ({ ...a }));
  if (evaluated.length < budget) {
    const confirmation = evaluateCandidate(scenario, requirements, baselineCopy, HEURISTIC_NAME, nav);
    return {
      name: HEURISTIC_NAME,
      method: HEURISTIC_METHOD,
      sceneOk: true,
      sceneIssues: [],
      mapping: baselineCopy,
      candidate: confirmation,
      retainedBaseline: true,
      rankingExhausted,
      evaluationsUsed: evaluated.length + 1,
      evaluationsBudget: budget,
      candidatesGenerated: generated,
      candidatesSkippedDuplicate: duplicates,
      candidatesSkippedBudget: skippedBudget,
      greedyRejected,
      greedyRejectReason,
      demandRank,
      locationRank,
      reason:
        evaluated.length === 0 && generated === 0
          ? "no heuristic move admitted (locks/budget/compatibility); baseline retained"
          : "no valid heuristic candidate; baseline retained",
    };
  }
  return {
    name: HEURISTIC_NAME,
    method: HEURISTIC_METHOD,
    sceneOk: true,
    sceneIssues: [],
    mapping: baselineCopy,
    candidate: null,
    retainedBaseline: true,
    rankingExhausted,
    evaluationsUsed: evaluated.length,
    evaluationsBudget: budget,
    candidatesGenerated: generated,
    candidatesSkippedDuplicate: duplicates,
    candidatesSkippedBudget: skippedBudget,
    greedyRejected,
    greedyRejectReason,
    demandRank,
    locationRank,
    reason: "candidate-evaluation budget exhausted before baseline confirmation; baseline retained",
  };
}
