// Maintained isolated tests for the L0 layout draft (revision 2). Run via
// scripts/layout-planning-test.mjs (compiles layout-draft only, never the
// shared simulation dist). Expected coordinates/timings are literals
// derived from the fixture/bindings and hand arithmetic, not copied from
// the code under test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { parseOperationsScenario } from "@layoutlab/simulation";
import * as draft from "@layoutlab/simulation";

const root = new URL("../../../../", import.meta.url);
const mainRaw = JSON.parse(readFileSync(new URL("fixtures/operations/main-warehouse.json", root), "utf8"));
const bindings = JSON.parse(readFileSync(new URL("fixtures/operations/main-warehouse.bindings.json", root), "utf8"));
const MAIN_CONFIG = { pickDurationMsPerItem: 2000, unloadDurationMsPerItem: 1500 };
const APPROVED_MAIN = () => draft.defaultApprovedConstraints(["PACK-1", "PACK-2", "RCV-1"]);
const APPROVED_CORRIDOR = () => draft.defaultApprovedConstraints(["PACK-1"]);

async function mainSetup() {
  const baseline = parseOperationsScenario(structuredClone(mainRaw));
  const attachments = draft.attachmentsFromBindings(baseline, bindings);
  const parent = {
    scenarioId: baseline.id,
    scenarioContentSha256: await draft.contentSha256(baseline),
    schemaVersion: baseline.schemaVersion,
    engineVersion: baseline.engineVersion,
  };
  return { baseline, attachments, parent };
}
function mainProposal(parent, target, entityId = "PACK-1") {
  return { kind: "PACKING_STATION_TRANSLATION", proposalId: "test-main", parent, entityId, target };
}
async function corridorSetup() {
  const raw = draft.buildCorridorScenario(8000);
  const baseline = parseOperationsScenario(raw);
  const parent = {
    scenarioId: baseline.id,
    scenarioContentSha256: await draft.contentSha256(baseline),
    schemaVersion: baseline.schemaVersion,
    engineVersion: baseline.engineVersion,
  };
  const proposal = (target) => ({ kind: "PACKING_STATION_TRANSLATION", proposalId: "test-corridor", parent, entityId: "PACK-1", target });
  const attachments = draft.buildStationAttachmentMap(baseline, [draft.corridorAttachment(8000)]);
  return { raw, baseline, parent, proposal, attachments };
}
const codes = (list) => list.map((i) => i.code);

test("literal before/after: PACK-1 north move translates only its bundle (main fixture)", async () => {
  const { baseline, attachments, parent } = await mainSetup();
  const hashBefore = await draft.contentSha256(baseline);
  const proposal = mainProposal(parent, { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 20500, z: 4000 } });
  const bundle = draft.applyPackingStationTranslation(baseline, draft.parseLayoutProposal(proposal).proposal, attachments);
  const obstacle = bundle.scenario.geometry.obstacles.find((o) => o.id === "OB-PACK1");
  assert.deepEqual([obstacle.minXMm, obstacle.maxXMm, obstacle.minZMm, obstacle.maxZMm], [19566, 21434, 3390, 4610]);
  const pack1 = bundle.scenario.resources.find((r) => r.id === "PACK-1");
  assert.deepEqual(pack1.servicePositions, [{ id: "PACK1-S1", x: 20500, z: 5900 }]);
  assert.deepEqual(pack1.queueSlots, [
    { id: "PACK1-Q1", x: 22500, z: 5900 },
    { id: "PACK1-Q2", x: 22500, z: 7600 },
    { id: "PACK1-Q3", x: 22500, z: 9300 },
  ]);
  const pack2 = bundle.scenario.resources.find((r) => r.id === "PACK-2");
  assert.deepEqual(pack2.servicePositions, [{ id: "PACK2-S1", x: 20500, z: 12900 }]);
  assert.deepEqual(bundle.viewerPlacement.centreMm, { x: 20500, z: 4000 });
  assert.equal(await draft.contentSha256(baseline), hashBefore);
  const validation = await draft.validateLayoutCandidate({ baselineScenario: baseline, proposal, attachments, approvedConstraints: APPROVED_MAIN(), executionConfig: MAIN_CONFIG });
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  assert.equal(validation.baselineValid, true);
  assert.equal(validation.candidateValid, true);
});

