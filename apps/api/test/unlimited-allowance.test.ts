import { readFileSync, mkdtempSync, renameSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { it, expect, vi } from "vitest";
import { defaultApprovedConstraints, runLayoutComparison } from "@layoutlab/simulation";
import { createApp } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { createBudgetGuard, initializeBudgetLedger } from "../src/budget-guard.js";
// Fixture JSON is asserted field-by-field below; keep the DOM unknown boundary local.
const fetch = globalThis.fetch as (...args: Parameters<typeof globalThis.fetch>) => Promise<Omit<Response, "json"> & { json(): Promise<any> }>;
const path = "/api/operations/layout-investigations";
// Provider v3 derives editable IDs from the region entries.
const providerConstraints = () => { const { allowedEntityIds, ...constraints } = defaultApprovedConstraints(["PACK-1"]); return constraints; };
const scenario = JSON.parse(readFileSync("fixtures/operations/picking-packing-burst.json", "utf8"));
const input = () => ({ scenario, executionConfig: { pickDurationMsPerItem: 2000, unloadDurationMsPerItem: 1500 }, question: "Reduce packing waiting", safetyCeilingMs: 600000, mode: "live", consent: true });
async function listen(server: Server) { server.listen(0, "127.0.0.1"); await once(server, "listening"); return `http://127.0.0.1:${(server.address() as { port: number }).port}`; }
async function fixture(handler?: (payload: any, n: number) => unknown, extra: Record<string,string> = {}) {
 let calls = 0, active = 0, peak = 0;
 const provider = createServer(async (req, res) => {
  let raw = ""; for await (const part of req) raw += part;
  let payload: any; try { payload = JSON.parse(JSON.parse(raw).messages[1].content); } catch { payload = {}; }
  calls++; active++; peak = Math.max(peak, active);
  const result = { objective: "Reduce waiting", constraints: defaultApprovedConstraints(["PACK-1"]), allowedRegions: [{ entityId: "PACK-1", minXMm: 0, minZMm: 0, maxXMm: scenario.geometry.room.widthMm, maxZMm: scenario.geometry.room.depthMm }] };
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ id: "loopback-fake-meta", model: "fixture", choices: [{ message: { content: JSON.stringify(handler ? handler(payload,calls) : result) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })); active--;
 });
 const providerUrl = await listen(provider);
 const file = join(mkdtempSync(join(tmpdir(), "layout-http-")), "budget.json");
 initializeBudgetLedger({ filePath: file, capUsd: .25 });
 const guard = createBudgetGuard({ filePath: file, capUsd: .25 });
 if (extra.PUBLIC_BUDGET_MODE === "unlimited" || extra.PUBLIC_BUDGET_MODE === "typo") { guard.reserve("historical", .25); guard.commit("historical"); }
 const before = readFileSync(file);
 const spies = ["reserve", "assertReservation", "commit", "release", "snapshot"].map(k => vi.spyOn(guard, k as "reserve"));
 const config = loadConfig({ MODEL_API_KEY: "fixture-only", META_API_BASE_URL: `${providerUrl}/v1`, ...extra });
 const { app } = createApp({ config, budgetGuard: guard });
 const server = createServer(app), base = await listen(server);
 const post = (route: string, body: unknown) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
 const status = (id: string) => fetch(base + path + "/" + id).then(r => r.json());
 const wait = async (id: string) => { const until = Date.now() + 110000; while (Date.now() < until) { const r = await status(id); if (r.state !== "RUNNING") return r; await new Promise(r => setTimeout(r, 20)); } throw Error("fixture deadline"); };
 return { post, status, wait, guard, file, base, before, spies, calls: () => calls, peak: () => peak, close: async () => { server.closeAllConnections(); provider.closeAllConnections(); await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => provider.close(() => r()))]); } };
}

