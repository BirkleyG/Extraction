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

/* 30 more regions: 20 terrestrial, 10 alien / sci-fi. Their skylines and ground decor live in terrains.js. */
const mk = (group, label, fx, biomes, nouns, words, blurb) => ({ group, label, fx, biomes, nouns, words, blurb });
for (const id of ['mesa', 'dunes', 'glacier', 'volcanic', 'swamp', 'canyon', 'saltflat']) TERRAINS[id].group = 'earth';
for (const id of ['crystal', 'fungal']) TERRAINS[id].group = 'alien';
Object.assign(TERRAINS, {
  forest: mk('earth', 'Temperate forest', 'fireflies', ['#4a7a3a', '#3e6a34', '#56803c'], ['Woods', 'Greenwood', 'Timber', 'Glade'], ['wood', 'forest', 'grove', 'glade', 'timber', 'oak'], ['Round canopies and the sound of something chewing.', 'Quiet trees. Suspiciously quiet.']),
  jungle: mk('earth', 'Steaming jungle', 'rain', ['#2f7a3a', '#2a6a40', '#3a8a44'], ['Jungle', 'Canopy', 'Tangle', 'Vinewall'], ['jungle', 'canopy', 'vine', 'tangle', 'rainforest', 'steam'], ['Wet, loud, and every leaf has teeth.', 'The rain never stops and neither do the vines.']),
  savanna: mk('earth', 'Golden savanna', 'wind', ['#c8a04a', '#b89040', '#d4aa52'], ['Savanna', 'Veldt', 'Grasslands', 'Plain'], ['savanna', 'veldt', 'grassland', 'acacia', 'safari'], ['Flat-topped trees and a very patient horizon.', 'Golden grass, long shadows, short tempers.']),
  tundra: mk('earth', 'Frozen tundra', 'snow', ['#9aa8a0', '#8c9a98', '#a8b4aa'], ['Tundra', 'Barrens', 'Permafrost', 'Whiteout'], ['tundra', 'permafrost', 'barren', 'arctic', 'whiteout'], ['Low, bitter, and flat as a rejected invoice.', 'Snow patches and a wind with opinions.']),
  taiga: mk('earth', 'Pine taiga', 'snow', ['#3a5a4a', '#34524a', '#456a52'], ['Taiga', 'Pinewall', 'Needle Reach', 'Firmark'], ['taiga', 'pine', 'fir', 'spruce', 'needle', 'conifer'], ['Rows of dark pines that all look disappointed.', 'Needles, snow, and a lot of quiet.']),
  prairie: mk('earth', 'Rolling prairie', 'wind', ['#8aa04a', '#7a9444', '#9aae52'], ['Prairie', 'Meadow', 'Downs', 'Pasture'], ['prairie', 'meadow', 'plains', 'downs', 'pasture', 'grass'], ['Wildflowers to the horizon and nowhere to hide.', 'Soft green hills. Everything here is a trap.']),
  alpine: mk('earth', 'Alpine peaks', 'mist', ['#7a8a9a', '#6a7a8c', '#8a9aaa'], ['Peaks', 'Crags', 'Summit', 'Highridge'], ['alp', 'peak', 'summit', 'crag', 'mountain', 'highridge'], ['Snow-capped teeth that bite the clouds.', 'Thin air and thick lawsuits.']),
  islands: mk('earth', 'Island chain', 'wind', ['#2f8aa0', '#2a7a98', '#3a9ab0'], ['Isles', 'Archipelago', 'Atoll', 'Cays'], ['isle', 'island', 'atoll', 'archipelago', 'cay', 'lagoon'], ['Palm-topped rocks sulking in a bright sea.', 'A string of islands, each worse than the last.']),
  coast: mk('earth', 'Sea cliffs', 'wind', ['#7a8a7a', '#6a7e78', '#8a9a88'], ['Cliffs', 'Headland', 'Strand', 'Brink'], ['coast', 'cliff', 'sea', 'shore', 'headland', 'bay'], ['Stepped cliffs fall into a restless sea.', 'Salt wind and a very long drop.']),
  lakes: mk('earth', 'Lake country', 'mist', ['#4a8aa8', '#3a7a9a', '#5a9ab6'], ['Lakes', 'Mere', 'Tarns', 'Waters'], ['lake', 'mere', 'tarn', 'pond', 'water', 'mirror lake'], ['Still water and far blue mountains.', 'So calm it feels like a threat.']),
  badlands: mk('earth', 'Hoodoo badlands', 'wind', ['#a8704a', '#9a6244', '#b4805a'], ['Badlands', 'Hoodoos', 'Scarps', 'Pinnacles'], ['badland', 'hoodoo', 'scarp', 'pinnacle', 'gully'], ['Mushroom-capped rock pillars and no shade.', 'Eroded to the bone, then insulted.']),
  moor: mk('earth', 'Misty moor', 'mist', ['#6a5a7a', '#5e5a74', '#78628a'], ['Moor', 'Heath', 'Fells', 'Bleaks'], ['moor', 'heath', 'fell', 'heather', 'bleak'], ['Purple heather and a mist that lingers.', 'Bleak, soft, and full of standing stones.']),
  autumn: mk('earth', 'Autumn woodland', 'leaves', ['#b8602a', '#a85a2a', '#c8742e'], ['Hollow', 'Amberwood', 'Rustwood', 'Foliage'], ['autumn', 'amber', 'rustwood', 'fall', 'foliage'], ['Every tree is on fire in a polite way.', 'Falling leaves in the color of overdue rent.']),
  scrub: mk('earth', 'Dry scrubland', 'wind', ['#9a8a4a', '#8a7e46', '#a89a52'], ['Scrub', 'Chaparral', 'Brush', 'Outback'], ['scrub', 'chaparral', 'brush', 'outback', 'sage'], ['Low bushes and a lot of dust.', 'Thorny, flat, and proud of it.']),
  arches: mk('earth', 'Red-rock arches', 'wind', ['#c0603a', '#b05a3a', '#cc6c44'], ['Arches', 'Windows', 'Bridges', 'Slickrock'], ['arch', 'bridge', 'slickrock', 'window'], ['Natural stone bridges over nothing.', 'Wind carved doors that open to more wind.']),
  falls: mk('earth', 'Waterfall cliffs', 'mist', ['#5a8a6a', '#4a7c64', '#689a74'], ['Falls', 'Cascades', 'Spray', 'Plunge'], ['fall', 'cascade', 'waterfall', 'spray', 'plunge', 'rapids'], ['Ribbons of white water drop off green cliffs.', 'Loud, wet, and entirely uninsured.']),
  geysers: mk('earth', 'Geyser basin', 'steam', ['#b8a07a', '#a8946e', '#c4aa84'], ['Geysers', 'Steamfields', 'Sinter', 'Hotsprings'], ['geyser', 'steam', 'hot spring', 'sinter', 'boil'], ['Vents that cough scalding steam on a schedule.', 'The ground is mostly kettle.']),
  oasis: mk('earth', 'Palm oasis', 'haze', ['#c4a05a', '#b89450', '#d0ac64'], ['Oasis', 'Palms', 'Wells', 'Date Grove'], ['oasis', 'palm', 'well', 'date'], ['A few palms and the memory of water.', 'Green dots in a very large yellow argument.']),
  terraces: mk('earth', 'Rice terraces', 'mist', ['#6a9a4a', '#5e9046', '#78a652'], ['Terraces', 'Paddies', 'Steps', 'Stairs'], ['terrace', 'paddy', 'rice', 'stair', 'step'], ['Green steps climb a hill nobody asked for.', 'Flooded stairs reflecting the sky.']),
  redwoods: mk('earth', 'Redwood giants', 'mist', ['#6a4a34', '#5e4430', '#765236'], ['Redwoods', 'Sequoia', 'Columns', 'Giants'], ['redwood', 'sequoia', 'giant', 'column', 'trunk'], ['Trunks like pillars of a ruined cathedral.', 'Ancient trees that watch you and say nothing.']),
  skyislands: mk('alien', 'Floating islands', 'motes', ['#7a9ac8', '#6a8ab8', '#8aaad6'], ['Drifts', 'Floaters', 'Skyshelf', 'Hover'], ['float', 'sky', 'drift', 'hover', 'levit'], ['Chunks of land drifting like bad rumors.', 'Rock that forgot to fall.']),
  bones: mk('alien', 'Bone forest', 'fog', ['#c8bca4', '#bcb098', '#d4c8b0'], ['Ribcage', 'Bonefield', 'Marrow', 'Ossuary'], ['bone', 'rib', 'skull', 'marrow', 'ossu', 'skeleton'], ['A forest of ribs arching over a pale floor.', 'Something huge died here and the planet kept the frame.']),
  ruins: mk('alien', 'Neon ruins', 'glitch', ['#4a3a7a', '#3e3478', '#58428a'], ['Ruins', 'Megaplex', 'Grid', 'Downtown'], ['ruin', 'neon', 'city', 'grid', 'cyber', 'tower', 'megacity'], ['Dead towers with a few lights still pretending.', 'A city that outlived its landlords.']),
  tendrils: mk('alien', 'Tendril jungle', 'spores', ['#8a2a6a', '#7a2a5e', '#962e74'], ['Tendrils', 'Writhe', 'Kelp', 'Grasp'], ['tendril', 'writhe', 'tentacle', 'kelp', 'grasp', 'squirm'], ['Fleshy stalks sway without wind.', 'It is not seaweed and it is not on the sea.']),
  mirror: mk('alien', 'Mirror desert', 'haze', ['#9ac8d8', '#8ab8cc', '#aad4e2'], ['Mirrorplain', 'Glassfield', 'Reflect', 'Chrome'], ['mirror', 'silver', 'reflect', 'chrome', 'polish'], ['Polished flats and glass blades throw light everywhere.', 'You can see yourself getting a sunburn.']),
  hive: mk('alien', 'Hive towers', 'motes', ['#b8801e', '#a8741c', '#c48c26'], ['Hive', 'Comb', 'Honeywork', 'Swarm'], ['hive', 'comb', 'honey', 'swarm', 'wax', 'drone'], ['Waxy domed towers hum with distant wings.', 'Honeycomb architecture. Do not knock.']),
  monoliths: mk('alien', 'Black monoliths', 'aurora', ['#2a2a3e', '#242438', '#32324a'], ['Monoliths', 'Slabs', 'Obelisks', 'Standing'], ['monolith', 'slab', 'obelisk', 'standing', 'black'], ['Smooth black slabs stand in neat rows.', 'Nobody built them. They file taxes anyway.']),
  rifts: mk('alien', 'Reality rifts', 'glitch', ['#5a2a8a', '#4e2a82', '#66309a'], ['Rifts', 'Tears', 'Fault', 'Seam'], ['rift', 'tear', 'void', 'seam', 'paradox', 'fracture'], ['Rocks hang in the air around glowing cracks.', 'The sky has a zipper and it is open.']),
  scrapyard: mk('alien', 'Scrap titans', 'sparks', ['#6a6a72', '#5e5e68', '#767680'], ['Scrapyard', 'Boneyard', 'Junkfield', 'Rustheap'], ['scrap', 'junk', 'wreck', 'gear', 'machine', 'robot'], ['Wrecked machines the size of buildings.', 'Sparks, smoke, and piston ghosts.']),
  watchers: mk('alien', 'Watcher fields', 'motes', ['#7a3a8a', '#6e3680', '#86429a'], ['Watchers', 'Gazers', 'Stalks', 'Irisfield'], ['eye', 'watch', 'gaze', 'stalk', 'iris', 'blink'], ['Eyes on stalks follow you across the field.', 'Every hill is looking at the other hill.']),
});
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


