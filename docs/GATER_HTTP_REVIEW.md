# Gater HTTP offline review

This gate uses createApp on loopback with an injected fake transport and fake key. An official Gater URL in configuration does not establish live compatibility. Authenticated catalog discovery was verified separately by the coordinator; the user selected configuration/fixture work only, with no real inference calls.

Status and setup-required responses identify Gater when configured. Startup readiness validates configuration rather than merely key presence; startup logs setup-required for unavailable configuration and configured-not-tested otherwise, never tested. Existing auth, concurrency and durable budget enforcement remain unchanged.

On a current Node release supporting --env-file, the explicit opt-in command from the repository root is:

```sh
node --env-file=.env.gater.local apps/api/dist/index.js
```

Keep API_HOST=127.0.0.1 for local-only binding. This command starts the server; it does not authorize paid actions. The ignored opt-in file was neither read nor modified by this gate. Automatic root .env loading is unchanged, and explicit process environment takes precedence.

The focused HTTP fixture exercises create, approval, invalid proposal feedback, valid revision, report retrieval and keyless offline verification, with four fake dispatches and zero real provider calls. Unknown provider and changed counters are rejected by verification. The earlier lifecycle-only HTTP milestone was PARTIAL until the missing-key and exhausted-budget route gates passed. Both negative gates now pass with zero injected transport calls: missing-key status identifies Gater, layout and legacy create return setup_required without claims, and a public-API-exhausted isolated temporary ledger produces HTTP 402 with byte-for-byte and snapshot equality after refusal.

Validation commands (repository root):

```sh
npx vitest run apps/api/test/gater-http.test.ts -t "keyless HTTP|exhausted HTTP"
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc -p apps/api/tsconfig.build.json
```

Result: 2 tests passed, 1 existing lifecycle test skipped; API no-emit and API-only build passed. The startup assertion reads entrypoint source safely without importing it, loading real environment files, or starting another process. No shared builds, real ledger access, remote calls, deployments, or commits occurred. This completes the local fixture gate only; real inference was excluded by the user, so there is no paid/live approval gate pending.
