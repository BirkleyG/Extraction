/* Mineshaft Capital: the guild game client. Zoom out to plan (the planet map), zoom in to play (inside an operation).
 * The server is the truth: we send commands and render the view it returns. Between syncs the coin counter
 * runs on the net rate the server reported, so nothing hidden (ore under the ground, buyers' limits) reaches the browser.
 * No advice anywhere: the game shows what is happening (a full pile, a "!" over the lift) and lets you work it out. */
import { api, ensureSignedIn, net, live, signOut, fillModels } from '/app/net.js';
import { toast, banner, sfx, prefs, setPref, applyPrefs, Ticker, bump, shake } from '/app/juice.js';
import { esc, oreIcon, speciesIcon, SPECIES_COLORS, store, TIER_COL } from '/app/util.js';
import { GUILD_TUNING as G, fmt, spotInfo, canBuildAt, foundQuote, surveyCost, NODES, BRANCHES, branchOf } from '/shared/guild/index.js';
import { createMap } from './map.js';
import { createInside } from './inside.js';

const $ = (s, r = document) => r.querySelector(s);
const H = 3_600_000;
const S = {
  me: null, guild: null, view: null, world: null, board: [], feed: [], sel: null, mode: null, tab: store('g_tab') || 'ops',
  sync: { server: 0, client: 0 }, lastLogT: 0, unread: 0, bulletin: [], history: null, inside: null, peek: null, follow: null, followAt: null,
  now: () => S.sync.server + (Date.now() - S.sync.client),
};
S.insideSite = () => (S.inside ? (S.inside.uid ? S.peek && S.peek.site : S.view?.sites.find((s) => s.id === S.inside.id)) : null);
const ore = (id) => (S.world?.planet.ores || []).find((o) => o.id === id) || { id, name: id, tier: 'common' };
S.oreTier = (id) => ore(id).tier;
S.oreColor = (id) => ore(id).color || TIER_COL[ore(id).tier];
S.oreValue = (id) => S.view?.prices?.[id]?.pbar || 1;
S.routeCargoColor = (r) => { const raw = S.guild?.routes.find((x) => x.id === r.id); const c = r.job ? (S.view.jobs.find((j) => j.id === r.job) || {}).oreId : raw && raw.cargo !== 'all' ? raw.cargo : null; return c ? S.oreColor(c) : '#e8e4f2'; };
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
const KIND_LABEL = { hub: 'Command hub', mine: 'Mine', refinery: 'Refinery', air: 'Air station', lab: 'Research hub', exchange: 'Galactic Exchange' };
const worker = () => S.view?.labor?.word || 'workers';

/* ---------------------------------------------------------------- sync */

