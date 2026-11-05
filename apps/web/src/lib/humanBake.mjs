import fs from 'node:fs';import crypto from 'node:crypto';import * as T from 'three';import {createForwardLegDriver} from './humanBakeDriver.mjs';
const base='apps/web/public/assets/humans/';
const src=JSON.parse(fs.readFileSync(base+'worker-articulated-workwear-v2.gltf'));
const pose=JSON.parse(fs.readFileSync(base+'main-pose-v1.json'));
const scene=new T.Scene(),motion=new T.Group(),human=new T.Group();scene.add(motion);motion.add(human);motion.rotation.y=Math.PI;
const ns=src.nodes.map(n=>{const o=new T.Object3D();o.name=n.name||'';if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o});
src.nodes.forEach((n,i)=>(n.children||[]).forEach(j=>ns[i].add(ns[j])));src.scenes[0].nodes.forEach(i=>human.add(ns[i]));
const update=()=>scene.updateMatrixWorld(true);
function restore(){human.position.fromArray(pose.root.position);human.quaternion.fromArray(pose.root.quaternion);human.scale.fromArray(pose.root.scale);for(const t of pose.transforms){const b=human.getObjectByName(t.name);b.position.fromArray(t.position);b.quaternion.fromArray(t.quaternion);b.scale.fromArray(t.scale)}update()}
restore();const driver=createForwardLegDriver({human,update});
const names=['thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r','upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r'],frames=[];
for(let i=0;i<=100;i++){restore();const d=.5+i*.005;motion.position.z=d;update();driver.evaluate(d);frames.push(names.map(n=>human.getObjectByName(n).quaternion.clone().normalize().toArray()))}
const seam=Math.max(...names.map((_,i)=>new T.Quaternion().fromArray(frames[0][i]).angleTo(new T.Quaternion().fromArray(frames.at(-1)[i]))));console.log({seam});
fs.writeFileSync(base+'main-gait-v1.json',JSON.stringify({version:1,strideM:.5,rootDropM:.065,names,frames,seamRadians:seam,provenance:{sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(base+'worker-articulated-workwear-v2.gltf')).digest('hex'),driverSha256:crypto.createHash('sha256').update(fs.readFileSync('apps/web/src/lib/humanBakeDriver.mjs')).digest('hex'),poseSha256:crypto.createHash('sha256').update(fs.readFileSync(base+'main-pose-v1.json')).digest('hex'),note:'Read-only forward driver, frozen feasible best-vector main pose; stable two-step period .5..1m; arm IK maintains original grip; source dimensions unchanged'}}));
