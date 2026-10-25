/* Pixel cutaway renderer for the play sandbox. Uses the original game's sprite factory and drawing helpers (sprites.js),
 * the same layered-sky / moons / strata / tunnel / ore-pile look, and swaps in a per-region topography. */
import {
  PXC, hash, rng, clamp, lerp, ease, bx, by, pR, pB, pL, pD, pS, mkCv, hexMix, sh,
  personSprite, oreSprite, crateSprite, drawShipPx, drawPile, drawCrateStack, shipSprite,
} from './sprites.js';

const SX = 175; // lift shaft x
const WW = 610; // world width we frame
const TH = 26; // tunnel height
const LV0 = 46; // first tunnel floor
const LVH = 38; // vertical spacing between shaft levels
const HAB_X = 62;
const YARD_X0 = 275;
const PAD_X = 555;
const lvY = (i) => LV0 + i * LVH;
const LAYER_H = LVH * 6;
const ROCK = { x0: -320, w: 1500, h: 5 * LAYER_H + 30 };

const h01 = (i, sd) => { let h = Math.imul((i | 0) ^ (sd | 0), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
const vn = (x, sd) => { const i = Math.floor(x); const f = x - i; const u = f * f * (3 - 2 * f); return lerp(h01(i, sd), h01(i + 1, sd), u); };

let fg = null; let fgG = null; let bg = null; let bgG = null; let rock = null; let bgKey = '';
let labels = [];

function ensureBuffers(W, H) {
  const ps = Math.max(2, Math.round(1.5 * (window.devicePixelRatio || 1)));
  const bw = Math.max(8, Math.ceil(W / ps)); const bh = Math.max(8, Math.ceil(H / ps));
  if (!fg) { fg = document.createElement('canvas'); bg = document.createElement('canvas'); }
  if (fg.width !== bw || fg.height !== bh) { fg.width = bw; fg.height = bh; bg.width = bw; bg.height = bh; bgKey = ''; }
  fgG = fg.getContext('2d'); bgG = bg.getContext('2d');
  fgG.imageSmoothingEnabled = false; bgG.imageSmoothingEnabled = false;
  PXC.bw = bw; PXC.bh = bh; PXC.ps = ps;
  return ps;
}

function ground(planet, region) {
  const T = region.terrain;
  let col = hexMix(planet.surface, region.biome, 0.72);
  if (T === 'glacier') col = hexMix(region.biome, '#ffffff', 0.55);
  if (T === 'saltflat') col = hexMix(region.biome, '#ffffff', 0.3);
  if (T === 'dunes') col = sh(region.biome, 0.05);
  return col;
}

/* ---------- skyline per topography ---------- */
function ridge(T, wx, L, sd, planet) {
  switch (T) {
    case 'mesa': { const q = Math.floor(vn(wx * 0.011 + L * 7, sd) * 5) / 5; return { h: L ? 10 + q * 30 : 30 + q * 62 }; }
    case 'dunes': return { h: (L ? 7 : 16) + (L ? 5 : 9) * Math.sin(wx * 0.011 + (sd % 7) + L) + (L ? 3 : 6) * Math.sin(wx * 0.027 + 2) };
    case 'glacier': { const j = Math.abs((((wx * (L ? 0.05 : 0.028) + (sd % 9)) % 2) + 2) % 2 - 1); return { h: (L ? 14 : 34) + j * (L ? 30 : 70) + vn(wx * 0.1, sd) * 8 }; }
    case 'volcanic': {
      let h = L ? 8 + vn(wx * 0.02, sd) * 14 : 14 + vn(wx * 0.012, sd) * 20;
      if (!L) for (let k = 0; k < 3; k += 1) { const c = 70 + k * 270 + (sd % 70); const d = Math.abs(wx - c); let cone = 88 - d * 0.6; if (cone > 0) { if (d < 9) cone = 74 - (9 - d) * 2.4; h = Math.max(h, cone); } }
      return { h };
    }
    case 'swamp': return { h: (L ? 5 : 14) + (L ? 3 : 7) * Math.sin(wx * 0.017 + (sd % 5)) + vn(wx * 0.06, sd) * 4 };
    case 'crystal': {
      const cell = L ? 30 : 44; const idx = Math.floor(wx / cell); const cen = idx * cell + cell * (0.3 + h01(idx, sd) * 0.4);
      const H = (L ? 26 : 54) + h01(idx + 99, sd) * (L ? 30 : 70); const w = cell * 0.5; const d = Math.abs(wx - cen);
      const col = planet.ores[(idx + L * 2 + ((sd >> 3) % 7) + 70) % planet.ores.length].color;
      return d < w ? { h: Math.max(L ? 3 : 6, H * (1 - d / w)), c: col } : { h: L ? 3 : 6 };
    }
    case 'fungal': {
      const cell = L ? 40 : 56; const idx = Math.floor(wx / cell); const cen = idx * cell + cell * 0.5;
      const stem = (L ? 14 : 26) + h01(idx, sd) * (L ? 12 : 30); const capR = (L ? 9 : 15) + h01(idx + 5, sd) * (L ? 6 : 10); const dx = Math.abs(wx - cen);
      let h = 4; let cap = false;
      if (dx < 2.5) h = stem;
      if (dx < capR) { const ch = stem + Math.sqrt(1 - (dx / capR) ** 2) * capR * 0.55; if (ch > h) { h = ch; cap = true; } }
      return { h, cap };
    }
    case 'canyon': { const n = vn(wx * 0.008 + L * 3, sd); let h = (L ? 20 : 50) + n * (L ? 24 : 56); h = Math.floor(h / 7) * 7; return { h: vn(wx * 0.004 + 9, sd) > 0.72 ? (L ? 4 : 10) : h }; }
    default: return { h: L ? 3 + vn(wx * 0.05, sd) * 3 : 6 + vn(wx * 0.02, sd) * 8 };
  }
}

function drawSkyline(planet, region, hy, s, sd, craters) {
  const T = region.terrain; const g = PXC.g;
  for (const L of [0, 1]) {
    let base = sh(region.biome, L ? -0.3 : -0.5);
    base = hexMix(base, planet.sky[1], L ? 0.08 : 0.2);
    for (let col = 0; col < PXC.bw; col += 2) {
      const wx = (col - PXC.ox) / PXC.s;
      const r = ridge(T, wx, L, sd, planet);
      const h = Math.max(1, Math.round(r.h * s)); const top = hy - h;
      let c = base;
      if (r.c) c = hexMix(sh(r.c, L ? -0.25 : -0.4), planet.sky[1], L ? 0.05 : 0.15);
      else if (T === 'fungal' && r.cap) c = hexMix(sh(region.biome, 0.2), '#ff9fd0', L ? 0.25 : 0.35);
      pB(col, top, 2, h, c);
      if (T === 'mesa' || T === 'canyon') for (let y = top; y < hy; y += Math.max(2, Math.round(6 * s))) { if (((y - top) / Math.max(2, Math.round(6 * s))) % 2 === 0) pB(col, y, 2, 1, sh(c, T === 'canyon' ? 0.12 : 0.08)); }
      if (T === 'glacier') { const cap = Math.max(2, Math.round(5 * s)); pB(col, top, 2, Math.min(cap, h), L ? '#ffffff' : '#cfe6f6'); }
      else if (T === 'dunes' || T === 'crystal') pB(col, top, 2, 1, sh(c, 0.3));
      else if (T === 'volcanic' && !L && r.h > 60) pB(col, top, 2, 1, '#ff6a2a');
    }
  }
  if (T === 'volcanic') for (let k = 0; k < 3; k += 1) { const c = 70 + k * 270 + (sd % 70); craters.push({ x: c, y: -74 }); }
  g.globalAlpha = 1;
}

/* ---------- sky ---------- */
function drawSky(planet, hy) {
  const g = PXC.g; const bands = [];
  for (let i = 0; i < 10; i += 1) bands.push(hexMix(planet.sky[0], planet.sky[1], i / 9));
  for (let i = 0; i < 10; i += 1) { const y0 = Math.floor(hy * i / 10); const y1 = Math.floor(hy * (i + 1) / 10); pB(0, y0, PXC.bw, y1 - y0 + 1, bands[i]); }
  const R0 = rng(hash(planet.id)); const stars = [];
  for (let i = 0; i < 150; i += 1) stars.push({ x: R0() * PXC.bw, y: R0() * hy * 0.85, b: R0() < 0.15, a: 0.3 + R0() * 0.7 });
  for (const st of stars) { g.globalAlpha = st.a; pB(st.x, st.y, st.b ? 2 : 1, st.b ? 2 : 1, planet.stars); }
  g.globalAlpha = 1;
  planet.moons.forEach((m, i) => {
    const r = (m.size ? 0.075 : 0.04) * hy * (0.9 + R0() * 0.3) + 3;
    const x = PXC.bw * (0.12 + R0() * 0.76); const y = hy * (0.14 + R0() * 0.34);
    g.globalAlpha = 0.14; pD(x, y, r * 1.5, m.color, g, true); g.globalAlpha = 1;
    pD(x, y, r, m.color, g, true);
    pD(x + r * 0.35, y - r * 0.2, r * 0.25, sh(m.color, -0.16), g, true);
    pD(x - r * 0.3, y + r * 0.3, r * 0.18, sh(m.color, -0.2), g, true);
    if (m.size) pD(x - r * 0.1, y - r * 0.45, r * 0.14, sh(m.color, -0.12), g, true);
    stars.length = stars.length;
    return i;
  });
  return stars;
}

/* ---------- ground decor, per topography ---------- */
function drawSurfaceStrip(planet, region, sd) {
  const gc = ground(planet, region); const R0 = rng(sd + 11);
  pR(ROCK.x0, 0, ROCK.w, 8, gc);
  for (let x = ROCK.x0; x < ROCK.x0 + ROCK.w; x += 2) { const h = Math.floor(R0() * 3); pR(x, -h, 2, h + 1, gc); }
  for (let x = ROCK.x0; x < ROCK.x0 + ROCK.w; x += 3) if (R0() < 0.5) pR(x, -1 - Math.floor(R0() * 3), 1, 2, sh(gc, 0.15));
  pR(ROCK.x0, 8, ROCK.w, 2, sh(gc, -0.25));
  const T = region.terrain;
  for (let x = -30; x < WW + 40; x += 6 + Math.floor(R0() * 14)) {
    const roll = R0();
    if (T === 'mesa') { if (roll < 0.5) pR(x, -3, 6, 3, sh(gc, -0.3)); else if (roll < 0.75) { pR(x, -3, 7, 3, sh(gc, -0.25)); pR(x + 1, -6, 4, 3, sh(gc, -0.1)); } else if (roll < 0.9) { pR(x, -15, 4, 15, sh(gc, -0.2)); pR(x, -15, 1, 15, sh(gc, 0.1)); } }
    else if (T === 'dunes') { if (roll < 0.6) { pR(x, -1, 10 + Math.floor(R0() * 8), 1, sh(gc, 0.22)); pR(x + 3, -2, 5, 1, sh(gc, 0.1)); } else if (roll < 0.8) { pL(x, 0, x + 2, -6, '#6a4a2a', 1); pL(x, -3, x - 3, -6, '#6a4a2a', 1); pL(x, -3, x + 4, -7, '#6a4a2a', 1); } }
    else if (T === 'glacier') { if (roll < 0.5) drawMound(x, 8 + Math.floor(R0() * 8), '#f4fbff'); else if (roll < 0.8) { const h = 6 + Math.floor(R0() * 10); pR(x, -h, 3, h, '#bfe3f6'); pR(x, -h, 1, h, '#ffffff'); pR(x + 3, -h + 4, 2, h - 4, '#8fc4e0'); } }
    else if (T === 'volcanic') { if (roll < 0.4) pR(x, -1, 9, 1, '#ff6a2a'); else if (roll < 0.75) { const h = 4 + Math.floor(R0() * 8); pR(x, -h, 3, h, '#1a1218'); pR(x + 1, -h - 2, 1, 2, '#1a1218'); pR(x, -h, 1, h, '#3a2a34'); } }
    else if (T === 'swamp') { if (roll < 0.45) { for (let k = 0; k < 3; k += 1) pR(x + k * 2, -6 - (k % 2) * 3, 1, 6 + (k % 2) * 3, '#3a5a2a'); pR(x + 1, -9, 1, 2, '#6a4a2a'); } else if (roll < 0.7) { pR(x, -1, 18, 1, '#2a4a52'); pR(x + 4, -1, 2, 1, '#6ad0c0'); } else if (roll < 0.85) { pR(x, -16, 2, 16, '#3a2a22'); pL(x + 1, -12, x + 6, -18, '#3a2a22', 1); pL(x + 1, -9, x - 4, -15, '#3a2a22', 1); } }
    else if (T === 'crystal') { if (roll < 0.55) { const o = planet.ores[Math.floor(R0() * planet.ores.length)]; const im = oreSprite(o.color, 'crystal', 4 + Math.floor(R0() * 4), Math.floor(R0() * 99)); pS(im, x, 2, im.width / 2, im.height - 1, false); } else if (roll < 0.7) pR(x, -2, 5, 2, sh(gc, 0.2)); }
    else if (T === 'fungal') { if (roll < 0.6) { const sh1 = 5 + Math.floor(R0() * 9); pR(x, -sh1, 2, sh1, '#d8c8b8'); pR(x - 4, -sh1 - 3, 10, 3, hexMix('#ff9fd0', region.biome, 0.25 + R0() * 0.4)); pR(x - 3, -sh1 - 4, 8, 1, '#ffd0e8'); pR(x - 1, -sh1 - 2, 1, 1, '#fff'); } else if (roll < 0.8) pR(x, -2, 5, 2, sh(gc, -0.2)); }
    else if (T === 'canyon') { if (roll < 0.5) { pR(x, -4, 8, 4, sh(gc, -0.3)); pR(x + 1, -7, 5, 3, sh(gc, -0.15)); pR(x + 5, -6, 2, 1, sh(gc, 0.1)); } else if (roll < 0.75) { pR(x, -2, 12, 2, sh(gc, -0.1)); } }
    else if (T === 'saltflat') { if (roll < 0.5) { pL(x, 0, x + 5, -1, sh(gc, -0.3), 1); pL(x + 5, -1, x + 8, 0, sh(gc, -0.3), 1); } else if (roll < 0.8) pR(x, -1, 12, 1, '#ffffff'); }
  }
}
function drawMound(x, h, col) { for (let q = 0; q < h; q += 1) { const w = (h - q) * 1.4 + 1; pR(x - w, -q - 1, w * 2, 1, q % 4 === 0 ? sh(col, -0.12) : col); } }

/* ---------- rock cutaway (cached per planet) ---------- */
function buildRock(planet) {
  const [cv, g] = mkCv(ROCK.w, ROCK.h); const R0 = rng(hash(`${planet.id}rock`));
  const B = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  for (let L = 0; L < 5; L += 1) {
    const y0 = 10 + L * LAYER_H; const col = planet.layers[L].color;
    B(0, y0, ROCK.w, LAYER_H + 1, col);
    for (let y = 0; y < LAYER_H; y += 8) if ((y / 8) % 2) B(0, y0 + y, ROCK.w, 4, sh(col, -0.05));
    for (let k = 0; k < 5 * 6; k += 1) { const yy = y0 + Math.round(LAYER_H * (k + 0.5) / 30); for (let x = 0; x < ROCK.w; x += 4) B(x, yy + Math.round(Math.sin(x * 0.011 + k * 2 + L) * 3), 4, 1, sh(col, -0.2)); }
    for (let k = 0; k < ROCK.w * LAYER_H / 40; k += 1) { const x = Math.floor(R0() * ROCK.w); const y = y0 + Math.floor(R0() * LAYER_H); B(x, y, 1 + (R0() < 0.2 ? 1 : 0), 1, R0() < 0.55 ? sh(col, -0.25) : sh(col, 0.12)); }
    for (let k = 0; k < ROCK.w / 40; k += 1) { const x = R0() * ROCK.w; const y = y0 + 8 + R0() * (LAYER_H - 16); const rx = 4 + R0() * 9; const ry = rx * 0.6; const cl = sh(col, -0.14); for (let yy = -ry; yy <= ry; yy += 1) { const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)))); B(Math.round(x - hw), Math.round(y + yy), hw * 2 + 1, 1, cl); } }
    if (L > 0) for (let x = 0; x < ROCK.w; x += 3) { const j = Math.floor(R0() * 4); B(x, y0 - j, 3, j, planet.layers[L - 1].color); }
  }
  // ore seams: each layer shows the ores that live at that depth
  const byTier = [[0, 1], [2, 3], [4, 2], [5, 4], [6, 5]];
  for (let L = 0; L < 5; L += 1) {
    for (let k = 0; k < ROCK.w / 34; k += 1) {
      const o = planet.ores[byTier[L][R0() < 0.7 ? 0 : 1]]; const r = 3 + Math.floor(R0() * 4);
      const im = oreSprite(o.color, o.cat, r, Math.floor(R0() * 1e6));
      g.drawImage(im, Math.round(R0() * ROCK.w - r), Math.round(10 + L * LAYER_H + R0() * (LAYER_H - 10) - r));
    }
  }
  // depth shading
  for (let y = 0; y < ROCK.h; y += 16) { g.fillStyle = `rgba(8,5,14,${Math.min(0.5, y / ROCK.h * 0.5)})`; g.fillRect(0, y, ROCK.w, 16); }
  return cv;
}

