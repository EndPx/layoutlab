import { improvementPercent, type CandidateResult, type Scenario } from "@layoutlab/core";
import { buildRelocationRows } from "../lib/planner";
import type { StubRunState } from "../App";

export function BottomPanel(props: {
  baselineResult: CandidateResult | null;
  stubRun: StubRunState;
  scenario: Scenario | null;
  selectedCandidate: string | null;
  onSelect: (name: string) => void;
  onApply: (name: string) => void;
  providerLabel?: string;
}): React.JSX.Element {
  const { baselineResult, stubRun, scenario, selectedCandidate, onSelect, onApply } = props;
  const providerLabel = props.providerLabel ?? "stub";
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
        return entry ? `${providerLabel}: ${entry.rationale.slice(0, 90)}` : `move ${pid}`;
      })
      : [];

  return (
    <div className="panel" data-testid="bottom-panel">
      <h2>Comparison &amp; relocations</h2>
      {!baselineResult && <p>Evaluate the current assignment to begin comparison.</p>}
      {baselineResult && (
        <>
          <div style={{ overflowX: "auto" }}>
          <table data-testid="comparison-table">
            <thead>
              <tr><th>Candidate</th><th>Valid</th><th>Weighted mm</th><th>Mean mm</th><th>Reloc</th><th>Δ vs baseline</th><th>Select</th></tr>
            </thead>
            <tbody>
              <tr className={selectedCandidate === "baseline" ? "selected" : ""} data-testid="compare-baseline">
                <td className="mono">baseline (current)</td>
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
