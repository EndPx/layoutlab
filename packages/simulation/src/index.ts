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
} from "./schema.js";
export { EVENT_PRIORITY } from "./priorities.js";
export type {
  EventPriorityName,
  EventPriorityValue,
} from "./priorities.js";
export { travelTimeMs } from "./travel.js";
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
