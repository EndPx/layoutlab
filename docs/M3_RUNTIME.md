# M3 — Server-side Meta runtime + live browser mode (report)

Status: implemented, all gates green in this dispatch. Fixture evidence only:
**live Meta inference was not performed, not authorized, and is not claimed.**
No heuristic (M4), no real-asset conversion, no deployment.

## 1. Result

A native Node/Express TypeScript API (`apps/api`) owns Meta interpretation,
constraint approval, bounded proposals, and evaluator feedback. One user
request begins one run: interpretation consumes the first model request and
returns a run ID promptly (202, async), the user reviews/edits/resolves the
normalized constraints, then approval continues the SAME run (ID, request
count, deadline preserved) for at most three proposals — maximum FOUR total
model requests including retries/repair/interpretation. The browser
(`apps/web`) keeps the existing stub flow untouched and adds a clearly labeled
live mode: privacy statement, explicit consent, contributor data-use
disclosure, server-driven timeline, and verbatim server-report export with
deterministic core replay.

Honest fixture numbers (sample `warehouse-basic` rev 0, budget 4, local fake
transport): baseline 36800 mm; proposal-1 (sku-b→L6) 35600,
proposal-2 unknown-ref invalid retained, proposal-3 (sku-d→L6) 36000; best
proposal-1 (IMPROVED_VALID_ASSIGNMENT, +3.26%), 4/4 requests, 3/3 proposals,
replay matches. Full record: `evidence/sanitized/m3-evidence.json`
(providerKind `fixture`, realMetaRequests 0, transportRequestCount 4).

## 2. Principal files

- `apps/api/package.json`, `tsconfig.json`, `tsconfig.build.json` — workspace,
  exact pins (express 5.3.0, zod 4.6.7, typescript 7.0.2, vitest 5.0.5).
- `apps/api/src/`: `config.ts` (env, brief-cap clamping, loopback fixture
  classification, .env loader, sanitizer), `prompts.ts` (prompt
  `layoutlab.m3prompt/1`, developer instructions, strict JSON schemas,
  bounded summaries + feedback), `provider.ts` (native fetch Chat
  Completions, retries disabled, streaming byte cap), `runs.ts` (run store,
  async interpretation, approval gate, proposal loop, report), `server.ts`
  (Express routes, split rate limiters, sanitized errors), `index.ts`
  (loopback entry, loads root .env, no startup inference).
- `apps/api/test/`: `fake-meta.ts` (local fake transport),
  `api.test.ts` (31 tests).
- `apps/web/src/lib/api.ts` (same-origin adapter, no key, no Meta traffic),
  `lib/export.ts` (M3 envelope `layoutlab.m3report/1` + strict replay),
  `App.tsx` (live session state, polling, sequence guards), `RightPanel.tsx`
  (provider selector, privacy/consent, unresolved gate, timelines),
  `BottomPanel.tsx` (provider-labeled comparison), `styles.css` (LIVE badge),
  `vite.config.ts` (`/api` proxy to 127.0.0.1:3001).
- `apps/web/e2e/`: `m3-live-fixture.spec.ts` (7 tests × desktop/mobile),
  `helpers/live-fixture.ts` (fake + real API harness).
- `scripts/m3-evidence.mjs` (reproducible evidence generator),
  `evidence/sanitized/m3-evidence.json`, `m3-desktop-1440-live.png`,
  `m3-mobile-390-live.png`.
- `package.json`, `apps/*/package.json` (prebuild/prepare wiring),
  `.env.example` (contributor note, API host/port), `README.md` (start cmds).

## 3. Meta protocol (verified from official sources)

- `https://dev.meta.ai/docs/protocols/chat-completions`: Chat Completions
  endpoint, `developer` role preferred, `max_completion_tokens` bounds output
  (`max_output_tokens` rejected), `temperature`/`top_p` left at defaults.
- `https://dev.meta.ai/docs/structured-output`: `response_format` with
  `type: "json_schema"` and `json_schema: { name, schema, strict }`;
  constrained decoding, still independently validated client-side.
- `https://dev.meta.ai/docs/tool-calling`: `tools`/`tool_choice` exist but
  M3 sends neither (no arbitrary tools, no hidden-reasoning requests).
- Base `https://api.meta.ai/v1`, `Authorization: Bearer MODEL_API_KEY`
  (server only). Default model `muse-spark-1.3`; the configured account
  model `muse-spark-1.3-contributor` is honored from server env (verified
  via GET /status only: model id shown, key never read or printed).
