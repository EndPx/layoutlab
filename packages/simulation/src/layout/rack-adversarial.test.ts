import { it, expect } from 'vitest';
import { parseOperationsScenario, type OperationsScenario } from '../schema.js';
import { buildCorridorScenario, CORRIDOR_EXECUTION_CONFIG } from './corridor.js';
import { buildRackAttachmentMap, applyRackTranslation, runRackLayoutComparison, verifyRackLayoutComparison, type RackTranslationProposal } from './rack.js';
import { applyPackingStationTranslation } from './attachments.js';
import { corridorAttachment } from './corridor.js';
import { defaultApprovedConstraints } from './contract.js';
import { contentSha256 } from './hash.js';
async function setup(s = parseOperationsScenario(buildCorridorScenario()), dx = 0, dz = 1000) {
  const proposal: RackTranslationProposal = { kind: 'RACK_TRANSLATION', proposalId: 'adversarial', entityId: 'R1', parent: { scenarioId: s.id, scenarioContentSha256: await contentSha256(s), schemaVersion: s.schemaVersion, engineVersion: s.engineVersion }, target: { mode: 'DELTA_MM', deltaMm: { dx, dz } } };
  return { baselineScenario: s, proposal, attachments: buildRackAttachmentMap(s), approvedConstraints: defaultApprovedConstraints(['R1']), executionConfig: CORRIDOR_EXECUTION_CONFIG, safetyCeilingMs: 120000 };
}
it('independent rack corridor arithmetic and comparable production metrics', async () => {
  const r = await runRackLayoutComparison(await setup());
  // 1m/s: parking->pick 2->3s, pick->queue 3->4s, queue->service 2s.
  // Two items: picking 4s and unloading 2s; packing 10s, dispatch 5s.
  expect(r.baselineRun!.report.orders[0]!.timestamps.SHIPPED).toBe((2+3+2+4+2+10+5)*1000);
  expect(r.candidateRun!.report.orders[0]!.timestamps.SHIPPED).toBe((3+4+2+4+2+10+5)*1000);
  expect(r.bundle.scenario.locations[0]!.approachPointMm).toEqual({ x: 3000, z: 4000 });
  expect(r.delta!.makespanMs).toBe(2000);
  expect(r.improvement).toBe('worse');
  expect(await verifyRackLayoutComparison(r)).toBe(true);
}, 60000);
it('rack authority, stale identity, snap and budgets', async () => {
  for (const field of ['scenarioContentSha256', 'schemaVersion', 'engineVersion'] as const) {
    const input = await setup(); input.proposal.parent[field] = 'stale';
    const r = await runRackLayoutComparison(input);
    expect(r.validation.candidateValid).toBe(false);
    expect(r.candidateRun).toBeNull();
  }
  for (const kind of ['locked', 'notallowed', 'zero', 'distance', 'grid']) {
    const input = await setup();
    if (kind === 'locked') input.approvedConstraints.lockedEntityIds.push('R1');
    if (kind === 'notallowed') input.approvedConstraints.allowedEntityIds = [];
    if (kind === 'zero') input.approvedConstraints.maxMovedEntities = 0;
    if (kind === 'distance') input.approvedConstraints.maxTranslationMm = 100;
    if (kind === 'grid') input.proposal.target = { mode: 'DELTA_MM', deltaMm: { dx: 1, dz: 0 } };
    expect((await runRackLayoutComparison(input)).validation.candidateValid).toBe(false);
  }
  const noop = await setup(undefined, 0, 0); noop.approvedConstraints.maxMovedEntities = 0; noop.approvedConstraints.maxTranslationMm = 0;
  expect((await runRackLayoutComparison(noop)).validation.candidateValid).toBe(true);
}, 60000);
it('ownership missing, extra, alias and Y deformation cannot be applied', async () => {
  for (const kind of ['missing', 'extra', 'alias', 'y']) {
    const input = await setup(); const a = input.attachments.get('R1')!;
    if (kind === 'missing') a.slots = [];
    if (kind === 'extra') a.slots.push(structuredClone(a.slots[0]!));
    if (kind === 'alias') a.slots[0]!.rackId = 'other';
    if (kind === 'y') a.slots[0]!.storageAnchorMm.y++;
    expect(() => applyRackTranslation(input.baselineScenario, input.proposal, input.attachments)).toThrow('OWNERSHIP_MISMATCH');
  }
});
it('proven unrelated access blockers and out-of-room footprint', async () => {
  for (const kind of ['packing', 'dispatch', 'parking', 'other-slot']) {
    const s = parseOperationsScenario(buildCorridorScenario());
    // R1 moved east 1000: footprint x3000..5000,z1000..2000.
    const point = { x: 4500, z: 1500 };
    let owner = 'PK-1';
    if (kind === 'packing' || kind === 'dispatch') {
      const resource = s.resources.find(r => r.kind === kind)!; owner = resource.id;
      resource.queueSlots[0] = { ...resource.queueSlots[0]!, ...point };
    } else if (kind === 'parking') s.mobileUnits[0]!.parkingSlotMm = point;
    else {
      s.geometry.racks.push({ ...structuredClone(s.geometry.racks[0]!), id: 'R2', positionMm: { x: 10000, z: 1500 } });
      s.locations.push({ ...structuredClone(s.locations[0]!), id: 'L-OTHER', rackId: 'R2', storageAnchorMm: { x: 10000, y: 450, z: 1500 }, approachPointMm: point }); owner = 'L-OTHER';
    }
    const r = await runRackLayoutComparison(await setup(s, 1000, 0));
    expect(r.validation.candidateValid).toBe(false);
    expect(r.validation.candidate.issues.some(i => i.entityId === owner && i.relatedEntityId === 'R1')).toBe(true);
  }
  const input = await setup(undefined, -2500, 0);
  expect((await runRackLayoutComparison(input)).validation.candidate.issues.some(i => i.code === 'OUT_OF_ROOM' && i.entityId === 'R1')).toBe(true);
}, 60000);
it('snapshots caller inputs before await and returns independent transforms; tampering rejected', async () => {
  const input = await setup(); const saved = structuredClone(input);
  const pending = runRackLayoutComparison(input);
  input.attachments.get('R1')!.rack.positionMm.x = 9999;
  input.attachments.clear(); input.safetyCeilingMs = 1; input.proposal.target = { mode: 'DELTA_MM', deltaMm: { dx: 0, dz: 0 } };
  const r = await pending;
  expect(r.attachments).toEqual([...saved.attachments.values()]);
  expect(r.safetyCeilingMs).toBe(120000);
  expect(await verifyRackLayoutComparison(r)).toBe(true);
  const b = applyRackTranslation(saved.baselineScenario, saved.proposal, saved.attachments);
  b.transform.fromCentreMm.x = 7777;
  expect(saved.attachments.get('R1')!.rack.positionMm.x).toBe(3000);
  for (const mutate of [
    (x: typeof r) => { x.candidateRun!.report.counts.shipped++; },
    (x: typeof r) => { x.commonInputs.scenario.seed = 'tampered'; },
    (x: typeof r) => { x.commonInputs.executionConfig.pickDurationMsPerItem++; },
    (x: typeof r) => { x.bundle.scenario.geometry.racks[0]!.positionMm.x++; },
    (x: typeof r) => { x.versions.operationsEngine = 'unknown'; },
    (x: typeof r) => { (x as { schema: string }).schema = 'unknown'; },
  ]) { const x = structuredClone(r); mutate(x); expect(await verifyRackLayoutComparison(x)).toBe(false); }
}, 60000);
it('baseline repaired vs persisting errors are honest', async () => {
  const s = parseOperationsScenario(buildCorridorScenario());
  s.mobileUnits[0]!.parkingSlotMm = { x: 3900, z: 1500 };
  const repaired = await runRackLayoutComparison(await setup(s, -1000, 0));
  expect(repaired.validation.baselineValid).toBe(false);
  expect(repaired.validation.candidateValid).toBe(true);
  expect(repaired.measurement).toBe('candidate-only-repaired');
  expect(repaired.baselineRun).toBeNull(); expect(repaired.delta).toBeNull(); expect(repaired.improvement).toBe('not-measured');
  const invalid = await runRackLayoutComparison(await setup(s, 0, 0));
  expect(invalid.validation.candidateValid).toBe(false); expect(invalid.candidateRun).toBeNull();
}, 60000);


