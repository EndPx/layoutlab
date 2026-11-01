// M3 API tests over a LOCAL fake Meta HTTP transport. These verify real
// request serialization and response parsing against the Meta-compatible
// shape, but they are NOT live Meta: providerKind "fixture",
// realMetaRequests 0. No paid inference is performed here.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, loadEnvFileInto, type ApiConfig } from "../src/config.js";
import { createApp } from "../src/server.js";
import { scriptHandler, startFakeMeta, type FakeMeta, type ScriptEntry } from "./fake-meta.js";

const FAKE_KEY = "fixture-only-key-not-a-secret";
const FAKE_MODEL = "fixture-muse-shape";

function sampleScenario(): unknown {
  const url = new URL("../../../fixtures/sample/warehouse-basic.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

function draftRequirements(maxRelocated = 4, unresolved: string[] = []): unknown {
  return {
    objective: "minimize_weighted_picking_travel",
    maxRelocatedProducts: maxRelocated,
    lockedProductIds: [],
    assumptions: ["fixture assumption"],
    unresolvedQuestions: unresolved,
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

type Servers = { apiUrl: string; close: () => Promise<void> };

async function startApi(config: ApiConfig): Promise<Servers> {
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

async function postJson(url: string, body: unknown, init?: RequestInit): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
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

async function createLive(apiUrl: string, requestText = "reduce travel"): Promise<Record<string, unknown>> {
  const created = await postJson(`${apiUrl}/api/runs`, {
    scenario: sampleScenario(),
    requestText,
    mode: "live",
    consent: true,
  });
  expect(created.status).toBe(202);
  expect(created.json["state"]).toBe("INTERPRETING");
  return created.json;
}

async function waitFor(apiUrl: string, runId: string, want: string[], timeoutMs = 15000): Promise<Record<string, unknown>> {
  const started = Date.now();
  let last: Record<string, unknown> = {};
  for (;;) {
    const r = await getJson(`${apiUrl}/api/runs/${runId}`);
    last = r.json;
    if (want.includes(last["state"] as string)) return last;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for ${want.join("/")} (state ${(last["state"] as string) ?? "?"}).`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("M3 config", () => {
  it("clamps env overrides to brief caps", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const config = testConfig(fake, {
      MAX_PROPOSALS_PER_RUN: "99",
      MAX_MODEL_REQUESTS_PER_RUN: "99",
      RUN_TIMEOUT_MS: "999999",
    });
    expect(config.maxProposals).toBe(3);
    expect(config.maxRequests).toBe(4);
    expect(config.timeoutMs).toBe(120000);
  });

  it("allows lower (stricter) env values", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const config = testConfig(fake, {
      MAX_PROPOSALS_PER_RUN: "1",
      MAX_MODEL_REQUESTS_PER_RUN: "2",
      RUN_TIMEOUT_MS: "5000",
    });
    expect(config.maxProposals).toBe(1);
    expect(config.maxRequests).toBe(2);
    expect(config.timeoutMs).toBe(5000);
  });

  it("classifies official, loopback, and unsupported base URLs", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    expect(testConfig(fake).providerKind).toBe("fixture");
    const meta = loadConfig({
      ...process.env,
      META_API_BASE_URL: "https://api.meta.ai/v1",
      META_MODEL_ID: "muse-spark-1.3",
      MODEL_API_KEY: FAKE_KEY,
    });
    expect(meta.providerKind).toBe("meta");
    for (const base of ["https://invalid.example/v1", "http://api.meta.ai/v1", "https://api.meta.ai/v2", "::::"]) {
      const config = loadConfig({
        ...process.env,
        META_API_BASE_URL: base,
        META_MODEL_ID: "muse-spark-1.3",
        MODEL_API_KEY: FAKE_KEY,
      });
      expect(config.providerKind).toBe("unsupported");
    }
  });

  it("loads .env files without overriding explicit env", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "m3-env-"));
    try {
      writeFileSync(
        join(dir, ".env"),
        '# comment\nMETA_MODEL_ID="quoted-model"\nMODEL_API_KEY=file-key\nEMPTY=\nBAD LINE\n',
        "utf8",
      );
      const target: NodeJS.ProcessEnv = { MODEL_API_KEY: "explicit-key" };
      loadEnvFileInto(target, join(dir, ".env"));
      expect(target["META_MODEL_ID"]).toBe("quoted-model");
      expect(target["MODEL_API_KEY"]).toBe("explicit-key");
      expect(target["EMPTY"]).toBe("");
      expect(target["BAD"]).toBeUndefined();
      loadEnvFileInto(target, join(dir, "missing.env"));
      expect(target["META_MODEL_ID"]).toBe("quoted-model");
      // An explicit empty override is preserved, never filled from the file.
      const cleared: NodeJS.ProcessEnv = { MODEL_API_KEY: "" };
      loadEnvFileInto(cleared, join(dir, ".env"));
      expect(cleared["MODEL_API_KEY"]).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("M3 status and gating", () => {
  it("missing key returns setup status and attempts zero transport requests", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const config = loadConfig({
      ...process.env,
      META_API_BASE_URL: fake.baseUrl,
      META_MODEL_ID: FAKE_MODEL,
      MODEL_API_KEY: "",
    });
    const api = await startApi(config);
    closers.push(api.close);
    const status = await getJson(`${api.apiUrl}/api/status`);
    expect(status.json["liveAvailable"]).toBe(false);
    expect(status.json["status"]).toBe("setup_required");
    expect(status.json["providerKind"]).toBe("fixture");
    expect(JSON.stringify(status.json)).not.toContain(FAKE_KEY);
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    expect(created.status).toBe(503);
    expect(created.json["status"]).toBe("setup_required");
    expect(fake.requestCount()).toBe(0);
  });

  it("refuses inference for unsupported base URLs without false Meta claims", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const config = loadConfig({
      ...process.env,
      META_API_BASE_URL: "https://invalid.example/v1",
      META_MODEL_ID: FAKE_MODEL,
      MODEL_API_KEY: FAKE_KEY,
    });
    const api = await startApi(config);
    closers.push(api.close);
    const status = await getJson(`${api.apiUrl}/api/status`);
    expect(status.json["providerKind"]).toBe("unsupported");
    expect(status.json["liveAvailable"]).toBe(false);
    expect(status.json["status"]).toBe("setup_required");
    const created = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "reduce travel",
      mode: "live",
      consent: true,
    });
    expect(created.status).toBe(503);
    expect(created.json["status"]).toBe("setup_required");
    expect(fake.requestCount()).toBe(0);
  });

  it("requires live mode and explicit consent without inference", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    for (const body of [
      { scenario: sampleScenario(), requestText: "x", mode: "live" },
      { scenario: sampleScenario(), requestText: "x", mode: "live", consent: false },
      { scenario: sampleScenario(), requestText: "x", mode: "stub", consent: true },
    ]) {
      const r = await postJson(`${api.apiUrl}/api/runs`, body);
      expect(r.status).toBe(400);
    }
    expect(fake.requestCount()).toBe(0);
  });

  it("rejects oversized bodies and unknown runs", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const big = await postJson(`${api.apiUrl}/api/runs`, { scenario: { pad: "x".repeat(1_200_000) } });
    expect(big.status).toBe(413);
    const unknown = await getJson(`${api.apiUrl}/api/runs/does-not-exist`);
    expect(unknown.status).toBe(404);
    expect(fake.requestCount()).toBe(0);
  });

  it("bounds inference starts but keeps reads and cancel available", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const api = await startApi(testConfig(fake, { API_RATE_MAX: "3", API_RATE_WINDOW_MS: "60000", API_CONCURRENCY: "10" }));
    closers.push(api.close);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await postJson(`${api.apiUrl}/api/runs`, {
        scenario: sampleScenario(),
        requestText: `run ${i}`,
        mode: "live",
        consent: true,
      });
      expect(r.status).toBe(202);
      ids.push(r.json["runId"] as string);
    }
    const limited = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "over budget",
      mode: "live",
      consent: true,
    });
    expect(limited.status).toBe(429);
    expect(limited.json["code"]).toBe("RATE_LIMIT");
    // Reads and cancellation stay available after the inference budget is spent.
    for (let i = 0; i < 10; i++) {
      const s = await getJson(`${api.apiUrl}/api/status`);
      expect(s.status).toBe(200);
    }
    const cancel = await postJson(`${api.apiUrl}/api/runs/${ids[0]}/cancel`, {});
    expect(cancel.status).toBe(200);
    expect(cancel.json["state"]).toBe("CANCELLED");
  });
});

describe("M3 full run over fixture transport", () => {
  const fullScript: ScriptEntry[] = [
    { kind: "ok", contentJson: draftRequirements() },
    { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "move sku-b near packing") },
    { kind: "ok", contentJson: proposal(0, [{ productId: "sku-c", locationId: "L6" }], "try sku-c") },
    { kind: "ok", contentJson: proposal(0, [{ productId: "sku-d", locationId: "L6" }], "try sku-d") },
  ];

  it("interpretation + approval + 3 proposals consume exactly 4 network requests", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler(fullScript, FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);

    const created = await createLive(api.apiUrl, "Reduce picking travel, relocate at most 4.");
    expect(created["modelRequestsUsed"]).toBe(0);
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    expect(awaiting["modelRequestsUsed"]).toBe(1);
    expect(awaiting["proposalsUsed"]).toBe(0);
    expect(awaiting["phase"]).toBe("AWAITING_APPROVAL");
    expect(awaiting["providerKind"]).toBe("fixture");
    expect(awaiting["realMetaRequests"]).toBe(0);
    expect(fake.requestCount()).toBe(1);

    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.status).toBe(200);
    expect(approved.json["state"]).toBe("COMPLETED");
    // Same run ID, request count, and deadline continue across approval.
    expect(approved.json["runId"]).toBe(runId);
    expect(approved.json["modelRequestsUsed"]).toBe(4);
    expect(approved.json["proposalsUsed"]).toBe(3);
    expect(approved.json["createdAt"]).toBe(created["createdAt"]);
    expect(approved.json["expiresAt"]).toBe(created["expiresAt"]);
    expect(fake.requestCount()).toBe(4);

    // Budgets are never reset when continuing after approval.
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(attempts).toHaveLength(3);
    expect(attempts.map((a) => a["requestIndex"])).toEqual([2, 3, 4]);
  });

  it("serializes real Meta Chat Completions requests (developer role, json_schema, token bound, no tools)", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler(fullScript, FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(fake.requestCount()).toBe(4);
    const [interpret, ...proposals] = fake.requests;
    for (const r of fake.requests) {
      expect(r.method).toBe("POST");
      expect(r.path.endsWith("/chat/completions")).toBe(true);
      expect(r.authorizationPresent).toBe(true);
      expect(r.authorizationScheme).toBe("Bearer");
      const body = r.bodyJson;
      expect(body["model"]).toBe(FAKE_MODEL);
      expect(body["stream"]).toBe(false);
      const messages = body["messages"] as { role: string; content: string }[];
      expect(messages[0]?.role).toBe("developer");
      expect(messages[1]?.role).toBe("user");
      const format = body["response_format"] as Record<string, unknown>;
      expect(format["type"]).toBe("json_schema");
      const schema = format["json_schema"] as Record<string, unknown>;
      expect(typeof schema["name"]).toBe("string");
      expect(typeof schema["schema"]).toBe("object");
      expect(typeof body["max_completion_tokens"]).toBe("number");
      expect("max_output_tokens" in body).toBe(false);
      expect("tools" in body).toBe(false);
      expect("tool_choice" in body).toBe(false);
    }
    const interpretSchema = (
      (interpret?.bodyJson["response_format"] as Record<string, unknown>)["json_schema"] as Record<string, unknown>
    )["name"];
    expect(interpretSchema).toBe("planning_requirements");
    for (const p of proposals) {
      const name = ((p.bodyJson["response_format"] as Record<string, unknown>)["json_schema"] as Record<string, unknown>)["name"];
      expect(name).toBe("assignment_proposal");
    }
    // Geometry/order data travel one way (prompt in); nothing in the response
    // path can override them because only strict requirements/proposal parse.
    expect(JSON.stringify(interpret?.bodyJson)).toContain("warehouse-basic");
  });

  it("bad structured output consumes budget and later proposals still run", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "raw", content: "{ this is not a proposal" },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "valid retry") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    expect(approved.json["modelRequestsUsed"]).toBe(4);
    expect(approved.json["proposalsUsed"]).toBe(3);
    expect(fake.requestCount()).toBe(4);
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(attempts[0]?.["parseOk"]).toBe(false);
    expect(attempts[1]?.["parseOk"]).toBe(true);
    // The failed parse is retained and cannot displace the later valid result.
    // M4: the 29800-mm heuristic (same evaluator) honestly beats proposal-2.
    expect(approved.json["bestName"]).toBe("heuristic");
  });

  it("rejects oversized responses by byte count, not character count", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    // 70k ASCII chars (>64KB) and 40k 2-byte chars (80KB, only 40k chars).
    const asciiHuge = "x".repeat(70000);
    const multiHuge = "é".repeat(40000);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "raw", content: asciiHuge },
          { kind: "raw", content: multiHuge },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "valid") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    expect(fake.requestCount()).toBe(4);
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(attempts[0]?.["parseOk"]).toBe(false);
    expect(JSON.stringify(attempts[0]?.["parseError"])).toContain("byte bound");
    expect(attempts[1]?.["parseOk"]).toBe(false);
    expect(JSON.stringify(attempts[1]?.["parseError"])).toContain("byte bound");
    // M4: the 29800-mm heuristic honestly beats the valid model retry.
    expect(approved.json["bestName"]).toBe("heuristic");
  });

  it("delivers delayed responses to healthy clients", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "slow but healthy"), delayMs: 600 },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect((attempts[0]?.["candidate"] as Record<string, unknown>)["valid"]).toBe(true);
    expect(fake.requestCount()).toBe(4);
  });

  it("sends structured evaluator feedback to later proposals", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "zzz-feedback-marker", locationId: "L6" }], "bad refs") },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "fixed") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(fake.requestCount()).toBe(4);
    const secondProposal = fake.requests[2]?.bodyJson;
    const messages = secondProposal?.["messages"] as { role: string; content: string }[];
    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("zzz-feedback-marker");
    expect(userContent).toContain("PROPOSAL_UNKNOWN_PRODUCT");
  });

  it("keeps the baseline immutable and reapplies every proposal to it", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler(fullScript, FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const before = sampleScenario() as { assignments: { productId: string; locationId: string }[] };
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    const baseline = approved.json["baseline"] as { assignment: { productId: string; locationId: string }[] };
    expect(baseline.assignment).toEqual(before.assignments);
    const attempts = approved.json["attempts"] as {
      candidate: { assignment: { productId: string; locationId: string }[] } | null;
    }[];
    const baseOf = new Map(before.assignments.map((a) => [a.productId, a.locationId]));
    // Proposal 2 moves only sku-c; sku-b stays at its ORIGINAL baseline slot
    // (no accumulation from proposal 1).
    const p2 = new Map((attempts[1]?.candidate?.assignment ?? []).map((a) => [a.productId, a.locationId]));
    expect(p2.get("sku-c")).toBe("L6");
    expect(p2.get("sku-b")).toBe(baseOf.get("sku-b"));
  });

  it("rejects unknown/stale refs and never lets invalid displace valid", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "good: 35600") },
          { kind: "ok", contentJson: proposal(0, [{ productId: "ghost-sku", locationId: "L6" }], "unknown product") },
          { kind: "ok", contentJson: proposal(999, [{ productId: "sku-d", locationId: "L6" }], "stale revision") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect((attempts[0]?.["candidate"] as Record<string, unknown>)["valid"]).toBe(true);
    expect(attempts[1]?.["applyOk"]).toBe(false);
    expect(JSON.stringify(attempts[1]?.["applyErrors"])).toContain("PROPOSAL_UNKNOWN_PRODUCT");
    expect(attempts[2]?.["applyOk"]).toBe(false);
    expect(JSON.stringify(attempts[2]?.["applyErrors"])).toContain("STALE_REVISION");
    // All failures retained. M4: the 29800-mm heuristic honestly wins overall,
    // while proposal-1 stays the best valid MODEL result (invalids displace nothing).
    expect(approved.json["bestName"]).toBe("heuristic");
    expect(approved.json["outcome"]).toBe("IMPROVED_VALID_ASSIGNMENT");
    const validModel = (attempts as { name: string; candidate: { valid: boolean } | null }[])
      .filter((a) => a.candidate?.valid)
      .map((a) => a.name);
    expect(validModel).toEqual(["proposal-1"]);
  });

  it("records transport failures without retrying beyond budget", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "error", status: 500, body: "fixture upstream failure" },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("FAILED");
    expect(approved.json["modelRequestsUsed"]).toBe(2);
    expect(fake.requestCount()).toBe(2);
  });

  it("fails interpretation transport visibly without hanging creation", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "error", status: 500, body: "fixture interpret failure" }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const failed = await waitFor(api.apiUrl, created["runId"] as string, ["FAILED"]);
    expect(failed["modelRequestsUsed"]).toBe(1);
    expect(fake.requestCount()).toBe(1);
  });
});

describe("M3 cancellation, deadline, and concurrency", () => {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it("cancels the first inference by ID while interpretation is in flight", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler([{ kind: "ok", contentJson: draftRequirements(), delayMs: 1500 }], FAKE_MODEL),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const started = Date.now();
    const created = await createLive(api.apiUrl);
    // The ID returns promptly, long before the slow interpretation resolves.
    expect(Date.now() - started).toBeLessThan(1000);
    const runId = created["runId"] as string;
    await sleep(200);
    const cancelled = await postJson(`${api.apiUrl}/api/runs/${runId}/cancel`, {});
    expect(cancelled.json["state"]).toBe("CANCELLED");
    const summary = await waitFor(api.apiUrl, runId, ["CANCELLED"]);
    expect(summary["requirementsDraft"]).toBeNull();
    // The late transport success is discarded: still cancelled, no more calls.
    await sleep(1800);
    const later = await getJson(`${api.apiUrl}/api/runs/${runId}`);
    expect(later.json["state"]).toBe("CANCELLED");
    expect(later.json["requirementsDraft"]).toBeNull();
    expect(fake.requestCount()).toBe(1);
    const retry = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: draftRequirements(),
    });
    expect(retry.status).toBe(409);
    expect(fake.requestCount()).toBe(1);
  });

  it("cancellation mid-proposal aborts in-flight transport and discards late success", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "slow"), delayMs: 900 },
          { kind: "ok", contentJson: proposal(0, [], "never reached") },
          { kind: "ok", contentJson: proposal(0, [], "never reached") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const runId = created["runId"] as string;
    const approvePromise = postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    await sleep(300);
    const cancelled = await postJson(`${api.apiUrl}/api/runs/${runId}/cancel`, {});
    expect(cancelled.json["state"]).toBe("CANCELLED");
    const finished = await approvePromise;
    // Cancellation is never reclassified as completed.
    expect(finished.json["state"]).toBe("CANCELLED");
    // Wait past the fake's delayed success: no candidate appended, no more calls.
    await sleep(1200);
    const later = await getJson(`${api.apiUrl}/api/runs/${runId}`);
    expect(later.json["state"]).toBe("CANCELLED");
    const attempts = later.json["attempts"] as Record<string, unknown>[];
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.["candidate"]).toBeNull();
    expect(fake.requestCount()).toBe(2);
    const retry = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(retry.status).toBe(409);
    expect(fake.requestCount()).toBe(2);
  });

  it("deadline mid-request aborts and bars further calls", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "slow"), delayMs: 3000 },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake, { RUN_TIMEOUT_MS: "600" }));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL", "TIMED_OUT"]);
    if (awaiting["state"] === "TIMED_OUT") {
      expect(awaiting["modelRequestsUsed"]).toBe(1);
      return;
    }
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    if (approved.status === 408) {
      expect(approved.json["code"]).toBe("RUN_EXPIRED");
    } else {
      expect(approved.json["state"]).toBe("TIMED_OUT");
    }
    const countAfter = fake.requestCount();
    expect(countAfter).toBeLessThanOrEqual(2);
    await sleep(400);
    expect(fake.requestCount()).toBe(countAfter);
  });

  it("expiry during approval preserves deadline and budgets", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const api = await startApi(testConfig(fake, { RUN_TIMEOUT_MS: "300" }));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const runId = created["runId"] as string;
    const timed = await waitFor(api.apiUrl, runId, ["TIMED_OUT"]);
    expect(timed["modelRequestsUsed"]).toBe(1);
    expect(timed["proposalsUsed"]).toBe(0);
    const late = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: draftRequirements(),
    });
    expect(late.status).toBe(408);
    expect(late.json["code"]).toBe("RUN_EXPIRED");
    const summary = await getJson(`${api.apiUrl}/api/runs/${runId}`);
    // Budgets preserved: interpretation consumed, proposals untouched.
    expect(summary.json["modelRequestsUsed"]).toBe(1);
    expect(summary.json["proposalsUsed"]).toBe(0);
    expect(fake.requestCount()).toBe(1);
  });

  it("enforces bounded concurrency across runs", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "slow"), delayMs: 1500 },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake, { API_CONCURRENCY: "1" }));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const runId = created["runId"] as string;
    const approvePromise = postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    await sleep(300);
    const busy = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: sampleScenario(),
      requestText: "second run",
      mode: "live",
      consent: true,
    });
    expect(busy.status).toBe(429);
    expect(busy.json["code"]).toBe("CONCURRENCY_LIMIT");
    await postJson(`${api.apiUrl}/api/runs/${runId}/cancel`, {});
    const finished = await approvePromise;
    expect(finished.json["state"]).toBe("CANCELLED");
  });
});

describe("M3 approval gates", () => {
  it("concurrent double approve runs a single loop (single-flight)", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "a") },
          { kind: "ok", contentJson: proposal(0, [], "b") },
          { kind: "ok", contentJson: proposal(0, [], "c") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const runId = created["runId"] as string;
    const body = { requirements: awaiting["requirementsDraft"] };
    const [first, second] = await Promise.all([
      postJson(`${api.apiUrl}/api/runs/${runId}/approve`, body),
      postJson(`${api.apiUrl}/api/runs/${runId}/approve`, body),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(fake.requestCount()).toBe(4);
    const summary = await getJson(`${api.apiUrl}/api/runs/${runId}`);
    expect(summary.json["state"]).toBe("COMPLETED");
    expect(summary.json["proposalsUsed"]).toBe(3);
  });

  it("blocks approval until interpreted questions are explicitly resolved", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements(4, ["Is cold-chain relocation allowed?"]) },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "a") },
          { kind: "ok", contentJson: proposal(0, [], "b") },
          { kind: "ok", contentJson: proposal(0, [], "c") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const runId = created["runId"] as string;
    expect(awaiting["interpretedUnresolved"]).toEqual(["Is cold-chain relocation allowed?"]);
    // Carrying the questions forward is rejected without new inference.
    const blocked = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(blocked.status).toBe(400);
    expect(blocked.json["code"]).toBe("UNRESOLVED_QUESTIONS");
    expect(fake.requestCount()).toBe(1);
    // Explicit normalization (questions resolved away) proceeds on the same run.
    const normalized = {
      ...(awaiting["requirementsDraft"] as Record<string, unknown>),
      unresolvedQuestions: [],
    };
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, { requirements: normalized });
    expect(approved.status).toBe(200);
    expect(approved.json["state"]).toBe("COMPLETED");
    expect(approved.json["runId"]).toBe(runId);
    expect(fake.requestCount()).toBe(4);
  });

  it("rejects approval with unknown locked refs before any new inference", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const bad = {
      ...(awaiting["requirementsDraft"] as Record<string, unknown>),
      lockedProductIds: ["ghost-sku"],
    };
    const r = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, { requirements: bad });
    expect(r.status).toBe(400);
    expect(fake.requestCount()).toBe(1);
  });
});

describe("M3 usage, sanitization, and reports", () => {
  it("tracks usage only from actual responses, never inventing counts", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements(), usage: { p: 100, c: 20, t: 120 } },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "a"), usage: { p: 200, c: 30, t: 230 } },
          { kind: "ok", contentJson: proposal(0, [], "b"), usage: null },
          { kind: "ok", contentJson: proposal(0, [], "c"), usage: null },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    const totals = approved.json["usageTotals"] as Record<string, number>;
    expect(totals["promptTokens"]).toBe(300);
    expect(totals["completionTokens"]).toBe(50);
    expect(totals["totalTokens"]).toBe(350);
    expect(approved.json["usageIncomplete"]).toBe(true);
    const attempts = approved.json["attempts"] as Record<string, unknown>[];
    expect(attempts[1]?.["usage"]).toBeNull();
  });

  it("reports null usage when no response carries any", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements(), usage: null },
          { kind: "ok", contentJson: proposal(0, [], "retain"), usage: null },
          { kind: "ok", contentJson: proposal(0, [], "retain"), usage: null },
          { kind: "ok", contentJson: proposal(0, [], "retain"), usage: null },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["usageTotals"]).toBeNull();
    expect(approved.json["usageIncomplete"]).toBe(true);
  });

  it("sanitizes server errors so keys never reach the browser", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "error", status: 500, body: `fixture echo Authorization: Bearer ${FAKE_KEY} MODEL_API_KEY=${FAKE_KEY}` },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${created["runId"]}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("FAILED");
    expect(JSON.stringify(approved.json)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(approved.json)).toContain("[REDACTED]");
  });

  it("report carries full provenance and replays deterministically without inference", async () => {
    const { replayReport } = await import("@layoutlab/core");
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements() },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "good") },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-c", locationId: "L6" }], "worse") },
          { kind: "ok", contentJson: proposal(0, [{ productId: "sku-d", locationId: "L6" }], "mid") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const awaiting = await waitFor(api.apiUrl, created["runId"] as string, ["AWAITING_APPROVAL"]);
    const runId = created["runId"] as string;
    await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(fake.requestCount()).toBe(4);
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    expect(report.status).toBe(200);
    const e = report.json;
    expect(e["envelopeVersion"]).toBe("layoutlab.m3report/1");
    expect(e["provider"]).toBe("meta");
    expect(e["providerKind"]).toBe("fixture");
    expect(e["realMetaRequests"]).toBe(0);
    expect(e["modelId"]).toBe(FAKE_MODEL);
    expect(typeof e["promptVersion"]).toBe("string");
    expect(e["runId"]).toBe(runId);
    expect(e["state"]).toBe("COMPLETED");
    expect(e["modelRequestsUsed"]).toBe(4);
    expect(e["proposalsUsed"]).toBe(3);
    expect(Array.isArray(e["candidates"])).toBe(true);
    expect(Array.isArray(e["attempts"])).toBe(true);
    expect(Array.isArray(e["feedback"])).toBe(true);
    expect(JSON.stringify(e["limitations"])).toContain("Demand heuristic runs before model proposals");
    expect(JSON.stringify(e["limitations"])).toContain("no equal-compute claim");
    // Deterministic replay without inference.
    const replayed = replayReport({
      reportVersion: e["reportVersion"],
      coreVersion: e["coreVersion"],
      routePolicy: e["routePolicy"],
      scenario: e["scenario"],
      requirements: e["requirements"],
      baseline: e["baseline"],
      candidates: e["candidates"],
      bestName: e["bestName"],
      improvementPercents: e["improvementPercents"],
      outcome: e["outcome"],
    });
    expect(replayed.matchesSaved).toBe(true);
    const again = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    expect(JSON.stringify({ ...again.json, exportedAt: null })).toBe(JSON.stringify({ ...e, exportedAt: null }));
    expect(fake.requestCount()).toBe(4);
    expect(JSON.stringify(e)).not.toContain(FAKE_KEY);
  });
});

describe("M4 heuristic + asset integration (fixture transport)", () => {
  const fullScript: ScriptEntry[] = [
    { kind: "ok", contentJson: draftRequirements() },
    { kind: "ok", contentJson: proposal(0, [{ productId: "sku-b", locationId: "L6" }], "move sku-b near packing") },
    { kind: "ok", contentJson: proposal(0, [{ productId: "sku-c", locationId: "L6" }], "try sku-c") },
    { kind: "ok", contentJson: proposal(0, [{ productId: "sku-d", locationId: "L6" }], "try sku-d") },
  ];

  function oracleScenario(): unknown {
    const url = new URL("../../../fixtures/test/heuristic-oracle.json", import.meta.url);
    return JSON.parse(readFileSync(url, "utf8")) as unknown;
  }

  function emptyRoomScenario(): unknown {
    const url = new URL("../../../fixtures/test/oracle-empty-room.json", import.meta.url);
    return JSON.parse(readFileSync(url, "utf8")) as unknown;
  }

  it("rejects invalid scene geometry before any run state or inference", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const broken = sampleScenario() as { racks: Record<string, unknown>[] };
    broken.racks.push({ ...broken.racks[0], id: "RX-OVERLAP" });
    const res = await postJson(`${api.apiUrl}/api/runs`, {
      scenario: broken,
      requestText: "invalid scene must not start inference",
      mode: "live",
      consent: true,
    });
    expect(res.status).toBe(400);
    expect(res.json["code"]).toBe("INPUT_INVALID");
    expect(JSON.stringify(res.json)).toContain("RACK_OVERLAP");
    expect(fake.requestCount()).toBe(0);
  });

  it("seeds feedback best-so-far with the valid baseline, never a worse heuristic", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements(2) },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
          { kind: "ok", contentJson: proposal(0, [], "retain") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const res = await fetch(`${api.apiUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: emptyRoomScenario(), requestText: "baseline seed test", mode: "live", consent: true }),
    });
    expect(res.status).toBe(202);
    const created = (await res.json()) as Record<string, unknown>;
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    // The trap: heuristic swap is valid (16000) but worse than the valid
    // baseline (16000, 0 relocations vs 2). Feedback must keep baseline best.
    const heuristic = approved.json["heuristic"] as Record<string, unknown>;
    const candidate = heuristic["candidate"] as Record<string, unknown>;
    expect(candidate["valid"]).toBe(true);
    expect(candidate["weightedTravelMm"]).toBe(16000);
    expect(candidate["relocationCount"]).toBe(2);
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    const feedback = report.json["feedback"] as { proposalName: string; bestValidSoFar: { name: string } | null }[];
    expect(feedback[0]?.proposalName).toBe("heuristic");
    for (const entry of feedback) {
      expect(entry.bestValidSoFar?.name).toBe("baseline");
    }
    expect(approved.json["bestName"]).toBe("baseline");
  });

  it("runs the heuristic before proposals with its own budget and labels", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler(fullScript, FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    // Phase order: baseline, then heuristic, then the first model proposal.
    const phases = (approved.json["phaseHistory"] as { phase: string }[]).map((p) => p.phase);
    expect(phases.indexOf("EVALUATING_BASELINE")).toBeLessThan(phases.indexOf("RUNNING_HEURISTIC"));
    expect(phases.indexOf("RUNNING_HEURISTIC")).toBeLessThan(phases.indexOf("REQUESTING_PROPOSAL"));
    // Heuristic result: 29800-mm swap, 2 relocations, own evaluation budget.
    const heuristic = approved.json["heuristic"] as Record<string, unknown>;
    expect(heuristic["name"]).toBe("heuristic");
    expect(heuristic["retainedBaseline"]).toBe(false);
    expect(heuristic["evaluationsUsed"]).toBe(15);
    expect(heuristic["evaluationsBudget"]).toBe(32);
    const candidate = heuristic["candidate"] as Record<string, unknown>;
    expect(candidate["valid"]).toBe(true);
    expect(candidate["weightedTravelMm"]).toBe(29800);
    expect(candidate["relocationCount"]).toBe(2);
    // The heuristic consumes no model requests; model budgets are unchanged.
    expect(approved.json["modelRequestsUsed"]).toBe(4);
    expect(approved.json["proposalsUsed"]).toBe(3);
    const budgets = approved.json["candidateBudgets"] as Record<string, Record<string, number>>;
    expect(budgets["heuristic"]).toEqual({ evaluationsUsed: 15, evaluationsBudget: 32 });
    expect(budgets["model"]).toEqual({ proposalsUsed: 3, maxProposals: 3, requestsUsed: 4, maxRequests: 4 });
    // Exact method labels over baseline plus every evaluated mapping.
    expect(approved.json["methodLabels"]).toEqual({
      baseline: "current",
      heuristic: "heuristic",
      "proposal-1": "meta-first",
      "proposal-2": "meta-feedback",
      "proposal-3": "meta-feedback",
    });
    // Honest win: the heuristic beats every fixture proposal.
    expect(approved.json["bestName"]).toBe("heuristic");
    expect(approved.json["outcome"]).toBe("IMPROVED_VALID_ASSIGNMENT");
  });

  it("feeds the measured heuristic result to the first model proposal", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler(fullScript, FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    const firstProposal = fake.requests[1]?.bodyJson;
    const messages = firstProposal?.["messages"] as { role: string; content: string }[];
    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("heuristic");
    expect(userContent).toContain("29800");
  });

  it("reports a heuristic win on the independent oracle without model help", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(
      scriptHandler(
        [
          { kind: "ok", contentJson: draftRequirements(2) },
          { kind: "ok", contentJson: proposal(0, [], "retain baseline") },
          { kind: "ok", contentJson: proposal(0, [{ productId: "ghost", locationId: "L-near" }], "invalid") },
          { kind: "ok", contentJson: proposal(0, [], "retain baseline") },
        ],
        FAKE_MODEL,
      ),
    );
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const res = await fetch(`${api.apiUrl}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: oracleScenario(), requestText: "swap demand test", mode: "live", consent: true }),
    });
    expect(res.status).toBe(202);
    const created = (await res.json()) as Record<string, unknown>;
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    const heuristic = approved.json["heuristic"] as Record<string, unknown>;
    const candidate = heuristic["candidate"] as Record<string, unknown>;
    expect(candidate["valid"]).toBe(true);
    expect(candidate["weightedTravelMm"]).toBe(26000);
    expect(candidate["relocationCount"]).toBe(2);
    expect(approved.json["bestName"]).toBe("heuristic");
    expect(approved.json["outcome"]).toBe("IMPROVED_VALID_ASSIGNMENT");
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    const names = ((report.json["candidates"] as Record<string, unknown>[]) ?? []).map((c) => c["name"]);
    expect(names).toContain("heuristic");
  });

  it("zero heuristic budget disables evaluation without breaking the run", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler(fullScript, FAKE_MODEL));
    const api = await startApi(testConfig(fake, { HEURISTIC_MAX_EVALUATIONS: "0" }));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    expect(approved.json["state"]).toBe("COMPLETED");
    const heuristic = approved.json["heuristic"] as Record<string, unknown>;
    expect(heuristic["evaluationsUsed"]).toBe(0);
    expect(heuristic["evaluationsBudget"]).toBe(0);
    expect(heuristic["candidate"]).toBeNull();
    expect((approved.json["methodLabels"] as Record<string, unknown>)["heuristic"]).toBeUndefined();
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    const names = ((report.json["candidates"] as Record<string, unknown>[]) ?? []).map((c) => c["name"]);
    expect(names).not.toContain("heuristic");
    // Model-only best selection still works: proposal-1 (35600) wins.
    expect(approved.json["bestName"]).toBe("proposal-1");
  });

  it("sends complete geometry, nav, demand, and mapping context to the model", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler(fullScript, FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    const firstProposal = fake.requests[1]?.bodyJson;
    const messages = firstProposal?.["messages"] as { role: string; content: string }[];
    const userContent = messages[1]?.content ?? "";
    // Brief section 20 input context: packing + approach points, nav
    // settings, allowlists, split demand semantics, measured distances.
    for (const field of [
      "packingPointMm",
      "pickPointMm",
      "minimumPassageWidthMm",
      "gridSizeMm",
      "allowedLocationIds",
      "allowedProductIds",
      "demandFrequency",
      "demandUnits",
      "packingDistances",
    ]) {
      expect(userContent).toContain(field);
    }
    const summaryText = userContent.split("\nApproved constraints:")[0]?.replace("Scenario summary: ", "") ?? "{}";
    const summary = JSON.parse(summaryText) as Record<string, unknown>;
    expect(summary["packingPointMm"]).toEqual({ x: 3000, z: 3000 });
    const locations = summary["locations"] as Record<string, unknown>[];
    expect(locations[0]?.["pickPointMm"]).toEqual({ x: 2900, z: 1500 });
    const products = summary["products"] as Record<string, unknown>[];
    const skuA = products.find((p) => p["id"] === "sku-a") as Record<string, unknown>;
    // Distinct-order frequency (4) is separate from quantity-weighted units (8).
    expect(skuA["demandFrequency"]).toBe(4);
    expect(skuA["demandUnits"]).toBe(8);
    const nav = summary["nav"] as Record<string, unknown>;
    expect((nav["cart"] as Record<string, unknown>)["widthMm"]).toBe(600);
    expect(nav["minimumPassageWidthMm"]).toBe(1400);
    expect(nav["gridSizeMm"]).toBe(100);
    const distances = summary["packingDistances"] as { locationId: string; distanceMm: number | null; status: string }[];
    expect(distances).toHaveLength(8);
    const l6 = distances.find((d) => d.locationId === "L6");
    expect(l6?.status).toBe("reachable");
    expect(typeof l6?.distanceMm).toBe("number");
    // Feedback carries baseline-relative changes, not scores alone: the
    // heuristic entry maps the actual winning moves, and best-so-far names
    // the heuristic with its changes (29800 beats baseline 36800).
    const feedbackText = userContent.split("Evaluator feedback (most recent last): ")[1] ?? "[]";
    const feedback = JSON.parse(feedbackText) as Record<string, unknown>[];
    expect(feedback[0]?.["proposalName"]).toBe("heuristic");
    expect(feedback[0]?.["changes"]).toEqual([
      { productId: "sku-b", locationId: "L4" },
      { productId: "sku-d", locationId: "L2" },
    ]);
    expect(feedback[0]?.["bestValidSoFar"]).toEqual({
      name: "heuristic",
      weightedTravelMm: 29800,
      relocationCount: 2,
      changes: [
        { productId: "sku-b", locationId: "L4" },
        { productId: "sku-d", locationId: "L2" },
      ],
    });
    // Later proposals see evaluated model mappings too: proposal-1 moved
    // sku-b to L6, and the heuristic stays best-so-far.
    const secondProposal = fake.requests[2]?.bodyJson;
    const messages2 = secondProposal?.["messages"] as { role: string; content: string }[];
    const feedback2 = JSON.parse(
      (messages2[1]?.content ?? "").split("Evaluator feedback (most recent last): ")[1] ?? "[]",
    ) as Record<string, unknown>[];
    expect(feedback2[1]?.["proposalName"]).toBe("proposal-1");
    expect(feedback2[1]?.["changes"]).toEqual([{ productId: "sku-b", locationId: "L6" }]);
    expect((feedback2[1]?.["bestValidSoFar"] as Record<string, unknown>)["name"]).toBe("heuristic");
  });

  it("exposes configured allowlists in the scenario summary", async () => {
    const { buildScenarioSummary } = await import("../src/prompts.js");
    const { parseScenario } = await import("@layoutlab/core");
    const scenario = parseScenario(sampleScenario());
    scenario.products[0]!.allowedLocationIds = ["L1"];
    scenario.locations[0]!.allowedProductIds = ["sku-a"];
    const summary = JSON.parse(buildScenarioSummary(scenario, { maxChars: 20000 })) as Record<string, unknown>;
    const products = summary["products"] as Record<string, unknown>[];
    const locations = summary["locations"] as Record<string, unknown>[];
    expect(products[0]?.["allowedLocationIds"]).toEqual(["L1"]);
    expect(products[1]?.["allowedLocationIds"]).toBeNull();
    expect(locations[0]?.["allowedProductIds"]).toEqual(["sku-a"]);
    expect(locations[1]?.["allowedProductIds"]).toBeNull();
  });

  it("report asset refs are locked to the manifest and tracked GLB bytes", async () => {
    const { createHash } = await import("node:crypto");
    const manifestUrl = new URL("../../../assets/manifests/rack_large_empty_a01.manifest.json", import.meta.url);
    const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as Record<string, unknown>;
    const derivative = manifest["derivative"] as Record<string, unknown>;
    const glbUrl = new URL(`../../../${derivative["path"] as string}`, import.meta.url);
    const glbBytes = readFileSync(glbUrl);
    expect(glbBytes.length).toBe(derivative["bytes"]);
    expect(createHash("sha256").update(glbBytes).digest("hex")).toBe(derivative["sha256"]);

    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler(fullScript, FAKE_MODEL));
    const api = await startApi(testConfig(fake));
    closers.push(api.close);
    const created = await createLive(api.apiUrl);
    const runId = created["runId"] as string;
    const awaiting = await waitFor(api.apiUrl, runId, ["AWAITING_APPROVAL"]);
    await postJson(`${api.apiUrl}/api/runs/${runId}/approve`, {
      requirements: awaiting["requirementsDraft"],
    });
    const report = await getJson(`${api.apiUrl}/api/runs/${runId}/report`);
    const refs = report.json["assetRefs"] as Record<string, unknown>[];
    expect(refs).toHaveLength(4);
    for (const ref of refs) {
      expect(ref["kind"]).toBe("simready-glb");
      expect(ref["ref"]).toBe("/assets/rack_large_empty_a01.glb");
      expect(ref["sha256"]).toBe(derivative["sha256"]);
      expect(JSON.stringify(ref["note"])).toContain("CC-BY-4.0");
    }
  });
});

describe("M3 browser hygiene (static)", () => {
  it("web sources carry no key, no Meta endpoint, and no direct Meta traffic", async () => {
    const { readdirSync, readFileSync: read } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const srcDir = fileURLToPath(new URL("../../web/src", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|css|html)$/.test(entry.name)) files.push(full);
      }
    };
    walk(srcDir);
    const configText = read(new URL("../../web/vite.config.ts", import.meta.url), "utf8");
    const bodies = [...files.map((f) => read(f, "utf8")), configText];
    expect(files.length).toBeGreaterThan(5);
    for (const body of bodies) {
      expect(body).not.toContain("MODEL_API_KEY");
      expect(body).not.toContain("api.meta.ai");
      expect(body).not.toContain("Bearer ");
      expect(body).not.toContain(FAKE_KEY);
    }
    const apiAdapter = read(new URL("../../web/src/lib/api.ts", import.meta.url), "utf8");
    expect(apiAdapter).toContain("/api/status");
    expect(apiAdapter).not.toContain("http://");
    expect(apiAdapter).not.toContain("https://");
  });
});
