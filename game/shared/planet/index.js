/* Planet API for Mineshaft Capital v2 (see game/DESIGN.md, "Planet API").
 * Pure: no DOM, no I/O, no Math.random. Runs in Node and in the browser at /shared/planet/index.js.
 *
 *   improvisePlanet(seed, { history })  -> planet   (no AI; built-in themes, avoids recent ones)
 *   planetPrompt({ request, history })  -> string   (asks the AI for ONLY a JSON object)
 *   planetFromAI(raw, seed)             -> planet   (validates, clamps and fills every gap; never trusts raw)
 *   oreSpriteSpec(ore)                  -> { palette, shape, sparkle, seed }
 *   planetSummary(planet)               -> short object for the next month's history
 *
 * planet = { id, seed, name, theme, themeId, mood, motifs, tagline, story, sky: [top, horizon], stars, surface,
 *   moons: [{ color, size (radius in art pixels, 4-18), x, y (0..1 of the sky box) }],
 *   layers: [5 { name, color }] shallow -> deep,
 *   regions: [12-18 { id, name, terrain, biomes: [3 hex], blurb, weather, x, y (0..1000 map), neighbors: [ids],
 *     common: oreId, soil 0.75-1.35, tough: bool, temperature -1..1 }]  (numbers come from layout.js, seeded),
 *   sites: [~3-6 per region { id, regionId, name, x, y, soil, richness: {oreId: 0-1}, veinSize: {oreId: 0.6-1.6}, start, score }],
 *   ores: [7 { id, name, tier, hardness, depthMin, baseValue, color, palette, shape, use, useId, description }],
 *   buyers: [4 { id, name, blurb, distance: 'near'|'mid'|'far', units, offPlanet, leave, likes: { [oreId]: 0.8-1.4 } }], ai: bool } */
import { hash, rng, clamp, pick, shuffle, hsl, hexOr, mix, shade, adjust, toHsl, cleanText, slug, num } from './util.js';
import { TERRAINS, TERRAIN_IDS, WEATHER, WEATHER_IDS, inferTerrain } from './terrains.js';
import { THEMES, THEME_IDS } from './themes.js';
import { applyLayout, regionCountFor, regionNeighbors, MIN_SITE_GAP } from './layout.js';
import { SHAPES, TIERS, USES, USE_IDS, TIER_RULES, improviseOres, cleanOre, oreSpriteSpec, orePalette } from './ores.js';

export { TERRAINS, TERRAIN_IDS, WEATHER, WEATHER_IDS, inferTerrain, THEMES, THEME_IDS, SHAPES, TIERS, USES, USE_IDS, TIER_RULES, oreSpriteSpec, orePalette };
export { applyLayout, regionCountFor, regionNeighbors, MIN_SITE_GAP };
export * as color from './util.js';

export const MAPW = 1000;
const LAYER_NOUNS = [['Topsoil', 'Crust', 'Rind', 'Skin'], ['Clay', 'Loam', 'Marl'], ['Shale', 'Bedrock', 'Slate'], ['Mantle', 'Deepstone', 'Underbelly'], ['Core', 'Heart', 'Basement']];
const DISTANCES = ['near', 'mid', 'far'];

/* buyers anyone might be: a name, blurb and the uses they pay extra for */
const BUYERS = [
  ['Kessa Orbital Shipyards', 'Builds hulls by the mile and pays by the ton.', ['hull', 'insulation', 'propellant', 'gravity']],
  ['The Imperial Treasury', 'Buys shiny things to stare at during wars.', ['jewelry', 'art', 'time', 'souls']],
  ['Free Port Haggle', 'A smuggler moon. Pays cash, forgets faces.', ['weapons', 'fuel', 'navigation']],
  ['Saint Vex Hospital Fleet', 'Floating hospitals with a strict no-questions policy.', ['medicine', 'cryo', 'terraform']],
  ['Warp Union Depot', 'Unionized warp engineers. Strike every third Tuesday.', ['warp', 'fuel', 'comms', 'time']],
  ['Archduke Plimbo', 'An extremely rich man with extremely specific tastes.', ['jewelry', 'art', 'souls']],
  ['The Terraform Trust', 'Turns dead rocks into suburbs, one lawsuit at a time.', ['terraform', 'gravity', 'cryo']],
  ['Deep Dark Compute', 'A server farm the size of a moon. Always hungry.', ['computing', 'comms', 'cryo']],
  ['Fleet Admiral Grosk', 'Needs ammunition, armour and a better attitude.', ['weapons', 'shields', 'hull']],
  ['Shieldwall Mutual', 'Insurance company that sells shields to its own customers.', ['shields', 'insulation', 'gravity']],
];

