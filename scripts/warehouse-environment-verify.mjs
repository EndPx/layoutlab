// Main-environment GLB verification: assert NEW derivatives vs manifests.
//
// Same asserts as scripts/warehouse-section-verify.mjs (W1, untouched),
// applied to the two warehouse-environment GLBs (packing table + entrance):
// file bytes + SHA-256 + triangles + mesh count == tracked manifest,
// container integrity, TRIANGLES + POSITION/NORMAL parity, buffer ranges,
// authored POSITION min/max == scanned extrema within 1 micron.
// Negative self-tests (corruption + tampered length) run in scratch.
// Exit 0 only if both GLBs verify and both negatives fail as specified.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PKGS = [
  "table_packing_heavyduty_c01",
  "structure_wall_entrance_a01",
];
const GLB = (a) => `apps/web/public/assets/warehouse-environment/${a}.glb`;
const MANIFEST = (a) => `assets/manifests/warehouse-environment-${a}.manifest.json`;

function parseGlb(path) {
  const b = readFileSync(path);
  assert.equal(b.readUInt32LE(0), 0x46546c67, path + ": bad magic");
  assert.equal(b.readUInt32LE(4), 2, path + ": bad version");
  assert.equal(b.readUInt32LE(8), b.length, path + ": total length field != file size");
  const jlen = b.readUInt32LE(12);
  assert.equal(b.readUInt32LE(16), 0x4e4f534a, path + ": JSON chunk type");
  assert.ok(20 + jlen + 8 <= b.length, path + ": JSON chunk overruns file");
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString("utf8").replace(/\s+$/, ""));
  const binLen = b.readUInt32LE(20 + jlen);
  assert.equal(b.readUInt32LE(20 + jlen + 4), 0x004e4942, path + ": BIN chunk type");
  assert.equal(20 + jlen + 8 + binLen, b.length, path + ": BIN length inconsistent with file size");
  assert.equal(j.asset.version, "2.0", path + ": glTF version");
  return { b, j, jlen, binOff: 20 + jlen + 8, binLen };
}

function verifyOne(asset, glbOverride) {
  const path = glbOverride || GLB(asset);
  const manifest = JSON.parse(readFileSync(MANIFEST(asset), "utf8"));
  const { b, j, binOff, binLen } = parseGlb(path);
  assert.equal(b.length, manifest.derivative.bytes, `${asset}: bytes ${b.length} != manifest ${manifest.derivative.bytes}`);
  assert.equal(createHash("sha256").update(b).digest("hex"), manifest.derivative.sha256, `${asset}: sha mismatch vs manifest`);
  const meshExpect = manifest.derivative.format.match(/(\d+) mesh\(es\)/);
  assert.ok(meshExpect, `${asset}: manifest format must declare mesh count`);
  assert.equal(j.meshes.length, Number(meshExpect[1]), `${asset}: mesh count != manifest`);
  let tris = 0;
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      assert.equal(p.mode, 4, `${asset}: non-TRIANGLES primitive`);
      const pa = j.accessors[p.attributes.POSITION];
      const na = j.accessors[p.attributes.NORMAL];
      assert.ok(pa && na, `${asset}: POSITION+NORMAL required`);
      assert.equal(pa.count, na.count, `${asset}: POSITION/NORMAL count mismatch`);
      assert.equal(pa.componentType, 5126, `${asset}: POSITION must be float`);
      tris += pa.count / 3;
      for (const a of [pa, na]) {
        const v = j.bufferViews[a.bufferView];
        const need = (v.byteOffset || 0) + a.count * 12;
        assert.ok(need <= binLen, `${asset}: accessor overruns BIN chunk`);
      }
      const v = j.bufferViews[pa.bufferView];
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pa.count; i++) {
        for (let k = 0; k < 3; k++) {
          const val = b.readFloatLE(binOff + (v.byteOffset || 0) + (i * 3 + k) * 4);
          assert.ok(Number.isFinite(val), `${asset}: non-finite position`);
          if (val < min[k]) min[k] = val;
          if (val > max[k]) max[k] = val;
        }
      }
      for (let k = 0; k < 3; k++) {
        assert.ok(Math.abs(pa.min[k] - min[k]) <= 1e-6, `${asset}: authored POSITION min[${k}] ${pa.min[k]} != actual ${min[k]}`);
        assert.ok(Math.abs(pa.max[k] - max[k]) <= 1e-6, `${asset}: authored POSITION max[${k}] ${pa.max[k]} != actual ${max[k]}`);
      }
    }
  }
  assert.equal(tris, manifest.derivative.triangles, `${asset}: triangles ${tris} != manifest ${manifest.derivative.triangles}`);
  console.log(`ok ${asset}: bytes=${b.length} sha=${manifest.derivative.sha256.slice(0, 16)}… meshes=${j.meshes.length} tris=${tris}`);
  return { bytes: b.length, tris };
}

let total = 0, tris = 0;
for (const a of PKGS) {
  const r = verifyOne(a);
  total += r.bytes;
  tris += r.tris;
}

{
  const dir = mkdtempSync(join(tmpdir(), "env-verify-"));
  mkdirSync(dir, { recursive: true });
  const src = readFileSync(GLB("table_packing_heavyduty_c01"));
  const corrupt = Buffer.from(src);
  corrupt[corrupt.length - 4] ^= 0xff;
  const cpath = join(dir, "corrupt.glb");
  writeFileSync(cpath, corrupt);
  assert.throws(() => verifyOne("table_packing_heavyduty_c01", cpath), /sha mismatch/,
    "negative FAILED: corrupted bytes must be rejected by the manifest sha assert");
  console.log("ok negative corruption: flipped BIN byte -> manifest sha mismatch -> REJECTED");
  const tampered = Buffer.from(src);
  tampered.writeUInt32LE(tampered.readUInt32LE(12) + 4, 12);
  const tpath = join(dir, "tampered.glb");
  writeFileSync(tpath, tampered);
  assert.throws(() => parseGlb(tpath), /BIN length|overruns|JSON/,
    "negative FAILED: tampered chunk length must be rejected");
  console.log("ok negative tampered-length: JSON length +4 -> container inconsistency -> REJECTED");
}

console.log(`ENV-VERIFY: PASS ${PKGS.length} GLBs, ${total} bytes total, ${tris} triangles + 2 negatives`);
