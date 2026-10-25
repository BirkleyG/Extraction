/* Sandbox economy (provisional C-coefficients; see rulebook sections 03/05/10 "Sandbox tuning · 25 Oct 2026").
 *
 * Three upgrade lines plus shafts. Every line is a ladder of levels whose names change at tier boundaries; each level
 * multiplies one stage of the dig -> lift -> hauler -> buyer chain, so a purchase is always big enough to see and the
 * three numbers stay connected. There are no milestone multipliers: tiers only rename and redraw the machine (T10-04).
 * Pure data and arithmetic only: the model, the UI and the pacing simulator all read it, nothing here touches state. */

export const MAX_SHAFTS = 30;
export const MINERS_PER_SHAFT = 10;
export const START_YARD_UNITS = 10;
export const LEVEL_CAP = 400;

/** Every coefficient the pacing study may move. Frozen copy below is what the game uses. */
export const TUNE = {
  growth: 1.4, // effect of one level of a line: x growth
  costGrowth: 1.75, // price of one level of a line: x costGrowth
  pickCost: 34, lift: 100, liftCost: 45, haulCost: 39, // first-level prices (pick / lift / hauler) and the lift's starting ore/min
  depth: 2.05, // shaft k digs depth^(k-1) times shaft 1
  shaftBase: 190, shaftGrowth: 4.1, // shaft k costs shaftBase * shaftGrowth^(k-2)
  orePerMiner: 6, // ore/min per miner at shaft 1, pick level 0
  holdBase: 10, speedBase: 12, speedGrowth: 1.04, // hauler: units per trip at level 0, AU/min at level 0, speed growth per level
  veinGrowth: 3, veinBase: 900, // a rare vein in shaft k holds veinBase * veinGrowth^(k-1) * richness units
};

const roundHalfUp = (value) => Math.floor(value + 0.5);

export const LINES = Object.freeze({
  pick: Object.freeze({
    label: 'Pick', icon: '⛏', unit: 'ore/min per miner', blurb: 'Every miner digs faster, in every shaft.',
    tiers: [[0, 'Rusty Pick', 'Dull and dented, but it digs.'], [6, 'Steel Pick', 'Real steel. Breaks harder rock.'], [14, 'Jackhammer', 'Loud, fast, and it breaks rare veins.'], [26, 'Plasma Drill', 'Melts through crystal seams.'], [38, 'Gravity Auger', 'Rock gives way on its own.'], [50, 'Quantum Spoon', 'Digs things that should not exist.']],
  }),
  lift: Object.freeze({
    label: 'Lift', icon: '⇧', unit: 'ore/min to the surface', blurb: 'Carries ore from every shaft up to the yard.',
    tiers: [[0, 'Hand Winch', 'Two arms and a rope.'], [6, 'Rope Hoist', 'A bucket on a pulley.'], [14, 'Steam Lift', 'Hissing and hungry.'], [26, 'Electric Lift', 'Quiet and quick.'], [38, 'Maglev Lift', 'Floats the ore up.'], [50, 'Gravity Lift', 'Ore falls upward.']],
  }),
  hauler: Object.freeze({
    label: 'Hauler', icon: '▲', unit: 'units per trip', blurb: 'A bigger, faster ship: more cargo per trip and shorter trips.',
    tiers: [[0, 'Rust Bucket', 'Holds a few crates and rattles.'], [6, 'Ion Skiff', 'Roomier hold, quicker engines.'], [14, 'Warp Freighter', 'Big hold, short hops.'], [26, 'Hyper Barge', 'Moves mountains of ore.'], [38, 'Void Carrier', 'Folds space around the cargo.'], [50, 'Star Leviathan', 'A flying warehouse.']],
  }),
});
export const LINE_IDS = Object.freeze(Object.keys(LINES));

export function lineCost(id, level, t = TUNE) {
  const base = id === 'pick' ? t.pickCost : id === 'lift' ? t.liftCost : t.haulCost;
  return Math.max(1, roundHalfUp(base * t.costGrowth ** level));
}
export const pickRatePerMiner = (level, t = TUNE) => t.orePerMiner * t.growth ** level;
export const liftRate = (level, t = TUNE) => t.lift * t.growth ** level;
export const haulerCapacity = (level, t = TUNE) => Math.max(1, roundHalfUp(t.holdBase * t.growth ** level));
export const haulerSpeed = (level, t = TUNE) => t.speedBase * t.speedGrowth ** level;
/** the yard holds about 20 seconds of lift flow (never less than two holds), so storage stays small */
export const yardCapacity = (liftLevel, haulLevel, t = TUNE) => Math.max(roundHalfUp(liftRate(liftLevel, t) / 3), 2 * haulerCapacity(haulLevel, t), 20);
export const veinSize = (shaftNumber, richness, mythic, t = TUNE) => Math.round(richness * (mythic ? 3.3 : 1) * t.veinBase * t.veinGrowth ** (shaftNumber - 1));
/** each shaft's buffer holds about 10 seconds of lift flow */
export const shaftBuffer = (liftLevel, t = TUNE) => Math.max(10, liftRate(liftLevel, t) / 6);
/** how much more shaft k digs than shaft 1 */
export const depthFactor = (shaftNumber, t = TUNE) => t.depth ** (shaftNumber - 1);
/** shaft k unlock price (shaft 1 is supplied) */
export const shaftCost = (number, t = TUNE) => roundHalfUp(t.shaftBase * t.shaftGrowth ** (number - 2));

export const DESTINATIONS = Object.freeze([
  Object.freeze({ id: 'frontier-refinery', name: 'Frontier Refinery', detail: 'Close · quick trips', distance: 1, basePrice: 10, unloadSeconds: 2, accent: '#e7a15a' }),
  Object.freeze({ id: 'cinder-buyer', name: 'Cinder Bay Buyer', detail: 'Farther · pays more per unit', distance: 3, basePrice: 18, unloadSeconds: 3, accent: '#66bfd0' }),
  Object.freeze({ id: 'outer-station', name: 'Outer Station', detail: 'Far out · pays the most', distance: 8, basePrice: 50, unloadSeconds: 4, accent: '#b892ff' }),
]);

/** seconds for one round trip including unloading (the same formula the model uses) */
export const tripSeconds = (destination, speed) => Math.ceil(2 * destination.distance / speed * 60 + destination.unloadSeconds);

export function tierIndex(id, level) {
  let index = 0;
  LINES[id].tiers.forEach(([at], i) => { if (level >= at) index = i; });
  return index;
}
