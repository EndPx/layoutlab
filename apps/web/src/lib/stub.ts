import {
  fitsFixedOrientation,
  type AssignmentProposal,
  type PlanningRequirements,
  type Scenario,
} from "@layoutlab/core";

// Deterministic controlled stub: proposes single moves of unlocked products
// into empty compatible locations (sorted by id), then pairwise swaps as a
// fallback. Never a demand heuristic, never model inference. Every proposal
// targets the original frozen baseline revision.
export function generateStubProposals(
  baseline: Scenario,
  requirements: PlanningRequirements,
  maxProposals = 3,
): AssignmentProposal[] {
  const revision = baseline.revision;
  if (requirements.maxRelocatedProducts <= 0) {
    return [
      {
        scenarioRevision: revision,
        changes: [],
        rationale: "Stub 1/1: relocation budget is 0, retaining the current assignment (no model used).",
      },
    ];
  }
  const occupied = new Set(baseline.assignments.map((a) => a.locationId));
  const emptyLocations = baseline.locations
    .filter((l) => !occupied.has(l.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const locked = new Set(requirements.lockedProductIds);
  const movable = baseline.products
    .filter((p) => p.lockedLocationId === undefined && !locked.has(p.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const locationOf = new Map(baseline.assignments.map((a) => [a.productId, a.locationId]));
  const proposals: AssignmentProposal[] = [];

  const compatible = (productId: string, locationId: string): boolean => {
    const product = baseline.products.find((p) => p.id === productId);
    const location = baseline.locations.find((l) => l.id === locationId);
    if (!product || !location) return false;
    if (product.requiredStorageClass !== location.storageClass) return false;
    if (location.allowedProductIds !== undefined && !location.allowedProductIds.includes(productId)) {
      return false;
    }
    if (product.allowedLocationIds !== undefined && !product.allowedLocationIds.includes(locationId)) {
      return false;
    }
    return fitsFixedOrientation(product, location);
  };

  for (const product of movable) {
    for (const location of emptyLocations) {
      if (proposals.length >= maxProposals) break;
      if (locationOf.get(product.id) === location.id) continue;
      if (!compatible(product.id, location.id)) continue;
      // Avoid proposing the same product twice across the stub set.
      if (proposals.some((p) => p.changes.some((c) => c.productId === product.id))) continue;
      proposals.push({
        scenarioRevision: revision,
        changes: [{ productId: product.id, locationId: location.id }],
        rationale:
          `Stub ${proposals.length + 1}/${maxProposals}: move ${product.id} to empty ${location.id} ` +
          `(deterministic stub, no model; budget ${requirements.maxRelocatedProducts}).`,
      });
    }
    if (proposals.length >= maxProposals) break;
  }

  // Fallback: pairwise swaps of unlocked products (2 relocations each).
  if (proposals.length < maxProposals && requirements.maxRelocatedProducts >= 2) {
    for (let i = 0; i < movable.length && proposals.length < maxProposals; i++) {
      for (let j = i + 1; j < movable.length && proposals.length < maxProposals; j++) {
        const a = movable[i]!;
        const b = movable[j]!;
        if (proposals.some((p) => p.changes.some((c) => c.productId === a.id || c.productId === b.id))) {
          continue;
        }
        const locA = locationOf.get(a.id);
        const locB = locationOf.get(b.id);
        if (!locA || !locB || locA === locB) continue;
        if (!compatible(a.id, locB) || !compatible(b.id, locA)) continue;
        proposals.push({
          scenarioRevision: revision,
          changes: [
            { productId: a.id, locationId: locB },
            { productId: b.id, locationId: locA },
          ],
          rationale:
            `Stub ${proposals.length + 1}/${maxProposals}: swap ${a.id} and ${b.id} ` +
            `(deterministic stub, no model; budget ${requirements.maxRelocatedProducts}).`,
        });
      }
    }
  }

  if (proposals.length === 0) {
    return [
      {
        scenarioRevision: revision,
        changes: [],
        rationale: "Stub 1/1: no empty compatible move found, retaining the current assignment (no model used).",
      },
    ];
  }
  return proposals;
}
