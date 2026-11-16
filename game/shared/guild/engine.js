// The guild engine: you are a Guild General running operations on a new planet for one month.
// Pure and deterministic: no I/O, no Math.random, no Date.now. Runs on the server (the truth).
//
// Guild 2: every operation is made of parts you buy (no waiting: only travel takes time) and staffed by workers you
// ship in from off-planet. Workers die (often), the labor pool replaces them. Mines and refineries run on shift orders;
// accidents and strikes become small decisions, settled by your standing policy when you are away.
//
// advance() integrates whole minutes on the absolute minute grid, so advancing once for three days or many times in
// small steps gives the same result. Commands apply at the guild's clock (the last whole minute).
import { G } from './tuning.js';
import { HOUR, DAY, clone, clamp, dist, roll, between, num, cleanName, r2 } from './util.js';
import { prices as marketPrices, oreInfo } from './market.js';
import { npcRefineries, npcCamps, npcPrice, groundAt, spotInfo, flavorOf } from './world.js';
import { makeOffer, counter, contractFrom, tell } from './contracts.js';
import { line, siteName } from './text.js';
import { NODES, BRANCHES, branchOf, nodeSum, nodeMax } from './tree.js';
import { spotOK } from '../planet/index.js';

export const GUILD_VERSION = 2;
const MIN = G.stepMs;
const KINDS = ['mine', 'refinery', 'air', 'lab'];
const ledger0 = () => ({ in: { npc: 0, guild: 0, spot: 0, contract: 0, players: 0, freight: 0, gate: 0 }, out: { build: 0, parts: 0, upkeep: 0, wages: 0, workers: 0, ships: 0, survey: 0, incidents: 0, penalties: 0, ore: 0 } });

/* ---------- small accessors ---------- */

export const dayOf = (world, t) => Math.max(1, Math.floor((t - (world.startedAt ?? t)) / DAY) + 1);
const ores = (world) => oreInfo(world.planet);
const oreById = (world) => Object.fromEntries(ores(world).map((o) => [o.id, o]));
const has = (g, id) => !!(g.tree && g.tree[id]);
const T = (g, key) => nodeSum(g.tree, key);
export const evoMult = (g, kind) => 1 + G.evo[kind].per * num(g.evo?.[kind]);
export const drillLevel = (g) => nodeMax(g.tree, 'drill', G.mine.drill);
const live = (s) => s.level >= 1;
const lv = (s, part) => num(s.parts?.[part]);
const hubsOf = (g) => g.sites.filter((s) => (s.kind === 'hub' || s.kind === 'air') && live(s));
export const hubSite = (g) => g.sites.find((s) => s.kind === 'hub');
export const exSite = (g) => g.sites.find((s) => s.kind === 'exchange' && live(s));
const nid = (g, p) => `${p}${g.nextId++}`;
const PARTS = G.parts;

export function crewNeed(s) {
  let n = 0;
  for (const [id, P] of Object.entries(PARTS[s.kind] || {})) n += num(P.crew) * lv(s, id);
  return n;
}
export const staffing = (s) => { const need = crewNeed(s); return need ? clamp(num(s.crew) / need, 0, 1) : 1; };
const moraleMult = (s) => G.morale.outLo + (G.morale.outHi - G.morale.outLo) * clamp(num(s.morale, 60), 0, 100) / 100;
const shiftOf = (s) => G.shifts[s.shift] || G.shifts.normal;
const halted = (s, t) => (s.haltUntil && t < s.haltUntil) || !!s.decision;
export const moraleTarget = (g, s) => clamp(G.morale.base + G.mine.bunk * lv(s, 'bunk') + T(g, 'morale'), 0, 100);

export function hangar(g) {
  const h = hubSite(g);
  let n = G.hub.hangar + G.hub.hangarPer * Math.max(0, lv(h, 'hangar') - 1);
  for (const s of g.sites) if (s.kind === 'air' && live(s)) n += G.air.hangar * lv(s, 'hangar');
  return n;
}
export const poolCap = (g) => G.hub.bunks * Math.max(1, lv(hubSite(g), 'bunks'));
export const shuttleSize = (g) => G.hub.shuttleSize * Math.max(1, lv(hubSite(g), 'shuttle')) * (1 + T(g, 'shuttle'));
export const shuttleHours = (g) => G.hub.shuttleHours * Math.pow(G.hub.shuttleFaster, Math.max(0, lv(hubSite(g), 'shuttle') - 1));
export const droneCount = (g) => G.hub.drones + lv(hubSite(g), 'radar') + T(g, 'drones');
export const workerPrice = (g) => G.labor.price * (1 + T(g, 'price'));
export const wage = (g) => G.labor.wage * (1 + T(g, 'wage'));
const precisionOf = (g) => nodeMax(g.tree, 'precision', 0);

export function shipStats(g, cls) {
  const b = G.ships[cls];
  return { cap: b.cap * (1 + T(g, 'hold')), speed: b.speed * (1 + T(g, 'speed')) * evoMult(g, 'logistics'), range: b.range * (1 + T(g, 'range')) };
}
export function shipCost(g, cls) {
  const owned = g.ships.filter((s) => s.cls === cls).length;
  return Math.round(G.ships[cls].cost * Math.pow(G.shipGrowth, owned));
}
export function partCost(s, part) {
  const P = PARTS[s.kind]?.[part];
  if (!P) return null;
  const l = lv(s, part);
  if (l >= P.max) return null;
  return Math.round(P.base * Math.pow(P.growth, Math.max(0, l - P.start)));
}

/* ---------- what each operation does ---------- */

export function reserveOf(world, site, oreId, g) {
  const o = oreById(world)[oreId];
  if (!o || o.tier === 'common') return Infinity;
  return G.mine.reserve[o.tier] * num(site.ground?.richness?.[oreId]) * num(site.ground?.veinSize?.[oreId], 1) * (1 + (g ? T(g, 'reserve') : 0));
}
// Rock a mine could dig (t/h) and what the lift can raise.
export function mineStats(g, s, t) {
  const st = staffing(s), sh = shiftOf(s);
  const dig = lv(s, 'shaft') * G.mine.perShaft * (1 + G.mine.rig * lv(s, 'rig')) * st * moraleMult(s) * sh.out * (1 + T(g, 'dig')) * evoMult(g, 'extraction') / clamp(s.ground?.soil || 1, 0.7, 1.4);
  const haul = G.mine.haul * Math.pow(G.mine.haulGrowth, Math.max(0, lv(s, 'haul') - 1));
  const store = G.mine.yard * Math.pow(G.mine.yardGrowth, Math.max(0, lv(s, 'yard') - 1));
  const run = live(s) && !(t != null && halted(s, t));
  return { dig: run ? dig : 0, digMax: dig, haul, rock: run ? Math.min(dig, haul) : 0, store, staff: st };
}
// Tonnes per hour of each ore this mine digs right now (before stockpile limits). `rock` overrides the rock rate (blasts).
export function mineRates(g, world, s, t, rock) {
  const out = {};
  if (s.kind !== 'mine') return out;
  const R = rock != null ? rock : mineStats(g, s, t).rock;
  if (!(R > 0)) return out;
  const drill = drillLevel(g);
  for (const o of ores(world)) {
    const rich = num(s.ground?.richness?.[o.id]);
    if (!(rich > 0) || o.hardness > drill) continue;
    const f = s.focus ? (s.focus === o.id ? G.mine.focus : G.mine.unfocused) : 1;
    let rate = R * G.mine.share[o.tier] * rich * f;
    if (o.tier !== 'common') {
      // a vein tapers off near the end, then the crews scrape the leftovers forever
      const res = reserveOf(world, s, o.id, g), left = res - num(s.dug?.[o.id]);
      rate *= Math.max(G.mine.scraps, clamp(left / (res * G.mine.taper), 0, 1));
    }
    if (rate > 0) out[o.id] = rate;
  }
  return out;
}
export function refineryStats(g, s, t) {
  const feedT = 1 + T(g, 'feed');
  const intake = G.refinery.pad * lv(s, 'pad') * feedT;
  const store = G.refinery.silo * Math.pow(G.refinery.siloGrowth, Math.max(0, lv(s, 'silo') - 1));
  const feed = G.refinery.belt * Math.pow(G.refinery.beltGrowth, Math.max(0, lv(s, 'belt') - 1)) * feedT;
  const vats = G.refinery.vat * lv(s, 'vat') * (1 + T(g, 'vat')) * staffing(s) * moraleMult(s) * shiftOf(s).out;
  const run = live(s) && !(t != null && halted(s, t));
  return { intake, store, feed, vats, thru: run ? Math.min(feed, vats) : 0, yield: G.refinery.yield + G.refinery.purifier * lv(s, 'purifier') + T(g, 'yield') };
}
export function rpOf(g) {
  let r = 0;
  const h = hubSite(g);
  if (h) r += lv(h, 'office') * 2 * G.hub.rpPerClerk * staffing(h);
  for (const s of g.sites) if (s.kind === 'lab' && live(s)) r += lv(s, 'desk') * G.lab.rpPerDesk * staffing(s) * (1 + G.lab.gear * lv(s, 'gear'));
  return r * (1 + T(g, 'rp'));
}
export function exStats(g) {
  const s = exSite(g);
  if (!s) return null;
  return {
    store: G.exchange.store * Math.pow(G.exchange.storeGrowth, Math.max(0, lv(s, 'docks') - 1)),
    every: G.exchange.offerEvery * Math.pow(G.exchange.floorFaster, Math.max(0, lv(s, 'floor') - 1)) / Math.max(0.25, staffing(s)),
    open: G.exchange.lounge * lv(s, 'lounge') + T(g, 'open'),
    spot: G.exchange.spot + G.exchange.deskPer * lv(s, 'desk') + T(g, 'spot'),
  };
}
const refuelHours = (g, node) => (node && node.parts ? G.refuelHours * Math.pow(G.air.depot, Math.max(0, lv(node, 'depot') - 1)) : G.refuelHours);