/* ---------- pieces ---------- */
function themeSky(R, theme) {
  const h1 = theme.hue[0] + R() * (theme.hue[1] - theme.hue[0]); const h0 = h1 + (R() < 0.5 ? -1 : 1) * (30 + R() * 60);
  return [hsl(h0, 0.5 + R() * 0.2, 0.08 + R() * 0.08), hsl(h1, 0.6 + R() * 0.3, 0.5 + R() * 0.18)];
}
function makeMoons(R, sky, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    let x = 0.5; let y = 0.3;
    for (let k = 0; k < 20; k += 1) { x = 0.1 + R() * 0.8; y = 0.12 + R() * 0.36; if (out.every((m) => Math.hypot(m.x - x, m.y - y) > 0.3)) break; }
    const c = hsl(toHsl(sky[1])[0] + 90 + i * 110 + R() * 60, 0.25 + R() * 0.45, 0.62 + R() * 0.22);
    out.push({ color: c, size: Math.round(i === 0 ? 9 + R() * 8 : 4 + R() * 7), x: +x.toFixed(3), y: +y.toFixed(3) });
  }
  return out;
}
function makeLayers(R, surface, adj) {
  // rock reads as rock: earthy, distinct bands that walk the hue and darken with depth
  const [h0, s0] = toHsl(surface); const dir = R() < 0.5 ? -1 : 1; const stepH = 18 + R() * 22;
  return LAYER_NOUNS.map((nouns, i) => ({
    name: `${pick(R, adj)} ${pick(R, nouns)}`,
    color: hsl(h0 + dir * stepH * i + (i % 2 ? 10 : 0), clamp(s0 * 0.8 + (i % 2 ? -0.08 : 0.06) + (i === 4 ? 0.15 : 0), 0.18, 0.6), clamp(0.4 - i * 0.055 + (i % 2 ? -0.03 : 0.02), 0.12, 0.5)),
  }));
}
function makeRegion(R, i, terrain, surface, adj, pos, usedNames) {
  const T = TERRAINS[terrain];
  let name = '';
  for (let k = 0; k < 8 && (!name || usedNames.has(name)); k += 1) name = `${pick(R, adj)} ${pick(R, T.nouns)}`;
  usedNames.add(name);
  return { id: `r${i}`, name, terrain, biomes: T.biomes.map((b) => mix(b, surface, 0.1)), blurb: pick(R, T.blurb), weather: T.fx, x: pos.x, y: pos.y };
}
function makeBuyers(R, theme, ores) {
  const themed = theme ? theme.buyers.map(([name, blurb]) => [name, blurb, shuffle(R, USE_IDS).slice(0, 3)]) : [];
  const pool = themed.concat(shuffle(R, BUYERS)).slice(0, 4);
  const dists = shuffle(R, ['near', 'mid', 'far', pick(R, DISTANCES)]);
  return pool.map(([name, blurb, focus], i) => ({ id: `b${i}`, name, blurb, distance: dists[i], ...tripFor(R, dists[i]), likes: likesFor(R, focus, ores) }));
}
/* trip length in units. near = on the planet (1-8); mid 10-30 and far 31-60 are off-planet, which also costs 8 to leave the surface */
const UNIT_BANDS = { near: [1, 8], mid: [10, 30], far: [31, 60] };
function tripFor(R, distance) {
  const [a, b] = UNIT_BANDS[distance] || UNIT_BANDS.mid;
  return { units: a + Math.floor(R() * (b - a + 1)), offPlanet: distance !== 'near', leave: distance !== 'near' ? 8 : 0 };
}
function likesFor(R, focus, ores) {
  const likes = {};
  for (const o of ores) likes[o.id] = +(focus.includes(o.useId) ? 1.25 + R() * 0.15 : 0.8 + R() * 0.3).toFixed(2);
  return likes;
}

/* ---------- improvised (no AI) ---------- */
function recentThemeIds(history) {
  const h = Array.isArray(history) ? history.slice(-6) : [];
  const ids = new Set();
  for (const e of h) {
    if (!e || typeof e !== 'object') continue;
    if (THEME_IDS.includes(e.themeId)) ids.add(e.themeId);
    const text = `${e.theme || ''} ${e.name || ''}`.toLowerCase();
    for (const t of THEMES) if (text && (t.names.some((n) => text.includes(n.toLowerCase())) || text.includes(t.concept.toLowerCase().slice(0, 30)))) ids.add(t.id);
  }
  return ids;
}

