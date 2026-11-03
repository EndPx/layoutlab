// Cargo-C2 fit proof: centered luggage-platform cart + 2 W1 crate docks +
// universal 4-cell carry. DATA-DRIVEN: placements come from the carry packet
// (assets/cargo/carry-luggage-platform-a01.json), SKU dims/costs from the
// canonical main fixture, and order demands from the canonical burst fixture.
// The proof scans REAL GLB POSITION buffers (never authored min/max) and the
// actual GLB triangles, and asserts:
//   1. cart/crate bounds == packet within 1mm; mesh/triangle counts exact;
//   2. 25 vertical rays through ACTUAL cart triangles hit the deck plane
//      within 1 micron of the packet deckTopYM (deck witness, not maxY/AABB);
//   3. no cart triangle intrudes into either crate-bottom slab (scanned
//      vertices above deck+1mm plus deck-plane edge crossings inside the
//      crate XZ rects must both be zero);
//   4. each docked crate bottom rests exactly on the deck plane, its full XZ
//      rect sits inside the flat deck rect (zero overhang), clears both
//      measured end-frame zones, and the two crates keep POSITIVE separation
//      (~1.07mm gap; no penetration, no tolerance waiver);
//   5. the WHOLE normalized cart+cargo union (single +41.02388mm Z shift, no
//      scale, no independent shifts) stays inside centered 680x1220 (r799);
//   6. two fixed 220x320x160 cells fit the measured crate interior; EVERY
//      canonical SKU (cost 1) fits a cell at cargo yaw90; all 6 canonical
//      burst demands (exact-match guarded, never edited to pass) allocate
//      into <=4 cells; capacity arithmetic is 2 crates x 2 cells = 4u;
//   7. negatives: oversize/over-height/unsupported-cost items rejected, 8x
//      largest-SKU load rejected (4-cell overflow), deck-overhang and
//      frame-colliding crates rejected.
// Exit 0 only if all pass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PACKET = "assets/cargo/carry-luggage-platform-a01.json";
const MAIN_FIXTURE = "fixtures/operations/main-warehouse.json";
const BURST_FIXTURE = "fixtures/operations/picking-packing-burst.json";
const packet = JSON.parse(readFileSync(PACKET, "utf8"));
const CART_GLB = packet.source.glb;
const CRATE_GLB = packet.crate.glb;
const EPS = 0.001; // 1mm geometric tolerance
const MICRON = 0.000001; // 1 micron deck-plane band

assert.equal(packet.packetVersion, "layoutlab.cargo-carry/1", "carry packet version");
assert.equal(packet.model, "cargo-c2-centered680x1220", "carry packet model");

function readSoup(path) {
  const b = readFileSync(path);
  assert.equal(b.readUInt32LE(0), 0x46546c67, path + " magic");
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString("utf8").replace(/\s+$/, ""));
  const binOff = 20 + jlen + 8;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const tris = [];
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      assert.equal(p.indices, undefined, path + ": soup must be non-indexed");
      const a = j.accessors[p.attributes.POSITION];
      const v = j.bufferViews[a.bufferView];
      for (let t = 0; t < a.count; t += 3) {
        const tri = [];
        for (let k = 0; k < 3; k++) {
          const i = t + k;
          const pt = [0, 1, 2].map((c) => {
            const val = b.readFloatLE(binOff + (v.byteOffset || 0) + (i * 3 + c) * 4);
            if (val < min[c]) min[c] = val;
            if (val > max[c]) max[c] = val;
            return val;
          });
          tri.push(pt);
        }
        tris.push(tri);
      }
    }
  }
  return { min, max, tris, meshes: j.meshes.length, count: tris.length };
}

const cart = readSoup(CART_GLB);
const crate = readSoup(CRATE_GLB);
console.log(`cart bounds x ${cart.min[0].toFixed(4)}..${cart.max[0].toFixed(4)} y ${cart.min[1].toFixed(4)}..${cart.max[1].toFixed(4)} z ${cart.min[2].toFixed(4)}..${cart.max[2].toFixed(4)} tris=${cart.count}`);
console.log(`crate bounds x ${crate.min[0].toFixed(4)}..${crate.max[0].toFixed(4)} y ${crate.min[1].toFixed(4)}..${crate.max[1].toFixed(4)} z ${crate.min[2].toFixed(4)}..${crate.max[2].toFixed(4)} tris=${crate.count}`);

