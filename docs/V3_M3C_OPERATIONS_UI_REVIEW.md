# V3 M3c Operations UI binding — review

M3c binds the accepted M3b engine (`5f4cbe9`; `layoutlab.operations-engine/1`)
to the MAIN Operations Simulation view. Default sample is the SYNTHETIC
`picking-packing-burst` (6 orders, seed `m3b-burst-001`, pick 2s/item, unload
1.5s/item) on geometry proven spatially identical to `main-warehouse-1`.
Reference hierarchy follows UI v3 packet 03 (status/controls/clock, metric
strip, dominant viewport, right inspector, event timeline, queue visibility),
06 (order + stock detail), and 08 (ready/running/paused/blocked/
stage-complete/provider-not-used). No invented animation, routes, or results:
every value, pose, and event is the engine snapshot at the shown clock.

## What changed (ownership)

- `DESIGN.md` — new §11 contract (reference mapping, states, metrics
  definitions, scene-truth rules, perf/responsive contract) before any UI
  edit; no new tokens (existing console palette satisfies the reference
  rhythm; no brand redesign).
- `apps/web/src/lib/operations.ts` — burst loader with explicit
  derived-fixture compatibility check (room/rack/obstacle/location spatial
  ids/dims/anchors compared field by field; throws on drift, never bypasses
  the fixture-id check), `createBurstController` from the frozen fixture +
  validated runconfig, `visualContainersForQty` (full + at most one partial,
  same mesh; never throws/shrinks/rounds on non-multiples),
  `carryYawForContainer` (600x800 fit check), `buildOpsSnapshotSignature`
  (canonical UI↔headless parity string), order selection kind.
- `apps/web/src/App.tsx` — one ops run (scene + controller) owned above the
  mode switch; leaving Operations pauses presentation but never destroys,
  reruns, or resets the run. Reset replaces the controller only, from the
  same frozen inputs.
- `apps/web/src/components/OperationsPanel.tsx` — rAF playback driving the
  REAL engine (monotonic integer-ms targets, all events processed, no drops
  after jank), Run/Pause/Reset/Step-event/1x/4x/16x, sim clock, engine-backed
  metrics with defined captions, queues, committed-event timeline, and
  unit/order/location/resource inspectors. Default paused (no autoplay,
  reduced-motion safe). Pause freezes the logical clock; speed changes reset
  the wall origin without touching configured durations.
- `apps/web/src/components/OperationsView.tsx` — persistent static setup
  (one renderer/scene/camera/asset load per mount; module GLB cache never
  invalidated) with dynamic-only updates: snapshot cart poses (canonical yaw
  kept), live shelf-stock visibility, carried loads at the measured cart-top
  anchor rotated to fit the 600x800 profile (verdict recorded, blocker
  reported instead of faked), selected unit's CURRENT authorized plan as the
  only route (completed vs active leg split at the pose; future stops are
  numbered markers with no connecting lines; no plan means no path),
  selection approach markers, live labels. Overview camera lowered to ~40deg
  so shelf goods read on rack fronts. `data-render-ms` instruments frame cost.
- `apps/web/src/styles.css` — playback controls/clock/metrics/timeline
  styles + 1023/640 responsive stacking (no page overflow; ≥44px primary
  controls on narrow).
- `apps/web/e2e/` — `operations-environment.spec.ts` updated to the truthful
  burst sample; new `m3c-operations-playback.spec.ts` (controls, live clock
  window, mode preservation, UI↔headless parity) and
  `m3c-operations-evidence.spec.ts` (recording, iso/top/partial/complete
  shots, final parity, perf); independent oracle twin
  `helpers/ops-signature.mjs`.
- `apps/web/playwright.config.ts` — env-gated `M3C_CHANNEL=chrome` lane for
  honest hardware-vs-software measurement; default runs unchanged.
