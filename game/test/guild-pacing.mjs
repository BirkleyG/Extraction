// Guild pacing bot: plays a month with a few check-ins a day and prints how guilds grow and where their coin goes.
//   node game/test/guild-pacing.mjs [--checkins 4] [--seed s] [--days 30]
// Runs three strategies side by side on one planet (they share the market):
//   integrated  mines, refineries, an exchange: owns the whole chain
//   hauler      keeps only the landing pit; lives on Guild freight jobs and buying at prospector camps
//   refiner     buys ore at camps, refines it, sells through an exchange
// Every bot buys parts by the best payback it can estimate, so the spending mix shows whether one purchase dominates.
import * as GG from '../shared/guild/index.js';
import { improvisePlanet, startSpot } from '../shared/planet/index.js';
import { generateParties } from '../shared/market/parties.js';

const H = 3_600_000, D = 24 * H;
const G = GG.GUILD_TUNING;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CHECK = Number(arg('checkins', 4));
const DAYS = Number(arg('days', 30));
const planet = improvisePlanet(arg('seed', 'pace1'), { history: [] });
let world = { month: 'pace', planet, parties: generateParties('pace', planet), flow: {}, changes: [], startedAt: 0, endsAt: 30 * D, directory: [], gates: [], sites: [] };
const npcs = GG.npcRefineries(planet), camps = GG.npcCamps(planet);
const O = Object.fromEntries(GG.oreInfo(planet).map((o) => [o.id, o]));
const near = (list, p) => list.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];

function pickStart(taken, seed) {
  for (let k = 0; k < 60; k++) {
    const s = startSpot(planet, taken, seed + ':' + k);
    if (s && npcs.some((n) => Math.hypot(n.x - s.x, n.y - s.y) <= 230) && taken.every((t) => Math.hypot(t.x - s.x, t.y - s.y) > 200)) return s;
  }
  return startSpot(planet, taken, seed);
}
const STRATS = (arg('strats', 'integrated,hauler,refiner,integrated')).split(',');
const bots = STRATS.map((strat, i) => {
  const s = pickStart([], 'bot' + i);
  return { strat, g: GG.newGuild({ uid: 'b' + i, name: `${strat} ${i}`, world, x: s.x, y: s.y, now: 0 }) };
});
let R0 = 7; const R = () => { R0 = (Math.imul(R0, 1664525) + 1013904223) >>> 0; return R0 / 4294967296; };
const cmd = (b, c, t) => { const r = GG.applyCommand(b.g, world, c, t); b.g = r.guild; return r.error; };
const V = (b, t) => GG.view(b.g, world, t);

// value per hour of a mine's output if sold to the nearest contractor
const mineValue = (v, s) => Object.entries(s.rates || {}).reduce((a, [id, r]) => a + r * (v.npcPrices[near(npcs, s).id]?.[id] || 0), 0);

