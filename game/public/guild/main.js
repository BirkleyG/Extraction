/* Mineshaft Capital: the guild game client. The map is the game; the side panel is your desk.
 * The server is the truth: we send commands and render the view it returns. Between syncs the coin counter
 * runs on the net rate the server reported, so nothing hidden (ore under the ground, buyers' limits) reaches the browser. */
import { api, ensureSignedIn, net, live, signOut, fillModels } from '/app/net.js';
import { toast, banner, sfx, prefs, setPref, applyPrefs, Ticker, bump, shake } from '/app/juice.js';
import { esc, oreIcon, speciesIcon, SPECIES_COLORS, store, TIER_COL } from '/app/util.js';
import { GUILD_TUNING as G, fmt, spotInfo, canBuildAt, surveyCost, dist } from '/shared/guild/index.js';
import { createMap } from './map.js';

const $ = (s, r = document) => r.querySelector(s);
const H = 3_600_000;
const S = {
  me: null, guild: null, view: null, world: null, board: [], feed: [], sel: null, mode: null, tab: store('g_tab') || 'ops',
  sync: { server: 0, client: 0 }, lastLogT: 0, unread: 0, bulletin: [], history: null,
  now: () => S.sync.server + (Date.now() - S.sync.client),
};
const ore = (id) => (S.world?.planet.ores || []).find((o) => o.id === id) || { id, name: id, tier: 'common' };
S.oreTier = (id) => ore(id).tier;
S.oreColor = (id) => ore(id).color || TIER_COL[ore(id).tier];
S.oreValue = (id) => S.view?.prices?.[id]?.pbar || 1;
S.routeCargoColor = (r) => (r.cargo && r.cargo !== 'all' ? S.oreColor(r.cargo) : '#e8e4f2');
const oreTag = (id, size = 14) => `${oreIcon(ore(id), size)}<span style="color:${TIER_COL[ore(id).tier]}">${esc(ore(id).name)}</span>`;
const coinTxt = (n) => `<b class="gold">${fmt(n)}</b>`;
const perH = (n) => `${fmt(n)}/h`;
function dur(ms) {
  if (ms <= 0) return 'now';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60 ? (m % 60) + 'm' : ''}`.trim() : `${Math.floor(h / 24)}d ${h % 24}h`;
}
const live$ = (until) => `<span data-until="${until}">${dur(until - S.now())}</span>`;
const pct = (x) => `${Math.round(x * 100)}%`;

/* ---------------------------------------------------------------- sync */

function apply(st, { quiet = false } = {}) {
  if (!st) return;
  S.me = st.me || S.me;
  if (st.world) S.world = st.world;
  S.sync = { server: st.serverNow, client: Date.now() };
  const prev = S.guild;
  S.guild = st.guild; S.view = st.view;
  if (!S.guild) return;
  // new chronicle entries become toasts
  const fresh = (S.guild.log || []).filter((l) => l.t > S.lastLogT);
  if (S.lastLogT && !quiet) {
    const notable = fresh.filter((l) => !['build', 'route', 'drone', 'ship', 'tech'].includes(l.kind)); // not things you just did yourself
    if (notable.length > 3) {
      toast(`While you were away: ${notable.length} things happened. <b>Chronicle</b> (top right) has the gory details.`, 'info', 6000);
      if (notable.some((l) => l.kind === 'offer')) sfx.bell();
    } else for (const l of notable) {
      const kind = l.kind === 'incident' ? 'bad' : l.kind === 'contract' || l.kind === 'offer' ? 'sale' : l.kind === 'full' || l.kind === 'vein' ? 'warn' : 'info';
      toast(esc(l.text), kind, 5200);
      if (l.kind === 'incident') { sfx.hazard(); shake($('#stage')); }
      else if (l.kind === 'offer') sfx.bell();
      else if (l.kind === 'built') sfx.unlock();
    }
    if (fresh.some((l) => l.kind === 'survey' && /MYTHIC/.test(l.text))) banner('Mythic ore!', fresh.find((l) => /MYTHIC/.test(l.text)).text, 'galaxy');
    S.unread += notable.length;
  }
  if (fresh.length) S.lastLogT = Math.max(...S.guild.log.map((l) => l.t));
  if (prev && st.guild.coin > prev.coin + 1) bump($('#coin'));
  render();
}

async function refresh(quiet) {
  try { const r = await api('GET', '/api/v3/state'); apply(r.body, { quiet }); } catch (e) { console.warn(e); }
}

async function cmd(c, okText) {
  try {
    const r = await api('POST', '/api/v3/command', { cmd: c });
    const b = r.body;
    if (b.error) { toast(esc(b.error), 'bad'); sfx.error(); }
    else { if (okText) toast(okText, 'info'); sfx.buy(); }
    apply(b, { quiet: true });
    return b;
  } catch (e) { toast(esc(e.message), 'bad'); sfx.error(); return null; }
}

/* ---------------------------------------------------------------- HUD */

const coinTick = new Ticker();
let lastFrame = performance.now();
function hudLoop(ms) {
  requestAnimationFrame(hudLoop);
  const dt = (ms - lastFrame) / 1000; lastFrame = ms;
  if (!S.view) return;
  const est = S.view.coin + S.view.netH * Math.max(0, (S.now() - S.view.t) / H);
  $('#coin').textContent = fmt(coinTick.step(est, dt));
}
function renderHud() {
  const V = S.view, w = S.world;
  $('#net').textContent = `${V.netH >= 0 ? '+' : ''}${fmt(V.netH)}/h`;
  $('#net').className = V.netH >= 0 ? '' : 'neg';
  $('#day').textContent = `Day ${V.day}`;
  $('#left').textContent = dur(w.endsAt - S.now());
  $('#rp').textContent = `${fmt(V.rp)} (+${fmt(V.rpH)}/h)`;
  $('#spStat').hidden = !(S.guild.sp > 0);
  $('#sp').textContent = (S.guild.sp || 0).toFixed(1);
  const i = S.board.findIndex((b) => b.id === S.me.id);
  $('#rank').textContent = i >= 0 ? '#' + (i + 1) : '–';
  $('#rankOf').textContent = S.board.length ? 'of ' + S.board.length : '';
  $('#logN').hidden = !S.unread; $('#logN').textContent = S.unread;
}

/* ---------------------------------------------------------------- tabs */

const TABS = [
  ['ops', 'Operations'], ['fleet', 'Fleet'], ['lab', 'Research'], ['market', 'Market'], ['guild', 'Guild'],
];
function renderTabs() {
  const calls = (S.view.offers || []).length;
  $('#tabs').innerHTML = TABS.map(([id, label]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${S.tab === id}">${label}${id === 'market' && calls ? '<i class="dot"></i>' : ''}</button>`).join('');
}
function renderTab() {
  const f = { ops: tabOps, fleet: tabFleet, lab: tabLab, market: tabMarket, guild: tabGuild }[S.tab] || tabOps;
  const body = $('#tabbody');
  const y = body.scrollTop;
  body.innerHTML = f();
  body.scrollTop = y;
}

function siteStatus(s) {
  if (s.build) return `<span class="warn">${s.level < 1 ? 'building' : 'upgrading'} · ${live$(s.build.doneAt)}</span>`;
  if (s.kind === 'mine') {
    if (s.halted) return `<span class="bad">halted · ${live$(s.halted)}</span>`;
    if (s.full) return '<span class="warn">stockpile full</span>';
    if (s.shipping + 0.01 < s.tph) return `<span class="warn">piling up: ships move ${fmt(s.shipping)} of ${fmt(s.tph)} t/h</span>`;
    return `<span class="ok">${fmt(s.tph)} t/h</span>`;
  }
  if (s.kind === 'refinery') return s.inflow > s.thru ? `<span class="warn">backed up: ${fmt(s.inflow)} t/h in, ${fmt(s.thru)} capacity</span>` : `<span class="ok">${fmt(s.inflow)} / ${fmt(s.thru)} t/h</span>`;
  if (s.kind === 'lab' || s.kind === 'hub') return `<span class="ok">+${s.rpH} RP/h</span>`;
  if (s.kind === 'air') return `<span class="ok">reach ${Math.round(s.radius)}</span>`;
  return '';
}
const KIND_LABEL = { hub: 'Command hub', mine: 'Mine', refinery: 'Refinery', air: 'Air station', lab: 'Research hub' };

