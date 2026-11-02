// v3-M2b atomic inventory + reservation state. Pure headless domain
// transitions only: every command validates its ENTIRE transaction first,
// then commits or leaves all balances/reservations/logs unchanged.
//
// Physical buckets per product: receiving staging (by receiving resource
// AND delivery AND product), storage (by location), carried (by mobile
// unit, with order/delivery ownership), packing staging (by packing
// resource + order), packed outbound (by order), dispatched (by order).
// External not-yet-accepted inbound is tracked separately per delivery
// line. Conservation: initial storage + accepted inbound == sum of ALL
// physical buckets including dispatched. Reservations commit stored
// quantities; they are NOT another physical bucket. Cumulative per-order
// picked/packed/dispatched history survives cancellation: a re-reserve
// acquires only remaining demand, never the full original quantity.
//
// Capacity units (do not conflate):
// - storage maxQuantity: ITEM units per location.
// - cart loadCapacityUnits, receiving outputStagingCapacity, packing
//   inputStagingCapacity: HANDLING-COST units, i.e. quantity *
//   product capacityCostUnits summed across products.
// - queue slots / service positions: POSITION counts (one job each),
//   owned by resources.ts, never cost units.
//
// Boundary: these transitions assume a movement/service controller has
// already authorized physical arrival (M3+). Calling placePutAway/pick/
// transferToPacking records a validated domain transfer; it does NOT
// simulate or claim travel, traffic admission, or service completion.
import {
  MAX_ID_LEN,
  MAX_QUANTITY,
  MAX_TIME_MS,
  type OperationsScenario,
} from "./schema.js";

export type BucketTotals = {
  receiving: number;
  storage: number;
  carried: number;
  packing: number;
  packed: number;
  dispatched: number;
  externalPending: number;
};

export type ReserveResult =
  | {
      status: "reserved";
      orderId: string;
      sources: { productId: string; locationId: string; quantity: number }[];
    }
  | {
      status: "waiting";
      orderId: string;
      reason: "WAITING_FOR_STOCK";
      shortages: { productId: string; requested: number; available: number }[];
    };

export type PutAwaySelection =
  | { status: "selectable"; locationId: string }
  | { status: "blocked"; reason: string };

export type PackingReadiness = {
  ready: boolean;
  requested: { productId: string; quantity: number }[];
  staged: { productId: string; quantity: number }[];
  remaining: { productId: string; quantity: number }[];
};

export type TransferRecord = {
  seq: number;
  eventId: string;
  timeMs: number;
  productId: string;
  quantity: number;
  from: string;
  to: string;
  owner: string;
};

export type InventorySnapshot = {
  storage: { locationId: string; productId: string | null; quantity: number }[];
  receiving: { resourceId: string; deliveryId: string; productId: string; quantity: number }[];
  carried: {
    unitId: string;
    owner: string | null;
    loads: { productId: string; quantity: number }[];
  }[];
  packing: {
    resourceId: string;
    orderId: string;
    productId: string;
    quantity: number;
  }[];
  packed: { orderId: string; productId: string; quantity: number }[];
  dispatched: { orderId: string; productId: string; quantity: number }[];
  externalPending: { deliveryId: string; productId: string; quantity: number }[];
  reservations: {
    orderId: string;
    lines: {
      productId: string;
      requested: number;
      picked: number;
      sources: { locationId: string; remaining: number }[];
    }[];
  }[];
  acceptedInbound: { productId: string; quantity: number }[];
  fulfillment: {
    orderId: string;
    lines: { productId: string; requested: number; picked: number; packed: number; dispatched: number }[];
  }[];
  transfers: TransferRecord[];
};

function assertId(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_ID_LEN) {
    throw new Error(`${what} must be a 1..${MAX_ID_LEN} character string`);
  }
  return value;
}

function assertTimeMs(value: unknown, what: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_TIME_MS) {
    throw new Error(`${what} must be a safe integer in 0..${MAX_TIME_MS}`);
  }
  return value as number;
}

function assertQuantity(value: unknown, what: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_QUANTITY) {
    throw new Error(`${what} must be a safe integer in 1..${MAX_QUANTITY}`);
  }
  return value as number;
}

function freezeDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) freezeDeep((value as Record<string, unknown>)[key]);
    return Object.freeze(value);
  }
  return value;
}

type ProductInfo = {
  handlingClass: string;
  costUnits: number;
  dims: { width: number; depth: number; height: number };
};

type LocationInfo = {
  maxQuantity: number;
  handlingClasses: string[];
  productIds: string[] | null;
  usable: { width: number; depth: number; height: number };
};

type UnitInfo = {
  role: "picker" | "putaway";
  loadCapacityUnits: number;
  handlingClasses: string[];
};

type ReservationLine = {
  requested: number;
  picked: number;
  sources: Map<string, number>; // locationId -> remaining reserved
};

