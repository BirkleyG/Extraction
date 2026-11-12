/* Side-view planet drawing: sky (gradient, stars, moons), a region's landscape (far/near ridges, water, ground strip,
 * ground decor, animated overlay, weather) and the rock strata under the surface. Ported from the archived
 * legacy-tycoon play/scene.js. See sprites.js for the `view` convention: surface at world y = 0, sky above, rock below.
 *
 * Typical frame (one region):
 *   drawSky(g, planet, view, t); drawStrata(g, planet, view); drawLandscape(g, planet, region, view, t, { weather: false });
 *   ...draw your mine, miners and ships with pen()/personSprite()/drawShip()...
 *   drawWeather(g, planet, region, view, t);   // last, so weather falls in front of everything */
import { hash, rng, h01, clamp, mix, shade, rgba } from '../../../shared/planet/util.js';
import { TERRAINS } from '../../../shared/planet/terrains.js';
import { oreSpriteSpec } from '../../../shared/planet/ores.js';
import { pen, mkCv, oreSprite } from './sprites.js';
import { SPEC, ridgeLayer, drawDecor, drawOverlay } from './terrains.js';

export const GROUND_H = 8; // the ground strip drawn by drawLandscape covers world y 0..GROUND_H
export const LAYER_H = 64; // default thickness of each of the 5 rock layers, in world units
/* which rock layer (0..4) an ore with this depthMin (in shaft levels, 0..20) lives in */
export const layerOfDepth = (depth) => clamp(Math.floor((depth || 0) / 4), 0, 4);

const horizonY = (view) => Math.round((0 - view.y) * view.scale);
export function groundColor(planet, region) {
  const T = region.terrain; const b = (region.biomes && region.biomes[0]) || TERRAINS[T]?.biomes[0] || '#7a6a5a';
  if (T === 'glacier') return mix(b, '#ffffff', 0.55);
  if (T === 'saltflat') return mix(b, '#ffffff', 0.3);
  if (T === 'dunes') return shade(b, 0.05);
  return mix(planet.surface || b, b, 0.72);
}
const waterColor = (planet) => mix('#2a6a9a', planet.sky[1], 0.3);

