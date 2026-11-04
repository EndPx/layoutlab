# Muse physical layout L2a backend review

L2a is an executable store/service slice; L2b routes/auth/shared paid-route
lease integration and L2c workspace/Edge acceptance remain pending. This is not
full L2 acceptance or a public capability claim. L1 application267af5a remains
the accepted predecessor. No paid calls, allowance refill, commit, push or
deployment occurred. Runtime provider remains Meta; local evidence uses an
injected fixture transport with zero real provider requests.

## Executable path

`apps/api/src/layout-investigations.ts` exports `LayoutInvestigationStore`.
Call `create(parsedInput, persistedClaimId)`, then `start(record, fetchImpl)`;
`record.task` is awaitable for tests. Production callers must supply the existing
server's durable `beforeDispatch` guard and shared `isLegacyBusy` callback.
Poll via `toSummary`, export via `buildReport`, approve corrected structured
constraints via `approve(id, constraints, fetchImpl)`, cancel via `cancel(id)`.
The service has no HTTP routes and never starts a warehouse controller in UI.

Baseline is a production no-op layout comparison under frozen canonical input.
Interpretation is the first counted provider call, with concrete canonical room,
obstacles/racks, attachments, resources, mobile units, execution assumptions,
baseline metrics and the frozen-input hash. It grants no edit authority. User
approval separately parses constraints and per-station centre regions. Approval
may correct the interpretation without another provider call. Regions must be
within the room and each editable station has exactly one region. Only supported
packing stations are editable, receiving is locked, staffing/service/workload/
seed remain fixed, at most one entity moves, at most5000mm on the100mm grid.
Other geometry objects cannot be expressed by a supported proposal.

After approval, strict provider actions propose concrete absolute integer-mm
centres with exact parent identity or finish with an existing valid candidate
ID. The wire JSON schemas require every key, including explicit null inactive
action fields; root and nested objects reject additional properties. They do
not rely on the parser's discriminated union as a provider wire schema.

Each proposal passes production `validateLayoutCandidate`; only valid geometry
inside the approved centre region reaches production `runLayoutComparison`.
Region rejection is an additional disclosed authority check in the API service,
not a replacement geometry validator. Invalid proposals retain full production
validation and region issues without measured candidate results. Valid results,
including worse/mixed/no-improvement, remain in the report. Feedback includes
actual issues and measured metrics/deltas; full route tables remain in exports
to respect context limits. Every model finish must cite a known valid run.
Fallback is explicitly deterministic: first measured Pareto-improved candidate,
otherwise baseline when baseline is valid. It is not a global optimum claim.

## Lifecycle and money boundary

One run ID, claim ID, deadline and counters span interpretation, waiting for
approval and proposals. Hard caps:4 model requests including interpretation,
3 parsed proposed alternatives,2000 completion tokens/request,120000ms total;
configured lower caps are honored. Context bounds are checked before dispatch.
The guard callback runs immediately before every dispatch, then the attempt is
counted before calling `chatCompletionJson`; no automatic retry exists.
Approval cannot reset counters or deadline. Duplicate start/reapproval of closed
runs reject. Cancellation aborts transport and prevents later output execution.
Deadline includes user approval waiting. Awaiting approval occupies the local
store lease and is not terminal/evictable.

The store does not reserve, commit or release ledger entries. It retains the
same caller-provided claim and exact dispatched count; cancellation and guard
loss never refund dispatched spend. L2b must reserve once before create, retain
reservation mapping through AWAITING_APPROVAL, revalidate persisted authority
before every call, and settle only terminal runs. Store hooks alone do not
prove HTTP cross-route concurrency or deployment auth. All paid paths and
Nginx gate coverage must be reviewed during L2b before release.

## Attachments and replay

Canonical station identity/relative offsets are derived from production
`MAIN_WAREHOUSE_ATTACHMENTS` and current obstacle centres, then verified using
production `buildStationAttachmentMap`. Sequential applied parents retain both
station translations; non-rigid queue drift rejects. No web import or engine
source changes are used. Unrelated input geometry remains part of the complete
frozen scenario, never normalized away in comparisons.

Exports use distinct `layoutlab.layout-investigation/1` and prompt version1,
with implementation version, input/hash, canonical attachments, interpreted and
approved constraints, complete baseline and candidate comparisons, every
provider action/request metadata, rejections, caps/counters, claim/dispatched
count, and recommendation links. Existing service-experiment reports/verifiers
are untouched. `verifyLayoutInvestigationExport` needs no key: it reconstructs
baseline and proposal evaluations through the same production entry points,
compares saved reports/metrics and authority, and checks action/candidate/request
links and totals. This verifies consistency, not model/user authorship or bills.

