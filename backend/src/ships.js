// Section 05 ships, pads, trips and destination choice. Pure: no I/O, no coin movement. The trip estimate shown to the player
// and the trip the simulation runs are the SAME function (tripPlan, T05-01); a departure never recomputes it differently.

export class ShipError extends Error {
  constructor(code, message = code) { super(message); this.name = 'ShipError'; this.code = code; }
}
const fail = (code, message = code) => { throw new ShipError(code, message); };
const linear = (base, level) => base * (1 + 0.04 * level);

// C-02 PROVISIONAL: section 05 fixes the ratios (Cruiser 3x speed / 35% cargo, Freighter 60% speed / 3x cargo, Freighter ~1.8x the
// price of the other craft) but gives no coin price for an additional ship. See Q-11.
export const SHIP_CLASSES = Object.freeze({
  hauler: Object.freeze({ speed: 1, capacity: 1, price: 3_000 }),
  cruiser: Object.freeze({ speed: 3, capacity: 0.35, price: 3_000 }),
  freighter: Object.freeze({ speed: 0.6, capacity: 3, price: 5_400 }),
});
export const MAX_SHIPS = 24; // C-02 PROVISIONAL: section 05 caps pads (12), not hulls; ships without a pad wait in orbit.
export const MAX_PADS = 12;
export const POLICY_MODES = Object.freeze(['best', 'nearest', 'fixed', 'preferred']);

export const shipClass = (ship) => SHIP_CLASSES[ship?.class] ?? fail('UNKNOWN_SHIP_CLASS');
export function shipPrice(className) {
  if (!Object.hasOwn(SHIP_CLASSES, className)) fail('UNKNOWN_SHIP_CLASS', `Unknown ship class: ${String(className)}`);
  return SHIP_CLASSES[className].price;
}
// Hauler numbers keep the existing server profile (C01-EARLY-01): hold 150, speed 0.5 units/min, loading 60 units/min.
export const shipCapacityUnits = (levelOrState, ship) => {
  const level = typeof levelOrState === 'number' ? levelOrState : levelOrState.levels.shipCapacity;
  return Math.max(1, Math.floor(linear(150, level) * (ship ? shipClass(ship).capacity : 1)));
};
export const shipSpeedPerMinute = (levelOrState, ship) => {
  const level = typeof levelOrState === 'number' ? levelOrState : levelOrState.levels.shipSpeed;
  return linear(0.5, level) * (ship ? shipClass(ship).speed : 1);
};
export const loadUnitsPerMinute = (level) => linear(60, level);

/** A ship's effective policy: its own, else the fleet default; legacy `{auto, destinationId}` reads as fixed when a destination is pinned. */
export function shipPolicy(state, ship) {
  const p = ship?.policy ?? state.policy ?? { auto: true, destinationId: null };
  const destinationId = p.destinationId ?? null;
  return { auto: p.auto !== false, destinationId, mode: p.mode ?? (destinationId ? 'fixed' : 'best'), preferred: Array.isArray(p.preferred) ? p.preferred : [] };
}

/**
 * The single trip formula (section 05): trip = 2 x travel + unload + dock wait, plus the separate pad loading time for the
 * next hold. `dockWaitSeconds(arrivalSec, unloadSeconds)` comes from the destination's dock queue at departure; `padFreeAt` is the pad schedule.
 * Returns whole seconds only, so the estimate shown equals the simulated trip exactly.
 */
