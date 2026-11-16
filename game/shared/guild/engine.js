// The guild engine: you are a Guild General running operations on a new planet for one month.
// Pure and deterministic: no I/O, no Math.random, no Date.now. Runs on the server (truth) and in the browser (prediction).
//
// advance() integrates whole minutes on the absolute minute grid, so advancing once for three days or many times in
// small steps gives the same result. Commands apply at the guild's clock (the last whole minute).
import { G } from './tuning.js';
import { HOUR, DAY, clone, clamp, dist, roll, between, num, cleanName, r2 } from './util.js';
import { prices as marketPrices, oreInfo } from './market.js';
import { npcRefineries, npcPrice, groundAt, spotInfo } from './world.js';
import { makeOffer, counter, contractFrom, tell } from './contracts.js';
import { line, siteName } from './text.js';
import { spotOK } from '../planet/index.js';

export const GUILD_VERSION = 1;
const MIN = G.stepMs;
const KINDS = ['mine', 'refinery', 'air', 'lab'];
const ledger0 = () => ({ in: { npc: 0, guild: 0, spot: 0, contract: 0, players: 0 }, out: { build: 0, upkeep: 0, ships: 0, survey: 0, incidents: 0, penalties: 0, ore: 0 } });

/* ---------- small accessors ---------- */

export const dayOf = (world, t) => Math.max(1, Math.floor((t - (world.startedAt ?? t)) / DAY) + 1);
const ores = (world) => oreInfo(world.planet);
const oreById = (world) => Object.fromEntries(ores(world).map((o) => [o.id, o]));
const has = (g, id) => !!(g.tech && g.tech[id]);
const techSum = (g, key) => Object.keys(g.tech || {}).reduce((s, id) => s + num(G.tech[id]?.[key]), 0);
export const evoMult = (g, kind) => 1 + G.evo[kind].per * num(g.evo?.[kind]);
export const drillLevel = (g) => Math.max(G.mine.drill, ...Object.keys(g.tech || {}).map((id) => num(G.tech[id]?.drill)));
const live = (s) => s.level >= 1;
const hubsOf = (g) => g.sites.filter((s) => (s.kind === 'hub' || s.kind === 'air') && live(s));
export const hubSite = (g) => g.sites.find((s) => s.kind === 'hub');
export function claimRadius(g, s) {
  const base = s.kind === 'hub' ? G.hub.radius[s.level] || G.hub.radius[1] : G.air.radius;
  return base * (1 + techSum(g, 'claim'));
}
export function hangar(g) {
  const h = hubSite(g);
  return (G.hub.hangar[h?.level || 1] || 4) + g.sites.filter((s) => s.kind === 'air' && live(s)).length * G.air.hangar;
}
export const crews = (g) => G.hub.crews[hubSite(g)?.level || 1] || 2;
const building = (g) => g.sites.filter((s) => s.build).length + (g.exchange?.build ? 1 : 0);

export function shipStats(g, cls) {
  const b = G.ships[cls];
  return {
    cap: b.cap * (1 + techSum(g, 'hold')),
    speed: b.speed * (1 + techSum(g, 'speed')) * evoMult(g, 'logistics'),
    range: b.range * (1 + techSum(g, 'range')),
  };
}
export function shipCost(g, cls) {
  const owned = g.ships.filter((s) => s.cls === cls).length;
  return Math.round(G.ships[cls].cost * Math.pow(G.shipGrowth, owned));
}

/* ---------- places: where routes start and end ---------- */

export function placeOf(g, world, to) {
  if (!to) return null;
  if (to.kind === 'npc') {
    const n = npcRefineries(world.planet).find((x) => x.id === to.id);
    return n ? { kind: 'npc', id: n.id, x: n.x, y: n.y, name: n.name, npc: n } : null;
  }
  if (to.kind === 'site') {
    const s = g.sites.find((x) => x.id === to.id);
    return s ? { kind: 'site', id: s.id, x: s.x, y: s.y, name: s.name, site: s } : null;
  }
  if (to.kind === 'rival') {
    const d = (world.directory || []).find((x) => x.uid === to.uid && x.siteId === to.id);
    return d ? { kind: 'rival', id: d.siteId, uid: d.uid, x: d.x, y: d.y, name: `${d.name} (${d.guild})`, dir: d } : null;
  }
  return null;
}

// Shortest flight from a to b hopping through your hubs and air stations, legs no longer than `range`.
export function flightPath(g, a, b, range) {
  const nodes = [a, ...hubsOf(g).map((s) => ({ x: s.x, y: s.y, id: s.id })), b];
  const n = nodes.length, D = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  D[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || D[i] < D[u])) u = i;
    if (u < 0 || D[u] === Infinity) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const d = dist(nodes[u], nodes[v]);
      if (d <= range + 1e-6 && D[u] + d < D[v]) { D[v] = D[u] + d; prev[v] = u; }
    }
  }
  if (D[n - 1] === Infinity) return null;
  const pts = [];
  for (let v = n - 1; v >= 0; v = prev[v]) { pts.unshift({ x: nodes[v].x, y: nodes[v].y }); if (v === 0) break; }
  return { length: D[n - 1], stops: Math.max(0, pts.length - 2), pts };
}

// Throughput of one route: tonnes/hr it can move, per ship class, and the flight it takes.
export function routeInfo(g, world, r) {
  const from = g.sites.find((s) => s.id === r.from);
  const to = placeOf(g, world, r.to);
  const out = { id: r.id, ok: false, tph: 0, ships: 0, issue: '', path: null, cycleH: 0, from, to, byShip: [] };
  if (!from) { out.issue = 'Source is gone'; return out; }
  if (!to) { out.issue = 'Destination is gone'; return out; }
  const ships = g.ships.filter((s) => s.routeId === r.id);
  out.ships = ships.length;
  for (const sh of ships) {
    const st = shipStats(g, sh.cls);
    const path = flightPath(g, from, to, st.range);
    if (!path) { out.byShip.push({ id: sh.id, tph: 0, issue: 'out of range' }); continue; }
    const cycle = (2 * path.length) / st.speed + G.dockHours + 2 * path.stops * G.refuelHours;
    out.path = out.path || path;
    out.cycleH = out.cycleH || cycle;
    const tph = st.cap / cycle;
    out.tph += tph;
    out.byShip.push({ id: sh.id, tph, cycle });
  }
  if (!ships.length) out.issue = 'No ships assigned';
  else if (out.tph <= 0) out.issue = 'Too far: build an air station between, or research Long-Range Tanks';
  out.ok = out.tph > 0;
  if (!out.path) out.path = flightPath(g, from, to, Math.max(...Object.keys(G.ships).map((c) => shipStats(g, c).range))) || { length: dist(from, to), stops: 0, pts: [from, to], far: true };
  return out;
}

