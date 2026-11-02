# V3-M3a transport review: canonical navigation + traffic-admitted transport (headless)

Muse implemented through Orca; Codex plans/coordinates/reviews. Bounded slice
only: safe transport substrate for the next connected-operations task. No UI
redesign, no whole-brief implementation. Ponytail. No paid calls, commit, push,
or deploy.

Base: main `b4ca5a8` (M2b atomic inventory/finite resources, 148 sim tests) on
the static canonical main environment `253503f` (24x18m, 6 racks, 24 slots,
12 SKU, 6 units, 28 orders + 12 deliveries). Public website still R1. No other
coding worker active.

## Files

New in `packages/simulation/src` (sole owned source plus fixture/scripts):

- `navigation.ts` — `createTransportNav`, `footprintRadiusMm`,
  `footprintRect`. Probe adapter over UNMODIFIED core helpers
  (`shortestPathPointsMm`, `pointNavigable`, `inflateRect`,
  `segmentBlocked`, 100mm grid). Per-unit disc
  `ceil(hypot(width,length)/2)+margin`; static set is room + racks + ALL 12
  canonical obstacles (staging, tables, barriers, door bodies); zones never
  inflated. Route queries exclude only their own footprint. Distances are
  per-segment `ceil(hypot)` (grid 100, connectors ceiled).
- `traffic.ts` — `TRAFFIC_CONTACT_EPS_MM=1e-6`, `discsConflict`,
  `minSeparationMovingMoving`, `minSeparationMovingStationary(InWindow)`,
  `trajectoriesConflict`, `trajectoryVsStationary(InWindow)Conflict`,
  `zoneHoldsOverlap`, `pathRequiresZone`, `poseOnSegment`. Analytic minimum
  relative separation over overlapping intervals (linear relative motion,
  projection clamped). Inclusive touching conflicts (conservative).
- `transport.ts` — `createTransportController` (kernel-owned). Atomic
  whole-transit grants (path + zones + destination), FIFO waits with blocker
  unit/zone and original age, plan-version stale protection, unsafe-midroute
  cancel rejection, bounded stuck diagnostic, read-only snapshots. Never
  imports inventory/resources.
- `index.ts` — new exports only (nav/traffic/transport + `MAX_TRAFFIC_ZONES`
  + `OperationsTrafficZone`).
- `schema.ts` — additive optional `geometry.trafficZones` (narrow-aisle /
  intersection rects, strict bounds, unique ids, room consistency). Versions
  unchanged (`layoutlab.operations/1`, `layoutlab.operations-engine/1`,
  `0.1.0`); old fixtures parse unchanged.
- `package.json` — adds `@layoutlab/core@0.1.0` + `prebuild`/`pretest` core
  build order. Root `package-lock.json` +1 line (generated).
- `test/transport-fixtures.ts` — micro scenario builder (synthetic).
- `test/traffic-zones.test.ts` (6), `test/navigation.test.ts` (7),
  `test/traffic.test.ts` (8), `test/transport-a.test.ts` (2),
  `test/transport-b.test.ts` (6), `test/transport-c.test.ts` (2),
  `test/transport-e.test.ts` (6), `test/transport-d.test.ts` (5) — 42 new.
- `proof-m3a.mjs` — built-export headless proof (no test framework).
- `fixtures/operations/oracles/m3a/transport-proof.json` — sanitized proof.

Edited:

- `fixtures/operations/main-warehouse.json` — PACK-1/PACK-2 `serviceCapacity`
  2→1; PACK queues to the x22500 east line (see Geometry); +2 provenance
  assumptions declaring the fix and the historical hash. No racks, tables,
  entrances, obstacles, stock, schedules, or bindings changes.
- `scripts/warehouse-environment-fit.mjs`, `scripts/warehouse-environment-nav.mjs`
  — record `fixtureSha256`/`fixtureBytes` in proof JSON (affected by new
  points); assertions unchanged.

