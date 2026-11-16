// Browser playtest of the guild game: two players on one planet, server clock fast-forwarded.
//   node game/test/client-guild.mjs [outdir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { startServer } from '../server.js';
import { createStore } from '../store.js';

const out = process.argv[2] || '/tmp/guild-shots';
const fs = await import('node:fs');
fs.mkdirSync(out, { recursive: true });
let offset = 0;
const H = 3_600_000;
const store = await createStore(null);
const srv = await startServer({ port: 0, store, ai: { enabled: false, providers: {}, dailyLimit: 0, perPlayerLimit: 0, defaultModel: () => '', listModels: async () => [], canUse: () => false, json: async () => { throw new Error('off'); } }, env: { GAME_CODE: '', ADMIN_CODE: 'boss' }, now: () => Date.now() + offset, noTimers: true });
const base = `http://127.0.0.1:${srv.port}`;
const browser = await chromium.launch();
const errors = [];
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.goto(base + '/');
  await page.fill('#jName', name);
  await page.click('form.join button[type=submit]');
  await page.waitForSelector('#gName');
  await page.screenshot({ path: `${out}/${name}-0-landing.png` });
  await page.click('form.land button[type=submit]');
  await page.waitForFunction(() => window.__guild && window.__guild.S.view);
  await page.waitForTimeout(1200);
  return page;
}
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` });
const G = (p, f, arg) => p.evaluate(f, arg);
const sweep = async () => { const v3 = srv; await fetch(base + '/healthz'); };

const A = await player('Ada');
const B = await player('Bo');
await shot(A, 'Ada-1-start');

// Ada: click her Landing Pit in the ops list, then Ship ore to... the nearest contractor (clicked on the map)
await A.click('[data-sel="pit"]');
await A.waitForTimeout(800);
await shot(A, 'Ada-2-pit-card');
await A.click('[data-dest="pit"]');
await A.waitForTimeout(900);
const npcPos = await G(A, () => { const { S, map } = window.__guild; const pit = S.view.sites.find((s) => s.id === 'pit'); const n = S.world.npc.slice().sort((a, b) => Math.hypot(a.x - pit.x, a.y - pit.y) - Math.hypot(b.x - pit.x, b.y - pit.y))[0]; map.focus(n.x, n.y); return n; });
await A.waitForTimeout(1500);
const scr = await G(A, (n) => { const { map } = window.__guild; const p = map.toScreen(n.x, n.y); const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, npcPos);
await A.mouse.click(scr.x, scr.y);
await A.waitForTimeout(1200);
await shot(A, 'Ada-3-route');
console.log('Ada routes', await G(A, () => window.__guild.S.view.routes.map((r) => `${r.from.name}->${r.to.name} ${r.tph.toFixed(1)}t/h ok=${r.ok}`)));

// Ada surveys a spot near home; Bo buys two haulers via the console API path the UI uses
const spot = await G(A, () => { const { S } = window.__guild; const h = S.guild.landing; return { x: h.x + 60, y: h.y + 20 }; });
await G(A, async (s) => { await window.__guild.cmd({ type: 'survey', x: s.x, y: s.y }); }, spot);
await G(B, async () => { const { S, cmd } = window.__guild; const n = S.world.npc.slice().sort((a, b) => Math.hypot(a.x - S.guild.landing.x, a.y - S.guild.landing.y) - Math.hypot(b.x - S.guild.landing.x, b.y - S.guild.landing.y))[0]; await cmd({ type: 'route', from: 'pit', to: { kind: 'npc', id: n.id }, shipId: S.guild.ships[0].id }); await cmd({ type: 'buyShip', cls: 'hauler', routeId: S.guild.routes[0].id }); });

// three hours later
offset += 3 * H;
await G(A, () => window.__guild.refresh());
await G(B, () => window.__guild.refresh());
await A.waitForTimeout(1000);
console.log('Ada after 3h', await G(A, () => { const { S } = window.__guild; return { coin: Math.round(S.view.coin), net: Math.round(S.view.netH), surveys: S.guild.surveys.map((s) => s.status + ':' + (s.report ? s.report.headline : '')) }; }));
console.log('Bo after 3h', await G(B, () => { const { S } = window.__guild; return { coin: Math.round(S.view.coin), net: Math.round(S.view.netH) }; }));
// Ada opens the survey report and builds a mine there
await G(A, (s) => { const { S } = window.__guild; S.sel = { type: 'spot', x: s.x, y: s.y }; window.__guild.map.focus(s.x, s.y, 3); }, spot);
await G(A, () => window.__guild.refresh());
await A.waitForTimeout(1200);
await shot(A, 'Ada-4-survey-card');
const built = await G(A, async (s) => { const r = await window.__guild.cmd({ type: 'build', kind: 'mine', x: s.x, y: s.y }); return r && r.error; }, spot);
console.log('build mine error:', built);
// Bo builds a refinery near home and opens it to other guilds
const bref = await G(B, async () => { const { S, cmd } = window.__guild; for (let k = 0; k < 20; k++) { const a = k * 0.7; const r = await cmd({ type: 'build', kind: 'refinery', x: S.guild.landing.x + Math.cos(a) * 50, y: S.guild.landing.y + Math.sin(a) * 50 }); if (r && !r.error) return S.view.sites.find((s) => s.kind === 'refinery'); } return null; });
console.log('Bo refinery', bref && bref.name);
offset += 5 * H;
await G(B, async () => { const { S, cmd } = window.__guild; await window.__guild.refresh(); const r = S.view.sites.find((s) => s.kind === 'refinery'); await cmd({ type: 'setRefinery', siteId: r.id, on: true, pct: 0.5 }); });
await G(A, () => window.__guild.refresh());
await A.waitForTimeout(800);
// Ada can see Bo's refinery as a buyer
const dir = await G(A, () => window.__guild.S.world.directory);
console.log('directory seen by Ada', dir.map((d) => `${d.guild}/${d.name} on=${d.on} pct=${d.pct} room=${d.room}`));
// jump to day 6 for the exchange
offset += 5 * 24 * H;
for (const p of [A, B]) await G(p, () => window.__guild.refresh());
const ex = await G(A, async () => { const { S, cmd } = window.__guild; for (let k = 0; k < 20; k++) { const a = k * 0.9; const r = await cmd({ type: 'build', kind: 'refinery', x: S.guild.landing.x + Math.cos(a) * 45, y: S.guild.landing.y + Math.sin(a) * 45 }); if (r && !r.error) break; } return { coin: S.view.coin, err: null }; });
offset += 5 * H;
await G(A, async () => { const { S, cmd } = window.__guild; await window.__guild.refresh(); const ref = S.view.sites.find((s) => s.kind === 'refinery'); for (const r of S.guild.routes) await cmd({ type: 'deleteRoute', routeId: r.id }); await cmd({ type: 'route', from: 'pit', to: { kind: 'site', id: ref.id }, shipId: S.guild.ships[0].id }); S.guild.coin < 50000 && console.log('poor'); });
console.log('Ada before exchange', await G(A, () => ({ coin: Math.round(window.__guild.S.view.coin), net: Math.round(window.__guild.S.view.netH) })));
// Give Ada money for the exchange if she is short (owner tools do not exist; we just wait longer)
offset += 2 * 24 * H;
await G(A, () => window.__guild.refresh());
const exr = await G(A, async () => { const r = await window.__guild.cmd({ type: 'buildExchange' }); return r && r.error; });
console.log('exchange error:', exr, 'coin', await G(A, () => Math.round(window.__guild.S.view.coin)));
offset += 30 * H;
await G(A, () => window.__guild.refresh());
await A.waitForTimeout(1000);
console.log('offers', await G(A, () => window.__guild.S.view.offers.map((o) => `${o.qty} ${o.oreId} @${o.price}`)));
await A.click('[data-tab="market"]');
await A.waitForTimeout(600);
await shot(A, 'Ada-5-market');
const talk = await A.$('[data-talk]');
if (talk) {
  await talk.click(); await A.waitForTimeout(500); await shot(A, 'Ada-6-talk');
  await A.click('[data-ask]'); await A.waitForTimeout(800); await shot(A, 'Ada-7-haggle');
  await A.keyboard.press('Escape');
}
await A.goto(base + '/'); await A.waitForFunction(() => window.__guild && window.__guild.S.view); await A.waitForTimeout(1500);
await shot(A, 'Ada-8-later');
await B.click('[data-tab="guild"]'); await B.waitForTimeout(800); await shot(B, 'Bo-9-guild');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
await srv.close();
