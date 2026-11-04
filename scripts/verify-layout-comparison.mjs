import { readFileSync } from "node:fs";
import { verifyLayoutComparison, verifyRackLayoutComparison } from "@layoutlab/simulation";
const path = process.argv[2];
if (!path) throw new Error("Usage: node scripts/verify-layout-comparison.mjs <export.json> (build simulation first)");
const raw = JSON.parse(readFileSync(path,"utf8"));
const result = raw.schema === 'layoutlab.rack-comparison/1' ? { ok: await verifyRackLayoutComparison(raw) } : raw.schema === 'layoutlab.layout-comparison/2' ? await verifyLayoutComparison(raw) : { ok: false, mismatches: [`Unsupported layout schema: ${raw.schema}`] };
console.log(JSON.stringify(result,null,2));
process.exitCode = result.ok ? 0 : 1;
