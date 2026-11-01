# M1 — Deterministic core (report)

Status: implemented, tested, both coordinator review rounds addressed.
No model key or browser required. M0 inference remains blocked (unchanged,
not retried).

## 1. Result

Strict Zod schemas, atomic assignment validation, conservative
node-grid navigation with measured connectors, deterministic
nearest-neighbor routing, objective ranking, snapshot/revision helpers,
and replay-friendly pure report APIs. Example evaluator output reproduces
every independent oracle value (16000 weighted, 3200 mean, 700 clearance,
corridor/edge/off-grid behavior). 75 tests pass; typecheck, build, and
consumer smoke pass.

## 2. Principal files

- `package.json`, `package-lock.json` — npm workspace, exact pins
  (zod 4.6.7, typescript 7.0.2, vitest 5.0.5, @types/node 26.6.6).
- `packages/core/package.json`, `tsconfig.json` (typecheck: src+test,
  noEmit), `tsconfig.build.json` (build: src only, emits dist + d.ts),
  `smoke.mjs` (consumer import smoke on the built bundle).
- `packages/core/src/`: `version.ts` (constants), `schema.ts` (strict
  scenario/requirements/proposal schemas), `geometry.ts` (cart radius,
  yaw footprints, inflation, segment collision), `scene.ts` (scene
  validation, nav context), `nav.ts` (node-grid A*, connectors, budget),
  `validate.ts` (atomic apply, assignment checks), `routing.ts`
  (nearest-neighbor workload), `objective.ts` (ranking, improvement),
  `snapshot.ts` (freeze/apply), `report.ts` (evaluate/compare/replay),
  `index.ts` (public API).
- `packages/core/test/`: `helpers.ts`, `validation.test.ts` (28),
  `scene-nav.test.ts` (17), `routing-objective.test.ts` (22),
  `independent.test.ts` (8, coordinator oracle mirror).
- `fixtures/sample/warehouse-basic.json` — valid 4-rack/8-location/
  6-product/3-order scene (1 lock, 1 cold chain).
- `fixtures/test/oracle-empty-room.json` — independent distance/demand
  oracle. `narrow-corridor.json` — sub-1400 corridor negative case.
  `offgrid-endpoints.json` — connector case (2486 tour).
- `docs/METHODOLOGY.md` — measurement contract. This file — M1 record.
- Preserved untouched: M0 scripts/assets/evidence, `.env.example`,
  brief, milestones, independent cases.

## 3. Commands and outcomes

| Command | Outcome |
|---|---|
| `npm test --workspace @layoutlab/core` | 4 files, 75 tests pass (~2 s) |
| `npm run typecheck --workspace @layoutlab/core` | clean |
| `npm run build --workspace @layoutlab/core` | emits `dist/index.js` + `dist/index.d.ts` |
| `npm run smoke --workspace @layoutlab/core` | dist bundle evaluates oracle to 16000/3200/700 |
| `node D:/tmp/m1-evidence.mjs` (throwaway probe, kept out of repo) | example output below; ~13 ms per sample eval |

## 4. Example evaluator output (checked)

Oracle fixture baseline, verbatim from the built bundle:

```json
{
  "cartRadiusMm": 500,
  "navigationRadiusMm": 700,
  "gridNodes": 3721
}
{
  "outcome": "NO_IMPROVEMENT_FOUND",
  "weightedTravelMm": 16000,
  "meanOrderDistanceMm": 3200,
  "totalUnits": 20,
  "orders": [
    {
      "orderId": "O-both", "frequency": 3, "distanceMm": 4000,
      "visitSequence": ["sku-a", "sku-b"],
      "legs": ["@packing->sku-a:1000", "sku-a->sku-b:2000", "sku-b->@packing:1000"]
    },
    {
      "orderId": "O-a", "frequency": 2, "distanceMm": 2000,
      "visitSequence": ["sku-a"],
      "legs": ["@packing->sku-a:1000", "sku-a->@packing:1000"]
    }
  ]
}
```

Checks: 500 = sqrt(300^2+400^2); 700 = max(600, 700); legs
1000/1000/2000; 3*4000+2*2000 = 16000; 16000/5 = 3200; demand
3*2+2*7 = 20 units. Quantity 7 still yields one visit. Sample
warehouse baseline observes 36800 mm (implementation-computed, not an
independent oracle). Off-grid fixture observes 2486 (hand-verified:
12 grid steps + 43 connector, doubled).

## 5. Coverage of brief 27 + independent cases

All 17 deterministic requirements have dedicated tests: duplicate
product, duplicate occupancy, missing product, unknown location,
storage class, load dimensions (+ fixed-orientation rotation check),
locked assignment, budget, rack bounds, known-distance path,
unreachable endpoint, tie-break, weighted frequency, invalid-baseline
percent, invalid-vs-valid selection, replay, stale apply. Independent
cases mirror in `independent.test.ts`: empty-room values, 700
clearance with 699/700 wall rejection, sub-1400 corridor with valid
endpoints, edge collision with passing endpoints, swap budget 1/2,
atomic no-eviction, baseline-start proposals, unreachable preservation
with null travel, 25% synthetic check plus 56.25% end-to-end check,
validity/travel/relocation/key ranking, replay, stale rejection.
Actual narrow-corridor, edge-collision, and off-grid endpoint cases
are included, not only no-obstacle tests.

