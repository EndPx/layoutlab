import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyInvestigationExport} from '../.coordination/gater-live-dist/operations-investigations.js';
import {verifyLayoutInvestigationExport} from '../.coordination/gater-live-dist/layout-investigations.js';
const results={};for(const [name,verify] of [['operations',verifyInvestigationExport],['layout',verifyLayoutInvestigationExport]]){const bytes=readFileSync(`evidence/sanitized/gater-live/${name}.json`);const report=JSON.parse(bytes);results[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),verification:await verify(report),state:report.state,error:report.error??null,requests:report.requests??null,requestCount:report.requestCount??report.modelRequestsUsed,recommendation:report.recommendation};}writeFileSync('evidence/sanitized/gater-live/reloaded-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
