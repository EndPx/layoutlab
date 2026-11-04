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

Final frozen-source rerun: web typecheck passed; direct web Vite build passed (existing chunk warning); web helper discovery 7 files / 76 tests passed in 4.84s; real Edge 11 tests passed in 52.7s including strengthened stale-cancel assertions and unchanged U1; git diff --check passed. Runtime source remained unchanged during this acceptance handoff.

## L2c2 — verified results, initial preview and explicit Apply (local only)

This section supersedes the L2c1 pending gates for preview/comparison/Apply, report export/import and local fake-provider HTTP integration. It does not establish live Meta inference, deployment/auth protection or production readiness. The coordinator still owns the Nginx/release gate; no public deployment was performed.

### Result path and trust boundary

`LayoutResults.tsx` owns its state through `useLayoutResults` in the existing `WarehouseWorkspace`. The same main viewer displays the derived initial candidate and original-footprint ghost; it does not create another warehouse view. The active current controller is paused and retained. Apply explicitly creates a fresh versioned controller using the existing manual-layout semantics, adds comparison history, retains the original context and enables the existing Return to original run action. Reset reconstructs the applied initial scenario, while Return original restores the retained original controller and context. Inspector/action changes do not discard the run, report, draft, selection or verified result.

The results table includes baseline and every proposal without filtering out invalid, worse, mixed or unchanged outcomes. Invalid rows retain their issues and never create a candidate scene. Saved metrics, relocation and evaluation-scope explanation are shown separately from the provider hypothesis and model recommendation. Source labels distinguish server response, imported evidence, local fixture and recorded fixture; verification is described as consistency checking, not proof of model/user authorship.

An explicit preview first sends the complete unprojected report to the keyless HTTP verifier. It then parses the selected proposal and approved constraints with production parsers, checks the comparison's exact report input/authority/proposal binding, runs production local validation and comparison verification, derives the rigid bundle from the production attachment resolver and checks that its scenario exactly equals the measured candidate scenario. Only this derived scene can enter the viewer. Apply additionally requires the exact current canonical parent scenario/config/implementation, context revision, full report identity, selected candidate, successful measured comparison and COMPLETED run state. A scenario/config/version, selected proposal, full report or reset revision change aborts/invalidates pending results. Stale reports remain inspectable/exportable but cannot Apply.

Full-report export/import preserves all API evidence. Malformed imports clear candidate authority and show an error. Imported/recorded lifecycle evidence does not resume paid approval or take ownership of a server run. A stale input can be explicitly loaded as current only after successful full-report HTTP verification and production scene resolution; loading it grants no candidate Apply authority, which still requires a new exact preview proof. Browser requests use the existing layout namespace; HTTP 413 explicitly names the 1 MiB JSON-body limit including the report wrapper, with no arbitrary-workload sizing claim.

The recorded example at `apps/web/public/evidence/layout-investigation-fixture.json` is an actual sanitized engine report generated by the local fixture integration. Loading it makes no inference, works with zero allowance for evidence inspection, and is labeled Recorded FIXTURE rather than live Meta. Its valid proposal is **worse**, not an invented improvement: baseline and candidate ship 6 with makespan 502400 ms and backlog 0, while total waiting changes from 614900 to 623600 ms. The invalid earlier proposal and the model's separate selection of the worse result remain visible.

### Files in this slice

- `apps/web/src/components/LayoutResults.tsx`: workspace-owned verification/selection/preview authority, result UI, full export/import and recorded example.
- `apps/web/src/lib/layout-results.ts`: typed proposal evidence, complete report identity and production candidate/scene resolution.
- `apps/web/src/lib/layout-results.test.ts`: malformed/duplicate evidence, retained invalid results, full identity, exact scene reconstruction and altered-metric rejection.
- `apps/web/src/components/LayoutAssistant.tsx`: importable retained evidence, explicit input-context adoption, origin/approval ownership guards.
- `apps/web/src/components/WarehouseAssistant.tsx`: results view beside the existing layout action.
- `apps/web/src/components/WarehouseWorkspace.tsx`: one-viewer initial preview, controller-preserving Apply/return/history, manual preview handover and explicit report input context.
- `apps/web/e2e/helpers/layout-http-fixture.ts`: loopback fake Meta transport, actual existing compiled API, temporary budget ledger and four-call feedback-driven lifecycle.
- `apps/web/e2e/layout-results-http.spec.ts`: actual HTTP Edge acceptance with screenshots/recording and preserved full report.
- `apps/web/e2e/layout-results-race.spec.ts`: separately labeled mocked-verifier race regression; it is not the actual HTTP fixture proof.
- `apps/web/public/evidence/layout-investigation-fixture.json`, `evidence/sanitized/l2c2/*`, and this document.