/* ---------- sky ---------- */
export function drawSky(g, planet, view, t = 0) {
  const s = view.scale; const hy = horizonY(view); const W = view.w;
  if (hy <= 0) return;
  const px = Math.max(1, Math.round(s)); const N = 14;
  const skyTop = Math.min(0, hy - Math.round(260 * s)); // gradient spans 260 world units above the horizon
  const span = hy - skyTop;
  for (let i = 0; i < N; i += 1) {
    const y0 = skyTop + Math.floor(span * i / N); const y1 = skyTop + Math.floor(span * (i + 1) / N);
    if (y1 < 0) continue;
    g.fillStyle = mix(planet.sky[0], planet.sky[1], (i / (N - 1)) ** 1.3); g.fillRect(0, Math.max(0, y0), W, y1 - Math.max(0, y0) + 1);
    if (i < N - 1 && y1 - px >= 0) { g.fillStyle = mix(planet.sky[0], planet.sky[1], ((i + 1) / (N - 1)) ** 1.3); for (let x = (i % 2) * px; x < W; x += px * 2) g.fillRect(x, y1 - px, px, px); }
  }
  if (skyTop > 0) { g.fillStyle = planet.sky[0]; g.fillRect(0, 0, W, skyTop); }
  // stars, fixed to the sky box, fading toward the horizon
  const R = rng(hash(`${planet.id}stars`)); const n = Math.round(W * hy / (520 * px * px)) + 20;
  for (let i = 0; i < n; i += 1) {
    const x = R() * W; const y = R() * hy * 0.92; const big = R() < 0.12; const tw = R();
    let a = (0.35 + R() * 0.65) * (1 - y / hy) ** 0.7; if (tw < 0.2) a *= 0.5 + 0.5 * Math.sin(t * 2.5 + i);
    if (a <= 0.05) continue; g.globalAlpha = a; g.fillStyle = planet.stars || '#ffffff';
    g.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, px, px);
    if (big) { g.fillRect(Math.round(x / px) * px - px, Math.round(y / px) * px, px * 3, px); g.fillRect(Math.round(x / px) * px, Math.round(y / px) * px - px, px, px * 3); }
  }
  g.globalAlpha = 1;
  const P = pen(g, view);
  for (const m of planet.moons || []) drawMoon(g, P, planet, m, m.x * W, m.y * hy, Math.max(2, m.size * s), t);
}
function drawMoon(g, P, planet, m, cx, cy, r, t) {
  const col = m.color; const dark = mix(shade(col, -0.45), planet.sky[0], 0.35);
  g.globalAlpha = 0.12; P.disc(cx, cy, r * 1.7, col, true); g.globalAlpha = 0.18; P.disc(cx, cy, r * 1.25, col, true); g.globalAlpha = 1;
  const R0 = Math.ceil(r); const lx = cx - r * 0.45; const ly = cy - r * 0.35; const lr = r * 1.15;
  for (let dy = -R0; dy <= R0; dy += 1) {
    const q = r * r - dy * dy; if (q < 0) continue; const hw = Math.floor(Math.sqrt(q)); const y = Math.round(cy + dy);
    g.fillStyle = dark; g.fillRect(Math.round(cx - hw), y, hw * 2 + 1, 1);
    const ldy = cy + dy - ly; const lq = lr * lr - ldy * ldy; if (lq <= 0) continue; const lhw = Math.sqrt(lq);
    const a = Math.max(cx - hw, lx - lhw); const b = Math.min(cx + hw + 1, lx + lhw);
    if (b > a) { g.fillStyle = col; g.fillRect(Math.round(a), y, Math.round(b) - Math.round(a), 1); }
  }
  const R = rng(hash(`${col}${m.size}`));
  for (let i = 0; i < 3 + (r > 10 ? 2 : 0); i += 1) { const a = R() * 6.28; const d = R() * r * 0.6; P.disc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(1, r * (0.1 + R() * 0.14)), shade(col, -0.18), true); }
}

