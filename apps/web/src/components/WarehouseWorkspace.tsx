import "./first-minute.css";
import type { DirectEditorBridge } from "../lib/direct-editor";
// One canonical warehouse workspace: a single dominant Operations viewer
// stays visible through running, selection, asking, testing and comparison.
// One active scenario + execution config feeds the viewer, baseline,
// assistant submission, results and exports. Baseline and candidate
// controllers are retained separately; only one heavy canvas is mounted.
import { useEffect, useRef, useState } from "react";
import { operationsRunMetrics, type OperationsController, type OperationsSnapshot } from "@layoutlab/simulation";
import {
  buildSceneForScenario,
  burstScenarioAndConfig,
  createBurstController,
  createControllerForVersioned,
  currentImplementationVersion,
  loadBurstOperationsScene,
  loadOperationsScene,
  type OperationsScene,
  type OperationsSelection,
} from "../lib/operations";
import {
  changedFields,
  formatSeconds,
  verifyInvestigation,
  type CandidateResult,
} from "../lib/experiments";
import { canonicalIdentity, replayVersion, friendlyCandidateStatus, completionLabel, formatClockMs, formatFinishTime, humanOptionName, inputIdentity, isStaleReport, remainingCounts } from "../lib/workspace";
import { OperationsView, type LabelLayer, type OpsRenderStats } from "./OperationsView";
import { fmtClock, selectionDetail } from "./OperationsPanel";
import { LayoutEditor } from "./LayoutEditor";
import { useLayoutResults } from "./LayoutResults";
import { useLayoutAssistant } from "./LayoutAssistant";
import { WarehouseAssistant } from "./WarehouseAssistant";
import type { ExperimentsHolder } from "./ExperimentsPanel";

type Speed = 1 | 4 | 16;
type CurrentContext = { implementationVersion: string; key: string; label: string; scene: OperationsScene; controller: OperationsController; executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number } };
type InspectContext = { implementationVersion: string; candidateId: string; label: string; scene: OperationsScene; controller: OperationsController };

function buildBurstContext(): CurrentContext {
  return { implementationVersion: currentImplementationVersion(), key: "burst", label: "Sample data — 6-order picking & packing", scene: loadBurstOperationsScene(), controller: createBurstController(), executionConfig: burstScenarioAndConfig().executionConfig };
}
function buildFullContext(): CurrentContext {
  const scene = loadOperationsScene();
  const { executionConfig } = burstScenarioAndConfig();
  const controller = createControllerForVersioned(scene.scenario, executionConfig, currentImplementationVersion());
  return { implementationVersion: currentImplementationVersion(), key: "full", label: "Sample data — full shift (28 orders + 12 deliveries)", scene, controller, executionConfig };
}

