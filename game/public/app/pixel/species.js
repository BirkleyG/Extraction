/* Species sprites: miners and portraits assembled from the shared parts library (game/shared/species).
 *   speciesSprite(species, pose, frame) -> 24x27 canvas, feet at (12, 24), facing right (same anchor as personSprite)
 *       pose: 'walk' | 'swing' | 'cheer' | 'idle', frame 0-2
 *   speciesPortrait(species, size, frame) -> square canvas with a backdrop (previews, score screen)
 *   speciesBustURL(species) -> data URL of the head and shoulders (leaderboard, feed)
 * Cosmetic only. Any input is cleaned with cleanSpecies first, so old { name, color } species work too. */
import { cleanSpecies, paletteOf } from '/shared/species/index.js';
import { mkCv, outline } from './sprites.js';
import { shade, mix } from '/shared/planet/util.js';

const CACHE = new Map();
const DARK = '#1a1022', WHITE = '#ffffff', GOLD = '#ffd23f', METAL = '#9aa7b8', METAL_D = '#4a5262', WOOD = '#8a5a3c';
const HEAD_TOP = { round: 7, block: 7, tall: 3, bulb: 5, horns: 7, fin: 7, mushroom: 4, crystal: 7, antlers: 7, longears: 7 };
const BARE = new Set(['stout', 'shell', 'blob']);

const keyOf = (s) => [s.head, s.body, s.arms, s.legs, s.eyes, s.mouth, s.pattern, s.accessory, s.palette, s.color].join(',');
const cleanCache = new WeakMap();
function clean(sp) {
  if (sp && typeof sp === 'object') { let c = cleanCache.get(sp); if (!c) { c = cleanSpecies(sp); cleanCache.set(sp, c); } return c; }
  return cleanSpecies(sp);
}

export function speciesSprite(species, pose = 'walk', frame = 0) {
  const sp = clean(species);
  const key = keyOf(sp) + '|' + pose + '|' + frame;
  let cv = CACHE.get(key);
  if (cv) return cv;
  cv = drawFigure(sp, pose, frame);
  if (CACHE.size > 600) CACHE.clear();
  CACHE.set(key, cv);
  return cv;
}