### Evidence and limits

The actual HTTP test uses the existing Vite 5173 proxy to the real local API on 3001 and a loopback fake provider on an ephemeral port. It uses fixture-only credentials and a temporary 0.25 USD ledger, never real credentials or a public model service. It completes create -> interpretation -> corrected approval -> invalid engine feedback -> valid rigid move -> finish within four provider calls. Full-report verify, viewing, export/import, Apply and input loading leave the provider count at four. The saved ledger shows one committed claim and zero available allowance. The report source is `fixture`, model `layout-http-fixture`; real Meta requests are zero.

Actual artifacts:

- `evidence/sanitized/l2c2/http-report.json`: complete report from the actual API/engine lifecycle.
- `evidence/sanitized/l2c2/http-browser.json`: provider count, invalid feedback, baseline/parent retention, reported and viewer coordinates, metrics, guard outcomes and ledger snapshot.
- `evidence/sanitized/l2c2/desktop-verified-preview.png` and `mobile-390-verified-preview.png`: installed Edge at desktop and 390px viewport, with page overflow asserted at most 1px.
- `evidence/sanitized/l2c2/actual-http-edge.webm`: real Edge recording of the local fixture lifecycle.

The actual fixture candidate and viewer both place PACK-1 at (20500, 4000) mm. Full wrapper oversize receives HTTP 413, altered saved metrics fail recomputation, invalid proposals cannot preview/Apply and stale parents cannot Apply. The separate verifier race test delays a verification response, changes the parent context and proves it cannot restore preview or Apply authority. Existing U1 and manual-layout stories remain required regression checks. Final frozen-source results are appended below after completion.

No API, simulation/engine, asset source, dependency or deployment configuration was edited. No shared build, real model call, budget refill, commit, push or deployment occurred. Test-generated historical L1 artifacts are restored after the regression so unrelated evidence remains unchanged. Full L2 live inference is still unverified because the real account/allowance path has not been exercised; the production provider was not switched to Sol.

### Final L2c2 verification and handoff

- `npm run typecheck --workspace @layoutlab/web`: passed on final source.
- `npx vite build apps/web --config apps/web/vite.config.ts`: passed on final source without shared package builds; existing large-chunk warning remains (about 1.73 MB / 466 kB gzip).
- `npx vitest run apps/web/src/lib --maxWorkers=1 --testTimeout=60000`: **8 files / 80 tests passed in 28.35s**.
- From `apps/web`, `$env:M3C_CHANNEL='msedge'; npx playwright test e2e/layout-assistant.spec.ts e2e/layout-results-http.spec.ts e2e/layout-results-race.spec.ts e2e/unified-workspace.spec.ts e2e/manual-layout.spec.ts --project=desktop --reporter=list`: **14 tests passed in 4.3 minutes**, including the actual HTTP story in 2.5 minutes, all ten L2c1 guard stories, the separately mocked verifier race, unchanged U1 and unchanged manual L1.
- Final cleanup adds generation guards for obsolete import/recorded-load errors; the strengthened targeted `layout-results-race.spec.ts` rerun passed **1 test in 9.4s**, covering both delayed verification and obsolete recorded-load failure. Typecheck and direct web build passed again after that cleanup.
- `git diff --check`: passed. Historical L1 regression artifacts were restored to their original tracked content; only new L2c2 evidence is delivered.

The final actual HTTP evidence additionally asserts a previously running original controller's clock is unchanged during candidate preview and restored by Return original. It asserts that switching to manual editing discards the assistant preview without leaving playback disabled. These outcomes are recorded as `originalClockRestored` and `manualPreviewHandover` in `http-browser.json`. The provider count is four after every verify/view/import/Apply operation, real Meta requests are zero, and the final recorded example is the same full API report used by this proof.

Local L2c2 results functionality and local fixture acceptance are complete. Remaining release gates are coordinator independent acceptance, protection/deployment of the new HTTP namespace, and actual live Meta inference/account/allowance verification. Full-page automatic persistence is not claimed; full reports can be exported and imported explicitly. No real provider configuration was changed and no deployment, commit or push was performed.

## L2c2 independent-review corrections — explicit discard revocation

The earlier matrix missed a same-context discard race: clearing the visible preview did not revoke the second pending verification, so its completion could reopen the ghost and restore Apply. This section supersedes the earlier ownership-revocation claim for that case; coordinator acceptance remains pending independent re-review.

