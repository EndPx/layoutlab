# LayoutLab M5 benchmark (fixture)

Generated 2026-11-02T09:05:15.861Z from d8a3a34b49ae9edccd0ab72d2315f98a99e8775d (meta-chat-completions/json_schema-strict/1, prompt layoutlab.m4prompt/1, reasoning low, max 2000 output tokens).
Source: clean (HEAD matches this run).
ProviderKind fixture; real Meta requests 0; model requests observed 72 (reserved 0); trials run 18/18, not run 0; reports available 18, missing 0; ambiguous trials 0.
Costs: conservative reservation $0.0000; usage estimate $0.000504; invoice not retrieved.

Fixture transport only (realMetaRequests 0): orchestration exercise, not live model behavior.

## bm-01-demand-skew

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 3 | 78000 | 5200 | 0 | 0 |
| heuristic (offline) | true | 3 | 32000 | 2133.3333333333335 | 3 | 58.97435897435897 |
| trial 1 Meta first | true | 3 | 78000 | 5200 | 0 | 0 |
| trial 1 Meta feedback (proposal-2) | true | 3 | 32000 | 2133.3333333333335 | 3 | 58.97435897435897 |
| trial 1 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 2 Meta first | true | 3 | 78000 | 5200 | 0 | 0 |
| trial 2 Meta feedback (proposal-2) | true | 3 | 32000 | 2133.3333333333335 | 3 | 58.97435897435897 |
| trial 2 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 3 Meta first | true | 3 | 78000 | 5200 | 0 | 0 |
| trial 3 Meta feedback (proposal-2) | true | 3 | 32000 | 2133.3333333333335 | 3 | 58.97435897435897 |
| trial 3 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |

## bm-02-copick-cluster

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 10 | 218000 | 6812.5 | 0 | 0 |
| heuristic (offline) | true | 10 | 186000 | 5812.5 | 2 | 14.678899082568808 |
| trial 1 Meta first | true | 10 | 218000 | 6812.5 | 0 | 0 |
| trial 1 Meta feedback (proposal-2) | true | 10 | 186000 | 5812.5 | 2 | 14.678899082568808 |
| trial 1 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 2 Meta first | true | 10 | 218000 | 6812.5 | 0 | 0 |
| trial 2 Meta feedback (proposal-2) | true | 10 | 186000 | 5812.5 | 2 | 14.678899082568808 |
| trial 2 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 3 Meta first | true | 10 | 218000 | 6812.5 | 0 | 0 |
| trial 3 Meta feedback (proposal-2) | true | 10 | 186000 | 5812.5 | 2 | 14.678899082568808 |
| trial 3 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |

## bm-03-tight-relocation

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 2 | 38000 | 5428.571428571428 | 0 | 0 |
| heuristic (offline) | true | 2 | 26000 | 3714.285714285714 | 1 | 31.57894736842105 |
| trial 1 Meta first | true | 2 | 38000 | 5428.571428571428 | 0 | 0 |
| trial 1 Meta feedback (proposal-2) | true | 2 | 26000 | 3714.285714285714 | 1 | 31.57894736842105 |
| trial 1 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 2 Meta first | true | 2 | 38000 | 5428.571428571428 | 0 | 0 |
| trial 2 Meta feedback (proposal-2) | true | 2 | 26000 | 3714.285714285714 | 1 | 31.57894736842105 |
| trial 2 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 3 Meta first | true | 2 | 38000 | 5428.571428571428 | 0 | 0 |
| trial 3 Meta feedback (proposal-2) | true | 2 | 26000 | 3714.285714285714 | 1 | 31.57894736842105 |
| trial 3 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |

## bm-04-constraints

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| heuristic (offline) | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| trial 1 Meta first | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| trial 1 Meta feedback (proposal-1) | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| trial 1 selected | baseline (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 2 Meta first | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| trial 2 Meta feedback (proposal-1) | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| trial 2 selected | baseline (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 3 Meta first | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| trial 3 Meta feedback (proposal-1) | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| trial 3 selected | baseline (4 requests) | N/A | N/A | N/A | N/A | N/A |

## bm-05-locked-frequent

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 10 | 222000 | 7400 | 0 | 0 |
| heuristic (offline) | true | 10 | 196000 | 6533.333333333333 | 1 | 11.711711711711711 |
| trial 1 Meta first | true | 10 | 222000 | 7400 | 0 | 0 |
| trial 1 Meta feedback (proposal-2) | true | 10 | 196000 | 6533.333333333333 | 1 | 11.711711711711711 |
| trial 1 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 2 Meta first | true | 10 | 222000 | 7400 | 0 | 0 |
| trial 2 Meta feedback (proposal-2) | true | 10 | 196000 | 6533.333333333333 | 1 | 11.711711711711711 |
| trial 2 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 3 Meta first | true | 10 | 222000 | 7400 | 0 | 0 |
| trial 3 Meta feedback (proposal-2) | true | 10 | 196000 | 6533.333333333333 | 1 | 11.711711711711711 |
| trial 3 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |

## bm-06-unreachable-repair

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | false | 1 | N/A | N/A | 0 | N/A |
| heuristic (offline) | true | 2 | 12000 | 2000 | 1 | N/A |
| trial 1 Meta first | N/A (actual first Meta attempt was invalid or missing) | N/A | N/A | N/A | N/A | N/A |
| trial 1 Meta feedback (proposal-2) | true | 2 | 12000 | 2000 | 1 | N/A |
| trial 1 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 2 Meta first | N/A (actual first Meta attempt was invalid or missing) | N/A | N/A | N/A | N/A | N/A |
| trial 2 Meta feedback (proposal-2) | true | 2 | 12000 | 2000 | 1 | N/A |
| trial 2 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |
| trial 3 Meta first | N/A (actual first Meta attempt was invalid or missing) | N/A | N/A | N/A | N/A | N/A |
| trial 3 Meta feedback (proposal-2) | true | 2 | 12000 | 2000 | 1 | N/A |
| trial 3 selected | heuristic (4 requests) | N/A | N/A | N/A | N/A | N/A |

## Limitations

- Conservative 2D clearance model: not a safety certification or complete maneuverability assessment.
- Nearest-neighbor routing is deterministic but not globally optimal.
- Travel reduction is not converted to labor, monetary, or throughput improvement.
- Benchmark scenarios are declared synthetic fixtures, not published datasets or reconstructions.
- Method budgets differ across baseline, heuristic, and Meta runs (no equal-compute claim).
- Fixture trials exercise orchestration only; they say nothing about live model behavior.
- Costs report a conservative reservation and a usage estimate separately; no invoice is retrieved and no complete billed usage is invented.

Actual live benchmark target: NOT RUN (no paid inference authorized or performed).
