// Experiments destination (E4b): question + permitted changes on the left,
// measured evidence on the right. State lives in App above the mode switch,
// so leaving and returning never creates a run or discards a result. The
// browser only calls the same-origin adapter; the local baseline and the
// recorded replay make zero paid requests.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  SIMULATION_VERSION,
  type InterventionPolicy,
} from "@layoutlab/simulation";
import {
  ApiError,
  DURATION_FIELDS,
  DURATION_LABELS,
  buildPolicy,
  cancelInvestigation,
  changedFields,
  createInvestigation,
  defaultPermissions,
  formatPercent,
  formatSeconds,
  getBudget,
  getInvestigation,
  getInvestigationReport,
  getStatus,
  parseInvestigationReport,
  policyEquals,
  provenanceOf,
  runLocalBaseline,
  verifyInvestigation,
  type BudgetInfo,
  type CandidateResult,
  type ComparisonResult,
  type InvestigationReport,
  type InvestigationSummary,
  type PermissionsDraft,
  type Provenance,
  type ApiStatus,
} from "../lib/experiments";
import { buildSceneForScenario, burstScenarioAndConfig, createControllerForScenario } from "../lib/operations";
import { OperationsPanel, type OpsRunState } from "./OperationsPanel";

export type ExperimentsHolder = {
  question: string;
  permissions: PermissionsDraft;
  liveSelected: boolean;
  consent: boolean;
  submitted: { question: string; policy: InterventionPolicy } | null;
  runId: string | null;
  summary: InvestigationSummary | null;
  report: InvestigationReport | null;
  provenance: Provenance | null;
  selectedCandidateId: string | null;
};

export function initialExperimentsHolder(): ExperimentsHolder {
  return {
    question: "Can a faster dispatch assumption improve makespan without adding workers?",
    permissions: defaultPermissions(),
    liveSelected: false,
    consent: false,
    submitted: null,
    runId: null,
    summary: null,
    report: null,
    provenance: null,
    selectedCandidateId: "baseline",
  };
}

function permissionsFromPolicy(policy: InterventionPolicy): PermissionsDraft {
  const draft = defaultPermissions();
  for (const field of DURATION_FIELDS) {
    if (policy.allowedFields.includes(field)) {
      const range = policy.ranges?.[field];
      draft[field] = { checked: true, minMs: range?.min ?? 1000, maxMs: range?.max ?? 60000 };
    }
  }
  return draft;
}

const PHASE_LABELS: Record<string, string> = {
  EVALUATING_BASELINE: "Evaluating baseline (local engine)",
  REQUESTING_MODEL: "Requesting model",
  EVALUATING_EXPERIMENT: "Evaluating experiment (engine)",
  FINALIZING: "Finalizing",
};

function stateBadge(state: string | null): { label: string; cls: string } {
  if (!state) return { label: "READY — no investigation yet", cls: "badge-info" };
  if (state === "RUNNING") return { label: "RUNNING", cls: "warn" };
  if (state === "COMPLETED") return { label: "COMPLETED", cls: "valid" };
  if (state === "CANCELLED") return { label: "CANCELLED", cls: "warn" };
  if (state === "TIMED_OUT") return { label: "TIMED OUT", cls: "warn" };
  return { label: state, cls: "invalid" };
}

const AUTH_RECOVERY =
  "Sign-in required (401): live investigation routes need Basic Auth, even though this page, status, budget, baseline, recorded replay, export, and verify are public. Open “Live access sign-in” in a new tab, complete the browser sign-in prompt, return here, press Refresh status, then deliberately press Start again. Nothing was resubmitted automatically and no credentials are stored in this page.";

