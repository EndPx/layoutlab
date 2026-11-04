import { parseOperationsScenario, type OperationsScenario } from "../schema.js";
import type { PackingStationTranslationProposal, RectMm, XzMm } from "./contract.js";
import { resolveTargetCentre } from "./contract.js";

// Explicit attachment ownership. A station bundle is declared, then VERIFIED
// field-by-field against the canonical scenario (and, for the main fixture,
// against the bindings file). Ownership is never inferred by proximity:
// a wrong centre/rect/slot in the declaration is an error, not a guess.

export type SlotCoord = { id: string; x: number; z: number };

export type StationAttachment = {
  stationId: string;
  resourceId: string;
  obstacleId: string;
  assetRef: string;
  centreMm: XzMm;
  obstacleRectMm: RectMm;
  servicePositions: SlotCoord[];
  queueSlots: SlotCoord[];
};

// Explicit declaration for the main fixture. Values are literals from the
// canonical fixture + bindings (PACK-1 centre 20500,5000; OB-PACK1
// 19566..21434 x 4390..5610; PACK1-S1 20500,6900; queues 22500,6900/8600/10300).
export const MAIN_WAREHOUSE_ATTACHMENTS: StationAttachment[] = [
  {
    stationId: "PACK-1",
    resourceId: "PACK-1",
    obstacleId: "OB-PACK1",
    assetRef: "warehouse-environment/table_packing_heavyduty_c01",
    centreMm: { x: 20500, z: 5000 },
    obstacleRectMm: { minXMm: 19566, minZMm: 4390, maxXMm: 21434, maxZMm: 5610 },
    servicePositions: [{ id: "PACK1-S1", x: 20500, z: 6900 }],
    queueSlots: [
      { id: "PACK1-Q1", x: 22500, z: 6900 },
      { id: "PACK1-Q2", x: 22500, z: 8600 },
      { id: "PACK1-Q3", x: 22500, z: 10300 },
    ],
  },
  {
    stationId: "PACK-2",
    resourceId: "PACK-2",
    obstacleId: "OB-PACK2",
    assetRef: "warehouse-environment/table_packing_heavyduty_c01",
    centreMm: { x: 20500, z: 11000 },
    obstacleRectMm: { minXMm: 19566, minZMm: 10390, maxXMm: 21434, maxZMm: 11610 },
    servicePositions: [{ id: "PACK2-S1", x: 20500, z: 12900 }],
    queueSlots: [
      { id: "PACK2-Q1", x: 22500, z: 12000 },
      { id: "PACK2-Q2", x: 22500, z: 13700 },
      { id: "PACK2-Q3", x: 20500, z: 9400 },
    ],
  },
];

// Canonical ownership for a known station, compared by attachment-relative
// geometry rather than absolute coordinates or JSON key order: identity
// (resource/obstacle/asset), obstacle dimensions and every slot's offset
// from the station centre must match the canonical entry exactly, while
// the centre itself may sit at any current validated parent translation.
// A non-rigid deformation or an obstacle/slot swap breaks the offsets.
function canonicalRelativeMismatches(canonical: StationAttachment, entry: StationAttachment): string[] {
  const out: string[] = [];
  if (entry.resourceId !== canonical.resourceId) out.push(`resource identity ${entry.resourceId} != canonical ${canonical.resourceId}`);
  if (entry.obstacleId !== canonical.obstacleId) out.push(`obstacle identity ${entry.obstacleId} != canonical ${canonical.obstacleId}`);
  if (entry.assetRef !== canonical.assetRef) out.push(`asset identity differs from canonical ${canonical.assetRef}`);
  const dims = (r: RectMm): [number, number] => [r.maxXMm - r.minXMm, r.maxZMm - r.minZMm];
  const [cw, cd] = dims(canonical.obstacleRectMm);
  const [ew, ed] = dims(entry.obstacleRectMm);
  if (ew !== cw || ed !== cd) out.push(`obstacle dimensions ${ew}x${ed} != canonical ${cw}x${cd}`);
  const relRect = (r: RectMm, c: XzMm): string =>
    `${r.minXMm - c.x},${r.minZMm - c.z},${r.maxXMm - c.x},${r.maxZMm - c.z}`;
  if (relRect(entry.obstacleRectMm, entry.centreMm) !== relRect(canonical.obstacleRectMm, canonical.centreMm)) {
    out.push("obstacle rect offset from centre differs from canonical (non-rigid or swapped footprint)");
  }
  const relSlots = (slots: SlotCoord[], c: XzMm): string =>
    slots.map((s) => `${s.id}:${s.x - c.x},${s.z - c.z}`).sort().join(";");
  if (relSlots(entry.servicePositions, entry.centreMm) !== relSlots(canonical.servicePositions, canonical.centreMm)) {
    out.push("service position offsets from centre differ from canonical");
  }
  if (relSlots(entry.queueSlots, entry.centreMm) !== relSlots(canonical.queueSlots, canonical.centreMm)) {
    out.push("queue slot offsets from centre differ from canonical");
  }
  return out;
}

