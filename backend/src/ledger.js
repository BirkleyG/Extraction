import { createHash } from 'node:crypto';

export class LedgerError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new LedgerError(code, message); };
const safe = (n, label = 'amount') => {
  if (!Number.isSafeInteger(n)) fail('INVALID_AMOUNT', `${label} must be a safe whole coin amount`);
  return n;
};

function addSafe(a, b, label) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) fail('OVERFLOW', `${label} exceeds safe integer range`);
  return result;
}

function cloneState(state) {
  return {
    ledger: [...state.ledger],
    accounts: new Map(state.accounts),
    commands: new Map(state.commands),
    starterGrants: new Set(state.starterGrants),
    versions: new Map(state.versions),
    docs: new Map(state.docs ?? []),
  };
}

function encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function key(ownerId, monthId) { return `${encode(ownerId)}.${encode(monthId)}`; }
function ownerAccount(ownerId, monthId, bucket) { return `owner:${encode(ownerId)}:${encode(monthId)}:${bucket}`; }

export function ledgerTransactionId(type, ownerId, monthId, reference) {
  const digest = createHash('sha256').update(JSON.stringify([type, ownerId, monthId, reference])).digest('base64url');
  if (type === 'START_GRANT') return `grant:${digest}`;
  if (type === 'ESCROW_FUND') return `escrow:fund:${digest}`;
  if (type === 'ESCROW_RELEASE') return `escrow:release:${digest}`;
  if (type === 'SYSTEM_PURCHASE') return `purchase:${digest}`;
  if (type === 'NPC_RAW_PURCHASE') return `npcraw:${digest}`;
  fail('INVALID_LEDGER', 'Unknown transaction reason');
}

function validateId(value, name, maxLength = 160) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) fail('INVALID_COMMAND', `${name} is required`);
  return value;
}

function validatePosting(account, delta) {
  if (typeof account !== 'string' || account.length === 0) fail('INVALID_LEDGER', 'Posting account is required');
  safe(delta, 'posting');
  if (delta === 0) fail('INVALID_LEDGER', 'Zero postings are not allowed');
}

function validateBalanced(postings) {
  let total = 0;
  for (const posting of postings) {
    if (!posting || typeof posting !== 'object' || Array.isArray(posting) || Object.keys(posting).some((key) => !['account', 'delta'].includes(key))) fail('INVALID_LEDGER', 'Malformed posting');
    const { account, delta } = posting;
    validatePosting(account, delta);
    total = addSafe(total, delta, 'posting total');
  }
  if (total !== 0) fail('UNBALANCED', 'Ledger transaction postings must sum to zero');
}

function applyTransaction(state, transaction) {
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction) || Object.keys(transaction).some((key) => !['id', 'ownerId', 'monthId', 'timestamp', 'type', 'reference', 'postings'].includes(key))) fail('INVALID_LEDGER', 'Malformed ledger entry');
  const { id, ownerId, monthId, timestamp, type, reference, postings } = transaction;
  validateId(id, 'ledger id');
  validateId(ownerId, 'owner id', 256);
  validateId(monthId, 'month id');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId)) fail('INVALID_LEDGER', 'Month ID must use YYYY-MM format');
  safe(timestamp, 'timestamp');
  if (timestamp < 0) fail('INVALID_LEDGER', 'Timestamp cannot be negative');
  validateId(reference, 'reference');
  if (!Array.isArray(postings)) fail('INVALID_LEDGER', 'Postings must be an array');
  const encodedId = encode(id);
  const expectedId = ledgerTransactionId(type, ownerId, monthId, reference);
  if (id !== expectedId) fail('INVALID_LEDGER', 'Transaction ID does not match its immutable command scope');
  const spendable = ownerAccount(ownerId, monthId, 'spendable');
  const escrow = ownerAccount(ownerId, monthId, 'escrow');
  const external = `source:${type}:${encodedId}`;
  if (type === 'START_GRANT') {
    if (postings.length !== 2 || postings[0]?.account !== spendable || postings[1]?.account !== external || postings[0]?.delta <= 0 || postings[1]?.delta !== -postings[0]?.delta) fail('INVALID_LEDGER', 'Invalid starter grant postings');
  } else if (type === 'SYSTEM_PURCHASE') {
    // Sink: owner spendable coin leaves the economy (section 02 SYSTEM_PURCHASE).
    const sink = `sink:${type}:${encodedId}`;
    if (postings.length !== 2 || postings[0]?.account !== spendable || postings[1]?.account !== sink || postings[0]?.delta >= 0 || postings[1]?.delta !== -postings[0]?.delta) fail('INVALID_LEDGER', 'Invalid system purchase postings');
  } else if (type === 'NPC_RAW_PURCHASE') {
    // Source: a computer-run buyer pays the owner at departure from an explicit external account.
    if (postings.length !== 2 || postings[0]?.account !== spendable || postings[1]?.account !== external || postings[0]?.delta <= 0 || postings[1]?.delta !== -postings[0]?.delta) fail('INVALID_LEDGER', 'Invalid NPC purchase postings');
  } else {
    const expected = type === 'ESCROW_FUND' ? [spendable, escrow] : [escrow, spendable];
    if (postings.length !== 2 || postings[0]?.account !== expected[0] || postings[1]?.account !== expected[1] || postings[0]?.delta >= 0 || postings[1]?.delta !== -postings[0]?.delta) fail('INVALID_LEDGER', 'Invalid escrow transfer postings');
  }
  if (state.ledger.some((entry) => entry.id === id)) fail('DUPLICATE_LEDGER_ID');
  const scope = key(ownerId, monthId);
  if (type === 'START_GRANT' && state.starterGrants.has(scope)) fail('START_GRANT_ALREADY_CLAIMED');
  validateBalanced(postings);
  const nextAccounts = new Map(state.accounts);
  for (const { account, delta } of postings) {
    const next = addSafe(nextAccounts.get(account) ?? 0, delta, `account ${account}`);
    if (account.startsWith('owner:') && next < 0) fail('INSUFFICIENT_FUNDS');
    nextAccounts.set(account, next);
  }
  // Aggregate only one owner's month-scoped wallet; combining unrelated owners or
  // months would impose an artificial world-wide coin ceiling.
  let ownedTotal = 0;
  const walletPrefix = `owner:${encode(ownerId)}:${encode(monthId)}:`;
  for (const [account, balance] of nextAccounts) {
    if (account.startsWith(walletPrefix)) {
      if (balance < 0) fail('NEGATIVE_OWNED_BALANCE');
      ownedTotal = addSafe(ownedTotal, balance, 'owned balance total');
    }
  }
  state.accounts = nextAccounts;
  if (type === 'START_GRANT') state.starterGrants.add(scope);
  state.ledger.push(Object.freeze({
    id, ownerId, monthId, timestamp, type, reference,
    postings: Object.freeze(postings.map((p) => Object.freeze({ ...p }))),
  }));
}

