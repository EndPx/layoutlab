// Consumer import smoke: runs the built dist bundle against the oracle
// fixture with zero test-framework dependencies. Run after npm run build.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  buildNavContext,
  evaluateBaseline,
  parseRequirements,
  parseScenario,
} from "./dist/index.js";

const scenario = parseScenario(
  JSON.parse(readFileSync(new URL("../../fixtures/test/oracle-empty-room.json", import.meta.url), "utf8")),
);
const requirements = parseRequirements({
  objective: "minimize_weighted_picking_travel",
  maxRelocatedProducts: 4,
  lockedProductIds: [],
  assumptions: [],
  unresolvedQuestions: [],
});
assert.equal(buildNavContext(scenario).navigationRadiusMm, 700);
const baseline = evaluateBaseline(scenario, requirements);
assert.equal(baseline.valid, true);
assert.equal(baseline.weightedTravelMm, 16000);
assert.equal(baseline.workload.meanOrderDistanceMm, 3200);
console.log("smoke ok: dist bundle evaluates oracle fixture to 16000/3200/700");
