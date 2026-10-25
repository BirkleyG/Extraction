import { createHash } from 'node:crypto';
import { LedgerError, ledgerTransactionId } from './ledger.js';

const fail = (code, message = code) => { throw new LedgerError(code, message); };
const commandKeys = new Set(['monthId', 'requestId', 'expectedVersion', 'amount']);
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const ownerAccount = (ownerId, monthId, bucket) => `owner:${encode(ownerId)}:${encode(monthId)}:${bucket}`;

function commandScope(command, context, withAmount = false) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) fail('INVALID_COMMAND');
  for (const key of Object.keys(command)) {
    if (!commandKeys.has(key) || (!withAmount && key === 'amount')) fail('INJECTED_FIELD', `Unexpected command field: ${key}`);
  }
  const actorId = context?.auth?.uid;
  if (typeof actorId !== 'string' || !actorId || actorId.length > 256) fail('UNAUTHENTICATED');
  if (typeof command.monthId !== 'string' || !monthPattern.test(command.monthId)) fail('INVALID_COMMAND', 'monthId must use YYYY-MM format');
  if (command.monthId !== context.activeMonthId) fail('STALE_MONTH');
  if (typeof command.requestId !== 'string' || !command.requestId || command.requestId.length > 160) fail('INVALID_COMMAND', 'requestId is required');
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) fail('INVALID_VERSION');
  if (!Number.isSafeInteger(context.now) || context.now < 0) fail('INVALID_CLOCK');
  const worldId = context.worldId ?? 'default';
  if (typeof worldId !== 'string' || !worldId || worldId.length > 160) fail('INVALID_WORLD');
  return { actorId, worldId, monthId: command.monthId, requestId: command.requestId, expectedVersion: command.expectedVersion, timestamp: context.now };
}

function fingerprint(action, scope, amount) {
  // Version is intentionally excluded so a valid retry with the same request ID
  // returns its original result after later commands advance the wallet version.
  return createHash('sha256').update(JSON.stringify([action, scope.monthId, amount ?? null])).digest('hex');
}

export class LedgerCommandService {
  constructor(repository, { starterGrantAmount }) {
    if (!Number.isSafeInteger(starterGrantAmount) || starterGrantAmount <= 0) throw new TypeError('Trusted starterGrantAmount must be a positive safe whole coin amount');
    this.repository = repository;
    this.starterGrantAmount = starterGrantAmount;
  }

  async grantStarter(command, context) {
    const scope = commandScope(command, context);
    const payloadHash = fingerprint('starter-grant', scope);
    return this.repository.transact(async (tx) => {
      await tx.validateWorld?.(scope.actorId, scope.monthId);
      const prior = await tx.getCommand(scope.actorId, scope.monthId, scope.requestId);
      if (prior) {
        if (prior.payloadHash !== payloadHash) fail('IDEMPOTENCY_CONFLICT');
        return prior.result;
      }
      if (await tx.version(scope.actorId, scope.monthId) !== scope.expectedVersion) fail('STALE_VERSION');
      if (await tx.hasStarterGrant(scope.actorId, scope.monthId)) fail('START_GRANT_ALREADY_CLAIMED');
      const transactionId = ledgerTransactionId('START_GRANT', scope.actorId, scope.monthId, scope.requestId);
      await tx.append({
        id: transactionId, ownerId: scope.actorId, monthId: scope.monthId,
        timestamp: scope.timestamp, type: 'START_GRANT', reference: scope.requestId,
        postings: [
          { account: ownerAccount(scope.actorId, scope.monthId, 'spendable'), delta: this.starterGrantAmount },
          { account: `source:START_GRANT:${encode(transactionId)}`, delta: -this.starterGrantAmount },
        ],
      });
      await tx.markStarterGrant(scope.actorId, scope.monthId);
      const version = await tx.bumpVersion(scope.actorId, scope.monthId);
      const result = await this.#projection(tx, scope.actorId, scope.monthId, version);
      await tx.saveCommand(scope.actorId, scope.monthId, scope.requestId, payloadHash, result);
      return result;
    }, { worldId: scope.worldId, ownerId: scope.actorId, monthId: scope.monthId, requestId: scope.requestId });
  }

  async fundEscrow(command, context) { return this.#escrowCommand('fund', command, context); }
  async releaseEscrow(command, context) { return this.#escrowCommand('release', command, context); }

  async #escrowCommand(action, command, context) {
    const scope = commandScope(command, context, true);
    if (!Number.isSafeInteger(command.amount) || command.amount <= 0) fail('INVALID_AMOUNT');
    const amount = command.amount;
    const payloadHash = fingerprint(`escrow-${action}`, scope, amount);
    return this.repository.transact(async (tx) => {
      await tx.validateWorld?.(scope.actorId, scope.monthId);
      const prior = await tx.getCommand(scope.actorId, scope.monthId, scope.requestId);
      if (prior) {
        if (prior.payloadHash !== payloadHash) fail('IDEMPOTENCY_CONFLICT');
        return prior.result;
      }
      if (await tx.version(scope.actorId, scope.monthId) !== scope.expectedVersion) fail('STALE_VERSION');
      const spendable = ownerAccount(scope.actorId, scope.monthId, 'spendable');
      const escrow = ownerAccount(scope.actorId, scope.monthId, 'escrow');
      const transactionId = ledgerTransactionId(action === 'fund' ? 'ESCROW_FUND' : 'ESCROW_RELEASE', scope.actorId, scope.monthId, scope.requestId);
      await tx.append({
        id: transactionId, ownerId: scope.actorId, monthId: scope.monthId,
        timestamp: scope.timestamp, type: action === 'fund' ? 'ESCROW_FUND' : 'ESCROW_RELEASE', reference: scope.requestId,
        postings: action === 'fund'
          ? [{ account: spendable, delta: -amount }, { account: escrow, delta: amount }]
          : [{ account: escrow, delta: -amount }, { account: spendable, delta: amount }],
      });
      const version = await tx.bumpVersion(scope.actorId, scope.monthId);
      const result = await this.#projection(tx, scope.actorId, scope.monthId, version);
      await tx.saveCommand(scope.actorId, scope.monthId, scope.requestId, payloadHash, result);
      return result;
    }, { worldId: scope.worldId, ownerId: scope.actorId, monthId: scope.monthId, requestId: scope.requestId });
  }

  async wallet(ownerId, monthId, context) {
    if (typeof ownerId !== 'string' || ownerId !== context?.auth?.uid) fail('FORBIDDEN');
    if (monthId !== context.activeMonthId) fail('STALE_MONTH');
    return this.repository.transact(async (tx) => {
      await tx.validateWorld?.(ownerId, monthId);
      return this.#projection(tx, ownerId, monthId, await tx.version(ownerId, monthId));
    }, { worldId: context.worldId ?? 'default', ownerId, monthId, readOnly: true });
  }

  async #projection(tx, ownerId, monthId, version) {
    const spendable = await tx.balance(ownerId, monthId, 'spendable');
    const escrow = await tx.balance(ownerId, monthId, 'escrow');
    const total = spendable + escrow;
    if (!Number.isSafeInteger(total)) fail('OVERFLOW', 'Wallet total exceeds safe integer range');
    return Object.freeze({ ownerId, monthId, spendable, escrow, totalOwned: total, version });
  }
}
