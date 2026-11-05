# Human archive routing prerequisite

Explicit immutable registry entries now bind 0.1.0 and 0.1.1 for factory creation, report recomputation and experiment verification. Current remains 0.1.1 and takes the existing source branch; current reports do not now use the archive. Frozen declaration version is literal 0.1.1. Unknown and absent recordings still reject with null verifier identity; supported results retain the actual selected version.

Commands from repository root:

```
node node_modules/typescript/bin/tsc -p packages/simulation/tsconfig.build.json --outDir "$PWD/.coordination/human-archive-routing/build"
node node_modules/typescript/bin/tsc -p packages/simulation/tsconfig.json --noEmit
node .coordination/human-archive-routing/browser-check.mjs
cd packages/simulation
npx vitest run test/human-archive-routing.test.ts test/implementation-versions.test.ts
```

Evidence is in evidence/sanitized/human-archive-routing (test output, typecheck output, browser build output and SHA256 source/archive hashes). Focused new tests cover exact six-order report/inventory parity, frozen module identities, pinned 0.1.1 SHA and rejection. Existing version suite covers historical verification. No future current version is introduced or simulated; explicit indexed routing is prepared for that later change. Browser build uses Vite browser ESM with both frozen imports. An initial root-directory invocation of existing tests failed because their fixture paths assume simulation cwd; corrected command above uses that cwd.

Layout-family/API outer report routing and the actual new-version operations adapter remain pending. H1 body/gait prerequisites are not waived. This is registration readiness only, with no human integration or production readiness claim. No archive bundle, manifest, recipe or 0.1.0 declaration was edited.