/* ---------- mines ---------- */

export function reserveOf(world, site, oreId) {
  const o = oreById(world)[oreId];
  if (!o || o.tier === 'common') return Infinity;
  return G.mine.reserve[o.tier] * num(site.ground?.richness?.[oreId]) * num(site.ground?.veinSize?.[oreId], 1);
}

// Tonnes per hour of each ore this mine would dig right now (before stockpile limits).
export function mineRates(g, world, s, t) {
  const out = {};
  if (s.kind !== 'mine' || !live(s)) return out;
  if (s.haltUntil && t < s.haltUntil) return out;
  const I = G.mine.intensity[s.intensity] || G.mine.intensity.standard;
  const cap = G.mine.cap[s.level] * I.out * (1 + techSum(g, 'mine')) * evoMult(g, 'extraction') / clamp(s.ground?.soil || 1, 0.7, 1.4);
  const drill = drillLevel(g);
  for (const o of ores(world)) {
    const rich = num(s.ground?.richness?.[o.id]);
    if (!(rich > 0) || o.hardness > drill) continue;
    let f = s.focus ? (s.focus === o.id ? G.mine.focus : G.mine.unfocused) : 1;
    let rate = cap * G.mine.share[o.tier] * rich * f;
    if (o.tier !== 'common') {
      const res = reserveOf(world, s, o.id), left = res - num(s.dug?.[o.id]);
      if (left <= 0) continue;
      rate *= clamp(left / (res * G.mine.taper), 0, 1);
    }
    if (rate > 0) out[o.id] = rate;
  }
  return out;
}

/* ---------- new guild ---------- */

export function newGuild({ uid, name, species, world, x, y, now, grant = 0 }) {
  const t0 = Math.floor(now / MIN) * MIN;
  const info = spotInfo(world.planet, x, y);
  const g = {
    v: GUILD_VERSION, uid, id: uid, name: cleanName(name, 'Nameless Guild'), species: species || null, planetId: world.planet.id,
    month: world.month, seed: `${uid}:${world.planet.id}`, born: t0, t: t0,
    coin: G.startCoin + grant, grant, earned: 0, runEarned: 0, monthEarned: 0,
    sp: 0, evo: { extraction: 0, logistics: 0, trade: 0, spectacle: 0 }, nukes: 0, lastNuke: null,
    landing: { x: Math.round(x), y: Math.round(y), region: info.region },
    sites: [], ships: [], routes: [], exchange: null, tech: {}, rp: 0,
    surveys: [], offers: [], contracts: [], buyers: {}, offerAt: null, offerN: 0,
    rate: {}, ema: { in: 0, out: 0 }, ledger: ledger0(), log: [], inbox: [], nextId: 1,
    stats: { mined: 0, shipped: 0, refined: 0, sold: 0, incidents: 0, deals: 0, defaults: 0 },
  };
  setupBase(g, world, t0);
  logIt(g, t0, 'land', line('landing', { region: info.region }, g.seed));
  return g;
}

function setupBase(g, world, t) {
  const { x, y, region } = g.landing;
  g.sites.push({ id: 'hub', kind: 'hub', name: 'Command Hub', x, y, level: 1, build: null, region });
  g.sites.push(mineSite(g, world, 'pit', x, y, 'Landing Pit', 1, region));
  g.ships.push({ id: nid(g, 'sh'), cls: 'hauler', name: 'Old Reliable', routeId: null });
  void t;
}
function mineSite(g, world, id, x, y, name, level, region) {
  return { id, kind: 'mine', name, x, y, level, build: null, region, intensity: 'standard', focus: null, stock: {}, dug: {}, ground: groundAt(world.planet, x, y), haltUntil: null, flags: {} };
}
const nid = (g, p) => `${p}${g.nextId++}`;

function logIt(g, t, kind, text, data) {
  if (!text) return;
  g.log.push({ t, kind, text, ...(data ? { data } : {}) });
  if (g.log.length > 80) g.log.splice(0, g.log.length - 80);
}

/* ---------- advance ---------- */

