/* Inside an operation: the "anthill" view. A side-view scene of one mine, refinery, hub, air station, research hub
 * or the Galactic Exchange, drawn with the pixel kit. Everything you see comes from the server's view of that site:
 * parts you bought appear (shafts, rigs, vats, silos, bunks), crews work, ore piles up, ships come and go.
 * Nothing here decides anything; it shows what is happening. Problems show as a blinking "!" where they are. */
import { drawSky, drawStrata, drawLandscape, drawWeather } from '/app/pixel/scene.js';
import { pen, personSprite, drawShip, drawPile, oreSprite, crateSprite } from '/app/pixel/sprites.js';
import { speciesSprite } from '/app/pixel/species.js';
import { oreSpriteSpec } from '/shared/planet/index.js';
import { prefs } from '/app/juice.js';

const SHIP_ART = { hauler: 'hauler', clipper: 'cruiser', leviathan: 'freighter' };
const BRANCH_GLOW = { core: '#ffd23f', rock: '#ff8a3d', open: '#7ad1ff', wet: '#5ee6a8', cold: '#c8e8ff', weird: '#ff5ec4' };
const lvOf = (site, id) => (site.parts.find((p) => p.id === id) || {}).level || 0;
const h01 = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 2246822519); x ^= x >>> 13; return ((x >>> 0) % 1000) / 1000; };

export function createInside(S, A) {
  const cv = document.getElementById('inside');
  const g = cv.getContext('2d');
  let raf = 0, W = 0, H = 0, dpr = 1, hits = [];
  const crowd = new Map(); // stable little walkers per site

  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
    const hit = hits.find((h) => px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1);
    if (hit) A.onPart(hit.part);
  });

  const regionOf = (site) => S.world.planet.regions.find((r) => r.name === site.region) || S.world.planet.regions.find((r) => r.terrain === site.terrain) || S.world.planet.regions[0];
  const oreSpec = (id) => { const o = S.world.planet.ores.find((x) => x.id === id); return o ? oreSpriteSpec(o) : null; };

  function frame(ms) {
    raf = requestAnimationFrame(frame);
    const site = S.insideSite();
    if (!site || !cv.isConnected || cv.offsetParent === null) return;
    resize();
    const t = prefs.reduced ? 0 : ms / 1000;
    const busy = site.level >= 1 && !site.halted && !site.decision;
    const speed = site.shift === 'overtime' ? 1.5 : site.shift === 'relaxed' ? 0.6 : 1;
    const shafts = site.kind === 'mine' ? Math.max(1, lvOf(site, 'shaft')) : 0;
    const depth = site.kind === 'mine' ? 40 + shafts * 22 : site.kind === 'exchange' ? 0 : 36;
    const worldW = 300, top = site.kind === 'exchange' ? -170 : -78;
    const scale = Math.max(1, Math.min(W / worldW, H / (depth - top + 6)));
    const view = { x: -(W / scale - worldW) / 2, y: top - Math.max(0, (H / scale - (depth - top + 6)) / 2), scale, w: W, h: H };
    const P = pen(g, view);
    hits = [];
    const hit = (part, x0, y0, x1, y1) => hits.push({ part, x0: P.X(x0), y0: P.Y(y0), x1: P.X(x1), y1: P.Y(y1) });
    const bang = (x, y) => { if (Math.floor(t * 2.5) % 2 || prefs.reduced) { P.rect(x - 2, y - 9, 5, 9, '#140c1c'); P.rect(x - 1, y - 8, 3, 5, '#ff5a6e'); P.rect(x - 1, y - 2, 3, 2, '#ff5a6e'); } };
    const planet = S.world.planet;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0714'; g.fillRect(0, 0, W, H);
    if (site.kind === 'exchange') { drawSpace(g, P, view, planet, t); drawExchange(P, site, t, hit, bang); return; }
    const region = regionOf(site);
    drawSky(g, planet, view, t);
    drawStrata(g, planet, view, { noOre: true });
    drawLandscape(g, planet, region, view, t, { weather: false });
    const ground = (x) => 0;
    if (site.level < 1) { drawArriving(P, site, t, S.now()); drawWeather(g, planet, region, view, t); return; }
    const kinds = { mine: drawMine, refinery: drawRefinery, hub: drawHub, air: drawAir, lab: drawLab };
    (kinds[site.kind] || (() => {}))(P, site, { t, busy, speed, hit, bang, oreSpec, ground, S, crowd, peek: !!(S.inside && S.inside.uid) });
    drawWeather(g, planet, region, view, t);
    if (site.halted || site.decision) { g.fillStyle = 'rgba(40,6,12,0.25)'; g.fillRect(0, 0, W, H); }
  }

  return {
    start() { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); },
  };
}

