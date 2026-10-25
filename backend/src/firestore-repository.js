import { createHash } from 'node:crypto';
import { applyLedgerTransaction, LedgerError } from './ledger.js';
import { ledgerTransactionId } from './ledger.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw new LedgerError(code); };
const account = (uid, monthId, bucket) => `owner:${Buffer.from(JSON.stringify(uid)).toString('base64url')}:${Buffer.from(JSON.stringify(monthId)).toString('base64url')}:${bucket}`;
const amountOf = (snap) => snap.exists ? snap.data().balance : 0;

/** Firestore-backed wallet repository. Collection paths use only hashed IDs. */
export class FirestoreLedgerRepository {
  constructor(firestore, { transactionMaxAttempts = 8, clock = Date.now } = {}) {
    if (!firestore?.runTransaction || !firestore?.collection) throw new TypeError('A Firebase Admin Firestore instance is required');
    this.firestore = firestore;
    this.transactionMaxAttempts = transactionMaxAttempts;
    this.clock = clock;
  }

  async transact(work, scope = {}) {
    const { worldId, ownerId, monthId, requestId } = scope;
    if (![worldId, ownerId, monthId].every((value) => typeof value === 'string' && value.length > 0)) fail('INVALID_SCOPE');
    const worldRef = this.firestore.collection('worlds').doc(digest(worldId));
    const uidKey = digest(ownerId);
    const ownerRef = worldRef.collection('owners').doc(uidKey);
    const monthRef = ownerRef.collection('months').doc(monthId);
    const stateRef = monthRef.collection('state').doc('wallet');
    const spendableRef = monthRef.collection('accounts').doc(digest(account(ownerId, monthId, 'spendable')));
    const escrowRef = monthRef.collection('accounts').doc(digest(account(ownerId, monthId, 'escrow')));
    const commandRef = requestId ? monthRef.collection('commands').doc(digest(requestId)) : null;
    const grantRef = monthRef.collection('markers').doc('starter-grant');
    const ledgerRefs = requestId ? ['START_GRANT', 'ESCROW_FUND', 'ESCROW_RELEASE'].map((type) =>
      monthRef.collection('ledger').doc(digest(ledgerTransactionId(type, ownerId, monthId, requestId)))) : [];

    return this.firestore.runTransaction(async (dbtx) => {
      // Firestore requires every read to precede the first write. Read only this
      // owner/month's fixed set of records; the ledger itself is never scanned.
      const refs = [worldRef, ownerRef, stateRef, spendableRef, escrowRef, grantRef];
      if (commandRef) refs.push(commandRef);
      refs.push(...ledgerRefs);
      const snaps = await Promise.all(refs.map((ref) => dbtx.get(ref)));
      const [worldSnap, memberSnap, stateSnap, spendableSnap, escrowSnap, grantSnap] = snaps;
      const commandSnap = commandRef ? snaps[6] : null;
      const ledgerSnaps = commandRef ? snaps.slice(7) : [];
      const world = worldSnap.exists ? worldSnap.data() : null;
      const member = memberSnap.exists ? memberSnap.data() : null;
      if (!world || world.worldId !== worldId) fail('WORLD_NOT_FOUND');
      if (world.status !== 'active') fail('WORLD_CLOSED');
      if (world.activeMonthId !== monthId) fail('STALE_MONTH');
      if (!member || member.uid !== ownerId || member.status !== 'active') fail('FORBIDDEN');
      const now = this.clock();
      if (!Number.isSafeInteger(now) || now < 0) fail('INVALID_CLOCK');
      const currentMonthId = `${new Date(now).getUTCFullYear()}-${String(new Date(now).getUTCMonth() + 1).padStart(2, '0')}`;
      if (currentMonthId !== monthId) fail('STALE_MONTH');

      const spendableBalance = amountOf(spendableSnap);
      const escrowBalance = amountOf(escrowSnap);
      const version = stateSnap.exists ? stateSnap.data().version : 0;
      if (!Number.isSafeInteger(spendableBalance) || spendableBalance < 0 || !Number.isSafeInteger(escrowBalance) || escrowBalance < 0 || !Number.isSafeInteger(version) || version < 0) fail('CORRUPT_STATE');
      if (!Number.isSafeInteger(spendableBalance + escrowBalance) || (version > 0 && (!spendableSnap.exists || !escrowSnap.exists))) fail('CORRUPT_STATE');
      if (grantSnap.exists && grantSnap.data().claimed !== true) fail('CORRUPT_STATE');
      if (commandSnap?.exists) {
        const receipt = commandSnap.data();
        const result = receipt.result;
        const resultKeys = ['ownerId', 'monthId', 'spendable', 'escrow', 'totalOwned', 'version'];
        if (!/^[a-f0-9]{64}$/.test(receipt.payloadHash) || !result || Object.keys(result).sort().join(',') !== resultKeys.sort().join(',') || result.ownerId !== ownerId || result.monthId !== monthId || !Number.isSafeInteger(result.spendable) || result.spendable < 0 || !Number.isSafeInteger(result.escrow) || result.escrow < 0 || result.totalOwned !== result.spendable + result.escrow || !Number.isSafeInteger(result.totalOwned) || !Number.isSafeInteger(result.version) || result.version < 1) fail('CORRUPT_STATE');
      }

      const staged = {
        ledger: [],
        accounts: new Map([
          [account(ownerId, monthId, 'spendable'), spendableBalance],
          [account(ownerId, monthId, 'escrow'), escrowBalance],
        ]),
        commands: new Map(), starterGrants: new Set(), versions: new Map(),
      };
      const scopeKey = `${Buffer.from(JSON.stringify(ownerId)).toString('base64url')}.${Buffer.from(JSON.stringify(monthId)).toString('base64url')}`;
      const receiptKey = `${scopeKey}\u0000${requestId}`;
      if (commandSnap?.exists) staged.commands.set(receiptKey, commandSnap.data());
      if (grantSnap.exists) staged.starterGrants.add(scopeKey);
      staged.versions.set(scopeKey, version);

      let ledgerToWrite;
      let commandToWrite;
      let markerToWrite = false;
      const tx = {
        validateWorld: () => {},
        balance: (uid, month, bucket = 'spendable') => { assertScope(uid, month); return staged.accounts.get(account(uid, month, bucket)) ?? 0; },
        version: (uid, month) => { assertScope(uid, month); return staged.versions.get(scopeKey) ?? 0; },
        getCommand: (uid, month, id) => { assertScope(uid, month); if (id !== requestId) fail('INVALID_SCOPE'); return staged.commands.get(receiptKey); },
        hasStarterGrant: (uid, month) => { assertScope(uid, month); return staged.starterGrants.has(scopeKey); },
        append: (entry) => {
          if (ledgerToWrite) fail('INVALID_LEDGER');
          if (entry.ownerId !== ownerId || entry.monthId !== monthId || entry.reference !== requestId) fail('INVALID_SCOPE');
          if (ledgerSnaps.some((snap) => snap.exists && snap.id === digest(entry.id))) fail('DUPLICATE_LEDGER_ID');
          const canonical = Object.freeze({ ...entry, postings: Object.freeze(entry.postings.map((p) => Object.freeze({ ...p }))) });
          applyLedgerTransaction(staged, canonical);
          ledgerToWrite = staged.ledger[0];
        },
        markStarterGrant: (uid, month) => { assertScope(uid, month); staged.starterGrants.add(scopeKey); markerToWrite = true; },
        bumpVersion: (uid, month) => {
          assertScope(uid, month);
          const next = (staged.versions.get(scopeKey) ?? 0) + 1;
          if (!Number.isSafeInteger(next)) fail('OVERFLOW');
          staged.versions.set(scopeKey, next);
          return next;
        },
        saveCommand: (uid, month, id, payloadHash, result) => {
          assertScope(uid, month);
          if (id !== requestId || !ledgerToWrite) fail('INVALID_SCOPE');
          const receipt = { payloadHash, result };
          staged.commands.set(`${Buffer.from(JSON.stringify(uid)).toString('base64url')}.${Buffer.from(JSON.stringify(month)).toString('base64url')}\u0000${id}`, receipt);
          commandToWrite = receipt;
        },
      };

      function assertScope(uid, month) { if (uid !== ownerId || month !== monthId) fail('INVALID_SCOPE'); }

      const value = await work(tx);
      if (ledgerToWrite) {
        const ledgerRef = monthRef.collection('ledger').doc(digest(ledgerToWrite.id));
        dbtx.create(ledgerRef, ledgerToWrite);
        for (const [bucket, ref] of [['spendable', spendableRef], ['escrow', escrowRef]]) {
          dbtx.set(ref, { balance: staged.accounts.get(account(ownerId, monthId, bucket)) ?? 0 });
        }
        dbtx.set(stateRef, { version: staged.versions.get(scopeKey) ?? 0 });
        if (markerToWrite) dbtx.create(grantRef, { claimed: true });
        if (commandToWrite) dbtx.create(commandRef, commandToWrite);
      }
      return value;
    }, { maxAttempts: this.transactionMaxAttempts });
  }
}
