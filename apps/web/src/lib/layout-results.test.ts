import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseLayoutReport} from './layout-investigations';
import {layoutRows,layoutReportIdentity,resolveMeasuredLayout} from './layout-results';
const saved=JSON.parse(readFileSync('apps/web/public/evidence/layout-investigation-fixture.json','utf8'));
describe('measured layout evidence',()=>{
 it('retains invalid and valid proposal rows, baseline, exact metrics and full report identity',()=>{const report=parseLayoutReport(saved);expect(layoutRows(report)).toHaveLength(2);expect(layoutRows(report)[0].evaluation.validation.ok).toBe(false);const changed=structuredClone(report);changed.input.question+=' changed';expect(layoutReportIdentity(changed)).not.toBe(layoutReportIdentity(report));});
 it('fails closed for malformed/duplicate proposal evidence',()=>{for(const proposals of [[null],[saved.proposals[1],saved.proposals[1]],[{...saved.proposals[1],evaluation:{}}]])expect(()=>layoutRows({...saved,proposals})).toThrow();});
 it('never resolves an invalid candidate into a scene',async()=>{await expect(resolveMeasuredLayout(saved,saved.proposals[0].candidateId)).rejects.toThrow('invalid');});
 it('production resolver exactly matches the measured scene and rejects altered metrics',async()=>{const row=saved.proposals[1];const resolved=await resolveMeasuredLayout(saved,row.candidateId);expect(resolved.scene.stations.find(s=>s.id==='PACK-1')?.centerMm).toEqual(row.evaluation.comparison.transform.toCentreMm);expect(resolved.scene.layoutGhost?.centreMm).toEqual(row.evaluation.comparison.transform.fromCentreMm);expect(resolved.comparison.candidateMetrics).toEqual(row.evaluation.comparison.candidateMetrics);const bad=structuredClone(saved);bad.proposals[1].evaluation.comparison.candidateMetrics.shipped++;await expect(resolveMeasuredLayout(bad,row.candidateId)).rejects.toThrow('mismatch');},60000);
});
