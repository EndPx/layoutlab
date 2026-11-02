// Main-environment navigation proof: reachability with full obstacle set.
//
// Probe-only adapter over UNMODIFIED core helpers (W1 pattern, no core or
// schema edits): fixture racks + all 12 obstacle rects + the ACTUAL
// transformed handtruck footprints at the 6 parking slots are inflated by
// the declared moving radius and checked with shortestPathPointsMm.
// The operations schema declares no minimumPassageWidthMm, so the moving
// radius is cart-derived only: max over units of
// ceil(hypot(width,length)/2)+margin = 600mm for the 600x800+100 profile.
// Asserts:
//   1. every approach/service/queue/parking point is navigable;
//   2. every parking slot reaches every approach, service, and queue point
//      (228 paths); every swept segment avoids ALL inflated rects and no
//      centerline point enters any ACTUAL rect;
//   3. declared 600x800+100 footprints conservatively enclose the actual
//      501x481 cart; parked footprints are in-room and disjoint from racks,
//      obstacles, and each other.
// Negatives prove a shifted obstacle covering a service point, an oversize
// obstacle covering an approach, and a ghost point inside a rack are all
// rejected. Static reachability only, not multi-agent safety validation.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseOperationsScenario } from "@layoutlab/simulation";
import {
  buildNavContext,
  cartRadiusMm,
  createNavBudget,
  inflateRect,
  pointInRect,
  pointNavigable,
  rectsOverlapInterior,
  segmentBlocked,
  shortestPathPointsMm,
} from "@layoutlab/core";

const FIXTURE = "fixtures/operations/main-warehouse.json";
const CART_GLB = "apps/web/public/assets/warehouse-section/handTruck_convertible_steel_orange_a01.glb";
const fx = parseOperationsScenario(JSON.parse(readFileSync(FIXTURE, "utf8")));

// Moving profile bound to the fixture: every unit declares 600x800+100.
for (const u of fx.mobileUnits) {
  assert.deepEqual(u.footprintMm, { width: 600, length: 800, margin: 100 }, `unit ${u.id} profile`);
}
const NAV_R = cartRadiusMm({ widthMm: 600, lengthMm: 800 }) + 100;
assert.equal(NAV_R, 600, "navigation radius 600mm from 600x800+100");

// Legacy-shaped scenario for core nav: operations racks are axis-aligned,
// which is exactly yawDeg 0 under the core footprint convention.
const scenario = {
  room: { widthMm: fx.geometry.room.widthMm, depthMm: fx.geometry.room.depthMm },
  racks: fx.geometry.racks.map((r) => ({ id: r.id, positionMm: r.positionMm, dimensionsMm: r.dimensionsMm, yawDeg: 0 })),
  cart: { widthMm: 600, lengthMm: 800, marginMm: 100 },
  minimumPassageWidthMm: 1200, // ceil(1200/2)=600: keeps buildNavContext consistent with NAV_R; asserted below.
};
assert.deepEqual(scenario.room, { widthMm: 24000, depthMm: 18000 }, "room");
const base = buildNavContext(scenario);
assert.equal(base.navigationRadiusMm, NAV_R, "nav context radius");
assert.equal(base.cartRadiusMm, 500, "cart radius 500mm");
assert.deepEqual({ cols: base.cols, rows: base.rows }, { cols: 240, rows: 180 }, "grid 240x180");

// Actual parked footprints from REAL GLB POSITION buffers at yaw 0.
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

const rackRects = scenario.racks.map((r) => {
  const w = r.dimensionsMm.width / 2, d = r.dimensionsMm.depth / 2;
  return { id: r.id, minX: r.positionMm.x - w, maxX: r.positionMm.x + w, minZ: r.positionMm.z - d, maxZ: r.positionMm.z + d };
});
const obstacleRects = fx.geometry.obstacles.map((o) => ({ id: o.id, minX: o.minXMm, maxX: o.maxXMm, minZ: o.minZMm, maxZ: o.maxZMm }));
const parked = fx.mobileUnits.map((u) => ({ id: `parked-${u.id}`, ...cartFootprint(u.parkingSlotMm) }));

