# LayoutLab M2 — DESIGN.md (operational planner contract)

Product scope is the user brief (Implementation Brief v2 §23), not a redesign:
an English warehouse planning console for one scenario at a time. Top bar,
left assignments, center 2D+3D, right request/requirements/timeline, bottom
comparison/relocations. All numbers come from `@layoutlab/core`.

## 1. Visual direction

Operational console, not marketing. One memorable element: the warehouse plan
itself (2D SVG with true route polylines). Everything around it stays quiet
and dense so measurements stay readable at 1440px and usable at 390px.

- Base: light paper `#f6f7f9`, surfaces white `#ffffff`, ink `#1a2333`.
- Borders: `#d5dbe5`. Muted text `#4a5568` (4.6:1 on white).
- Accent: deep teal `#0e6e6e` (5.9:1 on white) for primary actions and
  selection. Focus ring: 2px solid `#0e6e6e` + 2px offset white.
- Status: valid `#1a7f37`, invalid `#b42318`, warning `#8a5a00`; every status
  pairs color with text and an icon glyph (✓ / ! / ×), never color alone.
- Demand scale (3 steps + legend, pattern + label, not color alone):
  low `#dbe7ff` + `○`, mid `#7aa5ff` + `◐`, high `#123a9e` + `●` with white
  text on high. Legend is always visible under the 2D view.
- Locked: `#8a5a00` badge with `🔒`-free text `LOCK` + `aria-label`; also a
  `▪` marker in tables.
- Type: system stack only (offline, no webfont fetch).
  Body: `"Segoe UI", system-ui, -apple-system, sans-serif`.
  Data/IDs: `ui-monospace, "Cascadia Mono", Consolas, monospace`.
  Scale: 12 data / 13 dense / 14 body / 16 headings / 20 top title.
- Radius: 4px controls, 6px panels. Spacing 4/8/12/16/24. No shadows except
  a 1px top-bar divider; no gradients, no glass, no card-nesting.

## 2. Layout (fixed rack geometry; UI never edits racks)

Desktop ≥1024px: CSS grid `top / left center right / bottom`.
Top bar 48px: scenario id, revision, mode badge (`STUB` / `REPLAY` / `MANUAL`),
`Reset`, `Export JSON`, `Import/Replay`.
Left 280px: products table (product, location select, demand dot+label,
compatibility, lock). Manual edit here bumps revision.
Center flexible: 2D SVG always available; 3D proxy below/side-by-side with a
persistent `DEVELOPMENT PROXIES` ribbon. Order selector + legend + before/after
toggle live above the views.
Right 300px: planning request textarea (display only for stub), structured
requirements form (max relocations, locks, assumptions), `Approve
requirements` gate, `Generate stub (max 3)` + `Cancel`, proposal timeline
(all candidates incl. invalid with reasons), Meta-unavailable notice.
Bottom: comparison table (candidate, valid, weighted travel, mean, relocations,
improvement) + relocation table
(product/from/to/compatibility/reason) for the selected candidate.

Mobile ≤640px (390px target): single column in order top → center → left →
right → bottom; tables scroll horizontally inside panels; 2D and 3D stack;
touch targets ≥44px for primary buttons.

## 3. Primitives and states

Buttons: primary (teal fill, white text), secondary (white, teal border),
danger-ghost for Reset/Cancel. Disabled states use `aria-disabled` + reduced
opacity + reason in `title` and adjacent text.
Selects/inputs: visible `<label>`, 13px, error text under the field in
`#b42318` with `role="alert"` for parse failures.
Tables: monospace IDs, sticky header, row selection by radio semantics
(`aria-selected`), invalid rows get `!` prefix and an error summary line.
Badges: `STUB`, `MANUAL`, `REPLAY`, `INVALID`, `LOCK`, `PROXY` — uppercase
12px, 4px radius, border + text (no color-only meaning).
Timeline: ordered list of proposals with state (queued/running/valid/invalid/
cancelled), each with parsed/validated/evaluated sub-status.
Motion: none by default except route redraw and a 150ms opacity fade on
candidate switch; all motion disabled under `prefers-reduced-motion`.

## 4. 2D and 3D contract

2D SVG: room rect, rack footprints from core `rackFootprint` (centers + yaw),
location pick points, packing point, product labels (distinct text, never
color alone), source/destination highlight (dashed outline + `FROM`/`TO`
tags), selected order route as true collision-checked polylines from core
`shortestPathPointsMm` (packing → visits → packing). If polylines are
unavailable the view shows `Visit-order schematic — not collision-checked`
and uses straight dashed connectors; M2 ships the true-polyline path.
3D: basic Three.js proxy scene, Y-up, mm→m scale 0.001, rack boxes at
footprint centers with yaw, location markers, packing marker, route line.
Persistent `DEVELOPMENT PROXIES — no SimReady asset yet (M4)` label inside
the viewport and in export `assetProxyRefs`. No orbit auto-motion; static
isometric-ish camera with keyboard-accessible view toggle.

## 5. Accessibility constraints

Contrast ≥4.5:1 body, ≥3:1 large text; visible focus on all controls;
keyboard-reachable view toggle, order select, candidate select, and all
actions; `aria-live="polite"` for evaluation/stub status; no color-only
signals (demand, validity, locks, from/to all have text/symbol); reduced
motion honored; 390px has no page-level horizontal scroll.

## 6. Accepted debt and limits

Plain CSS (no Tailwind/shadcn) to stay offline and minimal. No virtualized
tables (MVP scale ≤64 products). 3D is an unlit-proxy scene, not a visual
twin; measurement evidence comes only from core. No live Meta, heuristic,
or asset conversion in M2.

## 7. Skipped optional skill extras (conflicts recorded)

User forbids paid actions and product redesign; M2 keeps the brief's scope.
Skipped but named: frontend greenfield lanes (Imagen concept drafts, Lazyweb
screens, StyleGallery pattern fetch, beui.dev interaction catalog, React
dev-tooling gate, Lighthouse-100 architecture audit, `/visual-qa`
dual-oracle gate, designpowers personas/critique/handoff lanes);
`ui-ux-pro-max` database search/persist (no network design-system fetch;
tokens above are hand-set for the console brief); Tier 2 `shadcn`,
`tailwind-design-system`, `premium-frontend-ui`, GSAP tiers (stack is
React+Vite+plain CSS+Three, no animation system needed); Tier 3
`industrial-brutalist-ui` / `minimalist-ui` (neither matches the operational
console; direction comes from the brief); `bundled:web3d` full pipeline
(form-before-effects rebuild, player-QA critic rounds, `check_page.py`
gates — kept: open-without-errors, true-shape racks, mm→m/Y-up contract,
reduced-motion, responsive canvas); paid image generation of any kind.
Preserved gates: keyboard/focus/contrast/reduced-motion, no color-only
signals, 1440+390 responsive, real Playwright browser tests, zero console/
page errors, sanitized evidence.
