// W1 fit proof: actual transformed container AABBs vs declared slot volumes.
//
// Scans REAL GLB POSITION buffers (never authored accessor min/max, never
// downward rounding), applies fixture placements at uniform scale 1.0, and
// asserts, for every visual container:
//   1. fixture product unitDimsMm == ceil(measured geometry) per axis
//      (a stale nominal load such as 500x400x600 FAILS here);
//   2. world AABB inside the location slot volume in X, Y, AND Z;
//   3. top clears the next shelf deck above its base deck;
//   4. no volumetric interpenetration beyond declared face-contact tolerance;
//   5. per-location visual count == assignment quantity (explicit mapping).
// Negative self-tests prove the old deck-1 L2 placement (top 1303.135mm vs
// allowed 1299.003mm) FAILS and a nominal-vs-visual mismatch is rejected.
// Exit 0 only if the fixture passes and both negatives fail as specified.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FIXTURE = "experiments/warehouse-section/fixture.json";
const GLB_DIR = "apps/web/public/assets/warehouse-section";

function readGlbPositions(path) {
  const b = readFileSync(path);
  assert.equal(b.readUInt32LE(0), 0x46546c67, path + " magic");
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString("utf8").replace(/\s+$/, ""));
  const binOff = 20 + jlen + 8;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      const a = j.accessors[p.attributes.POSITION];
      const v = j.bufferViews[a.bufferView];
      tris += a.count / 3;
      for (let i = 0; i < a.count; i++) {
        for (let k = 0; k < 3; k++) {
          const val = b.readFloatLE(binOff + (v.byteOffset || 0) + (i * 3 + k) * 4);
          if (val < min[k]) min[k] = val;
          if (val > max[k]) max[k] = val;
        }
      }
    }
  }
  return { min, max, tris };
}

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
const EPS = fixture.verification.boundEpsMm / 1000; // m
const CONTACT = fixture.verification.contactToleranceMm / 1000; // m

const rack = fixture.racks[0];
const locs = new Map(fixture.locations.map((l) => [l.id, l]));
const products = new Map(fixture.products.map((p) => [p.id, p]));
const decks = fixture.shelfDecks.scaledY_M;

function slotCenter(locId) {
  const group = [...locs.values()].filter((l) => l.rackId === rack.id).sort((a, b) => (a.id < b.id ? -1 : 1));
  const i = group.findIndex((l) => l.id === locId);
  const w = rack.dimensionsMm.width;
  return { x: rack.positionMm.x - w / 2 + (w * (i + 0.5)) / group.length, z: rack.positionMm.z };
}

// Local AABBs scanned once from actual GLB bytes.
const local = {};
for (const asset of ["box_cardboard_a01", "crate_blue_a01"]) {
  local[asset] = readGlbPositions(`${GLB_DIR}/${asset}.glb`);
}

function checkProducts(fx) {
  for (const p of fx.products) {
    const b = local[p.visualAsset];
    const measured = {
      width: (b.max[0] - b.min[0]) * 1000,
      height: (b.max[1] - b.min[1]) * 1000,
      depth: (b.max[2] - b.min[2]) * 1000,
    };
    for (const axis of ["width", "height", "depth"]) {
      assert.equal(
        p.unitDimsMm[axis], Math.ceil(measured[axis] - 1e-9),
        `${p.id}: unitDimsMm.${axis}=${p.unitDimsMm[axis]} != ceil(measured ${measured[axis].toFixed(3)}mm); ` +
        `stale nominal loads are rejected, declare source-consistent ceiling bounds`,
      );
    }
    console.log(`ok product ${p.id}: unit ${p.unitDimsMm.width}x${p.unitDimsMm.depth}x${p.unitDimsMm.height} == ceil(measured ${measured.width.toFixed(3)}x${measured.depth.toFixed(3)}x${measured.height.toFixed(3)})`);
  }
}

function placements(fx) {
  const out = [];
  for (const a of fx.assignments) {
    const c = slotCenter(a.locationId);
    assert.equal(a.visuals.length, a.quantity,
      `${a.locationId}: ${a.visuals.length} visuals != quantity ${a.quantity}; mapping must be explicit`);
    for (const [vi, v] of a.visuals.entries()) {
      const b = local[v.visualAsset];
      const y = decks[v.deck] + v.stackOffsetMm / 1000;
      out.push({
        loc: a.locationId, product: a.productId, asset: v.visualAsset, deck: v.deck, vi,
        min: [c.x / 1000 + b.min[0], y + b.min[1], c.z / 1000 + b.min[2]],
        max: [c.x / 1000 + b.max[0], y + b.max[1], c.z / 1000 + b.max[2]],
      });
    }
  }
  return out;
}

