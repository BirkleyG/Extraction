// Panels (UI reveal) and licenses (month-gated).
import { T } from './tuning.js';
import { info, dayOf, num } from './util.js';
import { shaftStatus } from './model.js';
import { rates } from './rates.js';

// Panels in reveal order. `when(c, I)` is checked against monotonic progress.
// Progress counts a late joiner's catch-up grant, so the grant can be spent right away.
const got = (c) => c.earned + (c.grant || 0);
// Each panel opens at `at` coin earned (grant counts). Later panels also wait for `hours` of colony age,
// so new things keep arriving through the first day instead of all at once (late joiners skip the wait).
// `early` opens a panel sooner when it is the thing holding the colony back.
export const PANELS = [
  { id: 'mine', label: 'Mine', at: 0 },
  { id: 'hire', label: 'Hire miners', at: 0 },
  { id: 'shafts', label: 'Dig shafts', at: 30, early: (c) => c.miners >= 3 },
  { id: 'carts', label: 'Carts & rails', at: 45 },
  { id: 'lift', label: 'Lift', at: 150, early: (c, I, r) => r().limit === 'lift' && got(c) >= 15 },
  { id: 'ships', label: 'Ship upgrades', at: 300, early: (c, I, r) => r().limit === 'ships' && got(c) >= 15 },
  { id: 'bunks', label: 'Bunkhouses', at: 400, early: (c) => c.miners >= 5 },
  { id: 'conveyor', label: 'Conveyors', at: 700, early: (c, I, r) => r().limit === 'conveyor' && got(c) >= 15 },
  { id: 'yard', label: 'Surface yard', at: 1_200, early: (c, I, r) => r().yardLoss > 0.03 && got(c) >= 15 },
  { id: 'drill', label: 'Drill', at: 2_000, early: (c, I) => c.shafts.some((s) => /drill/.test(shaftStatus(c, I, s).reason)) },
  { id: 'routes', label: 'Routes & buyers', at: 3_000, hours: 1 },
  { id: 'fleet', label: 'Fleet', at: 5_000, hours: 3, early: (c, I, r) => r().limit === 'ships' && got(c) >= 1_000 },
  { id: 'pads', label: 'Launch pads', at: 12_000, hours: 6, early: (c) => c.ships.length >= 2 },
  { id: 'market', label: 'Market', at: 25_000, hours: 12 },
  // Safety opens with danger: a shaft at depth index 3+ or the first mishap.
  { id: 'safety', label: 'Safety', at: Infinity, early: (c) => c.shafts.some((s) => s.idx >= 3) || num(c.stats?.hazards) > 0 },
  // Prestige shows up well before the nuke is allowed, so players see it coming.
  { id: 'prestige', label: 'Prestige', at: Infinity, early: (c) => num(c.runEarned) >= T.prestigePanelAt || num(c.nukes) > 0 || num(c.sp) > 0 },
];
const ageH = (c) => (num(c.t) - num(c.born, c.t)) / 3_600_000;
const waited = (c, p) => !p.hours || num(c.grant) > 0 || ageH(c) >= p.hours;
for (const p of PANELS) p.when = (c, I, r) => (got(c) >= p.at && waited(c, p)) || !!(p.early && p.early(c, I, r));


// Which panel a command needs.
export function panelFor(cmd) {
  switch (cmd.type) {
    case 'hire': return 'hire';
    case 'buyShaft': case 'redrill': return 'shafts';
    case 'upgradeShaft': return cmd.kind === 'bunk' ? 'bunks' : (cmd.kind === 'lights' || cmd.kind === 'supports') ? 'safety' : 'carts';
    case 'upgradeSafety': return 'safety';
    case 'nuke': case 'evolve': return 'prestige';
    case 'upgradeLift': return 'lift';
    case 'upgradeConveyor': return 'conveyor';
    case 'upgradeYard': return 'yard';
    case 'buyPad': return 'pads';
    case 'buyShip': return 'fleet';
    case 'upgradeShip': return 'ships';
    case 'setRoute': return 'routes';
    case 'upgradeDrill': return 'drill';
    default: return null;
  }
}

export const TUTORIAL = [
  { step: 0, id: 'hire', hint: 'Hire your first miner.' },
  { step: 1, id: 'lift', hint: 'Your miner is digging. The lift carries ore up to the yard.' },
  { step: 2, id: 'launch', hint: 'Ore rides the conveyor into your ship. It launches when full.' },
  { step: 3, id: 'sale', hint: 'Your ship is flying to a buyer. Cargo is paid on arrival.' },
  { step: 4, id: 'upgrade', hint: 'Coin in! Spend it on an upgrade: carts, the lift, or another miner.' },
  { step: 5, id: 'done', hint: '' },
];

function tutorialStep(c) {
  let d = 0;
  if (c.miners >= 1) d = 1;
  if (d >= 1 && c.stats.lifted > 0) d = 2;
  if (d >= 2 && c.stats.launches > 0) d = 3;
  if (d >= 3 && c.stats.sales > 0) d = 4;
  if (d >= 4 && c.stats.upgrades > 0) d = 5;
  return Math.max(num(c.tutorial, 0), d);
}

export function licensesOpen(c, world, now) {
  const day = dayOf(world, now);
  const coin = num(c.earned) + num(c.grant);
  return Object.keys(T.licenses).filter((k) => day >= T.licenses[k].day && coin >= T.licenses[k].coin);
}

export function unlocks(colony, world, now) {
  const I = info(world);
  now = num(now, colony.t);
  const had = new Set(colony.unlocked?.panels || []);
  let R = null;
  const r = () => (R ||= rates(colony, world));
  const panels = PANELS.filter((p) => had.has(p.id) || p.when(colony, I, r)).map((p) => p.id);
  const licenses = [...new Set([...(colony.unlocked?.licenses || []), ...licensesOpen(colony, world, now)])];
  const step = Math.min(5, tutorialStep(colony));
  const nextPanel = PANELS.find((p) => !panels.includes(p.id));
  const nextLicense = Object.keys(T.licenses).filter((k) => !licenses.includes(k))
    .map((k) => ({ id: k, ...T.licenses[k], label: T.licenses[k].label }))[0] || null;
  return {
    panels, licenses,
    tutorial: { step, id: TUTORIAL[step].id, hint: TUTORIAL[step].hint },
    next: {
      panel: nextPanel ? {
        id: nextPanel.id, label: nextPanel.label, at: Number.isFinite(nextPanel.at) ? nextPanel.at : null, have: got(colony),
        waitH: waited(colony, nextPanel) ? 0 : Math.max(0, nextPanel.hours - ageH(colony)),
      } : null,
      license: nextLicense,
    },
    day: dayOf(world, now),
  };
}

export function syncUnlocks(c, world, now, events) {
  const u = unlocks(c, world, now);
  c.unlocked = c.unlocked || { panels: [], licenses: [] };
  for (const p of u.panels) if (!c.unlocked.panels.includes(p)) {
    c.unlocked.panels.push(p);
    if (p !== 'mine' && p !== 'hire') events.push({ type: 'unlock', text: `New: ${PANELS.find((x) => x.id === p).label}`, at: now, data: { panel: p } });
  }
  for (const l of u.licenses) if (!c.unlocked.licenses.includes(l)) {
    c.unlocked.licenses.push(l);
    events.push({ type: 'license', text: `The Guild grants you the ${T.licenses[l].label}`, at: now, data: { license: l } });
  }
  c.tutorial = u.tutorial.step;
}
