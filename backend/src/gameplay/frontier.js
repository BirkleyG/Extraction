// Local sandbox coefficients only; this is not the complete section 23 combat resolver.
export const FRONTIER_TUNE = Object.freeze({ infantryCost: 250, infantryTroops: 10, shuttleSeconds: 60, newsLimit: 30 });
const KINDS = ['gas', 'cave-in', 'pests'];
const LABELS = { gas: 'Gas pocket', 'cave-in': 'Small cave-in', pests: 'Pest incursion' };
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const roll = (seed, tick, purpose) => hash(`${seed}:home:${tick}:${purpose}`);
const nextAt = (seed, tick) => tick + 180 + roll(seed, tick, 'interval') % 181;
function refresh(f) {
  f.status = f.incident ? `${LABELS[f.incident.kind]}: recovery in ${f.incident.endsAt - f.simSeconds}s; production ${Math.round(f.incident.productionMultiplier * 100)}%.`
    : f.infantry.incoming ? `Supply shuttle arriving in ${f.infantry.incoming.arrivesAt - f.simSeconds}s. Home operational.`
      : `Home operational. ${f.infantry.troops} infantry on patrol.`;
}
function record(f, events, type, description, extra = {}) {
  const event = { id: `home:${f.simSeconds}:${type}`, siteId: 'home', simSeconds: f.simSeconds, type, description, ...extra };
  events.push(event);
  f.news.push(event);
  if (f.news.length > FRONTIER_TUNE.newsLimit) f.news.splice(0, f.news.length - FRONTIER_TUNE.newsLimit);
}
export function createFrontier(seed = 'sandbox', startSecond = 0) {
  if (!Number.isSafeInteger(startSecond) || startSecond < 0 || startSecond > Number.MAX_SAFE_INTEGER - 360) throw new RangeError('Invalid frontier start second');
  const normalizedSeed = canonical(seed);
  const f = { version: 1, seed: normalizedSeed, simSeconds: startSecond, nextIncidentAt: nextAt(normalizedSeed, startSecond), infantry: { troops: 0, incoming: null, purchased: false }, incident: null, news: [], status: '' };
  refresh(f);
  return f;
}
export function validateFrontier(f) {
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const check = (ok, field) => { if (!ok) throw new TypeError(`Invalid frontier ${field}`); };
  check(f && f.version === 1 && typeof f.seed === 'string' && f.seed.length <= 10000, 'version/seed');
  check(integer(f.simSeconds) && integer(f.nextIncidentAt) && f.nextIncidentAt > f.simSeconds && f.nextIncidentAt - f.simSeconds <= 360, 'clock');
  const army = f.infantry;
  check(army && typeof army.purchased === 'boolean' && integer(army.troops) && [0, FRONTIER_TUNE.infantryTroops].includes(army.troops), 'infantry');
  if (army.incoming !== null) {
    const order = army.incoming;
    check(order && army.purchased && army.troops === 0 && order.troops === FRONTIER_TUNE.infantryTroops && order.cost === FRONTIER_TUNE.infantryCost && order.destination === 'home', 'incoming order');
    check(integer(order.departedAt) && integer(order.arrivesAt) && order.departedAt <= f.simSeconds && order.arrivesAt > f.simSeconds && order.arrivesAt - order.departedAt === FRONTIER_TUNE.shuttleSeconds, 'incoming clock');
  } else check(army.troops === (army.purchased ? FRONTIER_TUNE.infantryTroops : 0), 'infantry arrival');
  if (f.incident !== null) {
    const hit = f.incident;
    check(hit && KINDS.includes(hit.kind) && integer(hit.startedAt) && integer(hit.endsAt) && hit.startedAt <= f.simSeconds && hit.endsAt > f.simSeconds, 'incident clock');
    check((hit.productionMultiplier === .75 && hit.endsAt - hit.startedAt === 30) || (hit.productionMultiplier === .9 && hit.endsAt - hit.startedAt === 10), 'incident bounds');
  }
  check(typeof f.status === 'string' && f.status.length <= 300, 'status');
  check(Array.isArray(f.news) && f.news.length <= FRONTIER_TUNE.newsLimit, 'news bounds');
  const ids = new Set(); let lastSecond = -1;
  for (const event of f.news) {
    check(event && integer(event.simSeconds) && event.simSeconds <= f.simSeconds && event.simSeconds >= lastSecond && event.siteId === 'home', 'news clock/site');
    check(['incident', 'recovery', 'reinforcements-arrived', 'reinforcements-ordered'].includes(event.type) && event.id === `home:${event.simSeconds}:${event.type}` && !ids.has(event.id), 'news identity');
    check(typeof event.description === 'string' && event.description.length > 0 && event.description.length <= 500, 'news description');
    if (event.type === 'incident') check(KINDS.includes(event.kind) && [0, 10].includes(event.troopsPresent) && event.casualties === 0 && ((event.duration === 30 && event.productionMultiplier === .75 && event.troopsPresent === 0) || (event.duration === 10 && event.productionMultiplier === .9 && event.troopsPresent === 10)), 'news incident');
    if (event.type === 'recovery') check(KINDS.includes(event.kind) && event.productionMultiplier === 1, 'news recovery');
    if (event.type === 'reinforcements-arrived') check(event.troopsPresent === FRONTIER_TUNE.infantryTroops, 'news arrival');
    ids.add(event.id); lastSecond = event.simSeconds;
  }
  return f;
}
export function advanceFrontier(frontier, seconds) {
  validateFrontier(frontier);
  if (!Number.isSafeInteger(seconds) || seconds < 0 || !Number.isSafeInteger(frontier.simSeconds + seconds)) throw new RangeError('seconds must be a nonnegative safe integer');
  const f = structuredClone(frontier), events = [];
  for (let i = 0; i < seconds; i++) {
    f.simSeconds++;
    if (f.infantry.incoming && f.infantry.incoming.arrivesAt <= f.simSeconds) {
      f.infantry.troops += f.infantry.incoming.troops;
      f.infantry.incoming = null;
      record(f, events, 'reinforcements-arrived', `${f.infantry.troops} infantry arrived by supply shuttle and joined home patrol.`, { troopsPresent: f.infantry.troops });
    }
    if (f.incident && f.incident.endsAt <= f.simSeconds) {
      record(f, events, 'recovery', `${LABELS[f.incident.kind]} cleared. Home production restored.`, { kind: f.incident.kind, productionMultiplier: 1 });
      f.incident = null;
    }
    if (f.nextIncidentAt === f.simSeconds) {
      const kind = KINDS[roll(f.seed, f.simSeconds, 'kind') % KINDS.length];
      const defended = f.infantry.troops > 0;
      const duration = defended ? 10 : 30;
      const productionMultiplier = defended ? 0.9 : 0.75;
      f.incident = { kind, startedAt: f.simSeconds, endsAt: f.simSeconds + duration, productionMultiplier };
      record(f, events, 'incident', `${LABELS[kind]} at home. ${defended ? 'Patrol assisted response' : 'Automatic safety response'}; production ${Math.round(productionMultiplier * 100)}% for ${duration}s. No casualties or cargo loss.`, { kind, duration, productionMultiplier, troopsPresent: f.infantry.troops, casualties: 0 });
      f.nextIncidentAt = nextAt(f.seed, f.simSeconds);
    }
  }
  refresh(f);
  return { frontier: f, events, productionMultiplier: f.incident?.productionMultiplier ?? 1 };
}
export function applyFrontierAction(frontier, action, { coins, simSeconds } = {}) {
  validateFrontier(frontier);
  const f = structuredClone(frontier);
  const reject = description => ({ frontier: f, coinDelta: 0, type: 'rejected', description });
  if ((typeof action === 'string' ? action : action?.type) !== 'recruit-infantry') return reject('Unknown frontier action.');
  if (simSeconds !== f.simSeconds) return reject('Frontier clock must match the simulation before recruiting.');
  if (f.infantry.purchased) return reject('The home infantry order has already been purchased.');
  if (!Number.isFinite(coins) || coins < FRONTIER_TUNE.infantryCost) return reject('Insufficient coins for infantry.');
  f.infantry.purchased = true;
  f.infantry.incoming = { troops: FRONTIER_TUNE.infantryTroops, departedAt: simSeconds, arrivesAt: simSeconds + FRONTIER_TUNE.shuttleSeconds, destination: 'home', cost: FRONTIER_TUNE.infantryCost };
  const description = `${FRONTIER_TUNE.infantryTroops} infantry ordered for ${FRONTIER_TUNE.infantryCost} coins; supply shuttle arrives in ${FRONTIER_TUNE.shuttleSeconds}s.`;
  record(f, [], 'reinforcements-ordered', description);
  refresh(f);
  return { frontier: f, coinDelta: -FRONTIER_TUNE.infantryCost, type: 'reinforcements-ordered', description };
}
