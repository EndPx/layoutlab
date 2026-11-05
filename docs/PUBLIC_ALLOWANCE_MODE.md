# Public allowance mode

PUBLIC_BUDGET_MODE defaults to capped. Only the exact literal unlimited enables unlimited; unknown values use capped. Unlimited bypasses ledger creation, reservation, commit and enforcement, including any injected guard. Existing ledger bytes are preserved and ignored. Returning to capped restores its prior ledger state and fail-closed behavior.

Unlimited means no application total allowance ceiling. Provider billing still applies. Status and budget expose unlimited explicitly, and budget monetary totals are null because no accounting is performed. Historical reports remain compatible; their conservative per-run bound is not an actual charge. Actual requests and usage retain existing provenance reporting.

Missing credentials and unsupported transports still deny inference. Consent, Basic Auth deployment policy, shared concurrency, rate limits, cancellation, deadlines and the four-request/three-proposal/120-second upper bounds remain unchanged. Configured status does not prove inference.
