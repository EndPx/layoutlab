import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {loadConfig} from '../src/config.js';
import {LayoutInvestigationStore} from '../src/layout-investigations.js';
const env={MODEL_API_BASE_URL:'https://api.gater.ai.id/v1',MODEL_ID:'glm-5-3-flash',MODEL_API_KEY:'fake'};
it('scopes timeout default and exact clamp boundaries',()=>{
 expect(loadConfig(env).timeoutMs).toBe(360000);
 for(const n of ['120000','360000','360001'])expect(loadConfig({...env,RUN_TIMEOUT_MS:n}).timeoutMs).toBe(Math.min(Number(n),360000));
 for(const override of [{MODEL_ID:'unknown'},{MODEL_API_BASE_URL:'https://api.meta.ai/v1'},{MODEL_API_BASE_URL:'http://localhost:3456/v1'}]) expect(loadConfig({...env,...override,RUN_TIMEOUT_MS:'360000'}).timeoutMs).toBe(120000);
});
it('uses one original deadline and aborts on timer/cancellation without waiting',async()=>{
 vi.useFakeTimers();try{
 const store=new LayoutInvestigationStore(loadConfig(env));
 const input={scenario:JSON.parse(readFileSync('fixtures/operations/picking-packing-burst.json','utf8')),executionConfig:{pickDurationMsPerItem:2000,unloadDurationMsPerItem:1500},question:'Move PACK-1',safetyCeilingMs:600000,mode:'live',consent:true};
 const r=await store.create(input,null);expect(r.report.deadlineAt-r.report.createdAt).toBe(360000);
 vi.advanceTimersByTime(359999);expect(r.report.state).toBe('RUNNING');
 vi.advanceTimersByTime(1);expect(r.report.state).toBe('TIMED_OUT');expect(r.controller.signal.aborted).toBe(true);expect(r.report.modelRequestsUsed).toBe(0);
 const c=await store.create(input,null);store.cancel(c.report.runId);expect(c.report.state).toBe('CANCELLED');expect(c.controller.signal.aborted).toBe(true);vi.advanceTimersByTime(360000);expect(c.report.state).toBe('CANCELLED');
 }finally{vi.useRealTimers();}
});
