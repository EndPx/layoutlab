import type { PlanningRequirements, Scenario } from "@layoutlab/core";
import type { StubRunState } from "../App";

export function RightPanel(props: {
  scenario: Scenario | null;
  requirements: PlanningRequirements;
  approved: boolean;
  requirementsError: string | null;
  stubRun: StubRunState;
  onRequirements: (next: PlanningRequirements) => void;
  onApprove: () => void;
  onGenerate: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { scenario, requirements, approved, requirementsError, stubRun, onRequirements, onApprove, onGenerate, onCancel } = props;
  const running = stubRun.status === "running";
  return (
    <div className="panel" data-testid="right-panel">
      <h2>Planning request</h2>
      <p className="notice" data-testid="meta-notice">
        <strong>Stub mode:</strong> no Meta inference. Deterministic placeholder proposals; actual model
        requests = 0.
      </p>
      <label>
        Request (display only; stub does not read it)
        <textarea
          rows={3}
          defaultValue="Reduce picking travel for the loaded orders. Keep locked products fixed and relocate no more than the approved budget."
          readOnly
          data-testid="planning-request"
        />
      </label>
      <h3>Structured requirements (editable)</h3>
      <p data-testid="stub-limitation">
        Limitation: the stub does not interpret natural language. It uses only these structured fields.
      </p>
      <label>
        Max relocated products
        <input
          type="number"
          min={0}
          max={64}
          value={requirements.maxRelocatedProducts}
          data-testid="req-budget"
          onChange={(e) =>
            onRequirements({ ...requirements, maxRelocatedProducts: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </label>
      <fieldset>
        <legend>Locked products</legend>
        {!scenario && <span>No scenario.</span>}
        {scenario?.products.map((p) => (
          <label key={p.id} style={{ display: "inline-block", width: "auto", marginRight: 12 }}>
            <input
              type="checkbox"
              checked={requirements.lockedProductIds.includes(p.id)}
              data-testid={`lock-${p.id}`}
              onChange={(e) => {
                const has = e.target.checked;
                onRequirements({
                  ...requirements,
                  lockedProductIds: has
                    ? [...requirements.lockedProductIds, p.id]
                    : requirements.lockedProductIds.filter((id) => id !== p.id),
                });
              }}
            />{" "}
            <span className="mono">{p.id}</span>
          </label>
        ))}
      </fieldset>
      <p data-testid="approval-state">{approved ? "✓ Requirements approved." : "× Requirements not approved — stub generation is gated."}</p>
      {requirementsError && <p className="error" role="alert" data-testid="requirements-error">{requirementsError}</p>}
      <button type="button" onClick={onApprove} disabled={!scenario} data-testid="btn-approve">
        Approve requirements
      </button>{" "}
      <button
        type="button"
        className="primary"
        onClick={onGenerate}
        disabled={!scenario || !approved || running}
        title={!approved ? "Approve requirements first" : "Generate up to 3 stub proposals"}
        data-testid="btn-generate"
      >
        Generate stub (max 3)
      </button>{" "}
      <button type="button" onClick={onCancel} disabled={!running} data-testid="btn-cancel">
        Cancel run
      </button>
      <p className="statusline" aria-live="polite" data-testid="stub-status">
        {stubRun.status === "idle" ? "Stub idle." : `${stubRun.status}: ${stubRun.progress}`}
      </p>
      <h3>Proposal timeline</h3>
      {stubRun.proposals.length === 0 && <p>No proposals yet.</p>}
      <ol className="timeline" data-testid="stub-timeline">
        {stubRun.proposals.map((p) => (
          <li key={p.name} data-testid={`timeline-${p.name}`}>
            <strong className="mono">{p.name}</strong> — {p.parseOk ? "parsed ✓" : `parse × ${p.parseError}`} ·{" "}
            {p.applyOk ? "mapping materialized ✓" : `mapping × ${p.applyErrors.join("; ")}`} ·{" "}
            {p.candidate
              ? p.candidate.valid
                ? `valid ✓ ${p.candidate.weightedTravelMm} mm`
                : `invalid × ${p.candidate.errors[0]?.code ?? "error"}`
              : "not evaluated"}
            <br />
            <span>{p.rationale}</span>
          </li>
        ))}
      </ol>
      {stubRun.status === "completed" && (
        <p data-testid="stub-outcome">
          Outcome <strong className="mono">{stubRun.outcome}</strong> · best{" "}
          <strong className="mono">{stubRun.bestName ?? "none"}</strong> · model requests 0
        </p>
      )}
    </div>
  );
}
