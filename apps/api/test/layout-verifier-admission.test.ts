import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
vi.mock("@layoutlab/simulation", async importOriginal => {
 const actual = await importOriginal<typeof import("@layoutlab/simulation")>();
 const runtime = actual.selectLayoutInvestigationRuntime("0.1.1");
 const selected = { ...runtime, runLayoutComparison: vi.fn(runtime.runLayoutComparison), validateLayoutCandidate: vi.fn(runtime.validateLayoutCandidate) };
 return { ...actual, selectLayoutInvestigationRuntime: vi.fn(() => selected) };
});
import * as simulation from "@layoutlab/simulation";
import { verifyLayoutInvestigationExport, type LayoutInvestigationReport } from "../src/layout-investigations.js";
const saved: LayoutInvestigationReport = JSON.parse(readFileSync("evidence/sanitized/l2a/fixture-report.json", "utf8"));
it("rejects hard caps, illegal limits, envelope counts and duplicate links before replay", async () => {
 const changes = [
  (r: LayoutInvestigationReport) => { r.requests = Array.from({length:5},()=>structuredClone(r.requests[0]!));r.modelRequestsUsed=5;r.budget.dispatched=5; },
  (r: LayoutInvestigationReport) => { r.proposals=Array.from({length:4},()=>structuredClone(r.proposals[0]!));r.proposalsUsed=4; },
  (r: LayoutInvestigationReport) => { r.input.scenario.geometry.room.widthMm++; },
  (r: LayoutInvestigationReport) => { r.approved!.constraints.maxTranslationMm++; },
  (r: LayoutInvestigationReport) => { r.limits.requests=5; },
  (r: LayoutInvestigationReport) => { r.limits.proposals=4; },
  (r: LayoutInvestigationReport) => { r.limits.tokens=2001; },
  (r: LayoutInvestigationReport) => { r.limits.timeoutMs=120001; },
  (r: LayoutInvestigationReport) => { r.modelRequestsUsed--; },
  (r: LayoutInvestigationReport) => { r.proposals[1]!.requestIndex=r.proposals[0]!.requestIndex; },
  (r: LayoutInvestigationReport) => { r.requests[0]!.index=2; },
  (r: LayoutInvestigationReport) => { (r.requests[0] as any).extra=true; },
 ];
 for(const change of changes) {
  vi.mocked(simulation.selectLayoutInvestigationRuntime("0.1.1").runLayoutComparison).mockClear();vi.mocked(simulation.selectLayoutInvestigationRuntime("0.1.1").validateLayoutCandidate).mockClear();
  const r=structuredClone(saved);change(r);expect((await verifyLayoutInvestigationExport(r)).ok).toBe(false);
  expect(simulation.selectLayoutInvestigationRuntime("0.1.1").runLayoutComparison).not.toHaveBeenCalled();expect(simulation.selectLayoutInvestigationRuntime("0.1.1").validateLayoutCandidate).not.toHaveBeenCalled();
 }
});
it("retains exact clean production-engine replay",async()=>{
 vi.mocked(simulation.selectLayoutInvestigationRuntime("0.1.1").runLayoutComparison).mockClear();
 vi.mocked(simulation.selectLayoutInvestigationRuntime("0.1.1").validateLayoutCandidate).mockClear();
 expect(await verifyLayoutInvestigationExport(saved)).toEqual({ok:true,mismatches:[]});
 const gater=JSON.parse(readFileSync("evidence/sanitized/l2-public/export.json","utf8"));
 expect(await verifyLayoutInvestigationExport(gater)).toEqual({ok:true,mismatches:[]});
 expect(simulation.selectLayoutInvestigationRuntime("0.1.1").runLayoutComparison).toHaveBeenCalled();
 expect(simulation.selectLayoutInvestigationRuntime("0.1.1").validateLayoutCandidate).toHaveBeenCalled();
},120000);
