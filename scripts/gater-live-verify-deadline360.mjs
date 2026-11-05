import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyLayoutInvestigationExport} from '../.coordination/gater-live-dist/layout-investigations.js';
const path='evidence/sanitized/gater-live/deadline360/layout.json';const bytes=readFileSync(path);const report=JSON.parse(bytes);const result={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),verification:await verifyLayoutInvestigationExport(report),state:report.state,error:report.error,requests:report.requests,proposals:report.proposals.length,recommendation:report.recommendation};writeFileSync('evidence/sanitized/gater-live/deadline360/reloaded-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
