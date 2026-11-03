# V3 Cargo-C2 Integration Review (Muse build, Codex review pending)

Cargo-C2 integrates the reviewed original SimReady platform cart + W1 crates
as the MAIN warehouse fleet cart with centered 680x1220+100 (r799) profile
and conservative constructed capacity 4, calibrates canonical slots/nav,
and closes M3c with real 6-order/loaded-render proofs.

Ownership: Muse sole coder, Codex reviews, Ponytail browser lane. No paid
calls, no commit/push/deploy in this task. This doc records the integration
for Codex review; it makes no physical-improvement claim from changed
geometry (new revision labeled a different model; historical results
preserved, never rewritten).

## 1. Source (unchanged, re-verified)

- Cart `cart_luggage_platform_a01`, SimReady `nvidia/simready-assets`
  @653d91e1, CC-BY-4.0: 13467192 bytes, sha256
  `8f078d71d7fe1314f8fee4f559ae4046037e29aeec900b8c8078217eaea27595`,
  186990 triangles, 6 meshes, non-indexed soup.
- Crate `crate_blue_a01` (W1-accepted, byte-identical reuse): 4374604
  bytes, sha256
  `dc2a0cc3c6488a45d818b437df879d131ff5ace6211c7325684d8eab21464d60`,
  60744 triangles, 1 mesh.
- Scanned cart bounds (GLB Y-up m): X +-0.3357252181, Y
  0.0000003681..0.9525318146, Z -0.6505696774..+0.5685219169.
- Scanned crate bounds: X +-0.3025666177, Y
  0.0000822076..0.2533016932, Z +-0.2025666386.
- License copy byte-identical to the prior verified source; staged fetch
  closure 6 files / 10517375 bytes unchanged
  (scripts/warehouse-cargo-verify.mjs).

## 2. Centered placement + normalization (one frame, no scale)

- Source centerZ = -41.02388024330139mm; the WHOLE cart+cargo assembly
  carries normalization +41.02388024330139mm in GLB Z (no X/Y shift, no
  scale, no independent cart/cargo shifts). Centered Z half-length
  609.5457971096039mm; centered profile 680x1220+100, r799
  (ceil(hypot(680,1220)/2)+100 = 699+100).
- Floor min Y 0.0000003681m recorded, no Y shift (0.37 micron; a shift
  would be false precision).
- Rendered yaw stays canonical per the holonomic disc assumption.
- Loaded union (normalized cart + 2 docked crates): X -335.7..+335.7
  (4.3mm margin to +-340), Z -609.5..+609.5 (0.5mm margin to +-610).

## 3. Deck witness + docks (positive separation, no waiver)

- 25 vertical rays through ACTUAL cart triangles (5x5 grid, X +-240mm,
  Z -400..+400mm) hit 290.72893..290.72898mm: deckTopYM 0.2907289,
  1-micron proof band (reproduces the independent Codex range exactly).
- Support: 0 cart vertices above deck+1mm and 0 deck-plane edge
  crossings inside either crate XZ rect; 0 cart triangles touch either
  crate volume above the resting contact plane (conservative AABB test).
- Docks (cart frame): (0, 0.29064669243573205, +/-0.2031), yaw 0, where
  crateOriginY = deckTopYM - scanned crateMinY so crate bottoms rest
  EXACTLY on the deck plane. Unit frame: A z +244.1238802433014mm, B z
  -162.0761197566986mm.
- Seam: dock centers 406.2mm apart vs crate depth 405.133277mm =
  +1.0667mm POSITIVE gap (no penetration, no tolerance waiver).
- Measured nearest above-deck structure within |X|<=310: low deck-edge
  rails at +419.53/-476.21mm (the tall end frames stand farther at
  +435.08/-491.95). End clearances: A 13.86mm, B 70.54mm (contact-free,
  exact scanned values, proof-guarded above 5mm).
- Flat deck rect X +-310, cart-Z -565..+505 contains both crate rects
  fully (zero overhang).

## 4. Cells, SKUs, orders, capacity (canonical-driven)

- Carry packet `assets/cargo/carry-luggage-platform-a01.json`
  (layoutlab.cargo-carry/1, model cargo-c2-centered680x1220) is the
  single source of bounds/normalization/docks/cells/yaw/profile/
  capacity, consumed by the fit proof AND the renderer.
