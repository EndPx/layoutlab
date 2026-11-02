// Main-warehouse-environment fetch: revision-pinned minimal geometry closure.
//
// Same contract as scripts/warehouse-section-fetch.mjs (W1, untouched):
// reproduce the exact staged source set from the TRACKED closure
// (scripts/warehouse-environment-fetch-closure.json). Each file is fetched
// from the pinned dataset revision and verified for size + SHA-256 (+
// first-MiB where the closure lists it). Planned bytes are summed and
// printed BEFORE any network use. Exit nonzero on any mismatch.
//
// Downloads ONLY root USD + base/instances/geometries/materials/physics (6
// files per package). No textures, no physics variants, no thumbnails.
//
// Env: ENV_PKGS (default all), STAGE_DIR (default
// .coordination/warehouse-environment/stage; point at an empty dir for a
// clean reproduction test).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CLOSURE = JSON.parse(readFileSync("scripts/warehouse-environment-fetch-closure.json", "utf8"));
const WANT = (process.env.ENV_PKGS ?? CLOSURE.packages.map((p) => p.package).join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);
const stageRoot = process.env.STAGE_DIR || ".coordination/warehouse-environment/stage";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const base = `https://huggingface.co/datasets/${CLOSURE.dataset}/resolve/${CLOSURE.revision}`;

const pkgs = CLOSURE.packages.filter((p) => p.package && WANT.includes(p.package));
assert.ok(pkgs.length > 0, `no selected packages match ENV_PKGS=${WANT.join(",")}`);
assert.deepEqual(
  [...WANT].sort(), pkgs.map((p) => p.package).sort(),
  `unknown package in ENV_PKGS=${WANT.join(",")}`,
);

const plannedFiles = pkgs.flatMap((p) => p.files.map((f) => ({ pkg: p.package, ...f })));
const plannedTotal = plannedFiles.reduce((s, f) => s + f.bytes, 0);
console.log(`ENV-FETCH plan: ${pkgs.length} packages, ${plannedFiles.length} files, ${plannedTotal} bytes`);
console.log(`ENV-FETCH bound: exact pinned closure total ${CLOSURE.expectedTotalBytes} bytes ` +
  `(subset scales by package; nothing beyond the closure is fetched)`);

let total = 0;
const summary = [];
for (const p of pkgs) {
  for (const f of p.files) {
    assert.ok(total + f.bytes <= plannedTotal, `closure bound exceeded at ${p.package}/${f.path}`);
    const url = `${base}/${p.package}/${f.path}`;
    const res = await fetch(url, {
      headers: { "user-agent": "LayoutLab-env-section-fetch" },
      signal: AbortSignal.timeout(180000),
    });
    assert.equal(res.status, 200, `fetch ${p.package}/${f.path} got ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.length, f.bytes, `${p.package}/${f.path} size ${buf.length} != closure ${f.bytes}`);
    assert.equal(sha256(buf), f.sha256, `${p.package}/${f.path} sha mismatch vs tracked closure`);
    if (f.sha256First1m) {
      assert.equal(sha256(buf.subarray(0, Math.min(buf.length, 1048576))), f.sha256First1m,
        `${p.package}/${f.path} first1m mismatch`);
    }
    const dest = join(stageRoot, p.package, f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    total += buf.length;
    summary.push({ pkg: p.package, rel: f.path, bytes: buf.length, sha256: f.sha256 });
    console.log(`ok ${p.package}/${f.path} ${buf.length}B`);
  }
}
assert.equal(total, plannedTotal, `fetched ${total} != planned ${plannedTotal}`);
mkdirSync(stageRoot, { recursive: true });
writeFileSync(join(stageRoot, "fetch-manifest.json"), JSON.stringify({
  dataset: CLOSURE.dataset, revision: CLOSURE.revision, closure: "scripts/warehouse-environment-fetch-closure.json",
  fetchedAt: new Date().toISOString(), totalBytes: total, files: summary,
}, null, 2));
console.log(`ENV-FETCH: PASS ${summary.length} files, ${total} bytes total (exact pinned closure bound)`);