export class LayoutAttachmentError extends Error {
  readonly code = "ATTACHMENT_MISMATCH";
  readonly mismatches: string[];
  constructor(mismatches: string[]) {
    super(`attachment map does not match the canonical scenario: ${mismatches.join("; ")}`);
    this.mismatches = mismatches;
  }
}

function sameSlots(declared: SlotCoord[], actual: SlotCoord[]): boolean {
  if (declared.length !== actual.length) return false;
  const byId = new Map(actual.map((s) => [s.id, s]));
  return declared.every((d) => {
    const a = byId.get(d.id);
    return a !== undefined && a.x === d.x && a.z === d.z;
  });
}

// Verify every declared bundle against the scenario. Returns stationId ->
// attachment (deep copies). Throws LayoutAttachmentError on any drift.
//
// Canonical ownership rules (caller declarations alone cannot establish
// arbitrary ownership):
// - stationId must equal resourceId: a bundle may not alias one station
//   onto another station's resource/obstacle (the PACK-1 -> PACK-2 bypass).
// - station, resource, obstacle and slot ids are unique across bundles.
// - for scenario main-warehouse-1 the bundle must equal the canonical
//   MAIN_WAREHOUSE_ATTACHMENTS entry (or the bindings-derived equivalent);
// - for any other (generic) fixture, the declaration is the trusted
//   ownership record only after exact verification below: the obstacle
//   rect/centre and the resource service/queue slots must match the
//   scenario field-by-field. Proximity is never used.
export function buildStationAttachmentMap(
  scenario: OperationsScenario,
  declared: StationAttachment[],
): Map<string, StationAttachment> {
  const mismatches: string[] = [];
  const out = new Map<string, StationAttachment>();
  const seenResources = new Set<string>();
  const seenObstacles = new Set<string>();
  const seenSlots = new Set<string>();
  for (const entry of declared) {
    if (entry.stationId !== entry.resourceId) {
      mismatches.push(`${entry.stationId}: stationId must equal resourceId (alias onto resource ${entry.resourceId} is not canonical ownership)`);
    }
    if (out.has(entry.stationId)) mismatches.push(`${entry.stationId}: duplicate station bundle`);
    if (seenResources.has(entry.resourceId)) mismatches.push(`${entry.stationId}: resource ${entry.resourceId} already claimed by another bundle`);
    if (seenObstacles.has(entry.obstacleId)) mismatches.push(`${entry.stationId}: obstacle ${entry.obstacleId} already claimed by another bundle`);
    seenResources.add(entry.resourceId);
    seenObstacles.add(entry.obstacleId);
    for (const slot of [...entry.servicePositions, ...entry.queueSlots]) {
      if (seenSlots.has(slot.id)) mismatches.push(`${entry.stationId}: slot ${slot.id} already claimed by another bundle`);
      seenSlots.add(slot.id);
    }
    if (scenario.id === "main-warehouse-1") {
      const canonical = MAIN_WAREHOUSE_ATTACHMENTS.find((a) => a.stationId === entry.stationId);
      if (!canonical) {
        mismatches.push(`${entry.stationId}: no canonical ownership entry for main-warehouse-1`);
      } else {
        // Identity + dimensions + attachment-relative geometry must match
        // canonically (key-order free); absolute coordinates may reflect
        // the current validated parent translation so a moved station can
        // be the parent of the next edit on the same scenario id.
        for (const detail of canonicalRelativeMismatches(canonical, entry)) {
          mismatches.push(`${entry.stationId}: bundle differs from canonical main-warehouse-1 ownership (${detail})`);
        }
      }
    }
    const resource = scenario.resources.find((r) => r.id === entry.resourceId);
    if (!resource) {
      mismatches.push(`${entry.stationId}: resource ${entry.resourceId} not found`);
      continue;
    }
    if (resource.kind !== "packing") {
      mismatches.push(`${entry.stationId}: resource ${entry.resourceId} is kind ${resource.kind}, not packing`);
    }
    const obstacle = scenario.geometry.obstacles.find((o) => o.id === entry.obstacleId);
    if (!obstacle) {
      mismatches.push(`${entry.stationId}: obstacle ${entry.obstacleId} not found`);
    } else {
      const rect = entry.obstacleRectMm;
      if (obstacle.minXMm !== rect.minXMm || obstacle.maxXMm !== rect.maxXMm || obstacle.minZMm !== rect.minZMm || obstacle.maxZMm !== rect.maxZMm) {
        mismatches.push(`${entry.stationId}: obstacle ${entry.obstacleId} rect ${obstacle.minXMm}..${obstacle.maxXMm} x ${obstacle.minZMm}..${obstacle.maxZMm} != declared ${rect.minXMm}..${rect.maxXMm} x ${rect.minZMm}..${rect.maxZMm}`);
      }
      const centreX = (obstacle.minXMm + obstacle.maxXMm) / 2;
      const centreZ = (obstacle.minZMm + obstacle.maxZMm) / 2;
      if (centreX !== entry.centreMm.x || centreZ !== entry.centreMm.z) {
        mismatches.push(`${entry.stationId}: obstacle centre (${centreX},${centreZ}) != declared centre (${entry.centreMm.x},${entry.centreMm.z})`);
      }
    }
    if (!sameSlots(entry.servicePositions, resource.servicePositions)) {
      mismatches.push(`${entry.stationId}: declared servicePositions ${JSON.stringify(entry.servicePositions)} != resource ${JSON.stringify(resource.servicePositions)}`);
    }
    if (!sameSlots(entry.queueSlots, resource.queueSlots)) {
      mismatches.push(`${entry.stationId}: declared queueSlots ${JSON.stringify(entry.queueSlots)} != resource ${JSON.stringify(resource.queueSlots)}`);
    }
    out.set(entry.stationId, structuredClone(entry));
  }
  if (mismatches.length > 0) throw new LayoutAttachmentError(mismatches);
  return out;
}

