# Current delivery checkpoint

Verified 2026-11-04: app release `2d24a72` is pushed to origin/main and active
at /opt/layoutlab/releases/2d24a72 on whisperdesk-vps. Public URL:
https://layoutlab.endpx.cloud, existing Basic Auth. Native build passed.

Budget correction accepted after independent compiled-API counterexamples,
last-reservation/feedback/migration checks and full API 128/128 tests. See
evidence/sanitized/public-budget-independent-review.json. Ledger originally
did NOT exist: the old guard fabricated an empty snapshot. Explicit first
initialization was performed only after verifying zero entries/spend and no
server key. v2 ledger now persists at /var/lib/layoutlab/budget.json mode0600.

One public operations smoke reached actual Meta and failed HTTP400 because
PATCH_SCHEMA lacked required keys. Evidence: public-meta-smoke-2d24a72.json.
The guard correctly retained a US$0.25 conservative claim; US$0.75 remains
from the already authorized US$1 total. NOT an invoice; no usage was returned.
Do not rerun the original smoke marker. Never reset/refill the ledger.
Inference is temporarily disabled by blank MODEL_API_KEY in runtime.env;
private /etc/layoutlab/runtime.guard-smoke-2d24a72.env retains the key.
No credentials may be printed or committed. User permission still covers
remaining public allowance; the completed benchmark allowance is separate.

Next bounded Muse task: correct real-provider operations JSON-schema and
verify the wire contract offline, then coordinator review/deploy and one
bounded retry under remaining allowance. No paid calls by worker.
After that, finish Experimenter E3/E4: frozen comparable inputs, allowed
intervention enforcement, retained invalid candidates, complete export and
recomputation, bounded tool loop with run-linked recommendations. Current
one-shot patch endpoint is not this completed product. Staffing must not
increase when forbidden; service assumptions require explicit permission.
Then equal-budget AI evaluation, Edge/Orca demo and release verification.

Current operations code already includes dispatch, inbound/put-away, split
trips and report replay. Preserve all existing planner/evaluator/assets and
full v3 backlog; do not redo R1 or static-only work from stale history.
One Muse coder through Orca; Codex coordinator/reviewer; Ponytail. Native
processes, no Docker/PostgreSQL. Push and deployment authorized. Edge and
Orca approved for browser testing. SimReady provenance remains mandatory.

Active next worker: ctx_fdd681eecd95 / task_b95c1f3b8ab6 / term_c5a5ee0d-b5b1-4382-98c6-008db3e6d3b2. Spec .coordination/operations-meta-schema-task.txt. Scope operations proposal strict wire schema + safe diagnostics, offline tests only. Coordinator-owned release/checkpoint docs excluded. Existing US$0.75 remaining public allowance remains available for a reviewed retry, not an automatic retry of the original marker. Current local docs commit566f7d2; deployed app2d24a72.
