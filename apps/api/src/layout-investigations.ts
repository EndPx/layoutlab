import { z } from "zod";
import { randomUUID } from "node:crypto";
import { MAIN_WAREHOUSE_ATTACHMENTS, buildStationAttachmentMap, canonicalStringify, contentSha256, defaultApprovedConstraints, parseOperationsScenario, parseOperationsExecutionConfig, runLayoutComparison, validateLayoutCandidate, SIMULATION_VERSION, type LayoutComparisonResult, type OperationsScenario, type OperationsExecutionConfig, type StationAttachment } from "@layoutlab/simulation";
import { liveAvailable, sanitizeMessage, type ApiConfig } from "./config.js";
import { chatCompletionJson, type FetchLike, type ProviderDiagnostics } from "./provider.js";
import { parseLayoutAction, parseLayoutInterpretation, type LayoutInterpretation } from "./layout-investigation-contract.js";

export const LAYOUT_INVESTIGATION_SCHEMA = "layoutlab.layout-investigation/1";
export const LAYOUT_PROMPT_VERSION = "layoutlab.layout-investigation-prompt/1";
const strict = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const string = { type: "string" }; const integer = { type: "integer" };
const region = strict({ entityId: string, minXMm: integer, minZMm: integer, maxXMm: integer, maxZMm: integer });
export const LAYOUT_INTERPRETATION_JSON_SCHEMA = strict({ objective: string, constraints: strict({ allowedEntityIds: { type: "array", items: string }, lockedEntityIds: { type: "array", items: string }, maxMovedEntities: integer, maxTranslationMm: integer, snapGridMm: integer, requireSameWorkerCount: { type: "boolean", enum: [true] }, requireSameServiceDurations: { type: "boolean", enum: [true] }, requireSameWorkload: { type: "boolean", enum: [true] }, requireSameSeed: { type: "boolean", enum: [true] } }), allowedRegions: { type: "array", items: region } });
export const LAYOUT_ACTION_JSON_SCHEMA = strict({ action: { type: "string", enum: ["propose", "finish"] }, hypothesis: string, proposalId: { type: ["string", "null"] }, entityId: { type: ["string", "null"] }, parent: { ...strict({ scenarioId: string, scenarioContentSha256: string, schemaVersion: string, engineVersion: string }), type: ["object", "null"] }, centerMm: { ...strict({ x: integer, z: integer }), type: ["object", "null"] }, candidateId: { type: ["string", "null"] } });
const providerAction = z.strictObject({ action: z.enum(["propose", "finish"]), hypothesis: z.string().max(500), proposalId: z.string().nullable(), entityId: z.string().nullable(), parent: z.unknown(), centerMm: z.unknown(), candidateId: z.string().nullable() });
export function parseProviderLayoutAction(value: unknown) {
  const p = providerAction.parse(value);
  if (p.action === "finish") {
    if ([p.proposalId, p.entityId, p.parent, p.centerMm].some(x => x !== null)) throw new Error("finish transform fields must be null");
    return parseLayoutAction({ action: p.action, hypothesis: p.hypothesis, candidateId: p.candidateId });
  }
  if (p.candidateId !== null) throw new Error("proposal candidateId must be null");
  return parseLayoutAction({ action: p.action, hypothesis: p.hypothesis, proposalId: p.proposalId, entityId: p.entityId, parent: p.parent, centerMm: p.centerMm });
}