- 2 fixed cells per crate, each 220(X)x320(Z)x160(Y) at crate-local
  (-220/-160) and (0/-160); 440x320x160 within the measured interior
  580x380x247 (floor top +6.0, rim 253.3; interior sanity-checked
  against the scanned outer shell 605.1x405.1x253.2).
- Universal cargo yaw90: plan footprint X=itemD, Z=itemW. EVERY
  canonical SKU (dims/costs read from fixtures/operations/
  main-warehouse.json, all cost 1) fits a cell; worst SKU P05
  320x220x160 exact-fits (independently pinned as a literal).
- All 6 burst demands read from fixtures/operations/
  picking-packing-burst.json and exact-match guarded (B-01..B-06 lines
  listed in the proof; any order-line edit fails the proof): 3,4,3,3,3,3
  items, each order allocates into <=4 cells.
- Capacity 4 = 2 crates x 2 cells (one cost-1 unit per cell).
  Conservative constructed capacity; no kg/vendor payload claim. Main-
  schedule orders above 4u need future split-trip work (backlog); their
  lines are unchanged and never executed in-slice.
- Negatives (all must reject): 321-wide oversize, 161 over-height,
  cost-2 unsupported, 8x P05 cell overflow, deck-overhang crate,
  frame-colliding crate. Engine level: 8u order with capacity-4 units
  gets UNSUPPORTED_SINGLE_TRIP_REQUIRED with zero reservation
  (packages/simulation/test/m3b-operations.test.ts).

## 5. Nav consistency root fix (minimal)

- Cause (Codex feasibility): the planner inflated OTHER units'
  physical rects (no margin) by the mover radius, while analytic
  admission compares rA+rB discs. Shortest-path planning hugged stopped
  units inside the admission disc (e.g. 1100 < 1200 at r600), the grant
  waited STOPPED_AGENT_IN_PATH on the same hugging path forever, and no
  detour was ever planned although floor was free.
- Fix (packages/simulation/src/navigation.ts): stationary-other
  occupancy is the declared circumscribed disc (AABB +-rB inflated by
  rA, plus contact-epsilon closure so the inclusive-contact convention
  holds exactly), in buildNav AND both witness helpers
  (occupiersContaining, blockingCandidatesOnCorridor). Corners
  over-approximate the disc diagonally (documented): the planner may
  wait where admission would pass, never the reverse. Reused core A*;
  no MAPF/new framework/algorithm rewrite; analytic continuous
  admission and terminal protection retained.
- Regression tests (packages/simulation/test/m3a-review.test.ts):
  stopped unit yields a granted detour (not a hugging wait), different
  radii (r142 vs r600), fully blocked corridor with honestly unknown
  dual witnesses (no invented blocker), idle parking units (pass around
  grants, occupied goal blamed). Two prior witness tests re-anchored to
  the mandated geometry with intents preserved (ambiguous goal still
  unknown with candidates; actual occupier still blamed over nearest
  center).
- Bounded stuck reporting (operations.ts completionOf): finite-cohort
  completion returns BLOCKED (preserved orders/state + witnessed cause)
  when all arrivals are in and the transport diagnostic confirms a
  deadlock with no scheduled release, instead of IN_PROGRESS forever.
  Never validates a blocked run: only SUPPORTED_STAGE_COMPLETE passes
  gate 6READY. Tested with a putaway parked on the only queue slot
  (STUCK_TRAFFIC, load preserved, verdict stable across advances).

## 6. Canonical slot recalibration (parent AND derived)

- Fixture revisions: parent fixtures/operations/main-warehouse.json
  22374 bytes sha ce33a9c5.. -> 23520 bytes sha
  c6e4f208835e31de2554850fa618953bb6f9a1b03c360b137c784bd5112660cb;
  burst fixtures/operations/picking-packing-burst.json 30705 bytes sha
  70ec57ab.. -> 31113 bytes sha
  9eda552bd8f2da8378c84dccf5440d8264869af3013065ae6e34ecb4529cdbf7.
  Historical pair preserved in git history + oracles, never rewritten.
- Profile/capacity (both fixtures, all 6 units): 600x800+100 cap 96 ->
  680x1220+100 (r799) cap 4. Parking unchanged (6 slots, 3000 pitch).
