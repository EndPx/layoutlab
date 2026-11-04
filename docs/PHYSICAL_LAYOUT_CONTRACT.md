# Physical layout contract (L0 foundation, revision 3)

Status: **L0 only, revised after independent review**. Pure, isolated
foundation prepared for coordinator integration. The main application does
**not** support layout editing yet; no capability is advertised until the
L1/L2 gates pass. Historical service-duration experiments are a separate
surface and are not relabeled as layout optimization by anything here.

Code: `packages/simulation/layout-draft/src/` (compiled only to
`packages/simulation/layout-draft/.out/`; the shared simulation `dist` and
every existing source file are untouched). Tests:
`packages/simulation/layout-draft/test/layout-draft.check.mjs` (20 tests).

## 1. Proposal and approved-constraints trust boundary

All coordinates are integer millimetres in the canonical scenario room
frame (`room-mm:x-east,z-north,origin-(0,0),integer-mm`): `x` in
`[0, room.widthMm]`, `z` in `[0, room.depthMm]`. A packing-station target is
exactly one of `ABSOLUTE_CENTER_MM {centerMm}` (room-frame centre) or
`DELTA_MM {deltaMm}` (offset from the station's current centre).

```text
PackingStationTranslationProposal {        // untrusted input (e.g. a model)
  kind: "PACKING_STATION_TRANSLATION"
  proposalId: string (1..128)
  parent: { scenarioId, scenarioContentSha256, schemaVersion, engineVersion }
  entityId: string                         // PACK-1 | PACK-2 in the main fixture
  target: ABSOLUTE_CENTER_MM | DELTA_MM
}
ApprovedLayoutConstraints {                // authority: user/server context only
  allowedEntityIds, lockedEntityIds,
  maxMovedEntities,                        // actually-moved entities (0 consumes no budget)
  maxTranslationMm,                        // Chebyshev max(|dx|,|dz|)
  snapGridMm,
  requireSameWorkerCount: true, requireSameServiceDurations: true,
  requireSameWorkload: true, requireSameSeed: true   // not optional
}
```

The proposal carries **no constraints**: parsing is strict and a
`constraints` key (or any unknown key, e.g. a smuggled `parkingSlotMm`) is
`SCHEMA_INVALID`. A model therefore cannot grant itself allowed entities or
raise budgets by editing its own proposal. Approved constraints are a
separate required argument to validation/comparison
(`APPROVED_CONSTRAINTS_REQUIRED` when missing — never defaulted), are
recorded verbatim plus their content hash in every export, and are
re-validated by the offline verifier. Receiving `RCV-1` is structurally
locked even if the approved set omits it from `lockedEntityIds` or
allow-lists it: locked wins over allowed. Parent identity is `scenarioId`
+ sha256 of the canonical (sorted-key) JSON of the parsed baseline, because
operations scenarios carry no `revision` field (the bindings file's
`fixtureSha256` pattern). Mismatch is `STALE_REVISION`. Forward-compatible
kinds `RACK_QUARTER_TURN`, `RACK_TRANSLATION`, `AGENT_INITIAL_PLACEMENT`
return one explicit `UNSUPPORTED_TRANSFORM` issue; agent teleport cannot be
expressed by this contract at all.

## 2. Attachment ownership (canonical, never by proximity, no aliases)

Each supported station owns exactly: its resource `servicePositions`, its
resource `queueSlots`, one obstacle footprint, and one asset placement.
Main-fixture literals (verified field-by-field on every use; drift throws
`ATTACHMENT_MISMATCH`):

| Station | Centre | Obstacle | Service | Queues |
| --- | --- | --- | --- | --- |
| PACK-1 | 20500,5000 | OB-PACK1 19566..21434 x 4390..5610 | PACK1-S1 20500,6900 | 22500,6900 / 22500,8600 / 22500,10300 |
| PACK-2 | 20500,11000 | OB-PACK2 19566..21434 x 10390..11610 | PACK2-S1 20500,12900 | 22500,12000 / 22500,13700 / 20500,9400 |

Ownership rules enforced in `buildStationAttachmentMap` (regression-tested
against the independent alias reproduction):

- `stationId` must equal `resourceId`; aliasing PACK-1 onto PACK-2's
  resource/obstacle/coordinates is rejected and can never move the locked
  other station. `applyPackingStationTranslation` re-checks this.
- Station, resource, obstacle and slot ids are unique across bundles; no
  duplicate or shared ownership.
- For `main-warehouse-1` a bundle must equal the canonical
  `MAIN_WAREHOUSE_ATTACHMENTS` entry (or the identical bindings-derived
  bundle from `attachmentsFromBindings`); even a coherent-looking obstacle
  swap is rejected.
- For generic fixtures, the declaration is the trusted ownership boundary
  only after exact verification: obstacle rect equals the scenario
  obstacle, declared centre equals its centre, slot ids/coordinates equal
  the resource slots. Proximity is never used to infer ownership.

Sequential edits on the same scenario id are supported: canonical
ownership for `main-warehouse-1` is compared by identity (station/resource/
obstacle/asset), obstacle dimensions and attachment-relative geometry
(each slot's and the rect's offset from the station centre), canonically
and key-order free — never by absolute coordinates. A moved station
therefore remains a valid parent: carry its `attachmentsAfter` bundle
forward as the next declaration, chain the parent content hash, and the
next move validates against the moved scenario; a proposal still citing
the pre-move parent hash is `STALE_REVISION`, discarding candidates
restores the original baseline exactly, and a non-rigid deformation breaks
the relative offsets and is rejected as ownership drift (aliases and swaps
stay rejected). Bindings-derived declarations remain anchored to the
baseline fixture; sequential flows use the carried-forward bundle.

Applying a proposal is one exact rigid translation of the obstacle rect
and all service/queue coordinates on a clone, re-parsed canonically. A
supplied candidate is compared to the reconstruction by **full leaf
values** (`CANDIDATE_VALUE_MISMATCH` per differing path), not merely by
changed-path sets — deforming an attached offset while keeping the same
paths is rejected; any changed leaf outside the bundle is additionally
`EXOGENOUS_CHANGE` (worker count, service durations, workload, seed,
stock, unrelated geometry). IDs, stock, assignments, schedules, durations,
agent profiles/parking and seed stay identical otherwise (generic leaf
diff proves it). The baseline is never mutated; undo is discarding the
candidate (exact baseline hash restored). Viewer placement is resolved
from the candidate bundle (`viewerPlacementFromCandidate`), never from
frozen baseline bindings.

## 3. Validator: baselineValid / candidateValid, all-resource access

`validateLayoutCandidate({baselineScenario, candidateScenario?, proposal,
attachments, approvedConstraints, executionConfig?})` (async: content
hashing is WebCrypto) returns `{ok, baselineValid, candidateValid, issues,
baselineIssues, candidateIssues, introducedIssues, repairedIssues,
routes}`. `ok === candidateValid`: **every remaining candidate error
counts** — pre-existing errors are attributed (`introduced` false,
`repairedIssues` lists baseline errors the candidate removes) for
diagnosis only and never suppress validity. Issues are entity-linked
`{code, severity, entityId, relatedEntityId?, field?, message,
introduced?}`; a blocker entity is named only where rect arithmetic
proves the pair (`OVERLAP`, `CLEARANCE_VIOLATION`), route failures report
only the nav reason.

Mandatory access semantics (declared; same checks on baseline/candidate):

| Subject | Clearance (not covered by any obstacle/rack) | Navigability (inflated footprint) | Required routes |
| --- | --- | --- | --- |
| Packing service/queue | yes | every picker profile | each picker parking → each slot |
| Receiving service/queue | yes | every putaway profile | each putaway parking → each slot; receiving service → each approach |
| Dispatch service/queue | yes | — (staffed; no agent route is physically required) | — |
| Location approaches | yes | every mobile profile | each picker parking → each approach |
| Parking (initial agents) | yes | own profile | (route origins above) |

Plus: every obstacle inside the room, every obstacle/rack pair
non-overlapping, canonical parsing and accepted-controller admission for
both sides. Moving a station over another resource's point (e.g. PACK-1
onto dispatch `DSP-S1 (12000,3000)` in the corridor) is rejected with the
covering obstacle named. Footprints are never shrunk and inputs are never
altered to force validity.