// Canonical attachment identities and relative offsets, verified by production.
// Applied parents retain every station's rigid translation; no web dependency.
export function resolveInvestigationAttachments(scenario: OperationsScenario): StationAttachment[] {
  const rows = MAIN_WAREHOUSE_ATTACHMENTS.map(a => {
    const o = scenario.geometry.obstacles.find(o => o.id === a.obstacleId);
    if (!o) throw new Error(`missing canonical obstacle ${a.obstacleId}`);
    const x = (o.minXMm + o.maxXMm) / 2, z = (o.minZMm + o.maxZMm) / 2;
    const dx = x - a.centreMm.x, dz = z - a.centreMm.z;
    const slots = (rows: typeof a.servicePositions) => rows.map(p => ({ ...p, x: p.x + dx, z: p.z + dz }));
    return { ...a, centreMm: { x, z }, obstacleRectMm: { minXMm: a.obstacleRectMm.minXMm + dx, maxXMm: a.obstacleRectMm.maxXMm + dx, minZMm: a.obstacleRectMm.minZMm + dz, maxZMm: a.obstacleRectMm.maxZMm + dz }, servicePositions: slots(a.servicePositions), queueSlots: slots(a.queueSlots) };
  });
  buildStationAttachmentMap(scenario, rows);
  return rows;
}
const inputSchema = z.strictObject({ scenario: z.unknown(), executionConfig: z.unknown(), question: z.string().min(1).max(2000), safetyCeilingMs: z.number().int().min(1).max(2147483647), mode: z.literal("live"), consent: z.literal(true) });
export type LayoutInvestigationInput = { scenario: OperationsScenario; executionConfig: OperationsExecutionConfig; question: string; safetyCeilingMs: number; mode: "live"; consent: true };
export function parseLayoutInvestigationInput(value: unknown): LayoutInvestigationInput {
  const p = inputSchema.parse(value);
  return { ...p, scenario: parseOperationsScenario(structuredClone(p.scenario)), executionConfig: parseOperationsExecutionConfig(structuredClone(p.executionConfig)) };
}
export function parseLayoutApproval(value: unknown, input: LayoutInvestigationInput): LayoutInterpretation {
  const p = parseLayoutInterpretation(value, resolveInvestigationAttachments(input.scenario).map(a => a.stationId));
  for (const r of p.allowedRegions) if (r.maxXMm > input.scenario.geometry.room.widthMm || r.maxZMm > input.scenario.geometry.room.depthMm) throw new Error("allowed region exceeds room bounds");
  return p;
}
export type Evaluation = { validation: Awaited<ReturnType<typeof validateLayoutCandidate>>; regionIssues: string[]; comparison: LayoutComparisonResult | null };
export async function evaluateLayoutProposal(input: LayoutInvestigationInput, approval: LayoutInterpretation, proposal: unknown, isActive: () => boolean = () => true): Promise<Evaluation> {
  if (!isActive()) throw new Error("RUN_CLOSED");
  const attachments = resolveInvestigationAttachments(input.scenario);
  const validation = await validateLayoutCandidate({ baselineScenario: input.scenario, executionConfig: input.executionConfig, attachments: buildStationAttachmentMap(input.scenario, attachments), approvedConstraints: approval.constraints, proposal });
  if (!isActive()) throw new Error("RUN_CLOSED");
  const regionIssues: string[] = [];
  const p = proposal as { entityId?: string; target?: { centerMm?: { x: number; z: number } } };
  const centre = p?.target?.centerMm, r = approval.allowedRegions.find(r => r.entityId === p?.entityId);
  if (!r || !centre || centre.x < r.minXMm || centre.x > r.maxXMm || centre.z < r.minZMm || centre.z > r.maxZMm) regionIssues.push("OUTSIDE_APPROVED_REGION");
  const comparison = validation.ok && regionIssues.length === 0 ? await runLayoutComparison({ baselineScenario: input.scenario, executionConfig: input.executionConfig, proposal, attachments, approvedConstraints: approval.constraints, safetyCeilingMs: input.safetyCeilingMs }) : null;
  return { validation, regionIssues, comparison };
}
type State = "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
type RequestRow = { index: number; phase: "interpretation" | "proposal"; status: "dispatched" | "success" | "failed" | "aborted"; diagnostics: ProviderDiagnostics | null; output: unknown; error: string | null };
type ProposalRow = { requestIndex: number; candidateId: string; hypothesis: string; proposal: unknown; evaluation: Evaluation };
type Recommendation = { candidateId: string; source: "model" | "deterministic-fallback" };
export type LayoutInvestigationReport = { schema: typeof LAYOUT_INVESTIGATION_SCHEMA; promptVersion: string; implementationVersion: string; runId: string; createdAt: number; deadlineAt: number; state: State; input: LayoutInvestigationInput; inputSha256: string; attachments: StationAttachment[]; interpreted: LayoutInterpretation | null; approved: LayoutInterpretation | null; baseline: LayoutComparisonResult | null; requests: RequestRow[]; proposals: ProposalRow[]; rejectedActions: { requestIndex: number; reason: string }[]; recommendation: Recommendation | null; modelRequestsUsed: number; proposalsUsed: number; limits: { requests: number; proposals: number; tokens: number; timeoutMs: number }; budget: { claimId: string | null; dispatched: number }; provider: { kind: string; model: string }; error: string | null };
export type LayoutInvestigationRecord = { report: LayoutInvestigationReport; controller: AbortController; timer: ReturnType<typeof setTimeout> | null; task: Promise<void> | null; started: boolean };
const rejectionReason = (e: unknown) => sanitizeMessage(e instanceof Error ? e.message : "invalid action", { apiKey: "" } as ApiConfig).slice(0, 500);
const closed = (s: State) => s !== "RUNNING" && s !== "AWAITING_APPROVAL";
export class LayoutInvestigationStore {
  private records = new Map<string, LayoutInvestigationRecord>();
  constructor(private config: ApiConfig, private hooks: { beforeDispatch?: (record: LayoutInvestigationRecord) => void; isLegacyBusy?: () => boolean } = {}) {}
  get(id: string) { return this.records.get(id); }
  hasActive() { return [...this.records.values()].some(r => !closed(r.report.state)); }
  async create(value: unknown, claimId: string | null): Promise<LayoutInvestigationRecord> {
    if (this.config.budgetStateFile && !this.hooks.beforeDispatch) throw new Error("BUDGET_GUARD_UNAVAILABLE");
    const input = parseLayoutInvestigationInput(value), attachments = resolveInvestigationAttachments(input.scenario);
    const inputSha256 = await contentSha256(input);
    if ([...this.records.values()].filter(r => !closed(r.report.state)).length >= this.config.concurrency || this.hooks.isLegacyBusy?.()) throw new Error("CONCURRENCY_LIMIT");
    if (this.records.size >= this.config.maxRuns) {
      const old = [...this.records].find(([,r]) => closed(r.report.state));
      if (old) this.records.delete(old[0]); else throw new Error("RUN_STORE_FULL");
    }
    const createdAt = Date.now(), timeoutMs = Math.min(120000, this.config.timeoutMs);
    const r: LayoutInvestigationRecord = { report: { schema: LAYOUT_INVESTIGATION_SCHEMA, promptVersion: LAYOUT_PROMPT_VERSION, implementationVersion: SIMULATION_VERSION, runId: randomUUID(), createdAt, deadlineAt: createdAt + timeoutMs, state: "RUNNING", input, inputSha256, attachments, interpreted: null, approved: null, baseline: null, requests: [], proposals: [], rejectedActions: [], recommendation: null, modelRequestsUsed: 0, proposalsUsed: 0, limits: { requests: Math.min(4, this.config.maxRequests), proposals: Math.min(3, this.config.maxProposals), tokens: Math.min(2000, this.config.maxCompletionTokens), timeoutMs }, budget: { claimId, dispatched: 0 }, provider: { kind: this.config.providerKind, model: this.config.modelId }, error: null }, controller: new AbortController(), timer: null, task: null, started: false };
    this.records.set(r.report.runId, r);
    r.timer = setTimeout(() => this.finish(r, "TIMED_OUT", "deadline exceeded"), timeoutMs); r.timer.unref?.();
    return r;
  }
  buildReport(r: LayoutInvestigationRecord) { return structuredClone(r.report); }
  toSummary(r: LayoutInvestigationRecord) { return this.buildReport(r); }
  cancel(id: string) { const r = this.require(id); if (closed(r.report.state)) throw new Error("RUN_CLOSED"); this.finish(r, "CANCELLED", "cancelled; claim preserved"); return r; }
  private require(id: string) { const r = this.records.get(id); if (!r) throw new Error("UNKNOWN_INVESTIGATION"); return r; }
  private alive(r: LayoutInvestigationRecord) {
    if (!closed(r.report.state) && Date.now() >= r.report.deadlineAt) this.finish(r, "TIMED_OUT", "deadline exceeded");
    return !closed(r.report.state);
  }
  private fallback(r: LayoutInvestigationRecord): Recommendation | null {
    if (!r.report.baseline?.candidateValid) return null;
    const improved = r.report.proposals.find(p => p.evaluation.comparison?.improvement === "improved");
    return { candidateId: improved?.candidateId ?? "baseline", source: "deterministic-fallback" };
  }
  private finish(r: LayoutInvestigationRecord, state: State, error: string | null = null) {
    if (closed(r.report.state)) return;
    r.report.state = state; r.report.error = error; r.report.recommendation ??= this.fallback(r);
    if (r.timer) clearTimeout(r.timer); r.timer = null; r.controller.abort();
  }
  private launch(r: LayoutInvestigationRecord, work: () => Promise<void>) {
    r.task = work().catch(e => { if (this.alive(r)) this.finish(r, "FAILED", sanitizeMessage(e instanceof Error ? e.message : "failed", this.config).slice(0,500)); });
  }
  start(r: LayoutInvestigationRecord, fetchImpl: FetchLike = fetch) {
    if (r.started || r.report.state !== "RUNNING") throw new Error("RUN_CLOSED"); r.started = true;
    this.launch(r, async () => {
      if (!this.alive(r)) return;
      const first = r.report.attachments[0]!;
      const parent = await this.parent(r);
      if (!this.alive(r)) return;
      const baseline = await runLayoutComparison({ baselineScenario: r.report.input.scenario, executionConfig: r.report.input.executionConfig, proposal: { kind: "PACKING_STATION_TRANSLATION", proposalId: "baseline", parent, entityId: first.stationId, target: { mode: "ABSOLUTE_CENTER_MM", centerMm: first.centreMm } }, attachments: r.report.attachments, approvedConstraints: defaultApprovedConstraints(r.report.attachments.map(a=>a.stationId)), safetyCeilingMs: r.report.input.safetyCeilingMs });
      if (!this.alive(r)) return;
      r.report.baseline = baseline;
      const value = await this.request(r, "interpretation", LAYOUT_INTERPRETATION_JSON_SCHEMA, this.context(r), fetchImpl);
      if (!this.alive(r)) return;
      r.report.interpreted = parseLayoutApproval(value, r.report.input);
      r.report.state = "AWAITING_APPROVAL";
    });
  }
  approve(id: string, value: unknown, fetchImpl: FetchLike = fetch) {
    const r = this.require(id);
    if (!this.alive(r) || r.report.state !== "AWAITING_APPROVAL") throw new Error("NOT_AWAITING_APPROVAL");
    const approved = parseLayoutApproval(value, r.report.input);
    if (this.hooks.isLegacyBusy?.()) throw new Error("CONCURRENCY_LIMIT");
    r.report.approved = structuredClone(approved); r.report.state = "RUNNING";
    this.launch(r, () => this.loop(r, fetchImpl)); return r;
  }
  private async parent(r: LayoutInvestigationRecord) { const s = r.report.input.scenario; return { scenarioId:s.id, scenarioContentSha256:await contentSha256(s), schemaVersion:s.schemaVersion, engineVersion:s.engineVersion }; }
  private context(r: LayoutInvestigationRecord) {
    const s=r.report.input.scenario;
    return { question:r.report.input.question, coordinateSystem:"integer-mm room frame", geometry:s.geometry, attachments:r.report.attachments, resources:s.resources, workers:s.mobileUnits, frozenInputSha256:r.report.inputSha256, executionConfig:r.report.input.executionConfig, baseline:r.report.baseline?.baselineMetrics, approved:r.report.approved, interpretation:r.report.interpreted };
  }
  private async request(r: LayoutInvestigationRecord, phase: RequestRow["phase"], schema: unknown, payload: unknown, fetchImpl: FetchLike) {
    if (!this.alive(r) || r.report.modelRequestsUsed >= r.report.limits.requests) throw new Error("REQUEST_LIMIT");
    const availability=liveAvailable(this.config); if(!availability.ok)throw new Error(availability.reason??"SETUP_REQUIRED");
    const userContent=JSON.stringify(payload);
    if(userContent.length>this.config.maxContextChars) throw new Error("CONTEXT_LIMIT");
    this.hooks.beforeDispatch?.(r);
    if (!this.alive(r)) throw new Error("RUN_CLOSED");
    const row: RequestRow={index:++r.report.modelRequestsUsed,phase,status:"dispatched",diagnostics:null,output:null,error:null}; r.report.requests.push(row); r.report.budget.dispatched++;
    try {
      const result=await chatCompletionJson({...this.config,maxCompletionTokens:r.report.limits.tokens},{schemaName:`layout_${phase}`,schema,developerInstruction: phase==="interpretation" ? "Interpret the objective into editable packing-station constraints for user review. One station maximum, receiving locked, 100mm grid, at most5000mm. All fixed-input flags true. Allowed regions are station centre bounds within room. No execution is authorized until approval." : "Use only approved packing-station transforms, never service/staff/racks. Propose concrete integer mm centres and exact parent identity. All keys required; proposal uses null candidateId; finish uses null transform fields and an existing valid finishCandidateId. Hypotheses are unproven. Use actual feedback, retain worse results; no invented metrics.",userContent},r.controller.signal,fetchImpl);
      row.diagnostics={responseId:result.responseId,finishReason:result.finishReason,usage:result.usage,durationMs:result.durationMs,responseBytes:result.responseBytes,model:result.model};
      if(!this.alive(r)){row.status="aborted";return null;}
      // Persist parsed structured evidence, never raw content/reasoning.
      row.output=JSON.parse(sanitizeMessage(JSON.stringify(result.parsed),this.config)); row.status="success"; return row.output;
    } catch(e) {
      row.status=this.alive(r)?"failed":"aborted"; row.error=sanitizeMessage(e instanceof Error?e.message:"provider failed",this.config).slice(0,500); row.diagnostics=(e as {diagnostics?:ProviderDiagnostics}).diagnostics??null; throw e;
    }
  }
  private async loop(r: LayoutInvestigationRecord, fetchImpl: FetchLike) {
    while(this.alive(r) && r.report.modelRequestsUsed<r.report.limits.requests) {
      const payload={...this.context(r),parent:await this.parent(r),results:r.report.proposals.map(p=>({candidateId:p.candidateId,proposal:p.proposal,validation:{ok:p.evaluation.validation.ok,issues:p.evaluation.validation.issues},regionIssues:p.evaluation.regionIssues,metrics:p.evaluation.comparison?.candidateMetrics,delta:p.evaluation.comparison?.delta,improvement:p.evaluation.comparison?.improvement})),rejectedActions:r.report.rejectedActions,finishCandidateIds:[...(r.report.baseline?.candidateValid?["baseline"]:[]),...r.report.proposals.filter(p=>p.evaluation.comparison?.candidateValid).map(p=>p.candidateId)],requestsRemaining:r.report.limits.requests-r.report.modelRequestsUsed,proposalsRemaining:r.report.limits.proposals-r.report.proposalsUsed};
      const value=await this.request(r,"proposal",LAYOUT_ACTION_JSON_SCHEMA,payload,fetchImpl); if(!this.alive(r))return;
      const index=r.report.modelRequestsUsed;
      try {
        const action=parseProviderLayoutAction(value);
        if(action.action==="finish") {
          if(!payload.finishCandidateIds.includes(action.candidateId))throw new Error("UNKNOWN_OR_INVALID_RECOMMENDATION");
          r.report.recommendation={candidateId:action.candidateId,source:"model"};this.finish(r,"COMPLETED");return;
        }
        if(r.report.proposalsUsed>=r.report.limits.proposals)throw new Error("PROPOSAL_LIMIT");
        if (!this.alive(r)) return;
        const candidateId=`${r.report.runId}:candidate-${r.report.proposalsUsed + 1}`;
        const evaluation=await evaluateLayoutProposal(r.report.input,r.report.approved!,action.proposal, () => this.alive(r));
        if(!this.alive(r))return;
        r.report.proposalsUsed++;
        r.report.proposals.push({requestIndex:index,candidateId,hypothesis:action.hypothesis,proposal:action.proposal,evaluation});
      } catch(e) { if (!this.alive(r)) return; r.report.rejectedActions.push({requestIndex:index,reason:rejectionReason(e)});}
    }
    if(this.alive(r))this.finish(r,"COMPLETED");
  }
}



