import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../economy.js';
import { createGameState, dispatchNow, purchaseUpgrade, grantDevCoins, buyNextShaft, upgradeCost, advanceGame, stepGame, validateGameState, currentLiftRate, shaftRateFor, nextShaftCost, destinationsFor, makeSite, generateVeins, toolHardness } from '../model.js';
import { simulate, table, flows } from '../sim/pacing.mjs';

test('starter shipment pays 100 coins within one second, then cadence is one 10-unit departure per 12 seconds', () => {
  const start = createGameState();
  assert.equal(start.coins, 0);
  const first = stepGame(start);
  assert.equal(first.shipments[0].payment, 100);
  assert.equal(first.shipments[0].departureAtSecond, 1);
  assert.equal(first.shipments[0].tripSeconds, 12);
  const run = advanceGame(start, 61, 61).state;
  assert.deepEqual(run.shipments.map(s => s.departureAtSecond), [1,13,25,37,49,61]);
  assert(run.shipments.every(s => Number.isInteger(s.units)));
  assert.equal(run.coins, 600);
  assert.equal(run.ledger.reduce((sum, row) => sum + row.ownerDelta, 0), run.coins);
  assert(run.ledger.every(row => row.ownerDelta + row.externalDelta === 0));
});

test('global upgrades visibly multiply their stages, shafts include ten miners and inherit pick', () => {
  const start = grantDevCoins(createGameState(), 10000);
  const pick = purchaseUpgrade(start, 'pick');
  assert.equal(pick.coins, start.coins - E.TUNE.pickCost);
  assert(Math.abs(shaftRateFor(pick, 1) - shaftRateFor(start, 1) * 1.4) < 1e-10);
  const second = buyNextShaft(pick);
  assert.equal(second.workersHired, 20);
  assert.equal(second.production.shafts[1].workersAssigned, 10);
  assert.equal(second.production.shafts[1].digLevel, 1);
  assert.equal(nextShaftCost(pick), 190);
  const lift = purchaseUpgrade(start, 'lift');
  assert.equal(currentLiftRate(lift), 140);
  const haul = purchaseUpgrade(start, 'hauler');
  assert.equal(haul.ship.capacityUnits, 14);
  assert(haul.ship.speedPerMinute > start.ship.speedPerMinute);
  assert.equal(destinationsFor(start)[2].basePrice, 50);
});

test('finite safe-integer cost ceilings reject purchases atomically and Max stops safely', () => {
  assert.equal(E.lineCost('pick',400), Infinity);
  assert.equal(E.shaftCost(30), Infinity);
  const rich = grantDevCoins(createGameState(), Number.MAX_SAFE_INTEGER);
  const upgraded = purchaseUpgrade(rich, 'pick', { count: 'max' });
  assert(upgraded.upgrades.pick > 50 && upgraded.upgrades.pick < 100);
  assert(Number.isSafeInteger(upgraded.coins));
  assert.equal(rich.upgrades.pick, 0);
  const atLimit = structuredClone(upgraded);
  atLimit.upgrades.pick = 100;
  assert.equal(upgradeCost(atLimit, 'pick'), null);
  assert.throws(() => purchaseUpgrade(atLimit,'pick'), e => e.code === 'INSUFFICIENT_FUNDS');
  assert.throws(() => dispatchNow(rich), e => e.code === 'BALANCE_LIMIT');
  assert.equal(stepGame(rich).coins, Number.MAX_SAFE_INTEGER);
});

test('sandbox bounded catch-up is identical to live ticks and preserves inventory after shipments', () => {
  let state = grantDevCoins(createGameState(), 20000);
  state = buyNextShaft(purchaseUpgrade(state,'pick', {count:4}));
  state = purchaseUpgrade(state,'lift',{count:3});
  state = purchaseUpgrade(state,'hauler',{count:3});
  const one = advanceGame(state,600,600).state;
  let batch = state;
  for(let i=0;i<6;i++) batch=advanceGame(batch,100,100).state;
  assert.deepEqual(batch,one);
  const p = validateGameState(one).production;
  const initial = p.initialUnitsByOre.reduce((n,r)=>n+r.units,0);
  const mined = p.cumulativeMinedByOre.reduce((n,r)=>n+r.units,0);
  const physical = p.surface.unitsByOre.reduce((n,r)=>n+r.units,0)+p.shafts.reduce((n,r)=>n+r.bufferUnits,0)+one.ship.cargoUnits+one.shipments.reduce((n,r)=>n+r.units,0)+(one.historyArchive?.shipments.unitsByOre.reduce((n,r)=>n+r.units,0)??0);
  assert(Math.abs(initial+mined-physical)<1e-7);
});

