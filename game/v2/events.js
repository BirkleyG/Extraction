// Galactic events: every 10-20 hours something happens out there (a war, a boom, a cult ritual)
// and shifts demand for a while. Events change budgets and demand, never set prices directly:
// they are world.changes with an expiry, which the engine folds into prices.
import crypto from 'node:crypto';

const HOUR = 3600_000;
const rnd = () => crypto.randomInt(0, 1_000_000) / 1_000_000;
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + (b - a) * rnd();

const TEMPLATES = {
  war: { kind: 'demand', up: true, mult: [1.4, 1.9], hours: [12, 36], heads: ['War erupts in the {far} system; armies scramble for {ore}', 'Border skirmish turns ugly: {ore} armor in short supply'] },
  boom: { kind: 'global', up: true, mult: [1.15, 1.35], hours: [12, 30], heads: ['Galactic construction boom: every ore is suddenly fashionable', 'Credit flows like syrup; buyers splurge on raw ore'] },
  recession: { kind: 'global', up: false, mult: [1.15, 1.35], hours: [10, 24], heads: ['Markets wobble; buyers tighten their belts', 'The Exchange sneezes and the whole galaxy catches a recession'] },
  discovery: { kind: 'supply', up: true, mult: [1.25, 1.6], hours: [16, 40], heads: ['Prospectors strike {ore} in a far nebula; prices sag', 'A rival world floods the market with cheap {ore}'] },
  ritual: { kind: 'buyer', up: true, mult: [1.4, 1.8], hours: [8, 20], heads: ['{buyer} holds a sacred ritual and pays double for offerings', '{buyer} declares a festival; their buyers are feeling generous'] },
};

function makeEvent(world, t) {
  const type = pick(Object.keys(TEMPLATES));
  const tp = TEMPLATES[type];
  const planet = world.planet;
  const ore = pick(planet.ores.filter(o => o.tier !== 'common').concat(planet.ores));
  const buyer = pick(planet.buyers || [{ id: null, name: 'A distant buyer' }]);
  const m = Math.round(between(...tp.mult) * 100) / 100;
  const title = pick(tp.heads).replace('{ore}', ore.name).replace('{buyer}', buyer.name).replace('{far}', pick(['Veyra', 'Kessel-9', 'Morrow', 'Ixtl', 'Dunhollow']));
  return {
    id: 'ev' + crypto.randomBytes(4).toString('hex'), type, kind: tp.kind,
    oreId: (tp.kind === 'demand' || tp.kind === 'supply') ? ore.id : undefined,
    buyerId: tp.kind === 'buyer' ? buyer.id : undefined,
    mult: tp.up ? m : Math.round((1 / m) * 1000) / 1000,
    by: null, source: 'event', title, reason: type, at: t, until: t + Math.round(between(...tp.hours)) * HOUR,
  };
}

function headlinePrompt(world, ev) {
  return `You are the Colony Chronicler, writing one-line galactic news headlines for a darkly funny space mining game on planet ${world.planet.name}.
Event (facts, do not change them): ${ev.title}. Type: ${ev.type}.
Reply with ONLY JSON: {"headline": "max 14 words, punchy, no numbers or prices"}`;
}

export function createEvents({ ai, currentModel, getWorld, saveWorld, addFeed, clock }) {
  async function maybeEvent() {
    const t = clock();
    const world = await getWorld();
    if (!world.nextEventAt) { world.nextEventAt = t + Math.round(between(6, 14) * HOUR); await saveWorld(world); return null; }
    if (t < world.nextEventAt || t >= world.endsAt) return null;
    const ev = makeEvent(world, t);
    const model = ai && await currentModel();
    if (model) {
      try { const r = await ai.json(model, headlinePrompt(world, ev), 'quick'); if (r && r.headline) ev.title = String(r.headline).slice(0, 140); }
      catch (e) { console.error('Chronicler AI failed:', e.message); }
    }
    world.changes = [...(world.changes || []).filter(c => !c.until || c.until > t), ev];
    world.nextEventAt = t + Math.round(between(10, 20) * HOUR);
    await saveWorld(world);
    await addFeed(`📰 ${ev.title}`, 'news', null, t);
    return ev;
  }
  return { maybeEvent, makeEvent };
}