const nonnegative = z.number().int().nonnegative().safe();
const diagnosticsSchema = z.strictObject({responseId:z.string().nullable(),finishReason:z.string().nullable(),usage:z.strictObject({promptTokens:nonnegative.nullable(),completionTokens:nonnegative.nullable(),totalTokens:nonnegative.nullable()}).nullable(),durationMs:z.number().nonnegative(),responseBytes:nonnegative,model:z.string()});
const reportKeys = ["schema","promptVersion","implementationVersion","runId","createdAt","deadlineAt","state","input","inputSha256","attachments","interpreted","approved","baseline","requests","proposals","rejectedActions","recommendation","modelRequestsUsed","proposalsUsed","limits","budget","provider","error"];
const exactKeys = (v: unknown, keys: string[]) => typeof v === "object" && v !== null && !Array.isArray(v) && canonicalStringify(Object.keys(v).sort()) === canonicalStringify([...keys].sort());
// Consistency/recomputation only, never authentication of model or user authorship.
export async function verifyLayoutInvestigationExport(value: unknown): Promise<{ ok: boolean; mismatches: string[] }> {
  const mismatches: string[] = [];
  const check = (condition: boolean, message: string) => { if(!condition)mismatches.push(message); };
  const equal = (a: unknown,b: unknown,label: string) => check(canonicalStringify(a)===canonicalStringify(b),label);
  try {
    if(!exactKeys(value,reportKeys))throw new Error("report envelope keys");
    const r=value as LayoutInvestigationReport;
    check(r.schema===LAYOUT_INVESTIGATION_SCHEMA && r.promptVersion===LAYOUT_PROMPT_VERSION && r.implementationVersion===SIMULATION_VERSION,"versions");
    check(typeof r.runId==="string" && r.runId.length>0,"runId");
    check(["RUNNING","AWAITING_APPROVAL","COMPLETED","FAILED","CANCELLED","TIMED_OUT"].includes(r.state),"state");
    check(Number.isSafeInteger(r.createdAt)&&Number.isSafeInteger(r.deadlineAt)&&r.deadlineAt-r.createdAt===r.limits.timeoutMs,"deadline");
    check(exactKeys(r.limits,["requests","proposals","tokens","timeoutMs"]),"limits envelope");
    for(const [n,max] of [[r.limits.requests,4],[r.limits.proposals,3],[r.limits.tokens,2000],[r.limits.timeoutMs,120000]])check(Number.isSafeInteger(n)&&n!>=0&&n!<=max!,"limit bound");
    check(r.limits.tokens>0&&r.limits.timeoutMs>0,"positive limits");
    const input=parseLayoutInvestigationInput(r.input);
    equal(await contentSha256(input),r.inputSha256,"fixed input hash");
    const attachments=resolveInvestigationAttachments(input.scenario);
    // Reject mismatched fixed-input evidence before expensive engine replay.
    if(r.baseline)equal(r.baseline.commonInputs,{scenario:input.scenario,executionConfig:input.executionConfig},"baseline fixed inputs");
    for(const p of r.proposals)if(p.evaluation.comparison) {
      equal(p.evaluation.comparison.commonInputs,{scenario:input.scenario,executionConfig:input.executionConfig},"candidate fixed inputs");
      equal(p.evaluation.comparison.proposal,p.proposal,"candidate proposal identity");
      equal(p.evaluation.comparison.approvedConstraints,r.approved?.constraints,"candidate approved authority");
    }
    check(r.modelRequestsUsed===r.requests.length&&r.budget.dispatched===r.requests.length&&r.proposalsUsed===r.proposals.length,"counter identities");
    if(mismatches.length)return {ok:false,mismatches};
    equal(attachments,r.attachments,"canonical attachments");
    check(exactKeys(r.budget,["claimId","dispatched"])&&(r.budget.claimId===null||typeof r.budget.claimId==="string"),"budget envelope");
    check(exactKeys(r.provider,["kind","model"])&&typeof r.provider.model==="string"&&["meta","fixture","unsupported"].includes(r.provider.kind),"provider envelope");
    check(r.error===null||typeof r.error==="string","error shape");
    if(r.baseline) {
      const first=attachments[0]!,s=input.scenario;
      const baseline=await runLayoutComparison({baselineScenario:s,executionConfig:input.executionConfig,attachments,approvedConstraints:defaultApprovedConstraints(attachments.map(a=>a.stationId)),safetyCeilingMs:input.safetyCeilingMs,proposal:{kind:"PACKING_STATION_TRANSLATION",proposalId:"baseline",parent:{scenarioId:s.id,scenarioContentSha256:await contentSha256(s),schemaVersion:s.schemaVersion,engineVersion:s.engineVersion},entityId:first.stationId,target:{mode:"ABSOLUTE_CENTER_MM",centerMm:first.centreMm}}});
      equal(baseline,r.baseline,"baseline recomputation");
    }
    if(r.interpreted)equal(parseLayoutApproval(r.interpreted,input),r.interpreted,"interpretation");
    if(r.approved)equal(parseLayoutApproval(r.approved,input),r.approved,"approval");
    check(Array.isArray(r.requests)&&r.requests.length===r.modelRequestsUsed&&r.modelRequestsUsed<=r.limits.requests,"request totals");
    check(r.budget.dispatched===r.modelRequestsUsed,"dispatched totals");
    check(Array.isArray(r.proposals)&&r.proposals.length===r.proposalsUsed&&r.proposalsUsed<=r.limits.proposals,"proposal totals");
    check(r.requests.length===0||r.baseline!==null,"baseline evidence required before dispatch"); check(r.requests.length<2||r.approved!==null,"approval required before subsequent dispatch"); check(r.approved===null||r.interpreted!==null,"interpretation required before approval");
    check(r.interpreted===null || (r.requests[0]?.phase==="interpretation" && r.requests[0]?.status==="success"),"interpretation requires successful dispatch evidence");
    const seen=new Set<number>();
    const derivedRejections: LayoutInvestigationReport["rejectedActions"] = [];
    let finish: Recommendation|null=null;
    for(const [i,row] of r.requests.entries()) {
      check(exactKeys(row,["index","phase","status","diagnostics","output","error"]),"request envelope");
      check(row.index===i+1&&row.phase===(i===0?"interpretation":"proposal"),"request sequence");
      check(["dispatched","success","failed","aborted"].includes(row.status),"request status"); check(row.diagnostics===null||diagnosticsSchema.safeParse(row.diagnostics).success,"provider diagnostics"); check(row.error===null||typeof row.error==="string","request error");
      if(row.status!=="success") {
        check(row.index===r.requests.length,"unsettled or failed request must be last");
        if(row.status==="dispatched")check(["RUNNING","CANCELLED","TIMED_OUT"].includes(r.state),"dispatched request lifecycle");
        if(row.status==="failed")check(["FAILED","CANCELLED","TIMED_OUT"].includes(r.state),"failed request lifecycle");
        if(row.status==="aborted")check(["CANCELLED","TIMED_OUT"].includes(r.state),"aborted request lifecycle");
        continue;
      }
      if(row.phase==="interpretation") { try { const parsed = parseLayoutApproval(row.output,input); if(r.interpreted===null && ["CANCELLED","TIMED_OUT"].includes(r.state))check(row.index===r.requests.length&&r.approved===null,"cancelled interpretation settlement"); else equal(parsed,r.interpreted,"interpreted output");} catch {check(r.interpreted===null&&r.state==="FAILED","failed interpretation evidence");} continue;}
      check(r.approved!==null,"proposal requires approved authority");
      try {
        const a=parseProviderLayoutAction(row.output);
        if(a.action==="finish") {
          const target=a.candidateId==="baseline"?r.baseline:r.proposals.find(p=>p.candidateId===a.candidateId&&p.requestIndex<row.index)?.evaluation.comparison;
          if(!target?.candidateValid)throw new Error("UNKNOWN_OR_INVALID_RECOMMENDATION");
          check(row.index===r.requests.length&&r.state==="COMPLETED","finish must close the run"); finish={candidateId:a.candidateId,source:"model"};
        } else {
          const p=r.proposals.find(p=>p.requestIndex===row.index);
          if(!p) {
            if(r.proposals.filter(x=>x.requestIndex<row.index).length>=r.limits.proposals) throw new Error("PROPOSAL_LIMIT");
            // A cancelled/timed-out evaluation (or a live pending evaluation)
            // has dispatched evidence but must never commit a late candidate.
            check(row.index===r.requests.length && ["RUNNING","CANCELLED","TIMED_OUT"].includes(r.state),"missing proposal evidence");
            continue;
          }
          check(r.proposals.filter(x=>x.requestIndex<row.index).length<r.limits.proposals,"proposal beyond cap");
          seen.add(row.index);
          equal(p.proposal,a.proposal,"proposal action equality");equal(p.hypothesis,a.hypothesis,"hypothesis equality");
          equal(await evaluateLayoutProposal(input,r.approved!,p.proposal),p.evaluation,"candidate recomputation");
        }
      } catch(e) {
        derivedRejections.push({requestIndex:row.index,reason:rejectionReason(e)});
      }
    }
    for(const [i,p] of r.proposals.entries()) {
      check(exactKeys(p,["requestIndex","candidateId","hypothesis","proposal","evaluation"]),"proposal envelope");
      check(seen.has(p.requestIndex)&&p.candidateId===`${r.runId}:candidate-${i+1}`,"proposal identity");
    }
    equal(r.rejectedActions,derivedRejections,"exact derived rejection evidence");
    check(r.rejectedActions.every(x=>exactKeys(x,["requestIndex","reason"])&&typeof x.reason==="string"&&x.reason.length<=500&&r.requests.some(q=>q.index===x.requestIndex&&q.phase==="proposal"&&q.status==="success")),"rejection links");
    const deterministic = r.baseline?.candidateValid?{candidateId:r.proposals.find(p=>p.evaluation.comparison?.improvement==="improved")?.candidateId??"baseline",source:"deterministic-fallback"}:null;
    equal(r.recommendation,finish??(closed(r.state)?deterministic:null),"recommendation links");
    if(r.state==="COMPLETED") {
      check(r.baseline!==null && r.interpreted!==null && r.approved!==null,"completed lifecycle requires baseline interpretation and approval");
      check(r.error===null,"completed run cannot have an error");
      check(finish!==null || r.modelRequestsUsed===r.limits.requests,"completion requires valid finish or exhausted requests");
      check(r.requests.every(q=>q.status==="success"),"completed request settlement");
    }
    if(r.state==="RUNNING" && r.approved===null)check(r.interpreted===null&&r.requests.length<=1&&r.proposals.length===0,"pre-approval running lifecycle");
    if(["FAILED","CANCELLED","TIMED_OUT"].includes(r.state))check(typeof r.error==="string"&&r.error.length>0,"terminal failure reason");
    if(r.state==="AWAITING_APPROVAL")check(r.interpreted!==null&&r.approved===null&&r.requests.length===1,"approval gate");
  }catch(e){mismatches.push(e instanceof Error?e.message:"invalid report");}
  return {ok:mismatches.length===0,mismatches};
}






