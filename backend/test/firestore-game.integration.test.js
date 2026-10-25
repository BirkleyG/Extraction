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
const buyers = [{ id: 'near', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500 }];
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

test('Firestore: owners launching at the same moment are each paid in full (buyers have no budget to race for)', async () => {
  const worldId = await world(['u1', 'u2']);
  const t0 = Date.now();
  const s1 = new GameService(new FirestoreGameRepository(db), { npcBuyers: buyers });
  const s2 = new GameService(new FirestoreGameRepository(db), { npcBuyers: buyers });
  const e1 = await s1.enroll(cmd(0), ctx(worldId, 'u1', t0));
  const e2 = await s2.enroll(cmd(0), ctx(worldId, 'u2', t0));
  const tt = t0 + 2 * 3600_000;
  const out = await Promise.all([
    s1.dispatch(cmd(e1.version, { destinationId: 'near' }), ctx(worldId, 'u1', tt)),
    s2.dispatch(cmd(e2.version, { destinationId: 'near' }), ctx(worldId, 'u2', tt)),
  ]);
  for (const o of out) assert.equal(o.shipment.payment, o.shipment.units * 40);
});

test('Firestore: automatic takeoffs settle in committed batches with one ledger entry each', async () => {
  const worldId = await world(['u1']);
  const t0 = Date.now();
  const repo = new FirestoreGameRepository(db);
  const game = new GameService(repo, { npcBuyers: buyers });
  await game.enroll(cmd(0), ctx(worldId, 'u1', t0));
  await game.settleThrough({ worldId, ownerId: 'u1', monthId, toSec: Math.floor(t0 / 1000) + 12 * 3600 });
  const view = await game.ownerView('u1', monthId, ctx(worldId, 'u1', t0 + 12 * 3600_000));
  assert(view.doc.shipments.length >= 3);
  assert.equal(view.spendable, view.doc.shipments.reduce((a, x) => a + x.payment, 0));
  const ledger = await db.collection('worlds').doc(sha(worldId)).collection('owners').doc(sha('u1')).collection('months').doc(monthId).collection('ledger').get();
  assert.equal(ledger.size, view.doc.shipmentCounter);
});

