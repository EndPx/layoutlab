// Compile ONLY the isolated L0 layout draft (packages/simulation/layout-draft)
// to its own .out directory. Never builds the shared simulation dist.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const result = spawnSync(process.execPath, [tsc, "-p", join(root, "packages/simulation/layout-draft/tsconfig.json")], { stdio: "inherit" });
process.exit(result.status ?? 1);
