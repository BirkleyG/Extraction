import test from 'node:test';
import assert from 'node:assert/strict';
import { CURVES, UpgradeError, bulkPrice, cartUtilization, dockPrice, MAX_SHAFTS, nextLevelPrice, outpostSitePrice, padPrice, quote, shaftPrice, supportHazardFactor, shaftWorkerCapacity } from '../src/upgrades.js';

const code = (name) => (error) => error instanceof UpgradeError && error.code === name;
const B = 1e9;

test('T10-08 level-1000 family totals match section 10 and fit MAX_COIN', () => {
  const expected = { dig: 757.904, lift: 792.858, shipSpeed: 597.397, surfaceStorage: 625.411, refineryProcessing: 786.014, militaryRate: 777.044 };
  for (const [id, billions] of Object.entries(expected)) {
    const total = bulkPrice(id, 0, 1000);
    assert(Math.abs(total / B - billions) < 0.0006, `${id} ${total / B}`);
    assert(Number.isSafeInteger(total));
  }
  for (const id of Object.keys(CURVES)) assert(Number.isSafeInteger(bulkPrice(id, 0, CURVES[id].cap)));
});

test('T10-01 prices are monotonic positive integers; first dig level is 15', () => {
  assert.equal(nextLevelPrice('dig', 0), 15);
  for (const [id, spec] of Object.entries(CURVES)) {
    let previous = 0;
    for (let level = 0; level < spec.cap; level += 1) {
      const price = nextLevelPrice(id, level);
      assert(Number.isSafeInteger(price) && price >= previous && price >= 1, `${id}@${level}`);
      previous = price;
    }
  }
});

test('bulk price is the sum of individually rounded level prices', () => {
  let sum = 0;
  for (let l = 5; l < 15; l += 1) sum += nextLevelPrice('dig', l);
  assert.equal(bulkPrice('dig', 5, 10), sum);
  assert.deepEqual(quote('dig', 5, 10, sum), { count: 10, total: sum, newLevel: 15 });
  assert.throws(() => quote('dig', 5, 10, sum - 1), code('INSUFFICIENT_FUNDS'));
});

test('Max buys the most levels affordable and never exceeds the cap (T10-03/T10-07)', () => {
  const q = quote('dig', 0, 'max', 1_000);
  assert(q.count > 0 && q.total <= 1_000);
  assert(bulkPrice('dig', 0, q.count + 1) > 1_000);
  const full = quote('dig', 0, 'max', 2 ** 52);
  assert.equal(full.newLevel, 1000);
  assert.throws(() => quote('dig', 1000, 'max', 2 ** 52), code('AT_CAP'));
  assert.throws(() => quote('carts', 8, 10, 2 ** 52), code('AT_CAP'));
  assert.throws(() => quote('dig', 0, 'max', 10), code('INSUFFICIENT_FUNDS'));
});

test('rejects bad input without partial results', () => {
  assert.throws(() => quote('nope', 0, 1, 100), code('UNKNOWN_UPGRADE'));
  assert.throws(() => quote('__proto__', 0, 1, 100), code('UNKNOWN_UPGRADE'));
  assert.throws(() => quote('dig', -1, 1, 100), code('INVALID_LEVEL'));
  assert.throws(() => quote('dig', 0, 7, 100), code('INVALID_MODE'));
  assert.throws(() => quote('dig', 0, 1, -5), code('INVALID_FUNDS'));
  assert.throws(() => bulkPrice('dig', 0, 0), code('INVALID_COUNT'));
});

test('shafts: hard cap of 30, no shaft 31, costs per section 10', () => {
  assert.equal(shaftPrice(2), 288);
  assert.throws(() => shaftPrice(1), code('INVALID_SHAFT'));
  assert.throws(() => shaftPrice(MAX_SHAFTS + 1), code('INVALID_SHAFT'));
  for (let k = 3; k <= 30; k += 1) assert(shaftPrice(k) > shaftPrice(k - 1));
  assert(Number.isSafeInteger(shaftPrice(30)));
});

test('pads, docks, outposts and intelligence follow section 10', () => {
  assert.equal(padPrice(2), 4000);
  assert.equal(padPrice(3), 24000);
  assert.throws(() => padPrice(13), code('INVALID_PAD'));
  assert.equal(dockPrice(2), 20_000_000);
  assert.throws(() => dockPrice(25), code('INVALID_DOCK'));
  assert.equal(outpostSitePrice(1), 2 * B);
  assert.equal(outpostSitePrice(2), 5 * B);
  assert.deepEqual([0, 1, 2, 3, 4].map((l) => nextLevelPrice('intelligence', l)), [1e8, 1e9, 1e10, 1e11, 1e12]);
  assert.throws(() => nextLevelPrice('intelligence', 5), code('AT_CAP'));
});

test('shaft improvement effects', () => {
  assert.equal(shaftWorkerCapacity(0), 10);
  assert.equal(shaftWorkerCapacity(10), 60);
  assert.equal(cartUtilization(0), 0.25);
  assert.equal(cartUtilization(10), 1);
  assert(Math.abs(supportHazardFactor(10) - 0.01) < 1e-12);
});
