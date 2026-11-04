# Current delivery checkpoint

Verified 2026-11-04: application f24a6a1 is pushed and deployed at
/opt/layoutlab/releases/f24a6a1 on whisperdesk-vps. Native build passed;
ledger bytes stayed unchanged on upgrade. Public URL:
https://layoutlab.endpx.cloud, existing Basic Auth. Live Meta is configured
server-side with muse-spark-1.3-contributor. Never print private runtime.env,
access.json or local .env credentials.

E4a backend accepted after independent review fixed cross-route concurrency
and report consistency. Full API155 passed, build/typecheck passed. Codex
confirmed peak1 with competing requests returning429; tampered input stock,
config, trace links/metrics, declared caps and versions reject; genuine
rejected-then-finished reports verify. Evidence e4a-independent-review.json.

One actual public investigation then COMPLETED:
fd2247b1-8335-4575-a55b-1f579cc3717b,3 model requests,2 experiments,
model recommendation exp-2. Synthetic six-order baseline502400ms;
packingDurationMs30000 ->442400ms; dispatchDurationMs30000 ->397100ms.
Selected reduction105300ms /20.959395%, shipped6 in all, totalWait614900ms
unchanged. Offline investigation verification passed with no mismatches.
Reported tokens2589 input/2485 output, estimated token costUS$0.0007559
at verified Contributor rates, NOT invoice. Hypotheses explicitly qualified
as modeled assumptions. Evidence e4a-live-investigation-f24a6a1.json and
verification sibling. Docs/evidence commit99bc5e4. No superiority benchmark
or UI completion claim follows from this single integration run.

Persistent budget v2 /var/lib/layoutlab/budget.json last observed:
capUS$1, committedUS$0.75, availableUS$0.25, entries3, reserved0.
These are conservative allowance claims, not actual costs. Existing user
public permission covers remaining allowance. NEVER reset/refill. Earlier
failed schema smoke and successful one-shot remain recorded. Completed
benchmarkUS$1.50 is separate and cannot be reused. Do not automatically rerun
.coordination/run-e4a-live.mjs: its marker already exists with the run ID.
Reconcile via GET only if needed; do not create another paid investigation.

E3 also accepted/deployed: full input/policy comparison export, invalid
candidates retained, five independent tamper cases reject, clean report and
literal micro oracle pass. API public comparison was independently rerun
without model calls. Staffing clones are infeasible on current geometry;
retain invalid outcomes, never relax constraints silently. No supported
traffic/picking-policy/assignment interventions beyond current patch surface.

Next active milestone E4b: Experiments UI, spec
.coordination/e4b-experiments-ui-task.txt. One Muse worker. It must follow
DESIGN.md and user UI v3 references, preserve planner/operations, show explicit
permissions, baseline/trace/recommendation/all candidates, isolated real
engine inspection, recorded Meta replay with label, export and actual
verification. Worker has ZERO paid-call authorization. A local fixture
provider tests the live flow; real Edge or Orca for screenshots/recording.
Only narrow server verification endpoint and budget metadata additions allowed;
accepted investigation engine/prompts/guard/evaluator must stay intact.
No commit/push/deploy, existing geometry/assets, or coordinator doc edits.

After UI: independent review and public UI verification, equal-budget AI
contribution evaluation (offline first), demo/release docs. No whole-v3
completion claim. User authorizes local work, push and deployment; native
processes only, no Docker/PostgreSQL. Codex plans/co-ordinates/reviews; one
Muse coding worker through Orca, Ponytail. Edge and Orca browser approved.
Keep all unfinished v3 capabilities explicit and SimReady provenance intact.

E4b dispatch: ctx_f6d89286e311 / task_be6aba222588 /
term_854e6d2e-b0dd-4950-a26a-a6aed8c6131e, run_e517b4a4e975.
Await worker_done; no parallel editing of its owned frontend/server files.

## Public access and realism steering (2026-11-04, current)

User approved anonymous website/simulation/replay/verification; only paid
inference requires existing Basic Auth. Coordinator changed only LayoutLab
Nginx site and verified: public UI/status/budget200; paid routes and
/live-access401 anonymous; correct auth unlock200; private source paths404;
budget unchanged, availableUS$0.25. Evidence public-access-split.json.
Root without query redirects to ?mode=operations. Existing credentials remain
private in .coordination/layoutlab-public-access.json; username layoutlab.
No password published to Git or public description.

