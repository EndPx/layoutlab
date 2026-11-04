import { expect, test } from 'vitest';
import { applyRackTranslation, buildRackAttachmentMap } from '@layoutlab/simulation';
import { buildLayoutScene, buildSceneForScenario, loadBurstOperationsScene, loadOperationsScene } from './operations';
for (const load of [loadOperationsScene, loadBurstOperationsScene]) test(`rack visual rigidity: ${load.name}`, () => {
  const base = load();
  const proposal = { kind: 'RACK_TRANSLATION' as const, proposalId: 'viewer', entityId: 'R1', parent: { scenarioId: base.scenario.id, scenarioContentSha256: '0'.repeat(64), schemaVersion: base.scenario.schemaVersion, engineVersion: base.scenario.engineVersion }, target: { mode: 'DELTA_MM' as const, deltaMm: { dx: 0, dz: -1000 } } };
  const bundle = applyRackTranslation(base.scenario, proposal, buildRackAttachmentMap(base.scenario));
  const scene = buildLayoutScene(bundle);
  expect(scene.racks[0].positionMm).toEqual({ x: 4000, z: 5000 });
  expect(scene.layoutGhost?.centreMm).toEqual({ x: 4000, z: 6000 });
  const moved = scene.locations.find(l => l.id === 'L01')!;
  const original = base.locations.find(l => l.id === 'L01')!;
  expect(moved.anchorMm).toEqual({ x: 3000, y: 450, z: 5000 });
  expect(moved.approachMm).toEqual({ x: 3000, z: 7800 });
  expect(moved.containers).toEqual(original.containers);
  expect(moved.quantity).toBe(original.quantity);
  expect(scene.rackGlbUrl).toBe(base.rackGlbUrl);
  for (const mutate of [
    (s: typeof bundle.scenario) => { s.locations[0].storageAnchorMm.y++; },
    (s: typeof bundle.scenario) => { s.locations[0].approachPointMm.x++; },
    (s: typeof bundle.scenario) => { s.locations[0].rackId = 'R2'; },
    (s: typeof bundle.scenario) => { s.locations[0].usableDimensionsMm.width++; },
    (s: typeof bundle.scenario) => { s.locations[0].maxQuantity++; },
    (s: typeof bundle.scenario) => { s.geometry.obstacles[0].minXMm++; },
  ]) { const bad = structuredClone(bundle.scenario); mutate(bad); expect(() => buildSceneForScenario(bad)).toThrow(); }
});
