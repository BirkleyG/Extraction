/* The planet map: the main screen of the guild game. Pan, zoom, click anything.
 * Draws the painted planet, your claim, your operations, Guild contractor refineries, other guilds, survey reports,
 * drones in flight and ships flying their routes (animated from route rates; they show what happens, never decide it).
 * Ore is never drawn: the ground only tells you what a survey or a mine tells you. */
import { renderPlanetMap } from '/app/pixel/planetmap.js';
import { prefs } from '/app/juice.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const SHIP_COL = { hauler: '#ffb347', clipper: '#7ad1ff', leviathan: '#c9a6ff' };
const KIND_COL = { hub: '#ffd23f', mine: '#ff8a3d', refinery: '#ff5ec4', air: '#7ad1ff', lab: '#5ee6a8' };

export function createMap(S, A) {
  const cv = document.getElementById('map');
  const g = cv.getContext('2d');
  const view = { cx: 500, cy: 500, z: 1, tcx: 500, tcy: 500, tz: 1 };
  let base = null, baseKey = null, W = 0, H = 0, dpr = 1;
  let drag = null, hits = [], pinch = null;
  const pointers = new Map();

  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  window.addEventListener('resize', resize);

  function ensureBase() {
    const key = S.world.planet.id;
    if (baseKey === key) return;
    base = document.createElement('canvas');
    base.width = base.height = 900;
    try { renderPlanetMap(base, S.world.planet, { labels: true, res: 512, retroRes: 300 }); } catch (e) { console.error(e); }
    baseKey = key;
  }

  const scale = () => (Math.min(W, H) / 1000) * view.z;
  const toScreen = (x, y) => { const s = scale(); return { x: W / 2 + (x - view.cx) * s, y: H / 2 + (y - view.cy) * s }; };
  const toMap = (px, py) => { const s = scale(); return { x: view.cx + (px - W / 2) / s, y: view.cy + (py - H / 2) / s }; };

  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.tz }; drag = null; return; }
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    cv.classList.add('drag');
  });
  cv.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; view.tz = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, pinch.d), 1, 8); return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) { drag.moved = true; if (S.follow) { S.follow = null; A.onUnfollow && A.onUnfollow(); } }
    if (!drag.moved) return;
    const s = scale() / dpr;
    view.cx = view.tcx = clamp(drag.cx - dx / s, 0, 1000); view.cy = view.tcy = clamp(drag.cy - dy / s, 0, 1000);
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    cv.classList.remove('drag');
    if (drag && !drag.moved) click(e);
    drag = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { pointers.clear(); drag = null; pinch = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const before = toMap((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    view.tz = clamp(view.tz * (e.deltaY < 0 ? 1.2 : 0.83), 1, 8);
    // zoom toward the cursor
    const k = 1 - view.z / view.tz;
    view.tcx = clamp(view.cx + (before.x - view.cx) * k, 0, 1000); view.tcy = clamp(view.cy + (before.y - view.cy) * k, 0, 1000);
  }, { passive: false });

  function click(e) {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
    let best = null, bd = 16 * dpr;
    for (const h of hits) { const d = Math.hypot(h.sx - px, h.sy - py) - (h.r || 0); if (d < bd) { bd = d; best = h; } }
    const m = toMap(px, py);
    A.onMapClick(best ? best : { type: 'spot', x: Math.round(m.x), y: Math.round(m.y) });
  }

  function focus(x, y, z) { view.tcx = x; view.tcy = y; if (z) view.tz = z; }
  function zoomBy(f) { view.tz = clamp(view.tz * f, 1, 8); }

  function label(text, x, y, col = '#f4edff', size = 9) {
    g.font = `${Math.round(size * dpr)}px Silkscreen, monospace`; g.textAlign = 'center'; g.textBaseline = 'top';
    const w = g.measureText(text).width;
    g.fillStyle = 'rgba(12,7,20,0.78)'; g.fillRect(x - w / 2 - 3 * dpr, y - 1 * dpr, w + 6 * dpr, (size + 3) * dpr);
    g.fillStyle = col; g.fillText(text, x, y + 1 * dpr);
  }
  const box = (x, y, s, fill, edge = '#140c1c') => { g.fillStyle = edge; g.fillRect(x - s - dpr, y - s - dpr, 2 * s + 2 * dpr, 2 * s + 2 * dpr); g.fillStyle = fill; g.fillRect(x - s, y - s, 2 * s, 2 * s); };

  function icon(kind, x, y, col, u, t) {
    const s = 6 * u;
    if (kind === 'hub') {
      box(x, y, s, '#ffd23f'); g.fillStyle = col; g.fillRect(x - 3 * u, y - 3 * u, 6 * u, 6 * u);
      g.fillStyle = '#140c1c'; g.fillRect(x - 0.5 * u, y - 12 * u, 1.5 * u, 7 * u); g.fillStyle = col; g.fillRect(x + u, y - 12 * u, 5 * u, 3 * u);
    } else if (kind === 'mine') {
      g.fillStyle = '#140c1c'; g.beginPath(); g.moveTo(x, y - 8 * u); g.lineTo(x + 8 * u, y + 6 * u); g.lineTo(x - 8 * u, y + 6 * u); g.closePath(); g.fill();
      g.fillStyle = '#ff8a3d'; g.beginPath(); g.moveTo(x, y - 6 * u); g.lineTo(x + 6 * u, y + 5 * u); g.lineTo(x - 6 * u, y + 5 * u); g.closePath(); g.fill();
      g.fillStyle = '#140c1c'; g.fillRect(x - 2 * u, y, 4 * u, 5 * u);
    } else if (kind === 'refinery' || kind === 'npc' || kind === 'rival') {
      const c = kind === 'npc' ? '#c9b8a6' : kind === 'rival' ? col : '#ff5ec4';
      box(x, y + u, s, c);
      g.fillStyle = '#140c1c'; g.fillRect(x + 2 * u, y - 10 * u, 3 * u, 6 * u);
      if (!prefs.reduced) { g.fillStyle = 'rgba(220,210,230,0.55)'; const ph = (t * 0.6 + x * 0.01) % 1; g.fillRect(x + 3 * u + ph * 4 * u, y - 13 * u - ph * 8 * u, 3 * u, 3 * u); }
      g.fillStyle = '#140c1c'; g.fillRect(x - 3 * u, y - u, 2 * u, 2 * u); g.fillRect(x + u, y - u, 2 * u, 2 * u);
    } else if (kind === 'air') {
      box(x, y, s, '#7ad1ff'); g.fillStyle = '#140c1c'; g.fillRect(x - 3 * u, y - 3 * u, 1.5 * u, 6 * u); g.fillRect(x + 1.5 * u, y - 3 * u, 1.5 * u, 6 * u); g.fillRect(x - 3 * u, y - 0.5 * u, 6 * u, 1.5 * u);
    } else if (kind === 'lab') {
      g.fillStyle = '#140c1c'; g.beginPath(); g.arc(x, y + u, 7 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5ee6a8'; g.beginPath(); g.arc(x, y + u, 5.5 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#140c1c'; g.fillRect(x - 1.5 * u, y - 9 * u, 3 * u, 5 * u);
    }
  }

  function along(pts, f) {
    let L = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); L += d; }
    let d = clamp(f, 0, 1) * L;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? d / seg[i] : 0; return { x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k), a: Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x) }; }
      d -= seg[i];
    }
    return { x: pts[0].x, y: pts[0].y, a: 0 };
  }

  function draw(ms) {
    if (!S.world || !S.view) return;
    resize(); ensureBase();
    const t = ms / 1000;
    const k = prefs.reduced ? 1 : 0.14;
    view.z = lerp(view.z, view.tz, k); view.cx = lerp(view.cx, view.tcx, k); view.cy = lerp(view.cy, view.tcy, k);
    // keep the planet on screen
    // keep the planet filling the screen: never pan past its edge
    const hw = (500 / view.z) * (W / Math.min(W, H)), hh = (500 / view.z) * (H / Math.min(W, H));
    const lim = (c, h) => (h >= 500 ? 500 : clamp(c, h, 1000 - h));
    view.cx = lim(view.cx, hw); view.cy = lim(view.cy, hh); view.tcx = lim(view.tcx, hw); view.tcy = lim(view.tcy, hh);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0714'; g.fillRect(0, 0, W, H);
    const o = toScreen(0, 0), s = scale();
    g.drawImage(base, o.x, o.y, 1000 * s, 1000 * s);
    hits = [];
    const u = dpr * clamp(0.75 + view.z * 0.12, 0.8, 1.5);
    const V = S.view, me = S.guild, now = S.now();
    const showLabels = view.z >= 1.6;
    const mode = S.mode;

    const claim = V.sites.filter((x) => (x.kind === 'hub' || x.kind === 'air') && x.level >= 1);
    // survey reports
    for (const sv of me.surveys || []) {
      const p = toScreen(sv.x, sv.y);
      if (sv.status === 'done') {
        const top = sv.report && sv.report.ores.filter((x) => !x.trace && S.oreTier(x.id) !== 'common').sort((a, b) => S.oreValue(b.id) * b.est - S.oreValue(a.id) * a.est)[0];
        const col = top ? S.oreColor(top.id) : '#8a7fa8';
        g.fillStyle = '#140c1c'; g.beginPath(); g.arc(p.x, p.y, 5 * u, 0, Math.PI * 2); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, 3.5 * u, 0, Math.PI * 2); g.fill();
        if (top && S.oreTier(top.id) === 'mythic') { g.strokeStyle = '#ff9f3d'; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(p.x, p.y, (8 + 2 * Math.sin(t * 4)) * u, 0, Math.PI * 2); g.stroke(); }
        if (showLabels && view.z >= 2.6) label(sv.report.headline.slice(0, 26), p.x, p.y + 7 * u, '#d8cfee', 8);
        hits.push({ type: 'survey', id: sv.id, sx: p.x, sy: p.y, x: sv.x, y: sv.y });
      } else {
        // a drone in flight from the nearest hub
        const hubs = claim.length ? claim : [{ x: me.landing.x, y: me.landing.y }];
        const h = hubs.reduce((a, b) => (Math.hypot(b.x - sv.x, b.y - sv.y) < Math.hypot(a.x - sv.x, a.y - sv.y) ? b : a));
        const f = clamp((now - sv.at) / Math.max(1, sv.doneAt - sv.at), 0, 1);
        const fly = Math.min(1, f * 1.25);
        const q = toScreen(lerp(h.x, sv.x, fly), lerp(h.y, sv.y, fly));
        g.strokeStyle = 'rgba(122,209,255,0.35)'; g.setLineDash([2 * dpr, 4 * dpr]); g.beginPath(); const a = toScreen(h.x, h.y); g.moveTo(a.x, a.y); g.lineTo(p.x, p.y); g.stroke(); g.setLineDash([]);
        g.strokeStyle = 'rgba(122,209,255,0.6)'; g.beginPath(); g.arc(p.x, p.y, 6 * u, 0, Math.PI * 2); g.stroke();
        const bob = prefs.reduced ? 0 : Math.sin(t * 8) * u;
        g.fillStyle = '#140c1c'; g.fillRect(q.x - 4 * u, q.y - 2 * u + bob, 8 * u, 4 * u);
        g.fillStyle = '#7ad1ff'; g.fillRect(q.x - 3 * u, q.y - 1 * u + bob, 6 * u, 2 * u);
        g.fillStyle = (Math.floor(t * 4) % 2) ? '#ff5a6e' : '#140c1c'; g.fillRect(q.x - 0.5 * u, q.y - 3 * u + bob, u, u);
        if (fly >= 1 && !prefs.reduced) { g.strokeStyle = 'rgba(122,209,255,0.5)'; g.beginPath(); g.arc(p.x, p.y, ((t * 30) % 14) * u, 0, Math.PI * 2); g.stroke(); }
      }
    }

    // Guild contractor refineries
    for (const n of S.world.npc || []) {
      const p = toScreen(n.x, n.y);
      icon('npc', p.x, p.y, '#c9b8a6', u, t);
      if (showLabels) label(n.name.slice(0, 22), p.x, p.y + 9 * u, '#e8dccf');
      hits.push({ type: 'npc', id: n.id, sx: p.x, sy: p.y, x: n.x, y: n.y, r: 4 * u });
    }

    // prospector camps: they sell ore at the gate
    for (const c of S.world.camps || []) {
      const p = toScreen(c.x, c.y);
      g.fillStyle = '#140c1c'; g.beginPath(); g.moveTo(p.x, p.y - 7 * u); g.lineTo(p.x + 7 * u, p.y + 5 * u); g.lineTo(p.x - 7 * u, p.y + 5 * u); g.closePath(); g.fill();
      g.fillStyle = '#c9b8a6'; g.beginPath(); g.moveTo(p.x, p.y - 5 * u); g.lineTo(p.x + 5 * u, p.y + 4 * u); g.lineTo(p.x - 5 * u, p.y + 4 * u); g.closePath(); g.fill();
      g.fillStyle = '#ffd23f'; g.font = `${Math.round(10 * dpr)}px VT323, monospace`; g.textAlign = 'center'; g.fillText('$', p.x + 8 * u, p.y - 2 * u);
      if (showLabels) label(c.name.slice(0, 22), p.x, p.y + 8 * u, '#e8dccf');
      hits.push({ type: 'camp', id: c.id, sx: p.x, sy: p.y, x: c.x, y: c.y, r: 3 * u });
    }

    // other guilds
    for (const o2 of S.world.sites || []) {
      if (o2.uid === S.me.id) continue;
      const p = toScreen(o2.x, o2.y);
      const col = o2.color || '#e8e4f2';
      if (o2.kind === 'refinery') {
        icon('rival', p.x, p.y, col, u * 0.9, t);
        const d = (S.world.directory || []).find((x) => x.uid === o2.uid && x.siteId === o2.id);
        if (d && d.on) { g.fillStyle = '#ffd23f'; g.font = `${Math.round(9 * dpr)}px VT323, monospace`; g.textAlign = 'center'; g.fillText('$', p.x - 8 * u, p.y - 4 * u); }
        hits.push({ type: 'rival', id: o2.id, uid: o2.uid, sx: p.x, sy: p.y, x: o2.x, y: o2.y, r: 3 * u });
      } else {
        box(p.x, p.y, (o2.kind === 'hub' ? 4.5 : 3) * u, col);
        const gate = o2.kind === 'mine' && (S.world.gates || []).find((x) => x.uid === o2.uid && x.siteId === o2.id && x.on);
        if (gate) { g.fillStyle = '#ffd23f'; g.font = `${Math.round(9 * dpr)}px VT323, monospace`; g.textAlign = 'center'; g.fillText('$', p.x - 7 * u, p.y - 3 * u); }
        hits.push({ type: gate ? 'gate' : 'rivalsite', id: o2.id, uid: o2.uid, sx: p.x, sy: p.y, x: o2.x, y: o2.y });
      }
      if (showLabels && o2.kind === 'hub') label(String(o2.guild || '').slice(0, 20), p.x, p.y + 7 * u, col);
    }

    // routes and ships
    for (const r of V.routes) {
      const pts = (r.path && r.path.pts) || [];
      if (pts.length < 2) continue;
      const sp = pts.map((q) => toScreen(q.x, q.y));
      const sel = S.sel && S.sel.type === 'route' && S.sel.id === r.id;
      g.strokeStyle = r.ok ? (sel ? 'rgba(255,210,63,0.9)' : 'rgba(244,237,255,0.38)') : 'rgba(255,90,110,0.6)';
      g.lineWidth = (sel ? 3 : 2) * dpr; g.setLineDash([3 * dpr, 5 * dpr]);
      g.beginPath(); g.moveTo(sp[0].x, sp[0].y); for (const q of sp.slice(1)) g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
      const mid = along(pts, 0.5), mp = toScreen(mid.x, mid.y);
      hits.push({ type: 'route', id: r.id, sx: mp.x, sy: mp.y, x: mid.x, y: mid.y });
      if (!r.ok || !r.cycleH) continue;
      const ships = me.ships.filter((x) => x.routeId === r.id);
      ships.forEach((sh, i) => {
        const ph = ((now / 3_600_000) / r.cycleH + i / ships.length) % 1;
        const out = ph < 0.5, f = out ? ph * 2 : 2 - ph * 2;
        const q = along(pts, f), p = toScreen(q.x, q.y);
        hits.push({ type: 'ship', id: sh.id, sx: p.x, sy: p.y, x: q.x, y: q.y, r: 2 * u });
        if (S.follow === sh.id) { view.tcx = q.x; view.tcy = q.y; S.followAt = { x: q.x, y: q.y, out, routeId: r.id }; g.strokeStyle = '#ffd23f'; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(p.x, p.y, 13 * u, 0, Math.PI * 2); g.stroke(); }
        g.save(); g.translate(p.x, p.y); g.rotate(q.a + (out ? 0 : Math.PI));
        const L = sh.cls === 'leviathan' ? 1.6 : sh.cls === 'clipper' ? 0.8 : 1;
        g.fillStyle = 'rgba(207,214,238,0.45)'; for (let k2 = 1; k2 <= 3; k2++) g.fillRect(-(6 + k2 * 3) * u * L, -0.5 * u, 2 * u, u);
        g.fillStyle = '#140c1c'; g.fillRect(-6 * u * L, -3.5 * u * L, 12 * u * L, 7 * u * L);
        g.fillStyle = SHIP_COL[sh.cls] || '#fff';
        g.beginPath(); g.moveTo(6 * u * L, 0); g.lineTo(-5 * u * L, -3 * u * L); g.lineTo(-3 * u * L, 0); g.lineTo(-5 * u * L, 3 * u * L); g.closePath(); g.fill();
        if (out) { g.fillStyle = S.routeCargoColor(r); g.fillRect(-3 * u * L, -1 * u, 3 * u, 2 * u); }
        g.restore();
      });
    }

    // your operations
    for (const site of V.sites) {
      if (site.kind === 'exchange') continue;
      const p = toScreen(site.x, site.y);
      const off = site.kind === 'mine' && site.id === 'pit' ? { x: 10 * u, y: 8 * u } : { x: 0, y: 0 };
      const x = p.x + off.x, y = p.y + off.y;
      if (site.arrive) {
        const f = clamp((now - site.arrive.at) / Math.max(1, site.arrive.doneAt - site.arrive.at), 0, 1);
        g.strokeStyle = '#ffd23f'; g.setLineDash([2 * dpr, 2 * dpr]); g.strokeRect(x - 8 * u, y - 8 * u, 16 * u, 16 * u); g.setLineDash([]);
        g.fillStyle = '#140c1c'; g.fillRect(x - 9 * u, y + 10 * u, 18 * u, 3 * u); g.fillStyle = '#ffd23f'; g.fillRect(x - 9 * u, y + 10 * u, 18 * u * f, 3 * u);
      }
      icon(site.kind, x, y, me.species?.color || '#ff8a3d', u, t);
      const trouble = (site.flags || []).filter((f) => f !== 'staff');
      if (trouble.length && (Math.floor(t * 2.5) % 2 || prefs.reduced)) { const bad = trouble.includes('decision') || trouble.includes('halt'); g.fillStyle = '#140c1c'; g.fillRect(x + 6 * u, y - 15 * u, 6 * u, 10 * u); g.fillStyle = bad ? '#ff5a6e' : '#ffb347'; g.fillRect(x + 7 * u, y - 14 * u, 4 * u, 5 * u); g.fillRect(x + 7 * u, y - 8 * u, 4 * u, 2 * u); }
      const sel = S.sel && S.sel.type === 'site' && S.sel.id === site.id;
      if (sel) { g.strokeStyle = '#ffd23f'; g.lineWidth = 2 * dpr; g.strokeRect(x - 11 * u, y - 11 * u, 22 * u, 22 * u); }
      if (showLabels || site.kind === 'hub') label(site.name.slice(0, 20), x, y + 10 * u + (site.arrive ? 5 * u : 0), KIND_COL[site.kind]);
      hits.push({ type: 'site', id: site.id, sx: x, sy: y, x: site.x, y: site.y, r: 4 * u });
    }

    // destination picking: pulse what you can ship to
    if (mode && mode.kind === 'dest') {
      const targets = [...(S.world.npc || []).map((n) => ({ x: n.x, y: n.y })), ...V.sites.filter((x) => x.kind === 'refinery' && x.level >= 1), ...(S.world.directory || []).filter((d) => d.uid !== S.me.id && d.on)];
      if (mode.pick === 'source') targets.splice(0, targets.length, ...V.sites.filter((x) => x.kind === 'mine' && x.level >= 1), ...(S.world.camps || []), ...(S.world.gates || []).filter((d) => d.uid !== S.me.id && d.on));
      g.strokeStyle = '#ffd23f'; g.lineWidth = 2 * dpr;
      for (const q of targets) { const p = toScreen(q.x, q.y); g.beginPath(); g.arc(p.x, p.y, (12 + 3 * Math.sin(t * 5)) * u, 0, Math.PI * 2); g.stroke(); }
    }
    // selection crosshair on a plain spot
    if (S.sel && S.sel.type === 'spot') {
      const p = toScreen(S.sel.x, S.sel.y);
      g.strokeStyle = '#f4edff'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(p.x - 9 * u, p.y); g.lineTo(p.x - 3 * u, p.y); g.moveTo(p.x + 3 * u, p.y); g.lineTo(p.x + 9 * u, p.y); g.moveTo(p.x, p.y - 9 * u); g.lineTo(p.x, p.y - 3 * u); g.moveTo(p.x, p.y + 3 * u); g.lineTo(p.x, p.y + 9 * u); g.stroke();
    }
    // the exchange in orbit
    if (me.exchange) {
      const hub = V.sites.find((x) => x.kind === 'hub');
      if (hub) {
        const p = toScreen(hub.x, hub.y);
        const a = prefs.reduced ? -0.8 : t * 0.4;
        const rx = 34 * u, ry = 14 * u;
        g.strokeStyle = 'rgba(184,146,255,0.35)'; g.setLineDash([3 * dpr, 4 * dpr]); g.beginPath(); g.ellipse(p.x, p.y, rx, ry, -0.4, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        const ex = p.x + Math.cos(a) * rx * Math.cos(-0.4) - Math.sin(a) * ry * Math.sin(-0.4), ey = p.y + Math.cos(a) * rx * Math.sin(-0.4) + Math.sin(a) * ry * Math.cos(-0.4);
        g.fillStyle = '#140c1c'; g.fillRect(ex - 6 * u, ey - 4 * u, 12 * u, 8 * u);
        g.fillStyle = me.exchange.level >= 1 ? '#b892ff' : '#5a4a7a'; g.fillRect(ex - 5 * u, ey - 3 * u, 10 * u, 6 * u);
        g.fillStyle = '#7ad1ff'; g.fillRect(ex - 10 * u, ey - u, 4 * u, 2 * u); g.fillRect(ex + 6 * u, ey - u, 4 * u, 2 * u);
        hits.push({ type: 'exchange', id: 'exchange', sx: ex, sy: ey, x: hub.x, y: hub.y });
      }
    }
  }

  let raf = 0;
  const loop = (ms) => { raf = requestAnimationFrame(loop); try { draw(ms); } catch (e) { console.error(e); cancelAnimationFrame(raf); setTimeout(() => { raf = requestAnimationFrame(loop); }, 1000); } };
  raf = requestAnimationFrame(loop);
  return { focus, zoomBy, view, toScreen: (x, y) => { const p = toScreen(x, y); return { x: p.x / dpr, y: p.y / dpr }; } };
}
