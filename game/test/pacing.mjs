// Pacing bot: plays the engine and prints how fast things happen.
//   node game/test/pacing.mjs            (a) 30-minute active session, (b) 30-day month, 4 check-ins a day,
//                                        (c) prestige strategies (no nuke / first chance / day 15 / day 28), run in parallel
//   node game/test/pacing.mjs --quiet    tables only
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import * as E from '../shared/engine/index.js';

export const PLANET = {
  id: 'pace', seed: 1234,
  ores: [
    { id: 'gravel', name: 'Gravel', tier: 'common', hardness: 1, depthMin: 0 },
    { id: 'slate', name: 'Slate', tier: 'common', hardness: 2, depthMin: 3 },
    { id: 'amber', name: 'Amber', tier: 'rare', hardness: 2, depthMin: 1 },
    { id: 'jade', name: 'Jade', tier: 'rare', hardness: 3, depthMin: 4 },
    { id: 'ruby', name: 'Ruby', tier: 'rare', hardness: 5, depthMin: 8 },
    { id: 'opal', name: 'Opal', tier: 'rare', hardness: 7, depthMin: 13 },
    { id: 'star', name: 'Starheart', tier: 'mythic', hardness: 9, depthMin: 17 },
  ],
  buyers: [
    { id: 'depot', name: 'Ring Depot', distance: 'near', likes: { gravel: 1, slate: 1, amber: 0.9 } },
    { id: 'forge', name: 'Forge Moon', distance: 'mid', likes: { amber: 1.3, jade: 1.25, slate: 1.1 } },
    { id: 'court', name: 'Velvet Court', distance: 'far', likes: { ruby: 1.5, opal: 1.4, star: 1.5, gravel: 0.8 } },
    { id: 'yard', name: 'Scrap Yard', distance: 'mid', likes: { gravel: 1.2, jade: 0.9, star: 1.1 } },
  ],
};

// Fixture buyer parties in the Phase 3 contract shape (the real generator lives in game/shared/market/).
const TYPES = { industrial: 1.5, traders: 1.5, military: 2, research: 2.5, political: 3, fringe: 4 };
export function makeParties(planet, { seed = 7, perType = 4, demand = 60 } = {}) {
  let st = seed >>> 0;
  const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const out = [];
  for (const type of Object.keys(TYPES)) for (let i = 0; i < perType; i++) {
    const wants = {};
    const ores = [...planet.ores].sort(() => rnd() - 0.5).slice(0, 2 + Math.floor(rnd() * 3));
    for (const o of ores) wants[o.id] = Math.round((0.2 + 0.8 * rnd()) * 100) / 100;
    out.push({ id: `${type}${i}`, name: `${type} ${i}`, type, blurb: '', personality: '', wants,
      demand: demand * (0.5 + rnd()), ref: 0.8 + 0.8 * rnd(), sigma: TYPES[type] * (0.8 + 0.4 * rnd()), cap: 1.2 + 1.3 * rnd() });
  }
  return out;
}

// The bot's site: gravel ground, three of the four rares (about the 13% of sites that have three), no mythic.
export const SITE = { id: 'pace-site', regionId: 'pace-region', soil: 1, common: 'gravel',
  richness: { gravel: 1, slate: 0, amber: 0.7, jade: 0.55, ruby: 0.5, opal: 0, star: 0 },
  veinSize: { gravel: 1, slate: 1, amber: 1, jade: 1, ruby: 1, opal: 1, star: 1 } };

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const HOARD_FROM = 27; // the bot stops spending on this day so month-end coin compares income, not savings timing

// Greedy: buy the move with the best coin/min per coin; if it is not affordable yet,
// buy an affordable one that is at least half as good, else wait.
const isRef = (m) => m.type === 'buildRefinery' || m.type === 'upgradeRefinery';
export function spend(c, world, now, maxBuys = 400, { noRefine = false } = {}) {
  let buys = 0;
  const exec = (steps) => {
    for (const st of steps) {
      const r = E.applyCommand(c, world, st, now);
      if (r.error) return false;
      c = r.colony; buys++;
    }
    return true;
  };
  while (buys < maxBuys) {
    const cmds = noRefine ? E.candidateMoves(c, world).filter((m) => !isRef(m)) : undefined;
    const moves = E.bestMoves(c, world, { cmds, limit: 0 }).filter((m) => m.gain > 0);
    if (!moves.length) break;
    const best = moves[0];
    let pick = best.canAfford ? best : moves.find((m) => m.canAfford && m.ratio >= 0.5 * best.ratio);
    if (!pick) break;
    const bar = (moves.find((m) => m !== pick)?.ratio || 0);
    if (!exec(pick.steps)) break;
    // keep buying the same thing while it stays better than the runner-up (saves re-ranking everything)
    while (buys < maxBuys) {
      const again = E.bestMoves(c, world, { cmds: [pick.cmd], limit: 0 })[0];
      if (!again || !again.canAfford || !(again.gain > 0) || again.ratio < bar) break;
      if (!exec(again.steps)) break;
    }
  }
  return { c, buys };
}

