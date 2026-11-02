# M6B local native readiness (implementation report)

Result: one native production start serves the built planner and the API on a
single loopback origin; README/demo/runtime docs agree with actual behavior and
evidence; the failure-audit wording is corrected to the approved-report
boundary. No evaluator, schema, version, fixture, or UI behavior changes.

## What changed

- `apps/api/src/server.ts`: `createApp` accepts a module-relative `webDir` and
  serves only that directory via Express static (`index.html`, dotfiles
  denied, explicit `model/gltf-binary` for `.glb`). Unknown `/api/*` routes
  return JSON 404; every other miss is a JSON 404 — there is deliberately no
  shell fallback (the planner has no client router). Without a web build the
  API still serves all `/api` routes and answers `GET /` with a 503 + setup
  guidance (`WEB_BUILD_GUIDANCE`); `hasWebBuild` requires `index.html`.
- `apps/api/src/index.ts`: resolves the project root and `apps/web/dist`
  relative to the server module (cwd-independent), logs `"web":"built"` or
  `"missing"` plus stderr guidance when missing. No inference on startup;
  no key material in logs.
- `package.json` + `package-lock.json` (root metadata only): new `start`
  script (`npm run start --workspace @layoutlab/api`); `engines` corrected
  from `>=20` to `^22.12.0 || ^24.0.0 || >=26.0.0`, the installed Vitest
  5.0.5 floor (Vite 8.3.5 needs `^20.19.0 || >=22.12.0`). No dependency
  upgrades. Tested runtime: Node v24.18.0, npm 11.8.0.
- `packages/core/src/failure.ts` (+ `apps/web/src/lib/export.ts` comment):
  `FAILURE_NO_EVALUATION` now reads "No approved evaluation report exists
  for this run … no approved baseline …", since an unapproved baseline
  preview can exist. Wording only; envelopes, schema, and versions unchanged.
- Matching copy assertions: `packages/core/test/failure.test.ts`,
  `apps/api/test/m5.test.ts`, `apps/web/e2e/m5-failure.spec.ts`.
- New `apps/api/test/native-start.test.ts` (7 tests, fixture web roots, no
  web build required): root HTML + exact asset bytes, pinned GLB MIME/hash
  (`571cc601…f8f8ae9ea`, 3176476 bytes), 404 for every miss, JSON 404 for
  unknown `/api`, setup_required with an explicit empty key, zero fetch calls
  across startup/serving, dotfile/traversal non-disclosure, API-only 503
  guidance with and without a `webDir`.
- Docs: `README.md` (rewritten: status, starts, Node floor, env, modes,
  checks, exact evidence links, smoke outcome, boundaries),
  `docs/LOCAL_RUNTIME.md` (new: dev/prod, serving boundaries, env template,
  contributor disclosure, checks), `docs/DEMO.md` (new: reproducible script
  with actual sample values read live from the UI — 36.8 m baseline,
  29.8 m heuristic at 15/32 evals, stub 35.6/36.0/51.2 m, best heuristic —
  actual button labels, sample reload before the canonical run, candidate
  read-only vs Current, approval/stale, export/replay, pre-approval-only
  failure-audit boundary, no promised Meta answer).

Coordinator review applied during this dispatch: extensionless shell fallback
removed with its test/docs behavior; DEMO state sequence (B→L6 leaves 35.6 m,
so reload + budget 4 first), actual labels, and the cancellation boundary
corrected.

## Commands and results (this dispatch, Windows, Node v24.18.0)

- `npm run typecheck` — clean (core + api + web).
- `npm run build` — clean (core + api + web; Vite chunk-size advisory only).
- `npm test --workspace @layoutlab/core` — 110 passed.
- `npm test --workspace @layoutlab/api` — 75 passed (68 existing + 7 new).
- `npm run test:e2e` — full suite once: **76 passed, 0 failed/skipped** (4.6 m,
  desktop 1440 + mobile 390; dev servers auto-started/stopped by Playwright).
  No `--list` run afterward (report artifact preserved).
- Production HTTP spot-checks before the coordinator took over smoke
  (owned terminal, since closed): `/` 200 HTML shell, `/api/status` shape
  with budgets and no key material, `/api/nope` 404 JSON
  `UNKNOWN_API_ROUTE`, GLB `model/gltf-binary` + manifest hash/bytes over
  HTTP. The coordinator owns the authoritative production and fresh-checkout
  keyless verification.

## Findings

- The worker PowerShell launch dropped an explicitly empty variable, allowing the root .env loader to supply its configured value. An independent Node child-process probe verified that Node itself can preserve an explicitly empty environment entry; no general Windows/Node limitation is claimed. A discarded worker probe temporarily renamed .env and restored it; the coordinator verified the file was present afterwards and prohibited further secret-file manipulation. Keyless entrypoint verification is assigned to an isolated checkout without .env.
- A keyless sandbox attempt failed on an unsupported PowerShell
  `Start-Process -Environment` flag; its temp directory was removed. No
  further server experiments were run after the coordinator took ownership.

## Servers and cleanup

No LayoutLab server is running: nothing listens on 127.0.0.1:5173 or
127.0.0.1:3001. Created terminals: `term_4f7ed8fe-…` (closed by worker) and
`term_f96bf439-…` (closed by coordinator, Windows PID 8400). Nothing left for
cleanup; many unrelated `node` processes belong to Orca/user sessions and were
not touched.

## Blockers and next gate

- No M6B code blocker remains.
- Coordinator-owned next: fresh committed Windows checkout verification
  (`autocrlf=true`, `npm ci`/`build`/`start`, frozen fixture hashes, no key).
  Actual production HTTP/browser smoke already passed independently; the
  code checkpoint is committed before the clean checkout gate.
- Still separately gated: actual 18-trial live benchmark (no new paid
  authorization; the US$0.10 smoke is consumed) and any public deployment.

## Coordinator code review

The native HTTP and built-browser smoke passed independently at 1440/390: root HTML, exact GLB MIME/hash, missing resource and unknown API responses, private/source path denial, manual/stub/apply/export/replay, ten independently checked valid assignments, no page errors or overflow, and zero inference POSTs. This root-workspace smoke is not the keyless proof. The accepted M6A image bytes were restored after routine browser-test recaptures; application UI layout is unchanged. The remaining local gate is a fresh committed Windows checkout with npm ci/build/start, frozen byte hashes and missing-key setup_required.
