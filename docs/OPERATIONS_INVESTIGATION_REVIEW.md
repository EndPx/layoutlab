# Operations investigation review (E4a, bounded backend loop)

Status: REVISED after independent review, awaiting coordinator review —
not accepted yet and not live-activated. Verified offline with a
feedback-dependent fake Meta transport (`providerKind: fixture`,
`realMetaRequests: 0`). Zero paid calls were made. This covers only the
E4a backend question -> experiment -> feedback -> next choice ->
recommendation loop. It does NOT close E4a acceptance, E4 UI integration,
the AI-contribution/equal-budget benchmark, or v3.

## Revision after independent review (2026-11-04)

Four confirmed defects were fixed in the same owned files:

1. **Shared paid-inference lease.** The one-shot proposal route now owns a
   synchronous `oneShotInFlight` lease for its single dispatch (acquired
   before dispatch, released when the proposal settles on every outcome);
   legacy runs own `RunStore.activeInference` during inference phases and
   investigations own their RUNNING lifetime. Every paid route
   (`/api/operations/proposals`, `/api/operations/investigations`,
   `/api/runs`, `.../approve`) checks all holders synchronously, so at
   `API_CONCURRENCY=1` the provider-call peak stays 1 in both directions
   (one-shot <-> investigation, one-shot <-> legacy, two one-shots,
   legacy <-> investigation/approve). Budget claims and last-reserved-run
   semantics are unchanged. Regression tests inject a gated transport and
   assert HTTP 429 for the blocked route and a measured peak of exactly 1,
   including approve proceeding only after the investigation terminates.
2. **Strict verifier.** `verifyInvestigationExport` now validates the
   complete report envelope (exact keys; state/ids/timestamps; declared
   versions against the current accepted versions; limits honoring both
   hard caps and declared lower limits; budget/request/trace/recommendation
   shapes), compares the COMPLETE parsed input (scenario, executionConfig,
   policy, ceiling) canonically to the E3 common inputs actually measured,
   checks sequential request rows and chronological trace `seq`/request
   links, enforces a bijection between executed alternatives and
   accepted-proposal + experiment trace entries, and compares ALL trace
   candidate patches/status/reasons/measurements to the E3 candidates
   (baseline, experiments, finishes, recommendation). Missing mandatory
   evidence fails; nothing is defaulted. This remains an offline
   consistency/recomputation check, NOT authenticated provider proof.
3. **Rejected evidence verifies.** A rejected `finish` may reference an
   unknown/rejected target (that is why it was rejected) when its
   status/reason/request link is recorded; accepted finishes still require
   an existing valid candidate with equal measurements. Genuinely
   generated rejected-then-finished reports (HTTP-level and store-level
   replay) and cancelled/timed-out reports now verify, alongside the clean
   fixture report; the independent tamper matrix (different input stock,
   different executionConfig, requestIndex 999, fabricated shipped,
   declared limit below actual, fabricated engine version, deleted
   proposal+experiment trace) all reject.
4. **Operational context + bounded diagnostics.** Every model request now
   carries a bounded deterministic `operationalContext` built from the
   frozen inputs (resources by kind with counts and current service
   durations, worker roles/counts, workload/arrival and initial-inventory
   summary, execution durations — facts only, no invented bottleneck),
   alongside the actual E3 feedback. The context cap
   (`maxContextChars`) is enforced before any dispatch or claim touch.
   Persisted model-derived diagnostics are bounded and redacted: unknown
   action keys are truncated, candidate ids are capped at 128 chars,
   hypotheses and rejection reasons are sanitized and capped at 500 chars,
   so malformed output cannot make the next prompt unbounded or leak
   configured secrets. The prompt version is now
   `layoutlab.operations-investigation-prompt/2` and the fixture artifact
   was regenerated under it.

## API contract

| Route | Behavior |
|---|---|
| `POST /api/operations/investigations` | Strict local preflight, then one durable budget claim (when configured), then the async loop. Returns `202` with a stable `runId` (also `investigationId`). |
| `GET /api/operations/investigations/:id` | Poll: `state`, `phase`, progress counters, full trace, per-request metadata, and the complete report (`result`/`report`) once terminal. Settles the budget claim on terminal observation. Never dispatches inference. |
| `GET /api/operations/investigations/:id/report` | The complete investigation export (`layoutlab.operations-investigation/1`), including partial evidence for failed/cancelled/timed-out runs. Never dispatches inference. |
| `POST /api/operations/investigations/:id/cancel` | Stops future model dispatch (aborts the in-flight request), preserves evidence and the claim. Terminal investigations return `409 RUN_CLOSED`; there is no approve/restart route (`404`), so a terminal run can never mint a fresh request allowance. |

