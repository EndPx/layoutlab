import {parseRunSummary} from "./api";
import {readFileSync} from "node:fs";
import {it,expect} from "vitest";
import {RunStore,toSummary} from "../../../api/src/runs.js";
import {loadConfig} from "../../../api/src/config.js";
import {replayFailureRecord} from "@layoutlab/core";
const secret="fake-gater-legacy-secret";
const config=()=>loadConfig({MODEL_API_KEY:secret,MODEL_API_BASE_URL:"https://api.gater.ai.id/v1",MODEL_ID:"glm-5-3-flash"});
const scenario=()=>JSON.parse(readFileSync("fixtures/sample/warehouse-basic.json","utf8"));
it("exports evaluated Gater runs and preapproval audits with honest counters",async()=>{
 const store=new RunStore(config());const r=store.createRun(scenario(),"reduce travel");
 expect(parseRunSummary(toSummary(r,config())).runId).toBe(r.id); const requirements={objective:"minimize_weighted_picking_travel",maxRelocatedProducts:4,lockedProductIds:[],assumptions:[],unresolvedQuestions:[]};
 store.startInterpretation(r,async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(requirements)},finish_reason:"stop"}]}))); for(let n=0;n<100 && r.state!=="AWAITING_APPROVAL";n++)await new Promise(resolve=>setTimeout(resolve,5));
 await store.approveRun(r.id,requirements,async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({scenarioRevision:r.scenario.revision,changes:[],rationale:"Keep baseline"})},finish_reason:"stop"}]})));
 expect(parseRunSummary(toSummary(r,config())).state).toBe(r.state); const report=store.buildReport(r.id);expect(report.provider).toBe("gater");expect(report.realMetaRequests).toBe(0);expect(report.modelRequestsUsed).toBeGreaterThan(0);expect(JSON.stringify(report)).not.toContain(secret);
 const failed=store.createRun(scenario(),"reduce travel");store.startInterpretation(failed,async()=>{throw new Error("offline failure");});
 for(let n=0;n<100 && failed.state!=="FAILED";n++)await new Promise(resolve=>setTimeout(resolve,5));
 const audit=store.buildFailureRecord(failed.id);expect(audit.modelRequestsUsed).toBe(1);expect(audit.realMetaRequests).toBe(0);expect(replayFailureRecord(audit).provider).toBe("gater");expect(JSON.stringify(audit)).not.toContain(secret);
});
