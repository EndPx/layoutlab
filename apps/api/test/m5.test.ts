// M5 API tests: failure diagnostics, failure-audit export, and the benchmark
// runner. Fixture transport only (providerKind "fixture", realMetaRequests
// 0); live preflight is tested as pure refusal logic — no paid inference.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BENCHMARK_IDS,
  buildOfflineBenchmark,
  checkServerFingerprint,
  conservativeReservationUsd,
  loadBenchmark,
  preflightLive,
  readServerFingerprint,
  replayBenchmarkReport,
  runFixtureBenchmark,
  runLiveBenchmark,
  runTrial,
  usageEstimatedUsd,
  verifyBenchmarkHashes,
} from "../src/benchmark.js";
import { loadConfig, type ApiConfig } from "../src/config.js";
import { replayFailureRecord } from "../src/runs.js";
import { createApp } from "../src/server.js";
import { scriptHandler, startFakeMeta, type FakeMeta } from "./fake-meta.js";

const FAKE_KEY = "fixture-only-key-not-a-secret";
const FAKE_MODEL = "fixture-muse-shape";

function sampleScenario(): unknown {
  const url = new URL("../../../fixtures/sample/warehouse-basic.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

function rootDir(): string {
  return dirname(dirname(dirname(fileURLToPath(new URL(".", import.meta.url)))));
}

function draftRequirements(maxRelocated = 4): unknown {
  return {
    objective: "minimize_weighted_picking_travel",
    maxRelocatedProducts: maxRelocated,
    lockedProductIds: [],
    assumptions: ["m5 fixture assumption"],
    unresolvedQuestions: [],
  };
}

function proposal(revision: number, changes: { productId: string; locationId: string }[], rationale: string): unknown {
  return { scenarioRevision: revision, changes, rationale };
}

function testConfig(fake: FakeMeta, overrides: Record<string, string> = {}): ApiConfig {
  return loadConfig({
    ...process.env,
    META_API_BASE_URL: fake.baseUrl,
    META_MODEL_ID: FAKE_MODEL,
    MODEL_API_KEY: FAKE_KEY,
    ...overrides,
  });
}

async function startApi(config: ApiConfig): Promise<{ apiUrl: string; close: () => Promise<void> }> {
  const { app } = createApp({ config });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    apiUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length > 0) {
    const c = closers.pop() as () => Promise<void>;
    await c().catch(() => {});
  }
});

