/* The mine view: the colony's region on top, the lift, yard, conveyor and pads on the surface,
 * and one gallery per shaft underground. Everything moves from rates() and ship timings; nothing here
 * decides outcomes. Pixel art is drawn into a small buffer at 1 world unit = 1 pixel and upscaled by an
 * integer factor (the zoom), then crisp labels are drawn on top at screen resolution. */
import { drawScene, drawWeather, pen, drawOre, drawShip, drawPile, shipSprite } from './pixel/index.js';
import { oreSpriteSpec, color } from '/shared/planet/index.js';
import { minerImg, clamp, fmt, hash } from './util.js';
import { prefs } from './juice.js';

export const L = { LV: 34, G0: 8, GH: 24, GX0: 8, GLEN: 168, YARD_X: 26, CONV_X0: 38, PAD_X0: 76, PAD_W: 68, LAYER_H: 136 };
export const galleryTop = (k) => L.G0 + k * L.LV;
export const padX = (i) => L.PAD_X0 + i * L.PAD_W + L.PAD_W / 2;
const MAXZ = 6;

const specCache = new Map();
const specOf = (ore) => { let s = specCache.get(ore.id + ore.color); if (!s) { s = oreSpriteSpec(ore); specCache.set(ore.id + ore.color, s); } return s; };
const shipLvl = (lvl) => Math.min(9, Math.floor((lvl || 0) / 4));

