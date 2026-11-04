// v3-M7/M8: bounded patch validation, controlled experiments, Meta patch
// proposals (local fake transport only; no paid inference), and the durable
// public budget guard (reserve/commit/release, fail-closed corruption).
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBudgetGuard, initializeBudgetLedger } from "../src/budget-guard.js";
import { loadConfig, type ApiConfig } from "../src/config.js";
import { createApp } from "../src/server.js";
import { startFakeMeta, type FakeMeta } from "./fake-meta.js";

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

  it("runs a controlled experiment with deterministic ranking", async () => {
    const apiUrl = await startApi(noKeyConfig());
    const { scenario, executionConfig } = burstBody();
    const res = await post(`${apiUrl}/api/operations/experiments`, {
      scenario,
      executionConfig,
      candidates: [
        { candidateId: "baseline", patch: {} },
        { candidateId: "fast-dispatch", patch: { dispatchDurationMs: 1000 } },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.json["rankedCandidateIds"]).toEqual(["fast-dispatch", "baseline"]);
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

describe("budget endpoint", () => {
  it("reports not_configured without a state file", async () => {
    const apiUrl = await startApi(noKeyConfig());
    const res = await fetch(`${apiUrl}/api/budget`);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json["guard"]).toBe("not_configured");
  });
});
