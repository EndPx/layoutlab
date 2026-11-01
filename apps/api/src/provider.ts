// Small replaceable Meta Chat Completions provider over native fetch.
// Automatic retries disabled: exactly one fetch per call; the caller counts
// the attempt before sending and never retries beyond the run budget.
import { sanitizeMessage, type ApiConfig } from "./config.js";

export type ChatMessage = { role: "developer" | "user"; content: string };

export type StructuredCall = {
  schemaName: string;
  schema: unknown;
  developerInstruction: string;
  userContent: string;
};

export type ProviderUsage = { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };

// Generation settings are fixed by the server (never per-request options):
// Muse Spark always reasons, so reasoning is kept low for small
// token-bounded planning (verified: reasoning_effort "low" is supported on
// Chat Completions, "none" returns HTTP 400 for Spark). Recorded verbatim in
// run summaries and reports; prompt/config versions travel alongside.
export const REASONING_EFFORT = "low" as const;

export type GenerationSettings = {
  reasoningEffort: typeof REASONING_EFFORT;
  maxCompletionTokens: number;
};

export function generationSettingsOf(config: ApiConfig): GenerationSettings {
  return { reasoningEffort: REASONING_EFFORT, maxCompletionTokens: config.maxCompletionTokens };
}

// Concise sanitized envelope diagnostics. Carried on success AND attached to
// thrown errors when an envelope was parsed, so empty/nonconforming output
// retains validated usage, finish reason, and response id. Never carries
// message content or hidden reasoning.
export type ProviderDiagnostics = {
  responseId: string | null;
  finishReason: string | null;
  usage: ProviderUsage | null;
  durationMs: number;
  responseBytes: number;
  model: string;
};

export type ProviderResult = {
  jsonText: string;
  parsed: unknown;
  usage: ProviderUsage | null;
  responseBytes: number;
  durationMs: number;
  model: string;
  responseId: string | null;
  finishReason: string | null;
};

export type FetchLike = typeof fetch;

function numOrNull(v: unknown): number | null {
  // Token counts must be safe nonnegative integers; fractional, negative, or
  // overflowing values are invalid and stay explicitly missing (incomplete).
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

function strOrNull(v: unknown, maxLen = 128): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, maxLen) : null;
}

function usageOrNull(v: unknown): ProviderUsage | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Record<string, unknown>;
  if (raw["prompt_tokens"] === undefined && raw["completion_tokens"] === undefined && raw["total_tokens"] === undefined) {
    return null;
  }
  return {
    promptTokens: numOrNull(raw["prompt_tokens"]),
    completionTokens: numOrNull(raw["completion_tokens"]),
    totalTokens: numOrNull(raw["total_tokens"]),
  };
}

// Best-effort sanitized diagnostics from a parsed envelope. Every field is
// validated; malformed shapes yield explicit nulls, never throws or guesses.
function diagnosticsOf(
  envelope: Record<string, unknown>,
  durationMs: number,
  responseBytes: number,
  config: ApiConfig,
): ProviderDiagnostics {
  const choices = envelope["choices"];
  const first = Array.isArray(choices) && choices.length > 0 ? choices[0] : undefined;
  // Every diagnostic string is redacted: malformed upstream must not echo key
  // material or Authorization fragments into browser/report/log surfaces.
  const clean = (v: string | null): string | null =>
    v === null ? null : sanitizeMessage(v, config).slice(0, 128);
  return {
    responseId: clean(strOrNull(envelope["id"])),
    finishReason:
      typeof first === "object" && first !== null
        ? clean(strOrNull((first as Record<string, unknown>)["finish_reason"], 64))
        : null,
    usage: usageOrNull(envelope["usage"]),
    durationMs,
    responseBytes,
    model: clean(strOrNull(envelope["model"])) ?? config.modelId,
  };
}

function nullDiagnostics(durationMs: number, responseBytes: number, fallbackModel: string): ProviderDiagnostics {
  return { responseId: null, finishReason: null, usage: null, durationMs, responseBytes, model: fallbackModel };
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
    reasoning_effort: REASONING_EFFORT,
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
  const responseBytes = Buffer.byteLength(text, "utf8");
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const err = new Error("Model response is not valid JSON.") as Error & {
      code?: string;
      diagnostics?: ProviderDiagnostics;
    };
    err.code = "PARSE_ERROR";
    err.diagnostics = nullDiagnostics(durationMs, responseBytes, config.modelId);
    throw err;
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    const err = new Error("Model response envelope is malformed.") as Error & {
      code?: string;
      diagnostics?: ProviderDiagnostics;
    };
    err.code = "PARSE_ERROR";
    err.diagnostics = nullDiagnostics(durationMs, responseBytes, config.modelId);
    throw err;
  }
  const diag = diagnosticsOf(envelope, durationMs, responseBytes, config);
  // Validate choice/message shape before dereferencing: choices:[null] or a
  // non-object message must throw a typed PARSE_ERROR with diagnostics, not
  // a TypeError that loses available usage/finish metadata.
  const choices = envelope["choices"];
  const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0] : undefined;
  const message =
    typeof firstChoice === "object" && firstChoice !== null
      ? ((firstChoice as Record<string, unknown>)["message"] as Record<string, unknown> | undefined)
      : undefined;
  const jsonText =
    typeof message === "object" && message !== null ? message["content"] : undefined;
  if (typeof jsonText !== "string" || jsonText.length === 0) {
    // Empty/nonconforming output keeps validated envelope metadata: the M3
    // smoke lost usage/finish diagnostics for two such responses, and their
    // cause remains unknown. Never invent the missing content.
    const err = new Error("Model response has no message content.") as Error & {
      code?: string;
      diagnostics?: ProviderDiagnostics;
    };
    err.code = "PARSE_ERROR";
    err.diagnostics = diag;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const err = new Error("Model content is not valid structured JSON.") as Error & {
      code?: string;
      diagnostics?: ProviderDiagnostics;
    };
    err.code = "PARSE_ERROR";
    err.diagnostics = diag;
    // Keep raw text length for accounting; caller records the failure.
    throw Object.assign(err, { jsonText });
  }
  return {
    jsonText,
    parsed,
    usage: diag.usage,
    responseBytes,
    durationMs,
    model: diag.model,
    responseId: diag.responseId,
    finishReason: diag.finishReason,
  };
}
