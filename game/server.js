// Mineshaft Capital server: serves the game, stores shared state in Postgres,
// pushes live updates over WebSocket, and runs Claude or ChatGPT calls with the server's keys.
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createStore } from './store.js';
import { createAi } from './ai.js';
import { createV2, SUB_COLLS } from './v2/service.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = JSON.parse(fs.readFileSync(path.join(here, 'version.json'), 'utf8')).version;

// Collections the game is allowed to touch, and who may write them.
const COLLS = new Set(['world', 'colonies', 'feed']);
const MAX_DOC_BYTES = 1_500_000;
const FEED_KEEP = 200;

export async function startServer(opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  const store = opts.store || await createStore(env.DATABASE_URL);
  const ai = opts.ai || createAi(env);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');
  const newToken = () => crypto.randomBytes(24).toString('base64url');

  async function auth(req) {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    return t ? store.playerByToken(hashToken(t)) : null;
  }
  const need = fn => async (req, res) => {
    try {
      const me = await auth(req);
      if (!me) return res.status(401).json({ error: 'Sign in first', code: 'unauthenticated' });
      await fn(req, res, me);
    } catch (e) {
      if (!e.expose) console.error(e);
      res.status(e.status || 500).json({ error: e.expose ? e.message : 'Server error', code: e.code || 'internal' });
    }
  };
  const fail = (status, code, message) => Object.assign(new Error(message), { status, code, expose: true });
  const checkColl = c => { if (!COLLS.has(c)) throw fail(400, 'invalid_argument', 'Unknown collection'); };
  const checkId = id => { if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(id || ''))) throw fail(400, 'invalid_argument', 'Bad document id'); };
  function checkData(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw fail(400, 'invalid_argument', 'Data must be an object');
    if (Buffer.byteLength(JSON.stringify(d)) > MAX_DOC_BYTES) throw fail(413, 'invalid_argument', 'Document too large');
  }
  function canWrite(me, coll, id) {
    if (coll === 'colonies') return id === me.id || me.owner; // your own colony only
    if (coll === 'world') return id === 'current'; // the game itself coordinates the shared world
    return false;
  }

  app.get('/healthz', (req, res) => res.json({ ok: true, version: VERSION, store: store.kind, ai: ai.enabled }));

  app.get('/api/config', (req, res) => res.json({ inviteRequired: !!env.GAME_CODE, ai: ai.enabled, version: VERSION }));

  // Join (or re-join on a new device) by colony-founder name + invite code.
  app.post('/api/join', async (req, res) => {
    try {
      const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
      const code = String(req.body.code || '').trim();
      if (!/^[\p{L}\p{N} _.'-]{2,24}$/u.test(name)) throw fail(400, 'invalid_argument', 'Pick a name of 2-24 letters or numbers');
      const isAdmin = !!env.ADMIN_CODE && code === env.ADMIN_CODE;
      if (env.GAME_CODE && code !== env.GAME_CODE && !isAdmin) throw fail(403, 'permission_denied', 'Wrong invite code');
      let token = newToken();
      let p = await store.playerByName(name);
      if (p) {
        // Re-joining an existing name needs that player's device code (their token), so names can't be hijacked.
        const recovery = String(req.body.recovery || '');
        if (recovery && hashToken(recovery) === p.tokenHash) token = recovery;
        else if (isAdmin) await store.updatePlayerToken(p.id, hashToken(token));
        else throw fail(409, 'name_taken', 'That name is taken. Pick another, or paste your device code from Settings on your other device.');
        if (isAdmin && !p.owner) await store.setOwner(p.id, true);
      } else {
        p = await store.createPlayer({ id: 'u' + crypto.randomBytes(6).toString('hex'), name, tokenHash: hashToken(token), owner: isAdmin });
      }
      res.json({ token, id: p.id, name: p.name, owner: isAdmin || !!p.owner });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.expose ? e.message : 'Server error', code: e.code || 'internal' });
      if (!e.expose) console.error(e);
    }
  });

  app.get('/api/me', need(async (req, res, me) => res.json({ id: me.id, name: me.name, owner: !!me.owner })));

  app.post('/api/profiles', need(async (req, res) => {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(String).slice(0, 500);
    const rows = await store.players_(ids);
    res.json(Object.fromEntries(rows.map(r => [r.id, { name: r.name }])));
  }));

  app.get('/api/doc/:coll/:id', need(async (req, res) => {
    const { coll, id } = req.params; checkColl(coll); checkId(id);
    const data = await store.getDoc(coll, id);
    res.json({ exists: data != null, data });
  }));

  app.put('/api/doc/:coll/:id', need(async (req, res, me) => {
    const { coll, id } = req.params; checkColl(coll); checkId(id); checkData(req.body.data);
    if (!canWrite(me, coll, id)) throw fail(403, 'permission_denied', 'You can only change your own colony');
    const data = req.body.data;
    if (coll === 'colonies') data.uid = id;
    const updated = await store.setDoc(coll, id, data);
    broadcast(coll, id, data);
    res.json({ ok: true, updated });
  }));

  app.get('/api/coll/:coll', need(async (req, res) => {
    const { coll } = req.params; checkColl(coll);
    res.json({ docs: await store.listColl(coll, queryOpts(req.query)) });
  }));

  app.post('/api/coll/feed', need(async (req, res, me) => {
    const b = req.body.data || {};
    const entry = { t: Date.now(), by: typeof b.by === 'string' ? b.by.slice(0, 40) : me.id, text: String(b.text || '').slice(0, 240), kind: String(b.kind || 'info').slice(0, 16) };
    const id = entry.t.toString(36) + crypto.randomBytes(3).toString('hex');
    await store.setDoc('feed', id, entry);
    broadcast('feed', id, entry);
    if (Math.random() < 0.1) store.pruneColl('feed', FEED_KEEP).catch(() => {});
    res.json({ ok: true, id });
  }));

  app.post('/api/lock/:name', need(async (req, res, me) => {
    const name = String(req.params.name); checkId(name);
    const ttl = Math.max(1000, Math.min(60000, Number(req.body.ttlMs) || 20000));
    res.json({ acquired: await store.acquireLock(name, me.id, ttl) });
  }));

  // The owner picks the model in Settings; everyone else sees which one is in use.
  async function currentModel() {
    const cfg = await store.getDoc('config', 'ai');
    const m = (cfg && cfg.model) || ai.defaultModel();
    return ai.canUse(m) ? m : '';
  }

  app.get('/api/ai/models', need(async (req, res, me) => {
    res.json({ model: await currentModel(), options: await ai.listModels(), providers: ai.providers, canChange: !!me.owner });
  }));

  app.put('/api/ai/model', need(async (req, res, me) => {
    if (!me.owner) throw fail(403, 'permission_denied', 'Only the owner can change the AI model');
    const model = String(req.body.model || '').trim();
    if (!/^[A-Za-z0-9._:-]{2,80}$/.test(model)) throw fail(400, 'invalid_argument', 'Bad model name');
    if (!ai.canUse(model)) throw fail(400, 'invalid_argument', 'The server has no API key for that model');
    await store.setDoc('config', 'ai', { model, by: me.id });
    res.json({ ok: true, model });
  }));

  app.post('/api/ai', need(async (req, res, me) => {
    const prompt = String(req.body.prompt || '');
    if (!prompt || prompt.length > 40000) throw fail(400, 'invalid_argument', 'Bad prompt');
    const model = await currentModel();
    if (!model) throw fail(503, 'ai_off', 'The server has no AI key yet');
    const day = new Date().toISOString().slice(0, 10);
    const used = await store.aiCounts(day, me.id);
    if (used.total >= ai.dailyLimit) throw fail(429, 'ai_limit', 'The Maker is out of words for today (server AI limit reached)');
    if (used.mine >= ai.perPlayerLimit) throw fail(429, 'ai_limit', 'You have used your AI calls for today');
    await store.bumpAi(day, me.id);
    try {
      res.json({ result: await ai.json(model, prompt, String(req.body.tier || 'default')) });
    } catch (e) {
      console.error('AI error', model, e.status || '', e.message);
      throw fail(502, 'ai_error', e.userMessage || 'The AI did not answer. Try again.');
    }
  }));

  // ---------- v2: server-authoritative game ----------
  const v2 = createV2({ store, ai, currentModel, broadcast: (c, i, d) => broadcast(c, i, d), now: opts.now });
  app.get('/api/v2/state', need(async (req, res, me) => res.json(await v2.state(me))));
  app.post('/api/v2/start', need(async (req, res, me) => res.json(await v2.start(me, req.body || {}))));
  app.post('/api/v2/command', need(async (req, res, me) => {
    const out = await v2.command(me, req.body && req.body.cmd);
    res.status(out.error ? 422 : 200).json(out);
  }));
  app.get('/api/v2/board', need(async (req, res) => res.json(await v2.board())));
  app.get('/api/v2/bulletin', need(async (req, res) => res.json(await v2.bulletin())));
  app.get('/api/v2/history', need(async (req, res, me) => res.json(await v2.history(me))));
  app.post('/api/v2/maker', need(async (req, res, me) => res.json(await v2.maker(me, req.body))));
  app.post('/api/v2/species', need(async (req, res, me) => res.json(await v2.species(me, req.body))));
  app.post('/api/v2/admin/end-month', need(async (req, res, me) => {
    if (!me.owner) throw fail(403, 'permission_denied', 'Owner only');
    res.json({ rolled: await v2.forceRoll() });
  }));

  app.use('/shared', express.static(path.join(here, 'shared'), { maxAge: '1m' }));
  app.use(express.static(path.join(here, 'public'), { extensions: ['html'], maxAge: '1m' }));

  const server = http.createServer(app);

  // ---------- live updates ----------
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  const subs = new Map(); // socket -> Set(coll)
  wss.on('connection', async (ws, req) => {
    const token = new URL(req.url, 'http://x').searchParams.get('token');
    const me = token ? await store.playerByToken(hashToken(token)).catch(() => null) : null;
    if (!me) { ws.close(4001, 'unauthenticated'); return; }
    subs.set(ws, new Set());
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => subs.delete(ws));
    ws.on('message', async raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.op === 'sub' && (COLLS.has(m.coll) || SUB_COLLS.has(m.coll))) {
        subs.get(ws)?.add(m.coll);
        const docs = await store.listColl(m.coll, (m.coll === 'feed' || m.coll === 'feed2') ? { orderBy: 't', desc: true, limit: 50 } : {});
        send(ws, { op: 'init', coll: m.coll, docs });
      }
    });
  });
  const ping = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  }, 30000);
  function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  function broadcast(coll, id, data) {
    const msg = JSON.stringify({ op: 'set', coll, id, data });
    for (const [ws, set] of subs) if (set.has(coll) && ws.readyState === 1) ws.send(msg);
  }

  const timers = opts.noTimers ? [] : [
    setInterval(() => v2.rollIfDue().catch(e => console.error('rollover', e)), 60_000),
    setInterval(() => v2.sweep().catch(e => console.error('sweep', e)), 60_000),
    setInterval(() => v2.maybeEvent().catch(e => console.error('event', e)), 60_000),
  ];

  const port = opts.port ?? Number(env.PORT || 3000);
  await new Promise(r => server.listen(port, r));
  const address = server.address();
  console.log(`Mineshaft Capital on :${address.port} (store: ${store.kind}, AI keys: ${Object.keys(ai.providers).filter(k => ai.providers[k]).join(', ') || 'none'})`);
  return {
    port: address.port, store,
    async close() { clearInterval(ping); timers.forEach(clearInterval); for (const ws of wss.clients) ws.terminate(); wss.close(); await new Promise(r => server.close(r)); await store.close(); },
  };
}

function queryOpts(q) {
  const o = {};
  if (q.orderBy && /^[A-Za-z_]{1,24}$/.test(q.orderBy)) { o.orderBy = q.orderBy; o.desc = q.dir === 'desc'; }
  if (q.limit) o.limit = Math.max(1, Math.min(500, Number(q.limit) || 50));
  return o;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch(e => { console.error(e); process.exit(1); });
}
