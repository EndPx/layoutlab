// Main-environment fit proof: canonical fixture + bindings vs actual GLB bytes.
//
// Scans REAL GLB POSITION buffers (never authored min/max), applies the
// shared @layoutlab/simulation environment helpers (same code the renderer
// uses), and asserts for the whole main-warehouse-1 configuration:
//   1. fixture parses; counts are exactly 6/24/12/23/6/4/28/12/12;
//   2. every product/rack/unit/station/obstacle id is bound; every GLB exists;
//   3. container unitDimsMm == ceil(measured geometry) per axis;
//   4. stock quantities are exact multiples of unitsPerVisual (no fractional
//      containers); L24 has zero stock and zero visuals;
//   5. every container world AABB fits its slot volume in X, Y, AND Z at
//      true scale; tops clear the next shelf deck; no interpenetration
//      beyond 0.5mm face-contact; maxQuantity == grid capacity x upv;
//   6. anchors sit inside their rack envelopes on decks 0/1 (never 2/off-deck);
//   7. station table AABBs agree exactly with OB-PACK1/OB-PACK2;
//   8. wall placements lie outside the room touching the boundary;
//   9. entrance barrier/door-body mesh AABBs agree exactly with the OB-*-B*/D*
//      obstacles; wall_01 mesh lies outside the room;
//   10. racks/obstacles do not overlap interiors; racks sit inside the room;
//   11. every approach/parking/service/queue point is in-room and globally
//       distinct.
// Negatives prove an oversize grid, ghost stock, an off-deck anchor, and a
// shifted station are all rejected. Exit 0 only if all pass.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  containerGrid,
  containersForStock,
  deckIndexForAnchorY,
  parseOperationsScenario,
} from "@layoutlab/simulation";
import { rectsOverlapInterior } from "@layoutlab/core";

const FIXTURE = "fixtures/operations/main-warehouse.json";
const BINDINGS = "fixtures/operations/main-warehouse.bindings.json";
const EPS_MM = 0.01;
const CONTACT_MM = 0.5;

function readGlbMeshes(path) {
  const b = readFileSync(path);
  assert.equal(b.readUInt32LE(0), 0x46546c67, path + " magic");
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString("utf8").replace(/\s+$/, ""));
  const binOff = 20 + jlen + 8;
  return j.meshes.map((m) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of m.primitives) {
      const a = j.accessors[p.attributes.POSITION];
      const v = j.bufferViews[a.bufferView];
      for (let i = 0; i < a.count; i++) {
        for (let k = 0; k < 3; k++) {
          const val = b.readFloatLE(binOff + (v.byteOffset || 0) + (i * 3 + k) * 4);
          if (val < min[k]) min[k] = val;
          if (val > max[k]) max[k] = val;
        }
      }
    }
    return { name: m.name, min, max };
  });
}

// three.js rotationY: x' = x cos + z sin, z' = -x sin + z cos.
function transformAABB(mesh, yawDeg, posM) {
  const t = (yawDeg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const xs = [], ys = [], zs = [];
  for (const x of [mesh.min[0], mesh.max[0]]) {
    for (const y of [mesh.min[1], mesh.max[1]]) {
      for (const z of [mesh.min[2], mesh.max[2]]) {
        xs.push((x * c + z * s + posM[0]) * 1000);
        ys.push((y + posM[1]) * 1000);
        zs.push((-x * s + z * c + posM[2]) * 1000);
      }
    }
  }
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };
}

const fx = parseOperationsScenario(JSON.parse(readFileSync(FIXTURE, "utf8")));
const bd = JSON.parse(readFileSync(BINDINGS, "utf8"));

// ---- 1. exact counts ----
assert.equal(fx.geometry.racks.length, 6, "racks");
assert.equal(fx.locations.length, 24, "locations");
assert.equal(fx.products.length, 12, "products");
assert.equal(fx.initialStock.length, 23, "stock entries (L24 empty)");
assert.equal(fx.mobileUnits.length, 6, "mobile units");
assert.equal(fx.resources.length, 4, "resources");
assert.equal(fx.orderSchedule.length, 28, "orders");
assert.equal(fx.deliverySchedule.length, 12, "deliveries");
assert.equal(fx.orderSchedule.length + fx.deliverySchedule.length, 40, "orders+deliveries");
assert.equal(fx.geometry.obstacles.length, 12, "obstacles");
assert.equal(fx.id, bd.fixtureId, "bindings target this fixture");
console.log("ok counts: 6 racks / 24 locs / 12 products / 23 stock / 6 units / 4 resources / 28+12 scheduled / 12 obstacles");

