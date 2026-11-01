import type { PlanningRequirements, Scenario } from "@layoutlab/core";
import type { StubRunState } from "../App";
import type { ApiStatus, RunSummary } from "../lib/api";

export type LivePanelState = {
  providerMode: "stub" | "live";
  apiStatus: ApiStatus | null;
  apiError: string | null;
  requestText: string;
  consent: boolean;
  run: RunSummary | null;
  busy: string | null;
  error: string | null;
};

function RequirementsForm(props: {
  scenario: Scenario | null;
  requirements: PlanningRequirements;
  approved: boolean;
  requirementsError: string | null;
  onRequirements: (next: PlanningRequirements) => void;
  onApprove: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { scenario, requirements, approved, requirementsError, onRequirements, onApprove } = props;
  const disabled = props.disabled === true;
  return (
    <>
      <h3>Structured requirements (editable)</h3>
      <label>
        Max relocated products
        <input
          type="number"
          min={0}
          max={64}
          value={requirements.maxRelocatedProducts}
          data-testid="req-budget"
          disabled={disabled}
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
              disabled={disabled}
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
      <p data-testid="approval-state">{approved ? "✓ Requirements approved." : "× Requirements not approved — generation is gated."}</p>
      {requirementsError && <p className="error" role="alert" data-testid="requirements-error">{requirementsError}</p>}
      <button type="button" onClick={onApprove} disabled={!scenario || disabled} data-testid="btn-approve">
        Approve requirements
      </button>{" "}
    </>
  );
}

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
  live: LivePanelState;
  onProviderMode: (mode: "stub" | "live") => void;
  onLiveRequest: (text: string) => void;
  onLiveConsent: (consent: boolean) => void;
  onInterpret: () => void;
  onGenerateLive: () => void;
  onCancelLive: () => void;
  onRefreshStatus: () => void;
  onResolveQuestion: (index: number) => void;
}): React.JSX.Element {
  const {
    scenario, requirements, approved, requirementsError, stubRun,
    onRequirements, onApprove, onGenerate, onCancel,
    live, onProviderMode, onLiveRequest, onLiveConsent,
    onInterpret, onGenerateLive, onCancelLive, onRefreshStatus, onResolveQuestion,
  } = props;
  const running = stubRun.status === "running";
  const liveRunning = live.busy !== null;
  const liveReady = live.apiStatus?.liveAvailable === true;
  const isContributor = (live.apiStatus?.modelId ?? "").includes("contributor");
  const interpreting = live.run !== null && live.run.state === "INTERPRETING";
  const interpreted = live.run !== null && (live.run.state === "AWAITING_APPROVAL" || live.run.state === "RUNNING");
  const openQuestions = live.run !== null && live.run.state === "AWAITING_APPROVAL" ? requirements.unresolvedQuestions : [];
  const liveTerminal =
    live.run !== null &&
    (live.run.state === "COMPLETED" || live.run.state === "FAILED" ||
      live.run.state === "CANCELLED" || live.run.state === "TIMED_OUT");
  return (
    <div className="panel" data-testid="right-panel">
      <h2>Planning request</h2>
      <fieldset>
        <legend>Provider (clearly labeled)</legend>
        <label style={{ display: "inline-block", width: "auto", marginRight: 12 }}>
          <input
            type="radio"
            name="provider"
            checked={live.providerMode === "stub"}
            data-testid="provider-stub"
            onChange={() => onProviderMode("stub")}
          />{" "}
          Stub (deterministic, no inference)
        </label>
        <label style={{ display: "inline-block", width: "auto" }}>
          <input
            type="radio"
            name="provider"
            checked={live.providerMode === "live"}
            data-testid="provider-live"
            onChange={() => onProviderMode("live")}
          />{" "}
          Live (Meta model via server)
        </label>
      </fieldset>

      {live.providerMode === "live" ? (
        <>
          <p className="notice" data-testid="live-privacy">
            <strong>Live mode:</strong> your scenario details and planning request are sent to Meta Model
            API to generate alternatives. Synthetic data is used by default.
          </p>
          {isContributor && (
            <p className="notice" data-testid="live-contributor">
              <strong>Contributor model:</strong> this model id is discounted in exchange for
              training-data use. Do not send real customer data.
            </p>
          )}
          <p data-testid="live-status">
            {live.apiStatus === null && live.apiError === null && "Checking live server status…"}
            {live.apiError !== null && <>× Live server unreachable ({live.apiError}). Stub still works. </>}
            {live.apiStatus !== null && (
              liveReady ? (
                <>✓ Live ready: <span className="mono">{live.apiStatus.modelId}</span> via{" "}
                  <span className="mono">{live.apiStatus.baseUrl}</span> ·{" "}
                  <span className="mono">{live.apiStatus.providerKind}</span> · budgets{" "}
                  {live.apiStatus.budgets.maxProposals}p/{live.apiStatus.budgets.maxRequests}r/
                  {live.apiStatus.budgets.timeoutMs}ms.</>
              ) : (
                <>× Live unavailable: {live.apiStatus.reason ?? "setup required"}. Stub still works.</>
              )
            )}{" "}
            <button type="button" onClick={onRefreshStatus} data-testid="btn-refresh-status">Refresh</button>
          </p>
          <label>
            Request (sent to Meta only after consent)
            <textarea
              rows={3}
              value={live.requestText}
              data-testid="live-request"
              onChange={(e) => onLiveRequest(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={live.consent}
              data-testid="live-consent"
              onChange={(e) => onLiveConsent(e.target.checked)}
            />{" "}
            I consent to sending this scenario and request to Meta Model API.
          </label>
          <p>
            <button
              type="button"
              onClick={onInterpret}
              disabled={!scenario || !liveReady || !live.consent || liveRunning}
              title={
                !liveReady ? "Live server not ready" : !live.consent ? "Consent required before sending to Meta" : "Interpret request (1 model request)"
              }
              data-testid="btn-interpret"
            >
              Interpret with Meta (1 request)
            </button>{" "}
            <button
              type="button"
              className="primary"
              onClick={onGenerateLive}
              disabled={!scenario || !approved || live.run === null || live.run.state !== "AWAITING_APPROVAL" || liveRunning || openQuestions.length > 0}
              title={
                !approved
                  ? "Approve requirements first"
                  : openQuestions.length > 0
                    ? "Resolve open questions first"
                    : "Generate up to 3 live proposals"
              }
              data-testid="btn-generate-live"
            >
              Generate live (max 3)
            </button>{" "}
            <button type="button" onClick={onCancelLive} disabled={!liveRunning && live.run?.state !== "AWAITING_APPROVAL"} data-testid="btn-cancel-live">
              Cancel live run
            </button>
          </p>
          {live.busy !== null && <p className="statusline" aria-live="polite" data-testid="live-busy">{live.busy}</p>}
          {live.error !== null && <p className="error" role="alert" data-testid="live-error">{live.error}</p>}
          {live.run !== null && (
            <p data-testid="live-run-status">
              Run <span className="mono">{live.run.runId.slice(0, 8)}</span> · {live.run.state} ·{" "}
              phase <span className="mono">{live.run.phase}</span> ·{" "}
              requests {live.run.modelRequestsUsed}/{live.run.budgets.maxRequests} · proposals{" "}
              {live.run.proposalsUsed}/{live.run.budgets.maxProposals} ·{" "}
              <span className="mono">{live.run.providerKind}</span> (real Meta {live.run.realMetaRequests})
              {live.run.interpretError !== null && <> · <span className="error">interpret: {live.run.interpretError}</span></>}
              {live.run.lastError !== null && <> · <span className="error">{live.run.lastError}</span></>}
            </p>
          )}
          {interpreting && (
            <p data-testid="live-interpreting">
              Interpreting with Meta… this first request is cancellable by run ID.
            </p>
          )}
          {interpreted && (
            <p data-testid="live-interpreted">
              ✓ Interpreted constraints are loaded below — review, edit, resolve open questions, then
              approve to continue. Interpretation consumed 1 of {live.run?.budgets.maxRequests} model
              requests; the budget is not reset.
            </p>
          )}
          {openQuestions.length > 0 && (
            <div className="panel" data-testid="live-questions">
              <h3>Open questions (must resolve before proposals)</h3>
              <ul>
                {openQuestions.map((q, i) => (
                  <li key={`${i}-${q.slice(0, 24)}`} data-testid={`live-question-${i}`}>
                    {q}{" "}
                    <button type="button" onClick={() => onResolveQuestion(i)} data-testid={`resolve-question-${i}`}>
                      Mark resolved
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <RequirementsForm
            scenario={scenario}
            requirements={requirements}
            approved={approved}
            requirementsError={requirementsError}
            onRequirements={onRequirements}
            onApprove={onApprove}
            disabled={liveRunning}
          />
          <h3>Live proposal timeline</h3>
          {(live.run === null || live.run.attempts.length === 0) && <p>No live proposals yet.</p>}
          <ol className="timeline" data-testid="live-timeline">
            {(live.run?.attempts ?? []).map((a) => (
              <li key={a.name} data-testid={`timeline-${a.name}`}>
                <strong className="mono">{a.name}</strong> — {a.parseOk ? "parsed ✓" : `parse × ${a.parseError}`} ·{" "}
                {a.applyOk ? "mapping materialized ✓" : a.parseOk ? `mapping × ${a.applyErrors.join("; ")}` : "not materialized"} ·{" "}
                {a.candidate
                  ? a.candidate.valid
                    ? `valid ✓ ${a.candidate.weightedTravelMm} mm`
                    : `invalid × ${a.candidate.errors[0]?.code ?? "error"}`
                  : (a.transportError ?? "not evaluated")}
                <br />
                <span>{a.rationale}</span>
              </li>
            ))}
          </ol>
          {liveTerminal && (
            <p data-testid="live-outcome">
              Outcome <strong className="mono">{live.run?.outcome ?? "none"}</strong> · best{" "}
              <strong className="mono">{live.run?.bestName ?? "none"}</strong> · state{" "}
              <strong className="mono">{live.run?.state}</strong> · model requests {live.run?.modelRequestsUsed}
              {live.run?.usageTotals !== null && live.run?.usageTotals !== undefined && (
                <> · tokens {live.run.usageTotals.promptTokens ?? "?"}/{live.run.usageTotals.completionTokens ?? "?"}
                  {live.run.usageIncomplete ? " (incomplete)" : ""}</>
              )}
            </p>
          )}
        </>
      ) : (
        <>
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
          <p data-testid="stub-limitation">
            Limitation: the stub does not interpret natural language. It uses only these structured fields.
          </p>
          <RequirementsForm
            scenario={scenario}
            requirements={requirements}
            approved={approved}
            requirementsError={requirementsError}
            onRequirements={onRequirements}
            onApprove={onApprove}
          />
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
        </>
      )}
    </div>
  );
}
