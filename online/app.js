import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { FIREBASE_CONFIG } from '../play/firebase-config.js';
import { API_BASE, WORLD_ID } from './config.js';

const params = new URLSearchParams(location.search);
const api = (params.get('api') || API_BASE || '').replace(/\/$/, '');
const world = params.get('world') || WORLD_ID;
const POLL_MS = 20_000; // each state read costs ~9 Firestore reads; the browser extrapolates between polls
const $ = (id) => document.getElementById(id);
const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n));
const compact = (n) => (n == null ? '—' : n >= 1e12 ? `${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : fmt(n));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ERRORS = {
  INSUFFICIENT_FUNDS: 'Not enough coin.', SHIP_BUSY: 'The Hauler is still away.', NO_CARGO: 'No ore on the yard yet.',
  BUYER_FULL: 'That buyer has no room left right now.', BUYER_OUT_OF_FUNDS: 'That buyer is out of funds right now. Try another.',
  AT_CAP: 'Already at the maximum.', NO_HABITAT_CAPACITY: 'Build more habitat first.', NO_SHAFT_CAPACITY: 'Add bunkhouse levels or a new shaft first.',
  MONTH_CLOSED: 'The month has ended. Reload to start the next one.', FORBIDDEN: 'You are not a member of this world.',
  STALE_VERSION: 'Out of date — refreshed. Try again.', CATCHING_UP: 'The server is catching up. Try again in a moment.', WORLD_FULL: 'The guild is full.',
};
const say = (m, ms = 3500) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { t.hidden = true; }, ms); };

if (!api) { document.body.innerHTML = '<main style="padding:24px;font:18px system-ui;color:#efe6d4">The game server address is not configured yet. Set <code>API_BASE</code> in <code>online/config.js</code> (or open with <code>?api=http://127.0.0.1:8788&amp;emulator=1</code>).</main>'; throw new Error('API_BASE not configured'); }

// The local Auth emulator issues tokens for the demo project the local server verifies against.
const app = initializeApp(params.get('emulator') ? { ...FIREBASE_CONFIG, projectId: 'demo-extraction' } : FIREBASE_CONFIG);
const auth = getAuth(app);
if (params.get('emulator')) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
async function call(path, body) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${api}/v1/worlds/${encodeURIComponent(world)}/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error || 'ERROR');
  return json;
}

let state = null; let stateAt = 0; let mode = 1; let tab = 'sell'; let timer = null; let busy = false;
const show = (id) => { for (const s of ['auth', 'join', 'game']) $(s).hidden = s !== id; };

// ---- auth ----
$('google').onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { $('authErr').textContent = e.message; } };
$('emailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const up = e.submitter?.dataset.mode === 'up';
  try { await (up ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth, $('email').value, $('password').value); $('authErr').textContent = ''; }
  catch (err) { $('authErr').textContent = err.code?.replace('auth/', '').replaceAll('-', ' ') || err.message; }
});
$('signout').onclick = () => signOut(auth);
$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await call('join', { inviteCode: $('invite').value.trim() }); $('joinErr').textContent = ''; await boot(); }
  catch (err) { $('joinErr').textContent = err.code === 'FORBIDDEN' ? 'That invite code is not right.' : (ERRORS[err.code] || err.code); }
});

onAuthStateChanged(auth, async (user) => {
  clearInterval(timer); state = null;
  $('signout').hidden = !user; $('who').textContent = user ? (user.displayName || user.email || '') : '';
  if (!user) { show('auth'); return; }
  await boot();
});

async function boot() {
  try {
    await refresh();
  } catch (e) {
    if (e.code === 'NOT_ENROLLED') {
      try { await call('commands/enroll', { requestId: crypto.randomUUID(), expectedVersion: 0 }); await refresh(); } catch (e2) { return handleBootError(e2); }
    } else return handleBootError(e);
  }
  show('game');
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, POLL_MS);
}
function handleBootError(e) {
  if (e.status === 403 || e.code === 'WORLD_NOT_FOUND') { show('join'); return; }
  show('game'); $('status').textContent = `Could not reach the colony (${e.code || e.message}). Retrying…`;
  setTimeout(() => boot(), 5000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && auth.currentUser) refresh().catch(() => {}); });

async function refresh() { state = await call('state'); stateAt = performance.now(); render(); }

// ---- commands ----
async function command(kind, payload, okMessage) {
  if (busy) return; busy = true;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const r = await call(`commands/${kind}`, { requestId: crypto.randomUUID(), expectedVersion: state.version, ...payload });
        await refresh();
        say(typeof okMessage === 'function' ? okMessage(r) : okMessage);
        return r;
      } catch (e) {
        if (e.code === 'STALE_VERSION' && attempt === 0) { await refresh(); continue; }
        throw e;
      }
    }
  } catch (e) { say(ERRORS[e.code] || `Request failed (${e.code || e.message})`); await refresh().catch(() => {}); }
  finally { busy = false; }
}

// ---- rendering ----
const LINE_LABEL = { lift: 'Lift throughput', habitat: 'Habitat (crew cap)', surfaceStorage: 'Surface storage', shipCapacity: 'Hauler capacity', shipSpeed: 'Hauler speed', padLoading: 'Pad loading rate' };
const buyBtn = (act, label, price, disabled) => `<button data-act="${act}" ${disabled ? 'disabled' : ''}>${esc(label)} <span class="price">${price == null ? 'MAX' : `${mode === 1 || act === 'hire' || act === 'shaft' ? '' : 'from '}${fmt(price)} ◉`}</span></button>`;
const live = () => {
  if (!state) return { yard: 0, rate: 0 };
  const mine = state.mine.shafts.reduce((a, s) => a + s.ratePerMinute, 0);
  const rate = Math.min(mine, state.mine.lift.ratePerMinute);
  const dt = (performance.now() - stateAt) / 60000;
  return { yard: Math.min(state.yard.capacity, state.yard.units + rate * dt), rate };
};

function render() {
  if (!state) return;
  const s = state;
  $('coin').textContent = compact(s.coin.totalOwned); $('coin').title = `${fmt(s.coin.spendable)} spendable · ${fmt(s.coin.escrow)} escrow`;
  $('status').textContent = s.ship.readyInSeconds > 0 ? `Hauler away · back in ${Math.ceil(s.ship.readyInSeconds / 60)} min · paid at takeoff` : 'Hauler ready at the pad.';
  const f = (n) => fmt(n);
  const eta = (o) => (o.estimate ? `${f(o.estimate.units)} u → ${f(o.estimate.payment)} ◉ · ${Math.ceil(o.estimate.tripSeconds / 60)} min round trip` : 'No ore ready');
  $('tab-sell').innerHTML = `<h2>Where to sell</h2><p class="hint">Payment lands the moment the Hauler takes off. Each buyer has a limited daily budget.</p>`
    + s.offers.map((o) => `<div class="line"><div class="name">${esc(o.name)} <span class="tag">${o.distance} AU</span><small>${eta(o)}</small></div><div class="price">${o.bidPerUnit} ◉/u</div><button data-act="dispatch" data-id="${esc(o.id)}" ${s.ship.readyInSeconds > 0 || !o.estimate ? 'disabled' : ''}>Launch</button></div>`).join('');
  const enough = (p) => p != null && p <= s.coin.spendable;
  const m = (n) => (mode === 'max' ? 'Max' : `×${n}`);
  $('tab-build').innerHTML = `<h2>Build</h2><div class="mode">${[1, 10, 100, 'max'].map((x) => `<button data-mode="${x}" class="${String(mode) === String(x) ? 'on' : ''}">${x === 'max' ? 'MAX' : `×${x}`}</button>`).join('')}</div>`
    + `<div class="line"><div class="name">Lift throughput<small>LV ${s.mine.lift.level} · ${s.mine.lift.ratePerMinute.toFixed(1)} u/min</small></div><div>${buyBtn('line:lift:1', `Buy ${m(mode)}`, s.mine.lift.nextPrice, !enough(s.mine.lift.nextPrice))}</div></div>`
    + Object.entries({ habitat: s.lines.habitat, surfaceStorage: s.lines.surfaceStorage, shipCapacity: s.ship.lines.shipCapacity, shipSpeed: s.ship.lines.shipSpeed, padLoading: s.ship.lines.padLoading }).map(([k, l]) => `<div class="line"><div class="name">${LINE_LABEL[k]}<small>LV ${l.level} / ${l.cap}</small></div><div>${buyBtn(`line:${k}:1`, `Buy ${m(mode)}`, l.nextPrice, !enough(l.nextPrice))}</div></div>`).join('')
    + `<div class="line"><div class="name">Hire a miner<small>${s.mine.workers.hired} / ${s.mine.workers.capacity} crew</small></div><div>${buyBtn('hire', 'Hire', s.mine.workers.nextHireCost, !enough(s.mine.workers.nextHireCost))}</div></div>`
    + `<div class="line"><div class="name">Open shaft ${s.mine.shaftCount + 1}<small>${s.mine.shaftCount} / 30 open</small></div><div>${buyBtn('shaft', 'Open', s.mine.nextShaftPrice, s.mine.nextShaftPrice == null || !enough(s.mine.nextShaftPrice))}</div></div>`;
  $('shafts').innerHTML = s.mine.shafts.map((sh) => `<div class="line"><div class="name">Shaft ${sh.shaftNumber}<small>${sh.workers}/${sh.workerCapacity} miners · dig ${sh.digLevel} · carts ${sh.cartLevel} · bunks ${sh.bunkhouseLevel}</small><div class="bar"><i style="width:${Math.round(sh.bufferFill * 100)}%"></i></div></div><div style="text-align:right">${sh.ratePerMinute.toFixed(1)} u/min<br>${['dig', 'carts', 'bunkhouse'].map((k) => `<button data-act="shaft:${k}:${sh.shaftNumber}" ${enough(sh.prices[k]) ? '' : 'disabled'} title="${k}">${k === 'dig' ? 'Dig' : k === 'carts' ? 'Carts' : 'Bunks'} ${sh.prices[k] == null ? 'MAX' : fmt(sh.prices[k])}</button>`).join(' ')}</div></div>`).join('');
  $('tab-records').innerHTML = `<h2>Shipments</h2>${s.shipments.length ? `<table><tr><th>Units</th><th>Paid</th><th>To</th><th>Status</th></tr>${[...s.shipments].reverse().map((x) => `<tr><td>${f(x.units)}</td><td>${f(x.payment)} ◉</td><td>${esc(x.destinationId)}</td><td><span class="tag ${x.status === 'DELIVERED' ? 'ok' : 'way'}">${x.status === 'DELIVERED' ? 'delivered' : 'in transit'}</span></td></tr>`).join('')}</table>` : '<p class="hint">No shipments yet.</p>'}<p class="hint">Gross external earnings: ${f(s.earnings.grossExternal)} ◉</p>`;
  tick();
}

function tick() {
  if (!state) return;
  const l = live();
  $('yard').textContent = `${fmt(Math.floor(l.yard))} / ${fmt(state.yard.capacity)}`;
  const left = state.monthEndsAtMs - (state.serverNowMs + (performance.now() - stateAt));
  const d = Math.max(0, Math.floor(left / 1000));
  $('clock').textContent = `${Math.floor(d / 86400)}d ${String(Math.floor(d / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(d / 60) % 60).padStart(2, '0')}m`;
  drawScene(l);
}
setInterval(tick, 1000);

function drawScene(l) {
  const c = $('scene'); const g = c.getContext('2d'); const w = c.width; const h = c.height;
  g.fillStyle = '#2d2250'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a3a2a'; g.fillRect(0, 70, w, h - 70);                 // ground
  g.fillStyle = '#5b4631'; g.fillRect(0, 70, w, 8);
  const shafts = state.mine.shafts.length;
  for (let i = 0; i < Math.min(shafts, 8); i += 1) { g.fillStyle = '#1a1226'; g.fillRect(40, 84 + i * 16, 280, 12); g.fillStyle = '#ff9d4d'; g.fillRect(44, 88 + i * 16, 4 + Math.min(270, state.mine.shafts[i].workers * 4), 4); }
  g.fillStyle = '#7d5a3c'; g.fillRect(28, 40, 10, 40); g.fillRect(20, 36, 26, 6); // headframe
  const pct = l.yard / state.yard.capacity;                               // yard pile
  g.fillStyle = '#d98a52'; g.fillRect(360, 70 - Math.max(2, 36 * Math.min(1, pct * 4)), 80, Math.max(2, 36 * Math.min(1, pct * 4)));
  g.fillStyle = '#3b2c52'; g.fillRect(480, 66, 90, 6);                    // pad
  const away = state.ship.readyInSeconds - (performance.now() - stateAt) / 1000;
  const x = away > 0 ? 500 + ((performance.now() / 20) % 120) : 500;
  g.fillStyle = away > 0 ? '#6ec1ff' : '#efe6d4'; g.fillRect(away > 0 ? Math.min(x, 600) : 500, away > 0 ? 24 : 54, 36, 12);
  g.fillStyle = '#efe6d4'; g.font = '14px monospace';
  g.fillText(`${state.mine.shaftCount} shaft${state.mine.shaftCount === 1 ? '' : 's'} · ${l.rate.toFixed(1)} u/min`, 12, 20);
}

// ---- events ----
document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === tab); for (const n of ['sell', 'build', 'records']) $(`tab-${n}`).hidden = n !== tab; return; }
  if (t.dataset.mode) { mode = t.dataset.mode === 'max' ? 'max' : Number(t.dataset.mode); render(); return; }
  const act = t.dataset.act; if (!act) return;
  if (act === 'dispatch') return void command('dispatch', { destinationId: t.dataset.id }, (r) => `Sent ${fmt(r.shipment.units)} units — paid ${fmt(r.shipment.payment)} ◉ at takeoff.`);
  if (act === 'hire') return void command('hire', { count: 1 }, 'Miner hired.');
  if (act === 'shaft') return void command('buyShaft', {}, 'New shaft opened.');
  const [kind, line, num] = act.split(':');
  if (kind === 'line') return void command('buyUpgrade', { line, mode }, (r) => `${LINE_LABEL[line] || line} → level ${r.newLevel}.`);
  if (kind === 'shaft') return void command('buyUpgrade', { line, shaftNumber: Number(num), mode }, (r) => `${line} → level ${r.newLevel}.`);
});
