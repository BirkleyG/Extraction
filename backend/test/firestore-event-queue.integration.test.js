import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreEventQueue } from '../src/event-queue.js';

assert.equal(process.env.FIREBASE_PROJECT_ID, 'demo-extraction');
const db = getFirestore(initializeApp({ projectId: 'demo-extraction' }, `queue-${randomUUID()}`));
const T0 = Date.UTC(2026, 9, 1);
const ev = (id, atMs) => ({ id, monthId: '2026-10', atMs, priority: 0, type: 'arrive', siteId: 's', payload: {} });
const claim = (workerId, nowMs = T0) => ({ workerId, nowMs, leaseMs: 10_000, limit: 10, beforeMs: T0 + 1e7 });
const code = (c) => (e) => e.code === c;

test('Firestore queue: enqueue, one winner among racing workers, fenced commit, resume after crash', async () => {
  const scope = { worldId: `q-${randomUUID()}`, monthId: '2026-10' };
  const a = new FirestoreEventQueue(db);
  const b = new FirestoreEventQueue(db);
  const events = Array.from({ length: 12 }, (_, i) => ev(`e${String(i).padStart(2, '0')}`, T0 + 1000 + i));
  assert.deepEqual(await a.enqueue(scope, events), { added: 12, duplicates: 0 });
  assert.deepEqual(await b.enqueue(scope, events.slice(0, 3)), { added: 0, duplicates: 3 });
  const [r1, r2] = await Promise.all([a.claim(scope, claim('a')), b.claim(scope, claim('b'))]);
  assert.equal([r1, r2].filter((r) => r.granted).length, 1);
  const win = r1.granted ? r1 : r2;
  const who = r1.granted ? a : b;
  const name = r1.granted ? 'a' : 'b';
  assert.equal(win.events.length, 10);
  await assert.rejects(who.commit(scope, { workerId: name, token: win.token, expectedVersion: 5, nowMs: T0, processedKeys: win.events.map((e) => e.sortKey) }), code('CHECKPOINT_CONFLICT'));
  // The winner crashes; the other worker takes over after expiry and sees the same page, then commits.
  const taker = await b.claim(scope, claim('c', T0 + 10_000));
  assert.equal(taker.events.length, 10);
  await assert.rejects(who.commit(scope, { workerId: name, token: win.token, expectedVersion: 0, nowMs: T0 + 10_001, processedKeys: win.events.map((e) => e.sortKey) }), code('LEASE_LOST'));
  await b.commit(scope, { workerId: 'c', token: taker.token, expectedVersion: taker.version, nowMs: T0 + 10_001, processedKeys: taker.events.map((e) => e.sortKey), docs: [{ path: 'state', value: { n: 10 } }] });
  const rest = await a.claim(scope, claim('d', T0 + 10_002));
  assert.deepEqual(rest.events.map((e) => e.event.id), ['e10', 'e11']);
  await assert.rejects(a.enqueue(scope, [ev('late', T0 + 500)]), code('LATE_EVENT'));
});
