# Warehouse realism requirements — user steering, 2026-11-04

The user's current target is a coherent warehouse operations simulator with
storage planning tied to the same warehouse state. The legacy isolated-rack
planner, six-order sample, static asset page, or a successful AI tool loop
alone does not satisfy this target. Preserve working code and evidence;
continue through bounded implementation gates.

Required outcomes:
- Storage planning and operations share canonical geometry, products,
  locations, assignments and quantity-aware inventory semantics. Reassignment
  consequences must be reflected in picking and handling, not only a camera.
- Human workers visibly walk, turn, stop, pick, carry/push equipment and unload
  according to engine tasks. Carts translating alone are insufficient.
- Actual solid 3D cargo appears inside cart containers and changes on committed
  inventory transfers. Wireframe bounds and labels remain diagnostics only.
- Render quality: inspect and fix washed-out materials, geometry artifacts,
  occlusion, unreadable camera framing and label clutter. Preserve source
  materials/textures where supported; document replacements and conversion
  losses. Source all models from original SimReady discovery as instructed;
  investigate rigged-human availability before claiming integration.
- Physical behavior must account for the full worker+equipment+load envelope,
  collisions and stopping, turning/orientation, acceleration/deceleration,
  usable storage/carry space, resource capacity and handling actions. Separate
  implemented kinematics from unimplemented rigid-body or calibrated physics.
  Do not bolt cosmetic humans onto paths that only admit a smaller cart.
- Show the full supplied shift as well as small diagnostics, including receiving,
  put-away, picking, packing and dispatch. Retain blocked orders and stock
  shortages; do not change data merely to manufacture completion.

Independent probe of main-warehouse-1 over its declared 8-hour horizon, using
existing handling assumptions:28 orders,12 deliveries,11 shipped,17 backlog,
all12 deliveries in RECEIVING; no reported stock/capacity/safety invariant
errors and offline replay matched. This requires diagnosis, not a completed
warehouse claim. Private evidence is .coordination/full-warehouse-shift-*.json.
The six-order default sample contains no inbound deliveries.

No real-warehouse equivalence or operational savings are established without
calibration/validation against appropriate real data. Synthetic assumptions
must stay visible. This limitation does not remove any requested behavior.

Access decision: website/sample/simulation/replay/verification public without
login; only live model routes require judge credentials. Nginx split verified
on2026-11-04, source evidence public-access-split.json. Root opens Operations.
Never put the private password in a publicly visible submission description.
Provide judge-only access notes; recorded runs remain available without it.

Coding continues with one Muse worker and Codex review. Current coding CLI is
muse-wonder-1.0 max. Runtime Meta remains muse-spark-1.3-contributor with the
existing persistent allowance. Do not change models, subscribe, or spend
additional inference funds silently.
