// Unified-workspace presentation helpers: plain-language labels and
// identities derived only from actual engine/report state. No values are
// invented here; missing metrics stay null so the UI can explain them.
import type { OperationsPatch } from "@layoutlab/simulation";
import { DURATION_FIELDS, DURATION_LABELS, type DurationField } from "./experiments";

/** Engine clock as mm:ss.mmm (raw ms stays available via title). */
export function formatClockMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

/** "Time to finish all orders" style: 502000 -> "8min 22sec". Null stays null. */
export function formatFinishTime(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}sec`;
  return `${m}min ${s}sec`;
}

/** Remaining orders include selected-but-not-arrived; arrived backlog is separate. */
export function remainingCounts(counts: { selected: number; arrived: number; shipped: number }): {
  remaining: number;
  arrivedBacklog: number;
  notYetArrived: number;
} {
  return {
    remaining: Math.max(0, counts.selected - counts.shipped),
    arrivedBacklog: Math.max(0, counts.arrived - counts.shipped),
    notYetArrived: Math.max(0, counts.selected - counts.arrived),
  };
}

const STAGE_LABEL: Record<DurationField, string> = {
  packingDurationMs: "packing",
  dispatchDurationMs: "dispatch",
  receivingDurationMs: "receiving",
};

/** Hypothetical assumption sentence for one service-duration value. */
export function assumptionSentence(field: DurationField, valueMs: number): string {
  const sec = valueMs / 1000;
  const secText = Number.isInteger(sec) ? String(sec) : sec.toFixed(1);
  return `Assume ${STAGE_LABEL[field]} takes ${secText} seconds per order`;
}

/** Human option name from the actual patch: "Option 2 — Assume dispatch takes 30 seconds per order". */
export function humanOptionName(candidateId: string, patch: OperationsPatch | null | undefined, isBaseline: boolean): string {
  if (isBaseline) return "Current";
  const m = /(\d+)\s*$/.exec(candidateId);
  const label = m ? `Option ${m[1]}` : candidateId;
  const parts: string[] = [];
  if (patch) {
    for (const field of DURATION_FIELDS) {
      const v = patch[field];
      if (typeof v === "number") parts.push(assumptionSentence(field, v));
    }
    if (typeof patch.extraPickers === "number" && patch.extraPickers !== 0) parts.push(`Add ${patch.extraPickers} picker(s) (staffing assumption)`);
    if (typeof patch.extraPutaway === "number" && patch.extraPutaway !== 0) parts.push(`Add ${patch.extraPutaway} putaway worker(s) (staffing assumption)`);
  }
  if (parts.length === 0) return `${label} — no changes`;
  return `${label} — ${parts.join("; ")}`;
}

/** Short changed-fields summary for cards (labels only; values stay in details). */
export function changedSummary(patch: OperationsPatch | null | undefined): string {
  if (!patch || Object.keys(patch).length === 0) return "No changes";
  const names: string[] = [];
  for (const field of DURATION_FIELDS) {
    if (typeof patch[field] === "number") names.push(DURATION_LABELS[field]);
  }
  return names.length > 0 ? names.join(", ") : "No service-duration changes";
}

/** Completion wording: "Completed" only with the shipped-cohort qualifier. */
export function completionLabel(stage: string | null | undefined, shipped: number, selected: number): string {
  if (!stage) return "Not started";
  if (stage === "SUPPORTED_STAGE_COMPLETE") {
    return shipped === selected && selected > 0
      ? "Completed"
      : "Completed (supported stage only — not all orders shipped)";
  }
  if (stage === "BLOCKED") return "Blocked";
  if (stage === "WINDOW_ENDED") return "Window ended";
  if (stage === "IN_PROGRESS") return "Running";
  return stage;
}

/** Explicit input identity (scenario + seed + execution config + implementation). */
export function inputIdentity(input: {
  scenarioId: string;
  seed: string;
  executionConfig: { pickDurationMsPerItem: number; unloadDurationMsPerItem: number };
  implementationVersion: string;
}): string {
  return `${input.scenarioId} · seed ${input.seed} · pick ${input.executionConfig.pickDurationMsPerItem}ms · unload ${input.executionConfig.unloadDurationMsPerItem}ms · engine ${input.implementationVersion}`;
}

/** Stable JSON identity preserves array order and ignores object insertion order. */
export function canonicalIdentity(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalIdentity).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalIdentity((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export function isStaleReport(reportInput: unknown, active: unknown): boolean {
  return reportInput != null && active != null && canonicalIdentity(reportInput) !== canonicalIdentity(active);
}
export function replayVersion(report: import("./experiments").InvestigationReport): string {
  const version = report.versions.simulation;
  if (report.comparison && (report.comparison.versions.simulation !== version || report.comparison.candidates.some(c => c.report && c.report.versions.simulation !== version))) {
    throw new Error("Inconsistent simulation versions in recorded report; replay rejected.");
  }
  return version;
}

/** Keep raw engine status in details; use plain language in results. */
export function friendlyCandidateStatus(status: string): string {
  return ({ "valid-complete": "Completed", "valid-incomplete": "Incomplete", "invalid": "Rejected", "failed": "Failed" } as Record<string, string>)[status] ?? status;
}
