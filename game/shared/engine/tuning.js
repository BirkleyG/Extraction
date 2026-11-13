// All balance numbers live here. Tune with `node game/test/pacing.mjs`.
// Rates are per minute, times in seconds unless named *Ms.

export const T = {
  startCoin: 40,                // enough for a few miners right away
  gridMs: 60_000, // advance() never integrates across a minute boundary in one piece

  // Miners
  minePerMiner: 10,          // ore/min per miner, before carts
  hireBase: 10, hireGrowth: 1.02,

  // Shafts (index = depth)
  maxShafts: 30,
  shaftBase: 60, shaftGrowth: 2.25,
  bunkCap0: 3, bunkCapPer: 1,                 // miners per shaft = 3 + bunk
  bunkBase: 60, bunkGrowth: 2.08,
  cartBase: 25, cartGrowth: 1.83, cartAdd: 0.3,  // ore per miner +30% of base per level
  upMax0: 10, upMaxPerDepth: 1,              // carts/bunks per shaft max out at 10 + depth
  depthCost: 1.66,                            // per-shaft upgrade price x1.66 per depth
  richness: 1.25,                             // ore per miner x1.25 per depth
  grade: 1.05,                                // ore value x1.05 per depth (deeper ore is purer)
  shaftBuffer: 40,                            // tunnel storage per shaft (ore)

  // Tunnels and ore pockets (pockets.js). Lengths in metres.
  pk: {
    minPerM: 2.5,          // minutes a full crew needs per metre at the lift (ore per metre scales with the crew)
    haulM: 60,             // every 60 m of tunnel adds another minPerM per metre: the haul back gets longer
    wall: 0.6,             // a face stuck at a too-hard pocket: crews scrape common ore off the walls at 60%
    first: [1.5, 3],       // a new shaft's first pocket starts this far in
    homeFirst: [20, 30],   // the home shaft's first pocket (after the drill is affordable)
    len: [2.5, 5],         // pocket length at depth 0 ...
    lenDepth: 0.08,        // ... x(1 + 0.08 x depth)
    share: [0.35, 0.03, 0.7], // share of the tunnel inside pockets: base + per depth, capped
    mythicLen: 0.5,        // mythic pockets are half as long
    mythicW: 0.5,          // and half as likely as a rare of the same weight
    ahead: 3,              // pockets rolled ahead of the face (the mine view draws them)
  },

  // Drill: level >= hardness to mine. Level 6 = mythic drill (license).
  drillCosts: [0, 0, 1_700, 38_000, 940_000, 19_000_000, 130_000_000], // cost to reach level i
  drillMax: 6,

  // Lift, conveyor, yard, pads
  milestoneEvery: 40,                         // lift, conveyors and ship cargo double every 40 levels
  liftBase: 25, liftMult: 1.19, liftCost: 25, liftGrowth: 1.46,
  convBase: 60, convMult: 1.19, convCost: 35, convGrowth: 1.46,  // per pad
  yardBase: 120, yardMult: 1.35, yardCost: 50, yardGrowth: 1.42,
  padMax: 8, padCost: 2_500, padGrowth: 9,

  // Ships
  maxShips: 20,
  ship: {
    // upk: upgrade price per unit of cargo (fast ships cost more per crate)
    hauler:    { cap: 40,  speed: 1,    cost: 400,    upk: 1,   label: 'Hauler' },
    cruiser:   { cap: 16,  speed: 2.2,  cost: 3_000,  upk: 1.8, label: 'Cruiser' },
    freighter: { cap: 180, speed: 0.55, cost: 60_000, upk: 0.6, label: 'Freighter' },
  },
  shipFleetGrowth: 2.6,                 // each extra ship costs 2.6x
  shipCapMult: 1.25, shipUpCost: 0.8, shipUpGrowth: 1.43, // upgrade base = 0.8 coin per crate x upk
  shipJoinLevel: 0.8,                   // new ships arrive at 80% of your best ship's level
  maxLoadSecs: 40,                      // a ship leaves this long after its first ore even if not full
  tripSecs: { near: 15, mid: 35, far: 70 },  // one way, speed 1

  // Ore values when the planet gives none
  value: { common: 1, rare: 1.7, mythic: 40 },
  valueHard: { common: 1.5, rare: 1.35, mythic: 1.2 }, // x per hardness step above 1

  // Market
  depth: { common: 1e12, rare: 1e9, mythic: 3e7 }, // ore volume that cuts the index by 1/e
  halfLifeMs: 3 * 3600_000,
  indexFloor: 0.15,

  // Licenses: open on day >= day AND earned (+grant) >= coin
  licenses: {
    cruiser:     { day: 1, coin: 6_000,     label: 'Cruiser license' },
    freighter:   { day: 2, coin: 150_000,   label: 'Freighter license' },
    mythicDrill: { day: 3, coin: 3_000_000, label: 'Mythic drill license' },
    refinery:    { day: 4, coin: 20_000_000, label: 'Refinery license' },
  },

  // Refineries (refinery.js). thru = raw ore/min, storage = refined units, costs in coin.
  // A refined unit is worth valueMult x the raw ore's base value; output = raw grade units x yield.
  // Party demand (units/min) = demand x growth(day) x wants x (ask/ref)^-sigma x demandScale x tierDemand,
  // zero above ref x cap. growth(day) = day^growthPow (day 1 = 1).
  ref: {
    valueMult: 4,
    computer: 0.6,              // no parties: a computer buyer takes everything at 0.6x base value
    tripSecs: 12,               // one way to the orbital refinery at speed 1
    growthPow: 1.3,
    demandScale: 0.25,
    tierDemand: { common: 1, rare: 0.5, mythic: 0.1 },
    markupMin: 0.5, markupMax: 3,
    planet:  { cost: 1_500_000,  thru: 4_000,  yield: 1,    storage: 60_000,  label: 'On-planet refinery' },
    orbital: { cost: 40_000_000, thru: 15_000, yield: 1.25, storage: 300_000, docks: 2, label: 'Orbital refinery' },
    // upgrade cost = build cost x base x growth^level
    up: {
      throughput: { base: 0.2,  growth: 1.5, mult: 1.25, max: 200 },
      yield:      { base: 0.5,  growth: 2.6, add: 0.1, max: 15 },
      storage:    { base: 0.08, growth: 1.45, mult: 1.5, max: 200 },
      docks:      { base: 0.25, growth: 2.4, add: 1, max: 10 },
    },
  },

  // World changes (Maker deals, galactic events): combined price multiplier is clamped.
  changeMin: 0.2, changeMax: 5,

  // Hazards. Rates are per hour; danger of a shaft = its depth index (the home shaft is safe).
  // Each safety level halves the matching risk (x hz.cut per level).
  hz: {
    calmMs: 30 * 60_000,           // no hazards in a colony's first 30 minutes
    cut: 0.5,
    cave: 0.0016,                  // cave-ins per hour per depth (supports)
    mad: 0.0012,                   // insanity per hour per depth, shafts with miners (lights)
    gas: 0.0005, flood: 0.0004, fire: 0.0003, // per hour per total depth (ventilation, pumps, firebreaks)
    quake: 0.00012,                // per hour per total depth, softened by supports
    caveHalt: [25, 60], madHalt: [5, 12], gasHalt: [10, 20], floodHalt: [20, 40], quakeHalt: [10, 25], // minutes
    fireBurn: [0.15, 0.35],        // share of the surface yard that burns
    rescue: 0.45,                  // chance a cave-in's trapped miners are all dug out
  },
  shaftSafeBase: 120, shaftSafeGrowth: 3.2, shaftSafeMax: 6,  // lights/supports, x depthCost per depth
  safetyBase: 1_500, safetyGrowth: 3.4, safetyMax: 12,           // ventilation, pumps, firebreaks (colony-wide)

  // Prestige
  nukeMin: 20_000_000,            // runEarned needed to nuke
  spectaclePow: 1 / 7.5,
  prestigePanelAt: 5_000_000,
  // Evolutions (bought with SP, last the month). Effect per level is additive: x(1 + per * level).
  // Steep costs: the first levels are cheap and big, later ones are a long-term bet.
  evo: {
    mine:      { per: 0.20, cost: 2.5, growth: 3, label: 'Mine speed' },   // miners and the lift
    ship:      { per: 0.15, cost: 2.5, growth: 3, label: 'Ship speed' },
    sell:      { per: 0.15, cost: 2.5, growth: 3, label: 'Sale price' },
    spectacle: { per: 0.10, cost: 3, growth: 3, label: 'Spectacle' },
  },
  evoMax: 60,
};

export const geoSum = (base, g, from, k) => base * Math.pow(g, from) * (Math.pow(g, k) - 1) / (g - 1);
export const geoMax = (base, g, from, coin) => {
  const first = base * Math.pow(g, from);
  if (!(coin >= first)) return 0;
  return Math.max(0, Math.floor(Math.log(1 + coin * (g - 1) / first) / Math.log(g) + 1e-9));
};