// Advance to `now`. Returns { guild, events, sales: { oreId: refined units sold to the galaxy }, transfers: [{ uid, siteId, oreId, amount, coin }] }.
export function advance(g0, world, now) {
  const g = clone(g0);
  const events = [], sales = {}, transfers = {};
  const end = Math.floor(now / MIN) * MIN;
  const P = marketPrices(world, Math.max(g.t, now));
  const npcs = npcRefineries(world.planet);
  const O = oreById(world);
  const trade = evoMult(g, 'trade');
  const emit = (kind, text, data) => { logIt(g, g.t, kind, text, data); if (events.length < 40) events.push({ type: kind, text, at: g.t, data }); };

  // deliveries from other guilds to my refineries (applied by the server)
  for (const d of g.inbox || []) {
    const s = g.sites.find((x) => x.id === d.siteId && x.kind === 'refinery');
    if (!s) continue;
    s.input = s.input || {};
    s.input[d.oreId] = num(s.input[d.oreId]) + d.amount;
    g.coin -= d.coin; g.ledger.out.ore += d.coin;
  }
  g.inbox = [];

  let ctx = null;
  const derive = () => {
    const routes = g.routes.map((r) => ({ r, info: routeInfo(g, world, r) }));
    const upkeep = upkeepOf(g);
    const rp = rpOf(g);
    return { routes, upkeep, rp };
  };
  ctx = derive();

  while (g.t + MIN <= end) {
    const t = g.t + MIN;
    g.t = t;
    const m = Math.round(t / MIN);
    let dirty = false;
    let cin = 0, cout = 0;
    const made = {};

    // constructions and upgrades
    for (const s of g.sites) {
      if (s.build && t >= s.build.doneAt) {
        const first = s.level < 1;
        s.level = s.build.to; s.build = null; dirty = true;
        emit('built', first ? line(`built.${s.kind}`, { site: s.name }, s.id) : line('upgraded', { site: s.name, level: levelName(s) }, s.id + s.level), { siteId: s.id });
      }
    }
    if (g.exchange?.build && t >= g.exchange.build.doneAt) {
      const first = g.exchange.level < 1;
      g.exchange.level = g.exchange.build.to; g.exchange.build = null; dirty = true;
      if (first) g.offerAt = t + HOUR;
      emit('built', first ? line('built.exchange', {}, g.seed) : `Exchange expanded to tier ${g.exchange.level}.`);
    }
    // surveys
    for (const sv of g.surveys) {
      if (sv.status === 'flying' && t >= sv.doneAt) {
        sv.status = 'done'; sv.report = surveyReport(g, world, sv);
        emit('survey', line('survey', { region: sv.report.region, top: sv.report.headline }, sv.id), { surveyId: sv.id });
      }
    }
    if (dirty) ctx = derive();

    // offers and contracts
    if (g.exchange?.level >= 1) {
      g.offers = g.offers.filter((o) => o.expires > t);
      if (g.offerAt != null && t >= g.offerAt) {
        if (g.offers.length < G.exchange.maxOpen) {
          const of = makeOffer(g, world, t, P, g.offerN++);
          if (of) {
            g.offers.push(of);
            const b = (world.parties || []).find((p) => p.id === of.buyerId);
            const first = !g.buyers[of.buyerId];
            g.buyers[of.buyerId] = g.buyers[of.buyerId] || { met: t, deals: 0, defaults: 0, walked: 0 };
            emit('offer', `${b ? b.name : 'A buyer'}${first ? ' (new contact)' : ''} wants ${of.qty} ${O[of.oreId]?.name || of.oreId}.`, { offerId: of.id });
          }
        }
        const mean = G.exchange.offerEvery[g.exchange.level] || 5;
        g.offerAt = t + Math.max(0.5, -Math.log(1 - 0.98 * roll(g.seed, 'offerAt', g.offerN, m)) * mean) * HOUR;
      }
    }
    for (const c of g.contracts) {
      if (c.done || t < c.due) continue;
      c.done = true;
      const b = g.buyers[c.buyerId] || (g.buyers[c.buyerId] = { met: t, deals: 0, defaults: 0, walked: 0 });
      const party = (world.parties || []).find((p) => p.id === c.buyerId) || { name: 'A buyer' };
      if (c.delivered + 1e-6 < c.qty) {
        const pen = (c.qty - c.delivered) * c.price * c.penalty;
        cout += pen; g.ledger.out.penalties += pen; b.defaults++; g.stats.defaults++;
        emit('contract', `${party.name}: delivery short by ${Math.round(c.qty - c.delivered)}. Penalty ${Math.round(pen)} coin. They will remember.`, { contractId: c.id, short: true });
      } else { b.deals++; g.stats.deals++; }
    }
    if (g.contracts.length > 30) g.contracts = g.contracts.filter((c) => !c.done || t - c.due < 3 * DAY);

    // mines dig into their stockpiles
    for (const s of g.sites) {
      if (s.kind !== 'mine' || !live(s)) continue;
      const rates = mineRates(g, world, s, t);
      const store = G.mine.store[s.level];
      let room = store - Object.values(s.stock).reduce((a, b) => a + b, 0);
      if (room <= 0.001) { if (!s.flags.full) { s.flags.full = true; emit('full', line('full', { site: s.name }, s.id + m), { siteId: s.id }); } continue; }
      s.flags.full = false;
      for (const [id, r] of Object.entries(rates)) {
        const amt = Math.min(r / 60, room);
        if (amt <= 0) continue;
        room -= amt;
        s.stock[id] = num(s.stock[id]) + amt;
        g.stats.mined += amt;
        if (O[id].tier !== 'common') {
          const res = reserveOf(world, s, id);
          const before = num(s.dug[id]);
          s.dug[id] = before + amt;
          if (before < res * 0.8 && s.dug[id] >= res * 0.8) emit('vein', line('low', { site: s.name, ore: O[id].name }, s.id + id), { siteId: s.id, oreId: id });
          if (before < res * 0.999 && s.dug[id] >= res * 0.999) emit('vein', line('dry', { site: s.name, ore: O[id].name }, s.id + id), { siteId: s.id, oreId: id });
        }
      }
    }

    // ships haul along routes
    for (const { r, info } of ctx.routes) {
      if (!info.ok) continue;
      const src = info.from;
      let cap = info.tph / 60;
      const stockTot = Object.values(src.stock || {}).reduce((a, b) => a + b, 0);
      if (stockTot <= 1e-9) continue;
      const to = info.to;
      if (to.kind === 'site') {
        const ref = to.site;
        if (!ref || ref.kind !== 'refinery' || !live(ref)) continue;
        const inTot = Object.values(ref.input || {}).reduce((a, b) => a + b, 0);
        cap = Math.min(cap, Math.max(0, G.refinery.store[ref.level] - inTot));
      } else if (to.kind === 'rival') {
        if (!to.dir.on) continue;
        cap = Math.min(cap, Math.max(0, num(to.dir.room) / 60));
      }
      if (cap <= 1e-9) continue;
      const pick = r.cargo && r.cargo !== 'all' ? { [r.cargo]: num(src.stock[r.cargo]) } : src.stock;
      const pickTot = Object.values(pick).reduce((a, b) => a + b, 0);
      if (pickTot <= 1e-9) continue;
      const take = Math.min(cap, pickTot);
      for (const [id, amt] of Object.entries(pick)) {
        const a = take * (amt / pickTot);
        if (a <= 0) continue;
        src.stock[id] -= a;
        if (src.stock[id] < 1e-9) delete src.stock[id];
        g.stats.shipped += a;
        if (to.kind === 'npc') {
          const c = a * npcPrice(to.npc, id, P) * trade;
          cin += c; g.ledger.in.npc += c; sales[id] = num(sales[id]) + a;
        } else if (to.kind === 'site') {
          to.site.input = to.site.input || {};
          to.site.input[id] = num(to.site.input[id]) + a;
        } else if (to.kind === 'rival') {
          const c = a * to.dir.pct * (P[id]?.p || 0);
          cin += c; g.ledger.in.players += c;
          const k = `${to.uid}|${to.id}|${id}`;
          const tr = transfers[k] || (transfers[k] = { uid: to.uid, siteId: to.id, oreId: id, amount: 0, coin: 0, from: g.uid });
          tr.amount += a; tr.coin += c;
        }
      }
    }

    // refineries turn raw ore into refined goods
    const thruMult = 1 + techSum(g, 'thru'), yieldMult = G.refinery.yield + techSum(g, 'yield');
    const ex = g.exchange?.level >= 1 ? g.exchange : null;
    for (const s of g.sites) {
      if (s.kind !== 'refinery' || !live(s)) continue;
      const input = s.input || {};
      const tot = Object.values(input).reduce((a, b) => a + b, 0);
      if (tot <= 1e-9) continue;
      const proc = Math.min(tot, (G.refinery.thru[s.level] * thruMult) / 60);
      for (const [id, amt] of Object.entries(input)) {
        const a = proc * (amt / tot);
        input[id] -= a;
        if (input[id] < 1e-9) delete input[id];
        const u = a * yieldMult;
        made[id] = num(made[id]) + u;
        g.stats.refined += u;
        if (ex) ex.stock[id] = num(ex.stock[id]) + u;
        else { const c = u * (P[id]?.p || 0) * G.guildExchange * trade; cin += c; g.ledger.in.guild += c; sales[id] = num(sales[id]) + u; g.stats.sold += u; }
      }
    }

    // the exchange fills contracts, then sells the rest on the spot market
    if (ex) {
      for (const c of g.contracts) {
        if (c.done || t < c.start) continue;
        const left = c.qty - c.delivered;
        const have = num(ex.stock[c.oreId]);
        if (left <= 1e-9 || have <= 1e-9) continue;
        const perMin = (c.qty / ((c.due - c.start) / MIN)) * 3;
        const d = Math.min(left, have, perMin);
        ex.stock[c.oreId] = have - d;
        c.delivered += d;
        const pay = d * c.price * trade;
        c.paid += pay; cin += pay; g.ledger.in.contract += pay; sales[c.oreId] = num(sales[c.oreId]) + d; g.stats.sold += d;
        if (c.delivered >= c.qty - 1e-6) {
          c.delivered = c.qty; c.done = true; c.early = t < c.due;
          const b = g.buyers[c.buyerId] || (g.buyers[c.buyerId] = { met: t, deals: 0, defaults: 0, walked: 0 });
          b.deals++; g.stats.deals++;
          const party = (world.parties || []).find((p) => p.id === c.buyerId) || { name: 'A buyer' };
          emit('contract', `${party.name}: contract filled. ${Math.round(c.paid)} coin paid.`, { contractId: c.id });
        }
      }
      const store = G.exchange.store[ex.level];
      let total = Object.values(ex.stock).reduce((a, b) => a + b, 0);
      for (const [id, amt] of Object.entries(ex.stock)) {
        const reserve = g.contracts.filter((c) => !c.done && c.oreId === id).reduce((a, c) => a + c.qty - c.delivered, 0);
        let sell = 0;
        if (ex.spot[id] !== false) sell = Math.max(0, amt - reserve);
        else if (total > store) sell = Math.min(amt, total - store);
        if (sell <= 1e-9) continue;
        const price = (ex.spot[id] !== false ? G.exchange.spot : G.guildExchange) * (P[id]?.p || 0) * trade;
        ex.stock[id] = amt - sell; total -= sell;
        if (ex.stock[id] < 1e-9) delete ex.stock[id];
        const c = sell * price; cin += c; g.ledger.in.spot += c; sales[id] = num(sales[id]) + sell; g.stats.sold += sell;
      }
    }

    // upkeep and research
    cout += ctx.upkeep / 60; g.ledger.out.upkeep += ctx.upkeep / 60;
    g.rp += ctx.rp / 60;

    // incidents at mines
    const riskMult = 1 - (has(g, 'safety') ? G.tech.safety.risk : 0);
    for (const s of g.sites) {
      if (s.kind !== 'mine' || !live(s) || (s.haltUntil && t < s.haltUntil) || t - g.born < 2 * HOUR) continue;
      const I = G.mine.intensity[s.intensity] || G.mine.intensity.standard;
      const p = (G.incident.perHour * s.level * I.risk * riskMult) / 60;
      if (roll(g.seed, 'inc', s.id, m) >= p) continue;
      const hrs = between(roll(g.seed, 'incH', s.id, m), G.incident.halt);
      s.haltUntil = t + hrs * HOUR;
      const comp = G.incident.comp * s.level * (1 - (has(g, 'waivers') ? G.tech.waivers.comp : 0));
      cout += comp; g.ledger.out.incidents += comp; g.stats.incidents++;
      emit('incident', line('incident', { site: s.name, n: 2 + Math.floor(roll(g.seed, 'incN', m) * 9) }, `${s.id}${m}`) + ` (${Math.round(hrs)}h halt, ${Math.round(comp)} coin)`, { siteId: s.id });
    }

    g.coin += cin - cout;
    g.earned += cin; g.runEarned += cin; g.monthEarned += cin;
    // smoothed rates for the UI and for buyers sizing their offers
    const k = 1 / 120;
    g.ema.in += (cin * 60 - g.ema.in) * k;
    g.ema.out += (cout * 60 - g.ema.out) * k;
    for (const id of new Set([...Object.keys(g.rate), ...Object.keys(made)])) {
      g.rate[id] = num(g.rate[id]) + (num(made[id]) * 60 - num(g.rate[id])) * (1 / 180);
      if (g.rate[id] < 1e-4 && !made[id]) delete g.rate[id];
    }
  }
  return { guild: g, events, sales, transfers: Object.values(transfers) };
}

