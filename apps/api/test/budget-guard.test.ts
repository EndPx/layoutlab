// Corrected public budget guard: fail-closed ledger validation, explicit
// init/migration, cross-process locking, no-refund-after-dispatch, and
// coverage of every paid route. FAKE local transport only; zero paid calls.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BudgetGuardError,
  createBudgetGuard,
  initializeBudgetLedger,
  migrateBudgetLedger,
} from "../src/budget-guard.js";
import { proposePatch } from "../src/operations-api.js";
import { loadConfig, type ApiConfig } from "../src/config.js";
import { createApp } from "../src/server.js";
import { scriptHandler, startFakeMeta, type FakeMeta } from "./fake-meta.js";

const FAKE_KEY = "fixture-only-key-not-a-secret";
const FAKE_MODEL = "fixture-muse-shape";
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!().catch(() => {});
});

function tmpLedger(): string {
  const dir = mkdtempSync(join(tmpdir(), "layoutlab-guard-"));
  return join(dir, "ledger.json");
}
function v2File(entries: unknown[], capMicroUsd = 1_000_000): string {
  return JSON.stringify({ version: 2, capMicroUsd, entries });
}
function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e1",
    reservedMicroUsd: 100_000,
    committedMicroUsd: null,
    state: "reserved",
    createdAtMs: 1,
    ...over,
  };
}

