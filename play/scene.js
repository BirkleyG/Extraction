/* Pixel cutaway renderer for the play sandbox. Uses the original game's sprite factory and drawing helpers (sprites.js),
 * the same layered-sky / moons / strata / tunnel / ore-pile look, and swaps in a per-region topography. */
import {
  PXC, hash, rng, clamp, lerp, ease, bx, by, pR, pB, pL, pD, pS, mkCv, hexMix, sh,
  personSprite, oreSprite, crateSprite, drawShipPx, drawPile, drawCrateStack, shipSprite,
} from './sprites.js';
import { SPEC, ridgeLayer, drawDecor, drawOverlay, waterColor } from './terrains.js';
import { tierOf } from './upgrades.js';
import { MAPW, TERRAINS } from './planet.js';

const SX = 290; // lift shaft x
const WW = 1060; // world width framed at default zoom
const TH = 30; // tunnel height
const LV0 = 46; // first tunnel floor
const LVH = 44; // vertical spacing between shaft levels
const HAB_X = 70;
const YARD_X0 = 560;
const PAD_X = 900;
const lvY = (i) => LV0 + i * LVH;
const LAYER_H = LVH * 6;
const ROCK = { x0: -800, w: 2700, h: 5 * LAYER_H + 30 };

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

let CAMX = 0;
function drawSkyline(planet, region, hy, s, sd, craters) {
  const T = region.terrain; const g = PXC.g; const spec = SPEC[T];
  const flat = T === 'volcanic' || (spec && spec.over);
  for (const L of [0, 1]) {
    const Ly = spec ? (L ? spec.near : spec.far) : null;
    if (Ly && Ly.k === 'none') continue;
    let base = sh(region.biome, L ? -0.3 : -0.5);
    if (spec && spec.tint) base = hexMix(base, spec.tint, L ? 0.75 : 0.6);
    base = hexMix(base, planet.sky[1], L ? 0.08 : 0.2);
    const stripe = Math.max(2, Math.round(6 * s));
    for (let col = 0; col < PXC.bw; col += 2) {
      const wx0 = (col - PXC.ox) / PXC.s; const wx = flat ? wx0 : CAMX + (wx0 - CAMX) * (L ? 0.85 : 0.65);
      const r = Ly ? ridgeLayer(Ly, wx, sd, planet) : ridge(T, wx, L, sd, planet);
      const h = Math.max(1, Math.round(r.h * s)); const top = hy - h; const segH = Math.max(1, h - Math.round((r.lo || 0) * s));
      let c = base;
      if (r.c) c = hexMix(sh(r.c, L ? -0.25 : -0.4), planet.sky[1], L ? 0.05 : 0.15);
      else if (r.trunk) c = hexMix('#3a2818', base, 0.4);
      else if (r.ball) c = '#f0eee4';
      else if (r.cap && spec) c = sh(base, 0.12);
      else if (T === 'fungal' && r.cap) c = hexMix(sh(region.biome, 0.2), '#ff9fd0', L ? 0.25 : 0.35);
      pB(col, top, 2, segH, c);
      if (r.crown) pB(col, top, 2, Math.min(h, Math.max(3, Math.round(9 * s))), hexMix('#3a6a34', planet.sky[1], L ? 0.05 : 0.18));
      if (spec) {
        if (spec.stripes) for (let y = top; y < top + segH; y += stripe) { if (((y - top) / stripe) % 2 === 0) pB(col, y, 2, 1, sh(c, 0.1)); }
        if (spec.windows && h > 8) for (let y = top + 2; y < hy - 2; y += Math.max(3, Math.round(4 * s))) { if (h01w(col * 13 + y, sd) < 0.2) pB(col, y, 1, 1, hexMix(planet.ores[(sd >> 2) % 7].color, '#ffffff', 0.5)); }
        if (spec.holes && h > 8) for (let y = top + 3; y < hy - 2; y += Math.max(4, Math.round(5 * s))) { if ((col >> 1) % 3 === 0) pB(col, y, 1, 1, sh(c, -0.4)); }
        if (r.snow) pB(col, top, 2, Math.min(Math.max(2, Math.round(5 * s)), h), L ? '#ffffff' : '#cfe6f6');
        else if (spec.glint && r.cap) pB(col, top, 2, 1, '#ffffff');
        else if (r.cap || r.trunk === undefined) { /* plain */ }
      } else if (T === 'mesa' || T === 'canyon') {
        for (let y = top; y < hy; y += stripe) { if (((y - top) / stripe) % 2 === 0) pB(col, y, 2, 1, sh(c, T === 'canyon' ? 0.12 : 0.08)); }
      }
      if (!spec) {
        if (T === 'glacier') { const cap = Math.max(2, Math.round(5 * s)); pB(col, top, 2, Math.min(cap, h), L ? '#ffffff' : '#cfe6f6'); }
        else if (T === 'dunes' || T === 'crystal') pB(col, top, 2, 1, sh(c, 0.3));
        else if (T === 'volcanic' && !L && r.h > 60) pB(col, top, 2, 1, '#ff6a2a');
      }
    }
    if (L === 0 && spec && spec.water) {
      const wc = waterColor(planet); const d = Math.max(2, Math.round(spec.water.d * s));
      for (let col = 0; col < PXC.bw; col += 2) {
        const wx = (col - PXC.ox) / PXC.s; if (spec.water.from != null && wx < spec.water.from) continue;
        pB(col, hy - d, 2, d, wc); pB(col, hy - d, 2, 1, sh(wc, 0.3)); if ((col >> 1) % 5 === 0) pB(col + 1, hy - d + 2 + ((col >> 1) % 3), 1, 1, sh(wc, 0.4));
      }
    }
  }
  if (T === 'volcanic') for (let k = 0; k < 3; k += 1) { const c = 70 + k * 270 + (sd % 70); craters.push({ x: c, y: -74 }); }
  g.globalAlpha = 1;
}
const h01w = (i, sd) => { let h = Math.imul((i | 0) ^ (sd | 0), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967295; };

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
  const T = region.terrain; const spec = SPEC[T];
  for (let x = -30; x < WW + 40; x += 6 + Math.floor(R0() * 14)) {
    const roll = R0();
    if (spec) { drawDecor(spec, x, gc, R0, planet, region); continue; }
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
  else if (fx === 'rain') { g.fillStyle = 'rgba(170,210,255,0.55)'; for (let i = 0; i < 90; i += 1) { const x = ((i * 53 + t * 40) % (bw + 20)) - 10; const y = ((i * 37 + t * 230) % Math.max(1, hy + 30)); g.fillRect(Math.round(x), Math.round(y), 1, 3); } }
  else if (fx === 'leaves') { for (let i = 0; i < 26; i += 1) { const x = ((i * 67 + Math.sin(t + i) * 10 + t * 18) % (bw + 20)) - 10; const y = (i * 41 + t * 20) % Math.max(1, hy + 30); g.fillStyle = ['#c8602a', '#d8902a', '#a8402a'][i % 3]; g.fillRect(Math.round(x), Math.round(y), 2, 1); } }
  else if (fx === 'fireflies') { for (let i = 0; i < 22; i += 1) { const x = (i * 83 + Math.sin(t * 0.7 + i) * 12 + bw) % bw; const y = hy - 4 - ((i * 29) % Math.max(6, Math.round(hy * 0.22))) + Math.sin(t + i * 2) * 3; if (Math.sin(t * 2 + i * 1.3) > 0) { g.fillStyle = 'rgba(255,240,120,0.9)'; g.fillRect(Math.round(x), Math.round(y), 1, 1); } } }
  else if (fx === 'mist') { g.fillStyle = 'rgba(255,255,255,0.09)'; for (let i = 0; i < 4; i += 1) { const y = Math.round(hy * (0.66 + i * 0.1) + Math.sin(t * 0.6 + i) * 2); g.fillRect(0, y, bw, Math.max(2, Math.round(hy * 0.05))); } }
  else if (fx === 'steam') { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 3; i += 1) { const y = Math.round(hy * (0.78 + i * 0.07) + Math.sin(t * 0.9 + i) * 2); g.fillRect(0, y, bw, Math.max(2, Math.round(hy * 0.04))); } }
  else if (fx === 'sparks') { for (let i = 0; i < 18; i += 1) { const x = (i * 97 + Math.sin(t + i) * 6 + bw) % bw; const y = hy - ((i * 31 + t * 30) % Math.max(10, hy * 0.5)); g.fillStyle = i % 2 ? '#ffd23f' : '#ff8a3d'; g.fillRect(Math.round(x), Math.round(y), 1, 1); } }
  else if (fx === 'glitch') { for (let i = 0; i < 3; i += 1) { if (Math.sin(t * 7 + i * 3) > 0.85) { g.fillStyle = i % 2 ? 'rgba(122,209,255,0.25)' : 'rgba(255,94,196,0.25)'; g.fillRect(0, Math.round(((t * 37 + i * 53) % hy)), bw, 1); } } }
  else if (fx === 'motes') { for (let i = 0; i < 34; i += 1) { const x = (i * 71 + Math.sin(t * 0.5 + i) * 10 + bw) % bw; const y = (i * 43 + Math.cos(t * 0.4 + i) * 8 + hy) % Math.max(1, hy + 20); g.fillStyle = i % 2 ? 'rgba(180,220,255,0.7)' : 'rgba(255,200,255,0.65)'; g.fillRect(Math.round(x), Math.round(y), 1, 1); } }
  else if (fx === 'haze') { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < 6; i += 1) { const y = Math.round(hy * (0.82 + i * 0.03) + Math.sin(t * 2 + i) * 1.5); g.fillRect(0, y, bw, 1); } }
}


