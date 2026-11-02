// Verify one downloaded LayoutLab envelope without an API, key, or network.
// Pure @layoutlab/core replay from the embedded inputs: saved totals are
// recomputed, never echoed, so tampered totals, sequences, or percentages
// fail. Accepted: layoutlab.report/1, layoutlab.m2export/1 (manual/stub),
// layoutlab.m3report/1 (live/fixture), layoutlab.m5failure/1 (failure audit).
// Measurement recomputation only: a PASS proves the saved measurements follow
// from the embedded inputs, not who produced the file.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const core = await import(pathToFileURL(join(root, "packages/core/dist/index.js")).href);

const files = process.argv.slice(2).filter((a) => a !== "--help" && a !== "-h");
if (files.length === 0) {
  console.error("usage: node scripts/verify-report.mjs <envelope.json> [more.json ...]");
  console.error("Build first: npm run build --workspace @layoutlab/core");
  process.exit(2);
}

let failed = 0;
for (const file of files) {
  const label = file;
  try {
    const json = JSON.parse(readFileSync(resolve(file), "utf8"));
    const version = json?.envelopeVersion ?? json?.reportVersion;
    if (version === "layoutlab.m5failure/1") {
      const audit = core.replayFailureRecord(json);
      console.log(
        `PASS ${label}: valid failure audit (state ${audit.state}, run ${audit.runId}); ${audit.notice}`,
      );
    } else if (
      version === "layoutlab.report/1" ||
      version === "layoutlab.m2export/1" ||
      version === "layoutlab.m3report/1"
    ) {
      const replayed = core.replayReport({
        reportVersion: json.reportVersion,
        coreVersion: json.coreVersion,
        routePolicy: json.routePolicy,
        scenario: json.scenario,
        requirements: json.requirements,
        baseline: json.baseline,
        candidates: json.candidates,
        bestName: json.bestName,
        improvementPercents: json.improvementPercents,
        outcome: json.outcome,
      });
      if (replayed.matchesSaved) {
        console.log(
          `PASS ${label}: measurements match saved inputs (${replayed.report.candidates.length} candidates, best ${replayed.report.bestName ?? "none"}, outcome ${replayed.report.outcome}; measurement-only, file provenance not authenticated)`,
        );
      } else {
        failed = 1;
        console.log(`FAIL ${label}: mismatches=[${replayed.mismatches.join(", ")}]`);
      }
    } else {
      failed = 1;
      console.log(`FAIL ${label}: unknown envelope version ${JSON.stringify(version)}`);
    }
  } catch (e) {
    failed = 1;
    console.log(`FAIL ${label}: ${e instanceof Error ? e.message : e}`.slice(0, 300));
  }
}
process.exit(failed);
