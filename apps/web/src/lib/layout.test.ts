import { expect, test } from "vitest";
import { applyPackingStationTranslation, buildStationAttachmentMap, contentSha256, MAIN_WAREHOUSE_ATTACHMENTS, runLayoutComparison } from "@layoutlab/simulation";
import { buildLayoutScene, loadOperationsScene, loadBurstOperationsScene, buildSceneForScenario, resolveLayoutAttachments } from "./operations";
for (const load of [loadOperationsScene, loadBurstOperationsScene]) test(`canonical bundle reaches visual model, service, queue and obstacle: ${load.name}`, async () => {
 const scene=load(); const before=JSON.stringify(scene.scenario);
 const p={kind:"PACKING_STATION_TRANSLATION" as const,proposalId:"visual-oracle",parent:{scenarioId:scene.scenario.id,scenarioContentSha256:await contentSha256(scene.scenario),schemaVersion:scene.scenario.schemaVersion,engineVersion:scene.scenario.engineVersion},entityId:"PACK-1",target:{mode:"ABSOLUTE_CENTER_MM" as const,centerMm:{x:20500,z:4000}}};
 const b=applyPackingStationTranslation(scene.scenario,p,buildStationAttachmentMap(scene.scenario,MAIN_WAREHOUSE_ATTACHMENTS));
 const proposed=buildLayoutScene(b);
 expect(proposed.stations.find(s=>s.id==="PACK-1")?.centerMm).toEqual({x:20500,z:4000});
 expect(proposed.resources.find(s=>s.id==="PACK-1")?.service[0].z).toBe(5900);
 expect(proposed.resources.find(s=>s.id==="PACK-1")?.queue.map(q=>q.z)).toEqual([5900,7600,9300]);
 expect(proposed.obstacles.find(s=>s.id==="OB-PACK1")?.minZ).toBe(3390);
 expect(proposed.layoutGhost?.centreMm).toEqual({x:20500,z:5000});
 expect(JSON.stringify(scene.scenario)).toBe(before);
 expect(proposed.stations.find(s=>s.id==="PACK-2")).toEqual(scene.stations.find(s=>s.id==="PACK-2"));
});
test("layout comparison never silently reexecutes a recorded runtime",async()=>{
 await expect(runLayoutComparison({implementationVersion:"0.1.0"} as Parameters<typeof runLayoutComparison>[0])).rejects.toThrow("recorded 0.1.0 remains read-only");
});

test("successive station translations reconstruct all centres and reject non-rigid/unrelated drift",async()=>{
 let scenario=loadBurstOperationsScene().scenario;
 for(const [entityId,z] of [["PACK-1",4000],["PACK-2",12000]] as const){
  const p={kind:"PACKING_STATION_TRANSLATION" as const,proposalId:"sequential",parent:{scenarioId:scenario.id,scenarioContentSha256:await contentSha256(scenario),schemaVersion:scenario.schemaVersion,engineVersion:scenario.engineVersion},entityId,target:{mode:"ABSOLUTE_CENTER_MM" as const,centerMm:{x:20500,z}}};
  scenario=applyPackingStationTranslation(scenario,p,buildStationAttachmentMap(scenario,resolveLayoutAttachments(scenario))).scenario;
 }
 const scene=buildSceneForScenario(scenario);
 expect(scene.stations.find(s=>s.id==="PACK-1")?.centerMm.z).toBe(4000);
 expect(scene.stations.find(s=>s.id==="PACK-2")?.centerMm.z).toBe(12000);
 let bad=structuredClone(scenario);bad.resources.find(r=>r.id==="PACK-1")!.queueSlots[0].z++;
 expect(()=>buildSceneForScenario(bad)).toThrow();
 bad=structuredClone(scenario);bad.geometry.racks[0].positionMm.x++;
 expect(()=>buildSceneForScenario(bad)).toThrow("racks");
});
