// Guild pacing bot: plays a month with a few check-ins a day and prints how the guild grows.
//   node game/test/guild-pacing.mjs [--checkins 4] [--players 4] [--seed s] [--lazy]
// "lazy" plays like a 5-minute-a-day player: one check-in a day, accepts every contract, no haggling.
import * as GG from '../shared/guild/index.js';
import { improvisePlanet, startSpot, spotOK } from '../shared/planet/index.js';
import { generateParties } from '../shared/market/parties.js';

const H = 3_600_000, D = 24 * H;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CHECK = Number(arg('checkins', 4));
const NP = Number(arg('players', 4));
const lazy = process.argv.includes('--lazy');
const planet = improvisePlanet(arg('seed', 'pace1'), { history: [] });
let world = { month: 'pace', planet, parties: generateParties('pace', planet), flow: {}, changes: [], startedAt: 0, endsAt: 30 * D, directory: [], sites: [] };
const npcs = GG.npcRefineries(planet);

export function pickStart(planet, taken, seed) {
  for (let k = 0; k < 40; k++) {
    const s = startSpot(planet, taken, seed + ':' + k);
    if (s && npcs.some((n) => Math.hypot(n.x - s.x, n.y - s.y) <= 230)) return s;
  }
  return startSpot(planet, taken, seed);
}

const guilds = [];
for (let p = 0; p < NP; p++) {
  const s = pickStart(planet, guilds.map((g) => g.landing), 'bot' + p);
  guilds.push(GG.newGuild({ uid: 'b' + p, name: 'Bot ' + p, world, x: s.x, y: s.y, now: 0 }));
}

const R = (() => { let a = 7; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; })();
function cmd(i, c, t) {
  const r = GG.applyCommand(guilds[i], world, c, t);
  guilds[i] = r.guild;
  return r.error;
}

function play(i, t) {
  let g = guilds[i];
  let v = GG.view(g, world, t);
  // research: cheapest available
  const techs = Object.entries(GG.GUILD_TUNING.tech).filter(([id, T]) => !g.tech[id] && (!T.needs || g.tech[T.needs])).sort((a, b) => a[1].rp - b[1].rp);
  for (const [id, T] of techs) if (guilds[i].rp >= T.rp) cmd(i, { type: 'research', tech: id }, t);
  // contracts
  for (const o of v.offers) {
    if (lazy || R() < 0.5) cmd(i, { type: 'offer', offerId: o.id, action: 'accept' }, t);
    else cmd(i, { type: 'offer', offerId: o.id, action: 'counter', price: Math.round(o.price * 1.12 * 100) / 100 }, t);
  }
  { const day = GG.view(guilds[i], world, t).day; const g = guilds[i];
  // refinery near the hub after day 1
  if (!v.sites.some((s) => s.kind === 'refinery') && day >= 2 && g.coin > 10_000) {
    for (let k = 0; k < 30; k++) { const a = R() * 6.28, d = 40 + R() * 60; const x = g.landing.x + Math.cos(a) * d, y = g.landing.y + Math.sin(a) * d; const e = cmd(i, { type: 'build', kind: 'refinery', x, y }, t); if (!e) break; if (k === 29) console.log('refinery fail', e); }
  }
  }
  g = guilds[i]; v = GG.view(g, world, t);
  const refinery = v.sites.find((s) => s.kind === 'refinery' && s.level >= 1);
  // routes for each mine; ships where production outruns shipping
  for (const s of v.sites.filter((x) => x.kind === 'mine' && x.level >= 1)) {
    let r = v.routes.find((x) => x.from?.id === s.id);
    const dest = refinery && Math.hypot(refinery.x - s.x, refinery.y - s.y) < 300 ? { kind: 'site', id: refinery.id }
      : (() => { const n = npcs.map((n) => ({ n, d: Math.hypot(n.x - s.x, n.y - s.y) })).sort((a, b) => a.d - b.d)[0]; return { kind: 'npc', id: n.n.id }; })();
    if (r && refinery && r.to.kind === 'npc' && dest.kind === 'site') { cmd(i, { type: 'deleteRoute', routeId: r.id }, t); r = null; }
    if (!r) { cmd(i, { type: 'route', from: s.id, to: dest }, t); }
  }
  g = guilds[i]; v = GG.view(g, world, t);
  for (const sh of g.ships.filter((x) => !x.routeId)) { const r = v.routes[0]; if (r) cmd(i, { type: 'assign', shipId: sh.id, routeId: r.id }, t); }
  g = guilds[i]; v = GG.view(g, world, t);
  for (const s of v.sites.filter((x) => x.kind === 'mine' && x.level >= 1)) {
    const r = v.routes.find((x) => x.from?.id === s.id);
    if (!r) continue;
    let tries = 0;
    while (r.tph < s.tph * 1.1 && tries++ < 6) {
      const cls = g.tech.heavyLift && s.tph > 150 ? 'leviathan' : 'hauler';
      if (guilds[i].coin < GG.view(guilds[i], world, t).shipCosts[cls] + 500) break;
      if (cmd(i, { type: 'buyShip', cls, routeId: r.id }, t)) break;
      r.tph = GG.view(guilds[i], world, t).routes.find((x) => x.id === r.id).tph;
    }
  }
  g = guilds[i]; v = GG.view(g, world, t);
  const day = v.day;
  if (!g.exchange && v.lic.exchange && refinery && g.coin > 60_000) cmd(i, { type: 'buildExchange' }, t);
  // surveys around the claim
  g = guilds[i]; v = GG.view(g, world, t);
  for (let k = v.flying; k < v.drones; k++) {
    const hubs = v.sites.filter((s) => (s.kind === 'hub' || s.kind === 'air') && s.level >= 1);
    const h = hubs[Math.floor(R() * hubs.length)];
    const a = R() * 6.28, d = 30 + R() * (h.radius - 30);
    cmd(i, { type: 'survey', x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d }, t);
  }
  // build a mine at the best surveyed spot
  g = guilds[i];
  const O = Object.fromEntries(GG.oreInfo(planet).map((o) => [o.id, o]));
  const reports = g.surveys.filter((s) => s.status === 'done' && !s.used).map((s) => ({ s, val: s.report.ores.reduce((a, o) => a + (o.hardness <= GG.drillLevel(g) ? o.est * O[o.id].pbar * GG.GUILD_TUNING.mine.share[O[o.id].tier] : 0), 0) })).sort((a, b) => b.val - a.val);
  const mines = g.sites.filter((s) => s.kind === 'mine').length;
  if (reports[0] && g.coin > 4_000 * (1 + mines * 0.6) && mines < 14) {
    const e = cmd(i, { type: 'build', kind: 'mine', x: reports[0].s.x, y: reports[0].s.y }, t);
    const sv = guilds[i].surveys.find((x) => x.id === reports[0].s.id); if (sv) sv.used = true;
    if (e && /Too far/.test(e) && guilds[i].coin > 8000) {
      const h = GG.view(guilds[i], world, t).sites.find((s) => s.kind === 'hub');
      const a = Math.atan2(reports[0].s.y - h.y, reports[0].s.x - h.x); const d = h.radius * 0.85;
      cmd(i, { type: 'build', kind: 'air', x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d }, t);
    }
  }
  // a bigger hub when the hangars fill up
  { const hub = GG.view(guilds[i], world, t).sites.find((s) => s.kind === 'hub'); if (guilds[i].ships.length >= GG.hangar(guilds[i]) - 1 && hub.upgrade && !hub.build && guilds[i].coin > hub.upgrade.cost) cmd(i, { type: 'upgrade', siteId: 'hub' }, t); }
  // upgrades with spare coin
  g = guilds[i]; v = GG.view(g, world, t);
  const ups = v.sites.filter((s) => s.upgrade && !s.build && s.level >= 1 && s.kind !== 'air').sort((a, b) => a.upgrade.cost - b.upgrade.cost);
  for (const s of ups) if (guilds[i].coin > s.upgrade.cost * 1.6) cmd(i, { type: 'upgrade', siteId: s.id }, t);
  if (!g.sites.some((s) => s.kind === 'lab') && day >= 3 && g.coin > 15_000) {
    for (let k = 0; k < 30; k++) { const a = R() * 6.28, d = 40 + R() * 80; if (!cmd(i, { type: 'build', kind: 'lab', x: g.landing.x + Math.cos(a) * d, y: g.landing.y + Math.sin(a) * d }, t)) break; }
  }
  if (g.exchange?.level >= 1 && g.exchange.level < 3 && g.coin > GG.GUILD_TUNING.exchange.up[g.exchange.level + 1] * 1.5) cmd(i, { type: 'upgradeExchange' }, t);
}