function apply(st, { quiet = false } = {}) {
  if (!st) return;
  S.me = st.me || S.me;
  if (st.world) S.world = st.world;
  S.sync = { server: st.serverNow, client: Date.now() };
  const prev = S.guild;
  S.guild = st.guild; S.view = st.view;
  if (!S.guild) return;
  const fresh = (S.guild.log || []).filter((l) => l.t > S.lastLogT);
  if (S.lastLogT && !quiet) {
    const notable = fresh.filter((l) => !['build', 'route', 'drone', 'ship', 'tech', 'part', 'hire'].includes(l.kind));
    if (notable.length > 3) {
      toast(`While you were away: ${notable.length} things happened. The <b>Chronicle</b> (top right) has the gory details.`, 'info', 6000);
    } else for (const l of notable) {
      const kind = ['incident', 'strike', 'death', 'sealed'].includes(l.kind) ? 'bad' : ['contract', 'offer', 'job'].includes(l.kind) ? 'sale' : ['full', 'vein'].includes(l.kind) ? 'warn' : 'info';
      toast(esc(l.text), kind, 5200);
      if (l.kind === 'incident') { sfx.hazard(); shake($('#stage')); }
      else if (l.kind === 'offer') sfx.bell();
      else if (l.kind === 'built' || l.kind === 'shuttle') sfx.unlock();
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
  if (S.inside?.uid) loadPeek();
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
  $('#rp').textContent = `${fmt(V.rp)} (+${V.rpH.toFixed(1)}/h)`;
  $('#spStat').hidden = !(S.guild.sp > 0);
  $('#sp').textContent = (S.guild.sp || 0).toFixed(1);
  const i = S.board.findIndex((b) => b.id === S.me.id);
  $('#rank').textContent = i >= 0 ? '#' + (i + 1) : '–';
  $('#rankOf').textContent = S.board.length ? 'of ' + S.board.length : '';
  $('#logN').hidden = !S.unread; $('#logN').textContent = S.unread;
}

/* ---------------------------------------------------------------- tabs */

const TABS = [['ops', 'Operations'], ['fleet', 'Fleet'], ['lab', 'Research'], ['market', 'Market'], ['guild', 'Guild']];
function renderTabs() {
  const calls = (S.view.offers || []).length;
  $('#tabs').innerHTML = S.inside ? `<button class="tab back" data-act="exit">← Map</button><span class="tabtitle">${esc(S.insideSite()?.name || '')}</span>`
    : TABS.map(([id, label]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${S.tab === id}">${label}${id === 'market' && calls ? '<i class="dot"></i>' : ''}</button>`).join('');
}
function renderTab() {
  const body = $('#tabbody');
  const y = body.scrollTop;
  if (S.inside) body.innerHTML = S.inside.uid ? peekPanel() : opPanel(S.insideSite());
  else body.innerHTML = ({ ops: tabOps, fleet: tabFleet, lab: tabLab, market: tabMarket, guild: tabGuild }[S.tab] || tabOps)();
  body.scrollTop = y;
}

const FLAG = { full: '<i class="flag warn" title="full">!</i>', haul: '<i class="flag warn" title="lift">!</i>', halt: '<i class="flag bad">!</i>', decision: '<i class="flag bad">!</i>' };
function siteLine(s) {
  if (s.arrive) return `<span class="warn">on the way · ${live$(s.arrive.doneAt)}</span>`;
  const bits = [];
  if (s.kind === 'mine') bits.push(`${fmt(s.tph)} t/h`, `${s.stockTot ? fmt(s.stockTot) : 0}/${fmt(s.store)} t piled`);
  if (s.kind === 'refinery') bits.push(`${fmt(s.inflow)} t/h in`, `refines ${fmt(s.thru)}`);
  if (s.kind === 'lab' || s.kind === 'hub') bits.push(`+${(s.rpH || 0).toFixed(1)} RP/h`);
  if (s.need) bits.push(`${s.crew}/${s.need} crew`);
  return bits.join(' · ');
}

function tabOps() {
  const V = S.view;
  const order = ['hub', 'exchange', 'mine', 'refinery', 'lab', 'air'];
  const sites = V.sites.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return `
    <h2>${esc(S.guild.name)}</h2>
    <p class="lede small">Running costs ${perH(V.upkeepH)} · wages ${perH(V.wagesH)} · income ${perH(V.incomeH)}</p>
    <h3>Operations (${V.sites.length})</h3>
    ${sites.map((s) => `<button class="row op" data-enter="${s.id}"><span><span class="t">${esc(s.name)} ${(s.flags || []).map((f) => FLAG[f] || '').join('')}</span> <small class="muted">${KIND_LABEL[s.kind]}</small><span class="d">${siteLine(s)}</span></span><span class="go">⤵</span></button>`).join('')}
    <p class="small lede">Click open ground on the map to survey it or found a new operation. Anywhere goes; far from your hubs costs more and takes longer to set up.</p>`;
}

function tabFleet() {
  const V = S.view, me = S.guild;
  const idle = me.ships.filter((s) => !s.routeId);
  const camps = Object.fromEntries((S.world.camps || []).map((c) => [c.id, c]));
  const npcs = Object.fromEntries((S.world.npc || []).map((c) => [c.id, c]));
  const board = V.jobs.filter((j) => !j.done && !j.taken);
  const taken = V.jobs.filter((j) => j.taken && !j.done);
  return `
    <h2>Fleet</h2>
    <p class="lede small">${me.ships.length}/${V.hangar} hangar slots · ${idle.length} idle.</p>
    <h3>Routes</h3>
    ${V.routes.length ? V.routes.map((r) => `<button class="row" data-route="${r.id}"><span><span class="t">${esc(r.from?.name || '?')} → ${esc(r.to?.name || '?')}${r.job ? ' <small class="sp">freight job</small>' : ''}</span><span class="d">${r.ok ? `${fmt(r.tph)} t/h · ${r.ships} ship${r.ships === 1 ? '' : 's'} · ${r.cycleH.toFixed(1)}h round trip${r.path?.stops ? ` · ${r.path.stops} refuel${r.path.stops > 1 ? 's' : ''}` : ''}` : `<span class="bad">${esc(r.issue)}</span>`}</span></span><span class="go">›</span></button>`).join('') : '<p class="small lede">No routes yet.</p>'}
    <h3>Guild freight board</h3>
    <p class="small lede">The Guild pays per tonne to move ore from a prospector camp to a contractor. The cargo is not yours; the pay is.</p>
    ${board.map((j) => `<div class="row"><span><span class="t">${fmt(j.qty)} t ${oreTag(j.oreId, 12)}</span><span class="d">${esc(camps[j.from]?.name || '?')} → ${esc(npcs[j.to]?.name || '?')} · pays <b class="gold">${j.rate}</b>/t · ${coinTxt(j.qty * j.rate)} total · open for ${live$(j.due)}</span></span><button class="buy sm" data-job="${j.id}"><span class="bl">Take it</span><span class="bc">✈</span></button></div>`).join('') || '<p class="small lede">Nothing on the board. Check back in a few hours.</p>'}
    ${taken.length ? `<h5>Your jobs</h5>${taken.map((j) => `<p class="small">${fmt(j.delivered)}/${fmt(j.qty)} t ${oreTag(j.oreId, 12)} · due ${live$(j.due)}</p>`).join('')}` : ''}
    <h3>Buy ships</h3>
    ${Object.entries(G.ships).map(([cls, b]) => {
      const locked = b.tech && !me.tree[b.tech];
      return `<div class="row"><span><span class="t">${b.label}</span><span class="d">${Math.round(b.cap)} t hold · speed ${b.speed} · range ${b.range} · ${b.upkeep}/h${locked ? ` · <span class="warn">research ${esc(NODES[b.tech].label)}</span>` : ''}</span></span><button class="buy sm" data-buyship="${cls}" ${locked || me.ships.length >= V.hangar ? 'disabled' : ''}><span class="bc">${fmt(V.shipCosts[cls])}</span></button></div>`;
    }).join('')}
    <h3>Ships</h3>
    ${me.ships.map((s) => { const r = V.routes.find((x) => x.id === s.routeId); return `<div class="row"><span><span class="t">${esc(s.name)}</span> <small class="muted">${G.ships[s.cls].label}</small><span class="d">${r ? esc(`${r.from?.name} → ${r.to?.name}`) : '<span class="muted">idle in the hangar</span>'}</span></span><select data-assign="${s.id}"><option value="">Idle</option>${V.routes.map((x) => `<option value="${x.id}" ${x.id === s.routeId ? 'selected' : ''}>${esc((x.from?.name || '') + ' → ' + (x.to?.name || ''))}</option>`).join('')}</select></div>`; }).join('')}`;
}

/* ---------------------------------------------------------------- research: the skill tree */

function tabLab() {
  const V = S.view, me = S.guild;
  const open = new Set(V.branches);
  const labs = V.sites.filter((s) => s.kind === 'lab');
  return `
    <h2>Research</h2>
    <p class="lede small"><b>${fmt(V.rp)} RP</b>, +${V.rpH.toFixed(1)}/h. Management grows from your hub. Every other branch needs a research hub in the right kind of land: what a lab studies depends on where it stands.</p>
    ${labs.length ? `<p class="small">${labs.map((l) => `${esc(l.name)}: <span style="color:${BRANCHES[l.branch].color}">${BRANCHES[l.branch].label}</span>`).join(' · ')}</p>` : ''}
    ${Object.entries(BRANCHES).map(([b, B]) => {
      const nodes = Object.entries(NODES).filter(([, N]) => N.b === b);
      const w = Math.max(...nodes.map(([, N]) => N.x)) + 1, h = Math.max(...nodes.map(([, N]) => N.y)) + 1;
      const isOpen = open.has(b);
      return `<div class="branch ${isOpen ? '' : 'locked'}" style="--bc:${B.color}"><div class="bhead"><b>${B.label}</b><small>${isOpen ? esc(B.text) : `Build a research hub in ${esc(B.where)}`}</small></div>
        <div class="tree" style="--w:${w};--h:${h}">
          <svg class="links" viewBox="0 0 ${w * 100} ${h * 100}" preserveAspectRatio="none">${nodes.filter(([, N]) => N.needs).map(([, N]) => { const P0 = NODES[N.needs]; return `<line x1="${P0.x * 100 + 50}" y1="${P0.y * 100 + 50}" x2="${N.x * 100 + 50}" y2="${N.y * 100 + 50}" class="${me.tree[N.needs] ? 'on' : ''}"/>`; }).join('')}</svg>
          ${nodes.map(([id, N]) => {
            const known = !!me.tree[id], reach = isOpen && (!N.needs || me.tree[N.needs]);
            const can = reach && !known && V.rp >= N.rp;
            return `<button class="node ${known ? 'known' : reach ? 'reach' : 'far'} ${can ? 'can' : ''}" style="--x:${N.x};--y:${N.y}" data-node="${id}" ${known || !can ? 'aria-disabled="true"' : ''} title="${esc(N.label)}: ${esc(N.text)}"><span class="nl">${esc(N.label)}</span><span class="nc">${known ? '✓' : N.rp + ' RP'}</span></button>`;
          }).join('')}
        </div></div>`;
    }).join('')}`;
}

/* ---------------------------------------------------------------- market */

function sparkline(points, w = 90, h = 22) {
  if (!points || points.length < 2) return '';
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const d = points.map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p[1] - lo) / span) * h).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${d}"/></svg>`;
}
function priceRow(id) {
  const p = S.view.prices[id];
  if (!p) return '';
  const idx = p.idx, arrow = idx > 1.03 ? '<span class="ok">▲</span>' : idx < 0.97 ? '<span class="bad">▼</span>' : '<span class="muted">■</span>';
  const analysts = !!S.guild.tree.x1;
  const o = ore(id);
  return `<div class="row price"><span><span class="t">${oreTag(id)}</span><span class="d">${esc(o.use || '')}${analysts ? ` · planet share ${pct(p.share)}` : ''}</span>${analysts && S.history ? sparkline(S.history.prices?.[id]) : ''}</span><span class="pv">${arrow} ${fmt(p.p)}<small>${pct(idx)} of normal</small></span></div>`;
}
function tabMarket() {
  const V = S.view;
  const ex = V.sites.find((s) => s.kind === 'exchange');
  const active = (V.contracts || []).filter((c) => !c.done);
  const done = (V.contracts || []).filter((c) => c.done).slice(-5).reverse();
  return `
    <h2>Market</h2>
    <p class="lede small">Galactic prices for refined ore. They come from what the galaxy wants and how much this planet is dumping on it.</p>
    ${Object.keys(V.prices).map(priceRow).join('')}
    <h3>Galactic Exchange</h3>
    ${!ex ? `<p class="small">Sell refined goods straight to galactic buyers. They will start calling with contracts.</p>
      <div class="row"><span><span class="t">Build a Galactic Exchange</span><span class="d">${fmt(G.exchange.cost)} coin · assembled in orbit in ${G.exchange.hours}h · ${G.exchange.upkeep}/h. ${V.lic.exchange ? '' : `Licensed from day ${G.exchange.day}.`} Needs a working refinery.</span></span><button class="buy sm" data-act="buildExchange" ${!V.lic.exchange ? 'disabled' : ''}><span class="bc">${fmt(G.exchange.cost)}</span></button></div>`
      : ex.arrive ? `<p class="warn">Being assembled in orbit · ${live$(ex.arrive.doneAt)}</p>`
      : `<button class="row op" data-enter="exchange"><span><span class="t">Step inside the exchange</span><span class="d">docks, trading floor, stock and spot sales</span></span><span class="go">⤵</span></button>`}
    ${ex && ex.level >= 1 ? `
    <h3>Buyers calling (${V.offers.length})</h3>
    ${V.offers.length ? V.offers.map(offerRow).join('') : '<p class="small lede">Nobody is calling right now. They will. They always do.</p>'}
    <h3>Contracts</h3>
    ${active.length ? active.map(contractRow).join('') : '<p class="small lede">No open contracts.</p>'}
    ${done.length ? `<details><summary class="small">Recent</summary>${done.map(contractRow).join('')}</details>` : ''}
    <h3>Buyers you know</h3>
    ${V.buyers.length ? V.buyers.map(buyerRow).join('') : '<p class="small lede">You have not met anyone yet.</p>'}` : ''}`;
}
const buyerName = (id) => (S.view.buyers.find((b) => b.id === id) || {}).name || 'A buyer';
function offerRow(o) {
  const vsMarket = o.market ? o.price / (o.market * (S.view.exchangeStats?.spot || G.exchange.spot)) - 1 : 0;
  return `<div class="row offer"><span><span class="t">${esc(buyerName(o.buyerId))}</span><span class="d">${o.qty} ${oreTag(o.oreId, 12)} in ${o.days} days at <b>${o.price}</b> (${vsMarket >= 0 ? '+' : ''}${pct(vsMarket)} vs spot) · worth ${fmt(o.price * o.qty)} · expires ${live$(o.expires)}</span><span class="d quote">“${esc(o.lines[o.lines.length - 1].text)}”</span></span><span class="col"><button class="buy sm" data-offer="${o.id}" data-a="accept"><span class="bc">Sign</span></button><button class="buy sm ghost" data-talk="${o.id}"><span class="bc">Talk</span></button><button class="x" data-offer="${o.id}" data-a="decline" aria-label="Decline">✕</button></span></div>`;
}
function contractRow(c) {
  const f = c.delivered / c.qty;
  return `<div class="row"><span><span class="t">${esc(buyerName(c.buyerId))}: ${fmt(c.qty)} ${oreTag(c.oreId, 12)} at ${c.price}</span><span class="d">${c.done ? (c.delivered >= c.qty ? '<span class="ok">filled</span>' : '<span class="bad">short, penalty paid</span>') : `due ${live$(c.due)}`} · paid ${fmt(c.paid)}</span><span class="bar"><i style="width:${pct(Math.min(1, f))}"></i></span></span></div>`;
}
function buyerRow(b) {
  const stars = '★'.repeat(b.level) + '☆'.repeat(3 - b.level);
  return `<details class="dossier"><summary><b>${esc(b.name)}</b> <small class="muted">${esc(b.type || '')} · ${stars} · ${b.deals} deal${b.deals === 1 ? '' : 's'}${b.defaults ? `, ${b.defaults} missed` : ''}</small></summary>
    <p class="small">${esc(b.blurb || '')}</p>
    ${b.voice ? `<p class="small muted">Voice: ${esc(b.voice)}. ${b.personality ? 'Seems ' + esc(b.personality) + '.' : ''}</p>` : ''}
    ${b.backstory ? `<p class="small">${esc(b.backstory)}</p>` : '<p class="small muted">Close a deal with them to learn more.</p>'}
    ${b.wants ? `<p class="small">Buys: ${b.wants.map((id) => oreTag(id, 12)).join(', ')}</p>` : ''}
    ${b.quirk ? `<p class="small">${esc(b.quirk)} Usually pays about ${b.premium >= 0 ? '+' : ''}${b.premium}% over market.</p>` : ''}</details>`;
}

function tabGuild() {
  const me = S.guild, V = S.view;
  return `
    <h2>Guild</h2>
    <h3>This month's ranking</h3>
    <p class="small lede">The Maker Guild awards the planet to the guild holding the most coin at month's end.</p>
    ${S.board.map((b, i) => `<div class="row lb ${b.id === S.me.id ? 'me' : ''}"><span><span class="t">#${i + 1} ${b.species ? speciesIcon(b.species, 18) : ''} ${esc(b.name)}</span><span class="d">${esc(b.player || '')} · ${b.sites} ops · ${b.netH >= 0 ? '+' : ''}${fmt(b.netH)}/h${b.nukes ? ` · ☢${b.nukes}` : ''}</span></span><span class="pv gold">${fmt(b.coin)}</span></div>`).join('') || '<p class="small">Nobody yet.</p>'}
    <h3>Prestige: the nuke</h3>
    ${V.nukeReady ? `<p class="small">Blow up everything you own for <b>${V.spectacleNow.toFixed(1)} Spectacle</b>. You keep surveys, buyers and SP; you lose every operation, ship, ${esc(worker())}, coin and research. Then the Maker will see you.</p><div class="btnrow"><button class="buy danger" data-act="nuke"><span class="bl">Nuke the operation</span><span class="bc">☢</span></button></div>`
      : `<p class="small lede">Earn ${fmt(G.nukeMin)} coin since your last nuke to unlock it (${fmt(me.runEarned)} so far).</p>`}
    ${me.lastNuke ? `<div class="btnrow"><button class="buy ghost" data-act="maker"><span class="bl">Audience with the Maker</span><span class="bc">⚙</span></button></div>` : ''}
    ${me.sp > 0 || Object.values(me.evo).some((x) => x) ? `<h3>Evolutions (${me.sp.toFixed(1)} SP)</h3>${Object.entries(G.evo).map(([k, E]) => `<div class="row"><span><span class="t">${E.label} ${me.evo[k] ? 'lv ' + me.evo[k] : ''}</span><span class="d">${E.text}: +${Math.round(E.per * 100)}% a level</span></span><button class="buy sm" data-evo="${k}" ${me.sp < V.evoCosts[k] ? 'disabled' : ''}><span class="bc">${V.evoCosts[k]} SP</span></button></div>`).join('')}` : ''}
    <h3>Galaxy</h3>
    ${S.bulletin.length ? S.bulletin.map((c) => `<div class="row"><span><span class="t">${esc(c.title)}</span><span class="d">${c.source === 'maker' ? `Granted by the Maker to ${esc(c.byName || 'a General')}` : 'Galactic event'}${c.until ? ` · ends ${live$(c.until)}` : ' · all month'}</span></span></div>`).join('') : '<p class="small lede">The galaxy is calm. Suspiciously calm.</p>'}
    <h3>Planet news</h3>
    <div class="feed">${S.feed.slice(0, 25).map((f) => `<p class="small"><time>${new Date(f.t).toLocaleString([], { day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time> ${esc(f.text)}</p>`).join('')}</div>`;
}

/* ---------------------------------------------------------------- inside an operation: the panel */

function partsHtml(s) {
  return s.parts.map((p) => `<div class="row part" id="part-${p.id}"><span><span class="t">${esc(p.label)} <span class="pips">${'▮'.repeat(p.level)}${'▯'.repeat(Math.max(0, p.max - p.level))}</span></span><span class="d">${esc(p.text)}${p.crew ? ` · ${p.crew} crew each` : ''}</span></span>${p.cost == null ? '<span class="tag ok">max</span>' : `<button class="buy sm" data-part="${p.id}" data-site="${s.id}" ${S.guild.coin < p.cost ? 'disabled' : ''}><span class="bc">${fmt(p.cost)}</span></button>`}</div>`).join('');
}
function shiftHtml(s) {
  return `<h5>Shift orders</h5><div class="chips">${Object.entries(G.shifts).map(([k, sh]) => `<button class="chip" data-shift="${k}" data-site="${s.id}" aria-pressed="${s.shift === k}" title="${esc(sh.text)}">${sh.label}</button>`).join('')}</div>
    <p class="small muted">${esc(G.shifts[s.shift]?.text || '')} Morale ${s.morale}.</p>`;
}
function crewHtml(s) {
  if (!s.need) return '';
  return `<p class="small">Crew <b>${s.crew}/${s.need}</b>${s.crewCap != null ? ` (capped at ${s.crewCap})` : ''} · <button class="linkish" data-crewcap="${s.id}">${s.crewCap != null ? 'remove the cap' : 'cap the crew'}</button></p>`;
}

function opPanel(s) {
  if (!s) return '<p>Gone.</p>';
  const V = S.view;
  const head = `<h2><span class="nm" data-rename="${s.id}">${esc(s.name)}</span></h2><p class="small muted">${KIND_LABEL[s.kind]}${s.region ? ' · ' + esc(s.region) : ''}${s.terrain ? ' · ' + esc(s.terrain) : ''}</p>`;
  if (s.arrive) return `${head}<p class="warn">Crews and supplies are flying in · ${live$(s.arrive.doneAt)}</p>`;
  const dec = s.decision ? V.decisions.find((d) => d.id === s.decision) : null;
  const decHtml = dec ? decisionHtml(dec) : '';
  const abandon = s.kind !== 'hub' && s.id !== 'pit' && s.kind !== 'exchange' ? `<p class="small"><button class="linkish" data-demolish="${s.id}">Abandon this ${KIND_LABEL[s.kind].toLowerCase()}</button></p>` : '';
  if (s.kind === 'mine') {
    const routes = V.routes.filter((r) => r.from?.kind === 'site' && r.from.id === s.id);
    const fill = s.store ? s.stockTot / s.store : 0;
    const blastIn = s.blastReady - S.now();
    return `${head}${decHtml}
      <div class="facts"><span>Digs <b>${fmt(s.dig)}</b> t/h</span><span>Lift raises <b>${fmt(s.haul)}</b> t/h</span><span>Ships take <b>${fmt(s.shipping)}</b> t/h</span></div>
      <div class="mineout">${Object.keys(s.rates).length ? Object.entries(s.rates).map(([id, r]) => `<p class="small">${oreTag(id)} <b>${fmt(r)} t/h</b>${s.veins[id] ? ` <span class="vein"><i style="width:${pct(s.veins[id].left)}"></i></span> <span class="muted">${s.veins[id].left > 0 ? pct(s.veins[id].left) + ' left' : 'scraps'}</span>` : ''}</p>`).join('') : '<p class="small muted">Nothing coming up right now.</p>'}
        ${s.blocked.length ? `<p class="small muted">Too hard for your drills: ${s.blocked.map((id) => oreTag(id, 12)).join(', ')}.</p>` : ''}</div>
      <p class="small">Ore yard ${fmt(s.stockTot)} / ${fmt(s.store)} t</p><div class="bar ${fill > 0.95 ? 'hot' : ''}"><i style="width:${pct(Math.min(1, fill))}"></i></div>
      ${shiftHtml(s)}
      <div class="btnrow"><button class="buy ${blastIn > 0 ? 'ghost' : 'danger'}" data-blast="${s.id}" ${blastIn > 0 || s.halted || s.decision ? 'disabled' : ''}><span class="bl">Blast</span><span class="bc">${blastIn > 0 ? live$(s.blastReady) : '💥'}</span></button><span class="small muted">A burst of ore now. Sometimes the ceiling comes with it.</span></div>
      ${crewHtml(s)}
      <h5>Parts</h5>${partsHtml(s)}
      <h5>Focus</h5><select data-focus="${s.id}"><option value="">Everything it finds</option>${s.found.map((id) => `<option value="${id}" ${s.focus === id ? 'selected' : ''}>${esc(ore(id).name)}</option>`).join('')}</select>
      <h5>Selling at the gate</h5>
      <div class="chips"><button class="chip" data-gate="${s.id}" aria-pressed="${!!s.gate?.on}">${s.gate?.on ? 'Open to other guilds' : 'Closed'}</button></div>
      <label class="f small">Ask ${pct(s.gate?.pct || G.gate.pct)} of the galactic price <input type="range" min="${G.gate.min}" max="${G.gate.max}" step="0.01" value="${s.gate?.pct || G.gate.pct}" data-gatepct="${s.id}"></label>
      <h5>Shipping</h5>
      ${routes.map((r) => `<button class="row slim" data-route="${r.id}"><span><span class="t">→ ${esc(r.to?.name || '?')}</span><span class="d">${r.ok ? `${fmt(r.tph)} t/h · ${r.ships} ship${r.ships === 1 ? '' : 's'}` : `<span class="bad">${esc(r.issue)}</span>`}</span></span><span class="go">›</span></button>`).join('')}
      <div class="btnrow"><button class="buy sm" data-dest="${s.id}"><span class="bl">Ship ore to…</span><span class="bc">⇢</span></button></div>
      ${abandon}`;
  }
  if (s.kind === 'refinery') {
    const fill = s.store ? s.inputTot / s.store : 0;
    const into = V.routes.filter((r) => r.to?.kind === 'site' && r.to.id === s.id);
    const ex = V.sites.find((x) => x.kind === 'exchange' && x.level >= 1);
    return `${head}${decHtml}
      <div class="facts"><span>Pads take <b>${fmt(s.intake)}</b> t/h</span><span>Belts feed <b>${fmt(s.feed)}</b></span><span>Vats refine <b>${fmt(s.vats)}</b></span><span>Yield <b>${pct(s.yield)}</b></span></div>
      <p class="small">Ships bring <b>${fmt(s.inflow)}</b> t/h. Refined goods go ${ex ? 'up to your exchange' : `to the Guild exchange at ${pct(G.guildExchange)} of the galactic price`}.</p>
      <p class="small">Silos ${fmt(s.inputTot)} / ${fmt(s.store)} t</p><div class="bar ${fill > 0.95 ? 'hot' : ''}"><i style="width:${pct(Math.min(1, fill))}"></i></div>
      ${shiftHtml(s)}${crewHtml(s)}
      <h5>Parts</h5>${partsHtml(s)}
      <h5>Buying ore from other guilds</h5>
      <div class="chips"><button class="chip" data-buyon="${s.id}" aria-pressed="${!!s.buy?.on}">${s.buy?.on ? 'Open to other guilds' : 'Closed'}</button></div>
      <label class="f small">Offer ${pct(s.buy?.pct || G.refinery.buyPct)} of the galactic price <input type="range" min="${G.refinery.buyMin}" max="${G.refinery.buyMax}" step="0.01" value="${s.buy?.pct || G.refinery.buyPct}" data-buypct="${s.id}"></label>
      <h5>Supplied by</h5>${into.map((r) => `<button class="row slim" data-route="${r.id}"><span><span class="t">${esc(r.from?.name)}</span><span class="d">${fmt(r.tph)} t/h</span></span><span class="go">›</span></button>`).join('') || '<p class="small muted">Nothing ships here yet.</p>'}
      <div class="btnrow"><button class="buy sm" data-source="${s.id}"><span class="bl">Bring ore from…</span><span class="bc">⇠</span></button></div>
      ${abandon}`;
  }
  if (s.kind === 'hub') {
    const L = V.labor;
    const ledger = S.guild.ledger;
    const inc = Object.values(ledger.in).reduce((a, b) => a + b, 0), out = Object.values(ledger.out).reduce((a, b) => a + b, 0);
    return `${head}
      <h5>Labor office</h5>
      <p class="small"><b>${esc(L.company.name)}</b> <span class="muted">· ${esc(L.company.tagline || '')}</span></p>
      <div class="facts"><span>At work <b>${L.crew}</b></span><span>Spares <b>${L.pool}/${L.cap}</b></span><span>Wages <b>${perH(V.wagesH)}</b></span><span>Memorial wall <b>${L.dead}</b></span></div>
      ${L.inbound.length ? L.inbound.map((x) => `<p class="small">Shuttle with ${x.n} ${esc(worker())} lands in ${live$(x.doneAt)}</p>`).join('') : ''}
      <div class="btnrow wrap">${[5, 10].map((n) => `<button class="buy sm" data-hire="${n}"><span class="bl">Ship in ${n}</span><span class="bc">${fmt(n * L.price)}</span></button>`).join('')}<button class="buy sm ghost" data-hire="${Math.floor(L.shuttle)}"><span class="bl">Full shuttle (${Math.floor(L.shuttle)})</span><span class="bc">${fmt(Math.floor(L.shuttle) * L.price)}</span></button></div>
      <div class="chips"><button class="chip" data-autolabor="1" aria-pressed="${!!L.auto}">${L.auto ? 'Auto-replace the dead: on' : 'Auto-replace: off'}</button></div>
      <p class="small">Keep <b>${L.reserve}</b> spares at the hub</p><input type="range" min="0" max="60" step="1" value="${L.reserve}" data-reserve="1">
      <h5>When you are away</h5>
      <p class="small">Cave-ins: <button class="chip" data-policy="incident" data-v="rescue" aria-pressed="${V.policy.incident === 'rescue'}">Rescue</button> <button class="chip" data-policy="incident" data-v="seal" aria-pressed="${V.policy.incident === 'seal'}">Seal it</button></p>
      <p class="small">Strikes: <button class="chip" data-policy="strike" data-v="bonus" aria-pressed="${V.policy.strike === 'bonus'}">Pay the bonus</button> <button class="chip" data-policy="strike" data-v="wait" aria-pressed="${V.policy.strike === 'wait'}">Wait them out</button></p>
      <h5>Parts</h5>${partsHtml(s)}
      <h5>Analytics</h5>
      <p class="small">This month: earned ${coinTxt(inc)}, spent ${coinTxt(out)}.</p>
      ${S.history && S.history.me && S.history.me.length > 1 ? `<div class="chart">${sparkline(S.history.me.map((p) => [p[0], p[1]]), 340, 60)}<small class="muted">coin, hourly</small></div>` : ''}
      <div class="ledger small">${Object.entries(ledger.in).filter(([, v]) => v > 0.5).map(([k, v]) => `<span>+${fmt(v)} ${LEDGER_IN[k]}</span>`).join('')}${Object.entries(ledger.out).filter(([, v]) => v > 0.5).map(([k, v]) => `<span class="neg">−${fmt(v)} ${LEDGER_OUT[k]}</span>`).join('')}</div>`;
  }
  if (s.kind === 'lab') {
    const B = BRANCHES[s.branch];
    return `${head}<p class="small">This lab studies <b style="color:${B.color}">${B.label}</b>: ${esc(B.text)}</p>
      <div class="facts"><span>Research <b>+${(s.rpH || 0).toFixed(1)}</b> RP/h</span></div>${crewHtml(s)}
      <h5>Parts</h5>${partsHtml(s)}
      <div class="btnrow"><button class="buy sm ghost" data-act="tree"><span class="bl">Open the research tree</span><span class="bc">⚗</span></button></div>${abandon}`;
  }
  if (s.kind === 'air') return `${head}<p class="small">Ships refuel here on long routes, it counts as a hub when founding operations nearby, and its hangars hold ${s.hangarAdd} more ships.</p>${crewHtml(s)}<h5>Parts</h5>${partsHtml(s)}${abandon}`;
  if (s.kind === 'exchange') {
    const stock = s.stock || {};
    const raw = S.guild.sites.find((x) => x.kind === 'exchange') || {};
    return `${head}<div class="facts"><span>Storage <b>${fmt(Object.values(stock).reduce((a, b) => a + b, 0))}/${fmt(s.store)}</b></span><span>Spot pays <b>${pct(s.spot)}</b></span><span>A buyer calls every <b>~${s.every.toFixed(1)}h</b></span></div>${crewHtml(s)}
      ${Object.keys(V.prices).filter((id) => stock[id] > 0.5 || (S.guild.rate || {})[id] > 0.01).map((id) => `<div class="row"><span><span class="t">${oreTag(id)}</span><span class="d">${fmt(stock[id] || 0)} in stock · arriving ${fmt((S.guild.rate || {})[id] || 0)}/h</span></span><button class="chip" data-spot="${id}" aria-pressed="${raw.spot?.[id] !== false}">${raw.spot?.[id] !== false ? 'Selling spot' : 'Holding'}</button></div>`).join('')}
      <h5>Parts</h5>${partsHtml(s)}
      <div class="btnrow"><button class="buy sm ghost" data-tab="market"><span class="bl">Buyers and contracts</span><span class="bc">📡</span></button></div>`;
  }
  return head;
}
const LEDGER_IN = { npc: 'contractor sales', guild: 'Guild exchange', spot: 'spot market', contract: 'contracts', players: 'sold to guilds', freight: 'freight jobs', gate: 'gate sales' };
const LEDGER_OUT = { build: 'founding', parts: 'parts', upkeep: 'running costs', wages: 'wages', workers: 'shipping in workers', ships: 'ships', survey: 'surveys', incidents: 'rescues', penalties: 'penalties', ore: 'ore bought' };

function peekPanel() {
  const p = S.peek;
  if (!p) return '<p class="small muted">Looking…</p>';
  const s = p.site;
  return `<h2>${esc(s.name)}</h2><p class="small muted">${KIND_LABEL[s.kind]} of ${p.guild.species ? speciesIcon(p.guild.species, 16) : ''} <b>${esc(p.guild.name)}</b> · ${esc(s.region || '')}</p>
    <p class="small">You are watching from the fence. Nobody waves.</p>
    <div class="facts">${s.need ? `<span>Crew <b>${s.crew}</b></span>` : ''}${s.kind === 'mine' ? `<span>Digs about <b>${fmt(s.dig)}</b> t/h</span>` : ''}${s.kind === 'refinery' ? `<span>Refines up to <b>${fmt(s.vats)}</b> t/h</span>` : ''}<span>Shift <b>${esc(G.shifts[s.shift]?.label || 'Normal')}</b></span></div>
    <h5>What they have built</h5>${s.parts.map((x) => `<p class="small">${esc(x.label)} <span class="pips">${'▮'.repeat(x.level)}</span></p>`).join('')}`;
}

/* ---------------------------------------------------------------- decisions (accidents and strikes) */

function decisionHtml(d) {
  const s = S.view.sites.find((x) => x.id === d.siteId) || { name: '?' };
  const txt = (S.guild.log.slice().reverse().find((l) => l.data && l.data.decision === d.id) || {}).text || '';
  if (d.kind === 'cavein') return `<div class="decision"><b>${esc(s.name)}: ${d.n} ${esc(worker())} trapped</b><p class="small">${esc(txt)}</p>
    <div class="btnrow"><button class="buy sm" data-decide="${d.id}" data-c="rescue" ${S.guild.coin < d.cost ? 'disabled' : ''}><span class="bl">Rescue</span><span class="bc">${fmt(d.cost)}</span></button><button class="buy sm danger" data-decide="${d.id}" data-c="seal"><span class="bl">Seal it</span><span class="bc">−${d.n}</span></button></div>
    <p class="small muted">If you do nothing, your standing order (${S.view.policy.incident === 'rescue' ? 'rescue' : 'seal'}) decides in ${live$(d.expires)}.</p></div>`;
  return `<div class="decision"><b>${esc(s.name)}: strike!</b><p class="small">${esc(txt)}</p>
    <div class="btnrow"><button class="buy sm" data-decide="${d.id}" data-c="bonus" ${S.guild.coin < d.cost ? 'disabled' : ''}><span class="bl">Pay a bonus</span><span class="bc">${fmt(d.cost)}</span></button><button class="buy sm ghost" data-decide="${d.id}" data-c="wait"><span class="bl">Wait them out</span><span class="bc">4h</span></button></div>
    <p class="small muted">Standing order decides in ${live$(d.expires)}.</p></div>`;
}

/* ---------------------------------------------------------------- the map card */

function closeCard() { S.sel = null; $('#card').hidden = true; }
function renderCard() {
  const el = $('#card');
  if (!S.sel || S.inside) { el.hidden = true; return; }
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
    ${items.length ? items.map((o) => `<p class="small">${oreTag(o.id)} ${o.trace ? '<span class="muted">maybe traces</span>' : `<b>${word(o.est)}</b> <span class="muted">${pct(o.lo)}–${pct(o.hi)}</span>`}${o.reserve ? ` · ~${fmt(o.reserve)} t` : ''}${o.hardness > S.view.drill ? ` <span class="muted">(hardness ${o.hardness})</span>` : ''}</p>`).join('') : '<p class="small muted">No rare ore detected.</p>'}</div>`;
}
function buildButtons(x, y) {
  const w = { planet: S.world.planet, sites: S.world.sites };
  const why = canBuildAt(S.guild, w, 'mine', x, y);
  if (why) return `<p class="small muted">${esc(why)}</p>`;
  const q0 = foundQuote(S.guild, 'mine', x, y);
  return `<div class="btnrow wrap">${['mine', 'refinery', 'air', 'lab'].map((k) => { const q = foundQuote(S.guild, k, x, y); return `<button class="buy sm" data-build="${k}" data-x="${x}" data-y="${y}" ${S.guild.coin < q.cost ? 'disabled' : ''}><span class="bl">${KIND_LABEL[k]}</span><span class="bc">${fmt(q.cost)}</span></button>`; }).join('')}</div>
    <p class="small muted">${Math.round(q0.d)} units from your nearest hub${q0.mult > 1.01 ? ` (×${q0.mult.toFixed(2)} cost)` : ''} · crews arrive in ${dur(q0.hours * H)}.</p>`;
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
    const br = BRANCHES[branchOf(info.terrain)];
    return `<h4>${esc(info.region || 'Unnamed land')} <small>${esc(info.terrain || '')} · ${esc(info.climate || '')}</small></h4>
      <p class="small muted">${esc(info.blurb || '')} A lab here would study <span style="color:${br.color}">${br.label}</span>.</p>
      ${sv ? reportHtml(sv) : flying ? `<p class="small">Drone on the way · back in ${live$(flying.doneAt)}</p>` : '<p class="small">Unsurveyed. Could be anything. Mostly it is dirt.</p>'}
      <div class="btnrow"><button class="buy sm ghost" data-survey="1" data-x="${x}" data-y="${y}" ${V.flying >= V.drones || me.coin < q.cost ? 'disabled' : ''}><span class="bl">${sv ? 'Survey again' : 'Send a drone'}</span><span class="bc">${fmt(q.cost)} · ${dur(q.hours * H)}</span></button></div>
      <h5>Found here</h5>${buildButtons(x, y)}`;
  }
  if (sel.type === 'site') {
    const s = V.sites.find((x) => x.id === sel.id);
    if (!s) return '';
    const quick = s.kind === 'mine' && s.level >= 1 ? `<button class="buy sm ghost" data-dest="${s.id}"><span class="bl">Ship ore to…</span><span class="bc">⇢</span></button>` : s.kind === 'refinery' && s.level >= 1 ? `<button class="buy sm ghost" data-source="${s.id}"><span class="bl">Bring ore from…</span><span class="bc">⇠</span></button>` : '';
    const dec = s.decision ? V.decisions.find((d) => d.id === s.decision) : null;
    return `<h4>${esc(s.name)} <small>${KIND_LABEL[s.kind]}</small></h4><p class="small">${siteLine(s)}</p>${dec ? decisionHtml(dec) : ''}
      <div class="btnrow"><button class="buy" data-enter="${s.id}"><span class="bl">Step inside</span><span class="bc">⤵</span></button>${quick}</div>`;
  }
  if (sel.type === 'npc') {
    const n = S.world.npc.find((x) => x.id === sel.id);
    if (!n) return '';
    const pr = V.npcPrices[n.id] || {};
    return `<h4>${esc(n.name)} <small>Guild contractor</small></h4><p class="small muted">${esc(n.blurb)}</p>
      <p class="small">Pays for raw ore, per tonne:</p>
      <div class="prices">${Object.keys(pr).sort((a, b) => pr[b] - pr[a]).map((id) => `<p class="small">${oreTag(id, 12)} <b class="gold">${pr[id] >= 10 ? Math.round(pr[id]) : pr[id].toFixed(1)}</b></p>`).join('')}</div>
      <div class="btnrow"><button class="buy sm" data-source="npc:${n.id}"><span class="bl">Ship ore here from…</span><span class="bc">⇠</span></button></div>`;
  }
  if (sel.type === 'camp') {
    const c = (S.world.camps || []).find((x) => x.id === sel.id);
    if (!c) return '';
    return `<h4>${esc(c.name)} <small>Prospector camp</small></h4><p class="small muted">${esc(c.blurb)}</p>
      <p class="small">Sells about ${c.rate} t/h at the gate, per tonne:</p>
      <div class="prices">${Object.entries(c.mix).sort((a, b) => b[1] - a[1]).map(([id, f]) => `<p class="small">${oreTag(id, 12)} <b class="gold">${fmt(c.pct * (V.prices[id]?.p || 0))}</b> <span class="muted">${pct(f)}</span></p>`).join('')}</div>
      <div class="btnrow"><button class="buy sm" data-destfrom='${esc(JSON.stringify({ kind: 'camp', id: c.id }))}'><span class="bl">Buy here, deliver to…</span><span class="bc">⇢</span></button></div>`;
  }
  if (sel.type === 'gate') {
    const d = (S.world.gates || []).find((x) => x.uid === sel.uid && x.siteId === sel.id);
    if (!d) return '';
    return `<h4>${esc(d.name)} <small>${esc(d.guild)}</small></h4>
      <p class="small">Selling at the gate: ${pct(d.pct)} of the galactic price, about ${fmt(d.rate)} t/h spare.</p>
      <div class="prices">${Object.entries(d.mix || {}).sort((a, b) => b[1] - a[1]).map(([id, f]) => `<p class="small">${oreTag(id, 12)} <b class="gold">${fmt(d.pct * (V.prices[id]?.p || 0))}</b> <span class="muted">${pct(f)}</span></p>`).join('')}</div>
      <div class="btnrow wrap"><button class="buy sm" data-destfrom='${esc(JSON.stringify({ kind: 'gate', id: d.siteId, uid: d.uid }))}'><span class="bl">Buy here, deliver to…</span><span class="bc">⇢</span></button><button class="buy sm ghost" data-peek="${d.uid}" data-site="${d.siteId}"><span class="bl">Look inside</span><span class="bc">👁</span></button></div>`;
  }
  if (sel.type === 'rival') {
    const d = (S.world.directory || []).find((x) => x.uid === sel.uid && x.siteId === sel.id);
    const look = `<button class="buy sm ghost" data-peek="${sel.uid}" data-site="${sel.id}"><span class="bl">Look inside</span><span class="bc">👁</span></button>`;
    if (!d) return `<h4>A rival refinery</h4><p class="small">Not buying right now.</p><div class="btnrow">${look}</div>`;
    return `<h4>${esc(d.name)} <small>${esc(d.guild)}</small></h4>
      ${d.on ? `<p class="small">Buying raw ore at <b>${pct(d.pct)}</b> of the galactic price, room for about ${fmt(d.room)} t/h.</p>
      <div class="prices">${Object.keys(V.prices).map((id) => `<p class="small">${oreTag(id, 12)} <b class="gold">${fmt(d.pct * V.prices[id].p)}</b></p>`).join('')}</div>` : '<p class="small">Closed to outside ore right now.</p>'}
      <div class="btnrow wrap">${d.on ? `<button class="buy sm" data-source="rival:${d.uid}:${d.siteId}"><span class="bl">Ship ore here from…</span><span class="bc">⇠</span></button>` : ''}${look}</div>`;
  }
  if (sel.type === 'rivalsite') {
    const o = (S.world.sites || []).find((x) => x.uid === sel.uid && x.id === sel.id);
    return o ? `<h4>${esc(o.name)} <small>${esc(o.guild)}</small></h4><p class="small">${KIND_LABEL[o.kind]} of ${esc(o.player || o.guild)}.</p><div class="btnrow"><button class="buy sm ghost" data-peek="${o.uid}" data-site="${o.id}"><span class="bl">Look inside</span><span class="bc">👁</span></button></div>` : '';
  }
  if (sel.type === 'route') {
    const r = V.routes.find((x) => x.id === sel.id);
    if (!r) return '';
    const raw = me.routes.find((x) => x.id === r.id);
    const ships = me.ships.filter((x) => x.routeId === r.id);
    const idle = me.ships.filter((x) => !x.routeId);
    const src = r.from?.kind === 'site' ? V.sites.find((x) => x.id === r.from.id) : null;
    const job = r.job ? V.jobs.find((j) => j.id === r.job) : null;
    return `<h4>${esc(r.from?.name)} → ${esc(r.to?.name)} <small>${job ? 'freight job' : 'route'}</small></h4>
      ${r.ok ? `<p class="small"><b>${fmt(r.tph)} t/h</b> · ${r.cycleH.toFixed(1)}h round trip · ${Math.round(r.path.length)} units${r.path.stops ? ` · refuels ${r.path.stops}×` : ''}</p>` : `<p class="small bad">${esc(r.issue)}</p>`}
      ${job ? `<p class="small">${fmt(job.delivered)}/${fmt(job.qty)} t ${oreTag(job.oreId, 12)} at ${job.rate}/t · due ${live$(job.due)}</p>` : ''}
      ${src ? `<p class="small muted">${esc(src.name)} digs ${fmt(src.tph)} t/h; all its routes take ${fmt(src.shipping)}.</p>` : ''}
      ${!job ? `<h5>Cargo</h5><select data-cargo="${r.id}"><option value="all">Everything there is</option>${S.world.planet.ores.map((o) => `<option value="${o.id}" ${raw.cargo === o.id ? 'selected' : ''}>Only ${esc(o.name)}</option>`).join('')}</select>` : ''}
      <h5>Ships (${ships.length})</h5>
      ${ships.map((s) => `<p class="small">${esc(s.name)} <small class="muted">${G.ships[s.cls].label}</small> <button class="linkish" data-follow="${s.id}">follow</button> · <button class="linkish" data-unassign="${s.id}">take off route</button></p>`).join('')}
      <div class="btnrow wrap">${idle.length ? `<button class="buy sm" data-assignidle="${r.id}"><span class="bl">Add idle ship</span><span class="bc">${idle.length}</span></button>` : ''}
        ${Object.entries(G.ships).filter(([, b]) => !b.tech || me.tree[b.tech]).map(([cls, b]) => `<button class="buy sm ghost" data-buyship="${cls}" data-route="${r.id}" ${me.ships.length >= V.hangar || me.coin < V.shipCosts[cls] ? 'disabled' : ''}><span class="bl">+ ${b.label}</span><span class="bc">${fmt(V.shipCosts[cls])}</span></button>`).join('')}</div>
      <p class="small"><button class="linkish" data-delroute="${r.id}">Cancel route</button></p>`;
  }
  if (sel.type === 'ship') {
    const sh = me.ships.find((s) => s.id === sel.id);
    if (!sh) return '';
    const r = V.routes.find((x) => x.id === sh.routeId);
    const at = S.followAt && S.follow === sh.id ? spotInfo(S.world.planet, S.followAt.x, S.followAt.y) : null;
    const cargoCol = r ? S.routeCargoColor(r) : null;
    return `<h4>${esc(sh.name)} <small>${G.ships[sh.cls].label}</small></h4>
      ${r ? `<p class="small">${esc(r.from?.name)} → ${esc(r.to?.name)} · ${r.cycleH.toFixed(1)}h round trip</p>` : '<p class="small muted">Idle.</p>'}
      ${at ? `<p class="small">Flying over <b>${esc(at.water ? 'open water' : at.region || 'somewhere')}</b> <span class="muted">(${esc(at.water ? 'sea' : at.terrain || '')})</span> · ${S.followAt.out ? `loaded <i class="sw" style="background:${cargoCol}"></i>` : 'heading back empty'}</p>` : ''}
      <div class="btnrow"><button class="buy sm ${S.follow === sh.id ? 'ghost' : ''}" data-follow="${sh.id}"><span class="bl">${S.follow === sh.id ? 'Stop following' : 'Follow'}</span><span class="bc">🎥</span></button></div>`;
  }
  return '';
}

