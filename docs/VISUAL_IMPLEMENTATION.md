# M6A visual implementation report (resume corrections final)

## Result

All three blocking review corrections from the paused dispatch are
implemented on top of the preserved first-pass M6A work, plus the second
inbox round (true 2D label packing for the 12-location benchmark, 3D
route visibility, configuration-truth wording). At the 1586x1007 primary
viewport in the reference state (sample -> approve -> stub -> heuristic
selected -> O2, default 3D): workspace panels 561/577/576px, comparison
heading at y=810, whole page 1147px (target <=1150 with the actual third
proposal row). Labels: 13/13 sample chips and 17/17 benchmark chips with
zero actual-DOM-rectangle overlap at 1586/1440/768/390. Fixture runs are
labeled FIXTURE (never raw LIVE); header validity names the presented
frame. Core 110, API 68, browser 76 (desktop+mobile) pass; typecheck and
production build clean; zero console/page errors. No paid inference, no
deploy, no push (coordinator owns commits).

## Main files

- `DESIGN.md` — updated BEFORE UI edits: density budget, Scenario menu,
  Developer-settings contents, compact history/run-details disclosures,
  mode-badge provenance derivation, presented-frame validity, 2D greedy
  label packing + leader contract, keyboard camera, route-overlay
  treatment, fixture/Meta configuration wording.
- `apps/web/src/App.tsx` — Scenario `<details>` menu (same testids and
  handlers, closes on pick, overlays content); mode badge derived from
  ACTIVE run provenance (`FIXTURE` for fixture runs, `LIVE` only for
  official Meta with realMetaRequests>0); `LIVE-USED`/`FIXTURE` badges
  scoped to the active live run (no bleed into later stub/replay);
  header validity tracks the presented frame with a naming `title`.
  Controller and network semantics untouched.
- `apps/web/src/components/RightPanel.tsx` — provider radio + setup +
  diagnostics + display-only goal moved into default-collapsed
  Developer settings; one concise stub note; locked products in a
  count-summary disclosure; approval banner-only once approved;
  run-status line superseded by the outcome line on completion;
  compact numbered history rows with expandable rationale/diagnostics;
  heuristic as a separate expandable row. Live-status wording:
  `Fixture ready — local loopback configured (0 real Meta)…`,
  `Meta ready — configured, not used…`, `Meta ready — USED by this
  run…`. All gating logic, budgets, consent, and diagnostics preserved.
- `apps/web/src/components/LeftPanel.tsx` — compact product rows
  (id + label, badges on a second line only when present), shortened
  single-line hints, Orders in a counts-summary disclosure.
- `apps/web/src/components/WarehousePanel.tsx` — redundant view
  headings removed (segmented control already labels); structure kept.
- `apps/web/src/components/BottomPanel.tsx` — compute budgets +
  relocation list in one collapsed Run details disclosure sharing a row
  with Apply-selected (reference puts apply bottom-right); attribution
  summary stays visible.
- `apps/web/src/components/ThreeView.tsx` — true 2D greedy chip packing
  (first-fit candidate cells, deterministic order), thin leader lines
  from projected canonical anchors to displaced chips, taller narrow
  canvases (300px under 520px wide; desktop keeps the 400px clamp),
  `data-label-overlap`/`data-label-count` instrumentation, keyboard
  camera pan via installed `OrbitControls.listenToKeyEvents` with
  `data-cam`, slightly overhead default camera, route-overlay treatment
  (`depthTest` off, high `renderOrder`) on the genuine core polylines.
  Scale/yaw/bbox/GLB-fallback contracts unchanged.
- `apps/web/src/styles.css` — menu dropdown, disclosure styling,
  compact rows/tables, density spacing (readable 12-14px text kept).
- `apps/web/e2e/helpers/ui.ts` (new) — `clickOpen`/`openDetails`
  helpers that open real disclosures before acting.
- `apps/web/e2e/m6a-reference.spec.ts` — 13 tests: existing 11 plus
  FIXTURE-not-LIVE + no-bleed + frame-title regression and the
  1586x1007 density/label/keyboard regression.
- Adapted `m2-flow`, `m2-boundary`, `m3-live-fixture`,
  `m4-heuristic-asset`, `m5-failure` specs — disclosure helpers,
  run-details opening, `FIXTURE` mode badge, `Fixture ready` wording.
  No assertion removed; one visibility assertion retargeted to the
  Scenario menu entry (same recovery intent).
- `.gitattributes` + `apps/api/src/benchmark.ts` + `apps/api/test/m5.test.ts`
  — preserved from the first pass (fixture byte guard, execution-commit
  metadata with independent git oracle). Untouched this round.

## Commands and results

