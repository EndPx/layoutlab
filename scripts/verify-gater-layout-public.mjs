// Paid live test: requires owner Basic Auth access and explicit provider-call authorization.
import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const base='https://layoutlab.endpx.cloud',root='/api/operations/layout-investigations',out=resolve(process.argv[2] ?? ('evidence/sanitized/gater-layout-public-run-'+Date.now()));mkdirSync(out,{recursive:true});
const access=JSON.parse(readFileSync('.coordination/layoutlab-public-access.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},httpCredentials:{username:access.username,password:access.password},recordVideo:{dir:resolve(out,'video')}});const page=await context.newPage();const errors=[],posts=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname)});
try{
 await page.goto(base+'/live-access');await page.goto(base);await expect(page.getByTestId('ops-canvas')).toHaveAttribute('data-human-asset-status','loaded-cyclic-gait',{timeout:45000});
 await page.getByTestId('assistant-action').selectOption('layout');
 await page.getByTestId('layout-question').fill('Would moving PACK-1 one metre in negative Z improve this warehouse? Compare its current centre with a centre at the same X and 1000 mm smaller Z. Only PACK-1 may move; receiving, workers, workload, inventory, service times and seed must stay fixed. Test this single change, then finish by selecting baseline or the measured candidate.');
 await page.getByTestId('layout-live').check();await page.getByTestId('layout-consent').check();await expect(page.getByTestId('layout-start')).toBeEnabled();
 const created=page.waitForResponse(r=>new URL(r.url()).pathname===root&&r.request().method()==='POST'&&r.status()!==401);await page.getByTestId('layout-start').click();const response=await created;assert.equal(response.status(),202);const initial=await response.json();const id=initial.runId;assert.ok(id);let current=initial,last=-1,approved=false;
 const until=Date.now()+390000;
 while(Date.now()<until){current=await(await context.request.get(base+root+'/'+id)).json();if(current.modelRequestsUsed!==last){console.log(JSON.stringify({id,state:current.state,requests:current.modelRequestsUsed,proposals:current.proposalsUsed}));last=current.modelRequestsUsed;}
  if(current.state==='AWAITING_APPROVAL'&&!approved){
   await expect(page.getByTestId('layout-approve')).toBeVisible({timeout:10000});
   const obstacle=current.input.scenario.geometry.obstacles.find(o=>o.id==='OB-PACK1');assert.ok(obstacle);const x=(obstacle.minXMm+obstacle.maxXMm)/2,z=(obstacle.minZMm+obstacle.maxZMm)/2;
   await page.getByRole('checkbox',{name:'Allow PACK-1',exact:true}).check();await page.getByRole('checkbox',{name:'Allow PACK-2',exact:true}).uncheck();
   await page.getByTestId('layout-max-moves').fill('1');await page.getByTestId('layout-max-translation').fill('1000');
   for(const [key,value] of Object.entries({minXMm:x,maxXMm:x,minZMm:z-1000,maxZMm:z})){await page.getByRole('spinbutton',{name:'PACK-1 '+key,exact:true}).fill(String(value));}
   await page.screenshot({path:resolve(out,'approval.png'),fullPage:true});
   const approval=page.waitForResponse(r=>new URL(r.url()).pathname===root+'/'+id+'/approve'&&r.request().method()==='POST');await page.getByTestId('layout-approve').click();assert.equal((await approval).status(),202);approved=true;
  }else if(current.state!=='RUNNING'&&current.state!=='AWAITING_APPROVAL')break;
  await page.waitForTimeout(1500);
 }
 const report=await(await context.request.get(base+root+'/'+id+'/report')).json();writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));
 const verification=await(await context.request.post(base+root+'/verify',{data:{report},timeout:120000})).json();assert.equal(verification.ok,true);
 await page.waitForTimeout(1800);await page.screenshot({path:resolve(out,'result.png'),fullPage:true});
 let previewed=false;const valid=report.proposals?.find(p=>p.evaluation?.comparison?.candidateValid);
 if(report.state==='COMPLETED'&&valid){await page.getByTestId('layout-result-select').selectOption(valid.candidateId);await page.getByTestId('layout-preview').click();await expect(page.getByTestId('layout-preview-notice')).toBeVisible({timeout:120000});await page.screenshot({path:resolve(out,'verified-preview.png'),fullPage:true});previewed=true;await page.getByTestId('layout-preview-clear').click();}
 const result={checkedAt:new Date().toISOString(),base,runId:id,state:report.state,approved,requests:report.modelRequestsUsed,proposals:report.proposalsUsed,recommendation:report.recommendation,engineCandidates:report.proposals?.filter(p=>p.evaluation?.comparison).length??0,validCandidates:report.proposals?.filter(p=>p.evaluation?.comparison?.candidateValid).length??0,verification,previewed,pageErrors:errors,posts,error:report.error};writeFileSync(resolve(out,'review.json'),JSON.stringify(result,null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
}finally{await context.close();await browser.close();}
