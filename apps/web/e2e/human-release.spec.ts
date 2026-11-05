import { test, expect } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
test('heading cargo walking and archived no-key verification',async({page},info)=>{
 test.setTimeout(180000);const dir=resolve('../../evidence/sanitized/human-main-viewer/release');mkdirSync(dir,{recursive:true});
 const pageErrors:string[]=[],consoleErrors:string[]=[],requests:string[]=[];const assetLoads:Record<string,number>={};
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',e=>{if(e.type()==='error')consoleErrors.push(e.text())});page.on('request',r=>{if(r.url().includes('/assets/humans/'))assetLoads[r.url().split('/').at(-1)!]=(assetLoads[r.url().split('/').at(-1)!]??0)+1;if(r.method()==='POST')requests.push(r.url());});
 await page.goto('/');const c=page.getByTestId('ops-canvas');await expect(c).toHaveAttribute('data-human-asset-status','loaded-cyclic-gait',{timeout:30000});const initial=await c.getAttribute('data-human-bones');
 await page.getByTestId('ws-select-assistant').selectOption({index:1});await page.getByTestId('ops-preset-inspect').click();await page.getByTestId('ops-zoom-out').click();await page.getByTestId('ops-zoom-out').click();
 await page.getByTestId('ws-speed-16').click();await page.getByTestId('ws-run').click();
 await expect.poll(async()=>JSON.parse(await c.getAttribute('data-cargo-matrices') ?? '[]').length,{timeout:45000}).toBeGreaterThan(0);
 await page.getByTestId('ws-pause').click();const timing=JSON.parse(await c.getAttribute('data-human-update-timing') ?? '{}');const bones=await c.getAttribute('data-human-bones'),cargo=await c.getAttribute('data-cargo-matrices'),transforms=await c.getAttribute('data-unit-transforms');await page.waitForTimeout(500);expect(await c.getAttribute('data-human-bones')).toBe(bones);expect(await c.getAttribute('data-cargo-matrices')).toBe(cargo);
 await page.getByTestId('ops-preset-inspect').click();await page.getByTestId('ops-zoom-out').click();await page.getByTestId('ops-zoom-out').click();
 await page.screenshot({path:resolve(dir,info.project.name+'-loaded-heading.png'),fullPage:true});
 await page.getByTestId('ws-reset').click();expect(await c.getAttribute('data-human-bones')).toBe(initial);
 if (await page.getByTestId('ws-back-assistant').count()) await page.getByTestId('ws-back-assistant').click();await page.getByTestId('ws-recorded-load').click();await expect(page.getByTestId('ws-results-provenance')).toContainText('Recorded');
 await page.getByTestId('ws-verify').click();await expect(page.getByTestId('ws-verify-result')).toContainText('Verified',{timeout:45000});

 await page.getByTestId('ws-view-exp-1').click();
 await expect(page.getByTestId('ws-result-tech')).toContainText('Replay implementation: 0.1.0');
 const archivedDetails=await page.getByTestId('ws-result-tech').textContent();
 await page.getByTestId('ws-return-current').click();
 expect(pageErrors).toEqual([]);expect(consoleErrors).toEqual([]);expect(requests.every(u=>u.endsWith('/verify'))).toBe(true);
 writeFileSync(resolve(dir,info.project.name+'-browser.json'),JSON.stringify({archivedDetails,timing,assetLoads,pageErrors,consoleErrors,requests,transforms:JSON.parse(transforms!),cargo:JSON.parse(cargo!),details:await page.getByTestId('ws-result-tech').textContent()},null,2));
});
