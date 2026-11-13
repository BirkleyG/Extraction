/* Ores: seven per planet (2 common, 4 rare, 1 mythic). Each is themed from the planet's theme AND its galactic use,
 * and the use decides the crystal shape and colour mood; the client draws the sprite from oreSpriteSpec(ore). */
import { clamp, hsl, hexOr, isHex, ramp, colorDist, toHsl, pick, shuffle, slug, cleanText, num } from './util.js';

export const SHAPES = ['shard', 'nugget', 'geode', 'cluster', 'blob', 'ring', 'spiral', 'cube', 'orb', 'star', 'ingot', 'egg', 'flake', 'bubble', 'tooth', 'coin'];
export const TIERS = ['common', 'common', 'rare', 'rare', 'rare', 'rare', 'mythic'];

/* What the galaxy does with ore. `nouns` become the mineral half of a name; `shapes` its sprite; `sat`/`lit` its colour mood.
 * `tier` lists the tiers the use suits; `lines` are description sentences. */
export const USES = [
  { id: 'hull', label: 'starship hull plating', nouns: ['Plate', 'Iron', 'Steel', 'Slab', 'Ore'], shapes: ['ingot', 'cube', 'nugget'], sat: 0.32, lit: 0.55, tier: ['common', 'rare'], lines: ['Hammered into the hulls of ships that should not fly.', 'Hull plating for freighters with optimistic pilots.'] },
  { id: 'insulation', label: 'starship hull insulation', nouns: ['Quartz', 'Felt', 'Fluff', 'Wool'], shapes: ['cluster', 'blob', 'nugget'], sat: 0.5, lit: 0.66, tier: ['common', 'rare'], lines: ['Packed into hull walls so crews freeze slightly slower.', 'Insulation for starships; keeps the cold out and the screams in.'] },
  { id: 'fuel', label: 'reactor fuel', nouns: ['Isotope', 'Pellet', 'Ember', 'Salt', 'Core'], shapes: ['orb', 'egg', 'blob'], sat: 0.85, lit: 0.58, tier: ['common', 'rare', 'mythic'], lines: ['Burns in reactors and occasionally in reactor technicians.', 'Reactor fuel. Glows. Hums. Do not pocket it.'] },
  { id: 'warp', label: 'warp coil windings', nouns: ['Coil', 'Wire', 'Spool', 'Filament'], shapes: ['spiral', 'ring'], sat: 0.8, lit: 0.6, tier: ['rare', 'mythic'], lines: ['Wound into warp coils that fold space and sometimes pilots.', 'Warp coil windings; every jump costs a gram and a nightmare.'] },
  { id: 'medicine', label: 'frontier medicine', nouns: ['Salve', 'Resin', 'Jelly', 'Tincture'], shapes: ['blob', 'egg', 'bubble'], sat: 0.55, lit: 0.68, tier: ['common', 'rare'], lines: ['Ground into medicine that cures most things and causes the rest.', 'Field medicine for colonists with no other options.'] },
  { id: 'jewelry', label: 'luxury jewelry for the galactic rich', nouns: ['Opal', 'Gem', 'Pearl', 'Beryl', 'Jewel'], shapes: ['geode', 'shard', 'orb', 'coin'], sat: 0.75, lit: 0.62, tier: ['rare', 'mythic'], lines: ['Worn by emperors who have never seen a mine.', 'Cut into jewelry for the kind of rich that owns moons.'] },
  { id: 'weapons', label: 'plasma lance ammunition', nouns: ['Shard', 'Flint', 'Spike', 'Fang'], shapes: ['shard', 'star', 'tooth'], sat: 0.8, lit: 0.52, tier: ['common', 'rare'], lines: ['Loaded into plasma lances by people with grudges.', 'Weapons-grade, and it knows it.'] },
  { id: 'computing', label: 'quantum computing cores', nouns: ['Lattice', 'Silicate', 'Crystal', 'Matrix'], shapes: ['cube', 'cluster', 'shard'], sat: 0.7, lit: 0.6, tier: ['rare'], lines: ['Grown into quantum cores that calculate your odds and laugh.', 'Computing substrate; thinks faster than its buyers.'] },
  { id: 'terraform', label: 'terraforming seed stock', nouns: ['Loam', 'Seedstone', 'Spore', 'Humus'], shapes: ['cluster', 'egg', 'blob'], sat: 0.55, lit: 0.48, tier: ['common', 'rare'], lines: ['Scattered on dead worlds to make them slightly less dead.', 'Terraforming stock: just add planet.'] },
  { id: 'shields', label: 'deflector shield emitters', nouns: ['Prism', 'Lens', 'Glass', 'Mirror'], shapes: ['ring', 'geode', 'orb'], sat: 0.7, lit: 0.66, tier: ['rare'], lines: ['Polished into shield emitters that deflect most of the bad news.', 'Shield lenses for ships that expect to be shot.'] },
  { id: 'navigation', label: 'hyperspace navigation beacons', nouns: ['Lodestone', 'Compass', 'Beacon'], shapes: ['star', 'shard'], sat: 0.7, lit: 0.62, tier: ['rare'], lines: ['Points the way home, usually.', 'Navigation beacons; lost ships follow it like gossip.'] },
  { id: 'cryo', label: 'cryosleep coolant', nouns: ['Frost', 'Rime', 'Ice', 'Chill'], shapes: ['flake', 'shard'], sat: 0.6, lit: 0.72, tier: ['common', 'rare'], lines: ['Keeps cryosleepers cold and mostly alive.', 'Coolant for sleeper pods on very long, very cheap cruises.'] },
  { id: 'propellant', label: 'ion thruster propellant', nouns: ['Vapor', 'Gas', 'Fizz', 'Bubble'], shapes: ['bubble', 'orb'], sat: 0.65, lit: 0.64, tier: ['common', 'rare'], lines: ['Pushes ships around at alarming speeds.', 'Thruster propellant; smells faintly of burnt eyebrows.'] },
  { id: 'art', label: 'sculpture for bored emperors', nouns: ['Marble', 'Clay', 'Alabaster'], shapes: ['nugget', 'blob', 'cube'], sat: 0.3, lit: 0.7, tier: ['common'], lines: ['Carved into statues of emperors by artists who hate them.', 'Sculpting stone for monuments nobody visits.'] },
  { id: 'comms', label: 'subspace antennae', nouns: ['Tin', 'Filament', 'Wire'], shapes: ['spiral', 'star'], sat: 0.6, lit: 0.6, tier: ['common', 'rare'], lines: ['Spun into antennae that hear the whole galaxy complain.', 'Subspace antenna wire; picks up ads from the future.'] },
  { id: 'time', label: 'time-dilation clocks', nouns: ['Hourstone', 'Chronite', 'Moment'], shapes: ['spiral', 'ring', 'coin'], sat: 0.85, lit: 0.62, tier: ['mythic'], lines: ['Powers clocks that run late on purpose. Everyone wants one.', 'Bends time slightly; your shift ends yesterday.'] },
  { id: 'gravity', label: 'artificial gravity plates', nouns: ['Ballast', 'Heartstone', 'Anchor'], shapes: ['orb', 'geode', 'cube'], sat: 0.8, lit: 0.55, tier: ['mythic', 'rare'], lines: ['Keeps space stations from floating off in a huff.', 'Artificial gravity; heavier than it has any right to be.'] },
  { id: 'souls', label: 'ship AI personalities', nouns: ['Soulstone', 'Spark', 'Psyche'], shapes: ['star', 'orb', 'geode'], sat: 0.9, lit: 0.62, tier: ['mythic'], lines: ['Gives ship computers feelings, mostly resentment.', 'A pinch makes an AI sentient; a gram makes it unionize.'] },
];
const GENERIC_QUIPS = ['The Guild denies it is radioactive.', 'Two miners died for this sample; it was worth it, says the Guild.', 'Mildly cursed, fully insured.', 'Prices it like it knows.', 'Nobody has read the safety sheet.', 'Leaves a stain that files lawsuits.', 'Tastes of copper and ambition.', 'It hums when the market is about to crash.']
export const USE_IDS = USES.map((u) => u.id);
const useOf = (id) => USES.find((u) => u.id === id) || null;

