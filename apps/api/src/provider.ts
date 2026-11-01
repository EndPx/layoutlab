// Small replaceable Meta Chat Completions provider over native fetch.
// Automatic retries disabled: exactly one fetch per call; the caller counts
// the attempt before sending and never retries beyond the run budget.
import type { ApiConfig } from "./config.js";

export type ChatMessage = { role: "developer" | "user"; content: string };

export type StructuredCall = {
  schemaName: string;
  schema: unknown;
  developerInstruction: string;
  userContent: string;
};

export type ProviderUsage = { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };

export type ProviderResult = {
  jsonText: string;
  parsed: unknown;
  usage: ProviderUsage | null;
  responseBytes: number;
  durationMs: number;
  model: string;
};

export type FetchLike = typeof fetch;

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (body === null) {
    const err = new Error("Model response has an empty body.") as Error & { code?: string };
    err.code = "PARSE_ERROR";
    throw err;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        const err = new Error(
          `Model response exceeds byte bound (${bytes} > ${maxBytes}); discarded.`,
        ) as Error & { code?: string };
        err.code = "RESPONSE_TOO_LARGE";
        throw err;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function chatCompletionJson(
  config: ApiConfig,
  call: StructuredCall,
  signal: AbortSignal,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderResult> {
  const started = Date.now();
  const body = {
    model: config.modelId,
    messages: [
      { role: "developer", content: call.developerInstruction },
      { role: "user", content: call.userContent },
    ] satisfies ChatMessage[],
    response_format: {
      type: "json_schema",
      json_schema: { name: call.schemaName, schema: call.schema, strict: true },
    },
    max_completion_tokens: config.maxCompletionTokens,
    stream: false,
  };
  const serialized = JSON.stringify(body);
  // Context bound: refuse to send an oversized prompt instead of truncating silently.
  if (serialized.length > config.maxContextChars + 20000) {
    throw new Error(`Prompt exceeds context bound (${serialized.length} chars); refusing inference.`);
  }
  const url = `${config.baseUrl}/chat/completions`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: serialized,
      signal,
    });
  } catch (e) {
    if (signal.aborted) {
      const err = new Error("Model request aborted (cancelled or deadline).") as Error & { code?: string };
      err.code = "ABORTED";
      throw err;
    }
    throw e;
  }
  // Bounded streaming read: cumulative BYTE cap enforced while reading, so
  // an oversized response cannot balloon memory before the check. The
  // reader is cancelled on overflow; the deadline/cancel signal still wins.
  let text: string;
  try {
    text = await readBoundedText(res, config.maxResponseBytes);
  } catch (e) {
    if (signal.aborted) {
      const err = new Error("Model request aborted (cancelled or deadline).") as Error & { code?: string };
      err.code = "ABORTED";
      throw err;
    }
    throw e;
  }
  const durationMs = Date.now() - started;
  if (!res.ok) {
    // Never include headers/key in the error; sanitize at the boundary.
    const err = new Error(`Meta request failed: HTTP ${res.status} ${text.slice(0, 500)}`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = res.status === 401 || res.status === 403 ? "AUTH_FAILED" : "TRANSPORT_ERROR";
    err.status = res.status;
    throw err;
  }
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const err = new Error("Model response is not valid JSON.") as Error & { code?: string };
    err.code = "PARSE_ERROR";
    throw err;
  }
  const choices = envelope["choices"];
  const content =
    Array.isArray(choices) && choices.length > 0
      ? (choices[0] as Record<string, unknown>)["message"]
      : undefined;
  const jsonText = (content as Record<string, unknown> | undefined)?.["content"];
  if (typeof jsonText !== "string" || jsonText.length === 0) {
    const err = new Error("Model response has no message content.") as Error & { code?: string };
    err.code = "PARSE_ERROR";
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const err = new Error("Model content is not valid structured JSON.") as Error & { code?: string };
    err.code = "PARSE_ERROR";
    // Keep raw text length for accounting; caller records the failure.
    throw Object.assign(err, { jsonText });
  }
  const usageRaw = envelope["usage"] as Record<string, unknown> | undefined;
  const usage: ProviderUsage | null =
    usageRaw && typeof usageRaw === "object"
      ? {
          promptTokens: numOrNull(usageRaw["prompt_tokens"]),
          completionTokens: numOrNull(usageRaw["completion_tokens"]),
          totalTokens: numOrNull(usageRaw["total_tokens"]),
        }
      : null;
  const model = typeof envelope["model"] === "string" ? (envelope["model"] as string) : config.modelId;
  return { jsonText, parsed, usage, responseBytes: Buffer.byteLength(text, "utf8"), durationMs, model };
}
