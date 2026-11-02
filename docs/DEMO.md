# LayoutLab demo script (M6B)

A reproducible local walkthrough of the accepted reference UI on the synthetic
sample. It uses only deterministic local behavior (sample/manual/stub) plus the
honest live boundaries (setup-required, consent, no promised answer). There is
no demo video. The reviewed R1 preview is also available at
https://layoutlab.endpx.cloud with password/Basic Auth; external Edge checks
verified its sample/stub/GLB/export flow. Public Meta inference remains
unavailable until the persistent allowance guard is complete. Steps below
describe the local loopback walkthrough; see PUBLIC_DEPLOYMENT.md for the
public release and access boundary.

Start the native production server first (see
[LOCAL_RUNTIME.md](LOCAL_RUNTIME.md)):

```sh
npm ci
npm run build
npm start          # http://127.0.0.1:3001/
```

Reference captures of this UI live in `evidence/sanitized/`: `m6a-1440-reference.png`
(desktop), `m6a-390-reference.png` (mobile), `m6a-run-desktop-1440.png` (after a
stub run). Your live values must be read from the UI as you go — the numbers
below are the actual committed-sample values to expect, not inputs to type.

## 1. Load the sample: 36.8 m current

1. Open `http://127.0.0.1:3001/`. The header shows "no scenario".
2. Open the **Scenario** menu and click **Load sample**.
3. The scenario label reads `warehouse-basic`, `rev 0`, badge `VALID`.
4. The **Picking travel** metric card reads **36.8 m** — the deterministic
   weighted travel of the current assignment, computed by the shared core
   (36800 mm; hover the value for the exact millimeters).

The sample is declared synthetic: 4 fixed racks, 8 locations, 6 products,
3 order templates. Racks never move; planning only reassigns products to
locations. The 3D rack meshes are the converted NVIDIA asset (see
[ASSET_PROVENANCE.md](ASSET_PROVENANCE.md)); the 2D plan and all measurements
are evaluator geometry, independent of the visual mesh.

## 2. Demand: 3 templates, 7 weighted orders

The metric row reads **"3 order templates · 7 frequency-weighted orders"**:
O1 runs ×4, O2 ×2, O3 ×1. Travel is weighted by frequency (one visit per
distinct product per order); quantities report units but do not create extra
visits.

The warehouse panel's order dropdown (`O1 · Products sku-a, sku-c (×4)` and
siblings) selects which single order's route is drawn on the 2D/3D views.
That polyline is the route for the *selected* order only; the **Picking
travel** card is the *weighted total* across all templates. Do not present
one order's route length as the workload travel.

## 3. Manual edit: Current frame, revisions, invalid states

Assignment dropdowns edit the **Current** frame (manual edits live there; the
**Candidate** frame is read-only and only appears after a run with a selected
candidate).

1. Change `sku-b` to `L6`. The label bumps to `rev 1` and the travel metric
   updates — every edit re-evaluates immediately.
2. Try an invalid edit: move cold product `sku-f` to ambient slot `L1`. The
   badge turns `INVALID` with a compatibility note (class mismatch).
3. Restore `sku-f` to `L8` (`VALID`).

These edits change the live scene (after step 1 the current baseline is
35.6 m, not 36.8 m). The canonical run below starts from the pristine
sample, so reload it now: Scenario menu > **Load sample** (`rev 0` again).

## 4. Approve and run the stub (0 model requests)

The stub is deterministic and labeled **Stub (deterministic, no inference)**.
It is gated on explicit approval. Confirm the starting state first:
`warehouse-basic`, `rev 0`, **Maximum relocations** `4` (the default).

1. Click **Approve requirements** (approval state becomes `approved`).
2. Click **▶ Generate & test alternatives**. The run timeline appears with
   `model requests 0`.

Actual committed-sample outcome (read these from your run; they are stable
because the stub and heuristic are deterministic):

| Method | Picking travel | Note |
|---|---|---|
| Run baseline | 36.8 m | the approved current assignment |
| Heuristic | 29.8 m | `heuristic 15/32 evals`, budget `demand-greedy-swaps/1` |
| stub-1 | 35.6 m | valid alternative |
| stub-3 | 36.0 m | valid alternative |
| stub-2 | 51.2 m | valid but worse |
| **Overall selected** | **heuristic** | summary reads `Overall selected: heuristic (heuristic)` |

