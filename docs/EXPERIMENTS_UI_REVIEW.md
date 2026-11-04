# Experiments UI review (E4b)

Status: implemented locally, zero paid calls by this worker. The final
US$0.25 public claim was not consumed; every live-flow check ran against
the local fixture transport (`providerKind: fixture`, `realMetaRequests: 0`)
or the recorded report. Contract first recorded in `DESIGN.md` §12.

## What shipped

One real `Experiments` destination (`?mode=experiments`, third segmented
mode beside Storage Planning / Operations Simulation). App owns the
experiments holder above the mode switch, so switching modes never creates
a run, resets spend, or discards the active run id, frozen inputs, or last
report. Hierarchy follows UI v3 reference 04 (∼350px question/permissions
column + flexible evidence region), with 05/07/08 as state references;
pictured numbers and unsupported actions were not shipped.

- Question + permissions: free-text question (grants nothing) kept separate
  from machine-readable allowed changes. Only the three supported
  service-duration assumptions (packing/dispatch/receiving) are offered,
  unchecked by default, with validated 1000..300000 ms ranges labeled
  hypothetical. Staffing is shown disabled with the concrete infeasible-
  geometry reason; no storage/traffic controls exist. Question/policy/
  scenario freeze per investigation; later edits mark the result as from
  previous inputs.
- Baseline: the synthetic burst (`picking-packing-burst`, seed
  `m3b-burst-001`, 6 orders / 0 deliveries / 12 products / 24 slots /
  6 units / 4 resources) evaluated locally through E3 with zero model
  requests — shipped 6, backlog 0, makespan 502.4 s, total wait 614.9 s.
  Total wait is captioned as summed engine wait intervals; unavailable
  metrics render `—` with a reason, never 0. Ms display as seconds at one
  decimal; percents at one decimal with full precision in details/export.
- Live flow: same-origin typed adapter (create → poll ∼1s with abort →
  cancel → report), no browser key, explicit Live selection + consent,
  server model/availability and allowance read from `/api/status` +
  `/api/budget` (`perRunReservationUsd` from config, never hardcoded).
  Start disables with reasons for active run, no key, guard unavailable,
  insufficient allowance, empty question, or missing consent; 400/402/429/
  503 surface without resubmission. Cancel keeps partial evidence.
- Evidence: phases, request/experiment counts vs caps, run ids, hypotheses
  labeled model assertions, accepted/rejected actions, every candidate
  (invalid/incomplete/no-improvement included), model vs deterministic
  best/fallback kept distinct. Details drawer: changed fields before/after,
  allowed policy, per-order timestamps, request metadata, limitations.
- Inspection: a separate controller rebuilt from the selected candidate's
  executed report scenario + frozen execution config, rendered with the
  existing OperationsPanel/View (presets, selection, playback). It never
  overwrites the Operations Simulation run; unmapped/invalid candidates
  disable visualization with a reason. One heavy canvas at a time.
- Recorded/import/export/verify: the accepted public report is copied
  byte-for-byte (SHA256 `4CA389E8…B240D7`, 240992 bytes) to
  `apps/web/public/evidence/e4a-live-investigation-f24a6a1.json` and loads
  as `Recorded Meta run / replay` (run `fd2247b1-…`, model
  `muse-spark-1.3-contributor`, 3 historical requests — never new/live).
  Imports validate shape with malformed-file errors; fixture reports stay
  labeled fixture. Export downloads the held report JSON exactly
  (partial failed/cancelled included). Recompute posts to the new server
  verifier (engine-only, no key, no ledger mutation) and shows actual
  pass/mismatches; the offline CLI stays visible. No hardcoded PASS.

## Narrow server changes

`GET /api/budget` now also returns `perRunReservationUsd` from config, and
`POST /api/operations/investigations/verify` reuses `verifyInvestigationExport`
with bounded input under the existing safe rate limiter. The accepted
investigation algorithm, prompts, guard semantics, and E3 evaluator are
untouched.

## Files

`DESIGN.md` (§12), `apps/web/src/App.tsx` (mode wiring + holder),
`apps/web/src/components/ExperimentsPanel.tsx` (new),
`apps/web/src/lib/experiments.ts` + `experiments.test.ts` (new),
`apps/web/src/lib/operations.ts` (inspection scene/controller helpers only),
`apps/web/src/styles.css` (`.exp-*`), `apps/web/public/evidence/…` (recorded
copy), `apps/web/e2e/experiments.spec.ts` + `helpers/experiments-fixture.ts`
(new), `apps/api/src/server.ts` (budget field + verify route),
`apps/api/test/experiments-ui.test.ts` (new), this review. No scenario
geometry, workload, asset, engine-core, budget-config, `.env`, README,
deployment, or checkpoint edits; no commit/push/deploy.