export function tripPlan(state, ship, refinery, units, atSec, { dockWaitSeconds = () => 0 } = {}) {
  if (!Number.isSafeInteger(units) || units < 1) fail('INVALID_UNITS');
  const speed = shipSpeedPerMinute(state, ship);
  const travelSeconds = (refinery.distance / speed) * 60;
  const arrivalSec = atSec + Math.ceil(travelSeconds);
  const unloadSeconds = (units / refinery.unloadUnitsPerMinute) * 60;
  const dockWait = dockWaitSeconds(arrivalSec, Math.ceil(unloadSeconds));
  if (!Number.isSafeInteger(dockWait) || dockWait < 0) fail('INVALID_DOCK_STATE');
  const tripSeconds = Math.ceil(2 * travelSeconds + unloadSeconds + dockWait);
  const arrivalOffsetSeconds = Math.ceil(travelSeconds + dockWait + unloadSeconds);
  const loadSeconds = Math.ceil((units / loadUnitsPerMinute(state.levels.padLoading)) * 60);
  // Pad queue: the returning ship loads on the pad that frees first; ships without a free pad wait in orbit.
  const padFreeAt = state.padFreeAt?.length ? state.padFreeAt : [state.simSecond];
  let padIndex = 0;
  for (let i = 1; i < padFreeAt.length; i += 1) if (padFreeAt[i] < padFreeAt[padIndex]) padIndex = i;
  const returnSec = atSec + tripSeconds;
  const padStartSec = Math.max(returnSec, padFreeAt[padIndex]);
  const readyAtSecond = padStartSec + loadSeconds;
  return {
    tripSeconds, loadSeconds, dockWaitSeconds: dockWait, padWaitSeconds: padStartSec - returnSec, padIndex,
    busySeconds: readyAtSecond - atSec, arrivalOffsetSeconds, readyAtSecond,
    dockReservation: { arrivalSec, unloadSeconds: Math.ceil(unloadSeconds) },
  };
}

// Coin per minute = payment / busy time (exact integer cross-multiplication, so ties and ordering never depend on float noise).
const rateGreater = (a, b) => BigInt(a.payment) * BigInt(b.busySeconds) > BigInt(b.payment) * BigInt(a.busySeconds);
const rateEqual = (a, b) => BigInt(a.payment) * BigInt(b.busySeconds) === BigInt(b.payment) * BigInt(a.busySeconds);

/**
 * Destination table rows (price, tax, trip time, coin per minute) for one ship and cargo. `quoteFor(refinery)` must return
 * `{ payment, premiumPayment }` and `waitFor(refinery)` the dock-wait function; both come from the same market view the departure uses.
 */
export function destinationTable(state, ship, refineries, units, atSec, { quoteFor, waitFor }) {
  const rows = refineries.map((r) => {
    const quote = quoteFor(r);
    const plan = tripPlan(state, ship, r, units, atSec, { dockWaitSeconds: waitFor(r) });
    return {
      id: r.id, name: r.name ?? r.id, distance: r.distance, units, payment: quote.payment, premiumPayment: quote.premiumPayment ?? 0,
      unitPrice: quote.payment / units, tax: 0, ...plan,
      coinPerMinute: Math.round((quote.payment * 60 * 100) / plan.busySeconds) / 100,
    };
  });
  let best = null;
  for (const row of rows) if (!best || rateGreater(row, best) || (rateEqual(row, best) && row.id < best.id)) best = row;
  return rows.map((row) => ({ ...row, best: row === best }));
}

/** Pick a destination row by ship policy (best coin per minute, nearest, fixed, preferred list). */
export function chooseRow(rows, policy) {
  if (!rows.length) return null;
  const best = (list) => list.reduce((acc, row) => (!acc || rateGreater(row, acc) || (rateEqual(row, acc) && row.id < acc.id) ? row : acc), null);
  switch (policy.mode) {
    case 'nearest': return rows.reduce((acc, row) => (!acc || row.distance < acc.distance || (row.distance === acc.distance && rateGreater(row, acc)) || (row.distance === acc.distance && rateEqual(row, acc) && row.id < acc.id) ? row : acc), null);
    case 'fixed': return rows.find((row) => row.id === policy.destinationId) ?? best(rows);
    case 'preferred': return best(rows.filter((row) => policy.preferred.includes(row.id))) ?? best(rows);
    default: return best(rows);
  }
}