export function improvisePlanet(seed, { history = [] } = {}) {
  seed = String(seed ?? 'seed');
  const R = rng(hash(`planet:${seed}`));
  const recent = recentThemeIds(history);
  const fresh = THEMES.filter((t) => !recent.has(t.id));
  const theme = pick(R, fresh.length ? fresh : THEMES);
  return buildFromTheme(R, seed, theme);
}

function buildFromTheme(R, seed, theme) {
  const sky = themeSky(R, theme);
  const surface = hsl(toHsl(sky[1])[0] + (R() < 0.5 ? -1 : 1) * (25 + R() * 45), 0.22 + R() * 0.16, 0.3 + R() * 0.1);
  const ores = improviseOres(R, theme);
  const count = regionCountFor(seed);
  const terrains = shuffle(R, theme.terrains).concat(shuffle(R, TERRAIN_IDS.filter((t) => !theme.terrains.includes(t)))).slice(0, count);
  const usedNames = new Set();
  const regions = terrains.map((t, i) => makeRegion(R, i, t, surface, theme.adj, { x: 0, y: 0 }, usedNames));
  const sites = applyLayout(seed, regions, ores);
  const name = pick(R, theme.names);
  const story = [theme.story[0], ...shuffle(R, theme.story.slice(1, 3)), theme.story[3]].join(' ');
  return {
    id: `p${hash(`${seed}:id`).toString(36)}`, seed, name, theme: theme.concept, themeId: theme.id, mood: theme.mood, motifs: theme.motifs.slice(),
    tagline: pick(R, theme.tag), story, sky, stars: R() < 0.5 ? '#ffffff' : shade(sky[1], 0.7), surface,
    moons: makeMoons(R, sky, 1 + Math.floor(R() * 3)), layers: makeLayers(R, surface, theme.adj), regions, sites, ores,
    buyers: makeBuyers(R, theme, ores), ai: false,
  };
}

/* ---------- AI ---------- */
function historyBlock(history) {
  const h = (Array.isArray(history) ? history : []).filter((e) => e && typeof e === 'object').slice(-10);
  if (!h.length) return 'None yet. Anything goes.';
  return h.map((e) => `- ${cleanText(e.name, '?', 40)}: "${cleanText(e.theme, '', 140)}"${Array.isArray(e.terrains) ? ` | landscapes: ${e.terrains.slice(0, 7).join(', ')}` : ''}${Array.isArray(e.ores) ? ` | ores: ${e.ores.slice(0, 7).map((o) => cleanText(String(o), '', 30)).join(', ')}` : ''}${Array.isArray(e.sky) ? ` | sky ${e.sky.join('->')}` : ''}`).join('\n');
}