export function createMine(canvas, get, hooks = {}) {
  const g = canvas.getContext('2d');
  const buf = document.createElement('canvas');
  const bg = buf.getContext('2d');
  let dpr = 1, z = 3, P = 3; // z: css px per art px; P: device px per art px
  const cam = { x: -40, y: -80, homed: false };
  let pops = [], hits = [], dust = [];
  let lastLaunch = new Map();

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    if (!cam.homed) home();
    setZoom(z);
  }
  function setZoom(nz, ax, ay) {
    const old = P;
    z = clamp(Math.round(nz), 1, MAXZ);
    P = Math.max(1, Math.round(z * dpr));
    if (ax != null && old !== P) {
      // keep the world point under the cursor still
      const wx = cam.x + ax / old, wy = cam.y + ay / old;
      cam.x = wx - ax / P; cam.y = wy - ay / P;
    }
    clampCam();
  }
  function viewW() { return canvas.width / P; }
  function viewH() { return canvas.height / P; }
  function home() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    z = clamp(Math.floor(r.width / 220), 2, 4);
    if (r.height < 260) z = 2;
    P = Math.max(1, Math.round(z * dpr));
    const vw = canvas.width / P;
    cam.x = Math.min(-30, (L.GX0 + L.GLEN + 20 - vw) / 2 - 10);
    if (vw > 330) cam.x = -60;
    cam.y = -viewH() * 0.38;
    cam.homed = true;
    clampCam();
  }
  function bounds() {
    const st = get();
    const c = st && st.colony;
    const n = c ? c.shafts.length : 1;
    const slots = c ? Math.max(c.pads, 1) + Math.max(0, c.ships.length - c.pads) : 1;
    return { x0: -90, x1: Math.max(L.GX0 + L.GLEN + 40, L.PAD_X0 + slots * L.PAD_W + 40), y0: -220, y1: galleryTop(n + 1) + 30 };
  }
  function clampCam() {
    const b = bounds(), vw = viewW(), vh = viewH();
    cam.x = vw >= b.x1 - b.x0 ? b.x0 - (vw - (b.x1 - b.x0)) / 2 : clamp(cam.x, b.x0, b.x1 - vw);
    cam.y = vh >= b.y1 - b.y0 ? b.y0 : clamp(cam.y, b.y0, b.y1 - vh);
  }
  // world -> css px relative to the canvas
  const toCss = (wx, wy) => ({ x: (wx - Math.round(cam.x)) * P / dpr, y: (wy - Math.round(cam.y)) * P / dpr });

  // ---------------------------------------------------------------- drawing
  function frame() {
    const st = get();
    if (!st || !st.colony || !canvas.width) return;
    const { planet, region, colony: c, rates: R, bneck, now, unl } = st;
    const t = performance.now() / 1000;
    const bw = Math.ceil(canvas.width / P), bh = Math.ceil(canvas.height / P);
    if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
    const view = { x: Math.round(cam.x), y: Math.round(cam.y), scale: 1, w: bw, h: bh };
    drawScene(bg, planet, region, view, t, { layerH: L.LAYER_H, weather: false });
    const Pn = pen(bg, view);
    const ores = Object.fromEntries(planet.ores.map((o) => [o.id, o]));
    const look = st.look;
    hits = [];

    // --- underground
    const n = c.shafts.length;
    const bottom = galleryTop(Math.max(0, n - 1)) + L.GH + 3;
    // lift shaft column
    Pn.rect(-8, 0, 16, bottom, '#0d0814');
    Pn.rect(-8, 0, 2, bottom, '#5a3e26'); Pn.rect(6, 0, 2, bottom, '#5a3e26');
    for (let y = 4; y < bottom; y += 10) Pn.rect(-6, y, 12, 1, '#2a1c14');
    const mineFlow = Math.min(R.minePerMin, R.liftPerMin);
    for (let k = 0; k < n; k++) drawGallery(Pn, bg, view, c, c.shafts[k], R.shafts[k], ores, t, look);
    // next shaft placeholder
    if (unl.panels.includes('shafts') && n < 30) {
      const y0 = galleryTop(n), x0 = L.GX0, x1 = L.GX0 + L.GLEN;
      const dash = Math.floor(t * 8) % 6;
      for (let x = x0 + dash; x < x1; x += 6) { Pn.rect(x, y0, 3, 1, 'rgba(255,210,63,0.7)'); Pn.rect(x, y0 + L.GH - 1, 3, 1, 'rgba(255,210,63,0.7)'); }
      for (let y = y0; y < y0 + L.GH; y += 6) { Pn.rect(x1 - 1, y, 1, 3, 'rgba(255,210,63,0.7)'); }
      hits.push({ kind: 'dig', x0, x1, y0, y1: y0 + L.GH });
    }
    // lift cage
    const depthY = galleryTop(Math.max(0, deepestActive(c, R))) + L.GH - 3;
    const liftV = mineFlow > 0 ? clamp(25 + Math.sqrt(R.liftPerMin) * 6, 25, 160) : 0;
    let cageY = -2;
    if (liftV > 0) {
      const span = depthY + 2, period = 2 * span / liftV;
      const ph = (t % period) / period;
      cageY = ph < 0.5 ? depthY - ph * 2 * span : -2 + (ph - 0.5) * 2 * span;
    }
    const goingUp = liftV > 0 && ((t % (2 * (depthY + 2) / liftV)) / (2 * (depthY + 2) / liftV)) < 0.5;
    // --- surface
    drawWinch(Pn, t);
    Pn.line(0, -44, 0, cageY - 12, '#2a2a33', 1);
    drawCage(Pn, cageY, goingUp ? topOreColor(c.tunnel, ores) : null);
    drawHeadframe(Pn, t, liftV);
    // yard
    const yardAmt = sum(c.yard);
    Pn.rect(L.YARD_X - 14, -1, 28, 1, '#3a2a20');
    for (let x = L.YARD_X - 14; x <= L.YARD_X + 14; x += 7) Pn.rect(x, -5, 1, 5, '#6a4a2a');
    Pn.rect(L.YARD_X - 14, -4, 29, 1, '#6a4a2a');
    if (yardAmt > 0.5) drawPile(bg, view, L.YARD_X, 0, yardAmt * 4, topOreColor(c.yard, ores), 22);
    if (R.yardCap && yardAmt > R.yardCap * 0.9 && Math.floor(t * 3) % 2) Pn.rect(L.YARD_X - 2, -30, 4, 4, '#ff5a6e');
    // conveyor + pads
    const loading = c.ships.filter((s) => s.state === 'loading');
    const flowing = yardAmt > 0.01 && loading.length > 0;
    const convEnd = L.PAD_X0 + Math.max(1, c.pads) * L.PAD_W - 8;
    drawConveyor(Pn, L.CONV_X0, convEnd, t, flowing ? clamp(10 + R.conveyorPerPad * 0.15, 10, 50) : 0, flowing ? topOreColor(c.yard, ores) : null);
    for (let i = 0; i < c.pads; i++) drawPad(Pn, padX(i), t, i);
    // ships
    drawShips(bg, view, Pn, c, now, t, loading);
    // dust
    if (!prefs.reduced) {
      dust = dust.filter((d) => t - d.t0 < 1.2);
      for (const d of dust) { const a = 1 - (t - d.t0) / 1.2; bg.globalAlpha = a * 0.7; Pn.rect(d.x + d.vx * (t - d.t0), d.y - 6 * (t - d.t0), 2, 2, '#d8c8b0'); }
      bg.globalAlpha = 1;
      drawWeather(bg, planet, region, view, t);
    }

    // --- upscale
    g.imageSmoothingEnabled = false;
    g.drawImage(buf, 0, 0, bw * P, bh * P);

    // --- crisp overlay (device px)
    const S = (wx, wy) => ({ x: (wx - view.x) * P, y: (wy - view.y) * P });
    const fs = Math.round(clamp(3.4 * z, 9, 13) * dpr);
    g.textBaseline = 'top';
    if (z >= 2) {
      label(g, S(0, -64), 'LIFT', fs, 'center');
      label(g, S(L.YARD_X, -32), 'YARD', fs, 'center');
      label(g, S(padX(0), -50), c.pads > 1 ? 'LAUNCH PADS' : 'LAUNCH PAD', fs, 'center');
    }
    for (let k = 0; k < n; k++) badge(g, S, c.shafts[k], R.shafts[k], fs, ores);
    if (unl.panels.includes('shafts') && n < 30) {
      const p = S(L.GX0 + 6, galleryTop(n) + 7);
      g.font = `${fs}px Silkscreen, monospace`;
      g.fillStyle = 'rgba(255,210,63,0.95)';
      g.fillText(`+ DIG SHAFT ${n + 1}` + (st.digCost != null ? `  ·  ${fmt(st.digCost)}` : ''), p.x, p.y);
    }
    // cargo bars over loading ships
    loading.forEach((s, i) => {
      const cap = R.ships.find((x) => x.id === s.id)?.cap || 1;
      const p = S(padX(i) - 14, -44 - (s.cls === 'freighter' ? 6 : 0));
      const w = 28 * P, f = clamp(sum(s.cargo) / cap, 0, 1);
      g.fillStyle = 'rgba(10,6,16,0.8)'; g.fillRect(p.x - dpr, p.y - dpr, w + 2 * dpr, 4 * dpr + 2 * dpr);
      g.fillStyle = '#5ee6a8'; g.fillRect(p.x, p.y, w * f, 4 * dpr);
    });
    // floating numbers
    pops = pops.filter((p) => t - p.t0 < 1.6);
    for (const p of pops) {
      const a = t - p.t0, q = S(p.x, p.y - (prefs.reduced ? 0 : a * 22));
      g.globalAlpha = clamp(1.6 - a, 0, 1);
      g.font = `bold ${Math.round(fs * 1.5)}px VT323, monospace`;
      g.textAlign = 'center';
      g.fillStyle = '#140c1c'; g.fillText(p.text, q.x + 2 * dpr, q.y + 2 * dpr);
      g.fillStyle = p.color; g.fillText(p.text, q.x, q.y);
      g.textAlign = 'left'; g.globalAlpha = 1;
    }
    // bottleneck marker
    if (bneck && bneck.stage !== 'mine') {
      const w = markerPos(bneck, c);
      const q = S(w.x, w.y);
      const bob = prefs.reduced ? 0 : Math.sin(t * 5) * 3 * dpr;
      const sz = Math.round(clamp(7 * z, 16, 26) * dpr);
      g.fillStyle = '#140c1c'; g.fillRect(q.x - sz / 2 + 2 * dpr, q.y - sz + bob + 2 * dpr, sz, sz);
      g.fillStyle = Math.floor(t * 2) % 2 ? '#ffd23f' : '#ffb347'; g.fillRect(q.x - sz / 2, q.y - sz + bob, sz, sz);
      g.fillStyle = '#140c1c'; g.font = `bold ${Math.round(sz * 0.9)}px Silkscreen, monospace`; g.textAlign = 'center';
      g.fillText('!', q.x, q.y - sz + bob + sz * 0.08); g.textAlign = 'left';
      hits.unshift({ kind: 'bneck', sx0: q.x - sz, sx1: q.x + sz, sy0: q.y - sz * 1.6, sy1: q.y + sz * 0.4 });
    }
    if (hooks.after) hooks.after(toCss);
  }

  function drawGallery(Pn, bg, view, c, s, r, ores, t, look) {
    const k = s.idx, y0 = galleryTop(k), y1 = y0 + L.GH, x0 = L.GX0, x1 = L.GX0 + L.GLEN;
    if (y1 < view.y - 4 || y0 > view.y + view.h + 4) { hits.push({ kind: 'shaft', id: s.id, x0: x0 - 10, x1, y0, y1 }); return; }
    const ore = ores[s.ore];
    const exhausted = s.vein && s.vein.left <= 0;
    const ok = r ? r.ok : true;
    const H = hash(s.id);
    // carve
    Pn.rect(-6, y0 + 4, x0 + 8, L.GH - 4, '#1b1226');
    Pn.rect(x0, y0 - 1, L.GLEN + 1, L.GH + 2, '#120a18');
    Pn.rect(x0, y0, L.GLEN, L.GH, '#21162e');
    for (let i = 0; i < 14; i++) { const hx = x0 + ((H >> (i % 16)) * 7 + i * 37) % L.GLEN; const hy = y0 + 2 + (i * 5 + (H >> 3)) % (L.GH - 8); Pn.rect(hx, hy, 2, 1, '#2c1f3a'); }
    // floor + rails
    Pn.rect(x0, y1 - 3, L.GLEN, 3, '#3b2b2a');
    for (let x = x0 + 2; x < x1 - 16; x += 4) Pn.rect(x, y1 - 3, 2, 1, '#5a3e26');
    Pn.rect(x0, y1 - 4, L.GLEN - 16, 1, '#9aa0aa');
    // supports + lamps
    for (let x = x0 + 24; x < x1 - 20; x += 34) {
      Pn.rect(x, y0, 2, L.GH - 3, '#6a4a2a'); Pn.rect(x - 3, y0, 8, 2, '#7a5634');
      const fl = prefs.reduced ? 0.25 : 0.2 + 0.08 * Math.sin(t * 9 + x);
      bg.globalAlpha = fl; Pn.disc(x + 1, y0 + 4, 6, '#ffd27a'); bg.globalAlpha = 1;
      Pn.rect(x + 1, y0 + 3, 1, 2, '#ffe9a8');
    }
    // ore face
    const faceCol = color.shade('#3a2a44', -0.1);
    Pn.rect(x1 - 16, y0, 16, L.GH, faceCol);
    for (let y = y0; y < y1; y += 3) Pn.rect(x1 - 17 - ((y * 7 + H) % 3), y, 2, 3, faceCol);
    if (ore && !exhausted) {
      const sp = specOf(ore);
      const pct = s.vein ? s.vein.left / Math.max(1, s.vein.total) : 1;
      const cnt = s.vein ? Math.max(1, Math.ceil(pct * 4)) : 4;
      const spots = [[x1 - 8, y0 + 6, 11], [x1 - 7, y0 + 17, 10], [x1 - 15, y0 + 12, 9], [x1 - 14, y0 + 20, 7]];
      for (let i = 0; i < cnt; i++) drawOre(bg, view, sp, spots[i][0], spots[i][1], spots[i][2], t);
      // flecks in the walls
      for (let i = 0; i < 5; i++) { const fx = x0 + 12 + ((H >> i) * 13 + i * 31) % (L.GLEN - 40); Pn.rect(fx, i % 2 ? y0 + 1 : y1 - 6, 2, 1, ore.color); }
    } else if (exhausted) {
      for (let i = 0; i < 6; i++) Pn.rect(x1 - 14 + (i * 5) % 12, y1 - 4 - (i % 3) * 3, 4, 3, '#5a5260');
    }
    // cart
    const miners = s.miners || 0;
    const shown = Math.min(miners, 6);
    const stop = x1 - 26 - shown * 11;
    if (ok && r && r.orePerMin > 0) {
      const T = clamp(9 - Math.log2(1 + r.orePerMin / 10), 3, 9);
      const ph = ((t / T) + (H % 100) / 100) % 1;
      const xa = x0 + 4, xb = Math.max(xa + 10, stop);
      let cx, loaded;
      if (ph < 0.42) { cx = xb - (xb - xa) * (ph / 0.42); loaded = true; } else if (ph < 0.5) { cx = xa; loaded = false; } else if (ph < 0.92) { cx = xa + (xb - xa) * ((ph - 0.5) / 0.42); loaded = false; } else { cx = xb; loaded = true; }
      drawCart(Pn, cx, y1 - 4, loaded && ore ? ore.color : null);
    } else drawCart(Pn, x0 + 6, y1 - 4, null);
    // miners
    for (let i = 0; i < shown; i++) {
      const mx = x1 - 26 - i * 11;
      const fr = ok ? Math.floor(t * 5 + i * 0.7 + (H % 7)) % 3 : 0;
      Pn.sprite(minerImg(look, ok ? 'swing' : 'walk', fr), mx, y1 - 3, 12, 24);
      if (ok && fr === 1 && ore && !prefs.reduced) { Pn.rect(mx + 9, y1 - 11, 1, 1, ore.color); Pn.rect(mx + 11, y1 - 13, 1, 1, '#ffffff'); }
    }
    if (!ok) { bg.globalAlpha = 0.35; Pn.rect(x0, y0, L.GLEN, L.GH, '#000000'); bg.globalAlpha = 1; }
    hits.push({ kind: 'shaft', id: s.id, x0: x0 - 10, x1, y0, y1 });
  }

  function badge(g, S, s, r, fs, ores) {
    const y0 = galleryTop(s.idx);
    const p = S(L.GX0 + 4, y0 + 2);
    if (p.y > canvas.height || p.y < -40) return;
    const ore = ores[s.ore];
    g.font = `${fs}px Silkscreen, monospace`;
    const line1 = `${s.name.toUpperCase()}`;
    const line2 = r && !r.ok ? r.reason.toUpperCase() : `${s.miners}/${r ? r.cap : '?'} MINERS  C${s.up.cart} B${s.up.bunk}`;
    const w = Math.max(g.measureText(line1).width, g.measureText(line2).width) + 10 * dpr;
    const h = fs * 2 + 10 * dpr + (s.vein ? 6 * dpr : 0);
    g.fillStyle = 'rgba(12,7,20,0.72)'; g.fillRect(p.x, p.y, w, h);
    g.fillStyle = ore ? ore.color : '#fff'; g.fillRect(p.x, p.y, 2 * dpr, h);
    g.fillStyle = '#f4edff'; g.fillText(line1, p.x + 6 * dpr, p.y + 3 * dpr);
    g.fillStyle = r && !r.ok ? '#ff5a6e' : '#b3a5d3'; g.fillText(line2, p.x + 6 * dpr, p.y + fs + 5 * dpr);
    if (s.vein) {
      const pct = s.vein.left / Math.max(1, s.vein.total);
      const bw = w - 12 * dpr, by = p.y + fs * 2 + 8 * dpr;
      g.fillStyle = '#2a2040'; g.fillRect(p.x + 6 * dpr, by, bw, 3 * dpr);
      g.fillStyle = pct <= 0 ? '#5a5260' : pct <= 0.05 ? '#ff5a6e' : pct <= 0.2 ? '#ffb347' : '#5ee6a8';
      g.fillRect(p.x + 6 * dpr, by, bw * clamp(pct, 0, 1), 3 * dpr);
    }
  }

  function drawShips(bg, view, Pn, c, now, t, loading) {
    const padOf = new Map();
    loading.slice().sort((a, b) => (a.dockedAt || 0) - (b.dockedAt || 0)).forEach((s, i) => padOf.set(s.id, i));
    let park = 0;
    const freePads = [];
    for (let i = 0; i < c.pads; i++) if (![...padOf.values()].includes(i)) freePads.push(i);
    c.ships.forEach((s) => {
      const lv = shipLvl(s.lvl);
      if (s.state === 'loading') { drawShip(bg, view, s.cls, lv, padX(padOf.get(s.id) ?? 0), -2, t, false); return; }
      if (s.state === 'home') {
        const x = freePads.length ? padX(freePads.shift()) : padX(c.pads) + 10 + park++ * 60;
        drawShip(bg, view, s.cls, lv, x, -2, t, false); return;
      }
      const spot = padX(c.ships.indexOf(s) % Math.max(1, c.pads));
      if (s.state === 'out' && s.departAt != null) {
        const el = (now - s.departAt) / 1000;
        if (el < 0 || el > 7) return;
        if (!lastLaunch.has(s.id + s.departAt)) {
          lastLaunch.set(s.id + s.departAt, 1);
          if (lastLaunch.size > 50) lastLaunch.delete(lastLaunch.keys().next().value);
          for (let i = 0; i < 10; i++) dust.push({ x: spot + (i - 5) * 4, y: -2, vx: (i - 5) * 3, t0: t });
        }
        drawShip(bg, view, s.cls, lv, spot + el * el * 3, -2 - el * el * 9, t, true);
      } else if (s.state === 'back' && s.homeAt != null) {
        const rem = (s.homeAt - now) / 1000;
        if (rem < 0 || rem > 5) return;
        const x = padX(c.pads) + 10 + park * 60;
        drawShip(bg, view, s.cls, lv, x - rem * 6, -2 - rem * rem * 10, t, true, true);
      }
    });
  }

  function deepestActive(c, R) {
    let d = 0;
    c.shafts.forEach((s, i) => { if (R.shafts[i] && R.shafts[i].orePerMin > 0) d = Math.max(d, s.idx); });
    return d;
  }

  function markerPos(b, c) {
    switch (b.stage) {
      case 'lift': return { x: 0, y: -80 };
      case 'yard': return { x: L.YARD_X, y: -36 };
      case 'conveyor': return { x: (L.CONV_X0 + padX(0)) / 2, y: -26 };
      case 'ships': return { x: padX(0), y: -58 };
      case 'blocked': { const s = c.shafts.find((x) => x.id === b.shaft?.id) || c.shafts.find((x) => x.vein && x.vein.left <= 0) || c.shafts[0]; return { x: L.GX0 + L.GLEN - 30, y: galleryTop(s ? s.idx : 0) + 2 }; }
      default: return { x: L.GX0 + L.GLEN - 30, y: galleryTop(0) + 2 };
    }
  }

  // ---------------------------------------------------------------- input
  const ptrs = new Map();
  let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = canvas.getBoundingClientRect();
      const ax = ((a.x + b.x) / 2 - r.left) * dpr, ay = ((a.y + b.y) / 2 - r.top) * dpr;
      if (d / pinch.d > 1.3) { setZoom(z + 1, ax, ay); pinch.d = d; } else if (d / pinch.d < 0.77) { setZoom(z - 1, ax, ay); pinch.d = d; }
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) { drag.moved = true; canvas.classList.add('drag'); }
    if (drag.moved) { cam.x = drag.cx - dx * dpr / P; cam.y = drag.cy - dy * dpr / P; clampCam(); }
  });
  const up = (e) => {
    const wasTap = drag && !drag.moved && ptrs.size === 1;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    canvas.classList.remove('drag');
    if (wasTap) tap(e);
    drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 0.6) {
      acc += e.deltaY;
      if (Math.abs(acc) > 60) { setZoom(z + (acc < 0 ? 1 : -1), (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr); acc = 0; }
    } else { cam.x += e.deltaX * dpr / P; clampCam(); }
  }, { passive: false });
  let acc = 0;

  function tap(e) {
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
    const wx = Math.round(cam.x) + sx / P, wy = Math.round(cam.y) + sy / P;
    for (const h of hits) {
      if (h.kind === 'bneck' && sx >= h.sx0 && sx <= h.sx1 && sy >= h.sy0 && sy <= h.sy1) return hooks.onTap?.('bneck', null, e);
    }
    for (const h of hits) {
      if (h.kind === 'bneck') continue;
      if (wx >= h.x0 && wx <= h.x1 && wy >= h.y0 - 3 && wy <= h.y1 + 3) return hooks.onTap?.(h.kind, h.id, e);
    }
    if (wy < 2 && wy > -70 && Math.abs(wx) < 16) return hooks.onTap?.('lift', null, e);
    if (wy < 2 && wy > -40 && Math.abs(wx - L.YARD_X) < 14) return hooks.onTap?.('yard', null, e);
    if (wy < 2 && wy > -60 && wx > L.PAD_X0 - 6) return hooks.onTap?.('ships', null, e);
    if (wy < 2 && wy > -20 && wx > L.CONV_X0 - 4) return hooks.onTap?.('conveyor', null, e);
    hooks.onTap?.('none', null, e);
  }

  new ResizeObserver(() => resize()).observe(canvas);
  resize();

  return {
    frame, resize, home: () => { cam.homed = false; resize(); },
    zoom: (d) => setZoom(z + d, canvas.width / 2, canvas.height / 2),
    pop(wx, wy, text, col = '#ffd23f') { pops.push({ x: wx, y: wy, text, color: col, t0: performance.now() / 1000 }); if (pops.length > 30) pops.shift(); },
    focusShaft(idx) { cam.y = galleryTop(idx) - viewH() * 0.4; clampCam(); },
    toCss, padX, galleryTop,
    worldOf: (stage, c) => ({ lift: { x: 0, y: -48 }, yard: { x: L.YARD_X, y: -14 }, pads: { x: padX(0), y: -40 }, sky: { x: padX(0), y: -90 }, shaft: { x: L.GX0 + 60, y: galleryTop(0) + 12 } }[stage]),
  };
}

