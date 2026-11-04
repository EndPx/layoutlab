import {
  createOperationsController,
  createTransportNav,
  parseOperationsExecutionConfig,
  parseOperationsScenario,
  type OperationsExecutionConfig,
  type OperationsScenario,
} from "@layoutlab/simulation";
import {
  applyPackingStationTranslation,
  diffPaths,
  getAtJsonPath,
  isAllowedLayoutPath,
  type StationAttachment,
} from "./attachments.js";
import {
  parseApprovedConstraints,
  parseLayoutProposal,
  validateProposalAgainstBaseline,
  validateResolvedTransform,
  type ApprovedLayoutConstraints,
  type LayoutIssue,
  type RectMm,
} from "./contract.js";
import { canonicalStringify } from "./hash.js";

export type RouteCheck = {
  fromLabel: string;
  toLabel: string;
  status: "ok" | "rejected";
  totalDistanceMm: number | null;
  // Nav reason only (e.g. NO_PATH). A specific blocker entity is named only
  // by the rect checks, where the pair is proven by arithmetic.
  reason: string | null;
};

export type LayoutValidation = {
  /** True only when the candidate itself is fully valid (no remaining errors). */
  ok: boolean;
  baselineValid: boolean;
  candidateValid: boolean;
  /** All candidate-side blockers (proposal/approved structure + candidate geometry). */
  issues: LayoutIssue[];
  baselineIssues: LayoutIssue[];
  candidateIssues: LayoutIssue[];
  /** Diagnosis: candidate errors whose signature is absent from the baseline. */
  introducedIssues: LayoutIssue[];
  /** Diagnosis: baseline errors whose signature is absent from the candidate. */
  repairedIssues: LayoutIssue[];
  /** @deprecated Alias of introducedIssues (diagnosis only, never validity). */
  candidateOnlyIssues: LayoutIssue[];
  routes: RouteCheck[];
};

function rectOfObstacle(o: { minXMm: number; minZMm: number; maxXMm: number; maxZMm: number }): RectMm {
  return { minXMm: o.minXMm, minZMm: o.minZMm, maxXMm: o.maxXMm, maxZMm: o.maxZMm };
}
function rackRect(r: OperationsScenario["geometry"]["racks"][number]): RectMm {
  return {
    minXMm: r.positionMm.x - r.dimensionsMm.width / 2,
    maxXMm: r.positionMm.x + r.dimensionsMm.width / 2,
    minZMm: r.positionMm.z - r.dimensionsMm.depth / 2,
    maxZMm: r.positionMm.z + r.dimensionsMm.depth / 2,
  };
}
function interiorOverlap(a: RectMm, b: RectMm): boolean {
  return Math.max(a.minXMm, b.minXMm) < Math.min(a.maxXMm, b.maxXMm) && Math.max(a.minZMm, b.minZMm) < Math.min(a.maxZMm, b.maxZMm);
}
function pointInRectInclusive(x: number, z: number, r: RectMm): boolean {
  return x >= r.minXMm && x <= r.maxXMm && z >= r.minZMm && z <= r.maxZMm;
}
function issueKey(i: LayoutIssue): string {
  return `${i.code}|${i.entityId ?? ""}|${i.relatedEntityId ?? ""}|${i.field ?? ""}`;
}