// try every affordable part on every operation and buy the one with the best payback
function buyParts(b, t, budget) {
  for (let k = 0; k < 12; k++) {
    const v = V(b, t);
    let best = null;
    for (const s of v.sites.filter((x) => x.level >= 1)) {
      for (const p of s.parts) {
        if (p.cost == null || p.cost > budget) continue;
        let gain = 0;
        const trial = GG.applyCommand(b.g, world, { type: 'part', siteId: s.id, part: p.id }, t);
        if (trial.error) continue;
        const tv = GG.view(trial.guild, world, t);
        const ts = tv.sites.find((x) => x.id === s.id);
        if (s.kind === 'mine') {
          // crew for new parts arrives later: value the fully staffed output
          const staffed = ts.staff < 1 && ts.need ? ts.dig / Math.max(0.05, ts.staff) : ts.dig;
          const before = s.staff < 1 && s.need ? s.dig / Math.max(0.05, s.staff) : s.dig;
          const rock = (x, d) => Math.min(d, x.haul, x.store / 3);
          const val = mineValue(v, s) / Math.max(0.01, s.rock || s.dig || 1);
          gain = (rock(ts, staffed) - rock(s, before)) * val - p.crew * (G.labor.wage + G.labor.price / 48);
        } else if (s.kind === 'refinery') {
          // refining margin over selling raw to a contractor, on the ore that would actually flow
          const avgP = Object.values(v.prices).filter((x) => x.tier !== 'mythic').reduce((a, x) => a + x.p, 0) / 6;
          const margin = (0.55 * s.yield - 0.33) * avgP * 0.25;
          const flow = (x) => Math.min(x.thru || Math.min(x.feed, x.vats), x.intake, s.inflow + 5);
          gain = (flow(ts) - flow(s)) * margin + (ts.yield - s.yield) * flow(s) * avgP * 0.25 * 0.55 - p.crew * (G.labor.wage + G.labor.price / 48);
        } else if (s.kind === 'hub') {
          if (p.id === 'hangar' && b.g.ships.length >= v.hangar - 1) gain = 200;
          if (p.id === 'bunks' && v.labor.pool + 5 >= v.labor.cap) gain = 120;
          if (p.id === 'office') gain = 30;
        } else if (s.kind === 'lab') gain = p.id === 'desk' ? 40 : 30;
        else if (s.kind === 'exchange') gain = p.id === 'floor' ? 300 : p.id === 'desk' ? 200 : 100;
        const roi = gain / p.cost;
        if (gain > 0 && roi > 1 / 72 && (!best || roi > best.roi)) best = { s, p, roi };
      }
    }
    if (!best) return;
    cmd(b, { type: 'part', siteId: best.s.id, part: best.p.id }, t);
    budget -= best.p.cost;
  }
}

function fillShips(b, t, r, want, cls = 'hauler') {
  for (let k = 0; k < 6; k++) {
    const v = V(b, t);
    const ri = v.routes.find((x) => x.id === r);
    if (!ri || ri.tph >= want) return;
    const idle = b.g.ships.find((s) => !s.routeId);
    if (idle) { cmd(b, { type: 'assign', shipId: idle.id, routeId: r }, t); continue; }
    if (b.g.ships.length >= v.hangar) { const hub = v.sites.find((s) => s.kind === 'hub'); const hp = hub.parts.find((p) => p.id === 'hangar'); if (hp.cost && b.g.coin > hp.cost) cmd(b, { type: 'part', siteId: 'hub', part: 'hangar' }, t); else return; }
    if (b.g.coin < v.shipCosts[cls] + 800 || cmd(b, { type: 'buyShip', cls, routeId: r }, t)) return;
  }
}

