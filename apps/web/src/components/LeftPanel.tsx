import { useState } from "react";
import type { Assignment, CandidateResult, PlanningRequirements, Scenario } from "@layoutlab/core";
import { buildRelocationRows, checkCompatibility, computeDemandUnits, demandBucket, DEMAND_META, isLocked } from "../lib/planner";

// Stable per-product identity swatches, deliberately independent of the
// demand-bucket colors (demand already has its own pill). Index follows
// scenario product order so filtering never recolors a product.
const IDENTITY_SWATCHES = ["#d9730d", "#3b82c4", "#3f9e4d", "#8b5cf6", "#c9930a", "#0ea5a4"];

export function LeftPanel(props: {
  scenario: Scenario | null;
  requirements: PlanningRequirements;
  scenarioError: string | null;
  onEdit: (productId: string, locationId: string) => void;
  onEvaluate: () => void;
  selectedName: string | null;
  candidate: CandidateResult | null;
  runBaseline: Assignment[] | null;
  frameCandidate: boolean;
}): React.JSX.Element {
  const { scenario, requirements, scenarioError, onEdit, onEvaluate, selectedName, candidate, runBaseline, frameCandidate } = props;
  const [filter, setFilter] = useState("");
  if (!scenario) {
    return (
      <div className="panel" data-testid="left-panel">
        <h2>Products &amp; assignments</h2>
        <p>No scenario loaded. Load the sample or a bounded JSON scenario to begin.</p>
        {scenarioError && <p className="error" role="alert" data-testid="scenario-error">{scenarioError}</p>}
      </div>
    );
  }
  const units = computeDemandUnits(scenario);
  const maxUnits = Math.max(0, ...units.values());
  const locOf = new Map(scenario.assignments.map((a) => [a.productId, a.locationId]));
  const locations = new Map(scenario.locations.map((l) => [l.id, l]));
  const candOf = candidate ? new Map(candidate.assignment.map((a) => [a.productId, a.locationId])) : null;
  const q = filter.trim().toLowerCase();
  const products = scenario.products.filter(
    (p) => q === "" || p.id.toLowerCase().includes(q) || p.label.toLowerCase().includes(q),
  );
  const planRows = candidate && selectedName && selectedName !== "baseline"
    ? buildRelocationRows(runBaseline ?? scenario.assignments, candidate.assignment, scenario, () => selectedName)
    : [];
  const weightedOrders = scenario.orders.reduce((n, o) => n + o.frequency, 0);
  return (
    <div className="panel" data-testid="left-panel">
      <h2>Products &amp; assignments</h2>
      <label className="search">
        <span className="visually-hidden">Search products</span>
        <input
          type="search"
          placeholder="Search products"
          value={filter}
          data-testid="product-filter"
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <p className="hint">Demand = ordered units (frequency × quantity).</p>
      {frameCandidate && candOf && (
        <p className="hint" data-testid="frame-readonly-note">Candidate view is read-only; switch to Current to edit.</p>
      )}
      {scenarioError && <p className="error" role="alert" data-testid="scenario-error">{scenarioError}</p>}
      <div className="product-list">
      <table>
        <thead>
          <tr><th>Product</th><th>Location</th><th>Demand</th></tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const current = locOf.get(p.id) ?? "";
            // The panel shares the warehouse frame: candidate destinations are
            // shown read-only; manual edits stay available in Current view.
            const readOnly = frameCandidate && candOf !== null;
            const shown = readOnly ? (candOf.get(p.id) ?? current) : current;
            const loc = locations.get(shown);
            const u = units.get(p.id) ?? 0;
            const bucket = demandBucket(u, maxUnits);
            const meta = DEMAND_META[bucket];
            const compat = loc ? checkCompatibility(p, loc) : { ok: false, reasons: ["unassigned"] };
            const lock = isLocked(p, requirements.lockedProductIds);
            const changed = candOf !== null && candOf.get(p.id) !== undefined && candOf.get(p.id) !== current;
            const identitySlot = scenario.products.findIndex((q) => q.id === p.id);
            const identity = identitySlot < 0
              ? "#64748b"
              : (IDENTITY_SWATCHES[identitySlot % IDENTITY_SWATCHES.length] ?? "#64748b");
            return (
              <tr key={p.id} data-testid={`product-row-${p.id}`}>
                <td className="product-cell">
                  <span className="cube" style={{ backgroundColor: identity }} aria-hidden="true" />
                  <span className="pname">{p.label}</span> <span className="mono sku">{p.id}</span>
                  {(lock.locked || changed || p.requiredStorageClass === "cold") && <br />}
                  {lock.locked && (
                    <> <span className="badge lock" aria-label={`locked: ${lock.reason}`}>LOCK</span></>
                  )}
                  {changed && (
                    <> <span className="badge changed">Changed</span></>
                  )}
                  {p.requiredStorageClass === "cold" && (
                    <> <span className="badge cold">✳ Cold</span></>
                  )}
                </td>
                <td className="loc-cell">
                  {readOnly ? (
                    <span className="mono" data-testid={`dest-${p.id}`}>{shown}</span>
                  ) : (
                    <label style={{ margin: 0 }}>
                      <span className="visually-hidden">Location for {p.id}</span>
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
                  )}
                  <span data-testid={`compat-${p.id}`} title={compat.ok ? "compatible" : compat.reasons.join("; ")}>
                    {compat.ok ? "✓ ok" : `× ${compat.reasons.join("; ")}`}
                  </span>
                </td>
                <td data-testid={`demand-${p.id}`}>
                  <span className={`pill demand-${bucket}`} title={`${meta.label}: ${u} ordered units`}>
                    <span className={`dot ${bucket}`} aria-hidden="true" />{meta.symbol} {bucket} ({u})
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="hint" data-testid="frame-note">
        {candOf ? `● Showing selected candidate ${selectedName}` : "○ Showing the current assignment"}
      </p>
      <h3>Relocation plan{candidate && selectedName && selectedName !== "baseline" ? ` — ${selectedName}` : ""}</h3>
      {!candidate || !selectedName || selectedName === "baseline" ? (
        <p>Select a candidate below to inspect its explicit moves.</p>
      ) : planRows.length === 0 ? (
        <p>No relocations (candidate retains the baseline).</p>
      ) : (
        <ul className="plan" data-testid="relocation-plan">
          {planRows.map((r) => (
            <li key={r.productId} data-testid={`plan-reloc-${r.productId}`}>
              <span className="mono">{r.productId}</span>{" "}
              <span className="mono">{r.fromId} → {r.toId}</span>{" "}
              {r.compatible ? "✓" : `× ${r.compatReason}`}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="secondary wide" onClick={onEvaluate} data-testid="btn-evaluate">
        ▤ Evaluate assignment
      </button>
      <details className="compact" data-testid="orders-details">
        <summary>Orders ({scenario.orders.length} templates · {weightedOrders} weighted)</summary>
        <ul className="mono orders" data-testid="orders-list">
          {scenario.orders.map((o) => {
            const orderUnits = o.frequency * o.lines.reduce((n, l) => n + l.quantity, 0);
            return (
              <li key={o.id}>{o.id} ×{o.frequency} · {orderUnits} units: {o.lines.map((l) => `${l.productId}×${l.quantity}`).join(", ")}</li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