/* Procedural planets get a personality too: one theme drives the name, palette, ores and which landscapes appear. */
const O = (name, cat) => ({ name, cat });
export const THEMES = [
  { id: 'sweet', concept: 'Everything here is dessert, and everything is trying to kill you.', mood: 'sickly cheerful', motifs: ['candy', 'syrup', 'frosting'], hue: [300, 350], terrains: ['terraces', 'prairie', 'islands', 'lakes', 'falls', 'autumn', 'forest', 'mirror'], names: ['Gumdrop-9', 'Treacle Prime', 'Sprinkle', 'Custard-4', 'Fudgewick'], adj: ['Sticky', 'Syrupy', 'Frosted', 'Crumbly', 'Candied', 'Gooey'], tag: ['A planet with a sweet tooth and a sharper one.', 'Delicious. Do not lick the ground.'], ores: [O('Caramelium', 'metal'), O('Licorite', 'metal'), O('Jellyroot', 'organic'), O('Sherbet Gas', 'gas'), O('Rock Candy', 'crystal'), O('Toffee Core', 'metal'), O('Frosting Void', 'exotic'), O('Marshmallow Ash', 'organic'), O('Gumdropite', 'crystal')] },
  { id: 'bureau', concept: 'A planet run by a very old, very angry bureaucracy.', mood: 'dry and petty', motifs: ['forms', 'stamps', 'queues'], hue: [30, 60], terrains: ['ruins', 'monoliths', 'scrapyard', 'badlands', 'prairie', 'scrub', 'saltflat'], names: ['Form-27B', 'Bureau Minor', 'Stamp Prime', 'Queue-9'], adj: ['Pending', 'Notarized', 'Filed', 'Overdue', 'Redacted', 'Stamped'], tag: ['Please take a number. The number is also ore.', 'Every cliff requires a permit.'], ores: [O('Red Tapium', 'metal'), O('Staplestone', 'metal'), O('Inkvapor', 'gas'), O('Filing Moss', 'organic'), O('Memoite', 'crystal'), O('Notarium', 'crystal'), O('Void Form', 'exotic'), O('Audit Dust', 'exotic'), O('Ledgerite', 'metal')] },
  { id: 'haunted', concept: 'The whole world is a graveyard that remembers you.', mood: 'mournful and sly', motifs: ['bones', 'ghosts', 'fog'], hue: [250, 290], terrains: ['bones', 'moor', 'swamp', 'monoliths', 'taiga', 'tundra', 'watchers', 'ruins'], names: ['Wraithmoor', 'Gravemere-3', 'Hollow Ash', 'Mourn-12'], adj: ['Haunted', 'Wailing', 'Sleepless', 'Pale', 'Hollow', 'Mourning'], tag: ['The ground is full and so are the ghosts.', 'Dig quietly. They are light sleepers.'], ores: [O('Ghoststeel', 'metal'), O('Bonegold', 'metal'), O('Cryptmoss', 'organic'), O('Sighgas', 'gas'), O('Wailglass', 'crystal'), O('Soulquartz', 'crystal'), O('Spectral Void', 'exotic'), O('Gravedust', 'organic'), O('Hauntium', 'exotic')] },
  { id: 'frontier', concept: 'A lawless frontier where every rock has a bounty.', mood: 'dusty swagger', motifs: ['outlaws', 'saloons', 'dynamite'], hue: [15, 40], terrains: ['badlands', 'arches', 'scrub', 'savanna', 'geysers', 'oasis', 'scrapyard', 'mesa', 'canyon'], names: ['Dustbucket', 'Brimstone Gulch', 'Last Chance-6', 'Spurtown'], adj: ['Lawless', 'Dusty', 'Wanted', 'Lonesome', 'Rowdy', 'Parched'], tag: ['Wanted: dead or mining.', 'The sheriff left. The rocks stayed.'], ores: [O('Gunmetal', 'metal'), O('Outlaw Gold', 'metal'), O('Snakeroot', 'organic'), O('Tumblegas', 'gas'), O('Sheriff Quartz', 'crystal'), O('Saloonite', 'crystal'), O('Bounty Void', 'exotic'), O('Dynamite Lily', 'organic'), O('Silver Spit', 'metal')] },
  { id: 'ocean', concept: 'Mostly water, and the rest is grudge.', mood: 'salty and moody', motifs: ['tides', 'wrecks', 'brine'], hue: [185, 215], terrains: ['islands', 'coast', 'lakes', 'falls', 'mirror', 'terraces', 'oasis'], names: ['Brinewick', 'Tidal Maw', 'Atoll-17', 'Saltmother'], adj: ['Salty', 'Drowned', 'Briny', 'Tidal', 'Sunken', 'Windblown'], tag: ['Come for the ore, stay for the damp.', 'The sea owns most of it and wants the rest.'], ores: [O('Kelp Iron', 'metal'), O('Wreckgold', 'metal'), O('Squidink', 'organic'), O('Tidegas', 'gas'), O('Pearlite', 'crystal'), O('Coral Glass', 'crystal'), O('Abyss Paste', 'exotic'), O('Brinestone', 'metal'), O('Leviathan Salt', 'exotic')] },
  { id: 'cyber', concept: 'A dead neon city grown over by machines.', mood: 'cold and glitchy', motifs: ['neon', 'static', 'machines'], hue: [270, 320], terrains: ['ruins', 'scrapyard', 'rifts', 'mirror', 'monoliths', 'hive', 'skyislands'], names: ['Neon-Null', 'Voltgrave', 'Cache-404', 'Static Prime'], adj: ['Glitched', 'Idle', 'Cached', 'Offline', 'Chromed', 'Looping'], tag: ['The lights are on. Nobody is home.', 'A city that outlived its landlords.'], ores: [O('Copperwire', 'metal'), O('Chrome Gold', 'metal'), O('Pixel Moss', 'organic'), O('Ozone', 'gas'), O('Datastone', 'crystal'), O('Glitchglass', 'crystal'), O('Null Void', 'exotic'), O('Firmware Ash', 'exotic'), O('Neonite', 'crystal')] },
  { id: 'garden', concept: 'An overgrown garden nobody has weeded in a billion years.', mood: 'lush and smug', motifs: ['roots', 'blossoms', 'dew'], hue: [90, 150], terrains: ['forest', 'jungle', 'falls', 'prairie', 'redwoods', 'autumn', 'lakes', 'terraces'], names: ['Verdance', 'Moss Eternal', 'Bloomreach', 'Thicket-5'], adj: ['Overgrown', 'Blooming', 'Dewy', 'Tangled', 'Mossy', 'Verdant'], tag: ['Weeds have won. Ore is the weeds now.', 'Everything is green and slightly smug.'], ores: [O('Rootiron', 'metal'), O('Briar Gold', 'metal'), O('Sapstone', 'organic'), O('Mistgas', 'gas'), O('Petal Glass', 'crystal'), O('Greenfire', 'crystal'), O('Seed of Void', 'exotic'), O('Pollenite', 'organic'), O('Loam', 'metal')] },
  { id: 'frozen', concept: 'A frozen world where even the silence is cold.', mood: 'hushed and brittle', motifs: ['ice', 'whiteout', 'breath'], hue: [190, 230], terrains: ['glacier', 'tundra', 'taiga', 'alpine', 'mirror', 'saltflat', 'moor', 'lakes'], names: ['Shiverhold', 'Frostmaw', 'Icicle-8', 'Cold Comfort'], adj: ['Frozen', 'Brittle', 'Hushed', 'Rimed', 'Whiteout', 'Bitter'], tag: ['Cold enough to freeze a good deal.', 'Even the profit margins shiver.'], ores: [O('Rimeiron', 'metal'), O('Coldsteel', 'metal'), O('Permamoss', 'organic'), O('Whitegas', 'gas'), O('Frostglass', 'crystal'), O('Cryoquartz', 'crystal'), O('Absolute Zero', 'exotic'), O('Snowgold', 'metal'), O('Glacier Salt', 'organic')] },
  { id: 'furnace', concept: 'A world that is mostly a bad idea on fire.', mood: 'hot-tempered', motifs: ['ash', 'embers', 'slag'], hue: [0, 30], terrains: ['volcanic', 'geysers', 'canyon', 'badlands', 'mesa', 'scrapyard', 'arches', 'dunes'], names: ['Cinderfall', 'Kiln-3', 'Ashmouth', 'Pyre Prime'], adj: ['Smoldering', 'Slagged', 'Scorched', 'Molten', 'Ashen', 'Searing'], tag: ['Warm welcome. Very warm.', 'The ground files complaints in lava.'], ores: [O('Slagiron', 'metal'), O('Hellgold', 'metal'), O('Charroot', 'organic'), O('Brimgas', 'gas'), O('Emberquartz', 'crystal'), O('Cinderglass', 'crystal'), O('Furnace Void', 'exotic'), O('Magma Pearl', 'exotic'), O('Soot', 'organic')] },
  { id: 'cosmic', concept: 'The universe is looking back, and it is not impressed.', mood: 'uneasy and watchful', motifs: ['eyes', 'dreams', 'tentacles'], hue: [265, 300], terrains: ['watchers', 'tendrils', 'rifts', 'monoliths', 'hive', 'bones', 'skyislands', 'crystal'], names: ['Gazemaw', 'Iris-9', 'The Wide Stare', 'Blink Prime'], adj: ['Watching', 'Dreaming', 'Unblinking', 'Writhing', 'Whispering', 'Lidless'], tag: ['It sees you digging.', 'Do not blink. It is not a metaphor.'], ores: [O('Voidmeat', 'organic'), O('Tentacle Salt', 'organic'), O('Dreamgas', 'gas'), O('Starjelly', 'organic'), O('Eyeglass', 'crystal'), O('Pupilite', 'crystal'), O('Unmaker', 'exotic'), O('Lull Quartz', 'crystal'), O('Ichorium', 'exotic')] },
  { id: 'safari', concept: 'A sun-baked safari park where the animals filed the lawsuit.', mood: 'warm and litigious', motifs: ['herds', 'dust', 'acacia'], hue: [20, 50], terrains: ['savanna', 'oasis', 'jungle', 'scrub', 'badlands', 'prairie', 'lakes', 'falls'], names: ['Maneland', 'Acacia-2', 'Grazing Prime', 'Dust Safari'], adj: ['Roaring', 'Dusty', 'Grazing', 'Sunbaked', 'Stampeding', 'Wild'], tag: ['The wildlife has lawyers.', 'Photograph the ore. Do not feed it.'], ores: [O('Mudiron', 'metal'), O('Savannagold', 'metal'), O('Baobab Salt', 'organic'), O('Gazellegas', 'gas'), O('Hornquartz', 'crystal'), O('Termite Glass', 'crystal'), O('Lion Void', 'exotic'), O('Tuskite', 'metal'), O('Dung Opal', 'crystal')] },
  { id: 'rave', concept: 'A fungal rave that never ends.', mood: 'glowing and unwell', motifs: ['spores', 'bass', 'glow'], hue: [280, 330], terrains: ['fungal', 'tendrils', 'swamp', 'bones', 'hive', 'watchers', 'crystal', 'forest'], names: ['Sporadica', 'Mold Disco', 'Cap-Rave', 'Gillheart'], adj: ['Glowing', 'Pulsing', 'Sporey', 'Throbbing', 'Damp', 'Luminous'], tag: ['The spores are the DJ.', 'Everything here is glowing and none of it is safe.'], ores: [O('Moldiron', 'metal'), O('Truffle Gold', 'metal'), O('Glowcap', 'organic'), O('Sporegas', 'gas'), O('Rotquartz', 'crystal'), O('Mycelite', 'crystal'), O('Funk Void', 'exotic'), O('Bass Spore', 'organic'), O('Gill Salt', 'organic')] },
];

