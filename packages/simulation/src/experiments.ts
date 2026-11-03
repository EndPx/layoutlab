// v3-M7 controlled experiments: run the SAME scenario/config inputs under
// several bounded candidate patches and compare engine-owned outcomes.
// Every candidate keeps its full operations report, so any ranking can be
// recomputed independently. Worse and incomplete outcomes stay visible and
// rank below completed ones; nothing is hidden or normalized away.
import { z } from "zod";
import {
  createOperationsController,
  type OperationsExecutionConfig,
  type OperationsReport,
} from "./operations.js";
import {
  parseOperationsScenario,
  type OperationsScenario,
} from "./schema.js";

// Bounded patch surface: the only scenario changes an experiment (or a
// model proposal) may make. Strictly validated; anything else is rejected.
export const operationsPatchSchema = z.strictObject({
  extraPickers: z.number().int().min(0).max(2).optional(),
  extraPutaway: z.number().int().min(0).max(2).optional(),
  packingDurationMs: z.number().int().min(1000).max(300000).optional(),
  dispatchDurationMs: z.number().int().min(1000).max(300000).optional(),
  receivingDurationMs: z.number().int().min(1000).max(300000).optional(),
});

export type OperationsPatch = z.infer<typeof operationsPatchSchema>;

export function parseOperationsPatch(value: unknown): OperationsPatch {
  return operationsPatchSchema.parse(value);
}

export function applyOperationsPatch(
  scenario: OperationsScenario,
  patch: OperationsPatch,
): OperationsScenario {
  const valid = parseOperationsPatch(patch);
  const next = structuredClone(scenario) as OperationsScenario;
  const cloneUnit = (role: "picker" | "putaway", n: number): void => {
    const template = next.mobileUnits.find((u) => u.role === role);
    if (!template) {
      throw new Error(`patch adds ${role} units but the scenario has no ${role} template`);
    }
    for (let i = 1; i <= n; i++) {
      const id = `${template.id}-X${i}`;
      if (next.mobileUnits.some((u) => u.id === id)) continue;
      // Park clones on the template parking slot offset along +x by whole
      // envelope widths so initial clearance stays satisfiable in open
      // fixtures; transport admission still verifies every position.
      const offset = (template.footprintMm.width + template.footprintMm.margin * 2) * i;
      next.mobileUnits.push({
        ...structuredClone(template),
        id,
        parkingSlotMm: { x: template.parkingSlotMm.x + offset, z: template.parkingSlotMm.z },
      });
    }
  };
  if (valid.extraPickers) cloneUnit("picker", valid.extraPickers);
  if (valid.extraPutaway) cloneUnit("putaway", valid.extraPutaway);
  for (const r of next.resources) {
    if (r.kind === "packing" && valid.packingDurationMs !== undefined) {
      r.serviceDurationMs = valid.packingDurationMs;
    }
    if (r.kind === "dispatch" && valid.dispatchDurationMs !== undefined) {
      r.serviceDurationMs = valid.dispatchDurationMs;
    }
    if (r.kind === "receiving" && valid.receivingDurationMs !== undefined) {
      r.serviceDurationMs = valid.receivingDurationMs;
    }
  }
  return parseOperationsScenario(next);
}

export type ExperimentCandidateResult = {
  candidateId: string;
  patch: OperationsPatch;
  completionStage: string;
  shipped: number;
  backlog: number;
  stageBacklog: number;
  makespanMs: number | null;
  totalWaitMs: number;
  report: OperationsReport;
};

export type OperationsExperimentResult = {
  schema: "layoutlab.operations-experiment/1";
  scenarioId: string;
  candidates: ExperimentCandidateResult[];
  rankedCandidateIds: string[];
};

function runCandidate(
  scenario: OperationsScenario,
  executionConfig: OperationsExecutionConfig,
  candidateId: string,
  patch: OperationsPatch,
): ExperimentCandidateResult {
  const patched = applyOperationsPatch(scenario, patch);
  const c = createOperationsController({ scenario: patched, executionConfig });
  const CAP = 3_600_000;
  let guard = 0;
  while (c.getCompletionStatus().stage === "IN_PROGRESS" && guard < 240) {
    c.advanceTo(Math.min(c.getClockMs() + 60_000, CAP));
    guard += 1;
  }
  const report = c.exportReport();
  const snap = c.snapshot();
  const shippedTimes = snap.orders
    .map((o) => o.timestamps.SHIPPED)
    .filter((t): t is number => typeof t === "number");
  const makespanMs = shippedTimes.length > 0 ? Math.max(...shippedTimes) : null;
  const totalWaitMs = snap.waits.reduce(
    (n, w) => n + ((w.endMs ?? snap.clockMs) - w.startMs),
    0,
  );
  return {
    candidateId,
    patch: { ...patch },
    completionStage: report.completionStage,
    shipped: report.counts.shipped,
    backlog: report.counts.backlog,
    stageBacklog: report.counts.stageBacklog,
    makespanMs,
    totalWaitMs,
    report,
  };
}

// Deterministic ranking: completed runs first (more shipped, then lower
// makespan, then lower total wait), incomplete runs after (more shipped,
// then lower backlog). Ties break by candidateId so reruns agree exactly.
function rankCandidates(candidates: ExperimentCandidateResult[]): string[] {
  const complete = (c: ExperimentCandidateResult): boolean =>
    c.completionStage === "SUPPORTED_STAGE_COMPLETE";
  return [...candidates]
    .sort((a, b) => {
      if (complete(a) !== complete(b)) return complete(a) ? -1 : 1;
      if (a.shipped !== b.shipped) return b.shipped - a.shipped;
      if (complete(a) && complete(b)) {
        const am = a.makespanMs ?? Number.POSITIVE_INFINITY;
        const bm = b.makespanMs ?? Number.POSITIVE_INFINITY;
        if (am !== bm) return am - bm;
        if (a.totalWaitMs !== b.totalWaitMs) return a.totalWaitMs - b.totalWaitMs;
      }
      if (a.backlog !== b.backlog) return a.backlog - b.backlog;
      return a.candidateId < b.candidateId ? -1 : 1;
    })
    .map((c) => c.candidateId);
}

export function runOperationsExperiment(input: {
  scenario: OperationsScenario;
  executionConfig: OperationsExecutionConfig;
  candidates: { candidateId: string; patch: OperationsPatch }[];
}): OperationsExperimentResult {
  if (input.candidates.length === 0) {
    throw new Error("experiment requires at least one candidate");
  }
  const seen = new Set<string>();
  for (const c of input.candidates) {
    if (seen.has(c.candidateId)) {
      throw new Error(`duplicate candidate id ${c.candidateId}`);
    }
    seen.add(c.candidateId);
    parseOperationsPatch(c.patch);
  }
  const candidates = input.candidates.map((c) =>
    runCandidate(input.scenario, input.executionConfig, c.candidateId, c.patch),
  );
  return {
    schema: "layoutlab.operations-experiment/1",
    scenarioId: input.scenario.id,
    candidates,
    rankedCandidateIds: rankCandidates(candidates),
  };
}
