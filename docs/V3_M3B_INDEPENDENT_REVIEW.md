# M3b independent review

Status: accepted after two review revisions. The initial220-test implementation
reached READY_FOR_DISPATCH but missed the runtime/measurement failures below.
These observations preserve review history; the final independent verdict
supersedes revision-required wording. Full shipping completion and a new
public deployment remain unimplemented.

First revision: Muse reports229 tests. Codex's separate postfix assertions
confirm the six original corrections, including the physical7400ms oracle,
backlog1/stageBacklog0, overshoot clamp, immutable inputs/reset, zero-queue
direct handoff, complete automatic motion audit and the upstream multi-lane
capability rejection. Two remaining boundary cases were executed: with a
20000ms fixed window and no future events, repeated stepEvent stays at11900ms
and completion remains IN_PROGRESS; advanceTo(Infinity/oversized invalid
numbers/numeric strings) can be silently coerced/clamped instead of rejected.
Validate requested time before capping, and let an empty-event fixed-window
step reach its horizon on the same kernel without spinning or inventing work.

Executed driver and observations are preserved privately at
`.coordination/review-m3b-counterexamples.mjs` and
`.coordination/m3b-independent-observations-initial.json`.

## Independent positive oracle

One item, speed1000mm/s. Park(1000,2500), source approach(3000,2500),
queue(5000,2500), service(6500,2500); static obstacles do not intersect these
straight paths. Pick500ms/item, unload400ms/item, packing1000ms.

Literal sequence: approach2000, pick2500, queue4500, service6000,
unload/packing start6400, packing finish7400ms. Codex checked stock remains
stored through2499; carried through6399; staged through7399; packed at7400.
Actual timestamps and quantities match this hand derivation.

## Executed findings

| Finding | Observation | Required behavior |
|---|---|---|
| Fixed window not enforced | horizon3000, advanceTo20000 executes packing at7400 and clock reaches20000, while completion text says the run ended at3000 | Both advance and step must stop exactly at the configured horizon and retain future work/partial motion |
| Shipping backlog mislabeled | arrived1, readyForDispatch1, shipped0 reports backlog0 | backlog means arrived minus shipped; expose a separate picking/packing stage backlog |
| Caller-owned scenario changes the run | Changing scenario.id/role after construction changes snapshot identity/eligibility; reset rereads mutated stock3 instead of original1 | Validate and detach exact run inputs at construction; reset repeats those frozen inputs |
| Zero-queue physical admission missing | Valid resource with a service position and no queue picks the item, then diagnoses NO_QUEUE_COORDS, leaves a queued job with null slot, and capacity check falsely reports1/0 queue jobs | Direct service must route to the actual lane and start after physical arrival/unload; no fabricated queue or late unsupported failure |
| Traffic wait remains open during motion | Burst PK-3 is moving under a plan starting15400 while its traffic wait from10000 remains open | Close waits on every actual grant, including automatic pending retries; record every granted trajectory once |

The last finding also exposes incomplete grant history: operations records
trajectories only when its explicit requestMove returns granted, while the
transport domain can grant pending moves inside movement-completion handling.
Those grants must enter the same authoritative audit stream; otherwise the
between-timestamp check covers only part of executed motion. Do not merely
hide the open wait or mark safety passed by default.

## Capability and evidence boundary

Source inspection also shows firstServicePosition and any-busy-lane logic
even when configuration advertises multiple service positions/capacity.
Before exposing such inputs, either implement the correct per-position
handshake or reject that unsupported connected-controller capability before
any arrival/stock mutation. The existing standalone resource module's
multi-lane capability does not prove the connected controller supports it.

Retain the stage-only completion distinction and all full-v3 backlog items.
The purpose of revision is reproducible measurements and truthful state,
not adding UI or model experiments before these gates pass.

## Final independent verdict

Codex reran the separate built-export assertion driver after the time-boundary
revision:8/8 groups pass. They cover hand-derived physical commits and backlog,
fixed-window oversized/repeated/chunked/step advances, empty-event window
termination, invalid-time rejection, detached input/reset, zero-queue direct
service, complete grant/wait audit and explicit multi-lane capability rejection.
The original7400ms oracle remains unchanged. Snapshot checks retain stock
through2499ms, carried stock through6399ms, staged stock through7399ms, and
packed stock at7400ms. Unshipped backlog is1 even when stage backlog is0.

The six-order burst reaches READY_FOR_DISPATCH with shipped0, backlog6 and
stageBacklog0. A PK-3 wait from10000 closes at the actual15400 grant; all
motion grants have unique unit/version identities. Codex checked the stepped
run for open TRAFFIC waits during admitted motion. Initial and final evidence
are saved in evidence/sanitized/v3-m3b-independent-review.json.

Muse's final verification is231 simulation tests, simulation build/typecheck,
root typecheck, preserved7/7 M3a independent gates and the unchanged built
proof results. Accept M3b as the first connected HEADLESS picking/packing
slice only. Single-trip and single-lane-per-station restrictions are explicit;
inbound/put-away, dispatch/shipping, full report recomputation, UI and Meta
experiments remain separate gates. The next task binds this real state to
the main Operations view and records actual concurrent motion and a wait.
