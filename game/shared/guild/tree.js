// The research skill tree. Six branches; Management comes with your command hub, the other five open when you run a
// research hub in that kind of land (a lab on a volcano thinks about rocks; a lab on a glacier thinks about sensors).
// Inside a branch, a node needs the node it grows from. Costs are in research points (RP).

// Which branch each of the 39 landscapes feeds.
export const TERRAIN_BRANCH = {
  mesa: 'rock', volcanic: 'rock', canyon: 'rock', badlands: 'rock', arches: 'rock', geysers: 'rock', rifts: 'rock', bones: 'rock',
  dunes: 'open', saltflat: 'open', savanna: 'open', prairie: 'open', scrub: 'open', skyislands: 'open', islands: 'open', coast: 'open',
  swamp: 'wet', jungle: 'wet', lakes: 'wet', falls: 'wet', oasis: 'wet', terraces: 'wet', moor: 'wet', forest: 'wet', redwoods: 'wet', autumn: 'wet',
  glacier: 'cold', tundra: 'cold', taiga: 'cold', alpine: 'cold',
  crystal: 'weird', fungal: 'weird', tendrils: 'weird', mirror: 'weird', hive: 'weird', ruins: 'weird', monoliths: 'weird', scrapyard: 'weird', watchers: 'weird',
};

export const BRANCHES = {
  core:  { label: 'Management', color: '#ffd23f', where: 'your command hub', text: 'People are a resource. Treat them like one.' },
  rock:  { label: 'Deep Earth', color: '#ff8a3d', where: 'rocky land (mesas, canyons, volcanoes)', text: 'Dig harder, dig deeper, dig things that should stay buried.' },
  open:  { label: 'Sky Lanes', color: '#7ad1ff', where: 'open land (dunes, plains, islands, coasts)', text: 'Ships, range, and the art of being somewhere else fast.' },
  wet:   { label: 'Wet Works', color: '#5ee6a8', where: 'wet land (jungles, swamps, lakes, forests)', text: 'Refining. Mostly boiling things until they pay.' },
  cold:  { label: 'Cold Lab', color: '#c8e8ff', where: 'cold land (glaciers, tundra, taiga, alpine)', text: 'Sensors, drones and very patient science.' },
  weird: { label: 'Weird Science', color: '#ff5ec4', where: 'strange land (crystals, fungus, ruins, hives)', text: 'Trade, persuasion and things the Guild prefers not to file.' },
};

