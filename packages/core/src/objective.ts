import type { Assignment, Scenario } from "./schema.js";
import { ROUTE_POLICY_ID } from "./version.js";

// Deterministic assignment key: product-sorted pairs as JSON, so ids
// containing separators cannot alias distinct assignments.
export function stableAssignmentKey(mapping: Assignment[]): string {
  const pairs = [...mapping]
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
    .map((a) => [a.productId, a.locationId]);
  return JSON.stringify(pairs);
}

// Settings that must be identical for travel comparison: everything except
// the assignment itself, the revision, and provenance metadata.
export function settingsFingerprint(scenario: Scenario): string {
  return JSON.stringify({
    routePolicy: ROUTE_POLICY_ID,
    room: scenario.room,
    racks: scenario.racks,
    locations: scenario.locations,
    products: scenario.products,
    orders: scenario.orders,
    packingPointMm: scenario.packingPointMm,
    cart: scenario.cart,
    minimumPassageWidthMm: scenario.minimumPassageWidthMm,
    gridSizeMm: scenario.gridSizeMm,
  });
}

export type ComparableResult = {
  valid: boolean;
  weightedTravelMm: number | null;
  relocationCount: number;
  settingsFingerprint: string;
  assignmentKey: string;
};

// Percentage improvement, or null (N/A) unless both results are valid under
// identical settings with positive baseline travel.
export function improvementPercent(
  baseline: ComparableResult,
  candidate: ComparableResult,
): number | null {
  if (!baseline.valid || !candidate.valid) return null;
  if (baseline.settingsFingerprint !== candidate.settingsFingerprint) return null;
  if (baseline.weightedTravelMm === null || candidate.weightedTravelMm === null) return null;
  if (baseline.weightedTravelMm <= 0) return null;
  return (100 * (baseline.weightedTravelMm - candidate.weightedTravelMm)) / baseline.weightedTravelMm;
}

export type RankedCandidate<T> = T & {
  valid: boolean;
  weightedTravelMm: number | null;
  relocationCount: number;
  assignmentKey: string;
};

// Valid candidates first (lowest travel, fewest relocations, stable key);
// invalid candidates trail in stable-key order and are never selected.
export function rankCandidates<T>(candidates: RankedCandidate<T>[]): RankedCandidate<T>[] {
  return [...candidates].sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    if (!a.valid || !b.valid) {
      return a.assignmentKey < b.assignmentKey ? -1 : a.assignmentKey > b.assignmentKey ? 1 : 0;
    }
    const wa = a.weightedTravelMm as number;
    const wb = b.weightedTravelMm as number;
    if (wa !== wb) return wa - wb;
    if (a.relocationCount !== b.relocationCount) return a.relocationCount - b.relocationCount;
    return a.assignmentKey < b.assignmentKey ? -1 : a.assignmentKey > b.assignmentKey ? 1 : 0;
  });
}

export function selectBest<T>(candidates: RankedCandidate<T>[]): RankedCandidate<T> | null {
  const ranked = rankCandidates(candidates);
  const best = ranked[0];
  return best !== undefined && best.valid ? best : null;
}
