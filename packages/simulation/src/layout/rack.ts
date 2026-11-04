import { parseOperationsScenario, type OperationsScenario } from '../schema.js';
import { createOperationsController, parseOperationsExecutionConfig, type OperationsExecutionConfig } from '../operations.js';
import { parseLayoutProposal, parseApprovedConstraints, resolveTargetCentre, validateProposalAgainstBaseline, validateResolvedTransform, type PackingStationTranslationProposal } from './contract.js';
import { geometryAccessIssuesFor } from './validator.js';
import { canonicalStringify, contentSha256 } from './hash.js';
import { runOne, scopeFor, classifyImprovement, type LayoutDelta } from './compare.js';
import { SIMULATION_VERSION, OPERATIONS_SCHEMA_VERSION, OPERATIONS_ENGINE_VERSION } from '../version.js';
import { diffPaths } from './attachments.js';

export type RackTranslationProposal = Omit<PackingStationTranslationProposal, 'kind'> & { kind: 'RACK_TRANSLATION' };
export type RackAttachment = {
  rackId: string;
  rack: OperationsScenario['geometry']['racks'][number];
  slots: OperationsScenario['locations'];
};
export function buildRackAttachmentMap(scenario: OperationsScenario): Map<string, RackAttachment> {
  const s = parseOperationsScenario(structuredClone(scenario));
  return new Map(s.geometry.racks.map(r => [r.id, { rackId: r.id, rack: structuredClone(r), slots: structuredClone(s.locations.filter(l => l.rackId === r.id)) }]));
}
function stationShape(proposal: RackTranslationProposal): PackingStationTranslationProposal {
  return { ...proposal, kind: 'PACKING_STATION_TRANSLATION' };
}
function parseRackProposal(raw: unknown): RackTranslationProposal {
  if (typeof raw !== 'object' || raw === null || (raw as RackTranslationProposal).kind !== 'RACK_TRANSLATION') throw new Error('Expected RACK_TRANSLATION');
  const parsed = parseLayoutProposal({ ...raw, kind: 'PACKING_STATION_TRANSLATION' });
  if (!parsed.ok || !parsed.supported) throw new Error('Invalid rack proposal');
  return { ...parsed.proposal, kind: 'RACK_TRANSLATION' };
}
export function applyRackTranslation(baselineRaw: OperationsScenario, raw: RackTranslationProposal, attachments: Map<string, RackAttachment>) {
  const baseline = parseOperationsScenario(structuredClone(baselineRaw));
  const proposal = parseRackProposal(raw);
  const attachment = structuredClone(attachments.get(proposal.entityId));
  const expected = buildRackAttachmentMap(baseline).get(proposal.entityId);
  if (!attachment || !expected || canonicalStringify(attachment) !== canonicalStringify(expected)) throw new Error(`OWNERSHIP_MISMATCH: ${proposal.entityId} rack/owned slots differ from canonical exact rackId map`);
  const { centreMm, deltaMm } = resolveTargetCentre(stationShape(proposal), attachment.rack.positionMm);
  const candidate = structuredClone(baseline);
  const rack = candidate.geometry.racks.find(r => r.id === proposal.entityId)!;
  rack.positionMm = centreMm;
  for (const slot of candidate.locations.filter(l => l.rackId === proposal.entityId)) {
    slot.storageAnchorMm.x += deltaMm.dx;
    slot.storageAnchorMm.z += deltaMm.dz;
    slot.approachPointMm.x += deltaMm.dx;
    slot.approachPointMm.z += deltaMm.dz;
  }
  const scenario = parseOperationsScenario(candidate);
  return { scenario, transform: { entityId: proposal.entityId, fromCentreMm: attachment.rack.positionMm, toCentreMm: centreMm, deltaMm }, attachmentsBefore: structuredClone(attachment), viewerPlacement: buildRackAttachmentMap(scenario).get(proposal.entityId)!, changedFields: diffPaths(baseline, scenario) };
}
export type RackComparisonInput = { baselineScenario: OperationsScenario; proposal: RackTranslationProposal; attachments: Map<string, RackAttachment>; approvedConstraints: unknown; executionConfig: OperationsExecutionConfig; safetyCeilingMs: number };
export async function runRackLayoutComparison(input: RackComparisonInput) {
  input = structuredClone(input);
  const baseline = parseOperationsScenario(structuredClone(input.baselineScenario));
  const proposal = parseRackProposal(input.proposal);
  const approved = parseApprovedConstraints(input.approvedConstraints);
  if (!approved.ok) throw new Error('Invalid approved constraints');
  const config = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
  if (!Number.isSafeInteger(input.safetyCeilingMs) || input.safetyCeilingMs <= 0) throw new Error('Invalid safety ceiling');
  const bundle = applyRackTranslation(baseline, proposal, input.attachments);
  const structural = await validateProposalAgainstBaseline(stationShape(proposal), baseline, new Set(input.attachments.keys()), approved.constraints);
  structural.push(...validateResolvedTransform(stationShape(proposal), bundle.attachmentsBefore.rack.positionMm, approved.constraints).issues);
  const base = geometryAccessIssuesFor(baseline);
  const candidate = geometryAccessIssuesFor(bundle.scenario);
  const admit = (scenario: OperationsScenario, issues: typeof structural) => {
    try { createOperationsController({ scenario, executionConfig: config }); } catch (e) { issues.push({ code: 'ENGINE_ADMISSION_FAILED', severity: 'error', entityId: proposal.entityId, message: String(e) }); }
  };
  admit(baseline, base.issues);
  admit(bundle.scenario, candidate.issues);
  const candidateValid = structural.length === 0 && candidate.issues.length === 0;
  const baselineRun = base.issues.length ? null : runOne(baseline, config, input.safetyCeilingMs);
  const candidateRun = candidateValid ? runOne(bundle.scenario, config, input.safetyCeilingMs) : null;
  const delta: LayoutDelta | null = baselineRun && candidateRun ? {
    shipped: candidateRun.metrics.shipped - baselineRun.metrics.shipped,
    backlog: candidateRun.metrics.backlog - baselineRun.metrics.backlog,
    stageBacklog: candidateRun.metrics.stageBacklog - baselineRun.metrics.stageBacklog,
    totalWaitMs: candidateRun.metrics.totalWaitMs - baselineRun.metrics.totalWaitMs,
    makespanMs: candidateRun.metrics.makespanMs !== null && baselineRun.metrics.makespanMs !== null ? candidateRun.metrics.makespanMs - baselineRun.metrics.makespanMs : null,
    lastShippedAtMs: candidateRun.metrics.lastShippedAtMs !== null && baselineRun.metrics.lastShippedAtMs !== null ? candidateRun.metrics.lastShippedAtMs - baselineRun.metrics.lastShippedAtMs : null,
    stopClockMs: candidateRun.metrics.stopClockMs - baselineRun.metrics.stopClockMs,
  } : null;
  return { versions: { simulation: SIMULATION_VERSION, operationsSchema: OPERATIONS_SCHEMA_VERSION, operationsEngine: OPERATIONS_ENGINE_VERSION }, evaluationScope: scopeFor(baseline, input.safetyCeilingMs, baselineRun?.termination ?? null, candidateRun?.termination ?? null), delta, improvement: baselineRun && candidateRun ? classifyImprovement(baselineRun.metrics, candidateRun.metrics) : 'not-measured', schema: 'layoutlab.rack-comparison/1' as const, commonInputs: { scenario: baseline, executionConfig: config }, proposal, approvedConstraints: approved.constraints, attachments: [...input.attachments.values()], safetyCeilingMs: input.safetyCeilingMs, parentHash: await contentSha256(baseline), bundle, validation: { baselineValid: base.issues.length === 0, candidateValid, structural, baseline: base, candidate }, measurement: !candidateValid ? 'not-measured' : base.issues.length ? 'candidate-only-repaired' : 'measured', baselineRun, candidateRun };
}
export type RackLayoutComparison = Awaited<ReturnType<typeof runRackLayoutComparison>>;
export async function verifyRackLayoutComparison(report: RackLayoutComparison): Promise<boolean> {
  try {
    if (report.schema !== 'layoutlab.rack-comparison/1' || canonicalStringify(report.versions) !== canonicalStringify({ simulation: SIMULATION_VERSION, operationsSchema: OPERATIONS_SCHEMA_VERSION, operationsEngine: OPERATIONS_ENGINE_VERSION })) return false;
    report = structuredClone(report);
    const result = await runRackLayoutComparison({ baselineScenario: report.commonInputs.scenario, proposal: report.proposal, approvedConstraints: report.approvedConstraints, attachments: new Map(report.attachments.map(a => [a.rackId, a])), executionConfig: report.commonInputs.executionConfig, safetyCeilingMs: report.safetyCeilingMs });
    return canonicalStringify(result) === canonicalStringify(report);
  } catch { return false; }
}
