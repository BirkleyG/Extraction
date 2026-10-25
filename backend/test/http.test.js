import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerHttpServer } from '../src/http.js';
import { LedgerCommandService } from '../src/commands.js';
import { MemoryLedgerRepository } from '../src/ledger.js';
import { parseGrantAmount, validateRuntimeEnvironment } from '../src/server.js';

async function withServer(run) {
  const service = new LedgerCommandService(new MemoryLedgerRepository(), { starterGrantAmount: 50 });
  const auth = { async verifyIdToken(token, checkRevoked) {
    if (token !== 'valid-test-token' || checkRevoked !== true) throw new Error('bad token');
    return { uid: 'member-1' };
  } };
  const server = createLedgerHttpServer({ auth, service, clock: () => Date.UTC(2026, 9, 25) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); }
}

test('HTTP transport checks verified identity, allowlists actions, derives server month and exposes owner wallet only', async () => {
  await withServer(async (base) => {
    const headers = { Authorization: 'Bearer valid-test-token' };
    let response = await fetch(`${base}/v1/worlds/demo-world/grant`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'grant-1', expectedVersion: 0 }) });
    assert.equal(response.status, 200);
    const grant = await response.json();
    assert.equal(grant.totalOwned, 50);
    assert.deepEqual(Object.keys(grant).sort(), ['ownerId', 'monthId', 'spendable', 'escrow', 'totalOwned', 'version'].sort());
    response = await fetch(`${base}/v1/worlds/demo-world/wallet`, { headers });
    assert.deepEqual(await response.json(), grant);
    response = await fetch(`${base}/v1/worlds/demo-world/fund`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ monthId: '2026-10', requestId: 'fund-1', expectedVersion: 1, amount: 15, ownerId: 'other' }) });
    assert.equal(response.status, 400);
    response = await fetch(`${base}/v1/worlds/demo-world/wallet`);
    assert.equal(response.status, 401);
    response = await fetch(`${base}/v1/worlds/demo-world/wallet`, { method: 'POST', headers });
    assert.equal(response.status, 405);
  });
});

test('startup validation fails closed on mixed or remote emulator configuration and grant config is explicit', () => {
  assert.throws(() => validateRuntimeEnvironment({}), /FIREBASE_PROJECT_ID/);
  assert.throws(() => validateRuntimeEnvironment({ FIREBASE_PROJECT_ID: 'demo-x', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' }), /both be configured/);
  assert.throws(() => validateRuntimeEnvironment({ FIREBASE_PROJECT_ID: 'prod-x', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099', FIRESTORE_EMULATOR_HOST: 'localhost:8080' }), /demo-\*/);
  assert.throws(() => validateRuntimeEnvironment({ FIREBASE_PROJECT_ID: 'demo-x', FIREBASE_AUTH_EMULATOR_HOST: 'host.docker.internal:9099', FIRESTORE_EMULATOR_HOST: 'localhost:8080' }), /loopback/);
  assert.deepEqual(validateRuntimeEnvironment({ FIREBASE_PROJECT_ID: 'demo-x', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), { projectId: 'demo-x', emulator: true });
  assert.throws(() => parseGrantAmount(''), /explicitly configured/);
  assert.throws(() => parseGrantAmount('9007199254740992'), /safe integer/);
  assert.equal(parseGrantAmount('100'), 100);
});
