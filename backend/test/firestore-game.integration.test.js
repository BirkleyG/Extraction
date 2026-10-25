import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreGameRepository } from '../src/firestore-game-repository.js';
import { GameService } from '../src/game-service.js';

assert.equal(process.env.FIREBASE_PROJECT_ID, 'demo-extraction');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const app = initializeApp({ projectId: 'demo-extraction' }, `game-${randomUUID()}`);
const db = getFirestore(app);
const now = new Date();
const monthId = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const buyers = [{ id: 'near', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500, fundsCap: 200, fundsRefillPerSecond: 0, capacityCap: 100_000, capacityRefillPerSecond: 0 }];
const code = (c) => (e) => e.code === c;

async function world(uids) {
  const worldId = `game-${randomUUID()}`;
  const ref = db.collection('worlds').doc(sha(worldId));
  await ref.set({ worldId, activeMonthId: monthId, status: 'active' });
  for (const uid of uids) await ref.collection('owners').doc(sha(uid)).set({ uid, status: 'active', role: 'owner' });
  return worldId;
}
const ctx = (worldId, uid, t) => ({ auth: { uid }, activeMonthId: monthId, worldId, now: t, startSite: { siteId: 's', commonOreId: 'ore-1' } });
let n = 0;
const cmd = (version, extra = {}) => ({ monthId, requestId: `q${++n}`, expectedVersion: version, ...extra });

test('Firestore: enroll, paid departure, idempotent retry across service instances, restart recovery', async () => {
  const worldId = await world(['u1']);
  const t0 = Date.now();
  const repo = new FirestoreGameRepository(db);
  const a = new GameService(repo, { npcBuyers: buyers });
  await a.seedNpcBuyers({ worldId, monthId, nowSec: Math.floor(t0 / 1000) });
  const e = await a.enroll(cmd(0), ctx(worldId, 'u1', t0));
  const b = new GameService(new FirestoreGameRepository(db), { npcBuyers: buyers });
  const sale = cmd(e.version, { destinationId: 'near' });
  const [r1, r2] = await Promise.all([a.dispatch(sale, ctx(worldId, 'u1', t0 + 900_000)), b.dispatch(sale, ctx(worldId, 'u1', t0 + 900_000))]);
  assert.deepEqual(r1, r2);
  const restarted = new GameService(new FirestoreGameRepository(db), { npcBuyers: buyers });
  const view = await restarted.ownerView('u1', monthId, ctx(worldId, 'u1', t0 + 900_000));
  assert.equal(view.spendable, r1.shipment.payment);
  assert.equal(view.doc.shipments.length, 1);
  await assert.rejects(a.dispatch({ ...sale, destinationId: 'other' }, ctx(worldId, 'u1', t0 + 900_000)), code('IDEMPOTENCY_CONFLICT'));
});

test('Firestore: two owners racing for one NPC buyer budget never overspend it', async () => {
  const worldId = await world(['u1', 'u2']);
  const t0 = Date.now();
  const svc = (i) => new GameService(new FirestoreGameRepository(db), { npcBuyers: buyers });
  const s1 = svc(1); const s2 = svc(2);
  await s1.seedNpcBuyers({ worldId, monthId, nowSec: Math.floor(t0 / 1000) });
  const e1 = await s1.enroll(cmd(0), ctx(worldId, 'u1', t0));
  const e2 = await s2.enroll(cmd(0), ctx(worldId, 'u2', t0));
  const tt = t0 + 2 * 3600_000; // ~2h of ore each: far more than the 200-coin (5-unit) budget
  const out = await Promise.allSettled([
    s1.dispatch(cmd(e1.version, { destinationId: 'near' }), ctx(worldId, 'u1', tt)),
    s2.dispatch(cmd(e2.version, { destinationId: 'near' }), ctx(worldId, 'u2', tt)),
  ]);
  const paid = out.filter((o) => o.status === 'fulfilled').reduce((a, o) => a + o.value.shipment.payment, 0);
  assert(paid <= 200 && paid > 0, `paid ${paid}`);
  const losers = out.filter((o) => o.status === 'rejected');
  for (const l of losers) assert(['BUYER_OUT_OF_FUNDS'].includes(l.reason.code), l.reason.code);
});