/* ---------- places: where routes start and end ---------- */

export function placeOf(g, world, to) {
  if (!to) return null;
  if (to.kind === 'npc') {
    const n = npcRefineries(world.planet).find((x) => x.id === to.id);
    return n ? { kind: 'npc', id: n.id, x: n.x, y: n.y, name: n.name, npc: n } : null;
  }
  if (to.kind === 'camp') {
    const c = npcCamps(world.planet).find((x) => x.id === to.id);
    return c ? { kind: 'camp', id: c.id, x: c.x, y: c.y, name: c.name, camp: c } : null;
  }
  if (to.kind === 'site') {
    const s = g.sites.find((x) => x.id === to.id);
    return s ? { kind: 'site', id: s.id, x: s.x, y: s.y, name: s.name, site: s } : null;
  }
  if (to.kind === 'rival') {
    const d = (world.directory || []).find((x) => x.uid === to.uid && x.siteId === to.id);
    return d ? { kind: 'rival', id: d.siteId, uid: d.uid, x: d.x, y: d.y, name: `${d.name} (${d.guild})`, dir: d } : null;
  }
  if (to.kind === 'gate') {
    const d = (world.gates || []).find((x) => x.uid === to.uid && x.siteId === to.id);
    return d ? { kind: 'gate', id: d.siteId, uid: d.uid, x: d.x, y: d.y, name: `${d.name} (${d.guild})`, gate: d } : null;
  }
  return null;
}

// Shortest flight from a to b hopping through your hubs and air stations, legs no longer than `range`.
export function flightPath(g, a, b, range) {
  const hubs = hubsOf(g);
  const nodes = [a, ...hubs, b];
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
  const pts = [], stopsAt = [];
  for (let v = n - 1; v >= 0; v = prev[v]) { pts.unshift({ x: nodes[v].x, y: nodes[v].y }); if (v > 0 && v < n - 1) stopsAt.unshift(nodes[v]); if (v === 0) break; }
  return { length: D[n - 1], stops: stopsAt.length, stopsAt, pts };
}

export function routeInfo(g, world, r) {
  const from = placeOf(g, world, r.from);
  const to = placeOf(g, world, r.to);
  const out = { id: r.id, ok: false, tph: 0, ships: 0, issue: '', path: null, cycleH: 0, from, to, job: r.job || null };
  if (!from) { out.issue = 'The pickup is gone'; return out; }
  if (!to) { out.issue = 'The destination is gone'; return out; }
  const ships = g.ships.filter((s) => s.routeId === r.id);
  out.ships = ships.length;
  for (const sh of ships) {
    const st = shipStats(g, sh.cls);
    const path = flightPath(g, from, to, st.range);
    if (!path) continue;
    const cycle = (2 * path.length) / st.speed + G.dockHours + 2 * path.stopsAt.reduce((a, n) => a + refuelHours(g, n), 0);
    out.path = out.path || path;
    out.cycleH = out.cycleH || cycle;
    out.tph += st.cap / cycle;
  }
  if (r.job) { const j = g.jobs.find((x) => x.id === r.job); if (!j || j.done) { out.issue = 'Job finished'; out.tph = 0; } }
  if (!ships.length) out.issue = out.issue || 'No ships assigned';
  else if (out.tph <= 0 && !out.issue) out.issue = 'Too far for these ships: an air station between would help';
  out.ok = out.tph > 0;
  if (!out.path) out.path = flightPath(g, from, to, Math.max(...Object.keys(G.ships).map((c) => shipStats(g, c).range))) || { length: dist(from, to), stops: 0, stopsAt: [], pts: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], far: true };
  return out;
}

/* ---------- new guild ---------- */

function siteBase(g, world, kind, id, x, y, name) {
  const info = spotInfo(world.planet, x, y);
  const parts = {};
  for (const [pid, P] of Object.entries(PARTS[kind])) parts[pid] = P.start;
  const s = { id, kind, name, x: Math.round(x), y: Math.round(y), level: 1, region: info.region, terrain: info.terrain, parts, crew: 0, morale: G.morale.base, shift: 'normal' };
  if (kind === 'mine') Object.assign(s, { stock: {}, dug: {}, ground: groundAt(world.planet, x, y), focus: null, haltUntil: null, gate: { on: false, pct: G.gate.pct }, blastAt: null, flags: {} });
  if (kind === 'refinery') Object.assign(s, { input: {}, buy: { on: false, pct: G.refinery.buyPct } });
  if (kind === 'exchange') Object.assign(s, { stock: {}, spot: {} });
  return s;
}

export function newGuild({ uid, name, species, world, x, y, now }) {
  const t0 = Math.floor(now / MIN) * MIN;
  const info = spotInfo(world.planet, x, y);
  const g = {
    v: GUILD_VERSION, uid, id: uid, name: cleanName(name, 'Nameless Guild'), species: species || null, planetId: world.planet.id,
    month: world.month, seed: `${uid}:${world.planet.id}`, born: t0, t: t0,
    coin: G.startCoin, earned: 0, runEarned: 0, monthEarned: 0,
    sp: 0, evo: { extraction: 0, logistics: 0, trade: 0, spectacle: 0 }, nukes: 0, lastNuke: null,
    landing: { x: Math.round(x), y: Math.round(y), region: info.region },
    sites: [], ships: [], routes: [], tree: {}, rp: 0,
    labor: { pool: 0, inbound: [], reserve: G.labor.reserve, auto: true, hired: 0, dead: 0 },
    policy: { incident: 'rescue', strike: 'bonus' }, decisions: [],
    surveys: [], offers: [], contracts: [], buyers: {}, offerAt: null, offerN: 0, jobs: [], jobN: 0, jobAt: t0,
    rate: {}, ema: { in: 0, out: 0 }, ledger: ledger0(), log: [], inbox: [], nextId: 1,
    stats: { mined: 0, shipped: 0, refined: 0, sold: 0, incidents: 0, deals: 0, defaults: 0, deaths: 0, blasts: 0 },
  };
  setupBase(g, world);
  logIt(g, t0, 'land', line('landing', { region: info.region }, g.seed));
  return g;
}

function setupBase(g, world) {
  const { x, y } = g.landing;
  const hub = siteBase(g, world, 'hub', 'hub', x, y, 'Command Hub');
  const pit = siteBase(g, world, 'mine', 'pit', x, y, 'Landing Pit');
  hub.crew = crewNeed(hub); pit.crew = crewNeed(pit);
  g.sites.push(hub, pit);
  g.labor.pool = G.labor.startPool;
  g.ships.push({ id: nid(g, 'sh'), cls: 'hauler', name: 'Old Reliable', routeId: null });
}

function logIt(g, t, kind, text, data) {
  if (!text) return;
  g.log.push({ t, kind, text, ...(data ? { data } : {}) });
  if (g.log.length > 100) g.log.splice(0, g.log.length - 100);
}

/* ---------- decisions: accidents and strikes ---------- */

