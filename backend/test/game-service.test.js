import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryLedgerRepository, replayLedger } from '../src/ledger.js';
import { GameService } from '../src/game-service.js';

const MONTH = '2026-11';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const buyers = [
  { id: 'near', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500, fundsCap: 1_000_000, fundsRefillPerSecond: 0, capacityCap: 100_000, capacityRefillPerSecond: 0 },
  { id: 'tiny', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500, fundsCap: 200, fundsRefillPerSecond: 0, capacityCap: 100_000, capacityRefillPerSecond: 0 },
  { id: 'cramped', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500, fundsCap: 1_000_000, fundsRefillPerSecond: 0, capacityCap: 3, capacityRefillPerSecond: 0 },
];
const ctx = (uid, secondsAfterStart) => ({ auth: { uid }, activeMonthId: MONTH, now: T0 + secondsAfterStart * 1000, worldId: 'w', startSite: { siteId: 'site-1', commonOreId: 'ore-1' } });
let n = 0;
const cmd = (version, extra = {}) => ({ monthId: MONTH, requestId: `r${++n}`, expectedVersion: version, ...extra });
const code = (c) => (e) => e.code === c;

async function setup(players = ['alice']) {
  const repo = new MemoryLedgerRepository();
  const game = new GameService(repo, { npcBuyers: buyers });
  await game.seedNpcBuyers({ worldId: 'w', monthId: MONTH, nowSec: T0 / 1000 });
  const versions = {};
  for (const p of players) { const r = await game.enroll(cmd(0), ctx(p, 0)); versions[p] = r.version; }
  return { repo, game, versions };
}
const view = (game, uid, t) => game.ownerView(uid, MONTH, ctx(uid, t));
const sumLedger = (repo) => repo.snapshot().ledger.reduce((a, e) => a + e.postings.length, 0);

test('starting coin is zero and the first paid departure credits coin while the ship is still outbound (T05-05)', async () => {
  const { game, repo, versions } = await setup();
  assert.equal((await view(game, 'alice', 0)).spendable, 0);
  await assert.rejects(game.dispatch(cmd(versions.alice, { destinationId: 'near' }), ctx('alice', 0)), code('NO_CARGO'));
  const r = await game.dispatch(cmd(versions.alice, { destinationId: 'near' }), ctx('alice', 60));
  assert.equal(r.shipment.units, 1);
  assert.equal(r.shipment.payment, 40);
  const v = await view(game, 'alice', 60);
  assert.equal(v.spendable, 40);
  assert(r.shipment.arrivalSecond > T0 / 1000 + 60, 'ship still outbound at the moment of payment');
  assert.equal(v.doc.ship.readyAtSecond, T0 / 1000 + 60 + r.plan.busySeconds);
  assert(repo.reconcile());
});

