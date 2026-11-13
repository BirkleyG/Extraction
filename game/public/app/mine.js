/* The mine view: the colony's region on top, the lift, yard, conveyor and pads on the surface,
 * and one gallery per shaft underground. Everything moves from rates() and ship timings; nothing here
 * decides outcomes. Pixel art is drawn into a small buffer at 1 world unit = 1 pixel and upscaled by an
 * integer factor (the zoom), then crisp labels are drawn on top at screen resolution. */
import { drawScene, drawWeather, pen, drawOre, drawShip, drawPile, shipSprite, oreSprite } from './pixel/index.js';
import { oreSpriteSpec, color } from '/shared/planet/index.js';
import { minerImg, clamp, fmt, hash } from './util.js';
import { prefs } from './juice.js';
import { REF, drawPlanetRefinery, drawStation } from './refinery-art.js';

export const L = { LV: 34, G0: 8, GH: 24, GX0: 8, GLEN: 168, YARD_X: 26, CONV_X0: 38, PAD_X0: 76, PAD_W: 68, LAYER_H: 136 };
export const galleryTop = (k) => L.G0 + k * L.LV;
export const padX = (i) => L.PAD_X0 + i * L.PAD_W + L.PAD_W / 2;

const specCache = new Map();
const specOf = (ore) => { let s = specCache.get(ore.id + ore.color); if (!s) { s = oreSpriteSpec(ore); specCache.set(ore.id + ore.color, s); } return s; };
const shipLvl = (lvl) => Math.min(9, Math.floor((lvl || 0) / 4));

