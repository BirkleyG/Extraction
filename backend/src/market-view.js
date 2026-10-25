// Working copy of the computer-run refineries' shared state (finite premium funds/storage, dock queues) for ONE transaction.
// Quotes are pure; `commit` mutates only this view. GameService loads it from repository docs and writes back the dirty
// refineries in the same transaction as the ledger postings, so a rejected command never changes the market (T18-11).
import { DEFAULT_PREMIUM, REFINERY_DOCKS, initialMarketState, quoteCargo } from './npc-market.js';

const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
export const marketPath = (worldId, monthId, refineryId) => `world/${enc(worldId)}/npc/${monthId}/${enc(refineryId)}`;

/** Static buyers without premium/dock settings (tests, legacy config) get the provisional defaults. */
export const normalizeRefinery = (def) => ({ ...def, docks: def.docks ?? REFINERY_DOCKS, premium: def.premium ?? DEFAULT_PREMIUM });

// Dock queue (section 05): a refinery has `docks` berths; every paid departure reserves [start, end) for its unloading. Reservations are
// intervals, not a single "free at" time, so a departure settled late (offline catch-up, dated in the past) is not blocked by another
// owner's later booking: it waits only for berths that are really busy during its own window. Only the latest MAX_RESERVATIONS are kept.
export const MAX_RESERVATIONS = 64;
const busyIntervals = (state) => state.dockBusy ?? [];
const fits = (busy, docks, start, end) => {
  const overlapping = busy.filter(([s, e]) => s < end && e > start);
  // Concurrency peaks at some interval start inside the window (or at `start`).
  const points = [start, ...overlapping.map(([s]) => Math.max(s, start))];
  return points.every((t) => overlapping.filter(([s, e]) => s <= t && e > t).length < docks);
};
export function dockWaitFor(refinery, state, arrivalSec, unloadSeconds = 0) {
  const busy = busyIntervals(state);
  const candidates = [arrivalSec, ...busy.map(([, e]) => e).filter((e) => e > arrivalSec)].sort((a, b) => a - b);
  for (const t of candidates) if (fits(busy, refinery.docks, t, t + Math.max(1, unloadSeconds))) return t - arrivalSec;
  return Math.max(...candidates) - arrivalSec;
}

export class MarketView {
  #states = new Map();
  #dirty = new Set();
  constructor(refineries, states = {}, nowSec = 0) {
    this.refineries = refineries.map(normalizeRefinery);
    for (const r of this.refineries) this.#states.set(r.id, states[r.id] ?? initialMarketState(r, nowSec));
  }
  get(id) { return this.refineries.find((r) => r.id === id) ?? null; }
  state(id) { return this.#states.get(id); }
  get dirtyIds() { return [...this.#dirty]; }
  /** Pure offer for cargo lines `[{oreId, tier, units}]` at `atSec`. */
  quote(id, lines, atSec) { return quoteCargo(this.get(id), this.#states.get(id), lines, atSec); }
  /** Dock wait for a ship arriving at `arrivalSec` that will unload for `unloadSeconds` (the estimate and the reservation use this one rule). */
  dockWait(id) { const s = this.#states.get(id); const r = this.get(id); return (arrivalSec, unloadSeconds = 0) => dockWaitFor(r, s, arrivalSec, unloadSeconds); }
  /** Consume the quoted premium and reserve the dock for the planned unloading. */
  commit(id, quote, reservation) {
    const wait = dockWaitFor(this.get(id), quote.nextState, reservation.arrivalSec, reservation.unloadSeconds);
    const start = reservation.arrivalSec + wait;
    const dockBusy = [...busyIntervals(quote.nextState), [start, start + Math.max(1, reservation.unloadSeconds)]].sort((a, b) => a[1] - b[1]).slice(-MAX_RESERVATIONS);
    this.#states.set(id, { ...quote.nextState, dockBusy });
    this.#dirty.add(id);
    return { waitSeconds: wait, startSec: start };
  }
}
