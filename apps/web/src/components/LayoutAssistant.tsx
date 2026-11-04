import { useEffect, useRef, useState } from 'react';
import { MAIN_WAREHOUSE_ATTACHMENTS, type OperationsScenario } from '@layoutlab/simulation';
import { getStatus, getBudget, type BudgetInfo, type ApiStatus } from '../lib/experiments';
import { LAYOUT_EVALUATION_CEILING_MS, layoutContext, approvalErrors, createLayoutInvestigation, getLayoutInvestigation, approveLayoutInvestigation, cancelLayoutInvestigation, type LayoutApproval, type LayoutReport, type LayoutInput, parseLayoutReport } from '../lib/layout-investigations';

type Props = { scenario: OperationsScenario | null; executionConfig: LayoutInput['executionConfig'] | null; implementationVersion: string };
type Evidence = { report: LayoutReport; context: string; revision: number };
export function useLayoutAssistant({ scenario, executionConfig, implementationVersion }: Props) {
 const identity = scenario && executionConfig ? layoutContext(scenario, executionConfig, implementationVersion) : '';
 const context = useRef(identity);
 const revision = useRef(0);
 if (context.current !== identity) { revision.current++; context.current = identity; }
 const pendingAdoption = useRef<string|null>(null);
 const epoch = useRef(0), locked = useRef(false);
 const controllers = useRef(new Set<AbortController>());
 const [origin, setOrigin] = useState('Server investigation');
 const [action, setAction] = useState('service');
 const [run, setRun] = useState<Evidence | null>(null);
 const [previous, setPrevious] = useState<LayoutReport[]>([]);
 const [draft, setDraft] = useState<LayoutApproval | null>(null);
 const [status, setStatus] = useState<ApiStatus | null>(null), [budget, setBudget] = useState<BudgetInfo | null>(null);
 const [question, setQuestion] = useState(''), [live, setLive] = useState(false), [consent, setConsent] = useState(false);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [now, setNow] = useState(Date.now());
 const [identityBlocked,setIdentityBlocked] = useState(false);
 useEffect(() => {
  setConsent(false); setBusy(false); locked.current = false;
  if (pendingAdoption.current === identity) { setRun(r => r && r.context === identity ? {...r,revision:revision.current} : r); pendingAdoption.current=null; }
  return () => { epoch.current++; controllers.current.forEach(c => c.abort()); controllers.current.clear(); };
 }, [identity]);
 async function refresh() {
  const c = new AbortController(); controllers.current.add(c);
  try { const [s,b] = await Promise.all([getStatus(c.signal), getBudget(c.signal)]); if (!c.signal.aborted) { setStatus(s); setBudget(b); setError(''); } }
  catch { if (!c.signal.aborted) { setStatus(null); setBudget(null); setError('Server unavailable; live start disabled.'); } }
  finally { controllers.current.delete(c); }
 }
 useEffect(() => { void refresh(); }, []);
 const stale = !!run && (run.context !== identity || run.revision !== revision.current);
 const active = origin === 'Server investigation' && !!run && ['RUNNING','AWAITING_APPROVAL'].includes(run.report.state);
 const matches = (r: LayoutReport, key: string) => layoutContext(r.input.scenario, r.input.executionConfig, r.implementationVersion) === key;
 async function act(action: (signal: AbortSignal) => Promise<LayoutReport>, creating = false, cancelling = false) {
  if (locked.current) return;
  locked.current = true; setBusy(true); setError('');
  const generation = ++epoch.current, key = identity, submittedRevision = revision.current, c = new AbortController(); controllers.current.add(c);
  try {
   const report = await action(c.signal);
   if (c.signal.aborted || context.current !== key || revision.current !== submittedRevision || epoch.current !== generation) return;
   if (!creating && report.runId !== run?.report.runId) { setIdentityBlocked(true); throw new Error('Response run identity changed; approval disabled.'); }
   if (cancelling && run) {
    if (!matches(report, run.context)) throw new Error('Cancellation response context changed.');
    setRun({...run, report}); return;
   }
   if (!matches(report, key)) { setRun({ report, context: layoutContext(report.input.scenario, report.input.executionConfig, report.implementationVersion), revision: submittedRevision }); setDraft(null); throw new Error('Response belongs to a different scenario, configuration or implementation version. Evidence is previous context.'); }
   if (creating && run) setPrevious(p => [...p, run.report]);
   setRun({report, context:key, revision: revision.current});
   if(creating)setOrigin('Server investigation');
   setDraft(report.interpreted ? structuredClone(report.interpreted) : null); setIdentityBlocked(false);
  } catch (e) { if (!c.signal.aborted && context.current === key && revision.current === submittedRevision) setError(e instanceof Error ? e.message : String(e)); }
  finally { controllers.current.delete(c); if (!c.signal.aborted && context.current === key && revision.current === submittedRevision && epoch.current === generation) { locked.current = false; setBusy(false); } }
 }
 useEffect(() => {
  if (!run || stale || !active || busy) return;
  const key = identity, pollRevision = revision.current, id = run.report.runId, generation = epoch.current, c = new AbortController();
  let stopped = false, timer: ReturnType<typeof setTimeout>;
  async function tick() {
   try {
    const report = await getLayoutInvestigation(id, c.signal);
    if (stopped || context.current !== key || revision.current !== pollRevision || generation !== epoch.current) return;
    if (report.runId !== id || !matches(report, key)) throw new Error('Status identity changed; status polling stopped. Cancel deliberately; no status retry was sent.');
    setRun({report, context:key, revision: revision.current});

    setDraft(d => d ?? (report.interpreted ? structuredClone(report.interpreted) : null));
    if (!['RUNNING','AWAITING_APPROVAL'].includes(report.state)) return;
   } catch (e) { if (!stopped && context.current === key && revision.current === pollRevision && generation === epoch.current) { setError(e instanceof Error ? e.message : String(e)); setIdentityBlocked(true); } return; }
   if (!stopped) timer = setTimeout(tick, 1000);
  }
  timer = setTimeout(tick, 1000);
  return () => { stopped = true; c.abort(); clearTimeout(timer); };
 }, [run?.report.runId, run?.report.state, identity, busy]);
 useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);
 const errors = draft && scenario ? approvalErrors(draft, scenario) : ['No interpretation yet.'];
 const reasons: string[] = [];
 if (!scenario || !executionConfig) reasons.push('Warehouse context unavailable.');
 if (!live) reasons.push('Select live layout investigation.');
 if (!consent) reasons.push('Consent is required.');
 if (!question.trim()) reasons.push('Enter a question.');
 if (!status?.liveAvailable) reasons.push(status?.reason ?? 'Live inference unavailable; refresh status.');
 if (budget?.guard !== 'active' || typeof budget.availableUsd !== 'number' || typeof budget.perRunReservationUsd !== 'number') reasons.push('Guarded allowance unavailable.');
 else if (budget.availableUsd <= 0 || budget.availableUsd < budget.perRunReservationUsd) reasons.push('Allowance exhausted; live start disabled.');
 if (active) reasons.push('An investigation is active; cancel it or wait before starting another.');
 const updateConstraint = (key: 'maxMovedEntities' | 'maxTranslationMm', value: number) => draft && setDraft({...draft, constraints:{...draft.constraints, [key]:value}});
 function toggleStation(id: string, checked: boolean) {
  if (!draft || !scenario) return;
  const ids = checked ? [...draft.constraints.allowedEntityIds, id] : draft.constraints.allowedEntityIds.filter(x => x !== id);
  setDraft({...draft, constraints:{...draft.constraints, allowedEntityIds:ids}, allowedRegions: checked ? [...draft.allowedRegions,{entityId:id,minXMm:0,minZMm:0,maxXMm:scenario.geometry.room.widthMm,maxZMm:scenario.geometry.room.depthMm}] : draft.allowedRegions.filter(r => r.entityId !== id)});
 }
 function loadReport(value: unknown, source: string) {
  if (active || locked.current) throw new Error('Cancel or finish the active investigation before importing another report.');
  const report = parseLayoutReport(value);
  epoch.current++;
  if (run) setPrevious(p => [...p,run.report]);
  setRun({report, context:layoutContext(report.input.scenario,report.input.executionConfig,report.implementationVersion),revision:revision.current});
  setDraft(report.approved ?? report.interpreted); setOrigin(source); setError(''); setIdentityBlocked(false);
 }
 function adoptReportContext() {
  if(!run)return;
  if(run.context===identity)setRun({...run,revision:revision.current});
  else pendingAdoption.current=run.context;
 }
 return {origin, loadReport, adoptReportContext, action, setAction, scenario, executionConfig, question, setQuestion, live, setLive, consent, setConsent, refresh, reasons, busy, act, run, stale, now, error, draft, setDraft, identityBlocked, toggleStation, updateConstraint, errors, active, status, budget, previous};
}