describe("guard ledger validation", () => {
  it("missing ledger fails closed and is never recreated", () => {
    const file = tmpLedger();
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    expect(() => guard.snapshot()).toThrow(/missing/);
    expect(() => guard.reserve("r1", 0.1)).toThrow(/refusing to spend/);
    expect(existsSync(file)).toBe(false);
  });

  it("exact counterexample: ledger loss after commit does not refill", () => {
    const file = tmpLedger();
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    guard.reserve("first", 0.75);
    guard.commit("first");
    const preserved = readFileSync(file, "utf8");
    renameSync(file, `${file}.preserved`);
    expect(() => guard.snapshot()).toThrow(/refusing to spend/);
    expect(() => guard.reserve("second", 0.75)).toThrow(/refusing to spend/);
    expect(readFileSync(`${file}.preserved`, "utf8")).toBe(preserved);
    expect(existsSync(file)).toBe(false);
  });

  it("exact counterexample: negative entry cannot inflate allowance", () => {
    const file = tmpLedger();
    writeFileSync(file, v2File([entry({ reservedMicroUsd: 0, committedMicroUsd: -1_000_000, state: "committed" })]));
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    expect(() => guard.snapshot()).toThrow(/refusing to spend/);
    expect(() => guard.reserve("over-cap", 1.5)).toThrow(/refusing to spend/);
  });

  const invalidCases: [string, string][] = [
    ["negative reserved", v2File([entry({ reservedMicroUsd: -5 })])],
    ["fractional reserved", v2File([entry({ reservedMicroUsd: 1.5 })])],
    ["overflow reserved", v2File([entry({ reservedMicroUsd: 1e100 })])],
    ["duplicate ids", v2File([entry(), entry()])],
    ["invalid state", v2File([entry({ state: "paid" })])],
    ["committed exceeds reserved", v2File([entry({ committedMicroUsd: 200_000, state: "committed" })])],
    ["reserved with committed amount", v2File([entry({ committedMicroUsd: 5 })])],
    ["totals exceed cap", v2File([
      entry({ id: "a", reservedMicroUsd: 600_000, committedMicroUsd: 600_000, state: "committed" }),
      entry({ id: "b", reservedMicroUsd: 600_000, committedMicroUsd: 600_000, state: "committed" }),
    ])],
    ["unknown entry key", v2File([entry({ foo: 1 })])],
    ["corrupt json", "{not json"],
  ];
  for (const [name, raw] of invalidCases) {
    it(`rejects invalid ledger: ${name}`, () => {
      const file = tmpLedger();
      writeFileSync(file, raw);
      const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
      expect(() => guard.snapshot()).toThrow(/refusing to spend/);
      expect(readFileSync(file, "utf8")).toBe(raw);
    });
  }

  it("rejects cap mismatch and bad reservation amounts/ids", () => {
    const file = tmpLedger();
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    expect(() => createBudgetGuard({ filePath: file, capUsd: 2 }).snapshot()).toThrow(/cap/);
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    expect(() => guard.reserve("x", Number.NaN)).toThrow();
    expect(() => guard.reserve("x", -1)).toThrow();
    expect(() => guard.reserve("x", 0)).toThrow();
    expect(() => guard.reserve("x", 0.1234567)).toThrow();
    expect(() => guard.reserve("", 0.1)).toThrow();
  });

  it("rejects a positive amount that rounds to zero micro-USD, bytes unchanged", () => {
    const file = tmpLedger();
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    const before = readFileSync(file, "utf8");
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    expect(() => guard.reserve("tiny", 1e-12)).toThrow(/whole micro-USD/);
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(guard.snapshot().entries).toHaveLength(0);
  });

  it("assertReservation revalidates the persisted claim, even at zero available", () => {
    const file = tmpLedger();
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    guard.reserve("prior", 0.75);
    guard.commit("prior");
    guard.reserve("held", 0.25);
    expect(guard.snapshot().availableMicroUsd).toBe(0);
    expect(guard.assertReservation("held", 0.25).state).toBe("reserved");
    expect(() => guard.assertReservation("held", 0.5)).toThrow(/below its original bound/);
    expect(() => guard.assertReservation("missing", 0.25)).toThrow(/missing/);
    guard.release("held");
    expect(() => guard.assertReservation("held", 0.25)).toThrow(/not reserved/);
  });

  it("initialization refuses to overwrite any existing ledger", () => {
    const file = tmpLedger();
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    const before = readFileSync(file, "utf8");
    expect(() => initializeBudgetLedger({ filePath: file, capUsd: 1 })).toThrow(/already exists/);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("reservation ids are single-use in every state", () => {
    const file = tmpLedger();
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    guard.reserve("once", 0.25);
    expect(() => guard.reserve("once", 0.25)).toThrow(/single-use/);
    guard.commit("once");
    expect(() => guard.reserve("once", 0.25)).toThrow(/single-use/);
    guard.reserve("twice", 0.25);
    guard.release("twice");
    expect(() => guard.reserve("twice", 0.25)).toThrow(/single-use/);
  });

  it("version 1 needs explicit migration, which preserves entries and totals", () => {
    const file = tmpLedger();
    writeFileSync(file, JSON.stringify({
      version: 1,
      entries: [
        { id: "old-commit", reservedMicroUsd: 250_000, committedMicroUsd: 250_000, state: "committed", createdAtMs: 7 },
        { id: "old-open", reservedMicroUsd: 100_000, committedMicroUsd: null, state: "reserved", createdAtMs: 8 },
      ],
    }));
    expect(() => createBudgetGuard({ filePath: file, capUsd: 1 }).snapshot()).toThrow(/migration/);
    const snap = migrateBudgetLedger({ filePath: file, capUsd: 1 });
    expect(snap.committedMicroUsd).toBe(250_000);
    expect(snap.reservedMicroUsd).toBe(100_000);
    expect(snap.availableMicroUsd).toBe(650_000);
    expect(snap.entries.map((e) => e.id)).toEqual(["old-commit", "old-open"]);
    const reopened = createBudgetGuard({ filePath: file, capUsd: 1 }).snapshot();
    expect(reopened.availableMicroUsd).toBe(650_000);
  });

  it("migration refuses a corrupt v1 ledger unchanged", () => {
    const file = tmpLedger();
    const raw = JSON.stringify({ version: 1, entries: [entry({ reservedMicroUsd: -1 })] });
    writeFileSync(file, raw);
    expect(() => migrateBudgetLedger({ filePath: file, capUsd: 1 })).toThrow(/refusing to spend/);
    expect(readFileSync(file, "utf8")).toBe(raw);
  });

  it("a stale lock fails closed and is never auto-removed", { timeout: 20_000 }, () => {
    const file = tmpLedger();
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: 999_999, at: "stale" }));
    const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
    expect(() => guard.reserve("blocked", 0.1)).toThrow(/locked/);
    expect(existsSync(`${file}.lock`)).toBe(true);
  });

  it("parallel child processes cannot overspend the cap", { timeout: 60_000 }, async () => {
    const file = tmpLedger();
    initializeBudgetLedger({ filePath: file, capUsd: 1 });
    const guardUrl = new URL("../src/budget-guard.ts", import.meta.url).href;
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-child-"));
    const childFile = join(dir, "child.mjs");
    writeFileSync(childFile, [
      `import { createBudgetGuard } from ${JSON.stringify(guardUrl)};`,
      `const g = createBudgetGuard({ filePath: process.argv[2], capUsd: 1 });`,
      `try { g.reserve(process.argv[3], 0.6); console.log("SUCCESS"); }`,
      `catch (e) { console.log("FAIL:" + (e.code ?? "ERR")); }`,
    ].join("\n"));
    const runChild = (id: string): Promise<string> =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [childFile, file, id], { stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
        child.on("error", reject);
        child.on("close", () => resolve(out.trim()));
      });
    const results = await Promise.all([runChild("p1"), runChild("p2"), runChild("p3"), runChild("p4")]);
    expect(results.filter((r) => r === "SUCCESS")).toHaveLength(1);
    const snap = createBudgetGuard({ filePath: file, capUsd: 1 }).snapshot();
    expect(snap.reservedMicroUsd).toBe(600_000);
    expect(snap.availableMicroUsd).toBe(400_000);
  });
});