test("attachment ownership: wrong centre, PACK-1->PACK-2 alias, duplicates and canonical swap all throw", async () => {
  const { baseline } = await mainSetup();
  const wrong = draft.MAIN_WAREHOUSE_ATTACHMENTS.map((a) => (a.stationId === "PACK-1" ? { ...a, centreMm: { x: 20501, z: 5000 } } : a));
  assert.throws(() => draft.buildStationAttachmentMap(baseline, wrong), /attachment map does not match/);
  // Review reproduction: stationId PACK-1 aliased onto PACK-2's real bundle.
  const alias = structuredClone(draft.MAIN_WAREHOUSE_ATTACHMENTS.find((a) => a.stationId === "PACK-2"));
  alias.stationId = "PACK-1";
  assert.throws(() => draft.buildStationAttachmentMap(baseline, [alias]), /stationId must equal resourceId/);
  const duplicate = [draft.MAIN_WAREHOUSE_ATTACHMENTS[0], draft.MAIN_WAREHOUSE_ATTACHMENTS[0]];
  assert.throws(() => draft.buildStationAttachmentMap(baseline, duplicate), /duplicate|already claimed/);
  // Coherent-looking swap: PACK-1 slots with PACK-2's obstacle/centre.
  const swap = structuredClone(draft.MAIN_WAREHOUSE_ATTACHMENTS[0]);
  swap.obstacleId = "OB-PACK2";
  swap.centreMm = { x: 20500, z: 11000 };
  swap.obstacleRectMm = { minXMm: 19566, minZMm: 10390, maxXMm: 21434, maxZMm: 11610 };
  assert.throws(() => draft.buildStationAttachmentMap(baseline, [swap]), /canonical main-warehouse-1 ownership/);
});

test("hand oracle: one-order corridor travel+handling sums (28000 -> 30000, delta +2000)", async () => {
  // parking->approach 2000 + pick 2*2000=4000 + approach->queue 3000 (base)
  // + queue->service 2000 + unload 2*1000=2000 + packing 10000 + dispatch
  // 5000 = 28000. Moving packing +2000mm east: approach->queue 5000 -> 30000.
  const { raw, proposal, attachments } = await corridorSetup();
  const result = await draft.runLayoutComparison({
    baselineScenario: raw, executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    proposal: proposal({ mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } }),
    attachments: [draft.corridorAttachment(8000)], approvedConstraints: APPROVED_CORRIDOR(),
  });
  assert.equal(result.validation.ok, true, JSON.stringify(result.validation.issues));
  assert.equal(result.baselineReport.orders[0].timestamps.SHIPPED, 28000);
  assert.equal(result.candidateReport.orders[0].timestamps.SHIPPED, 30000);
  assert.equal(result.delta.makespanMs, 2000);
  assert.equal(result.improvement, "worse");
  assert.equal(result.measurement, "measured");
  assert.equal(result.evaluationScope.truncated, false);
});

test("no-change candidate: identical counts/times, and zero budget handled consistently", async () => {
  const { raw, baseline, proposal, attachments } = await corridorSetup();
  const result = await draft.runLayoutComparison({
    baselineScenario: raw, executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    proposal: proposal({ mode: "DELTA_MM", deltaMm: { dx: 0, dz: 0 } }),
    attachments: [draft.corridorAttachment(8000)], approvedConstraints: APPROVED_CORRIDOR(),
  });
  assert.deepEqual(result.candidateMetrics, result.baselineMetrics);
  assert.equal(result.delta.makespanMs, 0);
  assert.equal(result.improvement, "no-improvement");
  const zeroBudget = { ...APPROVED_CORRIDOR(), maxMovedEntities: 0, maxTranslationMm: 0 };
  const noChange = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: zeroBudget,
    proposal: proposal({ mode: "DELTA_MM", deltaMm: { dx: 0, dz: 0 } }),
  });
  assert.equal(noChange.ok, true, JSON.stringify(noChange.issues));
  const realMove = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: zeroBudget,
    proposal: proposal({ mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } }),
  });
  assert.equal(realMove.ok, false);
  assert.ok(codes(realMove.issues).includes("MOVE_BUDGET_EXCEEDED"));
});

