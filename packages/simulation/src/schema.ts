import { z } from "zod";
import {
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
} from "./version.js";

// Bounds keep every accepted number a safe integer and cap workload size.
// Reference/consistency checks (duplicate ids, unresolved refs, stock vs
// capacity, complete home coverage, arrivals vs horizon) are parse errors:
// an operations input must be executable, unlike a diagnosable planner
// baseline. Structural validation here is NOT path/collision certification;
// geometric/dynamic gates arrive with later milestones.
export const MAX_DIM_MM = 100_000;
export const MAX_COORD_MM = 100_000;
export const MAX_FOOTPRINT_MM = 10_000;
export const MAX_MARGIN_MM = 10_000;
export const MAX_SPEED_MMPS = 10_000;
export const MAX_TIME_MS = 2_147_483_647;
export const MAX_QUANTITY = 1_000_000;
export const MAX_SERVICE_DURATION_MS = MAX_TIME_MS;
export const MAX_SERVICE_CAPACITY = 64;
export const MAX_STAGING = 10_000;
export const MAX_SERVICE_POSITIONS = 16;
export const MAX_QUEUE_SLOTS = 64;
export const MAX_RUN_EVENTS = 10_000_000;
export const MAX_EVENTS_PER_TIMESTAMP = 100_000;
export const MAX_ID_LEN = 128;
export const MAX_TEXT_LEN = 2000;
export const MAX_SEED_LEN = 256;
// Small-slice caps with headroom over the 6-rack/24-slot/12-product/
// 40-order full synthetic target: the M2a unit fixture is far smaller
// and must not be mistaken for that target.
export const MAX_RACKS = 32;
export const MAX_OBSTACLES = 256;
export const MAX_TRAFFIC_ZONES = 64;
export const MAX_LOCATIONS = 128;
export const MAX_PRODUCTS = 64;
export const MAX_STOCK_ENTRIES = 512;
export const MAX_AGENTS = 64;
export const MAX_RESOURCES = 32;
export const MAX_ORDERS = 256;
export const MAX_DELIVERIES = 256;
export const MAX_LINES_PER_ORDER = 64;
export const MAX_TOTAL_SCHEDULE_LINES = 4096;

const id = z.string().min(1).max(MAX_ID_LEN);
const dimMm = z.number().int().min(1).max(MAX_DIM_MM);
const coordMm = z.number().int().min(-MAX_COORD_MM).max(MAX_COORD_MM);
const heightMm = z.number().int().min(0).max(MAX_DIM_MM);
const timeMs = z.number().int().min(0).max(MAX_TIME_MS);
const positiveTimeMs = z.number().int().min(1).max(MAX_TIME_MS);
const quantity = z.number().int().min(1).max(MAX_QUANTITY);

const pointSchema = z.strictObject({ x: coordMm, z: coordMm });
const anchorSchema = z.strictObject({
  x: coordMm,
  y: heightMm,
  z: coordMm,
});
const dimensionsSchema = z.strictObject({
  width: dimMm,
  depth: dimMm,
  height: dimMm,
});

const rackSchema = z.strictObject({
  id,
  positionMm: pointSchema,
  dimensionsMm: dimensionsSchema,
});

// In-area obstacle rectangles (walls, columns, stations, staging).
// The renderer and navigation must later consume these same definitions;
// silently projecting walls away for an old report is forbidden.
const obstacleSchema = z.strictObject({
  id,
  minXMm: coordMm,
  minZMm: coordMm,
  maxXMm: coordMm,
  maxZMm: coordMm,
});

// Exclusive traffic-policy zones (narrow aisles, intersections). These are
// NOT physical obstacles: navigation never inflates them, and reachability
// never treats them as blocked. They are explicit validated saved
// configuration for time-space admission only (M3a whole-transit policy).
// Optional for backward compatibility: fixtures without this field parse
// unchanged. When present, zones must be strict non-degenerate rectangles
// inside the room with unique ids (checked in superRefine below).
const trafficZoneSchema = z.strictObject({
  id,
  kind: z.union([z.literal("narrow-aisle"), z.literal("intersection")]),
  minXMm: coordMm,
  minZMm: coordMm,
  maxXMm: coordMm,
  maxZMm: coordMm,
});

const geometrySchema = z.strictObject({
  room: z.strictObject({ widthMm: dimMm, depthMm: dimMm }),
  racks: z.array(rackSchema).max(MAX_RACKS),
  obstacles: z.array(obstacleSchema).max(MAX_OBSTACLES),
  trafficZones: z.array(trafficZoneSchema).max(MAX_TRAFFIC_ZONES).optional(),
});