## Verification (all observed this session)

- Root `npm run build` and `npm run typecheck`: passed (pre-existing
  >500 kB chunk warning only).
- API: `npm run test --workspace @layoutlab/api` — 160 passed (155 prior +
  5 new proving the budget field source and verify with zero provider
  calls / unchanged ledger, including no-key operation).
- Web units (simulation vitest runner): 44 passed across experiments,
  operations, and storage-anchor suites.
- Browser: real Microsoft Edge (`channel: msedge`, Playwright) —
  `e2e/experiments.spec.ts` 16 passed across desktop 1440 + mobile 390:
  offline baseline/recorded/inspection/export, malformed import, fixture
  feedback flow (2 requests, exp-1 343.2 s, mode-switch preservation,
  zero-spend replay/verify), denied staffing invalid, no-improvement,
  cancel partial evidence, no-key and exhausted-allowance gating.
  Planner/operations regressions (`m2-flow`, `operations-environment`)
  24 passed on Edge. No Chrome substitution.
- Artifacts: `evidence/sanitized/e4b-experiments-1586-edge.png`,
  `…-1440-edge.png`, `…-768-edge.png` (ready state; stacked at 768),
  `e4b-experiments-recorded.png` and `e4b-experiments-fixture-live.png`
  (full-page states), and `e4b-experiments-fixture-flow-edge.webm`
  (question → fixture investigation → inspect → compare → export,
  explicitly a fixture recording). Reference-04 hierarchy, labels/focus,
  and no page horizontal overflow were checked in-browser; no Lighthouse,
  60 fps, or mobile-3D performance is claimed.

## Follow-up (entry, access, brand) — 2026-11-04

- Entry: the bare URL now defaults to Operations Simulation;
  `?mode=planning` / `?mode=experiments` select explicitly, state preserved
  across switches (`apps/web/e2e/entry.spec.ts`). Planner-intending suites
  now name `?mode=planning` instead of assuming the old default.
- Access: Experiments links “Live access sign-in (new tab)” to
  `/live-access?mode=experiments` (browser-native Basic Auth; this tab and
  its inputs untouched, no credentials stored/embedded), distinguishes
  server-configured from visitor-authenticated, and maps HTTP 401 on
  Start/poll/cancel to recovery copy with Refresh status + deliberate retry
  and no automatic resubmission. Baseline, recorded, import, export, and
  exact-verify paths remain usable without auth. Verified locally with a
  fixture API plus an intercepted 401 (exactly one create attempted, zero
  provider requests); no production paid requests, no credential files read,
  no nginx changes.
- Brand: generated symbol wired in the header (24×24 + live-text wordmark)
  and as the PNG favicon at its actual 1254×1254 size; masters untouched.
  Realism diagnostic: `docs/WAREHOUSE_REALISM_PLAN.md`.

Release blockers fixed (coordinator review): UTF-8 mojibake introduced in
`App.tsx` by a line-rewrite was restored character-for-character against
HEAD (ellipsis/em-dash/inequality/check/cross/separators; the encoding
check now counts 0 markers in all touched UI files) and the page title is
now “Warehouse operations simulator”. Import validation is bounded and
structural for every field the UI reads (headers, versions, limits, budget,
scenario/policy rows, request/trace rows, candidate rows), with the last
good state preserved on error and numeric recomputation still only on the
server verifier. Fixture live-flows now label “Fixture investigation —
fake transport” from Start through terminal polling. Recorded/import are
disabled with explanation while an investigation is RUNNING, and polling
skips overlapping ticks and drops obsolete post-fetch updates.

## Unfinished / limits

E4b does not close AI-contribution evaluation, the final public UI smoke,
or all of v3. Investigation state remains in-memory server-side; staffing
stays infeasible on current geometry by design. The deployed public API
was not touched and no live Meta call was made.

## Coordinator UI acceptance (2026-11-04)

Accepted for the bounded Experiments UI, entry/access and brand integration.
Reviewed source changes for same-origin API use, zero-model verification,
explicit consent/allowance gates, replay provenance, isolated engine
inspection, mode state preservation and corrected import/poll lifecycle.
Independent encoding scan reports zero mojibake markers. Existing Edge
artifacts were inspected; screenshots from before the final encoding patch
remain historical, and public screenshots will be recaptured after deployment.
Worker final root build/typecheck and20 Edge entry/Experiments cases passed;
prior API160, web44 and planner/operations24 regressions remain evidence.
Acceptance does not imply renderer realism, human workers, or full-v3 closure.