// Mandatory access semantics (supported, declared):
// - packing service/queue slots: picker agents travel there with loads, so
//   clearance + navigability for every picker profile + routes parking->slot
//   and parking->every location approach are mandatory for pickers.
// - receiving service/queue slots: putaway agents collect there, so
//   clearance + navigability for every putaway profile + routes
//   parking->slot and receiving-service->every location approach.
// - dispatch service/queue slots: staffed service, no agent route is
//   physically required; only physical clearance (not covered by any
//   obstacle/rack rect) is mandatory.
// - every location approach: both roles travel there; clearance +
//   navigability for every mobile profile.
// - every parking slot (initial agent position): clearance + navigability
//   for its own agent profile.
// The same checks run on baseline and candidate. A blocker entity is named
// only when rect arithmetic proves the covering pair.
function geometryAccessIssuesFor(scenario: OperationsScenario): { issues: LayoutIssue[]; routes: RouteCheck[] } {
  const issues: LayoutIssue[] = [];
  const routes: RouteCheck[] = [];
  const room = scenario.geometry.room;
  const physical: { id: string; rect: RectMm }[] = [
    ...scenario.geometry.obstacles.map((o) => ({ id: o.id, rect: rectOfObstacle(o) })),
    ...scenario.geometry.racks.map((r) => ({ id: r.id, rect: rackRect(r) })),
  ];
  for (const obstacle of scenario.geometry.obstacles) {
    const rect = rectOfObstacle(obstacle);
    if (rect.minXMm < 0 || rect.minZMm < 0 || rect.maxXMm > room.widthMm || rect.maxZMm > room.depthMm) {
      issues.push({
        code: "OUT_OF_ROOM", severity: "error", entityId: obstacle.id, field: "obstacleRectMm",
        message: `obstacle ${obstacle.id} rect ${rect.minXMm}..${rect.maxXMm} x ${rect.minZMm}..${rect.maxZMm} leaves room 0..${room.widthMm} x 0..${room.depthMm}`,
      });
    }
  }
  for (let i = 0; i < physical.length; i += 1) {
    for (let j = i + 1; j < physical.length; j += 1) {
      const a = physical[i] as { id: string; rect: RectMm };
      const b = physical[j] as { id: string; rect: RectMm };
      if (interiorOverlap(a.rect, b.rect)) {
        issues.push({
          code: "OVERLAP", severity: "error", entityId: a.id, relatedEntityId: b.id, field: "rect",
          message: `physical rect ${a.id} overlaps ${b.id} (interior overlap proven by rect arithmetic)`,
        });
      }
    }
  }
  const nav = createTransportNav(scenario);
  const pickers = scenario.mobileUnits.filter((u) => u.role === "picker");
  const putaways = scenario.mobileUnits.filter((u) => u.role === "putaway");
  const checkPoint = (
    ownerId: string,
    slotId: string,
    point: { x: number; z: number },
    navigableFor: OperationsScenario["mobileUnits"],
    coverCode: string,
  ): void => {
    if (point.x < 0 || point.z < 0 || point.x > room.widthMm || point.z > room.depthMm) {
      issues.push({
        code: "OUT_OF_ROOM", severity: "error", entityId: ownerId, field: slotId,
        message: `${slotId} at (${point.x},${point.z}) leaves room 0..${room.widthMm} x 0..${room.depthMm}`,
      });
    }
    for (const other of physical) {
      if (pointInRectInclusive(point.x, point.z, other.rect)) {
        issues.push({
          code: coverCode, severity: "error", entityId: ownerId, relatedEntityId: other.id, field: slotId,
          message: `${slotId} at (${point.x},${point.z}) lies inside physical rect ${other.id} (point-in-rect proven)`,
        });
      }
    }
    for (const unit of navigableFor) {
      if (!nav.isStaticNavigable({ x: point.x, z: point.z }, unit.id)) {
        issues.push({
          code: "SLOT_UNNAVIGABLE", severity: "error", entityId: ownerId, field: slotId,
          message: `${slotId} at (${point.x},${point.z}) is not statically navigable for ${unit.role} ${unit.id} (its footprint radius clears no position there)`,
        });
      }
    }
  };
  for (const resource of scenario.resources) {
    const profiles = resource.kind === "packing" ? pickers : resource.kind === "receiving" ? putaways : [];
    for (const slot of [...resource.servicePositions, ...resource.queueSlots]) {
      checkPoint(resource.id, slot.id, slot, profiles, "CLEARANCE_VIOLATION");
    }
  }
  for (const location of scenario.locations) {
    checkPoint(location.id, `${location.id}:approach`, location.approachPointMm, scenario.mobileUnits, "CLEARANCE_VIOLATION");
  }
  for (const unit of scenario.mobileUnits) {
    checkPoint(unit.id, `${unit.id}:parking`, unit.parkingSlotMm, [unit], "CLEARANCE_VIOLATION");
  }
  if (pickers.length === 0 && scenario.resources.some((r) => r.kind === "packing")) {
    issues.push({ code: "NO_ELIGIBLE_AGENT", severity: "error", entityId: null, message: "scenario has packing resources but no picker eligible to serve them" });
  }
  if (putaways.length === 0 && scenario.resources.some((r) => r.kind === "receiving")) {
    issues.push({ code: "NO_ELIGIBLE_AGENT", severity: "error", entityId: null, message: "scenario has receiving resources but no putaway unit eligible to serve it" });
  }
  const addRoute = (entityId: string, fromLabel: string, from: { x: number; z: number }, toLabel: string, to: { x: number; z: number }, unitId: string): void => {
    const route = nav.findStaticRoute({ ...from }, { ...to }, unitId);
    routes.push({
      fromLabel, toLabel, status: route.status,
      totalDistanceMm: route.status === "ok" ? route.totalDistanceMm : null,
      reason: route.status === "rejected" ? route.reason : null,
    });
    if (route.status === "rejected") {
      issues.push({
        code: "ROUTE_UNREACHABLE", severity: "error", entityId, field: `${fromLabel}->${toLabel}`,
        message: `no static route from ${fromLabel} (${from.x},${from.z}) to ${toLabel} (${to.x},${to.z}) for unit ${unitId}: ${route.reason}`,
      });
    }
  };
  const packingResources = scenario.resources.filter((r) => r.kind === "packing");
  const receivingResources = scenario.resources.filter((r) => r.kind === "receiving");
  for (const picker of pickers) {
    for (const location of scenario.locations) {
      addRoute(location.id, `${picker.id}:parking`, picker.parkingSlotMm, `${location.id}:approach`, location.approachPointMm, picker.id);
    }
    for (const resource of packingResources) {
      for (const slot of [...resource.servicePositions, ...resource.queueSlots]) {
        addRoute(resource.id, `${picker.id}:parking`, picker.parkingSlotMm, `${resource.id}:${slot.id}`, slot, picker.id);
      }
    }
  }
  for (const putaway of putaways) {
    for (const resource of receivingResources) {
      for (const slot of [...resource.servicePositions, ...resource.queueSlots]) {
        addRoute(resource.id, `${putaway.id}:parking`, putaway.parkingSlotMm, `${resource.id}:${slot.id}`, slot, putaway.id);
      }
      for (const service of resource.servicePositions) {
        for (const location of scenario.locations) {
          addRoute(location.id, `${putaway.id}@${resource.id}:${service.id}`, service, `${location.id}:approach`, location.approachPointMm, putaway.id);
        }
      }
    }
  }
  return { issues, routes };
}

