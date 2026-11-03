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
import { chatCompletionJson, type FetchLike } from "./provider.js";

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

const PATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    extraPickers: { type: "integer", minimum: 0, maximum: 2 },
    extraPutaway: { type: "integer", minimum: 0, maximum: 2 },
    packingDurationMs: { type: "integer", minimum: 1000, maximum: 300000 },
    dispatchDurationMs: { type: "integer", minimum: 1000, maximum: 300000 },
    receivingDurationMs: { type: "integer", minimum: 1000, maximum: 300000 },
  },
};

export async function proposePatch(input: {
  config: ApiConfig;
  fetchImpl: FetchLike;
  observation: string;
  signal?: AbortSignal;
}): Promise<{ patch: OperationsPatch; model: string; responseId: string | null }> {
  const live = liveAvailable(input.config);
  if (!live.ok) {
    throw apiError("setup_required", 503, live.reason ?? "Live inference unavailable.");
  }
  if (input.observation.length === 0 || input.observation.length > 4000) {
    throw apiError("BAD_REQUEST", 400, "observation must be 1..4000 characters");
  }
  const result = await chatCompletionJson(
    input.config,
    {
      schemaName: "operations_patch",
      schema: PATCH_SCHEMA,
      developerInstruction:
        "You propose ONE bounded warehouse-operations patch as JSON. Allowed keys only: " +
        "extraPickers (0-2), extraPutaway (0-2), packingDurationMs, dispatchDurationMs, " +
        "receivingDurationMs (1000-300000). Omit keys you do not change. No prose.",
      userContent: input.observation,
    },
    input.signal ?? AbortSignal.timeout(input.config.timeoutMs),
    input.fetchImpl,
  );
  try {
    return {
      patch: parseOperationsPatch(result.parsed),
      model: result.model,
      responseId: result.responseId,
    };
  } catch {
    throw apiError("INVALID_PATCH", 422, "model output is not a valid bounded operations patch; rejected, not executed");
  }
}
