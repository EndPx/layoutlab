# LayoutLab

Test warehouse changes before making them.

LayoutLab helps warehouse planners compare product-to-location assignments
against picking demand and explicit constraints. A deterministic evaluator
measures every candidate; proposals come from a clearly labeled stub
(no inference), a bounded demand heuristic, or the Meta model through the
native server API with user approval. Racks stay fixed; only assignments
change.

Status: reference UI accepted (M6A); local native production start ready
(M6B, this milestone). The actual 18-trial live benchmark is NOT RUN and
public deployment is unauthorized — see `docs/MILESTONES.md`.

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

```sh
npm run typecheck  # core + api + web
npm run build      # core + api + web
npm test           # deterministic core tests + API fixture tests
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
- Reference UI (M6A): `evidence/sanitized/m6a-1440-reference.png`,
  `m6a-390-reference.png`, `m6a-run-desktop-1440.png`, gates in
  `evidence/sanitized/m6-browser-gates.json`.
- Rack mesh: pinned NVIDIA SimReady `rack_large_empty_a01` converted to GLB
  (3,176,476 bytes) under CC-BY-4.0 — `docs/ASSET_PROVENANCE.md`.

Fixtures are synthetic. The Conservative 2D clearance model is not a safety
certification. Modeled travel reductions are not measured customer savings,
and nothing here claims model superiority. Limits:
`docs/LIMITATIONS.md`.