test("rejected geometry returns no measured performance", async () => {
  const { raw, proposal } = await corridorSetup();
  const result = await draft.runLayoutComparison({
    baselineScenario: raw, executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    proposal: proposal({ mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 500, z: 1100 } }),
    attachments: [draft.corridorAttachment(8000)], approvedConstraints: APPROVED_CORRIDOR(),
  });
  assert.equal(result.validation.ok, false);
  assert.ok(codes(result.validation.candidateIssues).includes("OUT_OF_ROOM") || codes(result.validation.issues).includes("OUT_OF_ROOM"));
  assert.equal(result.baselineReport, null);
  assert.equal(result.candidateReport, null);
  assert.equal(result.measurement, "not-measured");
  assert.equal(result.improvement, "not-measured");
});

test("review fix 1: supplied candidate deforming a service offset (same changed paths) is rejected by value", async () => {
  const { baseline, proposal, attachments } = await corridorSetup();
  const p = proposal({ mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } });
  const bundle = draft.applyPackingStationTranslation(baseline, draft.parseLayoutProposal(p).proposal, attachments);
  const tampered = structuredClone(bundle.scenario);
  tampered.resources.find((r) => r.id === "PACK-1").servicePositions[0].x += 1000;
  const validation = await draft.validateLayoutCandidate({
    baselineScenario: baseline, candidateScenario: tampered, proposal: p, attachments,
    approvedConstraints: APPROVED_CORRIDOR(), executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
  });
  assert.equal(validation.ok, false);
  assert.equal(validation.candidateValid, false);
  assert.ok(validation.issues.some((i) => i.code === "CANDIDATE_VALUE_MISMATCH" && (i.field ?? "").endsWith("servicePositions/0/x")), JSON.stringify(validation.issues));
});

test("review fix 2: pre-existing blocked approach persisting in candidate keeps candidate invalid", async () => {
  const { raw, proposal, attachments } = await corridorSetup();
  const blockedRaw = structuredClone(raw);
  blockedRaw.geometry.obstacles.push({ id: "OB-BLOCK", minXMm: 2800, minZMm: 2800, maxXMm: 3200, maxZMm: 3200 });
  const blockedBase = parseOperationsScenario(blockedRaw);
  const blockedAttachments = draft.buildStationAttachmentMap(blockedBase, [draft.corridorAttachment(8000)]);
  const parent = { scenarioId: blockedBase.id, scenarioContentSha256: await draft.contentSha256(blockedBase), schemaVersion: blockedBase.schemaVersion, engineVersion: blockedBase.engineVersion };
  const validation = await draft.validateLayoutCandidate({
    baselineScenario: blockedBase, attachments: blockedAttachments, approvedConstraints: APPROVED_CORRIDOR(),
    proposal: { kind: "PACKING_STATION_TRANSLATION", proposalId: "t-blocked", parent, entityId: "PACK-1", target: { mode: "DELTA_MM", deltaMm: { dx: 1000, dz: 0 } } },
  });
  assert.equal(validation.baselineValid, false);
  assert.equal(validation.candidateValid, false);
  assert.equal(validation.ok, false);
  // Diagnosis still attributes the approach failure as not introduced...
  assert.ok(!validation.introducedIssues.some((i) => i.entityId === "L-A1"), JSON.stringify(validation.introducedIssues));
  // ...but it remains a candidate error, so there is no suppression.
  assert.ok(validation.candidateIssues.some((i) => i.entityId === "L-A1"));
  void proposal; void attachments;
});

