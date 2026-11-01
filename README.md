# LayoutLab

Test warehouse changes before making them.

LayoutLab helps warehouse planners compare storage assignments using picking
demand and explicit operational constraints. A deterministic evaluator measures
every candidate; proposals come from a clearly labeled stub (no inference) or
from the Meta model through the native server API with user approval.

## Native start (Node 20+, no Docker)

```sh
npm install          # also builds @layoutlab/core via prepare
npm run dev          # planner at http://127.0.0.1:5173/
npm run dev:api      # live API at http://127.0.0.1:3001/ (separate terminal)
```

The web dev server proxies same-origin `/api` to the API. Live mode stays
disabled until the API reports ready and the user selects it with explicit
consent. Copy `.env.example` to `.env` (git-ignored) and fill `MODEL_API_KEY`
locally; the key never leaves the server.

## Checks

```sh
npm test           # deterministic core tests + API fixture tests
npm run typecheck  # core + api + web
npm run build      # core + api + web
npm run test:e2e   # Playwright (desktop 1440 + mobile 390; reuses :5173 if up)
```

## Milestone docs

- `docs/IMPLEMENTATION_BRIEF_V2.md` — scope authority (do not edit).
- `docs/METHODOLOGY.md` — measurement contract.
- `docs/M1_CORE.md`, `docs/M2_BROWSER.md`, `docs/M3_RUNTIME.md` — milestone reports.
- `DESIGN.md` — planner visual-system contract.
- `evidence/sanitized/` — sanitized evidence (no secrets).

Keys stay server-side in `.env` (git-ignored, never read by the browser app).
M2 makes zero model requests. M3 fixture evidence makes zero real Meta
requests; live Meta inference is implemented but untested in this dispatch.