// Per-item definition: dimensions, handling class, integer conversion into
// configured handling units, and an optional visual asset reference.
// Aggregate containers are separate; one box is NOT one item.
const productSchema = z.strictObject({
  id,
  label: z.string().min(1).max(MAX_TEXT_LEN),
  itemDimensionsMm: dimensionsSchema,
  handlingClass: z.string().min(1).max(MAX_ID_LEN),
  capacityCostUnits: z.number().int().min(1).max(MAX_QUANTITY),
  visualAssetRef: z.string().min(1).max(MAX_TEXT_LEN).optional(),
});

const locationSchema = z.strictObject({
  id,
  rackId: id,
  storageAnchorMm: anchorSchema,
  approachPointMm: pointSchema,
  usableDimensionsMm: dimensionsSchema,
  storageClass: z.string().min(1).max(MAX_ID_LEN),
  maxQuantity: quantity,
  restrictions: z.strictObject({
    eligibleHandlingClasses: z.array(id).min(1).max(MAX_PRODUCTS),
    eligibleProductIds: z.array(id).max(MAX_PRODUCTS).optional(),
  }),
});

const stockSchema = z.strictObject({
  locationId: id,
  productId: id,
  quantity,
});

const homeAssignmentSchema = z.strictObject({
  productId: id,
  locationId: id,
});

const mobileUnitSchema = z.strictObject({
  id,
  role: z.union([z.literal("picker"), z.literal("putaway")]),
  footprintMm: z.strictObject({
    width: z.number().int().min(1).max(MAX_FOOTPRINT_MM),
    length: z.number().int().min(1).max(MAX_FOOTPRINT_MM),
    margin: z.number().int().min(0).max(MAX_MARGIN_MM),
  }),
  speedMmPerSecond: z.number().int().min(1).max(MAX_SPEED_MMPS),
  loadCapacityUnits: z.number().int().min(1).max(MAX_QUANTITY),
  eligibleHandlingClasses: z.array(id).min(1).max(MAX_PRODUCTS),
  parkingSlotMm: pointSchema,
});

const slotSchema = z.strictObject({ id, x: coordMm, z: coordMm });

// Staffed service resources (receiving/packing/dispatch). Packing is
// staffed here; no mobile worker is also allocated to packing unless a
// later milestone explicitly models that staffing relationship.
const resourceSchema = z.strictObject({
  id,
  kind: z.union([
    z.literal("receiving"),
    z.literal("packing"),
    z.literal("dispatch"),
  ]),
  servicePositions: z.array(slotSchema).min(1).max(MAX_SERVICE_POSITIONS),
  queueSlots: z.array(slotSchema).max(MAX_QUEUE_SLOTS),
  serviceCapacity: z.number().int().min(1).max(MAX_SERVICE_CAPACITY),
  inputStagingCapacity: z.number().int().min(0).max(MAX_STAGING),
  outputStagingCapacity: z.number().int().min(0).max(MAX_STAGING),
  serviceDurationMs: z.number().int().min(1).max(MAX_SERVICE_DURATION_MS),
});

// Reused verbatim by the resource station constructor for input validation;
// field semantics are identical to scenario parsing.
export const operationsResourceSchema = resourceSchema;

const scheduleLineSchema = z.strictObject({ productId: id, quantity });

// Scheduled orders use arrival times, never legacy order.frequency.
const scheduledOrderSchema = z.strictObject({
  id,
  arrivalTimeMs: timeMs,
  lines: z.array(scheduleLineSchema).min(1).max(MAX_LINES_PER_ORDER),
});

const scheduledDeliverySchema = z.strictObject({
  id,
  arrivalTimeMs: timeMs,
  lines: z.array(scheduleLineSchema).min(1).max(MAX_LINES_PER_ORDER),
});

const provenanceSchema = z.strictObject({
  category: z.union([z.literal("synthetic"), z.literal("reconstructed")]),
  description: z.string().min(1).max(MAX_TEXT_LEN),
  sourceUrls: z.array(z.string().max(MAX_TEXT_LEN)).max(64),
  assumptions: z.array(z.string().max(MAX_TEXT_LEN)).max(256),
  inventedFields: z.array(z.string().max(MAX_TEXT_LEN)).max(256),
});

const runSettingsSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("fixed-window"),
    horizonMs: positiveTimeMs,
  }),
  z.strictObject({
    mode: z.literal("finite-cohort"),
    arrivalCutoffMs: timeMs,
  }),
]);

