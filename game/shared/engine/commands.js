// newColony, applyCommand, quote.
import { T, geoSum, geoMax } from './tuning.js';
import { info, clone, num, fmt, cleanName, hashSeed, rngNext, DAY_MS } from './util.js';
import {
  liftRate, liftLvl, liftTrips, liftCapacity, liftBuckets, convRate, yardCap, perMiner, cartRate, gearMult, gearMilestone, shipCap, shipCap2, tripSecs, ensureFleet, emptyFleet, fleetLvl, FLEET_KINDS, holdAt, hold2At, loadMultAt, speedMultAt, fleetMilestone, nextFleetMilestone,
  assignMiners, shaftStatus, grade, evoMult, evoLvl, spectacleOf, priceAt, shaftCost, bandOf, soilOf,
} from './model.js';
import { advance, toArr, toMap } from './sim.js';
import { licensesOpen, panelFor, syncUnlocks } from './unlocks.js';
import { ensureHz, ensureShaftHz } from './hazards.js';
import { syncTunnel, cuts, commonOre, defaultSite, prospectsOf } from './pockets.js';
import {
  REF_KINDS, emptyRefinery, ensureRef, newRefinery, refThru, refYield, refCap, refDocks, refCfg, refUnit, clampMarkup, refTrip, hasParties,
} from './refinery.js';
import { ensureLedger, ledgerIn, ledgerOut, spendCategory, freshBook } from './ledger.js';

export const ENGINE_VERSION = 6;
const SITE_NAME = { planet: 'on-planet refinery', orbital: 'orbital refinery' };
const SAFETY = { ventilation: 'Ventilation (gas)', pumps: 'Pumps (floods)', firebreaks: 'Firebreaks (yard fires)' };
const MAX_LVL = 400;

const SHIP_NAMES = ['Old Faithful', 'Dusty Mule', 'Rustbucket', 'Lucky Strike', 'Ore Wagon', 'Night Owl', 'Stubborn Goat',
  'Long Haul', 'Copper Kettle', 'Gravel Queen', 'Moonbeam', 'Second Wind', 'Iron Pigeon', 'Slow Poke', 'Gold Digger',
  'Tin Lizzie', 'Deep Pockets', 'Sky Barge', 'Last Chance', 'Comet Tail'];

const planetWorld = (planet) => ({ planet, market: {} });

function makeShip(c, cls) {
  const n = c.ships.length;
  return {
    id: 'p' + (c.nextId++), name: SHIP_NAMES[n % SHIP_NAMES.length] + (n >= SHIP_NAMES.length ? ' ' + (Math.floor(n / SHIP_NAMES.length) + 1) : ''),
    cls, oreId: null, oreId2: null, pickAt: null, policy: 'best', destId: null, state: 'home', readyAt: c.t, cargo: {}, cargoG: {},
    dest: null, dockedAt: null, firstLoadAt: null, departAt: null, arriveAt: null, homeAt: null,
  };
}

// A new shaft: 0 miners (the free first shaft gets T.startMiners), gear 1, cart 1. `opt` = { dir, seed, tilt } (a dig direction).
function makeShaft(c, world, idx, opt = {}) {
  const s = { id: 's' + (c.nextId++), idx, name: `Shaft ${idx + 1}`, dir: opt.dir || 'main', band: bandOf(idx), ore: '',
    miners: idx === 0 ? T.startMiners : 0, gear: 1, cart: 1, up: { lights: 0, supports: 0 },
    face: 0, pk: [], pkN: 0, pkEnd: 0, dug: 0 };
  s.seed = Number.isFinite(opt.seed) ? opt.seed : hashSeed(`${num(c.seed)}|${num(c.nukes)}|${idx}|main`);
  s.tilt = opt.tilt ? { ...opt.tilt } : {};
  syncTunnel(c, info(world), s);
  if (c.hzRng != null) ensureShaftHz(c, s);
  return s;
}

// Starter mine: the free first shaft (a few miners) and one hauler.
function starter(c, world) {
  c.shafts.push(makeShaft(c, world, 0));
  c.ships.push(makeShip(c, 'hauler'));
}