## Verification and pending gates

The owned fixture suite executes the actual production simulator; it is not a
mock engine. See the final dispatch report for commands and exact passing
counts. `evidence/sanitized/l2a/fixture-report.json`, when generated by the suite,
is a fixture report, not live inference or browser evidence.

L2b must add guarded native API create/status/approve/cancel/report/verify routes,
shared concurrency with every existing paid route, durable reservation lifecycle,
HTTP fixture acceptance and deployment auth review. L2c must add editable
approval and candidate ghost/compare/explicit Apply in the one workspace plus
real Edge fixture recording. Service-duration what-ifs remain separate. L3 rack
moves/rotation and initial-agent placement remain required future product scope.

The retained six-order fixture's valid move is **worse**: both runs ship6 with
makespan502400ms and stop clock540000ms. Total waiting rises614900 ->623600ms
(delta+8700ms). Both report finite-cohort stage-complete with full declared
cohort evaluated (`truncated:false`) under the600000ms ceiling. The fixture
model selects this valid candidate anyway; that selection is preserved as a
model choice, not promoted into an improvement claim. The actual manual call
with the identical proposal/constraints/inputs equals the saved comparison.

Final checks on2026-11-05:

- `npx vitest run apps/api/test/layout-investigations.test.ts apps/api/test/layout-investigation-contract.test.ts --maxWorkers=1 --testTimeout=120000`:2 files,21 tests passed (184.07s).
- After the final availability/verification guards and the added saved-workload test: `npx vitest run apps/api/test/layout-investigations.test.ts --maxWorkers=1 --testTimeout=120000 -t "replays the saved fixture|honors a lower proposal cap"`:2 passed,8 skipped (34.63s). These runs cover22 unique tests; the latter checks final verifier bytes and the lower-cap/context/guard path.
- `npm run typecheck --workspace @layoutlab/api`:passed on final source.
- `git diff --check`:passed. No broad root build was run.

The suite covers schema wire compatibility, approval gate/correction, actual
invalid-feedback-driven revision and run-linked finish, retained worse result,
manual comparison equality, request/proposal caps, stale parent/locked receiving,
unknown recommendations, in-room approved-region denial and blocked rack
placement, lower caps/context refusal, last held ledger claim at zero available,
ledger loss before approval dispatch, cancel in-flight, timeout during approval,
sequential station-parent resolution and non-rigid drift rejection. Saved report
replay checks metrics, counters, recommendation and parent tampering, and rejects
altered workload even when its new input hash is supplied. No HTTP/Edge flow or
cross-route concurrency acceptance is claimed by these store-level checks.

## Independent-review corrections (L2a not accepted yet)

The coordinator's review found three real defects in the earlier slice; its
previous green tests did not cover these negatives:

1. Immediate cancellation during the asynchronous parent hash allowed a late
   baseline assignment into a closed report. Baseline work now checks liveness
   before starting and after the parent hash, holds its comparison locally, and
   commits it only after another live check. Proposal evaluation similarly
   checks liveness before work and after validation, and commits its count and
   result together only while live. In-flight transport may still settle its
   request metadata accurately; a closed run cannot acquire a late baseline,
   interpretation, rejection or candidate result. Already-started synchronous
   engine work is not preemptible; any late local result is discarded.
2. The verifier previously checked that rejection rows pointed at successful
   requests, but did not prove those requests were rejected. It now derives the
   rejection list from each parsed action, prior proposal count and permitted
   finish references, using the same bounded reason function as execution.
   Complete ordered equality rejects extra, missing, duplicate, invented and
   contradictory rows. Successfully evaluated geometry-invalid proposals retain
   validation evidence; they are not action-parser rejections.
3. An empty report could claim COMPLETED. Completion now requires a recorded
   baseline, successful interpretation dispatch, separately approved authority,
   settled successful requests, no terminal error, and either a valid final
   model finish or actual exhaustion of the declared request cap. Genuine
   pre-dispatch FAILED/CANCELLED/TIMED_OUT records remain valid. Pending or
   cancelled proposal evaluation may have successful dispatch evidence without
   a committed candidate; it cannot justify completion. Failed/aborted/pending
   request rows must be last and consistent with the run lifecycle.

Focused regression file: `apps/api/test/layout-investigations-review.test.ts`.
This review work does not add routes/UI, change the engine or reduce L2b/L2c/L3
scope. No paid calls, budget refill, commit, push or deployment occurred.

Correction verification (new evidence, not the historical22-test result):