function play(b, t) {
  let v = V(b, t);
  const day = v.day, g = b.g;
  for (const d of v.decisions) cmd(b, { type: 'decide', decisionId: d.id, choice: d.kind === 'cavein' ? (g.coin > d.cost * 3 ? 'rescue' : 'seal') : 'bonus' }, t);
  for (const o of v.offers) cmd(b, { type: 'offer', offerId: o.id, action: R() < 0.5 ? 'accept' : 'counter', price: Math.round(o.price * 1.1 * 100) / 100 }, t);
  // research: cheapest open node
  const open = new Set(v.branches);
  for (const [id, N] of Object.entries(GG.NODES).sort((a, c) => a[1].rp - c[1].rp)) if (!b.g.tree[id] && open.has(N.b) && (!N.needs || b.g.tree[N.needs]) && b.g.rp >= N.rp) cmd(b, { type: 'unlock', node: id }, t);
  const hub = v.sites.find((s) => s.kind === 'hub');
  const refinery = v.sites.find((s) => s.kind === 'refinery' && s.level >= 1);

  if (b.strat === 'hauler') {
    // take freight jobs; otherwise buy at the camp nearest a contractor and sell
    for (const j of v.jobs.filter((x) => !x.taken && !x.done)) {
      const c = camps.find((x) => x.id === j.from), n = npcs.find((x) => x.id === j.to);
      const d = Math.hypot(c.x - hub.x, c.y - hub.y) + Math.hypot(c.x - n.x, c.y - n.y);
      if (d > 800) continue;
      const idle = b.g.ships.find((s) => !s.routeId);
      if (!cmd(b, { type: 'route', from: { kind: 'camp', id: c.id }, to: { kind: 'npc', id: n.id }, job: j.id, shipId: idle?.id }, t)) { const r = b.g.routes[b.g.routes.length - 1]; fillShips(b, t, r.id, 30); }
    }
    for (const r of b.g.routes.filter((r) => r.job && GG.view(b.g, world, t).routes.find((x) => x.id === r.id)?.issue === 'Job finished')) cmd(b, { type: 'deleteRoute', routeId: r.id }, t);
    if (!b.g.routes.some((r) => r.from.id === 'pit')) cmd(b, { type: 'route', from: 'pit', to: { kind: 'npc', id: near(npcs, hub).id } }, t);
    fillShips(b, t, b.g.routes.find((r) => r.from.id === 'pit').id, V(b, t).sites.find((s) => s.id === 'pit').tph);
    if (!b.g.routes.some((r) => r.from.kind === 'camp' && !r.job)) { const c = near(camps, hub); cmd(b, { type: 'route', from: { kind: 'camp', id: c.id }, to: { kind: 'npc', id: near(npcs, c).id } }, t); }
    const camp = b.g.routes.find((r) => r.from.kind === 'camp' && !r.job);
    if (camp) fillShips(b, t, camp.id, G.camps.rate);
    buyParts(b, t, b.g.coin * 0.5);
    return;
  }

  if (b.strat === 'refiner') {
    if (!v.sites.some((s) => s.kind === 'refinery') && g.coin > G.build.refinery.cost) {
      for (let k = 0; k < 30; k++) { const a = R() * 6.28, d = 30 + R() * 40; if (!cmd(b, { type: 'build', kind: 'refinery', x: hub.x + Math.cos(a) * d, y: hub.y + Math.sin(a) * d }, t)) break; }
    }
    v = V(b, t);
    const ref = v.sites.find((s) => s.kind === 'refinery' && s.level >= 1);
    const dest = ref ? { kind: 'site', id: ref.id } : { kind: 'npc', id: near(npcs, hub).id };
    for (const r of b.g.routes) if (ref && r.to.kind === 'npc') cmd(b, { type: 'deleteRoute', routeId: r.id }, t);
    if (!b.g.routes.some((r) => r.from.id === 'pit')) cmd(b, { type: 'route', from: 'pit', to: dest }, t);
    fillShips(b, t, b.g.routes.find((r) => r.from.id === 'pit').id, V(b, t).sites.find((s) => s.id === 'pit').tph);
    for (const c of camps.slice().sort((a, c2) => Math.hypot(a.x - hub.x, a.y - hub.y) - Math.hypot(c2.x - hub.x, c2.y - hub.y)).slice(0, ref ? 3 : 1)) {
      if (!b.g.routes.some((r) => r.from.id === c.id)) cmd(b, { type: 'route', from: { kind: 'camp', id: c.id }, to: dest }, t);
      const r = b.g.routes.find((x) => x.from.id === c.id);
      if (r) fillShips(b, t, r.id, G.camps.rate);
    }
  } else {
    // integrated: mines feeding own refinery, then an exchange
    for (const s of V(b, t).sites.filter((x) => x.kind === 'mine' && x.level >= 1)) {
      let r = b.g.routes.find((x) => x.from.id === s.id);
      // send to our refinery only while it keeps up; the rest goes to a contractor
      const intoRef = V(b, t).routes.filter((x) => x.to?.kind === 'site').reduce((a, x) => a + x.tph, 0);
      const fits = refinery && (r && r.to.kind === 'site' ? intoRef <= refinery.thru * 1.15 : intoRef + s.tph <= refinery.thru * 1.15);
      const dest = refinery && fits && Math.hypot(refinery.x - s.x, refinery.y - s.y) < 300 ? { kind: 'site', id: refinery.id } : { kind: 'npc', id: near(npcs, s).id };
      if (r && r.to.kind !== dest.kind) {
        const ships = b.g.ships.filter((x) => x.routeId === r.id).map((x) => x.id);
        cmd(b, { type: 'deleteRoute', routeId: r.id }, t);
        cmd(b, { type: 'route', from: s.id, to: dest, shipIds: ships }, t); r = b.g.routes[b.g.routes.length - 1];
      }
      if (!r) { cmd(b, { type: 'route', from: s.id, to: dest }, t); r = b.g.routes[b.g.routes.length - 1]; }
      fillShips(b, t, r.id, s.tph * 1.05);
    }
    v = V(b, t);
    if (!v.sites.some((s) => s.kind === 'refinery') && day >= 2 && b.g.coin > 9_000) {
      for (let k = 0; k < 30; k++) { const a = R() * 6.28, d = 30 + R() * 40; if (!cmd(b, { type: 'build', kind: 'refinery', x: hub.x + Math.cos(a) * d, y: hub.y + Math.sin(a) * d }, t)) break; }
    }
    // survey and found mines at the best report
    for (let k = V(b, t).flying; k < V(b, t).drones; k++) { const a = R() * 6.28, d = 40 + R() * 160; cmd(b, { type: 'survey', x: hub.x + Math.cos(a) * d, y: hub.y + Math.sin(a) * d }, t); }
    const reports = b.g.surveys.filter((s) => s.status === 'done' && !s.used).map((s) => ({ s, val: s.report.ores.reduce((a, o) => a + (o.hardness <= GG.drillLevel(b.g) ? o.est * O[o.id].pbar * G.mine.share[O[o.id].tier] : 0), 0) })).sort((a, c) => c.val - a.val);
    const mines = b.g.sites.filter((s) => s.kind === 'mine').length;
    if (reports[0] && mines < 10 && b.g.coin > GG.foundQuote(b.g, 'mine', reports[0].s.x, reports[0].s.y).cost * (1.5 + mines * 0.4)) {
      cmd(b, { type: 'build', kind: 'mine', x: reports[0].s.x, y: reports[0].s.y }, t);
      b.g.surveys.find((x) => x.id === reports[0].s.id).used = true;
    }
  }
  // both builders: a lab in a new kind of land, the exchange
  v = V(b, t);
  const labs = v.sites.filter((s) => s.kind === 'lab');
  if (day >= 3 && labs.length < 2 && b.g.coin > 12_000) {
    for (let k = 0; k < 40; k++) {
      const a = R() * 6.28, d = 60 + R() * 200, x = hub.x + Math.cos(a) * d, y = hub.y + Math.sin(a) * d;
      const br = GG.branchOf(GG.spotInfo(planet, x, y).terrain);
      if (labs.some((l) => GG.branchOf(l.terrain) === br)) continue;
      if (!cmd(b, { type: 'build', kind: 'lab', x, y }, t)) break;
    }
  }
  if (!b.g.sites.some((s) => s.kind === 'exchange') && v.lic.exchange && v.sites.some((s) => s.kind === 'refinery' && s.level >= 1) && b.g.coin > 60_000) cmd(b, { type: 'buildExchange' }, t);
  buyParts(b, t, b.g.coin * 0.6);
}

