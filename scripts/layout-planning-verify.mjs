// Verify L0 layout comparison exports offline: no API key, no network.
// Reconstructs each candidate from baseline + proposal + attachments,
// reruns both engine runs, and compares reports, metrics, deltas and the
// measured improvement label. A PASS proves the saved values follow from
// the embedded inputs; it is not cryptographic proof of authorship.
// Build first: node scripts/layout-planning-build.mjs
// Usage: node scripts/layout-planning-verify.mjs <export.json> [more.json ...]
import { existsSync, readFileSync } from "node:fs";
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
const files = process.argv.slice(2).filter((a) => a !== "--help" && a !== "-h");
if (files.length === 0) {
  console.error("usage: node scripts/layout-planning-verify.mjs <export.json> [more.json ...]");
  console.error("Build first: node scripts/layout-planning-build.mjs");
  process.exit(2);
}
let failed = 0;
for (const file of files) {
  try {
    const json = JSON.parse(readFileSync(resolve(file), "utf8"));
    const result = await draft.verifyLayoutComparison(json);
    if (result.ok) {
      const kindNote = result.kind === "rejection"
        ? "recorded rejection replays exactly; this verifies the rejection, not a valid layout"
        : result.kind === "candidate-only-repaired"
          ? "candidate-only repair preview recomputes; no baseline claim"
          : "layout comparison recomputes from embedded inputs";
      console.log(`PASS ${file}: ${kindNote} (kind ${result.kind}, improvement ${result.recomputedImprovement ?? "n/a"}, candidate sha ${result.recomputedCandidateSha256 ?? "none"}; measurement-only, provenance not authenticated)`);
    } else {
      failed = 1;
      console.log(`FAIL ${file}: mismatches=[${result.mismatches.join("; ").slice(0, 900)}]`);
    }
  } catch (error) {
    failed = 1;
    console.log(`FAIL ${file}: ${error instanceof Error ? error.message : error}`.slice(0, 500));
  }
}
process.exit(failed);
