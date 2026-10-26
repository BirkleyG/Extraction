// Zero-client event worker (A1, T18-08). Advances a month's durable event queue with nobody online: claim a bounded
// page under a fenced lease, apply each event to its site's state with a pure handler and the seeded per-site/second
// RNG, then commit all changed site documents and the checkpoint in ONE transaction. A handler failure commits nothing
// and releases the lease, so the same page is retried and replay stays identical to live play.
//
// State is one small document per site (`queue-state/<monthId>/<siteId>`), never one document for the world.
import { createStepRng } from './events.js';
import { MAX_CLAIM_EVENTS, MAX_COMMIT_DOCS } from './event-queue.js';

export class EventWorkerError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'EventWorkerError';
    this.code = code;
  }
}

const monthEndMs = (monthId) => { const [y, m] = monthId.split('-').map(Number); return Date.UTC(y, m, 1); };
export const sitePath = (monthId, siteId) => `queue-state/${monthId}/${Buffer.from(siteId).toString('base64url')}`;
const clone = (v) => JSON.parse(JSON.stringify(v));

export class EventWorker {
  /**
   * @param {object} options
   * @param {MemoryEventQueue|FirestoreEventQueue} options.queue
   * @param {Record<string, (data: object, event: object, rng: object) => object|void>} options.handlers synchronous and pure
   * @param {(scope: {worldId: string, monthId: string}) => string} options.seedFor secret per-month world seed
   * @param {(siteId: string) => object} [options.initialState]
   */
  constructor({ queue, handlers = {}, seedFor, workerId = 'worker', initialState = () => ({}), leaseMs = 30_000, pageSize = 100, maxBatches = 25, clock = Date.now }) {
    if (!queue?.claim || !queue?.commit) throw new TypeError('A durable event queue is required');
    if (typeof seedFor !== 'function') throw new TypeError('seedFor is required');
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_CLAIM_EVENTS) throw new RangeError('pageSize out of range');
    Object.assign(this, { queue, handlers, seedFor, workerId, initialState, leaseMs, pageSize, maxBatches, clock });
  }

  /** Process at most one page. Returns {status: 'idle'|'busy'|'applied'|'blocked', applied, retryAtMs?, error?}. */
  async runOnce(scope, { nowMs: given } = {}) {
    const nowMs = given ?? this.clock();
    // Events at or after the month boundary B belong to the old-month kernel's pending set and are never processed here.
    const beforeMs = Math.min(nowMs + 1, monthEndMs(scope.monthId));
    const claim = await this.queue.claim(scope, { workerId: this.workerId, nowMs, leaseMs: this.leaseMs, limit: this.pageSize, beforeMs });
    if (!claim.granted) return { status: 'busy', applied: 0, retryAtMs: claim.retryAtMs };
    if (!claim.events.length) return { status: 'idle', applied: 0 };

    let computed;
    try {
      computed = await this.#apply(scope, claim);
    } catch (error) {
      // Nothing was committed. Give the lease back so the identical page is retried (never skipped: skipping would fork replay).
      await this.queue.release(scope, { workerId: this.workerId, token: claim.token }).catch(() => {});
      return { status: 'blocked', applied: 0, error: error?.code ?? 'HANDLER_FAILED', eventId: error?.eventId ?? null };
    }
    try {
      await this.queue.commit(scope, {
        workerId: this.workerId, token: claim.token, expectedVersion: claim.version, nowMs: given ?? this.clock(),
        processedKeys: computed.keys, docs: computed.docs,
      });
    } catch (error) {
      if (['LEASE_LOST', 'LEASE_EXPIRED', 'CHECKPOINT_CONFLICT'].includes(error?.code)) return { status: 'busy', applied: 0, error: error.code };
      throw error;
    }
    return { status: 'applied', applied: computed.keys.length };
  }

  /** Drain due events for a month: repeat pages until idle, blocked, busy or the batch budget is spent. */
  async drain(scope, { nowMs, maxBatches = this.maxBatches } = {}) {
    let applied = 0;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const r = await this.runOnce(scope, { nowMs });
      applied += r.applied;
      if (r.status === 'idle') return { status: 'idle', applied, done: true };
      if (r.status !== 'applied') return { ...r, applied, done: false };
    }
    return { status: 'applied', applied, done: false };
  }

  async #apply(scope, claim) {
    const seed = this.seedFor(scope);
    // Cap distinct sites per commit; the remaining events of the page simply stay pending for the next page.
    const siteIds = [];
    const events = [];
    for (const item of claim.events) {
      if (!siteIds.includes(item.event.siteId)) {
        if (siteIds.length >= MAX_COMMIT_DOCS) break;
        siteIds.push(item.event.siteId);
      }
      events.push(item);
    }
    const paths = siteIds.map((id) => sitePath(scope.monthId, id));
    const loaded = await this.queue.readDocs(scope, paths);
    const sites = new Map(siteIds.map((id, i) => [id, loaded[i] ?? { data: this.initialState(id), rngStep: null, rngDraws: 0 }]));
    const dirty = new Set();
    for (const { event } of events) {
      const handler = Object.hasOwn(this.handlers, event.type) ? this.handlers[event.type] : null;
      if (typeof handler !== 'function') throw Object.assign(new EventWorkerError('UNKNOWN_EVENT_TYPE', `Unknown event type: ${event.type}`), { eventId: event.id });
      const site = sites.get(event.siteId);
      const step = Math.floor(event.atMs / 1000);
      const draws = site.rngStep === step ? site.rngDraws : 0;
      const rng = createStepRng(seed, event.siteId, step, draws);
      let next;
      try {
        const working = clone(site.data);
        const result = handler(working, event, rng);
        if (result && typeof result.then === 'function') throw new EventWorkerError('ASYNC_HANDLER');
        next = clone(result === undefined ? working : result);
      } catch (error) {
        throw Object.assign(error instanceof EventWorkerError ? error : new EventWorkerError('HANDLER_FAILED', 'Event handler failed; batch rolled back'), { eventId: event.id });
      }
      site.data = next;
      site.rngStep = step;
      site.rngDraws = draws + rng.drawsUsed;
      dirty.add(event.siteId);
    }
    return {
      keys: events.map((e) => e.sortKey),
      docs: [...dirty].map((id) => ({ path: sitePath(scope.monthId, id), value: sites.get(id) })),
    };
  }
}
