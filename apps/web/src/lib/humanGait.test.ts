import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { bindHumanGait, decodeHumanGait } from "./humanGait";
const packet=decodeHumanGait(JSON.parse(readFileSync(new URL("../../public/assets/humans/main-gait-v1.json",import.meta.url),"utf8")));
test("baked rig cycle changes actual matrices and repeats independently",()=>{
 const source=new THREE.Group(); for(const name of packet.names){const bone=new THREE.Bone();bone.name=name;source.add(bone);}
 const left=clone(source),right=clone(source),a=bindHumanGait(left,packet),b=bindHumanGait(right,packet);
 a.apply(0,false);b.apply(0,false);const initial=a.diagnostics();
 a.apply(.12,true);expect(a.diagnostics()).not.toEqual(initial);expect(b.diagnostics()).toEqual(initial);
 const moving=a.diagnostics();a.apply(.12,true);expect(a.diagnostics()).toEqual(moving);
 a.apply(5000.12,true);const long=a.diagnostics();for(let i=0;i<packet.names.length;i++) for(let j=0;j<4;j++)expect(long[i]!.quaternion[j]).toBeCloseTo(moving[i]!.quaternion[j]!,8);
 a.apply(0,false);expect(a.diagnostics()).toEqual(initial);
 a.apply(.5,true);expect(a.diagnostics()).toEqual(initial);
});
test("packet rejects bad rotations and discontinuous seams",()=>{
 const broken=structuredClone(packet);broken.frames[0]![0]![0]=NaN;expect(()=>decodeHumanGait(broken)).toThrow();
 const seam=structuredClone(packet);seam.frames.at(-1)![0]=[0,0,0,1];expect(()=>decodeHumanGait(seam)).toThrow();
});
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { decodeHumanPose } from "./humanPose";
test("actual workwear skin stays grounded and preserves accepted hand targets",async()=>{
 if(!globalThis.ProgressEvent) Object.defineProperty(globalThis,"ProgressEvent",{value:class {constructor(type:string,props:object){Object.assign(this,{type},props)}}});
 const base=new URL("../../public/assets/humans/",import.meta.url);
 const gltf=JSON.parse(readFileSync(new URL("worker-articulated-workwear-v2.gltf",base),"utf8"));
 for(const buffer of gltf.buffers) buffer.uri='data:application/octet-stream;base64,'+readFileSync(new URL(buffer.uri,base)).toString('base64');
 const {scene:rig}=await new GLTFLoader().parseAsync(JSON.stringify(gltf),'');
 const pose=decodeHumanPose(JSON.parse(readFileSync(new URL("main-pose-v1.json",base),"utf8")),rig);
 rig.position.fromArray(pose.root.position);rig.quaternion.fromArray(pose.root.quaternion);rig.scale.fromArray(pose.root.scale);
 for(const t of pose.transforms){const bone=rig.getObjectByName(t.name)!;bone.position.fromArray(t.position);bone.quaternion.fromArray(t.quaternion);bone.scale.fromArray(t.scale);}
 rig.updateMatrixWorld(true);
 const hands=['hand_l','hand_r'].map(n=>rig.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()));
 const driver=bindHumanGait(rig,packet);let minBoot=Infinity,maxHandDrift=0;
 for(let i=0;i<=100;i++){
  driver.apply(i*.005,true);
  maxHandDrift=Math.max(maxHandDrift,...hands.map((p,j)=>p.distanceTo(rig.getObjectByName(j?'hand_r':'hand_l')!.getWorldPosition(new THREE.Vector3()))));
  rig.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh)||!/boot/.test(o.name))return;o.skeleton.update();for(let j=0;j<o.geometry.attributes.position!.count;j++)minBoot=Math.min(minBoot,o.getVertexPosition(j,new THREE.Vector3()).applyMatrix4(o.matrixWorld).y);});
 }
 expect(minBoot).toBeGreaterThan(-.004);expect(minBoot).toBeLessThan(.004);expect(maxHandDrift).toBeLessThan(.001);
 console.log({minBootY:minBoot,maxHandDriftM:maxHandDrift});
 const twin=clone(rig);const skins:THREE.SkinnedMesh[]=[];rig.traverse(o=>{if(o instanceof THREE.SkinnedMesh)skins.push(o)});
 for(const skin of skins){const copy=twin.getObjectByName(skin.name) as THREE.SkinnedMesh;expect(copy.skeleton).not.toBe(skin.skeleton);expect(copy.geometry).toBe(skin.geometry);expect(copy.skeleton.bones[0]).not.toBe(skin.skeleton.bones[0]);}
});
