/* Pixel sprite factories and draw helpers, ported from the original Mineshaft Capital renderer (archived
 * legacy-tycoon play/sprites.js) and adapted to the v2 `view` convention.
 *
 * VIEW CONVENTION (used by every draw function in this kit)
 *   view = { x, y, scale, w, h }
 *   - world units are art pixels: at scale 1 one world unit is one canvas pixel.
 *   - screenX = (worldX - view.x) * view.scale, screenY = (worldY - view.y) * view.scale,
 *     so (view.x, view.y) is the world point at the canvas's top-left corner.
 *   - the planet surface (horizon) is worldY = 0; the sky is worldY < 0, rock is worldY > 0.
 *   - w, h are the canvas size in screen pixels.
 *   For crisp pixel art, draw into a small buffer canvas at scale 1-3 and upscale it with
 *   imageSmoothingEnabled = false (or CSS image-rendering: pixelated).
 *
 * Sprite factories return cached canvases; they only touch the DOM when first called. */
import { clamp, hash, rng, shade, mix } from '../../../shared/planet/util.js';

export const OUTLINE = '#140c1c';
const CACHE = new Map();

export function mkCv(w, h) {
  const c = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
  return [c, g];
}
export function outline(cv, col) {
  const g = cv.getContext('2d'); const w = cv.width; const h = cv.height;
  const id = g.getImageData(0, 0, w, h); const d = id.data; const out = new Uint8ClampedArray(d);
  const n = parseInt((col || OUTLINE).slice(1), 16);
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 4; if (d[i + 3] > 40) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) { out[i] = n >> 16; out[i + 1] = (n >> 8) & 255; out[i + 2] = n & 255; out[i + 3] = 255; }
  }
  id.data.set(out); g.putImageData(id, 0, 0); return cv;
}

/* ---------- world-space pen ---------- */
/* pen(g, view) gives rect/disc/line/sprite helpers in world units that snap to whole screen pixels */
export function pen(g, view) {
  const s = view.scale; const vx = view.x; const vy = view.y;
  const X = (x) => Math.round((x - vx) * s); const Y = (y) => Math.round((y - vy) * s);
  const P = {
    g, view, s, X, Y,
    rect(x, y, w, h, col) { const x0 = X(x); const y0 = Y(y); g.fillStyle = col; g.fillRect(x0, y0, Math.max(1, X(x + w) - x0), Math.max(1, Y(y + h) - y0)); },
    srect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); },
    /* filled pixel disc; screen=true takes screen coordinates and radius */
    disc(x, y, r, col, screen) {
      g.fillStyle = col; const cx = screen ? x : (x - vx) * s; const cy = screen ? y : (y - vy) * s; const rr = Math.max(0.6, screen ? r : r * s); const R0 = Math.ceil(rr);
      for (let dy = -R0; dy <= R0; dy += 1) { const q = rr * rr - dy * dy; if (q < 0) continue; const hw = Math.floor(Math.sqrt(q)); g.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1); }
    },
    line(x0, y0, x1, y1, col, w) {
      g.fillStyle = col; const A = (x0 - vx) * s; const B = (y0 - vy) * s; const C = (x1 - vx) * s; const D = (y1 - vy) * s;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(C - A), Math.abs(D - B)))); const ww = Math.max(1, Math.round((w || 1) * s));
      for (let i = 0; i <= n; i += 1) { const t = i / n; g.fillRect(Math.round(A + (C - A) * t - ww / 2), Math.round(B + (D - B) * t - ww / 2), ww, ww); }
    },
    /* draw a sprite canvas with its anchor (ax, ay in sprite pixels) at world (x, y); k scales it */
    sprite(img, x, y, ax, ay, flip, k, alpha) {
      if (!img) return; const ks = s * (k || 1); const w = Math.max(1, Math.round(img.width * ks)); const h = Math.max(1, Math.round(img.height * ks));
      const SX = X(x); const SY = Y(y); if (alpha != null) g.globalAlpha = alpha;
      if (flip) { g.save(); g.translate(SX, SY); g.scale(-1, 1); g.drawImage(img, -Math.round(ax * ks), -Math.round(ay * ks), w, h); g.restore(); } else g.drawImage(img, SX - Math.round(ax * ks), SY - Math.round(ay * ks), w, h);
      if (alpha != null) g.globalAlpha = 1;
    },
  };
  return P;
}