function upkeepOf(g) {
  let u = 0;
  for (const s of g.sites) {
    if (!live(s)) continue;
    if (s.kind === 'hub') u += G.hub.upkeep[s.level];
    else if (s.kind === 'mine') u += G.mine.upkeep[s.level] * (G.mine.intensity[s.intensity] || G.mine.intensity.standard).upkeep;
    else if (s.kind === 'refinery') u += G.refinery.upkeep[s.level];
    else if (s.kind === 'air') u += G.build.air.upkeep;
    else if (s.kind === 'lab') u += G.lab.upkeep[s.level];
  }
  if (g.exchange?.level >= 1) u += G.exchange.upkeep * g.exchange.level;
  for (const sh of g.ships) u += G.ships[sh.cls].upkeep;
  return u;
}
function rpOf(g) {
  let r = 0;
  for (const s of g.sites) {
    if (!live(s)) continue;
    if (s.kind === 'hub') r += G.hub.rp[s.level];
    if (s.kind === 'lab') r += G.lab.rp[s.level];
  }
  return r;
}
export function levelName(s) {
  if (s.kind === 'mine') return G.mine.names[s.level] || 'L' + s.level;
  return 'level ' + s.level;
}

/* ---------- surveys ---------- */

export function surveyCost(g, x, y) {
  const hubs = hubsOf(g);
  const d = hubs.length ? Math.min(...hubs.map((h) => dist(h, { x, y }))) : 0;
  return { cost: Math.round(G.drone.cost + G.drone.perUnit * d), hours: d / (G.drone.speed * (1 + techSum(g, 'speed') * 0.5)) + G.drone.scanHours, d };
}
export const droneCount = (g) => 1 + techSum(g, 'drones');
const precisionOf = (g) => Math.max(0, ...Object.keys(g.tech || {}).map((id) => num(G.tech[id]?.precision)));

