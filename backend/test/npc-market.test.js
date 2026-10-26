import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRefineries, initialMarketState, advanceMarket, quoteCargo, refineryOffer, dockWaitSeconds, reserveDock,
  DEFAULT_PREMIUM, TIER_REFERENCE, NpcMarketError,
} from '../src/npc-market.js';

const refs = () => generateRefineries({ seed: 'seed-a', monthId: '2026-10' });
const R = () => refs()[0];
const rare = (units, oreId = 'ore-r') => ({ oreId, tier: 'rare', units });

test('R-02 generateRefineries is deterministic, bounded, distinct', () => {
  assert.deepEqual(refs(), refs());
  assert.notDeepEqual(refs(), generateRefineries({ seed: 'seed-b', monthId: '2026-10' }));
  for (const count of [3, 4, 5, 6]) {
    const list = generateRefineries({ seed: 's', monthId: 'm', count });
    assert.equal(list.length, count);
    assert.equal(new Set(list.map((r) => r.distance)).size, count);
    list.forEach((r, i) => {
      assert.equal(r.id, `refinery-${i + 1}`);
      assert.ok(r.distance >= 1 && r.distance <= 8 && Number.isInteger(r.distance));
      assert.ok(r.bidPerUnit >= 36 && r.bidPerUnit <= 72 && Number.isInteger(r.bidPerUnit));
      assert.ok(r.unloadUnitsPerMinute >= 900 && r.unloadUnitsPerMinute <= 1500);
      assert.equal(r.docks, 4);
      assert.deepEqual(r.premium, DEFAULT_PREMIUM);
    });
  }
  assert.throws(() => generateRefineries({ seed: 's', monthId: 'm', count: 2 }), { code: 'INVALID_COUNT' });
  assert.throws(() => generateRefineries({ seed: 's', monthId: 'm', count: 7 }), { code: 'INVALID_COUNT' });
});

test('Q-10 common ore pays exactly units x bid regardless of state', () => {
  const r = R();
  const lines = [{ oreId: 'c', tier: 'common', units: 123 }];
  for (const patch of [{}, { premiumFunds: 0 }, { storageUsed: r.premium.storageCapacity }, { premiumFunds: 0, storageUsed: r.premium.storageCapacity }]) {
    const state = { ...initialMarketState(r, 0), ...patch };
    const q = quoteCargo(r, state, lines, 0);
    assert.equal(q.payment, 123 * r.bidPerUnit);
    assert.equal(q.premiumPayment, 0);
  }
});

test('Q-10 rare ore with zero premium availability still pays base', () => {
  const r = R();
  const state = { ...initialMarketState(r, 0), premiumFunds: 0 };
  const q = quoteCargo(r, state, [rare(10)], 0);
  assert.equal(q.payment, 10 * r.bidPerUnit);
  assert.equal(q.lines[0].premiumUnits, 0);
});

test('R-02 last premium coin goes to only the first quote', () => {
  const r = R();
  const full = initialMarketState(r, 0);
  const ppu = quoteCargo(r, full, [rare(1)], 0).lines[0].premiumPerUnit;
  assert.ok(ppu > 0);
  const state = { ...full, premiumFunds: ppu };
  const a = quoteCargo(r, state, [rare(5)], 0);
  assert.equal(a.lines[0].premiumUnits, 1);
  assert.equal(a.nextState.premiumFunds, 0);
  const b = quoteCargo(r, a.nextState, [rare(5)], 0);
  assert.equal(b.lines[0].premiumUnits, 0);
  assert.equal(b.payment, 5 * r.bidPerUnit);
});

test('R-02 last storage slot goes to only the first quote', () => {
  const r = { ...R(), premium: { ...R().premium, storageCapacity: 20 } };
  const state = { ...initialMarketState(r, 0), storageUsed: 19 };
  const mythic = (units) => ({ oreId: 'm', tier: 'mythic', units });
  const a = quoteCargo(r, state, [mythic(5)], 0);
  assert.ok(a.lines[0].premiumPerUnit > 0);
  assert.equal(a.lines[0].premiumUnits, 1);
  assert.equal(a.nextState.storageUsed, 20);
  const b = quoteCargo(r, a.nextState, [mythic(5)], 0);
  assert.equal(b.lines[0].premiumUnits, 0);
  assert.equal(b.payment, 5 * r.bidPerUnit);
});

test('R-02 premium never exceeds funds/storage over 1000 seeded quotes', () => {
  const r = R();
  const { fundsMax, refillPerHour, storageCapacity } = r.premium;
  let state = initialMarketState(r, 0);
  let now = 0;
  let paid = 0;
  for (let i = 0; i < 1000; i += 1) {
    now += (i * 37) % 120;
    const units = 1 + ((i * 7919) % 400);
    const tier = i % 3 === 0 ? 'mythic' : i % 3 === 1 ? 'rare' : 'common';
    const q = quoteCargo(r, state, [{ oreId: 'x', tier, units }, { oreId: 'y', tier: 'rare', units: 1 + (i % 9) }], now);
    paid += q.premiumPayment;
    state = q.nextState;
    assert.ok(state.premiumFunds >= 0 && state.premiumFunds <= fundsMax);
    assert.ok(state.storageUsed >= 0 && state.storageUsed <= storageCapacity);
    assert.equal(q.payment, q.basePayment + q.premiumPayment);
  }
  assert.ok(paid <= fundsMax + Math.ceil((refillPerHour * now) / 3600));
});