test("review fix 2b: candidate repairing a baseline-blocked station is a candidate-only preview, no fabricated baseline", async () => {
  const { raw } = await corridorSetup();
  const walledRaw = structuredClone(raw);
  walledRaw.geometry.obstacles.push({ id: "OB-WALL", minXMm: 8500, minZMm: 2500, maxXMm: 9500, maxZMm: 3500 });
  const walledBase = parseOperationsScenario(walledRaw);
  const attachments = draft.buildStationAttachmentMap(walledBase, [draft.corridorAttachment(8000)]);
  const parent = { scenarioId: walledBase.id, scenarioContentSha256: await draft.contentSha256(walledBase), schemaVersion: walledBase.schemaVersion, engineVersion: walledBase.engineVersion };
  const proposal = { kind: "PACKING_STATION_TRANSLATION", proposalId: "t-repair", parent, entityId: "PACK-1", target: { mode: "DELTA_MM", deltaMm: { dx: -3000, dz: 0 } } };
  const validation = await draft.validateLayoutCandidate({ baselineScenario: walledBase, attachments, approvedConstraints: APPROVED_CORRIDOR(), proposal });
  assert.equal(validation.baselineValid, false, JSON.stringify(validation.baselineIssues));
  assert.equal(validation.candidateValid, true, JSON.stringify(validation.issues));
  assert.ok(validation.repairedIssues.length > 0);
  const result = await draft.runLayoutComparison({
    baselineScenario: walledRaw, executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    proposal, attachments: [draft.corridorAttachment(8000)], approvedConstraints: APPROVED_CORRIDOR(),
  });
  assert.equal(result.measurement, "candidate-only-repaired");
  assert.equal(result.baselineReport, null);
  assert.notEqual(result.candidateReport, null);
  assert.equal(result.delta, null);
  assert.equal(result.improvement, "not-measured");
  assert.equal(await draft.verifyLayoutComparison(result).then((v) => v.ok), true);
});

test("review fix 3: moving PACK-1 over the unmoved dispatch service point is rejected with proven blocker", async () => {
  const { baseline, proposal, attachments } = await corridorSetup();
  const validation = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: APPROVED_CORRIDOR(),
    executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    // Centre (8000,1100) + (4000,1900) = (12000,3000): station rect covers DSP-S1 (12000,3000).
    proposal: proposal({ mode: "DELTA_MM", deltaMm: { dx: 4000, dz: 1900 } }),
  });
  assert.equal(validation.ok, false);
  const cover = validation.candidateIssues.find((i) => i.code === "CLEARANCE_VIOLATION" && i.entityId === "DSP-1");
  assert.ok(cover, JSON.stringify(validation.candidateIssues));
  assert.equal(cover.relatedEntityId, "OB-PACK1");
});