// Dig directions: the two options for the next shaft. Each has its own seed and an ore richness tilt (hidden), so one is often better.
export const DIRS = ['left', 'right'];
const DIR_LABEL = { left: 'Dig left of the main tunnel', right: 'Dig right of the main tunnel' };
function optionFor(c, I, idx, dir) {
  const seed = hashSeed(`${num(c.seed)}|${num(c.nukes)}|${idx}|${dir}`);
  let r = seed;
  const tilt = {};
  const [lo, hi] = T.pk.tiltRange;
  for (const o of I.ores) { const [u, nx] = rngNext(r); r = nx; tilt[o.id] = Math.round((lo + (hi - lo) * u) * 100) / 100; }
  return { dir, seed, tilt };
}
const SCORE = { none: 0, low: 1, fair: 2, good: 3 };
// Exactly 2 options for the next shaft: { dir, label, idx, band, seed, cost, prospects: { [oreId]: 'none'|'low'|'fair'|'good' } }.
export function shaftOptions(colony, world) {
  const c = colony;
  const I = info(world);
  const idx = c.shafts.length;
  if (idx >= T.maxShafts) return [];
  return DIRS.map((dir) => {
    const o = optionFor(c, I, idx, dir);
    const probe = { idx, seed: o.seed, tilt: o.tilt, dir, gear: 1, cart: 1 };
    return { dir, label: DIR_LABEL[dir], idx, band: bandOf(idx), seed: o.seed, cost: shaftCost(idx), prospects: prospectsOf(c, I, probe) };
  });
}
export const prospectScore = (p) => Object.values(p).reduce((a, x) => a + SCORE[x], 0);
const freshStats = () => ({ mined: 0, lifted: 0, loaded: 0, sold: 0, sales: 0, launches: 0, upgrades: 0, spent: 0, firstSaleAt: null, hazards: 0, lost: 0 });

export function newColony({ id, uid, name, species, planet, siteRegion, site, now, grant } = {}) {
  const world = planetWorld(planet);
  now = num(now, 0);
  const g = Math.max(0, num(typeof grant === 'object' && grant ? grant.coin : grant, 0));
  const seed = hashSeed(`${uid ?? id ?? ''}|${planet?.seed ?? planet?.id ?? ''}`);
  const c = {
    v: ENGINE_VERSION,
    id: String(id ?? uid ?? 'colony'), uid: uid ?? null,
    name: cleanName(name, 'New Colony'), species: species ?? null, siteRegion: siteRegion ?? null,
    planetId: planet?.id ?? null, seed, rng: seed,
    t: now, born: now,
    coin: T.startCoin + g, earned: 0, grant: g, runEarned: 0, monthEarned: 0,
    sp: 0, evo: { mine: 0, ship: 0, sell: 0, spectacle: 0 }, nukes: 0, lastNuke: null,
    miners: 0, idle: 0, site: null,
    lift: { speed: 0, capacity: 0, buckets: 0 }, conveyor: 0, yardLvl: 0, pads: 1,
    tunnel: {}, tunnelG: {}, yard: {}, yardG: {},
    shafts: [], ships: [], fleet: emptyFleet(),
    stats: freshStats(),
    unlocked: { panels: [], licenses: [] }, tutorial: 0, nextId: 1,
    refinery: emptyRefinery(), refineMemo: {},
  };
  c.site = makeSite(site, info(world), siteRegion);
  ensureHz(c);
  ensureLedger(c);
  ledgerIn(c, 'grant', g);
  starter(c, world);
  assignMiners(c, world);
  syncUnlocks(c, world, now, []);
  return c;
}

// colony.site = { id, regionId, soil, richness, veinSize, common }; without a site, a default one (the first common, all rares at 0.37).
function makeSite(site, I, siteRegion) {
  const d = defaultSite(I, siteRegion);
  if (!site || typeof site !== 'object') return d;
  const soil = Number(site.soil);
  const out = {
    id: site.id ?? d.id, regionId: site.regionId ?? d.regionId, soil: soil > 0 && Number.isFinite(soil) ? soil : 1,
    richness: {}, veinSize: {}, common: I.idx[site.common] !== undefined ? site.common : d.common,
  };
  for (const o of I.ores) {
    const r = Number(site.richness?.[o.id]), v = Number(site.veinSize?.[o.id]);
    out.richness[o.id] = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : (o.id === out.common ? 1 : 0);
    out.veinSize[o.id] = Number.isFinite(v) && v > 0 ? v : 1;
  }
  return out;
}

// Late joiners: a head start worth roughly a strong player's first day or two, not their whole month.
export function catchUpGrant(world, now) {
  const day = (num(now) - num(world.startedAt)) / DAY_MS;
  if (day < 0.5) return 0;
  return Math.round(25_000 * day * day);
}

// Class upgrade price base (hold / hold2 scale with the class's cargo and upk; loading and speed have their own base).
const fleetBase = (cls, kind) => (kind === 'hold' ? T.fleetUp.hold.cost * T.ship[cls].cap * T.ship[cls].upk
  : kind === 'hold2' ? T.fleetUp.hold2.cost * T.fleetUp.hold2.share * T.ship.freighter.cap * T.ship.freighter.upk : T.fleetUp[kind].cost);
const fms = (kind, from, k) => { const m = fleetMilestone(kind, from + k) / fleetMilestone(kind, from); return m > 1 ? ` · milestone x${m}!` : ''; };
const capPct = (m) => `+${Math.round((m - 1) * 100)}%`;
const gms = (from, k) => (gearMilestone(from + k) > gearMilestone(from) ? ' · milestone x2!' : '');
const ms = (from, k) => (Math.floor((from + k) / T.milestoneEvery) > Math.floor(from / T.milestoneEvery) ? ' · milestone x2!' : '');

