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
const config=(extra={})=>loadConfig({MODEL_API_KEY:"fake-test-only",MODEL_API_BASE_URL:"https://api.gater.ai.id/v1",MODEL_ID:"glm-5-3-flash",...extra});
function fixture(handler:(p:any,n:number)=>unknown) {
 const payloads:any[]=[];
 const fetchImpl:FetchLike=async(_url,options)=>{
  const body=JSON.parse(options!.body as string);
  expect((body.max_completion_tokens ?? body.max_tokens)).toBeLessThanOrEqual(2000);
  const check=(s:any)=>{if(s.properties){expect(s.additionalProperties).toBe(false);expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());Object.values(s.properties).forEach(check);}if(s.items)check(s.items);};
  check(body.response_format.json_schema.schema);
  const p=JSON.parse(body.messages[1].content);payloads.push(p);
  return new Response(JSON.stringify({id:"fixture-response",model:"fixture",choices:[{message:{content:JSON.stringify(handler(p,payloads.length))},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
 };return {fetchImpl,payloads};
}
const propose=(p:any,z=4000)=>({action:"propose",hypothesis:"Test actual translation",proposalId:"move-1",entityId:"PACK-1",parent:p.parent,centerMm:{x:20500,z},candidateId:null});
const finish=(id:string)=>({action:"finish",hypothesis:"Based on actual reports",proposalId:null,entityId:null,parent:null,centerMm:null,candidateId:id});
async function started(store:LayoutInvestigationStore,f:FetchLike,claim:string|null=null){const r=await store.create(input(),claim);store.start(r,f);await r.task;expect(r.report.state,r.report.error??"").toBe("AWAITING_APPROVAL");return r;}
// Injected transport only: no real Gater or Meta inference. Verification has no provider configuration.
describe("Gater layout offline lifecycle",()=>{
 it("interpret -> approval -> invalid feedback -> revision -> cap fallback, exact manual equality and offline tamper rejection",async()=>{
  const f=fixture((p,n)=>{if(n===1)return interpretation();if(n===2)return propose(p,-1000);if(n===3){expect(p.results[0].validation.ok).toBe(false);return propose(p);}expect(p.results[1].metrics.shipped).toBeTypeOf("number");return finish(p.finishCandidateIds.at(-1));});
  const store=new LayoutInvestigationStore(config());const r=await started(store,f.fetchImpl);
  expect(f.payloads).toHaveLength(1);expect(r.report.proposals).toHaveLength(0);
  const approved=interpretation();store.approve(r.report.runId,approved,f.fetchImpl);approved.constraints.maxMovedEntities=0;await r.task;
  expect(r.report.provider).toEqual({kind:"gater",model:"glm-5-3-flash"});expect(r.report.budget.dispatched).toBe(4);expect(r.report.requests).toHaveLength(4);expect(r.report.state,r.report.error??"").toBe("COMPLETED");expect(r.report.modelRequestsUsed).toBe(4);expect(r.report.proposalsUsed).toBe(2);
  expect(f.payloads[2].results[0].validation.ok).toBe(false);expect(f.payloads[2].results[0].regionIssues).toContain("OUTSIDE_APPROVED_REGION");
  const valid=r.report.proposals[1]!;expect(valid.evaluation.comparison?.candidateValid).toBe(true);expect(r.report.recommendation?.source).toBe("model");
  const manual=await runLayoutComparison({baselineScenario:r.report.input.scenario,executionConfig:r.report.input.executionConfig,proposal:valid.proposal,attachments:r.report.attachments,approvedConstraints:r.report.approved!.constraints,safetyCeilingMs:r.report.input.safetyCeilingMs});
  expect(valid.evaluation.comparison).toEqual(manual);
  expect(await verifyLayoutInvestigationExport(store.buildReport(r))).toEqual({ok:true,mismatches:[]});
  for(const mutate of [(e:any)=>e.provider.kind="unknown", (e:any)=>e.input.scenario.seed++, (e:any)=>e.input.executionConfig.pickDurationMsPerItem++, (e:any)=>e.proposals[1].evaluation.comparison.candidateMetrics.shipped++, (e:any)=>e.modelRequestsUsed--, (e:any)=>e.budget.dispatched--, (e:any)=>e.proposals[1].proposal.parent.scenarioContentSha256="0".repeat(64), (e:any)=>e.recommendation.candidateId="unknown"]){const e=store.buildReport(r);mutate(e);expect((await verifyLayoutInvestigationExport(e)).ok).toBe(false);}
 },120000);
 it("verifies archived fixture export offline",async()=>{const report=JSON.parse(readFileSync("evidence/sanitized/l2a/fixture-report.json","utf8")); const result=await verifyLayoutInvestigationExport(report);expect(result.ok).toBe(true);},120000);
});
