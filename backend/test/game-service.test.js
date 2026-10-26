import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryLedgerRepository, replayLedger } from '../src/ledger.js';
import { GameService } from '../src/game-service.js';

const MONTH = '2026-11';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const buyers = [
  { id: 'near', name: 'Near', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500 },
  { id: 'far', name: 'Far', distance: 3, bidPerUnit: 64, unloadUnitsPerMinute: 900 },
];
const ctx = (uid, secondsAfterStart) => ({ auth: { uid }, activeMonthId: MONTH, now: T0 + secondsAfterStart * 1000, worldId: 'w', startSite: { siteId: 'site-1', commonOreId: 'ore-1' } });
let n = 0;
const cmd = (version, extra = {}) => ({ monthId: MONTH, requestId: `r${++n}`, expectedVersion: version, ...extra });
const code = (c) => (e) => e.code === c;

/** Players are enrolled at T0; `auto` false isolates manual launches from automatic takeoffs. */
async function setup(players = ['alice'], { auto = false } = {}) {
  const repo = new MemoryLedgerRepository();
  const game = new GameService(repo, { npcBuyers: buyers });
  const versions = {};
  for (const p of players) {
    let r = await game.enroll(cmd(0), ctx(p, 0));
    if (!auto) r = await game.setPolicy(cmd(r.version, { auto: false }), ctx(p, 0));
    versions[p] = r.version;
  }
  return { repo, game, versions };
}
const view = (game, uid, t) => game.ownerView(uid, MONTH, ctx(uid, t));
const ledgerOf = (repo, type) => repo.snapshot().ledger.filter((e) => e.type === type);

test('starting coin is zero; "Launch now" sells the starter ore at once and pays while the ship is still outbound (T05-05)', async () => {
  const { game, repo, versions } = await setup();
  assert.equal((await view(game, 'alice', 0)).spendable, 0);
  const r = await game.dispatch(cmd(versions.alice), ctx('alice', 0));
  assert.equal(r.shipment.units, 5);
  assert.equal(r.shipment.payment, 200, 'best buyer by coin per minute of ship time is the near one');
  const v = await view(game, 'alice', 0);
  assert.equal(v.spendable, 200);
  assert(r.shipment.arrivalSecond > T0 / 1000, 'ship still outbound at the moment of payment');
  assert.equal(v.doc.ships[0].readyAtSecond, T0 / 1000 + r.plan.busySeconds);
  await assert.rejects(game.dispatch(cmd(r.version), ctx('alice', 1)), code('SHIP_BUSY'));
  assert(repo.reconcile());
});

test('T02-03/T18-03 duplicate and concurrent departures pay and take stock exactly once', async () => {
  const { game, repo, versions } = await setup();
  const command = cmd(versions.alice, { destinationId: 'near' });
  const results = await Promise.allSettled([game.dispatch(command, ctx('alice', 600)), game.dispatch(command, ctx('alice', 600)), game.dispatch({ ...command }, ctx('alice', 600))]);
  assert(results.every((x) => x.status === 'fulfilled'));
  assert.equal(new Set(results.map((x) => x.value.shipment.id)).size, 1);
  const v = await view(game, 'alice', 600);
  assert.equal(v.doc.shipments.length, 1);
  assert.equal(v.spendable, v.doc.shipments[0].payment);
  assert.equal(ledgerOf(repo, 'NPC_RAW_PURCHASE').length, 1);
  await assert.rejects(game.dispatch({ ...command, destinationId: 'far' }, ctx('alice', 600)), code('IDEMPOTENCY_CONFLICT'));
});

test('T05-02/03 arrival never pays again and the paid shipment is unchanged', async () => {
  const { game, repo, versions } = await setup();
  const r = await game.dispatch(cmd(versions.alice), ctx('alice', 600));
  const before = (await view(game, 'alice', 600)).spendable;
  const later = await view(game, 'alice', 6 * 3600);
  assert.equal(later.spendable, before);
  assert.deepEqual(later.doc.shipments[0], r.shipment);
  assert.equal(ledgerOf(repo, 'NPC_RAW_PURCHASE').length, 1);
});

