import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryEventQueue } from '../src/event-queue.js';
import { EventWorker, sitePath } from '../src/event-worker.js';

const scope = { worldId: 'w', monthId: '2026-10' };
const T0 = Date.UTC(2026, 9, 1);
const END = Date.UTC(2026, 10, 1);
const ev = (id, atMs, siteId = 's1', type = 'gain', priority = 0) => ({ id, monthId: '2026-10', atMs, priority, type, siteId, payload: { n: 1 } });
const handlers = {
  gain(d, e, rng) { d.total = (d.total ?? 0) + e.payload.n + rng.int(5); d.log = [...(d.log ?? []), e.id]; return d; },
  boom() { throw new Error('bug'); },
};
const make = (queue, over = {}) => new EventWorker({ queue, handlers, seedFor: () => 'seed-1', ...over });
const state = async (q, site = 's1') => q.readDoc(scope, sitePath(scope.monthId, site));
const events = (n, site = 's1') => Array.from({ length: n }, (_, i) => ev(`e${String(i).padStart(3, '0')}`, T0 + 1000 + Math.floor(i / 2) * 1000, site));

test('idle queue costs no lease; due events apply in order with seeded RNG', async () => {
  const q = new MemoryEventQueue();
  const w = make(q);
  assert.deepEqual(await w.drain(scope, { nowMs: T0 + 5000 }), { status: 'idle', applied: 0, done: true });
  assert.equal((await q.stats(scope)).lease, null);
  await q.enqueue(scope, [ev('b', T0 + 2000), ev('a', T0 + 1000), ev('future', T0 + 99_000)]);
  const r = await w.drain(scope, { nowMs: T0 + 5000 });
  assert.equal(r.applied, 2);
  assert.deepEqual((await state(q)).data.log, ['a', 'b']);
  assert.equal((await q.stats(scope)).pending, 1);
});

test('live == catch-up: any page size and any run schedule yield identical state (T17-03 / T18-08)', async () => {
  const all = events(60);
  const finals = [];
  for (const [pageSize, schedule] of [[100, [T0 + 1e6]], [7, [T0 + 1e6]], [1, [T0 + 1e6]], [5, [T0 + 3000, T0 + 9000, T0 + 1e6]]]) {
    const q = new MemoryEventQueue();
    await q.enqueue(scope, all);
    const w = make(q, { pageSize, maxBatches: 1000 });
    for (const nowMs of schedule) await w.drain(scope, { nowMs });
    finals.push(JSON.stringify(await state(q)));
  }
  assert.ok(finals.every((f) => f === finals[0]));
  assert.equal(JSON.parse(finals[0]).data.log.length, 60);
});

test('handler failure commits nothing, releases the lease and the same page is retried; fixing the handler recovers', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, [ev('a', T0 + 1000), ev('x', T0 + 2000, 's1', 'boom'), ev('c', T0 + 3000)]);
  const w = make(q);
  const r = await w.drain(scope, { nowMs: T0 + 5000 });
  assert.deepEqual({ status: r.status, applied: r.applied, error: r.error, eventId: r.eventId }, { status: 'blocked', applied: 0, error: 'HANDLER_FAILED', eventId: 'x' });
  assert.equal(await state(q), null);
  assert.equal((await q.stats(scope)).lease, null);
  assert.equal((await q.stats(scope)).pending, 3);
  const fixed = make(q, { handlers: { ...handlers, boom(d) { return d; } }, workerId: 'fixed' });
  assert.equal((await fixed.drain(scope, { nowMs: T0 + 5000 })).applied, 3);
});

test('unknown event type blocks fail-closed; async handlers are rejected', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, [ev('a', T0 + 1000, 's1', 'mystery')]);
  assert.equal((await make(q).drain(scope, { nowMs: T0 + 5000 })).error, 'UNKNOWN_EVENT_TYPE');
  const q2 = new MemoryEventQueue();
  await q2.enqueue(scope, [ev('a', T0 + 1000)]);
  assert.equal((await make(q2, { handlers: { gain: async (d) => d } }).drain(scope, { nowMs: T0 + 5000 })).error, 'ASYNC_HANDLER');
});

test('two workers racing: exactly-once application, the loser reports busy', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, events(10));
  const results = await Promise.all(['a', 'b', 'c'].map((workerId) => make(q, { workerId }).runOnce(scope, { nowMs: T0 + 1e6 })));
  assert.equal(results.filter((r) => r.status === 'applied').length, 1);
  assert.equal((await state(q)).data.log.length, 10);
  assert.equal((await q.stats(scope)).pending, 0);
});

test('a crashed worker holding a lease delays but never duplicates or loses events', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, events(10));
  await q.claim(scope, { workerId: 'dead', nowMs: T0, leaseMs: 10_000, limit: 100, beforeMs: T0 + 1e6 });
  const w = make(q, { workerId: 'live' });
  assert.equal((await w.runOnce(scope, { nowMs: T0 + 5000 })).status, 'busy');
  assert.equal((await w.runOnce(scope, { nowMs: T0 + 10_000 })).status, 'applied');
  assert.equal((await state(q)).data.log.length, 10);
});

test('events at or after the month boundary are never processed by the old-month worker', async () => {
  const q = new MemoryEventQueue();
  await q.enqueue(scope, [ev('in', END - 1000), ev('after', END + 5000)]);
  await make(q).drain(scope, { nowMs: END + 10_000 });
  assert.deepEqual((await state(q)).data.log, ['in']);
  assert.equal((await q.stats(scope)).pending, 1);
});

test('independent sites keep independent state; pages spanning more sites than one commit allows resume cleanly', async () => {
  const q = new MemoryEventQueue();
  const many = Array.from({ length: 150 }, (_, i) => ev(`e${String(i).padStart(3, '0')}`, T0 + 1000 + i, `site-${i}`));
  await q.enqueue(scope, many);
  const w = make(q, { pageSize: 150, maxBatches: 10 });
  const r = await w.drain(scope, { nowMs: T0 + 1e6 });
  assert.equal(r.applied, 150);
  assert.equal((await state(q, 'site-149')).data.log[0], 'e149');
  assert.equal((await state(q, 'site-0')).data.log.length, 1);
});