/* ---------- main draw ---------- */
const skinFor = (planet) => hexMix('#f2c9a5', planet.ores[0].color, 0.12);
export const VIEW = { s: 1, ox: 0, oy: 0, ps: 2, bw: 0, bh: 0 };
const bgCache = { stars: [], craters: [] };
const POPS = [];
const LIFT_COL = ['#8a6a3a', '#9aa7b8', '#c8793a', '#ffb347', '#7ad1ff', '#ff5ec4'];

/* floating "+" text and a spray of pixels, used to make purchases feel good */
export function addFx(wx, wy, text, col) {
  const born = performance.now() / 1000; const R0 = rng(Math.floor(born * 1000));
  POPS.push({ wx, wy, text, col: col || '#ffd23f', born, bits: Array.from({ length: 14 }, () => ({ a: R0() * 6.283, v: 20 + R0() * 40, c: R0() < 0.5 ? col || '#ffd23f' : '#ffffff' })) });
}
export const FX_SPOTS = { lift: [SX, -70], dig: [SX + 150, LV0 - 14], yard: [YARD_X0 + 100, -30], shipSpeed: [PAD_X, -50], shipCapacity: [PAD_X, -50], loading: [PAD_X - 40, -60], habitat: [HAB_X, -44], bunkhouse: [SX + 40, LV0 - 20], cart: [SX + 60, LV0 - 20], shaft: [SX, 20] };

