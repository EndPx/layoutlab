// Version constants for the v3-M2a operations runtime. Bump alongside
// contract changes. The operations schema is distinct from the legacy
// planner scenario (layoutlab.scenario/1), which stays untouched.
// SIMULATION_VERSION is the implementation version: 0.1.1 carries the
// put-away liveness fix. The input contracts below stay at /1 because
// the scenario data/coordinate contract is unchanged; reports record
// the implementation version (see docs/ENGINE_IMPLEMENTATION_VERSIONS.md).
export const SIMULATION_VERSION = "0.1.1";
export const OPERATIONS_SCHEMA_VERSION = "layoutlab.operations/1";
export const OPERATIONS_ENGINE_VERSION = "layoutlab.operations-engine/1";