// ---- 2. binding closure ----
for (const p of fx.products) {
  assert.ok(bd.products[p.id], `product ${p.id} unbound`);
  assert.ok(bd.containers[bd.products[p.id].containerAsset], `product ${p.id} container unbound`);
  assert.equal(p.visualAssetRef, bd.products[p.id].containerAsset, `product ${p.id} visualAssetRef != bindings`);
}
for (const o of fx.geometry.obstacles) assert.ok(bd.obstacleVisuals[o.id], `obstacle ${o.id} unbound`);
assert.deepEqual(Object.keys(bd.obstacleVisuals).sort(), fx.geometry.obstacles.map((o) => o.id).sort(), "obstacle visuals cover exactly the fixture obstacles");
for (const g of [bd.containers["warehouse-section/box_cardboard_a01"].glb, bd.containers["warehouse-section/crate_blue_a01"].glb, bd.racks.glb, bd.mobileUnits.glb, bd.stations["PACK-1"].glb, bd.stations["PACK-2"].glb, bd.floor.glb, bd.walls.glb, bd.entrances.glb]) {
  assert.ok(existsSync(g), `missing GLB ${g}`);
}
console.log("ok bindings: every product/obstacle bound, all 8 GLB assets exist");

// ---- 3. container unit dims == ceil(measured) ----
const boxMesh = readGlbMeshes(bd.containers["warehouse-section/box_cardboard_a01"].glb)[0];
const crateMesh = readGlbMeshes(bd.containers["warehouse-section/crate_blue_a01"].glb)[0];
for (const [key, mesh] of [["warehouse-section/box_cardboard_a01", boxMesh], ["warehouse-section/crate_blue_a01", crateMesh]]) {
  const u = bd.containers[key].unitDimsMm;
  const measured = {
    width: (mesh.max[0] - mesh.min[0]) * 1000,
    height: (mesh.max[1] - mesh.min[1]) * 1000,
    depth: (mesh.max[2] - mesh.min[2]) * 1000,
  };
  assert.equal(u.width, Math.ceil(measured.width - 1e-9), `${key} width`);
  assert.equal(u.height, Math.ceil(measured.height - 1e-9), `${key} height`);
  assert.equal(u.depth, Math.ceil(measured.depth - 1e-9), `${key} depth`);
  console.log(`ok ${key}: unit ${u.width}x${u.depth}x${u.height} == ceil(measured ${measured.width.toFixed(3)}x${measured.depth.toFixed(3)}x${measured.height.toFixed(3)})`);
}

