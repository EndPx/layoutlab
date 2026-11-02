// W1 navigation proof: clearance-aware PACK->L1 path with parked-cart occupancy.
//
// Probe-only adapter over UNMODIFIED core helpers (no core/schema edits, no
// traffic engine): the parked cart's ACTUAL transformed GLB footprint is added
// as an inflated static obstacle to a copied NavContext, then the canonical
// PACK (3000,3000) -> L1 pick (2900,1500) path is evaluated with
// shortestPathPointsMm and every swept segment is verified against ALL
// in-area blocking geometry (inflated R1 + inflated parked cart).
// The scenario is BOUND to data, not hardcoded: room + racks come from the
// W1 fixture (displayed geometry), the moving profile (cart + margin +
// minimum passage) comes from the canonical warehouse-basic scenario, and
// every bound value is separately asserted against its preserved literal so
// drift in either source fails loudly instead of passing against stale
// geometry. Navigation radius 700mm follows from cart 600x800+100 / passage
// 1400 via the unmodified core helper.
// Negative 1 re-runs the proof with the cart at its OLD bay (2900,2300) and
// must FAIL. Negative 2 moves R1 into the corridor and must FAIL, proving a
// changed in-area obstacle cannot be ignored by the proof.
// Exit 0 only if the shipped bay passes and both negatives fail as specified.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  buildNavContext,
  createNavBudget,
  inflateRect,
  pointInRect,
  segmentBlocked,
  shortestPathMm,
  shortestPathPointsMm,
} from "@layoutlab/core";

const FIXTURE = "experiments/warehouse-section/fixture.json";
const CANONICAL = "fixtures/sample/warehouse-basic.json";
const CART_GLB = "apps/web/public/assets/warehouse-section/handTruck_convertible_steel_orange_a01.glb";
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
const canonical = JSON.parse(readFileSync(CANONICAL, "utf8"));

// Bound scenario: displayed room/racks from the W1 fixture, moving profile
// from the canonical scenario. Both sources are read-only inputs here.
const scenario = {
  room: fixture.room,
  racks: fixture.racks,
  cart: canonical.cart,
  minimumPassageWidthMm: canonical.minimumPassageWidthMm,
};
// Preserved literals asserted separately: any drift in the bound data fails
// here with the expected value named, instead of silently proving old geometry.
assert.deepEqual(scenario.room, { widthMm: 6000, depthMm: 6000 }, "fixture room drifted from preserved 6000x6000");
assert.deepEqual(
  scenario.racks,
  [{ id: "R1", positionMm: { x: 1300, z: 1500 }, dimensionsMm: { width: 1600, depth: 800, height: 2000 }, visualAsset: "rack_large_empty_a02", yawDeg: 0 }],
  "fixture racks drifted from preserved R1",
);
assert.deepEqual(scenario.cart, { widthMm: 600, lengthMm: 800, marginMm: 100 },
  "canonical moving profile drifted from preserved cart 600x800+margin100");
assert.equal(scenario.minimumPassageWidthMm, 1400, "canonical passage drifted from preserved 1400mm");
const PACK = { x: 3000, z: 3000 };
const L1PICK = { x: 2900, z: 1500 };
assert.deepEqual(fixture.packingPointMm, PACK, "packing endpoint must stay canonical");
assert.deepEqual(fixture.locations.find((l) => l.id === "L1").pickPointMm, L1PICK, "L1 pick must stay canonical");

function cartFootprint(park) {
  const b = readFileSync(CART_GLB);
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString("utf8").replace(/\s+$/, ""));
  const binOff = 20 + jlen + 8;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      const a = j.accessors[p.attributes.POSITION];
      const v = j.bufferViews[a.bufferView];
      for (let i = 0; i < a.count; i++) {
        const x = b.readFloatLE(binOff + (v.byteOffset || 0) + (i * 3) * 4);
        const z = b.readFloatLE(binOff + (v.byteOffset || 0) + (i * 3 + 2) * 4);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  return {
    minX: park.x + minX * 1000, maxX: park.x + maxX * 1000,
    minZ: park.z + minZ * 1000, maxZ: park.z + maxZ * 1000,
  };
}

function prove(scn, park, label) {
  const base = buildNavContext(scn);
  const cart = cartFootprint(park);
  const inflatedCart = inflateRect(cart, base.navigationRadiusMm);
  // Probe-only occupancy adapter: copied context, core untouched.
  const nav = { ...base, inflatedObstacles: [...base.inflatedObstacles, inflatedCart] };
  const pts = shortestPathPointsMm(PACK, L1PICK, scn, nav, createNavBudget());
  const dist = pts === null ? null : shortestPathMm(PACK, L1PICK, scn, nav, createNavBudget());
  let sweptOk = pts !== null;
  let insideActual = [];
  if (pts !== null) {
    for (let i = 0; i + 1 < pts.length && sweptOk; i++) {
      if (segmentBlocked(pts[i], pts[i + 1], nav.inflatedObstacles)) sweptOk = false;
    }
    insideActual = pts.filter((p) => pointInRect(p, cart));
  }
  return { label, park, navRadiusMm: base.navigationRadiusMm, cart, inflatedCart, points: pts, distMm: dist, sweptOk, insideActual };
}

