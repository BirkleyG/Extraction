// The month's shared world for the guild game: Guild contractor refineries, galactic buyer dossiers and helpers.
import { G } from './tuning.js';
import { rng, hash, clamp, r2, dist } from './util.js';
import { spotOK, sampleSpot } from '../planet/index.js';
import { oreInfo } from './market.js';

const NPC_NAMES = [
  ['Grindwell & Daughters', 'Four generations of crushing things. The daughters are the machines.'],
  ['Consolidated Pulverizing', 'Will refine anything. Has refined several auditors.'],
  ['The Benevolent Crushery', 'A charity, technically. Nobody knows for whom.'],
  ['Last Chance Smelting', 'The sign used to say First Chance. Then came the first chance.'],
  ['Ore & Order Ltd.', 'Guild contractor. Pays on time, mostly in coin.'],
  ['Mother Vat', 'A refinery that insists on being called Mother.'],
  ['The Slag Cathedral', 'Smelters in hooded robes. They hum. The ore hums back.'],
  ['Bargain Furnace No. 9', 'Furnaces one through eight are not discussed.'],
];

// Guild contractor refineries: spread over the land, each keeps a cut and has ore tastes. Deterministic per planet.
export function npcRefineries(planet) {
  if (planet._npc) return planet._npc;
  const R = rng('npc:' + planet.id);
  const ores = oreInfo(planet);
  const names = NPC_NAMES.slice().sort(() => R() - 0.5);
  const out = [];
  const n = G.npcCount;
  for (let k = 0; k < n; k++) {
    // one per sector around the planet, then the best land spot found
    const a0 = (k / n) * Math.PI * 2 + R() * 0.6;
    let spot = null;
    for (let t = 0; t < 120 && !spot; t++) {
      const rad = 140 + R() * 300, a = a0 + (R() - 0.5) * 0.9;
      const x = Math.round(500 + Math.cos(a) * rad), y = Math.round(500 + Math.sin(a) * rad);
      if (spotOK(planet, x, y, out).ok) spot = { x, y };
    }
    if (!spot) continue;
    const [name, blurb] = names[k % names.length];
    const cut = G.npcCut[0] + (G.npcCut[1] - G.npcCut[0]) * R();
    const bias = Object.fromEntries(ores.map((o) => [o.id, r2(0.82 + 0.36 * R())]));
    out.push({ id: 'npc' + k, kind: 'npc', name, blurb, x: spot.x, y: spot.y, cut: r2(cut), bias });
  }
  Object.defineProperty(planet, '_npc', { value: out, enumerable: false, configurable: true });
  return out;
}

// What a contractor pays for one tonne of raw ore today.
export function npcPrice(npc, oreId, prices) {
  const p = prices[oreId];
  return p ? p.p * (1 - npc.cut) * (npc.bias[oreId] || 1) : 0;
}

/* ---------- galactic buyers: dossiers you discover by dealing with them ---------- */

const TYPE_LINES = {
  industrial: { voice: 'clipped and practical', wantLine: 'They build ships the size of moons and complain about the price of rivets.', open: ['We need {ore}. A lot. On time. Name your terms or take ours.', 'The yards are idle without {ore}. Idle yards make our board nervous. Nervous boards fire people into the sun.'] },
  military: { voice: 'loud, formal, faintly threatening', wantLine: 'Every war they fight needs more of something. They fight a lot of wars.', open: ['The Admiralty requires {ore}. Refusal will be noted. In ink. Permanent ink.', 'We are at war with three systems and a weather pattern. Sell us {ore}.'] },
  research: { voice: 'excited, distracted, too many footnotes', wantLine: 'They want ore for experiments that the ethics board has not heard about yet.', open: ['We have a grant! It expires! We need {ore} before the money becomes real money!', 'Our last sample of {ore} achieved sentience and left. We need more. Different batch, please.'] },
  traders: { voice: 'smooth, warm, counting your teeth', wantLine: 'They buy low, sell high, and call the gap friendship.', open: ['Friend! Partner! Let us talk about {ore} and how little you want for it.', 'A buyer of mine needs {ore}. Who? A friend. Which friend? You ask too many questions, friend.'] },
  political: { voice: 'grand, slow, every sentence a speech', wantLine: 'They buy ore for monuments to themselves, and monuments to those monuments.', open: ['The Throne requires {ore} for a statue of the Throne. The statue will also require a statue.', 'A gift of {ore} would please the Council. A sale will merely satisfy it.'] },
  fringe: { voice: 'whispering, ecstatic, worryingly sincere', wantLine: 'Nobody is sure what they do with the ore. Nobody has come back to ask twice.', open: ['The Hollow Star hungers for {ore}. So do we. We are the Hollow Star\'s accountants.', 'Bring us {ore} and you will be remembered. Not fondly. But remembered.'] },
};
const MOODS = {
  accept: ['Done. Pleasure doing business with someone so reasonable.', 'Agreed. You drive a fair bargain, for a strip-miner.', 'Signed. Our lawyers are already disappointed.', 'Accepted. Try not to blow anything up before delivery.'],
  counter: ['Too rich for us. We could stretch to {price}. Do not make us stretch further, we tear.', 'Ha! No. But {price}? That we could live with.', 'Our accountant fainted. When she woke up she said {price}.', 'You flatter your ore. {price}, and we both pretend this never happened.'],
  walk: ['We will find our {ore} elsewhere. The galaxy is large and full of desperate miners.', 'Insulting. We are leaving. We are taking the chairs.', 'No deal. Our patience is a finite resource, unlike your greed.'],
  late: ['Your delivery is short. Our contract is not. The penalty has been deducted with great joy.'],
  done: ['Delivered in full. We will remember this. Favorably, for once.'],
};
const PERSONA = {
  impatient: { walk: 0.55, open: 0.85 }, aggressive: { walk: 0.5, open: 0.8 }, proud: { walk: 0.5, open: 0.86 },
  greedy: { walk: 0.3, open: 0.78 }, shrewd: { walk: 0.35, open: 0.8 }, slippery: { walk: 0.3, open: 0.78 },
  thrifty: { walk: 0.4, open: 0.8 }, paranoid: { walk: 0.45, open: 0.84 }, disciplined: { walk: 0.35, open: 0.88 },
  generous: { walk: 0.15, open: 0.92 }, friendly: { walk: 0.15, open: 0.9 }, loyal: { walk: 0.2, open: 0.9 },
  curious: { walk: 0.2, open: 0.88 }, 'absent-minded': { walk: 0.15, open: 0.9 }, reckless: { walk: 0.25, open: 0.9 },
  fussy: { walk: 0.4, open: 0.84 }, vain: { walk: 0.3, open: 0.9 }, cautious: { walk: 0.35, open: 0.86 },
  scheming: { walk: 0.3, open: 0.8 }, devout: { walk: 0.2, open: 0.9 }, unhinged: { walk: 0.45, open: 0.92 },
  secretive: { walk: 0.3, open: 0.85 }, ecstatic: { walk: 0.1, open: 0.92 }, practical: { walk: 0.3, open: 0.86 },
};
export const persona = (p) => PERSONA[p?.personality] || { walk: 0.3, open: 0.85 };

