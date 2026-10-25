import test from 'node:test';
import assert from 'node:assert/strict';
import { ProductionError, advanceProductionSeconds, createProductionState, liftRatePerMinute, shaftRatePerMinute, tickProductionSecond, withdrawSurfaceUnits } from '../src/production.js';

const shaft = (overrides = {}) => ({
  shaftNumber: 1, oreId: 'iron', digLevel: 1, bunkhouseLevel: 0, workersAssigned: 5, cartLevel: 0,
  depthGrowth: 2.2, baseRatePerWorkerPerMinute: 1, soilModifier: 1, weatherModifier: 1, buffsMultiplier: 1,
  bufferCapacityUnits: 10, bufferUnits: 0, ...overrides,
});
const initial = (overrides = {}) => createProductionState({
  shafts: [shaft()],
  lift: { level: 1, baseRatePerMinute: 2, curve: 'exponential', growth: 1.0311 },
  surface: { capacityUnits: 1000 },
  syntheticDownstreamDrain: { unitsPerSecond: 0 },
  ...overrides,
});
const code = (name) => (error) => error instanceof ProductionError && error.code === name;

function totalsByOre(state) {
  const result = new Map();
  const plus = (oreId, units) => result.set(oreId, (result.get(oreId) ?? 0) + units);
  for (const row of state.initialUnitsByOre) plus(row.oreId, row.units);
  for (const row of state.cumulativeMinedByOre) plus(row.oreId, row.units);
  const physical = new Map();
  const hold = (oreId, units) => physical.set(oreId, (physical.get(oreId) ?? 0) + units);
  for (const row of state.surface.unitsByOre) hold(row.oreId, row.units);
  for (const row of state.syntheticDownstreamDrain.drainedByOre) hold(row.oreId, row.units);
  for (const item of state.shafts) hold(item.oreId, item.bufferUnits);
  for (const [oreId, expected] of result) assert(Math.abs(expected - (physical.get(oreId) ?? 0)) < 1e-9 * Math.max(1, expected));
}

test('shaft and lift formulas retain explicit provisional bases and documented caps', () => {
  assert.equal(shaftRatePerMinute(shaft()), 1.3);
  assert.equal(shaftRatePerMinute(shaft({ workersAssigned: 0 })), 0);
  assert(Math.abs(shaftRatePerMinute(shaft({ shaftNumber: 2 })) - 2.86) < 1e-12);
  assert.equal(liftRatePerMinute({ liftLevel: 1, baseRatePerMinute: 2, curve: 'linear-reference' }), 2.08);
  const expectedMaxOutput = 38_409_113_688_752.94;
  const maxShaftOutput = Array.from({ length: 30 }, (_, index) => shaftRatePerMinute(shaft({
    shaftNumber: index + 1, digLevel: 1000, bunkhouseLevel: 10, workersAssigned: 60, cartLevel: 10,
  }))).reduce((sum, value) => sum + value, 0);
  const maxLift = liftRatePerMinute({ liftLevel: 1000, baseRatePerMinute: 2, growth: 1.0311, curve: 'exponential' });
  assert(Math.abs(maxShaftOutput - expectedMaxOutput) < 1);
  assert(Math.abs(maxLift - 39_977_612_358_548.11) < 1);
  assert(maxLift / maxShaftOutput > 1.04 && maxLift / maxShaftOutput < 1.041);
});

test('1.0311 misses the selected analytical fixture envelope while 1.0316 clears it', () => {
  const envelopeShaftOutput = Array.from({ length: 30 }, (_, index) => shaftRatePerMinute(shaft({
    shaftNumber: index + 1, digLevel: 1000, bunkhouseLevel: 10, workersAssigned: 60, cartLevel: 10, soilModifier: 1.25, weatherModifier: 1.25, buffsMultiplier: 1,
  }))).reduce((sum, value) => sum + value, 0);
  const oldNeutralCandidate = liftRatePerMinute({ liftLevel: 1000, baseRatePerMinute: 2, growth: 1.0311, curve: 'exponential' });
  const envelopeCandidate = liftRatePerMinute({ liftLevel: 1000, baseRatePerMinute: 2, growth: 1.0316, curve: 'exponential' });
  assert(oldNeutralCandidate < envelopeShaftOutput);
  assert(envelopeCandidate > envelopeShaftOutput);
  const headroom = envelopeCandidate / envelopeShaftOutput - 1;
  assert(headroom > 0.081 && headroom < 0.083);
});