/* ---------- memory of earlier planets, so the next one is genuinely new ---------- */
export const HISTORY_KEY = 'extraction_planet_history_v1';
export function loadHistory() { try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(h) ? h : []; } catch { return []; } }
export function recordPlanet(planet) {
  const entry = { name: planet.name, concept: planet.theme.concept, themeId: planet.theme.id || null, motifs: planet.theme.motifs, sky: planet.sky, moons: planet.moons.length, terrains: planet.regions.map((r) => r.terrain), ores: planet.ores.map((o) => o.name), at: Date.now() };
  const next = loadHistory().filter((e) => e.name !== entry.name).concat(entry).slice(-14);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
}
function historyBlock() {
  const h = loadHistory().slice(-10);
  if (!h.length) return 'No planets have been built yet, so anything goes.';
  return h.map((e) => `- ${e.name}: "${e.concept}" | tone: ${(e.motifs || []).join(', ')} | sky ${e.sky.join('→')} | ${e.moons} moon(s) | landscapes: ${e.terrains.join(', ')} | ores: ${e.ores.join(', ')}`).join('\n');
}
function pickTheme(R) {
  const recent = loadHistory().slice(-6).map((e) => e.themeId);
  const fresh = THEMES.filter((t) => !recent.includes(t.id));
  return pick(R, fresh.length ? fresh : THEMES);
}

