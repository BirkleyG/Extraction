/**
 * Mineshaft Capital v2 rate engine. Pure ES modules: no I/O, no DOM, no Math.random, no Date.now.
 *
 * Contract API (game/DESIGN.md):
 *   ENGINE_VERSION
 *   newColony({ id, uid, name, species, planet, siteRegion, now, grant }) -> colony   (grant: coin number or { coin })
 *   advance(colony, world, now) -> { colony, events, sales }       sales: [{ oreId, amount }] for recordSales
 *   applyCommand(colony, world, cmd, now) -> { colony, events, sales, error? }
 *   quote(colony, world, cmd) -> { cost, effect, canAfford, n, error? }
 *   rates(colony, world) -> { orePerMin, minePerMin, liftPerMin, conveyorPerMin, conveyorPerPad, shipPerMin,
 *                             throughput, coinPerMin, valuePerOre, yardLoss, yardCap, tunnelCap, idleMiners, pads,
 *                             shafts: [{ id, name, ore, miners, cap, orePerMin, perMiner, ok, reason, vein }],
 *                             ships: [{ id, name, cls, cap, dest, tripSecs, perMin, cycleSecs }] }
 *   bottleneck(colony, world) -> { stage, wastedPerMin, wastedOrePerMin, message, suggestion: { cmd, cost, label, gainPerMin, canAfford } }
 *       stage: 'mine' | 'lift' | 'yard' | 'conveyor' | 'ships' | 'idle' | 'blocked'
 *   destinations(colony, world, shipClass) -> [{ id, name, distance, price: { oreId: n }, tripSecs, coinPerMin, best }]
 *   marketPrice(world, oreId, destId, now) -> number
 *   recordSales(world, sales, now) -> world
 *   unlocks(colony, world, now) -> { panels, licenses, tutorial: { step, id, hint }, next: { panel, license }, day }
 *
 * Extra exports: catchUpGrant(world, now), bestMoves(colony, world, { cmds?, limit }), candidateMoves,
 *   marketTable(world, now), fmt(n), PANELS, TUTORIAL, TUNING.
 *
 * Commands ({ type, ...args }; n = 1 | 10 | 100 | 'max' where noted):
 *   hire {n} · buyShaft · redrill {shaftId} (exhausted veins only) · upgradeShaft {shaftId, kind:'cart'|'bunk', n}
 *   upgradeLift {n} · upgradeConveyor {n} · upgradeYard {n} · buyPad {n} · upgradeDrill
 *   buyShip {cls:'hauler'|'cruiser'|'freighter'} · upgradeShip {shipId, n} · setRoute {shipId, policy:'best'|'nearest'|'fixed', destId?}
 *   rename {target:'colony'|'shaft'|'ship', id, name} · tutorial {step}
 *
 * Panels: mine, hire, shafts, carts, lift, ships, bunks, conveyor, yard, drill, routes, fleet, pads, market.
 * Licenses (day of month AND coin earned+grant): cruiser, freighter, mythicDrill.
 *
 * Colony (plain JSON):
 *   { v, id, uid, name, species, siteRegion, planetId, seed, rng, t, born,
 *     coin, earned, grant, miners, idle, drill, lift, conveyor, yardLvl, pads,
 *     tunnel: { oreId: amt }, yard: { oreId: amt },
 *     shafts: [{ id, idx, name, ore, vein: null | { total, left, warn }, up: { bunk, cart }, miners }],
 *     ships: [{ id, name, cls, lvl, policy, destId, state: 'home'|'loading'|'out'|'back', cargo: { oreId: amt },
 *               dest, readyAt, dockedAt, firstLoadAt, departAt, arriveAt, homeAt }],
 *     stats: { mined, lifted, loaded, sold, sales, launches, upgrades, spent, firstSaleAt },
 *     unlocked: { panels, licenses }, tutorial, nextId }
 * Event types: sale, sales (summary with data.ore/coin), salesSummary, launch, vein20, vein5, veinOut, buy, unlock, license.
 */
export { ENGINE_VERSION, newColony, applyCommand, quote, catchUpGrant } from './commands.js';
export { advance } from './sim.js';
export { rates, bottleneck, destinations, marketPrice, recordSales, bestMoves, candidateMoves, marketTable } from './analysis.js';
export { unlocks, PANELS, TUTORIAL } from './unlocks.js';
export { fmt } from './util.js';
export { T as TUNING } from './tuning.js';
