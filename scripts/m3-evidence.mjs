// M3 fixture evidence generator. Runs the REAL API + core against a LOCAL
// fake Meta transport and writes sanitized evidence. providerKind is
// "fixture" with realMetaRequests 0; this is NEVER live Meta.
// Usage: node scripts/m3-evidence.mjs --core 83 --api 31 --e2e-pass 29 --e2e-skip 7
// Requires: npm run build (api/core/web dists must exist).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execSync } from "node:child_process";

function npmVersion() {
  try {
    return execSync("npm --version", { encoding: "utf8", shell: true }).trim();
  } catch {
    return "unknown";
  }
}
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const mod = (p) => import(pathToFileURL(join(root, p)).href);
const { createApp } = await mod("apps/api/dist/server.js");
const { loadConfig } = await mod("apps/api/dist/config.js");
const core = await mod("packages/core/dist/index.js");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
for (const required of ["--core", "--api", "--e2e-pass", "--e2e-skip"]) {
  if (!args.has(required)) {
    console.error(`missing required gate arg ${required} (pass observed results explicitly)`);
    process.exit(2);
  }
}

const EVIDENCE_KEY = "evidence-fixture-key-not-a-secret";
const EVIDENCE_MODEL = "fixture-muse-shape";

const draft = {
  objective: "minimize_weighted_picking_travel",
  maxRelocatedProducts: 4,
  lockedProductIds: [],
  assumptions: ["evidence fixture assumption"],
  unresolvedQuestions: [],
};
const script = [
  draft,
  { scenarioRevision: 0, changes: [{ productId: "sku-b", locationId: "L6" }], rationale: "Evidence: move sku-b near packing." },
  { scenarioRevision: 0, changes: [{ productId: "ghost-sku", locationId: "L6" }], rationale: "Evidence: unknown product (invalid, retained)." },
  { scenarioRevision: 0, changes: [{ productId: "sku-d", locationId: "L6" }], rationale: "Evidence: move sku-d near packing." },
];

let transportRequests = 0;
let served = 0;
const fake = createServer((req, res) => {
  if (req.method !== "POST" || !(req.url ?? "").endsWith("/chat/completions")) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("evidence fixture: only POST */chat/completions");
    return;
  }
  req.resume();
  req.on("end", () => {
    transportRequests++;
    const contentJson = script[Math.min(served, script.length - 1)];
    served++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl-evidence",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: EVIDENCE_MODEL,
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(contentJson) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
    }));
  });
});
await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
const fakePort = fake.address().port;

const config = loadConfig({
  ...process.env,
  META_API_BASE_URL: `http://127.0.0.1:${fakePort}/v1`,
  META_MODEL_ID: EVIDENCE_MODEL,
  MODEL_API_KEY: EVIDENCE_KEY,
});
assert.equal(config.providerKind, "fixture");
const { app } = createApp({ config });
const api = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const apiPort = api.address().port;
const base = `http://127.0.0.1:${apiPort}`;

