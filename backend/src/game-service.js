// Trusted command handlers for the mine -> NPC buyer loop. Every command runs in ONE repository transaction:
// owner state, NPC buyer budget/capacity, shipment record, ledger postings and the idempotency receipt commit
// together or not at all (sections 02, 05, 18). Clients send intents only; money, time and outcomes are decided here.
import { createHash } from 'node:crypto';
import { LedgerError, ledgerTransactionId } from './ledger.js';
import { UpgradeError, quote } from './upgrades.js';
import { MineError, PURCHASABLE_LINES, addShaft, advanceOwner, applyLevel, chooseBuyer, createOwnerState, departureFor, getPolicy, hire, settleAuto, shipCapacityUnits, shaftLevelLine, surfaceUnits, tripEstimate } from './mine-engine.js';

const fail = (code, message = code) => { throw new LedgerError(code, message); };
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const ownerAccount = (ownerId, monthId, bucket) => `owner:${encode(ownerId)}:${encode(monthId)}:${bucket}`;
export const MAX_DEPARTURES_PER_TX = 150;
export const MAX_COMMAND_CATCHUP_TICKS = 20_000; // explicit one-second ticks per command; steady stretches are extrapolated

const PAYLOAD_KEYS = {
  enroll: [],
  buyUpgrade: ['line', 'shaftNumber', 'mode'],
  hire: ['count'],
  buyShaft: [],
  dispatch: ['destinationId', 'units'],
  setPolicy: ['auto', 'destinationId'],
};
const BASE_KEYS = ['monthId', 'requestId', 'expectedVersion'];
export const monthEndMs = (monthId) => { const [y, m] = monthId.split('-').map(Number); return Date.UTC(y, m, 1); };
export const rosterPath = (worldId, monthId) => `world/${encode(worldId)}/roster/${monthId}`;

export const ownerPath = (worldId, ownerId, monthId) => `world/${encode(worldId)}/owner/${encode(ownerId)}/${monthId}`;
export const planetPath = (worldId, monthId) => `world/${encode(worldId)}/planet/${monthId}`;
const slotsPath = (worldId, monthId) => `world/${encode(worldId)}/slots/${monthId}`;

function scopeOf(kind, command, context) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) fail('INVALID_COMMAND');
  const allowed = new Set([...BASE_KEYS, ...PAYLOAD_KEYS[kind]]);
  for (const key of Object.keys(command)) if (!allowed.has(key)) fail('INJECTED_FIELD', `Unexpected command field: ${key}`);
  const actorId = context?.auth?.uid;
  if (typeof actorId !== 'string' || !actorId || actorId.length > 256) fail('UNAUTHENTICATED');
  if (typeof command.monthId !== 'string' || !monthPattern.test(command.monthId)) fail('INVALID_COMMAND', 'monthId must use YYYY-MM format');
  if (command.monthId !== context.activeMonthId) fail('STALE_MONTH');
  if (typeof command.requestId !== 'string' || !command.requestId || command.requestId.length > 160) fail('INVALID_COMMAND', 'requestId is required');
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) fail('INVALID_VERSION');
  if (!Number.isSafeInteger(context.now) || context.now < 0) fail('INVALID_CLOCK');
  // A command stamped at or after the closing boundary B belongs to the new month and can never use old-month state (T17-06).
  if (context.now >= monthEndMs(command.monthId)) fail('MONTH_CLOSED');
  const worldId = context.worldId ?? 'default';
  const payload = Object.fromEntries(PAYLOAD_KEYS[kind].filter((k) => command[k] !== undefined).map((k) => [k, command[k]]));
  return { kind, actorId, worldId, monthId: command.monthId, requestId: command.requestId, expectedVersion: command.expectedVersion, nowMs: context.now, nowSec: Math.floor(context.now / 1000), payload };
}
const fingerprint = (scope) => createHash('sha256').update(JSON.stringify([scope.kind, scope.monthId, scope.payload])).digest('hex');