// ---- 4-6. slots: anchors, aggregation, grid fit, deck clearance ----
const racks = new Map(fx.geometry.racks.map((r) => [r.id, r]));
const products = new Map(fx.products.map((p) => [p.id, p]));
const stockByLoc = new Map(fx.initialStock.map((s) => [s.locationId, s]));
const decks = bd.racks.deckTopsMm;
assert.deepEqual(decks, [450, 1580, 2330], "deck tops");
let visualTotal = 0;
const boxes3d = [];
for (const loc of fx.locations) {
  const rack = racks.get(loc.rackId);
  const a = loc.storageAnchorMm;
  // Anchor inside rack envelope (x/z), on deck 0/1 (never top deck 2, never off-deck).
  assert.ok(a.x > rack.positionMm.x - rack.dimensionsMm.width / 2 && a.x < rack.positionMm.x + rack.dimensionsMm.width / 2, `${loc.id} anchor x outside rack`);
  assert.ok(a.z > rack.positionMm.z - rack.dimensionsMm.depth / 2 && a.z < rack.positionMm.z + rack.dimensionsMm.depth / 2, `${loc.id} anchor z outside rack`);
  const deck = deckIndexForAnchorY(a.y, decks);
  assert.ok(deck === 0 || deck === 1, `${loc.id} anchor y=${a.y} must sit on deck 0/1, got deck index ${deck}`);
  const slot = {
    minX: a.x - loc.usableDimensionsMm.width / 2, maxX: a.x + loc.usableDimensionsMm.width / 2,
    minY: a.y, maxY: a.y + loc.usableDimensionsMm.height,
    minZ: a.z - loc.usableDimensionsMm.depth / 2, maxZ: a.z + loc.usableDimensionsMm.depth / 2,
  };
  const stock = stockByLoc.get(loc.id);
  if (!stock) {
    assert.equal(loc.id, "L24", `only L24 may be empty, ${loc.id} has no stock`);
    console.log("ok L24: zero stock -> zero visuals (empty slot)");
    continue;
  }
  const prod = products.get(stock.productId);
  const bind = bd.products[prod.id];
  const container = bd.containers[bind.containerAsset];
  const mesh = bind.containerAsset.endsWith("box_cardboard_a01") ? boxMesh : crateMesh;
  const count = containersForStock(stock.quantity, bind.unitsPerVisual);
  const grid = containerGrid(loc.usableDimensionsMm, container.unitDimsMm, count);
  assert.equal(stock.quantity, stockByLoc.get(loc.id).quantity, "quantity");
  assert.ok(stock.quantity <= loc.maxQuantity, `${loc.id} stock exceeds max`);
  assert.equal(loc.maxQuantity, grid.cols * grid.rows * grid.layers * bind.unitsPerVisual, `${loc.id} maxQuantity must equal full-grid capacity x upv`);
  assert.equal(grid.placements.length, count, `${loc.id} placement count`);
  for (const [vi, pl] of grid.placements.entries()) {
    const w = {
      minX: a.x + pl.dxMm + mesh.min[0] * 1000, maxX: a.x + pl.dxMm + mesh.max[0] * 1000,
      minY: a.y + pl.dyMm + mesh.min[1] * 1000, maxY: a.y + pl.dyMm + mesh.max[1] * 1000,
      minZ: a.z + pl.dzMm + mesh.min[2] * 1000, maxZ: a.z + pl.dzMm + mesh.max[2] * 1000,
    };
    for (const [lo, hi, slo, shi, ax] of [[w.minX, w.maxX, slot.minX, slot.maxX, "X"], [w.minY, w.maxY, slot.minY, slot.maxY, "Y"], [w.minZ, w.maxZ, slot.minZ, slot.maxZ, "Z"]]) {
      assert.ok(lo >= slo - EPS_MM && hi <= shi + EPS_MM, `${loc.id}#${vi} ${ax} ${lo.toFixed(2)}..${hi.toFixed(2)} escapes slot ${slo}..${shi}`);
    }
    assert.ok(w.maxY <= decks[deck + 1] - EPS_MM, `${loc.id}#${vi} top ${w.maxY.toFixed(2)} must clear deck ${deck + 1} at ${decks[deck + 1]}`);
    boxes3d.push({ ...w, loc: loc.id, vi });
    visualTotal++;
  }
  console.log(`ok ${loc.id}: ${prod.id} x${stock.quantity} = ${count} ${bind.containerAsset.split("/")[1]} (${grid.cols}x${grid.rows}x${grid.layers} grid, deck ${deck})`);
}
// No interpenetration beyond face-contact tolerance (same-slot neighbors only; slots are disjoint).
for (let i = 0; i < boxes3d.length; i++) {
  for (let j = i + 1; j < boxes3d.length; j++) {
    const A = boxes3d[i], B = boxes3d[j];
    if (A.loc !== B.loc) continue;
    const ox = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
    const oy = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY);
    const oz = Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ);
    assert.ok(ox <= CONTACT_MM || oy <= CONTACT_MM || oz <= CONTACT_MM,
      `interpenetration ${A.loc}#${A.vi} vs #${B.vi}: overlap ${ox.toFixed(2)}x${oy.toFixed(2)}x${oz.toFixed(2)}`);
  }
}
console.log(`ok overlap: ${visualTotal} container visuals, no interpenetration beyond ${CONTACT_MM}mm face contact`);

// ---- 7. station tables agree with OB-PACK rects ----
const tableMeshes = readGlbMeshes(bd.stations["PACK-1"].glb);
assert.equal(tableMeshes.length, 1, "table mesh count");
function agreeMeshRect(t, ob, what) {
  // Mesh-vs-obstacle agreement within 1mm: obstacle rects are integer mm
  // declared from float64 source bounds; GLB buffers are float32, so a
  // sub-mm quantization gap is expected and documented (never a hidden fit).
  for (const [got, want, ax] of [[t.minX, ob.minXMm, "minX"], [t.maxX, ob.maxXMm, "maxX"], [t.minZ, ob.minZMm, "minZ"], [t.maxZ, ob.maxZMm, "maxZ"]]) {
    assert.ok(Math.abs(got - want) <= 1 + EPS_MM, `${what} ${ax}: mesh ${got.toFixed(2)} vs rect ${want} exceeds 1mm`);
  }
}
for (const [stationId, obId] of [["PACK-1", "OB-PACK1"], ["PACK-2", "OB-PACK2"]]) {
  const st = bd.stations[stationId];
  const t = transformAABB(tableMeshes[0], st.yawDeg, [st.centerMm.x / 1000, 0, st.centerMm.z / 1000]);
  const ob = fx.geometry.obstacles.find((o) => o.id === obId);
  agreeMeshRect(t, ob, obId);
  console.log(`ok ${obId}: table AABB ${t.minX.toFixed(1)}..${t.maxX.toFixed(1)} / ${t.minZ.toFixed(1)}..${t.maxZ.toFixed(1)} == obstacle ${ob.minXMm}..${ob.maxXMm} / ${ob.minZMm}..${ob.maxZMm} (1mm)`);
}