Untouched: core algorithms/schema/report/legacy fixtures/benchmarks, asset
bytes, API/web UI, DESIGN, `.env`, coordinator plans, bindings JSON (station
centers still match OB-PACK rects). No core edits (adapter casts a minimal
`{room}` to `Scenario` for nav helpers; no type widening needed). No new
framework/services/Docker/Postgres/agents.

## Geometry correction (canonical execution)

Coordinator decisions applied exactly; counts/capacities preserved except the
explicit 2→1; no hidden/dropped geometry, no shrunken footprints, no ghost
capacity; canonical coordinates only.

1. PACK-1/PACK-2 `serviceCapacity` 2→1 (one physical position each, two
   stations/tables preserved). Old 2-with-1-position still throws in
   `createServiceStation` (never minimized); new 1-with-1 constructs.
2. PACK queues were 600mm pitch (PACK1 S1 z6900/Q1 z7500/Q2 z8100/Q3 z8700;
   PACK2 similar; PACK2-Q3 vs DSP-S1 ~583mm). Under the declared 600x800+100
   profile (`ceil(hypot/2)+margin` = 500+100 = 600mm radius) any 600mm pair
   overlaps (600 < 600+600). Repositioned on verified accessible floor:
   - PACK1-Q1 (20500,7500)→(22500,6900), Q2 (20500,8100)→(22500,8400),
     Q3 (20500,8700)→(22500,9900)
   - PACK2-Q1 (20500,13500)→(22500,11400), Q2 (20500,14100)→(22500,12900),
     Q3 (20500,14700)→(22500,14400)
   East line x22500 (outside table inflated maxX 22034, inside wall 23400),
   z 6900/8400/9900/11400/12900/14400 at 1500 pitch. Pairwise disc clearance
   over all 20 service/queue/parking positions: min 1500mm (RCV-S1 vs RCV-Q1,
   pre-existing), all pairs `>1200` (touching `<=1200` counts as conflict).
   Every approach/service/queue/parking point navigable at r600; 6×38=228
   swept routes verified. Service positions, parking, RCV/DSP queues, racks,
   tables, entrances, and obstacles unchanged.
3. Exclusive zones are explicit validated saved config (`trafficZones`,
   optional). Main fixture carries none (no narrow/intersection policy
   needed for the static substrate); micro/oracle fixtures declare their own
   (e.g., `Z-AISLE` 2000..4000×1500..2500). Zones are not obstacles: nav
   never inflates them. Parse/backward-compat tested (absent parses;
   degenerate/out-of-room/duplicate/unknown-kind rejected).

Hashes (bytes are the raw file length, no trailing newline):

- Historical (M2b/main-environment, `MAIN_WAREHOUSE_ENVIRONMENT_REVIEW.md`):
  21,856 bytes,
  `31e8b3429183abf8636b47c5b00f2c0b81dd0d8a4e0fac42c3faf9e303320b4e`.
  Old static screens/proofs (fit 336 visuals; nav 228 paths, 41750 swept
  segments, 41978 centerline points) remain historical, not current proof.
- Current (M3a corrected): 22,374 bytes,
  `ce33a9c5a77300f998c05c5452ed1c04eb9a6bd38d5e0c0eace5fb64d6edadef`.
  Rerun: fit PASS 336 visuals + 4 negatives; nav PASS 228 paths, 42308 swept
  segments, 42536 centerline points + 3 negatives (same counts, new coords).
  Proof JSONs now carry `fixtureSha256`/`fixtureBytes`; no old proof was
  rewritten to claim the new hash.

## API, interval, radius, and reservation contracts

- Radius: per-unit `ceil(hypot(width,length)/2)+margin` (600 for 600x800+100,
  333 for 400x400+50). Static inflation uses the MOVING unit's radius;
  pairwise uses `rA+rB`. Contact: `dist <= rA+rB+1e-6` conflicts (inclusive
  touching, conservative; 1e-6mm absorbs float error, never permissive).
