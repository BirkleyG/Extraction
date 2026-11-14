// Ledger: every coin in and out is tagged. colony.ledger = { month: { in, out }, run: { in, out } }.
// `run` resets on a nuke; `month` lasts the colony's month.
export const LEDGER_IN = ['raw', 'refined', 'nukeCargo', 'grant'];
export const LEDGER_OUT = ['miners', 'shafts', 'drill', 'lift', 'surface', 'ships', 'refinery', 'safety'];
const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
export const freshBook = () => ({ in: zero(LEDGER_IN), out: zero(LEDGER_OUT) });
export function ensureLedger(c) {
  if (!c.ledger || typeof c.ledger !== 'object') c.ledger = { month: freshBook(), run: freshBook() };
  for (const k of ['month', 'run']) {
    const b = c.ledger[k] = c.ledger[k] && typeof c.ledger[k] === 'object' ? c.ledger[k] : freshBook();
    b.in = { ...zero(LEDGER_IN), ...b.in }; b.out = { ...zero(LEDGER_OUT), ...b.out };
  }
  return c.ledger;
}
export function ledgerIn(c, key, amt, runToo = true) {
  if (!(amt > 0)) return;
  const L = c.ledger || ensureLedger(c);
  L.month.in[key] = (L.month.in[key] || 0) + amt;
  if (runToo) L.run.in[key] = (L.run.in[key] || 0) + amt;
}
export function ledgerOut(c, key, amt) {
  if (!(amt > 0)) return;
  const L = c.ledger || ensureLedger(c);
  L.month.out[key] = (L.month.out[key] || 0) + amt;
  L.run.out[key] = (L.run.out[key] || 0) + amt;
}
export function spendCategory(cmd) {
  switch (cmd.type) {
    case 'hireMiners': return 'miners';
    case 'buyShaft': case 'upgradeCart': return 'shafts';
    case 'upgradeShaft': return 'safety';
    case 'upgradeSafety': return 'safety';
    case 'upgradeGear': return 'drill';
    case 'upgradeLift': return 'lift';
    case 'upgradeConveyor': case 'upgradeYard': case 'buyPad': return 'surface';
    case 'buyShip': case 'upgradeClass': return 'ships';
    case 'buildRefinery': case 'upgradeRefinery': return 'refinery';
    default: return 'surface';
  }
}