/* ---------- landscape ---------- */
export function drawLandscape(g, planet, region, view, t = 0, opts = {}) {
  const s = view.scale; const hy = horizonY(view); const W = view.w; const P = pen(g, view);
  const terrain = SPEC[region.terrain] ? region.terrain : 'prairie'; const spec = SPEC[terrain];
  const sd = hash(`${planet.id}|${region.id}`); const biomes = region.biomes && region.biomes.length ? region.biomes : TERRAINS[terrain].biomes;
  const step = Math.max(1, Math.round(s)); const cx = view.x + W / (2 * s);
  const wx0 = view.x; const wx1 = view.x + W / s;
  // far then near ridge, with a little parallax when the camera pans
  if (hy > 0) for (const L of [0, 1]) {
    const Ly = L ? spec.near : spec.far; if (!Ly || Ly.k === 'none') continue;
    let base = shade(biomes[L ? 0 : 1] || biomes[0], L ? -0.3 : -0.5);
    if (spec.tint) base = mix(base, spec.tint, L ? 0.55 : 0.45);
    base = mix(base, planet.sky[1], L ? 0.1 : 0.28);
    const stripe = Math.max(2, Math.round(6 * s)); const par = L ? 0.15 : 0.35;
    for (let col = 0; col < W; col += step) {
      const wx = view.x + col / s - cx * par;
      const r = ridgeLayer(Ly, wx, sd, planet);
      const hh = Math.max(0, Math.round(r.h * s)); if (!hh) continue;
      const top = hy - hh; const segH = Math.max(1, hh - Math.round((r.lo || 0) * s));
      let c = base;
      if (r.c) c = mix(shade(r.c, L ? -0.15 : -0.35), planet.sky[1], L ? 0.05 : 0.2);
      else if (r.stalk) c = mix('#d8c8b8', base, 0.5);
      else if (r.mush) c = mix(mix(shade(biomes[0], 0.2), '#ff9fd0', L ? 0.3 : 0.4), planet.sky[1], L ? 0.05 : 0.2);
      else if (r.trunk) c = mix('#3a2818', base, 0.4);
      else if (r.ball) c = '#f0eee4';
      else if (r.cap) c = shade(base, 0.12);
      if (r.facet) c = shade(c, 0.18);
      g.fillStyle = c; g.fillRect(col, top, step, segH);
      if (r.crown) { g.fillStyle = mix('#3a6a34', planet.sky[1], L ? 0.05 : 0.18); g.fillRect(col, top, step, Math.min(hh, Math.max(3, Math.round(9 * s)))); }
      if (spec.stripes) { g.fillStyle = shade(c, 0.1); for (let y = top; y < top + segH; y += stripe * 2) g.fillRect(col, y, step, Math.max(1, Math.round(s))); }
      if (spec.windows && hh > 8 * s) for (let y = top + 2 * step; y < hy - 2 * step; y += Math.max(3, Math.round(4 * s))) { if (h01(Math.floor(wx) * 13 + Math.round((y - hy) / s), sd) < 0.18) { g.fillStyle = mix(planet.ores[(sd >>> 2) % planet.ores.length].color, '#ffffff', 0.5); g.fillRect(col, y, step, step); } }
      if (spec.holes && hh > 8 * s && Math.floor(wx) % 3 === 0) { g.fillStyle = shade(c, -0.4); for (let y = top + 3 * step; y < hy - 2 * step; y += Math.max(4, Math.round(5 * s))) g.fillRect(col, y, step, step); }
      if (r.snow || spec.snowcap) { g.fillStyle = L ? '#ffffff' : '#cfe6f6'; g.fillRect(col, top, step, Math.min(Math.max(2, Math.round(5 * s)), hh)); }
      else if ((spec.glint && r.cap) || spec.topline) { g.fillStyle = shade(c, 0.35); g.fillRect(col, top, step, Math.max(1, Math.round(s))); }
    }
    if (L === 0 && spec.water) {
      const wc = waterColor(planet); const d = Math.max(2, Math.round(spec.water.d * s));
      for (let col = 0; col < W; col += step) {
        const wx = view.x + col / s; if (spec.water.every && ((wx % spec.water.every) + spec.water.every) % spec.water.every < spec.water.len) continue;
        g.fillStyle = wc; g.fillRect(col, hy - d, step, d); g.fillStyle = shade(wc, 0.3); g.fillRect(col, hy - d, step, Math.max(1, Math.round(s)));
        const sp = Math.floor(wx / 3); if (h01(sp, sd) < 0.12 && Math.sin(t * 2 + sp) > 0) { g.fillStyle = shade(wc, 0.5); g.fillRect(col, hy - d + Math.round(2 * s), step, Math.max(1, Math.round(s))); }
      }
    }
  }
  // ground strip with a ragged top
  const gc = groundColor(planet, region);
  P.rect(wx0 - 2, 0, wx1 - wx0 + 4, GROUND_H, gc);
  for (let x = Math.floor(wx0) - 2; x < wx1 + 2; x += 2) { const k = h01(Math.floor(x / 2), sd + 5); const hh = Math.floor(k * 3); if (hh) P.rect(x, -hh, 2, hh, gc); if (k > 0.75) P.rect(x, -hh - 1, 1, 2, shade(gc, 0.15)); }
  P.rect(wx0 - 2, GROUND_H, wx1 - wx0 + 4, 2, shade(gc, -0.25));
  // topsoil: the region's ground bleeds a little into the planet's first rock layer
  if (opts.topsoil !== false) {
    const soil = shade(gc, -0.3);
    for (let y = GROUND_H + 2; y < GROUND_H + 14; y += 1) {
      const k = (y - GROUND_H - 2) / 12;
      for (let x = Math.floor(wx0 / 2) * 2 - 2; x < wx1 + 2; x += 2) if (h01(Math.floor(x / 2) * 31 + y * 7, sd) > k) P.rect(x, y, 2, 1, soil);
    }
  }
  // decor: deterministic per 16-unit cell so it stays put when panning
  const leaf = shade(biomes[0], 0.12); const C = 16;
  for (let c = Math.floor(wx0 / C) - 2; c <= Math.ceil(wx1 / C) + 1; c += 1) {
    const R0 = rng(hash(`${sd}:${c}`)); if (R0() > (opts.decorDensity ?? 0.8)) continue;
    drawDecor(P, spec, c * C + R0() * (C - 4), gc, R0, planet, { ...region, biomes }, leaf);
  }
  if (spec.over) drawOverlay(spec.over, { P, g, t, sd, planet, spec, wx0, wx1, farShift: cx * 0.35, nearShift: cx * 0.15 });
  if (opts.weather !== false) drawWeather(g, planet, region, view, t);
}

