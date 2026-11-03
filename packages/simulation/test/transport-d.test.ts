import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  createServiceStation,
  createTransportNav,
  footprintRadiusMm,
  parseOperationsScenario,
  stationaryVsStationaryConflict,
} from "../src/index.js";

// Acceptance D: main canonical fixture after the M3a geometry correction,
// recalibrated by cargo-C2 to the centered 680x1220+100 profile (r799).
// PACK-1/PACK-2 each construct with 1 physical lane; all service/queue/
// parking positions clear pairwise under the 799mm radius; every canonical
// approach/service/queue/parking point is navigable and reachable; the old
// 600mm-queue-pitch overlap stays a durable historical negative; the
// superseded 1500mm-pair fact lives in git history and the C2 review doc.
const FIXTURE = "../../fixtures/operations/main-warehouse.json";
const HISTORICAL_SHA = "31e8b3429183abf8636b47c5b00f2c0b81dd0d8a4e0fac42c3faf9e303320b4e";

function loadMain() {
  const bytes = readFileSync(FIXTURE, "utf8");
  return { bytes, fx: parseOperationsScenario(JSON.parse(bytes)) };
}

describe("M3a main fixture correction (acceptance D)", () => {
  test("PACK resources construct with 1 physical lane each (2->1 fix)", () => {
    const { fx } = loadMain();
    for (const id of ["PACK-1", "PACK-2"]) {
      const res = fx.resources.find((r) => r.id === id);
      expect(res?.serviceCapacity).toBe(1);
      expect(res?.servicePositions).toHaveLength(1);
      expect(() => createServiceStation(res!)).not.toThrow();
    }
    // The old misconfiguration (capacity 2, one position) still throws and
    // is never silently minimized.
    const { fx: fx2 } = loadMain();
    const pack1 = fx2.resources.find((r) => r.id === "PACK-1")!;
    expect(() =>
      createServiceStation({ ...pack1, serviceCapacity: 2 }),
    ).toThrow(/exceeds 1 service position/);
  });

  test("all service/queue/parking positions clear pairwise (cargo-c2 r799 discs, actual min 1615.55)", () => {
    const { fx } = loadMain();
    // Cargo-C2 model: every unit shares the centered 680x1220+100 profile
    // (r799) and capacity 4; radii come from the fixture, never literals.
    const radii = new Map(fx.mobileUnits.map((u) => [u.id, footprintRadiusMm(u.footprintMm)]));
    expect(new Set(radii.values())).toEqual(new Set([799]));
    expect(new Set(fx.mobileUnits.map((u) => u.loadCapacityUnits))).toEqual(new Set([4]));
    const pts: { name: string; x: number; z: number }[] = [];
    for (const r of fx.resources) {
      for (const s of r.servicePositions) pts.push({ name: `service-${s.id}`, x: s.x, z: s.z });
      for (const q of r.queueSlots) pts.push({ name: `queue-${q.id}`, x: q.x, z: q.z });
    }
    for (const u of fx.mobileUnits) {
      pts.push({ name: `parking-${u.id}`, x: u.parkingSlotMm.x, z: u.parkingSlotMm.z });
    }
    expect(pts).toHaveLength(20);
    let min = Infinity;
    let pair: [string, string] = ["", ""];
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const a = pts[i]!;
        const b = pts[j]!;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < min) {
          min = d;
          pair = [a.name, b.name];
        }
        // 799+799=1598: touching counts as conflict, so require >1598.
        expect(
          stationaryVsStationaryConflict({ x: a.x, z: a.z }, 799, { x: b.x, z: b.z }, 799),
          `${a.name} vs ${b.name} overlap`,
        ).toBe(false);
      }
    }
    expect(min).toBe(1615.5494421403514);
    expect(pair.sort()).toEqual(["service-DSP-S1", "service-PACK2-S1"].sort());
  });

  test("every canonical point is navigable and every parking reaches every goal", () => {
    const { fx } = loadMain();
    const nav = createTransportNav(fx);
    const others = new Map(fx.mobileUnits.map((u) => [u.id, { ...u.parkingSlotMm }]));
    // All approach/service/queue/parking navigable (own excluded at starts).
    for (const l of fx.locations) {
      expect(
        nav.isNavigable({ ...l.approachPointMm }, fx.mobileUnits[0]!.id, others),
        `approach-${l.id}`,
      ).toBe(true);
    }
    for (const r of fx.resources) {
      for (const s of [...r.servicePositions, ...r.queueSlots]) {
        expect(nav.isNavigable({ x: s.x, z: s.z }, fx.mobileUnits[0]!.id, others), s.id).toBe(true);
      }
    }
    // 6 parkings x 38 goals = 228 swept routes (same count, new coordinates).
    const goals = [
      ...fx.locations.map((l) => ({ ...l.approachPointMm })),
      ...fx.resources.flatMap((r) => [...r.servicePositions, ...r.queueSlots].map((s) => ({ x: s.x, z: s.z }))),
    ];
    expect(goals).toHaveLength(38);
    let ok = 0;
    for (const u of fx.mobileUnits) {
      const othersFor = new Map(
        [...others].filter(([id]) => id !== u.id),
      );
      for (const g of goals) {
        const r = nav.findRoute({ ...u.parkingSlotMm }, g, u.id, othersFor);
        expect(r.status, `${u.id} -> (${g.x},${g.z})`).toBe("ok");
        if (r.status === "ok") ok += 1;
      }
    }
    expect(ok).toBe(228);
  });

  test("old 600mm queue pitch is durably rejected as overlapping", () => {
    // Historical PACK1 line: S1 z6900, Q1 z7500, Q2 z8100, Q3 z8700 at
    // x20500 (600 pitch < 1200). Any adjacent pair overlaps under 600+600.
    const oldLine = [6900, 7500, 8100, 8700];
    for (let i = 0; i + 1 < oldLine.length; i += 1) {
      const a = { x: 20500, z: oldLine[i]! };
      const b = { x: 20500, z: oldLine[i + 1]! };
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBe(600);
      expect(stationaryVsStationaryConflict(a, 600, b, 600)).toBe(true);
    }
    // Historical PACK2/DSP clash: PACK2-Q3 (20500,14700) vs DSP-S1
    // (20000,14400) at ~583mm also overlaps.
    expect(
      stationaryVsStationaryConflict({ x: 20500, z: 14700 }, 600, { x: 20000, z: 14400 }, 600),
    ).toBe(true);
  });

  test("fixture hash changed from historical; provenance declares the fix", () => {
    const { bytes, fx } = loadMain();
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(sha).not.toBe(HISTORICAL_SHA);
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    const joined = fx.provenance.assumptions.join("\n");
    expect(joined).toMatch(/PACK-1\/PACK-2 serviceCapacity 2->1/);
    expect(joined).toMatch(/x22500 east line/);
    expect(joined).toContain(HISTORICAL_SHA);
    // Counts/capacities preserved except the explicit 2->1.
    expect(fx.geometry.racks).toHaveLength(6);
    expect(fx.locations).toHaveLength(24);
    expect(fx.products).toHaveLength(12);
    expect(fx.mobileUnits).toHaveLength(6);
    expect(fx.resources).toHaveLength(4);
    expect(fx.orderSchedule).toHaveLength(28);
    expect(fx.deliverySchedule).toHaveLength(12);
    expect(fx.geometry.obstacles).toHaveLength(12);
  });
});
