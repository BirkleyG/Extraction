// End-to-end tests for the game server. Runs against the in-memory store, and also
// against Postgres when TEST_DATABASE_URL is set.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import pg from 'pg';
import { startServer } from '../server.js';
import { createStore } from '../store.js';

const backends = [['memory', null]];
if (process.env.TEST_DATABASE_URL) backends.push(['postgres', process.env.TEST_DATABASE_URL]);

for (const [label, url] of backends) {
  describe(`server (${label})`, () => {
    let srv, base;
    const fakeAi = {
      enabled: true, providers: { anthropic: true, openai: true }, dailyLimit: 3, perPlayerLimit: 2,
      defaultModel: () => 'claude-opus-5-5',
      listModels: async () => [{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'anthropic' }, { id: 'gpt-x', label: 'ChatGPT · gpt-x', provider: 'openai' }],
      canUse: m => !!m && !/^nope/.test(m),
      async json(model, p, tier) { return { echo: p, tier, model }; },
    };

    before(async () => {
      if (url) {
        const c = new pg.Client({ connectionString: url }); await c.connect();
        await c.query('DROP TABLE IF EXISTS docs, players, locks, ai_usage'); await c.end();
      }
      const store = await createStore(url);
      srv = await startServer({ port: 0, store, ai: fakeAi, env: { GAME_CODE: 'dig', ADMIN_CODE: 'boss', DATABASE_URL: '' } });
      base = `http://127.0.0.1:${srv.port}`;
    });
    after(async () => { await srv.close(); });

    async function call(method, path, body, token) {
      const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    }
    const join = (name, extra = {}) => call('POST', '/api/join', { name, code: 'dig', ...extra });

    test('invite code is required and names are protected', async () => {
      assert.equal((await call('POST', '/api/join', { name: 'Nope', code: 'wrong' })).status, 403);
      const a = await join('Alice');
      assert.equal(a.status, 200);
      assert.equal(a.body.owner, false);
      assert.equal((await join('alice')).status, 409, 'same name, different case, is taken');
      const again = await join('Alice', { recovery: a.body.token });
      assert.equal(again.status, 200);
      assert.equal(again.body.id, a.body.id, 'device code signs in to the same player');
      assert.equal(again.body.token, a.body.token, 'other device stays signed in');
      const boss = await call('POST', '/api/join', { name: 'Boss', code: 'boss' });
      assert.equal(boss.body.owner, true);
    });

    test('requests without a token are rejected', async () => {
      assert.equal((await call('GET', '/api/doc/world/current')).status, 401);
      assert.equal((await call('GET', '/api/me', null, 'bogus')).status, 401);
    });

    test('players can only write their own colony; world is shared', async () => {
      const a = (await join('Carol')).body, b = (await join('Dave')).body;
      assert.equal((await call('PUT', `/api/doc/colonies/${a.id}`, { data: { coin: 5 } }, a.token)).status, 200);
      assert.equal((await call('PUT', `/api/doc/colonies/${a.id}`, { data: { coin: 1e12 } }, b.token)).status, 403);
      assert.equal((await call('PUT', '/api/doc/world/other', { data: { x: 1 } }, b.token)).status, 403);
      assert.equal((await call('PUT', '/api/doc/secrets/x', { data: { x: 1 } }, b.token)).status, 400);
      assert.equal((await call('PUT', '/api/doc/world/current', { data: { planet: { v: 2 } } }, b.token)).status, 200);
      const got = await call('GET', `/api/doc/colonies/${a.id}`, null, b.token);
      assert.deepEqual(got.body, { exists: true, data: { coin: 5, uid: a.id } });
      const list = await call('GET', '/api/coll/colonies', null, b.token);
      assert.ok(list.body.docs.some(d => d.id === a.id));
    });

    test('feed entries are stamped and ordered', async () => {
      const a = (await join('Erin')).body;
      for (const text of ['one', 'two', 'three']) { await call('POST', '/api/coll/feed', { data: { text, kind: 'info' } }, a.token); await new Promise(r => setTimeout(r, 3)); }
      const r = await call('GET', '/api/coll/feed?orderBy=t&dir=desc&limit=2', null, a.token);
      assert.deepEqual(r.body.docs.map(d => d.data.text), ['three', 'two']);
      assert.equal(r.body.docs[0].data.by, a.id);
    });

    test('world lock is exclusive until it expires', async () => {
      const a = (await join('Finn')).body, b = (await join('Gina')).body;
      assert.equal((await call('POST', '/api/lock/world', { ttlMs: 1000 }, a.token)).body.acquired, true);
      assert.equal((await call('POST', '/api/lock/world', { ttlMs: 1000 }, b.token)).body.acquired, false);
      assert.equal((await call('POST', '/api/lock/world', { ttlMs: 1000 }, a.token)).body.acquired, true, 'holder can renew');
      await new Promise(r => setTimeout(r, 1100));
      assert.equal((await call('POST', '/api/lock/world', { ttlMs: 1000 }, b.token)).body.acquired, true);
    });

    test('live updates reach other players over WebSocket', async () => {
      const a = (await join('Hank')).body, b = (await join('Iris')).body;
      const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?token=${b.token}`);
      const msgs = [];
      await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
      ws.on('message', m => msgs.push(JSON.parse(m)));
      ws.send(JSON.stringify({ op: 'sub', coll: 'colonies' }));
      await waitFor(() => msgs.some(m => m.op === 'init'));
      await call('PUT', `/api/doc/colonies/${a.id}`, { data: { coin: 42 } }, a.token);
      await waitFor(() => msgs.some(m => m.op === 'set' && m.id === a.id));
      assert.equal(msgs.find(m => m.op === 'set').data.coin, 42);
      ws.close();
      const bad = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?token=nope`);
      const code = await new Promise(res => bad.on('close', c => res(c)));
      assert.equal(code, 4001);
    });

    test('owner picks the AI model for everyone', async () => {
      const boss = (await call('POST', '/api/join', { name: 'Owner2', code: 'boss' })).body;
      const pleb = (await join('Pleb')).body;
      const list = await call('GET', '/api/ai/models', null, pleb.token);
      assert.equal(list.body.model, 'claude-opus-5-5');
      assert.equal(list.body.canChange, false);
      assert.equal(list.body.options.length, 2);
      assert.equal((await call('PUT', '/api/ai/model', { model: 'gpt-x' }, pleb.token)).status, 403);
      assert.equal((await call('PUT', '/api/ai/model', { model: 'nope-1' }, boss.token)).status, 400);
      assert.equal((await call('PUT', '/api/ai/model', { model: 'gpt-x' }, boss.token)).status, 200);
      assert.equal((await call('GET', '/api/ai/models', null, pleb.token)).body.model, 'gpt-x');
      await call('PUT', '/api/ai/model', { model: 'claude-opus-5-5' }, boss.token);
    });

    test('AI calls go through the server with daily limits', async () => {
      const a = (await join('Jade')).body, b = (await join('Kai')).body;
      const r = await call('POST', '/api/ai', { prompt: 'hi', tier: 'quick' }, a.token);
      assert.deepEqual(r.body.result, { echo: 'hi', tier: 'quick', model: 'claude-opus-5-5' });
      await call('POST', '/api/ai', { prompt: 'hi' }, a.token);
      assert.equal((await call('POST', '/api/ai', { prompt: 'hi' }, a.token)).status, 429, 'per-player limit');
      assert.equal((await call('POST', '/api/ai', { prompt: 'hi' }, b.token)).status, 200);
      assert.equal((await call('POST', '/api/ai', { prompt: 'hi' }, b.token)).status, 429, 'server-wide limit');
    });

    test('serves the game page with the network adapter', async () => {
      const html = await (await fetch(base + '/')).text();
      assert.match(html, /<script src="\/net\.js"><\/script>/);
      assert.equal((await fetch(base + '/net.js')).status, 200);
      assert.equal((await (await fetch(base + '/healthz')).json()).ok, true);
    });
  });
}

async function waitFor(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 20)); }
}
