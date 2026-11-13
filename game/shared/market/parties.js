// Buyer parties: the galactic customers for refined goods. About 24 per month, four of each type.
// Names and flavor may come from the AI; every number is seeded here and never taken from the AI.
// Pure module: runs on the server and in the browser.
import { hash, rng, pick, shuffle, clamp } from '../planet/util.js';

export const PARTY_TYPES = {
  industrial: { label: 'Industrial', sigma: [1.6, 2.2], ref: [0.9, 1.2], cap: [1.3, 1.8], demand: [1.2, 2.0], uses: ['hull', 'construction', 'machin', 'plating', 'industr', 'build'] },
  military: { label: 'Military', sigma: [1.8, 2.6], ref: [1.1, 1.5], cap: [1.5, 2.2], demand: [0.8, 1.4], uses: ['weapon', 'armor', 'shield', 'lance', 'ammun', 'war'] },
  research: { label: 'Research', sigma: [2.0, 3.0], ref: [1.2, 1.6], cap: [1.6, 2.5], demand: [0.4, 0.8], uses: ['comput', 'research', 'medic', 'ai ', 'lab', 'science'] },
  traders: { label: 'Traders', sigma: [1.5, 2.0], ref: [0.8, 1.0], cap: [1.2, 1.5], demand: [1.4, 2.2], uses: [] },
  political: { label: 'Political', sigma: [2.2, 3.2], ref: [1.0, 1.4], cap: [1.4, 2.0], demand: [0.5, 1.0], uses: ['luxury', 'jewel', 'monument', 'sculpt', 'regalia'] },
  fringe: { label: 'Fringe', sigma: [3.0, 4.0], ref: [1.1, 1.6], cap: [1.8, 2.5], demand: [0.3, 0.7], uses: ['ritual', 'cult', 'relic', 'occult', 'personal'] },
};
const TYPES = Object.keys(PARTY_TYPES);

const BANK = {
  industrial: { a: ['Consolidated', 'Iron', 'Greater', 'Orbital', 'United', 'Heavy'], b: ['Hullworks', 'Foundry Combine', 'Shipwrights', 'Girder Union', 'Forge Trust', 'Assembly Yards'], p: ['practical', 'impatient', 'thrifty', 'loyal'] },
  military: { a: ['Seventh', 'Iron Dawn', 'Crimson', 'Sovereign', 'Vanguard', 'Ashen'], b: ['Legion', 'Armada', 'Mercenary Company', 'Fleet Command', 'Phalanx', 'War College'], p: ['aggressive', 'disciplined', 'paranoid', 'proud'] },
  research: { a: ['Institute of', 'Academy of', 'Lab', 'Collegium of', 'Order of', 'Observatory of'], b: ['Unlikely Physics', 'Applied Hubris', 'Quantum Snacks', 'Deep Time', 'Forbidden Chem', 'Very Small Things'], p: ['curious', 'fussy', 'reckless', 'absent-minded'] },
  traders: { a: ['Silk-Road', 'Lucky', 'Drift', 'Bazaar', 'Freeport', 'Two-Moon'], b: ['Trading House', 'Exchange', 'Caravan', 'Consortium', 'Brokerage', 'Syndicate'], p: ['greedy', 'shrewd', 'friendly', 'slippery'] },
  political: { a: ['Senate of', 'Crown of', 'Council of', 'Duchy of', 'Assembly of', 'Throne of'], b: ['Veyra', 'Morrow', 'Kessel', 'Ixtl', 'Dunhollow', 'the Nine Moons'], p: ['vain', 'cautious', 'scheming', 'generous'] },
  fringe: { a: ['Church of', 'Cult of', 'Brotherhood of', 'Choir of', 'Seekers of', 'Children of'], b: ['the Hollow Star', 'the Last Rock', 'Shiny Things', 'the Patient Worm', 'the Ninth Spark', 'Eternal Ore'], p: ['devout', 'unhinged', 'secretive', 'ecstatic'] },
};

const between = (R, [a, b]) => a + (b - a) * R();
const round = (v, d = 100) => Math.round(v * d) / d;

// Which ores a party wants: by matching ore uses to the type's interests, plus some randomness.
function wantsFor(R, type, ores) {
  const keys = PARTY_TYPES[type].uses;
  const w = {};
  for (const o of ores) {
    const use = String(o.use || '').toLowerCase();
    const match = keys.some(k => use.includes(k));
    const base = type === 'traders' ? 0.5 : match ? 0.9 : 0.15;
    w[o.id] = round(clamp(base * (0.6 + 0.8 * R()), 0, 1));
  }
  // Every party wants at least two ores meaningfully.
  for (const o of shuffle(R, ores).slice(0, 2)) w[o.id] = Math.max(w[o.id], round(0.5 + 0.4 * R()));
  return w;
}

export function generateParties(seed, planet, count = 24) {
  const R = rng(hash('parties:' + seed));
  const ores = planet.ores || [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const type = TYPES[i % TYPES.length];
    const T = PARTY_TYPES[type], B = BANK[type];
    let name;
    for (let tries = 0; tries < 8; tries++) { name = `${pick(R, B.a)} ${pick(R, B.b)}`; if (!out.some(p => p.name === name)) break; }
    const personality = pick(R, B.p);
    out.push({
      id: 'pt' + i, name, type, personality,
      blurb: `A ${personality} ${T.label.toLowerCase()} buyer.`,
      wants: wantsFor(R, type, ores),
      demand: round(between(R, T.demand)), ref: round(between(R, T.ref)), sigma: round(between(R, T.sigma)), cap: round(between(R, T.cap)),
    });
  }
  return out;
}

// Ask the AI only for names and flavor; numbers stay seeded.
export function partiesPrompt(planet, parties) {
  const ores = (planet.ores || []).map(o => `${o.name} (${o.tier}, used for ${o.use})`).join('; ');
  return `You name the galactic buyers of refined ore for a darkly funny space mining game. Planet: ${planet.name} (${planet.theme || ''}). Ores: ${ores}.
For each buyer below, write a memorable name (max 4 words) fitting its type and personality, and a one-line blurb (max 16 words) about what they want and why. No real organisations or people.
Buyers: ${parties.map(p => `${p.id}: ${p.type}, ${p.personality}`).join(' | ')}
Reply with ONLY JSON: {"parties":[{"id":"pt0","name":"...","blurb":"..."}, ...]}`;
}

export function applyPartyNames(parties, raw) {
  const list = raw && Array.isArray(raw.parties) ? raw.parties : [];
  const byId = Object.fromEntries(list.filter(x => x && typeof x.id === 'string').map(x => [x.id, x]));
  const seen = new Set();
  return parties.map(p => {
    const r = byId[p.id];
    let name = r && typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
    if (!name || seen.has(name)) name = p.name;
    seen.add(name);
    const blurb = r && typeof r.blurb === 'string' && r.blurb.trim() ? r.blurb.trim().slice(0, 140) : p.blurb;
    return { ...p, name, blurb };
  });
}
