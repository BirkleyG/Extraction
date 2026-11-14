// Mineshaft Capital v2 server side: the month's world, authoritative colonies, leaderboard.
// All v2 mutations run through one queue, which is plenty for 3-10 players and keeps
// colony saves and the shared market consistent.
import crypto from 'node:crypto';
import * as E from '../shared/engine/index.js';
import { improvisePlanet, planetPrompt, planetFromAI, planetSummary, startSpot, sampleSpot } from '../shared/planet/index.js';
import { createMaker } from './maker.js';
import { createEvents } from './events.js';
import { generateParties, partiesPrompt, applyPartyNames } from '../shared/market/parties.js';

// Species library (shared/species) is optional until the client ships it.
let speciesLib = null;
async function species() { if (speciesLib === null) speciesLib = await import('../shared/species/index.js').catch(() => false); return speciesLib || null; }

// Server-only collections (never client-writable).
export const SUB_COLLS = new Set(['board2', 'world2', 'feed2']);

// Bump to restart the game for everyone on the next deploy: new planet, every colony starts fresh.
// (No Hall of Fame entry is written for a restarted month.)
export const WORLD_VERSION = 2;

export function monthKey(t) { const d = new Date(t); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
function monthBounds(t) {
  const d = new Date(t);
  return { startedAt: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), endsAt: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) };
}

