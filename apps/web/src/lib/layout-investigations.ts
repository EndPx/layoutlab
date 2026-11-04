import { canonicalStringify, parseApprovedConstraints, parseOperationsScenario, parseOperationsExecutionConfig, MAIN_WAREHOUSE_ATTACHMENTS, type ApprovedLayoutConstraints, type OperationsScenario } from '@layoutlab/simulation';
import { ApiError } from './api';
export type LayoutApproval = { objective: string; constraints: ApprovedLayoutConstraints; allowedRegions: { entityId: string; minXMm: number; minZMm: number; maxXMm: number; maxZMm: number }[] };
export type LayoutInput = { scenario: OperationsScenario; executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number }; question: string; safetyCeilingMs: number; mode: 'live'; consent: true };
export type LayoutReport = {
 schema: 'layoutlab.layout-investigation/1'; runId: string;
 state: 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
 input: LayoutInput; implementationVersion: string; promptVersion: string;
 interpreted: LayoutApproval | null; approved: LayoutApproval | null;
 deadlineAt: number; modelRequestsUsed: number; proposalsUsed: number; error: string | null;
 [key: string]: unknown;
};
// Same simulation horizon as LayoutEditor; independent of the live request deadline.
export const LAYOUT_EVALUATION_CEILING_MS = 7200000;
const root = '/api/operations/layout-investigations';
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function layoutContext(scenario: OperationsScenario, executionConfig: LayoutInput['executionConfig'], implementationVersion: string): string {
 return canonicalStringify({ scenario, executionConfig, implementationVersion });
}
export function approvalErrors(value: unknown, scenario: OperationsScenario): string[] {
 if (!object(value) || typeof value.objective !== 'string' || !value.objective.trim() || value.objective.length > 500) return ['Objective must contain 1–500 characters.'];
 const parsed = parseApprovedConstraints(value.constraints);
 if (!parsed.ok) return ['Malformed layout constraints.'];
 const c = parsed.constraints;
 const ids = MAIN_WAREHOUSE_ATTACHMENTS.map(a => a.stationId);
 const errors: string[] = [];
 if (c.maxMovedEntities > 1 || c.maxTranslationMm > 5000 || c.snapGridMm !== 100) errors.push('Allow at most one move, 5000 mm translation and a 100 mm grid.');
 if (!c.lockedEntityIds.includes('RCV-1') || c.allowedEntityIds.some(id => !ids.includes(id) || c.lockedEntityIds.includes(id)) || new Set(c.allowedEntityIds).size !== c.allowedEntityIds.length) errors.push('Only unlocked packing-station IDs may be allowed; receiving must stay locked.');
 const regions = value.allowedRegions;
 if (!Array.isArray(regions) || regions.length < 1 || regions.length > 2 || regions.length !== c.allowedEntityIds.length) return [...errors, 'Each allowed packing station needs one centre rectangle.'];
 const seen = new Set<string>();
 for (const r of regions) {
  if (!object(r) || typeof r.entityId !== 'string' || seen.has(r.entityId) || !c.allowedEntityIds.includes(r.entityId) || ['minXMm','minZMm','maxXMm','maxZMm'].some(k => !Number.isSafeInteger(r[k]) || (r[k] as number) < 0)) { errors.push('Invalid or duplicate allowed centre rectangle.'); continue; }
  seen.add(r.entityId);
  if ((r.minXMm as number) > (r.maxXMm as number) || (r.minZMm as number) > (r.maxZMm as number) || (r.maxXMm as number) > scenario.geometry.room.widthMm || (r.maxZMm as number) > scenario.geometry.room.depthMm) errors.push('Centre rectangles must be ordered and inside the room.');
 }
 return errors;
}
export function parseLayoutReport(value: unknown): LayoutReport {
 if (!object(value)) throw new Error('Malformed layout investigation response');
 const r = value;
 if (r.schema !== 'layoutlab.layout-investigation/1' || typeof r.runId !== 'string' || !r.runId || !['RUNNING','AWAITING_APPROVAL','COMPLETED','FAILED','CANCELLED','TIMED_OUT'].includes(String(r.state)) || !Number.isFinite(r.deadlineAt) || !Number.isSafeInteger(r.modelRequestsUsed) || (r.modelRequestsUsed as number) < 0 || !Number.isSafeInteger(r.proposalsUsed) || (r.proposalsUsed as number) < 0 || typeof r.implementationVersion !== 'string' || typeof r.promptVersion !== 'string' || !(r.error === null || typeof r.error === 'string') || !object(r.input)) throw new Error('Malformed or unknown layout investigation response');
 if (!object(r.provider) || !['meta','gater','fixture','unsupported'].includes(String(r.provider.kind)) || typeof r.provider.model !== 'string' || !r.provider.model) throw new Error('Malformed layout provider');
 const input = r.input;
 const scenario = parseOperationsScenario(input.scenario);
 parseOperationsExecutionConfig(input.executionConfig);
 if (typeof input.question !== 'string' || input.mode !== 'live' || input.consent !== true || !Number.isSafeInteger(input.safetyCeilingMs)) throw new Error('Malformed layout input identity');
 for (const key of ['interpreted','approved']) if (r[key] !== null && approvalErrors(r[key], scenario).length) throw new Error('Malformed layout interpretation or approval');
 if (r.state === 'AWAITING_APPROVAL' && r.interpreted === null) throw new Error('Awaiting approval without interpretation');
 return value as unknown as LayoutReport; // Preserve all API report evidence for L2c2.
}
async function request(path: string, body: unknown | undefined, signal?: AbortSignal): Promise<unknown> {
 const res = await fetch(root + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal });
 const data: unknown = await res.json().catch(() => null);
 if (!res.ok) {
  const e = object(data) ? data : {};
  const message = res.status === 413 ? 'HTTP 413: the JSON request exceeds the API 1 MiB body limit (including the report wrapper). No retry was sent.' : res.status === 401 ? 'Sign-in required (401). Open Live access sign-in, complete the browser prompt, return and refresh status before deliberately trying again.' : typeof e.message === 'string' ? e.message : typeof e.reason === 'string' ? e.reason : `Request failed: HTTP ${res.status}.`;
  throw new ApiError(typeof e.code === 'string' ? e.code : `HTTP_${res.status}`, message, res.status);
 }
 return data;
}
const record = async (path: string, body: unknown | undefined, signal?: AbortSignal) => parseLayoutReport(await request(path, body, signal));
export const createLayoutInvestigation = (input: LayoutInput, signal?: AbortSignal) => record('', input, signal);
export const getLayoutInvestigation = (id: string, signal?: AbortSignal) => record('/' + encodeURIComponent(id), undefined, signal);
export const approveLayoutInvestigation = (id: string, approval: LayoutApproval, signal?: AbortSignal) => record('/' + encodeURIComponent(id) + '/approve', { approval }, signal);
export const cancelLayoutInvestigation = (id: string, signal?: AbortSignal) => record('/' + encodeURIComponent(id) + '/cancel', {}, signal);
export const getLayoutReport = (id: string, signal?: AbortSignal) => record('/' + encodeURIComponent(id) + '/report', undefined, signal);
export async function verifyLayoutReport(report: LayoutReport, signal?: AbortSignal) {
 const v = await request('/verify', { report }, signal);
 if (!object(v) || typeof v.ok !== 'boolean' || !Array.isArray(v.mismatches) || v.mismatches.some(x => typeof x !== 'string')) throw new Error('Malformed verification response');
 return v as {ok: boolean; mismatches: string[]};
}
