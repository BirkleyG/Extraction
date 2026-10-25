import test from 'node:test';
import assert from 'node:assert/strict';
import { LedgerCommandService, LedgerError, MemoryLedgerRepository, replayLedger } from '../src/index.js';
import { ledgerTransactionId } from '../src/ledger.js';

const context = (uid, monthId, now = 100) => ({ auth: { uid }, activeMonthId: monthId, now });
const request = (monthId, requestId, expectedVersion, extra = {}) => ({ monthId, requestId, expectedVersion, ...extra });
const code = (name) => (error) => error instanceof LedgerError && error.code === name;

test('T18-01 partial: replay reconstructs spendable and escrow balances; cached state reconciles', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 100 });
  const ctx = context('guild-a', '2026-10');
  await service.grantStarter(request('2026-10', 'g1', 0), ctx);
  await service.fundEscrow(request('2026-10', 'e1', 1, { amount: 35 }), ctx);
  const snapshot = repo.snapshot();
  const rebuilt = replayLedger(snapshot.ledger);
  assert.deepEqual([...rebuilt.balances], [...snapshot.balances]);
  assert.equal(repo.reconcile(), true);
  assert.equal((await service.wallet('guild-a', '2026-10', ctx)).totalOwned, 100);
  const owned = [...snapshot.balances].filter(([account]) => account.startsWith('owner:')).reduce((sum, [, balance]) => sum + balance, 0);
  const externalSources = [...snapshot.balances].filter(([account]) => account.startsWith('source:')).reduce((sum, [, balance]) => sum - balance, 0);
  assert.equal(owned, externalSources);
});

test('T18-02 partial: repeated command ID is idempotent, including a retry after version advances', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 100 });
  const ctx = context('guild-a', '2026-10');
  const first = await service.grantStarter(request('2026-10', 'same-id', 0), ctx);
  await service.fundEscrow(request('2026-10', 'fund', 1, { amount: 20 }), ctx);
  const retry = await service.grantStarter(request('2026-10', 'same-id', 0), context('guild-a', '2026-10', 999));
  assert.deepEqual(retry, first);
  assert.equal(repo.snapshot().ledger.length, 2);
});

test('concurrent duplicate requests serialize to one grant and return the same result', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 100 });
  const ctx = context('guild-a', '2026-10');
  const [a, b] = await Promise.all([
    service.grantStarter(request('2026-10', 'same-id', 0), ctx),
    service.grantStarter(request('2026-10', 'same-id', 0), ctx),
  ]);
  assert.deepEqual(a, b);
  assert.equal(repo.snapshot().ledger.length, 1);
});

test('same request ID with altered payload conflicts; different IDs cannot claim a second starter grant', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 100 });
  const ctx = context('guild-a', '2026-10');
  await service.fundEscrow(request('2026-10', 'same', 0, { amount: 5 }), ctx).catch((err) => assert.equal(err.code, 'INSUFFICIENT_FUNDS'));
  await service.grantStarter(request('2026-10', 'grant1', 0), ctx);
  await assert.rejects(service.grantStarter(request('2026-10', 'grant1', 0, { amount: 999 }), ctx), code('INJECTED_FIELD'));
  await assert.rejects(service.grantStarter(request('2026-10', 'grant2', 1), ctx), code('START_GRANT_ALREADY_CLAIMED'));
  assert.equal(repo.snapshot().ledger.length, 1);
});

test('successful escrow request ID rejects changed amount or action', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 100 });
  const ctx = context('guild-a', '2026-10');
  await service.grantStarter(request('2026-10', 'grant', 0), ctx);
  await service.fundEscrow(request('2026-10', 'same-request', 1, { amount: 25 }), ctx);
  await assert.rejects(service.fundEscrow(request('2026-10', 'same-request', 1, { amount: 26 }), ctx), code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(service.releaseEscrow(request('2026-10', 'same-request', 1, { amount: 25 }), ctx), code('IDEMPOTENCY_CONFLICT'));
  assert.equal(repo.snapshot().ledger.length, 2);
});

test('month isolation, authentication, owner checks, and command field allowlist', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 25 });
  await service.grantStarter(request('2026-10', 'g1', 0), context('guild-a', '2026-10'));
  await service.grantStarter(request('2026-11', 'g2', 0), context('guild-a', '2026-11'));
  assert.equal((await service.wallet('guild-a', '2026-10', context('guild-a', '2026-10'))).totalOwned, 25);
  assert.equal((await service.wallet('guild-a', '2026-11', context('guild-a', '2026-11'))).totalOwned, 25);
  await assert.rejects(service.wallet('guild-b', '2026-10', context('guild-a', '2026-10')), code('FORBIDDEN'));
  await assert.rejects(service.grantStarter(request('2026-09', 'g3', 0), context('guild-a', '2026-11')), code('STALE_MONTH'));
  await assert.rejects(service.grantStarter({ ...request('2026-10', 'g3', 1), ownerId: 'guild-b' }, context('guild-a', '2026-10')), code('INJECTED_FIELD'));
  await assert.rejects(service.grantStarter({ ...request('2026-10', 'g3', 1), payment: 100, seed: 4 }, context('guild-a', '2026-10')), code('INJECTED_FIELD'));
  await assert.rejects(service.grantStarter(request('2026-10', 'g3', 1), { activeMonthId: '2026-10', now: 5 }), code('UNAUTHENTICATED'));
});