export function createV2({ store, ai, currentModel, broadcast, now: clock = () => Date.now() }) {
  let chain = Promise.resolve();
  const queue = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  let worldCache = null;

  // Engine balances ore values itself; planet values are flavor only.
  function enginePlanet(planet) {
    return { ...planet, ores: planet.ores.map(o => { const { baseValue, ...rest } = o; return rest; }) };
  }

  async function buildPlanet(seed, request) {
    const histDocs = await store.listColl('hall2');
    const history = histDocs.map(d => d.data.planetSummary).filter(Boolean).slice(-6);
    const model = ai && await currentModel();
    if (model) {
      try { return planetFromAI(await ai.json(model, planetPrompt({ request, history }), 'complex'), seed); }
      catch (e) { console.error('Planet AI failed, improvising:', e.message); }
    }
    return improvisePlanet(seed, { history });
  }

  async function newWorld(t, request) {
    const { startedAt, endsAt } = monthBounds(t);
    const month = monthKey(t);
    const planet = await buildPlanet(month + ':' + crypto.randomBytes(4).toString('hex'), request);
    const world = { v: 2, wv: WORLD_VERSION, month, planet, market: {}, startedAt, endsAt, events: [], changes: [], created: t };
    world.parties = await buildParties(world);
    await saveWorld(world);
    await addFeed(`The Maker Guild opened ${planet.name} for extraction. ${planet.tagline || ''}`.trim(), 'world', null, t);
    return world;
  }

  async function saveWorld(world) {
    worldCache = world;
    await store.setDoc('world2', 'current', world);
    broadcast('world2', 'current', world);
  }

  // About 24 buyer parties for refined goods. Numbers are seeded; the AI only names them.
  async function buildParties(world) {
    let parties = generateParties(world.month + ':' + world.planet.id, world.planet);
    const model = ai && await currentModel();
    if (model) {
      try { parties = applyPartyNames(parties, await ai.json(model, partiesPrompt(world.planet, parties), 'quick')); }
      catch (e) { console.error('Party naming AI failed:', e.message); }
    }
    return parties;
  }

  async function getWorld() {
    if (worldCache) return worldCache;
    let w = await store.getDoc('world2', 'current');
    if (!w || !w.planet || (w.wv || 1) < WORLD_VERSION) w = await newWorld(clock());
    else if (!Array.isArray(w.parties) || !w.parties.length) { w.parties = await buildParties(w); await saveWorld(w); }
    worldCache = w;
    return w;
  }

  // Hourly snapshots for charts: each colony's coin, coin/min and rank; each ore's price index.
  async function snapshotHistory(world, t) {
    const last = await store.getDoc('hist2meta', world.month);
    if (last && t - last.t < 3600_000) return;
    const board = (await store.listColl('board2')).map(d => d.data).filter(b => b.month === world.month).sort((a, b) => b.coin - a.coin);
    for (let i = 0; i < board.length; i++) {
      const b = board[i];
      const h = (await store.getDoc('hist2', b.id)) || { month: world.month, points: [] };
      if (h.month !== world.month) { h.month = world.month; h.points = []; }
      h.points.push([t, Math.round(b.coin), Math.round(b.coinPerMin), i + 1]);
      if (h.points.length > 744) h.points = h.points.slice(-744);
      await store.setDoc('hist2', b.id, h);
    }
    const ph = (await store.getDoc('phist2', 'current')) || { month: world.month, prices: {} };
    if (ph.month !== world.month) { ph.month = world.month; ph.prices = {}; }
    const ew = engineWorld(world);
    for (const o of world.planet.ores) {
      let idx = 1;
      try { idx = E.marketPrice(ew, o.id, (world.planet.buyers || [])[0]?.id, t) / Math.max(1e-9, E.marketPrice({ ...ew, market: {}, changes: [] }, o.id, (world.planet.buyers || [])[0]?.id, t)); } catch {}
      (ph.prices[o.id] = ph.prices[o.id] || []).push([t, Math.round(idx * 1000) / 1000]);
      if (ph.prices[o.id].length > 744) ph.prices[o.id] = ph.prices[o.id].slice(-744);
    }
    await store.setDoc('phist2', 'current', ph);
    await store.setDoc('hist2meta', world.month, { t });
  }

  const engineWorld = w => ({ ...w, planet: enginePlanet(w.planet) });

  async function addFeed(text, kind, by, t = clock()) {
    const e = { t, by: by || null, text: String(text).slice(0, 240), kind };
    const id = t.toString(36) + crypto.randomBytes(3).toString('hex');
    await store.setDoc('feed2', id, e);
    broadcast('feed2', id, e);
    if (Math.random() < 0.05) store.pruneColl('feed2', 200).catch(() => {});
  }

  // Where every colony on this planet sits (public: the map shows other players).
  async function colonySpots(world) {
    const out = [];
    for (const d of await store.listColl('col2')) {
      const c = d.data;
      if (c && c.planetId === world.planet.id && c.site && Number.isFinite(c.site.x)) out.push({ uid: c.uid, name: c.name, x: c.site.x, y: c.site.y, color: c.species && c.species.color });
    }
    return out;
  }

  async function loadColony(uid, world) {
    const c = await store.getDoc('col2', uid);
    if (!c || !(c.v >= 3 && c.v <= E.ENGINE_VERSION) || c.planetId !== world.planet.id) return null;
    return c;
  }

  function summary(c, world, name) {
    let cpm = 0; try { cpm = E.rates(c, world).coinPerMin || 0; } catch {}
    return { id: c.uid, name: c.name, player: name, species: c.species, coin: c.coin, earned: c.earned, grant: c.grant || 0, coinPerMin: cpm, shafts: c.shafts.length, ships: c.ships.length, month: world.month, t: c.t };
  }

  // Advance a colony to now, fold its sales into the shared market, persist.
  async function settle(c, world, t, apply) {
    const ew = engineWorld(world);
    let r = apply ? E.applyCommand(c, ew, apply, t) : E.advance(c, ew, t);
    if (r.error) {
      // Keep time progress even when the command is refused.
      const adv = E.advance(c, ew, t);
      r = { ...adv, error: r.error };
    }
    if (r.sales && r.sales.length) {
      world.market = E.recordSales(ew, r.sales, t).market;
      await saveWorld(world);
    }
    await store.setDoc('col2', r.colony.uid, r.colony);
    const players = await store.players_([r.colony.uid]);
    const s = summary(r.colony, ew, players[0] && players[0].name);
    await store.setDoc('board2', r.colony.uid, s);
    broadcast('board2', r.colony.uid, s);
    for (const ev of r.events || []) {
      if (ev.type === 'license' && ev.text) await addFeed(`${r.colony.name}: ${ev.text}`, ev.type, r.colony.uid, t);
      if (ev.type === 'strike' && ev.data && ev.data.tier !== 'common' && ev.text) await addFeed(`${ev.data.tier === 'mythic' ? '🌟' : '⛏'} ${r.colony.name}: ${ev.text}`, 'strike', r.colony.uid, t);
      if (ev.type === 'nuke') await addFeed(`☢ ${players[0] ? players[0].name : r.colony.name} nuked their whole colony for ${Number(ev.data && ev.data.spectacle || 0).toFixed(1)} Spectacle. The Maker is listening.`, 'nuke', r.colony.uid, t);
    }
    return r;
  }

  async function rollIfDue() {
    const t = clock();
    const world = await getWorld();
    if (t < world.endsAt) return false;
    const got = await store.acquireLock('month2', 'server', 60000);
    if (!got) return false;
    const board = (await store.listColl('board2')).map(d => d.data).filter(b => b.month === world.month);
    board.sort((a, b) => b.coin - a.coin);
    const win = board[0];
    await store.setDoc('hall2', world.month, {
      month: world.month, planet: world.planet.name, planetSummary: planetSummary(world.planet),
      winner: win ? win.id : null, winnerName: win ? (win.player || win.name) : null, colony: win ? win.name : null,
      coin: win ? win.coin : 0, players: board.length, t,
    });
    for (const b of board) {
      const s = (await store.getDoc('stats2', b.id)) || { total: 0, months: 0, wins: 0, best: 0 };
      s.total += b.coin; s.months += 1; s.best = Math.max(s.best, b.coin); if (win && win.id === b.id) s.wins += 1;
      s.name = b.player || b.name;
      await store.setDoc('stats2', b.id, s);
    }
    if (win) await addFeed(`${win.player || win.name} won ${world.month} on ${world.planet.name} with ${E.fmt(win.coin)} coin.`, 'win', win.id, t);
    worldCache = null;
    await newWorld(t, null);
    return true;
  }

  const maker = createMaker({ store, ai, currentModel, getWorld, saveWorld, addFeed, clock });
  const events = createEvents({ ai, currentModel, getWorld, saveWorld, addFeed, clock });

  return {
    getWorld,
    maybeEvent: () => queue(() => events.maybeEvent()),

    maker: (me, body) => queue(async () => {
      const world = await getWorld();
      const colony = await loadColony(me.id, world);
      return maker.handle(me, colony, body || {});
    }),

    bulletin: () => queue(async () => {
      const t = clock();
      const world = await getWorld();
      const active = (world.changes || []).filter(c => !c.until || c.until > t);
      const names = Object.fromEntries((await store.players_(active.map(c => c.by).filter(Boolean))).map(p => [p.id, p.name]));
      return { changes: active.map(c => ({ ...c, byName: c.by ? names[c.by] || 'A General' : null })), nextEventAt: world.nextEventAt || null };
    }),

    species: (me, body) => queue(async () => {
      const lib = await species();
      if (!lib) throw Object.assign(new Error('The species builder is not ready yet'), { status: 503, code: 'not_ready', expose: true });
      const description = String((body && body.description) || '').slice(0, 300);
      const seed = me.id + ':' + crypto.randomBytes(3).toString('hex');
      const model = ai && await currentModel();
      if (model && description) {
        try { return { species: lib.speciesFromAI(await ai.json(model, lib.speciesPrompt(description), 'quick'), seed) }; }
        catch (e) { console.error('Species AI failed:', e.message); }
      }
      return { species: lib.randomSpecies(seed, description) };
    }),
    rollIfDue: () => queue(rollIfDue),

    state: (me) => queue(async () => {
      const t = clock();
      const world = await getWorld();
      let colony = await loadColony(me.id, world);
      if (colony) colony = (await settle(colony, world, t)).colony;
      const ew = engineWorld(world);
      return {
        me: { id: me.id, name: me.name, owner: !!me.owner },
        colony, world, serverNow: t,
        grant: colony ? null : E.catchUpGrant(ew, t),
        colonies: await colonySpots(world),
      };
    }),

    start: (me, body) => queue(async () => {
      const t = clock();
      const world = await getWorld();
      const existing = await loadColony(me.id, world);
      if (existing) return { colony: existing, serverNow: t };
      // Players are dropped at a random spot that's equally good for everyone, clear of other colonies.
      // The ore painted under that spot (hidden from players) is what's in the ground.
      const taken = (await colonySpots(world)).map(p => ({ x: p.x, y: p.y }));
      const spot = startSpot(world.planet, taken, me.id + ':' + world.month);
      const sampled = spot ? sampleSpot(world.planet, spot.x, spot.y) : null;
      const region = world.planet.regions.find(r => r.id === (sampled ? sampled.regionId : body.siteRegion)) || world.planet.regions[0];
      const siteArg = sampled ? { ...sampled, id: `s${Math.round(sampled.x)}_${Math.round(sampled.y)}` } : undefined;
      const sp = (body.species && typeof body.species === 'object') ? body.species : {};
      const lib = await species();
      const look = lib ? lib.cleanSpecies({ ...sp, name: sp.name || me.name + "'s kin" })
        : { name: String(sp.name || me.name + "'s kin").slice(0, 28), color: /^#[0-9a-f]{6}$/i.test(sp.color || '') ? sp.color : '#ff8a3d' };
      const colony = E.newColony({
        id: me.id, uid: me.id, name: String(body.name || look.name + ' Mining Co.').slice(0, 28),
        species: look, planet: engineWorld(world).planet, siteRegion: region.id, site: siteArg, now: t, grant: E.catchUpGrant(engineWorld(world), t),
      });
      if (sampled && colony.site) colony.site = { ...colony.site, x: Math.round(sampled.x), y: Math.round(sampled.y) }; // map position
      await store.setDoc('col2', me.id, colony);
      const r = await settle(colony, world, t);
      await addFeed(`${me.name} landed in ${region.name} as the ${look.name}.`, 'land', me.id, t);
      return { colony: r.colony, serverNow: t };
    }),

    command: (me, cmd) => queue(async () => {
      const t = clock();
      const world = await getWorld();
      const colony = await loadColony(me.id, world);
      if (!colony) throw Object.assign(new Error('Start your colony first'), { status: 409, code: 'no_colony', expose: true });
      if (!cmd || typeof cmd.type !== 'string') throw Object.assign(new Error('Bad command'), { status: 400, code: 'invalid_argument', expose: true });
      const r = await settle(colony, world, t, cmd);
      return { colony: r.colony, events: r.events || [], error: r.error || null, serverNow: t };
    }),

    board: () => queue(async () => {
      const world = await getWorld();
      const month = (await store.listColl('board2')).map(d => d.data).filter(b => b.month === world.month).sort((a, b) => b.coin - a.coin);
      const allTime = (await store.listColl('stats2')).map(d => ({ id: d.id, ...d.data, avg: d.data.months ? d.data.total / d.data.months : 0 })).sort((a, b) => b.total - a.total);
      const hall = (await store.listColl('hall2')).map(d => d.data).sort((a, b) => (a.month < b.month ? 1 : -1));
      return { month, allTime, hall };
    }),

    history: (me) => queue(async () => {
      const world = await getWorld();
      const mine = await store.getDoc('hist2', me.id);
      const ph = await store.getDoc('phist2', 'current');
      const board = (await store.listColl('board2')).map(d => d.data).filter(b => b.month === world.month).sort((a, b) => b.coin - a.coin).slice(0, 10);
      const series = [];
      for (const b of board) { const h = await store.getDoc('hist2', b.id); if (h && h.month === world.month) series.push({ id: b.id, name: b.player || b.name, color: b.species && b.species.color, points: h.points.map(p => [p[0], p[1]]) }); }
      return { me: mine && mine.month === world.month ? mine.points : [], prices: ph && ph.month === world.month ? ph.prices : {}, board: series };
    }),

    // Keep the leaderboard and market fresh even when nobody is clicking.
    sweep: () => queue(async () => {
      const t = clock();
      const world = await getWorld();
      await snapshotHistory(world, t).catch(e => console.error('history', e));
      for (const d of await store.listColl('col2')) {
        const c = d.data;
        if (!(c.v >= 3 && c.v <= E.ENGINE_VERSION) || c.planetId !== world.planet.id) continue;
        if (t - (c.t || 0) < 55_000) continue;
        await settle(c, world, t);
      }
    }),

    // Owner tool for testing: end the month now.
    forceRoll: () => queue(async () => { const w = await getWorld(); w.endsAt = clock(); await saveWorld(w); return rollIfDue(); }),
  };
}
