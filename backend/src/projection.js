// Owner read model: an explicit allowlist of what a player's browser may see (section 18/20).
// Raw owner documents, NPC budgets, world seeds, vein sizes and other players' state never pass through here.
import { LedgerError } from './ledger.js';
import { nextLevelPrice, CURVES, shaftPrice, MAX_SHAFTS, habitatCapacity } from './upgrades.js';
import { shaftRatePerMinute, liftRatePerMinute } from './production.js';
import { hireCost, shipCapacityUnits, shipSpeedPerMinute, loadUnitsPerMinute, surfaceUnits, tripEstimate, shaftLevelLine, PURCHASABLE_LINES, getPolicy, secondsUntilFull, takeoffTarget } from './mine-engine.js';
import { monthEndMs } from './game-service.js';

const safePrice = (fn) => { try { return fn(); } catch (error) { if (error instanceof LedgerError || error?.code) return null; throw error; } };

export function projectOwner({ doc, spendable, escrow, version, offers, nowMs, autoTakeoffs = 0, catchingUp = false }) {
  const nowSec = Math.floor(nowMs / 1000);
  const shafts = doc.production.shafts.map((s) => ({
    shaftNumber: s.shaftNumber,
    digLevel: s.digLevel, cartLevel: s.cartLevel, bunkhouseLevel: s.bunkhouseLevel,
    workers: s.workersAssigned, workerCapacity: 10 + 5 * s.bunkhouseLevel,
    ratePerMinute: shaftRatePerMinute(s),
    bufferFill: s.bufferCapacityUnits > 0 ? s.bufferUnits / s.bufferCapacityUnits : 0,
    prices: {
      dig: safePrice(() => nextLevelPrice('dig', s.digLevel)),
      carts: safePrice(() => nextLevelPrice('carts', s.cartLevel)),
      bunkhouse: safePrice(() => nextLevelPrice('bunkhouse', s.bunkhouseLevel)),
    },
  }));
  const lift = doc.production.lift;
  const yardUnits = surfaceUnits(doc, doc.production.shafts[0].oreId);
  const capacity = shipCapacityUnits(doc.levels.shipCapacity);
  const sellUnits = Math.min(capacity, Math.floor(yardUnits + 1e-9));
  const policy = getPolicy(doc);
  const line = (name) => ({ level: shaftLevelLine(doc, name, 1), cap: CURVES[name].cap, nextPrice: safePrice(() => nextLevelPrice(name, shaftLevelLine(doc, name, 1))) });
  return {
    monthId: doc.monthId,
    version, autoTakeoffs, catchingUp,
    serverNowMs: nowMs,
    monthEndsAtMs: monthEndMs(doc.monthId),
    coin: { spendable, escrow, totalOwned: spendable + escrow },
    earnings: { grossExternal: doc.totalExternalEarnings },
    yard: { units: Math.floor(yardUnits * 100) / 100, capacity: doc.production.surface.capacityUnits },
    mine: {
      shafts,
      shaftCount: shafts.length,
      nextShaftPrice: shafts.length < MAX_SHAFTS ? shaftPrice(shafts.length + 1) : null,
      lift: { level: lift.level, ratePerMinute: liftRatePerMinute({ liftLevel: lift.level, baseRatePerMinute: lift.baseRatePerMinute, curve: lift.curve, growth: lift.growth }), nextPrice: safePrice(() => nextLevelPrice('lift', lift.level)) },
      workers: { hired: doc.workersHired, capacity: habitatCapacity(doc.levels.habitat), nextHireCost: hireCost(doc.workersHired) },
    },
    ship: {
      capacity, speedPerMinute: shipSpeedPerMinute(doc.levels.shipSpeed), loadUnitsPerMinute: loadUnitsPerMinute(doc.levels.padLoading),
      readyInSeconds: Math.max(0, doc.ship.readyAtSecond - nowSec),
      holdUnits: sellUnits, takeoffAtUnits: takeoffTarget(doc), autoInSeconds: secondsUntilFull(doc),
      policy: { auto: policy.auto, destinationId: policy.destinationId },
      lines: { shipCapacity: line('shipCapacity'), shipSpeed: line('shipSpeed'), padLoading: line('padLoading') },
    },
    lines: { habitat: line('habitat'), surfaceStorage: line('surfaceStorage') },
    offers: offers.map((o) => ({
      id: o.id, name: o.name ?? o.id, bidPerUnit: o.bidPerUnit, distance: o.distance, unlimited: true,
      // Same function the simulation uses for the real trip (T05-01).
      estimate: sellUnits > 0 ? { units: sellUnits, payment: sellUnits * o.bidPerUnit, ...tripEstimate(doc, o, sellUnits) } : null,
    })),
    shipments: doc.shipments.slice(-20).map((s) => ({ id: s.id, units: s.units, payment: s.payment, destinationId: s.destinationId, departureSecond: s.departureSecond, arrivalSecond: s.arrivalSecond, status: s.arrivalSecond <= nowSec ? 'DELIVERED' : 'IN_TRANSIT' })),
    purchasable: PURCHASABLE_LINES,
  };
}
