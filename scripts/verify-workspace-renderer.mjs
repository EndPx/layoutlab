// Reproducible, keyless local renderer and recorded-report check. Build core, API and web first.
// Uses installed Microsoft Edge; no user environment file or model transport is used.
import {createApp} from '../apps/api/dist/server.js';
import {loadConfig} from '../apps/api/dist/config.js';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
const output = resolve(process.argv[2] ?? '.coordination/workspace-renderer-check');
mkdirSync(output, {recursive:true});
import assert from 'node:assert/strict';
let transportCalls=0;
const config=loadConfig({MODEL_API_KEY:'',BUDGET_STATE_FILE:''});
const {app}=createApp({config,webDir:resolve('apps/web/dist'),fetchImpl:async()=>{transportCalls++;throw Error('Transport prohibited')}});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;
const b=await chromium.launch({channel:'msedge',headless:false});
const p=await b.newPage({viewport:{width:1440,height:1000}});const errors=[],posts=[],frames=[];
p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('request',r=>{if(r.method()==='POST')posts.push(r.url())});
try{
assert.equal((await p.request.get(base+'/api/status')).status(),200);assert.equal((await p.request.get(base+'/api/budget')).status(),200);
await p.goto(base);await p.waitForFunction(()=>document.querySelector('[data-testid=ops-asset-status]')?.textContent.includes('sourced assets loaded'));
const cv=p.getByTestId('ops-canvas');const canvas=await cv.locator('canvas').elementHandle();
await canvas.evaluate(e=>{window.__p2Context=e.getContext('webgl2')});
await p.getByTestId('ws-select-assistant').selectOption('unit:PK-1');
for(let i=0;i<65;i++){await p.getByTestId('ws-step').click();const f=await cv.evaluate(e=>({...e.dataset}));if(Number(f.solidCargo)>0){frames.push(f);break}}
assert.ok(frames.length);await p.getByTestId('ops-preset-inspect').click();await p.screenshot({path:resolve(output,'loaded.png')});
await p.getByTestId('ws-speed-4').click();await p.getByTestId('ws-run').click();for(let i=0;i<3;i++){await p.waitForTimeout(200);frames.push(await cv.evaluate(e=>({...e.dataset})));assert.ok(await canvas.evaluate(e=>e.isConnected))}await p.getByTestId('ws-pause').click();
// Independent expected size from canonical SKU dimensions and the declared 90-degree cargo yaw.
const fixture=JSON.parse(readFileSync('fixtures/operations/picking-packing-burst.json','utf8'));
const dims=fixture.products.find(product=>product.id==='P01').itemDimensionsMm;
let reference=null;
for (const frame of frames) {
  const unit=JSON.parse(frame.unitTransforms).find(unit=>unit.id==='PK-1');
  const items=JSON.parse(frame.cargoMatrices).filter(item=>item.unitId==='PK-1'&&item.productId==='P01');
  assert.equal(items.length,2);
  const offsets=items.map(item=>{
    for (const [axis,expected] of [dims.depth,dims.height,dims.width].entries()) {
      assert.ok(Math.abs((item.max[axis]-item.min[axis])*1000-expected)<0.1,'Declared cargo dimension mismatch');
    }
    return [item.matrix[12]-unit.xMm/1000,item.matrix[13],item.matrix[14]-unit.zMm/1000];
  });
  if(reference) offsets.forEach((row,i)=>row.forEach((value,k)=>assert.ok(Math.abs(value-reference[i][k])<0.00001,'Cargo detached from cart')));
  else reference=offsets;
}
await p.getByTestId('ws-clear-selection').click();await p.getByTestId('ws-recorded-load').click();await p.getByTestId('ws-verify').click();await p.getByTestId('ws-verify-result').waitFor({timeout:120000});
assert.ok(await canvas.evaluate(e=>e.isConnected&&e.getContext('webgl2')===window.__p2Context));
const candidate=p.locator('[data-testid^="ws-view-"]:not([data-testid="ws-view-baseline"])').first();
if(await candidate.count()){await candidate.click();await p.screenshot({path:resolve(output,'candidate.png')})}
await p.screenshot({path:resolve(output,'recorded.png')});assert.equal(transportCalls,0);assert.equal(posts.length,1);assert.ok(posts[0].includes('verify'));assert.deepEqual(errors,[]);
writeFileSync(resolve(output,'smoke.json'),JSON.stringify({base,emptyKey:!config.apiKeyPresent,ledger:config.budgetStateFile,transportCalls,errors,posts,frames},null,2));
console.log(JSON.stringify({ok:true,output,frames:frames.length,transportCalls,posts:posts.length,errors:errors.length,cargoDimensionsAndAttachment:true}));
}finally{await b.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
