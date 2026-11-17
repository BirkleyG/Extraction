// Guild game balance. All numbers live here. Rates are per hour, distances in map units (the planet is 1000 x 1000),
// times in hours unless named *Ms. Tune with `node game/test/guild-pacing.mjs`.
//
// Guild 2: operations are made of parts you buy and watch (no waiting on upgrades: only travel takes time),
// staffed by workers you ship in. Territory is open; founding far from your hubs costs more and takes longer.

export const G = {
  startCoin: 6_000,
  stepMs: 60_000,                 // advance() integrates whole minutes on the absolute minute grid
  maxSites: 40,

  // Founding an operation: crews and supplies fly in from your nearest hub or air station.
  build: {
    mine:     { cost: 3_500,  upkeep: 10, label: 'Mine' },
    refinery: { cost: 8_000,  upkeep: 25, label: 'Refinery' },
    air:      { cost: 5_000,  upkeep: 15, label: 'Air station' },
    lab:      { cost: 6_000,  upkeep: 15, label: 'Research hub' },
  },
  far: { free: 40, per: 220, speed: 260, setup: 0.25 }, // cost x (1 + (d - free)/per); arrival in setup + d/speed hours
  siteGap: 18,                    // between your own operations
  rivalGap: 30,                   // from other guilds' operations
  hubUpkeep: 20,

  // Parts. Each has a starting level, a max, a price ladder (base x growth^level owned) and crew per level.
  parts: {
    hub: {
      bunks:   { label: 'Bunks', start: 1, max: 10, base: 900, growth: 1.7, text: 'Room for spare workers at the hub.' },
      shuttle: { label: 'Shuttle pad', start: 1, max: 8, base: 1_400, growth: 1.8, text: 'Bigger, faster worker shuttles.' },
      hangar:  { label: 'Hangar', start: 1, max: 10, base: 1_600, growth: 1.65, text: 'Room for more ships.' },
      office:  { label: 'Office', start: 1, max: 8, base: 2_000, growth: 1.9, crew: 2, text: 'Clerks who produce research (and memos).' },
      radar:   { label: 'Drone radar', start: 0, max: 4, base: 2_500, growth: 2.2, text: 'One more survey drone per level.' },
    },
    mine: {
      shaft:  { label: 'Shafts', start: 1, max: 8, base: 2_600, growth: 1.75, crew: 6, text: 'Each shaft digs another face. Needs a crew.' },
      rig:    { label: 'Drill rigs', start: 0, max: 12, base: 1_500, growth: 1.55, text: 'Every crew digs faster.' },
      haul:   { label: 'Carts & lift', start: 1, max: 14, base: 1_000, growth: 1.5, text: 'How much rock comes up the lift.' },
      yard:   { label: 'Ore yard', start: 1, max: 10, base: 700, growth: 1.6, text: 'Room for ore waiting for ships.' },
      safety: { label: 'Lights & supports', start: 0, max: 8, base: 900, growth: 1.7, text: 'Fewer accidents, fewer funerals.' },
      bunk:   { label: 'Bunkhouse', start: 0, max: 8, base: 800, growth: 1.6, text: 'Happier miners. Slightly.' },
    },
    refinery: {
      pad:      { label: 'Landing pads', start: 1, max: 6, base: 1_600, growth: 1.8, text: 'Ships unload faster.' },
      silo:     { label: 'Silos', start: 1, max: 10, base: 900, growth: 1.6, text: 'Raw ore waiting to be refined.' },
      belt:     { label: 'Conveyors', start: 1, max: 14, base: 1_100, growth: 1.5, text: 'How fast ore reaches the vats.' },
      vat:      { label: 'Vats', start: 1, max: 10, base: 3_200, growth: 1.7, crew: 4, text: 'Each vat refines more. Needs a crew.' },
      purifier: { label: 'Purifier', start: 0, max: 6, base: 4_000, growth: 2, text: 'Better yield from the same ore.' },
    },
    air: {
      hangar: { label: 'Hangars', start: 1, max: 8, base: 1_400, growth: 1.7, text: 'Room for more ships.' },
      depot:  { label: 'Fuel depot', start: 1, max: 6, base: 1_200, growth: 1.8, crew: 2, text: 'Faster refuelling on long routes.' },
    },
    lab: {
      desk:  { label: 'Research desks', start: 1, max: 10, base: 1_800, growth: 1.65, crew: 3, text: 'More scientists, more research.' },
      gear:  { label: 'Equipment', start: 0, max: 8, base: 2_400, growth: 1.85, text: 'Every desk thinks faster.' },
    },
    exchange: {
      docks:  { label: 'Cargo docks', start: 1, max: 6, base: 20_000, growth: 1.9, text: 'Store more refined goods in orbit.' },
      floor:  { label: 'Trading floor', start: 1, max: 6, base: 18_000, growth: 1.9, crew: 4, text: 'Buyers call more often.' },
      lounge: { label: 'VIP lounge', start: 0, max: 5, base: 25_000, growth: 2, text: 'Buyers open with better offers.' },
      desk:   { label: 'Spot desk', start: 0, max: 5, base: 15_000, growth: 1.9, text: 'Better prices on the spot market.' },
    },
  },
  // What the parts do.
  hub: { bunks: 20, bunksPer: 20, shuttleSize: 10, shuttlePer: 10, shuttleHours: 0.6, shuttleFaster: 0.85, hangar: 6, hangarPer: 3, rpPerClerk: 1.2, drones: 1 },
  mine: {
    perShaft: 30,                 // t/h of rock per fully staffed shaft
    rig: 0.22,                    // +22% dig speed per rig level
    haul: 38, haulGrowth: 1.36,   // t/h the lift can raise at level 1, x growth per level
    yard: 160, yardGrowth: 1.6,
    safety: 0.75,                 // incidents and deaths x0.75 per level
    bunk: 6,                      // +6 morale target per level
    share: { common: 1, rare: 0.12, mythic: 0.025 }, // how much of the rock is that ore at richness 1
    focus: 2.5, unfocused: 0.6,
    reserve: { rare: 4_500, mythic: 700 },  // tonnes in the ground at richness 1 x vein size; commons never run out
    taper: 0.2, scraps: 0.15,          // a dug-out vein still gives 15% (leftovers in the walls)
    drill: 4,                     // starting drill: cuts ores up to this hardness
    blast: { hours: 1.2, cooldown: 3, cave: 0.3, morale: -10 }, // a blast adds this many hours of digging at once
  },
  refinery: {
    pad: 90, silo: 320, siloGrowth: 1.7, belt: 55, beltGrowth: 1.35, vat: 42, purifier: 0.04,
    yield: 0.9, buyPct: 0.4, buyMin: 0.15, buyMax: 0.9,
  },
  air: { hangar: 3, depot: 0.7 },
  lab: { rpPerDesk: 5, gear: 0.2 },
  exchange: {
    day: 5, cost: 45_000, hours: 2, upkeep: 120,
    store: 3_000, storeGrowth: 1.7,
    offerEvery: 5, floorFaster: 0.8, lounge: 0.03, spot: 0.82, deskPer: 0.02,
    maxOpen: 3, offerLife: 14,
  },
  guildExchange: 0.55,
  npcCut: [0.6, 0.7],
  npcCount: 5,

  // Shift orders: output, morale drift per hour, death rate multiplier. Refineries use the same orders.
  shifts: {
    relaxed:  { out: 0.75, morale: 8, deaths: 0.4, label: 'Relaxed', text: 'Long lunches. Morale climbs.' },
    normal:   { out: 1, morale: 0, deaths: 1, label: 'Normal', text: 'Business as usual.' },
    overtime: { out: 1.3, morale: -6, deaths: 2.2, label: 'Overtime', text: 'More now, tired crews later.' },
  },
  morale: { base: 60, drift: 4, outLo: 0.8, outHi: 1.15, strike: 15 }, // drift toward target per hour on Normal

  // Workers: shipped in from off-planet, they die, the labor pool replaces them.
  labor: { price: 80, wage: 1.8, deathRate: 0.004, startPool: 4, reserve: 6, floor: 400, credit: 3_000 },
  incident: { perHour: 0.005, trapped: [3, 9], rescue: 70, halt: [2, 6], expire: 1 }, // per shaft per hour; rescue cost per trapped worker

  // Prospector camps (computer-run mines) sell ore at their gate; Guild freight jobs pay haulers per tonne.
  camps: { count: 6, rate: 45, gate: 0.22 },
  jobs: { open: 4, every: 4, qty: [80, 400], pay: 0.12, perUnit: 0.03, hours: [18, 48] },
  gate: { pct: 0.25, min: 0.1, max: 0.6 },

  ships: {
    hauler:    { cap: 40,  speed: 220, range: 320, cost: 1_200,  upkeep: 10, label: 'Hauler' },
    clipper:   { cap: 16,  speed: 520, range: 460, cost: 3_800,  upkeep: 20, label: 'Clipper' },
    leviathan: { cap: 260, speed: 130, range: 210, cost: 22_000, upkeep: 60, label: 'Leviathan', tech: 'o4' },
  },
  shipGrowth: 1.12,
  dockHours: 0.35,
  refuelHours: 0.12,

  drone: { speed: 300, scanHours: 0.5, cost: 150, perUnit: 0.6 },

  // Galactic market (market.js).
  market: {
    priceScale: 10,
    target: { common: 90_000, rare: 150, mythic: 5 },
    share: { common: 0.012, rare: 0.14, mythic: 0.5 },
    eta: { common: 3, rare: 0.9, mythic: 0.45 },
    sigma0: 0.5, sigma1: 1.3, matShare: 0.3,
    flowHalfLife: 6,
    lo: 0.04, hi: 25,
  },
  contract: { days: [2, 5], open: [0.78, 0.92], over: [1.04, 1.28], penalty: 0.35, sizeHours: [10, 30] },

  // Prestige.
  nukeMin: 250_000,
  spectacle: (runEarned, lvl = 0) => 10 * Math.sqrt(Math.max(0, runEarned) / 250_000) * (1 + 0.1 * lvl),
  evo: {
    extraction: { per: 0.15, cost: 3, growth: 2.2, label: 'Extraction', text: 'Mines produce more' },
    logistics:  { per: 0.15, cost: 3, growth: 2.2, label: 'Logistics', text: 'Ships fly faster' },
    trade:      { per: 0.08, cost: 3, growth: 2.2, label: 'Trade', text: 'Every sale pays more' },
    spectacle:  { per: 0.1,  cost: 4, growth: 2.2, label: 'Spectacle', text: 'Bigger next nuke' },
  },
  evoMax: 30,
};
