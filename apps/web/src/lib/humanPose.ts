import * as THREE from "three";
export type HumanPoseTransform = { name: string; position: number[]; quaternion: number[]; scale: number[] };
export type HumanPosePacket = { root: Omit<HumanPoseTransform, "name">; transforms: HumanPoseTransform[] };
export function decodeHumanPose(value: unknown, rig: THREE.Object3D): HumanPosePacket {
  const record = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Invalid human pose record");
    return v as Record<string, unknown>;
  };
  const vector = (v: unknown, length: number): number[] => {
    if (!Array.isArray(v) || v.length !== length || !v.every(n => typeof n === "number" && Number.isFinite(n))) throw new Error("Invalid human pose vector");
    return v as number[];
  };
  const transform = (v: unknown): Omit<HumanPoseTransform, "name"> => {
    const r = record(v);
    const quaternion = vector(r.quaternion, 4);
    if (Math.abs(Math.hypot(...quaternion) - 1) > 0.001) throw new Error("Non-unit human pose quaternion");
    const scale = vector(r.scale, 3);
    if (scale.some(n => n <= 0 || Math.abs(n - 1) > 0.001)) throw new Error("Human pose must preserve source dimensions");
    return { position: vector(r.position, 3), quaternion, scale };
  };
  const r = record(value);
  if (!Array.isArray(r.transforms) || r.transforms.length === 0 || r.transforms.length > 256) throw new Error("Invalid human bone table");
  const seen = new Set<string>();
  const transforms = r.transforms.map(v => {
    const t = record(v);
    if (typeof t.name !== "string" || seen.has(t.name) || !rig.getObjectByName(t.name)) throw new Error(`Missing or repeated human bone ${String(t.name)}`);
    seen.add(t.name);
    return { name: t.name, ...transform(t) };
  });
  rig.traverse(o => { if (o instanceof THREE.Bone && !seen.has(o.name)) throw new Error(`Pose omits bone ${o.name}`); });
  return { root: transform(r.root), transforms };
}
export function disposeHumanSkeletons(rig: THREE.Object3D): void {
  const skeletons = new Set<THREE.Skeleton>();
  rig.traverse(o => { if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton); });
  skeletons.forEach(s => s.dispose());
}