// Spend SP greedily: the cheapest next level of mine / ship / sale price.
export function evolveGreedy(c, world, now) {
  for (let i = 0; i < 200; i++) {
    const qs = ['sell', 'mine', 'ship'].map((kind) => ({ kind, q: E.quote(c, world, { type: 'evolve', kind, n: 1 }) }))
      .filter((x) => !x.q.error && x.q.canAfford).sort((a, b) => a.q.cost - b.q.cost);
    if (!qs.length) break;
    const r = E.applyCommand(c, world, { type: 'evolve', kind: qs[0].kind, n: 1 }, now);
    if (r.error) break;
    c = r.colony;
  }
  return c;
}

// Price search: per refined ore, try a few markups around the current one and keep the best planning score.
// With refine = 'bad' the bot instead leaves every markup at 3.0.
export function tunePrices(c, world, now, refine = 'tune') {
  for (const site of ['planet', 'orbital']) {
    const R = c.refinery?.[site];
    if (!R) continue;
    for (const o of world.planet.ores) {
      const cur = R.ores?.[o.id]?.markup ?? 1;
      if (refine === 'bad') { if (cur !== 3) c = E.applyCommand(c, world, { type: 'setRefine', site, oreId: o.id, markup: 3 }, now).colony; continue; }
      const row = E.rates(c, world).refinery?.[site]?.byOre?.[o.id];
      if (!row || !(row.inPerMin > 0 || row.stock > 0)) continue;
      let best = null;
      for (const k of [0.7, 0.85, 1, 1.15, 1.3]) {
        const m = Math.min(3, Math.max(0.5, Math.round(cur * k * 100) / 100));
        const r = E.applyCommand(c, world, { type: 'setRefine', site, oreId: o.id, markup: m }, now);
        if (r.error) continue;
        const sc = E.rates(r.colony, world).score;
        if (!best || sc > best.sc + 1e-9) best = { sc, c: r.colony };
      }
      if (best) c = best.c;
    }
  }
  return c;
}

