// All balance numbers live here. Tune with `node game/test/pacing.mjs`.
// Rates are per minute, times in seconds unless named *Ms.

export const T = {
  startCoin: 40,                // enough for a few miners right away
  gridMs: 60_000, // advance() never integrates across a minute boundary in one piece

  // Shafts are categories (AdVenture-Capitalist style). Shaft idx (0 = the free first shaft) scales everything in it.
  maxShafts: 30,
  startMiners: 3,                // the free first shaft starts with a few miners
  minePerMiner: 10,              // ore/min per miner at gear 1, shaft 1
  shaftScale: 6.8,               // miners, gear and cart cost x6.8 per shaft index (a shaft's ladder is as pricey as it is rich)
  richness: 1.9,                 // ore per miner x1.9 per shaft index ("depth richness")
  grade: 3.8,                    // ore value x3.8 per shaft index (deeper ore is purer; market volume is unaffected)
  hire: { base: 20, growth: 1.11, max: 100 },          // miner n costs base x shaftScale^idx x growth^n
  // Gear: level 1.. (mining speed). Level >= hardness cuts that ore. Above `free` needs the mythicDrill license.
  gear: { base: 60, growth: 1.25, add: 0.5, max: 300, free: 8, hardMax: 10 },
  // Cart: ore/min the cart hauls from the face to the shaft entrance. A shaft makes at most this much.
  cart: { base: 90, growth: 1.25, add: 0.5, rate: 60, max: 300 },
  // Gear and cart double at these levels (milestones), on top of their per-level gain.
  milestones: [25, 50, 100, 200, 300],
  shaftBase: 1_200_000, shaftGrowth: 10,   // shaft idx (>= 1) costs base x growth^(idx-1)
  depthBands: [3, 7, 12],             // shaft index where middle, deep and deepest begin
  bands: ['shallow', 'middle', 'deep', 'deepest'],
  shaftBuffer: 40,                    // tunnel storage per shaft (ore)

  // Tunnels and ore pockets (pockets.js). A metre = a minute of a reference crew's output at that shaft.
  pk: {
    refOre: 2700,           // reference crew ore/min at shaft 1 (x richness per index): sets how long a vein lasts for a median player
    minPerM: 1,            // minutes of reference output per metre
    share: [0.04, 0.22, 0.32, 0.42], // share of the tunnel inside veins by band (x richness factor of the site)
    shareMax: 0.7,
    hours: [6, 8],         // vein length (hours at the reference pace) = 6 x 8^u x size, clamped to hoursMin..hoursMax
    hoursMin: 4, hoursMax: 48,
    meanHours: 14,         // average vein, for spacing
    mythicLen: 0.5,        // mythic veins are half as long
    mythicW: 0.5,          // and half as likely as a rare of the same weight
    wall: 0.6,             // a face stuck at a too-hard vein: crews scrape common ore off the walls at 60%
    low: 0.8,              // "running low" event when 80% of the vein is mined (20% left)
    taperFrom: 0.95,       // below 5% left the rare share tapers linearly (5 equal steps), then back to common
    taperSteps: 5,
    ahead: 3,              // pockets rolled ahead of the face (the mine view draws them)
    tiltRange: [0.45, 1.55], // a direction option multiplies each ore's richness by something in this range
  },
  danger: 5,                          // hazard danger doubles every 5 shafts

  // Lift, conveyor, yard, pads
  milestoneEvery: 40,                         // conveyors, ship cargo and lift speed/capacity double every 40 levels
  // Lift: throughput = buckets x capacity x trips/min, slowed by the depth of the deepest working shaft.
  lift: {
    speed:    { base: 2,  mult: 1.12, cost: 30,  growth: 1.42, max: 400, label: 'Lift speed' },     // trips per minute
    capacity: { base: 20, mult: 1.16, cost: 40,  growth: 1.5,  max: 400, label: 'Bucket capacity' }, // ore per bucket
    buckets:  { base: 1,  add: 1,    cost: 150, growth: 1.85, max: 60,  label: 'Buckets' },         // buckets running at once
    depthSlow: 0.03,                          // trips/min / (1 + 0.03 x deepest working shaft index)
  },
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
    demandScale: 0.03,
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
