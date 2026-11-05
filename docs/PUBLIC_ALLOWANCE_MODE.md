# Public allowance mode

PUBLIC_BUDGET_MODE defaults to capped. Only the exact literal unlimited enables unlimited; unknown values use capped. Unlimited bypasses ledger creation, reservation, commit and enforcement, including any injected guard. Existing ledger bytes are preserved and ignored. Returning to capped restores its prior ledger state and fail-closed behavior.

Unlimited means no application total allowance ceiling. Provider billing still applies. Status and budget expose unlimited explicitly, and budget monetary totals are null because no accounting is performed. Historical reports remain compatible; their conservative per-run bound is not an actual charge. Actual requests and usage retain existing provenance reporting.

Missing credentials and unsupported transports still deny inference. Consent, Basic Auth deployment policy, shared concurrency, rate limits, cancellation, deadlines and the four-request/three-proposal/120-second upper bounds remain unchanged. Configured status does not prove inference.


Public activation2026-11-06: c1ac299 is configured for Gater glm-5-3-flash and unlimited app allowance. The old ledger is retained byte-for-byte. The initial public HTTP403 IP_LIMIT_REACHED was resolved after the user unbound provider IPs; fresh public service and physical-layout workflows now complete. Removing the app cap does not remove provider account/IP restrictions. Per-run bounds for this exact model are4requests/3proposals/8192tokens/request/360seconds; BasicAuth unchanged. Evidence: evidence/sanitized/gater-public/.


Follow-up a307375 removes BasicAuth at the owner's request. Anonymous live runs are verified; consent, rate/concurrency limits and finite per-run bounds remain. Historical mentions of BasicAuth above apply to earlier releases.