// strategy: 'none' | 'first' (nuke at the first eligible check-in) | a day number (first check-in of that day)
// refine: 'tune' (builds refineries when they pay, searches prices) | 'none' (never refines) | 'bad' (markup 3.0)
function run({ quiet = false, strategy = 'none', refine = 'tune' } = {}) {
  const t0 = performance.now();
  let world = { month: 'pace', planet: PLANET, market: {}, startedAt: 0, endsAt: 30 * DAY, parties: makeParties(PLANET) };
  const noRefine = refine === 'none';
  let refBuilt = null;
  const born = 8 * HOUR;
  let c = E.newColony({ uid: 'bot', name: 'Pace Colony', planet: PLANET, site: SITE, now: born });
  const opened = [];       // { idx, t, dir }: when each shaft was bought
  const track = (t) => { for (const s of c.shafts) if (s.idx > 0 && !opened.some((o) => o.idx === s.idx)) opened.push({ idx: s.idx, t, dir: s.dir }); };
  const veinIn = {}, veinHours = [];
  let hazards = [];
  const step = (to) => {
    const r = E.advance(c, world, to);
    c = r.colony;
    if (r.sales.length) world = E.recordSales(world, r.sales, to);
    for (const e of r.events) {
      if (e.type === 'hazard') hazards.push(e);
      else if (e.type === 'strike' && e.data.tier !== 'common') veinIn[e.data.shaftId + e.data.oreId] = e.at;
      else if (e.type === 'pocketOut' && veinIn[e.data.shaftId + e.data.oreId] != null) { veinHours.push((e.at - veinIn[e.data.shaftId + e.data.oreId]) / HOUR); delete veinIn[e.data.shaftId + e.data.oreId]; }
    }
    return r.events;
  };
  // an active session: a click every 3 seconds
  const active = (from, mins, onTick) => {
    for (let t = from; t <= from + mins * MIN; t += 3000) {
      const ev = step(t);
      const r = spend(c, world, t, 20, { noRefine });
      c = r.c; track(t);
      if (onTick) onTick(t, ev, r.buys);
    }
    return from + mins * MIN;
  };

  // (a) active session: a click every 3 seconds for 30 minutes
  let firstBuy = null, purchases = 0;
  const marks = [];
  const unlockAt = [];
  for (let t = born; t <= born + 30 * MIN; t += 3000) {
    for (const e of step(t)) if (e.type === 'unlock' || e.type === 'license') unlockAt.push(`${Math.round((t - born) / 1000)}s ${e.data.panel || e.data.license}`);
    const r = spend(c, world, t, 20);
    c = r.c; track(t);
    if (r.buys && firstBuy == null) firstBuy = t - born;
    purchases += r.buys;
    if ((t - born) % (5 * MIN) === 0) marks.push({ min: (t - born) / MIN, coin: c.coin, earned: c.earned, cpm: E.rates(c, world).coinPerMin, purchases, shafts: c.shafts.length, ships: c.ships.length, miners: c.miners });
  }
  const out = [];
  out.push('== (a) Active 30-minute session ==');
  out.push(`first purchase: ${(firstBuy / 1000).toFixed(0)}s   first sale: ${c.stats.firstSaleAt == null ? 'never' : ((c.stats.firstSaleAt - born) / 1000).toFixed(0) + 's'}   purchases in 30 min: ${purchases}`);
  out.push('min  coin     earned   coin/min  buys shafts ships miners');
  for (const m of marks) out.push(`${String(m.min).padStart(3)}  ${E.fmt(m.coin).padEnd(8)} ${E.fmt(m.earned).padEnd(8)} ${E.fmt(m.cpm).padEnd(9)} ${String(m.purchases).padStart(4)} ${String(m.shafts).padStart(6)} ${String(m.ships).padStart(5)} ${String(m.miners).padStart(6)}`);
  out.push('unlocks: ' + unlockAt.join(', '));

  // (b) the month: check-ins at 08:00, 12:00, 17:00, 22:00
  const checkins = [8, 12, 17, 22];
  let first20M = null, nukedAt = null, nukeInfo = null, prestigeAt = null;
  const rows = [];
  let t = born + 30 * MIN;
  for (let day = 0; day < 30; day++) {
    for (const h of checkins) {
      const at = day * DAY + h * HOUR;
      if (at <= t) continue;
      while (t < at) {
        t = Math.min(at, t + 30 * MIN);
        step(t);
        if (first20M == null && c.earned >= 2e7) first20M = t;
      }
      if (prestigeAt == null && c.unlocked.panels.includes('prestige')) prestigeAt = t;
      const want = strategy === 'first' || (typeof strategy === 'number' && day + 1 >= strategy);
      if (nukedAt == null && want && E.quote(c, world, { type: 'nuke' }).canAfford) {
        const r = E.applyCommand(c, world, { type: 'nuke', confirm: 'NUKE' }, t);
        if (!r.error) {
          c = r.colony;
          if (r.sales.length) world = E.recordSales(world, r.sales, t);
          nukeInfo = r.events.find((e) => e.type === 'nuke').data;
          nukedAt = t;
          c = evolveGreedy(c, world, t);
          t = active(t, 30); // rebuild with a short active session
          continue;
        }
      }
      if (!noRefine && !c.refinery?.planet && E.quote(c, world, { type: 'buildRefinery', site: 'planet' }).canAfford) {
        c = E.applyCommand(c, world, { type: 'buildRefinery', site: 'planet' }, t).colony; // a player builds as soon as the license lands
      }
      if (day < HOARD_FROM - 1) { c = spend(c, world, t, 400, { noRefine }).c; track(t); } // closing bell: the bot hoards the last days
      if (!noRefine) c = tunePrices(c, world, t, refine);
      if (refBuilt == null && (c.refinery?.planet || c.refinery?.orbital)) refBuilt = t;
    }
    const end = (day + 1) * DAY;
    while (t < end) { t = Math.min(end, t + 30 * MIN); step(t); if (first20M == null && c.earned >= 2e7) first20M = t; }
    const r = E.rates(c, world);
    const refCpm = Object.values(r.refinery || {}).reduce((a, x) => a + x.coinPerMin, 0);
    rows.push({ ref: refCpm, sites: ['planet', 'orbital'].filter((k) => c.refinery?.[k]).map((k) => k[0]).join(''), asks: c.refinery?.planet ? Object.values(c.refinery.planet.ores).map((x) => x.markup).join('/') : '', day: day + 1, coin: c.coin, earned: c.earned, cpm: r.coinPerMin, shafts: c.shafts.length, ships: c.ships.length, mix: ['hauler','cruiser','freighter'].map(k => c.ships.filter(s => s.cls === k).length).join('/'), miners: c.miners, gear: Math.max(...c.shafts.map((s) => s.gear)),
      bn: E.bottleneck(c, world).stage, exh: r.shafts.filter((x) => x.blocked).length, dug: c.shafts.reduce((a, s) => a + (s.dug || 0), 0), face: Math.max(0, ...c.shafts.map((s) => s.face || 0)), month: c.monthEarned });
  }
  const result = {
    strategy, coin: c.coin, monthEarned: c.monthEarned, sp: c.sp, evo: c.evo, nukedAt, nukeInfo, first20M, prestigeAt,
    hazards: hazards.length, lost: c.stats.lost, safety: c.safety,
    byKind: hazards.reduce((a, e) => { a[e.data.kind] = (a[e.data.kind] || 0) + 1; return a; }, {}),
    refine, refBuilt, ledger: c.ledger,
    rows: rows.map((r) => ({ day: r.day, coin: r.coin, month: r.month, cpm: r.cpm, ref: r.ref })), secs: (performance.now() - t0) / 1000,
  };
  if (strategy !== 'none' || refine !== 'tune') return result;
  out.push('');
  out.push('== (b) 30-day month, 4 check-ins/day, greedy ==');
  out.push('day  coin     earned   coin/min  refined/m  shafts ships miners gear  stuck dug longest bottleneck  refineries');
  for (const r of rows) out.push(`${String(r.day).padStart(3)}  ${E.fmt(r.coin).padEnd(8)} ${E.fmt(r.earned).padEnd(8)} ${E.fmt(r.cpm).padEnd(9)} ${E.fmt(r.ref).padEnd(10)} ${String(r.shafts).padStart(6)} ${String(r.ships).padStart(5)} ${String(r.miners).padStart(6)} ${String(r.gear).padStart(5)} ${String(r.exh).padStart(5)} ${String(r.dug).padStart(4)} ${(Math.round(r.face) + 'm').padStart(7)} ${r.bn.padEnd(10)}  ${r.sites} ${r.asks}`);
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  out.push('shaft open times (day): ' + (opened.length ? opened.map((o) => `#${o.idx + 1} ${(o.t / DAY + 1).toFixed(2)} ${o.dir}`).join(' · ') : 'none'));
  out.push(`veins finished: ${veinHours.length}, hours min/median/max: ${veinHours.length ? [Math.min(...veinHours), med(veinHours), Math.max(...veinHours)].map((x) => x.toFixed(1)).join(' / ') : '-'}`);
  out.push(`first 20M earned: ${first20M == null ? 'never' : 'day ' + (first20M / DAY + 1).toFixed(2)} · prestige panel: day ${prestigeAt == null ? '-' : (prestigeAt / DAY + 1).toFixed(2)}`);
  out.push(`hazards: ${hazards.length} (${Object.entries(result.byKind).map(([k, v]) => k + ' ' + v).join(', ')}), miners lost ${c.stats.lost}, safety ${JSON.stringify(c.safety)}, lights/supports avg ${(c.shafts.reduce((a, s) => a + (s.up.lights || 0), 0) / c.shafts.length).toFixed(1)}/${(c.shafts.reduce((a, s) => a + (s.up.supports || 0), 0) / c.shafts.length).toFixed(1)}`);
  for (const e of hazards.slice(0, 4)) out.push(`  day ${(e.at / DAY + 1).toFixed(2)}: ${e.text}`);
  if (!quiet) console.log('ship mix hauler/cruiser/freighter by day:', rows.filter((r) => [1, 3, 5, 10, 20, 30].includes(r.day)).map((r) => r.day + ':' + r.mix).join('  '));
  const lg = c.ledger.month;
  out.push(`ledger (month): in ${Object.entries(lg.in).map(([k, v]) => k + ' ' + E.fmt(v)).join(', ')} · out ${Object.entries(lg.out).map(([k, v]) => k + ' ' + E.fmt(v)).join(', ')}`);
  out.push(`colony JSON size: ${(JSON.stringify(c).length / 1024).toFixed(1)} KB · market: ${E.marketTable(world, t).map((m) => m.id + ' ' + m.index.toFixed(2)).join(', ')}`);
  out.push(`ran in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  if (!quiet) console.log(out.join('\n'));
  return { ...result, firstBuy, firstSale: c.stats.firstSaleAt - born, purchases, rows };
}

// (c) prestige strategies, one worker each (they all play the same month from the start).
async function strategies() {
  const t0 = performance.now();
  const only = process.argv.includes('--refine') ? 'refine' : process.argv.includes('--nuke') ? 'nuke' : null;
  const strats = only === 'refine' ? [] : ['first', 15, 28];
  const refs = only === 'nuke' ? [] : ['none', 'bad'];
  const job = (data) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: data });
    w.once('message', res); w.once('error', rej);
  });
  const jobs = strats.map((strategy) => job({ strategy }));
  const rjobs = refs.map((refine) => job({ strategy: 'none', refine }));
  const base = run({ quiet: process.argv.includes('--quiet'), strategy: 'none' });
  const rres = await Promise.all(rjobs);
  console.log(`\n== (d) Refining: month-end coin (bot hoards from day ${HOARD_FROM}) ==`);
  console.log('bot               built   coin@30   earned@10 earned@20 earned@30  refined in   vs no refine');
  const noRef = rres.find((r) => r.refine === 'none') || base;
  for (const r of [base, ...rres]) {
    const nm = { tune: 'refine, tuned', none: 'never refines', bad: 'refine, markup 3' }[r.refine];
    console.log(`${nm.padEnd(17)} ${(r.refBuilt == null ? '-' : 'day ' + (r.refBuilt / DAY + 1).toFixed(1)).padEnd(7)} ${E.fmt(r.coin).padEnd(9)} ${E.fmt(r.rows[9].month).padEnd(9)} ${E.fmt(r.rows[19].month).padEnd(9)} ${E.fmt(r.rows[29].month).padEnd(10)} ${E.fmt(r.ledger.month.in.refined).padEnd(12)} ${(r.coin / noRef.coin).toFixed(2)}x coin, ${(r.monthEarned / noRef.monthEarned).toFixed(2)}x earned`);
  }
  if (!strats.length) return;
  const all = [base, ...(await Promise.all(jobs))];
  const name = (s) => (s === 'none' ? 'no nuke' : s === 'first' ? 'first chance' : 'day ' + s);
  const at = (r, d) => E.fmt(r.rows[d - 1].month);
  console.log(`\n== (c) Prestige: month-end coin (bot hoards from day ${HOARD_FROM}) ==`);
  console.log('strategy      nuke day  spectacle  evo m/s/p      coin@30   earned@10 earned@20 earned@30  d21-30    coin vs no nuke');
  for (const r of all) {
    const ev = r.evo ? `${r.evo.mine}/${r.evo.ship}/${r.evo.sell}` : '-';
    console.log(`${name(r.strategy).padEnd(13)} ${(r.nukedAt == null ? '-' : (r.nukedAt / DAY + 1).toFixed(2)).padEnd(9)} ${(r.nukeInfo ? r.nukeInfo.spectacle.toFixed(1) : '-').padEnd(10)} ${ev.padEnd(14)} ${E.fmt(r.coin).padEnd(9)} ${at(r, 10).padEnd(9)} ${at(r, 20).padEnd(9)} ${at(r, 30).padEnd(10)} ${E.fmt(r.rows[29].month - r.rows[19].month).padEnd(9)} ${(r.coin / base.coin).toFixed(2)}x`);
  }
  console.log(`strategies ran in ${((performance.now() - t0) / 1000).toFixed(1)}s (parallel)`);
}

if (!isMainThread && workerData) parentPort.postMessage(run({ quiet: true, strategy: workerData.strategy, refine: workerData.refine || 'tune' }));
else if (import.meta.url === `file://${process.argv[1]}`) strategies();
export { run };