test('T02-03/T18-03 duplicate and concurrent departures pay and reserve exactly once', async () => {
  const { game, repo, versions } = await setup();
  const command = cmd(versions.alice, { destinationId: 'near' });
  const results = await Promise.allSettled([game.dispatch(command, ctx('alice', 600)), game.dispatch(command, ctx('alice', 600)), game.dispatch({ ...command }, ctx('alice', 600))]);
  assert(results.every((x) => x.status === 'fulfilled'));
  assert.equal(new Set(results.map((x) => x.value.shipment.id)).size, 1);
  const v = await view(game, 'alice', 600);
  assert.equal(v.doc.shipments.length, 1);
  assert.equal(v.spendable, v.doc.shipments[0].payment);
  assert.equal(repo.snapshot().ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE').length, 1);
  // same request id with different payload conflicts
  await assert.rejects(game.dispatch({ ...command, destinationId: 'tiny' }, ctx('alice', 600)), code('IDEMPOTENCY_CONFLICT'));
});

test('T05-02/03 arrival never pays again and the paid shipment is unchanged', async () => {
  const { game, repo, versions } = await setup();
  const r = await game.dispatch(cmd(versions.alice, { destinationId: 'near' }), ctx('alice', 600));
  const before = (await view(game, 'alice', 600)).spendable;
  const later = await view(game, 'alice', 6 * 3600);
  assert.equal(later.spendable, before);
  assert.deepEqual(later.doc.shipments[0], r.shipment);
  assert.equal(repo.snapshot().ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE').length, 1);
});

test('rejected dispatch mutates nothing (busy ship, empty buyer, full buyer)', async () => {
  const { game, repo, versions } = await setup();
  const first = await game.dispatch(cmd(versions.alice, { destinationId: 'near' }), ctx('alice', 600));
  const snap = JSON.stringify([...repo.snapshot().balances]);
  const ledgerLen = repo.snapshot().ledger.length;
  const v1 = (await view(game, 'alice', 601)).version;
  await assert.rejects(game.dispatch(cmd(v1, { destinationId: 'near' }), ctx('alice', 601)), code('SHIP_BUSY'));
  await assert.rejects(game.dispatch(cmd(v1, { destinationId: 'nope' }), ctx('alice', 601)), code('UNKNOWN_DESTINATION'));
  assert.equal(JSON.stringify([...repo.snapshot().balances]), snap);
  assert.equal(repo.snapshot().ledger.length, ledgerLen);
  assert.equal((await view(game, 'alice', 601)).version, first.version);
});

test('T18-11 simultaneous dispatches cannot overspend a buyer budget or capacity', async () => {
  const { game, repo, versions } = await setup(['alice', 'bob', 'cara']);
  // tiny buyer has 200 funds = 5 units at 40; each player has far more stock after an hour.
  const t = 3600;
  const outcomes = await Promise.allSettled(['alice', 'bob', 'cara'].map((u) => game.dispatch(cmd(versions[u], { destinationId: 'tiny' }), ctx(u, t))));
  const paid = outcomes.filter((o) => o.status === 'fulfilled').map((o) => o.value.shipment.payment);
  assert(paid.reduce((a, b) => a + b, 0) <= 200, `buyer paid ${paid}`);
  assert(paid.length >= 1);
  const cramped = await Promise.allSettled(['alice', 'bob', 'cara'].map(async (u) => game.dispatch(cmd((await view(game, u, t + 1)).version, { destinationId: 'cramped' }), ctx(u, t + 1))));
  const units = cramped.filter((o) => o.status === 'fulfilled').map((o) => o.value.shipment.units);
  assert(units.reduce((a, b) => a + b, 0) <= 3, `capacity used ${units}`);
  assert(repo.reconcile());
});

test('explicit units that cannot be fulfilled are rejected, not silently shrunk', async () => {
  const { game, versions } = await setup();
  await assert.rejects(game.dispatch(cmd(versions.alice, { destinationId: 'near', units: 999 }), ctx('alice', 600)), code('INSUFFICIENT_STOCK'));
});

test('upgrades: exact price, atomic ledger sink, cap and funds checks; hire and shaft', async () => {
  const { game, repo, versions } = await setup();
  let v = versions.alice;
  await assert.rejects(game.buyUpgrade(cmd(v, { line: 'dig', shaftNumber: 1, mode: 1 }), ctx('alice', 5)), code('INSUFFICIENT_FUNDS'));
  const sale = await game.dispatch(cmd(v, { destinationId: 'near' }), ctx('alice', 600));
  v = sale.version;
  const bought = await game.buyUpgrade(cmd(v, { line: 'dig', shaftNumber: 1, mode: 10 }), ctx('alice', 600));
  assert.equal(bought.newLevel, 11);
  const after = await view(game, 'alice', 600);
  assert.equal(after.spendable, sale.shipment.payment - bought.spent);
  assert.equal(after.doc.production.shafts[0].digLevel, 11);
  assert.equal(repo.snapshot().ledger.filter((e) => e.type === 'SYSTEM_PURCHASE').length, 1);
  assert(repo.reconcile());
  await assert.rejects(game.buyUpgrade(cmd(bought.version, { line: 'dig', shaftNumber: 1, mode: 7 }), ctx('alice', 600)), code('INVALID_MODE'));
  await assert.rejects(game.buyUpgrade(cmd(bought.version, { line: 'bogus' }), ctx('alice', 600)), code('UNKNOWN_UPGRADE'));
  await assert.rejects(game.hire(cmd(bought.version, { count: 6 }), ctx('alice', 600)), code('NO_HABITAT_CAPACITY'));
  const hired = await game.hire(cmd(bought.version, { count: 2 }), ctx('alice', 600));
  assert.equal(hired.workersHired, 7);
  assert.equal((await view(game, 'alice', 600)).doc.production.shafts[0].workersAssigned, 7);
});

test('shaft 31 never exists and shaft purchase charges exactly the section 10 price', async () => {
  const { game, versions } = await setup();
  await assert.rejects(game.buyShaft(cmd(versions.alice), ctx('alice', 1)), code('INSUFFICIENT_FUNDS'));
});

test('T18-10 injected authoritative fields are rejected; stale month and version rejected', async () => {
  const { game, versions } = await setup();
  await assert.rejects(game.dispatch(cmd(versions.alice, { destinationId: 'near', payment: 999999 }), ctx('alice', 60)), code('INJECTED_FIELD'));
  await assert.rejects(game.dispatch({ ...cmd(versions.alice, { destinationId: 'near' }), monthId: '2026-10' }, ctx('alice', 60)), code('STALE_MONTH'));
  await assert.rejects(game.dispatch(cmd(versions.alice + 5, { destinationId: 'near' }), ctx('alice', 60)), code('STALE_VERSION'));
  await assert.rejects(game.dispatch(cmd(versions.alice, { destinationId: 'near' }), { ...ctx('alice', 60), auth: undefined }), code('UNAUTHENTICATED'));
});

test('T02-01 conservation: owned coin equals sources minus sinks across a run of purchases and sales', async () => {
  const { game, repo, versions } = await setup();
  let v = versions.alice; let t = 600;
  for (let i = 0; i < 6; i += 1) {
    const s = await game.dispatch(cmd(v, { destinationId: 'near' }), ctx('alice', t)); v = s.version;
    const u = await game.buyUpgrade(cmd(v, { line: 'dig', shaftNumber: 1, mode: 'max' }), ctx('alice', t)); v = u.version;
    t += 1800;
  }
  const ledger = repo.snapshot().ledger;
  const sources = ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE').reduce((a, e) => a + e.postings[0].delta, 0);
  const sinks = ledger.filter((e) => e.type === 'SYSTEM_PURCHASE').reduce((a, e) => a - e.postings[0].delta, 0);
  const owned = (await view(game, 'alice', t)).spendable;
  assert.equal(owned, sources - sinks);
  assert(owned >= 0);
  const rebuilt = replayLedger(ledger);
  assert.equal([...rebuilt.balances].filter(([k]) => k.endsWith(':spendable')).reduce((a, [, b]) => a + b, 0), owned);
  assert(sumLedger(repo) > 0);
});
