/* Planet generation for the play sandbox.
 * A planet is pure presentation: sky, moons, rock layers, ore names and colours, and a ring of regions that each
 * have their own topography. It can be improvised from a seed (no AI) or dreamed up by the player's own AI key,
 * using the same provider settings as the original game. It never touches money, rates or the ledger. */
import { hash, rng, clamp, sh, hexMix } from './sprites.js';

export const PLANET_KEY = 'extraction_planet_v1';
export const AI_KEY = 'msc_ai'; // same key the original game uses, so a key you already pasted there just works

const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
const shuffle = (R, arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const hex = (v, fb) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : fb);
const str = (v, fb, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fb);

export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${((1 << 24) | (f(0) << 16) | (f(8) << 8) | f(4)).toString(16).slice(1)}`;
}
function hueOf(col) {
  const n = parseInt(col.slice(1), 16); const r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360;
}
const lum = (col) => { const n = parseInt(col.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
const dist = (a, b) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); return Math.hypot((A >> 16) - (B >> 16), (A >> 8 & 255) - (B >> 8 & 255), (A & 255) - (B & 255)); };

/* Every region reads as a different kind of land. `fx` is the weather that region always has. */
export const TERRAINS = {
  mesa: { label: 'Mesa country', fx: 'wind', biomes: ['#b8643a', '#a8553a', '#c47a44'], nouns: ['Tablelands', 'Buttes', 'Mesas', 'Reach'], words: ['mesa', 'butte', 'table', 'plateau', 'reach', 'rim'], blurb: ['Flat-topped giants stand around like furniture nobody asked for.', 'Stacked red rock. Every cliff is a sheer lawsuit.'] },
  dunes: { label: 'Singing dunes', fx: 'wind', biomes: ['#d6a45a', '#c99250', '#e0b46a'], nouns: ['Dunes', 'Wastes', 'Sprawl', 'Drifts'], words: ['dune', 'sand', 'waste', 'drift', 'dust', 'desert'], blurb: ['The sand hums when you walk. Nobody trusts the humming.', 'Endless gold ripples that move when you stop looking.'] },
  glacier: { label: 'Glacier fields', fx: 'snow', biomes: ['#9fc4d8', '#8db4cc', '#b4d2e2'], nouns: ['Glacier', 'Frostfields', 'Icefall', 'Shiver'], words: ['ice', 'frost', 'snow', 'glacier', 'frozen', 'shiver', 'cold'], blurb: ['Blue ice cracks like knuckles. The mine bunks are a hard sell.', 'Frozen ridges and wind that files complaints.'] },
  volcanic: { label: 'Volcanic ridge', fx: 'ash', biomes: ['#6e2a22', '#7a3322', '#5a2a30'], nouns: ['Cinders', 'Caldera', 'Ashlands', 'Furnace'], words: ['lava', 'fire', 'cinder', 'ash', 'magma', 'caldera', 'volcan', 'ember', 'furnace'], blurb: ['Cones glow like bad ideas. The ground is mostly a warning.', 'Ash drifts down and the horizon quietly glows.'] },
  swamp: { label: 'Bog and fen', fx: 'fog', biomes: ['#4f6b3a', '#44603c', '#5a6e3e'], nouns: ['Bog', 'Fen', 'Mire', 'Hollows'], words: ['bog', 'swamp', 'fen', 'mire', 'moist', 'goo', 'marsh', 'slime'], blurb: ['Everything is damp and watching you.', 'Reeds, puddles, and fog that smells like opinions.'] },
  crystal: { label: 'Crystal spires', fx: 'aurora', biomes: ['#6b5aa8', '#5a62b4', '#7a58b0'], nouns: ['Spires', 'Shards', 'Glassfields', 'Prism'], words: ['crystal', 'glass', 'shard', 'prism', 'spire', 'gem', 'quartz'], blurb: ['Spikes of glassy ore hum in the light.', 'Tall crystal needles throw rainbows and bad advice.'] },
  fungal: { label: 'Fungal forest', fx: 'spores', biomes: ['#6b3c6b', '#7a3c70', '#58407a'], nouns: ['Sporeland', 'Cap Forest', 'Mold', 'Gills'], words: ['fung', 'spore', 'mold', 'mushroom', 'shroom', 'cap', 'gill', 'rot'], blurb: ['Giant caps glow in the dark. Do not lick them again.', 'Spore clouds drift between trunks the size of houses.'] },
  canyon: { label: 'Layered canyon', fx: 'meteor', biomes: ['#9a5a3a', '#8a4e3a', '#a8663e'], nouns: ['Canyon', 'Gulch', 'Teeth', 'Rift'], words: ['canyon', 'gulch', 'teeth', 'rift', 'chasm', 'gorge', 'cliff'], blurb: ['Striped walls drop away into a hundred opinions.', 'A deep scar of banded rock. Echoes arrive late.'] },
  saltflat: { label: 'Salt flats', fx: 'haze', biomes: ['#cfc8b8', '#c4beae', '#d8d0c0'], nouns: ['Flats', 'Pan', 'Mirror', 'Bleach'], words: ['salt', 'flat', 'pan', 'mirror', 'bleach', 'white', 'plain'], blurb: ['Blinding and flat. The horizon wobbles.', 'Cracked white crust and a sky that goes on forever.'] },
};
export const TERRAIN_IDS = Object.keys(TERRAINS);

export function inferTerrain(name, blurb, biome) {
  const text = `${name || ''} ${blurb || ''}`.toLowerCase();
  let best = null; let bestScore = 0;
  for (const id of TERRAIN_IDS) { const score = TERRAINS[id].words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0); if (score > bestScore) { best = id; bestScore = score; } }
  if (best) return best;
  if (!biome) return null;
  let bestId = null; let bestD = 1e9;
  for (const id of TERRAIN_IDS) for (const b of TERRAINS[id].biomes) { const d = dist(biome, b); if (d < bestD) { bestD = d; bestId = id; } }
  return bestD < 90 ? bestId : null;
}

/* ore slots line up with the sandbox's seven ore ids, in order */
const ORE_SLOTS = [
  { tier: 0, cats: ['metal', 'organic'] }, { tier: 0, cats: ['metal', 'gas'] }, { tier: 1, cats: ['metal', 'organic'] },
  { tier: 1, cats: ['gas', 'organic'] }, { tier: 2, cats: ['crystal'] }, { tier: 3, cats: ['crystal', 'metal'] }, { tier: 4, cats: ['exotic'] },
];
const POOL = {
  metal: ['Rustmeat', 'Grumblesteel', 'Bonzium', 'Clankite', 'Ferrogoo', 'Spite Iron', 'Gnawed Copper', 'Tantrumite', 'Core Gold'],
  crystal: ['Sobstone', 'Screamquartz', 'Glintbone', 'Prism Teeth', 'Shardlings', 'Mood Opal', 'Weepglass', 'Wailglass'],
  gas: ['Burpane', 'Wheezon', 'Gigglemist', 'Sighgas', 'Hiccupon', 'Yodel Vapor'],
  organic: ['Squishroot', 'Meatmoss', 'Bog Cheese', 'Larva Jelly', 'Fungal Bacon', 'Gristle Kelp'],
  exotic: ['Paradox Paste', 'Void Lint', 'Chronojam', 'Maybeium', 'Spare Gravity', 'Echo Dust'],
};
const SYL = ['gor', 'blu', 'zan', 'thr', 'ok', 'vex', 'mu', 'la', 'dro', 'qua', 'ix', 'pel', 'sno', 'rak', 'ul', 'bim', 'zorp'];
const ADJ = ['Crusty', 'Grumpy', 'Wailing', 'Molten', 'Gooey', 'Bitter', 'Spiteful', 'Sticky', 'Haunted', 'Moist', 'Furious', 'Sleepy'];
const LNOUN = ['Topsoil', 'Clay', 'Shale', 'Mantle', 'Core'];
const procName = (R) => `${cap1(pick(R, SYL) + pick(R, SYL) + pick(R, SYL))}-${2 + Math.floor(R() * 97)}`;

function proceduralSky(R) {
  const h0 = R() * 360; const h1 = h0 + 40 + R() * 90;
  return [hsl(h0, 0.55, 0.1 + R() * 0.08), hsl(h1, 0.7 + R() * 0.2, 0.52 + R() * 0.16)];
}
function pickOreColors(R, wanted) {
  const out = [];
  const base = R() * 360;
  for (let i = 0; i < 7; i += 1) {
    let col = wanted[i];
    if (!col || out.some((c) => dist(c, col) < 60)) {
      for (let tries = 0; tries < 20; tries += 1) {
        const cand = hsl(base + i * (360 / 7) + R() * 24, 0.55 + R() * 0.35, 0.5 + R() * 0.14);
        if (out.every((c) => dist(c, cand) >= 60)) { col = cand; break; }
      }
    }
    out.push(col || hsl(base + i * 51, 0.7, 0.6));
  }
  return out;
}

export function buildPlanet(raw, seed) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const R = rng(hash(seed));
  const sky = Array.isArray(raw.sky) && hex(raw.sky[0]) && hex(raw.sky[1]) ? [hex(raw.sky[0]), hex(raw.sky[1])] : proceduralSky(R);
  const surface = hex(raw.surface, hsl(hueOf(sky[1]) + 160 + R() * 40, 0.35, 0.3));
  const layers = [];
  for (let i = 0; i < 5; i += 1) {
    const L = (Array.isArray(raw.layers) && raw.layers[i]) || {};
    const fallback = sh(hexMix(surface, hsl(hueOf(surface) + 30 + R() * 30, 0.35, 0.18), i / 4.5), -0.1 * i / 4);
    layers.push({ name: str(L.name, `${pick(R, ADJ)} ${LNOUN[i]}`, 32), color: hex(L.color, fallback) });
  }
  // ores: one per sandbox slot, distinct hue, never repeating a name
  const seen = new Set(); const rawOres = Array.isArray(raw.ores) ? raw.ores : [];
  const colors = pickOreColors(R, ORE_SLOTS.map((_, i) => hex(rawOres[i] && rawOres[i].color)));
  const ores = ORE_SLOTS.map((slot, i) => {
    const o = rawOres[i] || {};
    const cat = ['metal', 'crystal', 'gas', 'organic', 'exotic'].includes(o.category) ? o.category : pick(R, slot.cats);
    let name = str(o.name, '', 24);
    if (!name || seen.has(name.toLowerCase())) name = pick(R, POOL[cat].filter((n) => !seen.has(n.toLowerCase()))) || `${cap1(pick(R, SYL))}ite`;
    seen.add(name.toLowerCase());
    return { slot: i, name, cat, tier: slot.tier, color: colors[i], blurb: str(o.blurb, '', 90) };
  });
  // moons: colour, size and count are part of the planet's identity
  const rawMoons = Array.isArray(raw.moons) ? raw.moons.slice(0, 3) : [];
  const moonCount = rawMoons.length || 1 + Math.floor(R() * 3);
  const moons = Array.from({ length: moonCount }, (_, i) => {
    const m = rawMoons[i] || {};
    return { color: hex(m.color, sh(sky[1], 0.35 + R() * 0.25)), size: m.size === 'small' ? 0 : m.size === 'large' ? 1 : (R() < 0.5 ? 0 : 1) };
  });
  const starColor = hex(raw.stars, R() < 0.5 ? '#ffffff' : sh(sky[1], 0.7));
  // regions
  const rawRegions = Array.isArray(raw.regions) ? raw.regions.slice(0, 7) : [];
  const order = shuffle(R, TERRAIN_IDS); const used = new Set();
  const count = clamp(rawRegions.length || 5, 5, 7);
  const regions = Array.from({ length: count }, (_, i) => {
    const r = rawRegions[i] || {};
    let terrain = TERRAINS[r.terrain] ? r.terrain : inferTerrain(r.name, r.blurb, hex(r.color));
    if (!terrain || used.has(terrain)) terrain = order.find((t) => !used.has(t)) || pick(R, TERRAIN_IDS);
    used.add(terrain);
    const T = TERRAINS[terrain];
    const biome = hex(r.color, hexMix(pick(R, T.biomes), surface, 0.15));
    return {
      id: `r${i}`,
      name: str(r.name, `${pick(R, ADJ)} ${pick(R, T.nouns)}`, 32),
      blurb: str(r.blurb, pick(R, T.blurb), 90),
      terrain, biome, fx: T.fx,
    };
  });
  const name = str(raw.name, procName(R), 40);
  return {
    v: 1, id: raw.id || `p${hash(`${seed}id`).toString(36)}`, name,
    tagline: str(raw.tagline, pick(R, ['A planet that hates you personally.', 'Rich in ore. Richer in teeth.', 'The Maker made this one on a Monday.']), 90),
    story: str(raw.story, `${name} was assembled by the Maker out of leftover grudges and a bucket of ore. The crust is soft, the sky is expensive, and the locals have opinions.`, 800),
    sky, stars: starColor, moons, surface, layers, ores, regions, prompt: raw.prompt || '', ai: !!raw.ai,
  };
}

export function defaultPlanet() {
  return buildPlanet({
    name: 'Rustglass', tagline: 'Sunsets here are a billing event.', sky: ['#2a1446', '#ff8a5c'], surface: '#8a4f3d', moons: [{ color: '#ffd9a8', size: 'large' }, { color: '#b892ff', size: 'small' }],
    layers: [{ name: 'Crusty Topsoil', color: '#8a5a44' }, { name: 'Grumble Clay', color: '#6e4a5e' }, { name: 'Screaming Shale', color: '#4e3f6b' }, { name: 'Molten Regret', color: '#7a2e3a' }, { name: 'The Gooey Core', color: '#3b1f4f' }],
    ores: [
      { name: 'Ferrite', category: 'metal', color: '#cf8152' }, { name: 'Cobalt', category: 'metal', color: '#55a8d8' }, { name: 'Lithium', category: 'gas', color: '#93d0ae' },
      { name: 'Sulfur', category: 'organic', color: '#e6cd65' }, { name: 'Crystal', category: 'crystal', color: '#bb97e8' }, { name: 'Iridium', category: 'metal', color: '#90c5ce' }, { name: 'Mythic', category: 'exotic', color: '#ee9d58' },
    ],
    regions: [
      { name: 'Rustglass Basin', blurb: 'Red mesas ring a bowl of broken glass.', terrain: 'mesa', color: '#a8553a' },
      { name: 'Singing Dunes', blurb: 'The sand hums. Nobody trusts the humming.', terrain: 'dunes', color: '#d6a45a' },
      { name: 'Cinder Reach', blurb: 'Cones glow like bad ideas.', terrain: 'volcanic', color: '#6e2a22' },
      { name: 'Giggle Fen', blurb: 'Damp, foggy, and watching you.', terrain: 'swamp', color: '#4f6b3a' },
      { name: 'Prism Needles', blurb: 'Glassy spires throw rainbows.', terrain: 'crystal', color: '#6b5aa8' },
    ],
  }, 'rustglass');
}

export function newPlanetFromSeed() { return buildPlanet({}, `seed-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`); }

/* ---------- AI (bring your own key) ---------- */
export function aiSettings() {
  try { const s = JSON.parse(localStorage.getItem(AI_KEY) || '{}') || {}; if (!s.provider) s.provider = 'off'; return s; } catch { return { provider: 'off' }; }
}
export function saveAiSettings(s) { try { localStorage.setItem(AI_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
function parseJSON(t) {
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('The AI replied with something that was not JSON');
}
export async function askJSON(prompt) {
  const s = aiSettings();
  if (s.provider === 'anthropic') {
    if (!s.key) throw new Error('No Claude API key set');
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: s.model || 'claude-sonnet-5-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error(`Claude API ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
    const j = await r.json(); return parseJSON((j.content || []).map((b) => b.text || '').join(''));
  }
  if (s.provider === 'openai') {
    if (!s.key) throw new Error('No OpenAI key set');
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.key}` }, body: JSON.stringify({ model: s.model || 'gpt-5', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }) });
    if (!r.ok) throw new Error(`OpenAI ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
    const j = await r.json(); return parseJSON(j.choices[0].message.content);
  }
  throw new Error('AI is switched off. Pick an engine in Tools.');
}

