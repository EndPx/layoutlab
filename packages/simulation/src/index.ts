// Public API of the v3-M2a operations runtime. Everything here is pure
// and runs headlessly without a model key or a browser.
export {
  OPERATIONS_ENGINE_VERSION,
  OPERATIONS_SCHEMA_VERSION,
  SIMULATION_VERSION,
} from "./version.js";
export {
  MAX_AGENTS,
  MAX_COORD_MM,
  MAX_DELIVERIES,
  MAX_DIM_MM,
  MAX_EVENTS_PER_TIMESTAMP,
  MAX_FOOTPRINT_MM,
  MAX_ID_LEN,
  MAX_LINES_PER_ORDER,
  MAX_LOCATIONS,
  MAX_MARGIN_MM,
  MAX_OBSTACLES,
  MAX_ORDERS,
  MAX_PRODUCTS,
  MAX_QUANTITY,
  MAX_QUEUE_SLOTS,
  MAX_RACKS,
  MAX_RESOURCES,
  MAX_RUN_EVENTS,
  MAX_SEED_LEN,
  MAX_SERVICE_CAPACITY,
  MAX_SERVICE_DURATION_MS,
  MAX_SERVICE_POSITIONS,
  MAX_SPEED_MMPS,
  MAX_STAGING,
  MAX_STOCK_ENTRIES,
  MAX_TEXT_LEN,
  MAX_TIME_MS,
  MAX_TOTAL_SCHEDULE_LINES,
  MAX_TRAFFIC_ZONES,
  operationsResourceSchema,
  operationsScenarioSchema,
  parseOperationsScenario,
} from "./schema.js";
export type {
  OperationsGeometry,
  OperationsHomeAssignment,
  OperationsMobileUnit,
  OperationsObstacle,
  OperationsPolicies,
  OperationsProduct,
  OperationsRack,
  OperationsResource,
  OperationsRunSettings,
  OperationsScenario,
  OperationsScheduledDelivery,
  OperationsScheduledOrder,
  OperationsStock,
  OperationsStorageLocation,
  OperationsTrafficZone,
} from "./schema.js";
export { EVENT_PRIORITY } from "./priorities.js";
export type {
  EventPriorityName,
  EventPriorityValue,
} from "./priorities.js";
export { travelTimeMs } from "./travel.js";
export { createInventoryStore } from "./inventory.js";
export type {
  BucketTotals,
  InventorySnapshot,
  InventoryStore,
  PackingReadiness,
  PutAwaySelection,
  ReserveResult,
  TransferRecord,
} from "./inventory.js";
export { createServiceStation } from "./resources.js";
export type {
  CompleteResult,
  EnqueueResult,
  ServiceJobState,
  ServiceJobView,
  ServiceSnapshot,
  ServiceStation,
  StartResult,
} from "./resources.js";
export {
  containerGrid,
  containersForStock,
  deckIndexForAnchorY,
  deckTopYMm,
  rackAxisScale,
} from "./environment.js";
export type { AxisScale, DimsMm, GridPlacement } from "./environment.js";
export {
  MAX_KERNEL_PRIORITY,
  MAX_PLAN_VERSION,
  createKernel,
} from "./kernel.js";
export type {
  Kernel,
  KernelApi,
  KernelEventInput,
  KernelEventView,
  KernelOptions,
  KernelSnapshot,
  KernelSnapshotEvent,
  KernelStatus,
  OnKernelEvent,
  StepResult,
} from "./kernel.js";
export {
  createTransportNav,
  footprintRadiusMm,
  footprintRect,
  occupancyRectFor,
} from "./navigation.js";
export type {
  RouteFailure,
  RouteFailureReason,
  RouteResult,
  RouteSuccess,
  TransportNav,
  UnitProfile,
  XzMm,
} from "./navigation.js";
export {
  TRAFFIC_CONTACT_EPS_MM,
  discsConflict,
  minSeparationMovingMoving,
  minSeparationMovingStationary,
  minSeparationMovingStationaryInWindow,
  pathRequiresZone,
  pointInZoneInclusive,
  poseOnSegment,
  stationaryVsStationaryConflict,
  trajectoriesConflict,
  trajectoryVsStationaryConflict,
  trajectoryVsStationaryInWindowConflict,
  zoneHoldsOverlap,
} from "./traffic.js";
export type {
  ConflictDetail,
  TimedSegment,
  Trajectory,
  Xz,
} from "./traffic.js";
export { createOperationsController, parseOperationsExecutionConfig, operationsExecutionConfigSchema, recomputeOperationsReport } from "./operations.js";
export type {
  OperationsChecks,
  OperationsCompletion,
  OperationsController,
  OperationsCounts,
  OperationsDeliveryView,
  DeliveryLifecycleState,
  OperationsDiagnostic,
  OperationsExecutionConfig,
  OperationsOrderDiagnostic,
  OperationsOrderView,
  OperationsPackingView,
  OperationsReport,
  OperationsReportVerification,
  OperationsSnapshot,
  OperationsTimelineEntry,
  OperationsUnitTaskView,
  OperationsUnitView,
  OperationsWaitRecord,
  OrderLifecycleState,
} from "./operations.js";
export {
  applyOperationsPatch,
  operationsPatchSchema,
  parseOperationsPatch,
  runOperationsExperiment,
} from "./experiments.js";
export type {
  ExperimentCandidateResult,
  OperationsExperimentResult,
  OperationsPatch,
} from "./experiments.js";
export { createTransportController, createTransportDomain } from "./transport.js";
export type {
  CancelResult,
  GrantedPlan,
  MoveDestination,
  MoveResult,
  TransportController,
  TransportDomain,
  TransportDiagnostic,
  TransportGrantNotice,
  TransportSnapshot,
  UnitSnapshot,
  WaitBlocker,
} from "./transport.js";
