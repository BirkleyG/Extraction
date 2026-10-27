import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalClient } from '../canonical-client.js';
const response = (version, status = 200, extra = {}) => ({ ok: status < 400, status, json: async () => ({ state: { coins: version }, version, ...extra }) });
function client(fetchImpl) { let id = 0; return createCanonicalClient({ baseUrl: 'https://game.test/', worldId: 'one world', token: async () => 'private-token', fetchImpl, requestId: () => `request-${++id}` }); }
test('retries a lost command response with the identical idempotency body', async () => {
  const calls = [];
  const game = client(async (url, options) => { calls.push({ url, ...options }); if (calls.length === 1) throw new TypeError('connection lost'); return response(1); });
  await game.send([{ kind: 'shaft', payload: {} }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].url, 'https://game.test/v1/worlds/one%20world/game');
  assert.deepEqual(JSON.parse(calls[0].body), { requestId: 'request-1', kind: 'shaft', payload: {} });
});
test('serializes commands and carries forward the confirmed server version', async () => {
  const bodies = [];
  const game = client(async (_url, options) => { bodies.push(JSON.parse(options.body)); await Promise.resolve(); return response(bodies.length); });
  await Promise.all([game.send([['upgrade', { type: 'dig', count: 10, shaftNumber: 1 }]]), game.send([['dispatch', {}]])]);
  assert.equal(bodies[1].expectedVersion, 1);
  assert.equal(bodies[0].kind, 'upgrade');
  assert.equal(bodies[1].requestId, 'request-2');
});
test('refreshes a stale version once and retains command identity', async () => {
  const calls = [];
  const game = client(async (_url, options) => { calls.push(options); if (calls.length === 1) return response(0, 409, { error: 'STALE_VERSION' }); return response(calls.length === 2 ? 7 : 8); });
  await game.send([['policy', { auto: true }]]);
  assert.equal(calls[1].method, 'GET');
  const before = JSON.parse(calls[0].body), after = JSON.parse(calls[2].body);
  assert.equal(after.requestId, before.requestId);
  assert.equal(after.expectedVersion, 7);
});
test('coalesces reads and rejects malformed state wrappers', async () => {
  let calls = 0;
  const game = client(async () => { calls++; return response(2); });
  await Promise.all([game.fetchView(), game.fetchView()]);
  assert.equal(calls, 1);
  const malformed = client(async () => ({ ok: true, json: async () => ({ version: 1 }) }));
  await assert.rejects(malformed.fetchView(), { code: 'INVALID_GAME_RESPONSE' });
});
test('does not invent success after repeated connection failures; later work can proceed', async () => {
  let connected = false;
  const game = client(async () => { if (!connected) throw new TypeError('offline'); return response(1); });
  await assert.rejects(game.send([['dispatch', {}]]), /offline/);
  connected = true;
  assert.equal((await game.fetchView()).state.coins, 1);
});
test('returns a catching-up snapshot without replaying an unapplied command', async () => {
  let calls = 0;
  const game = client(async () => { calls++; return response(12, 409, { error: 'CATCHING_UP', catchingUp: true }); });
  const result = await game.send([['dispatch', {}]]);
  assert.equal(result.catchingUp, true);
  assert.equal(result.version, 12);
  assert.equal(calls, 1);
});
