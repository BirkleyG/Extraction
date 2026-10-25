// Trusted command handlers for the mine -> NPC buyer loop. Every command runs in ONE repository transaction:
// owner state, NPC buyer budget/capacity, shipment record, ledger postings and the idempotency receipt commit
// together or not at all (sections 02, 05, 18). Clients send intents only; money, time and outcomes are decided here.
import { createHash } from 'node:crypto';
import { LedgerError, ledgerTransactionId } from './ledger.js';
import { UpgradeError, quote } from './upgrades.js';
import { MineError, PURCHASABLE_LINES, addShaft, advanceOwner, applyLevel, createOwnerState, hire, shipCapacityUnits, shaftLevelLine, surfaceUnits, tripEstimate, withdrawSurfaceUnits } from './mine-engine.js';

const fail = (code, message = code) => { throw new LedgerError(code, message); };
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const ownerAccount = (ownerId, monthId, bucket) => `owner:${encode(ownerId)}:${encode(monthId)}:${bucket}`;
export const MAX_COMMAND_CATCHUP_TICKS = 20_000; // explicit one-second ticks per command; steady stretches are extrapolated

const PAYLOAD_KEYS = {
  enroll: [],
  buyUpgrade: ['line', 'shaftNumber', 'mode'],
  hire: ['count'],
  buyShaft: [],
  dispatch: ['destinationId', 'units'],
};
const BASE_KEYS = ['monthId', 'requestId', 'expectedVersion'];
export const monthEndMs = (monthId) => { const [y, m] = monthId.split('-').map(Number); return Date.UTC(y, m, 1); };
export const rosterPath = (worldId, monthId) => `world/${encode(worldId)}/roster/${monthId}`;

export const ownerPath = (worldId, ownerId, monthId) => `world/${encode(worldId)}/owner/${encode(ownerId)}/${monthId}`;
export const planetPath = (worldId, monthId) => `world/${encode(worldId)}/planet/${monthId}`;
const slotsPath = (worldId, monthId) => `world/${encode(worldId)}/slots/${monthId}`;
const npcPath = (worldId, monthId, id) => `world/${encode(worldId)}/npc/${monthId}/${encode(id)}`;

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

/** Token bucket: path-independent, so lazy refill at touch time equals continuous refill. */
function refill(bucket, nowSec) {
  const dt = Math.max(0, nowSec - bucket.updatedAtSecond);
  const next = { ...bucket, updatedAtSecond: Math.max(bucket.updatedAtSecond, nowSec) };
  next.funds = Math.min(bucket.fundsCap, bucket.funds + Math.floor(dt * bucket.fundsRefillPerSecond));
  next.freeCapacityUnits = Math.min(bucket.capacityCap, bucket.freeCapacityUnits + Math.floor(dt * bucket.capacityRefillPerSecond));
  return next;
}

export class GameService {
  constructor(repository, { npcBuyers }) {
    if (!Array.isArray(npcBuyers) || npcBuyers.length < 1) throw new TypeError('At least one NPC buyer is required');
    this.repository = repository;
    this.npcBuyers = npcBuyers;
  }

  /** Server/bootstrap: seed NPC buyer budget docs for a month. Idempotent. */
  async seedNpcBuyers({ worldId = 'default', monthId, nowSec }) {
    return this.repository.transact(async (tx) => {
      for (const b of this.npcBuyers) {
        const path = npcPath(worldId, monthId, b.id);
        if (await tx.getDoc(path)) continue;
        await tx.putDoc(path, { ...b, funds: b.fundsCap, freeCapacityUnits: b.capacityCap, updatedAtSecond: nowSec });
      }
    }, { worldId, monthId, ownerId: 'system', requestId: `seed-npc-${monthId}` });
  }

