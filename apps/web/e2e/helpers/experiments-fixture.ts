// Experiments live-fixture harness (E4b): LOCAL fake Meta transport whose
// answers depend on the actual engine feedback, plus the real API server on
// the loopback port the Vite dev server proxies (/api -> 127.0.0.1:3001).
// providerKind stays "fixture" with realMetaRequests 0; zero paid calls.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../../api/dist/server.js";
import { loadConfig } from "../../../api/dist/config.js";
import { createBudgetGuard, initializeBudgetLedger } from "../../../api/dist/budget-guard.js";

export const EXP_FIXTURE_PORT = 3001;
export const EXP_FIXTURE_KEY = "fixture-only-key-not-a-secret";
export const EXP_FIXTURE_MODEL = "fixture-investigation-model";

const NULLS = { extraPickers: null, extraPutaway: null, packingDurationMs: null, dispatchDurationMs: null, receivingDurationMs: null };
export function expRunExp(patch: Record<string, number>): Record<string, unknown> {
  return { action: "run_experiment", hypothesis: "fixture hypothesis (model assertion)", ...NULLS, ...patch, candidateId: null };
}
export function expFinish(candidateId: string): Record<string, unknown> {
  return { action: "finish", hypothesis: null, ...NULLS, candidateId };
}

export type ExpFeedback = {
  results: { candidateId: string; status: string; makespanMs: number | null }[];
  experimentsRemaining: number;
};

export type ExperimentsFixture = {
  transportRequests: () => number;
  stop: () => Promise<void>;
};

export async function startExperimentsFixture(opts: {
  decide: (feedback: ExpFeedback, call: number) => Record<string, unknown>;
  delayMs?: number;
  budgetCapUsd?: number;
  noKey?: boolean;
}): Promise<ExperimentsFixture> {
  let transportRequests = 0;
  let call = 0;
  const fake: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || !((req.url ?? "").endsWith("/chat/completions"))) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("fixture: only POST */chat/completions");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      transportRequests++;
      call++;
      let feedback: ExpFeedback = { results: [], experimentsRemaining: 3 };
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages?: { content?: string }[] };
        const user = body.messages?.[1]?.content ?? "";
        feedback = JSON.parse(user.slice(user.indexOf("{"), user.lastIndexOf("}") + 1)) as ExpFeedback;
      } catch {
        // Server still validates the returned action; a parse miss here only
        // affects which scripted answer the fake gives.
      }
      const respond = (): void => {
        if (res.destroyed || res.writableEnded) return;
        const content = JSON.stringify(opts.decide(feedback, call));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "chatcmpl-fixture",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: EXP_FIXTURE_MODEL,
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }));
      };
      if (opts.delayMs) setTimeout(respond, opts.delayMs);
      else respond();
    });
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const fakePort = (fake.address() as { port: number }).port;

  let budgetGuard: ReturnType<typeof createBudgetGuard> | undefined;
  let budgetStateFile = "";
  if (opts.budgetCapUsd !== undefined) {
    const ledger = join(mkdtempSync(join(tmpdir(), "layoutlab-e4b-e2e-")), "budget.json");
    initializeBudgetLedger({ filePath: ledger, capUsd: opts.budgetCapUsd });
    budgetGuard = createBudgetGuard({ filePath: ledger, capUsd: opts.budgetCapUsd });
    budgetStateFile = ledger;
  }
  const config = loadConfig({
    MODEL_API_KEY: opts.noKey ? "" : EXP_FIXTURE_KEY,
    META_API_BASE_URL: `http://127.0.0.1:${fakePort}/v1`,
    META_MODEL_ID: EXP_FIXTURE_MODEL,
    BUDGET_STATE_FILE: budgetStateFile,
    ...(opts.budgetCapUsd !== undefined ? { PUBLIC_BUDGET_USD: String(opts.budgetCapUsd) } : {}),
  });
  const { app } = createApp({ config, ...(budgetGuard ? { budgetGuard } : {}) });
  const api = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(EXP_FIXTURE_PORT, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  return {
    transportRequests: () => transportRequests,
    stop: async () => {
      await new Promise<void>((resolve) => api.close(() => resolve()));
      await new Promise<void>((resolve) => fake.close(() => resolve()));
    },
  };
}