## 4. Comparison, classification and offline verification

`runLayoutComparison({... approvedConstraints, safetyCeilingMs?})` runs
only a valid candidate, through the accepted engine
(`createOperationsController` → `runOperationsToTermination` →
`operationsRunMetrics`; verifier also uses `recomputeOperationsReport`).
No second simulator, no distance-to-time conversion. `measurement` is:

- `measured` — baseline and candidate both valid: both reports, delta and
  a classification under the declared criterion (stored verbatim in
  `decisionCriterion`): Pareto over shipped (desc), makespan (asc,
  complete cohorts only), last-shipped (asc, within-window timing only —
  never a completion time), total wait and backlog (asc). Better somewhere
  and worse nowhere = `improved`, mirror = `worse`, both directions =
  `mixed` (distinct from equal), all equal = `no-improvement`.
- `candidate-only-repaired` — baseline invalid, candidate valid: the
  candidate runs as a preview with **no fabricated baseline report, no
  delta and no improvement claim** (`not-measured` label).
- `not-measured` — candidate invalid: no reports at all.

`evaluationScope` labels truncation explicitly: run mode, horizon/cutoff,
ceiling, stop reasons, `ordersInScenario`, `truncated`,
`fullHorizonEvaluated`, and `explanation` states the shipped counts inside
the evaluated window in plain language. Exports are schema
`layoutlab.layout-comparison/2` (`layoutlab.layout-draft/2`).

