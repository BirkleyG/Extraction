// newColony, applyCommand, quote.
import { T, geoSum, geoMax } from './tuning.js';
import { info, clone, num, fmt, cleanName, hashSeed, DAY_MS } from './util.js';
import {
  liftRate, convRate, yardCap, bunkCap, perMiner, shipCap, tripSecs,
  assignMiners, rollVein, shaftStatus, grade,
} from './model.js';
import { advance } from './sim.js';
import { licensesOpen, panelFor, syncUnlocks } from './unlocks.js';

export const ENGINE_VERSION = 1;
const MAX_LVL = 400;

const SHIP_NAMES = ['Old Faithful', 'Dusty Mule', 'Rustbucket', 'Lucky Strike', 'Ore Wagon', 'Night Owl', 'Stubborn Goat',
  'Long Haul', 'Copper Kettle', 'Gravel Queen', 'Moonbeam', 'Second Wind', 'Iron Pigeon', 'Slow Poke', 'Gold Digger',
  'Tin Lizzie', 'Deep Pockets', 'Sky Barge', 'Last Chance', 'Comet Tail'];

const planetWorld = (planet) => ({ planet, market: {} });

function makeShip(c, cls) {
  const n = c.ships.length;
  return {
    id: 'p' + (c.nextId++), name: SHIP_NAMES[n % SHIP_NAMES.length] + (n >= SHIP_NAMES.length ? ' ' + (Math.floor(n / SHIP_NAMES.length) + 1) : ''),
    cls, lvl: 0, policy: 'best', destId: null, state: 'home', readyAt: c.t, cargo: {}, cargoG: {},
    dest: null, dockedAt: null, firstLoadAt: null, departAt: null, arriveAt: null, homeAt: null,
  };
}

function makeShaft(c, idx, roll) {
  return { id: 's' + (c.nextId++), idx, name: `Shaft ${idx + 1}`, ore: roll.ore, vein: roll.vein, up: { bunk: 0, cart: 0 }, miners: 0 };
}

export function newColony({ id, uid, name, species, planet, siteRegion, now, grant } = {}) {
  const world = planetWorld(planet);
  const I = info(world);
  now = num(now, 0);
  const g = Math.max(0, num(typeof grant === 'object' && grant ? grant.coin : grant, 0));
  const seed = hashSeed(`${uid ?? id ?? ''}|${planet?.seed ?? planet?.id ?? ''}`);
  const c = {
    v: ENGINE_VERSION,
    id: String(id ?? uid ?? 'colony'), uid: uid ?? null,
    name: cleanName(name, 'New Colony'), species: species ?? null, siteRegion: siteRegion ?? null,
    planetId: planet?.id ?? null, seed, rng: seed,
    t: now, born: now,
    coin: T.startCoin + g, earned: 0, grant: g,
    miners: 0, idle: 0, drill: 1,
    lift: 0, conveyor: 0, yardLvl: 0, pads: 1,
    tunnel: {}, tunnelG: {}, yard: {}, yardG: {},
    shafts: [], ships: [],
    stats: { mined: 0, lifted: 0, loaded: 0, sold: 0, sales: 0, launches: 0, upgrades: 0, spent: 0, firstSaleAt: null },
    unlocked: { panels: [], licenses: [] }, tutorial: 0, nextId: 1,
  };
  // Shaft 1 is always the easiest common ore.
  const first = I.ores.filter((o) => o.tier === 'common').sort((a, b) => a.hardness - b.hardness || a.value - b.value)[0] || I.ores[0];
  c.shafts.push(makeShaft(c, 0, { ore: first.id, vein: null }));
  c.ships.push(makeShip(c, 'hauler'));
  assignMiners(c, world);
  syncUnlocks(c, world, now, []);
  return c;
}

// Late joiners: a head start worth roughly a strong player's first day or two, not their whole month.
export function catchUpGrant(world, now) {
  const day = (num(now) - num(world.startedAt)) / DAY_MS;
  if (day < 0.5) return 0;
  return Math.round(25_000 * day * day);
}

