/* Feedback: toasts, banners, floating numbers, WebAudio blips, reduced motion. */
import { $, esc, store } from './util.js';

export const prefs = Object.assign(
  { sound: true, reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false },
  store('msc2_prefs') || {},
);
export function setPref(k, v) { prefs[k] = v; store('msc2_prefs', prefs); applyPrefs(); }
export function applyPrefs() { document.body.classList.toggle('rm', !!prefs.reduced); }

// ---------------------------------------------------------------- sound
let ctx = null;
function audio() {
  if (!prefs.sound) return null;
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
window.addEventListener('pointerdown', () => { if (prefs.sound) audio(); }, { capture: true });

function tone(freqs, step = 0.06, type = 'square', vol = 0.04, slide = 0) {
  const a = audio(); if (!a || a.state !== 'running') return;
  const t0 = a.currentTime + 0.005;
  freqs.forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0 + i * step);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t0 + (i + 1) * step);
    g.gain.setValueAtTime(0, t0 + i * step);
    g.gain.linearRampToValueAtTime(vol, t0 + i * step + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + (i + 1) * step + 0.04);
    o.connect(g).connect(a.destination);
    o.start(t0 + i * step); o.stop(t0 + (i + 1) * step + 0.06);
  });
}
function noise(dur = 0.4, from = 300, to = 1800, vol = 0.05) {
  const a = audio(); if (!a || a.state !== 'running') return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, a.currentTime); f.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination); src.start();
}
let lastCoin = 0;
export const sfx = {
  tap: () => tone([660], 0.03, 'square', 0.02),
  buy: () => tone([523, 784], 0.05, 'square', 0.035),
  big: () => tone([523, 659, 784, 1047], 0.06, 'square', 0.035),
  coin: () => { const t = performance.now(); if (t - lastCoin < 180) return; lastCoin = t; tone([1319, 1976], 0.06, 'square', 0.03); },
  unlock: () => tone([392, 523, 659, 784, 1047], 0.08, 'triangle', 0.06),
  error: () => tone([196, 147], 0.09, 'sawtooth', 0.03),
  launch: () => noise(0.7, 200, 2400, 0.05),
  warn: () => tone([880, 660, 880], 0.07, 'triangle', 0.04),
};

// ---------------------------------------------------------------- toasts
export function toast(text, kind = 'info', ms = 3600) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = text;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
}

// ---------------------------------------------------------------- banner
let bannerQ = [], bannerOn = false;
export function banner(title, sub = '', kind = 'unlock') {
  bannerQ.push({ title, sub, kind });
  if (!bannerOn) nextBanner();
}
function nextBanner() {
  const b = bannerQ.shift();
  const el = $('#banner');
  if (!b || !el) { bannerOn = false; return; }
  bannerOn = true;
  el.className = 'banner show ' + b.kind;
  el.innerHTML = `<div class="bn-in"><small>${b.kind === 'license' ? 'Maker Guild' : 'Unlocked'}</small><b>${esc(b.title)}</b>${b.sub ? `<span>${esc(b.sub)}</span>` : ''}</div>`;
  if (!prefs.reduced) confetti(el);
  sfx.unlock();
  setTimeout(() => { el.className = 'banner'; setTimeout(nextBanner, 350); }, 2600);
}
function confetti(host) {
  const cols = ['#ffd23f', '#ff8a3d', '#5ee6a8', '#7ad1ff', '#b892ff', '#ff5ec4'];
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('i');
    c.className = 'cf';
    c.style.left = (5 + Math.random() * 90) + '%';
    c.style.background = cols[i % cols.length];
    c.style.animationDelay = (Math.random() * 0.4) + 's';
    c.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
    host.appendChild(c);
    setTimeout(() => c.remove(), 2400);
  }
}

// ---------------------------------------------------------------- floating numbers (DOM, anchored to an element)
export function popAt(el, text, cls = 'coin') {
  if (!el) return;
  if (document.querySelectorAll('.pop').length >= (innerWidth < 600 ? 2 : 4)) return; // keep small screens readable
  const r = el.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'pop ' + cls;
  p.textContent = text;
  p.style.left = (r.left + r.width / 2) + 'px';
  p.style.top = (r.top + r.height / 2) + 'px';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1300);
}
export function bump(el) {
  if (!el || prefs.reduced) return;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ---------------------------------------------------------------- number tick-up
export class Ticker {
  constructor() { this.shown = null; }
  step(target, dt) {
    if (this.shown == null || prefs.reduced || !Number.isFinite(this.shown)) { this.shown = target; return target; }
    const diff = target - this.shown;
    if (Math.abs(diff) < 0.01 * Math.max(1, Math.abs(target)) * 0.01) { this.shown = target; return target; }
    // spend snaps down fast; income rolls up
    const k = diff < 0 ? 0.5 : 1 - Math.pow(0.002, dt);
    this.shown += diff * Math.min(1, k);
    return this.shown;
  }
}
