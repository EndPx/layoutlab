import assert from 'node:assert/strict';import fs from 'node:fs';
import {bodies,footprint,turnBounds,orientedAdmission as admit} from '../../../.coordination/r2-motion/build/oriented.js';
import {admission,radius} from '../../../.coordination/r2-motion/build/motion.js';
import {parseOperationsScenario,createTransportNav} from '../dist/index.js';
const names=[];function test(n,f){f();names.push(n);}const b=bodies.push350,room={widthMm:20000,depthMm:20000},p={x:5000,z:5000};
test('cardinal zero asymmetric rear',()=>assert.deepEqual(footprint(p,0,b),[{x:4525.5,z:3482},{x:5474.5,z:3482},{x:5474.5,z:5710},{x:4525.5,z:5710}]));
for(const h of [0,Math.PI/2,Math.PI,3*Math.PI/2])test('cardinal containment '+h,()=>{const f=footprint(p,h,b);const expected=[[4525.5,5474.5,3482,5710],[3482,5710,4525.5,5474.5],[4525.5,5474.5,4290,6518],[4290,6518,4525.5,5474.5]][Math.round(h/(Math.PI/2))];const actual=[Math.min(...f.map(p=>p.x)),Math.max(...f.map(p=>p.x)),Math.min(...f.map(p=>p.z)),Math.max(...f.map(p=>p.z))];assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<1e-8));});
const path=[{x:2000,z:3000},{x:2000,z:6000}],corridor=[{id:'left',minX:1,maxX:1500,minZ:1,maxZ:12000},{id:'right',minX:2500,maxX:10000,minZ:1,maxZ:12000}];
test('narrow line accepted where disc rejects',()=>assert.ok(admit(path,0,0,b,room,corridor).accepted&&!admission(path,radius('push350'),room,corridor).accepted));
const small={left:10,right:10,front:100,rear:10,margin:0},center={x:1000,z:1000},ob=[{id:'midarc',minX:1068,maxX:1072,minZ:1068,maxZ:1072}];
test('endpoint poses clear midarc contact rejected',()=>assert.ok(admit([center],0,0,small,room,ob).accepted&&admit([center],Math.PI/2,Math.PI/2,small,room,ob).accepted&&!admit([center],0,Math.PI/2,small,room,ob).accepted));
test('critical extrema exceeds endpoint union',()=>assert.ok(Math.max(...turnBounds(center,-.2,.4,small).map(p=>p.z))>1100));
test('stopped oriented worker contact',()=>assert.equal(admit([p],0,0,b,room,[],[{id:'other',p:{x:5949,z:5000},heading:0,body:b}]).accepted,false));
for(const bad of [NaN,Infinity,-Infinity,-1]){
 test('invalid point '+bad,()=>assert.throws(()=>admit([{x:bad,z:1}],0,0,b,room,[])));
 test('invalid room '+bad,()=>assert.throws(()=>admit([p],0,0,b,{...room,widthMm:bad},[])));
 test('invalid body '+bad,()=>assert.throws(()=>admit([p],0,0,{...b,rear:bad},room,[])));
}
test('mutation of result cannot change next admission',()=>{const body={...b},ps=[{...p}],a=admit(ps,0,0,body,room,[]);a.checks[0].accepted=false;body.rear=1;ps[0].x=0;assert.ok(admit([p],0,0,b,room,[]).accepted);});
test('invalid stopped heading rejected',()=>assert.throws(()=>admit([p],0,0,b,room,[],[{id:'bad',p,heading:NaN,body:b}])));
test('invalid rectangle rejected',()=>assert.throws(()=>admit([p],0,0,b,room,[{id:'bad',minX:1,maxX:0,minZ:1,maxZ:2}])));
if(process.argv.includes('--tests-only')){console.log(JSON.stringify({namedCaseCount:names.length,names}));process.exit(0);}
const s=parseOperationsScenario(JSON.parse(fs.readFileSync('fixtures/operations/main-warehouse.json','utf8'))),nav=createTransportNav(s),headings=[0,Math.PI/2,Math.PI,3*Math.PI/2];
const targets=[...s.locations.map(l=>({id:l.id,kind:'storage-approach',p:l.approachPointMm,headingBasis:'face rack center; cardinal alternatives also assessed',suggestedHeading:Math.atan2(s.geometry.racks.find(r=>r.id===l.rackId).positionMm.x-l.approachPointMm.x,s.geometry.racks.find(r=>r.id===l.rackId).positionMm.z-l.approachPointMm.z)})),...s.resources.flatMap(r=>[...r.servicePositions.map(p=>({id:p.id,resourceId:r.id,kind:'service',p})),...r.queueSlots.map(p=>({id:p.id,resourceId:r.id,kind:'queue',p}))]),...[...nav.unitProfiles].map(([id,u])=>({id,kind:'parking',p:u.parkingSlotMm}))];
const obstacles=[...nav.rackRects.map((r,i)=>({...r,id:s.geometry.racks[i].id})),...nav.obstacleRects.map((r,i)=>({...r,id:s.geometry.obstacles[i].id}))];
function compact(r){const groups=new Map();for(const c of r.checks){if(c.accepted)continue;const key=c.kind+':'+c.blockers.join(',');const g=groups.get(key)??{kind:c.kind,conservative:c.conservative,blockers:c.blockers,phaseCount:0,firstStartMs:c.start};g.phaseCount++;groups.set(key,g);}return {accepted:r.accepted,blockers:r.blockers,duration:r.duration,phaseCount:r.checks.length,rejections:[...groups.values()]};}
const out={headingSource:'Geometric assumptions only; engine declares no headings. All four cardinal initial and target headings are evaluated. Service/queue/parking have no asserted preferred yaw.',profiles:bodies,targets,poses:[],routes:[],stoppedPolicy:'Other units retain caller profile at cardinal heading zero (+Z assumption); own unit excluded. Moving traffic pending.'};
for(const [profile,body] of Object.entries(bodies)){
 for(const target of targets)for(const heading of headings)out.poses.push({profile,target:target.id,heading,disc:admission([target.p],radius(profile),nav.roomMm,obstacles),oriented:admit([target.p],heading,heading,body,nav.roomMm,obstacles)});
 for(const [id,u] of nav.unitProfiles)for(const target of targets){const route=nav.findStaticRoute(u.parkingSlotMm,target.p,id);if(route.status!=='ok'){out.routes.push({profile,unit:id,target:target.id,engineStatus:route.status});continue;}const stopped=[...nav.unitProfiles].filter(([other])=>other!==id).map(([id,v])=>({id,p:v.parkingSlotMm,heading:0,body}));for(const initial of headings)for(const final of headings){const staticResult=admit(route.points,initial,final,body,nav.roomMm,obstacles),parked=admit(route.points,initial,final,body,nav.roomMm,obstacles,stopped);out.routes.push({profile,unit:id,target:target.id,initial,final,engineStatus:'ok',disc:admission(route.points,radius(profile),nav.roomMm,obstacles),static:compact(staticResult),withParked:compact(parked)});}}
}
fs.writeFileSync('evidence/sanitized/r2-motion-next/admission.json',JSON.stringify(out));const summary={namedCaseCount:names.length,names,poseChecks:out.poses.length,routeVariants:out.routes.length,stationaryClear:out.poses.filter(r=>r.oriented.accepted).length,staticRouteClear:out.routes.filter(r=>r.static?.accepted).length,withParkedRouteClear:out.routes.filter(r=>r.withParked?.accepted).length};fs.writeFileSync('evidence/sanitized/r2-motion-next/checks.json',JSON.stringify(summary,null,2));console.log(summary);