test('validation rejects shaft 31, worker oversubscription, invalid levels, and non-finite or negative inputs', () => {
  assert.throws(() => shaftRatePerMinute(shaft({ shaftNumber: 31 })), code('INVALID_CONFIG'));
  assert.throws(() => shaftRatePerMinute(shaft({ workersAssigned: 11 })), code('INVALID_CONFIG'));
  assert.throws(() => shaftRatePerMinute(shaft({ digLevel: 1001 })), code('INVALID_CONFIG'));
  assert.throws(() => shaftRatePerMinute(shaft({ soilModifier: 0 })), code('INVALID_AMOUNT'));
  assert.throws(() => shaftRatePerMinute(shaft({ weatherModifier: -1 })), code('INVALID_AMOUNT'));
  assert.throws(() => shaftRatePerMinute(shaft({ buffsMultiplier: Infinity })), code('INVALID_AMOUNT'));
  assert.throws(() => shaftRatePerMinute(shaft({ baseRatePerWorkerPerMinute: NaN })), code('INVALID_AMOUNT'));
  assert.throws(() => liftRatePerMinute({ liftLevel: 1001, baseRatePerMinute: 2, growth: 1.0311, curve: 'exponential' }), code('INVALID_CONFIG'));
  assert.throws(() => liftRatePerMinute({ liftLevel: 0, baseRatePerMinute: -2, curve: 'linear-reference' }), code('INVALID_AMOUNT'));
  assert.throws(() => createProductionState({ ...initial(), shafts: [shaft({ workersAssigned: 11 })] }), code('INVALID_CONFIG'));
  assert.throws(() => createProductionState({ ...initial(), shafts: [shaft({ shaftNumber: 31 })] }), code('INVALID_CONFIG'));
  assert.throws(() => createProductionState({ ...initial(), surface: { capacityUnits: -1 } }), code('INVALID_AMOUNT'));
  assert.throws(() => createProductionState({ ...initial(), schemaVersion: 2 }), code('UNSUPPORTED_SCHEMA_VERSION'));
  assert.throws(() => createProductionState({ ...initial(), shafts: [shaft({ bufferUnits: -1 })] }), code('INVALID_AMOUNT'));
  assert.throws(() => createProductionState({ ...initial(), surface: { capacityUnits: 10, unitsByOre: [{ oreId: 'iron', units: -1 }] } }), code('INVALID_AMOUNT'));
  assert.throws(() => advanceProductionSeconds(initial(), { seconds: -1, maxSteps: 1 }), code('INVALID_CONFIG'));
});

test('zero workers produce no units; full yard stops the lift', () => {
  const noWorkers = createProductionState({ shafts: [shaft({ workersAssigned: 0, bufferUnits: 0 })], lift: { level: 1, baseRatePerMinute: 2, curve: 'linear-reference' }, surface: { capacityUnits: 5 }, syntheticDownstreamDrain: { unitsPerSecond: 0 } });
  const noWork = tickProductionSecond(noWorkers);
  assert.equal(noWork.cumulativeMinedByOre.length, 0);
  assert.equal(noWork.shafts[0].bufferUnits, 0);

  const fullYard = createProductionState({
    shafts: [shaft({ workersAssigned: 0, bufferUnits: 2 })],
    lift: { level: 1, baseRatePerMinute: 2, curve: 'linear-reference' },
    surface: { capacityUnits: 5, unitsByOre: [{ oreId: 'copper', units: 5 }] },
    syntheticDownstreamDrain: { unitsPerSecond: 0 },
  });
  const stopped = tickProductionSecond(fullYard);
  assert.equal(stopped.surface.unitsByOre[0].units, 5);
  assert.equal(stopped.shafts[0].bufferUnits, 2);
  totalsByOre(stopped);
});

test('constrained lift fills a shaft buffer and limits later digging; multi-ore flow conserves units', () => {
  let state = createProductionState({
    shafts: [shaft({ bunkhouseLevel: 10, workersAssigned: 60, digLevel: 1000, cartLevel: 10, bufferCapacityUnits: 10 })],
    lift: { level: 0, baseRatePerMinute: 0.1, curve: 'linear-reference' },
    surface: { capacityUnits: 100 },
    syntheticDownstreamDrain: { unitsPerSecond: 0 },
  });
  for (let index = 0; index < 20; index += 1) state = tickProductionSecond(state);
  assert(state.shafts[0].bufferUnits > 9.9);
  assert(state.shafts[0].bufferUnits <= 10);
  assert(state.cumulativeMinedByOre[0].units < 11, 'full buffer constrains new digging');
  totalsByOre(state);

  state = createProductionState({
    shafts: [shaft({ shaftNumber: 1, oreId: 'iron', workersAssigned: 3 }), shaft({ shaftNumber: 2, oreId: 'copper', workersAssigned: 4 })],
    lift: { level: 1, baseRatePerMinute: 20, curve: 'linear-reference' },
    surface: { capacityUnits: 100 },
    syntheticDownstreamDrain: { unitsPerSecond: 0.02 },
  });
  for (let index = 0; index < 60; index += 1) state = tickProductionSecond(state);
  assert.deepEqual(state.shafts.map((item) => item.oreId), ['iron', 'copper']);
  assert(state.syntheticDownstreamDrain.drainedByOre.length > 0);
  totalsByOre(state);
  assert.equal(Object.hasOwn(state, 'coin'), false);
});