Input (strict, unknown keys rejected): frozen `scenario` +
`executionConfig` (parsed by the accepted simulation parsers),
`interventionPolicy` (explicit machine-readable policy; absent means the
E3 baseline-only default), optional `safetyCeilingMs`
(1..2147483647, E3 default otherwise), `question` (1..2000 chars),
`mode: "live"`, `consent: true`. Free text grants nothing: only the policy
authorizes patch fields, so "no new workers" is structural — a staffing
patch outside the policy becomes a retained `POLICY_VIOLATION` candidate in
the E3 comparison, never an executed change. Service-duration fields are
synthetic service assumptions, never measured savings.

## Loop and limits

- The baseline is run locally through `runOperationsExperiment` (E3)
  BEFORE any paid dispatch. Malformed input, no key, an unparsable
  scenario, or a non-valid baseline ends the investigation with zero model
  requests (and, with the guard, a released claim: provably no dispatch).
- Each model request returns exactly one validated action from the strict
  schema `operations_investigation_action` (required lists every property;
  patch fields are required integer-or-null, the learned Meta contract):
  `run_experiment(patch)` or `finish(candidateId)`. Hypotheses travel as
  `hypothesisKind: "model-assertion-not-measured-proof"`, never as proof.
- Accepted experiments execute through the E3 engine (stable ids
  `exp-1..exp-3`); policy violations and infeasible geometry stay as
  invalid candidates in the full comparison export. The next request
  carries the actual cumulative measured results plus every rejected
  proposal with its reason.
- Caps: at most 3 proposed alternatives + baseline, at most 4 TOTAL model
  requests (including finish and malformed/invalid attempts, which are
  counted and preserved, never silently replaced), 2000 completion
  tokens/request, the existing 120 s run deadline and context bounds, no
  provider retry, no external tools/web/code execution. Duplicate and
  no-change patches are rejected with reasons and stay visible; slower
  (no-improvement) candidates stay ranked behind the baseline.
- `finish` must reference an existing valid candidate; fabricated ids and
  invalid candidates are rejected, counted, and explained to the model.
  Without a valid finish the run completes with a deterministic E3
  best-found recommendation labeled `source: "deterministic-fallback"`.
  `modelSelectedCandidateId` and `deterministicBestCandidateId` are
  reported as distinct fields when they differ.
- The recommendation explanation is server-computed from run reports
  (shipped/makespan/wait deltas and improvement percentages over the
  baseline) and worded as a bounded contrast for the declared intervention
  in a synthetic scenario — never global optimality, causal proof, or
  real warehouse savings.

## Spend lifecycle (public budget guard)

One durable `publicBudgetPerRunUsd` claim (`investigation:<uuid>`) is
reserved for the WHOLE investigation before its first upstream request —
not per tool call. The persisted claim is revalidated
(`assertReservation`) immediately before EVERY dispatch; guard loss or a
released/missing claim between tool calls fails the investigation with
zero further calls. After any dispatched request — success, timeout,
malformed response, cancellation, or failure — the full claim is kept and
committed on terminal settlement; only provable zero-dispatch local
rejection releases it. The last reserved run finishes with available 0.
The ledger, cap, pricing, and token limits are untouched; legacy
`/api/runs`, approve, and one-shot proposal behavior is preserved.

## Lifecycle and concurrency

In-memory `InvestigationStore` (bounded by the existing `maxRuns`
eviction of oldest terminal records; no database, no durable-resume
claim). States: `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`,
`TIMED_OUT`; phases: `EVALUATING_BASELINE`, `REQUESTING_MODEL`,
`EVALUATING_EXPERIMENT`, `FINALIZING`. At most one active investigation
at the configured concurrency (1), and it shares that slot with legacy
inference: a running investigation makes `POST /api/runs`, AWAITING_APPROVAL
approvals, and `POST /api/operations/proposals` return `429 CONCURRENCY_LIMIT`,
and vice versa (legacy active inference blocks investigation creation).
Errors/aborts preserve the partial comparison and truthful provider
diagnostics (responseId/usage/finishReason/duration/errorCode per request).

## Report and offline verification

The export embeds the exact input/policy/versions/seed, providerKind
(fixture vs meta), configured and returned model, prompt version
(`layoutlab.operations-investigation-prompt/2`), request count, per-request
responseId/usage/finishReason/duration/status, the full tool/action trace
with stable experiment ids, the complete E3 comparison (including failed
choices), and the evidence-linked recommendation. No API key,
authorization header, hidden reasoning, or raw transport headers are
exported; the consented question and labeled hypotheses are included.

Offline check (no key, no network):