test("eligible profiles: every picker gets location and packing route legs (not only the first)", async () => {
  const { raw, proposal, attachments } = await corridorSetup();
  const twoPickerRaw = structuredClone(raw);
  twoPickerRaw.mobileUnits.push({
    id: "PK-2", role: "picker",
    footprintMm: { width: 800, length: 1400, margin: 100 },
    speedMmPerSecond: 800, loadCapacityUnits: 10,
    eligibleHandlingClasses: ["ambient"],
    parkingSlotMm: { x: 1000, z: 4500 },
  });
  const base2 = parseOperationsScenario(twoPickerRaw);
  const parent2 = { scenarioId: base2.id, scenarioContentSha256: await draft.contentSha256(base2), schemaVersion: base2.schemaVersion, engineVersion: base2.engineVersion };
  const validation = await draft.validateLayoutCandidate({
    baselineScenario: base2, attachments, approvedConstraints: APPROVED_CORRIDOR(),
    proposal: { kind: "PACKING_STATION_TRANSLATION", proposalId: "t-profiles", parent: parent2, entityId: "PACK-1", target: { mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } } },
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  assert.ok(validation.routes.some((r) => r.fromLabel === "PK-2:parking" && r.toLabel === "L-A1:approach"));
  assert.ok(validation.routes.some((r) => r.fromLabel === "PK-2:parking" && r.toLabel === "PACK-1:PACK1-S1"));
  void proposal;
});

test("illegal overlap, locked receiving (even when approved omits the lock), stale, lower budgets, off-grid", async () => {
  const { baseline, attachments, parent } = await mainSetup();
  const ontoRack = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: APPROVED_MAIN(), executionConfig: MAIN_CONFIG,
    proposal: mainProposal(parent, { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 16000, z: 6000 } }),
  });
  assert.ok(codes(ontoRack.candidateIssues).includes("OVERLAP"));
  assert.equal(ontoRack.candidateIssues.find((i) => i.code === "OVERLAP").relatedEntityId, "R3");
  // Approved context tries to unlock receiving by omission + allow-listing.
  const unlockAttempt = { ...draft.defaultApprovedConstraints(["RCV-1", "PACK-1"]), lockedEntityIds: [] };
  const locked = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: unlockAttempt, executionConfig: MAIN_CONFIG,
    proposal: mainProposal(parent, { mode: "DELTA_MM", deltaMm: { dx: 100, dz: 0 } }, "RCV-1"),
  });
  assert.ok(codes(locked.issues).includes("LOCKED_ENTITY"), JSON.stringify(locked.issues));
  const stale = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: APPROVED_MAIN(), executionConfig: MAIN_CONFIG,
    proposal: mainProposal({ ...parent, scenarioContentSha256: "0".repeat(64) }, { mode: "DELTA_MM", deltaMm: { dx: 100, dz: 0 } }),
  });
  assert.ok(codes(stale.issues).includes("STALE_REVISION"));
  const { baseline: cBase, proposal: cProposal, attachments: cAtt } = await corridorSetup();
  // Lower authority budget than the proposal needs (approved side only).
  const lowerBudget = { ...APPROVED_CORRIDOR(), maxTranslationMm: 1000 };
  const overBudget = await draft.validateLayoutCandidate({
    baselineScenario: cBase, attachments: cAtt, approvedConstraints: lowerBudget,
    proposal: cProposal({ mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } }),
  });
  assert.ok(codes(overBudget.issues).includes("MOVE_BUDGET_EXCEEDED"));
  const offGrid = await draft.validateLayoutCandidate({
    baselineScenario: cBase, attachments: cAtt, approvedConstraints: APPROVED_CORRIDOR(),
    proposal: cProposal({ mode: "DELTA_MM", deltaMm: { dx: 150, dz: 0 } }),
  });
  assert.ok(codes(offGrid.issues).includes("OFF_GRID"));
  // A proposal carrying its own generous constraints is rejected outright:
  // a model cannot grant itself permission by editing its constraints.
  const selfGranted = await draft.validateLayoutCandidate({
    baselineScenario: cBase, attachments: cAtt, approvedConstraints: lowerBudget,
    proposal: { ...cProposal({ mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } }), constraints: draft.defaultApprovedConstraints(["PACK-1"]) },
  });
  assert.equal(selfGranted.ok, false);
  assert.ok(codes(selfGranted.issues).includes("SCHEMA_INVALID"), JSON.stringify(selfGranted.issues));
  // Missing approved context fails closed, never defaults.
  const noApproved = await draft.validateLayoutCandidate({
    baselineScenario: cBase, attachments: cAtt, approvedConstraints: undefined,
    proposal: cProposal({ mode: "DELTA_MM", deltaMm: { dx: 0, dz: 0 } }),
  });
  assert.equal(noApproved.ok, false);
  assert.ok(codes(noApproved.issues).includes("APPROVED_CONSTRAINTS_REQUIRED"));
});

test("blocked access: west PACK-1 move strands PACK1-Q3 against PACK-2", async () => {
  const { baseline, attachments, parent } = await mainSetup();
  const validation = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: APPROVED_MAIN(), executionConfig: MAIN_CONFIG,
    proposal: mainProposal(parent, { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 19500, z: 5000 } }),
  });
  assert.equal(validation.ok, false);
  assert.ok(codes(validation.candidateIssues).includes("SLOT_UNNAVIGABLE"), JSON.stringify(validation.candidateIssues));
  assert.ok(codes(validation.candidateIssues).includes("ROUTE_UNREACHABLE"));
});

test("unsupported transforms are explicit; agent teleport cannot be expressed", async () => {
  const { baseline, attachments, parent } = await mainSetup();
  const rack = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: APPROVED_MAIN(),
    proposal: { kind: "RACK_QUARTER_TURN", proposalId: "t-rack", entityId: "R1" },
  });
  assert.equal(rack.issues[0].code, "UNSUPPORTED_TRANSFORM");
  const agent = await draft.validateLayoutCandidate({
    baselineScenario: baseline, attachments, approvedConstraints: APPROVED_MAIN(),
    proposal: { kind: "AGENT_INITIAL_PLACEMENT", proposalId: "t-agent", entityId: "PK-1" },
  });
  assert.equal(agent.issues[0].code, "UNSUPPORTED_TRANSFORM");
  const smuggled = draft.parseLayoutProposal({ ...mainProposal(parent, { mode: "DELTA_MM", deltaMm: { dx: 100, dz: 0 } }), parkingSlotMm: { x: 1, z: 1 } });
  assert.equal(smuggled.ok, false);
  void parent;
});

