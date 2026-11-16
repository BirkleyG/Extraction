// Browser playtest of the guild game: two players on one planet, server clock fast-forwarded, screenshots of each screen.
//   node game/test/client-guild.mjs [outdir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { startServer } from '../server.js';
import { createStore } from '../store.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || '/tmp/guild-shots';
fs.mkdirSync(out, { recursive: true });
let offset = 0;
const H = 3_600_000;
const store = await createStore(null);
const srv = await startServer({ port: 0, store, ai: { enabled: false, providers: {}, dailyLimit: 0, perPlayerLimit: 0, defaultModel: () => '', listModels: async () => [], canUse: () => false, json: async () => { throw new Error('off'); } }, env: { GAME_CODE: '', ADMIN_CODE: 'boss' }, now: () => Date.now() + offset, noTimers: true });
const base = `http://127.0.0.1:${srv.port}`;
const browser = await chromium.launch();
const errors = [];
async function player(name, opts = { viewport: { width: 1280, height: 800 } }) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.goto(base + '/');
  await page.fill('#jName', name);
  await page.click('form.join button[type=submit]');
  await page.waitForSelector('#gName');
  await page.click('form.land button[type=submit]');
  await page.waitForFunction(() => window.__guild && window.__guild.S.view);
  await page.waitForTimeout(1200);
  return page;
}
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` });
const G = (p, f, arg) => p.evaluate(f, arg);
const refresh = (p) => G(p, () => window.__guild.refresh());
const money = async (uid, coin) => { const d = await store.getDoc('col3', uid); d.coin = coin; await store.setDoc('col3', uid, d); };
const idOf = (p) => G(p, () => window.__guild.S.me.id);
const clickMap = async (p, x, y) => {
  await G(p, ([x, y]) => window.__guild.map.focus(x, y), [x, y]);
  await p.waitForTimeout(1500);
  const s = await G(p, ([x, y]) => { const q = window.__guild.map.toScreen(x, y); const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, [x, y]);
  await p.mouse.click(s.x, s.y);
  await p.waitForTimeout(700);
};

const A = await player('Ada');
const B = await player('Bo');
await shot(A, '01-map');

// Ada steps inside her Landing Pit
await A.click('[data-enter="pit"]');
await A.waitForTimeout(1500);
await shot(A, '02-inside-mine');
// she adds a lift part from inside
await A.click('[data-part="haul"]');
await A.waitForTimeout(800);
// then ships ore to the nearest contractor: Ship ore to… then click it on the map
await A.click('[data-dest="pit"]');
await A.waitForTimeout(500);
const npc = await G(A, () => { const { S } = window.__guild; const pit = S.view.sites.find((s) => s.id === 'pit'); return S.world.npc.slice().sort((a, b) => Math.hypot(a.x - pit.x, a.y - pit.y) - Math.hypot(b.x - pit.x, b.y - pit.y))[0]; });
await clickMap(A, npc.x, npc.y);
await shot(A, '03-route');
console.log('Ada routes', await G(A, () => window.__guild.S.view.routes.map((r) => `${r.from.name}->${r.to.name} ${r.tph.toFixed(1)}t/h ok=${r.ok}`)));

// the hub: labor office
await A.click('[data-tab="ops"]');
await A.click('[data-enter="hub"]');
await A.waitForTimeout(1500);
await shot(A, '04-inside-hub');
await A.click('[data-hire="5"]');
await A.waitForTimeout(500);
await A.click('[data-act="exit"]');

// Ada surveys near home; time passes
const spot = await G(A, () => { const h = window.__guild.S.guild.landing; return { x: h.x + 70, y: h.y + 25 }; });
await G(A, async (s) => { await window.__guild.cmd({ type: 'survey', x: s.x, y: s.y }); }, spot);
offset += 3 * H;
await refresh(A); await refresh(B);
await A.waitForTimeout(800);
console.log('Ada after 3h', await G(A, () => { const { S } = window.__guild; return { coin: Math.round(S.view.coin), net: Math.round(S.view.netH), crew: S.view.labor.crew, pool: S.view.labor.pool, dead: S.view.labor.dead, survey: S.guild.surveys.map((s) => s.status + ':' + (s.report ? s.report.headline : '')) }; }));
await clickMap(A, spot.x, spot.y);
await shot(A, '05-survey-card');

// Bo gets some money (test only) and builds a refinery, steps inside it
await money(await idOf(B), 60_000);
await refresh(B);
const bref = await G(B, async () => { const { S, cmd } = window.__guild; for (let k = 0; k < 24; k++) { const a = k * 0.7; const r = await cmd({ type: 'build', kind: 'refinery', x: S.guild.landing.x + Math.cos(a) * 45, y: S.guild.landing.y + Math.sin(a) * 45 }); if (r && !r.error) return S.view.sites.find((s) => s.kind === 'refinery').id; } return null; });
offset += 1 * H;
await refresh(B);
await G(B, async (id) => { const { S, cmd } = window.__guild; await cmd({ type: 'route', from: 'pit', to: { kind: 'site', id }, shipId: S.guild.ships[0].id }); await cmd({ type: 'setRefinery', siteId: id, on: true, pct: 0.5 }); await cmd({ type: 'setGate', siteId: 'pit', on: true, pct: 0.3 }); }, bref);
offset += 2 * H;
await refresh(B);
await B.click(`[data-enter="${bref}"]`);
await B.waitForTimeout(1500);
await shot(B, '06-inside-refinery');
await B.click('[data-act="exit"]');

// research tree
await A.click('[data-tab="lab"]');
await A.waitForTimeout(500);
await shot(A, '07-research-tree');
await G(A, async () => { await window.__guild.cmd({ type: 'unlock', node: 'c1' }); });

// freight board, take a job
await A.click('[data-tab="fleet"]');
await A.waitForTimeout(500);
await shot(A, '08-fleet-freight');
await money(await idOf(A), 40_000);
await refresh(A);
await G(A, async () => { await window.__guild.cmd({ type: 'buyShip', cls: 'clipper' }); });
await A.waitForTimeout(300);
if (await A.$('[data-job]')) { await A.click('[data-job]'); await A.waitForTimeout(800); }
console.log('Ada jobs', await G(A, () => window.__guild.S.view.routes.filter((r) => r.job).map((r) => `${r.from.name}->${r.to.name} ${r.tph.toFixed(1)} ${r.issue}`)));

// follow a ship
offset += 0.4 * H;
await refresh(A);
const sh = await G(A, () => window.__guild.S.guild.ships.find((s) => s.routeId)?.id);
if (sh) { await G(A, (id) => { window.__guild.S.follow = id; window.__guild.S.sel = { type: 'ship', id }; }, sh); await A.evaluate(() => window.__guild.map.zoomBy(2)); await A.waitForTimeout(2500); await G(A, () => window.__guild.refresh()); await A.waitForTimeout(1200); await shot(A, '09-follow-ship'); }

// Ada looks inside Bo's operation (watch only)
await G(A, async () => window.__guild.refresh());
const boHub = await G(A, () => (window.__guild.S.world.sites || []).find((s) => s.uid !== window.__guild.S.me.id && s.kind === 'mine'));
if (boHub) { await G(A, (s) => window.__guild.enterInside(s.id, s.uid), boHub); await A.waitForTimeout(1800); await shot(A, '10-peek-rival'); await A.click('[data-act="exit"]'); }

// make something go wrong: blast until a cave-in, then look at the call card
await money(await idOf(A), 50_000);
let dec = null;
for (let k = 0; k < 30 && !dec; k++) {
  offset += 3.2 * H;
  await refresh(A);
  dec = await G(A, async () => { const { S, cmd } = window.__guild; if (!S.view.decisions.length) await cmd({ type: 'blast', siteId: 'pit' }); return S.view.decisions[0] || null; });
}
await A.waitForTimeout(800);
await shot(A, '11-cavein-call');
console.log('decision', dec ? `${dec.kind} n=${dec.n} cost=${dec.cost}` : 'none');
if (dec) { await A.click('[data-enter="pit"]').catch(() => {}); await A.click('[data-tab="ops"]').catch(() => {}); await A.click('[data-enter="pit"]').catch(() => {}); await A.waitForTimeout(1500); await shot(A, '12-inside-cavein'); await A.click('[data-decide][data-c="rescue"]').catch(() => {}); }

// a day later, with a chronicle
offset += 20 * H;
await A.goto(base + '/'); await A.waitForFunction(() => window.__guild && window.__guild.S.view); await A.waitForTimeout(1500);
await shot(A, '13-next-day');
console.log('Ada next day', await G(A, () => { const { S } = window.__guild; return { coin: Math.round(S.view.coin), net: Math.round(S.view.netH), dead: S.view.labor.dead, log: S.guild.log.slice(-4).map((l) => l.text) }; }));

// phone
const M = await player('Mo', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await M.click('[data-enter="pit"]'); await M.waitForTimeout(1500);
await shot(M, '14-phone-inside');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
await srv.close();
