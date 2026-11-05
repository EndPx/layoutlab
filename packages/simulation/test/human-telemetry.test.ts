import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createOperationsController, runOperationsToTermination } from '../src/operations.js';
import { ARCHIVED_RUNTIMES, recomputeOperationsReportForVersion } from '../src/runtime-selector.js';
import { poseOnSegment } from '../src/traffic.js';
const read = (name: string) => JSON.parse(readFileSync(new URL('../../../fixtures/operations/' + name, import.meta.url), 'utf8'));
const options = () => ({ scenario: read('picking-packing-burst.json'), executionConfig: read('picking-packing-burst.runconfig.json').executionConfig });
describe('additive human trajectory telemetry acceptance', () => {
 it('has a literal clamped interpolation oracle including stationary zero-time movement', () => {
  const s = {fromX:10, fromZ:20, toX:110, toZ:220, startMs:100, endMs:300};
  expect(poseOnSegment(s, 200)).toEqual({x:60,z:120});
  expect(poseOnSegment(s, 0)).toEqual({x:10,z:20});
  expect(poseOnSegment(s, 400)).toEqual({x:110,z:220});
  expect(poseOnSegment({...s,toX:10,toZ:20,endMs:100},100)).toEqual({x:10,z:20});
 });
 it('matches actual controller poses during grants and isolates all returned segment mutations', () => {
  const c = createOperationsController(options());
  const control = createOperationsController(options());
  let checked = 0;
  for (let i=0;i<40 && checked<1;i++) {
   c.stepEvent(); control.stepEvent();
   const snap = c.snapshot();
   for (const h of snap.motionHistory) {
    const segments = h.segments!;
    expect(segments).toHaveLength(h.segmentCount);
    if (!segments.length) continue;
    expect(segments[0]!.startMs).toBe(h.startMs);
    expect(segments.at(-1)!.endMs).toBe(h.endMs);
    for (const s of segments) {
     expect(Object.keys(s).sort()).toEqual(['endMs','fromX','fromZ','startMs','toX','toZ']);
     expect(Object.values(s).every(Number.isFinite)).toBe(true);
     expect(s.endMs).toBeGreaterThanOrEqual(s.startMs);
     if (s.startMs < snap.clockMs || s.endMs <= s.startMs) continue;
     const time = (s.startMs+s.endMs)/2;
     c.advanceTo(time); control.advanceTo(time);
     expect(c.snapshot().units.find(u=>u.unitId===h.unitId)?.pose).toEqual(poseOnSegment(s,time));
     checked++;
     break;
    }
    if (checked) break;
   }
   const before = control.snapshot();
   for (const h of snap.motionHistory) { for (const s of h.segments ?? []) { expect(() => { s.fromX=-999999; }).toThrow(TypeError); expect(() => { s.endMs=Infinity; }).toThrow(TypeError); } expect(() => h.segments?.splice(0)).toThrow(TypeError); }
   expect(c.snapshot()).toEqual(before);
  }
  expect(checked).toBeGreaterThan(0);
  runOperationsToTermination(c); runOperationsToTermination(control);
  expect(c.exportReport()).toEqual(control.exportReport());

  c.reset(); control.reset();
  expect(c.snapshot().motionHistory).toEqual([]);
  expect(c.snapshot()).toEqual(control.snapshot());
  runOperationsToTermination(c);
  runOperationsToTermination(control);
  expect(c.exportReport()).toEqual(control.exportReport());
 },120000);
 it('preserves exact finite six-order report, inventory, counts and timestamps against frozen 0.1.1', () => {
  const c=createOperationsController(options());
  const old=ARCHIVED_RUNTIMES['0.1.1'].createOperationsController(options());
  runOperationsToTermination(c); runOperationsToTermination(old);
  const now=c.snapshot(), prior=old.snapshot();
  expect(now.counts.selected).toBe(6);
  expect(c.exportReport()).toEqual(old.exportReport());
  expect(now.inventory).toEqual(prior.inventory);
  expect(now.counts).toEqual(prior.counts);
  expect(now.orders).toEqual(prior.orders);
  expect(now.timeline).toEqual(prior.timeline);
  expect(now.motionHistory.map(({segments,...rest})=>rest)).toEqual(prior.motionHistory);
  expect(prior.motionHistory.every(h=>h.segments===undefined)).toBe(true);
  expect(recomputeOperationsReportForVersion(old.exportReport()).ok).toBe(true);
 },120000);
});





