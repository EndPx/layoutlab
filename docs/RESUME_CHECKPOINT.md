# Current delivery checkpoint

Verified2026-11-04: application f44081a pushed and deployed natively at
/opt/layoutlab/releases/f44081a on whisperdesk-vps; layoutlab.service active.
https://layoutlab.endpx.cloud uses existing Basic Auth. Public Meta enabled:
GET status ready/liveAvailable true, budgetGuard active. Private model key
server-side in /etc/layoutlab/runtime.env; never print keys/access passwords.

Real operations proposal smoke succeeded once: HTTP200, contributor model,
response ID chatcmpl-01a1a599-b398-7559-b38a-fa5aa42833f1, tokens332/450,
patch extraPickers0, extraPutaway0, packingDurationMs10000. Synthetic contract
check, NOT an experiment or improvement measurement. Evidence:
evidence/sanitized/public-meta-smoke-f44081a.json. The earlier 2d24a72 smoke
failed HTTP400 schema required-list and remains preserved. No automatic retries.

Persistent /var/lib/layoutlab/budget.json v2: capUS$1, committedUS$0.50,
availableUS$0.50, two entries as of last check. Conservative claim amounts,
not invoices. Existing user public authorization covers remaining allowance;
recheck ledger before further paid calls. Never reset/refill. Benchmark
US$1.50 completed separately, cannot be reused. Original ledger did not exist;
explicit first initialization only after no-key/zero-spend verification.
Deployment f44081a preserved ledger bytes. No key in client or Git.

Guard accepted:128 API tests and independent phase/request/migration gates.
Schema fix accepted:133 API tests reported, independent compiled wire checks,
real provider success. Docs PUBLIC_DEPLOYMENT and OPERATIONS_META_SCHEMA_REVIEW.

Next bounded Muse milestone E3: trustworthy controlled experiment/report
contract (explicit allowed intervention fields, frozen common inputs,
retained invalid/failing candidates, full comparison export and offline
metric recomputation). Current experiments map aborts all on invalid patch,
uses an unrelated one-hour cap, reports partial shipped-time as makespan and
API strips embedded reports. Existing report verifier ignores timestamps,
missing order records, checks and versions. Fix only this evidence/contract
layer first; preserve engine scheduling, geometry, workload, legacy evaluator.
Then E4 bounded Meta tool loop and run-linked recommendation, UI integration,
equal-budget comparison, demo and deployed end-to-end verification.
No full Experimenter completion claim from the current one-shot endpoint.

One Muse coder through Orca; Codex planner/coordinator/reviewer; Ponytail.
No concurrent file edits. Native processes, no Docker/PostgreSQL. Push and
deployment authorized. Edge and Orca allowed for render/performance testing.
Assets remain original SimReady with documented provenance. Keep all v3
unfinished capabilities explicit; do not redo completed dispatch/inbound.
