import {expect,test} from 'vitest';
import {DraftGestures,snappedDrag,rackDraftAction,rackEditGuard} from './direct-editor';
test('ground delta snaps in mm including negative coordinates',()=>{expect(snappedDrag({x:4000,z:6000},{x:120,z:20},{x:269,z:-131})).toEqual({x:4100,z:5800});});
test('one drag yields one undo and cancellation retains earlier history',()=>{const g=new DraftGestures();const original={entityId:'R1',x:4000,z:6000,turns:0 as const};g.begin(original);g.begin({...original,x:4100});g.commit({...original,x:4300});expect(g.history).toEqual([original]);g.begin({...original,x:4300});expect(g.cancel()).toEqual({...original,x:4300});expect(g.undo()).toEqual(original);expect(g.undo()).toBeNull();});
test('unchanged gestures and repeated cancellation do not add history',()=>{const g=new DraftGestures();const p={entityId:'PACK-1',x:20500,z:5000,turns:0 as const};g.begin(p);g.commit(p);expect(g.history).toHaveLength(0);expect(g.cancel()).toBeNull();});

test('pending translation blocks rotation without discarding coordinates and Undo unlocks it',()=>{
 const original={entityId:'R1',x:4000,z:6000,turns:0 as const};const g=new DraftGestures();
 const moved=rackDraftAction(original,original,{kind:'move',x:4100,z:6000})!;g.begin(original);g.commit(moved);
 expect(rackEditGuard(moved,original).canRotate).toBe(false);
 expect(rackDraftAction(moved,original,{kind:'rotate',turns:1})).toBeNull();expect(moved.x).toBe(4100);
 const restored=g.undo()!;expect(restored).toEqual(original);expect(rackDraftAction(restored,original,{kind:'rotate',turns:1})?.turns).toBe(1);
});
test('pending rotation blocks numeric/drag translation and translate mode until explicit Undo',()=>{
 const original={entityId:'R1',x:4000,z:6000,turns:0 as const};const g=new DraftGestures();const rotated=rackDraftAction(original,original,{kind:'rotate',turns:1})!;g.begin(original);g.commit(rotated);
 expect(rackEditGuard(rotated,original).canTranslate).toBe(false);expect(rackDraftAction(rotated,original,{kind:'move',x:4100,z:6000})).toBeNull();expect(rackDraftAction(rotated,original,{kind:'rotate',turns:0})).toBeNull();expect(rotated.turns).toBe(1);
 expect(rackDraftAction(g.undo()!,original,{kind:'move',x:4100,z:6000})?.x).toBe(4100);
});
