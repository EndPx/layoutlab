import { readFileSync, mkdtempSync, renameSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { it, expect } from "vitest";
import { defaultApprovedConstraints, runLayoutComparison } from "@layoutlab/simulation";
import { createApp } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { createBudgetGuard, initializeBudgetLedger } from "../src/budget-guard.js";
// Fixture JSON is asserted field-by-field below; keep the DOM unknown boundary local.
const fetch = globalThis.fetch as (...args: Parameters<typeof globalThis.fetch>) => Promise<Omit<Response, "json"> & { json(): Promise<any> }>;
const path = "/api/operations/layout-investigations";
const scenario = JSON.parse(readFileSync("fixtures/operations/picking-packing-burst.json", "utf8"));
const input = () => ({ scenario, executionConfig: { pickDurationMsPerItem: 2000, unloadDurationMsPerItem: 1500 }, question: "Reduce packing waiting", safetyCeilingMs: 600000, mode: "live", consent: true });
async function listen(server: Server) { server.listen(0, "127.0.0.1"); await once(server, "listening"); return `http://127.0.0.1:${(server.address() as { port: number }).port}`; }
async function fixture(handler?: (payload: any, n: number) => unknown, extra: Record<string,string> = {}) {
 let calls = 0, active = 0, peak = 0;
 const provider = createServer(async (req, res) => {
  let raw = ""; for await (const part of req) raw += part;
  const payload = JSON.parse(JSON.parse(raw).messages[1].content);
  calls++; active++; peak = Math.max(peak, active);
  const result = { objective: "Reduce waiting", constraints: defaultApprovedConstraints(["PACK-1"]), allowedRegions: [{ entityId: "PACK-1", minXMm: 0, minZMm: 0, maxXMm: scenario.geometry.room.widthMm, maxZMm: scenario.geometry.room.depthMm }] };
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ id: "loopback-fake-meta", model: "fixture", choices: [{ message: { content: JSON.stringify(handler ? handler(payload,calls) : result) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })); active--;
 });
 const providerUrl = await listen(provider);
 const file = join(mkdtempSync(join(tmpdir(), "layout-http-")), "budget.json");
 initializeBudgetLedger({ filePath: file, capUsd: .25 });
 const guard = createBudgetGuard({ filePath: file, capUsd: .25 });
 const config = loadConfig({ MODEL_API_KEY: "fixture-only", META_API_BASE_URL: `${providerUrl}/v1`, ...extra });
 const { app } = createApp({ config, budgetGuard: guard });
 const server = createServer(app), base = await listen(server);
 const post = (route: string, body: unknown) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
 const status = (id: string) => fetch(base + path + "/" + id).then(r => r.json());
 const wait = async (id: string) => { const until = Date.now() + 110000; while (Date.now() < until) { const r = await status(id); if (r.state !== "RUNNING") return r; await new Promise(r => setTimeout(r, 20)); } throw Error("fixture deadline"); };
 return { post, status, wait, guard, file, base, calls: () => calls, peak: () => peak, close: async () => { server.closeAllConnections(); provider.closeAllConnections(); await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => provider.close(() => r()))]); } };
}
it("create interpretation holds exactly one claim at zero available, cancel commits", async () => {
 const f = await fixture(); try {
  const response = await f.post(path, input()); expect(response.status).toBe(202); const created = await response.json();
  expect(created.schema).toBe("layoutlab.layout-investigation/1");
  expect((await f.wait(created.runId)).state).toBe("AWAITING_APPROVAL");
  expect(f.guard.snapshot().entries).toHaveLength(1); expect(f.guard.snapshot().availableMicroUsd).toBe(0); expect(f.guard.snapshot().entries[0]!.state).toBe("reserved");
  expect((await f.post(`${path}/${created.runId}/cancel`, {})).status).toBe(200);
  await new Promise(r => setTimeout(r, 20)); expect(f.guard.snapshot().entries[0]!.state).toBe("committed"); expect(f.calls()).toBe(1);
 } finally { await f.close(); }
},120000);
it("malformed create causes zero claims and calls", async () => {
 const f = await fixture(); try { expect((await f.post(path, { ...input(), extra: true })).status).toBe(400); expect(f.guard.snapshot().entries).toHaveLength(0); expect(f.calls()).toBe(0); } finally { await f.close(); }
},120000);
it("concurrent create and other paid routes reject during layout ownership", async () => {
 const f = await fixture(); try {
  const responses = await Promise.all([f.post(path,input()),f.post(path,input())]); expect(responses.map(r=>r.status).sort()).toEqual([202,429]);
  const created = await responses.find(r=>r.status===202)!.json(); expect((await f.wait(created.runId)).state).toBe("AWAITING_APPROVAL");
  expect((await f.post("/api/operations/proposals",{observation:"reduce waiting"})).status).toBe(429);
  expect((await f.post("/api/operations/investigations",input())).status).toBe(429);
  expect((await f.post("/api/runs",{scenario,requestText:"go",mode:"live",consent:true})).status).toBe(429);
  expect((await f.post(path,input())).status).toBe(429); expect(f.calls()).toBe(1); expect(f.peak()).toBe(1);
  await f.post(`${path}/${created.runId}/cancel`,{});
 } finally { await f.close(); }
},120000);