async function startGuardedApi(config: ApiConfig, guard?: ReturnType<typeof createBudgetGuard>) {
  const { app } = createApp({ config, ...(guard ? { budgetGuard: guard } : {}) });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${port}`;
}
function fakeConfig(fake: FakeMeta, overrides: Record<string, string> = {}): ApiConfig {
  return loadConfig({
    MODEL_API_KEY: FAKE_KEY,
    META_API_BASE_URL: fake.baseUrl,
    META_MODEL_ID: FAKE_MODEL,
    BUDGET_STATE_FILE: "",
    PUBLIC_BUDGET_USD: "1",
    PUBLIC_BUDGET_PER_RUN_USD: "0.25",
    ...overrides,
  });
}
async function postJson(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let json: Record<string, unknown> = {};
  try { json = (await res.json()) as Record<string, unknown>; } catch { json = {}; }
  return { status: res.status, json };
}
async function getJson(url: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url);
  let json: Record<string, unknown> = {};
  try { json = (await res.json()) as Record<string, unknown>; } catch { json = {}; }
  return { status: res.status, json };
}
function sampleScenario(): unknown {
  return JSON.parse(readFileSync(new URL("../../../fixtures/sample/warehouse-basic.json", import.meta.url), "utf8")) as unknown;
}
function draftRequirements(): unknown {
  return {
    objective: "minimize_weighted_picking_travel",
    maxRelocatedProducts: 4,
    lockedProductIds: [],
    assumptions: ["fixture assumption"],
    unresolvedQuestions: [],
  };
}
async function waitForRun(apiUrl: string, runId: string, want: string[]): Promise<Record<string, unknown>> {
  const started = Date.now();
  for (;;) {
    const r = await getJson(`${apiUrl}/api/runs/${runId}`);
    if (want.includes(r.json["state"] as string)) return r.json;
    if (Date.now() - started > 15_000) throw new Error(`timeout waiting ${want} got ${String(r.json["state"])}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
function newGuardedLedger(priorCommitUsd = 0): { file: string; guard: ReturnType<typeof createBudgetGuard> } {
  const file = tmpLedger();
  initializeBudgetLedger({ filePath: file, capUsd: 1 });
  const guard = createBudgetGuard({ filePath: file, capUsd: 1 });
  if (priorCommitUsd > 0) {
    guard.reserve("prior-spend", priorCommitUsd);
    guard.commit("prior-spend");
  }
  return { file, guard };
}

describe("guarded paid routes (fake transport only)", () => {
  it("proposal success commits the full conservative bound", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: { extraPickers: 1 } }], FAKE_MODEL));
    const { guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const res = await postJson(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" });
    expect(res.status).toBe(200);
    expect(fake.requestCount()).toBe(1);
    expect(guard.snapshot().committedMicroUsd).toBe(250_000);
    expect(guard.snapshot().availableMicroUsd).toBe(750_000);
  });

  it("provider error after receipt never restores allowance", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "error", status: 500, body: "boom" }], FAKE_MODEL));
    const { guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const res = await postJson(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" });
    expect(res.status).toBe(500);
    expect(fake.requestCount()).toBe(1);
    expect(guard.snapshot().committedMicroUsd).toBe(250_000);
    expect(guard.snapshot().entries[0]?.state).toBe("committed");
  });

  it("timeout after the provider received the request never restores allowance", { timeout: 20_000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: { extraPickers: 1 }, delayMs: 600 }], FAKE_MODEL));
    const { guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake, { RUN_TIMEOUT_MS: "50" }), guard);
    const res = await postJson(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" });
    expect(res.status).not.toBe(200);
    expect(fake.requestCount()).toBe(1);
    expect(guard.snapshot().committedMicroUsd).toBe(250_000);
  });

  it("invalid model output after dispatch commits instead of refunding", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: { teleport: true } }], FAKE_MODEL));
    const { guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const res = await postJson(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" });
    expect(res.status).toBe(422);
    expect(fake.requestCount()).toBe(1);
    expect(guard.snapshot().committedMicroUsd).toBe(250_000);
  });

  it("local invalid input and missing key spend nothing and call nothing", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: { extraPickers: 1 } }], FAKE_MODEL));
    const { guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    expect((await postJson(`${apiUrl}/api/operations/proposals`, { observation: "" })).status).toBe(400);
    expect((await postJson(`${apiUrl}/api/operations/proposals`, { observation: "x".repeat(4001) })).status).toBe(400);
    expect(fake.requestCount()).toBe(0);
    expect(guard.snapshot().entries).toHaveLength(0);

    const noKey = fakeConfig(fake, { MODEL_API_KEY: "" });
    const api2 = await startGuardedApi(noKey, guard);
    expect((await postJson(`${api2}/api/operations/proposals`, { observation: "dispatch is slow" })).status).toBe(503);
    expect((await postJson(`${api2}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true })).status).toBe(503);
    expect(fake.requestCount()).toBe(0);
    expect(guard.snapshot().entries).toHaveLength(0);
  });

  it("configured-but-missing ledger blocks every paid route and status lies nowhere", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: { extraPickers: 1 } }], FAKE_MODEL));
    const missing = tmpLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake, { BUDGET_STATE_FILE: missing }));
    const status = await getJson(`${apiUrl}/api/status`);
    expect(status.json["liveAvailable"]).toBe(false);
    expect(status.json["budgetGuard"]).toBe("unavailable");
    expect((await getJson(`${apiUrl}/api/budget`)).status).toBe(503);
    expect((await postJson(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" })).status).toBe(503);
    expect((await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true })).status).toBe(503);
    expect(fake.requestCount()).toBe(0);
    expect(existsSync(missing)).toBe(false);
  });

  it("last reservation completes the full 4-request legacy run at zero available", { timeout: 30_000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const proposal = (productId: string) => ({ scenarioRevision: 0, changes: [{ productId, locationId: "L6" }], rationale: "fixture" });
    fake.setHandler(scriptHandler([
      { kind: "ok", contentJson: draftRequirements() },
      { kind: "ok", contentJson: proposal("sku-b") },
      { kind: "ok", contentJson: proposal("sku-c") },
      { kind: "ok", contentJson: proposal("sku-d") },
    ], FAKE_MODEL));
    const { file, guard } = newGuardedLedger(0.75);
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const created = await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "reduce travel", mode: "live", consent: true });
    expect(created.status).toBe(202);
    expect(guard.snapshot().availableMicroUsd).toBe(0);
    const runId = created.json["runId"] as string;
    const awaiting = await waitForRun(apiUrl, runId, ["AWAITING_APPROVAL"]);
    const approved = await postJson(`${apiUrl}/api/runs/${runId}/approve`, { requirements: awaiting["requirementsDraft"] });
    expect(approved.status).toBe(200);
    expect(approved.json["state"]).toBe("COMPLETED");
    expect(approved.json["modelRequestsUsed"]).toBe(4);
    expect(fake.requestCount()).toBe(4);
    // Durable across a fresh guard instance (restart/deployment path).
    const reopened = createBudgetGuard({ filePath: file, capUsd: 1 }).snapshot();
    expect(reopened.committedMicroUsd).toBe(1_000_000);
    expect(reopened.availableMicroUsd).toBe(0);
  });

  it("legacy run is refused before any provider call when the bound exceeds allowance", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const { guard } = newGuardedLedger(0.9);
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const res = await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true });
    expect(res.status).toBe(402);
    expect(fake.requestCount()).toBe(0);
    expect(guard.snapshot().entries).toHaveLength(1);
  });

  it("legacy invalid scenario releases the pre-dispatch reservation", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const { guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const res = await postJson(`${apiUrl}/api/runs`, { scenario: {}, requestText: "go", mode: "live", consent: true });
    expect(res.status).toBe(400);
    expect(fake.requestCount()).toBe(0);
    const snap = guard.snapshot();
    expect(snap.availableMicroUsd).toBe(1_000_000);
    expect(snap.entries[0]?.state).toBe("released");
  });

  it("proposePatch refuses before dispatch when reservation revalidation fails", async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    let calls = 0;
    await expect(proposePatch({
      config: fakeConfig(fake),
      fetchImpl: async () => { calls++; throw new Error("must not dispatch"); },
      observation: "dispatch is slow",
      beforeDispatch: () => { throw new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, "refused"); },
    })).rejects.toThrow(/refused/);
    expect(calls).toBe(0);
  });

  it("ledger removed between interpretation and approval refuses with zero further calls, then recovers", { timeout: 30_000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const proposal = (productId: string) => ({ scenarioRevision: 0, changes: [{ productId, locationId: "L6" }], rationale: "fixture" });
    fake.setHandler(scriptHandler([
      { kind: "ok", contentJson: draftRequirements() },
      { kind: "ok", contentJson: proposal("sku-b") },
      { kind: "ok", contentJson: proposal("sku-c") },
      { kind: "ok", contentJson: proposal("sku-d") },
    ], FAKE_MODEL));
    const { file, guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const created = await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true });
    const runId = created.json["runId"] as string;
    const awaiting = await waitForRun(apiUrl, runId, ["AWAITING_APPROVAL"]);
    renameSync(file, `${file}.preserved`);
    const refused = await postJson(`${apiUrl}/api/runs/${runId}/approve`, { requirements: awaiting["requirementsDraft"] });
    expect(refused.status).toBe(503);
    expect(fake.requestCount()).toBe(1);
    const preserved = JSON.parse(readFileSync(`${file}.preserved`, "utf8")) as { entries: { state: string }[] };
    expect(preserved.entries[0]?.state).toBe("reserved");
    renameSync(`${file}.preserved`, file);
    const approved = await postJson(`${apiUrl}/api/runs/${runId}/approve`, { requirements: awaiting["requirementsDraft"] });
    expect(approved.status).toBe(200);
    expect(approved.json["state"]).toBe("COMPLETED");
    expect(fake.requestCount()).toBe(4);
    expect(guard.snapshot().committedMicroUsd).toBe(250_000);
  });

  it("ledger corruption between interpretation and approval refuses and leaves bytes untouched", { timeout: 30_000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const { file, guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const created = await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true });
    const runId = created.json["runId"] as string;
    const awaiting = await waitForRun(apiUrl, runId, ["AWAITING_APPROVAL"]);
    writeFileSync(file, "{corrupt");
    const refused = await postJson(`${apiUrl}/api/runs/${runId}/approve`, { requirements: awaiting["requirementsDraft"] });
    expect(refused.status).toBe(503);
    expect(fake.requestCount()).toBe(1);
    expect(readFileSync(file, "utf8")).toBe("{corrupt");
    expect(guard).toBeDefined();
  });

  it("claim released or removed between interpretation and approval refuses with zero further calls", { timeout: 30_000 }, async () => {
    for (const tamper of ["release", "remove"] as const) {
      const fake = await startFakeMeta();
      closers.push(fake.close);
      fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
      const { file, guard } = newGuardedLedger();
      const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
      const created = await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true });
      const runId = created.json["runId"] as string;
      const awaiting = await waitForRun(apiUrl, runId, ["AWAITING_APPROVAL"]);
      const claimId = guard.snapshot().entries.find((e) => e.id.startsWith("run:"))!.id;
      if (tamper === "release") {
        guard.release(claimId);
      } else {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as { entries: { id: string }[] };
        parsed.entries = parsed.entries.filter((e) => e.id !== claimId);
        writeFileSync(file, JSON.stringify(parsed));
      }
      const refused = await postJson(`${apiUrl}/api/runs/${runId}/approve`, { requirements: awaiting["requirementsDraft"] });
      expect(refused.status).toBe(503);
      expect(fake.requestCount()).toBe(1);
      const state = await getJson(`${apiUrl}/api/runs/${runId}`);
      expect(state.json["state"]).toBe("AWAITING_APPROVAL");
    }
  });

  it("ledger removed between proposal requests stops the next dispatch and preserves the claim", { timeout: 30_000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const { file, guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    fake.setHandler(async (_req, res) => {
      const n = fake.requestCount();
      const content = n === 1 ? draftRequirements() : { scenarioRevision: 0, changes: [{ productId: "sku-b", locationId: "L6" }], rationale: "fixture" };
      if (n === 2) renameSync(file, `${file}.preserved`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "chatcmpl-fixture", model: FAKE_MODEL,
        choices: [{ message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
    });
    const created = await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true });
    const runId = created.json["runId"] as string;
    const awaiting = await waitForRun(apiUrl, runId, ["AWAITING_APPROVAL"]);
    const refused = await postJson(`${apiUrl}/api/runs/${runId}/approve`, { requirements: awaiting["requirementsDraft"] });
    expect(refused.status).toBe(503);
    expect(fake.requestCount()).toBe(2);
    const preserved = JSON.parse(readFileSync(`${file}.preserved`, "utf8")) as { entries: { state: string }[] };
    expect(preserved.entries[0]?.state).toBe("reserved");
    renameSync(`${file}.preserved`, file);
    const run = await getJson(`${apiUrl}/api/runs/${runId}`);
    expect(run.json["state"]).toBe("FAILED");
    expect(guard.snapshot().committedMicroUsd).toBe(250_000);
    expect(fake.requestCount()).toBe(2);
  });

  it("claim released between proposal requests stops the next dispatch", { timeout: 30_000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    const { guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    let claimId = "";
    fake.setHandler(async (_req, res) => {
      const n = fake.requestCount();
      const content = n === 1 ? draftRequirements() : { scenarioRevision: 0, changes: [{ productId: "sku-b", locationId: "L6" }], rationale: "fixture" };
      if (n === 2) guard.release(claimId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "chatcmpl-fixture", model: FAKE_MODEL,
        choices: [{ message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }));
    });
    const created = await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true });
    const runId = created.json["runId"] as string;
    const awaiting = await waitForRun(apiUrl, runId, ["AWAITING_APPROVAL"]);
    claimId = guard.snapshot().entries.find((e) => e.id.startsWith("run:"))!.id;
    const refused = await postJson(`${apiUrl}/api/runs/${runId}/approve`, { requirements: awaiting["requirementsDraft"] });
    expect(refused.status).toBe(503);
    expect(fake.requestCount()).toBe(2);
    expect(guard.snapshot().entries.find((e) => e.id === claimId)?.state).toBe("released");
  });

  it("cancelling an interpreted legacy run commits its single reservation", { timeout: 30_000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(scriptHandler([{ kind: "ok", contentJson: draftRequirements() }], FAKE_MODEL));
    const { guard } = newGuardedLedger();
    const apiUrl = await startGuardedApi(fakeConfig(fake), guard);
    const created = await postJson(`${apiUrl}/api/runs`, { scenario: sampleScenario(), requestText: "go", mode: "live", consent: true });
    const runId = created.json["runId"] as string;
    await waitForRun(apiUrl, runId, ["AWAITING_APPROVAL"]);
    const cancelled = await postJson(`${apiUrl}/api/runs/${runId}/cancel`, {});
    expect(cancelled.json["state"]).toBe("CANCELLED");
    expect(fake.requestCount()).toBe(1);
    expect(guard.snapshot().committedMicroUsd).toBe(250_000);
    expect(guard.snapshot().entries.filter((e) => e.id.startsWith("run:"))).toHaveLength(1);
  });
});