function openDecision(g, s, kind, t, n, emit) {
  if (s.decision) return;
  const id = nid(g, 'd');
  const W = g.workerWord || 'workers';
  let d;
  if (kind === 'cavein') {
    const cost = Math.round(G.incident.rescue * n * (1 + T(g, 'rescue')));
    d = { id, siteId: s.id, kind, n, cost, at: t, expires: t + G.incident.expire * HOUR };
    emit('incident', line('cavein', { site: s.name, n, w: W }, id), { decision: id, siteId: s.id });
  } else {
    const cost = Math.round(25 * Math.max(1, num(s.crew)));
    d = { id, siteId: s.id, kind: 'strike', n: num(s.crew), cost, at: t, expires: t + G.incident.expire * HOUR };
    emit('strike', line('strike', { site: s.name, w: W }, id), { decision: id, siteId: s.id });
  }
  s.decision = id;
  g.decisions.push(d);
}

// Settle a decision. Returns the coin spent (or -1 if the choice is unaffordable).
function settleDecision(g, d, choice, t, say) {
  const s = g.sites.find((x) => x.id === d.siteId);
  g.decisions = g.decisions.filter((x) => x !== d);
  if (!s) return 0;
  s.decision = null;
  if (d.kind === 'cavein') {
    if (choice === 'rescue' && g.coin >= d.cost) {
      g.coin -= d.cost; g.ledger.out.incidents += d.cost;
      s.haltUntil = t + between(roll(g.seed, 'halt', d.id), G.incident.halt) * HOUR;
      say('rescue', line('rescued', { site: s.name, n: d.n }, d.id));
    } else {
      const lost = Math.min(d.n, num(s.crew));
      s.crew -= lost; g.labor.dead += lost; g.stats.deaths += lost;
      s.morale = clamp(num(s.morale) - 15, 0, 100);
      s.haltUntil = null;
      say('sealed', line('sealed', { site: s.name, n: lost }, d.id));
    }
  } else {
    if (choice === 'bonus' && g.coin >= d.cost) {
      g.coin -= d.cost; g.ledger.out.wages += d.cost;
      s.morale = 60;
      say('strike', line('strikeBonus', { site: s.name }, d.id));
    } else {
      s.haltUntil = t + 4 * HOUR; s.morale = 40;
      say('strike', line('strikeWait', { site: s.name }, d.id));
    }
  }
  return 0;
}

/* ---------- advance ---------- */

