# LayoutLab

Test warehouse changes before making them.

LayoutLab helps warehouse planners compare product-to-location assignments
against picking demand and explicit constraints. A deterministic evaluator
measures every candidate; proposals come from a clearly labeled stub
(no inference), a bounded demand heuristic, or the Meta model through the
native server API with user approval. Racks stay fixed; only assignments
change.

Status (2026-11-04): the public [web preview](https://layoutlab.endpx.cloud)
runs release `5cd1655` with the main warehouse scene, engine-driven operations,
dispatch, inbound/put-away, split trips, and operations report replay. The
18-trial storage-planning Meta benchmark remains separate, completed evidence.

The public guard and bounded investigation backend passed independent review.
One actual Meta investigation tested two service-time alternatives and then
recommended a measured candidate using three model requests. The complete
report reruns offline without mismatches. Its synthetic six-order baseline
was 502.4s; the selected dispatch assumption produced 397.1s (20.959395%
modeled makespan reduction). This is one integration run, not evidence of
real warehouse savings or AI superiority over a fixed search strategy.
See [investigation evidence](docs/OPERATIONS_INVESTIGATION_REVIEW.md).

Public inference is password-restricted with a persistent US$1 allowance.
The ledger now has US$1 conservatively committed and US$0 available;
these claims are not invoices. [Deployment evidence](docs/PUBLIC_DEPLOYMENT.md)
keeps earlier failures and later successful runs visible.

The [v3 brief](docs/IMPLEMENTATION_BRIEF_V3.md) and
[delivery plan](docs/EXPERIMENTER_DELIVERY_PLAN.md) define the remaining work.
Controlled comparisons enforce explicit permissions, retain invalid/incomplete
candidates, and export replayable reports. The bounded Meta backend now uses
engine feedback and run-linked recommendations. The Experiments UI is now public: recorded replay, candidate inspection,
export and recomputation passed anonymous Microsoft Edge checks.
Equal-budget AI contribution evaluation and warehouse realism remain in progress.

The website, sample simulation and recorded evidence are open without login.
The root URL opens Operations. Only routes that start or manage live Meta
inference require judge access; use the private credentials supplied by the
project owner. Never publish the password in a public submission description.

The current realism work is tracked in
[warehouse requirements](docs/WAREHOUSE_REALISM_REQUIREMENTS.md): human
workers, solid visible cargo, better source-material rendering, physical
movement and shared planning/operations inputs. The current cart-based
synthetic view does not yet satisfy that expanded acceptance gate.

## Native start (Node 24.18 tested, no Docker)

```sh
npm ci
npm run build      # core -> api -> web
npm start          # planner + API at http://127.0.0.1:3001/
```

One loopback origin serves the built planner (`/`) and the API (`/api/*`).
Tested on Node v24.18.0; root `engines` is
`^22.12.0 || ^24.0.0 || >=26.0.0` (the installed Vitest 5.0.5 floor — older
Node 20 releases are not supported). Development uses two terminals instead:

```sh
npm run dev          # planner at http://127.0.0.1:5173/ (Vite)
npm run dev:api      # API at http://127.0.0.1:3001/ (separate terminal)
```

Details: `docs/LOCAL_RUNTIME.md`. Demo walkthrough: `docs/DEMO.md`.

## Configuration

Copy `.env.example` to `.env` (git-ignored) and fill `MODEL_API_KEY` locally;
the key never leaves the server. Without a key, `/api/status` reports
`setup_required` and sample/manual/stub mode stays fully usable. `-contributor`
model ids are discounted in exchange for training-data use; the planner
discloses this and requires consent before any live request.

| Mode | Inference | Description |
|---|---|---|
| Sample/manual | 0 model requests | Synthetic `warehouse-basic` (36.8 m baseline); edits re-evaluate locally |
| Stub | 0 model requests | Deterministic labeled proposals plus the demand heuristic (29.8 m, 15/32 evals) |
| Live | Bounded Meta API | At most 3 proposals / 4 requests per run; approval gate, cancellation, budgets |

## Checks

On a fresh checkout, build once before typechecking: browser integration
helpers import the compiled API. Install Playwright Chromium once if its
browser binary is not already available on the machine.

```sh
npm run build      # core + api + web
npm run typecheck  # core + api + web, after the first build
npm test           # deterministic core tests + API fixture tests
npx playwright install chromium  # first browser-test setup only
npm run test:e2e   # Playwright (desktop 1440 + mobile 390; reuses :5173 if up)
```

## Evidence (exact links)

- One authorized live smoke (`docs/LIVE_SMOKE.md`): 4 real requests —
  interpretation plus 3 attempts, of which 2 had no parseable content and 1
  was valid but worse (45,600 mm vs 36,800 mm baseline). Outcome
  `NO_IMPROVEMENT_FOUND`, baseline retained, usage incomplete.
  Artifacts: `evidence/sanitized/m3-live-smoke.json`,
  `m3-live-smoke-run.json`, `m3-live-smoke-report.json`,
  `m3-live-smoke-replay.png`.
- Offline benchmark (`docs/EVALUATION.md`): 6 frozen scenarios,
  baseline+heuristic, 0 model calls —
  `evidence/sanitized/m5-benchmark-offline.{json,md}`.
- Fixture benchmark: 18/18 trials, 72 loopback requests, **0 real** Meta
  requests, replay matched —
  `evidence/sanitized/m5-benchmark-fixture.{json,md}`.
- Actual Meta benchmark: 18/18 runs, 72 real requests, all 54 proposal
  attempts retained (38 valid, 16 unparseable); 18 reports replayed and 71
  valid assignments independently checked. Meta beat the heuristic in two
  synthetic runs; ties and failures are included, without a general
  superiority claim. `evidence/sanitized/m5-benchmark-live.{json,md}` and
  `docs/EVALUATION.md` document the phased execution and original local
  infrastructure refusals.
- Reference UI (M6A): `evidence/sanitized/m6a-1440-reference.png`,
  `m6a-390-reference.png`, `m6a-run-desktop-1440.png`, gates in
  `evidence/sanitized/m6-browser-gates.json`.
- Rack mesh: pinned NVIDIA SimReady `rack_large_empty_a01` converted to GLB
  (3,176,476 bytes) under CC-BY-4.0 — `docs/ASSET_PROVENANCE.md`.

Fixtures are synthetic. The Conservative 2D clearance model is not a safety
certification. Modeled travel reductions are not measured customer savings,
and nothing here claims model superiority. Limits:
`docs/LIMITATIONS.md`. External-source boundaries:
`docs/EVIDENCE_BASE.md`.

Verify any downloaded report without an API key (pure core replay from
embedded inputs): `node scripts/verify-report.mjs <report.json>`.
