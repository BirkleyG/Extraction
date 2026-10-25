// Durable event queue (A1). Events live one-per-record, ordered by (atMs, priority, id), so a month's queue is never
// one document (sections 17/18). A worker claims a bounded page under a fenced lease, applies it, then commits a
// checkpoint with compare-and-set on the checkpoint version and lease token. A worker that lost its lease (expired and
// taken over) can never commit: its stale token is rejected and nothing it computed is persisted.
//
// Everything past the checkpoint cursor is pending, everything at or before it is done, so a pending page is a single
// ordered range read (no status index). Events earlier than the cursor are rejected at enqueue (LATE_EVENT).
import { createHash } from 'node:crypto';

export class EventQueueError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'EventQueueError';
    this.code = code;
  }
}

const fail = (code, message = code) => { throw new EventQueueError(code, message); };
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAX_CLAIM_EVENTS = 500;
export const MAX_ENQUEUE_EVENTS = 400;
export const MAX_COMMIT_DOCS = 100;
export const MAX_LEASE_MS = 5 * 60_000;

const PRIORITY_OFFSET = 2n ** 53n;
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const stable = (v) => JSON.stringify(v, (_k, x) => (isRecord(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const digest = (v) => createHash('sha256').update(v).digest('hex');

/** Lexicographically sortable key equal to the kernel's (atMs, priority, id) order. */
export function sortKeyOf(event) {
  return `${String(event.atMs).padStart(16, '0')}:${(BigInt(event.priority) + PRIORITY_OFFSET).toString().padStart(17, '0')}:${event.id}`;
}
export const fingerprintOf = (event) => digest(stable(event));

export function validateQueueEvent(input, monthId) {
  if (!isRecord(input)) fail('INVALID_EVENT');
  const keys = ['id', 'monthId', 'atMs', 'priority', 'type', 'siteId', 'payload'];
  if (Object.keys(input).length !== keys.length || keys.some((k) => !Object.hasOwn(input, k))) fail('INVALID_EVENT', 'Event fields must match the event schema');
  if (typeof input.id !== 'string' || !input.id || input.id.length > 256) fail('INVALID_EVENT');
  if (input.monthId !== monthId) fail('MONTH_MISMATCH');
  const [y, m] = monthId.split('-').map(Number);
  if (!Number.isSafeInteger(input.atMs) || input.atMs < Date.UTC(y, m - 1, 1)) fail('INVALID_EVENT', 'atMs must be an integer inside or after the month start');
  if (!Number.isSafeInteger(input.priority)) fail('INVALID_EVENT', 'priority must be an integer');
  if (typeof input.type !== 'string' || !input.type || input.type.length > 128) fail('INVALID_EVENT');
  if (typeof input.siteId !== 'string' || !input.siteId || input.siteId.length > 256) fail('INVALID_EVENT');
  if (!isRecord(input.payload)) fail('INVALID_EVENT', 'payload must be an object');
  let json;
  try { json = JSON.stringify(input.payload); } catch { fail('INVALID_EVENT', 'payload must be JSON'); }
  if (json.length > 16_384) fail('INVALID_EVENT', 'payload too large');
  return Object.freeze({ ...input, payload: JSON.parse(json) });
}

export function assertScope(scope) {
  if (!isRecord(scope) || typeof scope.worldId !== 'string' || !scope.worldId || typeof scope.monthId !== 'string' || !MONTH_RE.test(scope.monthId)) fail('INVALID_SCOPE');
}

function assertClaim({ workerId, nowMs, leaseMs, limit, beforeMs }) {
  if (typeof workerId !== 'string' || !workerId || workerId.length > 128) fail('INVALID_CLAIM', 'workerId required');
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isSafeInteger(beforeMs) || beforeMs < 0) fail('INVALID_CLAIM', 'times must be integers');
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > MAX_LEASE_MS) fail('INVALID_CLAIM', 'leaseMs out of range');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CLAIM_EVENTS) fail('INVALID_CLAIM', 'limit out of range');
}

function emptyCheckpoint() { return { version: 0, cursorKey: null, lease: null, fence: 0 }; }

/**
 * Pure queue transitions over a checkpoint plus an ordered event reader. Both the in-memory and Firestore stores run
 * these inside one transaction, so the semantics are identical and tested once.
 */
export function planEnqueue(checkpoint, existingByKey, events, monthId) {
  const out = [];
  const seen = new Map();
  for (const raw of events) {
    const event = validateQueueEvent(raw, monthId);
    const fp = fingerprintOf(event);
    const prior = seen.get(event.id) ?? existingByKey.get(event.id);
    if (prior) {
      if (prior !== fp) fail('DUPLICATE_EVENT_CONFLICT', `Event ${event.id} already queued with different content`);
      continue;
    }
    seen.set(event.id, fp);
    if (checkpoint.cursorKey !== null && sortKeyOf(event) <= checkpoint.cursorKey) fail('LATE_EVENT', `Event ${event.id} is at or before the processed cursor`);
    out.push({ event, sortKey: sortKeyOf(event), fingerprint: fp });
  }
  return out;
}