function tabOps() {
  const V = S.view;
  const sites = V.sites.slice().sort((a, b) => ['hub', 'mine', 'refinery', 'air', 'lab'].indexOf(a.kind) - ['hub', 'mine', 'refinery', 'air', 'lab'].indexOf(b.kind));
  const ledger = S.guild.ledger;
  const inc = Object.values(ledger.in).reduce((a, b) => a + b, 0), out = Object.values(ledger.out).reduce((a, b) => a + b, 0);
  return `
    <h2>${esc(S.guild.name)}</h2>
    <p class="lede small">Running costs <b>${perH(V.upkeepH)}</b> · income ${perH(V.incomeH)} · crews ${V.crews - V.building}/${V.crews} free</p>
    ${hintBox()}
    <h3>Operations (${V.sites.length})</h3>
    ${sites.map((s) => `<button class="row op" data-sel="${s.id}"><span><span class="t">${esc(s.name)}</span> <small class="muted">${KIND_LABEL[s.kind]}${s.level >= 1 ? ' · ' + esc(s.levelName) : ''}</small><span class="d">${siteStatus(s)}</span></span><span class="go">›</span></button>`).join('')}
    <h3>Found a new operation</h3>
    <p class="small lede">Click open ground on the map inside your claim (the yellow circle). Drones tell you what is under it first, if you like knowing things.</p>
    <div class="chips">${['mine', 'refinery', 'air', 'lab'].map((k) => `<span class="chip">${KIND_LABEL[k]} · ${fmt(G.build[k].cost)} · ${G.build[k].hours}h</span>`).join('')}</div>
    <h3>This month so far</h3>
    <p class="small">Earned ${coinTxt(inc)} · spent ${coinTxt(out)}</p>
    <div class="ledger small">${Object.entries(ledger.in).filter(([, v]) => v > 0.5).map(([k, v]) => `<span>+${fmt(v)} ${LEDGER_IN[k]}</span>`).join('')}${Object.entries(ledger.out).filter(([, v]) => v > 0.5).map(([k, v]) => `<span class="neg">−${fmt(v)} ${LEDGER_OUT[k]}</span>`).join('')}</div>`;
}
const LEDGER_IN = { npc: 'contractor sales', guild: 'Guild exchange', spot: 'spot market', contract: 'contracts', players: 'sold to guilds' };
const LEDGER_OUT = { build: 'building', upkeep: 'running costs', ships: 'ships', survey: 'surveys', incidents: 'compensation', penalties: 'penalties', ore: 'ore bought' };

function tabFleet() {
  const V = S.view, me = S.guild;
  const idle = me.ships.filter((s) => !s.routeId);
  return `
    <h2>Fleet</h2>
    <p class="lede small">${me.ships.length}/${V.hangar} hangar slots · ${idle.length} idle. Ships fly routes from your mines to a refinery. Distance and air stations decide how fast they cycle.</p>
    <h3>Routes</h3>
    ${V.routes.length ? V.routes.map((r) => `<button class="row" data-route="${r.id}"><span><span class="t">${esc(r.from?.name || '?')} → ${esc(r.to?.name || '?')}</span><span class="d">${r.ok ? `<span class="ok">${fmt(r.tph)} t/h</span> · ${r.ships} ship${r.ships === 1 ? '' : 's'} · ${r.cycleH.toFixed(1)}h round trip${r.path?.stops ? ` · ${r.path.stops} refuel stop${r.path.stops > 1 ? 's' : ''}` : ''}` : `<span class="bad">${esc(r.issue)}</span>`}</span></span><span class="go">›</span></button>`).join('') : '<p class="small lede">No routes yet. Click one of your mines, then "Ship ore to…".</p>'}
    <h3>Buy ships</h3>
    ${Object.entries(G.ships).map(([cls, b]) => {
      const locked = b.tech && !me.tech[b.tech];
      return `<div class="row"><span><span class="t">${b.label}</span><span class="d">${Math.round(b.cap)} t hold · speed ${b.speed} · range ${b.range} · ${b.upkeep}/h${locked ? ` · <span class="warn">needs ${esc(G.tech[b.tech].label)}</span>` : ''}</span></span><button class="buy sm" data-buyship="${cls}" ${locked || me.ships.length >= V.hangar ? 'disabled' : ''}><span class="bc">${fmt(V.shipCosts[cls])}</span></button></div>`;
    }).join('')}
    <h3>Ships</h3>
    ${me.ships.map((s) => { const r = V.routes.find((x) => x.id === s.routeId); return `<div class="row"><span><span class="t">${esc(s.name)}</span> <small class="muted">${G.ships[s.cls].label}</small><span class="d">${r ? esc(`${r.from?.name} → ${r.to?.name}`) : '<span class="warn">idle at the hub</span>'}</span></span><select data-assign="${s.id}"><option value="">Idle</option>${V.routes.map((x) => `<option value="${x.id}" ${x.id === s.routeId ? 'selected' : ''}>${esc((x.from?.name || '') + ' → ' + (x.to?.name || ''))}</option>`).join('')}</select></div>`; }).join('')}`;
}

function tabLab() {
  const V = S.view, me = S.guild;
  const tracks = {};
  for (const [id, T] of Object.entries(G.tech)) (tracks[T.track] = tracks[T.track] || []).push([id, T]);
  return `
    <h2>Research</h2>
    <p class="lede small"><b>${fmt(V.rp)} RP</b>, +${fmt(V.rpH)}/h. The command hub thinks slowly; research hubs think faster and drink more.</p>
    ${Object.entries(tracks).map(([track, list]) => `<h3>${track}</h3>${list.map(([id, T]) => {
      const done = !!me.tech[id], locked = T.needs && !me.tech[T.needs];
      return `<div class="row ${done ? 'done' : ''}"><span><span class="t">${esc(T.label)}</span><span class="d">${esc(T.text)}${locked ? ` <span class="warn">Needs ${esc(G.tech[T.needs].label)}.</span>` : ''}</span></span>${done ? '<span class="ok tag">known</span>' : `<button class="buy sm" data-tech="${id}" ${locked || V.rp < T.rp ? 'disabled' : ''}><span class="bc">${T.rp} RP</span></button>`}</div>`;
    }).join('')}`).join('')}`;
}

function priceRow(id) {
  const p = S.view.prices[id];
  if (!p) return '';
  const idx = p.idx, arrow = idx > 1.03 ? '<span class="ok">▲</span>' : idx < 0.97 ? '<span class="bad">▼</span>' : '<span class="muted">■</span>';
  const analysts = !!S.guild.tech.analysts;
  const o = ore(id);
  return `<div class="row price"><span><span class="t">${oreTag(id)}</span><span class="d">${esc(o.use || '')}${analysts ? ` · planet share ${pct(p.share)}` : ''}</span></span><span class="pv">${arrow} ${fmt(p.p)}<small>${pct(idx)} of normal</small></span></div>`;
}

