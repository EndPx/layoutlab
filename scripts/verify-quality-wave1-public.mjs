// Paid explicit live test; inspect modelFinish/state separately from UI/report-verification success.
import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const base='https://layoutlab.endpx.cloud',out=resolve(process.argv[2] ?? ('evidence/sanitized/quality-wave1-public-run-'+Date.now()));mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:resolve(out,'video')}});
const page=await context.newPage(),posts=[],pageErrors=[];let runId=null,authorizationHeaders=0;
page.on('request',r=>{if(r.headers()['authorization'])authorizationHeaders++;});
page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname)});
try{
 const probes=[];for(const path of ['/api/runs','/api/operations/proposals','/api/operations/investigations','/api/operations/layout-investigations']){const response=await context.request.post(base+path,{data:{}});assert.equal(response.status(),400);assert.equal(response.headers()['www-authenticate'],undefined);probes.push({path,status:response.status(),authenticationChallenge:false});}
 const redirect=await context.request.get(base+'/live-access',{maxRedirects:0});assert.equal(redirect.status(),302);assert.equal(redirect.headers()['www-authenticate'],undefined);
 const status=await(await context.request.get(base+'/api/status')).json();const budget=await(await context.request.get(base+'/api/budget')).json();
 assert.equal(status.providerKind,'gater');assert.equal(status.modelId,'glm-5-3-flash');assert.equal(status.budgetMode,'unlimited');assert.equal(budget.guard,'unlimited');assert.equal(status.budgets.timeoutMs,360000);
 await page.goto(base);await expect(page.getByTestId('ops-canvas')).toHaveAttribute('data-human-asset-status','loaded-cyclic-gait',{timeout:45000});
 await expect(page.locator('a[href^="/live-access"]')).toHaveCount(0);
 await expect(page.getByTestId('ws-example-questions')).toBeVisible();
 await page.getByRole('button',{name:'Would faster dispatch reduce waiting?',exact:true}).click();assert.equal(posts.length,0);
 await page.getByTestId('ws-run').click();await page.waitForTimeout(700);await page.getByTestId('ws-pause').click();const frozen=await page.getByTestId('ws-clock').textContent();
 await page.getByTestId('ws-manual-details').locator('summary').first().click();const ed=page.getByTestId('layout-editor'),button=n=>ed.getByRole('button',{name:n,exact:true});
 await button('Run baseline').click();await expect(page.getByTestId('layout-baseline')).toBeVisible({timeout:120000});await button('Edit layout').click();await page.getByTestId('ops-preset-top').click();await page.waitForTimeout(1500);
 const z=ed.getByRole('spinbutton',{name:'Z centre (mm)'}),label=page.getByTestId('ops-canvas').getByText(/PACK-1/).first();const box=await label.boundingBox();assert.ok(box);const oldZ=await z.inputValue();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-20);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-45,{steps:8});await page.mouse.up();await expect(z).not.toHaveValue(oldZ);const draggedZ=await z.inputValue();await button('Undo last edit').click();await expect(z).toHaveValue(oldZ);await z.fill(draggedZ);await z.press('Tab');await button('Validate layout').click();await expect(page.getByTestId('layout-validation')).toContainText('Validated PACK-1',{timeout:120000});await button('Test layout').click();await expect(page.getByTestId('layout-comparison')).toBeVisible({timeout:120000});await button('Apply tested layout').click();await page.getByTestId('layout-return-original').click();await expect(page.getByTestId('ws-clock')).toHaveText(frozen);await page.getByTestId('ws-reset').click();await page.getByTestId('ws-manual-details').locator('summary').first().click();assert.equal(posts.length,0);await page.screenshot({path:resolve(out,'editor-accepted.png'),fullPage:true});
 await page.getByText('Allowed changes and advanced ranges',{exact:true}).click();
 await expect(page.getByTestId('ws-allowance')).toContainText('No total allowance limit');
 await page.getByTestId('ws-question').fill('Test one dispatch-duration assumption of 30 seconds per order with the same workers and workload. After measuring that candidate, finish by selecting an existing candidate ID. Keep every other parameter unchanged. Give a concise hypothesis.');
 for(const field of ['packingDurationMs','receivingDurationMs'])await page.getByTestId('ws-allow-'+field).uncheck();
 await page.getByTestId('ws-allow-dispatchDurationMs').check();await page.getByTestId('ws-min-dispatchDurationMs').fill('30000');await page.getByTestId('ws-max-dispatchDurationMs').fill('30000');
 await page.getByTestId('ws-live-toggle').check();await page.getByTestId('ws-consent').check();await expect(page.getByTestId('ws-start')).toBeEnabled();
 await page.screenshot({path:resolve(out,'ready.png'),fullPage:true});
 const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/operations/investigations'&&r.request().method()==='POST'&&r.status()!==401);await page.getByTestId('ws-start').click();const response=await created;assert.equal(response.status(),202);const first=await response.json();runId=first.runId??first.investigationId;assert.ok(runId);
 const until=Date.now()+390000;let last=first,lastCount=-1;
 while(Date.now()<until){const res=await context.request.get(base+'/api/operations/investigations/'+encodeURIComponent(runId));assert.equal(res.status(),200);last=await res.json();const count=last.requestCount??last.modelRequestsUsed??0;if(count!==lastCount){console.log(JSON.stringify({runId,state:last.state,requests:count}));lastCount=count;await page.screenshot({path:resolve(out,'progress-'+count+'.png'),fullPage:true});}if(last.state!=='RUNNING')break;await page.waitForTimeout(1500);}
 const reportResponse=await context.request.get(base+'/api/operations/investigations/'+encodeURIComponent(runId)+'/report');assert.equal(reportResponse.status(),200);const report=await reportResponse.json();
 const serialized=JSON.stringify(report,null,2);writeFileSync(resolve(out,'report.json'),serialized);
 const verificationResponse=await context.request.post(base+'/api/operations/investigations/verify',{data:{report},timeout:120000});const verification=await verificationResponse.json();assert.equal(verification.ok,true);
 await page.waitForTimeout(1800);await page.screenshot({path:resolve(out,'result-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'result-mobile.png'),fullPage:true});
 assert.equal(authorizationHeaders,0);const result={anonymous:true,authorizationHeaders,probes,legacyLiveAccessRedirect:redirect.status(),checkedAt:new Date().toISOString(),base,status,budget,runId,state:report.state,requestCount:report.requestCount,experimentCount:report.experimentCount,recommendation:report.recommendation,requests:report.requests,verification,pageErrors,posts,realProviderRequests:report.requestCount,modelFinish:report.recommendation?.source==='model',engineCandidateCount:report.experimentCount,uiRunCompleted:last.state!=='RUNNING'};
 writeFileSync(resolve(out,'review.json'),JSON.stringify(result,null,2));await expect(page.getByTestId('ws-recommendation')).toBeVisible();assert.deepEqual(pageErrors,[]);console.log(JSON.stringify({state:result.state,requests:result.requestCount,experiments:result.experimentCount,modelFinish:result.modelFinish,verified:true,pageErrors:0}));
}finally{await context.close();await browser.close();}
