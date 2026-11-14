/* The Map tab: the painted planet, your colony ("You landed here"), other players' colonies, refineries
 * (an orbital one floats in orbit) and your ships flying to their buyers as small moving sprites.
 * Ore fields are never drawn: the map only shows where things ARE, never what is in the ground. */
import { renderPlanetMap } from './pixel/planetmap.js';
import { esc, clamp, hash, fmt } from './util.js';
import { prefs } from './juice.js';

const CLS_COL = { hauler: '#ffb347', cruiser: '#7ad1ff', freighter: '#c9a6ff' };
const lerp = (a, b, k) => a + (b - a) * k;

export function createMap(S, A) {
  let cv = null, base = null, size = 0, raf = 0;
  const view = { cx: 500, cy: 500, z: 1, tcx: 500, tcy: 500, tz: 1 }; // map point at the canvas centre, zoom (1 = whole planet)
  let drag = null;
  const me = () => S.colony?.site;

  function panel() {
    const n = (S.colonies || []).length;
    return `<div class="mapwrap"><canvas id="mapCv" aria-label="Planet map"></canvas>
      <div class="mapbtns"><button data-mapz="1" aria-label="Zoom in">+</button><button data-mapz="-1" aria-label="Zoom out">−</button><button data-mapz="home" aria-label="Find my colony">◎</button></div></div>
      <div class="maplegend"><span><i class="lg me"></i>You</span><span><i class="lg them"></i>Other colonies (${Math.max(0, n - 1)})</span><span><i class="lg ref"></i>Refinery</span><span><i class="lg shp"></i>Ships</span></div>
      <p class="lede small">${S.colony.site ? 'The Guild dropped you at a fair spot. ' : ''}Ore lies hidden in the ground: only scouts and digging will tell you what is under any spot.</p>`;
  }
  const key = () => `${(S.colonies || []).length}|${S.colony.refinery?.planet ? 1 : 0}${S.colony.refinery?.orbital ? 1 : 0}`;

  function mount() {
    cv = document.getElementById('mapCv');
    if (!cv) return;
    size = 0;
    const st = me();
    if (st && S.justLanded) { view.cx = view.cy = 500; view.z = 1; view.tz = 2.4; view.tcx = st.x; view.tcy = st.y; S.justLanded = false; }
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false }; };
    cv.onpointermove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const per = (1000 / view.z) / (cv.clientWidth || 1);
      view.cx = view.tcx = clamp(drag.cx - dx * per, 0, 1000); view.cy = view.tcy = clamp(drag.cy - dy * per, 0, 1000);
    };
    cv.onpointerup = () => { drag = null; };
    cv.onwheel = (e) => { e.preventDefault(); view.tz = clamp(view.tz * (e.deltaY < 0 ? 1.25 : 0.8), 1, 6); };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mapz]');
    if (!b) return;
    const v = b.dataset.mapz;
    if (v === 'home') { const s = me(); if (s) { view.tcx = s.x; view.tcy = s.y; view.tz = 2.4; } } else view.tz = clamp(view.tz * (v === '1' ? 1.5 : 0.66), 1, 6);
  });

  function build() {
    const w = Math.max(240, Math.min(620, cv.parentElement.clientWidth || 360));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = w + 'px'; cv.style.height = w + 'px';
    cv.width = cv.height = Math.round(w * dpr);
    base = document.createElement('canvas');
    base.width = base.height = cv.width;
    try { renderPlanetMap(base, S.world.planet, { labels: true }); } catch (e) { console.error(e); }
    size = cv.width;
  }

  function loop(ms) {
    if (!cv || !cv.isConnected) return;
    raf = requestAnimationFrame(loop);
    if (!size || cv.width !== size) build();
    draw(ms / 1000);
  }

  function draw(t) {
    const g = cv.getContext('2d'), W = cv.width, dpr = W / (cv.clientWidth || W);
    const k = prefs.reduced ? 1 : 0.12;
    view.z = lerp(view.z, view.tz, k); view.cx = lerp(view.cx, view.tcx, k); view.cy = lerp(view.cy, view.tcy, k);
    const vs = 1000 / view.z;
    const x0 = clamp(view.cx - vs / 2, 0, 1000 - vs), y0 = clamp(view.cy - vs / 2, 0, 1000 - vs);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0714'; g.fillRect(0, 0, W, W);
    g.drawImage(base, (x0 / 1000) * base.width, (y0 / 1000) * base.height, (vs / 1000) * base.width, (vs / 1000) * base.height, 0, 0, W, W);
    const P = (x, y) => ({ x: ((x - x0) / vs) * W, y: ((y - y0) / vs) * W });
    const u = dpr * 1; // css px
    const st = me(), c = S.colony, R = S.rates;
    g.textBaseline = 'top';
    const label = (text, x, y, col = '#f4edff', align = 'center') => {
      g.font = `${Math.round(9 * u)}px Silkscreen, monospace`; g.textAlign = align;
      const w = g.measureText(text).width, ox = align === 'center' ? w / 2 : 0;
      g.fillStyle = 'rgba(12,7,20,0.72)'; g.fillRect(x - ox - 3 * u, y - 1 * u, w + 6 * u, 12 * u);
      g.fillStyle = col; g.fillText(text, x, y + 1 * u);
    };
    // other players
    for (const o of S.colonies || []) {
      if (o.uid === S.me.id) continue;
      const p = P(o.x, o.y);
      if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > W + 20) continue;
      g.fillStyle = '#140c1c'; g.fillRect(p.x - 4 * u, p.y - 4 * u, 8 * u, 8 * u);
      g.fillStyle = o.color || '#ffffff'; g.fillRect(p.x - 3 * u, p.y - 3 * u, 6 * u, 6 * u);
      if (view.z >= 1.4) label(String(o.name || '').slice(0, 18), p.x, p.y + 6 * u);
    }
    if (!st) return;
    const mp = P(st.x, st.y);
    // orbit and refineries
    const orb = { x: mp.x - 20 * u, y: mp.y - 30 * u };
    if (c.refinery?.orbital) {
      g.strokeStyle = 'rgba(255,230,128,0.5)'; g.setLineDash([3 * u, 3 * u]); g.beginPath(); g.ellipse(mp.x, mp.y, 26 * u, 14 * u, -0.5, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      const a = prefs.reduced ? 0 : t * 0.5;
      const ox = mp.x + Math.cos(a) * 26 * u * Math.cos(-0.5) - Math.sin(a) * 14 * u * Math.sin(-0.5), oy = mp.y + Math.cos(a) * 26 * u * Math.sin(-0.5) + Math.sin(a) * 14 * u * Math.cos(-0.5);
      orb.x = ox; orb.y = oy;
      g.fillStyle = '#140c1c'; g.fillRect(ox - 5 * u, oy - 3 * u, 10 * u, 6 * u);
      g.fillStyle = '#ffe680'; g.fillRect(ox - 4 * u, oy - 2 * u, 8 * u, 4 * u);
      g.fillStyle = '#7ad1ff'; g.fillRect(ox - 8 * u, oy - 1 * u, 3 * u, 2 * u); g.fillRect(ox + 5 * u, oy - 1 * u, 3 * u, 2 * u);
      if (view.z >= 1.4) label('ORBITAL REFINERY', ox, oy + 6 * u, '#ffe680');
    }
    if (c.refinery?.planet) {
      const rx = mp.x + 12 * u, ry = mp.y - 4 * u;
      g.fillStyle = '#140c1c'; g.fillRect(rx - 5 * u, ry - 5 * u, 10 * u, 10 * u);
      g.fillStyle = '#ffd23f'; g.fillRect(rx - 4 * u, ry - 4 * u, 8 * u, 8 * u); g.fillStyle = '#140c1c'; g.fillRect(rx - 2 * u, ry - 8 * u, 2 * u, 4 * u);
      if (view.z >= 1.4) label('REFINERY', rx, ry + 6 * u, '#ffd23f');
    }
    // buyers and flying ships
    const buyers = Object.fromEntries(S.world.planet.buyers.map((b) => [b.id, b]));
    const dest = (id) => {
      if (id === '@refinery') return { x: orb.x, y: orb.y, name: 'Orbital refinery', space: false, fixed: true };
      const b = buyers[id]; if (!b) return null;
      const ang = ((hash('d' + id) % 360) * Math.PI) / 180;
      const units = b.units || 4;
      if (b.offPlanet) {
        const far = 1500; // leaves the map toward its direction, into orbit
        return { x: st.x + Math.cos(ang) * far, y: st.y + Math.sin(ang) * far, name: b.name, space: true, ang };
      }
      const d = 70 + (units / 8) * 260;
      return { x: clamp(st.x + Math.cos(ang) * d, 40, 960), y: clamp(st.y + Math.sin(ang) * d, 40, 960), name: b.name, space: false, ang };
    };
    const seenDest = new Set();
    const now = S.now();
    const ships = c.ships.map((s, i) => ({ s, r: R.ships[i] })).filter(({ s }) => (s.state === 'out' && s.departAt != null) || (s.state === 'back' && s.homeAt != null));
    for (const { s, r } of ships) {
      const dd = dest(r?.dest || s.dest);
      if (!dd) continue;
      let f;
      if (s.state === 'out') f = clamp((now - s.departAt) / Math.max(1, s.arriveAt - s.departAt), 0, 1);
      else f = clamp(1 - (now - s.arriveAt) / Math.max(1, s.homeAt - s.arriveAt), 0, 1);
      const dp = dd.fixed ? dd : P(dd.x, dd.y);
      // space-bound ships climb and fade out toward the edge
      const end = dd.space ? { x: mp.x + Math.cos(dd.ang) * W * 0.5, y: mp.y + Math.sin(dd.ang) * W * 0.5 } : dp;
      if (!seenDest.has(r?.dest || s.dest) && !dd.space) {
        seenDest.add(r?.dest || s.dest);
        g.strokeStyle = 'rgba(244,237,255,0.35)'; g.setLineDash([2 * u, 4 * u]); g.beginPath(); g.moveTo(mp.x, mp.y); g.lineTo(dp.x, dp.y); g.stroke(); g.setLineDash([]);
        if (!dd.fixed) { g.fillStyle = '#140c1c'; g.fillRect(dp.x - 4 * u, dp.y - 4 * u, 8 * u, 8 * u); g.fillStyle = '#ff8a8a'; g.fillRect(dp.x - 3 * u, dp.y - 3 * u, 6 * u, 6 * u); label(String(dd.name).slice(0, 18), dp.x, dp.y + 6 * u, '#ffc4c4'); }
      }
      const sx = lerp(mp.x, end.x, f), sy = lerp(mp.y, end.y, f);
      const ang = Math.atan2(end.y - mp.y, end.x - mp.x) + (s.state === 'back' ? Math.PI : 0);
      const col = CLS_COL[s.cls] || '#fff';
      g.save(); g.translate(sx, sy); g.rotate(ang);
      g.globalAlpha = dd.space ? clamp(1.2 - f * 0.9, 0.2, 1) : 1;
      g.fillStyle = 'rgba(207,214,238,0.5)'; for (let q = 1; q <= 4; q++) g.fillRect(-(5 + q * 3) * u, -0.5 * u, 2 * u, 1 * u);
      g.fillStyle = '#140c1c'; g.fillRect(-5 * u, -3.5 * u, 11 * u, 7 * u);
      g.fillStyle = col; g.beginPath(); g.moveTo(6 * u, 0); g.lineTo(-4 * u, -3 * u); g.lineTo(-2 * u, 0); g.lineTo(-4 * u, 3 * u); g.closePath(); g.fill();
      g.restore(); g.globalAlpha = 1;
    }
    // you
    const pulse = prefs.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3);
    g.strokeStyle = `rgba(255,210,63,${0.35 + 0.4 * pulse})`; g.lineWidth = 2 * u; g.beginPath(); g.arc(mp.x, mp.y, (8 + 5 * pulse) * u, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1;
    g.fillStyle = '#140c1c'; g.fillRect(mp.x - 6 * u, mp.y - 6 * u, 12 * u, 12 * u);
    g.fillStyle = '#ffd23f'; g.fillRect(mp.x - 5 * u, mp.y - 5 * u, 10 * u, 10 * u);
    g.fillStyle = S.colony.species?.color || '#ff8a3d'; g.fillRect(mp.x - 3 * u, mp.y - 3 * u, 6 * u, 6 * u);
    label('YOU LANDED HERE', mp.x, mp.y + 10 * u, '#ffd23f');
  }

  return { panel, key, mount };
}
