# Live Meta smoke evidence

One paid smoke run was explicitly authorized, with a US$0.10 total cap, one run, at most four requests, and at most 2,000 generated tokens per request. It used the synthetic `warehouse-basic` scenario through LayoutLab's native API on source commit `b854f00b3fe244e326a4246914cd6e3c41520fd1`.

Model: `muse-spark-1.3-contributor`. Provider endpoint: official Meta Model API. Run ID: `9ede2950-4326-4dd9-93ec-f6de2dc8bfc0`. The scenario, assignments, orders and evaluator settings were frozen for the run. The reviewer approved a relocation budget of two, locked `sku-a`, and retained all configured compatibility constraints.

| Observation | Actual result |
| --- | --- |
| Runtime inference | Four real Meta requests: one interpretation and three proposal attempts |
| Terminal state | COMPLETED |
| Outcome | NO_IMPROVEMENT_FOUND |
| Baseline modeled weighted travel | 36,800 mm |
| First proposal attempt | No parseable message content; retained as a failed attempt |
| Second proposal attempt | No parseable message content; retained as a failed attempt |
| Third proposal | Valid complete assignment; two relocations; modeled weighted travel 45,600 mm |
| Selection | Baseline retained because it has lower travel |
| Deterministic Node replay | Matched saved measurements |
| Browser report import/replay | Matched saved measurements; screenshot retained |

This proves that LayoutLab called Meta at runtime, evaluated a real returned proposal, preserved failed attempts, and retained the better baseline. It does not demonstrate model superiority, a useful improvement over the heuristic, benchmark completion, or warehouse customer savings. The heuristic and authentic browser asset integration were not yet implemented at this checkpoint.

## Usage and cost boundary

The report exposes `usageIncomplete: true`. Available usage totals are 2,451 prompt tokens and 2,679 completion tokens (5,130 total); these are partial and must not be represented as the complete billed usage. The original provider did not retain usage/finish diagnostics for the two empty-content responses. Their cause is unresolved; output truncation is a hypothesis, not a verified finding.

The preflight used the server's four-request, bounded-prompt and 2,000-output-token limits with the observed Contributor rates of US$0.10 per million input tokens and US$0.20 per million output tokens. It calculated a conservative full-run cost bound of US$0.0664192, below the authorized US$0.10. This is a preflight bound, not an invoice or a measured charge. No invoice was retrieved, and no second run or paid retry was started. [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits)

Future failure handling should retain available usage, response ID and finish reason even when message content is absent. The historical evidence remains unchanged and incomplete where those values were not captured.

Subsequent source review found another limitation of the M3 request context: its summary included rack geometry but omitted the packing point, per-location approach points, navigation settings and configured allowlists. Feedback contained scores but not the prior candidate mapping. M4 is tasked with completing this context before benchmarking. The M3 smoke remains a valid runtime/validation observation, but is insufficient for a fair inference about model optimization ability; the incomplete context is not asserted to be the sole cause of the observed failures or worse proposal.

## Artifacts

- `evidence/sanitized/m3-live-smoke.json`: authorization, source revision, preflight bound, requirements review and final observations.
- `evidence/sanitized/m3-live-smoke-run.json`: final API run summary, including all failed attempts.
- `evidence/sanitized/m3-live-smoke-report.json`: verbatim exported server report.
- `evidence/sanitized/m3-live-smoke-replay.png`: actual browser report replay verification.

The API key was not displayed or committed. All scenario data in these artifacts is declared synthetic. Contributor-mode data use was disclosed before inference.