function tabMarket() {
  const V = S.view, me = S.guild, ex = V.exchange;
  const active = (V.contracts || []).filter((c) => !c.done);
  const done = (V.contracts || []).filter((c) => c.done).slice(-5).reverse();
  return `
    <h2>Market</h2>
    <p class="lede small">Galactic prices for refined ore. They come from what the galaxy wants and how much this planet is dumping on it. Common ore barely moves; flood the market with a rare or mythic one and watch it sink.</p>
    ${S.view.prices ? Object.keys(S.view.prices).map(priceRow).join('') : ''}
    <h3>Galactic Exchange</h3>
    ${!ex ? `<p class="small">Contractor refineries and the Guild's own exchange take a fat cut. An exchange in orbit lets you sell refined goods straight to galactic buyers, who will start calling with contracts.</p>
      <div class="row"><span><span class="t">Build a Galactic Exchange</span><span class="d">${fmt(G.exchange.cost)} coin · ${G.exchange.hours}h · ${G.exchange.upkeep}/h. ${V.lic.exchange ? '' : `Licensed from day ${G.exchange.day}.`} Needs a working refinery.</span></span><button class="buy sm" data-act="buildExchange" ${!V.lic.exchange ? 'disabled' : ''}><span class="bc">${fmt(G.exchange.cost)}</span></button></div>`
      : ex.level < 1 ? `<p class="warn">Being assembled in orbit · ${live$(ex.build.doneAt)}</p>`
      : `<p class="small">Tier ${ex.level}. Stock ${fmt(Object.values(ex.stock || {}).reduce((a, b) => a + b, 0))} of ${fmt(ex.store)}. Whatever contracts do not need is sold on the spot market at ${pct(G.exchange.spot)} of the galactic price, unless you hold it.</p>
        ${Object.keys(V.prices).filter((id) => (ex.stock || {})[id] > 0.5 || (S.guild.rate || {})[id] > 0.01).map((id) => `<div class="row"><span><span class="t">${oreTag(id)}</span><span class="d">${fmt((ex.stock || {})[id] || 0)} in stock · making ${fmt((me.rate || {})[id] || 0)}/h</span></span><button class="chip" data-spot="${id}" aria-pressed="${ex.spot[id] !== false}">${ex.spot[id] !== false ? 'Selling spot' : 'Holding'}</button></div>`).join('')}
        ${ex.build ? `<p class="warn small">Expanding · ${live$(ex.build.doneAt)}</p>` : ex.upgradeCost ? `<div class="row"><span><span class="t">Expand the exchange</span><span class="d">More storage, buyers call more often.</span></span><button class="buy sm" data-act="upgradeExchange"><span class="bc">${fmt(ex.upgradeCost)}</span></button></div>` : ''}`}
    ${ex && ex.level >= 1 ? `
    <h3>Buyers calling (${V.offers.length})</h3>
    ${V.offers.length ? V.offers.map(offerRow).join('') : '<p class="small lede">Nobody is calling right now. They will. They always do.</p>'}
    <h3>Contracts</h3>
    ${active.length ? active.map(contractRow).join('') : '<p class="small lede">No open contracts.</p>'}
    ${done.length ? `<details><summary class="small">Recent</summary>${done.map(contractRow).join('')}</details>` : ''}
    <h3>Buyers you know</h3>
    ${V.buyers.length ? V.buyers.map(buyerRow).join('') : '<p class="small lede">You have not met anyone. The galaxy is shy until you have something to sell.</p>'}` : ''}`;
}
const buyerName = (id) => (S.view.buyers.find((b) => b.id === id) || {}).name || 'A buyer';
function offerRow(o) {
  const v = o.price * o.qty;
  const vsMarket = o.market ? o.price / (o.market * G.exchange.spot) - 1 : 0;
  return `<div class="row offer"><span><span class="t">${esc(buyerName(o.buyerId))}</span><span class="d">${o.qty} ${oreTag(o.oreId, 12)} in ${o.days} days at <b>${o.price}</b> (${vsMarket >= 0 ? '+' : ''}${pct(vsMarket)} vs spot) · worth ${fmt(v)} · expires ${live$(o.expires)}</span><span class="d quote">“${esc(o.lines[o.lines.length - 1].text)}”</span></span><span class="col"><button class="buy sm" data-offer="${o.id}" data-a="accept"><span class="bc">Sign</span></button><button class="buy sm ghost" data-talk="${o.id}"><span class="bc">Talk</span></button><button class="x" data-offer="${o.id}" data-a="decline" aria-label="Decline">✕</button></span></div>`;
}
function contractRow(c) {
  const f = c.delivered / c.qty;
  const late = !c.done && S.now() > c.due - 6 * H && f < 0.9;
  return `<div class="row"><span><span class="t">${esc(buyerName(c.buyerId))}: ${fmt(c.qty)} ${oreTag(c.oreId, 12)} at ${c.price}</span><span class="d">${c.done ? (c.delivered >= c.qty ? '<span class="ok">filled</span>' : '<span class="bad">short, penalty paid</span>') : `due ${live$(c.due)}${late ? ' <span class="bad">at risk</span>' : ''}`} · paid ${fmt(c.paid)}</span><span class="bar"><i style="width:${pct(Math.min(1, f))}"></i></span></span></div>`;
}
function buyerRow(b) {
  const stars = '★'.repeat(b.level) + '☆'.repeat(3 - b.level);
  return `<details class="dossier"><summary><b>${esc(b.name)}</b> <small class="muted">${esc(b.type || '')} · ${stars} · ${b.deals} deal${b.deals === 1 ? '' : 's'}${b.defaults ? `, ${b.defaults} missed` : ''}</small></summary>
    <p class="small">${esc(b.blurb || '')}</p>
    ${b.voice ? `<p class="small muted">Voice: ${esc(b.voice)}. ${b.personality ? 'Seems ' + esc(b.personality) + '.' : ''}</p>` : ''}
    ${b.backstory ? `<p class="small">${esc(b.backstory)}</p>` : '<p class="small muted">Close a deal with them to learn more.</p>'}
    ${b.wants ? `<p class="small">Buys: ${b.wants.map((id) => oreTag(id, 12)).join(', ')}</p>` : ''}
    ${b.quirk ? `<p class="small">${esc(b.quirk)} Usually pays about ${b.premium >= 0 ? '+' : ''}${b.premium}% over market.</p>` : b.level < 3 ? '<p class="small muted">Three deals and you will know how they really think.</p>' : ''}</details>`;
}

function tabGuild() {
  const me = S.guild, V = S.view;
  const evo = Object.entries(G.evo);
  return `
    <h2>Guild</h2>
    <h3>This month's ranking</h3>
    <p class="small lede">The Maker Guild awards the planet to the guild holding the most coin at month's end. Profit, not production: debt does not count.</p>
    ${S.board.map((b, i) => `<div class="row lb ${b.id === S.me.id ? 'me' : ''}"><span><span class="t">#${i + 1} ${b.species ? speciesIcon(b.species, 18) : ''} ${esc(b.name)}</span><span class="d">${esc(b.player || '')} · ${b.sites} ops · ${b.netH >= 0 ? '+' : ''}${fmt(b.netH)}/h${b.nukes ? ` · ☢${b.nukes}` : ''}</span></span><span class="pv gold">${fmt(b.coin)}</span></div>`).join('') || '<p class="small">Nobody yet.</p>'}
    <h3>Prestige: the nuke</h3>
    ${V.nukeReady ? `<p class="small">Blow up everything you own for <b>${V.spectacleNow.toFixed(1)} Spectacle</b>. You keep your surveys, your buyers and your SP; you lose every building, ship, coin and tech. Then you get an audience with the Maker.</p><div class="btnrow"><button class="buy danger" data-act="nuke"><span class="bl">Nuke the operation</span><span class="bc">☢</span></button></div>`
      : `<p class="small lede">Earn ${fmt(G.nukeMin)} coin since your last nuke to unlock it (${fmt(me.runEarned)} so far). Bigger runs make a bigger bang.</p>`}
    ${me.lastNuke ? `<div class="btnrow"><button class="buy ghost" data-act="maker"><span class="bl">Audience with the Maker</span><span class="bc">⚙</span></button></div>` : ''}
    ${me.sp > 0 || Object.values(me.evo).some((x) => x) ? `<h3>Evolutions (${me.sp.toFixed(1)} SP)</h3>${evo.map(([k, E]) => `<div class="row"><span><span class="t">${E.label} ${me.evo[k] ? 'lv ' + me.evo[k] : ''}</span><span class="d">${E.text}: +${Math.round(E.per * 100)}% a level</span></span><button class="buy sm" data-evo="${k}" ${me.sp < V.evoCosts[k] ? 'disabled' : ''}><span class="bc">${V.evoCosts[k]} SP</span></button></div>`).join('')}` : ''}
    <h3>Galaxy</h3>
    ${S.bulletin.length ? S.bulletin.map((c) => `<div class="row"><span><span class="t">${esc(c.title)}</span><span class="d">${c.source === 'maker' ? `Granted by the Maker to ${esc(c.byName || 'a General')}` : 'Galactic event'}${c.until ? ` · ends ${live$(c.until)}` : ' · all month'}</span></span></div>`).join('') : '<p class="small lede">The galaxy is calm. Suspiciously calm.</p>'}
    <h3>Planet news</h3>
    <div class="feed">${S.feed.slice(0, 25).map((f) => `<p class="small"><time>${new Date(f.t).toLocaleString([], { day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time> ${esc(f.text)}</p>`).join('')}</div>`;
}

function hintBox() {
  const h = currentHint();
  return h ? `<div class="tip">${h}</div>` : '';
}
function currentHint() {
  const me = S.guild, V = S.view;
  if (!V) return '';
  if (!me.routes.length) return 'Your <b>Landing Pit</b> is already digging. Ore piles up until ships move it. Click it on the map and choose <b>Ship ore to…</b>';
  if (me.ships.every((s) => !s.routeId)) return 'You have a route but no ship on it. Open the route and put a ship on it.';
  const pit = V.sites.find((s) => s.id === 'pit');
  if (pit && pit.shipping + 0.5 < pit.tph && me.ships.length < 3) return 'The pile is growing faster than your ships can move it. More ships on the route, or a closer refinery.';
  if (!me.surveys.length) return 'Click open ground near your hub and send a <b>survey drone</b>. Then build a mine where it looks good.';
  if (V.sites.filter((s) => s.kind === 'mine').length < 2) return 'Found a second mine: click a surveyed spot inside your claim.';
  if (!V.sites.some((s) => s.kind === 'refinery')) return 'Contractors keep most of the value. Your own <b>refinery</b> keeps more, and other guilds can sell to it.';
  if (!S.guild.exchange && V.lic.exchange) return 'You can now build a <b>Galactic Exchange</b> (Market tab). Buyers will start calling.';
  return '';
}

/* ---------------------------------------------------------------- card (whatever you clicked) */

function closeCard() { S.sel = null; $('#card').hidden = true; }
function renderCard() {
  const el = $('#card');
  if (!S.sel) { el.hidden = true; return; }
  const html = cardHtml(S.sel);
  if (!html) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<button class="close" data-act="closeCard" aria-label="Close">×</button>${html}`;
}