it('out-of-room anchor and sequential multiple rack parents', async () => {
  const s = parseOperationsScenario(buildCorridorScenario());
  s.locations[0]!.storageAnchorMm.x = 13900;
  const outside = await runRackLayoutComparison(await setup(s, 1000, 0));
  expect(outside.validation.candidate.issues.some(i => i.entityId === 'L-A1' && i.field === 'storageAnchorMm' && i.code === 'OUT_OF_ROOM')).toBe(true);
  const parent = parseOperationsScenario(buildCorridorScenario());
  parent.geometry.racks.push({ ...structuredClone(parent.geometry.racks[0]!), id: 'R2', positionMm: { x: 10000, z: 500 } });
  const stationProposal = (await setup(parent)).proposal;
  const station = applyPackingStationTranslation(parent, { ...stationProposal, kind: 'PACKING_STATION_TRANSLATION', entityId: 'PACK-1', target: { mode: 'DELTA_MM', deltaMm: { dx: 500, dz: 0 } } }, new Map([['PACK-1', corridorAttachment()]]));
  const firstInput = await setup(station.scenario, 1000, 0);
  const first = applyRackTranslation(station.scenario, firstInput.proposal, firstInput.attachments);
  const secondInput = await setup(first.scenario, 1000, 0);
  secondInput.proposal.entityId = 'R2'; secondInput.approvedConstraints.allowedEntityIds = ['R2'];
  const second = await runRackLayoutComparison(secondInput);
  expect(second.validation.candidateValid).toBe(true);
  expect(second.bundle.scenario.resources).toEqual(station.scenario.resources);
  expect(second.bundle.scenario.geometry.obstacles).toEqual(station.scenario.geometry.obstacles);
  expect(second.bundle.scenario.geometry.racks.find(r => r.id === 'R1')!.positionMm).toEqual({ x: 4000, z: 1500 });
  expect(second.bundle.scenario.geometry.racks.find(r => r.id === 'R2')!.positionMm).toEqual({ x: 11000, z: 500 });
  const stale = await runRackLayoutComparison({ ...secondInput, proposal: { ...secondInput.proposal, parent: firstInput.proposal.parent } });
  expect(stale.validation.structural.some(i => i.code === 'STALE_REVISION')).toBe(true);
}, 60000);