const step = 1 * H;
let lastDay = 0;
const t0 = performance.now();
console.log('day  ' + guilds.map((g) => g.name.padEnd(36)).join(''));
for (let t = 0; t <= 30 * D; t += step) {
  for (let i = 0; i < NP; i++) {
    const r = GG.advance(guilds[i], world, t);
    guilds[i] = r.guild;
    world = GG.recordSales(world, r.sales, t);
  }
  const hourOfDay = (t / H) % 24;
  const checkHours = lazy ? [9] : Array.from({ length: CHECK }, (_, k) => Math.round(8 + (k * 14) / Math.max(1, CHECK - 1)));
  if (checkHours.includes(hourOfDay)) for (let i = 0; i < NP; i++) play(i, t);
  const day = Math.floor(t / D) + 1;
  if (day !== lastDay && [1, 2, 3, 5, 7, 10, 14, 18, 22, 26, 30].includes(day) && hourOfDay === 23) {
    lastDay = day;
    const row = guilds.map((g) => { const v = GG.view(g, world, t); const mines = v.sites.filter((s) => s.kind === 'mine').length; return `${GG.fmt(g.coin).padStart(6)} net${GG.fmt(v.netH).padStart(6)}/h m${mines} s${g.ships.length} ${g.exchange ? 'X' : '-'}${Object.keys(g.tech).length}t`.padEnd(36); });
    console.log(String(day).padStart(3) + '  ' + row.join(''));
  }
}
const P = GG.prices(world, 30 * D);
console.log('market idx:', Object.entries(P).map(([k, v]) => `${k.slice(0, 10)} ${v.idx.toFixed(2)} sh ${(v.share * 100).toFixed(1)}%`).join(' | '));
for (const g of guilds) console.log(g.name, g.sites.filter(s=>s.kind!=="mine").map(s=>s.kind+s.level).join(","), g.exchange?"X"+g.exchange.level:"", "ledger", JSON.stringify(Object.fromEntries(Object.entries(g.ledger).map(([k, o]) => [k, Object.fromEntries(Object.entries(o).map(([a, b]) => [a, Math.round(b)]))]))), 'stats', JSON.stringify(g.stats, (k, v) => typeof v === 'number' ? Math.round(v) : v));
console.log('incidents sample:', guilds[0].log.filter((l) => l.kind === 'incident').slice(-2).map((l) => l.text));
console.log('ran in', Math.round(performance.now() - t0), 'ms');
