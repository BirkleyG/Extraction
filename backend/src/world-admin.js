// Firestore-aware world administration: invite-only membership, month preparation and rollover.
// These run on the trusted server only (HTTP routes guarded by an invite code or an internal token).
import { createHash, timingSafeEqual } from 'node:crypto';
import { LedgerError } from './ledger.js';
import { generateWorld } from './world.js';
import { generateRefineries } from './npc-market.js';
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
  constructor({ canonical = null, canonicalRepository = null, firestore, game, repository, inviteCode = null, maxMembers = 10, seedSecret, players = 10, eventWorker = null }) {
    if (!firestore || !game || !repository) throw new TypeError('firestore, game and repository are required');
    if (typeof seedSecret !== 'string' || seedSecret.length < 16) throw new TypeError('A seedSecret of at least 16 characters is required');
    Object.assign(this, { canonical, canonicalRepository, firestore, game, repository, inviteCode, maxMembers, seedSecret, players, eventWorker });
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

  /** Trusted scheduler entrypoint: no browser is needed, and each owner gets at most one bounded batch. */
  async tick({ worldId, nowMs }) {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail('INVALID_CLOCK');
    const rollover = await this.rollover({ worldId, nowMs });
    if (rollover.skipped) return rollover;
    const monthId = monthOf(nowMs);
    if (this.canonical && this.canonicalRepository) {
      const members = await this.canonicalRepository.listMembers(worldId);
      const settlements = [];
      for (const uid of members) {
        try {
          let result;
          // Hourly work can cover two hours per owner, letting missed ticks recover.
          // Each checkpoint still has the service's 300-step transaction bound.
          for (let batch = 0; batch < 24; batch += 1) {
            result = await this.canonical.state({ worldId, uid, nowMs });
            if (!result.catchingUp) break;
          }
          settlements.push({ ownerId: uid, done: !result.catchingUp });
        } catch (error) { settlements.push({ ownerId: uid, done: false, error: error.code ?? 'SETTLEMENT_FAILED' }); }
      }
      return { ...rollover, settlements, done: settlements.every(row => row.done) };
    }
    const roster = await this.repository.transact((tx) => tx.getDoc(rosterPath(worldId, monthId)),
      { worldId, ownerId: 'system', monthId, readOnly: true });
    const owners = roster?.owners ?? [];
    // The private friends world is capped at ten. Fail closed on corrupt/oversized rosters; never scan owners.
    if (!Array.isArray(owners) || owners.length > 10 || new Set(owners).size !== owners.length ||
        owners.some((owner) => typeof owner !== 'string' || !owner || owner.length > 256)) fail('INVALID_ROSTER');
    const settlements = [];
    for (const ownerId of owners) {
      try {
        const done = await this.game.settleBatch({ worldId, ownerId, monthId, toSec: Math.floor(nowMs / 1000) });
        settlements.push({ ownerId, done });
      } catch (error) {
        // Other owners can still advance. A failed owner remains unfinished and is retried next tick.
        settlements.push({ ownerId, done: false, error: error?.code ?? 'SETTLEMENT_FAILED' });
      }
    }
    // Durable event queue: drain due events for this month, bounded per tick. Never lets one stuck queue stop owner settlement.
    let events = null;
    if (this.eventWorker) {
      try { events = await this.eventWorker.drain({ worldId, monthId }, { nowMs }); } catch (error) { events = { status: 'error', applied: 0, done: false, error: error?.code ?? 'EVENT_WORKER_FAILED' }; }
    }
    return { ...rollover, settlements, ...(events ? { events } : {}), done: settlements.every((s) => s.done) && (events?.done ?? true) };
  }

  /** Prepare the current month (planet, NPC budgets, active month) and close any finished months. Idempotent. */
  async rollover({ worldId, nowMs }) {
    const monthId = monthOf(nowMs);
    const ref = this.#worldRef(worldId);
    const world = await ref.get();
    if (!world.exists) return { skipped: true, reason: 'world not created yet' };
    const seed = sha(`${this.seedSecret}|${worldId}|${monthId}`);
    // The cosmetic seed drives only names, colours and scenery in the browser. It is derived separately so it can be public
    // without revealing the secret world seed (ore deposits, veins).
    const planet = { ...generateWorld({ seed, monthId, players: this.players }), cosmeticSeed: sha(`cosmetic|${worldId}|${monthId}`).slice(0, 24),
      // Server-only: computer-run refineries (>= 3 per planet) and the hidden weather/vein seed. Never projected to browsers.
      refineries: generateRefineries({ seed, monthId, count: 3 }), weatherSeed: sha(`weather|${seed}`) };
    await this.game.storePlanet({ worldId, monthId, planet });
    if (world.data().activeMonthId < monthId) await ref.update({ activeMonthId: monthId });
    const closed = [];
    // Close the previous month if it had any players and is not finished yet.
    for (let m = previousMonth(monthId), i = 0; i < 3; m = previousMonth(m), i += 1) {
      const archived = await this.repository.transact((tx) => tx.getDoc(archivePath(worldId, m)), { worldId, ownerId: 'system', monthId: m, readOnly: true, closing: true });
      if (archived) break;
      const roster = await this.repository.transact((tx) => tx.getDoc(rosterPath(worldId, m)), { worldId, ownerId: 'system', monthId: m, readOnly: true, closing: true });
      if (!roster?.owners?.length) continue; // nobody played that month; nothing to close
      const result = await new MonthCloser(this.repository, { game: this.game }).close({ worldId, monthId: m, nowMs });
      if (result) closed.push(m);
    }
    return { monthId, closed };
  }
}