test("changed service time or worker count in a supplied candidate is exogenous", async () => {
  const { baseline, attachments, parent } = await mainSetup();
  const proposal = mainProposal(parent, { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 20500, z: 4000 } });
  const bundle = draft.applyPackingStationTranslation(baseline, draft.parseLayoutProposal(proposal).proposal, attachments);
  const tamperedDuration = structuredClone(bundle.scenario);
  tamperedDuration.resources.find((r) => r.id === "PACK-1").serviceDurationMs = 1;
  const v1 = await draft.validateLayoutCandidate({ baselineScenario: baseline, candidateScenario: tamperedDuration, proposal, attachments, approvedConstraints: APPROVED_MAIN(), executionConfig: MAIN_CONFIG });
  assert.ok(v1.issues.some((i) => i.code === "EXOGENOUS_CHANGE" && (i.field ?? "").endsWith("serviceDurationMs")), JSON.stringify(v1.issues));
  const tamperedWorkers = structuredClone(bundle.scenario);
  tamperedWorkers.mobileUnits.push({ ...structuredClone(tamperedWorkers.mobileUnits[0]), id: "PK-EXTRA", parkingSlotMm: { x: 1000, z: 500 } });
  const v2 = await draft.validateLayoutCandidate({ baselineScenario: baseline, candidateScenario: tamperedWorkers, proposal, attachments, approvedConstraints: APPROVED_MAIN(), executionConfig: MAIN_CONFIG });
  assert.ok(v2.issues.some((i) => i.code === "EXOGENOUS_CHANGE"), JSON.stringify(v2.issues));
});

test("review fix 4: verifier validates the full envelope; clean and invalid exports stay verifiable", async () => {
  const { raw, proposal } = await corridorSetup();
  const clean = await draft.runLayoutComparison({
    baselineScenario: raw, executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    proposal: proposal({ mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } }),
    attachments: [draft.corridorAttachment(8000)], approvedConstraints: APPROVED_CORRIDOR(),
  });
  assert.equal((await draft.verifyLayoutComparison(clean)).ok, true);
  const tamperVersion = structuredClone(clean);
  tamperVersion.versions.operationsEngine = "invented";
  assert.equal((await draft.verifyLayoutComparison(tamperVersion)).ok, false);
  // Lowered approved budget, with the constraints hash honestly recomputed:
  // the rerun under that authority must refuse the move, so it still fails.
  const tamperBudget = structuredClone(clean);
  tamperBudget.approvedConstraints.maxTranslationMm = 1;
  tamperBudget.approvedConstraintsSha256 = await draft.contentSha256(tamperBudget.approvedConstraints);
  assert.equal((await draft.verifyLayoutComparison(tamperBudget)).ok, false);
  const missingApproved = structuredClone(clean);
  delete missingApproved.approvedConstraints;
  assert.equal((await draft.verifyLayoutComparison(missingApproved)).ok, false);
  const missingDelta = structuredClone(clean);
  delete missingDelta.delta;
  assert.equal((await draft.verifyLayoutComparison(missingDelta)).ok, false);
  const fabricated = structuredClone(clean);
  fabricated.candidateMetrics = null;
  assert.equal((await draft.verifyLayoutComparison(fabricated)).ok, false);
  const tamperCoord = structuredClone(clean);
  tamperCoord.candidateScenario.resources.find((r) => r.id === "PACK-1").queueSlots[0].x += 100;
  assert.equal((await draft.verifyLayoutComparison(tamperCoord)).ok, false);
  // An invalid (rejected-geometry) export is valid evidence of its outcome.
  const invalid = await draft.runLayoutComparison({
    baselineScenario: raw, executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    proposal: proposal({ mode: "ABSOLUTE_CENTER_MM", centerMm: { x: 500, z: 1100 } }),
    attachments: [draft.corridorAttachment(8000)], approvedConstraints: APPROVED_CORRIDOR(),
  });
  assert.equal(invalid.measurement, "not-measured");
  assert.equal((await draft.verifyLayoutComparison(invalid)).ok, true);
});

