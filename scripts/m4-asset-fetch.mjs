// M4 asset staging: reproducible, revision-pinned fetch of the geometry crate
// plus BOM SHA-256 verification of every staged source byte. READ-ONLY w.r.t.
// remotes. No secrets. Writes only to the stage dir (TEMP by default, never
// into the repo) so checkouts stay lean; the GLB derivative is the tracked
// browser artifact and this script plus the manifest re-derive it.
// Usage: node scripts/m4-asset-fetch.mjs [--stage-dir <path>]
// Requires network to huggingface.co (pinned revision) for geometries.usd.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const DS = "nvidia/simready-assets";
const REV = "4763fbfaa4f8e97658e68b57d01b4c86659e08b5"; // pinned 2026-11-01 (M0)
const PKG = "rack_large_empty_a01";
const TRACKED = [
  "simready_usd/sm_rack_large_empty_a01_01.usd",
  "simready_usd/payloads/base.usda",
  "simready_usd/payloads/instances.usda",
  "simready_usd/payloads/materials.usda",
  "simready_usd/payloads/Physics/physics.usda",
];
const REMOTE_ONLY = ["simready_usd/payloads/geometries.usd"]; // 3.3 MB crate
const MAX_REMOTE_BYTES = 8 * 1024 * 1024;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const stageDir = arg("--stage-dir", join(tmpdir(), "layoutlab-m4-stage", PKG));
const srcDir = join("assets", "m0-experiment", PKG);
const bom = JSON.parse(
  readFileSync(join(srcDir, ".metadata", "com.nvidia.simready.packaging.bom.json"), "utf8"),
);
const bomByPath = new Map(bom.items.map((it) => [it.relative_path, it]));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

mkdirSync(stageDir, { recursive: true });
const staged = [];
for (const rel of [...TRACKED, ...REMOTE_ONLY]) {
  const entry = bomByPath.get(rel);
  assert.ok(entry, `BOM must list ${rel}`);
  const dest = join(stageDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (REMOTE_ONLY.includes(rel)) {
    const url = `https://huggingface.co/datasets/${DS}/resolve/${REV}/${PKG}/${rel}`;
    const res = await fetch(url, {
      headers: { "user-agent": "LayoutLab-M4-asset-fetch" },
      signal: AbortSignal.timeout(120000),
    });
    assert.equal(res.status, 200, `must download ${rel}, got ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 0 && buf.length <= MAX_REMOTE_BYTES, `${rel} size ${buf.length} out of bound`);
    assert.equal(buf.length, entry.size, `${rel} size must match BOM (${entry.size})`);
    assert.equal(sha256(buf), entry.hash.sha256, `${rel} SHA-256 must match BOM`);
    if (entry.hash["sha256-first1m"]) {
      assert.equal(
        sha256(buf.subarray(0, Math.min(buf.length, 1024 * 1024))),
        entry.hash["sha256-first1m"],
        `${rel} first-MiB hash must match BOM`,
      );
    }
    writeFileSync(dest, buf);
    console.log(`downloaded+verified ${rel} (${buf.length} bytes)`);
  } else {
    copyFileSync(join(srcDir, rel), dest);
    const buf = readFileSync(dest);
    assert.equal(buf.length, entry.size, `${rel} size must match BOM (${entry.size})`);
    assert.equal(sha256(buf), entry.hash.sha256, `${rel} SHA-256 must match BOM`);
    console.log(`staged+verified ${rel} (${buf.length} bytes)`);
  }
  staged.push({ path: rel, bytes: entry.size, sha256: entry.hash.sha256 });
}

const manifest = {
  dataset: DS,
  revision: REV,
  package: PKG,
  fetchedAt: new Date().toISOString(),
  stageDir,
  rootUsd: join(stageDir, "simready_usd", "sm_rack_large_empty_a01_01.usd"),
  files: staged,
};
writeFileSync(join(stageDir, "stage-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`M4-ASSET-FETCH: PASS (${staged.length} files verified, stage ${stageDir})`);