/* ---------- people ---------- */
function worker(P, x, y, pose, f, flip, col, load) {
  const img = personSprite({ role: 'miner', pose, frame: f % 3, color: col, load, tier: 2 });
  P.sprite(img, x, y, 12, 24, flip, 0.7);
}
function boss(P, S, x, y, t) {
  const sp = S.guild.species;
  if (!sp) return;
  const img = speciesSprite(sp, 'walk', Math.floor(t * 3) % 3);
  P.sprite(img, x, y, img.width / 2, img.height - 2, false, 0.45);
}

/* ---------- mine ---------- */
function drawMine(P, site, o) {
  const { t, busy, speed, hit, bang, oreSpec } = o;
  const shafts = Math.max(1, lvOf(site, 'shaft')), rigs = lvOf(site, 'rig'), haulL = lvOf(site, 'haul'), safety = lvOf(site, 'safety'), bunk = lvOf(site, 'bunk'), yardL = lvOf(site, 'yard');
  const liftX = 70, oresHere = Object.keys(site.rates || {}).concat(site.found || []).filter((v, i, a) => a.indexOf(v) === i);
  const mainOre = Object.entries(site.rates || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  const crewPer = shafts ? Math.ceil(site.crew / shafts) : 0;
  // headframe and lift
  P.rect(liftX - 9, -46, 3, 46, '#4a3a5a'); P.rect(liftX + 6, -46, 3, 46, '#4a3a5a'); P.rect(liftX - 11, -48, 22, 4, '#6a5a7a');
  for (let y = -40; y < 0; y += 8) P.line(liftX - 8, y, liftX + 7, y + 8, '#3a2c4a', 1);
  P.disc(liftX, -50, 4, '#8a7a9a'); P.rect(liftX - 1, -50, 2, 2, '#140c1c');
  const deepest = 30 + (shafts - 1) * 22;
  P.rect(liftX - 3, 0, 6, deepest + 8, '#1a1222');
  const liftCycle = 6 / (speed * (0.6 + haulL * 0.15));
  const lp = busy ? (Math.sin((t / liftCycle) * Math.PI * 2) * 0.5 + 0.5) : 0;
  const ly = -6 + lp * (deepest + 6);
  P.line(liftX, -50, liftX, ly, '#cfd6e0', 1);
  P.rect(liftX - 4, ly, 8, 6, '#ffd23f'); P.rect(liftX - 3, ly + 1, 6, 2, mainOre && oreSpec(mainOre) ? oreSpec(mainOre).palette[2] : '#8a7a5a');
  hit('haul', liftX - 12, -52, liftX + 12, deepest + 8);
  if ((site.flags || []).includes('haul')) bang(liftX, -54);
  // ore yard: piles per ore, fence grows with the yard part
  const yardX = 108, yardW = Math.min(110, 34 + yardL * 9);
  P.rect(yardX - 4, -6, yardW + 8, 1, '#5a4a3a'); for (let x = yardX - 4; x <= yardX + yardW + 4; x += 6) P.rect(x, -8, 1, 8, '#7a6a5a');
  const stock = site.stock || {};
  const ids = Object.keys(stock).filter((id) => stock[id] > 0.5);
  ids.forEach((id, i) => { const sp = oreSpec(id); const c = sp ? sp.palette[2] : '#8a7a5a'; drawPileAt(P, yardX + 10 + i * 18, 0, stock[id] * (240 / Math.max(160, site.store)), c); });
  if (!ids.length) P.rect(yardX + 4, -1, 12, 1, '#6a5a4a');
  hit('yard', yardX - 4, -30, yardX + yardW + 4, 2);
  if (site.full) bang(yardX + yardW / 2, -32);
  // bunkhouses
  for (let i = 0; i < Math.max(1, bunk); i++) { const bx = 8 + (i % 4) * 13, by = i >= 4 ? -22 : -11; P.rect(bx, by, 11, 10, i % 2 ? '#8a5a3c' : '#7a4a30'); P.rect(bx - 1, by - 2, 13, 3, '#5a3020'); P.rect(bx + 4, by + 5, 3, 5, '#2a1a12'); if (bunk) P.rect(bx + 1, by + 2, 2, 2, Math.floor(t + i) % 3 ? '#ffe680' : '#5a4a2a'); }
  hit('bunk', 4, -26, 60, 0);
  // the landing pad at the right: ships come for the ore
  const padX = 272;
  P.rect(padX - 20, -2, 40, 2, '#5a5a6a'); P.rect(padX - 2, -3, 4, 1, '#ffd23f');
  const ships = o.peek ? (site.crew ? [1] : []) : o.S.view.routes.filter((r) => r.from?.kind === 'site' && r.from?.id === site.id && r.ok);
  if (ships.length) {
    const ph = (t / 7) % 1; const up = ph < 0.25 ? ph / 0.25 : ph > 0.75 ? (1 - ph) / 0.25 : 1;
    drawShip(P.g, P.view, 'hauler', 1, padX, -2 - (1 - up) * 70, t, up < 1, false);
  }
  // shafts: tunnels, faces, ore in the rock, crews, rigs, carts
  for (let i = 0; i < shafts; i++) {
    const y = 30 + i * 22, x0 = liftX + 3, len = 150 + ((i * 37) % 60);
    P.rect(x0, y - 9, len, 11, '#1c1424');
    P.rect(x0, y + 2, len, 1, '#3a2c3a');
    // supports and lamps (safety)
    for (let k = 0; k < safety * 2; k++) { const sx = x0 + 18 + k * (len - 30) / Math.max(1, safety * 2); P.rect(sx, y - 9, 2, 11, '#7a5230'); P.rect(sx - 2, y - 9, 6, 1, '#7a5230'); P.disc(sx + 1, y - 7, 1.4, Math.floor(t * 2 + k) % 5 ? '#ffe680' : '#b89a40'); }
    hit('safety', x0 + 10, y - 10, x0 + len - 20, y + 3);
    // ore glinting in the rock beyond the face
    const face = x0 + len;
    for (let k = 0; k < 4; k++) {
      const id = oresHere[(i + k) % Math.max(1, oresHere.length)];
      const sp = id && oreSpec(id); if (!sp) continue;
      P.sprite(oreSprite(sp, 10), face + 6 + k * 9, y - 6 + ((k * 7 + i * 3) % 9), 5, 5, false, 0.6);
    }
    P.rect(face - 1, y - 9, 2, 11, '#3a2c3a');
    hit('shaft', face - 30, y - 12, face + 40, y + 4);
    // the crew at the face
    const n = Math.min(4, Math.max(0, Math.min(crewPer, site.crew - i * crewPer)));
    for (let k = 0; k < n; k++) {
      const wx = face - 8 - k * 9;
      const f = busy ? Math.floor(t * 5 * speed + k * 1.3 + i) : 0;
      worker(P, wx, y + 2, busy ? 'swing' : 'walk', f, false, k % 2 ? '#e0702a' : '#c8602a');
    }
    if (site.shift === 'relaxed' && busy) P.rect(face - 44, y - 2, 6, 2, '#a07040'); // a bench, apparently
    // the drill rig
    if (rigs) {
      const rx = face - 4, sh = busy ? Math.sin(t * 30) * 0.6 : 0;
      P.rect(rx - 14, y - 6 + sh, 10, 6, '#9aa7b8'); P.rect(rx - 4, y - 4 + sh, 5 + Math.min(4, rigs), 2, '#cfd6e0'); P.rect(rx - 13, y - 5 + sh, 2, 2, '#ff5a6e');
      if (busy) for (let k = 0; k < 3; k++) P.rect(face + 1 + h01(Math.floor(t * 20) + k) * 4, y - 6 + h01(Math.floor(t * 17) + k) * 8, 1, 1, '#ffe680');
      hit('rig', rx - 16, y - 8, rx + 6, y + 2);
    }
    // carts running to the lift
    if (busy) {
      const carts = 1 + Math.floor(haulL / 3);
      for (let c = 0; c < carts; c++) {
        const ph = ((t * 0.12 * speed * (1 + haulL * 0.08) + c / carts + i * 0.31) % 1);
        const back = ph > 0.5, f2 = back ? 2 - ph * 2 : ph * 2;
        const cx = x0 + 6 + (1 - f2) * (len - 30);
        P.rect(cx - 4, y - 3, 8, 4, '#6a5a4a'); P.rect(cx - 3, y + 1, 2, 2, '#2a1f18'); P.rect(cx + 1, y + 1, 2, 2, '#2a1f18');
        if (!back && mainOre) P.rect(cx - 3, y - 5, 6, 2, oreSpec(mainOre)?.palette[2] || '#8a7a5a');
      }
    }
    // a cave-in: rubble and a "!" at the trapped shaft
    if (site.decision && i === shafts - 1) {
      for (let k = 0; k < 14; k++) P.rect(face - 50 + h01(k) * 30, y - 9 + h01(k + 9) * 10, 4, 3, '#5a4a4a');
      bang(face - 36, y - 12);
    }
  }
  // a General visiting
  if (!o.peek) boss(P, o.S, 92, 0, t);
  if (site.halted && !site.decision) bang(liftX + 30, -20);
}
function drawPileAt(P, x, y, amt, col) { drawPile(P.g, P.view, x, y, amt, col, 26); }

/* ---------- refinery ---------- */
function drawRefinery(P, site, o) {
  const { t, busy, speed, hit, bang, oreSpec } = o;
  const pads = lvOf(site, 'pad'), silos = lvOf(site, 'silo'), belt = lvOf(site, 'belt'), vats = lvOf(site, 'vat'), pur = lvOf(site, 'purifier');
  const input = site.input || {};
  const mainOre = Object.entries(input).sort((a, b) => b[1] - a[1])[0]?.[0] || Object.keys(o.S.view.prices)[0];
  const oc = (oreSpec(mainOre) || { palette: ['#555', '#888', '#aaa'] }).palette[2];
  // landing pads with ships unloading
  const fromRoutes = o.peek ? 1 : o.S.view.routes.filter((r) => r.to?.kind === 'site' && r.to.id === site.id && r.ok).length;
  for (let i = 0; i < pads; i++) {
    const px = 18 + i * 26;
    P.rect(px - 10, -2, 20, 2, '#5a5a6a'); P.rect(px - 1, -3, 2, 1, '#ffd23f');
    if (fromRoutes && i < fromRoutes + 1) {
      const ph = ((t / 9) + i * 0.37) % 1, up = ph < 0.2 ? ph / 0.2 : ph > 0.8 ? (1 - ph) / 0.2 : 1;
      drawShip(P.g, P.view, 'hauler', 1, px, -2 - (1 - up) * 60, t, up < 1, false);
    }
  }
  hit('pad', 4, -30, 20 + pads * 26, 2);
  // silos
  const sx0 = 30 + pads * 26;
  const fill = site.store ? Math.min(1, site.inputTot / site.store) : 0;
  for (let i = 0; i < silos; i++) {
    const x = sx0 + i * 14, hgt = 34;
    P.rect(x, -hgt, 11, hgt, '#9aa7b8'); P.rect(x + 1, -hgt + 1, 9, hgt - 2, '#4a5262');
    P.rect(x + 1, -1 - (hgt - 2) * fill, 9, (hgt - 2) * fill, oc);
    P.rect(x - 1, -hgt - 3, 13, 3, '#cfd6e0');
  }
  hit('silo', sx0 - 2, -40, sx0 + silos * 14, 0);
  if ((site.flags || []).includes('full')) bang(sx0 + silos * 7, -44);
  // conveyor to the vats
  const bx0 = sx0 + silos * 14 + 2, bx1 = bx0 + 40;
  P.rect(bx0, -10, bx1 - bx0, 3, '#3a3a4a');
  if (busy && site.inputTot > 0.5) for (let x = bx0; x < bx1; x += 6) { const off = (t * 8 * speed * (0.6 + belt * 0.15)) % 6; P.rect(x + off, -12, 3, 2, oc); }
  hit('belt', bx0, -16, bx1, -4);
  // vats, bubbling with today's ore
  const vx0 = bx1 + 4;
  for (let i = 0; i < vats; i++) {
    const x = vx0 + (i % 5) * 20, y = i >= 5 ? -36 : 0;
    P.rect(x, y - 22, 17, 22, '#6a5a7a'); P.rect(x + 2, y - 20, 13, 14, '#1a1222');
    P.rect(x + 2, y - 14, 13, 8, oc);
    if (busy && site.crew) for (let k = 0; k < 3; k++) { const b = (t * 1.5 * speed + k / 3 + i * 0.2) % 1; P.disc(x + 4 + k * 4, y - 14 - b * 10, 1 + (1 - b), oc); }
    if (busy) { const sm = (t * 0.6 + i * 0.3) % 1; P.g.globalAlpha = 0.5 * (1 - sm); P.disc(x + 8, y - 26 - sm * 30, 3 + sm * 6, '#d8d0e8'); P.g.globalAlpha = 1; }
  }
  hit('vat', vx0 - 2, -60, vx0 + Math.min(5, vats) * 20, 0);
  // purifier tower
  const tx = vx0 + Math.min(5, vats) * 20 + 6;
  if (pur) { P.rect(tx, -30 - pur * 6, 8, 30 + pur * 6, '#9aa7b8'); P.rect(tx + 2, -28 - pur * 6, 4, 4, Math.floor(t * 2) % 2 ? '#7ad1ff' : '#4a7aa0'); hit('purifier', tx - 2, -40 - pur * 6, tx + 10, 0); }
  // export: refined crates waiting for orbit
  const ex = tx + 16;
  for (let i = 0; i < 4; i++) P.sprite(crateSprite(oc), ex + (i % 2) * 13, -1 - Math.floor(i / 2) * 9, 0, 9, false, 1);
  // crew
  const n = Math.min(8, site.crew);
  for (let k = 0; k < n; k++) { const w = (t * 0.15 * speed + k / n) % 1; const x = vx0 + w * Math.min(5, vats) * 20; worker(P, x, 0, 'walk', Math.floor(t * 6 + k), Math.floor(t * 0.3 + k) % 2 === 0, '#3f86c8'); }
  if (!o.peek) boss(P, o.S, 8, 0, t);
}

/* ---------- command hub ---------- */
function drawHub(P, site, o) {
  const { t, hit } = o;
  const office = lvOf(site, 'office'), bunks = lvOf(site, 'bunks'), shuttle = lvOf(site, 'shuttle'), hangar = lvOf(site, 'hangar'), radar = lvOf(site, 'radar');
  const L = o.peek ? { inbound: [], pool: 4 } : o.S.view.labor;
  // office tower
  const ox = 20, floors = 1 + office;
  for (let f = 0; f < floors; f++) { P.rect(ox, -12 - f * 11, 34, 11, f % 2 ? '#5a4a7a' : '#4a3a6a'); for (let w = 0; w < 4; w++) P.rect(ox + 3 + w * 8, -9 - f * 11, 4, 5, (Math.floor(t * 0.5 + f + w) % 4) ? '#ffe680' : '#2a2040'); }
  P.rect(ox - 2, -14 - floors * 11, 38, 3, '#ffd23f'); P.rect(ox + 15, -26 - floors * 11, 2, 12, '#cfd6e0'); P.rect(ox + 17, -26 - floors * 11, 8, 5, o.S.guild.species?.color || '#ff8a3d');
  hit('office', ox - 2, -30 - floors * 11, ox + 36, 0);
  // radar
  if (radar) { const a = t * 1.2; P.rect(ox + 44, -18, 2, 18, '#9aa7b8'); P.line(ox + 45, -18, ox + 45 + Math.cos(a) * 8, -22 + Math.sin(a) * 3, '#cfd6e0', 2); hit('radar', ox + 36, -28, ox + 56, 0); }
  // bunks
  const bx = 80;
  for (let i = 0; i < bunks; i++) { const x = bx + (i % 5) * 12, y = -10 - Math.floor(i / 5) * 11; P.rect(x, y, 10, 10, '#7a4a30'); P.rect(x - 1, y - 2, 12, 3, '#5a3020'); P.rect(x + 3, y + 4, 3, 6, '#2a1a12'); }
  hit('bunks', bx - 2, -32, bx + 62, 0);
  // shuttle pad: a shuttle drops off fresh workers whenever one is on the way
  const sx = 175;
  P.rect(sx - 16, -2, 32, 2, '#5a5a6a'); P.rect(sx - 12, -2, 2, 2, '#ffd23f'); P.rect(sx + 10, -2, 2, 2, '#ffd23f');
  const inbound = (L.inbound || []).length;
  const ph = (t / 10) % 1, down = ph < 0.3 ? ph / 0.3 : ph > 0.7 ? (1 - ph) / 0.3 : 1;
  const shy = -2 - (1 - down) * 90;
  if (inbound || ph < 0.75) {
    P.rect(sx - 10, shy - 12, 20, 10, '#cfd6e0'); P.rect(sx - 8, shy - 10, 16, 3, '#4ad0ff'); P.rect(sx - 12, shy - 3, 24, 2, '#9aa7b8');
    if (down < 1) { P.rect(sx - 4, shy - 1, 3, 3 + (Math.floor(t * 20) % 2) * 2, '#ffb347'); P.rect(sx + 2, shy - 1, 3, 3 + (Math.floor(t * 20 + 1) % 2) * 2, '#ffb347'); }
  }
  hit('shuttle', sx - 20, -40, sx + 20, 0);
  // fresh arrivals walking to the bunks, idle workers milling about
  const walkers = Math.min(10, (L.pool || 0));
  for (let k = 0; k < walkers; k++) { const w = ((t * 0.07 + k / Math.max(1, walkers)) % 1); const x = sx - 6 - w * (sx - bx - 50); worker(P, x, 0, 'walk', Math.floor(t * 6 + k), true, '#c8a070'); }
  // hangar
  const hx = 220;
  for (let i = 0; i < Math.min(4, hangar); i++) { const x = hx + i * 24; P.rect(x, -16, 22, 16, '#5a6a7a'); P.rect(x + 2, -14, 18, 14, '#1a2230'); P.disc(x + 11, -16, 11, '#5a6a7a'); P.rect(x, -16, 22, 1, '#7a8a9a'); }
  const idle = o.peek ? [] : o.S.guild.ships.filter((s) => !s.routeId).slice(0, 4);
  idle.forEach((s, i) => drawShip(P.g, P.view, SHIP_ART[s.cls] || 'hauler', 0, hx + 11 + i * 24, -1, t, false, false));
  hit('hangar', hx - 2, -30, hx + 100, 0);
  if (!o.peek) boss(P, o.S, ox + 40, 0, t);
}

/* ---------- air station ---------- */
function drawAir(P, site, o) {
  const { t, hit } = o;
  const hangars = lvOf(site, 'hangar'), depot = lvOf(site, 'depot');
  for (let i = 0; i < hangars; i++) { const x = 20 + i * 26; P.rect(x, -16, 24, 16, '#5a6a7a'); P.disc(x + 12, -16, 12, '#5a6a7a'); P.rect(x + 2, -14, 20, 14, '#1a2230'); }
  hit('hangar', 16, -30, 24 + hangars * 26, 0);
  const dx = 40 + hangars * 26;
  for (let i = 0; i < depot; i++) { const x = dx + i * 14; P.rect(x, -22, 11, 22, '#c84a3a'); P.rect(x + 1, -24, 9, 2, '#e8e4f2'); P.rect(x + 3, -16, 5, 2, '#ffd23f'); }
  hit('depot', dx - 2, -28, dx + depot * 14, 0);
  // passing ships refuel
  const ph = (t / 8) % 1, up = ph < 0.25 ? ph / 0.25 : ph > 0.75 ? (1 - ph) / 0.25 : 1;
  drawShip(P.g, P.view, 'cruiser', 1, 260, -2 - (1 - up) * 70, t, up < 1, false);
  P.rect(242, -2, 36, 2, '#5a5a6a');
  for (let k = 0; k < Math.min(4, site.crew); k++) worker(P, dx + 4 + k * 10 + Math.sin(t + k) * 3, 0, 'walk', Math.floor(t * 5 + k), k % 2 === 0, '#5a6a8a');
}

/* ---------- research hub ---------- */
function drawLab(P, site, o) {
  const { t, hit } = o;
  const desks = lvOf(site, 'desk'), gear = lvOf(site, 'gear');
  const glow = BRANCH_GLOW[site.branch] || '#ff5ec4';
  for (let i = 0; i < desks; i++) {
    const x = 20 + (i % 6) * 34, y = i >= 6 ? -26 : 0;
    P.disc(x + 14, y - 10, 13, '#cfd6e0'); P.rect(x, y - 10, 29, 10, '#cfd6e0');
    P.disc(x + 14, y - 10, 11, '#2a3448'); P.rect(x + 3, y - 10, 23, 9, '#2a3448');
    P.g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2 + i); P.disc(x + 14, y - 8, 5, glow); P.g.globalAlpha = 1;
  }
  hit('desk', 16, -48, 20 + Math.min(6, desks) * 34, 0);
  for (let i = 0; i < gear; i++) { const x = 240 + i * 10; P.rect(x, -24 - i * 3, 2, 24 + i * 3, '#9aa7b8'); P.disc(x + 1, -26 - i * 3, 2.5, Math.floor(t * 3 + i) % 2 ? glow : '#ffffff'); }
  if (gear) hit('gear', 236, -50, 240 + gear * 10, 0);
  for (let k = 0; k < Math.min(6, site.crew); k++) { const w = (t * 0.1 + k / 6) % 1; worker(P, 30 + w * 190, 0, 'walk', Math.floor(t * 5 + k), Math.floor(t * 0.2 + k) % 2 === 1, '#e8e4f2'); }
}