export type InventoryStore = {
  acceptInbound: (cmd: {
    eventId: string;
    timeMs: number;
    deliveryId: string;
    resourceId: string;
    productId: string;
    quantity: number;
  }) => { status: "accepted"; deliveryId: string; productId: string; quantity: number };
  collectPutAway: (cmd: {
    eventId: string;
    timeMs: number;
    deliveryId: string;
    resourceId: string;
    unitId: string;
    productId: string;
    quantity: number;
  }) => { status: "collected"; unitId: string; productId: string; quantity: number };
  placePutAway: (cmd: {
    eventId: string;
    timeMs: number;
    deliveryId: string;
    unitId: string;
    locationId: string;
    productId: string;
    quantity: number;
  }) => { status: "stored"; locationId: string; productId: string; quantity: number };
  selectPutAwayLocation: (productId: string, quantity: number) => PutAwaySelection;
  reserveOrder: (cmd: { eventId: string; timeMs: number; orderId: string }) => ReserveResult;
  pick: (cmd: {
    eventId: string;
    timeMs: number;
    orderId: string;
    unitId: string;
    locationId: string;
    productId: string;
    quantity: number;
  }) => { status: "picked"; orderId: string; productId: string; quantity: number };
  cancelReservation: (cmd: {
    eventId: string;
    timeMs: number;
    orderId: string;
  }) => { status: "cancelled"; orderId: string; releasedLines: number };
  transferToPacking: (cmd: {
    eventId: string;
    timeMs: number;
    orderId: string;
    unitId: string;
    resourceId: string;
    productId: string;
    quantity: number;
  }) => { status: "staged"; orderId: string; productId: string; quantity: number };
  packingReadiness: (orderId: string, resourceId: string) => PackingReadiness;
  packOrder: (cmd: {
    eventId: string;
    timeMs: number;
    orderId: string;
    resourceId: string;
  }) => { status: "packed"; orderId: string };
  dispatchOrder: (cmd: {
    eventId: string;
    timeMs: number;
    orderId: string;
  }) => { status: "dispatched"; orderId: string };
  available: (productId: string) => { stored: number; reserved: number; available: number };
  bucketTotals: (productId: string) => BucketTotals;
  checkInvariants: () => string[];
  snapshot: () => InventorySnapshot;
};