// Derive the explicit declaration from the main-warehouse bindings file
// (stations centres + obstacleVisuals station mapping), then verify it
// against the scenario with the same strict check as any declaration.
export function attachmentsFromBindings(
  scenario: OperationsScenario,
  bindings: unknown,
): Map<string, StationAttachment> {
  if (typeof bindings !== "object" || bindings === null) {
    throw new LayoutAttachmentError(["bindings must be an object"]);
  }
  const record = bindings as Record<string, unknown>;
  const stations = record["stations"] as Record<string, { centerMm?: { x: number; z: number }; centreMm?: { x: number; z: number }; asset?: string }> | undefined;
  const visuals = record["obstacleVisuals"] as Record<string, { stationId?: string }> | undefined;
  if (!stations || !visuals) throw new LayoutAttachmentError(["bindings missing stations/obstacleVisuals"]);
  const declared: StationAttachment[] = [];
  for (const [obstacleId, visual] of Object.entries(visuals)) {
    const stationId = visual.stationId;
    if (!stationId) continue;
    const station = stations[stationId];
    const stationCentre = station?.centerMm ?? station?.centreMm;
    if (!stationCentre) throw new LayoutAttachmentError([`${stationId}: bindings station centre missing`]);
    const resource = scenario.resources.find((r) => r.id === stationId);
    const obstacle = scenario.geometry.obstacles.find((o) => o.id === obstacleId);
    if (!resource || !obstacle) throw new LayoutAttachmentError([`${stationId}: scenario resource/obstacle missing for bindings entry`]);
    declared.push({
      stationId,
      resourceId: stationId,
      obstacleId,
      assetRef: station.asset ?? "",
      centreMm: { x: stationCentre.x, z: stationCentre.z },
      obstacleRectMm: { minXMm: obstacle.minXMm, minZMm: obstacle.minZMm, maxXMm: obstacle.maxXMm, maxZMm: obstacle.maxZMm },
      servicePositions: resource.servicePositions.map((s) => ({ ...s })),
      queueSlots: resource.queueSlots.map((s) => ({ ...s })),
    });
  }
  return buildStationAttachmentMap(scenario, declared);
}

// Resolve the viewer/asset placement from a CANDIDATE scenario (never from
// frozen baseline bindings): centre and rect are read back from the
// candidate obstacle, slots from the candidate resource.
export function viewerPlacementFromCandidate(
  candidate: OperationsScenario,
  attachment: StationAttachment,
): StationAttachment {
  const resource = candidate.resources.find((r) => r.id === attachment.resourceId);
  const obstacle = candidate.geometry.obstacles.find((o) => o.id === attachment.obstacleId);
  if (!resource || !obstacle) {
    throw new LayoutAttachmentError([`${attachment.stationId}: candidate is missing its resource or obstacle`]);
  }
  return {
    stationId: attachment.stationId,
    resourceId: attachment.resourceId,
    obstacleId: attachment.obstacleId,
    assetRef: attachment.assetRef,
    centreMm: { x: (obstacle.minXMm + obstacle.maxXMm) / 2, z: (obstacle.minZMm + obstacle.maxZMm) / 2 },
    obstacleRectMm: { minXMm: obstacle.minXMm, minZMm: obstacle.minZMm, maxXMm: obstacle.maxXMm, maxZMm: obstacle.maxZMm },
    servicePositions: resource.servicePositions.map((s) => ({ ...s })),
    queueSlots: resource.queueSlots.map((s) => ({ ...s })),
  };
}