// Declared footprints conservatively enclose the actual cart: 501x481 actual
// vs 600x800 declared (before the +100 margin and 600 radius are applied).
{
  const p0 = parked[0];
  const aw = p0.maxX - p0.minX, ad = p0.maxZ - p0.minZ;
  assert.ok(aw <= 600 && ad <= 800, `actual cart ${aw.toFixed(1)}x${ad.toFixed(1)} must fit declared 600x800`);
  console.log(`ok cart profile: actual ${aw.toFixed(1)}x${ad.toFixed(1)} enclosed by declared 600x800+100 (radius ${NAV_R})`);
  for (const p of parked) {
    assert.ok(p.minX >= 0 && p.minZ >= 0 && p.maxX <= 24000 && p.maxZ <= 18000, `${p.id} in room`);
    for (const r of [...rackRects, ...obstacleRects]) {
      assert.ok(!rectsOverlapInterior(p, r), `${p.id} overlaps ${r.id}`);
    }
  }
  for (let i = 0; i < parked.length; i++) {
    for (let j = i + 1; j < parked.length; j++) {
      assert.ok(!rectsOverlapInterior(parked[i], parked[j]), `${parked[i].id} overlaps ${parked[j].id}`);
    }
  }
  console.log("ok parked: 6 actual footprints in-room, disjoint from racks/obstacles/each other");
}

const actualAll = [...rackRects, ...obstacleRects, ...parked];
const nav = { ...base, inflatedObstacles: [...base.inflatedObstacles, ...obstacleRects.map((r) => inflateRect(r, NAV_R)), ...parked.map((r) => inflateRect(r, NAV_R))] };
assert.equal(nav.inflatedObstacles.length, 6 + 12 + 6, "inflated set: 6 racks + 12 obstacles + 6 parked");

// A unit never collides with its own parked footprint: per-start contexts
// exclude the starting unit's rect while keeping the other five parked
// units as stationary occupancies. Goals never include parking slots.
function navFor(unitId) {
  const others = parked.filter((p) => p.id !== `parked-${unitId}`).map((r) => inflateRect(r, NAV_R));
  return { ...base, inflatedObstacles: [...base.inflatedObstacles, ...obstacleRects.map((r) => inflateRect(r, NAV_R)), ...others] };
}
function actualFor(unitId) {
  return actualAll.filter((r) => r.id !== `parked-${unitId}`);
}

const points = [];
for (const l of fx.locations) points.push([`approach-${l.id}`, l.approachPointMm, null]);
for (const u of fx.mobileUnits) points.push([`parking-${u.id}`, u.parkingSlotMm, u.id]);
for (const r of fx.resources) {
  for (const s of r.servicePositions) points.push([`service-${s.id}`, s, null]);
  for (const q of r.queueSlots) points.push([`queue-${q.id}`, q, null]);
}
for (const [name, p, own] of points) {
  const n = own ? navFor(own) : nav;
  assert.ok(pointNavigable(p, scenario, n), `${name} (${p.x},${p.z}) must be navigable`);
}
console.log(`ok navigable: all ${points.length} approach/parking/service/queue points (radius ${NAV_R}; own-cart excluded at starts)`);

