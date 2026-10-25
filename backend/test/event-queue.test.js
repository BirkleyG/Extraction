import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryEventQueue, sortKeyOf, MAX_CLAIM_EVENTS } from '../src/event-queue.js';

const scope = { worldId: 'w', monthId: '2026-10' };
const T0 = Date.UTC(2026, 9, 1);
const ev = (id, atMs, priority = 0, payload = {}) => ({ id, monthId: '2026-10', atMs, priority, type: 'arrive', siteId: 's1', payload });
const code = (c) => (e) => e.code === c;
const claim = (over = {}) => ({ workerId: 'a', nowMs: T0, leaseMs: 10_000, limit: 10, beforeMs: T0 + 1_000_000, ...over });

test('sort key matches kernel order: time, then priority (negatives first), then id', () => {
  const keys = [ev('b', 5, 0), ev('a', 5, 0), ev('z', 5, -3), ev('m', 4, 9)].map(sortKeyOf);
  assert.deepEqual([...keys].sort().map((k) => k.split(':')[2]), ['m', 'z', 'a', 'b']);
});

test('enqueue is idempotent, rejects conflicting duplicates and malformed events', async () => {
  const q = new MemoryEventQueue();
  assert.deepEqual(await q.enqueue(scope, [ev('e1', T0 + 1000), ev('e2', T0 + 2000)]), { added: 2, duplicates: 0 });
  assert.deepEqual(await q.enqueue(scope, [ev('e1', T0 + 1000), ev('e3', T0 + 3000)]), { added: 1, duplicates: 1 });
  await assert.rejects(q.enqueue(scope, [ev('e1', T0 + 1000, 0, { x: 1 })]), code('DUPLICATE_EVENT_CONFLICT'));
  await assert.rejects(q.enqueue(scope, [{ ...ev('bad', T0 + 1), extra: 1 }]), code('INVALID_EVENT'));
  await assert.rejects(q.enqueue(scope, [{ ...ev('bad', T0 + 1), monthId: '2026-11' }]), code('MONTH_MISMATCH'));
  await assert.rejects(q.enqueue(scope, [ev('bad', T0 - 1)]), code('INVALID_EVENT'));
  assert.equal((await q.stats(scope)).total, 3);
});

test('claim returns a bounded, ordered, due-only page under a lease; commit advances the cursor', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, [ev('c', T0 + 3000), ev('a', T0 + 1000), ev('b', T0 + 2000), ev('future', T0 + 9_000_000)]);
  const c = await q.claim(scope, claim({ limit: 2 }));
  assert.equal(c.granted, true);
  assert.deepEqual(c.events.map((e) => e.event.id), ['a', 'b']);
  const done = await q.commit(scope, { workerId: 'a', token: c.token, expectedVersion: c.version, nowMs: T0, processedKeys: c.events.map((e) => e.sortKey), docs: [{ path: 'state', value: { n: 2 } }] });
  assert.equal(done.version, 1);
  assert.deepEqual(await q.readDoc(scope, 'state'), { n: 2 });
  const next = await q.claim(scope, claim());
  assert.deepEqual(next.events.map((e) => e.event.id), ['c']);
  assert.equal((await q.stats(scope)).pending, 2);
});

test('a live lease blocks other workers; an expired lease is taken over and the stale holder is fenced out', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, [ev('a', T0 + 1000)]);
  const first = await q.claim(scope, claim({ workerId: 'a' }));
  const blocked = await q.claim(scope, claim({ workerId: 'b', nowMs: T0 + 5000 }));
  assert.deepEqual(blocked, { granted: false, retryAtMs: T0 + 10_000 });
  const second = await q.claim(scope, claim({ workerId: 'b', nowMs: T0 + 10_000 }));
  assert.equal(second.granted, true);
  assert.ok(second.token > first.token);
  const keys = first.events.map((e) => e.sortKey);
  await assert.rejects(q.commit(scope, { workerId: 'a', token: first.token, expectedVersion: 0, nowMs: T0 + 10_001, processedKeys: keys, docs: [{ path: 'state', value: { stale: true } }] }), code('LEASE_LOST'));
  assert.equal(await q.readDoc(scope, 'state'), null);
  await q.commit(scope, { workerId: 'b', token: second.token, expectedVersion: 0, nowMs: T0 + 10_001, processedKeys: keys });
  assert.equal((await q.stats(scope)).pending, 0);
});

