import type { CandidateResult, PlanningRequirements, Scenario } from "@layoutlab/core";
import { checkCompatibility, computeDemandUnits, demandBucket, DEMAND_META, isLocked } from "../lib/planner";

export function LeftPanel(props: {
  scenario: Scenario | null;
  requirements: PlanningRequirements;
  baselineResult: CandidateResult | null;
  scenarioError: string | null;
  onEdit: (productId: string, locationId: string) => void;
  onEvaluate: () => void;
}): React.JSX.Element {
  const { scenario, requirements, baselineResult, scenarioError, onEdit, onEvaluate } = props;
  if (!scenario) {
    return (
      <div className="panel" data-testid="left-panel">
        <h2>Products &amp; assignments</h2>
        <p>No scenario loaded.</p>
        {scenarioError && <p className="error" role="alert" data-testid="scenario-error">{scenarioError}</p>}
      </div>
    );
  }
  const units = computeDemandUnits(scenario);
  const maxUnits = Math.max(0, ...units.values());
  const locOf = new Map(scenario.assignments.map((a) => [a.productId, a.locationId]));
  const locations = new Map(scenario.locations.map((l) => [l.id, l]));
  return (
    <div className="panel" data-testid="left-panel">
      <h2>Products &amp; assignments</h2>
      <button type="button" className="primary" onClick={onEvaluate} data-testid="btn-evaluate">
        Evaluate assignment
      </button>
      {scenarioError && <p className="error" role="alert" data-testid="scenario-error">{scenarioError}</p>}
      {baselineResult && (
        <p data-testid="baseline-metrics">
          {baselineResult.valid ? (
            <>
              Weighted <strong>{baselineResult.weightedTravelMm} mm</strong> · mean{" "}
              {baselineResult.workload?.meanOrderDistanceMm?.toFixed(1) ?? "n/a"} mm · relocations{" "}
              {baselineResult.relocationCount}
            </>
          ) : (
            <span className="error">
              × Invalid: {baselineResult.errors[0]?.code} — {baselineResult.errors[0]?.message}
              {baselineResult.errors.length > 1 ? ` (+${baselineResult.errors.length - 1} more)` : ""}
            </span>
          )}
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr><th>Product</th><th>Location</th><th>Demand</th><th>Compat</th></tr>
        </thead>
        <tbody>
          {scenario.products.map((p) => {
            const current = locOf.get(p.id) ?? "";
            const loc = locations.get(current);
            const u = units.get(p.id) ?? 0;
            const bucket = demandBucket(u, maxUnits);
            const meta = DEMAND_META[bucket];
            const compat = loc ? checkCompatibility(p, loc) : { ok: false, reasons: ["unassigned"] };
            const lock = isLocked(p, requirements.lockedProductIds);
            return (
              <tr key={p.id} data-testid={`product-row-${p.id}`}>
                <td>
                  <span className="mono">{p.id}</span><br />{p.label}
                  {lock.locked && (
                    <><br /><span className="badge lock" aria-label={`locked: ${lock.reason}`}>LOCK</span></>
                  )}
                </td>
                <td>
                  <label style={{ margin: 0 }}>
                    <span style={{ position: "absolute", left: "-9999px" }}>Location for {p.id}</span>
                    <select
                      value={current}
                      data-testid={`assign-${p.id}`}
                      onChange={(e) => onEdit(p.id, e.target.value)}
                    >
                      {scenario.locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.id}</option>
                      ))}
                    </select>
                  </label>
                </td>
                <td data-testid={`demand-${p.id}`}>
                  <span className={`dot ${bucket}`} aria-hidden="true" />{meta.symbol} {bucket} ({u})
                </td>
                <td data-testid={`compat-${p.id}`}>
                  {compat.ok ? "✓ ok" : `× ${compat.reasons.join("; ")}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <h3>Orders</h3>
      <ul className="mono" data-testid="orders-list">
        {scenario.orders.map((o) => (
          <li key={o.id}>{o.id} ×{o.frequency}: {o.lines.map((l) => `${l.productId}×${l.quantity}`).join(", ")}</li>
        ))}
      </ul>
    </div>
  );
}
