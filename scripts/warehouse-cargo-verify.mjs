// Cargo-C2 GLB verification: assert the luggage-cart derivative + cross-checks.
//
// For the shipped cart GLB this ASSERTS (not just prints):
//   - file bytes + SHA-256 + triangle count + mesh count == tracked manifest;
//   - container integrity: magic, version, JSON/BIN chunk lengths consistent
//     with the file size (tampered lengths are rejected);
//   - every primitive is TRIANGLES with POSITION+NORMAL of equal count;
//   - buffer views stay inside the BIN chunk; accessor byte ranges fit;
//   - authored POSITION min/max == ACTUAL scanned POSITION extrema within
//     1 micron (float64 JSON vs float32 buffer; stale bounds rejected).
// Also asserts the reused W1 crate derivative still matches ITS manifest
// (byte-identical reuse, no silent drift), that the carry packet + bindings
// + canonical fixture closure holds (exact scene SHA/provenance, packet
// pointer, C2 profile/capacity in parent AND derived fixtures), and that
// the tracked cargo fit proof passes (it re-scans both GLBs itself).
// Negative self-tests in a scratch dir prove corruption (flipped BIN byte)
// and a tampered JSON-chunk length are both rejected.
// Exit 0 only if all asserts pass and both negatives fail as specified.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const CART_GLB = "apps/web/public/assets/warehouse-cargo/cart_luggage_platform_a01.glb";
const CART_MANIFEST = "assets/manifests/warehouse-cargo-cart_luggage_platform_a01.manifest.json";
const CRATE_GLB = "apps/web/public/assets/warehouse-section/crate_blue_a01.glb";
const CRATE_MANIFEST = "assets/manifests/warehouse-section-crate_blue_a01.manifest.json";

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
  return { b, j, binOff: 20 + jlen + 8, binLen };
}

function verifyOne(asset, glbPath, manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { b, j, binOff, binLen } = parseGlb(glbPath);
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
        assert.ok(Math.abs(pa.min[k] - min[k]) <= 1e-6, `${asset}: authored POSITION min[${k}] stale`);
        assert.ok(Math.abs(pa.max[k] - max[k]) <= 1e-6, `${asset}: authored POSITION max[${k}] stale`);
      }
    }
  }
  assert.equal(tris, manifest.derivative.triangles, `${asset}: triangles ${tris} != manifest ${manifest.derivative.triangles}`);
  console.log(`ok ${asset}: bytes=${b.length} sha=${manifest.derivative.sha256.slice(0, 16)}… meshes=${j.meshes.length} tris=${tris}`);
}

verifyOne("cart_luggage_platform_a01", CART_GLB, CART_MANIFEST);
verifyOne("crate_blue_a01 (W1 reuse)", CRATE_GLB, CRATE_MANIFEST);

// ---- negative self-tests in scratch (never touch shipped bytes) ----
{
  const dir = mkdtempSync(join(tmpdir(), "cargo-verify-"));
  mkdirSync(dir, { recursive: true });
  const src = readFileSync(CART_GLB);
  const corrupt = Buffer.from(src);
  corrupt[corrupt.length - 4] ^= 0xff;
  const cpath = join(dir, "corrupt.glb");
  writeFileSync(cpath, corrupt);
  assert.throws(() => verifyOne("cart_luggage_platform_a01", cpath, CART_MANIFEST), /sha mismatch/,
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

// ---- carry packet + bindings + canonical fixture closure ----
{
  const PACKET_PATH = "assets/cargo/carry-luggage-platform-a01.json";
  const packet = JSON.parse(readFileSync(PACKET_PATH, "utf8"));
  assert.equal(packet.model, "cargo-c2-centered680x1220", "packet model");
  const bindings = JSON.parse(readFileSync("fixtures/operations/main-warehouse.bindings.json", "utf8"));
  assert.equal(bindings.carryModel, packet.model, "bindings carry model must equal packet model");
  assert.equal(bindings.mobileUnits.carryPacket, PACKET_PATH, "bindings must point at the imported packet");
  assert.equal(bindings.mobileUnits.glb, packet.source.glb, "bindings cart GLB must equal packet source");
  assert.equal(bindings.mobileUnits.equipmentCrates.glb, packet.crate.glb, "bindings crate GLB must equal packet source");
  const mainBytes = readFileSync("fixtures/operations/main-warehouse.json");
  assert.equal(createHash("sha256").update(mainBytes).digest("hex"), bindings.fixtureSha256, "bindings scene SHA must match main fixture bytes");
  assert.equal(mainBytes.length, bindings.fixtureBytes, "bindings scene bytes must match main fixture");
  for (const [label, path] of [["parent", "fixtures/operations/main-warehouse.json"], ["burst", "fixtures/operations/picking-packing-burst.json"]]) {
    const fx = JSON.parse(readFileSync(path, "utf8"));
    for (const u of fx.mobileUnits) {
      assert.deepEqual(
        { width: u.footprintMm.width, length: u.footprintMm.length, margin: u.footprintMm.margin },
        { width: packet.profile.width, length: packet.profile.length, margin: packet.profile.margin },
        `${label} ${u.id} footprint must equal packet profile`,
      );
      assert.equal(u.loadCapacityUnits, packet.capacityUnits, `${label} ${u.id} capacity must equal packet capacity`);
    }
  }
  console.log(`ok closure: bindings scene sha ${bindings.fixtureSha256.slice(0, 12)}.. (${bindings.fixtureBytes} bytes) + packet pointer + C2 profile/capacity in parent AND burst`);
}

// ---- the tracked fit proof must pass on these exact bytes ----
execFileSync(process.execPath, ["scripts/warehouse-cargo-fit.mjs"], { stdio: "inherit" });
console.log("CARGO-VERIFY: PASS cart + crate reuse + 2 negatives + closure + fit proof");
