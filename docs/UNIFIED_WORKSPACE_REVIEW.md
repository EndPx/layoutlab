# Unified workspace (U1) â€” review

One Operations-based workspace replaces the three primary workflows. The
single warehouse viewer stays visible through running, selection, asking,
testing and comparison; the legacy storage planner remains isolated
compatibility access (`?mode=planning` or Settings â†’ Advanced) with its
own four-rack data and reports, never feeding the P01..P12 warehouse.

## What was built

- Canonical state: one active scenario + execution config + implementation
  version (shown in Settings) feeds viewer, live metrics, assistant
  submissions, results and exports. Defaults to the verified 6-order
  picking/packing sample ("Sample data"); the full 28-order + 12-delivery
  shift is selectable with its exact inputs and honest engine outcomes.
- Viewer/playback: starts paused; Run warehouse / Pause / Reset / Step and
  1x/4x/16x (presentation-only). Pause freezes the engine clock and poses;
  Reset rebuilds deterministically from the same inputs. Baseline and
  candidate controllers are retained separately; exactly one canvas is
  mounted. Recorded/candidate inspection uses the report's recorded
  implementation through the versioned controller factory â€” never the
  latest engine silently â€” labeled "Option N vs Current"; Return restores
  the retained Current run.
- Picking/inspector: canvas raycast with instance-ID mapping selects
  workers (task/cargo/wait), slots/racks (real stock) and stations (active
  work/queue) from engine state; drag/orbit is ignored, empty ground /
  Clear / Back returns to the assistant; dropdown fallback retained.
- Assistant/results: question + explicit permitted service-time changes
  ("Choose which changes LayoutLab may test"), consent and Basic Auth
  recovery at the point of action, spend warning visible, raw
  patches/schemas/budgets under Technical details. Bottom Current vs
  proposed summary uses human names from actual patches ("Assume dispatch
  takes 30 seconds per order"), expandable comparison, "What LayoutLab
  tested", exact-report Export and "Verify these results" (server
  verifier). Scenario changes mark earlier reports stale/previous;
  recorded reports on other inputs offer explicit scenario loading.
  Language follows the requirements (Completed with stage qualifier,
  Option N, Time to finish all orders with raw ms on hover, Sample data /
  Recorded AI example / fixture kept distinct, no fake zeros).

## Verified (this session)

- Web build + typecheck green; lib unit tests 36/36 (incl. new
  workspace-helper tests for finish-time/option naming/staleness).
- Real Edge (Playwright `msedge`, 1440 + mobile projects): unified story
  spec (run/pause-freeze/reset, inspect/clear, recorded results, scenario
  switch staleness, zero investigation POSTs), entry/alias/legacy spec,
  and the rewritten investigation spec (recorded offline, malformed
  import, LOCAL fixture live flow with real engine feedback + verify,
  no-improvement, 401 recovery, no-key) â€” all passing.
- Direct canvas pick probed in Edge: rack R4 selected with real slot
  stock, drag ignored, clear returns to assistant.
- Screenshots: `evidence/sanitized/u1-workspace/` (1586 intro / running
  inspector / results-option / canvas pick, 768, 390).

## Limitations

- Headless Chromium (SwiftShader) is too slow for the R1 renderer during
  playback; Edge with a real GPU is the verified browser lane (the same
  constraint the Operations playback evidence already had).
- Root build / combined acceptance with R3c's API suites was not run by
  this worker (coordinated shared-build gate); API fixture e2e used the
  existing dist. No paid Meta calls were made; the public allowance
  remains exhausted and the UI says so.
- No layout editing (L1), human-actor integration, or full-v3 completeness
  is claimed. Assignment/traffic optimization remains unavailable in the
  main workspace until independently integrated.

## Sol recovery review — 2026-11-05

Complete canonical identity now compares the full scenario (including workload,
stock and geometry), execution configuration and actual implementation version.
Object key order is normalized; array order stays significant. Reports are preserved.
Current and inspected contexts retain their runtime version. Recorded replay rejects
outer/comparison/per-run version disagreement; the existing runtime factory rejects
unknown versions. Reset reconstructs from the retained current context, independent
of subsequently imported reports. Technical details show replay and verifier versions.

