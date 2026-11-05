import { expect, it, vi } from 'vitest';
import { verifyLayoutReportForVersion } from './runtime-verifier.js';
import * as compare from './compare.js';
it('rejects unsupported admission before station replay', async () => {
 const spies = [vi.spyOn(compare, 'verifyLayoutComparison'), vi.spyOn(rack, 'verifyRackLayoutComparison'), vi.spyOn(rotation, 'verifyRackRotationComparison'), vi.spyOn(agent, 'verifyAgentPlacementComparison')];
 for (const schema of ['layoutlab.layout-comparison/2','layoutlab.rack-comparison/1','layoutlab.rack-rotation-comparison/1','layoutlab.agent-placement-comparison/1','unknown',undefined]) {
  for (const simulation of [undefined,'0.1.0','0.1.2','constructor']) {
   expect(await verifyLayoutReportForVersion({schema,versions:{simulation}})).toMatchObject({ok:false,verifierImplementationVersion:null});
  }
 }
 for (const report of [null, {}, {schema:'unknown',versions:{simulation:'0.1.1'}}, {versions:{simulation:'0.1.1'}}]) expect(await verifyLayoutReportForVersion(report)).toMatchObject({ok:false,verifierImplementationVersion:null});
 for (const spy of spies) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); }
});
it('records the executed implementation even for malformed admitted replay', async () => {
 for (const schema of ['layoutlab.layout-comparison/2','layoutlab.rack-comparison/1','layoutlab.rack-rotation-comparison/1','layoutlab.agent-placement-comparison/1']) {
  expect(await verifyLayoutReportForVersion({schema,versions:{simulation:'0.1.1'}})).toMatchObject({ok:false,verifierImplementationVersion:'0.1.1'});
 }
});
import { readFileSync } from 'node:fs';
import * as rack from './rack.js';
import * as rotation from './rack-rotation.js';
import * as agent from './agent-placement.js';
const load = (path: string): any => JSON.parse(readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8'));
const cases = [
 ['evidence/sanitized/l1-public/comparison.json', compare.verifyLayoutComparison],
 ['evidence/sanitized/r2-runtime11/rack-report.json', rack.verifyRackLayoutComparison],
 ['evidence/sanitized/l3c/corridor-rotation.json', rotation.verifyRackRotationComparison],
 ['evidence/sanitized/r2-runtime11/agent-report.json', agent.verifyAgentPlacementComparison],
 ['evidence/sanitized/human-layout-replay/station-rejection.json', compare.verifyLayoutComparison],
] as const;
it('replays saved four-family and station rejection exports with exact direct parity', async () => {
 for (const [path, verify] of cases) {
  const report = load(path);
  const direct = await verify(report);
  if (path.includes('station-rejection')) expect(report).toMatchObject({measurement:'not-measured',baselineReport:null,candidateReport:null});
  expect(typeof direct === 'boolean' ? direct : direct.ok, path).toBe(true);
  expect(await verifyLayoutReportForVersion(report)).toEqual({...(typeof direct === 'boolean' ? {ok:direct,mismatches:[]} : direct),verifierImplementationVersion:'0.1.1'});
 }
}, 120000);
it('rejects geometry, numeric and nested report-version tampering through facade', async () => {
 for (const [path] of cases.slice(0,4)) {
  const original = load(path);
  for (const side of ['baseline','candidate']) {
   const r = structuredClone(original);
   const nested = r[side + 'Report'] ?? r[side + 'Run'].report;
   nested.versions.simulation = '0.1.0';
   expect(await verifyLayoutReportForVersion(r), path + side).toMatchObject({ok:false,verifierImplementationVersion:'0.1.1'});
  }
  const numeric = structuredClone(original); numeric.delta.shipped += 1;
  expect((await verifyLayoutReportForVersion(numeric)).ok).toBe(false);
  const geometry = structuredClone(original);
  const scenario = geometry.candidateScenario ?? geometry.bundle.scenario;
  scenario.mobileUnits[0].parkingSlotMm.x += 100;
  expect((await verifyLayoutReportForVersion(geometry)).ok).toBe(false);
 }
}, 120000);
it('isolates a future current version and actually replays old bytes with archive011', async () => {
 vi.resetModules();
 vi.doMock('../version.js', async importOriginal => ({...await importOriginal<object>(),SIMULATION_VERSION:'0.1.2'}));
 try {
  const future = await import('./runtime-verifier.js');
  const direct = await import('./compare.js');
  const registry = await import('../runtime-selector.js');
  const archived = await import('../../archive/0.1.1/runtime.mjs');
  expect(registry.CURRENT_IMPLEMENTATION_VERSION).toBe('0.1.2');
  expect(archived.verifyLayoutComparison).not.toBe(direct.verifyLayoutComparison);
  for (const [path] of cases) {
   const report = load(path); const before = JSON.stringify(report);
   expect(await future.verifyLayoutReportForVersion(report),path).toMatchObject({ok:true,verifierImplementationVersion:'0.1.1'});
   expect(JSON.stringify(report)).toBe(before);
  }
  expect((await direct.verifyLayoutComparison(load(cases[0][0]))).ok).toBe(false);
 } finally { vi.doUnmock('../version.js'); vi.resetModules(); }
}, 120000);
