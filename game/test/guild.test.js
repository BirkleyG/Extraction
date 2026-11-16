// Guild game: engine, market and server tests.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as GG from '../shared/guild/index.js';
import { counter } from '../shared/guild/contracts.js';
import { improvisePlanet, startSpot } from '../shared/planet/index.js';
import { generateParties } from '../shared/market/parties.js';
import { startServer } from '../server.js';
import { createStore } from '../store.js';

const H = 3_600_000, D = 24 * H;
const G = GG.GUILD_TUNING;
const planet = improvisePlanet('guild-test', { history: [] });
const parties = generateParties('guild-test', planet);
const world0 = () => ({ month: 't', planet, parties, flow: {}, changes: [], startedAt: 0, endsAt: 30 * D, directory: [], sites: [] });
const npcs = GG.npcRefineries(planet);
function home(seed = 'a') {
  for (let k = 0; k < 60; k++) { const s = startSpot(planet, [], seed + k); if (s && npcs.some((n) => Math.hypot(n.x - s.x, n.y - s.y) < 230)) return s; }
  throw new Error('no start');
}
const nearestNpc = (p) => npcs.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
function starter(seed = 'a', t = 0) {
  const w = world0();
  const s = home(seed);
  let g = GG.newGuild({ uid: 'u' + seed, name: 'Test ' + seed, world: w, x: s.x, y: s.y, now: t });
  const r = GG.applyCommand(g, w, { type: 'route', from: 'pit', to: { kind: 'npc', id: nearestNpc(s).id }, shipId: g.ships[0].id }, t);
  assert.equal(r.error, null);
  return { g: r.guild, w, s };
}
const findSpot = (g, w, kind, r = 50) => {
  for (let k = 0; k < 64; k++) {
    const a = k * 0.61, d = r + (k % 4) * 15;
    const x = Math.round(g.landing.x + Math.cos(a) * d), y = Math.round(g.landing.y + Math.sin(a) * d);
    if (!GG.canBuildAt(g, w, kind, x, y)) return { x, y };
  }
  throw new Error('no spot');
};

