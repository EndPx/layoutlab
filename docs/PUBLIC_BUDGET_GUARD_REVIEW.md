# Public budget guard — correction review

Status: corrected offline, **not activated**. No key was installed, no paid
call was made, nothing was deployed. All verification below uses temporary
ledgers and the local fake Meta transport (`providerKind: fixture`,
`realMetaRequests: 0`). A green `/api/budget` "active" response is a status
report, not a soundness proof; the gates at the end are the proof.

## What was broken (independently reproduced before the fix)

| # | Defect | Consequence |
|---|--------|-------------|
| 1 | Missing ledger file silently recreated as empty | Commit US$0.75, rename the ledger away → snapshot showed US$1 available and a second US$0.75 reservation was accepted (US$1.50 across ledger loss) |
| 2 | No entry validation beyond top-level shape | A valid-JSON entry with `committedMicroUsd: -1000000` showed US$2 available and accepted a US$1.50 reservation |
| 3 | Proposal handler released the reservation on **any** error | Provider dispatch followed by timeout/disconnect/HTTP error/invalid model output refunded the allowance (ambiguous spend became free) |
| 4 | Legacy `/api/runs` + `/approve` never touched the guard | The largest paid surface (up to 4 requests/run) bypassed the US$1 cap entirely |
| 5 | Reservation IDs were idempotent | Re-reserving the same ID with the same amount returned success, so one ID could front additional unaccounted requests |
| 6 | Approval trusted the in-memory run→reservation map alone (independent v2 review) | Ledger renamed away after interpretation → approval returned 200 COMPLETED with 3 further provider calls and no persisted claim |
| 7 | Tiny positive amounts rounded to zero micro-USD | `reserve(id, 1e-12)` wrote a `reservedMicroUsd: 0` entry, leaving a self-invalid ledger |

Both counterexamples were re-run against the corrected build: missing-file
snapshot/reserve now throw `BUDGET_GUARD_UNAVAILABLE`, and the negative-entry
ledger is rejected unchanged. The v2-review scenario was replicated against
the rebuilt dist: approval after ledger removal now returns 503 with **zero**
further provider calls, and `1e-12` is rejected with ledger bytes unchanged.

## Ledger contract (v2)

File shape (exact keys, nothing else):

```json
{ "version": 2, "capMicroUsd": 1000000, "entries": [
  { "id": "run:<uuid>", "reservedMicroUsd": 250000,
    "committedMicroUsd": null, "state": "reserved", "createdAtMs": 0 }
] }
```

- The ledger exists only after **explicit admin initialization** or
  **explicit v1 migration** (CLI below). A configured-but-missing,
  unreadable, corrupt, or schema-invalid ledger fails closed with
  `BUDGET_GUARD_UNAVAILABLE` (503). Nothing auto-creates, auto-empties, or
  refills it — across restarts and deploys the file is the only allowance.
- Strict validation on every read: safe-integer micro-USD only;
  `reservedMicroUsd` in `1..cap`; `committedMicroUsd` is `null` unless
  `state: "committed"`, where it must be `0..reserved`; `state` ∈
  `reserved|committed|released`; unique IDs (≤256 chars); ≤10,000 entries;
  totals (`reserved` + `committed`) must never exceed the persisted cap.
  Any violation rejects the whole ledger; the file is left byte-identical.
- The cap is **persisted in the ledger** and must equal the configured
  `PUBLIC_BUDGET_USD`, else `BUDGET_CAP_MISMATCH` (503). Lowering/raising
  config cannot silently shrink or refill the allowance.
- Reservation IDs are **single-use in every state** (`BUDGET_DUPLICATE`
  409). Amounts must resolve to whole micro-USD; NaN, negative, zero,
  fractional-micro, overflowing amounts — and any positive amount that
  would round to zero micro-USD (e.g. `1e-12`) — are rejected **before**
  any mutation, leaving ledger bytes unchanged.
- `reserved` = a conservative bound **held**. `committed` = that bound
  **charged after dispatch**. Neither is an invoice or a confirmed provider
  price; no surface claims otherwise.

## Locking and durability

- Every mutation (`reserve`/`commit`/`release`, migration) holds a native
  exclusive lock: the sibling `<ledger>.lock` file created with `wx`,
  containing holder pid/time. Contention retries for 5 s, then fails closed
  with `BUDGET_GUARD_LOCKED`. Simultaneous processes/instances therefore
  cannot lose updates or overspend (verified by 4 parallel child processes
  racing US$0.60 reservations against a US$1 cap: exactly one succeeds).