function surveyReport(g, world, sv) {
  const info = spotInfo(world.planet, sv.x, sv.y);
  const gr = groundAt(world.planet, sv.x, sv.y);
  const prec = sv.precision;
  const noise = [0.28, 0.1, 0][prec];
  const list = [];
  for (const o of ores(world)) {
    const truth = num(gr.richness[o.id]);
    const u = roll(g.seed, 'sv', sv.id, o.id);
    if (o.tier === 'common') { if (truth > 0) list.push({ id: o.id, lo: 1, hi: 1, est: 1, hardness: o.hardness }); continue; }
    if (truth <= 0) {
      if (prec === 0 && u < 0.18) list.push({ id: o.id, lo: 0, hi: r2(0.1 + u), est: 0, trace: true, hardness: o.hardness });
      continue;
    }
    const est = clamp(truth + (u - 0.5) * 2 * noise, 0.02, 1);
    const item = { id: o.id, lo: r2(clamp(est - noise, 0, 1)), hi: r2(clamp(est + noise, 0.05, 1)), est: r2(est), hardness: o.hardness };
    if (prec >= 2) item.reserve = Math.round(G.mine.reserve[o.tier] * truth * num(gr.veinSize[o.id], 1));
    list.push(item);
  }
  const O = oreById(world);
  const best = list.filter((x) => O[x.id].tier !== 'common' && !x.trace).sort((a, b) => O[b.id].pbar * b.est - O[a.id].pbar * a.est)[0];
  const word = (e) => (e >= 0.7 ? 'rich' : e >= 0.45 ? 'good' : e >= 0.25 ? 'some' : 'traces of');
  const headline = best ? `${word(best.est)} ${O[best.id].name}${O[best.id].tier === 'mythic' ? ' (MYTHIC!)' : ''}` : line('nothing', {}, sv.id);
  return { region: info.region, terrain: info.terrain, climate: info.climate, soil: gr.soil >= 1.15 ? 'hard' : gr.soil <= 0.85 ? 'soft' : 'average', tough: gr.tough, ores: list, precision: prec, headline };
}

/* ---------- commands ---------- */

const err = (g, e) => ({ guild: g, events: [], sales: {}, transfers: [], error: e });

export function canBuildAt(g, world, kind, x, y) {
  if (!KINDS.includes(kind)) return 'Unknown operation';
  const ok = spotOK(world.planet, x, y, []);
  if (!ok.ok) return ok.reason === 'water' ? 'That is water' : 'Not a buildable spot';
  const hubs = hubsOf(g);
  if (!hubs.some((h) => dist(h, { x, y }) <= claimRadius(g, h))) return 'Too far from your hub or an air station';
  if (g.sites.some((s) => dist(s, { x, y }) < G.siteGap)) return 'Too close to one of your operations';
  if ((world.sites || []).some((s) => s.uid !== g.uid && dist(s, { x, y }) < G.rivalGap)) return 'Too close to another guild';
  if (g.sites.length >= G.maxSites) return 'The Guild charter limits you to ' + G.maxSites + ' operations';
  return null;
}

export function upgradeCost(g, s) {
  if (s.kind === 'hub') return s.level < 3 ? { cost: G.hub.cost[s.level + 1], hours: G.hub.hours[s.level + 1] } : null;
  if (s.kind === 'mine') return s.level < 5 ? { cost: G.mine.up[s.level + 1], hours: G.mine.hours[s.level + 1] } : null;
  if (s.kind === 'refinery') return s.level < 4 ? { cost: G.refinery.up[s.level + 1], hours: G.refinery.hours[s.level + 1] } : null;
  if (s.kind === 'lab') return s.level < 3 ? { cost: G.lab.up[s.level + 1], hours: G.lab.hours[s.level + 1] } : null;
  return null;
}

function pay(g, amount, bucket) {
  if (g.coin < amount) return false;
  g.coin -= amount; g.ledger.out[bucket] += amount;
  return true;
}

