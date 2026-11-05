import {chromium, expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const base='https://layoutlab.endpx.cloud',commit='c09947b';
const out=resolve('evidence/sanitized/human-public');mkdirSync(out,{recursive:true});
const before=await(await fetch(base+'/api/budget')).json();
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const name=viewport.width===390?'mobile':'desktop';
  const context=await browser.newContext({viewport,recordVideo:{dir:resolve(out,name+'-video'),size:viewport}});
  const page=await context.newPage(),errors=[],posts=[],loads={};
  await page.route('**/api/**',route=>{
   const r=route.request();if(r.method()==='POST'&&!new URL(r.url()).pathname.endsWith('/verify'))return route.abort();
   return route.continue();
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());if(r.url().includes('/assets/humans/')){const k=r.url().split('/').at(-1);loads[k]=(loads[k]??0)+1}});
  await page.goto(base,{waitUntil:'networkidle'});
  const canvas=page.getByTestId('ops-canvas');await expect(canvas).toHaveAttribute('data-human-asset-status','loaded-cyclic-gait',{timeout:45000});
  const initial=await canvas.getAttribute('data-human-bones');assert.equal(JSON.parse(initial).length,6);
  await page.screenshot({path:resolve(out,name+'-initial.png'),fullPage:true});
  await page.getByTestId('ws-select-assistant').selectOption('unit:PK-1');
  await page.getByTestId('ws-speed-16').click();await page.getByTestId('ws-run').click();
  await expect.poll(()=>canvas.getAttribute('data-human-bones'),{timeout:20000}).not.toBe(initial);
  await expect.poll(async()=>JSON.parse(await canvas.getAttribute('data-cargo-matrices')??'[]').length,{timeout:60000}).toBeGreaterThan(0);
  await page.getByTestId('ws-pause').click();
  const bones=await canvas.getAttribute('data-human-bones'),cargo=await canvas.getAttribute('data-cargo-matrices');
  const transforms=JSON.parse(await canvas.getAttribute('data-unit-transforms'));
  await page.waitForTimeout(600);assert.equal(await canvas.getAttribute('data-human-bones'),bones);assert.equal(await canvas.getAttribute('data-cargo-matrices'),cargo);
  const cargoRows=JSON.parse(cargo);assert.ok(cargoRows.length>0);assert.ok(cargoRows.every(r=>r.matrix.every(Number.isFinite)));
  await page.getByTestId('ops-preset-inspect').click();await page.getByTestId('ops-zoom-out').click();await page.getByTestId('ops-zoom-out').click();
  await page.screenshot({path:resolve(out,name+'-loaded.png'),fullPage:true});
  await page.getByTestId('ws-reset').click();await expect(canvas).toHaveAttribute('data-human-bones',initial);
  let manual=null;
  if(name==='desktop'){
   const editor=page.getByTestId('layout-editor'),button=n=>editor.getByRole('button',{name:n,exact:true});
   const originalUnits=await page.getByTestId('ws-viewport-panel').getAttribute('data-current-layout-units');
   const unit=JSON.parse(originalUnits)[0];
   await button('Run baseline').click();await expect(page.getByTestId('layout-baseline')).toBeVisible({timeout:120000});
   await button('Edit layout').click();await editor.getByRole('combobox',{name:'Initial unit parking',exact:true}).selectOption(unit.id);
   const z=editor.getByRole('spinbutton',{name:'Z centre (mm)'});await z.fill(String(unit.parkingMm.z+1000));await z.press('Tab');
   await button('Validate layout').click();await expect(page.getByTestId('layout-validation')).toContainText('Validated '+unit.id,{timeout:120000});
   await button('Test layout').click();await expect(page.getByTestId('layout-comparison')).toBeVisible({timeout:120000});
   await button('Recompute layout export').click();await expect(editor).toContainText('Verified exact geometry',{timeout:120000});
   await button('Apply tested layout').click();
   await expect.poll(async()=>JSON.parse(await canvas.getAttribute('data-unit-transforms')??'[]').find(u=>u.id===unit.id)?.zMm).toBe(unit.parkingMm.z+1000);
   await expect(canvas).toHaveAttribute('data-human-asset-status','loaded-cyclic-gait');
   await page.screenshot({path:resolve(out,'desktop-applied.png'),fullPage:true});
   await page.getByTestId('layout-return-original').click();await expect(page.getByTestId('ws-viewport-panel')).toHaveAttribute('data-current-layout-units',originalUnits);
   manual={unitId:unit.id,fromZ:unit.parkingMm.z,toZ:unit.parkingMm.z+1000,verified:true,applied:true,restored:true};
  }
  if(await page.getByTestId('ws-back-assistant').count())await page.getByTestId('ws-back-assistant').click();
  await page.getByTestId('ws-recorded-load').click();await expect(page.getByTestId('ws-results-provenance')).toContainText('Recorded');
  await page.getByTestId('ws-verify').click();await expect(page.getByTestId('ws-verify-result')).toContainText('Verified',{timeout:120000});
  await page.getByTestId('ws-view-exp-1').click();await expect(page.getByTestId('ws-result-tech')).toContainText('Replay implementation: 0.1.0');
  const replay=await page.getByTestId('ws-result-tech').textContent();await page.screenshot({path:resolve(out,name+'-recorded.png'),fullPage:true});
  await page.getByTestId('ws-return-current').click();await expect(canvas).toHaveAttribute('data-human-asset-status','loaded-cyclic-gait');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);assert.equal(posts.length,1);assert.ok(posts[0].endsWith('/verify'));
  const result={name,viewport,workers:6,actualBoneMovement:true,pauseFrozen:true,resetRestored:true,loads,errors,posts,transforms,cargo:cargoRows,manual,replay};results.push(result);
  writeFileSync(resolve(out,name+'.json'),JSON.stringify(result,null,2));await context.close();console.log(JSON.stringify({name,ok:true,manual:!!manual,posts:posts.length,errors:errors.length}));
 }
 const assets={};for(const name of ['main-pose-v1.json','main-gait-v1.json','worker-articulated-workwear-v2.gltf','worker-articulated-workwear-v2.bin']){
  const response=await fetch(base+'/assets/humans/'+name);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
  const sha=createHash('sha256').update(bytes).digest('hex');assert.equal(sha,createHash('sha256').update(readFileSync('apps/web/public/assets/humans/'+name)).digest('hex'));assets[name]={bytes:bytes.length,sha256:sha};
 }
 const after=await(await fetch(base+'/api/budget')).json();assert.deepEqual(after,before);
 writeFileSync(resolve(out,'smoke.json'),JSON.stringify({commit,base,checkedAt:new Date().toISOString(),pass:true,modelGenerationPosts:0,budgetUnchanged:true,budget:after,assets,results:results.map(({name,workers,errors,posts,manual})=>({name,workers,errors,posts,manual}))},null,2));
 console.log(JSON.stringify({pass:true,commit,assetsHashMatched:true,budgetUnchanged:true,output:out}));
} finally {await browser.close();}
