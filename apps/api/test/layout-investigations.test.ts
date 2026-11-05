import { readFileSync, mkdtempSync, renameSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { defaultApprovedConstraints, runLayoutComparison, contentSha256, applyPackingStationTranslation, buildStationAttachmentMap } from "@layoutlab/simulation";
import { evaluateLayoutProposal, LayoutInvestigationStore, parseLayoutInvestigationInput, resolveInvestigationAttachments, verifyLayoutInvestigationExport, type LayoutInvestigationRecord } from "../src/layout-investigations.js";
import { loadConfig } from "../src/config.js";
import { createBudgetGuard, initializeBudgetLedger } from "../src/budget-guard.js";
import type { FetchLike } from "../src/provider.js";
const scenario=JSON.parse(readFileSync("fixtures/operations/picking-packing-burst.json","utf8"));
const input=()=>({scenario:structuredClone(scenario),executionConfig:{pickDurationMsPerItem:2000,unloadDurationMsPerItem:1500},question:"Move packing to reduce waiting; receiving and inputs locked",safetyCeilingMs:600000,mode:"live" as const,consent:true as const});
const interpretation=()=>({objective:"Reduce packing travel",constraints:defaultApprovedConstraints(["PACK-1"]),allowedRegions:[{entityId:"PACK-1",minXMm:0,minZMm:0,maxXMm:scenario.geometry.room.widthMm,maxZMm:scenario.geometry.room.depthMm}]});
const config=(extra={})=>loadConfig({MODEL_API_KEY:"fixture-only",META_API_BASE_URL:"http://127.0.0.1:9999/v1",...extra});
function fixture(handler:(p:any,n:number)=>unknown) {
 const payloads:any[]=[];
 const fetchImpl:FetchLike=async(_url,options)=>{
  const body=JSON.parse(options!.body as string);
  expect(body.max_completion_tokens).toBeLessThanOrEqual(2000);
  const check=(s:any)=>{if(s.properties){expect(s.additionalProperties).toBe(false);expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());Object.values(s.properties).forEach(check);}if(s.items)check(s.items);};
  check(body.response_format.json_schema.schema);
  const p=JSON.parse(body.messages[1].content);payloads.push(p);
  return new Response(JSON.stringify({id:"fixture-response",model:"fixture",choices:[{message:{content:JSON.stringify(providerV3(handler(p,payloads.length)))},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
 };return {fetchImpl,payloads};
}
const propose=(p:any,z=4000)=>({action:"propose",hypothesis:"Test actual translation",proposalId:"move-1",entityId:"PACK-1",parent:p.parent,centerMm:{x:20500,z},candidateId:null});
const finish=(id:string)=>({action:"finish",hypothesis:"Based on actual reports",proposalId:null,entityId:null,parent:null,centerMm:null,candidateId:id});
async function started(store:LayoutInvestigationStore,f:FetchLike,claim:string|null=null){const r=await store.create(input(),claim);store.start(r,f);await r.task;expect(r.report.state,r.report.error??"").toBe("AWAITING_APPROVAL");return r;}
describe("L2a executable fixture service, zero real inference",()=>{
 it("interpret -> approval -> invalid feedback -> revision -> cap fallback, exact manual equality and offline tamper rejection",async()=>{
  const f=fixture((p,n)=>{if(n===1)return interpretation();if(n===2)return propose(p,-1000);if(n===3){expect(p.results[0].validation.ok).toBe(false);return propose(p);}expect(p.results[1].metrics.shipped).toBeTypeOf("number");return finish(p.finishCandidateIds.at(-1));});
  const store=new LayoutInvestigationStore(config());const r=await started(store,f.fetchImpl);
  expect(f.payloads).toHaveLength(1);expect(r.report.proposals).toHaveLength(0);
  const approved=interpretation();store.approve(r.report.runId,approved,f.fetchImpl);approved.constraints.maxMovedEntities=0;await r.task;
  expect(r.report.state,r.report.error??"").toBe("COMPLETED");expect(r.report.modelRequestsUsed).toBe(4);expect(r.report.proposalsUsed).toBe(2);
  expect(f.payloads[2].results[0].validation.ok).toBe(false);expect(f.payloads[2].results[0].regionIssues).toContain("OUTSIDE_APPROVED_REGION");
  const valid=r.report.proposals[1]!;expect(valid.evaluation.comparison?.candidateValid).toBe(true);expect(r.report.recommendation?.source).toBe("model");
  const manual=await runLayoutComparison({baselineScenario:r.report.input.scenario,executionConfig:r.report.input.executionConfig,proposal:valid.proposal,attachments:r.report.attachments,approvedConstraints:r.report.approved!.constraints,safetyCeilingMs:r.report.input.safetyCeilingMs});
  expect(valid.evaluation.comparison).toEqual(manual);
  expect(await verifyLayoutInvestigationExport(store.buildReport(r))).toEqual({ok:true,mismatches:[]}); mkdirSync("evidence/sanitized/l2a",{recursive:true});writeFileSync("evidence/sanitized/l2a/fixture-report.json",JSON.stringify(store.buildReport(r),null,2));
  for(const mutate of [(e:any)=>e.input.scenario.seed++, (e:any)=>e.input.executionConfig.pickDurationMsPerItem++, (e:any)=>e.proposals[1].evaluation.comparison.candidateMetrics.shipped++, (e:any)=>e.modelRequestsUsed--, (e:any)=>e.budget.dispatched--, (e:any)=>e.proposals[1].proposal.parent.scenarioContentSha256="0".repeat(64), (e:any)=>e.recommendation.candidateId="unknown"]){const e=store.buildReport(r);mutate(e);expect((await verifyLayoutInvestigationExport(e)).ok).toBe(false);}
 },120000);
 it("caps three proposals plus interpretation, labels fallback honestly, denies stale and receiving",async()=>{
  const f=fixture((p,n)=>{if(n===1)return interpretation();const a=propose(p);if(n===2)a.entityId="RCV-1";if(n===3)a.parent={...a.parent,scenarioContentSha256:"0".repeat(64)};return a;});
  const store=new LayoutInvestigationStore(config());const r=await started(store,f.fetchImpl);store.approve(r.report.runId,interpretation(),f.fetchImpl);await r.task;
  expect(r.report.modelRequestsUsed).toBe(4);expect(r.report.proposalsUsed).toBe(3);expect(r.report.recommendation?.source).toBe("deterministic-fallback");
  expect(r.report.proposals[0]!.evaluation.comparison).toBeNull();expect(r.report.proposals[1]!.evaluation.comparison).toBeNull();
  expect(JSON.stringify(r.report.proposals[0]!.evaluation.validation)).toContain("LOCKED_ENTITY");expect(JSON.stringify(r.report.proposals[1]!.evaluation.validation)).toContain("STALE_REVISION");
  expect((await verifyLayoutInvestigationExport(store.buildReport(r))).ok).toBe(true);
  expect(()=>store.approve(r.report.runId,interpretation(),f.fetchImpl)).toThrow();
 },120000);
 it("rejects unknown model finish and uses bounded fallback",async()=>{
  const f=fixture((_p,n)=>n===1?interpretation():finish("unknown"));const store=new LayoutInvestigationStore(config({MAX_MODEL_REQUESTS_PER_RUN:"2"}));const r=await started(store,f.fetchImpl);store.approve(r.report.runId,interpretation(),f.fetchImpl);await r.task;
  expect(r.report.rejectedActions[0]?.reason).toBe("UNKNOWN_OR_INVALID_RECOMMENDATION");expect(r.report.recommendation).toEqual({candidateId:"baseline",source:"deterministic-fallback"});expect((await verifyLayoutInvestigationExport(store.buildReport(r))).ok).toBe(true);
 },30000);
 it("one last held claim remains usable at zero available, cancellation never refunds, guard loss dispatches nothing",async()=>{
  const file=join(mkdtempSync(join(tmpdir(),"l2-budget-")),"ledger.json");initializeBudgetLedger({filePath:file,capUsd:.25});const guard=createBudgetGuard({filePath:file,capUsd:.25});guard.reserve("full-run",.25);
  const f=fixture((p)=>p.approved?finish("baseline"):interpretation());const store=new LayoutInvestigationStore(config(),{beforeDispatch:r=>guard.assertReservation(r.report.budget.claimId!,.25)});
  const r=await started(store,f.fetchImpl,"full-run");expect(guard.snapshot().availableMicroUsd).toBe(0);store.approve(r.report.runId,interpretation(),f.fetchImpl);await r.task;expect(f.payloads).toHaveLength(2);guard.commit("full-run");expect(guard.snapshot().committedMicroUsd).toBe(250000);
  const file2=join(mkdtempSync(join(tmpdir(),"l2-loss-")),"ledger.json");initializeBudgetLedger({filePath:file2,capUsd:.25});const g=createBudgetGuard({filePath:file2,capUsd:.25});g.reserve("held",.25);
  const s=new LayoutInvestigationStore(config(),{beforeDispatch:r=>g.assertReservation(r.report.budget.claimId!,.25)});const x=await started(s,f.fetchImpl,"held");renameSync(file2,file2+".held");s.approve(x.report.runId,interpretation(),f.fetchImpl);await x.task;expect(x.report.state).toBe("FAILED");expect(x.report.modelRequestsUsed).toBe(1);expect(x.report.budget.dispatched).toBe(1);
  const c=new LayoutInvestigationStore(config());const y=await started(c,f.fetchImpl,"preserved-claim");c.cancel(y.report.runId);expect(y.report.budget).toEqual({claimId:"preserved-claim",dispatched:1});expect(()=>c.approve(y.report.runId,interpretation(),f.fetchImpl)).toThrow();
 },120000);
 it("denies room regions, staffing/service smuggling and gates repeated start, approval and busy service",async()=>{
  const f=fixture((_p,n)=>n===1?interpretation():({...finish("baseline"),extraPickers:1}));const s=new LayoutInvestigationStore(config({MAX_MODEL_REQUESTS_PER_RUN:"2"}));const r=await started(s,f.fetchImpl);
  expect(()=>s.start(r,f.fetchImpl)).toThrow();const a=interpretation();a.allowedRegions[0]!.maxXMm=999999;expect(()=>s.approve(r.report.runId,a,f.fetchImpl)).toThrow("room");
  s.approve(r.report.runId,interpretation(),f.fetchImpl);await r.task;expect(r.report.rejectedActions).toHaveLength(1);expect(r.report.proposals).toHaveLength(0);
  const busy=new LayoutInvestigationStore(config(),{isLegacyBusy:()=>true});await expect(busy.create(input(),null)).rejects.toThrow("CONCURRENCY_LIMIT");
 },30000);
 it("deadline includes approval waiting and dispatched cancellation preserves counters",async()=>{
  vi.useFakeTimers();
  try {
    const f=fixture(()=>interpretation());const s=new LayoutInvestigationStore(config());const r=await started(s,f.fetchImpl);await vi.advanceTimersByTimeAsync(120000);expect(r.report.state).toBe("TIMED_OUT");expect(r.report.modelRequestsUsed).toBe(1);expect(()=>s.approve(r.report.runId,interpretation(),f.fetchImpl)).toThrow();
  }finally{vi.useRealTimers();}
  const initial=fixture(()=>interpretation());let reached!:()=>void;const gate=new Promise<void>(resolve=>reached=resolve);
  const f:FetchLike=async(url,options)=>{const body=JSON.parse(options!.body as string);if(body.response_format.json_schema.name==="layout_interpretation")return initial.fetchImpl(url,options);reached();return new Promise<Response>((_resolve,reject)=>{options!.signal!.addEventListener("abort",()=>reject(new Error("aborted fixture")),{once:true});});};
  const s=new LayoutInvestigationStore(config());const r=await started(s,f);s.approve(r.report.runId,interpretation(),f);await gate;s.cancel(r.report.runId);await r.task;expect(r.report.state).toBe("CANCELLED");expect(r.report.modelRequestsUsed).toBe(2);expect(r.report.budget.dispatched).toBe(2);expect(r.report.requests[1]!.status).toBe("aborted");expect((await verifyLayoutInvestigationExport(s.buildReport(r))).ok).toBe(true);
 },30000);
 it("enforces approved centre region independently of valid geometry and detects blocked rack placement",async()=>{
  const i=parseLayoutInvestigationInput(input());const a=interpretation();a.allowedRegions[0]!.minZMm=5000;
  const p=propose({parent:{scenarioId:i.scenario.id,scenarioContentSha256:await contentSha256(i.scenario),schemaVersion:i.scenario.schemaVersion,engineVersion:i.scenario.engineVersion}});
  const canonical=(await import("../src/layout-investigations.js")).parseProviderLayoutAction(p);if(canonical.action!=="propose")throw new Error("fixture");
  const e=await evaluateLayoutProposal(i,a,canonical.proposal);expect(e.validation.ok).toBe(true);expect(e.regionIssues).toEqual(["OUTSIDE_APPROVED_REGION"]);expect(e.comparison).toBeNull();
  const rack=i.scenario.geometry.racks[0]!;canonical.proposal.target.centerMm={x:rack.positionMm.x,z:rack.positionMm.z};
  const blocked=await evaluateLayoutProposal(i,interpretation(),canonical.proposal);expect(blocked.validation.ok).toBe(false);expect(blocked.comparison).toBeNull();
 },30000);
 it("honors a lower proposal cap and context bound without extra dispatch or authority",async()=>{
  const f=fixture((p,n)=>n===1?interpretation():propose(p));const s=new LayoutInvestigationStore(config({MAX_PROPOSALS_PER_RUN:"0",MAX_MODEL_REQUESTS_PER_RUN:"2"}));const r=await started(s,f.fetchImpl);s.approve(r.report.runId,interpretation(),f.fetchImpl);await r.task;expect(r.report.proposalsUsed).toBe(0);expect(r.report.rejectedActions[0]?.reason).toBe("PROPOSAL_LIMIT");expect((await verifyLayoutInvestigationExport(s.buildReport(r))).ok).toBe(true);
  let guarded=0;const bounded=new LayoutInvestigationStore({...config(),maxContextChars:1},{beforeDispatch:()=>{guarded++;}});const x=await bounded.create(input(),"held");bounded.start(x,f.fetchImpl);await x.task;expect(x.report.state).toBe("FAILED");expect(x.report.modelRequestsUsed).toBe(0);expect(guarded).toBe(0);
  await expect(new LayoutInvestigationStore({...config(),budgetStateFile:"configured"}).create(input(),null)).rejects.toThrow("BUDGET_GUARD_UNAVAILABLE");
 },30000);
 it("replays the saved fixture without provider and rejects workload tampering even with a new input hash",async()=>{
  const report=JSON.parse(readFileSync("evidence/sanitized/l2a/fixture-report.json","utf8"));expect(await verifyLayoutInvestigationExport(report)).toEqual({ok:true,mismatches:[]});
  report.input.scenario.orderSchedule[0].lines[0].quantity++;report.inputSha256=await contentSha256(report.input);
  const result=await verifyLayoutInvestigationExport(report);expect(result.ok).toBe(false);expect(result.mismatches).toContain("baseline fixed inputs");
 },30000);
 it("resolves an applied parent without losing other station translations",async()=>{
  let s=parseLayoutInvestigationInput(input()).scenario;for(const [entityId,z] of [["PACK-1",4000],["PACK-2",12000]] as const){const attachments=resolveInvestigationAttachments(s);s=applyPackingStationTranslation(s,{kind:"PACKING_STATION_TRANSLATION",proposalId:"manual",parent:{scenarioId:s.id,scenarioContentSha256:await contentSha256(s),schemaVersion:s.schemaVersion,engineVersion:s.engineVersion},entityId,target:{mode:"ABSOLUTE_CENTER_MM",centerMm:{x:20500,z}}},buildStationAttachmentMap(s,attachments)).scenario;}expect(resolveInvestigationAttachments(s).map(a=>a.centreMm.z)).toEqual([4000,12000]);
  s.resources.find((r:any)=>r.id==="PACK-1")!.queueSlots[0]!.z++;expect(()=>resolveInvestigationAttachments(s)).toThrow();
 });
});








function providerV3(value:any){if(value?.objective && value?.constraints && value?.allowedRegions){const {allowedEntityIds,...constraints}=value.constraints;return {...value,constraints};}return value;}
