// M0 bounded asset experiment: revision-pinned download of SMALL metadata/text
// files only (no textures, no geometry crates). READ-ONLY w.r.t. remotes.
// Usage: node scripts/m0-asset-fetch.mjs
// Writes: assets/m0-experiment/rack_large_empty_a01/<files> + fetch-manifest.json
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DS = "nvidia/simready-assets";
const REV = "4763fbfaa4f8e97658e68b57d01b4c86659e08b5"; // pinned 2026-11-01
const PKG = "rack_large_empty_a01";
const FILES = [
  ".metadata/LICENSE.txt",
  ".metadata/com.nvidia.simready.conformance.Package@1.0.0.json",
  ".metadata/com.nvidia.simready.packaging.bom.json",
  ".metadata/com.nvidia.simready.root_usds.json",
  "com.nvidia.simready.packaging.json",
  "simready_usd/sm_rack_large_empty_a01_01.usd",
  "simready_usd/payloads/base.usda",
  "simready_usd/payloads/instances.usda",
  "simready_usd/payloads/materials.usda",
  "simready_usd/payloads/Physics/physics.usda",
];
const MAX_BYTES = 100 * 1024; // small files only; abort anything bigger

const destDir = join("assets", "m0-experiment", PKG);
mkdirSync(destDir, { recursive: true });
const manifest = { dataset: DS, revision: REV, package: PKG, fetchedAt: new Date().toISOString(), files: [] };

for (const f of FILES) {
  const url = `https://huggingface.co/datasets/${DS}/resolve/${REV}/${PKG}/${f}`;
  const r = await fetch(url, { headers: { "user-agent": "LayoutLab-M0-diagnostic" }, signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, 200, `must download ${f}, got ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.ok(buf.length > 0 && buf.length <= MAX_BYTES, `${f} must be small, got ${buf.length} bytes`);
  const dest = join(destDir, f);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  manifest.files.push({ path: f, bytes: buf.length });
  console.log(`saved ${f} (${buf.length} bytes)`);
}
writeFileSync(join(destDir, "fetch-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`M0-ASSET-FETCH: PASS (${manifest.files.length} files, revision ${REV.slice(0, 12)})`);
