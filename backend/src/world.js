// Seeded planet generation (sections 04, 11). Pure and deterministic: the same seed and inputs always
// give the same planet. The result holds server-only truth (veins, exact richness); clients must only
// ever receive filtered projections (section 18/20).
import { createStepRng } from './events.js';

export class WorldError extends Error {
  constructor(code, message = code) { super(message); this.name = 'WorldError'; this.code = code; }
}
const fail = (code, message = code) => { throw new WorldError(code, message); };

export const WORLD_SCHEMA_VERSION = 1;
// C-03 provisional: units per vein = richness fraction x tier constant.
export const VEIN_UNITS = Object.freeze({ rare: 400_000, mythic: 150_000 });
const RARE_COVERAGE = 0.37;       // each rare ore appears at ~37% of sites (section 04)
const TOUGH_REGION_SHARE = 0.15;  // regions with hardness >= 8
const MYTHIC_IN_TOUGH = 1 / 3;    // => ~5% of all sites hold mythic ore
const WEATHER = Object.freeze(['clear', 'dust', 'storm', 'ash', 'cold']);
const SOILS = Object.freeze(['loam', 'basalt', 'shale', 'granite', 'obsidian']);

// Value weights are for start-site fairness only; they are not prices.
const VALUE_WEIGHT = Object.freeze({ common: 1, rare: 3, mythic: 8 });

function streams(seed) {
  const cache = new Map();
  return (scope) => {
    if (!cache.has(scope)) cache.set(scope, createStepRng(seed, `world:${scope}`, 0));
    return cache.get(scope);
  };
}
const between = (rng, lo, hi) => lo + rng.int(hi - lo + 1);
const pct = (rng, lo = 20, hi = 100) => between(rng, lo, hi);

export function siteValue(world, site) {
  let value = 0;
  for (const deposit of site.deposits) value += deposit.richness * VALUE_WEIGHT[world.ores[deposit.oreIndex].tier];
  return value;
}

/**
 * @param {{seed: string, monthId: string, players: number}} input `players` is the number of start
 * slots to create (enrolment ceiling); the planet scales with it (6-12 regions per active player).
 */
