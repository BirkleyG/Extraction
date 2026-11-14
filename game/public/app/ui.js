/* DOM UI: top bar, tabs and panels, buy rows (cost + next effect from quote), cards over the mine,
 * coach bubble, alerts, settings, ticker. Panels are rebuilt only when their structure changes; costs,
 * effects and affordability are refreshed in place every tick so buttons never vanish under a finger. */
import { quote, destinations, marketTable, shaftOptions, TUNING, PANELS } from '/shared/engine/index.js';
import { $, $$, esc, fmt, dur, secs, ago, clamp, oreIcon, TIER_COL, DAY, store, speciesIcon } from './util.js';
import { prefs, setPref, sfx, bump, popAt, Ticker, banner, shake } from './juice.js';
import { createMap } from './map.js';
import { createPrestige } from './prestige.js';
import { createGalaxy } from './galaxy.js';
import { createRefinery } from './refinery.js';
import { createReports } from './reports.js';
import { api, net, signOut, fillModels } from './net.js';

const TABS = [
  { id: 'mine', label: 'Mine', show: () => true },
  { id: 'surface', label: 'Surface', show: (u) => has(u, 'lift', 'conveyor', 'yard', 'pads') },
  { id: 'map', label: 'Map', show: () => true },
  { id: 'fleet', label: 'Fleet', show: (u) => has(u, 'ships', 'fleet', 'routes') },
  { id: 'market', label: 'Market', show: (u) => has(u, 'routes', 'market') },
  { id: 'refinery', label: 'Refinery', show: (u) => has(u, 'refinery') },
  { id: 'safety', label: 'Safety', show: (u) => has(u, 'safety') },
  { id: 'galaxy', label: 'Galaxy', show: (u, c, S) => has(u, 'prestige') || (S.bulletin && S.bulletin.changes.length > 0) },
  { id: 'prestige', label: 'Prestige', show: (u) => has(u, 'prestige') },
  { id: 'ranks', label: 'Ranks', show: (u, c) => c.stats.sales > 0 },
  { id: 'reports', label: 'Reports', show: (u, c) => c.stats.sales > 0 },
];
const BELL_MS = 48 * 3600_000;
const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const riskTxt = (perHour) => (perHour >= 1 ? `${perHour.toFixed(perHour < 10 ? 1 : 0)} mishaps/hour` : perHour * 24 >= 0.05 ? `${(perHour * 24).toFixed(1)} mishaps/day` : 'almost no risk');
const HZ_LABEL = { gas: 'Toxic gas', flood: 'Floods', fire: 'Yard fires', quake: 'Earthquakes' };
const SAFETY_ROWS = [['ventilation', 'Ventilation', 'gas', 'Clears toxic gas before it reaches the crews'], ['pumps', 'Pumps', 'flood', 'Keeps flooded tunnels from drowning shifts'], ['firebreaks', 'Firebreaks', 'fire', 'Stops yard fires from burning stockpiled ore']];
const has = (u, ...p) => p.some((x) => u.panels.includes(x));
const BULKS = [[1, '1x'], [10, '10x'], [100, '100x'], ['max', 'Max']];
const BULKY = new Set(['upgradeRefinery', 'hireMiners', 'upgradeGear', 'upgradeCart', 'upgradeShaft', 'upgradeLift', 'upgradeConveyor', 'upgradeYard', 'buyPad', 'upgradeClass', 'evolve', 'upgradeSafety']);
const SHIP_DESC = { hauler: 'All-rounder', cruiser: 'Small and fast', freighter: 'Slow and huge' };
const stateText = (s, now, I) => {
  const dest = s.dest === '@refinery' ? 'your orbital refinery' : I.buyer(s.dest)?.name || 'a buyer';
  if (s.state === 'loading') return 'Loading at the pad';
  if (s.state === 'out') return `Flying to ${dest} · ${secs(Math.max(0, (s.arriveAt - now) / 1000))}`;
  if (s.state === 'back') return `Returning · ${secs(Math.max(0, (s.homeAt - now) / 1000))}`;
  return 'Waiting for a free pad';
};