test('600 one-second fixture ticks equal bounded catch-up through the same tick function', () => {
  const base = createProductionState({
    shafts: [shaft({ workersAssigned: 5 }), shaft({ shaftNumber: 2, oreId: 'copper', workersAssigned: 7, cartLevel: 3 })],
    lift: { level: 5, baseRatePerMinute: 2, curve: 'exponential', growth: 1.03 },
    surface: { capacityUnits: 1000 },
    syntheticDownstreamDrain: { unitsPerSecond: 0.01 },
  });
  const chunk = advanceProductionSeconds(base, { seconds: 600, maxSteps: 600 });
  let repeated = base;
  for (let index = 0; index < 600; index += 1) repeated = tickProductionSecond(repeated);
  assert.deepEqual(chunk.state, repeated);
  assert.equal(chunk.processedSeconds, 600);
  assert.equal(chunk.remainingSeconds, 0);
  totalsByOre(chunk.state);
});

test('catch-up budget preserves all remaining seconds without a fixed offline cap', () => {
  const base = initial();
  const horizonSeconds = 31 * 24 * 60 * 60;
  const result = advanceProductionSeconds(base, { seconds: horizonSeconds, maxSteps: 10 });
  assert.equal(result.processedSeconds, 10);
  assert.equal(result.remainingSeconds, horizonSeconds - 10);
  assert.equal(result.state.elapsedSeconds, 10);
});


test('one-hour ore flow tolerates bounded accumulated roundoff without losing stock', () => {
  const base = initial({ syntheticDownstreamDrain: { unitsPerSecond: 0.02 } });
  const result = advanceProductionSeconds(base, { seconds: 3600, maxSteps: 3600 });
  assert.equal(result.state.elapsedSeconds, 3600);
  totalsByOre(result.state);
  assert.throws(() => createProductionState({ ...result.state, surface: { ...result.state.surface, unitsByOre: [{ oreId: 'iron', units: 100 }] } }), code('MASS_BALANCE'));
});

test('real surface withdrawal tracks external stock, preserves history and rejects overdrafts atomically', () => {
  const base = initial();
  const grown = advanceProductionSeconds(base, { seconds: 60, maxSteps: 60 }).state;
  const snapshot = JSON.stringify(grown);
  const next = withdrawSurfaceUnits(grown, 'iron', 1);
  assert.equal(next.externalTransfersByOre[0].units, 1);
  assert.equal(next.syntheticDownstreamDrain.drainedByOre.length, 0);
  assert.deepEqual(next.cumulativeMinedByOre, grown.cumulativeMinedByOre);
  assert.equal(JSON.stringify(grown), snapshot);
  assert.throws(() => withdrawSurfaceUnits(next, 'iron', 999), code('INSUFFICIENT_STOCK'));
  assert.throws(() => withdrawSurfaceUnits(next, 'iron', -1), code('INVALID_AMOUNT'));
  tickProductionSecond(next);
});

test('fast catch-up equals the one-second loop within ore tolerance across steady, lift-bound, yard-full and idle flows', async () => {
  const { advanceProductionFast } = await import('../src/production.js');
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const units = (rows) => Object.fromEntries(rows.map((r) => [r.oreId, r.units]));
  const cases = {
    steady: initial({ lift: { level: 200, baseRatePerMinute: 2, curve: 'exponential', growth: 1.0316 } }),
    liftBound: initial({ lift: { level: 1, baseRatePerMinute: 0.5, curve: 'exponential', growth: 1.0316 }, shafts: [shaft({ workersAssigned: 20, bunkhouseLevel: 2, bufferCapacityUnits: 30 })] }),
    yardFull: initial({ surface: { capacityUnits: 40 } }),
    idle: initial({ shafts: [shaft({ workersAssigned: 0 })] }),
  };
  for (const [name, state] of Object.entries(cases)) {
    for (const seconds of [1, 2, 61, 3600]) {
      let slow = createProductionState(state);
      for (let i = 0; i < seconds; i += 1) slow = tickProductionSecond(slow);
      const fast = advanceProductionFast(state, { seconds }).state;
      assert.equal(fast.elapsedSeconds, slow.elapsedSeconds, `${name} ${seconds}`);
      const s = units(slow.surface.unitsByOre); const f = units(fast.surface.unitsByOre);
      for (const id of new Set([...Object.keys(s), ...Object.keys(f)])) assert(near(s[id] ?? 0, f[id] ?? 0), `${name} ${seconds} surface ${id}: ${s[id]} vs ${f[id]}`);
      const sm = units(slow.cumulativeMinedByOre); const fm = units(fast.cumulativeMinedByOre);
      for (const id of new Set([...Object.keys(sm), ...Object.keys(fm)])) assert(near(sm[id] ?? 0, fm[id] ?? 0), `${name} ${seconds} mined ${id}`);
    }
  }
  const month = advanceProductionFast(cases.steady, { seconds: 31 * 86400, maxTicks: 1000 });
  assert.equal(month.remainingSeconds, 0, 'a 31-day catch-up fits a tiny explicit-tick budget');
});
