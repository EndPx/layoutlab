// v3-M7/M8: bounded patch validation, controlled experiments, Meta patch
// proposals (local fake transport only; no paid inference), and the durable
// public budget guard (reserve/commit/release, fail-closed corruption).
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBudgetGuard, initializeBudgetLedger } from "../src/budget-guard.js";
import { loadConfig, type ApiConfig } from "../src/config.js";
import { normalizeOperationsProviderPatch, OPERATIONS_PATCH_JSON_SCHEMA } from "../src/operations-api.js";
import { createApp } from "../src/server.js";
import {
  inspectingOperationsHandler,
  operationsPatchSchemaError,
  scriptHandler,
  startFakeMeta,
  type FakeMeta,
} from "./fake-meta.js";

const FAKE_KEY = "fixture-only-key-not-a-secret";
const FAKE_MODEL = "fixture-muse-shape";
const ALL_NULL_PATCH = {
  extraPickers: null,
  extraPutaway: null,
  packingDurationMs: null,
  dispatchDurationMs: null,
  receivingDurationMs: null,
};

function fakeConfig(fake: FakeMeta): ApiConfig {
  return loadConfig({
    MODEL_API_KEY: FAKE_KEY,
    META_API_BASE_URL: fake.baseUrl,
    META_MODEL_ID: FAKE_MODEL,
    BUDGET_STATE_FILE: "",
    PUBLIC_BUDGET_USD: "1",
    PUBLIC_BUDGET_PER_RUN_USD: "0.25",
  });
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!().catch(() => {});
});

