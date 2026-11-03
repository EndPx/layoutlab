# Cargo C2 and Operations UI independent review

Verdict: functional cargo/geometry/engine integration accepted. Final
publication follows a bounded route-arrow/render-measurement presentation
patch; the current full model is still local, not deployed.

## Independent engine and geometry evidence

Codex ran a separate step-driven engine review using the actual C2 inputs.
Workload, product definitions, initial stock, storage anchors, fixed racks,
room, obstacles, arrival schedules and service/handling assumptions were
compared against commit5f4cbe9 and preserved. Profile/capacity and the
documented floor-slot recalibration are new-model assumptions, not an
improvement experiment against the historical model.

- Six orders reach READY_FOR_DISPATCH; shipped0, unshipped backlog6,
  picking/packing stage backlog0.
- Exact last READY event:342200ms. A later UI observation344500ms and
  coarse headless observation360000ms are observation clocks, not stage
  completion timestamps.
-32 grants and3860 route segments checked with separate BigInt travel-time
  arithmetic and independent quadratic minimum-separation calculations.
-19445 overlapping interval checks include motion, stationary gaps and
  terminal holds; minimum simultaneous center separation1600mm exceeds
  the1598mm combined envelopes. This is modeled clearance, not physical
  safety certification.
- All44 canonical points navigable. Minimum distance among20 declared
  service/queue/parking positions1615.549442mm. Maximum concurrent movers4.
- Cart and crates remain full size, in a centered680x1220+100 envelope
  (r799), with four configured item/handling units, positive dock separation
  and packet-driven support. C1 independent source hash/triangle/deck checks
  remain applicable to the unchanged GLB bytes.

The independent result is preserved in
`evidence/sanitized/cargo-c2-independent-review.json`. The raw initial failed
profile probes remain private review history; they were not rewritten as
successful runs.

## Browser review

Muse's recovered attempt fixed test-helper module paths and reported actual
Edge results: environment5/5, playback6/6, evidence5/5, planner critical
flows7/7; web unit20/20; simulation237/237, core111/111, API84/84; typecheck
and root build pass. Codex inspected final isometric, loaded-cart close-up
and narrow-layout images. Support, full-size containers, actual carried
quantities, unit activity and bounded timeline are visible.

The earlier bundled-Chromium playback run failed1pass/5fail with severe
software-render timing delays; its report remains archived. It is not
counted as successful hardware or real-device mobile evidence. Fresh Edge
artifacts identify channel, viewport, GPU renderer and exact paused clocks.

## Publication presentation patch

Final screenshots show one arrowhead per100mm grid segment, causing the
overlapping cones to look like a wide belt obscuring cargo. Use sparse
arrowheads placed on the unchanged authorized polyline instead.

The current renderer counter/span starts before playback and includes
initial/static draws;48 renders over7.5s is a renderer-lifetime rate, while
the active playback window is about6.2s. Replace the active-window claim
with explicit before/after counter deltas around playback. Separate rAF,
advances, snapshots, draw calls and render CPU timings. No GPU-time,60fps,
whole-warehouse/mobile-performance or operational savings claim follows.

## Remaining product scope

This accepts only the six-order picking/packing experience. Dispatch/shipped,
receiving/put-away, multi-trip pickup, formal operational report recomputation,
controlled experiments and the Meta Experimenter remain subsequent gates.
Public deployment stays R1 until a reviewed release is installed.