- Intervals: movement CLOSED `[startMs,endMs]` (exact start/end poses, end
  persists as terminal `[endMs,+inf)`); zone holds HALF-OPEN `[startMs,endMs)`
  (0..4000 releases before 4000..8000 at the same instant; terminal still
  checked). Moving-moving overlap is the closed intersection (single-instant
  `endA==startB` checked at that instant). No forklift physics, deadlock
  freedom, or safety certification claimed.
- Routes: core A* points + `ceil(hypot)` per-segment distances; durations via
  `travelTimeMs(dist,speed)` (exact `ceil(dist*1000/speed)`); cumulative
  `[segStart,segEnd]`; zero-distance is zero-duration `[t,t]`. Poses
  interpolate AUTHORIZED segments at the kernel clock (clamped, exact ends).
- Reservation (first policy, disclosed conservative whole-transit): each grant
  atomically reserves its entire swept path `[start,end]` + all required
  zones `[start,end)` + destination (outside all zones, mutually safe).
  Independent nonconflicting paths move CONCURRENTLY (no global lock).
  Narrow and intersection zones both exclusive whole-transit (intersections
  conservatively exclusive). Terminals stay occupied until replacement.
- Kernel: one shared clock (`stepEvent`/`advanceTo` deterministic; chunked
  equals one-shot). Completion priority 0 (`MOVEMENT_COMPLETED`,
  `taskId=unitId`, `planVersion`). `setTaskPlanVersion` makes older
  completions stale (kernel skips, handler never moves). Retry only on
  completion release or explicit bounded `dispatch()` (one FIFO pass); no
  busy-loop/zero-time poll. Waits FIFO `(requestTimeMs,unitId)` with
  `blocker {unit|zone}` and `ageMs=clock-requestTime`.
- Cancel/replace: moving replan rejected (`ALREADY_MOVING`, old preserved);
  invalid replacement preserves old waiting byte-for-byte; midroute cancel
  rejected (`UNSAFE_MIDROUTE`, motion continues, never false `cancelled`,
  never teleport/parking/erase); waiting cancel releases only the pending
  request (pose/inventory preserved). Stuck (pending, 0 moving, 0 grantable,
  no future release) returns bounded `{DEADLOCK_CYCLE|IMPOSSIBLE_WAIT, waits}`
  and retains state. Transport never touches inventory.

## Exact commands and results (2026-11-03, Node v24.18.0, npm 11.8.0)

- `npm run typecheck --workspace @layoutlab/simulation` — pass.
- `npm run build --workspace @layoutlab/simulation` — pass (prebuilds core).
- `npm test --workspace @layoutlab/simulation` — 20 files, 190 tests pass
  (148 pre-existing green + 42 new: 6+7+8+2+6+2+6+5).
- `node packages/simulation/proof-m3a.mjs` — pass; wrote
  `fixtures/operations/oracles/m3a/transport-proof.json` (see Oracles).
- `npm run typecheck` (root) — pass across core, simulation, api, web.
- `node scripts/warehouse-environment-fit.mjs` — `ENV-FIT: PASS 336 container
  visuals, all axes + decks + footprints + 4 negatives` (fixture ce33…, 22374B).
- `node scripts/warehouse-environment-nav.mjs` — `ENV-NAV: PASS 228 swept
  paths + 3 negatives (radius 600mm)` (42308 segs, 42536 points, ce33…).
- Core tests not rerun (no core edits; prior results reused per ownership).
  No browser suite (headless substrate claims no visual testing). No `.env`
  change, no secrets, no paid calls, no commit/push/deploy.

## Independent oracles (literals, not implementation re-calls)

- A. 2000mm straight at 1000mm/s = 2000ms (`[0,2000]`); poses
  `(1000,2000)`@0, `(2000,2000)`@1000, `(3000,2000)`@2000 and @5000
  (persists). Chunked 500/1000/1500/2000 deep-equals one-shot 2000.
