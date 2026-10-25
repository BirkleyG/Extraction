// Resumable, idempotent month-closing state machine (sections 01, 02, 17, 18). Every phase is a separate
// transaction and records its progress, so a crash at any point resumes to the same single snapshot, single
// commitment finalization and single reset (T17-05, T18-12). Coin is burned only after the snapshot exists.
import { LedgerError, ledgerTransactionId } from './ledger.js';
import { MAX_COMMAND_CATCHUP_TICKS, monthEndMs, ownerPath, rosterPath } from './game-service.js';
import { advanceOwner } from './mine-engine.js';

const fail = (code, message = code) => { throw new LedgerError(code, message); };
const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const ownerAccount = (ownerId, monthId, bucket) => `owner:${encode(ownerId)}:${encode(monthId)}:${bucket}`;
const closingPath = (worldId, monthId) => `world/${encode(worldId)}/closing/${monthId}`;
export const archivePath = (worldId, monthId) => `world/${encode(worldId)}/archive/${monthId}`;
export const statsPath = (worldId, ownerId) => `world/${encode(worldId)}/stats/${encode(ownerId)}`;
export const hallPath = (worldId, monthId) => `world/${encode(worldId)}/hall/${monthId}`;

export class MonthCloser {
  /** @param hooks optional `{ afterPhase(name) }` used by crash tests to interrupt between phases. */
  constructor(repository, { hooks = {} } = {}) {
    this.repository = repository;
    this.hooks = hooks;
  }

