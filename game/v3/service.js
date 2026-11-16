// The guild game, server side. Guilds are authoritative here; clients send commands and get back a view.
// One queue for every mutation keeps guild saves, transfers between guilds and the shared market consistent.
//
// Storage (server-only collections): world3/current (public market state), buyers3/current (secret buyer numbers), col3/<uid>, board3/<uid>, feed3/<id>, hall3/<month>, stats3/<uid>,
// hist3/<uid>, phist3/current, maker3/<uid>.
// The month's planet and buyers come from the v2 world (one planet per month, one AI build); this service adds the
// guild market (flows, changes, directory of refineries) and buyer dossiers.
import crypto from 'node:crypto';
import * as GG from '../shared/guild/index.js';
import { startSpot, planetSummary } from '../shared/planet/index.js';
import { createMaker } from '../v2/maker.js';
import { createEvents } from '../v2/events.js';

export const SUB_COLLS3 = new Set(['board3', 'feed3', 'world3']);
const G = GG.GUILD_TUNING;
const fail = (status, code, message) => Object.assign(new Error(message), { status, code, expose: true });

export function createV3({ store, ai, currentModel, broadcast, v2, now: clock = () => Date.now() }) {
  let chain = Promise.resolve();
  const queue = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  let cache = null;

  /* ---------- world ---------- */

  async function buildDossiers(w2) {
    let parties = (w2.parties || []).map((p) => ({ ...p, ...GG.dossierFor(p, w2.planet) }));
    const model = ai && await currentModel();
    if (model && parties.length) {
      try { parties = GG.applyDossiers(parties, await ai.json(model, GG.dossiersPrompt(w2.planet, parties), 'quick')); }
      catch (e) { console.error('Buyer dossier AI failed:', e.message); }
    }
    return parties;
  }

  // Themed names for the month (contractors, prospector camps, the labor company). One AI call, or the theme's words.
  async function buildFlavor(planet) {
    const model = ai && await currentModel();
    if (!model) return null;
    try { return GG.cleanFlavor(await ai.json(model, GG.flavorPrompt(planet), 'quick')); }
    catch (e) { console.error('Flavor AI failed:', e.message); return null; }
  }

  // The engine world: planet + parties + this game's market state.
  async function getWorld() {
    const w2 = await v2.getWorld();
    if (cache && cache.month === w2.month && cache.planetId === w2.planet.id) return cache;
    let w3 = await store.getDoc('world3', 'current');
    if (!w3 || w3.month !== w2.month || w3.planetId !== w2.planet.id) {
      if (w3 && w3.month !== w2.month) await recordHall(w3);
      w3 = { v: 3, month: w2.month, planetId: w2.planet.id, flow: {}, changes: [], directory: [], gates: [], sites: [], flavor: await buildFlavor(w2.planet), created: clock() };
      await store.setDoc('buyers3', 'current', { month: w2.month, parties: await buildDossiers(w2) });
      await store.setDoc('world3', 'current', w3);
      await addFeed(`The Maker Guild opened ${w2.planet.name} for extraction. ${w2.planet.tagline || ''}`.trim(), 'world', null);
    }
    let buyers = await store.getDoc('buyers3', 'current');
    if (!buyers || buyers.month !== w2.month) { buyers = { month: w2.month, parties: await buildDossiers(w2) }; await store.setDoc('buyers3', 'current', buyers); }
    cache = { ...w3, planet: w3.flavor ? { ...w2.planet, flavor: w3.flavor } : w2.planet, startedAt: w2.startedAt, endsAt: w2.endsAt, parties: buyers.parties };
    return cache;
  }
  async function saveWorld(w) {
    const { planet, startedAt, endsAt, parties, ...rest } = w;
    cache = w;
    await store.setDoc('world3', 'current', rest);
    broadcast('world3', 'current', publicWorldBits(w));
  }
  const publicWorldBits = (w) => ({ month: w.month, changes: w.changes || [], directory: w.directory || [], gates: w.gates || [], sites: w.sites || [], nextEventAt: w.nextEventAt || null });
  function publicWorld(w) {
    const F = GG.flavorOf(w.planet);
    return { ...publicWorldBits(w), planet: w.planet, startedAt: w.startedAt, endsAt: w.endsAt, npc: GG.npcRefineries(w.planet).map(({ bias, cut, ...n }) => n), camps: GG.npcCamps(w.planet), labor: F.labor, worker: F.worker };
  }

  async function addFeed(text, kind, by, t = clock()) {
    const e = { t, by: by || null, text: String(text).slice(0, 240), kind };
    const id = t.toString(36) + crypto.randomBytes(3).toString('hex');
    await store.setDoc('feed3', id, e);
    broadcast('feed3', id, e);
    if (Math.random() < 0.05) store.pruneColl('feed3', 200).catch(() => {});
  }

  async function recordHall(w3) {
    const board = (await store.listColl('board3')).map((d) => d.data).filter((b) => b.month === w3.month).sort((a, b) => b.coin - a.coin);
    const win = board[0];
    const w2planet = cache && cache.month === w3.month ? cache.planet : null;
    await store.setDoc('hall3', w3.month, {
      month: w3.month, planet: w2planet ? w2planet.name : w3.planetId, planetSummary: w2planet ? planetSummary(w2planet) : null,
      winner: win ? win.id : null, winnerName: win ? win.player || win.name : null, guild: win ? win.name : null, coin: win ? win.coin : 0, players: board.length, t: clock(),
    });
    for (const b of board) {
      const s = (await store.getDoc('stats3', b.id)) || { total: 0, months: 0, wins: 0, best: 0 };
      s.total += b.coin; s.months += 1; s.best = Math.max(s.best, b.coin); if (win && win.id === b.id) s.wins += 1;
      s.name = b.player || b.name;
      await store.setDoc('stats3', b.id, s);
    }
    if (win) await addFeed(`${win.player || win.name} won ${w3.month} with ${GG.fmt(win.coin)} coin. The Maker Guild grants them exclusive extraction rights. The planet was not consulted.`, 'win', win.id);
  }

  /* ---------- guilds ---------- */

  async function loadGuild(uid, world) {
    let g = await store.getDoc('col3', uid);
    if (g && g.v === 1 && g.planetId === world.planet.id) { g = GG.migrate(g, world, clock()); await store.setDoc('col3', uid, g); }
    if (!g || g.v !== GG.GUILD_VERSION || g.planetId !== world.planet.id) return null;
    return g;
  }

  // What the client may see: no ground truth, no buyers' hidden top prices.
  function publicGuild(g) {
    const { sites, offers, inbox, seed, ...rest } = g;
    return { ...rest, sites: sites.map(({ ground, dug, ...s }) => s), offers: offers.map(({ max, ...o }) => o) };
  }

  function summary(g, world, player) {
    const v = GG.view(g, world, g.t);
    return { id: g.uid, name: g.name, player, species: g.species, coin: g.coin, netH: v.netH, incomeH: v.incomeH, sites: g.sites.length, ships: g.ships.length, month: world.month, t: g.t, nukes: g.nukes };
  }

  // Public directory entries for one guild: its operations (for spacing and the map) and refineries that buy ore.
  function publish(world, g, player) {
    const v = GG.view(g, world, g.t);
    const color = g.species && g.species.color;
    world.sites = (world.sites || []).filter((s) => s.uid !== g.uid).concat(g.sites.filter((s) => s.kind !== 'exchange').map((s) => ({ uid: g.uid, guild: g.name, player, color, id: s.id, kind: s.kind, name: s.name, x: s.x, y: s.y, level: s.level })));
    world.directory = (world.directory || []).filter((d) => d.uid !== g.uid).concat(v.sites.filter((s) => s.kind === 'refinery' && s.level >= 1).map((s) => ({
      uid: g.uid, guild: g.name, player, color, siteId: s.id, name: s.name, x: s.x, y: s.y, on: !!(s.buy && s.buy.on) && g.coin > 0, pct: s.buy ? s.buy.pct : G.refinery.buyPct, room: Math.round(s.room * 10) / 10,
    })));
    // mines selling at their gate: what they dig beyond what their own ships take
    world.gates = (world.gates || []).filter((d) => d.uid !== g.uid).concat(v.sites.filter((s) => s.kind === 'mine' && s.level >= 1 && s.gate && s.gate.on).map((s) => {
      const tot = s.tph || 0;
      const mix = tot > 0 ? Object.fromEntries(Object.entries(s.rates).map(([id, r]) => [id, Math.round((r / tot) * 1000) / 1000])) : {};
      const spare = Math.max(0, tot - (s.shipping || 0)) + (s.stockTot > 20 ? 10 : 0);
      return { uid: g.uid, guild: g.name, player, color, siteId: s.id, name: s.name, x: s.x, y: s.y, on: spare > 0.1, pct: s.gate.pct, rate: Math.round(spare * 10) / 10, mix };
    }));
  }

  // Advance a guild (and maybe apply a command), fold its sales into the market, hand ore to other guilds, save.
  async function settle(g, world, t, cmd, player) {
    let r = cmd ? GG.applyCommand(g, world, cmd, t) : GG.advance(g, world, t);
    if (cmd && r.error) r = { ...GG.advance(g, world, t), error: r.error };
    const ng = r.guild;
    let worldDirty = false;
    if (r.sales && Object.keys(r.sales).length) { const nw = GG.recordSales(world, r.sales, t); world.flow = nw.flow; worldDirty = true; }
    for (const tr of r.transfers || []) {
      if (tr.uid === ng.uid) continue;
      const other = await store.getDoc('col3', tr.uid);
      if (!other || other.planetId !== world.planet.id) continue;
      other.inbox = (other.inbox || []).concat([{ kind: tr.kind || 'ore', siteId: tr.siteId, oreId: tr.oreId, amount: tr.amount, coin: tr.coin, from: ng.uid }]).slice(-200);
      other.received = (other.received || 0) + tr.coin;
      await store.setDoc('col3', tr.uid, other);
    }
    const mineOf = (w) => JSON.stringify([(w.sites || []).filter((s) => s.uid === ng.uid), (w.directory || []).filter((d) => d.uid === ng.uid), (w.gates || []).filter((d) => d.uid === ng.uid)]);
    const before = mineOf(world);
    publish(world, ng, player);
    if (mineOf(world) !== before) worldDirty = true;
    if (worldDirty) await saveWorld(world);
    await store.setDoc('col3', ng.uid, ng);
    const s = summary(ng, world, player);
    await store.setDoc('board3', ng.uid, s);
    broadcast('board3', ng.uid, s);
    for (const ev of r.events || []) {
      if (ev.type === 'survey' && /MYTHIC/.test(ev.text)) await addFeed(`🌟 ${ng.name}'s drone found mythic ore somewhere. They are being very casual about it.`, 'mythic', ng.uid, t);
      if (ev.type === 'nuke') await addFeed(`☢ ${player || ng.name} nuked their own operation for ${Number(ev.data && ev.data.spectacle || 0).toFixed(1)} Spectacle. The Maker is listening.`, 'nuke', ng.uid, t);
      if (ev.type === 'built' && /Galactic Exchange/.test(ev.text)) await addFeed(`🛰 ${ng.name} opened a Galactic Exchange in orbit. The galaxy is now on speed dial.`, 'exchange', ng.uid, t);
      if (ev.type === 'contract' && ev.data && ev.data.short) await addFeed(`📉 ${ng.name} missed a delivery. A galactic buyer is telling everyone.`, 'default', ng.uid, t);
    }
    return { ...r, guild: ng };
  }

  async function playerName(uid) { const p = await store.players_([uid]); return p[0] && p[0].name; }

  async function stateFor(me, g, world, t, extra = {}) {
    return {
      me: { id: me.id, name: me.name, owner: !!me.owner },
      guild: g ? publicGuild(g) : null, view: g ? GG.view(g, world, t) : null,
      world: publicWorld(world), serverNow: t,
      ...extra,
    };
  }

  // A fair landing spot: as good as anyone's, clear of other guilds, within reach of a Guild contractor refinery.
  function landingSpot(world, uid) {
    const taken = (world.sites || []).map((s) => ({ x: s.x, y: s.y }));
    const hubs = (world.sites || []).filter((s) => s.kind === 'hub');
    const npcs = GG.npcRefineries(world.planet);
    // Prefer room to grow: far from other guilds' hubs, near a contractor. Relax step by step on a crowded planet.
    for (const gap of [300, 240, 180, 120, 0]) {
      for (let k = 0; k < 50; k++) {
        const s = startSpot(world.planet, taken, `${uid}:${world.month}:${gap}:${k}`);
        if (!s) continue;
        if (hubs.some((h) => Math.hypot(h.x - s.x, h.y - s.y) < gap)) continue;
        if (npcs.some((n) => Math.hypot(n.x - s.x, n.y - s.y) <= 230)) return s;
      }
    }
    return startSpot(world.planet, taken, `${uid}:${world.month}`);
  }

  /* ---------- Maker and galactic events (shared with v2's machinery) ---------- */

  const makerStore = { ...store, getDoc: (c, id) => store.getDoc(c === 'maker2' ? 'maker3' : c, id), setDoc: (c, id, d) => store.setDoc(c === 'maker2' ? 'maker3' : c, id, d) };
  const maker = createMaker({ store: makerStore, ai, currentModel, getWorld, saveWorld, addFeed, clock });
  const events = createEvents({ ai, currentModel, getWorld, saveWorld, addFeed, clock });

  return {
    getWorld,

    state: (me) => queue(async () => {
      const t = clock();
      const world = await getWorld();
      let g = await loadGuild(me.id, world);
      if (g) g = (await settle(g, world, t, null, me.name)).guild;
      return stateFor(me, g, world, t);
    }),

    start: (me, body = {}) => queue(async () => {
      const t = clock();
      const world = await getWorld();
      const existing = await loadGuild(me.id, world);
      if (existing) return stateFor(me, existing, world, t);
      const spot = landingSpot(world, me.id);
      if (!spot) throw fail(503, 'no_spot', 'No landing spot left on this planet');
      const sp = body.species && typeof body.species === 'object' ? body.species : {};
      const lib = await import('../shared/species/index.js').catch(() => null);
      const look = lib ? lib.cleanSpecies({ ...sp, name: sp.name || me.name + "'s kin" }) : { name: String(sp.name || me.name + "'s kin").slice(0, 28), color: /^#[0-9a-f]{6}$/i.test(sp.color || '') ? sp.color : '#ff8a3d' };
      const g = GG.newGuild({ uid: me.id, name: String(body.name || look.name + ' Extraction Guild').slice(0, 28), species: look, world, x: spot.x, y: spot.y, now: t });
      const r = await settle(g, world, t, null, me.name);
      await addFeed(`${me.name} landed in ${g.landing.region} as the ${look.name}.`, 'land', me.id, t);
      return stateFor(me, r.guild, world, t, { justLanded: true });
    }),

    command: (me, cmd) => queue(async () => {
      const t = clock();
      const world = await getWorld();
      const g = await loadGuild(me.id, world);
      if (!g) throw fail(409, 'no_colony', 'Land on the planet first');
      if (!cmd || typeof cmd.type !== 'string') throw fail(400, 'invalid_argument', 'Bad command');
      const r = await settle(g, world, t, cmd, me.name);
      return { ...(await stateFor(me, r.guild, world, t)), events: (r.events || []).filter((e) => e.type === 'haggle' || e.at >= t - 60_000), error: r.error || null };
    }),

    // Look inside another guild's operation (watch only).
    peek: (me, uid, siteId) => queue(async () => {
      const world = await getWorld();
      const g = await loadGuild(String(uid || ''), world);
      if (!g) throw fail(404, 'not_found', 'No such guild on this planet');
      const v = GG.view(g, world, g.t);
      const s = v.sites.find((x) => x.id === siteId && x.kind !== 'exchange');
      if (!s) throw fail(404, 'not_found', 'No such operation');
      const { stock, input, buy, gate, ...pub } = s;
      return { guild: { name: g.name, species: g.species, uid: g.uid }, site: { ...pub, stockTot: s.stockTot, inputTot: s.inputTot }, serverNow: clock() };
    }),

    board: () => queue(async () => {
      const world = await getWorld();
      const month = (await store.listColl('board3')).map((d) => d.data).filter((b) => b.month === world.month).sort((a, b) => b.coin - a.coin);
      const allTime = (await store.listColl('stats3')).map((d) => ({ id: d.id, ...d.data, avg: d.data.months ? d.data.total / d.data.months : 0 })).sort((a, b) => b.total - a.total);
      const hall = (await store.listColl('hall3')).map((d) => d.data).sort((a, b) => (a.month < b.month ? 1 : -1));
      return { month, allTime, hall };
    }),

    feed: () => queue(async () => ({ docs: await store.listColl('feed3', { orderBy: 't', desc: true, limit: 60 }) })),

    bulletin: () => queue(async () => {
      const t = clock();
      const world = await getWorld();
      const active = GG.activeChanges(world, t);
      const names = Object.fromEntries((await store.players_(active.map((c) => c.by).filter(Boolean))).map((p) => [p.id, p.name]));
      return { changes: active.map((c) => ({ ...c, byName: c.by ? names[c.by] || 'A General' : null })), nextEventAt: world.nextEventAt || null };
    }),

    maker: (me, body) => queue(async () => {
      const world = await getWorld();
      const g = await loadGuild(me.id, world);
      if (body && body.ask && body.ask.kind === 'buyer') throw fail(400, 'invalid_argument', 'Ask about an ore or all prices');
      return maker.handle(me, g, body || {});
    }),

    history: (me) => queue(async () => {
      const world = await getWorld();
      const mine = await store.getDoc('hist3', me.id);
      const ph = await store.getDoc('phist3', 'current');
      return { me: mine && mine.month === world.month ? mine.points : [], prices: ph && ph.month === world.month ? ph.prices : {} };
    }),

    maybeEvent: () => queue(() => events.maybeEvent()),

    rollIfDue: () => queue(async () => { const w2 = await v2.getWorld(); if (cache && cache.month !== w2.month) cache = null; await getWorld(); }),

    // Keep everyone's guild, the market and the leaderboard moving while nobody clicks.
    sweep: () => queue(async () => {
      const t = clock();
      const world = await getWorld();
      for (const d of await store.listColl('col3')) {
        const g = d.data;
        if (!g || g.v !== GG.GUILD_VERSION || g.planetId !== world.planet.id) continue;
        if (t - (g.t || 0) < 55_000 && !(g.inbox && g.inbox.length)) continue;
        await settle(g, world, t, null, await playerName(g.uid));
      }
      await snapshot(world, t).catch((e) => console.error('history3', e));
    }),
  };

  // Hourly points for charts: each guild's coin and net/hr, each ore's galactic price index.
  async function snapshot(world, t) {
    const meta = await store.getDoc('hist3meta', world.month);
    if (meta && t - meta.t < 3_600_000) return;
    for (const b of (await store.listColl('board3')).map((d) => d.data).filter((b) => b.month === world.month)) {
      const h = (await store.getDoc('hist3', b.id)) || { month: world.month, points: [] };
      if (h.month !== world.month) { h.month = world.month; h.points = []; }
      h.points.push([t, Math.round(b.coin), Math.round(b.netH || 0)]);
      if (h.points.length > 744) h.points = h.points.slice(-744);
      await store.setDoc('hist3', b.id, h);
    }
    const ph = (await store.getDoc('phist3', 'current')) || { month: world.month, prices: {} };
    if (ph.month !== world.month) { ph.month = world.month; ph.prices = {}; }
    const P = GG.prices(world, t);
    for (const [id, p] of Object.entries(P)) {
      (ph.prices[id] = ph.prices[id] || []).push([t, Math.round(p.idx * 1000) / 1000, Math.round(p.share * 1000) / 1000]);
      if (ph.prices[id].length > 744) ph.prices[id] = ph.prices[id].slice(-744);
    }
    await store.setDoc('phist3', 'current', ph);
    await store.setDoc('hist3meta', world.month, { t });
  }
}