/* ---------- people ---------- */
export const ROLEC = {
  miner: { body: '#e0702a', pants: '#3a2c4a', hat: '#ffd23f' }, porter: { body: '#3f86c8', pants: '#2a2a3a', hat: '#1f4f80' },
  pilot: { body: '#5a6a8a', pants: '#2a2a3a', hat: '#c8d0e0' }, soldier: { body: '#5a7a34', pants: '#2f3a20', hat: '#3b4f24' },
  politician: { body: '#2c2c38', pants: '#1a1a22', hat: '#111118' }, envoy: { body: '#c85a9a', pants: '#3a2440', hat: '#ff9fd0' },
  robot: { body: '#8a96a8', pants: '#4a5262', hat: null },
};
const TOOLCOL = ['#cfd6e0', '#cfd6e0', '#9aa7b8', '#ff5ec4', '#7ad1ff', '#ffd23f'];
/* personSprite({ role: 'miner'|'porter'|'pilot'|'soldier'|'politician'|'envoy', pose: 'walk'|'swing'|'carry'|'shovel'|'cheer'|'climb'|'speech'|'flag',
 *   frame: 0-2, skin, color (body override, e.g. the player's colour), head: 'dome'|'tall'|'cyclops'|'antenna'|'horn'|'tentacle'|'visor',
 *   tier: 0-5 tool tier, load: '#hex' ore being carried, robot, accent }) -> 24x27 canvas, feet on row 24, facing right */
