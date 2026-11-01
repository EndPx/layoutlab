# M0 — Environment, sources, Meta access, asset experiment

Date: 2026-11-01. Scope: M0 only (see `docs/MILESTONES.md`). No app scaffolding, no inference calls, no secrets in tracked files.

## 1. Command / version outcomes

| Tool | Observed |
|---|---|
| OS | Windows 10.0.26200 (win32 x64) |
| Node | v24.18.0 |
| npm | 11.8.0 |
| pnpm | 10.21.0 |
| npx | 11.8.0 |
| Git | 2.42.0.windows.2 |
| Python | 3.12.10 (scratch inspection only, TEMP venv, removed after use) |
| curl.exe | 8.21.0 |
| tsc (global) | not installed — TypeScript arrives per-project at M1 |
| usd-core (scratch) | 26.11, pip install in TEMP venv for bounds inspection only |

Reproduce: `node scripts/m0-env.mjs` (versions + URL reachability, exit 0, no secrets).

## 2. Official sources — observed access

Exactly the 14 URLs listed in `evidence/sanitized/m0.json` returned HTTP 200 on 2026-11-01:

- Meta: hackathon event, API overview, quickstart, protocols, models, pricing/rate limits.
- SimReady: HF Space `nvidia/simready-central`, Omniverse SimReady docs, dataset `nvidia/simready-assets`, `NVIDIA/simready-foundation`, HF download guide, OpenUSD linear-units group, CC-BY-4.0 deed.
- npm registry (`registry.npmjs.org/typescript/latest`).

Not fetched: brief §8 frontend/backend doc pages (React, Vite, Express, Zod, Vitest, Playwright, pnpm, Tailwind, R3F, three.js). Stack versions in §5 came from the npm registry, not those doc pages. No claim is made about unfetched pages.

Verified Meta facts (read from the pages above, not assumed):

- Base URL `https://api.meta.ai/v1`, key in `MODEL_API_KEY`, `Authorization: Bearer`.
- Key source: Model API dashboard → API keys → Create API key.
- Recommended model for new work: `muse-spark-1.3` (1M-token context, structured output, tool calling); older `muse-spark-1.2/1.1` exist; `-contributor` variants are discounted in exchange for training-data use.
- Protocols: Responses, Chat Completions (OpenAI-compatible), Messages (Anthropic-compatible).
- Pricing is pay-as-you-go (Spark 1.3 Standard: $1.25/$4.25 per 1M input/output tokens); no free-access tier found on the pricing page. Contributor mode is discounted, not free.

## 3. Meta live status: endpoint live, inference BLOCKED

Read-only check `node scripts/m0-meta.mjs` (no key sent, no inference):

- `GET https://api.meta.ai/v1/models` → HTTP 401 `{"code":"invalid_api_key","type":"authentication_error"}` (~1.6 s). Proves the endpoint is live and requires a key.
- `MODEL_API_KEY` (and `META_API_KEY`) ABSENT in this environment at M0 run time.
- Coordinator update: a runtime key exists and the user will populate local `.env` later. Key contents were never read or printed.

Live-smoke blockers (explicit): (1) no `MODEL_API_KEY` in this environment yet; (2) no free-access confirmation — all usage is pay-as-you-go per the pricing page, so even a smoke call needs funded-key + spend authorization. Muse coding access is not application runtime Meta evidence.

## 4. Rack asset feasibility experiment (revision-pinned, genuine)

Coordinator note: the dataset card links `rack_large_empty_a02`; this experiment uses discovered equivalent `rack_large_empty_a01` (same family, identical layout verified for `a02`). `a02` remains the M4 default candidate.