`clearPreview` now increments the operation sequence, aborts and detaches the current HTTP controller, clears proof and verification ownership, resets busy/preview/error state and returns the viewer to current. A proof also records its authorizing operation sequence, which both `canApply` and the Apply handler check synchronously. The existing checks after HTTP verification and after production local resolution reject obsolete generations, including non-abortable local work that finishes after discard. The manual editor already calls this same function before entering editing, so pending assistant work cannot overwrite its new preview even when parent/context keys are unchanged.

The Meta label now uses `Live Meta server response` only for the actual session-owned server investigation path. Imported/recorded `provider.kind: meta` is labeled `Declared Meta provenance (recorded/imported; unauthenticated)`. Recomputing a report does not authenticate the provider claim.

Import checks `File.size` before `file.text()`. Files larger than the explicit 1 MiB browser import limit are rejected without being read. After decoding an allowed file, the exact UTF-8 `JSON.stringify({report})` byte count is also checked against the API's 1 MiB complete-body limit before adopting it. The errors distinguish local file rejection from server HTTP 413; no automatic retry is sent. The actual HTTP story now checks local oversized-import rejection and separately sends an oversized verification body to the actual API to preserve the server 413 proof.

Correction files: `apps/web/src/components/LayoutResults.tsx`, new `apps/web/e2e/layout-preview-revocation.spec.ts`, updated `apps/web/e2e/layout-results-http.spec.ts`, this document, and regenerated owned L2c2 fixture/evidence artifacts. No API, engine or manual-editor source changes were required.

Focused Edge tests are explicitly labeled mocked delays, not actual HTTP verification proof:

1. Start a valid preview, delay a second HTTP verification, discard, release the response and assert preview stays gone, Apply disabled, verification ownership cleared, busy reset, and exact current scene/clock unchanged.
2. Start a valid preview, delay a second local resolver invocation, discard, then release and wait for the actual production resolver to finish. Assert its completed candidate cannot restore preview or Apply and current scene/clock remains unchanged.
3. Delay assistant verification, start manual editing, choose a different manual station centre, release the HTTP response and assert it neither dispatches local assistant resolution nor changes the manual scene/current controller. Returning from manual editing leaves Apply disabled and the assistant ready for a new explicit verification.
4. Spy on native `File.text`: an oversized file invokes it zero times; a normal import invokes it once. Imported and recorded Meta claims both show declared, unauthenticated provenance without a Live Meta label.

The local-delay test wraps only the served test module to hold its exported resolver; after release it executes the unchanged production resolver, validation and comparison. There is no production delay hook or test global in the browser source.

Final correction verification:

- Web typecheck and direct web Vite build passed; the existing large-chunk warning remains.
- Focused layout client/results helper tests: **2 files / 9 tests passed in 35.22s**.
- Installed Edge: `layout-preview-revocation.spec.ts` plus `layout-results-http.spec.ts`: **5 tests passed in 4.0 minutes**, including the complete actual HTTP lifecycle in 2.8 minutes.
- The refreshed actual HTTP report/browser evidence, screenshots and recording retain **four local fake-provider calls, zero real Meta calls**, original-clock restoration, matching viewer/report coordinates, manual handover, invalid/stale/tamper rejection, local oversized-import rejection and actual API 413. This is the existing full lifecycle proof, not approval-only testing.
- The supplied coordinator repro is additionally rechecked with its output redirected to an owned evidence file; the original coordinator bug record is preserved. This worker recheck is not an independent audit.

No real keys/model calls, public budget spend, API/engine changes, shared builds, commit, push or deployment occurred. Acceptance and release remain coordinator-owned.

Supplied-repro worker recheck result: evidence/sanitized/l2c2/discard-race-recheck.json records clearedInitially=true, previewReturnedAfterExplicitDiscard=false, applyEnabledAfterDiscard=false and realMetaRequests=0. Only its output path was redirected; the original .coordination/l2c2-preview-race.json bug record was not overwritten. Final git diff --check passed.

## Coordinator L2c2 acceptance � 2026-11-05

Accepted after source review and independent Edge replay of the explicit-discard race. Current reproduction confirms clearedInitially=true, previewReturnedAfterExplicitDiscard=false, applyEnabledAfterDiscard=false, realMetaRequests0. Exact full report/candidate/parent/operation-generation proof guards Apply; public verification checks consistency, not authorship. Worker actual HTTP fixture evidence includes4 fake-provider calls,0 Meta calls, original state preserved until Apply, canonical viewer coordinates, complete invalid/worse results, exact exports, tamper and size rejection. This closes L2 fixture/integration scope; live Meta layout inference remains unverified with public allowance0 and reported account billing problem. Protected Nginx locations and public smoke remain release gates. L3 rack/rotation/agent initial placement and R2 human integration are still required future work.
