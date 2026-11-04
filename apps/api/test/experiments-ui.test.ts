// E4b narrow server allowances: budget per-run field + offline verify route.
// Proves zero provider calls and an unchanged budget ledger for verify, and
// that perRunReservationUsd comes from config (never hardcoded in the UI).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBudgetGuard, initializeBudgetLedger } from "../src/budget-guard.js";
import { loadConfig, type ApiConfig } from "../src/config.js";
import { createApp } from "../src/server.js";
import { startFakeMeta, type FakeMeta } from "./fake-meta.js";

const FAKE_KEY = "fixture-only-key-not-a-secret";
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!().catch(() => {});
});

async function startApi(config: ApiConfig, guard?: ReturnType<typeof createBudgetGuard>) {
  const { app } = createApp({ config, ...(guard ? { budgetGuard: guard } : {}) });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${port}`;
}

function fixtureReport(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL("../../../evidence/sanitized/e4a-fixture-investigation.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

describe("E4b budget field", () => {
  it("exposes perRunReservationUsd from config without a guard", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const apiUrl = await startApi(
      loadConfig({
        MODEL_API_KEY: FAKE_KEY,
        META_API_BASE_URL: fake.baseUrl,
        META_MODEL_ID: "fixture-muse-shape",
        BUDGET_STATE_FILE: "",
        PUBLIC_BUDGET_PER_RUN_USD: "0.5",
      }),
    );
    const res = await fetch(`${apiUrl}/api/budget`);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json["perRunReservationUsd"]).toBe(0.5);
    expect(json["guard"]).toBe("not_configured");
  });

  it("exposes perRunReservationUsd from config with an active guard", async () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-e4b-budget-"));
    const ledger = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: ledger, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: ledger, capUsd: 1 });
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const apiUrl = await startApi(
      loadConfig({
        MODEL_API_KEY: FAKE_KEY,
        META_API_BASE_URL: fake.baseUrl,
        META_MODEL_ID: "fixture-muse-shape",
        BUDGET_STATE_FILE: ledger,
        PUBLIC_BUDGET_PER_RUN_USD: "0.25",
      }),
      guard,
    );
    const json = (await (await fetch(`${apiUrl}/api/budget`)).json()) as Record<string, unknown>;
    expect(json["perRunReservationUsd"]).toBe(0.25);
    expect(json["guard"]).toBe("active");
  });
});

describe("E4b offline verify route", () => {
  it("verifies a clean fixture report with zero provider calls and no ledger change", async () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-e4b-verify-"));
    const ledger = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: ledger, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: ledger, capUsd: 1 });
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const apiUrl = await startApi(
      loadConfig({
        MODEL_API_KEY: FAKE_KEY,
        META_API_BASE_URL: fake.baseUrl,
        META_MODEL_ID: "fixture-muse-shape",
        BUDGET_STATE_FILE: ledger,
      }),
      guard,
    );
    const before = guard.snapshot();
    const res = await fetch(`${apiUrl}/api/operations/investigations/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: fixtureReport() }),
    });
    const json = (await res.json()) as { ok: boolean; mismatches: string[] };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.mismatches).toEqual([]);
    expect(fake.requestCount()).toBe(0);
    expect(guard.snapshot()).toEqual(before);
  });

  it("rejects a tampered report, still with zero provider calls", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const apiUrl = await startApi(
      loadConfig({
        MODEL_API_KEY: FAKE_KEY,
        META_API_BASE_URL: fake.baseUrl,
        META_MODEL_ID: "fixture-muse-shape",
        BUDGET_STATE_FILE: "",
      }),
    );
    const report = fixtureReport();
    const comparison = report["comparison"] as { candidates: { candidateId: string; makespanMs: number }[] };
    const exp1 = comparison.candidates.find((c) => c.candidateId === "exp-1")!;
    exp1.makespanMs += 1;
    const res = await fetch(`${apiUrl}/api/operations/investigations/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report }),
    });
    const json = (await res.json()) as { ok: boolean; mismatches: string[] };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.mismatches.length).toBeGreaterThan(0);
    expect(fake.requestCount()).toBe(0);
  });

  it("works with no key configured and rejects malformed bodies", async () => {
    const apiUrl = await startApi(
      loadConfig({ MODEL_API_KEY: "", META_API_BASE_URL: "", META_MODEL_ID: "", BUDGET_STATE_FILE: "" }),
    );
    const okRes = await fetch(`${apiUrl}/api/operations/investigations/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: fixtureReport() }),
    });
    expect(okRes.status).toBe(200);
    expect(((await okRes.json()) as { ok: boolean }).ok).toBe(true);
    const badRes = await fetch(`${apiUrl}/api/operations/investigations/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: 42 }),
    });
    expect(badRes.status).toBe(400);
    const emptyRes = await fetch(`${apiUrl}/api/operations/investigations/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // A bare {} is not a valid export: the verifier fails closed.
    expect(emptyRes.status).toBe(200);
    expect(((await emptyRes.json()) as { ok: boolean }).ok).toBe(false);
  });
});
