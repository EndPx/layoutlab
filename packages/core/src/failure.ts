// Shared M5 failure-audit contract (Node-free: runs in API, browser, and
// benchmark replay from this one source). A failure audit is the honest
// export for terminal FAILED/CANCELLED/TIMED_OUT runs that never reached an
// evaluated report: audit facts only, with an explicit no-evaluation
// boundary. It validates structurally but NEVER claims a measurement match.
import { z } from "zod";
import { MAX_ID_LEN, MAX_TEXT_LEN, requirementsSchema, scenarioSchema } from "./schema.js";

export const M5_FAILURE_VERSION = "layoutlab.m5failure/1";

// Explicit no-evaluation boundary shared by the failure envelope and its replay.
export const FAILURE_NO_EVALUATION =
  "No deterministic measurement existed for this run: it ended before any approved requirements were evaluated, so there is no baseline, no candidate, no best name, and no improvement to replay.";

// Brief section 21 run caps: the failure record can never exceed them.
const MAX_RUN_PROPOSALS = 3;
const MAX_RUN_REQUESTS = 4;
const MAX_RUN_TIMEOUT_MS = 120000;

const usageSchema = z.strictObject({
  promptTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  completionTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  totalTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
});

const diagnosticsSchema = z.strictObject({
  responseId: z.string().max(MAX_ID_LEN).nullable(),
  finishReason: z.string().max(MAX_ID_LEN).nullable(),
  errorCode: z.string().max(MAX_ID_LEN).nullable(),
});

export const failureEnvelopeSchema = z
  .strictObject({
    envelopeVersion: z.literal(M5_FAILURE_VERSION),
    runId: z.string().min(1).max(MAX_ID_LEN),
    exportedAt: z.string().datetime({ offset: true }),
    apiVersion: z.string().min(1).max(MAX_ID_LEN),
    coreVersion: z.string().min(1).max(MAX_ID_LEN),
    routePolicy: z.string().min(1).max(MAX_ID_LEN),
    provider: z.literal("meta"),
    providerKind: z.enum(["meta", "fixture"]),
    realMetaRequests: z.number().int().min(0).max(MAX_RUN_REQUESTS),
    modelId: z.string().min(1).max(MAX_ID_LEN),
    promptVersion: z.string().min(1).max(MAX_ID_LEN),
    generationSettings: z.strictObject({
      reasoningEffort: z.string().min(1).max(64),
      maxCompletionTokens: z.number().int().min(1).max(2000),
    }),
    state: z.enum(["FAILED", "CANCELLED", "TIMED_OUT"]),
    phase: z.string().min(1).max(64),
    outcome: z.null(),
    reportAvailable: z.literal(false),
    measurement: z.null(),
    evaluationBoundary: z.string().min(1).max(MAX_TEXT_LEN),
    modelRequestsUsed: z.number().int().min(0).max(MAX_RUN_REQUESTS),
    proposalsUsed: z.literal(0),
    budgets: z.strictObject({
      maxProposals: z.number().int().min(0).max(MAX_RUN_PROPOSALS),
      maxRequests: z.number().int().min(0).max(MAX_RUN_REQUESTS),
      timeoutMs: z.number().int().min(1).max(MAX_RUN_TIMEOUT_MS),
    }),
    usageTotals: usageSchema.nullable(),
    usageIncomplete: z.boolean(),
    scenario: scenarioSchema,
    requestText: z.string().min(1).max(MAX_TEXT_LEN),
    requirements: requirementsSchema.nullable(),
    requirementsDraft: requirementsSchema.nullable(),
    interpretedUnresolved: z.array(z.string().max(MAX_TEXT_LEN)).max(256),
    interpretError: z.string().max(MAX_TEXT_LEN).nullable(),
    interpretDiagnostics: diagnosticsSchema.nullable(),
    attempts: z.array(z.never()).max(0),
    lastError: z.string().max(MAX_TEXT_LEN).nullable(),
    limitations: z.array(z.string().max(MAX_TEXT_LEN)).min(1).max(64),
  })
  .refine((e) => e.modelRequestsUsed <= e.budgets.maxRequests, { message: "used requests exceed budget" })
  .refine((e) => e.realMetaRequests <= e.modelRequestsUsed, { message: "real requests exceed used requests" })
  .refine((e) => e.providerKind !== "fixture" || e.realMetaRequests === 0, {
    message: "fixture audits must report realMetaRequests 0",
  })
  .refine((e) => e.providerKind !== "meta" || e.realMetaRequests === e.modelRequestsUsed, {
    message: "meta audits must account every request as a real Meta request",
  });

export type FailureEnvelope = z.infer<typeof failureEnvelopeSchema>;

// Failure-audit replay: validates the record (throws on malformed or
// success-claiming input) and explicitly reports that no deterministic
// measurement existed. There is no matchesSaved: nothing was measured.
export function replayFailureRecord(json: unknown): {
  valid: true;
  evaluated: false;
  provider: "meta";
  runId: string;
  state: FailureEnvelope["state"];
  notice: string;
} {
  const parsed = failureEnvelopeSchema.parse(json);
  return {
    valid: true,
    evaluated: false,
    provider: "meta",
    runId: parsed.runId,
    state: parsed.state,
    notice: FAILURE_NO_EVALUATION,
  };
}
