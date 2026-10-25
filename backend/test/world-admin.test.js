import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldAdmin } from '../src/world-admin.js';
import { GameService, rosterPath, ownerPath, MAX_DEPARTURES_PER_TX } from '../src/game-service.js';
import { MemoryLedgerRepository } from '../src/ledger.js';
import { archivePath } from '../src/month-close.js';

const monthId = '2026-11';
const start = Date.parse('2026-11-01T00:00:00Z');
const worldId = 'w';
const buyers = [{ id: 'near', name: 'Near', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500 }];
async function setup(owners = ['alice']) {
  const repository = new MemoryLedgerRepository();
  const game = new GameService(repository, { npcBuyers: buyers });
  for (const uid of owners) await game.enroll({ monthId, requestId: `enroll-${uid}`, expectedVersion: 0 }, {
    auth: { uid }, worldId, activeMonthId: monthId, now: start,
    startSite: { siteId: 'site', commonOreId: 'ore' },
  });
  const admin = new WorldAdmin({ firestore: {}, repository, game, seedSecret: 'test-only-seed-secret' });
  admin.rollover = async () => ({ monthId, closed: [] });
  const read = (path) => repository.transact((tx) => tx.getDoc(path));
  return { repository, game, admin, read };
}

test('T18-08 zero clients: enrolled roster advances durable takeoffs and ledger; retry/restart pays once', async () => {
  const { repository, game, admin, read } = await setup();
  assert.deepEqual(await read(rosterPath(worldId, monthId)), { owners: ['alice'] });
  const nowMs = start + 86400 * 1000;
  let result;
  for (let i = 0; i < 20; i += 1) {
    const before = repository.snapshot().ledger.length;
    result = await admin.tick({ worldId, nowMs });
    assert(repository.snapshot().ledger.length - before <= MAX_DEPARTURES_PER_TX);
    if (result.done) break;
  }
  assert.equal(result.done, true);
  const owner = await read(ownerPath(worldId, 'alice', monthId));
  assert.equal(owner.simSecond, nowMs / 1000);
  assert(owner.shipmentCounter > 0);
  const before = repository.snapshot();
  admin.game = new GameService(repository, { npcBuyers: buyers });
  await Promise.all([admin.tick({ worldId, nowMs }), admin.tick({ worldId, nowMs })]);
  assert.equal(repository.snapshot().ledger.length, before.ledger.length);
  assert.equal(repository.snapshot().ledger.length, owner.shipmentCounter);
  assert(repository.reconcile());
});

test('worker bounds each owner to one batch and does not report partial or failed work complete', async () => {
  const { admin } = await setup(['alice', 'bob', 'cara']);
  const calls = [];
  admin.game.settleBatch = async (scope) => {
    calls.push(scope);
    if (scope.ownerId === 'bob') throw Object.assign(new Error('unavailable'), { code: 'UNAVAILABLE' });
    return scope.ownerId === 'cara';
  };
  const result = await admin.tick({ worldId, nowMs: start + 1000 });
  assert.equal(calls.length, 3);
  assert(calls.every((s) => s.toSec === start / 1000 + 1 && s.monthId === monthId));
  assert.equal(result.done, false);
  assert.deepEqual(result.settlements.map((s) => s.done), [false, false, true]);
  assert.equal(result.settlements[1].error, 'UNAVAILABLE');
  calls.length = 0;
  admin.game.settleBatch = async (scope) => { calls.push(scope); return true; };
  assert.equal((await admin.tick({ worldId, nowMs: start + 1000 })).done, true);
  assert.equal(calls.length, 3);
});

test('worker rejects oversized roster without scans or settlement and preserves rollover ordering', async () => {
  const { admin, repository } = await setup();
  await repository.transact((tx) => tx.putDoc(rosterPath(worldId, monthId), { owners: Array.from({ length: 11 }, (_, i) => `u${i}`) }));
  let rolled = false;
  admin.rollover = async () => { rolled = true; return { monthId, closed: ['2026-10'] }; };
  admin.game.settleBatch = async () => assert.fail('must not settle oversized roster');
  await assert.rejects(admin.tick({ worldId, nowMs: start }), { code: 'INVALID_ROSTER' });
  assert(rolled);
});

test('missing enrolled owner fails visibly; an uncreated world skips without roster access', async () => {
  const { admin, repository } = await setup();
  await repository.transact((tx) => tx.putDoc(rosterPath(worldId, monthId), { owners: ['missing'] }));
  const result = await admin.tick({ worldId, nowMs: start });
  assert.equal(result.done, false);
  assert.equal(result.settlements[0].error, 'NOT_ENROLLED');
  admin.rollover = async () => ({ skipped: true, reason: 'world not created yet' });
  admin.repository = { transact: () => assert.fail('must not read missing world roster') };
  assert.equal((await admin.tick({ worldId, nowMs: start })).skipped, true);
});

test('a failed payment transaction rolls back its checkpoint and a later tick safely retries', async () => {
  const { admin, repository, read } = await setup();
  const original = repository.transact.bind(repository);
  let failOnce = true;
  repository.transact = (work, scope) => original(async (tx) => {
    if (scope?.ownerId === 'alice' && scope?.requestId?.startsWith('settle-') && failOnce) {
      const append = tx.append.bind(tx);
      tx.append = async (entry) => { await append(entry); failOnce = false; throw new Error('injected commit failure'); };
    }
    return work(tx);
  }, scope);
  const path = ownerPath(worldId, 'alice', monthId);
  const before = await read(path);
  const nowMs = start + 86400 * 1000;
  const failed = await admin.tick({ worldId, nowMs });
  assert.equal(failed.done, false);
  assert.equal(repository.snapshot().ledger.length, 0);
  assert.deepEqual(await read(path), before);
  for (let i = 0; i < 20; i += 1) if ((await admin.tick({ worldId, nowMs })).done) break;
  const after = await read(path);
  assert.equal(after.simSecond, nowMs / 1000);
  assert.equal(repository.snapshot().ledger.length, after.shipmentCounter);
  assert(repository.reconcile());
});


test('tick prepares the new month before settlement and keeps rollover results', async () => {
  const { admin, repository } = await setup();
  await repository.transact((tx) => tx.putDoc(archivePath(worldId, '2026-10'), { closed: true }));
  let activeMonthId = '2026-10';
  let prepared = false;
  const ref = {
    get: async () => ({ exists: true, data: () => ({ activeMonthId }) }),
    update: async (value) => { activeMonthId = value.activeMonthId; },
  };
  admin.firestore = { collection: () => ({ doc: () => ref }) };
  admin.game.storePlanet = async ({ monthId: month }) => { assert.equal(month, monthId); prepared = true; };
  admin.game.settleBatch = async ({ monthId: month }) => {
    assert(prepared);
    assert.equal(activeMonthId, monthId);
    assert.equal(month, monthId);
    return true;
  };
  admin.rollover = WorldAdmin.prototype.rollover.bind(admin);
  const result = await admin.tick({ worldId, nowMs: start });
  assert.equal(result.monthId, monthId);
  assert.deepEqual(result.closed, []);
  assert.equal(result.done, true);
});
