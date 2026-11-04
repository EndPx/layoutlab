// Browser-portability check for the layout draft: the whole src/.out
// import graph must contain no Node-only builtin specifiers, the compiled
// entry must import and hash with platform WebCrypto, and a pure geometry
// preview (apply + viewer placement) must work from in-memory data alone
// (no filesystem, network or server secrets). This helper is deliberately
// scoped as a static-graph + runtime-import check; the actual bundler +
// real-browser evidence was produced separately by the coordinator with
// the installed Vite build API and Microsoft Edge (see
// docs/PHYSICAL_LAYOUT_CONTRACT.md section 6).
// Usage: node scripts/layout-planning-browser-check.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const draftDir = join(root, "packages/simulation/layout-draft");
const outEntry = join(draftDir, ".out/index.js");
if (!existsSync(outEntry)) {
  console.error("layout draft not built: run node scripts/layout-planning-build.mjs first");
  process.exit(2);
}
let failed = 0;
for (const dir of [join(draftDir, "src"), join(draftDir, ".out")]) {
  for (const file of readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f))) {
    const text = readFileSync(join(dir, file), "utf8");
    const nodeImports = [...text.matchAll(/from\s+["'](node:[^"']+)["']|import\s*\(\s*["'](node:[^"']+)["']|require\s*\(\s*["'](node:[^"']+)["']/g)];
    if (nodeImports.length > 0) {
      failed = 1;
      console.log(`FAIL ${file}: Node-only imports ${nodeImports.map((m) => m[1] ?? m[2] ?? m[3]).join(", ")}`);
    }
  }
}
const draft = await import(pathToFileURL(outEntry).href);
const hash = await draft.contentSha256({ probe: "browser-portability" });
if (!/^[0-9a-f]{64}$/.test(hash)) {
  failed = 1;
  console.log(`FAIL contentSha256 returned ${hash}`);
}
const baselineRaw = draft.buildCorridorScenario(8000);
const { parseOperationsScenario } = await import(pathToFileURL(join(root, "packages/simulation/dist/index.js")).href);
const baseline = parseOperationsScenario(baselineRaw);
const map = draft.buildStationAttachmentMap(baseline, [draft.corridorAttachment(8000)]);
const proposal = {
  kind: "PACKING_STATION_TRANSLATION",
  proposalId: "browser-check",
  parent: { scenarioId: baseline.id, scenarioContentSha256: hash.length ? await draft.contentSha256(baseline) : "", schemaVersion: baseline.schemaVersion, engineVersion: baseline.engineVersion },
  entityId: "PACK-1",
  target: { mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } },
};
const bundle = draft.applyPackingStationTranslation(baseline, draft.parseLayoutProposal(proposal).proposal, map);
if (bundle.viewerPlacement.centreMm.x !== 10000 || bundle.viewerPlacement.centreMm.z !== 1100) {
  failed = 1;
  console.log(`FAIL viewer placement ${JSON.stringify(bundle.viewerPlacement.centreMm)}`);
}
console.log(failed ? "FAIL browser-portability check" : `PASS browser-portability (static-graph + runtime-import scope): no node: imports in layout-draft graph, WebCrypto hash ok, in-memory geometry preview centre (${bundle.viewerPlacement.centreMm.x},${bundle.viewerPlacement.centreMm.z}); real Vite+Edge bundler evidence is recorded in docs/PHYSICAL_LAYOUT_CONTRACT.md section 6`);
process.exit(failed);
