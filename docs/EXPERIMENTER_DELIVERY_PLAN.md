# AI Warehouse Experimenter delivery priority

User direction, 2026-11-03. Preserve the working planner, evaluator, reports,
asset provenance and the full v3 backlog. The submission priority is a
complete, checkable decision workflow: open sample, run baseline, ask a
planning question, inspect controlled experiments, compare, export.
Visual reference: [UI_REFERENCE_V3.md](UI_REFERENCE_V3.md), extracted from the
user's eight-screen ZIP. Apply it during bounded integration; its numbers,
statuses and pictured warehouse models are illustrative.
This changes execution priority; it does not make unimplemented v3 features
complete or authorize unsupported experiments.

## Verified starting point (updated2026-11-04)

- Restricted public release f44081a includes the main warehouse, engine-driven
  operations, dispatch, inbound/put-away, split trips, and report replay.
  Historical detailed geometry/engine proofs remain in their review docs.
- The public guard and provider schema have passed independent review. One
  actual operations proposal succeeded, with model/run usage metadata in
  public-meta-smoke-f44081a.json. The earlier failed smoke remains recorded.
- The experiment API is still a foundation: explicit intervention permission,
  complete failure retention, metric/report recomputation and a bounded Meta
  experiment tool loop need their own gates. An HTTP200 proposal does not
  prove any operational improvement or AI-selection quality.
- Source asset/material/performance limitations remain documented; no mobile,
  full-warehouse benchmark or production-readiness claim is added.
- The main fixture restricts slot eligibility. Do not silently relax locks,
  fit or compatibility to manufacture assignment improvements.

## Ordered acceptance gates

| Gate | Required result | Evidence |
|---|---|---|
| E0: accepted environment | Main mode and its controls identify the synthetic configured scene; no export or live status from the hidden planner | Focused browser review plus geometry evidence |
| E1: operational state | Atomic all-or-none reservations; explicit stock buckets; finite resources and queues; failures preserve stock and commitments | Independent two-job/one-station and stock-shortage/inbound oracles |
| E2: one connected scenario | Multiple scheduled orders and at least two mobile units move on admitted engine routes, pick real stock and encounter a legitimate wait at finite packing capacity | Headless replay, conserved inventory, swept-motion/stationary-occupancy checks, main-app recording |
| E3: controlled experiments | Baseline and supported interventions use identical frozen exogenous inputs, seed and versions; failed runs remain visible | Offline recomputation from exported inputs, metric/time-category reconciliation, small known-answer comparisons |
| E4: bounded Meta agent | Validated allowed experiment requests; server-owned budgets; recommendations reference run IDs and measured contrasts | Tool audit trail; prohibited changes rejected; request/experiment caps; stub/replay/live labels |
| E5: AI contribution | Compare experiment selection against a fixed/simple strategy at the same experiment budget | Complete evaluation set including invalid choices, no improvement and losses |
| E6: release | Reviewed deployment, end-to-end trial, recording and documentation match actual capabilities | Public build identity, browser evidence, replayable exported run |

Each row is delivered through bounded Muse tasks and independent Codex
review, with one coding worker and explicit file ownership. E1/E2 can be
split into separately verified parts; neither a state library nor a static
scene closes the connected-scenario gate. Receiving, put-away, dispatch,
all configured agents and remaining v3 capabilities stay explicit backlog
until their gates pass. Do not implement fake completion to meet a date.

## Experiment and claim contract

Only expose actions actually implemented by the engine. Assignment changes
hold workload, staff and packing capacities fixed. Picking/traffic policy
comparisons require implemented alternative policies. Capacity changes must
be explicitly allowed by the user for that experiment. A no-new-workers
question forbids increasing staffing. Model requests cannot mutate stock,
workloads, results or arbitrary code. Reject unsupported patches before runs.

Freeze scheduled orders and inbound deliveries, initial stock, geometry,
service assumptions, seed, engine version and run termination policy for
each comparison. Preserve each run and its changed fields. Report makespan
or completion counts together with unfinished backlog and validity; static
distance remains a separate diagnostic. Explain causal hypotheses through
controlled contrasts. A large wait metric alone does not prove a bottleneck.

Use literal hand oracles: two jobs at a single station with known queue
times; two units competing for exclusive access with known admission order
and wait; stock-short order that cannot finish before processed put-away;
tiny assignment enumeration with all feasible alternatives checked. Export
verification must execute the engine without an API key rather than repeat
saved totals. Frame rate and playback speed cannot change outcomes.

## Time and authorization

The official event page inspected on 2026-11-03 states Nov 4, 9:00 PM ET:
https://dev.meta.ai/events/global-hackathon. With Eastern standard time on
that date, this is Nov 5, 09:00 WIB. The page says dates may change. Treat
this as a delivery constraint, not a promise that all v3 work will finish.

Existing paid approvals remain separate: the completed planning benchmark
is not permission to repeat it. The initial public Meta allowance is US$1
total and must remain fail-closed until its persistent guard is reviewed.
Keep keys server-side. No new paid evaluation set is authorized by this
planning update. Native processes only; no Docker or local PostgreSQL.
