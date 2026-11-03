// Warehouse-environment navigation proof (cargo-C2): every parking slot
// reaches every approach/service/queue goal (6x38=228 A* routes) under the
// ACTUAL fixture profile and the ACTUAL integrated cart geometry with the
// SAME occupancy model as the planner: stationary others as declared
// circumscribed-disc squares (never physical rects without margin).
// Profile/radius/cart/normalization come from the canonical fixture and the
// carry packet, not hardcoded literals. Also asserts the declared footprint
// conservatively encloses the normalized actual cart, and that actual parked
// rects are disjoint from racks/obstacles/each other (physical truth).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createTransportNav,
  footprintRadiusMm,
  occupancyRectFor,
  parseOperationsScenario,
} from "../packages/simulation/dist/index.js";

const FIXTURE = "fixtures/operations/main-warehouse.json";
const PACKET_PATH = "assets/cargo/carry-luggage-platform-a01.json";
const packet = JSON.parse(readFileSync(PACKET_PATH, "utf8"));
assert.equal(packet.model, "cargo-c2-centered680x1220", "carry packet model");
const scenario = parseOperationsScenario(JSON.parse(readFileSync(FIXTURE, "utf8")));

// Actual profile from the fixture; every unit shares it and it equals the packet.
const profiles = new Map(scenario.mobileUnits.map((u) => [u.id, u.footprintMm]));
assert.ok(profiles.size === scenario.mobileUnits.length, "profile per unit");
for (const [id, fp] of profiles) {
  assert.deepEqual(
    { width: fp.width, length: fp.length, margin: fp.margin },
    { width: packet.profile.width, length: packet.profile.length, margin: packet.profile.margin },
    `unit ${id} footprint must equal the carry packet profile`,
  );
}
const NAV_R = footprintRadiusMm(scenario.mobileUnits[0].footprintMm);
assert.equal(NAV_R, packet.profile.radius, "fixture radius must equal packet radius");
console.log(`profile: centered ${packet.profile.width}x${packet.profile.length}+${packet.profile.margin} r${NAV_R} from fixture == carry packet`);

// Actual cart geometry from the packet GLB (same POSITION scan as cargo fit).
function readBounds(path) {
  const b = readFileSync(path);
  assert.equal(b.readUInt32LE(0), 0x46546c67, "magic");
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jlen).toString("utf8").replace(/\s+$/, ""));
  const binOff = 20 + jlen + 8;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      const a = j.accessors[p.attributes.POSITION];
      const v = j.bufferViews[a.bufferView];
      for (let i = 0; i < a.count; i++) {
        for (let c = 0; c < 3; c++) {
          const val = b.readFloatLE(binOff + (v.byteOffset || 0) + (i * 3 + c) * 4);
          if (val < min[c]) min[c] = val;
          if (val > max[c]) max[c] = val;
        }
      }
    }
  }
  return { min, max };
}
const cart = readBounds(packet.source.glb);
for (let k = 0; k < 3; k++) {
  assert.ok(Math.abs(cart.min[k] - packet.sourceBoundsM.min[k]) <= 0.001, `cart min[${k}] drift`);
  assert.ok(Math.abs(cart.max[k] - packet.sourceBoundsM.max[k]) <= 0.001, `cart max[${k}] drift`);
}
// Declared 680x1220 footprint conservatively encloses the NORMALIZED actual
// cart (single whole-assembly Z shift, no scale).
{
  const hw = packet.profile.width / 2000, hl = packet.profile.length / 2000;
  const nMinX = cart.min[0] + packet.normalizationM.x;
  const nMaxX = cart.max[0] + packet.normalizationM.x;
  const nMinZ = cart.min[2] + packet.normalizationM.z;
  const nMaxZ = cart.max[2] + packet.normalizationM.z;
  assert.ok(nMinX >= -hw && nMaxX <= hw, "declared width must enclose actual cart X");
  assert.ok(nMinZ >= -hl && nMaxZ <= hl, "declared length must enclose actual cart Z");
  console.log(`cart: normalized actual X ${(nMinX * 1000).toFixed(1)}..${(nMaxX * 1000).toFixed(1)} in +/-${hw * 1000}, Z ${(nMinZ * 1000).toFixed(1)}..${(nMaxZ * 1000).toFixed(1)} in +/-${hl * 1000}`);
}