const t0 = performance.now();
const marks = [1, 2, 3, 5, 7, 10, 14, 18, 22, 26, 30].filter((d) => d <= DAYS);
console.log('day  ' + bots.map((b) => b.g.name.padEnd(34)).join(''));
const checkHours = Array.from({ length: CHECK }, (_, k) => Math.round(8 + (k * 14) / Math.max(1, CHECK - 1)));
for (let t = 0; t <= DAYS * D; t += H) {
  for (const b of bots) {
    const r = GG.advance(b.g, world, t);
    b.g = r.guild;
    world = GG.recordSales(world, r.sales, t);
  }
  const hour = (t / H) % 24;
  if (checkHours.includes(hour)) for (const b of bots) play(b, t);
  const day = Math.floor(t / D) + 1;
  if (hour === 23 && marks.includes(day)) {
    console.log(String(day).padStart(3) + '  ' + bots.map((b) => { const v = V(b, t); return `${GG.fmt(b.g.coin).padStart(6)} ${GG.fmt(v.netH).padStart(6)}/h ops${b.g.sites.length} sh${b.g.ships.length} w${v.labor.crew + v.labor.pool}`.padEnd(34); }).join(''));
  }
}
console.log('\nwhere the coin went (share of spending):');
for (const b of bots) {
  const out = b.g.ledger.out, tot = Object.values(out).reduce((a, c) => a + Math.max(0, c), 0);
  const inc = b.g.ledger.in, ti = Object.values(inc).reduce((a, c) => a + c, 0);
  console.log(`${b.g.name.padEnd(14)} out ${Object.entries(out).filter(([, x]) => x > 0).sort((a, c) => c[1] - a[1]).map(([k, x]) => `${k} ${Math.round((x / tot) * 100)}%`).join(' ')}`);
  console.log(`${''.padEnd(14)} in  ${Object.entries(inc).filter(([, x]) => x > 0).sort((a, c) => c[1] - a[1]).map(([k, x]) => `${k} ${Math.round((x / ti) * 100)}%`).join(' ')} · deaths ${b.g.stats.deaths} · incidents ${b.g.stats.incidents} · tree ${Object.keys(b.g.tree).length}`);
  const parts = {};
  for (const s of b.g.sites) for (const [p, l] of Object.entries(s.parts || {})) parts[`${s.kind}.${p}`] = Math.max(parts[`${s.kind}.${p}`] || 0, l);
  console.log(`${''.padEnd(14)} top part levels ${Object.entries(parts).filter(([, l]) => l > 1).map(([k, l]) => `${k}:${l}`).join(' ')}`);
}
const P = GG.prices(world, DAYS * D);
console.log('market idx:', Object.entries(P).map(([k, v]) => `${k.slice(0, 10)} ${v.idx.toFixed(2)}`).join(' | '));
console.log('sample log:', bots[0].g.log.filter((l) => ['death', 'incident', 'rescue', 'sealed', 'strike'].includes(l.kind)).slice(-3).map((l) => l.text));
console.log('ran in', Math.round(performance.now() - t0), 'ms');
if (process.argv.includes('--debug')) {
  const b = bots[0]; const v = V(b, DAYS * D);
  console.log('debug', b.g.name, 'income', Math.round(v.incomeH), 'wages', Math.round(v.wagesH), 'upkeep', Math.round(v.upkeepH));
  for (const s of v.sites) console.log(' ', s.kind.padEnd(9), s.name.padEnd(16), s.kind === 'mine' ? `dig ${s.dig.toFixed(0)} haul ${s.haul.toFixed(0)} rock ${s.rock.toFixed(0)} ship ${s.shipping.toFixed(0)} stock ${s.stockTot.toFixed(0)}/${s.store.toFixed(0)} crew ${s.crew}/${s.need} mor ${s.morale} halt ${!!s.halted} dec ${!!s.decision} val ${s.value.toFixed(0)}` : s.kind === 'refinery' ? `thru ${s.thru.toFixed(0)} in ${s.inflow.toFixed(0)} silo ${s.inputTot.toFixed(0)}/${s.store.toFixed(0)}` : `crew ${s.crew}/${s.need}`);
  for (const r of v.routes) console.log('  route', r.from?.name, '->', r.to?.name, r.tph.toFixed(1), r.ships, r.issue);
}