export function createUI(S, A) {
  const coinT = new Ticker();
  let lastKey = '', lastTabsKey = '', seenTabs = new Set(store('msc2_seenTabs') || ['mine']);
  let card = null; // { kind, id }
  let PR = null, GX = null, RF = null, RP = null, MP = null; // prestige, galaxy, refinery, reports: wired at the end

  // ------------------------------------------------------------ top bar
  $('#gear').onclick = () => { sfx.tap(); openSettings(); };
  $('#alertsBtn').onclick = () => { sfx.tap(); openCard({ kind: 'alerts' }); };
  $('#rankBtn').onclick = () => { if (tabsVisible().some((t) => t.id === 'ranks')) setTab('ranks'); };
  $('#galaxyBtn').onclick = () => { sfx.tap(); setTab('galaxy'); };
  $('#spStat').onclick = () => { if (tabsVisible().some((t) => t.id === 'prestige')) { sfx.tap(); setTab('prestige'); } };
  $('#zoomIn').onclick = () => A.mine.zoom(1);
  $('#zoomOut').onclick = () => A.mine.zoom(-1);
  $('#zoomHome').onclick = () => A.mine.home();

  function topbar(dt) {
    const c = S.colony;
    const coin = coinT.step(c.coin, dt);
    $('#coin').textContent = fmt(coin);
    $('#cpm').textContent = '+' + fmt(S.rates.coinPerMin) + '/min';
    const w = S.world, now = S.now();
    const days = Math.max(1, Math.round((w.endsAt - w.startedAt) / DAY));
    $('#day').textContent = `Day ${S.unl.day} of ${days}`;
    $('#left').textContent = dur(w.endsAt - now);
    const board = rankList();
    const i = board.findIndex((b) => b.id === S.me.id);
    $('#rank').textContent = i >= 0 ? `#${i + 1}` : '–';
    $('#rankOf').textContent = `of ${board.length || 1}`;
    const sp = $('#spStat');
    if ((c.sp || 0) > 0 || (c.nukes || 0) > 0) { sp.hidden = false; $('#sp').textContent = fmt(c.sp || 0); } else sp.hidden = true;
    // closing bell: the final 48 hours
    const left = w.endsAt - now, bell = $('#bell');
    if (left > 0 && left <= BELL_MS) {
      bell.hidden = false;
      document.body.classList.add('bellon');
      bell.innerHTML = `<small>Closing bell</small><b>${hms(left)}</b>`;
      const k = `msc2_bell_${w.month}`;
      if (!store(k)) { store(k, 1); banner('The closing bell', 'Final 48 hours. The richest colony at the bell enters the Hall of Fame.', 'bell'); sfx.bell && sfx.bell(); }
    } else { bell.hidden = true; document.body.classList.remove('bellon'); }
  }
  function rankList() {
    const rows = [...S.board.values()].filter((b) => b.month === S.world.month).map((b) => (b.id === S.me.id ? { ...b, coin: S.colony.coin, coinPerMin: S.rates.coinPerMin } : b));
    if (!rows.some((b) => b.id === S.me.id)) rows.push({ id: S.me.id, name: S.colony.name, player: S.me.name, species: S.colony.species, coin: S.colony.coin, coinPerMin: S.rates.coinPerMin });
    return rows.sort((a, b) => b.coin - a.coin);
  }

  // ------------------------------------------------------------ tabs
  function tabsVisible() { return TABS.filter((t) => t.show(S.unl, S.colony, S)); }
  function setTab(id) {
    S.ui.tab = id; seenTabs.add(id); store('msc2_seenTabs', [...seenTabs]);
    lastKey = ''; render(true);
    $('#tabbody').scrollTop = 0;
    const tb = document.querySelector(`[data-tab="${id}"]`);
    if (tb && tb.scrollIntoView) tb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    if (id === 'ranks') A.loadBoard();
    if (id === 'galaxy') { GX.markSeen(); GX.refresh().then(() => render(true)); }
    if (id === 'prestige') PR.loadMaker();
    if (id === 'reports') RP.load().then(() => { if (S.ui.tab === 'reports') render(true); });
  }
  function renderTabs() {
    const vis = tabsVisible();
    if (!vis.some((t) => t.id === S.ui.tab)) S.ui.tab = 'mine';
    const key = vis.map((t) => t.id + (seenTabs.has(t.id) ? '' : '*')).join(',') + '|' + S.ui.tab;
    if (key === lastTabsKey) return;
    lastTabsKey = key;
    const el = $('#tabs');
    el.hidden = vis.length < 2;
    document.body.classList.toggle('firstscreen', vis.length < 2);
    el.innerHTML = vis.map((t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === S.ui.tab}">${t.label}${seenTabs.has(t.id) ? '' : '<i class="dot"></i>'}</button>`).join('');
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { sfx.tap(); setTab(b.dataset.tab); } });

  // ------------------------------------------------------------ buy rows
  const cmdAttr = (cmd) => esc(JSON.stringify(cmd));
  function row(cmd, title, sub = '', { cls = '', btn = 'Buy', id = '' } = {}) {
    const bulk = BULKY.has(cmd.type) ? ' data-bulk="1"' : '';
    return `<div class="row ${cls}" data-cmd="${cmdAttr(cmd)}"${bulk}${id ? ` id="${id}"` : ''}>
      <div class="info"><div class="t">${title}</div>${sub ? `<div class="d">${sub}</div>` : ''}<div class="e" data-e></div></div>
      <button class="buy"><span class="bl">${btn}</span><span class="bc" data-c></span><i class="fill"></i></button></div>`;
  }
  // "Max" hiring stops where the cart is saturated: more miners than the cart can haul are wasted coin.
  function bulkN(cmd) {
    const n = S.ui.bulk;
    if (cmd.type !== 'hireMiners' || n !== 'max') return n;
    const i = S.colony.shafts.findIndex((x) => x.id === cmd.shaftId), r = S.rates.shafts[i], sh = S.colony.shafts[i];
    if (!r || !sh) return n;
    const per = sh.miners > 0 ? r.crew / sh.miners : r.perMiner;
    if (!(per > 0) || !(r.cap > 0)) return n;
    const need = Math.ceil(r.cap / per) - sh.miners;
    if (need <= 0) return 1;
    return Math.max(1, Math.min(need, quote(S.colony, S.ew, { ...cmd, n: 'max' }).n));
  }
  function refreshRows(root = document) {
    const c = S.colony;
    for (const el of $$('.row[data-cmd]', root)) {
      let cmd; try { cmd = JSON.parse(el.dataset.cmd); } catch { continue; }
      if (el.dataset.bulk) cmd.n = bulkN(cmd);
      const q = quote(c, S.ew, cmd);
      const btn = el.querySelector('button.buy');
      const cEl = el.querySelector('[data-c]'), eEl = el.querySelector('[data-e]');
      if (q.error) {
        btn.disabled = true; cEl.textContent = /maxed|full|All pads/i.test(q.error) ? 'MAXED' : ''; eEl.textContent = q.error; eEl.className = 'e why';
        btn.style.setProperty('--p', 0);
        continue;
      }
      const afford = q.canAfford;
      const isSp = q.currency === 'sp', have = isSp ? (c.sp || 0) : c.coin;
      btn.disabled = !afford;
      btn.classList.toggle('spc', isSp);
      cEl.textContent = (el.dataset.bulk && q.n > 1 ? `×${q.n} ` : '') + fmt(q.cost) + (isSp ? ' SP' : '');
      eEl.className = 'e';
      eEl.textContent = afford ? q.effect : `${q.effect} · need ${fmt(q.cost - have)} more${isSp ? ' SP' : ''}`;
      btn.style.setProperty('--p', afford ? 1 : clamp(have / Math.max(1e-9, q.cost), 0, 1).toFixed(3));
      btn.classList.toggle('ready', afford);
      btn.classList.remove('meh');
    }
    for (const b of $$('[data-opendig]', root)) {
      const dq = quote(c, S.ew, { type: 'buyShaft' });
      b.disabled = !!dq.error;
      b.classList.toggle('poor', !dq.error && c.coin < dq.cost);
      b.classList.toggle('ready', !dq.error && c.coin >= dq.cost);
      const ce = b.querySelector('[data-c]'); if (ce) ce.textContent = dq.error ? 'MAXED' : fmt(dq.cost);
    }
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button.buy');
    const r = btn && btn.closest('.row[data-cmd]');
    if (!r || btn.disabled) return;
    const cmd = JSON.parse(r.dataset.cmd);
    if (r.dataset.bulk) cmd.n = bulkN(cmd);
    A.send(cmd, btn);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bulkset]');
    if (!b) return;
    S.ui.bulk = b.dataset.bulkset === 'max' ? 'max' : Number(b.dataset.bulkset);
    store('msc2_bulk', S.ui.bulk);
    sfx.tap();
    $$('[data-bulkset]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.bulkset === String(S.ui.bulk))));
    refreshRows();
  });
  const bulkBar = () => `<div class="bulk" role="group" aria-label="Buy amount">${BULKS.map(([v, l]) => `<button data-bulkset="${v}" aria-pressed="${String(S.ui.bulk) === String(v)}">${l}</button>`).join('')}</div>`;

  // ------------------------------------------------------------ panels
  const ore = (id) => S.oreById[id];
  const oreTag = (o) => (o ? `${oreIcon(o, 16)}<span style="color:${TIER_COL[o.tier]}">${esc(o.name)}</span>` : '');
  const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : m >= 10 ? `${Math.round(m)} m` : `${Math.max(0, m).toFixed(1)} m`);
  // The tunnel: what the face cuts now, how much of the pocket is left, what's next in the rock.
  function pocketLine(s, r) {
    if (!r) return '';
    const nx = r.next, no = nx && ore(nx.ore);
    if (r.blocked) return `<div class="why">${esc(r.reason)}. Crews scrape ${esc(ore(s.ore)?.name || 'common ore')} off the walls at ${Math.round(100 * TUNING.pk.wall)}% meanwhile.</div>`;
    let h = '<div class="sh-s pk">';
    if (r.pocket) {
      const p = 1 - r.pocket.left / Math.max(1e-9, r.pocket.len);
      h += `<span>Pocket: ${fmtM(r.pocket.left)} left</span><span class="vein" title="${fmtM(r.pocket.left)} of ${fmtM(r.pocket.len)} left"><i style="width:${((1 - p) * 100).toFixed(1)}%;background:${ore(s.ore)?.color || 'var(--ok)'}"></i></span>`;
    } else h += `<span class="mut">${fmtM(r.face)} dug</span>`;
    if (nx && no) {
      const mins = r.metresPerMin > 0 ? nx.at / r.metresPerMin : 0;
      h += `<span>Next: ${oreTag(no)} in ${fmtM(nx.at)}${mins > 0 && !r.pocket ? ` <small class="mut">~${mins < 60 ? Math.ceil(mins) + ' min' : (mins / 60).toFixed(1) + ' h'}</small>` : ''}${nx.blocked ? ` <span class="pill warn">needs drill ${no.tier === 'mythic' ? 'mythic' : no.hardness}</span>` : ''}</span>`;
    }
    return h + '</div>';
  }
  // Each shaft is its own business: crew, gear and cart, with the limit that binds.
  const BAND = { shallow: 'Shallow', middle: 'Middle', deep: 'Deep', deepest: 'Deepest' };
  function shaftRows(s, r, inCard = false, first = false) {
    const u = S.unl, o = ore(s.ore);
    const limit = !r ? '' : s.miners === 0 ? '<span class="pill warn">no crew yet</span>' : r.limit === 'cart' ? '<span class="pill warn">cart-limited</span>' : '<span class="pill mut">crew-limited</span>';
    let h = `<div class="shaft biz">${inCard ? '' : `<div class="sh-h"><b class="nm" data-rename="shaft" data-id="${s.id}" title="Rename">${esc(s.name)}</b> <span class="pill sp">${BAND[s.band] || s.band}</span>${s.dir && s.dir !== 'main' ? ` <span class="pill mut">${esc(s.dir)}</span>` : ''} ${oreTag(o)}</div>`}
      <div class="sh-s"><span><b>${fmt(r ? r.orePerMin : 0)}</b> ore/min</span>${limit}</div>
      <div class="sh-s mut"><span>Crew digs ${fmt(r ? r.crew : 0)}/min</span><span>Cart hauls ${fmt(r ? r.cap : 0)}/min</span></div>
      ${pocketLine(s, r)}
      ${r && !r.ok ? `<div class="why">${esc(r.reason)}</div>` : ''}`;
    if (has(u, 'hire')) h += row({ type: 'hireMiners', shaftId: s.id }, `Miners <span class="lvl">${s.miners}</span>`, 'Each miner digs for this shaft only', { btn: 'Hire', ...(first ? { id: 'hireRow', cls: 'hero' } : {}) });
    if (has(u, 'drill')) h += row({ type: 'upgradeGear', shaftId: s.id }, `Gear <span class="lvl">Lv ${s.gear}</span>`, 'Faster digging and harder rock', { btn: 'Upgrade' });
    if (has(u, 'carts')) h += row({ type: 'upgradeCart', shaftId: s.id }, `Cart <span class="lvl">Lv ${s.cart}</span>`, 'Hauls ore from the face to the lift', { btn: 'Upgrade' });
    return h + '</div>';
  }
  function advisor() {
    const b = S.bneck;
    if (!b || S.unl.panels.length < 4) return '';
    return `<div class="advisor ${b.stage !== 'mine' ? 'hot' : ''}"><b>${b.stage !== 'mine' ? '! Bottleneck' : 'Foreman'}</b><p>${esc(b.message)}</p></div>`;
  }
  function panelMine() {
    const c = S.colony, u = S.unl, R = S.rates;
    let h = '';
    if (u.panels.length > 2) h += bulkBar();
    h += advisor();
    h += '<h3>Shafts</h3>';
    c.shafts.forEach((s, i) => { h += shaftRows(s, R.shafts[i], false, i === 0); });
    if (has(u, 'shafts')) {
      const left = c.shafts.length >= TUNING.maxShafts;
      h += `<button class="digbtn" data-opendig="1" ${left ? 'disabled' : ''}><small>Shaft ${c.shafts.length + 1} · ${BAND[shaftOptions(c, S.ew)[0]?.band] || ''} rock</small><b>Open a new shaft</b><span class="bc" data-c></span></button>`;
    } else h += `<p class="lede next">${nextUnlock()}</p>`;
    if (has(S.unl, 'shafts') && S.unl.next.panel) h += `<p class="lede next">${nextUnlock()}</p>`;
    return h;
  }
  // The big moment: two dig directions side by side with fuzzy prospects.
  const PROSPECT = { none: 'none', low: 'low', fair: 'fair', good: 'good' };
  function openDig() {
    const c = S.colony, opts = shaftOptions(c, S.ew);
    if (!opts.length) { sfx.error(); return; }
    const common = ore(c.site?.common);
    const idx = c.shafts.length;
    const html = `<h2>Shaft ${idx + 1}: where do you dig?</h2>
      <p class="lede">A new shaft is a new business: its own crew, gear and cart. Pick a direction; the Guild's surveyors only guess what lies ahead. ${common ? `Every shaft here digs ${oreTag(common)} until it breaks into a vein.` : ''}</p>
      <div class="digopts">${opts.map((o) => `<div class="digopt" data-dir="${o.dir}">
        <h3>${o.dir === 'left' ? '← Dig left' : 'Dig right →'}</h3>
        <div class="pill sp">${BAND[o.band] || o.band} band</div>
        <div class="prospects">${S.world.planet.ores.filter((x) => x.id !== c.site?.common).map((x) => `<div class="prosp p-${o.prospects[x.id] || 'none'}">${oreIcon(x, 20)}<span class="pn">${esc(x.name)}</span><b>${PROSPECT[o.prospects[x.id]] || 'none'}</b></div>`).join('')}</div>
        <div class="digcost"><small>Cost</small><b class="gold" data-dcost>${fmt(o.cost)}</b></div>
        <button class="buy big breakground" data-break="${o.dir}">Break ground</button></div>`).join('')}</div>`;
    const { el, close } = sheet(html, 'digsheet');
    const upd = () => {
      if (!el.isConnected) return clearInterval(iv);
      for (const b of $$('[data-break]', el)) b.disabled = S.colony.coin < opts[0].cost || S.colony.shafts.length !== idx;
      if (S.colony.shafts.length !== idx) close();
    };
    const iv = setInterval(upd, 500); upd();
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-break]');
      if (!b || b.disabled) return;
      A.send({ type: 'buyShaft', dir: b.dataset.break }, b);
      if (S.colony.shafts.length > idx) { clearInterval(iv); close(); celebrate(S.colony.shafts[S.colony.shafts.length - 1]); }
    });
  }
  function celebrate(sh) {
    banner(`${sh.name} opens`, `${BAND[sh.band] || ''} rock, dug ${sh.dir}. Hire a crew and get the carts rolling.`, 'license');
    shake(document.querySelector('.stage'));
    sfx.big(); setTimeout(() => sfx.unlock && sfx.unlock(), 220);
    if (A.mine && A.mine.celebrate) A.mine.celebrate(sh);
  }
  function panelSurface() {
    const c = S.colony, u = S.unl, R = S.rates;
    let h = bulkBar();
    h += `<div class="flow"><span>Mine <b>${fmt(R.minePerMin)}</b></span>→<span>Lift <b>${fmt(R.liftPerMin)}</b></span>→<span>Belts <b>${fmt(R.conveyorPerMin)}</b></span>→<span>Ships <b>${fmt(R.shipPerMin)}</b></span><small>ore/min</small></div>`;
    if (has(u, 'lift')) {
      h += `<h3>Lift <small class="mut">${fmt(R.liftPerMin)} ore/min</small></h3>`;
      for (const [kind, label, sub] of [['speed', 'Speed', 'More trips per minute'], ['capacity', 'Capacity', 'More ore in every bucket'], ['buckets', 'Buckets', 'More buckets run at once']]) h += row({ type: 'upgradeLift', kind }, `${label} <span class="lvl">Lv ${c.lift?.[kind] || 0}</span>`, sub, { btn: 'Upgrade' });
      h += '<h3>Surface</h3>';
    }
    if (has(u, 'conveyor')) h += row({ type: 'upgradeConveyor' }, `Conveyors <span class="lvl">Lv ${c.conveyor}</span>`, `${fmt(R.conveyorPerPad)} ore/min into each loading ship`, { btn: 'Upgrade' });
    if (has(u, 'yard')) h += row({ type: 'upgradeYard' }, `Surface yard <span class="lvl">Lv ${c.yardLvl}</span>`, `Holds ${fmt(R.yardCap)} ore while ships are away${R.yardLoss > 0.005 ? ` · <span class="bad">${Math.round(R.yardLoss * 100)}% spills</span>` : ''}`, { btn: 'Expand' });
    if (has(u, 'pads')) h += row({ type: 'buyPad' }, `Launch pads <span class="lvl">${c.pads}</span>`, 'More ships load at the same time', { btn: 'Build' });
    return h;
  }
  const CLS_UP = {
    hauler: [['hold', 'Cargo hold', 'Every hauler carries more'], ['loading', 'Loading speed', 'Haulers fill faster at the pad']],
    cruiser: [['hold', 'Cargo hold', 'Every cruiser carries more'], ['speed', 'Engines', 'Cruisers fly faster']],
    freighter: [['hold', 'Cargo hold', 'Every freighter carries more'], ['multi', 'Second hold', 'A big unlock: two ores per trip'], ['hold2', 'Second hold size', 'More cargo in the second hold']],
  };
  const fillBar = (o, f) => `<span class="fillbar" title="${Math.round(100 * f)}%"><i style="width:${(clamp(f, 0, 1) * 100).toFixed(0)}%;background:${o?.color || 'var(--ok)'}"></i></span>`;
  function shipOre(r) {
    if (!r) return '';
    const one = (id, f, k) => { const o = ore(id); return o ? `<span class="shipore">${oreIcon(o, 14)}<span data-sf="${k}" style="color:${TIER_COL[o.tier]}">${esc(o.name)}</span> ${fillBar(o, f)}<b data-sp="${k}">${Math.round(100 * f)}%</b></span>` : ''; };
    return one(r.oreId, r.fill || 0, 'a') + (r.oreId2 ? one(r.oreId2, r.fill2 || 0, 'b') : '');
  }
  function panelFleet() {
    const c = S.colony, u = S.unl, R = S.rates, now = S.now();
    let h = has(u, 'ships') || has(u, 'fleet') ? bulkBar() : '';
    h += '<h3>Your ships</h3>';
    const buyers = S.ew.planet.buyers;
    c.ships.forEach((s, i) => {
      const r = R.ships[i];
      h += `<div class="ship" data-shipid="${s.id}"><div class="sh-h"><b class="nm" data-rename="ship" data-id="${s.id}" title="Rename">${esc(s.name)}</b> <span class="pill sp">${TUNING.ship[s.cls].label}</span></div>
        <div class="sh-s"><span>${fmt(r ? r.cap : 0)}${r && r.cap2 ? ` + ${fmt(r.cap2)}` : ''} cargo</span><span data-shipstate="${s.id}">${esc(stateText(s, now, S.I))}</span></div>
        <div class="sh-s" data-shipore="${s.id}">${shipOre(r)}</div>`;
      if (has(u, 'routes')) {
        const val = s.policy === 'fixed' ? 'fixed:' + s.destId : s.policy;
        h += `<label class="route">Route <select data-route="${s.id}"><option value="best" ${val === 'best' ? 'selected' : ''}>Best coin/min</option><option value="nearest" ${val === 'nearest' ? 'selected' : ''}>Nearest buyer</option>${c.refinery?.orbital ? `<option value="refinery" ${val === 'refinery' ? 'selected' : ''}>Orbital refinery</option>` : ''}${buyers.map((b) => `<option value="fixed:${esc(b.id)}" ${val === 'fixed:' + b.id ? 'selected' : ''}>Always ${esc(b.name)}</option>`).join('')}</select></label>`;
      }
      h += '</div>';
    });
    if (has(u, 'ships')) {
      h += '<h3>Fleet upgrades <small class="mut">every ship of a class</small></h3>';
      for (const cls of ['hauler', 'cruiser', 'freighter']) {
        const n = c.ships.filter((x) => x.cls === cls).length;
        if (!n) continue;
        h += `<div class="clsbox"><div class="sh-h"><b>${TUNING.ship[cls].label}s</b> <span class="pill mut">${n} owned</span></div>`;
        for (const [kind, label, sub] of CLS_UP[cls]) {
          if (kind === 'hold2' && !(c.fleet?.freighter?.multi > 0)) continue;
          const lv = c.fleet?.[cls]?.[kind] || 0;
          h += row({ type: 'upgradeClass', cls, kind }, `${label}${kind === 'multi' ? (lv ? ' <span class="pill ok">unlocked</span>' : '') : ` <span class="lvl">Lv ${lv}</span>`}`, sub, { btn: kind === 'multi' ? 'Unlock' : 'Upgrade', cls: kind === 'multi' ? 'hero' : '' });
        }
        h += '</div>';
      }
    }
    if (has(u, 'fleet')) {
      h += '<h3>Shipyard</h3>';
      const lic = S.unl.licenses;
      for (const cls of ['hauler', 'cruiser', 'freighter']) {
        const T = TUNING.ship[cls];
        const locked = cls !== 'hauler' && !lic.includes(cls);
        const L = TUNING.licenses[cls];
        const sub = `${SHIP_DESC[cls]} · ${T.cap} cargo · speed ${T.speed}x` + (locked ? `<br><span class="warn">Guild license: day ${L.day} and ${fmt(L.coin)} earned (you: day ${S.unl.day}, ${fmt(S.colony.earned + (S.colony.grant || 0))})</span>` : '');
        h += row({ type: 'buyShip', cls }, `${T.label}${locked ? ' <span class="pill bad">locked</span>' : ''}`, sub, { btn: 'Buy' });
      }
    }
    return h;
  }
  function panelMarket() {
    const c = S.colony, u = S.unl;
    const mined = [...new Set(c.shafts.map((s) => s.ore))].map(ore).filter(Boolean);
    const cls = S.ui.mktCls || 'hauler';
    const rows = destinations(c, S.ew, cls);
    const buyerInfo = Object.fromEntries(S.world.planet.buyers.map((b) => [b.id, b]));
    let h = `<p class="lede">Where your ore sells. Trip times are one way for a ${TUNING.ship[cls].label.toLowerCase()}. Ships on "Best" pick the top row by themselves.</p>`;
    h += `<div class="chips">${['hauler', 'cruiser', 'freighter'].map((k) => `<button class="chip" data-mktcls="${k}" aria-pressed="${k === cls}">${TUNING.ship[k].label}</button>`).join('')}</div>`;
    h += `<div class="tablewrap"><table class="mkt"><tr><th>Buyer</th>${mined.map((o) => `<th class="n" title="${esc(o.name)}">${oreIcon(o, 14)}</th>`).join('')}<th class="n">Trip</th><th class="n">Coin/min</th></tr>`;
    for (const d of rows.sort((a, b) => b.coinPerMin - a.coinPerMin)) {
      h += `<tr class="${d.best ? 'best' : ''}"><td><b>${esc(d.name)}</b>${d.best ? ' <span class="pill ok">best</span>' : ''}<br><small>${esc(buyerInfo[d.id]?.blurb || '')}</small></td>${mined.map((o) => `<td class="n">${d.price[o.id].toFixed(2)}</td>`).join('')}<td class="n">${secs(d.tripSecs)}</td><td class="n gold">${fmt(d.coinPerMin)}</td></tr>`;
    }
    h += '</table></div>';
    if (has(u, 'market')) {
      h += '<h3>Market index</h3><p class="lede">Prices fall when the whole planet sells a lot of one ore, and recover over a few hours. Common ore barely moves; mythic swings hard.</p><div class="rows">';
      for (const m of marketTable(S.ew, S.now())) {
        const o = ore(m.id);
        const p = m.index;
        h += `<div class="mi">${oreTag(o)} <span class="vein wide"><i style="width:${(p * 100).toFixed(0)}%;background:${p > 0.8 ? 'var(--ok)' : p > 0.5 ? 'var(--warn)' : 'var(--bad)'}"></i></span><b>${Math.round(p * 100)}%</b></div>`;
      }
      h += '</div>';
    }
    return h;
  }
  function panelRanks() {
    const board = rankList();
    let h = '<h3>This month</h3><div class="tablewrap"><table><tr><th>#</th><th>Colony</th><th class="n">Coin</th><th class="n">/min</th></tr>';
    board.forEach((b, i) => {
      h += `<tr class="${b.id === S.me.id ? 'me' : ''}"><td>${i + 1}</td><td class="who">${speciesIcon(b.species, 28)}<b>${esc(b.name)}</b><br><small>${esc(b.player || '')}${b.species?.name ? ' · ' + esc(b.species.name) : ''}</small></td><td class="n gold">${fmt(b.coin)}${b.grant ? `<br><small class="muted" title="Late joiners get a catch-up grant">started with a ${fmt(b.grant)} grant</small>` : ''}</td><td class="n">${fmt(b.coinPerMin)}</td></tr>`;
    });
    h += '</table></div>';
    const B = S.boardFull;
    if (B) {
      h += '<h3>All time</h3>';
      h += B.allTime.length ? `<div class="tablewrap"><table><tr><th>Player</th><th class="n">Total</th><th class="n">Wins</th><th class="n">Best</th></tr>${B.allTime.map((r) => `<tr class="${r.id === S.me.id ? 'me' : ''}"><td>${esc(r.name || r.id)}</td><td class="n">${fmt(r.total)}</td><td class="n">${r.wins}</td><td class="n">${fmt(r.best)}</td></tr>`).join('')}</table></div>` : '<p class="lede">No finished months yet. The first Hall of Fame entry is written at the closing bell.</p>';
      h += '<h3>Hall of Fame</h3>';
      h += B.hall.length ? B.hall.map((m) => `<div class="hall"><b>${esc(m.month)}</b> · ${esc(m.planet)}<br>${m.winnerName ? `Won by <b>${esc(m.winnerName)}</b> (${esc(m.colony || '')}) with <span class="gold">${fmt(m.coin)}</span> coin` : 'No winner'} · ${m.players} players</div>`).join('') : '<p class="lede">Empty, for now.</p>';
    }
    return h;
  }
  function panelSafety() {
    const c = S.colony, R = S.rates, Hz = R.hazards;
    let h = `<div class="hzsum ${Hz.perHour > 0.5 ? 'hot' : ''}"><span class="skull" aria-hidden="true"></span><div><b>${riskTxt(Hz.perHour)}</b><br><small>${Hz.loss > 0.001 ? `costing about <span class="bad">${(Hz.loss * 100).toFixed(1)}%</span> of output (${fmt(Hz.lossPerMin)} coin/min)` : 'Your crews are safe for now.'}</small></div></div>`;
    h += '<p class="lede">Deeper shafts are more dangerous. Lights keep miners sane in the dark; supports stop cave-ins. Halted shafts dig nothing until they are cleared.</p>';
    h += bulkBar();
    h += '<h3>Shafts</h3>';
    let any = false;
    c.shafts.forEach((s, i) => {
      if (s.idx === 0) return;
      any = true;
      const r = R.shafts[i] || {};
      const risk = r.risk || 0, halted = s.haltUntil && s.haltUntil > S.now();
      h += `<div class="shaft safety"><div class="sh-h"><b>${esc(s.name)}</b> <small>depth ${s.idx + 1}</small> <span class="pill ${risk > 0.3 ? 'bad' : risk > 0.08 ? 'warn' : 'ok'}">${riskTxt(risk)}</span>${halted ? ` <span class="pill bad">halted ${dur(s.haltUntil - S.now())}</span>` : ''}</div>`;
      h += row({ type: 'upgradeShaft', shaftId: s.id, kind: 'lights' }, `Lights <span class="lvl">Lv ${s.up.lights || 0}</span>`, 'Prevents miner insanity', { btn: 'Install' });
      h += row({ type: 'upgradeShaft', shaftId: s.id, kind: 'supports' }, `Supports <span class="lvl">Lv ${s.up.supports || 0}</span>`, 'Prevents cave-ins', { btn: 'Brace' });
      h += '</div>';
    });
    if (!any) h += '<p class="lede">Your home shaft is safe. Danger starts below it.</p>';
    h += '<h3>Colony defenses</h3>';
    for (const [kind, label, hz, desc] of SAFETY_ROWS) {
      const rate = Hz.colony?.[hz] || 0;
      h += row({ type: 'upgradeSafety', kind }, `${label} <span class="lvl">Lv ${c.safety?.[kind] || 0}</span>`, `${desc} · ${HZ_LABEL[hz]}: ${riskTxt(rate)}`, { btn: 'Build' });
    }
    if (Hz.colony?.quake) h += `<p class="lede small">Earthquakes: ${riskTxt(Hz.colony.quake)}. Supports in every shaft soften them.</p>`;
    return h;
  }
  function nextUnlock() {
    const n = S.unl.next.panel;
    if (!n) return '';
    if (n.at == null) return `Next: <b>${esc(n.label)}</b> ${esc(n.hint || '')}`;
    const pct = Math.max(0, Math.min(100, n.at ? (100 * n.have) / n.at : 100));
    const wait = n.waitH > 0 ? ` · opens in ${n.waitH >= 1 ? Math.ceil(n.waitH) + 'h' : Math.ceil(n.waitH * 60) + 'm'}` : '';
    return `Next: <b>${esc(n.label)}</b> at ${fmt(n.at)} earned (${fmt(n.have)})${wait}<span class="nextbar"><i style="width:${pct.toFixed(1)}%"></i></span>`;
  }

  function structKey() {
    const c = S.colony, u = S.unl;
    const base = [S.ui.tab, u.panels.join(','), u.licenses.join(','), S.ui.bulk];
    if (S.ui.tab === 'mine') base.push(c.miners, c.shafts.map((s, i) => [s.id, s.name, s.ore, s.gear, s.cart, s.miners, s.band, Math.floor((s.face || 0) * 2), S.rates.shafts[i]?.blocked ? 'b' : '', S.rates.shafts[i]?.limit].join(':')).join(';'), S.bneck ? S.bneck.message : '', Math.floor(S.rates.minePerMin * 10), S.unl.next.panel ? Math.floor(20 * S.unl.next.panel.have / (S.unl.next.panel.at || 1)) + ':' + Math.ceil((S.unl.next.panel.waitH || 0) * 6) : '');
    if (S.ui.tab === 'surface') base.push(c.lift?.speed, c.lift?.capacity, c.lift?.buckets, c.conveyor, c.yardLvl, c.pads, Math.round(S.rates.minePerMin), Math.round(S.rates.yardLoss * 100));
    if (S.ui.tab === 'fleet') base.push(c.refinery?.orbital ? 'orb' : '', JSON.stringify(c.fleet || {}), c.ships.map((s) => [s.id, s.name, s.policy, s.destId, s.state, S.rates.ships.find((x) => x.id === s.id)?.oreId, S.rates.ships.find((x) => x.id === s.id)?.oreId2].join(':')).join(';'), S.unl.day, Math.floor(Math.log10(1 + c.earned) * 4));
    if (S.ui.tab === 'map') base.push(MP.key());
    if (S.ui.tab === 'market') base.push(Math.floor(S.now() / 15000), S.ui.mktCls, c.shafts.length);
    if (S.ui.tab === 'safety') base.push(c.shafts.map((s) => [s.id, s.name, s.up.lights || 0, s.up.supports || 0].join(':')).join(';'), JSON.stringify(c.safety || {}), Math.round(S.rates.hazards.perHour * 20), Math.floor(S.now() / 10000));
    if (S.ui.tab === 'galaxy') base.push(GX.key());
    if (S.ui.tab === 'prestige') base.push(PR.key());
    if (S.ui.tab === 'refinery') base.push(RF.key());
    if (S.ui.tab === 'reports') base.push(RP.key());
    if (S.ui.tab === 'ranks') base.push([...S.board.values()].map((b) => b.id + Math.round(b.coin)).join(','), Math.floor(S.now() / 5000), S.boardFull ? 1 : 0);
    return base.join('|');
  }
  function render(force) {
    renderTabs();
    if (S.ui.editing) return refreshRows();
    if (S.ui.tab === 'refinery' && RF.busy()) { refreshRows(); RF.live(); return; }
    const key = structKey();
    if (force || key !== lastKey) {
      lastKey = key;
      const body = $('#tabbody');
      const st = body.scrollTop;
      body.innerHTML = { mine: panelMine, surface: panelSurface, map: () => MP.panel(), fleet: panelFleet, market: panelMarket, ranks: panelRanks, safety: panelSafety, galaxy: () => GX.panel(), prestige: () => PR.panel(), refinery: () => RF.panel(), reports: () => RP.panel() }[S.ui.tab]();
      body.scrollTop = st;
      if (S.ui.tab === 'reports') RP.mount();
      if (S.ui.tab === 'map') MP.mount();
    }
    refreshRows();
    if (S.ui.tab === 'refinery') RF.live();
    if (S.ui.tab === 'reports') RP.live();
    if (S.ui.tab === 'fleet') {
      for (const el of $$('[data-shipstate]')) { const s = S.colony.ships.find((x) => x.id === el.dataset.shipstate); if (s) el.textContent = stateText(s, S.now(), S.I); }
      for (const el of $$('[data-shipore]')) {
        const r = S.rates.ships.find((x) => x.id === el.dataset.shipore); if (!r) continue;
        for (const [k, f] of [['a', r.fill], ['b', r.fill2]]) {
          const pe = el.querySelector(`[data-sp="${k}"]`); if (!pe) continue;
          pe.textContent = Math.round(100 * (f || 0)) + '%'; const bar = pe.parentElement.querySelector('.fillbar i'); if (bar) bar.style.width = (clamp(f || 0, 0, 1) * 100).toFixed(0) + '%';
        }
      }
    }
    if (card) renderCard();
  }

  // route select, rename, market class, advisor
  document.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-route]');
    if (!sel) return;
    const [policy, destId] = sel.value.split(':');
    A.send({ type: 'setRoute', shipId: sel.dataset.route, policy, ...(destId ? { destId } : {}) });
  });
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mktcls]');
    if (m) { S.ui.mktCls = m.dataset.mktcls; sfx.tap(); render(true); return; }
    if (e.target.closest('[data-opendig]')) { sfx.tap(); openDig(); return; }
    const rn = e.target.closest('[data-rename]');
    if (rn && !rn.querySelector('input')) startRename(rn);
  });
  function startRename(el) {
    S.ui.editing = true;
    const old = el.textContent;
    el.innerHTML = `<input type="text" maxlength="24" value="${esc(old)}">`;
    const inp = el.querySelector('input');
    inp.focus(); inp.select();
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      S.ui.editing = false;
      const v = inp.value.trim();
      el.textContent = save && v ? v : old;
      if (save && v && v !== old) A.send({ type: 'rename', target: el.dataset.rename, id: el.dataset.id, name: v });
      lastKey = '';
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }

  // ------------------------------------------------------------ cards over the mine
  function openCard(c) { card = c; renderCard(true); }
  function closeCard() { card = null; const el = $('#card'); el.hidden = true; el.innerHTML = ''; el.dataset.key = ''; }
  $('#card').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { sfx.tap(); closeCard(); } });
  function renderCard(force) {
    const el = $('#card');
    if (!card) return closeCard();
    const c = S.colony;
    let key = card.kind + (card.id || ''), html = '';
    if (card.kind === 'shaft') {
      const i = c.shafts.findIndex((s) => s.id === card.id);
      if (i < 0) return closeCard();
      const s = c.shafts[i], o = ore(s.ore);
      key += [s.gear, s.cart, s.miners, s.name, s.ore, Math.floor((s.face || 0) * 2), S.rates.shafts[i]?.blocked, S.rates.shafts[i]?.limit, S.unl.panels.length, S.ui.bulk].join(':');
      html = `<h4><span class="nm" data-rename="shaft" data-id="${s.id}" title="Rename">${esc(s.name)}</span> <small>depth ${s.idx + 1} · ${BAND[s.band] || ''}</small></h4>
        <div class="orebox">${o ? oreIcon(o, 32) : ''}<div><b style="color:${TIER_COL[o?.tier]}">${esc(o?.name)}</b> <span class="pill mut">${o?.tier}</span><br><small>${esc(o?.description || '')}</small></div></div>
        ${has(S.unl, 'hire') && S.unl.panels.length > 2 ? bulkBar() : ''}` + shaftRows(s, S.rates.shafts[i], true);
    } else if (card.kind === 'bneck') {
      const b = S.bneck;
      if (!b) return closeCard();
      key += b.message;
      html = `<h4 class="hot">! ${esc(b.stage === 'idle' ? 'Idle miners' : b.stage === 'blocked' ? 'Blocked shaft' : 'Bottleneck: ' + b.stage)}</h4><p>${esc(b.message)}</p>${b.wastedPerMin > 0 ? `<p class="lede">Losing about <b class="gold">${fmt(b.wastedPerMin)}</b> coin/min.</p>` : ''}`;
    } else if (card.kind === 'alerts') {
      const al = alerts();
      key += al.map((a) => a.text).join('|');
      html = `<h4>Alerts</h4>` + (al.length ? al.map((a) => `<div class="alert ${a.lvl}" ${a.shaft ? `data-goshaft="${a.shaft}"` : ''} ${a.bneck ? 'data-gobneck="1"' : ''}>${esc(a.text)}</div>`).join('') : '<p class="lede">All quiet. Everything is digging.</p>');
    }
    if (!force && el.dataset.key === key) { refreshRows(el); return; }
    el.dataset.key = key;
    el.innerHTML = `<button class="close" data-close="1" aria-label="Close">×</button>` + html;
    el.hidden = false;
    refreshRows(el);
  }
  $('#card').addEventListener('click', (e) => {
    const s = e.target.closest('[data-goshaft]');
    if (s) { openCard({ kind: 'shaft', id: s.dataset.goshaft }); A.mine.focusShaft(S.colony.shafts.find((x) => x.id === s.dataset.goshaft)?.idx || 0); }
    if (e.target.closest('[data-gobneck]')) openCard({ kind: 'bneck' });
  });

  function alerts() {
    const c = S.colony, out = [];
    const b = S.bneck;
    if (b && b.stage !== 'mine') out.push({ lvl: 'warn', text: b.message, bneck: true });
    c.shafts.forEach((s, i) => {
      const r = S.rates.shafts[i];
      const o = ore(s.ore);
      if (r && r.blocked) out.push({ lvl: 'warn', text: `${s.name}: ${r.reason}.`, shaft: s.id });
      else if (r && !r.ok) out.push({ lvl: 'warn', text: `${s.name}: ${r.reason}.`, shaft: s.id });
    });
    for (const [site, x] of Object.entries(S.rates.refinery || {})) if (x.full) out.push({ lvl: 'bad', text: `Your ${site === 'planet' ? 'on-planet' : 'orbital'} refinery's storage is full. Lower an ask or add storage.` });
    return out;
  }

  // ------------------------------------------------------------ coach bubble
  let coachKey = '';
  function coach() {
    const el = $('#coach');
    const tut = S.unl.tutorial;
    if (!tut.hint || S.ui.sheet) { el.hidden = true; return; }
    let target = null, world = null;
    if (tut.step === 0) target = $('#hireRow button.buy');
    else if (tut.step === 1) world = 'lift';
    else if (tut.step === 2) world = 'pads';
    else if (tut.step === 3) world = 'sky';
    else if (tut.step === 4) target = $$('#tabbody .row[data-cmd] button.buy:not(:disabled)').find((b) => !b.closest('#hireRow')) || $('#hireRow button.buy');
    let x, y, below = false;
    if (target && target.offsetParent) {
      const r = target.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top; below = r.top < 140;
      if (below) y = r.bottom;
    } else if (world) {
      const cv = $('#cv').getBoundingClientRect();
      const w = A.mine.worldOf(world);
      const p = A.mine.toCss(w.x, w.y);
      x = cv.left + clamp(p.x, 30, cv.width - 30); y = cv.top + clamp(p.y, 40, cv.height - 10);
      below = p.y < 90;
    } else { el.hidden = true; return; }
    const k = tut.step + '|' + tut.hint;
    if (k !== coachKey) {
      coachKey = k;
      el.innerHTML = `<span>${esc(tut.hint)}</span>${tut.step >= 1 && tut.step <= 3 ? '<button class="ok" data-coachok="1">Got it</button>' : ''}`;
      bump(el);
    }
    el.hidden = false;
    el.classList.toggle('below', below);
    const w = el.offsetWidth;
    el.style.left = clamp(x - w / 2, 8, window.innerWidth - w - 8) + 'px';
    el.style.top = (below ? y + 12 : y - el.offsetHeight - 12) + 'px';
    el.style.setProperty('--ax', (x - clamp(x - w / 2, 8, window.innerWidth - w - 8)) + 'px');
  }
  $('#coach').addEventListener('click', (e) => { if (e.target.closest('[data-coachok]')) { sfx.tap(); A.send({ type: 'tutorial', step: S.unl.tutorial.step + 1 }); } });

  // ------------------------------------------------------------ settings & sheets
  function sheet(html, cls = '') {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="sheet ${cls}"><button class="close" data-x="1" aria-label="Close">×</button>${html}</div>`;
    document.body.appendChild(ov);
    S.ui.sheet = true;
    const close = () => { ov.remove(); S.ui.sheet = $$('.overlay').length > 0; };
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) { sfx.tap(); close(); } });
    return { el: ov, close };
  }
  function openSettings() {
    const me = S.me;
    const { el, close } = sheet(`<h2>Settings</h2>
      <label class="toggle"><input type="checkbox" id="stSound" ${prefs.sound ? 'checked' : ''}> Sound</label>
      <label class="toggle"><input type="checkbox" id="stRm" ${prefs.reduced ? 'checked' : ''}> Reduced motion</label>
      <h3>Colony</h3><p><b>${esc(S.colony.name)}</b> · ${esc(S.colony.species?.name || '')} <i class="sw" style="background:${esc(S.colony.species?.color || '#888')}"></i> · ${esc(S.region?.name || '')}</p>
      <div class="btnrow"><button class="buy ghost sm" id="stRename">Rename colony</button></div>
      <h3>Account</h3><p>Signed in as <b>${esc(me.name)}</b>${me.owner ? ' <span class="pill sp">owner</span>' : ''}.</p>
      <p class="lede">To play on another device, join there with the same name and this device code. Keep it private.</p>
      <label class="f">Device code <input type="text" readonly value="${esc(net.token)}" id="stTok"></label>
      <div class="btnrow"><button class="buy ghost sm" id="stOut">Sign out on this device</button><a class="buy ghost sm" href="/classic/">Play the classic game</a></div>
      ${me.owner ? `<h3>Owner tools</h3><label class="f">AI model (Claude or ChatGPT) <select id="stModel" disabled><option>Loading…</option></select></label><p class="lede" id="stModelNote"></p>
        <div class="btnrow"><button class="buy danger sm" id="stEnd">End month now</button></div><p class="lede">Ends the month for everyone: writes the Hall of Fame and opens a new planet.</p>` : ''}`);
    el.querySelector('#stSound').onchange = (e) => { setPref('sound', e.target.checked); if (e.target.checked) sfx.buy(); };
    el.querySelector('#stRm').onchange = (e) => setPref('reduced', e.target.checked);
    el.querySelector('#stTok').onclick = (e) => e.target.select();
    el.querySelector('#stOut').onclick = () => signOut();
    el.querySelector('#stRename').onclick = () => {
      const v = window.prompt('Colony name', S.colony.name);
      if (v && v.trim()) A.send({ type: 'rename', target: 'colony', name: v.trim() });
    };
    if (me.owner) {
      fillModels(el.querySelector('#stModel'), el.querySelector('#stModelNote'));
      el.querySelector('#stEnd').onclick = async () => {
        if (!window.confirm('End the month for everyone now?')) return;
        const r = await api('POST', '/api/v2/admin/end-month');
        close();
        if (r.status === 200) A.reload();
      };
    }
  }
  function awaySheet(s) {
    const rows = [
      ['Coin earned', fmt(s.coin), 'gold'], ['Ore sold', fmt(s.sold), ''], ['Ships launched', fmt(s.launches), ''], ['Ship sales', fmt(s.sales), ''],
    ];
    if (s.pockets) rows.push(['Ore pockets dug out', s.pockets, 'gold']);
    const { el, close } = sheet(`<div class="away"><small>While you were away · ${esc(dur(s.ms))}</small><h2>Welcome back, General</h2>
      <p class="lede">Your crews kept digging. Here's what the colony did without you.</p>
      <div class="awaygrid">${rows.map(([k, v, c]) => `<div><small>${k}</small><b class="${c}">${v}</b></div>`).join('')}</div>
      <div class="btnrow"><button class="buy big" data-x="1">Collect &amp; carry on</button></div></div>`, 'awaysheet');
    sfx.big();
    return { el, close };
  }

  // ------------------------------------------------------------ ticker
  let tickIdx = 0, tickAt = 0;
  function ticker(force) {
    const el = $('#ticker');
    const items = [...S.feed.values()].sort((a, b) => b.t - a.t).slice(0, 8);
    if (!items.length) { el.innerHTML = '<span class="lede">The Guild wire is quiet.</span>'; return; }
    if (!force && performance.now() - tickAt < 6000) return;
    tickAt = performance.now();
    if (force) tickIdx = 0;
    const f = items[tickIdx % items.length];
    tickIdx++;
    el.innerHTML = `<span class="tk ${esc(f.kind)}"><time>${ago(f.t, S.now())}</time> ${esc(f.text)}</span>`;
  }

  // ------------------------------------------------------------ per-second extras
  function slow() {
    const al = alerts();
    const b = $('#alertsN');
    b.textContent = al.length;
    b.hidden = !al.length;
    $('#alertsBtn').classList.toggle('hot', al.some((a) => a.lvl === 'bad'));
    ticker();
  }

  PR = createPrestige(S, A, { row, bulkBar, sheet, render: (f) => render(f) });
  GX = createGalaxy(S);
  RF = createRefinery(S, A, { row, bulkBar });
  RP = createReports(S);
  MP = createMap(S, A);
  A.galaxy = GX;
  return {
    topbar, render, refreshRows, openDig, map: () => MP, coach, slow, ticker, openCard, closeCard, awaySheet, setTab, sheet, row, bulkBar, galaxy: GX, prestige: PR,
    coinEl: () => $('#coin'),
    cardOpen: () => card,
  };
}
