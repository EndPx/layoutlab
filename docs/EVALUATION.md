# Evaluation (M5)

Actual measured results only: offline (baseline+heuristic) and fixture
(orchestration) runs from the frozen benchmark. The live Meta benchmark is
NOT RUN — the user authorized it before the E1 evidence audit (18 synthetic
runs, 72 requests, 3 proposals/run, 2000 output tokens/request, max US$1.50),
but no run was performed, and this document contains no live samples, real or
fabricated. Old M3 smoke results are not mixed with the frozen 18-trial
protocol and no model-superiority or real-world-savings claim is made.

The current offline and fixture artifacts were regenerated from clean source
commit `d8a3a34b49ae9edccd0ab72d2315f98a99e8775d` on 2026-11-02. Both CLI
replays match. Independent BFS and constraint checks matched all six offline
cases and 81 valid assignments across the 18 fixture reports; see
`evidence/sanitized/m5-final-independent-review.json`. Fixture token/cost
estimates use scripted usage for plumbing verification: they are hypothetical,
with zero real Meta requests and no invoice or paid charge claim.

## Offline: baseline vs bounded heuristic (0 model calls)

Source: `evidence/sanitized/m5-benchmark-offline.{json,md}` (replay: match).

| Scenario | Baseline valid | Baseline (mm) | Heuristic (mm) | Relocs | Improvement |
|---|---|---|---|---|---|
| bm-01-demand-skew | true | 78000 | 32000 | 3 | 58.97% |
| bm-02-copick-cluster | true | 218000 | 186000 | 2 | 14.68% |
| bm-03-tight-relocation | true | 38000 | 26000 | 1 | 31.58% |
| bm-04-constraints | true | 36000 | 36000 retained | 0 | 0.00% |
| bm-05-locked-frequent | true | 222000 | 196000 | 1 | 11.71% |
| bm-06-unreachable-repair | false | N/A | 12000 repair | 1 | N/A |

Every Meta row is N/A by construction (no model calls). bm-04 honestly
retains the baseline: class, dimension, and allowlist constraints admit no
valid improvement — exhaustively proven (all 24 complete assignments
checked, only the baseline valid; see the bm-04 fixture test). bm-06
repairs an unreachable baseline to a valid 12000-mm
assignment with N/A improvement. All baselines match hand-derived Manhattan
tours and the coordinator's independent BFS oracle.

## Fixture: 18-trial orchestration (72 requests, 0 real)

Source: `evidence/sanitized/m5-benchmark-fixture.{json,md}` (replay: match).

- Trials run 18/18, not run 0; model requests 72/72 (4/trial incl.
  interpretation); real Meta requests 0; failures 0; reports available 18/18;
  ambiguous 0. providerKind fixture throughout.
- Trial script per scenario (deterministic, valid by construction, never
  rigged invalid): interpretation draft, retain, heuristic-shaped deltas,
  retain. Every trial approved the predetermined contract (draft retained).
- Selected overall: heuristic wins 15/18 trials (all bm-01/02/03/05/06
  trials); baseline wins 3/3 bm-04 trials (no valid improvement exists, so
  the Meta-shaped retains tie the baseline and lose on relocations).
- Meta-first rows show the actual first attempt (retain = baseline travel);
  Meta-feedback rows show the best valid Meta-shaped proposal (heuristic
  deltas where they improve, else retain). These exercise orchestration and
  comparison plumbing only and say nothing about live model behavior.

## Fixture provenance (synthetic, frozen)

All six benchmark scenarios are constructed synthetic fixtures (`fixtures/benchmark/bm-*.json`, `category: "synthetic"`, `inventedFields: ["all dimensions, assignments, and orders"]`, `sourceUrls: []`). No external dataset or design image was used; nothing is reconstructed from the published sources in [EVIDENCE_BASE.md](EVIDENCE_BASE.md). Bytes and hashes are frozen in `fixtures/benchmark/manifest.json` and rechecked by every benchmark load and replay.

| Fixture | Purpose / behavior tested | Constructed values | Design motivation | Simplifications |
|---|---|---|---|---|
| bm-01-demand-skew | Demand skew: high-demand product starts farthest; clear reassignment opportunity | 2 racks, 4 loc, 3 prod, 3 single-line orders (freq 10/4/1); one empty compatible spare | Authored for the demand-opportunity case; no external source | Open room: racks off-route, packing distances are exact Manhattan |
| bm-02-copick-cluster | Co-pick clustering at brief scale: dispersed pairs PA/PB; hand-checked swap repair | 4 racks, 12 loc, 10 prod, 10 orders (incl. 2-line pair orders); two empty locations | Brief small-scene scale (4/12/10/10); no external source | Open room with exact Manhattan distances |
| bm-03-tight-relocation | Tight budget 1: admits a single mid move, rejects the full 2-product swap | 2 racks, 3 loc, 2 prod, 2 orders (freq 6/1); L-mid is the only single-move destination | Authored for the relocation-budget boundary; no external source | Open room with exact Manhattan distances |
| bm-04-constraints | Strong constrained baseline: class, dimension and allowlist blocks admit no improvement; honest retain | 2 racks, 4 loc, 3 prod, 3 orders; L-mid allowlisted, L-far cold-only, L-small fits nothing | Authored so every travel improvement is blocked; no external source | Open room with exact Manhattan distances |
| bm-05-locked-frequent | Locked frequent product at brief scale: hottest product locked far; unlocked-only repairs | 4 racks, 12 loc, 8 prod, 10 orders; P-hot locked by contract; four empty locations | Brief small-scene scale with a contract lock; no external source | Open room with exact Manhattan distances |
| bm-06-unreachable-repair | Unreachable baseline with reachable repair; invalid baseline yields N/A improvement | 2 racks, 3 loc, 2 prod, 2 orders; L-blocked pick point at a rack center (valid scene, unreachable demand) | Authored for the invalid-input boundary; no external source | Single blocked point; repair destination exactly 1000 mm from packing |

The sample `warehouse-basic` (4 racks, 8 locations, 6 products, 3 order templates) is likewise synthetic with all fields invented; its 36.8 m baseline is computed by the evaluator from that fixture, not an application constant. Displayed percentages above round exact integer-millimeter improvement to two decimals (58.97%, 14.68%, 31.58%, 11.71%); recomputation uses the exact values in the JSON artifacts.

## Failure accounting (verified, not sampled)

- Failed interpretation, pre-approval cancellation, and approve-gate
  rejection export `m5failure/1` audits with outcome/measurement null,
  reportAvailable false, zero proposals, and an explicit no-evaluation
  boundary; replay validates without claiming any measurement match.
- Dropped-response trials preserve the run ID, record AMBIGUOUS with the
  observed counts as lower bounds plus the reserved max, and stop the live
  loop with the remainder not run. No paid retries anywhere.
- Live preflight verifiably refuses: missing confirmation, insufficient
  authorization ($0.01 vs $1.195546 reservation), wrong model, lowered caps,
  non-official transport, dirty source — all refuse before any network
  request or output claim.

## Live: NOT RUN (authorized; pending audit acceptance + clean freeze)

The live 18-trial target (fixed protocol, 72-request cap, $1.195546
conservative reservation, authoritative per-trial server fingerprint, atomic
lock, disk journal) is implemented and refusal-tested but never executed.
The user authorized it before the E1 evidence audit: 18 synthetic runs,
72 requests, 3 proposals/run, 2000 output tokens/request, max US$1.50
service cost. Execution stays pending until the audit is accepted and the
source is frozen clean. Results will be appended here only from an actual
authorized run.
