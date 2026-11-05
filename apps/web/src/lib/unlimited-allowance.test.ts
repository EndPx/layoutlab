import {expect,it} from "vitest";
import {parseBudgetStatus} from "./experiments";
const unlimited={mode:"unlimited",guard:"unlimited",capUsd:null,reservedUsd:null,committedUsd:null,availableUsd:null,perRunReservationUsd:null,accounting:"Provider billing applies"};
it("decodes honest null unlimited and finite historical capped",()=>{expect(parseBudgetStatus(unlimited).guard).toBe("unlimited");expect(parseBudgetStatus({guard:"active",capUsd:1,reservedUsd:0,committedUsd:1,availableUsd:0,perRunReservationUsd:.25}).guard).toBe("active");});
it.each([{...unlimited,mode:"capped"},{...unlimited,availableUsd:Infinity},{guard:"active"},{guard:"unknown"},{guard:"not_configured",publicBudgetUsd:NaN},{...unlimited,publicBudgetUsd:100}])("rejects malformed status %j",v=>expect(()=>parseBudgetStatus(v)).toThrow());

import {parseApiStatus} from "./api";
const status={liveAvailable:true,reason:null,status:"ready",baseUrl:"http://127.0.0.1/v1",modelId:"fixture",promptVersion:"1",apiVersion:"1",coreVersion:"1",operationsImplementationVersion:"1",budgets:{maxRequests:4,maxProposals:3,timeoutMs:120000},concurrency:1,provider:"meta",providerKind:"fixture"};
it("accepts historical status and coherent allowance pairs",()=>{expect(parseApiStatus(status).budgetMode).toBeUndefined();for(const pair of [{budgetMode:"unlimited",budgetGuard:"unlimited"},{budgetMode:"capped",budgetGuard:"active"}])expect(parseApiStatus({...status,...pair})).toMatchObject(pair);});
it.each([{budgetMode:"typo",budgetGuard:"active"},{budgetMode:"unlimited",budgetGuard:"active"},{budgetMode:"capped",budgetGuard:"unlimited"},{budgetMode:"unlimited"},{budgetGuard:"active"}])("rejects inconsistent allowance pair %j",pair=>expect(()=>parseApiStatus({...status,...pair})).toThrow());