export type CandidateBundle = {
  scenario: OperationsScenario;
  transform: {
    entityId: string;
    fromCentreMm: XzMm;
    toCentreMm: XzMm;
    deltaMm: { dx: number; dz: number };
  };
  attachmentsBefore: StationAttachment;
  attachmentsAfter: StationAttachment;
  // Viewer placement resolved from the candidate bundle itself.
  viewerPlacement: StationAttachment;
  changedFields: string[];
};

// Generic leaf diff with JSON-pointer paths (array indices preserved).
export function diffPaths(before: unknown, after: unknown, base = ""): string[] {
  if (Object.is(before, after)) return [];
  const beforeIsObj = typeof before === "object" && before !== null;
  const afterIsObj = typeof after === "object" && after !== null;
  if (!beforeIsObj || !afterIsObj || Array.isArray(before) !== Array.isArray(after)) {
    return [base || "/"];
  }
  const out: string[] = [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i += 1) out.push(...diffPaths(before[i], after[i], `${base}/${i}`));
    return out;
  }
  const keys = new Set([...Object.keys(before as Record<string, unknown>), ...Object.keys(after as Record<string, unknown>)]);
  for (const key of [...keys].sort()) {
    out.push(...diffPaths((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], `${base}/${key}`));
  }
  return out;
}

export function getAtJsonPath(value: unknown, pointer: string): unknown {
  let current: unknown = value;
  for (const part of pointer.split("/").filter((p) => p.length > 0)) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// A changed leaf is an allowed layout change only when it is a coordinate
// of the moved station's obstacle rect or of its service/queue slots.
export function isAllowedLayoutPath(path: string, baseline: OperationsScenario, attachment: StationAttachment): boolean {
  const parts = path.split("/").filter((p) => p.length > 0);
  if (parts[0] === "geometry" && parts[1] === "obstacles") {
    const obstacle = baseline.geometry.obstacles[Number(parts[2])];
    return obstacle?.id === attachment.obstacleId && ["minXMm", "maxXMm", "minZMm", "maxZMm"].includes(parts[3] ?? "");
  }
  if (parts[0] === "resources") {
    const resource = baseline.resources[Number(parts[1])];
    if (resource?.id !== attachment.resourceId) return false;
    if (parts[2] === "servicePositions" || parts[2] === "queueSlots") {
      return parts.length === 5 && (parts[4] === "x" || parts[4] === "z");
    }
    return false;
  }
  return false;
}

export function applyPackingStationTranslation(
  baselineRaw: OperationsScenario,
  proposal: PackingStationTranslationProposal,
  attachments: Map<string, StationAttachment>,
): CandidateBundle {
  const baseline = parseOperationsScenario(structuredClone(baselineRaw));
  const attachment = attachments.get(proposal.entityId);
  if (!attachment) {
    throw new Error(`no validated attachment bundle for station ${proposal.entityId}`);
  }
  if (attachment.stationId !== proposal.entityId || attachment.resourceId !== proposal.entityId) {
    throw new Error(`attachment ownership mismatch: proposal entity ${proposal.entityId} resolves to station ${attachment.stationId} / resource ${attachment.resourceId}; aliases never move another station`);
  }
  const { centreMm: toCentreMm, deltaMm } = resolveTargetCentre(proposal, attachment.centreMm);
  const candidate = structuredClone(baseline) as OperationsScenario;
  const obstacle = candidate.geometry.obstacles.find((o) => o.id === attachment.obstacleId);
  const resource = candidate.resources.find((r) => r.id === attachment.resourceId);
  if (!obstacle || !resource) throw new Error(`station ${proposal.entityId} geometry missing after clone`);
  // Exact rigid translation of every attached coordinate. Nothing else moves.
  obstacle.minXMm += deltaMm.dx;
  obstacle.maxXMm += deltaMm.dx;
  obstacle.minZMm += deltaMm.dz;
  obstacle.maxZMm += deltaMm.dz;
  for (const slot of resource.servicePositions) {
    slot.x += deltaMm.dx;
    slot.z += deltaMm.dz;
  }
  for (const slot of resource.queueSlots) {
    slot.x += deltaMm.dx;
    slot.z += deltaMm.dz;
  }
  const parsed = parseOperationsScenario(candidate);
  const attachmentsAfter = viewerPlacementFromCandidate(parsed, attachment);
  return {
    scenario: parsed,
    transform: {
      entityId: proposal.entityId,
      fromCentreMm: { ...attachment.centreMm },
      toCentreMm,
      deltaMm,
    },
    attachmentsBefore: structuredClone(attachment),
    attachmentsAfter,
    viewerPlacement: structuredClone(attachmentsAfter),
    changedFields: diffPaths(baseline, parsed),
  };
}