export function applyCommand(g0, world, cmd, now) {
  const adv = advance(g0, world, now);
  const g = adv.guild;
  const t = g.t;
  const ev = [];
  const out = (e) => ({ ...adv, guild: g, events: [...adv.events, ...ev], error: e || null });
  const P = marketPrices(world, t);
  if (!cmd || typeof cmd.type !== 'string') return out('Bad command');
  const site = (id) => g.sites.find((s) => s.id === id);
  const say = (kind, text, data) => { logIt(g, t, kind, text, data); ev.push({ type: kind, text, at: t, data }); };

  switch (cmd.type) {
    case 'build': {
      const x = Math.round(Number(cmd.x)), y = Math.round(Number(cmd.y));
      const why = canBuildAt(g, world, cmd.kind, x, y);
      if (why) return out(why);
      if (building(g) >= crews(g)) return out('All construction crews are busy');
      const B = G.build[cmd.kind];
      if (!pay(g, B.cost, 'build')) return out('Not enough coin');
      const info = spotInfo(world.planet, x, y);
      const id = nid(g, cmd.kind[0]);
      const name = cleanName(cmd.name, siteName(cmd.kind, info.region, g.seed + id));
      let s;
      if (cmd.kind === 'mine') s = mineSite(g, world, id, x, y, name, 0, info.region);
      else s = { id, kind: cmd.kind, name, x, y, level: 0, region: info.region, ...(cmd.kind === 'refinery' ? { input: {}, buy: { on: false, pct: G.refinery.buyPct } } : {}) };
      s.build = { to: 1, doneAt: t + B.hours * HOUR, at: t };
      g.sites.push(s);
      say('build', `Construction started: ${name} (${B.label}).`, { siteId: id });
      return out();
    }
    case 'upgrade': {
      const s = site(cmd.siteId);
      if (!s) return out('No such operation');
      if (s.build) return out('Already under construction');
      const u = upgradeCost(g, s);
      if (!u) return out('Already at the top level');
      if (building(g) >= crews(g)) return out('All construction crews are busy');
      if (!pay(g, u.cost, 'build')) return out('Not enough coin');
      s.build = { to: s.level + 1, doneAt: t + u.hours * HOUR, at: t };
      say('build', `Upgrading ${s.name}.`, { siteId: s.id });
      return out();
    }
    case 'demolish': {
      const s = site(cmd.siteId);
      if (!s || s.kind === 'hub') return out('You cannot demolish that');
      g.sites = g.sites.filter((x) => x !== s);
      const gone = g.routes.filter((r) => r.from === s.id || (r.to.kind === 'site' && r.to.id === s.id)).map((r) => r.id);
      g.routes = g.routes.filter((r) => !gone.includes(r.id));
      for (const sh of g.ships) if (gone.includes(sh.routeId)) sh.routeId = null;
      say('demolish', `${s.name} was abandoned. The hole will be someone else's problem.`);
      return out();
    }
    case 'setMine': {
      const s = site(cmd.siteId);
      if (!s || s.kind !== 'mine') return out('No such mine');
      if (cmd.intensity != null) { if (!G.mine.intensity[cmd.intensity]) return out('Bad intensity'); s.intensity = cmd.intensity; }
      if (cmd.focus !== undefined) { if (cmd.focus && !world.planet.ores.some((o) => o.id === cmd.focus)) return out('Bad ore'); s.focus = cmd.focus || null; }
      return out();
    }
    case 'setRefinery': {
      const s = site(cmd.siteId);
      if (!s || s.kind !== 'refinery') return out('No such refinery');
      s.buy = s.buy || { on: false, pct: G.refinery.buyPct };
      if (cmd.on != null) s.buy.on = !!cmd.on;
      if (cmd.pct != null) s.buy.pct = r2(clamp(Number(cmd.pct) || G.refinery.buyPct, G.refinery.buyMin, G.refinery.buyMax));
      return out();
    }
    case 'buyShip': {
      const cls = cmd.cls;
      if (!G.ships[cls]) return out('Unknown ship');
      if (G.ships[cls].tech && !has(g, G.ships[cls].tech)) return out('Needs ' + G.tech[G.ships[cls].tech].label);
      if (g.ships.length >= hangar(g)) return out('Hangars are full: upgrade the hub or build an air station');
      const cost = shipCost(g, cls);
      if (!pay(g, cost, 'ships')) return out('Not enough coin');
      const sh = { id: nid(g, 'sh'), cls, name: cleanName(cmd.name, `${G.ships[cls].label} ${g.ships.length + 1}`), routeId: null };
      if (cmd.routeId && g.routes.some((r) => r.id === cmd.routeId)) sh.routeId = cmd.routeId;
      g.ships.push(sh);
      say('ship', `${sh.name} rolled off the line.`);
      return out();
    }
    case 'sellShip': {
      const sh = g.ships.find((s) => s.id === cmd.shipId);
      if (!sh) return out('No such ship');
      g.ships = g.ships.filter((s) => s !== sh);
      const back = Math.round(G.ships[sh.cls].cost * 0.4);
      g.coin += back; g.ledger.out.ships -= back;
      return out();
    }
    case 'route': {
      // create a route: { from: mineId, to: { kind: 'npc'|'site'|'rival', id, uid? }, cargo?, shipId? }
      const from = site(cmd.from);
      if (!from || from.kind !== 'mine') return out('Routes start at one of your mines');
      const to = placeOf(g, world, cmd.to);
      if (!to) return out('Unknown destination');
      if (to.kind === 'site' && to.site.kind !== 'refinery') return out('Ships can only deliver to refineries');
      if (to.kind === 'rival' && to.uid === g.uid) return out('That is your own refinery');
      if (g.routes.length >= 24) return out('Too many routes');
      const cargo = cmd.cargo && world.planet.ores.some((o) => o.id === cmd.cargo) ? cmd.cargo : 'all';
      const r = { id: nid(g, 'r'), from: from.id, to: { kind: to.kind, id: to.id, ...(to.uid ? { uid: to.uid } : {}) }, cargo, name: `${from.name} → ${to.name}`.slice(0, 48) };
      g.routes.push(r);
      const ids = Array.isArray(cmd.shipIds) ? cmd.shipIds : cmd.shipId ? [cmd.shipId] : [];
      for (const id of ids) { const sh = g.ships.find((s) => s.id === id); if (sh) sh.routeId = r.id; }
      say('route', `New route: ${r.name}.`, { routeId: r.id });
      return out();
    }
    case 'setRoute': {
      const r = g.routes.find((x) => x.id === cmd.routeId);
      if (!r) return out('No such route');
      if (cmd.cargo) r.cargo = cmd.cargo === 'all' || world.planet.ores.some((o) => o.id === cmd.cargo) ? cmd.cargo : r.cargo;
      return out();
    }
    case 'deleteRoute': {
      g.routes = g.routes.filter((x) => x.id !== cmd.routeId);
      for (const sh of g.ships) if (sh.routeId === cmd.routeId) sh.routeId = null;
      return out();
    }
    case 'assign': {
      const sh = g.ships.find((s) => s.id === cmd.shipId);
      if (!sh) return out('No such ship');
      if (cmd.routeId && !g.routes.some((r) => r.id === cmd.routeId)) return out('No such route');
      sh.routeId = cmd.routeId || null;
      return out();
    }
    case 'survey': {
      const x = Math.round(Number(cmd.x)), y = Math.round(Number(cmd.y));
      if (!(x >= 0 && x <= 1000 && y >= 0 && y <= 1000)) return out('Off the map');
      if (spotInfo(world.planet, x, y).water) return out('Drones do not survey water. They drown.');
      if (g.surveys.filter((s) => s.status === 'flying').length >= droneCount(g)) return out('All drones are out');
      const q = surveyCost(g, x, y);
      if (!pay(g, q.cost, 'survey')) return out('Not enough coin');
      const sv = { id: nid(g, 'sv'), x, y, status: 'flying', at: t, doneAt: t + q.hours * HOUR, precision: precisionOf(g) };
      g.surveys.push(sv);
      if (g.surveys.length > 60) { const i = g.surveys.findIndex((s) => s.status === 'done'); if (i >= 0) g.surveys.splice(i, 1); }
      say('drone', `Drone launched toward ${spotInfo(world.planet, x, y).region}.`, { surveyId: sv.id });
      return out();
    }
    case 'research': {
      const T = G.tech[cmd.tech];
      if (!T) return out('Unknown technology');
      if (has(g, cmd.tech)) return out('Already known');
      if (T.needs && !has(g, T.needs)) return out('Needs ' + G.tech[T.needs].label);
      if (g.rp < T.rp) return out('Not enough research points');
      g.rp -= T.rp; g.tech[cmd.tech] = t;
      say('tech', `Research complete: ${T.label}. ${T.text}`);
      return out();
    }
    case 'buildExchange': {
      if (g.exchange) return out('You already have an exchange');
      if (dayOf(world, t) < G.exchange.day) return out(`The Guild licenses exchanges from day ${G.exchange.day}`);
      if (!g.sites.some((s) => s.kind === 'refinery' && live(s))) return out('You need a working refinery first');
      if (building(g) >= crews(g)) return out('All construction crews are busy');
      if (!pay(g, G.exchange.cost, 'build')) return out('Not enough coin');
      g.exchange = { level: 0, build: { to: 1, doneAt: t + G.exchange.hours * HOUR, at: t }, stock: {}, spot: {} };
      say('build', 'Your Galactic Exchange is being assembled in orbit.');
      return out();
    }
    case 'upgradeExchange': {
      const ex = g.exchange;
      if (!ex || ex.level < 1 || ex.build) return out('No exchange to upgrade');
      if (ex.level >= 3) return out('Already the biggest exchange');
      if (building(g) >= crews(g)) return out('All construction crews are busy');
      if (!pay(g, G.exchange.up[ex.level + 1], 'build')) return out('Not enough coin');
      ex.build = { to: ex.level + 1, doneAt: t + G.exchange.upHours[ex.level + 1] * HOUR, at: t };
      return out();
    }
    case 'setSpot': {
      if (!g.exchange) return out('No exchange');
      if (!world.planet.ores.some((o) => o.id === cmd.oreId)) return out('Bad ore');
      g.exchange.spot[cmd.oreId] = !!cmd.on;
      return out();
    }
    case 'offer': {
      const i = g.offers.findIndex((o) => o.id === cmd.offerId);
      if (i < 0) return out('That offer is gone');
      const of = g.offers[i];
      const party = (world.parties || []).find((p) => p.id === of.buyerId) || { id: of.buyerId, type: 'traders' };
      const b = g.buyers[of.buyerId] || (g.buyers[of.buyerId] = { met: t, deals: 0, defaults: 0, walked: 0 });
      if (cmd.action === 'accept') {
        g.offers.splice(i, 1);
        g.contracts.push(contractFrom(of, t));
        say('contract', `Signed with ${party.name}: ${of.qty} ${oreById(world)[of.oreId]?.name} at ${of.price} over ${of.days} days.`);
      } else if (cmd.action === 'decline') {
        g.offers.splice(i, 1);
      } else if (cmd.action === 'counter') {
        const r = counter(of, party, Number(cmd.price), world);
        if (r.status === 'walked') { g.offers.splice(i, 1); b.walked++; say('offer', `${party.name} walked away.`, { offerId: of.id, lines: r.offer.lines }); }
        else if (r.status === 'accepted') { g.offers.splice(i, 1); g.contracts.push(contractFrom(r.offer, t)); say('contract', `Signed with ${party.name} at ${r.offer.price}.`, { lines: r.offer.lines }); }
        else g.offers[i] = r.offer;
        ev.push({ type: 'haggle', status: r.status, offer: r.offer, at: t });
      } else return out('Bad action');
      return out();
    }
    case 'rename': {
      const name = cleanName(cmd.name);
      if (!name) return out('Pick a name');
      if (cmd.target === 'guild') g.name = name;
      else if (cmd.target === 'site') { const s = site(cmd.id); if (!s) return out('No such operation'); s.name = name; }
      else if (cmd.target === 'ship') { const s = g.ships.find((x) => x.id === cmd.id); if (!s) return out('No such ship'); s.name = name; }
      else return out('Bad target');
      return out();
    }
    case 'nuke': {
      if (cmd.confirm !== 'NUKE') return out('Type NUKE to confirm');
      if (g.runEarned < G.nukeMin) return out(`You need ${G.nukeMin} coin earned since your last nuke`);
      const spectacle = G.spectacle(g.runEarned, g.evo.spectacle);
      g.sp += spectacle; g.nukes += 1;
      g.lastNuke = { at: t, spectacle, runEarned: g.runEarned };
      g.sites = []; g.ships = []; g.routes = []; g.exchange = null; g.tech = {}; g.rp = 0;
      g.offers = []; g.contracts = []; g.offerAt = null; g.rate = {};
      g.coin = G.startCoin; g.runEarned = 0;
      setupBase(g, world, t);
      say('nuke', `☢ You nuked your own operation for ${spectacle.toFixed(1)} Spectacle. The Maker felt it. The planet definitely felt it.`, { spectacle });
      return out();
    }
    case 'evolve': {
      const E = G.evo[cmd.kind];
      if (!E) return out('Unknown evolution');
      const lvl = num(g.evo[cmd.kind]);
      if (lvl >= G.evoMax) return out('Maxed');
      const cost = evoCost(g, cmd.kind);
      if (g.sp < cost) return out('Not enough SP');
      g.sp -= cost; g.evo[cmd.kind] = lvl + 1;
      return out();
    }
    default:
      return out('Unknown command');
  }
}
export const evoCost = (g, kind) => Math.round(G.evo[kind].cost * Math.pow(G.evo[kind].growth, num(g.evo[kind])) * 10) / 10;

