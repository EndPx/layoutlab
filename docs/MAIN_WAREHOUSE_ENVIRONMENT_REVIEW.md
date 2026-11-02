# Main warehouse environment — delivery review (static scene part)

Static-environment part of the v3 operations simulator, integrated into the
real LayoutLab interface. This delivers ONLY the coherent warehouse scene in
the main app with configured/initial values and a labeled not-running state.
It is NOT the full milestone: engine-owned motion, inventory transfers,
queues, and the operations recording arrive in the next dispatched slice.
No claim is made that warehouse operations are complete.

## 1. What was built

- Storage Planning / Operations Simulation mode switch in the main app
  shell (`?mode=operations` selects the environment on load). Planner state
  lives in `App`, so a scenario/model run survives a view switch and back.
- Canonical fixture `fixtures/operations/main-warehouse.json`
  (`layoutlab.operations/1`, 21,856 bytes, sha256
  `31e8b3429183abf8636b47c5b00f2c0b81dd0d8a4e0fac42c3faf9e303320b4e`):
  24×18 m room, 6 racks (4000×2000×3010), 24 modeled shelf slots on decks
  0/1 (top deck bare, explicitly not counted), 12 products (10 ambient +
  2 cold), 23 stock entries (L24 configured empty), 6 mobile units (4 picker
  + 2 putaway), 4 resources (receiving + 2 packing + dispatch, 10 waiting
  bays as queue slots), 28 orders + 12 deliveries, 12 obstacles.
- Visual bindings `fixtures/operations/main-warehouse.bindings.json`
  (9,586 bytes, sha256
  `a44288c5fe307ca2bfd526ffbfd0a3086ae6d169af1458fdc46277e7583f1ef`):
  ID-keyed asset bindings + measured source bounds/scaling + explicit
  per-product `unitsPerVisual` (no one-box-one-item accident). Positions
  come only from the fixture.
- Shared geometry helpers in `@layoutlab/simulation` (`environment.ts`:
  rack scaling, deck heights, deck resolution, exact stock→container
  counts, centered container grids), used by BOTH the renderer and the
  proof scripts. No schema change was needed: waiting bays are resource
  queue slots, staging zones and entrance parts are obstacle rects, the
  accepted kernel/clock semantics are untouched.
- Two new sourced assets (same pin `653d91e…` as W1, CC-BY-4.0, manifests +
  byte-identical license copies): heavy-duty packing table (5.5 MB closure,
  7.1 MB GLB, 98,594 tris) and wall entrance (29.3 MB closure, 32.5 MB GLB,
  451,752 tris, 14 meshes). BOM/closure inspected before download; full
  packages (89 MB / 2.21 GB) never fetched. Stainless table inspected as
  standby (floating origin, generic); deluxe/c02 not fetched after c01
  verified. W1 bytes and behavior unchanged.
- Main-app operations viewport: instanced floor tiles (12), racks (6),
  336 shelf containers (72 boxes + 264 crates in two layers), 6 parked
  carts, 2 packing stations, 7 wall pieces + 2 entrances (2.5 m display
  cutaway, wall bodies outside the boundary), staging outlines, waiting
  discs, service markers, selected-approach marker, de-collided labels
  (Areas/Slots/All + inspect focus), Overview/Top/Inspect/Reset presets,
  orbit/zoom/pan, on-demand renders, no motion. Load failures render
  nothing with a truthful status line (never silent proxy cubes).
- Status band `ENVIRONMENT READY · OPERATIONS CONNECTION PENDING` with
  fixture counts; operational inspector; engineering data only in the
  collapsed developer diagnostics.

## 2. Verification and evidence

- `scripts/warehouse-environment-verify.mjs`: 2 GLBs vs manifests
  (bytes/sha/tris/meshes, container integrity, TRIANGLES + POSITION/NORMAL
  parity, authored-vs-scanned bounds within 1 µm) + corruption and
  tampered-length negatives — PASS.
- `scripts/warehouse-environment-fit.mjs`: schema parse + exact counts;
  binding closure; container dims == ceil(measured GLB) per axis; 336
  container AABBs inside slot volumes on all axes at true scale; deck
  clearance; no interpenetration beyond 0.5 mm face contact; maxQuantity ==
  full-grid capacity × unitsPerVisual; anchors on decks 0/1 inside rack
  envelopes; station/entrance mesh AABBs agree with obstacle rects (1 mm
  float32 tolerance); 7 walls + 2 wall bodies outside the room touching
  the boundary; 18 rects pairwise disjoint; 44 points in-room and globally
  distinct; 4 negatives (oversize, ghost stock, off-deck, shifted station)
  — PASS. Record: `.coordination/warehouse-environment/fit-proof.json`.
- `scripts/warehouse-environment-nav.mjs`: probe-only adapter over
  unmodified core (radius 600 mm from the declared 600×800+100 profile):
  all 44 points navigable (own-cart excluded at starts); 228 swept paths
  (6 starts × 38 goals), 41,750 segments avoid all inflated rects
  (6 racks + 12 obstacles + 5 parked per start), 41,978 centerline points
  avoid all actual rects; 3 negatives (shifted/oversize/ghost) — PASS.
  Static reachability only, not multi-agent safety. Record:
  `.coordination/warehouse-environment/nav-proof.json`.
- Unit: simulation 120/120 (11 new environment tests), core 111/111.
  API suite green on rerun (one timing flake under parallel e2e load, see
  §4). Root `build` + `typecheck` clean.
- Browser: new `operations-environment` spec (mode preservation, sourced
  load with zero console errors, presets/selection/labels/diagnostics) 6/6
  on desktop + mobile; full planner regression suite green (108 tests
  total across runs, desktop + mobile).