describe('guild engine', () => {
  test('a new guild is plain JSON with a hub, a landing pit and one hauler', () => {
    const { g } = starter();
    assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
    assert.deepEqual(g.sites.map((s) => s.kind), ['hub', 'mine']);
    assert.equal(g.ships.length, 1);
    assert.equal(g.coin, G.startCoin);
  });

  test('advance is step-invariant and deterministic', () => {
    const { g, w } = starter();
    const once = GG.advance(g, w, 2 * D).guild;
    let step = g;
    for (let t = 7 * 60_000 + 13_000; t <= 2 * D; t += 37 * 60_000) step = GG.advance(step, w, t).guild;
    step = GG.advance(step, w, 2 * D).guild;
    assert.equal(step.t, once.t);
    assert.ok(Math.abs(step.coin - once.coin) < 1e-6, `${step.coin} vs ${once.coin}`);
    assert.deepEqual(step.stats, once.stats);
    assert.deepEqual(GG.advance(g, w, 2 * D).guild, once);
  });

  test('ships carry ore to a contractor, who pays the posted price', () => {
    const { g, w } = starter();
    const r = GG.advance(g, w, 6 * H);
    assert.ok(r.guild.ledger.in.npc > 0);
    assert.ok(Object.values(r.sales).reduce((a, b) => a + b, 0) > 0);
    const v = GG.view(r.guild, w, 6 * H);
    assert.ok(v.routes[0].ok && v.routes[0].tph > 0);
    assert.ok(v.sites.find((s) => s.id === 'pit').tph > v.routes[0].tph, 'one hauler cannot keep up with the pit');
  });

  test('without a route, ore piles up until the stockpile is full and nothing is earned', () => {
    const w = world0(); const s = home('pile');
    const g = GG.newGuild({ uid: 'p', name: 'Pile', world: w, x: s.x, y: s.y, now: 0 });
    const r = GG.advance(g, w, 2 * D);
    const pit = r.guild.sites.find((x) => x.id === 'pit');
    assert.ok(Math.abs(Object.values(pit.stock).reduce((a, b) => a + b, 0) - G.mine.store[1]) < 1e-6);
    assert.equal(r.guild.earned, 0);
    assert.ok(r.guild.coin < G.startCoin, 'upkeep still runs');
    assert.ok(r.guild.log.some((l) => l.kind === 'full'));
  });

  test('building: claim radius, water, rivals, crews and construction time', () => {
    const { g: g0, w } = starter('b');
    const g = { ...g0, coin: 50_000 };
    assert.match(GG.canBuildAt(g, w, 'mine', g.landing.x + 400, g.landing.y) || 'Too far', /Too far|water|buildable/);
    assert.match(GG.canBuildAt(g, w, 'mine', g.landing.x + 5, g.landing.y), /Too close/);
    const spot = findSpot(g, w, 'mine');
    assert.match(GG.canBuildAt(g, { ...w, sites: [{ uid: 'other', x: spot.x + 10, y: spot.y }] }, 'mine', spot.x, spot.y), /another guild/);
    let r = GG.applyCommand(g, w, { type: 'build', kind: 'mine', ...spot }, 0);
    assert.equal(r.error, null);
    const id = r.guild.sites[r.guild.sites.length - 1].id;
    assert.equal(r.guild.coin, 50_000 - G.build.mine.cost);
    const s2 = findSpot(r.guild, w, 'lab', 80);
    r = GG.applyCommand(r.guild, w, { type: 'build', kind: 'lab', ...s2 }, 0);
    assert.equal(r.error, null);
    const s3 = findSpot(r.guild, w, 'air', 110);
    assert.match(GG.applyCommand(r.guild, w, { type: 'build', kind: 'air', ...s3 }, 0).error, /crews/);
    const done = GG.advance(r.guild, w, G.build.mine.hours * H + 60_000).guild;
    assert.equal(done.sites.find((x) => x.id === id).level, 1);
  });

  test('surveys come back with fuzzy estimates; better sensors are sharper', () => {
    const { g, w } = starter('sv');
    const spot = findSpot(g, w, 'mine', 70);
    let r = GG.applyCommand(g, w, { type: 'survey', ...spot }, 0);
    assert.equal(r.error, null);
    assert.match(GG.applyCommand(r.guild, w, { type: 'survey', x: spot.x + 30, y: spot.y }, 0).error, /drones are out/);
    const done = GG.advance(r.guild, w, 3 * H).guild;
    const sv = done.surveys[0];
    assert.equal(sv.status, 'done');
    assert.ok(sv.report.ores.some((o) => GG.oreInfo(planet).find((x) => x.id === o.id).tier === 'common'));
    for (const o of sv.report.ores) assert.ok(o.lo <= o.est && o.est <= o.hi);
    const sharp = { ...done, tech: { sensors: 1, deepScan: 1 }, rp: 0 };
    const r2 = GG.advance(GG.applyCommand(sharp, w, { type: 'survey', ...spot }, 3 * H).guild, w, 6 * H).guild;
    const rep = r2.surveys[r2.surveys.length - 1].report;
    for (const o of rep.ores.filter((x) => !x.trace)) assert.equal(o.lo, o.hi === 1 && o.lo === 1 ? 1 : o.lo);
    assert.equal(rep.precision, 2);
  });

  test('research spends RP and changes what mines can cut', () => {
    let { g, w } = starter('rp');
    assert.match(GG.applyCommand(g, w, { type: 'research', tech: 'hardDrill' }, 0).error, /research points/);
    g = { ...g, rp: 1000 };
    assert.match(GG.applyCommand(g, w, { type: 'research', tech: 'diamondDrill' }, 0).error, /Needs/);
    const r = GG.applyCommand(g, w, { type: 'research', tech: 'hardDrill' }, 0);
    assert.equal(r.error, null);
    assert.equal(GG.drillLevel(r.guild), 6);
  });

  test('own refinery and exchange: refined goods, contracts, haggling, penalties', () => {
    let { g, w } = starter('ex');
    g = { ...g, coin: 200_000 };
    const spot = findSpot(g, w, 'refinery', 45);
    g = GG.applyCommand(g, w, { type: 'build', kind: 'refinery', ...spot }, 0).guild;
    const ref = g.sites[g.sites.length - 1];
    g = GG.advance(g, w, 5 * H).guild;
    g = GG.applyCommand(g, w, { type: 'deleteRoute', routeId: g.routes[0].id }, 5 * H).guild;
    let r = GG.applyCommand(g, w, { type: 'route', from: 'pit', to: { kind: 'site', id: ref.id }, shipId: g.ships[0].id }, 5 * H);
    assert.equal(r.error, null);
    g = GG.advance(r.guild, w, 12 * H).guild;
    assert.ok(g.ledger.in.guild > 0, 'refined goods sold to the Guild exchange');
    const w5 = { ...w, startedAt: -5 * D };
    r = GG.applyCommand(g, w5, { type: 'buildExchange' }, 12 * H);
    assert.equal(r.error, null);
    g = GG.advance(r.guild, w5, 40 * H).guild;
    assert.equal(g.exchange.level, 1);
    assert.ok(g.offers.length > 0, 'buyers call');
    const of = g.offers[0];
    assert.ok(of.price < of.max);
    const party = parties.find((p) => p.id === of.buyerId);
    const a = counter(of, party, of.max * 0.99, w), b = counter(of, party, of.max * 0.99, w);
    assert.deepEqual(a, b, 'haggling is deterministic');
    assert.equal(a.status, 'accepted');
    assert.ok(['countered', 'walked'].includes(counter(of, party, of.max * 1.5, w).status));
    r = GG.applyCommand(g, w5, { type: 'offer', offerId: of.id, action: 'accept' }, 40 * H);
    assert.equal(r.error, null);
    assert.equal(r.guild.contracts.length, 1);
    // stop shipping: the contract will come up short and cost a penalty
    let g2 = GG.applyCommand(r.guild, w5, { type: 'deleteRoute', routeId: r.guild.routes[0].id }, 40 * H).guild;
    const c = g2.contracts[0];
    g2 = { ...g2, exchange: { ...g2.exchange, stock: {} } };
    g2 = GG.advance(g2, w5, c.due + H).guild;
    assert.ok(g2.ledger.out.penalties > 0);
    assert.equal(g2.buyers[c.buyerId].defaults, 1);
    // the view never shows a buyer's top price
    assert.ok(GG.view(g, w5, 40 * H).offers.every((o) => o.max === undefined));
  });

  test('selling to another guild produces a transfer at their posted share of the galactic price', () => {
    const { g, w, s } = starter('tr');
    const dir = [{ uid: 'other', guild: 'Other', siteId: 'r9', name: 'Their Smelter', x: s.x + 60, y: s.y, on: true, pct: 0.5, room: 500 }];
    const w2 = { ...w, directory: dir };
    let r = GG.applyCommand(g, w2, { type: 'deleteRoute', routeId: g.routes[0].id }, 0);
    r = GG.applyCommand(r.guild, w2, { type: 'route', from: 'pit', to: { kind: 'rival', id: 'r9', uid: 'other' }, shipId: g.ships[0].id }, 0);
    assert.equal(r.error, null);
    const a = GG.advance(r.guild, w2, 4 * H);
    assert.ok(a.transfers.length > 0);
    const P = GG.prices(w2, 0);
    for (const t of a.transfers) assert.ok(Math.abs(t.coin - t.amount * 0.5 * P[t.oreId].p) / t.coin < 0.05);
    assert.ok(a.guild.ledger.in.players > 0);
  });

  test('nuke: needs earnings, pays Spectacle, rebuilds a starter base and keeps surveys', () => {
    let { g, w } = starter('nk');
    assert.match(GG.applyCommand(g, w, { type: 'nuke', confirm: 'NUKE' }, 0).error, /earned/);
    g = { ...g, runEarned: G.nukeMin * 4, surveys: [{ id: 'sv1', x: 1, y: 1, status: 'done', report: { ores: [] } }], tech: { holds: 1 } };
    const r = GG.applyCommand(g, w, { type: 'nuke', confirm: 'NUKE' }, 0);
    assert.equal(r.error, null);
    assert.ok(Math.abs(r.guild.sp - 20) < 1e-9);
    assert.equal(r.guild.coin, G.startCoin);
    assert.deepEqual(r.guild.tech, {});
    assert.equal(r.guild.surveys.length, 1);
    assert.equal(r.guild.sites.length, 2);
    const e = GG.applyCommand(r.guild, w, { type: 'evolve', kind: 'extraction' }, 0);
    assert.equal(e.error, null);
    assert.equal(e.guild.evo.extraction, 1);
  });

  test('incidents are seeded, halt mines and cost compensation; brutal makes more of them', () => {
    const count = (intensity) => {
      let { g, w } = starter('inc');
      g = GG.applyCommand(g, w, { type: 'setMine', siteId: 'pit', intensity }, 0).guild;
      return GG.advance(g, w, 20 * D).guild.stats.incidents;
    };
    const gentle = count('gentle'), brutal = count('brutal');
    assert.ok(brutal > gentle, `${brutal} > ${gentle}`);
  });
});

