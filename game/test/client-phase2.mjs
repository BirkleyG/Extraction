// Browser check for Phase 2: species builder, nuke (two confirmations), blast, score, the Maker,
// the galaxy bulletin from a second player, evolutions, safety and the closing bell.
//   node game/test/client-phase2.mjs [outDir]
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
const srv = await startServer({ port: 0, store: await createStore(null), ai, env: { ADMIN_CODE: 'boss', DATABASE_URL: '', GAME_CODE: '' }, now: clock, noTimers: true });
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
  return { ctx, page, name };
}
const shot = (p, n) => p.page.screenshot({ path: path.join(out, n + '.png') });
const call = (p, method, url, body) => p.page.evaluate(async ([method, url, body]) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + localStorage.getItem('msc_server_token') }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, url, body]);

// ---------------------------------------------------------------- 1. species builder
const A = await player('Ana', { width: 1280, height: 800 });
await A.page.fill('#sbDesc', 'Crystal moles who sing to the rock and wear tiny crowns');
await A.page.click('#sbAsk');
await A.page.waitForFunction(() => !document.querySelector('#sbAsk').disabled);
await A.page.click('.sbp:nth-child(3) [data-step="1"]'); // swap the arms
await A.page.fill('#sbName', 'Glimmerkin');
await sleep(400);
await A.page.locator('.sb').scrollIntoViewIfNeeded();
await shot(A, '01-species-builder-desktop');
await A.page.click('#obGo');
await A.page.waitForSelector('#app:not([hidden])');
const sp = (await call(A, 'GET', '/api/v2/state')).body.colony.species;
log('species', JSON.stringify(sp));
if (!sp.head || sp.name !== 'Glimmerkin') errors.push('species not saved in full');

const B = await player('Bo', { width: 390, height: 844 });
await B.page.click('#sbRoll');
await sleep(300);
await shot(B, '02-species-builder-phone');
await B.page.click('#obGo');
await B.page.waitForSelector('#app:not([hidden])');

// ---------------------------------------------------------------- 2. grow A to nuke size (server-side autoSpend over skewed days)
let st;
for (let i = 0; i < 400; i++) {
  skew += 30 * 60_000;
  await call(A, 'POST', '/api/v2/command', { cmd: { type: 'autoSpend' } });
  if (i % 6 === 0) await call(B, 'POST', '/api/v2/command', { cmd: { type: 'autoSpend' } });
  st = (await call(A, 'GET', '/api/v2/state')).body;
  if (st.colony.runEarned >= 2.2e7) break;
}
// autoSpend no longer digs shafts (the player picks a direction): open as many as the coin allows
for (let k = 0; k < 4; k++) {
  const r = await call(A, 'POST', '/api/v2/command', { cmd: { type: 'buyShaft', dir: k % 2 ? 'right' : 'left' } });
  if (r.status !== 200) break;
}
st = (await call(A, 'GET', '/api/v2/state')).body;
log('A runEarned', Math.round(st.colony.runEarned), 'day', Math.floor((clock() - st.world.startedAt) / 864e5) + 1, 'shafts', st.colony.shafts.length, 'panels', st.colony.unlocked.panels.join(','));
await A.page.reload(); await A.page.waitForSelector('#app:not([hidden])');
await B.page.reload(); await B.page.waitForSelector('#app:not([hidden])');
await sleep(1500);
await A.page.keyboard.press('Escape');
await A.page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
await B.page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
await shot(A, '03-mine-species-desktop');

// safety
if (await A.page.$('[data-tab="safety"]')) {
  await A.page.click('[data-tab="safety"]');
  await sleep(400);
  const btn = await A.page.$('.row[data-cmd*="lights"] button.buy:not(:disabled)');
  if (btn) await btn.click();
  await sleep(300);
  await shot(A, '04-safety-desktop');
} else if (st.colony.shafts.length >= 4) errors.push('no safety tab');
else log('safety tab not open yet: only', st.colony.shafts.length, 'shafts (needs the 4th)');