- Allowed hygiene only: trailing blank EOF lines trimmed in
  `packages/simulation/src/operations.ts` (3) and
  `packages/simulation/test/m3b-operations.test.ts` (2); whitespace-only,
  engine untouched (231/231 green).

## Verification (all observed, nothing claimed)

- UI↔headless parity: browser signature EXACTLY equals the independent node
  oracle at a mid-run paused clock AND at stage completion
  (SUPPORTED_STAGE_COMPLETE, 6 ready / 0 shipped / backlog 6 / stage 0).
  Reset + 6 steps reproduces the identical signature twice (no duplicates).
- Playback suite: 4/4 pass on desktop 1440 AND mobile 390 (SwiftShader);
  environment regressions 5/5; sim 231/231; web typecheck + build green.
- Evidence: `evidence/sanitized/v3-m3c-operations-{iso,top,partial,
  complete}.png` (same run, paused 00:28.5; PK-1 waiting + L01 partial ×6),
  `v3-m3c-playback-1440.webm` (real 60s+ capture: 1x bursts to 28s, 16x run
  to completion; frames verified at 5s and 55s), perf JSONs below.
- Perf (real 1x playback, load time excluded): Chrome/AMD D3D11 — 6.1s wall,
  590 frames, 590 advances, avg advance 0.1ms, max 32.6ms, 41 snapshots,
  8 GLBs / 63.8MB, 0 errors. SwiftShader — 53.9s wall, 19 frames, avg
  advance 19.6ms (larger per-frame event chunks), max 129ms, 0 errors; the
  engine still tracks wall time exactly (simClock 53899). No fps claim is
  derived from load timing; no 60fps/mobile claim is made.
- Responsive: 1440 three-column, 768 stacked (temp probe: 0px overflow,
  playback works), 390 single-column (full suite green).

## Findings for Codex review

1. Partial-stock semantics: burst picks ≤2 items/slot, so no full container
   ever hides mid-run (visible stays 336); partials keep the full-size mesh
   with labeled remainders (L01 P01×46 = 5 full + 1 partial ×6, asserted).
   Dynamic full depletion is implemented but not exercised by this fixture;
   L24 (zero from the start) proves zero→no-visual.
2. `visualContainersForQty` deliberately does NOT reuse the simulation
   `containersForStock` (which throws on non-multiples) — web-side partial
   support is the documented reason.
3. Software-GL note: bundled-Chromium CDP round trips run ~7s/action during
   playback (compositor/ReadPixels stalls; app work itself is ~100ms), so the
   suite uses adaptive dispatched bursts with reads only while paused. This
   is environmental, not an app defect (Chrome: 3–14ms).
4. Non-finding (checked, not a bug): early screenshots looked darker after
   playback; ROI luminance across six captures (159–176, ±10 ROI noise)
   shows no brightness change from playback or selection — a simultaneous-
   contrast illusion from the tall white timeline.
5. The 28-order + 12-delivery main schedule is never executed here
   (unsupported inbound); burst-only, stated in UI and diagnostics.

## Revision R1 — independent-review response (fresh Edge evidence)

All six verified findings plus the reference/spatial readability gates are
addressed in this bounded UI-only revision. No simulation semantic,
fixture, API, core, benchmark, env, agent, dependency, or service change;
no commit/push/deploy. Codex's initial observations
(`.coordination/m3c-independent-observations-initial.json`) and private
countertests are preserved unchanged; the original Chrome/externally-run
proof below stays attributed as historical and is not relabeled.

### What changed

- `apps/web/src/lib/operations.ts` — `isUnitOperationallyBusy` /
  `unitOperationalLabel` (busy = task held OR wheels engaged; handling
  with idle transport is never idle); `assertDerivedFixtureCompatible`
  now also covers resource ids/kinds/capacities/service+queue coords and
  unit ids/roles/footprints/parks (changed workload/provenance —
  orders, deliveries, stock, seed, policies — still passes);
  `splitRouteAtPose` (whole polyline kept, exact engine pose inserted as
  the split vertex, never snapped to a grid vertex);
  `pickStopStates` (zero-remaining locations are completed, never future
  stops); `CART_CARRY_SUPPORT_Y_M` / `CART_MEASURED_BOUNDS_M` /
  `CART_LOAD_LIP_MM` / `carrySupportFit` (documented support anchor +
  honest overhang verdicts, never a physics/packing cert).
