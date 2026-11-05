# Workspace readability and warehouse rendering

P1 and P2 improve the existing product interface and renderer without changing the simulation implementation (0.1.1), scenario geometry, inventory rules or evaluator.

## Accepted behavior

- Compact actual-state metrics, persistent playback controls and a bounded desktop contextual panel; mobile keeps ordinary document scrolling.
- Recorded Meta evidence is available without a new model request; progress and comparison links stay visible outside live settings.
- Manual and assistant comparisons use readable units, signed changes, validity and scope explanations. Exact milliseconds, input identities and schemas remain available in details and unchanged exports. Worse and invalid candidates remain visible.
- Warehouse role materials and lighting distinguish floor, steel, cartons, plastic and packing. Existing source textures are retained; replacement PBR is explicitly identified and is not claimed as recovered NVIDIA MDL appearance.
- Unit label details follow selection; full diagnostic labels remain available. Loading failures remain visible and open the asset disclosure automatically.

## Verification

[Workspace review](WORKSPACE_P1_REVIEW.md) records desktop/mobile manual flows, no-key API verification, exact display assertions and before/after screenshots. [Renderer review](WAREHOUSE_P2_REVIEW.md) records matched-camera captures, 26 unchanged geometry/camera observations, cargo tests, three unchanged edit regressions and the final keyless API smoke. The earlier isolated-preview 502 responses are retained as environment failures; the final combined server smoke has no console/page errors.

The coordinator additionally checked 502400 ms = 8 min 22.4 s and 623600 - 614900 ms = +8700 ms in the saved packing comparison. Renderer evidence reads actual CPU instance matrices: P01 cartons have the declared 150 x 120 x 200 mm world dimensions under cargo yaw and preserve cart-relative positions over movement. This is not raw GPU certification or real-world safety validation.

After building the project, reproduce the local no-key renderer/report check from the repository root using installed Microsoft Edge:

```sh
node scripts/verify-workspace-renderer.mjs
```

It starts an isolated loopback API with an empty key and empty ledger path, prohibits provider transport, checks status/budget and recorded verification, checks cargo dimensions/attachment and writes new evidence under ignored `.coordination/workspace-renderer-check`. No private environment file is loaded. Output directory can be supplied as the first argument.

## Remaining work

Human/cart grip, complete body clearance, signed-distance gait and versioned production integration remain separate acceptance gates. The diagnostic human is not a shipped worker. No new live Meta or GLM completion was used. The public provider configuration and allowance remain unchanged.

Local timing observations are CPU submission samples on the reported AMD Radeon environment, not a general FPS benchmark or mobile performance guarantee. The existing JavaScript bundle-size warning remains. These milestones improve product readability and visual separation; they do not by themselves close every high-end or real-life warehouse requirement.
