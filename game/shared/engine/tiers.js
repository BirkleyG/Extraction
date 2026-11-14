// Named equipment tiers: every few levels your gear, carts and lift turn into a new, visibly different machine.
// Pure data used by the UI and the mine view (level -> tier name and sprite index).
const LEVELS = [1, 5, 10, 20, 35, 50, 75, 100, 150, 200, 300];

export const TIERS = {
  gear: ['Rusty Pick', 'Iron Pick', 'Steel Pick', 'Jackhammer', 'Pneumatic Drill', 'Diamond Drill', 'Plasma Drill', 'Gravity Auger', 'Sonic Bore', 'Quantum Spoon', 'Reality Corer'],
  cart: ['Wheelbarrow', 'Mine Cart', 'Twin Carts', 'Ore Train', 'Steam Train', 'Diesel Hauler', 'Mag-Rail', 'Hover Sled', 'Grav Barge', 'Wormhole Chute', 'The Endless Train'],
  lift: ['Rope & Bucket', 'Pulley Hoist', 'Rickety Cage', 'Steam Cage', 'Screaming Elevator', 'Twin Cage', 'Mag-Lift', 'Gravity Chute', 'Teleporter-ish', 'Hole-Shaped Miracle', 'The Big Yank'],
  ship: ['Mk I', 'Mk II', 'Mk III', 'Mk IV', 'Mk V', 'Mk VI', 'Mk VII', 'Mk VIII', 'Mk IX', 'Mk X', 'Legend'],
};

// tierOf('gear', 23) -> { tier: 3, name: 'Jackhammer', next: { name: 'Pneumatic Drill', at: 35 } }
export function tierOf(kind, level) {
  const names = TIERS[kind] || TIERS.ship;
  let tier = 0;
  for (let i = 0; i < LEVELS.length; i++) if (level >= LEVELS[i]) tier = i;
  tier = Math.min(tier, names.length - 1);
  const nx = tier + 1 < names.length && tier + 1 < LEVELS.length ? { name: names[tier + 1], at: LEVELS[tier + 1] } : null;
  return { tier, name: names[tier], next: nx };
}

// Lift tier from its three upgrades (overall size of the machine).
export const liftLevel = (lift) => Math.round(((lift && lift.speed) || 0) + ((lift && lift.capacity) || 0) + 3 * ((lift && lift.buckets) || 0)) / 2 + 1;
export const TIER_LEVELS = LEVELS;
