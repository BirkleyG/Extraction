// Connects the original Mineshaft Capital game to this server.
// The game was written against an artifact runtime (window.claude.use('db'|'user'|'sample')).
// This file provides the same small API, backed by our REST + WebSocket server.
(function () {
  'use strict';
  const TOKEN_KEY = 'msc_server_token';
  let token = localStorage.getItem(TOKEN_KEY);
  let me = null;

  async function api(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      if (r.status === 401 && url !== '/api/join') { localStorage.removeItem(TOKEN_KEY); }
      const err = new Error((j && j.error) || ('Server error ' + r.status));
      err.code = (j && j.code) || 'http_' + r.status;
      err.status = r.status;
      throw err;
    }
    return j;
  }

  // ---------- sign in ----------
  const ready = (async () => {
    if (token) { try { me = await api('GET', '/api/me'); return; } catch (e) { token = null; } }
    me = await signIn();
  })();

  function signIn() {
    return new Promise(async resolve => {
      let cfg = { inviteRequired: false };
      try { cfg = await api('GET', '/api/config'); } catch (e) {}
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `<form class="sheet" id="mscJoin" autocomplete="off">
        <h1>Mineshaft Capital</h1>
        <p class="lede">Shared planet, real friends, one month to get rich. Pick a name to join the colony network.</p>
        <label class="f">Your name <input type="text" id="mscName" maxlength="24" required></label>
        ${cfg.inviteRequired ? '<label class="f">Invite code <input type="password" id="mscCode" required></label>' : ''}
        <details><summary class="lede">Already playing on another device?</summary>
          <label class="f">Device code (Settings on your other device) <input type="password" id="mscRecovery"></label></details>
        <div class="btnrow"><button class="buy" type="submit">Join</button></div>
        <p class="note" id="mscErr" hidden></p></form>`;
      document.body.appendChild(ov);
      setTimeout(() => ov.querySelector('#mscName').focus(), 50);
      ov.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        const errEl = ov.querySelector('#mscErr');
        errEl.hidden = true;
        try {
          const codeEl = ov.querySelector('#mscCode');
          const j = await api('POST', '/api/join', {
            name: ov.querySelector('#mscName').value,
            code: codeEl ? codeEl.value : '',
            recovery: ov.querySelector('#mscRecovery').value.trim(),
          });
          token = j.token; localStorage.setItem(TOKEN_KEY, token);
          ov.remove();
          resolve({ id: j.id, name: j.name, owner: j.owner });
        } catch (err) { errEl.textContent = err.message; errEl.hidden = false; }
      });
    });
  }

  // ---------- live updates ----------
  const cache = {}; // coll -> Map(id -> data)
  const loaded = {}; // coll -> bool
  const listeners = {}; // coll -> Set(fn)
  let ws = null, wsOpen = false, backoff = 1000;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => { wsOpen = true; backoff = 1000; for (const c in listeners) ws.send(JSON.stringify({ op: 'sub', coll: c })); };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.op === 'init') { cache[m.coll] = new Map(m.docs.map(d => [d.id, d.data])); loaded[m.coll] = true; emit(m.coll, null); }
      else if (m.op === 'set') { (cache[m.coll] = cache[m.coll] || new Map()).set(m.id, m.data); emit(m.coll, m.id); }
    };
    ws.onclose = ev => {
      wsOpen = false;
      if (ev.code === 4001) { localStorage.removeItem(TOKEN_KEY); return; }
      setTimeout(connect, backoff); backoff = Math.min(15000, backoff * 2);
    };
  }
  function emit(coll, id) { for (const fn of listeners[coll] || []) { try { fn(id); } catch (e) { console.error(e); } } }
  function listen(coll, fn) {
    const isNew = !listeners[coll];
    (listeners[coll] = listeners[coll] || new Set()).add(fn);
    if (!ws) connect();
    else if (isNew && wsOpen) ws.send(JSON.stringify({ op: 'sub', coll }));
    else if (loaded[coll]) setTimeout(() => fn(null), 0);
    return () => listeners[coll].delete(fn);
  }

  const docSnap = (id, data) => ({ id, exists: data != null, data: () => data });
  function querySnap(coll, q) {
    let rows = [...(cache[coll] || new Map()).entries()].map(([id, data]) => ({ id, data }));
    if (q.orderBy) rows.sort((a, b) => {
      const x = a.data[q.orderBy], y = b.data[q.orderBy];
      return (x < y ? -1 : x > y ? 1 : 0) * (q.dir === 'desc' ? -1 : 1);
    });
    if (q.limit) rows = rows.slice(0, q.limit);
    return { docs: rows.map(r => docSnap(r.id, r.data)), size: rows.length };
  }

  // ---------- db API (same shape the game already uses) ----------
  function doc(p) {
    const [coll, id] = String(p).split('/');
    return {
      async get() { const j = await api('GET', `/api/doc/${coll}/${id}`); return docSnap(id, j.data); },
      async set(data) { await api('PUT', `/api/doc/${coll}/${id}`, { data }); },
      async acquire(o) { if (coll !== 'locks') throw new Error('Only locks can be acquired'); return api('POST', `/api/lock/${id}`, { ttlMs: (o && o.ttlMs) || 20000 }); },
      onSnapshot(cb) {
        return listen(coll, changed => { if (changed == null || changed === id) cb(docSnap(id, (cache[coll] && cache[coll].get(id)) ?? null)); });
      },
    };
  }
  function collection(coll, q = {}) {
    return {
      orderBy(field, dir) { return collection(coll, Object.assign({}, q, { orderBy: field, dir: dir || 'asc' })); },
      limit(n) { return collection(coll, Object.assign({}, q, { limit: n })); },
      async get() {
        const qs = new URLSearchParams();
        if (q.orderBy) { qs.set('orderBy', q.orderBy); qs.set('dir', q.dir); }
        if (q.limit) qs.set('limit', q.limit);
        const j = await api('GET', `/api/coll/${coll}?${qs}`);
        return { docs: j.docs.map(d => docSnap(d.id, d.data)), size: j.docs.length };
      },
      async add(data) { return api('POST', `/api/coll/${coll}`, { data }); },
      onSnapshot(cb) { return listen(coll, () => cb(querySnap(coll, q))); },
    };
  }
  const db = { doc, collection };

  const user = {
    async id() { return me.id; },
    async isOwner() { return !!me.owner; },
    async can() { return true; },
    async profiles(ids) { return api('POST', '/api/profiles', { ids }); },
  };

  const sample = {
    async json(prompt, opts) {
      const j = await api('POST', '/api/ai', { prompt, tier: (opts && opts.modelTier) || 'default' });
      return j.result;
    },
  };

  window.claude = {
    async use(name) {
      await ready;
      if (name === 'db') return db;
      if (name === 'user') return user;
      if (name === 'sample') return sample;
      throw new Error('Unknown capability ' + name);
    },
  };

  // Shown inside the game's Settings sheet.
  window.MSC_ACCOUNT_HTML = function () {
    if (!me) return '';
    const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return `<h3>Account</h3><p>Signed in as <b>${e(me.name)}</b>${me.owner ? ' <span class="pill sp">owner</span>' : ''}.</p>
      <p class="lede">To play on another device, sign in there with the same name and this device code. Keep it private.</p>
      <label class="f">Device code <input type="text" readonly value="${e(token)}" onclick="this.select()"></label>
      <div class="btnrow"><button class="buy ghost sm" type="button" onclick="localStorage.removeItem('${TOKEN_KEY}');location.reload()">Sign out on this device</button></div>`;
  };
})();
