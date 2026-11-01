import type {
  Assignment,
  AssignmentProposal,
  PlanningRequirements,
  Product,
  Scenario,
  StorageLocation,
} from "./schema.js";
import { PACKING_ID } from "./schema.js";

export type ValidationError = { code: string; message: string };

// Fixed load orientation: the stored load fits only when every dimension
// fits without rotation.
export function fitsFixedOrientation(product: Product, location: StorageLocation): boolean {
  const load = product.storedLoadDimensionsMm;
  const box = location.usableDimensionsMm;
  return load.width <= box.width && load.depth <= box.depth && load.height <= box.height;
}

export function relocationCount(finalMapping: Assignment[], baselineMapping: Assignment[]): number {
  const finalByProduct = new Map(finalMapping.map((a) => [a.productId, a.locationId]));
  const baseByProduct = new Map(baselineMapping.map((a) => [a.productId, a.locationId]));
  const products = new Set([...finalByProduct.keys(), ...baseByProduct.keys()]);
  let count = 0;
  for (const p of products) {
    if (finalByProduct.get(p) !== baseByProduct.get(p)) count++;
  }
  return count;
}

// Atomic proposal application: stale revisions, unknown refs, duplicate
// changes, and changes to duplicate baseline rows fail without touching the
// baseline; success yields a complete final mapping with untouched rows
// preserved exactly. The baseline array is never mutated.
export function applyProposal(
  scenario: Scenario,
  proposal: AssignmentProposal,
): { ok: true; finalMapping: Assignment[] } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (proposal.scenarioRevision !== scenario.revision) {
    return {
      ok: false,
      errors: [{
        code: "STALE_REVISION",
        message: `proposal revision ${proposal.scenarioRevision} does not match scenario revision ${scenario.revision}`,
      }],
    };
  }
  const products = new Set(scenario.products.map((p) => p.id));
  const locations = new Set(scenario.locations.map((l) => l.id));
  const seen = new Set<string>();
  for (const change of proposal.changes) {
    if (!products.has(change.productId)) {
      errors.push({ code: "PROPOSAL_UNKNOWN_PRODUCT", message: `unknown product ${change.productId}` });
    }
    if (!locations.has(change.locationId)) {
      errors.push({ code: "PROPOSAL_UNKNOWN_LOCATION", message: `unknown location ${change.locationId}` });
    }
    if (seen.has(change.productId)) {
      errors.push({
        code: "PROPOSAL_DUPLICATE_PRODUCT",
        message: `duplicate change for product ${change.productId}`,
      });
    }
    seen.add(change.productId);
  }
  if (errors.length > 0) return { ok: false, errors };

  // Preserve original baseline rows: only explicitly changed products move,
  // so an empty proposal never silently repairs an invalid baseline.
  const changed = new Map(proposal.changes.map((c) => [c.productId, c.locationId]));
  const baselineCounts = new Map<string, number>();
  for (const a of scenario.assignments) {
    baselineCounts.set(a.productId, (baselineCounts.get(a.productId) ?? 0) + 1);
  }
  for (const productId of changed.keys()) {
    if ((baselineCounts.get(productId) ?? 0) > 1) {
      errors.push({
        code: "PROPOSAL_AMBIGUOUS_BASELINE",
        message: `product ${productId} has duplicate baseline rows; proposal cannot select one`,
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const finalMapping: Assignment[] = scenario.assignments.map((a) =>
    changed.has(a.productId)
      ? { productId: a.productId, locationId: changed.get(a.productId) as string }
      : { productId: a.productId, locationId: a.locationId },
  );
  for (const [productId, locationId] of changed) {
    if (!baselineCounts.has(productId)) finalMapping.push({ productId, locationId });
  }
  return { ok: true, finalMapping };
}

export type AssignmentValidation = {
  valid: boolean;
  errors: ValidationError[];
  relocationCount: number;
};

// Structural assignment validation: completeness, references, occupancy,
// compatibility, locks, and budget. Reachability is evaluated separately
// during workload evaluation so unreachable orders stay reportable.
export function validateAssignment(
  scenario: Scenario,
  finalMapping: Assignment[],
  requirements: PlanningRequirements,
  baselineMapping: Assignment[] = scenario.assignments,
): AssignmentValidation {
  const errors: ValidationError[] = [];
  const products = new Map(scenario.products.map((p) => [p.id, p]));
  const locations = new Map(scenario.locations.map((l) => [l.id, l]));
  // Programmatic scenarios bypass schema parsing; the reserved routing id
  // must still never alias a real location.
  for (const location of scenario.locations) {
    if (location.id === PACKING_ID) {
      errors.push({ code: "RESERVED_LOCATION_ID", message: `location id ${PACKING_ID} is reserved` });
    }
  }

  const perProduct = new Map<string, string[]>();
  for (const a of finalMapping) {
    if (!products.has(a.productId)) {
      errors.push({
        code: "ASSIGNMENT_UNKNOWN_PRODUCT",
        message: `assignment references unknown product ${a.productId}`,
      });
      continue;
    }
    if (!locations.has(a.locationId)) {
      errors.push({
        code: "ASSIGNMENT_UNKNOWN_LOCATION",
        message: `product ${a.productId} assigned to unknown location ${a.locationId}`,
      });
    }
    const list = perProduct.get(a.productId) ?? [];
    list.push(a.locationId);
    perProduct.set(a.productId, list);
  }
  for (const [productId, list] of perProduct) {
    if (list.length > 1) {
      errors.push({
        code: "ASSIGNMENT_DUPLICATE_PRODUCT",
        message: `product ${productId} assigned ${list.length} times`,
      });
    }
  }
  for (const productId of products.keys()) {
    if (!perProduct.has(productId)) {
      errors.push({ code: "ASSIGNMENT_MISSING_PRODUCT", message: `product ${productId} is not assigned` });
    }
  }

  const occupants = new Map<string, string[]>();
  for (const a of finalMapping) {
    if (!products.has(a.productId) || !locations.has(a.locationId)) continue;
    const list = occupants.get(a.locationId) ?? [];
    list.push(a.productId);
    occupants.set(a.locationId, list);
  }
  for (const [locationId, list] of occupants) {
    if (list.length > 1) {
      errors.push({
        code: "LOCATION_OCCUPIED",
        message: `location ${locationId} holds ${list.length} products (${list.join(", ")})`,
      });
    }
  }

  for (const a of finalMapping) {
    const product = products.get(a.productId);
    const location = locations.get(a.locationId);
    if (!product || !location) continue;
    if (product.requiredStorageClass !== location.storageClass) {
      errors.push({
        code: "CLASS_MISMATCH",
        message: `product ${product.id} requires ${product.requiredStorageClass}, location ${location.id} is ${location.storageClass}`,
      });
    }
    if (location.allowedProductIds !== undefined && !location.allowedProductIds.includes(product.id)) {
      errors.push({
        code: "PRODUCT_NOT_ALLOWED",
        message: `product ${product.id} is not allowed in location ${location.id}`,
      });
    }
    if (product.allowedLocationIds !== undefined && !product.allowedLocationIds.includes(location.id)) {
      errors.push({
        code: "LOCATION_NOT_ALLOWED",
        message: `location ${location.id} is not allowed for product ${product.id}`,
      });
    }
    if (!fitsFixedOrientation(product, location)) {
      errors.push({
        code: "DIMENSIONS_EXCEED",
        message: `product ${product.id} load exceeds location ${location.id} usable dimensions`,
      });
    }
    if (product.lockedLocationId !== undefined && a.locationId !== product.lockedLocationId) {
      errors.push({
        code: "LOCKED_LOCATION_CHANGED",
        message: `product ${product.id} must stay in ${product.lockedLocationId}`,
      });
    }
  }

  for (const product of scenario.products) {
    if (product.lockedLocationId !== undefined && !locations.has(product.lockedLocationId)) {
      errors.push({
        code: "LOCKED_UNKNOWN_LOCATION",
        message: `product ${product.id} locked to unknown location ${product.lockedLocationId}`,
      });
    }
    for (const allowed of product.allowedLocationIds ?? []) {
      if (!locations.has(allowed)) {
        errors.push({
          code: "ALLOWLIST_UNKNOWN_LOCATION",
          message: `product ${product.id} allows unknown location ${allowed}`,
        });
      }
    }
  }
  for (const location of scenario.locations) {
    for (const allowed of location.allowedProductIds ?? []) {
      if (!products.has(allowed)) {
        errors.push({
          code: "ALLOWLIST_UNKNOWN_PRODUCT",
          message: `location ${location.id} allows unknown product ${allowed}`,
        });
      }
    }
  }

  const baselineByProduct = new Map(baselineMapping.map((a) => [a.productId, a.locationId]));
  const finalByProduct = new Map<string, string>();
  for (const a of finalMapping) {
    if (products.has(a.productId) && !finalByProduct.has(a.productId)) {
      finalByProduct.set(a.productId, a.locationId);
    }
  }
  for (const lockedId of requirements.lockedProductIds) {
    if (!products.has(lockedId)) {
      errors.push({
        code: "LOCKED_UNKNOWN_PRODUCT",
        message: `requirements lock unknown product ${lockedId}`,
      });
      continue;
    }
    if (finalByProduct.get(lockedId) !== baselineByProduct.get(lockedId)) {
      errors.push({
        code: "REQUIREMENT_LOCK_CHANGED",
        message: `locked product ${lockedId} changed location`,
      });
    }
  }

  for (const order of scenario.orders) {
    for (const line of order.lines) {
      if (!products.has(line.productId)) {
        errors.push({
          code: "ORDER_UNKNOWN_PRODUCT",
          message: `order ${order.id} references unknown product ${line.productId}`,
        });
      }
    }
  }

  const relocations = relocationCount(finalMapping, baselineMapping);
  if (relocations > requirements.maxRelocatedProducts) {
    errors.push({
      code: "BUDGET_EXCEEDED",
      message: `${relocations} relocations exceed budget ${requirements.maxRelocatedProducts}`,
    });
  }

  return { valid: errors.length === 0, errors, relocationCount: relocations };
}