export function personSprite(o = {}) {
  const key = `p|${[o.skin, o.head, o.role, o.pose, o.frame, o.tier || 0, o.load || '', o.color || '', o.robot ? 1 : 0, o.accent || ''].join('|')}`;
  let cv = CACHE.get(key); if (cv) return cv;
  const [c, g] = mkCv(24, 27); const P1 = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); }; const B = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const rc = ROLEC[o.robot ? 'robot' : o.role] || ROLEC.miner; const body = o.color || rc.body; const pants = rc.pants;
  const skin = o.robot ? '#c0c8d4' : (o.skin || '#f2c9a5'); const dk = shade(body, -0.32); const lt = shade(body, 0.22); const shoe = '#1d1424';
  const f = o.frame || 0; const pose = o.pose || 'walk';
  const leg = (x, top) => { B(x, top, 2, 25 - top, pants); B(x, 24, 2, 1, shoe); };
  if (pose === 'climb') { if (f % 2) { leg(8, 20); leg(12, 22); } else { leg(8, 22); leg(12, 20); } } else if (f === 1) { leg(7, 20); leg(13, 20); } else if (f === 2) { leg(9, 20); leg(11, 20); } else { leg(8, 20); leg(12, 20); }
  B(8, 14, 6, 6, body); B(13, 14, 1, 6, dk); B(8, 18, 6, 1, '#2a1f18'); P1(10, 18, '#d9b860');
  if (o.role === 'porter') B(10, 14, 1, 4, lt);
  if (o.role === 'pilot') { P1(9, 15, '#ffd23f'); B(8, 14, 6, 1, lt); }
  if (o.role === 'soldier') { P1(9, 15, dk); P1(11, 16, dk); P1(12, 15, lt); }
  if (o.role === 'politician') { B(10, 14, 2, 4, '#f0f0f0'); B(10, 15, 1, 3, '#c42a2a'); }
  if (o.robot) B(9, 15, 3, 2, '#4ad0ff');
  const hd = o.robot ? 'visor' : (o.head || 'dome'); const hx = 8;
  if (hd === 'visor') { B(hx, 9, 5, 5, o.robot ? '#c0c8d4' : skin); B(hx + 1, 11, 4, 1, '#4ad0ff'); P1(hx + 2, 7, '#9aa7b8'); P1(hx + 2, 8, '#9aa7b8'); P1(hx + 2, 6, '#ff5a6e'); } else {
    if (hd === 'tall') B(hx + 1, 6, 3, 3, skin);
    B(hx + 1, 9, 3, 1, skin); B(hx, 10, 5, 4, skin);
    if (hd === 'cyclops') { B(hx + 2, 10, 2, 2, '#ffffff'); P1(hx + 3, 11, '#111'); } else { P1(hx + 3, 11, '#1a1022'); P1(hx + 4, 12, shade(skin, -0.25)); }
    if (hd === 'antenna') { P1(hx + 2, 8, shade(skin, -0.2)); P1(hx + 2, 7, shade(skin, -0.2)); P1(hx + 2, 6, o.accent || '#ff8a3d'); }
    if (hd === 'horn') { const bone = '#f2ead8'; P1(hx - 1, 9, bone); P1(hx - 1, 8, bone); P1(hx - 2, 7, bone); P1(hx + 5, 9, bone); P1(hx + 5, 8, bone); P1(hx + 6, 7, bone); }
    if (hd === 'tentacle') { const t2 = shade(skin, -0.25); P1(hx + 1, 14, t2); P1(hx + 1, 15, t2); P1(hx + 3, 14, t2); P1(hx + 3, 15, t2); }
  }
  const hat = rc.hat;
  if (!o.robot && pose !== 'carry' && hat) {
    if (o.role === 'porter') { B(hx, 8, 5, 2, hat); P1(hx + 5, 9, hat); P1(hx + 6, 9, hat); } else if (o.role === 'pilot') { B(hx, 8, 5, 2, hat); B(hx + 1, 10, 4, 1, '#4ad0ff'); } else if (o.role === 'politician') { B(hx + 1, 4, 3, 5, hat); B(hx - 1, 8, 7, 1, hat); B(hx + 1, 7, 3, 1, '#c42a2a'); } else if (o.role === 'envoy') { B(hx, 8, 5, 1, hat); P1(hx + 5, 7, '#fff'); P1(hx + 6, 6, '#fff'); } else { B(hx - 1, 9, 7, 1, hat); B(hx, 8, 5, 1, hat); B(hx + 1, 7, 3, 1, hat); if (o.role !== 'soldier') P1(hx + 5, 9, '#fff6c2'); }
  }
  const tc = TOOLCOL[o.tier || 1] || TOOLCOL[1]; const wood = '#8a5a3c'; const ax = 13;
  const arm = (pts) => { for (const [x, y] of pts) P1(x, y, body); }; const hand = (x, y) => P1(x, y, skin);
  switch (pose) {
    case 'swing': {
      if (f === 0) { arm([[ax, 14], [ax, 13], [ax + 1, 12], [ax + 1, 11]]); hand(ax + 1, 10); P1(ax + 1, 9, wood); P1(ax, 8, wood); P1(ax, 7, wood); B(ax - 3, 6, 7, 1, tc); P1(ax - 3, 7, tc); P1(ax + 3, 7, tc); } else if (f === 1) { arm([[ax, 15], [ax + 1, 15], [ax + 2, 15]]); hand(ax + 3, 15); B(ax + 4, 15, 3, 1, wood); B(ax + 7, 13, 1, 5, tc); P1(ax + 8, 13, tc); } else { arm([[ax, 15], [ax + 1, 16], [ax + 2, 17]]); hand(ax + 3, 18); P1(ax + 4, 19, wood); P1(ax + 5, 20, wood); B(ax + 4, 21, 4, 1, tc); P1(ax + 7, 20, tc); }
      if ((o.tier || 0) >= 2 && f !== 0) P1(ax + 8, 16, shade(tc, 0.3)); break;
    }
    case 'carry': { arm([[8, 13], [8, 12], [8, 11], [ax, 13], [ax, 12], [ax, 11]]); B(7, 4, 8, 6, '#7a5230'); B(7, 6, 8, 2, o.load || '#c9a36b'); B(7, 4, 8, 1, '#9a7046'); P1(7, 9, '#5a3a20'); P1(14, 9, '#5a3a20'); break; }
    case 'shovel': { if (f === 0) { arm([[ax, 15], [ax + 1, 16]]); hand(ax + 2, 17); P1(ax + 3, 18, wood); P1(ax + 4, 19, wood); B(ax + 4, 20, 3, 2, '#9aa7b8'); P1(ax + 5, 20, o.load || '#c9a36b'); } else { arm([[ax, 14], [ax + 1, 13]]); hand(ax + 2, 12); P1(ax + 3, 11, wood); P1(ax + 4, 10, wood); B(ax + 4, 8, 3, 2, '#9aa7b8'); P1(ax + 5, 8, o.load || '#c9a36b'); } break; }
    case 'cheer': case 'climb': { arm([[8, 13], [7, 12], [7, 11], [ax, 13], [ax + 1, 12], [ax + 1, 11]]); hand(7, 10); hand(ax + 1, 10); break; }
    case 'speech': { arm([[ax, 14], [ax + 1, 13], [ax + 1, 12]]); hand(ax + 1, 11); break; }
    case 'flag': { B(6, 3, 1, 17, wood); B(7, 3, 5, 4, o.accent || '#ff9fd0'); P1(9, 4, '#fff'); arm([[ax, 15]]); hand(ax, 16); break; }
    default: { if (f === 1) { arm([[ax, 14], [ax + 1, 15]]); hand(ax + 1, 16); } else if (f === 2) { arm([[ax - 1, 14], [ax - 1, 15]]); hand(ax - 1, 16); } else { arm([[ax, 14], [ax, 15]]); hand(ax, 16); } }
  }
  if (o.load && pose !== 'carry' && pose !== 'shovel') { B(4, 13, 4, 5, o.load); P1(4, 13, shade(o.load, 0.35)); P1(7, 17, shade(o.load, -0.35)); B(5, 12, 2, 1, '#c9a36b'); }
  outline(c); CACHE.set(key, c); return c;
}

