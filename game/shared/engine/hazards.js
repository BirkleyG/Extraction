// Hazard state, seeded rolls and the story bank.
// Each hazard has a "budget" drawn from Exp(1); advance() spends it at the hazard's current
// per-hour rate and the hazard fires when it reaches zero. Same seed, same mishaps,
// however the time is cut into steps, and safety upgrades take effect at once.
import { hashSeed, rngNext, num } from './util.js';

export const SHAFT_HAZARDS = ['cave', 'mad'];
export const COLONY_HAZARDS = ['gas', 'flood', 'fire', 'quake'];

export function hzPick(state) { return rngNext(state >>> 0); }
export function rollBudget(state) {
  const [u, next] = rngNext(state >>> 0);
  return [-Math.log(1 - u * 0.999999), next];
}

// Fill in hazard fields (also upgrades colonies made before hazards existed). Mutates c.
export function ensureHz(c) {
  if (c.hzRng == null) c.hzRng = hashSeed(`${c.seed}|hazards`);
  if (!c.safety) c.safety = { ventilation: 0, pumps: 0, firebreaks: 0 };
  if (!c.hz) {
    c.hz = {};
    for (const k of COLONY_HAZARDS) { const [b, r] = rollBudget(c.hzRng); c.hz[k] = b; c.hzRng = r; }
  }
  for (const s of c.shafts) ensureShaftHz(c, s);
  if (c.runEarned == null) c.runEarned = num(c.earned);
  if (c.monthEarned == null) c.monthEarned = num(c.earned);
  if (c.sp == null) c.sp = 0;
  if (!c.evo) c.evo = { mine: 0, ship: 0, sell: 0, spectacle: 0 };
  if (c.nukes == null) c.nukes = 0;
  return c;
}
export function ensureShaftHz(c, s) {
  s.up.lights = num(s.up.lights);
  s.up.supports = num(s.up.supports);
  if (s.haltUntil === undefined) s.haltUntil = null;
  if (!s.hz) {
    s.hz = {};
    for (const k of SHAFT_HAZARDS) { const [b, r] = rollBudget(c.hzRng ?? hashSeed(`${c.seed}|hazards`)); s.hz[k] = b; c.hzRng = r; }
  }
}

// Story bank. {s} shaft, {n} miners, {N} "N miner(s)", {m} minutes, {b} burned ore.
const BANK = {
  cavein: {
    saved: [
      '{s} caved in. Every miner was dug out alive, one still holding his sandwich.',
      'The roof of {s} came down. A rescue crew tunneled through in record time. Nobody was even late for dinner.',
      '{s} collapsed. The trapped crew sang shanties until the diggers found them. The diggers wish they had taken longer.',
      'Cave-in at {s}! A miner held the beam up with his back for twenty minutes. Everyone lived. He would like a raise.',
    ],
    lost: [
      '{s} caved in. {N} held the roof long enough for the others to crawl out. They are part of the ceiling now.',
      'The roof of {s} gave way. {N} did not make it out. The survivors named a rock after them.',
      'Cave-in at {s}. Rescuers reached {N} too late. Digging resumes in {m} minutes, out of respect.',
    ],
    empty: ['{s} caved in on an empty shift. Lucky. Clearing the rubble takes {m} minutes.'],
  },
  insanity: {
    lost: [
      'The dark got to {s}. A pickaxe duel over a "lucky" rock cost {N}.',
      'Down in {s} a miner started talking to the walls. The walls answered. {N} lost in the brawl.',
      '{s}: a crew decided the ore was watching them. {N} went in after it and did not come back.',
      'Somebody in {s} swore the shadows stole their lunch. The feud cost {N}. Lights would help.',
    ],
    none: ['A fight broke out in {s}. Everyone walked away with bruises and a new grudge. Work stops for {m} minutes.'],
  },
  gas: {
    lost: ['Gas in {s}! The canary fainted first, then {N}. The rest ran for it.', 'A green fog rolled through {s}. {N} lingered to save the good pickaxe. The pickaxe is fine.'],
    none: ['Gas in {s}! The canary fainted, the crew ran, everyone lived. The canary is getting a medal.', '{s} filled with something that smelled of old eggs. The crew evacuated in {m} minutes flat.'],
  },
  flood: {
    none: ['{s} flooded. Everyone learned to swim in about four seconds. Pumping out takes {m} minutes.', 'An underground river burst into {s}. The crew surfed out on an ore cart.', 'Water in {s}! Miners formed a bucket chain and blamed each other for {m} minutes.'],
  },
  fire: {
    none: ['Fire in the surface yard! {b} ore went up in smoke before the bucket line arrived.', 'A dropped lantern lit the yard. {b} ore burned. The lantern has been fired.', 'The yard caught fire. A heroic forklift driver saved most of it, but {b} ore is ash.'],
  },
  quake: {
    lost: ['The planet shrugged. Every deep shaft shook; {s} lost {N} in the rockfall.', 'Earthquake! Shafts groaned, dust everywhere, and {s} lost {N}. Supports kept the rest standing.'],
    none: ['Earthquake! The whole colony rattled for a minute. Nobody died, though several miners now believe in ghosts.', 'A tremor shook every shaft. A last stand of rusty supports held. Digging resumes shortly.'],
  },
};

export function hazardText(kind, { shaft, lost, saved, haltMins, burned }, u) {
  const b = BANK[kind] || BANK.cavein;
  let list;
  if (kind === 'cavein') list = saved ? b.saved : lost > 0 ? b.lost : b.empty;
  else list = (lost > 0 && b.lost) || b.none || b.lost;
  const t = list[Math.min(list.length - 1, Math.floor(u * list.length))];
  return t.replaceAll('{s}', shaft).replaceAll('{N}', `${lost} miner${lost === 1 ? '' : 's'}`).replaceAll('{n}', String(lost))
    .replaceAll('{m}', String(haltMins)).replaceAll('{b}', String(burned));
}
