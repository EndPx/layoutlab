import {
  BudgetExhausted,
  MAX_WORKLOAD_EXPANSIONS,
  createNavBudget,
  shortestPathMm,
  type NavBudget,
} from "./nav.js";
import { PACKING_ID, type Scenario } from "./schema.js";
import type { NavContext } from "./scene.js";

export { PACKING_ID };

export function safeAdd(a: number, b: number): number | null {
  const c = a + b;
  return Number.isSafeInteger(c) ? c : null;
}

export function safeMul(a: number, b: number): number | null {
  const c = a * b;
  return Number.isSafeInteger(c) ? c : null;
}

export type LegResult = { fromId: string; toId: string; distanceMm: number | null };

// Reason marker for orders left unevaluated by budget exhaustion. Distinct
// from unreachable: the path may exist, but computation ran out.
export const EVALUATION_BUDGET_REASON = "EVALUATION_BUDGET_EXHAUSTED";

export type OrderResult = {
  orderId: string;
  frequency: number;
  distinctProductIds: string[];
  units: number;
  visitSequence: string[];
  legs: LegResult[];
  distanceMm: number | null;
  reachable: boolean;
  reason: string | null;
};

export type WorkloadResult = {
  orders: OrderResult[];
  reachableOrders: number;
  totalFrequency: number | null;
  weightedTravelMm: number | null;
  meanOrderDistanceMm: number | null;
  totalUnits: number | null;
  arithmeticOverflow: boolean;
  budgetExhausted: boolean;
};

export type WorkloadLimits = { maxExpansions?: number };

type Endpoint = { locationId: string; productId: string };

