import type { Assignment, Scenario } from "./schema.js";
import type { ValidationError } from "./validate.js";

function deepFreeze(value: unknown): void {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
}

// A frozen run baseline: scene edits must create a new revision instead of
// mutating this snapshot.
export function freezeScenario(scenario: Scenario): Scenario {
  const clone = structuredClone(scenario);
  deepFreeze(clone);
  return clone;
}

// Apply a complete mapping to a snapshot. Stale revisions are rejected; a
// successful apply returns a new scenario at revision + 1. This helper
// intentionally performs no validity check: callers must evaluate the
// mapping first and apply only results they have accepted.
export function applyAssignment(
  snapshot: Scenario,
  finalMapping: Assignment[],
  expectedRevision: number,
): { ok: true; scenario: Scenario } | { ok: false; errors: ValidationError[] } {
  if (expectedRevision !== snapshot.revision) {
    return {
      ok: false,
      errors: [{
        code: "STALE_REVISION",
        message: `expected revision ${expectedRevision}, snapshot is ${snapshot.revision}`,
      }],
    };
  }
  return {
    ok: true,
    scenario: {
      ...structuredClone(snapshot),
      assignments: structuredClone(finalMapping),
      revision: snapshot.revision + 1,
    },
  };
}