- Slots before -> after (only these coords move; room/racks/storage
  anchors/stock/products/orders/deliveries/service + handling durations
  unchanged):
  - RCV-S1 (4000,14400) unchanged; RCV-Q1 (2500,14400)->(2300,14400);
    RCV-Q2 (1000,13800)->(900,13200).
  - PACK1-S1 unchanged; PACK1-Q (22500,6900) unchanged,
    (22500,8400)->(22500,8600), (22500,9900)->(22500,10300).
  - PACK2-S1 unchanged; PACK2-Q (22500,11400)->(22500,12000),
    (22500,12900)->(22500,13700), (22500,14400)->(20500,9400).
  - DSP-S1 (20000,14400)->(19900,14400); DSP-Q1 (18500,14400)->
    (18200,14400); DSP-Q2 (17000,13800)->(16400,14000).
- Known-failed prototype, NOT copied: the feasibility PACK2-Q3 at
  (22500,15400) is statically unnavigable at r799 (inside the inflated
  dispatch-stage rect), and no x22500-line z satisfies both the 1598
  pitch and the obstacle bands. PACK2-Q3 sits north of the PACK-2 table
  at (20500,9400): navigable with 191mm static margin, pairwise min
  2154 to the other 19 slots, clearly staged at PACK-2 (same x as
  PACK2-S1). Chosen by whole-room verified search, not blindly.
- Verification on the committed fixtures: all 44 canonical points
  navigable at r799; all 20 service/queue/parking pairwise >1598
  (zero disc conflicts; min 1615.5494421403514 PACK2-S1/DSP-S1);
  228/228 parking->goal routes under the planner occupancy model with
  per-segment analytic disc clearance re-verified
  (scripts/warehouse-environment-nav.mjs, worst detour 2.11x).
- Provenance assumptions extended (M3a lines kept for the guard
  regexes); burst provenance records the new parent SHA/bytes/model.

## 7. Departure/yield: no change required (traced, verified)

- After the consistent planner + valid Q3, the full burst completes 6/6
  with no departure-policy change: the observed 4/6-cycle was the
  hugging-path inconsistency (planner/admission disagreement), not a
  genuine queue-ownership cycle. The vacate hop (service -> logically
  free queue slot -> parking) was traced: vacate targets exclude slots
  held by queued jobs; the feared race (new head vs departing agent)
  resolves by transport serialization with honest OCCUPIED_GOAL waits.
  No new waiting bays, zones, priorities, teleports, or task deletion.

## 8. Bindings + renderer integration

- fixtures/operations/main-warehouse.bindings.json: fleet cart ->
  luggage platform (GLB + manifest + replacement material note), yaw
  convention (canonical yaw, whole-assembly normalization, no
  independent shifts), carryPacket pointer, equipment-crate source +
  role (NOT extra inventory; empty totes are labeled empty equipment),
  hand truck demoted to fallback/diagnostic, exact scene SHA/bytes
  (c6e4f208.., 23520), carryModel, carry note. Closure asserted by
  scripts/warehouse-cargo-verify.mjs (SHA/bytes/pointer/profile/
  capacity, parent AND burst).
- Web loader (apps/web/src/lib/operations.ts): SceneCarry from the
  packet with assertCarryPacketCompatible (pointer/model/profile/
  capacity, fail closed); allocateCarryCells (stable SKU/item-ordinal
  allocation, overflow reported never stacked); carryMarkerPose
  (corner placement, yaw90, fitsCell re-check). The interim toe-lip
  anchor/orientation helpers are removed.
- Renderer (OperationsView): per-unit assembly = sourced cart mesh +
  normalization child offset + 2 sourced equipment crates at unit-frame
  docks (static children, always rendered); carried items = labeled
  wireframe bounds markers (+ faint fill) sized from canonical SKU dims
  at verified cell poses; crate labels for the selection
  ("crate A/B ... / empty equipment"); cart AND crate drift from packet
  bounds (1mm) refuse all carry (fail closed); no solid inventory
  models, no whole storage boxes. Ops carry notes carry the exact
  ledger allocation (e.g. "PK-2: P03#1@A0+P03#2@A1+P09#1@B0+P09#2@B1").
- Diagnostic viewer (experiments/warehouse-cargo-section): fixtures
  updated to C2 docks/cells/deck/profile (B-03 worst-order load at
  verified cell poses, cell wireframes, 290.7289 plane, 680x1220
  outline); cart manifest placement updated to C2 integration.
- DESIGN.md 11.2 carry bullet rewritten (toe-lip LIMIT retired).