- `npm run typecheck` (root, all 3 workspaces) — clean.
- `npm test --workspace @layoutlab/core` — 110 passed.
- `npm test --workspace @layoutlab/api` — 68 passed.
- `npm run build --workspace @layoutlab/web` — clean; JS 1080 KB
  (gzip 290 KB), CSS 14 KB. The >500 KB chunk warning is the
  pre-existing three.js weight; no code-split change (minimal scope).
- `npx playwright test` (apps/web, desktop 1440 + mobile 390) —
  76 passed, 0 failed, 0 skipped in the final existing suite; temporary capture cases excluded.
- `node .coordination/review-m6-ui.mjs` (coordinator script, unmodified)
  — PASS all 4 widths incl. stale frozen metrics, O2 collision/length,
  canonical coordinates, GLB hash, 20 valid assignments via
  independent BFS. Its geometry: 1586 left 561 / warehouse 577 /
  right 576, comparison y 810; no overflow at any width.
- `node .coordination/review-m6-fixture-status.mjs` (unmodified) —
  before MANUAL, after FIXTURE, 4 localhost requests, 0 real Meta,
  LIVE-USED absent.
- `node .coordination/review-m6-labels.mjs` (unmodified) — sample 13
  chips pass all 4 widths; with
  `LAYOUTLAB_LABEL_SCENARIO=fixtures/benchmark/bm-02-copick-cluster.json`
  benchmark 17 chips pass all 4 widths. Actual DOM rectangles, zero
  overlap, none outside, no page errors.
- Evidence capture (real Chromium, dev server): zero console/page
  errors; `scrollWidth == viewport` at 1586/1440/768/390; GLB HTTP 200
  sha256 `571cc601…ae9ea`; `data-asset=simready-glb`, 4 racks, bbox
  `0.5,0,1.1:2.1,2,1.9`; O2 current 81 pts vs candidate 47 pts (real
  differing polylines); 8 canonical 2D markers; keyboard pan verified
  via `data-cam` change.
- Contrast from live computed tokens (white bg): ink 15.28, muted
  6.36, accent 6.28, white-on-accent 6.28, valid 5.95, invalid 6.57,
  warn 5.93, info 9.88. All >= 4.5. Reduced-motion query present;
  21 key controls keyboard-reachable (recorded in verification JSON).
- Lighthouse unavailable (not installed; no new dependencies per
  minimal scope) — no Lighthouse scores claimed. No
  react-grab/react-scan/react-doctor installs; `tsc` + real Playwright
  behavior gates cover this milestone instead.

## Visual differences vs the reference (all intentional)

- Values are actual state: baseline 36.8 m, 3/3 templates with 7
  weighted orders, heuristic 29.8 m / 2 relocations / 19.0% (not the
  illustrative 28.4 m, 12 orders, 22.8%).
- No warehouse photograph: real SimReady GLB scene + canonical 2D
  plan; the photo was style/composition only.
- Comparison has 6 rows (baseline + heuristic + 3 actual attempts) vs
  the reference's 4, with per-row Show/Apply (all attempts selectable;
  apply guarded) plus Apply-selected.
- Right column carries the real planning workflow the reference
  sketches: locks disclosure, approval gate, run status/outcome,
  heuristic row, third attempt, Developer settings. Default-collapsed
  disclosures keep the reference density without hiding anything.
- 3D route overlays render on top (depth-tested off) so both genuine
  floor polylines stay followable past racks; coordinates unchanged,
  2D plan is the occlusion-free authority. Short segments pass under
  label chips, which stay readable via packing + leaders.

## Review findings addressed (all inbox batches ACKed)

Round 1 (resume task):
1. Density via genuine disclosures (menu, dev settings, locks,
   history, orders, run details); comparison y=810, page 1147.
2. Status truth: provenance-derived mode badge, active-run-scoped
   LIVE-USED/FIXTURE, presented-frame validity.
3. Readable canonical labels with leaders; keyboard camera kept.
Round 2 (6 + 1 messages):
4. Overlap-predicate typo fixed (`b.top < a.bottom - 1`); counter now
   matches the independent DOM-rect checker on all cases.
5. Label packing rewritten as true 2D greedy placement after the
   390px benchmark case failed with 10 actual collisions; narrow
   canvases get 300px height. Sample 13 + benchmark 17 pass all
   widths by actual rectangles (not just the counter).
6. 3D routes: overhead-leaning camera (same azimuth) + on-top
   overlay treatment; coordinates/geometry untouched.
7. Status wording: `Fixture ready (0 real Meta)…`, `Meta
   configured, not used…`, `Meta USED by this run…`; repo tests
   adapted, readiness gates unchanged.
8. `btn-sample` visibility failure: assertion retargeted to the
   Scenario menu entry with the same recovery intent, then the real
   menu is opened (helper); full suite green, no skips.

## Skill workflow notes

- Tier 1 (`ui-ux-pro-max`, `frontend`, `frontend-design`) +
  `web-frontend-suite` orchestration; `layout-skill.md`,
  `stylegallery.md`, `perfection/README.md`,
  `designpowers/lane-c-review.md` applied (scroll ownership, honest
  real-browser QA, artifacts-first critique).
