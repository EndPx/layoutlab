// Live-fixture harness for M3 browser acceptance (desktop only). Starts a
// LOCAL fake Meta transport plus the real API server on the loopback port
// the Vite dev server proxies (/api -> 127.0.0.1:3001). providerKind is
// "fixture" with realMetaRequests 0; never live Meta.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createApp } from "../../../api/dist/server.js";
import { loadConfig } from "../../../api/dist/config.js";

export const LIVE_FIXTURE_PORT = 3001;
export const LIVE_FIXTURE_KEY = "fixture-only-key-not-a-secret";

export type FixtureVariant = "default" | "fail-second" | "slow-interpret" | "questions";

function draftRequirements(unresolved: string[] = []): unknown {
  return {
    objective: "minimize_weighted_picking_travel",
    maxRelocatedProducts: 4,
    lockedProductIds: [],
    assumptions: ["browser fixture assumption"],
    unresolvedQuestions: unresolved,
  };
}

type Entry = { status: number; body: string; delayMs?: number };

function script(model: string, variant: FixtureVariant): Entry[] {
  const proposals: unknown[] = [
    draftRequirements(variant === "questions" ? ["Is cold-chain relocation allowed?"] : []),
    { scenarioRevision: 0, changes: [{ productId: "sku-b", locationId: "L6" }], rationale: "Live fixture: move sku-b near packing." },
    variant === "fail-second"
      ? null
      : { scenarioRevision: 0, changes: [{ productId: "ghost-sku", locationId: "L6" }], rationale: "Live fixture: unknown product (invalid, retained)." },
    { scenarioRevision: 0, changes: [{ productId: "sku-d", locationId: "L6" }], rationale: "Live fixture: move sku-d near packing." },
  ];
  return proposals.map((contentJson, i) => {
    if (contentJson === null) return { status: 500, body: "fixture: fail-second upstream error" };
    return {
      status: 200,
      body: JSON.stringify({
        id: "chatcmpl-browser-fixture",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(contentJson) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
      }),
      // Slow first response for the reset-race test only.
      delayMs: variant === "slow-interpret" && i === 0 ? 2500 : 0,
    };
  });
}

export type LiveFixture = {
  transportRequests: () => number;
  stop: () => Promise<void>;
};

export async function startLiveFixture(modelId: string, variant: FixtureVariant = "default"): Promise<LiveFixture> {
  const entries = script(modelId, variant);
  let served = 0;
  let transportRequests = 0;
  const fake: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || !((req.url ?? "").endsWith("/chat/completions"))) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("fixture: only POST */chat/completions");
      return;
    }
    req.resume();
    req.on("end", () => {
      transportRequests++;
      const entry = entries[Math.min(served, entries.length - 1)] as Entry;
      served++;
      const respond = (): void => {
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(entry.status, { "Content-Type": "application/json" });
        res.end(entry.body);
      };
      if (entry.delayMs) {
        // Client-gone detection via response close only (raw close fires for
        // healthy requests on Node 24 after the body is read).
        let clientGone = false;
        const onResClose = (): void => {
          if (!res.writableEnded) clientGone = true;
        };
        res.on("close", onResClose);
        setTimeout(() => {
          res.off("close", onResClose);
          if (!clientGone && !req.aborted) respond();
        }, entry.delayMs);
        return;
      }
      respond();
    });
  });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const fakePort = (fake.address() as { port: number }).port;
  const config = loadConfig({
    ...process.env,
    META_API_BASE_URL: `http://127.0.0.1:${fakePort}/v1`,
    META_MODEL_ID: modelId,
    MODEL_API_KEY: LIVE_FIXTURE_KEY,
  });
  const { app } = createApp({ config });
  const api = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(LIVE_FIXTURE_PORT, "127.0.0.1", () => resolve(s));
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
