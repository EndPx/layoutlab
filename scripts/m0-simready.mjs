// M0 SimReady catalog probe. READ-ONLY, anonymous, free: no HF token needed.
// Usage: node scripts/m0-simready.mjs [keyword]
// Fetches dataset metadata, pins the current `sha` revision, lists license/tags,
// and filters file siblings by keyword (default "rack"). Exit nonzero on failure.
import assert from "node:assert/strict";

const DS = "nvidia/simready-assets";
const keyword = (process.argv[2] || "rack").toLowerCase();

const r = await fetch(`https://huggingface.co/api/datasets/${DS}`, {
  headers: { "user-agent": "LayoutLab-M0-diagnostic" },
  signal: AbortSignal.timeout(30000),
});
assert.equal(r.status, 200, `dataset API must be reachable, got ${r.status}`);
const meta = await r.json();

assert.ok(typeof meta.sha === "string" && /^[0-9a-f]{40}$/.test(meta.sha), "pinned revision sha must be a 40-hex commit");
console.log(`dataset: ${DS}`);
console.log(`pinnedRevision: ${meta.sha}`);
console.log(`license/tags: ${JSON.stringify(meta.tags?.filter((t) => t.startsWith("license:") || t === "CC-BY-4.0") ?? meta.tags?.slice(0, 10))}`);
console.log(`downloads: ${meta.downloads} likes: ${meta.likes}`);

const sibs = meta.siblings ?? [];
assert.ok(sibs.length > 0, "dataset must list file siblings");
console.log(`siblings: ${sibs.length}`);
const hits = sibs.filter((s) => s.rfilename.toLowerCase().includes(keyword)).slice(0, 25);
console.log(`keyword "${keyword}" matches (first 25):`);
for (const h of hits) console.log(`  ${h.rfilename}`);
if (hits.length === 0) {
  console.log("sample siblings:");
  for (const s of sibs.slice(0, 15)) console.log(`  ${s.rfilename}`);
}
console.log("M0-SIMREADY-CATALOG: PASS");