test('R-02 refill/drain split equals single advance; time never goes backwards', () => {
  const r = R();
  const start = { ...initialMarketState(r, 100), premiumFunds: 1000, storageUsed: 900 };
  const single = advanceMarket(r, start, 100 + 1000);
  const split = advanceMarket(r, advanceMarket(r, advanceMarket(r, start, 100 + 7), 100 + 333), 100 + 1000);
  assert.deepEqual(split, single);
  assert.ok(single.premiumFunds > 1000 && single.storageUsed < 900);
  const back = advanceMarket(r, single, 50);
  assert.equal(back.asOfSec, single.asOfSec);
  assert.deepEqual(back, single);
  const capped = advanceMarket(r, start, 10 ** 7);
  assert.equal(capped.premiumFunds, r.premium.fundsMax);
  assert.equal(capped.storageUsed, 0);
});

test('R-02 demand falls as storage fills (premiumPerUnit non-increasing)', () => {
  const r = R();
  const base = initialMarketState(r, 0);
  let last = Infinity;
  for (let used = 0; used <= r.premium.storageCapacity; used += 100) {
    const ppu = quoteCargo(r, { ...base, storageUsed: used }, [{ oreId: 'm', tier: 'mythic', units: 1 }], 0).lines[0].premiumPerUnit;
    assert.ok(ppu <= last);
    last = ppu;
  }
  assert.equal(last, 0);
  assert.equal(quoteCargo(r, base, [{ oreId: 'm', tier: 'mythic', units: 1 }], 0).lines[0].premiumPerUnit, r.bidPerUnit * (TIER_REFERENCE.mythic - 1));
});

test('R-02 refineryOffer equals what quoteCargo charges and quote is pure', () => {
  const r = R();
  const state = initialMarketState(r, 0);
  const snapshot = JSON.parse(JSON.stringify(state));
  const lines = [rare(30), { oreId: 'c', tier: 'common', units: 5 }, { oreId: 'm', tier: 'mythic', units: 12 }];
  const q = quoteCargo(r, state, lines, 60);
  const { nextState, ...rest } = q;
  assert.deepEqual(refineryOffer(r, state, lines, 60), rest);
  assert.deepEqual(state, snapshot);
  assert.ok(nextState.premiumFunds < state.premiumFunds + 1 && q.premiumPayment > 0);
});

test('R-05 dock queue: 4 docks, 6 arrivals', () => {
  let s = { dockFreeAt: [0, 0, 0, 0] };
  const waits = [];
  for (let i = 0; i < 6; i += 1) {
    const before = dockWaitSeconds(s, 0);
    const res = reserveDock(s, 0, 10 + i);
    assert.equal(res.waitSeconds, before);
    waits.push(res.waitSeconds);
    s = res.state;
  }
  assert.deepEqual(waits, [0, 0, 0, 0, 10, 11]);
  assert.deepEqual(s.dockFreeAt, [24, 26, 12, 13]);
  const late = reserveDock(s, 500, 5);
  assert.equal(late.waitSeconds, 0);
  assert.equal(late.startSec, 500);
  const early = reserveDock({ dockFreeAt: [100, 90] }, 10, 5);
  assert.equal(early.startSec, 90);
  assert.deepEqual(early.state.dockFreeAt, [100, 95]);
  assert.throws(() => reserveDock(s, 0, -1), NpcMarketError);
  assert.throws(() => reserveDock(s, 0, 1.5), NpcMarketError);
});

test('invalid cargo throws and never mutates state', () => {
  const r = R();
  const state = initialMarketState(r, 0);
  const snapshot = JSON.parse(JSON.stringify(state));
  const bad = [
    [rare(-1)], [rare(NaN)], [rare(0.5)], [rare(0)], [{ oreId: 'a', tier: 'legendary', units: 1 }],
    [rare(1, 'dup'), rare(2, 'dup')], [], [{ tier: 'rare', units: 1 }],
  ];
  for (const lines of bad) assert.throws(() => quoteCargo(r, state, lines, 0), NpcMarketError);
  assert.deepEqual(state, snapshot);
});

test('overflow with huge units throws before returning anything', () => {
  const r = R();
  const state = initialMarketState(r, 0);
  assert.throws(() => quoteCargo(r, state, [{ oreId: 'c', tier: 'common', units: 2 ** 52 }], 0), { code: 'COIN_OVERFLOW' });
  assert.throws(() => quoteCargo(r, state, [rare(2 ** 52)], 0), { code: 'COIN_OVERFLOW' });
  assert.throws(() => quoteCargo(r, state, [rare(2 ** 53)], 0), NpcMarketError);
});