function proceduralSky(R, theme) {
  const h1 = theme ? theme.hue[0] + R() * (theme.hue[1] - theme.hue[0]) : R() * 360; const h0 = theme ? h1 + (R() < 0.5 ? -1 : 1) * (30 + R() * 50) : h1 - 40 - R() * 90;
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


/* Region seeds on the 1000x1000 planet map (a Voronoi diagram, like the original game's world map). */
export const MAPW = 1000;
export function placeSeeds(R, count) {
  const pts = []; let guard = 0;
  while (pts.length < count && guard++ < 4000) { const x = 110 + R() * 780; const y = 110 + R() * 780; if (pts.every((q) => Math.hypot(q.x - x, q.y - y) > 255 - count * 8)) pts.push({ x, y }); }
  while (pts.length < count) pts.push({ x: 110 + R() * 780, y: 110 + R() * 780 });
  return pts;
}
export function ensurePositions(planet) {
  if (planet.regions.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y))) return planet;
  const pts = placeSeeds(rng(hash(`${planet.id}map`)), planet.regions.length);
  planet.regions.forEach((r, i) => { r.x = pts[i].x; r.y = pts[i].y; });
  return planet;
}

function cleanTheme(raw, fallback) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const f = fallback || {};
  const motifs = (Array.isArray(t.motifs) ? t.motifs : f.motifs || []).map((m) => str(m, '', 24)).filter(Boolean).slice(0, 5);
  return { id: f.id || null, concept: str(t.concept, f.concept || 'A planet with no particular point of view.', 160), mood: str(t.mood, f.mood || '', 60), motifs };
}

