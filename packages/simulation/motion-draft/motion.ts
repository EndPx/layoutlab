export type Point = {x:number; z:number};
export type Limits = {v:number; a:number; d:number; omega:number; stopMs:number; strideMm:number};
export const defaults: Readonly<Limits> = Object.freeze({v:1,a:0.001,d:0.001,omega:Math.PI/2000,stopMs:100,strideMm:1201});
export const profiles = Object.freeze({push350:Object.freeze({width:749,length:2028}),push500:Object.freeze({width:749,length:2178}),side:Object.freeze({width:1397,length:1220})});
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12;
const positive=(v:unknown):v is number=>finite(v)&&v>=1e-12;
const point=(p:Point)=>p&&finite(p.x)&&finite(p.z)&&p.x>=0&&p.z>=0;
function limits(l:Limits){if(!l||!['v','a','d','omega','stopMs','strideMm'].every(k=>positive(l[k as keyof Limits])))throw Error('invalid limits');}
// Radius about CART origin, not the combined rectangle center: rear overhang matters.
export function radius(p:keyof typeof profiles):number { if(!Object.hasOwn(profiles,p))throw Error('invalid profile'); const b=profiles[p]; return p==='side'?Math.ceil(Math.hypot(1057,610))+100:Math.ceil(Math.hypot(b.width/2,b.length-610))+100; }
export function ramp(length:number,l:Limits=defaults) {
 limits(l); if(!finite(length)||length<0)throw Error('invalid distance');
 if(length===0)return {peak:0,up:0,down:0,cruise:0,duration:0};
 const peak=Math.min(l.v,Math.sqrt(2*length/(1/l.a+1/l.d)));
 const up=peak/l.a,down=peak/l.d, cruise=Math.max(0,(length-peak*up/2-peak*down/2)/peak)||0;
 return {peak,up,down,cruise,duration:up+cruise+down};
}
const delta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function trajectory(points:readonly Point[],initial:number,target:number,l:Limits=defaults) {
 limits(l);
 if(!Array.isArray(points)||!points.length||!points.every(point)||!finite(initial)||!finite(target))throw Error('invalid trajectory');
 points=points.map(p=>({...p})); l={...l};
 const phases:any[]=[]; let time=0,distance=0,heading=initial;
 const turn=(p:Point,to:number)=>{const angle=delta(heading,to); if(Math.abs(angle)>1e-12){const duration=Math.abs(angle)/l.omega; phases.push({kind:'turn',start:time,duration,p,heading,angle,distance});time+=duration;heading=to;}};
 for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i],length=Math.hypot(q.x-p.x,q.z-p.z);if(!length)continue;turn(p,Math.atan2(q.x-p.x,q.z-p.z));const r=ramp(length,l);phases.push({kind:'line',start:time,duration:r.duration,p,q,heading,distance,length,r});time+=r.duration;distance+=length;phases.push({kind:'stop',start:time,duration:l.stopMs,p:q,heading,distance});time+=l.stopMs;}
 turn(points[points.length-1],target);
 return {get phases(){return structuredClone(phases);},duration:time,distance,evaluate(t:number){if(!Number.isFinite(t))throw Error('invalid time');t=Math.max(0,Math.min(time,t));const s=phases.find(s=>t<s.start+s.duration);if(!s)return {position:{...points[points.length-1]},heading:target,speed:0,distance,phase:distance/l.strideMm%1,kind:'stop'};const u=t-s.start;let x=0,v=0;if(s.kind==='line'){const r=s.r;if(u<r.up){v=l.a*u;x=l.a*u*u/2;}else if(u<r.up+r.cruise){v=r.peak;x=r.peak*r.up/2+r.peak*(u-r.up);}else{const w=u-r.up-r.cruise;v=Math.max(0,r.peak-l.d*w);x=r.peak*r.up/2+r.peak*r.cruise+r.peak*w-l.d*w*w/2;}}const traveled=s.distance+x;return {position:s.kind==='line'?{x:s.p.x+(s.q.x-s.p.x)*x/s.length,z:s.p.z+(s.q.z-s.p.z)*x/s.length}:{...s.p},heading:s.heading+(s.kind==='turn'?s.angle*u/s.duration:0),speed:v,distance:traveled,phase:traveled/l.strideMm%1,kind:s.kind};}};
}
export type Rect={id:string;minX:number;maxX:number;minZ:number;maxZ:number};
// Conservative capsule via segment vs radius-expanded AABB; rejects contact.
export function admission(points:readonly Point[],r:number,room:{widthMm:number;depthMm:number},obstacles:Rect[],stopped:{id:string;p:Point;r:number}[]=[]) {
 if(!Array.isArray(points)||!points.length||!points.every(point)||!positive(r)||!room||!positive(room.widthMm)||!positive(room.depthMm))throw Error('invalid envelope');
 if(!Array.isArray(obstacles)||!obstacles.every(o=>o&&typeof o.id==='string'&&o.id.length>0&&[o.minX,o.maxX,o.minZ,o.maxZ].every(finite)&&o.minX>=0&&o.minZ>=0&&o.minX<o.maxX&&o.minZ<o.maxZ))throw Error('invalid rectangles');
 if(!Array.isArray(stopped)||!stopped.every(s=>s&&typeof s.id==='string'&&s.id.length>0&&point(s.p)&&positive(s.r)))throw Error('invalid stopped envelope');
 const blockers=new Set<string>();
 for(const p of points)if(p.x<=r||p.z<=r||p.x>=room.widthMm-r||p.z>=room.depthMm-r)blockers.add('wall');
 const boxes=[...obstacles,...stopped.map(s=>({id:s.id,minX:s.p.x-s.r,maxX:s.p.x+s.r,minZ:s.p.z-s.r,maxZ:s.p.z+s.r}))];
 for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[i];for(const o of boxes){let lo=0,hi=1;for(const [v,d,min,max] of [[a.x,b.x-a.x,o.minX-r,o.maxX+r],[a.z,b.z-a.z,o.minZ-r,o.maxZ+r]]){if(d===0){if(v<min||v>max){hi=-1;break;}}else{const t1=(min-v)/d,t2=(max-v)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}}if(lo<=hi)blockers.add(o.id);}}
 return {accepted:blockers.size===0,blockers:[...blockers].sort()};
}