// 1. Calibration vs packet (packet pins the independent Codex scan).
{
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(cart.min[k] - packet.sourceBoundsM.min[k]) <= EPS, `cart min[${k}] drift`);
    assert.ok(Math.abs(cart.max[k] - packet.sourceBoundsM.max[k]) <= EPS, `cart max[${k}] drift`);
    assert.ok(Math.abs(crate.min[k] - packet.crateBoundsM.min[k]) <= EPS, `crate min[${k}] drift`);
    assert.ok(Math.abs(crate.max[k] - packet.crateBoundsM.max[k]) <= EPS, `crate max[${k}] drift`);
  }
  assert.equal(cart.count, packet.source.triangles, "cart triangles");
  assert.equal(cart.meshes, packet.source.meshes, "cart meshes");
  assert.equal(crate.count, packet.crate.triangles, "crate triangles");
  assert.equal(crate.meshes, packet.crate.meshes, "crate meshes");
  const cz = (cart.min[2] + cart.max[2]) / 2;
  assert.ok(Math.abs(cz - -packet.normalizationM.z) <= 1e-9, "source centerZ must equal -normalizationZ");
  assert.ok(Math.abs((cart.max[2] - cart.min[2]) / 2 - packet.centeredZHalfM) <= 1e-9, "centered half-length");
  console.log("ok calibration: cart+crate bounds == packet within 1mm; 186990/60744 tris; centerZ -41.02388mm");
}