function nearbySurvey(x, y) { return (S.guild.surveys || []).filter((s) => s.status === 'done' && Math.hypot(s.x - x, s.y - y) < 14).sort((a, b) => b.doneAt - a.doneAt)[0]; }

function reportHtml(sv) {
  const r = sv.report;
  const items = r.ores.filter((o) => ore(o.id).tier !== 'common').sort((a, b) => S.oreValue(b.id) * b.est - S.oreValue(a.id) * a.est);
  const commons = r.ores.filter((o) => ore(o.id).tier === 'common');
  const word = (e) => (e >= 0.7 ? 'rich' : e >= 0.45 ? 'good' : e >= 0.25 ? 'fair' : 'thin');
  return `<div class="report"><p class="small muted">Survey ${dur(S.now() - sv.doneAt)} ago · ${['rough', 'sharp', 'exact'][r.precision]} sensors · ${r.soil} ground${r.tough ? ', very tough rock' : ''}</p>
    ${commons.map((o) => `<p class="small">${oreTag(o.id)} everywhere (common)</p>`).join('')}
    ${items.length ? items.map((o) => `<p class="small">${oreTag(o.id)} ${o.trace ? '<span class="muted">maybe traces</span>' : `<b>${word(o.est)}</b> <span class="muted">${pct(o.lo)}–${pct(o.hi)}</span>`}${o.reserve ? ` · ~${fmt(o.reserve)} t in the ground` : ''}${o.hardness > S.view.drill ? ` <span class="warn">hardness ${o.hardness}: your drills can't cut it yet</span>` : ''}</p>`).join('') : '<p class="small muted">No rare ore detected.</p>'}</div>`;
}

function buildButtons(x, y) {
  const out = [];
  for (const k of ['mine', 'refinery', 'air', 'lab']) {
    const why = canBuildAt(S.guild, { planet: S.world.planet, sites: S.world.sites }, k, x, y);
    out.push(`<button class="buy sm" data-build="${k}" data-x="${x}" data-y="${y}" ${why || S.guild.coin < G.build[k].cost || S.view.building >= S.view.crews ? 'disabled' : ''} title="${esc(why || '')}"><span class="bl">${KIND_LABEL[k]}</span><span class="bc">${fmt(G.build[k].cost)}</span></button>`);
  }
  const why = canBuildAt(S.guild, { planet: S.world.planet, sites: S.world.sites }, 'mine', x, y);
  return `<div class="btnrow wrap">${out.join('')}</div>${why ? `<p class="small warn">${esc(why)}</p>` : S.view.building >= S.view.crews ? '<p class="small warn">All construction crews are busy.</p>' : ''}`;
}

