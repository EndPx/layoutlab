// M3c review-revision regressions: operational truth, derived-fixture
// guard, exact route split, pick-stop states, carry support, and
// full/partial/zero stock visuals. Run from the repo root with the
// simulation workspace runner (no new scripts or dependencies):
//   npx --prefix packages/simulation vitest run --root . apps/web/src/lib/operations.test.ts
import { describe, expect, it } from "vitest";
import { parseOperationsScenario, applyAgentInitialPlacement, contentSha256, applyRackQuarterTurn, buildRackAttachmentMap, type RackQuarterTurnProposal } from "@layoutlab/simulation";
import parentJson from "../../../../fixtures/operations/main-warehouse.json";
import burstJson from "../../../../fixtures/operations/picking-packing-burst.json";
import {
  canonicalLayoutScenario,
  buildLayoutScene,
  resolveLayoutAttachments,
  SPARSE_ARROW_SPACING_MM,
  allocateCarryCells,
  assertCarryPacketCompatible,
  assertDerivedFixtureCompatible,
  carryMarkerPose,
  isUnitOperationallyBusy,
  loadOperationsScene,
  pickStopStates,
  sparseRouteArrowheads,
  splitRouteAtPose,
  unitOperationalLabel,
  visualContainersForQty,
} from "./operations";

const parent = () => parseOperationsScenario(parentJson);
const burst = () => parseOperationsScenario(burstJson);

describe("operational truth", () => {
  it("handling with idle transport is busy, true idle is not", () => {
    expect(isUnitOperationallyBusy({ transportState: "idle", task: { kind: "picking" } })).toBe(true);
    expect(isUnitOperationallyBusy({ transportState: "idle", task: { kind: "unloading" } })).toBe(true);
    expect(isUnitOperationallyBusy({ transportState: "waiting", task: { kind: "in-queue" } })).toBe(true);
    expect(isUnitOperationallyBusy({ transportState: "moving", task: { kind: "to-pick" } })).toBe(true);
    expect(isUnitOperationallyBusy({ transportState: "idle", task: { kind: "idle" } })).toBe(false);
  });
  it("labels lead with the task and keep transport secondary", () => {
    expect(unitOperationalLabel({ transportState: "idle", task: { kind: "idle" } })).toBe("idle");
    expect(unitOperationalLabel({ transportState: "idle", task: { kind: "picking" } })).toBe("picking · wheels idle");
    expect(unitOperationalLabel({ transportState: "moving", task: { kind: "to-pick" } })).toBe("to-pick · wheels moving");
  });
});

describe("derived-fixture compatibility", () => {
  it("real burst passes", () => {
    expect(() => assertDerivedFixtureCompatible(parent(), burst())).not.toThrow();
  });
  it("resource queue drift rejects", () => {
    const b = burst();
    b.resources.find((r) => r.kind === "packing")!.queueSlots[0]!.x += 1000;
    expect(() => assertDerivedFixtureCompatible(parent(), b)).toThrow(/resources/);
  });
  it("resource service drift rejects", () => {
    const b = burst();
    b.resources.find((r) => r.kind === "packing")!.servicePositions[0]!.z += 1000;
    expect(() => assertDerivedFixtureCompatible(parent(), b)).toThrow(/resources/);
  });
  it("mobile parking drift rejects", () => {
    const b = burst();
    b.mobileUnits[0]!.parkingSlotMm.x += 1000;
    expect(() => assertDerivedFixtureCompatible(parent(), b)).toThrow(/mobileUnits/);
  });
  it("mobile footprint and role drift reject", () => {
    const f = burst();
    f.mobileUnits[0]!.footprintMm.width += 100;
    expect(() => assertDerivedFixtureCompatible(parent(), f)).toThrow(/mobileUnits/);
    const r = burst();
    r.mobileUnits[0]!.role = "putaway";
    expect(() => assertDerivedFixtureCompatible(parent(), r)).toThrow(/mobileUnits/);
  });
  it("changed workload and provenance still pass", () => {
    const b = burst();
    b.seed = "revised-seed";
    b.orderSchedule.pop();
    b.deliverySchedule.push({ id: "D-X", arrivalTimeMs: 0, lines: [] });
    b.initialStock[0]!.quantity = 1;
    expect(() => assertDerivedFixtureCompatible(parent(), b)).not.toThrow();
  });
});