export function planClaim(checkpoint, claim) {
  assertClaim(claim);
  const live = checkpoint.lease && checkpoint.lease.expiresAtMs > claim.nowMs;
  if (live && checkpoint.lease.workerId !== claim.workerId) return { granted: false, retryAtMs: checkpoint.lease.expiresAtMs };
  const fence = checkpoint.fence + 1;
  return { granted: true, fence, next: { ...checkpoint, fence, version: checkpoint.version, lease: { workerId: claim.workerId, token: fence, expiresAtMs: claim.nowMs + claim.leaseMs } } };
}

export function planCommit(checkpoint, commit, claimed) {
  const { workerId, token, expectedVersion, nowMs, processedKeys, docs = [] } = commit;
  if (!Array.isArray(processedKeys) || processedKeys.length > MAX_CLAIM_EVENTS) fail('INVALID_COMMIT');
  if (!Array.isArray(docs) || docs.length > MAX_COMMIT_DOCS) fail('INVALID_COMMIT', 'too many docs');
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail('INVALID_COMMIT');
  const lease = checkpoint.lease;
  if (!lease || lease.workerId !== workerId || lease.token !== token) fail('LEASE_LOST');
  if (lease.expiresAtMs <= nowMs) fail('LEASE_EXPIRED');
  if (checkpoint.version !== expectedVersion) fail('CHECKPOINT_CONFLICT');
  // Processed events must be exactly the next contiguous run after the cursor, in order, with no gaps.
  const sorted = [...processedKeys];
  for (let i = 1; i < sorted.length; i += 1) if (sorted[i] <= sorted[i - 1]) fail('INVALID_COMMIT', 'processedKeys must be strictly ascending');
  if (sorted.length && checkpoint.cursorKey !== null && sorted[0] <= checkpoint.cursorKey) fail('INVALID_COMMIT', 'processedKeys not past cursor');
  if (sorted.length !== claimed.length || sorted.some((k, i) => k !== claimed[i])) fail('GAP_IN_COMMIT', 'Commit must cover the next pending events contiguously');
  return { ...checkpoint, version: checkpoint.version + 1, cursorKey: sorted.length ? sorted.at(-1) : checkpoint.cursorKey, lease: null };
}

/** In-process store. Single-writer per process; the Firestore store provides cross-process atomicity. */
export class MemoryEventQueue {
  #queues = new Map();
  #docs = new Map();
  #tail = Promise.resolve();

  #q(scope) {
    assertScope(scope);
    const id = `${scope.worldId}\u0000${scope.monthId}`;
    if (!this.#queues.has(id)) this.#queues.set(id, { checkpoint: emptyCheckpoint(), events: new Map() });
    return this.#queues.get(id);
  }

  #serial(work) {
    const result = this.#tail.then(work);
    this.#tail = result.catch(() => {});
    return result;
  }

  enqueue(scope, events) {
    return this.#serial(() => {
      if (!Array.isArray(events) || events.length > MAX_ENQUEUE_EVENTS) fail('INVALID_EVENT', 'events must be an array within the batch limit');
      const q = this.#q(scope);
      const existing = new Map([...q.events.values()].map((r) => [r.event.id, r.fingerprint]));
      const planned = planEnqueue(q.checkpoint, existing, events, scope.monthId);
      for (const r of planned) q.events.set(r.sortKey, r);
      return { added: planned.length, duplicates: events.length - planned.length };
    });
  }

  claim(scope, claim) {
    return this.#serial(() => {
      const q = this.#q(scope);
      const plan = planClaim(q.checkpoint, claim);
      if (!plan.granted) return plan;
      const page = [...q.events.keys()].sort().filter((k) => (q.checkpoint.cursorKey === null || k > q.checkpoint.cursorKey)).filter((k) => q.events.get(k).event.atMs < claim.beforeMs).slice(0, claim.limit);
      q.checkpoint = plan.next;
      return { granted: true, token: plan.fence, version: q.checkpoint.version, cursorKey: q.checkpoint.cursorKey, events: page.map((k) => ({ sortKey: k, event: q.events.get(k).event })) };
    });
  }

  commit(scope, commit) {
    return this.#serial(() => {
      const q = this.#q(scope);
      const claimed = [...q.events.keys()].sort().filter((k) => (q.checkpoint.cursorKey === null || k > q.checkpoint.cursorKey)).slice(0, commit.processedKeys?.length ?? 0);
      const next = planCommit(q.checkpoint, commit, claimed);
      q.checkpoint = next;
      for (const d of commit.docs ?? []) this.#docs.set(`${scope.worldId}\u0000${d.path}`, JSON.stringify(d.value));
      return { version: next.version, cursorKey: next.cursorKey };
    });
  }

  /** Give the lease back unchanged so another worker can claim immediately. No-op if the lease is not ours. */
  release(scope, { workerId, token }) {
    return this.#serial(() => {
      const q = this.#q(scope);
      if (q.checkpoint.lease?.workerId === workerId && q.checkpoint.lease.token === token) q.checkpoint = { ...q.checkpoint, lease: null };
      return true;
    });
  }

  stats(scope) {
    return this.#serial(() => {
      const q = this.#q(scope);
      const pending = [...q.events.keys()].filter((k) => q.checkpoint.cursorKey === null || k > q.checkpoint.cursorKey).length;
      return { pending, total: q.events.size, version: q.checkpoint.version, cursorKey: q.checkpoint.cursorKey, lease: q.checkpoint.lease };
    });
  }

  readDoc(scope, path) { return this.#serial(() => (this.#docs.has(`${scope.worldId}\u0000${path}`) ? JSON.parse(this.#docs.get(`${scope.worldId}\u0000${path}`)) : null)); }
}

