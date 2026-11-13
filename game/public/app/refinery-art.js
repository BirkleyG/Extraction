/* Refinery pixel art for the mine view: the on-planet refinery left of the lift (ore in by an overhead
 * belt, glowing ingots out, chimney smoke with outPerMin) and the orbital station in the sky that ships
 * fly to. Pure drawing; mine.js passes the pen, a particle emitter and the refinery's rates. */
export const REF = { X: -78, W: 34, STX: 196, STY: -124 };

const fill = (x) => (x && x.cap > 0 ? Math.min(1, x.stock / x.cap) : 0);
const gauge = (P, x, y, w, f, full, t) => {
  P.rect(x, y, w, 3, '#2a2040');
  P.rect(x, y, Math.round(w * f), 3, full ? (Math.floor(t * 3) % 2 ? '#ff5a6e' : '#a8404e') : f > 0.7 ? '#ffb347' : '#5ee6a8');
};

// x = rates().refinery.planet, ingot = refined ore colour
export function drawPlanetRefinery(P, emit, t, dt, x, ingot, reduced) {
  const L = REF.X - REF.W / 2, R = REF.X + REF.W / 2;
  const busy = x.inPerMin > 0.01 && !x.full;
  // overhead feed belt from the headframe to the hopper
  for (let bx = -50; bx <= -16; bx += 10) P.rect(bx, -21, 1, 21, '#3a3a46');
  P.rect(R - 2, -24, -14 - (R - 2), 2, '#2a2a36'); P.rect(R - 2, -24, -14 - (R - 2), 1, '#5a5a6a');
  if (busy) {
    const off = (t * 10) % 7;
    for (let bx = -16 - off; bx > R; bx -= 7) P.rect(bx, -26, 2, 2, '#8a7058');
  }
  // building
  P.rect(L, -22, REF.W, 22, '#4a3e52'); P.rect(L, -22, REF.W, 1, '#6a5e72');
  P.rect(L - 2, -25, REF.W + 4, 3, '#8a3a3a');
  P.rect(R - 6, -30, 6, 6, '#5a4a5a'); // hopper
  P.rect(R - 7, -31, 8, 1, '#7a6a7a');
  // chimney
  P.rect(L + 4, -40, 5, 15, '#3a3a46'); P.rect(L + 3, -41, 7, 2, '#5a5a6a');
  // furnace windows glow with work
  const glow = busy ? (Math.floor(t * 4) % 3 ? '#ffb347' : '#ffd23f') : '#5a3a2a';
  for (let i = 0; i < 3; i++) P.rect(L + 6 + i * 9, -16, 5, 5, glow);
  P.rect(L + 13, -7, 8, 7, '#1a1220'); // door
  // ingots out of the door, stacked on the left
  const n = Math.min(12, Math.ceil(fill(x) * 12 + (x.stock > 0 ? 1 : 0)));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4), col = i % 4;
    const ix = L - 22 + col * 5 + (row % 2) * 2, iy = -3 - row * 3;
    P.rect(ix, iy, 4, 2, ingot); P.rect(ix, iy, 4, 1, '#fff6c8');
  }
  if (busy && !reduced) {
    const k = (t * 0.6) % 1;
    P.rect(L + 13 - k * 14, -3, 4, 2, ingot);
  }
  gauge(P, L, 3, REF.W, fill(x), x.full, t);
  // smoke follows output
  if (!reduced && x.outPerMin > 0 && Math.random() < dt * Math.min(14, 2 + Math.log2(1 + x.outPerMin) * 0.9)) {
    emit({ x: L + 6 + Math.random() * 2, y: -42, vx: -3 + Math.random() * 3, vy: -6 - Math.random() * 4, g: 0, t0: t, life: 2.4, sz: 2 + (Math.random() < 0.4 ? 1 : 0), col: x.full ? '#6a5a5a' : '#c8c0d0', alpha: 0.55 });
  }
  if (busy && !reduced && Math.random() < dt * 3) emit({ x: L + 8 + Math.random() * 20, y: -16, vx: 0, vy: -4, g: 0, t0: t, life: 0.5, sz: 1, col: '#ffd23f', spark: true });
}

// x = rates().refinery.orbital
export function drawStation(P, emit, t, dt, x, ingot, reduced) {
  const cx = REF.STX, cy = REF.STY + (reduced ? 0 : Math.round(Math.sin(t * 0.8) * 1));
  const busy = x.inPerMin > 0.01 && !x.full;
  // solar wings
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? cx - 30 : cx + 12;
    P.rect(x0, cy - 4, 18, 8, '#2a3a6a');
    for (let i = 0; i < 18; i += 4) P.rect(x0 + i, cy - 4, 1, 8, '#4a6ab0');
    P.rect(s < 0 ? cx - 12 : cx + 8, cy - 1, 4, 2, '#7a8494');
  }
  // hub
  P.disc(cx, cy, 9, '#5a6474'); P.disc(cx, cy, 8, '#aab4c4'); P.disc(cx, cy, 5, '#3a3a46');
  P.disc(cx, cy, 3, busy ? (Math.floor(t * 4) % 3 ? '#ffb347' : '#ffd23f') : '#5a3a2a');
  // docking arm below
  P.rect(cx - 1, cy + 8, 3, 7, '#7a8494'); P.rect(cx - 6, cy + 14, 13, 2, '#aab4c4');
  for (const s of [-6, 6]) P.rect(cx + s, cy + 16, 1, 1, Math.floor(t * 2 + (s > 0 ? 1 : 0)) % 2 ? '#5ee6a8' : '#2a4a3a');
  // beacon
  P.rect(cx, cy - 13, 1, 4, '#7a8494');
  if (Math.floor(t * 1.5) % 2) P.rect(cx - 1, cy - 14, 3, 2, '#ff5a6e');
  // refined cargo pods
  const n = Math.min(6, Math.ceil(fill(x) * 6));
  for (let i = 0; i < n; i++) { P.rect(cx - 9 + i * 3, cy - 10, 2, 2, ingot); }
  gauge(P, cx - 15, cy + 19, 30, fill(x), x.full, t);
  if (busy && !reduced && Math.random() < dt * 2) emit({ x: cx + (Math.random() - 0.5) * 10, y: cy - 6, vx: (Math.random() - 0.5) * 6, vy: -3, g: 0, t0: t, life: 0.8, sz: 1, col: '#ffd23f', spark: true });
}