- Dataset: `nvidia/simready-assets`, pinned revision `4763fbfaa4f8e97658e68b57d01b4c86659e08b5` (from dataset API `sha`, 2026-11-01).
- Package: `rack_large_empty_a01` — "rack with shelves" (Wikidata Q2637814), asset type `prop`, profile `Prop-Robotics-Neutral`, 78 BOM files, 59,167,145 bytes total.
- License: `CC-BY-4.0` (dataset tag `license:cc-by-4.0`, `packaging.json`, full text in `.metadata/LICENSE.txt`). Attribution required at M4.
- Root: `simready_usd/sm_rack_large_empty_a01_01.usd` (binary USDC crate, 25,823 bytes, SHA-256 matches BOM).
- Downloaded (pinned, each ≤ 100 KB, in `assets/m0-experiment/rack_large_empty_a01/`): LICENSE, conformance + BOM + root_usds + packaging JSON, root crate, `base.usda`, `instances.usda`, `materials.usda`, `Physics/physics.usda`. Reproduce: `node scripts/m0-asset-fetch.mjs`.
- Extra for bounds only (TEMP, not tracked): `payloads/geometries.usd` 3,297,376 bytes, SHA-256 matches BOM.
- Units/axes (observed via usd-core 26.11, not assumed): `metersPerUnit = 1.0`, `upAxis = "Z"`. Brief canonical model is Y-up — conversion must rotate Z-up → Y-up.
- Transforms: no `xformOp`s on `/RootNode` or the mesh prim → identity, so transformed bounds = authored bounds.
- World bounds (aligned, default prim): min (−2.000, −1.033, 0.000) m, max (2.000, 1.033, 3.010) m → footprint ≈ 4.00 × 2.07 m, height ≈ 3.01 m, base at z = 0. Mass ≈ 1170.5 (physics payload), center of mass z ≈ 1.43 m.
- Dependencies: `instances.usda` → `geometries.usd` + `materials.usda`; materials → UDIM PNG textures (`T_Rack_A1_{Albedo,ORM,Normal}.<UDIM>.png`) + `source_assets/OmniPBR.mdl`; physics variants (MuJoCo/Newton/PhysX `enabled/disabled.usda`) selectable. Textures/MDL were NOT downloaded (not needed for bounds; out of M0 bound).
- Validation caveat (observed in file): embedded `Robotics-Prop 3.1.0` feature validation shows several `passed = 0` entries (NP.008, AA.001, RB.MB.001, GSP.001, VM.MDL.001); runtime PhysX drop/stability tests passed. Package-level conformance (`Package 1.0.0`, FET_030/032) passed.
- Conversion feasibility: meters + identity transform + ground-based origin are favorable. Blockers recorded for M4 (not attempted): no USD→glTF/GLB conversion done; materials are MDL (`OmniPBR.mdl`, VM.MDL.001 unpassed) so a browser path needs MDL→UsdPreviewSurface/glTF mapping or re-texturing; Z-up→Y-up mapping + footprint mapping to canonical mm model still to do. No integration is claimed — nothing is loaded in any app.

Catalog search (reproduce: `node scripts/m0-simready-find.mjs …`): full top-level listing is 2,679 packages (27 pages, complete); alternative rack/shelf candidates recorded in `m0.json` (`rack_bulk_storage_a03`, `rack_h3m_s01/s02`, `storageSystem_rack_heavyDuty_*`, `storage_shelf_basic_*`, `rack_composition_*`).

## 5. Minimal proposed native TypeScript stack (observed 2026-11-01, npm `latest`)

typescript 7.0.2 · react+react-dom 19.3.1 · vite 8.3.5 · three 0.187.0 · @react-three/fiber 9.8.2 (optional) · express 5.3.0 · zod 4.6.7 · vitest 5.0.5 · playwright 1.64.1 · openai 7.47.0 (Meta-compatible provider SDK) · tailwindcss 4.3.3 (optional) · @types/node 26.6.6. Node 24 satisfies every `engines` field. Nothing installed. Risk: TS 7 / Vite 8 / Express 5 / Zod 4 are new major lines — M1 pins exact versions after a compat check; do not float `latest`.

## 6. Files changed (M0)

- `docs/M0_ENVIRONMENT.md` (this report), `evidence/sanitized/m0.json`, `.env.example` (server-only key names + run limits, no values).
- `scripts/m0-env.mjs`, `scripts/m0-meta.mjs`, `scripts/m0-simready.mjs`, `scripts/m0-simready-find.mjs`, `scripts/m0-asset-fetch.mjs` (native Node, assert-based, read-only, no secrets) + `scripts/m0-usd-bounds.py` (reproducible scratch bounds inspection; raw output in `m0.json` → `boundsRaw`).
- `assets/m0-experiment/rack_large_empty_a01/` (10 pinned files + fetch manifest).

## 7. Limitations / blockers / next gate

- Live Meta smoke: BLOCKED (key not in env yet + pay-as-you-go needs spend authorization). Unblocks: user populates `.env`, coordinator authorizes one bounded smoke call.
- Full-package download (59 MB, textures) and USD→browser conversion: deferred to M4 with blockers above.
- Bounds warnings (non-fatal): physics-variant payload layers were absent from the scratch stage; geometry bounds unaffected.
- Next gate: M1 deterministic core (schemas, validation, routing, objective) — needs no credentials; coordinator notes `docs/INDEPENDENT_REVIEW_CASES.md` oracles are ready for it.

What was skipped: broad multi-asset comparison (per coordinator, bounded to one experiment); texture/MDL download; any USD→glTF attempt. Risk: pinned HF revision drifts from `main` over time — M4 must re-pin or re-verify hashes.