/* ranges the engine can rely on; planetFromAI clamps into these */
export const TIER_RULES = {
  common: { hardness: [1, 3], depth: [0, 0], value: [1, 3] },
  rare: { hardness: [3, 7], depth: [2, 12], value: [8, 60] },
  mythic: { hardness: [9, 10], depth: [16, 20], value: [300, 600] },
};

/* palette from a base colour; mythic ores get a hot highlight */
export function orePalette(color, tier) {
  const p = ramp(color, 4);
  if (tier === 'mythic') p[3] = '#ffffff';
  return p;
}
export function sparkleFor(tier) { return tier === 'mythic' ? 1 : tier === 'rare' ? 0.5 : 0.15; }

/* seven colours that read clearly apart; commons lean toward the theme hue, the rest spread around the wheel */
function oreColors(R, baseHue, uses) {
  const out = [];
  const offs = shuffle(R, [0, 1, 2, 3, 4, 5, 6]);
  for (let i = 0; i < 7; i += 1) {
    const u = uses[i]; let col = null;
    for (let tries = 0; tries < 30 && !col; tries += 1) {
      const h = i < 2 ? baseHue + (i ? 40 : -20) + R() * 30 + tries * 23 : baseHue + offs[i] * (360 / 7) + R() * 30 + tries * 19;
      const cand = hsl(h, clamp(u.sat + (R() - 0.5) * 0.15, 0.15, 0.95), clamp(u.lit + (R() - 0.5) * 0.1, 0.35, 0.78));
      if (out.every((c) => colorDist(c, cand) >= 62)) col = cand;
    }
    out.push(col || hsl(baseHue + i * 51, 0.7, 0.6));
  }
  return out;
}