// Route plans are observed independently of the historical telemetry projection.
it('matches every burst grant to authoritative route points, distance and timing', () => {
 const c = createOperationsController(options());
 const plans = new Map<string, NonNullable<ReturnType<typeof c.snapshot>['units'][number]['authorizedRoute']>>();
 let events = 0;
 for (; events < 10000; events++) {
  const snap = c.snapshot();
  for (const u of snap.units) if (u.authorizedRoute) {
   const p = u.authorizedRoute;
   plans.set(`${u.unitId}:${p.planVersion}`, p);
  }
  if (c.getCompletionStatus().stage === 'SUPPORTED_STAGE_COMPLETE') break;
  c.stepEvent();
 }
 expect(events).toBeLessThan(10000);
 const history = c.snapshot().motionHistory;
 expect(history.length).toBeGreaterThan(0);
 for (const h of history) {
  const p = plans.get(`${h.unitId}:${h.planVersion}`);
  expect(p, `missing authoritative grant ${h.unitId}:${h.planVersion}`).toBeDefined();
  if (!p) throw new Error('missing grant');
  const segments = h.segments!;
  expect(segments.length).toBe(h.segmentCount);
  expect(segments.length).toBe(p.points.length - 1);
  expect(h.startMs).toBe(p.startMs);
  expect(h.endMs).toBe(p.endMs);
  let distance = 0;
  segments.forEach((s, i) => {
   expect({x:s.fromX,z:s.fromZ}).toEqual(p.points[i]);
   expect({x:s.toX,z:s.toZ}).toEqual(p.points[i+1]);
   const length = Math.hypot(s.toX-s.fromX,s.toZ-s.fromZ);
   distance += length;
   expect(s.endMs).toBeGreaterThanOrEqual(s.startMs);
   if (length > 0) expect(s.endMs).toBeGreaterThan(s.startMs);
   if (i === 0) expect(s.startMs).toBe(p.startMs);
   else {
    const prior = segments[i-1]!;
    expect([s.fromX,s.fromZ,s.startMs]).toEqual([prior.toX,prior.toZ,prior.endMs]);
   }
   if (i === segments.length-1) expect(s.endMs).toBe(p.endMs);
  });
  expect(distance).toBeCloseTo(p.totalDistanceMm, 6);
 }
 expect(new Set(history.map(h=>`${h.unitId}:${h.planVersion}`)).size).toBe(plans.size);
 console.log(JSON.stringify({grants:history.length,events, purposes:[...new Set(history.map(h=>h.purpose))]}));
},120000);

it('represents an actual transport no-move grant with empty segments and zero duration', async () => {
 const { createTransportController } = await import('../src/transport.js');
 const { microScenario } = await import('./transport-fixtures.js');
 const grants: import('../src/transport.js').TransportGrantNotice[] = [];
 const c = createTransportController({scenario:microScenario({units:[{id:'U1',parkingSlotMm:{x:1000,z:1000}}]}),onGrant:g=>grants.push(g)});
 const r = c.requestMove('U1',{x:1000,z:1000});
 expect(r.status).toBe('granted');
 if (r.status !== 'granted') throw new Error('no-move rejected');
 expect(r.plan.points).toEqual([{x:1000,z:1000}]);
 expect(r.plan.totalDistanceMm).toBe(0);
 expect(r.plan.totalDurationMs).toBe(0);
 expect(r.plan.startMs).toBe(r.plan.endMs);
 expect(grants).toHaveLength(1);
 expect(grants[0]!.trajectory.segments).toEqual([]);
 c.advanceTo(1);
 expect(c.poseAt('U1')).toEqual({x:1000,z:1000});
});