test('Firestore: month close resumes after a crash with one snapshot and one burn per owner', async () => {
  const { MonthCloser } = await import('../src/month-close.js');
  const { monthEndMs } = await import('../src/game-service.js');
  const worldId = await world(['u1', 'u2']);
  const t0 = Date.now();
  let clock = t0;
  const mk = () => new FirestoreGameRepository(db, { clock: () => clock });
  const game = new GameService(mk(), { npcBuyers: [{ ...buyers[0] }] });
  let e1 = await game.enroll(cmd(0), ctx(worldId, 'u1', t0));
  let e2 = await game.enroll(cmd(0), ctx(worldId, 'u2', t0));
  e1 = await game.setPolicy(cmd(e1.version, { auto: false }), ctx(worldId, 'u1', t0));
  e2 = await game.setPolicy(cmd(e2.version, { auto: false }), ctx(worldId, 'u2', t0));
  await game.dispatch(cmd(e1.version, { destinationId: 'near' }), ctx(worldId, 'u1', t0 + 1000));
  const B = monthEndMs(monthId);
  clock = B + 60_000; // the wall clock is now past the boundary
  let crashed = false;
  const crashing = new MonthCloser(mk(), { game, hooks: { afterPhase: (n) => { if (n === 'snapshot' && !crashed) { crashed = true; throw new Error('outage'); } } } });
  await assert.rejects(crashing.close({ worldId, monthId, nowMs: B + 60_000 }), /outage/);
  const archive = await new MonthCloser(mk(), { game }).close({ worldId, monthId, nowMs: B + 120_000 });
  assert.equal(archive.ranking.length, 2);
  assert.equal(archive.winnerId, 'u1');
  const again = await new MonthCloser(mk(), { game }).close({ worldId, monthId, nowMs: B + 180_000 });
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
  const game = new GameService(new FirestoreGameRepository(db), { npcBuyers: buyers });
  await game.storePlanet({ worldId, monthId, planet: generateWorld({ seed: `e2e-seed-${randomUUID()}`, monthId, players: 2 }) });
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

test('invite-only join, month preparation and scheduler tick over HTTP', async () => {
  const { getAuth } = await import('firebase-admin/auth');
  const { createGameHttpServer } = await import('../src/game-http.js');
  const { WorldAdmin } = await import('../src/world-admin.js');
  const { DEFAULT_NPC_BUYERS } = await import('../src/npc.js');
  const signup = async () => {
    const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: 'integration-password-123', returnSecureToken: true }) });
    return r.json();
  };
  const a = await signup(); const b = await signup(); const c = await signup();
  const worldId = `join-${randomUUID()}`;
  const repo = new FirestoreGameRepository(db);
  const game = new GameService(repo, { npcBuyers: DEFAULT_NPC_BUYERS });
  const admin = new WorldAdmin({ firestore: db, game, repository: repo, inviteCode: 'friends-2026', maxMembers: 2, seedSecret: 'test-seed-secret-0123456789', players: 4 });
  const server = createGameHttpServer({ auth: getAuth(app), game, admin, internalToken: 'internal-secret-xyz' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, token, body, headers = {}) => {
      const r = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json() };
    };
    const w = `/v1/worlds/${worldId}`;
    assert.equal((await call(`${w}/join`, a.idToken, { inviteCode: 'wrong' })).status, 403);
    assert.equal((await call(`${w}/state`, a.idToken)).status, 404, 'unknown world');
    assert.equal((await call(`${w}/join`, a.idToken, { inviteCode: 'friends-2026' })).status, 200);
    assert.equal((await call(`${w}/join`, a.idToken, { inviteCode: 'friends-2026' })).status, 200, 'idempotent');
    assert.equal((await call(`${w}/join`, b.idToken, { inviteCode: 'friends-2026' })).status, 200);
    assert.equal((await call(`${w}/join`, c.idToken, { inviteCode: 'friends-2026' })).status, 409, 'world is full');
    assert.equal((await call(`${w}/commands/enroll`, c.idToken, { requestId: 'x', expectedVersion: 0 })).status, 403, 'non-member cannot act');
    const enrolled = await call(`${w}/commands/enroll`, a.idToken, { requestId: 'en1', expectedVersion: 0 });
    assert.equal(enrolled.status, 200);
    const state = await call(`${w}/state`, a.idToken);
    assert.equal(state.status, 200);
    assert.equal(state.body.offers.length, 3);
    assert.equal((await call('/internal/tick', null, { worldId }, { 'x-internal-token': 'nope' })).status, 401);
    const tick = await call('/internal/tick', null, { worldId }, { 'x-internal-token': 'internal-secret-xyz' });
    assert.equal(tick.status, 200);
  } finally { await new Promise((r, j) => server.close((e) => (e ? j(e) : r()))); }
});

test('Firestore scheduler persists zero-client earnings and duplicate ticks do not pay twice', async () => {
  const { WorldAdmin } = await import('../src/world-admin.js');
  const worldId = await world(['worker-owner']);
  const t0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) + 3600_000;
  const repository = new FirestoreGameRepository(db);
  const game = new GameService(repository, { npcBuyers: buyers });
  await game.enroll(cmd(0), ctx(worldId, 'worker-owner', t0));
  const nowMs = t0 + 12 * 3600_000;
  const makeAdmin = () => {
    const admin = new WorldAdmin({ firestore: db, repository, game, seedSecret: 'emulator-worker-seed-only' });
    admin.rollover = async () => ({ monthId, closed: [] });
    return admin;
  };
  const result = await makeAdmin().tick({ worldId, nowMs });
  assert.equal(result.done, true);
  const before = await game.ownerView('worker-owner', monthId, ctx(worldId, 'worker-owner', nowMs));
  assert(before.spendable > 0);
  assert.equal(before.doc.simSecond, Math.floor(nowMs / 1000));
  await Promise.all([makeAdmin().tick({ worldId, nowMs }), makeAdmin().tick({ worldId, nowMs })]);
  const after = await game.ownerView('worker-owner', monthId, ctx(worldId, 'worker-owner', nowMs));
  assert.equal(after.spendable, before.spendable);
  assert.equal(after.doc.shipmentCounter, before.doc.shipmentCounter);
  const ledger = await db.collection('worlds').doc(sha(worldId)).collection('owners').doc(sha('worker-owner')).collection('months').doc(monthId).collection('ledger').get();
  assert.equal(ledger.size, after.doc.shipmentCounter);
});
