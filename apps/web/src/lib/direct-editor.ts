export type DirectEditorBridge = {
  canTranslate?: boolean;
  rotationDisabledReason?: string;
  rotateQuarterTurn?: () => void;
  feedback?: string;
  undo?: () => void;
  canUndo?: boolean;
  entityId: string; x: number; z: number;
  move: (x: number, z: number) => void;
  begin: () => void; commit: () => void; cancel: () => void;
};
export const snappedDrag = (origin: {x:number;z:number}, start: {x:number;z:number}, point: {x:number;z:number}) => ({x:Math.round((origin.x+point.x-start.x)/100)*100,z:Math.round((origin.z+point.z-start.z)/100)*100});

export type DraftPose = {entityId:string;x:number;z:number;turns:0|1|2|3};
export class DraftGestures {
  history: DraftPose[] = [];
  start: DraftPose | null = null;
  begin(p:DraftPose):void { if (!this.start) this.start={...p}; }
  commit(p:DraftPose):void { if(this.start && JSON.stringify(this.start)!==JSON.stringify(p)) this.history.push(this.start); this.start=null; }
  cancel():DraftPose|null { const p=this.start;this.start=null;return p; }
  undo():DraftPose|null { return this.history.pop() ?? null; }
}

export function rackEditGuard(pose: DraftPose, original: {x:number;z:number}): {canTranslate:boolean;canRotate:boolean;message:string} {
  if(pose.turns!==0)return {canTranslate:false,canRotate:true,message:"Rotation pending. Apply or Undo before moving this rack."};
  if(pose.x!==original.x || pose.z!==original.z)return {canTranslate:true,canRotate:false,message:"Translation pending. Apply or Undo before rotating this rack."};
  return {canTranslate:true,canRotate:true,message:""};
}
export function rackDraftAction(pose:DraftPose, original:{x:number;z:number}, action:{kind:'move';x:number;z:number}|{kind:'rotate';turns:0|1|2|3}):DraftPose|null {
  const guard=rackEditGuard(pose,original);
  if(action.kind==='move')return guard.canTranslate?{...pose,x:action.x,z:action.z}:null;
  if(!guard.canRotate || (!guard.canTranslate && action.turns===0))return null;
  return {...pose,turns:action.turns};
}
