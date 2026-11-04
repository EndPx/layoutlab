import type { ReactNode } from "react";
import type { PlanningRequirements, Scenario } from "@layoutlab/core";
import type { StubRunState } from "../App";
import type { ApiStatus, RunSummary } from "../lib/api";
import { formatMeters } from "../lib/format";

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
  const lockedLabels = scenario
    ? scenario.products
        .filter((p) => p.lockedLocationId !== undefined || requirements.lockedProductIds.includes(p.id))
        .map((p) => p.lockedLocationId !== undefined
          ? `${p.label} fixed at ${p.lockedLocationId}`
          : `${p.label} locked`)
    : [];
  const hasCold = scenario?.products.some((p) => p.requiredStorageClass === "cold") === true;
  const setBudget = (n: number): void => {
    onRequirements({ ...requirements, maxRelocatedProducts: Math.max(0, Math.min(64, Math.floor(n) || 0)) });
  };
  return (
    <>
      <h3>Planning constraints</h3>
      <div className="stepper-row">
        <label htmlFor="req-budget">Maximum relocations</label>
        <div className="stepper" role="group" aria-label="Maximum relocations stepper">
          <button
            type="button"
            onClick={() => setBudget(requirements.maxRelocatedProducts - 1)}
            disabled={disabled}
            data-testid="req-budget-dec"
            aria-label="Decrease maximum relocations"
          >
            −
          </button>
          <input
            id="req-budget"
            type="number"
            min={0}
            max={64}
            value={requirements.maxRelocatedProducts}
            data-testid="req-budget"
            disabled={disabled}
            onChange={(e) => onRequirements({ ...requirements, maxRelocatedProducts: Math.max(0, Number(e.target.value) || 0) })}
          />
          <button
            type="button"
            onClick={() => setBudget(requirements.maxRelocatedProducts + 1)}
            disabled={disabled}
            data-testid="req-budget-inc"
            aria-label="Increase maximum relocations"
          >
            +
          </button>
        </div>
      </div>
      <div className="tags" data-testid="constraint-tags" aria-label="Active constraints">
        {lockedLabels.map((t) => (
          <span key={t} className="tag">▪ {t}</span>
        ))}
        {hasCold && <span className="tag">✳ Cold storage preserved</span>}
        <span className="tag">▦ Location fit required</span>
      </div>
      <details className="compact" data-testid="locked-products">
        <summary>
          Locked products ({requirements.lockedProductIds.length} selected)
          {!scenario && " — no scenario"}
        </summary>
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
      </details>
      <p className={approved ? "approved-banner" : "notice"} data-testid="approval-state">
        {approved ? "✓ Requirements approved." : "× Requirements not approved — generation is gated."}
      </p>
      {requirementsError && <p className="error" role="alert" data-testid="requirements-error">{requirementsError}</p>}
      {!approved && (
        <button type="button" className="secondary" onClick={onApprove} disabled={!scenario || disabled} data-testid="btn-approve">
          Approve requirements
        </button>
      )}
    </>
  );
}

