# M2b independent review

Status: accepted after revisions. Initial implementer tests (132/132) and the
built-export proof are evidence of their covered paths, not acceptance of
inventory/resource correctness. The observations below preserve the review
history; the final verdict supersedes their original revision-required state.

First revision post-check: the seven original counterexamples and terminal
repeat fulfillment pass Codex's separate built-export assertions. One
additional temporal counterexample remains: A occupies S1 from 0 to 1000,
then after completing A the API accepts B starting at 100 on the same S1.
Current-state occupancy is clear but the saved service intervals overlap.
Reject historical lane reuse before its last release without changing state.
Preserve a waiting job's original enqueue age when it starts at a valid later
time. See `.coordination/review-m2b-postfix.mjs` and the first post-check JSON.

Codex exercised the built exports against a separate scenario derived from
the main fixture, with a two-item order, six available items and two distinct
inbound deliveries. Counterexamples were executed locally without a model
key or any network inference.

| Finding | Observed | Required behavior |
|---|---|---|
| Partial-pick cancellation loses fulfillment history | Order requests 2; pick 1, cancel, reserve again, pick 2; carried total is 3 and checkInvariants returns no violations | Retain picked/staged/fulfilled accounting; a retry may acquire only remaining demand or a cancelled terminal order must reject retry |
| Idempotency cache has no operation identity | reserveOrder and cancelReservation with the identical event payload return a reserved result for cancellation | Same ID used for a different operation must fail atomically |
| Receiving loses delivery ownership | D1 supplies P01; unaccepted D2 only declares P02, yet collectPutAway can take D1's P01 under D2's ownership | Retain delivery attribution through receiving/collection and reject cross-delivery collection |
| Negative resource wait | Enqueue at 100, start at 50 yields wait -50 | Reject causal time violations without allocating a lane |
| Release before completion | Output held at 1000 can be released at time 1 | Release cannot precede recorded completion |
| Mutable configuration changes history | Change caller resource duration to 0 after construction; service completes at 0 instead of configured 1000 | Copy/validate constructor configuration and keep it immutable inside the station |
| Zero-queue station cannot operate | Schema permits zero queue slots; even an idle service lane always returns QUEUE_FULL and no job can start | Support a safe direct-service admission path or an explicit supported boundary; no permanent false full-queue loop |

Also review terminal order handling: cancellation/re-reservation must not
permit the same order to pack/ship repeatedly under new event IDs. Physical
product conservation alone cannot prove per-order fulfillment correctness.
Tests must pin these as separate invariants and keep rejected operations
byte-equivalent. Constructor inputs and start+duration bounds need focused
validation, not an additional generic state framework.

## Canonical capacity follow-up

The static main fixture declares packing serviceCapacity 2 with only one
physical service position for each station. Silently using min(2,1) obscures
the operational assumption. Executable resource admission should reject
inconsistent capacities or explicitly expose a validated effective capacity;
the connected-scene milestone must reconcile the canonical configuration
and its inspector before claiming the configured capacity runs. Do not add
overlapping service positions to make the numbers pass.

## Evidence and next gate

The original local counterexample output is preserved privately at
`.coordination/m2b-independent-counterexamples-initial.json`, with its review
driver `.coordination/review-m2b-counterexamples.mjs`. These use the pre-fix
API and intentionally demonstrate failures; retain the observations when
adding a post-fix assertion driver. Add durable focused tests and refresh
the built proof after the revision. Acceptance requires independent post-fix
checks, not merely a larger implementer test count.

## Final independent verdict

Codex reran `.coordination/review-m2b-postfix.mjs` against the rebuilt exports
after the final temporal correction: all 9 assertion groups passed. They
cover remaining-demand retries, operation-scoped idempotency, delivery
attribution, causal times and overflow, retained output, immutable resource
configuration, zero-queue service, terminal repeat fulfillment and historical
lane reuse. Rejection checks compare complete snapshots before and after.
The initial failing observations remain archived; sanitized initial and final
results are in `evidence/sanitized/v3-m2b-independent-review.json`.

Muse's final verification is 148/148 simulation tests, package build and all
four workspace typechecks. Codex inspected the per-position release-time
guard and the literal multi-lane/held-output tests; those tests preserve
same-time release/start and original enqueue age. The accepted component is
headless stock/reservation/resource state only. It does not establish actual
transport, physical queues, order lifecycle execution or operations reports.
The canonical packing capacity mismatch remains a required correction for
the next geometry/transport integration, with no overlapping extra positions.