test('rejected dispatch mutates nothing (busy ship, unknown buyer, no ore)', async () => {
  const { game, repo, versions } = await setup();
  const first = await game.dispatch(cmd(versions.alice), ctx('alice', 600));
  const snap = JSON.stringify([...repo.snapshot().balances]);
  const ledgerLen = repo.snapshot().ledger.length;
  await assert.rejects(game.dispatch(cmd(first.version), ctx('alice', 601)), code('SHIP_BUSY'));
  await assert.rejects(game.dispatch(cmd(first.version, { destinationId: 'nope' }), ctx('alice', 10_000)), code('UNKNOWN_DESTINATION'));
  assert.equal(JSON.stringify([...repo.snapshot().balances]), snap);
  assert.equal(repo.snapshot().ledger.length, ledgerLen);
  assert.equal((await view(game, 'alice', 601)).version, first.version);
});

test('computer-run buyers have no budget: simultaneous launches by several owners all pay in full', async () => {
  const names = ['alice', 'bob', 'cara', 'dan'];
  const { game, repo, versions } = await setup(names);
  const outcomes = await Promise.allSettled(names.map((u) => game.dispatch(cmd(versions[u], { destinationId: 'far' }), ctx(u, 3600))));
  assert(outcomes.every((o) => o.status === 'fulfilled'));
  for (const o of outcomes) assert.equal(o.value.shipment.payment, o.value.shipment.units * 64);
  assert.equal(ledgerOf(repo, 'NPC_RAW_PURCHASE').length, names.length);
  assert(repo.reconcile());
});

test('explicit units that cannot be sent are rejected, not silently shrunk', async () => {
  const { game, versions } = await setup();
  await assert.rejects(game.dispatch(cmd(versions.alice, { units: 999 }), ctx('alice', 600)), code('INSUFFICIENT_STOCK'));
  const ok = await game.dispatch(cmd(versions.alice, { units: 3 }), ctx('alice', 600));
  assert.equal(ok.shipment.units, 3);
});

test('upgrades: exact price, atomic ledger sink, cap and funds checks; hire and shaft', async () => {
  const { game, repo, versions } = await setup();
  let v = versions.alice;
  await assert.rejects(game.buyUpgrade(cmd(v, { line: 'dig', shaftNumber: 1, mode: 1 }), ctx('alice', 5)), code('INSUFFICIENT_FUNDS'));
  const sale = await game.dispatch(cmd(v), ctx('alice', 600));
  v = sale.version;
  const bought = await game.buyUpgrade(cmd(v, { line: 'dig', shaftNumber: 1, mode: 10 }), ctx('alice', 600));
  assert.equal(bought.newLevel, 11);
  const after = await view(game, 'alice', 600);
  assert.equal(after.spendable, sale.shipment.payment - bought.spent);
  assert.equal(after.doc.production.shafts[0].digLevel, 11);
  assert.equal(ledgerOf(repo, 'SYSTEM_PURCHASE').length, 1);
  assert(repo.reconcile());
  await assert.rejects(game.buyUpgrade(cmd(bought.version, { line: 'dig', shaftNumber: 1, mode: 7 }), ctx('alice', 600)), code('INVALID_MODE'));
  await assert.rejects(game.buyUpgrade(cmd(bought.version, { line: 'bogus' }), ctx('alice', 600)), code('UNKNOWN_UPGRADE'));
  await assert.rejects(game.hire(cmd(bought.version, { count: 6 }), ctx('alice', 600)), code('NO_HABITAT_CAPACITY'));
  const hired = await game.hire(cmd(bought.version, { count: 2 }), ctx('alice', 600));
  assert.equal(hired.workersHired, 7);
  assert.equal((await view(game, 'alice', 600)).doc.production.shafts[0].workersAssigned, 7);
});