/* integers in [a,b] that rise across the four rares */
const spread = (R, a, b, n) => Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * ((i + R() * 0.8) / n)));

export function oreStats(R, tier, rank, rareCount = 4) {
  const T = TIER_RULES[tier];
  if (tier === 'common') return { hardness: rank === 0 ? 1 : 2 + (R() < 0.35 ? 1 : 0), depthMin: 0, baseValue: rank === 0 ? 1 : 2 + Math.round(R()) };
  if (tier === 'mythic') return { hardness: 9 + Math.round(R()), depthMin: 16 + Math.floor(R() * 5), baseValue: Math.round((300 + R() * 300) / 10) * 10 };
  const k = rank / Math.max(1, rareCount - 1);
  return {
    hardness: clamp(Math.round(3 + k * 4), T.hardness[0], T.hardness[1]),
    depthMin: clamp(Math.round(2 + k * 9 + R() * 1.5), T.depth[0], T.depth[1]),
    baseValue: clamp(Math.round(8 * Math.pow(60 / 8, k) * (0.9 + R() * 0.2)), T.value[0], T.value[1]),
  };
}

/* Improvised ores for a theme: pick uses that suit each tier, glue a theme word to a use noun. */
export function improviseOres(R, theme) {
  const used = new Set();
  const pickUse = (tier) => {
    const pool = shuffle(R, USES.filter((u) => u.tier.includes(tier) && !used.has(u.id)));
    const u = pool[0] || shuffle(R, USES.filter((x) => !used.has(x.id)))[0];
    used.add(u.id); return u;
  };
  const uses = TIERS.map((t) => pickUse(t));
  const [h0, h1] = theme.hue; const baseHue = h0 + R() * (h1 - h0);
  const colors = oreColors(R, baseHue, uses);
  const words = shuffle(R, theme.oreWords); const quips = shuffle(R, theme.quips).concat(shuffle(R, GENERIC_QUIPS)); const names = new Set();
  let rareRank = 0;
  return TIERS.map((tier, i) => {
    const u = uses[i];
    let name = '';
    for (let k = 0; k < 6 && (!name || names.has(name)); k += 1) {
      const w = words[(i + k * 7) % words.length]; const n = pick(R, u.nouns);
      name = `${w} ${n}`;
      if (tier === 'mythic' && name.length < 20) name = `${pick(R, ['True', 'Elder', 'Prime', 'Black', 'Living'])} ${name}`;
    }
    names.add(name);
    const stats = oreStats(R, tier, tier === 'rare' ? rareRank++ : i);
    const color = colors[i];
    const shape = pick(R, u.shapes);
    return {
      id: slug(name) || `ore${i}`, name, tier, ...stats, color, palette: orePalette(color, tier), shape,
      use: u.label, useId: u.id, description: `${pick(R, u.lines)} ${quips[i % quips.length]}`,
    };
  });
}

