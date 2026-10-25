import test from 'node:test';
import assert from 'node:assert/strict';
import { params, simulate } from '../scripts/calibrate-early.mjs';

// C-01 early-game profile (provisional): first minutes must feel like constant building.
test('adopted early-game profile: first sale and purchase within a minute, steady cadence, day-1 near target', () => {
  assert.equal(params.unitPrice, 40);
  assert.equal(params.minLoadUnits, 1);
  const r = simulate();
  assert(r.firstSale <= 5, `first sale ${r.firstSale}s`);
  assert(r.buys[0].t <= 5, `first purchase ${r.buys[0].t}s`);
  assert(r.buys.filter((b) => b.t <= 60).length >= 5, 'at least 5 purchases in the first minute');
  assert(r.buys.filter((b) => b.t <= 300).length >= 10, 'at least 10 purchases in first 5 minutes');
  assert(r.checkpoints[3600] >= 5e4 && r.checkpoints[3600] <= 5e5, `1h earnings ${r.checkpoints[3600]}`);
  const day1 = r.checkpoints[86400];
  assert(day1 >= 0.5e8 && day1 <= 5e8, `day-1 earnings ${day1}`);
});
