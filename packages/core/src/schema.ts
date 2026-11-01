import { z } from "zod";
import { GRID_SIZE_MM, SCHEMA_VERSION } from "./version.js";

// Bounds keep every accepted number a safe integer and cap workload size.
// Semantic checks (references, occupancy, compatibility, reachability) live
// in validators so invalid baselines stay representable and diagnosable.
export const MAX_DIM_MM = 100_000;
export const MAX_COORD_MM = 100_000;
export const MAX_CART_MM = 10_000;
export const MAX_MARGIN_MM = 10_000;
export const MAX_PASSAGE_MM = 10_000;
export const MAX_FREQUENCY = 1_000_000;
export const MAX_QUANTITY = 1_000_000;
export const MAX_REVISION = 1_000_000_000;
export const MAX_ID_LEN = 128;
export const MAX_TEXT_LEN = 2000;
// Small-scene MVP caps: the brief suggests 4-6 racks, 12-20 locations, 8-12
// products, 10-20 orders, so these bounds hold 3-6x headroom while keeping
// collision loops, connector sorts, and report sizes firmly bounded.
export const MAX_RACKS = 32;
export const MAX_LOCATIONS = 128;
export const MAX_PRODUCTS = 64;
export const MAX_ASSIGNMENTS = 128;
export const MAX_ORDERS = 128;
export const MAX_LINES_PER_ORDER = 64;
export const MAX_TOTAL_ORDER_LINES = 4096;
export const MAX_CHANGES = 64;
export const MAX_LOCKS = 64;
export const MAX_REPORT_CANDIDATES = 64;

const id = z.string().min(1).max(MAX_ID_LEN);

// Reserved routing endpoint label: never a valid location id, so internal
// packing lookups cannot alias a real location. Products, orders, and racks
// may still use it.
export const PACKING_ID = "@packing";
const locationId = id.refine((v) => v !== PACKING_ID, { message: "reserved location id" });
const dimMm = z.number().int().min(1).max(MAX_DIM_MM);
const coordMm = z.number().int().min(-MAX_COORD_MM).max(MAX_COORD_MM);

const pointSchema = z.strictObject({ x: coordMm, z: coordMm });
const dimensionsSchema = z.strictObject({
  width: dimMm,
  depth: dimMm,
  height: dimMm,
});

const rackSchema = z.strictObject({
  id,
  positionMm: pointSchema,
  dimensionsMm: dimensionsSchema,
  yawDeg: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  assetId: z.string().min(1).max(MAX_ID_LEN).optional(),
});

const locationSchema = z.strictObject({
  id: locationId,
  rackId: id,
  label: z.string().min(1).max(MAX_TEXT_LEN),
  usableDimensionsMm: dimensionsSchema,
  storageClass: z.string().min(1).max(MAX_ID_LEN),
  pickPointMm: pointSchema,
  allowedProductIds: z.array(id).max(MAX_PRODUCTS).optional(),
});

const productSchema = z.strictObject({
  id,
  label: z.string().min(1).max(MAX_TEXT_LEN),
  storedLoadDimensionsMm: dimensionsSchema,
  requiredStorageClass: z.string().min(1).max(MAX_ID_LEN),
  allowedLocationIds: z.array(locationId).max(MAX_LOCATIONS).optional(),
  lockedLocationId: locationId.optional(),
});

export const assignmentSchema = z.strictObject({ productId: id, locationId });
const orderLineSchema = z.strictObject({
  productId: id,
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});
const orderSchema = z.strictObject({
  id,
  frequency: z.number().int().min(0).max(MAX_FREQUENCY),
  lines: z.array(orderLineSchema).min(1).max(MAX_LINES_PER_ORDER),
});

const cartSchema = z.strictObject({
  widthMm: z.number().int().min(1).max(MAX_CART_MM),
  lengthMm: z.number().int().min(1).max(MAX_CART_MM),
  marginMm: z.number().int().min(0).max(MAX_MARGIN_MM),
});