// ---------------------------------------------------------------- 3. prestige + nuke
await A.page.click('[data-tab="prestige"]');
await sleep(500);
await shot(A, '05-prestige-desktop');
await A.page.click('[data-nuke]');
await A.page.click('[data-step2]');
await sleep(200);
await shot(A, '06-nuke-confirm-desktop');
await A.page.fill('.nukein', 'NUKE');
await A.page.click('[data-fire]');
await sleep(1100);
await shot(A, '07-blast-desktop');
await sleep(1500);
await shot(A, '07b-blast-late-desktop');
await A.page.waitForSelector('.scoresheet', { timeout: 15000 });
await sleep(400);
await shot(A, '08-score-desktop');
await A.page.click('[data-face]');
await A.page.waitForSelector('.makersheet .mk-line.maker');
await sleep(500);
await shot(A, '09-maker-open-desktop');
await A.page.selectOption('select[data-k="kind"]', 'demand');
await A.page.fill('.mk-reason', 'A war broke out in the Veyra system and every fleet needs armor plating; this ore is the only thing that stops plasma, so demand must surge across the sector.');
await A.page.click('[data-argue]');
await A.page.waitForFunction(() => !document.querySelector('.mk-typing'), null, { timeout: 15000 });
await sleep(300);
await shot(A, '10-maker-offer-desktop');
await A.page.setViewportSize({ width: 390, height: 844 });
await sleep(400);
await shot(A, '10b-maker-offer-phone');
await A.page.setViewportSize({ width: 1280, height: 800 });
const acc = await A.page.$('[data-accept]:not([hidden])');
if (!acc) errors.push('no Maker offer after a strong argument');
else { await acc.click(); await A.page.waitForFunction(() => /galaxy shifts/i.test(document.querySelector('.mk-log').textContent)); }
await sleep(800);
await shot(A, '11-maker-granted-desktop');
await A.page.click('[data-leave]');

// ---------------------------------------------------------------- 4. B sees the change
await B.page.evaluate(() => window.dispatchEvent(new Event('focus')));
await sleep(2500);
await shot(B, '12-galaxy-toast-phone');
const gxVisible = await B.page.$('#galaxyBtn:not([hidden])');
if (!gxVisible) errors.push('B has no galaxy indicator');
else { await B.page.click('#galaxyBtn'); await sleep(600); }
await shot(B, '13-galaxy-bulletin-phone');
const gxText = await B.page.textContent('#tabbody');
if (!/Maker deal/.test(gxText)) errors.push('B bulletin lacks the Maker deal');

// ---------------------------------------------------------------- 5. evolutions
await A.page.click('[data-tab="prestige"]');
await sleep(400);
const evo = await A.page.$('.row.evo button.buy:not(:disabled)');
if (evo) await evo.click(); else errors.push('no affordable evolution');
await sleep(600);
await shot(A, '14-prestige-after-desktop');
const st2 = (await call(A, 'GET', '/api/v2/state')).body.colony;
log('after nuke: sp', st2.sp, 'evo', JSON.stringify(st2.evo), 'nukes', st2.nukes);

await A.page.setViewportSize({ width: 390, height: 844 });
await sleep(500);
await shot(A, '15-prestige-phone');
await A.page.setViewportSize({ width: 1280, height: 800 });

// ---------------------------------------------------------------- 6. closing bell
const ends = st.world.endsAt;
skew += (ends - 47 * 3600_000) - clock();
await A.page.reload(); await A.page.waitForSelector('#app:not([hidden])');
await sleep(1200);
await shot(A, '16-closing-bell-desktop');
const bell = await A.page.textContent('#bell');
if (!/CLOSING BELL|Closing bell/i.test(bell || '')) errors.push('no closing bell: ' + bell);
await A.page.setViewportSize({ width: 390, height: 844 });
await sleep(3500);
await shot(A, '17-closing-bell-phone');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No console errors.');
await browser.close();
await srv.close?.();
process.exit(errors.length ? 1 : 0);