export function clampCam(cam, state) {
  cam.z = clamp(cam.z, 0.4, 8);
  cam.x = clamp(cam.x, -300, WW + 300);
  cam.y = clamp(cam.y, -260, lvY(Math.min(30, state.production.shafts.length)) + 160);
}

function pile(x, y, amt, col, maxH) {
  const h = Math.max(2, Math.min(maxH || 24, 3 + Math.sqrt(amt) * 1.3)); const w = 7 + Math.min(8, h * 0.35);
  for (let q = 0; q < h; q += 1) { const ww = w * (1 - q / h) + 1; pR(x - ww, y - q - 1, ww * 2, 1, q % 4 === 0 ? sh(col, -0.25) : (q % 4 === 2 ? sh(col, 0.12) : col)); }
}
function lampGlow(x, y) { const g = PXC.g; g.globalAlpha = 0.2; pD(x, y, 5, '#ffd23f'); g.globalAlpha = 1; pR(x - 1, y - 1, 2, 2, '#ffe9a0'); }

/* the lift looks different at every tier */
function drawCage(tier, x, y, t, loadCol) {
  const col = LIFT_COL[tier]; const g = PXC.g;
  if (tier === 0) { pR(x - 9, y, 18, 3, '#8a6a3a'); pR(x - 9, y - 6, 2, 6, '#5a3a20'); pR(x + 7, y - 6, 2, 6, '#5a3a20'); pR(x - 9, y + 3, 18, 1, '#5a3a20'); pL(x - 8, y - 6, x, y - 14, '#c9a36b', 1); pL(x + 8, y - 6, x, y - 14, '#c9a36b', 1); }
  else if (tier === 1) { pR(x - 10, y - 12, 20, 14, '#2a2238'); pR(x - 10, y - 12, 20, 2, col); pR(x - 10, y, 20, 2, col); for (let k = 0; k < 4; k += 1) pR(x - 8 + k * 5, y - 10, 1, 10, col); pR(x - 1, y - 18, 2, 6, '#8a8a8a'); }
  else if (tier === 2) { pR(x - 11, y - 14, 22, 16, col); pR(x - 11, y - 14, 22, 2, sh(col, 0.3)); pR(x - 8, y - 10, 16, 8, '#2a1a10'); pR(x + 5, y - 22, 4, 8, '#5a5a5a'); for (let q = 0; q < 3; q += 1) { const ph = (t * 0.8 + q / 3) % 1; g.globalAlpha = (1 - ph) * 0.6; pD((x + 7 + ph * 3) * PXC.s + PXC.ox, (y - 24 - ph * 14) * PXC.s + PXC.oy, (2 + ph * 3) * PXC.s + 1, '#d8d8d8', g, true); } g.globalAlpha = 1; }
  else if (tier === 3) { pR(x - 12, y - 14, 24, 16, col); pR(x - 12, y - 14, 24, 2, '#fff0a0'); pR(x - 9, y - 10, 18, 8, '#130d1f'); pR(x - 12, y, 24, 2, '#b8860b'); if (Math.floor(t * 4) % 2) pR(x - 11, y - 13, 2, 2, '#ff5a6e'); pR(x + 9, y - 13, 2, 2, '#5ee6a8'); }
  else if (tier === 4) { pR(x - 12, y - 12, 24, 12, '#1a2a3a'); pR(x - 12, y - 12, 24, 2, col); pR(x - 12, y - 2, 24, 2, col); g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 6); pR(x - 14, y - 14, 28, 18, col); g.globalAlpha = 1; for (let k = 0; k < 3; k += 1) pR(x - 8 + k * 7, y - 9, 4, 5, '#a8f0ff'); }
  else { g.globalAlpha = 0.3 + 0.2 * Math.sin(t * 4); pD(x * PXC.s + PXC.ox, (y - 8) * PXC.s + PXC.oy, 16 * PXC.s + 2, col, g, true); g.globalAlpha = 1; pD(x * PXC.s + PXC.ox, (y - 8) * PXC.s + PXC.oy, 9 * PXC.s + 1, '#2a1030', g, true); pD(x * PXC.s + PXC.ox, (y - 8) * PXC.s + PXC.oy, 5 * PXC.s + 1, col, g, true); pR(x - 14, y - 8, 28, 1, '#ffffff'); }
  if (loadCol) pR(x - 6, y - 4, 12, 3, loadCol);
}

function drawHeadframe(tier, t, alarm) {
  const col = LIFT_COL[tier]; const w = 22 + tier * 2; const top = -58 - tier * 4;
  pL(SX - w, 0, SX, top, tier ? sh(col, -0.35) : '#6a4a2a', Math.max(1, PXC.s * 2.5)); pL(SX + w, 0, SX, top, tier ? sh(col, -0.35) : '#6a4a2a', Math.max(1, PXC.s * 2.5));
  pR(SX - w + 10, -30, (w - 10) * 2, 2, tier ? sh(col, -0.2) : '#6a4a2a'); pR(SX - w * 0.55, -16, w * 1.1, 2, tier ? sh(col, -0.2) : '#6a4a2a');
  pD(SX, top, 9 + tier, col); pD(SX, top, 7 + tier, '#2a2238'); const ang = t * (3 + tier * 1.5);
  for (let k = 0; k < 4; k += 1) { const a = ang + k * Math.PI / 2; pL(SX, top, SX + Math.cos(a) * (7 + tier), top + Math.sin(a) * (7 + tier), col, 1); }
  if (tier >= 3) { pR(SX - w - 6, -4, 10, 4, '#2a2238'); pR(SX - w - 5, -3, 8, 2, col); }
  if (tier >= 4) { const g = PXC.g; g.globalAlpha = 0.18 + 0.1 * Math.sin(t * 3); pD(SX * PXC.s + PXC.ox, top * PXC.s + PXC.oy, 22 * PXC.s, col, g, true); g.globalAlpha = 1; }
  if (alarm && Math.floor(t * 6) % 2) { pD(SX, top - 14, 3, '#ff3d3d'); PXC.g.globalAlpha = 0.25; pD(SX, top - 14, 14, '#ff3d3d'); PXC.g.globalAlpha = 1; } else pD(SX, top - 14, 3, '#5a1010');
  return top;
}