// Shared validation and balance application for repositories that stage one
// command locally inside a database transaction. Callers must supply the
// relevant wallet balances and ensure duplicate IDs are checked durably.
export function applyLedgerTransaction(state, transaction) {
  applyTransaction(state, transaction);
}

export function replayLedger(entries) {
  if (!Array.isArray(entries)) fail('INVALID_LEDGER', 'Ledger must be an array');
  const state = { ledger: [], accounts: new Map(), commands: new Map(), starterGrants: new Set(), versions: new Map() };
  const ids = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') fail('INVALID_LEDGER', 'Malformed ledger entry');
    validateId(entry.id, 'ledger id');
    if (ids.has(entry.id)) {
      if (JSON.stringify(ids.get(entry.id)) !== JSON.stringify(entry)) fail('IDEMPOTENCY_CONFLICT', 'A repeated ledger ID has different contents');
      continue;
    }
    ids.set(entry.id, entry);
    applyTransaction(state, entry);
  }
  return Object.freeze({ balances: new Map(state.accounts), ledger: Object.freeze([...state.ledger]) });
}

export class MemoryLedgerRepository {
  #state = { ledger: [], accounts: new Map(), commands: new Map(), starterGrants: new Set(), versions: new Map(), docs: new Map() };
  #tail = Promise.resolve();

  // Deliberately process-local: this is not production persistence or cross-process locking.
  transact(work) {
    const result = this.#tail.then(async () => {
      const draft = cloneState(this.#state);
      const tx = {
        balance(ownerId, monthId, bucket = 'spendable') { return draft.accounts.get(ownerAccount(ownerId, monthId, bucket)) ?? 0; },
        version(ownerId, monthId) { return draft.versions.get(key(ownerId, monthId)) ?? 0; },
        getCommand(actorId, monthId, requestId) { return draft.commands.get(`${key(actorId, monthId)}\u0000${requestId}`); },
        hasStarterGrant(ownerId, monthId) { return draft.starterGrants.has(key(ownerId, monthId)); },
        append(transaction) { applyTransaction(draft, transaction); },
        saveCommand(actorId, monthId, requestId, payloadHash, resultValue) {
          draft.commands.set(`${key(actorId, monthId)}\u0000${requestId}`, Object.freeze({ payloadHash, result: resultValue }));
        },
        markStarterGrant(ownerId, monthId) { draft.starterGrants.add(key(ownerId, monthId)); },
        bumpVersion(ownerId, monthId) {
          const scope = key(ownerId, monthId);
          const next = addSafe(draft.versions.get(scope) ?? 0, 1, 'state version');
          draft.versions.set(scope, next);
          return next;
        },
        snapshot() { return Object.freeze({ ledger: Object.freeze([...draft.ledger]), balances: new Map(draft.accounts) }); },
        // Generic JSON documents (owner mine state, NPC buyers) committed atomically with ledger postings.
        getDoc(path) { const value = draft.docs.get(path); return value === undefined ? null : JSON.parse(value); },
        putDoc(path, value) { draft.docs.set(path, JSON.stringify(value)); },
      };
      const value = await work(tx);
      // Keep the committed copy isolated from a transaction handle retained by its callback.
      this.#state = cloneState(draft);
      return value;
    });
    this.#tail = result.catch(() => {});
    return result;
  }

  snapshot() {
    return Object.freeze({ ledger: Object.freeze([...this.#state.ledger]), balances: new Map(this.#state.accounts) });
  }

  reconcile() {
    const rebuilt = replayLedger(this.#state.ledger);
    if (rebuilt.balances.size !== this.#state.accounts.size) fail('CACHE_MISMATCH');
    for (const [account, amount] of rebuilt.balances) if (this.#state.accounts.get(account) !== amount) fail('CACHE_MISMATCH');
    return true;
  }
}
