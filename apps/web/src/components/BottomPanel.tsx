import {
  improvementPercent,
  methodLabelFor,
  rankCandidates,
  type CandidateResult,
  type Scenario,
} from "@layoutlab/core";
import { buildRelocationRows } from "../lib/planner";
import type { StubRunState } from "../App";

export type ComparisonBudgets = {
  heuristic: { evaluationsUsed: number; evaluationsBudget: number };
  generated: { proposalsUsed: number; maxProposals: number; extra: string };
};

function travelOf(c: CandidateResult | null | undefined): string {
  if (!c || !c.valid || c.weightedTravelMm === null) return "n/a";
  return `${c.weightedTravelMm} mm`;
}

export function BottomPanel(props: {
  baselineResult: CandidateResult | null;
  stubRun: StubRunState;
  scenario: Scenario | null;
  selectedCandidate: string | null;
  onSelect: (name: string) => void;
  onApply: (name: string) => void;
  providerLabel?: string;
  methodLabels?: Record<string, string>;
  budgets?: ComparisonBudgets;
}): React.JSX.Element {
  const { baselineResult, stubRun, scenario, selectedCandidate, onSelect, onApply } = props;
  const providerLabel = props.providerLabel ?? "stub";
  const labelOf = (name: string): string => props.methodLabels?.[name] ?? methodLabelFor(name);
  const candidates: CandidateResult[] = stubRun.proposals
    .filter((p) => p.candidate !== null)
    .map((p) => p.candidate as CandidateResult);
  const shown = selectedCandidate === "baseline"
    ? baselineResult
    : (candidates.find((c) => c.name === selectedCandidate) ?? null);
  const baselineMapping = stubRun.baseline?.assignments ?? scenario?.assignments ?? [];
  const rows =
    scenario && shown && shown.name !== "baseline"
      ? buildRelocationRows(baselineMapping, shown.assignment, scenario, (pid) => {
        const entry = stubRun.proposals.find((p) => p.name === shown.name);
        return entry ? `${shown.name === "heuristic" ? "heuristic" : providerLabel}: ${entry.rationale.slice(0, 90)}` : `move ${pid}`;
      })
      : [];

  // Attribution convention (brief comparison): Meta first is the actual
  // attempt 1 (N/A when invalid, never first-valid substitution); Meta
  // feedback-selected is the best valid META proposal among all actual
  // attempts with its winning iteration (N/A when none). The overall selected
  // assignment is separate and spans baseline+heuristic+Meta, so a retained
  // baseline or heuristic win is never credited to Meta. Stub runs show the
  // stub best instead of Meta rows.
  const heuristic = candidates.find((c) => c.name === "heuristic") ?? null;
  const metaFirst = candidates.find((c) => c.name === "proposal-1") ?? null;
  const metaSelected = rankCandidates(candidates.filter((c) => /^proposal-\d+$/.test(c.name))).find(
    (c) => c.valid,
  ) ?? null;
  const stubBest = rankCandidates(candidates.filter((c) => /^stub-\d+$/.test(c.name))).find(
    (c) => c.valid,
  ) ?? null;
  const hasMeta = metaFirst !== null || metaSelected !== null;
  const budgets = props.budgets;

  return (
    <div className="panel" data-testid="bottom-panel">
      <h2>Comparison &amp; relocations</h2>
      {!baselineResult && <p>Evaluate the current assignment to begin comparison.</p>}
      {baselineResult && (
        <>
          <div style={{ overflowX: "auto" }}>
          <table data-testid="comparison-table">
            <thead>
              <tr><th>Candidate</th><th>Method</th><th>Valid</th><th>Weighted mm</th><th>Mean mm</th><th>Reloc</th><th>Δ vs baseline</th><th>Select</th></tr>
            </thead>
            <tbody>
              <tr className={selectedCandidate === "baseline" ? "selected" : ""} data-testid="compare-baseline">
                <td className="mono">baseline (current)</td>
                <td className="mono">{labelOf("baseline")}</td>
                <td>{baselineResult.valid ? "✓ valid" : `× ${baselineResult.errors[0]?.code ?? "invalid"}`}</td>
                <td>{baselineResult.weightedTravelMm ?? "n/a"}</td>
                <td>{baselineResult.workload?.meanOrderDistanceMm?.toFixed(1) ?? "n/a"}</td>
                <td>{baselineResult.relocationCount}</td>
                <td>—</td>
                <td><button type="button" onClick={() => onSelect("baseline")} data-testid="select-baseline">Show</button></td>
              </tr>
              {candidates.map((c) => {
                const pct = baselineResult ? improvementPercent(baselineResult, c) : null;
                return (
                  <tr
                    key={c.name}
                    className={`${selectedCandidate === c.name ? "selected" : ""} ${c.valid ? "" : "invalid-row"}`.trim()}
                    data-testid={`compare-${c.name}`}
                  >
                    <td className="mono">{c.name}</td>
                    <td className="mono">{labelOf(c.name)}</td>
                    <td>{c.valid ? "✓ valid" : `× ${c.errors[0]?.code ?? "invalid"}`}</td>
                    <td>{c.weightedTravelMm ?? "n/a"}</td>
                    <td>{c.workload?.meanOrderDistanceMm?.toFixed(1) ?? "n/a"}</td>
                    <td>{c.relocationCount}</td>
                    <td>{pct === null ? "N/A" : `${pct.toFixed(2)}%`}</td>
                    <td>
                      <button type="button" onClick={() => onSelect(c.name)} data-testid={`select-${c.name}`}>Show</button>{" "}
                      <button
                        type="button"
                        disabled={!c.valid || stubRun.status !== "completed"}
                        title={stubRun.status !== "completed" ? "Only completed runs can apply" : c.valid ? `Apply ${c.name}` : "Invalid results cannot apply"}
                        onClick={() => onApply(c.name)}
                        data-testid={`apply-${c.name}`}
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {budgets && (
            <p data-testid="candidate-budgets">
              Budgets: heuristic {budgets.heuristic.evaluationsUsed}/{budgets.heuristic.evaluationsBudget} candidate
              evaluations · {providerLabel} {budgets.generated.proposalsUsed}/{budgets.generated.maxProposals} proposals
              ({budgets.generated.extra}). Budgets differ across methods — not an equal-compute comparison.
            </p>
          )}
          {(heuristic || hasMeta || stubBest) && (
            <p data-testid="method-summary">
              Current: {travelOf(baselineResult)}
              {heuristic && <> · Heuristic: {travelOf(heuristic)} ({heuristic.name})</>}
              {hasMeta && (
                <>
                  {" "}· Meta first: {travelOf(metaFirst)} (proposal-1)
                  {" "}· Meta feedback-selected: {travelOf(metaSelected)}
                  {metaSelected ? ` (best valid Meta proposal, ${metaSelected.name})` : ""}
                </>
              )}
              {!hasMeta && stubBest && <> · Stub best: {travelOf(stubBest)} ({stubBest.name})</>}
              {stubRun.bestName && (
                <> · <strong>Overall selected: {stubRun.bestName} ({labelOf(stubRun.bestName)})</strong></>
              )}
            </p>
          )}
          <h3>Relocation list {shown && shown.name !== "baseline" ? `for ${shown.name}` : ""}</h3>
          {!shown || shown.name === "baseline" ? (
            <p>Select a {providerLabel} candidate to inspect its explicit relocation table.</p>
          ) : rows.length === 0 ? (
            <p>No relocations (candidate retains the baseline).</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table data-testid="relocation-table">
              <thead>
                <tr><th>Product</th><th>Current location</th><th>Proposed location</th><th>Compatibility</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.productId} data-testid={`reloc-${r.productId}`}>
                    <td className="mono">{r.productId}</td>
                    <td className="mono">{r.fromId}</td>
                    <td className="mono">{r.toId}</td>
                    <td>{r.compatible ? "✓ compatible" : `× ${r.compatReason}`}</td>
                    <td>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