/* ---------------------------------------------------------------- calls: accidents, strikes, buyers */

function renderCalls() {
  const box = $('#calls');
  if ($('#talk')) { box.innerHTML = ''; return; }
  const dec = (S.view?.decisions || [])[0];
  if (dec && !(S.inside && S.insideSite()?.id === dec.siteId)) { box.innerHTML = `<div class="call bad">${decisionHtml(dec)}</div>`; return; }
  const offers = S.view?.offers || [];
  if (!offers.length) { box.innerHTML = ''; return; }
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
    const spot = (o2.market || 0) * (S.view.exchangeStats?.spot || G.exchange.spot);
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
    e.stopPropagation();
    const close = () => { ov.remove(); render(); };
    if (e.target === ov || e.target.closest('[data-x]')) return close();
    if (e.target.closest('[data-sign]')) { await cmd({ type: 'offer', offerId: id, action: 'accept' }, 'Contract signed.'); return close(); }
    if (e.target.closest('[data-no]')) { await cmd({ type: 'offer', offerId: id, action: 'decline' }); return close(); }
    if (e.target.closest('[data-ask]')) {
      const r = await cmd({ type: 'offer', offerId: id, action: 'counter', price: Number(ov.querySelector('#ask').value) });
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
  sheet(`<h2>Chronicle</h2><p class="lede small">Everything that happened to your guild, newest first.</p>
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
  const ov = sheet(`<h2>☢ Nuke the operation</h2><p>Every operation, ship, ${esc(worker())} and coin goes up in one glorious mushroom. You earn <b>${S.view.spectacleNow.toFixed(1)} Spectacle</b> and an audience with the Maker, who can bend the galactic market for everyone.</p>
    <p class="small">You keep your survey reports, your buyer contacts and your SP.</p>
    <label class="f">Type NUKE <input id="nk" autocomplete="off"></label><div class="btnrow"><button class="buy danger" id="nkGo"><span class="bc">Detonate</span></button></div>`);
  ov.querySelector('#nkGo').onclick = async () => {
    const r = await cmd({ type: 'nuke', confirm: ov.querySelector('#nk').value.trim().toUpperCase() });
    if (r && !r.error) { ov.remove(); exitInside(); sfx.boom(); shake(document.body); banner('Spectacle!', 'The Maker would like a word.', 'nuke'); setTimeout(openMaker, 2600); }
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
      try { const r = await api('POST', '/api/v3/maker', { action: 'argue', ask: { kind, oreId: q('#mkOre').value, direction }, reason: q('#mkWhy').value }); sfx.maker(); drawM(r.body.session); } catch (e) { toast(esc(e.message), 'bad'); }
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
      <p class="small muted">Labor provided by ${esc(st.world.labor?.name || 'the lowest bidder')}. ${esc(st.world.labor?.tagline || '')}</p>
      <label class="f">Name your guild <input id="gName" maxlength="28" value="${esc(S.me.name)}'s Extraction Guild" required></label>
      <label class="f">Describe your species (optional) <input id="gDesc" maxlength="200" placeholder="e.g. bureaucratic moth people with briefcases"></label>
      <div class="chips" id="gCols">${SPECIES_COLORS.map((c) => `<button type="button" class="chip" data-col="${c}" aria-pressed="${c === species.color}"><i style="background:${c}"></i></button>`).join('')}</div>
      <div class="btnrow"><button class="buy big" type="submit"><span class="bc">Land</span></button></div>
      <p class="err" id="gErr" hidden></p></form>`;
    ov.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('[data-col]'); if (!b) return; species.color = b.dataset.col; ov.querySelectorAll('[data-col]').forEach((x) => x.setAttribute('aria-pressed', x === b)); });
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

/* ---------------------------------------------------------------- zooming in and out */

function enterInside(id, uid) {
  S.inside = { id, uid: uid || null };
  S.sel = null; S.follow = null; setMode(null);
  $('#map').hidden = true; $('#inside').hidden = false; $('#zoomBox').hidden = true;
  $('#insideBar').hidden = false;
  if (uid) { S.peek = null; loadPeek(); }
  inside.start();
  sfx.tap();
  render();
}
function exitInside() {
  if (!S.inside) return;
  const s = S.insideSite();
  S.inside = null; S.peek = null;
  inside.stop();
  $('#map').hidden = false; $('#inside').hidden = true; $('#zoomBox').hidden = false; $('#insideBar').hidden = true;
  if (s) map.focus(s.x, s.y, Math.max(map.view.tz, 2.4));
  render();
}
async function loadPeek() {
  try { S.peek = (await api('GET', `/api/v3/peek?uid=${encodeURIComponent(S.inside.uid)}&site=${encodeURIComponent(S.inside.id)}`)).body; render(); }
  catch (e) { toast(esc(e.message), 'bad'); exitInside(); }
}
function renderInsideBar() {
  const el = $('#insideBar');
  if (!S.inside) return;
  const s = S.insideSite();
  el.innerHTML = `<button class="buy sm ghost" data-act="exit"><span class="bc">← Map</span></button><b>${esc(s?.name || '')}</b>${s && s.halted ? ` <span class="bad">stopped · ${live$(s.halted)}</span>` : ''}${S.inside.uid ? ' <span class="muted">(watching)</span>' : ''}`;
}

/* ---------------------------------------------------------------- map clicks and modes */

function onMapClick(hit) {
  sfx.tap();
  if (S.mode) {
    const m = S.mode;
    setMode(null);
    if (m.kind === 'dest') {
      let to = null;
      if (hit.type === 'npc') to = { kind: 'npc', id: hit.id };
      else if (hit.type === 'site' && S.view.sites.find((s) => s.id === hit.id)?.kind === 'refinery') to = { kind: 'site', id: hit.id };
      else if (hit.type === 'rival') to = { kind: 'rival', id: hit.id, uid: hit.uid };
      if (to) return makeRoute(m.from, to);
      return toast('Ships deliver to refineries: a contractor, one of yours, or a guild that is buying.', 'warn');
    }
    if (m.kind === 'source') {
      let from = null;
      if (hit.type === 'site' && S.view.sites.find((s) => s.id === hit.id)?.kind === 'mine') from = { kind: 'site', id: hit.id };
      else if (hit.type === 'camp') from = { kind: 'camp', id: hit.id };
      else if (hit.type === 'gate') from = { kind: 'gate', id: hit.id, uid: hit.uid };
      if (from) return makeRoute(from, m.to);
      return toast('Ships pick up at your mines, prospector camps, or another guild\'s gate.', 'warn');
    }
  }
  if (hit.type === 'exchange') return enterInside('exchange');
  S.sel = hit;
  S.follow = hit.type === 'ship' ? hit.id : null;
  renderCard();
}
function onUnfollow() { if (S.sel && S.sel.type === 'ship') renderCard(); }

async function makeRoute(from, to, extra = {}) {
  const idle = S.guild.ships.find((s) => !s.routeId);
  const r = await cmd({ type: 'route', from, to, shipId: idle ? idle.id : undefined, ...extra }, idle ? `${esc(idle.name)} is on its way.` : 'Route set. Put a ship on it.');
  if (r && !r.error) {
    const rt = S.guild.routes[S.guild.routes.length - 1];
    if (S.inside) exitInside();
    S.sel = { type: 'route', id: rt.id };
    sfx.launch();
    renderCard();
  }
}
function setMode(m) {
  S.mode = m;
  const el = $('#mode');
  if (!m) { el.hidden = true; return; }
  if (S.inside) exitInside();
  el.hidden = false;
  el.innerHTML = (m.kind === 'dest' ? 'Where should ships take it? Click a refinery on the map.' : 'Where should ships pick up? Click one of your mines, a prospector camp, or a guild\'s gate ($).') + ' <button class="linkish" data-act="cancelMode">Cancel</button>';
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-enter], [data-route], [data-tab], [data-node]');
  if (!t || t.closest('#talk')) return;
  const d = t.dataset;
  if (d.tab) { if (S.inside) exitInside(); S.tab = d.tab; store('g_tab', S.tab); render(); return; }
  if (d.enter) return enterInside(d.enter);
  if (d.act === 'exit') return exitInside();
  if (d.peek) return enterInside(d.site, d.peek);
  if (d.route && !d.buyship) { const r = S.view.routes.find((x) => x.id === d.route); if (S.inside) exitInside(); S.sel = { type: 'route', id: d.route }; if (r?.path) { const m = r.path.pts[Math.floor(r.path.pts.length / 2)]; map.focus(m.x, m.y); } renderCard(); return; }
  if (d.act === 'closeCard') { S.follow = null; return closeCard(); }
  if (d.act === 'cancelMode') return setMode(null);
  if (d.act === 'buildExchange') return cmd({ type: 'buildExchange' }, 'Exchange being assembled in orbit.');
  if (d.act === 'nuke') return openNuke();
  if (d.act === 'maker') return openMaker();
  if (d.act === 'tree') { exitInside(); S.tab = 'lab'; render(); return; }
  if (d.build) { const r = await cmd({ type: 'build', kind: d.build, x: +d.x, y: +d.y }); if (r && !r.error) { const s = S.view.sites[S.view.sites.length - 1]; S.sel = { type: 'site', id: s.id }; renderCard(); } return; }
  if (d.survey) return cmd({ type: 'survey', x: +d.x, y: +d.y }, 'Drone away.');
  if (d.part) { const r = await cmd({ type: 'part', siteId: d.site, part: d.part }); if (r && !r.error) { sfx.big(); onPart(d.part); } return; }
  if (d.shift) return cmd({ type: 'setShift', siteId: d.site, shift: d.shift });
  if (d.blast) { const r = await cmd({ type: 'blast', siteId: d.blast }); if (r && !r.error) { sfx.boom(); shake($('#stage')); } return; }
  if (d.decide) return cmd({ type: 'decide', decisionId: d.decide, choice: d.c });
  if (d.policy) return cmd({ type: 'setPolicy', [d.policy]: d.v });
  if (d.hire) return cmd({ type: 'hire', n: Number(d.hire) });
  if (d.autolabor) return cmd({ type: 'setLabor', auto: !S.view.labor.auto });
  if (d.crewcap) { const s = S.view.sites.find((x) => x.id === d.crewcap); if (s.crewCap != null) return cmd({ type: 'setCrew', siteId: s.id, max: null }); const n = prompt(`Most crew to send to ${s.name}?`, String(s.need)); if (n != null) cmd({ type: 'setCrew', siteId: s.id, max: Number(n) }); return; }
  if (d.dest) { setMode({ kind: 'dest', from: { kind: 'site', id: d.dest } }); closeCard(); return; }
  if (d.destfrom) { setMode({ kind: 'dest', from: JSON.parse(d.destfrom) }); closeCard(); return; }
  if (d.source) {
    const [k, a, b] = d.source.split(':');
    const to = k === 'npc' ? { kind: 'npc', id: a } : k === 'rival' ? { kind: 'rival', uid: a, id: b } : { kind: 'site', id: d.source };
    setMode({ kind: 'source', to }); closeCard(); return;
  }
  if (d.job) { const j = S.view.jobs.find((x) => x.id === d.job); if (j) return makeRoute({ kind: 'camp', id: j.from }, { kind: 'npc', id: j.to }, { job: j.id }); return; }
  if (d.follow) { S.follow = S.follow === d.follow ? null : d.follow; S.sel = { type: 'ship', id: d.follow }; if (S.follow) map.zoomBy(Math.max(1, 3.2 / map.view.tz)); renderCard(); return; }
  if (d.buyship) return cmd({ type: 'buyShip', cls: d.buyship, routeId: d.route || undefined });
  if (d.assignidle) { const sh = S.guild.ships.find((s) => !s.routeId); if (sh) return cmd({ type: 'assign', shipId: sh.id, routeId: d.assignidle }); return; }
  if (d.unassign) return cmd({ type: 'assign', shipId: d.unassign, routeId: null });
  if (d.delroute) { await cmd({ type: 'deleteRoute', routeId: d.delroute }); closeCard(); return; }
  if (d.demolish) { if (confirm('Abandon it? You get nothing back. The crew walks back to the hub. The hole stays.')) { await cmd({ type: 'demolish', siteId: d.demolish }); exitInside(); closeCard(); } return; }
  if (d.buyon) { const s = S.view.sites.find((x) => x.id === d.buyon); return cmd({ type: 'setRefinery', siteId: d.buyon, on: !s.buy?.on }); }
  if (d.gate) { const s = S.view.sites.find((x) => x.id === d.gate); return cmd({ type: 'setGate', siteId: d.gate, on: !s.gate?.on }); }
  if (d.node) { const N = NODES[d.node]; if (t.getAttribute('aria-disabled') === 'true') return toast(`${esc(N.label)}: ${esc(N.text)}`, 'info'); const r = await cmd({ type: 'unlock', node: d.node }); if (r && !r.error) { sfx.unlock(); banner(N.label, N.text, 'license'); } return; }
  if (d.spot) { const ex = S.guild.sites.find((s) => s.kind === 'exchange'); return cmd({ type: 'setSpot', oreId: d.spot, on: ex.spot?.[d.spot] === false }); }
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
  if (d.gatepct) cmd({ type: 'setGate', siteId: d.gatepct, pct: Number(e.target.value) });
  if (d.reserve) cmd({ type: 'setLabor', reserve: Number(e.target.value) });
});
document.addEventListener('dblclick', (e) => {
  const n = e.target.closest('[data-rename]');
  if (!n) return;
  const name = prompt('Rename', n.textContent);
  if (name) cmd({ type: 'rename', target: 'site', id: n.dataset.rename, name });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (S.mode) setMode(null); else if (S.inside) exitInside(); else closeCard(); } });

