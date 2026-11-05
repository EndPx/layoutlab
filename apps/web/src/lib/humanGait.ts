import * as THREE from "three";
export const HUMAN_STRIDE_M = 0.5;
export type HumanGaitPacket = { strideM: number; rootDropM: number; names: string[]; frames: number[][][] };
export function decodeHumanGait(value: unknown): HumanGaitPacket {
 const p=value as HumanGaitPacket;
 const expected=['thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r','upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r'];
 if (!p || p.strideM !== HUMAN_STRIDE_M || p.rootDropM !== 0.065 || JSON.stringify(p.names)!==JSON.stringify(expected) || !Array.isArray(p.frames) || p.frames.length<3 || p.frames.length>256) throw Error("Invalid human gait packet");
 for(const frame of p.frames) {
  if(!Array.isArray(frame)||frame.length!==expected.length) throw Error("Invalid gait frame");
  for(const q of frame) if(!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||Math.abs(Math.hypot(...q)-1)>.001) throw Error("Invalid gait rotation");
 }
 for(let i=0;i<expected.length;i++) if(new THREE.Quaternion().fromArray(p.frames[0]![i]!).angleTo(new THREE.Quaternion().fromArray(p.frames.at(-1)![i]!))>1e-5) throw Error("Discontinuous gait seam");
 return p;
}
export function bindHumanGait(rig: THREE.Object3D, packet: HumanGaitPacket) {
 const bones=packet.names.map(name=>{const bone=rig.getObjectByName(name);if(!bone)throw Error(`Missing gait bone ${name}`);return bone;});
 const rootY=rig.position.y;
 const a=new THREE.Quaternion(),b=new THREE.Quaternion();
 return {
  apply(distanceM: number, moving: boolean) {
   if(!Number.isFinite(distanceM)||distanceM<0) throw Error("Invalid gait distance");
   rig.position.y=rootY-packet.rootDropM;
   const phase=moving ? (distanceM % packet.strideM)/packet.strideM : 0;
   const sample=phase*(packet.frames.length-1),lo=Math.floor(sample),hi=Math.min(lo+1,packet.frames.length-1);
   bones.forEach((bone,i)=>bone.quaternion.copy(a.fromArray(packet.frames[lo]![i]!).slerp(b.fromArray(packet.frames[hi]![i]!),sample-lo)));
   rig.updateMatrixWorld(true);
  },
  diagnostics:()=>bones.map(bone=>({name:bone.name,quaternion:bone.quaternion.toArray(),localMatrix:bone.matrix.toArray()})),
 };
}
