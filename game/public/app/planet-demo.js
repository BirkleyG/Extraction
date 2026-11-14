/* Standalone planet demo: improvise a planet from a seed and draw every region, the sky, strata, ores, buyers and crew.
 * ?seed=abc picks the seed, ?all=1 shows all 39 terrains, ?ai=1 runs planetFromAI on garbage to show the fallbacks. */
import { sampleSpot, startSpot } from '/shared/planet/index.js';
import { renderPlanetMap } from './pixel/planetmap.js';
import { SHAPES, improvisePlanet, planetFromAI, oreSpriteSpec, planetSummary, TERRAINS, TERRAIN_IDS, WEATHER, color } from '/shared/planet/index.js';
import { drawScene, drawSky, drawStrata, drawLandscape, drawWeather, drawOre, oreSprite, personSprite, drawShip, pen, drawPile, LAYER_H } from './pixel/index.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sw = (c) => `<span class="sw" style="background:${c}"></span>`;
let planet; let panels = []; let oreCanvases = []; let mode = q.get('all') ? 'all' : q.get('ai') ? 'ai' : 'planet';

function build(seed) {
  const history = JSON.parse(localStorage.getItem('planetDemoHistory') || '[]');
  planet = mode === 'ai' ? planetFromAI({ name: 42, ores: [{ name: 'Only Ore', tier: 'mythic', color: 'not-a-color' }, null, 'x'], regions: [{ terrain: 'lava lake', name: 'Hot Place' }], sky: ['#zzz', 7], buyers: 'nope' }, seed) : improvisePlanet(seed, { history });
  if (mode === 'planet') localStorage.setItem('planetDemoHistory', JSON.stringify(history.concat(planetSummary(planet)).slice(-6)));
  $('seed').value = seed;
  $('name').textContent = planet.name; $('tagline').textContent = planet.tagline;
  $('theme').innerHTML = `${esc(planet.theme)} <span class="hot">· ${esc(planet.mood)}</span> · ${sw(planet.sky[0])}${sw(planet.sky[1])} sky · ${planet.moons.length} moon(s) · theme ${esc(planet.themeId)}`;
  $('story').textContent = planet.story;
  // regions (or all terrains)
  const regions = mode === 'all'
    ? TERRAIN_IDS.map((k, i) => ({ id: `t${i}`, name: TERRAINS[k].label, terrain: k, biomes: TERRAINS[k].biomes.map((b) => color.mix(b, planet.surface, 0.22)), blurb: TERRAINS[k].blurb[0], weather: TERRAINS[k].fx }))
    : planet.regions;
  $('regions').innerHTML = ''; panels = [];
  for (const r of regions) {
    const card = document.createElement('div'); card.className = 'card';
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; cv.className = 'land';
    card.append(cv);
    card.insertAdjacentHTML('beforeend', `<h3>${esc(r.name)}</h3><p>${esc(TERRAINS[r.terrain].label)} <b>(${r.terrain})</b> · ${esc(WEATHER[r.weather] || r.weather)} · ${r.biomes.map(sw).join('')}</p><p>${esc(r.blurb)}</p>`);
    $('regions').append(card);
    panels.push({ cv, g: cv.getContext('2d'), region: r, x: (panels.length * 173) % 900 });
  }
  // ores
  $('ores').innerHTML = ''; oreCanvases = [];
  for (const o of planet.ores) {
    const spec = oreSpriteSpec(o);
    const el = document.createElement('div'); el.className = 'ore';
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40; el.append(cv);
    el.insertAdjacentHTML('beforeend', `<div><h3>${esc(o.name)}</h3><p class="tier-${o.tier}">${o.tier.toUpperCase()} · ${o.shape} · hardness ${o.hardness} · depth ${o.depthMin}+ · ${o.baseValue}c</p><p>Used for <b>${esc(o.use)}</b></p><p>${esc(o.description)}</p><p>${spec.palette.map(sw).join('')} sparkle ${spec.sparkle}</p></div>`);
    $('ores').append(el);
    oreCanvases.push({ g: cv.getContext('2d'), spec, o });
  }
  $('layers').innerHTML = `<b>Rock layers</b>${planet.layers.map((l, i) => `<div style="background:${l.color};color:${color.luma(l.color) > 0.5 ? '#000' : '#fff'}">${i + 1}. ${esc(l.name)}</div>`).join('')}`;
  $('buyers').innerHTML = `<tr><th>buyer</th><th>dist</th>${planet.ores.map((o) => `<th title="${esc(o.name)}">${esc(o.name.split(' ')[0])}</th>`).join('')}</tr>${planet.buyers.map((b) => `<tr><td title="${esc(b.blurb)}">${esc(b.name)}</td><td>${b.distance}</td>${planet.ores.map((o) => `<td class="${b.likes[o.id] >= 1.2 ? 'hot' : ''}">${b.likes[o.id]}</td>`).join('')}</tr>`).join('')}`;
  pickStarts(); picked = null; $('spot').textContent = 'Click the map to sample a spot.';
  $('mapkey').innerHTML = `${planet.regions.length} climate areas. Yellow dots: 10 sampled start spots (about +1 SD, no mythic). Debug overlay: blue/orange = the two common zones, coloured outlines = the 4 rares, magenta = mythic. Players never see these fields.`;
  drawMap(); drawStatic(); drawShapes();
}