function levelPlan(c, cur, max, base, g, n, cap = MAX_LVL) {
  const room = Math.max(0, Math.min(cap, max) - cur);
  if (room <= 0) return { k: 0, cost: Infinity, maxed: true };
  let k;
  if (n === 'max') k = Math.min(room, geoMax(base, g, cur, c.coin));
  else k = Math.min(room, Math.max(1, Math.floor(num(Number(n), 1))));
  const affordable = k > 0;
  if (!affordable) k = 1;
  return { k, cost: geoSum(base, g, cur, k), maxed: false };
}

// Build a plan for a command: { cost, n, effect, apply(c) } or { error }.
function plan(c, world, cmd, now, quoting = false) {
  const I = info(world);
  if (!cmd || typeof cmd.type !== 'string') return { error: 'Bad command' };
  const panel = panelFor(cmd);
  if (panel && !(c.unlocked?.panels || []).includes(panel)) return { error: 'Not unlocked yet' };
  const lic = new Set([...(c.unlocked?.licenses || []), ...licensesOpen(c, world, now)]);
  const n = cmd.n ?? 1;
  switch (cmd.type) {
    case 'hireMiners': {
      const s = c.shafts.find((x) => x.id === cmd.shaftId);
      if (!s) return { error: 'No such shaft' };
      if (s.miners >= T.hire.max) return { error: 'This shaft is fully crewed' };
      const base = T.hire.base * Math.pow(T.shaftScale, s.idx);
      const p = levelPlan(c, s.miners, T.hire.max, base, T.hire.growth, n, 1e6);
      const a = Math.min(s.miners * perMiner(s) / soilOf(c), cartRate(s)), b = Math.min((s.miners + p.k) * perMiner(s) / soilOf(c), cartRate(s));
      const capped = (s.miners + p.k) * perMiner(s) / soilOf(c) > cartRate(s) ? ', the cart is the limit' : '';
      return { ...p, n: p.k, effect: `+${p.k} miner${p.k > 1 ? 's' : ''} in ${s.name} (${s.miners} → ${s.miners + p.k}): ${fmt(a)} → ${fmt(b)} ore/min${capped}`,
        apply: (x) => { x.shafts.find((q) => q.id === s.id).miners += p.k; } };
    }
    case 'buyShaft': {
      const idx = c.shafts.length;
      if (idx >= T.maxShafts) return { error: 'The main tunnel is full' };
      const cost = shaftCost(idx);
      if (!DIRS.includes(cmd.dir)) {
        if (quoting) return { cost, n: 1, k: 1, effect: `Shaft ${idx + 1} (${bandOf(idx)}): choose left or right`, apply: () => {} };
        return { error: 'Choose a direction: left or right' };
      }
      const opt = optionFor(c, I, idx, cmd.dir);
      const probe = { idx, seed: opt.seed, tilt: opt.tilt, dir: cmd.dir, gear: 1, cart: 1 };
      const pr = prospectsOf(c, I, probe);
      const hints = I.ores.filter((o) => o.tier !== 'common' && pr[o.id] !== 'none').map((o) => `${o.name} ${pr[o.id]}`);
      return {
        cost, n: 1, k: 1,
        effect: `Shaft ${idx + 1} (${bandOf(idx)}, ${cmd.dir}): ${commonOre(c, I).name}${hints.length ? '; prospects: ' + hints.join(', ') : ''}`,
        apply: (x) => { x.shafts.push(makeShaft(x, world, idx, opt)); },
      };
    }
    case 'upgradeGear': {
      const s = c.shafts.find((x) => x.id === cmd.shaftId);
      if (!s) return { error: 'No such shaft' };
      const G = T.gear;
      const top = lic.has('mythicDrill') ? G.max : G.free;
      if (s.gear >= top) return { error: s.gear >= G.max ? 'Gear is maxed' : 'Needs the Mythic drill license for gear above ' + G.free };
      const p = levelPlan(c, s.gear - 1, top - 1, G.base * Math.pow(T.shaftScale, s.idx), G.growth, n);
      const to = s.gear + p.k;
      const a = perMiner(s), b = perMiner({ ...s, gear: to });
      const freed = s.pk.some((q) => { const o = I.ores[I.idx[q.ore]]; return q.start <= s.face + 1e-7 && q.start + q.len > s.face && o && !cuts(s, o) && cuts({ ...s, gear: to }, o); });
      return { ...p, n: p.k, effect: `Gear ${s.gear} → ${to} in ${s.name}: +${Math.round(100 * (b / a - 1))}% ore per miner (${fmt(a)} → ${fmt(b)}/min), cuts hardness ${to}${gms(s.gear, p.k)}${freed ? ' · frees the stuck face' : ''}`,
        apply: (x) => { x.shafts.find((q) => q.id === s.id).gear = to; } };
    }
    case 'upgradeCart': {
      const s = c.shafts.find((x) => x.id === cmd.shaftId);
      if (!s) return { error: 'No such shaft' };
      const C = T.cart;
      if (s.cart >= C.max) return { error: 'Cart is maxed' };
      const p = levelPlan(c, s.cart - 1, C.max - 1, C.base * Math.pow(T.shaftScale, s.idx), C.growth, n);
      const to = s.cart + p.k;
      const a = cartRate(s), b = cartRate({ ...s, cart: to });
      return { ...p, n: p.k, effect: `Cart ${s.cart} → ${to} in ${s.name}: hauls +${Math.round(100 * (b / a - 1))}% (${fmt(a)} → ${fmt(b)} ore/min)${gms(s.cart, p.k)}`,
        apply: (x) => { x.shafts.find((q) => q.id === s.id).cart = to; } };
    }
    case 'upgradeShaft': {
      const s = c.shafts.find((x) => x.id === cmd.shaftId);
      if (!s) return { error: 'No such shaft' };
      const kind = cmd.kind;
      if (kind === 'lights' || kind === 'supports') {
        if (s.idx === 0) return { error: 'The home shaft is safe enough' };
        const lv = num(s.up[kind]);
        const p = levelPlan(c, lv, T.shaftSafeMax, T.shaftSafeBase * Math.pow(T.shaftScale, s.idx), T.shaftSafeGrowth, n);
        if (p.maxed) return { error: `${kind === 'lights' ? 'Lights' : 'Supports'} are maxed` };
        const r0 = Math.pow(T.hz.cut, lv), r1 = Math.pow(T.hz.cut, lv + p.k);
        const what = kind === 'lights' ? 'insanity' : 'cave-ins';
        return { ...p, n: p.k, effect: `${what} risk in ${s.name} -${Math.round(100 * (1 - r1 / r0))}% (level ${lv} → ${lv + p.k})`,
          apply: (x) => { const y = x.shafts.find((q) => q.id === s.id); y.up[kind] = num(y.up[kind]) + p.k; } };
      }
      return { error: 'Unknown upgrade' };
    }
    case 'upgradeSafety': {
      const kind = cmd.kind;
      if (!SAFETY[kind]) return { error: 'Unknown safety upgrade' };
      const lv = num(c.safety?.[kind]);
      const p = levelPlan(c, lv, T.safetyMax, T.safetyBase, T.safetyGrowth, n);
      if (p.maxed) return { error: 'Already as safe as it gets' };
      return { ...p, n: p.k, effect: `${SAFETY[kind]}: risk -${Math.round(100 * (1 - Math.pow(T.hz.cut, p.k)))}% (level ${lv} → ${lv + p.k})`,
        apply: (x) => { x.safety = { ventilation: 0, pumps: 0, firebreaks: 0, ...x.safety }; x.safety[kind] += p.k; } };
    }
    case 'nuke': {
      const run = num(c.runEarned);
      if (run < T.nukeMin) return { error: `The Guild needs ${fmt(T.nukeMin)} earned this run to sign off a nuke (you have ${fmt(run)})` };
      const spect = spectacleOf(c, run);
      if (!quoting && cmd.confirm !== 'NUKE') return { error: 'Type NUKE to confirm' };
      return {
        cost: 0, n: 1, k: 1, free: true, spectacle: spect,
        effect: `Spectacle ${spect.toFixed(1)}: +${spect.toFixed(1)} SP. Ships in flight get paid; everything else becomes a crater.`,
        apply: (x, ctx) => nukeColony(x, world, spect, ctx),
      };
    }
    case 'evolve': {
      const e = T.evo[cmd.kind];
      if (!e) return { error: 'Unknown evolution' };
      const lv = evoLvl(c, cmd.kind);
      const g = e.growth;
      const room = Math.max(0, T.evoMax - lv);
      if (!room) return { error: 'Fully evolved' };
      let k = n === 'max' ? Math.min(room, geoMax(e.cost, g, lv, num(c.sp))) : Math.min(room, Math.max(1, Math.floor(num(Number(n), 1))));
      if (k < 1) k = 1;
      const cost = geoSum(e.cost, g, lv, k);
      const a = evoMult(c, cmd.kind), b = evoMult({ evo: { [cmd.kind]: lv + k } }, cmd.kind);
      const what = { mine: 'ore/min', ship: 'ship speed', sell: 'sale prices', spectacle: 'Spectacle at your next nuke' }[cmd.kind];
      return { cost, n: k, k, currency: 'sp', effect: `${e.label} ${lv} → ${lv + k}: ${what} x${a.toFixed(2)} → x${b.toFixed(2)}`,
        apply: (x) => { x.evo = { mine: 0, ship: 0, sell: 0, spectacle: 0, ...x.evo }; x.evo[cmd.kind] = lv + k; } };
    }
    case 'upgradeLift': {
      const kind = cmd.kind;
      const U = T.lift[kind];
      if (!U || !['speed', 'capacity', 'buckets'].includes(kind)) return { error: 'Choose a lift upgrade: speed, capacity or buckets' };
      const lv = liftLvl(c);
      const p = levelPlan(c, lv[kind], U.max, U.cost, U.growth, n);
      if (p.maxed) return { error: 'Maxed out' };
      const mk = evoMult(c, 'mine');
      const to = { ...c, lift: { ...lv, [kind]: lv[kind] + p.k } };
      const a = liftRate(c) * mk, b = liftRate(to) * mk;
      const nowText = kind === 'speed' ? `${liftTrips(lv.speed).toFixed(1)} → ${liftTrips(lv.speed + p.k).toFixed(1)} trips/min`
        : kind === 'capacity' ? `${fmt(liftCapacity(lv.capacity))} → ${fmt(liftCapacity(lv.capacity + p.k))} ore per bucket`
          : `${liftBuckets(lv.buckets)} → ${liftBuckets(lv.buckets + p.k)} buckets`;
      return { ...p, n: p.k, effect: `${U.label}: ${nowText} · lift ${fmt(a)} → ${fmt(b)}/min${kind === 'buckets' ? '' : ms(lv[kind], p.k)}`,
        apply: (x) => { x.lift = { speed: 0, capacity: 0, buckets: 0, ...x.lift }; x.lift[kind] = lv[kind] + p.k; } };
    }
    case 'upgradeConveyor': {
      const p = levelPlan(c, c.conveyor, MAX_LVL, T.convCost, T.convGrowth, n);
      const a = convRate(c.conveyor), b = convRate(c.conveyor + p.k);
      return { ...p, n: p.k, effect: `${capPct(b / a)} conveyors (${fmt(a)} → ${fmt(b)}/min per pad)${ms(c.conveyor, p.k)}`, apply: (x) => { x.conveyor += p.k; } };
    }
    case 'upgradeYard': {
      const p = levelPlan(c, c.yardLvl, MAX_LVL, T.yardCost, T.yardGrowth, n);
      const a = yardCap(c.yardLvl), b = yardCap(c.yardLvl + p.k);
      return { ...p, n: p.k, effect: `${capPct(b / a)} yard (${fmt(a)} → ${fmt(b)} ore)`, apply: (x) => { x.yardLvl += p.k; } };
    }
    case 'buyPad': {
      const p = levelPlan(c, c.pads, T.padMax, T.padCost / T.padGrowth, T.padGrowth, n);
      if (p.maxed) return { error: 'All pads built' };
      return { ...p, n: p.k, effect: `Pads ${c.pads} → ${c.pads + p.k}: ${c.pads + p.k} ships load at once`, apply: (x) => { x.pads += p.k; } };
    }
    case 'buyShip': {
      const cls = cmd.cls || 'hauler';
      if (!T.ship[cls]) return { error: 'Unknown ship class' };
      if (cls !== 'hauler' && !lic.has(cls)) return { error: `Needs the ${T.licenses[cls].label}` };
      if (c.ships.length >= T.maxShips) return { error: 'Fleet is full' };
      // New ships arrive with every class upgrade already in place (class levels are shared), so the price is just the ladder.
      const owned = c.ships.filter((q) => q.cls === cls).length - (cls === 'hauler' ? 1 : 0);
      const cost = T.ship[cls].cost * Math.pow(T.shipFleetGrowth, Math.max(0, owned));
      const near = I.buyers.reduce((a, b) => (T.tripSecs[b.distance] < T.tripSecs[a.distance] ? b : a));
      return {
        cost, n: 1, k: 1,
        effect: `New ${T.ship[cls].label}: ${fmt(shipCap({ cls }, c))} cargo, ${Math.round(tripSecs(near, cls, c))}s to ${near.name}`,
        apply: (x) => { ensureFleet(x); x.ships.push(makeShip(x, cls)); },
      };
    }
    case 'upgradeClass': {
      const cls = cmd.cls, kind = cmd.kind;
      if (!T.ship[cls]) return { error: 'Unknown ship class' };
      if (!FLEET_KINDS[cls].includes(kind)) return { error: `${T.ship[cls].label}s cannot upgrade ${kind}` };
      if (!c.ships.some((q) => q.cls === cls)) return { error: `Buy a ${T.ship[cls].label.toLowerCase()} first` };
      const label = T.ship[cls].label;
      const lv = fleetLvl(c, cls, kind);
      const fleet = c.ships.filter((q) => q.cls === cls).length;
      const apply = (x, k) => { ensureFleet(x); x.fleet[cls][kind] += k; };
      if (kind === 'multi') {
        if (lv > 0) return { error: 'Already unlocked' };
        return { cost: T.fleetUp.multi.cost, n: 1, k: 1, effect: `Unlock a second hold on every Freighter: each carries two ore types at once (then upgrade the second hold)`, apply: (x) => apply(x, 1) };
      }
      if (kind === 'hold2' && !fleetLvl(c, 'freighter', 'multi')) return { error: 'Unlock the second hold (multi-ore) first' };
      const U = T.fleetUp[kind];
      const p = levelPlan(c, lv, U.max, fleetBase(cls, kind), U.growth, n);
      const val = (l) => (kind === 'hold' ? holdAt(cls, l) : kind === 'hold2' ? hold2At(fleetLvl(c, 'freighter', 'hold'), l) : kind === 'loading' ? loadMultAt(l) : speedMultAt(l));
      const a = val(lv), b = val(lv + p.k);
      const what = { hold: 'cargo per ship', hold2: 'second-hold cargo per ship', loading: 'load speed', speed: 'flight speed' }[kind];
      const nums = kind === 'loading' || kind === 'speed' ? `x${a.toFixed(2)} → x${b.toFixed(2)}` : `${fmt(a)} → ${fmt(b)}`;
      const nx = nextFleetMilestone(lv + p.k);
      return { ...p, n: p.k, effect: `${label} ${kind} ${lv} → ${lv + p.k}: ${capPct(b / a)} ${what} (${nums}) on all ${fleet} ${label.toLowerCase()}${fleet === 1 ? '' : 's'}${fms(kind, lv, p.k)}${nx ? ` · next milestone at ${nx}` : ''}`, apply: (x) => apply(x, p.k) };
    }
    case 'setRoute': {
      const s = c.ships.find((x) => x.id === cmd.shipId);
      if (!s) return { error: 'No such ship' };
      if (!['best', 'nearest', 'fixed', 'refinery'].includes(cmd.policy)) return { error: 'Unknown route policy' };
      if (cmd.policy === 'refinery' && !c.refinery?.orbital) return { error: 'Build an orbital refinery first' };
      if (cmd.policy === 'fixed' && I.buyerIdx[cmd.destId] === undefined) return { error: 'Unknown destination' };
      const dest = cmd.policy === 'fixed' ? I.buyers[I.buyerIdx[cmd.destId]].name : null;
      return {
        cost: 0, n: 1, k: 1, free: true,
        effect: cmd.policy === 'refinery' ? `${s.name} delivers ore to your orbital refinery` : cmd.policy === 'fixed' ? `${s.name} always flies to ${dest}` : cmd.policy === 'nearest' ? `${s.name} flies to the nearest buyer` : `${s.name} picks the best coin/min`,
        apply: (x) => { const y = x.ships.find((q) => q.id === s.id); y.policy = cmd.policy; y.destId = cmd.policy === 'fixed' ? cmd.destId : null; },
      };
    }
    case 'buildRefinery': {
      const site = cmd.site;
      if (!T.ref[site] || !['planet', 'orbital'].includes(site)) return { error: 'Unknown refinery site' };
      if (!lic.has('refinery')) return { error: `Needs the ${T.licenses.refinery.label}` };
      if (c.refinery?.[site]) return { error: `You already own an ${SITE_NAME[site]}` };
      const B = T.ref[site], R0 = newRefinery(site);
      const how = site === 'planet' ? 'fed straight from the yard' : `ships fly ${Math.round(refTrip('hauler', c))}s to unload, ${refDocks(R0)} docks`;
      return {
        cost: B.cost, n: 1, k: 1,
        effect: `${B.label}: ${fmt(refThru(site, R0))} ore/min, ${refYield(site, R0).toFixed(2)} refined per ore, stores ${fmt(refCap(site, R0))} (${how})`,
        apply: (x) => { ensureRef(x); x.refinery[site] = newRefinery(site, x.refineMemo?.[site]); },
      };
    }
    case 'upgradeRefinery': {
      const site = cmd.site, kind = cmd.kind;
      const R = c.refinery?.[site];
      if (!R) return { error: `Build the ${SITE_NAME[site] || 'refinery'} first` };
      if (!REF_KINDS.includes(kind)) return { error: 'Unknown refinery upgrade' };
      if (kind === 'docks' && site !== 'orbital') return { error: 'Only the orbital refinery has docks' };
      const U = T.ref.up[kind], lv = num(R.lvl?.[kind]);
      const p = levelPlan(c, lv, U.max, T.ref[site].cost * U.base, U.growth, n);
      if (p.maxed) return { error: 'Maxed out' };
      const R1 = { ...R, lvl: { ...R.lvl, [kind]: lv + p.k } };
      const pct = (a, b) => `+${Math.round((b / a - 1) * 100)}%`;
      let effect;
      if (kind === 'throughput') { const a = refThru(site, R), b = refThru(site, R1); effect = `${pct(a, b)} throughput (${fmt(a)} → ${fmt(b)} ore/min)`; }
      else if (kind === 'yield') { const a = refYield(site, R), b = refYield(site, R1); effect = `${pct(a, b)} yield (${a.toFixed(2)} → ${b.toFixed(2)} refined per ore)`; }
      else if (kind === 'storage') { const a = refCap(site, R), b = refCap(site, R1); effect = `${pct(a, b)} storage (${fmt(a)} → ${fmt(b)})`; }
      else effect = `Docks ${refDocks(R)} → ${refDocks(R1)}: ${refDocks(R1)} ships can fly to the refinery at once`;
      return { ...p, n: p.k, effect, apply: (x) => { const y = x.refinery[site]; y.lvl = { throughput: 0, yield: 0, storage: 0, docks: 0, ...y.lvl }; y.lvl[kind] = lv + p.k; } };
    }
    case 'setRefine': {
      const site = cmd.site;
      const R = c.refinery?.[site];
      if (!R) return { error: `Build the ${SITE_NAME[site] || 'refinery'} first` };
      const o = I.idx[cmd.oreId];
      if (o === undefined) return { error: 'Unknown ore' };
      if (cmd.markup !== undefined && !Number.isFinite(Number(cmd.markup))) return { error: 'Bad markup' };
      const cur = refCfg(R, cmd.oreId);
      const on = cmd.on === undefined ? cur.on : !!cmd.on;
      const markup = cmd.markup === undefined ? cur.markup : Math.round(clampMarkup(cmd.markup) * 100) / 100;
      const unit = refUnit(I, o) * evoMult(c, 'sell');
      const priced = hasParties(world, I) ? `ask ${markup.toFixed(2)}x (${fmt(markup * unit)} coin per refined unit)` : `the Guild computer buys at ${T.ref.computer}x (${fmt(T.ref.computer * unit)} coin per unit)`;
      return {
        cost: 0, n: 1, k: 1, free: true,
        effect: `${I.ores[o].name}: ${on ? 'refine' : 'stop refining'}, ${priced}`,
        apply: (x) => {
          const y = x.refinery[site];
          y.ores = { ...y.ores, [cmd.oreId]: { on, markup } };
          x.refineMemo = { ...(x.refineMemo || {}), [site]: { ...y.ores } };
        },
      };
    }
    case 'rename': {
      const name = cleanName(cmd.name);
      if (!name) return { error: 'Name is empty' };
      const list = cmd.target === 'colony' ? null : cmd.target === 'shaft' ? c.shafts : cmd.target === 'ship' ? c.ships : undefined;
      if (list === undefined) return { error: 'Unknown rename target' };
      if (list && !list.find((x) => x.id === cmd.id)) return { error: 'Not found' };
      return {
        cost: 0, n: 1, k: 1, free: true, effect: `Renamed to ${name}`,
        apply: (x) => { if (!list) x.name = name; else (cmd.target === 'shaft' ? x.shafts : x.ships).find((q) => q.id === cmd.id).name = name; },
      };
    }
    case 'tutorial': {
      const step = Math.max(0, Math.min(5, Math.floor(num(Number(cmd.step), 0))));
      return { cost: 0, n: 1, k: 1, free: true, effect: '', apply: (x) => { x.tutorial = Math.max(num(x.tutorial), step); } };
    }
    default: return { error: 'Unknown command' };
  }
}