test("classification: mixed trade-offs are distinct from no measured change", () => {
  const base = { completionStage: "IN_PROGRESS", shipped: 7, backlog: 1, stageBacklog: 0, totalWaitMs: 2000, makespanMs: null, lastShippedAtMs: 5000, stopClockMs: 7200000 };
  assert.equal(draft.classifyImprovement(base, { ...base, totalWaitMs: 1000, lastShippedAtMs: 6000 }), "mixed");
  assert.equal(draft.classifyImprovement(base, { ...base }), "no-improvement");
  assert.equal(draft.classifyImprovement(base, { ...base, shipped: 8 }), "improved");
  assert.equal(draft.classifyImprovement(base, { ...base, shipped: 6 }), "worse");
});

test("sequential moves: a moved station is the next parent; stale old parent rejected; undo restores original", async () => {
  const { baseline, attachments, parent } = await mainSetup();
  const originalHash = await draft.contentSha256(baseline);
  const first = draft.applyPackingStationTranslation(
    baseline,
    draft.parseLayoutProposal(mainProposal(parent, { mode: "DELTA_MM", deltaMm: { dx: 0, dz: -1000 } })).proposal,
    attachments,
  );
  assert.deepEqual(first.attachmentsAfter.centreMm, { x: 20500, z: 4000 });
  // Carry the candidate's own attachment bundle forward as the declaration.
  const updated = draft.MAIN_WAREHOUSE_ATTACHMENTS.map((a) => (a.stationId === "PACK-1" ? first.attachmentsAfter : a));
  const nextMap = draft.buildStationAttachmentMap(first.scenario, updated);
  const parent2 = {
    scenarioId: first.scenario.id,
    scenarioContentSha256: await draft.contentSha256(first.scenario),
    schemaVersion: first.scenario.schemaVersion,
    engineVersion: first.scenario.engineVersion,
  };
  const secondProposal = mainProposal(parent2, { mode: "DELTA_MM", deltaMm: { dx: 0, dz: -1000 } });
  const secondValidation = await draft.validateLayoutCandidate({
    baselineScenario: first.scenario, proposal: secondProposal, attachments: nextMap,
    approvedConstraints: APPROVED_MAIN(), executionConfig: MAIN_CONFIG,
  });
  assert.equal(secondValidation.ok, true, JSON.stringify(secondValidation.issues));
  const second = draft.applyPackingStationTranslation(first.scenario, draft.parseLayoutProposal(secondProposal).proposal, nextMap);
  assert.deepEqual(second.attachmentsAfter.centreMm, { x: 20500, z: 3000 });
  const obstacle2 = second.scenario.geometry.obstacles.find((o) => o.id === "OB-PACK1");
  assert.deepEqual([obstacle2.minXMm, obstacle2.maxXMm, obstacle2.minZMm, obstacle2.maxZMm], [19566, 21434, 2390, 3610]);
  assert.deepEqual(second.scenario.resources.find((r) => r.id === "PACK-1").servicePositions, [{ id: "PACK1-S1", x: 20500, z: 4900 }]);
  // Stale: the original parent hash no longer authorises edits on the moved parent.
  const stale = await draft.validateLayoutCandidate({
    baselineScenario: first.scenario, attachments: nextMap, approvedConstraints: APPROVED_MAIN(),
    proposal: mainProposal(parent, { mode: "DELTA_MM", deltaMm: { dx: 0, dz: -1000 } }),
  });
  assert.ok(codes(stale.issues).includes("STALE_REVISION"));
  // Undo: discarding both candidates leaves the original baseline exact.
  assert.equal(await draft.contentSha256(baseline), originalHash);
  assert.deepEqual(baseline.geometry.obstacles.find((o) => o.id === "OB-PACK1"),
    { id: "OB-PACK1", minXMm: 19566, minZMm: 4390, maxXMm: 21434, maxZMm: 5610 });
});

