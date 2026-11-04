// Generate an L0 layout comparison export (main warehouse by default).
// No API key, no network. Build the draft first:
//   node scripts/layout-planning-build.mjs
// Usage: node scripts/layout-planning-compare.mjs [--preset valid|overlap|out-of-room] [--out <file>]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outEntry = join(root, "packages/simulation/layout-draft/.out/index.js");
if (!existsSync(outEntry)) {
  console.error("layout draft not built: run node scripts/layout-planning-build.mjs first");
  process.exit(2);
}
const draft = await import(pathToFileURL(outEntry).href);
const sim = await import(pathToFileURL(join(root, "packages/simulation/dist/index.js")).href);

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
const preset = argValue("--preset", "valid");
const scenarioPath = resolve(argValue("--scenario", join(root, "fixtures/operations/main-warehouse.json")));
const bindingsPath = resolve(argValue("--bindings", join(root, "fixtures/operations/main-warehouse.bindings.json")));
const runconfigPath = join(root, "fixtures/operations/picking-packing-burst.runconfig.json");
const fixtureBytes = readFileSync(scenarioPath);
const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex");
const scenarioRaw = JSON.parse(fixtureBytes.toString("utf8"));
const bindings = JSON.parse(readFileSync(bindingsPath, "utf8"));
const executionConfig = JSON.parse(readFileSync(runconfigPath, "utf8")).executionConfig;
const baseline = sim.parseOperationsScenario(scenarioRaw);
const attachments = [...draft.attachmentsFromBindings(baseline, bindings).values()];
const parent = {
  scenarioId: baseline.id,
  scenarioContentSha256: await draft.contentSha256(baseline),
  schemaVersion: baseline.schemaVersion,
  engineVersion: baseline.engineVersion,
};
const targets = {
  // Valid: PACK-1 centre (20500,5000) -> (20500,4000), delta (0,-1000).
  valid: { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 20500, z: 4000 } },
  // Rejected: station rect onto rack R3 (proven interior overlap).
  overlap: { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 16000, z: 6000 } },
  // Rejected: station rect leaves the room (delta (0,-4500), within budget).
  "out-of-room": { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 20500, z: 500 } },
};
if (!targets[preset]) {
  console.error(`unknown --preset ${preset} (want valid|overlap|out-of-room)`);
  process.exit(2);
}
const proposal = {
  kind: "PACKING_STATION_TRANSLATION",
  proposalId: `layout-l0-main-${preset}`,
  parent,
  entityId: "PACK-1",
  target: targets[preset],
};
// Approved authority is supplied by this operator context, never by the
// proposal itself.
const approvedConstraints = draft.defaultApprovedConstraints(["PACK-1", "PACK-2"]);
const result = await draft.runLayoutComparison({
  baselineScenario: scenarioRaw,
  executionConfig,
  proposal,
  attachments,
  approvedConstraints,
});
const exported = {
  ...result,
  provenance: {
    scenarioPath: "fixtures/operations/main-warehouse.json",
    fixtureSha256,
    bindingsFixtureSha256: bindings.fixtureSha256 ?? null,
    fixtureBytesMatchBindings: bindings.fixtureSha256 === fixtureSha256,
    executionConfigPath: "fixtures/operations/picking-packing-burst.runconfig.json",
    layoutDraft: "packages/simulation/layout-draft/src (compiled to .out; shared simulation dist untouched)",
    note: "measurement follows from the embedded inputs; provenance is not cryptographic proof of authorship",
  },
};
// Re-check the source fixture bytes after the run: baseline stays immutable.
const afterSha256 = createHash("sha256").update(readFileSync(scenarioPath)).digest("hex");
if (afterSha256 !== fixtureSha256) {
  console.error("FAIL: source fixture bytes changed during comparison");
  process.exit(1);
}
const outFile = resolve(argValue("--out", join(root, `evidence/sanitized/layout-l0-main-${preset}.json`)));
writeFileSync(outFile, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
console.log(`WROTE ${outFile}`);
console.log(`validation ok: ${result.validation.ok} baselineValid: ${result.baselineValid} candidateValid: ${result.candidateValid} (${result.validation.introducedIssues.map((i) => i.code).join(", ") || "no introduced issues"})`);
console.log(`measurement: ${result.measurement}; improvement: ${result.improvement}; truncated: ${result.evaluationScope.truncated}; baseline makespan: ${result.baselineMetrics?.makespanMs ?? "n/a"}; candidate makespan: ${result.candidateMetrics?.makespanMs ?? "n/a"}; delta makespan: ${result.delta?.makespanMs ?? "n/a"}`);
console.log(`fixture sha256 (unchanged): ${fixtureSha256}`);