- Persistence is write-temp → fsync → atomic rename → best-effort directory
  fsync, completed **before** the caller is allowed to spend. Persistence
  or lock failure is always fail-closed.
- **Stale-lock recovery (manual, claims preserved):** stop the API, verify
  no API process is running, delete only `<ledger>.lock`, restart. Locks are
  never auto-removed (a crashed holder is indistinguishable from a slow
  one), and deleting the lock never touches ledger entries. Never edit
  ledger totals by hand; a hand-edited file fails validation and stays
  fail-closed until restored.

## Admin CLI (offline; no reset/refill/migrate HTTP endpoint exists)

After `npm run build --workspace @layoutlab/api`, using the **explicit
deployment ledger path** (the value configured as `BUDGET_STATE_FILE`):

```sh
# Fresh deployment only - refuses to overwrite any existing ledger:
node apps/api/dist/budget-admin.js init    --file <ledger.json> --cap-usd 1
# Existing version-1 ledger (current deployment: entries 0, cap US$1) -
# validates every entry, preserves entries/order/totals, stamps the cap:
node apps/api/dist/budget-admin.js migrate --file <ledger.json> --cap-usd 1
```

`--cap-usd` for migration must be the cap the v1 ledger operated under
(US$1); migration refuses if audited totals exceed it, and refuses corrupt
ledgers unchanged. Output is aggregates only; no keys are read or printed.
No production migration was performed in this task.

## Route coverage (when the guard is configured)

| Route | Guard behavior |
|-------|----------------|
| `POST /api/operations/proposals` | Local preflight first (key present, observation 1..4000 chars) — rejection spends nothing and calls nothing. Then one durable `proposal:<uuid>` reservation, then the provider. **Any** outcome after invocation (success, HTTP/transport error, timeout, disconnect, invalid patch) commits the full bound. |
| `POST /api/runs` | Local preflight (live check, body schema), then **one** durable `run:<uuid>` reservation for the entire bounded run (≤4 requests, ≤3 proposals, ≤2000 completion tokens/request, existing context caps). Scenario/store validation failure before any counted attempt releases it. Overspend → 402 before any provider call. |
| `POST /api/runs/:id/approve` | Spends only against the run's existing reservation — approval with no reservation is refused 503. No second reservation; a run reserved as the last US$0.25 still completes all 4 requests at 0 available. |
| Every upstream dispatch | The in-memory map only *locates* a claim. `assertReservation` re-reads and strictly validates the persisted ledger (cap, schema, totals) and requires the exact entry to still be `reserved` at ≥ its original bound — checked in the approval handler, again inside `RunStore` immediately before the interpretation fetch and before **each** proposal fetch (no await between check and fetch), and in `proposePatch` before its fetch. Available = 0 does **not** block a fully held claim. Refusal before approval leaves the run `AWAITING_APPROVAL` and the claim held (restoring the ledger lets the same approval proceed); refusal between proposals fails the run with zero further calls and preserves the held/charged claim (settlement commits it once the ledger is readable again, and never releases it after a counted dispatch). |
| `POST /api/runs/:id/cancel`, terminal states via `GET /api/runs/:id` | Settles the same claim once: zero counted attempts → release (verifiably no dispatch); ≥1 counted attempt → commit the full bound. |
| `GET /api/budget` | Safe aggregates only (cap/reserved/committed/available/entry count + accounting note). Unavailable ledger → truthful 503, never a fabricated zero state. |
| `GET /api/status` | Adds `budgetGuard: not_configured|active|unavailable`. A configured-but-unavailable guard forces `liveAvailable: false` — status never advertises usable live inference it cannot guard. |

With no guard configured (`BUDGET_STATE_FILE` empty), local fixture/offline
flows behave exactly as before. A configured guard can no longer be
bypassed by choosing a different route.

## Cost-bound assumptions (read before activation)

- `PUBLIC_BUDGET_PER_RUN_USD` (default 0.25) is a **governance bound
  committed in full** per proposal/run against the US$1 total — it is not
  derived from, and does not claim to equal, Meta's price. Because the full
  bound is always charged, allowance accounting stays sound even if actual
  provider pricing is lower.
- The bound is only a *spend* guarantee if one worst-case bounded run
  (4 requests × ≤2000 completion tokens, prompt bounded by
  `maxContextChars` 20000 chars plus schema/instructions) cannot cost more
  than US$0.25 at the approved model's real pricing. **Activation
  preflight:** confirm the official `muse-spark-1.3` pricing, price the
  worst case above, and if it exceeds the per-run bound, raise the bound
  (fewer runs per US$1), lower the request/token caps, or do not activate.
  Do not relabel a generic per-run figure as a cost estimate without that
  check.

