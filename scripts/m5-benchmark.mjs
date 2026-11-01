// M5 benchmark CLI. Default OFFLINE (baseline+heuristic, zero model calls).
// FIXTURE runs the complete 6x3=18-trial orchestration against a local fake
// transport (providerKind fixture, realMetaRequests 0). LIVE is implemented
// but gated: it refuses without the official Contributor model, exact server
// caps, explicit --authorize-usd covering the full conservative reservation,
// and --confirm-live-spend. LIVE must only run on coordinator authorization
// and execution; never invoke it casually. No key material in args or output.
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const mod = (p) => import(pathToFileURL(join(root, p)).href);
const benchmark = await mod("apps/api/dist/benchmark.js");
const { loadConfig } = await mod("apps/api/dist/config.js");

function usage(exit = 2) {
  console.error(
    [
      "usage:",
      "  node scripts/m5-benchmark.mjs [--mode offline|fixture|live] [--out <json>] [--overwrite]",
      "      [--authorize-usd <n>] [--confirm-live-spend] [--api-base <url>]",
      "  node scripts/m5-benchmark.mjs replay <report.json>",
      "  node scripts/m5-benchmark.mjs freeze-manifest",
      "",
      "Defaults: --mode offline, --out evidence/sanitized/m5-benchmark-<mode>.json (+ .md sibling).",
      "LIVE refuses without --authorize-usd, --confirm-live-spend, and a fresh timestamped --out dir.",
    ].join("\n"),
  );
  process.exit(exit);
}

const argv = process.argv.slice(2);
if (argv[0] === "replay") {
  if (!argv[1]) usage();
  const report = JSON.parse(readFileSync(resolve(argv[1]), "utf8"));
  const replayed = benchmark.replayBenchmarkReport(report, root);
  console.log(`replay: matchesSaved=${replayed.matchesSaved} mismatches=[${replayed.mismatches.join(", ")}]`);
  process.exit(replayed.matchesSaved ? 0 : 1);
}
if (argv[0] === "freeze-manifest") {
  const manifest = benchmark.freezeManifest(root);
  console.log(`froze ${manifest.scenarios.length} scenarios + requirements at ${manifest.sourceCommit}`);
  process.exit(0);
}

const args = new Map();
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === "--overwrite" || k === "--confirm-live-spend") {
    args.set(k, "true");
  } else if (k.startsWith("--")) {
    args.set(k, argv[i + 1]);
    i++;
  } else {
    usage();
  }
}
const mode = args.get("--mode") ?? "offline";
if (mode !== "offline" && mode !== "fixture" && mode !== "live") usage();

if (mode === "offline") {
  const out = args.get("--out") ?? join(root, "evidence", "sanitized", "m5-benchmark-offline.json");
  const report = benchmark.buildOfflineBenchmark(root);
  const files = benchmark.writeBenchmarkFiles(report, out, args.get("--overwrite") === "true");
  const replayed = benchmark.replayBenchmarkReport(report, root);
  console.log(`offline: 6 scenarios, 0 model calls, replay=${replayed.matchesSaved}`);
  console.log(`wrote ${files.jsonPath} + ${files.mdPath}`);
} else if (mode === "fixture") {
  const out = args.get("--out") ?? join(root, "evidence", "sanitized", "m5-benchmark-fixture.json");
  const report = await benchmark.runFixtureBenchmark(root);
  const files = benchmark.writeBenchmarkFiles(report, out, args.get("--overwrite") === "true");
  const replayed = benchmark.replayBenchmarkReport(report, root);
  console.log(
    `fixture: trials=${report.totals.trialsRun}/${report.totals.trialsPlanned} requests=${report.totals.modelRequests} ` +
      `realMeta=${report.totals.realMetaRequests} failures=${report.totals.failures} replay=${replayed.matchesSaved}`,
  );
  console.log(`wrote ${files.jsonPath} + ${files.mdPath}`);
  if (!replayed.matchesSaved) process.exit(1);
} else {
  // LIVE: explicit authorization only. The API server must already run with
  // the real key server-side; this CLI never takes or prints key material.
  const authorizeUsd = args.get("--authorize-usd") === undefined ? NaN : Number(args.get("--authorize-usd"));
  if (args.get("--confirm-live-spend") !== "true") {
    console.error("LIVE refused: pass --confirm-live-spend to acknowledge paid Meta inference.");
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = args.get("--out") ?? join(root, "evidence", "sanitized", `m5-benchmark-live-${stamp}`);
  const apiBase = args.get("--api-base") ?? "http://127.0.0.1:3001";
  const { loadEnvFileInto } = await mod("apps/api/dist/config.js");
  loadEnvFileInto(process.env, join(root, ".env"));
  const config = loadConfig(process.env);
  const preflight = benchmark.preflightLive(config, authorizeUsd);
  if (!preflight.ok) {
    console.error(`LIVE refused: ${preflight.reason}`);
    process.exit(2);
  }
  console.log(`LIVE preflight ok: reservation $${preflight.reservationUsd.toFixed(4)} within $${authorizeUsd}. Starting 18 trials.`);
  let report;
  try {
    report = await benchmark.runLiveBenchmark(root, { apiBase, outDir, authorizeUsd, config });
  } catch (e) {
    console.error(`LIVE refused: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const replayed = benchmark.replayBenchmarkReport(report, root);
  console.log(`live done: trials=${report.totals.trialsRun}/${report.totals.trialsPlanned} replay=${replayed.matchesSaved}`);
  if (!replayed.matchesSaved) process.exit(1);
}