/* ---------- weather (screen space over the sky and the land just below the horizon) ---------- */
export function drawWeather(g, planet, region, view, t = 0) {
  const fx = region.weather || TERRAINS[region.terrain]?.fx; const s = view.scale; const W = view.w;
  const hy = clamp(horizonY(view), 0, view.h); if (hy <= 0) return;
  const u = Math.max(1, Math.round(s)); const box = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  const mod = (a, b) => ((a % b) + b) % b; const n = (k) => Math.round(k * W / (320 * u));
  if (fx === 'wind') { for (let i = 0; i < n(16); i += 1) box(mod(i * 97 * u + t * 260 * u, W + 60 * u) - 30 * u, mod(i * 29 * u, hy), 14 * u, u, 'rgba(255,255,255,0.3)'); }
  else if (fx === 'snow') { for (let i = 0; i < n(80); i += 1) { const y = mod(i * 37 * u + t * 36 * u, hy + 40 * u); box(mod(i * 53 * u + Math.sin(t + i) * 6 * u + t * 14 * u, W + 20 * u) - 10 * u, y, u, u, 'rgba(255,255,255,0.85)'); } }
  else if (fx === 'ash') { for (let i = 0; i < n(60); i += 1) box(mod(i * 61 * u + t * 10 * u, W + 20 * u) - 10 * u, mod(i * 43 * u + t * 22 * u, hy + 30 * u), u, u, 'rgba(180,170,170,0.5)'); box(0, hy * 0.62, W, hy * 0.38, 'rgba(255,100,40,0.07)'); }
  else if (fx === 'fog') { for (let i = 0; i < 5; i += 1) box(0, hy * (0.4 + i * 0.12), W, Math.max(2, hy * 0.05), 'rgba(150,255,120,0.10)'); }
  else if (fx === 'aurora') { for (let i = 0; i < 3; i += 1) { const col = `rgba(${120 + i * 50},255,${200 - i * 40},0.2)`; for (let x = 0; x < W; x += u * 2) box(x, hy * (0.15 + i * 0.1) + Math.sin(x / u * 0.03 + t + i) * 5 * u, u * 2, 4 * u, col); } }
  else if (fx === 'spores') { for (let i = 0; i < n(40); i += 1) box(mod(i * 71 * u + Math.sin(t * 0.6 + i) * 8 * u, W), hy - mod(i * 29 * u + t * 8 * u, hy * 0.8), u, u, i % 2 ? 'rgba(255,170,230,0.75)' : 'rgba(170,255,220,0.7)'); }
  else if (fx === 'meteor') { const ph = (t * 0.35) % 1; const x = W * (0.9 - ph * 0.7); const y = hy * ph * 0.8; for (let i = 0; i < 12; i += 1) box(x + i * u, y - i * 0.7 * u, u, u, i < 3 ? '#fff3c0' : 'rgba(255,200,120,0.6)'); }
  else if (fx === 'rain') { for (let i = 0; i < n(90); i += 1) box(mod(i * 53 * u + t * 40 * u, W + 20 * u) - 10 * u, mod(i * 37 * u + t * 230 * u, hy + 30 * u), u, 3 * u, 'rgba(170,210,255,0.55)'); }
  else if (fx === 'leaves') { for (let i = 0; i < n(26); i += 1) box(mod(i * 67 * u + Math.sin(t + i) * 10 * u + t * 18 * u, W + 20 * u) - 10 * u, mod(i * 41 * u + t * 20 * u, hy + 30 * u), 2 * u, u, ['#c8602a', '#d8902a', '#a8402a'][i % 3]); }
  else if (fx === 'fireflies') { for (let i = 0; i < n(22); i += 1) { if (Math.sin(t * 2 + i * 1.3) > 0) box(mod(i * 83 * u + Math.sin(t * 0.7 + i) * 12 * u, W), hy - 4 * u - mod(i * 29 * u, Math.max(6 * u, hy * 0.22)) + Math.sin(t + i * 2) * 3 * u, u, u, 'rgba(255,240,120,0.9)'); } }
  else if (fx === 'mist') { for (let i = 0; i < 4; i += 1) box(0, hy * (0.66 + i * 0.1) + Math.sin(t * 0.6 + i) * 2 * u, W, Math.max(2, hy * 0.05), 'rgba(255,255,255,0.09)'); }
  else if (fx === 'steam') { for (let i = 0; i < 3; i += 1) box(0, hy * (0.78 + i * 0.07) + Math.sin(t * 0.9 + i) * 2 * u, W, Math.max(2, hy * 0.04), 'rgba(255,255,255,0.08)'); }
  else if (fx === 'sparks') { for (let i = 0; i < n(18); i += 1) box(mod(i * 97 * u + Math.sin(t + i) * 6 * u, W), hy - mod(i * 31 * u + t * 30 * u, Math.max(10, hy * 0.5)), u, u, i % 2 ? '#ffd23f' : '#ff8a3d'); }
  else if (fx === 'glitch') { for (let i = 0; i < 3; i += 1) { if (Math.sin(t * 7 + i * 3) > 0.85) box(0, mod(t * 37 * u + i * 53 * u, hy), W, u, i % 2 ? 'rgba(122,209,255,0.25)' : 'rgba(255,94,196,0.25)'); } }
  else if (fx === 'motes') { for (let i = 0; i < n(34); i += 1) box(mod(i * 71 * u + Math.sin(t * 0.5 + i) * 10 * u, W), mod(i * 43 * u + Math.cos(t * 0.4 + i) * 8 * u, hy + 20 * u), u, u, i % 2 ? 'rgba(180,220,255,0.7)' : 'rgba(255,200,255,0.65)'); }
  else if (fx === 'haze') { for (let i = 0; i < 6; i += 1) box(0, hy * (0.82 + i * 0.03) + Math.sin(t * 2 + i) * 1.5 * u, W, u, 'rgba(255,255,255,0.08)'); }
}

