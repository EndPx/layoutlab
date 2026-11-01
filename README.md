# LayoutLab

Test warehouse changes before making them.

LayoutLab helps warehouse planners compare storage assignments using picking
demand and explicit operational constraints. A deterministic evaluator measures
every candidate; in M2, a clearly labeled stub proposes deterministic
placeholder alternatives (no live model inference).

## Native start (Node 20+, no Docker)

```sh
npm install
npm run dev        # planner at http://127.0.0.1:5173/
```

## Checks

```sh
npm test           # deterministic core tests
npm run typecheck  # core + web
npm run build      # core + web
npm run test:e2e   # Playwright (desktop 1440 + mobile 390; reuses :5173 if up)
```

## Milestone docs

- `docs/IMPLEMENTATION_BRIEF_V2.md` — scope authority (do not edit).
- `docs/METHODOLOGY.md` — measurement contract.
- `docs/M1_CORE.md`, `docs/M2_BROWSER.md` — milestone reports.
- `DESIGN.md` — planner visual-system contract.
- `evidence/sanitized/` — sanitized evidence (no secrets).

Keys stay server-side in `.env` (git-ignored, never read by the browser app).
M2 makes zero model requests.
