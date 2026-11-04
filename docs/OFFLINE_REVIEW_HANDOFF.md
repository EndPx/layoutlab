# Offline coordinator review — 2026-11-04

Status: **changes required before U1/R3c acceptance**. The user authorized local review while Muse Code billing is blocked. This review does not replace Muse as implementation owner. No model calls, deployment, payment changes, or production-code edits were made in this review.

## Required corrections

### U1: complete input identity (high)

`apps/web/src/lib/workspace.ts:isStaleReport` compares only scenario ID and seed. `WarehouseWorkspace.tsx` passes only those fields. A changed workload, inventory, geometry, configuration or implementation with the same ID/seed can be described as current evidence.

Independent reproduction: `.coordination/review-u1-context.mjs`, output `.coordination/u1-independent-context-review.json`. Both changed workload and changed implementation return `false` for stale where `true` is required.

Use a stable identity for the complete canonical scenario, execution configuration and actual runtime implementation. Preserve original reports. Add same-ID/seed regressions for geometry, workload, inventory, configuration and version, plus equivalent-input acceptance. Do not infer equivalence from the display label.

### U1: actual replay implementation (high)

`CurrentContext` does not retain its implementation version. `implVersion` always uses `currentImplementationVersion()`, while `loadRecordedScenario` creates a controller using `report.versions.simulation`. Thus a recorded 0.1.0 controller can be described as 0.1.1. Inspection similarly selects the outer report version instead of independently enforcing agreement with its candidate report.

Retain actual version per current/inspection context and display it consistently. Validate agreement of outer/comparison/per-run versions before replay. Unknown or inconsistent versions must reject visibly. Test reset and return-to-current across recorded/current contexts.

### U1: verification state belongs to the exact report (high)

Source review: `WarehouseWorkspace.tsx` keeps `verifyResult` and `verifyError` in component state. Report replacement does not clear or key these values. `recompute()` also assigns its asynchronous result without checking whether the report changed during the request. The persistent Verified message can therefore refer to a previously verified report rather than the currently displayed/exported one.

Tie result and pending verification to an immutable report identity. Clear obsolete results and ignore/cancel stale responses. Acceptance: verify report A, import B, ensure B has no verified badge; also replace A with B while A verification is pending and resolve A afterwards. A failure must not inherit A's success. This finding is source-confirmed; the asynchronous browser regression has not yet been executed.

### R3c: reject mixed implementation versions (high)

Independent verifier execution accepted a report whose outer `versions.simulation` was changed to 0.1.1 while nested comparison remained 0.1.0. It returned `ok: true` with `verifierImplementationVersion: 0.1.0`.

Evidence: `.coordination/review-r3c-versions.mjs`, `.coordination/r3c-independent-initial.json`. Require agreement across outer, comparison and per-run metadata; preserve valid archived 0.1.0 verification. Keep the accepted engine/archive unchanged for this narrow API correction.

### R3c/U1: preserve verifier metadata through HTTP (medium)

`apps/api/src/server.ts` forwards only `{ok, mismatches}` from the verifier; the actual implementation field is stripped. The web helper return type also omits that field. Actual HTTP review returned 200/ok with no implementation metadata and zero provider calls: `.coordination/r3c-http-verifier-review.json`.

Forward and type `verifierImplementationVersion`, then expose it under result details. Test the HTTP response, not only the underlying function.

### U1: correct offline-verification wording (medium)

`WarehouseAssistant.tsx` says verification still works offline when the API server is unavailable. The UI `verifyInvestigation()` actually POSTs to the API and cannot work without that server. Distinguish no-inference verification from browser-only offline capability. The existing local CLI is a separate offline option; do not add another verifier architecture to fix this copy.

## Checks and their limits

| Check | Result | Evidence / limit |
|---|---|---|
| Real Edge unified-workspace story | 1/1 passed | `.coordination/u1-offline-review-after-billing.log`; Run/Pause/Reset/inspect/replay/scenario. API status/budget connection refused because local API was absent. Not a backend or live inference pass. |
| Current stale helper | Two false-current cases reproduced | `.coordination/u1-independent-context-review.json` |
| Archived runtime/source integrity | Archive and 14 source hashes matched | `.coordination/r3c-independent-initial.json` |
| Clean recorded report | Recomputed with 0.1.0 | Same evidence; mixed-version negative case incorrectly accepted |
| Versioned full-shift runtime | Archived 11/28, current 28/28 shipped | `.coordination/r3c-independent-runtime.json`; inbound remains capacity-constrained, not all warehouse work completed |
| HTTP verifier | Clean report passes, version metadata missing | `.coordination/r3c-http-verifier-review.json` |
| Human local artifact integrity | Passed | `.coordination/review-human-integrity.mjs`, `.coordination/r2-human-independent-integrity.json`: original/derivative SHA, GLB header/size, embedded buffer byte identity, mesh/skin/animation definitions, 23 joints and 17 clips |

The human check does not independently validate licensing, gait foot planting, grounding, swept collision envelopes or engine integration. The source manifest itself records that combined human/cart envelopes exceed the currently accepted cart envelope. Do not add the human mesh to existing paths and call physics complete. Distance-driven animation phase alone is not proof of zero foot sliding. Legal exclusions of alternative asset providers also remain worker findings, not independently revalidated conclusions in this review.

## Resume order and file ownership

1. Resume the blocked API correction task `task_9a589ecf3690` after billing recovery: server/API only, mixed-version rejection and HTTP metadata. Preserve archive and engine.
2. Resume U1 `task_5fdc8ef3826a`: workspace identity/version/verification state/copy and focused regressions. Consume the corrected API field. Do not edit engine files concurrently.
3. Coordinator reviews both diffs, reruns focused checks and real Edge acceptance including verification/report replacement, then considers commit/push/deployment.
4. Continue L1 manual packing-station editing, then L2 Muse layout proposals; R2 human/cart admission remains a separate gate. Do not mark these done from static assets or the unified shell.

Both Muse dispatches are stopped/released with tasks blocked. Do not retry while billing is unresolved, switch executor silently, or refill the separate app inference allowance. The current public release remains the previously deployed R1 build; none of this document claims a new deployment.
