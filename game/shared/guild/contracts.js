// Galactic buyers approach your Exchange with contract offers. Casual players sign; curious ones haggle.
// Every buyer has a hidden top price (market price x their premium). Ask above it and they counter or walk,
// depending on personality. Deterministic: rolls come from the offer id and the round.
import { G } from './tuning.js';
import { roll, between, clamp, HOUR, DAY } from './util.js';
import { buyerDemand } from './market.js';
import { persona, buyerLine } from './world.js';

const C = G.contract;
export const premiumOf = (party) => 0.95 + (clamp(Number(party.ref) || 1.1, 0.8, 1.6) - 0.8) * 0.44;

// Make an offer from one buyer. rate: the guild's refined output per ore (units/hr, EMA).
export function makeOffer(g, world, now, prices, idx) {
  const parties = world.parties || [];
  if (!parties.length) return null;
  const seed = `${g.seed}:offer:${idx}`;
  const made = Object.entries(g.rate || {}).filter(([, r]) => r > 0.01);
  // buyers who want what you make are likelier to call
  const weights = parties.map((p) => {
    let w = 0.05;
    for (const [id, r] of made) w += (Number(p.wants?.[id]) || 0) * Math.sqrt(r) * (prices[id]?.p || 0);
    return w;
  });
  const tot = weights.reduce((a, b) => a + b, 0);
  let u = roll(seed, 'who') * tot, k = 0;
  while (k < parties.length - 1 && u > weights[k]) { u -= weights[k]; k++; }
  const party = parties[k];
  const bd = buyerDemand(world, now, party.id);
  const oreW = Object.entries(bd).map(([id, d]) => [id, d * (prices[id]?.p || 0) * (1 + 6 * Math.sqrt(g.rate?.[id] || 0))]);
  const ot = oreW.reduce((a, [, w]) => a + w, 0);
  let v = roll(seed, 'ore') * ot, oreId = oreW[0]?.[0];
  for (const [id, w] of oreW) { if (v <= w) { oreId = id; break; } v -= w; }
  if (!oreId || !prices[oreId]) return null;
  const days = Math.round(between(roll(seed, 'days'), C.days));
  const myRate = Math.max(g.rate?.[oreId] || 0, 0.4);
  const want = bd[oreId] || 1;
  const hours = days * 24;
  let qty = myRate * hours * between(roll(seed, 'qty'), [0.25, 0.9]);
  qty = Math.min(qty, want * between(roll(seed, 'cap'), C.sizeHours) * days);
  qty = Math.max(5, Math.round(qty));
  const p = prices[oreId].p;
  const max = p * premiumOf(party) * between(roll(seed, 'over'), [0.97, 1.08]);
  const open = persona(party).open * between(roll(seed, 'open'), [0.94, 1.03]);
  const price = Math.round(max * clamp(open, C.open[0], C.open[1]) * 100) / 100;
  return {
    id: `of${idx}`, buyerId: party.id, oreId, qty, days, price, max: Math.round(max * 100) / 100,
    penalty: C.penalty * (party.type === 'military' ? 1.4 : 1), at: now, expires: now + G.exchange.offerLife * HOUR, round: 0,
    lines: [{ who: 'them', text: buyerLine(party, 'open', { ore: oreName(world, oreId) }, seed) }],
  };
}

export const oreName = (world, id) => (world.planet.ores.find((o) => o.id === id) || {}).name || id;

// Haggle: ask `price`. Returns { status: 'accepted'|'countered'|'walked', offer }.
export function counter(offer, party, price, world) {
  const o = { ...offer, lines: [...offer.lines] };
  o.round += 1;
  price = Math.round(Math.max(0.01, price) * 100) / 100;
  o.lines.push({ who: 'you', text: `How about ${price} a unit?` });
  if (price <= o.max) {
    o.price = price;
    o.lines.push({ who: 'them', text: buyerLine(party, 'accept', {}, o.id + o.round) });
    return { status: 'accepted', offer: o };
  }
  const over = price / o.max - 1;
  const walk = clamp(persona(party).walk * (0.6 + over * 5) + (o.round - 1) * 0.12, 0.05, 0.95);
  if (roll(o.id, 'walk', o.round, Math.round(price * 100)) < walk || o.round >= 3) {
    o.lines.push({ who: 'them', text: buyerLine(party, 'walk', { ore: oreName(world, o.oreId) }, o.id + o.round) });
    return { status: 'walked', offer: o };
  }
  const back = Math.round(o.max * between(roll(o.id, 'back', o.round), [0.93, 1]) * 100) / 100;
  o.price = Math.max(o.price, back);
  o.lines.push({ who: 'them', text: buyerLine(party, 'counter', { price: o.price }, o.id + o.round) });
  return { status: 'countered', offer: o };
}

// A hint for players with the Silver Tongue tech.
export function tell(offer) {
  const room = offer.max / offer.price - 1;
  if (room > 0.15) return 'They are lowballing you. There is a lot of room.';
  if (room > 0.06) return 'They would go a bit higher.';
  if (room > 0.015) return 'Close to their limit.';
  return 'This is about as far as they go.';
}

export const contractFrom = (offer, now) => ({
  id: 'c' + offer.id.slice(2), buyerId: offer.buyerId, oreId: offer.oreId, qty: offer.qty, price: offer.price,
  penalty: offer.penalty, start: now, due: now + offer.days * DAY, delivered: 0, paid: 0,
});
