import { parseOperationsScenario, type OperationsScenario } from '../schema.js';
import { createOperationsController, parseOperationsExecutionConfig, type OperationsExecutionConfig } from '../operations.js';
import { parseLayoutProposal, parseApprovedConstraints, resolveTargetCentre, validateProposalAgainstBaseline, validateResolvedTransform, type PackingStationTranslationProposal } from './contract.js';
import { geometryAccessIssuesFor } from './validator.js';
import { canonicalStringify, contentSha256 } from './hash.js';
import { runOne, scopeFor, classifyImprovement, type LayoutDelta } from './compare.js';
import { SIMULATION_VERSION, OPERATIONS_SCHEMA_VERSION, OPERATIONS_ENGINE_VERSION } from '../version.js';
import { discsConflict } from '../traffic.js';
import { footprintRadiusMm } from '../navigation.js';
import { diffPaths } from './attachments.js';

export type AgentInitialPlacementProposal = Omit<PackingStationTranslationProposal, 'kind'> & { kind: 'AGENT_INITIAL_PLACEMENT' };
function stationShape(proposal: AgentInitialPlacementProposal): PackingStationTranslationProposal {
  return { ...proposal, kind: 'PACKING_STATION_TRANSLATION' };
}
function parseAgentProposal(raw: unknown): AgentInitialPlacementProposal {
  if (typeof raw !== 'object' || raw === null || (raw as AgentInitialPlacementProposal).kind !== 'AGENT_INITIAL_PLACEMENT') throw new Error('Expected AGENT_INITIAL_PLACEMENT');
  const parsed = parseLayoutProposal({ ...raw, kind: 'PACKING_STATION_TRANSLATION' });
  if (!parsed.ok || !parsed.supported) throw new Error('Invalid agent placement proposal');
  return { ...parsed.proposal, kind: 'AGENT_INITIAL_PLACEMENT' };
}
export function applyAgentInitialPlacement(baselineRaw: OperationsScenario, raw: AgentInitialPlacementProposal) {
  const baseline = parseOperationsScenario(structuredClone(baselineRaw));
  const proposal = parseAgentProposal(raw);
  const unit = baseline.mobileUnits.find(u => u.id === proposal.entityId);
  if (!unit) throw new Error('Unknown mobile unit');
  const { centreMm, deltaMm } = resolveTargetCentre(stationShape(proposal), unit.parkingSlotMm);
  const candidate = structuredClone(baseline);
  candidate.mobileUnits.find(u => u.id === unit.id)!.parkingSlotMm = centreMm;
  return { scenario: candidate, transform: { entityId: unit.id, fromCentreMm: unit.parkingSlotMm, toCentreMm: { ...centreMm }, deltaMm: { ...deltaMm } }, changedFields: diffPaths(baseline, candidate) };
}
export type AgentPlacementComparisonInput = { baselineScenario: OperationsScenario; proposal: AgentInitialPlacementProposal; approvedConstraints: unknown; executionConfig: OperationsExecutionConfig; safetyCeilingMs: number };
export async function runAgentPlacementComparison(input: AgentPlacementComparisonInput) {
  input = structuredClone(input);
  const baseline = parseOperationsScenario(structuredClone(input.baselineScenario));
  const proposal = parseAgentProposal(input.proposal);
  const approved = parseApprovedConstraints(input.approvedConstraints);
  if (!approved.ok) throw new Error('Invalid approved constraints');
  const config = parseOperationsExecutionConfig(structuredClone(input.executionConfig));
  if (!Number.isSafeInteger(input.safetyCeilingMs) || input.safetyCeilingMs <= 0) throw new Error('Invalid safety ceiling');
  const bundle = applyAgentInitialPlacement(baseline, proposal);
  const structural = await validateProposalAgainstBaseline(stationShape(proposal), baseline, new Set(baseline.mobileUnits.map(u => u.id)), approved.constraints);
  structural.push(...validateResolvedTransform(stationShape(proposal), bundle.transform.fromCentreMm, approved.constraints).issues);
  const base = geometryAccessIssuesFor(baseline);
  const candidate = geometryAccessIssuesFor(bundle.scenario);
  const admit = (scenario: OperationsScenario, issues: typeof structural) => {
    for (let i = 0; i < scenario.mobileUnits.length; i++) for (let j = i + 1; j < scenario.mobileUnits.length; j++) {
      const a = scenario.mobileUnits[i]!, b = scenario.mobileUnits[j]!;
      if (discsConflict(Math.hypot(a.parkingSlotMm.x - b.parkingSlotMm.x, a.parkingSlotMm.z - b.parkingSlotMm.z), footprintRadiusMm(a.footprintMm), footprintRadiusMm(b.footprintMm)))
        issues.push({ code: 'OVERLAP', severity: 'error', entityId: a.id, relatedEntityId: b.id, message: 'Initial occupancy discs collide' });
    }
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
  return { versions: { simulation: SIMULATION_VERSION, operationsSchema: OPERATIONS_SCHEMA_VERSION, operationsEngine: OPERATIONS_ENGINE_VERSION }, evaluationScope: scopeFor(baseline, input.safetyCeilingMs, baselineRun?.termination ?? null, candidateRun?.termination ?? null), delta, improvement: baselineRun && candidateRun ? classifyImprovement(baselineRun.metrics, candidateRun.metrics) : 'not-measured', schema: 'layoutlab.agent-placement-comparison/1' as const, commonInputs: { scenario: baseline, executionConfig: config }, proposal, approvedConstraints: approved.constraints, safetyCeilingMs: input.safetyCeilingMs, parentHash: await contentSha256(baseline), bundle, validation: { baselineValid: base.issues.length === 0, candidateValid, structural, baseline: base, candidate }, measurement: !candidateValid ? 'not-measured' : base.issues.length ? 'candidate-only-repaired' : 'measured', baselineRun, candidateRun };
}
export type AgentPlacementComparison = Awaited<ReturnType<typeof runAgentPlacementComparison>>;
export async function verifyAgentPlacementComparison(report: AgentPlacementComparison): Promise<boolean> {
  try {
    if (report.schema !== 'layoutlab.agent-placement-comparison/1' || canonicalStringify(report.versions) !== canonicalStringify({ simulation: SIMULATION_VERSION, operationsSchema: OPERATIONS_SCHEMA_VERSION, operationsEngine: OPERATIONS_ENGINE_VERSION })) return false;
    report = structuredClone(report);
    const result = await runAgentPlacementComparison({ baselineScenario: report.commonInputs.scenario, proposal: report.proposal, approvedConstraints: report.approvedConstraints, executionConfig: report.commonInputs.executionConfig, safetyCeilingMs: report.safetyCeilingMs });
    return canonicalStringify(result) === canonicalStringify(report);
  } catch { return false; }
}
