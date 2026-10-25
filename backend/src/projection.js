// Owner read model: an explicit allowlist of what a player's browser may see (section 18/20).
// Raw owner documents, NPC budgets, world seeds, vein sizes and other players' state never pass through here.
import { LedgerError } from './ledger.js';
import { nextLevelPrice, CURVES, shaftPrice, MAX_SHAFTS, habitatCapacity } from './upgrades.js';
import { effectiveShaftRatePerMinute, liftRatePerMinute } from './production.js';
import { hireCost, surfaceUnits, shaftLevelLine, PURCHASABLE_LINES, getPolicy, secondsUntilFull, takeoffTarget, yardLines, yardStock, cargoPlan, destinationRows, weatherNow, takeoffSecond, wastedWorkers, oreTier } from './mine-engine.js';
import { SHIP_CLASSES, MAX_PADS, MAX_SHIPS, shipCapacityUnits, shipSpeedPerMinute, loadUnitsPerMinute, shipPolicy, shipPrice } from './ships.js';
import { padPrice } from './upgrades.js';
import { veinWarning } from './environment.js';
import { monthEndMs } from './game-service.js';

const safePrice = (fn) => { try { return fn(); } catch (error) { if (error instanceof LedgerError || error?.code) return null; throw error; } };

export function projectOwner({ doc, spendable, escrow, version, market, nowMs, autoTakeoffs = 0, catchingUp = false, cosmeticSeed = '' }) {
  const nowSec = Math.floor(nowMs / 1000);
  const shafts = doc.production.shafts.map((s) => ({
    shaftNumber: s.shaftNumber,
    digLevel: s.digLevel, cartLevel: s.cartLevel, bunkhouseLevel: s.bunkhouseLevel,
    workers: s.workersAssigned, workerCapacity: 10 + 5 * s.bunkhouseLevel,
    lightsLevel: s.lightsLevel, supportsLevel: s.supportsLevel,
    ratePerMinute: effectiveShaftRatePerMinute(s),
    bufferFill: s.bufferCapacityUnits > 0 ? s.bufferUnits / s.bufferCapacityUnits : 0,
    // "!" markers only say that something is full or idle; they never name a bottleneck or recommend a purchase (section 03).
    marks: { bufferFull: s.bufferUnits >= s.bufferCapacityUnits, idle: s.workersAssigned === 0 },
    // Vein bar for a shaft the player has dug (section 04): remaining share and the 20% / 5% warnings, never the planet's hidden veins.
    vein: s.vein ? { oreId: s.vein.oreId, tier: oreTier(doc, s.vein.oreId), remainingFraction: s.vein.remaining / s.vein.size, warning: veinWarning(s.vein) } : null,
    prices: {
      lights: safePrice(() => nextLevelPrice('lights', s.lightsLevel)),
      supports: safePrice(() => nextLevelPrice('supports', s.supportsLevel)),
      dig: safePrice(() => nextLevelPrice('dig', s.digLevel)),
      carts: safePrice(() => nextLevelPrice('carts', s.cartLevel)),
      bunkhouse: safePrice(() => nextLevelPrice('bunkhouse', s.bunkhouseLevel)),
    },
  }));
  const lift = doc.production.lift;
  const ships = doc.ships;
  const first = ships[0];
  const capacity = shipCapacityUnits(doc, first);
  const yardUnits = doc.production.surface.unitsByOre.reduce((a, r) => a + r.units, 0);
  const stock = yardStock(doc);
  const sellUnits = Math.min(capacity, stock);
  const policy = getPolicy(doc);
  const line = (name) => ({ level: shaftLevelLine(doc, name, 1), cap: CURVES[name].cap, nextPrice: safePrice(() => nextLevelPrice(name, shaftLevelLine(doc, name, 1))) });
  const weather = weatherNow(doc, nowSec);
  // One destination table per ship (price, tax, trip time, coin per minute). Empty yard: a full common-ore hold is quoted and flagged.
  const tableFor = (ship) => {
    const hold = Math.min(shipCapacityUnits(doc, ship), stock);
    const lines = hold > 0 ? cargoPlan(doc, hold) : [{ oreId: doc.production.shafts[0].commonOreId, tier: 'common', units: shipCapacityUnits(doc, ship) }];
    return { hypothetical: hold === 0, rows: destinationRows(doc, ship, market, lines, nowSec) };
  };
  const fleet = ships.map((ship) => {
    const t = tableFor(ship);
    const sp = shipPolicy(doc, ship);
    return {
      id: ship.id, class: ship.class, capacity: shipCapacityUnits(doc, ship), speedPerMinute: shipSpeedPerMinute(doc, ship),
      state: ship.readyAtSecond > nowSec ? 'BUSY' : 'READY', readyInSeconds: Math.max(0, ship.readyAtSecond - nowSec),
      policy: { auto: sp.auto, mode: sp.mode, destinationId: sp.destinationId, preferred: sp.preferred }, destinations: t.rows, hypothetical: t.hypothetical,
    };
  });
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
      workers: { hired: doc.workersHired, capacity: habitatCapacity(doc.levels.habitat), nextHireCost: hireCost(doc.workersHired), wasted: wastedWorkers(doc) },
      pads: { count: doc.pads, max: MAX_PADS, nextPrice: doc.pads < MAX_PADS ? padPrice(doc.pads + 1) : null },
      weather: { kind: weather.kind, grounded: weather.grounded, takeoffAllowedAtSecond: takeoffSecond(doc, nowSec) },
      marks: { yardFull: yardUnits >= doc.production.surface.capacityUnits - 1e-9, wastedLabor: wastedWorkers(doc) > 0 },
    },
    fleet: { ships: fleet, count: ships.length, max: MAX_SHIPS, prices: Object.fromEntries(Object.keys(SHIP_CLASSES).map((c) => [c, shipPrice(c)])) },
    ship: {
      capacity, speedPerMinute: shipSpeedPerMinute(doc.levels.shipSpeed), loadUnitsPerMinute: loadUnitsPerMinute(doc.levels.padLoading),
      readyInSeconds: Math.max(0, first.readyAtSecond - nowSec),
      holdUnits: sellUnits, takeoffAtUnits: takeoffTarget(doc), autoInSeconds: secondsUntilFull(doc),
      policy: { auto: policy.auto, destinationId: policy.destinationId },
      lines: { shipCapacity: line('shipCapacity'), shipSpeed: line('shipSpeed'), padLoading: line('padLoading') },
    },
    lines: { habitat: line('habitat'), surfaceStorage: line('surfaceStorage') },
    // Same functions the simulation uses for the real trip and payment (T05-01). Base bids are unlimited (Q-10); the rare/mythic premium is finite.
    offers: market.refineries.map((o) => {
      const row = fleet[0].destinations.find((d) => d.id === o.id);
      return { id: o.id, name: o.name ?? o.id, bidPerUnit: o.bidPerUnit, distance: o.distance, unlimited: true, best: row.best, premiumAvailable: fleet[0].hypothetical ? null : row.premiumPayment > 0, estimate: sellUnits > 0 ? row : null };
    }),
    shipments: doc.shipments.slice(-20).map((s) => ({ id: s.id, units: s.units, payment: s.payment, destinationId: s.destinationId, departureSecond: s.departureSecond, arrivalSecond: s.arrivalSecond, status: s.arrivalSecond <= nowSec ? 'DELIVERED' : 'IN_TRANSIT' })),
    purchasable: PURCHASABLE_LINES,
    // Everything the pixel scene needs to draw this owner's mine. It is the owner's own state; there is no hidden world data in it.
    scene: {
      cosmeticSeed, slot: doc.slot ?? 0, commonOreId: doc.production.shafts[0].oreId, simSecond: doc.simSecond, nowSec,
      production: doc.production, levels: doc.levels, workersHired: doc.workersHired, shipments: doc.shipments.slice(-20), policy,
      shipReadyAtSecond: first.readyAtSecond, totalExternalEarnings: doc.totalExternalEarnings,
    },
  };
}