export function renderScene(canvas, ctx, data) {
  const { state, planet, region, t, frac, oreIndex, cam } = data;
  const ps = ensureBuffers(canvas.width, canvas.height);
  const bw = PXC.bw; const bh = PXC.bh;
  const base = bw / WW;
  const s = Math.max(0.0625, Math.min(10, Math.round(clamp(base * cam.z, 0.0625, 10) * 16) / 16));
  if (cam.auto) { cam.x = 485; cam.y = (0.5 - 0.3) * bh / s; }
  clampCam(cam, state);
  PXC.s = s; PXC.ox = Math.round(bw / 2 - cam.x * s); PXC.oy = Math.round(bh / 2 - cam.y * s);
  Object.assign(VIEW, { s, ox: PXC.ox, oy: PXC.oy, ps, bw, bh });
  const hy = PXC.oy; CAMX = cam.x;
  const key = `${planet.id}|${region.id}|${bw}|${bh}|${s}|${PXC.ox}|${PXC.oy}`;
  const sd = hash(region.id + planet.id);
  const craters = [];
  if (key !== bgKey) {
    bgKey = key; PXC.g = bgG; bgG.clearRect(0, 0, bw, bh);
    bgG.fillStyle = '#0b0714'; bgG.fillRect(0, 0, bw, bh);
    if (hy > 0) {
      const stars = drawSky(planet, hy);
      bgCache.stars = stars.filter((st) => st.b && st.y < hy * 0.3);
      drawSkyline(planet, region, hy, s, sd, craters); bgCache.craters = craters;
    } else { bgCache.stars = []; bgCache.craters = []; }
    blitRock(planet);
    drawSurfaceStrip(planet, region, sd);
  }
  const g = fgG; PXC.g = g; PXC.labels = labels = [];
  g.globalAlpha = 1; g.drawImage(bg, 0, 0);
  for (const st of bgCache.stars) { const on = Math.sin(t * 2 + st.x) > 0.5; if (on) pB(st.x, st.y, 2, 2, planet.stars); }
  if (hy > 0) drawWeather(region.fx, hy, t);
  const simNow = state.simSeconds + (frac || 0);
  { const sp = SPEC[region.terrain]; if (sp && sp.over) drawOverlay(sp.over, { t, sd, planet, spec: sp, wx0: -PXC.ox / s, wx1: (bw - PXC.ox) / s, g }); }
  for (const c of bgCache.craters) { const glow = 0.5 + 0.5 * Math.sin(t * 3 + c.x); g.globalAlpha = 0.25 * glow; pD(bx(c.x), by(c.y), 7 * s + 3, '#ff6a2a', g, true); g.globalAlpha = 1; pR(c.x - 5, c.y - 1, 10, 2, glow > 0.5 ? '#ffb347' : '#ff6a2a'); for (let q = 0; q < 5; q += 1) { const ph = (t * 0.25 + q / 5) % 1; g.globalAlpha = (1 - ph) * 0.45; pD(bx(c.x + Math.sin(ph * 5 + q) * 6), by(c.y - ph * 90), (3 + ph * 9) * s + 1, '#6a5a60', g, true); } g.globalAlpha = 1; }
  if (region.terrain === 'volcanic') for (let i = 0; i < 12; i += 1) { const x = 30 + i * 80 + (sd % 20); if (Math.sin(t * 2 + i * 1.7) > 0.2) pR(x, -1, 9, 1, '#ffb347'); }
  if (region.terrain === 'fungal') for (let i = 0; i < 16; i += 1) { const x = 20 + i * 58 + (sd % 17); if (Math.sin(t * 1.5 + i) > -0.2) { g.globalAlpha = 0.3; pD(bx(x), by(-8), 5 * s + 1, '#b0ffd8', g, true); g.globalAlpha = 1; } }
  if (region.terrain === 'saltflat') { g.fillStyle = 'rgba(255,255,255,0.14)'; for (let i = 0; i < 4; i += 1) g.fillRect(0, Math.round(hy - (3 + i * 2) * s + Math.sin(t * 3 + i) * 1.2), bw, 1); }

  const shafts = state.production.shafts;
  const vy1 = (bh - PXC.oy) / s + LVH; const vy0 = -PXC.oy / s - LVH * 2;
  const liftTier = tierOf('lift', state.production.lift.level).i;
  const cvx0 = -PXC.ox / s; const cvx1 = (bw - PXC.ox) / s;
  const bottom = lvY(shafts.length - 1);

  // the vertical shaft: a hollow dug into the rock, with rails, ladder, beams and lamps
  const shaftW = 15;
  const shaftTop = -2;
  pR(SX - shaftW, shaftTop, shaftW * 2, bottom + 6 - shaftTop, '#1d1228');
  for (let y = 0; y < bottom + 6; y += 4) { if (y < vy0 || y > vy1) continue; const jl = Math.floor(h01(y + 11, 3) * 3); const jr = Math.floor(h01(y + 47, 3) * 3); if (jl) pR(SX - shaftW - jl, y, jl, 4, '#1d1228'); if (jr) pR(SX + shaftW, y, jr, 4, '#1d1228'); }
  pR(SX - shaftW, shaftTop, 2, bottom + 6 - shaftTop, '#140a1c'); pR(SX + shaftW - 2, shaftTop, 2, bottom + 6 - shaftTop, '#140a1c');
  pR(SX - 9, 0, 1, bottom + 4, '#6a5a6a'); pR(SX + 8, 0, 1, bottom + 4, '#6a5a6a');
  for (let y = 6; y < bottom; y += 6) { if (y < vy0 || y > vy1) continue; pR(SX - 13, y, 3, 1, '#7a5230'); }
  for (let y = 40; y < bottom; y += 46) { if (y < vy0 || y > vy1) continue; pR(SX - shaftW, y, shaftW * 2, 2, '#7a5230'); pR(SX - shaftW, y, shaftW * 2, 1, '#9a7046'); pR(SX - 2, y + 2, 4, 3, '#5a3a20'); }
  const top = drawHeadframe(liftTier, t, state.production.surface.capacityUnits > 0 && state.production.surface.unitsByOre.reduce((a, r) => a + r.units, 0) / state.production.surface.capacityUnits > 0.9);
  const oreAt = (oreId) => planet.ores[Math.max(0, oreIndex(oreId))];

  // tunnels
  let shownCount = 0;
  for (let i = 0; i < shafts.length; i += 1) {
    const y = lvY(i); if (y - TH > vy1 || y < vy0) continue; shownCount += 1;
    const sf = shafts[i]; const o = oreAt(sf.oreId); const digTier = tierOf('dig', sf.digLevel).i;
    const dig = Math.min(320, 24 * Math.log2(1 + sf.digLevel)); const lenR = 200 + dig; const lenL = 120 + dig * 0.4;
    const xl = SX - lenL; const xr = SX + lenR;
    pR(xl, y - TH, xr - xl, TH, '#1d1228');
    for (let x = Math.max(xl, cvx0 - 4); x < Math.min(xr, cvx1 + 4); x += 4) { const j = Math.floor(h01(Math.floor(x / 4) + i * 131, 7) * 3); if (j) pR(x, y - TH - j, 4, j, '#1d1228'); if ((Math.floor(x / 9) + i) % 5 === 0) pR(x, y - TH + 5 + ((x * 7) % 9), 1, 1, '#2a1c38'); }
    pR(xl, y - 2, xr - xl, 2, '#3a2a3a'); pR(xl, y - TH, xr - xl, 1, '#140a1c');
    for (const sd2 of [-1, 1]) { const fx = sd2 > 0 ? xr : xl; for (let k = 0; k < 5; k += 1) pR(fx - (sd2 > 0 ? 0 : 2) + (k % 2 ? sd2 : 0), y - TH + k * 6, 2, 5, '#1d1228'); }
    // timber at the shaft mouth so it reads as a doorway into the tunnel
    for (const sd2 of [-1, 1]) { const dx = SX + sd2 * (shaftW + 3); pR(dx - 1, y - TH + 1, 3, TH - 1, '#7a5230'); pR(dx - 1, y - TH + 1, 1, TH - 1, '#9a7046'); }
    pR(SX - shaftW - 4, y - TH, shaftW * 2 + 8, 3, '#8a6238');
    for (let x = xl + 10; x < xr - 6; x += 56) { if (Math.abs(x - SX) < shaftW + 10) continue; pR(x - 1, y - TH + 1, 2, TH - 2, '#7a5230'); pR(x - 5, y - TH + 1, 10, 2, '#8a6238'); pR(x - 1, y - TH + 1, 1, TH - 2, '#9a7046'); }
    for (let x = xl + 18; x < xr - 10; x += 44) { if (Math.abs(x - SX) < shaftW + 8) continue; lampGlow(x, y - TH + 7); }
    for (let x = xl; x < xr; x += 6) pR(x, y - 1, 3, 1, '#6a5a6a');
    lampGlow(SX - shaftW + 3, y - TH + 7); lampGlow(SX + shaftW - 3, y - TH + 7);
    const faceN = 4 + Math.min(6, Math.floor(sf.digLevel / 40));
    for (let k = 0; k < faceN; k += 1) { const im = oreSprite(o.color, o.cat, 3 + (k % 3), 100 + k + i * 7); pS(im, xr - 4 + (k % 2) * 3, y - TH + 3 + (k * 7) % (TH - 6), im.width / 2, im.height / 2, false); }
    // ore the miners already knocked loose along the tunnel floor
    for (let k = 0; k < 5; k += 1) { const x = xr - 30 - k * 17; if (x > SX + shaftW + 10) { pR(x, y - 4, 3, 2, sh(o.color, -0.2)); pR(x + 1, y - 5, 2, 1, o.color); } }
    const bufFrac = sf.bufferUnits / Math.max(1, sf.bufferCapacityUnits);
    if (sf.bufferUnits > 0.3) { pile(SX + shaftW + 12, y - 2, sf.bufferUnits * 3, o.color, 4 + bufFrac * 14); if (bufFrac > 0.9) { g.globalAlpha = Math.floor(t * 4) % 2 ? 1 : 0.3; pR(SX + shaftW + 24, y - 18, 3, 5, '#ff5a6e'); g.globalAlpha = 1; } }
    const crew = Math.min(6, sf.workersAssigned);
    for (let m = 0; m < crew; m += 1) {
      const tier = Math.min(5, 1 + digTier);
      if (m % 2 === 0) {
        const fx = xr - 14 - Math.floor(m / 2) * 16;
        const frame = [0, 1, 2, 1][Math.floor(simNow * 1.2 * 4 + m * 3 + i) % 4];
        pS(personSprite({ skin: skinFor(planet), head: 'dome', role: 'miner', pose: 'swing', frame, tier }), fx, y - 2, 10, 26, false);
        if (Math.floor(simNow * 2 + m + i) % 4 === 0) pR(fx + 8, y - 12, 2, 2, '#ffe9a0');
      } else {
        const span = lenR - shaftW - 50; const ph = ((simNow * 0.07 * (1 + (m % 3) * 0.3) + m * 0.31 + i * 0.17) % 1);
        const dirRight = ph < 0.5; const k2 = dirRight ? ph * 2 : (1 - ph) * 2;
        pS(personSprite({ skin: skinFor(planet), head: 'dome', role: 'miner', pose: 'walk', frame: [0, 1, 0, 2][Math.floor(simNow * 4 + m) % 4], tier: 1, load: dirRight ? null : o.color }), SX + shaftW + 24 + span * k2, y - 2, 10, 26, !dirRight);
      }
    }
    if (s >= 0.3) labels.push({ x: bx(xl + 8), y: by(y - TH + 9), left: true, text: `${String(sf.shaftNumber).padStart(2, '0')} ${o.name.toUpperCase()}`, col: o.color });
  }
  // rope and cage ride inside the shaft
  const cp = (simNow * (0.08 + liftTier * 0.02)) % 1; const ck = cp < 0.5 ? ease(cp * 2) : ease((1 - cp) * 2); const cageY = 8 + ck * Math.max(0, bottom - 24);
  pL(SX, top, SX, cageY - (liftTier === 0 ? 14 : liftTier === 1 ? 18 : 4), '#8d8b70', Math.max(1, s * 1.5));
  const topOre = shafts.find((q) => q.bufferUnits > 0.5);
  drawCage(liftTier, SX, cageY, t, topOre && ck > 0.5 ? oreAt(topOre.oreId).color : null);
  if (shafts.length > shownCount && by(lvY(shownCount)) < bh) labels.push({ x: bx(SX), y: Math.min(bh - 8, by(bottom + 20)), text: `${shafts.length} SHAFTS`, col: '#b3a5d3' });

  // hab dome
  for (let dy = 0; dy < 38; dy += 2) { const hw = Math.sqrt(38 * 38 - dy * dy); pR(HAB_X - hw, -dy - 2, hw * 2, 2, dy > 34 ? '#cfe7ff' : 'rgba(170,215,255,0.32)'); }
  for (let i = 0; i < 5; i += 1) pR(HAB_X - 28 + i * 12, -16, 6, 6, Math.sin(t * 0.7 + i * 2) > -0.3 ? '#ffe08a' : '#4a3d5a');
  pR(HAB_X - 8, -12, 10, 12, '#2a2238');
  if (s >= 0.3) labels.push({ x: bx(HAB_X), y: by(12), text: `HAB · ${state.workersHired} CREW`, col: '#b3a5d3' });
  labels.push({ x: bx(SX), y: by(top - 28), text: `${tierOf('lift', state.production.lift.level).name.toUpperCase()} · LV ${state.production.lift.level}`, col: '#ffd23f' });

  // ore yard
  const yardW = 250;
  pR(YARD_X0 - 6, -6, 1, 6, '#6b5a4a'); for (let x = YARD_X0 - 6; x <= YARD_X0 + yardW; x += 8) pR(x, -8, 1, 8, '#6b5a4a'); pR(YARD_X0 - 6, -6, yardW + 6, 1, '#6b5a4a');
  const bins = state.production.surface.unitsByOre; let total = 0;
  planet.ores.forEach((o, idx) => {
    const row = bins.find((r) => oreIndex(r.oreId) === idx); const units = row ? row.units : 0; total += units;
    if (units < 0.5) return;
    const x = YARD_X0 + 18 + idx * 33; const h = drawPile(x, units * 4, o.color, 40);
    if (s >= 0.5) labels.push({ x: bx(x), y: by(-h - 8), text: `${o.name} ${Math.floor(units)}`, col: o.color });
  });
  if (s >= 0.3) labels.push({ x: bx(YARD_X0 + yardW / 2), y: by(12), text: `${tierOf('yard', state.upgrades.yard).name.toUpperCase()} ${Math.floor(total)}/${state.production.surface.capacityUnits}`, col: total > state.production.surface.capacityUnits * 0.9 ? '#ff5a6e' : '#f4edff' });

  // launch pad, crane and hauler
  pR(PAD_X - 52, -4, 104, 4, '#2b2238'); pR(PAD_X - 52, -4, 104, 1, '#4b4258');
  const blink = Math.floor(t * 3) % 2; pR(PAD_X - 52, -6, 3, 2, blink ? '#ff5a6e' : '#5a1a2a'); pR(PAD_X + 49, -6, 3, 2, blink ? '#5ee6a8' : '#1a4a2a');
  const craneT = tierOf('loading', state.upgrades.loading).i; const craneCol = ['#c8a020', '#9aa7b8', '#ff8a3d', '#7ad1ff'][craneT];
  pR(PAD_X - 40, -58, 4, 58, craneCol); for (let q = 0; q < 58; q += 6) pR(PAD_X - 40, -q - 3, 4, 1, sh(craneCol, -0.3));
  const sw = Math.sin(t * 0.8) * 0.5; const ex = PAD_X - 38 + Math.cos(sw) * 30; pL(PAD_X - 38, -58, ex, -58 + Math.sin(sw) * 4, craneCol, Math.max(1, s * 2));
  const model = Math.min(4, tierOf('shipSpeed', state.upgrades.shipSpeed).i + tierOf('shipCapacity', state.upgrades.shipCapacity).i);
  const last = state.shipments[state.shipments.length - 1]; const away = state.ship.readyAtSecond > state.simSeconds && last;
  let shipX = PAD_X; let shipY = -4; let flame = false; let visible = true;
  if (away) {
    const el = simNow - last.departureAtSecond; const trip = Math.max(6, last.tripSeconds);
    if (el < 3) { const k = ease(Math.max(0, el / 3)); shipX = PAD_X + k * 110; shipY = -4 - k * 360; flame = true; }
    else if (el > trip - 3) { const k = 1 - ease(clamp((el - (trip - 3)) / 3, 0, 1)); shipX = PAD_X + k * 110; shipY = -4 - k * 360; flame = true; }
    else visible = false;
    if (!visible) labels.push({ x: bx(PAD_X), y: by(-30), text: 'PAID CARGO IN TRANSIT', col: '#7ad1ff' });
  }
  if (visible) {
    drawShipPx(model, 'cargo', shipX, shipY, flame, t);
    if (!away) {
      const cargoOre = state.ship.cargoOreId ? planet.ores[Math.max(0, oreIndex(state.ship.cargoOreId))] : null;
      const f = clamp(state.ship.cargoUnits / state.ship.capacityUnits, 0, 1);
      pR(PAD_X - 22, -64, 44, 3, '#1a1022'); pR(PAD_X - 22, -64, 44 * f, 3, cargoOre ? cargoOre.color : '#ffd23f');
      if (cargoOre) drawCrateStack(PAD_X - 64, state.ship.cargoUnits, cargoOre.color, false, 6);
    }
  }
  if (s >= 0.3) labels.push({ x: bx(PAD_X), y: by(12), text: away ? 'PAD · HAULER AWAY' : 'LAUNCH PAD 01', col: '#ffb347' });

  // purchase fx
  const now = performance.now() / 1000;
  for (let i = POPS.length - 1; i >= 0; i -= 1) {
    const p = POPS[i]; const age = now - p.born; if (age > 1.6) { POPS.splice(i, 1); continue; }
    for (const b of p.bits) { const d = b.v * age; g.globalAlpha = Math.max(0, 1 - age / 1.2); pB(bx(p.wx + Math.cos(b.a) * d), by(p.wy + Math.sin(b.a) * d + 40 * age * age), 2, 2, b.c); }
    g.globalAlpha = 1;
    labels.push({ x: bx(p.wx), y: by(p.wy - age * 26), text: p.text, col: p.col, alpha: Math.max(0, 1 - age / 1.6), big: true });
  }

  // present
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0b0714'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(fg, 0, 0, bw * ps, bh * ps);
  drawLabels(ctx, labels, ps);
}

