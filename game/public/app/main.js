/* Mineshaft Capital v2 client: boot, prediction loop, server sync, events -> juice. */
import * as E from '/shared/engine/index.js';
import { $, esc, fmt, engineWorld, speciesLook, store, DAY } from './util.js';
import { net, api, ensureSignedIn, live } from './net.js';
import { prefs, applyPrefs, sfx, toast, banner, popAt, bump } from './juice.js';
import { createMine, padX } from './mine.js';
import { createUI } from './ui.js';
import { onboard } from './onboard.js';

const PANEL_SUB = {
  shafts: 'Dig deeper shafts for richer ore', carts: 'Carts: more ore per miner', lift: 'Upgrade the lift to haul more ore',
  ships: 'Bigger holds for your ships', bunks: 'Bunkhouses: more miners per shaft', conveyor: 'Faster conveyors load ships quicker',
  yard: 'A bigger yard holds ore while ships are away', drill: 'Better drills open harder ore', routes: 'Pick where each ship sells',
  fleet: 'Buy more ships', pads: 'More launch pads', market: 'Watch planet-wide prices',
};

const S = {
  me: null, world: null, ew: null, colony: null, offset: 0, pending: [],
  rates: null, unl: null, bneck: null, digCost: null,
  board: new Map(), boardFull: null, feed: new Map(),
  ui: { tab: 'mine', bulk: store('msc2_bulk') ?? 1, editing: false, sheet: false, mktCls: 'hauler' },
  oreById: {}, region: null, look: null, I: null,
  now() { return Date.now() + this.offset; },
};
let ui, mine, chain = Promise.resolve(), saleCount = 0;

// ------------------------------------------------------------------ world + state
function setWorld(world) {
  S.world = world;
  S.ew = engineWorld(world);
  S.oreById = Object.fromEntries(world.planet.ores.map((o) => [o.id, o]));
  const buyers = Object.fromEntries(world.planet.buyers.map((b) => [b.id, b]));
  S.I = { buyer: (id) => buyers[id] };
}
function setColony(c) {
  S.colony = c;
  S.region = S.world.planet.regions.find((r) => r.id === c.siteRegion) || S.world.planet.regions[0];
  S.look = c.species || { name: 'kin', color: '#ff8a3d' };
}
function recalc() {
  S.rates = E.rates(S.colony, S.ew);
  S.unl = E.unlocks(S.colony, S.ew, S.now());
}
async function loadState() {
  const r = await api('GET', '/api/v2/state');
  S.offset = r.body.serverNow - Date.now();
  return r.body;
}

// ------------------------------------------------------------------ events
const seen = new Map();
const WIN = { sale: 2500, launch: 8000, vein20: 6e5, vein5: 6e5, veinOut: 6e5, unlock: Infinity, license: Infinity, salesSummary: 5000 };
function handleEvents(evs) {
  for (const e of evs || []) {
    const win = WIN[e.type];
    if (win == null) continue;
    const id = e.data?.shipId || e.data?.shaftId || e.data?.panel || e.data?.license || '';
    const k = e.type + '|' + id;
    const last = seen.get(k);
    if (last != null && Math.abs(e.at - last) < win) continue;
    seen.set(k, e.at);
    react(e);
  }
}
function react(e) {
  const coinEl = $('#coin');
  switch (e.type) {
    case 'sale': {
      const coin = e.data?.coin || 0;
      saleCount++;
      mine.pop(padX(0) + ((saleCount * 23) % 50) - 25, -70, '+' + fmt(coin));
      popAt(coinEl, '+' + fmt(coin));
      bump(coinEl.parentElement);
      sfx.coin();
      if (saleCount <= 3 || coin > 5 * Math.max(1, S.rates.coinPerMin)) toast(`<b class="gold">+${fmt(coin)}</b> ${esc(e.text)}`, 'sale');
      break;
    }
    case 'salesSummary': toast(esc(e.text), 'sale'); break;
    case 'launch': toast(esc(e.text), 'info', 2800); sfx.launch(); break;
    case 'vein20': toast(esc(e.text), 'warn'); sfx.warn(); break;
    case 'vein5': toast(esc(e.text), 'bad'); sfx.warn(); break;
    case 'veinOut': toast(esc(e.text), 'bad', 5000); sfx.warn(); break;
    case 'autoSpend': toast(esc(e.text), 'sale'); sfx.big && sfx.big(); break;
    case 'unlock': banner(E.PANELS.find((p) => p.id === e.data?.panel)?.label || e.text, PANEL_SUB[e.data?.panel] || ''); break;
    case 'license': banner(e.text.replace(/^The Guild grants you the /, ''), 'The Maker Guild grants you a new license', 'license'); break;
  }
}