- `apps/web/src/components/OperationsPanel.tsx` — Active-agents metric,
  dropdown options, and inspector unit line use operational truth;
  sample caption counts (orders, picker/putaway roles, packing lanes)
  derive from the loaded scene; entity select + label-layer moved into
  the inspector top (same testids, no left column); timeline renders
  full history in a bounded (~220px) keyboard-scrollable body with
  sticky headers and auto-scroll to the most recent events; diagnostics
  separate rAF callbacks / engine advances / snapshots / WebGL renders.
- `apps/web/src/components/OperationsView.tsx` — floor outline is the
  true four corners; route split uses `splitRouteAtPose` (dataset
  `routeSplit`); stop chips/labels show done vs remaining intent
  (dataset `routeStops` carries `:done`/`:todo`); carried loads sit at
  the measured 0.021m lip top, full-size, in-envelope, stacked, with
  cart-bounds drift refusing the anchor; ResizeObserver is guarded
  (unchanged sizes skipped) and deferred to rAF with no error
  suppression; every real render is counted with CPU cost and span
  (dataset `renders`, stats `renders/renderMsTotal/renderMsMax/
  renderSpanMs`); overview camera lowered to ~32deg; canvas clamp 520px.
- `apps/web/src/styles.css` — ops workspace is (dominant viewport |
  380px inspector); bounded timeline scroll; planner styles untouched.
- `apps/web/src/lib/operations.test.ts` (new, 16 tests) — operational
  truth, guard positive + queue/service/parking/footprint/role
  negatives + workload tolerance, exact split (mid-segment 7443,
  on-vertex, start, end, degenerate), stop states, carry envelope +
  lip overhangs, zero/exact/partial stock counts.
- `apps/web/e2e/` — playback asserts 4/6 busy + busy inspector text,
  routeSplit equals the live unit pose, B-01 done-only / B-05 todo-only
  stops, canvas ≥950x500, bounded auto-scrolled timeline, page <2500px,
  and a console-clean viewport resize round-trip; evidence writes
  `-edge` artifacts (iso/top/partial/complete/carry-closeup/768/390/
  1586/video/perf with separated render stats and channel truth).
- `apps/web/playwright.config.ts` — `M3C_CHANNEL=msedge` lane on both
  projects (temporary Playwright profile; real Edge 156 + AMD D3D11);
  `chrome` keeps the historical lane; defaults unchanged.
- `DESIGN.md` §11 — contract updated for all of the above before code.

### Cargo support: genuine blocker with interim calibrated pose

Measured from the actual GLB POSITION buffers (Y-up): whole cart X
±0.2505, Y 0..1.3481, Z -0.1269..0.3537; handle mesh Y 0.354..1.348
(the 1.348m maxY is handle top, never cargo); body toe lip X ±0.178, Z
0.328..0.354, top Y 0.021m — a 356x26mm lip vs sourced box 699x521 and
crate 606x406 (bindings unitDimsMm). Exact failed support step: the
smallest container (406mm deep) cannot rest axis-aligned on a 26mm lip,
and any forward-resting pose with the load back at the frame face
(Z≈0.16m) exits the 800mm envelope; the centered low pose (bottom at
0.021m, full-size, envelope yaw, stacked) is the unique full-size
in-envelope axis-aligned pose, with documented overhangs (box
+166x+674mm, crate +50x+580mm beyond lip support). Seven original
SimReady catalog candidates were staged to TEMP and bounds-measured
with `scripts/m4-usd-inspect.py` (usd-core 26.11, rev 653d91e8, nothing
integrated): cart_luggage_platform_a01 671x1219, rolling_dolly_a01
1159x610, utility_cart_e01 854x412 (54mm over), cart_mobile_a01 940x671,
mechanic_tool_cart_g01 371x903, medical_utility_a01 753x906,
trolley_catering_a01 1058x483 — none fits 600x800 in any yaw, so no
verified fitting proposal exists yet. Interim UI pose + closeup evidence
(`v3-m3c-carry-closeup-edge.png`, PK-1 mixed P01+P07 load) are honest
about the overhang; a flat-deck cart with deck ≥406x606 inside 600x800
remains a bounded follow-up (user-authorized download + conversion +
fit-proof). This revision does NOT claim M3c complete on cargo.

