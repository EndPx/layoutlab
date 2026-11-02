import type { CandidateResult, Scenario } from "@layoutlab/core";
import { formatImprovement, formatMeters } from "../lib/format";

function IconTravel(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="1.6" />
      <path d="M13 8l-2.5 5L7 21M13 8l3 3 3 1M10.5 13L14 21l4 1" />
    </svg>
  );
}

function IconOrders(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}

function IconReloc(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13" />
    </svg>
  );
}

function IconShield(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// Four headline cards driven by ONE presentation frame: the selected
// candidate when a candidate view is active, otherwise the current
// assignment. Empty state shows N/A with a load direction.
export function MetricCards(props: {
  scenario: Scenario | null;
  presented: CandidateResult | null;
  presentedName: string | null;
  relocationLimit: number;
  limitApproved: boolean;
  improvement: number | null;
  runBaselineMm: number | null;
  stale: boolean;
}): React.JSX.Element {
  const { scenario, presented, presentedName, relocationLimit, limitApproved, improvement, runBaselineMm, stale } = props;
  const isCandidate = presented !== null && presentedName !== null && presentedName !== "baseline";
  const templates = scenario?.orders.length ?? 0;
  const weightedOrders = scenario?.orders.reduce((n, o) => n + o.frequency, 0) ?? 0;

  const travelCaption = !scenario
    ? "Load a scenario to measure travel."
    : !presented || presented.weightedTravelMm === null
      ? "N/A — assignment is invalid or unreachable."
      : isCandidate
        ? runBaselineMm != null
          ? `${stale ? "Historical run baseline" : "Run baseline"} ${formatMeters(runBaselineMm)} · ${improvement === null ? "N/A (not comparable)" : `${formatImprovement(Math.abs(improvement))} ${improvement >= 0 ? "shorter" : "longer"}`}`
          : "No run baseline to compare."
        : `Current assignment · mean ${formatMeters(presented.workload?.meanOrderDistanceMm)}/order`;

  const reachable = presented?.workload?.reachableOrders;
  const reachableCaption = !scenario
    ? "Load a scenario to check reachability."
    : `${templates} order templates · ${weightedOrders} frequency-weighted orders`;

  const withinLimit = presented !== null && presented.relocationCount <= relocationLimit;
  // Approval wording follows the actual snapshot: run requirements were the
  // approved snapshot at generation; current requirements may be unapproved.
  const relocCaption = !scenario
    ? "Load a scenario to count relocations."
    : !presented
      ? "N/A — no evaluated assignment."
      : isCandidate && stale
        ? `Historical run limit ${relocationLimit} — re-run before applying.`
        : limitApproved
          ? `${withinLimit ? "Within" : "Over"} the approved limit of ${relocationLimit}.`
          : `Planning limit ${relocationLimit} (requirements not approved).`;

  const statusCaption = !scenario
    ? "No scenario loaded."
    : !presented
      ? "N/A — no evaluated assignment."
      : presented.valid
        ? "Compatibility and locks preserved."
        : `${presented.errors[0]?.code ?? "INVALID"}: ${presented.errors[0]?.message ?? "see errors"}`;

  return (
    <section className="metrics" aria-label="Key metrics" data-testid="metric-cards">
      <div className="metric">
        <span className="metric-icon" aria-hidden="true"><IconTravel /></span>
        <div>
          <p className="metric-label">Picking travel</p>
          <p className="metric-value" data-testid="baseline-metrics" title={presented?.weightedTravelMm == null ? "N/A" : `${presented.weightedTravelMm} mm`}>
            {formatMeters(presented?.weightedTravelMm)}
          </p>
          <p className="metric-caption">{travelCaption}</p>
        </div>
      </div>
      <div className="metric">
        <span className="metric-icon" aria-hidden="true"><IconOrders /></span>
        <div>
          <p className="metric-label">Reachable orders</p>
          <p className="metric-value" data-testid="metric-reachable">
            {scenario && reachable !== undefined && reachable !== null ? `${reachable} / ${templates}` : "N/A"}
          </p>
          <p className="metric-caption">{reachableCaption}</p>
        </div>
      </div>
      <div className="metric">
        <span className="metric-icon" aria-hidden="true"><IconReloc /></span>
        <div>
          <p className="metric-label">Products relocated</p>
          <p className="metric-value" data-testid="metric-relocated">
            {scenario && presented ? `${presented.relocationCount} / ${relocationLimit}` : "N/A"}
          </p>
          <p className="metric-caption">{relocCaption}</p>
        </div>
      </div>
      <div className="metric">
        <span className="metric-icon" aria-hidden="true"><IconShield /></span>
        <div>
          <p className="metric-label">Assignment status</p>
          <p className={`metric-value ${!scenario || !presented ? "" : presented.valid ? "ok" : "bad"}`} data-testid="metric-status">
            {!scenario || !presented ? "N/A" : presented.valid ? "Valid" : "Invalid"}
          </p>
          <p className="metric-caption">{statusCaption}</p>
        </div>
      </div>
    </section>
  );
}