- `references/design/image-to-code-skill.md` absent locally (verified
  earlier) — direct reference extraction used; no skill commands
  invented. StyleGallery holy-grail: link + restated structure only.
- `bundled:visual-coding` -> `bundled:web3d`, whose scope excludes
  changes inside an existing multi-file framework project (confirmed
  in its body); the existing viewer was extended with installed
  three addons only, API technique from the `threejs` plugin hub
  (verified against installed three 0.187.0 sources).

## Evidence produced (all new/updated, `evidence/sanitized/`)

`m6a-1586-reference.png` (viewport), `m6a-1586-reference-full.png`,
`m6a-1586-reference-2d.png`, `m6a-1440-reference.png`,
`m6a-768-reference.png`, `m6a-390-reference.png`,
`m6a-390-reference-2d.png`, `m6a-1440-invalid.png`,
`m6a-1440-stale.png`, `m6a-1440-history-settings.png`,
`m6a-shell-{desktop-1440,mobile-390}[-2d,-3d].png`,
`m6a-run-{desktop-1440,mobile-390}[-3d].png`,
`m6a-live-{desktop-1440,mobile-390}.png`,
`m6a-verification.json` (geometry/overflow/GLB/routes/labels/cards/
contrast/keyboard machine record). No historical evidence touched.

## Round 3 corrections (coordinator review checkpoint)

Two bounded fixes, no other source changes:

1. Subpixel label packing (`ThreeView.tsx`): chip size now measured
   with `getBoundingClientRect` ceil + 4px padding instead of integer
   `offsetWidth`, and the packer rejects any positive overlap (strict
   gap, no 1px tolerance) at all three predicate sites. Coordinator
   independently re-ran sample-13 and benchmark-17 DOM-rect checks at
   1586/1440/768/390: all pass, no overlap/outside.
2. Product identity hierarchy (`LeftPanel.tsx`, `styles.css`): label
   leads semibold (`Product A`), SKU secondary muted mono; identity
   swatch is a stable per-product palette color indexed by scenario
   order (filter-proof), independent of demand-bucket colors, which
   stay in the demand pill. Row heights unchanged; invalid/compat
   diagnostics and keyboard/manual-edit controls untouched.
   Coordinator accepted product hierarchy/colors and desktop
   composition; no further visual requests.

Final evidence packaging moved to the coordinator
(`m6-independent-review.json`, `m6-stub-report.json`, primary
reference screenshots from `.coordination/m6-independent-*-3d.png`
plus invalid captures). Worker scratch capture spec removed; no
scratch specs remain in `apps/web/e2e/`.

## Final gates (exact commands, 2026-11-02)

- `npm run typecheck` (root, all workspaces): clean, exit 0.
- `npm run build --workspace @layoutlab/web`: clean, exit 0
  (pre-existing >500KB three.js chunk warning, no split per scope).
- `npm test --workspace @layoutlab/core`: 110 passed.
- `npm test --workspace @layoutlab/api`: 68 passed.
- `npx playwright test` (apps/web, existing 6 spec files,
  desktop+mobile): 76 passed, 0 failed, 0 skipped.
- `node .coordination/review-m6-labels.mjs` sample + benchmark
  (`LAYOUTLAB_LABEL_SCENARIO=fixtures/benchmark/bm-02-copick-cluster.json`):
  PASS 13 and 17 rectangles at all 4 widths (worker re-ran after the
  packing fix; coordinator independently confirmed).

QA server processes are transient; do not reuse historical PIDs. The coordinator final suite used Playwright-managed Vite. Start a fresh server with `npm run dev` when needed.

## Blockers

None. Coordinator owns commits/pushes. Port 3001 was only bound
transiently by fixture harnesses during tests.

## Next gate

M6B (native production start, README/demo/evidence consistency,
fresh Windows checkout) and the 18-trial live benchmark remain
explicitly out of scope and were not started. Suggested coordinator
checks: review diff, re-run `review-m6-ui.mjs`,
`review-m6-fixture-status.mjs`, `review-m6-labels.mjs` (sample +
`LAYOUTLAB_LABEL_SCENARIO=fixtures/benchmark/bm-02-copick-cluster.json`),
then commit/push the reviewed UI milestone.

## Coordinator acceptance

Accepted after diff review, actual browser captures, independent BFS measurements and actual DOM-rectangle checks. The coordinator re-executed `npm run test:e2e`: 76 passed, 0 failed, 0 skipped; the report argv contains a real test execution, not `--list`. Sanitized test results are in `evidence/sanitized/m6-browser-gates.json`. Independent review and a replayable five-valid-assignment stub report are preserved separately. The neutral asset appearance and synthetic workload are explicit; neither this UI gate nor green fixture tests establish live benchmark completion or public deployment.