### Verification (all observed on real Edge 156, temp profile)

- UI↔headless parity: exact signature match mid-run AND final (6 READY
  / 0 shipped / backlog 6 / stage 0); reset + steps reproduce; pause
  freezes; mode switch preserves; speed/Step/Reset outcomes identical.
- Handling truth: 4/6 busy at the 26s+ window (PK-1 busy/waiting,
  PK-3 picking/idle-wheels in labels); putaways alone idle.
- Guard: review probes 3/3 pass (was 1/3); new suite 16/16.
- Route: split equals the live unit pose incl. mid-segment (dataset);
  whole polyline preserved; stops done/todo correct in ISO and Top.
- Layout: canvas ≥950x500 at 1440 (e2e-asserted); timeline bounded
  with recent events visible and full 156-event history reachable;
  completed page small (was 4890px); 1586/1440/768/390 Edge shots + a
  real Edge recording (1x bursts with concurrent tasks + TRAFFIC waits,
  16x run to READY_FOR_DISPATCH) with zero console/page errors.
- Perf (real 1x Edge playback, load excluded): 615 rAF callbacks, 614
  engine advances (avg 0.11ms, max 41.2ms), 41 snapshots, **48 actual
  WebGL renders** over a 7.4s span (avg render CPU 7.68ms, max
  137.6ms) = 6.49 active renders/s by render-on-change design; ANGLE
  AMD D3D11; 8 GLBs / 63.8MB; 0 errors. No 60fps/mobile/GPU-time claim.
- Gates: web typecheck ✓, root build ✓ (pre-existing chunk-size note
  only), Edge desktop playback 4/4 ✓, mobile 4/4 ✓, evidence 3/3 ✓,
  environment 10/10 ✓, planner critical manual/stub/export ✓.
  Backend 231 tests not rerun (zero backend change this session).
- Fresh artifacts: `evidence/sanitized/v3-m3c-operations-{iso,top,
  partial,complete,carry-closeup,768,390,1586}-edge.png`,
  `v3-m3c-playback-1440-edge.webm`, `v3-m3c-perf-1440-edge.json`.
  Untagged M3c-initial files and `v3-m3c-perf-1440-chrome-gpu.json`
  remain as historical proof, attribution unchanged.

### Remaining / next gate

Flat-deck cargo follow-up as above (Codex decides M3c acceptance).
Unchanged from before: dispatch/inbound/putaway/split-trip/report
recompute/Experimenter stay explicit later milestones; no whole-MVP,
full-warehouse, live-Meta, or deployment claim.

## Publication presentation patch (sparse arrows + true active-window deltas)

Bounded UI-presentation-only patch on the accepted C2 integration. No
simulation, fixture, asset, packet, nav, API, core, benchmark, env,
dependency, or service change; no commit/push/deploy. All prior
`m3c-final-*` / `v3-m3c-*` artifacts stay as historical proof.

### What changed

- `DESIGN.md` §11 — arrow/cadence tokens first: sparse cones (0.25m
  head, 0.10m radius) at 1.75m arc intervals on the unchanged active
  polyline; 40ms (~25Hz) presentation snapshot cadence; active-window
  delta measurement contract (baseline after settle, end pre-Pause,
  deltas with shipped start/end, no subtracted maxima).