export function quote(colony, world, cmd) {
  const p = plan(colony, world, cmd, colony.t, true);
  if (p.error) return { cost: 0, effect: '', canAfford: false, n: 0, error: p.error };
  const cost = Number.isFinite(p.cost) ? p.cost : Infinity;
  const have = p.currency === 'sp' ? num(colony.sp) : colony.coin;
  const q = { cost, effect: p.effect, canAfford: Number.isFinite(cost) && have >= cost - 1e-9, n: p.n ?? 1 };
  if (p.currency) q.currency = p.currency;
  if (p.spectacle != null) q.spectacle = p.spectacle;
  return q;
}

// Apply a command to an already-advanced colony (mutates c). Returns error string or null.
// `sales` (optional array) collects ore sold by the command itself (a nuke settles ships in flight).
export function applyNow(c, world, cmd, events, sales) {
  ensureHz(c);
  ensureFleet(c);
  ensureRef(c);
  const p = plan(c, world, cmd, c.t);
  if (p.error) return p.error;
  if (!Number.isFinite(p.cost)) return 'Maxed out';
  if (p.currency === 'sp') {
    if (num(c.sp) < p.cost - 1e-9) return `Not enough SP: need ${p.cost.toFixed(1)}`;
    c.sp = Math.max(0, num(c.sp) - p.cost);
    p.apply(c);
    events.push({ type: 'evolve', text: p.effect, at: c.t, data: { kind: cmd.kind, sp: p.cost, n: p.n, level: c.evo[cmd.kind] } });
    assignMiners(c, world);
    return null;
  }
  if (c.coin < p.cost - 1e-9) return `Not enough coin: need ${fmt(p.cost)}`;
  c.coin = Math.max(0, c.coin - p.cost);
  p.apply(c, { events, sales });
  if (!p.free) {
    ensureLedger(c);
    ledgerOut(c, spendCategory(cmd), p.cost);
    c.stats.spent += p.cost;
    if (cmd.type !== 'hireMiners') c.stats.upgrades++;
    events.push({ type: 'buy', text: p.effect, at: c.t, data: { cmd: cmd.type, cost: p.cost, n: p.n } });
  }
  assignMiners(c, world);
  syncUnlocks(c, world, c.t, events);
  return null;
}

