// v2 server: authoritative colonies, shared market, leaderboard and month rollover.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server.js';
import { createStore } from '../store.js';

describe('v2 server', () => {
  let srv, base, T = Date.UTC(2026, 10, 13, 12);
  const clock = () => T;

  before(async () => {
    srv = await startServer({ port: 0, store: await createStore(null), ai: { enabled: false, providers: {}, defaultModel: () => '', canUse: () => false, listModels: async () => [] }, env: { ADMIN_CODE: 'boss', DATABASE_URL: '' }, now: clock, noTimers: true });
    base = `http://127.0.0.1:${srv.port}`;
  });
  after(() => srv.close());

  async function call(method, path, body, token) {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  const join = (name, code = '') => call('POST', '/api/join', { name, code }).then(r => r.body);

  test('a new player sees the planet, starts a colony and plays', async () => {
    const a = await join('Ana');
    const s0 = await call('GET', '/api/v2/state', null, a.token);
    assert.equal(s0.status, 200);
    assert.equal(s0.body.colony, null);
    assert.equal(s0.body.world.planet.ores.length, 7);
    assert.equal(s0.body.world.parties.length, 24, 'buyer parties for refined goods');
    const h = await call('GET', '/api/v2/history', null, a.token);
    assert.equal(h.status, 200);
    assert.ok(Array.isArray(h.body.me) && Array.isArray(h.body.board) && typeof h.body.prices === 'object');
    const region = s0.body.world.planet.regions[1].id;
    const st = await call('POST', '/api/v2/start', { species: { name: 'Gloops', color: '#33ccff' }, siteRegion: region }, a.token);
    assert.equal(st.status, 200);
    assert.equal(st.body.colony.siteRegion, region);
    const coin0 = st.body.colony.coin;
    const hire = await call('POST', '/api/v2/command', { cmd: { type: 'hire', n: 1 } }, a.token);
    assert.equal(hire.status, 200, JSON.stringify(hire.body));
    assert.ok(hire.body.colony.coin < coin0, 'hiring costs coin');
    assert.ok(hire.body.colony.miners >= 1);
  });

  test('each player lands on their own starting site', async () => {
    const p1 = await join('Site1'), p2 = await join('Site2');
    const s1 = (await call('GET', '/api/v2/state', null, p1.token)).body;
    const start = s1.world.planet.sites.find(x => x.start && !s1.takenSites.includes(x.id));
    assert.ok(start, 'a free start site');
    const a = await call('POST', '/api/v2/start', { siteId: start.id }, p1.token);
    assert.equal(a.status, 200);
    assert.equal(a.body.colony.site && a.body.colony.site.id, start.id);
    const s2 = (await call('GET', '/api/v2/state', null, p2.token)).body;
    assert.ok(s2.takenSites.includes(start.id), 'taken sites are shown to others');
    const b = await call('POST', '/api/v2/start', { siteId: start.id }, p2.token);
    assert.equal(b.status, 409, 'cannot land on a taken site');
  });

  test('server time drives progress; clients cannot set money', async () => {
    const b = await join('Bo');
    const s = await call('GET', '/api/v2/state', null, b.token);
    await call('POST', '/api/v2/start', { siteRegion: s.body.world.planet.regions[0].id }, b.token);
    await call('POST', '/api/v2/command', { cmd: { type: 'hire', n: 'max' } }, b.token);
    const before = (await call('GET', '/api/v2/state', null, b.token)).body.colony;
    T += 30 * 60_000;
    const later = (await call('GET', '/api/v2/state', null, b.token)).body.colony;
    assert.ok(later.earned > before.earned, 'colony earned while away');
    const bad = await call('POST', '/api/v2/command', { cmd: { type: 'setCoin', coin: 1e12 } }, b.token);
    assert.equal(bad.status, 422);
    assert.ok(bad.body.colony.coin < 1e12);
    const nope = await call('POST', '/api/v2/command', { cmd: { type: 'upgradeLift', n: 1e9 } }, b.token);
    assert.ok(nope.body.colony.coin >= 0);
  });

  test('leaderboard lists this month and the month rolls into the Hall of Fame', async () => {
    const board = await call('GET', '/api/v2/board', null, (await join('Cy')).token);
    assert.ok(board.body.month.length >= 2);
    const boss = await join('Boss', 'boss');
    const w0 = (await call('GET', '/api/v2/state', null, boss.token)).body.world;
    assert.equal((await call('POST', '/api/v2/admin/end-month', {}, (await join('Dee')).token)).status, 403);
    T = w0.endsAt + 1000;
    const r = await call('POST', '/api/v2/admin/end-month', {}, boss.token);
    assert.equal(r.body.rolled, true);
    const after = await call('GET', '/api/v2/board', null, boss.token);
    assert.equal(after.body.hall.length, 1);
    assert.ok(after.body.hall[0].winnerName);
    assert.ok(after.body.allTime.length >= 2);
    const s = (await call('GET', '/api/v2/state', null, boss.token)).body;
    assert.notEqual(s.world.planet.id, w0.planet.id, 'new planet');
    assert.equal(s.colony, null, 'everyone starts fresh');
    assert.ok(s.grant >= 0);
  });
});
