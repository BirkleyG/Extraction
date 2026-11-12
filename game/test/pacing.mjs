// Pacing bot: plays the engine and prints how fast things happen.
//   node game/test/pacing.mjs            (a) 30-minute active session, (b) 30-day month, 4 check-ins a day
//   node game/test/pacing.mjs --quiet    tables only
import * as E from '../shared/engine/index.js';

export const PLANET = {
  id: 'pace', seed: 1234,
  ores: [
    { id: 'gravel', name: 'Gravel', tier: 'common', hardness: 1, depthMin: 0 },
    { id: 'slate', name: 'Slate', tier: 'common', hardness: 2, depthMin: 3 },
    { id: 'amber', name: 'Amber', tier: 'rare', hardness: 2, depthMin: 1 },
    { id: 'jade', name: 'Jade', tier: 'rare', hardness: 3, depthMin: 4 },
    { id: 'ruby', name: 'Ruby', tier: 'rare', hardness: 4, depthMin: 8 },
    { id: 'opal', name: 'Opal', tier: 'rare', hardness: 5, depthMin: 13 },
    { id: 'star', name: 'Starheart', tier: 'mythic', hardness: 5, depthMin: 17 },
  ],
  buyers: [
    { id: 'depot', name: 'Ring Depot', distance: 'near', likes: { gravel: 1, slate: 1, amber: 0.9 } },
    { id: 'forge', name: 'Forge Moon', distance: 'mid', likes: { amber: 1.3, jade: 1.25, slate: 1.1 } },
    { id: 'court', name: 'Velvet Court', distance: 'far', likes: { ruby: 1.5, opal: 1.4, star: 1.5, gravel: 0.8 } },
    { id: 'yard', name: 'Scrap Yard', distance: 'mid', likes: { gravel: 1.2, jade: 0.9, star: 1.1 } },
  ],
};

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

// Greedy: buy the move with the best coin/min per coin; if it is not affordable yet,
// buy an affordable one that is at least half as good, else wait.
export function spend(c, world, now, maxBuys = 400) {
  let buys = 0;
  for (; buys < maxBuys;) {
    const moves = E.bestMoves(c, world, { limit: 0 }).filter((m) => m.gain > 0);
    if (!moves.length) break;
    const best = moves[0];
    const pick = best.canAfford ? best : moves.find((m) => m.canAfford && m.ratio >= 0.5 * best.ratio);
    if (!pick) break;
    let ok = true;
    for (const st of pick.steps) {
      const r = E.applyCommand(c, world, st, now);
      if (r.error) { ok = false; break; }
      c = r.colony; buys++;
    }
    if (!ok) break;
  }
  return { c, buys };
}

function run({ quiet = false } = {}) {
  const t0 = performance.now();
  let world = { month: 'pace', planet: PLANET, market: {}, startedAt: 0, endsAt: 30 * DAY };
  const born = 8 * HOUR;
  let c = E.newColony({ uid: 'bot', name: 'Pace Colony', planet: PLANET, now: born });
  const step = (to) => {
    const r = E.advance(c, world, to);
    c = r.colony;
    if (r.sales.length) world = E.recordSales(world, r.sales, to);
    return r.events;
  };

  // (a) active session: a click every 3 seconds for 30 minutes
  let firstBuy = null, purchases = 0;
  const marks = [];
  const unlockAt = [];
  for (let t = born; t <= born + 30 * MIN; t += 3000) {
    for (const e of step(t)) if (e.type === 'unlock' || e.type === 'license') unlockAt.push(`${Math.round((t - born) / 1000)}s ${e.data.panel || e.data.license}`);
    const r = spend(c, world, t, 20);
    c = r.c;
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
  let first20M = null;
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
      c = spend(c, world, t).c;
    }
    const end = (day + 1) * DAY;
    while (t < end) { t = Math.min(end, t + 30 * MIN); step(t); if (first20M == null && c.earned >= 2e7) first20M = t; }
    const r = E.rates(c, world);
    rows.push({ day: day + 1, coin: c.coin, earned: c.earned, cpm: r.coinPerMin, shafts: c.shafts.length, ships: c.ships.length, miners: c.miners, drill: c.drill,
      bn: E.bottleneck(c, world).stage, exh: c.shafts.filter((s) => s.vein && s.vein.left <= 0).length });
  }
  out.push('');
  out.push('== (b) 30-day month, 4 check-ins/day, greedy ==');
  out.push('day  coin     earned   coin/min  shafts ships miners drill exhausted bottleneck');
  for (const r of rows) out.push(`${String(r.day).padStart(3)}  ${E.fmt(r.coin).padEnd(8)} ${E.fmt(r.earned).padEnd(8)} ${E.fmt(r.cpm).padEnd(9)} ${String(r.shafts).padStart(6)} ${String(r.ships).padStart(5)} ${String(r.miners).padStart(6)} ${String(r.drill).padStart(5)} ${String(r.exh).padStart(9)} ${r.bn}`);
  out.push(`first 20M earned: ${first20M == null ? 'never' : 'day ' + (first20M / DAY + 1).toFixed(2)}`);
  out.push(`colony JSON size: ${(JSON.stringify(c).length / 1024).toFixed(1)} KB · market: ${E.marketTable(world, t).map((m) => m.id + ' ' + m.index.toFixed(2)).join(', ')}`);
  out.push(`ran in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  if (!quiet) console.log(out.join('\n'));
  return { firstBuy, firstSale: c.stats.firstSaleAt - born, purchases, first20M, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) run({ quiet: process.argv.includes('--quiet') && false });
export { run };