export async function validateLayoutCandidate(input: {
  baselineScenario: OperationsScenario;
  // When omitted, the candidate is reconstructed from baseline + proposal.
  candidateScenario?: OperationsScenario;
  proposal: unknown;
  attachments: Map<string, StationAttachment>;
  // Approved authority from the user/server context. Required; a proposal
  // can never supply or raise its own budgets (see contract.ts).
  approvedConstraints: unknown;
  executionConfig?: OperationsExecutionConfig;
}): Promise<LayoutValidation> {
  const baseline = parseOperationsScenario(structuredClone(input.baselineScenario));
  const baselineGeo = geometryAccessIssuesFor(baseline);
  const finish = (structural: LayoutIssue[], candidate: OperationsScenario | null, candidateGeo: { issues: LayoutIssue[]; routes: RouteCheck[] } | null): LayoutValidation => {
    const baselineIssues = [...baselineGeo.issues];
    const candidateIssues = candidateGeo ? [...candidateGeo.issues] : [];
    if (input.executionConfig) {
      const config = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
      try {
        createOperationsController({ scenario: structuredClone(baseline), executionConfig: config });
      } catch (error) {
        baselineIssues.push({
          code: "ENGINE_ADMISSION_FAILED", severity: "error", entityId: null, field: "baseline",
          message: `baseline rejected by operations controller: ${error instanceof Error ? error.message : "admission failed"}`,
        });
      }
      if (candidate) {
        try {
          createOperationsController({ scenario: structuredClone(candidate), executionConfig: config });
        } catch (error) {
          candidateIssues.push({
            code: "ENGINE_ADMISSION_FAILED", severity: "error", entityId: null, field: "candidate",
            message: `candidate rejected by operations controller: ${error instanceof Error ? error.message : "admission failed"}`,
          });
        }
      }
    }
    const baseKeys = new Set(baselineIssues.map(issueKey));
    const candKeys = new Set(candidateIssues.map(issueKey));
    const introducedIssues = candidateIssues.filter((i) => !baseKeys.has(issueKey(i))).map((i) => ({ ...i, introduced: true }));
    const introducedKeys = new Set(introducedIssues.map(issueKey));
    for (const candidateIssue of candidateIssues) candidateIssue.introduced = introducedKeys.has(issueKey(candidateIssue));
    const repairedIssues = baselineIssues.filter((i) => !candKeys.has(issueKey(i)));
    const issues = [...structural, ...candidateIssues];
    const candidateValid = structural.length === 0 && candidateIssues.length === 0;
    return {
      ok: candidateValid,
      baselineValid: baselineIssues.length === 0,
      candidateValid,
      issues,
      baselineIssues,
      candidateIssues,
      introducedIssues,
      repairedIssues,
      candidateOnlyIssues: introducedIssues,
      routes: candidateGeo?.routes ?? [],
    };
  };
  const parsed = parseLayoutProposal(input.proposal);
  if (!parsed.ok) return finish(parsed.issues, null, null);
  if (!parsed.supported) {
    return finish([{
      code: "UNSUPPORTED_TRANSFORM", severity: "error",
      entityId: parsed.proposal.entityId || null, field: "kind",
      message: `transform kind ${parsed.proposal.kind} is explicitly unsupported in L0 (forward-compatible contract only; not silently ignored)`,
    }], null, null);
  }
  const proposal = parsed.proposal;
  const approvedParsed = parseApprovedConstraints(input.approvedConstraints);
  if (!approvedParsed.ok) return finish(approvedParsed.issues, null, null);
  const approved: ApprovedLayoutConstraints = approvedParsed.constraints;
  const structural: LayoutIssue[] = [];
  structural.push(...(await validateProposalAgainstBaseline(proposal, baseline, new Set(input.attachments.keys()), approved)));
  const attachment = input.attachments.get(proposal.entityId);
  if (attachment && (attachment.stationId !== proposal.entityId || attachment.resourceId !== proposal.entityId)) {
    structural.push({
      code: "OWNERSHIP_MISMATCH", severity: "error", entityId: proposal.entityId,
      message: `attachment for ${proposal.entityId} names station ${attachment.stationId} / resource ${attachment.resourceId}; aliases cannot move another station`,
    });
  }
  let candidate: OperationsScenario | null = null;
  if (attachment && attachment.stationId === proposal.entityId && attachment.resourceId === proposal.entityId) {
    structural.push(...validateResolvedTransform(proposal, attachment.centreMm, approved).issues);
    try {
      const bundle = applyPackingStationTranslation(baseline, proposal, input.attachments);
      candidate = input.candidateScenario ? parseOperationsScenario(structuredClone(input.candidateScenario)) : bundle.scenario;
      if (input.candidateScenario) {
        // Compare full VALUES against the reconstruction, not merely the
        // set of changed leaf paths: deforming an attached coordinate by
        // any amount (keeping the same paths) is a mismatch. Every changed
        // leaf outside the bundle is additionally an exogenous change.
        const paths = new Set([...diffPaths(baseline, candidate), ...diffPaths(baseline, bundle.scenario)]);
        for (const path of paths) {
          const candidateValue = getAtJsonPath(candidate, path);
          const reconstructedValue = getAtJsonPath(bundle.scenario, path);
          if (canonicalStringify(candidateValue) !== canonicalStringify(reconstructedValue)) {
            structural.push({
              code: "CANDIDATE_VALUE_MISMATCH", severity: "error", entityId: proposal.entityId, field: path,
              message: `candidate value at ${path} is ${canonicalStringify(candidateValue)} but baseline + proposal rigid translation requires ${canonicalStringify(reconstructedValue)} (attached offsets must remain exact)`,
            });
          }
          if (!isAllowedLayoutPath(path, baseline, attachment) && canonicalStringify(getAtJsonPath(baseline, path)) !== canonicalStringify(candidateValue)) {
            structural.push({
              code: "EXOGENOUS_CHANGE", severity: "error", entityId: proposal.entityId, field: path,
              message: `candidate changes ${path}, which is outside the moved station's attached coordinates (matched worker count/service/workload/seed/geometry is required)`,
            });
          }
        }
      }
    } catch (error) {
      structural.push({
        code: "CANONICAL_SCENARIO_INVALID", severity: "error", entityId: proposal.entityId,
        message: `candidate scenario rejected by canonical parser: ${error instanceof Error ? error.message : "invalid scenario"}`,
      });
      candidate = null;
    }
  }
  const candidateGeo = candidate ? geometryAccessIssuesFor(candidate) : null;
  return finish(structural, candidate, candidateGeo);
}
