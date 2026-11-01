// M3 server configuration. All values come from server env only; nothing here
// is sent to the browser except non-secret status (base URL, model id,
// budgets). The key is never logged or serialized.
import { readFileSync } from "node:fs";

export const API_VERSION = "0.3.0";
export const BRIEF_MAX_PROPOSALS = 3;
export const BRIEF_MAX_REQUESTS = 4;
export const BRIEF_MAX_TIMEOUT_MS = 120000;
export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_MODEL_ID = "muse-spark-1.3";

export type ProviderKind = "meta" | "fixture" | "unsupported";

export type ApiConfig = {
  baseUrl: string;
  modelId: string;
  apiKey: string;
  apiKeyPresent: boolean;
  providerKind: ProviderKind;
  maxProposals: number;
  maxRequests: number;
  timeoutMs: number;
  host: string;
  port: number;
  concurrency: number;
  rateMax: number;
  rateWindowMs: number;
  maxRuns: number;
  maxCompletionTokens: number;
  maxResponseBytes: number;
  maxContextChars: number;
};

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const baseUrl = (env["META_API_BASE_URL"] ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const modelId = (env["META_MODEL_ID"] ?? DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;
  const apiKey = env["MODEL_API_KEY"] ?? "";
  // Brief caps win regardless of env overrides (upper clamp only; lower is allowed).
  const maxProposals = clampInt(env["MAX_PROPOSALS_PER_RUN"], 3, 0, BRIEF_MAX_PROPOSALS);
  const maxRequests = clampInt(env["MAX_MODEL_REQUESTS_PER_RUN"], 4, 0, BRIEF_MAX_REQUESTS);
  const timeoutMs = clampInt(env["RUN_TIMEOUT_MS"], BRIEF_MAX_TIMEOUT_MS, 1, BRIEF_MAX_TIMEOUT_MS);
  const host = (env["API_HOST"] ?? "127.0.0.1").trim() || "127.0.0.1";
  const port = clampInt(env["API_PORT"], 3001, 1, 65535);
  const concurrency = clampInt(env["API_CONCURRENCY"], 1, 1, 64);
  const rateMax = clampInt(env["API_RATE_MAX"], 60, 1, 100000);
  const rateWindowMs = clampInt(env["API_RATE_WINDOW_MS"], 60000, 1000, 3600000);
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  return {
    baseUrl: trimmedBase,
    modelId,
    apiKey,
    apiKeyPresent: apiKey.length > 0,
    providerKind: deriveProviderKind(trimmedBase),
    maxProposals,
    maxRequests,
    timeoutMs,
    host,
    port,
    concurrency,
    rateMax,
    rateWindowMs,
    maxRuns: 50,
    maxCompletionTokens: 2000,
    maxResponseBytes: 65536,
    maxContextChars: 20000,
  };
}

// Server-owned transport classification. Only the official Meta base URL
// may claim Meta inference; loopback is the local fake transport (fixture
// evidence, realMetaRequests 0); anything else is unsupported and refused
// inference (no false Meta claims for unrelated remote endpoints).
export const OFFICIAL_META_BASE = "https://api.meta.ai/v1";

export function deriveProviderKind(baseUrl: string): ProviderKind {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return "unsupported";
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return "fixture";
  if (url.protocol === "https:" && host === "api.meta.ai" && (url.pathname === "/v1" || url.pathname === "/v1/")) {
    return "meta";
  }
  return "unsupported";
}

// Minimal .env loader (server only, no dependency): KEY=VALUE lines, #
// comments and blanks ignored, single/double quotes stripped. Only fills
// variables absent from target — any defined value wins, including an
// explicit empty string — so fake tests passing explicit values never
// inherit the file. Missing file is fine (setup_required downstream).
// Never logs or returns values. (node:util parseEnv is newer than the
// documented Node >= 20 floor, so this stays dependency-free and portable.)
export function loadEnvFileInto(target: NodeJS.ProcessEnv, filePath: string): void {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    // ANY defined override wins, including an explicit empty string: an
    // operator clearing MODEL_API_KEY="" must not inherit the file's key.
    if (target[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (value === "") {
      target[key] = "";
      continue;
    }
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    target[key] = value;
  }
}

export function liveAvailable(config: ApiConfig): { ok: boolean; reason: string | null } {
  if (!config.apiKeyPresent) return { ok: false, reason: "MODEL_API_KEY is not configured on the server." };
  if (!config.baseUrl) return { ok: false, reason: "META_API_BASE_URL is empty." };
  if (!config.modelId) return { ok: false, reason: "META_MODEL_ID is empty." };
  if (config.providerKind === "unsupported") {
    return {
      ok: false,
      reason: `Unsupported META_API_BASE_URL (expected ${OFFICIAL_META_BASE} or a loopback fixture URL).`,
    };
  }
  return { ok: true, reason: null };
}

// Redact key material from any error/message before sending to browser or logs.
export function sanitizeMessage(message: string, config: ApiConfig): string {
  let out = message;
  if (config.apiKey && out.includes(config.apiKey)) {
    out = out.split(config.apiKey).join("[REDACTED]");
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*"?/gi, "Bearer [REDACTED]");
  out = out.replace(/(MODEL_API_KEY\s*[:=]\s*["']?)[^"'\s]+/gi, "$1[REDACTED]");
  out = out.replace(/(Authorization["']?\s*[:=]\s*["']?)[^"'\n}]+/gi, "$1[REDACTED]");
  return out.slice(0, 2000);
}
