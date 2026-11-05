import { readFileSync } from "node:fs";
import { verifyLayoutReportForVersion } from "@layoutlab/simulation";
try {
 const path = process.argv[2];
 if (!path) throw new Error("Usage: node scripts/verify-layout-comparison.mjs <export.json>");
 const raw = JSON.parse(readFileSync(path, "utf8"));
 const result = await verifyLayoutReportForVersion(raw);
 console.log(JSON.stringify(result, null, 2));
 process.exitCode = result.ok ? 0 : 1;
} catch (error) {
 console.log(JSON.stringify({ok:false,mismatches:[String(error)],verifierImplementationVersion:null},null,2));
 process.exitCode = 1;
}
