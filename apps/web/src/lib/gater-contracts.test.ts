import {RunStore} from '../../../api/src/runs';
import {loadConfig} from '../../../api/src/config';
import {methodLabelFor} from '@layoutlab/core';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseApiStatus, parseRunSummary } from './api';
import { parseInvestigationSummary } from './experiments';
import { replayM3Envelope, replayFailureEnvelope } from './export';
const load = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const budgets = {maxRequests:4,maxProposals:3,timeoutMs:120000};
const settings = {reasoningEffort:'not-specified',maxCompletionTokens:2000};
// Literal toSummary/status fields from API source; zero dispatched requests is not live evidence.
const run = {runId:'gater-contract',state:'INTERPRETING',phase:'INTERPRETING',createdAt:'2026-11-05T00:00:00.000Z',expiresAt:'2026-11-05T00:02:00.000Z',completedAt:null,modelRequestsUsed:0,proposalsUsed:0,budgets,requirementsDraft:null,interpretedUnresolved:[],interpretError:null,requirements:null,baseline:null,heuristic:null,methodLabels:{},candidateBudgets:{heuristic:{evaluationsUsed:0,evaluationsBudget:64},model:{proposalsUsed:0,requestsUsed:0,maxProposals:3,maxRequests:4}},attempts:[],bestName:null,outcome:null,lastError:null,usageTotals:null,usageIncomplete:false,provider:'gater',providerKind:'gater',realMetaRequests:0,modelId:'glm-5-3-flash',promptVersion:'p',generationSettings:settings};
const status = {liveAvailable:true,reason:null,status:'ready',baseUrl:'https://api.gater.ai.id/v1',modelId:'glm-5-3-flash',promptVersion:'p',apiVersion:'0.4.0',coreVersion:'0.1.0',operationsImplementationVersion:'0.1.1',budgets,concurrency:1,provider:'gater',providerKind:'gater',generationSettings:settings};
const operations = {runId:'gater-contract',investigationId:'gater-contract',state:'RUNNING',phase:'PROPOSING',createdAt:run.createdAt,expiresAt:run.expiresAt,completedAt:null,provider:'gater',providerKind:'gater',realMetaRequests:0,configuredModel:'glm-5-3-flash',returnedModel:null,requestCount:1,experimentCount:0,limits:{maxModelRequests:4,maxExperiments:3,timeoutMs:120000},trace:[],requests:[{index:1,status:'success',responseId:'offline-contract',usage:null,finishReason:'stop',durationMs:1,model:'glm-5-3-flash',errorCode:null,error:null}],recommendation:null,outcome:null,lastError:null,result:null,report:null};
describe('Gater client source contracts', () => {
 it('preserves status and summaries without asserting live inference', () => {
  expect(parseApiStatus(status)).toBe(status); expect(parseRunSummary(run)).toBe(run);
  const low = {...settings, reasoningEffort:'low', maxCompletionTokens:8192};
  expect(parseApiStatus({...status,generationSettings:low}).generationSettings).toEqual(low);
  expect(parseRunSummary({...run,generationSettings:low}).generationSettings).toEqual(low);
  expect(parseInvestigationSummary(operations).requestCount).toBe(1);
 });
 it('rejects pairing, counters, reasoning and malformed nested summaries', () => {
  for (const change of [{provider:'meta'}, {provider:'other'}, {providerKind:'other'}, {realMetaRequests:1}, {candidateBudgets:{heuristic:null,model:{}}}, {requirements:{}}, {attempts:[null]}, {baseline:{name:'bad'}}, {generationSettings:{...settings,reasoningEffort:'high'}}]) expect(() => parseRunSummary({...run,...change})).toThrow();
  for (const change of [{provider:'meta'}, {budgets:null}, {generationSettings:undefined}, {generationSettings:{}}]) expect(() => parseApiStatus({...status,...change})).toThrow();
  for (const change of [{provider:'meta'}, {realMetaRequests:1}, {requests:[null]}, {trace:[{}]}, {report:{}}, {limits:[]}]) expect(() => parseInvestigationSummary({...operations,...change})).toThrow();
 });
 it('rejects Gater generation settings above the 2000 token cap', () => {
  const generationSettings = {...settings,maxCompletionTokens:8193};
  expect(() => parseApiStatus({...status,generationSettings})).toThrow();
  expect(() => parseRunSummary({...run,generationSettings})).toThrow();
  const old = load('evidence/sanitized/m3-live-smoke-report.json');
  expect(() => replayM3Envelope({...old,provider:'gater',providerKind:'gater',realMetaRequests:0,generationSettings})).toThrow('Malformed M3 generation settings');
 });
 it('rejects unsupported provider kind in successful historical M3 reports', () => {
  const old = load('evidence/sanitized/m3-live-smoke-report.json');
  expect(() => replayM3Envelope({...old,providerKind:'unsupported',realMetaRequests:0})).toThrow('M3 envelope must declare providerKind');
 });
 it('replays archived Meta and declared Gater without relabeling', () => {
  const old = load('evidence/sanitized/m3-live-smoke-report.json');
  expect(replayM3Envelope(old).provider).toBe('meta');
  // Synthetic Gater envelope derived from archived Meta measurements; no Gater inference.
  const methodLabels = Object.fromEntries(Object.entries({baseline:'current',...Object.fromEntries(old.candidates.map((c: {name:string})=>[c.name,methodLabelFor(c.name)]))}).map(([name,label]) => [name,label === 'meta-first' ? 'gater-first' : label === 'meta-feedback' ? 'gater-feedback' : label]));
  const gater = {...old,methodLabels,provider:'gater',providerKind:'gater',realMetaRequests:0,modelId:'glm-5-3-flash',generationSettings:settings};
  expect(replayM3Envelope(gater).provider).toBe('gater');
  expect(() => replayM3Envelope({...gater,methodLabels:{...methodLabels,baseline:'other'}})).toThrow();
  expect(replayM3Envelope({...old,providerKind:'fixture',realMetaRequests:0}).provider).toBe('meta');
  for (const change of [{provider:'meta'},{providerKind:'fixture'},{provider:'other'},{realMetaRequests:1},{generationSettings:undefined},{generationSettings:{...settings,reasoningEffort:'high'}},{candidates:[null]}]) expect(() => replayM3Envelope({...gater,...change})).toThrow();
 });
 it('replays an actual fake-transport RunStore Gater export', async () => {
  const store = new RunStore(loadConfig({MODEL_API_KEY:'fake-test',MODEL_API_BASE_URL:'https://api.gater.ai.id/v1',MODEL_ID:'glm-5-3-flash'}));
  const r = store.createRun(load('fixtures/sample/warehouse-basic.json'),'reduce travel');
  const requirements = {objective:'minimize_weighted_picking_travel',maxRelocatedProducts:4,lockedProductIds:[],assumptions:[],unresolvedQuestions:[]};
  const response = (value: unknown) => new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]}));
  store.startInterpretation(r,async()=>response(requirements));
  for(let n=0;n<100 && r.state!=='AWAITING_APPROVAL';n++) await new Promise(resolve=>setTimeout(resolve,5));
  await store.approveRun(r.id,requirements,async()=>response({scenarioRevision:r.scenario.revision,changes:[],rationale:'Keep baseline'}));
  const report = store.buildReport(r.id);
  expect(Object.values(report.methodLabels)).toContain('gater-first');
  expect(replayM3Envelope(report).matchesSaved).toBe(true);
  expect(()=>replayM3Envelope({...report,methodLabels:{...report.methodLabels,baseline:'other'}})).toThrow();
 });
 it('uses shared core Gater failure replay and retains the no-evaluation boundary', () => {
  const audit = {envelopeVersion:'layoutlab.m5failure/1',runId:'audit',exportedAt:run.createdAt,apiVersion:'0.4.0',coreVersion:'0.1.0',routePolicy:'nearest-neighbor-a-star/1',provider:'gater',providerKind:'gater',realMetaRequests:0,modelId:'glm-5-3-flash',promptVersion:'layoutlab.m4prompt/1',generationSettings:settings,state:'TIMED_OUT',phase:'AWAITING_APPROVAL',outcome:null,reportAvailable:false,measurement:null,evaluationBoundary:'no approved report exists',modelRequestsUsed:1,proposalsUsed:0,budgets,usageTotals:null,usageIncomplete:true,scenario:load('fixtures/sample/warehouse-basic.json'),requestText:'reduce travel',requirements:null,requirementsDraft:null,interpretedUnresolved:[],interpretError:null,interpretDiagnostics:null,attempts:[],lastError:'deadline',limitations:['failure audit']};
  expect(replayFailureEnvelope(audit)).toMatchObject({provider:'gater',evaluated:false});
  expect(() => replayFailureEnvelope({...audit,provider:'meta'})).toThrow();
  expect(() => replayFailureEnvelope({...audit,measurement:{}})).toThrow();
 });
});

it('rejects elevated completion ceilings outside exact Gater model',()=>{
 for(const [provider,providerKind,modelId] of [['meta','meta','glm-5-3-flash'],['meta','fixture','glm-5-3-flash'],['gater','gater','other']]) expect(()=>parseApiStatus({...status,provider,providerKind,modelId,generationSettings:{reasoningEffort:'low',maxCompletionTokens:8192}})).toThrow();
});

it('admits historical and exact model extended timeout only',()=>{
 expect(()=>parseApiStatus({...status,budgets:{...budgets,timeoutMs:360000}})).not.toThrow();
 expect(()=>parseApiStatus({...status,budgets:{...budgets,timeoutMs:360001}})).toThrow();
 for(const modelId of ['other'])expect(()=>parseApiStatus({...status,modelId,budgets:{...budgets,timeoutMs:360000}})).toThrow();
 for(const providerKind of ['meta','fixture'])expect(()=>parseApiStatus({...status,provider:'meta',providerKind,budgets:{...budgets,timeoutMs:360000}})).toThrow();
 expect(()=>parseApiStatus(status)).not.toThrow();
});