export class GameService {
  constructor(repository, { npcBuyers }) {
    if (!Array.isArray(npcBuyers) || npcBuyers.length < 1) throw new TypeError('At least one NPC buyer is required');
    this.repository = repository;
    this.npcBuyers = npcBuyers;
  }

  /** Computer-run buyers have no budget or capacity to track (CEO decision Q-10), so there is nothing to seed. Kept for callers. */
  async seedNpcBuyers() { return undefined; }

  enroll(command, context) { return this.#run('enroll', command, context); }
  buyUpgrade(command, context) { return this.#run('buyUpgrade', command, context); }
  hire(command, context) { return this.#run('hire', command, context); }
  buyShaft(command, context) { return this.#run('buyShaft', command, context); }
  dispatch(command, context) { return this.#run('dispatch', command, context); }
  setPolicy(command, context) { return this.#run('setPolicy', command, context); }

  /** Server/bootstrap: store the generated planet (server-only truth). Idempotent. */
  async storePlanet({ worldId = 'default', monthId, planet }) {
    return this.repository.transact(async (tx) => {
      if (!(await tx.getDoc(planetPath(worldId, monthId)))) await tx.putDoc(planetPath(worldId, monthId), planet);
    }, { worldId, monthId, ownerId: 'system', requestId: `planet-${monthId}` });
  }

  /** Filtered read model for the owner's browser (allowlist projection; advances the mine to now without persisting). */
  async state(ownerId, monthId, context) {
    const { projectOwner } = await import('./projection.js');
    if (ownerId !== context?.auth?.uid) fail('FORBIDDEN');
    if (monthId !== context.activeMonthId) fail('STALE_MONTH');
    const worldId = context.worldId ?? 'default';
    return this.repository.transact(async (tx) => {
      const stored = await tx.getDoc(ownerPath(worldId, ownerId, monthId));
      if (!stored) fail('NOT_ENROLLED');
      // Preview only: automatic takeoffs that have happened by now are computed (not saved) so the player sees current coin.
      const settled = settleAuto(stored, this.npcBuyers, Math.floor(context.now / 1000), { maxDepartures: 1000 });
      const earned = settled.departures.reduce((sum, d) => sum + d.payment, 0);
      const planet = await tx.getDoc(planetPath(worldId, monthId));
      return projectOwner({
        doc: settled.state, cosmeticSeed: planet?.cosmeticSeed ?? `${worldId}|${monthId}`, offers: this.npcBuyers.map((b) => ({ id: b.id, name: b.name, bidPerUnit: b.bidPerUnit, distance: b.distance, unloadUnitsPerMinute: b.unloadUnitsPerMinute })),
        nowMs: context.now, version: await tx.version(ownerId, monthId),
        spendable: (await tx.balance(ownerId, monthId, 'spendable')) + earned, escrow: await tx.balance(ownerId, monthId, 'escrow'),
        autoTakeoffs: settled.departures.length, catchingUp: !settled.done,
      });
    }, { worldId, ownerId, monthId, readOnly: true });
  }

  async ownerView(ownerId, monthId, context) {
    if (ownerId !== context?.auth?.uid) fail('FORBIDDEN');
    return this.repository.transact(async (tx) => {
      const doc = await tx.getDoc(ownerPath(context.worldId ?? 'default', ownerId, monthId));
      if (!doc) fail('NOT_ENROLLED');
      const spendable = await tx.balance(ownerId, monthId, 'spendable');
      const escrow = await tx.balance(ownerId, monthId, 'escrow');
      return { doc, spendable, escrow, version: await tx.version(ownerId, monthId) };
    }, { worldId: context.worldId ?? 'default', ownerId, monthId, readOnly: true });
  }

  async #run(kind, command, context) {
    const scope = scopeOf(kind, command, context);
    const payloadHash = fingerprint(scope);
    if (kind !== 'enroll') {
      // Offline stretches can hold hundreds of automatic takeoffs; settle them in committed batches first.
      try { await this.settleThrough({ worldId: scope.worldId, ownerId: scope.actorId, monthId: scope.monthId, toSec: scope.nowSec }); }
      catch (error) { if (error?.code !== 'NOT_ENROLLED') throw error; }
    }
    return this.repository.transact(async (tx) => {
      await tx.validateWorld?.(scope.actorId, scope.monthId);
      const prior = await tx.getCommand(scope.actorId, scope.monthId, scope.requestId);
      if (prior) {
        if (prior.payloadHash !== payloadHash) fail('IDEMPOTENCY_CONFLICT');
        return prior.result;
      }
      if (await tx.version(scope.actorId, scope.monthId) !== scope.expectedVersion) fail('STALE_VERSION');
      let result;
      try {
        result = await this.#apply(tx, scope, context);
      } catch (error) {
        if (error instanceof MineError || error instanceof UpgradeError) throw new LedgerError(error.code, error.message);
        throw error;
      }
      const version = await tx.bumpVersion(scope.actorId, scope.monthId);
      const out = Object.freeze({ ...result, version });
      await tx.saveCommand(scope.actorId, scope.monthId, scope.requestId, payloadHash, out);
      return out;
    }, { worldId: scope.worldId, ownerId: scope.actorId, monthId: scope.monthId, requestId: scope.requestId });
  }

  /** Server-side start-slot assignment from the generated planet (first free equal-value slot). Null when no planet exists. */
  async #assignStartSite(tx, scope) {
    const planet = await tx.getDoc(planetPath(scope.worldId, scope.monthId));
    if (!planet) return null;
    const slots = (await tx.getDoc(slotsPath(scope.worldId, scope.monthId))) ?? { assigned: {} };
    let slot = slots.assigned[scope.actorId];
    if (slot === undefined) {
      slot = Object.keys(slots.assigned).length;
      if (slot >= planet.startSites.length) fail('WORLD_FULL');
      slots.assigned[scope.actorId] = slot;
      await tx.putDoc(slotsPath(scope.worldId, scope.monthId), slots);
    }
    const start = planet.startSites[slot];
    const site = planet.sites.find((s) => s.id === start.siteId);
    const region = planet.regions.find((r) => r.id === site.regionId);
    return { siteId: site.id, commonOreId: planet.ores[region.commonOreIndex].id, slot };
  }

  /** Bring the owner to `scope.nowSec`, posting a ledger entry for every automatic takeoff at its own second. */
  async #loadOwner(tx, scope, toSec = scope.nowSec) {
    const doc = await tx.getDoc(ownerPath(scope.worldId, scope.actorId, scope.monthId));
    if (!doc) fail('NOT_ENROLLED');
    const settled = settleAuto(doc, this.npcBuyers, toSec, { maxDepartures: MAX_DEPARTURES_PER_TX, maxTicks: MAX_COMMAND_CATCHUP_TICKS });
    for (const d of settled.departures) await this.#postDeparture(tx, scope, d, `auto:${d.number}`, d.atSecond * 1000);
    if (!settled.done) fail('CATCHING_UP', 'Simulation is catching up; retry shortly');
    return settled.state;
  }

  async #postDeparture(tx, scope, shipment, reference, timestamp) {
    const id = ledgerTransactionId('NPC_RAW_PURCHASE', scope.actorId, scope.monthId, reference);
    await tx.append({
      id, ownerId: scope.actorId, monthId: scope.monthId, timestamp, type: 'NPC_RAW_PURCHASE', reference,
      postings: [{ account: ownerAccount(scope.actorId, scope.monthId, 'spendable'), delta: shipment.payment }, { account: `source:NPC_RAW_PURCHASE:${encode(id)}`, delta: -shipment.payment }],
    });
  }

  /**
   * Settle a backlog of automatic takeoffs in committed batches (an offline stretch can hold more takeoffs than one
   * transaction should carry). Used before commands, by the scheduler and by month close. Idempotent.
   */
  async settleThrough({ worldId = 'default', ownerId, monthId, toSec, closing = false }) {
    for (let batch = 0; batch < 200; batch += 1) {
      const done = await this.settleBatch({ worldId, ownerId, monthId, toSec, closing });
      if (done) return;
    }
    fail('CATCHING_UP', 'Backlog too large to settle in one pass');
  }

  /** One durable, bounded worker checkpoint. False means retry on the next scheduler invocation. */
  async settleBatch({ worldId = 'default', ownerId, monthId, toSec, closing = false }) {
    if (!monthPattern.test(monthId) || !Number.isSafeInteger(toSec) || toSec < 0) fail('INVALID_CLOCK');
    return this.repository.transact(async (tx) => {
      const scope = { worldId, actorId: ownerId, monthId };
      const doc = await tx.getDoc(ownerPath(worldId, ownerId, monthId));
      if (!doc) fail('NOT_ENROLLED');
      if (doc.closedAtMs) return true;
      const settled = settleAuto(doc, this.npcBuyers, toSec, { maxDepartures: MAX_DEPARTURES_PER_TX, maxTicks: MAX_COMMAND_CATCHUP_TICKS });
      for (const d of settled.departures) await this.#postDeparture(tx, scope, d, `auto:${d.number}`, d.atSecond * 1000);
      if (settled.departures.length || settled.state.simSecond !== doc.simSecond) await tx.putDoc(ownerPath(worldId, ownerId, monthId), await this.#withPeak(tx, scope, settled.state, settled.departures.at(-1)?.atSecond * 1000 ?? toSec * 1000));
      return settled.done && (settled.departures.length < MAX_DEPARTURES_PER_TX);
    }, { worldId, ownerId, monthId, requestId: `settle-${monthId}`, closing });
  }

  /** Track the highest coin-on-hand total and when it was first reached (tie-break: who reached an amount first). */
  async #withPeak(tx, scope, owner, atMs = scope.nowMs) {
    const total = (await tx.balance(scope.actorId, scope.monthId, 'spendable')) + (await tx.balance(scope.actorId, scope.monthId, 'escrow'));
    if (!owner.peak || total > owner.peak.amount) return { ...owner, peak: { amount: total, firstReachedMs: atMs } };
    return owner;
  }

  async #spend(tx, scope, amount, reference) {
    if (!Number.isSafeInteger(amount) || amount < 1) fail('INVALID_AMOUNT');
    const balance = await tx.balance(scope.actorId, scope.monthId, 'spendable');
    if (balance < amount) fail('INSUFFICIENT_FUNDS');
    const id = ledgerTransactionId('SYSTEM_PURCHASE', scope.actorId, scope.monthId, reference);
    await tx.append({
      id, ownerId: scope.actorId, monthId: scope.monthId, timestamp: scope.nowMs, type: 'SYSTEM_PURCHASE', reference,
      postings: [{ account: ownerAccount(scope.actorId, scope.monthId, 'spendable'), delta: -amount }, { account: `sink:SYSTEM_PURCHASE:${encode(id)}`, delta: amount }],
    });
  }

  async #apply(tx, scope, context) {
    if (scope.kind === 'enroll') {
      const site = (await this.#assignStartSite(tx, scope)) ?? context.startSite;
      if (!site || typeof site.siteId !== 'string' || typeof site.commonOreId !== 'string') fail('NO_START_SITE');
      if (await tx.getDoc(ownerPath(scope.worldId, scope.actorId, scope.monthId))) fail('ALREADY_ENROLLED');
      const doc = createOwnerState({ ownerId: scope.actorId, monthId: scope.monthId, siteId: site.siteId, commonOreId: site.commonOreId, nowSec: scope.nowSec, slot: site.slot ?? 0 });
      await tx.putDoc(ownerPath(scope.worldId, scope.actorId, scope.monthId), doc);
      const roster = (await tx.getDoc(rosterPath(scope.worldId, scope.monthId))) ?? { owners: [] };
      if (!roster.owners.includes(scope.actorId)) roster.owners.push(scope.actorId);
      await tx.putDoc(rosterPath(scope.worldId, scope.monthId), roster);
      return { ok: true, kind: 'enroll' };
    }
    let owner = await this.#loadOwner(tx, scope);
    const path = ownerPath(scope.worldId, scope.actorId, scope.monthId);
    let spent = 0;
    let extra = {};
    const p = scope.payload;
    if (scope.kind === 'buyUpgrade') {
      if (!PURCHASABLE_LINES.includes(p.line)) fail('UNKNOWN_UPGRADE');
      const shaftNumber = p.shaftNumber ?? 1;
      if (!Number.isSafeInteger(shaftNumber)) fail('INVALID_SHAFT');
      const level = shaftLevelLine(owner, p.line, shaftNumber);
      const funds = await tx.balance(scope.actorId, scope.monthId, 'spendable');
      const q = quote(p.line, level, p.mode ?? 1, funds); // throws UpgradeError (code preserved below)
      owner = applyLevel(owner, p.line, shaftNumber, q.newLevel);
      spent = q.total;
      extra = { line: p.line, shaftNumber, newLevel: q.newLevel, count: q.count };
    } else if (scope.kind === 'hire') {
      const r = hire(owner, p.count);
      owner = r.state; spent = r.cost; extra = { workersHired: owner.workersHired };
    } else if (scope.kind === 'buyShaft') {
      const r = addShaft(owner);
      owner = r.state; spent = r.cost; extra = { shaftCount: owner.production.shafts.length };
    } else if (scope.kind === 'dispatch') {
      return this.#dispatch(tx, scope, owner, path);
    } else if (scope.kind === 'setPolicy') {
      if (p.auto !== undefined && typeof p.auto !== 'boolean') fail('INVALID_COMMAND', 'auto must be true or false');
      if (p.destinationId !== undefined && p.destinationId !== null && !this.npcBuyers.some((b) => b.id === p.destinationId)) fail('UNKNOWN_DESTINATION');
      const prior = getPolicy(owner);
      owner = { ...owner, policy: { auto: p.auto ?? prior.auto, destinationId: p.destinationId === undefined ? prior.destinationId : p.destinationId } };
      await tx.putDoc(path, owner);
      return { ok: true, kind: 'setPolicy', policy: owner.policy };
    }
    await this.#spend(tx, scope, spent, scope.requestId);
    await tx.putDoc(path, await this.#withPeak(tx, scope, owner));
    return { ok: true, kind: scope.kind, spent, ...extra };
  }

  /** "Launch now": the same paid departure the automatic takeoff makes, forced with whatever whole units are on the yard. */
  async #dispatch(tx, scope, owner, path) {
    const p = scope.payload;
    if (p.units !== undefined && (!Number.isSafeInteger(p.units) || p.units < 1)) fail('INVALID_UNITS');
    if (owner.ship.readyAtSecond > scope.nowSec) fail('SHIP_BUSY');
    const capacity = shipCapacityUnits(owner.levels.shipCapacity);
    const stock = Math.floor(surfaceUnits(owner, owner.production.shafts[0].oreId) + 1e-6);
    if (stock < 1) fail('NO_CARGO');
    if (p.units !== undefined && p.units > stock) fail('INSUFFICIENT_STOCK');
    if (p.units !== undefined && p.units > capacity) fail('EXCEEDS_SHIP_CAPACITY');
    const units = p.units ?? Math.min(capacity, stock);
    let buyer;
    if (p.destinationId !== undefined) {
      if (typeof p.destinationId !== 'string') fail('UNKNOWN_DESTINATION');
      buyer = this.npcBuyers.find((b) => b.id === p.destinationId);
      if (!buyer) fail('UNKNOWN_DESTINATION');
    } else buyer = chooseBuyer(owner, this.npcBuyers, units);
    const dep = departureFor(owner, buyer, units, scope.nowSec);
    await this.#postDeparture(tx, scope, dep.shipment, scope.requestId, scope.nowMs);
    dep.shipment.requestId = scope.requestId;
    await tx.putDoc(path, await this.#withPeak(tx, scope, dep.state));
    return { ok: true, kind: 'dispatch', shipment: dep.shipment, plan: dep.plan };
  }
}
export { MineError };