// x, y: position in the branch's little grid (for drawing). needs: the node it grows from.
export const NODES = {
  // Management (core)
  c1: { b: 'core', x: 0, y: 0, rp: 30, label: 'Payroll Software', text: 'Wages -15%.', wage: -0.15 },
  c2: { b: 'core', x: 1, y: 0, rp: 60, needs: 'c1', label: 'Hard Hats (Optional)', text: 'Worker deaths -25%.', deaths: -0.25 },
  c3: { b: 'core', x: 0, y: 1, rp: 70, needs: 'c1', label: 'Hardened Drills', text: 'Cut ore up to hardness 6.', drill: 6 },
  c4: { b: 'core', x: 2, y: 0, rp: 120, needs: 'c2', label: 'Motivational Posters', text: 'Morale +10 everywhere.', morale: 10 },
  c5: { b: 'core', x: 3, y: 0, rp: 220, needs: 'c4', label: 'Bulk Labor Contracts', text: 'Workers cost 30% less to ship in.', price: -0.3 },
  c6: { b: 'core', x: 0, y: 2, rp: 240, needs: 'c3', label: 'Diamond Drills', text: 'Cut ore up to hardness 8.', drill: 8 },
  c7: { b: 'core', x: 1, y: 1, rp: 110, needs: 'c2', label: 'Liability Waivers', text: 'Rescues cost half. The families sign in triplicate.', rescue: -0.5 },
  // Deep Earth (rock)
  r1: { b: 'rock', x: 0, y: 0, rp: 60, label: 'Deep Bores', text: 'Mines dig 20% faster.', dig: 0.2 },
  r2: { b: 'rock', x: 1, y: 0, rp: 130, needs: 'r1', label: 'Controlled Blasting', text: 'Blasts yield 50% more and cave in half as often.', blast: 0.5 },
  r3: { b: 'rock', x: 0, y: 1, rp: 420, needs: 'r1', label: 'Mythic Drill', text: 'Cut anything, mythic ore included.', drill: 10 },
  r4: { b: 'rock', x: 2, y: 0, rp: 260, needs: 'r2', label: 'Bigger Bores', text: 'Mines dig another 20% faster.', dig: 0.2 },
  r5: { b: 'rock', x: 1, y: 1, rp: 300, needs: 'r3', label: 'Seismic Mapping', text: 'Rare veins hold 40% more ore.', reserve: 0.4 },
  // Sky Lanes (open)
  o1: { b: 'open', x: 0, y: 0, rp: 60, label: 'Expanded Holds', text: 'Every ship carries 30% more.', hold: 0.3 },
  o2: { b: 'open', x: 1, y: 0, rp: 120, needs: 'o1', label: 'Afterburners', text: 'Ships fly 25% faster.', speed: 0.25 },
  o3: { b: 'open', x: 0, y: 1, rp: 140, needs: 'o1', label: 'Long-Range Tanks', text: 'Ships fly 35% farther between stops.', range: 0.35 },
  o4: { b: 'open', x: 2, y: 0, rp: 320, needs: 'o2', label: 'Heavy Lift', text: 'Unlocks the Leviathan freighter.' },
  o5: { b: 'open', x: 1, y: 1, rp: 200, needs: 'o3', label: 'Prefab Outposts', text: 'Founding far away costs half as much extra.', far: -0.5 },
  o6: { b: 'open', x: 0, y: 2, rp: 180, needs: 'o3', label: 'Freight Brokers', text: 'Guild freight jobs pay 30% more.', freight: 0.3 },
  // Wet Works (wet)
  w1: { b: 'wet', x: 0, y: 0, rp: 70, label: 'Better Catalysts', text: 'Refinery yield +10%.', yield: 0.1 },
  w2: { b: 'wet', x: 1, y: 0, rp: 140, needs: 'w1', label: 'Bigger Vats', text: 'Vats refine 30% more.', vat: 0.3 },
  w3: { b: 'wet', x: 2, y: 0, rp: 380, needs: 'w2', label: 'Questionable Alchemy', text: 'Refinery yield another +10%.', yield: 0.1 },
  w4: { b: 'wet', x: 1, y: 1, rp: 220, needs: 'w2', label: 'Steam Tunnels', text: 'Conveyors and pads move 30% more.', feed: 0.3 },
  // Cold Lab (cold)
  k1: { b: 'cold', x: 0, y: 0, rp: 50, label: 'Sharper Sensors', text: 'Survey ranges get much narrower.', precision: 1 },
  k2: { b: 'cold', x: 1, y: 0, rp: 120, needs: 'k1', label: 'Drone Swarm', text: 'Two more survey drones.', drones: 2 },
  k3: { b: 'cold', x: 0, y: 1, rp: 230, needs: 'k1', label: 'Deep Scan', text: 'Surveys read exact richness and the ore in the ground.', precision: 2 },
  k4: { b: 'cold', x: 2, y: 0, rp: 200, needs: 'k2', label: 'Cryo Sleep', text: 'Shuttles carry twice the workers. They wake up mostly.', shuttle: 1 },
  k5: { b: 'cold', x: 1, y: 1, rp: 300, needs: 'k3', label: 'Think Tanks', text: 'All research +30%.', rp: 0.3 },
  // Weird Science (weird)
  x1: { b: 'weird', x: 0, y: 0, rp: 70, label: 'Market Analysts', text: 'See your share of each market and price history.' },
  x2: { b: 'weird', x: 1, y: 0, rp: 150, needs: 'x1', label: 'Silver Tongue', text: 'You sense how far a buyer will go.' },
  x3: { b: 'weird', x: 0, y: 1, rp: 180, needs: 'x1', label: 'Ominous Hum', text: 'Morale +15. Nobody asks where it comes from.', morale: 15 },
  x4: { b: 'weird', x: 2, y: 0, rp: 260, needs: 'x2', label: 'Brand Synergy', text: 'Buyers open 8% higher.', open: 0.08 },
  x5: { b: 'weird', x: 1, y: 1, rp: 240, needs: 'x2', label: 'Exchange Insider', text: 'Spot sales pay 5% more of the galactic price.', spot: 0.05 },
};

export const branchOf = (terrain) => TERRAIN_BRANCH[terrain] || 'weird';
export const nodeSum = (tree, key) => Object.keys(tree || {}).reduce((s, id) => s + (Number(NODES[id]?.[key]) || 0), 0);
export const nodeMax = (tree, key, base) => Math.max(base, ...Object.keys(tree || {}).map((id) => Number(NODES[id]?.[key]) || 0));