export function planetPrompt({ request = '', history = [] } = {}) {
  const req = cleanText(request, '', 600);
  const terrains = TERRAIN_IDS.map((id) => `${id} (${TERRAINS[id].group === 'alien' ? 'alien' : 'earthlike'}: ${TERRAINS[id].label})`).join(', ');
  return `You are the Maker Guild's planet designer. The Guild grants mining rights on one new planet each month for Mineshaft Capital, a multiplayer pixel-art mining game. Your planets are vivid, strange and darkly funny.

${req ? `This month's winner made a request. Honor it; you choose the details:\n"""${req}"""` : 'Nobody made a request this month. Surprise us.'}

STEP 1. Pick ONE central theme with a strong personality (examples of the kind of thing: a candy world where dessert fights back, a haunted bone-yard, a dead neon city). Everything grows from it: name, tagline, story, sky and moon colours, rock layers, region names, landscapes, ore names, ore colours, ore shapes and buyers. A reader should guess the theme from the ore list alone.

STEP 2. Make it clearly different from the planets of earlier months: new theme, new naming style, new palette, a different mix of landscapes, new ore vocabulary.
EARLIER PLANETS:
${historyBlock(history)}

STEP 3. Ores. Exactly 7: 2 common, 4 rare, 1 mythic. Invent each ore from the theme AND a galactic use for it (hull plating, hull insulation, warp coils, reactor fuel, medicine, luxury jewelry, weapons, computing cores, terraforming, shields, navigation, coolant, propellant, time clocks, artificial gravity, ship AI...). Example: on a candy world "Gumdrop Quartz, used in starship hull insulation". The ore's colours and crystal shape should follow from its theme and use. Each ore gets a clearly different colour.
Shapes: ${SHAPES.join(', ')}.
Tier rules: common hardness 1-3, depthMin 0, baseValue 1-3. rare hardness 3-7, depthMin 2-12, baseValue 8-60, rising together. mythic hardness 9-10, depthMin 16-20, baseValue 300-600.

STEP 4. Regions. Up to 7 flavour regions (the Guild adds the rest and decides where everything sits), each a DIFFERENT landscape chosen from these terrain keys:
${terrains}.
Do not give coordinates, soil, temperature or distances; the Guild surveyor sets every number. Weather keys: ${WEATHER_IDS.join(', ')} (pick what fits each region).

STEP 5. Buyers. 4 off-world buyers with personality. likes maps every ore id to a price multiplier from 0.8 to 1.4 (what they want most is near 1.4).

Reply with ONLY a JSON object, no prose, no code fences:
{"name":"planet name","theme":"one sentence central theme","mood":"2-4 words","motifs":["3-5 single words"],
"tagline":"<=12 words","story":"3-4 punchy, darkly funny sentences",
"sky":["#hex top of sky (dark)","#hex horizon (bright)"],"stars":"#hex","surface":"#hex ground",
"moons":[0-3 of {"color":"#hex","size":4-18,"x":0-1,"y":0-1}],
"layers":[exactly 5, shallow to deep, {"name":"","color":"#hex"}],
"regions":[up to 7 of {"name":"","terrain":"terrain key","biomes":["#hex","#hex","#hex"],"blurb":"<=14 words","weather":"weather key"}],
"ores":[exactly 7 of {"id":"lowercase-slug","name":"<=24 chars","tier":"common|rare|mythic","hardness":1-10,"depthMin":0-20,"baseValue":number,"color":"#hex","palette":["#hex dark","#hex mid","#hex light","#hex highlight"],"shape":"one shape","use":"its galactic use","description":"<=20 words, darkly funny"}],
"buyers":[exactly 4 of {"name":"","blurb":"<=14 words","distance":"near|mid|far","likes":{"ore-id":1.2}}]}`;
}

/* AI replies can be strings, chatty, fenced or plain garbage */
function parseRaw(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};
  const s = raw.replace(/```(?:json)?/gi, '');
  try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { /* try the braces */ }
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { const v = JSON.parse(s.slice(a, b + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { /* give up */ } }
  return {};
}
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function planetFromAI(raw, seed) {
  seed = String(seed ?? 'ai');
  const r = parseRaw(raw);
  const base = improvisePlanet(seed, { history: [] });
  const R = rng(hash(`ai:${seed}`));
  const themeText = typeof r.theme === 'string' ? r.theme : obj(r.theme).concept;
  const themeObj = obj(r.theme);

  const sky = arr(r.sky).length >= 2 && hexOr(r.sky[0], null) && hexOr(r.sky[1], null) ? [hexOr(r.sky[0]), hexOr(r.sky[1])] : base.sky;
  const surface = hexOr(r.surface, base.surface);

  const moons = !Array.isArray(r.moons) ? base.moons : r.moons.slice(0, 3).map((m, i) => {
    const o = obj(m); const b = base.moons[i % base.moons.length];
    const size = o.size === 'large' ? 14 : o.size === 'small' ? 6 : clamp(Math.round(num(o.size, b.size)), 4, 18);
    return { color: hexOr(o.color, b.color), size, x: +clamp(num(o.x, b.x), 0.05, 0.95).toFixed(3), y: +clamp(num(o.y, b.y), 0.05, 0.6).toFixed(3) };
  });

  const layers = base.layers.map((b, i) => { const o = obj(arr(r.layers)[i]); return { name: cleanText(o.name, b.name, 32), color: hexOr(o.color, b.color) }; });

  // regions: the AI supplies flavour for up to 7 (terrain, names, colours, weather); the rest come from the improvised base.
  // Count, positions, common zones, soil, tough ground and temperature are all seeded (layout.js).
  const rawRegions = arr(r.regions).slice(0, 7);
  const count = base.regions.length;
  const usedT = new Set(); const usedNames = new Set();
  const spare = shuffle(R, base.regions.map((x) => x.terrain).concat(TERRAIN_IDS));
  const regions = Array.from({ length: count }, (_, i) => {
    if (i >= rawRegions.length) { const f = { ...base.regions[i], id: `r${i}` }; if (usedNames.has(f.name)) f.name = `${f.name} ${i + 1}`; usedNames.add(f.name); return f; }
    const o = obj(rawRegions[i]);
    const name0 = cleanText(o.name, '', 32);
    let terrain = typeof o.terrain === 'string' && TERRAINS[o.terrain.trim().toLowerCase()] ? o.terrain.trim().toLowerCase() : inferTerrain(`${o.terrain || ''} ${name0}`, typeof o.blurb === 'string' ? o.blurb : '', arr(o.biomes)[0] || o.color);
    if (!terrain || (usedT.has(terrain) && rawRegions.length <= TERRAIN_IDS.length)) terrain = spare.find((t) => !usedT.has(t)) || pick(R, TERRAIN_IDS);
    usedT.add(terrain);
    const T = TERRAINS[terrain];
    const fb = makeRegion(R, i, terrain, surface, themeObj.adjectives || ['Bleak', 'Grim', 'Distant', 'Lost', 'Restless', 'Crooked'], { x: 0, y: 0 }, usedNames);
    let name = name0 || fb.name; if (usedNames.has(name) && name0) name = `${name} ${i + 1}`; usedNames.add(name);
    const biomes = arr(o.biomes).map((c) => hexOr(c, null)).filter(Boolean).slice(0, 3);
    while (biomes.length < 3) biomes.push(hexOr(o.color, null) || fb.biomes[biomes.length]);
    const weather = typeof o.weather === 'string' && WEATHER[o.weather.trim().toLowerCase()] ? o.weather.trim().toLowerCase() : T.fx;
    return { id: `r${i}`, name, terrain, biomes, blurb: cleanText(o.blurb, fb.blurb, 100), weather, x: 0, y: 0 };
  });

  // ores: exactly 2 common, 4 rare, 1 mythic, whatever arrived
  const queues = { common: [], rare: [], mythic: [], any: [] };
  for (const o of arr(r.ores).slice(0, 14)) { const t = obj(o).tier; (queues[t] || queues.any).push(o); }
  const rank = { common: 0, rare: 0, mythic: 0 };
  const ores = TIERS.map((tier, i) => {
    const src = queues[tier].shift() ?? queues.any.shift();
    return cleanOre(src, base.ores[i], tier, R, rank[tier]++);
  });
  // unique ids and names
  const ids = new Set(); const names = new Set();
  for (const [i, o] of ores.entries()) {
    if (names.has(o.name.toLowerCase())) o.name = base.ores[i].name;
    names.add(o.name.toLowerCase());
    if (!o.id || ids.has(o.id)) o.id = `${slug(o.name) || 'ore'}-${i}`;
    ids.add(o.id);
  }
  // rares sorted so deeper means harder and pricier, as the engine expects
  const rares = ores.slice(2, 6).sort((a, b) => a.depthMin - b.depthMin || a.baseValue - b.baseValue);
  ores.splice(2, 4, ...rares);

  const sites = applyLayout(seed, regions, ores);

  const byName = new Map(ores.map((o) => [o.name.toLowerCase(), o.id]));
  const rawBuyers = arr(r.buyers).slice(0, 4);
  const buyers = base.buyers.map((b, i) => {
    const o = obj(rawBuyers[i]); const likes = {}; const rl = obj(o.likes);
    for (const ore of ores) likes[ore.id] = 1;
    for (const [k, v] of Object.entries(rl)) {
      const id = ores.some((x) => x.id === k) ? k : byName.get(String(k).toLowerCase()) || ores.find((x) => x.id === slug(k))?.id;
      if (id) likes[id] = +clamp(num(v, 1), 0.8, 1.4).toFixed(2);
    }
    if (!rawBuyers[i]) for (const ore of ores) likes[ore.id] = +(0.8 + R() * 0.6).toFixed(2);
    const distance = DISTANCES.includes(o.distance) ? o.distance : b.distance;
    return { id: `b${i}`, name: cleanText(o.name, b.name, 40), blurb: cleanText(o.blurb, b.blurb, 100), distance, ...tripFor(R, distance), likes };
  });

  const motifs = arr(r.motifs).length ? arr(r.motifs) : arr(themeObj.motifs);
  return {
    id: `p${hash(`${seed}:id`).toString(36)}`, seed, name: cleanText(r.name, base.name, 40),
    theme: cleanText(themeText, base.theme, 160), themeId: 'ai', mood: cleanText(r.mood || themeObj.mood, base.mood, 40),
    motifs: motifs.map((m) => cleanText(m, '', 20)).filter(Boolean).slice(0, 5),
    tagline: cleanText(r.tagline, base.tagline, 90), story: cleanText(r.story, base.story, 600),
    sky, stars: hexOr(r.stars, base.stars), surface, moons, layers, regions, sites, ores, buyers, ai: true,
  };
}

export function planetSummary(planet) {
  const p = obj(planet);
  return {
    id: p.id, name: p.name, themeId: p.themeId || null, theme: p.theme, sky: arr(p.sky).slice(0, 2),
    terrains: arr(p.regions).map((r) => r.terrain), ores: arr(p.ores).map((o) => o.name), uses: arr(p.ores).map((o) => o.useId || o.use),
  };
}
