// Local fake Meta Chat Completions transport for M3 tests. It speaks the
// Meta-compatible request shape but is NOT live Meta: evidence records
// providerKind "fixture" with realMetaRequests 0 plus transport requestCount.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type CapturedRequest = {
  method: string;
  path: string;
  authorizationPresent: boolean;
  authorizationScheme: string | null;
  bodyJson: Record<string, unknown>;
  rawBytes: number;
};

export type FakeHandler = (
  req: CapturedRequest,
  res: ServerResponse,
  raw: IncomingMessage,
) => void | Promise<void>;

export type FakeMeta = {
  baseUrl: string;
  requests: CapturedRequest[];
  requestCount: () => number;
  setHandler: (h: FakeHandler) => void;
  close: () => Promise<void>;
};

function chatCompletionBody(model: string, content: string, usage: Record<string, number | null> | null): string {
  return JSON.stringify({
    id: "chatcmpl-fixture",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    ...(usage === null ? {} : { usage: { prompt_tokens: usage["p"], completion_tokens: usage["c"], total_tokens: usage["t"] } }),
  });
}

/** Scripted responder: each entry answers one request in order. */
export type ScriptEntry =
  | { kind: "ok"; contentJson: unknown; usage?: { p: number; c: number; t: number } | null; delayMs?: number }
  | { kind: "raw"; content: string; usage?: { p: number; c: number; t: number } | null; delayMs?: number }
  | { kind: "error"; status: number; body: string; delayMs?: number };

export function scriptHandler(entries: ScriptEntry[], model: string): FakeHandler {
  let index = 0;
  return async (_req, res, raw) => {
    const entry = entries[Math.min(index, entries.length - 1)] as ScriptEntry;
    index++;
    if (entry.delayMs) {
      // Client-gone detection must NOT use raw close/destroyed: on Node 24
      // those fire for healthy requests after the body is read. Only the
      // response closing while unwritten (socket disconnect) or req.aborted
      // proves the client is gone.
      let clientGone = false;
      const onResClose = (): void => {
        if (!res.writableEnded) clientGone = true;
      };
      res.on("close", onResClose);
      await new Promise<void>((resolve) => setTimeout(resolve, entry.delayMs));
      res.off("close", onResClose);
      if (clientGone || raw.aborted || res.destroyed || res.writableEnded) return;
    }
    if (entry.kind === "error") {
      res.writeHead(entry.status, { "Content-Type": "text/plain" });
      res.end(entry.body);
      return;
    }
    const content = entry.kind === "ok" ? JSON.stringify(entry.contentJson) : entry.content;
    const usage = entry.usage === undefined ? { p: 10, c: 5, t: 15 } : entry.usage;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(chatCompletionBody(model, content, usage));
  };
}

export async function startFakeMeta(): Promise<FakeMeta> {
  const requests: CapturedRequest[] = [];
  let handler: FakeHandler = async (_req, res) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("fake-meta: no handler configured");
  };
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || !((req.url ?? "").endsWith("/chat/completions"))) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("fake-meta: only POST */chat/completions");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let bodyJson: Record<string, unknown> = {};
      try {
        bodyJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("fake-meta: bad json");
        return;
      }
      const auth = req.headers["authorization"];
      const authValue = Array.isArray(auth) ? (auth[0] ?? "") : (auth ?? "");
      requests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        authorizationPresent: authValue.length > 0,
        authorizationScheme: authValue.split(" ")[0] || null,
        bodyJson,
        rawBytes: raw.length,
      });
      void Promise.resolve(handler(requests[requests.length - 1] as CapturedRequest, res, req)).catch(() => {
        if (!res.writableEnded) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("fake-meta handler failed");
        }
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    requestCount: () => requests.length,
    setHandler: (h: FakeHandler) => {
      handler = h;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}
