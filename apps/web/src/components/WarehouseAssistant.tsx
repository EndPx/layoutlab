// Contextual warehouse assistant (unified workspace right panel): question,
// permitted hypothetical service-time changes, live consent/access, and
// actual progress. Only Start can spend; polling/replay/verify never POST a
// new run. Raw patches/schemas/budgets/request metadata live under
// Technical details, never as the primary story.
import { LayoutResults, type LayoutResultsHolder } from "./LayoutResults";
import { LayoutAssistant, type LayoutAssistantHolder } from "./LayoutAssistant";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InterventionPolicy, OperationsScenario } from "@layoutlab/simulation";
import {
  ApiError,
  DURATION_FIELDS,
  DURATION_LABELS,
  buildPolicy,
  cancelInvestigation,
  createInvestigation,
  getBudget,
  getInvestigation,
  getInvestigationReport,
  getStatus,
  parseInvestigationReport,
  policyEquals,
  provenanceOf,
  type ApiStatus,
  type BudgetInfo,
} from "../lib/experiments";
import type { ExperimentsHolder } from "./ExperimentsPanel";
import { permissionsFromPolicy } from "./ExperimentsPanel";

const PHASE_LABELS: Record<string, string> = {
  EVALUATING_BASELINE: "Evaluating baseline (local engine)",
  REQUESTING_MODEL: "Requesting model",
  EVALUATING_EXPERIMENT: "Evaluating experiment (engine)",
  FINALIZING: "Finalizing",
};

const AUTH_RECOVERY =
  "Sign-in required (401): live investigation routes need Basic Auth, even though this page, status, budget, baseline, recorded replay, export, and verify are public. Open “Live access sign-in” in a new tab, complete the browser sign-in prompt, return here, press Refresh status, then deliberately press Start again. Nothing was resubmitted automatically and no credentials are stored in this page.";

