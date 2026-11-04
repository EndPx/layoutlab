// Portable production layout API; shared with the manual editor and offline verifier.
export {
  COORDINATE_SYSTEM,
  LAYOUT_COMPARISON_SCHEMA,
  LAYOUT_DRAFT_VERSION,
  LOCKED_ENTITY_IDS,
  SUPPORTED_KIND,
  UNSUPPORTED_KINDS,
  defaultApprovedConstraints,
  defaultConstraints,
  parseApprovedConstraints,
  parseLayoutProposal,
  resolveTargetCentre,
  snapToGridMm,
  validateProposalAgainstBaseline,
  validateResolvedTransform,
} from "./contract.js";
export type {
  ApprovedLayoutConstraints,
  LayoutConstraints,
  LayoutIssue,
  LayoutProposal,
  PackingStationTranslationProposal,
  ProposalParseResult,
  ApprovedParseResult,
  RectMm,
  UnsupportedKind,
  UnsupportedLayoutProposal,
  XzMm,
} from "./contract.js";
export {
  MAIN_WAREHOUSE_ATTACHMENTS,
  LayoutAttachmentError,
  applyPackingStationTranslation,
  attachmentsFromBindings,
  buildStationAttachmentMap,
  diffPaths,
  getAtJsonPath,
  isAllowedLayoutPath,
  viewerPlacementFromCandidate,
} from "./attachments.js";
export type { CandidateBundle, SlotCoord, StationAttachment } from "./attachments.js";
export { validateLayoutCandidate } from "./validator.js";
export type { LayoutValidation, RouteCheck } from "./validator.js";
export {
  DECISION_CRITERION,
  classifyImprovement,
  runLayoutComparison,
  verifyLayoutComparison,
} from "./compare.js";
export type {
  EvaluationScope,
  Improvement,
  LayoutComparisonResult,
  LayoutComparisonVerification,
  LayoutDelta,
  Measurement,
  RunMetrics,
} from "./compare.js";
export { canonicalStringify, contentSha256, sha256Hex } from "./hash.js";
export {
  CORRIDOR_BASE_CENTRE_X,
  CORRIDOR_EXECUTION_CONFIG,
  buildCorridorScenario,
  corridorAttachment,
} from "./corridor.js";

export { buildRackAttachmentMap, applyRackTranslation, runRackLayoutComparison, verifyRackLayoutComparison } from './rack.js';
export type { RackAttachment, RackTranslationProposal, RackComparisonInput, RackLayoutComparison } from './rack.js';

export { rotateRackOffset, resolveRackOrientations, applyRackQuarterTurn, runRackRotationComparison, verifyRackRotationComparison } from './rack-rotation.js';
export type { QuarterTurns, RackQuarterTurnProposal, ApprovedRackRotation, RackRotationInput, RackRotationComparison } from './rack-rotation.js';

export { applyAgentInitialPlacement, runAgentPlacementComparison, verifyAgentPlacementComparison } from './agent-placement.js';
export type { AgentInitialPlacementProposal, AgentPlacementComparisonInput, AgentPlacementComparison } from './agent-placement.js';
