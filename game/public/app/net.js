/* Talking to the server: sign-in overlay, REST calls and the live WebSocket. */
import { esc } from './util.js';

const TOKEN_KEY = 'msc_server_token'; // shared with /classic so one sign-in works for both
export const net = {
  token: localStorage.getItem(TOKEN_KEY),
  me: null,
  onAuthLost: null,
};

export async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(net.token ? { authorization: 'Bearer ' + net.token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  if (r.status === 401 && url !== '/api/join') {
    localStorage.removeItem(TOKEN_KEY);
    net.token = null;
    if (net.onAuthLost) net.onAuthLost();
  }
  if (!r.ok && r.status !== 422) {
    const err = new Error((j && j.error) || 'Server error ' + r.status);
    err.status = r.status; err.code = j && j.code;
    throw err;
  }
  return { status: r.status, body: j };
}

export function signOut() { localStorage.removeItem(TOKEN_KEY); location.reload(); }

// Show the join sheet until the player is signed in. Resolves { id, name, owner }.
export async function ensureSignedIn() {
  if (net.token) {
    try { net.me = (await api('GET', '/api/me')).body; return net.me; } catch { net.token = null; }
  }
  let cfg = { inviteRequired: false };
  try { cfg = (await api('GET', '/api/config')).body; } catch {}
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<form class="sheet join" autocomplete="off">
      <div class="guild-seal">MG</div>
      <h1>Mineshaft Capital</h1>
      <p class="lede">One planet. One month. Your friends are digging too. Pick a name to take your seat in the Maker Guild.</p>
      <label class="f">Your name <input type="text" id="jName" maxlength="24" required autocomplete="nickname"></label>
      ${cfg.inviteRequired ? '<label class="f">Invite code <input type="password" id="jCode" required></label>' : ''}
      <details><summary>Already playing on another device?</summary>
        <label class="f">Device code (Settings on your other device) <input type="password" id="jRec"></label>
        ${cfg.inviteRequired ? '' : '<label class="f">Owner code (if you run this server) <input type="password" id="jCode"></label>'}</details>
      <div class="btnrow"><button class="buy big" type="submit">Join the Guild</button></div>
      <p class="err" id="jErr" hidden></p></form>`;
    document.body.appendChild(ov);
    setTimeout(() => ov.querySelector('#jName').focus(), 50);
    ov.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = ov.querySelector('#jErr');
      errEl.hidden = true;
      try {
        const codeEl = ov.querySelector('#jCode');
        const r = await api('POST', '/api/join', { name: ov.querySelector('#jName').value, code: codeEl ? codeEl.value : '', recovery: ov.querySelector('#jRec').value.trim() });
        if (r.status !== 200) throw new Error(r.body?.error || 'Could not join');
        net.token = r.body.token; localStorage.setItem(TOKEN_KEY, net.token);
        net.me = { id: r.body.id, name: r.body.name, owner: r.body.owner };
        ov.remove();
        resolve(net.me);
      } catch (err) { errEl.textContent = err.message; errEl.hidden = false; }
    });
  });
}

// Live collections: board2, world2, feed2. handlers[coll](msg) gets { op:'init', docs } or { op:'set', id, data }.
export function live(handlers) {
  let ws = null, backoff = 1000, closed = false;
  const connect = () => {
    if (!net.token || closed) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(net.token)}`);
    ws.onopen = () => { backoff = 1000; for (const c of Object.keys(handlers)) ws.send(JSON.stringify({ op: 'sub', coll: c })); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      const h = handlers[m.coll];
      if (h) { try { h(m); } catch (e) { console.warn('live handler', e); } }
    };
    ws.onclose = (ev) => {
      if (closed) return;
      if (ev.code === 4001) { if (net.onAuthLost) net.onAuthLost(); return; }
      setTimeout(connect, backoff); backoff = Math.min(15000, backoff * 2);
    };
    ws.onerror = () => {};
  };
  connect();
  return { close() { closed = true; try { ws && ws.close(); } catch {} } };
}

// Owner's AI model picker (same API as classic/net.js).
export async function fillModels(sel, note) {
  try {
    const j = (await api('GET', '/api/ai/models')).body;
    const groups = { anthropic: 'Claude', openai: 'ChatGPT' };
    let h = j.model ? '' : '<option value="">No AI key on the server</option>';
    for (const g in groups) {
      const opts = j.options.filter((o) => o.provider === g);
      if (opts.length) h += `<optgroup label="${groups[g]}">` + opts.map((o) => `<option value="${esc(o.id)}" ${o.id === j.model ? 'selected' : ''}>${esc(o.label)}</option>`).join('') + '</optgroup>';
    }
    if (j.model && !j.options.some((o) => o.id === j.model)) h = `<option value="${esc(j.model)}" selected>${esc(j.model)}</option>` + h;
    sel.innerHTML = h;
    sel.disabled = !j.canChange || !j.options.length;
    const missing = Object.keys(groups).filter((g) => !j.providers[g]).map((g) => groups[g]);
    note.textContent = (j.canChange ? 'You are the owner: this applies to everyone.' : 'The owner picks the model.') + (missing.length ? ` No ${missing.join(' or ')} key on the server yet.` : '');
    sel.onchange = async () => {
      note.textContent = 'Saving…';
      try {
        const r = await api('PUT', '/api/ai/model', { model: sel.value });
        note.textContent = r.status === 200 ? 'Now using ' + r.body.model + ' for everyone.' : r.body?.error || 'Failed';
      } catch (err) { note.textContent = err.message; }
    };
  } catch (err) { note.textContent = 'Could not load models: ' + err.message; }
}