describe("exact route split", () => {
  const line = [
    { x: 7500, z: 1200 },
    { x: 7400, z: 1200 },
    { x: 7300, z: 1200 },
  ];
  it("splits mid-segment at the exact pose, keeping every point", () => {
    const s = splitRouteAtPose(line, { x: 7443, z: 1200 })!;
    expect(s).not.toBeNull();
    expect(s.split).toEqual({ x: 7443, z: 1200 });
    expect(s.segmentIndex).toBe(0);
    expect(s.completed).toEqual([
      { x: 7500, z: 1200 },
      { x: 7443, z: 1200 },
    ]);
    expect(s.active).toEqual([
      { x: 7443, z: 1200 },
      { x: 7400, z: 1200 },
      { x: 7300, z: 1200 },
    ]);
  });
  it("splits on-vertex, start, and end poses without duplicating points", () => {
    const v = splitRouteAtPose(line, { x: 7400, z: 1200 })!;
    expect(v.completed).toEqual([
      { x: 7500, z: 1200 },
      { x: 7400, z: 1200 },
    ]);
    expect(v.active).toEqual([
      { x: 7400, z: 1200 },
      { x: 7300, z: 1200 },
    ]);
    const start = splitRouteAtPose(line, { x: 7500, z: 1200 })!;
    expect(start.completed).toEqual([{ x: 7500, z: 1200 }]);
    expect(start.active).toEqual(line);
    const end = splitRouteAtPose(line, { x: 7300, z: 1200 })!;
    expect(end.completed).toEqual(line);
    expect(end.active).toEqual([{ x: 7300, z: 1200 }]);
  });
  it("refuses degenerate polylines", () => {
    expect(splitRouteAtPose([{ x: 1, z: 2 }], { x: 1, z: 2 })).toBeNull();
  });
});

describe("pick-stop states", () => {
  it("zero remaining is completed, never a future stop", () => {
    expect(
      pickStopStates([
        { locationId: "L01", quantity: 0 },
        { locationId: "L03", quantity: 1 },
      ]),
    ).toEqual([
      { locId: "L01", done: true },
      { locId: "L03", done: false },
    ]);
    expect(pickStopStates([])).toEqual([]);
  });
  it("sums remaining across lines per location", () => {
    expect(
      pickStopStates([
        { locationId: "L05", quantity: 2 },
        { locationId: "L05", quantity: 0 },
      ]),
    ).toEqual([{ locId: "L05", done: false }]);
  });
});

describe("carry packet compatibility", () => {
  it("real parent scene carries the cargo-c2 packet data", () => {
    const scene = loadOperationsScene();
    expect(scene.carry.model).toBe("cargo-c2-centered680x1220");
    expect(scene.carry.docksUnitM).toHaveLength(2);
    expect(scene.carry.docksUnitM.map((d) => d.id)).toEqual(["A", "B"]);
    expect(scene.carry.cellsCrateLocalMm).toHaveLength(2);
    expect(scene.carry.cargoYawDeg).toBe(90);
    expect(scene.carry.capacityUnits).toBe(4);
    expect(scene.carry.normalizationM).toEqual({ x: 0, y: 0, z: 0.04102388024330139 });
    expect(scene.cartGlbUrl).toContain("cart_luggage_platform_a01.glb");
    expect(scene.carry.crateGlbUrl).toContain("crate_blue_a01.glb");
  });
  it("drifted pointer, model, profile, or capacity refuse", () => {
    const s = parent();
    expect(() => assertCarryPacketCompatible(s, "assets/cargo/other.json", "cargo-c2-centered680x1220")).toThrow(/drifted carry data/);
    expect(() => assertCarryPacketCompatible(s, "assets/cargo/carry-luggage-platform-a01.json", "cargo-c1")).toThrow(/disagrees with packet/);
    const fp = parent();
    fp.mobileUnits[0]!.footprintMm.width = 600;
    expect(() => assertCarryPacketCompatible(fp, "assets/cargo/carry-luggage-platform-a01.json", "cargo-c2-centered680x1220")).toThrow(/disagrees with carry profile/);
    const cap = parent();
    cap.mobileUnits[0]!.loadCapacityUnits = 96;
    expect(() => assertCarryPacketCompatible(cap, "assets/cargo/carry-luggage-platform-a01.json", "cargo-c2-centered680x1220")).toThrow(/disagrees with carry capacity/);
  });
  it("both canonical fixtures carry the cargo-c2 profile and capacity 4", () => {
    for (const fx of [parent(), burst()]) {
      for (const u of fx.mobileUnits) {
        expect(u.footprintMm).toEqual({ length: 1220, margin: 100, width: 680 });
        expect(u.loadCapacityUnits).toBe(4);
      }
    }
  });
});