// 2. Deck witness: 25 vertical rays through ACTUAL cart triangles.
function rayDown(tris, ox, oz, fromY = 2.0) {
  let best = Infinity;
  for (const tri of tris) {
    const [ax, ay, az] = tri[0], [bx, by, bz] = tri[1], [cx, cy, cz] = tri[2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const px = -e2z, pz = e2x; // d=(0,-1,0) x e2
    const det = e1x * px + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - ax, ty = fromY - ay, tz = oz - az;
    const u = (tx * px + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qy = tz * e1x - tx * e1z;
    const v = -qy * inv;
    if (v < 0 || u + v > 1) continue;
    const qx = ty * e1z - tz * e1y, qz = tx * e1y - ty * e1x;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 0 && t < best) best = t;
  }
  return best === Infinity ? -1 : fromY - best;
}
{
  const xs = [-0.24, -0.12, 0, 0.12, 0.24];
  const zs = [-0.40, -0.20, 0, 0.20, 0.40];
  let lo = Infinity, hi = -Infinity;
  for (const x of xs) for (const z of zs) {
    const y = rayDown(cart.tris, x, z);
    assert.ok(y > 0, `deck ray (${x},${z}) missed the cart`);
    assert.ok(Math.abs(y - packet.deckTopYM) <= MICRON, `deck ray (${x},${z}) hit ${(y * 1000).toFixed(5)}mm, not deck`);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  console.log(`ok deck witness: 25/25 rays hit ${(lo * 1000).toFixed(5)}..${(hi * 1000).toFixed(5)}mm (packet ${(packet.deckTopYM * 1000).toFixed(4)}mm, 1um band)`);
}

// Docks in cart frame (packet-declared), shifted to unit frame by the single normalization.
const NORM_Z = packet.normalizationM.z;
assert.equal(packet.normalizationM.x, 0, "no X shift");
assert.equal(packet.normalizationM.y, 0, "no Y shift");
const crateMinY = crate.min[1];
assert.ok(Math.abs(crateMinY - packet.crateBoundsM.min[1]) <= 1e-9, "crateMinY stable");
for (const d of packet.docksCartM) {
  const expectY = packet.deckTopYM - crateMinY;
  assert.ok(Math.abs(d.crateOriginY - expectY) <= 1e-9, `dock ${d.id}: crateOriginY must equal deckTop-crateMinY`);
}
function crateWorldCart(dock) {
  return {
    min: [dock.x + crate.min[0], dock.crateOriginY + crate.min[1], dock.z + crate.min[2]],
    max: [dock.x + crate.max[0], dock.crateOriginY + crate.max[1], dock.z + crate.max[2]],
  };
}
const [dockA, dockB] = packet.docksCartM;

// 3. No cart-triangle intrusion into either crate-bottom slab.
{
  const rects = [crateWorldCart(dockA), crateWorldCart(dockB)];
  let vertsIn = 0, edgesIn = 0;
  for (const tri of cart.tris) {
    for (const pt of tri) {
      if (pt[1] <= packet.deckTopYM + 0.001) continue;
      for (const r of rects) {
        if (pt[0] >= r.min[0] && pt[0] <= r.max[0] && pt[2] >= r.min[2] && pt[2] <= r.max[2]) vertsIn++;
      }
    }
    for (let k = 0; k < 3; k++) {
      const p1 = tri[k], p2 = tri[(k + 1) % 3];
      const cross = (y1, y2) => (y1 <= packet.deckTopYM && y2 > packet.deckTopYM + 0.001) || (y2 <= packet.deckTopYM && y1 > packet.deckTopYM + 0.001);
      if (!cross(p1[1], p2[1])) continue;
      const f = (packet.deckTopYM - p1[1]) / (p2[1] - p1[1]);
      const xc = p1[0] + (p2[0] - p1[0]) * f, zc = p1[2] + (p2[2] - p1[2]) * f;
      for (const r of rects) {
        if (xc >= r.min[0] && xc <= r.max[0] && zc >= r.min[2] && zc <= r.max[2]) edgesIn++;
      }
    }
  }
  assert.equal(vertsIn, 0, "cart vertices above deck+1mm inside crate rects");
  assert.equal(edgesIn, 0, "cart deck-crossing edges inside crate rects");
  console.log("ok support: 0 above-deck vertices and 0 deck-crossing edges inside either crate XZ rect (clean flat support)");
}

// 4. Deck rest, flat-rect containment, measured frame clearance, positive dock gap.
{
  const R = packet.deckFlatRectCartM;
  for (const [dock, w] of [[dockA, crateWorldCart(dockA)], [dockB, crateWorldCart(dockB)]]) {
    assert.ok(Math.abs(w.min[1] - packet.deckTopYM) <= 1e-6, `dock ${dock.id}: bottom not exactly on deck`);
    assert.ok(w.min[0] >= R.minX - EPS && w.max[0] <= R.maxX + EPS, `dock ${dock.id}: X overhangs flat deck`);
    assert.ok(w.min[2] >= R.minZ - EPS && w.max[2] <= R.maxZ + EPS, `dock ${dock.id}: Z overhangs flat deck`);
    console.log(`ok dock ${dock.id}: bottom exactly on ${(packet.deckTopYM * 1000).toFixed(4)}mm deck, X ${(w.min[0] * 1000).toFixed(1)}..${(w.max[0] * 1000).toFixed(1)} in +/-310, Z ${(w.min[2] * 1000).toFixed(1)}..${(w.max[2] * 1000).toFixed(1)} in -565..+505`);
  }
  // Nearest above-deck structure (cart frame, scanned): low deck-edge rails
  // at +419.53 / -476.21 within |x|<=310 (the tall end frames stand farther
  // at +435.08 / -491.95). Both crates clear all of it; exact gaps below.
  let zPosMin = Infinity, zNegMax = -Infinity;
  for (const tri of cart.tris) for (const pt of tri) {
    if (pt[1] > packet.deckTopYM + 0.001 && Math.abs(pt[0]) <= 0.31) {
      if (pt[2] > 0 && pt[2] < zPosMin) zPosMin = pt[2];
      if (pt[2] < 0 && pt[2] > zNegMax) zNegMax = pt[2];
    }
  }
  const a = crateWorldCart(dockA), b = crateWorldCart(dockB);
  const gapA = zPosMin - a.max[2], gapB = b.min[2] - zNegMax;
  assert.ok(gapA > 0.005, `dock A end clearance ${(gapA * 1000).toFixed(2)}mm must stay contact-free (>5mm)`);
  assert.ok(gapB > 0.005, `dock B end clearance ${(gapB * 1000).toFixed(2)}mm must stay contact-free (>5mm)`);
  console.log(`ok frames: nearest above-deck structure +${(zPosMin * 1000).toFixed(2)}/${(zNegMax * 1000).toFixed(2)}mm; end clearances ${(gapA * 1000).toFixed(2)}/${(gapB * 1000).toFixed(2)}mm`);
  // Rigorous non-interpenetration: no cart triangle touches either crate
  // volume (XZ rect x [deck+0.5mm, crate top]; the 0.5mm floor excludes only
  // the expected resting contact plane, already proven clean above).
  function triTouchesAABB(tri, box) {
    const xs = tri.map((p) => p[0]), ys = tri.map((p) => p[1]), zs = tri.map((p) => p[2]);
    if (Math.max(...xs) < box.min[0] || Math.min(...xs) > box.max[0]) return false;
    if (Math.max(...ys) < box.min[1] || Math.min(...ys) > box.max[1]) return false;
    if (Math.max(...zs) < box.min[2] || Math.min(...zs) > box.max[2]) return false;
    // AABB overlap is already conclusive for intrusion here: any cart
    // triangle reaching into the crate volume above the contact plane is a
    // collision (crates are solid-walled shells, not wireframes).
    return true;
  }
  for (const [id, w] of [["A", a], ["B", b]]) {
    const box = { min: [w.min[0], packet.deckTopYM + 0.0005, w.min[2]], max: [w.max[0], w.max[1], w.max[2]] };
    let hits = 0;
    for (const tri of cart.tris) if (triTouchesAABB(tri, box)) hits++;
    assert.equal(hits, 0, `cart triangles intruding into crate ${id} volume`);
  }
  console.log("ok volumes: 0 cart triangles touch either crate volume above the resting contact plane");
  const gap = Math.min(a.min[2], b.min[2]) >= 0 ? 0 : a.min[2] - b.max[2];
  assert.ok(gap > 0, `dock seam must keep positive separation, got ${gap}`);
  console.log(`ok seam: positive gap ${(gap * 1000).toFixed(3)}mm (no penetration, no waiver)`);
}

// 5. Whole normalized union inside centered 680x1220 (r799).
{
  const P = packet.profile;
  assert.deepEqual({ width: P.width, length: P.length, margin: P.margin }, { width: 680, length: 1220, margin: 100 }, "packet profile");
  const r = Math.ceil(Math.hypot(P.width, P.length) / 2) + P.margin;
  assert.equal(r, 799, "profile radius");
  assert.equal(P.radius, 799, "packet radius");
  const placed = [crateWorldCart(dockA), crateWorldCart(dockB)];
  const uMinX = Math.min(cart.min[0], ...placed.map((p) => p.min[0]));
  const uMaxX = Math.max(cart.max[0], ...placed.map((p) => p.max[0]));
  const uMinZ = Math.min(cart.min[2], ...placed.map((p) => p.min[2])) + NORM_Z;
  const uMaxZ = Math.max(cart.max[2], ...placed.map((p) => p.max[2])) + NORM_Z;
  assert.ok(uMinX >= -P.width / 2000 - EPS && uMaxX <= P.width / 2000 + EPS, "loaded X exceeds 680");
  assert.ok(uMinZ >= -P.length / 2000 - EPS && uMaxZ <= P.length / 2000 + EPS, "loaded Z exceeds 1220");
  // Unit-frame dock centers in the packet must equal cart-frame + normalization.
  for (const [dc, du] of packet.docksCartM.map((d, i) => [d, packet.docksUnitM[i]])) {
    assert.ok(Math.abs(du.z - (dc.z + NORM_Z)) <= 1e-9, `unit dock ${du.id} must equal cart dock + normalization`);
  }
  console.log(`ok profile: normalized union X ${(uMinX * 1000).toFixed(1)}..${(uMaxX * 1000).toFixed(1)} in +/-340, Z ${(uMinZ * 1000).toFixed(1)}..${(uMaxZ * 1000).toFixed(1)} in +/-610 (r799)`);
}

// 6. Canonical cells/SKUs/orders/capacity. SKU dims + costs come from the
// canonical main fixture; demands come from the canonical burst fixture.
// Independent literals pin the exact demands (guard: never edit orders to
// pass) and the worst SKU.
const mainFixture = JSON.parse(readFileSync(MAIN_FIXTURE, "utf8"));
const burstFixture = JSON.parse(readFileSync(BURST_FIXTURE, "utf8"));
const EXPECTED_DEMANDS = {
  "B-01": [["P01", 2], ["P07", 1]],
  "B-02": [["P03", 2], ["P09", 2]],
  "B-03": [["P02", 1], ["P05", 2]],
  "B-04": [["P11", 2], ["P12", 1]],
  "B-05": [["P04", 2], ["P08", 1]],
  "B-06": [["P06", 2], ["P10", 1]],
};
{
  assert.equal(burstFixture.orderSchedule.length, 6, "burst holds exactly 6 orders");
  for (const o of burstFixture.orderSchedule) {
    const exp = EXPECTED_DEMANDS[o.id];
    assert.ok(exp, `unexpected burst order ${o.id}`);
    assert.deepEqual(o.lines.map((l) => [l.productId, l.quantity]), exp, `demand drift in ${o.id}: orders must never change to pass`);
  }
  console.log("ok demands: all 6 burst order lines exactly as canonical (B-01..B-06 unchanged)");
}
const skuOf = new Map(mainFixture.products.map((p) => [p.id, p]));
{
  // Interior sanity vs scanned outer: interior + walls fit the outer shell.
  const outerX = (crate.max[0] - crate.min[0]) * 1000;
  const outerZ = (crate.max[2] - crate.min[2]) * 1000;
  const outerH = (crate.max[1] - crate.min[1]) * 1000;
  const IN = packet.crateInteriorMm;
  assert.ok(IN.width < outerX && IN.depth < outerZ, "interior plan must fit outer shell");
  assert.ok(IN.floorTopY + (247) <= outerH + EPS * 1000, "interior stack must fit outer height");
  // Two cells fit the interior plan.
  const cells = packet.cellsCrateLocalMm;
  assert.equal(cells.length, 2, "two cells per crate");
  for (const c of cells) {
    assert.ok(c.x0 >= -IN.width / 2 - EPS * 1000 && c.x0 + c.w <= IN.width / 2 + EPS * 1000, `cell ${c.id} X inside interior`);
    assert.ok(c.z0 >= -IN.depth / 2 - EPS * 1000 && c.z0 + c.d <= IN.depth / 2 + EPS * 1000, `cell ${c.id} Z inside interior`);
    assert.ok(IN.floorTopY + c.h <= IN.rimY + EPS * 1000, `cell ${c.id} top below rim`);
  }
  assert.deepEqual([cells[0].w, cells[0].d, cells[0].h], [220, 320, 160], "cell envelope 220x320x160");
  console.log(`ok cells: 2x 220x320x160 within interior ${IN.width}x${IN.depth}x247 (outer ${outerX.toFixed(1)}x${outerZ.toFixed(1)}x${outerH.toFixed(1)})`);
}
function fitsCell(sku) {
  // Cargo yaw90: plan footprint X=itemD, Z=itemW.
  const dims = sku.itemDimensionsMm;
  return sku.capacityCostUnits === 1 && dims.depth <= 220 && dims.width <= 320 && dims.height <= 160;
}
{
  assert.equal(packet.cargoYawDeg, 90, "universal cargo yaw90");
  let worst = null;
  for (const p of mainFixture.products) {
    assert.ok(fitsCell(p), `SKU ${p.id} ${p.itemDimensionsMm.width}x${p.itemDimensionsMm.depth}x${p.itemDimensionsMm.height} cost ${p.capacityCostUnits} must fit a yaw90 cell`);
    const vol = p.itemDimensionsMm.width * p.itemDimensionsMm.depth * p.itemDimensionsMm.height;
    if (!worst || vol > worst.vol) worst = { id: p.id, vol };
  }
  // Independent literal: P05 is the worst (exact-fit) SKU.
  assert.equal(worst.id, "P05", "worst SKU must be P05");
  const p05 = skuOf.get("P05");
  assert.deepEqual(p05.itemDimensionsMm, { width: 320, depth: 220, height: 160 }, "P05 dims literal");
  console.log(`ok skus: all ${mainFixture.products.length} canonical SKUs (cost 1) fit a yaw90 cell; worst P05 320x220x160 exact-fits`);
}
function allocateCells(itemCount) {
  // One handling unit per fixed cell; 2 crates x 2 cells.
  return itemCount <= packet.capacityUnits ? { ok: true } : { ok: false, reason: `UNSUPPORTED: ${itemCount} units exceed 4 fixed cells` };
}
{
  let maxItems = 0;
  for (const o of burstFixture.orderSchedule) {
    const items = o.lines.reduce((n, l) => n + l.quantity, 0);
    const cost = o.lines.reduce((n, l) => n + l.quantity * (skuOf.get(l.productId)?.capacityCostUnits ?? 99), 0);
    assert.equal(cost, items, `${o.id}: all current products cost 1`);
    assert.ok(allocateCells(items).ok, `${o.id}: ${items} items must allocate into 4 cells`);
    maxItems = Math.max(maxItems, items);
    console.log(`ok load ${o.id}: ${items} items allocate into 4 fixed cells`);
  }
  assert.equal(packet.capacityUnits, 4, "capacity 4");
  assert.ok(maxItems <= 4, "burst max items within capacity");
  console.log(`ok capacity: 2 crates x 2 cells = 4u; burst orders <= ${maxItems}u preserved (conservative constructed capacity, no kg/vendor claim)`);
}

// 7. Negatives (each must FAIL its check).
{
  const overW = { itemDimensionsMm: { width: 321, depth: 220, height: 160 }, capacityCostUnits: 1 };
  assert.equal(fitsCell(overW), false, "321-wide item must not fit");
  console.log("ok negative oversize: 321x220x160 exceeds cell 220x320 plan at yaw90 -> REJECTED");
  const overH = { itemDimensionsMm: { width: 320, depth: 220, height: 161 }, capacityCostUnits: 1 };
  assert.equal(fitsCell(overH), false, "161-tall item must not fit");
  console.log("ok negative over-height: 320x220x161 exceeds cell 160 height -> REJECTED");
  const cost2 = { itemDimensionsMm: { width: 100, depth: 100, height: 100 }, capacityCostUnits: 2 };
  assert.equal(fitsCell(cost2), false, "cost-2 SKU must not ride a cost-1 cell");
  console.log("ok negative unsupported-cost: cost-2 unit has no single-cell grant -> REJECTED");
  assert.equal(allocateCells(8).ok, false, "8x largest SKU must overflow 4 cells");
  console.log("ok negative 8-largest-SKU: 8x P05 needs 8 cells, only 4 fixed -> REJECTED");
  const over = { id: "X", crateOriginY: dockA.crateOriginY, x: 0.05, z: dockA.z };
  const w = crateWorldCart(over);
  assert.ok(!(w.min[0] >= packet.deckFlatRectCartM.minX - EPS && w.max[0] <= packet.deckFlatRectCartM.maxX + EPS), "deck overhang must be rejected");
  console.log(`ok negative overhang: crate X ${(w.min[0] * 1000).toFixed(1)}..${(w.max[0] * 1000).toFixed(1)} vs deck +/-310 -> REJECTED`);
  const into = { id: "X", crateOriginY: dockA.crateOriginY, x: 0, z: 0.35 };
  const f = crateWorldCart(into);
  assert.ok(f.max[2] > 0.43508 - EPS, "frame collision must be detected");
  console.log(`ok negative frame: crate max z ${(f.max[2] * 1000).toFixed(1)} enters measured frame zone >= 435.08 -> REJECTED`);
}
console.log("CARGO-FIT-C2: PASS deck rays + support + docks/gap + profile + canonical 12-SKU/6-order/4u + 6 negatives");
