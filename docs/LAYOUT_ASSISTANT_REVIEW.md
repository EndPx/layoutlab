# Layout assistant L2c1 review

L2c1 implements interpretation and separate user approval inside the existing warehouse workspace. Public deployment and the coordinator-owned Nginx gate remain pending; this slice must not be deployed before L2c2 preview and Apply are complete.

## Changed files

- `apps/web/src/lib/layout-investigations.ts`: same-origin typed client, record/authority validation, canonical scenario/config/implementation identity, exact create/approve/cancel/report/verify routes and sanitized API failures.
- `apps/web/src/components/LayoutAssistant.tsx`: explicit live/consent/budget guards, question, editable interpretation approval, deadline/progress, cancellation, previous-context evidence and complete raw reports in technical details.
- `apps/web/src/components/WarehouseAssistant.tsx`: supported action choice; preserves the existing hypothetical service-duration functionality and its state.
- `apps/web/src/components/WarehouseWorkspace.tsx`: passes the active implementation version alongside the existing canonical scenario/config props, including applied station geometry.
- `apps/web/src/lib/layout-investigations.test.ts`: five adapter/validation tests.
- `apps/web/e2e/layout-assistant.spec.ts`: ten real Edge route-mock tests, labeled MOCK UI lifecycle only.
- `docs/LAYOUT_ASSISTANT_REVIEW.md`: this review.

## Behavior and authority

Only deliberate Interpret sends create, with `{scenario,executionConfig,question,safetyCeilingMs,mode:'live',consent:true}`. Mount, action selection, status refresh, polling and context reset do not create investigations or call a model. Status/budget use existing same-origin helpers. Live start stays disabled for missing status, unavailable inference, unavailable guarded allowance, zero/insufficient budget or missing explicit consent. A 401 explains the existing `/live-access` browser sign-in route; refresh and deliberate retry are user actions. There is no automatic create/approval retry and no provider key in browser code.

Interpretation remains a proposal. Objective, packing-station allow IDs, maximum moved stations (0â€“1), translation cap (0â€“5000 mm) and per-station in-room centre rectangles are editable controls. Receiving and any server-locked station remain locked; staff, workload, service duration and seed remain fixed; grid remains 100 mm. Browser validation reuses the production constraints parser, checks station IDs and room bounds, and sends the corrected `{approval:{objective,constraints,allowedRegions}}` exactly. Server validation remains authoritative. Approval addresses the same run ID and does not reset counters/deadline or create a run; approval remains permitted at exhausted allowance because the existing server claim controls continuation.

`AWAITING_APPROVAL` remains active and is never described as completed. The displayed bounded deadline includes waiting. Terminal completed/failed/cancelled/timed-out names are shown literally with errors retained. Polling is serialized and aborts on cleanup; action generations prevent an obsolete status response from replacing an approval result. Context identity includes full canonical scenario, execution config and implementation version from both workspace and returned report input/version, rather than trusting run ID. Context revision invalidates approval even after switching away and back. Prior evidence is labeled; cancelling an old run remains possible. Requests never alter the workspace controllers or LayoutEditor.

Run identity, complete report, corrected draft, previous evidence, action selection and polling ownership now reside in the workspace-level `useLayoutAssistant` holder. Inspector and manual-editor selection can unmount `WarehouseAssistant` and its presentation without discarding that holder or triggering another create. Full page reload/workspace destruction persistence and export/replay remain L2c2. Request/report failures include explicit HTTP 413 handling for the API's 1 MiB JSON body limit, including `{report}` wrapper; no claim is made that arbitrary workloads fit.

## Verification

- `npm run typecheck --workspace @layoutlab/web`: passed after final component changes.
- `npx vite build apps/web --config apps/web/vite.config.ts`: passed after final component changes; existing large JavaScript chunk warning remains (about 1.72 MB uncompressed / 462 kB gzip).
- `npx vitest run apps/web/src/lib --maxWorkers=1`: 7 files, 76 tests passed. This is the root Vitest discovery result for the web helper path, not a claim that every standalone test file is included by that configuration.
- `npx vitest run apps/web/src/lib/layout-investigations.test.ts --maxWorkers=1`: 5 tests passed after final test input cleanup. Exact URL/payload, create-count independence, retained evidence, canonical version/content identity, malformed responses, fixed authority, region bounds and 401/413/no retry are covered.
- From `apps/web`, `$env:M3C_CHANNEL='msedge'; npx playwright test e2e/layout-assistant.spec.ts e2e/unified-workspace.spec.ts --project=desktop --reporter=list`: final results recorded below.