export function planetPrompt(req) {
  return `You are THE MAKER, a bored, theatrical cosmic entity who builds absurd, darkly funny alien mining planets for a pixel-art mining tycoon.
${req ? `The player's request: """${String(req).slice(0, 600)}"""\nHonor the spirit of the request, but you decide the details.` : 'No request this time. Improvise something memorable.'}
The planet is drawn as a pixel-art cutaway: a sky with a gradient, stars, one to three moons, a surface, five rock layers and a row of ore deposits, plus a ring of regions that each LOOK different.
Reply with ONLY a JSON object:
{"name":"planet name","tagline":"<=12 words","story":"2-3 punchy, darkly funny sentences",
"sky":["#hex top of sky (dark)","#hex horizon (bright)"],"stars":"#hex","moons":[1-3 objects: {"color":"#hex","size":"large|small"}],"surface":"#hex ground",
"layers":[5 objects shallow to deep: {"name":"","color":"#hex"}],
"ores":[exactly 7 objects, in this tier order 0,0,1,1,2,3,4: {"name":"","category":"metal|crystal|gas|organic|exotic","color":"#hex, a clearly different hue for every ore","blurb":"<=12 words"}],
"regions":[5 objects, each a DIFFERENT landscape: {"name":"","blurb":"<=12 words","color":"#hex ground tint","terrain":"${TERRAIN_IDS.join('|')}"}]}
Choose every colour on purpose so this planet looks nothing like the last one. Exotic is tier 4 only. Keep names short.`;
}

export async function generatePlanetAI(req) {
  const raw = await askJSON(planetPrompt(req));
  return buildPlanet({ ...raw, prompt: req || '', ai: true }, `ai-${Date.now().toString(36)}`);
}

export function loadPlanet() {
  try {
    const w = JSON.parse(localStorage.getItem(PLANET_KEY) || 'null');
    if (w && w.planet && w.planet.v === 1 && Array.isArray(w.planet.regions) && w.planet.regions.length) return { planet: w.planet, regionId: w.planet.regions.some((r) => r.id === w.regionId) ? w.regionId : w.planet.regions[0].id };
  } catch { /* fall back */ }
  const planet = defaultPlanet();
  return { planet, regionId: planet.regions[0].id };
}
export function savePlanet(planet, regionId) { try { localStorage.setItem(PLANET_KEY, JSON.stringify({ planet, regionId })); } catch { /* storage unavailable */ } }
