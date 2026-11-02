# Independent evaluator checks

These expected values were calculated by the coordinator before reviewing implementation. Tests authored by the executor are additional evidence, not the source of these expected values. All coordinates below are integer millimeters; grid size is 100 mm. Picking endpoints must satisfy clearance and connection checks.

## Empty-room distance and demand

Room 6000 x 6000; packing (1000,1000); pick A at (2000,1000); pick B at (1000,2000). With no intervening obstacles, four-direction path lengths are packing-A = 1000, packing-B = 1000, A-B = 2000. A two-product tour is 4000 including return. An A-only tour is 2000 regardless of whether its quantity is 1 or 7.

An order containing both products at frequency 3 and an A-only order at frequency 2 gives weighted travel 3*4000 + 2*2000 = 16000 mm. Total order frequency is 5, so mean distance is 3200 mm. For equal nearest distances the documented ID tie-break must select the same endpoint on every run.

## Clearance and obstacles

For cart width 600 and length 800, circumscribed radius is sqrt(300^2+400^2) = 500 mm. Margin 100 and minimum passage 1400 give navigation radius max(600,700) = 700 mm. A room point 699 mm from a wall must be rejected. A corridor less than 1400 mm wide between solid obstacles cannot be traversable at this setting. Edge collision must reject a segment crossing an inflated obstacle even when endpoints pass point tests.

## Assignment and measurement

- Baseline A-L1, B-L2; proposal A-L2 and B-L1 changes two products. Budget 1 rejects the complete candidate; budget 2 may admit it if compatibility/access pass.
- Proposal A-L2 alone collides with B and must fail atomically. It must not silently evict or drop B.
- Every feedback proposal starts with the original baseline, never the previously proposed assignment.
- An unreachable demanded product leaves the affected order present and gives no complete workload travel or improvement percentage.
- Invalid baseline cannot yield a numeric percentage improvement, even if a valid candidate exists.
- Valid 16000-mm baseline and valid 12000-mm candidate under identical settings give 25 percent improvement.
- Candidate selection cannot replace valid 12000 with invalid 1000. Equal valid travel prefers fewer relocations, followed by a documented stable assignment key.
- Revision changes must prevent stale candidate application. Report replay must recompute the saved candidate against saved settings, without inference.

## Trust boundary review

Check safe integers and workload bounds; duplicate IDs and references; unknown fields; locked-product overrides; timeout/cancellation and actual network request accounting; report metadata and secret absence. A retry or interpretation call consumes the same four-request run budget. No browser bundle may include the runtime key. A stub report must identify the stub provider and cannot claim live Meta provenance.

## M4 demand heuristic oracle

Packing (1000,1000), near location (2000,1000), far location (4000,1000), no intervening obstacle. Product A starts far; B starts near. An A-only order has frequency 10, and a B-only order frequency 1. Baseline travel is 10*6000 + 1*2000 = 62000 mm. With equal compatibility and relocation budget two, swapping gives 10*2000 + 1*6000 = 26000 mm and two relocations. No empty location is present: budget one cannot admit the swap. Locking A or making the near location incompatible must prevent that move. Valid rack geometry can be placed away from these routes so all fixture references remain intact.

Demand rank counts a distinct product once per order times frequency. Order quantity changes reported units, not this visit-frequency rank or the number of route visits.

## M6A actual browser state and routes

The synthetic warehouse-basic sample contains three templates with frequencies 4, 2 and 1. Independent BFS gives baseline order distances 3400, 8000 and 7200 mm, so weighted travel is 4*3400 + 2*8000 + 7200 = 36800 mm. Swapping B from L2 to L4 and D from L4 to L2 gives distances 3400, 4600 and 7000 mm: 29800 mm, two relocations and 19.0217 percent modeled improvement. O1 routes coincide; O2 routes differ. Neither route may be offset or fabricated to create a visible improvement.

Manual B-to-L6 changes current travel to 35600 mm; manual C-to-L7 changes it to 48800 mm. A previously generated candidate still compares against its frozen 36800-mm run baseline and original relocation budget, with stale apply disabled. Current view remains independently editable; Candidate view shows read-only destinations.

The browser reviewer checks actual SVG coordinates and full polyline lengths against the independent BFS, canonical marker coordinates, delivered GLB hash, and exported report selection/constraints. Actual DOM rectangles, rather than a renderer-reported counter alone, check all 13 sample labels and all 17 labels in the 12-location benchmark at 1586/1440/768/390 pixels. Fractional DOM sizes require padding; integer offsetWidth can conceal approximately one-pixel collisions.

Final execution evidence is in `evidence/sanitized/m6-browser-gates.json` and `m6-independent-review.json`. Replay the saved five-valid-assignment stub report with `node scripts/independent-bfs.mjs evidence/sanitized/m6-stub-report.json`. This is synthetic local/stub/fixture evidence, not a live Meta benchmark or public deployment.
