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
  redrillFrac: 0.6,                           // re-drill an exhausted vein: 60% of a new shaft at that depth

  // Veins (rare/mythic are finite)
  veinMythicK: 0.5,                                  // mythic veins are half as deep
  veinHours: 10,                                     // a vein lasts ~10h at a half-upgraded shaft
  veinWarn: [0.2, 0.05],

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
  // Evolutions (bought with SP, last the month). Effect compounds: (1 + per)^level.
  evo: {
    mine:      { per: 0.20, cost: 2, growth: 1.55, label: 'Mine speed' },
    ship:      { per: 0.12, cost: 2, growth: 1.55, label: 'Ship speed' },
    sell:      { per: 0.08, cost: 2, growth: 1.55, label: 'Sale price' },
    spectacle: { per: 0.10, cost: 3, growth: 1.7,  label: 'Spectacle' },  // additive: x(1 + per*level)
  },
  evoMax: 60,
};

export const geoSum = (base, g, from, k) => base * Math.pow(g, from) * (Math.pow(g, k) - 1) / (g - 1);
export const geoMax = (base, g, from, coin) => {
  const first = base * Math.pow(g, from);
  if (!(coin >= first)) return 0;
  return Math.max(0, Math.floor(Math.log(1 + coin * (g - 1) / first) / Math.log(g) + 1e-9));
};