/* `raw` is whatever the AI (or a hand-written preset) supplied; anything missing is improvised, and when a procedural
 * `theme` is given the improvisation follows it so even offline planets have a personality. */
export function buildPlanet(raw, seed, theme) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const R = rng(hash(seed));
  const planetTheme = cleanTheme(raw.theme, theme);
  const sky = Array.isArray(raw.sky) && hex(raw.sky[0]) && hex(raw.sky[1]) ? [hex(raw.sky[0]), hex(raw.sky[1])] : proceduralSky(R, theme);
  const surface = hex(raw.surface, hsl(hueOf(sky[1]) + 160 + R() * 40, 0.35, 0.3));
  const adj = theme ? theme.adj : ADJ;
  const layers = [];
  for (let i = 0; i < 5; i += 1) {
    const L = (Array.isArray(raw.layers) && raw.layers[i]) || {};
    const fallback = sh(hexMix(surface, hsl(hueOf(surface) + 30 + R() * 30, 0.35, 0.18), i / 4.5), -0.1 * i / 4);
    layers.push({ name: str(L.name, `${pick(R, adj)} ${LNOUN[i]}`, 32), color: hex(L.color, fallback) });
  }
  // ores: one per sandbox slot, distinct hue, never repeating a name
  const seen = new Set(); const rawOres = Array.isArray(raw.ores) ? raw.ores : [];
  const colors = pickOreColors(R, ORE_SLOTS.map((_, i) => hex(rawOres[i] && rawOres[i].color)));
  const themeOres = theme ? shuffle(R, theme.ores) : [];
  const ores = ORE_SLOTS.map((slot, i) => {
    const o = rawOres[i] || {};
    let cat = ['metal', 'crystal', 'gas', 'organic', 'exotic'].includes(o.category) ? o.category : null;
    let name = str(o.name, '', 24);
    if ((!name || seen.has(name.toLowerCase())) && themeOres.length) {
      const idx = themeOres.findIndex((t) => !seen.has(t.name.toLowerCase()) && slot.cats.includes(t.cat));
      const any = idx >= 0 ? idx : themeOres.findIndex((t) => !seen.has(t.name.toLowerCase()));
      if (any >= 0) { name = themeOres[any].name; cat = themeOres[any].cat; themeOres.splice(any, 1); }
    }
    if (!cat) cat = pick(R, slot.cats);
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
  // regions: themed planets draw from their own landscape list first
  const rawRegions = Array.isArray(raw.regions) ? raw.regions.slice(0, 7) : [];
  const preferred = theme ? shuffle(R, theme.terrains) : [];
  const order = preferred.concat(shuffle(R, TERRAIN_IDS.filter((t) => !preferred.includes(t)))); const used = new Set();
  const count = clamp(rawRegions.length || (theme ? 6 : 5), 5, 7);
  const seeds = placeSeeds(R, count);
  const regions = Array.from({ length: count }, (_, i) => {
    const r = rawRegions[i] || {};
    let terrain = TERRAINS[r.terrain] ? r.terrain : inferTerrain(r.name, r.blurb, hex(r.color));
    if (!terrain || used.has(terrain)) terrain = order.find((t) => !used.has(t)) || pick(R, TERRAIN_IDS);
    used.add(terrain);
    const T = TERRAINS[terrain];
    const biome = hex(r.color, hexMix(pick(R, T.biomes), surface, theme ? 0.3 : 0.15));
    return {
      id: `r${i}`,
      name: str(r.name, `${pick(R, adj)} ${pick(R, T.nouns)}`, 32),
      blurb: str(r.blurb, pick(R, T.blurb), 90),
      terrain, biome, fx: T.fx, x: seeds[i].x, y: seeds[i].y,
    };
  });
  const name = str(raw.name, theme ? pick(R, theme.names) : procName(R), 40);
  return {
    v: 1, id: raw.id || `p${hash(`${seed}id`).toString(36)}`, name, theme: planetTheme,
    tagline: str(raw.tagline, theme ? pick(R, theme.tag) : pick(R, ['A planet that hates you personally.', 'Rich in ore. Richer in teeth.', 'The Maker made this one on a Monday.']), 90),
    story: str(raw.story, theme ? `${name}: ${theme.concept} The crust is ${theme.mood}, the ore is questionable, and the locals have opinions.` : `${name} was assembled by the Maker out of leftover grudges and a bucket of ore. The crust is soft, the sky is expensive, and the locals have opinions.`, 800),
    sky, stars: starColor, moons, surface, layers, ores, regions, prompt: raw.prompt || '', ai: !!raw.ai,
  };
}

export function defaultPlanet() {
  return buildPlanet({
    theme: { concept: 'A tired red frontier where the sunset is a billing event.', mood: 'wry and rusty', motifs: ['rust', 'glass', 'dust'] },
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

/** The same planet for the same seed: used online so every player sees one shared world. */
export function planetFromSeed(seed) {
  return buildPlanet({}, seed, pickTheme(rng(hash(seed))));
}

export function newPlanetFromSeed() {
  const seed = `seed-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
  return buildPlanet({}, seed, pickTheme(rng(hash(seed))));
}

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
export async function askJSON(prompt, { timeoutMs = 12000, maxTokens = 1600 } = {}) {
  const s = aiSettings();
  if (!['anthropic', 'openai'].includes(s.provider)) throw new Error('AI is switched off. Pick an engine in Tools.');
  if (typeof s.key !== 'string' || !s.key.trim()) throw new Error('No API key set');
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('AI request timed out')); }, Math.max(1, Math.min(30000, timeoutMs))); });
  const request = async () => {
    const claude = s.provider === 'anthropic';
    const r = await fetch(claude ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: claude ? { 'content-type': 'application/json', 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } : { 'content-type': 'application/json', authorization: `Bearer ${s.key}` },
      body: JSON.stringify(claude ? { model: s.model || 'claude-sonnet-4-6', max_tokens: Math.min(4000, maxTokens), messages: [{ role: 'user', content: prompt }] } : { model: s.model || 'gpt-5', max_completion_tokens: Math.min(4000, maxTokens), messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
    });
    // Provider bodies can echo credentials or arbitrary HTML. Never surface them.
    if (!r.ok) throw new Error(`AI provider returned HTTP ${r.status}`);
    const j = await r.json();
    const value = claude ? (j.content || []).map((b) => b.text || '').join('') : j.choices?.[0]?.message?.content;
    if (typeof value !== 'string' || value.length > 50000) throw new Error('Invalid AI response');
    return parseJSON(value);
  };
  try { return await Promise.race([request(), deadline]); }
  catch (e) { if (/^AI (provider returned HTTP \d{3}|request timed out)$/.test(e.message)) throw e; throw new Error('AI request failed or returned invalid JSON'); }
  finally { clearTimeout(timer); }
}

const TERRAIN_CATALOG = () => TERRAIN_IDS.map((id) => `${id} (${TERRAINS[id].group === 'alien' ? 'alien' : 'earthlike'}: ${TERRAINS[id].label})`).join(', ');

export function planetPrompt(req) {
  return `You are THE MAKER, a bored, theatrical cosmic entity who builds absurd, darkly funny alien mining planets for a pixel-art mining tycoon.
${req ? `The player's request: """${String(req).slice(0, 600)}"""\nHonor the spirit of the request, but you decide the details.` : 'Nobody made a request. Improvise something memorable.'}

STEP 1. Invent ONE central theme with a strong personality (a mood, a joke, a worldview). Everything else grows from it: the name, tagline, story, the palette, the moons, the ore names, the region names and which landscapes appear. A reader should be able to guess the theme from the ore list alone.

STEP 2. Read the planets already built and make this one clearly different: new theme, new name style, new palette, new moon count and colours, new ore vocabulary, and a different mix of landscapes. Do not reuse their colours, jokes or naming patterns.
PLANETS ALREADY BUILT:
${historyBlock()}

The planet is drawn as a pixel-art cutaway: a sky gradient, stars, one to three moons, a surface, five rock layers, seven ore deposits and a ring of regions that each LOOK different.
Landscapes you may choose for regions (use each id at most once): ${TERRAIN_CATALOG()}.
Mix earthlike and alien landscapes in whatever proportion suits the theme, and avoid the landscape mixes listed above.

Reply with ONLY a JSON object:
{"theme":{"concept":"one sentence","mood":"2-4 words","motifs":["3-5 single words"]},
"name":"planet name","tagline":"<=12 words","story":"2-3 punchy, darkly funny sentences that express the theme",
"sky":["#hex top of sky (dark)","#hex horizon (bright)"],"stars":"#hex","moons":[1-3 objects: {"color":"#hex","size":"large|small"}],"surface":"#hex ground",
"layers":[5 objects shallow to deep: {"name":"","color":"#hex"}],
"ores":[exactly 7 objects, in this tier order 0,0,1,1,2,3,4: {"name":"","category":"metal|crystal|gas|organic|exotic","color":"#hex, a clearly different hue for every ore","blurb":"<=12 words"}],
"regions":[5 to 7 objects, each a DIFFERENT landscape: {"name":"","blurb":"<=12 words","color":"#hex ground tint","terrain":"one id from the list"}]}
Exotic is tier 4 only. Keep names short.`;
}

export function aiReady() { const s = aiSettings(); return ['anthropic', 'openai'].includes(s.provider) && typeof s.key === 'string' && !!s.key.trim(); }

export function validatePlanetContent(raw) {
  const text = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.length <= n && !/[<>\x00-\x1f]/.test(v);
  const color = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const allowed = ['theme', 'name', 'tagline', 'story', 'sky', 'stars', 'moons', 'surface', 'layers', 'ores', 'regions'];
  if (Object.keys(raw).some(k => !allowed.includes(k))) return false;
  if (!text(raw.name, 40) || !text(raw.tagline, 90) || !text(raw.story, 800) || !color(raw.surface) || !color(raw.stars)) return false;
  if (!Array.isArray(raw.sky) || raw.sky.length !== 2 || !raw.sky.every(color)) return false;
  if (!raw.theme || !text(raw.theme.concept, 240) || !text(raw.theme.mood, 80) || !Array.isArray(raw.theme.motifs) || raw.theme.motifs.length < 3 || raw.theme.motifs.length > 5 || !raw.theme.motifs.every(m => text(m, 30))) return false;
  if (!Array.isArray(raw.moons) || raw.moons.length < 1 || raw.moons.length > 3 || !raw.moons.every(m => m && color(m.color) && ['large', 'small'].includes(m.size))) return false;
  if (!Array.isArray(raw.layers) || raw.layers.length !== 5 || !raw.layers.every(l => l && text(l.name, 40) && color(l.color))) return false;
  if (!Array.isArray(raw.ores) || raw.ores.length !== 7 || !raw.ores.every((o, i) => o && text(o.name, 40) && text(o.blurb, 180) && color(o.color) && ORE_SLOTS[i].cats.includes(o.category))) return false;
  if (!Array.isArray(raw.regions) || raw.regions.length < 5 || raw.regions.length > 7 || !raw.regions.every(r => r && text(r.name, 40) && text(r.blurb, 180) && color(r.color) && TERRAIN_IDS.includes(r.terrain))) return false;
  return [raw.ores.map(o => o.name.toLowerCase()), raw.regions.map(r => r.name.toLowerCase()), raw.regions.map(r => r.terrain)].every(a => new Set(a).size === a.length);
}

/* AI is the default. If it is not set up or fails, the Maker improvises from a theme instead, so a click always builds a planet. */
export async function generatePlanet(req) {
  let error = '';
  if (aiReady()) {
    try {
      let raw = await askJSON(planetPrompt(req), { maxTokens: 4000 });
      if (!validatePlanetContent(raw)) raw = await askJSON(planetPrompt(req) + '\nThe last response failed validation. Follow the complete schema exactly.', { maxTokens: 4000 });
      if (!validatePlanetContent(raw)) throw new Error('Planet response failed validation');
      const planet = buildPlanet({ ...raw, prompt: req || '', ai: true }, `ai-${Date.now().toString(36)}`);
      recordPlanet(planet);
      return { planet, how: 'ai', error };
    } catch (e) { error = e.message; }
  } else error = 'No AI key set';
  const planet = newPlanetFromSeed();
  planet.prompt = req || '';
  recordPlanet(planet);
  return { planet, how: 'improvised', error };
}

export function loadPlanet() {
  try {
    const w = JSON.parse(localStorage.getItem(PLANET_KEY) || 'null');
    if (w && w.planet && w.planet.v === 1 && Array.isArray(w.planet.regions) && w.planet.regions.length) return { planet: ensurePositions(w.planet), regionId: w.planet.regions.some((r) => r.id === w.regionId) ? w.regionId : w.planet.regions[0].id };
  } catch { /* fall back */ }
  const planet = defaultPlanet();
  return { planet, regionId: planet.regions[0].id };
}
export function savePlanet(planet, regionId) { try { localStorage.setItem(PLANET_KEY, JSON.stringify({ planet, regionId })); } catch { /* storage unavailable */ } }
