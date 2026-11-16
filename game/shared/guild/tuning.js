// Guild game balance. All numbers live here. Rates are per hour, distances in map units (the planet is 1000 x 1000),
// times in hours unless named *Ms. Tune with `node game/test/guild-pacing.mjs`.

export const G = {
  startCoin: 6_000,
  stepMs: 60_000,                 // advance() integrates whole minutes on the absolute minute grid
  maxSites: 40,

  // The command hub: airstrip, command center and the landing pit (a level-1 mine at the same spot).
  hub: {
    radius: [0, 170, 210, 260],   // claim radius by hub level: you may build within this of a hub or air station
    hangar: [0, 8, 16, 30],        // ships you can own (air stations add more)
    crews: [0, 2, 3, 4],          // constructions running at once
    rp: [0, 3, 5, 8],             // research points per hour from the command center
    upkeep: [0, 30, 60, 110],
    cost: [0, 0, 22_000, 90_000], // upgrade to this level
    hours: [0, 0, 6, 12],
  },

  // Operations you can found on the map.
  build: {
    mine:     { cost: 4_000,  hours: 3, upkeep: 15, label: 'Mine' },
    refinery: { cost: 9_000,  hours: 4, upkeep: 45, label: 'Refinery' },
    air:      { cost: 5_000,  hours: 2, upkeep: 25, label: 'Air station' },
    lab:      { cost: 7_000,  hours: 3, upkeep: 35, label: 'Research hub' },
  },
  siteGap: 24,                    // between your own sites
  rivalGap: 44,                   // from other guilds' sites

  // Mines: macro levels. Output per hour = cap x ore share x richness x focus x intensity x tech / soil.
  mine: {
    names: ['', 'Pit', 'Works', 'Complex', 'Megaworks', 'Planetary Wound'],
    cap: [0, 40, 90, 200, 420, 860],            // tonnes of rock an hour
    up: [0, 0, 6_000, 16_000, 42_000, 110_000], // cost to reach this level
    hours: [0, 0, 3, 5, 8, 12],
    upkeep: [0, 15, 32, 70, 150, 320],
    store: [0, 160, 320, 700, 1_400, 2_800],    // stockpile cap (t); production stops when it is full
    share: { common: 1, rare: 0.12, mythic: 0.025 }, // how much of the rock is that ore at richness 1
    focus: 2.5, unfocused: 0.6,
    intensity: {
      gentle:   { out: 0.6, upkeep: 0.8, risk: 0.3, label: 'Gentle' },
      standard: { out: 1,   upkeep: 1,   risk: 1,   label: 'Standard' },
      brutal:   { out: 1.6, upkeep: 1.4, risk: 4,   label: 'Brutal' },
    },
    reserve: { rare: 2_400, mythic: 420 },  // tonnes in the ground at richness 1 x vein size; commons never run out
    taper: 0.2,                              // below 20% left output tapers linearly to zero
    drill: 4,                                // starting drill: cuts ores up to this hardness (tech raises it)
  },
  incident: { perHour: 0.0045, halt: [2, 8], comp: 260 }, // per mine level, x intensity risk; compensation x level

  refinery: {
    thru: [0, 70, 160, 360, 800],   // raw t/hr
    up: [0, 0, 14_000, 38_000, 95_000],
    hours: [0, 0, 4, 6, 10],
    upkeep: [0, 45, 90, 180, 360],
    store: [0, 500, 1_000, 2_200, 4_500], // raw input buffer
    yield: 0.9,
    buyPct: 0.4,                    // default price offered to other guilds, share of the galactic price
    buyMin: 0.15, buyMax: 0.9,
  },
  air: { radius: 140, hangar: 6 },
  lab: { rp: [0, 12, 26, 55], up: [0, 0, 16_000, 45_000], hours: [0, 0, 4, 8], upkeep: [0, 35, 70, 140] },

  exchange: {
    day: 5, cost: 45_000, hours: 8, upkeep: 160,
    up: [0, 0, 60_000, 160_000], upHours: [0, 0, 8, 12],
    store: [0, 3_000, 8_000, 20_000],
    offerEvery: [0, 5, 3.5, 2.5],   // hours between buyer approaches (mean)
    maxOpen: 3, offerLife: 14,
    spot: 0.82,                     // spot sales at the exchange: share of the galactic price
  },
  guildExchange: 0.55,              // without your own exchange, refined goods go to the Guild at this share
  npcCut: [0.6, 0.7],               // contractor refineries keep this share; they pay the rest for raw ore
  npcCount: 5,

  ships: {
    hauler:    { cap: 40,  speed: 220, range: 320, cost: 1_200,  upkeep: 10, label: 'Hauler' },
    clipper:   { cap: 16,  speed: 520, range: 460, cost: 3_800,  upkeep: 20, label: 'Clipper' },
    leviathan: { cap: 260, speed: 130, range: 210, cost: 22_000, upkeep: 60, label: 'Leviathan', tech: 'heavyLift' },
  },
  shipGrowth: 1.12,                 // each ship of a class costs a bit more
  dockHours: 0.35,                  // loading + unloading per round trip
  refuelHours: 0.12,                // per air-station hop

  drone: { speed: 300, scanHours: 0.5, cost: 150, perUnit: 0.6, radius: 0 },

  // Research: costs in RP.
  tech: {
    deepBore1:   { rp: 60,  track: 'Extraction', label: 'Deep Bores', text: 'Mines dig 25% more.', mine: 0.25 },
    hardDrill:   { rp: 90,  track: 'Extraction', label: 'Hardened Drills', text: 'Cut ore up to hardness 6.', drill: 6 },
    deepBore2:   { rp: 220, track: 'Extraction', label: 'Deeper Bores', text: 'Mines dig another 25% more.', mine: 0.25, needs: 'deepBore1' },
    diamondDrill:{ rp: 300, track: 'Extraction', label: 'Diamond Drills', text: 'Cut ore up to hardness 8.', drill: 8, needs: 'hardDrill' },
    mythicDrill: { rp: 700, track: 'Extraction', label: 'Mythic Drill', text: 'Cut anything, including mythic ore (hardness 10).', drill: 10, needs: 'diamondDrill' },
    holds:       { rp: 70,  track: 'Logistics', label: 'Expanded Holds', text: 'Every ship carries 30% more.', hold: 0.3 },
    burners:     { rp: 120, track: 'Logistics', label: 'Afterburners', text: 'Ships fly 25% faster.', speed: 0.25 },
    tanks:       { rp: 150, track: 'Logistics', label: 'Long-Range Tanks', text: 'Ships fly 35% farther between stops.', range: 0.35 },
    corridors:   { rp: 200, track: 'Logistics', label: 'Air Corridors', text: 'Claim radius of hubs and air stations +30%.', claim: 0.3, needs: 'tanks' },
    heavyLift:   { rp: 360, track: 'Logistics', label: 'Heavy Lift', text: 'Unlocks the Leviathan freighter.', needs: 'holds' },
    catalysts:   { rp: 110, track: 'Refining', label: 'Better Catalysts', text: 'Refinery yield +15%.', yield: 0.15 },
    vats:        { rp: 160, track: 'Refining', label: 'Bigger Vats', text: 'Refinery throughput +40%.', thru: 0.4 },
    alchemy:     { rp: 420, track: 'Refining', label: 'Questionable Alchemy', text: 'Refinery yield another +15%.', yield: 0.15, needs: 'catalysts' },
    sensors:     { rp: 60,  track: 'Survey', label: 'Sharper Sensors', text: 'Survey ranges get much narrower.', precision: 1 },
    swarm:       { rp: 140, track: 'Survey', label: 'Drone Swarm', text: 'Two more survey drones.', drones: 2 },
    deepScan:    { rp: 260, track: 'Survey', label: 'Deep Scan', text: 'Surveys read exact richness and how much ore is in the ground.', precision: 2, needs: 'sensors' },
    analysts:    { rp: 90,  track: 'Commerce', label: 'Market Analysts', text: 'See galactic price trends and your share of each market.' },
    silver:      { rp: 180, track: 'Commerce', label: 'Silver Tongue', text: 'Read buyers better: you sense how far they will go.' },
    waivers:     { rp: 100, track: 'Safety', label: 'Liability Waivers', text: 'Incident compensation -60%. The families sign in triplicate.', comp: 0.6 },
    safety:      { rp: 240, track: 'Safety', label: 'Actual Safety', text: 'Half as many incidents. Morale is confused.', risk: 0.5, needs: 'waivers' },
  },

  // The galactic market (market.js). Refined units; p = galactic price (coin per refined unit).
  market: {
    priceScale: 10,                            // galactic price at baseline = ore base value x this
    target: { common: 90_000, rare: 150, mythic: 5 },    // galactic demand at baseline (units/hr)
    share: { common: 0.012, rare: 0.14, mythic: 0.5 },     // planet share at the expected planet supply
    eta: { common: 3, rare: 0.9, mythic: 0.45 },            // outside supply elasticity
    sigma0: 0.5, sigma1: 1.3, matShare: 0.3,
    flowHalfLife: 6,                           // hours: planet supply is an EMA of recent sales
    lo: 0.04, hi: 25,                          // price search bounds, x baseline
  },

  // Contracts (contracts.js).
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
  grantPerDay: 4_000,               // late joiners get startCoin + this per day already gone
};
