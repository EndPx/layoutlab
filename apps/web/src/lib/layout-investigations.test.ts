import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { defaultApprovedConstraints } from '@layoutlab/simulation';
import { createLayoutInvestigation, approveLayoutInvestigation, cancelLayoutInvestigation, getLayoutInvestigation, getLayoutReport, verifyLayoutReport, parseLayoutReport, approvalErrors, layoutContext, type LayoutReport } from './layout-investigations';
const fixture = JSON.parse(fs.readFileSync('apps/web/public/evidence/e4a-live-investigation-f24a6a1.json','utf8'));
const input = {scenario:fixture.input.scenario,executionConfig:fixture.input.executionConfig,question:'Move packing station',mode:'live' as const,consent:true as const,safetyCeilingMs:7200000};
const approval = {objective:'Corrected objective',constraints:defaultApprovedConstraints(['PACK-1']),allowedRegions:[{entityId:'PACK-1',minXMm:0,minZMm:0,maxXMm:1000,maxZMm:1000}]};
const report = {provider:{kind:'gater',model:'glm-5-3-flash'},schema:'layoutlab.layout-investigation/1',runId:'same',state:'RUNNING',deadlineAt:Date.now()+120000,modelRequestsUsed:1,proposalsUsed:0,interpreted:null,approved:null,input,implementationVersion:'0.1.1',promptVersion:'layoutlab.layout-investigation-prompt/1',error:null};
afterEach(() => vi.unstubAllGlobals());
describe('layout HTTP adapter', () => {
 it('rejects unknown states, schemas, missing input/version and malformed interpretation', () => {
  for (const value of [{...report,provider:{kind:'other',model:'glm-5-3-flash'}},{...report,provider:{kind:'gater',model:null}},{...report,state:'DONE'},{...report,schema:'other'},{...report,input:null},{...report,implementationVersion:undefined},{...report,interpreted:{}},{...report,state:'AWAITING_APPROVAL'},{...report,interpreted:{...approval,allowedRegions:[null]}}]) expect(() => parseLayoutReport(value)).toThrow();
 });
 it('preserves full evidence and compares canonical content plus implementation version', () => {
  const full={...report,requests:[{extra:'preserved'}]};expect(parseLayoutReport(full)).toBe(full);
  expect(layoutContext(input.scenario,input.executionConfig,'v1')).not.toBe(layoutContext(input.scenario,input.executionConfig,'v2'));
  expect(layoutContext(input.scenario,input.executionConfig,'v1')).not.toBe(layoutContext({...input.scenario,seed:'changed'},input.executionConfig,'v1'));
 });
 it('sends exact namespace/payload; approval, status, cancel, report and verify never create', async () => {
  const fetch = vi.fn().mockResolvedValue({ok:true,json:async () => report});vi.stubGlobal('fetch',fetch);
  await createLayoutInvestigation(input);await approveLayoutInvestigation('same',approval);await getLayoutInvestigation('same');await cancelLayoutInvestigation('same');await getLayoutReport('same');
  expect(fetch.mock.calls.map(c=>c[0])).toEqual(['/api/operations/layout-investigations','/api/operations/layout-investigations/same/approve','/api/operations/layout-investigations/same','/api/operations/layout-investigations/same/cancel','/api/operations/layout-investigations/same/report']);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({approval});expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({});
  fetch.mockResolvedValue({ok:true,json:async()=>({ok:true,mismatches:[]})});await verifyLayoutReport(report as LayoutReport);expect(fetch.mock.calls[5][0]).toBe('/api/operations/layout-investigations/verify');expect(JSON.parse(fetch.mock.calls[5][1].body)).toEqual({report});
 });
 it('surfaces 401, 413 and malformed successful responses without retry',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  for(const status of [401,413]){fetch.mockResolvedValue({ok:false,status,json:async()=>({})});await expect(getLayoutInvestigation('same')).rejects.toThrow(status===413?'1 MiB':'Sign-in');}
  fetch.mockResolvedValue({ok:true,json:async()=>({})});await expect(getLayoutInvestigation('same')).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(3);
 });
 it('validates corrected authority, station IDs, fixed inputs and in-room regions',()=>{
  expect(approvalErrors(approval,input.scenario)).toEqual([]);
  for(const constraints of [{...approval.constraints,maxMovedEntities:2},{...approval.constraints,maxTranslationMm:5001},{...approval.constraints,snapGridMm:1},{...approval.constraints,allowedEntityIds:['RCV-1']},{...approval.constraints,requireSameSeed:false}])expect(approvalErrors({...approval,constraints},input.scenario).length).toBeGreaterThan(0);
  expect(approvalErrors({...approval,allowedRegions:[{...approval.allowedRegions[0],maxXMm:999999}]},input.scenario).length).toBeGreaterThan(0);
 });
});
