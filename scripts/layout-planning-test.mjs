// Isolated L0 tests: compile layout-draft only, then run its maintained
// node:test suite against the already-built public simulation dist.
// Usage: node scripts/layout-planning-test.mjs
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = spawnSync(process.execPath, [join(root, "scripts/layout-planning-build.mjs")], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const tests = spawnSync(process.execPath, ["--test", join(root, "packages/simulation/layout-draft/test/layout-draft.test.mjs")], { stdio: "inherit" });
process.exit(tests.status ?? 1);
