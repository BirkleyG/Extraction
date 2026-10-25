// Firestore transaction adapter for GameService. Same transaction interface as MemoryLedgerRepository:
// wallet accounts, version, receipts and ledger for one owner/month, plus generic JSON documents
// (owner mine state, NPC buyers) that may belong to other owners. All writes are buffered and committed
// after every read, so one command is one atomic Firestore transaction.
import { createHash } from 'node:crypto';
import { applyLedgerTransaction, LedgerError } from './ledger.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw new LedgerError(code); };
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const account = (uid, monthId, bucket) => `owner:${enc(uid)}:${enc(monthId)}:${bucket}`;
const balanceOf = (snap) => (snap.exists ? snap.data().balance : 0);
const monthOf = (ms) => `${new Date(ms).getUTCFullYear()}-${String(new Date(ms).getUTCMonth() + 1).padStart(2, '0')}`;

export class FirestoreGameRepository {
  constructor(firestore, { transactionMaxAttempts = 8, clock = Date.now } = {}) {
    if (!firestore?.runTransaction || !firestore?.collection) throw new TypeError('A Firebase Admin Firestore instance is required');
    this.firestore = firestore;
    this.transactionMaxAttempts = transactionMaxAttempts;
    this.clock = clock;
  }

  async transact(work, scope = {}) {
    const { worldId, ownerId, monthId, requestId, readOnly = false, closing = false } = scope;
    if (![worldId, ownerId, monthId].every((v) => typeof v === 'string' && v.length > 0)) fail('INVALID_SCOPE');
    const system = ownerId === 'system';
    const worldRef = this.firestore.collection('worlds').doc(digest(worldId));
    const memberRef = worldRef.collection('owners').doc(digest(ownerId));
    const monthRef = memberRef.collection('months').doc(monthId);
    const stateRef = monthRef.collection('state').doc('wallet');
    const refFor = (bucket) => monthRef.collection('accounts').doc(digest(account(ownerId, monthId, bucket)));
    const commandRef = requestId ? monthRef.collection('commands').doc(digest(requestId)) : null;
    const docRef = (path) => worldRef.collection('docs').doc(digest(path));

    return this.firestore.runTransaction(async (dbtx) => {
      const [worldSnap, memberSnap, stateSnap, spendSnap, escrowSnap] = await Promise.all([
        dbtx.get(worldRef), dbtx.get(memberRef), dbtx.get(stateRef), dbtx.get(refFor('spendable')), dbtx.get(refFor('escrow')),
      ]);
      const world = worldSnap.exists ? worldSnap.data() : null;
      if (!world || world.worldId !== worldId) fail('WORLD_NOT_FOUND');
      if (world.status !== 'active') fail('WORLD_CLOSED');
      if (world.activeMonthId !== monthId) fail('STALE_MONTH');
      if (!system && (!memberSnap.exists || memberSnap.data().uid !== ownerId || memberSnap.data().status !== 'active')) fail('FORBIDDEN');
      const now = this.clock();
      // Closing a finished month runs after its boundary, so only the closer may bypass the wall-clock month check.
      if (!Number.isSafeInteger(now) || now < 0 || (!closing && monthOf(now) !== monthId)) fail('STALE_MONTH');

      const spendable = balanceOf(spendSnap);
      const escrow = balanceOf(escrowSnap);
      const version = stateSnap.exists ? stateSnap.data().version : 0;
      if (![spendable, escrow, version].every((n) => Number.isSafeInteger(n) && n >= 0) || !Number.isSafeInteger(spendable + escrow)) fail('CORRUPT_STATE');

      let receipt = null;
      if (commandRef) {
        const snap = await dbtx.get(commandRef);
        if (snap.exists) {
          const raw = snap.data();
          if (!/^[a-f0-9]{64}$/.test(raw.payloadHash) || typeof raw.resultJson !== 'string') fail('CORRUPT_STATE');
          receipt = { payloadHash: raw.payloadHash, result: JSON.parse(raw.resultJson) };
        }
      }

      const staged = { ledger: [], accounts: new Map([[account(ownerId, monthId, 'spendable'), spendable], [account(ownerId, monthId, 'escrow'), escrow]]), commands: new Map(), starterGrants: new Set(), versions: new Map() };
      let nextVersion = version;
      let ledgerToWrite = null;
      let receiptToWrite = null;
      const docWrites = new Map();
      const docCache = new Map();
      const assertScope = (uid, month) => { if (uid !== ownerId || month !== monthId) fail('INVALID_SCOPE'); };

      const tx = {
        validateWorld: () => {},
        balance: (uid, month, bucket = 'spendable') => { assertScope(uid, month); return staged.accounts.get(account(uid, month, bucket)) ?? 0; },
        version: (uid, month) => { assertScope(uid, month); return nextVersion; },
        getCommand: (uid, month, id) => { assertScope(uid, month); if (id !== requestId) fail('INVALID_SCOPE'); return receipt ?? undefined; },
        hasStarterGrant: () => false,
        markStarterGrant: () => {},
        async append(entry) {
          if (ledgerToWrite) fail('INVALID_LEDGER');
          if (entry.ownerId !== ownerId || entry.monthId !== monthId || entry.reference !== requestId) fail('INVALID_SCOPE');
          const ledgerRef = monthRef.collection('ledger').doc(digest(entry.id));
          if ((await dbtx.get(ledgerRef)).exists) fail('DUPLICATE_LEDGER_ID');
          applyLedgerTransaction(staged, Object.freeze({ ...entry, postings: Object.freeze(entry.postings.map((p) => Object.freeze({ ...p }))) }));
          ledgerToWrite = { ref: ledgerRef, entry: staged.ledger[0] };
        },
        bumpVersion: (uid, month) => { assertScope(uid, month); nextVersion += 1; if (!Number.isSafeInteger(nextVersion)) fail('OVERFLOW'); return nextVersion; },
        saveCommand: (uid, month, id, payloadHash, result) => { assertScope(uid, month); if (id !== requestId) fail('INVALID_SCOPE'); receiptToWrite = { payloadHash, resultJson: JSON.stringify(result) }; },
        async getDoc(path) {
          if (docWrites.has(path)) return JSON.parse(docWrites.get(path));
          if (!docCache.has(path)) { const snap = await dbtx.get(docRef(path)); docCache.set(path, snap.exists ? snap.data().json : null); }
          const json = docCache.get(path);
          return json === null ? null : JSON.parse(json);
        },
        putDoc(path, value) { if (readOnly) fail('READ_ONLY'); docWrites.set(path, JSON.stringify(value)); },
      };

      const value = await work(tx);
      if (readOnly) return value;
      // Buffered writes happen only after every read above has completed.
      if (ledgerToWrite) {
        dbtx.create(ledgerToWrite.ref, ledgerToWrite.entry);
        for (const bucket of ['spendable', 'escrow']) dbtx.set(refFor(bucket), { balance: staged.accounts.get(account(ownerId, monthId, bucket)) ?? 0 });
      }
      if (nextVersion !== version) dbtx.set(stateRef, { version: nextVersion });
      if (receiptToWrite && commandRef) dbtx.create(commandRef, receiptToWrite);
      for (const [path, json] of docWrites) dbtx.set(docRef(path), { path, json });
      return value;
    }, { maxAttempts: this.transactionMaxAttempts });
  }
}