// Deterministic nearest-neighbor policy: from the current endpoint visit the
// remaining pick point with the shortest path distance; ties break by
// product ID (code-unit order). Quantities never create repeat visits.
export function evaluateWorkload(
  scenario: Scenario,
  finalMapping: { productId: string; locationId: string }[],
  nav: NavContext,
  limits: WorkloadLimits = {},
): WorkloadResult {
  const locationOf = new Map(finalMapping.map((a) => [a.productId, a.locationId]));
  const packing = scenario.packingPointMm;
  const budget: NavBudget = createNavBudget(limits.maxExpansions ?? MAX_WORKLOAD_EXPANSIONS);
  const distCache = new Map<string, number | null>();

  const endpoints: { id: string; point: { x: number; z: number } }[] = [
    { id: PACKING_ID, point: packing },
  ];
  const indexOf = new Map<string, number>([[PACKING_ID, 0]]);
  for (const location of scenario.locations) {
    indexOf.set(location.id, endpoints.length);
    endpoints.push({ id: location.id, point: location.pickPointMm });
  }

  function distanceBetween(aId: string, bId: string): number | null {
    // Collision-safe tuple key: ordered ids as JSON, never joined strings.
    const key = JSON.stringify(aId < bId ? [aId, bId] : [bId, aId]);
    const cached = distCache.get(key);
    if (cached !== undefined) return cached;
    const a = endpoints[indexOf.get(aId) as number];
    const b = endpoints[indexOf.get(bId) as number];
    // Grid A* is symmetric, so one directed computation serves both orders.
    const d = a !== undefined && b !== undefined
      ? shortestPathMm(a.point, b.point, scenario, nav, budget)
      : null;
    distCache.set(key, d);
    return d;
  }

  let overflow = false;
  let budgetExhausted = false;
  const orders: OrderResult[] = [];

  function orderHeader(order: Scenario["orders"][number]): Pick<OrderResult, "distinctProductIds" | "units"> {
    const distinctProductIds = [...new Set(order.lines.map((l) => l.productId))];
    let units = 0;
    for (const line of order.lines) {
      const u = safeAdd(units, line.quantity);
      if (u === null) overflow = true;
      else units = u;
    }
    return { distinctProductIds, units };
  }

  function pendingOrder(order: Scenario["orders"][number]): OrderResult {
    const header = orderHeader(order);
    return {
      orderId: order.id,
      frequency: order.frequency,
      ...header,
      visitSequence: [],
      legs: [],
      distanceMm: null,
      reachable: false,
      reason: EVALUATION_BUDGET_REASON,
    };
  }

  for (let oi = 0; oi < scenario.orders.length; oi++) {
    const order = scenario.orders[oi] as Scenario["orders"][number];
    const header = orderHeader(order);
    const result: OrderResult = {
      orderId: order.id,
      frequency: order.frequency,
      ...header,
      visitSequence: [],
      legs: [],
      distanceMm: null,
      reachable: false,
      reason: null,
    };
    try {
      evaluateOrder(header.distinctProductIds, result);
    } catch (e) {
      if (!(e instanceof BudgetExhausted)) throw e;
      budgetExhausted = true;
      result.reason = EVALUATION_BUDGET_REASON;
      orders.push(result);
      for (let k = oi + 1; k < scenario.orders.length; k++) {
        orders.push(pendingOrder(scenario.orders[k] as Scenario["orders"][number]));
      }
      break;
    }
    orders.push(result);
  }

  function evaluateOrder(distinctProductIds: string[], result: OrderResult): void {
    const targets: Endpoint[] = [];
    let blocked: string | null = null;
    for (const productId of distinctProductIds) {
      const locationId = locationOf.get(productId);
      if (locationId === undefined || !indexOf.has(locationId)) {
        blocked = `product ${productId} has no usable assigned location`;
        break;
      }
      targets.push({ locationId, productId });
    }

    if (blocked !== null) {
      result.reason = blocked;
      return;
    }
    let currentLegId = PACKING_ID;
    let currentLoc = PACKING_ID;
    let total: number | null = 0;
    const remaining = [...targets];
    let failed: string | null = null;
    while (remaining.length > 0 && failed === null) {
      let best = -1;
      let bestDist = -1;
      for (let k = 0; k < remaining.length; k++) {
        const t = remaining[k] as Endpoint;
        const d = distanceBetween(currentLoc, t.locationId);
        if (d === null) continue;
        if (
          best === -1 || d < bestDist ||
          (d === bestDist && t.productId < (remaining[best] as Endpoint).productId)
        ) {
          best = k;
          bestDist = d;
        }
      }
      if (best === -1) {
        const unreachable = remaining.map((t) => t.productId).sort();
        failed = `no path from ${currentLegId} to product ${unreachable[0]}`;
        result.legs.push({ fromId: currentLegId, toId: unreachable[0] as string, distanceMm: null });
        break;
      }
      const next = remaining.splice(best, 1)[0] as Endpoint;
      result.visitSequence.push(next.productId);
      result.legs.push({ fromId: currentLegId, toId: next.productId, distanceMm: bestDist });
      currentLegId = next.productId;
      currentLoc = next.locationId;
      total = total === null ? null : safeAdd(total, bestDist);
      if (total === null) overflow = true;
    }
    if (failed !== null) {
      result.reason = failed;
    } else if (total === null) {
      result.reason = "ARITHMETIC_OVERFLOW";
    } else {
      const back = distanceBetween(currentLoc, PACKING_ID);
      if (back === null) {
        result.reason = `no return path from ${currentLegId} to packing`;
        result.legs.push({ fromId: currentLegId, toId: PACKING_ID, distanceMm: null });
      } else {
        const grand = safeAdd(total, back);
        if (grand === null) {
          overflow = true;
          result.reason = "ARITHMETIC_OVERFLOW";
        } else {
          result.legs.push({ fromId: currentLegId, toId: PACKING_ID, distanceMm: back });
          result.distanceMm = grand;
          result.reachable = true;
        }
      }
    }
  }

  let totalFrequency: number | null = 0;
  let weighted: number | null = 0;
  let totalUnits: number | null = 0;
  let allReachable = true;
  for (const o of orders) {
    totalFrequency = totalFrequency === null ? null : safeAdd(totalFrequency, o.frequency);
    const unitsWeighted = safeMul(o.frequency, o.units);
    totalUnits = totalUnits === null || unitsWeighted === null ? null : safeAdd(totalUnits, unitsWeighted);
    if (!o.reachable || o.distanceMm === null) {
      allReachable = false;
      continue;
    }
    const leg = safeMul(o.frequency, o.distanceMm);
    weighted = weighted === null || leg === null ? null : safeAdd(weighted, leg);
  }
  if (totalFrequency === null || weighted === null || totalUnits === null) overflow = true;

  const complete = allReachable && !overflow && !budgetExhausted;
  const completeWeighted = complete ? (weighted as number) : null;
  return {
    orders,
    reachableOrders: orders.filter((o) => o.reachable).length,
    totalFrequency: overflow ? null : totalFrequency,
    // No complete workload travel when any order is unreachable, overflows,
    // or the evaluation budget is exhausted: partial sums are never
    // presented as the workload total.
    weightedTravelMm: completeWeighted,
    meanOrderDistanceMm: completeWeighted !== null && (totalFrequency as number) > 0
      ? completeWeighted / (totalFrequency as number)
      : null,
    totalUnits: overflow ? null : totalUnits,
    arithmeticOverflow: overflow,
    budgetExhausted,
  };
}