function drawShapes() {
  const cv = $('shapes'); const g = cv.getContext('2d'); g.fillStyle = '#0f0a1a'; g.fillRect(0, 0, cv.width, cv.height);
  SHAPES.forEach((shape, i) => { const o = planet.ores[i % 7]; const spec = { ...oreSpriteSpec(o), shape }; g.drawImage(oreSprite(spec, 24), 4 + i * 29, 4); g.drawImage(oreSprite(spec, 12), 10 + i * 29, 34); g.drawImage(oreSprite(spec, 8), 12 + i * 29, 50); });
}

let debug = false; let starts = []; let mapApi = null; let picked = null;
function drawMap() {
  const cv = $('map'); const g = cv.getContext('2d');
  mapApi = renderPlanetMap(cv, planet, { debug });
  const mark = (x, y, c, r = 5) => { const p = mapApi.toMap(x, y); g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fillStyle = c; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke(); };
  starts.forEach((s, i) => { mark(s.x, s.y, '#ffe14a'); const p = mapApi.toMap(s.x, s.y); g.fillStyle = '#000'; g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.fillText(i + 1, p.x, p.y + 3); });
  if (picked) mark(picked.x, picked.y, '#ffffff', 4);
}
function pickStarts() { starts = []; for (let i = 0; i < 10; i += 1) { const s = startSpot(planet, starts, `${planet.seed}:p${i}`); if (s) starts.push(s); } }
$('map').onclick = (ev) => {
  const r = ev.target.getBoundingClientRect(); const p = mapApi.fromMap((ev.clientX - r.left) * (ev.target.width / r.width), (ev.clientY - r.top) * (ev.target.height / r.height));
  picked = sampleSpot(planet, p.x, p.y); drawMap();
  const names = Object.fromEntries(planet.ores.map((o) => [o.id, o.name]));
  $('spot').textContent = JSON.stringify({ ...picked, richness: Object.fromEntries(Object.entries(picked.richness).map(([k, v]) => [names[k], v])), veinSize: undefined, common: names[picked.common] }, null, 1);
};
$('dbg').onclick = () => { debug = !debug; $('dbg').textContent = debug ? 'Hide ore fields' : 'Show ore fields (debug)'; drawMap(); };

function drawStatic() {
  const cv = $('strata'); const g = cv.getContext('2d'); const view = { x: 0, y: -10, scale: 1, w: cv.width, h: cv.height };
  g.fillStyle = '#0b0714'; g.fillRect(0, 0, view.w, view.h); drawSky(g, planet, view, 0); drawStrata(g, planet, view, { layerH: LAYER_H });
  drawLandscape(g, planet, planet.regions[0], view, 0, { weather: false });
}