async function startApi(config: ApiConfig, budgetGuard?: ReturnType<typeof createBudgetGuard>) {
  const { app } = createApp({ config, ...(budgetGuard ? { budgetGuard } : {}) });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${port}`;
}

function noKeyConfig(): ApiConfig {
  return loadConfig({ ...process.env, MODEL_API_KEY: "", META_API_BASE_URL: "https://api.meta.ai/v1" });
}

async function post(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function burstBody() {
  const scenario = JSON.parse(
    readFileSync(new URL("../../../fixtures/operations/picking-packing-burst.json", import.meta.url), "utf8"),
  ) as unknown;
  const runconfig = JSON.parse(
    readFileSync(new URL("../../../fixtures/operations/picking-packing-burst.runconfig.json", import.meta.url), "utf8"),
  ) as { executionConfig: unknown };
  return { scenario, executionConfig: runconfig.executionConfig };
}

describe("operations patch validation and experiments", () => {
  it("validates bounded patches and rejects unknown knobs", async () => {
    const apiUrl = await startApi(noKeyConfig());
    const ok = await post(`${apiUrl}/api/operations/patches/validate`, { patch: { extraPickers: 1 } });
    expect(ok.status).toBe(200);
    expect(ok.json["valid"]).toBe(true);
    const bad = await post(`${apiUrl}/api/operations/patches/validate`, { patch: { teleport: true } });
    expect(bad.status).toBe(400);
  });

  it("runs a controlled experiment with deterministic ranking", { timeout: 60000 }, async () => {
    const apiUrl = await startApi(noKeyConfig());
    const { scenario, executionConfig } = burstBody();
    const res = await post(`${apiUrl}/api/operations/experiments`, {
      scenario,
      executionConfig,
      interventionPolicy: { allowedFields: ["dispatchDurationMs"] },
      candidates: [{ candidateId: "fast-dispatch", patch: { dispatchDurationMs: 1000 } }],
    });
    expect(res.status).toBe(200);
    expect(res.json["schema"]).toBe("layoutlab.operations-experiment/2");
    expect(res.json["rankedCandidateIds"]).toEqual(["fast-dispatch", "baseline"]);
    expect(res.json["selectedCandidateId"]).toBe("fast-dispatch");
    // Complete report, not a stripped summary: common inputs, policy and a
    // full run report per valid candidate are all present for download.
    expect((res.json["commonInputs"] as Record<string, unknown>)["scenario"]).toBeTruthy();
    expect(res.json["interventionPolicy"]).toEqual({ allowedFields: ["dispatchDurationMs"] });
    const candidates = res.json["candidates"] as { candidateId: string; report: unknown }[];
    expect(candidates.find((c) => c.candidateId === "baseline")?.report).toBeTruthy();
  });

  it("retains a denied-staffing candidate instead of failing the comparison", { timeout: 60000 }, async () => {
    const apiUrl = await startApi(noKeyConfig());
    const { scenario, executionConfig } = burstBody();
    const res = await post(`${apiUrl}/api/operations/experiments`, {
      scenario,
      executionConfig,
      candidates: [{ candidateId: "more-pickers", patch: { extraPickers: 1 } }],
    });
    expect(res.status).toBe(200);
    const candidates = res.json["candidates"] as { candidateId: string; status: string; reason: string }[];
    const denied = candidates.find((c) => c.candidateId === "more-pickers");
    expect(denied?.status).toBe("invalid");
    expect(denied?.reason).toContain("staffing is not allowed");
    expect(res.json["rankedCandidateIds"]).toEqual(["baseline"]);
    const badPolicy = await post(`${apiUrl}/api/operations/experiments`, {
      scenario,
      executionConfig,
      interventionPolicy: { allowedFields: ["teleport"] },
      candidates: [],
    });
    expect(badPolicy.status).toBe(400);
  });

  it("proposals refuse honestly without a server key", async () => {
    const apiUrl = await startApi(noKeyConfig());
    const res = await post(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" });
    expect(res.status).toBe(503);
  });
});

describe("public budget guard", () => {
  it("reserves, commits, releases, and refuses overspend durably", () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-budget-"));
    const file = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    guard.reserve("r1", 0.25);
    expect(guard.snapshot().availableMicroUsd).toBe(750_000);
    guard.commit("r1");
    guard.reserve("r2", 0.25);
    guard.release("r2");
    expect(guard.snapshot().committedMicroUsd).toBe(250_000);
    expect(() => guard.reserve("r3", 0.9)).toThrow(/exceeds/);
    // Durable across instances: a fresh guard sees the same ledger.
    const reopened = createBudgetGuard({ filePath: file, capUsd: 1 });
    expect(reopened.snapshot().committedMicroUsd).toBe(250_000);
  });

  it("fails closed on corrupt state", () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-budget-"));
    const file = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    guard.reserve("r1", 0.1);
    writeFileSync(file, "{not json", "utf8");
    expect(() => guard.snapshot()).toThrow(/refusing to spend/);
    expect(() => guard.reserve("r2", 0.1)).toThrow(/refusing to spend/);
  });
});

describe("operations Meta structured-output contract (fixture transport, not live Meta)", () => {
  it("schema requires every property as integer-or-null with correct bounds", () => {
    expect(OPERATIONS_PATCH_JSON_SCHEMA.additionalProperties).toBe(false);
    const propKeys = Object.keys(OPERATIONS_PATCH_JSON_SCHEMA.properties).sort();
    expect([...OPERATIONS_PATCH_JSON_SCHEMA.required].sort()).toEqual(propKeys);
    expect(OPERATIONS_PATCH_JSON_SCHEMA.properties.extraPickers).toEqual({ type: ["integer", "null"], minimum: 0, maximum: 2 });
    expect(OPERATIONS_PATCH_JSON_SCHEMA.properties.packingDurationMs).toEqual({ type: ["integer", "null"], minimum: 1000, maximum: 300000 });
    expect(normalizeOperationsProviderPatch(ALL_NULL_PATCH)).toEqual({});
    expect(normalizeOperationsProviderPatch({ ...ALL_NULL_PATCH, extraPickers: 0 })).toEqual({ extraPickers: 0 });
    expect(() => normalizeOperationsProviderPatch({ extraPickers: 1 })).toThrow(/missing/);
    expect(() => normalizeOperationsProviderPatch({ ...ALL_NULL_PATCH, teleport: true })).toThrow(/unknown/);
    expect(() => normalizeOperationsProviderPatch({ ...ALL_NULL_PATCH, extraPickers: 1.5 })).toThrow(/integer/);
    expect(() => normalizeOperationsProviderPatch({ ...ALL_NULL_PATCH, extraPickers: 9 })).toThrow(/integer/);
    expect(() => normalizeOperationsProviderPatch({ ...ALL_NULL_PATCH, packingDurationMs: 5 })).toThrow(/integer/);
  });

  it("reproduces the real HTTP400 offline from the pre-fix schema shape", async () => {
    const oldBody = {
      model: FAKE_MODEL,
      messages: [],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "operations_patch",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              extraPickers: { type: "integer", minimum: 0, maximum: 2 },
              extraPutaway: { type: "integer", minimum: 0, maximum: 2 },
              packingDurationMs: { type: "integer", minimum: 1000, maximum: 300000 },
              dispatchDurationMs: { type: "integer", minimum: 1000, maximum: 300000 },
              receivingDurationMs: { type: "integer", minimum: 1000, maximum: 300000 },
            },
          },
        },
      },
    };
    expect(operationsPatchSchemaError(oldBody)).toContain("Missing 'dispatchDurationMs'");
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(inspectingOperationsHandler([{ kind: "ok", contentJson: ALL_NULL_PATCH }], FAKE_MODEL));
    const res = await fetch(`${fake.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${FAKE_KEY}` },
      body: JSON.stringify(oldBody),
    });
    expect(res.status).toBe(400);
    const envelope = (await res.json()) as { error: { message: string; param: string; type: string } };
    expect(envelope.error.param).toBe("schema");
    expect(envelope.error.type).toBe("invalid_request_error");
    expect(envelope.error.message).toContain("Missing 'dispatchDurationMs'");
  });

  it("inspects the posted schema and returns fixture metadata for unchanged, zero, and valid changes", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(inspectingOperationsHandler([
      { kind: "ok", contentJson: ALL_NULL_PATCH },
      { kind: "ok", contentJson: { ...ALL_NULL_PATCH, extraPickers: 0, extraPutaway: 0 } },
      { kind: "ok", contentJson: { ...ALL_NULL_PATCH, packingDurationMs: 10000 } },
    ], FAKE_MODEL));
    const apiUrl = await startApi(fakeConfig(fake));

    const unchanged = await post(`${apiUrl}/api/operations/proposals`, { observation: "keep staffing unchanged" });
    expect(unchanged.status).toBe(200);
    expect(unchanged.json["patch"]).toEqual({});
    expect(unchanged.json["provider"]).toBe("meta");
    expect(unchanged.json["providerKind"]).toBe("fixture");
    expect(unchanged.json["model"]).toBe(FAKE_MODEL);
    expect(unchanged.json["responseId"]).toBe("chatcmpl-fixture");
    expect(unchanged.json["finishReason"]).toBe("stop");
    expect(typeof unchanged.json["durationMs"]).toBe("number");
    expect(unchanged.json["usage"]).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });

    const zero = await post(`${apiUrl}/api/operations/proposals`, { observation: "explicit zero staffing" });
    expect(zero.status).toBe(200);
    expect(zero.json["patch"]).toEqual({ extraPickers: 0, extraPutaway: 0 });

    const changed = await post(`${apiUrl}/api/operations/proposals`, { observation: "try packing 10000" });
    expect(changed.status).toBe(200);
    expect(changed.json["patch"]).toEqual({ packingDurationMs: 10000 });
    expect(fake.requestCount()).toBe(3);

    const captured = fake.requests[0]?.bodyJson as Record<string, unknown>;
    const format = captured["response_format"] as Record<string, unknown>;
    const jsonSchema = format["json_schema"] as Record<string, unknown>;
    expect(jsonSchema["strict"]).toBe(true);
    const schema = jsonSchema["schema"] as Record<string, unknown>;
    expect(schema["additionalProperties"]).toBe(false);
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;
    expect([...(schema["required"] as string[])].sort()).toEqual(Object.keys(properties).sort());
    for (const key of Object.keys(properties)) {
      expect([...(properties[key]?.["type"] as string[])].sort()).toEqual(["integer", "null"]);
    }
    expect(properties["extraPickers"]).toMatchObject({ minimum: 0, maximum: 2 });
    expect(properties["dispatchDurationMs"]).toMatchObject({ minimum: 1000, maximum: 300000 });
    const messages = captured["messages"] as { role: string; content: string }[];
    expect(messages[0]?.content).toContain("null");
    expect(messages[0]?.content).toContain("ALL five keys");
  });

  it("rejects unknown, missing, fractional, and out-of-bounds provider output", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(inspectingOperationsHandler([
      { kind: "ok", contentJson: { ...ALL_NULL_PATCH, teleport: true } },
      { kind: "ok", contentJson: { extraPickers: 1, extraPutaway: null, packingDurationMs: null, receivingDurationMs: null } },
      { kind: "ok", contentJson: { ...ALL_NULL_PATCH, extraPickers: 1.5 } },
      { kind: "ok", contentJson: { ...ALL_NULL_PATCH, extraPickers: 9 } },
      { kind: "ok", contentJson: { ...ALL_NULL_PATCH, packingDurationMs: 5 } },
    ], FAKE_MODEL));
    const apiUrl = await startApi(fakeConfig(fake));
    for (let i = 0; i < 5; i++) {
      const res = await post(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" });
      expect(res.status).toBe(422);
      expect(res.json["code"]).toBe("INVALID_PATCH");
    }
    expect(fake.requestCount()).toBe(5);
  });

  it("surfaces the known HTTP400 envelope as a sanitized transport error", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const body = JSON.stringify({
      error: {
        code: null,
        message: "'required' is required to be supplied and to be an array including every key in properties. Missing 'dispatchDurationMs'.",
        param: "schema",
        type: "invalid_request_error",
      },
    });
    fake.setHandler(scriptHandler([{ kind: "error", status: 400, body }], FAKE_MODEL));
    const apiUrl = await startApi(fakeConfig(fake));
    const res = await post(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" });
    expect(res.status).toBe(400);
    expect(res.json["code"]).toBe("TRANSPORT_ERROR");
    expect(String(res.json["message"])).toContain("Missing 'dispatchDurationMs'");
    expect(JSON.stringify(res.json)).not.toContain(FAKE_KEY);
    expect(fake.requestCount()).toBe(1);
  });
});

describe("budget endpoint", () => {
  it("reports not_configured without a state file", async () => {
    const apiUrl = await startApi(noKeyConfig());
    const res = await fetch(`${apiUrl}/api/budget`);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["guard"]).toBe("not_configured");
  });
});
