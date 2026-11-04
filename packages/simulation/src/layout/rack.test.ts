import { describe, it, expect } from 'vitest';
import { parseOperationsScenario } from '../schema.js';
import { buildCorridorScenario, CORRIDOR_EXECUTION_CONFIG } from './corridor.js';
import { buildRackAttachmentMap, applyRackTranslation, runRackLayoutComparison, verifyRackLayoutComparison, type RackTranslationProposal } from './rack.js';
import { applyPackingStationTranslation } from './attachments.js';
import { corridorAttachment } from './corridor.js';
import { defaultApprovedConstraints } from './contract.js';
import { contentSha256 } from './hash.js';

describe('rack translation foundation', () => {
  it('translates literal anchors, preserves inventory, supports exact undo and verifies export', async () => {
    const baseline = parseOperationsScenario(buildCorridorScenario());
    const original = structuredClone(baseline);
    const proposal: RackTranslationProposal = { kind: 'RACK_TRANSLATION', proposalId: 'rack-oracle', entityId: 'R1', parent: { scenarioId: baseline.id, scenarioContentSha256: await contentSha256(baseline), schemaVersion: baseline.schemaVersion, engineVersion: baseline.engineVersion }, target: { mode: 'DELTA_MM', deltaMm: { dx: 1000, dz: 0 } } };
    const map = buildRackAttachmentMap(baseline);
    const moved = applyRackTranslation(baseline, proposal, map);
    expect(moved.scenario.geometry.racks[0]!.positionMm).toEqual({ x: 4000, z: 1500 });
    expect(moved.scenario.locations[0]!.storageAnchorMm).toEqual({ x: 4000, y: 450, z: 1500 });
    expect(moved.scenario.locations[0]!.approachPointMm).toEqual({ x: 4000, z: 3000 });
    expect(moved.scenario.initialStock).toEqual(original.initialStock);
    expect(baseline).toEqual(original);
    expect(applyRackTranslation(baseline, { ...proposal, target: { mode: 'DELTA_MM', deltaMm: { dx: 0, dz: 0 } } }, map).scenario).toEqual(baseline);
    expect(applyRackTranslation(moved.scenario, { ...proposal, target: { mode: 'DELTA_MM', deltaMm: { dx: -1000, dz: 0 } } }, buildRackAttachmentMap(moved.scenario)).scenario).toEqual(baseline);
    const station = applyPackingStationTranslation(baseline, { ...proposal, kind: 'PACKING_STATION_TRANSLATION', entityId: 'PACK-1', target: { mode: 'DELTA_MM', deltaMm: { dx: 500, dz: 0 } } }, new Map([['PACK-1', corridorAttachment()]]));
    const combined = applyRackTranslation(station.scenario, proposal, buildRackAttachmentMap(station.scenario));
    expect(combined.scenario.resources).toEqual(station.scenario.resources);
    expect(combined.scenario.geometry.obstacles).toEqual(station.scenario.geometry.obstacles);
    expect(combined.scenario.locations).toEqual(moved.scenario.locations);
    const input = { baselineScenario: baseline, proposal, attachments: map, approvedConstraints: defaultApprovedConstraints(['R1']), executionConfig: CORRIDOR_EXECUTION_CONFIG, safetyCeilingMs: 120000 };
    const report = await runRackLayoutComparison(input);
    expect(report.validation.candidateValid).toBe(true);
    expect(await verifyRackLayoutComparison(JSON.parse(JSON.stringify(report)))).toBe(true);
    const tampered = structuredClone(report);
    tampered.bundle.scenario.locations[0]!.storageAnchorMm.y++;
    expect(await verifyRackLayoutComparison(tampered)).toBe(false);
    for (const mutate of [
      (r: typeof report) => { r.bundle.scenario.locations[0]!.approachPointMm.x++; },
      (r: typeof report) => { r.bundle.scenario.locations[0]!.rackId = 'other'; },
      (r: typeof report) => { r.bundle.scenario.geometry.obstacles[0]!.minXMm++; },
      (r: typeof report) => { r.bundle.scenario.initialStock[0]!.quantity++; },
    ]) {
      const changed = structuredClone(report); mutate(changed);
      expect(await verifyRackLayoutComparison(changed)).toBe(false);
    }
    const invalid = await runRackLayoutComparison({ ...input, proposal: { ...proposal, target: { mode: 'DELTA_MM', deltaMm: { dx: 5000, dz: 0 } } } });
    expect(invalid.validation.candidateValid).toBe(false);
    expect(invalid.validation.candidate.issues.some(i => i.code === 'OVERLAP' && [i.entityId, i.relatedEntityId].includes('OB-PACK1'))).toBe(true);
  }, 60000);
});
