// M3c UI-facts oracle: runs the accepted burst headlessly to an exact clock
// and prints the engine facts the UI must show there (adaptive assertions).
// Plain node over the built sim bundle + fixture/bindings JSON; independent
// twin of the web lib's presentation mapping (oracle, not shared code).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..");
const sim = await import(pathToFileURL(join(root, "packages", "simulation", "dist", "index.js")).href);
const burst = JSON.parse(readFileSync(join(root, "fixtures", "operations", "picking-packing-burst.json"), "utf8"));
const runconfig = JSON.parse(
  readFileSync(join(root, "fixtures", "operations", "picking-packing-burst.runconfig.json"), "utf8"),
);
const bindings = JSON.parse(
  readFileSync(join(root, "fixtures", "operations", "main-warehouse.bindings.json"), "utf8"),
);

const target = Number(process.argv[2]);
if (!Number.isInteger(target) || target < 0) {
  console.error("usage: ops-facts.mjs <clockMs>");
  process.exit(2);
}

const scenario = sim.parseOperationsScenario(burst);
const c = sim.createOperationsController({ scenario, executionConfig: runconfig.executionConfig });
c.advanceTo(target);
const snap = c.snapshot();

const approachOf = new Map(scenario.locations.map((l) => [l.id, l.approachPointMm]));
const roleOf = new Map(scenario.mobileUnits.map((u) => [u.id, u.role]));

function stopsFor(order) {
  // Mirror pickStopStates over the live reservation (remaining per leg).
  const orderSeen = [];
  const remaining = new Map();
  for (const r of order.reservation) {
    if (!remaining.has(r.locationId)) {
      orderSeen.push(r.locationId);
      remaining.set(r.locationId, 0);
    }
    remaining.set(r.locationId, remaining.get(r.locationId) + r.quantity);
  }
  const states = orderSeen.map((locId) => (remaining.get(locId) === 0 ? "done" : "todo"));
  const coords = orderSeen.map((locId) => {
    const a = approachOf.get(locId);
    return [a.x, a.z];
  });
  return { states: states.join(","), coords };
}

const units = {};
for (const u of snap.units) {
  const open = snap.waits.filter((w) => w.unitId === u.unitId && w.endMs === null);
  units[u.unitId] = {
    role: roleOf.get(u.unitId),
    busy: u.transportState !== "idle" || u.task.kind !== "idle",
    transport: u.transportState,
    task: u.task.kind,
    slotId: u.task.slotId ?? null,
    resourceId: u.task.resourceId ?? null,
    orderId: u.task.orderId ?? null,
    legIndex: u.task.legIndex ?? null,
    carried: u.carried.map((l) => [l.productId, l.quantity]),
    cost: u.carriedCostUnits,
    cap: u.loadCapacityUnits,
    plan: u.authorizedRoute
      ? {
          dx: u.authorizedRoute.destination.x,
          dz: u.authorizedRoute.destination.z,
          ver: u.authorizedRoute.planVersion,
          pts: u.authorizedRoute.points.length,
        }
      : null,
    pose: { x: u.pose.x, z: u.pose.z },
    openWait: open.length > 0
      ? { reason: open[0].reason, startMs: open[0].startMs, detail: open[0].detail }
      : null,
  };
}

const orders = {};
for (const o of snap.orders) {
  const { states, coords } = stopsFor(o);
  orders[o.orderId] = { state: o.state, unitId: o.unitId ?? null, stops: states, stopCoords: coords };
}

const locations = {};
for (const s of snap.inventory.storage) {
  const loc = scenario.locations.find((l) => l.id === s.locationId);
  const product = scenario.products.find((p) => p.id === s.productId);
  const upv = product ? (bindings.products[product.id]?.unitsPerVisual ?? 0) : 0;
  locations[s.locationId] = {
    productId: s.productId,
    qty: s.quantity,
    full: upv > 0 ? Math.floor(s.quantity / upv) : 0,
    partial: upv > 0 ? s.quantity % upv : 0,
    approach: loc ? [loc.approachPointMm.x, loc.approachPointMm.z] : null,
  };
}

const out = {
  clockMs: snap.clockMs,
  busyCount: Object.values(units).filter((u) => u.busy).length,
  completion: c.getCompletionStatus().stage,
  units,
  orders,
  locations,
};
console.log(JSON.stringify(out));