test('owner escrow fund and release conserve coin; gifts are not an API operation', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 100 });
  const ctx = context('guild-a', '2026-10');
  await service.grantStarter(request('2026-10', 'g', 0), ctx);
  const funded = await service.fundEscrow(request('2026-10', 'f', 1, { amount: 40 }), ctx);
  assert.deepEqual([funded.spendable, funded.escrow, funded.totalOwned], [60, 40, 100]);
  const released = await service.releaseEscrow(request('2026-10', 'r', 2, { amount: 15 }), ctx);
  assert.deepEqual([released.spendable, released.escrow, released.totalOwned], [75, 25, 100]);
  assert.equal(typeof service.gift, 'undefined');
  assert.equal(repo.snapshot().ledger.at(-1).postings.reduce((sum, p) => sum + p.delta, 0), 0);
});

test('concurrent distinct escrow commands with the same version serialize and reject one stale write', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 100 });
  const ctx = context('guild-a', '2026-10');
  await service.grantStarter(request('2026-10', 'grant', 0), ctx);
  const outcomes = await Promise.allSettled([
    service.fundEscrow(request('2026-10', 'fund-a', 1, { amount: 70 }), ctx),
    service.fundEscrow(request('2026-10', 'fund-b', 1, { amount: 60 }), ctx),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected' && outcome.reason.code === 'STALE_VERSION').length, 1);
  const wallet = await service.wallet('guild-a', '2026-10', ctx);
  assert.equal(wallet.totalOwned, 100);
  assert(wallet.spendable >= 0 && wallet.escrow >= 0);
});

test('long request IDs and delimiter characters cannot collide across owner scopes', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 1 });
  const longRequest = 'x'.repeat(160);
  const longUid = 'u'.repeat(256);
  await service.grantStarter(request('2026-10', longRequest, 0), context(longUid, '2026-10'));
  await service.grantStarter(request('2026-10', 'r', 0), context('guild:a', '2026-10'));
  await service.grantStarter(request('2026-10', 'r', 0), context('guild', '2026-10'));
  assert.equal(repo.snapshot().ledger.length, 3);
  assert.equal(new Set(repo.snapshot().ledger.map((entry) => entry.id)).size, 3);
});

test('invalid, unsafe, and insufficient amounts reject without changing state', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 10 });
  const ctx = context('guild-a', '2026-10');
  const before = repo.snapshot();
  await assert.rejects(service.grantStarter(request('2026-10', 'bad', 0, { amount: Number.MAX_SAFE_INTEGER + 1 }), ctx), code('INJECTED_FIELD'));
  await assert.rejects(service.fundEscrow(request('2026-10', 'fund', 0, { amount: Number.MAX_SAFE_INTEGER + 1 }), ctx), code('INVALID_AMOUNT'));
  await service.grantStarter(request('2026-10', 'g', 0), ctx);
  const afterGrant = repo.snapshot();
  await assert.rejects(service.fundEscrow(request('2026-10', 'too-much', 1, { amount: 11 }), ctx), code('INSUFFICIENT_FUNDS'));
  assert.equal(repo.snapshot().ledger.length, afterGrant.ledger.length);
  assert.deepEqual([...repo.snapshot().balances], [...afterGrant.balances]);
  assert.equal(before.ledger.length, 0);
});

test('safe aggregate limit is wallet-scoped; unrelated owners and months do not share a coin ceiling', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: Number.MAX_SAFE_INTEGER });
  await service.grantStarter(request('2026-10', 'a1', 0), context('guild-a', '2026-10'));
  await service.grantStarter(request('2026-10', 'b1', 0), context('guild-b', '2026-10'));
  await service.grantStarter(request('2026-11', 'a2', 0), context('guild-a', '2026-11'));
  assert.equal(repo.snapshot().ledger.length, 3);
  assert.equal(repo.reconcile(), true);
});

test('stale version rejects and failed transaction leaves no command or ledger mutation', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 10 });
  const ctx = context('guild-a', '2026-10');
  await service.grantStarter(request('2026-10', 'g', 0), ctx);
  const before = repo.snapshot();
  await assert.rejects(service.fundEscrow(request('2026-10', 'stale', 0, { amount: 1 }), ctx), code('STALE_VERSION'));
  await assert.rejects(service.fundEscrow(request('2026-10', 'failed', 1, { amount: 11 }), ctx), code('INSUFFICIENT_FUNDS'));
  assert.equal(repo.snapshot().ledger.length, before.ledger.length);
  assert.deepEqual([...repo.snapshot().balances], [...before.balances]);
  await service.fundEscrow(request('2026-10', 'failed', 1, { amount: 1 }), ctx);
});

