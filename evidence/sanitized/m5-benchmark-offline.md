# LayoutLab M5 benchmark (offline)

Generated 2026-11-01T19:53:46.029Z from 84d4bca83091dac40b92f26f5ada8921052d2fbc (meta-chat-completions/json_schema-strict/1, prompt layoutlab.m4prompt/1, reasoning low, max 2000 output tokens).
Source: DIRTY (uncommitted changes; HEAD predates this run — commit and rerun validation before live).
ProviderKind fixture; real Meta requests 0; model requests observed 0 (reserved 0); trials run 0/0, not run 0; reports available 0, missing 0; ambiguous trials 0.
Costs: conservative reservation $0.0000; usage estimate n/a; invoice not retrieved.

Offline only: baseline plus bounded heuristic, zero model calls; every Meta row is N/A.

## bm-01-demand-skew

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 3 | 78000 | 5200 | 0 | 0 |
| heuristic (offline) | true | 3 | 32000 | 2133.3333333333335 | 3 | 58.97435897435897 |
| Meta first | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |
| Meta feedback | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |

## bm-02-copick-cluster

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 10 | 218000 | 6812.5 | 0 | 0 |
| heuristic (offline) | true | 10 | 186000 | 5812.5 | 2 | 14.678899082568808 |
| Meta first | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |
| Meta feedback | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |

## bm-03-tight-relocation

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 2 | 38000 | 5428.571428571428 | 0 | 0 |
| heuristic (offline) | true | 2 | 26000 | 3714.285714285714 | 1 | 31.57894736842105 |
| Meta first | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |
| Meta feedback | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |

## bm-04-constraints

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| heuristic (offline) | true | 3 | 36000 | 3272.7272727272725 | 0 | 0 |
| Meta first | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |
| Meta feedback | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |

## bm-05-locked-frequent

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | true | 10 | 222000 | 7400 | 0 | 0 |
| heuristic (offline) | true | 10 | 196000 | 6533.333333333333 | 1 | 11.711711711711711 |
| Meta first | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |
| Meta feedback | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |

## bm-06-unreachable-repair

| Method | Valid | Reachable | Travel (mm) | Mean (mm) | Relocs | Improv % |
|---|---|---|---|---|---|---|
| current (offline) | false | 1 | N/A | N/A | 0 | N/A |
| heuristic (offline) | true | 2 | 12000 | 2000 | 1 | N/A |
| Meta first | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |
| Meta feedback | N/A (offline: no model calls) | N/A | N/A | N/A | N/A | N/A |

## Limitations

- Conservative 2D clearance model: not a safety certification or complete maneuverability assessment.
- Nearest-neighbor routing is deterministic but not globally optimal.
- Travel reduction is not converted to labor, monetary, or throughput improvement.
- Benchmark scenarios are declared synthetic fixtures, not published datasets or reconstructions.
- Method budgets differ across baseline, heuristic, and Meta runs (no equal-compute claim).
- Fixture trials exercise orchestration only; they say nothing about live model behavior.
- Costs report a conservative reservation and a usage estimate separately; no invoice is retrieved and no complete billed usage is invented.

Actual live benchmark target: NOT RUN (no paid inference authorized or performed).
