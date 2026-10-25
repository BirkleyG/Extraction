import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryLedgerRepository, replayLedger } from '../src/ledger.js';
import { GameService, monthEndMs } from '../src/game-service.js';
import { MonthCloser, archivePath, statsPath, hallPath } from '../src/month-close.js';

const MONTH = '2026-11';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const B = monthEndMs(MONTH);
const buyers = [{ id: 'near', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500 }];
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
let n = 0;
const cmd = (v, extra = {}) => ({ monthId: MONTH, requestId: `m${++n}`, expectedVersion: v, ...extra });
const ctx = (uid, ms, month = MONTH) => ({ auth: { uid }, activeMonthId: month, now: ms, worldId: 'w', startSite: { siteId: 's', commonOreId: 'ore-1' } });
const code = (c) => (e) => e.code === c;

async function playedWorld({ auto = false } = {}) {
  const repo = new MemoryLedgerRepository();
  const game = new GameService(repo, { npcBuyers: buyers });
  const v = {};
  for (const u of ['alice', 'bob', 'cara']) {
    const e = await game.enroll(cmd(0), ctx(u, T0));
    v[u] = auto ? e.version : (await game.setPolicy(cmd(e.version, { auto: false }), ctx(u, T0))).version;
  }
  // alice sells a lot and keeps it; bob sells and spends; cara never sells.
  let a = (await game.dispatch(cmd(v.alice, { destinationId: 'near' }), ctx('alice', T0 + 3 * 86400_000))).version;
  const bobSale = await game.dispatch(cmd(v.bob, { destinationId: 'near' }), ctx('bob', T0 + 86400_000));
  await game.buyUpgrade(cmd(bobSale.version, { line: 'dig', shaftNumber: 1, mode: 'max' }), ctx('bob', T0 + 86400_000));
  // alice dispatches again just before B so the ETA lands after the boundary (T17-07)
  const late = await game.dispatch(cmd(a, { destinationId: 'near' }), ctx('alice', B - 5_000));
  return { repo, game, late };
}
const hall = (repo) => repo.transact((tx) => tx.getDoc(hallPath('w', MONTH)), { worldId: 'w', ownerId: 'system', monthId: MONTH, readOnly: true });
const read = (repo, path) => repo.transact((tx) => tx.getDoc(path), { worldId: 'w', ownerId: 'system', monthId: MONTH, readOnly: true });

