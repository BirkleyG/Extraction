// autoSpend: buy the best-value moves in order until the budget runs out.
// One command, so a check-in turns a pile of coin into progress with a single tap.
import { applyNow } from './commands.js';
import { advance } from './sim.js';
import { bestMoves } from './analysis.js';
import { fmt } from './util.js';

const MAX_STEPS = 60;

export function autoSpend(colony, world, cmd, now) {
  const r = advance(colony, world, now);
  const c = r.colony;
  const events = r.events;
  const keep = Math.min(0.9, Math.max(0, Number(cmd.keep) || 0)); // fraction of coin to hold back
  const floor = c.coin * keep;
  const start = c.coin;
  let bought = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const move = bestMoves(c, world, { limit: 12 }).find((m) => m.gain > 0 && m.cost <= c.coin - floor);
    if (!move) break;
    let ok = true;
    for (const step of move.steps) { if (applyNow(c, world, step, events)) { ok = false; break; } bought++; }
    if (!ok) break;
  }
  const spent = start - c.coin;
  if (!bought) return { colony: c, events, sales: r.sales, error: 'Nothing worth buying right now. Save up a little.' };
  events.push({ type: 'autoSpend', text: `Spent ${fmt(spent)} on ${bought} upgrade${bought > 1 ? 's' : ''}`, at: c.t, data: { spent, bought } });
  return { colony: c, events, sales: r.sales };
}