test('legacy and online fixture retain old production, costs and optimistic upgrade mapping', () => {
  const old = createGameState(undefined,{legacy:true});
  old.remote = true;
  const remote = grantDevCoins(validateGameState(old),10000);
  assert.equal(upgradeCost(remote,'dig'),15);
  assert.equal(upgradeCost(remote,'shipCapacity'),30);
  assert.equal(currentLiftRate(remote),2*1.0316);
  const upgraded = purchaseUpgrade(remote,'dig');
  assert.equal(upgraded.production.shafts[0].digLevel,2);
  assert.equal(upgraded.workersHired,5);
  assert.equal(upgraded.production.shafts[0].baseRatePerWorkerPerMinute,1);
  assert.equal(stepGame(remote).shipments.length,0);
  assert.equal(destinationsFor(remote)[0].basePrice,40);
});

test('pacing output has real newlines, ends at requested horizon, and stronger stages increase possible income', () => {
  const rows=simulate({horizon:123});
  assert(rows.every(r=>r.at<=123));
  assert.equal(rows.at(-1).at,123);
  assert(table(rows).includes('\n'));
  assert(!table(rows).includes('\\n'));
  const base={pick:0,lift:0,hauler:0,shafts:1};
  assert(flows({...base,hauler:1}).coinPerSec>flows(base).coinPerSec);
  assert.deepEqual(simulate({horizon:3600}),simulate({horizon:3600}));
});

test('bounded history preserves archived coin/ore totals and active shipments across catch-up and reload', () => {
  const start=createGameState(); const original=structuredClone(start);
  const run=advanceGame(start,1200,1200).state;
  assert.deepEqual(start,original,'public simulation never mutates its input');
  assert.equal(run.shipments.length,32);
  assert.equal(run.shipments.length+run.historyArchive.shipments.count,100);
  assert.equal(run.ledger.length,64);
  assert.equal(run.ledger.length+run.historyArchive.ledger.count,100);
  assert.equal(run.ledger.reduce((n,r)=>n+r.ownerDelta,0)+run.historyArchive.ledger.ownerDelta,run.coins);
  assert.equal(run.ledger.reduce((n,r)=>n+r.externalDelta,0)+run.historyArchive.ledger.externalDelta,-run.coins);
  assert.equal(run.shipments.reduce((n,r)=>n+r.payment,0)+run.historyArchive.shipments.payment,run.totalExternalEarnings);
  assert.equal(run.historyArchive.shipments.unitsByOre[0].units+run.shipments.reduce((n,r)=>n+r.units,0),1000);
  const departing=stepGame(run);
  assert(departing.shipments.some(r=>departing.shipmentStatusById[r.id]==='IN_TRANSIT'));
  assert.equal(departing.shipments.at(-1).departureAtSecond,1201);
  let batch=advanceGame(start,600,600).state;
  batch=validateGameState(JSON.parse(JSON.stringify(batch)));
  batch=advanceGame(batch,600,600).state;
  assert.deepEqual(batch,run);
  const end=dispatchNow(createGameState());
  assert.equal(end.coins,100);
  assert.equal(start.coins,0);
});

test('seeded site fallback always supplies two distinct rare candidates and reproducible veins', () => {
  for(let n=0;n<200;n++) { const site=makeSite({planetId:'fallback-study',regionId:String(n)});
    assert(site.rareOreIds.length>=2); assert.equal(new Set(site.rareOreIds).size,site.rareOreIds.length);
    assert.deepEqual(generateVeins(site,3),generateVeins(site,3));
  }
});

test('sandbox and legacy tool hardness follow their respective tier thresholds', () => {
  assert.equal(toolHardness(12),4);
  assert.equal(toolHardness(12,true),4);
  assert.equal(toolHardness(13,true),4);
  assert.equal(toolHardness(14,true),6);
  assert.equal(toolHardness(14),4);
  assert.equal(toolHardness(40),6);
  assert.equal(toolHardness(38,true),10);
});
