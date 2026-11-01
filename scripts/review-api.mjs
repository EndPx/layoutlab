import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createApp } from '../apps/api/dist/server.js';
import { loadConfig } from '../apps/api/dist/config.js';
import { replayReport, replayFailureRecord } from '@layoutlab/core';

// Independent coordinator oracle over real local HTTP; never contacts Meta.
// Run after npm run build, from the repository root.
fs.mkdirSync('.coordination', { recursive: true });
const scenario = JSON.parse(fs.readFileSync('fixtures/test/oracle-empty-room.json', 'utf8'));
const requirements = { objective: 'minimize_weighted_picking_travel', maxRelocatedProducts: 2,
  lockedProductIds: [], assumptions: [], unresolvedQuestions: [] };
const proposals = [
  [{ productId: 'sku-a', locationId: 'L2' }],
  [{ productId: 'sku-a', locationId: 'L2' }, { productId: 'sku-b', locationId: 'L1' }],
  [],
];
const captured = [];
let slow = false;
let emptyContent = false;
let slowEntered;
let slowRelease;
let releaseSlow;
const fake = createServer((req, res) => {
  let raw = '';
  req.on('data', b => { raw += b; });
  req.on('end', async () => {
    const body = JSON.parse(raw);
    captured.push(body);
    if (slow) {
      slowEntered();
      await slowRelease;
      if (res.destroyed) return;
    }
    const index = captured.length - 1;
    const content = body.response_format.json_schema.name === 'planning_requirements'
      ? requirements
      : { scenarioRevision: scenario.revision, changes: proposals[index - 1], rationale: 'Local reviewer fixture.' };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: emptyContent ? 'Bearer review-fixture-key' : 'review-response',
      model: 'review-fixture', choices: [{ message: { content: emptyContent ? null : JSON.stringify(content) },
        finish_reason: emptyContent ? 'length' : 'stop' }], usage: emptyContent
        ? { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
        : { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
  });
});
await new Promise(r => fake.listen(0, '127.0.0.1', r));
const config = loadConfig({ MODEL_API_KEY: 'review-fixture-key', META_MODEL_ID: 'review-fixture',
  META_API_BASE_URL: `http://127.0.0.1:${fake.address().port}/v1`, RUN_TIMEOUT_MS: '5000', API_RATE_MAX: '1000' });
const { app } = createApp({ config });
const api = app.listen(0, '127.0.0.1');
await new Promise(r => api.once('listening', r));
const base = `http://127.0.0.1:${api.address().port}`;
async function request(path, body) {
  const res = await fetch(base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json();
  assert.ok(res.ok, JSON.stringify(json));
  return json;
}
async function poll(id, desired) {
  for (let i = 0; i < 200; i++) {
    const run = await request(`/api/runs/${id}`);
    if (desired.includes(run.state)) return run;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error('Review fixture polling exhausted.');
}
try {
  const invalidScene = structuredClone(scenario);
  invalidScene.racks[0].positionMm.x = -1000;
  const invalidResponse = await fetch(base + '/api/runs', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: invalidScene,
      requestText: 'Invalid fixed scene must not start inference.', mode: 'live', consent: true }) });
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).code, 'INPUT_INVALID');
  assert.equal(captured.length, 0);
  console.log('PASS invalid scene rejected before any transport request');
  const created = await request('/api/runs', { scenario, requestText: 'Keep all constraints; move at most two products.', mode: 'live', consent: true });
  const interpreted = await poll(created.runId, ['AWAITING_APPROVAL', 'FAILED']);
  assert.equal(interpreted.state, 'AWAITING_APPROVAL');
  assert.equal(interpreted.modelRequestsUsed, 1);
  await request(`/api/runs/${created.runId}/approve`, { requirements });
  const done = await poll(created.runId, ['COMPLETED', 'FAILED', 'TIMED_OUT']);
  assert.equal(done.state, 'COMPLETED');
  assert.equal(captured.length, 4);
  assert.equal(done.modelRequestsUsed, 4);
  assert.equal(done.proposalsUsed, 3);
  assert.equal(done.providerKind, 'fixture');
  assert.equal(done.realMetaRequests, 0);
  assert.equal(done.attempts[0].candidate.valid, false);
  assert.ok(done.attempts[0].candidate.errors.some(e => e.code === 'LOCATION_OCCUPIED'));
  assert.equal(done.attempts[1].candidate.weightedTravelMm, 16000);
  assert.equal(done.attempts[1].candidate.relocationCount, 2);
  assert.equal(done.bestName, 'baseline');
  assert.equal(done.outcome, 'NO_IMPROVEMENT_FOUND');
  const userContent = captured[1].messages.find(m => m.role === 'user').content;
  const summaryLine = userContent.split('\n').find(line => line.startsWith('Scenario summary: '));
  const sentScenario = JSON.parse(summaryLine.slice('Scenario summary: '.length));
  assert.deepEqual(sentScenario.packingPointMm, scenario.packingPointMm);
  assert.deepEqual(sentScenario.nav.cart, scenario.cart);
  assert.equal(sentScenario.nav.gridSizeMm, scenario.gridSizeMm);
  assert.equal(sentScenario.nav.minimumPassageWidthMm, scenario.minimumPassageWidthMm);
  assert.deepEqual(sentScenario.locations[0].pickPointMm, scenario.locations[0].pickPointMm);
  assert.ok(Object.hasOwn(sentScenario.locations[0], 'allowedProductIds'));
  assert.ok(Object.hasOwn(sentScenario.products[0], 'allowedLocationIds'));
  assert.ok(Object.hasOwn(sentScenario.products[0], 'demandFrequency'));
  const laterContent = captured[3].messages.find(m => m.role === 'user').content;
  const feedbackLine = laterContent.split('\n').find(line => line.startsWith('Evaluator feedback (most recent last): '));
  const feedback = JSON.parse(feedbackLine.slice('Evaluator feedback (most recent last): '.length));
  assert.equal(feedback.at(-1).bestValidSoFar.name, 'baseline');
  assert.deepEqual(feedback.at(-1).bestValidSoFar.changes, []);
  assert.equal(feedback.at(-1).changes.length, 2);
  const report = await request(`/api/runs/${created.runId}/report`);
  assert.equal(report.baseline.weightedTravelMm, 16000);
  assert.equal(replayReport(report).matchesSaved, true);
  fs.writeFileSync('.coordination/review-api-report.json', JSON.stringify(report, null, 2));
  console.log('PASS actual local HTTP: 4 requests/3 proposals, atomic occupancy rejection, 16000-mm tie keeps baseline, fixture provenance, report replay');
  console.log('PASS actual request context: packing/approach/navigation/allowlists/demand and baseline-relative feedback mappings');

  slow = true;
  let enteredResolve;
  const entered = new Promise(r => { enteredResolve = r; });
  slowEntered = enteredResolve;
  slowRelease = new Promise(r => { releaseSlow = r; });
  const start = Date.now();
  const pendingCreate = request('/api/runs', { scenario, requestText: 'Reviewer cancellation fixture.', mode: 'live', consent: true });
  await entered;
  const pending = await Promise.race([pendingCreate, new Promise((_, reject) => setTimeout(() => reject(new Error('Run ID not promptly available while first inference waits')), 500))]);
  assert.ok(Date.now() - start < 500);
  const cancelled = await request(`/api/runs/${pending.runId}/cancel`, {});
  assert.equal(cancelled.state, 'CANCELLED');
  releaseSlow();
  await new Promise(r => setTimeout(r, 50));
  const after = await request(`/api/runs/${pending.runId}`);
  assert.equal(after.state, 'CANCELLED');
  assert.equal(after.attempts.length, 0);
  assert.equal(captured.length, 5);
  console.log('PASS actual local HTTP: first inference cancellable by promptly returned ID; no post-cancel proposal or extra request');

  slow = false;
  emptyContent = true;
  const empty = await request('/api/runs', { scenario, requestText: 'Reviewer empty-output failure fixture.', mode: 'live', consent: true });
  const noContent = await poll(empty.runId, ['AWAITING_APPROVAL', 'FAILED']);
  assert.equal(noContent.state, 'AWAITING_APPROVAL');
  assert.equal(noContent.interpretDiagnostics.finishReason, 'length');
  assert.deepEqual(noContent.usageTotals, { promptTokens: 100, completionTokens: 200, totalTokens: 300 });
  assert.equal(noContent.usageIncomplete, false);
  assert.ok(!JSON.stringify(noContent).includes('review-fixture-key'));
  await request(`/api/runs/${empty.runId}/cancel`, {});
  const audit = await request(`/api/runs/${empty.runId}/failure-report`);
  assert.equal(audit.reportAvailable, false);
  assert.equal(audit.measurement, null);
  assert.equal(audit.outcome, null);
  assert.equal(audit.state, 'CANCELLED');
  assert.equal(audit.proposalsUsed, 0);
  assert.equal(audit.realMetaRequests, 0);
  assert.ok(!JSON.stringify(audit).includes('review-fixture-key'));
  assert.equal(replayFailureRecord(audit).evaluated, false);
  assert.equal(captured.length, 6);
  console.log('PASS actual local HTTP: empty-content usage/finish retained, secret redacted, cancelled pre-approval audit exports without measurement claim');
} finally {
  releaseSlow?.();
  await Promise.all([new Promise(r => api.close(r)), new Promise(r => fake.close(r))]);
}