export const upMax = (s) => T.upMax0 + T.upMaxPerDepth * s.idx;
const shipUpBase = (cls) => T.shipUpCost * T.ship[cls].cap * T.ship[cls].upk;
const shaftCost = (idx) => (idx <= 0 ? 0 : T.shaftBase * Math.pow(T.shaftGrowth, idx - 1));
const capPct = (m) => `+${Math.round((m - 1) * 100)}%`;
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
function plan(c, world, cmd, now) {
  const I = info(world);
  if (!cmd || typeof cmd.type !== 'string') return { error: 'Bad command' };
  const panel = panelFor(cmd);
  if (panel && !(c.unlocked?.panels || []).includes(panel)) return { error: 'Not unlocked yet' };
  const lic = new Set([...(c.unlocked?.licenses || []), ...licensesOpen(c, world, now)]);
  const n = cmd.n ?? 1;
  switch (cmd.type) {
    case 'hire': {
      const slots = c.shafts.reduce((a, s) => a + (shaftStatus(c, I, s).ok ? bunkCap(s.up.bunk) : 0), 0);
      const free = Math.max(0, slots - c.miners);
      // Miners need a bunk: hiring stops at free bunks, so the next step is always clear.
      if (free <= 0) return { error: 'No free bunks. Build a bunkhouse or dig a new shaft.' };
      const p = levelPlan(c, c.miners, c.miners + free, T.hireBase, T.hireGrowth, n === 'max' ? 'max' : Math.min(free, Math.max(1, Math.floor(num(Number(n), 1)))), 1e6);
      return {
        ...p, n: p.k,
        effect: `+${p.k} miner${p.k > 1 ? 's' : ''} (${c.miners} → ${c.miners + p.k})` + (free - p.k <= 0 ? ', bunks full' : ''),
        apply: (x) => { x.miners += p.k; },
      };
    }
    case 'buyShaft': {
      const idx = c.shafts.length;
      if (idx >= T.maxShafts) return { error: 'The main tunnel is full' };
      const roll = rollVein(world, idx, c.rng);
      const ore = I.ores[I.idx[roll.ore]];
      const tmp = { ...c, drill: c.drill };
      const st = shaftStatus(tmp, I, { ore: roll.ore, vein: roll.vein });
      return {
        cost: shaftCost(idx), n: 1, k: 1,
        effect: `Shaft ${idx + 1}: ${ore.name} (${ore.tier}, grade x${fmt(grade(idx))}${roll.vein ? ', ' + fmt(roll.vein.total) + ' ore' : ''})${st.ok ? '' : ' · ' + st.reason.toLowerCase()}`,
        apply: (x) => { x.shafts.push(makeShaft(x, idx, roll)); x.rng = roll.rng; },
      };
    }
    case 'redrill': {
      const s = c.shafts.find((x) => x.id === cmd.shaftId);
      if (!s) return { error: 'No such shaft' };
      if (!s.vein || s.vein.left > 0) return { error: 'Only exhausted veins can be re-drilled' };
      const roll = rollVein(world, s.idx, c.rng, { redrill: true, up: s.up });
      const ore = I.ores[I.idx[roll.ore]];
      return {
        cost: Math.max(50, T.redrillFrac * shaftCost(s.idx)), n: 1, k: 1,
        effect: `${s.name}: new ${ore.name} vein (${ore.tier}${roll.vein ? ', ' + fmt(roll.vein.total) + ' ore' : ''})`,
        apply: (x) => { const y = x.shafts.find((q) => q.id === s.id); y.ore = roll.ore; y.vein = roll.vein; x.rng = roll.rng; },
      };
    }
    case 'upgradeShaft': {
      const s = c.shafts.find((x) => x.id === cmd.shaftId);
      if (!s) return { error: 'No such shaft' };
      const kind = cmd.kind;
      const dm = Math.pow(T.depthCost, s.idx);
      if (kind === 'cart') {
        const p = levelPlan(c, s.up.cart, upMax(s), T.cartBase * dm, T.cartGrowth, n);
        if (p.maxed) return { error: 'Carts are maxed for this depth' };
        const a = perMiner(s.up.cart, s.idx), b = perMiner(s.up.cart + p.k, s.idx);
        return { ...p, n: p.k, effect: `+${Math.round(100 * (b / a - 1))}% ore per miner (${fmt(a)} → ${fmt(b)}/min)`, apply: (x) => { x.shafts.find((q) => q.id === s.id).up.cart += p.k; } };
      }
      if (kind === 'bunk') {
        const p = levelPlan(c, s.up.bunk, upMax(s), T.bunkBase * dm, T.bunkGrowth, n);
        if (p.maxed) return { error: 'Bunkhouses are maxed for this depth' };
        return { ...p, n: p.k, effect: `+${T.bunkCapPer * p.k} bunks (${bunkCap(s.up.bunk)} → ${bunkCap(s.up.bunk + p.k)} miners)`, apply: (x) => { x.shafts.find((q) => q.id === s.id).up.bunk += p.k; } };
      }
      return { error: 'Unknown upgrade' };
    }
    case 'upgradeLift': {
      const p = levelPlan(c, c.lift, MAX_LVL, T.liftCost, T.liftGrowth, n);
      const a = liftRate(c.lift), b = liftRate(c.lift + p.k);
      return { ...p, n: p.k, effect: `${capPct(b / a)} lift (${fmt(a)} → ${fmt(b)}/min)${ms(c.lift, p.k)}`, apply: (x) => { x.lift += p.k; } };
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
    case 'upgradeDrill': {
      if (c.drill >= T.drillMax) return { error: 'Drill is maxed' };
      const to = c.drill + 1;
      if (to >= T.drillMax && !lic.has('mythicDrill')) return { error: 'Needs the Mythic drill license' };
      const blocked = c.shafts.filter((s) => { const o = I.ores[I.idx[s.ore]]; return o && !shaftStatus(c, I, s).ok && (o.tier === 'mythic' ? to >= T.drillMax : o.hardness <= to) && !(s.vein && s.vein.left <= 0); }).length;
      return {
        cost: T.drillCosts[to], n: 1, k: 1,
        effect: to >= T.drillMax ? 'Mythic drill: mine mythic ore' : `Drill ${to}: mine hardness ${to}` + (blocked ? ` (opens ${blocked} shaft${blocked > 1 ? 's' : ''})` : ''),
        apply: (x) => { x.drill = to; },
      };
    }
    case 'buyShip': {
      const cls = cmd.cls || 'hauler';
      if (!T.ship[cls]) return { error: 'Unknown ship class' };
      if (cls !== 'hauler' && !lic.has(cls)) return { error: `Needs the ${T.licenses[cls].label}` };
      if (c.ships.length >= T.maxShips) return { error: 'Fleet is full' };
      // New ships join near your fleet's best level, and that refit is in the price.
      const lvl = Math.floor(T.shipJoinLevel * c.ships.reduce((a, s) => Math.max(a, s.lvl), 0));
      const cost = T.ship[cls].cost * Math.pow(T.shipFleetGrowth, Math.max(0, c.ships.length - 1)) + (lvl ? geoSum(shipUpBase(cls), T.shipUpGrowth, 0, lvl) : 0);
      const near = I.buyers.reduce((a, b) => (T.tripSecs[b.distance] < T.tripSecs[a.distance] ? b : a));
      return {
        cost, n: 1, k: 1,
        effect: `New ${T.ship[cls].label}: ${fmt(shipCap({ cls, lvl }))} cargo, ${Math.round(tripSecs(near, cls))}s to ${near.name}`,
        apply: (x) => { const s = makeShip(x, cls); s.lvl = lvl; x.ships.push(s); },
      };
    }
    case 'upgradeShip': {
      const s = c.ships.find((x) => x.id === cmd.shipId);
      if (!s) return { error: 'No such ship' };
      const base = shipUpBase(s.cls);
      const p = levelPlan(c, s.lvl, MAX_LVL, base, T.shipUpGrowth, n);
      const a = shipCap(s), b = shipCap({ ...s, lvl: s.lvl + p.k });
      return { ...p, n: p.k, effect: `${capPct(b / a)} cargo (${fmt(a)} → ${fmt(b)})${ms(s.lvl, p.k)}`, apply: (x) => { x.ships.find((q) => q.id === s.id).lvl += p.k; } };
    }
    case 'setRoute': {
      const s = c.ships.find((x) => x.id === cmd.shipId);
      if (!s) return { error: 'No such ship' };
      if (!['best', 'nearest', 'fixed'].includes(cmd.policy)) return { error: 'Unknown route policy' };
      if (cmd.policy === 'fixed' && I.buyerIdx[cmd.destId] === undefined) return { error: 'Unknown destination' };
      const dest = cmd.policy === 'fixed' ? I.buyers[I.buyerIdx[cmd.destId]].name : null;
      return {
        cost: 0, n: 1, k: 1, free: true,
        effect: cmd.policy === 'fixed' ? `${s.name} always flies to ${dest}` : cmd.policy === 'nearest' ? `${s.name} flies to the nearest buyer` : `${s.name} picks the best coin/min`,
        apply: (x) => { const y = x.ships.find((q) => q.id === s.id); y.policy = cmd.policy; y.destId = cmd.policy === 'fixed' ? cmd.destId : null; },
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
  const p = plan(colony, world, cmd, colony.t);
  if (p.error) return { cost: 0, effect: '', canAfford: false, n: 0, error: p.error };
  const cost = Number.isFinite(p.cost) ? p.cost : Infinity;
  return { cost, effect: p.effect, canAfford: Number.isFinite(cost) && colony.coin >= cost - 1e-9, n: p.n ?? 1 };
}

// Apply a command to an already-advanced colony (mutates c). Returns error string or null.
export function applyNow(c, world, cmd, events) {
  const p = plan(c, world, cmd, c.t);
  if (p.error) return p.error;
  if (!Number.isFinite(p.cost)) return 'Maxed out';
  if (c.coin < p.cost - 1e-9) return `Not enough coin: need ${fmt(p.cost)}`;
  c.coin = Math.max(0, c.coin - p.cost);
  p.apply(c);
  if (!p.free) {
    c.stats.spent += p.cost;
    if (cmd.type !== 'hire') c.stats.upgrades++;
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
  const error = applyNow(c, world, cmd, events);
  return error ? { colony: c, events, sales: r.sales, error } : { colony: c, events, sales: r.sales };
}

export { clone };
