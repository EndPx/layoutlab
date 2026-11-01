import { readFileSync } from "node:fs";
import {
  parseRequirements,
  parseScenario,
  type PlanningRequirements,
  type Scenario,
} from "../src/index.js";

export function loadFixture(dir: "test" | "sample", name: string): Scenario {
  const url = new URL(`../../../fixtures/${dir}/${name}.json`, import.meta.url);
  return parseScenario(JSON.parse(readFileSync(url, "utf8")));
}

export function requirements(overrides: Partial<PlanningRequirements> = {}): PlanningRequirements {
  return parseRequirements({
    objective: "minimize_weighted_picking_travel",
    maxRelocatedProducts: 4,
    lockedProductIds: [],
    assumptions: [],
    unresolvedQuestions: [],
    ...overrides,
  });
}

export function codes(errors: { code: string }[]): string[] {
  return errors.map((e) => e.code);
}