// ------------------------------------------------------------------ commands
function send(cmd, btn) {
  const q = E.quote(S.colony, S.ew, cmd);
  const r = E.applyCommand(S.colony, S.ew, cmd, Math.max(S.colony.t, S.now()));
  if (r.error) {
    toast(esc(r.error), 'bad'); sfx.error();
    if (btn) { btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); }
    return;
  }
  S.colony = r.colony;
  handleEvents(r.events);
  recalc();
  const paid = q.cost > 0 && !['tutorial', 'rename', 'setRoute'].includes(cmd.type);
  if (paid) {
    (q.n > 5 || cmd.type === 'buyShaft' || cmd.type === 'buyShip' || cmd.type === 'upgradeDrill' ? sfx.big : sfx.buy)();
    if (btn) { popAt(btn, '-' + fmt(q.cost), 'spend'); btn.classList.remove('pressed'); void btn.offsetWidth; btn.classList.add('pressed'); }
    if (cmd.type === 'buyShaft') setTimeout(() => mine.focusShaft(S.colony.shafts.length - 1), 50);
  }
  ui.render();
  S.pending.push(cmd);
  chain = chain.then(() => post(cmd));
  // The tutorial's last step says "carts, the lift, or another miner": count a hire too.
  if (paid && cmd.type === 'hire' && S.unl.tutorial.step === 4) send({ type: 'tutorial', step: 5 });
}
async function post(cmd) {
  try {
    const r = await api('POST', '/api/v2/command', { cmd });
    S.pending.shift();
    if (r.status === 422) { toast(esc(r.body?.error || 'Refused'), 'bad'); sfx.error(); }
    if (r.body?.colony) adopt(r.body.colony, r.body.serverNow, r.body.events || []);
  } catch (e) {
    S.pending.shift();
    if (e.status !== 401) toast('Connection trouble: ' + esc(e.message), 'bad');
    resync();
  }
}
function adopt(colony, serverNow, events) {
  S.offset = serverNow - Date.now();
  let c = colony;
  for (const cmd of S.pending) { const x = E.applyCommand(c, S.ew, cmd, c.t); if (!x.error) c = x.colony; }
  const a = E.advance(c, S.ew, Math.max(c.t, S.now()));
  setColony(a.colony);
  handleEvents([...events, ...a.events]);
  recalc();
}
let syncing = false;
async function resync() {
  if (syncing || S.pending.length) return;
  syncing = true;
  try {
    const st = await loadState();
    if (!st.colony || st.world.month !== S.world.month || st.world.planet.id !== S.world.planet.id) return location.reload();
    setWorld(st.world);
    adopt(st.colony, st.serverNow, []);
    checkAway();
  } catch (e) { /* offline: keep predicting */ } finally { syncing = false; }
}

// ------------------------------------------------------------------ while you were away
let A_send = () => {};
const awayKey = () => `msc2_seen_${S.me.id}_${S.world.month}`;
function snapshot() {
  const c = S.colony;
  return { t: S.now(), earned: c.earned, sold: c.stats.sold, launches: c.stats.launches, sales: c.stats.sales, out: c.shafts.filter((s) => s.vein && s.vein.left <= 0).length };
}
function checkAway() {
  if (document.querySelector('.awaysheet')) return; // one away sheet at a time
  const prev = store(awayKey());
  const cur = snapshot();
  store(awayKey(), cur);
  if (!prev || cur.t - prev.t < 5 * 60_000 || cur.earned - prev.earned <= 0) return;
  let next = null;
  try {
    const sug = E.bottleneck(S.colony, S.ew)?.suggestion;
    if (sug && sug.cmd) next = { label: sug.label, cost: sug.cost, canAfford: S.colony.coin >= sug.cost, spend: () => A_send(sug.cmd) };
  } catch {}
  ui.awaySheet({ ms: cur.t - prev.t, coin: cur.earned - prev.earned, sold: cur.sold - prev.sold, launches: cur.launches - prev.launches, sales: cur.sales - prev.sales, veins: Math.max(0, cur.out - prev.out), next });
}

