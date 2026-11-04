import { useEffect, useRef, useState } from 'react';
import type { LayoutComparisonResult, OperationsScenario } from '@layoutlab/simulation';
import { layoutContext, verifyLayoutReport, type LayoutReport } from '../lib/layout-investigations';
import { layoutRows, layoutReportIdentity, resolveMeasuredLayout } from '../lib/layout-results';
import type { OperationsScene } from '../lib/operations';
import type { LayoutAssistantHolder } from './LayoutAssistant';

type Props = {
 assistant: LayoutAssistantHolder;
 scenario: OperationsScenario | null;
 executionConfig: {pickDurationMsPerItem:number;unloadDurationMsPerItem:number} | null;
 implementationVersion: string;
 contextRevision: number;
 onPreview: (scene:OperationsScene|null) => void;
 onApply: (scene:OperationsScene, comparison:LayoutComparisonResult) => void;
 onLoadInput: (report:LayoutReport) => void;
};
export function useLayoutResults(props: Props) {
 const report = props.assistant.run?.report ?? null;
 const fullIdentity = report ? layoutReportIdentity(report) : '';
 const parent = props.scenario && props.executionConfig ? layoutContext(props.scenario,props.executionConfig,props.implementationVersion) : '';
 const [selected,setSelected] = useState('');
 const key = fullIdentity + '\n' + parent + '\n' + selected + '\n' + props.contextRevision;
 const current = useRef(key); current.current = key;
 const callbacks = useRef(props); callbacks.current = props;
 const [proof,setProof] = useState<{key:string;sequence:number;scene:OperationsScene;comparison:LayoutComparisonResult}|null>(null);
 const [verification,setVerification] = useState<{key:string;ok:boolean;message:string}|null>(null);
 const [error,setError] = useState(''),[busy,setBusy] = useState(false),[previewing,setPreviewing] = useState(false);
 const previewOwned = useRef(false);
 const sequence = useRef(0), controller = useRef<AbortController|null>(null);
 useEffect(() => { sequence.current++; controller.current?.abort(); setProof(null);setVerification(null);setBusy(false);setPreviewing(false); if(previewOwned.current){previewOwned.current=false;callbacks.current.onPreview(null);}return()=>{sequence.current++;controller.current?.abort();}; },[key]);
 let rows: ReturnType<typeof layoutRows> = [], malformed = '';
 try { if(report) rows=layoutRows(report); } catch(e) { malformed=e instanceof Error?e.message:String(e); }
 const row=rows.find(r=>r.candidateId===selected);
 const valid=!!row?.evaluation.validation.ok && !row.evaluation.regionIssues.length && !!row.evaluation.comparison?.candidateValid;
 const stale=!!report && (props.assistant.stale || layoutContext(report.input.scenario,report.input.executionConfig,report.implementationVersion)!==parent);
 async function verify(preview:boolean,loadInput=false) {
  if(!report||busy|| (preview&&!valid))return;
  const captured=key, seq=++sequence.current, c=new AbortController();controller.current?.abort();controller.current=c;
  setBusy(true);setError('');setProof(null);setVerification(null);
  try {
   const result=await verifyLayoutReport(report,c.signal);
   if(c.signal.aborted||current.current!==captured||seq!==sequence.current)return;
   setVerification({key:captured,ok:result.ok,message:result.ok?'Verified exact full report (HTTP recomputation; no inference)':'Report rejected: '+result.mismatches.join('; ')});
   if(!result.ok)throw new Error('Altered or inconsistent report rejected: '+result.mismatches.join('; '));
   if(loadInput){callbacks.current.onLoadInput(report);return;}
   if(preview){const resolved=await resolveMeasuredLayout(report,selected);if(c.signal.aborted||current.current!==captured||seq!==sequence.current)return;setProof({key:captured,sequence:seq,...resolved});previewOwned.current=true;callbacks.current.onPreview(resolved.scene);setPreviewing(true);}
  }catch(e){if(!c.signal.aborted&&current.current===captured&&seq===sequence.current){setError(e instanceof Error?e.message:String(e));previewOwned.current=false;callbacks.current.onPreview(null);setPreviewing(false);}}
  finally{if(!c.signal.aborted&&current.current===captured&&seq===sequence.current)setBusy(false);}
 }
 function clearPreview() {
  // Discard revokes work already in flight, including non-abortable local recomputation.
  sequence.current++;
  controller.current?.abort(); controller.current=null;
  previewOwned.current=false;
  setProof(null);setVerification(null);setBusy(false);setPreviewing(false);setError('');
  callbacks.current.onPreview(null);
 }
 function apply(){if(!report||!proof||proof.key!==key||proof.sequence!==sequence.current||stale||props.assistant.stale||report.state!=='COMPLETED'||busy||!valid)return;callbacks.current.onApply(proof.scene,proof.comparison);previewOwned.current=false;setPreviewing(false);setProof(null);}
 function exportReport(){if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`layout-investigation-${report.runId}.json`;a.click();URL.revokeObjectURL(url);}
 async function importReport(file:File|undefined){
  if(!file)return;
  clearPreview();
  const captured=key,seq=sequence.current;
  try{
   if(file.size>1024*1024)throw new Error('Import file exceeds the 1 MiB browser file limit; the file was not read. The API also limits the complete JSON body, including the report wrapper, to 1 MiB.');
   const value=JSON.parse(await file.text());
   if(current.current!==captured||seq!==sequence.current)return;
   if(new TextEncoder().encode(JSON.stringify({report:value})).byteLength>1024*1024)throw new Error('Report plus its JSON wrapper exceeds the API 1 MiB body limit. No request was sent.');
   callbacks.current.assistant.loadReport(value,'Imported report');setError('');
  }catch(e){if(current.current===captured&&seq===sequence.current)setError(e instanceof Error?e.message:String(e));}
 }

 async function recorded(){controller.current?.abort();setBusy(false);setProof(null);setVerification(null);if(previewOwned.current){previewOwned.current=false;callbacks.current.onPreview(null);setPreviewing(false);}const captured=key,seq=++sequence.current;try{const r=await fetch('/evidence/layout-investigation-fixture.json');if(!r.ok)throw new Error('Recorded FIXTURE example unavailable');const value=await r.json();if(current.current!==captured||seq!==sequence.current)return;callbacks.current.assistant.loadReport(value,'Recorded FIXTURE example; no live Meta inference');setError('');}catch(e){if(current.current===captured&&seq===sequence.current)setError(e instanceof Error?e.message:String(e));}}
 return {report,rows,malformed,selected,setSelected,row,valid,stale,proof,verification,key,error,busy,verify,apply,exportReport,importReport,recorded,previewing,clearPreview,canApply:!!proof&&proof.key===key&&proof.sequence===sequence.current&&!stale&&!props.assistant.stale&&report?.state==='COMPLETED'&&!busy&&valid,origin:props.assistant.origin,active:props.assistant.active,loadInput:()=>void verify(false,true)};
}
export type LayoutResultsHolder=ReturnType<typeof useLayoutResults>;
const metric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:'unavailable';
const fields=['shipped','makespanMs','totalWaitMs','backlog'] as const;
export function LayoutResults({holder:h}:{holder:LayoutResultsHolder}) {
 const baseline=h.report?.baseline as LayoutComparisonResult|null|undefined;
 const provider=h.report?.provider as {kind?:string}|undefined;
 const proposalLabel=(id:string)=>id==='baseline'?'Baseline':h.rows.some(r=>r.candidateId===id)?`Proposal ${h.rows.findIndex(r=>r.candidateId===id)+1}`:'Unavailable candidate';
 const recommendation=h.report?.recommendation as {candidateId?:string;source?:string}|null|undefined;
 return <section data-testid="layout-results">
  <h3>Layout evidence and initial preview</h3>
  <button data-testid="layout-recorded" disabled={h.active} onClick={()=>void h.recorded()}>Load recorded FIXTURE example</button>
  <p className="hint">Recorded evidence uses the production engine with a LOCAL fake provider. It makes no new inference and does not establish live Meta performance.</p>
  <label>Import full layout report<input data-testid="layout-import" type="file" accept="application/json,.json" disabled={h.active} onChange={e=>{void h.importReport(e.target.files?.[0]);e.target.value='';}}/></label>
  {(h.error||h.malformed)&&<p role="alert" className="error">{h.error||h.malformed}</p>}
  {h.report&&<>
   <p data-testid="layout-source">{h.origin} · {provider?.kind==='fixture'?'LOCAL fake-provider FIXTURE':provider?.kind==='meta'?(h.origin==='Server investigation'?'Live Meta server response':'Declared Meta provenance (recorded/imported; unauthenticated)'):'Provider provenance unavailable'}</p>
   <p>{h.stale?'Previous context: inspect/export allowed; Apply blocked.':'Report parent matches current scenario/config/version.'}</p>
   <button data-testid="layout-export" onClick={h.exportReport}>Export complete layout report</button>
   <button data-testid="layout-verify-report" disabled={h.busy} onClick={()=>void h.verify(false)}>Verify full report (no inference)</button>
   {h.stale&&<button data-testid="layout-load-input" disabled={h.active||h.busy} onClick={h.loadInput}>Load this report input as current warehouse</button>}
   {h.verification?.key===h.key&&<p data-testid="layout-verification" role="status">{h.verification.message}</p>}
   <p className="hint">Saved report evidence requires verification for the selected candidate and current parent. Verification checks consistency, not model or user authorship.</p>
   <p>Model recommendation: {typeof recommendation?.candidateId==='string'?proposalLabel(recommendation.candidateId):'none'} ({typeof recommendation?.source==='string'?recommendation.source:'none'}). This is separate from the measured results below.</p>
   <div style={{maxWidth:'100%',overflowX:'auto'}}><table data-testid="layout-evidence-table"><thead><tr><th>Evidence</th><th>Outcome</th>{fields.map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>
    <tr><td>Baseline</td><td>{baseline?.baselineValid?'Valid baseline':'Not evaluated'}</td>{fields.map(k=><td key={k}>{metric(baseline?.baselineMetrics?.[k])}</td>)}</tr>
    {h.rows.map((r,index)=><tr key={r.candidateId}><td>Proposal {index+1}</td><td>{r.evaluation.comparison?.improvement??'invalid / not measured'}</td>{fields.map(k=><td key={k}>{metric(r.evaluation.comparison?.candidateMetrics?.[k])}</td>)}</tr>)}
   </tbody></table></div>
   <label>Inspect proposal<select data-testid="layout-result-select" value={h.selected} onChange={e=>h.setSelected(e.target.value)}><option value="">Choose evidence</option>{h.rows.map(r=><option key={r.candidateId} value={r.candidateId}>{r.candidateId} · {r.evaluation.comparison?.improvement??'invalid / not measured'}</option>)}</select></label>
   {h.row&&<><p>{h.row.hypothesis} (provider assertion)</p>{h.row.evaluation.validation.issues.map((i,n)=><p className="error" key={n}>{i.code}: {i.message}</p>)}{h.row.evaluation.regionIssues.map((i,n)=><p key={n}>{i}</p>)}{h.row.evaluation.comparison&&<><p>{h.row.evaluation.comparison.explanation}</p><p data-testid="layout-relocation">{h.row.evaluation.comparison.transform ? `${h.row.evaluation.comparison.transform.entityId}: (${h.row.evaluation.comparison.transform.fromCentreMm?.x}, ${h.row.evaluation.comparison.transform.fromCentreMm?.z}) ? (${h.row.evaluation.comparison.transform.toCentreMm?.x}, ${h.row.evaluation.comparison.transform.toCentreMm?.z}) mm` : 'No relocation'}</p><p>{h.row.evaluation.comparison.evaluationScope.truncated?'Truncated evaluation scope':'Full declared evaluation scope'}</p></>}
    <button data-testid="layout-preview" disabled={!h.valid||h.busy||!!h.malformed} onClick={()=>void h.verify(true)}>Verify and preview initial candidate</button>
    <button data-testid="layout-result-apply" disabled={!h.canApply} onClick={h.apply}>Apply verified layout as new initial run</button>
   </>}
   {h.previewing&&<><p className="notice" data-testid="layout-preview-notice">Verified candidate INITIAL conditions; current controller is untouched and paused. Original footprint is the dashed ghost.</p><button data-testid="layout-preview-clear" onClick={h.clearPreview}>Return to current run (discard preview)</button></>}
   {h.busy&&<p role="status">Verifying exact report and production geometry/engine comparison…</p>}
  </>}
 </section>;
}
