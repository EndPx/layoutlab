# LayoutLab UI v3 reference handoff

User-supplied visual reference, inspected 2026-11-03. This packet guides the
existing product interface; it does not replace the canonical scenario,
engine contracts, evidence requirements or implementation priorities.

## Source and inspection

Original local archive:
`C:/Users/abaym/.codex/visualizations/2026/11/01/01a195d1-589a-7581-8460-e13ddb7fd317/LayoutLab-UI-v3.zip`.
Archive SHA256:
`c573013864cec45e12dea80fbe8f714616e41e34c2de61573074f63c005392a5`.
The archive contains eight PNG mockups, START-HERE.txt, manifest.json and
generation prompts. All eight screens were visually inspected; the local
working copies are under ignored `.coordination/ui-v3-reference/`.
They are generated raster concepts, not implemented screens, measurements,
verified asset inventories or a coherent set of executable run data.

| Reference | Information hierarchy to preserve | Data authority / implementation gate |
|---|---|---|
| 01 Overview | Sample/scenario library, configuration beside it, recent runs below, imports secondary | Actual supported scenario configuration and run registry; do not invent a library or importer to fill space |
| 02 Warehouse | Object tree, dominant cutaway viewport, selected-location inspector, storage/approach legend | Canonical geometry, actual assignments, fit and navigation checks |
| 03 Operations | Playback controls and simulation clock, operational metrics, warehouse plus agent inspector, resource queues and event timeline | Engine snapshots, admitted trajectories, explicit wait reasons and committed events |
| 04 AI experiments | Planning question and allowed changes on left; baseline/candidate summaries; run evidence and hypotheses; results below | Validated supported interventions, bounded experiment execution and measured run-linked recommendations |
| 05 Compare | Matched-input metadata, before/after metrics, comparable views, playback, changed-fields panel | Frozen input comparison, actual objective and complete results including failures |
| 06 Orders & inventory | Order list with filters, selected lifecycle and shortage explanation, reconciliation and transfer log | Inventory ledger, reservations, actual receiving/put-away and order transitions |
| 07 Reports | Recompute result, input/version/seed provenance, verification details, saved/recomputed metrics, limitations and attribution | Actual offline engine replay and recorded checks, never hardcoded pass cards |
| 08 UI states | Ready, invalid assignment, blocked run and no improvement have distinct explanations and recovery actions | Real validation, termination reasons and full objective ranking |

## Visual contract for the next UI integration

Light industrial workspace: warm near-white canvas, white bordered panels,
deep ink text and teal selected navigation/actions; amber for waiting or
blocked conditions and green for checks that actually passed. Packet tokens
are canvas `#F5F6F5`, ink `#18292D`, primary `#087D80`, with an approximately
8px spacing rhythm. Treat these as reference suggestions until contrast is
checked against each actual background. Keep status text/icons alongside
color. Retain the installed system sans and tabular/monospaced data style;
no font download or new UI framework is needed.

At 1586x992 the navigation is approximately 200px wide, with a slim persistent
header above the main workspace. The warehouse is the dominant visual.
Operations pairs it with an approximately 380px inspector; Experiments uses
a roughly 350px question/control column and a flexible evidence region.
These are observed proportions, not mandatory fixed pixel widths. At narrow
widths use accessible collapsed navigation and stacked sections. Define
scroll ownership, maintain readable labels and keep all controls reachable.

One shared shell should eventually connect Overview, Warehouse, Operations,
Experiments, Compare, Orders & inventory and Reports, with methodology and
settings secondary. Promote a destination when it has working behavior.
Do not ship empty or fabricated screens merely to reproduce the navigation.
Keep the verified storage planner accessible and preserve its state/reports.

The next UI owner must update DESIGN.md before code changes, including this
reference, shared primitives, responsive layout, accessibility, interaction
states and accepted visual debt. Codex did not edit DESIGN.md during the
active Muse header revision, to avoid simultaneous ownership.

## Semantic corrections required when translating the mockups

- All pictured numbers, run IDs, seeds, versions, SKU counts, routes and
  verification outcomes are illustrative. Display actual state only.
- Use the sourced SimReady models already verified against the canonical
  geometry. The pictures do not establish that pictured workers, walls,
  workstations or containers exist in the downloaded catalog packages.
- Keep a visible synthetic provenance label. Engine-running status and live
  Meta inference are different states. Stub and replay retain explicit labels.
- A unit labeled as waiting must occupy its actual safe holding position.
  Route overlays and interpolation may only use admitted engine paths.
- Reservations are a commitment within physical stock, not another physical
  bucket. Receiving stock is unavailable for picking until put-away completes.
- Partial containers must disclose remaining quantity; an item transfer must
  not fail or erase inventory because quantities cease to be exact multiples
  of a visual aggregation factor. This is required during engine integration.
- Define whether waiting metrics are per-agent, summed agent-time, queue age
  or resource time. Include units and unfinished backlog. Fixed-window
  termination does not mean every order shipped.
- Equal shipped counts alone do not prove no improvement. Use the configured
  objective and tie-breaks. Failed/blocked runs remain in the record even if
  excluded from valid-candidate ranking.
- Combined interventions do not isolate their individual causal effects.
  Distinguish hypotheses from contrasts supported by separate runs.
- Pausing playback does not authorize editing a running simulation's physical
  state. Scenario changes create a new revision/run through actual supported
  controls, with stale comparisons identified.
- Show recomputation success only after rerunning from exported inputs. The
  pictured verification command and engine version are not implementation
  specifications; display the real supported command and version.
- Avatars, CSV import, geometry editing and additional policies shown in the
  packet do not add new scope or bypass existing acceptance gates.

## Delivery sequence and review

Follow [EXPERIMENTER_DELIVERY_PLAN.md](EXPERIMENTER_DELIVERY_PLAN.md): complete
correct operational state and a connected scenario before the experimental
agent. Apply the reference during those bounded integrations, prioritizing
Operations, Experiments, Compare and Reports. Avoid an unrelated full UI
rewrite that delays engine correctness.

Review actual renders against the inspected references at desktop, tablet
and narrow widths, using the real scenario and real states. Check keyboard
access, contrast, long IDs, missing/empty results, pending/paused/blocked,
provider unavailable, replay and stale comparisons. Inspect rendering frame
cost separately from asset load timing. Developer paths, dimensions and
renderer statistics belong in diagnostics, with concise operational errors
remaining visible when they block work.

Frontend guides loaded: frontend design router and README, layout-skill,
stylegallery, frontend-design and UI UX guidance on readable contrast and
non-color-only status. The router's image-to-code-skill.md is absent in the
installed skill directories (also recorded by the earlier DESIGN.md);
manual reference inspection supplies the extraction above. No generated
replacement images, new dependencies or application code were introduced
for this intake.