it("corrected approval, invalid feedback, valid move, finish and keyless replay", async () => {
 const f = await fixture((p,n) => {
  if(n===1)return {objective:"Reduce waiting",constraints:defaultApprovedConstraints(["PACK-1"]),allowedRegions:[{entityId:"PACK-1",minXMm:0,minZMm:0,maxXMm:scenario.geometry.room.widthMm,maxZMm:scenario.geometry.room.depthMm}]};
  if(n===4)return {action:"finish",hypothesis:"Fixture selects retained result",proposalId:null,entityId:null,parent:null,centerMm:null,candidateId:p.finishCandidateIds.at(-1)};
  if(n===3)expect(p.results[0].validation.ok).toBe(false);
  return {action:"propose",hypothesis:"Fixture translation",proposalId:`move-${n}`,entityId:"PACK-1",parent:p.parent,centerMm:{x:20500,z:n===2?-1000:4000},candidateId:null};
 });
 try {
  const c=await (await f.post(path,input())).json(); const waiting=await f.wait(c.runId);
  const approval=waiting.interpreted; approval.objective="Corrected user objective";
  expect((await f.post(`${path}/${c.runId}/approve`,{approval,extra:true})).status).toBe(400);
  expect(f.calls()).toBe(1);
  expect((await f.post(`${path}/${c.runId}/approve`,{approval})).status).toBe(202);
  expect((await f.post(`${path}/${c.runId}/approve`,{approval})).status).toBe(409);
  const done=await f.wait(c.runId);expect(done.state).toBe("COMPLETED");expect(done.approved.objective).toBe(approval.objective);
  expect(done.deadlineAt).toBe(c.deadlineAt);expect(done.modelRequestsUsed).toBe(4);
  const report=await (await fetch(`${f.base}${path}/${c.runId}/report`)).json();
  const candidate=report.proposals[1];expect(candidate.evaluation.comparison.candidateValid).toBe(true);
  expect(await runLayoutComparison({baselineScenario:report.input.scenario,executionConfig:report.input.executionConfig,proposal:candidate.proposal,attachments:report.attachments,approvedConstraints:report.approved.constraints,safetyCeilingMs:report.input.safetyCeilingMs})).toEqual(candidate.evaluation.comparison);
  const bytes=Buffer.byteLength(JSON.stringify({report}));
  // Also measure a full three-proposal envelope with the largest valid result repeated.
  const maxEnvelope=structuredClone(report);maxEnvelope.proposals=[candidate,candidate,candidate];
  const maxBytes=Buffer.byteLength(JSON.stringify({report:maxEnvelope})); expect(maxBytes).toBeLessThan(1024*1024);
  const keyless=createApp({config:loadConfig({})}).app;const verifier=createServer(keyless);const url=await listen(verifier);
  try {
   const verify=(r:any)=>fetch(url+path+"/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({report:r})}).then(r=>r.json());
   expect(await verify(report)).toEqual({ok:true,mismatches:[]});
   for(const alter of [(r:any)=>r.proposals[1].proposal.target.centerMm.x+=100,(r:any)=>r.proposals[1].evaluation.comparison.candidateMetrics.shipped++]) {const bad=structuredClone(report);alter(bad);expect((await verify(bad)).ok).toBe(false);}
  }finally{verifier.closeAllConnections();await new Promise<void>(r=>verifier.close(()=>r()));}
  expect(f.calls()).toBe(4);expect(f.guard.snapshot().entries).toHaveLength(1);expect(f.guard.snapshot().entries[0]!.state).toBe("committed");
  mkdirSync("evidence/sanitized/l2b",{recursive:true});writeFileSync("evidence/sanitized/l2b/http-replay.json",JSON.stringify({provider:"loopback-fake-meta",schema:report.schema,promptVersion:report.promptVersion,implementationVersion:report.implementationVersion,reportBytes:bytes,maxThreeProposalEnvelopeBytes:maxBytes,verifyLimitBytes:1024*1024,providerCalls:f.calls(),paidCalls:0,state:done.state},null,2));
 }finally{await f.close();}
},120000);
it("guard loss before approval dispatches nothing further",async()=>{
 const f=await fixture();try{const c=await(await f.post(path,input())).json();const w=await f.wait(c.runId);renameSync(f.file,f.file+".held");expect((await f.post(`${path}/${c.runId}/approve`,{approval:w.interpreted})).status).toBe(503);expect(f.calls()).toBe(1);expect((await f.status(c.runId)).state).toBe("AWAITING_APPROVAL");await f.post(`${path}/${c.runId}/cancel`,{});}finally{await f.close();}
},120000);

it("approval-wait deadline settles directly in ledger with no polling",async()=>{
 const short=await fixture(undefined,{RUN_TIMEOUT_MS:"15000"});try{
  const c=await(await short.post(path,input())).json();const w=await short.wait(c.runId);expect(w.state).toBe("AWAITING_APPROVAL");
  await new Promise(r=>setTimeout(r,Math.max(0,c.deadlineAt-Date.now())+80));
  expect(short.guard.snapshot().entries[0]!.state).toBe("committed");expect(short.calls()).toBe(1);
 }finally{await short.close();}
},120000);
it("pre-dispatch cancel releases and in-flight cancellation holds lock until unwind",async()=>{
 let release!:()=>void;let reached!:()=>void;const dispatched=new Promise<void>(r=>reached=r);const gate=new Promise<void>(r=>release=r);
 const file=join(mkdtempSync(join(tmpdir(),"layout-unwind-")),"budget.json");initializeBudgetLedger({filePath:file,capUsd:1});const guard=createBudgetGuard({filePath:file,capUsd:1});
 const config=loadConfig({MODEL_API_KEY:"fixture-only",META_API_BASE_URL:"http://127.0.0.1:1/v1"});
 const {app}=createApp({config,budgetGuard:guard,fetchImpl:async()=>{reached();await gate;throw Error("fixture aborted transport unwound");}});
 const server=createServer(app),base=await listen(server);const post=(p:string,b:unknown)=>fetch(base+p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});
 try{
  const early=await(await post(path,input())).json();await post(`${path}/${early.runId}/cancel`,{});await new Promise(r=>setTimeout(r,30));expect(guard.snapshot().entries[0]!.state).toBe("released");
  const c=await(await post(path,input())).json();await dispatched;await post(`${path}/${c.runId}/cancel`,{});
  expect((await post("/api/operations/proposals",{observation:"busy"})).status).toBe(429);expect(guard.snapshot().entries[1]!.state).toBe("reserved");
  release();await new Promise(r=>setTimeout(r,40));expect(guard.snapshot().entries[1]!.state).toBe("committed");
 }finally{release();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
},120000);
it("legacy, service and one-shot owners block layout and layout blocks legacy approval",async()=>{
 const legacy=JSON.parse(readFileSync("fixtures/sample/warehouse-basic.json","utf8"));
 let gate:Promise<void>|null=null,open=()=>{};let calls=0,active=0,peak=0;
 const hold=()=>{gate=new Promise<void>(r=>open=r);};const release=()=>{open();gate=null;};
 const response=(content:unknown)=>new Response(JSON.stringify({id:"fake-meta-cross-route",model:"fixture",choices:[{message:{content:JSON.stringify(content)},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
 const {app}=createApp({config:loadConfig({MODEL_API_KEY:"fixture-only",META_API_BASE_URL:"http://127.0.0.1:1/v1"}),fetchImpl:async(_url,init)=>{
  calls++;active++;peak=Math.max(peak,active);try{if(gate)await gate;const body=JSON.parse(init!.body as string);const name=body.response_format.json_schema.name;
   if(name==="planning_requirements")return response({objective:"minimize_weighted_picking_travel",maxRelocatedProducts:4,lockedProductIds:[],assumptions:[],unresolvedQuestions:[]});
   if(name==="layout_interpretation")return response({objective:"Reduce waiting",constraints:defaultApprovedConstraints(["PACK-1"]),allowedRegions:[{entityId:"PACK-1",minXMm:0,minZMm:0,maxXMm:scenario.geometry.room.widthMm,maxZMm:scenario.geometry.room.depthMm}]});
   if(name==="operations_investigation_action")return response({action:"finish",candidateId:"baseline",hypothesis:"Keep baseline",patch:null});
   return response({});
  }finally{active--;}
 }});
 const server=createServer(app),base=await listen(server);const post=(p:string,b:unknown)=>fetch(base+p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});
 const until=async(check:()=>Promise<boolean>)=>{const deadline=Date.now()+30000;while(!await check()){if(Date.now()>deadline)throw Error("cross-route wait");await new Promise(r=>setTimeout(r,10));}};
 try{
  hold();const legacyStart=await(await post("/api/runs",{scenario:legacy,requestText:"reduce travel",mode:"live",consent:true})).json();
  await until(async()=>active===1);const before=calls;expect((await post(path,input())).status).toBe(429);expect(calls).toBe(before);release();
  let legacyWaiting:any;await until(async()=>{legacyWaiting=await(await fetch(`${base}/api/runs/${legacyStart.runId}`)).json();return legacyWaiting.state==="AWAITING_APPROVAL";});
  const layout=await(await post(path,input())).json();let w:any;await until(async()=>{w=await(await fetch(`${base}${path}/${layout.runId}`)).json();return w.state==="AWAITING_APPROVAL";});
  expect((await post(`/api/runs/${legacyStart.runId}/approve`,{requirements:legacyWaiting.requirementsDraft})).status).toBe(429);
  await post(`${path}/${layout.runId}/cancel`,{});await new Promise(r=>setTimeout(r,20));
  hold();const legacyApproval=post(`/api/runs/${legacyStart.runId}/approve`,{requirements:legacyWaiting.requirementsDraft});
  await until(async()=>active===1);const prior=calls;expect((await post(path,input())).status).toBe(429);expect(calls).toBe(prior);release();await legacyApproval;
  for(const [route,body] of [["/api/operations/proposals",{observation:"reduce waiting"}],["/api/operations/investigations",input()]] as const){
   hold();const running=post(route,body);await until(async()=>active===1);const before=calls;expect((await post(path,input())).status).toBe(429);expect(calls).toBe(before);release();await running;await until(async()=>active===0);
  }
  expect(peak).toBe(1);
 }finally{release();await post(`/api/runs/unused/cancel`,{});server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
},120000);
