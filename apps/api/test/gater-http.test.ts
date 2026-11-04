import { readFileSync, mkdtempSync } from "node:fs";
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
 let calls = 0;
 const fetchImpl: import("../src/provider.js").FetchLike = async (_url, options) => {
  calls++;
  const payload=JSON.parse(JSON.parse(options!.body as string).messages[1].content);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(handler!(payload,calls))},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
 };
 const file = join(mkdtempSync(join(tmpdir(), "layout-http-")), "budget.json");
 initializeBudgetLedger({ filePath: file, capUsd: .25 });
 const guard = createBudgetGuard({ filePath: file, capUsd: .25 });
 const config = loadConfig({ MODEL_API_KEY: "fixture-only", MODEL_API_BASE_URL: "https://api.gater.ai.id/v1", MODEL_ID: "glm-5-3-flash", ...extra });
 const { app } = createApp({ config, budgetGuard: guard, fetchImpl });
 const server = createServer(app), base = await listen(server);
 const post = (route: string, body: unknown) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
 const status = (id: string) => fetch(base + path + "/" + id).then(r => r.json());
 const wait = async (id: string) => { const until = Date.now() + 110000; while (Date.now() < until) { const r = await status(id); if (r.state !== "RUNNING") return r; await new Promise(r => setTimeout(r, 20)); } throw Error("fixture deadline"); };
 return { post, status, wait, guard, file, base, calls: () => calls, close: async () => { server.closeAllConnections();  await Promise.all([new Promise<void>(r => server.close(() => r()))]); } };
}
it("corrected approval, invalid feedback, valid move, finish and keyless replay", async () => {
 const f = await fixture((p,n) => {
  if(n===1)return {objective:"Reduce waiting",constraints:defaultApprovedConstraints(["PACK-1"]),allowedRegions:[{entityId:"PACK-1",minXMm:0,minZMm:0,maxXMm:scenario.geometry.room.widthMm,maxZMm:scenario.geometry.room.depthMm}]};
  if(n===4)return {action:"finish",hypothesis:"Fixture selects retained result",proposalId:null,entityId:null,parent:null,centerMm:null,candidateId:p.finishCandidateIds.at(-1)};
  if(n===3)expect(p.results[0].validation.ok).toBe(false);
  return {action:"propose",hypothesis:"Fixture translation",proposalId:`move-${n}`,entityId:"PACK-1",parent:p.parent,centerMm:{x:20500,z:n===2?-1000:4000},candidateId:null};
 });
 try {
  const status=await (await fetch(f.base+"/api/status")).json();
  expect(status.provider).toBe("gater");expect(status.providerKind).toBe("gater");expect(status.modelId).toBe("glm-5-3-flash");expect(JSON.stringify(status)).not.toContain("fixture-only");expect(f.calls()).toBe(0);
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
   for(const alter of [(r:any)=>r.provider.kind="unknown",(r:any)=>r.modelRequestsUsed--]) {const bad=structuredClone(report);alter(bad);expect((await verify(bad)).ok).toBe(false);}
  }finally{verifier.closeAllConnections();await new Promise<void>(r=>verifier.close(()=>r()));}
  expect(f.calls()).toBe(4);expect(f.guard.snapshot().entries).toHaveLength(1);expect(f.guard.snapshot().entries[0]!.state).toBe("committed");

 }finally{await f.close();}
},120000);

it("keyless HTTP gates refuse before transport or budget claims", async () => {
 const f = await fixture(undefined, { MODEL_API_KEY: "" });
 try {
  const before = readFileSync(f.file, "utf8");
  // Inspect entrypoint without importing it (which would load real env and listen).
  expect(readFileSync("apps/api/src/index.ts", "utf8")).toContain('configurationStatus: liveAvailable(config).ok ? "configured-not-tested" : "setup-required"');
  const status = await (await fetch(f.base + "/api/status")).json();
  expect(status).toMatchObject({ liveAvailable: false, provider: "gater", providerKind: "gater", modelId: "glm-5-3-flash" });
  const layout = await f.post(path, input());
  expect(layout.status).toBe(503); expect(await layout.json()).toMatchObject({ status: "setup_required" });
  const legacy = await f.post("/api/runs", { scenario: JSON.parse(readFileSync("fixtures/sample/warehouse-basic.json", "utf8")), requestText: "Reduce travel", mode: "live", consent: true });
  expect(legacy.status).toBe(503); expect(await legacy.json()).toMatchObject({ status: "setup_required", provider: "gater" });
  expect(f.calls()).toBe(0); expect(f.guard.snapshot()).toMatchObject({ reservedMicroUsd: 0, committedMicroUsd: 0, entries: [] });
  expect(readFileSync(f.file, "utf8")).toBe(before);
 } finally { await f.close(); }
});
it("exhausted HTTP budget refuses valid layout before transport without ledger mutation", async () => {
 const f = await fixture();
 try {
  f.guard.reserve("fixture-exhaustion", .25); f.guard.commit("fixture-exhaustion");
  const bytes = readFileSync(f.file, "utf8"), snapshot = f.guard.snapshot();
  const response = await f.post(path, input());
  expect(response.status).toBe(402); expect(await response.json()).toMatchObject({ code: "BUDGET_EXCEEDED" });
  expect(f.calls()).toBe(0); expect(f.guard.snapshot()).toEqual(snapshot); expect(readFileSync(f.file, "utf8")).toBe(bytes);
 } finally { await f.close(); }
});
