import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import {evaluateLayoutProposal,parseProviderLayoutAction,LayoutInvestigationStore,verifyLayoutInvestigationExport,type LayoutInvestigationReport} from '../src/layout-investigations.js';
import {loadConfig} from '../src/config.js';
import type {FetchLike} from '../src/provider.js';
const saved:LayoutInvestigationReport=JSON.parse(readFileSync('evidence/sanitized/l2a/fixture-report.json','utf8'));
const config=(requests=2)=>({...loadConfig({MODEL_API_KEY:'fixture-only',META_API_BASE_URL:'http://127.0.0.1:9999/v1'}),maxRequests:requests});
const input=()=>({...structuredClone(saved.input),safetyCeilingMs:1000});
const finish=(id:string)=>({action:'finish',hypothesis:'fixture',proposalId:null,entityId:null,parent:null,centerMm:null,candidateId:id});
const fixture=(id:string):FetchLike=>async(_url,options)=>{
 const body=JSON.parse(options!.body as string);const value=body.response_format.json_schema.name==='layout_interpretation'?saved.interpreted:finish(id);
 return new Response(JSON.stringify({id:'fixture',model:'fixture',choices:[{message:{content:JSON.stringify(providerV3(value))},finish_reason:'stop'}]}));
};
async function completed(id:string,requests=2){const s=new LayoutInvestigationStore(config(requests));const r=await s.create(input(),null);s.start(r,fixture(id));await r.task;expect(r.report.state).toBe('AWAITING_APPROVAL');s.approve(r.report.runId,saved.approved,fixture(id));await r.task;expect(r.report.state).toBe('COMPLETED');return s.buildReport(r);}
describe('L2a independent review regression negatives',()=>{
 it('immediate start/cancel before parent hash commits nothing and verifies with zero calls',async()=>{
  let calls=0;const s=new LayoutInvestigationStore(config());const r=await s.create(input(),null);s.start(r,async()=>{calls++;throw Error('unexpected');});s.cancel(r.report.runId);const at=s.buildReport(r);await r.task;
  expect(calls).toBe(0);expect(at.baseline).toBeNull();expect(s.buildReport(r)).toEqual(at);expect(await verifyLayoutInvestigationExport(s.buildReport(r))).toEqual({ok:true,mismatches:[]});
 });
 it('stops evaluation before simulator work when its live guard is lost',async()=>{
  let checks=0;const proposal=parseProviderLayoutAction(saved.requests.find(q=>q.index===saved.proposals[1]!.requestIndex)!.output);if(proposal.action!=='propose')throw Error('fixture');
  await expect(evaluateLayoutProposal(input(),saved.approved!,proposal.proposal,()=>++checks===1)).rejects.toThrow('RUN_CLOSED');expect(checks).toBe(2);
 });
 it('rejects fabricated rejection for an actually evaluated successful proposal',async()=>{
  const forged=structuredClone(saved);forged.rejectedActions.push({requestIndex:forged.proposals[0]!.requestIndex,reason:'FABRICATED_REJECTION_NEVER_RETURNED_BY_VALIDATOR'});
  const result=await verifyLayoutInvestigationExport(forged);expect(result.ok).toBe(false);expect(result.mismatches).toContain('exact derived rejection evidence');
 },60000);
 it('requires exact missing/duplicate/contradictory/bounded rejection evidence, preserving genuine rejection and exhaustion',async()=>{
  const report=await completed('unknown');expect(await verifyLayoutInvestigationExport(report)).toEqual({ok:true,mismatches:[]});expect(report.rejectedActions).toHaveLength(1);
  const changes=[(r:LayoutInvestigationReport)=>{r.rejectedActions=[];},(r:LayoutInvestigationReport)=>{r.rejectedActions.push({...r.rejectedActions[0]!});},(r:LayoutInvestigationReport)=>{r.rejectedActions[0]!.reason='fabricated';},(r:LayoutInvestigationReport)=>{r.rejectedActions[0]!.reason='x'.repeat(501);}];
  for(const change of changes){const r=structuredClone(report);change(r);expect((await verifyLayoutInvestigationExport(r)).ok).toBe(false);}
  const valid=await completed('baseline');valid.rejectedActions.push({requestIndex:2,reason:'PROPOSAL_LIMIT'});expect((await verifyLayoutInvestigationExport(valid)).ok).toBe(false);
 },60000);
 it('rejects independently forged empty completion and premature completion while accepting genuine finish/exhaustion',async()=>{
  const empty=structuredClone(saved);Object.assign(empty,{state:'COMPLETED',baseline:null,interpreted:null,approved:null,requests:[],proposals:[],rejectedActions:[],recommendation:null,modelRequestsUsed:0,proposalsUsed:0,error:null});empty.budget.dispatched=0;
  const result=await verifyLayoutInvestigationExport(empty);expect(result.ok).toBe(false);expect(result.mismatches).toContain('completed lifecycle requires baseline interpretation and approval');
  for(const [id,cap] of [['baseline',2],['unknown',2],['baseline',1]] as const){const report=await completed(id,cap);expect(await verifyLayoutInvestigationExport(report)).toEqual({ok:true,mismatches:[]});if(cap===1){report.limits.requests=4;expect((await verifyLayoutInvestigationExport(report)).ok).toBe(false);}}
 },60000);
 it('keeps genuine pre-dispatch failed/cancelled/timed-out reports valid',async()=>{
  const failed=new LayoutInvestigationStore(config(0));const f=await failed.create(input(),null);failed.start(f,fixture('baseline'));await f.task;expect(f.report.state).toBe('FAILED');expect(f.report.requests).toHaveLength(0);expect((await verifyLayoutInvestigationExport(failed.buildReport(f))).ok).toBe(true);
  const cancelled=new LayoutInvestigationStore(config());const c=await cancelled.create(input(),null);cancelled.cancel(c.report.runId);expect((await verifyLayoutInvestigationExport(cancelled.buildReport(c))).ok).toBe(true);
  vi.useFakeTimers();try{const timed=new LayoutInvestigationStore({...config(),timeoutMs:1});const t=await timed.create(input(),null);await vi.advanceTimersByTimeAsync(1);expect(t.report.state).toBe('TIMED_OUT');expect((await verifyLayoutInvestigationExport(timed.buildReport(t))).ok).toBe(true);}finally{vi.useRealTimers();}
 },60000);
});

function providerV3(value:any){if(value?.objective && value?.constraints && value?.allowedRegions){const {allowedEntityIds,...constraints}=value.constraints;return {...value,constraints};}return value;}