```sh
npm run build --workspace @layoutlab/simulation
npm run build --workspace @layoutlab/api
node scripts/verify-operations-investigation.mjs evidence/sanitized/e4a-fixture-investigation.json
```

The verifier reuses the E3 engine verifier, checks trace/request caps and
referenced ids, re-derives policy agreement, and recomputes all
measurement comparisons and improvement percentages. It reruns the engine
only: inference provenance is recorded metadata and is NOT authenticated.

## Fixture evidence (fake transport, not Meta)

`evidence/sanitized/e4a-fixture-investigation.json` was generated through
the real API with a feedback-dependent fixture transport:

1. baseline `valid-complete`: shipped 6, makespan 502400 ms, wait 614900 ms;
2. request 1 -> `run_experiment {dispatchDurationMs: 1000}` (hypothesis
   labeled a model assertion) -> `exp-1` `valid-complete`: makespan
   343200 ms;
3. request 2 received that measured feedback and returned
   `finish(exp-1)`;
4. recommendation: model-selected `exp-1`, deterministic best `exp-1`,
   makespan delta -159200 ms = 31.687898% over baseline (hand-checked:
   159200/502400), wait delta 0, no savings claim.

Replay prints `PASS ... providerKind fixture, requests 2, experiments 1,
recommendation exp-1 via model`. A copy with the recommendation candidate
tampered to `baseline` fails with recomputed-comparison, ranking,
explanation, and finish-trace mismatches.

## Checks run (all offline, zero paid calls)

- Focused: `test/operations-investigations.test.ts` — 21 passed
  (loop/feedback/arithmetic, policy + service-knob denial, infeasible
  staffing geometry, fabricated finish + malformed action, exact 4/3 caps,
  duplicates/no-change, no-improvement visibility, model-vs-deterministic
  distinction, bounded malformed diagnostics, strict verifier tamper
  matrix, generated rejected-then-finished + cancelled/timed-out report
  replay, guard loss between calls, last-claim-at-0, cancel/timeout
  no-refund, no-key/invalid-input zero calls, cross-route concurrency,
  shared paid-inference lease with measured peak 1, terminal no-restart).
- Full API: `npm run test --workspace @layoutlab/api` — 155 passed.
- `npm run build --workspace @layoutlab/api` and
  `npm run typecheck --workspace @layoutlab/api` — passed. Simulation was
  not changed, so its serial suite was not rerun.
- Independent-case replication against the regenerated artifact: clean
  report verifies; valid-but-different input stock, different
  executionConfig, requestIndex 999, fabricated shipped 999, declared
  `maxModelRequests` 1 with 2 actual, fabricated engine version, and
  deleted proposal+experiment trace all reject.

## Limitations

- In-memory job state only: a server restart loses running investigations
  (their budget claims stay reserved in the ledger for audit).
- Staffing clones remain infeasible on the burst/main geometry and stay
  invalid; no geometry or scheduling was redesigned.
- Fixture evidence proves the loop mechanics, not useful live model
  proposals; the bounded live check, UI integration, and the
  equal-budget AI-contribution benchmark remain open (not E4-complete).

## Coordinator backend acceptance (2026-11-04)

Independent compiled API checks now confirm peak one provider request across
the previously bypassed one-shot/investigation path (second request429),
clean export recomputation, rejection of inconsistent frozen inputs,
execution config, request links, trace metrics/counts and versions, and
successful replay of a genuinely generated rejected-unknown-finish followed
by accepted-baseline report. Arithmetic159200/502400*100 rounds31.687898%.
Evidence: `evidence/sanitized/e4a-independent-review.json`.
The bounded backend is accepted for deployment and one coordinator-controlled
live smoke within remaining public allowance. UI and AI-quality evaluation
remain separate open gates. No paid calls occurred in the offline review.


## Actual public Meta investigation (2026-11-04)

Backend f24a6a1 was deployed; ledger bytes were preserved. Investigation
fd2247b1-8335-4575-a55b-1f579cc3717b completed with actual Contributor Meta:
three requests, two experiments, final model recommendation exp-2. Baseline
502400ms; packingDurationMs30000 gives442400ms; dispatchDurationMs30000 gives
397100ms, a server-computed20.959395% modeled makespan reduction in this
synthetic scenario. All six orders shipped in each valid run. The full
investigation report reran offline with no mismatches. See
`evidence/sanitized/e4a-live-investigation-f24a6a1.json` and its verification
sibling. This closes the backend live integration gate only. It does not
prove useful AI selection relative to a fixed strategy or complete the UI.
The public allowance now hasUS$0.25 remaining after retaining thisUS$0.25
claim; token usage and conservative claims are distinct, no invoice retrieved.
