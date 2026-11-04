import type { LayoutComparisonResult, RackLayoutComparison, AgentPlacementComparison, RackRotationComparison } from '@layoutlab/simulation';
export type ManualLayoutReport = LayoutComparisonResult | RackLayoutComparison | AgentPlacementComparison | RackRotationComparison;
/** Presentation only; downloads always retain the original discriminated envelope. */
export function manualReportView(raw: ManualLayoutReport) {
  if (raw.schema !== 'layoutlab.layout-comparison/2') return {
    raw, improvement: raw.improvement, baselineMetrics: raw.baselineRun?.metrics ?? null, candidateMetrics: raw.candidateRun?.metrics ?? null,
    delta: raw.delta, candidateValid: raw.validation.candidateValid, evaluationScope: raw.evaluationScope,
    explanation: `${raw.schema === 'layoutlab.agent-placement-comparison/1' ? 'Initial agent parking' : raw.schema === 'layoutlab.rack-rotation-comparison/1' ? 'Rack quarter-turn' : 'Rack translation'}: ${raw.measurement}. Same frozen engine inputs; ${raw.evaluationScope.truncated ? 'truncated evaluation' : 'declared evaluation scope'}.`,
    parentIdentity: { scenarioContentSha256: raw.parentHash }, candidateIdentity: null,
  };
  return { raw, improvement: raw.improvement, baselineMetrics: raw.baselineMetrics, candidateMetrics: raw.candidateMetrics, delta: raw.delta, candidateValid: raw.candidateValid, evaluationScope: raw.evaluationScope, explanation: raw.explanation, parentIdentity: raw.parentIdentity, candidateIdentity: raw.candidateIdentity };
}
export type ManualReportView = ReturnType<typeof manualReportView>;
