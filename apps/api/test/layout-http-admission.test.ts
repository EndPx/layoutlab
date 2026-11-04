import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { it, expect } from "vitest";
import { defaultApprovedConstraints } from "@layoutlab/simulation";
import { createApp } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { createBudgetGuard, initializeBudgetLedger } from "../src/budget-guard.js";
const path = "/api/operations/layout-investigations";
const scenario = JSON.parse(readFileSync("fixtures/operations/picking-packing-burst.json", "utf8"));
const input = () => ({ scenario, executionConfig: { pickDurationMsPerItem: 2000, unloadDurationMsPerItem: 1500 }, question: "Reduce packing waiting", safetyCeilingMs: 600000, mode: "live", consent: true });
async function listen(server: Server) { server.listen(0, "127.0.0.1"); await once(server, "listening"); return `http://127.0.0.1:${(server.address() as { port: number }).port}`; }
async function fixture() {
 let calls = 0, active = 0, peak = 0;
 const provider = createServer(async (req, res) => {
  for await (const _ of req) { /* drain */ }
  calls++; active++; peak = Math.max(peak, active);
  const result = { objective: "Reduce waiting", constraints: defaultApprovedConstraints(["PACK-1"]), allowedRegions: [{ entityId: "PACK-1", minXMm: 0, minZMm: 0, maxXMm: scenario.geometry.room.widthMm, maxZMm: scenario.geometry.room.depthMm }] };
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ id: "loopback-fake-meta", model: "fixture", choices: [{ message: { content: JSON.stringify(result) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })); active--;
 });
 const providerUrl = await listen(provider);
 const file = join(mkdtempSync(join(tmpdir(), "layout-http-")), "budget.json");
 initializeBudgetLedger({ filePath: file, capUsd: .25 });
 const guard = createBudgetGuard({ filePath: file, capUsd: .25 });
 const config = loadConfig({ MODEL_API_KEY: "fixture-only", META_API_BASE_URL: `${providerUrl}/v1` });
 const { app } = createApp({ config, budgetGuard: guard });
 const server = createServer(app), base = await listen(server);
 const post = (route: string, body: unknown) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
 const status = (id: string) => fetch(base + path + "/" + id).then(r => r.json());
 const wait = async (id: string) => { const until = Date.now() + 110000; while (Date.now() < until) { const r = await status(id); if (r.state !== "RUNNING") return r; await new Promise(r => setTimeout(r, 20)); } throw Error("fixture deadline"); };
 return { post, status, wait, guard, calls: () => calls, peak: () => peak, close: async () => { server.closeAllConnections(); provider.closeAllConnections(); await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => provider.close(() => r()))]); } };
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
  expect((await f.post(path,input())).status).toBe(429); expect(f.calls()).toBe(1); expect(f.peak()).toBe(1);
  await f.post(`${path}/${created.runId}/cancel`,{});
 } finally { await f.close(); }
},120000);