/* ---------------------------------------------------------------- render */

function onPart(part) {
  const el = document.getElementById('part-' + part);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: prefs.reduced ? 'auto' : 'smooth' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function render() {
  if (!S.view) return;
  renderHud(); renderTabs(); renderTab(); renderCard(); renderCalls(); renderInsideBar();
}
setInterval(() => {
  for (const el of document.querySelectorAll('[data-until]')) el.textContent = dur(Number(el.dataset.until) - S.now());
  if (S.view) $('#left').textContent = dur(S.world.endsAt - S.now());
  if (S.follow && S.sel?.type === 'ship') renderCard();
}, 1000);

async function loadSide() {
  try { S.board = (await api('GET', '/api/v3/board')).body.month || []; } catch {}
  try { S.bulletin = (await api('GET', '/api/v3/bulletin')).body.changes || []; } catch {}
  try { S.feed = (await api('GET', '/api/v3/feed')).body.docs.map((d) => d.data) || []; } catch {}
  try { S.history = (await api('GET', '/api/v3/history')).body; } catch {}
  render();
}

let map = null, inside = null;
async function boot() {
  applyPrefs();
  net.onAuthLost = () => location.reload();
  S.me = await ensureSignedIn();
  let st = (await api('GET', '/api/v3/state')).body;
  if (!st.guild) { S.world = st.world; S.me = st.me; $('#boot').hidden = true; st = await landing(st); }
  $('#boot').hidden = true; $('#app').hidden = false;
  map = createMap(S, { onMapClick, onUnfollow });
  inside = createInside(S, { onPart });
  window.__guild = { S, map, cmd, refresh, enterInside, exitInside };
  S.lastLogT = Math.max(0, ...(st.guild?.log || []).map((l) => l.t));
  apply(st, { quiet: true });
  const home = S.guild.landing;
  map.view.cx = map.view.tcx = 500; map.view.cy = map.view.tcy = 500; map.view.z = 1;
  map.focus(home.x, home.y, 2.6);
  $('#zoomIn').onclick = () => map.zoomBy(1.4);
  $('#zoomOut').onclick = () => map.zoomBy(0.7);
  $('#zoomHome').onclick = () => { S.follow = null; map.focus(S.guild.landing.x, S.guild.landing.y, 2.6); };
  $('#logBtn').onclick = openChronicle;
  $('#gear').onclick = openSettings;
  $('#rankBtn').onclick = () => { exitInside(); S.tab = 'guild'; render(); };
  requestAnimationFrame(hudLoop);
  loadSide();
  setInterval(() => refresh(), 20_000);
  setInterval(loadSide, 60_000);
  live({
    board3: (m) => { if (m.op === 'set') { const i = S.board.findIndex((b) => b.id === m.id); if (i >= 0) S.board[i] = m.data; else S.board.push(m.data); S.board.sort((a, b) => b.coin - a.coin); renderHud(); } },
    world3: (m) => { if (m.op === 'set' && S.world) Object.assign(S.world, m.data); },
    feed3: (m) => { if (m.op === 'set') { S.feed.unshift(m.data); S.feed = S.feed.slice(0, 60); $('#ticker').innerHTML = `<span class="tk"><time>now</time>${esc(m.data.text)}</span>`; } },
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
boot().catch((e) => { console.error(e); $('#boot').innerHTML = `<p>Could not reach the Maker Guild: ${esc(e.message)}</p>`; });
