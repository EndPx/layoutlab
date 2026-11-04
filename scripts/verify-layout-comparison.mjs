import { readFileSync } from "node:fs";
import { verifyLayoutComparison } from "@layoutlab/simulation";
const path = process.argv[2];
if (!path) throw new Error("Usage: node scripts/verify-layout-comparison.mjs <export.json> (build simulation first)");
const result = await verifyLayoutComparison(JSON.parse(readFileSync(path,"utf8")));
console.log(JSON.stringify(result,null,2));
process.exitCode = result.ok ? 0 : 1;