/* ---------- view: everything the UI shows, derived ---------- */

export function view(g, world, now) {
  const t = now ?? g.t;
  const P = marketPrices(world, t);
  const O = oreById(world);
  const routes = g.routes.map((r) => routeInfo(g, world, r));
  const inflow = {};
  for (const ri of routes) if (ri.ok && ri.to?.kind === 'site') inflow[ri.to.id] = num(inflow[ri.to.id]) + ri.tph;
  const outflow = {};
  for (const ri of routes) if (ri.ok) outflow[ri.from.id] = num(outflow[ri.from.id]) + ri.tph;
  const sites = g.sites.map((s) => {
    const v = { id: s.id, kind: s.kind, name: s.name, x: s.x, y: s.y, level: s.level, levelName: levelName(s), build: s.build, region: s.region };
    v.upgrade = upgradeCost(g, s);
    if (s.kind === 'hub' || s.kind === 'air') v.radius = claimRadius(g, s);
    if (s.kind === 'mine') {
      const rates = mineRates(g, world, s, t);
      v.rates = rates;
      v.tph = Object.values(rates).reduce((a, b) => a + b, 0);
      v.stock = s.stock; v.store = G.mine.store[s.level] || 0;
      v.stockTot = Object.values(s.stock || {}).reduce((a, b) => a + b, 0);
      v.full = v.store > 0 && v.stockTot >= v.store - 0.01;
      v.intensity = s.intensity; v.focus = s.focus;
      v.halted = s.haltUntil && t < s.haltUntil ? s.haltUntil : null;
      v.shipping = outflow[s.id] || 0;
      v.value = Object.entries(rates).reduce((a, [id, r]) => a + r * (P[id]?.p || 0), 0);
      v.veins = {};
      for (const id of Object.keys(s.ground?.richness || {})) if (O[id] && O[id].tier !== 'common' && (s.dug?.[id] || rates[id])) {
        const res = reserveOf(world, s, id);
        v.veins[id] = { left: Math.max(0, 1 - num(s.dug?.[id]) / res) };
      }
      v.blocked = Object.keys(s.ground?.richness || {}).filter((id) => O[id] && O[id].hardness > drillLevel(g) && s.ground.richness[id] > 0);
      v.upkeep = G.mine.upkeep[s.level] * (G.mine.intensity[s.intensity] || G.mine.intensity.standard).upkeep;
    }
    if (s.kind === 'refinery') {
      v.thru = (G.refinery.thru[s.level] || 0) * (1 + techSum(g, 'thru'));
      v.input = s.input || {};
      v.inputTot = Object.values(v.input).reduce((a, b) => a + b, 0);
      v.store = G.refinery.store[s.level] || 0;
      v.inflow = inflow[s.id] || 0;
      v.buy = s.buy || { on: false, pct: G.refinery.buyPct };
      v.yield = G.refinery.yield + techSum(g, 'yield');
      v.room = Math.max(0, v.thru - v.inflow);
      v.upkeep = G.refinery.upkeep[s.level] || 0;
    }
    if (s.kind === 'lab') v.rpH = G.lab.rp[s.level] || 0;
    if (s.kind === 'hub') { v.rpH = G.hub.rp[s.level]; v.hangar = hangar(g); v.crews = crews(g); }
    return v;
  });
  const ex = g.exchange ? { ...g.exchange, store: G.exchange.store[g.exchange.level] || G.exchange.store[1], upgradeCost: g.exchange.level < 3 ? G.exchange.up[g.exchange.level + 1] : null } : null;
  const offers = g.offers.map((o) => ({ ...o, max: undefined, tell: has(g, 'silver') ? tell(o) : null, market: P[o.oreId]?.p }));
  const met = Object.entries(g.buyers).map(([id, b]) => {
    const p = (world.parties || []).find((x) => x.id === id) || { id, name: 'Unknown' };
    const lvl = b.deals >= 3 ? 3 : b.deals >= 1 ? 2 : 1;
    const wants = lvl >= 2 ? Object.entries(p.wants || {}).filter(([, w]) => w >= 0.5).sort((a, c) => c[1] - a[1]).map(([id2]) => id2) : null;
    return { id, name: p.name, type: p.type, personality: p.personality, blurb: p.blurb, backstory: lvl >= 2 ? p.backstory : null, voice: p.voice, quirk: lvl >= 3 ? p.quirk : null, wants, level: lvl, ...b, premium: lvl >= 3 ? Math.round((0.95 + (clamp(Number(p.ref) || 1.1, 0.8, 1.6) - 0.8) * 0.44 - 1) * 100) : null };
  });
  const shipsV = g.ships.map((s) => ({ ...s, ...shipStats(g, s.cls) }));
  const lic = { exchange: dayOf(world, t) >= G.exchange.day };
  return {
    t, day: dayOf(world, t), coin: g.coin, sp: g.sp, rp: g.rp, rpH: rpOf(g), upkeepH: upkeepOf(g),
    incomeH: g.ema.in, netH: g.ema.in - g.ema.out, prices: P, sites, routes: routes.map((r) => ({ ...r, from: r.from && { id: r.from.id, name: r.from.name, x: r.from.x, y: r.from.y }, to: r.to && { kind: r.to.kind, id: r.to.id, uid: r.to.uid, name: r.to.name, x: r.to.x, y: r.to.y } })),
    ships: shipsV, hangar: hangar(g), crews: crews(g), building: building(g), drones: droneCount(g), flying: g.surveys.filter((s) => s.status === 'flying').length,
    drill: drillLevel(g), exchange: ex, offers, contracts: g.contracts, buyers: met, lic,
    nukeReady: g.runEarned >= G.nukeMin, spectacleNow: G.spectacle(g.runEarned, g.evo.spectacle),
    npcPrices: Object.fromEntries(npcRefineries(world.planet).map((n) => [n.id, Object.fromEntries(Object.keys(P).map((id) => [id, npcPrice(n, id, P) * evoMult(g, 'trade')]))])),
    trade: evoMult(g, 'trade'),
    shipCosts: Object.fromEntries(Object.keys(G.ships).map((c) => [c, shipCost(g, c)])),
    evoCosts: Object.fromEntries(Object.keys(G.evo).map((k) => [k, evoCost(g, k)])),
  };
}
