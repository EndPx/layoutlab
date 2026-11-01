// Reviewer oracle: independent BFS, no core geometry/navigation/routing calls.
// Restricted intentionally to small, on-grid scenarios with thick rectangles.
import assert from 'node:assert/strict';
import fs from 'node:fs';

export function independentTravel(s, assignment) {
  const grid = s.gridSizeMm;
  assert.equal(grid, 100);
  const radius = Math.max(Math.ceil(Math.hypot(s.cart.widthMm / 2, s.cart.lengthMm / 2)) + s.cart.marginMm,
    Math.ceil(s.minimumPassageWidthMm / 2));
  const cols = Math.floor(s.room.widthMm / grid) + 1;
  const rows = Math.floor(s.room.depthMm / grid) + 1;
  const count = cols * rows;
  assert.ok(count <= 40000, 'Reviewer oracle deliberately bounded to small fixtures');
  const rectangles = s.racks.map(r => {
    const swap = r.yawDeg === 90 || r.yawDeg === 270;
    const w = swap ? r.dimensionsMm.depth : r.dimensionsMm.width;
    const d = swap ? r.dimensionsMm.width : r.dimensionsMm.depth;
    // With obstacle dimensions > one edge, free adjacent axial nodes cannot
    // jump across an obstacle. This oracle does not handle thin obstacles.
    assert.ok(w + 2 * radius > grid && d + 2 * radius > grid);
    return [r.positionMm.x - w / 2 - radius, r.positionMm.x + w / 2 + radius,
      r.positionMm.z - d / 2 - radius, r.positionMm.z + d / 2 + radius];
  });
  const free = new Uint8Array(count);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * grid, z = j * grid;
    free[j * cols + i] = x > radius && z > radius && x < s.room.widthMm - radius && z < s.room.depthMm - radius &&
      !rectangles.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1) ? 1 : 0;
  }
  function node(p) {
    assert.equal(p.x % grid, 0, 'Off-grid endpoint outside reviewer-oracle scope');
    assert.equal(p.z % grid, 0, 'Off-grid endpoint outside reviewer-oracle scope');
    const i = p.x / grid, j = p.z / grid;
    return i < 0 || i >= cols || j < 0 || j >= rows ? -1 : j * cols + i;
  }
  const cache = new Map();
  function distances(start) {
    if (cache.has(start)) return cache.get(start);
    const dist = new Int32Array(count).fill(-1);
    const queue = new Int32Array(count);
    let head = 0, tail = 0;
    dist[start] = 0; queue[tail++] = start;
    while (head < tail) {
      const current = queue[head++], x = current % cols, z = Math.floor(current / cols);
      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x + 1 < cols) neighbors.push(current + 1);
      if (z > 0) neighbors.push(current - cols);
      if (z + 1 < rows) neighbors.push(current + cols);
      for (const next of neighbors) if (free[next] && dist[next] < 0) {
        dist[next] = dist[current] + 1; queue[tail++] = next;
      }
    }
    cache.set(start, dist);
    return dist;
  }
  function distance(a, b) {
    if (a < 0 || b < 0 || !free[a] || !free[b]) return null;
    const value = distances(a)[b];
    return value < 0 ? null : value * grid;
  }
  const products = new Map(s.products.map(p => [p.id, p]));
  const locations = new Map(s.locations.map(l => [l.id, l]));
  const mapped = new Map();
  const occupied = new Set();
  for (const a of assignment) {
    assert.ok(products.has(a.productId) && locations.has(a.locationId));
    assert.ok(!mapped.has(a.productId) && !occupied.has(a.locationId));
    mapped.set(a.productId, node(locations.get(a.locationId).pickPointMm));
    occupied.add(a.locationId);
  }
  assert.equal(mapped.size, products.size);
  const packing = node(s.packingPointMm);
  const orders = [];
  let weighted = 0, totalFrequency = 0, complete = true;
  for (const order of s.orders) {
    const remaining = [...new Set(order.lines.map(l => l.productId))];
    const sequence = [];
    let current = packing, total = 0, reachable = true;
    while (remaining.length) {
      let best = null;
      for (const id of remaining) {
        assert.ok(mapped.has(id));
        const d = distance(current, mapped.get(id));
        if (d !== null && (best === null || d < best.d || (d === best.d && id < best.id))) best = { id, d };
      }
      if (best === null) { reachable = false; break; }
      total += best.d; sequence.push(best.id); current = mapped.get(best.id);
      remaining.splice(remaining.indexOf(best.id), 1);
    }
    if (reachable) {
      const back = distance(current, packing);
      if (back === null) reachable = false;
      else total += back;
    }
    orders.push({ orderId: order.id, reachable, distanceMm: reachable ? total : null, visitSequence: sequence });
    totalFrequency += order.frequency;
    if (reachable) weighted += order.frequency * total;
    else complete = false;
  }
  assert.ok(Number.isSafeInteger(weighted));
  return { weightedTravelMm: complete ? weighted : null, meanOrderDistanceMm: complete && totalFrequency > 0 ? weighted / totalFrequency : null,
    reachableOrders: orders.filter(o => o.reachable).length, orders };
}

