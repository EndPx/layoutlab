import { CURRENT_IMPLEMENTATION_VERSION, ARCHIVED_RUNTIMES } from "../runtime-selector.js";
import { parseOperationsScenario } from "../schema.js";
import { parseOperationsExecutionConfig } from "../operations.js";
import { MAIN_WAREHOUSE_ATTACHMENTS, buildStationAttachmentMap } from "./attachments.js";
import { defaultApprovedConstraints } from "./contract.js";
import { validateLayoutCandidate } from "./validator.js";
import { runLayoutComparison } from "./compare.js";
const current = { parseOperationsScenario, parseOperationsExecutionConfig, MAIN_WAREHOUSE_ATTACHMENTS, buildStationAttachmentMap, defaultApprovedConstraints, validateLayoutCandidate, runLayoutComparison };
export function selectLayoutInvestigationRuntime(version: unknown): typeof current {
  if (version !== "0.1.1") throw new Error("unsupported layout investigation implementation");
  return version === CURRENT_IMPLEMENTATION_VERSION ? current : ARCHIVED_RUNTIMES["0.1.1"];
}