/* ---------- strata ---------- */
const TILE_W = 256; const TILES = new Map();
function strataTile(planet, layerH) {
  const key = `${planet.id}|${layerH}|${planet.layers.map((l) => l.color).join('')}`; let tile = TILES.get(key); if (tile) return tile;
  const H = layerH * 5; const [cv, g] = mkCv(TILE_W, H); const R0 = rng(hash(`${planet.id}rock`));
  const B = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const per = (x, k) => Math.sin((x / TILE_W) * Math.PI * 2 * k);
  for (let L = 0; L < 5; L += 1) {
    const y0 = L * layerH; const col = planet.layers[L].color;
    B(0, y0, TILE_W, layerH + 1, col);
    for (let y = 0; y < layerH; y += 8) if ((y / 8) % 2) B(0, y0 + y, TILE_W, 4, shade(col, -0.05));
    for (let k = 0; k < 6; k += 1) { const yy = y0 + Math.round(layerH * (k + 0.5) / 6); for (let x = 0; x < TILE_W; x += 4) B(x, yy + Math.round(per(x, 2 + (k % 3)) * 3 + per(x + k * 40, 5) * 1.5), 4, 1, shade(col, -0.2)); }
    for (let k = 0; k < TILE_W * layerH / 30; k += 1) B(Math.floor(R0() * TILE_W), y0 + Math.floor(R0() * layerH), 1 + (R0() < 0.2 ? 1 : 0), 1, R0() < 0.55 ? shade(col, -0.25) : shade(col, 0.12));
    for (let k = 0; k < TILE_W / 40; k += 1) { const x = 12 + R0() * (TILE_W - 24); const y = y0 + 8 + R0() * (layerH - 16); const rx = 4 + R0() * 8; const ry = rx * 0.6; const cl = shade(col, -0.14); for (let yy = -ry; yy <= ry; yy += 1) { const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)))); B(Math.round(x - hw), Math.round(y + yy), hw * 2 + 1, 1, cl); } }
    if (L > 0) for (let x = 0; x < TILE_W; x += 3) { const j = Math.floor(R0() * 4); B(x, y0 - j, 3, j, planet.layers[L - 1].color); }
  }
  // ore seams: each layer shows the ores that live at that depth (and a few shallower ones)
  const ores = planet.ores || [];
  for (let L = 0; L < 5; L += 1) {
    const cand = []; for (const o of ores) { const ol = layerOfDepth(o.depthMin); if (ol === L) cand.push(o, o, o); else if (ol < L && (o.tier !== 'common' || L <= 2)) cand.push(o); }
    if (!cand.length) continue;
    for (let k = 0; k < TILE_W / 28; k += 1) {
      const o = cand[Math.floor(R0() * cand.length)]; const size = 7 + Math.floor(R0() * 5);
      const im = oreSprite(oreSpriteSpec(o), size);
      g.drawImage(im, Math.round(size / 2 + R0() * (TILE_W - size * 2)), Math.round(L * layerH + 4 + R0() * (layerH - size - 8)));
    }
  }
  for (let y = 0; y < H; y += 8) { g.fillStyle = `rgba(8,5,14,${Math.min(0.45, (y / H) * 0.45)})`; g.fillRect(0, y, TILE_W, 8); }
  tile = cv; TILES.set(key, tile); if (TILES.size > 24) TILES.delete(TILES.keys().next().value); return tile;
}
/* rock layers from world y = 0 down to 5 * layerH, tiled horizontally; deeper than that is the core colour */
export function drawStrata(g, planet, view, opts = {}) {
  const layerH = opts.layerH || LAYER_H; const s = view.scale; const tile = strataTile(planet, layerH); const H = layerH * 5;
  const y0 = Math.max(0, view.y); const y1 = Math.min(H, view.y + view.h / s); const prev = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
  const SX = (x) => Math.round((x - view.x) * s); const SY = (y) => Math.round((y - view.y) * s);
  if (y1 > y0) for (let k = Math.floor(view.x / TILE_W); k * TILE_W < view.x + view.w / s; k += 1) {
    const dx = SX(k * TILE_W); const dw = SX((k + 1) * TILE_W) - dx;
    g.drawImage(tile, 0, y0, TILE_W, y1 - y0, dx, SY(y0), dw, SY(y1) - SY(y0));
  }
  const bottom = SY(H); if (bottom < view.h) { g.fillStyle = mix(shade(planet.layers[4].color, -0.45), '#08050e', 0.3); g.fillRect(0, Math.max(0, bottom), view.w, view.h - Math.max(0, bottom)); }
  g.imageSmoothingEnabled = prev;
}

/* everything for one region at once (sky, strata, land, weather) */
export function drawScene(g, planet, region, view, t = 0, opts = {}) {
  g.fillStyle = '#0b0714'; g.fillRect(0, 0, view.w, view.h);
  drawSky(g, planet, view, t); drawStrata(g, planet, view, opts); drawLandscape(g, planet, region, view, t, opts);
}
export { rgba };
