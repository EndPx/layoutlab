# Gater legacy planning review

Legacy RunStore exports now declare gater for Gater configuration, retain actual modelRequestsUsed, and count zero realMetaRequests. Historical Meta and fixture pairing remains meta/meta and meta/fixture. Generation settings continue to use the existing provider helper.

The shared failure schema accepts only those historical pairings or gater/gater, rejects unknown provider kinds, contradictory pairs, invalid counters and nonzero Gater Meta counters. Replay returns the declared provider; structural replay does not authenticate remote origin. The no-approved-evaluation boundary remains unchanged.

Frozen benchmark live admission remains Meta-only. Failure audit collection explicitly excludes Gater instead of assigning Gater into a Meta trial.

Validation: core build passed; core and API no-emit passed. Focused Gater RunStore test passed using injected transport and a fake key, actual deterministic evaluation through approveRun, success report and preapproval failed interpretation export, request counters, schema replay, and secret omission. Shared failure tests passed (including Gater pair/counter tampering and historical Meta/fixture replay). No remote inference, deployment, simulation build, or historical evidence edits occurred.

Coordinator acceptance, UI integration, and authorized live verification remain outside this bounded implementation.
