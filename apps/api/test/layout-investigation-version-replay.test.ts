import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { it, expect, vi } from "vitest";
vi.mock("../../../packages/simulation/dist/version.js", async importOriginal => ({ ...await importOriginal<object>(), SIMULATION_VERSION: "0.1.2" }));
vi.mock("@layoutlab/simulation", async importOriginal => {
 const actual = await importOriginal<typeof import("@layoutlab/simulation")>();
 const runtime = actual.selectLayoutInvestigationRuntime("0.1.1");
 const selected={ ...runtime, runLayoutComparison: vi.fn(runtime.runLayoutComparison), validateLayoutCandidate: vi.fn(runtime.validateLayoutCandidate) };
 return { ...actual, selectLayoutInvestigationRuntime: vi.fn(() => selected) };
});
import { SIMULATION_VERSION, selectLayoutInvestigationRuntime } from "@layoutlab/simulation";

import { verifyLayoutInvestigationExport, type LayoutInvestigationReport } from "../src/layout-investigations.js";
import { createApp } from "../src/server.js";
import { loadConfig } from "../src/config.js";
const saved: LayoutInvestigationReport = JSON.parse(readFileSync("evidence/sanitized/l2a/fixture-report.json","utf8"));
it("future current selects frozen functions and unchanged complete reports replay", async()=> {
 expect(SIMULATION_VERSION).toBe("0.1.2");
 const runtime=selectLayoutInvestigationRuntime("0.1.1");
 const archivePath="../../../packages/simulation/archive/0.1.1/runtime.mjs";
 const archive = await import(archivePath) as typeof runtime;
 expect(runtime.parseOperationsScenario).toBe(archive.parseOperationsScenario);
 expect(runtime.buildStationAttachmentMap).toBe(archive.buildStationAttachmentMap);
 expect(runtime.MAIN_WAREHOUSE_ATTACHMENTS).toBe(archive.MAIN_WAREHOUSE_ATTACHMENTS);
 expect(vi.mocked(runtime.runLayoutComparison).getMockImplementation()).toBe(archive.runLayoutComparison);
 expect(vi.mocked(runtime.validateLayoutCandidate).getMockImplementation()).toBe(archive.validateLayoutCandidate);
 for(const file of ["evidence/sanitized/l2a/fixture-report.json","evidence/sanitized/l2-public/export.json"]){
  const report=JSON.parse(readFileSync(file,"utf8"));
  expect(await verifyLayoutInvestigationExport(report)).toEqual({ok:true,mismatches:[]});
 }
 expect(runtime.runLayoutComparison).toHaveBeenCalled(); expect(runtime.validateLayoutCandidate).toHaveBeenCalled();
},120000);
it("early cancel has no baseline or model and remains verifiable",async()=>{
 const report=JSON.parse(readFileSync("evidence/sanitized/human-layout-api-replay/early-cancel.json","utf8"));
 expect(report.requests).toEqual([]);expect(report.baseline).toBeNull();
 expect(await verifyLayoutInvestigationExport(report)).toEqual({ok:true,mismatches:[]});
});
it("unknown outer and mixed nested versions reject without expensive replay",async()=>{
 const runtime=selectLayoutInvestigationRuntime("0.1.1");
 vi.mocked(runtime.runLayoutComparison).mockClear();vi.mocked(runtime.validateLayoutCandidate).mockClear();
 const mutations=[(r:LayoutInvestigationReport)=>{r.implementationVersion="0.1.2";},(r:LayoutInvestigationReport)=>{delete (r as Partial<LayoutInvestigationReport>).implementationVersion;},(r:LayoutInvestigationReport)=>{r.baseline!.versions.simulation="0.1.0";},(r:LayoutInvestigationReport)=>{r.baseline!.schema="unknown" as never;},(r:LayoutInvestigationReport)=>{r.baseline!.versions.operationsEngine="unknown";},(r:LayoutInvestigationReport)=>{r.proposals.find(p=>p.evaluation.comparison)!.evaluation.comparison!.versions.simulation="0.1.0";}];
 for(const change of mutations){const report=structuredClone(saved);change(report);expect((await verifyLayoutInvestigationExport(report)).ok).toBe(false);}
 expect(runtime.runLayoutComparison).not.toHaveBeenCalled();expect(runtime.validateLayoutCandidate).not.toHaveBeenCalled();
});
it("keyless HTTP verifies unchanged report with zero transport calls",async()=>{
 const transport=vi.fn(async()=>{throw Error("unexpected transport");});
 const {app}=createApp({config:loadConfig({}),fetchImpl:transport});const server=createServer(app);server.listen(0,"127.0.0.1");await once(server,"listening");
 try{const port=(server.address() as {port:number}).port;const response=await fetch(`http://127.0.0.1:${port}/api/operations/layout-investigations/verify`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({report:saved})});expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,mismatches:[]});expect(transport).not.toHaveBeenCalled();}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},120000);
