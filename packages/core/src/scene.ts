import type { Rect } from "./geometry.js";
import {
  cartRadiusMm,
  inflateRect,
  navigationRadiusMm,
  pointInRect,
  rackFootprint,
  rectsOverlapInterior,
} from "./geometry.js";
import type { PointMm, Scenario } from "./schema.js";
import { GRID_SIZE_MM } from "./version.js";

export type SceneIssue = { code: string; message: string };

// Navigability context shared by validation, routing, and replay.
// cols/rows are the maximum graph-node indices (nodes at 100 mm multiples).
export type NavContext = {
  cartRadiusMm: number;
  navigationRadiusMm: number;
  inflatedObstacles: Rect[];
  cols: number;
  rows: number;
};

export function buildNavContext(scenario: Scenario): NavContext {
  const navigationRadius = navigationRadiusMm(scenario);
  return {
    cartRadiusMm: cartRadiusMm(scenario.cart),
    navigationRadiusMm: navigationRadius,
    inflatedObstacles: scenario.racks.map((r) => inflateRect(rackFootprint(r), navigationRadius)),
    cols: Math.floor(scenario.room.widthMm / GRID_SIZE_MM),
    rows: Math.floor(scenario.room.depthMm / GRID_SIZE_MM),
  };
}

// Point satisfies wall clearance and is outside every inflated obstacle.
// Conservative: clearance must strictly exceed the navigation radius, so a
// point exactly navigationRadius from a wall is rejected, matching the
// inclusive inflated-obstacle boundary.
export function pointNavigable(p: PointMm, scenario: Scenario, nav: NavContext): boolean {
  const r = nav.navigationRadiusMm;
  if (p.x <= r || p.z <= r) return false;
  if (p.x >= scenario.room.widthMm - r || p.z >= scenario.room.depthMm - r) return false;
  return !nav.inflatedObstacles.some((o) => pointInRect(p, o));
}

export function pointInRoom(p: PointMm, scenario: Scenario): boolean {
  return p.x >= 0 && p.z >= 0 && p.x <= scenario.room.widthMm && p.z <= scenario.room.depthMm;
}

// Scene validation covers geometry only: racks, references from locations to
// racks, room bounds, and the packing point. Pick-point clearance and
// reachability are evaluated per demanded location during workload
// evaluation, so inaccessible undemanded locations stay representable.
export function validateScene(
  scenario: Scenario,
  nav: NavContext = buildNavContext(scenario),
): { ok: boolean; issues: SceneIssue[]; nav: NavContext } {
  const issues: SceneIssue[] = [];
  const footprints = scenario.racks.map(rackFootprint);

  scenario.racks.forEach((rack, i) => {
    const f = footprints[i] as Rect;
    if (f.minX < 0 || f.minZ < 0 || f.maxX > scenario.room.widthMm || f.maxZ > scenario.room.depthMm) {
      issues.push({
        code: "RACK_OUT_OF_BOUNDS",
        message: `rack ${rack.id} footprint exceeds room bounds`,
      });
    }
  });

  for (let i = 0; i < scenario.racks.length; i++) {
    for (let j = i + 1; j < scenario.racks.length; j++) {
      if (rectsOverlapInterior(footprints[i] as Rect, footprints[j] as Rect)) {
        issues.push({
          code: "RACK_OVERLAP",
          message: `racks ${scenario.racks[i]?.id} and ${scenario.racks[j]?.id} overlap`,
        });
      }
    }
  }

  const rackIds = new Set(scenario.racks.map((r) => r.id));
  for (const location of scenario.locations) {
    if (!rackIds.has(location.rackId)) {
      issues.push({
        code: "LOCATION_UNKNOWN_RACK",
        message: `location ${location.id} references unknown rack ${location.rackId}`,
      });
    }
    if (!pointInRoom(location.pickPointMm, scenario)) {
      issues.push({
        code: "PICK_POINT_OUT_OF_ROOM",
        message: `location ${location.id} pick point is outside the room`,
      });
    }
  }

  if (!pointInRoom(scenario.packingPointMm, scenario)) {
    issues.push({ code: "PACKING_INVALID", message: "packing point is outside the room" });
  } else if (!pointNavigable(scenario.packingPointMm, scenario, nav)) {
    issues.push({
      code: "PACKING_INVALID",
      message: "packing point violates clearance (wall band or inflated obstacle)",
    });
  }

  return { ok: issues.length === 0, issues, nav };
}
