import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
async function setup(page:Page){
 await page.route('**/api/status',r=>r.fulfill({json:{liveAvailable:false}}));await page.route('**/api/budget',r=>r.fulfill({json:{guard:'active',availableUsd:0,perRunReservationUsd:0.25}}));
 await page.goto('/');await page.getByTestId('assistant-action').selectOption('layout');await page.getByTestId('layout-recorded').click();await expect(page.getByTestId('layout-source')).toContainText('Recorded FIXTURE');
 const report=JSON.parse(readFileSync('public/evidence/layout-investigation-fixture.json','utf8'));await page.getByTestId('layout-result-select').selectOption(report.proposals[1].candidateId);return report;
}
async function resolverGate(page:Page){
 await page.addInitScript(()=>{(window as any).__resolverDone=0;(window as any).__resolverStarted=0;(window as any).__delayResolver=false;});
 await page.route('**/src/lib/layout-results.ts*',async route=>{
  const response=await route.fetch();let body=await response.text();
  expect(body).toContain('export async function resolveMeasuredLayout(');
  body=body.replace('export async function resolveMeasuredLayout(','async function resolveMeasuredLayoutProduction(');
  body+='\nexport async function resolveMeasuredLayout(...args) { globalThis.__resolverStarted++; if(globalThis.__delayResolver) {globalThis.__resolverPending=true;await new Promise(resolve=>globalThis.__releaseResolver=resolve);} try {return await resolveMeasuredLayoutProduction(...args);} finally {globalThis.__resolverDone++;} }\n';
  await route.fulfill({response,body});
 });
}
for(const phase of ['HTTP','local resolver'] as const)test(`MOCK delay only: explicit discard revokes pending ${phase} preview`,async({page})=>{
 test.setTimeout(180000);await resolverGate(page);
 let calls=0,release:(()=>void)|undefined;
 await page.route('**/api/operations/layout-investigations/verify',async r=>{calls++;if(phase==='HTTP'&&calls===2)await new Promise<void>(resolve=>release=resolve);await r.fulfill({json:{ok:true,mismatches:[]}}).catch(()=>{});});
 await setup(page);const panel=page.getByTestId('ws-viewport-panel');const original=await panel.getAttribute('data-current-layout-centres');const clock=await page.getByTestId('ws-clock').textContent();
 await page.getByTestId('layout-preview').click();await expect(page.getByTestId('layout-preview-notice')).toBeVisible({timeout:90000});
 if(phase==='local resolver')await page.evaluate(()=>{(window as any).__delayResolver=true;});
 await page.getByTestId('layout-preview').click();
 if(phase==='HTTP')await expect.poll(()=>!!release).toBe(true);else await expect.poll(()=>page.evaluate(()=>(window as any).__resolverPending)).toBe(true);
 await page.getByTestId('layout-preview-clear').click();await expect(page.getByTestId('layout-result-apply')).toBeDisabled();await expect(page.getByTestId('layout-verification')).toHaveCount(0);await expect(page.getByTestId('layout-preview')).toBeEnabled();
 if(phase==='HTTP'){release!();await page.waitForTimeout(300);expect(await page.evaluate(()=>(window as any).__resolverStarted)).toBe(1);}else{await page.evaluate(()=>(window as any).__releaseResolver());await expect.poll(()=>page.evaluate(()=>(window as any).__resolverDone),{timeout:90000}).toBe(2);}
 await expect(page.getByTestId('layout-preview-notice')).toHaveCount(0);await expect(page.getByTestId('layout-result-apply')).toBeDisabled();expect(await panel.getAttribute('data-layout-centres')).toBe(original);expect(await panel.getAttribute('data-current-layout-centres')).toBe(original);await expect(page.getByTestId('ws-clock')).toHaveText(clock!);expect(calls).toBe(2);
});
test('MOCK HTTP delay only: manual editing revokes pending assistant preview without scene overwrite',async({page})=>{
 test.setTimeout(180000);await resolverGate(page);let release:(()=>void)|undefined;await page.route('**/api/operations/layout-investigations/verify',async r=>{await new Promise<void>(resolve=>release=resolve);await r.fulfill({json:{ok:true,mismatches:[]}}).catch(()=>{});});
 await setup(page);const panel=page.getByTestId('ws-viewport-panel');const original=await panel.getAttribute('data-current-layout-centres');const clock=await page.getByTestId('ws-clock').textContent();await page.getByTestId('layout-preview').click();await expect.poll(()=>!!release).toBe(true);
 const editor=page.getByTestId('layout-editor');await editor.getByRole('button',{name:'Run baseline',exact:true}).click();await expect(page.getByTestId('layout-baseline')).toContainText('Baseline: 6 shipped',{timeout:90000});await editor.getByRole('button',{name:'Edit layout',exact:true}).click();const z=editor.getByRole('spinbutton',{name:'Z centre (mm)'});await z.fill('6000');await z.press('Tab');await expect.poll(async()=>JSON.parse((await panel.getAttribute('data-layout-centres'))!).find((s:any)=>s.id==='PACK-1').centerMm.z).toBe(6000);const manual=await panel.getAttribute('data-layout-centres');release!();await page.waitForTimeout(300);expect(await page.evaluate(()=>(window as any).__resolverStarted)).toBe(0);expect(await panel.getAttribute('data-layout-centres')).toBe(manual);expect(await panel.getAttribute('data-current-layout-centres')).toBe(original);await expect(page.getByTestId('ws-clock')).toHaveText(clock!);
 await editor.getByRole('button',{name:'Discard / Undo draft',exact:true}).click();await expect(page.getByTestId('layout-result-apply')).toBeDisabled();await expect(page.getByTestId('layout-preview-notice')).toHaveCount(0);await expect(page.getByTestId('layout-preview')).toBeEnabled();
});
test('import size is checked before file.text and imported Meta provenance is declared',async({page})=>{
 let reads=0;await page.exposeFunction('countImportRead',()=>reads++);await page.addInitScript(()=>{const original=File.prototype.text;File.prototype.text=function(){void (window as any).countImportRead();return original.call(this);};});
 await setup(page);await page.getByTestId('layout-import').setInputFiles({name:'huge.json',mimeType:'application/json',buffer:Buffer.alloc(1024*1024+1,32)});await expect(page.getByTestId('layout-results').getByRole('alert')).toContainText('file was not read');expect(reads).toBe(0);
 const report=JSON.parse(readFileSync('public/evidence/layout-investigation-fixture.json','utf8'));report.provider.kind='meta';await page.getByTestId('layout-import').setInputFiles({name:'declared-meta.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});await expect(page.getByTestId('layout-source')).toContainText('Declared Meta provenance');await expect(page.getByTestId('layout-source')).not.toContainText('Live Meta');expect(reads).toBe(1);
 await page.route('**/evidence/layout-investigation-fixture.json',r=>r.fulfill({json:report}));await page.getByTestId('layout-recorded').click();await expect(page.getByTestId('layout-source')).toContainText('recorded/imported; unauthenticated');await expect(page.getByTestId('layout-source')).not.toContainText('Live Meta');
});