export function drawLabels(ctx, list, ps) {
  const dpr = window.devicePixelRatio || 1; const fs = Math.round(11 * dpr);
  ctx.textBaseline = 'middle';
  for (const l of list) {
    const size = l.big ? Math.round(15 * dpr) : fs; ctx.font = `${l.big ? 700 : 600} ${size}px 'Pixelify Sans','Silkscreen',monospace`;
    const X = Math.round(l.x * ps); const Y = Math.round(l.y * ps); const w = ctx.measureText(l.text).width;
    ctx.globalAlpha = l.alpha == null ? 1 : l.alpha; ctx.textAlign = l.left ? 'left' : 'center';
    if (!l.plain) { const bx0 = l.left ? X - 4 * dpr : X - w / 2 - 4 * dpr; ctx.fillStyle = 'rgba(12,7,20,0.78)'; ctx.fillRect(Math.round(bx0), Math.round(Y - size * 0.62), Math.round(w + 8 * dpr), Math.round(size * 1.24)); }
    else { ctx.fillStyle = '#140c1c'; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(l.text, X + dx * dpr * 1.5, Y + dy * dpr * 1.5); }
    ctx.fillStyle = l.col || '#f4edff'; ctx.fillText(l.text, X, Y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

/* ---------- top-down planet map ---------- */
const MAPC = { key: '', cv: null };
const ACCENT = { glacier: '#ffffff', tundra: '#ffffff', alpine: '#ffffff', taiga: '#ffffff', volcanic: '#ff6a2a', geysers: '#ffffff', islands: '#5aa8d8', lakes: '#5aa8d8', coast: '#5aa8d8', falls: '#5aa8d8', terraces: '#5aa8d8', fungal: '#ff9fd0', tendrils: '#ff7ac0', hive: '#ffcf4a', watchers: '#ffffff', rifts: '#b05cff', ruins: '#ffe08a', mirror: '#ffffff', saltflat: '#ffffff' };
function buildMapTerrain(planet) {
  const N = 250; const [cv, g] = mkCv(N, N); const img = g.createImageData(N, N); const R0 = rng(hash(`${planet.id}map`));
  const nz = (x, y) => Math.sin(x * 0.09 + Math.sin(y * 0.05) * 2) * 0.5 + Math.sin(y * 0.12 + x * 0.03) * 0.5;
  const regAt = (x, y) => { const wx = x / N * MAPW + nz(x, y) * 12; const wy = y / N * MAPW + nz(y, x) * 12; let b = 0; let bd = 1e18; planet.regions.forEach((r, i) => { const d = (r.x - wx) ** 2 + (r.y - wy) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  const grid = new Int8Array(N * N); for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) grid[y * N + x] = regAt(x, y);
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
    const i = grid[y * N + x]; const r = planet.regions[i]; const n = parseInt(r.biome.slice(1), 16); let cr = n >> 16; let cg = (n >> 8) & 255; let cb = n & 255;
    const q = nz(x * 2.5, y * 2.5); const k = q > 0.45 ? 1.18 : q < -0.45 ? 0.82 : 1; const d = ((x + y) % 2 === 0 && Math.abs(q) < 0.08) ? 0.92 : 1; cr *= k * d; cg *= k * d; cb *= k * d;
    const edge = (x > 0 && grid[y * N + x - 1] !== i) || (y > 0 && grid[(y - 1) * N + x] !== i); if (edge) { cr *= 0.4; cg *= 0.4; cb *= 0.4; }
    const acc = ACCENT[r.terrain];
    if (acc && ((x * 7 + y * 13) % 11 === 0) && Math.abs(q) > 0.3) { const an = parseInt(acc.slice(1), 16); cr = cr * 0.45 + (an >> 16) * 0.55; cg = cg * 0.45 + ((an >> 8) & 255) * 0.55; cb = cb * 0.45 + (an & 255) * 0.55; }
    if (R0() < 0.012) { cr *= 0.7; cg *= 0.7; cb *= 0.7; }
    const o = (y * N + x) * 4; img.data[o] = cr; img.data[o + 1] = cg; img.data[o + 2] = cb; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); return cv;
}
export function mapTerrain(planet) {
  const key = `${planet.id}|${planet.regions.map((r) => r.biome + r.x).join()}`;
  if (MAPC.key !== key) { MAPC.key = key; MAPC.cv = buildMapTerrain(planet); }
  return MAPC.cv;
}
export const MAPVIEW = { s: 1, ox: 0, oy: 0, ps: 2 };
export function regionAtMap(planet, x, y) { let b = 0; let bd = 1e18; planet.regions.forEach((r, i) => { const d = (r.x - x) ** 2 + (r.y - y) ** 2; if (d < bd) { bd = d; b = i; } }); return planet.regions[b]; }
export function clampMapCam(cam) { cam.z = clamp(cam.z, 0.7, 8); cam.x = clamp(cam.x, 0, MAPW); cam.y = clamp(cam.y, 0, MAPW); }

export function renderMap(canvas, ctx, data) {
  const { planet, regionId, t, cam, selected } = data;
  const ps = ensureBuffers(canvas.width, canvas.height); const bw = PXC.bw; const bh = PXC.bh;
  const s = Math.max(0.0625, Math.floor(clamp(Math.min(bw, bh) / (MAPW * 1.04) * cam.z, 0.0625, 10) * 16) / 16);
  if (cam.auto) { cam.x = MAPW / 2; cam.y = MAPW / 2; }
  clampMapCam(cam);
  PXC.s = s; PXC.ox = Math.round(bw / 2 - cam.x * s); PXC.oy = Math.round(bh / 2 - cam.y * s);
  Object.assign(MAPVIEW, { s, ox: PXC.ox, oy: PXC.oy, ps });
  const g = fgG; PXC.g = g; labels = PXC.labels = [];
  g.globalAlpha = 1; g.fillStyle = '#0b0714'; g.fillRect(0, 0, bw, bh);
  g.drawImage(mapTerrain(planet), bx(0), by(0), bx(MAPW) - bx(0), by(MAPW) - by(0));
  for (const r of planet.regions) {
    const T = TERRAINS[r.terrain];
    labels.push({ x: bx(r.x), y: by(r.y - 26), text: r.name.toUpperCase(), col: '#ffffff', plain: true, big: false });
    if (s >= 0.45) labels.push({ x: bx(r.x), y: by(r.y - 26) + 10, text: T.label, col: '#ffd23f', plain: true });
    if (r.id === regionId) {
      // my mine: a little dome, headframe and a pulsing ring
      const X = bx(r.x); const Y = by(r.y); const ring = 8 + Math.sin(t * 3) * 1.5;
      for (let a = 0; a < 6.283; a += 0.12) pB(X + Math.cos(a) * ring * Math.max(1, s * 2), Y + Math.sin(a) * ring * Math.max(1, s * 2) * 0.7, 1, 1, '#ff8a3d');
      for (let dy = 0; dy < 6; dy += 1) { const hw = Math.round(Math.sqrt(36 - dy * dy)); pB(X - hw, Y - dy, hw * 2 + 1, 1, '#ff8a3d'); }
      pB(X - 7, Y, 15, 2, '#ffffff'); pB(X, Y - 9, 1, 3, '#ffffff'); pB(X + 1, Y - 9, 3, 2, '#ff8a3d');
      labels.push({ x: X, y: Y + 12, text: 'YOUR MINE', col: '#ffb347' });
    }
    if (selected && selected.id === r.id) { const rr = 18 + Math.sin(t * 5) * 2; for (let a = 0; a < 6.283; a += 0.15) pB(bx(r.x) + Math.cos(a) * rr * Math.max(1, s), by(r.y) + Math.sin(a) * rr * Math.max(1, s), 1, 1, '#ffd23f'); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0b0714'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(fg, 0, 0, bw * ps, bh * ps);
  drawLabels(ctx, labels, ps);
}
export { shipSprite, crateSprite };

/* zoom helpers so the page can keep the point under the cursor fixed */
export function sideScale(z) { return Math.max(0.0625, Math.min(10, Math.round(clamp((VIEW.bw / WW) * z, 0.0625, 10) * 16) / 16)); }
export function mapScale(z) { return Math.max(0.0625, Math.floor(clamp(Math.min(VIEW.bw, VIEW.bh) / (MAPW * 1.04) * z, 0.0625, 10) * 16) / 16); }