// Advance to `now`. Returns { guild, events, sales: { oreId: refined units sold to the galaxy }, transfers }.
// transfers: [{ kind: 'ore', uid, siteId, oreId, amount, coin } (ore I delivered to their refinery) | { kind: 'gate', ... } (ore I bought at their gate)]
export function advance(g0, world, now) {
  const g = clone(g0);
  const events = [], sales = {}, transfers = {};
  const end = Math.floor(now / MIN) * MIN;
  const P = marketPrices(world, Math.max(g.t, now));
  const O = oreById(world);
  const trade = evoMult(g, 'trade');
  g.workerWord = flavorOf(world.planet).worker;
  const emit = (kind, text, data) => { logIt(g, g.t, kind, text, data); if (events.length < 40) events.push({ type: kind, text, at: g.t, data }); };

  // deliveries and gate sales from other guilds (applied by the server)
  for (const d of g.inbox || []) {
    const s = g.sites.find((x) => x.id === d.siteId);
    if (!s) continue;
    if (d.kind === 'gate') {
      if (s.kind !== 'mine') continue;
      const have = num(s.stock[d.oreId]);
      s.stock[d.oreId] = Math.max(0, have - d.amount);
      g.coin += d.coin; g.earned += d.coin; g.runEarned += d.coin; g.monthEarned += d.coin; g.ledger.in.gate += d.coin;
    } else if (s.kind === 'refinery') {
      s.input = s.input || {};
      s.input[d.oreId] = num(s.input[d.oreId]) + d.amount;
      g.coin -= d.coin; g.ledger.out.ore += d.coin;
    }
  }
  g.inbox = [];

  let ctx;
  const derive = () => ({ routes: g.routes.map((r) => ({ r, info: routeInfo(g, world, r) })), upkeep: upkeepOf(g), rp: rpOf(g) });
  ctx = derive();

  while (g.t + MIN <= end) {
    const t = g.t + MIN;
    g.t = t;
    const m = Math.round(t / MIN);
    let dirty = false;
    let cin = 0, cout = 0;
    const made = {};

    // operations arriving (crews and supplies flown in)
    for (const s of g.sites) {
      if (s.arrive && t >= s.arrive.doneAt) {
        s.arrive = null; s.level = 1; dirty = true;
        emit('built', line(`built.${s.kind}`, { site: s.name }, s.id), { siteId: s.id });
        if (s.kind === 'exchange') g.offerAt = t + HOUR;
      }
    }
    // surveys
    for (const sv of g.surveys) {
      if (sv.status === 'flying' && t >= sv.doneAt) {
        sv.status = 'done'; sv.report = surveyReport(g, world, sv);
        emit('survey', line('survey', { region: sv.report.region, top: sv.report.headline }, sv.id), { surveyId: sv.id });
      }
    }

    // workers: shuttles land, the pool staffs operations, the labor company tops the pool up
    const L = g.labor;
    if (L.inbound.length && L.inbound[0].doneAt <= t) {
      const sh = L.inbound.shift();
      L.pool += sh.n;
      emit('shuttle', line('shuttle', { n: sh.n, w: g.workerWord }, `${g.seed}${m}`));
      dirty = true;
    }
    for (const s of g.sites) {
      if (!live(s)) continue;
      const need = Math.min(crewNeed(s), s.crewCap != null ? s.crewCap : Infinity);
      if (num(s.crew) > need) { L.pool += s.crew - need; s.crew = need; dirty = true; }
    }
    if (L.pool > 0) {
      const order = g.sites.filter((s) => live(s)).sort((a, b) => (PRIO[a.kind] ?? 9) - (PRIO[b.kind] ?? 9));
      for (const s of order) {
        const need = Math.min(crewNeed(s), s.crewCap != null ? s.crewCap : Infinity) - num(s.crew);
        if (need <= 0) continue;
        const k = Math.min(need, L.pool);
        s.crew = num(s.crew) + k; L.pool -= k; dirty = true;
        if (!L.pool) break;
      }
    }
    if (L.auto && !L.inbound.length) {
      const short = L.reserve + g.sites.reduce((a, s) => a + Math.max(0, Math.min(crewNeed(s), s.crewCap ?? Infinity) - num(s.crew)), 0) - L.pool;
      const room = poolCap(g) - L.pool;
      const k = Math.floor(Math.min(short, room, shuttleSize(g)));
      const cost = k * workerPrice(g);
      // replacing the dead runs on the labor company's credit (down to -credit); spares only from savings
      const replace = Math.max(0, short - L.reserve);
      const ok = g.coin - cost >= G.labor.floor || (k <= replace && g.coin - cost >= -G.labor.credit);
      if (k > 0 && ok) {
        g.coin -= cost; g.ledger.out.workers += cost; L.hired += k;
        L.inbound.push({ n: k, at: t, doneAt: t + shuttleHours(g) * HOUR });
      }
    }

    // decisions you did not make in time: your standing policy decides
    for (const d of g.decisions.slice()) if (t >= d.expires) settleDecision(g, d, d.kind === 'cavein' ? g.policy.incident : g.policy.strike, t, emit);

    // offers and contracts
    const ES = exStats(g);
    if (ES) {
      g.offers = g.offers.filter((o) => o.expires > t);
      if (g.offerAt == null) g.offerAt = t + HOUR;
      if (t >= g.offerAt) {
        if (g.offers.length < G.exchange.maxOpen) {
          const of = makeOffer(g, world, t, P, g.offerN++);
          if (of) {
            if (ES.open > 0) of.price = Math.round(Math.min(of.max * 0.995, of.price * (1 + ES.open)) * 100) / 100;
            g.offers.push(of);
            const b = (world.parties || []).find((p) => p.id === of.buyerId);
            const first = !g.buyers[of.buyerId];
            g.buyers[of.buyerId] = g.buyers[of.buyerId] || { met: t, deals: 0, defaults: 0, walked: 0 };
            emit('offer', `${b ? b.name : 'A buyer'}${first ? ' (new contact)' : ''} wants ${of.qty} ${O[of.oreId]?.name || of.oreId}.`, { offerId: of.id });
          }
        }
        g.offerAt = t + Math.max(0.5, -Math.log(1 - 0.98 * roll(g.seed, 'offerAt', g.offerN, m)) * ES.every) * HOUR;
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

    // the Guild freight board
    if (t >= g.jobAt) { refreshJobs(g, world, t, P); g.jobAt = t + G.jobs.every * HOUR; }

    // mines dig, morale drifts, accidents happen
    for (const s of g.sites) {
      if (!live(s)) continue;
      if (s.kind === 'mine' || s.kind === 'refinery') {
        const sh = shiftOf(s), tgt = moraleTarget(g, s);
        let mo = num(s.morale, G.morale.base);
        if (s.shift === 'relaxed') mo = Math.min(Math.max(mo, tgt) + 25, mo + sh.morale / 60);
        else if (s.shift === 'overtime') mo += sh.morale / 60;
        else mo += clamp(tgt - mo, -G.morale.drift / 60, G.morale.drift / 60);
        s.morale = clamp(mo, 0, 100);
        if (s.morale < G.morale.strike && !s.decision && num(s.crew) > 0) openDecision(g, s, 'strike', t, 0, emit);
      }
      // the slow grind: workers die at a steady rate (deterministic: whole bodies when the fraction adds up)
      if (num(s.crew) > 0 && (s.kind === 'mine' || s.kind === 'refinery')) {
        const safety = s.kind === 'mine' ? Math.pow(G.mine.safety, lv(s, 'safety')) : 0.5;
        s.dying = num(s.dying) + (s.crew * G.labor.deathRate * shiftOf(s).deaths * safety * (1 + T(g, 'deaths'))) / 60;
        if (s.dying >= 1) {
          const k = Math.floor(s.dying);
          s.dying -= k; s.crew = Math.max(0, s.crew - k); L.dead += k; g.stats.deaths += k;
          s.deadSince = num(s.deadSince) + k;
          if (s.deadSince >= 3) { emit('death', line('deaths', { site: s.name, n: s.deadSince, w: g.workerWord }, `${s.id}${m}`), { siteId: s.id }); s.deadSince = 0; }
        }
      }
      if (s.kind !== 'mine') continue;
      if (!halted(s, t) && num(s.crew) > 0 && t - g.born >= HOUR) {
        const p = (G.incident.perHour * lv(s, 'shaft') * shiftOf(s).deaths * Math.pow(G.mine.safety, lv(s, 'safety'))) / 60;
        if (roll(g.seed, 'inc', s.id, m) < p) {
          g.stats.incidents++;
          const n = Math.max(1, Math.min(num(s.crew), Math.round(between(roll(g.seed, 'incN', s.id, m), G.incident.trapped))));
          openDecision(g, s, 'cavein', t, n, emit);
        }
      }
      const ms = mineStats(g, s, t);
      const rates = mineRates(g, world, s, t, ms.rock);
      let room = ms.store - Object.values(s.stock).reduce((a, b) => a + b, 0);
      if (room <= 0.001) { if (!s.flags.full) { s.flags.full = true; emit('full', line('full', { site: s.name }, s.id + m), { siteId: s.id }); } continue; }
      s.flags.full = false;
      for (const [id, r] of Object.entries(rates)) {
        const amt = Math.min(r / 60, room);
        if (amt <= 0) continue;
        room -= amt;
        addOre(g, world, s, id, amt, O, emit);
      }
    }

    // ships haul along routes
    const intakeLeft = {};
    for (const { r, info } of ctx.routes) {
      if (!info.ok) continue;
      const to = info.to, from = info.from;
      let cap = info.tph / 60;
      // what is available at the pickup
      let pick;
      if (from.kind === 'site') pick = r.cargo && r.cargo !== 'all' ? { [r.cargo]: num(from.site.stock?.[r.cargo]) } : { ...(from.site.stock || {}) };
      else if (from.kind === 'camp') { pick = {}; for (const [id, f] of Object.entries(from.camp.mix)) pick[id] = f * from.camp.rate / 60; if (r.cargo && r.cargo !== 'all') pick = { [r.cargo]: num(pick[r.cargo]) }; }
      else if (from.kind === 'gate') { if (!from.gate.on) continue; pick = {}; for (const [id, f] of Object.entries(from.gate.mix || {})) pick[id] = f * num(from.gate.rate) / 60; if (r.cargo && r.cargo !== 'all') pick = { [r.cargo]: num(pick[r.cargo]) }; }
      else continue;
      const job = r.job ? g.jobs.find((x) => x.id === r.job && !x.done) : null;
      if (r.job && !job) continue;
      if (job) pick = { [job.oreId]: Math.min(cap, job.qty - job.delivered) };
      // how much the destination takes
      if (to.kind === 'site') {
        const ref = to.site;
        if (!ref || ref.kind !== 'refinery' || !live(ref)) continue;
        const rs = refineryStats(g, ref, t);
        if (intakeLeft[ref.id] == null) intakeLeft[ref.id] = rs.intake / 60;
        const inTot = Object.values(ref.input || {}).reduce((a, b) => a + b, 0);
        cap = Math.min(cap, intakeLeft[ref.id], Math.max(0, rs.store - inTot));
      } else if (to.kind === 'rival') {
        if (!to.dir.on) continue;
        cap = Math.min(cap, Math.max(0, num(to.dir.room) / 60));
      } else if (to.kind !== 'npc') continue;
      const pickTot = Object.values(pick).reduce((a, b) => a + b, 0);
      if (cap <= 1e-9 || pickTot <= 1e-9) continue;
      const take = Math.min(cap, pickTot);
      if (to.kind === 'site') intakeLeft[to.id] -= take;
      for (const [id, amt] of Object.entries(pick)) {
        const a = take * (amt / pickTot);
        if (a <= 0) continue;
        // pay for it at the pickup
        if (job) { /* the Guild's cargo: free to load */ }
        else if (from.kind === 'site') { from.site.stock[id] -= a; if (from.site.stock[id] < 1e-9) delete from.site.stock[id]; }
        else if (from.kind === 'camp') { const c = a * from.camp.pct * (P[id]?.p || 0); cout += c; g.ledger.out.ore += c; }
        else if (from.kind === 'gate') {
          const c = a * from.gate.pct * (P[id]?.p || 0); cout += c; g.ledger.out.ore += c;
          const k = `g|${from.uid}|${from.id}|${id}`;
          const tr = transfers[k] || (transfers[k] = { kind: 'gate', uid: from.uid, siteId: from.id, oreId: id, amount: 0, coin: 0, from: g.uid });
          tr.amount += a; tr.coin += c;
        }
        g.stats.shipped += a;
        // deliver
        if (job) {
          const c = a * job.rate * (1 + T(g, 'freight'));
          job.delivered += a; cin += c; g.ledger.in.freight += c; sales[id] = num(sales[id]) + a;
          if (job.delivered >= job.qty - 1e-6) { job.done = true; emit('job', `Freight job done: ${Math.round(job.qty)} t of ${O[job.oreId]?.name} delivered. The Guild pays, eventually immediately.`); dirty = true; }
        } else if (to.kind === 'npc') {
          const c = a * npcPrice(to.npc, id, P) * trade;
          cin += c; g.ledger.in.npc += c; sales[id] = num(sales[id]) + a;
        } else if (to.kind === 'site') {
          to.site.input = to.site.input || {};
          to.site.input[id] = num(to.site.input[id]) + a;
        } else if (to.kind === 'rival') {
          const c = a * to.dir.pct * (P[id]?.p || 0);
          cin += c; g.ledger.in.players += c;
          const k = `o|${to.uid}|${to.id}|${id}`;
          const tr = transfers[k] || (transfers[k] = { kind: 'ore', uid: to.uid, siteId: to.id, oreId: id, amount: 0, coin: 0, from: g.uid });
          tr.amount += a; tr.coin += c;
        }
      }
    }

    // refineries turn raw ore into refined goods
    const ex = exSite(g);
    for (const s of g.sites) {
      if (s.kind !== 'refinery' || !live(s)) continue;
      const input = s.input || {};
      const tot = Object.values(input).reduce((a, b) => a + b, 0);
      if (tot <= 1e-9) continue;
      const rs = refineryStats(g, s, t);
      const proc = Math.min(tot, rs.thru / 60);
      if (proc <= 0) continue;
      for (const [id, amt] of Object.entries(input)) {
        const a = proc * (amt / tot);
        input[id] -= a;
        if (input[id] < 1e-9) delete input[id];
        const u = a * rs.yield;
        made[id] = num(made[id]) + u;
        g.stats.refined += u;
        if (ex) ex.stock[id] = num(ex.stock[id]) + u;
        else { const c = u * (P[id]?.p || 0) * G.guildExchange * trade; cin += c; g.ledger.in.guild += c; sales[id] = num(sales[id]) + u; g.stats.sold += u; }
      }
    }

    // the exchange fills contracts, then sells the rest on the spot market
    if (ex && ES) {
      for (const c of g.contracts) {
        if (c.done || t < c.start) continue;
        const left = c.qty - c.delivered, have = num(ex.stock[c.oreId]);
        if (left <= 1e-9 || have <= 1e-9) continue;
        const d = Math.min(left, have, (c.qty / ((c.due - c.start) / MIN)) * 3);
        ex.stock[c.oreId] = have - d;
        c.delivered += d;
        const pay = d * c.price * trade;
        c.paid += pay; cin += pay; g.ledger.in.contract += pay; sales[c.oreId] = num(sales[c.oreId]) + d; g.stats.sold += d;
        if (c.delivered >= c.qty - 1e-6) {
          c.delivered = c.qty; c.done = true;
          const b = g.buyers[c.buyerId] || (g.buyers[c.buyerId] = { met: t, deals: 0, defaults: 0, walked: 0 });
          b.deals++; g.stats.deals++;
          const party = (world.parties || []).find((p) => p.id === c.buyerId) || { name: 'A buyer' };
          emit('contract', `${party.name}: contract filled. ${Math.round(c.paid)} coin paid.`, { contractId: c.id });
        }
      }
      let total = Object.values(ex.stock).reduce((a, b) => a + b, 0);
      for (const [id, amt] of Object.entries(ex.stock)) {
        const reserve = g.contracts.filter((c) => !c.done && c.oreId === id).reduce((a, c) => a + c.qty - c.delivered, 0);
        let sell = 0;
        if (ex.spot[id] !== false) sell = Math.max(0, amt - reserve);
        else if (total > ES.store) sell = Math.min(amt, total - ES.store);
        if (sell <= 1e-9) continue;
        const price = (ex.spot[id] !== false ? ES.spot : G.guildExchange) * (P[id]?.p || 0) * trade;
        ex.stock[id] = amt - sell; total -= sell;
        if (ex.stock[id] < 1e-9) delete ex.stock[id];
        const c = sell * price; cin += c; g.ledger.in.spot += c; sales[id] = num(sales[id]) + sell; g.stats.sold += sell;
      }
    }

    // running costs, wages and research
    const crewTot = g.sites.reduce((a, s) => a + num(s.crew), 0) + L.pool;
    const wages = (crewTot * wage(g)) / 60;
    cout += ctx.upkeep / 60 + wages; g.ledger.out.upkeep += ctx.upkeep / 60; g.ledger.out.wages += wages;
    g.rp += ctx.rp / 60;

    g.coin += cin - cout;
    g.earned += cin; g.runEarned += cin; g.monthEarned += cin;
    const k = 1 / 120;
    g.ema.in += (cin * 60 - g.ema.in) * k;
    g.ema.out += (cout * 60 - g.ema.out) * k;
    for (const id of new Set([...Object.keys(g.rate), ...Object.keys(made)])) {
      g.rate[id] = num(g.rate[id]) + (num(made[id]) * 60 - num(g.rate[id])) * (1 / 180);
      if (g.rate[id] < 1e-4 && !made[id]) delete g.rate[id];
    }
    if (dirty || m % 15 === 0) ctx = derive(); // staffing and morale move output; refresh the route and rate picture
  }
  delete g.workerWord;
  return { guild: g, events, sales, transfers: Object.values(transfers) };
}
const PRIO = { hub: 0, mine: 1, refinery: 2, exchange: 3, lab: 4, air: 5 };

function addOre(g, world, s, id, amt, O, emit) {
  s.stock[id] = num(s.stock[id]) + amt;
  g.stats.mined += amt;
  if (O[id].tier !== 'common') {
    const res = reserveOf(world, s, id, g), before = num(s.dug[id]);
    s.dug[id] = before + amt;
    if (before < res * 0.8 && s.dug[id] >= res * 0.8) emit('vein', line('low', { site: s.name, ore: O[id].name }, s.id + id), { siteId: s.id, oreId: id });
    if (before < res * 0.999 && s.dug[id] >= res * 0.999) emit('vein', line('dry', { site: s.name, ore: O[id].name }, s.id + id), { siteId: s.id, oreId: id });
  }
}

function upkeepOf(g) {
  let u = 0;
  for (const s of g.sites) {
    if (!live(s)) continue;
    if (s.kind === 'hub') u += G.hubUpkeep;
    else if (s.kind === 'exchange') u += G.exchange.upkeep;
    else u += G.build[s.kind]?.upkeep || 0;
  }
  for (const sh of g.ships) u += G.ships[sh.cls].upkeep;
  return u;
}

/* ---------- freight jobs ---------- */

function refreshJobs(g, world, t, P) {
  g.jobs = g.jobs.filter((j) => !j.done && (j.taken || j.due > t)).filter((j) => j.due > t || j.taken);
  for (const j of g.jobs) if (j.taken && j.due <= t && !j.done) { j.done = true; j.expired = true; }
  g.jobs = g.jobs.filter((j) => !(j.done && t - j.due > DAY));
  const camps = npcCamps(world.planet), npcs = npcRefineries(world.planet);
  if (!camps.length || !npcs.length) return;
  while (g.jobs.filter((j) => !j.taken && !j.done).length < G.jobs.open) {
    const k = g.jobN++;
    const c = camps[Math.floor(roll(g.seed, 'jobC', k) * camps.length)];
    const n = npcs[Math.floor(roll(g.seed, 'jobN', k) * npcs.length)];
    const ids = Object.keys(c.mix);
    const oreId = ids[Math.floor(roll(g.seed, 'jobO', k) * ids.length)] || ores(world)[0].id;
    const d = dist(c, n);
    const qty = Math.round(between(roll(g.seed, 'jobQ', k), G.jobs.qty));
    const rate = r2((P[oreId]?.p || 1) * G.jobs.pay + d * G.jobs.perUnit);
    g.jobs.push({ id: 'j' + k, from: c.id, to: n.id, oreId, qty, rate, due: t + between(roll(g.seed, 'jobH', k), G.jobs.hours) * HOUR, delivered: 0, taken: false, done: false });
  }
}

/* ---------- surveys ---------- */

const anchorsOf = (g) => hubsOf(g);
export function surveyCost(g, x, y) {
  const hubs = anchorsOf(g);
  const d = hubs.length ? Math.min(...hubs.map((h) => dist(h, { x, y }))) : 0;
  return { cost: Math.round(G.drone.cost + G.drone.perUnit * d), hours: d / (G.drone.speed * (1 + T(g, 'speed') * 0.5)) + G.drone.scanHours, d };
}

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
  return { region: info.region, terrain: info.terrain, climate: info.climate, branch: branchOf(info.terrain), soil: gr.soil >= 1.15 ? 'hard' : gr.soil <= 0.85 ? 'soft' : 'average', tough: gr.tough, ores: list, precision: prec, headline };
}

/* ---------- founding far away ---------- */

export function foundQuote(g, kind, x, y) {
  const hubs = anchorsOf(g);
  const d = hubs.length ? Math.min(...hubs.map((h) => dist(h, { x, y }))) : 0;
  const extra = Math.max(0, d - G.far.free) / G.far.per * (1 + T(g, 'far'));
  const base = G.build[kind]?.cost || 0;
  return { cost: Math.round(base * (1 + extra)), hours: G.far.setup + d / G.far.speed, d, mult: 1 + extra };
}

export function canBuildAt(g, world, kind, x, y) {
  if (!KINDS.includes(kind)) return 'Unknown operation';
  const ok = spotOK(world.planet, x, y, []);
  if (!ok.ok) return ok.reason === 'water' ? 'That is water' : 'Not a buildable spot';
  if (g.sites.some((s) => s.kind !== 'exchange' && dist(s, { x, y }) < G.siteGap)) return 'Too close to one of your operations';
  if ((world.sites || []).some((s) => s.uid !== g.uid && s.kind !== 'exchange' && dist(s, { x, y }) < G.rivalGap)) return 'Too close to another guild';
  if ([...npcRefineries(world.planet), ...npcCamps(world.planet)].some((s) => dist(s, { x, y }) < G.rivalGap)) return 'Too close to a contractor';
  if (g.sites.length >= G.maxSites) return 'The Guild charter limits you to ' + G.maxSites + ' operations';
  return null;
}

/* ---------- commands ---------- */

function pay(g, amount, bucket) {
  if (g.coin < amount) return false;
  g.coin -= amount; g.ledger.out[bucket] += amount;
  return true;
}
export const branchesOpen = (g) => {
  const open = new Set(['core']);
  for (const s of g.sites) if (s.kind === 'lab' && live(s) && s.terrain) open.add(branchOf(s.terrain));
  return open;
};

export function applyCommand(g0, world, cmd, now) {
  const adv = advance(g0, world, now);
  const g = adv.guild;
  const t = g.t;
  const ev = [];
  const out = (e) => ({ ...adv, guild: g, events: [...adv.events, ...ev], error: e || null });
  if (!cmd || typeof cmd.type !== 'string') return out('Bad command');
  const site = (id) => g.sites.find((s) => s.id === id);
  const say = (kind, text, data) => { logIt(g, t, kind, text, data); ev.push({ type: kind, text, at: t, data }); };

  switch (cmd.type) {
    case 'build': {
      const x = Math.round(Number(cmd.x)), y = Math.round(Number(cmd.y));
      const why = canBuildAt(g, world, cmd.kind, x, y);
      if (why) return out(why);
      const q = foundQuote(g, cmd.kind, x, y);
      if (!pay(g, q.cost, 'build')) return out('Not enough coin');
      const info = spotInfo(world.planet, x, y);
      const id = nid(g, cmd.kind[0]);
      const s = siteBase(g, world, cmd.kind, id, x, y, cleanName(cmd.name, siteName(cmd.kind, info.region, g.seed + id)));
      s.level = 0; s.arrive = { at: t, doneAt: t + q.hours * HOUR };
      g.sites.push(s);
      say('build', `${s.name}: crews and supplies are on the way.`, { siteId: id });
      return out();
    }
    case 'part': {
      const s = site(cmd.siteId);
      if (!s || !live(s)) return out('No such operation (or it is still on the way)');
      const cost = partCost(s, cmd.part);
      if (cost == null) return out('That part is maxed out');
      if (!pay(g, cost, 'parts')) return out('Not enough coin');
      s.parts[cmd.part] = lv(s, cmd.part) + 1;
      say('part', `${s.name}: new ${PARTS[s.kind][cmd.part].label.toLowerCase()} installed (level ${s.parts[cmd.part]}).`, { siteId: s.id, part: cmd.part });
      return out();
    }
    case 'demolish': {
      const s = site(cmd.siteId);
      if (!s || s.kind === 'hub' || s.id === 'pit') return out('You cannot abandon that');
      g.labor.pool += num(s.crew);
      g.sites = g.sites.filter((x) => x !== s);
      g.decisions = g.decisions.filter((d) => d.siteId !== s.id);
      const gone = g.routes.filter((r) => (r.from.kind === 'site' && r.from.id === s.id) || (r.to.kind === 'site' && r.to.id === s.id)).map((r) => r.id);
      g.routes = g.routes.filter((r) => !gone.includes(r.id));
      for (const sh of g.ships) if (gone.includes(sh.routeId)) sh.routeId = null;
      say('demolish', `${s.name} was abandoned. The hole will be someone else's problem.`);
      return out();
    }
    case 'setShift': {
      const s = site(cmd.siteId);
      if (!s || (s.kind !== 'mine' && s.kind !== 'refinery')) return out('Shift orders are for mines and refineries');
      if (!G.shifts[cmd.shift]) return out('Bad shift');
      s.shift = cmd.shift;
      return out();
    }
    case 'blast': {
      const s = site(cmd.siteId);
      if (!s || s.kind !== 'mine' || !live(s)) return out('No such mine');
      if (halted(s, t)) return out('The mine is stopped');
      if (s.blastAt != null && t < s.blastAt + G.mine.blast.cooldown * HOUR) return out('The dust has not settled yet');
      const ms = mineStats(g, s, t);
      if (!(ms.digMax > 0)) return out('Nobody is down there to light the fuse');
      s.blastAt = t; g.stats.blasts++;
      const rock = ms.digMax * G.mine.blast.hours * (1 + T(g, 'blast'));
      const rates = mineRates(g, world, s, t, rock);
      let room = ms.store - Object.values(s.stock).reduce((a, b) => a + b, 0), got = 0;
      const O = oreById(world);
      for (const [id, r] of Object.entries(rates)) { const a = Math.min(r, Math.max(0, room)); if (a <= 0) continue; room -= a; got += a; addOre(g, world, s, id, a, O, say); }
      s.morale = clamp(num(s.morale) + G.mine.blast.morale, 0, 100);
      const cave = G.mine.blast.cave * Math.pow(G.mine.safety, lv(s, 'safety')) * (has(g, 'r2') ? 0.5 : 1);
      say('blast', got >= 1 ? line('blast', { site: s.name, t: Math.round(got) }, `${s.id}${t}`) : line('blastFull', { site: s.name }, `${s.id}${t}`), { siteId: s.id, got });
      if (roll(g.seed, 'blastCave', s.id, t) < cave) {
        g.stats.incidents++;
        openDecision(g, s, 'cavein', t, Math.max(1, Math.min(num(s.crew), Math.round(between(roll(g.seed, 'blastN', s.id, t), G.incident.trapped)))), say);
      }
      return out();
    }
    case 'decide': {
      const d = g.decisions.find((x) => x.id === cmd.decisionId);
      if (!d) return out('Already settled');
      const ok = { cavein: ['rescue', 'seal'], strike: ['bonus', 'wait'] }[d.kind];
      if (!ok.includes(cmd.choice)) return out('Bad choice');
      if ((cmd.choice === 'rescue' || cmd.choice === 'bonus') && g.coin < d.cost) return out('Not enough coin');
      settleDecision(g, d, cmd.choice, t, say);
      return out();
    }
    case 'setPolicy': {
      if (cmd.incident && ['rescue', 'seal'].includes(cmd.incident)) g.policy.incident = cmd.incident;
      if (cmd.strike && ['bonus', 'wait'].includes(cmd.strike)) g.policy.strike = cmd.strike;
      return out();
    }
    case 'setMine': {
      const s = site(cmd.siteId);
      if (!s || s.kind !== 'mine') return out('No such mine');
      if (cmd.focus !== undefined) { if (cmd.focus && !world.planet.ores.some((o) => o.id === cmd.focus)) return out('Bad ore'); s.focus = cmd.focus || null; }
      return out();
    }
    case 'setGate': {
      const s = site(cmd.siteId);
      if (!s || s.kind !== 'mine') return out('No such mine');
      s.gate = s.gate || { on: false, pct: G.gate.pct };
      if (cmd.on != null) s.gate.on = !!cmd.on;
      if (cmd.pct != null) s.gate.pct = r2(clamp(Number(cmd.pct) || G.gate.pct, G.gate.min, G.gate.max));
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
    case 'setCrew': {
      const s = site(cmd.siteId);
      if (!s) return out('No such operation');
      s.crewCap = cmd.max == null || cmd.max === '' ? null : clamp(Math.round(Number(cmd.max)), 0, 999);
      return out();
    }
    case 'hire': {
      const n = Math.floor(Number(cmd.n));
      if (!(n > 0)) return out('How many?');
      if (g.labor.inbound.length >= 3) return out('Three shuttles are already on the way');
      const room = poolCap(g) - g.labor.pool - g.labor.inbound.reduce((a, s) => a + s.n, 0);
      const k = Math.min(n, Math.floor(shuttleSize(g)), room);
      if (k <= 0) return out('No room in the bunks');
      if (!pay(g, k * workerPrice(g), 'workers')) return out('Not enough coin');
      g.labor.hired += k;
      const last = g.labor.inbound[g.labor.inbound.length - 1];
      g.labor.inbound.push({ n: k, at: t, doneAt: Math.max(last ? last.doneAt : 0, t) + shuttleHours(g) * HOUR });
      say('hire', `${k} ${flavorOf(world.planet).worker} booked on the next shuttle.`);
      return out();
    }
    case 'setLabor': {
      if (cmd.reserve != null) g.labor.reserve = clamp(Math.round(Number(cmd.reserve)) || 0, 0, 200);
      if (cmd.auto != null) g.labor.auto = !!cmd.auto;
      return out();
    }
    case 'buyShip': {
      const cls = cmd.cls;
      if (!G.ships[cls]) return out('Unknown ship');
      if (G.ships[cls].tech && !has(g, G.ships[cls].tech)) return out('Needs ' + NODES[G.ships[cls].tech].label);
      if (g.ships.length >= hangar(g)) return out('Hangars are full');
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
      // { from: { kind: 'site'|'camp'|'gate', id, uid? } | mineId, to: { kind: 'npc'|'site'|'rival', id, uid? }, cargo?, shipId?, job? }
      const fromArg = typeof cmd.from === 'string' ? { kind: 'site', id: cmd.from } : cmd.from;
      const from = placeOf(g, world, fromArg);
      if (!from) return out('Unknown pickup');
      if (from.kind === 'site' && from.site.kind !== 'mine') return out('Ships pick up ore at mines, camps or other guilds\' gates');
      if (from.kind === 'gate' && from.uid === g.uid) return out('That is your own mine');
      const to = placeOf(g, world, cmd.to);
      if (!to) return out('Unknown destination');
      if (!['npc', 'site', 'rival'].includes(to.kind) || (to.kind === 'site' && to.site.kind !== 'refinery')) return out('Ships deliver to refineries');
      if (to.kind === 'rival' && to.uid === g.uid) return out('That is your own refinery');
      if (g.routes.length >= 30) return out('Too many routes');
      let job = null;
      if (cmd.job) {
        job = g.jobs.find((j) => j.id === cmd.job && !j.taken && !j.done);
        if (!job) return out('That job is gone');
        if (from.kind !== 'camp' || from.id !== job.from || to.kind !== 'npc' || to.id !== job.to) return out('That is not the job\'s route');
        job.taken = true;
      }
      const cargo = !job && cmd.cargo && world.planet.ores.some((o) => o.id === cmd.cargo) ? cmd.cargo : 'all';
      const r = { id: nid(g, 'r'), from: { kind: from.kind, id: from.id, ...(from.uid ? { uid: from.uid } : {}) }, to: { kind: to.kind, id: to.id, ...(to.uid ? { uid: to.uid } : {}) }, cargo, ...(job ? { job: job.id } : {}), name: `${from.name} → ${to.name}`.slice(0, 60) };
      g.routes.push(r);
      const ids = Array.isArray(cmd.shipIds) ? cmd.shipIds : cmd.shipId ? [cmd.shipId] : [];
      for (const id of ids) { const sh = g.ships.find((s) => s.id === id); if (sh) sh.routeId = r.id; }
      say('route', `New route: ${r.name}.`, { routeId: r.id });
      return out();
    }
    case 'setRoute': {
      const r = g.routes.find((x) => x.id === cmd.routeId);
      if (!r) return out('No such route');
      if (cmd.cargo && !r.job) r.cargo = cmd.cargo === 'all' || world.planet.ores.some((o) => o.id === cmd.cargo) ? cmd.cargo : r.cargo;
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
    case 'unlock': {
      const N = NODES[cmd.node];
      if (!N) return out('Unknown research');
      if (has(g, cmd.node)) return out('Already known');
      if (!branchesOpen(g).has(N.b)) return out(`${BRANCHES[N.b].label} research needs a research hub in ${BRANCHES[N.b].where}`);
      if (N.needs && !has(g, N.needs)) return out('Needs ' + NODES[N.needs].label);
      if (g.rp < N.rp) return out('Not enough research points');
      g.rp -= N.rp; g.tree[cmd.node] = t || 1;
      say('tech', `Research complete: ${N.label}. ${N.text}`);
      return out();
    }
    case 'buildExchange': {
      if (g.sites.some((s) => s.kind === 'exchange')) return out('You already have an exchange');
      if (dayOf(world, t) < G.exchange.day) return out(`The Guild licenses exchanges from day ${G.exchange.day}`);
      if (!g.sites.some((s) => s.kind === 'refinery' && live(s))) return out('You need a working refinery first');
      if (!pay(g, G.exchange.cost, 'build')) return out('Not enough coin');
      const h = hubSite(g);
      const s = siteBase(g, world, 'exchange', 'exchange', h.x, h.y, 'Galactic Exchange');
      s.level = 0; s.arrive = { at: t, doneAt: t + G.exchange.hours * HOUR };
      g.sites.push(s);
      say('build', 'Your Galactic Exchange is being assembled in orbit.');
      return out();
    }
    case 'setSpot': {
      const ex = g.sites.find((s) => s.kind === 'exchange');
      if (!ex) return out('No exchange');
      if (!world.planet.ores.some((o) => o.id === cmd.oreId)) return out('Bad ore');
      ex.spot[cmd.oreId] = !!cmd.on;
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
        if (r.status === 'walked') { g.offers.splice(i, 1); b.walked++; say('offer', `${party.name} walked away.`, { offerId: of.id }); }
        else if (r.status === 'accepted') { g.offers.splice(i, 1); g.contracts.push(contractFrom(r.offer, t)); say('contract', `Signed with ${party.name} at ${r.offer.price}.`); }
        else g.offers[i] = r.offer;
        ev.push({ type: 'haggle', status: r.status, offer: { ...r.offer, max: undefined }, at: t });
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
      const lost = g.sites.reduce((a, s) => a + num(s.crew), 0) + g.labor.pool;
      g.sp += spectacle; g.nukes += 1; g.stats.deaths += lost; g.labor.dead += lost;
      g.lastNuke = { at: t, spectacle, runEarned: g.runEarned };
      g.sites = []; g.ships = []; g.routes = []; g.tree = {}; g.rp = 0; g.decisions = [];
      g.offers = []; g.contracts = []; g.offerAt = null; g.rate = {}; g.labor.inbound = [];
      g.jobs = g.jobs.filter((j) => !j.taken);
      g.coin = G.startCoin; g.runEarned = 0;
      setupBase(g, world);
      say('nuke', `☢ You nuked your own operation for ${spectacle.toFixed(1)} Spectacle. ${lost} ${flavorOf(world.planet).worker} were not consulted. The Maker felt it.`, { spectacle });
      return out();
    }
    case 'evolve': {
      const E = G.evo[cmd.kind];
      if (!E) return out('Unknown evolution');
      const l = num(g.evo[cmd.kind]);
      if (l >= G.evoMax) return out('Maxed');
      const cost = evoCost(g, cmd.kind);
      if (g.sp < cost) return out('Not enough SP');
      g.sp -= cost; g.evo[cmd.kind] = l + 1;
      return out();
    }
    default:
      return out('Unknown command');
  }
}
export const evoCost = (g, kind) => Math.round(G.evo[kind].cost * Math.pow(G.evo[kind].growth, num(g.evo[kind])) * 10) / 10;

/* ---------- migration from Guild 1 (v1) ---------- */

export function migrate(g1, world, now) {
  if (!g1 || g1.v !== 1) return g1;
  const g = newGuild({ uid: g1.uid, name: g1.name, species: g1.species, world, x: g1.landing.x, y: g1.landing.y, now: g1.t });
  Object.assign(g, {
    coin: g1.coin, earned: g1.earned, runEarned: g1.runEarned, monthEarned: g1.monthEarned, sp: g1.sp, evo: g1.evo, nukes: g1.nukes, lastNuke: g1.lastNuke,
    surveys: g1.surveys || [], offers: g1.offers || [], contracts: g1.contracts || [], buyers: g1.buyers || {}, offerN: g1.offerN || 0,
    stats: { ...g.stats, ...g1.stats }, ledger: { in: { ...g.ledger.in, ...g1.ledger.in }, out: { ...g.ledger.out, ...g1.ledger.out } }, log: g1.log || [], nextId: Math.max(g.nextId, g1.nextId || 1),
  });
  g.rp = num(g1.rp) + Object.keys(g1.tech || {}).length * 80; // old research comes back as points for the new tree
  g.sites = [];
  for (const s of g1.sites) {
    const L = Math.max(1, s.level || 1);
    const ns = siteBase(g, world, s.kind, s.id, s.x, s.y, s.name);
    if (s.kind === 'mine') { Object.assign(ns.parts, { shaft: Math.min(8, L), haul: L, yard: L }); Object.assign(ns, { stock: s.stock || {}, dug: s.dug || {}, focus: s.focus || null }); }
    if (s.kind === 'refinery') { Object.assign(ns.parts, { vat: L, belt: L, silo: L }); Object.assign(ns, { input: s.input || {}, buy: s.buy || ns.buy }); }
    if (s.kind === 'hub') Object.assign(ns.parts, { bunks: L, hangar: L * 2, office: L });
    if (s.kind === 'lab') Object.assign(ns.parts, { desk: L * 2 });
    if (s.level < 1 && s.build) { ns.level = 0; ns.arrive = { at: s.build.at || g1.t, doneAt: s.build.doneAt }; }
    ns.crew = crewNeed(ns);
    g.sites.push(ns);
  }
  if (g1.exchange) {
    const h = g.sites.find((s) => s.kind === 'hub');
    const ex = siteBase(g, world, 'exchange', 'exchange', h.x, h.y, 'Galactic Exchange');
    ex.parts.docks = ex.parts.floor = Math.max(1, g1.exchange.level || 1);
    ex.stock = g1.exchange.stock || {}; ex.spot = g1.exchange.spot || {};
    if (g1.exchange.level < 1 && g1.exchange.build) { ex.level = 0; ex.arrive = { at: g1.t, doneAt: g1.exchange.build.doneAt }; }
    ex.crew = crewNeed(ex);
    g.sites.push(ex);
  }
  g.ships = g1.ships || [];
  g.routes = (g1.routes || []).map((r) => ({ ...r, from: typeof r.from === 'string' ? { kind: 'site', id: r.from } : r.from }));
  g.labor.pool = G.labor.reserve;
  logIt(g, g.t, 'land', 'The Guild reorganised your operation: levels became parts, and a labor company now ships your crews in. Your research came back as points.');
  return g;
}

/* ---------- view: everything the UI shows, derived ---------- */

function partsView(g, s) {
  return Object.entries(PARTS[s.kind] || {}).map(([id, P]) => ({ id, label: P.label, text: P.text, level: lv(s, id), max: P.max, crew: P.crew || 0, cost: partCost(s, id) }));
}

export function view(g, world, now) {
  const t = now ?? g.t;
  const P = marketPrices(world, t);
  const O = oreById(world);
  const routes = g.routes.map((r) => routeInfo(g, world, r));
  const inflow = {}, outflow = {};
  for (const ri of routes) if (ri.ok) {
    if (ri.to?.kind === 'site') inflow[ri.to.id] = num(inflow[ri.to.id]) + ri.tph;
    if (ri.from?.kind === 'site') outflow[ri.from.id] = num(outflow[ri.from.id]) + ri.tph;
  }
  const ES = exStats(g);
  const sites = g.sites.map((s) => {
    const v = { id: s.id, kind: s.kind, name: s.name, x: s.x, y: s.y, level: s.level, arrive: s.arrive || null, region: s.region, terrain: s.terrain,
      parts: partsView(g, s), crew: num(s.crew), need: crewNeed(s), crewCap: s.crewCap ?? null, staff: staffing(s), morale: Math.round(num(s.morale, 60)), shift: s.shift || 'normal',
      decision: s.decision || null, halted: s.haltUntil && t < s.haltUntil ? s.haltUntil : null, flags: [] };
    if (v.decision) v.flags.push('decision');
    if (live(s) && v.need && v.staff < 0.999) v.flags.push('staff');
    if (s.kind === 'mine') {
      const ms = mineStats(g, s, t);
      const rates = mineRates(g, world, s, t, ms.rock);
      Object.assign(v, { dig: ms.digMax, haul: ms.haul, rock: ms.rock, rates, tph: Object.values(rates).reduce((a, b) => a + b, 0), store: ms.store, stock: s.stock, focus: s.focus, gate: s.gate, blastReady: s.blastAt == null ? 0 : s.blastAt + G.mine.blast.cooldown * HOUR, terrain: s.terrain });
      v.stockTot = Object.values(s.stock || {}).reduce((a, b) => a + b, 0);
      v.full = v.store > 0 && v.stockTot >= v.store - 0.01;
      v.shipping = outflow[s.id] || 0;
      v.value = Object.entries(rates).reduce((a, [id, r]) => a + r * (P[id]?.p || 0), 0);
      v.veins = {};
      for (const id of Object.keys(s.ground?.richness || {})) if (O[id] && O[id].tier !== 'common' && (s.dug?.[id] || rates[id])) v.veins[id] = { left: Math.max(0, 1 - num(s.dug?.[id]) / reserveOf(world, s, id, g)) };
      v.blocked = Object.keys(s.ground?.richness || {}).filter((id) => O[id] && O[id].hardness > drillLevel(g) && s.ground.richness[id] > 0);
      v.found = Object.keys(s.ground?.richness || {}).filter((id) => O[id] && s.ground.richness[id] > 0);
      if (v.full) v.flags.push('full');
      if (ms.digMax > ms.haul * 1.02 && live(s)) v.flags.push('haul');
      if (v.halted) v.flags.push('halt');
    }
    if (s.kind === 'refinery') {
      const rs = refineryStats(g, s, t);
      Object.assign(v, rs, { input: s.input || {}, inflow: inflow[s.id] || 0, buy: s.buy });
      v.inputTot = Object.values(v.input).reduce((a, b) => a + b, 0);
      v.room = Math.max(0, rs.thru - v.inflow);
      if (v.inputTot >= rs.store - 0.5) v.flags.push('full');
    }
    if (s.kind === 'lab') { v.branch = branchOf(s.terrain); v.rpH = lv(s, 'desk') * G.lab.rpPerDesk * staffing(s) * (1 + G.lab.gear * lv(s, 'gear')) * (1 + T(g, 'rp')); }
    if (s.kind === 'hub') { v.rpH = lv(s, 'office') * 2 * G.hub.rpPerClerk * staffing(s) * (1 + T(g, 'rp')); v.hangar = hangar(g); v.poolCap = poolCap(g); }
    if (s.kind === 'air') v.hangarAdd = G.air.hangar * lv(s, 'hangar');
    if (s.kind === 'exchange' && ES) Object.assign(v, { stock: s.stock, spot: s.spot, ...ES });
    return v;
  });
  const offers = g.offers.map((o) => { const { max, ...rest } = o; return { ...rest, tell: has(g, 'x2') ? tell(o) : null, market: P[o.oreId]?.p }; });
  const met = Object.entries(g.buyers).map(([id, b]) => {
    const p = (world.parties || []).find((x) => x.id === id) || { id, name: 'Unknown' };
    const lvl = b.deals >= 3 ? 3 : b.deals >= 1 ? 2 : 1;
    const wants = lvl >= 2 ? Object.entries(p.wants || {}).filter(([, w]) => w >= 0.5).sort((a, c) => c[1] - a[1]).map(([id2]) => id2) : null;
    return { id, name: p.name, type: p.type, personality: p.personality, blurb: p.blurb, backstory: lvl >= 2 ? p.backstory : null, voice: p.voice, quirk: lvl >= 3 ? p.quirk : null, wants, level: lvl, ...b, premium: lvl >= 3 ? Math.round((0.95 + (clamp(Number(p.ref) || 1.1, 0.8, 1.6) - 0.8) * 0.44 - 1) * 100) : null };
  });
  const F = flavorOf(world.planet);
  const crewTot = g.sites.reduce((a, s) => a + num(s.crew), 0);
  return {
    t, day: dayOf(world, t), coin: g.coin, sp: g.sp, rp: g.rp, rpH: rpOf(g), upkeepH: upkeepOf(g), wagesH: (crewTot + g.labor.pool) * wage(g),
    incomeH: g.ema.in, netH: g.ema.in - g.ema.out, prices: P, sites, routes: routes.map((r) => ({ ...r, from: r.from && { kind: r.from.kind, id: r.from.id, uid: r.from.uid, name: r.from.name, x: r.from.x, y: r.from.y }, to: r.to && { kind: r.to.kind, id: r.to.id, uid: r.to.uid, name: r.to.name, x: r.to.x, y: r.to.y } })),
    ships: g.ships.map((s) => ({ ...s, ...shipStats(g, s.cls) })), hangar: hangar(g), drones: droneCount(g), flying: g.surveys.filter((s) => s.status === 'flying').length,
    drill: drillLevel(g), offers, contracts: g.contracts, buyers: met, decisions: g.decisions, jobs: g.jobs,
    labor: { ...g.labor, crew: crewTot, cap: poolCap(g), shuttle: shuttleSize(g), shuttleH: shuttleHours(g), price: workerPrice(g), wage: wage(g), company: F.labor, word: F.worker },
    tree: g.tree, branches: [...branchesOpen(g)], lic: { exchange: dayOf(world, t) >= G.exchange.day },
    nukeReady: g.runEarned >= G.nukeMin, spectacleNow: G.spectacle(g.runEarned, g.evo.spectacle),
    shipCosts: Object.fromEntries(Object.keys(G.ships).map((c) => [c, shipCost(g, c)])),
    evoCosts: Object.fromEntries(Object.keys(G.evo).map((k) => [k, evoCost(g, k)])),
    npcPrices: Object.fromEntries(npcRefineries(world.planet).map((n) => [n.id, Object.fromEntries(Object.keys(P).map((id) => [id, npcPrice(n, id, P) * evoMult(g, 'trade')]))])),
    trade: evoMult(g, 'trade'), exchangeStats: ES, policy: g.policy,
  };
}
