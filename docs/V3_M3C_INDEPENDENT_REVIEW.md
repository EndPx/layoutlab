# M3c independent UI review

Status: revision required. The Operations UI is connected to the accepted
headless engine; that does not yet close the rendering/interaction gates.
Codex inspected the screenshots and source, ran actual Orca Run/Pause at1x,
and compared the displayed state with a separate headless run at16957ms.
The native existing Edge session also opened a new local Operations tab;
its DOM browser host was unavailable and playback interaction was not
confirmed there. No unrelated user tabs were changed.

## Verified findings

| Finding | Evidence | Required correction |
|---|---|---|
| Handling mislabeled idle | At16957ms PK-1/PK-2 have task picking with idle transport; PK-3/PK-4 are moving. UI reports2/6 active and calls the picking units idle | Derive operational labels/counts from both task and transport; transport idle is not worker idle |
| Resize feedback error | Orca Run/Reset effects record ResizeObserver loop completed with undelivered notifications | Stable guarded/deferred resize updates, no error suppression |
| Carry pose lacks support calibration | Actual cart bounds maxY1.348m becomes the cargo anchor; load starts on top of the whole model, not an identified support surface | Inspect source components/support pose, document the attachment and full loaded profile; do not call bounding-box maxY a cargo platform |
| Missing derived-geometry guards | Independent Vitest probes change a packing queue position or mobile parking point by1000mm and compatibility still passes | Cover all reused resource/queue/parking/profile spatial assumptions, or validate actual bindings for those changes explicitly |
| Floor boundary is triangular | Fourth LineLoop vertex repeats (roomW,roomD), omitting (0,roomD) | Four distinct room corners; no false diagonal boundary through the warehouse |
| Render measurement conflates callbacks with frames | Hardware JSON has594 rAF callbacks/41 snapshots over6.1s, but no actual render count/interval distribution | Separate presentation callbacks, engine advances, snapshots and WebGL renders; measure actual draw activity in an allowed browser |

The separate compatibility probe passes the real fixtures and partial46/8
arithmetic (5 full containers plus one6-item partial), but its two drift
rejection cases fail. Driver: `.coordination/review-m3c-lib.test.ts`.
Runtime observations: `.coordination/m3c-independent-observations-initial.json`.
Those observations are immutable failure evidence, not accepted results.

## Reference and spatial readability

At1440x900 the canvas is only about676x380 CSS pixels. The full page grows
from1529px near17s to4890px at stage completion because the timeline has no
bounded scroll region. The static entity panel consumes a whole left column;
the user Operations reference instead gives the warehouse most of the
workspace beside an inspector. Move compact selection/label controls into
the inspector or viewport toolbar; enlarge the warehouse; bound the timeline
with an accessible scroll owner and readable recent events. Preserve the
working planner and the real state. No seven-page rewrite is required.

All views need to show goods in shelves clearly. The current neutral overview
and distant labels obscure the central operational story. Improve camera,
documented replacement materials and selection readability without substituting
the generated mockup or dropping actual geometry/capacity.

The active/completed route split currently chooses the nearest graph vertex
instead of the exact current point on the authorized timed segment. Keep the
whole authoritative polyline and split its presentation at the actual engine
pose/segment. Numbered stops must distinguish completed picks from future
intent; zero remaining reservation is not an unvisited stop.

## Browser/evidence boundary

The worker's hardware performance artifact is explicitly external Chrome,
not Edge or Orca. Keep that attribution; do not relabel it. Obtain fresh
Edge or Orca evidence for acceptance, as authorized by the user. Bundled
software rendering results are not hardware or real-device mobile proof.
One Orca emulated screenshot showed repeated tiles while DOM bounds remained
normal; this capture artifact is not attributed to the application without
further reproduction. Native Edge displayed the actual single application.

No new source-model appearance, physics support, operational savings,
complete warehouse lifecycle or public deployment is established by M3c.

## Revision status and bounded cargo decision

Muse's revision supplies real Edge156 evidence, a dominant warehouse with
bounded timeline, operational labels and separate render counters. Codex's
independent library probes now pass3/3 (real fixture/partial arithmetic and
resource/parking drift negatives); source diff whitespace check is clean.
The revised screenshots show4/6 busy with picking distinguished from idle,
but the carried container support gate is still explicitly unfulfilled.
No M3c acceptance is claimed.

Measured source handtruck lip356x26mm does not provide the required flat
support for the existing containers; overall model maxY is the handle, not
a load platform. Repositioning full-size boxes onto the lip while leaving
large unsupported overhangs is a diagnostic interim view, not acceptance.

Coordinator authorizes a measured profile correction rather than shrinking
assets to preserve the old600x800 assumption. A separate private headless
feasibility probe, with unchanged shelves/approaches/queues/workload:

- 600x900+100 gives radius641mm; all44 static points remain navigable,
  all20 service/queue/park positions remain mutually clear and the six-order
  burst still reaches READY_FOR_DISPATCH. This proves geometry feasibility
  only, not a selected cart's deck or carrying capacity.
- 700x1300+100 gives radius839mm; DSP-Q2 becomes unnavigable,10 position
  pairs fail clearance and the burst has only4 ready orders at the probe
  horizon. A larger-profile integration therefore requires an explicit new
  geometry/recovery milestone; do not substitute it silently.

Next: inspect the cached original-catalog equipment_utility_cart_e01 source
components/deck first (whole bounds approximately854x412mm), plus a genuine
appropriately sized sourced picking tote if necessary. Prefer a full-size
compatible source asset set within a justified600x900 profile; verify load
support/internal dimensions and the actual constructed burst loads. Record
source pins/dependencies/licenses/conversion, then integrate the reviewed
asset and profile in a bounded follow-up. Do not misdescribe this as a
completed asset integration or a vendor-rated load capacity.