test('commit after the lease deadline, with a stale version, or skipping events is rejected and changes nothing', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, [ev('a', T0 + 1000), ev('b', T0 + 2000)]);
  const c = await q.claim(scope, claim());
  const [ka, kb] = c.events.map((e) => e.sortKey);
  await assert.rejects(q.commit(scope, { workerId: 'a', token: c.token, expectedVersion: 0, nowMs: T0 + 10_000, processedKeys: [ka, kb] }), code('LEASE_EXPIRED'));
  await assert.rejects(q.commit(scope, { workerId: 'a', token: c.token, expectedVersion: 7, nowMs: T0, processedKeys: [ka, kb] }), code('CHECKPOINT_CONFLICT'));
  await assert.rejects(q.commit(scope, { workerId: 'a', token: c.token, expectedVersion: 0, nowMs: T0, processedKeys: [kb] }), code('GAP_IN_COMMIT'));
  await assert.rejects(q.commit(scope, { workerId: 'a', token: c.token, expectedVersion: 0, nowMs: T0, processedKeys: [kb, ka] }), code('INVALID_COMMIT'));
  assert.deepEqual({ ...(await q.stats(scope)), lease: null }, { pending: 2, total: 2, version: 0, cursorKey: null, lease: null });
});

test('events at or before the processed cursor are rejected as late; later ones interleave correctly', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, [ev('b', T0 + 2000)]);
  const c = await q.claim(scope, claim());
  await q.commit(scope, { workerId: 'a', token: c.token, expectedVersion: 0, nowMs: T0, processedKeys: c.events.map((e) => e.sortKey) });
  await assert.rejects(q.enqueue(scope, [ev('a', T0 + 1000)]), code('LATE_EVENT'));
  await q.enqueue(scope, [ev('b', T0 + 2000)]); // an already-processed duplicate is a harmless no-op
  assert.deepEqual(await q.enqueue(scope, [ev('c', T0 + 2000, 1), ev('d', T0 + 5000)]), { added: 2, duplicates: 0 });
});

test('release hands the lease back immediately; competing claims never both win', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, [ev('a', T0 + 1000)]);
  const results = await Promise.all(['w1', 'w2', 'w3', 'w4'].map((workerId) => q.claim(scope, claim({ workerId }))));
  assert.equal(results.filter((r) => r.granted).length, 1);
  const winner = results.find((r) => r.granted);
  await q.release(scope, { workerId: ['w1', 'w2', 'w3', 'w4'][results.indexOf(winner)], token: winner.token });
  assert.equal((await q.claim(scope, claim({ workerId: 'w9' }))).granted, true);
});

test('crash recovery: a worker that dies mid-batch leaves the queue unchanged for the next claim', async () => {
  const q = new MemoryEventQueue();
  const events = Array.from({ length: 25 }, (_, i) => ev(`e${String(i).padStart(2, '0')}`, T0 + 1000 + i));
  await q.enqueue(scope, events);
  await q.claim(scope, claim({ workerId: 'crashy', limit: 10 })); // claims, never commits
  const seen = [];
  for (let now = T0 + 20_000; seen.length < 25; now += 20_000) {
    const c = await q.claim(scope, claim({ workerId: 'good', nowMs: now, limit: 10 }));
    assert.equal(c.granted, true);
    seen.push(...c.events.map((e) => e.event.id));
    await q.commit(scope, { workerId: 'good', token: c.token, expectedVersion: c.version, nowMs: now, processedKeys: c.events.map((e) => e.sortKey) });
  }
  assert.deepEqual(seen, events.map((e) => e.id));
});

test('claim limits and scope validation', async () => {
  const q = new MemoryEventQueue();
  await assert.rejects(q.claim(scope, claim({ limit: MAX_CLAIM_EVENTS + 1 })), code('INVALID_CLAIM'));
  await assert.rejects(q.claim(scope, claim({ leaseMs: 0 })), code('INVALID_CLAIM'));
  await assert.rejects(q.claim({ worldId: 'w', monthId: 'nope' }, claim()), code('INVALID_SCOPE'));
});