- `npx vitest run apps/api/test/layout-investigations-review.test.ts --maxWorkers=1 --testTimeout=60000`:6 passed (92.00s).
- Existing genuine transition check, `npx vitest run apps/api/test/layout-investigations.test.ts --maxWorkers=1 --testTimeout=60000 -t "deadline includes approval waiting"`:1 passed,9 skipped (17.01s).
- After strengthening the evaluation-guard test to use the saved valid proposal:
  `npx vitest run apps/api/test/layout-investigations-review.test.ts --maxWorkers=1 --testTimeout=60000 -t "stops evaluation|immediate start/cancel"`:2 passed,4 skipped (4.73s).
- Direct API compilation `npx tsc -p apps/api/tsconfig.build.json` passed, then
  both coordinator repro scripts ran against the rebuilt API dist.
- `.coordination/review-l2a.mjs`:providerCalls0, CANCELLED, baseline absent
  both at cancellation and after task, terminalReportMutatedfalse,
  cancelledVerification.oktrue; forgedRejectionVerification.okfalse with
  `exact derived rejection evidence`.
- `.coordination/review-l2a-empty.mjs`:okfalse with completion lifecycle and
  finish/exhaustion mismatches.
- Final `npm run typecheck --workspace @layoutlab/api` and `git diff --check`
  passed. First regression attempt had one30-second wall timeout during a
  multi-report replay; the focused six-case rerun used60-second per-test bounds
  and passed without weakening assertions or changing the simulator/workload.

Evidence copy: `evidence/sanitized/l2a/review-fixes.json`. L2a remains subject to
coordinator independent re-review; L2b/L2c work has not started.

## Coordinator acceptance — L2a only, 2026-11-05

Accepted for L2b dependency after independent rerun of review-l2a.mjs and review-l2a-empty.mjs against compiled API. Early cancel: zero provider calls, baseline absent before/after, unchanged terminal report and verifier ok. Fabricated rejection and empty COMPLETED exports reject. Production-engine comparisons and preserved worse result remain as documented. No HTTP/workspace/live inference or full L2 acceptance is implied. L2b routes, durable settlement/shared concurrency/auth review and L2c UI are required next. Public application remains267af5a.

## L2b1 native HTTP admission — 2026-11-05

Implemented only the first API slice. `POST /api/operations/layout-investigations`
accepts the strict L2a input `{scenario, executionConfig, question,
safetyCeilingMs, mode:"live", consent:true}` and returns202 with the existing
`layoutlab.layout-investigation/1` summary/report shape. Identity is `runId`;
state starts `RUNNING` and becomes `AWAITING_APPROVAL` after interpretation.
`GET /api/operations/layout-investigations/:id` returns200 with that same shape
or404. `POST /api/operations/layout-investigations/:id/cancel` accepts an empty
JSON object, returns200 with the cancelled shape,404 for unknown IDs and409
for closed runs. Create uses the existing inference limiter; status/cancel use
the existing bounded safe limiter and all bodies retain the1MB limit.

Synchronous pending admission blocks competing paid routes before async hashing.
One durable claim maps to the record before interpretation starts and is checked
before dispatch. Approval waiting retains ownership and the claim. Terminal
notification settles without polling: zero dispatched requests release; any
dispatch commits. Cancellation retains ownership until task/transport unwinds;
storage failure retains ownership and the counted claim conservatively.

Validation: direct `npx tsc -p apps/api/tsconfig.build.json` passed;
`npx vitest run apps/api/test/layout-http-admission.test.ts --maxWorkers=1
--testTimeout=120000` passed3 tests in13.96s. Tests execute the actual production
engine with loopback fake Meta, fixture-only credentials and temporary ledgers.
They cover one held reservation at available0, interpretation/approval waiting,
cancel commit, malformed input with zero calls/claims, concurrent create denial,
and competing one-shot proposal denial with provider peak1.

These new paths are NOT deployed or verified protected. Coordinator deployment
auth/Nginx gate remains required. Approval/report/keyless replay verification
endpoints remain L2b2; L2c workspace/UI and full L2 acceptance remain pending.
No paid calls, ledger refill, commit, push or deployment occurred.

Coordinator L2b1 review accepted2026-11-05: source-level admission lock precedes async create, claim is mapped before start, waiting approval preserves ownership, cancellation settlement waits for task unwind. Three focused HTTP tests cover the stated first slice only. L2b2 still must prove approved continuation with same claim at available0, all existing paid-route conflicts, automatic timeout settlement, guard loss, report/verify/tamper, and deployment auth mapping. No public release authorization from this slice alone.