export function ExperimentsPanel(props: {
  holder: ExperimentsHolder;
  onChange: (patch: Partial<ExperimentsHolder>) => void;
}): React.JSX.Element {
  const { holder, onChange } = props;
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [budget, setBudget] = useState<BudgetInfo | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; mismatches: string[] } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [inspectRun, setInspectRun] = useState<OpsRunState | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const pollSeq = useRef(0);

  const burst = useMemo(() => {
    try {
      return { ok: true as const, ...burstScenarioAndConfig() };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  const localBaseline = useMemo<ComparisonResult | null>(() => {
    if (!burst.ok) return null;
    try {
      return runLocalBaseline(burst.scenario, burst.executionConfig);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst.ok]);

  // Server truth for live gating. Recorded/offline paths never need this.
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.allSettled([getStatus(ctrl.signal), getBudget(ctrl.signal)]).then(([s, b]) => {
      if (ctrl.signal.aborted) return;
      if (s.status === "fulfilled") setStatus(s.value);
      if (b.status === "fulfilled") setBudget(b.value);
      if (s.status === "rejected" && b.status === "rejected") {
        setServerError("Server unavailable — live start is disabled; baseline, recorded replay, import, and inspection still work offline.");
      } else if (s.status === "rejected") {
        setServerError("Server status unavailable — live start is disabled until the API responds.");
      }
    });
    return () => ctrl.abort();
  }, []);

  const report = holder.report;
  const comparison: ComparisonResult | null = report?.comparison ?? localBaseline;
  const candidates: CandidateResult[] = comparison?.candidates ?? [];
  const baselineCandidate = candidates.find((c) => c.candidateId === (comparison?.baselineCandidateId ?? "baseline")) ?? candidates[0] ?? null;
  const selectedCandidate: CandidateResult | null =
    candidates.find((c) => c.candidateId === holder.selectedCandidateId) ?? baselineCandidate;
  const summary = holder.summary;
  const running = summary?.state === "RUNNING" || (holder.runId !== null && report === null && summary === null);
  const displayState = report?.state ?? summary?.state ?? null;
  const badge = stateBadge(running ? "RUNNING" : displayState);

  const { policy: draftPolicy, errors: policyErrors } = useMemo(() => buildPolicy(holder.permissions), [holder.permissions]);
  const staleDraft = Boolean(
    holder.submitted && report && draftPolicy &&
      (holder.question !== holder.submitted.question || !policyEquals(draftPolicy, holder.submitted.policy)),
  );

  // Poll the SAME runId about every 1s. Mode switches unmount this panel:
  // the effect aborts and clears its timer, App keeps the runId, and
  // remounting resumes polling without any new POST.
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
        if (s.state === "RUNNING") {
          onChange({ summary: s });
          return;
        }
        const rep = s.report ?? (await getInvestigationReport(runId, ctrl.signal).catch(() => null));
        if (stopped || pollSeq.current !== seq) return;
        onChange({ summary: s, report: rep, provenance: rep ? provenanceOf(rep, "live") : holder.provenance });
      } catch (e) {
        if (stopped || ctrl.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) {
          setActionError(AUTH_RECOVERY);
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          setActionError(`Run ${runId} is unknown to this server (it may have restarted). Its local evidence is kept; no new run was submitted.`);
          onChange({ runId: null });
          return;
        }
        setActionError(e instanceof Error ? e.message : "Polling failed.");
      } finally {
        tickInFlight = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    return () => {
      stopped = true;
      ctrl.abort();
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holder.runId, report?.state]);

  const startDisabledReasons: string[] = [];
  if (!burst.ok) startDisabledReasons.push("burst scenario failed to load");
  if (running) startDisabledReasons.push("an investigation is already running");
  if (!holder.liveSelected) startDisabledReasons.push("select Live investigation first (explicit live selection)");
  if (!holder.consent) startDisabledReasons.push("Contributor-data consent is required");
  if (holder.question.trim().length === 0) startDisabledReasons.push("the planning question is empty");
  if (policyErrors.length > 0) startDisabledReasons.push("allowed-changes ranges are invalid");
  if (serverError) startDisabledReasons.push("server unavailable");
  else if (status && !status.liveAvailable) startDisabledReasons.push(status.reason ?? "live inference unavailable on the server");
  if (budget?.guard === "active" && budget.availableUsd !== undefined && budget.perRunReservationUsd !== undefined && budget.availableUsd < budget.perRunReservationUsd) {
    startDisabledReasons.push(`insufficient public allowance: $${budget.perRunReservationUsd.toFixed(2)} per investigation, $${budget.availableUsd.toFixed(2)} available`);
  }

  const start = async (): Promise<void> => {
    if (!burst.ok || !draftPolicy || startDisabledReasons.length > 0) return;
    setActionError(null);
    setVerifyResult(null);
    setBusy("starting");
    try {
      const s = await createInvestigation({
        scenario: burst.scenario,
        executionConfig: burst.executionConfig,
        interventionPolicy: draftPolicy,
        question: holder.question,
      });
      onChange({
        runId: s.runId,
        summary: s,
        report: null,
        provenance: s.providerKind === "fixture" ? { kind: "fixture", label: "Fixture investigation — fake transport, 0 real Meta requests" } : { kind: "live", label: "Live investigation (this session)" },
        submitted: { question: holder.question, policy: structuredClone(draftPolicy) },
        selectedCandidateId: "baseline",
      });
      setInspectId(null);
      setInspectRun(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setActionError(AUTH_RECOVERY);
      } else if (e instanceof ApiError) {
        const hint =
          e.status === 400 ? "Check the question and allowed-changes ranges; nothing was resubmitted."
          : e.status === 402 ? "The public allowance cannot fund this run; nothing was resubmitted."
          : e.status === 429 ? "Server busy or rate-limited; wait and press Start again — no automatic retry was made."
          : e.status === 503 ? "Live inference is unavailable (no key, guard, or transport); nothing was resubmitted."
          : "Start failed; nothing was resubmitted.";
        setActionError(`${e.message} ${hint}`);
      } else {
        setActionError(e instanceof Error ? e.message : "Start failed.");
      }
    } finally {
      setBusy(null);
    }
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
    } finally {
      setBusy(null);
    }
  };

  const loadRecorded = async (): Promise<void> => {
    if (running) {
      setImportError("An investigation is running; recorded replay stays disabled until it finishes or is cancelled, so the active run is never silently replaced.");
      return;
    }
    setImportError(null);
    setBusy("recorded");
    try {
      const res = await fetch("/evidence/e4a-live-investigation-f24a6a1.json");
      if (!res.ok) throw new Error(`recorded report fetch failed: HTTP ${res.status}`);
      const parsed = parseInvestigationReport(await res.json());
      if (!parsed.report) throw new Error(parsed.error ?? "recorded report is malformed");
      onChange({
        question: parsed.report.input.question,
        permissions: permissionsFromPolicy(parsed.report.input.interventionPolicy),
        report: parsed.report,
        provenance: provenanceOf(parsed.report, "recorded"),
        summary: null,
        runId: null,
        submitted: { question: parsed.report.input.question, policy: structuredClone(parsed.report.input.interventionPolicy) },
        selectedCandidateId: parsed.report.recommendation?.candidateId ?? parsed.report.comparison?.baselineCandidateId ?? "baseline",
      });
      setVerifyResult(null);
      setInspectId(null);
      setInspectRun(null);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Recorded report failed to load.");
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (file: File): Promise<void> => {
    if (running) {
      setImportError("An investigation is running; import stays disabled until it finishes or is cancelled, so the active run is never silently replaced.");
      return;
    }
    setImportError(null);
    if (file.size > 2_000_000) {
      setImportError("File exceeds 2 MB; refusing to parse.");
      return;
    }
    try {
      const value: unknown = JSON.parse(await file.text());
      const parsed = parseInvestigationReport(value);
      if (!parsed.report) throw new Error(parsed.error ?? "report is malformed");
      onChange({
        question: parsed.report.input.question,
        permissions: permissionsFromPolicy(parsed.report.input.interventionPolicy),
        report: parsed.report,
        provenance: provenanceOf(parsed.report, "imported"),
        summary: null,
        runId: null,
        submitted: { question: parsed.report.input.question, policy: structuredClone(parsed.report.input.interventionPolicy) },
        selectedCandidateId: parsed.report.recommendation?.candidateId ?? parsed.report.comparison?.baselineCandidateId ?? "baseline",
      });
      setVerifyResult(null);
      setInspectId(null);
      setInspectRun(null);
    } catch (e) {
      setImportError(e instanceof Error ? `Malformed report: ${e.message}` : "Malformed report file.");
    }
  };

  const exportReport = (): void => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `layoutlab-investigation-${report.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const recompute = async (): Promise<void> => {
    if (!report) return;
    setVerifyError(null);
    setBusy("verifying");
    try {
      setVerifyResult(await verifyInvestigation(report));
    } catch (e) {
      setVerifyResult(null);
      setVerifyError(e instanceof Error ? `Recompute unavailable: ${e.message} Use the offline CLI below instead.` : "Recompute unavailable.");
    } finally {
      setBusy(null);
    }
  };

  const openInspection = (candidateId: string): void => {
    setInspectError(null);
    const candidate = candidates.find((c) => c.candidateId === candidateId);
    if (!candidate) return;
    if (!candidate.report) {
      setInspectId(null);
      setInspectRun(null);
      setInspectError(`Candidate ${candidateId} is ${candidate.status} (${candidate.reason ?? "no executed run"}); visualization is disabled instead of drawing an unrelated warehouse.`);
      return;
    }
    try {
      const scenario = candidate.report.scenario;
      const executionConfig = report?.input.executionConfig ?? (burst.ok ? burst.executionConfig : null);
      if (!executionConfig) throw new Error("execution config unavailable for inspection");
      const scene = buildSceneForScenario(scenario);
      const controller = createControllerForScenario(scenario, executionConfig);
      setInspectId(candidateId);
      setInspectRun({ scene, controller });
    } catch (e) {
      setInspectId(null);
      setInspectRun(null);
      setInspectError(`Visualization disabled: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const resetInspection = (): void => {
    if (!inspectId) return;
    const candidate = candidates.find((c) => c.candidateId === inspectId);
    if (!candidate?.report) return;
    try {
      const executionConfig = report?.input.executionConfig ?? (burst.ok ? burst.executionConfig : null);
      if (!executionConfig) return;
      const scene = buildSceneForScenario(candidate.report.scenario);
      setInspectRun({ scene, controller: createControllerForScenario(candidate.report.scenario, executionConfig) });
    } catch {
      // Keep the current controller; the error surface above already reports.
    }
  };

  // Refresh server truth after a terminal run so a spent allowance shows.
  const terminalKey = report && report.state !== "RUNNING" ? `${report.runId}:${report.state}` : null;
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!terminalKey || refreshedFor.current === terminalKey) return;
    refreshedFor.current = terminalKey;
    const ctrl = new AbortController();
    Promise.allSettled([getStatus(ctrl.signal), getBudget(ctrl.signal)]).then(([s, b]) => {
      if (ctrl.signal.aborted) return;
      if (s.status === "fulfilled") setStatus(s.value);
      if (b.status === "fulfilled") setBudget(b.value);
    });
    return () => ctrl.abort();
  }, [terminalKey]);

  const scenario = burst.ok ? burst.scenario : null;
  const trace = report?.trace ?? summary?.trace ?? [];
  const requests = report?.requests ?? summary?.requests ?? [];
  const recommendation = report?.recommendation ?? summary?.recommendation ?? null;
  const limits = report?.limits ?? summary?.limits ?? { maxModelRequests: 4, maxExperiments: 3, timeoutMs: 120000 };
  const requestCount = report?.requestCount ?? summary?.requestCount ?? 0;
  const experimentCount = report?.experimentCount ?? summary?.experimentCount ?? 0;
  const changed = selectedCandidate && scenario && report ? changedFields(report.input.scenario, selectedCandidate) : selectedCandidate && scenario ? changedFields(scenario, selectedCandidate) : [];
  const ordersOfSelected = selectedCandidate?.report?.orders ?? [];

  return (
    <div data-testid="experiments-panel">
      <div className="ops-status" data-testid="exp-scenario">
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        {scenario ? (
          <span className="mono">
            {scenario.id} · seed {scenario.seed} · {scenario.orderSchedule.length} orders · {scenario.deliverySchedule.length} deliveries ·{" "}
            {scenario.products.length} products · {scenario.locations.length} slots · {scenario.mobileUnits.length} units · {scenario.resources.length} resources
          </span>
        ) : (
          <span className="error" role="alert">Operations sample failed to load{burst.ok ? "" : `: ${burst.error}`}. No warehouse is shown.</span>
        )}
        <span className="mono dim">
          sim {SIMULATION_VERSION} · schema {OPERATIONS_SCHEMA_VERSION} · engine {OPERATIONS_ENGINE_VERSION}
          {report ? ` · api ${report.versions.api} · prompt ${report.versions.prompt}` : ""}
        </span>
        <span className="hint">SYNTHETIC operations sample. Baseline runs locally with zero model requests.</span>
      </div>

      <div className="exp-workspace">
        <div className="panel exp-controls">
          <h2>Investigate a bottleneck</h2>
          <p className="hint">Form a hypothesis. Run controlled tests. Inspect the evidence. Free text grants nothing — only the allowed changes below authorize experiment patches.</p>

          <label htmlFor="exp-question">Planning question</label>
          <textarea
            id="exp-question"
            data-testid="exp-question"
            rows={4}
            maxLength={2000}
            value={holder.question}
            onChange={(e) => onChange({ question: e.target.value })}
          />
          <p className="hint">{holder.question.length}/2000 characters. The question, permissions, scenario, and execution config freeze when an investigation starts.</p>

          <fieldset data-testid="exp-permissions">
            <legend>Allowed changes (hypothetical service assumptions)</legend>
            <p className="hint">Only these service-duration assumptions may change. Values are synthetic assumptions, not measured savings.</p>
            {DURATION_FIELDS.map((field) => {
              const draft = holder.permissions[field];
              return (
                <div key={field} className="exp-perm-row">
                  <label className="exp-check">
                    <input
                      type="checkbox"
                      data-testid={`exp-allow-${field}`}
                      checked={draft.checked}
                      onChange={(e) =>
                        onChange({
                          permissions: { ...holder.permissions, [field]: { ...draft, checked: e.target.checked } },
                        })
                      }
                    />
                    {DURATION_LABELS[field]}
                  </label>
                  <div className="exp-range">
                    <label>
                      Min ms
                      <input
                        type="number"
                        data-testid={`exp-min-${field}`}
                        min={1000}
                        max={300000}
                        step={1000}
                        value={draft.minMs}
                        disabled={!draft.checked}
                        onChange={(e) =>
                          onChange({ permissions: { ...holder.permissions, [field]: { ...draft, minMs: Number(e.target.value) } } })
                        }
                      />
                    </label>
                    <label>
                      Max ms
                      <input
                        type="number"
                        data-testid={`exp-max-${field}`}
                        min={1000}
                        max={300000}
                        step={1000}
                        value={draft.maxMs}
                        disabled={!draft.checked}
                        onChange={(e) =>
                          onChange({ permissions: { ...holder.permissions, [field]: { ...draft, maxMs: Number(e.target.value) } } })
                        }
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            {policyErrors.map((err) => (
              <p key={err} className="error" role="alert">{err}</p>
            ))}
            <div className="exp-perm-row" data-testid="exp-staffing-note">
              <label className="exp-check">
                <input type="checkbox" disabled aria-disabled="true" data-testid="exp-allow-staffing" />
                Additional workers (extra pickers / putaway)
              </label>
              <p className="hint">Not allowed — staffing stays fixed. Current burst geometry cannot support added staff: parking clones are infeasible and remain invalid candidates in the engine comparison.</p>
            </div>
            <p className="hint">No storage-assignment or traffic-policy changes exist in the supported patch surface, so none are offered.</p>
          </fieldset>

          <fieldset>
            <legend>Live investigation</legend>
            <label className="exp-check">
              <input
                type="checkbox"
                data-testid="exp-live-toggle"
                checked={holder.liveSelected}
                onChange={(e) => onChange({ liveSelected: e.target.checked })}
              />
              Live investigation (may spend from the public allowance)
            </label>
            <label className="exp-check">
              <input
                type="checkbox"
                data-testid="exp-consent"
                checked={holder.consent}
                onChange={(e) => onChange({ consent: e.target.checked })}
              />
              I consent to send this question and scenario to the configured Contributor model
            </label>
            <div data-testid="exp-server-status" className="hint">
              {serverError ? (
                <span>{serverError}</span>
              ) : status ? (
                <span>
                  Server model <span className="mono">{status.modelId}</span> · transport {status.providerKind} ·{" "}
                  {status.liveAvailable ? "live available" : `unavailable: ${status.reason ?? "setup required"}`}
                </span>
              ) : (
                <span>Checking server…</span>
              )}
            </div>
            <div data-testid="exp-allowance" className="hint">
              {budget ? (
                budget.guard === "active" ? (
                  <span>
                    Public allowance: ${budget.availableUsd?.toFixed(2) ?? "—"} available of ${budget.capUsd?.toFixed(2) ?? "—"} · $
                    {budget.perRunReservationUsd?.toFixed(2) ?? "—"} per investigation (server-configured).
                  </span>
                ) : (
                  <span>No public budget guard is configured on this server; live start follows server availability above.</span>
                )
              ) : (
                <span>Allowance unavailable; live start stays disabled until the server responds.</span>
              )}
            </div>
            <p className="hint" data-testid="exp-auth-note">
              “Live available” above means the server is configured; it does not mean you are signed in. Paid investigation routes
              additionally require Basic Auth.{" "}
              <a href="/live-access?mode=experiments" target="_blank" rel="noreferrer" data-testid="exp-live-access">
                Live access sign-in (new tab)
              </a>{" "}
              keeps this tab and its inputs untouched. After signing in, return here and refresh before a deliberate retry.{" "}
              <button type="button" className="mini-btn" data-testid="exp-refresh-status" onClick={() => {
                const ctrl = new AbortController();
                Promise.allSettled([getStatus(ctrl.signal), getBudget(ctrl.signal)]).then(([s, b]) => {
                  if (s.status === "fulfilled") { setStatus(s.value); setServerError(null); }
                  if (b.status === "fulfilled") setBudget(b.value);
                });
              }}>
                Refresh status
              </button>
            </p>
            <p className="actions">
              <button type="button" className="primary" data-testid="exp-start" disabled={startDisabledReasons.length > 0 || busy !== null} onClick={() => void start()}>
                ▶ Start investigation
              </button>
              <button type="button" data-testid="exp-cancel" disabled={!running || busy !== null} onClick={() => void cancel()}>
                Cancel investigation
              </button>
            </p>
            {startDisabledReasons.length > 0 && <p className="hint" data-testid="exp-start-reason">Start disabled: {startDisabledReasons[0]}.</p>}
            <p className="hint" aria-live="polite" data-testid="exp-run-status">
              {running
                ? `Running${summary?.phase ? ` · ${PHASE_LABELS[summary.phase] ?? summary.phase}` : ""} · requests ${requestCount}/${limits.maxModelRequests} · experiments ${experimentCount}/${limits.maxExperiments} · run ${(holder.runId ?? report?.runId ?? "—").slice(0, 8)}…`
                : report
                  ? `${report.state} · requests ${requestCount}/${limits.maxModelRequests} · experiments ${experimentCount}/${limits.maxExperiments} · run ${report.runId}`
                  : "No investigation running. Only Start can spend; polling, switching modes, replay, and verify never create a run."}
            </p>
            {actionError && <p className="error" role="alert" data-testid="exp-error">{actionError}</p>}
            {(summary?.lastError || report?.lastError) && <p className="hint" role="alert">{summary?.lastError ?? report?.lastError}</p>}
          </fieldset>

          <fieldset>
            <legend>Recorded &amp; offline</legend>
            <p className="actions">
              <button type="button" data-testid="exp-recorded-load" disabled={busy !== null || running} title={running ? "Disabled while an investigation is running; finish or cancel it first" : undefined} onClick={() => void loadRecorded()}>
                Load recorded Meta example
              </button>
              <label className="filebtn">
                Import report JSON
                <input
                  type="file"
                  accept="application/json"
                  disabled={running}
                  data-testid="exp-import"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </p>
            <p className="hint">Recorded and imported reports replay with zero paid requests. Fixture reports stay labeled fixture.{running ? " While an investigation is running, recorded/import are disabled so the active run is never silently replaced — finish or cancel it first." : ""}</p>
            {importError && <p className="error" role="alert" data-testid="exp-import-error">{importError}</p>}
          </fieldset>
        </div>

        <div className="exp-evidence">
          {holder.provenance && report && (
            <div className="panel inset" data-testid="exp-provenance">
              <p>
                <strong>{holder.provenance.label}</strong> · run <span className="mono">{report.runId}</span> · model{" "}
                <span className="mono">{report.returnedModel ?? report.configuredModel}</span> · recorded {report.createdAt.slice(0, 10)} ·{" "}
                {report.providerKind === "meta" ? `${report.realMetaRequests} historical Meta requests (not new inference)` : "0 real Meta requests"}
              </p>
              <p className="hint">Provenance is separate from live configuration. Replaying, inspecting, exporting, or verifying this report makes no paid requests.</p>
            </div>
          )}
          {staleDraft && (
            <p className="notice" data-testid="exp-stale-banner" role="status">
              Inputs changed since this investigation — the evidence below is from the previous question/permissions and is not reinterpreted. Start a new investigation to test the edited inputs.
            </p>
          )}

          <div className="exp-cards" data-testid="exp-cards">
            {candidates.map((c) => {
              const unavailable = (v: number | null, what: string): string => (v === null ? `— (${what})` : String(v));
              return (
                <div key={c.candidateId} className={`metric exp-card${c.candidateId === holder.selectedCandidateId ? " exp-card-on" : ""}`}>
                  <div>
                    <p className="metric-label">
                      {c.isBaseline ? "Baseline" : c.candidateId} · {c.status}
                      {recommendation?.candidateId === c.candidateId ? " · recommended" : ""}
                    </p>
                    <p className="hint mono">{c.candidateId}{c.patch && Object.keys(c.patch).length > 0 ? ` · ${JSON.stringify(c.patch)}` : " · no-change patch"}</p>
                    <p className="exp-nums">
                      Shipped {unavailable(c.shipped, "not measured")} · Backlog {unavailable(c.backlog, "not measured")} · Makespan{" "}
                      <span title={c.makespanMs === null ? (c.reason ?? "unavailable") : `${c.makespanMs} ms`}>{formatSeconds(c.makespanMs)}</span> · Wait{" "}
                      <span title={c.totalWaitMs === null ? (c.reason ?? "unavailable") : `${c.totalWaitMs} ms`}>{formatSeconds(c.totalWaitMs)}</span>
                    </p>
                    {c.reason && <p className="hint">{c.reason}</p>}
                    <p className="actions">
                      <button type="button" className="mini-btn" aria-pressed={holder.selectedCandidateId === c.candidateId} onClick={() => onChange({ selectedCandidateId: c.candidateId })}>
                        Select {c.candidateId}
                      </button>
                      <button type="button" className="mini-btn" data-testid={`exp-inspect-${c.candidateId}`} onClick={() => openInspection(c.candidateId)}>
                        Inspect
                      </button>
                    </p>
                  </div>
                </div>
              );
            })}
            {candidates.length === 0 && <p className="hint">No baseline yet — the operations sample failed to evaluate.</p>}
          </div>
          <p className="hint">Total wait is the summed engine wait intervals (open intervals clipped at the report clock). No traffic or packing submetrics are exported, so none are shown. Percents display at one decimal; full precision stays in details and export.</p>

          {recommendation && (
            <div className="panel inset" data-testid="exp-recommendation">
              <h3>Recommendation: {recommendation.candidateId}</h3>
              <p>
                {recommendation.source === "model" ? "Model recommendation" : "Deterministic best / fallback (no valid model finish)"} · model-selected{" "}
                {recommendation.modelSelectedCandidateId ?? "—"} · deterministic best {recommendation.deterministicBestCandidateId ?? "—"} ·{" "}
                {recommendation.improvedOverBaseline ? "improves on baseline under the E3 ranking" : "no measured improvement over baseline is claimed"}
              </p>
              <p className="hint">{recommendation.explanation}</p>
            </div>
          )}

          <div className="panel" data-testid="exp-trace-panel">
            <h3>Hypotheses &amp; action trace</h3>
            {trace.length === 0 ? (
              <p className="hint">No investigation trace yet. Hypotheses will appear here labeled as model assertions, with accepted and rejected actions kept visible.</p>
            ) : (
              <ol className="exp-trace" data-testid="exp-trace">
                {trace.map((t) => (
                  <li key={t.seq}>
                    <span className="mono">#{t.seq} {t.kind}</span> · {t.candidateId ?? "—"} · {t.status}
                    {t.requestIndex !== null ? ` · request ${t.requestIndex}` : ""}
                    {t.hypothesis && (
                      <span> · Hypothesis (model assertion — not measured proof): “{t.hypothesis}”</span>
                    )}
                    {t.patch && Object.keys(t.patch).length > 0 && <span className="mono"> · {JSON.stringify(t.patch)}</span>}
                    {(t.shipped !== null || t.makespanMs !== null) && (
                      <span> · shipped {t.shipped ?? "—"} · makespan {formatSeconds(t.makespanMs)} · wait {formatSeconds(t.totalWaitMs)}</span>
                    )}
                    {t.reason && <span> · {t.reason}</span>}
                  </li>
                ))}
              </ol>
            )}
            {requests.length > 0 && (
              <p className="hint mono" data-testid="exp-requests">
                Requests: {requests.map((r) => `#${r.index} ${r.status}${r.model ? ` ${r.model}` : ""}${r.durationMs !== null ? ` ${r.durationMs}ms` : ""}`).join(" · ")}
              </p>
            )}
          </div>

          <div className="panel">
            <h3>Comparison (all candidates, failures included)</h3>
            <div className="table-scroll">
              <table data-testid="exp-compare-table">
                <thead>
                  <tr><th>Candidate</th><th>Status</th><th>Shipped</th><th>Backlog</th><th>Makespan</th><th>Total wait</th><th>Makespan vs baseline</th></tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const baseMs = baselineCandidate?.makespanMs ?? null;
                    const pct = baseMs !== null && c.makespanMs !== null && baseMs !== 0 ? ((baseMs - c.makespanMs) / baseMs) * 100 : null;
                    return (
                      <tr key={c.candidateId} aria-selected={holder.selectedCandidateId === c.candidateId} className={holder.selectedCandidateId === c.candidateId ? "selected" : ""}>
                        <td className="mono">{c.candidateId}</td>
                        <td>{c.status}</td>
                        <td>{c.shipped ?? "—"}</td>
                        <td>{c.backlog ?? "—"}</td>
                        <td title={c.makespanMs === null ? (c.reason ?? "unavailable") : `${c.makespanMs} ms`}>{formatSeconds(c.makespanMs)}</td>
                        <td title={c.totalWaitMs === null ? (c.reason ?? "unavailable") : `${c.totalWaitMs} ms`}>{formatSeconds(c.totalWaitMs)}</td>
                        <td>{c.isBaseline ? "baseline" : formatPercent(pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <label>
              Selected run
              <select data-testid="exp-select-candidate" value={holder.selectedCandidateId ?? "baseline"} onChange={(e) => onChange({ selectedCandidateId: e.target.value })}>
                {candidates.map((c) => (
                  <option key={c.candidateId} value={c.candidateId}>{c.candidateId} · {c.status}</option>
                ))}
              </select>
            </label>
          </div>

          {inspectError && <p className="error" role="alert" data-testid="exp-inspect-error">{inspectError}</p>}
          {inspectRun && inspectId && (
            <div className="panel" data-testid="exp-inspection">
              <div className="warehouse-head">
                <h3>Inspecting {inspectId} (separate engine replay)</h3>
                <button type="button" data-testid="exp-close-inspection" onClick={() => { setInspectId(null); setInspectRun(null); }}>Close inspection</button>
              </div>
              <p className="hint">Actual engine replay of this candidate only; the ongoing Operations Simulation run is untouched. Service-duration changes show in changed fields, not as moved racks.</p>
              <OperationsPanel run={inspectRun} onResetRun={resetInspection} />
            </div>
          )}

          <details className="panel exp-details" data-testid="exp-details">
            <summary>Run details: changed fields, policy, orders, requests, limitations</summary>
            {selectedCandidate ? (
              <>
                <h4>Changed fields for {selectedCandidate.candidateId} (before → after)</h4>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Field</th><th>Before (baseline)</th><th>After (candidate)</th></tr></thead>
                    <tbody>
                      {changed.map((row) => (
                        <tr key={row.field}><td>{row.label}</td><td>{row.before}</td><td>{row.after}{row.changed ? " · changed" : ""}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h4>Allowed policy</h4>
                <p className="mono">{report ? JSON.stringify(report.input.interventionPolicy) : JSON.stringify(holder.submitted?.policy ?? { allowedFields: [] })}</p>
                <h4>Per-order outcomes ({selectedCandidate.candidateId})</h4>
                {ordersOfSelected.length > 0 ? (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Order</th><th>State</th><th>Timestamps (ms since start)</th></tr></thead>
                      <tbody>
                        {ordersOfSelected.map((o) => (
                          <tr key={o.orderId}><td className="mono">{o.orderId}</td><td>{o.state}</td><td className="mono">{Object.entries(o.timestamps).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="hint">No executed run for this candidate ({selectedCandidate.status}); per-order timestamps are unavailable, not zero.</p>
                )}
                <h4>Model / request metadata</h4>
                <p className="mono">
                  {report
                    ? `configured ${report.configuredModel} · returned ${report.returnedModel ?? "—"} · providerKind ${report.providerKind} · realMetaRequests ${report.realMetaRequests} · claim ${report.budget.claimId ?? "none (no guard)"}`
                    : "No investigation report yet."}
                </p>
                {requests.map((r) => (
                  <p key={r.index} className="mono hint">#{r.index} {r.status} · response {r.responseId ?? "—"} · finish {r.finishReason ?? "—"} · tokens {r.usage ? `${r.usage.promptTokens ?? "?"}/${r.usage.completionTokens ?? "?"}/${r.usage.totalTokens ?? "?"}` : "—"} · {r.errorCode ?? ""} {r.error ?? ""}</p>
                ))}
                <h4>Limitations</h4>
                <ul className="hint">
                  {(report?.limitations ?? ["Synthetic scenario; service durations are assumptions, not measured savings.", "Offline verification reruns the engine only; inference provenance is recorded metadata, not authenticated proof."]).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="hint">Select a candidate to see its changed fields and evidence.</p>
            )}
          </details>

          <div className="panel">
            <h3>Export &amp; recompute</h3>
            <p className="actions">
              <button type="button" data-testid="exp-export" disabled={!report} onClick={exportReport}>Export investigation JSON</button>
              <button type="button" data-testid="exp-verify" disabled={!report || busy !== null} onClick={() => void recompute()}>Recompute (server verifier)</button>
            </p>
            {!report && <p className="hint">Export and recompute need an investigation report (live, recorded, or imported). Partial failed/cancelled evidence exports too.</p>}
            {verifyResult && (
              <div data-testid="exp-verify-result" role="status">
                {verifyResult.ok ? (
                  <p className="okline">✓ Recomputed successfully — saved measurements follow from the embedded inputs (engine-only replay; live inference provenance is recorded metadata, not authenticated proof).</p>
                ) : (
                  <p className="error">× Recompute mismatches: {verifyResult.mismatches.join("; ")}</p>
                )}
              </div>
            )}
            {verifyError && <p className="error" role="alert">{verifyError}</p>}
            <p className="hint mono">Offline CLI: npm run build --workspace @layoutlab/simulation &amp;&amp; npm run build --workspace @layoutlab/api &amp;&amp; node scripts/verify-operations-investigation.mjs &lt;export.json&gt;</p>
          </div>
        </div>
      </div>
    </div>
  );
}