test('T17-06 commands at or after B in the old month are rejected; pre-B departure with post-B ETA counts once (T17-07)', async () => {
  const { repo, game, late } = await playedWorld();
  assert(late.shipment.arrivalSecond * 1000 > B, 'ETA falls after the boundary');
  await assert.rejects(game.dispatch(cmd(99, { destinationId: 'near' }), ctx('cara', B)), code('MONTH_CLOSED'));
  await assert.rejects(game.dispatch(cmd(99, { destinationId: 'near' }), ctx('cara', B + 1)), code('MONTH_CLOSED'));
  const closer = new MonthCloser(repo, { game });
  const archive = await closer.close({ worldId: 'w', monthId: MONTH, nowMs: B + 1000 });
  const alice = archive.ranking.find((r) => r.ownerId === 'alice');
  assert(alice.total >= late.shipment.payment, 'late paid departure is in the snapshot');
  assert.equal(archive.winnerId, 'alice');
  assert.deepEqual(archive.ranking.map((r) => r.rank), [1, 2, 3]);
  // the paid shipment pays exactly once in the ledger
  assert.equal(repo.snapshot().ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE' && e.reference === late.shipment.requestId).length, 1);
  // all coin burned; ledger replays to zero spendable and escrow for everyone
  const balances = replayLedger(repo.snapshot().ledger).balances;
  for (const [account, value] of balances) if (account.startsWith('owner:')) assert.equal(value, 0, account);
  assert(repo.reconcile());
});

test('T17-05/T18-12 a crash at every phase resumes to one snapshot, one burn per owner and one reset', async () => {
  const baseline = await playedWorld();
  const reference = await new MonthCloser(baseline.repo, { game: baseline.game }).close({ worldId: 'w', monthId: MONTH, nowMs: B + 1000 });
  const phases = ['started', 'drained', 'snapshot', 'burned:alice', 'burned:bob', 'burned:cara', 'done'];
  for (const crashAt of phases) {
    const { repo, game } = await playedWorld();
    let crashed = false;
    const crashing = new MonthCloser(repo, { game, hooks: { afterPhase: (name) => { if (name === crashAt && !crashed) { crashed = true; throw new Error(`simulated outage after ${name}`); } } } });
    await assert.rejects(crashing.close({ worldId: 'w', monthId: MONTH, nowMs: B + 1000 }), /simulated outage/);
    const resumed = await new MonthCloser(repo, { game }).close({ worldId: 'w', monthId: MONTH, nowMs: B + 5 * 3600_000 });
    assert.deepEqual(resumed.ranking, reference.ranking, `ranking after crash at ${crashAt}`);
    assert.equal(resumed.winnerId, reference.winnerId);
    const burns = repo.snapshot().ledger.filter((e) => e.type === 'MONTH_CLOSE_BURN');
    assert.equal(new Set(burns.map((e) => e.ownerId)).size, burns.length, `one burn per owner (${crashAt})`);
    assert.equal(burns.length, baseline.repo.snapshot().ledger.filter((e) => e.type === 'MONTH_CLOSE_BURN').length);
    assert.equal(JSON.stringify(await hall(repo)), JSON.stringify(await hall(baseline.repo)));
    assert(repo.reconcile());
  }
});

test('T01-03 concurrent close attempts take the snapshot once; T01-04 all-time stats equal the monthly results', async () => {
  const { repo, game } = await playedWorld();
  const results = await Promise.all([1, 2, 3].map(() => new MonthCloser(repo, { game }).close({ worldId: 'w', monthId: MONTH, nowMs: B + 10 })));
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
  assert.equal(repo.snapshot().ledger.filter((e) => e.type === 'MONTH_CLOSE_BURN').length, results[0].ranking.filter((r) => r.total > 0).length);
  for (const row of results[0].ranking) {
    const stats = await read(repo, statsPath('w', row.ownerId));
    assert.equal(stats.monthsPlayed, 1);
    assert.equal(stats.totalCoin, row.total);
    assert.equal(stats.bestMonth, row.total);
    assert.equal(stats.monthsWon, row.rank === 1 ? 1 : 0);
  }
  await new MonthCloser(repo, { game }).close({ worldId: 'w', monthId: MONTH, nowMs: B + 20 });
  assert.equal((await read(repo, statsPath('w', 'alice'))).monthsPlayed, 1, 'closing twice never double-counts');
});

test('the next month starts clean: nothing carries over and old-month ids cannot act', async () => {
  const { repo, game } = await playedWorld();
  await new MonthCloser(repo, { game }).close({ worldId: 'w', monthId: MONTH, nowMs: B + 10 });
  const next = '2026-12';
  const nctx = (uid, ms) => ({ auth: { uid }, activeMonthId: next, now: ms, worldId: 'w', startSite: { siteId: 's2', commonOreId: 'ore-1' } });
  const e = await game.enroll({ monthId: next, requestId: 'new-month-enroll', expectedVersion: 0 }, nctx('alice', B));
  const view = await game.ownerView('alice', next, nctx('alice', B));
  assert.equal(view.spendable, 0);
  assert.equal(view.doc.shipments.length, 0);
  assert.equal(view.doc.totalExternalEarnings, 0);
  assert.equal(e.version, 1);
  await assert.rejects(game.dispatch(cmd(1, { destinationId: 'near' }), ctx('alice', B + 100)), code('MONTH_CLOSED'));
});

test('automatic takeoffs before B are paid into the snapshot; none at or after B', async () => {
  const { repo, game } = await playedWorld({ auto: true });
  const archive = await new MonthCloser(repo, { game }).close({ worldId: 'w', monthId: MONTH, nowMs: B + 1000 });
  const entries = repo.snapshot().ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE');
  assert(entries.length > 20, 'a month of auto takeoffs happened');
  assert(entries.every((e) => e.timestamp < B), 'no payment is stamped at or after the boundary');
  const bob = archive.ranking.find((r) => r.ownerId === 'bob');
  const paidBob = entries.filter((e) => e.ownerId === 'bob').reduce((a, e) => a + e.postings[0].delta, 0);
  assert.equal(bob.total, paidBob - 0 + 0 - repo.snapshot().ledger.filter((e) => e.type === 'SYSTEM_PURCHASE' && e.ownerId === 'bob').reduce((a, e) => a - e.postings[0].delta, 0));
  assert(repo.reconcile());
});