- Every model output is parsed against strict core Zod schemas
  (`PlanningRequirements`, `AssignmentProposal`); constrained decoding is
  never trusted blindly.

## 4. Run lifecycle

States: `INTERPRETING → AWAITING_APPROVAL → RUNNING → COMPLETED`, plus
`FAILED`, `CANCELLED`, `TIMED_OUT`. Phases (brief §22, heuristic pending
M4): `VALIDATING_INPUT`, `INTERPRETING`, `AWAITING_APPROVAL`,
`EVALUATING_BASELINE`, `REQUESTING_PROPOSAL`, `VALIDATING_PROPOSAL`,
`EVALUATING_PROPOSAL`, `FINALIZING`, with a bounded phase history.

- POST /api/runs validates (scenario, 1..2000-char request, `mode: "live"`,
  `consent: true`), freezes the scenario, arms the deadline, and returns
  202 with the run ID immediately; interpretation runs bounded async so the
  FIRST request is cancellable by ID. Missing key returns 503
  `setup_required`, never fake output.
- Approval requires the interpreted questions to be explicitly resolved:
  interpreted `unresolvedQuestions` are shown in the UI with per-question
  resolve controls, and approve rejects non-empty lists with
  `UNRESOLVED_QUESTIONS` (no new inference). Unknown lock refs are rejected
  the same way. The original interpreted questions stay in
  `interpretedUnresolved` for provenance.
- Approval is single-flight: the state transition to RUNNING happens in one
  synchronous section, so a concurrent double approve yields one 200 and one
  409 with a single proposal loop (tested).
- Every proposal reapplies to the original frozen baseline via core
  `applyProposal`; geometry/order data cannot be overridden (strict schemas
  reject unsupported fields). Stale revisions and unknown refs become
  retained invalid attempts with structured feedback to later proposals.
- Reports embed provider/model/prompt, run ID/times, snapshot, requirements,
  routes, feedback, candidates, request/proposal counts, timings, actual
  usage, state/outcome/budgets/limitations. Export downloads the verbatim
  server report; replay recomputes via core with zero inference.

## 5. Budgets and bounds (brief caps win)

| Limit | Value | Behavior |
|---|---|---|
| Proposals/run | ≤ 3 | loop stops; env can only lower |
| Model requests/run | ≤ 4 | counted BEFORE sending; parse/timeout/oversize attempts consume budget; 0 automatic retries |
| Deadline | ≤ 120000 ms | server timer + shared AbortController; env can only lower |
| Output tokens | `max_completion_tokens` 2000 | per request |
| Response bytes | 65536 | streaming cumulative BYTE cap; reader cancelled on overflow |
| Prompt context | 20000 chars summary + bound | oversize refuses inference |
| Concurrency | 1 (default) | second inference start gets 429, slot released in `finally` |
| Inference rate | 60/min/IP | POST /runs + approve only; deterministic hard-capped map |
| Safe reads/cancel | 300+/min/IP | separate allowance; polling can never starve cancel |
| Body | 1 MB | 413 beyond |
| Run retention | 50 | oldest terminal evicted; active runs never evicted |

## 6. Cancellation, deadline, terminal guards

- One AbortController per run is shared by every transport call; server
  cancel aborts in-flight fetch (not just UI) and the run stays CANCELLED.
- A post-await guard runs after EVERY transport outcome, success included:
  a late success after cancel/deadline is discarded — no draft written, no
  candidate appended, no further calls. Terminal states never transition.
- The deadline keeps running during approval (documented): expiry then
  preserves budgets (requests 1, proposals 0) and later approve gets 408
  `RUN_EXPIRED`. Cancellation can never be reclassified completed.
- Browser: sequence guards on interpret/generate/cancel plus abort; stale
  results after reset/load/new run commit nothing; reset/load best-effort
  cancels the known server run. Only actual COMPLETED runs can apply;
  FAILED/TIMED_OUT candidates stay inspectable with apply disabled.

## 7. Provider, usage, sanitization

- Small replaceable `chatCompletionJson` over native fetch; exactly one
  fetch per call; transport errors (non-200/network) end the run as FAILED
  without blind retries, while bad structured output (parse/oversize/invalid
  schema) consumes budget and continues with feedback.
