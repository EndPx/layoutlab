# M3a independent review

Status: accepted after two review revisions. The initial190-test implementation
did not cover the independent failures below. These observations preserve
review history; the final verdict at the end supersedes revision-required
wording. Public deployment remains R1.

First revision: Muse reports207 tests. Codex's new built-export assertion
driver verifies the long-ID completion, terminal/initial zone clearance,
witnessed blocker and result isolation, genuine concurrent2-second routes,
and corrected canonical capacity/20-position spacing. One gate remains:
initial pairwise admission tests only unexpanded rectangle interiors and
explicitly accepts edge-touching units despite their100mm margins. It also
accepts centers1200mm apart where two600mm envelopes touch, which the moving
state declares a conflict. Use the same conservative envelope and contact
rule for initial/mobile stationary/moving states. A previous stopped-agent
test starts units1000mm apart; replace that invalid setup with a genuinely
blocked narrow corridor and safely separated starts, preserving the behavior
being tested. Do not retain unsafe initial states just to keep old tests green.

Codex executed the built exports using separately constructed inputs and
literal positions. Driver and observations are preserved privately at
`.coordination/review-m3a-counterexamples.mjs` and
`.coordination/m3a-independent-counterexamples-initial.json`.

| Executed finding | Observation | Required correction |
|---|---|---|
| Initial spatial admission missing | Two radius-600 units at (1000,2000) and (1001,2000) are accepted at time zero | Validate initial room/static clearance and pairwise footprints before exposing an executable controller |
| Grant is not atomic for accepted max-length IDs | A 128-character unit ID parses, but the generated completion event ID exceeds the kernel's 128-character limit. requestMove throws after setting moving state; advanceTo reports zero processed events yet the displayed pose reaches the goal | Bounded collision-free internal event IDs and validation/scheduling before grant-state mutation |
| Endpoint center check releases a still-occupied exclusive zone | Radius-600 unit ends at (1500,1400) beside zone [2000,4000]x[1500,2500]; actual nearest-zone distance is about509.90mm. Its zone hold releases and another unit gains the same zone | Require the entire declared footprint/envelope clear of an exclusive zone before terminal release, consistently with zone admission |
| Fabricated blocker attribution | In a wall-constrained corridor, Z-blocker at (3000,2000) blocks U-mover's route; A-unrelated at (1000,3800) is reported because its ID sorts first | Report a witnessed implicated unit or explicit unknown/multiple cause; do not invent a blocker or use an invented edge to diagnose a deadlock cycle |
| Returned wait result aliases owned state | Mutating returned blockerUnitId to FAKE changes the subsequent owned snapshot/diagnostic | Detached or immutable results across all public return paths |

The exclusive-zone fixture starts units at (1000,1400)/(1000,2700). After
the first unit's500mm/500ms move, the second obtains a zone-requiring move
despite the first footprint still intersecting the zone. Pairwise trajectories
are separated by1300mm; this tests exclusive-zone semantics independently
from collision detection. Do not weaken the zone policy to make it pass.

Blocker attribution is part of the product evidence contract: an arbitrary
alphabetically first unit is not evidence of a cause. Unknown blockers must
not create false wait-for graph edges or claimed DEADLOCK_CYCLE diagnoses.

## Integration boundary

The current transport controller owns a private kernel with movement-only
events. Its public surface has no domain-event scheduling/composition seam.
The next connected-operations task must share one authoritative kernel for
arrivals, service and movement; adding a second clock would violate the
brief. This is an explicit integration requirement, not a claim that order
or resource lifecycles are already connected.

Canonical packing capacity/queue corrections are reviewed separately from
the transport failures. Preserve the corrected fixture and historical hashes;
do not restore unsafe600mm queue spacing or fictitious extra service lanes.

## Final independent verdict

Codex reran the independent built-export driver after the uniform initial
clearance correction:7/7 assertion groups pass. The checks cover initial
penetration/contact rejection, max-length-ID exact-once completion and
midpoint, terminal/initial zone clearance, actual corridor witness and
detached diagnostics, genuine concurrent two-second routes and literal
canonical capacities/20-position minimum spacing. Rejected requests preserve
snapshots; inputs and results cannot edit owned controller state.

Muse's final verification is207 simulation tests, package build, workspace
typechecks and the unchanged literal headless proof. Codex reviewed the
corrected initial-envelope rule and test-fixture corrections: invalid1000mm
start separation was replaced with safely separated starts in a truly blocked
corridor, rather than weakening the collision gate. Sanitized initial and
final observations are in evidence/sanitized/v3-m3a-independent-review.json.

Accept M3a as a headless transport substrate only. Whole-transit reservations
and inflated zone corners are conservative; moving replans/midroute cancels
remain rejected. Main fixture has no explicit exclusive zones yet (micro
fixtures prove that policy). The next connected scenario must compose domain
events on one kernel, keep stock/service handshakes physical, and obtain its
own lifecycle/metrics/replay/UI evidence. This acceptance does not establish
complete warehouse operations or a new public deployment.