export function WarehouseAssistant(props: {
  holder: ExperimentsHolder;
  onChange: (patch: Partial<ExperimentsHolder>) => void;
  scenario: OperationsScenario | null;
  executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number } | null;
  loadError: string | null;
  layoutHolder: LayoutAssistantHolder;
  layoutResults: LayoutResultsHolder;
}): React.JSX.Element {
  const { action, setAction } = props.layoutHolder;
  const { holder, onChange, scenario, executionConfig } = props;
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [budget, setBudget] = useState<BudgetInfo | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pollSeq = useRef(0);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.allSettled([getStatus(ctrl.signal), getBudget(ctrl.signal)]).then(([s, b]) => {
      if (ctrl.signal.aborted) return;
      if (s.status === "fulfilled") setStatus(s.value);
      if (b.status === "fulfilled") setBudget(b.value);
      if (s.status === "rejected" && b.status === "rejected") {
        setServerError("Server unavailable — live start is disabled; recorded replay and export remain available; Verify requires the API server but makes no inference calls. The separate verification CLI can run offline.");
      } else if (s.status === "rejected") {
        setServerError("Server status unavailable — live start is disabled until the API responds.");
      }
    });
    return () => ctrl.abort();
  }, []);

  const report = holder.report;
  const summary = holder.summary;
  const running = summary?.state === "RUNNING" || (holder.runId !== null && report === null && summary === null);
  const { policy: draftPolicy, errors: policyErrors } = useMemo(() => buildPolicy(holder.permissions), [holder.permissions]);
  const staleDraft = Boolean(
    holder.submitted && report && draftPolicy &&
      (holder.question !== holder.submitted.question || !policyEquals(draftPolicy, holder.submitted.policy)),
  );

  useEffect(() => {
    const runId = holder.runId;
    if (!runId) return;
    if (report && report.state !== "RUNNING") return;
    const seq = ++pollSeq.current;
    const ctrl = new AbortController();
    let stopped = false;
    let tickInFlight = false;
    const tick = async (): Promise<void> => {
      if (tickInFlight) return;
      tickInFlight = true;
      try {
        const s = await getInvestigation(runId, ctrl.signal);
        if (stopped || pollSeq.current !== seq) return;
        if (s.state === "RUNNING") { onChange({ summary: s }); return; }
        const rep = s.report ?? (await getInvestigationReport(runId, ctrl.signal).catch(() => null));
        if (stopped || pollSeq.current !== seq) return;
        onChange({ summary: s, report: rep, provenance: rep ? provenanceOf(rep, "live") : holder.provenance });
      } catch (e) {
        if (stopped || ctrl.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) { setActionError(AUTH_RECOVERY); return; }
        if (e instanceof ApiError && e.status === 404) {
          setActionError(`Run ${runId} is unknown to this server (it may have restarted). Its local evidence is kept; no new run was submitted.`);
          onChange({ runId: null });
          return;
        }
        setActionError(e instanceof Error ? e.message : "Polling failed.");
      } finally { tickInFlight = false; }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    return () => { stopped = true; ctrl.abort(); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holder.runId, report?.state]);

  const exhausted = Boolean(budget?.guard === "active" && budget.availableUsd !== undefined && budget.perRunReservationUsd !== undefined && budget.availableUsd < budget.perRunReservationUsd);
  const startDisabledReasons: string[] = [];
  if (!scenario || !executionConfig) startDisabledReasons.push("warehouse sample failed to load");
  if (running) startDisabledReasons.push("an investigation is already running");
  if (!holder.liveSelected) startDisabledReasons.push("select Live investigation first (explicit live selection)");
  if (!holder.consent) startDisabledReasons.push("consent is required before sending anything");
  if (holder.question.trim().length === 0) startDisabledReasons.push("the question is empty");
  if (policyErrors.length > 0) startDisabledReasons.push("allowed-changes ranges are invalid");
  if (serverError) startDisabledReasons.push("server unavailable");
  else if (status && !status.liveAvailable) startDisabledReasons.push(status.reason ?? "live inference unavailable on the server");
  if (exhausted) startDisabledReasons.push("the public allowance is exhausted — recorded examples remain available below");

  const start = async (): Promise<void> => {
    if (!scenario || !executionConfig || !draftPolicy || startDisabledReasons.length > 0) return;
    setActionError(null);
    setBusy("starting");
    try {
      const s = await createInvestigation({ scenario, executionConfig, interventionPolicy: draftPolicy as InterventionPolicy, question: holder.question });
      onChange({
        runId: s.runId, summary: s, report: null,
        provenance: s.providerKind === "fixture" ? { kind: "fixture", label: "Fixture investigation — fake transport, 0 real Meta requests" } : { kind: "live", label: "Live investigation (this session)" },
        submitted: { question: holder.question, policy: structuredClone(draftPolicy) },
        selectedCandidateId: "baseline",
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setActionError(AUTH_RECOVERY);
      else if (e instanceof ApiError) {
        const hint = e.status === 400 ? "Check the question and allowed-changes ranges; nothing was resubmitted."
          : e.status === 402 ? "The public allowance cannot fund this run; nothing was resubmitted."
          : e.status === 429 ? "Server busy or rate-limited; wait and press Start again — no automatic retry was made."
          : e.status === 503 ? "Live inference is unavailable (no key, guard, or transport); nothing was resubmitted."
          : "Start failed; nothing was resubmitted.";
        setActionError(`${e.message} ${hint}`);
      } else setActionError(e instanceof Error ? e.message : "Start failed.");
    } finally { setBusy(null); }
  };

  const cancel = async (): Promise<void> => {
    if (!holder.runId) return;
    setBusy("cancelling");
    try {
      const s = await cancelInvestigation(holder.runId);
      const rep = s.report ?? (await getInvestigationReport(holder.runId).catch(() => null));
      onChange({ summary: s, report: rep, runId: null });
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 401 ? AUTH_RECOVERY : e instanceof Error ? `Cancel failed: ${e.message}` : "Cancel failed.");
    } finally { setBusy(null); }
  };

  const loadRecorded = async (): Promise<void> => {
    if (running) { setImportError("An investigation is running; recorded replay stays disabled until it finishes or is cancelled."); return; }
    setImportError(null); setBusy("recorded");
    try {
      const res = await fetch("/evidence/e4a-live-investigation-f24a6a1.json");
      if (!res.ok) throw new Error(`recorded report fetch failed: HTTP ${res.status}`);
      const parsed = parseInvestigationReport(await res.json());
      if (!parsed.report) throw new Error(parsed.error ?? "recorded report is malformed");
      onChange({
        question: parsed.report.input.question,
        permissions: permissionsFromPolicy(parsed.report.input.interventionPolicy),
        report: parsed.report, provenance: provenanceOf(parsed.report, "recorded"),
        summary: null, runId: null,
        submitted: { question: parsed.report.input.question, policy: structuredClone(parsed.report.input.interventionPolicy) },
        selectedCandidateId: parsed.report.recommendation?.candidateId ?? parsed.report.comparison?.baselineCandidateId ?? "baseline",
      });
    } catch (e) { setImportError(e instanceof Error ? e.message : "Recorded report failed to load."); }
    finally { setBusy(null); }
  };

  const importFile = async (file: File): Promise<void> => {
    if (running) { setImportError("An investigation is running; import stays disabled until it finishes or is cancelled."); return; }
    setImportError(null);
    if (file.size > 2_000_000) { setImportError("File exceeds 2 MB; refusing to parse."); return; }
    try {
      const value: unknown = JSON.parse(await file.text());
      const parsed = parseInvestigationReport(value);
      if (!parsed.report) throw new Error(parsed.error ?? "report is malformed");
      onChange({
        question: parsed.report.input.question,
        permissions: permissionsFromPolicy(parsed.report.input.interventionPolicy),
        report: parsed.report, provenance: provenanceOf(parsed.report, "imported"),
        summary: null, runId: null,
        submitted: { question: parsed.report.input.question, policy: structuredClone(parsed.report.input.interventionPolicy) },
        selectedCandidateId: parsed.report.recommendation?.candidateId ?? parsed.report.comparison?.baselineCandidateId ?? "baseline",
      });
    } catch (e) { setImportError(e instanceof Error ? `Malformed report: ${e.message}` : "Malformed report file."); }
  };

  const trace = report?.trace ?? summary?.trace ?? [];
  const requestCount = report?.requestCount ?? summary?.requestCount ?? 0;
  const experimentCount = report?.experimentCount ?? summary?.experimentCount ?? 0;
  const limits = report?.limits ?? summary?.limits ?? { maxModelRequests: 4, maxExperiments: 3, timeoutMs: 120000 };

  return (
    <>
    <label>Supported action<select data-testid="assistant-action" value={action} onChange={e => setAction(e.target.value)}><option value="service">Hypothetical service-duration testing</option><option value="layout">Packing-station layout testing</option></select></label>
    <div hidden={action !== "layout"}><LayoutAssistant holder={props.layoutHolder} /><LayoutResults holder={props.layoutResults} /></div>
    <div hidden={action !== "service"}>
    <div data-testid="ws-assistant">
      <h2>Warehouse assistant</h2>
      <p className="hint">Run this warehouse, explore what slows it down, and test changes. Ask a question, choose which changes LayoutLab may test, then start deliberately — starting inference spends from the capped public allowance.</p>
      {props.loadError && <p className="error" role="alert">{props.loadError}</p>}
      <label htmlFor="ws-question">What would you like to improve?</label>
      <textarea id="ws-question" data-testid="ws-question" rows={3} maxLength={2000} value={holder.question} onChange={(e) => onChange({ question: e.target.value })} />
      <p className="hint">{holder.question.length}/2000. Choose the supported changes below that LayoutLab may test.</p>

      <fieldset data-testid="ws-permissions">
        <legend>Choose which changes LayoutLab may test</legend>
        <p className="hint">Only hypothetical service-time assumptions. Example: “Assume dispatch takes 30 seconds per order” — not a discovered physical improvement.</p>
        {DURATION_FIELDS.map((field) => {
          const draft = holder.permissions[field];
          return (
            <div key={field} className="exp-perm-row">
              <label className="exp-check">
                <input type="checkbox" data-testid={`ws-allow-${field}`} checked={draft.checked} onChange={(e) => onChange({ permissions: { ...holder.permissions, [field]: { ...draft, checked: e.target.checked } } })} />
                {DURATION_LABELS[field]}
              </label>
              <div className="exp-range">
                <label>Min ms<input type="number" data-testid={`ws-min-${field}`} min={1000} max={300000} step={1000} value={draft.minMs} disabled={!draft.checked} onChange={(e) => onChange({ permissions: { ...holder.permissions, [field]: { ...draft, minMs: Number(e.target.value) } } })} /></label>
                <label>Max ms<input type="number" data-testid={`ws-max-${field}`} min={1000} max={300000} step={1000} value={draft.maxMs} disabled={!draft.checked} onChange={(e) => onChange({ permissions: { ...holder.permissions, [field]: { ...draft, maxMs: Number(e.target.value) } } })} /></label>
              </div>
            </div>
          );
        })}
        {policyErrors.map((err) => <p key={err} className="error" role="alert">{err}</p>)}
        <p className="hint">Additional workers, storage-assignment and traffic-policy changes are not supported in this workspace yet, so they are not offered.</p>
      </fieldset>

      {staleDraft && <p className="notice" data-testid="ws-stale-banner" role="status">Inputs changed since this investigation — the results below are previous results, not current measurements. Start a new investigation to test the edited inputs.</p>}

      <fieldset>
        <legend>Test a change</legend>
        <label className="exp-check"><input type="checkbox" data-testid="ws-live-toggle" checked={holder.liveSelected} onChange={(e) => onChange({ liveSelected: e.target.checked })} /> Live investigation (may spend from the public allowance)</label>
        <label className="exp-check"><input type="checkbox" data-testid="ws-consent" checked={holder.consent} onChange={(e) => onChange({ consent: e.target.checked })} /> I consent to send this question and scenario to the configured model</label>
        <div data-testid="ws-server-status" className="hint">
          {serverError ? <span>{serverError}</span> : status ? <span>Server model <span className="mono">{status.modelId}</span> · transport {status.providerKind} · {status.liveAvailable ? "configured (sign-in still required to spend)" : `unavailable: ${status.reason ?? "setup required"}`}</span> : <span>Checking server…</span>}
        </div>
        <div data-testid="ws-allowance" className="hint">
          {budget ? (budget.guard === "active" ? <span>Public allowance: ${budget.availableUsd?.toFixed(2) ?? "—"} available of ${budget.capUsd?.toFixed(2) ?? "—"} · ${budget.perRunReservationUsd?.toFixed(2) ?? "—"} per investigation. {exhausted ? "Exhausted — recorded examples below remain free." : ""}</span> : <span>No public budget guard is configured on this server.</span>) : <span>Allowance unavailable; live start stays disabled until the server responds.</span>}
        </div>
        <p className="hint" data-testid="ws-auth-note">Paid routes require Basic Auth. <a href="/live-access" target="_blank" rel="noreferrer" data-testid="ws-live-access">Live access sign-in (new tab)</a> keeps this tab untouched. <button type="button" className="mini-btn" data-testid="ws-refresh-status" onClick={() => { const c = new AbortController(); Promise.allSettled([getStatus(c.signal), getBudget(c.signal)]).then(([s, b]) => { if (s.status === "fulfilled") { setStatus(s.value); setServerError(null); } if (b.status === "fulfilled") setBudget(b.value); }); }}>Refresh status</button></p>
        <p className="actions">
          <button type="button" className="primary" data-testid="ws-start" disabled={startDisabledReasons.length > 0 || busy !== null} onClick={() => void start()}>▶ Start investigation</button>
          <button type="button" data-testid="ws-cancel" disabled={!running || busy !== null} onClick={() => void cancel()}>Cancel</button>
        </p>
        {startDisabledReasons.length > 0 && <p className="hint" data-testid="ws-start-reason">Start disabled: {startDisabledReasons[0]}.</p>}
        <p className="hint" aria-live="polite" data-testid="ws-run-status">
          {running ? `Running${summary?.phase ? ` · ${PHASE_LABELS[summary.phase] ?? summary.phase}` : ""} · requests ${requestCount}/${limits.maxModelRequests} · experiments ${experimentCount}/${limits.maxExperiments}`
            : report ? `${report.state} · requests ${requestCount}/${limits.maxModelRequests} · experiments ${experimentCount}/${limits.maxExperiments}`
            : "No investigation running. Only Start can spend; running, pausing, selecting, replay, export, and verify never create a run."}
        </p>
        {actionError && <p className="error" role="alert" data-testid="ws-error">{actionError}</p>}
        {(summary?.lastError || report?.lastError) && <p className="hint" role="alert">{summary?.lastError ?? report?.lastError}</p>}
      </fieldset>

      <fieldset>
        <legend>Recorded AI example (free)</legend>
        <p className="actions">
          <button type="button" data-testid="ws-recorded-load" disabled={busy !== null || running} onClick={() => void loadRecorded()}>Recorded AI example</button>
          <label className="filebtn">Import report<input type="file" accept="application/json" disabled={running} data-testid="ws-import" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} /></label>
        </p>
        <p className="hint">Recorded and imported reports replay with zero paid requests. A recorded Meta example is not fresh inference; fixture stays labeled fixture.</p>
        {importError && <p className="error" role="alert" data-testid="ws-import-error">{importError}</p>}
      </fieldset>

      <details className="ws-tech" data-testid="ws-tech">
        <summary>Technical details</summary>
        <p className="hint mono">Server operations implementation: {status?.operationsImplementationVersion ?? "unavailable"} ? Trace entries: {trace.length} · submitted policy: {holder.submitted ? JSON.stringify(holder.submitted.policy) : "none"} · provider config, raw patches, schemas/versions, budgets and request metadata stay here or in Settings, not in the main story.</p>
      </details>
    </div>
    </div></>
  );
}