  /** Run (or resume) the close of `monthId`. Safe to call repeatedly and concurrently. */
  async close({ worldId = 'default', monthId, nowMs }) {
    const boundary = monthEndMs(monthId);
    if (!Number.isSafeInteger(nowMs) || nowMs < boundary) fail('NOT_YET_CLOSING', 'The month has not reached its closing boundary');
    const sys = (work) => this.repository.transact(work, { worldId, ownerId: 'system', monthId, requestId: `close-${monthId}`, closing: true });
    const boundarySec = boundary / 1000;

    const closing = await sys(async (tx) => {
      const existing = await tx.getDoc(closingPath(worldId, monthId));
      if (existing) return existing;
      const roster = (await tx.getDoc(rosterPath(worldId, monthId))) ?? { owners: [] };
      const created = { phase: 'draining', owners: [...roster.owners].sort(), advanced: [], burned: [], boundaryMs: boundary };
      await tx.putDoc(closingPath(worldId, monthId), created);
      return created;
    });
    if (closing.phase === 'done') return this.#archive(worldId, monthId);
    await this.hooks.afterPhase?.('started');

    // Phase 1: bring every private business to exactly B (events < B only). No payments, no new departures.
    for (const ownerId of closing.owners) {
      if (closing.advanced.includes(ownerId)) continue;
      let remaining = 1;
      while (remaining > 0) {
        remaining = await this.repository.transact(async (tx) => {
          const doc = await tx.getDoc(ownerPath(worldId, ownerId, monthId));
          if (!doc) return 0;
          if (doc.simSecond >= boundarySec) return 0;
          const r = advanceOwner(doc, boundarySec, MAX_COMMAND_CATCHUP_TICKS);
          await tx.putDoc(ownerPath(worldId, ownerId, monthId), r.state);
          return r.remainingSeconds;
        }, { worldId, ownerId, monthId, requestId: `close-advance-${monthId}`, closing: true });
      }
      await sys(async (tx) => {
        const c = await tx.getDoc(closingPath(worldId, monthId));
        if (!c.advanced.includes(ownerId)) { c.advanced.push(ownerId); await tx.putDoc(closingPath(worldId, monthId), c); }
      });
    }
    await this.hooks.afterPhase?.('drained');

    // Phase 2: one snapshot of final coin on hand (spendable + escrow, counted once) and the ranking.
    // Nothing can change after B (commands are rejected, owners are drained), so reading first and writing once is safe.
    const rows = [];
    for (const ownerId of closing.owners) {
      const view = await this.repository.transact(async (otx) => ({
        spendable: await otx.balance(ownerId, monthId, 'spendable'), escrow: await otx.balance(ownerId, monthId, 'escrow'),
        doc: await otx.getDoc(ownerPath(worldId, ownerId, monthId)),
      }), { worldId, ownerId, monthId, readOnly: true, closing: true });
      rows.push({ ownerId, spendable: view.spendable, escrow: view.escrow, total: view.spendable + view.escrow, reachedMs: view.doc?.peak?.firstReachedMs ?? Number.MAX_SAFE_INTEGER, earned: view.doc?.totalExternalEarnings ?? 0 });
    }
    rows.sort((a, b) => b.total - a.total || a.reachedMs - b.reachedMs || (a.ownerId < b.ownerId ? -1 : 1));
    const ranking = rows.map((r, i) => ({ ownerId: r.ownerId, spendable: r.spendable, escrow: r.escrow, total: r.total, earned: r.earned, rank: i + 1 }));
    await sys(async (tx) => {
      if (await tx.getDoc(archivePath(worldId, monthId))) return; // the snapshot is taken exactly once
      await tx.putDoc(archivePath(worldId, monthId), { monthId, boundaryMs: boundary, snapshotAtMs: nowMs, ranking, winnerId: ranking[0]?.ownerId ?? null });
    });
    await this.hooks.afterPhase?.('snapshot');

    // Phase 3: archive commitments and burn remaining coin, once per owner. Paid shipments are never paid again
    // and never create stock in the next month (the new month's owner state is a different, fresh document).
    const archive = await sys((tx) => tx.getDoc(archivePath(worldId, monthId)));
    for (const row of archive.ranking) {
      const done = (await sys((tx) => tx.getDoc(closingPath(worldId, monthId)))).burned.includes(row.ownerId);
      if (done) continue;
      await this.repository.transact(async (tx) => {
        const doc = await tx.getDoc(ownerPath(worldId, row.ownerId, monthId));
        const spendable = await tx.balance(row.ownerId, monthId, 'spendable');
        const escrow = await tx.balance(row.ownerId, monthId, 'escrow');
        if (spendable + escrow > 0) {
          const id = ledgerTransactionId('MONTH_CLOSE_BURN', row.ownerId, monthId, `close-${monthId}`);
          // Zero postings are rejected by the ledger; burn only non-zero buckets, keeping spendable first when present.
          const burn = [];
          if (spendable > 0) burn.push({ account: ownerAccount(row.ownerId, monthId, 'spendable'), delta: -spendable });
          if (escrow > 0) burn.push({ account: ownerAccount(row.ownerId, monthId, 'escrow'), delta: -escrow });
          await tx.append({ id, ownerId: row.ownerId, monthId, timestamp: boundary, type: 'MONTH_CLOSE_BURN', reference: `close-${monthId}`, postings: [...burn, { account: `sink:MONTH_CLOSE_BURN:${encode(id)}`, delta: spendable + escrow }] });
        }
        if (doc) await tx.putDoc(ownerPath(worldId, row.ownerId, monthId), { ...doc, closedAtMs: boundary });
        const stats = (await tx.getDoc(statsPath(worldId, row.ownerId))) ?? { monthsPlayed: 0, totalCoin: 0, bestMonth: 0, monthsWon: 0, months: [] };
        if (!stats.months.some((m) => m.monthId === monthId)) {
          stats.months.push({ monthId, final: row.total, rank: row.rank });
          stats.monthsPlayed += 1; stats.totalCoin += row.total; stats.bestMonth = Math.max(stats.bestMonth, row.total);
          if (row.rank === 1) stats.monthsWon += 1;
          await tx.putDoc(statsPath(worldId, row.ownerId), stats);
        }
      }, { worldId, ownerId: row.ownerId, monthId, requestId: `close-${monthId}`, closing: true });
      await sys(async (tx) => {
        const c = await tx.getDoc(closingPath(worldId, monthId));
        if (!c.burned.includes(row.ownerId)) { c.burned.push(row.ownerId); await tx.putDoc(closingPath(worldId, monthId), c); }
      });
      await this.hooks.afterPhase?.(`burned:${row.ownerId}`);
    }

    await sys(async (tx) => {
      const c = await tx.getDoc(closingPath(worldId, monthId));
      if (c.phase !== 'done') {
        c.phase = 'done';
        await tx.putDoc(closingPath(worldId, monthId), c);
        await tx.putDoc(hallPath(worldId, monthId), { monthId, winnerId: archive.winnerId, finalCoin: archive.ranking[0]?.total ?? 0 });
      }
    });
    await this.hooks.afterPhase?.('done');
    return this.#archive(worldId, monthId);
  }

  #archive(worldId, monthId) {
    return this.repository.transact((tx) => tx.getDoc(archivePath(worldId, monthId)), { worldId, ownerId: 'system', monthId, readOnly: true, closing: true });
  }
}