Verification clears on exact report replacement and uses both immutable report
identity and request sequence to ignore obsolete asynchronous responses. The client
preserves optional verifierImplementationVersion returned by HTTP. API implementation
is separately owned. Server-unavailable copy now distinguishes API verification
without inference from the separate offline CLI.

Validation: npm run typecheck --workspace apps/web passed; direct Vite web build
passed (existing large-chunk warning); node node_modules/vitest/vitest.mjs run
apps/web/src/lib/workspace.test.ts passed 11/11. Real Microsoft Edge desktop
Playwright passed the original unified story, exact-report replacement and delayed
verification race, and recorded scenario/reset at 1586/768/390 with no horizontal
overflow. Recovery tests mock status/budget and verifier responses; they validate
browser lifecycle, not API recomputation. No inference endpoint was called.
Screenshots recovery-{1586,768,390}-edge.png and recovery-verification-edge.png,
plus recovery-replay-edge.webm are in evidence/sanitized/u1-workspace.

Limits: no paid inference, root build, install, commit, push or deployment requested.
An initial Playwright launch attempted its existing npm dev webServer command while
a wrongly rooted Vite server occupied 5173; that launch failed before tests. The
correct web-root direct Vite server then supported the passing tests. No engine/API/
renderer/assets source was edited. HTTP metadata correctness still requires API owner
acceptance; browser tests intentionally mock it. Full fixture-investigation/no-key/
401/budget/rejected-option matrix was not rerun in this narrow recovery. No Lighthouse
or physical-human/full-v3 acceptance claim is made.

## Final U1 review corrections — 2026-11-05

Aligned HTTP client and verification state with required nullable
verifierImplementationVersion (null means no verifying implementation selected).
ApiStatus now types operationsImplementationVersion; assistant Technical details
shows that server version separately from retained replay version and result verifier
version. Replaced stray question-mark separators with middle dots. Result cards and
comparison map valid-complete to Completed, valid-incomplete to Incomplete, invalid
to Rejected; raw candidate status stays in result Technical details and exact export.
Question help now says to choose supported changes below.

Checks: web typecheck passed, 12/12 workspace helper tests passed, direct web-only
Vite production build passed with existing large-chunk warning. Real Microsoft Edge
fixture-feedback test passed against stable API dist and local fake transport: actual
HTTP verifierImplementationVersion was 0.1.1, UI showed verifier 0.1.1 and separate
server operations implementation 0.1.1, transportRequests remained exactly 2 before
and after verification (zero paid calls). Evidence final-fixture-http-edge.png and
final-fixture-http-edge.webm in evidence/sanitized/u1-workspace. No API/shared rebuild.

Strengthened recorded test explicitly checks displayed replay 0.1.0, imports a
report with a different seed, resets and checks retained original replay version,
original input context and clock zero; report remains stale. Screenshots cover
1586/768/390. One repeated run's immediate overflow assertion raced resize layout;
a subsequent unchanged run passed, and the assertion now polls boundedly for layout
settlement rather than sampling synchronously. Exact-report replacement/delayed
verification race test passed again. These race tests mock responses and do not
substitute for the separately passed HTTP fixture integration.

No engine/API/assets edits, paid calls, shared/root builds, dependency installs,
commits, pushes or deployment in this follow-up. Full provider error matrix was not
repeated as requested. Coordinator retains API review and final release acceptance.

## Successful-report HTTP reconfirmation — ctx_b83d9e23024e

Coordinator explicitly authorized comparison-path integration against existing API
dist independently of the outstanding no-comparison null-metadata branch. Repeated
from apps/web with M3C_CHANNEL=msedge and M3C_VIDEO=on:
node ../../node_modules/@playwright/test/cli.js test e2e/experiments.spec.ts
--project desktop --grep 'fixture feedback'. Passed 1/1 in 26.5s (test 20.3s).
The actual successful HTTP response returned verifierImplementationVersion 0.1.1;
UI details displayed verifier 0.1.1 and separate server implementation 0.1.1.
Fake transport requests stayed at 2 before/after verification, zero paid calls.
Existing source/dist forwarding uses res.json(result); the absence of a literal
field name in server.js is not a readiness failure. No API/shared build was run.
API dist SHA256 snapshot is final-http-api-build-hashes.json beside the updated
final-fixture-http-edge screenshot/recording. This check proves successful-report
integration only; no-comparison null metadata remains an independent coordinator
API gate. No application source change was needed for this reconfirmation.