const starts = fx.mobileUnits.map((u) => [u.id, `parking-${u.id}`, u.parkingSlotMm]);
const goals = [...fx.locations.map((l) => [`approach-${l.id}`, l.approachPointMm])];
for (const r of fx.resources) {
  for (const s of r.servicePositions) goals.push([`service-${s.id}`, s]);
  for (const q of r.queueSlots) goals.push([`queue-${q.id}`, q]);
}
let pathCount = 0, segTotal = 0, ptTotal = 0;
for (const [uid, sname, s] of starts) {
  const n = navFor(uid);
  const actual = actualFor(uid);
  for (const [gname, g] of goals) {
    const pts = shortestPathPointsMm(s, g, scenario, n, createNavBudget());
    assert.ok(pts !== null, `no path ${sname} -> ${gname}`);
    for (let i = 0; i + 1 < pts.length; i++) {
      assert.ok(!segmentBlocked(pts[i], pts[i + 1], n.inflatedObstacles), `swept segment hits inflated obstacle on ${sname} -> ${gname}`);
    }
    for (const p of pts) {
      assert.ok(!actual.some((r) => pointInRect(p, r)), `centerline point inside actual rect on ${sname} -> ${gname}`);
    }
    pathCount++;
    segTotal += pts.length - 1;
    ptTotal += pts.length;
  }
}
console.log(`ok reachability: ${pathCount} paths (${starts.length} starts x ${goals.length} goals), ${segTotal} swept segments avoid all inflated rects, ${ptTotal} centerline points avoid all actual rects`);

// ---- negatives ----
{
  // 1. Shifted obstacle covering PACK1-S1: the service point must fail navigability.
  const shifted = obstacleRects.map((r) => (r.id === "OB-PACK1" ? { ...r, minX: 19900, maxX: 21100, minZ: 6300, maxZ: 7500 } : r));
  const navBad = { ...base, inflatedObstacles: [...base.inflatedObstacles, ...shifted.map((r) => inflateRect(r, NAV_R)), ...parked.map((r) => inflateRect(r, NAV_R))] };
  const s1 = fx.resources.find((r) => r.id === "PACK-1").servicePositions[0];
  assert.ok(!pointNavigable(s1, scenario, navBad), "negative FAILED: PACK1-S1 under a shifted obstacle must not be navigable");
  console.log("ok negative shifted-obstacle: PACK1-S1 covered -> NOT navigable -> REJECTED");
  // 2. Oversize obstacle covering an approach: the approach must fail.
  const grown = obstacleRects.map((r) => (r.id === "OB-RCV-STAGE" ? { ...r, minX: 2000, maxX: 6000, minZ: 13000, maxZ: 17200 } : r));
  const navGrown = { ...base, inflatedObstacles: [...base.inflatedObstacles, ...grown.map((r) => inflateRect(r, NAV_R)), ...parked.map((r) => inflateRect(r, NAV_R))] };
  const l14 = fx.locations.find((l) => l.id === "L14").approachPointMm;
  assert.ok(!pointNavigable(l14, scenario, navGrown), "negative FAILED: L14 approach under an oversize obstacle must not be navigable");
  console.log("ok negative oversize-obstacle: L14 approach covered -> NOT navigable -> REJECTED");
  // 3. Ghost point inside rack R1: never navigable.
  assert.ok(!pointNavigable({ x: 4000, z: 6000 }, scenario, nav), "negative FAILED: ghost point inside R1 must not be navigable");
  console.log("ok negative ghost-point: (4000,6000) inside R1 -> NOT navigable -> REJECTED");
}

mkdirSync(".coordination/warehouse-environment", { recursive: true });
writeFileSync(".coordination/warehouse-environment/nav-proof.json", JSON.stringify({
  method: "probe-only occupancy adapter over unmodified core helpers; swept segments (not just endpoints) verified",
  fixture: FIXTURE,
  assertedLiterals: { roomMm: "24000x18000", cartMm: "600x800+margin100", navigationRadiusMm: NAV_R, gridCols: 240, gridRows: 180, inflatedRects: nav.inflatedObstacles.length },
  paths: pathCount, sweptSegments: segTotal, centerlinePoints: ptTotal,
  negatives: ["shifted-obstacle", "oversize-obstacle", "ghost-point"],
  note: "Static reachability proof for the main environment, not multi-agent safety validation.",
}, null, 2));
console.log(`ENV-NAV: PASS ${pathCount} swept paths + 3 negatives (radius ${NAV_R}mm)`);
