/* Named tiers for every upgrade line. The model still counts plain levels; this layer gives each stretch of levels a
 * real machine to look at (and the scene redraws the lift, pick and hauler to match). */
export const TIERS = {
  lift: { label: 'Lift', icon: '⇧', base: 1, tiers: [[1, 'Hand Winch'], [10, 'Rope Hoist'], [30, 'Steam Lift'], [70, 'Electric Lift'], [150, 'Maglev Lift'], [320, 'Gravity Lift']] },
  dig: { label: 'Pick', icon: '⛏', base: 1, tiers: [[1, 'Rusty Pick'], [12, 'Jackhammer'], [40, 'Plasma Drill'], [120, 'Gravity Auger'], [350, 'Quantum Spoon']] },
  yard: { label: 'Ore Yard', icon: '▤', base: 0, tiers: [[0, 'Dirt Yard'], [12, 'Fenced Yard'], [40, 'Hopper Yard'], [120, 'Silo Farm'], [350, 'Orbital Depot']] },
  shipSpeed: { label: 'Hauler Engines', icon: '↗', base: 0, tiers: [[0, 'Rust Bucket'], [10, 'Ion Drive'], [40, 'Warp Skiff'], [120, 'Hyper Engine']] },
  shipCapacity: { label: 'Cargo Hold', icon: '▣', base: 0, tiers: [[0, 'Crate Bay'], [10, 'Container Deck'], [40, 'Bulk Hold'], [120, 'Void Hold']] },
  loading: { label: 'Pad Crane', icon: '⌁', base: 0, tiers: [[0, 'Hand Loader'], [10, 'Gantry Crane'], [40, 'Magnet Rig'], [120, 'Tractor Beam']] },
  habitat: { label: 'Habitat', icon: '◓', base: 0, tiers: [[0, 'Tent Camp'], [3, 'Bunk Dome'], [6, 'Hab Ring'], [9, 'Arcology']] },
  bunkhouse: { label: 'Bunkhouse', icon: '▭', base: 0, tiers: [[0, 'Cots'], [3, 'Bunk Beds'], [6, 'Barracks'], [9, 'Sleep Pods']] },
  cart: { label: 'Mine Carts', icon: '◫', base: 0, tiers: [[0, 'Wheelbarrows'], [3, 'Rail Carts'], [6, 'Ore Trains'], [9, 'Maglev Trains']] },
};

export function tierOf(type, level) {
  const def = TIERS[type]; let i = 0;
  def.tiers.forEach(([at], idx) => { if (level >= at) i = idx; });
  const here = def.tiers[i]; const next = def.tiers[i + 1] || null;
  const span = next ? next[0] - here[0] : 1;
  return { i, name: here[1], at: here[0], next: next ? { at: next[0], name: next[1] } : null, progress: next ? Math.min(1, (level - here[0]) / span) : 1, label: def.label, icon: def.icon };
}