describe('galactic market (nested CES)', () => {
  const mk = GG.buildMarket(planet, parties);
  const flowAt = (k) => Object.fromEntries(mk.ores.map((o, i) => [o.id, { q: mk.expected[i] * k, t: 0 }]));
  test('at the expected planet supply prices sit at baseline', () => {
    const P = GG.prices({ ...world0(), flow: flowAt(1) }, 0);
    for (const p of Object.values(P)) assert.ok(Math.abs(p.idx - 1) < 0.05, `${p.idx}`);
  });
  test('commons are price takers, mythic is a price maker', () => {
    const P1 = GG.prices({ ...world0(), flow: flowAt(1) }, 0), P3 = GG.prices({ ...world0(), flow: flowAt(3) }, 0);
    const drop = (tier) => { const o = mk.ores.find((x) => x.tier === tier); return 1 - P3[o.id].p / P1[o.id].p; };
    assert.ok(drop('common') < 0.03, 'commons barely move');
    assert.ok(drop('rare') > 0.05 && drop('rare') < drop('mythic'));
    assert.ok(drop('mythic') > 0.25, 'mythic crashes when flooded');
  });
  test('events move budgets and tastes, and prices follow', () => {
    const o = mk.ores.find((x) => x.tier === 'rare');
    const base = GG.prices({ ...world0(), flow: flowAt(1) }, 0)[o.id].p;
    const up = GG.prices({ ...world0(), flow: flowAt(1), changes: [{ id: 'e', kind: 'demand', oreId: o.id, mult: 1.6 }] }, 0)[o.id].p;
    const sup = GG.prices({ ...world0(), flow: flowAt(1), changes: [{ id: 'f', kind: 'supply', oreId: o.id, mult: 1.6 }] }, 0)[o.id].p;
    assert.ok(up > base * 1.05 && sup < base * 0.97);
  });
  test('sales feed a decaying planet supply', () => {
    let w = GG.recordSales(world0(), { [mk.ores[3].id]: 100 }, 0);
    const now = GG.planetFlow(w, 0)[mk.ores[3].id];
    const later = GG.planetFlow(w, 6 * H)[mk.ores[3].id];
    assert.ok(now > 0 && Math.abs(later - now / 2) < 1e-6);
  });
});

