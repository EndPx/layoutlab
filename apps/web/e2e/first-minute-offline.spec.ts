import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {startExperimentsFixture,expFinish,expRunExp} from './helpers/experiments-fixture';
test('first minute offline fixture: explicit start, results, back and manual entry',async({page},info)=>{
 test.setTimeout(180000);
 const fixture=await startExperimentsFixture({delayMs:2000,decide:(f,n)=>n===1?expRunExp({dispatchDurationMs:30000}):expFinish(f.results.find(r=>r.candidateId!=='baseline')?.candidateId??'baseline')});
 const dir=resolve(import.meta.dirname,'../../../evidence/sanitized/first-minute');mkdirSync(dir,{recursive:true});
 const posts:string[]=[],phases:string[]=[];
 page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 try {
 await page.goto('/');await expect(page.getByTestId('ops-canvas')).toBeVisible({timeout:30000});
 await expect(page.getByTestId('ws-start')).toBeVisible();
 await page.getByTestId('ws-example-questions').getByRole('button').first().click();
 await expect(page.getByTestId('ws-question')).toHaveValue('Would faster dispatch reduce waiting?');expect(posts).toEqual([]);
 await page.getByText('Allowed changes and advanced ranges',{exact:true}).click();
 await page.getByTestId('ws-allow-dispatchDurationMs').check();
 await page.getByText('Allowed changes and advanced ranges',{exact:true}).click();
 await page.getByTestId('ws-live-toggle').check();await page.getByTestId('ws-consent').check();
 await expect(page.getByTestId('ws-start')).toBeEnabled({timeout:15000});
 await page.screenshot({path:resolve(dir,info.project.name+'-draft.png'),fullPage:true});
 expect(posts).toEqual([]);await page.getByTestId('ws-start').click();
 await expect(page.getByTestId('ws-run-status')).toContainText('AI reviewing / planning',{timeout:30000});phases.push((await page.getByTestId('ws-run-status').textContent())!);
 await page.screenshot({path:resolve(dir,info.project.name+'-fixture-progress.png'),fullPage:true});
 await expect(page.getByTestId('ws-recommendation')).toBeVisible({timeout:90000});
 await expect(page.getByTestId('ws-results-provenance')).toContainText('Fixture');
 await expect(page.getByTestId('ws-recommendation')).toContainText('Shipped: 6 before -> after 6');
 await expect(page.getByTestId('ws-recommendation')).not.toContainText(' ? ');
 await expect(page.getByTestId('ws-recommendation')).toContainText('Time to finish: 8min 22sec before -> after 6min 37sec');
 if(info.project.name==='desktop'){const side=await page.getByTestId('ws-side').boundingBox();expect(side!.height).toBeLessThanOrEqual(681);const result=await page.getByTestId('ws-results').boundingBox();expect(result!.y+await page.evaluate(()=>scrollY)).toBeLessThan(1200);}
 await page.screenshot({path:resolve(dir,info.project.name+'-fixture-results.png'),fullPage:true});
 await page.getByTestId('ws-select-assistant').selectOption({index:1});await expect(page.getByTestId('ws-inspector')).toBeVisible();await page.getByTestId('ws-back-assistant').click();await expect(page.getByTestId('ws-question')).toBeVisible();
 await page.getByTestId('ws-manual-details').locator(':scope > summary').click();
 await expect(page.getByTestId('layout-editor').getByRole('button',{name:'Run baseline',exact:true})).toBeEnabled();
 await page.getByTestId('ws-saved-details').locator('summary').click();await page.getByTestId('ws-recorded-load').click();await expect(page.getByTestId('ws-results-provenance')).toContainText('Recorded');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(posts.filter(u=>u.endsWith('/investigations'))).toHaveLength(1);
 writeFileSync(resolve(dir,info.project.name+'-checks.json'),JSON.stringify({channel:info.project.use.channel,viewport:info.project.use.viewport,phases,posts,transportRequests:fixture.transportRequests(),fixtureOnly:true,realInference:false,publicDeployment:false,draftOnlyNoPost:true,inspectorBack:true,manualEntry:true,recordedReplay:true,noOverflow:true},null,2));
 } finally {await fixture.stop();}
});