- Usage is summed ONLY from response `usage` fields; missing usage yields
  `usageIncomplete: true` and possibly null totals — token counts are never
  invented.
- `sanitizeMessage` redacts key material, `Bearer` credentials, and
  `Authorization` fragments from every server error before browser/logs;
  startup logs and /status show presence booleans, never values.
- `providerKind` is server-derived: loopback base URLs are `fixture`
  (realMetaRequests 0); anything else is `meta`. Status, summaries, and
  reports carry it; M3 replay enforces fixture⇒0 and meta⇒all-real plus
  integer/nonnegative/used≤budget consistency.

## 8. Web live vs stub

LIVE and STUB are unmistakable: provider radio, mode badge, distinct
notices, timelines, and export labels (`m3-live` vs `m2-stub/manual`).
Live status loads lazily on selection, so the stub flow makes zero /api
calls and stays console-clean without the API. Live requires ready status +
checked consent; the request textarea is editable for live (display-only
for stub). Contributor model ids trigger a training-data-use disclosure.
Approval, comparison, relocation tables, apply guards (identity + revision
+ settings + re-evaluation), and persistence reuse the M2 contracts; live
runs are session-scoped (never persisted) and the server report is never
rebuilt client-side.

## 9. Fresh checkout + env

- `prepare` builds core on install; `predev`/`prebuild` in web and api
  rebuild core first; `pree2e` builds core + api. Verified by moving
  `packages/core/dist` aside and rebuilding through the wiring (smoke
  16000/3200/700, dev server unaffected).
- The API entry loads root `.env` server-only (minimal parser, explicit
  env wins, missing file → setup_required). Fixture tests pass explicit
  env and never inherit the real key.
- Start: `npm install`, `npm run dev` (planner :5173), `npm run dev:api`
  (API :3001, separate terminal). API binds loopback by default.

## 10. Commands and actual results

| Command | Outcome |
|---|---|
| `npm test --workspace @layoutlab/core` | 4 files, 83 tests pass |
| `npm test --workspace @layoutlab/api` | 32 tests pass (~13 s) |
| `npm run typecheck` | clean (core + api + web) |
| `npm run build` | ok (core + api + 923 kB web chunk, Three.js warning only) |
| `npm run e2e --workspace @layoutlab/web` | 36 passed, 0 skipped (~2.0 m), 0 console/page errors |
| `node scripts/m3-evidence.mjs --core 83 --api 32 --e2e-pass 36 --e2e-skip 0` | `m3-evidence.json`, COMPLETED/IMPROVED, transport 4, replay true |
| API entry + GET /status (real .env) | 200, contributor model, liveAvailable true, no key echo, no inference |

## 11. Coordinator review findings addressed (this dispatch)

Async cancellable interpretation with prompt 202 ID; streaming byte cap
with byte (not char) accounting; post-transport terminal guards incl.
late-success discard; explicit fixture `providerKind`/`realMetaRequests`;
unresolved-questions approval gate with UI + `UNRESOLVED_QUESTIONS`;
single-flight approve; split rate limiters with deterministic hard caps;
root .env loading with override preservation; COMPLETED-only live apply;
live sequence guards + reset server-cancel; strict M3 replay metadata;
fake-transport close-event fix with delayed-success coverage. Round 2:
explicit empty env overrides preserved; strict base-URL allowlist
(official Meta / loopback fixture / unsupported-refused, no false Meta
claims); full mobile live coverage with serialized runner (workers 1),
390px overflow oracle, and mobile live screenshot. (Custom .env parser
kept over node:util parseEnv: parseEnv postdates the documented Node ≥ 20
floor.) One real bug found by tests (mount-time status fetch broke the
stub zero-console-error oracle) fixed by lazy live-only status. M2
screenshots regenerated by the suite were restored to committed bytes.

## 12. Blockers and next gate

- Blockers: none for M3. Live Meta inference unauthorized/unperformed (no
  spend approval); contributor model verified listed only.
- Next gate: M4 bounded demand heuristic + real SimReady asset — only on
  coordinator dispatch. Do not start M4 from this report.
- Known limits: no heuristic metrics exist yet (reports say so); live Meta
  behavior implemented but untested; web chunk 923 kB (consider
  code-splitting later); one organizer note — `docs/MILESTONES.md` shows a
  working-tree modification not made in this dispatch (coordinator-owned,
  left untouched).