it("explicit unlimited preserves exhausted ledger and bypasses injected guard through HTTP approval and cancellation", async()=>{
 const f=await fixture((p,n)=>n===1?{objective:"Reduce waiting",constraints:providerConstraints(),allowedRegions:[{entityId:"PACK-1",minXMm:0,minZMm:0,maxXMm:scenario.geometry.room.widthMm,maxZMm:scenario.geometry.room.depthMm}]}:{action:"finish",hypothesis:"Retain baseline",proposalId:null,entityId:null,parent:null,centerMm:null,candidateId:p.finishCandidateIds[0]}, {PUBLIC_BUDGET_MODE:"unlimited"});
 try {
  expect(await (await fetch(f.base+"/api/budget")).json()).toMatchObject({mode:"unlimited",guard:"unlimited",availableUsd:null});
  const c=await(await f.post(path,input())).json(); const waiting=await f.wait(c.runId);expect(waiting.state).toBe("AWAITING_APPROVAL");
  expect((await f.post(path,input())).status).toBe(429);
  expect((await f.post(`${path}/${c.runId}/approve`,{approval:waiting.interpreted})).status).toBe(202);
  const done=await f.wait(c.runId);expect(done.state).toBe("COMPLETED");expect(f.calls()).toBeLessThanOrEqual(4);
  const second=await(await f.post(path,input())).json();await f.post(`${path}/${second.runId}/cancel`,{});
  expect(readFileSync(f.file)).toEqual(f.before);for(const spy of f.spies)expect(spy).not.toHaveBeenCalled();
 }finally{await f.close();}
},120000);
it("unknown mode remains capped and exhausted",async()=>{const f=await fixture(undefined,{PUBLIC_BUDGET_MODE:"typo"});try{expect((await f.post(path,input())).status).toBe(402);expect(f.calls()).toBe(0);expect(readFileSync(f.file)).toEqual(f.before);}finally{await f.close();}});
it.each([{MODEL_API_KEY:""},{MODEL_API_BASE_URL:"https://unsupported.invalid/v1"}])("unlimited never enables missing key or unsupported provider %j",async extra=>{const f=await fixture(undefined,{PUBLIC_BUDGET_MODE:"unlimited",...extra});try{expect((await f.post(path,input())).status).toBe(503);expect(f.calls()).toBe(0);}finally{await f.close();}});

it("service HTTP lifecycle records usage without claiming an unlimited monetary charge",async()=>{
 const f=await fixture((p,n)=>({action:n===1?"run_experiment":"finish",hypothesis:n===1?"Faster dispatch":null,extraPickers:null,extraPutaway:null,packingDurationMs:null,dispatchDurationMs:n===1?1000:null,receivingDurationMs:null,candidateId:n===1?null:"exp-1"}),{PUBLIC_BUDGET_MODE:"unlimited"});
 try{
 const route="/api/operations/investigations";const body={...input(),scenario:{...scenario,orderSchedule:scenario.orderSchedule.slice(0,6)},interventionPolicy:{allowedFields:["dispatchDurationMs"]}};delete (body as any).safetyCeilingMs;
 const response=await f.post(route,body);expect(response.status).toBe(202);const c=await response.json();let done:any;
 for(let i=0;i<500;i++){done=await(await fetch(f.base+route+"/"+(c.investigationId ?? c.runId))).json();if(done.state!=="RUNNING")break;await new Promise(r=>setTimeout(r,20));}
 expect(done.state).toBe("COMPLETED");const report=await(await fetch(f.base+route+"/"+(c.investigationId ?? c.runId)+"/report")).json();expect(report.budget.claimId).toBeNull();expect(report.budget.accounting).toContain("unused bound");expect(report.budget.accounting).toContain("no reservation or monetary charge");expect(report.requestCount).toBe(2);expect(readFileSync(f.file)).toEqual(f.before);for(const spy of f.spies)expect(spy).not.toHaveBeenCalled();
 }finally{await f.close();}
},120000);
it("mode defaults and upper bounds remain capped",()=>{for(const mode of [undefined,"","UNLIMITED","typo"]){const c=loadConfig({PUBLIC_BUDGET_MODE:mode,MAX_MODEL_REQUESTS_PER_RUN:"999",MAX_PROPOSALS_PER_RUN:"999",RUN_TIMEOUT_MS:"999999"});expect(c.publicBudgetMode).toBe("capped");expect([c.maxRequests,c.maxProposals,c.timeoutMs]).toEqual([4,3,120000]);}});
