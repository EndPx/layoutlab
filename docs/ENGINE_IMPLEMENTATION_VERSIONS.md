# Engine implementation versions

The operations runtime distinguishes the **input contract** from the
**implementation version**. Reports record all three values in
`versions`: `operationsSchema` and `operationsEngine` name the data and
coordinate contract (`layoutlab.operations/1`,
`layoutlab.operations-engine/1`), while `simulation` is the
implementation version of `@layoutlab/simulation` that produced them.

| Implementation | Engine | Status |
| --- | --- | --- |
| `0.1.0` | Pre-putaway-liveness behavior | Frozen archive: `packages/simulation/archive/0.1.0/runtime.mjs` (manifest + hashes in `packages/simulation/archive/manifest.json`, third-party notices in `packages/simulation/archive/LICENSES.md`) |
| `0.1.1` | Put-away liveness fix (declared-order first placeable row within a delivery, yield-to-parking for blocked laden carts, place-time revalidation, staged collecting claims) | Current source in `packages/simulation/src` |

The input contracts stayed at `/1`: the fix changes behavior and adds
the `yield-to-parking` snapshot task kind, but scenario data and
coordinates remain compatible, so preserved fixtures and inputs keep
parsing unchanged. Do not bump `OPERATIONS_ENGINE_VERSION` for a
behavior-only fix; the scenario parser uses that literal and a bump
would reject every preserved input.

## Selecting an implementation

`@layoutlab/simulation` exports a minimal, explicit selector — no
registry, no database, no silent fallback:

```ts
createOperationsControllerForVersion(
  { scenario, executionConfig },
  implementationVersion: string,
): OperationsController
```

- Supported versions are exactly `0.1.0` (archived) and `0.1.1`
  (current); anything else, or an absent version where one is required,
  throws `UnsupportedImplementationVersionError`.
- New runs use `createOperationsController` (current) by default.
- Recorded work is reexecuted with its recorded implementation:
  `recomputeOperationsReportForVersion(report)` and
  `verifyOperationsExperimentForVersion(exported)` read
  `versions.simulation` from the artifact itself and return the
  existing verification shape plus `verifierImplementationVersion`,
  the implementation that actually ran. The API investigation verifier
  (`verifyInvestigationExport`) dispatches the same way and exposes
  the same field.
- The archive is immutable. Never overwrite
  `archive/0.1.0/runtime.mjs` with newer engine output; integrity is
  checked against `bundle.sha256` in the manifest (a regression test
  recomputes it). The build recipe
  (`node packages/simulation/archive/build-archive.mjs`) refuses to
  run once the sources no longer declare `0.1.0`.

## Evidence

- Archived `0.1.0` reproduces the accepted pre-patch runtime exactly:
  full shift 11/28 shipped, 6/6 burst, report recomputation ok,
  per-product inventory conserved.
- Current `0.1.1`: full shift 28/28 shipped with all deliveries still
  honestly `RECEIVING` (inbound remains capacity-infeasible), burst
  metrics byte-identical to `0.1.0` with distinct implementation
  metadata. Sanitized numbers: `evidence/sanitized/r3c-implementation-evidence.json`;
  workload runner: `packages/simulation/archive/verify-runtime.mjs`.
- Recorded E3/E4 artifacts (including the live Meta investigation in
  `evidence/sanitized/`) still verify under their recorded `0.1.0`
  implementation and report `verifierImplementationVersion: "0.1.0"`.
- R2b combined-envelope revalidation remains a separate future gate;
  nothing here certifies physical layout or deployment.

## API consistency and transport contract

An investigation must record one simulation implementation consistently in its outer versions, comparison versions, and every nested per-run report. Mixed supported versions are rejected explicitly; unknown outer versions are rejected. The verifier field identifies the comparison implementation actually replayed even on rejection; it is null when no supported implementation could be selected. Verification does not rewrite imported evidence.

POST `/api/operations/investigations/verify` returns `{ ok, mismatches, verifierImplementationVersion }` directly from the verifier. GET `/api/status` exposes `operationsImplementationVersion` for the current server runtime, independently of a recorded artifact's implementation. These are non-secret metadata fields and verification requires neither a model key nor an inference call.

Focused API coverage is in `apps/api/test/implementation-metadata.test.ts`: archived/current accepted burst evidence, outer/comparison/per-run mixed versions, unknown versions, HTTP field forwarding, status metadata, and zero provider calls without a key. Current acceptance uses a cloned burst with consistent current metadata and actual recomputation, relying on that burst's independently established unchanged metrics; it does not alter the archived artifact or prove full-shift equivalence.

## Actual verifier metadata semantics

The outer declared implementation is used only for consistency checks. When a comparison exists, the API executes `verifyOperationsExperimentForVersion(comparison)` and returns its actual `verifierImplementationVersion`, including for a rejected mixed or unknown outer declaration. Thus mixed outer 0.1.1/comparison 0.1.0 rejects while reporting actual verifier 0.1.0; mixed comparison 0.1.1 reports actual verifier 0.1.1. A missing comparison performs no replay and returns null, even if the outer declaration is supported. The field does not imply successful verification; callers must also check `ok` and `mismatches`.

Literal HTTP and function assertions cover archived/current (0.1.0/0.1.1), mixed outer (0.1.0), mixed comparison (0.1.1), mixed per-run (0.1.0), unknown outer with supported comparison (0.1.0), and missing comparison (null). Tests run serially with an explicit 300-second timeout for local replay cost.
