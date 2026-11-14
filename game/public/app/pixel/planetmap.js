/* Painted planet map: a shaded-relief climate map (height, hillshading, climate colours blending between regions, seas
 * with shoreline shading, soft region labels). Browser only. Ore fields and territories are NEVER drawn, except with
 * opts.debug (the planet demo only).
 *
 *   renderPlanetMap(canvas, planet, { debug, labels, res }) -> { toMap, fromMap }   draws the cached raster scaled to the canvas
 *   toMap(view, x, y)   -> { x, y } canvas pixels for a map point 0..1000   (view = canvas or { w, h })
 *   fromMap(view, px, py) -> { x, y } map point 0..1000 for a canvas pixel
 * Marker placement: p = toMap(canvas, spot.x, spot.y), then draw players, refineries and ships on top. */
import { fieldAt, regionWeights, sampleSpot } from '/shared/planet/index.js';

const rgb = (c) => { const n = parseInt(String(c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cache = new WeakMap();

function box(view) { const w = view.width ?? view.w; const h = view.height ?? view.h; const size = Math.min(w, h); return { size, ox: (w - size) / 2, oy: (h - size) / 2 }; }
export function toMap(view, x, y) { const b = box(view); return { x: b.ox + (x / 1000) * b.size, y: b.oy + (y / 1000) * b.size }; }
export function fromMap(view, px, py) { const b = box(view); return { x: Math.max(0, Math.min(1000, ((px - b.ox) / b.size) * 1000)), y: Math.max(0, Math.min(1000, ((py - b.oy) / b.size) * 1000)) }; }

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function paintBase(planet, N) {
  const F = planet.field; const u = 1000 / N; const P = N + 2;
  const H = new Float32Array(P * P); const E = new Float32Array(N * N); const T = new Float32Array(N * N); const M = new Float32Array(N * N); const W = new Uint8Array(N * N);
  const regs = planet.regions.map((r) => r.biomes.map(rgb)); const nR = regs.length;
  for (let j = -1; j <= N; j += 1) for (let i = -1; i <= N; i += 1) {
    const x = (i + 0.5) * u; const y = (j + 0.5) * u; const f = fieldAt(F, x, y);
    H[(j + 1) * P + i + 1] = f.water ? f.h - 0.25 : (f.e - 0 + 0.05);
    if (i >= 0 && j >= 0 && i < N && j < N) { const k = j * N + i; E[k] = f.e; T[k] = f.temperature; M[k] = f.moisture; W[k] = f.water ? 1 : 0; }
  }
  const sky0 = rgb(planet.sky[0]); const sky1 = rgb(planet.sky[1]);
  const deep = mixc(mixc(sky0, [14, 48, 92], 0.75), [0, 0, 0], 0.15); const shallow = mixc(mixc(sky1, [60, 150, 190], 0.65), [255, 255, 255], 0.1);
  const snow = mixc([236, 242, 248], sky1, 0.12); const rock = mixc([124, 118, 112], rgb(planet.surface), 0.35);
  const img = new ImageData(N, N); const L = [-0.55, -0.6, 0.58]; const ln = Math.hypot(...L);
  for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) {
    const k = j * N + i; const x = (i + 0.5) * u; const y = (j + 0.5) * u; let c;
    const hc = H[(j + 1) * P + i + 1]; const dx = (H[(j + 1) * P + i + 2] - H[(j + 1) * P + i]); const dy = (H[(j + 2) * P + i + 1] - H[j * P + i + 1]);
    if (W[k]) {
      const f = F; const depth = Math.max(0, Math.min(1, (f.sea - (hc + 0.25)) / 0.3));
      c = mixc(shallow, deep, Math.pow(depth, 0.7));
      const shoreT = 1 - sstep(0, 0.045, f.sea - (hc + 0.25)); c = mixc(c, [225, 240, 245], shoreT * 0.55);
      const sh = 1 + (-(dx * L[0] + dy * L[1])) * 1.4; c = c.map((v) => v * Math.max(0.88, Math.min(1.1, sh)));
    } else {
      const e = E[k]; const t = T[k]; const m = M[k];
      const w = regionWeights(F, { temperature: t, moisture: m, e }, x, y); let dmin = 1e9; for (let r = 0; r < nR; r += 1) if (w[r] < dmin) dmin = w[r];
      let sum = 0; let a = [0, 0, 0];
      for (let r = 0; r < nR; r += 1) {
        const wt = Math.exp(-(w[r] - dmin) / 0.075); if (wt < 0.01) continue;
        const b = regs[r]; let col = mixc(b[0], b[1], Math.max(0, Math.min(1, (m - 0.25) * 1.6)));
        col = mixc(col, b[2], Math.max(0, Math.min(1, (Math.min(1, e) - 0.3) * 1.6)));
        a = [a[0] + col[0] * wt, a[1] + col[1] * wt, a[2] + col[2] * wt]; sum += wt;
      }
      c = [a[0] / sum, a[1] / sum, a[2] / sum];
      c = mixc(c, rock, sstep(0.6, 1, Math.min(1, e)) * 0.45);
      c = mixc(c, snow, Math.max(sstep(-0.5, -0.8, t) * 0.9, sstep(0.82, 1.05, e) * (t < 0.15 ? 0.85 : 0.2)));
      c = mixc(c, [205, 190, 150], (1 - sstep(0, 0.035, e)) * 0.35); // beach
      const nx = -dx * 4; const ny = -dy * 4; const sh = (nx * L[0] + ny * L[1] + 1 * L[2]) / ln; // 0.45 on flat
      const lit = Math.max(0.6, Math.min(1.45, 1 + (sh - 0.45) * 1.2));
      c = c.map((v) => v * lit * 0.97);
    }
    const o = k * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  const cv = makeCanvas(N, N); cv.getContext('2d').putImageData(img, 0, 0); return cv;
}

function paintDebug(planet, N) {
  const u = 1000 / N; const ids = planet.ores.map((o) => o.id); const [c0] = ids; const my = ids[6];
  const rc = ['#ffe14a', '#4affb0', '#ff7ac8', '#7ab8ff'].map(rgb); const grid = new Array(N * N);
  for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) { const x = (i + 0.5) * u; const y = (j + 0.5) * u; const f = fieldAt(planet.field, x, y); grid[j * N + i] = f.water ? null : sampleSpot(planet, x, y); }
  const img = new ImageData(N, N);
  const put = (k, c, al) => { const o = k * 4; const a0 = img.data[o + 3] / 255; const a = al + a0 * (1 - al); for (let q = 0; q < 3; q += 1) img.data[o + q] = (c[q] * al + img.data[o + q] * a0 * (1 - al)) / (a || 1); img.data[o + 3] = a * 255; };
  for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) {
    const k = j * N + i; const s = grid[k]; if (!s) continue;
    put(k, s.common === c0 ? [40, 90, 255] : [255, 120, 30], 0.22);
    for (let r = 0; r < 4; r += 1) {
      const id = ids[2 + r]; const here = id in s.richness; const rt = i + 1 < N ? grid[k + 1] : null; const dn = j + 1 < N ? grid[k + N] : null;
      if ((rt && (id in rt.richness) !== here) || (dn && (id in dn.richness) !== here)) put(k, rc[r], 0.95);
      else if (here && (i + j + r) % 4 === 0) put(k, rc[r], 0.18);
    }
    if (my in s.richness) put(k, [255, 0, 255], 0.65);
  }
  const cv = makeCanvas(N, N); cv.getContext('2d').putImageData(img, 0, 0); return cv;
}

// Retro look: shrink the painted map to a chunky pixel grid, cut it to a small palette with ordered
// dithering (classic 4x4 Bayer), then draw it with hard pixel edges. Same map, more 8-bit.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function retroize(src, R) {
  const cv = makeCanvas(R, R); const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, R, R);
  const img = g.getImageData(0, 0, R, R); const d = img.data; const LV = 9; const step = 255 / (LV - 1);
  for (let j = 0; j < R; j += 1) for (let i = 0; i < R; i += 1) {
    const o = (j * R + i) * 4; const th = (BAYER[(j & 3) * 4 + (i & 3)] / 16 - 0.5) * step * 0.55; // gentle dither: texture, not static
    for (let q = 0; q < 3; q += 1) d[o + q] = Math.max(0, Math.min(255, Math.round((d[o + q] + th) / step) * step));
  }
  g.putImageData(img, 0, 0); return cv;
}

