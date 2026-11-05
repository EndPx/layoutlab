import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('@layoutlab/simulation',async original=>({...await original<object>(),verifyLayoutReportForVersion:vi.fn(async()=>({ok:true,mismatches:[],verifierImplementationVersion:'0.1.1'}))}));
import {verifyLayoutReportForVersion} from '@layoutlab/simulation';
import {resolveMeasuredLayout} from './layout-results';
it('passes the identical unchanged raw comparison object to facade',async()=>{const report=JSON.parse(readFileSync('apps/web/public/evidence/layout-investigation-fixture.json','utf8'));const before=JSON.stringify(report);const row=report.proposals[1];await resolveMeasuredLayout(report,row.candidateId);expect(verifyLayoutReportForVersion).toHaveBeenCalledWith(row.evaluation.comparison);expect(vi.mocked(verifyLayoutReportForVersion).mock.calls[0][0]).toBe(row.evaluation.comparison);expect(JSON.stringify(report)).toBe(before);});
