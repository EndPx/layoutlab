# Evaluation (M5)

Actual measured results only: offline (baseline+heuristic) and fixture
(orchestration) runs from the frozen benchmark. The live Meta benchmark is
NOT RUN — no paid inference was authorized or performed, and this document
contains no live samples, real or fabricated. Old M3 smoke results are not
mixed with the frozen 18-trial protocol and no model-superiority or
real-world-savings claim is made.

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
valid improvement. bm-06 repairs an unreachable baseline to a valid 12000-mm
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

## Live: NOT RUN (pending authorization)

The live 18-trial target (fixed protocol, 72-request cap, $1.195546
conservative reservation, authoritative per-trial server fingerprint, atomic
lock, disk journal) is implemented and refusal-tested but never executed.
Next gate is coordinator-owned: review, commit, rerun validation on the clean
tree, then authorize and execute. Results will be appended here only from an
actual authorized run.