export function renderPlanetMap(canvas, planet, opts = {}) {
  const res = opts.res || 384; const g = canvas.getContext('2d'); const view = { w: canvas.width, h: canvas.height };
  let c = cache.get(planet); if (!c) { c = {}; cache.set(planet, c); }
  c.base ||= {}; c.base[res] ||= paintBase(planet, res);
  g.fillStyle = '#0b0714'; g.fillRect(0, 0, view.w, view.h);
  const b = box(view);
  const retro = opts.retro !== false && !opts.debug;
  if (retro) {
    const R = opts.retroRes || 150; c.retro ||= {}; c.retro[res + ':' + R] ||= retroize(c.base[res], R);
    g.imageSmoothingEnabled = false; g.drawImage(c.retro[res + ':' + R], b.ox, b.oy, b.size, b.size);
    // faint scanlines on the pixel rows
    const px = b.size / R; if (px >= 2) { g.fillStyle = 'rgba(8,4,16,0.16)'; for (let y = b.oy; y < b.oy + b.size; y += px) g.fillRect(b.ox, Math.round(y + px - Math.max(1, px / 3)), b.size, Math.max(1, Math.round(px / 3))); }
  } else { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(c.base[res], b.ox, b.oy, b.size, b.size); }
  if (opts.debug) { c.debug ||= paintDebug(planet, 200); g.imageSmoothingEnabled = false; g.drawImage(c.debug, b.ox, b.oy, b.size, b.size); g.imageSmoothingEnabled = true; }
  if (opts.labels !== false && b.size >= 300) {
    const fs = Math.max(9, Math.round(b.size / 60)); g.font = `${fs}px Silkscreen, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'miter'; g.lineWidth = Math.max(2, fs / 3);
    const used = [];
    for (const r of planet.regions) {
      const p = toMap(view, r.x, r.y); const tw = g.measureText(r.name.toUpperCase()).width / 2 + 3;
      if (used.some((q) => Math.abs(q.x - p.x) < q.w + tw && Math.abs(q.y - p.y) < fs * 1.1)) continue; used.push({ x: p.x, y: p.y, w: tw }); const up = r.name.toUpperCase(); g.fillStyle = 'rgba(14,8,24,0.85)'; g.fillText(up, p.x + 1, p.y + 1); g.fillText(up, p.x + 2, p.y + 2); g.fillStyle = '#f4edff'; g.fillText(up, p.x, p.y);
    }
  }
  return { toMap: (x, y) => toMap(view, x, y), fromMap: (px, py) => fromMap(view, px, py) };
}