`verifyLayoutComparison(export)` validates the **full envelope** before
rerunning: required fields present (missing = fail, nothing defaulted),
schema/draft/engine versions, `decisionCriterion`, approved constraints
and their hash, parent/config identities, and measurement consistency;
then it reconstructs the candidate from baseline + proposal + attachments
under the declared approved context and compares candidate scenario,
transform, attachments, changed fields, validation, both reports/metrics/
terminations, delta, label and scope. Mutating outer versions, lowering
the approved translation budget to 1mm (even with an honestly recomputed
constraints hash), changing a service duration/workload/worker count/
coordinate, or fabricating a total all fail. Clean **and** invalid exports
verify as valid evidence of their actual outcomes. The verifier reports a
`kind` — `measured`, `candidate-only-repaired` or `rejection`: an export
whose proposal is structurally invalid (e.g. an unexpected field) or whose
candidate is geometry-invalid verifies as a **rejection**, meaning the
recorded rejection (exact issues, `not-measured`, no reports) replays
bit-for-bit under the declared approved authority; it never calls the
layout valid and never runs a candidate simulation. Tampering with the
recorded rejection reason or status fails replay.

Commands:

```text
node scripts/layout-planning-build.mjs            # compile draft only (.out)
node scripts/layout-planning-test.mjs             # build + 20 isolated tests
node scripts/layout-planning-browser-check.mjs    # portability (see §6)
node scripts/layout-planning-compare.mjs --preset valid|overlap|out-of-room
node scripts/layout-planning-verify.mjs evidence/sanitized/layout-l0-main-valid.json
```

## 5. Independent oracles and measured results

Hand timing oracle (corridor, unchanged and independently confirmed):
2000 + 4000 + 3000 + 2000 + 2000 + 10000 + 5000 = **28000ms** baseline;
packing +2000mm east → **30000ms**, delta **+2000ms**, honestly `worse`.
No-change returns identical counts/times.

Main fixture (`PACK-1 (20500,5000) → (20500,4000)`, config pick 2000 /
unload 1500, ceiling 7200000ms): both runs stop `IN_PROGRESS` at the
ceiling of an 8h (28800000ms) fixed-window scenario — **truncated,
7 of 28 orders shipped in-window on both sides**, makespan null (no
complete cohort), total wait −2000ms but last-shipped +3000ms, therefore
`mixed`. No claim is made about the unevaluated remainder and the workload
was not tuned. Evidence: `evidence/sanitized/layout-l0-main-{valid,
overlap,out-of-room}.json` (fixture sha256 `c6e4f208…2660cb`, 23520 bytes,
matching bindings, unchanged after every run).

## 6. Portability

