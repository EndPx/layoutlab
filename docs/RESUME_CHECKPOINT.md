# Current delivery checkpoint

Verified on 2026-11-04 after inspecting actual Git and VPS state:

- Local main is ad9e739, clean before the current review notes. Latest application commit3093591 is installed at /opt/layoutlab/releases/3093591; layoutlab.service is active.
- Public URL: https://layoutlab.endpx.cloud (existing Basic Auth). GET /api/status on the VPS returns setup_required/liveAvailable:false because no server model key is configured.
- Code now includes dispatch/SHIPPED (2e08925), inbound/put-away, split trips and operations report replay (2f53ebf), plus a controlled-experiment API, one-shot Meta patch proposal and initial budget guard (3093591). These are beyond the earlier R1/static-only checkpoint. Do not redeploy or rebuild completed milestones from stale history.
- Current GET /api/budget reports active, cap US$1, reserved/committed0, available1, entries0. This is a status response, not proof of a sound guard.
- Independent offline review found missing-file allowance reinitialization and negative-ledger-entry acceptance. Source inspection also found refunds after ambiguous provider failures and no total-allowance guard on legacy /api/runs. Public key/inference activation must wait for the bounded correction and independent verification.
- User already authorized US$1 TOTAL for initial restricted public Meta use. Do not ask for that authorization again; never refill automatically or reuse the completed US$1.50 benchmark allowance.

Next delivery sequence:
1. Harden and independently verify the global budget guard across every paid path, using offline fake transport only.
2. Complete the actual Experimenter workflow: frozen baseline, explicit allowed changes, bounded experiment loop, retained failures, evidence-linked recommendations and full report/metric recomputation. Current API only proposes one patch; it is not yet proof of this closed loop. A no-new-workers question must prohibit staffing patches server-side. Do not expose unsupported policy actions.
3. Install the app key server-side through the existing protected deployment workflow only after the guard gate, then one bounded live smoke within the existing US$1 total allowance.
4. Compare AI experiment selection with a fixed strategy at equal experiment budgets, preserve failures and no-improvement results, verify the deployed flow in Edge/Orca, record the demo and align claims/docs.

Working rules: Codex plans/co-ordinates/reviews; one Muse coding worker through Orca; Ponytail; no overlapping edits; native processes, no Docker/PostgreSQL. Push and deployment are authorized. Runtime keys remain private/server-side. Original SimReady source assets and provenance stay intact. User allows Edge and Orca for application/render/performance tests.

Historical milestones and evidence remain in Git history and the specific review documents (V3_M2B/M3A/M3B/M3C, cargo C1/C2, EVALUATION, EVIDENCE_BASE). The previous checkpoint accumulated contradictory historical present-tense statements; use this verified header as current state, not the former R1/unimplemented wording.

## Guard review continuation (2026-11-04)

Muse delivered first correction on ctx_c0cb9d1968b7 (120 API tests reported passing). Codex independent compiled-build review confirms the missing-ledger refill and negative-entry bugs are fixed, but found a remaining phase-transition bypass: removing the ledger after interpretation and before approval still returns HTTP 200 COMPLETED and performs three additional fixture provider calls. A positive 1e-12 USD reservation also incorrectly rounds to zero and is accepted. Evidence: .coordination/review-guard-v2.mjs and .coordination/guard-independent-v2-review.json (zero real Meta calls).

Revision dispatched to the same Muse via follow-up ctx_ee43dfce01ff, task_5f73bc297076, terminal term_cf96c0965996bfe4f0dd20f17b5c9a18. Require durable reservation validation before every upstream dispatch, including approval/feedback, while allowing an intact last reservation at zero available. Tiny positive amounts must be refused without mutation. Scope includes API runs/provider only as needed; no UI/engine edits, paid calls, deployment, key installation, commit or push by worker. Guard milestone remains unaccepted; public activation awaits independent recheck.

## Guard correction accepted (2026-11-04)

Follow-up ctx_ee43dfce01ff completed. Codex independently verified approval after ledger loss now refuses 503 with zero extra calls; last held reservation completes four requests at zero available; missing/corrupt/released claims between proposals prevent the next dispatch; tiny amount refusal preserves bytes; migration preserves prior expenditure. Evidence: evidence/sanitized/public-budget-independent-review.json. Full API suite rerun: 128/128 pass. Official Contributor rates rechecked and conservative four-request allowance US$0.0664192 is below the US$0.25 persisted claim. No live calls yet. Next: commit/push, deploy with explicit v1 migration preserving US$1 cap/history, install key privately and perform one bounded live smoke under existing public authorization.
