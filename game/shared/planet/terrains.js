/* The 39 landscapes a region can have (27 earthlike, 12 alien), ported from the archived Tycoon sandbox.
 * Pure data: label, always-on weather (`fx`), biome colours, name nouns, matching words (for inferring a terrain
 * from free text) and darkly funny blurbs. The pixel kit (public/app/pixel/terrains.js) has a drawing spec per key. */
import { colorDist, hexOr } from './util.js';

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

/* Weather is always on in a region; the pixel kit animates each key. */
export const WEATHER = {
  wind: 'Endless wind', snow: 'Light snow', ash: 'Falling ash', fog: 'Green fog', aurora: 'Aurora', spores: 'Drifting spores',
  meteor: 'Meteor showers', haze: 'Heat haze', fireflies: 'Fireflies', rain: 'Warm rain', mist: 'Low mist', leaves: 'Falling leaves',
  steam: 'Steam banks', motes: 'Glowing motes', glitch: 'Reality glitches', sparks: 'Sparks',
};
export const WEATHER_IDS = Object.keys(WEATHER);

/* best terrain for free text (name, blurb) or, failing that, the nearest biome colour */
export function inferTerrain(name, blurb, biome) {
  const text = `${name || ''} ${blurb || ''}`.toLowerCase();
  let best = null; let bestScore = 0;
  for (const id of TERRAIN_IDS) {
    const score = TERRAINS[id].words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0) + (text.includes(id) ? 2 : 0);
    if (score > bestScore) { best = id; bestScore = score; }
  }
  if (best) return best;
  const c = hexOr(biome, null); if (!c) return null;
  let bestId = null; let bestD = 1e9;
  for (const id of TERRAIN_IDS) for (const b of TERRAINS[id].biomes) { const d = colorDist(c, b); if (d < bestD) { bestD = d; bestId = id; } }
  return bestD < 90 ? bestId : null;
}