export function verifyAssignmentConstraints(s, requirements, mapping) {
  const product = new Map(s.products.map(p => [p.id, p]));
  const location = new Map(s.locations.map(l => [l.id, l]));
  const baseline = new Map(s.assignments.map(a => [a.productId, a.locationId]));
  const final = new Map();
  const occupied = new Set();
  for (const a of mapping) {
    assert.ok(product.has(a.productId) && location.has(a.locationId));
    assert.ok(!final.has(a.productId) && !occupied.has(a.locationId));
    const p = product.get(a.productId), l = location.get(a.locationId);
    assert.equal(p.requiredStorageClass, l.storageClass);
    if (p.allowedLocationIds !== undefined) assert.ok(p.allowedLocationIds.includes(l.id));
    if (l.allowedProductIds !== undefined) assert.ok(l.allowedProductIds.includes(p.id));
    for (const d of ['width', 'depth', 'height']) assert.ok(p.storedLoadDimensionsMm[d] <= l.usableDimensionsMm[d]);
    if (p.lockedLocationId !== undefined) assert.equal(l.id, p.lockedLocationId);
    if (requirements.lockedProductIds.includes(p.id)) assert.equal(l.id, baseline.get(p.id));
    final.set(p.id, l.id); occupied.add(l.id);
  }
  assert.equal(final.size, product.size);
  const relocations = [...final].filter(([id, at]) => baseline.get(id) !== at).length;
  assert.ok(relocations <= requirements.maxRelocatedProducts);
  return relocations;
}

export function verifyMeasuredReport(report) {
  let checked = 0;
  for (const candidate of [report.baseline, ...report.candidates]) {
    if (!candidate.valid) { assert.equal(candidate.weightedTravelMm, null); continue; }
    assert.equal(candidate.relocationCount,
      verifyAssignmentConstraints(report.scenario, report.requirements, candidate.assignment));
    const expected = independentTravel(report.scenario, candidate.assignment);
    assert.equal(candidate.weightedTravelMm, expected.weightedTravelMm);
    assert.equal(candidate.workload.meanOrderDistanceMm, expected.meanOrderDistanceMm);
    assert.equal(candidate.workload.reachableOrders, expected.reachableOrders);
    for (const order of expected.orders) {
      const actual = candidate.workload.orders.find(o => o.orderId === order.orderId);
      assert.equal(actual.distanceMm, order.distanceMm);
      assert.deepEqual(actual.visitSequence, order.visitSequence);
    }
    checked++;
  }
  const key = c => JSON.stringify([...c.assignment].sort((a, b) => a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0)
    .map(a => [a.productId, a.locationId]));
  const valid = [report.baseline, ...report.candidates].filter(c => c.valid);
  valid.sort((a, b) => a.weightedTravelMm - b.weightedTravelMm || a.relocationCount - b.relocationCount ||
    (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  assert.equal(report.bestName, valid[0]?.name ?? null);
  return checked;
}

if (process.argv[1]?.endsWith('independent-bfs.mjs')) {
  const oracle = JSON.parse(fs.readFileSync('fixtures/test/oracle-empty-room.json'));
  assert.equal(independentTravel(oracle, oracle.assignments).weightedTravelMm, 16000);
  const heuristic = JSON.parse(fs.readFileSync('fixtures/test/heuristic-oracle.json'));
  assert.equal(independentTravel(heuristic, heuristic.assignments).weightedTravelMm, 62000);
  assert.equal(independentTravel(heuristic, [
    { productId: 'prod-A', locationId: 'L-near' }, { productId: 'prod-B', locationId: 'L-far' },
  ]).weightedTravelMm, 26000);
  const report = JSON.parse(fs.readFileSync('evidence/sanitized/m3-live-smoke-report.json'));
  const checked = verifyMeasuredReport(report);
  console.log(`PASS independent BFS hand-oracles 16000/62000/26000 and ${checked} valid historical live-report assignments`);
  for (const file of process.argv.slice(2)) {
    const saved = JSON.parse(fs.readFileSync(file));
    console.log(`PASS ${file}: ${verifyMeasuredReport(saved)} valid assignments`);
  }
}
