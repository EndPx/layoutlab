import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {defaultApprovedConstraints} from '@layoutlab/simulation';
import {verifyLayoutInvestigationExport,parseProviderLayoutInterpretation} from '../src/layout-investigations.js';
const scenario=JSON.parse(readFileSync('fixtures/operations/picking-packing-burst.json','utf8'));
const input={scenario,executionConfig:{pickDurationMsPerItem:2000,unloadDurationMsPerItem:1500},question:'PACK-1',safetyCeilingMs:600000,mode:'live' as const,consent:true as const};
const raw=(ids:string[])=>{const {allowedEntityIds,...constraints}=defaultApprovedConstraints(ids);return {objective:'Move packing',constraints,allowedRegions:ids.map(entityId=>({entityId,minXMm:0,minZMm:0,maxXMm:24000,maxZMm:18000}))};};
it('derives exact one/two region IDs without mutating provider output',()=>{for(const ids of [['PACK-1'],['PACK-1','PACK-2']]){const r=raw(ids),before=structuredClone(r);expect(parseProviderLayoutInterpretation(r,input).constraints.allowedEntityIds).toEqual(ids);expect(r).toEqual(before);}});
it('rejects duplicate, unknown, locked, outside and extra fields',()=>{
 for(const ids of [['PACK-1','PACK-1'],['UNKNOWN'],['RCV-1']])expect(()=>parseProviderLayoutInterpretation(raw(ids),input)).toThrow();
 const r=raw(['PACK-1']);expect(()=>parseProviderLayoutInterpretation({...r,constraints:{...r.constraints,allowedEntityIds:['PACK-1']}},input)).toThrow();
 expect(()=>parseProviderLayoutInterpretation({...r,extra:true},input)).toThrow();
 expect(()=>parseProviderLayoutInterpretation({...r,allowedRegions:[{...r.allowedRegions[0],maxXMm:24001}]},input)).toThrow();
});

it('rejects tampering with canonical derived interpretation in real failed report',async()=>{
 const report=JSON.parse(readFileSync('evidence/sanitized/gater-live/canonical-regions/layout.json','utf8'));
 expect((await verifyLayoutInvestigationExport(report)).ok).toBe(true);
 report.interpreted.constraints.allowedEntityIds=['PACK-2'];
 expect((await verifyLayoutInvestigationExport(report)).ok).toBe(false);
},30000);
