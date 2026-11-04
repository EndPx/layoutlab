import {createServer,type Server} from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultApprovedConstraints} from '@layoutlab/simulation';
import {createApp} from '../../../api/dist/server.js';
import {loadConfig} from '../../../api/dist/config.js';
import {createBudgetGuard,initializeBudgetLedger} from '../../../api/dist/budget-guard.js';
export async function startLayoutHttpFixture(gater=false){
 let calls=0,invalidFeedback=false;
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const p=JSON.parse(JSON.parse(raw).messages[1].content);const n=++calls;
  if(n===3)invalidFeedback=p.results[0].validation.ok===false;
  const answer=n===1?{objective:'LOCAL fixture objective',constraints:defaultApprovedConstraints(['PACK-1']),allowedRegions:[{entityId:'PACK-1',minXMm:0,minZMm:0,maxXMm:24000,maxZMm:18000}]}:n===4?{action:'finish',hypothesis:'LOCAL fixture retains measured result',proposalId:null,entityId:null,parent:null,centerMm:null,candidateId:p.finishCandidateIds.at(-1)}:{action:'propose',hypothesis:'LOCAL fixture translation',proposalId:`fixture-move-${n}`,entityId:'PACK-1',parent:p.parent,centerMm:{x:20500,z:n===2?-1000:4000},candidateId:null};
  res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'loopback-fake-meta',model:'layout-http-fixture',choices:[{message:{content:JSON.stringify(answer)},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
 });
 await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
 const file=join(mkdtempSync(join(tmpdir(),'layout-l2c2-')),'budget.json');initializeBudgetLedger({filePath:file,capUsd:0.25});const guard=createBudgetGuard({filePath:file,capUsd:0.25});
 const config=loadConfig({MODEL_API_KEY:'fixture-only-not-real',META_API_BASE_URL:`http://127.0.0.1:${(provider.address() as {port:number}).port}/v1`,META_MODEL_ID:'layout-http-fixture',BUDGET_STATE_FILE:file,PUBLIC_BUDGET_USD:'0.25',API_RATE_MAX:'1000'});
 const selectedConfig=gater?loadConfig({MODEL_API_KEY:'fixture-only-not-real',MODEL_API_BASE_URL:'https://api.gater.ai.id/v1',MODEL_ID:'glm-5-3-flash',API_RATE_MAX:'1000'}):config;
 const fetchImpl:typeof fetch=async(_url,options)=>fetch(`http://127.0.0.1:${(provider.address() as {port:number}).port}/v1/chat/completions`,options);
 const {app}=createApp({config:selectedConfig,budgetGuard:guard,...(gater?{fetchImpl}:{})});
 let api:Server;
 try{api=await new Promise<Server>((resolve,reject)=>{const s=app.listen(3001,'127.0.0.1',()=>resolve(s));s.on('error',reject);});}catch(e){provider.close();throw e;}
 return {calls:()=>calls,invalidFeedback:()=>invalidFeedback,ledger:()=>guard.snapshot(),stop:async()=>{api.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise<void>(r=>api.close(()=>r())),new Promise<void>(r=>provider.close(()=>r()))]);}};
}
