// Public API of the deterministic core. Everything here is pure and runs
// without a model key or a browser.
export {
  CORE_VERSION,
  GRID_SIZE_MM,
  REPORT_VERSION,
  ROUTE_POLICY_ID,
  SCHEMA_VERSION,
} from "./version.js";
export {
  MAX_ASSIGNMENTS,
  MAX_CART_MM,
  MAX_CHANGES,
  MAX_COORD_MM,
  MAX_DIM_MM,
  MAX_FREQUENCY,
  MAX_ID_LEN,
  MAX_LINES_PER_ORDER,
  MAX_LOCATIONS,
  MAX_LOCKS,
  MAX_MARGIN_MM,
  MAX_ORDERS,
  MAX_PASSAGE_MM,
  MAX_PRODUCTS,
  MAX_QUANTITY,
  MAX_RACKS,
  MAX_REPORT_CANDIDATES,
  MAX_REVISION,
  MAX_TEXT_LEN,
  MAX_TOTAL_ORDER_LINES,
  PACKING_ID,
  assignmentSchema,
  parseProposal,
  parseRequirements,
  parseScenario,
  proposalSchema,
  requirementsSchema,
  scenarioSchema,
} from "./schema.js";
export type {
  Assignment,
  AssignmentProposal,
  OrderTemplate,
  PlanningRequirements,
  PointMm,
  Product,
  Rack,
  Scenario,
  StorageLocation,
} from "./schema.js";
export {
  cartRadiusMm,
  inflateRect,
  navigationRadiusMm,
  pointInRect,
  rackFootprint,
  rectsOverlapInterior,
  segmentBlocked,
  segmentHitsRect,
} from "./geometry.js";
export type { Rect } from "./geometry.js";
export { buildNavContext, pointInRoom, pointNavigable, validateScene } from "./scene.js";
export type { NavContext, SceneIssue } from "./scene.js";
export {
  CONNECTION_RADIUS_MM,
  MAX_GRID_NODES,
  MAX_WORKLOAD_EXPANSIONS,
  BudgetExhausted,
  astarNodeDistanceMm,
  astarNodePath,
  connectEndpoint,
  createNavBudget,
  gridNodeCount,
  nodePoint,
  shortestPathMm,
  shortestPathPointsMm,
} from "./nav.js";
export type { EndpointConnection, GridNode, NavBudget } from "./nav.js";
export {
  applyProposal,
  fitsFixedOrientation,
  relocationCount,
  validateAssignment,
} from "./validate.js";
export type { AssignmentValidation, ValidationError } from "./validate.js";
export { EVALUATION_BUDGET_REASON, evaluateWorkload, safeAdd, safeMul } from "./routing.js";
export type { LegResult, OrderResult, WorkloadLimits, WorkloadResult } from "./routing.js";
export {
  improvementPercent,
  rankCandidates,
  selectBest,
  settingsFingerprint,
  stableAssignmentKey,
} from "./objective.js";
export type { ComparableResult, RankedCandidate } from "./objective.js";
export { applyAssignment, freezeScenario } from "./snapshot.js";
export {
  DEFAULT_HEURISTIC_MAX_EVALUATIONS,
  HEURISTIC_METHOD,
  HEURISTIC_NAME,
  MAX_HEURISTIC_EVALUATIONS,
  computeDemandFrequency,
  methodLabelFor,
  rankLocationsByPackingDistance,
  runHeuristic,
} from "./heuristic.js";
export type { HeuristicOptions, HeuristicResult, LocationRank, LocationRankStatus, MethodLabel } from "./heuristic.js";
export { compareCandidates, createReport, evaluateBaseline, evaluateCandidate, replayReport, REPORT_LIMITATIONS } from "./report.js";
export type { CandidateResult, Comparison, EvaluationReport, ReportOutcome } from "./report.js";
