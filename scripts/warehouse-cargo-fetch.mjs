// Cargo-C1 luggage-cart fetch: revision-pinned minimal geometry closure.
//
// Reproduces the exact 6-file staged source set from the TRACKED closure
// (scripts/warehouse-cargo-fetch-closure.json): no private scratch
// prerequisite, clean clone works. Each file is fetched from the pinned
// dataset revision and verified for size + SHA-256 (+ first-MiB where the
// closure lists it) against the tracked closure, which was itself
// bootstrapped from the pinned-source BOM (per-file bytes/sha and the
// packaging->BOM sha + CC-BY-4.0 license chain verified at build time).
// Downloads ONLY root USD + base/instances/geometries/materials/physics.
// The carried crate reuses the W1-accepted crate_blue_a01 and is NOT
// re-fetched here (see scripts/warehouse-section-fetch-closure.json).
// Planned bytes are summed and printed BEFORE any network use; the bound is
// the exact pinned closure total (10,517,375 bytes). Exit nonzero on mismatch.
//
// Env: STAGE_DIR (default .coordination/warehouse-cargo-section/stage; point
// at an empty dir for a clean reproduction test).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CLOSURE = JSON.parse(readFileSync("scripts/warehouse-cargo-fetch-closure.json", "utf8"));
const stageRoot = process.env.STAGE_DIR || ".coordination/warehouse-cargo-section/stage";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const base = `https://huggingface.co/datasets/${CLOSURE.dataset}/resolve/${CLOSURE.revision}`;

const pkgs = CLOSURE.packages;
assert.ok(pkgs.length === 1 && pkgs[0].package === "cart_luggage_platform_a01", "closure must hold exactly the luggage cart");

// Sum the exact planned bytes BEFORE any network.
const plannedFiles = pkgs.flatMap((p) => p.files.map((f) => ({ pkg: p.package, ...f })));
const plannedTotal = plannedFiles.reduce((s, f) => s + f.bytes, 0);
console.log(`CARGO-FETCH plan: ${pkgs.length} package, ${plannedFiles.length} files, ${plannedTotal} bytes`);
console.log(`CARGO-FETCH bound: exact pinned closure total ${CLOSURE.expectedTotalBytes} bytes (nothing beyond is fetched)`);

let total = 0;
const summary = [];
for (const p of pkgs) {
  for (const f of p.files) {
    assert.ok(total + f.bytes <= plannedTotal, `closure bound exceeded at ${p.package}/${f.path}`);
    const url = `${base}/${p.package}/${f.path}`;
    const res = await fetch(url, {
      headers: { "user-agent": "LayoutLab-cargo-C1-fetch" },
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
  dataset: CLOSURE.dataset, revision: CLOSURE.revision, closure: "scripts/warehouse-cargo-fetch-closure.json",
  fetchedAt: new Date().toISOString(), totalBytes: total, files: summary,
}, null, 2));
console.log(`CARGO-FETCH: PASS ${summary.length} files, ${total} bytes total (exact pinned closure bound)`);
