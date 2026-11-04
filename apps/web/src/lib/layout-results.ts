import { applyPackingStationTranslation, buildStationAttachmentMap, canonicalStringify, parseApprovedConstraints, parseLayoutProposal, validateLayoutCandidate, verifyLayoutComparison, type LayoutComparisonResult, type LayoutValidation } from '@layoutlab/simulation';
import { buildLayoutScene, resolveLayoutAttachments } from './operations';
import type { LayoutReport } from './layout-investigations';
export type LayoutProposalRow = { candidateId: string; hypothesis: string; requestIndex: number; proposal: unknown; evaluation: { validation: LayoutValidation; regionIssues: string[]; comparison: LayoutComparisonResult | null } };
export function layoutRows(report: LayoutReport): LayoutProposalRow[] {
 const rows = report.proposals;
 if (!Array.isArray(rows)) return [];
 const ids = new Set<string>();
 for (const row of rows) {
  if (!row || typeof row !== 'object' || typeof row.candidateId !== 'string' || typeof row.hypothesis !== 'string' || !row.evaluation || !row.evaluation.validation || typeof row.evaluation.validation.ok !== 'boolean' || !Array.isArray(row.evaluation.validation.issues) || !Array.isArray(row.evaluation.regionIssues)) throw new Error('Malformed proposal evidence');
  if(ids.has(row.candidateId) || row.evaluation.regionIssues.some((x:unknown)=>typeof x!=='string') || row.evaluation.validation.issues.some((x:unknown)=>!x||typeof x!=='object'||typeof (x as {message?:unknown}).message!=='string'||typeof (x as {code?:unknown}).code!=='string')) throw new Error('Malformed or duplicate proposal evidence');
  ids.add(row.candidateId);
  const c=row.evaluation.comparison;
  if(c!==null && (!c||typeof c!=='object'||typeof c.candidateValid!=='boolean'||typeof c.explanation!=='string'||!['improved','worse','mixed','no-improvement','not-measured'].includes(c.improvement)||!c.evaluationScope||typeof c.evaluationScope.truncated!=='boolean')) throw new Error('Malformed measured comparison');
 }
 return rows as LayoutProposalRow[];
}
export function layoutReportIdentity(report: LayoutReport): string { return canonicalStringify(report); }
// Called only after full-report HTTP verification; local production validation
// independently derives the rigid bundle and checks its measured comparison.
export async function resolveMeasuredLayout(report: LayoutReport, candidateId: string) {
 const row = layoutRows(report).find(r => r.candidateId === candidateId);
 if (!row || !row.evaluation.validation.ok || row.evaluation.regionIssues.length || !row.evaluation.comparison?.candidateValid || !report.approved) throw new Error('Candidate is invalid or has no successful measured comparison.');
 const parsed = parseLayoutProposal(row.proposal), authority = parseApprovedConstraints(report.approved.constraints);
 if (!parsed.ok || !parsed.supported || !authority.ok) throw new Error('Unsupported or malformed candidate/authority.');
 const comparison = row.evaluation.comparison;
 if (canonicalStringify(comparison.commonInputs) !== canonicalStringify({scenario:report.input.scenario,executionConfig:report.input.executionConfig}) || canonicalStringify(comparison.approvedConstraints) !== canonicalStringify(authority.constraints) || canonicalStringify(comparison.proposal) !== canonicalStringify(row.proposal)) throw new Error('Candidate comparison is not bound to the approved report inputs.');
 const attachments = buildStationAttachmentMap(report.input.scenario, resolveLayoutAttachments(report.input.scenario));
 const validation = await validateLayoutCandidate({baselineScenario:report.input.scenario, executionConfig:report.input.executionConfig, proposal:parsed.proposal, approvedConstraints:authority.constraints, attachments});
 if (!validation.ok) throw new Error(validation.issues.map(i => i.message).join('; '));
 const verified = await verifyLayoutComparison(comparison);
 if (!verified.ok) throw new Error('Local comparison mismatch: '+verified.mismatches.join('; '));
 const bundle = applyPackingStationTranslation(report.input.scenario, parsed.proposal, attachments);
 if (canonicalStringify(bundle.scenario) !== canonicalStringify(comparison.candidateScenario)) throw new Error('Resolved scene differs from measured candidate scenario.');
 return {scene:buildLayoutScene(bundle), comparison};
}