const nav = createTransportNav(scenario);
assert.equal(nav.roomMm.widthMm, 24000, "room width");
assert.equal(nav.roomMm.depthMm, 18000, "room depth");
assert.equal(nav.rackRects.length, 6, "racks");
assert.equal(nav.obstacleRects.length, 12, "obstacles");
assert.equal(scenario.mobileUnits.length, 6, "units");

const starts = scenario.mobileUnits.map((u) => ({ id: u.id, ...u.parkingSlotMm }));
const goals = [
  ...scenario.locations.map((l) => ({ id: l.id, ...l.approachPointMm })),
  ...scenario.resources.flatMap((r) => [...r.servicePositions, ...r.queueSlots]),
];
assert.equal(goals.length, 38, "goals");

// Physical truth: ACTUAL normalized parked rects (not inflated planning
// squares) are disjoint from racks/obstacles/each other.
{
  const hw = (cart.max[0] - cart.min[0]) / 2;
  const hl = (cart.max[2] - cart.min[2]) / 2;
  const rects = starts.map((s) => ({ id: s.id, minX: s.x - hw * 1000, maxX: s.x + hw * 1000, minZ: s.z - hl * 1000, maxZ: s.z + hl * 1000 }));
  const overlap = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  for (const r of rects) {
    for (const o of [...nav.rackRects, ...nav.obstacleRects]) assert.ok(!overlap(r, o), `${r.id} actual parked rect overlaps room geometry`);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) assert.ok(!overlap(rects[i], rects[j]), `${rects[i].id}/${rects[j].id} actual parked rects overlap`);
  }
  console.log(`parked: 6 actual normalized cart rects (${(hw * 2000).toFixed(1)}x${(hl * 2000).toFixed(1)}mm) disjoint from racks/obstacles/each other`);
}

let ok = 0;
let worstDetour = 0;
const parkPoses = new Map(starts.map((s) => [s.id, { x: s.x, z: s.z }]));
for (const s of starts) {
  const others = new Map([...parkPoses].filter(([id]) => id !== s.id));
  for (const g of goals) {
    const r = nav.findRoute({ x: s.x, z: s.z }, { x: g.x, z: g.z }, s.id, others);
    assert.equal(r.status, "ok", `${s.id}->${g.id} must route (planner occupancy model)`);
    ok++;
    const straight = Math.hypot(g.x - s.x, g.z - s.z);
    if (r.status === "ok") worstDetour = Math.max(worstDetour, r.totalDistanceMm / Math.max(1, straight));
    // Independent cross-check: the granted centerline clears every other
    // parked unit's declared disc (rA+rB) analytically, not just on grid.
    if (r.status === "ok") {
      for (const [oid, pose] of others) {
        const need = NAV_R + NAV_R;
        for (let i = 0; i + 1 < r.points.length; i++) {
          const a = r.points[i], b = r.points[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z;
          const len2 = dx * dx + dz * dz;
          const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((pose.x - a.x) * dx + (pose.z - a.z) * dz) / len2));
          const d = Math.hypot(a.x + dx * t - pose.x, a.z + dz * t - pose.z);
          assert.ok(d > need, `${s.id}->${g.id} centerline clears parked ${oid} disc (r799+r799)`);
        }
      }
      // And the occupancy-square model used by the planner covers the disc:
      // every centerline point sits outside every other square.
      for (const [oid, pose] of others) {
        const sq = occupancyRectFor(NAV_R, pose, NAV_R);
        for (const p of r.points) {
          const inside = p.x >= sq.minX && p.x <= sq.maxX && p.z >= sq.minZ && p.z <= sq.maxZ;
          assert.ok(!inside, `${s.id}->${g.id} centerline point inside ${oid} occupancy square`);
        }
      }
    }
  }
}
assert.equal(ok, 228, "all routes");
console.log(`ENV-NAV-C2: PASS 228/228 parking->goal routes under actual r${NAV_R} disc occupancy (worst detour ${worstDetour.toFixed(2)}x); analytic disc clearance re-verified per segment`);