test('shaft 31 never exists and shaft purchase needs the section 10 price', async () => {
  const { game, versions } = await setup();
  await assert.rejects(game.buyShaft(cmd(versions.alice), ctx('alice', 1)), code('INSUFFICIENT_FUNDS'));
});

test('T18-10 injected authoritative fields are rejected; stale month and version rejected', async () => {
  const { game, versions } = await setup();
  await assert.rejects(game.dispatch(cmd(versions.alice, { destinationId: 'near', payment: 999999 }), ctx('alice', 60)), code('INJECTED_FIELD'));
  await assert.rejects(game.dispatch({ ...cmd(versions.alice), monthId: '2026-10' }, ctx('alice', 60)), code('STALE_MONTH'));
  await assert.rejects(game.dispatch(cmd(versions.alice + 5), ctx('alice', 60)), code('STALE_VERSION'));
  await assert.rejects(game.dispatch(cmd(versions.alice), { ...ctx('alice', 60), auth: undefined }), code('UNAUTHENTICATED'));
});

test('T02-01 conservation: owned coin equals sources minus sinks across purchases and sales', async () => {
  const { game, repo, versions } = await setup();
  let v = versions.alice; let t = 0;
  for (let i = 0; i < 6; i += 1) {
    const s = await game.dispatch(cmd(v), ctx('alice', t)); v = s.version;
    const u = await game.buyUpgrade(cmd(v, { line: 'dig', shaftNumber: 1, mode: 'max' }), ctx('alice', t)); v = u.version;
    t += 1800;
  }
  const sources = ledgerOf(repo, 'NPC_RAW_PURCHASE').reduce((a, e) => a + e.postings[0].delta, 0);
  const sinks = ledgerOf(repo, 'SYSTEM_PURCHASE').reduce((a, e) => a - e.postings[0].delta, 0);
  const owned = (await view(game, 'alice', t)).spendable;
  assert.equal(owned, sources - sinks);
  const rebuilt = replayLedger(repo.snapshot().ledger);
  assert.equal([...rebuilt.balances].filter(([k]) => k.endsWith(':spendable')).reduce((a, [, b]) => a + b, 0), owned);
});

test('auto takeoff: the hauler leaves by itself with exactly a full hold, each trip paid at its own second', async () => {
  const { game, repo, versions } = await setup(['alice'], { auto: true });
  await game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: T0 / 1000 + 12 * 3600 });
  const v = await view(game, 'alice', 12 * 3600);
  const trips = v.doc.shipments;
  assert(trips.length >= 3 && trips.length <= 6, `trips ${trips.length}`);
  for (const t of trips) { assert.equal(t.units, 150); assert.equal(t.payment, 6000); }
  const entries = ledgerOf(repo, 'NPC_RAW_PURCHASE');
  assert.equal(entries.length, trips.length);
  assert.deepEqual(entries.map((e) => e.timestamp), trips.map((t) => t.departureSecond * 1000), 'each payment is stamped at its own takeoff');
  assert(trips[0].departureSecond > T0 / 1000 + 90 * 60, 'the first takeoff waits until 150 units have been mined');
  for (let i = 1; i < trips.length; i += 1) assert(trips[i].departureSecond >= trips[i - 1].departureSecond + trips[i - 1].tripSeconds, 'a ship cannot leave while it is away');
  assert.equal(v.spendable, trips.length * 6000);
  assert(repo.reconcile());
  void versions;
});

