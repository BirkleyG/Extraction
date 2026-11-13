// newColony, applyCommand, quote.
import { T, geoSum, geoMax } from './tuning.js';
import { info, clone, num, fmt, cleanName, hashSeed, DAY_MS } from './util.js';
import {
  liftRate, convRate, yardCap, bunkCap, perMiner, shipCap, tripSecs,
  assignMiners, rollVein, shaftStatus, grade, evoMult, evoLvl, spectacleOf, priceAt,
} from './model.js';
import { advance, toArr, toMap } from './sim.js';
import { licensesOpen, panelFor, syncUnlocks } from './unlocks.js';
import { ensureHz, ensureShaftHz } from './hazards.js';

export const ENGINE_VERSION = 2;
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
    cls, lvl: 0, policy: 'best', destId: null, state: 'home', readyAt: c.t, cargo: {}, cargoG: {},
    dest: null, dockedAt: null, firstLoadAt: null, departAt: null, arriveAt: null, homeAt: null,
  };
}

function makeShaft(c, idx, roll) {
  const s = { id: 's' + (c.nextId++), idx, name: `Shaft ${idx + 1}`, ore: roll.ore, vein: roll.vein, up: { bunk: 0, cart: 0, lights: 0, supports: 0 }, miners: 0 };
  if (c.hzRng != null) ensureShaftHz(c, s);
  return s;
}

// Starter mine: one shaft of the easiest common ore and one hauler.
function starter(c, world) {
  const I = info(world);
  const first = I.ores.filter((o) => o.tier === 'common').sort((a, b) => a.hardness - b.hardness || a.value - b.value)[0] || I.ores[0];
  c.shafts.push(makeShaft(c, 0, { ore: first.id, vein: null }));
  c.ships.push(makeShip(c, 'hauler'));
}
const freshStats = () => ({ mined: 0, lifted: 0, loaded: 0, sold: 0, sales: 0, launches: 0, upgrades: 0, spent: 0, firstSaleAt: null, hazards: 0, lost: 0 });

export function newColony({ id, uid, name, species, planet, siteRegion, now, grant } = {}) {
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
    miners: 0, idle: 0, drill: 1,
    lift: 0, conveyor: 0, yardLvl: 0, pads: 1,
    tunnel: {}, tunnelG: {}, yard: {}, yardG: {},
    shafts: [], ships: [],
    stats: freshStats(),
    unlocked: { panels: [], licenses: [] }, tutorial: 0, nextId: 1,
  };
  ensureHz(c);
  starter(c, world);
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
function plan(c, world, cmd, now, quoting = false) {
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
      if (!s.spent && (!s.vein || s.vein.left > 0)) return { error: 'Only exhausted veins can be re-drilled' };
      const roll = rollVein(world, s.idx, c.rng, { redrill: true, up: s.up });
      const ore = I.ores[I.idx[roll.ore]];
      return {
        cost: Math.max(50, T.redrillFrac * shaftCost(s.idx)), n: 1, k: 1,
        effect: `${s.name}: new ${ore.name} vein (${ore.tier}${roll.vein ? ', ' + fmt(roll.vein.total) + ' ore' : ''})`,
        apply: (x) => { const y = x.shafts.find((q) => q.id === s.id); y.ore = roll.ore; y.vein = roll.vein; delete y.spent; x.rng = roll.rng; },
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
      if (kind === 'lights' || kind === 'supports') {
        if (s.idx === 0) return { error: 'The home shaft is safe enough' };
        const lv = num(s.up[kind]);
        const p = levelPlan(c, lv, T.shaftSafeMax, T.shaftSafeBase * dm, T.shaftSafeGrowth, n);
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
      const p = levelPlan(c, c.lift, MAX_LVL, T.liftCost, T.liftGrowth, n);
      const mk = evoMult(c, 'mine'), a = liftRate(c.lift) * mk, b = liftRate(c.lift + p.k) * mk;
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
      const owned = c.ships.filter((q) => q.cls === cls).length - (cls === 'hauler' ? 1 : 0);
      const cost = T.ship[cls].cost * Math.pow(T.shipFleetGrowth, Math.max(0, owned)) + (lvl ? geoSum(shipUpBase(cls), T.shipUpGrowth, 0, lvl) : 0);
      const near = I.buyers.reduce((a, b) => (T.tripSecs[b.distance] < T.tripSecs[a.distance] ? b : a));
      return {
        cost, n: 1, k: 1,
        effect: `New ${T.ship[cls].label}: ${fmt(shipCap({ cls, lvl }))} cargo, ${Math.round(tripSecs(near, cls, c))}s to ${near.name}`,
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
  const runEarned = c.runEarned;
  if (ctx.sales) for (let o = 0; o < I.n; o++) if (sold[o] > 0) ctx.sales.push({ oreId: I.ores[o].id, amount: sold[o] });
  const keep = {
    sp: num(c.sp) + spect, nukes: num(c.nukes) + 1,
    lastNuke: { at: c.t, spectacle: spect, runEarned, makerUsed: false },
    hazards: num(c.stats?.hazards), lost: num(c.stats?.lost),
  };
  Object.assign(c, {
    coin: T.startCoin, earned: 0, runEarned: 0, miners: 0, idle: 0, drill: 1,
    lift: 0, conveyor: 0, yardLvl: 0, pads: 1, tunnel: {}, tunnelG: {}, yard: {}, yardG: {},
    shafts: [], ships: [], born: c.t, stats: freshStats(), tutorial: 5,
    safety: { ventilation: 0, pumps: 0, firebreaks: 0 },
    sp: keep.sp, nukes: keep.nukes, lastNuke: keep.lastNuke,
  });
  c.stats.hazards = keep.hazards; c.stats.lost = keep.lost;
  starter(c, world);
  if (ctx.events) {
    const settled = paid > 0 ? ` Ships in flight delivered ${fmt(paid)} coin on the way out.` : '';
    ctx.events.push({ type: 'nuke', text: `${c.name} went up in a ${spect.toFixed(1)} Spectacle blast. +${spect.toFixed(1)} SP.${settled} Rebuild!`, at: c.t,
      data: { spectacle: spect, runEarned, sp: c.sp, paid } });
  }
}

export { clone };
