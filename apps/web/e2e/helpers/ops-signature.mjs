// M3c UI-vs-headless parity oracle: runs the accepted burst headlessly to an
// exact clock and prints the canonical snapshot signature. Intentionally an
// independent twin of buildOpsSnapshotSignature (oracle, not shared code):
// same field order and null spellings, written separately.
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

const target = Number(process.argv[2]);
if (!Number.isInteger(target) || target < 0) {
  console.error("usage: ops-signature.mjs <clockMs>");
  process.exit(2);
}

const c = sim.createOperationsController({ scenario: burst, executionConfig: runconfig.executionConfig });
c.advanceTo(target);
const snap = c.snapshot();

const dash = (v) => (v === null || v === undefined ? "-" : String(v));
const out = [];
out.push(`clock=${snap.clockMs}`);
const n = snap.counts;
out.push(`counts=${n.selected},${n.arrived},${n.packed},${n.readyForDispatch},${n.shipped},${n.backlog},${n.stageBacklog}`);
out.push(`orders=${snap.orders.map((o) => `${o.orderId}:${o.state}:${dash(o.unitId)}:${dash(o.packingResourceId)}:${dash(o.queueSlotId)}`).join(";")}`);
out.push(
  `units=${snap.units
    .map((u) => {
      const load = u.carried.map((l) => `${l.productId}x${l.quantity}`).join("+") || "-";
      const route = u.authorizedRoute
        ? `${u.authorizedRoute.planVersion}:${u.authorizedRoute.points.map((p) => `${p.x},${p.z}`).join("|")}`
        : "-";
      return `${u.unitId}:${u.pose.x},${u.pose.z}:${u.transportState}:${u.task.kind}:${load}:${u.carriedCostUnits}:${route}`;
    })
    .join(";")}`,
);
out.push(
  `packing=${snap.packing
    .map((p) => {
      const jobs = p.jobs
        .map((j) => `${j.jobId}:${j.state}:${dash(j.queueSlotId)}:${dash(j.positionId)}:${dash(j.startTimeMs)}:${dash(j.finishTimeMs)}:${dash(j.waitMs)}`)
        .join(",");
      const packed = p.packedOutput.map((o) => `${o.orderId}x${o.costUnits}`).join("+") || "-";
      return `${p.resourceId}:${dash(p.approachingJobId)}:${jobs}:${packed}:${p.outputUsedUnits}`;
    })
    .join(";")}`,
);
out.push(`storage=${snap.inventory.storage.map((s) => `${s.locationId}:${dash(s.productId)}:${s.quantity}`).join(";")}`);
out.push(`packingStock=${snap.inventory.packing.map((s) => `${s.resourceId}:${s.orderId}:${s.productId}:${s.quantity}`).join(";")}`);
out.push(`packed=${snap.inventory.packed.map((s) => `${s.orderId}:${s.productId}:${s.quantity}`).join(";")}`);
out.push(
  `reservations=${snap.inventory.reservations
    .map((r) => `${r.orderId}:${r.lines.map((l) => `${l.productId}:${l.requested}:${l.picked}:${l.sources.map((s) => `${s.locationId}x${s.remaining}`).join("+")}`).join(",")}`)
    .join(";")}`,
);
const last = snap.timeline[snap.timeline.length - 1];
out.push(`timeline=${snap.timeline.length}:${last ? `${last.seq}:${last.timeMs}:${last.kind}:${dash(last.orderId)}:${dash(last.unitId)}` : "empty"}`);
out.push(`waits=${snap.waits.map((w) => `${dash(w.unitId)}:${dash(w.orderId)}:${w.reason}:${w.startMs}:${dash(w.endMs)}`).join(";")}`);
out.push(`checks=${snap.checks.conservation.join(",")}|${snap.checks.capacity.join(",")}|${snap.checks.safety.join(",")}`);
console.log(out.join("\n"));
