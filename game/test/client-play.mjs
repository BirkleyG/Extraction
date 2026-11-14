// Browser check for the v2 client: two players join, land, play the first minutes, see each other on Ranks.
//   node game/test/client-play.mjs [outDir]
// Runs its own in-memory server with a skewable clock so we can fast-forward without waiting.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server.js';
import { createStore } from '../store.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.resolve('test-shots');
fs.mkdirSync(out, { recursive: true });

const MID = process.argv.includes('--midmonth');
const now0 = new Date();
// Fresh month by default (no catch-up grant): pretend it is 30 minutes after the next month opens.
let skew = MID ? 0 : Date.UTC(now0.getUTCFullYear(), now0.getUTCMonth() + 1, 1, 0, 30) - Date.now();
const clock = () => Date.now() + skew;
const ai = { enabled: false, providers: {}, defaultModel: () => '', canUse: () => false, listModels: async () => [] };
const srv = await startServer({ port: 0, store: await createStore(null), ai, env: { ADMIN_CODE: 'boss', DATABASE_URL: '', GAME_CODE: '' }, now: clock, noTimers: true });
const base = `http://127.0.0.1:${srv.port}`;
const browser = await chromium.launch();
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function player(name, viewport, code = '') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600 });
  // Fonts come from Google; keep tests offline-safe.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text())) errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`));
  page.on('requestfailed', (r) => { if (!/fonts\.g/.test(r.url())) errors.push(`[${name}] request failed ${r.url()}`); });
  await page.goto(base + '/');
  await page.fill('#jName', name);
  if (code) await page.fill('#jRec', '');
  await page.click('form.join button[type=submit]');
  if (code) { /* owner joins with the admin code via API instead */ }
  await page.waitForSelector('.onboard #obGo');
  return { ctx, page, name };
}

const shot = (p, n) => p.page.screenshot({ path: path.join(out, n + '.png') });

const A = await player('Ana', { width: 1280, height: 800 });
await sleep(600);
await shot(A, '01-onboard-desktop');
// the Guild picks the landing spot; just roll a species
await A.page.click('#sbRoll');
await A.page.click('#obGo');
await A.page.waitForSelector('#app:not([hidden])');
await sleep(800);
await shot(A, '02-first-screen-desktop');

const B = await player('Bo', { width: 390, height: 844 });
await sleep(500);
await shot(B, '03-onboard-phone');
await B.page.click('#obGo');
await B.page.waitForSelector('#app:not([hidden])');
await sleep(800);
await shot(B, '04-first-screen-phone');

// both hire their first miner
for (const P of [A, B]) {
  await P.page.click('#hireRow button.buy');
}
await sleep(1500);
await shot(A, '05-hired-desktop');

async function ff(ms) {
  skew += ms;
  for (const P of [A, B]) await P.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await sleep(900);
}
// wait in real time for the first launch and sale (the client predicts them between syncs)
let gotLaunch = false, gotSale = false;
for (let i = 0; i < 90 && !gotSale; i++) {
  await sleep(1000);
  const toasts = await A.page.$$eval('#toasts .toast', (ts) => ts.map((t) => t.className + ' ' + t.textContent));
  if (!gotLaunch && toasts.some((t) => /launched/.test(t))) { gotLaunch = true; await sleep(1200); await shot(A, '06a-launch-desktop'); await shot(B, '06b-launch-phone'); }
  if (toasts.some((t) => /sale/.test(t))) { gotSale = true; await sleep(250); await shot(A, '06-sale-desktop'); await shot(B, '07-sale-phone'); }
}
console.log('first launch', gotLaunch, 'first sale', gotSale);

// play a few minutes: hire when possible, then buy what's affordable
let bannerShot = false;
for (let m = 0; m < 10; m++) {
  await ff(30_000);
  if (!bannerShot && await A.page.$('.banner.show')) { bannerShot = true; await shot(A, '07c-banner-desktop'); }
  for (const P of [A, B]) {
    const ready = await P.page.$$('#tabbody .row[data-cmd] button.buy.ready');
    if (ready.length) await ready[ready.length - 1].click().catch(() => {});
    await sleep(300);
  }
}
await sleep(1000);
await shot(A, '08-minutes-desktop');
await shot(B, '09-minutes-phone');

// tap a shaft in the canvas (desktop) to open its card
const cv = await A.page.$('#cv');
const box = await cv.boundingBox();
await A.page.evaluate(() => 0);
const info = await A.page.evaluate(() => ({ w: innerWidth }));
await A.page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.62);
await sleep(500);
await shot(A, '10-shaft-card-desktop');

