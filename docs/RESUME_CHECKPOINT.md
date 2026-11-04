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

## Parallel Muse work explicitly authorized

User asked for multiple Muse workers and then confirmed "gas bagi jadi
banyak worker". This supersedes the previous one-worker restriction.
Total3 coding/research workers, same Muse defaultWonder1.0 max:
- R1 render/solid cargo: ctx_4bf3e60f998e, task_0017a808f5d4,
  term_23b7c0c4-b7f5-47b4-bf5c-0ef6ecd753a5. Original R1 ownership unchanged.
- R2a human asset/rig isolated validation: ctx_e29516a99a09,
  task_08ae1d052734, term_b1cdbab6-0205-410c-aba0-cb7c6fa79e9f.
  Spec .coordination/r2-human-parallel-task.txt. Own human-only new assets,
  prefixed scripts/manifests/licenses/evidence, private r2-human harness,
  docs/HUMAN_ASSET_REVIEW.md. No main renderer/engine/package edits.
- R3a full-shift/shared-state diagnosis: ctx_859aabb6b534,
  task_2c7e26d118e3, term_dd877d43-1774-42ea-830d-626c39a57705.
  Spec .coordination/r3-shift-parallel-task.txt. Read-only main source;
  own new diagnosis scripts/evidence, private r3-shift namespace,
  docs/FULL_SHIFT_DIAGNOSIS.md and SHARED_PLANNING_OPERATIONS_CONTRACT.md.
No shared dist/root builds by R2/R3 while R1 validates; no overlapping edits.
No paid application Meta calls, commit/push/deploy by any worker. R1 notified
of ownership split via msg_fa6164ac94ce. Coordinator reviews each lane before
merging dependent integration; all source permissions and acceptance gates
remain intact. No need to re-ask for parallel-worker authorization.

## Unified workspace + physical layout scope (latest user direction)

User approved one Operations-based warehouse workspace and then explicitly
made direct physical layout editing PRIMARY (supersedes original fixed-rack
constraint for new work). Main scenario authority is Operations, never merge
legacy four-rack sku-a outputs with six-rack P01 data. User story uses a
distributor/e-commerce inbound + outbound flow; orders are data, not people.
Canonical attachments/stock/workload/config and evidence must remain coherent.
Read docs/UNIFIED_WORKSPACE_REQUIREMENTS.md and INTERACTIVE_LAYOUT_REQUIREMENTS.md.

Priority vertical slice: manual packing-station move -> validate/test/compare,
then Muse proposes the same move through the SAME constraints and validator.
Rack move/rotation and initial agent positions follow; no runtime teleport.
Keep baseline immutable, same workload/stock/service/seed/staff unless explicitly
changed. Service-time hypotheticals are not physical layout optimization.

Updated parallel/task graph:
- R1 ctx_4bf3e60f998e still owns render/cargo, no workspace refactor; notified
  of upcoming layout transforms and isolated L0 namespace.
- R2a ctx_e29516a99a09 finished human diagnostic. Report HUMAN_ASSET_REVIEW.md:
  Quaternius Worker_Male CC0, 23 joints/17 clips, stylized/no textures;
  combined human+cart needs radius1181..1252 vs current799. Await independent
  asset/license/animation review; no engine integration accepted. Owned helper
  node server reportedPID10780 on5196; do not kill without identity check.
- R3a ctx_859aabb6b534 finished diagnosis, awaiting coordinator review:
  inbound capacity infeasible plus liveness cascade; private unmerged patch
  demonstrates outbound28/28, not accepted source changes. Follow-up for new
  canonical/layout decisions is ctx_59689bc8f700 / task_ef9eeb200476 /
  term_6b36d67193d99d69bde0d42135d7039c (prompt submitted).
- NEW active L0 ctx_b12fa0768e59 / task_4fe7e8bd875d /
  term_d1a66eca-d9d2-4fd0-b430-47134c6699bb. Spec .coordination/l0-layout-foundation-task.txt.
  Own isolated packages/simulation/layout-draft, layout-planning scripts,
  private layout-l0 diagnostics and PHYSICAL_LAYOUT_CONTRACT.md/evidence.
  No existing src/index/schema/dist/UI/fixtures changes or shared builds.
- QUEUED U1 task_5fdc8ef3826a: unified workspace, depends R1 task_0017a808f5d4
  and R3a task_2c7e26d118e3. Spec .coordination/u1-unified-workspace-task.txt.
  Start only after coordinator acceptance including current R3 doc follow-up;
  docs requirements include latest physical-layout addendum.
- QUEUED L1 task_67523ad65899: manual packing station editor, depends U1+L0.
  Spec .coordination/l1-manual-layout-task.txt.
- QUEUED L2 task_b07635308b1e: Muse packing layout interpretation/approval/
  proposals through same validator, depends L1. Spec .coordination/l2-muse-layout-task.txt.
No new paid model calls or changes to public release878a07b/budgetUS$0.25.
All worker commits/deployment remain coordinator-only. Human and rendering,
full-shift liveness and wider layout support remain explicit unfinished gates.
