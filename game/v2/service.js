// Mineshaft Capital v2 server side: the month's world, authoritative colonies, leaderboard.
// All v2 mutations run through one queue, which is plenty for 3-10 players and keeps
// colony saves and the shared market consistent.
import crypto from 'node:crypto';
import * as E from '../shared/engine/index.js';
import { improvisePlanet, planetPrompt, planetFromAI, planetSummary } from '../shared/planet/index.js';
import { createMaker } from './maker.js';
import { createEvents } from './events.js';

// Species library (shared/species) is optional until the client ships it.
let speciesLib = null;
async function species() { if (speciesLib === null) speciesLib = await import('../shared/species/index.js').catch(() => false); return speciesLib || null; }

// Server-only collections (never client-writable).
export const SUB_COLLS = new Set(['board2', 'world2', 'feed2']);

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
    const world = { v: 2, month, planet, market: {}, startedAt, endsAt, events: [], changes: [], created: t };
    await saveWorld(world);
    await addFeed(`The Maker Guild opened ${planet.name} for extraction. ${planet.tagline || ''}`.trim(), 'world', null, t);
    return world;
  }

  async function saveWorld(world) {
    worldCache = world;
    await store.setDoc('world2', 'current', world);
    broadcast('world2', 'current', world);
  }

  async function getWorld() {
    if (worldCache) return worldCache;
    let w = await store.getDoc('world2', 'current');
    if (!w || !w.planet) w = await newWorld(clock());
    worldCache = w;
    return w;
  }

  const engineWorld = w => ({ ...w, planet: enginePlanet(w.planet) });

  async function addFeed(text, kind, by, t = clock()) {
    const e = { t, by: by || null, text: String(text).slice(0, 240), kind };
    const id = t.toString(36) + crypto.randomBytes(3).toString('hex');
    await store.setDoc('feed2', id, e);
    broadcast('feed2', id, e);
    if (Math.random() < 0.05) store.pruneColl('feed2', 200).catch(() => {});
  }

  async function loadColony(uid, world) {
    const c = await store.getDoc('col2', uid);
    if (!c || c.v !== E.ENGINE_VERSION || c.planetId !== world.planet.id) return null;
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
      if (['license', 'veinOut'].includes(ev.type) && ev.text) await addFeed(`${r.colony.name}: ${ev.text}`, ev.type, r.colony.uid, t);
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
      };
    }),

    start: (me, body) => queue(async () => {
      const t = clock();
      const world = await getWorld();
      const existing = await loadColony(me.id, world);
      if (existing) return { colony: existing, serverNow: t };
      const region = world.planet.regions.find(r => r.id === body.siteRegion) || world.planet.regions[0];
      const sp = (body.species && typeof body.species === 'object') ? body.species : {};
      const lib = await species();
      const look = lib ? lib.cleanSpecies({ ...sp, name: sp.name || me.name + "'s kin" })
        : { name: String(sp.name || me.name + "'s kin").slice(0, 28), color: /^#[0-9a-f]{6}$/i.test(sp.color || '') ? sp.color : '#ff8a3d' };
      const colony = E.newColony({
        id: me.id, uid: me.id, name: String(body.name || look.name + ' Mining Co.').slice(0, 28),
        species: look, planet: engineWorld(world).planet, siteRegion: region.id, now: t, grant: E.catchUpGrant(engineWorld(world), t),
      });
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

    // Keep the leaderboard and market fresh even when nobody is clicking.
    sweep: () => queue(async () => {
      const t = clock();
      const world = await getWorld();
      for (const d of await store.listColl('col2')) {
        const c = d.data;
        if (c.v !== E.ENGINE_VERSION || c.planetId !== world.planet.id) continue;
        if (t - (c.t || 0) < 55_000) continue;
        await settle(c, world, t);
      }
    }),

    // Owner tool for testing: end the month now.
    forceRoll: () => queue(async () => { const w = await getWorld(); w.endsAt = clock(); await saveWorld(w); return rollIfDue(); }),
  };
}
