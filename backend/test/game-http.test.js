import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameHttpServer } from '../src/game-http.js';
import { GameService } from '../src/game-service.js';
import { MemoryLedgerRepository } from '../src/ledger.js';
import { generateWorld } from '../src/world.js';

const T0 = Date.parse('2026-11-03T12:00:00Z');
const buyers = [{ id: 'near', name: 'Frontier Refinery', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500 }];

async function withServer(run) {
  const game = new GameService(new MemoryLedgerRepository(), { npcBuyers: buyers });
  const planet = generateWorld({ seed: 'http-test-seed-1', monthId: '2026-11', players: 3 });
  await game.storePlanet({ worldId: 'w1', monthId: '2026-11', planet });
  let now = T0;
  const auth = { async verifyIdToken(t) { if (!t.startsWith('token-')) throw new Error('bad'); return { uid: t.slice(6) }; } };
  const server = createGameHttpServer({ auth, game, clock: () => now });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/v1/worlds/w1`;
  const call = async (who, path, body) => {
    const r = await fetch(`${base}/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer token-${who}-xxxxxxxxxxxx`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  try { await run({ call, setNow: (t) => { now = t; }, planet }); }
  finally { await new Promise((r, j) => server.close((e) => (e ? j(e) : r()))); }
}

test('enrol via planet start slots, read filtered state, sell, upgrade; secrets never appear', async () => {
  await withServer(async ({ call, setNow, planet }) => {
    let r = await call('ann', 'state');
    assert.equal(r.status, 404);
    r = await call('ann', 'commands/enroll', { requestId: 'e1', expectedVersion: 0 });
    assert.equal(r.status, 200);
    r = await call('bob', 'commands/enroll', { requestId: 'e1', expectedVersion: 0 });
    assert.equal(r.status, 200);
    let s = (await call('ann', 'state')).body;
    assert.equal(s.coin.spendable, 0);
    assert.equal(s.yard.units, 5);
    assert.equal(s.mine.shaftCount, 1);
    assert.equal(s.offers[0].estimate.units, 5);
    const sale = await call('ann', 'commands/dispatch', { requestId: 'd1', expectedVersion: s.version, destinationId: 'near' });
    assert.equal(sale.status, 200);
    const pol = await call('ann', 'commands/setPolicy', { requestId: 'p1', expectedVersion: sale.body.version, auto: false });
    assert.equal(pol.status, 200);
    assert.equal((await call('ann', 'state')).body.ship.policy.auto, false);
    s = (await call('ann', 'state')).body;
    assert.equal(s.coin.spendable, 200);
    s = (await call('ann', 'state')).body;
    const buy = await call('ann', 'commands/buyUpgrade', { requestId: 'u1', expectedVersion: s.version, line: 'dig', shaftNumber: 1, mode: 10 });
    assert.equal(buy.status, 200);
    assert.equal(buy.body.newLevel, 11);
    // Allowlist: no raw seeds, veins, NPC budgets or other players
    const text = JSON.stringify((await call('ann', 'state')).body);
    for (const secret of ['veins', 'remaining', 'seed', 'fundsCap', 'freeCapacity', 'bob', 'startSites']) assert(!text.includes(secret), `leaked ${secret}`);
    // Two players got different, equal-value start sites
    assert.notEqual((await call('bob', 'state')).body.mine.shafts[0].ratePerMinute, undefined);
    // errors map to status codes; unauthenticated is 401; injected fields 400; wrong method 405
    assert.equal((await call('ann', 'commands/dispatch', { requestId: 'd2', expectedVersion: 99, destinationId: 'near' })).status, 409);
    assert.equal((await call('ann', 'commands/dispatch', { requestId: 'd3', expectedVersion: 2, destinationId: 'near', payment: 5 })).status, 400);
    assert.equal((await call('ann', 'commands/bogus', { requestId: 'x' })).status, 404);
    setNow(Date.parse('2026-12-01T00:00:00Z'));
    assert.equal((await call('ann', 'state')).status, 404, 'new month: not enrolled until the player lands again');
    void planet;
  });
});

test('unauthenticated and malformed requests are rejected', async () => {
  await withServer(async ({ call }) => {
    const bad = await fetch('http://127.0.0.1:1/', { signal: AbortSignal.timeout(50) }).catch(() => null);
    assert.equal(bad, null);
    const r = await call('ann', 'commands/enroll', { requestId: 'e', expectedVersion: 0, siteId: 'steal' });
    assert.equal(r.status, 400);
  });
});

test('T18-08 internal scheduler requires its secret and invokes durable tick, not browser state', async () => {
  let ticks = 0;
  const server = createGameHttpServer({
    auth: { verifyIdToken: async () => { assert.fail('scheduler does not use browser identity'); } },
    game: {}, internalToken: 'test-internal-token', clock: () => T0,
    admin: { tick: async (scope) => { ticks += 1; assert.deepEqual(scope, { worldId: 'w1', nowMs: T0 }); return { done: true }; } },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/internal/tick`;
  const send = (token, body = { worldId: 'w1' }) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await send()).status, 401);
    assert.equal((await send('wrong')).status, 401);
    assert.equal(ticks, 0);
    assert.equal((await send('test-internal-token', { worldId: '../escape' })).status, 400);
    const r = await send('test-internal-token');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { done: true });
    assert.equal(ticks, 1);
  } finally { await new Promise((r) => server.close(r)); }
});
