// v3-M7 operations experimenter surface: bounded patch validation,
// controlled experiment runs over engine inputs, and one bounded Meta patch
// proposal per request. Proposals are validated by the simulation patch
// schema before anything runs; invalid model output is rejected, never
// executed. No key is ever read here beyond the server config.
import {
  parseOperationsPatch,
  parseOperationsScenario,
  runOperationsExperiment,
  type OperationsPatch,
} from "@layoutlab/simulation";
import { liveAvailable, type ApiConfig } from "./config.js";
import { chatCompletionJson, type FetchLike, type ProviderUsage } from "./provider.js";

export type ApiErrorLike = Error & { code?: string; status?: number };

function apiError(code: string, status: number, message: string): ApiErrorLike {
  return Object.assign(new Error(message), { code, status });
}

export function validatePatch(body: unknown): OperationsPatch {
  try {
    return parseOperationsPatch(body);
  } catch (e) {
    throw apiError("INVALID_PATCH", 400, e instanceof Error ? e.message : "invalid patch");
  }
}

export function runExperiment(body: {
  scenario?: unknown;
  executionConfig?: unknown;
  candidates?: unknown;
}): {
  schema: string;
  scenarioId: string;
  rankedCandidateIds: string[];
  candidates: {
    candidateId: string;
    patch: OperationsPatch;
    completionStage: string;
    shipped: number;
    backlog: number;
    stageBacklog: number;
    makespanMs: number | null;
    totalWaitMs: number;
  }[];
} {
  const raw = body as Record<string, unknown>;
  const candidatesRaw = raw["candidates"];
  if (!Array.isArray(candidatesRaw) || candidatesRaw.length === 0 || candidatesRaw.length > 8) {
    throw apiError("BAD_REQUEST", 400, "candidates must be a non-empty array of at most 8 entries");
  }
  const candidates = candidatesRaw.map((c) => {
    const entry = c as { candidateId?: unknown; patch?: unknown };
    if (typeof entry.candidateId !== "string" || entry.candidateId.length === 0) {
      throw apiError("BAD_REQUEST", 400, "each candidate needs a candidateId");
    }
    return { candidateId: entry.candidateId, patch: validatePatch(entry.patch ?? {}) };
  });
  let scenario;
  try {
    scenario = parseOperationsScenario(raw["scenario"]);
  } catch (e) {
    throw apiError("BAD_SCENARIO", 400, e instanceof Error ? e.message : "invalid scenario");
  }
  const executionConfig = raw["executionConfig"];
  if (!executionConfig || typeof executionConfig !== "object") {
    throw apiError("BAD_REQUEST", 400, "executionConfig is required");
  }
  try {
    const result = runOperationsExperiment({
      scenario,
      executionConfig: executionConfig as never,
      candidates,
    });
    return {
      schema: result.schema,
      scenarioId: result.scenarioId,
      rankedCandidateIds: result.rankedCandidateIds,
      candidates: result.candidates.map((c) => ({
        candidateId: c.candidateId,
        patch: c.patch,
        completionStage: c.completionStage,
        shipped: c.shipped,
        backlog: c.backlog,
        stageBacklog: c.stageBacklog,
        makespanMs: c.makespanMs,
        totalWaitMs: c.totalWaitMs,
      })),
    };
  } catch (e) {
    if ((e as ApiErrorLike).code) throw e;
    throw apiError("EXPERIMENT_FAILED", 400, e instanceof Error ? e.message : "experiment failed");
  }
}

const PATCH_KEYS = [
  "extraPickers",
  "extraPutaway",
  "packingDurationMs",
  "dispatchDurationMs",
  "receivingDurationMs",
] as const;

type PatchKey = (typeof PATCH_KEYS)[number];

const PATCH_BOUNDS: Record<PatchKey, { minimum: number; maximum: number }> = {
  extraPickers: { minimum: 0, maximum: 2 },
  extraPutaway: { minimum: 0, maximum: 2 },
  packingDurationMs: { minimum: 1000, maximum: 300000 },
  dispatchDurationMs: { minimum: 1000, maximum: 300000 },
  receivingDurationMs: { minimum: 1000, maximum: 300000 },
};

