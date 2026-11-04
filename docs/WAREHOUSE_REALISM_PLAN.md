# Warehouse realism plan — diagnostic for the next milestone (read-only)

Status: diagnostic only (E4b follow-up). No renderer, engine, or asset
substitutions were made. Zero paid calls. This does not claim full physics
or a completed warehouse; each gate below ends in measurements, not adjectives.

## 0. What users see today (evidence)

- Entry screenshot (planner on bare URL) — fixed in this follow-up: the bare
  URL now defaults to Operations Simulation; `?mode=planning` keeps the
  planner explicitly (see `docs/EXPERIMENTS_UI_REVIEW.md`).
- Operations screenshot: flat gray-blue warehouse, dense white label chips
  with leader lines occluding racks, carts without people, wireframe cargo
  markers. Causes are itemized in §1 from code and GLB bytes, not taste.

## 1. Render diagnosis (evidence-backed)

Inspected `apps/web/src/components/OperationsView.tsx`, the converted GLBs
under `apps/web/public/assets/`, and `DESIGN.md` §9–§11.

1. **Textureless fallback materials (primary washed-out cause).** Every
   converted GLB carries exactly one material named
   `layoutlab-fallback-*` with a flat `baseColorFactor`, `roughnessFactor
   0.9`, no `baseColorTexture`, and zero images (verified by parsing the GLB
   JSON chunks: crate, cart, rack, floor, box, packing table). Source
   MDL/textures were unsupported and UVs were lost in the merged conversion
   (already documented in DESIGN §9.3). Flat colors + uniform roughness read
   as washed-out regardless of lighting tweaks.
2. **Flat lighting, no shadows, no tone control.** One hemisphere light
   (0.95) + two directional lights (1.15 / 0.35); `shadowMap` is never
   enabled, no `toneMapping`/`outputColorSpace` is set, and annotation
   materials are mostly `MeshBasicMaterial` (unlit). Without contact shadows
   or occlusion, carts and crates float on the floor plane.
3. **Moire / shimmer.** Rack and wall source geometry is dense (wall GLB
   32 MB, cart 13 MB) rendered with `antialias: true` and pixel ratio capped
   at 2, but no texture anisotropy or mip strategy can help textureless
   geometry; thin repeated rack uprights alias at the default overview
   distance (camera 45° FOV at ~(center+12, 11, center+13), far 300).
4. **Duplicate / overlapping surfaces (hypothesis to test in R1, not yet
   demonstrated).** Floor tiles are instanced per tile over the same plane
   the room outline and staging washes draw on, and wall/entrance shells are
   clipped by a single 2.5 m cutaway plane (`localClippingEnabled`,
   per-material `clippingPlanes`). Whether wall bases, floor edges, and
   annotation fills actually z-fight needs geometry/render isolation in R1;
   annotation offsets already exist, so this stays a proposed cause.
5. **Label occlusion.** All 24 slot chips plus order/stop chips render as
   CSS2D labels with SVG leader lines in the "all" layer; the screenshot
   shows chips covering rack fronts. OperationsView already has a
   `decollide()` greedy label packer (around line 700, shared in spirit with
   the planner view), so collision handling exists — visible label density
   at full-chip layers remains the real issue, and density defaults (areas
   first) are the bounded fix.
6. **Cargo reads as diagram, not freight.** Carried items are labeled
   wireframe bounds markers sized from SKU dims (by design in cargo-C2);
   shelf stock uses the same single-color crate instancing. Nothing casts or
   receives shadow, so "solid" geometry still reads flat.

Bounded fixes belong to R1 (§4): they must start from material/texture
recovery or honest replacement materials with measured bounds, shadow/
contact grounding, label density defaults, and duplicate-surface removal —
each verified by screenshot + frame-cost measurement, never by claim.

## 2. Movement and physical-behavior limits (what exists vs missing)

Exists today (engine truth, `packages/simulation/src/`):

- Conservative disc admission: each unit is a disc of radius
  `ceil(hypot(width, length)/2) + margin` (`navigation.ts:105`); the
  680×1220 mm cart footprint yields ~800 mm radius. Whole-transit
  reservation, pairwise disc conflict checks, rack/obstacle inflation, and
  traffic zones (`transport.ts`, `traffic.ts`) — safe but conservative.
- Constant speed: per-segment `travelTimeMs(distance, speedMmPerSecond)`
  (`travel.ts`); no acceleration, deceleration, or turning-rate model.
- Handling durations are declared config (pick/unload per item, resource
  service durations), committed only at handling/service completion events.
- Carried loads are ledger-true allocations into 4 fixed cart cells
  (cargo-C2); rendered as wireframe markers (visual only).

Missing (must be implemented, not implied):

- **Human geometry and rig.** `mobileUnits` are carts. There is no worker
  mesh, skeleton, walk cycle, pick/unload posture, or push-cart coupling.
  Carts translate alone at fixed canonical yaw (`OperationsView` keeps yaw;
  heading never rotates to travel direction).
- **Worker+equipment envelope.** Admission knows the cart disc only. A
  human pushing a cart (longer, articulated envelope), a human walking
  beside racks, and stopping/turning swept volumes are unmodeled; bolting a
  human mesh onto cart paths would understate the true footprint.
- **Kinematics.** No accel/decel, no turn-in-place vs arc distinction, no
  per-agent speed variation, no fatigue/ergonomics (none claimed).
- **Full-shift behavior.** See §3.

## 3. Full-workload gap (honest, not relabeled)

