# Gater configuration and fixture integration

Accepted local scope, 2026-11-05: explicit Gater GLM configuration, bounded transport, provider-specific status and reports, offline replay, and UI integration. No paid completion was authorized or executed. Authenticated catalog discovery confirmed the requested model ID; it does not prove completion compatibility.

## Configuration

Server-only `MODEL_API_BASE_URL=https://api.gater.ai.id/v1`, `MODEL_ID=glm-5-3-flash`, and `MODEL_API_KEY`. Neutral names take precedence over legacy `META_*` aliases. The private `.env.gater.local` is ignored by Git and is not loaded automatically. Explicit local startup on the supported Node version:

```sh
node --env-file=.env.gater.local apps/api/dist/index.js
```

Keep the API bound to loopback. Startup does not call a model. Configuration readiness is not successful inference. The existing public ledger remains exhausted and was not refilled or touched by fixture tests; no public environment switch was made.

## Verified boundaries

- Exact approved remote origin classification; no userinfo, query, hash, extra path or nondefault remote port. Unsupported remote origins reject.
- Gater uses a deliberately separate candidate Chat Completions payload. Upstream strict-schema support and reasoning/output-cap semantics remain unverified. No automatic retry or schema-validation removal.
- Existing maximum four requests, three proposals, 2000 output-token request cap and 120-second deadline retained. Client metadata also rejects a cap above 2000.
- Gater provenance is preserved in legacy, operations and layout reports; Meta request counts remain zero for Gater. Actual dispatched counts remain separate. Historical Meta/fixture reports still replay. Offline verification checks computations and declared metadata, not provider authenticity.
- Successful M3 exports reject unsupported provider kinds; Gater human method labels are gater-first/gater-feedback. The frozen Meta benchmark remains Meta-only.
- Missing key and exhausted isolated ledger reject before transport; refusal leaves the ledger unchanged.
- Edge actual HTTP fixture: four injected calls, no external completions, no console/page errors, invalid candidate retained, baseline preserved until Apply, export/import/reverification, original clock restoration, and 390px overflow check. Missing/unknown provider browser responses reject with no Apply or calls.

## Evidence and checks

Focused provider, layout lifecycle, operations, legacy failure/replay, and HTTP tests passed; core/API/web typechecks and targeted builds passed. Client label/cap regressions passed eight tests; main helper pass covered 22 tests before the final additional regressions. Counts describe separate runs and must not be added as unique totals.

Detailed commands and scope are in GATER_PROVIDER_REVIEW.md, GATER_LAYOUT_REVIEW.md, GATER_OPERATIONS_REVIEW.md, GATER_LEGACY_REVIEW.md, GATER_HTTP_REVIEW.md, GATER_CLIENT_REVIEW.md, GATER_LABEL_REVIEW.md and GATER_UI_REVIEW.md. Browser artifacts: evidence/sanitized/gater-ui/. Fake-provider recordings are not live-model evidence. One overlapping Playwright runner had a teardown trace collision and is excluded; successful targeted reruns are documented.

Coordinator review identified and closed stale reasoning metadata, hardcoded status provenance, incorrect saved method labels, unsupported-successful-M3 admission and missing token-cap validation. Screenshot review covered desktop and mobile readability, not full audiovisual or real-world warehouse validation.

## Limits

No real GLM completion, price/quality benchmark, new paid inference, budget refill or deployment. No simulator algorithms, assets or historical Meta measurements were changed by this milestone. The video is an independent artifact with separately labeled historical Meta evidence and ElevenLabs narration.


## Follow-up: authorized live activation2026-11-06

The user subsequently authorized real inference and unlimited application allowance. c1ac299 is deployed with Gater/GLM; local live tests and failures are retained in docs/GATER_LIVE_REVIEW.md. The initial public IP_LIMIT_REACHED rejection was resolved after the user unbound provider IPs. Fresh public service and physical-layout runs now complete with real model-selected results; see evidence/sanitized/gater-layout-public/acceptance.json. See docs/PUBLIC_ALLOWANCE_MODE.md and evidence/sanitized/gater-public/review.json. The fixture-only/no-paid scope above describes the earlier milestone and is superseded for this authorized follow-up; historical evidence remains unchanged.