/* ---------- ships ---------- */
const SHIPCOL = ['#e8e4f2', '#ffd23f', '#7ad1ff', '#ff8a3d', '#b892ff', '#5ee6a8'];
/* shipSprite('hauler'|'cruiser'|'freighter', level 0..) -> { cv, ax, ay } anchor = bottom centre (landing gear).
 * Hauler is the all-rounder, Cruiser is small and fast, Freighter is slow and huge. Level changes paint and size. */
export function shipSprite(cls, level = 0) {
  const lv = clamp(Math.floor(level || 0), 0, 9); const kind = ['hauler', 'cruiser', 'freighter'].includes(cls) ? cls : 'hauler';
  const key = `s|${kind}|${lv}`; const hit = CACHE.get(key); if (hit) return hit;
  const col = SHIPCOL[lv % SHIPCOL.length]; let res;
  if (kind === 'cruiser') {
    const W = 46 + Math.min(lv, 5) * 2; const [c, g] = mkCv(W, 22); const B = (x, y, w, h, cl) => { g.fillStyle = cl; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    const hull = mix('#9a6aff', col, 0.35 * Math.min(1, lv / 2));
    B(4, 9, W - 14, 6, hull); B(10, 6, W - 26, 3, shade(hull, 0.2)); for (let i = 0; i < 9; i += 1) B(W - 10 + i, 10 + Math.floor(i / 3), 1, Math.max(1, 5 - Math.floor(i / 1.7)), hull);
    B(W - 20, 7, 5, 2, '#7ad1ff'); B(W - 19, 7, 1, 1, '#ffffff'); B(2, 6, 4, 10, shade(hull, -0.35)); B(0, 4, 3, 4, shade(hull, -0.2));
    B(12, 12, W - 24, 1, lv ? col : '#ffd23f'); if (lv >= 2) B(14, 15, 10, 2, shade(hull, -0.25));
    if (lv >= 3) { B(16, 3, 8, 3, shade(hull, 0.1)); B(17, 2, 2, 1, '#ff5a6e'); }
    B(10, 15, 2, 5, '#2a2238'); B(W - 16, 15, 2, 5, '#2a2238'); B(8, 20, 6, 1, '#2a2238'); B(W - 18, 20, 6, 1, '#2a2238');
    outline(c); res = { cv: c, ax: W / 2, ay: 21, exhaust: [[2, 11]] };
  } else if (kind === 'freighter') {
    const n = 3 + Math.min(lv, 5); const W = 30 + n * 12; const H = 38; const [c, g] = mkCv(W + 2, H + 2); const B = (x, y, w, h, cl) => { g.fillStyle = cl; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    const hull = mix('#8a8a96', col, 0.3);
    B(4, 20, W - 10, 10, hull); B(4, 20, W - 10, 1, shade(hull, 0.3)); B(4, 29, W - 10, 1, shade(hull, -0.35));
    B(W - 22, 10, 16, 10, shade(hull, 0.1)); B(W - 18, 12, 8, 3, '#7ad1ff'); B(W - 17, 12, 1, 1, '#ffffff'); for (let i = 0; i < 6; i += 1) B(W - 6 + i, 20 + i, 1, 10 - i, hull);
    const CC = ['#c8602a', '#3f86c8', '#5a9a44', '#c8a040', '#9a4a8a', '#c84a5a'];
    for (let i = 0; i < n; i += 1) { const cc = CC[(i + lv) % CC.length]; const x = 8 + i * 12; B(x, 10 + (i % 2) * 2, 10, 10 - (i % 2) * 2, cc); B(x, 10 + (i % 2) * 2, 10, 1, shade(cc, 0.3)); B(x + 4, 11 + (i % 2) * 2, 1, 8 - (i % 2) * 2, shade(cc, -0.3)); }
    B(0, 18, 5, 14, shade(hull, -0.3)); B(1, 14, 3, 4, '#ff5a6e');
    for (let i = 0; i < 3; i += 1) { const x = 10 + i * ((W - 24) / 2); B(x, 30, 2, 6, '#2a2238'); B(x - 2, 36, 6, 2, '#2a2238'); }
    outline(c); res = { cv: c, ax: (W + 2) / 2, ay: H + 1, exhaust: [[2, 24], [2, 29]] };
  } else {
    const k = 1 + Math.min(lv, 5) * 0.12; const W = Math.round(54 * k); const H = Math.round(34 * k); const [c, g] = mkCv(W + 2, H + 2); const B = (x, y, w, h, cl) => { g.fillStyle = cl; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    B(5, H * 0.36, W - 14, H * 0.42, col); B(W * 0.18, H * 0.16, W * 0.55, H * 0.22, col); for (let i = 0; i < 8; i += 1) B(W - 9 + i, H * 0.36 + i * H * 0.05, 1, H * 0.42 - i * H * 0.1, col);
    B(5, H * 0.36, W - 14, 2, shade(col, 0.3)); B(5, H * 0.72, W - 14, 2, shade(col, -0.3)); B(W * 0.6, H * 0.2, W * 0.12, H * 0.12, '#7ad1ff'); B(W * 0.62, H * 0.21, 2, 2, '#ffffff');
    B(3, H * 0.05, 7, H * 0.33, '#ff5a6e'); B(6, 0, 3, H * 0.1, '#ff5a6e'); B(5, H * 0.56, W - 16, 2, lv > 1 ? '#ff8a3d' : '#4a3d5f');
    B(W * 0.3, H * 0.4, W * 0.2, H * 0.28, shade(col, -0.15)); B(W * 0.3, H * 0.4, 1, H * 0.28, shade(col, -0.4));
    B(W * 0.22, H * 0.78, 5, 4, '#5a5a66'); B(W * 0.6, H * 0.78, 5, 4, '#5a5a66'); B(8, H * 0.78, 2, H * 0.2, '#2a2238'); B(W - 16, H * 0.78, 2, H * 0.2, '#2a2238'); B(6, H - 2, 6, 2, '#2a2238'); B(W - 18, H - 2, 6, 2, '#2a2238');
    outline(c); res = { cv: c, ax: (W + 2) / 2, ay: H + 1, exhaust: [[3, H * 0.5], [3, H * 0.66]] };
  }
  CACHE.set(key, res); return res;
}
/* draw a ship at world (x, y) = landing-gear point; flame on for take-off/flight */
export function drawShip(g, view, cls, level, x, y, t = 0, flame = false, flip = false) {
  const P = pen(g, view); const sp = shipSprite(cls, level);
  if (flame) {
    const f = Math.floor(t * 30) % 2;
    for (const [ex, ey] of sp.exhaust) {
      const wx = flip ? x + (sp.ax - ex) : x - sp.ax + ex; const wy = y - sp.ay + ey; const d = flip ? 1 : -1;
      P.rect(wx + d * 4 - 2, wy - 2, 4, 4, '#ffb347'); P.rect(wx + d * (8 + f * 2) - 1, wy - 1, 3, 3, '#ff8a3d'); P.rect(wx + d * (11 + f * 3), wy, 2, 2, '#ffe066');
    }
  }
  P.sprite(sp.cv, x, y, sp.ax, sp.ay, flip);
}

/* ---------- ores ---------- */
/* Each shape maps (u, v) in [-1, 1] (v down) to a light level 0..1 or -1 for empty. Light comes from the top-left. */
const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) { const [xi, yi] = pts[i]; const [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const radial = (u, v, r) => { const d = Math.hypot(u, v) / r; return 0.5 - (u + v) * 0.45 / r + (1 - d) * 0.25; };
function shardAt(u, v, cx, w, top, bot, lean) {
  // a pointed hexagonal crystal: point at `top`, flat-ish base at `bot`
  const k = (v - top) / (bot - top); if (k < 0 || k > 1) return -1;
  const x = u - cx - lean * (1 - k); const half = k < 0.3 ? w * (k / 0.3) : w;
  if (Math.abs(x) > half) return -1;
  return x < -half * 0.25 ? 0.82 : x < half * 0.2 ? 0.6 : 0.25;
}
const SHAPE_FN = {
  orb: (u, v) => (u * u + v * v <= 0.72 ? radial(u, v, 0.85) + ((u + 0.32) ** 2 + (v + 0.32) ** 2 < 0.03 ? 0.6 : 0) : -1),
  nugget: (u, v, sd) => { const a = Math.atan2(v, u); const r = 0.72 + 0.13 * Math.sin(3 * a + sd) + 0.07 * Math.sin(5 * a + sd * 2); const q = Math.hypot(u, v * 1.18); if (q > r) return -1; const facet = Math.sin(a * 3 + sd) > 0.6 ? 0.12 : 0; return radial(u, v, r) + facet; },
  blob: (u, v, sd) => { const a = Math.atan2(v, u); const r = 0.68 + 0.08 * Math.sin(2 * a + sd); const drip = Math.abs(u - 0.25) < 0.12 && v > 0 && v < 0.88 ? 1 : 0; if (Math.hypot(u, v * 1.1) > r && !drip) return -1; return drip && Math.hypot(u, v * 1.1) > r ? 0.4 : radial(u, v, r) + ((u + 0.28) ** 2 + (v + 0.3) ** 2 < 0.02 ? 0.6 : 0); },
  egg: (u, v) => { const k = v < 0 ? 0.55 : 0.68; if ((u / k) ** 2 + (v / 0.88) ** 2 > 1) return -1; return radial(u, v, 0.8); },
  bubble: (u, v) => { const bs = [[-0.2, 0.1, 0.55], [0.38, -0.32, 0.36], [0.42, 0.45, 0.28]]; for (const [x, y, r] of bs) { const d = Math.hypot(u - x, v - y); if (d <= r) { const rim = d > r * 0.72; const hl = Math.hypot(u - x + r * 0.4, v - y + r * 0.4) < r * 0.22; return hl ? 1 : rim ? 0.62 - (u - x + v - y) * 0.3 / r : 0.42; } } return -1; },
  shard: (u, v) => shardAt(u, v, 0, 0.32, -0.95, 0.85, 0.15),
  cluster: (u, v) => { const a = shardAt(u, v, 0.05, 0.22, -0.95, 0.85, 0.05); if (a >= 0) return a; const b = shardAt(u, v, -0.45, 0.17, -0.45, 0.85, -0.25); if (b >= 0) return b; const c = shardAt(u, v, 0.5, 0.17, -0.3, 0.85, 0.25); if (c >= 0) return c; return v > 0.62 && v < 0.9 && Math.abs(u) < 0.85 ? 0.12 : -1; },
  geode: (u, v, sd) => { const d = Math.hypot(u, v * 1.1); if (d > 0.88) return -1; if (d > 0.62) return -2 - radial(u, v, 0.9); const a = Math.atan2(v, u); const spike = (Math.sin(a * 9 + sd) * 0.5 + 0.5) * 0.18; if (d > 0.44 + spike) return 0.55 + (Math.sin(a * 9 + sd) > 0 ? 0.25 : 0); return d < 0.2 ? 0.2 : 0.95 - d; },
  ring: (u, v) => { const d = Math.hypot(u, v * 1.25); if (d > 0.86 || d < 0.44) return -1; const a = Math.atan2(v, u); return 0.55 - Math.sin(a + 0.8) * 0.35 + (d < 0.58 ? -0.15 : 0); },
  spiral: (u, v) => { const d = Math.hypot(u, v); if (d > 0.9) return -1; const a = Math.atan2(v, u); let best = 9; for (let k = -1; k < 4; k += 1) { const rr = (a + Math.PI + k * 2 * Math.PI) / (2 * Math.PI) * 0.26; best = Math.min(best, Math.abs(d - rr)); } return best < 0.11 && d > 0.06 ? 0.4 + (1 - d) * 0.5 - (best > 0.06 ? 0.15 : 0) : -1; },
  cube: (u, v) => { const T = [[0, -0.88], [0.8, -0.46], [0, -0.04], [-0.8, -0.46]]; const L = [[-0.8, -0.46], [0, -0.04], [0, 0.88], [-0.8, 0.44]]; const Rf = [[0.8, -0.46], [0.8, 0.44], [0, 0.88], [0, -0.04]]; if (inPoly(T, u, v)) return 0.95; if (inPoly(L, u, v)) return 0.58; if (inPoly(Rf, u, v)) return 0.22; return -1; },
  ingot: (u, v) => { const T = [[-0.5, -0.45], [0.75, -0.45], [0.55, -0.1], [-0.75, -0.1]]; const F = [[-0.75, -0.1], [0.55, -0.1], [0.62, 0.55], [-0.88, 0.55]]; const Sd = [[0.55, -0.1], [0.75, -0.45], [0.88, 0.2], [0.62, 0.55]]; if (inPoly(T, u, v)) return 0.95; if (inPoly(F, u, v)) return v < 0.05 ? 0.75 : 0.55; if (inPoly(Sd, u, v)) return 0.22; return -1; },
  star: (u, v) => { const a = Math.atan2(v, u) + Math.PI / 2; const k = ((a / (2 * Math.PI)) * 5 % 1 + 1) % 1; const r = 0.38 + 0.55 * Math.abs(1 - 2 * k) ** 1.6; const d = Math.hypot(u, v); if (d > r) return -1; return d < 0.22 ? 0.95 : (k < 0.5 ? 0.7 : 0.35) - v * 0.15; },
  flake: (u, v) => { const d = Math.hypot(u, v); if (d > 0.92) return -1; if (d < 0.18) return 0.9; for (let i = 0; i < 6; i += 1) { const a = i * Math.PI / 3; const x = u * Math.cos(a) + v * Math.sin(a); const y = -u * Math.sin(a) + v * Math.cos(a); if (x > 0 && Math.abs(y) < 0.09) return 0.75 - x * 0.3; if (x > 0.45 && x < 0.8 && Math.abs(Math.abs(y) - (x - 0.45) * 0.9) < 0.08) return 0.55; } return -1; },
  tooth: (u, v) => { const k = (v + 0.92) / 1.8; if (k < 0 || k > 1) return -1; const cx = -0.25 + (1 - k) * (1 - k) * 0.5; const w = 0.06 + k * 0.5; const x = u - cx; if (Math.abs(x) > w) return -1; return x < -w * 0.2 ? 0.85 : 0.4 - k * 0.1; },
  coin: (u, v) => { const d = Math.hypot(u, v * 1.5); if (d > 0.88 && !(Math.hypot(u, (v - 0.12) * 1.5) <= 0.88)) return -1; if (d > 0.88) return 0.15; if (d > 0.7) return 0.75 - (u + v) * 0.2; return (Math.abs(u) < 0.12 && Math.abs(v) < 0.3) ? 0.95 : 0.55; },
};
/* oreSprite(spec, size) -> size x size canvas (cached). spec from oreSpriteSpec(ore): { palette (dark->light), shape, sparkle 0..1, seed } */
export function oreSprite(spec, size = 16) {
  const S = Math.max(5, Math.round(size)); const pal = (spec && spec.palette) || ['#4a3a2a', '#8a7a5a', '#c8b88a', '#fff4d0'];
  const shape = SHAPE_FN[spec && spec.shape] ? spec.shape : 'nugget'; const sp = (spec && spec.sparkle) || 0; const sd = hash((spec && spec.seed) || shape) % 7;
  const key = `o|${pal.join('')}|${shape}|${S}|${sp}|${sd}`; let cv = CACHE.get(key); if (cv) return cv;
  const [c, g] = mkCv(S, S); const fn = SHAPE_FN[shape];
  const rock = mix(pal[0], '#5a5260', 0.55);
  const col = (l) => { if (l <= -2) { const k = -l - 2; return k > 0.55 ? shade(rock, 0.2) : k > 0.35 ? rock : shade(rock, -0.3); } if (l < 0.3) return pal[0]; if (l < 0.62) return pal[1]; if (l < 0.88 || pal.length < 4) return pal[2] || pal[1]; return pal[3]; };
  const inner = S - 2; const lit = [];
  for (let y = 0; y < inner; y += 1) for (let x = 0; x < inner; x += 1) {
    const u = ((x + 0.5) / inner) * 2 - 1; const v = ((y + 0.5) / inner) * 2 - 1; const l = fn(u, v, sd);
    if (l === -1) continue; g.fillStyle = col(l); g.fillRect(x + 1, y + 1, 1, 1); if (l > 0.85) lit.push([x + 1, y + 1]);
  }
  outline(c, shade(pal[0], -0.55));
  const n = Math.round(sp * (S >= 14 ? 3 : 1)); const R = rng(hash(key));
  for (let i = 0; i < n && lit.length; i += 1) { const [x, y] = lit[Math.floor(R() * lit.length)]; g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); if (S >= 16) { g.globalAlpha = 0.7; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1); g.globalAlpha = 1; } }
  CACHE.set(key, c); return c;
}
/* oreSprite plus animated twinkles (and a glow for mythic ore), centred at world (x, y); size in art pixels */
export function drawOre(g, view, spec, x, y, size = 16, t = 0) {
  const P = pen(g, view); const im = oreSprite(spec, size); const sp = spec.sparkle || 0;
  if (sp >= 1) { g.globalAlpha = 0.18 + 0.08 * Math.sin(t * 3); P.disc(x, y, size * 0.75, spec.palette[spec.palette.length - 2]); g.globalAlpha = 1; }
  P.sprite(im, x, y, im.width / 2, im.height / 2);
  const n = Math.ceil(sp * 2); const sd = hash(spec.seed || 'o');
  for (let i = 0; i < n; i += 1) {
    const ph = (t * (0.6 + i * 0.25) + h(sd, i)) % 1; if (ph > 0.3) continue; const a = 1 - Math.abs(ph - 0.15) / 0.15;
    const px = x + (h(sd, i + 9) - 0.5) * size * 0.7; const py = y + (h(sd, i + 19) - 0.5) * size * 0.7; const L = 1 + Math.round(a * size * 0.12);
    g.globalAlpha = a; P.rect(px - L, py, L * 2 + 1, 1, '#ffffff'); P.rect(px, py - L, 1, L * 2 + 1, '#ffffff'); g.globalAlpha = 1;
  }
}
const h = (sd, i) => { let x = Math.imul(sd ^ (i * 374761393), 2246822519); x ^= x >>> 13; return ((x >>> 0) % 1000) / 1000; };

/* a little ore pile on the ground at world (x, y=ground) */
export function drawPile(g, view, x, y, amt, color, maxH = 24) {
  const P = pen(g, view); const hgt = Math.max(2, Math.min(maxH, 3 + Math.sqrt(amt) * 1.3)); const w = 7 + Math.min(8, hgt * 0.35);
  for (let q = 0; q < hgt; q += 1) { const ww = w * (1 - q / hgt) + 1; P.rect(x - ww, y - q - 1, ww * 2, 1, q % 4 === 0 ? shade(color, -0.25) : (q % 4 === 2 ? shade(color, 0.12) : color)); }
  return hgt;
}
export function crateSprite(col) {
  const key = `c|${col}`; let cv = CACHE.get(key); if (cv) return cv;
  const [c, g] = mkCv(12, 9); const B = (x, y, w, hh, cl) => { g.fillStyle = cl; g.fillRect(x, y, w, hh); };
  B(1, 1, 10, 7, '#7a5230'); B(1, 1, 10, 1, '#9a7046'); B(1, 4, 10, 2, col); B(5, 1, 1, 7, '#5a3a20'); outline(c); CACHE.set(key, c); return c;
}