test('T18-02 partial: replay is idempotent for a duplicate entry and detects corruption or altered duplicate IDs', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 10 });
  await service.grantStarter(request('2026-10', 'g', 0), context('guild-a', '2026-10'));
  const entry = repo.snapshot().ledger[0];
  const corrupted = { ...entry, postings: [{ account: 'owner:Z3VpbGQtYQ:MjAyNi0xMA:spendable', delta: 10 }] };
  assert.throws(() => replayLedger([corrupted]), code('INVALID_LEDGER'));
  assert.deepEqual([...replayLedger([entry, entry]).balances], [...replayLedger([entry]).balances]);
  assert.throws(() => replayLedger([entry, { ...entry, timestamp: entry.timestamp + 1 }]), code('IDEMPOTENCY_CONFLICT'));
  const secondGrant = { ...entry, id: ledgerTransactionId('START_GRANT', entry.ownerId, entry.monthId, 'g2'), reference: 'g2', postings: entry.postings.map((p) => ({ ...p })) };
  secondGrant.postings[1].account = `source:START_GRANT:${Buffer.from(JSON.stringify(secondGrant.id)).toString('base64url')}`;
  assert.throws(() => replayLedger([entry, secondGrant]), code('START_GRANT_ALREADY_CLAIMED'));
});

test('unknown reasons, malformed scope and unsafe amounts are rejected during replay', () => {
  assert.throws(() => replayLedger([{
    id: 'overflow', ownerId: 'a', monthId: 'm', timestamp: 1, type: 'TEST', reference: 'r',
    postings: [
      { account: 'owner:a:m:spendable', delta: Number.MAX_SAFE_INTEGER },
      { account: 'sink:x', delta: Number.MAX_SAFE_INTEGER },
      { account: 'source:y', delta: -Number.MAX_SAFE_INTEGER },
    ],
  }]), code('INVALID_LEDGER'));
  assert.throws(() => new LedgerCommandService(new MemoryLedgerRepository(), { starterGrantAmount: Number.MAX_SAFE_INTEGER + 1 }), TypeError);
  const negativeTime = { id: 'bad', ownerId: 'a', monthId: '2026-10', timestamp: -1, type: 'START_GRANT', reference: 'r', postings: [] };
  assert.throws(() => replayLedger([negativeTime]), code('INVALID_LEDGER'));
});


test('transaction rollback and escaped handles cannot mutate committed records', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 10 });
  const ctx = context('guild-a', '2026-10');
  await service.grantStarter(request('2026-10', 'grant', 0), ctx);
  let escaped;
  await assert.rejects(repo.transact((tx) => {
    tx.bumpVersion('guild-a', '2026-10');
    throw new Error('simulated failure before commit');
  }), /simulated failure/);
  assert.equal((await service.wallet('guild-a', '2026-10', ctx)).version, 1);
  await repo.transact((tx) => { escaped = tx; });
  escaped.bumpVersion('guild-a', '2026-10');
  assert.equal((await service.wallet('guild-a', '2026-10', ctx)).version, 1);
  const snapshot = repo.snapshot();
  snapshot.balances.clear();
  assert.throws(() => { snapshot.ledger[0].postings[0].delta = 999; }, TypeError);
  assert.equal(repo.reconcile(), true);
  assert.equal((await service.wallet('guild-a', '2026-10', ctx)).totalOwned, 10);
});

test('wallet output is allowlisted and fractional, negative or nonfinite transfers reject atomically', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 10 });
  const ctx = context('guild-a', '2026-10');
  await service.grantStarter(request('2026-10', 'grant', 0), ctx);
  for (const amount of [0, -1, 0.5, NaN, Infinity, '1']) {
    await assert.rejects(service.fundEscrow(request('2026-10', 'invalid', 1, { amount }), ctx), code('INVALID_AMOUNT'));
  }
  const wallet = await service.wallet('guild-a', '2026-10', ctx);
  assert.deepEqual(Object.keys(wallet).sort(), ['ownerId', 'monthId', 'spendable', 'escrow', 'totalOwned', 'version'].sort());
  assert.equal(wallet.version, 1);
  assert.equal(repo.snapshot().ledger.length, 1);
});

test('delimiter, NUL and Unicode edge cases retain distinct identity scopes', async () => {
  const repo = new MemoryLedgerRepository();
  const service = new LedgerCommandService(repo, { starterGrantAmount: 1 });
  const owners = ['guild:a', 'guild\u0000a', '\ud800', '\ud801', '\ufffd'];
  for (const uid of owners) {
    await service.grantStarter(request('2026-10', 'grant\u0000:a', 0), context(uid, '2026-10'));
  }
  assert.equal(new Set(repo.snapshot().ledger.map((entry) => entry.id)).size, owners.length);
  assert.equal(repo.reconcile(), true);
});