/* clean one AI ore into a full ore, using `fb` (an improvised ore of the same tier) for anything missing */
export function cleanOre(raw, fb, tier, R, rank) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const name = cleanText(o.name, fb.name, 28);
  const T = TIER_RULES[tier];
  const useText = cleanText(o.use, '', 60);
  const u = useOf(o.useId) || (useText && USES.find((x) => useText.toLowerCase().includes(x.label.split(' ').slice(-1)[0]) || x.nouns.some((n) => useText.toLowerCase().includes(n.toLowerCase())))) || useOf(fb.useId);
  const color = hexOr(o.color, fb.color);
  const pal = Array.isArray(o.palette) ? o.palette.map((c) => hexOr(c, null)).filter(Boolean).slice(0, 4) : [];
  const palette = pal.length >= 3 ? pal : orePalette(color, tier);
  const shape = typeof o.shape === 'string' && SHAPES.includes(o.shape.trim().toLowerCase()) ? o.shape.trim().toLowerCase() : (u ? u.shapes[rank % u.shapes.length] : fb.shape);
  const stats = oreStats(R, tier, rank);
  return {
    id: slug(cleanText(o.id, '', 24)) || slug(name) || fb.id, name, tier,
    hardness: Math.round(clamp(num(o.hardness, stats.hardness), T.hardness[0], T.hardness[1])),
    depthMin: Math.round(clamp(num(o.depthMin, stats.depthMin), T.depth[0], T.depth[1])),
    baseValue: Math.round(clamp(num(o.baseValue, stats.baseValue), T.value[0], T.value[1])),
    color, palette, shape,
    use: useText || (u ? u.label : fb.use), useId: u ? u.id : fb.useId,
    description: cleanText(o.description || o.blurb, fb.description, 160),
  };
}

/* What the client needs to draw an ore. Never throws, whatever it's given. */
export function oreSpriteSpec(ore) {
  const o = ore && typeof ore === 'object' ? ore : {};
  const tier = ['common', 'rare', 'mythic'].includes(o.tier) ? o.tier : 'common';
  const color = hexOr(o.color, '#9a8a7a');
  let palette = Array.isArray(o.palette) ? o.palette.filter(isHex).map((c) => hexOr(c)).slice(0, 4) : [];
  if (palette.length < 3) palette = orePalette(color, tier);
  // keep the ramp ordered dark -> light so the sprite shades correctly whatever order the AI used
  palette = palette.slice().sort((a, b) => toHsl(a)[2] - toHsl(b)[2]);
  const shape = SHAPES.includes(o.shape) ? o.shape : 'nugget';
  return { palette, shape, sparkle: sparkleFor(tier), seed: slug(o.id || o.name || 'ore') };
}