The draft module graph contains **no Node-only imports**: hashing is
WebCrypto (`crypto.subtle`) behind the async boundary of
`contentSha256`/`validate`/`runLayoutComparison`/`verifyLayoutComparison`
(revision-2 breaking change from the revision-1 sync Node API). Pure
geometry preview (`applyPackingStationTranslation`,
`viewerPlacementFromCandidate`, `snapToGridMm`) needs no filesystem,
network or secrets. Two layers of evidence: (1) the maintained helper
`scripts/layout-planning-browser-check.mjs` is explicitly scoped as a
static-graph + runtime-import check (import graph is `node:`-free,
compiled entry imports, WebCrypto hash matches Node's crypto, in-memory
preview works); (2) the coordinator independently ran the **actual**
bundler and browser — installed Vite build API + Microsoft Edge
(checked 2026-11-04T12:55:35Z, coordinator-owned evidence
`.coordination/review-l0-browser.mjs` / `layout-browser-entry.js` /
`l0-browser-review-result.json`): a 478387-byte bundle in which WebCrypto
hashing and an in-memory engine comparison ran 28000 → 30000 with offline
verification `true`. No install was needed for either layer.

## 7. Browser/UI integration API (U1, L1, L2 — not built here)

| Need | Call |
| --- | --- |
| Attachment map | `attachmentsFromBindings(scenario, bindings)` / `buildStationAttachmentMap` |
| Ghost preview | `snapToGridMm` + `applyPackingStationTranslation` → `attachmentsBefore` vs `viewerPlacement` |
| Live validity | `validateLayoutCandidate` → `candidateIssues` (all remaining errors) + `introducedIssues` for diagnosis |
| Undo | discard the candidate bundle; keep the immutable baseline (hash-checked) |
| Test layout (L1) | `runLayoutComparison` (with user-approved constraints) → `measurement`, reports, delta, `improvement`, `evaluationScope` |
| Muse proposal (L2) | model output → `parseLayoutProposal` → user approves constraints separately → same validator/comparison; invalid/worse/mixed kept |

L2 keeps the existing bounded Meta workflow exactly: persistent allowance
and server caps `MAX_REQUESTS_PER_TRIAL = 4` / `maxProposals = 3`
(`apps/api/src/benchmark.ts`) are untouched; this task adds no model,
budget or allowance code.

### Minimal integration diff (coordinator gate, not done here)

1. Move `packages/simulation/layout-draft/src/*.ts` into
   `packages/simulation/src/layout/`, export from
   `packages/simulation/src/index.ts`, and rebuild the simulation dist
   once (R1 inactive). The bundler+browser check is already proven (§6);
   re-run it against the integrated public entry.
2. Adapt the isolated suite into `packages/simulation/test/layout.test.ts`
   (same literals/oracles) for the repo gate.
3. U1/L1 consume the API above with baseline/candidate labelling per the
   unified-workspace requirements; L2 translates approved constraints +
   model proposals into this contract only.

Until then the main application does not support physical layout editing.

## 8. Known limitations

- Single-lane packing-station translation only (PACK-1/PACK-2); rack
  rotation and agent initial placement remain explicit L3 stubs.
- Route checks are static (agents at initial slots, eligible profiles);
  dynamic traffic admission remains the engine's job during runs.
- Main-fixture comparisons at the 2h ceiling evaluate a truncated window
  (labelled, §5); a full-horizon (8h) run is possible by raising the
  declared ceiling at proportional wall-clock cost.
- Content hashes identify inputs for replay, not authorship.
## Coordinator foundation acceptance (2026-11-04)

Accepted after independent review of all earlier false accepts plus sequential
parent edits and generated rejection replay. The original blocked service,
constraint authority, attachment alias, changed-value and envelope tamper cases
reject; a moved parent supports another edit; rejection evidence verifies as
kind rejection without claiming a valid layout. The literal corridor remains
28000->30000ms. Fresh existing-Vite bundling and actual Edge execution passed
on the final bytes (480094B bundle, hash/comparison/recompute succeeded).
Evidence: layout-l0-independent-review.json and layout-l0-browser-review.json.
Build the accepted simulation workspace first on a fresh checkout; then the
isolated draft build/test commands above. This acceptance unblocks the L0
prerequisite for L1, not main-application editing or unsupported L3 transforms.