/* ---------- the exchange in orbit ---------- */
function drawSpace(g, P, view, planet, t) {
  for (let i = 0; i < 160; i++) { const x = h01(i) * 340 - 10, y = -170 + h01(i + 500) * 180; g.globalAlpha = 0.4 + 0.6 * h01(i + 900); P.rect(x, y, 1, 1, planet.stars || '#ffffff'); }
  g.globalAlpha = 1;
  // the planet below
  P.disc(160, 260, 250, planet.surface || '#5a4a6a');
  g.globalAlpha = 0.35; P.disc(160, 262, 250, planet.sky[1]); g.globalAlpha = 1;
}
function drawExchange(P, site, t, hit, bang) {
  const docks = lvOf(site, 'docks'), floor = lvOf(site, 'floor'), lounge = lvOf(site, 'lounge'), desk = lvOf(site, 'desk');
  const cx = 160, cy = -80;
  P.rect(cx - 70, cy - 4, 140, 8, '#9aa7b8'); P.rect(cx - 6, cy - 40, 12, 80, '#9aa7b8');
  // trading floor: the big ring with screens
  for (let i = 0; i < floor; i++) { const x = cx - 30 + i * 12 - (floor * 6) + 30; P.rect(x, cy - 18, 10, 14, '#4a3a6a'); P.rect(x + 2, cy - 16, 6, 4, Math.floor(t * 3 + i) % 3 ? '#5ee6a8' : '#ff5a6e'); }
  hit('floor', cx - 50, cy - 22, cx + 50, cy - 2);
  // docks with ships
  for (let i = 0; i < docks; i++) {
    const side = i % 2 ? 1 : -1, x = cx + side * (78 + Math.floor(i / 2) * 18);
    P.rect(x - 6, cy - 2, 12, 4, '#cfd6e0');
    const ph = ((t / 11) + i * 0.3) % 1;
    if (ph < 0.6) drawShip(P.g, P.view, 'freighter', 1, x, cy - 3, t, false, side < 0);
  }
  hit('docks', cx - 140, cy - 20, cx + 140, cy + 10);
  if (lounge) { P.disc(cx, cy + 30, 10 + lounge * 2, '#b892ff'); P.disc(cx, cy + 30, 8 + lounge * 2, '#2a2040'); P.rect(cx - 4, cy + 28, 8, 2, '#ffd23f'); hit('lounge', cx - 20, cy + 16, cx + 20, cy + 46); }
  if (desk) { P.rect(cx - 30, cy + 8, 18, 10, '#ffd23f'); P.rect(cx - 28, cy + 10, 14, 3, '#140c1c'); hit('desk', cx - 32, cy + 6, cx - 10, cy + 20); }
  // solar wings
  P.rect(cx - 6, cy - 60, 12, 20, '#2a4a8a'); P.rect(cx - 6, cy + 40, 12, 20, '#2a4a8a');
}

/* ---------- arriving ---------- */
function drawArriving(P, site, t, now) {
  const f = Math.max(0, Math.min(1, (now - site.arrive.at) / Math.max(1, site.arrive.doneAt - site.arrive.at)));
  P.rect(110, -2, 100, 2, '#5a5a6a');
  for (let i = 0; i < 6; i++) { const x = 120 + i * 14; if (f > i / 6) P.sprite(crateSprite('#ffd23f'), x, -1, 0, 9, false, 1); }
  const ph = (t / 5) % 1, up = ph < 0.3 ? ph / 0.3 : ph > 0.7 ? (1 - ph) / 0.3 : 1;
  drawShip(P.g, P.view, 'freighter', 0, 160, -4 - (1 - up) * 80, t, true, false);
}