  enroll(command, context) { return this.#run('enroll', command, context); }
  buyUpgrade(command, context) { return this.#run('buyUpgrade', command, context); }
  hire(command, context) { return this.#run('hire', command, context); }
  buyShaft(command, context) { return this.#run('buyShaft', command, context); }
  dispatch(command, context) { return this.#run('dispatch', command, context); }

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
      const advanced = advanceOwner(stored, Math.floor(context.now / 1000), MAX_COMMAND_CATCHUP_TICKS);
      const offers = [];
      for (const b of this.npcBuyers) {
        const doc = await tx.getDoc(npcPath(worldId, monthId, b.id));
        if (doc) offers.push({ id: b.id, name: b.name, bidPerUnit: b.bidPerUnit, distance: b.distance, unloadUnitsPerMinute: b.unloadUnitsPerMinute });
      }
      return projectOwner({
        doc: advanced.state, offers, nowMs: context.now, version: await tx.version(ownerId, monthId),
        spendable: await tx.balance(ownerId, monthId, 'spendable'), escrow: await tx.balance(ownerId, monthId, 'escrow'),
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
    return { siteId: site.id, commonOreId: planet.ores[region.commonOreIndex].id };
  }

  async #loadOwner(tx, scope) {
    const doc = await tx.getDoc(ownerPath(scope.worldId, scope.actorId, scope.monthId));
    if (!doc) fail('NOT_ENROLLED');
    const advanced = advanceOwner(doc, scope.nowSec, MAX_COMMAND_CATCHUP_TICKS);
    if (advanced.remainingSeconds > 0) fail('CATCHING_UP', 'Simulation is catching up; retry shortly');
    return advanced.state;
  }

  /** Track the highest coin-on-hand total and when it was first reached (tie-break: who reached an amount first). */
  async #withPeak(tx, scope, owner) {
    const total = (await tx.balance(scope.actorId, scope.monthId, 'spendable')) + (await tx.balance(scope.actorId, scope.monthId, 'escrow'));
    if (!owner.peak || total > owner.peak.amount) return { ...owner, peak: { amount: total, firstReachedMs: scope.nowMs } };
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
      const doc = createOwnerState({ ownerId: scope.actorId, monthId: scope.monthId, siteId: site.siteId, commonOreId: site.commonOreId, nowSec: scope.nowSec });
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
    }
    await this.#spend(tx, scope, spent, scope.requestId);
    await tx.putDoc(path, await this.#withPeak(tx, scope, owner));
    return { ok: true, kind: scope.kind, spent, ...extra };
  }

  /** The atomic paid departure (section 02): validate -> reserve funds/capacity/quantity -> pay seller -> remove stock -> create shipment. */
  async #dispatch(tx, scope, owner, path) {
    const p = scope.payload;
    if (typeof p.destinationId !== 'string') fail('UNKNOWN_DESTINATION');
    if (p.units !== undefined && (!Number.isSafeInteger(p.units) || p.units < 1)) fail('INVALID_UNITS');
    const buyerPath = npcPath(scope.worldId, scope.monthId, p.destinationId);
    const stored = await tx.getDoc(buyerPath);
    if (!stored) fail('UNKNOWN_DESTINATION');
    if (owner.ship.readyAtSecond > scope.nowSec) fail('SHIP_BUSY');
    const buyer = refill(stored, scope.nowSec);
    const oreId = owner.production.shafts[0].oreId; // common-ore band only until depth bands land
    const capacity = shipCapacityUnits(owner.levels.shipCapacity);
    const stock = Math.floor(surfaceUnits(owner, oreId));
    const price = buyer.bidPerUnit;
    const sellable = Math.min(capacity, stock, buyer.freeCapacityUnits, Math.floor(buyer.funds / price));
    const units = p.units === undefined ? sellable : p.units;
    if (units < 1) fail(stock < 1 ? 'NO_CARGO' : buyer.freeCapacityUnits < 1 ? 'BUYER_FULL' : 'BUYER_OUT_OF_FUNDS');
    if (p.units !== undefined && units > sellable) fail(units > stock ? 'INSUFFICIENT_STOCK' : units > capacity ? 'EXCEEDS_SHIP_CAPACITY' : units > buyer.freeCapacityUnits ? 'BUYER_FULL' : 'BUYER_OUT_OF_FUNDS');
    const payment = price * units;
    if (!Number.isSafeInteger(payment)) fail('OVERFLOW');

    const plan = tripEstimate(owner, buyer, units);
    const next = JSON.parse(JSON.stringify(owner));
    next.production = withdrawSurfaceUnits(owner.production, oreId, units);
    next.shipmentCounter += 1;
    const shipmentId = `shp:${encode(scope.actorId)}:${scope.monthId}:${next.shipmentCounter}`;
    const shipment = {
      id: shipmentId, requestId: scope.requestId, oreId, units, unitPrice: price, payment, destinationId: buyer.id,
      departureSecond: scope.nowSec, arrivalSecond: scope.nowSec + plan.arrivalOffsetSeconds, tripSeconds: plan.tripSeconds, state: 'PAID_AT_DEPARTURE',
    };
    next.shipments.push(shipment);
    if (next.shipments.length > 100) next.shipments.splice(0, next.shipments.length - 100);
    next.ship.readyAtSecond = scope.nowSec + plan.busySeconds;
    next.totalExternalEarnings += payment;
    if (!Number.isSafeInteger(next.totalExternalEarnings)) fail('OVERFLOW');

    const id = ledgerTransactionId('NPC_RAW_PURCHASE', scope.actorId, scope.monthId, scope.requestId);
    await tx.append({
      id, ownerId: scope.actorId, monthId: scope.monthId, timestamp: scope.nowMs, type: 'NPC_RAW_PURCHASE', reference: scope.requestId,
      postings: [{ account: ownerAccount(scope.actorId, scope.monthId, 'spendable'), delta: payment }, { account: `source:NPC_RAW_PURCHASE:${encode(id)}`, delta: -payment }],
    });
    buyer.funds -= payment;
    buyer.freeCapacityUnits -= units;
    await tx.putDoc(buyerPath, buyer);
    await tx.putDoc(path, await this.#withPeak(tx, scope, next));
    return { ok: true, kind: 'dispatch', shipment, plan };
  }
}
export { MineError };