- Evidence (external Edge headless 156.0.4314.58, method recorded in
  metrics JSON): `evidence/sanitized/environment-main-*.png` (11 shots:
  1440 iso/top/inspect-slot/inspect-station/inspect-agent, 768
  iso/top/inspect-station, 390 iso/top/inspect-slot) +
  `environment-main-metrics.json`. Label overlap 0 nearly everywhere
  (residual 1 in two 1440 inspect views, 2 in 390-top: instrumented, not
  hidden); zero page overflow and zero off-viewport chips at all widths.
  390 preset row moved below the canvas (ops-scoped CSS, planner untouched).
- Payload (this machine, loopback): 63,776,668 bytes over 8 GLB requests
  (network-observed sizes match manifests exactly; the 32.5 MB entrance
  exceeds the DevTools body buffer, so its bytes are taken from the
  verified content-length). Full scene ≈19.0M tris / ≈140 draws (instanced;
  frustum-culled in close views). Load ≈1.8–2.4 s to all-loaded. No
  smoothness/FPS claim is made (on-demand static rendering).

## 3. Implemented vs unfinished

Implemented: main-mode environment integration; canonical fixture +
bindings; shared geometry helpers; two new assets with provenance;
fit/nav/verify proofs; operations viewport with presets, selection,
labels, inspector, diagnostics; e2e + evidence at 1440/768/390.
Headless-tested: schema/geometry/nav proofs, sim + core units.
Visually tested: Edge + Chromium, desktop + mobile.
Not implemented (next slice, Codex dispatches): atomic inventory/
resources, engine-owned movement with ≥2 agents, shared-aisle admission,
packing queues with real waits, order progression, the operations
recording, Meta, receiving/put-away/dispatch behaviors. Live-Meta: none.
Deployed: main public deploy unchanged (R1); no deploy/commit/push here.

## 4. Findings, limits, blockers

- No blockers. No paid calls, no `.env` changes, no commits/pushes.
- API suite: `m5.test.ts › offline mode reports baseline+heuristic` failed
  once while the e2e suite ran concurrently (87 s file duration, loaded
  machine) and passed on isolated rerun. `apps/api` is untouched by this
  task; recorded as a load flake, not a regression.
- Materials: documented per-asset replacement colors baked into the GLBs;
  source MDL/textures unsupported and UVs lost (merged conversion) — the
  UI and manifests never claim the original appearance. Rack frame and
  decks share one replacement material (recorded limit).
- Entrance `carpet_floor_01` (flat floor finish, 100 mm profile) is a
  documented non-obstructing visual; service/queue points on it are valid
  floor. Door side bodies, barriers, tables, and staging zones are
  registered obstacles; wall bodies are outside the boundary.
- 19M-triangle scene is heavy for software rendering (SwiftShader frames
  take seconds; e2e uses a 180 s budget). No GPU frame or performance
  measurement was taken, so no claim is made about how real GPUs render
  the static instanced scene; loopback load timing (about 1.8-2.4 s to
  all-loaded) measures asset delivery, not rendering performance. No
  quality reduction was applied to chase a software-render budget.
- Incidental one-line fix: empty `data:,` favicon in `apps/web/index.html`
  stops Edge's favicon 404 console noise on every page load.

## 5. Review revision: mode-separated header (bounded fix)

Independent review found the planner header leaking into operations mode:
MANUAL/STUB/REPLAY/LIVE, validity/live-used/fixture badges, the planner
Scenario menu, and Export stayed rendered while Operations Simulation was
selected, so Export could download unrelated planner state; the scenario
id was hardcoded and the synthetic scene had no visible sample label.

Fix (`apps/web/src/App.tsx` only; no fixture/asset/package changes): the
operations header now reads the actual scenario id from the shared cached
`loadOperationsScene()` metadata and shows an explicit
`SYNTHETIC SAMPLE · CONFIGURED` badge (or `CONFIGURED SCENE` when
loaded provenance is not synthetic). All planner badges, the Scenario menu, and Export render only
in planning mode; planner state lives in `App`, so a switch away and back
restores every planner control and value unchanged. If the operations
fixture fails to load, the header shows `operations unavailable` +
 `LOAD FAILED` with no fake id or ready claim. The status band keeps
`ENVIRONMENT READY · OPERATIONS CONNECTION PENDING` on successful load
only, and no operations runs are claimed.

Tests: `operations-environment` spec gains `header is mode-separated`
(sample init, operations header assertions, planner-control absence
including LIVE-USED, overflow check, switch-back restoration) and
`operations URL loads with a truthful header` (?mode=operations). Full
spec green on desktop + mobile; web `typecheck` clean.
Evidence: `evidence/sanitized/environment-main-header-operations-1440.png`
and `environment-main-header-operations-390.png` show the fixed header
(loaded id + synthetic/configured badge, no planner controls) with the
status band beneath.

## 6. Coordinator acceptance

Codex independently scanned actual GLB float-position buffers and matched
hashes/lengths for all 8 sourced files, checked 336 container placements
without importing the simulation geometry helpers, and checked item volume
against the declared aggregation counts. The main header source and corrected
1440px evidence were reviewed after revision. Full root production build
passed after the last source change; Vite reports a 1.16 MB main JavaScript
chunk (312.85 kB gzip), with the separate 63.8 MB GLB payload. The build warning
and approximately 19M scene triangles remain performance debt.

The static main environment is accepted. This does not close the requested
concurrent-operations milestone, prove GPU frame performance or imply a new
public deployment. Inventory/resources are next, followed by admitted motion
and the connected scenario. See EXPERIMENTER_DELIVERY_PLAN.md and the new
user-supplied visual handoff UI_REFERENCE_V3.md. All main-warehouse slots as
authored are product-dedicated; later assignment experiments must explicitly
declare a different eligible set rather than silently relax this fixture.
