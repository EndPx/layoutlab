import { useEffect, useRef, useState } from "react";
import { applyRackTranslation, buildRackAttachmentMap, runRackLayoutComparison, verifyRackLayoutComparison, type RackTranslationProposal, applyPackingStationTranslation, buildStationAttachmentMap, contentSha256, defaultApprovedConstraints, runLayoutComparison, SIMULATION_VERSION, snapToGridMm, validateLayoutCandidate, verifyLayoutComparison, type StationAttachment, type CandidateBundle, type LayoutValidation, type PackingStationTranslationProposal } from "@layoutlab/simulation";
import { manualReportView, type ManualLayoutReport, type ManualReportView } from "../lib/manual-layout";
import { buildLayoutScene, resolveLayoutAttachments, type OperationsScene, type OperationsSelection } from "../lib/operations";

export function LayoutEditor(props: { scene: OperationsScene; implementationVersion: string; executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number }; selection: OperationsSelection; onResult: (result: ManualLayoutReport) => void; onPreview: (scene: OperationsScene | null) => void; onApply: (scene: OperationsScene) => void; onEditing: (editing: boolean) => void }): React.JSX.Element {
  const [base] = useState(props.scene);
  const [config] = useState(props.executionConfig);
  const [station, setStation] = useState("PACK-1");
  const [x, setX] = useState(20500); const [z, setZ] = useState(5000);
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState<ManualReportView | null>(null);
  const [bundle, setBundle] = useState<CandidateBundle | ReturnType<typeof applyRackTranslation> | null>(null);
  const [validation, setValidation] = useState<Pick<LayoutValidation, "candidateValid" | "issues"> | null>(null);
  const [result, setResult] = useState<ManualReportView | null>(null);
  const [history, setHistory] = useState<ManualReportView[]>([]);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);

  const revision = useRef(0);
  let contextError: string | null = null;
  let attachments: StationAttachment[] = [];
  try { attachments = resolveLayoutAttachments(base.scenario); } catch { contextError = "This context does not match the canonical main/burst rigid layout attachments. Unsupported geometry."; }
  const supported = props.implementationVersion === SIMULATION_VERSION && contextError === null;
  const isRack = base.scenario.geometry.racks.some(r => r.id === station);
  const approved = defaultApprovedConstraints([station]);
  const updateCoordinate = (axis: "x" | "z", value: number): void => { revision.current++; setValidation(null); setResult(null); setVerified(null); if(axis === "x") setX(value); else setZ(value); };
  const choose = (id: string): void => { const a = attachments.find(a => a.stationId === id); const rack = base.scenario.geometry.racks.find(r => r.id === id); if (!a && !rack) return; const centre = a?.centreMm ?? rack!.positionMm; revision.current++; setStation(id); setX(centre.x); setZ(centre.z); setValidation(null); setResult(null); setVerified(null); };
  useEffect(() => { if (editing && (props.selection?.kind === "resource" || props.selection?.kind === "rack")) choose(props.selection.id); }, [props.selection, editing]);
  const proposal = async (px = x, pz = z): Promise<PackingStationTranslationProposal | RackTranslationProposal> => ({ kind: isRack ? "RACK_TRANSLATION" : "PACKING_STATION_TRANSLATION", proposalId: isRack ? "manual-rack" : "manual-station", parent: { scenarioId: base.scenario.id, scenarioContentSha256: await contentSha256(base.scenario), schemaVersion: base.scenario.schemaVersion, engineVersion: base.scenario.engineVersion }, entityId: station, target: { mode: "ABSOLUTE_CENTER_MM", centerMm: { x: px, z: pz } } });
  useEffect(() => {
    const rev = ++revision.current;
    setValidation(null); setResult(null); setVerified(null); setBundle(null);
    if (!editing) return;
    void proposal().then(p => { const b = p.kind === "RACK_TRANSLATION" ? applyRackTranslation(base.scenario, p, buildRackAttachmentMap(base.scenario)) : applyPackingStationTranslation(base.scenario, p, buildStationAttachmentMap(base.scenario, attachments)); if (revision.current !== rev) return; setBundle(b); props.onPreview(buildLayoutScene(b)); setError(null); }).catch(e => { if (revision.current === rev) { setError(String(e)); props.onPreview(null); } });
    return () => { revision.current++; };
  }, [x, z, station, editing]);
  const guard = async (work: () => Promise<void>): Promise<void> => { setBusy(true); setError(null); try { await work(); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const compare = async (isBaseline: boolean): Promise<void> => {
    const rev = revision.current; const a = attachments.find(a => a.stationId === station); const centre = a?.centreMm ?? base.scenario.geometry.racks.find(r => r.id === station)!.positionMm;
    const p = await proposal(isBaseline ? centre.x : x, isBaseline ? centre.z : z);
    const raw = p.kind === "RACK_TRANSLATION" ? await runRackLayoutComparison({ baselineScenario: base.scenario, executionConfig: config, proposal: p, attachments: buildRackAttachmentMap(base.scenario), approvedConstraints: approved, safetyCeilingMs: 7200000 }) : await runLayoutComparison({ baselineScenario: base.scenario, executionConfig: config, proposal: p, attachments, approvedConstraints: approved, implementationVersion: props.implementationVersion, safetyCeilingMs: 7200000 });
    const r = manualReportView(raw);
    if (rev !== revision.current) return;
    if (isBaseline) setBaseline(r); else { setResult(r); setHistory(h => [...h, r]); props.onResult(raw); }
  };
  const discard = (): void => { revision.current++; choose(station); setEditing(false); props.onEditing(false); setBundle(null); props.onPreview(null); };
  const exportResult = (r: ManualReportView): void => { const url = URL.createObjectURL(new Blob([JSON.stringify(r.raw, null, 2)], {type:"application/json"})); const a = document.createElement("a"); a.href=url; a.download="layoutlab-layout-comparison.json"; a.click(); URL.revokeObjectURL(url); };
  return <section data-testid="layout-editor"><h2>Physical layout</h2>
    <p className="hint">Manual station and rack translation. Rotation and initial agent parking are next gates. Muse proposals remain station-only. Service-duration hypotheticals remain separate.</p>
    {contextError && <p role="alert">{contextError}</p>}
    {props.implementationVersion !== SIMULATION_VERSION && <p role="alert">Recorded implementation {props.implementationVersion} is read-only for layout editing. Choose a current sample to edit; historical replay stays unchanged.</p>}
    <p className="hint">Matched orders, deliveries, stock, workers, seed and durations. Evaluation ceiling: 2 hours; full-shift results may be truncated.</p>
    <div className="actions"><button disabled={!supported || busy || editing} onClick={() => { props.onEditing(false); void guard(() => compare(true)); }}>Run baseline</button><button disabled={!baseline || busy || editing} onClick={() => { choose(station); props.onEditing(true); setEditing(true); }}>Edit layout</button></div>
    {baseline && <p data-testid="layout-baseline">Baseline: {baseline.baselineMetrics?.shipped ?? "unavailable"} shipped; {baseline.baselineMetrics?.totalWaitMs ?? "unavailable"} ms combined waiting. {baseline.evaluationScope.truncated ? "Truncated window." : "Full cohort evaluated."}</p>}
    {editing && <><p className="notice">Candidate INITIAL conditions; live workers are paused. Dashed orange outline = original footprint; model = proposed placement. {validation ? (validation.candidateValid ? "Validated preview." : "INVALID preview: Test and Apply blocked.") : "Unvalidated preview."}</p>
      <label>Packing station<select aria-label="Packing station" value={isRack ? "" : station} disabled={busy} onChange={e => choose(e.target.value)}><option value="">Choose station</option>{attachments.map(a => <option key={a.stationId}>{a.stationId}</option>)}</select></label>
      <label>Rack<select aria-label="Rack" value={isRack ? station : ""} disabled={busy} onChange={e => choose(e.target.value)}><option value="">Choose rack</option>{base.scenario.geometry.racks.map(r => <option key={r.id}>{r.id}</option>)}</select></label>
      <label>X centre (mm)<input aria-label="X centre (mm)" type="number" step="100" value={x} disabled={busy} onChange={e => updateCoordinate("x", Number(e.target.value))} onBlur={() => setX(snapToGridMm(x,100))}/></label>
      <label>Z centre (mm)<input aria-label="Z centre (mm)" type="number" step="100" value={z} disabled={busy} onChange={e => updateCoordinate("z", Number(e.target.value))} onBlur={() => setZ(snapToGridMm(z,100))}/></label>
      <p className="hint">100 mm grid; max translation 5000 mm; one selected station or rack; rack stock and storage height stay unchanged. Use arrow keys or type coordinates; leaving a field snaps it.</p>
      <div className="actions"><button disabled={busy || !bundle} onClick={() => void guard(async () => { const rev = revision.current; const p = await proposal(); const v = p.kind === 'RACK_TRANSLATION' ? await runRackLayoutComparison({ baselineScenario: base.scenario, proposal: p, attachments: buildRackAttachmentMap(base.scenario), approvedConstraints: approved, executionConfig: config, safetyCeilingMs: 7200000 }).then(r => ({ candidateValid: r.validation.candidateValid, issues: [...r.validation.structural, ...r.validation.candidate.issues] })) : await validateLayoutCandidate({baselineScenario:base.scenario, proposal:p, attachments:buildStationAttachmentMap(base.scenario,attachments), approvedConstraints:approved, executionConfig:config}); if(rev === revision.current) setValidation(v); })}>Validate layout</button>
      <button disabled={busy || !validation?.candidateValid} onClick={() => void guard(() => compare(false))}>Test layout</button>
      <button disabled={busy || !validation?.candidateValid || !result?.candidateValid || !bundle} onClick={() => { if(!bundle) return; props.onApply(buildLayoutScene(bundle)); props.onPreview(null); setEditing(false); props.onEditing(false); }}>Apply tested layout</button>
      <button disabled={busy} onClick={discard}>Discard / Undo draft</button></div>
      {validation && <div role="status" data-testid="layout-validation">{validation.candidateValid ? <p>Validated {station}: attached footprint, slots and required routes pass.</p> : <><strong>Invalid preview ? Test and Apply blocked</strong><ul>{validation.issues.map((i,n) => <li key={n}>{i.entityId}: {i.code} {i.relatedEntityId ?? ""} ? {i.message}</li>)}</ul></>}</div>}
    </>}
    {busy && <p role="status">Running deterministic engine / geometry checks?</p>}{error && <p role="alert" className="error">{error}</p>}

    {result && <div data-testid="layout-comparison"><h3>Original vs proposed: {result.improvement}</h3><p>{result.explanation}</p><p className="mono">Input {result.parentIdentity.scenarioContentSha256} ? {result.candidateIdentity?.scenarioContentSha256 ?? result.raw.schema}</p><table><thead><tr><th>Exact engine metric</th><th>Original</th><th>Proposed</th><th>Delta</th></tr></thead><tbody>{(["shipped","makespanMs","totalWaitMs","backlog"] as const).map(k => <tr key={k}><td>{k}</td><td>{result.baselineMetrics?.[k] ?? "unavailable"}</td><td>{result.candidateMetrics?.[k] ?? "unavailable"}</td><td>{result.delta?.[k] ?? "unavailable"}</td></tr>)}</tbody></table><button onClick={() => exportResult(result)}>Export exact layout results</button><button disabled={busy} onClick={() => void guard(async () => {const raw=result.raw; const ok=raw.schema === "layoutlab.rack-comparison/1" ? await verifyRackLayoutComparison(raw) : (await verifyLayoutComparison(raw)).ok; setVerified(ok ? "Verified exact geometry, inputs and engine reports" : "Replay mismatch; export rejected");})}>Recompute layout export</button>{verified && <p role="status">{verified}</p>}</div>}
    <details><summary>Previous layout tests ({history.length})</summary>{history.map((r,i) => <p key={i}>Test {i+1} ({r.raw.schema}): {r.improvement} ? {r.candidateIdentity?.scenarioContentSha256 ?? r.raw.schema}<button onClick={() => exportResult(r)}>Export previous test {i+1}</button></p>)}<p>Previous tests remain evidence for their embedded geometry; editing invalidates the current comparison and validation.</p></details>
  </section>;
}
