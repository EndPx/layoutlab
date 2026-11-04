// Independent workload evidence for one operations runtime module.
// Usage: node verify-runtime.mjs <module-path> <label>
// Runs the canonical full-shift fixture and the 6-order burst against the
// given module (current dist or archived runtime) and prints a compact
// JSON summary: counts, stage, checks, report-recompute result, derived
// metrics, per-product bucket totals (summed here from the raw snapshot,
// not echoed from the report) and order timestamps.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , modulePath, label] = process.argv;
if (!modulePath || !label) {
  console.error("usage: node verify-runtime.mjs <module-path> <label>");
  process.exit(2);
}
const mod = await import(pathToFileURL(path.resolve(modulePath)).href);
const root = path.resolve(import.meta.dirname, "../../..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

function bucketTotalsByProduct(snap) {
  const totals = new Map();
  const add = (pid, bucket, qty) => {
    if (!pid || !qty) return;
    const row = totals.get(pid) ?? { receiving: 0, storage: 0, carried: 0, packing: 0, packed: 0, dispatched: 0, externalPending: 0 };
    row[bucket] += qty;
    totals.set(pid, row);
  };
  for (const r of snap.inventory.storage) add(r.productId, "storage", r.quantity);
  for (const r of snap.inventory.receiving) add(r.productId, "receiving", r.quantity);
  for (const c of snap.inventory.carried) for (const l of c.loads) add(l.productId, "carried", l.quantity);
  for (const r of snap.inventory.packing) add(r.productId, "packing", r.quantity);
  for (const r of snap.inventory.packed) add(r.productId, "packed", r.quantity);
  for (const r of snap.inventory.dispatched) add(r.productId, "dispatched", r.quantity);
  for (const r of snap.inventory.externalPending) add(r.productId, "externalPending", r.quantity);
  return Object.fromEntries([...totals.entries()].sort().map(([k, v]) => [k, { ...v, total: Object.values(v).reduce((a, b) => a + b, 0) }]));
}

function runFull() {
  const scenario = readJson("fixtures/operations/main-warehouse.json");
  const runconfig = readJson("fixtures/operations/picking-packing-burst.runconfig.json");
  const c = mod.createOperationsController({ scenario, executionConfig: runconfig.executionConfig });
  c.advanceTo(scenario.policies.run.horizonMs);
  const s = c.snapshot();
  const report = c.exportReport();
  const verification = mod.recomputeOperationsReport(report);
  const metrics = mod.operationsRunMetrics(s, c.getCompletionStatus().stage);
  return {
    label,
    implementation: report.versions.simulation,
    stage: c.getCompletionStatus().stage,
    counts: s.counts,
    checks: s.checks,
    verificationOk: verification.ok,
    verificationMismatches: verification.mismatches,
    metrics,
    deliveryStates: Object.fromEntries([...new Set(s.deliveries.map((d) => d.state))].map((st) => [st, s.deliveries.filter((d) => d.state === st).length])),
    openWaits: s.waits.filter((w) => w.endMs === null).map((w) => w.reason),
    bucketsByProduct: bucketTotalsByProduct(s),
    initialPlusInbound: null,
  };
}

function runBurst() {
  const scenario = readJson("fixtures/operations/picking-packing-burst.json");
  const runconfig = readJson("fixtures/operations/picking-packing-burst.runconfig.json");
  const c = mod.createOperationsController({ scenario, executionConfig: runconfig.executionConfig });
  const termination = mod.runOperationsToTermination(c);
  const s = c.snapshot();
  const report = c.exportReport();
  const verification = mod.recomputeOperationsReport(report);
  const metrics = mod.operationsRunMetrics(s, c.getCompletionStatus().stage);
  return {
    implementation: report.versions.simulation,
    stage: c.getCompletionStatus().stage,
    counts: s.counts,
    checks: s.checks,
    verificationOk: verification.ok,
    verificationMismatches: verification.mismatches,
    metrics,
    termination,
    orderTimestamps: Object.fromEntries(s.orders.map((o) => [o.orderId, o.timestamps])),
  };
}

const full = runFull();
const burst = runBurst();
// Expected per-product supply = initial storage + all scheduled inbound.
const scenario = readJson("fixtures/operations/main-warehouse.json");
const expected = new Map();
for (const st of scenario.initialStock) expected.set(st.productId, (expected.get(st.productId) ?? 0) + st.quantity);
for (const d of scenario.deliverySchedule) for (const l of d.lines) expected.set(l.productId, (expected.get(l.productId) ?? 0) + l.quantity);
full.expectedByProduct = Object.fromEntries([...expected.entries()].sort());
full.conservationHolds = Object.entries(full.bucketsByProduct).every(([pid, b]) => b.total === (expected.get(pid) ?? 0))
  && Object.keys(full.bucketsByProduct).length === expected.size;
console.log(JSON.stringify({ label, full, burst }, null, 1));