## 6. Coordinator review responses (all four, this dispatch)

1. **Build contract** — split `tsconfig.build.json` (emits dist +
   declarations, src only) from typecheck config; `npm run build`
   verified to emit; `smoke.mjs` consumer import smoke asserts
   16000/3200/700 on the built bundle.
2. **Navigation** — replaced cell-center distances (dropped stubs)
   with 100 mm-multiple nodes: measured path = connector + grid +
   connector, ceil(Euclidean) connectors, identical navigable points
   0, nonzero same-node checks, hand values preserved exactly.
   Added aggregate computation budget (250k grid nodes, 200k A*
   expansions per workload) failing as `BUDGET_EXHAUSTED`, never as
   unreachable. Edge collision retained.
3. **ID collisions** — `@packing` rejected as a location id in schema
   and validator (narrow: products/orders/racks may use it); distance
   cache and stable key use JSON tuple encoding; adversarial-ID tests
   added. `applyAssignment` documents evaluate-before-apply; UI must
   also check scenario identity/settings at apply time (M2).
4. **Replay trust** — `replayReport` parses a bounded envelope, rejects
   report/core/policy mismatches by literal, strictly validates
   candidate mappings, and verifies claims (assignment, valid,
   weighted, relocations), best name, percents, outcome. Tamper tests
   cover version, policy, mapping, metrics, and malformed envelopes.

## 6b. Coordinator review responses (round 2, this dispatch)

1. **Connector regression** — coordinator's independent case
   `shortestPathMm({1010,1010},{1020,1020})` now returns 44
   (connectors 15 + 29, same node), covered by a dedicated test;
   grid hand values (16000/3200/700) preserved and re-verified.
2. **Atomic baseline preservation** — `applyProposal` preserves
   untouched baseline rows exactly (empty proposal never repairs an
   invalid baseline) and rejects changes to duplicated baseline
   products with `PROPOSAL_AMBIGUOUS_BASELINE`. Tests cover
   duplicated baseline + empty proposal and ambiguous change.
3. **Total input bounds** — schema caps cut to MVP scale (32 racks,
   128 locations, 64 products, 128 assignments, 128 orders,
   64 lines/order, 4096 total lines, 64 changes, 64 locks,
   64 report candidates), 3-6x above the brief's suggested scene
   sizes; over-cap input fails fast at parse time with tests.
4. **Replay completeness** — replay claims now include the full
   workload (orders, sequences, legs, distances, counts, overflow
   and budget flags); tampered visit sequences or leg distances
   yield `matchesSaved: false`. Tests cover both.

## 7. API exports

Versions/policy constants; strict schemas + parsers; cart/nav radii,
footprints, inflation, segment tests; scene validation + nav context;
node A*, endpoint connection, budget controls; atomic proposal apply,
assignment validation, fit/relocation helpers; workload evaluation
with safe arithmetic; fingerprint/stable key, improvement, ranking;
freeze/apply snapshots; evaluate/compare/report/replay. Full list in
`packages/core/src/index.ts`. Pure functions only; no key, no browser,
no network, no timers.

## 8. Method assumptions and performance bounds

See `docs/METHODOLOGY.md` for the full contract. Key assumptions:
fixed load orientation; conservative inclusive inflation with strict
wall band; 100 mm node grid, Manhattan A*, fixed `(f,h,j,i)`
tie-break; ceil connectors within 2000 mm; ID tie-break by code-unit
order; quantities feed demand only. Bounds: closed-set A* (each node
once per leg), memoized pairs, 250k-node / 200k-expansion workload
caps, checked integer arithmetic. Observed: oracle single-digit ms,
sample ~13 ms/eval, suite ~2 s.

## 9. Deliberate limitations

- Demand heuristic not in core (M4 handoff below); rank/compare APIs
  ready for it.
- No provider/orchestration/timeout/cancellation in core (M3); core
  budgets cover computation only.
- Sub-~100 mm effective passages may read unreachable (conservative).
- Single cart/trip/order; no congestion, levels, or dynamics.
- UI-boundary identity/settings check deferred to M2.

## 10. Findings

- Two self-authored test expectations were wrong on first run (wall
  band boundary at exactly 700; overflow magnitude 2e13 not 2e16);
  both corrected with documented justification, no product code
  weakened. One fixture JSON typo (stray brace) fixed.
- Schema-valid maxima cannot overflow the oracle geometry; the
  overflow guard is exercised programmatically as defense in depth.
- Sample fixture pick points clear inflated racks by >= 100 mm; all
  demanded locations reachable as asserted.

## 11. Blockers and next gate

- Blockers: none for M1. M0 live inference still blocked (key + spend
  authorization, owned by coordinator/user); not retried.
- Next gate: M2 browser flow (load, edit, evaluate, compare, apply,
  persist, export, replay) on coordinator dispatch. Do not start
  without dispatch.
- M4 handoff: implement the bounded demand heuristic against
  `evaluateCandidate` (frequency rank x packing-distance rank,
  locks/budget respected, complete mapping or documented repair,
  evaluation-count budget); heuristic detail stays out of core
  until then.