The method comparison table shows constraints, travel, relocations, and
improvement per method; budgets stay separate per method.

## 5. Compare, inspect, apply

1. Click **Show** on a candidate row (for example `heuristic`). The
   **Relocation list** shows its explicit product moves.
2. Switch the frame toggle between **Current** (editable manual assignment)
   and **Candidate** (read-only selected candidate). Overlays show both
   routes; the current assignment is unchanged until you apply.
3. Click **✓ Apply selected assignment** on a valid candidate. The message
   confirms (`Applied heuristic`), the revision bumps, and the run report
   becomes historical: a notice states the export still reflects the frozen
   run.

## 6. Stale handling (optional branch)

Skip the apply in section 5 and try this instead on a fresh run:

- Edit the scene after the run (for example move `sku-c`): the run baseline
  no longer matches the scene, so apply is rejected or disabled as stale.
  Candidates apply only to their compatible scenario revision, so a scene
  edit requires a fresh compatible re-run before any apply.
- Change the relocation budget after the run: approval drops to
  `not approved` and apply stays blocked until you re-approve and re-run,
  because candidates were validated against the old constraints.
- Note the contrast: applying (section 5) succeeds and *then* marks the run
  historical, while editing first blocks the apply as stale.

## 7. Export and replay (no new inference)

1. Click **Export run report** (or **Export current evaluation** when no run
   is active). The download is a versioned `layoutlab.m2export/1` envelope
   (`provider: "stub"`, `modelRequests: 0`).
2. Feed the same file back via Scenario > **Import/Replay**. The verdict
   reports **✓ matches saved measurements** — reproduction without inference.
   The same check runs from a terminal with no API key:
   `node scripts/verify-report.mjs <downloaded-report.json>` (measurement
   recomputation from embedded inputs; tampered totals fail).
3. A different envelope, the `m5failure/1` failure audit, appears only when a
   live run ends (failed, cancelled, or timed out) *before* requirements were
   approved: outcome/measurement null, zero proposals, and the explicit
   boundary **"No approved evaluation report exists for this run"**. Once
   requirements are approved and evaluation has run, the measured report
   remains available instead — cancellation does not rewrite an approved
   evaluation into a failure audit.

## 8. Live mode: consent first, no promised answer

Without a server key, `/api/status` reports `setup_required` and the
**Live (Meta model via server)** option reports the server is not ready —
that is the expected honest state, and the stub flow above is unaffected.

With a key configured (server-side `.env` only, never in the browser):

1. Select **Live**, read the model/status line, and — for `-contributor`
   model ids — the **Contributor model** training-data notice.
2. Tick **"I consent to sending this scenario and request to Meta Model API"**,
   enter a planning goal, and click **Interpret with Meta (1 request)**.
3. Review the interpreted requirements and questions, then approve or cancel.
   Each run is bounded (at most 3 proposals, 4 model requests, server
   deadline) and cancellable.

This script promises no particular Meta answer: model output varies, may be
invalid (retained as failed attempts), or may lose to the baseline — exactly
as the authorized smoke run showed (outcome `NO_IMPROVEMENT_FOUND`, baseline
retained; see [LIVE_SMOKE.md](LIVE_SMOKE.md)).

## 9. Views and viewports

- The **2D / 3D** tabs switch plan and mesh views; route overlays, zoom, and
  reset controls sit beside them. Location markers stay labeled development
  proxies.
- The layout is responsive: the same flow works at desktop 1440 and mobile
  390 widths (compare `m6a-1440-reference.png` with `m6a-390-reference.png`).

## Boundaries to state aloud

- Fixtures are synthetic; modeled travel is not a measured customer saving.
- The Conservative 2D clearance model is not a safety certification.
- Stub/heuristic outputs are not Meta inference. The separately recorded
  live benchmark completed 18 runs / 72 real requests with all failures
  retained; see EVALUATION.md. Fixture trials remain plumbing evidence.
- No warehouse savings, safety, optimality, or model-superiority claims.