// Meta strict structured output requires `required` to list every key in
// `properties` (real HTTP 400 on 2d24a72 omitted it). Unchanged knobs are
// therefore explicit nulls: each field is a required integer-or-null.
export const OPERATIONS_PATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    extraPickers: { type: ["integer", "null"], minimum: 0, maximum: 2 },
    extraPutaway: { type: ["integer", "null"], minimum: 0, maximum: 2 },
    packingDurationMs: { type: ["integer", "null"], minimum: 1000, maximum: 300000 },
    dispatchDurationMs: { type: ["integer", "null"], minimum: 1000, maximum: 300000 },
    receivingDurationMs: { type: ["integer", "null"], minimum: 1000, maximum: 300000 },
  },
  required: [...PATCH_KEYS],
} as const;

const PATCH_SCHEMA = OPERATIONS_PATCH_JSON_SCHEMA;

// Strictly validate the full provider object, then drop nulls (unchanged)
// before the existing optional-field parser. Unknown, missing, fractional,
// or out-of-range values are rejected, never silently dropped; explicit 0
// is a real integer value and is preserved.
export function normalizeOperationsProviderPatch(raw: unknown): OperationsPatch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("provider patch must be an object");
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(PATCH_KEYS as readonly string[]).includes(key)) {
      throw new Error(`unknown patch key ${key}`);
    }
  }
  const normalized: Record<string, number> = {};
  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`missing patch key ${key}`);
    }
    const value = record[key];
    if (value === null) continue;
    const bounds = PATCH_BOUNDS[key];
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < bounds.minimum ||
      value > bounds.maximum
    ) {
      throw new Error(`patch key ${key} must be null or an integer ${bounds.minimum}..${bounds.maximum}`);
    }
    normalized[key] = value;
  }
  return parseOperationsPatch(normalized);
}

export type OperationsProposalResult = {
  patch: OperationsPatch;
  model: string;
  responseId: string | null;
  provider: "meta";
  providerKind: ApiConfig["providerKind"];
  finishReason: string | null;
  durationMs: number;
  usage: ProviderUsage | null;
};

export async function proposePatch(input: {
  config: ApiConfig;
  fetchImpl: FetchLike;
  observation: string;
  signal?: AbortSignal;
  // Revalidated immediately before the upstream dispatch (no await
  // between this check and the fetch invocation). Throwing refuses it.
  beforeDispatch?: () => void;
}): Promise<OperationsProposalResult> {
  const live = liveAvailable(input.config);
  if (!live.ok) {
    throw apiError("setup_required", 503, live.reason ?? "Live inference unavailable.");
  }
  if (input.observation.length === 0 || input.observation.length > 4000) {
    throw apiError("BAD_REQUEST", 400, "observation must be 1..4000 characters");
  }
  input.beforeDispatch?.();
  const result = await chatCompletionJson(
    input.config,
    {
      schemaName: "operations_patch",
      schema: PATCH_SCHEMA,
      developerInstruction:
        "You propose ONE bounded warehouse-operations patch as JSON. " +
        "Include ALL five keys exactly: extraPickers, extraPutaway, packingDurationMs, " +
        "dispatchDurationMs, receivingDurationMs. Set a key to null when you do not " +
        "want to change it; set it to an integer only for a proposed change " +
        "(extraPickers/extraPutaway 0-2, durations 1000-300000). Explicit 0 is a " +
        "real value, not unchanged. Do not invent a change merely to fill a key; " +
        "use null for unchanged. No extra keys. No prose.",
      userContent: input.observation,
    },
    input.signal ?? AbortSignal.timeout(input.config.timeoutMs),
    input.fetchImpl,
  );
  try {
    return {
      patch: normalizeOperationsProviderPatch(result.parsed),
      model: result.model,
      responseId: result.responseId,
      provider: "meta",
      providerKind: input.config.providerKind,
      finishReason: result.finishReason,
      durationMs: result.durationMs,
      usage: result.usage,
    };
  } catch {
    throw apiError("INVALID_PATCH", 422, "model output is not a valid bounded operations patch; rejected, not executed");
  }
}
