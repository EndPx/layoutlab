// Verify one exported operations comparison offline: no API key, no
// network. Reconstructs every candidate from the embedded common inputs +
// patch + intervention policy, reruns the engine, and compares all saved
// metrics, reports and ranking. A PASS proves the saved values follow from
// the embedded synthetic inputs; it is not cryptographic proof of who
// produced the file or that the scenario describes a real warehouse.
// Usage: npm run build --workspace @layoutlab/simulation
//        node scripts/verify-operations-experiment.mjs <export.json> [more.json ...]
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const sim = await import(
  pathToFileURL(join(root, "packages/simulation/dist/index.js")).href
);

const files = process.argv.slice(2).filter((a) => a !== "--help" && a !== "-h");
if (files.length === 0) {
  console.error("usage: node scripts/verify-operations-experiment.mjs <export.json> [more.json ...]");
  console.error("Build first: npm run build --workspace @layoutlab/simulation");
  process.exit(2);
}

let failed = 0;
for (const file of files) {
  try {
    const json = JSON.parse(readFileSync(resolve(file), "utf8"));
    const result = sim.verifyOperationsExperiment(json);
    if (result.ok) {
      console.log(
        `PASS ${file}: comparison recomputes from embedded inputs (ranked ${result.recomputedRankedCandidateIds.join(", ") || "none"}, selected ${result.recomputedSelectedCandidateId ?? "none"}; measurement-only, provenance not authenticated, scenario synthetic)`,
      );
    } else {
      failed = 1;
      console.log(`FAIL ${file}: mismatches=[${result.mismatches.join("; ")}]`);
    }
  } catch (e) {
    failed = 1;
    console.log(`FAIL ${file}: ${e instanceof Error ? e.message : e}`.slice(0, 500));
  }
}
process.exit(failed);