function cardHtml(sel) {
  const V = S.view, me = S.guild;
  if (sel.type === 'spot' || sel.type === 'survey') {
    const sv = sel.type === 'survey' ? me.surveys.find((s) => s.id === sel.id) : nearbySurvey(sel.x, sel.y);
    const x = sv ? sv.x : sel.x, y = sv ? sv.y : sel.y;
    const info = spotInfo(S.world.planet, x, y);
    if (info.water) return `<h4>Open water</h4><p class="small">${esc(info.region || '')}. Nothing to dig here unless you count regrets.</p>`;
    const q = surveyCost(me, x, y);
    const flying = me.surveys.find((s) => s.status === 'flying' && Math.hypot(s.x - x, s.y - y) < 14);
    return `<h4>${esc(info.region || 'Unnamed land')} <small>${esc(info.terrain || '')} · ${esc(info.climate || '')}</small></h4>
      <p class="small muted">${esc(info.blurb || '')}</p>
      ${sv ? reportHtml(sv) : flying ? `<p class="small">Drone on the way · back in ${live$(flying.doneAt)}</p>` : '<p class="small">Unsurveyed. Could be anything. Mostly it is dirt.</p>'}
      <div class="btnrow"><button class="buy sm ghost" data-survey="1" data-x="${x}" data-y="${y}" ${V.flying >= V.drones || me.coin < q.cost ? 'disabled' : ''}><span class="bl">${sv ? 'Survey again' : 'Send a drone'}</span><span class="bc">${fmt(q.cost)} · ${dur(q.hours * H)}</span></button></div>
      ${V.flying >= V.drones ? `<p class="small muted">All ${V.drones} drone${V.drones > 1 ? 's are' : ' is'} out.</p>` : ''}
      <h5>Build here</h5>${buildButtons(x, y)}`;
  }
  if (sel.type === 'site') {
    const s = V.sites.find((x) => x.id === sel.id);
    if (!s) return '';
    const head = `<h4><span class="nm" data-rename="${s.id}">${esc(s.name)}</span> <small>${KIND_LABEL[s.kind]}${s.level >= 1 ? ' · ' + esc(s.levelName) : ''}</small></h4><p class="small">${siteStatus(s)}</p>`;
    const up = s.upgrade && !s.build && s.level >= 1 ? `<div class="row slim"><span><span class="t">Expand</span><span class="d">${dur(s.upgrade.hours * H)} of construction</span></span><button class="buy sm" data-up="${s.id}" ${me.coin < s.upgrade.cost || V.building >= V.crews ? 'disabled' : ''}><span class="bc">${fmt(s.upgrade.cost)}</span></button></div>` : '';
    if (s.kind === 'mine') {
      const sv = nearbySurvey(s.x, s.y);
      const routes = V.routes.filter((r) => r.from?.id === s.id);
      const oresHere = Object.keys(s.rates || {});
      const fill = s.store ? s.stockTot / s.store : 0;
      return `${head}
        ${s.level >= 1 ? `<div class="mineout">${oresHere.length ? oresHere.map((id) => `<p class="small">${oreTag(id)} <b>${fmt(s.rates[id])} t/h</b>${s.veins[id] ? ` <span class="vein"><i style="width:${pct(s.veins[id].left)}"></i></span> <span class="muted">${pct(s.veins[id].left)} left</span>` : ''}</p>`).join('') : '<p class="small warn">Digging nothing right now.</p>'}
          ${s.blocked.length ? `<p class="small warn">Too hard for your drills: ${s.blocked.map((id) => oreTag(id, 12)).join(', ')}. Research better drills.</p>` : ''}</div>
          <p class="small">Stockpile ${fmt(s.stockTot)} / ${fmt(s.store)} t</p><div class="bar ${fill > 0.9 ? 'hot' : ''}"><i style="width:${pct(Math.min(1, fill))}"></i></div>
          <h5>How hard to push it</h5>
          <div class="chips">${Object.entries(G.mine.intensity).map(([k, I]) => `<button class="chip" data-intensity="${k}" data-site="${s.id}" aria-pressed="${s.intensity === k}">${I.label}</button>`).join('')}</div>
          <p class="small muted">${{ gentle: 'Slower, cheaper, fewer accidents.', standard: 'Business as usual.', brutal: 'Much more ore. Much more paperwork. Accidents four times as often.' }[s.intensity]}</p>
          <h5>Focus</h5>
          <select data-focus="${s.id}"><option value="">Everything it finds</option>${Object.keys(s.ground || s.rates || {}).concat(oresHere).filter((v, i, a) => a.indexOf(v) === i).map((id) => `<option value="${id}" ${s.focus === id ? 'selected' : ''}>${esc(ore(id).name)}</option>`).join('')}</select>
          <h5>Shipping</h5>
          ${routes.map((r) => `<button class="row slim" data-route="${r.id}"><span><span class="t">→ ${esc(r.to?.name || '?')}</span><span class="d">${r.ok ? `${fmt(r.tph)} t/h · ${r.ships} ship${r.ships === 1 ? '' : 's'}` : `<span class="bad">${esc(r.issue)}</span>`}</span></span><span class="go">›</span></button>`).join('')}
          <div class="btnrow"><button class="buy sm" data-dest="${s.id}"><span class="bl">Ship ore to…</span><span class="bc">⇢</span></button></div>` : ''}
        ${sv && s.level < 1 ? reportHtml(sv) : ''}
        ${up}
        ${s.id !== 'pit' ? `<p class="small"><button class="linkish" data-demolish="${s.id}">Abandon this mine</button></p>` : ''}`;
    }
    if (s.kind === 'refinery') {
      const fill = s.store ? s.inputTot / s.store : 0;
      const into = V.routes.filter((r) => r.to?.kind === 'site' && r.to.id === s.id);
      return `${head}
        ${s.level >= 1 ? `<p class="small">Refines <b>${fmt(s.thru)} t/h</b> of raw ore at ${pct(s.yield)} yield. Refined goods go ${S.guild.exchange?.level >= 1 ? 'to your exchange in orbit' : `to the Guild exchange at ${pct(G.guildExchange)} of the galactic price`}.</p>
        <p class="small">Waiting to refine ${fmt(s.inputTot)} / ${fmt(s.store)} t</p><div class="bar ${fill > 0.9 ? 'hot' : ''}"><i style="width:${pct(Math.min(1, fill))}"></i></div>
        <h5>Buy ore from other guilds</h5>
        <div class="chips"><button class="chip" data-buyon="${s.id}" aria-pressed="${!!s.buy.on}">${s.buy.on ? 'Open to other guilds' : 'Closed'}</button></div>
        <label class="f small">Offer ${pct(s.buy.pct)} of the galactic price <input type="range" min="${G.refinery.buyMin}" max="${G.refinery.buyMax}" step="0.01" value="${s.buy.pct}" data-buypct="${s.id}"></label>
        <p class="small muted">You pay other guilds as their ore arrives. Their ore takes your spare capacity (${fmt(s.room)} t/h now).</p>
        <h5>Supplied by</h5>${into.length ? into.map((r) => `<button class="row slim" data-route="${r.id}"><span><span class="t">${esc(r.from?.name)}</span><span class="d">${fmt(r.tph)} t/h</span></span><span class="go">›</span></button>`).join('') : '<p class="small muted">Nothing ships here yet. Send ore from a mine.</p>'}` : ''}
        ${up}<p class="small"><button class="linkish" data-demolish="${s.id}">Abandon this refinery</button></p>`;
    }
    if (s.kind === 'hub') {
      return `${head}<p class="small">Airstrip, command center and the General's office (window faces the mine). Claim reach <b>${Math.round(s.radius)}</b>, hangar <b>${me.ships.length}/${V.hangar}</b>, <b>${V.crews}</b> construction crews, +${s.rpH} RP/h.</p>${up}
        <div class="btnrow"><button class="buy sm ghost" data-tab="fleet"><span class="bl">Fleet</span><span class="bc">✈</span></button><button class="buy sm ghost" data-tab="lab"><span class="bl">Research</span><span class="bc">⚗</span></button></div>`;
    }
    if (s.kind === 'air') return `${head}<p class="small">Extends your claim (reach ${Math.round(s.radius || 0)}), adds ${G.air.hangar} hangar slots, and ships refuel here on long routes.</p><p class="small"><button class="linkish" data-demolish="${s.id}">Abandon</button></p>`;
    if (s.kind === 'lab') return `${head}<p class="small">${s.level >= 1 ? `+${s.rpH} research points an hour.` : ''}</p>${up}<p class="small"><button class="linkish" data-demolish="${s.id}">Abandon</button></p>`;
  }
  if (sel.type === 'npc') {
    const n = S.world.npc.find((x) => x.id === sel.id);
    if (!n) return '';
    const pr = V.npcPrices[n.id] || {};
    const mine = Object.keys(pr).sort((a, b) => pr[b] - pr[a]);
    return `<h4>${esc(n.name)} <small>Guild contractor</small></h4><p class="small muted">${esc(n.blurb)}</p>
      <p class="small">Pays for raw ore, per tonne:</p>
      <div class="prices">${mine.map((id) => `<p class="small">${oreTag(id, 12)} <b class="gold">${pr[id] >= 10 ? Math.round(pr[id]) : pr[id].toFixed(1)}</b></p>`).join('')}</div>
      ${shipHereButtons({ kind: 'npc', id: n.id })}`;
  }
  if (sel.type === 'rival') {
    const d = (S.world.directory || []).find((x) => x.uid === sel.uid && x.siteId === sel.id);
    if (!d) return `<h4>A rival refinery</h4><p class="small">Not buying right now.</p>`;
    return `<h4>${esc(d.name)} <small>${esc(d.guild)}</small></h4>
      ${d.on ? `<p class="small">Buying raw ore at <b>${pct(d.pct)}</b> of the galactic price, room for about ${fmt(d.room)} t/h.</p>
      <div class="prices">${Object.keys(V.prices).map((id) => `<p class="small">${oreTag(id, 12)} <b class="gold">${fmt(d.pct * V.prices[id].p)}</b></p>`).join('')}</div>
      ${shipHereButtons({ kind: 'rival', id: d.siteId, uid: d.uid })}` : '<p class="small">Closed to outside ore right now.</p>'}`;
  }
  if (sel.type === 'rivalsite') {
    const o = (S.world.sites || []).find((x) => x.uid === sel.uid && x.id === sel.id);
    return o ? `<h4>${esc(o.name)} <small>${esc(o.guild)}</small></h4><p class="small">${KIND_LABEL[o.kind]} of ${esc(o.player || o.guild)}. Keep your distance: the Guild charter says ${G.rivalGap} units.</p>` : '';
  }
  if (sel.type === 'route') {
    const r = V.routes.find((x) => x.id === sel.id);
    if (!r) return '';
    const raw = me.routes.find((x) => x.id === r.id);
    const ships = me.ships.filter((x) => x.routeId === r.id);
    const idle = me.ships.filter((x) => !x.routeId);
    const src = V.sites.find((x) => x.id === r.from?.id);
    return `<h4>${esc(r.from?.name)} → ${esc(r.to?.name)} <small>route</small></h4>
      ${r.ok ? `<p class="small"><b>${fmt(r.tph)} t/h</b> capacity · ${r.cycleH.toFixed(1)}h round trip · ${Math.round(r.path.length)} units${r.path.stops ? ` · refuels ${r.path.stops}×` : ''}</p>` : `<p class="small bad">${esc(r.issue)}</p>`}
      ${src ? `<p class="small muted">The mine digs ${fmt(src.tph)} t/h; all its routes move ${fmt(src.shipping)} t/h.</p>` : ''}
      <h5>Cargo</h5><select data-cargo="${r.id}"><option value="all">Everything in the pile</option>${Object.keys(src?.rates || {}).map((id) => `<option value="${id}" ${raw.cargo === id ? 'selected' : ''}>Only ${esc(ore(id).name)}</option>`).join('')}</select>
      <h5>Ships (${ships.length})</h5>
      ${ships.map((s) => `<p class="small">${esc(s.name)} <small class="muted">${G.ships[s.cls].label}</small> <button class="linkish" data-unassign="${s.id}">take off route</button></p>`).join('')}
      <div class="btnrow wrap">${idle.length ? `<button class="buy sm" data-assignidle="${r.id}"><span class="bl">Add idle ship</span><span class="bc">${idle.length} idle</span></button>` : ''}
        ${Object.entries(G.ships).filter(([, b]) => !b.tech || me.tech[b.tech]).map(([cls, b]) => `<button class="buy sm ghost" data-buyship="${cls}" data-route="${r.id}" ${me.ships.length >= V.hangar || me.coin < V.shipCosts[cls] ? 'disabled' : ''}><span class="bl">+ ${b.label}</span><span class="bc">${fmt(V.shipCosts[cls])}</span></button>`).join('')}</div>
      <p class="small"><button class="linkish" data-delroute="${r.id}">Cancel route</button></p>`;
  }
  if (sel.type === 'exchange') { S.tab = 'market'; render(); return ''; }
  return '';
}

