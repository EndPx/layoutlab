// M4 GLB verifier: independent structural check of the converted rack
// derivative plus SHA-256 for the manifest. No three.js dependency: parses
// the binary container and JSON chunk directly.
// Usage: node scripts/m4-asset-verify.mjs <file.glb>
// Prints JSON: bytes, sha256, mesh/primitive/accessor summary, POSITION
// bounds, and the Y-up/ground-origin calibration verdict.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const path = process.argv[2];
assert.ok(path, "usage: node scripts/m4-asset-verify.mjs <file.glb>");
const buf = readFileSync(path);
assert.ok(buf.length > 20, "GLB too small");
assert.equal(buf.readUInt32LE(0), 0x46546c67, "GLB magic");
assert.equal(buf.readUInt32LE(4), 2, "GLB version 2");
assert.equal(buf.readUInt32LE(8), buf.length, "GLB length prefix");

const jsonLen = buf.readUInt32LE(12);
assert.equal(buf.readUInt32LE(16), 0x4e4f534a, "JSON chunk type");
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
const binOff = 20 + jsonLen;
const binLen = buf.readUInt32LE(binOff);
assert.equal(buf.readUInt32LE(binOff + 4), 0x004e4942, "BIN chunk type");
assert.equal(binOff + 8 + binLen, buf.length, "BIN chunk fills the file");

assert.equal(gltf.meshes?.length, 1, "exactly 1 mesh");
assert.equal(gltf.meshes[0].primitives?.length, 1, "exactly 1 primitive");
const prim = gltf.meshes[0].primitives[0];
assert.equal(prim.mode, 4, "TRIANGLES mode");
assert.ok(prim.attributes.POSITION !== undefined, "POSITION attribute");
assert.ok(prim.attributes.NORMAL !== undefined, "NORMAL attribute");
const pos = gltf.accessors[prim.attributes.POSITION];
const nrm = gltf.accessors[prim.attributes.NORMAL];
assert.equal(pos.componentType, 5126, "POSITION float32");
assert.equal(pos.type, "VEC3");
assert.equal(nrm.count, pos.count, "NORMAL count matches POSITION");
assert.ok(pos.count % 3 === 0 && pos.count > 0, "non-indexed triangle soup");
const mat = gltf.materials[prim.material];
assert.equal(mat?.doubleSided, true, "double-sided neutral material");

// Buffer views must tile the BIN chunk without overlap or overrun.
const ranges = gltf.bufferViews
  .map((v) => [v.byteOffset, v.byteOffset + v.byteLength])
  .sort((a, b) => a[0] - b[0]);
for (const [s, e] of ranges) assert.ok(s >= 0 && e <= binLen, "bufferView in BIN range");
for (let i = 1; i < ranges.length; i++) {
  assert.ok(ranges[i][0] >= ranges[i - 1][1], "bufferViews do not overlap");
}

// Y-up ground-origin calibration: min.y == 0 (base), extents match the
// mapped source bounds x[-2,2], y[0,3.01], z[-1.033,1.033] within 1 mm.
const [min, max] = [pos.min, pos.max];
const near = (a, b) => Math.abs(a - b) < 0.001;
const calibrated =
  near(min[0], -2) && near(max[0], 2) &&
  near(min[1], 0) && near(max[1], 3.01) &&
  near(min[2], -1.033291) && near(max[2], 1.033291);

console.log(JSON.stringify({
  file: path,
  bytes: buf.length,
  sha256: createHash("sha256").update(buf).digest("hex"),
  meshes: gltf.meshes.length,
  triangles: pos.count / 3,
  soupVertices: pos.count,
  material: mat?.name ?? null,
  doubleSided: mat?.doubleSided ?? null,
  positionBoundsMin_m: min,
  positionBoundsMax_m: max,
  calibratedYUpGroundOrigin: calibrated,
}, null, 2));
assert.ok(calibrated, "GLB POSITION bounds must match mapped source bounds within 1 mm");
console.log("M4-ASSET-VERIFY: PASS");