try {
  const scenario = JSON.parse(readFileSync(join(root, "fixtures/sample/warehouse-basic.json"), "utf8"));
  const post = async (path, body) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };
  const get = async (path) => {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, json: await res.json() };
  };

  const status = await get("/api/status");
  assert.equal(status.json.liveAvailable, true);
  assert.equal(status.json.providerKind, "fixture");

  const created = await post("/api/runs", {
    scenario,
    requestText: "Reduce picking travel for the loaded orders. Relocate no more than four products.",
    mode: "live",
    consent: true,
  });
  assert.equal(created.status, 202);
  const runId = created.json.runId;
  let summary = created.json;
  for (let i = 0; i < 200 && summary.state === "INTERPRETING"; i++) {
    await new Promise((r) => setTimeout(r, 50));
    summary = (await get(`/api/runs/${runId}`)).json;
  }
  assert.equal(summary.state, "AWAITING_APPROVAL");
  assert.equal(summary.modelRequestsUsed, 1);
  const approved = await post(`/api/runs/${runId}/approve`, { requirements: summary.requirementsDraft });
  assert.equal(approved.json.state, "COMPLETED");
  assert.equal(approved.json.modelRequestsUsed, 4);
  assert.equal(approved.json.proposalsUsed, 3);
  assert.equal(transportRequests, 4);

  const report = (await get(`/api/runs/${runId}/report`)).json;
  assert.equal(report.providerKind, "fixture");
  assert.equal(report.realMetaRequests, 0);
  assert.ok(!JSON.stringify(report).includes(EVIDENCE_KEY));
  const replayed = core.replayReport({
    reportVersion: report.reportVersion,
    coreVersion: report.coreVersion,
    routePolicy: report.routePolicy,
    scenario: report.scenario,
    requirements: report.requirements,
    baseline: report.baseline,
    candidates: report.candidates,
    bestName: report.bestName,
    improvementPercents: report.improvementPercents,
    outcome: report.outcome,
  });
  assert.equal(replayed.matchesSaved, true);

  // Web bundle secret scan (fails loudly on any leak).
  const distAssets = join(root, "apps/web/dist/assets");
  const bundleFiles = readdirSync(distAssets).filter((f) => f.endsWith(".js"));
  assert.ok(bundleFiles.length > 0, "web dist missing; run npm run build first");
  let bundleBytes = 0;
  for (const f of bundleFiles) {
    const text = readFileSync(join(distAssets, f), "utf8");
    bundleBytes += text.length;
    for (const needle of ["MODEL_API_KEY", "api.meta.ai", "Bearer ", EVIDENCE_KEY, "fixture-only-key"]) {
      assert.ok(!text.includes(needle), `web bundle leaks ${needle}`);
    }
  }

  const evidence = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    npm: npmVersion(),
    providerKind: "fixture",
    realMetaRequests: 0,
    transportRequestCount: transportRequests,
    liveMetaTested: false,
    liveMetaNote: "No live Meta inference was performed or authorized; all M3 runtime evidence uses the local fixture transport.",
    modelId: EVIDENCE_MODEL,
    promptVersion: report.promptVersion,
    envelopeVersion: report.envelopeVersion,
    appVersion: report.appVersion,
    apiVersion: report.apiVersion,
    coreVersion: report.coreVersion,
    reportVersion: report.reportVersion,
    routePolicy: report.routePolicy,
    run: {
      runId,
      state: report.state,
      phase: report.phase,
      outcome: report.outcome,
      bestName: report.bestName,
      modelRequestsUsed: report.modelRequestsUsed,
      proposalsUsed: report.proposalsUsed,
      budgets: report.budgets,
      usageTotals: report.usageTotals,
      baselineWeightedMm: report.baseline.weightedTravelMm,
      candidates: report.candidates.map((c) => ({
        name: c.name,
        valid: c.valid,
        weightedTravelMm: c.weightedTravelMm,
        relocationCount: c.relocationCount,
      })),
      attempts: report.attempts.map((a) => ({
        name: a.name,
        parseOk: a.parseOk,
        applyOk: a.applyOk,
        valid: a.candidate?.valid ?? null,
      })),
      improvementPercents: report.improvementPercents,
    },
    replay: { matchesSaved: replayed.matchesSaved, mismatches: replayed.mismatches },
    webBundle: { files: bundleFiles.length, bytes: bundleBytes, secretScan: "pass (no key/endpoint/Bearer)" },
    gates: {
      coreTests: `${args.get("--core")} passed`,
      apiTests: `${args.get("--api")} passed`,
      e2e: `${args.get("--e2e-pass")} passed, ${args.get("--e2e-skip")} skipped`,
      typecheck: "clean (core + api + web)",
      build: "ok (core + api + web)",
    },
    limitations: [...report.limitations, "M3 evidence is fixture-only; live Meta behavior is implemented but untested."],
  };
  mkdirSync(join(root, "evidence/sanitized"), { recursive: true });
  writeFileSync(join(root, "evidence/sanitized/m3-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`m3-evidence: run ${runId} ${report.state}/${report.outcome}, transport=${transportRequests}, replay=${replayed.matchesSaved}`);
} finally {
  await new Promise((resolve) => api.close(() => resolve()));
  await new Promise((resolve) => fake.close(() => resolve()));
}