// the new-shaft sheet: two directions, fuzzy prospects
if (await A.page.$('[data-opendig]')) {
  await A.page.click('[data-opendig]');
  await A.page.waitForSelector('.digsheet .digopt');
  await sleep(300);
  await shot(A, '10b-dig-sheet-desktop');
  const nOpts = await A.page.$$eval('.digopt', (os) => os.length);
  if (nOpts !== 2) errors.push('dig sheet should show 2 options, got ' + nOpts);
  const brk = await A.page.$('[data-break]:not([disabled])');
  if (brk) { await brk.click(); await sleep(900); await shot(A, '10c-shaft-opened-desktop'); }
  await A.page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
}
const mapTab = await A.page.$('[data-tab="map"]');
if (mapTab) { await mapTab.click(); await sleep(1500); await shot(A, '10d-map-desktop'); await A.page.click('[data-tab="mine"]'); }

// mid-month: spend the catch-up grant across every panel, then look at each tab
if (MID) {
  for (let round = 0; round < 12; round++) {
    await ff(120_000);
    for (const P of [A, B]) {
      const tabs = await P.page.$$eval('[data-tab]', (ts) => ts.map((t) => t.dataset.tab));
      for (const id of tabs.filter((t) => t !== 'ranks' && t !== 'market')) {
        await P.page.click(`[data-tab="${id}"]`).catch(() => {});
        await P.page.click('[data-bulkset="max"]').catch(() => {});
        for (let k = 0; k < 6; k++) {
          const b = await P.page.$('#tabbody .row[data-cmd] button.buy.ready');
          if (!b) break;
          await b.click().catch(() => {});
          await sleep(150);
        }
      }
    }
  }
  for (const P of [A, B]) {
    const tabs = await P.page.$$eval('[data-tab]', (ts) => ts.map((t) => t.dataset.tab));
    for (const id of tabs) {
      await P.page.click(`[data-tab="${id}"]`);
      await sleep(600);
      await shot(P, `20-${P.name}-${id}`);
    }
    await P.page.click('[data-tab="mine"]');
  }
}

// ranks
for (const P of [A, B]) {
  const t = await P.page.$('[data-tab="ranks"]');
  if (t) await t.click();
  await sleep(800);
}
await shot(A, '11-ranks-desktop');
await shot(B, '12-ranks-phone');
const ranksA = await A.page.$$eval('#tabbody table tr', (rs) => rs.map((r) => r.textContent.trim()));
const ranksB = await B.page.$$eval('#tabbody table tr', (rs) => rs.map((r) => r.textContent.trim()));

// a long time away: "while you were away"
skew += 2 * 3600_000;
await A.page.reload();
await A.page.waitForSelector('#app:not([hidden])');
await sleep(1500);
await shot(A, '13-away-desktop');
await A.page.click('.awaysheet [data-x]').catch(() => {});
for (const id of ['market', 'fleet', 'surface']) {
  if (await A.page.$(`[data-tab="${id}"]`)) { await A.page.click(`[data-tab="${id}"]`); await sleep(700); await shot(A, `13-${id}-desktop`); }
}

const state = await A.page.evaluate(async () => {
  const r = await fetch('/api/v2/state', { headers: { authorization: 'Bearer ' + localStorage.getItem('msc_server_token') } });
  const j = await r.json();
  return { coin: j.colony.coin, earned: j.colony.earned, miners: j.colony.miners, sales: j.colony.stats.sales, panels: j.colony.unlocked.panels };
});

// the owner: settings with the model picker and End month
const O = await (async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text())) errors.push(`[Boss] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[Boss] pageerror ${e.message}`));
  await page.goto(base + '/');
  await page.fill('#jName', 'Boss');
  await page.click('form.join details summary');
  await page.fill('#jCode', 'boss');
  await page.click('form.join button[type=submit]');
  await page.waitForSelector('.onboard #obGo');
  await page.click('#obGo');
  await page.waitForSelector('#app:not([hidden])');
  await sleep(500);
  await page.click('#gear');
  await sleep(600);
  return { page, ctx, name: 'Boss' };
})();
await shot(O, '14-owner-settings');
const ownerTools = !!(await O.page.$('#stEnd'));
O.page.on('dialog', (d) => d.accept());
await O.page.click('#stEnd');
await sleep(3500);
const ownerOnboard = await O.page.evaluate(() => !!document.querySelector('.onboard'));
const anaOnboard = await A.page.evaluate(() => !!document.querySelector('.onboard'));
await shot(O, '15-new-month');
console.log('owner tools', ownerTools, 'new month onboarding (owner, Ana)', ownerOnboard, anaOnboard);

console.log(JSON.stringify({ ranksA, ranksB, state, errors }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length ? 1 : 0);
