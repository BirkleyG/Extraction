import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrontier, advanceFrontier, applyFrontierAction, FRONTIER_TUNE, validateFrontier } from '../frontier.js';
const recruit = f => applyFrontierAction(f, 'recruit-infantry', { coins: 1000, simSeconds: f.simSeconds });
test('T12/T23 deterministic one-second replay, catchup, restart and reordered seed keys', () => {
  const start = createFrontier({ b: 2, a: 1 });
  assert.deepEqual(start, createFrontier({ a: 1, b: 2 }));
  let f = start; const events = [];
  for (let i = 0; i < 2500; i++) { const r = advanceFrontier(f, 1); f = r.frontier; events.push(...r.events); }
  const batch = advanceFrontier(start, 2500);
  assert.deepEqual(batch.frontier, f); assert.deepEqual(batch.events, events);
  const saved = JSON.parse(JSON.stringify(advanceFrontier(start, 827).frontier));
  assert.deepEqual(advanceFrontier(saved, 1673).frontier, f);
});
test('purchase is one-time and recruits cannot defend until their shuttle arrives', () => {
  const base = createFrontier('arrival');
  base.nextIncidentAt = 59;
  const snapshot = structuredClone(base), order = recruit(base);
  assert.deepEqual(base, snapshot); assert.equal(order.coinDelta, -FRONTIER_TUNE.infantryCost);
  const before = advanceFrontier(order.frontier, 59);
  assert.equal(before.frontier.infantry.troops, 0);
  assert.equal(before.events.find(e => e.type === 'incident').troopsPresent, 0);
  const arrived = advanceFrontier(before.frontier, 1);
  assert.equal(arrived.frontier.infantry.troops, 10);
  assert.equal(arrived.events[0].type, 'reinforcements-arrived');
  assert.equal(recruit(arrived.frontier).coinDelta, 0);
});
test('home reductions recover, remain bounded, factual news is bounded and input stays immutable', () => {
  let f = createFrontier('hazards'); let incidents = 0;
  for (let i = 0; i < 12000; i++) {
    const snapshot = structuredClone(f); const r = advanceFrontier(f, 1);
    assert.deepEqual(f, snapshot); f = r.frontier;
    assert(r.productionMultiplier >= .75 && r.productionMultiplier <= 1);
    assert(f.infantry.troops >= 0); assert(f.news.length <= 30);
    if (r.events.some(e => e.type === 'incident')) {
      incidents++;
      assert.equal(advanceFrontier(f, 30).productionMultiplier, 1);
    }
  }
  assert(incidents > 20); assert(!('shipments' in f)); assert(!('threat' in f));
});
test('arrived patrol reduces downtime and invalid purchases are atomic', () => {
  const base = createFrontier('defense'); const f = advanceFrontier(recruit(base).frontier, 60).frontier;
  const hit = advanceFrontier(f, f.nextIncidentAt - f.simSeconds);
  assert.equal(hit.productionMultiplier, .9); assert.equal(hit.frontier.incident.endsAt - hit.frontier.simSeconds, 10);
  for (const args of [{coins:0,simSeconds:0},{coins:Infinity,simSeconds:0},{coins:1000,simSeconds:1}]) {
    const rejected = applyFrontierAction(base, 'recruit-infantry', args);
    assert.equal(rejected.coinDelta, 0); assert.deepEqual(rejected.frontier, base);
  }
  assert.throws(() => advanceFrontier(base, -1), RangeError);
});

test('old-save anchor starts future incidents and validation rejects corrupt snapshots', () => {
  const f = createFrontier('old-save', 10000);
  assert.equal(f.simSeconds, 10000);
  assert(f.nextIncidentAt >= 10180 && f.nextIncidentAt <= 10360);
  assert.equal(validateFrontier(f), f);
  assert.deepEqual(advanceFrontier(f, 0).events, []);
  assert.equal(advanceFrontier(f, 179).productionMultiplier, 1);
  const arrived = advanceFrontier(recruit(f).frontier, 500).frontier;
  assert.equal(validateFrontier(JSON.parse(JSON.stringify(arrived))).simSeconds, 10500);
  const mutations = [
    x => x.version = 2, x => x.simSeconds = -1,
    x => x.nextIncidentAt = x.simSeconds, x => x.infantry.troops = -1,
    x => x.infantry.purchased = true,
    x => x.infantry.incoming = {troops:10,departedAt:10000,arrivesAt:10060,destination:'home',cost:250},
    x => x.incident = {kind:'gas', startedAt:9990, endsAt:10020, productionMultiplier:0},
    x => x.news = Array(31).fill({}),
    x => x.news = [{id:'fake',siteId:'home',simSeconds:10000,type:'incident',description:'fake'}]
  ];
  for (const mutate of mutations) { const bad = structuredClone(f); mutate(bad); assert.throws(() => validateFrontier(bad), TypeError); }
  const duplicate = structuredClone(arrived); duplicate.news.push(duplicate.news.at(-1));
  assert.throws(() => validateFrontier(duplicate), TypeError);
  const order = recruit(f).frontier; order.infantry.incoming.arrivesAt++;
  assert.throws(() => validateFrontier(order), TypeError);
  assert.throws(() => createFrontier('bad', -1), RangeError);
});
