import { describe,it,expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseOperationsScenario, type OperationsScenario } from '../schema.js';
import { buildCorridorScenario,CORRIDOR_EXECUTION_CONFIG } from './corridor.js';
import { buildRackAttachmentMap,applyRackTranslation } from './rack.js';
import { applyPackingStationTranslation } from './attachments.js';
import { corridorAttachment } from './corridor.js';
import { contentSha256 } from './hash.js';
import { applyRackQuarterTurn,resolveRackOrientations,runRackRotationComparison,verifyRackRotationComparison,type RackQuarterTurnProposal,type QuarterTurns } from './rack-rotation.js';
async function setup(s=parseOperationsScenario(buildCorridorScenario()),turns:QuarterTurns=1,canonical=s){
 const proposal:RackQuarterTurnProposal={kind:'RACK_QUARTER_TURN',proposalId:'rotation-oracle',entityId:'R1',quarterTurns:turns,parent:{scenarioId:s.id,scenarioContentSha256:await contentSha256(s),schemaVersion:s.schemaVersion,engineVersion:s.engineVersion}};
 return{baselineScenario:s,canonicalScenario:canonical,proposal,attachments:buildRackAttachmentMap(s),approvedRotation:{allowedRackIds:['R1'],lockedRackIds:[] as string[],allowedQuarterTurns:[1,2,3] as QuarterTurns[],maxRotatedRacks:1,maxQuarterTurns:3},executionConfig:CORRIDOR_EXECUTION_CONFIG,safetyCeilingMs:120000};
}
describe('quarter-turn foundation',()=>{
 it('main literal 90/180/270 Three yaw, intrinsic volume/material and scenario-only reopening',async()=>{
  const main=parseOperationsScenario(JSON.parse(readFileSync('fixtures/operations/main-warehouse.json','utf8')));
  const original=structuredClone(main);
  const literals=[{anchor:{x:4000,y:450,z:7000},approach:{x:6800,z:7000},width:2000,depth:4000},{anchor:{x:5000,y:450,z:6000},approach:{x:5000,z:3200},width:4000,depth:2000},{anchor:{x:4000,y:450,z:5000},approach:{x:1200,z:5000},width:2000,depth:4000}];
  for(const turns of [1,2,3] as const){const input=await setup(main,turns);const b=applyRackQuarterTurn(main,input.proposal,main,input.attachments);const literal=literals[turns-1];
   expect(b.scenario.locations[0].storageAnchorMm).toEqual(literal.anchor);expect(b.scenario.locations[0].approachPointMm).toEqual(literal.approach);
   expect(b.scenario.geometry.racks[0].dimensionsMm).toEqual({width:literal.width,depth:literal.depth,height:3010});
   expect(b.scenario.locations[0].usableDimensionsMm).toEqual(main.locations[0].usableDimensionsMm);
   expect(b.scenario.products).toEqual(main.products);expect(b.scenario.initialStock).toEqual(main.initialStock);
   expect(b.viewerPlacement.assetFrame.intrinsicDimensionsMm).toEqual({width:4000,depth:2000,height:3010});
   expect(resolveRackOrientations(JSON.parse(JSON.stringify(b.scenario)),main)[0].yawDeg).toBe(turns*90);
  }
  expect(main).toEqual(original);
 });
 it('four turns and inverse restore exact state after translation and station edits',async()=>{
  const canonical=parseOperationsScenario(buildCorridorScenario());let s=structuredClone(canonical);
  for(let i=0;i<4;i++){const input=await setup(s,1,canonical);s=applyRackQuarterTurn(s,input.proposal,canonical,input.attachments).scenario;}
  expect(s).toEqual(canonical);
  const first=await setup(canonical);s=applyRackQuarterTurn(s,first.proposal,canonical,first.attachments).scenario;
  const inverse=await setup(s,3,canonical);expect(applyRackQuarterTurn(s,inverse.proposal,canonical,inverse.attachments).scenario).toEqual(canonical);
  const { quarterTurns: _turns, kind: _kind, ...identity }=first.proposal;
  const station=applyPackingStationTranslation(canonical,{...identity,kind:'PACKING_STATION_TRANSLATION',entityId:'PACK-1',target:{mode:'DELTA_MM',deltaMm:{dx:500,dz:0}}},new Map([['PACK-1',corridorAttachment()]]));
  const translated=applyRackTranslation(station.scenario,{...identity,kind:'RACK_TRANSLATION',target:{mode:'DELTA_MM',deltaMm:{dx:1000,dz:0}}},buildRackAttachmentMap(station.scenario));
  const rotatedInput=await setup(translated.scenario,1,canonical);const rotated=applyRackQuarterTurn(translated.scenario,rotatedInput.proposal,canonical,rotatedInput.attachments);
  expect(rotated.scenario.resources).toEqual(station.scenario.resources);expect(rotated.scenario.geometry.obstacles).toEqual(station.scenario.geometry.obstacles);
  expect(rotated.viewerPlacement.assetFrame.centerMm).toEqual({x:4000,z:1500});expect(rotated.scenario.locations[0].approachPointMm).toEqual({x:5500,z:1500});
 });
 it('empty or symmetric orientation ambiguous; deformed anchor, wrong footprint and ownership reject',async()=>{
  const s=parseOperationsScenario(buildCorridorScenario());
  const empty=structuredClone(s);empty.geometry.racks.push({...structuredClone(s.geometry.racks[0]),id:'EMPTY',positionMm:{x:10000,z:1500}});
  expect(()=>resolveRackOrientations(empty,empty)).toThrow('AMBIGUOUS_ORIENTATION');
  const symmetric=structuredClone(s);symmetric.geometry.racks[0].dimensionsMm.depth=2000;symmetric.locations[0].approachPointMm={...symmetric.geometry.racks[0].positionMm};
  expect(()=>resolveRackOrientations(symmetric,symmetric)).toThrow('AMBIGUOUS_ORIENTATION');
  const input=await setup(s);const b=applyRackQuarterTurn(s,input.proposal,s,input.attachments);
  for(const mutate of [(x:OperationsScenario)=>{x.locations[0].storageAnchorMm.y++;},(x:OperationsScenario)=>{x.geometry.racks[0].dimensionsMm.width++;},(x:OperationsScenario)=>{x.locations[0].rackId='bad';},(x:OperationsScenario)=>{x.locations[0].approachPointMm.x++;}]){const bad=structuredClone(b.scenario);mutate(bad);expect(()=>resolveRackOrientations(bad,s)).toThrow();}
  input.attachments.get('R1')!.slots=[];expect(()=>applyRackQuarterTurn(s,input.proposal,s,input.attachments)).toThrow('OWNERSHIP_MISMATCH');
 });
 it('authority, stale hash/schema/engine and arbitrary angles fail closed',async()=>{
  for(const field of ['scenarioContentSha256','schemaVersion','engineVersion'] as const){const input=await setup();input.proposal.parent[field]='stale';if(field==='scenarioContentSha256')input.proposal.parent[field]='f'.repeat(64);const r=await runRackRotationComparison(input);expect(r.validation.candidateValid).toBe(false);expect(r.candidateRun).toBeNull();}
  for(const kind of ['locked','notallowed','turn','rackbudget','turnbudget']){const input=await setup();if(kind==='locked')input.approvedRotation.lockedRackIds=['R1'];if(kind==='notallowed')input.approvedRotation.allowedRackIds=[];if(kind==='turn')input.approvedRotation.allowedQuarterTurns=[2];if(kind==='rackbudget')input.approvedRotation.maxRotatedRacks=0;if(kind==='turnbudget')input.approvedRotation.maxQuarterTurns=0;expect((await runRackRotationComparison(input)).validation.candidateValid).toBe(false);}
  const input=await setup();for(const proposal of [{...input.proposal,quarterTurns:1.5},{...input.proposal,angleDeg:45},{...input.proposal,approvedRotation:input.approvedRotation}])expect(()=>applyRackQuarterTurn(input.baselineScenario,proposal as RackQuarterTurnProposal,input.canonicalScenario,input.attachments)).toThrow();
 });
 it('swapped footprint leaving room and blocking unrelated approach names IDs',async()=>{
  const s=parseOperationsScenario(buildCorridorScenario());s.geometry.racks[0].positionMm.z=600;s.locations[0].storageAnchorMm.z=600;
  const out=await runRackRotationComparison(await setup(s));expect(out.validation.candidateValid).toBe(false);expect(out.validation.candidate.issues.some(i=>i.code==='OUT_OF_ROOM'&&i.entityId==='R1')).toBe(true);
  const blocked=parseOperationsScenario(buildCorridorScenario());blocked.resources.find(r=>r.kind==='dispatch')!.queueSlots[0]={id:'DSP-Q1',x:3000,z:2300};
  const r=await runRackRotationComparison(await setup(blocked));expect(r.validation.candidateValid).toBe(false);expect(r.validation.candidate.issues.some(i=>i.entityId==='DSP-1'&&i.relatedEntityId==='R1')).toBe(true);
  const other=parseOperationsScenario(buildCorridorScenario());
  other.geometry.racks.push({...structuredClone(other.geometry.racks[0]),id:'R2',positionMm:{x:10000,z:1500}});
  other.locations.push({...structuredClone(other.locations[0]),id:'L-OTHER',rackId:'R2',storageAnchorMm:{x:10000,y:450,z:1500},approachPointMm:{x:3000,z:2400}});
  const access=await runRackRotationComparison(await setup(other));
  expect(access.validation.candidate.issues.some(i=>i.entityId==='L-OTHER'&&i.relatedEntityId==='R1'&&i.code==='CLEARANCE_VIOLATION')).toBe(true);

 });
 it('exact offline report, versions, frozen input snapshots and tamper rejection',async()=>{
  const input=await setup();const pending=runRackRotationComparison(input);input.attachments.clear();input.proposal.quarterTurns=3;
  const r=await pending;expect(r.validation.candidateValid).toBe(true);expect(r.proposal.quarterTurns).toBe(1);expect(await verifyRackRotationComparison(JSON.parse(JSON.stringify(r)))).toBe(true);
  for(const mutate of [(x:typeof r)=>{x.bundle.scenario.locations[0].approachPointMm.x++;},(x:typeof r)=>{x.bundle.viewerPlacement.assetFrame.yawDeg=270;},(x:typeof r)=>{x.bundle.scenario.locations[0].usableDimensionsMm.width++;},(x:typeof r)=>{x.bundle.scenario.initialStock[0].quantity++;},(x:typeof r)=>{x.candidateRun!.report.counts.shipped++;},(x:typeof r)=>{x.commonInputs.scenario.seed='tamper';},(x:typeof r)=>{x.versions.operationsEngine='unknown';},(x:typeof r)=>{x.attachments[0].rackId='alias';}]){const bad=structuredClone(r);mutate(bad);expect(await verifyRackRotationComparison(bad)).toBe(false);}
  mkdirSync('evidence/sanitized/l3c',{recursive:true});writeFileSync('evidence/sanitized/l3c/corridor-rotation.json',JSON.stringify(r,null,2));
 },60000);
});

it('rotation baseline repair remains candidate-only and no fabricated delta',async()=>{
 const s=parseOperationsScenario(buildCorridorScenario());s.geometry.room.depthMm=10000;s.geometry.racks[0].positionMm={x:4000,z:2500};s.geometry.racks[0].dimensionsMm.width=4000;
 s.locations[0].storageAnchorMm={x:4000,y:450,z:2500};s.locations[0].approachPointMm={x:4000,z:4500};s.mobileUnits[0].parkingSlotMm={x:2200,z:2500};
 const report=await runRackRotationComparison(await setup(s));
 expect(report.validation.baselineValid).toBe(false);expect(report.validation.candidateValid).toBe(true);expect(report.measurement).toBe('candidate-only-repaired');expect(report.baselineRun).toBeNull();expect(report.delta).toBeNull();expect(report.improvement).toBe('not-measured');
},60000);