describe("carry cell allocation and marker poses", () => {
  it("allocates ledger lines in stable SKU/item-ordinal order (B-02: P03x2+P09x2)", () => {
    const { placements, overflowUnits } = allocateCarryCells(
      [
        { productId: "P03", quantity: 2 },
        { productId: "P09", quantity: 2 },
      ],
      2,
      2,
      ["0", "1"],
    );
    expect(overflowUnits).toBe(0);
    expect(placements).toEqual([
      { productId: "P03", itemOrdinal: 1, crateIndex: 0, cellId: "0" },
      { productId: "P03", itemOrdinal: 2, crateIndex: 0, cellId: "1" },
      { productId: "P09", itemOrdinal: 1, crateIndex: 1, cellId: "0" },
      { productId: "P09", itemOrdinal: 2, crateIndex: 1, cellId: "1" },
    ]);
  });
  it("reports overflow instead of stacking a fifth unit", () => {
    const { placements, overflowUnits } = allocateCarryCells(
      [{ productId: "P05", quantity: 8 }],
      2,
      2,
      ["0", "1"],
    );
    expect(placements).toHaveLength(4);
    expect(overflowUnits).toBe(4);
  });
  it("poses the worst SKU exact-fit at yaw90 and rejects overfull cells", () => {
    const cell = { id: "0", x0Mm: -220, z0Mm: -160, wMm: 220, dMm: 320, hMm: 160 };
    const p05 = carryMarkerPose({ width: 320, depth: 220, height: 160 }, cell, 6.0, 90);
    expect(p05.fitsCell).toBe(true);
    expect(p05).toMatchObject({ xMm: -110, yMm: 86, zMm: 0, yawDeg: 90 });
    const tall = carryMarkerPose({ width: 320, depth: 220, height: 161 }, cell, 6.0, 90);
    expect(tall.fitsCell).toBe(false);
    expect(() => carryMarkerPose({ width: 100, depth: 100, height: 100 }, cell, 6.0, 0)).toThrow(/cargo yaw must be 90/);
  });
});

describe("sparse route arrowheads", () => {
  it("long 100mm-grid straight yields a sparse count at known arc positions", () => {
    expect(SPARSE_ARROW_SPACING_MM).toBeGreaterThanOrEqual(1500);
    expect(SPARSE_ARROW_SPACING_MM).toBeLessThanOrEqual(2000);
    const straight = Array.from({ length: 101 }, (_, i) => ({ x: i * 100, z: 0 }));
    const arrows = sparseRouteArrowheads(straight);
    expect(arrows).toHaveLength(5);
    expect(arrows.map((a) => [a.x, a.z])).toEqual([
      [1750, 0],
      [3500, 0],
      [5250, 0],
      [7000, 0],
      [8750, 0],
    ]);
    for (const a of arrows) {
      expect(a.dirX).toBeCloseTo(1, 12);
      expect(a.dirZ).toBeCloseTo(0, 12);
    }
    expect(arrows.map((a) => a.distanceMm)).toEqual([1750, 3500, 5250, 7000, 8750]);
  });
  it("corner path keeps arrows on the correct segments with true directions", () => {
    const corner = [
      { x: 0, z: 0 },
      { x: 5000, z: 0 },
      { x: 5000, z: 5000 },
    ];
    const arrows = sparseRouteArrowheads(corner);
    expect(arrows).toHaveLength(5);
    expect(arrows.map((a) => [a.x, a.z])).toEqual([
      [1750, 0],
      [3500, 0],
      [5000, 250],
      [5000, 2000],
      [5000, 3750],
    ]);
    expect(arrows.map((a) => a.segmentIndex)).toEqual([0, 0, 1, 1, 1]);
    expect(arrows.slice(0, 2).map((a) => [a.dirX, a.dirZ])).toEqual([
      [1, 0],
      [1, 0],
    ]);
    expect(arrows.slice(2).map((a) => [a.dirX, a.dirZ])).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
    ]);
  });
});

