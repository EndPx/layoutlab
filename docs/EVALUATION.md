# Evaluation (M5)

Actual measured results from the frozen synthetic benchmark: offline
(baseline+heuristic), fixture (orchestration only), and 18 actual Meta runs
completed on 2026-11-02 under the separate US$1.50 authorization. The live set
contains all 18 runs, 72 real requests and all 54 proposal attempts, including
16 unparseable outputs. Old M3 smoke results remain separate. These results
do not establish general model superiority or real-world savings.

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

## Live: 18 actual Meta runs, all outcomes retained

Source: `evidence/sanitized/m5-benchmark-live.{json,md}`. Model:
`muse-spark-1.3-contributor`, official Meta transport, prompt
`layoutlab.m4prompt/1`, low reasoning, maximum 2000 completion tokens/request,
three proposals and four requests per run (including interpretation).
All 18 runs completed with four actual requests each, 18 final reports and
zero ambiguous runs. Trial-level failures are zero; this does **not** mean
every proposal succeeded: only 38 of 54 proposals were valid. The other 16
failed parsing and all carried `finishReason: length`.

The numbers below are **weighted workload travel in millimeters**, not a
single order's length. Each bracket lists trial 1, 2, 3; N/A means no valid
proposal in that category. First means the actual first attempt, never a
substitution with a later valid answer. Best Meta includes the first and
feedback attempts; its winning attempt is retained in the JSON.

| Scenario | Current | Heuristic | Meta first (three trials) | Best Meta including feedback (three trials) |
|---|---:|---:|---|---|
| bm-01-demand-skew | 78000 | 32000 | [32000, 32000, 32000] | [32000, 32000, 32000] |
| bm-02-copick-cluster | 218000 | 186000 | [N/A, N/A, N/A] | [N/A, N/A, N/A] |
| bm-03-tight-relocation | 38000 | 26000 | [26000, 26000, 26000] | [26000, 26000, 26000] |
| bm-04-constraints | 36000 | 36000 | [36000, 36000, 36000] | [36000, 36000, 36000] |
| bm-05-locked-frequent | 222000 | 196000 | [N/A, N/A, N/A] | [184000, N/A, 186000] |
| bm-06-unreachable-repair | N/A | 12000 | [12000, 12000, 12000] | [12000, 12000, 12000] |

Overall selection was heuristic in 13 runs, baseline in three, Meta in two.
Selection counts include deterministic ties; they are not a 13-to-2 win rate.
Nine runs on bm-01/03/06 tied the heuristic's distance; three constrained runs retained the
baseline; four runs had no valid Meta proposal. In bm-05 trials 1 and 3,
proposal 3 recovered from unparseable first attempts and beat the heuristic:
184000 mm with four relocations, and 186000 mm with two relocations,
respectively, versus heuristic 196000 mm. Improvement against the valid
222000-mm baseline is 17.117117% and 16.216216%. These are two observed
synthetic outcomes, not a general superiority claim. No run with a valid
first proposal obtained a strictly shorter later proposal. All nine bm-02
attempts were length-terminated and unparseable. No token cap was raised or
failed model trial rerun to improve the recorded result.

The interpretation draft is retained per trial, but the same predetermined
fixture contract was approved before proposals. This controls the assignment
comparison; it is not an unrestricted natural-language understanding test.
bm-06 starts unreachable, so its improvement stays N/A even after a valid
repair. No distance-to-labor, throughput or financial-savings conversion is
made.

### Execution phases and infrastructure failures

The first three runs used clean source `36061bc`; all reached COMPLETED and
were reconciled read-only to four requests each on their original run IDs.
A runner bug had initially fetched the third run's partial RUNNING report,
then caused 15 local HTTP 429 concurrency refusals with no run IDs and zero
upstream requests. The initial snapshot observed 11 requests; reconciliation
established 12 for those same three runs. This snapshot is preserved as
`m5-live-initial-attempt.json`, explicitly historical and not the final result.

The runner-only fix was reviewed, regression-tested and pushed as `d391d00`;
see [BENCHMARK_FINALITY_REVIEW.md](BENCHMARK_FINALITY_REVIEW.md). A one-use,
exclusively claimed collector then ran only the 15 conclusively unstarted
slots (60 new requests), never the three paid runs again. Fixture bytes,
contracts, core/routing versions, prompts, model, generation settings and
server fingerprint stayed fixed. Per-trial phase/source/run IDs and canonical
embedded-report hashes are in `m5-live-provenance.json`. All 15 original local
refusals remain in `m5-live-infrastructure-attempts.json`; none is presented as
a bad model proposal or silently removed from the attempt history.

### Recompute and cost boundaries

```sh
npm run build
node scripts/m5-benchmark.mjs replay evidence/sanitized/m5-benchmark-live.json
```

The aggregate replay matches every frozen input and embedded measurement.
All 18 final reports also passed the network-denied single-report verifier.
The coordinator's separate grid BFS and constraint/arithmetic checks matched
71 valid assignments, including per-order distances and visit sequences;
the unreachable baseline retained its null total. Evidence:
`m5-live-independent-review.json`. Recalculation needs no model key/API and
does not authenticate the origin of provider metadata.

Complete reported usage: 106349 input and 77266 completion tokens. At the
published Contributor rates recorded in the artifact (US$0.10/M input,
US$0.20/M output), the usage estimate is **US$0.0260881**. The conservative
reservation was US$1.1955456 against authorization US$1.50. Invoice was not
retrieved: estimate, reservation and actual billed charge are distinct.
The public-test US$1 allowance is separate and unused at this checkpoint.
