import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { proposePatch } from "../src/operations-api.js";
import { InvestigationStore, parseInvestigationInput, verifyInvestigationExport } from "../src/operations-investigations.js";
import type { FetchLike } from "../src/provider.js";
const config = loadConfig({ MODEL_API_BASE_URL: "https://api.gater.ai.id/v1", MODEL_ID: "glm-5-3-flash", MODEL_API_KEY: "fake-key", BUDGET_STATE_FILE: "" });
const nulls = { extraPickers: null, extraPutaway: null, packingDurationMs: null, dispatchDurationMs: null, receivingDurationMs: null };
const transport = (value: unknown): FetchLike => (async () => new Response(JSON.stringify({ id: "fake", model: "glm-5-3-flash", choices: [{ message: { content: JSON.stringify(value) }, finish_reason: "stop" }] }), { status: 200 })) as FetchLike;
it("labels concrete proposals and rejects domain-invalid output", async () => {
  const result = await proposePatch({ config, fetchImpl: transport({ ...nulls, dispatchDurationMs: 1000 }), observation: "Reduce dispatch duration" });
  expect(result).toMatchObject({ provider: "gater", providerKind: "gater", patch: { dispatchDurationMs: 1000 } });
  await expect(proposePatch({ config, fetchImpl: transport({ ...nulls, dispatchDurationMs: 1 }), observation: "Reduce dispatch duration" })).rejects.toBeTruthy();
});
it("saves and verifies declared Gater provenance with strict pairs and counters", { timeout: 180000 }, async () => {
  const scenario = JSON.parse(readFileSync(new URL("../../../fixtures/operations/picking-packing-burst.json", import.meta.url), "utf8"));
  scenario.orderSchedule = scenario.orderSchedule.slice(0, 6);
  const { executionConfig } = JSON.parse(readFileSync(new URL("../../../fixtures/operations/picking-packing-burst.runconfig.json", import.meta.url), "utf8"));
  const store = new InvestigationStore(config);
  const record = store.create(parseInvestigationInput({ scenario, executionConfig, interventionPolicy: { allowedFields: ["dispatchDurationMs"] }, question: "Can faster dispatch improve makespan?", mode: "live", consent: true }), null);
  let calls = 0;
  store.start(record, (async () => {
    calls++;
    return transport(calls === 1 ? { action: "run_experiment", hypothesis: "Faster dispatch", ...nulls, dispatchDurationMs: 1000, candidateId: null } : { action: "finish", hypothesis: null, ...nulls, candidateId: "exp-1" })("https://unused.invalid");
  }) as FetchLike);
  while (record.state === "RUNNING") await new Promise(r => setTimeout(r, 20));
  expect(record.state).toBe("COMPLETED");
  const summary = store.toSummary(record);
  expect(summary).toMatchObject({ provider: "gater", providerKind: "gater", requestCount: 2, realMetaRequests: 0 });
  expect(record.modelRequestsUsed).toBe(2);
  expect(calls).toBe(2);
  const path = join(mkdtempSync(join(tmpdir(), "gater-ops-")), "report.json");
  writeFileSync(path, JSON.stringify(summary.report));
  const report = JSON.parse(readFileSync(path, "utf8"));
  expect(verifyInvestigationExport(report).ok).toBe(true);
  for (const patch of [{ provider: "unknown" }, { provider: "meta" }, { providerKind: "fixture" }, { requestCount: 3 }, { realMetaRequests: 2 }]) {
    expect(verifyInvestigationExport({ ...report, ...patch }).ok).toBe(false);
  }
  for (const providerKind of ["meta", "fixture", "unsupported"]) {
    expect(verifyInvestigationExport({ ...report, provider: "meta", providerKind, realMetaRequests: providerKind === "meta" ? 2 : 0 }).ok).toBe(true);
  }
});