- B. Disjoint 2000mm lanes both `[0,2000]` concurrently (poses
  `(2000,1000)`/`(2000,3000)`@1000). Head-on swap waits both ways (occupied
  goals, `DEADLOCK_CYCLE`, poses retained). Crossing with endpoints pairwise
  `>1200` but mids near `(3000,2000)` waits (`TRAJECTORY_CONFLICT`).
  Distinct 600/333 need 933 (1300 lanes concurrent); touching 1200/933
  conflicts, 1201/934 clears. Off-grid connectors ceiled (`>2000` total).
  Stopped agent in path and occupied goal wait with blocker `U1`. Long
  perpendicular runs sequentially `4000..8300` after `0..4000` clears.
- C. Zone `Z-AISLE` 2000..4000×1500..2500; parallel lanes z1400/z2700 (1300
  apart, trajectory-safe) share the zone: first `[0,4000]` holds
  `["Z-AISLE"]`, second waits (`requestTimeMs 0`, `blocker zone Z-AISLE/
  holder U1`, age 3999@3999), granted `[4000,8000]` on completion (no sleep).
  Terminals `(5000,1400)`/`(5000,2700)` persist; new move into `(5000,1400)`
  waits (`OCCUPIED_GOAL`, `IMPOSSIBLE_WAIT` when alone).
- D. Main: PACK-1/2 capacity 1, 1 position each, construct; old 2-with-1
  throws `/exceeds 1 service position/`. 20 service/queue/parking pairwise
  min 1500 (RCV-S1/Q1), none `<=1200`. 44 points navigable; 228/228 swept
  routes. Old 600 pitch (20500×6900/7500/8100/8700) and PACK2-Q3/DSP-S1
  ~583mm both `stationaryVsStationaryConflict=true` (durable negative).
  Hashes/bytes above; provenance cites the historical hash and the x22500
  line; counts 6/24/12/23/6/4/28/12/12 preserved.
- E. Invalid replacement (non-integer) rejected, old waiting byte-identical.
  Moving replan rejected `ALREADY_MOVING`, snapshot identical. Midroute
  cancel rejected `UNSAFE_MIDROUTE`, motion reaches `(3000,2000)` (no false
  `cancelled`). Waiting cancel removes pending only, pose retained. Head-on
  deadlock reports `stuck DEADLOCK_CYCLE` with 2 waits, poses/pending
  retained. Inventory snapshot byte-identical across transport moves.
- F. 148/148 pre-existing sim tests green; 42 new; sim build + root 4-workspace
  typecheck pass; built-export proof above with positions/occupancy/waits/
  routes/seed/versions and no API; expected numbers are literals (no
  same-helper measurement); no browser recording claimed.

## Implemented vs NOT implemented

Implemented: optional traffic-zone schema + validation; nav adapter (per-unit
radii, full obstacle set, own-excluded queries, structured unreachable/
oversize/occupied reasons); swept admission (analytic segment-pair minima,
tails, terminals, half-open zones, conservative corner inflation); kernel-owned
controller (atomic grants, FIFO waits, versions/stale, cancel/replace,
dispatch, stuck diagnostic, frozen snapshots); main PACK 2→1 + x22500 queues
+ provenance + hash redo + fit/nav rerun + old-pitch negative; 42 tests;
built headless proof + `oracles/m3a/transport-proof.json`; this review +
`evidence/sanitized/v3-m3a-transport-proof.json`.

Explicitly NOT in this slice (next bounded task): connected operations
(inventory/order lifecycle/packing handshakes, trips, service transitions),
whole-warehouse lifecycle/shipment metrics, replay/report recomputation,
UI/clocks/controls/cameras/inspectors/overlays, candidate comparisons, Meta
operations patches, adversarial benchmarks, public guard/release/demo. No
whole-v3 dispatch started here.

## Limitations and blockers

