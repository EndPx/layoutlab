// Freeze the accepted 0.1.0 simulation runtime as an immutable,
// browser-compatible ESM archive. Refuses to run once the sources no
// longer declare 0.1.0, so the artifact can never be silently rebuilt
// from a newer engine. Writes manifest.json (source/build hashes, recipe,
// dependency licenses) next to the bundle; LICENSES.md carries the full
// third-party notices. Run from the repository root:
//   node packages/simulation/archive/build-archive.mjs
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pkgRoot, "../..");
const outDir = path.join(here, "0.1.0");
const bundlePath = path.join(outDir, "runtime.mjs");

const versionSrc = fs.readFileSync(path.join(pkgRoot, "src/version.ts"), "utf8");
if (!/SIMULATION_VERSION = "0\.1\.0"/.test(versionSrc)) {
  console.error("refusing to build 0.1.0 archive: src/version.ts no longer declares 0.1.0");
  process.exit(1);
}
if (fs.existsSync(bundlePath)) {
  console.error("refusing to overwrite immutable archive artifact: " + path.relative(repoRoot, bundlePath));
  process.exit(1);
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
const git = (args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
const sourceCommit = git(["rev-parse", "HEAD"]);
const vitePkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "node_modules/vite/package.json"), "utf8"));
const zodPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "node_modules/zod/package.json"), "utf8"));

execFileSync(
  process.execPath,
  [path.join(repoRoot, "node_modules/vite/bin/vite.js"), "build", "--config", path.join(here, "archive.vite.config.mjs")],
  { cwd: pkgRoot, stdio: "inherit" },
);

const sources = {};
for (const name of fs.readdirSync(path.join(pkgRoot, "src")).filter((n) => n.endsWith(".ts")).sort()) {
  sources[`packages/simulation/src/${name}`] = sha256(fs.readFileSync(path.join(pkgRoot, "src", name)));
}
const bundle = fs.readFileSync(bundlePath);
const manifest = {
  artifact: "layoutlab.simulation-runtime/0.1.0",
  implementationVersion: "0.1.0",
  operationsSchema: "layoutlab.operations/1",
  operationsEngine: "layoutlab.operations-engine/1",
  sourceCommit,
  node: process.version,
  buildTool: `vite ${vitePkg.version} (lib mode, rollup, single-file ESM, no minify, no sourcemap)`,
  buildRecipe: "node packages/simulation/archive/build-archive.mjs",
  bundle: {
    path: "packages/simulation/archive/0.1.0/runtime.mjs",
    bytes: bundle.length,
    sha256: sha256(bundle),
  },
  sources,
  bundledDependencies: [
    { name: zodPkg.name, version: zodPkg.version, license: zodPkg.license, notices: "LICENSES.md" },
  ],
  immutable: "Never overwrite runtime.mjs with newer engine output; verify integrity against bundle.sha256.",
};
fs.writeFileSync(path.join(here, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const zodLicense = fs.readFileSync(path.join(repoRoot, "node_modules/zod/LICENSE"), "utf8");
fs.writeFileSync(
  path.join(here, "LICENSES.md"),
  `# Third-party notices for the archived 0.1.0 simulation runtime\n\nThe bundle \`0.1.0/runtime.mjs\` includes the following existing dependency.\nIts notice is reproduced verbatim as required by its license.\n\n## zod ${zodPkg.version} (${zodPkg.license})\n\n\`\`\`\n${zodLicense}\`\`\`\n`,
);
console.log(`archived 0.1.0 runtime: ${bundle.length} bytes sha256 ${manifest.bundle.sha256}`);
