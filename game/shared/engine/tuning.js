// All balance numbers live here. Tune with `node game/test/pacing.mjs`.
// Rates are per minute, times in seconds unless named *Ms.

export const T = {
  startCoin: 12,
  gridMs: 60_000, // advance() never integrates across a minute boundary in one piece

  // Miners
  minePerMiner: 10,          // ore/min per miner, before carts
  hireBase: 10, hireGrowth: 1.03,

  // Shafts (index = depth)
  maxShafts: 30,
  shaftBase: 60, shaftGrowth: 2.3,
  bunkCap0: 3, bunkCapPer: 2,                 // miners per shaft = 3 + 2*bunk
  bunkBase: 60, bunkGrowth: 1.75,
  cartBase: 40, cartGrowth: 1.6, cartMult: 1.25,  // ore per miner x1.25 per level
  upMax0: 10, upMaxPerDepth: 1,              // carts/bunks per shaft max out at 10 + depth
  depthCost: 1.6,                             // per-shaft upgrade price x1.6 per depth
  richness: 1.15,                            // ore per miner x1.15 per depth
  shaftBuffer: 40,                            // tunnel storage per shaft (ore)
  redrillFrac: 0.6,                           // re-drill an exhausted vein: 60% of a new shaft at that depth

  // Veins (rare/mythic are finite)
  veinRare: 6000, veinMythic: 2000, veinGrowth: 1.42, // amount x1.42 per depth
  veinHours: 8,                                      // re-drilled veins last >= 8h at full staffing
  veinWarn: [0.2, 0.05],

  // Drill: level >= hardness to mine. Level 6 = mythic drill (license).
  drillCosts: [0, 0, 400, 9_000, 220_000, 4_500_000, 30_000_000], // cost to reach level i
  drillMax: 6,

  // Lift, conveyor, yard, pads
  liftBase: 25, liftMult: 1.2, liftCost: 45, liftGrowth: 1.32,
  convBase: 40, convMult: 1.2, convCost: 70, convGrowth: 1.32,  // per pad
  yardBase: 120, yardMult: 1.35, yardCost: 50, yardGrowth: 1.42,
  padMax: 8, padCost: 2_500, padGrowth: 9,

  // Ships
  maxShips: 20,
  ship: {
    hauler:    { cap: 40,  speed: 1,    cost: 400,   label: 'Hauler' },
    cruiser:   { cap: 14,  speed: 2.1,  cost: 3_000, label: 'Cruiser' },
    freighter: { cap: 160, speed: 0.55, cost: 60_000, label: 'Freighter' },
  },
  shipFleetGrowth: 2.6,                 // each extra ship costs 2.6x
  shipCapMult: 1.25, shipUpCost: 0.5, shipUpGrowth: 1.4, // upgrade base = 0.5 x class cost
  maxLoadSecs: 40,                      // a ship leaves this long after its first ore even if not full
  tripSecs: { near: 15, mid: 35, far: 70 },  // one way, speed 1

  // Ore values when the planet gives none
  value: { common: 1, rare: 9, mythic: 260 },
  valueHard: { common: 1.5, rare: 1.45, mythic: 1.2 }, // x per hardness step above 1

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
};

export const geoSum = (base, g, from, k) => base * Math.pow(g, from) * (Math.pow(g, k) - 1) / (g - 1);
export const geoMax = (base, g, from, coin) => {
  const first = base * Math.pow(g, from);
  if (!(coin >= first)) return 0;
  return Math.max(0, Math.floor(Math.log(1 + coin * (g - 1) / first) / Math.log(g) + 1e-9));
};
