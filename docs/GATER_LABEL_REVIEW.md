# Gater report label review

Gater RunStore summaries and exports now use `gater-first` and `gater-feedback` human method labels. Candidate names and identities, Meta lineage format version identifiers, core method enums, and evaluator behavior remain unchanged. Meta and fixture method labels retain their historical values.

M3 replay computes exact expected labels from candidate identities and the declared provider; arbitrary labels, extra labels, and provider-inconsistent labels are rejected. Historical reports without methodLabels remain importable.

Validation: eight focused tests passed across apps/api/test/gater-legacy.test.ts and apps/web/src/lib/gater-contracts.test.ts; API and web TypeScript no-emit checks passed. The API test checks actual RunStore summary/export labels using fake transport; the web test replays an actual fake-transport RunStore report and rejects label tampering. Archived Meta and fixture replay remains covered. The synthetic Gater envelope derives archived Meta measurements and explicitly computes Gater method labels; it is not Gater inference evidence.

No model key, remote model calls, distribution rebuild, deployment, or live GLM compatibility validation was performed.

Final client review correction: successful M3 replay accepts only meta, fixture, or gater provider kinds; unsupported remains invalid for successful reports. Client generation settings require a positive safe integer maxCompletionTokens at or below 2000. Literal tests reject unsupported successful M3 and Gater maxCompletionTokens 2001 in status, run summary, and M3 replay. These defects were identified by source review; the added regression tests were then executed and passed. Accepted operations historical unsupported semantics were not changed. Focused tests (8) and web/API no-emit checks passed after correction.
