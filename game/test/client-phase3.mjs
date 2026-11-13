// Browser check for Phase 3: refinery tab (build, markup slider moves sold/min), mine view refinery,
// Reports charts and the ledger, on desktop and phone, with a second player online.
//   NODE_PATH=$(npm root -g) node game/test/client-phase3.mjs [outDir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server.js';
import { createStore } from '../store.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.resolve('test-shots');
fs.mkdirSync(out, { recursive: true });

const now0 = new Date();
let skew = Date.UTC(now0.getUTCFullYear(), now0.getUTCMonth() + 1, 1, 0, 30) - Date.now();
const clock = () => Date.now() + skew;
const ai = { enabled: false, providers: {}, defaultModel: () => '', canUse: () => false, listModels: async () => [] };
const store = await createStore(null);
const srv = await startServer({ port: 0, store, ai, env: { ADMIN_CODE: 'boss', DATABASE_URL: '', GAME_CODE: '' }, now: clock, noTimers: true });
const base = `http://127.0.0.1:${srv.port}`;
const browser = await chromium.launch();
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('·', ...a);

async function player(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|status of 4\d\d/.test(m.text())) errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`));
  await page.goto(base + '/');
  await page.fill('#jName', name);
  await page.click('form.join button[type=submit]');
  await page.waitForSelector('.onboard #obGo');
  await page.click('#obGo');
  await page.waitForSelector('#app:not([hidden])');
  return { ctx, page, name };
}
const shot = (p, n) => p.page.screenshot({ path: path.join(out, n + '.png') });
const call = (p, method, url, body) => p.page.evaluate(async ([method, url, body]) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + localStorage.getItem('msc_server_token') }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, url, body]);
const clean = (p) => p.page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));

const A = await player('Ana', { width: 1280, height: 800 });
const B = await player('Bo', { width: 390, height: 844 });

// ---------------------------------------------------------------- grow A past the refinery licence (day 4, 20M)
let st, stB;
const hist = { A: [], B: [] };
for (let i = 0; i < 600; i++) {
  skew += 30 * 60_000;
  await call(A, 'POST', '/api/v2/command', { cmd: { type: 'autoSpend' } });
  if (i % 4 === 0) await call(B, 'POST', '/api/v2/command', { cmd: { type: 'autoSpend' } });
  st = (await call(A, 'GET', '/api/v2/state')).body;
  stB = (await call(B, 'GET', '/api/v2/state')).body;
  if (i % 2 === 0) for (const [k, s] of [['A', st], ['B', stB]]) {
    const c = s.colony, prev = hist[k].at(-1);
    const cpm = prev ? Math.max(0, (c.earned - prev[4]) / ((clock() - prev[0]) / 60_000)) : 0;
    hist[k].push([clock(), Math.round(c.coin), Math.round(cpm), 0, c.earned]);
  }
  const day = Math.floor((clock() - st.world.startedAt) / 864e5) + 1;
  if (day >= 5 && st.colony.earned + (st.colony.grant || 0) >= 2.2e7) break;
}
// bank coin for a refinery and its upgrades
for (let i = 0; i < 12 && st.colony.coin < 6e6; i++) { skew += 30 * 60_000; st = (await call(A, 'GET', '/api/v2/state')).body; }
log('A earned', Math.round(st.colony.earned), 'coin', Math.round(st.colony.coin), 'day', Math.floor((clock() - st.world.startedAt) / 864e5) + 1, 'licenses', st.colony.unlocked.licenses.join(','));
if (!st.colony.unlocked.licenses.includes('refinery')) errors.push('A has no refinery licence');

// Hourly history is written by the server sweep (timers are off here): store what the growth loop saw.
const month = st.world.month;
for (const k of ['A', 'B']) for (const p of hist[k]) { const o = hist[k === 'A' ? 'B' : 'A'].find((q) => q[0] === p[0]); p[3] = o && o[1] > p[1] ? 2 : 1; }
await store.setDoc('hist2', st.me.id, { month, points: hist.A.map((p) => p.slice(0, 4)) });
await store.setDoc('hist2', stB.me.id, { month, points: hist.B.map((p) => p.slice(0, 4)) });
const prices = {};
st.world.planet.ores.forEach((o, j) => { prices[o.id] = hist.A.map((p, i) => [p[0], Math.round((1 - (0.05 + 0.25 * (o.tier !== 'common')) * Math.abs(Math.sin(i / 4 + j))) * 1000) / 1000]); });
await store.setDoc('phist2', 'current', { month, prices });

for (const p of [A, B]) { await p.page.reload(); await p.page.waitForSelector('#app:not([hidden])'); }
await sleep(1500);
await A.page.keyboard.press('Escape');
await clean(A); await clean(B);

// ---------------------------------------------------------------- refinery tab: build on-planet
if (!(await A.page.$('[data-tab="refinery"]'))) errors.push('no refinery tab');
await A.page.click('[data-tab="refinery"]');
await sleep(500);
await shot(A, 'p3-01-refinery-build-desktop');
const buildBtn = '.row[data-cmd*="buildRefinery"][data-cmd*="planet"] button.buy';
await A.page.click(buildBtn);
await A.page.waitForSelector('.refsite[data-site="planet"] input[data-mk]', { timeout: 8000 });
await sleep(1500);

// ---------------------------------------------------------------- markup slider changes sold/min
const readSold = () => A.page.evaluate(() => {
  const c = document.querySelector('.refsite[data-site="planet"] .orecard:not(.off)');
  return { ore: c?.dataset.ok, sold: c?.querySelector('[data-o="sold"]')?.textContent, cpm: c?.querySelector('[data-o="cpm"]')?.textContent, vs: c?.querySelector('[data-o="vs"]')?.textContent, ask: c?.querySelector('[data-mk]')?.value };
});
const slide = (v) => A.page.evaluate((v) => {
  const inp = document.querySelector('.refsite[data-site="planet"] .orecard:not(.off) input[data-mk]');
  inp.value = String(v); inp.dispatchEvent(new Event('input', { bubbles: true }));
}, v);
const r0 = await readSold();
log('ask 1.0', JSON.stringify(r0));
const seen = [r0.sold];
for (const v of [2.6, 0.7, 1.4]) {
  await slide(v);
  await sleep(1400);
  const r = await readSold();
  log('ask', v, JSON.stringify(r));
  seen.push(r.sold);
}
if (new Set(seen).size < 2) errors.push('sold/min did not change with the markup: ' + seen.join(', '));
await sleep(600);
const srvRef = (await call(A, 'GET', '/api/v2/state')).body.colony.refinery.planet;
const oreId = r0.ore.split(':')[1];
log('server markup', JSON.stringify(srvRef.ores?.[oreId]));
if (!srvRef.ores?.[oreId] || Math.abs(srvRef.ores[oreId].markup - 1.4) > 0.01) errors.push('server did not store the last markup');
const dots = await A.page.evaluate(() => document.querySelector('.refsite[data-site="planet"] [data-o="nsamp"]')?.textContent);
log('samples', dots);
await A.page.locator('.refsite[data-site="planet"] .orecard').first().scrollIntoViewIfNeeded();
await shot(A, 'p3-02-refinery-slider-desktop');
if (process.env.DBG) log(await A.page.evaluate(() => document.querySelector('.refsite .orecard').outerHTML));
// toggle an upgrade
const up = await A.page.$('.row[data-cmd*="upgradeRefinery"][data-cmd*="storage"] button.buy:not(:disabled)');
if (up) { await up.click(); await sleep(300); }
await A.page.evaluate(() => document.querySelector('.parties')?.scrollIntoView());
await sleep(300);
await shot(A, 'p3-03-refinery-buyers-desktop');

// ---------------------------------------------------------------- mine view with the refinery
await A.page.click('#zoomHome');
await sleep(1500);
await shot(A, 'p3-04-mine-refinery-desktop');

// ---------------------------------------------------------------- reports
if (!(await A.page.$('[data-tab="reports"]'))) errors.push('no reports tab');
await A.page.click('[data-tab="reports"]');
await A.page.waitForFunction(() => !/Loading history/.test(document.querySelector('#tabbody').textContent), null, { timeout: 8000 });
await sleep(1300);
const cv = await A.page.$('canvas[data-chart="cpm"]');
const bb = await cv.boundingBox();
await A.page.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height / 2);
await sleep(200);
await shot(A, 'p3-05-reports-desktop');
const rep = await A.page.evaluate(() => ({ legend: document.querySelectorAll('[data-legend="race"] span').length, prices: document.querySelectorAll('[data-legend="price"] span').length, ledger: document.querySelector('[data-ledgerbody]')?.textContent || '' }));
log('reports', rep.legend, 'race lines,', rep.prices, 'ore lines; ledger', rep.ledger.slice(0, 100));
if (rep.legend < 2) errors.push('race chart has fewer than 2 colonies');
if (!/Came in/.test(rep.ledger) || !/Refinery/.test(rep.ledger)) errors.push('ledger missing rows (Came in / Refinery spend)');
await A.page.evaluate(() => document.querySelector('[data-ledgerbody]').scrollIntoView());
await A.page.click('[data-ledger="run"]');
await sleep(1200);
await shot(A, 'p3-06-ledger-desktop');

// ---------------------------------------------------------------- phone
await A.page.setViewportSize({ width: 390, height: 844 });
await sleep(400);
await A.page.click('[data-tab="refinery"]');
await sleep(800);
await A.page.locator('.refsite[data-site="planet"] .orecard').first().scrollIntoViewIfNeeded();
await shot(A, 'p3-07-refinery-phone');
await A.page.click('[data-tab="reports"]');
await sleep(1500);
await shot(A, 'p3-08-reports-phone');
await shot(B, 'p3-09-second-player-phone');

// ---------------------------------------------------------------- orbital station in the sky
await A.page.setViewportSize({ width: 1280, height: 800 });
skew += 40 * 3600_000;
const ob = await call(A, 'POST', '/api/v2/command', { cmd: { type: 'buildRefinery', site: 'orbital' } });
if (ob.body?.colony?.refinery?.orbital) {
  const ship = ob.body.colony.ships[0];
  await call(A, 'POST', '/api/v2/command', { cmd: { type: 'setRoute', shipId: ship.id, policy: 'refinery' } });
  await A.page.reload(); await A.page.waitForSelector('#app:not([hidden])'); await clean(A);
  await A.page.keyboard.press('Escape');
  await A.page.click('#zoomOut'); await A.page.click('#zoomOut');
  await sleep(2500);
  await shot(A, 'p3-10-orbital-station-desktop');
} else log('orbital not built:', ob.body?.error || ob.status);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No console errors.');
await browser.close();
await srv.close?.();
process.exit(errors.length ? 1 : 0);