function shipHereButtons(to) {
  const mines = S.view.sites.filter((s) => s.kind === 'mine' && s.level >= 1);
  if (!mines.length) return '';
  return `<h5>Ship ore here from</h5><div class="btnrow wrap">${mines.map((m) => {
    const exists = S.view.routes.some((r) => r.from?.id === m.id && r.to?.kind === to.kind && r.to?.id === to.id);
    return `<button class="buy sm ${exists ? 'ghost' : ''}" data-mkroute="${m.id}" data-to='${esc(JSON.stringify(to))}' ${exists ? 'disabled' : ''}><span class="bl">${esc(m.name)}</span><span class="bc">${exists ? 'routed' : '⇢'}</span></button>`;
  }).join('')}</div>`;
}

/* ---------------------------------------------------------------- calls (buyers on the line) */

function renderCalls() {
  const box = $('#calls');
  const offers = S.view?.offers || [];
  if (!offers.length || $('#talk')) { box.innerHTML = ''; return; }
  const o = offers[offers.length - 1];
  box.innerHTML = `<div class="call"><small>📡 Incoming${offers.length > 1 ? ` (${offers.length})` : ''}</small><b>${esc(buyerName(o.buyerId))}</b><span>${o.qty} ${oreTag(o.oreId, 12)} · ${o.days}d · ${o.price}/u</span>
    <div class="btnrow"><button class="buy sm" data-offer="${o.id}" data-a="accept"><span class="bc">Sign</span></button><button class="buy sm ghost" data-talk="${o.id}"><span class="bc">Talk</span></button><button class="x" data-offer="${o.id}" data-a="decline" aria-label="Decline">✕</button></div></div>`;
}

function openTalk(id) {
  const o = S.view.offers.find((x) => x.id === id);
  if (!o) return;
  const b = S.view.buyers.find((x) => x.id === o.buyerId) || {};
  const ov = document.createElement('div');
  ov.className = 'overlay'; ov.id = 'talk';
  const draw = (o2, status) => {
    const spot = (o2.market || 0) * G.exchange.spot;
    ov.innerHTML = `<div class="sheet talk"><button class="close" data-x>×</button>
      <h2>${esc(b.name || 'A buyer')}</h2><p class="small muted">${esc(b.type || '')}${b.personality ? ' · ' + esc(b.personality) : ''}${b.voice ? ' · speaks ' + esc(b.voice) : ''}</p>
      ${b.backstory ? `<p class="small">${esc(b.backstory)}</p>` : `<p class="small">${esc(b.blurb || '')}</p>`}
      <div class="chat">${o2.lines.map((l) => `<p class="${l.who}">${esc(l.text)}</p>`).join('')}</div>
      <p class="small">${o2.qty} ${oreTag(o2.oreId)} over ${o2.days} days. Their price: <b class="gold">${o2.price}</b>/unit (spot pays about ${spot.toFixed(1)}). Miss the delivery and you pay ${pct(o2.penalty)} of the shortfall.</p>
      ${o2.tell ? `<p class="small sp">Silver Tongue: ${esc(o2.tell)}</p>` : ''}
      ${status === 'walked' ? '<p class="bad">They hung up.</p><div class="btnrow"><button class="buy" data-x><span class="bc">Close</span></button></div>'
        : status === 'accepted' ? '<p class="ok">Signed.</p><div class="btnrow"><button class="buy" data-x><span class="bc">Close</span></button></div>'
        : `<label class="f">Ask for <b id="askv">${o2.price}</b> a unit <input type="range" id="ask" min="${o2.price}" max="${(o2.price * 1.6).toFixed(2)}" step="${o2.price >= 50 ? 1 : 0.05}" value="${(o2.price * 1.1).toFixed(2)}"></label>
          <div class="btnrow"><button class="buy" data-ask><span class="bl">Counter</span><span class="bc" id="askb"></span></button><button class="buy ghost" data-sign><span class="bl">Sign at</span><span class="bc">${o2.price}</span></button><button class="buy ghost" data-no><span class="bc">Decline</span></button></div>
          <p class="small muted">${3 - o2.round} round${3 - o2.round === 1 ? '' : 's'} of haggling left. Push too hard and they walk.</p>`}
      </div>`;
    const sl = ov.querySelector('#ask');
    if (sl) { const upd = () => { ov.querySelector('#askv').textContent = sl.value; ov.querySelector('#askb').textContent = sl.value; }; sl.oninput = upd; upd(); }
  };
  draw(o);
  ov.addEventListener('click', async (e) => {
    const close = () => { ov.remove(); render(); };
    if (e.target === ov || e.target.closest('[data-x]')) return close();
    if (e.target.closest('[data-sign]')) { await cmd({ type: 'offer', offerId: id, action: 'accept' }, 'Contract signed.'); return close(); }
    if (e.target.closest('[data-no]')) { await cmd({ type: 'offer', offerId: id, action: 'decline' }); return close(); }
    if (e.target.closest('[data-ask]')) {
      const price = Number(ov.querySelector('#ask').value);
      const r = await cmd({ type: 'offer', offerId: id, action: 'counter', price });
      const h = r && (r.events || []).find((x) => x.type === 'haggle');
      if (h) {
        const cur = S.view.offers.find((x) => x.id === id);
        draw(cur || { ...h.offer, tell: null, market: o.market }, h.status);
        if (h.status === 'accepted') sfx.big(); else if (h.status === 'walked') sfx.error();
      }
    }
  });
  document.body.appendChild(ov);
}

/* ---------------------------------------------------------------- sheets */

function sheet(html, cls = '') {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet ${cls}"><button class="close" data-x>×</button>${html}</div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) ov.remove(); });
  document.body.appendChild(ov);
  return ov;
}

