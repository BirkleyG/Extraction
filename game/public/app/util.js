/* Small shared helpers for the v2 client. */
import { fmt as engineFmt, TUNING } from '/shared/engine/index.js';
import { oreSpriteSpec } from '/shared/planet/index.js';
import { oreSprite, personSprite } from './pixel/index.js';
import { speciesSprite, speciesBustURL } from './pixel/species.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => engineFmt(n);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const DAY = 86_400_000;
export { TUNING };

export function hash(s) {
  let h = 2166136261 >>> 0;
  s = String(s ?? '');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

export function dur(ms) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m % 60}m`;
  if (m >= 1) return `${m}m ${s % 60 ? (s % 60) + 's' : ''}`.trim();
  return `${s}s`;
}
export const secs = (s) => (s >= 90 ? `${Math.round(s / 6) / 10}m` : `${Math.round(s)}s`);
export function ago(t, now = Date.now()) {
  const d = Math.max(0, now - t);
  if (d < 60_000) return 'now';
  if (d < 3_600_000) return Math.floor(d / 60_000) + 'm';
  if (d < DAY) return Math.floor(d / 3_600_000) + 'h';
  return Math.floor(d / DAY) + 'd';
}

// The server strips planet ore base values before running the engine; the client must do the same
// so its predictions match. Cached per planet so the engine's per-planet info cache stays warm.
const ewCache = new Map();
export function enginePlanet(planet) {
  const key = planet.id + '|' + planet.seed;
  let p = ewCache.get(key);
  if (!p) {
    p = { ...planet, ores: planet.ores.map((o) => { const { baseValue, ...rest } = o; return rest; }) };
    ewCache.set(key, p);
  }
  return p;
}
export const engineWorld = (world) => ({ ...world, planet: enginePlanet(world.planet) });

// Ore icons as data URLs (for DOM lists), cached.
const oreImgCache = new Map();
export function oreImg(ore, size = 16) {
  const key = ore.id + '|' + size;
  let u = oreImgCache.get(key);
  if (!u) { u = oreSprite(oreSpriteSpec(ore), size).toDataURL(); oreImgCache.set(key, u); }
  return u;
}
export const oreIcon = (ore, size = 16) => (ore ? `<img class="oreic" src="${oreImg(ore, size)}" width="${size}" height="${size}" alt="">` : '');

// Species look: the colour is chosen; the head is derived from the name until the builder arrives.
const HEADS = ['dome', 'tall', 'cyclops', 'antenna', 'horn', 'tentacle', 'visor'];
const SKINS = ['#f2c9a5', '#9ad08a', '#c8a2e8', '#8ac8e0', '#e8a08a', '#d8d070', '#b0b8c8'];
export function speciesLook(species) {
  const h = hash(species?.name || 'kin');
  return { color: species?.color || '#ff8a3d', head: HEADS[h % HEADS.length], skin: SKINS[(h >> 4) % SKINS.length] };
}
export function minerImg(species, pose = 'walk', frame = 0) {
  return speciesSprite(species, pose, frame);
}
// Tiny head-and-shoulders portrait for lists (leaderboard, bulletin).
export const speciesIcon = (species, size = 20) => `<img class="spic" src="${speciesBustURL(species)}" width="${size}" height="${Math.round(size * 0.9)}" alt="">`;

export const TIER_COL = { common: '#c8d0d8', rare: '#7ad1ff', mythic: '#ff9f3d' };
export const SPECIES_COLORS = ['#ff8a3d', '#ffd23f', '#5ee6a8', '#7ad1ff', '#b892ff', '#ff5ec4', '#ff5a6e', '#e8e4f2'];

export function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
  return val;
}
