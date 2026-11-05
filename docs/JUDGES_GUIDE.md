# Review LayoutLab in three minutes

Open the [public workspace](https://layoutlab.endpx.cloud). The workspace and live AI need no account, API key or password. Gater GLM live investigations are enabled with unlimited total application allowance and bounded per-run requests. Provider availability and billing still apply.

1. **Inspect:** run the synthetic six-order sample and inspect a worker or station. Distinguish elapsed engine time, shipped orders and summed waiting.
2. **Compare:** ask a live service-time or PACK-1 layout question, review allowed changes, and start the investigation. Physical-layout testing has a separate interpretation/approval step. For a short review, recorded examples and manual comparisons remain available. Original and proposed results stay separate; worse proposals are retained.
3. **Verify:** export the exact report and use its matching recompute/verify control. Recalculation uses saved inputs without inference.

**[Watch the 2m20 demo](https://youtu.be/webE5e5WNbo)**, then follow the [demo walkthrough](DEMO.md) to inspect the same decision flow.

## Independent terminal replay

Install and build from the repository root using the [README](../README.md), then run:

```sh
node scripts/verify-operations-investigation.mjs evidence/sanitized/e4a-live-investigation-f24a6a1.json
node scripts/verify-report.mjs evidence/sanitized/m3-live-smoke-report.json
```

Both scripts accept multiple report paths and require no key or inference. The first checks operations comparisons, trace and recommendations; the second recomputes historical storage measurements. A pass proves measurement consistency, not authenticated model provenance. Reports preserve frozen historical inputs; current edits do not rewrite them.

Historical operations used 3 actual Meta requests: 502,400 ms baseline versus 397,100 ms under a hypothetical 30-second dispatch assumption. Historical storage retains 18 runs / 72 requests / 54 attempts, including 16 unparseable attempts; Meta beat the heuristic in 2 runs. Public Gater service and physical-layout runs now have actual model-request evidence: one PACK-1 translation was valid but worse, and the model selected the baseline. See [live acceptance](../evidence/sanitized/gater-layout-public/acceptance.json). Animated human visualization is integrated; human-body traffic physics and real-facility validation remain unqualified.

See [evaluation](EVALUATION.md), [limitations](LIMITATIONS.md) and [documentation](README.md). The repository is public.
