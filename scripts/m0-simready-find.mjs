// M0 SimReady package search. READ-ONLY, anonymous, free.
// Usage: node scripts/m0-simready-find.mjs <kw1,kw2,...> [maxPages]
// Pages the HF tree API (top level only) and prints packages whose names match
// any keyword (case-insensitive). Bounded: default 60 pages x 100 entries.
import assert from "node:assert/strict";

const DS = "nvidia/simready-assets";
const REV = "4763fbfaa4f8e97658e68b57d01b4c86659e08b5"; // pinned 2026-11-01
const kws = (process.argv[2] || "rack,pallet,shelf,storage,warehouse").toLowerCase().split(",");
const maxPages = Number(process.argv[3] || 60);

let url = `https://huggingface.co/api/datasets/${DS}/tree/${REV}?recursive=false&limit=100`;
let pages = 0, total = 0;
const hits = [];
while (url && pages < maxPages) {
  const r = await fetch(url, { headers: { "user-agent": "LayoutLab-M0-diagnostic" }, signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, 200, `tree API must stay reachable, got ${r.status} on page ${pages + 1}`);
  const entries = await r.json();
  pages++;
  total += entries.length;
  for (const e of entries) {
    if (e.type === "directory" && kws.some((k) => e.path.toLowerCase().includes(k))) hits.push(e.path);
  }
  const link = r.headers.get("link") || "";
  const m = link.match(/<([^>]+)>;\s*rel="next"/);
  url = m ? m[1] : null;
  if (entries.length === 0) break;
}
console.log(`pages: ${pages}, top-level entries scanned: ${total}`);
console.log(`keyword hits (${hits.length}):`);
for (const h of hits) console.log(`  ${h}`);
console.log(url ? "NOTE: page cap reached, listing may be incomplete" : "listing complete");
console.log("M0-SIMREADY-FIND: PASS");