function drawHero(t) {
  const cv = $('hero'); const g = cv.getContext('2d'); const view = { x: Math.sin(t * 0.05) * 40, y: -160, scale: 1, w: cv.width, h: cv.height };
  const region = planet.regions[0];
  drawScene(g, planet, region, view, t, { weather: false });
  const P = pen(g, view);
  // a little mine: shaft, headframe, tunnel, miners, ore pile and the three ship classes
  P.rect(140, 0, 22, 100, '#1d1228'); P.rect(140, 70, 150, 22, '#1d1228'); P.rect(140, 30, 90, 20, '#1d1228');
  P.line(130, 0, 151, -50, '#6a4a2a', 2); P.line(172, 0, 151, -50, '#6a4a2a', 2); P.disc(151, -50, 7, '#ffd23f'); P.disc(151, -50, 5, '#2a2238');
  const ore = planet.ores; const spec = oreSpriteSpec(ore[6]);
  drawOre(g, view, spec, 280, 80, 14, t); drawOre(g, view, oreSpriteSpec(ore[3]), 225, 40, 11, t);
  const f = Math.floor(t * 6) % 3;
  P.sprite(personSprite({ role: 'miner', pose: 'swing', frame: f, tier: 2 }), 262, 92, 12, 25);
  P.sprite(personSprite({ role: 'miner', pose: 'swing', frame: (f + 1) % 3, tier: 1, head: 'antenna', skin: '#9ad08a' }), 208, 50, 12, 25);
  const wx = 80 + ((t * 18) % 60);
  P.sprite(personSprite({ role: 'porter', pose: 'walk', frame: f, load: ore[0].color }), wx, 0, 12, 25);
  drawPile(g, view, 200, 0, 120, ore[0].color); drawPile(g, view, 225, 0, 60, ore[1].color, 14);
  drawShip(g, view, 'hauler', 1, 300, 0, t, false);
  drawShip(g, view, 'freighter', 2, 400, 0, t, false);
  const fy = -40 - ((t * 20) % 120);
  drawShip(g, view, 'cruiser', 1, 330 + Math.sin(t) * 10, fy, t, true);
  drawWeather(g, planet, region, view, t);
}

function drawCrew(t) {
  const cv = $('crew'); const g = cv.getContext('2d'); g.fillStyle = '#1a1228'; g.fillRect(0, 0, cv.width, cv.height);
  const view = { x: 0, y: 0, scale: 1, w: cv.width, h: cv.height }; const P = pen(g, view); const f = Math.floor(t * 6) % 3;
  const poses = [['miner', 'walk'], ['miner', 'swing'], ['miner', 'shovel'], ['porter', 'carry'], ['pilot', 'walk'], ['miner', 'cheer'], ['envoy', 'flag'], ['politician', 'speech']];
  poses.forEach(([role, pose], i) => P.sprite(personSprite({ role, pose, frame: f % (pose === 'shovel' ? 2 : 3), tier: i % 5, load: planet.ores[i % 7].color, head: ['dome', 'tall', 'cyclops', 'antenna', 'horn', 'tentacle', 'dome', 'dome'][i] }), 18 + i * 34, 34, 12, 25));
  P.rect(0, 34, cv.width, 1, '#3a2a50');
  ['hauler', 'cruiser', 'freighter'].forEach((cls, row) => { [0, 2, 4].forEach((lv, k) => drawShip(g, view, cls, lv, 55 + k * 125, 90 + row * 50 - (cls === 'freighter' ? -4 : 0), t, k === 1)); });
}

function frame(ms) {
  const t = ms / 1000;
  drawHero(t);
  for (const p of panels) {
    const view = { x: p.x, y: -146, scale: 1, w: p.cv.width, h: p.cv.height };
    drawScene(p.g, planet, p.region, view, t);
  }
  for (const o of oreCanvases) {
    o.g.fillStyle = '#0f0a1a'; o.g.fillRect(0, 0, 40, 40);
    drawOre(o.g, { x: 0, y: 0, scale: 1, w: 40, h: 40 }, o.spec, 20, 17, 24, t);
    [8, 12].forEach((sz, i) => { const im = oreSprite(o.spec, sz); o.g.drawImage(im, 4 + i * 22, 39 - sz); });
  }
  drawCrew(t);
  requestAnimationFrame(frame);
}

const randomSeed = () => `${Date.now().toString(36)}${Math.floor(performance.now() * 1000 % 1e6).toString(36)}`;
$('go').onclick = () => { mode = 'planet'; build($('seed').value || randomSeed()); };
$('new').onclick = () => { mode = 'planet'; build(randomSeed()); };
$('all').onclick = () => { mode = mode === 'all' ? 'planet' : 'all'; build($('seed').value); };
$('ai').onclick = () => { mode = 'ai'; build($('seed').value); };
build(q.get('seed') || randomSeed());
requestAnimationFrame(frame);
