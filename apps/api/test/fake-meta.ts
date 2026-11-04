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

const OPERATIONS_BOUNDS: Record<string, { minimum: number; maximum: number }> = {
  extraPickers: { minimum: 0, maximum: 2 },
  extraPutaway: { minimum: 0, maximum: 2 },
  packingDurationMs: { minimum: 1000, maximum: 300000 },
  dispatchDurationMs: { minimum: 1000, maximum: 300000 },
  receivingDurationMs: { minimum: 1000, maximum: 300000 },
};

// Inspect the actually-posted operations_patch schema like real Meta strict
// mode. Returns a Meta-style error message, or null when the wire schema is
// correct (non-operations schemas are not inspected). This reproduces the
// 2d24a72 HTTP 400 offline: missing `required` keys are reported by name.
export function operationsPatchSchemaError(bodyJson: Record<string, unknown>): string | null {
  const format = bodyJson["response_format"] as Record<string, unknown> | undefined;
  if (!format || format["type"] !== "json_schema") return null;
  const jsonSchema = format["json_schema"] as Record<string, unknown> | undefined;
  if (!jsonSchema || jsonSchema["name"] !== "operations_patch") return null;
  const schema = jsonSchema["schema"] as Record<string, unknown> | undefined;
  if (!schema || typeof schema !== "object") return "operations_patch schema is missing";
  if (schema["type"] !== "object") return "operations_patch schema type must be object";
  if (schema["additionalProperties"] !== false) return "operations_patch schema additionalProperties must be false";
  const properties = schema["properties"] as Record<string, unknown> | undefined;
  if (!properties || typeof properties !== "object") return "operations_patch schema properties are missing";
  const propKeys = Object.keys(properties).sort();
  const expected = Object.keys(OPERATIONS_BOUNDS).sort();
  if (JSON.stringify(propKeys) !== JSON.stringify(expected)) {
    return `operations_patch schema properties must be exactly ${expected.join(",")}`;
  }
  const required = schema["required"];
  if (!Array.isArray(required)) {
    return `'required' is required to be supplied and to be an array including every key in properties. Missing '${expected[0]}'.`;
  }
  for (const key of expected) {
    if (!required.includes(key)) {
      return `'required' is required to be supplied and to be an array including every key in properties. Missing '${key}'.`;
    }
  }
  if (required.length !== expected.length) return "operations_patch schema required must list every property exactly";
  for (const key of expected) {
    const prop = properties[key] as Record<string, unknown> | undefined;
    const types = prop?.["type"];
    const typeList = Array.isArray(types) ? [...types].sort() : [];
    if (JSON.stringify(typeList) !== JSON.stringify(["integer", "null"])) {
      return `operations_patch property ${key} must be integer-or-null`;
    }
    const bounds = OPERATIONS_BOUNDS[key] as { minimum: number; maximum: number };
    if (prop?.["minimum"] !== bounds.minimum || prop?.["maximum"] !== bounds.maximum) {
      return `operations_patch property ${key} bounds must be ${bounds.minimum}..${bounds.maximum}`;
    }
  }
  return null;
}

// Inspect the posted operations_investigation_action schema like real Meta
// strict mode: required must cover every property, patch fields stay
// integer-or-null with the operations bounds.
export function investigationActionSchemaError(bodyJson: Record<string, unknown>): string | null {
  const format = bodyJson["response_format"] as Record<string, unknown> | undefined;
  if (!format || format["type"] !== "json_schema") return null;
  const jsonSchema = format["json_schema"] as Record<string, unknown> | undefined;
  if (!jsonSchema || jsonSchema["name"] !== "operations_investigation_action") return null;
  const schema = jsonSchema["schema"] as Record<string, unknown> | undefined;
  if (!schema || typeof schema !== "object") return "operations_investigation_action schema is missing";
  if (schema["additionalProperties"] !== false) return "operations_investigation_action schema additionalProperties must be false";
  const properties = schema["properties"] as Record<string, unknown> | undefined;
  if (!properties || typeof properties !== "object") return "operations_investigation_action schema properties are missing";
  const expected = ["action", "hypothesis", "extraPickers", "extraPutaway", "packingDurationMs", "dispatchDurationMs", "receivingDurationMs", "candidateId"].sort();
  if (JSON.stringify(Object.keys(properties).sort()) !== JSON.stringify(expected)) {
    return `operations_investigation_action schema properties must be exactly ${expected.join(",")}`;
  }
  const required = schema["required"];
  if (!Array.isArray(required)) return `'required' is required to be supplied and to be an array including every key in properties. Missing '${expected[0]}'.`;
  for (const key of expected) {
    if (!required.includes(key)) return `'required' is required to be supplied and to be an array including every key in properties. Missing '${key}'.`;
  }
  for (const key of Object.keys(OPERATIONS_BOUNDS)) {
    const prop = properties[key] as Record<string, unknown> | undefined;
    const typeList = Array.isArray(prop?.["type"]) ? [...(prop["type"] as string[])].sort() : [];
    if (JSON.stringify(typeList) !== JSON.stringify(["integer", "null"])) return `property ${key} must be integer-or-null`;
    const bounds = OPERATIONS_BOUNDS[key] as { minimum: number; maximum: number };
    if (prop?.["minimum"] !== bounds.minimum || prop?.["maximum"] !== bounds.maximum) return `property ${key} bounds must be ${bounds.minimum}..${bounds.maximum}`;
  }
  return null;
}

/** Write one Meta-shaped chat completion envelope from a fake handler. */
export function respondChatCompletion(
  res: ServerResponse,
  model: string,
  contentJson: unknown,
  usage: { p: number; c: number; t: number } | null = { p: 10, c: 5, t: 15 },
): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(chatCompletionBody(model, JSON.stringify(contentJson), usage));
}

// Operations handler that inspects the posted schema before answering: a
// nonconforming schema gets the real Meta HTTP 400 envelope, never a canned
// success. Valid schemas fall through to the scripted entries.
export function inspectingOperationsHandler(entries: ScriptEntry[], model: string): FakeHandler {
  const inner = scriptHandler(entries, model);
  return async (req, res, raw) => {
    const message = operationsPatchSchemaError(req.bodyJson);
    if (message !== null) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: null, message, param: "schema", type: "invalid_request_error" } }));
      return;
    }
    await inner(req, res, raw);
  };
}

/** Scripted responder: each entry answers one request in order. */
export type ScriptEntry =
  | { kind: "ok"; contentJson: unknown; usage?: { p: number; c: number; t: number } | null; delayMs?: number }
  | { kind: "raw"; content: string; usage?: { p: number; c: number; t: number } | null; delayMs?: number }
  | { kind: "envelope"; envelopeJson: unknown; delayMs?: number }
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
    // Raw envelope: caller crafts the exact provider shape (null content,
    // malformed choices, real-shaped usage) for diagnostics tests.
    if (entry.kind === "envelope") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(entry.envelopeJson));
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
