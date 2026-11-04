// E4a bounded investigation loop over a LOCAL fake Meta transport whose
// answers depend on the actual engine feedback it receives. providerKind
// stays "fixture" and realMetaRequests stays 0; zero paid calls.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBudgetGuard, initializeBudgetLedger, type BudgetGuard } from "../src/budget-guard.js";
import { loadConfig, type ApiConfig } from "../src/config.js";
import {
  INVESTIGATION_ACTION_JSON_SCHEMA,
  InvestigationStore,
  parseInvestigationInput,
  verifyInvestigationExport,
  type InvestigationReport,
} from "../src/operations-investigations.js";
import { createApp } from "../src/server.js";
import type { FetchLike } from "../src/provider.js";
import {
  investigationActionSchemaError,
  respondChatCompletion,
  startFakeMeta,
  type CapturedRequest,
  type FakeHandler,
  type FakeMeta,
} from "./fake-meta.js";

const FAKE_KEY = "fixture-only-key-not-a-secret";
const FAKE_MODEL = "fixture-muse-shape";
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!().catch(() => {});
});

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

async function startApi(config: ApiConfig, budgetGuard?: BudgetGuard) {
  const { app } = createApp({ config, ...(budgetGuard ? { budgetGuard } : {}) });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${port}`;
}

async function post(url: string, body: unknown): Promise<{ status: number; json: Record<string, any> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
async function getJson(url: string): Promise<Record<string, any>> {
  const res = await fetch(url);
  return (await res.json()) as Record<string, any>;
}

function burstBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  const scenario = JSON.parse(readFileSync(new URL("../../../fixtures/operations/picking-packing-burst.json", import.meta.url), "utf8")) as unknown;
  const runconfig = JSON.parse(readFileSync(new URL("../../../fixtures/operations/picking-packing-burst.runconfig.json", import.meta.url), "utf8")) as { executionConfig: unknown };
  return {
    scenario,
    executionConfig: runconfig.executionConfig,
    interventionPolicy: { allowedFields: ["dispatchDurationMs"] },
    question: "Can a faster dispatch assumption improve makespan without adding workers?",
    mode: "live",
    consent: true,
    ...over,
  };
}

type Feedback = {
  operationalContext?: {
    resources: { kind: string; count: number; serviceDurationMs: number[] }[];
    workers: { role: string; count: number }[];
    workload: { orders: number; orderedUnits: number; initialStockUnits: number };
    execution: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number };
  };
  results: { candidateId: string; status: string; makespanMs: number | null; patch: unknown }[];
  rejectedProposals: { requestIndex: number; reason: string }[];
  experimentsRemaining: number;
  modelRequestsRemainingIncludingThisOne: number;
};
function feedbackOf(req: CapturedRequest): Feedback {
  const messages = req.bodyJson["messages"] as { content: string }[];
  const user = messages[1]?.content ?? "";
  return JSON.parse(user.slice(user.indexOf("{"), user.lastIndexOf("}") + 1)) as Feedback;
}

const NULLS = { extraPickers: null, extraPutaway: null, packingDurationMs: null, dispatchDurationMs: null, receivingDurationMs: null };
function runExp(patch: Record<string, number>, hypothesis: string | null = "faster dispatch should cut makespan"): Record<string, unknown> {
  return { action: "run_experiment", hypothesis, ...NULLS, ...patch, candidateId: null };
}
function finish(candidateId: string): Record<string, unknown> {
  return { action: "finish", hypothesis: null, ...NULLS, candidateId };
}

// Fake Meta whose response is computed from the feedback in THIS request.
function feedbackHandler(
  decide: (feedback: Feedback, call: number) => Record<string, unknown>,
  opts: { delayMs?: number; onCall?: (call: number) => void } = {},
): FakeHandler {
  let call = 0;
  return async (req, res) => {
    const schemaError = investigationActionSchemaError(req.bodyJson);
    if (schemaError !== null) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: null, message: schemaError, param: "schema", type: "invalid_request_error" } }));
      return;
    }
    call++;
    opts.onCall?.(call);
    if (opts.delayMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, opts.delayMs));
      if (res.destroyed || res.writableEnded) return;
    }
    try {
      respondChatCompletion(res, FAKE_MODEL, decide(feedbackOf(req), call));
    } catch {
      if (!res.writableEnded) { res.writeHead(500); res.end("decide failed"); }
    }
  };
}

async function startInvestigation(decide: Parameters<typeof feedbackHandler>[0], opts: { config?: ApiConfig; guard?: BudgetGuard; handlerOpts?: { delayMs?: number; onCall?: (call: number) => void }; body?: Record<string, unknown> } = {}) {
  const fake = await startFakeMeta();
  closers.push(fake.close);
  fake.setHandler(feedbackHandler(decide, opts.handlerOpts));
  const config = opts.config ?? fakeConfig(fake);
  const apiUrl = await startApi(config, opts.guard);
  const created = await post(`${apiUrl}/api/operations/investigations`, opts.body ?? burstBody());
  return { fake, apiUrl, created };
}

async function pollTerminal(apiUrl: string, id: string, timeoutMs = 120000): Promise<Record<string, any>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const json = await getJson(`${apiUrl}/api/operations/investigations/${id}`);
    if (json["state"] !== "RUNNING") return json;
    if (Date.now() > deadline) throw new Error(`investigation ${id} did not terminate; last=${JSON.stringify(json).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("investigation action schema (Meta strict contract)", () => {
  it("requires every property and keeps patch fields integer-or-null", () => {
    const props = Object.keys(INVESTIGATION_ACTION_JSON_SCHEMA.properties).sort();
    expect([...INVESTIGATION_ACTION_JSON_SCHEMA.required].sort()).toEqual(props);
    expect(INVESTIGATION_ACTION_JSON_SCHEMA.additionalProperties).toBe(false);
    const badBody = {
      response_format: { type: "json_schema", json_schema: { name: "operations_investigation_action", strict: true,
        schema: { type: "object", additionalProperties: false, properties: INVESTIGATION_ACTION_JSON_SCHEMA.properties } } },
    };
    expect(investigationActionSchemaError(badBody)).toContain("Missing 'action'");
  });
});

describe("bounded investigation loop (feedback-dependent fake Meta)", () => {
  it("baseline -> permitted experiment -> measured feedback -> finish, with one budget claim and independent arithmetic", { timeout: 180000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-inv-"));
    const ledger = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: ledger, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: ledger, capUsd: 1 });
    const { fake, apiUrl, created } = await startInvestigation(
      (fb) => (fb.results.some((r) => r.candidateId === "exp-1") ? finish("exp-1") : runExp({ dispatchDurationMs: 1000 })),
      { guard },
    );
    expect(created.status).toBe(202);
    const id = created.json["runId"] as string;
    expect(id).toBeTruthy();
    const done = await pollTerminal(apiUrl, id);
    expect(done["state"]).toBe("COMPLETED");
    expect(done["outcome"]).toBe("model-recommendation");
    expect(fake.requestCount()).toBe(2);
    // The model receives the frozen operational context (current resource
    // service assumptions, worker roles/counts, workload), computed here
    // independently from the raw fixture.
    const rawScenario = (burstBody()["scenario"] ?? {}) as {
      resources: { kind: string; serviceDurationMs: number }[];
      mobileUnits: { role: string }[];
      orderSchedule: { lines: { quantity: number }[] }[];
    };
    const dispatch = rawScenario.resources.filter((r) => r.kind === "dispatch");
    const firstFb = feedbackOf(fake.requests[0] as CapturedRequest);
    expect(firstFb.operationalContext?.resources.find((r) => r.kind === "dispatch")).toEqual({
      kind: "dispatch",
      count: dispatch.length,
      serviceDurationMs: [...new Set(dispatch.map((r) => r.serviceDurationMs))].sort((a, b) => a - b),
    });
    expect(firstFb.operationalContext?.workers.find((w) => w.role === "picker")?.count).toBe(
      rawScenario.mobileUnits.filter((u) => u.role === "picker").length,
    );
    expect(firstFb.operationalContext?.workload.orders).toBe(rawScenario.orderSchedule.length);
    expect(firstFb.operationalContext?.execution.pickDurationMsPerItem).toBe(2000);
    // The second request carried the ACTUAL measured feedback of exp-1.
    const second = fake.requests[1] as CapturedRequest;
    const fb = feedbackOf(second);
    const exp1 = fb.results.find((r) => r.candidateId === "exp-1");
    expect(exp1?.status).toBe("valid-complete");
    expect(exp1?.makespanMs).toBe(343200);
    expect(fb.results.find((r) => r.candidateId === "baseline")?.makespanMs).toBe(502400);
    // Fixture metadata never claims actual Meta.
    expect(done["providerKind"]).toBe("fixture");
    expect(done["realMetaRequests"]).toBe(0);
    const report = done["report"] as InvestigationReport;
    expect(report.providerKind).toBe("fixture");
    expect(report.requestCount).toBe(2);
    expect(report.requests.map((r) => r.responseId)).toEqual(["chatcmpl-fixture", "chatcmpl-fixture"]);
    expect(report.comparison?.candidates.map((c) => c.candidateId)).toEqual(["baseline", "exp-1"]);
    const rec = report.recommendation;
    expect(rec?.source).toBe("model");
    expect(rec?.candidateId).toBe("exp-1");
    expect(rec?.modelSelectedCandidateId).toBe("exp-1");
    expect(rec?.deterministicBestCandidateId).toBe("exp-1");
    expect(rec?.improvedOverBaseline).toBe(true);
    // Hand arithmetic, independent of the implementation helpers:
    // baseline 502400 -> exp-1 343200 is -159200 ms.
    expect(rec?.comparisons.makespanDeltaMs).toBe(-159200);
    expect(rec?.comparisons.makespanImprovementPercent).toBeCloseTo((159200 / 502400) * 100, 6);
    expect(rec?.comparisons.totalWaitDeltaMs).toBe(0);
    expect(report.trace.some((t) => t.kind === "experiment" && t.candidateId === "exp-1" && t.makespanMs === 343200)).toBe(true);
    expect(report.trace.some((t) => t.hypothesisKind === "model-assertion-not-measured-proof")).toBe(true);
    expect(JSON.stringify(report)).not.toContain(FAKE_KEY);
    // Exactly ONE durable claim for the whole investigation, committed once.
    const snap = guard.snapshot();
    expect(snap.entries).toHaveLength(1);
    expect(snap.entries[0]?.id.startsWith("investigation:")).toBe(true);
    expect(snap.entries[0]?.state).toBe("committed");
    expect(snap.committedMicroUsd).toBe(250000);
    // Offline replay passes; tampering fails.
    expect(verifyInvestigationExport(report)).toEqual({ ok: true, mismatches: [] });
    const tamperedRec = structuredClone(report) as InvestigationReport;
    (tamperedRec.recommendation as { candidateId: string }).candidateId = "baseline";
    expect(verifyInvestigationExport(tamperedRec).ok).toBe(false);
    const tamperedMetric = structuredClone(report) as InvestigationReport;
    (tamperedMetric.comparison?.candidates.find((c) => c.candidateId === "exp-1") as { makespanMs: number }).makespanMs += 1;
    expect(verifyInvestigationExport(tamperedMetric).ok).toBe(false);
    const tamperedTrace = structuredClone(report) as InvestigationReport;
    tamperedTrace.trace.push({ seq: 99, kind: "experiment", requestIndex: 9, candidateId: "exp-1", patch: null, hypothesis: null, hypothesisKind: null, status: "valid-complete", reason: null, shipped: 6, makespanMs: 1, totalWaitMs: 1, backlog: 0 });
    tamperedTrace.trace.push({ seq: 100, kind: "experiment", requestIndex: 9, candidateId: "exp-1", patch: null, hypothesis: null, hypothesisKind: null, status: "valid-complete", reason: null, shipped: 6, makespanMs: 1, totalWaitMs: 1, backlog: 0 });
    tamperedTrace.trace.push({ seq: 101, kind: "experiment", requestIndex: 9, candidateId: "exp-1", patch: null, hypothesis: null, hypothesisKind: null, status: "valid-complete", reason: null, shipped: 6, makespanMs: 1, totalWaitMs: 1, backlog: 0 });
    expect(verifyInvestigationExport(tamperedTrace).ok).toBe(false);
    // Terminal runs cannot be approved/restarted for a fresh allowance.
    const approve = await post(`${apiUrl}/api/operations/investigations/${id}/approve`, {});
    expect(approve.status).toBe(404);
    const cancelAgain = await post(`${apiUrl}/api/operations/investigations/${id}/cancel`, {});
    expect(cancelAgain.status).toBe(409);
    expect(fake.requestCount()).toBe(2);
  });

  it("denies no-new-workers and forbidden service knobs as retained invalid candidates", { timeout: 180000 }, async () => {
    const { apiUrl, created } = await startInvestigation((fb, call) =>
      call === 1 ? runExp({ extraPickers: 1 }) : call === 2 ? runExp({ packingDurationMs: 2000 }) : finish("baseline"),
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("COMPLETED");
    const report = done["report"] as InvestigationReport;
    const exps = report.comparison?.candidates.filter((c) => c.candidateId !== "baseline") ?? [];
    expect(exps.map((c) => c.status)).toEqual(["invalid", "invalid"]);
    expect(exps.every((c) => c.reasonCode === "POLICY_VIOLATION")).toBe(true);
    expect(report.recommendation?.candidateId).toBe("baseline");
    expect(report.recommendation?.improvedOverBaseline).toBe(false);
    expect(verifyInvestigationExport(report).ok).toBe(true);
  });

  it("retains infeasible staffing geometry as invalid when staffing is allowed", { timeout: 180000 }, async () => {
    const { apiUrl, created } = await startInvestigation(
      (fb, call) => (call === 1 ? runExp({ extraPickers: 1 }) : finish("baseline")),
      { body: burstBody({ interventionPolicy: { allowedFields: ["extraPickers"] } }) },
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    const report = done["report"] as InvestigationReport;
    const exp1 = report.comparison?.candidates.find((c) => c.candidateId === "exp-1");
    expect(exp1?.status).toBe("invalid");
    expect(exp1?.report).toBeNull();
    expect(report.recommendation?.candidateId).toBe("baseline");
  });

  it("rejects fabricated finish ids and malformed actions, preserving them as counted attempts", { timeout: 180000 }, async () => {
    const { fake, apiUrl, created } = await startInvestigation((fb, call) =>
      call === 1 ? finish("exp-99") : call === 2 ? { action: "teleport", hypothesis: null, ...NULLS, candidateId: null } : finish("baseline"),
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("COMPLETED");
    expect(fake.requestCount()).toBe(3);
    const report = done["report"] as InvestigationReport;
    expect(report.requestCount).toBe(3);
    expect(report.requests[1]?.status).toBe("invalid-action");
    expect(report.trace.some((t) => t.kind === "finish" && t.status === "rejected" && (t.reason ?? "").includes("exp-99"))).toBe(true);
    // The model was TOLD the reasons on the next request.
    const third = feedbackOf(fake.requests[2] as CapturedRequest);
    expect(third.rejectedProposals.map((r) => r.reason).join(" ")).toContain("exp-99");
    expect(third.rejectedProposals.map((r) => r.reason).join(" ")).toContain("invalid action");
    expect(report.recommendation?.candidateId).toBe("baseline");
    // Genuine rejected-then-finished lifecycle verifies: the rejected finish
    // referencing the unknown exp-99 is retained evidence, not a forgery.
    expect(verifyInvestigationExport(report)).toEqual({ ok: true, mismatches: [] });
  });

  it("bounds persisted model-derived diagnostics so malformed output cannot unbound the next prompt", { timeout: 180000 }, async () => {
    const hugeKey = "x".repeat(5000);
    const { fake, apiUrl, created } = await startInvestigation((fb, call) =>
      call === 1 ? { [hugeKey]: 1, ...finish("baseline") } : finish("baseline"),
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("COMPLETED");
    const report = done["report"] as InvestigationReport;
    expect(report.requests[0]?.status).toBe("invalid-action");
    const rejected = report.trace.find((t) => t.status === "rejected");
    expect((rejected?.reason ?? "").length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(report)).not.toContain("x".repeat(200));
    // The next request's prompt stayed bounded despite the 5000-char key.
    const secondBody = JSON.stringify((fake.requests[1] as CapturedRequest).bodyJson);
    expect(secondBody.length).toBeLessThan(20000);
    expect(verifyInvestigationExport(report).ok).toBe(true);
  });

  it("enforces exact caps: at most 3 experiments and 4 total requests, then labeled fallback", { timeout: 180000 }, async () => {
    const values = [1000, 2000, 3000, 4000];
    const { fake, apiUrl, created } = await startInvestigation((fb, call) => runExp({ dispatchDurationMs: values[call - 1] ?? 5000 }));
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("COMPLETED");
    expect(done["outcome"]).toBe("deterministic-fallback-requests-exhausted");
    expect(fake.requestCount()).toBe(4);
    const report = done["report"] as InvestigationReport;
    expect(report.requestCount).toBe(4);
    expect(report.experimentCount).toBe(3);
    expect(report.comparison?.candidates).toHaveLength(4); // baseline + 3
    expect(report.recommendation?.source).toBe("deterministic-fallback");
    expect(report.recommendation?.candidateId).toBe(report.comparison?.selectedCandidateId);
    expect(report.trace.some((t) => t.status === "rejected" && (t.reason ?? "").includes("experiment cap"))).toBe(true);
    expect(verifyInvestigationExport(report).ok).toBe(true);
  });

  it("keeps a no-improvement experiment visible and does not hide that baseline wins", { timeout: 180000 }, async () => {
    const { apiUrl, created } = await startInvestigation((fb, call) =>
      call === 1 ? runExp({ dispatchDurationMs: 300000 }) : finish("baseline"),
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    const report = done["report"] as InvestigationReport;
    expect(report.comparison?.rankedCandidateIds).toEqual(["baseline", "exp-1"]);
    const exp1 = report.comparison?.candidates.find((c) => c.candidateId === "exp-1");
    expect((exp1?.makespanMs ?? 0)).toBeGreaterThan(502400);
    expect(report.recommendation?.candidateId).toBe("baseline");
    expect(report.recommendation?.improvedOverBaseline).toBe(false);
    expect(report.recommendation?.explanation).toContain("No measured improvement");
  });

  it("rejects duplicate and no-change patches without rerunning them", { timeout: 180000 }, async () => {
    const { fake, apiUrl, created } = await startInvestigation((fb, call) =>
      call === 1 ? runExp({}) : call === 2 ? runExp({ dispatchDurationMs: 1000 }) : call === 3 ? runExp({ dispatchDurationMs: 1000 }) : finish("exp-1"),
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("COMPLETED");
    expect(fake.requestCount()).toBe(4);
    const report = done["report"] as InvestigationReport;
    expect(report.comparison?.candidates).toHaveLength(2);
    const reasons = report.trace.filter((t) => t.status === "rejected").map((t) => t.reason ?? "").join(" ");
    expect(reasons).toContain("duplicates the baseline");
    expect(reasons).toContain("duplicate patch already measured as exp-1");
    expect(report.recommendation?.candidateId).toBe("exp-1");
  });
});

  it("keeps model-selected and deterministic best distinct when the model picks a worse valid candidate", { timeout: 180000 }, async () => {
    const { apiUrl, created } = await startInvestigation((fb, call) =>
      call === 1 ? runExp({ dispatchDurationMs: 300000 }) : finish("exp-1"),
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    const report = done["report"] as InvestigationReport;
    expect(report.recommendation?.source).toBe("model");
    expect(report.recommendation?.candidateId).toBe("exp-1");
    expect(report.recommendation?.modelSelectedCandidateId).toBe("exp-1");
    expect(report.recommendation?.deterministicBestCandidateId).toBe("baseline");
    expect(report.recommendation?.improvedOverBaseline).toBe(false);
    expect(verifyInvestigationExport(report).ok).toBe(true);
  });

  it("geometrically invalid scenario is rejected locally with zero provider calls", { timeout: 60000 }, async () => {
    const body = burstBody();
    const scenario = body["scenario"] as { mobileUnits: Record<string, unknown>[] };
    const picker = scenario.mobileUnits.find((u) => u["role"] === "picker") as Record<string, unknown>;
    scenario.mobileUnits.push({ ...structuredClone(picker), id: `${picker["id"] as string}-overlap` });
    const { fake, created } = await startInvestigation(() => finish("baseline"), { body });
    // Rejected by local validation before any claim or dispatch: the model
    // is never called for an input whose baseline cannot be established.
    expect(created.status).toBe(400);
    expect(fake.requestCount()).toBe(0);
  });

describe("strict investigation verifier", () => {
  it("accepts genuine generated reports and rejects the independent tamper matrix", { timeout: 300000 }, async () => {
    const { apiUrl, created } = await startInvestigation((fb) =>
      fb.results.some((r) => r.candidateId === "exp-1") ? finish("exp-1") : runExp({ dispatchDurationMs: 1000 }),
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    const report = done["report"] as InvestigationReport;
    expect(verifyInvestigationExport(report)).toEqual({ ok: true, mismatches: [] });

    const rejectCases: [string, (r: InvestigationReport) => void, string][] = [
      ["valid-but-different input stock", (r) => { (r.input.scenario.initialStock[0] as { quantity: number }).quantity -= 1; }, "input scenario differs"],
      ["different executionConfig", (r) => { r.input.executionConfig.pickDurationMsPerItem += 1000; }, "executionConfig differs"],
      ["trace requestIndex 999", (r) => { (r.trace.find((t) => t.kind === "experiment") as { requestIndex: number }).requestIndex = 999; }, "does not reference a recorded request"],
      ["fabricated trace shipped", (r) => { (r.trace.find((t) => t.kind === "experiment") as { shipped: number }).shipped = 999; }, "measurements differ"],
      ["declared limit below actual", (r) => { r.limits.maxModelRequests = 1; }, "exceed declared"],
      ["fabricated outer engine version", (r) => { r.versions.operationsEngine = "invented"; }, "versions.operationsEngine"],
      ["deleted proposal+experiment trace", (r) => { r.trace = r.trace.filter((t) => t.kind !== "experiment" && t.kind !== "proposal"); }, "experiment trace"],
      ["trace seq broken", (r) => { (r.trace[1] as { seq: number }).seq = 42; }, "seq"],
      ["missing envelope field", (r) => { delete (r as unknown as Record<string, unknown>)["seed"]; }, "envelope keys"],
    ];
    for (const [name, mutate, needle] of rejectCases) {
      const tampered = structuredClone(report);
      mutate(tampered);
      const result = verifyInvestigationExport(tampered);
      expect(result.ok, name).toBe(false);
      expect(result.mismatches.join(" "), name).toContain(needle);
    }

    // A rejected finish referencing an unknown id, inserted as retained
    // evidence with correct chronological seq/request links, is allowed.
    const withRejected = structuredClone(report);
    const rejectedEntry = {
      seq: 0, kind: "finish" as const, requestIndex: 1, candidateId: "fabricated-id", patch: null,
      hypothesis: null, hypothesisKind: null, status: "rejected",
      reason: "finish rejected: candidateId fabricated-id does not exist (fabricated or unknown id)",
      shipped: null, makespanMs: null, totalWaitMs: null, backlog: null,
    };
    withRejected.trace = [withRejected.trace[0] as never, rejectedEntry as never, ...withRejected.trace.slice(1)]
      .map((t, i) => ({ ...(t as object), seq: i + 1 })) as InvestigationReport["trace"];
    expect(verifyInvestigationExport(withRejected)).toEqual({ ok: true, mismatches: [] });
  });

  it("verifies a genuinely generated rejected-then-finished report (store-level replay)", { timeout: 180000 }, async () => {
    const config = loadConfig({
      MODEL_API_KEY: FAKE_KEY,
      META_API_BASE_URL: "http://127.0.0.1:9/v1",
      META_MODEL_ID: FAKE_MODEL,
      BUDGET_STATE_FILE: "",
    });
    const store = new InvestigationStore(config);
    const record = store.create(parseInvestigationInput(burstBody()), null);
    let calls = 0;
    store.start(record, (async () => {
      calls++;
      return metaResponse(calls === 1 ? finish("not-a-real-run") : finish("baseline"));
    }) as unknown as FetchLike);
    const deadline = Date.now() + 60000;
    while (record.state === "RUNNING") {
      if (Date.now() > deadline) throw new Error("store investigation did not terminate");
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(record.state).toBe("COMPLETED");
    expect(calls).toBe(2);
    const report = store.buildReport(record);
    expect(report.trace.some((t) => t.kind === "finish" && t.status === "rejected" && t.candidateId === "not-a-real-run")).toBe(true);
    expect(verifyInvestigationExport(report)).toEqual({ ok: true, mismatches: [] });
  });
});

describe("budget claim lifecycle for investigations", () => {
  it("guard loss between tool calls blocks the next dispatch and preserves the claim", { timeout: 180000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-inv-guard-"));
    const ledger = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: ledger, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: ledger, capUsd: 1 });
    let beforeCorrupt = "";
    const { fake, apiUrl, created } = await startInvestigation(
      (fb, call) => (call === 1 ? runExp({ dispatchDurationMs: 1000 }) : finish("exp-1")),
      { guard, handlerOpts: { onCall: (call) => { if (call === 1 && beforeCorrupt === "") { beforeCorrupt = readFileSync(ledger, "utf8"); writeFileSync(ledger, "{corrupt", "utf8"); } } } },
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("FAILED");
    expect(fake.requestCount()).toBe(1); // second dispatch never happened
    const report = done["report"] as InvestigationReport;
    expect(report.requestCount).toBe(1);
    expect(report.requests.some((r) => r.status === "guard-refused")).toBe(true);
    // Claim preserved, never refunded: restoring the ledger shows the
    // investigation entry still held, then settled as committed (1 dispatch).
    writeFileSync(ledger, beforeCorrupt, "utf8");
    const held = guard.snapshot().entries.find((e) => e.id.startsWith("investigation:"));
    expect(held?.state).toBe("reserved");
    await getJson(`${apiUrl}/api/operations/investigations/${created.json["runId"]}`);
    const settled = guard.snapshot();
    expect(settled.committedMicroUsd).toBe(250000);
    expect(settled.reservedMicroUsd).toBe(0);
  });

  it("last reserved claim finishes with available 0 and commits once", { timeout: 180000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-inv-last-"));
    const ledger = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: ledger, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: ledger, capUsd: 1 });
    guard.reserve("pre-existing", 0.75);
    guard.commit("pre-existing");
    expect(guard.snapshot().availableMicroUsd).toBe(250000);
    const { apiUrl, created } = await startInvestigation(
      (fb) => (fb.results.some((r) => r.candidateId === "exp-1") ? finish("exp-1") : runExp({ dispatchDurationMs: 1000 })),
      { guard },
    );
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("COMPLETED");
    const snap = guard.snapshot();
    expect(snap.availableMicroUsd).toBe(0);
    expect(snap.committedMicroUsd).toBe(1000000);
    expect(snap.entries.filter((e) => e.id.startsWith("investigation:"))).toHaveLength(1);
  });

  it("cancel after dispatch never refunds the claim", { timeout: 180000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-inv-cancel-"));
    const ledger = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: ledger, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: ledger, capUsd: 1 });
    const { fake, apiUrl, created } = await startInvestigation(() => runExp({ dispatchDurationMs: 1000 }), {
      guard,
      handlerOpts: { delayMs: 1500 },
    });
    const id = created.json["runId"] as string;
    while (fake.requestCount() < 1) await new Promise((r) => setTimeout(r, 10));
    const cancelled = await post(`${apiUrl}/api/operations/investigations/${id}/cancel`, {});
    expect(cancelled.json["state"]).toBe("CANCELLED");
    await getJson(`${apiUrl}/api/operations/investigations/${id}`); // settle
    const snap = guard.snapshot();
    expect(snap.committedMicroUsd).toBe(250000);
    expect(snap.reservedMicroUsd).toBe(0);
    expect(fake.requestCount()).toBe(1);
    // The cancelled report still verifies offline (partial evidence kept).
    const cancelledReport = (await getJson(`${apiUrl}/api/operations/investigations/${id}/report`)) as unknown as InvestigationReport;
    expect(cancelledReport.state).toBe("CANCELLED");
    expect(verifyInvestigationExport(cancelledReport)).toEqual({ ok: true, mismatches: [] });
  });

  it("timeout after dispatch never refunds the claim", { timeout: 180000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "layoutlab-inv-timeout-"));
    const ledger = join(dir, "budget.json");
    initializeBudgetLedger({ filePath: ledger, capUsd: 1 });
    const guard = createBudgetGuard({ filePath: ledger, capUsd: 1 });
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(feedbackHandler(() => runExp({ dispatchDurationMs: 1000 }), { delayMs: 8000 }));
    const apiUrl = await startApi(fakeConfig(fake, { RUN_TIMEOUT_MS: "2500" }), guard);
    const created = await post(`${apiUrl}/api/operations/investigations`, burstBody());
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("TIMED_OUT");
    await getJson(`${apiUrl}/api/operations/investigations/${created.json["runId"]}`);
    const snap = guard.snapshot();
    expect(snap.committedMicroUsd).toBe(250000);
    expect(snap.reservedMicroUsd).toBe(0);
    const timedOutReport = (await getJson(`${apiUrl}/api/operations/investigations/${created.json["runId"]}/report`)) as unknown as InvestigationReport;
    expect(verifyInvestigationExport(timedOutReport)).toEqual({ ok: true, mismatches: [] });
  });
});

describe("preflight and concurrency", () => {
  it("no key and invalid inputs make zero provider calls", { timeout: 60000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(feedbackHandler(() => finish("baseline")));
    const noKeyUrl = await startApi(fakeConfig(fake, { MODEL_API_KEY: "" }));
    const noKey = await post(`${noKeyUrl}/api/operations/investigations`, burstBody());
    expect(noKey.status).toBe(503);
    const apiUrl = await startApi(fakeConfig(fake));
    for (const body of [
      burstBody({ question: "" }),
      burstBody({ question: "x".repeat(2001) }),
      burstBody({ consent: false }),
      burstBody({ mode: "fixture" }),
      burstBody({ interventionPolicy: { allowedFields: ["teleport"] } }),
      burstBody({ safetyCeilingMs: 0 }),
      burstBody({ scenario: {} }),
      { ...burstBody(), surprise: true },
    ]) {
      const res = await post(`${apiUrl}/api/operations/investigations`, body);
      expect(res.status).toBe(400);
    }
    expect(fake.requestCount()).toBe(0);
  });

  it("one active investigation blocks other investigations and legacy paid routes", { timeout: 180000 }, async () => {
    const fake = await startFakeMeta();
    closers.push(fake.close);
    fake.setHandler(feedbackHandler(() => finish("baseline"), { delayMs: 1200 }));
    const apiUrl = await startApi(fakeConfig(fake));
    const created = await post(`${apiUrl}/api/operations/investigations`, burstBody());
    expect(created.status).toBe(202);
    const second = await post(`${apiUrl}/api/operations/investigations`, burstBody());
    expect(second.status).toBe(429);
    const legacyScenario = JSON.parse(readFileSync(new URL("../../../fixtures/sample/warehouse-basic.json", import.meta.url), "utf8")) as unknown;
    const legacy = await post(`${apiUrl}/api/runs`, { scenario: legacyScenario, requestText: "go", mode: "live", consent: true });
    expect(legacy.status).toBe(429);
    const proposal = await post(`${apiUrl}/api/operations/proposals`, { observation: "dispatch is slow" });
    expect(proposal.status).toBe(429);
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("COMPLETED");
    expect(fake.requestCount()).toBe(1);
  });
});

// Shared paid-inference lease: an injected transport that tracks the real
// in-flight peak across EVERY paid route (one-shot, investigation, legacy).
function metaResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-fixture",
      object: "chat.completion",
      created: 0,
      model: FAKE_MODEL,
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function gatedFetch(legacyRevision: number) {
  const state = { active: 0, peak: 0, calls: 0 };
  let gate: Promise<void> | null = null;
  let open: (() => void) | null = null;
  const contentFor = (name: string): unknown => {
    if (name === "operations_patch") return { ...NULLS };
    if (name === "operations_investigation_action") return finish("baseline");
    if (name === "planning_requirements") {
      return { objective: "minimize_weighted_picking_travel", maxRelocatedProducts: 4, lockedProductIds: [], assumptions: [], unresolvedQuestions: [] };
    }
    return { scenarioRevision: legacyRevision, changes: [], rationale: "keep baseline" };
  };
  const fetchImpl = (async (_url: unknown, init?: { body?: string }) => {
    state.calls++;
    state.active++;
    state.peak = Math.max(state.peak, state.active);
    try {
      const pending = gate;
      if (pending) await pending;
      const body = JSON.parse(init?.body ?? "{}") as { response_format?: { json_schema?: { name?: string } } };
      return metaResponse(contentFor(body.response_format?.json_schema?.name ?? ""));
    } finally {
      state.active--;
    }
  }) as unknown as FetchLike;
  return {
    state,
    fetchImpl,
    holdNext: (): void => { gate = new Promise<void>((r) => { open = r; }); },
    release: (): void => { open?.(); gate = null; open = null; },
  };
}

function directConfig(overrides: Record<string, string> = {}): ApiConfig {
  return loadConfig({
    MODEL_API_KEY: FAKE_KEY,
    META_API_BASE_URL: "http://127.0.0.1:9/v1",
    META_MODEL_ID: FAKE_MODEL,
    BUDGET_STATE_FILE: "",
    API_CONCURRENCY: "1",
    ...overrides,
  });
}

async function startDirectApi(fetchImpl: FetchLike, config: ApiConfig = directConfig()) {
  const { app } = createApp({ config, fetchImpl });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${port}`;
}

async function waitFor(cond: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 30000;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("shared paid-inference lease (peak must stay 1)", () => {
  it("one-shot in-flight blocks investigation, legacy create, and a second one-shot", { timeout: 180000 }, async () => {
    const legacyScenario = JSON.parse(readFileSync(new URL("../../../fixtures/sample/warehouse-basic.json", import.meta.url), "utf8")) as { revision: number };
    const gated = gatedFetch(legacyScenario.revision);
    const apiUrl = await startDirectApi(gated.fetchImpl);
    closers.push(async () => gated.release());
    gated.holdNext();
    const oneShot = post(`${apiUrl}/api/operations/proposals`, { observation: "synthetic held request" });
    await waitFor(() => gated.state.calls === 1, "one-shot dispatch");
    const inv = await post(`${apiUrl}/api/operations/investigations`, burstBody());
    expect(inv.status).toBe(429);
    const legacy = await post(`${apiUrl}/api/runs`, { scenario: legacyScenario, requestText: "go", mode: "live", consent: true });
    expect(legacy.status).toBe(429);
    const second = await post(`${apiUrl}/api/operations/proposals`, { observation: "second one-shot" });
    expect(second.status).toBe(429);
    gated.release();
    const first = await oneShot;
    expect(first.status).toBe(200);
    expect(gated.state.peak).toBe(1);
    // Lease released on completion: a new investigation may now run.
    const created = await post(`${apiUrl}/api/operations/investigations`, burstBody());
    expect(created.status).toBe(202);
    const done = await pollTerminal(apiUrl, created.json["runId"] as string);
    expect(done["state"]).toBe("COMPLETED");
    expect(gated.state.peak).toBe(1);
  });

  it("legacy interpretation in-flight blocks one-shot and investigation; investigation blocks legacy approve until terminal", { timeout: 180000 }, async () => {
    const legacyScenario = JSON.parse(readFileSync(new URL("../../../fixtures/sample/warehouse-basic.json", import.meta.url), "utf8")) as { revision: number };
    const gated = gatedFetch(legacyScenario.revision);
    const apiUrl = await startDirectApi(gated.fetchImpl);
    closers.push(async () => gated.release());
    gated.holdNext();
    const created = await post(`${apiUrl}/api/runs`, { scenario: legacyScenario, requestText: "reduce travel", mode: "live", consent: true });
    expect(created.status).toBe(202);
    const runId = created.json["runId"] as string;
    await waitFor(() => gated.state.calls === 1, "legacy interpretation dispatch");
    const oneShot = await post(`${apiUrl}/api/operations/proposals`, { observation: "while legacy runs" });
    expect(oneShot.status).toBe(429);
    const inv = await post(`${apiUrl}/api/operations/investigations`, burstBody());
    expect(inv.status).toBe(429);
    gated.release();
    let run = await getJson(`${apiUrl}/api/runs/${runId}`);
    const deadline = Date.now() + 60000;
    while (run["state"] !== "AWAITING_APPROVAL") {
      if (Date.now() > deadline) throw new Error(`legacy run stuck at ${String(run["state"])}`);
      await new Promise((r) => setTimeout(r, 25));
      run = await getJson(`${apiUrl}/api/runs/${runId}`);
    }
    // Start an investigation and hold its first dispatch: approve must wait.
    gated.holdNext();
    const invCreated = await post(`${apiUrl}/api/operations/investigations`, burstBody());
    expect(invCreated.status).toBe(202);
    await waitFor(() => gated.state.active === 1, "investigation dispatch");
    const approve = await post(`${apiUrl}/api/runs/${runId}/approve`, { requirements: run["requirementsDraft"] });
    expect(approve.status).toBe(429);
    gated.release();
    const invDone = await pollTerminal(apiUrl, invCreated.json["runId"] as string);
    expect(invDone["state"]).toBe("COMPLETED");
    // Lease free again: the same approval now proceeds to completion.
    const approved = await post(`${apiUrl}/api/runs/${runId}/approve`, { requirements: run["requirementsDraft"] });
    expect(approved.status).toBe(200);
    expect(approved.json["state"]).toBe("COMPLETED");
    expect(gated.state.peak).toBe(1);
  });
});