User explicitly rejects old planner entry, washed-out/cluttered rendering,
cart-only agents and wireframe cargo. Wants shared realistic planning and
operations, physical movement, human workers and detailed3D cargo/materials.
See docs/WAREHOUSE_REALISM_REQUIREMENTS.md. Independent main8h shift probe:
28 orders/12 deliveries,11 shipped/17 backlog, all deliveries RECEIVING,
checks empty, replay matched. Not full completion. Existing public mode is
six-order/no-delivery burst; full-shift exposure and blockers need review.

E4b worker delivered functional UI with160 API tests,44 web units,16 Edge
Experiments checks+24 regressions reported; uncommitted and not accepted yet.
Follow-up spec .coordination/e4b-access-realism-followup.txt: default operations,
explicit planner route, live sign-in/401 UX, then read-only render/physics/
human asset audit with concrete next milestones. No full-brief dispatch,
no engine/asset implementation in this follow-up, no paid calls. Original
catalog snapshot has3769 entries; naive name search found no human workers,
not proof absent. Need actual category/package inspection before source claim.

Follow-up active: ctx_3eda37882ee2 / task_c415e2be0c7e /
term_ab5449e827351eedbf24ef3b7445fc1c. Same Muse, modelWonder1.0 max.

Brand update: user requested ChatGPT-generated logo for website/favicon.
Coordinator generated2 transparent RGBA assets with built-in imagegen,
saved apps/web/public/brand/layoutlab-symbol-v1.png (1254square) and
layoutlab-logo-v1.png (2172x724), alpha0..255 verified. Prompts/hashes in
docs/BRAND_ASSETS.md. Commit7eef6a6 contains only brand assets/doc.
Integration sent to active Muse ctx_3eda37882ee2 via msg_5d9686595780:
header+PNGfavicon wiring, correct aspect/MIME/actualdimensions and Edge
small-size review, no duplicate wordmark. No Meta application budget used.

## E4b review and pending source choice (2026-11-04)

Follow-up ctx_3eda37882ee2 delivered entry/access/logo plus read-only realism
plan. Source index independently refreshed from Central2026-11-04T10:34Z:
3769 assets, same human-name/category search false positives only. Asked
user asynchronously whether ONLY human-character sourcing may extend to
NVIDIA Isaac Sim / clearly licensed external human assets; no answer yet.
All warehouse/rack/cart/container assets remain required SimReady. Official
Isaac docs identify male_adult_construction_03 with skeleton; browser reuse
license/conversion NOT verified, do not integrate without source exception.

E4b final review found actual App.tsx Unicode corruption (12 mojibake markers),
shallow report import allowing missing UI fields/crash, fixture live flow
mislabeling, and loading a recorded report could overwrite a running runId.
Narrow fix dispatched ctx_1b80e5460262 / task_bc560531c235 /
term_f4edb0626c9565043bddfb09b6fbbabe. Same files, no renderer/engine changes,
no paid calls. Also clarify realism-plan label packer already exists and
z-fighting diagnosis is unproven hypothesis. On completion review/publish
E4b+brand, then start R1 render/solid cargo while human source decision waits.
Public API remainsf24a6a1; anonymous site/rootOperations is already configured
at Nginx; last budgetUS$0.25. Active E4b source remains uncommitted.

## Human-source exception approved (2026-11-04)

User answered the pending question: Boleh, khusus karakter manusia.
Human worker assets may now be sourced from NVIDIA Isaac Sim or another
clearly licensed source; all warehouse/rack/cart/container models remain
SimReady. This is permission to investigate and integrate a suitable human
asset, not a paid purchase/subscription or blanket license acceptance.
Verify per-asset redistribution/derivative permissions, source revision,
files, dependencies, dimensions, rig/animation and browser conversion.
Approval relayed to current Muse ctx_1b80e5460262. Current narrow E4b fixes
remain first; R1 rendering/cargo and R2 human/kinematics follow as bounded
milestones. No longer ask for this same source exception.
