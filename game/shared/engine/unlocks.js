// Panels (UI reveal) and licenses (month-gated).
import { T } from './tuning.js';
import { info, dayOf, num } from './util.js';
import { shaftStatus } from './model.js';
import { rates } from './rates.js';

// Panels in reveal order. `when(c, I)` is checked against monotonic progress.
export const PANELS = [
  { id: 'mine', label: 'Mine', when: () => true },
  { id: 'hire', label: 'Hire miners', when: () => true },
  { id: 'shafts', label: 'Dig shafts', when: (c) => c.miners >= 3 || c.earned >= 30 },
  { id: 'carts', label: 'Carts & rails', when: (c) => c.earned >= 45 },
  { id: 'lift', label: 'Lift', when: (c, I, r) => c.earned >= 150 || (r().limit === 'lift' && c.earned >= 15) },
  { id: 'ships', label: 'Ship upgrades', when: (c, I, r) => c.earned >= 300 || (r().limit === 'ships' && c.earned >= 15) },
  { id: 'bunks', label: 'Bunkhouses', when: (c) => c.earned >= 400 || c.miners >= 5 },
  { id: 'conveyor', label: 'Conveyors', when: (c, I, r) => c.earned >= 700 || (r().limit === 'conveyor' && c.earned >= 15) },
  { id: 'yard', label: 'Surface yard', when: (c, I, r) => c.earned >= 1_200 || (r().yardLoss > 0.03 && c.earned >= 15) },
  { id: 'drill', label: 'Drill', when: (c, I) => c.earned >= 2_000 || c.shafts.some((s) => /drill/.test(shaftStatus(c, I, s).reason)) },
  { id: 'routes', label: 'Routes & buyers', when: (c) => c.earned >= 3_000 },
  { id: 'fleet', label: 'Fleet', when: (c, I, r) => c.earned >= 5_000 || (r().limit === 'ships' && c.earned >= 1_000) },
  { id: 'pads', label: 'Launch pads', when: (c) => c.ships.length >= 2 || c.earned >= 12_000 },
  { id: 'market', label: 'Market', when: (c) => c.earned >= 25_000 },
];

// Which panel a command needs.
export function panelFor(cmd) {
  switch (cmd.type) {
    case 'hire': return 'hire';
    case 'buyShaft': case 'redrill': return 'shafts';
    case 'upgradeShaft': return cmd.kind === 'bunk' ? 'bunks' : 'carts';
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
    next: { panel: nextPanel ? { id: nextPanel.id, label: nextPanel.label } : null, license: nextLicense },
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