function blitRock(planet) {
  if (!rock || rock.id !== planet.id) rock = { id: planet.id, cv: buildRock(planet) };
  const s = PXC.s;
  const wx0 = ROCK.x0; const wy0 = 0;
  const vx0 = Math.max(wx0, Math.floor(-PXC.ox / s) - 2); const vx1 = Math.min(wx0 + ROCK.w, Math.ceil((PXC.bw - PXC.ox) / s) + 2);
  const vy1 = Math.min(ROCK.h, Math.ceil((PXC.bh - PXC.oy) / s) + 2);
  if (vx1 <= vx0 || vy1 <= 0) return;
  PXC.g.drawImage(rock.cv, vx0 - wx0, 0, vx1 - vx0, vy1, bx(vx0), by(wy0), bx(vx1) - bx(vx0), by(vy1) - by(wy0));
}

/* ---------- weather ---------- */
function drawWeather(fx, hy, t) {
  const g = PXC.g; const bw = PXC.bw;
  if (fx === 'wind') { g.fillStyle = 'rgba(255,255,255,0.3)'; for (let i = 0; i < 16; i += 1) { const x = ((i * 97 + t * 260) % (bw + 60)) - 30; const y = (i * 29) % Math.max(1, hy); g.fillRect(Math.round(x), y, 14, 1); } }
  else if (fx === 'snow') { g.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 80; i += 1) { const x = ((i * 53 + Math.sin(t + i) * 6 + t * 14) % (bw + 20)) - 10; const y = (i * 37 + t * 36) % Math.max(1, hy + 40); if (y < hy + 40) g.fillRect(Math.round(x), Math.round(y), 1, 1); } }
  else if (fx === 'ash') { g.fillStyle = 'rgba(180,170,170,0.5)'; for (let i = 0; i < 60; i += 1) { const x = ((i * 61 + t * 10) % (bw + 20)) - 10; const y = (i * 43 + t * 22) % Math.max(1, hy + 30); g.fillRect(Math.round(x), Math.round(y), 1, 1); } g.fillStyle = 'rgba(255,100,40,0.07)'; g.fillRect(0, Math.round(hy * 0.62), bw, Math.round(hy * 0.38)); }
  else if (fx === 'fog') { g.fillStyle = 'rgba(150,255,120,0.10)'; for (let i = 0; i < 5; i += 1) { const y = Math.round(hy * (0.4 + i * 0.12)); g.fillRect(0, y, bw, Math.max(2, Math.round(hy * 0.05))); } }
  else if (fx === 'aurora') { for (let i = 0; i < 3; i += 1) { g.fillStyle = `rgba(${120 + i * 50},255,${200 - i * 40},0.2)`; for (let x = 0; x < bw; x += 2) { const y = hy * (0.15 + i * 0.1) + Math.sin(x * 0.03 + t + i) * 5; g.fillRect(x, Math.round(y), 2, 4); } } }
  else if (fx === 'spores') { for (let i = 0; i < 40; i += 1) { const x = ((i * 71 + Math.sin(t * 0.6 + i) * 8) % bw + bw) % bw; const y = hy - ((i * 29 + t * 8) % (hy * 0.8)); g.fillStyle = i % 2 ? 'rgba(255,170,230,0.75)' : 'rgba(170,255,220,0.7)'; g.fillRect(Math.round(x), Math.round(y), 1, 1); } }
  else if (fx === 'meteor') { const ph = (t * 0.35) % 1; const x = bw * (0.9 - ph * 0.7); const y = hy * ph * 0.8; for (let i = 0; i < 12; i += 1) pB(x + i, y - i * 0.7, 1, 1, i < 3 ? '#fff3c0' : 'rgba(255,200,120,0.6)'); }
  else if (fx === 'haze') { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 6; i += 1) { const y = Math.round(hy * (0.82 + i * 0.03) + Math.sin(t * 2 + i) * 1.5); g.fillRect(0, y, bw, 1); } }
}

