// L0 physical layout draft foundation (revision 2). Portable module over
// the accepted public @layoutlab/simulation exports: no Node-only builtins
// anywhere in this graph (hashing is WebCrypto behind an async boundary),
// so the same entry bundles for the browser. Node-only concerns (fixture
// files, CLI) live in scripts/, not here. Not wired into the main
// application: U1/L1/L2 integration is a separate gate
// (see docs/PHYSICAL_LAYOUT_CONTRACT.md).
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