function drawFigure(sp, pose, f) {
  const [c, g] = mkCv(24, 27);
  const B = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const Px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const pal = paletteOf(sp);
  const skin = pal.skin, skinD = shade(skin, -0.25), skinL = shade(skin, 0.25);
  const suit = sp.color || pal.suit, suitD = shade(suit, -0.32), suitL = shade(suit, 0.2);
  const acc = pal.accent, accD = shade(acc, -0.3);
  const pants = shade(suit, -0.45), shoe = '#1d1424';
  const T = HEAD_TOP[sp.head] ?? 7;
  const bare = BARE.has(sp.body);
  const armCol = sp.arms === 'tentacle' ? skin : sp.arms === 'mech' ? METAL : bare ? skin : suit;

  // ---- behind the body: cape, tank, back arm
  if (sp.accessory === 'cape') { B(5, 14, 3, 8, accD); B(4, 18 + (f % 2), 2, 5, accD); B(6, 14, 2, 1, acc); }
  if (sp.accessory === 'tank') { B(4, 14, 3, 6, METAL); B(4, 14, 1, 6, '#cfd6e0'); Px(5, 13, '#ff5a6e'); Px(7, 14, METAL_D); }
  if (sp.body === 'shell') { B(5, 13, 4, 8, suitD); B(5, 13, 4, 1, suitL); B(6, 15, 2, 1, suitL); B(6, 18, 2, 1, suitL); }

  // back arm (hidden behind body except when cheering)
  const hands = {
    walk: [[14, 18 + (f === 1 ? 1 : 0)], [8, 18]],
    idle: [[14, 19], [8, 19]],
    swing: [[[15, 10], [17, 15], [17, 19]][f % 3], [8, 18]],
    cheer: [[16, 9], [6, 9]],
  }[pose] || [[14, 19], [8, 19]];
  if (pose === 'cheer') drawArm(8, 15, hands[1][0], hands[1][1], true);

  // ---- legs
  const L = sp.legs;
  if (L === 'legs') {
    const leg = (x, top) => { B(x, top, 2, 25 - top, pants); B(x, 24, 2, 1, shoe); };
    const step = pose === 'walk' ? f : 0;
    if (step === 1) { leg(7, 20); leg(13, 20); } else if (step === 2) { leg(9, 20); leg(11, 20); } else { leg(8, 20); leg(12, 20); }
  } else if (L === 'stubby') {
    B(8, 20, 6, 2, pants);
    const up = pose === 'walk' && f === 1 ? 1 : 0;
    B(7, 22 - up, 3, 3, shoe); B(12, 22, 3, 3, shoe); Px(9, 22 - up, '#3a2f48'); Px(14, 22, '#3a2f48');
  } else if (L === 'bird') {
    const lc = '#f0a030', dx = pose === 'walk' ? [0, 1, -1][f % 3] : 0;
    for (let y = 20; y < 24; y++) { Px(9 - (y === 22 ? 1 : 0) + (y > 21 ? dx : 0), y, lc); Px(12 + (y === 22 ? 1 : 0) - (y > 21 ? dx : 0), y, lc); }
    B(7 + dx, 24, 3, 1, lc); B(12 - dx, 24, 3, 1, lc);
  } else if (L === 'tentacles') {
    for (let i = 0; i < 4; i++) {
      const x0 = 8 + i * 1.7;
      for (let y = 20; y <= 24; y++) Px(Math.round(x0 + Math.sin((y - 20) * 0.9 + f * 2 + i * 1.3) * (y - 19) * 0.45), y, i % 2 ? skin : skinD);
    }
    B(8, 20, 6, 1, skin);
  } else if (L === 'wheel') {
    B(10, 20, 2, 1, METAL_D);
    B(9, 21, 5, 4, '#2a2238'); B(8, 22, 7, 2, '#2a2238');
    B(10, 22, 3, 2, METAL);
    const sp2 = [[11, 21], [14, 22], [11, 24], [8, 23]][(pose === 'walk' ? f : 0) % 4];
    Px(sp2[0], sp2[1], METAL);
  } else { // hover
    B(9, 20, 4, 1, METAL_D);
    B(10, 21, 2, 1, acc); Px(10 + (f % 2), 22, mix(acc, WHITE, 0.5)); if (f !== 1) Px(11 - (f % 2), 23, acc);
  }

  // ---- body
  const Bd = sp.body;
  if (Bd === 'suit') { B(8, 14, 6, 6, suit); B(13, 14, 1, 6, suitD); B(8, 18, 6, 1, '#2a1f18'); Px(10, 18, '#d9b860'); }
  else if (Bd === 'stout') { B(7, 14, 8, 6, skin); B(9, 15, 4, 2, skinL); B(7, 17, 8, 3, suit); B(8, 14, 1, 3, suit); B(13, 14, 1, 3, suit); B(14, 17, 1, 3, suitD); }
  else if (Bd === 'slim') { B(9, 14, 4, 6, suit); B(12, 14, 1, 6, suitD); B(10, 15, 1, 3, acc); }
  else if (Bd === 'shell') { B(8, 14, 6, 6, skin); B(9, 15, 4, 3, skinL); B(8, 19, 6, 1, suitD); }
  else if (Bd === 'robe') { B(8, 14, 6, 7, suit); B(7, 20, 8, 3, suit); B(13, 14, 1, 7, suitD); B(7, 22, 8, 1, acc); B(10, 14, 1, 8, acc); }
  else if (Bd === 'armored') { B(8, 14, 6, 6, suit); B(8, 14, 6, 3, METAL); B(8, 16, 6, 1, METAL_D); Px(9, 15, '#cfd6e0'); Px(12, 15, '#cfd6e0'); B(12, 13, 3, 2, '#cfd6e0'); B(8, 18, 6, 1, '#2a1f18'); }
  else { /* blob */ B(8, 14, 6, 1, skin); B(7, 15, 8, 5, skin); B(8, 20, 6, 1, skin); B(9, 16, 3, 2, skinL); Px(8, 15, acc); Px(9, 16, acc); Px(10, 17, acc); Px(11, 18, acc); Px(12, 19, acc); }

  // ---- head
  const H = sp.head;
  const round = () => { B(8, 7, 6, 1, skin); B(7, 8, 8, 5, skin); B(8, 13, 6, 1, skin); };
  if (H === 'round') round();
  else if (H === 'block') { B(7, 7, 8, 7, skin); B(7, 7, 8, 1, skinL); B(7, 13, 8, 1, skinD); }
  else if (H === 'tall') { B(9, 3, 4, 1, skin); B(8, 4, 6, 3, skin); round(); Px(10, 4, skinL); }
  else if (H === 'bulb') { B(7, 5, 8, 1, skinL); B(6, 6, 10, 2, skinL); round(); Px(8, 6, skinD); Px(9, 5, skinD); Px(11, 6, skinD); Px(12, 6, skinD); Px(13, 5, skinD); Px(14, 7, skinD); }
  else if (H === 'horns') { round(); const bone = '#f2ead8'; Px(7, 7, bone); Px(6, 6, bone); Px(6, 5, bone); Px(7, 4, bone); Px(14, 7, bone); Px(15, 6, bone); Px(15, 5, bone); Px(14, 4, bone); }
  else if (H === 'fin') { round(); B(9, 6, 1, 1, acc); B(10, 4, 1, 3, acc); B(11, 3, 1, 4, acc); B(12, 4, 1, 3, accD); Px(13, 6, accD); }
  else if (H === 'mushroom') { B(8, 9, 6, 5, skin); B(7, 4, 8, 1, acc); B(6, 5, 10, 2, acc); B(5, 7, 12, 2, acc); B(5, 8, 12, 1, accD); Px(8, 5, skinL); Px(12, 6, skinL); Px(14, 7, skinL); Px(7, 7, skinL); Px(10, 7, skinL); }
  else if (H === 'crystal') {
    B(8, 7, 6, 1, skin); B(7, 8, 8, 6, skin);
    const cr = mix(acc, '#bfefff', 0.5), crL = mix(cr, WHITE, 0.6);
    B(8, 4, 2, 3, cr); B(11, 2, 2, 5, cr); B(13, 5, 2, 2, cr); Px(11, 2, crL); Px(8, 4, crL); Px(13, 5, crL);
  }
  else if (H === 'antlers') { round(); const an = '#a07048'; for (const [x, y] of [[8, 6], [8, 5], [7, 4], [7, 3], [6, 4], [6, 2], [8, 2], [13, 6], [13, 5], [14, 4], [14, 3], [15, 4], [15, 2], [13, 2]]) Px(x, y, an); }
  else if (H === 'longears') { round(); B(8, 1, 2, 6, skin); Px(8, 2, mix(acc, '#ff9fd0', 0.6)); Px(8, 3, mix(acc, '#ff9fd0', 0.6)); Px(8, 4, mix(acc, '#ff9fd0', 0.6)); B(11, 2, 2, 5, skin); Px(12, 3, mix(acc, '#ff9fd0', 0.6)); Px(12, 4, mix(acc, '#ff9fd0', 0.6)); }
  // cheek shading on the back of the head
  if (H !== 'mushroom') Px(7, 12, skinD);

  // ---- skin pattern (only on skin pixels)
  if (sp.pattern !== 'none') {
    const img = g.getImageData(0, 0, 24, 27), d = img.data;
    const sr = parseInt(skin.slice(1, 3), 16), sg = parseInt(skin.slice(3, 5), 16), sb = parseInt(skin.slice(5, 7), 16);
    const toRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const pc = toRgb(sp.pattern === 'glow' ? mix(acc, WHITE, 0.3) : sp.pattern === 'patches' ? skinL : sp.pattern === 'freckles' ? shade(skin, -0.35) : shade(skin, -0.22));
    for (let y = 0; y < 27; y++) for (let x = 0; x < 24; x++) {
      const i = (y * 24 + x) * 4;
      if (d[i + 3] === 0 || d[i] !== sr || d[i + 1] !== sg || d[i + 2] !== sb) continue;
      const p = sp.pattern;
      const on = p === 'spots' ? ((x * 7 + y * 13) % 9 === 0 || (x * 3 + y * 5) % 11 === 0)
        : p === 'stripes' ? (x + Math.floor(y / 2)) % 4 === 0
        : p === 'scales' ? (y % 2 === 0 ? x % 2 === 0 : false) || (y % 2 === 1 && x % 4 === 1)
        : p === 'glow' ? ((x * 5 + y * 3) % 9 === 0 || (x * 2 + y * 7) % 13 === 0)
        : p === 'patches' ? (((x >> 1) + (y >> 1) * 3) % 5 === 0)
        : p === 'freckles' ? (y >= 10 && y <= 12 && (x * 3 + y) % 4 === 0)
        : false;
      if (on) { d[i] = pc[0]; d[i + 1] = pc[1]; d[i + 2] = pc[2]; }
    }
    g.putImageData(img, 0, 0);
  }

  // ---- eyes
  const E = sp.eyes;
  if (E === 'dots') { Px(10, 10, DARK); Px(13, 10, DARK); }
  else if (E === 'big') { B(9, 9, 2, 2, WHITE); B(12, 9, 2, 2, WHITE); Px(10, 10, DARK); Px(13, 10, DARK); }
  else if (E === 'cyclops') { B(10, 9, 3, 3, WHITE); B(11, 10, 2, 1, DARK); Px(12, 9, mix(acc, DARK, 0.3)); }
  else if (E === 'triple') { Px(9, 10, DARK); Px(11, 9, DARK); Px(13, 10, DARK); Px(11, 8, skinL); }
  else if (E === 'visor') { B(8, 9, 7, 2, '#4ad0ff'); B(8, 10, 7, 1, '#2a8ac0'); Px(13, 9, WHITE); }
  else if (E === 'sleepy') { B(9, 9, 2, 1, skinD); B(12, 9, 2, 1, skinD); B(9, 10, 2, 1, DARK); B(12, 10, 2, 1, DARK); }
  else if (E === 'compound') { B(9, 9, 2, 2, DARK); B(12, 9, 2, 2, DARK); Px(9, 9, acc); Px(10, 10, acc); Px(12, 9, acc); Px(13, 10, acc); }
  else if (E === 'stalks') { const s = skinD; Px(10, 6, s); Px(10, 5, s); Px(13, 6, s); Px(13, 5, s); Px(13, 4, s); B(9, 3, 2, 2, WHITE); B(12, 2, 2, 2, WHITE); Px(10, 4, DARK); Px(13, 3, DARK); }

  // ---- mouth
  const M = sp.mouth;
  if (M === 'smile') { Px(10, 12, DARK); B(11, 13, 2, 1, DARK); Px(13, 12, DARK); }
  else if (M === 'fangs') { B(10, 12, 4, 1, DARK); Px(10, 13, WHITE); Px(13, 13, WHITE); }
  else if (M === 'beak') { const bk = '#f0a030'; B(14, 11, 2, 2, bk); Px(16, 12, bk); Px(15, 12, shade(bk, -0.3)); }
  else if (M === 'mandibles') { const md = '#5a3a20'; Px(14, 11, md); Px(15, 11, md); Px(16, 12, md); Px(14, 13, md); Px(15, 13, md); }
  else if (M === 'tongue') { B(11, 12, 2, 1, DARK); Px(12, 13, '#ff7a9a'); Px(12, 14, '#ff7a9a'); }
  else if (M === 'grin') { B(10, 12, 4, 1, WHITE); Px(11, 12, '#c8c0d8'); B(10, 13, 4, 1, DARK); }
  else if (M === 'beard') { B(9, 13, 1, 3, skinD); B(11, 13, 1, 4, skinD); B(13, 13, 1, 3, skinD); Px(11, 17 - (f % 2), skinD); }

  // ---- front arm + tool
  drawArm(13, 15, hands[0][0], hands[0][1], false);
  if (pose === 'swing') {
    const tc = '#cfd6e0';
    if (f % 3 === 0) { const [hx, hy] = hands[0]; Px(hx, hy - 1, WOOD); Px(hx, hy - 2, WOOD); Px(hx, hy - 3, WOOD); B(hx - 3, hy - 4, 7, 1, tc); Px(hx - 3, hy - 3, tc); Px(hx + 3, hy - 3, tc); }
    else if (f % 3 === 1) { B(18, 15, 3, 1, WOOD); B(21, 13, 1, 5, tc); Px(22, 13, tc); }
    else { Px(18, 20, WOOD); Px(19, 21, WOOD); B(18, 22, 4, 1, tc); Px(21, 21, tc); }
  }

  // ---- accessories (front)
  const A = sp.accessory;
  if (A === 'lamp') { const hat = '#ffd23f'; B(8, T - 1, 6, 1, hat); B(7, T, 8, 1, hat); B(6, T + 1, 10, 1, '#e0a020'); Px(15, T, '#fff6c2'); Px(16, T, '#fff6c2'); }
  else if (A === 'goggles') { B(7, 8, 8, 1, '#2a1f18'); B(9, 7, 2, 2, '#7ad1ff'); B(12, 7, 2, 2, '#7ad1ff'); Px(9, 7, WHITE); Px(12, 7, WHITE); }
  else if (A === 'scarf') { B(8, 14, 6, 1, acc); B(7, 14, 1, 2, acc); Px(6, 15, accD); Px(5, 16 + (f % 2), accD); }
  else if (A === 'crown') { B(8, T - 2, 6, 2, GOLD); Px(8, T - 3, GOLD); Px(10, T - 3, GOLD); Px(13, T - 3, GOLD); Px(11, T - 1, '#ff5a6e'); }
  else if (A === 'monocle') { for (const [x, y] of [[12, 9], [14, 9], [12, 11], [14, 11], [13, 8]]) Px(x, y, GOLD); Px(12, 12, GOLD); Px(11, 13, GOLD); }
  else if (A === 'flower') { const fc = mix(acc, '#ff5ec4', 0.5); Px(8, T - 2, fc); Px(7, T - 1, fc); Px(9, T - 1, fc); Px(8, T, fc); Px(8, T - 1, GOLD); }
  else if (A === 'earring') { Px(8, 12, GOLD); Px(8, 13, GOLD); }
  else if (A === 'halo') { const hc = '#fff6a0'; B(8, T - 4, 6, 1, hc); Px(7, T - 3, hc); Px(14, T - 3, hc); }
  else if (A === 'bandana') { B(7, T + 1, 8, 1, acc); Px(6, T + 2, acc); Px(5, T + 3, accD); }
  else if (A === 'tank') { Px(7, 13, METAL_D); Px(8, 12, METAL_D); }

  outline(c);
  return c;

  function drawArm(sx, sy, hx, hy, back) {
    const col = back ? shade(armCol, -0.2) : armCol;
    const n = Math.max(Math.abs(hx - sx), Math.abs(hy - sy));
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; pts.push([Math.round(sx + (hx - sx) * t), Math.round(sy + (hy - sy) * t)]); }
    const a = sp.arms;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x, y] = pts[i];
      const wob = a === 'tentacle' ? Math.round(Math.sin(i * 1.4 + f) * 0.6) : 0;
      Px(x + wob, y, col);
      if (a === 'long') Px(x, y + 1, col);
      if (a === 'wing') { Px(x - 1, y + 1, back ? accD : acc); Px(x - 1, y + 2, accD); }
    }
    if (a === 'mech' && pts.length > 2) { const [mx, my] = pts[Math.floor(pts.length / 2)]; Px(mx, my, METAL_D); }
    const hand = back ? shade(skin, -0.2) : skin;
    if (a === 'claw') { const cc = back ? accD : shade(acc, -0.1); Px(hx, hy, cc); Px(hx + 1, hy - 1, cc); Px(hx + 1, hy + 1, cc); }
    else if (a === 'tentacle') { Px(hx, hy, skinD); Px(hx + 1, hy + 1, skinD); }
    else if (a === 'mech') { Px(hx, hy, '#cfd6e0'); Px(hx + 1, hy, METAL_D); }
    else if (a === 'long') { B(hx, hy, 2, 2, hand); }
    else Px(hx, hy, hand);
  }
}

