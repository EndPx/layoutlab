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
| `0.1.1` | Put-away liveness fix (declared-order first placeable row within a delivery, yield-to-parking for blocked laden carts, place-time revalidation, staged collecting claims) | Current source in `packages/simulation/src`; independently frozen unused ESM in `packages/simulation/archive/0.1.1/runtime.mjs` |

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

## R2g: frozen 0.1.1 evaluator prerequisite

The0.1.1 archive is an executable browser-compatible ES2022 single-file ESM, NOT an active router change. SIMULATION_VERSION remains0.1.1, selectors still use current source for0.1.1, no archive import was added to web/API, and shared dist was not rebuilt. Existing0.1.0 archive/manifest/licenses/build and verification recipes remain byte-identical; their raw hashes are captured and checked in the new independent manifest.

Artifact: packages/simulation/archive/0.1.1/runtime.mjs,530030 bytes, SHA256 `9224ce9eb18b88d267bb1eab79767e0f31db2dad6f180d42152cb1df58fd4605`. Its adjacent manifest pins committed source fdeb60820ac118522c81713d3c699f1bf629efea, every simulation/core source Git blob and actual build-input byte hash, Node v24.18.0, Vite8.3.5, zod4.6.7/MIT, entry/config/recipe hashes and prior archive hashes. The adjacent LICENSES.md reproduces the bundled zod license; repository source ownership/licensing is not changed. Narrow .gitattributes entries preserve new artifact/provenance/recipe bytes on checkout.

The explicit entry exports operation creation, termination, metrics, parsers and report recomputation; experiment run/verify; and accepted station/rack/rotation/agent layout APIs and verifiers. It imports no runtime selector or0.1.0 archive. Existing core source is explicitly aliased into the bundle, avoiding dependence on an incidental core dist build. Static checks find no external import, dynamic import or require call in the emitted module. This establishes standalone ESM structure and Vite browser targeting; no separate visual browser test is claimed.

Recipe: `node packages/simulation/archive/build-archive11.mjs`. It refuses an existing artifact/manifest, source drift from pinned Git blobs, implementation-version drift and build dependency drift. It rechecks source and old archive hashes after building. The recipe is a provenance/reproduction description, not permission to overwrite an archive. Guard tests simulate source/version drift in process-local builtin wrappers without modifying source files or archived bytes. Vite emitted an inlineDynamicImports deprecation warning; the build succeeded with the installed pinned tooling. Future tooling modernization must create separately reviewed artifacts rather than silently regenerate this one.

Executable verification from repository root:

```
node packages/simulation/archive/0.1.1/verify.mjs
node packages/simulation/archive/0.1.1/verify-extra.mjs
node packages/simulation/archive/0.1.1/verify-preserved-layout.mjs
```

Evidence in evidence/sanitized/r2-runtime11 records exact current-vs-archive burst/full-shift semantic report equality, metrics equality, entire inventory snapshot/bucket equality and successful recomputation under both implementations. Burst ships6/6, full shift28/28; the same inbound limitations remain. Current experiment output equals frozen output and cross-verifies. Existing recorded station and quarter-turn reports reexecute through the archive; preserved main rack and agent-placement reports are separately checked. Newly generated rack/agent reports with1000ms safety ceilings additionally test current-to-frozen equality without claiming workload completion. Historical E3 and API-fixture embedded comparisons remain declared0.1.0, verify under archive0.1.0 and explicitly reject under0.1.1. This covers simulation payloads only: no API route/provider call or new live Meta request is made, and old outer API envelope verification remains the existing API's responsibility.

Future selector change must route recorded0.1.0 to its existing frozen archive and recorded0.1.1 to this new archive, while a NEW implementation identifier selects future human motion behavior. Update supported-version constants, operations/experiment/layout verification dispatch, API metadata and nested report-version consistency together with explicit unsupported-version rejection. Preserve input contract identifiers unless actual input shape/semantics require a separately migrated contract. Never rewrite old result versions or use current motion rules to verify old0.1.1 timing. Archive import into production is a later reviewed change; this gate leaves active behavior unchanged.

## Smallest upcoming motion transport seam (proposal only)

The existing operations controller creates `createTransportDomain({scenario,onGrant})`, binds it to its OWN kernel via bindKernel, and calls handleMovementCompleted before operations handling callbacks. The narrow injection point is an internal typed transport-domain factory option at that construction site, defaulting to the existing factory for preserved implementations. The new version would supply an adapter around the certified motion planner/reservation ledger while retaining ONE operations kernel, not introducing a second clock or warehouse simulator.

The adapter must implement the domain's existing requestMove/cancelPlan/poseAt/snapshot/dispatch/diagnostic lifecycle, with a versioned richer move request that supplies engine-owned destination/task identity and required heading, and a richer grant/snapshot that records body/coupling, explicit forward/reverse modes, Limits, certified actions, reservation version, continuous duration and rounded endEventMs. It must translate kernel movement-completion events into committed motion arrival before invoking the existing task handler; early/stale events reject and no handling/inventory work starts from a renderer query or merely requested route. Persist wait outcomes and retry policy, initial/terminal occupancies, task-linked handling holds, arrival/cancellation events and full rejected-event replay. Current GrantedPlan/Trajectory and position-only callbacks cannot simply be relabeled because they assume existing constant-speed timing and lack heading/body/handling authority.

Keep inventory/resource ownership in operations: receiving/pick/place/unload/packing ledger changes remain completion-time commits. Add stationary motion handling admission at the operation's existing handling-start/end windows, using actual engine-configured durations rather than the R2f500ms diagnostic holds; physical transfer and resource capacity must succeed before a handling event can claim completion. Separate human/cart/load ownership and resulting footprint changes require their own explicit committed events and admission, not a visual parent-node detach. Preserve the existing source as an archived implementation before injecting any new factory. Reexecute old reports against frozen archives and test new-version canonical workload, reservations, timing, event priority and replay before renderer integration. No such seam or engine change is implemented in R2g.

Coordinator R2g acceptance2026-11-05: independent review-runtime11.mjs confirms530030-byte bundle SHA9224ce9eb18b88d267bb1eab79767e0f31db2dad6f180d42152cb1df58fd4605,42 pinnedGitblobs,8 unchangedoldarchivefiles, exact current/archive burst report+inventory equality. A separate Git-published-byte check confirms all8 preservedoldarchive hashes also match HEAD blobs, not only workingcopy. Runtime selector/currentSIMVERSION remain0.1.1. Archive accepted as immutable prerequisite, not newmotion integration or public capability.