const policiesSchema = z.strictObject({
  // Only the v3 full-order all-or-none reservation policy exists in M2a,
  // and only as declared configuration: actual reservation/accounting
  // starts in M2b.
  reservePolicy: z.literal("full-order-all-or-none"),
  run: runSettingsSchema,
  eventLimits: z.strictObject({
    maxProcessedEvents: z.number().int().min(1).max(MAX_RUN_EVENTS),
    maxEventsPerTimestamp: z
      .number()
      .int()
      .min(1)
      .max(MAX_EVENTS_PER_TIMESTAMP),
  }),
});

function uniqueIds<T>(
  items: T[],
  key: (t: T) => string,
  ctx: z.RefinementCtx,
): void {
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

export const operationsScenarioSchema = z
  .strictObject({
    schemaVersion: z.literal(OPERATIONS_SCHEMA_VERSION),
    engineVersion: z.literal(OPERATIONS_ENGINE_VERSION),
    id,
    provenance: provenanceSchema,
    seed: z.string().min(1).max(MAX_SEED_LEN),
    units: z.strictObject({
      quantityUnit: z.literal("item"),
      capacityUnit: z.literal("handling-unit"),
    }),
    geometry: geometrySchema,
    products: z.array(productSchema).min(1).max(MAX_PRODUCTS),
    locations: z.array(locationSchema).min(1).max(MAX_LOCATIONS),
    initialStock: z.array(stockSchema).max(MAX_STOCK_ENTRIES),
    // Optional pre-run planning-home assignment; when present it must be
    // complete (every product exactly once). Initial supported stock may
    // be storage-only with idle resources/empty mobile loads.
    homeAssignments: z.array(homeAssignmentSchema).max(MAX_PRODUCTS).optional(),
    mobileUnits: z.array(mobileUnitSchema).min(1).max(MAX_AGENTS),
    resources: z.array(resourceSchema).min(1).max(MAX_RESOURCES),
    orderSchedule: z.array(scheduledOrderSchema).max(MAX_ORDERS),
    deliverySchedule: z.array(scheduledDeliverySchema).max(MAX_DELIVERIES),
    policies: policiesSchema,
  })
  .superRefine((s, ctx) => {
    uniqueIds(s.geometry.racks, (r) => r.id, ctx);
    uniqueIds(s.geometry.obstacles, (o) => o.id, ctx);
    if (s.geometry.trafficZones) {
      uniqueIds(s.geometry.trafficZones, (z) => z.id, ctx);
    }
    uniqueIds(s.products, (p) => p.id, ctx);
    uniqueIds(s.locations, (l) => l.id, ctx);
    uniqueIds(s.mobileUnits, (a) => a.id, ctx);
    uniqueIds(s.resources, (r) => r.id, ctx);
    uniqueIds(s.orderSchedule, (o) => o.id, ctx);
    uniqueIds(s.deliverySchedule, (d) => d.id, ctx);
    // Scheduled work shares one id namespace: an order and a delivery
    // with the same id would be ambiguous downstream task keys.
    const orderIds = new Set(s.orderSchedule.map((o) => o.id));
    for (const d of s.deliverySchedule) {
      if (orderIds.has(d.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate scheduled work id: ${d.id}`,
        });
      }
    }

    for (const o of s.geometry.obstacles) {
      if (o.minXMm >= o.maxXMm || o.minZMm >= o.maxZMm) {
        ctx.addIssue({
          code: "custom",
          message: `degenerate obstacle rectangle: ${o.id}`,
        });
      }
    }

    for (const z of s.geometry.trafficZones ?? []) {
      if (z.minXMm >= z.maxXMm || z.minZMm >= z.maxZMm) {
        ctx.addIssue({
          code: "custom",
          message: `degenerate traffic zone rectangle: ${z.id}`,
        });
      }
      if (
        z.minXMm < 0 ||
        z.minZMm < 0 ||
        z.maxXMm > s.geometry.room.widthMm ||
        z.maxZMm > s.geometry.room.depthMm
      ) {
        ctx.addIssue({
          code: "custom",
          message: `traffic zone ${z.id} exceeds room bounds`,
        });
      }
    }

    const rackIds = new Set(s.geometry.racks.map((r) => r.id));
    const productsById = new Map(s.products.map((p) => [p.id, p]));
    const locationsById = new Map(s.locations.map((l) => [l.id, l]));
    const eligible = (locationId: string, productId: string): boolean => {
      const loc = locationsById.get(locationId);
      const product = productsById.get(productId);
      if (!loc || !product) {
        return false;
      }
      if (!loc.restrictions.eligibleHandlingClasses.includes(product.handlingClass)) {
        return false;
      }
      const narrowed = loc.restrictions.eligibleProductIds;
      return !narrowed || narrowed.includes(productId);
    };
    // Single-item fit under the declared fixed-orientation policy: the
    // item's exact width/depth/height must each fit the location's usable
    // bounds with no rotation. This is NOT volumetric packing: quantities
    // and maxQuantity stay structural capacity assumptions.
    const fitsFixedOrientation = (
      item: { width: number; depth: number; height: number },
      usable: { width: number; depth: number; height: number },
    ): boolean =>
      item.width <= usable.width &&
      item.depth <= usable.depth &&
      item.height <= usable.height;

    for (const l of s.locations) {
      if (!rackIds.has(l.rackId)) {
        ctx.addIssue({
          code: "custom",
          message: `location ${l.id} references unknown rack ${l.rackId}`,
        });
      }
      for (const pid of l.restrictions.eligibleProductIds ?? []) {
        if (!productsById.has(pid)) {
          ctx.addIssue({
            code: "custom",
            message: `location ${l.id} restricts to unknown product ${pid}`,
          });
        }
      }
    }

    // Initial stock: resolved refs, eligible product/location pairs, one
    // product per location, and per-location totals within maxQuantity.
    // This is storage-only starting stock with idle resources/empty
    // mobile loads; arbitrary mid-run resume is not validated here.
    const stockKeys = new Set<string>();
    const stockByLocation = new Map<string, { productId: string; total: number }>();
    for (const entry of s.initialStock) {
      const loc = locationsById.get(entry.locationId);
      if (!loc) {
        ctx.addIssue({
          code: "custom",
          message: `stock references unknown location ${entry.locationId}`,
        });
        continue;
      }
      if (!productsById.has(entry.productId)) {
        ctx.addIssue({
          code: "custom",
          message: `stock references unknown product ${entry.productId}`,
        });
        continue;
      }
      const key = `${entry.locationId} ${entry.productId}`;
      if (stockKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate stock entry: ${key}`,
        });
        continue;
      }
      stockKeys.add(key);
      if (!eligible(entry.locationId, entry.productId)) {
        ctx.addIssue({
          code: "custom",
          message: `stock product ${entry.productId} is ineligible at ${entry.locationId}`,
        });
      }
      const stockedProduct = productsById.get(entry.productId);
      if (
        stockedProduct &&
        !fitsFixedOrientation(
          stockedProduct.itemDimensionsMm,
          loc.usableDimensionsMm,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: `product ${entry.productId} item dimensions exceed location ${entry.locationId} usable dimensions (fixed orientation)`,
        });
      }
      const prior = stockByLocation.get(entry.locationId);
      if (prior && prior.productId !== entry.productId) {
        ctx.addIssue({
          code: "custom",
          message: `location ${entry.locationId} holds more than one product`,
        });
        continue;
      }
      const total = (prior?.total ?? 0) + entry.quantity;
      stockByLocation.set(entry.locationId, {
        productId: entry.productId,
        total,
      });
      if (entry.quantity > loc.maxQuantity || total > loc.maxQuantity) {
        ctx.addIssue({
          code: "custom",
          message: `stock at ${entry.locationId} exceeds maxQuantity ${loc.maxQuantity}`,
        });
      }
    }

    // Home assignments: when configured, complete (every product exactly
    // once), eligible, and dedicated (one product per home location).
    // Operational SKU stock may spread across compatible locations, but
    // that does not share one primary home between two SKUs.
    if (s.homeAssignments) {
      uniqueIds(s.homeAssignments, (h) => h.productId, ctx);
      const homeLocations = new Set<string>();
      for (const h of s.homeAssignments) {
        if (homeLocations.has(h.locationId)) {
          ctx.addIssue({
            code: "custom",
            message: `duplicate home location: ${h.locationId}`,
          });
        }
        homeLocations.add(h.locationId);
      }
      const assigned = new Set(s.homeAssignments.map((h) => h.productId));
      for (const p of s.products) {
        if (!assigned.has(p.id)) {
          ctx.addIssue({
            code: "custom",
            message: `home assignment missing for product ${p.id}`,
          });
        }
      }
      for (const h of s.homeAssignments) {
        if (!productsById.has(h.productId)) {
          ctx.addIssue({
            code: "custom",
            message: `home assignment references unknown product ${h.productId}`,
          });
          continue;
        }
        if (!locationsById.has(h.locationId)) {
          ctx.addIssue({
            code: "custom",
            message: `home assignment references unknown location ${h.locationId}`,
          });
          continue;
        }
        if (!eligible(h.locationId, h.productId)) {
          ctx.addIssue({
            code: "custom",
            message: `home ${h.locationId} is ineligible for product ${h.productId}`,
          });
        }
        const homeProduct = productsById.get(h.productId);
        const homeLocation = locationsById.get(h.locationId);
        if (
          homeProduct &&
          homeLocation &&
          !fitsFixedOrientation(
            homeProduct.itemDimensionsMm,
            homeLocation.usableDimensionsMm,
          )
        ) {
          ctx.addIssue({
            code: "custom",
            message: `product ${h.productId} item dimensions exceed location ${h.locationId} usable dimensions (fixed orientation)`,
          });
        }
      }
    }

    // Parking slots are unique explicit positions across all mobile units.
    const parking = new Set<string>();
    for (const a of s.mobileUnits) {
      const key = `${a.parkingSlotMm.x},${a.parkingSlotMm.z}`;
      if (parking.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate parking slot at ${key}`,
        });
      }
      parking.add(key);
    }

    // Service and queue slots have distinct ids and distinct coordinates
    // within a resource: queues never stack agents on one coordinate.
    for (const r of s.resources) {
      const slots = [...r.servicePositions, ...r.queueSlots];
      uniqueIds(slots, (slot) => slot.id, ctx);
      const coords = new Set<string>();
      for (const slot of slots) {
        const key = `${slot.x},${slot.z}`;
        if (coords.has(key)) {
          ctx.addIssue({
            code: "custom",
            message: `resource ${r.id} stacks slots at ${key}`,
          });
        }
        coords.add(key);
      }
    }

    const arrivalBound =
      s.policies.run.mode === "fixed-window"
        ? s.policies.run.horizonMs
        : s.policies.run.arrivalCutoffMs;
    const checkSchedule = (
      entries: { id: string; arrivalTimeMs: number; lines: { productId: string }[] }[],
      kind: string,
    ): number => {
      let lines = 0;
      for (const entry of entries) {
        if (entry.arrivalTimeMs > arrivalBound) {
          ctx.addIssue({
            code: "custom",
            message: `${kind} ${entry.id} arrives after the run arrival bound`,
          });
        }
        lines += entry.lines.length;
        for (const line of entry.lines) {
          if (!productsById.has(line.productId)) {
            ctx.addIssue({
              code: "custom",
              message: `${kind} ${entry.id} references unknown product ${line.productId}`,
            });
          }
        }
      }
      return lines;
    };
    const orderLines = checkSchedule(s.orderSchedule, "order");
    const deliveryLines = checkSchedule(s.deliverySchedule, "delivery");
    if (orderLines > MAX_TOTAL_SCHEDULE_LINES) {
      ctx.addIssue({
        code: "custom",
        message: `too many order lines: ${orderLines}`,
      });
    }
    if (deliveryLines > MAX_TOTAL_SCHEDULE_LINES) {
      ctx.addIssue({
        code: "custom",
        message: `too many delivery lines: ${deliveryLines}`,
      });
    }
  });

export type OperationsScenario = z.infer<typeof operationsScenarioSchema>;
export type OperationsGeometry = OperationsScenario["geometry"];
export type OperationsObstacle = OperationsGeometry["obstacles"][number];
export type OperationsTrafficZone = NonNullable<
  OperationsGeometry["trafficZones"]
>[number];
export type OperationsRack = OperationsGeometry["racks"][number];
export type OperationsProduct = OperationsScenario["products"][number];
export type OperationsStorageLocation =
  OperationsScenario["locations"][number];
export type OperationsStock = OperationsScenario["initialStock"][number];
export type OperationsHomeAssignment = NonNullable<
  OperationsScenario["homeAssignments"]
>[number];
export type OperationsMobileUnit = OperationsScenario["mobileUnits"][number];
export type OperationsResource = OperationsScenario["resources"][number];
export type OperationsScheduledOrder =
  OperationsScenario["orderSchedule"][number];
export type OperationsScheduledDelivery =
  OperationsScenario["deliverySchedule"][number];
export type OperationsPolicies = OperationsScenario["policies"];
export type OperationsRunSettings = OperationsPolicies["run"];

export function parseOperationsScenario(json: unknown): OperationsScenario {
  return operationsScenarioSchema.parse(json);
}
