# Controlled experiment review (E3, offline evidence contract)

Status: implemented offline, revised after the initial Codex review, and awaiting coordinator acceptance. This closes only the E3 evidence/contract
milestone. It does not close E4 (agent/tool loop), UI integration, AI
evaluation, or full v3.

## Contract

- `runOperationsExperiment` (simulation) and `POST /api/operations/experiments`
  take frozen common inputs (`scenario`, `executionConfig`), an explicit
  machine-readable `interventionPolicy`, an optional bounded
  `safetyCeilingMs`, and up to 8 total candidates including the baseline.
- The policy lists `allowedFields` (only `extraPickers`, `extraPutaway`,
  `packingDurationMs`, `dispatchDurationMs`, `receivingDurationMs` — the
  already-implemented patch knobs) plus optional tighter `ranges` inside the
  patch schema bounds. An absent policy allows the baseline only. Positive
  staffing changes require the staffing field to be allowed. Service-duration
  changes require explicit permission and are exported as synthetic service
  assumptions, never as measured money/time savings. Free text grants
  nothing. The manual `/api/operations/patches/validate` endpoint stays
  syntax-only: a valid result parses, it permits nothing.
- Orders, deliveries, initial inventory, seed, geometry/navigation and
  execution config stay frozen across candidates; only policy-permitted
  patch fields differ. Caller input objects are cloned and re-parsed, never
  mutated.

## Candidates, ranking, termination

- A no-change baseline is always evaluated exactly once (the first
  empty-patch candidate, or an auto-inserted `baseline` first). Further
  no-change candidates are retained as invalid duplicates.
- Each candidate is isolated: bad patch syntax, policy violations, patched
  scenarios that fail validation/admission, and runtime errors are retained
  in original order as `invalid`/`error` with a reason and null metrics.
  Valid runs that stop early are `valid-incomplete`, explicitly distinct
  from invalid. Invalid/error candidates are never ranked, so they cannot
  outrank the valid baseline. Duplicate IDs and malformed outer envelopes
  reject the request.
- Termination honors the scenario: finite-cohort stops at stage
  complete/blocked, fixed-window at its horizon (`WINDOW_ENDED`), otherwise
  at the explicit validated safety ceiling (default 7,200,000 ms, recorded
  per candidate). Chunk targets always advance, so no run loops advancing
  to the same time at a cap.
- `makespanMs` exists only when the stage completes with every selected
  order shipped. A partial last shipment stays `lastShippedAtMs`. Total
  wait is recomputed from engine wait intervals, open intervals clipped at
  the actual stop clock. Stage, backlog and stage backlog stay visible.
  Metric definition: `totalWaitMs` sums engine wait records only (for
  example NO_IDLE_PICKER, traffic and queue-full holds). A packing station
  job waitMs (enqueue to service start) spans picker travel and unload
  after enqueue, so it is not waiting time and never enters `totalWaitMs`.
- Staffing clones park by offsetting the template slot; on the burst/main
  geometry that admission currently fails (`INITIAL_OVERLAP`). Such
  candidates are honestly retained as invalid. No geometry was redesigned
  and no parking locations were added in this milestone.

## Export and offline verification

- The experiment export (`layoutlab.operations-experiment/2`) embeds the
  full common inputs, the actual policy, the termination policy, versions
  (simulation/schema/engine/evaluator), seed, every candidate (including
  failed ones) with requested patch, status/reason, stop clock/termination,
  and the full per-run operations report (per-order timestamps/state,
  counts, checks, clock, derived metrics), plus ranking and selection.
  The API returns this complete report directly.
- `recomputeOperationsReport` now replays the engine to the report's
  explicit clock and checks ID completeness (both directions), duplicate
  rows, counts, states, order/delivery timestamps, checks, versions, seed,
  scenario identity, clock/termination, `totalWaitMs`, `makespanMs` and
  `lastShippedAtMs`. Historical `/1` reports without the E3 clock/metric
  fields are flagged as not fully verifiable instead of passing silently.
- Offline check, no `MODEL_API_KEY` or network needed:

  ```sh
  npm run build --workspace @layoutlab/simulation
  node scripts/verify-operations-experiment.mjs evidence/sanitized/e3-offline-comparison.json
  ```

  The verifier rebuilds each candidate from common inputs + patch + policy,
  reruns the engine, and compares metrics, reports and ranking; it detects
  tampered common inputs (against embedded per-run scenarios), policy
  violations, missing candidates/orders, timestamps, waits, makespans,
  counts, ranking and version mismatches. It proves saved values follow
  from the embedded inputs only — not who produced the file. Every scenario
  here is synthetic with declared constructed values; see `assumptions` in
  the export.

## Known-answer oracle

The simulation tests assert hand-derived literals on a one-picker corridor
fixture (travel ms equals distance mm at 1000 mm/s; pick 500 ms, unload
400 ms): baseline packing 1000 ms yields `READY_FOR_DISPATCH` at 6100 ms
and 11400 ms; the policy-permitted 2000 ms packing assumption yields
7100 ms and 12400 ms. These numbers are arithmetic from the fixture
geometry, not outputs of the reporting helpers under test. With no dispatch
lane the same runs honestly report `shipped: 0` and `makespanMs: null`.

## Reproduced evidence and limitations

- Sanitized artifact: `evidence/sanitized/e3-offline-comparison.json`
  (burst fixture; baseline + fast/slow dispatch valid-complete, one
  staffing candidate invalid under a dispatch-only policy). It verifies
  with the command above; a copy with `totalWaitMs` zeroed fails with
  `candidate baseline.totalWaitMs: saved 0 != recomputed 614900`.
- Remaining limits: staffing-clone parking is infeasible on current
  geometry (retained invalid, not fixed here); chunk-advanced stop clocks
  land on 60 s boundaries after completion rather than the exact final
  event instant (timestamps inside reports are exact); deleting a whole
  candidate together with its ranking entries is indistinguishable from a
  shorter original comparison — provenance is out of scope by design.
  No traffic/picking policy or assignment-optimization interventions exist.

## Coordinator acceptance (2026-11-04)

Accepted for the bounded E3 experiment/report contract after independent
compiled-engine replay. All five adversarial cases from the two review
rounds now reject; the clean artifact recomputes. The hand oracle matches
READY6100/11400ms and7100/12400ms, with NO_IDLE_PICKER wait0..5100ms,
zero shipped and null makespan. See `evidence/sanitized/e3-independent-review.json`.

Validation evidence: full serial simulation251/251 and API134/134 were
reported by Muse before the final narrow correction; final focused
experiments+M3b41/41 and API operations12/12 passed with simulation/API
typechecks. Coordinator independently reran the five counterexamples,
clean report and arithmetic oracle. The default parallel transport test's
5s timeout remains a documented test-runtime limitation; no geometry check
was weakened. E4, UI integration and AI contribution evaluation remain open.