test("key-reordered equivalent declaration accepted; non-rigid deformation still rejected as ownership drift", async () => {
  const { baseline } = await mainSetup();
  const canonical = draft.MAIN_WAREHOUSE_ATTACHMENTS[0];
  const reordered = {
    queueSlots: canonical.queueSlots.map((s) => ({ z: s.z, id: s.id, x: s.x })),
    assetRef: canonical.assetRef,
    servicePositions: canonical.servicePositions.map((s) => ({ z: s.z, x: s.x, id: s.id })),
    obstacleRectMm: { maxZMm: 5610, minZMm: 4390, maxXMm: 21434, minXMm: 19566 },
    obstacleId: canonical.obstacleId,
    centreMm: { z: 5000, x: 20500 },
    resourceId: canonical.resourceId,
    stationId: canonical.stationId,
  };
  assert.doesNotThrow(() => draft.buildStationAttachmentMap(baseline, [reordered, draft.MAIN_WAREHOUSE_ATTACHMENTS[1]]));
  // Deform the moved scenario itself (queue slot off the rigid offset) and
  // declare exactly that deformed geometry: canonical relative offsets fail.
  const { attachments, parent } = await mainSetup();
  const first = draft.applyPackingStationTranslation(
    baseline,
    draft.parseLayoutProposal(mainProposal(parent, { mode: "DELTA_MM", deltaMm: { dx: 0, dz: -1000 } })).proposal,
    attachments,
  );
  const deformed = structuredClone(first.scenario);
  deformed.resources.find((r) => r.id === "PACK-1").queueSlots[0].x += 100;
  const deformedParsed = parseOperationsScenario(deformed);
  const deformedEntry = draft.viewerPlacementFromCandidate(deformedParsed, first.attachmentsAfter);
  assert.throws(() => draft.buildStationAttachmentMap(deformedParsed, [deformedEntry]), /canonical main-warehouse-1 ownership/);
});

test("generated invalid-proposal export verifies as a rejection (not as a valid layout); tampered rejection fails", async () => {
  const { raw, proposal } = await corridorSetup();
  const invalid = await draft.runLayoutComparison({
    baselineScenario: raw, executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    proposal: { ...proposal({ mode: "DELTA_MM", deltaMm: { dx: 2000, dz: 0 } }), unexpected: 1 },
    attachments: [draft.corridorAttachment(8000)], approvedConstraints: APPROVED_CORRIDOR(),
  });
  assert.equal(invalid.measurement, "not-measured");
  assert.equal(invalid.candidateReport, null);
  const replay = await draft.verifyLayoutComparison(invalid);
  assert.equal(replay.ok, true, JSON.stringify(replay.mismatches));
  assert.equal(replay.kind, "rejection");
  const tamperedReason = structuredClone(invalid);
  tamperedReason.validation.issues[0].code = "TAMPERED";
  assert.equal((await draft.verifyLayoutComparison(tamperedReason)).ok, false);
  const tamperedStatus = structuredClone(invalid);
  tamperedStatus.measurement = "measured";
  assert.equal((await draft.verifyLayoutComparison(tamperedStatus)).ok, false);
  const unsupported = await draft.runLayoutComparison({
    baselineScenario: raw, executionConfig: draft.CORRIDOR_EXECUTION_CONFIG,
    proposal: { kind: "RACK_QUARTER_TURN", proposalId: "t-unsup", entityId: "R1" },
    attachments: [draft.corridorAttachment(8000)], approvedConstraints: APPROVED_CORRIDOR(),
  });
  const unsupportedReplay = await draft.verifyLayoutComparison(unsupported);
  assert.equal(unsupportedReplay.ok, true);
  assert.equal(unsupportedReplay.kind, "rejection");
});

test("portability: no Node-only imports in the draft graph; WebCrypto hash matches Node crypto", async () => {
  const srcDir = new URL("../src/", import.meta.url);
  for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(new URL(file, srcDir), "utf8");
    assert.ok(!/from\s+["']node:/.test(text), `${file} must not import Node-only builtins`);
  }
  const expected = createHash("sha256").update('{"a":1}', "utf8").digest("hex");
  assert.equal(await draft.contentSha256({ a: 1 }), expected);
  assert.equal(draft.snapToGridMm(1051, 100), 1100);
});
