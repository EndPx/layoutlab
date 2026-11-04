import { it, expect } from 'vitest';
import { parseOperationsScenario } from '../schema.js';
import { buildCorridorScenario, CORRIDOR_EXECUTION_CONFIG } from './corridor.js';
import { defaultApprovedConstraints } from './contract.js';
import { contentSha256 } from './hash.js';
import { runAgentPlacementComparison, verifyAgentPlacementComparison, type AgentInitialPlacementProposal } from './agent-placement.js';
it('independent corridor: initial travel saves 1000ms; export recomputes', async () => {
 const baseline = parseOperationsScenario(buildCorridorScenario());
 const proposal: AgentInitialPlacementProposal = {kind:'AGENT_INITIAL_PLACEMENT',proposalId:'parking-oracle',entityId:'PK-1',parent:{scenarioId:baseline.id,scenarioContentSha256:await contentSha256(baseline),schemaVersion:baseline.schemaVersion,engineVersion:baseline.engineVersion},target:{mode:'DELTA_MM',deltaMm:{dx:1000,dz:0}}};
 const input={baselineScenario:baseline,proposal,approvedConstraints:defaultApprovedConstraints(['PK-1']),executionConfig:CORRIDOR_EXECUTION_CONFIG,safetyCeilingMs:120000};
 const original=structuredClone(input);
 const report=await runAgentPlacementComparison(input);
 expect(report.baselineRun?.metrics.lastShippedAtMs).toBe(28000);
 expect(report.candidateRun?.metrics.lastShippedAtMs).toBe(27000);
 expect(input).toEqual(original);
 expect(await verifyAgentPlacementComparison(JSON.parse(JSON.stringify(report)))).toBe(true);
 const tampered=structuredClone(report); tampered.bundle.scenario.mobileUnits[0]!.speedMmPerSecond++;
 expect(await verifyAgentPlacementComparison(tampered)).toBe(false);
});
it('rejects stale authority, budgets, offgrid, locks and model extra fields', async () => {
 const baseline=parseOperationsScenario(buildCorridorScenario());
 const proposal: AgentInitialPlacementProposal={kind:'AGENT_INITIAL_PLACEMENT',proposalId:'adversarial',entityId:'PK-1',parent:{scenarioId:baseline.id,scenarioContentSha256:await contentSha256(baseline),schemaVersion:baseline.schemaVersion,engineVersion:baseline.engineVersion},target:{mode:'DELTA_MM',deltaMm:{dx:1000,dz:0}}};
 const input={baselineScenario:baseline,proposal,approvedConstraints:defaultApprovedConstraints(['PK-1']),executionConfig:CORRIDOR_EXECUTION_CONFIG,safetyCeilingMs:120000};
 for (const approvedConstraints of [defaultApprovedConstraints([]), {...input.approvedConstraints,lockedEntityIds:['PK-1']}, {...input.approvedConstraints,maxMovedEntities:0}, {...input.approvedConstraints,maxTranslationMm:0}]) expect((await runAgentPlacementComparison({...input,approvedConstraints})).validation.candidateValid).toBe(false);
 expect((await runAgentPlacementComparison({...input,proposal:{...proposal,parent:{...proposal.parent,scenarioContentSha256:'0'.repeat(64)}}})).validation.candidateValid).toBe(false);
 expect((await runAgentPlacementComparison({...input,proposal:{...proposal,target:{mode:'DELTA_MM',deltaMm:{dx:1,dz:0}}}})).validation.candidateValid).toBe(false);
 await expect(runAgentPlacementComparison({...input,proposal:{...proposal,speed:2000} as AgentInitialPlacementProposal})).rejects.toThrow();
 const noop=await runAgentPlacementComparison({...input,proposal:{...proposal,target:{mode:'DELTA_MM',deltaMm:{dx:0,dz:0}}}});
 expect(noop.bundle.scenario).toEqual(baseline);
 expect(noop.improvement).toBe('no-improvement');
});
import { createOperationsController } from '../operations.js';
import { applyAgentInitialPlacement } from './agent-placement.js';
import { applyPackingStationTranslation } from './attachments.js';
import { corridorAttachment } from './corridor.js';
import { applyRackTranslation, buildRackAttachmentMap } from './rack.js';
import { footprintRadiusMm } from '../navigation.js';
async function fixture(s = parseOperationsScenario(buildCorridorScenario())) {
 const proposal: AgentInitialPlacementProposal = {kind:'AGENT_INITIAL_PLACEMENT',proposalId:'gate',entityId:'PK-1',parent:{scenarioId:s.id,scenarioContentSha256:await contentSha256(s),schemaVersion:s.schemaVersion,engineVersion:s.engineVersion},target:{mode:'DELTA_MM',deltaMm:{dx:1000,dz:0}}};
 return {baselineScenario:s,proposal,approvedConstraints:defaultApprovedConstraints(['PK-1']),executionConfig:CORRIDOR_EXECUTION_CONFIG,safetyCeilingMs:120000};
}
it('advanced existing controller clock and snapshot are byte equivalent; no teleport', async()=>{
 const input=await fixture(); const c=createOperationsController({scenario:input.baselineScenario,executionConfig:input.executionConfig}); c.advanceTo(1000);
 const before=JSON.stringify(c.snapshot()), clock=c.getClockMs(); applyAgentInitialPlacement(input.baselineScenario,input.proposal); await runAgentPlacementComparison(input);
 expect(JSON.stringify(c.snapshot())).toBe(before); expect(c.getClockMs()).toBe(clock);
});
it('fresh parent inverse restores exact scenario; no-op uses zero budgets; transform is detached',async()=>{
 const i=await fixture(); const moved=applyAgentInitialPlacement(i.baselineScenario,i.proposal); const j=await fixture(moved.scenario); j.proposal.target={mode:'DELTA_MM',deltaMm:{dx:-1000,dz:0}};
 const undo=await runAgentPlacementComparison(j); expect(undo.validation.candidateValid).toBe(true); expect(undo.bundle.scenario).toEqual(i.baselineScenario);
 moved.transform.toCentreMm.x=999; expect(moved.scenario.mobileUnits[0]!.parkingSlotMm.x).toBe(2000);
 i.proposal.target={mode:'DELTA_MM',deltaMm:{dx:0,dz:0}}; i.approvedConstraints.maxMovedEntities=0;i.approvedConstraints.maxTranslationMm=0;
 expect((await runAgentPlacementComparison(i)).validation.candidateValid).toBe(true);
});
it.each([[-1000,3000,null],[3000,1500,'R1'],[8000,1000,'OB-PACK1'],[0,3000,null]])('rejects static placement %s,%s with proven blocker %s',async(x,z,id)=>{
 const i=await fixture(); i.approvedConstraints.maxTranslationMm=20000;i.proposal.target={mode:'ABSOLUTE_CENTER_MM',centerMm:{x,z}};
 const r=await runAgentPlacementComparison(i); expect(r.validation.candidateValid).toBe(false);
 if(id)expect(r.validation.candidate.issues.some(v=>v.relatedEntityId===id)).toBe(true);
});
it.each([0,1])('two unequal declared cart footprints overlap/contact case %s',async(offset)=>{
 const s=parseOperationsScenario(buildCorridorScenario());const second=structuredClone(s.mobileUnits[0]!);second.id='PK-2';second.footprintMm={width:600,length:800,margin:100};second.parkingSlotMm={x:5000,z:3000};s.mobileUnits.push(second);
 const i=await fixture(s);const radius=footprintRadiusMm(s.mobileUnits[0]!.footprintMm)+footprintRadiusMm(second.footprintMm);
 i.approvedConstraints.snapGridMm=1;i.approvedConstraints.maxTranslationMm=10000;i.proposal.target={mode:'ABSOLUTE_CENTER_MM',centerMm:{x:5000-radius+offset,z:3000}};
 const r=await runAgentPlacementComparison(i);expect(r.validation.candidateValid).toBe(false);expect(r.validation.candidate.issues.some(v=>v.code==='OVERLAP'&&v.entityId==='PK-1'&&v.relatedEntityId==='PK-2')).toBe(true);
});
it('freezes caller scenario proposal config and authority before first await',async()=>{
 const i=await fixture(), original=structuredClone(i);const pending=runAgentPlacementComparison(i);
 i.baselineScenario.mobileUnits[0]!.speedMmPerSecond=999;i.proposal.target={mode:'DELTA_MM',deltaMm:{dx:0,dz:0}};i.approvedConstraints.allowedEntityIds=[];(i.executionConfig as {pickDurationMsPerItem:number}).pickDurationMsPerItem=999;
 const r=await pending;expect(r.commonInputs.scenario).toEqual(original.baselineScenario);expect(r.proposal).toEqual(original.proposal);expect(r.approvedConstraints).toEqual(original.approvedConstraints);expect(await verifyAgentPlacementComparison(r)).toBe(true);
});
it('rejects malformed schema versions missing fields metrics config stock footprint speed and extras',async()=>{
 const r=await runAgentPlacementComparison(await fixture());
 for(const change of [(v:any)=>v.schema='unknown',(v:any)=>v.versions.operationsEngine='unknown',(v:any)=>delete v.proposal,(v:any)=>v.baselineRun.metrics.shipped++,(v:any)=>v.commonInputs.executionConfig.pickDurationMsPerItem++,(v:any)=>v.commonInputs.scenario.initialStock[0].quantity++,(v:any)=>v.commonInputs.scenario.mobileUnits[0].footprintMm.width++,(v:any)=>v.commonInputs.scenario.mobileUnits[0].speedMmPerSecond++,(v:any)=>v.extra=true]) {const v=structuredClone(r);change(v);expect(await verifyAgentPlacementComparison(v)).toBe(false);}
 expect(await verifyAgentPlacementComparison(null as any)).toBe(false);
 for(const extra of [{role:'putaway'},{mobileUnits:[]},{target:{...r.proposal.target,speed:5}},{approvedConstraints:{}}])await expect(runAgentPlacementComparison({...await fixture(),proposal:{...r.proposal,...extra} as any})).rejects.toThrow();
 await expect(runAgentPlacementComparison({...await fixture(),proposal:{...r.proposal,entityId:'unknown'}})).rejects.toThrow('Unknown mobile unit');
});
it('station rack parking successive parents preserve unrelated changes and reject stale intermediate',async()=>{
 const i=await fixture();const station=applyPackingStationTranslation(i.baselineScenario,{...i.proposal,kind:'PACKING_STATION_TRANSLATION',entityId:'PACK-1',target:{mode:'DELTA_MM',deltaMm:{dx:500,dz:0}}},new Map([['PACK-1',corridorAttachment()]]));
 const rack=applyRackTranslation(station.scenario,{...i.proposal,kind:'RACK_TRANSLATION',entityId:'R1',target:{mode:'DELTA_MM',deltaMm:{dx:500,dz:0}}},buildRackAttachmentMap(station.scenario));
 const j=await fixture(rack.scenario);const result=await runAgentPlacementComparison(j);expect(result.validation.candidateValid).toBe(true);expect(result.bundle.scenario.resources).toEqual(station.scenario.resources);expect(result.bundle.scenario.locations).toEqual(rack.scenario.locations);
 expect((await runAgentPlacementComparison({...j,proposal:i.proposal})).validation.candidateValid).toBe(false);
 const first=applyAgentInitialPlacement(i.baselineScenario,i.proposal);const last=applyRackTranslation(first.scenario,{...j.proposal,kind:'RACK_TRANSLATION',entityId:'R1',parent:(await fixture(first.scenario)).proposal.parent,target:{mode:'DELTA_MM',deltaMm:{dx:500,dz:0}}},buildRackAttachmentMap(first.scenario));expect(last.scenario.mobileUnits).toEqual(first.scenario.mobileUnits);
});
it('reports repaired invalid baseline separately from persistent invalid geometry',async()=>{
 const s=parseOperationsScenario(buildCorridorScenario());s.mobileUnits[0]!.parkingSlotMm={x:0,z:3000};const i=await fixture(s);i.proposal.target={mode:'ABSOLUTE_CENTER_MM',centerMm:{x:2000,z:3000}};
 const repaired=await runAgentPlacementComparison(i);expect(repaired.validation.baselineValid).toBe(false);expect(repaired.validation.candidateValid).toBe(true);expect(repaired.measurement).toBe('candidate-only-repaired');expect(repaired.improvement).toBe('not-measured');expect(repaired.baselineRun).toBeNull();expect(repaired.delta).toBeNull();
 i.proposal.target={mode:'DELTA_MM',deltaMm:{dx:0,dz:0}};const persistent=await runAgentPlacementComparison(i);expect(persistent.measurement).toBe('not-measured');expect(persistent.candidateRun).toBeNull();
});

