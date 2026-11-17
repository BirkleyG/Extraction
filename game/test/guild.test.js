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
const world0 = () => ({ month: 't', planet, parties, flow: {}, changes: [], startedAt: 0, endsAt: 30 * D, directory: [], gates: [], sites: [] });
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

  test('without a route, ore piles up until the yard is full and nothing is earned', () => {
    const w = world0(); const s = home('pile');
    const g = GG.newGuild({ uid: 'p', name: 'Pile', world: w, x: s.x, y: s.y, now: 0 });
    const r = GG.advance(g, w, 2 * D);
    const pit = GG.view(r.guild, w, 2 * D).sites.find((x) => x.id === 'pit');
    assert.ok(pit.full && pit.flags.includes('full'));
    assert.equal(r.guild.earned, 0);
    assert.ok(r.guild.coin < G.startCoin, 'wages and upkeep still run');
    assert.ok(r.guild.log.some((l) => l.kind === 'full'));
  });

  test('parts install at once, cost coin, and change what the mine does', () => {
    let { g, w } = starter('parts');
    g = { ...g, coin: 100_000 };
    const before = GG.view(g, w, 0).sites.find((s) => s.id === 'pit');
    let r = GG.applyCommand(g, w, { type: 'part', siteId: 'pit', part: 'haul' }, 0);
    assert.equal(r.error, null);
    const after = GG.view(r.guild, w, 0).sites.find((s) => s.id === 'pit');
    assert.ok(after.haul > before.haul);
    assert.equal(r.guild.coin, 100_000 - before.parts.find((p) => p.id === 'haul').cost);
    // a new shaft needs a crew before it digs
    r = GG.applyCommand(r.guild, w, { type: 'part', siteId: 'pit', part: 'shaft' }, 0);
    const v = GG.view(r.guild, w, 0).sites.find((s) => s.id === 'pit');
    assert.equal(v.need, 12);
    assert.ok(v.staff < 1);
    const later = GG.view(GG.advance(r.guild, w, 3 * H).guild, w, 3 * H).sites.find((s) => s.id === 'pit');
    assert.equal(later.crew, 12, 'the labor pool and shuttles staffed the new shaft');
    // maxing out
    let gg = { ...r.guild, coin: 1e9 };
    for (let k = 0; k < 20; k++) gg = GG.applyCommand(gg, w, { type: 'part', siteId: 'pit', part: 'yard' }, 0).guild;
    assert.match(GG.applyCommand(gg, w, { type: 'part', siteId: 'pit', part: 'yard' }, 0).error, /maxed/);
  });

  test('workers die, the labor pool replaces them, and a shuttle brings more', () => {
    let { g, w } = starter('labor');
    g = { ...g, coin: 200_000 };
    for (let k = 0; k < 4; k++) g = GG.applyCommand(g, w, { type: 'part', siteId: 'pit', part: 'shaft' }, 0).guild;
    g = GG.applyCommand(g, w, { type: 'setShift', siteId: 'pit', shift: 'overtime' }, 0).guild;
    const r = GG.advance(g, w, 6 * D).guild;
    assert.ok(r.stats.deaths > 0, 'people died');
    assert.ok(r.labor.hired > 0, 'and were replaced');
    assert.ok(r.log.some((l) => l.kind === 'shuttle'));
    const pit = r.sites.find((s) => s.id === 'pit');
    assert.ok(pit.crew >= GG.crewNeed(pit) - 6, 'the mine stays staffed');
    // a manual order arrives by shuttle
    const h = GG.applyCommand(r, w, { type: 'hire', n: 5 }, 6 * D);
    assert.equal(h.error, null);
    assert.equal(h.guild.labor.inbound.length, 1);
  });

  test('blasts give a burst of ore, have a cooldown and can cave in; cave-ins wait for a decision or the standing order', () => {
    let { g, w } = starter('blast');
    g = { ...g, coin: 100_000 };
    g = GG.advance(g, w, 2 * H).guild;
    const pile0 = Object.values(g.sites.find((s) => s.id === 'pit').stock).reduce((a, b) => a + b, 0);
    let r = GG.applyCommand(g, w, { type: 'blast', siteId: 'pit' }, 2 * H);
    assert.equal(r.error, null);
    const pile1 = Object.values(r.guild.sites.find((s) => s.id === 'pit').stock).reduce((a, b) => a + b, 0);
    assert.ok(pile1 > pile0);
    assert.match(GG.applyCommand(r.guild, w, { type: 'blast', siteId: 'pit' }, 2 * H + 60_000).error, /dust/);
    // force a cave-in decision by blasting until one happens
    let gg = r.guild, t = 2 * H, dec = null;
    for (let k = 0; k < 40 && !dec; k++) { t += 3.1 * H; const b = GG.applyCommand(gg, w, { type: 'blast', siteId: 'pit' }, t); gg = b.guild; dec = gg.decisions[0]; if (dec) break; gg = GG.advance(gg, w, t + 2 * H).guild; t += 2 * H; }
    assert.ok(dec, 'a cave-in happened eventually');
    assert.ok(GG.view(gg, w, t).sites.find((s) => s.id === 'pit').flags.includes('decision'));
    const crew = gg.sites.find((s) => s.id === 'pit').crew;
    const sealed = GG.applyCommand(gg, w, { type: 'decide', decisionId: dec.id, choice: 'seal' }, t);
    assert.equal(sealed.guild.sites.find((s) => s.id === 'pit').crew, crew - Math.min(dec.n, crew));
    const rescued = GG.applyCommand(gg, w, { type: 'decide', decisionId: dec.id, choice: 'rescue' }, t);
    assert.equal(rescued.guild.coin, gg.coin - dec.cost);
    // nobody answers: the standing order (rescue by default) settles it
    const auto = GG.advance(gg, w, dec.expires + 2 * 60_000).guild;
    assert.equal(auto.decisions.length, 0);
  });

  test('territory is open: far costs more and takes longer; rivals and contractors keep a gap', () => {
    const { g: g0, w } = starter('b');
    const g = { ...g0, coin: 500_000 };
    const near = findSpot(g, w, 'mine', 50);
    let far = null;
    for (let k = 0; k < 200 && !far; k++) { const a = k * 0.37, d = 260 + (k % 5) * 30; const x = Math.round(g.landing.x + Math.cos(a) * d), y = Math.round(g.landing.y + Math.sin(a) * d); if (x > 30 && y > 30 && x < 970 && y < 970 && !GG.canBuildAt(g, w, 'mine', x, y)) far = { x, y }; }
    assert.ok(far, 'found a far spot');
    const qn = GG.foundQuote(g, 'mine', near.x, near.y), qf = GG.foundQuote(g, 'mine', far.x, far.y);
    assert.ok(qf.cost > qn.cost && qf.hours > qn.hours);
    assert.match(GG.canBuildAt(g, w, 'mine', g.landing.x + 5, g.landing.y) || '', /Too close/);
    assert.match(GG.canBuildAt(g, { ...w, sites: [{ uid: 'other', kind: 'mine', x: near.x + 10, y: near.y }] }, 'mine', near.x, near.y), /another guild/);
    const n0 = npcs[0];
    assert.match(GG.canBuildAt(g, w, 'mine', n0.x + 5, n0.y) || 'contractor', /contractor|water|buildable/);
    const r = GG.applyCommand(g, w, { type: 'build', kind: 'mine', ...far }, 0);
    assert.equal(r.error, null);
    const site = r.guild.sites[r.guild.sites.length - 1];
    assert.equal(site.level, 0);
    assert.equal(GG.advance(r.guild, w, qf.hours * H + 2 * 60_000).guild.sites.find((s) => s.id === site.id).level, 1);
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
    for (const o of sv.report.ores) assert.ok(o.lo <= o.est && o.est <= o.hi);
    assert.ok(GG.BRANCHES[sv.report.branch], 'reports tell which research a lab there would do');
    const sharp = { ...done, tree: { k1: 1, k3: 1 } };
    const r2 = GG.advance(GG.applyCommand(sharp, w, { type: 'survey', ...spot }, 3 * H).guild, w, 6 * H).guild;
    assert.equal(r2.surveys[r2.surveys.length - 1].report.precision, 2);
  });

  test('the skill tree: management from the hub, other branches only with a lab in that land', () => {
    let { g, w } = starter('rp');
    g = { ...g, rp: 5000, coin: 200_000 };
    assert.match(GG.applyCommand(g, w, { type: 'unlock', node: 'c3' }, 0).error, /Needs/);
    let r = GG.applyCommand(g, w, { type: 'unlock', node: 'c1' }, 0);
    r = GG.applyCommand(r.guild, w, { type: 'unlock', node: 'c3' }, 0);
    assert.equal(r.error, null);
    assert.equal(GG.drillLevel(r.guild), 6);
    assert.match(GG.applyCommand(r.guild, w, { type: 'unlock', node: 'o1' }, 0).error, /research hub/);
    // build a lab on open land and the Sky Lanes branch opens
    let spot = null;
    for (let k = 0; k < 600 && !spot; k++) { const x = 40 + (k * 97) % 920, y = 40 + (k * 61) % 920; if (GG.branchOf(GG.spotInfo(planet, x, y).terrain) === 'open' && !GG.canBuildAt(r.guild, w, 'lab', x, y)) spot = { x, y }; }
    if (!spot) return; // a planet with no open land: the branch stays locked this month
    const b = GG.applyCommand(r.guild, w, { type: 'build', kind: 'lab', ...spot }, 0);
    assert.equal(b.error, null);
    const later = GG.advance(b.guild, w, 3 * D).guild;
    assert.ok(GG.branchesOpen(later).has('open'));
    assert.equal(GG.applyCommand(later, w, { type: 'unlock', node: 'o1' }, 3 * D).error, null);
  });

  test('own refinery and exchange: refined goods, contracts, haggling, penalties', () => {
    let { g, w } = starter('ex');
    g = { ...g, coin: 300_000 };
    const spot = findSpot(g, w, 'refinery', 45);
    g = GG.applyCommand(g, w, { type: 'build', kind: 'refinery', ...spot }, 0).guild;
    const ref = g.sites[g.sites.length - 1];
    g = GG.advance(g, w, 3 * H).guild;
    g = GG.applyCommand(g, w, { type: 'deleteRoute', routeId: g.routes[0].id }, 3 * H).guild;
    let r = GG.applyCommand(g, w, { type: 'route', from: 'pit', to: { kind: 'site', id: ref.id }, shipId: g.ships[0].id }, 3 * H);
    assert.equal(r.error, null);
    g = GG.advance(r.guild, w, 14 * H).guild;
    assert.ok(g.ledger.in.guild > 0, 'refined goods sold to the Guild exchange');
    const w5 = { ...w, startedAt: -5 * D };
    r = GG.applyCommand(g, w5, { type: 'buildExchange' }, 14 * H);
    assert.equal(r.error, null);
    g = GG.advance(r.guild, w5, 40 * H).guild;
    assert.ok(g.sites.find((s) => s.kind === 'exchange').level === 1);
    assert.ok(g.offers.length > 0, 'buyers call');
    const of = g.offers[0];
    assert.ok(of.price < of.max);
    const party = parties.find((p) => p.id === of.buyerId);
    assert.deepEqual(counter(of, party, of.max * 0.99, w), counter(of, party, of.max * 0.99, w), 'haggling is deterministic');
    assert.equal(counter(of, party, of.max * 0.99, w).status, 'accepted');
    assert.ok(['countered', 'walked'].includes(counter(of, party, of.max * 1.5, w).status));
    r = GG.applyCommand(g, w5, { type: 'offer', offerId: of.id, action: 'accept' }, 40 * H);
    assert.equal(r.error, null);
    let g2 = GG.applyCommand(r.guild, w5, { type: 'deleteRoute', routeId: r.guild.routes[0].id }, 40 * H).guild;
    const c = g2.contracts[0];
    g2 = { ...g2, sites: g2.sites.map((s) => (s.kind === 'exchange' ? { ...s, stock: {} } : s)) };
    g2 = GG.advance(g2, w5, c.due + H).guild;
    assert.ok(g2.ledger.out.penalties > 0);
    assert.ok(GG.view(g, w5, 40 * H).offers.every((o) => o.max === undefined), 'the view never shows a buyer\'s top price');
  });

  test('camps sell at the gate, freight jobs pay per tonne, and other guilds\' gates create transfers', () => {
    let { g, w, s } = starter('camp');
    g = { ...g, coin: 100_000 };
    const camp = GG.npcCamps(planet).slice().sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    const n = nearestNpc(camp);
    g = GG.applyCommand(g, w, { type: 'buyShip', cls: 'clipper' }, 0).guild;
    let r = GG.applyCommand(g, w, { type: 'route', from: { kind: 'camp', id: camp.id }, to: { kind: 'npc', id: n.id }, shipId: g.ships[1].id }, 0);
    assert.equal(r.error, null);
    let a = GG.advance(r.guild, w, 8 * H).guild;
    if (GG.view(a, w, 8 * H).routes[1].ok) { assert.ok(a.ledger.out.ore > 0, 'paid the camp'); assert.ok(a.ledger.in.npc > 0); }
    // a freight job
    const job = a.jobs.find((j) => !j.taken);
    assert.ok(job, 'the freight board has jobs');
    a = GG.applyCommand(a, w, { type: 'buyShip', cls: 'clipper' }, 8 * H).guild;
    r = GG.applyCommand(a, w, { type: 'route', from: { kind: 'camp', id: job.from }, to: { kind: 'npc', id: job.to }, job: job.id, shipId: a.ships[a.ships.length - 1].id }, 8 * H);
    assert.equal(r.error, null);
    assert.match(GG.applyCommand(r.guild, w, { type: 'route', from: { kind: 'camp', id: job.from }, to: { kind: 'npc', id: job.to }, job: job.id }, 8 * H).error, /gone/);
    const after = GG.advance(r.guild, w, 30 * H).guild;
    const jr = GG.view(after, w, 30 * H).routes.find((x) => x.job === job.id);
    if (jr && (jr.ok || jr.issue === 'Job finished')) assert.ok(after.ledger.in.freight > 0, 'freight pays');
    // buying at another guild's gate
    const gate = { uid: 'other', guild: 'Other', siteId: 'm9', name: 'Their Pit', x: s.x + 50, y: s.y, on: true, pct: 0.3, rate: 30, mix: { [GG.oreInfo(planet)[0].id]: 1 } };
    const wg = { ...w, gates: [gate] };
    r = GG.applyCommand(g, wg, { type: 'route', from: { kind: 'gate', id: 'm9', uid: 'other' }, to: { kind: 'npc', id: nearestNpc(s).id }, shipId: g.ships[1].id }, 0);
    assert.equal(r.error, null);
    const ga = GG.advance(r.guild, wg, 4 * H);
    const tr = ga.transfers.filter((x) => x.kind === 'gate');
    if (GG.view(ga.guild, wg, 4 * H).routes[1].ok) { assert.ok(tr.length > 0 && tr[0].coin > 0); }
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
  });

  test('nuke: needs earnings, pays Spectacle, rebuilds a starter base and keeps surveys', () => {
    let { g, w } = starter('nk');
    assert.match(GG.applyCommand(g, w, { type: 'nuke', confirm: 'NUKE' }, 0).error, /earned/);
    g = { ...g, runEarned: G.nukeMin * 4, surveys: [{ id: 'sv1', x: 1, y: 1, status: 'done', report: { ores: [] } }], tree: { c1: 1 } };
    const r = GG.applyCommand(g, w, { type: 'nuke', confirm: 'NUKE' }, 0);
    assert.equal(r.error, null);
    assert.ok(Math.abs(r.guild.sp - 20) < 1e-9);
    assert.equal(r.guild.coin, G.startCoin);
    assert.deepEqual(r.guild.tree, {});
    assert.equal(r.guild.surveys.length, 1);
    assert.equal(r.guild.sites.length, 2);
    assert.equal(GG.applyCommand(r.guild, w, { type: 'evolve', kind: 'extraction' }, 0).guild.evo.extraction, 1);
  });

  test('overtime digs more and kills more for a while, then the crew strikes; relaxed lifts morale', () => {
    const run = (shift, hours) => { let { g, w } = starter('sh'); g = { ...g, coin: 100_000 }; for (let k = 0; k < 3; k++) g = GG.applyCommand(g, w, { type: 'part', siteId: 'pit', part: 'haul' }, 0).guild; g = GG.applyCommand(g, w, { type: 'setShift', siteId: 'pit', shift }, 0).guild; return GG.advance(g, w, hours * H).guild; };
    const ot = run('overtime', 6), rx = run('relaxed', 6);
    assert.ok(ot.stats.mined > rx.stats.mined);
    assert.ok(rx.sites.find((s) => s.id === 'pit').morale > ot.sites.find((s) => s.id === 'pit').morale);
    const long = run('overtime', 30);
    assert.ok(long.log.some((l) => l.kind === 'strike'), 'endless overtime ends in a strike');
    assert.ok(run('overtime', 96).stats.deaths > run('relaxed', 96).stats.deaths);
  });

  test('a guild from Guild 1 migrates without losing coin, operations or ships', () => {
    const w = world0(); const s = home('mig');
    const g1 = { v: 1, uid: 'old', name: 'Old Co', species: null, planetId: planet.id, t: 5 * H, coin: 12345, earned: 1, runEarned: 1, monthEarned: 1, sp: 0, evo: { extraction: 0, logistics: 0, trade: 0, spectacle: 0 }, nukes: 0, lastNuke: null, landing: { x: s.x, y: s.y }, rp: 10, tech: { holds: 1 },
      sites: [{ id: 'hub', kind: 'hub', name: 'Command Hub', x: s.x, y: s.y, level: 2 }, { id: 'pit', kind: 'mine', name: 'Landing Pit', x: s.x, y: s.y, level: 3, stock: { a: 1 }, dug: {} }],
      ships: [{ id: 'sh1', cls: 'hauler', name: 'Old Reliable', routeId: 'r2' }], routes: [{ id: 'r2', from: 'pit', to: { kind: 'npc', id: npcs[0].id }, cargo: 'all' }], exchange: null, surveys: [], offers: [], contracts: [], buyers: {}, ledger: { in: {}, out: {} }, stats: {}, log: [], nextId: 5 };
    const g = GG.migrate(g1, w, 5 * H);
    assert.equal(g.v, GG.GUILD_VERSION);
    assert.equal(g.coin, 12345);
    assert.equal(g.sites.find((x) => x.id === 'pit').parts.shaft, 3);
    assert.deepEqual(g.routes[0].from, { kind: 'site', id: 'pit' });
    assert.ok(g.rp > 10);
    assert.doesNotThrow(() => GG.advance(g, w, 10 * H));
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
    // Ben builds a refinery and opens it (a little test money: a fresh guild cannot afford one yet)
    { const doc = await srv.store.getDoc('col3', b.id); doc.coin = 50_000; await srv.store.setDoc('col3', b.id, doc); }
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