export type LayoutAssistantHolder = ReturnType<typeof useLayoutAssistant>;
export function LayoutAssistant({holder}: {holder: LayoutAssistantHolder}) {
 const {scenario, executionConfig, question, setQuestion, live, setLive, consent, setConsent, refresh, reasons, busy, act, run, stale, now, error, draft, setDraft, identityBlocked, toggleStation, updateConstraint, errors, active, status, budget, previous} = holder;
 return <section data-testid="layout-assistant">
  <h2>Packing-station layout testing</h2>
  <p className="hint">Simulation evaluation uses the same 7,200,000 ms (2 hour) ceiling as manual layout tests. Results are truncated if work remains at that ceiling; this is separate from the server request deadline.</p>
  <p className="hint">Interpret your request, review the proposal, then separately approve testing. Review measured results before choosing a verified initial preview and explicitly applying it.</p>
  <label>Layout question<textarea data-testid="layout-question" maxLength={2000} rows={3} value={question} onChange={e => setQuestion(e.target.value)} /></label>
  <label className="exp-check"><input data-testid="layout-live" type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} />Live layout investigation</label>
  <label className="exp-check"><input data-testid="layout-consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I consent to send this question and current warehouse to the configured model and spend from the bounded allowance.</label>
  <p data-testid="layout-provider-config">Configured model: {status?.modelId ?? "checking"} | provider: {status?.providerKind ?? "checking"} | setup does not confirm completion compatibility.</p>
  <button onClick={() => void refresh()}>Refresh layout status</button> <a href="/live-access" target="_blank" rel="noreferrer">Live access sign-in</a>
  <p className="hint">{reasons.join(' ')}</p>
  <button data-testid="layout-start" disabled={busy || reasons.length > 0} onClick={() => { if (reasons.length === 0 && scenario && executionConfig) void act(s => createLayoutInvestigation({scenario,executionConfig,question,safetyCeilingMs:LAYOUT_EVALUATION_CEILING_MS,mode:'live',consent:true},s),true); }}>Interpret layout request</button>
  {error && <p role="alert" className="error">{error} No automatic resubmission.</p>}
  {run && <>
   <p data-testid="layout-state" role="status">{stale ? 'Previous context evidence: ' : ''}{run.report.state} · Requests {run.report.modelRequestsUsed} · Proposals {run.report.proposalsUsed}</p>
   <p>Deadline: {new Date(run.report.deadlineAt).toLocaleString()} · {Math.max(0,Math.ceil((run.report.deadlineAt-now)/1000))} seconds remaining. Approval waiting is included; approval keeps this run ID, deadline and counters.</p>
   {run.report.error && <p role="alert">{run.report.error}</p>}
   {run.report.state === 'AWAITING_APPROVAL' && draft && <fieldset disabled={!active || stale || busy || identityBlocked}>
    <legend>Interpretation proposal — approval required</legend>
    <label>Objective<textarea data-testid="layout-objective" maxLength={500} value={draft.objective} onChange={e => setDraft({...draft,objective:e.target.value})} /></label>
    <p className="hint">Receiving locked; staff, workload, service durations and seed fixed. Centre positions use the 100 mm grid.</p>
    {MAIN_WAREHOUSE_ATTACHMENTS.map(a => <label className="exp-check" key={a.stationId}><input type="checkbox" checked={draft.constraints.allowedEntityIds.includes(a.stationId)} disabled={draft.constraints.lockedEntityIds.includes(a.stationId)} onChange={e => toggleStation(a.stationId,e.target.checked)} />Allow {a.stationId}</label>)}
    <label>Maximum stations moved<input data-testid="layout-max-moves" type="number" min={0} max={1} step={1} value={draft.constraints.maxMovedEntities} onChange={e => updateConstraint('maxMovedEntities',e.target.valueAsNumber)} /></label>
    <label>Maximum translation (mm)<input data-testid="layout-max-translation" type="number" min={0} max={5000} step={100} value={draft.constraints.maxTranslationMm} onChange={e => updateConstraint('maxTranslationMm',e.target.valueAsNumber)} /></label>
    {draft.allowedRegions.map((r,i) => <fieldset key={r.entityId}><legend>{r.entityId} allowed centre rectangle (mm)</legend>{(['minXMm','minZMm','maxXMm','maxZMm'] as const).map(k => <label key={k}>{k}<input aria-label={`${r.entityId} ${k}`} type="number" min={0} max={k.includes('X') ? scenario?.geometry.room.widthMm : scenario?.geometry.room.depthMm} step={100} value={r[k]} onChange={e => setDraft({...draft,allowedRegions:draft.allowedRegions.map((x,j) => j === i ? {...x,[k]:e.target.valueAsNumber} : x)})} /></label>)}</fieldset>)}
    {errors.map(e => <p className="error" key={e}>{e}</p>)}
    <button data-testid="layout-approve" disabled={errors.length > 0 || now >= run.report.deadlineAt} onClick={() => { if (active && !stale && !identityBlocked && errors.length === 0 && Date.now() < run.report.deadlineAt) void act(s => approveLayoutInvestigation(run.report.runId,draft,s)); }}>Approve corrected proposal</button>
   </fieldset>}
   {active && <button data-testid="layout-cancel" disabled={busy} onClick={() => void act(s => cancelLayoutInvestigation(run.report.runId,s),false,true)}>Cancel layout investigation</button>}
  </>}
  <details><summary>Technical details · schema, budget and complete evidence</summary><pre>{JSON.stringify({status,budget,report:run?.report ?? null,previous},null,2)}</pre></details>
 </section>;
}