function openChronicle() {
  S.unread = 0; renderHud();
  const log = (S.guild.log || []).slice().reverse();
  sheet(`<h2>Chronicle</h2><p class="lede small">Everything that happened to your guild, most recent first. Read it or don't; the planet will not mind.</p>
    <div class="feed">${log.map((l) => `<p class="small ${l.kind}"><time>${new Date(l.t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</time> ${esc(l.text)}</p>`).join('')}</div>`);
}

function openSettings() {
  const ov = sheet(`<h2>Settings</h2>
    <label class="f"><input type="checkbox" id="sSound" ${prefs.sound !== false ? 'checked' : ''}> Sound</label>
    <label class="f"><input type="checkbox" id="sRm" ${prefs.reduced ? 'checked' : ''}> Reduced motion</label>
    <h3>Other devices</h3><p class="small">Your device code (keep it secret): <code class="dev">${esc(net.token || '')}</code></p>
    <h3>AI model</h3><select id="sModel"></select><p class="small muted" id="sModelNote"></p>
    ${S.me.owner ? '<h3>Owner</h3><button class="buy danger sm" id="sEnd"><span class="bc">End the month now</span></button>' : ''}
    <h3>Other games</h3><p class="small"><a href="/mines/">The old mineshaft game</a> · <a href="/classic/">The classic artifact</a></p>
    <div class="btnrow"><button class="buy ghost" id="sOut"><span class="bc">Sign out</span></button></div>`);
  ov.querySelector('#sSound').onchange = (e) => setPref('sound', e.target.checked);
  ov.querySelector('#sRm').onchange = (e) => setPref('reduced', e.target.checked);
  ov.querySelector('#sOut').onclick = signOut;
  fillModels(ov.querySelector('#sModel'), ov.querySelector('#sModelNote'));
  const end = ov.querySelector('#sEnd');
  if (end) end.onclick = async () => { if (confirm('End the month for everyone now?')) { await api('POST', '/api/v3/admin/end-month', {}); location.reload(); } };
}

function openNuke() {
  const ov = sheet(`<h2>☢ Nuke the operation</h2><p>Every mine, refinery, ship and coin goes up in one glorious mushroom. You earn <b>${S.view.spectacleNow.toFixed(1)} Spectacle</b> and an audience with the Maker, who can bend the galactic market for everyone.</p>
    <p class="small">You keep your survey reports, your buyer contacts and your SP. You restart with a fresh command hub.</p>
    <label class="f">Type NUKE <input id="nk" autocomplete="off"></label><div class="btnrow"><button class="buy danger" id="nkGo"><span class="bc">Detonate</span></button></div>`);
  ov.querySelector('#nkGo').onclick = async () => {
    const r = await cmd({ type: 'nuke', confirm: ov.querySelector('#nk').value.trim().toUpperCase() });
    if (r && !r.error) { ov.remove(); sfx.boom(); shake(document.body); banner('Spectacle!', 'The Maker would like a word.', 'nuke'); setTimeout(openMaker, 2600); }
  };
}

async function openMaker() {
  const ov = sheet('<h2>The Maker</h2><p class="small muted">Waiting for an audience…</p>', 'maker');
  const ores = S.world.planet.ores;
  const drawM = (sess) => {
    const done = ['granted', 'left', 'refused'].includes(sess.status);
    ov.querySelector('.sheet').innerHTML = `<button class="close" data-x>×</button><h2>The Maker</h2>
      <div class="chat">${sess.lines.map((l) => `<p class="${l.who === 'maker' ? 'them' : 'you'}">${esc(l.text)}</p>`).join('')}</div>
      ${done ? '' : `<label class="f">Ask for <select id="mkKind"><option value="demand|up">more demand for</option><option value="supply|down">less outside supply of</option><option value="demand|down">less demand for</option><option value="supply|up">more outside supply of</option><option value="global|up">every price to rise</option><option value="global|down">every price to fall</option></select>
        <select id="mkOre">${ores.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label>
        <label class="f">Why should the galaxy care? <textarea id="mkWhy" rows="3" maxlength="600" placeholder="A war, a cult, a festival, a shortage…"></textarea></label>
        <div class="btnrow"><button class="buy" id="mkArgue"><span class="bc">Argue</span></button>${sess.status === 'offer' ? '<button class="buy ghost" id="mkAccept"><span class="bc">Accept the offer</span></button>' : ''}<button class="buy ghost" id="mkLeave"><span class="bc">Leave</span></button></div>`}`;
    const q = (s) => ov.querySelector(s);
    if (q('#mkArgue')) q('#mkArgue').onclick = async () => {
      const [kind, direction] = q('#mkKind').value.split('|');
      const ask = { kind, oreId: q('#mkOre').value, direction };
      try { const r = await api('POST', '/api/v3/maker', { action: 'argue', ask, reason: q('#mkWhy').value }); sfx.maker(); drawM(r.body.session); } catch (e) { toast(esc(e.message), 'bad'); }
    };
    if (q('#mkAccept')) q('#mkAccept').onclick = async () => { const r = await api('POST', '/api/v3/maker', { action: 'accept' }); drawM(r.body.session); loadSide(); };
    if (q('#mkLeave')) q('#mkLeave').onclick = async () => { const r = await api('POST', '/api/v3/maker', { action: 'leave' }); drawM(r.body.session); };
  };
  try { const r = await api('POST', '/api/v3/maker', { action: 'open' }); sfx.maker(); drawM(r.body.session); }
  catch (e) { ov.querySelector('.sheet').innerHTML = `<button class="close" data-x>×</button><h2>The Maker</h2><p>${esc(e.message)}</p>`; }
}

/* ---------------------------------------------------------------- landing */

async function landing(st) {
  return new Promise((resolve) => {
    let species = { name: S.me.name + "'s kin", color: SPECIES_COLORS[Math.floor(Math.random() * SPECIES_COLORS.length)] };
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const p = st.world.planet;
    ov.innerHTML = `<form class="sheet join land" autocomplete="off">
      <div class="guild-seal">MG</div>
      <h1>${esc(p.name)}</h1>
      <p class="lede">${esc(p.tagline || '')}</p>
      <p class="small">The galaxy is expanding. Every month the <b>Maker Guild</b> opens a fresh planet and gives rival guilds one month to prove what they can pull out of it. The guild holding the most coin at the end wins exclusive rights. You are its General. Nobody asked the planet.</p>
      ${st.grant ? `<p class="small ok">The month is under way: the Guild advances you ${fmt(st.grant)} extra coin to catch up.</p>` : ''}
      <label class="f">Name your guild <input id="gName" maxlength="28" value="${esc(S.me.name)}'s Extraction Guild" required></label>
      <label class="f">Describe your species (optional) <input id="gDesc" maxlength="200" placeholder="e.g. bureaucratic moth people with briefcases"></label>
      <div class="chips" id="gCols">${SPECIES_COLORS.map((c) => `<button type="button" class="chip" data-col="${c}" aria-pressed="${c === species.color}"><i style="background:${c}"></i></button>`).join('')}</div>
      <div class="btnrow"><button class="buy big" type="submit"><span class="bc">Land</span></button></div>
      <p class="err" id="gErr" hidden></p></form>`;
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-col]'); if (!b) return; species.color = b.dataset.col; ov.querySelectorAll('[data-col]').forEach((x) => x.setAttribute('aria-pressed', x === b)); });
    ov.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = ov.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const desc = ov.querySelector('#gDesc').value.trim();
        if (desc) { try { const r = await api('POST', '/api/v2/species', { description: desc }); if (r.body?.species) species = { ...r.body.species, color: species.color }; } catch {} }
        const r = await api('POST', '/api/v3/start', { name: ov.querySelector('#gName').value, species });
        ov.remove();
        resolve(r.body);
      } catch (err) { const el = ov.querySelector('#gErr'); el.textContent = err.message; el.hidden = false; btn.disabled = false; }
    });
    document.body.appendChild(ov);
  });
}

/* ---------------------------------------------------------------- events */

function onMapClick(hit) {
  sfx.tap();
  if (S.mode && S.mode.kind === 'dest') {
    const from = S.mode.from;
    let to = null;
    if (hit.type === 'npc') to = { kind: 'npc', id: hit.id };
    else if (hit.type === 'site' && S.view.sites.find((s) => s.id === hit.id)?.kind === 'refinery') to = { kind: 'site', id: hit.id };
    else if (hit.type === 'rival') to = { kind: 'rival', id: hit.id, uid: hit.uid };
    setMode(null);
    if (to) { makeRoute(from, to); return; }
    toast('Pick a refinery: a Guild contractor, one of yours, or another guild that is buying.', 'warn');
    return;
  }
  S.sel = hit;
  if (hit.type === 'exchange') { S.tab = 'market'; S.sel = null; render(); return; }
  renderCard();
}

