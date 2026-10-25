// Firestore-aware world administration: invite-only membership, month preparation and rollover.
// These run on the trusted server only (HTTP routes guarded by an invite code or an internal token).
import { createHash, timingSafeEqual } from 'node:crypto';
import { LedgerError } from './ledger.js';
import { generateWorld } from './world.js';
import { MonthCloser, archivePath } from './month-close.js';
import { rosterPath } from './game-service.js';

const sha = (v) => createHash('sha256').update(v).digest('hex');
const fail = (code, message = code) => { throw new LedgerError(code, message); };
export const monthOf = (ms) => `${new Date(ms).getUTCFullYear()}-${String(new Date(ms).getUTCMonth() + 1).padStart(2, '0')}`;
const previousMonth = (monthId) => { const [y, m] = monthId.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
export const safeEqual = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());

export class WorldAdmin {
  /**
   * @param {{firestore, game: import('./game-service.js').GameService, repository, inviteCode?: string, maxMembers?: number, seedSecret: string, players?: number}} options
   */
  constructor({ firestore, game, repository, inviteCode = null, maxMembers = 10, seedSecret, players = 10 }) {
    if (!firestore || !game || !repository) throw new TypeError('firestore, game and repository are required');
    if (typeof seedSecret !== 'string' || seedSecret.length < 16) throw new TypeError('A seedSecret of at least 16 characters is required');
    Object.assign(this, { firestore, game, repository, inviteCode, maxMembers, seedSecret, players });
  }

  #worldRef(worldId) { return this.firestore.collection('worlds').doc(sha(worldId)); }

  /** Join a world with the invite code. Idempotent for existing members. The first call creates the world. */
  async join({ worldId, uid, inviteCode, nowMs }) {
    if (!this.inviteCode) fail('JOIN_DISABLED');
    if (typeof inviteCode !== 'string' || !safeEqual(inviteCode, this.inviteCode)) fail('FORBIDDEN');
    const monthId = monthOf(nowMs);
    const ref = this.#worldRef(worldId);
    const memberRef = ref.collection('owners').doc(sha(uid));
    await this.firestore.runTransaction(async (tx) => {
      const [world, member, all] = await Promise.all([tx.get(ref), tx.get(memberRef), tx.get(ref.collection('owners'))]);
      if (member.exists) return;
      if (all.size >= this.maxMembers) fail('WORLD_FULL');
      if (!world.exists) tx.create(ref, { worldId, activeMonthId: monthId, status: 'active' });
      tx.create(memberRef, { uid, status: 'active', role: 'player' });
    });
    await this.rollover({ worldId, nowMs });
    return { ok: true, worldId, monthId };
  }

  /** Prepare the current month (planet, NPC budgets, active month) and close any finished months. Idempotent. */
  async rollover({ worldId, nowMs }) {
    const monthId = monthOf(nowMs);
    const ref = this.#worldRef(worldId);
    const world = await ref.get();
    if (!world.exists) return { skipped: true, reason: 'world not created yet' };
    const seed = sha(`${this.seedSecret}|${worldId}|${monthId}`);
    await this.game.storePlanet({ worldId, monthId, planet: generateWorld({ seed, monthId, players: this.players }) });
    await this.game.seedNpcBuyers({ worldId, monthId, nowSec: Math.floor(nowMs / 1000) });
    if (world.data().activeMonthId < monthId) await ref.update({ activeMonthId: monthId });
    const closed = [];
    // Close the previous month if it had any players and is not finished yet.
    for (let m = previousMonth(monthId), i = 0; i < 3; m = previousMonth(m), i += 1) {
      const archived = await this.repository.transact((tx) => tx.getDoc(archivePath(worldId, m)), { worldId, ownerId: 'system', monthId: m, readOnly: true, closing: true });
      if (archived) break;
      const roster = await this.repository.transact((tx) => tx.getDoc(rosterPath(worldId, m)), { worldId, ownerId: 'system', monthId: m, readOnly: true, closing: true });
      if (!roster?.owners?.length) continue; // nobody played that month; nothing to close
      const result = await new MonthCloser(this.repository).close({ worldId, monthId: m, nowMs });
      if (result) closed.push(m);
    }
    return { monthId, closed };
  }
}