export function generateWorld({ seed, monthId, players }) {
  if (typeof seed !== 'string' || seed.length < 8 || seed.length > 256) fail('INVALID_SEED');
  if (typeof monthId !== 'string' || !/^\d{4}-\d{2}$/.test(monthId)) fail('INVALID_MONTH');
  if (!Number.isSafeInteger(players) || players < 1 || players > 100) fail('INVALID_PLAYERS');
  const rngFor = streams(seed);

  // Seven ores: two common, four rare, one mythic. Names are deterministic fallbacks; the AI may rename later.
  const tiers = ['common', 'common', 'rare', 'rare', 'rare', 'rare', 'mythic'];
  const hardnessRng = rngFor('ore-hardness');
  const ores = tiers.map((tier, index) => ({
    id: `ore-${index + 1}`,
    index,
    tier,
    name: `${tier === 'common' ? 'Common' : tier === 'rare' ? 'Rare' : 'Mythic'} Ore ${index + 1}`,
    hardness: tier === 'common' ? between(hardnessRng, 1, 2) : tier === 'rare' ? between(hardnessRng, 5, 6) : between(hardnessRng, 9, 10),
  }));

  const regionRng = rngFor('regions');
  const regionCount = Math.max(6, players * between(regionRng, 6, 12));
  const toughCount = Math.max(1, Math.round(regionCount * TOUGH_REGION_SHARE));
  const toughIds = new Set();
  while (toughIds.size < toughCount) toughIds.add(regionRng.int(regionCount));

  const regions = [];
  const sites = [];
  for (let r = 0; r < regionCount; r += 1) {
    const rng = rngFor(`region:${r}`);
    const tough = toughIds.has(r);
    const region = {
      id: `region-${r + 1}`,
      commonOreIndex: rng.int(2), // common ores are exclusive per region
      soilHardness: tough ? between(rng, 8, 10) : between(rng, 1, 7),
      soil: SOILS[rng.int(SOILS.length)],
      weather: WEATHER[rng.int(WEATHER.length)],
      center: { x: rng.int(1000), y: rng.int(1000) },
      siteIds: [],
    };
    const siteCount = between(rng, 3, 6);
    for (let k = 0; k < siteCount; k += 1) {
      const site = {
        id: `${region.id}-site-${k + 1}`,
        regionId: region.id,
        position: { x: region.center.x + rng.int(61) - 30, y: region.center.y + rng.int(61) - 30 },
        deposits: [{ oreIndex: region.commonOreIndex, richness: pct(rng, 30, 100), veins: [] }],
        weather: rng.next() < 0.7 ? region.weather : WEATHER[rng.int(WEATHER.length)],
        startSlot: null,
      };
      for (let ore = 2; ore <= 5; ore += 1) {
        if (rng.next() < RARE_COVERAGE) site.deposits.push({ oreIndex: ore, richness: pct(rng), veins: [] });
      }
      if (tough && rng.next() < MYTHIC_IN_TOUGH) site.deposits.push({ oreIndex: 6, richness: pct(rng, 20, 100), veins: [] });
      region.siteIds.push(site.id);
      sites.push(site);
    }
    regions.push(region);
  }
  // A planet always has at least one mythic deposit somewhere (regenerate deterministically: force one).
  if (!sites.some((s) => s.deposits.some((d) => d.oreIndex === 6))) {
    const rng = rngFor('force-mythic');
    const candidates = sites.filter((s) => toughIds.has(Number(s.regionId.split('-')[1]) - 1));
    candidates[rng.int(candidates.length)].deposits.push({ oreIndex: 6, richness: pct(rng, 40, 100), veins: [] });
  }

  const world = { schemaVersion: WORLD_SCHEMA_VERSION, monthId, ores, regions, sites, startSites: [] };

  // Veins (server-only truth). Rare and mythic deposits get 1-3 veins that split richness x tier constant.
  const veinRng = rngFor('veins');
  for (const site of sites) {
    for (const deposit of site.deposits) {
      const tier = ores[deposit.oreIndex].tier;
      if (tier === 'common') continue;
      const count = 1 + veinRng.int(3);
      const total = Math.round((deposit.richness / 100) * VEIN_UNITS[tier]);
      let left = total;
      for (let v = 0; v < count; v += 1) {
        const units = v === count - 1 ? left : Math.floor(left / (count - v));
        deposit.veins.push({ units, remaining: units });
        left -= units;
      }
    }
  }

  // Starting sites: equal expected value, about one standard deviation above the planet average; no mythic.
  const eligible = sites.filter((s) => !s.deposits.some((d) => d.oreIndex === 6));
  const values = eligible.map((s) => siteValue(world, s));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  const target = Math.round(mean + sd);
  const startRng = rngFor('start-sites');
  const used = new Set();
  const usedRegions = new Set();
  const ranked = eligible.map((s) => ({ site: s, gap: Math.abs(siteValue(world, s) - target) })).sort((a, b) => a.gap - b.gap || (a.site.id < b.site.id ? -1 : 1));
  // Scaling richness to hit the target can clamp at 100% or round badly; only accept candidates that land within 2%.
  const scaled = (site) => {
    const factor = target / siteValue(world, site);
    const deposits = site.deposits.map((d) => ({ ...d, richness: Math.min(100, Math.max(1, Math.round(d.richness * factor))) }));
    const value = deposits.reduce((sum, d) => sum + d.richness * VALUE_WEIGHT[ores[d.oreIndex].tier], 0);
    return Math.abs(value - target) / target <= 0.02 ? deposits : null;
  };
  for (let slot = 0; slot < players; slot += 1) {
    const open = ranked.filter((c) => !used.has(c.site.id) && scaled(c.site));
    const fresh = open.filter((c) => !usedRegions.has(c.site.regionId));
    const pool = (fresh.length ? fresh : open).slice(0, 8);
    if (!pool.length) fail('NOT_ENOUGH_SITES');
    const pick = pool[startRng.int(pool.length)];
    used.add(pick.site.id);
    usedRegions.add(pick.site.regionId);
    pick.site.deposits = scaled(pick.site).map((d) => {
      const tier = ores[d.oreIndex].tier;
      if (tier === 'common') return d;
      const veins = []; let left = Math.round((d.richness / 100) * VEIN_UNITS[tier]);
      const n = d.veins.length || 1;
      for (let i = 0; i < n; i += 1) { const units = i === n - 1 ? left : Math.floor(left / (n - i)); veins.push({ units, remaining: units }); left -= units; }
      return { ...d, veins };
    });
    pick.site.startSlot = slot;
    world.startSites.push({ slot, siteId: pick.site.id, value: siteValue(world, pick.site) });
  }
  world.startTargetValue = target;
  return world;
}

/** Look up a site's static data by id (server-side helper). */
export function findSite(world, siteId) {
  const site = world.sites.find((s) => s.id === siteId);
  if (!site) fail('UNKNOWN_SITE');
  return site;
}