function checkContainment(fx, items) {
  for (const it of items) {
    const u = locs.get(it.loc).usableDimensionsMm;
    const c = slotCenter(it.loc);
    const sx = [c.x / 1000 - u.width / 2000, c.x / 1000 + u.width / 2000];
    const sz = [c.z / 1000 - u.depth / 2000, c.z / 1000 + u.depth / 2000];
    const sy = [decks[0], decks[0] + u.height / 1000];
    assert.ok(it.min[0] >= sx[0] - EPS && it.max[0] <= sx[1] + EPS,
      `${it.loc} ${it.asset}#${it.vi}: X ${(it.min[0] * 1000).toFixed(3)}..${(it.max[0] * 1000).toFixed(3)} outside slot ${(sx[0] * 1000).toFixed(3)}..${(sx[1] * 1000).toFixed(3)}`);
    assert.ok(it.min[2] >= sz[0] - EPS && it.max[2] <= sz[1] + EPS,
      `${it.loc} ${it.asset}#${it.vi}: Z ${(it.min[2] * 1000).toFixed(3)}..${(it.max[2] * 1000).toFixed(3)} outside slot ${(sz[0] * 1000).toFixed(3)}..${(sz[1] * 1000).toFixed(3)}`);
    assert.ok(it.min[1] >= sy[0] - EPS && it.max[1] <= sy[1] + EPS,
      `${it.loc} ${it.asset}#${it.vi}: Y ${(it.min[1] * 1000).toFixed(3)}..${(it.max[1] * 1000).toFixed(3)} outside slot ${(sy[0] * 1000).toFixed(3)}..${(sy[1] * 1000).toFixed(3)}`);
    console.log(`ok contain ${it.loc} ${it.asset}#${it.vi}: X ${(it.min[0] * 1000).toFixed(1)}..${(it.max[0] * 1000).toFixed(1)} Y ${(it.min[1] * 1000).toFixed(1)}..${(it.max[1] * 1000).toFixed(1)} Z ${(it.min[2] * 1000).toFixed(1)}..${(it.max[2] * 1000).toFixed(1)} inside slot`);
  }
}

function checkDeckClearance(items) {
  for (const it of items) {
    const above = decks.filter((d) => d > decks[it.deck] + 1e-9).sort((a, b) => a - b)[0];
    if (above === undefined) continue;
    assert.ok(it.max[1] <= above + EPS,
      `${it.loc} ${it.asset}#${it.vi}: top ${(it.max[1] * 1000).toFixed(3)}mm hits deck above at ${(above * 1000).toFixed(3)}mm`);
    console.log(`ok deck ${it.loc} ${it.asset}#${it.vi}: top ${(it.max[1] * 1000).toFixed(1)}mm clears deck ${(above * 1000).toFixed(1)}mm by ${((above - it.max[1]) * 1000).toFixed(1)}mm`);
  }
}

function checkNonOverlap(items) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const depth = [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]));
      const interpenetrates = depth.every((d) => d > CONTACT);
      assert.ok(!interpenetrates,
        `${a.loc} ${a.asset}#${a.vi} interpenetrates ${b.loc} ${b.asset}#${b.vi}: overlap depth ${(depth.map((d) => (d * 1000).toFixed(3)).join("/"))}mm exceeds contact tolerance ${(CONTACT * 1000).toFixed(1)}mm`);
      console.log(`ok overlap ${a.loc}#${a.vi} vs ${b.loc}#${b.vi}: min-axis gap/overlap ${(Math.min(...depth) * 1000).toFixed(3)}mm within contact tolerance`);
    }
  }
}

// ---- positive proof on the shipped fixture ----
checkProducts(fixture);
const items = placements(fixture);
assert.equal(items.length, 3, `expected 3 sourced containers, got ${items.length}`);
checkContainment(fixture, items);
checkDeckClearance(items);
checkNonOverlap(items);
console.log(`ok aggregate: ${items.length} visuals == assigned quantities (L1 x1 + L2 x2)`);

// ---- negative 1: old wrong-height placement must FAIL ----
{
  const bad = JSON.parse(JSON.stringify(fixture));
  bad.assignments.find((a) => a.locationId === "L2").visuals[1] = {
    deck: 1, stackOffsetMm: 0,
    trueDimsMm: { width: 606, depth: 406, height: 254 }, visualAsset: "crate_blue_a01",
  };
  const badItems = placements(bad);
  assert.throws(() => checkContainment(bad, badItems), /outside slot/,
    "negative FAILED: old deck-1 L2 crate must be rejected");
  const top = badItems[2].max[1] * 1000;
  const allowed = (decks[0] + locs.get("L2").usableDimensionsMm.height / 1000) * 1000;
  assert.ok(top > allowed + 1, `negative FAILED: expected >1mm excess, top=${top} allowed=${allowed}`);
  console.log(`ok negative wrong-height: old deck-1 top ${top.toFixed(3)}mm exceeds allowed ${allowed.toFixed(3)}mm by ${(top - allowed).toFixed(3)}mm -> REJECTED`);
}

// ---- negative 2: stale nominal load must FAIL ----
{
  const bad = JSON.parse(JSON.stringify(fixture));
  bad.products.find((p) => p.id === "sku-b").unitDimsMm = { width: 500, depth: 400, height: 600 };
  assert.throws(() => checkProducts(bad), /rejected/,
    "negative FAILED: stale nominal 500x400x600 must be rejected");
  console.log("ok negative nominal-mismatch: unitDims 500x400x600 vs measured crate geometry -> REJECTED");
}

console.log("W1-FIT: PASS actual-AABB all-axis containment + clearance + non-overlap + aggregates + 2 negatives");
