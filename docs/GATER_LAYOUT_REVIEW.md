# Gater layout lifecycle review

G2a enables `gater` in the strict offline report provider envelope and uses the existing ProviderKind type. Envelope, counters, budget, approval authority and computation verification are preserved; historical Meta/fixture kinds remain accepted.

Executed `npx vitest run apps/api/test/gater-layout-lifecycle.test.ts`: PASS, 2 tests, 83.77s. Executed `npm run typecheck --workspace @layoutlab/api`: PASS (tsc --noEmit). Initial test attempts exposed and corrected a syntax error and an inherited Meta-only token field assertion; the final run passes. The 120000ms test timeout accommodates observed production evaluator and repeated offline replay costs.

The injected FetchLike fixture uses loadConfig with https://api.gater.ai.id/v1, glm-5-3-flash and a fake-test-only key. It exercises interpretation, explicit approval, retained domain-invalid proposal, valid packing translation and model finish: four requests, two proposals within the three-proposal cap, exact dispatch counters, manual production evaluator equality, offline export verification, unknown provider and counter tamper rejection, and archived fixture verification. No real GLM or Meta calls occur and verifier receives no enabled provider/configuration.

Provider kind is declared provenance, not cryptographic authenticity. Without a signed origin receipt the verifier cannot detect changing a declared Meta kind to another supported kind; it verifies report computations and contracts.

Remaining gates outside this bounded path: other API provider endpoints and error/transport contracts, UI provider labels/setup and export presentation, metadata/documentation consistency, and separately authorized live Gater evidence. This test establishes one layout investigation path only and does not establish complete Gater integration or real model quality. No secrets, .env reads, deployment, commits, refill or shared builds were performed.
