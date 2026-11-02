import {
  improvementPercent,
  methodLabelFor,
  rankCandidates,
  type CandidateResult,
  type Scenario,
} from "@layoutlab/core";
import { buildRelocationRows } from "../lib/planner";
import { formatImprovement, formatMeters } from "../lib/format";
import type { StubRunState } from "../App";

export type ComparisonBudgets = {
  heuristic: { evaluationsUsed: number; evaluationsBudget: number };
  generated: { proposalsUsed: number; maxProposals: number; extra: string };
};

function travelOf(c: CandidateResult | null | undefined): string {
  if (!c || !c.valid || c.weightedTravelMm === null) return "N/A";
  return formatMeters(c.weightedTravelMm);
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
  stale: boolean;
  staleReason: string | null;
  frozen: boolean;
  frozenBaseline: CandidateResult | null;
}): React.JSX.Element {
  const { baselineResult, stubRun, scenario, selectedCandidate, onSelect, onApply, stale, staleReason, frozen, frozenBaseline } = props;
  // The comparison baseline stays frozen with its run: candidate percentages
  // and the relocation origin never mix a historical candidate with the
  // mutable edited scene. The Current frame elsewhere still uses live state.
  const base = frozen && frozenBaseline ? frozenBaseline : baselineResult;
  const baseLabel = frozen ? (stale ? "Run baseline (historical)" : "Run baseline") : "Current assignment";
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
  const sampleMode = scenario?.provenance.category === "synthetic";
  const shownEntry = shown && shown.name !== "baseline"
    ? stubRun.proposals.find((p) => p.name === shown.name) ?? null
    : null;
  const selectedApplicable =
    shown !== null && shown.name !== "baseline" && shown.valid &&
    stubRun.status === "completed" && !stale;
  const applyTitle = (c: CandidateResult): string =>
    stubRun.status !== "completed"
      ? "Only completed runs can apply"
      : stale
        ? (staleReason ?? "Run is stale; re-run before applying")
        : c.valid ? `Apply ${c.name}` : "Invalid results cannot apply";

  return (
    <div className="panel" data-testid="bottom-panel">
      <h2>Compare alternatives <span className="h2sub">Same orders, constraints, and routing policy.</span></h2>
      {stale && staleReason && (
        <p className="notice" data-testid="stale-notice">
          <span className="badge stale">STALE</span> {staleReason}
        </p>
      )}
      {!base && <p>Evaluate the current assignment to begin comparison.</p>}
      {base && (
        <>
          <div className="table-scroll">
          <table data-testid="comparison-table">
            <thead>
              <tr><th>Method</th><th>Constraints</th><th>Picking travel</th><th>Relocations</th><th>Improvement</th><th>Select</th></tr>
            </thead>
            <tbody>
              <tr className={selectedCandidate === "baseline" ? "selected" : ""} data-testid="compare-baseline" aria-selected={selectedCandidate === "baseline"}>
                <td className="mono">{baseLabel}</td>
                <td>{base.valid ? "✓ valid" : `× ${base.errors[0]?.code ?? "invalid"}`}</td>
                <td title={base.weightedTravelMm == null ? "N/A" : `${base.weightedTravelMm} mm`}>{formatMeters(base.weightedTravelMm)}</td>
                <td>{base.relocationCount}</td>
                <td>—</td>
                <td>
                  <button
                    type="button"
                    onClick={() => onSelect("baseline")}
                    disabled={frozen && stale}
                    title={frozen && stale ? "Historical baseline is not the live scene; showing it would mix frames" : "Show current assignment"}
                    data-testid="select-baseline"
                  >
                    Show
                  </button>
                </td>
              </tr>
              {candidates.map((c) => {
                const pct = base ? improvementPercent(base, c) : null;
                const method = labelOf(c.name);
                return (
                  <tr
                    key={c.name}
                    className={`${selectedCandidate === c.name ? "selected" : ""} ${c.valid ? "" : "invalid-row"}`.trim()}
                    data-testid={`compare-${c.name}`}
                    aria-selected={selectedCandidate === c.name}
                  >
                    <td className="mono">
                      {c.name} <span className="mono dim">({method})</span>
                      {selectedCandidate === c.name && <span className="badge selected">Selected</span>}
                      {sampleMode && /^stub-\d+$/.test(c.name) && <span className="badge sample">Sample</span>}
                    </td>
                    <td>{c.valid ? "✓ valid" : `× ${c.errors[0]?.code ?? "invalid"}`}</td>
                    <td title={c.weightedTravelMm == null ? "N/A" : `${c.weightedTravelMm} mm`}>{formatMeters(c.weightedTravelMm)}</td>
                    <td>{c.relocationCount}</td>
                    <td>{pct === null ? "N/A" : formatImprovement(pct)}</td>
                    <td>
                      <button type="button" onClick={() => onSelect(c.name)} data-testid={`select-${c.name}`}>Show</button>{" "}
                      <button
                        type="button"
                        disabled={!c.valid || stubRun.status !== "completed" || stale}
                        title={applyTitle(c)}
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
          {(heuristic || hasMeta || stubBest) && (
            <p data-testid="method-summary">
              {frozen ? "Run baseline" : "Current"}: {travelOf(base)}
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
          <div className="bottom-row">
          <details className="run-details" data-testid="run-details">
            <summary>
              Run details: compute budgets · {shown && shown.name !== "baseline" ? `relocations for ${shown.name}` : "relocation list"}
            </summary>
            {budgets && (
              <p data-testid="candidate-budgets">
                Budgets: heuristic {budgets.heuristic.evaluationsUsed}/{budgets.heuristic.evaluationsBudget} candidate
                evaluations · {providerLabel} {budgets.generated.proposalsUsed}/{budgets.generated.maxProposals} proposals
                ({budgets.generated.extra}). Budgets differ across methods — not an equal-compute comparison.
              </p>
            )}
            <h3>Relocation list {shown && shown.name !== "baseline" ? `for ${shown.name}` : ""}</h3>
            {!shown || shown.name === "baseline" ? (
              <p>Select a {providerLabel} candidate to inspect its explicit relocation table.</p>
            ) : rows.length === 0 ? (
              <p>No relocations (candidate retains the baseline).</p>
            ) : (
              <div className="table-scroll">
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
          </details>
          <p className="actions-end bottom-apply">
            <button
              type="button"
              className="primary"
              disabled={!selectedApplicable}
              title={
                !shown || shown.name === "baseline"
                  ? "Select a candidate to apply"
                  : !shown.valid
                    ? "Invalid results cannot apply"
                    : stubRun.status !== "completed"
                      ? "Only completed runs can apply"
                      : stale
                        ? (staleReason ?? "Run is stale; re-run before applying")
                        : `Apply ${shown.name}`
              }
              onClick={() => shown && shown.name !== "baseline" && onApply(shown.name)}
              data-testid="apply-selected"
            >
              ✓ Apply selected assignment{shownEntry ? ` (${shownEntry.name})` : ""}
            </button>
          </p>
          </div>
        </>
      )}
    </div>
  );
}