export function createInventoryStore(scenario: OperationsScenario): InventoryStore {
  const products = new Map<string, ProductInfo>();
  for (const p of scenario.products) {
    products.set(p.id, {
      handlingClass: p.handlingClass,
      costUnits: p.capacityCostUnits,
      dims: { ...p.itemDimensionsMm },
    });
  }
  const locations = new Map<string, LocationInfo>();
  for (const l of scenario.locations) {
    locations.set(l.id, {
      maxQuantity: l.maxQuantity,
      handlingClasses: [...l.restrictions.eligibleHandlingClasses],
      productIds: l.restrictions.eligibleProductIds ? [...l.restrictions.eligibleProductIds] : null,
      usable: { ...l.usableDimensionsMm },
    });
  }
  const home = new Map<string, string>();
  for (const h of scenario.homeAssignments ?? []) home.set(h.productId, h.locationId);
  const units = new Map<string, UnitInfo>();
  for (const u of scenario.mobileUnits) {
    units.set(u.id, {
      role: u.role,
      loadCapacityUnits: u.loadCapacityUnits,
      handlingClasses: [...u.eligibleHandlingClasses],
    });
  }
  const receivingCap = new Map<string, number>(); // resourceId -> handling-cost units
  const packingCap = new Map<string, number>(); // resourceId -> handling-cost units
  for (const r of scenario.resources) {
    if (r.kind === "receiving") receivingCap.set(r.id, r.outputStagingCapacity);
    if (r.kind === "packing") packingCap.set(r.id, r.inputStagingCapacity);
  }
  const orders = new Map<string, { productId: string; quantity: number }[]>();
  for (const o of scenario.orderSchedule) {
    // Aggregate same-product lines: the schema allows repeats, but the
    // ledger tracks one requested quantity per product.
    const merged = new Map<string, number>();
    for (const l of o.lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
    orders.set(
      o.id,
      [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity })),
    );
  }

  // Physical state. All maps hold item quantities unless noted.
  const storage = new Map<string, { productId: string | null; quantity: number }>();
  for (const id of locations.keys()) storage.set(id, { productId: null, quantity: 0 });
  const initialTotals = new Map<string, number>();
  for (const s of scenario.initialStock) {
    const slot = storage.get(s.locationId);
    if (!slot) throw new Error(`initial stock references unknown location ${s.locationId}`);
    slot.productId = s.productId;
    slot.quantity = s.quantity;
    initialTotals.set(s.productId, (initialTotals.get(s.productId) ?? 0) + s.quantity);
  }
  const receiving = new Map<string, Map<string, Map<string, number>>>(); // resource -> delivery -> product -> qty
  const carried = new Map<string, { owner: string | null; loads: Map<string, number> }>();
  for (const id of units.keys()) carried.set(id, { owner: null, loads: new Map() });
  const packing = new Map<string, Map<string, Map<string, number>>>(); // resource -> order -> product -> qty
  const packed = new Map<string, Map<string, number>>(); // order -> product -> qty
  const dispatched = new Map<string, Map<string, number>>(); // order -> product -> qty
  const external = new Map<string, Map<string, number>>(); // delivery -> product -> qty pending
  for (const d of scenario.deliverySchedule) {
    const lines = new Map<string, number>();
    for (const l of d.lines) lines.set(l.productId, (lines.get(l.productId) ?? 0) + l.quantity);
    external.set(d.id, lines);
  }
  const accepted = new Map<string, number>();
  const reservations = new Map<string, Map<string, ReservationLine>>(); // order -> product -> line
  // Cumulative per-order fulfillment history. Entries are created only by
  // successful pick/pack/dispatch commits, never by validation reads, so a
  // rejected command leaves them (and the snapshot) byte-equivalent.
  const progress = new Map<string, Map<string, { picked: number; packed: number; dispatched: number }>>();
  const transfers: TransferRecord[] = [];
  let seq = 0;
  const processed = new Map<string, { op: string; request: string; result: unknown }>();

  const costOf = (productId: string, quantity: number): number =>
    (products.get(productId)?.costUnits ?? 0) * quantity;

  const carriedUnits = (unitId: string): number => {
    let total = 0;
    for (const [pid, qty] of carried.get(unitId)?.loads ?? []) total += costOf(pid, qty);
    return total;
  };

  const receivingUnits = (resourceId: string): number => {
    let total = 0;
    for (const byDelivery of receiving.get(resourceId)?.values() ?? []) {
      for (const [pid, qty] of byDelivery) total += costOf(pid, qty);
    }
    return total;
  };

  const progressLine = (orderId: string, productId: string): { picked: number; packed: number; dispatched: number } => ({
    picked: progress.get(orderId)?.get(productId)?.picked ?? 0,
    packed: progress.get(orderId)?.get(productId)?.packed ?? 0,
    dispatched: progress.get(orderId)?.get(productId)?.dispatched ?? 0,
  });

  // Commit-path only: records cumulative history for a validated transfer.
  const addProgress = (orderId: string, productId: string, field: "picked" | "packed" | "dispatched", quantity: number): void => {
    let byOrder = progress.get(orderId);
    if (!byOrder) {
      byOrder = new Map();
      progress.set(orderId, byOrder);
    }
    const line = byOrder.get(productId) ?? { picked: 0, packed: 0, dispatched: 0 };
    line[field] += quantity;
    byOrder.set(productId, line);
  };

  const packingUnits = (resourceId: string): number => {
    let total = 0;
    for (const byOrder of packing.get(resourceId)?.values() ?? []) {
      for (const [pid, qty] of byOrder) total += costOf(pid, qty);
    }
    return total;
  };

  const reservedAt = (locationId: string, productId: string): number => {
    let total = 0;
    for (const lines of reservations.values()) {
      const line = lines.get(productId);
      if (line) total += line.sources.get(locationId) ?? 0;
    }
    return total;
  };

  const reservedProduct = (productId: string): number => {
    let total = 0;
    for (const lines of reservations.values()) {
      const line = lines.get(productId);
      if (line) for (const qty of line.sources.values()) total += qty;
    }
    return total;
  };

  const storedProduct = (productId: string): number => {
    let total = 0;
    for (const slot of storage.values()) {
      if (slot.productId === productId) total += slot.quantity;
    }
    return total;
  };

  const locationEligible = (locationId: string, productId: string): string | null => {
    const loc = locations.get(locationId);
    const product = products.get(productId);
    if (!loc || !product) return "unknown location or product";
    if (!loc.handlingClasses.includes(product.handlingClass)) {
      return `handling class ${product.handlingClass} ineligible at ${locationId}`;
    }
    if (loc.productIds && !loc.productIds.includes(productId)) {
      return `product ${productId} restricted from ${locationId}`;
    }
    if (
      product.dims.width > loc.usable.width ||
      product.dims.depth > loc.usable.depth ||
      product.dims.height > loc.usable.height
    ) {
      return `product ${productId} item dimensions exceed ${locationId} usable dimensions`;
    }
    return null;
  };

  const record = (eventId: string, timeMs: number, productId: string, quantity: number, from: string, to: string, owner: string): void => {
    seq += 1;
    transfers.push({ seq, eventId, timeMs, productId, quantity, from, to, owner });
  };

  // Idempotent command gate: same op + same eventId + same payload replays
  // the recorded result; the same eventId under a different operation or a
  // different payload is rejected. Neither path re-applies state.
  const gate = <T>(op: string, eventId: string, request: unknown, run: () => T): T => {
    const key = JSON.stringify(request);
    const prior = processed.get(eventId);
    if (prior) {
      if (prior.op !== op || prior.request !== key) {
        throw new Error(`duplicate event id with different payload: ${eventId}`);
      }
      return JSON.parse(JSON.stringify(prior.result)) as T;
    }
    const result = run();
    processed.set(eventId, { op, request: key, result: JSON.parse(JSON.stringify(result)) });
    return result;
  };

  const orderOwner = (orderId: string): string => `order:${orderId}`;
  const deliveryOwner = (deliveryId: string): string => `delivery:${deliveryId}`;

  // Stable source order: configured home first, then location ID ascending.
  const sourceOrder = (productId: string): string[] => {
    const ids = [...locations.keys()].sort();
    const h = home.get(productId);
    if (h && ids.includes(h)) return [h, ...ids.filter((id) => id !== h)];
    return ids;
  };

  const store: InventoryStore = {
    acceptInbound: (cmd) =>
      gate("acceptInbound", cmd.eventId, cmd, () => {
        const eventId = assertId(cmd.eventId, "eventId");
        const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
        const deliveryId = assertId(cmd.deliveryId, "deliveryId");
        const resourceId = assertId(cmd.resourceId, "resourceId");
        const productId = assertId(cmd.productId, "productId");
        const quantity = assertQuantity(cmd.quantity, "quantity");
        const product = products.get(productId);
        if (!product) throw new Error(`unknown product ${productId}`);
        const cap = receivingCap.get(resourceId);
        if (cap === undefined) throw new Error(`unknown receiving resource ${resourceId}`);
        const pending = external.get(deliveryId)?.get(productId) ?? 0;
        if (!external.has(deliveryId)) throw new Error(`unknown delivery ${deliveryId}`);
        if (pending < quantity) {
          throw new Error(
            `delivery ${deliveryId} has only ${pending} of ${productId} pending, cannot accept ${quantity}`,
          );
        }
        const after = receivingUnits(resourceId) + costOf(productId, quantity);
        if (after > cap) {
          throw new Error(
            `receiving ${resourceId} staging ${after}/${cap} handling-cost units over capacity`,
          );
        }
        external.get(deliveryId)?.set(productId, pending - quantity);
        let byResource = receiving.get(resourceId);
        if (!byResource) {
          byResource = new Map();
          receiving.set(resourceId, byResource);
        }
        const byDelivery = byResource.get(deliveryId) ?? new Map<string, number>();
        byDelivery.set(productId, (byDelivery.get(productId) ?? 0) + quantity);
        byResource.set(deliveryId, byDelivery);
        accepted.set(productId, (accepted.get(productId) ?? 0) + quantity);
        record(eventId, timeMs, productId, quantity, `external:${deliveryId}`, `receiving:${resourceId}`, deliveryOwner(deliveryId));
        return { status: "accepted", deliveryId, productId, quantity };
      }),

    collectPutAway: (cmd) =>
      gate("collectPutAway", cmd.eventId, cmd, () => {
        const eventId = assertId(cmd.eventId, "eventId");
        const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
        const deliveryId = assertId(cmd.deliveryId, "deliveryId");
        const resourceId = assertId(cmd.resourceId, "resourceId");
        const unitId = assertId(cmd.unitId, "unitId");
        const productId = assertId(cmd.productId, "productId");
        const quantity = assertQuantity(cmd.quantity, "quantity");
        const product = products.get(productId);
        if (!product) throw new Error(`unknown product ${productId}`);
        if (!receivingCap.has(resourceId)) throw new Error(`unknown receiving resource ${resourceId}`);
        if (!external.has(deliveryId)) throw new Error(`unknown delivery ${deliveryId}`);
        const unit = units.get(unitId);
        if (!unit) throw new Error(`unknown unit ${unitId}`);
        if (unit.role !== "putaway") throw new Error(`unit ${unitId} role ${unit.role} cannot collect put-away`);
        if (!unit.handlingClasses.includes(product.handlingClass)) {
          throw new Error(`unit ${unitId} ineligible for handling class ${product.handlingClass}`);
        }
        const staged = receiving.get(resourceId)?.get(deliveryId)?.get(productId) ?? 0;
        if (staged < quantity) {
          throw new Error(
            `receiving ${resourceId} holds only ${staged} of ${productId} for delivery ${deliveryId}, cannot collect ${quantity}`,
          );
        }
        const load = carried.get(unitId);
        if (!load) throw new Error(`unknown unit ${unitId}`);
        const owner = deliveryOwner(deliveryId);
        if (load.owner !== null && load.owner !== owner) {
          throw new Error(`unit ${unitId} is committed to ${load.owner}, cannot collect for ${owner}`);
        }
        const after = carriedUnits(unitId) + costOf(productId, quantity);
        if (after > unit.loadCapacityUnits) {
          throw new Error(
            `unit ${unitId} load ${after}/${unit.loadCapacityUnits} handling-cost units over capacity`,
          );
        }
        receiving.get(resourceId)?.get(deliveryId)?.set(productId, staged - quantity);
        load.owner = owner;
        load.loads.set(productId, (load.loads.get(productId) ?? 0) + quantity);
        record(eventId, timeMs, productId, quantity, `receiving:${resourceId}`, `carried:${unitId}`, owner);
        return { status: "collected", unitId, productId, quantity };
      }),

    placePutAway: (cmd) =>
      gate("placePutAway", cmd.eventId, cmd, () => {
        const eventId = assertId(cmd.eventId, "eventId");
        const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
        const deliveryId = assertId(cmd.deliveryId, "deliveryId");
        const unitId = assertId(cmd.unitId, "unitId");
        const locationId = assertId(cmd.locationId, "locationId");
        const productId = assertId(cmd.productId, "productId");
        const quantity = assertQuantity(cmd.quantity, "quantity");
        if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
        const slot = storage.get(locationId);
        const info = locations.get(locationId);
        if (!slot || !info) throw new Error(`unknown location ${locationId}`);
        const load = carried.get(unitId);
        if (!load) throw new Error(`unknown unit ${unitId}`);
        const owner = deliveryOwner(deliveryId);
        if (load.owner !== owner) throw new Error(`unit ${unitId} carries nothing for ${owner}`);
        if ((load.loads.get(productId) ?? 0) < quantity) {
          throw new Error(`unit ${unitId} carries insufficient ${productId} for ${owner}`);
        }
        const blocker = locationEligible(locationId, productId);
        if (blocker) throw new Error(`cannot store ${productId} at ${locationId}: ${blocker}`);
        if (slot.productId !== null && slot.productId !== productId) {
          throw new Error(`location ${locationId} holds ${slot.productId}, one product per slot`);
        }
        if (slot.quantity + quantity > info.maxQuantity) {
          throw new Error(
            `location ${locationId} ${slot.quantity}+${quantity} exceeds maxQuantity ${info.maxQuantity}`,
          );
        }
        load.loads.set(productId, (load.loads.get(productId) ?? 0) - quantity);
        if ([...load.loads.values()].every((q) => q === 0)) {
          load.loads.clear();
          load.owner = null;
        }
        slot.productId = productId;
        slot.quantity += quantity;
        record(eventId, timeMs, productId, quantity, `carried:${unitId}`, `storage:${locationId}`, owner);
        return { status: "stored", locationId, productId, quantity };
      }),

    selectPutAwayLocation: (productId, quantity) => {
      assertId(productId, "productId");
      assertQuantity(quantity, "quantity");
      if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
      const blockers: string[] = [];
      for (const locationId of sourceOrder(productId)) {
        const info = locations.get(locationId);
        const slot = storage.get(locationId);
        if (!info || !slot) continue;
        const blocker = locationEligible(locationId, productId);
        if (blocker) {
          blockers.push(`${locationId}: ${blocker}`);
          continue;
        }
        if (slot.productId !== null && slot.productId !== productId) {
          blockers.push(`${locationId}: holds ${slot.productId}`);
          continue;
        }
        if (slot.quantity + quantity > info.maxQuantity) {
          blockers.push(`${locationId}: ${slot.quantity}+${quantity} exceeds maxQuantity ${info.maxQuantity}`);
          continue;
        }
        return { status: "selectable", locationId };
      }
      return { status: "blocked", reason: blockers.join("; ") || "no locations configured" };
    },

    reserveOrder: (cmd) =>
      gate("reserveOrder", cmd.eventId, cmd, (): ReserveResult => {
        const eventId = assertId(cmd.eventId, "eventId");
        void eventId;
        assertTimeMs(cmd.timeMs, "timeMs");
        const orderId = assertId(cmd.orderId, "orderId");
        const lines = orders.get(orderId);
        if (!lines) throw new Error(`unknown order ${orderId}`);
        const existing = reservations.get(orderId);
        if (existing) {
          // Idempotent retry: the recorded reservation stands, no duplicate.
          const replay: { productId: string; locationId: string; quantity: number }[] = [];
          for (const [productId, line] of [...existing.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
            for (const [locationId, remaining] of [...line.sources.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
              replay.push({ productId, locationId, quantity: remaining });
            }
          }
          return { status: "reserved", orderId, sources: replay };
        }
        // Resumable remaining-demand: cumulative picks survive cancellation,
        // so a re-reserve acquires only what is still unpicked.
        const remainingNeed = new Map<string, number>();
        for (const line of lines) {
          const picked = progressLine(orderId, line.productId).picked;
          if (picked > line.quantity) {
            throw new Error(`order ${orderId} ${line.productId} picked ${picked} exceeds requested ${line.quantity}`);
          }
          remainingNeed.set(line.productId, line.quantity - picked);
        }
        if ([...remainingNeed.values()].every((need) => need === 0)) {
          throw new Error(`order ${orderId} already fulfilled, cannot reserve`);
        }
        // Full-remaining atomic check across stored stock only.
        const shortages: { productId: string; requested: number; available: number }[] = [];
        for (const line of lines) {
          const need = remainingNeed.get(line.productId) ?? 0;
          if (need === 0) continue;
          const availableQty = storedProduct(line.productId) - reservedProduct(line.productId);
          if (availableQty < need) {
            shortages.push({ productId: line.productId, requested: need, available: availableQty });
          }
        }
        if (shortages.length > 0) {
          return { status: "waiting", orderId, reason: "WAITING_FOR_STOCK", shortages };
        }
        const plan = new Map<string, Map<string, number>>();
        for (const line of lines) {
          let need = remainingNeed.get(line.productId) ?? 0;
          if (need === 0) continue;
          const alloc = new Map<string, number>();
          for (const locationId of sourceOrder(line.productId)) {
            if (need <= 0) break;
            const slot = storage.get(locationId);
            if (!slot || slot.productId !== line.productId) continue;
            const free = slot.quantity - reservedAt(locationId, line.productId);
            if (free <= 0) continue;
            const take = Math.min(free, need);
            alloc.set(locationId, take);
            need -= take;
          }
          if (need > 0) {
            // Unreachable after the aggregate check, kept as a guard.
            throw new Error(`reservation plan short for ${line.productId}: missing ${need}`);
          }
          plan.set(line.productId, alloc);
        }
        const byProduct = new Map<string, ReservationLine>();
        const sources: { productId: string; locationId: string; quantity: number }[] = [];
        for (const line of lines) {
          const alloc = plan.get(line.productId);
          if (!alloc) continue;
          byProduct.set(line.productId, { requested: remainingNeed.get(line.productId) ?? 0, picked: 0, sources: alloc });
          for (const [locationId, qty] of [...alloc.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
            sources.push({ productId: line.productId, locationId, quantity: qty });
          }
        }
        reservations.set(orderId, byProduct);
        return { status: "reserved", orderId, sources };
      }),

    pick: (cmd) =>
      gate("pick", cmd.eventId, cmd, () => {
        const eventId = assertId(cmd.eventId, "eventId");
        const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
        const orderId = assertId(cmd.orderId, "orderId");
        const unitId = assertId(cmd.unitId, "unitId");
        const locationId = assertId(cmd.locationId, "locationId");
        const productId = assertId(cmd.productId, "productId");
        const quantity = assertQuantity(cmd.quantity, "quantity");
        const product = products.get(productId);
        if (!product) throw new Error(`unknown product ${productId}`);
        const unit = units.get(unitId);
        if (!unit) throw new Error(`unknown unit ${unitId}`);
        if (unit.role !== "picker") throw new Error(`unit ${unitId} role ${unit.role} cannot pick orders`);
        if (!unit.handlingClasses.includes(product.handlingClass)) {
          throw new Error(`unit ${unitId} ineligible for handling class ${product.handlingClass}`);
        }
        const slot = storage.get(locationId);
        if (!slot) throw new Error(`unknown location ${locationId}`);
        const line = reservations.get(orderId)?.get(productId);
        if (!line) throw new Error(`order ${orderId} holds no reservation for ${productId}`);
        const requested = orders.get(orderId)?.find((l) => l.productId === productId)?.quantity ?? 0;
        const alreadyPicked = progressLine(orderId, productId).picked;
        if (alreadyPicked + quantity > requested) {
          throw new Error(
            `order ${orderId} ${productId} picked ${alreadyPicked}/${requested}, cannot pick ${quantity} more`,
          );
        }
        const remaining = line.sources.get(locationId) ?? 0;
        if (remaining < quantity) {
          throw new Error(
            `order ${orderId} reserved only ${remaining} of ${productId} at ${locationId}, cannot pick ${quantity}`,
          );
        }
        if (slot.productId !== productId || slot.quantity < quantity) {
          throw new Error(`storage ${locationId} holds insufficient ${productId}`);
        }
        const load = carried.get(unitId);
        if (!load) throw new Error(`unknown unit ${unitId}`);
        const owner = orderOwner(orderId);
        if (load.owner !== null && load.owner !== owner) {
          throw new Error(`unit ${unitId} is committed to ${load.owner}, cannot pick for ${owner}`);
        }
        const after = carriedUnits(unitId) + costOf(productId, quantity);
        if (after > unit.loadCapacityUnits) {
          throw new Error(
            `unit ${unitId} load ${after}/${unit.loadCapacityUnits} handling-cost units over capacity`,
          );
        }
        slot.quantity -= quantity;
        if (slot.quantity === 0) slot.productId = null;
        line.sources.set(locationId, remaining - quantity);
        line.picked += quantity;
        addProgress(orderId, productId, "picked", quantity);
        load.owner = owner;
        load.loads.set(productId, (load.loads.get(productId) ?? 0) + quantity);
        record(eventId, timeMs, productId, quantity, `storage:${locationId}`, `carried:${unitId}`, owner);
        return { status: "picked", orderId, productId, quantity };
      }),

    cancelReservation: (cmd) =>
      gate("cancelReservation", cmd.eventId, cmd, () => {
        assertId(cmd.eventId, "eventId");
        assertTimeMs(cmd.timeMs, "timeMs");
        const orderId = assertId(cmd.orderId, "orderId");
        const lines = reservations.get(orderId);
        if (!lines) throw new Error(`unknown reservation for order ${orderId}`);
        // Releases UNPICKED commitments only: already picked/carried stock
        // is physical and is never recredited by this call, and cumulative
        // fulfillment history is retained so a re-reserve cannot reacquire
        // picked demand.
        reservations.delete(orderId);
        return { status: "cancelled", orderId, releasedLines: lines.size };
      }),

    transferToPacking: (cmd) =>
      gate("transferToPacking", cmd.eventId, cmd, () => {
        const eventId = assertId(cmd.eventId, "eventId");
        const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
        const orderId = assertId(cmd.orderId, "orderId");
        const unitId = assertId(cmd.unitId, "unitId");
        const resourceId = assertId(cmd.resourceId, "resourceId");
        const productId = assertId(cmd.productId, "productId");
        const quantity = assertQuantity(cmd.quantity, "quantity");
        if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
        const cap = packingCap.get(resourceId);
        if (cap === undefined) throw new Error(`unknown packing resource ${resourceId}`);
        const load = carried.get(unitId);
        if (!load) throw new Error(`unknown unit ${unitId}`);
        const owner = orderOwner(orderId);
        if (load.owner !== owner) throw new Error(`unit ${unitId} carries nothing for ${owner}`);
        if ((load.loads.get(productId) ?? 0) < quantity) {
          throw new Error(`unit ${unitId} carries insufficient ${productId} for ${owner}`);
        }
        const after = packingUnits(resourceId) + costOf(productId, quantity);
        if (after > cap) {
          throw new Error(
            `packing ${resourceId} staging ${after}/${cap} handling-cost units over capacity`,
          );
        }
        load.loads.set(productId, (load.loads.get(productId) ?? 0) - quantity);
        if ([...load.loads.values()].every((q) => q === 0)) {
          load.loads.clear();
          load.owner = null;
        }
        const byResource = packing.get(resourceId) ?? new Map<string, Map<string, number>>();
        const byOrder = byResource.get(orderId) ?? new Map<string, number>();
        byOrder.set(productId, (byOrder.get(productId) ?? 0) + quantity);
        byResource.set(orderId, byOrder);
        packing.set(resourceId, byResource);
        record(eventId, timeMs, productId, quantity, `carried:${unitId}`, `packing:${resourceId}:${orderId}`, owner);
        return { status: "staged", orderId, productId, quantity };
      }),

    packingReadiness: (orderId, resourceId) => {
      assertId(orderId, "orderId");
      assertId(resourceId, "resourceId");
      const lines = orders.get(orderId);
      if (!lines) throw new Error(`unknown order ${orderId}`);
      if (!packingCap.has(resourceId)) throw new Error(`unknown packing resource ${resourceId}`);
      const stagedAt = packing.get(resourceId)?.get(orderId) ?? new Map<string, number>();
      const requested = lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
      const staged = lines.map((l) => ({ productId: l.productId, quantity: stagedAt.get(l.productId) ?? 0 }));
      const remaining = lines
        .map((l) => ({ productId: l.productId, quantity: l.quantity - (stagedAt.get(l.productId) ?? 0) }))
        .filter((l) => l.quantity > 0);
      return { ready: remaining.length === 0, requested, staged, remaining };
    },

    packOrder: (cmd) =>
      gate("packOrder", cmd.eventId, cmd, () => {
        const eventId = assertId(cmd.eventId, "eventId");
        const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
        const orderId = assertId(cmd.orderId, "orderId");
        const resourceId = assertId(cmd.resourceId, "resourceId");
        const lines = orders.get(orderId);
        if (!lines) throw new Error(`unknown order ${orderId}`);
        if (!packingCap.has(resourceId)) throw new Error(`unknown packing resource ${resourceId}`);
        const stagedAt = packing.get(resourceId)?.get(orderId) ?? new Map<string, number>();
        for (const line of lines) {
          const have = stagedAt.get(line.productId) ?? 0;
          if (have < line.quantity) {
            throw new Error(
              `order ${orderId} not ready at ${resourceId}: ${line.productId} staged ${have}/${line.quantity}`,
            );
          }
          const packedSoFar = progressLine(orderId, line.productId).packed;
          if (packedSoFar + line.quantity > line.quantity) {
            throw new Error(
              `order ${orderId} ${line.productId} already packed ${packedSoFar}/${line.quantity}, cannot pack again`,
            );
          }
        }
        const out = packed.get(orderId) ?? new Map<string, number>();
        for (const line of lines) {
          stagedAt.set(line.productId, (stagedAt.get(line.productId) ?? 0) - line.quantity);
          out.set(line.productId, (out.get(line.productId) ?? 0) + line.quantity);
          addProgress(orderId, line.productId, "packed", line.quantity);
          record(eventId, timeMs, line.productId, line.quantity, `packing:${resourceId}:${orderId}`, `packed:${orderId}`, orderOwner(orderId));
        }
        packed.set(orderId, out);
        return { status: "packed", orderId };
      }),

    dispatchOrder: (cmd) =>
      gate("dispatchOrder", cmd.eventId, cmd, () => {
        const eventId = assertId(cmd.eventId, "eventId");
        const timeMs = assertTimeMs(cmd.timeMs, "timeMs");
        const orderId = assertId(cmd.orderId, "orderId");
        const lines = orders.get(orderId);
        if (!lines) throw new Error(`unknown order ${orderId}`);
        const have = packed.get(orderId) ?? new Map<string, number>();
        for (const line of lines) {
          if ((have.get(line.productId) ?? 0) < line.quantity) {
            throw new Error(`order ${orderId} packed insufficient ${line.productId}, cannot dispatch`);
          }
          const dispatchedSoFar = progressLine(orderId, line.productId).dispatched;
          if (dispatchedSoFar + line.quantity > line.quantity) {
            throw new Error(
              `order ${orderId} ${line.productId} already dispatched ${dispatchedSoFar}/${line.quantity}, cannot dispatch again`,
            );
          }
        }
        const out = dispatched.get(orderId) ?? new Map<string, number>();
        for (const line of lines) {
          have.set(line.productId, (have.get(line.productId) ?? 0) - line.quantity);
          out.set(line.productId, (out.get(line.productId) ?? 0) + line.quantity);
          addProgress(orderId, line.productId, "dispatched", line.quantity);
          record(eventId, timeMs, line.productId, line.quantity, `packed:${orderId}`, `dispatched:${orderId}`, orderOwner(orderId));
        }
        packed.set(orderId, have);
        dispatched.set(orderId, out);
        return { status: "dispatched", orderId };
      }),

    available: (productId) => {
      assertId(productId, "productId");
      if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
      const stored = storedProduct(productId);
      const reserved = reservedProduct(productId);
      return { stored, reserved, available: stored - reserved };
    },

    bucketTotals: (productId) => {
      assertId(productId, "productId");
      if (!products.has(productId)) throw new Error(`unknown product ${productId}`);
      let receivingQty = 0;
      for (const byResource of receiving.values()) {
        for (const byDelivery of byResource.values()) receivingQty += byDelivery.get(productId) ?? 0;
      }
      let carriedQty = 0;
      for (const load of carried.values()) carriedQty += load.loads.get(productId) ?? 0;
      let packingQty = 0;
      for (const byResource of packing.values()) {
        for (const byOrder of byResource.values()) packingQty += byOrder.get(productId) ?? 0;
      }
      let packedQty = 0;
      for (const byOrder of packed.values()) packedQty += byOrder.get(productId) ?? 0;
      let dispatchedQty = 0;
      for (const byOrder of dispatched.values()) dispatchedQty += byOrder.get(productId) ?? 0;
      let pending = 0;
      for (const lines of external.values()) pending += lines.get(productId) ?? 0;
      return {
        receiving: receivingQty,
        storage: storedProduct(productId),
        carried: carriedQty,
        packing: packingQty,
        packed: packedQty,
        dispatched: dispatchedQty,
        externalPending: pending,
      };
    },

    checkInvariants: () => {
      const violations: string[] = [];
      const nonNeg = (value: number, what: string): void => {
        if (!Number.isSafeInteger(value) || value < 0) violations.push(`negative ${what}: ${value}`);
      };
      for (const [locationId, slot] of storage) {
        nonNeg(slot.quantity, `storage ${locationId}`);
        if (slot.productId === null && slot.quantity !== 0) {
          violations.push(`storage ${locationId} has quantity without product`);
        }
        const info = locations.get(locationId);
        if (info && slot.quantity > info.maxQuantity) {
          violations.push(`storage ${locationId} exceeds maxQuantity`);
        }
      }
      for (const [unitId, load] of carried) {
        const unit = units.get(unitId);
        let unitsUsed = 0;
        for (const [pid, qty] of load.loads) {
          nonNeg(qty, `carried ${unitId} ${pid}`);
          unitsUsed += costOf(pid, qty);
        }
        if (unit && unitsUsed > unit.loadCapacityUnits) violations.push(`unit ${unitId} over load capacity`);
        if (load.owner === null && load.loads.size > 0) violations.push(`unit ${unitId} loaded without owner`);
      }
      for (const [resourceId, cap] of receivingCap) {
        if (receivingUnits(resourceId) > cap) violations.push(`receiving ${resourceId} over staging capacity`);
        for (const [deliveryId, byDelivery] of receiving.get(resourceId) ?? []) {
          for (const [pid, qty] of byDelivery) nonNeg(qty, `receiving ${resourceId} ${deliveryId} ${pid}`);
        }
      }
      for (const [resourceId, cap] of packingCap) {
        if (packingUnits(resourceId) > cap) violations.push(`packing ${resourceId} over staging capacity`);
      }
      for (const productId of products.keys()) {
        const t = store.bucketTotals(productId);
        const physical = t.receiving + t.storage + t.carried + t.packing + t.packed + t.dispatched;
        const expected = (initialTotals.get(productId) ?? 0) + (accepted.get(productId) ?? 0);
        if (physical !== expected) {
          violations.push(
            `conservation ${productId}: physical ${physical} != initial+accepted ${expected}`,
          );
        }
        if (reservedProduct(productId) > storedProduct(productId)) {
          violations.push(`reserved exceeds stored for ${productId}`);
        }
      }
      for (const [orderId, lines] of reservations) {
        for (const [productId, line] of lines) {
          let remaining = 0;
          for (const [locationId, qty] of line.sources) {
            nonNeg(qty, `reservation ${orderId} ${productId} ${locationId}`);
            remaining += qty;
            // Fully picked sources (qty 0) are history: the slot may since
            // be empty or restocked. Only outstanding claims need cover.
            if (qty === 0) continue;
            const slot = storage.get(locationId);
            if (!slot || slot.productId !== productId || slot.quantity < qty) {
              violations.push(`reservation ${orderId} ${productId} at ${locationId} exceeds physical stock`);
            }
          }
          if (line.picked + remaining !== line.requested) {
            violations.push(`reservation ${orderId} ${productId} picked+remaining != requested`);
          }
        }
      }
      // Per-order fulfillment bounds: cumulative history plus outstanding
      // claims can never exceed demand, and order-owned physical stock
      // (carried + packing + packed + dispatched) must equal cumulative
      // picks exactly. Product-level conservation alone cannot prove this.
      for (const [orderId, demandLines] of orders) {
        const outstanding = reservations.get(orderId);
        const owner = orderOwner(orderId);
        for (const demand of demandLines) {
          const hist = progressLine(orderId, demand.productId);
          if (hist.picked > demand.quantity) {
            violations.push(`order ${orderId} ${demand.productId} picked ${hist.picked} exceeds requested ${demand.quantity}`);
          }
          if (hist.packed > demand.quantity) {
            violations.push(`order ${orderId} ${demand.productId} packed ${hist.packed} exceeds requested ${demand.quantity}`);
          }
          if (hist.dispatched > demand.quantity) {
            violations.push(`order ${orderId} ${demand.productId} dispatched ${hist.dispatched} exceeds requested ${demand.quantity}`);
          }
          let remaining = 0;
          for (const qty of outstanding?.get(demand.productId)?.sources.values() ?? []) remaining += qty;
          if (hist.picked + remaining > demand.quantity) {
            violations.push(
              `order ${orderId} ${demand.productId} picked+outstanding ${hist.picked + remaining} exceeds requested ${demand.quantity}`,
            );
          }
          let carriedFor = 0;
          for (const load of carried.values()) {
            if (load.owner === owner) carriedFor += load.loads.get(demand.productId) ?? 0;
          }
          let packingFor = 0;
          for (const byResource of packing.values()) {
            packingFor += byResource.get(orderId)?.get(demand.productId) ?? 0;
          }
          const packedFor = packed.get(orderId)?.get(demand.productId) ?? 0;
          const dispatchedFor = dispatched.get(orderId)?.get(demand.productId) ?? 0;
          const physicalFor = carriedFor + packingFor + packedFor + dispatchedFor;
          if (physicalFor !== hist.picked) {
            violations.push(
              `order ${orderId} ${demand.productId} physical ${physicalFor} != picked ${hist.picked}`,
            );
          }
          if (packedFor + dispatchedFor !== hist.packed) {
            violations.push(
              `order ${orderId} ${demand.productId} packed+dispatched physical ${packedFor + dispatchedFor} != packed ${hist.packed}`,
            );
          }
          if (dispatchedFor !== hist.dispatched) {
            violations.push(
              `order ${orderId} ${demand.productId} dispatched physical ${dispatchedFor} != dispatched ${hist.dispatched}`,
            );
          }
        }
      }
      return violations;
    },

    snapshot: () => {
      const snap: InventorySnapshot = {
        storage: [...storage.entries()]
          .map(([locationId, slot]) => ({ locationId, productId: slot.productId, quantity: slot.quantity }))
          .sort((a, b) => (a.locationId < b.locationId ? -1 : 1)),
        receiving: [...receiving.entries()]
          .flatMap(([resourceId, byResource]) =>
            [...byResource.entries()].flatMap(([deliveryId, byDelivery]) =>
              [...byDelivery.entries()].map(([productId, quantity]) => ({ resourceId, deliveryId, productId, quantity })),
            ),
          )
          .sort((a, b) =>
            (a.resourceId + a.deliveryId + a.productId < b.resourceId + b.deliveryId + b.productId ? -1 : 1)
          ),
        carried: [...carried.entries()]
          .map(([unitId, load]) => ({
            unitId,
            owner: load.owner,
            loads: [...load.loads.entries()]
              .map(([productId, quantity]) => ({ productId, quantity }))
              .sort((a, b) => (a.productId < b.productId ? -1 : 1)),
          }))
          .sort((a, b) => (a.unitId < b.unitId ? -1 : 1)),
        packing: [...packing.entries()]
          .flatMap(([resourceId, byResource]) =>
            [...byResource.entries()].flatMap(([orderId, byOrder]) =>
              [...byOrder.entries()].map(([productId, quantity]) => ({ resourceId, orderId, productId, quantity })),
            ),
          )
          .sort((a, b) => (a.resourceId + a.orderId + a.productId < b.resourceId + b.orderId + b.productId ? -1 : 1)),
        packed: [...packed.entries()]
          .flatMap(([orderId, byOrder]) =>
            [...byOrder.entries()].map(([productId, quantity]) => ({ orderId, productId, quantity })),
          )
          .sort((a, b) => (a.orderId + a.productId < b.orderId + b.productId ? -1 : 1)),
        dispatched: [...dispatched.entries()]
          .flatMap(([orderId, byOrder]) =>
            [...byOrder.entries()].map(([productId, quantity]) => ({ orderId, productId, quantity })),
          )
          .sort((a, b) => (a.orderId + a.productId < b.orderId + b.productId ? -1 : 1)),
        externalPending: [...external.entries()]
          .flatMap(([deliveryId, lines]) =>
            [...lines.entries()].map(([productId, quantity]) => ({ deliveryId, productId, quantity })),
          )
          .sort((a, b) => (a.deliveryId + a.productId < b.deliveryId + b.productId ? -1 : 1)),
        reservations: [...reservations.entries()]
          .map(([orderId, lines]) => ({
            orderId,
            lines: [...lines.entries()]
              .map(([productId, line]) => ({
                productId,
                requested: line.requested,
                picked: line.picked,
                sources: [...line.sources.entries()]
                  .map(([locationId, remaining]) => ({ locationId, remaining }))
                  .sort((a, b) => (a.locationId < b.locationId ? -1 : 1)),
              }))
              .sort((a, b) => (a.productId < b.productId ? -1 : 1)),
          }))
          .sort((a, b) => (a.orderId < b.orderId ? -1 : 1)),
        acceptedInbound: [...accepted.entries()]
          .map(([productId, quantity]) => ({ productId, quantity }))
          .sort((a, b) => (a.productId < b.productId ? -1 : 1)),
        fulfillment: [...progress.entries()]
          .map(([orderId, byOrder]) => ({
            orderId,
            lines: [...byOrder.entries()]
              .map(([productId, hist]) => ({
                productId,
                requested: orders.get(orderId)?.find((l) => l.productId === productId)?.quantity ?? 0,
                picked: hist.picked,
                packed: hist.packed,
                dispatched: hist.dispatched,
              }))
              .sort((a, b) => (a.productId < b.productId ? -1 : 1)),
          }))
          .sort((a, b) => (a.orderId < b.orderId ? -1 : 1)),
        transfers: transfers.map((t) => ({ ...t })),
      };
      return freezeDeep(snap);
    },
  };

  return store;
}