test('Firestore: month close resumes after a crash with one snapshot and one burn per owner', async () => {
  const { MonthCloser } = await import('../src/month-close.js');
  const { monthEndMs } = await import('../src/game-service.js');
  const worldId = await world(['u1', 'u2']);
  const t0 = Date.now();
  let clock = t0;
  const mk = () => new FirestoreGameRepository(db, { clock: () => clock });
  const game = new GameService(mk(), { npcBuyers: [{ ...buyers[0], fundsCap: 1e9 }] });
  await game.seedNpcBuyers({ worldId, monthId, nowSec: Math.floor(t0 / 1000) });
  const e1 = await game.enroll(cmd(0), ctx(worldId, 'u1', t0));
  const e2 = await game.enroll(cmd(0), ctx(worldId, 'u2', t0));
  await game.dispatch(cmd(e1.version, { destinationId: 'near' }), ctx(worldId, 'u1', t0 + 1000));
  const B = monthEndMs(monthId);
  clock = B + 60_000; // the wall clock is now past the boundary
  let crashed = false;
  const crashing = new MonthCloser(mk(), { hooks: { afterPhase: (n) => { if (n === 'snapshot' && !crashed) { crashed = true; throw new Error('outage'); } } } });
  await assert.rejects(crashing.close({ worldId, monthId, nowMs: B + 60_000 }), /outage/);
  const archive = await new MonthCloser(mk()).close({ worldId, monthId, nowMs: B + 120_000 });
  assert.equal(archive.ranking.length, 2);
  assert.equal(archive.winnerId, 'u1');
  const again = await new MonthCloser(mk()).close({ worldId, monthId, nowMs: B + 180_000 });
  assert.deepEqual(again, archive);
  void e2;
});

test('HTTP game API with emulator-issued ID tokens end to end on Firestore', async () => {
  const { getAuth } = await import('firebase-admin/auth');
  const { createGameHttpServer } = await import('../src/game-http.js');
  const { generateWorld } = await import('../src/world.js');
  const env = process.env;
  const res = await fetch(`http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: 'integration-password-123', returnSecureToken: true }),
  });
  const { idToken, localId } = await res.json();
  const worldId = await world([localId]);
  const game = new GameService(new FirestoreGameRepository(db), { npcBuyers: buyers.map((b) => ({ ...b, fundsCap: 1e9 })) });
  await game.storePlanet({ worldId, monthId, planet: generateWorld({ seed: `e2e-seed-${randomUUID()}`, monthId, players: 2 }) });
  await game.seedNpcBuyers({ worldId, monthId, nowSec: Math.floor(Date.now() / 1000) });
  const server = createGameHttpServer({ auth: getAuth(app), game });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}/v1/worlds/${worldId}`;
    const call = async (path, body, token = idToken) => {
      const r = await fetch(`${base}/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json() };
    };
    assert.equal((await call('state', undefined, 'not-a-real-token-at-all-xxxxxx')).status, 401);
    assert.equal((await call('commands/enroll', { requestId: 'h1', expectedVersion: 0 })).status, 200);
    let state = (await call('state')).body;
    assert.equal(state.coin.spendable, 0);
    assert.equal(state.yard.units, 5);
    const sold = await call('commands/dispatch', { requestId: 'h2', expectedVersion: state.version, destinationId: 'near' });
    assert.equal(sold.status, 200);
    state = (await call('state')).body;
    assert.equal(state.coin.spendable, 200);
    const up = await call('commands/buyUpgrade', { requestId: 'h3', expectedVersion: state.version, line: 'dig', shaftNumber: 1, mode: 'max' });
    assert.equal(up.status, 200);
    assert((await call('state')).body.mine.shafts[0].digLevel > 1);
    assert.equal((await call('commands/dispatch', { requestId: 'h4', expectedVersion: up.body.version, destinationId: 'near' })).status, 409, 'ship is away');
  } finally { await new Promise((r, j) => server.close((e) => (e ? j(e) : r()))); }
});
