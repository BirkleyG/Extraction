/**
 * Mineshaft Capital v2 rate engine. Pure ES modules: no I/O, no DOM, no Math.random, no Date.now.
 *
 * Contract API (game/DESIGN.md):
 *   ENGINE_VERSION

 *   newColony({ id, uid, name, species, planet, siteRegion, site, now, grant }) -> colony   (grant: coin number or { coin })
 *   advance(colony, world, now) -> { colony, events, sales }       sales: [{ oreId, amount }] for recordSales
 *   applyCommand(colony, world, cmd, now) -> { colony, events, sales, error? }
 *   quote(colony, world, cmd) -> { cost, effect, canAfford, n, error?, currency?: 'sp', spectacle? }   (evolve costs SP)
 *   rates(colony, world) -> { orePerMin, minePerMin, liftPerMin, conveyorPerMin, conveyorPerPad, shipPerMin,
 *                             throughput, coinPerMin, valuePerOre, yardLoss, yardCap, tunnelCap, idleMiners, pads,
 *                             shafts: [{ id, name, ore (= oreId, mined now), idx, dir, band, miners, gear, cart, cap (cart haul rate), crew, limit ('miners'|'cart'), orePerMin, perMiner, ok, reason,
 *                                        face (m), metresPerMin, dug (pockets dug out), pocket: null | { ore, left, len } (m),
 *                                        next: null | { ore, at (m ahead), blocked }, blocked, need (drill level), wallRate,
 *                                        risk (mishaps/hour, 0..1), haltMins, lights, supports }],
 *                             ships: [{ id, name, cls, cap, dest, tripSecs, perMin, cycleSecs }],
 *                             hazards: { perHour, loss (share of output), lossPerMin, colony: { gas, flood, fire, quake } },
 *                             evo: { mine, ship, sell } (multipliers),
 *                             refinery: { [site: 'planet'|'orbital']: { inPerMin (raw), outPerMin, soldPerMin, coinPerMin, stock, cap, full,
 *                                         throughput, yield, docks?, hold? (orbital raw hold),
 *                                         byOre: { [oreId]: { on, ask, inPerMin, soldPerMin, coinPerMin, stock, vsRaw } } } } }
 *       coinPerMin includes refined sales; score values refineries (steady state) for bestMoves.
 *       vsRaw = coin per raw ore from refining (at what sells now) / coin per raw ore sold raw - 1 (0.38 = "+38% vs selling raw").
 *       Ships flying to the orbital refinery show dest REF_DEST ('@refinery').
 *   bottleneck(colony, world) -> { stage, wastedPerMin, wastedOrePerMin, message }   (a diagnosis only: no recommended buys)
 *       stage: 'mine' | 'lift' | 'yard' | 'conveyor' | 'ships' | 'cart' | 'blocked' | 'safety'
 *   destinations(colony, world, shipClass) -> [{ id, name, distance, price: { oreId: n }, tripSecs, coinPerMin, best }]
 *   marketPrice(world, oreId, destId, now) -> number   (includes active world.changes; not the colony's sell evolution)
 *   activeChanges(world, now) -> changes in effect (at <= now < until; missing at/until = open-ended)
 *   priceMult(world, oreId, buyerId, now) -> combined change multiplier, clamped to [0.2, 5]
 *       demand: x mult for that ore · supply: / mult for that ore · global: x mult · buyer: x mult at that buyer
 *   recordSales(world, sales, now) -> world
 *   unlocks(colony, world, now) -> { panels, licenses, tutorial: { step, id, hint }, next: { panel, license }, day }
 *
 * Balance numbers live in tuning.js (exported as TUNING); tune with `node game/test/pacing.mjs`.
 * Extra exports: catchUpGrant(world, now), bestMoves(colony, world, { cmds?, limit }), candidateMoves,
 *   marketTable(world, now), fmt(n), PANELS, TUTORIAL, TUNING, spectacleOf(colony, runEarned), evoMult(colony, kind),
 *   demandAt(world, colony, oreId, ask, now) -> refined units/min the parties buy at that ask (Infinity with no parties;
 *     hidden: tests and future intel only), demandGrowth(world, t), REF_DEST, LEDGER_IN, LEDGER_OUT.
 *
 * Commands ({ type, ...args }; n = 1 | 10 | 100 | 'max' where noted):
 *   Shafts (Phase 3.5): hireMiners {shaftId, n} · upgradeGear {shaftId, n} (gear above 8 needs the mythicDrill license) ·
 *     upgradeCart {shaftId, n} · buyShaft {dir:'left'|'right'} (see shaftOptions) · upgradeLift {kind:'speed'|'capacity'|'buckets', n}
 *   upgradeConveyor {n} · upgradeYard {n} · buyPad {n}
 *   buyShip {cls:'hauler'|'cruiser'|'freighter'} · upgradeShip {shipId, n} · setRoute {shipId, policy:'best'|'nearest'|'fixed', destId?}
 *   rename {target:'colony'|'shaft'|'ship', id, name} · tutorial {step} · autoSpend {keep?: 0..0.9}
 *   Safety: upgradeShaft {shaftId, kind:'lights'|'supports', n} (not the first shaft) · upgradeSafety {kind:'ventilation'|'pumps'|'firebreaks', n}
 *   Prestige: nuke {confirm:'NUKE'} (runEarned >= TUNING.nukeMin) · evolve {kind:'mine'|'ship'|'sell'|'spectacle', n} (costs SP)
 *   Refinery (license + panel 'refinery'): buildRefinery {site:'planet'|'orbital'} · upgradeRefinery {site, kind:'throughput'|'yield'|'storage'|'docks', n}
 *     (docks: orbital only) · setRefine {site, oreId, on?: bool, markup?: 0.5..3} (free) · setRoute {shipId, policy:'refinery'} (needs the orbital)
 *
 * Panels: mine, hire, drill (gear), carts, lift, shafts, ships, conveyor, yard, routes, fleet, pads, market,
 *   safety (a shaft at depth index >= 3, or the first mishap), prestige (runEarned >= 5M, or after a nuke).
 *   refinery (opens with the refinery license).
 * Licenses (day of month AND coin earned+grant): cruiser, freighter, mythicDrill, refinery (day 4, 20M).
 *
 * Colony (plain JSON):
 *   { v, id, uid, name, species, siteRegion, planetId, seed, rng, t, born,
 *     coin, earned, grant, runEarned (since the last nuke, grant excluded), monthEarned (all runs),
 *     sp, evo: { mine, ship, sell, spectacle }, nukes, lastNuke: null | { at, spectacle, runEarned, makerUsed },
 *     safety: { ventilation, pumps, firebreaks }, hz: { gas, flood, fire, quake }, hzRng,   (hz = hazard clocks, see hazards.js)
 *     site: { id, regionId, soil, richness, veinSize, common }, miners (total of the shafts), lift: { speed, capacity, buckets }, conveyor, yardLvl, pads,
 *     tunnel: { oreId: amt }, tunnelG, yard: { oreId: amt }, yardG,   (…G = grade units: amount x depth grade; value = G x price)
 *     shafts: [{ id, idx, name, dir ('main'|'left'|'right'), band, seed, tilt, ore (mined now), face (m), pk: [{ ore, start, len, hit?, low?, blk? }] (veins rolled ahead), pkN, pkEnd, dug,
 *                gear, cart, up: { lights, supports }, miners (owned by the shaft, no transfers), haltUntil (ms or null), hz: { cave, mad } }],
 *     ships: [{ id, name, cls, lvl, policy, destId, state: 'home'|'loading'|'out'|'back', cargo: { oreId: amt }, cargoG,
 *               dest, readyAt, dockedAt, firstLoadAt, departAt, arriveAt, homeAt }],
 *     stats: { mined, lifted, loaded, sold, sales, launches, upgrades, spent, firstSaleAt, hazards, lost },
 *     unlocked: { panels, licenses }, tutorial, nextId,
 *     refinery: { planet: null | R, orbital: null | R }, refineMemo: { [site]: ores } (buy settings kept through a nuke),
 *       R = { site, lvl: { throughput, yield, storage, docks }, ores: { oreId: { on, markup } } (missing = on at 1.0),
 *             stock: { oreId: refined units }, raw/rawG: { oreId } (orbital raw hold), full },
 *     ledger: { month: { in: { raw, refined, nukeCargo, grant }, out: { miners, shafts, drill, lift, surface, ships, refinery, safety } },
 *               run: same, reset by a nuke } }   (coin change = in.raw + in.refined + in.grant - sum(out); nukeCargo never lands in coin)
 * Event types: autoSpend, sale, sales (summary with data.ore/coin), salesSummary, launch, buy, unlock, license,
 *   strike { shaftId, oreId, tier } (face broke into a pocket), pocketOut { shaftId, oreId }, blocked { shaftId, oreId, need },
 *   pocketSummary { count } (past 12 pocket events in one advance),
 *   hazard { kind: 'cavein'|'insanity'|'gas'|'flood'|'fire'|'quake', shaftId?, lost, haltMins, rescued?, burned? } (story text),
 *   hazardSummary { count, lost }, nuke { spectacle, runEarned, sp, paid }, evolve { kind, sp, n, level },
 *   refined { coin, ore: { oreId: units } } (summary per advance), refineryFull { site } (store filled: asks too high),
 *   deliver { shipId, raw, coin } (ship unloaded at the orbital; coin = overflow/unrefined ore sold at the nearest buyer), deliverSummary { count }.
 * Refineries (refinery.js): output = raw grade units x yield; one refined unit is worth TUNING.ref.valueMult x the ore's value
 *   x ask. Party k buys q_k = demand x growth(day) x wants[ore] x (ask/ref)^-sigma (0 above ref x cap) x demandScale x tierDemand,
 *   growth(day) = day^growthPow, scaled by world changes global / demand / supply / buyer (buyerId = party id). No parties: a
 *   computer buyer takes everything at TUNING.ref.computer x base. Sales = min(output + stock, demand); a full store holds intake
 *   to what sells. On-planet draws from the yard (before the conveyor) as the lift fills it; the orbital is fed by ships
 *   (policy 'refinery', or 'best' when it pays better and docks/hold have room). advance() integrates it exactly (step-invariant).
 *   A nuke removes refineries (their buy settings are remembered).
 *
 * Shafts (Phase 3.5): AdVenture-Capitalist categories. Shaft 1 is free (T.startMiners miners, gear 1, cart 1); buyShaft costs
 *   T.shaftBase x T.shaftGrowth^(idx-1) (x10 each) and starts with 0 miners. Miners, gear and cart belong to their shaft (no transfers);
 *   their prices scale T.shaftScale^idx and rise geometrically per level. Output = miners x 10 x gearMult(gear) x T.richness^idx / site soil,
 *   capped by the cart's haul rate; gear and cart double at levels 25/50/100/200/300. Ore value x T.grade^idx.
 *   shaftOptions(colony, world) -> exactly 2 options for the next shaft: [{ dir:'left'|'right', label, idx, band, seed, cost,
 *   prospects: { [oreId]: 'none'|'low'|'fair'|'good' } }]; each has its own seed and a hidden richness tilt per ore.
 *   Lift = buckets x capacity x trips/min (speed, / (1 + T.lift.depthSlow x deepest working shaft index)).
 *   Gear >= hardness cuts an ore (hardness 1-10; commons need none); gear above 8 needs the mythicDrill license; mythic = hardness 9-10.
 * Veins (pockets.js): each shaft digs sideways; its face (m) advances as ore is mined (a metre = a minute of a reference crew, T.pk.refOre).
 *   Bands by shaft index: shallow 0-2, middle 3-6, deep 7-11, deepest 12+. Veins { ore, start, len } are rolled from the shaft's seed,
 *   only from ores present at the site (rares: shallow rarely, middle and deeper more; mythic only deepest at a mythic site); odds
 *   and sizes grow with band and richness x veinSize x tilt. A rare vein lasts ~4 h to 2 days at the reference pace. Events: strike,
 *   veinLow (20% left), pocketOut (dug out). Below 5% left the output tapers linearly (5 steps), then back to the site's common.
 *   A vein harder than the shaft's gear stops the face (walls pay T.pk.wall of the rate).
 * Hazards: danger = idx x 2^(idx/5) (doubles every 5 shafts; the first shaft is safe); none in a colony's first 30 minutes (after a nuke too).
 *   Each hazard spends a seeded Exp(1) clock at its current rate, so advance() stays deterministic and step-invariant.
 *   Halted shafts dig nothing until haltUntil; mishaps never take the colony's last miner.
 * Prestige: nuke pays paid cargo on ships in flight at today's price, then resets to a starter mine and keeps
 *   sp, evo, nukes, monthEarned, lastNuke, name, species, siteRegion, grant and unlocked panels/licenses.
 *   Spectacle = runEarned^(1/7.5) x (1 + 0.1 x spectacle level). Evolutions: x(1 + per x level), costs in TUNING.evo.
 */
import { applyCommand as baseApply } from './commands.js';
import { autoSpend } from './autospend.js';
export { ENGINE_VERSION, newColony, quote, catchUpGrant, shaftOptions } from './commands.js';

// autoSpend {keep?} buys the best-value moves in order (keep = fraction of coin to hold back).
export function applyCommand(colony, world, cmd, now) {
  if (cmd && cmd.type === 'autoSpend') return autoSpend(colony, world, cmd, now);
  return baseApply(colony, world, cmd, now);
}
export { advance } from './sim.js';
export { rates, bottleneck, destinations, marketPrice, recordSales, bestMoves, candidateMoves, bestDir, marketTable, activeChanges, priceMult } from './analysis.js';
export { spectacleOf, evoMult } from './model.js';
export { unlocks, PANELS, TUTORIAL } from './unlocks.js';
export { fmt } from './util.js';
export { demandAt, growth as demandGrowth, REF_DEST } from './refinery.js';
export { LEDGER_IN, LEDGER_OUT } from './ledger.js';
export { T as TUNING } from './tuning.js';