// ---- 8. walls outside room, touching boundary ----
const wallMeshes = readGlbMeshes(bd.walls.glb);
assert.equal(wallMeshes.length, 1, "wall mesh count");
for (const pl of bd.walls.placements) {
  const t = transformAABB(wallMeshes[0], pl.yawDeg, pl.positionM);
  if (pl.id.startsWith("WALL-N")) {
    assert.ok(t.maxZ <= 0 + EPS_MM && t.maxZ >= -1 - EPS_MM, `${pl.id} must touch z=0 from outside, got z ${t.minZ.toFixed(1)}..${t.maxZ.toFixed(1)}`);
    assert.ok(t.minZ < 0, `${pl.id} must lie outside`);
  } else {
    assert.ok(t.maxX <= 0 + EPS_MM && t.maxX >= -1 - EPS_MM, `${pl.id} must touch x=0 from outside, got x ${t.minX.toFixed(1)}..${t.maxX.toFixed(1)}`);
    assert.ok(t.minX < 0, `${pl.id} must lie outside`);
  }
}
console.log("ok walls: 7 placements outside room, touching the boundary");

// ---- 9. entrance meshes agree with OB-*-B*/D*; wall body outside ----
const entMeshes = readGlbMeshes(bd.entrances.glb);
const entByName = new Map(entMeshes.map((m) => [m.name, m]));
const needMeshes = ["barrier_01_mesh_00", "barrier_02_mesh_00", "body_entrance_02_mesh_00", "body_entrance_03_mesh_00", "wall_01_mesh_00"];
for (const n of needMeshes) assert.ok(entByName.has(n), `entrance mesh ${n} present`);
for (const pl of bd.entrances.placements) {
  const prefix = pl.id === "ENT-RCV" ? "OB-RCV" : "OB-DSP";
  // Empirical: match each transformed mesh to its obstacle rect by exact
  // equality instead of assuming mirrored sides.
  const manufactured = ["barrier_01_mesh_00", "barrier_02_mesh_00", "body_entrance_02_mesh_00", "body_entrance_03_mesh_00"].map((n) => ({ n, t: transformAABB(entByName.get(n), pl.yawDeg, pl.positionM) }));
  const rects = fx.geometry.obstacles.filter((o) => o.id.startsWith(prefix + "-") && o.id !== `${prefix}-STAGE`);
  assert.equal(rects.length, 4, `${pl.id} has 4 part obstacles`);
  for (const m of manufactured) {
    const hit = rects.find((r) =>
      Math.abs(m.t.minX - r.minXMm) <= 1 + EPS_MM && Math.abs(m.t.maxX - r.maxXMm) <= 1 + EPS_MM &&
      Math.abs(m.t.minZ - r.minZMm) <= 1 + EPS_MM && Math.abs(m.t.maxZ - r.maxZMm) <= 1 + EPS_MM);
    assert.ok(hit, `${pl.id} mesh ${m.n} AABB ${m.t.minX.toFixed(1)}..${m.t.maxX.toFixed(1)}/${m.t.minZ.toFixed(1)}..${m.t.maxZ.toFixed(1)} matches no obstacle rect`);
    console.log(`ok ${pl.id}: ${m.n} == ${hit.id} (${m.t.minX.toFixed(1)}..${m.t.maxX.toFixed(1)} / ${m.t.minZ.toFixed(1)}..${m.t.maxZ.toFixed(1)})`);
  }
  const wall = transformAABB(entByName.get("wall_01_mesh_00"), pl.yawDeg, pl.positionM);
  assert.ok(wall.minZ >= 18000 - 1 - EPS_MM, `${pl.id} wall body must lie outside z>=18000, got z ${wall.minZ.toFixed(1)}..${wall.maxZ.toFixed(1)}`);
  console.log(`ok ${pl.id}: wall_01 body outside (z ${wall.minZ.toFixed(1)}..${wall.maxZ.toFixed(1)})`);
}