- Whole-transit reservation is deliberately conservative (may wait when timed
  passage through a future terminal/zone corner would be safe); disclosed
  throughput cost. Corner inflation is axis-aligned (conservative at zone
  corners). No turning-envelope beyond the circumscribed disc, no
  acceleration/braking/steering, no global deadlock freedom, no safety cert.
- Destinations must lie outside exclusive zones (rejected `DESTINATION_IN_ZONE`);
  replan-while-moving rejected; midroute cancel always rejected in M3a.
- Main fixture carries no traffic zones (substrate only); zone policy proven
  on micro/oracle fixtures.
- Blockers: none for M3a. Next gate is the connected inventory/order/
  packing slice on this substrate.

## Review revisions (independent Codex gates, final acceptance)

R1 (first revision, 190→207 tests): `test/m3a-review.test.ts` (17) for
initial preflight, atomic 128-ID grants, full-footprint zone envelopes,
witnessed attribution, and result isolation; `transport.ts` atomic grants,
bounded event IDs, whole-profile zone release, witnessed/unknown blockers,
detached results. Codex postfix 6/7 (only initial clearance failed;
preserved at `.coordination/m3a-independent-postfix-first-revision.json`).

R2 final (uniform initial clearance, 207→207, this edit): no new scope,
only the existing initial-footprint gate corrected to the movement rule.

Uniform initial-clearance rule (explicit): initial pairwise occupancy uses
the SAME declared conservative disc radius (`ceil(hypot/2)+margin`; 600
for 600x800+100) and inclusive-contact epsilon (`TRAFFIC_CONTACT_EPS_MM`)
as stationary/moving admission (`stationaryVsStationaryConflict`). Center
separation `<= rA+rB+EPS` rejects `INITIAL_OVERLAP` (e.g., two r600 at
`<=1200+EPS`). Rect-interior non-overlap is insufficient: edge-touching
rects (0 gap) violate declared 100 margins, and touching discs are traffic
conflicts. Valid main-fixture 3m spacing unchanged.

Exact case corrections (behavior preserved, no weakened collision checks):

- `test/m3a-review.test.ts` edge-touching ACCEPTED → rejected: 600-apart
  rect-touch rejects `INITIAL_OVERLAP`; 1200 exact-touch rejects
  `INITIAL_*`; 1201 accepts (room 6000x4000 wall-clear, R-FAR clear).
- `test/transport-b.test.ts` stopped-agent: old U1(2000,2000)/U2(1000,2000)
  1000-apart invalid → room 6000x5000, review walls x2400..3600 z0..1100 /
  z2900..5000, U1(3000,2000) parked, U2(1000,2000), goal(5000,2000);
  static route exists, occupied corridor waits with blocker U1; occupied-goal
  half unchanged (U1(3000,2000)/U2(1000,2000) 2000-apart, still waits).
- `test/m3a-review.test.ts` ambiguous-goal (exposed by the new gate): old
  B(2000,1500)/C(2000,2600) 1100-apart invalid → C z2600→2800 (B-C 1300);
  goal (2000,2050) still inside both inflated rects (550/750 in z ≤1000),
  unknown-cause + candidates + `IMPOSSIBLE_WAIT` preserved.

Final counts: `npm test --workspace @layoutlab/simulation` 21 files,
207 tests pass; `npm run build` + `npm run typecheck` pass; Codex
`.coordination/review-m3a-postfix.mjs` 7/7 on the rebuilt bundle; prior
literal `proof-m3a.mjs` green with unchanged numbers (A 2000/2000 midpoint,
B concurrent 0..2000 + waits, C 0..4000/4000..8000, D min1500, E
unsafe-rejected/stuck/inventory-clean). Kept: 500mm/500ms zone
bad-endpoint negative, maxID, unknown/witnessed attribution/isolation
positives, main 20-position min1500. Rejected-constructor inputs untouched.
Limits: whole-transit reservation stays conservative; see Limitations above.