/* ---------- main draw ---------- */
const skinFor = (planet) => hexMix('#f2c9a5', planet.ores[0].color, 0.12);

function pile(x, y, amt, col, maxH) {
  const h = Math.max(2, Math.min(maxH || 24, 3 + Math.sqrt(amt) * 1.3)); const w = 7 + Math.min(8, h * 0.35);
  for (let q = 0; q < h; q += 1) { const ww = w * (1 - q / h) + 1; pR(x - ww, y - q - 1, ww * 2, 1, q % 4 === 0 ? sh(col, -0.25) : (q % 4 === 2 ? sh(col, 0.12) : col)); }
}

function lampGlow(x, y) { const g = PXC.g; g.globalAlpha = 0.2; pD(x, y, 5, '#ffd23f'); g.globalAlpha = 1; pR(x - 1, y - 1, 2, 2, '#ffe9a0'); }

export function renderScene(canvas, ctx, data) {
  const { state, planet, region, t, frac, oreIndex } = data;
  const ps = ensureBuffers(canvas.width, canvas.height);
  const bw = PXC.bw; const bh = PXC.bh;
  const s = Math.max(0.125, Math.floor(Math.min(bw / WW, bh / 330) * 8) / 8);
  PXC.s = s; PXC.ox = Math.round((bw - WW * s) / 2); PXC.oy = Math.round(bh * 0.34);
  const hy = PXC.oy;
  const key = `${planet.id}|${region.id}|${bw}|${bh}|${s}`;
  const sd = hash(region.id + planet.id);
  const craters = [];
  if (key !== bgKey) {
    bgKey = key; PXC.g = bgG; bgG.clearRect(0, 0, bw, bh);
    bgG.fillStyle = '#0b0714'; bgG.fillRect(0, 0, bw, bh);
    const stars = drawSky(planet, hy);
    bgCache.stars = stars.filter((st) => st.b && st.y < hy * 0.3);
    drawSkyline(planet, region, hy, s, sd, craters); bgCache.craters = craters;
    blitRock(planet);
    drawSurfaceStrip(planet, region, sd);
  }
  const g = fgG; PXC.g = g; PXC.labels = labels = [];
  g.globalAlpha = 1; g.drawImage(bg, 0, 0);
  // twinkle
  for (const st of bgCache.stars) { const on = Math.sin(t * 2 + st.x) > 0.5; if (on) pB(st.x, st.y, 2, 2, planet.stars); }
  drawWeather(region.fx, hy, t);
  const simNow = state.simSeconds + (frac || 0);

  // volcano glow and smoke
  for (const c of bgCache.craters) { const glow = 0.5 + 0.5 * Math.sin(t * 3 + c.x); g.globalAlpha = 0.25 * glow; pD(bx(c.x), by(c.y), 7 * s + 3, '#ff6a2a', g, true); g.globalAlpha = 1; pR(c.x - 5, c.y - 1, 10, 2, glow > 0.5 ? '#ffb347' : '#ff6a2a'); for (let q = 0; q < 5; q += 1) { const ph = (t * 0.25 + q / 5) % 1; g.globalAlpha = (1 - ph) * 0.45; pD(bx(c.x + Math.sin(ph * 5 + q) * 6), by(c.y - ph * 90), (3 + ph * 9) * s + 1, '#6a5a60', g, true); } g.globalAlpha = 1; }
  if (region.terrain === 'volcanic') for (let i = 0; i < 9; i += 1) { const x = 30 + i * 80 + (sd % 20); if (Math.sin(t * 2 + i * 1.7) > 0.2) pR(x, -1, 9, 1, '#ffb347'); }
  if (region.terrain === 'fungal') for (let i = 0; i < 12; i += 1) { const x = 20 + i * 58 + (sd % 17); if (Math.sin(t * 1.5 + i) > -0.2) { g.globalAlpha = 0.3; pD(bx(x), by(-8), 5 * s + 1, '#b0ffd8', g, true); g.globalAlpha = 1; } }
  if (region.terrain === 'saltflat') { g.fillStyle = 'rgba(255,255,255,0.14)'; for (let i = 0; i < 4; i += 1) g.fillRect(0, Math.round(hy - (3 + i * 2) * s + Math.sin(t * 3 + i) * 1.2), bw, 1); }

  const shafts = state.production.shafts;
  const shown = Math.min(shafts.length, Math.floor((bh - PXC.oy) / (LVH * s)) + 1, 12);
  const deepest = lvY(Math.max(0, shown - 1));

  // headframe, shaft rail and cage
  const alarm = state.production.surface.capacityUnits > 0 && state.production.surface.unitsByOre.reduce((a, r) => a + r.units, 0) / state.production.surface.capacityUnits > 0.9;
  pR(SX - 1, -58, 2, deepest + 58, '#3a2c4a');
  pL(SX - 22, 0, SX, -58, '#4a3f5a', Math.max(1, s * 2.5)); pL(SX + 22, 0, SX, -58, '#4a3f5a', Math.max(1, s * 2.5)); pR(SX - 12, -30, 24, 2, '#4a3f5a');
  const spin = !(state.production.lift.level < 0); const ang = spin ? t * 6 : 0;
  pD(SX, -58, 9, '#ffb347'); pD(SX, -58, 7, '#2a2238'); for (let k = 0; k < 4; k += 1) { const a = ang + k * Math.PI / 2; pL(SX, -58, SX + Math.cos(a) * 7, -58 + Math.sin(a) * 7, '#ffb347', 1); }
  if (alarm && Math.floor(t * 6) % 2) { pD(SX, -72, 3, '#ff3d3d'); g.globalAlpha = 0.25; pD(SX, -72, 14, '#ff3d3d'); g.globalAlpha = 1; } else pD(SX, -72, 3, '#5a1010');

  // tunnels
  const oreAt = (oreId) => planet.ores[Math.max(0, oreIndex(oreId))];
  const cvx0 = -PXC.ox / s; const cvx1 = (bw - PXC.ox) / s;
  for (let i = 0; i < shown; i += 1) {
    const sf = shafts[i]; const y = lvY(i); const o = oreAt(sf.oreId);
    const dig = Math.min(260, 20 * Math.log2(1 + sf.digLevel)); const lenR = 95 + dig * 0.9; const lenL = 62 + dig * 0.3;
    const xl = SX - lenL; const xr = SX + lenR;
    pR(xl, y - TH, xr - xl, TH, '#1d1228');
    for (let x = Math.max(xl, cvx0 - 4); x < Math.min(xr, cvx1 + 4); x += 4) { const j = Math.floor(h01(Math.floor(x / 4) + i * 131, 7) * 3); if (j) pR(x, y - TH - j, 4, j, '#1d1228'); if ((Math.floor(x / 9) + i) % 5 === 0) pR(x, y - TH + 5 + ((x * 7) % 9), 1, 1, '#2a1c38'); }
    pR(xl, y - 2, xr - xl, 2, '#3a2a3a'); pR(xl, y - TH, xr - xl, 1, '#140a1c');
    for (let x = xl + 8; x < xr - 6; x += 52) { if (Math.abs(x - SX) < 20) continue; pR(x - 1, y - TH + 1, 2, TH - 2, '#7a5230'); pR(x - 5, y - TH + 1, 10, 2, '#8a6238'); pR(x - 1, y - TH + 1, 1, TH - 2, '#9a7046'); }
    for (let x = xl + 14; x < xr - 10; x += 40) { if (Math.abs(x - SX) < 14) continue; lampGlow(x, y - TH + 6); }
    // rails
    for (let x = xl; x < xr; x += 6) pR(x, y - 1, 3, 1, '#6a5a6a');
    // ore face: the deposit this shaft is eating
    for (let k = 0; k < 4 + Math.min(6, Math.floor(sf.digLevel / 40)); k += 1) { const im = oreSprite(o.color, o.cat, 3 + (k % 3), 100 + k + i * 7); pS(im, xr - 4 + (k % 2) * 3, y - TH + 3 + (k * 7) % (TH - 6), im.width / 2, im.height / 2, false); }
    // chute pile: this shaft's buffer waiting for the lift
    const bufFrac = sf.bufferUnits / Math.max(1, sf.bufferCapacityUnits);
    if (sf.bufferUnits > 0.3) { pile(SX + 14, y - 2, sf.bufferUnits * 3, o.color, 4 + bufFrac * 14); if (bufFrac > 0.9) { g.globalAlpha = Math.floor(t * 4) % 2 ? 1 : 0.3; pR(SX + 24, y - 16, 3, 5, '#ff5a6e'); g.globalAlpha = 1; } }
    // miners
    const crew = Math.min(6, sf.workersAssigned);
    for (let m = 0; m < crew; m += 1) {
      const tier = Math.min(5, 1 + Math.floor(sf.digLevel / 120));
      if (m % 2 === 0) {
        const fx = xr - 12 - Math.floor(m / 2) * 13;
        const frame = [0, 1, 2, 1][Math.floor(simNow * 1.2 * 4 + m * 3 + i) % 4];
        pS(personSprite({ skin: skinFor(planet), head: 'dome', role: 'miner', pose: 'swing', frame, tier }), fx, y - 2, 10, 26, false);
        if (Math.floor(simNow * 2 + m + i) % 4 === 0) pR(fx + 8, y - 12, 2, 2, '#ffe9a0');
      } else {
        const span = lenR - 38; const ph = ((simNow * 0.07 * (1 + (m % 3) * 0.3) + m * 0.31 + i * 0.17) % 1);
        const dirRight = ph < 0.5; const k2 = dirRight ? ph * 2 : (1 - ph) * 2;
        const wx = SX + 22 + span * k2;
        pS(personSprite({ skin: skinFor(planet), head: 'dome', role: 'miner', pose: 'walk', frame: [0, 1, 0, 2][Math.floor(simNow * 4 + m) % 4], tier: 1, load: dirRight ? null : o.color }), wx, y - 2, 10, 26, !dirRight);
      }
    }
    // label
    if (s >= 0.4) labels.push({ x: bx(xl + 6), y: by(y - TH + 8), left: true, text: `${String(sf.shaftNumber).padStart(2, '0')} ${o.name.toUpperCase()}`, col: o.color });
  }
  if (shafts.length > shown) labels.push({ x: bx(SX), y: Math.min(bh - 8, by(lvY(shown) - 10)), text: `+${shafts.length - shown} SHAFTS BELOW`, col: '#b3a5d3' });
  // cage
  const cp = (simNow * 0.12) % 1; const ck = cp < 0.5 ? ease(cp * 2) : ease((1 - cp) * 2); const cageY = ck * (deepest - 22);
  pR(SX - 14, cageY - 4, 28, 18, '#ffd23f'); pR(SX - 14, cageY - 4, 28, 2, '#fff0a0'); pR(SX - 9, cageY, 18, 7, '#130d1f'); pR(SX - 14, cageY + 12, 28, 2, '#b8860b');
  const topOre = shafts.find((sh2) => sh2.bufferUnits > 0.5); if (topOre && ck > 0.5) pR(SX - 7, cageY + 1, 14, 5, oreAt(topOre.oreId).color);

  // hab dome
  for (let dy = 0; dy < 38; dy += 2) { const hw = Math.sqrt(38 * 38 - dy * dy); pR(HAB_X - hw, -dy - 2, hw * 2, 2, dy > 34 ? '#cfe7ff' : 'rgba(170,215,255,0.32)'); }
  for (let i = 0; i < 5; i += 1) pR(HAB_X - 28 + i * 12, -16, 6, 6, Math.sin(t * 0.7 + i * 2) > -0.3 ? '#ffe08a' : '#4a3d5a');
  pR(HAB_X - 8, -12, 10, 12, '#2a2238');
  labels.push({ x: bx(HAB_X), y: by(10), text: `HAB · ${state.workersHired} CREW`, col: '#b3a5d3' });
  labels.push({ x: bx(SX), y: by(-86), text: `LIFT LV ${state.production.lift.level}`, col: '#ffd23f' });

  // ore yard
  pR(YARD_X0 - 6, -6, 1, 6, '#6b5a4a'); for (let x = YARD_X0 - 6; x <= YARD_X0 + 214; x += 8) pR(x, -8, 1, 8, '#6b5a4a'); pR(YARD_X0 - 6, -6, 220, 1, '#6b5a4a');
  const bins = state.production.surface.unitsByOre; let total = 0;
  planet.ores.forEach((o, idx) => {
    const row = bins.find((r) => oreIndex(r.oreId) === idx); const units = row ? row.units : 0; total += units;
    if (units < 0.5) return;
    const x = YARD_X0 + 14 + idx * 29; const h = drawPile(x, units * 4, o.color, 40);
    if (s >= 0.5) labels.push({ x: bx(x), y: by(-h - 8), text: `${o.name} ${Math.floor(units)}`, col: o.color });
  });
  labels.push({ x: bx(YARD_X0 + 104), y: by(10), text: `ORE YARD ${Math.floor(total)}/${state.production.surface.capacityUnits}`, col: total > state.production.surface.capacityUnits * 0.9 ? '#ff5a6e' : '#f4edff' });

  // launch pad, crane and hauler
  pR(PAD_X - 52, -4, 104, 4, '#2b2238'); pR(PAD_X - 52, -4, 104, 1, '#4b4258');
  const blink = Math.floor(t * 3) % 2; pR(PAD_X - 52, -6, 3, 2, blink ? '#ff5a6e' : '#5a1a2a'); pR(PAD_X + 49, -6, 3, 2, blink ? '#5ee6a8' : '#1a4a2a');
  pR(PAD_X - 40, -58, 4, 58, '#c8a020'); for (let q = 0; q < 58; q += 6) pR(PAD_X - 40, -q - 3, 4, 1, '#8a6a10');
  const sw = Math.sin(t * 0.8) * 0.5; const ex = PAD_X - 38 + Math.cos(sw) * 30; pL(PAD_X - 38, -58, ex, -58 + Math.sin(sw) * 4, '#c8a020', Math.max(1, s * 2));
  const model = Math.min(4, Math.floor(state.upgrades.shipCapacity / 25));
  const last = state.shipments[state.shipments.length - 1]; const away = state.ship.readyAtSecond > state.simSeconds && last;
  let shipX = PAD_X; let shipY = -4; let flame = false; let visible = true;
  if (away) {
    const el = simNow - last.departureAtSecond; const trip = Math.max(6, last.tripSeconds);
    if (el < 3) { const k = ease(Math.max(0, el / 3)); shipX = PAD_X + k * 110; shipY = -4 - k * 360; flame = true; }
    else if (el > trip - 3) { const k = 1 - ease(clamp((el - (trip - 3)) / 3, 0, 1)); shipX = PAD_X + k * 110; shipY = -4 - k * 360; flame = true; }
    else visible = false;
    if (!visible) labels.push({ x: bx(PAD_X), y: by(-30), text: `PAID CARGO IN TRANSIT`, col: '#7ad1ff' });
  }
  if (visible) {
    drawShipPx(model, 'cargo', shipX, shipY, flame, t);
    if (!away) {
      const cargoOre = state.ship.cargoOreId ? planet.ores[Math.max(0, oreIndex(state.ship.cargoOreId))] : null;
      const f = clamp(state.ship.cargoUnits / state.ship.capacityUnits, 0, 1);
      pR(PAD_X - 22, -64, 44, 3, '#1a1022'); pR(PAD_X - 22, -64, 44 * f, 3, cargoOre ? cargoOre.color : '#ffd23f');
      if (cargoOre) drawCrateStack(PAD_X - 60, state.ship.cargoUnits, cargoOre.color, false, 6);
    }
  }
  labels.push({ x: bx(PAD_X), y: by(10), text: away ? 'PAD · HAULER AWAY' : 'LAUNCH PAD 01', col: '#ffb347' });

  // present
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0b0714'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(fg, 0, 0, bw * ps, bh * ps);
  const dpr = window.devicePixelRatio || 1; const fs = Math.round(11 * dpr);
  ctx.font = `600 ${fs}px 'Pixelify Sans','Silkscreen',monospace`; ctx.textBaseline = 'middle';
  for (const l of labels) {
    const X = Math.round(l.x * ps); const Y = Math.round(l.y * ps); const w = ctx.measureText(l.text).width;
    ctx.textAlign = l.left ? 'left' : 'center';
    const bx0 = l.left ? X - 4 * dpr : X - w / 2 - 4 * dpr;
    ctx.fillStyle = 'rgba(12,7,20,0.78)'; ctx.fillRect(Math.round(bx0), Math.round(Y - fs * 0.62), Math.round(w + 8 * dpr), Math.round(fs * 1.24));
    ctx.fillStyle = l.col || '#f4edff'; ctx.fillText(l.text, X, Y);
  }
  ctx.textAlign = 'left';
}

const bgCache = { stars: [], craters: [] };
export { shipSprite, crateSprite };
