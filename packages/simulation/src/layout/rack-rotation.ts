import { parseOperationsScenario, type OperationsScenario } from '../schema.js';
import { createOperationsController, parseOperationsExecutionConfig, type OperationsExecutionConfig } from '../operations.js';
import { parseLayoutProposal, validateProposalAgainstBaseline, defaultApprovedConstraints, type PackingStationTranslationProposal, type LayoutIssue } from './contract.js';
import { buildRackAttachmentMap, type RackAttachment } from './rack.js';
import { canonicalStringify, contentSha256 } from './hash.js';
import { diffPaths } from './attachments.js';
import { geometryAccessIssuesFor } from './validator.js';
import { runOne, scopeFor, classifyImprovement, type LayoutDelta } from './compare.js';
import { SIMULATION_VERSION, OPERATIONS_SCHEMA_VERSION, OPERATIONS_ENGINE_VERSION } from '../version.js';

export type QuarterTurns = 1 | 2 | 3;
export type RackQuarterTurnProposal = Omit<PackingStationTranslationProposal, 'kind' | 'target'> & { kind: 'RACK_QUARTER_TURN'; quarterTurns: QuarterTurns };
export type ApprovedRackRotation = { allowedRackIds: string[]; lockedRackIds: string[]; allowedQuarterTurns: QuarterTurns[]; maxRotatedRacks: number; maxQuarterTurns: number };
const versions = { simulation: SIMULATION_VERSION, operationsSchema: OPERATIONS_SCHEMA_VERSION, operationsEngine: OPERATIONS_ENGINE_VERSION };
function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !(k in value))) throw new Error('SCHEMA_INVALID: exact rotation contract keys required');
}
function parseProposal(raw: unknown): RackQuarterTurnProposal {
  exactKeys(raw, ['kind', 'proposalId', 'parent', 'entityId', 'quarterTurns']);
  if (raw.kind !== 'RACK_QUARTER_TURN' || ![1,2,3].includes(raw.quarterTurns as number)) throw new Error('UNSUPPORTED_ROTATION: quarterTurns must be 1, 2 or 3; arbitrary angles unsupported');
  const { quarterTurns, ...rest } = raw;
  const parsed = parseLayoutProposal({ ...rest, kind: 'PACKING_STATION_TRANSLATION', target: { mode: 'DELTA_MM', deltaMm: { dx: 0, dz: 0 } } });
  if (!parsed.ok || !parsed.supported) throw new Error('SCHEMA_INVALID: rotation identity');
  const { target: _target, kind: _kind, ...identity } = parsed.proposal;
  return { ...identity, kind: 'RACK_QUARTER_TURN', quarterTurns: quarterTurns as QuarterTurns };
}
function parseAuthority(raw: unknown): ApprovedRackRotation {
  exactKeys(raw, ['allowedRackIds','lockedRackIds','allowedQuarterTurns','maxRotatedRacks','maxQuarterTurns']);
  for (const key of ['allowedRackIds','lockedRackIds']) if (!Array.isArray(raw[key]) || (raw[key] as unknown[]).some(x => typeof x !== 'string') || new Set(raw[key] as string[]).size !== (raw[key] as string[]).length) throw new Error('SCHEMA_INVALID: rotation rack authority');
  if (!Array.isArray(raw.allowedQuarterTurns) || raw.allowedQuarterTurns.some(x => ![1,2,3].includes(x)) || new Set(raw.allowedQuarterTurns).size !== raw.allowedQuarterTurns.length) throw new Error('SCHEMA_INVALID: allowed quarter turns');
  for (const key of ['maxRotatedRacks','maxQuarterTurns']) if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0) throw new Error('SCHEMA_INVALID: rotation budget');
  return structuredClone(raw) as ApprovedRackRotation;
}
/** Positive Three.js Y yaw: (dx,dz) -> (dz,-dx). Integer arithmetic only. */
export function rotateRackOffset(point: { x: number; z: number }, turns: number) {
  if (!Number.isSafeInteger(turns)) throw new Error('Integer quarter turns required');
  let { x, z } = point;
  for (let i=0; i<((turns%4)+4)%4; i++) [x,z]=[z,-x];
  return { x: x === 0 ? 0 : x, z: z === 0 ? 0 : z };
}
function rotatedAttachment(original: RackAttachment, center: {x:number;z:number}, turns: number): RackAttachment {
  const result=structuredClone(original);const from=original.rack.positionMm;
  result.rack.positionMm={...center};
  if (turns%2) [result.rack.dimensionsMm.width,result.rack.dimensionsMm.depth]=[result.rack.dimensionsMm.depth,result.rack.dimensionsMm.width];
  const point=(p:{x:number;z:number})=>{const r=rotateRackOffset({x:p.x-from.x,z:p.z-from.z},turns);return{x:center.x+r.x,z:center.z+r.z};};
  for(const slot of result.slots){slot.storageAnchorMm={...slot.storageAnchorMm,...point(slot.storageAnchorMm)};slot.approachPointMm=point(slot.approachPointMm);}
  return result;
}
/** Scenario-only orientation recovery, relative to the explicit canonical asset frame. */
export function resolveRackOrientations(scenarioRaw: OperationsScenario, canonicalRaw: OperationsScenario) {
  const scenario=parseOperationsScenario(structuredClone(scenarioRaw));const canonical=parseOperationsScenario(structuredClone(canonicalRaw));
  const actual=buildRackAttachmentMap(scenario), originals=buildRackAttachmentMap(canonical);
  if(canonicalStringify([...actual.keys()].sort())!==canonicalStringify([...originals.keys()].sort()))throw new Error('OWNERSHIP_MISMATCH: rack IDs');
  return [...actual.values()].map(a=>{
    const original=originals.get(a.rackId)!;
    const matches=[0,1,2,3].filter(t=>canonicalStringify(rotatedAttachment(original,a.rack.positionMm,t))===canonicalStringify(a));
    if(matches.length!==1)throw new Error(`${matches.length ? 'AMBIGUOUS_ORIENTATION' : 'NON_RIGID_GEOMETRY'}: ${a.rackId}; ${matches.length} canonical rigid reconstructions`);
    const quarterTurns=matches[0]!;
    return { rackId:a.rackId, centerMm:{...a.rack.positionMm}, quarterTurns, yawDeg:quarterTurns*90, convention:'THREE_POSITIVE_Y:(dx,dz)->(dz,-dx)' as const, intrinsicDimensionsMm:structuredClone(original.rack.dimensionsMm), localSlots:original.slots.map(slot=>({...structuredClone(slot),storageAnchorMm:{...slot.storageAnchorMm,x:slot.storageAnchorMm.x-original.rack.positionMm.x,z:slot.storageAnchorMm.z-original.rack.positionMm.z},approachPointMm:{x:slot.approachPointMm.x-original.rack.positionMm.x,z:slot.approachPointMm.z-original.rack.positionMm.z}})) };
  });
}
export function applyRackQuarterTurn(baselineRaw: OperationsScenario, raw: RackQuarterTurnProposal, canonicalScenario: OperationsScenario, attachments: Map<string,RackAttachment>) {
  const baseline=parseOperationsScenario(structuredClone(baselineRaw));const proposal=parseProposal(raw);
  resolveRackOrientations(baseline,canonicalScenario);
  const canonicalMap=buildRackAttachmentMap(baseline);
  const entries=(map:Map<string,RackAttachment>)=>[...map.entries()].sort(([a],[b])=>a.localeCompare(b));
  if(canonicalStringify(entries(canonicalMap))!==canonicalStringify(entries(attachments)))throw new Error(`OWNERSHIP_MISMATCH: complete rack attachment map`);
  const expected=canonicalMap.get(proposal.entityId), declaration=structuredClone(attachments.get(proposal.entityId));
  if(!expected || canonicalStringify(expected)!==canonicalStringify(declaration))throw new Error(`OWNERSHIP_MISMATCH: ${proposal.entityId}`);
  const after=rotatedAttachment(expected,expected.rack.positionMm,proposal.quarterTurns);
  const candidate=structuredClone(baseline);
  candidate.geometry.racks[candidate.geometry.racks.findIndex(r=>r.id===proposal.entityId)]=after.rack;
  for(const slot of after.slots)candidate.locations[candidate.locations.findIndex(l=>l.id===slot.id)]=slot;
  const scenario=parseOperationsScenario(candidate);
  const frames=resolveRackOrientations(scenario,canonicalScenario);
  return { scenario, transform:{entityId:proposal.entityId,quarterTurns:proposal.quarterTurns,centerMm:{...expected.rack.positionMm}}, attachmentsBefore:structuredClone(expected), viewerPlacement:{attachment:structuredClone(after),assetFrame:frames.find(f=>f.rackId===proposal.entityId)!}, changedFields:diffPaths(baseline,scenario) };
}
export type RackRotationInput={baselineScenario:OperationsScenario;canonicalScenario:OperationsScenario;proposal:RackQuarterTurnProposal;attachments:Map<string,RackAttachment>;approvedRotation:unknown;executionConfig:OperationsExecutionConfig;safetyCeilingMs:number};
export async function runRackRotationComparison(input:RackRotationInput){
  input=structuredClone(input);
  const baseline=parseOperationsScenario(input.baselineScenario), canonical=parseOperationsScenario(input.canonicalScenario), proposal=parseProposal(input.proposal), approved=parseAuthority(input.approvedRotation),config=parseOperationsExecutionConfig(input.executionConfig);
  if(!Number.isSafeInteger(input.safetyCeilingMs)||input.safetyCeilingMs<=0)throw new Error('Invalid safety ceiling');
  const bundle=applyRackQuarterTurn(baseline,proposal,canonical,input.attachments);
  const approvedShared={...defaultApprovedConstraints(approved.allowedRackIds),lockedEntityIds:approved.lockedRackIds};
  const structural=await validateProposalAgainstBaseline({...proposal,kind:'PACKING_STATION_TRANSLATION',target:{mode:'DELTA_MM',deltaMm:{dx:0,dz:0}}},baseline,new Set(input.attachments.keys()),approvedShared);
  const issue=(code:string,message:string):LayoutIssue=>({code,severity:'error',entityId:proposal.entityId,message});
  if(!approved.allowedQuarterTurns.includes(proposal.quarterTurns))structural.push(issue('ROTATION_NOT_ALLOWED','Turn count not in approved authority'));
  if(approved.maxRotatedRacks<1||proposal.quarterTurns>approved.maxQuarterTurns)structural.push(issue('ROTATION_BUDGET_EXCEEDED','Rotation exceeds separately approved budget'));
  const base=geometryAccessIssuesFor(baseline),candidate=geometryAccessIssuesFor(bundle.scenario);
  for(const [scenario,issues]of [[baseline,base.issues],[bundle.scenario,candidate.issues]] as const){try{createOperationsController({scenario,executionConfig:config});}catch(e){issues.push(issue('ENGINE_ADMISSION_FAILED',String(e)));}}
  const candidateValid=!structural.length&&!candidate.issues.length;
  const baselineRun=base.issues.length?null:runOne(baseline,config,input.safetyCeilingMs),candidateRun=candidateValid?runOne(bundle.scenario,config,input.safetyCeilingMs):null;
  const delta:LayoutDelta|null=baselineRun&&candidateRun?{shipped:candidateRun.metrics.shipped-baselineRun.metrics.shipped,backlog:candidateRun.metrics.backlog-baselineRun.metrics.backlog,stageBacklog:candidateRun.metrics.stageBacklog-baselineRun.metrics.stageBacklog,totalWaitMs:candidateRun.metrics.totalWaitMs-baselineRun.metrics.totalWaitMs,makespanMs:baselineRun.metrics.makespanMs!==null&&candidateRun.metrics.makespanMs!==null?candidateRun.metrics.makespanMs-baselineRun.metrics.makespanMs:null,lastShippedAtMs:baselineRun.metrics.lastShippedAtMs!==null&&candidateRun.metrics.lastShippedAtMs!==null?candidateRun.metrics.lastShippedAtMs-baselineRun.metrics.lastShippedAtMs:null,stopClockMs:candidateRun.metrics.stopClockMs-baselineRun.metrics.stopClockMs}:null;
  return{schema:'layoutlab.rack-rotation-comparison/1' as const,versions:{...versions},commonInputs:{scenario:baseline,canonicalScenario:canonical,executionConfig:config},proposal,approvedRotation:approved,attachments:[...input.attachments.values()],safetyCeilingMs:input.safetyCeilingMs,parentHash:await contentSha256(baseline),bundle,validation:{baselineValid:!base.issues.length,candidateValid,structural,baseline:base,candidate},measurement:!candidateValid?'not-measured':base.issues.length?'candidate-only-repaired':'measured',baselineRun,candidateRun,delta,evaluationScope:scopeFor(baseline,input.safetyCeilingMs,baselineRun?.termination??null,candidateRun?.termination??null),improvement:baselineRun&&candidateRun?classifyImprovement(baselineRun.metrics,candidateRun.metrics):'not-measured'};
}
export type RackRotationComparison=Awaited<ReturnType<typeof runRackRotationComparison>>;
export async function verifyRackRotationComparison(raw:RackRotationComparison):Promise<boolean>{
  try{const report=structuredClone(raw);if(report.schema!=='layoutlab.rack-rotation-comparison/1'||canonicalStringify(report.versions)!==canonicalStringify(versions))return false;
    const actual=await runRackRotationComparison({baselineScenario:report.commonInputs.scenario,canonicalScenario:report.commonInputs.canonicalScenario,proposal:report.proposal,attachments:new Map(report.attachments.map(a=>[a.rackId,a])),approvedRotation:report.approvedRotation,executionConfig:report.commonInputs.executionConfig,safetyCeilingMs:report.safetyCeilingMs});
    return canonicalStringify(actual)===canonicalStringify(report);
  }catch{return false;}
}