- `apps/web/src/lib/operations.ts` — `SPARSE_ARROW_SPACING_MM` (1750)
  + pure `sparseRouteArrowheads` (targets at spacing multiples along
  actual arc length, exact on-segment positions, segment tangent
  directions, no corner shortcuts; short legs below one spacing show
  none). Pose-split LINE untouched.
- `apps/web/src/components/OperationsView.tsx` — route overlay uses
  the sparse helper with one shared cone geometry/material per batch
  (was: 0.6m cone per 100mm segment, ~311 overlapping into a belt);
  new `data-route-arrows` count and full-precision
  `data-render-cpu-total` datasets for delta measurement.
- `apps/web/src/components/OperationsPanel.tsx` — snapshot cadence
  150ms → 40ms (engine still advances every rAF with all events and
  unchanged durations; parity/pause/reset/speed semantics unchanged);
  new `data-perf-frames/advances/advance-total/snapshots` datasets.
- `apps/web/src/lib/operations.test.ts` — 2 focused tests (22/22):
  100mm-grid straight → 5 arrows at known 1750-step positions; corner
  path → arrows on segments [0,0,1,1,1] with true (1,0)/(0,1) dirs.
- `apps/web/e2e/m3c-operations-evidence.spec.ts` — perf test samples
  baseline counters + `performance.now` after settle just before Run
  and end counters + time after ≥6s active playback BEFORE Pause, in
  one synchronous in-page read per sample (advances ≤ rAF invariant
  asserted); JSON ships window/start/end/delta plus a labeled
  lifetime reference (maxima labeled lifetime, never subtracted).

### Verification (real Edge 156, msedge channel, temp profile)

- Web unit 22/22; web typecheck ✓; root build ✓ (pre-existing
  chunk-size note only). Simulation 237 not rerun (zero backend
  change).
- Edge desktop playback 6/6 (2.7m): READY/Reset, mid-run truth,
  TRAFFIC-wait witness, order/stock truth, Step determinism (4 steps
  → 5000 twice), 4x/16x to STAGE COMPLETE — exact UI↔headless
  signature parity every test; cart loads (P01×2+P07×1, 3/4 cap),
  crate labels, 6 READY / 0 shipped / backlog 6 / stage 0 unchanged.
- Edge desktop evidence 5/5 (2.0m) with `M3C_EVIDENCE_PREFIX=
  m3c-publish`: iso/top at 30777ms, closeup (PK-1 to-queue, P01×2+
  P07) at 30976ms, 16x recording to STAGE COMPLETE at 345383ms, perf
  deltas, 1586/768/390 responsive — zero console/page errors.
- Route: Edge iso + loaded closeup show a thin teal line with small
  spaced heads (same canonical plan v3, 311 points), cargo fully
  visible — belt gone.
- Perf (`m3c-publish-perf-1440-edge.json`, 1x, 1440×900, ANGLE AMD
  D3D11, 8 GLBs / 69390832 bytes): 6.975s ACTIVE window, 147 delta
  renders = 21.08 active renders/s, avg render CPU 4.27ms
  (628.10/147), 516 rAF / 515 advances (avg 0.13ms) / 148 snapshots
  same-window; load/static draws excluded (6 baseline renders at
  ~65ms avg incl. a 295.1ms lifetime-max load spike, labeled
  lifetime only). Arithmetic verified exactly offline from shipped
  start/end counters and times. No 60fps/mobile/GPU-time claim.

### Limitations

- ~21 renders/s is the render-on-change rate at 40ms snapshot
  cadence on this hardware, not a vsync/GPU ceiling claim.
- Window maxima are intentionally not reported (lifetime maxima
  labeled separately); per-frame cost distribution beyond avg is not
  characterized.
- Sample datasets reflect the last committed snapshot (≤40ms lag);
  the ≥6s window makes the lag negligible, and start/end use one
  atomic in-page read each.