// Tunnels are drawn to scale: PXM art px per metre. A fixed landing (STATION) sits by the lift; past DUG_MAX metres
// the middle of the tunnel is cut out with a break marker so the face and the rock ahead stay on screen.
const PXM = 4, STATION = 104, DUG_MAX = 40, BREAK = 16;
const ZMAX = 10;
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const gcol = (f) => (f >= 0.85 ? '#ff5a6e' : f >= 0.6 ? '#ffb347' : '#5ee6a8');
const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} KM` : m >= 10 ? `${Math.round(m)} M` : `${Math.max(0, m).toFixed(1)} M`);
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const sum = (m) => { let s = 0; for (const k in m || {}) s += m[k] || 0; return s; };

export function createMine(canvas, get, hooks = {}) {
  const g = canvas.getContext('2d');
  const buf = document.createElement('canvas');
  const bg = buf.getContext('2d');
  let dpr = 1, z = 3, zt = 3, Sc = 3; // z: css px per art px (smooth, fractional); Sc = z * dpr
  const cam = { x: -40, y: -80, homed: false };
  let anchor = null, goal = null; // zoom anchor (keeps a world point under the cursor) and glide target
  let vel = { x: 0, y: 0 }, trail = []; // pan momentum
  const parts = []; // particles (chips, sparks, falling ore, dust)
  const SH = new Map(); // per-shaft visual state
  const SHIP = new Map(); // per-ship smoothed sprite position
  const padMap = new Map(), lastPad = new Map();
  const keys = new Set();
  let rockEnd = 0; // right end of the longest drawn tunnel (camera bounds)
  let hits = [], pops = [], lastLaunch = new Map(), lastT = 0, prevUp = false, flowShown = new Map();
  const maxParts = () => (prefs.reduced ? 40 : 240);
  const emit = (p) => { if (parts.length < maxParts()) parts.push(p); };

  // ---------------------------------------------------------------- camera
  const cssW = () => canvas.width / dpr, cssH = () => canvas.height / dpr;
  function bounds() {
    const st = get();
    const c = st && st.colony;
    const n = c ? c.shafts.length : 1;
    const pads = c ? Math.max(c.pads, 1) : 1;
    return { x0: c?.refinery?.planet ? -124 : -90, x1: Math.max(L.GX0 + L.GLEN + 40, rockEnd + 30, L.PAD_X0 + pads * L.PAD_W + 280), y0: -150, y1: galleryTop(n + 1) + 30 };
  }
  const fitZ = () => { const b = bounds(); return Math.min(cssW() / (b.x1 - b.x0), cssH() / (b.y1 - b.y0)); };
  const zMin = () => Math.max(0.3, Math.min(fitZ(), 1.5) * 0.9);
  function clampXY(x, y, S) {
    const b = bounds(), vw = canvas.width / S, vh = canvas.height / S;
    return {
      x: vw >= b.x1 - b.x0 ? b.x0 - (vw - (b.x1 - b.x0)) / 2 : clamp(x, b.x0, b.x1 - vw),
      y: vh >= b.y1 - b.y0 ? b.y0 : clamp(y, b.y0, b.y1 - vh),
    };
  }
  function clampCam() { const p = clampXY(cam.x, cam.y, Sc); cam.x = p.x; cam.y = p.y; }
  function homeView() {
    const c = get()?.colony;
    const left = c?.refinery?.planet ? 118 : 50;
    const span = L.PAD_X0 + Math.max(1, c ? c.pads : 1) * L.PAD_W + 20 + left;
    let zz = clamp(cssW() / span, 1.8, 4);
    if (cssH() < 260) zz = Math.min(zz, 2);
    const vw = cssW() / zz, vh = cssH() / zz;
    return { z: zz, x: vw > span ? -left - (vw - span) / 2 : -left, y: -vh * 0.46 };
  }
  function fitView() {
    const b = bounds(), zz = clamp(fitZ() * 0.96, zMin(), ZMAX);
    const vw = cssW() / zz;
    return { z: zz, x: b.x0 + ((b.x1 - b.x0) - vw) / 2, y: b.y0 };
  }
  function setView(v, smooth) {
    vel.x = vel.y = 0; anchor = null;
    if (smooth && !prefs.reduced) { zt = v.z; goal = clampXY(v.x, v.y, v.z * dpr); return; }
    z = zt = v.z; Sc = z * dpr; cam.x = v.x; cam.y = v.y; goal = null; clampCam();
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    if (!cam.homed) { setView(innerWidth < 700 ? fitView() : homeView()); cam.homed = true; }
    z = zt = clamp(z, zMin(), ZMAX); Sc = z * dpr; clampCam();
  }
  // zoom toward a device-pixel point (ax, ay)
  function zoomTo(nz, ax, ay) {
    nz = clamp(nz, zMin(), ZMAX);
    goal = null;
    anchor = { ax, ay, wx: cam.x + ax / Sc, wy: cam.y + ay / Sc };
    zt = nz;
    if (prefs.reduced) stepCamera(1);
  }
  function stepCamera(dt) {
    const k = prefs.reduced ? 1 : 1 - Math.exp(-dt * 14);
    if (z !== zt) {
      z = Math.abs(zt - z) < zt * 0.002 ? zt : z + (zt - z) * k;
      Sc = z * dpr;
      if (anchor) { cam.x = anchor.wx - anchor.ax / Sc; cam.y = anchor.wy - anchor.ay / Sc; }
    } else if (anchor) anchor = null;
    if (goal) {
      cam.x += (goal.x - cam.x) * k; cam.y += (goal.y - cam.y) * k;
      if (Math.abs(goal.x - cam.x) + Math.abs(goal.y - cam.y) < 0.2 && z === zt) { cam.x = goal.x; cam.y = goal.y; goal = null; }
    }
    // keyboard pan
    if (keys.size) {
      const sp = 520 / z * dt;
      const dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0), dy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
      if (dx || dy) { cam.x += dx * sp; cam.y += dy * sp; goal = null; anchor = null; vel.x = vel.y = 0; }
    }
    if (vel.x || vel.y) {
      cam.x += vel.x * dt; cam.y += vel.y * dt;
      const d = Math.exp(-dt * 3.4); vel.x *= d; vel.y *= d;
      if (Math.hypot(vel.x, vel.y) < 3) vel.x = vel.y = 0;
    }
    clampCam();
  }

  // ---------------------------------------------------------------- shared per-frame helpers
  function stepShaft(s, r, inf, dt) {
    let o = SH.get(s.id);
    if (!o) { o = { mined: 0, fv: null, f: inf.f, full: false, cph: (hash(s.id) % 100) / 100 * 0.2, last: {}, flash: 0, tossT: 0, pkey: undefined, strike: -9 }; SH.set(s.id, o); }
    o.full = inf.f >= 0.97 || (o.full && inf.f > 0.88);
    o.f += (inf.f - o.f) * Math.min(1, dt * 3);
    const run = inf.active && !o.full;
    o.run = run;
    if (run) o.mined += r.orePerMin / 60 * dt;
    // the drawn face glides after the engine's face; a strike is a new pocket the crew breaks into
    const F = s.face || 0;
    o.fv = o.fv == null || Math.abs(F - o.fv) > 4 ? F : o.fv + (F - o.fv) * Math.min(1, dt * 4);
    const cur = r && r.pocket && !r.blocked ? (s.pk || []).find((p) => p.start <= F + 1e-6 && p.start + p.len > F + 1e-6) : null;
    const key = cur ? cur.ore + '@' + cur.start : null;
    if (o.pkey !== undefined && key && key !== o.pkey) { o.strike = performance.now() / 1000; o.strikeOre = cur.ore; o.burst = true; }
    o.pkey = key;
    // cart cycle: speed follows real rate; parks when idle or when the tunnel is full
    const T = clamp(9 - Math.log2(1 + (r ? r.orePerMin : 0) / 10), 3, 9);
    if (run) {
      const ph0 = o.cph; o.cph += dt / T;
      if (o.full && ph0 < 0.55 && o.cph >= 0.55) o.cph = 0.55;
      if (o.cph >= 1) o.cph -= 1;
    } else if (o.full) {
      if (o.cph < 0.55) o.cph = Math.min(0.55, o.cph + dt / 6); else if (o.cph >= 0.55 && o.cph < 0.63) o.cph = 0.55;
      else { o.cph += dt / 6; if (o.cph >= 1) o.cph = 0; }
    } else if (o.cph >= 0.2) { o.cph += dt / 6; if (o.cph >= 1) o.cph = 0; } else o.cph = 0;
    o.mt = T;
  }
  function cartAt(ph, xa, xb) {
    if (ph < 0.2) return { x: xb, fill: ph / 0.2 };
    if (ph < 0.55) return { x: xb - (xb - xa) * ((ph - 0.2) / 0.35), fill: 1 };
    if (ph < 0.63) return { x: xa, fill: 1 - (ph - 0.55) / 0.08, dump: true };
    return { x: xa + (xb - xa) * ((ph - 0.63) / 0.37), fill: 0 };
  }

  // ---------------------------------------------------------------- drawing
  function frame() {
    const st = get();
    if (!st || !st.colony || !canvas.width) return;
    const { planet, region, colony: c, rates: R, bneck, now, unl } = st;
    const t = performance.now() / 1000;
    const dt = clamp(t - (lastT || t), 0, 0.1); lastT = t;
    stepCamera(dt);
    const bw = Math.ceil(canvas.width / Sc) + 2, bh = Math.ceil(canvas.height / Sc) + 2;
    if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
    const view = { x: Math.floor(cam.x), y: Math.floor(cam.y), scale: 1, w: bw, h: bh };
    drawScene(bg, planet, region, view, t, { layerH: L.LAYER_H, weather: false });
    const Pn = pen(bg, view);
    const ores = Object.fromEntries(planet.ores.map((o) => [o.id, o]));
    const look = st.look;
    hits = [];

    // --- derived flow state
    const n = c.shafts.length;
    const tunTot = sum(c.tunnel), capT = Math.max(1, R.tunnelCap || 1);
    const yardAmt = sum(c.yard), yardCap = Math.max(1, R.yardCap || 1), yardF = clamp(yardAmt / yardCap, 0, 1);
    const wOre = {};
    c.shafts.forEach((s, i) => { const r = R.shafts[i]; wOre[s.ore] = (wOre[s.ore] || 0) + (r && r.ok ? r.orePerMin : 0) + 0.01 * (s.miners || 0) + 0.001; });
    const infos = c.shafts.map((s, i) => {
      const r = R.shafts[i];
      const w = (r && r.ok ? r.orePerMin : 0) + 0.01 * (s.miners || 0) + 0.001;
      const f = clamp(((c.tunnel[s.ore] || 0) * w / wOre[s.ore]) / (capT / n), 0, 1);
      const halted = !!(s.haltUntil && s.haltUntil > now);
      const inf = { r, f, halted, haltSecs: halted ? (s.haltUntil - now) / 1000 : 0, active: !halted && !!(r && r.ok && r.orePerMin > 0) };
      stepShaft(s, r || { orePerMin: 0 }, inf, dt);
      inf.o = SH.get(s.id);
      return inf;
    });
    const tunF = clamp(tunTot / capT, 0, 1);

    // --- underground
    const bottom = galleryTop(Math.max(0, n - 1)) + L.GH + 3;
    Pn.rect(-8, 0, 16, bottom, '#0d0814');
    Pn.rect(-8, 0, 2, bottom, '#5a3e26'); Pn.rect(6, 0, 2, bottom, '#5a3e26');
    for (let y = 4; y < bottom; y += 10) Pn.rect(-6, y, 12, 1, '#2a1c14');
    const mineFlow = Math.min(R.minePerMin, R.liftPerMin);
    rockEnd = 0;
    for (let k = 0; k < n; k++) drawGallery(Pn, view, c.shafts[k], infos[k], ores, t, look, dt);
    // pile of ore waiting at the lift bottom
    if (tunTot > 0.5) drawMound(Pn, -0.5, bottom - 6, 2 + 9 * Math.sqrt(tunF), 6.5, topOreColor(c.tunnel, ores), tunF >= 0.97 && Math.floor(t * 3) % 2 ? '#ff5a6e' : null);
    if (unl.panels.includes('shafts') && n < 30) {
      const y0 = galleryTop(n), x0 = L.GX0, x1 = L.GX0 + L.GLEN;
      const dash = Math.floor(t * 8) % 6;
      for (let x = x0 + dash; x < x1; x += 6) { Pn.rect(x, y0, 3, 1, 'rgba(255,210,63,0.7)'); Pn.rect(x, y0 + L.GH - 1, 3, 1, 'rgba(255,210,63,0.7)'); }
      for (let y = y0; y < y0 + L.GH; y += 6) { Pn.rect(x1 - 1, y, 1, 3, 'rgba(255,210,63,0.7)'); }
      hits.push({ kind: 'dig', x0, x1, y0, y1: y0 + L.GH });
    }

    // --- lift cage: carries ore up and tips it down the chute into the yard
    const depthY = galleryTop(Math.max(0, deepestActive(c, R))) + L.GH - 3;
    const liftV = mineFlow > 0 ? clamp(25 + Math.sqrt(R.liftPerMin) * 6, 25, 160) : 0;
    let cageY = -2, goingUp = false;
    if (liftV > 0) {
      const span = depthY + 2, period = 2 * span / liftV;
      const ph = (t % period) / period;
      cageY = ph < 0.5 ? depthY - ph * 2 * span : -2 + (ph - 0.5) * 2 * span;
      goingUp = ph < 0.5;
    }
    if (prevUp && !goingUp && liftV > 0 && yardAmt < yardCap * 0.995) {
      const cn = prefs.reduced ? 1 : 3, oc = topOreColor(c.tunnel, ores);
      for (let i = 0; i < cn; i++) emit({ x: 7 + i, y: -16, vx: 14 + i * 3, vy: -4, g: 90, t0: t + i * 0.12, life: 1, sz: 2, col: oc });
    }
    prevUp = goingUp;
    drawWinch(Pn, t);
    Pn.line(0, -44, 0, cageY - 12, '#2a2a33', 1);
    drawCage(Pn, cageY, goingUp ? topOreColor(c.tunnel, ores) : null, clamp(0.45 + tunF * 0.55, 0.45, 1));
    drawHeadframe(Pn, t, liftV);
    const RF = R.refinery || {};
    if (RF.planet) drawPlanetRefinery(Pn, emit, t, dt, RF.planet, ingotCol(c.refinery?.planet, ores), prefs.reduced);
    Pn.line(8, -17, 19, -8, '#5a5a66', 2); // tip chute

    // --- yard: the pile grows with colony.yard / yardCap
    Pn.rect(L.YARD_X - 14, -1, 28, 1, '#3a2a20');
    const yardCol = yardF >= 0.85 ? (Math.floor(t * 3) % 2 ? '#ff5a6e' : '#a8404e') : '#6a4a2a';
    for (let x = L.YARD_X - 14; x <= L.YARD_X + 14; x += 7) Pn.rect(x, -5, 1, 5, yardCol);
    Pn.rect(L.YARD_X - 14, -4, 29, 1, yardCol);
    if (yardAmt > 0.5) {
      const h = 3 + 21 * Math.sqrt(yardF);
      const hg = drawPile(bg, view, L.YARD_X, 0, Math.pow((h - 3) / 1.3, 2), yardF >= 0.9 ? mixRed(topOreColor(c.yard, ores), 0.35) : topOreColor(c.yard, ores), 24);
      // other ores speckled onto the pile
      const comp = composition(c.yard, ores);
      for (let i = 0; i < Math.min(8, hg); i++) { const q = comp[(i * 5 + 1) % comp.length]; if (q) Pn.rect(L.YARD_X - 5 + ((i * 7) % 11), -3 - ((i * 3) % Math.max(1, hg - 3)), 1, 1, q.col); }
    }
    const gx = L.YARD_X - 14;
    Pn.rect(gx - 1, 2, 31, 4, '#0d0814'); Pn.rect(gx, 3, 29, 2, '#2a2040');
    Pn.rect(gx, 3, Math.round(29 * yardF), 2, gcol(yardF));
    if (yardF >= 0.85 && Math.floor(t * 3) % 2) Pn.rect(L.YARD_X - 2, -34, 4, 4, '#ff5a6e');

    // --- pads, ships, belt
    if (RF.orbital) drawStation(Pn, emit, t, dt, RF.orbital, ingotCol(c.refinery?.orbital, ores), prefs.reduced);
    const lay = layoutShips(c, R, now, t, dt);
    for (let i = 0; i < c.pads; i++) drawPad(Pn, padX(i), t, i);
    for (const d of lay.draw) drawShipK(bg, view, Pn, d, t);
    const convEnd = L.PAD_X0 + Math.max(1, c.pads) * L.PAD_W - 8;
    const flowing = yardAmt > 0.01 && lay.loading.length > 0;
    const beltV = clamp(8 + 5 * Math.log2(1 + (R.conveyorPerMin || 0) / 20), 8, 48);
    drawConveyor(Pn, L.CONV_X0, convEnd, t, flowing ? beltV : 0);
    drawLoading(Pn, view, c, R, lay, ores, t, flowing, beltV);
    for (let i = 0; i < c.pads; i++) hits.length; // (pads are tapped through the 'ships' region)

    // --- particles
    stepParts(Pn, bg, t, dt);
    if (!prefs.reduced) {
      drawWeather(bg, planet, region, view, t);
    }

    // --- upscale
    g.imageSmoothingEnabled = Sc < 1;
    g.drawImage(buf, 0, 0, bw, bh, -Math.round((cam.x - view.x) * Sc), -Math.round((cam.y - view.y) * Sc), Math.round(bw * Sc), Math.round(bh * Sc));

    // --- crisp overlay (device px)
    const S = (wx, wy) => ({ x: (wx - cam.x) * Sc, y: (wy - cam.y) * Sc });
    const fs = Math.round(clamp(3.4 * z, 9, 13) * dpr);
    g.textBaseline = 'top';
    if (z >= 1.5) {
      label(g, S(0, -64), 'LIFT', fs, 'center');
      label(g, S(L.YARD_X, -34), `YARD ${fmt(yardAmt)}/${fmt(yardCap)}`, fs, 'center', yardF >= 0.85 ? '#ff7a8a' : null);
      if (yardF >= 0.97) label(g, S(L.YARD_X, -34 - (fs / Sc) - 5), 'FULL', fs, 'center', '#ff5a6e');
      label(g, S(padX(0) + 20, 3), c.pads > 1 ? 'LAUNCH PADS' : 'LAUNCH PAD', fs, 'center');
      if (RF.planet) refLabel(g, S(REF.X, -54), RF.planet, fs);
      if (RF.orbital) refLabel(g, S(REF.STX, REF.STY - 26), RF.orbital, fs);
    } else label(g, S(L.YARD_X, -34), `YARD ${Math.round(yardF * 100)}%`, fs, 'center', yardF >= 0.85 ? '#ff7a8a' : null);
    if (tunTot > 0.5 && z >= 1) label(g, S(0, bottom + 2), `LIFT BASE ${fmt(tunTot)}${tunF >= 0.97 ? ' FULL' : ''}`, fs, 'center', tunF >= 0.97 ? '#ff7a8a' : null);
    const gap = L.LV * Sc;
    for (let k = 0; k < n; k++) {
      const G = geo(c.shafts[k], infos[k].o);
      if (G.broken && z >= 1.2) label(g, S(G.xs + BREAK / 2, galleryTop(c.shafts[k].idx) + 8), `… ${fmt(Math.round(G.F))} M`, Math.round(fs * 0.85), 'center', '#b3a5d3');
    }
    for (let k = 0; k < n; k++) badge(g, S, c.shafts[k], infos[k], fs, ores, gap, t);
    if (unl.panels.includes('shafts') && n < 30) {
      const p = S(L.GX0 + 6, galleryTop(n) + 7);
      g.font = `${fs}px Silkscreen, monospace`;
      g.fillStyle = 'rgba(255,210,63,0.95)';
      g.fillText(`+ DIG SHAFT ${n + 1}` + (st.digCost != null ? `  ·  ${fmt(st.digCost)}` : ''), p.x, p.y);
    }
    // cargo gauges over docked ships
    for (const d of lay.docked) {
      const cap = R.ships.find((x) => x.id === d.s.id)?.cap || 1, amt = sum(d.s.cargo), f = clamp(amt / cap, 0, 1);
      const bwid = 40 * Sc, bhgt = clamp(3.2 * Sc, 6 * dpr, 12 * dpr);
      const p = S(d.x - 20, d.y - d.sp.ay - 8);
      const txt = f >= 0.995 ? 'FULL - LAUNCH' : `LOADING ${Math.round(f * 100)}%`;
      g.font = `${fs}px Silkscreen, monospace`;
      g.fillStyle = 'rgba(10,6,16,0.82)'; g.fillRect(p.x - 2 * dpr, p.y - fs - 4 * dpr, Math.max(bwid, g.measureText(txt).width + 8 * dpr) + 4 * dpr, fs + bhgt + 8 * dpr);
      g.fillStyle = f >= 0.995 && Math.floor(t * 4) % 2 ? '#ffffff' : '#f4edff'; g.fillText(txt, p.x + 2 * dpr, p.y - fs - 1 * dpr);
      g.fillStyle = '#2a2040'; g.fillRect(p.x, p.y + 1 * dpr, bwid, bhgt);
      g.fillStyle = f >= 0.95 ? '#5ee6a8' : '#ffd23f'; g.fillRect(p.x, p.y + 1 * dpr, bwid * f, bhgt);
    }
    // waiting line
    if (lay.holdN > 0) {
      const p = S(padX(0) - 20, -76);
      label(g, p, `WAITING FOR PAD${lay.holdN > 3 ? ` +${lay.holdN - 3}` : ''}`, fs, 'left');
    }
    fleetStrip(g, lay.flight, fs, t);
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
  // world -> css px relative to the canvas
  const toCss = (wx, wy) => ({ x: (wx - cam.x) * Sc / dpr, y: (wy - cam.y) * Sc / dpr });

  // particles: chips, ore sparkles, falling ore, dust
  function stepParts(Pn, bg, t, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], a = t - p.t0;
      if (a < 0) continue;
      if (a > p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt;
      if (p.floor != null && p.y > p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.5; }
      const fade = 1 - a / p.life;
      bg.globalAlpha = p.spark ? (Math.floor(a * 30) % 2 ? 1 : 0.6) * Math.min(1, fade * 2) : Math.min(1, fade * 2.2) * (p.alpha || 1);
      Pn.rect(p.x, p.y, p.sz || 1, p.sz || 1, p.col);
    }
    bg.globalAlpha = 1;
  }

  // Tunnel geometry in art px: landing x0..xs, optional break xs..xs+BREAK, dug tunnel to the face xf, rock to xr.
  function geo(s, o) {
    const F = o && o.fv != null ? o.fv : (s.face || 0);
    const x0 = L.GX0, xs = x0 + STATION, broken = F > DUG_MAX;
    const xf = Math.round(broken ? xs + BREAK + DUG_MAX * PXM : xs + F * PXM);
    let ahead = 10;
    for (const p of s.pk || []) ahead = Math.max(ahead, p.start + p.len - F + 6);
    const xr = xf + Math.round(clamp(ahead, 14, 60) * PXM);
    const X = (m) => xf + (m - F) * PXM;          // metres -> x (valid from the visible dug part onward)
    const mMin = broken ? F - DUG_MAX : 0;        // leftmost metre drawn to scale
    return { F, x0, xs, xf, xr, broken, X, mMin };
  }

  function drawGallery(Pn, view, s, inf, ores, t, look, dt) {
    const k = s.idx, y0 = galleryTop(k), y1 = y0 + L.GH;
    const r = inf.r, o = inf.o;
    const G = geo(s, o), { x0, xs, xf, xr, X } = G;
    rockEnd = Math.max(rockEnd, xr);
    hits.push({ kind: 'shaft', id: s.id, x0: x0 - 10, x1: xr, y0, y1 });
    if (y1 < view.y - 4 || y0 > view.y + view.h + 4) return;
    const ore = ores[s.ore];
    const ok = r ? r.ok : true;
    const blocked = !!(r && r.blocked);
    const H = hash(s.id);
    const len = xf - x0;
    // carve
    Pn.rect(-6, y0 + 4, x0 + 8, L.GH - 4, '#1b1226');
    Pn.rect(x0, y0 - 1, len + 1, L.GH + 2, '#120a18');
    Pn.rect(x0, y0, len, L.GH, '#21162e');
    for (let i = 0; i < Math.min(60, len / 12); i++) { const hx = x0 + ((H >> (i % 16)) * 7 + i * 37) % Math.max(1, len); const hy = y0 + 2 + (i * 5 + (H >> 3)) % (L.GH - 8); Pn.rect(hx, hy, 2, 1, '#2c1f3a'); }
    // floor + rails (the tunnel is as long as the face has been driven)
    Pn.rect(x0, y1 - 3, len, 3, '#3b2b2a');
    for (let x = x0 + 2; x < xf - 2; x += 4) Pn.rect(x, y1 - 3, 2, 1, '#5a3e26');
    Pn.rect(x0, y1 - 4, Math.max(0, len - 2), 1, '#9aa0aa');
    // supports + lamps
    for (let x = x0 + 40; x < xf - 14; x += 34) {
      if (G.broken && x > xs - 4 && x < xs + BREAK + 4) continue;
      Pn.rect(x, y0, 2, L.GH - 3, '#6a4a2a'); Pn.rect(x - 3, y0, 8, 2, '#7a5634');
      const fl = prefs.reduced ? 0.25 : 0.2 + 0.08 * Math.sin(t * 9 + x);
      bg.globalAlpha = fl; Pn.disc(x + 1, y0 + 4, 6, '#ffd27a'); bg.globalAlpha = 1;
      Pn.rect(x + 1, y0 + 3, 1, 2, '#ffe9a8');
    }
    // break marker: the long middle of the tunnel is cut out
    if (G.broken) {
      Pn.rect(xs, y0 - 1, BREAK, L.GH + 2, '#120a18');
      for (let y = y0; y < y1; y += 2) { const w = (y >> 1) % 2; Pn.rect(xs + 3 + w, y, 2, 2, '#5a4a6a'); Pn.rect(xs + BREAK - 5 - w, y, 2, 2, '#5a4a6a'); }
      Pn.rect(xs + 6, y1 - 4, BREAK - 12, 1, '#9aa0aa');
    }
    // the current pocket's dug part stains the tunnel walls
    for (const p of s.pk || []) {
      const a = Math.max(p.start, G.mMin), b = Math.min(p.start + p.len, G.F);
      if (b <= a || !ores[p.ore]) continue;
      const po = ores[p.ore], xa = X(a), xb = X(b);
      bg.globalAlpha = 0.16; Pn.rect(xa, y0, xb - xa, L.GH - 4, po.color); bg.globalAlpha = 1;
      for (let x = xa + 1, i = 0; x < xb - 1; x += 3, i++) { Pn.rect(x, y0 + (i % 3), 2, 1, po.color); if (i % 2) Pn.rect(x + 1, y1 - 5 - (i % 2), 1, 1, po.color); }
    }
    // rock ahead of the face, fading into the planet
    const faceCol = '#33263f';
    const shake = o.flash > 0 && t - o.flash < 0.08 ? 1 : 0;
    Pn.rect(xf + shake, y0 - 1, xr - xf - shake, L.GH + 2, faceCol);
    for (let i = 0; i < 6; i++) { bg.globalAlpha = 1 - (i + 1) / 7; Pn.rect(xr + i * 3, y0 - 1, 3, L.GH + 2, faceCol); }
    bg.globalAlpha = 1;
    for (let y = y0; y < y1; y += 3) Pn.rect(xf - 1 - ((y * 7 + H) % 3) + shake, y, 2, 3, faceCol);
    for (let i = 0; i < 18; i++) Pn.rect(xf + 3 + ((H >> (i % 12)) * 11 + i * 17) % Math.max(4, xr - xf - 6), y0 + 1 + (i * 7 + (H >> 2)) % (L.GH - 3), 2, 1, '#3f3050');
    // ore pockets embedded in the rock: what is left of each, to scale (the engine's own pockets)
    for (const p of s.pk || []) {
      const a = Math.max(p.start, G.F), b = p.start + p.len;
      const po = ores[p.ore];
      if (b <= a || !po) continue;
      const xa = X(a) + shake, xb = X(b) + shake;
      if (xa > xr + 12) continue;
      const hard = r && (r.blocked ? p.start <= G.F + 1e-6 : false) || (r && r.next && r.next.blocked && r.next.ore === p.ore && p.start > G.F);
      // a seam with ragged edges, darker rim, then crystals
      const cut = p.start < G.F; // partly dug: flat side at the face
      for (let x = Math.floor(xa); x < xb; x += 2) {
        const e = Math.min(x - xa, xb - x), hh = hash(s.id + ':' + p.start + ':' + x);
        const inset = (cut && x - xa < 3 ? 0 : Math.max(0, 6 - e * 1.5)) + (hh % 3);
        const top = y0 + 1 + inset, bot = y1 - 2 - inset - ((hh >> 3) % 3);
        if (bot <= top) continue;
        bg.globalAlpha = 0.42; Pn.rect(x, top, 2, bot - top, color.shade(po.color, -0.35)); bg.globalAlpha = 1;
        bg.globalAlpha = 0.3; Pn.rect(x, top + 1, 2, Math.max(1, bot - top - 2), po.color); bg.globalAlpha = 1;
      }
      const sp = specOf(po), sz = po.tier === 'mythic' ? 10 : 8;
      const step = Math.max(6, (xb - xa) / 12);
      for (let x = xa + 3, i = 0; x < xb - 1; x += step, i++) {
        const yy = y0 + 5 + ((i * 5 + (H >> (i % 8))) % 3) * 6;
        drawOre(bg, view, sp, x, yy, sz - (i % 2) * 2, t + i);
      }
      if (hard) { bg.globalAlpha = 0.35; Pn.rect(xa, y0 + 1, xb - xa, L.GH - 3, '#1a1622'); bg.globalAlpha = 1; }
    }
    // a face stuck at a pocket the drill can't cut: hard crust
    if (blocked) {
      const pulse = Math.floor(t * 2) % 2;
      Pn.rect(xf, y0, 5, L.GH, '#6b6f7a');
      for (let y = y0 + 1; y < y1 - 1; y += 3) Pn.rect(xf + 1 + (y % 2), y, 2, 1, '#a8adb8');
      Pn.line(xf + 1, y0 + 4, xf + 4, y0 + 10, '#2a2a33', 1); Pn.line(xf + 4, y0 + 13, xf + 1, y0 + 19, '#2a2a33', 1);
      if (pulse) { Pn.rect(xf - 1, y0, 1, L.GH, '#ff5a6e'); }
    }
    // strike: flash and a burst of the pocket's own crystals
    const now = performance.now() / 1000, sa = now - o.strike;
    if (o.burst) {
      o.burst = false;
      const po = ores[o.strikeOre];
      if (po) {
        const pal = specOf(po).palette || [po.color];
        const nb = prefs.reduced ? 6 : 26;
        for (let i = 0; i < nb; i++) { const ang = (i / nb) * Math.PI * 2; emit({ x: xf + 2, y: y0 + L.GH / 2, vx: Math.cos(ang) * (20 + Math.random() * 40) - 10, vy: Math.sin(ang) * (20 + Math.random() * 30) - 20, g: 60, t0: t, life: 0.9 + Math.random() * 0.5, sz: i % 3 ? 1 : 2, col: i % 4 === 0 ? '#ffffff' : pal[1 + (i % Math.max(1, pal.length - 1))] || po.color, spark: i % 2 === 0 }); }
        pops.push({ x: xf - 10, y: y0 - 2, text: `STRIKE! ${po.name.toUpperCase()}`, color: po.tier === 'mythic' ? '#ffffff' : po.color, t0: t });
      }
    }
    if (sa >= 0 && sa < 0.6 && !prefs.reduced) { bg.globalAlpha = 0.5 * (1 - sa / 0.6); Pn.rect(x0, y0, xr - x0, L.GH, '#ffffff'); bg.globalAlpha = 1; }
    // tunnel buffer: ore piled at the lift end of the gallery
    const f = o.f;
    if (f > 0.02) drawMound(Pn, x0 + 9, y1 - 3, 2 + 12 * f, 8 + 4 * f, ore ? ore.color : '#8a7a6a', o.full && Math.floor(t * 3) % 2 ? '#ff5a6e' : null);
    if (o.full) { bg.globalAlpha = 0.12 + (Math.floor(t * 3) % 2) * 0.1; Pn.rect(x0, y0, 30, L.GH, '#ff3a4e'); bg.globalAlpha = 1; }
    // cart: fills at the face, rolls to the lift, tips
    const miners = s.miners || 0, shown = Math.min(miners, 5);
    const xa = x0 + 26, xb = Math.max(xa + 14, xf - 16 - shown * 11);
    const cartCol = ore ? ore.color : null;
    const ct = cartAt(o.cph, xa, xb);
    drawCart(Pn, ct.x, y1 - 4, cartCol, ct.fill);
    if (ct.dump && o.run !== undefined && ore && !prefs.reduced && Math.random() < dt * 14) emit({ x: ct.x - 5, y: y1 - 11, vx: -10 - Math.random() * 6, vy: -4, g: 140, t0: t, life: 0.5, sz: 2, col: ore.color, floor: y1 - 6 });
    // miners: swing rate follows this shaft's real ore rate; idle ones stand still
    const rate = r ? r.orePerMin : 0;
    const hz = 0.9 + 1.5 * clamp(Math.log10(1 + rate) / 3, 0, 1);
    for (let i = 0; i < shown; i++) {
      const mx = xf - 10 - i * 11;
      let fr = 0;
      if (o.run) {
        const ph = t * hz + i * 0.37 + (H % 7) / 7;
        fr = Math.floor((ph % 1) * 3);
        const lastFr = o.last[i];
        if (fr === 1 && lastFr !== 1) impact(o, s, blocked && i === 0 ? { color: '#a8adb8' } : ore, mx, y1, i, xf, ct, xb, t);
        o.last[i] = fr;
      }
      Pn.sprite(minerImg(look, o.run ? 'swing' : 'walk', fr), mx, y1 - 3, 12, 24);
    }
    // rock/ore flash at the face
    if (t - o.flash < 0.1) { Pn.rect(xf - 2, y1 - 13, 3, 3, '#ffffff'); Pn.rect(xf - 4, y1 - 12, 7, 1, '#ffe9a8'); }
    if (inf.halted) { bg.globalAlpha = 0.18 + (Math.floor(t * 2) % 2) * 0.1; Pn.rect(x0, y0, len, L.GH, '#ff9a2a'); bg.globalAlpha = 1; for (let x = xf - 40; x < xf; x += 6) Pn.rect(x, y1 - 6 - (x % 4), 3, 3, '#5a5260'); }
    if (!ok) { bg.globalAlpha = 0.35; Pn.rect(x0, y0, len, L.GH, '#000000'); bg.globalAlpha = 1; }
  }
  function impact(o, s, ore, mx, y1, i, xf, ct, xb, t) {
    if (i === 0 || i === 1) o.flash = t;
    const n = prefs.reduced ? 1 : 3;
    const tipx = Math.min(mx + 10, xf - 1), tipy = y1 - 12;
    for (let q = 0; q < n; q++) emit({ x: tipx, y: tipy, vx: -8 - Math.random() * 26, vy: -22 - Math.random() * 26, g: 130, t0: t, life: 0.55 + Math.random() * 0.2, sz: Math.random() < 0.4 ? 2 : 1, col: ['#6a5a7a', '#8a7a9a', '#4a3a58'][q % 3], floor: y1 - 4 });
    if (ore) {
      emit({ x: tipx, y: tipy - 1, vx: -4 - Math.random() * 14, vy: -26 - Math.random() * 20, g: 100, t0: t, life: 0.6, sz: 1, col: '#ffffff', spark: true });
      // an ore chunk lobbed toward the cart while it waits at the face
      if (ct.x === xb && ct.fill < 1 && !prefs.reduced) {
        const T = 0.5, tx = xb + (Math.random() - 0.5) * 4, ty = y1 - 10;
        emit({ x: tipx, y: tipy, vx: (tx - tipx) / T, vy: (ty - tipy - 0.5 * 150 * T * T) / T, g: 150, t0: t, life: T, sz: 2, col: ore.color });
      } else emit({ x: tipx, y: tipy, vx: -6 - Math.random() * 8, vy: -14, g: 150, t0: t, life: 0.5, sz: 2, col: ore.color, floor: y1 - 5 });
    }
  }

  function badge(g, S, s, inf, fs, ores, gap, t) {
    const y0 = galleryTop(s.idx), r = inf.r, o = inf.o;
    const p = S(L.GX0 + 4, y0 + 2);
    if (p.y > canvas.height || p.y < -80) return;
    if (gap < fs + 9 * dpr) { g.fillStyle = o.full ? '#ff5a6e' : (ores[s.ore] ? ores[s.ore].color : '#fff'); g.fillRect(p.x, p.y, 3 * dpr, Math.max(3 * dpr, gap * 0.5)); return; }
    const ore = ores[s.ore];
    const full = o.full;
    const blocked = !!(r && r.blocked);
    const idle = !full && !inf.halted && r && r.ok && !inf.active;
    const line1 = s.name.toUpperCase();
    const line2 = inf.halted ? `CAVE-IN - HALTED ${mmss(inf.haltSecs)}` : r && !r.ok ? r.reason.toUpperCase() : full ? 'TUNNEL FULL - BACKED UP' : idle ? 'IDLE - NO MINERS' : `${s.miners}/${r ? r.cap : '?'} MINERS  C${s.up.cart} B${s.up.bunk}`;
    const col2 = inf.halted || (r && !r.ok) || full ? '#ff5a6e' : idle ? '#ffb347' : '#b3a5d3';
    // what the face is cutting now, and what's next in the rock
    const nm = (id) => (ores[id] ? ores[id].name.toUpperCase() : '?');
    const pk = r && r.pocket, nx = r && r.next;
    const line3 = blocked ? `NEEDS DRILL ${r.need >= 6 ? 'MYTHIC' : r.need} FOR ${nm(nx && nx.ore)}` : pk ? `MINING ${nm(s.ore)} · ${fmtM(pk.left)} LEFT` : `MINING ${nm(s.ore)} · ${fmtM(r ? r.face : s.face || 0)} DUG`;
    const col3 = blocked ? (Math.floor(t * 2) % 2 ? '#ff5a6e' : '#ffb0ba') : pk && ore ? lite(ore.color) : '#d8cfe8';
    const line4 = !blocked && nx ? `NEXT: ${nm(nx.ore)} IN ${fmtM(nx.at)}${nx.blocked ? ' (HARD)' : ''}` : '';
    const strikeOn = performance.now() / 1000 - o.strike < 2.5;
    const pct = Math.round(o.f * 100);
    const tag = full ? 'FULL' : strikeOn ? 'STRIKE!' : '';
    g.font = `${fs}px Silkscreen, monospace`;
    const extra = 1 + (line4 ? 1 : 0);
    const tall = fs * (3 + extra) + (14 + 3 * extra) * dpr;
    const compact = gap < tall + 4 * dpr;
    const w = Math.max(g.measureText(line1).width + (tag ? g.measureText(tag).width + 10 * dpr : 0), compact ? 0 : Math.max(g.measureText(line2).width, g.measureText(line3).width, line4 ? g.measureText(line4).width : 0), fs * 9) + 12 * dpr;
    const barH = Math.max(fs * 0.9, 7 * dpr);
    const h = compact ? fs + barH + 9 * dpr : fs * (2 + extra) + barH + (13 + 3 * extra) * dpr;
    g.fillStyle = 'rgba(12,7,20,0.78)'; g.fillRect(p.x, p.y, w, h);
    g.fillStyle = full || blocked ? '#ff5a6e' : ore ? ore.color : '#fff'; g.fillRect(p.x, p.y, 2 * dpr, h);
    g.fillStyle = '#f4edff'; g.fillText(line1, p.x + 6 * dpr, p.y + 3 * dpr);
    if (tag) { g.fillStyle = full ? (Math.floor(t * 3) % 2 ? '#ff5a6e' : '#ffb0ba') : (Math.floor(t * 6) % 2 ? '#ffffff' : '#ffd23f'); g.textAlign = 'right'; g.fillText(tag, p.x + w - 4 * dpr, p.y + 3 * dpr); g.textAlign = 'left'; }
    let y = p.y + fs + 5 * dpr;
    if (!compact) {
      g.fillStyle = col2; g.fillText(line2, p.x + 6 * dpr, y); y += fs + 3 * dpr;
      g.fillStyle = col3; g.fillText(line3, p.x + 6 * dpr, y); y += fs + 3 * dpr;
      if (line4) { g.fillStyle = nx.blocked ? '#ffb347' : (ores[nx.ore] ? lite(ores[nx.ore].color) : '#b3a5d3'); g.fillText(line4, p.x + 6 * dpr, y); y += fs + 3 * dpr; }
    }
    // tunnel buffer gauge
    const bx = p.x + 6 * dpr, bw = w - 12 * dpr;
    g.fillStyle = '#2a2040'; g.fillRect(bx, y, bw, barH);
    g.fillStyle = gcol(o.f); g.fillRect(bx, y, bw * clamp(o.f, 0, 1), barH);
    g.font = `${Math.round(fs * 0.8)}px Silkscreen, monospace`;
    g.fillStyle = o.f > 0.5 ? '#140c1c' : '#f4edff';
    g.fillText(compact && (r && !r.ok || idle || blocked) ? (blocked ? `NEEDS DRILL ${r.need >= 6 ? 'MYTHIC' : r.need}` : r && !r.ok ? r.reason.toUpperCase().slice(0, 14) : 'IDLE') : `TUNNEL ${pct}%`, bx + 3 * dpr, y + (barH - fs * 0.8) / 2);
    g.font = `${fs}px Silkscreen, monospace`;
  }

  // ---------------------------------------------------------------- ships
  function layoutShips(c, R, now, t, dt) {
    const byId = new Map(c.ships.map((s) => [s.id, s]));
    const used = new Set();
    for (const [id, p] of [...padMap]) {
      const s = byId.get(id);
      if (!s || s.state !== 'loading' || p >= c.pads) padMap.delete(id); else used.add(p);
    }
    const need = c.ships.filter((s) => s.state === 'loading' && !padMap.has(s.id)).sort((a, b) => (a.dockedAt || 0) - (b.dockedAt || 0));
    for (const s of need) { let p = 0; while (used.has(p) && p < c.pads) p++; if (p < c.pads) { padMap.set(s.id, p); used.add(p); lastPad.set(s.id, p); } }
    const X0 = padX(0) + 30, X1 = padX(Math.max(1, c.pads) - 1) + 240;
    const draw = [], docked = [], loading = [], flight = [];
    const holds = c.ships.filter((s) => s.state === 'home').sort((a, b) => (a.readyAt || 0) - (b.readyAt || 0));
    const nameOf = (s) => { const q = R.ships.find((x) => x.id === s.id); return { cap: q ? q.cap : 1, dest: q && q.dest ? String(q.dest) : '' }; };
    let lane = 0;
    const T_A = 3.5, T_D = 4;
    c.ships.forEach((s) => {
      const lv = shipLvl(s.lvl), sp = shipSprite(s.cls, lv);
      let tg = null;
      if (s.state === 'loading' && padMap.has(s.id)) {
        const pad = padMap.get(s.id);
        tg = { x: padX(pad), y: -2, k: 1, flip: false, flame: false, pad };
        const d = { s, x: tg.x, y: -2, sp };
        docked.push(d); loading.push({ s, pad, sp, x: tg.x });
      } else if (s.state === 'home' || (s.state === 'loading' && !padMap.has(s.id))) {
        const h = holds.indexOf(s);
        if (h < 0 || h >= 3) { SHIP.delete(s.id); return; }
        tg = { x: padX(0) - 4 + h * 46, y: -64 + (prefs.reduced ? 0 : Math.sin(t * 1.6 + h) * 1.5), k: 0.55, flip: false, flame: false };
      } else if (s.state === 'out' && s.departAt != null) {
        const el = (now - s.departAt) / 1000;
        const dn = nameOf(s);
        const tripOut = Math.max(1, (s.arriveAt - s.departAt) / 1000);
        const eta = (s.arriveAt - now) / 1000;
        flight.push({ s, dir: 'out', eta, dest: dn.dest });
        if (el < 0) return;
        const ln = lane++ % 3, laneY = -92 - ln * 10;
        const pad = lastPad.get(s.id) ?? 0;
        if (!lastLaunch.has(s.id + ':' + s.departAt)) {
          lastLaunch.set(s.id + ':' + s.departAt, 1);
          if (lastLaunch.size > 60) lastLaunch.delete(lastLaunch.keys().next().value);
          if (el < 3 && !prefs.reduced) for (let i = 0; i < 12; i++) emit({ x: padX(pad) + (i - 6) * 4, y: -2, vx: (i - 6) * 4, vy: -6, g: 0, t0: t, life: 1.2, sz: 2, col: '#d8c8b0', alpha: 0.7 });
        }
        if (el < T_A) { const a = ease(el / T_A), a2 = a * a; tg = { x: lerp(padX(pad), X0, a2), y: lerp(-2, laneY, a), k: lerp(1, 0.38, a), flip: false, flame: true }; }
        else if (dn.dest === '@refinery' && R.refinery?.orbital) { const f = ease(clamp((el - T_A) / Math.max(1, tripOut - T_A), 0, 1)); tg = { x: lerp(X0, REF.STX, f), y: lerp(laneY, REF.STY + 16, f), k: lerp(0.38, 0.3, f), flip: false, flame: f < 0.95, trail: f < 0.95 }; }
        else tg = { x: lerp(X0, X1, clamp(el / tripOut, 0, 1)), y: laneY, k: 0.38, flip: false, flame: el < T_A + 1.2, trail: true };
      } else if (s.state === 'back' && s.homeAt != null) {
        const rem = (s.homeAt - now) / 1000;
        const dn = nameOf(s);
        flight.push({ s, dir: 'back', eta: rem, dest: dn.dest });
        if (rem < 0) return;
        const ln = lane++ % 3, laneY = -92 - ln * 10;
        const backLen = Math.max(1, (s.homeAt - s.arriveAt) / 1000);
        const hx = padX(0) - 4 + Math.min(2, holds.length) * 46;
        if (rem < T_D) { const a = ease(1 - rem / T_D); tg = { x: lerp(X0, hx, a), y: lerp(laneY, -64, a), k: lerp(0.38, 0.55, a), flip: a < 0.5, flame: true }; }
        else if (dn.dest === '@refinery' && R.refinery?.orbital) { const f = ease(clamp(1 - (rem - T_D) / Math.max(1, backLen - T_D), 0, 1)); tg = { x: lerp(REF.STX, X0, f), y: lerp(REF.STY + 16, laneY, f), k: 0.38, flip: true, flame: false, trail: true }; }
        else tg = { x: lerp(X1, X0, clamp(1 - rem / backLen, 0, 1)), y: laneY, k: 0.38, flip: true, flame: false, trail: true };
      } else { SHIP.delete(s.id); return; }
      let v = SHIP.get(s.id);
      if (!v) { v = { x: tg.x, y: tg.y, k: tg.k }; SHIP.set(s.id, v); }
      const kk = prefs.reduced ? 1 : 1 - Math.exp(-dt * 7);
      const far = Math.hypot(tg.x - v.x, tg.y - v.y) > 140;
      if (far) { v.x = tg.x; v.y = tg.y; v.k = tg.k; } else { v.x += (tg.x - v.x) * kk; v.y += (tg.y - v.y) * kk; v.k += (tg.k - v.k) * kk; }
      const moving = Math.hypot(tg.x - v.x, tg.y - v.y) > 3;
      draw.push({ s, cls: s.cls, lv, sp, x: v.x, y: v.y, k: v.k, flip: tg.flip, flame: tg.flame || moving, trail: tg.trail });
      const dd = docked.find((q) => q.s === s); if (dd) { dd.x = v.x; dd.y = v.y; }
    });
    flight.sort((a, b) => a.eta - b.eta);
    return { draw, docked, loading, flight, holdN: holds.length };
  }

  function drawShipK(bg, view, Pn, d, t) {
    const { sp, k, x, y, flip } = d;
    if (d.trail && !prefs.reduced) { for (let i = 1; i <= 5; i++) { bg.globalAlpha = 0.35 - i * 0.06; Pn.rect(x + (flip ? 1 : -1) * (sp.ax * k + i * 3.5), y - sp.ay * k * 0.42, 2, 1, '#cfd6ee'); } bg.globalAlpha = 1; }
    if (d.flame) {
      const f = Math.floor(t * 30) % 2, dd = flip ? 1 : -1;
      for (const [ex, ey] of sp.exhaust) {
        const wx = flip ? x + (sp.ax - ex) * k : x - (sp.ax - ex) * k, wy = y - (sp.ay - ey) * k;
        Pn.rect(wx + dd * 4 * k - 2 * k, wy - 2 * k, 4 * k, 4 * k, '#ffb347'); Pn.rect(wx + dd * (8 + f * 2) * k - k, wy - k, 3 * k, 3 * k, '#ff8a3d'); Pn.rect(wx + dd * (11 + f * 3) * k, wy, 2 * k, 2 * k, '#ffe066');
      }
    }
    Pn.sprite(sp.cv, x, y, sp.ax, sp.ay, flip, k);
  }

  // belt chunks -> loading arm -> hatch, per docked ship; speed follows the conveyor rate
  function drawLoading(Pn, view, c, R, lay, ores, t, flowing, beltV) {
    const comp = composition(c.yard, ores);
    const spacing = clamp(16 - 2 * Math.log2(1 + (R.conveyorPerPad || 0) / 10), 8, 16);
    const reds = prefs.reduced ? 1.6 : 1;
    for (const d of lay.loading) {
      const { sp, x: px } = d, s = d.s;
      const xr = Math.max(L.CONV_X0 + 8, px - Math.min(sp.ax, 34) - 6), topY = -2 - sp.ay - 7, hx = px - sp.ax * 0.1, hy = -2 - sp.ay * 0.6;
      // gantry arm
      Pn.rect(xr - 1, topY, 3, -topY - 9, '#4a4a58'); Pn.rect(xr - 1, topY, 3, 1, '#8a8a9a');
      Pn.rect(xr - 1, topY - 1, hx - xr + 4, 3, '#4a4a58'); Pn.rect(xr - 1, topY - 1, hx - xr + 4, 1, '#8a8a9a');
      Pn.rect(hx - 2, topY + 2, 5, 2, '#6a6a7a'); Pn.rect(hx - 1, topY + 4, 3, Math.max(1, hy - topY - 4), '#3a3a46');
      const cap = (R.ships.find((q) => q.id === s.id) || {}).cap || 1;
      const act = flowing && sum(s.cargo) < cap * 0.995;
      if (!act) continue;
      const pts = [[L.YARD_X + 8, -15], [L.CONV_X0 + 2, -11.5], [xr, -11.5], [xr, topY + 1], [hx, topY + 1], [hx, hy]];
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const Lp = cum[cum.length - 1], nn = Math.max(2, Math.floor(Lp / (spacing * reds))), loop = nn * spacing * reds;
      const idx = lay.loading.indexOf(d);
      for (let q = 0; q < nn; q++) {
        const raw = t * beltV + q * spacing * reds + idx * 4;
        const sPos = ((raw % loop) + loop) % loop, cyc = Math.floor(raw / loop);
        if (sPos > Lp) continue;
        let seg = 1; while (seg < cum.length - 1 && cum[seg] < sPos) seg++;
        const u = (sPos - cum[seg - 1]) / Math.max(0.001, cum[seg] - cum[seg - 1]);
        const cx = lerp(pts[seg - 1][0], pts[seg][0], u), cy = lerp(pts[seg - 1][1], pts[seg][1], u);
        const pick = comp.length ? comp[pickIdx(comp, hash(`${q}:${cyc}:${idx}`) % 1000 / 1000)] : null;
        const im = pick ? oreSprite(pick.spec, 6) : null;
        if (!im) continue;
        const endFade = Lp - sPos < 6 ? (Lp - sPos) / 6 : 1;
        Pn.sprite(im, cx, cy, 3, 3, false, 0.85, endFade);
      }
    }
  }

  function deepestActive(c, R) {
    let d = 0;
    c.shafts.forEach((s, i) => { if (R.shafts[i] && R.shafts[i].orePerMin > 0) d = Math.max(d, s.idx); });
    return d;
  }

  function fleetStrip(g, flight, fs, t) {
    if (!flight.length) return;
    const rows = flight.slice(0, 3), more = flight.length - rows.length;
    const rh = fs + 6 * dpr, pad = 6 * dpr;
    g.font = `${fs}px Silkscreen, monospace`;
    const txt = (f) => `${f.s.name.toUpperCase().slice(0, 9)} ${f.dest ? (f.dest === '@refinery' ? 'REFINERY' : f.dest.toUpperCase().slice(0, 7)) + ' ' : ''}${mmss(f.eta)}`;
    const head = `IN FLIGHT ${flight.length}`;
    let w = g.measureText(head).width;
    for (const f of rows) w = Math.max(w, g.measureText(txt(f)).width + fs);
    w += pad * 2;
    const h = rh * (rows.length + 1 + (more > 0 ? 1 : 0)) + pad;
    const x = canvas.width - w - 54 * dpr, y = 8 * dpr;
    g.fillStyle = 'rgba(12,7,20,0.8)'; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffd23f'; g.fillRect(x, y, 2 * dpr, h);
    g.fillStyle = '#b3a5d3'; g.fillText(head, x + pad + 2 * dpr, y + 3 * dpr);
    rows.forEach((f, i) => {
      const yy = y + rh * (i + 1) + 3 * dpr, out = f.dir === 'out';
      g.fillStyle = out ? '#ffd23f' : '#5ee6a8';
      const a = Math.max(2, Math.round(fs * 0.5));
      if (out) { g.fillRect(x + pad + 2 * dpr, yy + a, a, a); g.fillRect(x + pad + 2 * dpr + a / 2 - 1, yy, 2, a); } else { g.fillRect(x + pad + 2 * dpr, yy, a, a); g.fillRect(x + pad + 2 * dpr + a / 2 - 1, yy + a, 2, a); }
      g.fillStyle = '#f4edff'; g.fillText(txt(f), x + pad + 2 * dpr + a + 4 * dpr, yy);
    });
    if (more > 0) { g.fillStyle = '#b3a5d3'; g.fillText(`+${more} MORE`, x + pad + 2 * dpr, y + rh * (rows.length + 1) + 3 * dpr); }
  }

  function markerPos(b, c) {
    switch (b.stage) {
      case 'lift': return { x: 0, y: -80 };
      case 'yard': return { x: L.YARD_X, y: -40 };
      case 'conveyor': return { x: (L.CONV_X0 + padX(0)) / 2, y: -26 };
      case 'ships': return { x: padX(0), y: -70 };
      case 'blocked': { const s = c.shafts.find((x) => x.id === b.shaft?.id) || c.shafts[0]; return { x: geo(s, SH.get(s.id)).xf + 2, y: galleryTop(s ? s.idx : 0) + 2 }; }
      default: return { x: L.GX0 + L.GLEN - 30, y: galleryTop(0) + 2 };
    }
  }

  // ---------------------------------------------------------------- input
  const ptrs = new Map();
  let drag = null, pinch = null;
  const rect = () => canvas.getBoundingClientRect();
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vel.x = vel.y = 0; goal = null; anchor = null; trail = [];
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], r = rect();
      const mx = ((a.x + b.x) / 2 - r.left) * dpr, my = ((a.y + b.y) / 2 - r.top) * dpr;
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: z, wx: cam.x + mx / Sc, wy: cam.y + my / Sc };
      drag = null;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], r = rect();
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = ((a.x + b.x) / 2 - r.left) * dpr, my = ((a.y + b.y) / 2 - r.top) * dpr;
      z = zt = clamp(pinch.z0 * d / pinch.d, zMin(), ZMAX); Sc = z * dpr;
      cam.x = pinch.wx - mx / Sc; cam.y = pinch.wy - my / Sc; clampCam();
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) { drag.moved = true; canvas.classList.add('drag'); }
    if (drag.moved) {
      cam.x = drag.cx - dx * dpr / Sc; cam.y = drag.cy - dy * dpr / Sc; clampCam();
      const tn = performance.now(); trail.push({ t: tn, x: cam.x, y: cam.y }); while (trail.length > 2 && tn - trail[0].t > 120) trail.shift();
    }
  });
  const up = (e) => {
    const wasTap = drag && !drag.moved && ptrs.size === 1;
    if (drag && drag.moved && ptrs.size === 1 && !prefs.reduced && trail.length > 1) {
      const a = trail[0], b = trail[trail.length - 1], dtm = (b.t - a.t) / 1000;
      if (dtm > 0.01 && performance.now() - b.t < 80) { vel.x = (b.x - a.x) / dtm; vel.y = (b.y - a.y) / dtm; const m = Math.hypot(vel.x, vel.y), cap = 1500 / z; if (m > cap) { vel.x *= cap / m; vel.y *= cap / m; } }
    }
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
    const r = rect(), ax = (e.clientX - r.left) * dpr, ay = (e.clientY - r.top) * dpr;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
    vel.x = vel.y = 0;
    if (e.shiftKey && !e.ctrlKey) { cam.x += (e.deltaX || dy) * dpr / Sc; goal = null; clampCam(); return; }
    zoomTo(zt * Math.exp(-clamp(dy, -240, 240) * (e.ctrlKey ? 0.012 : 0.0016)), ax, ay);
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    const r = rect();
    zoomTo(zt * 2, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
  });
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  const typing = () => { const a = document.activeElement; return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing() || !canvas.offsetParent) return;
    const dir = KEYMAP[e.key];
    if (dir) { keys.add(dir); e.preventDefault(); return; }
    if (e.key === '+' || e.key === '=') { zoomTo(zt * 1.35, canvas.width / 2, canvas.height / 2); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { zoomTo(zt / 1.35, canvas.width / 2, canvas.height / 2); e.preventDefault(); }
    else if (e.key === '0') { setView(fitView(), true); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { const d = KEYMAP[e.key]; if (d) keys.delete(d); });
  window.addEventListener('blur', () => keys.clear());

  function tap(e) {
    const r = rect();
    const sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
    const wx = cam.x + sx / Sc, wy = cam.y + sy / Sc;
    for (const h of hits) {
      if (h.kind === 'bneck' && sx >= h.sx0 && sx <= h.sx1 && sy >= h.sy0 && sy <= h.sy1) return hooks.onTap?.('bneck', null, e);
    }
    for (const h of hits) {
      if (h.kind === 'bneck') continue;
      if (wx >= h.x0 && wx <= h.x1 && wy >= h.y0 - 3 && wy <= h.y1 + 3) return hooks.onTap?.(h.kind, h.id, e);
    }
    if (wy < 2 && wy > -70 && Math.abs(wx) < 16) return hooks.onTap?.('lift', null, e);
    if (wy < 8 && wy > -40 && Math.abs(wx - L.YARD_X) < 14) return hooks.onTap?.('yard', null, e);
    const rf = get()?.colony?.refinery;
    if (rf?.planet && wy < 8 && wy > -44 && wx > REF.X - REF.W / 2 - 24 && wx < REF.X + REF.W / 2) return hooks.onTap?.('refinery', 'planet', e);
    if (rf?.orbital && Math.abs(wy - REF.STY) < 24 && Math.abs(wx - REF.STX) < 32) return hooks.onTap?.('refinery', 'orbital', e);
    if (wy < 2 && wy > -125 && wx > L.PAD_X0 - 6) return hooks.onTap?.(wy > -20 && wy < -2 ? 'conveyor' : 'ships', null, e);
    hooks.onTap?.('none', null, e);
  }

  new ResizeObserver(() => resize()).observe(canvas);
  resize();

  return {
    frame, resize, home: () => setView(homeView(), true),
    fit: () => setView(fitView(), true),
    zoom: (d) => zoomTo(zt * Math.pow(1.4, d), canvas.width / 2, canvas.height / 2),
    pop(wx, wy, text, col = '#ffd23f') { pops.push({ x: wx, y: wy, text, color: col, t0: performance.now() / 1000 }); if (pops.length > 30) pops.shift(); },
    focusShaft(idx) { goal = null; cam.y = galleryTop(idx) - cssH() / z * 0.4; clampCam(); },
    toCss, padX, galleryTop,
    refPos: (site) => (site === 'orbital' ? { x: REF.STX, y: REF.STY - 14 } : { x: REF.X, y: -46 }),
    worldOf: (stage, c) => ({ lift: { x: 0, y: -48 }, yard: { x: L.YARD_X, y: -14 }, pads: { x: padX(0), y: -40 }, sky: { x: padX(0), y: -90 }, shaft: { x: L.GX0 + 60, y: galleryTop(0) + 12 } }[stage]),
  };
}

// ---------------------------------------------------------------- pieces
function topOreColor(m, ores) {
  let best = null, bv = 0;
  for (const k in m || {}) if (m[k] > bv && ores[k]) { bv = m[k]; best = ores[k]; }
  return best ? best.color : '#8a7a6a';
}
// ore mix of a stock: [{ col, spec, w }] with cumulative weights in w
function composition(m, ores) {
  const out = []; let tot = 0;
  for (const k in m || {}) if (m[k] > 0.01 && ores[k]) { tot += m[k]; out.push({ col: ores[k].color, spec: specOf(ores[k]), w: tot }); }
  for (const q of out) q.w /= tot || 1;
  return out;
}
const pickIdx = (comp, u) => { for (let i = 0; i < comp.length; i++) if (u <= comp[i].w) return i; return comp.length - 1; };
function ingotCol(r, ores) {
  let best = null, top = 0;
  for (const k in r?.stock || {}) if (r.stock[k] > top && ores[k]) { top = r.stock[k]; best = ores[k].color; }
  return best ? lite(best) : '#ffd23f';
}
function refLabel(g, p, x, fs) {
  const f = x.cap > 0 ? x.stock / x.cap : 0;
  label(g, p, x.full ? 'REFINERY FULL' : `REFINERY ${Math.round(f * 100)}%`, fs, 'center', x.full ? '#ff5a6e' : f > 0.7 ? '#ffb347' : null);
}
function lite(col) { return color.mix ? color.mix(col, '#ffffff', 0.45) : col; }
function mixRed(col, k) { return color.mix ? color.mix(col, '#ff3a4e', k) : col; }
function drawMound(P, cx, baseY, h, hw, col, flash) {
  const H = Math.round(h);
  for (let q = 0; q < H; q++) {
    const w = Math.max(1, hw * Math.sqrt(1 - q / (H + 1)));
    P.rect(cx - w, baseY - q - 1, w * 2, 1, q % 4 === 0 ? color.shade(col, -0.25) : q % 4 === 2 ? color.shade(col, 0.12) : col);
  }
  if (flash) P.rect(cx - hw, baseY - H - 1, hw * 2, 1, flash);
}
function label(g, p, text, fs, align, col) {
  g.font = `${fs}px Silkscreen, monospace`;
  g.textAlign = align;
  const w = g.measureText(text).width, ox = align === 'center' ? w / 2 : align === 'right' ? w : 0;
  g.fillStyle = 'rgba(12,7,20,0.65)';
  g.fillRect(p.x - ox - 4, p.y - 2, w + 8, fs + 4);
  g.fillStyle = col || 'rgba(244,237,255,0.9)';
  g.fillText(text, p.x, p.y);
  g.textAlign = 'left';
}
function drawCart(P, x, floorY, load, fill = 1) {
  P.rect(x - 5, floorY - 6, 11, 5, '#6a5a4a'); P.rect(x - 5, floorY - 6, 11, 1, '#8a7a6a'); P.rect(x - 5, floorY - 2, 11, 1, '#4a3a2a');
  if (load && fill > 0.05) {
    P.rect(x - 4, floorY - 7 - (fill > 0.4 ? 1 : 0), 9, 1 + (fill > 0.4 ? 1 : 0), load);
    if (fill > 0.7) P.rect(x - 2, floorY - 9, 4, 1, load);
    if (fill > 0.3) P.rect(x - 3, floorY - 7, 7, 1, load);
  }
  P.rect(x - 4, floorY - 1, 2, 2, '#1a1a22'); P.rect(x + 3, floorY - 1, 2, 2, '#1a1a22');
}
function drawCage(P, y, load, lvl = 1) {
  P.rect(-6, y - 13, 12, 13, '#7a8494'); P.rect(-5, y - 12, 10, 11, '#2a2a36');
  for (let x = -4; x <= 4; x += 3) P.rect(x, y - 12, 1, 11, '#5a6474');
  P.rect(-6, y - 13, 12, 1, '#aab4c4'); P.rect(-6, y - 1, 12, 1, '#4a5464');
  if (load) {
    P.rect(-4, y - 5, 8, 4, load); P.rect(-2, y - 7, 4, 2, load);
    if (lvl > 0.7) { P.rect(-3, y - 9, 6, 2, load); P.rect(-1, y - 10, 2, 1, load); }
    P.rect(-3, y - 4, 1, 1, '#ffffff'); P.rect(2, y - 6, 1, 1, '#ffffff');
  }
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
function drawConveyor(P, x0, x1, t, v) {
  for (let x = x0 + 4; x < x1; x += 14) P.rect(x, -6, 2, 6, '#3a3a46');
  P.rect(x0, -9, x1 - x0, 3, '#2a2a36'); P.rect(x0, -9, x1 - x0, 1, '#5a5a6a');
  const off = v > 0 ? (t * v) % 6 : 0;
  for (let x = x0 + off; x < x1 - 2; x += 6) P.rect(x, -7, 2, 1, '#14101c');
  P.disc(x0, -7, 2, '#5a5a6a'); P.disc(x1, -7, 2, '#5a5a6a');
}
function drawPad(P, cx, t, i) {
  P.rect(cx - 30, -2, 60, 3, '#5a5a6a'); P.rect(cx - 30, -2, 60, 1, '#8a8a9a');
  for (let x = cx - 30; x < cx + 30; x += 6) P.rect(x, 0, 3, 1, '#ffd23f');
  const on = Math.floor(t * 2 + i) % 2;
  P.rect(cx - 31, -4, 2, 2, on ? '#ff5a6e' : '#5a2a30'); P.rect(cx + 29, -4, 2, 2, on ? '#5a2a30' : '#ff5a6e');
}
export { shipSprite };