## 9. Proofs and gates (commands + results)

Final runs 2026-11-03 (recovery dispatch; harness fixed, Edge-first):

- scripts/warehouse-cargo-fit.mjs: PASS (deck rays + support + docks/
  gap + profile + canonical 12-SKU/6-order/4u + 6 negatives).
- scripts/warehouse-cargo-verify.mjs: PASS (cart + crate reuse + 2
  negatives + closure + fit proof).
- scripts/warehouse-environment-nav.mjs: PASS (228/228, analytic disc
  re-verification).
- npm test @layoutlab/simulation: 237/237 (231 prior + 4 nav + 2 ops).
- npm test @layoutlab/core + @layoutlab/api: 111/111 + 84/84.
- apps/web typecheck: clean. Root build (core+sim+api+web): PASS
  (pre-existing >500kB chunk-size note only).
- Web unit tests (operations.test.ts via sim runner): 20/20.
- E2E (bundled chromium, diagnostic lane): environment 5/5 (2.6m).
  Playback/evidence not re-run on software GL: diagnostic-only per
  task; prior report preserved at
  .coordination/c2-provider-recovery/playwright-report-before-retry.json.
- E2E (real Edge, M3C_CHANNEL=msedge, real GPU): environment 5/5
  (18.7s); playback 6/6 (2.7m, exact signature parity every test,
  completion observed at 344500 = first 16x snapshot after lastREADY
  342200); evidence 5/5 (1.9m; iso/top at 30725, closeup PK-1
  to-queue P01x2+P07 at 30661, recording to STAGE COMPLETE at
  344500); planner m2-flow 7/7 incl. stub/export/replay (28.8s).
- Perf (m3c-final-perf-1440-edge.json, 1x, 1440x900): 6.2s wall,
  603 rAF / 603 advances (avg 0.09ms, max 32.8ms), 41 snapshots,
  48 actual WebGL renders over 7.5s span = 6.4 active renders/s
  (render-on-change + 150ms snapshot policy, not a GPU limit);
  ANGLE AMD Radeon D3D11; 8 GLBs / 69390832 bytes; 0 errors.
- Evidence series: evidence/sanitized/m3c-final-{operations-iso,
  operations-top, carry-closeup, playback-1440, perf-1440,
  operations-1586, operations-768, operations-390}-edge.{png,webm,
  json} (8 files) + cargo-c2-{fit,verify,nav,burst}.json;
  historical v3-m3c-*/cargo-c1-* preserved, never overwritten.

## 10. Deltas reviewers must confirm

- Historical 600-profile burst timings changed in the new model (PK-3
  grant 15400->15600; completion 420000->360000; waits/motion re-
  timed): recorded as new-model observations, never before-after
  improvement claims.
- min slot pair changed 1500 (RCV-Q1/RCV-S1) -> 1615.55
  (PACK2-S1/DSP-S1); r799 disc rule replaces the r600 checks.
- Panel testid ops-play -> ops-run (single outlier; DESIGN 11.1
  "Run/Pause" + button label + playback spec agree on Run).
- E2E windows re-anchored to the wall-paced loop (poll exact clock +
  pause; exact-clock oracle parity; step-based determinism at 80900).
- Recovery-dispatch e2e-harness fixes (specs only, no source change):
  oracle helpers resolved module-relative (the apps/web-relative
  path was MODULE_NOT_FOUND under the Playwright cwd); busy-count
  assertion moved to the real Active-agents metric (ops-m-agents
  shows "N/6"; ops-status never rendered "N/6 agents"); wait-witness
  steps to the first clock STRICTLY inside 52400..80900 (a landing
  exactly on 52400 precedes same-clock wait-open events that
  headless advanceTo already ran); evidence dir is repo-root
  absolute (relative path stranded files under apps/web/evidence);
  recording page closes before the webm copy (finalized + unlocked,
  EBUSY retry kept).
- Completion clocks distinguished: lastREADY 342200 (engine event),
  UI-observed STAGE COMPLETE 344500 (first 16x snapshot after it),
  coarse headless proof clock 360000. No before-after claim.

## 11. What is left

- Codex review of this doc + the diff (required before push/deploy).
- Done this dispatch: Edge playback/evidence/responsive + planner
  flows, m3c-final shots/webm/perf, cargo-c2 JSON records
  (pre-existing, re-verified), C2 corrections appendix (§11 of the
  investigation doc).
