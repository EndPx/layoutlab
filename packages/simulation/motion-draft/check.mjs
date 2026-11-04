import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ramp,trajectory,admission,radius,defaults} from '../../../.coordination/r2-motion/build/motion.js';
import {createTransportNav,parseOperationsScenario,travelTimeMs} from '../dist/index.js';
assert.equal(ramp(250).duration,1000); // 125mm acceleration +125mm braking, peak .5mm/ms
assert.equal(ramp(4000).duration,5000); // 500+3000+500mm; 1000+3000+1000ms
const p=[{x:3000,z:3000},{x:3000,z:7000},{x:7000,z:7000}];
const t=trajectory(p,0,Math.PI/2); assert.deepEqual(t.evaluate(t.duration).position,p[2]);assert.equal(t.distance,8000);assert.equal(t.evaluate(500).distance,125);assert.equal(t.evaluate(500).phase,125/1201);
const room={widthMm:20000,depthMm:20000};
assert.equal(admission(p,100,room,[]).accepted,true);
assert.equal(admission(p,100,room,[{id:'corner',minX:2950,maxX:3050,minZ:6950,maxZ:7050}]).accepted,false);
assert.equal(admission(p,100,room,[],[{id:'stopped',p:p[1],r:100}]).accepted,false);
assert.equal(admission([p[1]],100,room,[{id:'turn',minX:3050,maxX:3100,minZ:7000,maxZ:7100}]).accepted,false);
const s=parseOperationsScenario(JSON.parse(fs.readFileSync('fixtures/operations/main-warehouse.json','utf8')));const nav=createTransportNav(s);

const targets=[...s.locations.map(l=>({id:l.id,kind:'storage-approach',p:l.approachPointMm})),...s.resources.flatMap(r=>[...r.servicePositions.map(p=>({id:p.id,resourceId:r.id,kind:'service',p})),...r.queueSlots.map(p=>({id:p.id,resourceId:r.id,kind:'queue',p}))]),...[...nav.unitProfiles].map(([id,u])=>({id,kind:'parking',p:u.parkingSlotMm}))];
const obstacles=[...nav.rackRects.map((r,i)=>({...r,id:s.geometry.racks[i].id})),...nav.obstacleRects.map((r,i)=>({...r,id:s.geometry.obstacles[i].id}))];
const results={radii:Object.fromEntries(['push350','push500','side'].map(k=>[k,radius(k)])),timing:{shortOld:travelTimeMs(250,1000),shortNew:ramp(250).duration,longOld:travelTimeMs(4000,1000),longNew:ramp(4000).duration},destinations:targets,poses:[],routes:[]};
for(const profile of Object.keys(results.radii)){const r=results.radii[profile];for(const target of targets)results.poses.push({profile,id:target.id,kind:target.kind,resourceId:target.resourceId,...admission([target.p],r,nav.roomMm,obstacles)});for(const [id,u] of nav.unitProfiles){const stopped=[...nav.unitProfiles].filter(([other])=>other!==id).map(([other,v])=>({id:other,p:v.parkingSlotMm,r}));for(const target of targets){const route=nav.findStaticRoute(u.parkingSlotMm,target.p,id);results.routes.push({profile,unit:id,target:target.id,kind:target.kind,resourceId:target.resourceId,engineStatus:route.status,...(route.status==='ok'?{static:admission(route.points,r,nav.roomMm,obstacles),withOtherParked:admission(route.points,r,nav.roomMm,obstacles,stopped)}:{})});}}}
fs.writeFileSync('evidence/sanitized/r2-motion/admission.json',JSON.stringify(results,null,2));
const cases=[];function test(name,fn){fn();cases.push(name);}
test('asymmetric acceleration 900mm = 1650ms',()=>assert.equal(ramp(900,{...defaults,d:.002}).duration,1650));
test('zero ramp stationary',()=>assert.equal(ramp(0).duration,0));
for(const bad of [NaN,Infinity,-Infinity,-1]){
 test('ramp rejects '+String(bad),()=>assert.throws(()=>ramp(bad)));
 test('route rejects '+String(bad),()=>assert.throws(()=>admission([{x:bad,z:5000}],100,room,[])));
 test('room rejects '+String(bad),()=>assert.throws(()=>admission(p,100,{...room,widthMm:bad},[])));
 test('stopped radius rejects '+String(bad),()=>assert.throws(()=>admission(p,100,room,[],[{id:'bad',p:p[0],r:bad}])));
 for(const key of Object.keys(defaults))test('limits '+key+' rejects '+String(bad),()=>assert.throws(()=>trajectory(p,0,0,{...defaults,[key]:bad})));
}
for(const key of Object.keys(defaults))test('limits '+key+' rejects zero',()=>assert.throws(()=>ramp(100,{...defaults,[key]:0})));
test('empty route rejected',()=>assert.throws(()=>admission([],100,room,[])));
test('zero radius rejected',()=>assert.throws(()=>admission(p,0,room,[])));
for(const rect of [{minX:1,maxX:1,minZ:1,maxZ:2},{minX:2,maxX:1,minZ:1,maxZ:2},{minX:NaN,maxX:2,minZ:1,maxZ:2},{minX:1,maxX:2,minZ:1,maxZ:Infinity}])test('invalid rectangle '+JSON.stringify(rect),()=>assert.throws(()=>admission(p,100,room,[{id:'bad',...rect}])));
test('duplicate stationary points valid',()=>assert.deepEqual(trajectory([p[0],p[0]],0,0).evaluate(0).position,p[0]));
test('all external mutation cannot change evaluation',()=>{const pts=structuredClone(p),l={...defaults},t=trajectory(pts,0,0,l),before=t.evaluate(500);l.a=.01;pts[0].z=0;pts.push({x:1,z:1});const exposed=t.phases;exposed[0].p.z=0;exposed[0].r.peak=100;const pose=t.evaluate(500);pose.position.z=0;assert.deepEqual(t.evaluate(500),before);});
// The original baseline above contains exactly ten assert calls.
const report={baselineAssertionCount:10,namedRegressionCount:cases.length,namedRegressionCases:cases,totalAssertions:10+cases.length,poseChecks:results.poses.length,routeChecks:results.routes.length,poseRejections:results.poses.filter(x=>!x.accepted).length};
fs.writeFileSync('evidence/sanitized/r2-motion/checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
