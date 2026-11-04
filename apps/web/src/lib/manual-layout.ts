import type { LayoutComparisonResult, RackLayoutComparison } from '@layoutlab/simulation';
export type ManualLayoutReport = LayoutComparisonResult | RackLayoutComparison;
/** Presentation only; downloads always retain the original discriminated envelope. */
export function manualReportView(raw: ManualLayoutReport) {
  if (raw.schema === 'layoutlab.rack-comparison/1') return {
    raw, improvement: raw.improvement, baselineMetrics: raw.baselineRun?.metrics ?? null, candidateMetrics: raw.candidateRun?.metrics ?? null,
    delta: raw.delta, candidateValid: raw.validation.candidateValid, evaluationScope: raw.evaluationScope,
    explanation: `Rack translation: ${raw.measurement}. Same frozen engine inputs; ${raw.evaluationScope.truncated ? 'truncated evaluation' : 'declared evaluation scope'}.`,
    parentIdentity: { scenarioContentSha256: raw.parentHash }, candidateIdentity: null,
  };
  return { raw, improvement: raw.improvement, baselineMetrics: raw.baselineMetrics, candidateMetrics: raw.candidateMetrics, delta: raw.delta, candidateValid: raw.candidateValid, evaluationScope: raw.evaluationScope, explanation: raw.explanation, parentIdentity: raw.parentIdentity, candidateIdentity: raw.candidateIdentity };
}
export type ManualReportView = ReturnType<typeof manualReportView>;