export function applyCommand(colony, world, cmd, now) {
  const r = advance(colony, world, now);
  const c = r.colony;
  const events = r.events;
  const extra = [];
  const error = applyNow(c, world, cmd, events, extra);
  const sales = mergeSales(r.sales, extra);
  return error ? { colony: c, events, sales, error } : { colony: c, events, sales };
}
function mergeSales(a, b) {
  if (!b.length) return a;
  const m = {};
  for (const s of [...a, ...b]) m[s.oreId] = (m[s.oreId] || 0) + s.amount;
  return Object.entries(m).map(([oreId, amount]) => ({ oreId, amount }));
}

// The nuke: pay ships already flying at today's price, then start over from a starter mine.
// Keeps SP, evolutions, month totals, name, species, site and unlocked panels/licenses. Mutates c.
function nukeColony(c, world, spect, ctx = {}) {
  const I = info(world);
  const sellK = evoMult(c, 'sell');
  let paid = 0;
  const sold = new Array(I.n).fill(0);
  for (const s of c.ships) {
    if (s.state !== 'out') continue;
    const bi = I.buyerIdx[s.dest] ?? 0;
    const cargo = toArr(I, s.cargo), cargoG = toArr(I, s.cargoG);
    for (let o = 0; o < I.n; o++) if (cargo[o] > 0) { paid += cargoG[o] * priceAt(world, I, o, bi, c.t) * sellK; sold[o] += cargo[o]; }
  }
  paid = Math.max(0, paid);
  c.earned += paid; c.runEarned += paid; c.monthEarned += paid;
  ensureLedger(c);
  ledgerIn(c, 'nukeCargo', paid);
  const runEarned = c.runEarned;
  spect = spectacleOf(c, runEarned); // cargo paid on the way out counts toward the blast
  if (ctx.sales) for (let o = 0; o < I.n; o++) if (sold[o] > 0) ctx.sales.push({ oreId: I.ores[o].id, amount: sold[o] });
  const keep = {
    sp: num(c.sp) + spect, nukes: num(c.nukes) + 1,
    lastNuke: { at: c.t, spectacle: spect, runEarned, makerUsed: false },
    hazards: num(c.stats?.hazards), lost: num(c.stats?.lost),
  };
  Object.assign(c, {
    coin: T.startCoin, earned: 0, runEarned: 0, miners: 0, idle: 0, // the first shaft comes with a relief crew so the rebuild starts moving
    lift: { speed: 0, capacity: 0, buckets: 0 }, conveyor: 0, yardLvl: 0, pads: 1, tunnel: {}, tunnelG: {}, yard: {}, yardG: {},
    shafts: [], ships: [], fleet: emptyFleet(), born: c.t, stats: freshStats(), tutorial: 5,
    safety: { ventilation: 0, pumps: 0, firebreaks: 0 },
    sp: keep.sp, nukes: keep.nukes, lastNuke: keep.lastNuke,
  });
  c.stats.hazards = keep.hazards; c.stats.lost = keep.lost;
  // refineries go up with the rest; their buy settings are remembered for the rebuild
  const memo = { ...(c.refineMemo || {}) };
  for (const site of ['planet', 'orbital']) if (c.refinery?.[site]) memo[site] = { ...c.refinery[site].ores };
  c.refineMemo = memo;
  c.refinery = emptyRefinery();
  c.ledger.run = freshBook();
  starter(c, world);
  if (ctx.events) {
    const settled = paid > 0 ? ` Ships in flight delivered ${fmt(paid)} coin on the way out.` : '';
    ctx.events.push({ type: 'nuke', text: `${c.name} went up in a ${spect.toFixed(1)} Spectacle blast. +${spect.toFixed(1)} SP.${settled} Rebuild!`, at: c.t,
      data: { spectacle: spect, runEarned, sp: c.sp, paid } });
  }
}

export { clone };