## Limits and deliberate non-features

- Settlement of legacy runs is lazy: the in-memory run→reservation map
  settles on the first terminal observation (`GET`/approve/cancel). An
  orphaned `reserved` entry (crash, abandoned run nobody polls) keeps
  counting against the cap — safe, visible in `/api/budget`, resolvable by
  audit; it never silently frees allowance.
- `commit(id, usd)` still accepts an explicit lower amount for a future
  authoritative-usage reconciliation, but **no server path uses it**: all
  routes commit the full reservation.
- Lock wait is bounded at 5 s fail-closed; ledger is capped at 10,000
  entries / 8 MiB (shortcut: ample for a US$1 public allowance; revisit if
  the allowance model ever changes).
- Dispatch revalidation is an immediate pre-fetch read, not a lock held
  across the provider call (holding it would serialize all spend and block
  settlement for up to the 120 s run timeout). An external actor deleting
  the ledger in the sub-millisecond between check and fetch cannot be
  excluded by any check-then-call design; every *observable* phase/request
  boundary is revalidated.
- No database, no new framework, no public reset/refill/migrate endpoint.

## Verification (this task, fake transport only)

- Guard focused suite (`apps/api/test/budget-guard.test.ts`, 38 tests):
  both exact counterexamples; corrupt/negative/fractional/overflow/
  duplicate/invalid-state ledgers rejected unchanged; init refuses
  overwrite; v1 migration preserves totals and refuses corrupt input;
  stale lock fails closed; 4-process reservation race admits exactly one;
  ID reuse refused in every state; proposals commit on success, provider
  error, post-receipt timeout, and invalid output; invalid input/no-key
  consume nothing and call nothing; missing configured ledger blocks all
  paid routes and status; legacy last-reservation 4-request run completes
  at 0 available; overspend/invalid-scenario/cancel lifecycle; **plus the
  v2-review regressions**: `1e-12` rejected pre-mutation with bytes
  unchanged; `assertReservation` at zero available; ledger
  loss/corruption and claim release/removal between interpretation and
  approval refuse 503 with zero further calls (and recovery after ledger
  restore); ledger loss and claim release **between proposal requests**
  stop the next dispatch, fail the run, and preserve the claim.
- Full API suite: **128/128 passed** (the previous 90 plus 38 focused).
- Independent-scenario replication against the rebuilt dist (equivalent
  of the v2 review script, run from /tmp so reviewer files stay
  untouched): tiny rejected, approval-after-removal 503, 0 extra calls.
- Root `npm run build` and root `npm run typecheck`: pass.

## Next activation gate (unchanged, in order)

1. Codex independently re-reviews this correction (incl. re-running the
   counterexamples) — required before any key or paid test.
2. On the deployment host only: `budget-admin migrate` the existing v1
   ledger with `--cap-usd 1` (entries currently 0), verify `/api/budget`.
3. Pricing preflight above; adjust per-run bound/caps if it fails.
4. Install the key server-side via the protected deployment workflow, then
   one bounded live smoke inside the existing US$1 total authorization.

## Codex acceptance and price preflight (2026-11-04)

The revised compiled API passed independent checks recorded in
`evidence/sanitized/public-budget-independent-review.json`: an intact last
reservation completes all four requests at zero available; ledger loss,
corruption, or released claims between proposals stop the next dispatch;
positive sub-micro values are refused without ledger mutation; v1 migration
preserves prior expenditure. The original approval-phase counterexample was
also rerun: 503, zero additional fixture requests. The coordinator reran the
full API suite: 128/128 pass. No real Meta calls occurred in these checks.

Official pricing was rechecked at https://dev.meta.ai/docs/pricing-rate-limits
on 2026-11-04: muse-spark-1.3-contributor costs US$0.10/M input tokens and
US$0.20/M output tokens. The provider bounds the entire serialized request,
including schema, to 40,000 JavaScript characters and output to 2,000 tokens.
Using the existing benchmark conservative allowance of 4 bytes/tokens per
character plus 2,048 framing tokens gives 162,048 input tokens/request:
4 * ((162048 * 0.10 + 2000 * 0.20) / 1000000) = US$0.0664192/run.
The persisted US$0.25 full-run claim exceeds this allowance; a one-request
operations proposal uses the same conservative claim. No search tools,
automatic retries, images or audio are sent. This is a conservative pricing
preflight, not an invoice or a tokenizer measurement. It applies only to the
approved Contributor model and these fixed limits; recheck before changing
the model, rates or request bounds. Public total authorization remains US$1.

The code correction is accepted for deployment. Deployment migration and
actual live smoke results must be recorded separately after execution.