const provenanceSchema = z.strictObject({
  category: z.union([z.literal("synthetic"), z.literal("reconstructed")]),
  description: z.string().min(1).max(MAX_TEXT_LEN),
  sourceUrls: z.array(z.string().max(MAX_TEXT_LEN)).max(64),
  assumptions: z.array(z.string().max(MAX_TEXT_LEN)).max(256),
  inventedFields: z.array(z.string().max(MAX_TEXT_LEN)).max(256),
});

function uniqueIds<T>(items: T[], key: (t: T) => string, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) {
      ctx.addIssue({ code: "custom", message: `duplicate id: ${k}` });
      return;
    }
    seen.add(k);
  }
}

export const scenarioSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id,
    revision: z.number().int().min(0).max(MAX_REVISION),
    room: z.strictObject({
      widthMm: dimMm,
      depthMm: dimMm,
    }),
    racks: z.array(rackSchema).max(MAX_RACKS),
    locations: z.array(locationSchema).max(MAX_LOCATIONS),
    products: z.array(productSchema).max(MAX_PRODUCTS),
    // No uniqueness/reference checks here: invalid assignments must parse
    // so the validator can diagnose an invalid baseline.
    assignments: z.array(assignmentSchema).max(MAX_ASSIGNMENTS),
    orders: z.array(orderSchema).max(MAX_ORDERS),
    packingPointMm: pointSchema,
    cart: cartSchema,
    minimumPassageWidthMm: z.number().int().min(0).max(MAX_PASSAGE_MM),
    gridSizeMm: z.literal(GRID_SIZE_MM),
    provenance: provenanceSchema,
  })
  .superRefine((s, ctx) => {
    uniqueIds(s.racks, (r) => r.id, ctx);
    uniqueIds(s.locations, (l) => l.id, ctx);
    uniqueIds(s.products, (p) => p.id, ctx);
    uniqueIds(s.orders, (o) => o.id, ctx);
    const totalLines = s.orders.reduce((n, o) => n + o.lines.length, 0);
    if (totalLines > MAX_TOTAL_ORDER_LINES) {
      ctx.addIssue({ code: "custom", message: `too many order lines: ${totalLines}` });
    }
  });

export const requirementsSchema = z
  .strictObject({
    objective: z.literal("minimize_weighted_picking_travel"),
    maxRelocatedProducts: z.number().int().min(0).max(MAX_PRODUCTS),
    lockedProductIds: z.array(id).max(MAX_LOCKS),
    assumptions: z.array(z.string().max(MAX_TEXT_LEN)).max(256),
    unresolvedQuestions: z.array(z.string().max(MAX_TEXT_LEN)).max(256),
  })
  .superRefine((r, ctx) => {
    uniqueIds(r.lockedProductIds, (v) => v, ctx);
  });

const changeSchema = z.strictObject({ productId: id, locationId });

export const proposalSchema = z.strictObject({
  scenarioRevision: z.number().int().min(0).max(MAX_REVISION),
  // Duplicate/unknown references are validator errors (structured feedback),
  // not parse errors, so every proposal gets a diagnosis.
  changes: z.array(changeSchema).max(MAX_CHANGES),
  rationale: z.string().max(MAX_TEXT_LEN),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type PlanningRequirements = z.infer<typeof requirementsSchema>;
export type AssignmentProposal = z.infer<typeof proposalSchema>;
export type Assignment = Scenario["assignments"][number];
export type Rack = Scenario["racks"][number];
export type StorageLocation = Scenario["locations"][number];
export type Product = Scenario["products"][number];
export type OrderTemplate = Scenario["orders"][number];
export type PointMm = Scenario["packingPointMm"];

export function parseScenario(json: unknown): Scenario {
  return scenarioSchema.parse(json);
}

export function parseRequirements(json: unknown): PlanningRequirements {
  return requirementsSchema.parse(json);
}

export function parseProposal(json: unknown): AssignmentProposal {
  return proposalSchema.parse(json);
}
