import { expect, test } from "vitest";
import { sampleHumanMotion } from "./humanMotion";
const h = [{ unitId: "U", planVersion: 1, orderId: null, purpose: "test", startMs: 0, endMs: 3000, segmentCount: 2, segments: [ {fromX:0,fromZ:0,toX:0,toZ:1000,startMs:0,endMs:1000}, {fromX:0,fromZ:1000,toX:1000,toZ:1000,startMs:2000,endMs:3000} ] }];
test("absolute distance, waits, turns, replay, arbitrary length and reset",()=>{
 const s=(clockMs:number)=>sampleHumanMotion({clockMs,motionHistory:h},"U");
 expect(s(500).distanceM).toBe(.5); expect(s(1500).moving).toBe(false);
 expect(s(2500).distanceM).toBe(1.5); expect(s(2500).heading).toBe(Math.PI/2);
 expect(s(10000).distanceM).toBe(2); expect(s(500)).toEqual(s(500)); expect(s(0).phase).toBe(0);
});
test("absent archive and malformed time stop safely",()=>{
 expect(sampleHumanMotion({clockMs:NaN,motionHistory:h},"U").source).toBe("invalid-stopped");
 expect(sampleHumanMotion({clockMs:500,motionHistory:[{...h[0]!,segments:undefined}]},"U").source).toBe("legacy-stopped");
});
test("cardinal headings and last heading survive stationary completion",()=>{
 for(const [x,z,heading] of [[1000,0,Math.PI/2],[0,-1000,Math.PI],[-1000,0,-Math.PI/2]] as const){
 const history=[{...h[0]!,segments:[{fromX:0,fromZ:0,toX:x,toZ:z,startMs:0,endMs:1000}]}];
 expect(sampleHumanMotion({clockMs:500,motionHistory:history},'U').heading).toBe(heading);
 const wait=sampleHumanMotion({clockMs:2000,motionHistory:history},'U');expect(wait.heading).toBe(heading);expect(wait.moving).toBe(false);
 }
});
