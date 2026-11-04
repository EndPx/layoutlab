# Current delivery checkpoint

Verified on 2026-11-04: application commit 0109f02 is pushed and deployed at
/opt/layoutlab/releases/0109f02 on whisperdesk-vps. The native service is
active. Public URL: https://layoutlab.endpx.cloud with existing Basic Auth.
Live Meta uses muse-spark-1.3-contributor; the model key exists only in private
/etc/layoutlab/runtime.env. Never print keys or access credentials.

E3 is accepted. Five independent tamper cases now reject; clean exports
recompute. Hand oracle: baseline READY timestamps 6100/11400 ms; changed
service 7100/12400 ms; NO_IDLE_PICKER wait 0..5100 ms; shipped 0 and makespan
null. Full serial simulation 251 and API 134 passed before the final narrow
fix; final focused suites 41+12 and typechecks passed. The existing parallel
transport test's 5s timeout remains documented; no geometry test was weakened.

The deployed /api/operations/experiments returned a complete /2 report and
local offline verification found no mismatches. Synthetic six-order baseline
makespan 502400 ms, faster dispatch 343200 ms, slower dispatch 1942400 ms.
A staffing patch denied by policy remained invalid. These are declared engine
service assumptions, NOT real warehouse savings or AI-selected improvements.
Evidence: e3-public-*, e3-independent-review.json under evidence/sanitized.
This public comparison check used zero Meta requests. UI investigation and
E4 remain open. Docs/evidence commit 4d7b2ca follows app commit 0109f02.

Earlier one-shot operations Meta smoke f44081a succeeded: HTTP200, response
chatcmpl-01a1a599-b398-7559-b38a-fa5aa42833f1, tokens 332 input / 450 output,
patch staffing 0 / packing 10000. The earlier schema HTTP400 failure remains
preserved. Persistent /var/lib/layoutlab/budget.json v2 last observed: cap
US$1, committed US$0.50, available US$0.50, two entries, no reserved claims.
These are conservative claims, not invoices. Never reset/refill. Existing
user authorization covers the remaining public allowance; completed US$1.50
benchmark permission is separate and cannot be reused. Deployment preserved
ledger bytes. Recheck before further paid requests.

Active E4a worker: ctx_348de48bfdb9 / task_f085bf180ca9 /
term_98885dab-0b35-477d-b13f-ee9638ff0263. Spec:
.coordination/e4-investigation-backend-task.txt. One Muse backend task:
bounded question -> validated experiment -> real engine feedback -> next
choice -> evidence-linked recommendation; max four model requests and three
alternatives, one existing full-run budget claim, explicit permissions,
async polling/cancellation and complete replayable report. Worker tests use
fake transport only. Owned API investigation/server/tests/CLI/doc files;
simulation only minimal helper reuse. No UI, engine scheduling, fixture,
assets, secrets, README/deployment/checkpoint edits or paid calls by worker.

After E4a: independent review, bounded live check within remaining allowance,
UI integration, equal-budget evaluation, demo and deployment verification.
No unsupported traffic/picking-policy/assignment actions. Staffing clones
are infeasible in current geometry: preserve invalid outcomes, never quietly
relax constraints. A one-shot proposal does not complete E4.

Working rules: one Muse coder through Orca, Codex planner/coordinator/reviewer,
Ponytail, no concurrent file edits. Native processes, no Docker/PostgreSQL.
Push and deployment authorized. Edge and Orca allowed for application/render
and performance testing. Preserve legacy planner, evaluator, SimReady assets
and provenance, and the full v3 backlog without false completion claims.

## E4a first review (2026-11-04)

ctx_348de48bfdb9 delivered offline backend and reports150 API tests passing.
NOT accepted yet. Independent clean report reruns; hand percentage
159200/502400*100 rounds to31.687898. Confirmed blockers: one-shot pending
plus new investigation reaches2 concurrent fake calls despite concurrency1;
verifier accepts changed valid input stock/config, missing tool trace,
requestIndex999, fabricated shipped/version, declared limit1 for2 requests.
A genuine generated rejected-unknown-finish then accepted-baseline report
incorrectly fails verification. Evidence in .coordination/review-e4a-*.mjs
and e4a-independent-*.json, zero real Meta calls. Model payload also needs
bounded frozen operational context, not only candidate metrics.

Revision sent via same Muse: ctx_6bc557209889 / task_0a29aee84195 /
term_8a59856c54b288b3287bc5da4693153e. Full instructions in
.coordination/e4a-review-revision.txt. Same owned files; shared concurrency,
strict evidence consistency, rejected-action replay, bounded context and
sanitized model diagnostics. No paid calls/commit/push/deploy by worker.
E4a changes remain uncommitted; public0109f02 and last observedUS$0.50
available allowance unchanged. Review again on worker_done before live test.
