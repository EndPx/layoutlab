import {orientedAdmission,bodies,type Body} from './oriented.js';
import {trajectory,defaults,type Point,type Rect,type Limits} from './motion.js';
export type Pose={p:Point;heading:number};
export type Scene={room:{widthMm:number;depthMm:number};obstacles:Rect[];stopped:{id:string;p:Point;heading:number;body:Body}[]};
export type Action={from:Pose;to:Pose;mode:'forward'|'reverse'|'turn'};
export function actionCheck(a:Action,b:Body,s:Scene){
 const h=a.from.heading,k=a.to.heading,dx=a.to.p.x-a.from.p.x,dz=a.to.p.z-a.from.p.z;
 if(!['forward','reverse','turn'].includes(a.mode)||![h,k,dx,dz].every(Number.isFinite))throw Error('invalid action');
 if(a.mode==='turn'){if(dx!==0||dz!==0)throw Error('turn must be stationary');return orientedAdmission([a.from.p],h,k,b,s.room,s.obstacles,s.stopped);}
 const sign=a.mode==='reverse'?-1:1,distance=Math.hypot(dx,dz);
 if(h!==k||distance===0||Math.abs(dx-sign*Math.sin(h)*distance)>1e-7||Math.abs(dz-sign*Math.cos(h)*distance)>1e-7)throw Error('translation must follow signed body heading');
 // For reverse only, rotate local bounds by pi too: identical world body,
 // allowing existing exact translation sweep without an instantaneous yaw flip.
 const body=sign===1?b:{left:b.right,right:b.left,front:b.rear,rear:b.front,margin:b.margin};
 return orientedAdmission([a.from.p,a.to.p],h+(sign<0?Math.PI:0),h+(sign<0?Math.PI:0),body,s.room,s.obstacles,s.stopped);
}
export function maneuver(actions:Action[],body:Body,scene:Scene,limits?:Limits){
 limits={...(limits??defaults)};actions=structuredClone(actions);body=structuredClone(body);scene=structuredClone(scene);if(!actions.length)throw Error('empty maneuver');
 const tracks:any[]=[];let time=0,distance=0;for(let i=0;i<actions.length;i++){const a=actions[i];if(i&&JSON.stringify(a.from)!==JSON.stringify(actions[i-1].to))throw Error('discontinuous maneuver');const check=actionCheck(a,body,scene);if(!check.accepted)throw Error('unsafe action '+JSON.stringify(check.blockers));const reverse=a.mode==='reverse',t=trajectory(a.mode==='turn'?[a.from.p]:[a.from.p,a.to.p],a.from.heading+(reverse?Math.PI:0),a.to.heading+(reverse?Math.PI:0),limits);tracks.push({start:time,distance,a,t});time+=t.duration;distance+=t.distance;}
 return {duration:time,distance,get actions(){return structuredClone(actions);},evaluate(ms:number){if(!Number.isFinite(ms))throw Error('invalid time');ms=Math.max(0,Math.min(time,ms));const track=tracks.find(t=>ms<t.start+t.t.duration)??tracks[tracks.length-1],v=track.t.evaluate(ms-track.start),phase=track.t.phases.find((p:any)=>ms-track.start<p.start+p.duration),elapsed=phase?ms-track.start-phase.start:0,acceleration=phase?.kind==='line'?(elapsed<phase.r.up?limits!.a:elapsed<phase.r.up+phase.r.cruise?0:-limits!.d):0;return {...v,phase:(track.distance+v.distance)/limits!.strideMm%1,signedAcceleration:(track.a.mode==='reverse'?-1:1)*acceleration,heading:track.a.mode==='turn'?v.heading:track.a.from.heading,signedSpeed:track.a.mode==='reverse'?-v.speed:v.speed,distance:track.distance+v.distance,mode:track.a.mode};}};
}
export function searchExit(initial:Pose,target:{id:string;p:Point},body:Body,scene:Scene,policy:{reverse:boolean;stepMm:number;maxExpansions:number}){
 if(typeof policy.reverse!=='boolean'||!Number.isSafeInteger(policy.stepMm)||policy.stepMm<=0||policy.stepMm>10000||!Number.isSafeInteger(policy.maxExpansions)||policy.maxExpansions<=0||policy.maxExpansions>20000||!target.id)throw Error('invalid search bounds');
 initial=structuredClone(initial);target=structuredClone(target);body=structuredClone(body);scene=structuredClone(scene);const start=orientedAdmission([initial.p],initial.heading,initial.heading,body,scene.room,scene.obstacles,scene.stopped);orientedAdmission([target.p],0,0,body,scene.room,scene.obstacles,scene.stopped);
 if(!start.accepted)return {status:'invalid-initial',blockers:start.blockers,expansions:0,actions:[]};
 const headings=[0,Math.PI/2,Math.PI,3*Math.PI/2];if(!headings.includes(initial.heading))throw Error('cardinal headings required');
 const queue:{pose:Pose;parent:number;action?:Action}[]=[{pose:initial,parent:-1}],seen=new Set([JSON.stringify(initial)]),rejected=new Map<string,number>(),rejectedExamples:any[]=[];let cursor=0,found=-1;
 while(cursor<queue.length&&cursor<policy.maxExpansions){const n=queue[cursor],p=n.pose.p,h=n.pose.heading;if(Math.hypot(p.x-target.p.x,p.z-target.p.z)<1e-7){found=cursor;break;}const successors:Action[]=[];for(const dh of [-1,1])successors.push({from:n.pose,to:{p:{...p},heading:headings[(headings.indexOf(h)+dh+4)%4]},mode:'turn'});
 for(const sign of policy.reverse?[1,-1]:[1]){const vx=Math.round(Math.sin(h))*sign,vz=Math.round(Math.cos(h))*sign;const lengths=[policy.stepMm];const dx=target.p.x-p.x,dz=target.p.z-p.z;if((vx&&dz===0&&dx*vx>0)||(vz&&dx===0&&dz*vz>0)){const d=Math.abs(dx||dz);if(d<=policy.stepMm)lengths.push(d);}for(const length of lengths)successors.push({from:n.pose,to:{p:{x:p.x+vx*length,z:p.z+vz*length},heading:h},mode:sign===1?'forward':'reverse'});}
 for(const a of successors){const key=JSON.stringify(a.to);if(seen.has(key))continue;if(a.to.p.x<0||a.to.p.z<0||a.to.p.x>scene.room.widthMm||a.to.p.z>scene.room.depthMm)continue;const c=actionCheck(a,body,scene);if(!c.accepted){if(rejectedExamples.length<12)rejectedExamples.push({action:a,checks:c.checks.filter((p:any)=>!p.accepted)});for(const blocker of c.blockers)rejected.set(blocker,(rejected.get(blocker)??0)+1);continue;}seen.add(key);queue.push({pose:a.to,parent:cursor,action:a});}cursor++;}
 const actions:Action[]=[];if(found>=0){let i=found;while(queue[i].parent>=0){actions.unshift(queue[i].action!);i=queue[i].parent;}}
 return {status:found>=0?'found':cursor>=policy.maxExpansions?'no-path-under-expansion-bound':'no-path-on-grid',targetId:target.id,expansions:cursor,visited:seen.size,blockers:Object.fromEntries(rejected),rejectedExamples,actions};
}
export {bodies};