export function buyerLine(buyer, kind, vars = {}, seed = '') {
  const t = TYPE_LINES[buyer.type] || TYPE_LINES.traders;
  const bank = kind === 'open' ? (buyer.lines && buyer.lines.length ? buyer.lines : t.open) : MOODS[kind] || [''];
  const s = bank[hash(seed + kind + buyer.id) % bank.length];
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

// Fallback dossier (backstory, voice, catchphrase) when the AI is off.
export function dossierFor(buyer, planet) {
  const t = TYPE_LINES[buyer.type] || TYPE_LINES.traders;
  return {
    backstory: buyer.backstory || `${buyer.blurb || ''} ${t.wantLine}`.trim(),
    voice: buyer.voice || t.voice,
    quirk: buyer.quirk || `Known to be ${buyer.personality || 'unpredictable'}.`,
  };
}

export function dossiersPrompt(planet, parties) {
  const ores = oreInfo(planet).map((o) => `${o.name} (${o.tier}, used for ${o.use})`).join('; ');
  return `You write galactic buyers for a darkly funny, satirical space-extraction game. The Maker Guild sells a new planet's ore every month; these buyers are the hungry galaxy on the other end. Planet: ${planet.name} (${planet.theme || ''}). Ores: ${ores}.
For each buyer, write: a memorable name (max 4 words) fitting type and personality, a backstory (max 30 words, dark comedy about extraction, empire, bureaucracy or cults; never real people or groups), a voice (max 6 words), a quirk (max 14 words), and two opening lines (max 22 words each) they would say when asking to buy an ore; write {ore} where the ore name goes.
Buyers: ${parties.map((p) => `${p.id}: ${p.type}, ${p.personality}`).join(' | ')}
Reply with ONLY JSON: {"parties":[{"id":"pt0","name":"...","backstory":"...","voice":"...","quirk":"...","lines":["...","..."]}, ...]}`;
}

export function applyDossiers(parties, raw) {
  const list = raw && Array.isArray(raw.parties) ? raw.parties : [];
  const byId = Object.fromEntries(list.filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x]));
  const seen = new Set();
  const s = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().replace(/[<>]/g, '').slice(0, n) : '');
  return parties.map((p) => {
    const r = byId[p.id] || {};
    let name = s(r.name, 40) || p.name;
    if (seen.has(name)) name = p.name;
    seen.add(name);
    const lines = Array.isArray(r.lines) ? r.lines.map((l) => s(l, 160)).filter((l) => l.includes('{ore}')).slice(0, 3) : [];
    return { ...p, name, backstory: s(r.backstory, 220) || p.backstory, voice: s(r.voice, 60) || p.voice, quirk: s(r.quirk, 120) || p.quirk, lines: lines.length ? lines : p.lines };
  });
}

/* ---------- spots ---------- */

// What anyone can see about a spot without a survey: region, terrain, climate, and whether you can build there.
export function spotInfo(planet, x, y) {
  const s = sampleSpot(planet, x, y);
  const region = planet.regions.find((r) => r.id === s.regionId) || {};
  return { x: Math.round(x), y: Math.round(y), regionId: s.regionId, region: region.name, terrain: s.terrain, climate: s.climate, blurb: region.blurb, water: !!s.water, weather: region.weather, height: s.height, temperature: s.temperature };
}

// The truth under a spot (hidden: the engine uses it, the client only sees survey estimates).
export function groundAt(planet, x, y) {
  const s = sampleSpot(planet, x, y);
  return { soil: clamp(s.soil || 1, 0.7, 1.4), tough: !!s.tough, common: s.common, richness: { ...(s.richness || {}) }, veinSize: { ...(s.veinSize || {}) } };
}

export function nearest(list, p) {
  let best = null, bd = Infinity;
  for (const q of list) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  return best ? { item: best, d: bd } : null;
}