/**
 * Firestore store: worlds/{sha(worldId)}/queues/{monthId} holds the checkpoint; .../events/{sha(eventId)} one record per event.
 * Every operation is one Firestore transaction, so concurrent workers contend on the checkpoint document and exactly
 * one wins a given lease or commit.
 */
export class FirestoreEventQueue {
  constructor(firestore, { transactionMaxAttempts = 8 } = {}) {
    if (!firestore?.runTransaction || !firestore?.collection) throw new TypeError('A Firebase Admin Firestore instance is required');
    this.firestore = firestore;
    this.attempts = transactionMaxAttempts;
  }

  #refs(scope) {
    assertScope(scope);
    const world = this.firestore.collection('worlds').doc(digest(scope.worldId));
    const queue = world.collection('queues').doc(scope.monthId);
    return { world, queue, events: queue.collection('events') };
  }

  static #checkpoint(snap) {
    if (!snap.exists) return emptyCheckpoint();
    const c = snap.data();
    if (!Number.isSafeInteger(c.version) || !Number.isSafeInteger(c.fence) || (c.cursorKey !== null && typeof c.cursorKey !== 'string')) fail('CORRUPT_STATE');
    return { version: c.version, fence: c.fence, cursorKey: c.cursorKey, lease: c.lease ?? null };
  }

  async enqueue(scope, events) {
    if (!Array.isArray(events) || events.length > MAX_ENQUEUE_EVENTS) fail('INVALID_EVENT', 'events must be an array within the batch limit');
    const { queue, events: col } = this.#refs(scope);
    return this.firestore.runTransaction(async (tx) => {
      const [cpSnap, ...snaps] = await Promise.all([tx.get(queue), ...events.map((e) => tx.get(col.doc(digest(String(e?.id)))))]);
      const existing = new Map();
      snaps.forEach((s) => { if (s.exists) existing.set(s.data().event.id, s.data().fingerprint); });
      const planned = planEnqueue(FirestoreEventQueue.#checkpoint(cpSnap), existing, events, scope.monthId);
      for (const r of planned) tx.create(col.doc(digest(r.event.id)), r);
      return { added: planned.length, duplicates: events.length - planned.length };
    }, { maxAttempts: this.attempts });
  }

  async claim(scope, claim) {
    const { queue, events: col } = this.#refs(scope);
    return this.firestore.runTransaction(async (tx) => {
      const cp = FirestoreEventQueue.#checkpoint(await tx.get(queue));
      const plan = planClaim(cp, claim);
      if (!plan.granted) return plan;
      let query = col.orderBy('sortKey');
      if (cp.cursorKey !== null) query = query.startAfter(cp.cursorKey);
      const snap = await tx.get(query.limit(claim.limit));
      const page = snap.docs.map((d) => d.data()).filter((r) => r.event.atMs < claim.beforeMs);
      // Order is atMs-first, so the due events are always a prefix of the page.
      tx.set(queue, plan.next);
      return { granted: true, token: plan.fence, version: plan.next.version, cursorKey: cp.cursorKey, events: page.map((r) => ({ sortKey: r.sortKey, event: r.event })) };
    }, { maxAttempts: this.attempts });
  }

  async commit(scope, commit) {
    const { world, queue, events: col } = this.#refs(scope);
    return this.firestore.runTransaction(async (tx) => {
      const cp = FirestoreEventQueue.#checkpoint(await tx.get(queue));
      let query = col.orderBy('sortKey');
      if (cp.cursorKey !== null) query = query.startAfter(cp.cursorKey);
      const count = commit.processedKeys?.length ?? 0;
      const claimed = count ? (await tx.get(query.limit(count))).docs.map((d) => d.data().sortKey) : [];
      const next = planCommit(cp, commit, claimed);
      tx.set(queue, next);
      for (const d of commit.docs ?? []) tx.set(world.collection('docs').doc(digest(d.path)), { path: d.path, json: JSON.stringify(d.value) });
      return { version: next.version, cursorKey: next.cursorKey };
    }, { maxAttempts: this.attempts });
  }

  async release(scope, { workerId, token }) {
    const { queue } = this.#refs(scope);
    return this.firestore.runTransaction(async (tx) => {
      const cp = FirestoreEventQueue.#checkpoint(await tx.get(queue));
      if (cp.lease?.workerId === workerId && cp.lease.token === token) tx.set(queue, { ...cp, lease: null });
      return true;
    }, { maxAttempts: this.attempts });
  }
}
