# LayoutLab local runtime (M6B)

Native Node only: no Docker, no PostgreSQL, no CI billing workflows. One
production command serves the built planner and the API on the same loopback
origin. No model call runs on startup; live inference needs a server-side key
plus explicit in-UI consent.

## Node version

Tested: **Node v24.18.0, npm 11.8.0** on Windows. The root `engines` field is
`^22.12.0 || ^24.0.0 || >=26.0.0`, the floor set by the installed test runner:

| Installed tool | Version | Its Node floor |
|---|---|---|
| Vitest | 5.0.5 | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` (binds `npm test`) |
| Vite | 8.3.5 | `^20.19.0 \|\| >=22.12.0` (binds `npm run build`) |
| @vitejs/plugin-react | 6.1.2 | `^20.19.0 \|\| >=22.12.0` |
| Playwright | 1.64.1 | `>=20` |
| TypeScript | 7.0.2 | (no blocking floor above these) |

Use the tested Node 24.18. Older Node 20 releases do not satisfy the test
floor even though the Vite build floor is lower; the root `engines`,
`package-lock.json`, and this document agree on that.

## Production: one native start

From the repository root:

```sh
npm ci
npm run build      # core -> api -> web
npm start          # planner + API at http://127.0.0.1:3001/
```

`npm start` runs the API entrypoint, which also serves `apps/web/dist` on the
same origin: `/` is the planner, `/api/*` is the API. The dist path resolves
relative to the server module, not the caller's working directory, so starting
from another directory still finds the build. The server binds loopback
(`API_HOST`, default `127.0.0.1`) on `API_PORT` (default `3001`).

Serving boundaries (tested in `apps/api/test/native-start.test.ts`):

- Only `apps/web/dist` bytes are served. The repository root, source files,
  and `.env` are unreachable through static routes; dotfiles are denied.
- Unknown `/api/*` routes return JSON `404 { code: "UNKNOWN_API_ROUTE" }`.
- There is no shell fallback: the planner has no client router, so `/` serves
  `index.html` and every other miss (extensionless or not) is a JSON 404,
  never the shell.
- The pinned rack GLB is served as `model/gltf-binary` with the manifest
  bytes/hash (`assets/manifests/rack_large_empty_a01.manifest.json`).

### Missing build

`npm start` before `npm run build` does not produce a silent blank page: the
API still serves every `/api` route, the startup log reports `"web":"missing"`,
and `GET /` answers `503` with the setup steps (`npm run build`, then
`npm start`). The same applies to the development API, which must keep working
before the web is built.

## Development: two terminals

```sh
npm ci
npm run dev          # planner at http://127.0.0.1:5173/ (Vite)
npm run dev:api      # API at http://127.0.0.1:3001/ (separate terminal)
```

The Vite dev server proxies same-origin `/api` to the loopback API. The dev
API serves no web build: `/api/*` works and `GET /` returns the 503 setup
guidance above.

## Server-only environment

Copy `.env.example` to `.env` (git-ignored, never committed) and fill it
locally. Only the API server reads it; the browser bundle never sees it.

| Variable | Purpose |
|---|---|
| `META_API_BASE_URL` | Official `https://api.meta.ai/v1`, or a loopback fixture URL for tests |
| `META_MODEL_ID` | Model id, for example `muse-spark-1.3-contributor` |
| `MODEL_API_KEY` | Server-side key. Empty/missing: `/api/status` reports `setup_required` and live runs refuse with 503 |
| `MAX_PROPOSALS_PER_RUN` / `MAX_MODEL_REQUESTS_PER_RUN` / `RUN_TIMEOUT_MS` | Operator limits; the server clamps to the brief caps (3 proposals, 4 requests, 120000 ms) |
| `API_HOST` / `API_PORT` | Bind address/port (defaults `127.0.0.1` / `3001`) |

Never use `VITE_`-prefixed variables for secrets: those would ship to the
browser. Explicit process-environment values (including an explicit empty
string) always win over the `.env` file.

Without a key the planner is fully usable in sample/manual/stub mode; the
Live provider option reports the server is not ready. See
[DEMO.md](DEMO.md) for the mode distinction.

## Contributor training-data disclosure

Model ids containing `-contributor` are discounted in exchange for
training-data use. When such a model is configured and Live is selected, the
planner shows a "Contributor model" notice and requires the consent checkbox
("I consent to sending this scenario and request to Meta Model API") before
any request is sent. No request leaves the browser without that consent, and
the key itself never leaves the server.

## Checks

```sh
npm run typecheck  # core + api + web
npm run build      # core + api + web
npm test           # deterministic core tests + API fixture tests (110 + 75)
npm run test:e2e   # Playwright, desktop 1440 + mobile 390 (reuses :5173 if up)
```

Benchmark CLIs (no paid inference unless the live flags are passed, which
requires a separate authorization that is currently absent):

```sh
node scripts/m5-benchmark.mjs --mode offline   # 6 scenarios, 0 model calls
node scripts/m5-benchmark.mjs --mode fixture   # 18 trials, 72 loopback requests, 0 real
```

The actual 18-trial live benchmark is NOT RUN. Fixture and offline results say
nothing about live model behavior. See [M5_BENCHMARK.md](M5_BENCHMARK.md) and
[EVALUATION.md](EVALUATION.md).

## What this runtime is not

- No public deployment: `npm start` binds loopback for local use. Public
  hosting is unauthorized and unperformed; see
  [MILESTONES.md](MILESTONES.md).
- No database or durable server storage: run state is process-local; export
  reports as JSON when evidence must be retained.
- No savings or superiority claims: modeled travel reductions are evaluator
  outputs under the Conservative 2D clearance model, not measured warehouse
  savings. See [LIMITATIONS.md](LIMITATIONS.md).