// ------------------------------------------------------------------ loops
function tick() {
  if (!S.colony) return;
  const a = E.advance(S.colony, S.ew, S.now());
  S.colony = a.colony;
  handleEvents(a.events);
  recalc();
  ui.render();
}
function slowTick() {
  if (!S.colony) return;
  try { S.bneck = E.bottleneck(S.colony, S.ew); } catch (e) { console.warn(e); }
  const q = E.quote(S.colony, S.ew, { type: 'buyShaft' });
  S.digCost = q.error ? null : q.cost;
  ui.slow();
}
let lastT = performance.now();
function frame(ms) {
  const dt = Math.min(0.25, (ms - lastT) / 1000);
  lastT = ms;
  if (S.colony) {
    try { mine.frame(); } catch (e) { console.error(e); }
    ui.topbar(dt);
    ui.coach();
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot
async function boot() {
  applyPrefs();
  net.onAuthLost = () => { location.reload(); };
  S.me = await ensureSignedIn();
  let st = await loadState();
  S.me = st.me;
  if (!st.colony) {
    $('#boot').hidden = true;
    await onboard(st);
    st = await loadState();
    store(`msc2_seen_${S.me.id}_${st.world.month}`, null);
  }
  setWorld(st.world);
  setColony(st.colony);
  recalc();
  $('#boot').hidden = true;
  $('#app').hidden = false;
  document.title = `${S.world.planet.name} · Mineshaft Capital`;

  mine = createMine($('#cv'), () => S.colony && {
    planet: S.world.planet, region: S.region, colony: S.colony, rates: S.rates, bneck: S.bneck, now: S.now(), unl: S.unl,
    look: S.look, digCost: S.digCost,
  }, {
    onTap(kind, id) {
      sfx.tap();
      if (kind === 'shaft') ui.openCard({ kind: 'shaft', id });
      else if (kind === 'dig') ui.openCard({ kind: 'dig' });
      else if (kind === 'bneck') ui.openCard({ kind: 'bneck' });
      else if (kind === 'lift' || kind === 'yard' || kind === 'conveyor') { ui.closeCard(); if (S.unl.panels.some((p) => ['lift', 'conveyor', 'yard', 'pads'].includes(p))) ui.setTab('surface'); }
      else if (kind === 'ships') { ui.closeCard(); if (S.unl.panels.some((p) => ['ships', 'fleet', 'routes'].includes(p))) ui.setTab('fleet'); }
      else ui.closeCard();
    },
  });
  const A = { send, mine, reload: () => location.reload(), loadBoard };
  A_send = send;
  ui = createUI(S, A);
  A.mine = mine;
  ui.render(true);
  slowTick();
  checkAway();

  live({
    board2: (m) => {
      if (m.op === 'init') { S.board.clear(); for (const d of m.docs) S.board.set(d.id, d.data); } else S.board.set(m.id, m.data);
    },
    world2: (m) => {
      const w = m.op === 'init' ? m.docs.find((d) => d.id === 'current')?.data : m.id === 'current' ? m.data : null;
      if (!w) return;
      if (w.month !== S.world.month || w.planet.id !== S.world.planet.id) { toast('A new month begins. Reloading…', 'info'); setTimeout(() => location.reload(), 1500); return; }
      setWorld(w);
    },
    feed2: (m) => {
      if (m.op === 'init') { S.feed.clear(); for (const d of m.docs) S.feed.set(d.id, d.data); ui.ticker(true); } else { S.feed.set(m.id, m.data); ui.ticker(true); }
    },
  });

  setInterval(tick, 250);
  setInterval(slowTick, 2500);
  setInterval(resync, 30_000);
  setInterval(() => { if (document.visibilityState === 'visible') store(awayKey(), snapshot()); }, 10_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); else store(awayKey(), snapshot()); });
  window.addEventListener('focus', resync);
  requestAnimationFrame(frame);
}

async function loadBoard() {
  try {
    const r = await api('GET', '/api/v2/board');
    S.boardFull = r.body;
    for (const b of r.body.month) if (!S.board.has(b.id)) S.board.set(b.id, b);
    ui.render(true);
  } catch {}
}

boot().catch((e) => {
  console.error(e);
  const b = $('#boot');
  b.hidden = false;
  b.innerHTML = `<p>Could not start: ${esc(e.message)}</p><button class="buy" onclick="location.reload()">Retry</button>`;
});
