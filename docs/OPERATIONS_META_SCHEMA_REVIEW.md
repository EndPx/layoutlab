# Operations Meta structured-output review

## Incident

One actual public call on release `2d24a72` to
`muse-spark-1.3-contributor` via `POST /api/operations/proposals` failed
HTTP 400 (see `evidence/sanitized/public-meta-smoke-2d24a72.json`):

> `'required' is required to be supplied and to be an array including
> every key in properties. Missing 'dispatchDurationMs'.`

No successful proposal was returned. The guard retained the US$0.25
conservative claim (US$0.75 of the authorized US$1 remains); that claim
is not an invoice and no usage was returned. Inference stays disabled
until the coordinator reviews and retries. This fix was verified
offline only: no key was activated and no paid call was made.

## Root cause

`PATCH_SCHEMA` in `apps/api/src/operations-api.ts` defined five
`properties` with `additionalProperties: false` but no `required`.
The manual `OperationsPatch` API is all-optional, which is correct for
local callers, but Meta strict `json_schema` mode requires `required`
to list every key in `properties`. The two contracts were conflated
on the wire.

## Wire shape after the fix

Request `response_format.json_schema` (`name: "operations_patch"`,
`strict: true`) now sends:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "extraPickers":       { "type": ["integer", "null"], "minimum": 0,    "maximum": 2 },
    "extraPutaway":       { "type": ["integer", "null"], "minimum": 0,    "maximum": 2 },
    "packingDurationMs":  { "type": ["integer", "null"], "minimum": 1000, "maximum": 300000 },
    "dispatchDurationMs": { "type": ["integer", "null"], "minimum": 1000, "maximum": 300000 },
    "receivingDurationMs":{ "type": ["integer", "null"], "minimum": 1000, "maximum": 300000 }
  },
  "required": ["extraPickers", "extraPutaway", "packingDurationMs",
               "dispatchDurationMs", "receivingDurationMs"]
}
```

Unchanged knobs are explicit `null` (required integer-or-null fields).
The prompt says so: include all five keys, use `null` for unchanged,
an integer only for a proposed change (explicit `0` is a real value),
and do not invent a change merely to fill a key.

## Validation and normalization

`normalizeOperationsProviderPatch` validates the full provider object
strictly before the existing `parseOperationsPatch`:

- unknown key, missing key, non-object output: rejected;
- `null`: normalized to an omitted key (unchanged);
- integer in bounds: kept, including explicit `0`;
- fractional, non-number, or out-of-range values: rejected, never
  silently dropped.

Rejection is `INVALID_PATCH` 422 ("rejected, not executed"), unchanged.
The manual optional-field `OperationsPatch` API and
`POST /api/operations/patches/validate` are unchanged. Provider and
transport failures keep the existing sanitized error and the
conservative budget-claim behavior (commit after dispatch, never a
refund); no accounting, caps, ledger, pricing, or allowance code was
touched.

## Response metadata

`proposePatch` still returns `patch`, `model`, and `responseId`, and
now also returns safe envelope metadata reusing the existing
`ProviderResult` fields:

| Field | Source |
|---|---|
| `provider` | constant `"meta"` |
| `providerKind` | server config: `"meta"` (actual) vs `"fixture"` (loopback fake) vs `"unsupported"` |
| `model` | validated envelope model (fallback: configured model) |
| `responseId` | validated envelope `id`, or `null` |
| `finishReason` | validated first-choice `finish_reason`, or `null` |
| `durationMs` | provider round-trip duration |
| `usage` | validated `{promptTokens, completionTokens, totalTokens}` or `null` |

No raw reasoning, keys, prompts, or message content are exported.
`apps/api/src/server.ts` needed no change: the proposals handler
already forwards the returned object.

## Offline verification (fixture transport, not live Meta)

`apps/api/test/fake-meta.ts` now inspects the actually-posted
`operations_patch` schema (`operationsPatchSchemaError` /
`inspectingOperationsHandler`): `additionalProperties` must be false,
`required` must cover every property, and each property must be
integer-or-null with the correct bounds. A nonconforming schema gets
the real Meta HTTP 400 envelope instead of a canned success.

`apps/api/test/operations-api.test.ts` covers: the schema contract
itself; reproduction of the real failure from the pre-fix schema
shape (missing `dispatchDurationMs`); posted-schema inspection plus
fixture metadata for unchanged/null, explicit zero, and a valid
change; rejection of unknown, missing, fractional, and
out-of-bounds output; and the known HTTP 400 envelope as a sanitized
`TRANSPORT_ERROR`. Fake successes are `providerKind: "fixture"` and
are not live inference.

`apps/api/test/budget-guard.test.ts` proposal fixtures were updated
to the full nullable shape (four `contentJson` entries); its invalid
`{teleport: true}` fixture stays invalid. Other test files use the
separate requirements/proposal schemas, which already required every
key, and needed no change.

Checks run (all offline, zero paid calls):

- focused: `test/operations-api.test.ts` + `test/budget-guard.test.ts`
  — 49 passed;
- full API: `npm run test --workspace @layoutlab/api` — 133 passed;
- `npm run build --workspace @layoutlab/api` — passed;
- `npm run typecheck --workspace @layoutlab/api` and root
  `npm run typecheck` — passed.

## Remaining limits

- Nullable integer-or-null is the prescribed strict-mode shape, but
  it has not been confirmed against actual Meta: the coordinator's
  one bounded retry under the remaining US$0.75 allowance is the
  live check. Do not rerun the original smoke marker.
- This closes only operations provider compatibility. The full AI
  Experimenter loop (frozen comparable inputs, intervention
  enforcement, retained invalid candidates, complete export and
  recomputation, bounded tool loop) is still open.


## Coordinator acceptance and actual Meta check (2026-11-04)

Independent compiled-API wire/normalization checks passed; evidence is
`evidence/sanitized/operations-meta-schema-independent.json`. Fix f44081a
was pushed and deployed with ledger bytes unchanged. One bounded public
request then succeeded HTTP200 with actual muse-spark-1.3-contributor,
recorded responseId, finishReason stop, and usage 332 input / 450 output.
See `evidence/sanitized/public-meta-smoke-f44081a.json`. This supersedes the
offline-only limitation above for schema/provider compatibility. It does not
prove useful experiments, causal explanation, or the full agent loop.
The earlier failed run remains in the evidence set and allowance ledger.
