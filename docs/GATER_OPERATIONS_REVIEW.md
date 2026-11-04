# Gater operations review (G2b)

Operations proposals, investigation summaries, and saved investigation reports now declare `provider: gater` when configuration identifies Gater. The verifier accepts exactly Gater/Gater or historical Meta/(Meta, fixture, unsupported) pairings; unknown and mismatched pairings fail. No envelope fields were added.

Request counters retain dispatched-request semantics. Gater uses zero `realMetaRequests`; requestCount and modelRequestsUsed still reflect actual dispatches. Existing engine, admission, input, security, cap, and counter validation remains unchanged.

Offline replay verifies engine calculations and consistency of declared provenance. It cannot authenticate the declared provider or prove that a live inference occurred. Legacy pairing coverage uses the same saved valid recording relabeled with consistent historical metadata; it is not a new historical live-provider proof.

Validation:
- `npx vitest run apps/api/test/gater-operations.test.ts`: passed 1 file, 2 tests, 22.67 seconds. Injected FetchLike only, fake key, no network. Covers concrete proposal provenance, domain rejection, six-order duration experiment and finish, saved JSON/keyless verification, dispatch accounting, unknown/mismatched provenance and tampered counters, and historical accepted pairings.
- `npx tsc --noEmit -p apps/api/tsconfig.json`: passed.

Files: apps/api/src/operations-api.ts; apps/api/src/operations-investigations.ts; apps/api/test/gater-operations.test.ts; docs/GATER_OPERATIONS_REVIEW.md.

Remaining gates: legacy runs routes and UI compatibility are outside G2b; layout investigation belongs to its separate worker. No live Gater compatibility, credentials, remote inference, deployment, full-suite claim, or production readiness is established. No build, commit, or shared dist mutation was performed.
