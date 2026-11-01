// M0 Meta live-availability check. READ-ONLY: no inference, no key, no paid call.
// Usage: node scripts/m0-meta.mjs
// Asserts: base URL responds; unauthenticated catalog request is rejected with
// an auth error (proves endpoint live + key required). Exit nonzero on failure.
import assert from "node:assert/strict";

const BASE = process.env.META_API_BASE_URL || "https://api.meta.ai/v1";

const r = await fetch(`${BASE}/models`, {
  headers: { "user-agent": "LayoutLab-M0-diagnostic" },
  signal: AbortSignal.timeout(20000),
});
const body = await r.text();
console.log(`GET ${BASE}/models -> HTTP ${r.status}`);
console.log(`body: ${body.slice(0, 300)}`);

// Endpoint must be reachable and must demand authentication without a key.
assert.equal(r.status, 401, "expected 401 without credentials");
assert.match(body, /authentication_error|invalid_api_key|Unauthorized/i, "expected auth-error body");
if (process.env.MODEL_API_KEY) {
  console.log("NOTE: MODEL_API_KEY present in env (value not shown); live smoke still needs explicit authorization, skipped.");
} else {
  console.log("MODEL_API_KEY: ABSENT -> live inference smoke BLOCKED (no key, no authorization).");
}
console.log("M0-META-CHECK: PASS (endpoint live, auth required, no inference performed)");
