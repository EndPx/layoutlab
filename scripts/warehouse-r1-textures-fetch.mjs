// R1 selective texture fetch: source maps for the representative visible
// assets converted by warehouse-usd-to-glb-v2.py (box + crate).
//
// Revision-pinned to the same dataset revision as every other LayoutLab
// SimReady closure (nvidia/simready-assets@653d91e1...). ONLY the six files
// below are fetched — never a whole package or dataset. Expected byte sizes
// (from the pinned-revision tree listing) are summed and printed BEFORE any
// network use; each download is size-checked and SHA-256 hashed into
// assets/manifests/warehouse-r1-textures.manifest.json so later runs verify
// instead of trusting the network. Textures land beside the staged USDs at
// <stage>/<pkg>/simready_usd/Textures/, exactly where the source
// materials.usda @../Textures/...@ references resolve.
//
// Usage: node scripts/warehouse-r1-textures-fetch.mjs
// Env: STAGE_DIR (default .coordination/warehouse-section/stage)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DATASET = "nvidia/simready-assets";
const REVISION = "653d91e182011f357cf1644013cc94ddf194d349";
const stageRoot = process.env.STAGE_DIR || ".coordination/warehouse-section/stage";
const manifestPath = "assets/manifests/warehouse-r1-textures.manifest.json";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// Exact selective set: Albedo (sRGB) + ORM (raw G=roughness B=metallic) +
// Normal (raw) per package, as referenced by each payloads/materials.usda.
const FILES = [
  { pkg: "box_cardboard_a01", rel: "simready_usd/Textures/T_Cardbox_A1_Albedo_1.png", bytes: 3577615, role: "albedo-sRGB" },
  { pkg: "box_cardboard_a01", rel: "simready_usd/Textures/T_Cardbox_A1_ORM_1.png", bytes: 2858551, role: "orm-raw" },
  { pkg: "box_cardboard_a01", rel: "simready_usd/Textures/T_Cardbox_A1_Normal_1.png", bytes: 2476917, role: "normal-raw" },
  { pkg: "crate_blue_a01", rel: "simready_usd/Textures/T_Plastic_Blue_A_Albedo.png", bytes: 822814, role: "albedo-sRGB" },
  { pkg: "crate_blue_a01", rel: "simready_usd/Textures/T_Plastic_Blue_A_ORM.png", bytes: 743855, role: "orm-raw" },
  { pkg: "crate_blue_a01", rel: "simready_usd/Textures/T_Plastic_Blue_A_Normal.png", bytes: 909580, role: "normal-raw" },
];

const plannedTotal = FILES.reduce((s, f) => s + f.bytes, 0);
console.log(`R1-TEXTURES plan: ${FILES.length} files, ${plannedTotal} bytes (selective; no package/dataset download)`);
console.log(`R1-TEXTURES source: ${DATASET}@${REVISION} (CC-BY-4.0; license copies under assets/licenses/)`);

const prior = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : null;
const priorHash = new Map((prior?.files ?? []).map((f) => [`${f.package}/${f.path}`, f.sha256]));

const summary = [];
let total = 0;
for (const f of FILES) {
  const url = `https://huggingface.co/datasets/${DATASET}/resolve/${REVISION}/${f.pkg}/${f.rel}`;
  const res = await fetch(url, {
    headers: { "user-agent": "LayoutLab-R1-textures-fetch" },
    signal: AbortSignal.timeout(180000),
  });
  assert.equal(res.status, 200, `fetch ${f.pkg}/${f.rel} got ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.length, f.bytes, `${f.pkg}/${f.rel} size ${buf.length} != expected ${f.bytes}`);
  const hash = sha256(buf);
  const key = `${f.pkg}/${f.rel}`;
  if (priorHash.has(key)) {
    assert.equal(hash, priorHash.get(key), `${key} sha mismatch vs recorded manifest`);
  }
  const dest = join(stageRoot, f.pkg, f.rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  total += buf.length;
  summary.push({ package: f.pkg, path: f.rel, bytes: buf.length, sha256: hash, role: f.role });
  console.log(`ok ${key} ${buf.length}B sha256=${hash.slice(0, 16)}…`);
}
assert.equal(total, plannedTotal, `fetched ${total} != planned ${plannedTotal}`);

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify({
  manifestVersion: "layoutlab.r1-textures/1",
  dataset: DATASET,
  revision: REVISION,
  license: "CC-BY-4.0",
  fetchedAt: new Date().toISOString(),
  totalBytes: total,
  files: summary,
}, null, 2));
console.log(`R1-TEXTURES: PASS ${summary.length} files, ${total} bytes; hashes pinned in ${manifestPath}`);