export function WarehouseWorkspace(props: {
  holder: ExperimentsHolder;
  onChange: (patch: Partial<ExperimentsHolder>) => void;
  onOpenLegacy: () => void;
}): React.JSX.Element {
  const { holder, onChange } = props;
  const [current, setCurrent] = useState<CurrentContext | { error: string }>(() => {
    try { return buildBurstContext(); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  });
  const [assistantPreview, setAssistantPreview] = useState(false);
  const [layoutPreview, setLayoutPreview] = useState<OperationsScene | null>(null);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [layoutHistory, setLayoutHistory] = useState<import("../lib/manual-layout").ManualLayoutReport[]>([]);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const originalContext = useRef<CurrentContext | null>(null);
  const [inspect, setInspect] = useState<InspectContext | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [selection, setSelection] = useState<OperationsSelection>(null);
  const [labelLayer, setLabelLayer] = useState<LabelLayer>("areas");
  const [stats, setStats] = useState<OpsRenderStats | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [completion, setCompletion] = useState<{ stage: string } | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; mismatches: string[]; verifierImplementationVersion: string | null } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [directEditor, setDirectEditor] = useState<DirectEditorBridge | null>(null);
  const [assistantFocus, setAssistantFocus] = useState(false);

  const currentOk = "error" in current ? null : current;
  const displayedScene: OperationsScene | null = inspect?.scene ?? currentOk?.scene ?? null;
  const displayedController: OperationsController | null = inspect?.controller ?? currentOk?.controller ?? null;
  const displayedLabel = inspect ? inspect.label : currentOk ? "Current" : "Unavailable";
  const activeScenario = currentOk?.scene.scenario ?? null;
  const activeExec = currentOk?.executionConfig ?? null;
  const implVersion = currentOk?.implementationVersion ?? currentImplementationVersion();
  const layoutHolder = useLayoutAssistant({scenario: activeScenario, executionConfig: activeExec, implementationVersion: implVersion});
  const layoutResults = useLayoutResults({contextRevision:layoutEpoch,assistant:layoutHolder,scenario:activeScenario,executionConfig:activeExec,implementationVersion:implVersion,
    onPreview:scene=>{setLayoutPreview(scene);setAssistantPreview(!!scene);if(scene){setPlaying(false);setInspect(null);}},
    onApply:(scene,comparison)=>{if(!currentOk||!activeExec)return;if(!originalContext.current)originalContext.current=currentOk;setLayoutHistory(h=>[...h,comparison]);setPlaying(false);setInspect(null);setSelection(null);setLayoutEditing(false);setAssistantPreview(false);setLayoutPreview(null);setLayoutEpoch(e=>e+1);setCurrent({...currentOk,scene:{...scene,layoutGhost:undefined},controller:createControllerForVersioned(scene.scenario,activeExec,implVersion)});},
    onLoadInput:report=>{try{const scene=buildSceneForScenario(report.input.scenario);const controller=createControllerForVersioned(scene.scenario,report.input.executionConfig,report.implementationVersion);if(currentOk&&!originalContext.current)originalContext.current=currentOk;layoutHolder.adoptReportContext();setPlaying(false);setInspect(null);setSelection(null);setLayoutEditing(false);setAssistantPreview(false);setLayoutPreview(null);setLayoutEpoch(e=>e+1);setCurrent({key:'recorded',label:'Layout report input',implementationVersion:report.implementationVersion,scene,controller,executionConfig:report.input.executionConfig});}catch(e){setEngineError(String(e));}}
  });

  // Sync presented snapshot whenever the displayed controller changes
  // (scenario switch, candidate inspection, return to current, reset).
  useEffect(() => {
    if (!displayedController) { setSnapshot(null); setCompletion(null); return; }
    try {
      setSnapshot(displayedController.snapshot());
      setCompletion(displayedController.getCompletionStatus());
      setEngineError(null);
    } catch (e) { setEngineError(e instanceof Error ? e.message : String(e)); }
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedController]);

  useEffect(() => {
    if (!playing || !completion) return;
    if (completion.stage === "SUPPORTED_STAGE_COMPLETE" || completion.stage === "BLOCKED" || completion.stage === "WINDOW_ENDED") setPlaying(false);
  }, [playing, completion]);

  // Playback advances the REAL engine; pause freezes clock and poses.
  useEffect(() => {
    if (!playing || !displayedController) return;
    let raf = 0;
    const wallOrigin = performance.now();
    const simOrigin = displayedController.getClockMs();
    let lastSnapWall = 0;
    let lastSnapClock = -1;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const target = simOrigin + Math.max(0, Math.floor((now - wallOrigin) * speed));
      try {
        if (target > displayedController.getClockMs()) displayedController.advanceTo(target);
        const clock = displayedController.getClockMs();
        if (clock !== lastSnapClock && now - lastSnapWall >= 40) {
          lastSnapWall = now; lastSnapClock = clock;
          setSnapshot(displayedController.snapshot());
          setCompletion(displayedController.getCompletionStatus());
        }
      } catch (e) { setEngineError(e instanceof Error ? e.message : String(e)); setPlaying(false); }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      try { setSnapshot(displayedController.snapshot()); setCompletion(displayedController.getCompletionStatus()); } catch { /* keep last good */ }
    };
  }, [playing, speed, displayedController]);

  const report = holder.report;
  const reportKey = report ? canonicalIdentity(report) : null;
  const latestReportKey = useRef(reportKey);
  latestReportKey.current = reportKey;
  const verifySequence = useRef(0);
  useEffect(() => { verifySequence.current++; setVerifyResult(null); setVerifyError(null); setBusy(null); setInspect(null); }, [reportKey]);
  const comparison = report?.comparison ?? null;
  const candidates: CandidateResult[] = comparison?.candidates ?? [];
  const baselineCandidate = candidates.find((c) => c.candidateId === (comparison?.baselineCandidateId ?? "baseline")) ?? candidates[0] ?? null;
  const selectedCandidate = candidates.find((c) => c.candidateId === holder.selectedCandidateId) ?? baselineCandidate;
  const stale = isStaleReport(
    report ? { scenario: report.input.scenario, executionConfig: report.input.executionConfig, implementationVersion: report.versions.simulation } : null,
    activeScenario ? { scenario: activeScenario, executionConfig: activeExec, implementationVersion: implVersion } : null,
  );
  const runMetrics = snapshot ? operationsRunMetrics(snapshot, completion?.stage ?? "IN_PROGRESS") : null;
  const rem = snapshot ? remainingCounts(snapshot.counts) : null;
  const finishText = formatFinishTime(runMetrics?.makespanMs ?? null);

  const switchScenario = (key: string): void => {
    originalContext.current = null;
    setAssistantPreview(false); setLayoutEditing(false); setLayoutPreview(null); setLayoutEpoch(e => e+1);
    setPlaying(false); setInspect(null); setInspectError(null); setSelection(null); setAssistantFocus(false);
    try {
      setCurrent(key === "full" ? buildFullContext() : buildBurstContext());
    } catch (e) { setCurrent({ error: e instanceof Error ? e.message : String(e) }); }
  };

  const resetCurrent = (): void => {
    setAssistantPreview(false); setLayoutEditing(false); setLayoutPreview(null); setLayoutEpoch(e => e+1);
    setPlaying(false); setSelection(null);
    if (inspect) {
      // Reset replays the inspected option from its own inputs.
      const cand = candidates.find((c) => c.candidateId === inspect.candidateId);
      if (cand) openInspection(cand.candidateId);
      return;
    }
    try {
      if (!currentOk) { setCurrent(buildBurstContext()); return; }
      const fresh = { ...currentOk, controller: createControllerForVersioned(currentOk.scene.scenario, currentOk.executionConfig, currentOk.implementationVersion) };
      setCurrent(fresh);
    } catch (e) { setEngineError(e instanceof Error ? e.message : String(e)); }
  };

  const openInspection = (candidateId: string): void => {
    onChange({ selectedCandidateId: candidateId });
    setInspectError(null);
    const candidate = candidates.find((c) => c.candidateId === candidateId);
    if (!candidate || candidate.isBaseline || !report) { setInspect(null); return; }
    if (!candidate.report) {
      setInspect(null);
      setInspectError(`${humanOptionName(candidate.candidateId, candidate.patch, false)} is ${candidate.status} (${candidate.reason ?? "no executed run"}); the warehouse stays on Current instead of drawing an unrelated run.`);
      return;
    }
    try {
      const scenario = candidate.report.scenario;
      const scene = buildSceneForScenario(scenario);
      const controller = createControllerForVersioned(scenario, report.input.executionConfig, replayVersion(report));
      setInspect({ implementationVersion: replayVersion(report), candidateId, label: `${humanOptionName(candidate.candidateId, candidate.patch, false)} vs Current`, scene, controller });
      setPlaying(false); setSelection(null);
    } catch (e) {
      setInspect(null);
      setInspectError(`Inspection unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const loadRecordedScenario = (): void => {
    originalContext.current = null;
    if (!report) return;
    try {
      const scene = buildSceneForScenario(report.input.scenario);
      const controller = createControllerForVersioned(report.input.scenario, report.input.executionConfig, replayVersion(report));
      setAssistantPreview(false); setLayoutEditing(false); setLayoutPreview(null); setLayoutEpoch(e => e+1);
      setInspect(null); setSelection(null); setPlaying(false);
      setCurrent({ implementationVersion: replayVersion(report), key: "recorded", label: `Recorded scenario — ${report.input.scenario.id}`, scene, controller, executionConfig: report.input.executionConfig });
    } catch (e) { setInspectError(`Recorded scenario unavailable: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const exportReport = (): void => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `layoutlab-investigation-${report.runId}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const recompute = async (): Promise<void> => {
    if (!report) return;
    const key = reportKey;
    const sequence = ++verifySequence.current;
    const stillCurrent = (): boolean => latestReportKey.current === key && verifySequence.current === sequence;
    setVerifyResult(null); setVerifyError(null); setBusy("verifying");
    try { const result = await verifyInvestigation(report); if (stillCurrent()) setVerifyResult(result); }
    catch (e) { if (stillCurrent()) setVerifyError(e instanceof Error ? `Verify unavailable: ${e.message}` : "Verify unavailable."); }
    finally { if (stillCurrent()) setBusy(null); }
  };

  const stepOnce = (): void => {
    if (!displayedController || playing || layoutEditing) return;
    try {
      displayedController.stepEvent();
      setSnapshot(displayedController.snapshot());
      setCompletion(displayedController.getCompletionStatus());
    } catch (e) { setEngineError(e instanceof Error ? e.message : String(e)); }
  };

  if (!currentOk || !displayedScene || !activeExec) {
    return (
      <div className="app"><div className="page"><div className="panel" data-testid="ws-load-error">
        <h1>LayoutLab warehouse</h1>
        <p role="alert" className="error">Warehouse failed to load: {"error" in current ? current.error : "unknown error"}. No warehouse is shown.</p>
        <p className="actions"><button type="button" onClick={() => switchScenario("burst")}>Retry sample</button></p>
      </div></div></div>
    );
  }

  const selectValue = selection ? `${selection.kind}:${selection.id}` : "";
  const trace = report?.trace ?? holder.summary?.trace ?? [];
  const recommendation = report?.recommendation ?? holder.summary?.recommendation ?? null;
  const changed = selectedCandidate && report ? changedFields(report.input.scenario, selectedCandidate) : [];

  return (
    <div className="app ws-app">
      <header className="topbar" data-testid="ws-header">
        <span className="brand" aria-label="LayoutLab"><img src="/brand/layoutlab-symbol-v1.png" alt="" width="24" height="24" data-testid="brand-symbol" /><strong>LayoutLab</strong></span>
        <label className="ws-scenario-label">Scenario
          <select data-testid="ws-scenario" value={currentOk.key} onChange={(e) => switchScenario(e.target.value)} aria-label="Warehouse scenario">
            <option value="burst">Sample data — 6-order picking &amp; packing</option>
            <option value="full">Sample data — full shift (28 orders + 12 deliveries)</option>
            {currentOk.key === "recorded" && <option value="recorded">{currentOk.label}</option>}
          </select>
        </label>
        <span className="badge sample" data-testid="ws-sample-badge">Sample data</span>
        {holder.provenance && report && <span className="badge fixture" data-testid="ws-provenance-badge">Results available</span>}
        {inspect && <span className="badge selected" data-testid="ws-viewing-badge">Viewing: {inspect.label}</span>}
        <span className="spacer" />
        <details className="menu" data-testid="ws-settings">
          <summary>Settings</summary>
          <div className="menu-drop ws-settings-drop">
            <p className="hint mono">{inputIdentity({ scenarioId: activeScenario!.id, seed: activeScenario!.seed, executionConfig: activeExec, implementationVersion: implVersion })}</p>
            <p className="hint">Engine {snapshot?.versions.operationsEngine ?? "—"} · schema {snapshot?.versions.operationsSchema ?? "—"} · simulation {snapshot?.versions.simulation ?? implVersion}. Provider config, raw patches and request metadata stay in Technical details.</p>
            <button type="button" data-testid="ws-legacy" onClick={props.onOpenLegacy}>Advanced: legacy storage planner (separate)</button>
            <p className="hint">The legacy planner uses different data (four-rack planner sample) and never feeds this warehouse.</p>
          </div>
        </details>
      </header>

      <div className="page ws-page">
        <section className="ws-intro" aria-label="Introduction">
          <h1>Run this warehouse</h1>
          <p>Run the sample, inspect a worker or station, then compare a layout change or service-time assumption. {displayedLabel !== "Current" ? `Now viewing ${displayedLabel}.` : "You are viewing Current."}</p>
        </section>

        {stale && report && (
          <p className="notice" data-testid="ws-stale-report" role="status">Previous results: this report was measured on {report.input.scenario.id} (seed {report.input.scenario.seed}), with different scenario, workload, stock, geometry, configuration or implementation inputs from the current warehouse ({activeScenario!.id}). It is kept as previous evidence, never shown as a current measurement. <button type="button" className="mini-btn" data-testid="ws-load-recorded-scenario" onClick={loadRecordedScenario}>Load its scenario</button></p>
        )}
        {inspectError && <p className="error" role="alert" data-testid="ws-inspect-error">{inspectError}</p>}
        {engineError && <p className="error" role="alert" data-testid="ws-engine-error">Engine error: {engineError} · state retained · Reset starts a new run from the same inputs.</p>}

        <div className="metrics ws-metrics" data-testid="ws-metrics" aria-label="Warehouse metrics">
          <div className="metric"><div><p className="metric-label">Scheduled orders</p><p className="metric-value" data-testid="ws-m-scheduled">{snapshot ? snapshot.counts.selected : "—"}</p><p className="metric-caption">In this warehouse run</p></div></div>
          <div className="metric"><div><p className="metric-label">Shipped</p><p className="metric-value" data-testid="ws-m-shipped">{snapshot ? snapshot.counts.shipped : "—"}</p><p className="metric-caption">{completion && completion.stage !== "IN_PROGRESS" ? completionLabel(completion.stage, snapshot?.counts.shipped ?? 0, snapshot?.counts.selected ?? 0) : playing ? "Running" : snapshot && snapshot.clockMs > 0 ? "Paused" : "Ready — starts paused"}</p></div></div>
          <div className="metric"><div><p className="metric-label">Remaining</p><p className="metric-value" data-testid="ws-m-remaining">{rem ? rem.remaining : "—"}</p><p className="metric-caption">{rem ? `Includes ${rem.notYetArrived} not yet arrived · arrived backlog ${rem.arrivedBacklog}` : "—"}</p></div></div>
          <div className="metric"><div><p className="metric-label">Elapsed engine time</p><p className="metric-value" data-testid="ws-m-elapsed" title={snapshot ? `${snapshot.clockMs} ms` : undefined}>{snapshot ? formatClockMs(snapshot.clockMs) : "—"}</p><p className="metric-caption">{finishText ? <>Time to finish all orders <span data-testid="ws-m-finish" title={`${runMetrics!.makespanMs} ms`}>{finishText}</span></> : "Time to finish appears only when every order has shipped"}</p></div></div>
        </div>
        {runMetrics && <p className="hint" data-testid="ws-wait-note">Combined waiting time <span title={`${runMetrics.totalWaitMs} ms`}>{formatSeconds(runMetrics.totalWaitMs)}</span> (summed across workers; can exceed elapsed time). Packing complete is not shipped.</p>}

        <div className="ws-controls" role="group" aria-label="Warehouse playback controls" data-testid="ws-controls">
          {playing
            ? <button type="button" className="primary" data-testid="ws-pause" onClick={() => setPlaying(false)}>⏸ Pause</button>
            : <button type="button" className="primary" data-testid="ws-run" onClick={() => { if (layoutEditing || assistantPreview) return; setEngineError(null); setPlaying(true); }} disabled={engineError !== null || layoutEditing || assistantPreview}>▶ Run sample warehouse</button>}
          {originalContext.current && <button data-testid="layout-return-original" onClick={() => { if (!originalContext.current) return; setPlaying(false); setInspect(null); setLayoutEditing(false); setLayoutPreview(null); setCurrent(originalContext.current); originalContext.current = null; setLayoutEpoch(e => e+1); }}>Return to original run</button>}
          <button type="button" data-testid="ws-reset" onClick={resetCurrent}>↺ Reset</button>
          <button type="button" data-testid="ws-step" disabled={playing || layoutEditing || assistantPreview} onClick={stepOnce} title="Advance exactly one engine event">Step event</button>
          <div className="segmented" role="group" aria-label="Playback speed">
            {([1, 4, 16] as Speed[]).map((s) => <button key={s} type="button" aria-pressed={speed === s} className={speed === s ? "on" : ""} data-testid={`ws-speed-${s}`} onClick={() => setSpeed(s)}>{s}x</button>)}
          </div>
          <span className="mono" data-testid="ws-clock" aria-label="Engine clock">⏱ {snapshot ? fmtClock(snapshot.clockMs) : "—"}</span>
          <span className="hint">Starts paused. Speed changes presentation only, never service times.</span>
        </div>

        <div className="ws-workspace">
          <div className="panel ws-viewport" data-testid="ws-viewport-panel" data-layout-centres={JSON.stringify((layoutPreview ?? displayedScene)?.stations.map(s=>({id:s.id,centerMm:s.centerMm})))} data-layout-racks={JSON.stringify((layoutPreview ?? displayedScene)?.racks)} data-layout-units={JSON.stringify((layoutPreview ?? displayedScene)?.units)} data-current-layout-units={JSON.stringify(currentOk?.scene.units)} data-layout-locations={JSON.stringify((layoutPreview ?? displayedScene)?.locations)} data-current-layout-racks={JSON.stringify(currentOk?.scene.racks)} data-current-layout-centres={JSON.stringify(currentOk?.scene.stations.map(s=>({id:s.id,centerMm:s.centerMm})))}>
            <div className="warehouse-head"><h2>Warehouse</h2><span className="proxy-ribbon">{layoutEditing || assistantPreview ? "Proposed initial layout (paused)" : inspect ? inspect.label : "Current · live engine"}</span></div>
            <OperationsView directEditor={layoutEditing && !playing && !inspect && !assistantPreview && !busy && !layoutHolder.active ? directEditor : null} scene={layoutPreview ?? displayedScene} snapshot={layoutEditing || assistantPreview ? null : snapshot} selection={selection} labelLayer={labelLayer} onStats={setStats} onSelectionChange={(sel) => { setSelection(sel); if (sel) setAssistantFocus(false); }} />
            <p className="hint">Click a worker, slot, rack or station in the warehouse to inspect it. Click empty ground to return to the assistant. Top / Overview / Inspect views are in the viewer controls.</p>
          </div>
          <div className="panel ws-side" data-testid="ws-side">
            {layoutEditing ? null : selection ? (
              <div data-testid="ws-inspector">
                <div className="warehouse-head"><h2>Inspector</h2><button type="button" className="mini-btn" data-testid="ws-clear-selection" onClick={() => setSelection(null)}>Clear selection</button></div>
                <button type="button" className="mini-btn" data-testid="ws-back-assistant" onClick={() => setSelection(null)}>← Back to assistant</button>
                {selectionDetail(displayedScene, snapshot, selection)}
                <label>Selected entity (fallback)
                  <select data-testid="ws-select" value={selectValue} onChange={(e) => { const v = e.target.value; if (!v) { setSelection(null); return; } const [kind, id] = v.split(":"); if ((kind === "location" || kind === "rack" || kind === "unit" || kind === "resource" || kind === "order") && id) setSelection({ kind, id }); }}>
                    <option value="">None (assistant)</option>
                    <optgroup label="Orders">{(snapshot?.orders ?? displayedScene.scenario.orderSchedule.map((o) => ({ orderId: o.id, state: "—" }))).map((o) => <option key={o.orderId} value={`order:${o.orderId}`}>{o.orderId} · {o.state}</option>)}</optgroup>
                    <optgroup label="Workers">{displayedScene.units.map((u) => <option key={u.id} value={`unit:${u.id}`}>{u.id} · {u.role}</option>)}</optgroup>
                    <optgroup label="Storage slots">{displayedScene.locations.map((l) => <option key={l.id} value={`location:${l.id}`}>{l.id}</option>)}</optgroup>
                    <optgroup label="Racks">{displayedScene.racks.map((r) => <option key={r.id} value={`rack:${r.id}`}>{r.id}</option>)}</optgroup>
                    <optgroup label="Stations">{displayedScene.resources.map((r) => <option key={r.id} value={`resource:${r.id}`}>{r.id} · {r.kind}</option>)}</optgroup>
                  </select>
                </label>
                <div className="segmented" role="group" aria-label="Label layer">
                  {(["areas", "slots", "all"] as LabelLayer[]).map((layer) => <button key={layer} type="button" aria-pressed={labelLayer === layer} className={labelLayer === layer ? "on" : ""} data-testid={`ws-labels-${layer}`} onClick={() => setLabelLayer(layer)}>{layer === "areas" ? "Areas" : layer === "slots" ? "Slots" : "All"}</button>)}
                </div>
              </div>
            ) : (
              <div data-testid="ws-assistant-wrap" data-focus={assistantFocus ? "true" : "false"}>
                <WarehouseAssistant holder={holder} onChange={onChange} scenario={activeScenario} executionConfig={activeExec} layoutHolder={layoutHolder} layoutResults={layoutResults} loadError={null} />
                <label>Inspect without clicking (fallback)
                  <select data-testid="ws-select-assistant" value="" onChange={(e) => { const v = e.target.value; if (!v) return; const [kind, id] = v.split(":"); if ((kind === "location" || kind === "rack" || kind === "unit" || kind === "resource" || kind === "order") && id) setSelection({ kind, id }); }}>
                    <option value="">Choose a worker, slot, rack, station or order…</option>
                    <optgroup label="Workers">{displayedScene.units.map((u) => <option key={u.id} value={`unit:${u.id}`}>{u.id} · {u.role}</option>)}</optgroup>
                    <optgroup label="Storage slots">{displayedScene.locations.map((l) => <option key={l.id} value={`location:${l.id}`}>{l.id}</option>)}</optgroup>
                    <optgroup label="Stations">{displayedScene.resources.map((r) => <option key={r.id} value={`resource:${r.id}`}>{r.id} · {r.kind}</option>)}</optgroup>
                  </select>
                </label>
              </div>
            )}
            <details data-testid="ws-manual-details" open={layoutEditing || undefined}><summary>Manual layout controls</summary>
            <p className="hint ws-layout-guide">Run a baseline before testing a layout; your current playback is preserved. Then choose Edit layout.</p>
            <LayoutEditor onDirectEditorChange={setDirectEditor} disabled={playing || !!inspect || assistantPreview || !!busy || layoutHolder.active || implVersion !== currentImplementationVersion()} key={layoutEpoch} scene={currentOk.scene} executionConfig={activeExec} implementationVersion={implVersion} selection={selection} onResult={r => setLayoutHistory(h => [...h, r])}
              onEditing={editing => { if(editing)layoutResults.clearPreview(); setLayoutEditing(editing); setPlaying(false); setInspect(null); }} onPreview={setLayoutPreview}
              onApply={scene => { if (!originalContext.current) originalContext.current = currentOk; setLayoutEditing(false); setLayoutEpoch(e => e+1); setPlaying(false); setInspect(null); setCurrent({ ...currentOk, scene: { ...scene, layoutGhost: undefined }, controller: createControllerForVersioned(scene.scenario, activeExec, implVersion) }); }} />
            </details>
          </div>
        </div>

        <div id="workspace-results" className="panel ws-results" data-testid="ws-results">
          <details><summary>Layout test history ({layoutHistory.length})</summary>{layoutHistory.map((r,i) => <p key={i}>Previous evidence {i+1}: {r.commonInputs.scenario.id}, {r.improvement}; {r.schema}; input {r.schema !== "layoutlab.layout-comparison/2" ? r.parentHash : r.parentIdentity.scenarioContentSha256}.<button onClick={() => { const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:"application/json"})); const a=document.createElement("a"); a.href=url; a.download=`layout-test-${i+1}.json`; a.click(); URL.revokeObjectURL(url); }}>Export history {i+1}</button></p>)}</details>
          <h2>Service-duration results</h2>
          {!report && !comparison && <p className="hint">No test results yet. Run the warehouse, then test a supported change in the assistant. Results stay here — the warehouse above never changes pages.</p>}
          {holder.provenance && report && <p className="hint" data-testid="ws-results-provenance"><strong>{holder.provenance.label}</strong>. {stale ? "Previous results for another warehouse input." : report.versions.simulation !== implVersion ? "Historical engine; inspection replays its recorded implementation." : "Matches the current warehouse input."}</p>}
          {candidates.length > 0 && (
            <>
              {recommendation && (() => { const chosen = candidates.find(c => c.candidateId === recommendation.candidateId); const base = candidates.find(c => c.isBaseline); return <section data-testid="ws-recommendation" aria-label="Recommendation"><h3>{chosen ? humanOptionName(chosen.candidateId, chosen.patch, chosen.isBaseline) : "Recommended option unavailable"}</h3><p>{recommendation.improvedOverBaseline ? "Measured improvement under the report ranking." : "No measured improvement over Current is claimed."} {recommendation.source === "model" ? "Model-selected recommendation." : "Deterministic fallback recommendation."}</p><p>Shipped: {base?.shipped ?? "unmeasured"} before -&gt; after {chosen?.shipped ?? "unmeasured"}. Time to finish: {formatFinishTime(base?.makespanMs ?? null) ?? "unavailable"} before -&gt; after {formatFinishTime(chosen?.makespanMs ?? null) ?? "unavailable"}. Combined waiting: {formatSeconds(base?.totalWaitMs ?? null)} before -&gt; after {formatSeconds(chosen?.totalWaitMs ?? null)}.</p><p>Measured change: shipped {recommendation.comparisons.shippedDelta ?? "unmeasured"}; finish time {recommendation.comparisons.makespanDeltaMs === null ? "unmeasured" : `${recommendation.comparisons.makespanDeltaMs} ms`}; waiting {recommendation.comparisons.totalWaitDeltaMs === null ? "unmeasured" : `${recommendation.comparisons.totalWaitDeltaMs} ms`}. Lower time and waiting are preferable; shipped work must also be considered.</p><p className="hint">Scope: embedded scenario and allowed service assumptions only; incomplete options do not establish a full-run improvement. {stale ? "Previous warehouse input." : "Current warehouse input."}</p><details><summary>Why this recommendation and exact evidence</summary><p>{recommendation.explanation}</p><pre>{JSON.stringify(recommendation,null,2)}</pre></details></section>; })()}
              <div className="exp-cards" data-testid="ws-cards">
                {candidates.map((c) => (
                  <div key={c.candidateId} className={`metric exp-card${holder.selectedCandidateId === c.candidateId ? " exp-card-on" : ""}`}>
                    <div>
                      <p className="metric-label">{humanOptionName(c.candidateId, c.patch, c.isBaseline)} · {friendlyCandidateStatus(c.status)}{recommendation?.candidateId === c.candidateId ? " · recommended" : ""}</p>
                      <p className="exp-nums">Shipped {c.shipped ?? "— (not measured)"} · Time to finish all orders <span title={c.makespanMs === null ? (c.reason ?? "unavailable") : `${c.makespanMs} ms`}>{formatFinishTime(c.makespanMs) ?? "—"}</span> · Combined waiting <span title={c.totalWaitMs === null ? (c.reason ?? "unavailable") : `${c.totalWaitMs} ms`}>{formatSeconds(c.totalWaitMs)}</span></p>
                      {c.reason && <p className="hint">{c.reason}</p>}
                      <p className="actions">
                        <button type="button" className="mini-btn" data-testid={`ws-view-${c.candidateId}`} aria-pressed={holder.selectedCandidateId === c.candidateId && (c.isBaseline ? !inspect : inspect?.candidateId === c.candidateId)} onClick={() => openInspection(c.candidateId)}>{c.isBaseline ? "View Current" : `View ${humanOptionName(c.candidateId, c.patch, false).split(" — ")[0]}`}</button>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {inspect && <p className="hint" data-testid="ws-return-note">Viewing {inspect.label} in the warehouse above. <button type="button" className="mini-btn" data-testid="ws-return-current" onClick={() => { setInspect(null); onChange({ selectedCandidateId: "baseline" }); }}>Return to Current</button> — your Current run is retained exactly as you left it.</p>}
              <details data-testid="ws-compare-details">
                <summary>Compare all options (failures included)</summary>
                <div className="table-scroll"><table data-testid="ws-compare-table">
                  <thead><tr><th>Option</th><th>Status</th><th>Shipped</th><th>Time to finish all orders</th><th>Combined waiting</th></tr></thead>
                  <tbody>{candidates.map((c) => <tr key={c.candidateId}><td>{humanOptionName(c.candidateId, c.patch, c.isBaseline)}</td><td>{friendlyCandidateStatus(c.status)}</td><td>{c.shipped ?? "—"}</td><td title={c.makespanMs === null ? (c.reason ?? "unavailable") : `${c.makespanMs} ms`}>{formatFinishTime(c.makespanMs) ?? "—"}</td><td title={c.totalWaitMs === null ? (c.reason ?? "unavailable") : `${c.totalWaitMs} ms`}>{formatSeconds(c.totalWaitMs)}</td></tr>)}</tbody>
                </table></div>
                {changed.length > 0 && <><h3>What changed</h3><ul className="hint">{changed.filter((r) => r.changed).map((r) => <li key={r.field}>{r.label}: {r.before} → {r.after}</li>)}{changed.every((r) => !r.changed) && <li>No changes in the selected option.</li>}</ul></>}
              </details>
              <details data-testid="ws-tested-details">
                <summary>What LayoutLab tested</summary>
                {trace.length === 0 ? <p className="hint">Nothing tested yet.</p> : <ol className="exp-trace">{trace.map((t) => <li key={t.seq}><span className="mono">#{t.seq} {t.kind}</span> · {t.candidateId ?? "—"} · {t.status}{t.hypothesis ? ` · Hypothesis (assistant assertion — not measured proof): “${t.hypothesis}”` : ""}{t.reason ? ` · ${t.reason}` : ""}</li>)}</ol>}
                {recommendation && <p className="hint">Recommendation: {humanOptionName(recommendation.candidateId, candidates.find((c) => c.candidateId === recommendation.candidateId)?.patch, recommendation.candidateId === (comparison?.baselineCandidateId ?? "baseline"))} — {recommendation.improvedOverBaseline ? "improves on Current under the measured ranking" : "no measured improvement over Current is claimed"}. {recommendation.explanation}</p>}
              </details>
            </>
          )}
          <p className="actions">
            <button type="button" data-testid="ws-export" disabled={!report} onClick={exportReport}>Export results (exact report)</button>
            <button type="button" data-testid="ws-verify" disabled={!report || busy !== null} onClick={() => void recompute()}>Verify these results</button>
          </p>
          {!report && <p className="hint">Export and Verify need a test result (live, recorded, or imported). Displayed rounded times always match the exact milliseconds in the export (hover any time to see them).</p>}
          {verifyResult && <div data-testid="ws-verify-result" role="status">{verifyResult.ok ? <p className="okline">✓ Verified — saved measurements follow from the embedded inputs (engine replay only; inference provenance is recorded metadata).</p> : <p className="error">× Verify mismatches: {verifyResult.mismatches.join("; ")}</p>}</div>}
          {verifyError && <p className="error" role="alert">{verifyError}</p>}
          <details className="ws-tech" data-testid="ws-result-tech"><summary>Technical details</summary><p className="hint mono">Run {report?.runId ?? "none"}. Replay implementation: {inspect?.implementationVersion ?? implVersion} | Verifier implementation: {verifyResult ? (verifyResult.verifierImplementationVersion ?? "unavailable (no verifier selected)") : "not verified"} | Renderer: {stats ? `${stats.drawCalls} draws · ${(stats.triangles / 1_000_000).toFixed(1)}M tris · ${stats.renders} renders` : "render pending"} · Viewing {displayedLabel} · Input {inputIdentity({ scenarioId: activeScenario!.id, seed: activeScenario!.seed, executionConfig: activeExec, implementationVersion: implVersion })}. Raw candidate statuses: {candidates.map(c => `${c.candidateId}: ${c.status}`).join("; ") || "none"}. Offline verify: node scripts/verify-operations-investigation.mjs &lt;export.json&gt;</p></details>
        </div>
      </div>
    </div>
  );
}