describe("stock visuals", () => {
  it("covers zero, exact-full, and partial quantities", () => {
    expect(visualContainersForQty(0, 8)).toEqual({ full: 0, partial: 0 });
    expect(visualContainersForQty(48, 8)).toEqual({ full: 6, partial: 0 });
    expect(visualContainersForQty(46, 8)).toEqual({ full: 5, partial: 6 });
    expect(visualContainersForQty(7, 8)).toEqual({ full: 0, partial: 7 });
  });
});
describe('initial parking scene boundary', () => {
 it('accepts only unit parking while deriving scene and ghost from candidate',async()=>{
  const s=burst(); const unit=s.mobileUnits[0]!; const centre={x:unit.parkingSlotMm.x,z:unit.parkingSlotMm.z+100};
  const bundle=applyAgentInitialPlacement(s,{kind:'AGENT_INITIAL_PLACEMENT',proposalId:'scene',entityId:unit.id,parent:{scenarioId:s.id,scenarioContentSha256:await contentSha256(s),schemaVersion:s.schemaVersion,engineVersion:s.engineVersion},target:{mode:'ABSOLUTE_CENTER_MM',centerMm:centre}});
  const scene=buildLayoutScene(bundle); expect(scene.units[0]!.parkingMm).toEqual(centre);expect(scene.layoutGhost?.centreMm).toEqual(unit.parkingSlotMm);expect(scene.scenario.mobileUnits[0]!.parkingSlotMm).toEqual(centre);
 });
 it.each(['id','role','speedMmPerSecond','footprintMm','loadCapacityUnits','eligibleHandlingClasses','staff'])('rejects canonical unit profile drift %s',field=>{
  const s=burst(),u=s.mobileUnits[0]!; const row=u as unknown as Record<string,unknown>;
  if(field==='staff')s.mobileUnits.push({...structuredClone(u),id:'NEW'});else row[field]=field==='id'?'OTHER':field==='role'?'putaway':field==='footprintMm'?{...u.footprintMm,width:999}:field==='eligibleHandlingClasses'?[]:999;
  expect(()=>resolveLayoutAttachments(s)).toThrow();
 });
});
it('renders invalid overlapping initial parking as the candidate while admission remains separate',()=>{
 const s=burst();s.mobileUnits[0]!.parkingSlotMm={...s.mobileUnits[1]!.parkingSlotMm};
 const scene=buildLayoutScene({scenario:s,transform:{entityId:s.mobileUnits[0]!.id,fromCentreMm:{x:3000,z:1200},toCentreMm:{...s.mobileUnits[0]!.parkingSlotMm},deltaMm:{dx:3000,dz:0}},changedFields:[]});
 expect(scene.units[0]!.parkingMm).toEqual(s.mobileUnits[1]!.parkingSlotMm);
});
async function rotateScene(s=burst(),turns:1|2|3=1) {
 const p:RackQuarterTurnProposal={kind:'RACK_QUARTER_TURN',proposalId:'ui-frame',entityId:'R1',quarterTurns:turns,parent:{scenarioId:s.id,scenarioContentSha256:await contentSha256(s),schemaVersion:s.schemaVersion,engineVersion:s.engineVersion}};
 return applyRackQuarterTurn(s,p,canonicalLayoutScenario(),buildRackAttachmentMap(s));
}
describe('rack rotation scene frame',()=>{
 it('literal anchor/approach, intrinsic scale, container grid offsets and yaw share the rack frame',async()=>{
  const original=buildLayoutScene(await rotateScene(burst(),3)); // establish a separately resolved frame
  expect(original.racks[0]!.yawDeg).toBe(270);
  const baseline=loadOperationsScene();const b=await rotateScene();const scene=buildLayoutScene(b),rack=scene.racks[0]!,slot=scene.locations.find(l=>l.id==='L01')!;
  expect(slot.anchorMm).toEqual({x:4000,y:450,z:7000});expect(slot.approachMm).toEqual({x:6800,z:7000});expect(rack.yawDeg).toBe(90);expect(rack.scale).toEqual(baseline.racks[0]!.scale);
  expect(rack.dimsMm.width).toBe(baseline.racks[0]!.dimsMm.depth);expect(rack.intrinsicDimsMm).toEqual(baseline.racks[0]!.dimsMm);
  const before=baseline.locations.find(l=>l.id==='L01')!;
  expect(slot.containers).toHaveLength(before.containers.length);
  slot.containers.forEach((c,i)=>{expect(c.dxMm).toBe(before.containers[i]!.dzMm);expect(c.dzMm).toBe(-before.containers[i]!.dxMm);expect(c.dyMm).toBe(before.containers[i]!.dyMm);expect(c.yawDeg).toBe(90);});
  expect(scene.counts.containers).toEqual(baseline.counts.containers);
 });
 it('inverse and four turns restore exact geometry, products, parking and scene frames',async()=>{
  const s=burst();const first=await rotateScene(s),undo=await rotateScene(first.scenario,3);expect(undo.scenario).toEqual(s);
  let next=s;for(let i=0;i<4;i++)next=(await rotateScene(next)).scenario;expect(next).toEqual(s);expect(buildLayoutScene(await rotateScene((await rotateScene(s,3)).scenario)).racks[0]!.yawDeg).toBe(0);
 });
 it('nonrigid anchor frames refuse rather than guessing yaw',async()=>{
  const b=await rotateScene();b.scenario.locations[0]!.storageAnchorMm.x++;
  expect(()=>buildLayoutScene(b)).toThrow('NON_RIGID_GEOMETRY');
 });
});