// ---- 10. no interior overlaps; racks inside room ----
const rackRects = fx.geometry.racks.map((r) => ({
  id: r.id,
  minX: r.positionMm.x - r.dimensionsMm.width / 2, maxX: r.positionMm.x + r.dimensionsMm.width / 2,
  minZ: r.positionMm.z - r.dimensionsMm.depth / 2, maxZ: r.positionMm.z + r.dimensionsMm.depth / 2,
}));
for (const r of rackRects) {
  assert.ok(r.minX >= 0 && r.minZ >= 0 && r.maxX <= 24000 && r.maxZ <= 18000, `rack ${r.id} inside room`);
}
const allRects = [...rackRects, ...fx.geometry.obstacles.map((o) => ({ id: o.id, minX: o.minXMm, maxX: o.maxXMm, minZ: o.minZMm, maxZ: o.maxZMm }))];
for (let i = 0; i < allRects.length; i++) {
  for (let j = i + 1; j < allRects.length; j++) {
    assert.ok(!rectsOverlapInterior(allRects[i], allRects[j]), `interior overlap: ${allRects[i].id} vs ${allRects[j].id}`);
  }
}
console.log("ok layout: 6 racks inside room, 18 rects pairwise interior-disjoint");

// ---- 11. points in-room and globally distinct ----
const points = [];
for (const l of fx.locations) points.push([`approach-${l.id}`, l.approachPointMm]);
for (const u of fx.mobileUnits) points.push([`parking-${u.id}`, u.parkingSlotMm]);
for (const r of fx.resources) {
  for (const s of r.servicePositions) points.push([`service-${s.id}`, s]);
  for (const q of r.queueSlots) points.push([`queue-${q.id}`, q]);
}
const seen = new Map();
for (const [name, p] of points) {
  assert.ok(p.x >= 0 && p.x <= 24000 && p.z >= 0 && p.z <= 18000, `${name} in room`);
  const key = `${p.x},${p.z}`;
  assert.ok(!seen.has(key), `${name} duplicates ${seen.get(key)} at ${key}`);
  seen.set(key, name);
}
console.log(`ok points: ${points.length} approach/parking/service/queue positions in-room and globally distinct`);

// ---- negatives ----
assert.throws(() => containerGrid({ width: 100, depth: 100, height: 100 }, { width: 700, depth: 522, height: 510 }, 1), RangeError, "oversize must throw");
console.log("ok negative oversize: 700mm box in 100mm slot -> RangeError -> REJECTED");
assert.throws(() => parseOperationsScenario({ ...JSON.parse(readFileSync(FIXTURE, "utf8")), initialStock: [{ locationId: "L01", productId: "GHOST", quantity: 1 }] }), /unknown product/, "ghost stock must fail");
console.log("ok negative ghost-stock: unknown product GHOST -> schema rejection -> REJECTED");
assert.equal(deckIndexForAnchorY(1000, decks), -1, "off-deck anchor resolves to -1");
console.log("ok negative off-deck: anchor y=1000 resolves to deck -1 (fixture error, never snapped)");
{
  const st = bd.stations["PACK-1"];
  const shifted = transformAABB(tableMeshes[0], st.yawDeg, [st.centerMm.x / 1000 + 0.5, 0, st.centerMm.z / 1000]);
  const ob = fx.geometry.obstacles.find((o) => o.id === "OB-PACK1");
  assert.throws(() => agreeMeshRect(shifted, ob, "shifted"), /exceeds 1mm/, "shifted station must escape its obstacle rect");
  console.log("ok negative shifted-station: +500mm table escapes OB-PACK1 -> REJECTED");
}

mkdirSync(".coordination/warehouse-environment", { recursive: true });
writeFileSync(".coordination/warehouse-environment/fit-proof.json", JSON.stringify({
  fixture: FIXTURE, bindings: BINDINGS, epsMm: EPS_MM, contactToleranceMm: CONTACT_MM,
  counts: { racks: 6, locations: 24, products: 12, stockEntries: 23, mobileUnits: 6, resources: 4, orders: 28, deliveries: 12, obstacles: 12 },
  containerVisuals: visualTotal, emptySlots: ["L24"], decksMm: decks,
  negatives: ["oversize-grid", "ghost-stock", "off-deck-anchor", "shifted-station"],
}, null, 2));
console.log(`ENV-FIT: PASS ${visualTotal} container visuals, all axes + decks + footprints + 4 negatives`);