The UI exposes only the 6-order / 0-delivery burst. The coordinator probe
(`.coordination/check-main-shift.mjs`, private) ran the full
`main-warehouse-1` schedule — 28 orders / 12 deliveries over the declared
8-hour fixed window (`horizonMs 28800000`) — with the existing burst
handling durations: `WINDOW_ENDED`, 11 shipped / 17 backlog, all 12
deliveries still `RECEIVING`, zero invariant errors, offline replay matched.
That is a diagnosis target, not completion proof and not a bug verdict.

Recorded wait mix: `NO_IDLE_PICKER` ×13, `TRAFFIC` ×5,
`PUTAWAY_NO_LOCATION` ×2, `RECEIVING_STAGING_FULL` ×1, `AWAITING_HEAD` ×1.
Structural facts: one receiving lane (`RCV-1`, capacity 1, 120 s service,
2 queue slots) feeding 2 putaway units, against 12 deliveries plus 28
orders competing for 4 pickers. Whether the choke is receiving staging
capacity, putaway location selection, picker starvation, or an engine
defect is **undecided**; R3 (§4) profiles per-stage queues and blocked
reasons before any workload or engine change. No data may be altered
merely to turn the shift green, and the old "unsupported inbound" comment
is stale — deliveries do run; they do not finish.

## 4. Bounded next gates

- **R1 — Render & solid cargo.** Recover or honestly replace materials
  (document per-asset source, conversion loss, license); enable grounded
  shadows/contact cues within the measured frame budget; remove duplicate
  floor/wall surfaces; default label density to areas with slots on
  selection; render carried cargo as solid instanced meshes (existing
  converted crate/box solids) allocated by the same ledger cells, wireframes
  demoted to diagnostics. Gate: Edge screenshots at 1586/768/390 + recorded
  frame-cost deltas; no FPS claim without the §11.3 measurement window.
- **R2 — Human + kinematics.** Introduce a rigged worker (source per §5)
  coupled to the cart as one admitted envelope: walk/pick/push/unload poses
  driven by actual engine tasks, heading rotation, accel/decel within
  declared bounds, and swept-volume admission re-verified against racks,
  zones, and other units. Gate: transport/traffic suites extended for the
  combined envelope (no path may admit only the cart disc), playback parity
  signatures, blocked-reason visibility. Rigid-body dynamics and calibrated
  human factors stay explicitly out unless separately scoped.
- **R3 — Shared state & full shift.** One canonical scenario for planner
  and operations (assignments/inventory edits reflect in picking), plus an
  honest full-shift selector (28 orders / 12 deliveries) beside the burst,
  with per-stage blocked inspection (receiving staging, putaway locations,
  picker waits) and replay verification. Gate: shift report with shipped/
  backlog by stage, wait-reason histogram, invariant checks, and offline
  recomputation — `WINDOW_ENDED` with backlog is a passing honest result;
  silently editing workload to force completion is failure.

## 5. Asset discovery (SimReady Central first)

Method: parsed the cached Central index
(`.coordination/catalog-inspection/install_categories.json`, 3769 assets,
generated 2026-11-02, corpus `simready-assets` from `nvidia/simready-assets`)
with `.coordination/realism-catalog-probe.mjs`; name/category searches for
human, worker, character, person, rig, animation, and cargo terms.

- **Human worker: no human found by searched metadata.** `human|person|
  worker|character|mannequin|pedestrian|people` matches only personal-item
  false positives (`accessory_eyeglasses_a01`, `book_open_a01`,
  `misc_eyeGlasses_*`, Residential/Personal Items,
  `nvidia/simready-assets@653d91e18201`). `rig|animat|skinned|skeleton|
  walk|gait` matches only refrigerators, automotive body parts, and rigid
  inspection lights. That is a statement about the searched metadata, not a
  definitive claim that no figure exists in any source. (The coordinator's
  refreshed catalog at 2026-11-04T10:34Z still holds 3769 entries with no
  human matches.) The user has since approved a source exception **only for
  human worker characters**: NVIDIA Isaac Sim or other clearly licensed
  human assets may be searched, with per-asset license (web distribution/
  derivatives), immutable source/revision/files/dependencies, rig/
  animations, dimensions, and conversion support verified before any
  integration. No paid purchase/subscription or unrelated substitution is
  authorized, and the existing unverified Isaac construction-worker lead is
  a lead, not licensed integration proof. Warehouse/racks/carts/containers
  remain SimReady-sourced.
- **Humanoid robots exist but are not humans.** `AGIBOT-Yuanzheng/
  A3_Ultra_usd/raise_a3_ultra_t3d0` (`@d24fd57ec9a9`, OEM/AgiBot, 1 file),
  `agibot-assets/simready-assets/g2_omnipicker` + `g2_swiftpicker`
  (`@b0628c2800bb`), plus Franka/FANUC/Robotiq/Standard Bots manipulator
  packages. The AgiBot/G2 packages are humanoid/mobile-manipulator robots:
  presenting one as a human worker would be false. Both Hugging Face repos
  returned 401 from here, so license, rig, and animation support are
  **unverified** — a coordinator decision (accept OEM robot workers under
  their license/terms, or source humans elsewhere) is required before R2
  picks a figure. No Mixamo/third-party/procedural people were introduced.
- **Solid cargo: abundant and already partly in hand.** 542 box/crate/tote/
  container matches, including `Industrial/Warehouse/Containers`
  (`box_cardboard_*`, `crate_*`, bins; `nvidia/simready-assets@653d91e18201`)
  and OEM totes/pallets (ForgeCAD, ALLSIDES). The converted `crate_blue_a01`
  and `box_cardboard_a01` GLBs already in `apps/web/public/assets/` are
  sufficient for R1 solid cart cargo without new downloads; their texture
  loss (§1.1) is the quality gap, not availability.

Downloads for inspection were authorized; the only network attempt (HF repo
metadata for the two AgiBot repos) was refused 401 and nothing was fetched.
