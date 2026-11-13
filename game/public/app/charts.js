/* Plain canvas line charts in the pixel style: hard 2px lines, dotted grid, Silkscreen labels.
 * Hover or tap to read the nearest point of every series at that time. */
const PAD = { l: 44, r: 10, t: 10, b: 20 };

export function lineChart(cv, opt) {
  cv._opt = opt;
  if (!cv._wired) {
    cv._wired = true;
    const at = (e) => { const r = cv.getBoundingClientRect(); cv._hover = e.clientX - r.left; draw(cv); };
    cv.addEventListener('pointermove', at);
    cv.addEventListener('pointerdown', at);
    cv.addEventListener('pointerleave', () => { cv._hover = null; draw(cv); });
  }
  draw(cv);
}

function draw(cv) {
  const o = cv._opt;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(160, cv.clientWidth || 300), H = o.height || 150;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#130d1f'; g.fillRect(0, 0, W, H);
  const series = (o.series || []).filter((s) => s.points && s.points.length);
  g.font = '8px Silkscreen, monospace'; g.textBaseline = 'middle';
  if (!series.length) {
    g.fillStyle = '#b3a5d3'; g.textAlign = 'center';
    g.fillText(o.empty || 'No data yet', W / 2, H / 2); g.textAlign = 'left';
    return;
  }
  let x0 = Infinity, x1 = -Infinity, y0 = o.yMin ?? Infinity, y1 = o.yMax ?? -Infinity;
  for (const s of series) for (const [x, y] of s.points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); if (o.yMin == null) y0 = Math.min(y0, y); if (o.yMax == null) y1 = Math.max(y1, y); }
  if (o.zero) y0 = Math.min(0, y0);
  if (x1 - x0 < 1) { x0 -= 1800e3; x1 += 1800e3; }
  if (y1 - y0 < 1e-9) { y1 += Math.abs(y1) * 0.1 || 1; y0 -= o.zero ? 0 : Math.abs(y0) * 0.1 || 1; }
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const X = (x) => PAD.l + ((x - x0) / (x1 - x0)) * iw;
  const Y = o.invert ? (y) => PAD.t + ((y - y0) / (y1 - y0)) * ih : (y) => PAD.t + ih - ((y - y0) / (y1 - y0)) * ih;
  // grid + y labels
  const ticks = o.intTicks ? [...new Set([0, 1, 2, 3].map((i) => Math.round(y0 + ((y1 - y0) * i) / 3)))] : [0, 1, 2, 3].map((i) => y0 + ((y1 - y0) * i) / 3);
  for (const v of ticks) {
    const y = Math.round(Y(v));
    for (let x = PAD.l; x < W - PAD.r; x += 4) { g.fillStyle = '#3b2d5c'; g.fillRect(x, y, 2, 1); }
    g.fillStyle = '#b3a5d3'; g.textAlign = 'right'; g.fillText(o.yFmt ? o.yFmt(v) : String(Math.round(v)), PAD.l - 4, y);
  }
  // x labels: start, middle, end
  g.textAlign = 'center';
  for (const k of [0, 0.5, 1]) { const v = x0 + (x1 - x0) * k; g.fillText(o.xFmt ? o.xFmt(v) : '', Math.min(W - 24, Math.max(PAD.l + 14, X(v))), H - 8); }
  g.textAlign = 'left';
  // lines
  for (const s of series) {
    g.strokeStyle = s.color || '#ffd23f'; g.lineWidth = s.bold ? 3 : 2; g.lineJoin = 'miter';
    g.beginPath();
    s.points.forEach(([x, y], i) => { const px = Math.round(X(x)), py = Math.round(Y(y)); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
    const [lx, ly] = s.points[s.points.length - 1];
    g.fillStyle = s.color || '#ffd23f'; g.fillRect(Math.round(X(lx)) - 2, Math.round(Y(ly)) - 2, 5, 5);
  }
  // hover readout
  const hx = cv._hover;
  if (hx == null || hx < PAD.l - 6 || hx > W - PAD.r + 6) return;
  const tx = x0 + ((Math.max(PAD.l, Math.min(W - PAD.r, hx)) - PAD.l) / iw) * (x1 - x0);
  const rows = series.map((s) => {
    let best = s.points[0];
    for (const p of s.points) if (Math.abs(p[0] - tx) < Math.abs(best[0] - tx)) best = p;
    return { s, p: best };
  }).sort((a, b) => (o.invert ? a.p[1] - b.p[1] : b.p[1] - a.p[1])).slice(0, 6);
  const px = Math.round(X(rows[0].p[0]));
  g.fillStyle = '#f4edff66'; g.fillRect(px, PAD.t, 1, ih);
  for (const r of rows) { g.fillStyle = '#05030a'; g.fillRect(px - 3, Math.round(Y(r.p[1])) - 3, 7, 7); g.fillStyle = r.s.color || '#ffd23f'; g.fillRect(px - 2, Math.round(Y(r.p[1])) - 2, 5, 5); }
  g.font = '9px Silkscreen, monospace';
  const lines = [o.xFmt ? o.xFmt(rows[0].p[0], true) : '', ...rows.map((r) => `${r.s.name ? r.s.name.slice(0, 14) + ' ' : ''}${o.yFmt ? o.yFmt(r.p[1], true) : r.p[1]}`)];
  const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + 18, bh = lines.length * 12 + 6;
  let bx = px + 8; if (bx + bw > W - 2) bx = px - 8 - bw;
  const by = PAD.t;
  g.fillStyle = 'rgba(12,7,20,0.92)'; g.fillRect(bx, by, bw, bh);
  g.fillStyle = '#ffd23f'; g.fillRect(bx, by, 2, bh);
  lines.forEach((l, i) => {
    if (i) { g.fillStyle = rows[i - 1].s.color || '#ffd23f'; g.fillRect(bx + 6, by + 6 + i * 12 - 3, 6, 6); }
    g.fillStyle = i ? '#f4edff' : '#b3a5d3';
    g.fillText(l, bx + (i ? 15 : 6), by + 9 + i * 12);
  });
}
