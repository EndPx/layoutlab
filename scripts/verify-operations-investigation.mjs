// Verify one exported operations investigation offline: no API key, no
// network. Reuses the E3 comparison verifier (reruns the engine from the
// embedded common inputs), checks trace/request caps, referenced candidate
// ids, intervention policy, and recomputes every recommendation comparison
// and improvement percentage. A PASS proves the saved measurements follow
// from the embedded synthetic inputs; it does NOT authenticate live
// inference (provider provenance is recorded metadata only).
// Usage: npm run build --workspace @layoutlab/simulation && npm run build --workspace @layoutlab/api
//        node scripts/verify-operations-investigation.mjs <export.json> [more.json ...]
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const api = await import(pathToFileURL(join(root, "apps/api/dist/operations-investigations.js")).href);

const files = process.argv.slice(2).filter((a) => a !== "--help" && a !== "-h");
if (files.length === 0) {
  console.error("usage: node scripts/verify-operations-investigation.mjs <export.json> [more.json ...]");
  console.error("Build first: npm run build --workspace @layoutlab/simulation && npm run build --workspace @layoutlab/api");
  process.exit(2);
}

let failed = 0;
for (const file of files) {
  try {
    const json = JSON.parse(readFileSync(resolve(file), "utf8"));
    const result = api.verifyInvestigationExport(json);
    if (result.ok) {
      console.log(
        `PASS ${file}: investigation recomputes from embedded inputs (providerKind ${json.providerKind}, requests ${json.requestCount}, experiments ${json.experimentCount}, recommendation ${json.recommendation?.candidateId ?? "none"} via ${json.recommendation?.source ?? "none"}; engine-only replay, live inference provenance not authenticated, scenario synthetic)`,
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
