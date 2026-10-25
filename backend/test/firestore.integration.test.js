import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { LedgerCommandService } from '../src/commands.js';
import { FirestoreLedgerRepository } from '../src/firestore-repository.js';
import { createLedgerHttpServer } from '../src/http.js';
import { validateRuntimeEnvironment } from '../src/server.js';

const env = process.env;
assert.equal(env.FIREBASE_PROJECT_ID, 'demo-extraction', 'integration tests require the exact demo project');
assert.deepEqual(validateRuntimeEnvironment(env), { projectId: 'demo-extraction', emulator: true });
const monthId = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const app = initializeApp({ projectId: 'demo-extraction' }, `integration-${randomUUID()}`);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = [];

async function signup() {
  const response = await fetch(`http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: 'integration-password-123', returnSecureToken: true }),
  });
  if (response.status !== 200) assert.fail(`Auth emulator signup failed: ${await response.text()}`);
  const payload = await response.json();
  await auth.verifyIdToken(payload.idToken, true);
  accounts.push(payload.localId);
  return { uid: payload.localId, token: payload.idToken };
}

async function createWorld(worldId, uid, { status = 'active', membership = 'active', activeMonth = monthId } = {}) {
  const worldRef = db.collection('worlds').doc(sha(worldId));
  await worldRef.set({ worldId, activeMonthId: activeMonth, status });
  await worldRef.collection('owners').doc(sha(uid)).set({ uid, status: membership, role: 'owner' });
  return worldRef;
}

function makeService() { return new LedgerCommandService(new FirestoreLedgerRepository(db), { starterGrantAmount: 100 }); }

async function withHttp(service, run) {
  const server = createLedgerHttpServer({ auth, service, clock: Date.now });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('Firestore transactions are durable, idempotent across instances, and CAS guards prevent overspend', async () => {
  const user = await signup();
  const worldId = `duplicate-${randomUUID()}`;
  await createWorld(worldId, user.uid);
  const serviceA = makeService();
  const serviceB = makeService();
  const context = { auth: { uid: user.uid }, worldId, activeMonthId: monthId, now: Date.now() };
  const request = { monthId, requestId: 'same-grant', expectedVersion: 0 };
  const [a, b] = await Promise.all([serviceA.grantStarter(request, context), serviceB.grantStarter(request, context)]);
  assert.deepEqual(a, b);
  const outcomes = await Promise.allSettled([
    serviceA.fundEscrow({ monthId, requestId: 'fund-a', expectedVersion: 1, amount: 70 }, context),
    serviceB.fundEscrow({ monthId, requestId: 'fund-b', expectedVersion: 1, amount: 60 }, context),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected' && outcome.reason.code === 'STALE_VERSION').length, 1);
  const successfulIndex = outcomes.findIndex((outcome) => outcome.status === 'fulfilled');
  const successfulRequestId = successfulIndex === 0 ? 'fund-a' : 'fund-b';
  const successfulAmount = successfulIndex === 0 ? 70 : 60;
  const restartedService = new LedgerCommandService(new FirestoreLedgerRepository(getFirestore(app)), { starterGrantAmount: 100 });
  const wallet = await restartedService.wallet(user.uid, monthId, context);
  assert.equal(wallet.totalOwned, 100);
  assert.equal(wallet.version, 2);
  await assert.rejects(restartedService.fundEscrow({ monthId, requestId: successfulRequestId, expectedVersion: 2, amount: successfulAmount + 1 }, context), (error) => error.code === 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await restartedService.wallet(user.uid, monthId, context), wallet, 'failed altered-payload retry leaves durable state unchanged');
});

test('HTTP verifies emulator-issued ID tokens and Firestore enforces membership, world status, month, and private wallet projection', async () => {
  const owner = await signup();
  const stranger = await signup();
  const worldId = `guards-${randomUUID()}`;
  const worldRef = await createWorld(worldId, owner.uid);
  const service = makeService();
  await withHttp(service, async (base) => {
    const request = (token, path, init = {}) => fetch(`${base}/v1/worlds/${worldId}/${path}`, { ...init, headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    let response = await request(owner.token, 'grant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'g', expectedVersion: 0 }) });
    assert.equal(response.status, 200);
    const wallet = await response.json();
    assert.equal(wallet.ownerId, owner.uid);
    assert.deepEqual(Object.keys(wallet).sort(), ['ownerId', 'monthId', 'spendable', 'escrow', 'totalOwned', 'version'].sort());
    response = await request(stranger.token, 'wallet');
    assert.equal(response.status, 403);
    response = await request('forged-token', 'wallet');
    assert.equal(response.status, 401);
    response = await request(owner.token, 'fund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monthId, requestId: 'alter', expectedVersion: 1, amount: 10, balance: 999 }) });
    assert.equal(response.status, 400);
    response = await request(owner.token, 'fund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(9000) });
    assert.equal(response.status, 413);
    await auth.updateUser(owner.uid, { disabled: true });
    response = await request(owner.token, 'wallet');
    assert.equal(response.status, 401, 'disabled users cannot continue with a previously issued token');
    await auth.updateUser(owner.uid, { disabled: false });
  });

  const restRead = await fetch(`http://${env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-extraction/databases/(default)/documents/worlds/${sha(worldId)}`, { headers: { Authorization: `Bearer ${owner.token}` } });
  assert.equal(restRead.status, 403, 'Firestore rules deny direct client reads even for an authenticated member');
  const restWrite = await fetch(`http://${env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-extraction/databases/(default)/documents/worlds/${sha(worldId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { status: { stringValue: 'tampered' } } }),
  });
  assert.equal(restWrite.status, 403, 'Firestore rules deny direct client writes');

  const inactiveWorldId = `inactive-${randomUUID()}`;
  await createWorld(inactiveWorldId, owner.uid, { membership: 'suspended' });
  const closedWorldId = `closed-${randomUUID()}`;
  await createWorld(closedWorldId, owner.uid, { status: 'closed' });
  const staleWorldId = `stale-${randomUUID()}`;
  const staleRef = await createWorld(staleWorldId, owner.uid, { activeMonth: '2026-01' });
  await withHttp(service, async (base) => {
    const call = (id) => fetch(`${base}/v1/worlds/${id}/wallet`, { headers: { Authorization: `Bearer ${owner.token}` } });
    assert.equal((await call(inactiveWorldId)).status, 403);
    assert.equal((await call(closedWorldId)).status, 409);
    assert.equal((await call(staleWorldId)).status, 409);
  });
  await staleRef.delete();
  await worldRef.delete();
});

test('corrupt persisted receipts fail closed without exposing added private fields', async () => {
  const owner = await signup();
  const worldId = `corrupt-${randomUUID()}`;
  const worldRef = await createWorld(worldId, owner.uid);
  const service = makeService();
  await service.grantStarter({ monthId, requestId: 'receipt', expectedVersion: 0 }, { auth: { uid: owner.uid }, worldId, activeMonthId: monthId, now: Date.now() });
  const receiptRef = worldRef.collection('owners').doc(sha(owner.uid)).collection('months').doc(monthId).collection('commands').doc(sha('receipt'));
  const receipt = (await receiptRef.get()).data();
  await receiptRef.set({ ...receipt, result: { ...receipt.result, hiddenSeed: 'never-return-this' } });
  await withHttp(service, async (base) => {
    const response = await fetch(`${base}/v1/worlds/${worldId}/grant`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ monthId, requestId: 'receipt', expectedVersion: 0 }) });
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.equal(body.includes('never-return-this'), false);
    assert.equal(body, '{"error":"INTERNAL_ERROR"}');
  });
  await worldRef.delete();
});

test.after(async () => {
  for (const uid of accounts) {
    try { await auth.deleteUser(uid); } catch { /* Emulator cleanup only. */ }
  }
  await app.delete();
});