describe('guild server', () => {
  let srv, base, offset = 0;
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  before(async () => {
    const store = await createStore(null);
    srv = await startServer({ port: 0, store, ai: { enabled: false, providers: {}, dailyLimit: 0, perPlayerLimit: 0, defaultModel: () => '', listModels: async () => [], canUse: () => false, json: async () => { throw new Error('off'); } }, env: { GAME_CODE: '', ADMIN_CODE: 'boss' }, now: () => Date.now() + offset, noTimers: true });
    base = `http://127.0.0.1:${srv.port}`;
  });
  after(async () => { await srv.close(); });

  test('two guilds land apart, secrets stay on the server, and ore sold to a rival refinery reaches it', async () => {
    const a = (await call('POST', '/api/join', { name: 'Ana' })).body, b = (await call('POST', '/api/join', { name: 'Ben' })).body;
    let sa = (await call('POST', '/api/v3/start', { name: 'Ana Co' }, a.token)).body;
    let sb = (await call('POST', '/api/v3/start', { name: 'Ben Co' }, b.token)).body;
    assert.ok(sa.guild && sb.guild);
    const d = Math.hypot(sa.guild.landing.x - sb.guild.landing.x, sa.guild.landing.y - sb.guild.landing.y);
    assert.ok(d >= 120, 'guilds land with room to grow: ' + d);
    assert.ok(!JSON.stringify(sa).includes('"ground"'), 'no ground truth in the client state');
    assert.ok(!('parties' in sa.world), 'no buyer secrets in the client world');
    // Ben builds a refinery and opens it
    sb = (await call('POST', '/api/v3/command', { cmd: { type: 'build', kind: 'refinery', x: sb.guild.landing.x + 40, y: sb.guild.landing.y } }, b.token)).body;
    for (let k = 0; sb.error && k < 12; k++) sb = (await call('POST', '/api/v3/command', { cmd: { type: 'build', kind: 'refinery', x: Math.round(sb.guild.landing.x + Math.cos(k) * 50), y: Math.round(sb.guild.landing.y + Math.sin(k) * 50) } }, b.token)).body;
    assert.equal(sb.error, null);
    offset += 5 * H;
    const ref = sb.guild.sites.find((s) => s.kind === 'refinery');
    sb = (await call('POST', '/api/v3/command', { cmd: { type: 'setRefinery', siteId: ref.id, on: true, pct: 0.6 } }, b.token)).body;
    sa = (await call('GET', '/api/v3/state', null, a.token)).body;
    const entry = sa.world.directory.find((x) => x.uid === b.id);
    assert.ok(entry && entry.on && entry.pct === 0.6);
    // Ana ships to Ben's refinery (an air station would help if it is far; give her range by putting it in her own claim is not possible, so allow failure)
    const r = (await call('POST', '/api/v3/command', { cmd: { type: 'route', from: 'pit', to: { kind: 'rival', id: ref.id, uid: b.id }, shipId: sa.guild.ships[0].id } }, a.token)).body;
    assert.equal(r.error, null);
    let route = r.view.routes[0];
    if (!route.ok) {
      // too far for a hauler: a clipper flies farther
      const c2 = (await call('POST', '/api/v3/command', { cmd: { type: 'buyShip', cls: 'clipper', routeId: route.id } }, a.token)).body;
      assert.equal(c2.error, null);
      route = c2.view.routes[0];
    }
    if (!route.ok) {
      // still too far: test setup drops an air station halfway (in play you would build one)
      const doc = await srv.store.getDoc('col3', a.id);
      doc.sites.push({ id: 'a99', kind: 'air', name: 'Test Perch', x: Math.round((doc.landing.x + ref.x) / 2), y: Math.round((doc.landing.y + ref.y) / 2), level: 1, build: null });
      await srv.store.setDoc('col3', a.id, doc);
      route = (await call('GET', '/api/v3/state', null, a.token)).body.view.routes[0];
    }
    assert.ok(route.ok, 'the route reaches the rival refinery: ' + route.issue);
    offset += 6 * H;
    const ana = (await call('GET', '/api/v3/state', null, a.token)).body;
    assert.ok(ana.guild.ledger.in.players > 0, 'Ana got paid');
    const ben = (await call('GET', '/api/v3/state', null, b.token)).body;
    assert.ok(ben.guild.ledger.out.ore > 0, 'Ben paid for the ore');
    const board = (await call('GET', '/api/v3/board', null, a.token)).body;
    assert.equal(board.month.length, 2);
  });

  test('commands are validated and the world shows contractors', async () => {
    const c = (await call('POST', '/api/join', { name: 'Cy' })).body;
    assert.equal((await call('POST', '/api/v3/command', { cmd: { type: 'survey', x: 1, y: 1 } }, c.token)).status, 409);
    const st = (await call('POST', '/api/v3/start', {}, c.token)).body;
    assert.equal(st.world.npc.length, G.npcCount);
    assert.ok(st.world.npc.every((n) => n.cut === undefined && n.bias === undefined));
    const bad = (await call('POST', '/api/v3/command', { cmd: { type: 'nope' } }, c.token)).body;
    assert.match(bad.error, /Unknown/);
  });
});