async function postJson(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

async function getJson(url: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url);
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

async function waitFor(apiUrl: string, runId: string, want: string[], timeoutMs = 15000): Promise<Record<string, unknown>> {
  const started = Date.now();
  let last: Record<string, unknown> = {};
  for (;;) {
    const r = await getJson(`${apiUrl}/api/runs/${runId}`);
    last = r.json;
    if (want.includes(last["state"] as string)) return last;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${want.join("/")}.`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

function realShapedEnvelope(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "chatcmpl-m5-diag",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: FAKE_MODEL,
    choices: [{ index: 0, message: { role: "assistant", content: null }, finish_reason: "length" }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    ...over,
  };
}

describe("M5 failure diagnostics", () => {
  it("retains usage, finish reason, and response id on null content with length finish", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements(), usage: { p: 10, c: 5, t: 15 } },
          { kind: "envelope", envelopeJson: realShapedEnvelope() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "valid retry"), usage: { p: 20, c: 6, t: 26 } },
          { kind: "ok", contentJson: proposal(0, [], "retain"), usage: { p: 30, c: 7, t: 37 } },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    expect(created.status).toBe(202);
    const runId = created.json["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(attempts[0]?.["parseOk"]).toBe(false);
    expect(attempts[0]?.["parseError"]).toContain("no message content");
    // Available envelope metadata is retained, not discarded.
    expect(attempts[0]?.["usage"]).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(attempts[0]?.["diagnostics"]).toEqual({
      responseId: "chatcmpl-m5-diag",
      finishReason: "length",
      errorCode: "PARSE_ERROR",
    });
    // Failed-attempt usage is summed too; the valid retry still wins among models.
    const totals = approved.json["usageTotals"] as Record<string, number>;
    expect(totals["promptTokens"]).toBe(160);
    expect(totals["completionTokens"]).toBe(68);
    expect(totals["totalTokens"]).toBe(228);
    expect(approved.json["usageIncomplete"]).toBe(false);
    expect(approved.json["bestName"]).toBe("heuristic");
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    expect((report.json["attempts"] as Record<string, unknown>[])[0]?.["diagnostics"]).toEqual({
      responseId: "chatcmpl-m5-diag",
      finishReason: "length",
      errorCode: "PARSE_ERROR",
    });
  });

  it("classifies malformed envelopes with explicit null diagnostics", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "envelope", envelopeJson: { id: "chatcmpl-malformed", bogus: true } },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(attempts[0]?.["parseOk"]).toBe(false);
    expect(attempts[0]?.["usage"]).toBeNull();
    expect(attempts[0]?.["diagnostics"]).toEqual({ responseId: "chatcmpl-malformed", finishReason: null, errorCode: "PARSE_ERROR" });
    expect(approved.json["usageIncomplete"]).toBe(true);
  });

  it("sends reasoning_effort low with a 2000-token bound and records generation settings", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    expect(awaiting["generationSettings"]).toEqual({ reasoningEffort: "low", maxCompletionTokens: 2000 });
    expect(awaiting["interpretDiagnostics"]).toEqual({ responseId: "chatcmpl-fixture", finishReason: "stop", errorCode: null });
    await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, { requirements: awaiting["requirementsDraft"] });
    for (const r of fake.requests) {
      expect(r.bodyJson["reasoning_effort"]).toBe("low");
      expect(r.bodyJson["max_completion_tokens"]).toBe(2000);
    }
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    expect(report.json["generationSettings"]).toEqual({ reasoningEffort: "low", maxCompletionTokens: 2000 });
    const attempts = report.json["attempts"] as Record<string, unknown>[];
    expect(attempts[0]?.["diagnostics"]).toEqual({ responseId: "chatcmpl-fixture", finishReason: "stop", errorCode: null });
  });
});

describe("M5 failure-audit export", () => {
  it("exports an honest audit for failed interpretation (no success report)", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "error", status: 500, body: "fixture interpret failure" }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel please",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    const failed = await waitFor(api.apiUrl, runId, ["FAILED"]);
    expect(failed["modelRequestsUsed"]).toBe(1);
    // No evaluated report exists.
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    expect(report.status).toBe(409);
    // The failure audit exports instead: audit facts, explicit nulls, no metrics.
    const audit = await getJson(`${api.apiUrl}/api/runs/${runId}/failure-report`);
    expect(audit.status).toBe(200);
    const e = audit.json;
    expect(e["envelopeVersion"]).toBe("layoutlab.m5failure/1");
    expect(e["runId"]).toBe(runId);
    expect(e["state"]).toBe("FAILED");
    expect(e["outcome"]).toBeNull();
    expect(e["reportAvailable"]).toBe(false);
    expect(e["measurement"]).toBeNull();
    expect(e["proposalsUsed"]).toBe(0);
    expect(e["attempts"]).toEqual([]);
    expect(e["requirements"]).toBeNull();
    expect(e["requestText"]).toBe("reduce travel please");
    expect((e["scenario"] as Record<string, unknown>)["id"]).toBe("warehouse-basic");
    expect(e["providerKind"]).toBe("fixture");
    expect(e["realMetaRequests"]).toBe(0);
    expect(e["interpretDiagnostics"]).toEqual({ responseId: null, finishReason: null, errorCode: "TRANSPORT_ERROR" });
    expect(JSON.stringify(e)).not.toContain(FAKE_KEY);
    // Audit replay validates but states no measurement existed.
    const replayed = replayFailureRecord(e);
    expect(replayed.valid).toBe(true);
    expect(replayed.evaluated).toBe(false);
    expect(replayed.notice).toContain("No deterministic measurement existed");
  });

  it("exports an honest audit for cancellation before approval", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements(), delayMs: 1500 }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    await new Promise((r) => setTimeout(r, 200));
    const cancelled = await postJson(`${api.apiUrl}/api/runs/${runId}/cancel`, {});
    expect(cancelled.json["state"]).toBe("CANCELLED");
    const audit = await getJson(`${api.apiUrl}/api/runs/${runId}/failure-report`);
    expect(audit.status).toBe(200);
    expect(audit.json["state"]).toBe("CANCELLED");
    expect(audit.json["outcome"]).toBeNull();
    expect(audit.json["reportAvailable"]).toBe(false);
    expect(audit.json["measurement"]).toBeNull();
    expect(audit.json["attempts"]).toEqual([]);
    expect(replayFailureRecord(audit.json).evaluated).toBe(false);
  });

  it("routes evaluated runs to /report and rejects success-claiming audits", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "error", status: 500, body: "fixture mid-run failure" },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    // Active run: no failure audit yet.
    expect((await getJson(`${api.apiUrl}/api/runs/${runId}/failure-report`)).status).toBe(409);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    // FAILED after evaluation started: /report works, failure audit refuses (never both).
    expect(approved.json["state"]).toBe("FAILED");
    expect((await getJson(`${api.apiUrl}/api/runs/${runId}/report`)).status).toBe(200);
    const refused = await getJson(`${api.apiUrl}/api/runs/${runId}/failure-report`);
    expect(refused.status).toBe(409);
    expect(refused.json["code"]).toBe("REPORT_AVAILABLE");
    expect((await getJson(`${api.apiUrl}/api/runs/does-not-exist/failure-report`)).status).toBe(404);
  });

  it("failure replay rejects tampered success claims", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "error", status: 500, body: "x" }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    await waitFor(api.apiUrl, runId, ["FAILED"]);
    const audit = (await getJson(`${api.apiUrl}/api/runs/${runId}/failure-report`)).json;
    const tampered = (mutate: (e: Record<string, unknown>) => void): Record<string, unknown> => {
      const e = JSON.parse(JSON.stringify(audit)) as Record<string, unknown>;
      mutate(e);
      return e;
    };
    expect(() => replayFailureRecord(tampered((e) => { e["outcome"] = "IMPROVED_VALID_ASSIGNMENT"; }))).toThrow(/outcome/);
    expect(() => replayFailureRecord(tampered((e) => { e["reportAvailable"] = true; }))).toThrow(/reportAvailable/);
    expect(() => replayFailureRecord(tampered((e) => { e["measurement"] = { travel: 1 }; }))).toThrow(/measurement/);
    expect(() => replayFailureRecord(tampered((e) => { e["attempts"] = [{ name: "proposal-1" }]; }))).toThrow(/attempts/);
    expect(() => replayFailureRecord(tampered((e) => { e["state"] = "COMPLETED"; }))).toThrow(/state/);
    expect(() => replayFailureRecord(tampered((e) => { e["modelRequestsUsed"] = 5; }))).toThrow(/modelRequestsUsed/);
    expect(() => replayFailureRecord(tampered((e) => {
      e["budgets"] = { maxProposals: 9, maxRequests: 99, timeoutMs: 999999 };
    }))).toThrow(/budgets/);
    expect(() => replayFailureRecord(tampered((e) => { e["modelRequestsUsed"] = 1.5; }))).toThrow(/modelRequestsUsed/);
    expect(() => replayFailureRecord(tampered((e) => { e["interpretedUnresolved"] = [{ q: 1 }]; }))).toThrow(/interpretedUnresolved/);
  });
});

describe("M5 canonical input gate", () => {
  it("rejects unknown order products before any transport request", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const broken = sampleScenario() as { orders: { lines: { productId: string; quantity: number }[] }[] };
    broken.orders[0]!.lines.push({ productId: "ghost-sku", quantity: 1 });
    const res = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: broken,
      requestText: "unknown order product must not spend inference",
      mode: "live",
      consent: true,
    });
    expect(res.status).toBe(400);
    expect(res.json["code"]).toBe("INPUT_INVALID");
    expect(JSON.stringify(res.json)).toContain("ORDER_UNKNOWN_PRODUCT");
    expect(fake.requestCount()).toBe(0);
  });

  it("rejects immutable allowlist and lock refs before any transport request", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const cases: { mutate: (s: Record<string, unknown>) => void; code: string }[] = [
      {
        mutate: (s) => {
          ((s["products"] as Record<string, unknown>[])[0] as Record<string, unknown>)["allowedLocationIds"] = ["L-ghost"];
        },
        code: "ALLOWLIST_UNKNOWN_LOCATION",
      },
      {
        mutate: (s) => {
          ((s["locations"] as Record<string, unknown>[])[0] as Record<string, unknown>)["allowedProductIds"] = ["ghost-sku"];
        },
        code: "ALLOWLIST_UNKNOWN_PRODUCT",
      },
      {
        mutate: (s) => {
          ((s["products"] as Record<string, unknown>[])[1] as Record<string, unknown>)["lockedLocationId"] = "L-ghost";
        },
        code: "LOCKED_UNKNOWN_LOCATION",
      },
    ];
    for (const c of cases) {
      const broken = sampleScenario() as unknown as Record<string, unknown>;
      c.mutate(broken);
      const res = await postJson(`${api.apiUrl}/api/runs`, {
        scenario: broken,
        requestText: "immutable broken refs must not spend inference",
        mode: "live",
        consent: true,
      });
      expect(res.status).toBe(400);
      expect(res.json["code"]).toBe("INPUT_INVALID");
      expect(JSON.stringify(res.json)).toContain(c.code);
    }
    expect(fake.requestCount()).toBe(0);
  });

  it("still accepts repairable assignment-invalid baselines", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    // Occupancy collision: invalid baseline, but search-repairable.
    const repairable = sampleScenario() as unknown as Record<string, unknown>;
    repairable["assignments"] = [
      { productId: "sku-a", locationId: "L2" },
      { productId: "sku-b", locationId: "L2" },
      ...((repairable["assignments"] as Record<string, unknown>[]).filter(
        (a) => a["productId"] !== "sku-a" && a["productId"] !== "sku-b",
      )),
    ];
    const res = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: repairable,
      requestText: "repairable baseline",
      mode: "live",
      consent: true,
    });
    expect(res.status).toBe(202);
    await waitFor(api.apiUrl, res.json["runId"] as string, ["AWAITING_APPROVAL"]);
    expect(fake.requestCount()).toBe(1);
  });
});

describe("M5 provider trust boundary", () => {
  it("keeps usage on choices:[null] with a typed PARSE_ERROR", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          {
            kind: "envelope",
            envelopeJson: {
              id: "chatcmpl-null-choice",
              object: "chat.completion",
              created: 1,
              model: FAKE_MODEL,
              choices: [null],
              usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
            },
          },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(attempts[0]?.["parseOk"]).toBe(false);
    expect(attempts[0]?.["usage"]).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });
    expect(attempts[0]?.["diagnostics"]).toEqual({
      responseId: "chatcmpl-null-choice",
      finishReason: null,
      errorCode: "PARSE_ERROR",
    });
  });

  it("redacts echoed key material from diagnostic strings", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          {
            kind: "envelope",
            envelopeJson: {
              id: `echo-${FAKE_KEY}`,
              object: "chat.completion",
              created: 1,
              model: FAKE_MODEL,
              choices: [{ index: 0, message: { role: "assistant", content: null }, finish_reason: `stop-${FAKE_KEY}` }],
              usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            },
          },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(JSON.stringify(approved.json)).not.toContain(FAKE_KEY);
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(JSON.stringify(attempts[0]?.["diagnostics"])).toContain("[REDACTED]");
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    expect(JSON.stringify(report.json)).not.toContain(FAKE_KEY);
  });

  it("flags fractional usage incomplete instead of claiming complete accounting", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          {
            kind: "envelope",
            envelopeJson: {
              id: "chatcmpl-fraction",
              object: "chat.completion",
              created: 1,
              model: FAKE_MODEL,
              choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(proposal(0, [], "retain")) }, finish_reason: "stop" }],
              usage: { prompt_tokens: 10.5, completion_tokens: 5, total_tokens: 15 },
            },
          },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    const runId = created.json["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(attempts[0]?.["usage"]).toEqual({ promptTokens: null, completionTokens: 5, totalTokens: 15 });
    expect(approved.json["usageIncomplete"]).toBe(true);
  });
});

describe("M5 benchmark costs and preflight", () => {
  it("computes the deterministic conservative reservation", () => {
    // (40000 chars x 4 + 2048 slack) input tokens at $0.10/M + 2000 output at $0.20/M.
    expect(conservativeReservationUsd(1, 20000, 2000)).toBeCloseTo(0.0166048, 10);
    expect(conservativeReservationUsd(4, 20000, 2000)).toBeCloseTo(0.0664192, 10);
    expect(conservativeReservationUsd(72, 20000, 2000)).toBeCloseTo(1.1955456, 10);
  });

  it("estimates usage cost separately, never inventing billed usage", () => {
    expect(usageEstimatedUsd(null, true)).toBeNull();
    const full = usageEstimatedUsd({ promptTokens: 1000000, completionTokens: 1000000, totalTokens: 2000000 }, false);
    expect(full?.inputTokens).toBe(1000000);
    expect(full?.outputTokens).toBe(1000000);
    expect(full?.estimatedUsd).toBeCloseTo(0.3, 10);
    expect(full?.partial).toBe(false);
    const partial = usageEstimatedUsd({ promptTokens: 100, completionTokens: null, totalTokens: null }, true);
    expect(partial?.partial).toBe(true);
    expect(partial?.estimatedUsd).toBeCloseTo(0.00001, 10);
  });

  it("refuses live preflight without official model, exact caps, and sufficient authorization", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const fixture = testConfig(fake);
    expect(preflightLive(fixture, 10).ok).toBe(false);
    expect(preflightLive(loadConfig({ ...process.env, META_API_BASE_URL: "https://api.meta.ai/v1", META_MODEL_ID: "muse-spark-1.3", MODEL_API_KEY: "x" }), 10))
      .toEqual({ ok: false, reason: expect.stringContaining("exactly muse-spark-1.3-contributor") });
    expect(preflightLive(loadConfig({ ...process.env, META_API_BASE_URL: "https://api.meta.ai/v1", META_MODEL_ID: "muse-spark-1.3-contributor", MODEL_API_KEY: "" }), 10).ok)
      .toBe(false);
    expect(preflightLive(loadConfig({ ...process.env, META_API_BASE_URL: "https://api.meta.ai/v1", META_MODEL_ID: "muse-spark-1.3-contributor", MODEL_API_KEY: "x", MAX_MODEL_REQUESTS_PER_RUN: "2" }), 10).ok)
      .toBe(false);
    const official = loadConfig({ ...process.env, META_API_BASE_URL: "https://api.meta.ai/v1", META_MODEL_ID: "muse-spark-1.3-contributor", MODEL_API_KEY: "x" });
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "1.2", undefined]) {
      expect(preflightLive(official, bad).ok).toBe(false);
    }
    const poor = preflightLive(official, 0.01);
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.reason).toContain("below the conservative full-run reservation");
    const rich = preflightLive(official, 1.2);
    expect(rich.ok).toBe(true);
    if (rich.ok) expect(rich.reservationUsd).toBeCloseTo(1.1955456, 10);
    expect(fake.requestCount()).toBe(0);
  });
});

describe("M5 live server fingerprint", () => {
  it("exposes exact non-secret settings on /api/status", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const status = await getJson(`${api.apiUrl}/api/status`);
    expect(status.json["generationSettings"]).toEqual({ reasoningEffort: "low", maxCompletionTokens: 2000 });
    expect(status.json["contextCaps"]).toEqual({ maxContextChars: 20000, maxResponseBytes: 65536 });
    expect(status.json["routePolicy"]).toBe("nearest-neighbor-a-star/1");
    expect(status.json["heuristicMaxEvaluations"]).toBe(32);
    expect(JSON.stringify(status.json)).not.toContain(FAKE_KEY);
  });

  it("reads the running fingerprint and rejects non-frozen servers", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const config = testConfig(fake);
    const api = await startApi(config);
    closers.push(api.close);
    const fp = await readServerFingerprint(api.apiUrl, 5000);
    expect(fp.providerKind).toBe("fixture");
    expect(fp.reasoningEffort).toBe("low");
    expect(fp.maxCompletionTokens).toBe(2000);
    // A fixture server is not the frozen live protocol.
    expect(checkServerFingerprint(fp, config).ok).toBe(false);
    const official = loadConfig({ ...process.env, META_API_BASE_URL: "https://api.meta.ai/v1", META_MODEL_ID: "muse-spark-1.3-contributor", MODEL_API_KEY: "x" });
    const liveFp = { ...fp, providerKind: "meta", modelId: "muse-spark-1.3-contributor" };
    expect(checkServerFingerprint(liveFp, official)).toEqual({ ok: true });
    expect(checkServerFingerprint({ ...liveFp, modelId: "muse-spark-1.3" }, official).ok).toBe(false);
    expect(checkServerFingerprint({ ...liveFp, maxRequests: 2 }, official).ok).toBe(false);
    expect(checkServerFingerprint({ ...liveFp, reasoningEffort: "high" }, official).ok).toBe(false);
    expect(checkServerFingerprint({ ...liveFp, maxContextChars: 1000 }, official).ok).toBe(false);
    expect(checkServerFingerprint({ ...liveFp, promptVersion: "other" }, official).ok).toBe(false);
    expect(checkServerFingerprint({ ...liveFp, routePolicy: "other" }, official).ok).toBe(false);
    expect(checkServerFingerprint({ ...liveFp, heuristicMaxEvaluations: 0 }, official).ok).toBe(false);
  });

  it("refuses live runs on dirty source before claiming output, and rechecks frozen hashes", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "m5-live-dirty-"));
    try {
      cpSync(join(rootDir(), "fixtures", "benchmark"), join(tmp, "fixtures", "benchmark"), { recursive: true });
      const official = loadConfig({ ...process.env, META_API_BASE_URL: "https://api.meta.ai/v1", META_MODEL_ID: "muse-spark-1.3-contributor", MODEL_API_KEY: "x" });
      const outDir = join(tmp, "m5-live-out");
      await expect(runLiveBenchmark(tmp, { apiBase: "http://127.0.0.1:9", outDir, authorizeUsd: 1.2, config: official })).rejects.toThrow(
        /uncommitted source/,
      );
      expect(existsSync(outDir)).toBe(false); // refused before any output claim or network touch
      // Frozen hashes verify on the clean manifest and fail on mid-run drift.
      const loaded = loadBenchmark(rootDir());
      expect(() => verifyBenchmarkHashes(rootDir(), loaded.manifest)).not.toThrow();
      writeFileSync(join(tmp, "fixtures", "benchmark", "requirements.json"), "{}");
      expect(() => verifyBenchmarkHashes(tmp, loaded.manifest)).toThrow(/hash changed mid-run/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("M5 trial ambiguity accounting", () => {
  it("journals pending/created/progress and preserves the run ID on dropped responses", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements(), delayMs: 3000 }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    // NOTE: not pushed to closers; the trial drops it deliberately.
    const loaded = loadBenchmark(rootDir());
    const events: string[] = [];
    let dropped = false;
    const trial = await runTrial(
      api.apiUrl,
      loaded.scenarios.get("bm-01-demand-skew") as never,
      loaded.contracts.get("bm-01-demand-skew") as never,
      loaded.requestTexts.get("bm-01-demand-skew") as string,
      {
        trialIndex: 0,
        requestsReserved: 4,
        httpTimeoutMs: 2000,
        callbacks: {
          onPending: (t) => events.push(`pending:${t.requestsReserved}`),
          onCreated: (t) => {
            events.push(`created:${t.runId !== null}`);
            if (!dropped) {
              dropped = true;
              void api.close(); // drop every later response
            }
          },
          onProgress: () => events.push("progress"),
        },
      },
    );
    expect(events[0]).toBe("pending:4");
    expect(events).toContain("created:true");
    expect(trial.runId).toBeTruthy();
    expect(trial.ambiguous).not.toBeNull();
    expect(trial.ambiguous?.reason).toContain("outstanding run");
    expect(trial.reportAvailable).toBe(false);
    expect(trial.comparison).toBeNull();
    expect(trial.requestsReserved).toBe(4);
    // Observed 0 with ambiguity flagged: unknown actuals, never invented 0.
    expect(trial.requestsUsed).toBe(0);
    expect(fake.requestCount()).toBe(1); // create spent one; no paid retry followed
  });

  it("records create-transport ambiguity without inventing a run", async () => {
    const loaded = loadBenchmark(rootDir());
    const trial = await runTrial(
      "http://127.0.0.1:9",
      loaded.scenarios.get("bm-01-demand-skew") as never,
      loaded.contracts.get("bm-01-demand-skew") as never,
      loaded.requestTexts.get("bm-01-demand-skew") as string,
      { requestsReserved: 4, httpTimeoutMs: 1000 },
    );
    expect(trial.runId).toBeNull();
    expect(trial.ambiguous?.reason).toContain("create transport failed");
    expect(trial.requestsReserved).toBe(4);
    expect(trial.reportAvailable).toBe(false);
  });
});

describe("M5 benchmark fixtures and offline mode", () => {
  it("freezes exactly 6 scenarios and rechecks hashes", () => {
    const loaded = loadBenchmark(rootDir());
    expect([...loaded.scenarios.keys()]).toEqual([...BENCHMARK_IDS]);
    expect(loaded.manifest.scenarios).toHaveLength(6);
    for (const entry of loaded.manifest.scenarios) {
      const bytes = readFileSync(join(rootDir(), "fixtures", "benchmark", entry.file));
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    }
    // Tampered copies refuse to load.
    const tmp = mkdtempSync(join(tmpdir(), "m5-bench-"));
    try {
      cpSync(join(rootDir(), "fixtures", "benchmark"), join(tmp, "fixtures", "benchmark"), { recursive: true });
      writeFileSync(join(tmp, "fixtures", "benchmark", "bm-01-demand-skew.json"), "{}");
      expect(() => loadBenchmark(tmp)).toThrow(/hash mismatch/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("offline mode reports baseline+heuristic with zero model calls", () => {
    const report = buildOfflineBenchmark(rootDir());
    expect(report.mode).toBe("offline");
    expect(report.providerKind).toBe("fixture");
    expect(report.realMetaRequests).toBe(0);
    expect(report.totals).toMatchObject({ scenarios: 6, trialsPlanned: 0, trialsRun: 0, modelRequests: 0, realMetaRequests: 0 });
    expect(report.costs.reservationUsd).toBe(0);
    expect(report.costs.invoiceUsd).toBeNull();
    const rows = new Map(report.scenarios.map((s) => [s.scenarioId, s.offline]));
    expect(rows.get("bm-01-demand-skew")?.baseline.weightedTravelMm).toBe(78000);
    expect(rows.get("bm-06-unreachable-repair")?.baseline.weightedTravelMm).toBeNull();
    expect(rows.get("bm-06-unreachable-repair")?.baseline.improvementPercent).toBeNull();
    const replayed = replayBenchmarkReport(report, rootDir());
    expect(replayed.mismatches).toEqual([]);
    expect(replayed.matchesSaved).toBe(true);
  });

  it("offline report records the execution commit, not the fixture-authoring base", () => {
    const report = buildOfflineBenchmark(rootDir());
    // Independent oracle: current HEAD read directly, not via the helper
    // under test. The embedded manifest keeps the fixture-authoring base.
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir(), encoding: "utf8" }).trim();
    expect(report.freeze.sourceCommit).toBe(head);
    expect(report.freeze.manifest.sourceCommit).toBe(loadBenchmark(rootDir()).manifest.sourceCommit);
  });
});

describe("M5 fixture benchmark", () => {
  it("runs the complete 6x3=18-trial orchestration with honest counts", async () => {
    const report = await runFixtureBenchmark(rootDir());
    expect(report.mode).toBe("fixture");
    expect(report.providerKind).toBe("fixture");
    expect(report.totals).toMatchObject({
      scenarios: 6,
      trialsPlanned: 18,
      trialsRun: 18,
      trialsNotRun: 0,
      modelRequests: 72,
      realMetaRequests: 0,
      failures: 0,
      reportsAvailable: 18,
      reportsMissing: 0,
    });
    expect(report.freeze.modelId).toBe("fixture-muse-shape");
    for (const s of report.scenarios) {
      expect(s.trials).toHaveLength(3);
      for (const t of s.trials) {
        expect(t.runId).toBeTruthy();
        expect(t.reportAvailable).toBe(true);
        expect(t.requestsUsed).toBe(4);
        expect(t.proposalsUsed).toBe(3);
        expect(t.realMetaRequests).toBe(0);
        expect(t.normalization).toContain("Predetermined benchmark contract");
        expect(t.comparison).not.toBeNull();
        expect(t.comparison?.baseline).toBeDefined();
      }
    }
    // bm-06 invalid baseline keeps improvement N/A in every trial.
    const bm06 = report.scenarios.find((s) => s.scenarioId === "bm-06-unreachable-repair");
    for (const t of bm06?.trials ?? []) {
      expect(t.comparison?.baseline.improvementPercent).toBeNull();
      expect(t.comparison?.baseline.valid).toBe(false);
    }
    const replayed = replayBenchmarkReport(report, rootDir());
    expect(replayed.mismatches).toEqual([]);
    expect(replayed.matchesSaved).toBe(true);
  }, 120000);

  it("replay rejects mutated pairing and coverage even when reports self-replay", async () => {
    const report = await runFixtureBenchmark(rootDir());
    const fresh = () => JSON.parse(JSON.stringify(report)) as typeof report;
    expect(replayBenchmarkReport(report, rootDir()).matchesSaved).toBe(true);
    // Mutated provenance still self-replays (provenance is not measured) but
    // fails frozen pairing.
    const mutated = fresh();
    const embedded = mutated.scenarios[0]!.trials[0]!.report;
    if (!embedded) throw new Error("fixture trial report missing");
    embedded.scenario.provenance.description += " (mutated)";
    const mutatedReplay = replayBenchmarkReport(mutated, rootDir());
    expect(mutatedReplay.matchesSaved).toBe(false);
    expect(mutatedReplay.mismatches).toContain("bm-01-demand-skew.trial-0.pairing-scenario");
    expect(mutatedReplay.mismatches.filter((m) => m.includes(".measurements:")).length).toBe(0);
    // Swapped requirements fail pairing.
    const swapped = fresh();
    const swappedReport = swapped.scenarios[0]!.trials[0]!.report;
    if (!swappedReport) throw new Error("fixture trial report missing");
    swappedReport.requirements = JSON.parse(JSON.stringify(swapped.scenarios[2]!.trials[0]!.report?.requirements));
    expect(replayBenchmarkReport(swapped, rootDir()).mismatches).toContain("bm-01-demand-skew.trial-0.pairing-requirements");
    // Detached run ID fails pairing.
    const detached = fresh();
    detached.scenarios[0]!.trials[0]!.runId = "run-detached";
    expect(replayBenchmarkReport(detached, rootDir()).mismatches).toContain("bm-01-demand-skew.trial-0.pairing-run-id");
    // Duplicated scenario fails coverage.
    const duped = fresh();
    duped.scenarios[1] = JSON.parse(JSON.stringify(duped.scenarios[0]));
    const dupedReplay = replayBenchmarkReport(duped, rootDir());
    expect(dupedReplay.mismatches).toContain("coverage.duplicate-bm-01-demand-skew");
    expect(dupedReplay.mismatches).toContain("coverage.missing-bm-02-copick-cluster");
    // Dropped trial fails slot coverage.
    const dropped = fresh();
    dropped.scenarios[0]!.trials.pop();
    expect(replayBenchmarkReport(dropped, rootDir()).mismatches).toContain("bm-01-demand-skew.trial-slots");
    // Over-cap counts fail even when internally consistent.
    const over = fresh();
    over.scenarios[0]!.trials[0]!.requestsUsed = 999;
    over.totals.modelRequests = 999 + 17 * 4;
    expect(replayBenchmarkReport(over, rootDir()).mismatches).toContain("caps.modelRequests");
    // A not-run record claiming a run ID fails shape.
    const lying = fresh();
    const lyingTrial = lying.scenarios[0]!.trials[0]!;
    lyingTrial.notRun = { reason: "x" };
    expect(replayBenchmarkReport(lying, rootDir()).mismatches).toContain("bm-01-demand-skew.trial-0.not-run-shape");
  }, 120000);

  it("persists failed trials with report unavailable instead of losing them", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "error", status: 500, body: "fixture interpret failure" }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const loaded = loadBenchmark(rootDir());
    const scenario = loaded.scenarios.get("bm-01-demand-skew");
    const contract = loaded.contracts.get("bm-01-demand-skew");
    const requestText = loaded.requestTexts.get("bm-01-demand-skew");
    if (!scenario || !contract || !requestText) throw new Error("benchmark fixture missing");
    const trial = await runTrial(api.apiUrl, scenario, contract, requestText);
    expect(trial.runId).toBeTruthy();
    expect(trial.reportAvailable).toBe(false);
    expect(trial.comparison).toBeNull();
    expect(trial.failureRecord?.envelopeVersion).toBe("layoutlab.m5failure/1");
    expect(trial.failure?.state).toBe("FAILED");
    expect(replayFailureRecord(trial.failureRecord).evaluated).toBe(false);
  });
});