// ---------------------------------------------------------------- pieces
const sum = (m) => { let s = 0; for (const k in m || {}) s += m[k] || 0; return s; };
function topOreColor(m, ores) {
  let best = null, bv = 0;
  for (const k in m || {}) if (m[k] > bv && ores[k]) { bv = m[k]; best = ores[k]; }
  return best ? best.color : '#8a7a6a';
}
function label(g, p, text, fs, align) {
  g.font = `${fs}px Silkscreen, monospace`;
  g.textAlign = align;
  g.fillStyle = 'rgba(12,7,20,0.55)';
  const w = g.measureText(text).width;
  g.fillRect(p.x - w / 2 - 4, p.y - 2, w + 8, fs + 4);
  g.fillStyle = 'rgba(244,237,255,0.85)';
  g.fillText(text, p.x, p.y);
  g.textAlign = 'left';
}
function drawCart(P, x, floorY, load) {
  P.rect(x - 5, floorY - 6, 11, 5, '#6a5a4a'); P.rect(x - 5, floorY - 6, 11, 1, '#8a7a6a'); P.rect(x - 5, floorY - 2, 11, 1, '#4a3a2a');
  if (load) { P.rect(x - 4, floorY - 8, 9, 2, load); P.rect(x - 2, floorY - 9, 4, 1, load); }
  P.rect(x - 4, floorY - 1, 2, 2, '#1a1a22'); P.rect(x + 3, floorY - 1, 2, 2, '#1a1a22');
}
function drawCage(P, y, load) {
  P.rect(-6, y - 13, 12, 13, '#7a8494'); P.rect(-5, y - 12, 10, 11, '#2a2a36');
  for (let x = -4; x <= 4; x += 3) P.rect(x, y - 12, 1, 11, '#5a6474');
  P.rect(-6, y - 13, 12, 1, '#aab4c4'); P.rect(-6, y - 1, 12, 1, '#4a5464');
  if (load) { P.rect(-4, y - 5, 8, 4, load); P.rect(-2, y - 7, 4, 2, load); }
}
function drawHeadframe(P, t, v) {
  const wood = '#7a5634', dk = '#4a3220';
  P.line(-13, 0, -2, -46, wood, 2); P.line(13, 0, 2, -46, wood, 2);
  P.line(-13, 0, -24, -18, dk, 1);
  P.rect(-10, -16, 20, 2, wood); P.rect(-6, -32, 12, 2, wood);
  P.line(-10, -16, 6, -32, dk, 1); P.line(10, -16, -6, -32, dk, 1);
  P.rect(-8, -48, 16, 3, dk);
  // wheel
  P.disc(0, -50, 6, '#2a2238'); P.disc(0, -50, 5, '#b8a080'); P.disc(0, -50, 4, '#2a2238');
  const a = v > 0 ? t * v * 0.12 : 0;
  for (let i = 0; i < 4; i++) { const q = a + i * Math.PI / 4; P.line(-Math.cos(q) * 4, -50 - Math.sin(q) * 4, Math.cos(q) * 4, -50 + Math.sin(q) * 4, '#b8a080', 1); }
  P.disc(0, -50, 1, '#ffd23f');
  P.rect(-1, -58, 2, 4, '#5a5a66');
  if (Math.floor(t * 1.5) % 2) P.rect(-1, -59, 2, 2, '#ff5a6e');
}
function drawWinch(P, t) {
  P.rect(-42, -16, 22, 16, '#5a4a5a'); P.rect(-44, -18, 26, 3, '#8a3a3a'); P.rect(-42, -15, 22, 1, '#6a5a6a');
  P.rect(-37, -11, 5, 4, Math.floor(t * 0.7) % 4 ? '#ffd27a' : '#e8b860'); P.rect(-28, -9, 5, 9, '#2a1c14');
  P.line(-20, -12, 0, -48, '#2a2a33', 1);
}
function drawConveyor(P, x0, x1, t, v, load) {
  for (let x = x0 + 4; x < x1; x += 14) P.rect(x, -6, 2, 6, '#3a3a46');
  P.rect(x0, -9, x1 - x0, 3, '#2a2a36'); P.rect(x0, -9, x1 - x0, 1, '#5a5a6a');
  const off = v > 0 ? (t * v) % 6 : 0;
  for (let x = x0 + off; x < x1 - 2; x += 6) P.rect(x, -7, 2, 1, '#14101c');
  if (load) { const o2 = (t * v) % 12; for (let x = x0 + o2; x < x1 - 4; x += 12) P.rect(x, -11, 3, 2, load); }
  P.disc(x0, -7, 2, '#5a5a6a'); P.disc(x1, -7, 2, '#5a5a6a');
}
function drawPad(P, cx, t, i) {
  P.rect(cx - 30, -2, 60, 3, '#5a5a6a'); P.rect(cx - 30, -2, 60, 1, '#8a8a9a');
  for (let x = cx - 30; x < cx + 30; x += 6) P.rect(x, 0, 3, 1, '#ffd23f');
  const on = Math.floor(t * 2 + i) % 2;
  P.rect(cx - 31, -4, 2, 2, on ? '#ff5a6e' : '#5a2a30'); P.rect(cx + 29, -4, 2, 2, on ? '#5a2a30' : '#ff5a6e');
}
export { shipSprite };