Edge uses the coordinator's existing Vite server on port 5173 and installed `msedge`, with layout API routes mocked. Cases cover explicit live and consent, zero allowance/unavailable status, create -> interpretation -> corrected objective/station IDs/translation/rectangle approval -> COMPLETED, separate cancellation, active burst versus full canonical inputs, no controller clock mutation, delayed poll after context switch and switch-back, delayed request after document unmount, 401/malformed responses without automatic resubmit, and report version mismatch despite the same run ID. This is **MOCK UI lifecycle only**, not API fixture integration or provider evidence. The unchanged U1 unified-workspace story is included.

Earlier test attempts used `scenario.orders` instead of canonical `orderSchedule` and failed in the test assertion; corrected to the actual schema. Final rerun is authoritative. No API, simulation, assets, dependency or deployment source was changed; unrelated concurrent files were preserved. No paid calls, commits, push or deploy occurred.

## L2c2 pending gates

- Candidate visual preview and baseline/candidate comparison.
- Explicit Apply to canonical workspace, with appropriate controller rebuild and stale-context guards.
- Complete report export/import/replay and verification UI using retained evidence.
- Actual HTTP fake-provider Edge integration, separate from route-mock UI tests.
- Coordinator deployment/auth gate and any subsequent full L2 release acceptance.

Historical pre-retention Edge run: 7 passed in 48.7s (6 mock cases plus U1); superseded by the 11-case follow-up below.


## Coordinator follow-up corrections

The simulation evaluation ceiling is declared as `LAYOUT_EVALUATION_CEILING_MS = 7200000`, matching `LayoutEditor`. Create now uses that value instead of the incorrect 120000 ms simulation horizon. The UI explicitly discloses the two-hour ceiling and that unfinished work is truncated at that scope; the live request deadline remains the deadline in the returned report, including approval waiting. These are separate limits.

State and polling now belong to a workspace-level holder, retained across inspector/assistant/action changes. A real Edge case edits the objective, selects PACK-1 in the inspector, observes continuing GET polling, returns, and asserts the same corrected draft and one create. Stale cancellation validates the response against the original run context and preserves its previous-context label, rather than comparing cancellation against the new workspace scenario. The original run ID remains the cancellation target.

Additional Edge route-mock cases cover stale cancellation, malformed nested constraints/null region/duplicate IDs without a page crash, and a delayed create response after a scenario switch. Existing delayed status and switch-back guards remain covered. Approval validation reads `parseApprovedConstraints` success before using its typed constraints. No JSON approval editor remains.

Latest follow-up verification supersedes the earlier run totals: **11 real Edge tests passed in 56.5s** (10 MOCK UI lifecycle only cases plus unchanged U1), **76 helper tests across 7 discovered files passed in 6.93s**, and web typecheck passed after correcting the intentional-malformed-test fixture type. Direct web Vite build passed with the existing large-chunk warning. No API/simulation/assets/dependencies/deployment edits, provider calls, commit, push or deployment occurred. L2c2 pending gates above remain unchanged.


## Final acceptance handoff check

Inspector unmount persistence is implemented by the workspace holder, not pending. Only persistence across destruction of the whole workspace/page remains outside this slice. The stale Cancel regression explicitly asserts `Previous context evidence: CANCELLED`, absence of a misleading current-context error, absence of an approval button, and the original `/mock-run/cancel` URL with exactly one create. No L2c2 functionality was added.

The coordinator independently reported `.coordination/review-l2c1.mjs` passing submitted ceiling 7200000, retained status/Cancel after inspector, and one create. That script is coordinator-owned; the worker does not claim ownership of its evidence or rerun it as independent verification.


Coordinator L2c1 acceptance2026-11-05: workspace-owned holder and original-context cancellation reviewed; independent Edge route-mock reproduction confirms7200000ms simulation ceiling, retained run/Cancel after inspector, exactly one create and0 model calls. Final11-test worker evidence covers mock lifecycle, not actual backend inference. L2c1 is released for L2c2 preview/comparison/Apply/export and real HTTP fixture acceptance. Public deployment remains gated.