// One compact history row: number + name + verdict + travel in the summary,
// full parse/apply diagnostics + rationale expandable. All raw attempts stay
// inspectable; the collapsed text remains in the DOM for assertions.
function HistoryItem(props: {
  index: number;
  name: string;
  testId: string;
  verdict: string;
  diagnostics: ReactNode;
}): React.JSX.Element {
  return (
    <li>
      <details data-testid={props.testId}>
        <summary>
          <span className="attempt-no" aria-hidden="true">{props.index + 1}</span>{" "}
          <strong className="mono">{props.name}</strong> — {props.verdict}
        </summary>
        <div className="history-detail">{props.diagnostics}</div>
      </details>
    </li>
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
  const stubHeuristic = stubRun.proposals.find((p) => p.name === "heuristic") ?? null;
  const stubGenerated = stubRun.proposals.filter((p) => p.name !== "heuristic");
  return (
    <div className="panel" data-testid="right-panel">
      <h2>Plan an improvement</h2>
      <p className="hint">Describe the goal. Review the constraints.</p>

      {live.providerMode === "live" ? (
        <>
          <p className="notice" data-testid="live-privacy">
            <strong>Live mode:</strong> your scenario details and planning request are sent to the configured model
            API to generate alternatives. Synthetic data is used by default.
          </p>
          {isContributor && (
            <p className="notice" data-testid="live-contributor">
              <strong>Contributor model:</strong> this model id is discounted in exchange for
              training-data use. Do not send real customer data.
            </p>
          )}
          <label>
            Goal (sent to the configured provider only after consent)
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
            I consent to sending this scenario and request to the configured model provider.
          </label>
          <RequirementsForm
            scenario={scenario}
            requirements={requirements}
            approved={approved}
            requirementsError={requirementsError}
            onRequirements={onRequirements}
            onApprove={onApprove}
            disabled={liveRunning}
          />
          <p className="actions">
            <button
              type="button"
              onClick={onInterpret}
              disabled={!scenario || !liveReady || !live.consent || liveRunning}
              title={
                !liveReady ? "Live server not ready" : !live.consent ? "Consent required before sending to the configured provider" : "Interpret request (1 model request)"
              }
              data-testid="btn-interpret"
            >
              Interpret with configured model (1 request)
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
              ▶ Generate &amp; test alternatives
            </button>{" "}
            <button type="button" onClick={onCancelLive} disabled={!liveRunning && live.run?.state !== "AWAITING_APPROVAL"} data-testid="btn-cancel-live">
              Cancel live run
            </button>
          </p>
          {live.busy !== null && <p className="statusline" aria-live="polite" data-testid="live-busy">{live.busy}</p>}
          {live.error !== null && <p className="error" role="alert" data-testid="live-error">{live.error}</p>}
          {interpreting && (
            <p data-testid="live-interpreting">
              Interpreting with configured model… this first request is cancellable by run ID.
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
            <div className="panel inset" data-testid="live-questions">
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
          <h3>Proposal history</h3>
          {(live.run === null || live.run.attempts.length === 0) && !live.run?.heuristic?.candidate && <p>No live proposals yet.</p>}
          {live.run?.heuristic?.candidate && (
            <details className="heuristic" data-testid="timeline-heuristic">
              <summary>
                <strong className="mono">heuristic</strong> (separate method) —{" "}
                {live.run.heuristic.candidate.valid
                  ? `valid ✓ ${formatMeters(live.run.heuristic.candidate.weightedTravelMm)}`
                  : `invalid × ${live.run.heuristic.candidate.errors[0]?.code ?? "error"}`}
              </summary>
              <div className="history-detail"><p>Not a proposal · Heuristic {live.run.heuristic.method}: {live.run.heuristic.reason} · {live.run.heuristic.evaluationsUsed}/{live.run.heuristic.evaluationsBudget} evals, no model used.</p></div>
            </details>
          )}
          <ol className="timeline" data-testid="live-timeline">
            {(live.run?.attempts ?? []).map((a, i) => (
              <HistoryItem
                key={a.name}
                index={i}
                name={a.name}
                testId={`timeline-${a.name}`}
                verdict={a.candidate
                  ? a.candidate.valid
                    ? `valid ✓ ${formatMeters(a.candidate.weightedTravelMm)}`
                    : `invalid × ${a.candidate.errors[0]?.code ?? "error"}${a.candidate.errors[0]?.message ? `: ${a.candidate.errors[0].message}` : ""}`
                  : (a.transportError ?? "not evaluated")}
                diagnostics={(
                  <>
                    <p>
                      {a.parseOk ? "parsed ✓" : `parse × ${a.parseError}`} ·{" "}
                      {a.applyOk ? "mapping materialized ✓" : a.parseOk ? `mapping × ${a.applyErrors.join("; ")}` : "not materialized"}
                    </p>
                    <p>{a.rationale}</p>
                  </>
                )}
              />
            ))}
          </ol>
          {liveTerminal && (
            <p aria-live="polite" data-testid="live-outcome">
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
            <strong>Stub mode:</strong> no inference, deterministic placeholders.
          </p>
          <RequirementsForm
            scenario={scenario}
            requirements={requirements}
            approved={approved}
            requirementsError={requirementsError}
            onRequirements={onRequirements}
            onApprove={onApprove}
          />
          <p className="actions">
            <button
              type="button"
              className="primary"
              onClick={onGenerate}
              disabled={!scenario || !approved || running}
              title={!approved ? "Approve requirements first" : "Generate up to 3 stub proposals"}
              data-testid="btn-generate"
            >
              ▶ Generate &amp; test alternatives
            </button>{" "}
            <button type="button" onClick={onCancel} disabled={!running} data-testid="btn-cancel">
              Cancel run
            </button>
          </p>
          {stubRun.status !== "completed" && (
            <p className="statusline" aria-live="polite" data-testid="stub-status">
              {stubRun.status === "idle" ? "Stub idle." : stubRun.progress}
            </p>
          )}
          <h3>Proposal history</h3>
          {stubRun.proposals.length === 0 && <p>No proposals yet.</p>}
          {stubHeuristic?.candidate && (
            <details className="heuristic" data-testid="timeline-heuristic">
              <summary>
                <strong className="mono">heuristic</strong> (separate method) —{" "}
                {stubHeuristic.candidate.valid
                  ? `valid ✓ ${formatMeters(stubHeuristic.candidate.weightedTravelMm)}`
                  : `invalid × ${stubHeuristic.candidate.errors[0]?.code ?? "error"}`}
              </summary>
              <div className="history-detail"><p>Not a proposal · {stubHeuristic.rationale}</p></div>
            </details>
          )}
          <ol className="timeline" data-testid="stub-timeline">
            {stubGenerated.map((p, i) => (
              <HistoryItem
                key={p.name}
                index={i}
                name={p.name}
                testId={`timeline-${p.name}`}
                verdict={p.candidate
                  ? p.candidate.valid
                    ? `valid ✓ ${formatMeters(p.candidate.weightedTravelMm)}`
                    : `invalid × ${p.candidate.errors[0]?.code ?? "error"}${p.candidate.errors[0]?.message ? `: ${p.candidate.errors[0].message}` : ""}`
                  : "not evaluated"}
                diagnostics={(
                  <>
                    <p>
                      {p.parseOk ? "parsed ✓" : `parse × ${p.parseError}`} ·{" "}
                      {p.applyOk ? "mapping materialized ✓" : `mapping × ${p.applyErrors.join("; ")}`}
                    </p>
                    <p>{p.rationale}</p>
                  </>
                )}
              />
            ))}
          </ol>
          {stubRun.status === "completed" && (
            <p aria-live="polite" data-testid="stub-outcome">
              Outcome <strong className="mono">{stubRun.outcome}</strong> · best{" "}
              <strong className="mono">{stubRun.bestName ?? "none"}</strong> · model requests 0
              {stubRun.heuristicMeta && (
                <> · heuristic {stubRun.heuristicMeta.evaluationsUsed}/{stubRun.heuristicMeta.evaluationsBudget} evals</>
              )}
            </p>
          )}
        </>
      )}

      <details className="dev" data-testid="developer-settings">
        <summary>Developer settings</summary>
        <fieldset className="provider">
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
            Server model (explicit consent required)
          </label>
        </fieldset>
        {live.providerMode === "live" ? (
          <>
            <p data-testid="live-status">
              {live.apiStatus === null && live.apiError === null && "Checking live server status…"}
              {live.apiError !== null && <>× Live server unreachable ({live.apiError}). Stub still works. </>}
              {live.apiStatus !== null && (
                liveReady ? (
                  live.apiStatus.providerKind === "fixture" ? (
                    <>✓ Fixture ready — local loopback configured (0 real Meta): <span className="mono">{live.apiStatus.modelId}</span> via{" "}
                      <span className="mono">{live.apiStatus.baseUrl}</span> ·{" "}
                      <span className="mono">{live.apiStatus.providerKind}</span> · budgets{" "}
                      {live.apiStatus.budgets.maxProposals}p/{live.apiStatus.budgets.maxRequests}r/
                      {live.apiStatus.budgets.timeoutMs}ms. Not live inference.</>
                  ) : live.run !== null && live.run.realMetaRequests > 0 ? (
                    <>✓ Server configured — USED by this run: <span className="mono">{live.apiStatus.modelId}</span> via{" "}
                      <span className="mono">{live.apiStatus.baseUrl}</span> ·{" "}
                      <span className="mono">{live.apiStatus.providerKind}</span> · budgets{" "}
                      {live.apiStatus.budgets.maxProposals}p/{live.apiStatus.budgets.maxRequests}r/
                      {live.apiStatus.budgets.timeoutMs}ms · {live.run.realMetaRequests} real Meta requests this run.</>
                  ) : (
                    <>✓ Server configured — configured, not used: <span className="mono">{live.apiStatus.modelId}</span> via{" "}
                      <span className="mono">{live.apiStatus.baseUrl}</span> ·{" "}
                      <span className="mono">{live.apiStatus.providerKind}</span> · budgets{" "}
                      {live.apiStatus.budgets.maxProposals}p/{live.apiStatus.budgets.maxRequests}r/
                      {live.apiStatus.budgets.timeoutMs}ms. No confirmed provider completion yet.</>
                  )
                ) : (
                  <>× Live unavailable: {live.apiStatus.reason ?? "setup required"}. Stub still works.</>
                )
              )}{" "}
              <button type="button" onClick={onRefreshStatus} data-testid="btn-refresh-status">Refresh</button>
            </p>
            {live.run !== null && (
              <p data-testid="live-run-status">
                Run <span className="mono">{live.run.runId.slice(0, 8)}</span> · {live.run.state} ·{" "}
                phase <span className="mono">{live.run.phase}</span> ·{" "}
                requests {live.run.modelRequestsUsed}/{live.run.budgets.maxRequests} · proposals{" "}
                {live.run.proposalsUsed}/{live.run.budgets.maxProposals} · heuristic{" "}
                {live.run.candidateBudgets.heuristic.evaluationsUsed}/{live.run.candidateBudgets.heuristic.evaluationsBudget}{" "}
                evals ·{" "}
                <span className="mono">{live.run.providerKind}</span> (real Meta {live.run.realMetaRequests})
                {live.run.interpretError !== null && <> · <span className="error">interpret: {live.run.interpretError}</span></>}
                {live.run.lastError !== null && <> · <span className="error">{live.run.lastError}</span></>}
              </p>
            )}
          </>
        ) : (
          <>
            <p>Setup: no server required · budgets 3 proposals / 0 model requests · heuristic demand-greedy-swaps/1.</p>
            <label>
              Goal (display only; stub does not read it)
              <textarea
                rows={2}
                defaultValue="Reduce picking travel for the loaded orders. Keep locked products fixed and relocate no more than the approved budget."
                readOnly
                data-testid="planning-request"
              />
            </label>
          </>
        )}
      </details>
    </div>
  );
}