// ---- positive: shipped parking bay must yield a valid swept path ----
const bay = fixture.cart.parkMm;
const good = prove(scenario, bay, "shipped-bay");
assert.ok(good.points !== null, `no PACK->L1 path with cart at (${bay.x},${bay.z})`);
assert.ok(good.sweptOk, `swept segments hit inflated obstacles with cart at (${bay.x},${bay.z})`);
assert.equal(good.insideActual.length, 0, `centerline points inside actual cart footprint: ${JSON.stringify(good.insideActual)}`);
// Parking bay must actually contain the visible footprint.
const bayRect = fixture.cart.parkingBayMm;
assert.ok(good.cart.minX >= bayRect.minX && good.cart.maxX <= bayRect.maxX &&
  good.cart.minZ >= bayRect.minZ && good.cart.maxZ <= bayRect.maxZ,
  `cart footprint ${JSON.stringify(good.cart)} escapes declared bay ${JSON.stringify(bayRect)}`);
console.log(`ok nav ${good.points.length} points, ${good.distMm}mm, swept ${good.points.length - 1} segments avoid R1 + cart`);
console.log(`ok cart actual footprint X ${good.cart.minX.toFixed(1)}..${good.cart.maxX.toFixed(1)} Z ${good.cart.minZ.toFixed(1)}..${good.cart.maxZ.toFixed(1)} inside bay`);
console.log(`ok inflated cart X ${good.inflatedCart.minX.toFixed(1)}..${good.inflatedCart.maxX.toFixed(1)} Z ${good.inflatedCart.minZ.toFixed(1)}..${good.inflatedCart.maxZ.toFixed(1)} (radius ${good.navRadiusMm}mm: cart 600x800+100, passage 1400)`);

// ---- negative 1: old bay must FAIL the same proof ----
const bad = prove(scenario, { x: 2900, z: 2300 }, "old-bay");
const badFails = bad.points === null || !bad.sweptOk || bad.insideActual.length > 0;
assert.ok(badFails, "negative FAILED: old cart bay (2900,2300) must not pass the occupancy proof");
console.log(`ok negative old-bay: ${bad.points === null ? "no path" : `${bad.insideActual.length} centerline points inside cart, sweptOk=${bad.sweptOk}`} -> REJECTED`);

// ---- negative 2: a moved in-area rack must not be ignorable ----
// R1 shifted into the PACK->L1 corridor must FAIL the same proof; a proof
// still bound to stale/hardcoded geometry would wrongly PASS here.
const movedRack = JSON.parse(JSON.stringify(scenario));
movedRack.racks[0].positionMm = { x: 3000, z: 2300 };
const blocked = prove(movedRack, bay, "moved-rack");
const blockedFails = blocked.points === null || !blocked.sweptOk || blocked.insideActual.length > 0;
assert.ok(blockedFails, "negative FAILED: R1 moved into the corridor (3000,2300) must not pass the proof");
console.log(`ok negative moved-rack: ${blocked.points === null ? "no path" : `${blocked.insideActual.length} centerline points inside cart, sweptOk=${blocked.sweptOk}`} -> REJECTED`);

mkdirSync(".coordination/warehouse-section", { recursive: true });
writeFileSync(".coordination/warehouse-section/nav-proof.json", JSON.stringify({
  method: "probe-only occupancy adapter over unmodified core helpers; swept segments (not just endpoints) verified",
  boundSources: { roomRacks: FIXTURE, movingProfile: CANONICAL },
  assertedLiterals: {
    roomMm: "6000x6000", racks: "R1 (1300,1500) 1600x800x2000 yaw0 rack_large_empty_a02",
    cartMm: "600x800+margin100", minimumPassageWidthMm: 1400,
    packMm: PACK, l1PickMm: L1PICK, navigationRadiusMm: good.navRadiusMm,
  },
  shipped: { park: good.park, points: good.points.length, distMm: good.distMm, cart: good.cart },
  oldBayRejected: { park: bad.park, points: bad.points === null ? null : bad.points.length, insideActual: bad.insideActual },
  movedRackRejected: { rack: movedRack.racks[0].positionMm, points: blocked.points === null ? null : blocked.points.length },
  note: "Static diagnostic proof for one representative section, not multi-agent safety validation.",
}, null, 2));
console.log("W1-NAV: PASS clearance-aware PACK->L1 path avoids actual parked occupancy + 2 negatives");