async function makeRoute(from, to) {
  const idle = S.guild.ships.find((s) => !s.routeId);
  const r = await cmd({ type: 'route', from, to, shipId: idle ? idle.id : undefined }, idle ? `${esc(idle.name)} is on its way.` : 'Route set. Put a ship on it.');
  if (r && !r.error) {
    const rt = S.guild.routes[S.guild.routes.length - 1];
    S.sel = { type: 'route', id: rt.id };
    sfx.launch();
    renderCard();
  }
}

function setMode(m) {
  S.mode = m;
  const el = $('#mode');
  if (!m) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = m.kind === 'dest' ? `Pick where <b>${esc(S.view.sites.find((s) => s.id === m.from)?.name || '')}</b> ships its ore: any refinery marked on the map. <button class="linkish" data-act="cancelMode">Cancel</button>` : '';
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-sel], [data-route], [data-tab]');
  if (!t) return;
  const d = t.dataset;
  if (d.tab && t.classList.contains('tab')) { S.tab = d.tab; store('g_tab', S.tab); render(); return; }
  if (d.tab) { S.tab = d.tab; store('g_tab', S.tab); render(); return; }
  if (d.sel) { const s = S.view.sites.find((x) => x.id === d.sel); S.sel = { type: 'site', id: d.sel }; if (s) map.focus(s.x, s.y, Math.max(map.view.tz, 2.4)); renderCard(); return; }
  if (d.route && !d.buyship) { const r = S.view.routes.find((x) => x.id === d.route); S.sel = { type: 'route', id: d.route }; if (r?.path) { const m = r.path.pts[Math.floor(r.path.pts.length / 2)]; map.focus(m.x, m.y); } renderCard(); return; }
  if (d.act === 'closeCard') return closeCard();
  if (d.act === 'cancelMode') return setMode(null);
  if (d.act === 'buildExchange') return cmd({ type: 'buildExchange' }, 'Exchange under construction.');
  if (d.act === 'upgradeExchange') return cmd({ type: 'upgradeExchange' });
  if (d.act === 'nuke') return openNuke();
  if (d.act === 'maker') return openMaker();
  if (d.build) { const r = await cmd({ type: 'build', kind: d.build, x: +d.x, y: +d.y }); if (r && !r.error) { const s = S.view.sites[S.view.sites.length - 1]; S.sel = { type: 'site', id: s.id }; renderCard(); } return; }
  if (d.survey) return cmd({ type: 'survey', x: +d.x, y: +d.y }, 'Drone away.');
  if (d.up) return cmd({ type: 'upgrade', siteId: d.up });
  if (d.intensity) return cmd({ type: 'setMine', siteId: d.site, intensity: d.intensity });
  if (d.dest) { setMode({ kind: 'dest', from: d.dest }); closeCard(); map.focus(map.view.tcx, map.view.tcy, Math.min(map.view.tz, 1.6)); return; }
  if (d.mkroute) return makeRoute(d.mkroute, JSON.parse(d.to));
  if (d.buyship) return cmd({ type: 'buyShip', cls: d.buyship, routeId: d.route || undefined });
  if (d.assignidle) { const sh = S.guild.ships.find((s) => !s.routeId); if (sh) return cmd({ type: 'assign', shipId: sh.id, routeId: d.assignidle }); return; }
  if (d.unassign) return cmd({ type: 'assign', shipId: d.unassign, routeId: null });
  if (d.delroute) { await cmd({ type: 'deleteRoute', routeId: d.delroute }); closeCard(); return; }
  if (d.demolish) { if (confirm('Abandon it? You get nothing back. The hole stays.')) { await cmd({ type: 'demolish', siteId: d.demolish }); closeCard(); } return; }
  if (d.buyon) { const s = S.view.sites.find((x) => x.id === d.buyon); return cmd({ type: 'setRefinery', siteId: d.buyon, on: !s.buy.on }); }
  if (d.tech) return cmd({ type: 'research', tech: d.tech });
  if (d.spot) { const ex = S.guild.exchange; return cmd({ type: 'setSpot', oreId: d.spot, on: ex.spot[d.spot] === false }); }
  if (d.offer) return cmd({ type: 'offer', offerId: d.offer, action: d.a }, d.a === 'accept' ? 'Contract signed.' : null);
  if (d.talk) return openTalk(d.talk);
  if (d.evo) return cmd({ type: 'evolve', kind: d.evo });
});
document.addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (d.assign !== undefined) cmd({ type: 'assign', shipId: d.assign, routeId: e.target.value || null });
  if (d.focus !== undefined) cmd({ type: 'setMine', siteId: d.focus, focus: e.target.value || null });
  if (d.cargo) cmd({ type: 'setRoute', routeId: d.cargo, cargo: e.target.value });
  if (d.buypct) cmd({ type: 'setRefinery', siteId: d.buypct, pct: Number(e.target.value) });
});
document.addEventListener('dblclick', (e) => {
  const n = e.target.closest('[data-rename]');
  if (!n) return;
  const name = prompt('Rename', n.textContent);
  if (name) cmd({ type: 'rename', target: 'site', id: n.dataset.rename, name });
});

/* ---------------------------------------------------------------- render */

function render() {
  if (!S.view) return;
  renderHud();
  renderTabs();
  renderTab();
  renderCard();
  renderCalls();
  const h = currentHint();
  $('#hint').hidden = !h || !!S.mode; $('#hint').innerHTML = h;
}
// timers tick without re-rendering everything
setInterval(() => { for (const el of document.querySelectorAll('[data-until]')) el.textContent = dur(Number(el.dataset.until) - S.now()); if (S.view) $('#left').textContent = dur(S.world.endsAt - S.now()); }, 1000);

async function loadSide() {
  try { S.board = (await api('GET', '/api/v3/board')).body.month || []; } catch {}
  try { S.bulletin = (await api('GET', '/api/v3/bulletin')).body.changes || []; } catch {}
  try { S.feed = (await api('GET', '/api/v3/feed')).body.docs.map((d) => d.data) || []; } catch {}
  render();
}

let map = null;
async function boot() {
  applyPrefs();
  net.onAuthLost = () => location.reload();
  S.me = await ensureSignedIn();
  let st = (await api('GET', '/api/v3/state')).body;
  if (!st.guild) { S.world = st.world; S.me = st.me; $('#boot').hidden = true; st = await landing(st); }
  $('#boot').hidden = true; $('#app').hidden = false;
  map = createMap(S, { onMapClick });
  window.__guild = { S, map, cmd, refresh };
  S.lastLogT = Math.max(0, ...(st.guild?.log || []).map((l) => l.t));
  apply(st, { quiet: true });
  const home = S.guild.landing;
  map.view.cx = map.view.tcx = 500; map.view.cy = map.view.tcy = 500; map.view.z = 1;
  map.focus(home.x, home.y, 2.6);
  $('#zoomIn').onclick = () => map.zoomBy(1.4);
  $('#zoomOut').onclick = () => map.zoomBy(0.7);
  $('#zoomHome').onclick = () => map.focus(S.guild.landing.x, S.guild.landing.y, 2.6);
  $('#logBtn').onclick = openChronicle;
  $('#gear').onclick = openSettings;
  $('#rankBtn').onclick = () => { S.tab = 'guild'; render(); };
  requestAnimationFrame(hudLoop);
  loadSide();
  setInterval(() => refresh(), 20_000);
  setInterval(loadSide, 60_000);
  live({
    board3: (m) => { if (m.op === 'set') { const i = S.board.findIndex((b) => b.id === m.id); if (i >= 0) S.board[i] = m.data; else S.board.push(m.data); S.board.sort((a, b) => b.coin - a.coin); renderHud(); } },
    world3: (m) => { if (m.op === 'set' && S.world) { Object.assign(S.world, m.data); } },
    feed3: (m) => { if (m.op === 'set') { S.feed.unshift(m.data); S.feed = S.feed.slice(0, 60); const tk = $('#ticker'); tk.innerHTML = `<span class="tk"><time>now</time>${esc(m.data.text)}</span>`; } },
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
boot().catch((e) => { console.error(e); $('#boot').innerHTML = `<p>Could not reach the Maker Guild: ${esc(e.message)}</p>`; });