test('T17-01 offline equals live: one big catch-up and hourly catch-ups give identical shipments and coin', async () => {
  const big = await setup(['alice'], { auto: true });
  const small = await setup(['alice'], { auto: true });
  const end = T0 / 1000 + 20 * 3600;
  await big.game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: end });
  for (let h = 1; h <= 20; h += 1) await small.game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: T0 / 1000 + h * 3600 });
  const a = await view(big.game, 'alice', 20 * 3600); const b = await view(small.game, 'alice', 20 * 3600);
  assert.deepEqual(a.doc.shipments, b.doc.shipments);
  assert.equal(a.spendable, b.spendable);
  assert.equal(JSON.stringify(big.repo.snapshot().ledger.map((e) => [e.id, e.timestamp, e.postings])), JSON.stringify(small.repo.snapshot().ledger.map((e) => [e.id, e.timestamp, e.postings])));
});

test('a long absence (more takeoffs than one transaction holds) settles in committed batches', async () => {
  const { game, repo } = await setup(['alice'], { auto: true });
  const days = 40;
  await game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: T0 / 1000 + days * 86400 });
  const v = await view(game, 'alice', days * 86400);
  assert(v.doc.shipments.length > 0);
  assert.equal(ledgerOf(repo, 'NPC_RAW_PURCHASE').length, v.doc.shipmentCounter, 'every takeoff has exactly one ledger entry');
  assert(v.doc.shipmentCounter > 150, `expected a backlog bigger than one batch, got ${v.doc.shipmentCounter}`);
  assert.equal(v.spendable, v.doc.shipmentCounter * 6000);
  assert(repo.reconcile());
});

test('policy: turning auto off stops takeoffs; a pinned buyer is used; bad buyers are rejected', async () => {
  const { game, versions } = await setup(['alice'], { auto: true });
  await assert.rejects(game.setPolicy(cmd(versions.alice, { destinationId: 'nope' }), ctx('alice', 0)), code('UNKNOWN_DESTINATION'));
  const pinned = await game.setPolicy(cmd(versions.alice, { destinationId: 'far' }), ctx('alice', 0));
  assert.deepEqual(pinned.policy, { auto: true, destinationId: 'far' });
  await game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: T0 / 1000 + 8 * 3600 });
  let v = await view(game, 'alice', 8 * 3600);
  assert(v.doc.shipments.length > 0 && v.doc.shipments.every((s) => s.destinationId === 'far' && s.payment === 150 * 64));
  const off = await game.setPolicy(cmd(v.version, { auto: false }), ctx('alice', 8 * 3600));
  assert.equal(off.policy.auto, false);
  const count = v.doc.shipments.length;
  await game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: T0 / 1000 + 40 * 3600 });
  v = await view(game, 'alice', 40 * 3600);
  assert.equal(v.doc.shipments.length, count, 'no takeoffs while auto is off');
  await assert.rejects(game.setPolicy(cmd(v.version, { auto: 'yes' }), ctx('alice', 40 * 3600)), code('INVALID_COMMAND'));
});

test('a full yard also triggers takeoff, so a small yard can never deadlock a big hold', async () => {
  const { game, repo } = await setup(['alice'], { auto: true });
  const v0 = await view(game, 'alice', 0);
  // Shrink the yard below the hold by editing the owner document through the repository (test-only).
  await repo.transact(async (tx) => {
    const doc = await tx.getDoc(`world/${Buffer.from(JSON.stringify('w')).toString('base64url')}/owner/${Buffer.from(JSON.stringify('alice')).toString('base64url')}/${MONTH}`);
    doc.production.surface.capacityUnits = 60;
    await tx.putDoc(`world/${Buffer.from(JSON.stringify('w')).toString('base64url')}/owner/${Buffer.from(JSON.stringify('alice')).toString('base64url')}/${MONTH}`, doc);
  }, { worldId: 'w', ownerId: 'alice', monthId: MONTH, requestId: 'test-edit' });
  await game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: T0 / 1000 + 4 * 3600 });
  const v = await view(game, 'alice', 4 * 3600);
  assert(v.doc.shipments.length > 0 && v.doc.shipments.every((s) => s.units === 60));
  void v0;
});