// A square portrait with a palette backdrop; size is the output in px (multiple of 24 looks best).
export function speciesPortrait(species, size = 96, frame = 0, pose = 'idle') {
  const sp = clean(species);
  const pal = paletteOf(sp);
  const [c, g] = mkCv(size, size);
  g.imageSmoothingEnabled = false;
  const k = Math.max(1, Math.floor(size / 28));
  const R = size / 2;
  // backdrop: dark disc with a ring in the accent colour
  g.fillStyle = shade(pal.suit, -0.7); g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.fill();
  g.fillStyle = mix(pal.accent, pal.suit, 0.5); g.globalAlpha = 0.35;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + frame * 0.05; g.fillRect(Math.round(R + Math.cos(a) * R * 0.75) - k, Math.round(R + Math.sin(a) * R * 0.75) - k, 2 * k, 2 * k); }
  g.globalAlpha = 1;
  const img = speciesSprite(sp, pose, frame);
  g.drawImage(img, Math.round(R - 12 * k), Math.round(size - 2 - 26 * k), 24 * k, 27 * k);
  return c;
}

const bustCache = new Map();
export function speciesBustURL(species) {
  const sp = clean(species);
  const key = keyOf(sp);
  let u = bustCache.get(key);
  if (!u) {
    const [c, g] = mkCv(20, 18);
    g.drawImage(speciesSprite(sp, 'idle', 0), 1, 0, 20, 18, 0, 0, 20, 18);
    u = c.toDataURL();
    bustCache.set(key, u);
  }
  return u;
}
