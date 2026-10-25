import { createLocalRuntime } from './local-runtime.js';
import { renderIndustry, actionFromIndustryButton } from './industry-ui.js';
import { createMakerBrief, generateMakerContent } from './maker.js';
import { FRONTIER_TUNE } from './frontier.js';
import { RECONCILE_MS } from './sync-policy.js';
import {
  expectedUnitValue, nextShaftCost, destinationsFor, HARDNESS, ORES, DESTINATIONS, SAVE_KEY, TOUGH_TERRAINS, toolHardness, veinStatus, advanceGame, buyNextShaft, createGameState, currentLiftRate, currentRates, shaftRateFor, habitatCapacity, hireCost,
  dispatchNow, grantDevCoins, hireWorkers, purchaseUpgrade, selectDestination,
  setAutoLaunch, stepGame, upgradeCost, validateGameState, industryCommand, frontierCommand,
} from './model.js';
import { FX_SPOTS, MAPVIEW, veinSpot, VIEW, addFx, clampCam, clampMapCam, mapScale, mapTerrain, regionAtMap, renderMap, renderScene, sideScale } from './scene.js';
import { TIERS, tierOf } from './upgrades.js';
import { TERRAINS, aiReady, aiSettings, generatePlanet, loadHistory, loadPlanet, recordPlanet, saveAiSettings, savePlanet, askJSON } from './planet.js';

const $ = (selector) => document.querySelector(selector);

/* ---- plain-language glossary shown as hover tips ---- */
const GLOSSARY = {
  unit: 'UNIT — one standard crate of ore. Everything is counted in units: how fast you mine (units/min), what sits in the yard, what the hauler carries (150 to start) and what buyers pay (coin per unit). Example: 150 units of Ferrite at 40 ◉ each pays 6,000 ◉.',
  coin: 'COIN (◉) — your money. You spend it on upgrades; the player with the most coin at the end of the month wins. Buildings and ore in the yard do not count.',
  yard: 'ORE YARD — surface storage where mined ore waits for the hauler. The number is units now / units it can hold. If the yard fills up, the lift stops.',
  rate: 'ORE PER MINUTE — how many units your crews dig per minute right now, limited by the lift. More miners, a deeper dig level and carts all raise it.',
  sold: 'SOLD SO FAR — all the coin buyers have paid you this run. Payment arrives the moment the hauler takes off, not when it lands.',
  time: 'SIM TIME — how long this mine has been running. It keeps running while you are away.',
  hold: 'HOLD — how many units the hauler can carry in one trip (150 at the start). Bigger holds mean fewer trips for the same ore.',
  launch: 'LAUNCH NOW — send the hauler off immediately with whatever ore is aboard plus what is waiting in the yard, even if the hold is not full. You are paid at takeoff.',
  auto: 'AUTO TAKE-OFF — the hauler loads ore as it is mined and leaves on its own the moment the hold is full. Turn it off to launch only by hand.',
  au: 'AU — the distance unit on the map. Trip time = 2 × distance ÷ hauler speed, plus unloading. Farther buyers cost more time but may pay more per unit.',
  bid: 'PRICE PER UNIT — what this buyer pays for each unit of ore. Total pay = units × price. Rarer ore is worth more than Ferrite.',
  endless: 'These computer-run buyers never run out of coin or room, so you can always sell. Their prices are fixed test values for now.',
  takeoff: 'You are paid when the hauler takes off. Nothing more is paid on arrival, and the cargo can no longer be changed or lost.',
  crew: 'CREW — miners you have hired. Each shaft holds up to 10 miners (+5 per bunkhouse level), and the habitat limits your total crew.',
  loadrate: 'LOADING RATE — units per minute the launch pad moves from the yard into the hold. It only matters when you press Launch now (it adds loading time to the next trip).',
};
const tip = (text) => ` data-tip="${text.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`;
const UPGRADE_TIPS = {
  dig: 'DIG RATE — how many units each miner digs per minute in this shaft. Each level adds a little; tiers are cosmetic names for milestones.',
  lift: 'LIFT — hauls ore from the shafts to the surface (units per minute). If it is slower than your mining, ore backs up in the shafts and output is wasted.',
  yard: 'SURFACE YARD — how many units of ore can wait for the hauler. Bigger yard = the lift never stalls while the hauler is away.',
  shipSpeed: 'HAULER SPEED — faster round trips, so you are paid more often.',
  shipCapacity: 'CARGO CAPACITY — units per trip. With auto take-off the hauler leaves when this fills.',
  loading: 'PAD LOADING — units per minute moved from the yard onto the hauler.',
  habitat: 'HABITAT — beds for your whole crew. You cannot hire past it.',
  bunkhouse: 'BUNKHOUSE — +5 miner slots in this shaft.',
  cart: 'CARTS — raise how much of the dig reaches the lift (utilization) in this shaft.',
};

/* ---- hover tips: any element with data-tip explains itself (tap on touch screens) ---- */
const tipBox = document.createElement('div');
tipBox.id = 'gtip'; tipBox.setAttribute('role', 'tooltip'); tipBox.hidden = true;
document.body.append(tipBox);
let tipAnchor = null; let tipTimer = 0;
function hideTip() { tipBox.hidden = true; tipAnchor = null; clearTimeout(tipTimer); }
function showTip(target) {
  tipAnchor = target; tipBox.textContent = target.getAttribute('data-tip'); tipBox.hidden = false;
  const r = target.getBoundingClientRect(); const w = tipBox.offsetWidth; const h = tipBox.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  const top = r.bottom + 8 + h > window.innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8;
  tipBox.style.left = `${left}px`; tipBox.style.top = `${top}px`;
}
let mouseX = 0; let mouseY = 0;
document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
/** a re-render replaces the hovered element; keep the tip attached to whatever is now under the pointer */
function syncTip() {
  if (!tipAnchor) return;
  if (document.contains(tipAnchor)) { tipBox.textContent = tipAnchor.getAttribute('data-tip'); return; }
  const t = document.elementFromPoint(mouseX, mouseY)?.closest?.('[data-tip]');
  if (t) showTip(t); else hideTip();
}
document.addEventListener('mouseover', (e) => { const t = e.target.closest?.('[data-tip]'); if (t && t !== tipAnchor) showTip(t); else if (!t) hideTip(); });
document.addEventListener('focusin', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); });
document.addEventListener('focusout', hideTip);
document.addEventListener('scroll', hideTip, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
document.addEventListener('click', (e) => { const t = e.target.closest?.('[data-tip]'); if (t && matchMedia('(pointer: coarse)').matches) { showTip(t); clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 5000); } });
for (const [selector, key] of [['.stat.coin', 'coin'], ['#hSurface', 'yard'], ['#hEarned', 'sold'], ['#hTime', 'time'], ['#hRate', 'rate']]) {
  const el = document.querySelector(selector); const host = el?.closest('.stat') ?? el; host?.setAttribute('data-tip', GLOSSARY[key]);
}

const canvas = $('#cv');
const ctx = canvas.getContext('2d', { alpha: false });
const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
let state;
let paused = false;
let recovering = '';
let catchupRemaining = 0;
let catchingUp = false;
let catchupKind = 'offline';
let savedAtMs = Date.now();
let tab = 'sell';
let resetPromptOpen = false;
let newEconomyPrompt = false;
const RECOVERY_KEY = 'extraction_sandbox_corrupt_recovery';
let corruptRaw = null;
let saveBlocked = false;
const blockedSaveMessage = 'The unreadable save is preserved at its original key. Recovery storage is unavailable or already occupied. This mine runs in memory only until you explicitly reset it in Tools.';
let grantValue = '10000';
let toastTimer;
/* ---- offline sandbox (default) or the online game (opt-in with ?mode=online or the header button) ---- */
const modeParam = new URLSearchParams(location.search).get('mode');
if (modeParam === 'online' || modeParam === 'offline') { try { localStorage.setItem('extraction_mode', modeParam); } catch { /* ignore */ } }
const REMOTE = (() => { try { return localStorage.getItem('extraction_mode') === 'online'; } catch { return false; } })();
let online = null;
let pendingRemote = 0;
let nextPollAt = 0;
let remoteSyncPromise = null;
let remoteSyncQueued = false;
let remoteGeneration = 0;
let makerBusy = false;
const localRuntime = createLocalRuntime();
let catchupInFlight = false;
let world = loadPlanet();
let planet = world.planet;
let regionId = world.regionId;
let planetBusy = false;
let lastTickMs = performance.now();
const region = () => planet.regions.find((r) => r.id === regionId) || planet.regions[0];
const siteOpts = (r = region()) => ({ planetId: planet.id, regionId: r.id, tough: TOUGH_TERRAINS.includes(r.terrain) });
const oreIndex = (id) => ORES.findIndex((o) => o.id === id);
/* The planet decides what the ores are called and look like. Rates and values stay with the model. */
function skinOres() { ORES.forEach((o, i) => { const p = planet.ores[i]; o.name = p.name; o.color = p.color; o.cat = p.cat; }); }
skinOres();
if (!loadHistory().length) recordPlanet(planet);

function formatClock(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = seconds % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
function fmt(value) { return formatter.format(value); }
function fmtUnits(value) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value); }
function fillFraction(value, max) { return Math.round(Math.min(1, max > 0 ? value / max : 0) * 100); }
function oreById(id) { return ORES.find((ore) => ore.id === id); }
const isNewEconomy = () => state.economyProfile === 'sandbox-rebuild-v1';
function destinationById(id) { return destinationsFor(state).find((item) => item.id === id); }
function surfaceTotal() { return state.production.surface.unitsByOre.reduce((sum, row) => sum + row.units, 0); }
function liftRate() { return currentLiftRate(state); }
function totalRate() { return currentRates(state).reduce((sum, row) => sum + row.ratePerMinute, 0); }
function safeText(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createGameState(siteOpts());
    const wrapper = JSON.parse(raw);
    if (!wrapper || wrapper.version !== 1 || !Number.isSafeInteger(wrapper.savedAtMs) || wrapper.savedAtMs < 0) throw new Error('Unsupported save');
    savedAtMs = wrapper.savedAtMs;
    const loaded = validateGameState(wrapper.state);
    if (wrapper.pendingCatchupSeconds !== undefined && (!Number.isSafeInteger(wrapper.pendingCatchupSeconds) || wrapper.pendingCatchupSeconds < 0)) throw new Error('Invalid pending catch-up');
    catchupRemaining = wrapper.pendingCatchupSeconds || 0;
    if (wrapper.catchupKind === 'fast-forward' || wrapper.catchupKind === 'offline') catchupKind = wrapper.catchupKind;
    paused = wrapper.paused === true;
    const elapsed = Math.floor((Date.now() - savedAtMs) / 1000);
    if (!paused && elapsed > 0 && Number.isSafeInteger(elapsed)) catchupRemaining += elapsed;
    else if (elapsed < 0) recovering = 'The browser clock moved backward since the last save. The mine resumed without adding offline time.';
    return loaded;
  } catch {
    corruptRaw = raw;
    if (raw !== null) {
      try {
        const existing = localStorage.getItem(RECOVERY_KEY);
        if (!existing) {
          const backup = JSON.stringify({ backedUpAtMs: Date.now(), sourceKey: SAVE_KEY, reason: 'Unreadable local save', raw });
          localStorage.setItem(RECOVERY_KEY, backup);
          if (localStorage.getItem(RECOVERY_KEY) !== backup) throw new Error('Recovery backup did not persist');
        } else if (JSON.parse(existing).raw !== raw) throw new Error('Recovery slot already contains another save');
      } catch { saveBlocked = true; }
    }
    catchupRemaining = 0; paused = false; savedAtMs = Date.now();
    recovering = saveBlocked ? blockedSaveMessage : 'The unreadable save was preserved as a recovery backup. A fresh sandbox is open. Download the original text from Tools.';
    return createGameState(siteOpts());
  }
}

function save() {
  if (state && state.remote) return; // the server is the save file online
  if (saveBlocked) { recovering = blockedSaveMessage; return; }
  try {
    savedAtMs = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAtMs, pendingCatchupSeconds: catchupRemaining, catchupKind, paused, state }));
  } catch {
    recovering = 'Browser storage is unavailable. This session is playable, but its latest changes may not survive a reload.';
  }
}

function toast(message, tone = '') {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  element.style.borderColor = tone === 'error' ? 'var(--bad)' : tone === 'success' ? 'var(--ok)' : '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 2600);
}

function messageFor(error) {
  const messages = {
    INSUFFICIENT_FUNDS: 'Not enough coin for that purchase.',
    NO_WORKER_CAPACITY: 'Open habitat or shaft bunks before hiring more miners.',
    AT_CAP: 'This line is already at its cap.',
    SHIP_BUSY: 'The hauler is still returning to the pad.',
    NOT_ENOUGH_STOCK: 'There is no ore in the hold or the yard to launch yet.',
    INVALID_PAYMENT: 'The local transaction could not be balanced.',
  };
  return messages[error?.code] || error?.message || 'The action could not be completed.';
}

function remoteMessage(error) {
  const messages = { SHIP_BUSY: 'The hauler is still away.', NO_CARGO: 'No ore in the yard yet.', INSUFFICIENT_FUNDS: 'Not enough coin.', NO_HABITAT_CAPACITY: 'Build more habitat first.', NO_SHAFT_CAPACITY: 'Add bunkhouse levels or a new shaft first.', AT_CAP: 'Already at the maximum.', MONTH_CLOSED: 'The month has ended. Reload to start the next one.', CATCHING_UP: 'The server is catching up. Try again in a moment.' };
  return messages[error?.code] || `The server refused that (${error?.code || error?.message || 'error'}).`;
}

/** Pull the server's view of the mine and replace the local picture of it (after commands, on a timer, and on return to the tab). */
async function syncRemote(force = false) {
  if (!REMOTE || pendingRemote > 0) return;
  if (remoteSyncPromise) { if (force) remoteSyncQueued = true; return remoteSyncPromise; }
  const generation = remoteGeneration;
  remoteSyncQueued = false;
  remoteSyncPromise = (async () => {
  try {
    const before = state;
    const r = await online.fetchView();
    if (pendingRemote > 0 || generation !== remoteGeneration) { remoteSyncQueued = true; return; }
    const seen = new Set(before.shipments.map((x) => x.id));
    const fresh = r.state.shipments.filter((x) => !seen.has(x.id));
    state = r.state; planet = r.planet; regionId = r.regionId; skinOres();
    if (fresh.length && before.remote && !justSent) {
      const units = fresh.reduce((a, x) => a + x.units, 0); const pay = fresh.reduce((a, x) => a + x.payment, 0);
      online.note(`${fresh.length} automatic takeoff${fresh.length === 1 ? '' : 's'}: ${fmt(units)} units sold for ${fmt(pay)} ◉.`, state.simSeconds);
      state = { ...state, log: [...state.log, { atSecond: state.simSeconds, message: `${fresh.length} automatic takeoff${fresh.length === 1 ? '' : 's'}: ${fmt(units)} units sold for ${fmt(pay)} ◉.`, type: 'sale' }].slice(-80) };
      toast(`Hauler took off automatically — ${fmt(pay)} ◉ paid.`, 'success'); blip([523, 659, 784]);
    }
    justSent = false;
    nextPollAt = Date.now() + RECONCILE_MS;
    render();
  } catch (error) {
    if (error?.status === 401) { toast('Signed out. Reload to sign in again.', 'error'); return; }
    nextPollAt = Date.now() + RECONCILE_MS;
  } finally {
    remoteSyncPromise = null;
    if (remoteSyncQueued && pendingRemote === 0) { remoteSyncQueued = false; queueMicrotask(() => syncRemote()); }
  }
  })();
  return remoteSyncPromise;
}
let justSent = false;
const POLL_MS_LOCAL = RECONCILE_MS;

function applyRemote(before, next, success) {
  remoteGeneration += 1;
  const cmds = online.commandsFor(before, next);
  state = next;
  if (!cmds.length) { render(); return true; }
  justSent = true; pendingRemote += 1; render();
  if (success) toast(success, 'success');
  online.send(cmds).catch((error) => { toast(remoteMessage(error), 'error'); blip([140]); }).finally(() => { pendingRemote -= 1; syncRemote(true); });
  return true;
}

function apply(action, success) {
  try {
    if (state.remote && pendingRemote > 2) { toast('One moment — the server is still working.', 'error'); return false; }
    const before = state;
    const result = validateGameState(action(state));
    if (state.remote) return applyRemote(before, result, success);
    state = result;
    save();
    render();
    if (success) toast(success, 'success');
    return true;
  } catch (error) {
    toast(messageFor(error), 'error');
    return false;
  }
}

/* ---- upgrade juice: sound, floating text, tier-up fanfare ---- */
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let guideDismissed = false;
try { const motion = localStorage.getItem('extraction_motion'); if (motion) reducedMotion = motion === 'reduced'; guideDismissed = localStorage.getItem('extraction_guide_done') === 'yes'; } catch {}
document.documentElement.classList.toggle('reduce-motion', reducedMotion);
function renderGuide() {
  const el = $('#firstSteps');
  if (!el) return;
  el.hidden = !!state.remote || guideDismissed;
  if (el.hidden) return;
  const sold = state.shipments.length > 0;
  const bought = state.ledger.some((e) => e.type === 'SYSTEM_PURCHASE') || (state.historyArchive?.ledger?.amountsByType?.SYSTEM_PURCHASE ?? 0) > 0;
  el.innerHTML = `<span class="${state.simSeconds > 0 ? 'done' : ''}">1. Mine</span><span class="${sold ? 'done' : ''}">2. Launch & earn</span><button data-tab="upgrades" type="button" class="${bought ? 'done' : ''}">3. Upgrade</button><button data-act="guide-dismiss" aria-label="Dismiss first steps" type="button">×</button><small>${sold ? 'Reinvest your coin in the Upgrades tab.' : `Your ${state.workersHired} miners are digging. Send your first ore from Sell.`}</small>`;
}
let audio = null;
let soundOn = true;
try { soundOn = localStorage.getItem('extraction_sound') !== 'off'; } catch { /* default on */ }
function blip(notes) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime;
    notes.forEach((hz, i) => {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = 'square'; o.frequency.value = hz; g.gain.setValueAtTime(0.04, t0 + i * 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.07 + 0.16);
      o.connect(g); g.connect(audio.destination); o.start(t0 + i * 0.07); o.stop(t0 + i * 0.07 + 0.18);
    });
  } catch { /* audio unavailable */ }
}
const levelOf = (type, n = 1) => {
  if (isNewEconomy() && (type === 'pick' || type === 'hauler')) return state.upgrades[type];
  if (type === 'lift') return state.production.lift.level;
  const sh = state.production.shafts.find((q) => q.shaftNumber === n);
  if (type === 'dig') return sh.digLevel;
  if (type === 'bunkhouse') return sh.bunkhouseLevel;
  if (type === 'cart') return sh.cartLevel;
  return state.upgrades[type];
};
let lastBought = { type: '', n: 0, at: 0 };
function buyUpgrade(type, n, count) {
  const before = levelOf(type, n); const tierBefore = tierOf(type, before);
  const ok = apply((cur) => purchaseUpgrade(cur, type, { shaftNumber: n, count }), '');
  if (!ok) { blip([140]); return; }
  const after = levelOf(type, n); const tierAfter = tierOf(type, after); const spot = FX_SPOTS[type] || [290, 0];
  lastBought = { type, n, at: performance.now() };
  if (tierAfter.i > tierBefore.i) {
    addFx(spot[0], spot[1], `TIER UP! ${tierAfter.name}`, '#ffd23f'); blip([523, 659, 784, 1047]);
    toast(`★ ${TIERS[type].label} is now a ${tierAfter.name}!`, 'success');
  } else {
    addFx(spot[0], spot[1], `+${after - before} ${TIERS[type].label}`, '#5ee6a8'); blip([660, 880]);
    toast(`${TIERS[type].label}: ${tierAfter.name} · LV ${after}`, 'success');
  }
}

/* what the next level of an upgrade will actually do */
const effectCache = new Map();
function effectText(type, n = 1) {
  const level = levelOf(type, n); const key = `${state.economyProfile || 'original'}|${type}|${n}|${level}|${state.production.lift.level}|${state.upgrades.pick}|${state.upgrades.hauler}|${state.production.shafts.length}|${state.workersHired}`;
  if (effectCache.has(key)) return effectCache.get(key);
  let text = '';
  try {
    const next = purchaseUpgrade({ ...state, coins: Number.MAX_SAFE_INTEGER }, type, { shaftNumber: n, count: 1 });
    const crew = Math.max(1, state.production.shafts.find((q) => q.shaftNumber === n).workersAssigned);
    const rate = (st) => shaftRateFor(st, n, crew);
    const f = {
      pick: (st) => `${fmtUnits(shaftRateFor(st, n, 10))} ore/min per shaft`,
      hauler: (st) => `${fmtUnits(st.ship.capacityUnits)} hold · ${fmtUnits(st.ship.speedPerMinute)} AU/min`,
      lift: (st) => `${currentLiftRate(st).toFixed(2)} units/min hauled`,
      dig: (st) => `${fmtUnits(rate(st))} ore/min from shaft ${String(n).padStart(2, '0')}${state.production.shafts.find((q) => q.shaftNumber === n).workersAssigned ? '' : ' (per miner)'}`,
      yard: (st) => `${fmtUnits(st.production.surface.capacityUnits)} units of yard`,
      shipSpeed: (st) => `${st.ship.speedPerMinute.toFixed(2)} AU/min`,
      shipCapacity: (st) => `${fmtUnits(st.ship.capacityUnits)} unit hold`,
      loading: (st) => `${fmtUnits(st.ship.loadingUnitsPerMinute)} units/min loaded`,
      habitat: (st) => `${habitatCapacity(st.upgrades.habitat)} crew beds`,
      bunkhouse: (st) => `${10 + 5 * st.production.shafts.find((q) => q.shaftNumber === n).bunkhouseLevel} crew in this shaft`,
      cart: (st) => `${fmtUnits(st.production.shafts.find((q) => q.shaftNumber === n).bufferCapacityUnits)} unit shaft buffer`,
    }[type];
    text = `${f(state)}  →  ${f(next)}`;
  } catch { text = ''; }
  if (effectCache.size > 400) effectCache.clear();
  effectCache.set(key, text); return text;
}

function upgradeCard(type, n = 1, opts = {}) {
  const level = levelOf(type, n); const tier = tierOf(type, level); const cost = upgradeCost(state, type, n);
  const flash = lastBought.type === type && lastBought.n === n && performance.now() - lastBought.at < 900 ? ` flash" style="animation-delay:-${Math.round(performance.now() - lastBought.at)}ms` : '';
  const left = tier.next ? Math.max(0, tier.next.at - level) : 0;
  const bulk = opts.bulk ? `<div class="bulk">${['10', '100', 'max'].map((c) => `<button data-buy="${type}" data-count="${c}" data-shaft="${n}" type="button">${c === 'max' ? 'MAX' : `×${c}`}</button>`).join('')}</div>` : '';
  const can = cost !== null && state.coins >= cost;
  return `<div class="up2${flash}"${tip(UPGRADE_TIPS[type] || '')}><div class="up2-ico">${tier.icon}</div><div class="up2-main">
      <div class="up2-title"><b>${tier.label}</b><span>${safeText(tier.name)}</span><em>LV ${level}</em></div>
      <div class="up2-effect">${safeText(effectText(type, n))}</div>
      <div class="meter tier"><i style="width:${Math.round(tier.progress * 100)}%"></i></div>
      <div class="up2-next">${tier.next ? `Becomes a <b>${safeText(tier.next.name)}</b> at LV ${tier.next.at} · ${left} to go` : 'Top tier reached'}</div>${bulk}
    </div><button class="buy up2-buy${can ? ' ready' : ''}" data-buy="${type}" data-shaft="${n}" type="button"${can ? '' : ' disabled'}>${cost === null ? 'MAXED' : `UPGRADE<br><b>${fmt(cost)} ◉</b>`}</button></div>`;
}

function costButton(type, shaftNumber = 1) {
  const cost = upgradeCost(state, type, shaftNumber);
  return cost === null ? 'CAPPED' : `${fmt(cost)} ◉`;
}

const TABS = [['sell', 'Sell'], ['upgrades', 'Upgrades'], ['shafts', 'Shafts'], ['planet', 'Planet'], ['industry', 'Industry'], ['colony', 'Colony'], ['records', 'Records'], ['tools', 'Tools']];
const tabLabel = (id, label) => (REMOTE && id === 'tools' ? 'Account' : label);
const shaftCost = () => nextShaftCost(state);
const crewCap = () => habitatCapacity(state.upgrades.habitat);
const buyBtn = (attrs, label, cost, cls = '') => `<button class="buy ${cls}" ${attrs} type="button"${cost === null ? ' disabled' : ''}>${label}<br>${cost === null ? 'CAPPED' : `${fmt(cost)} ◉`}</button>`;

/* ---- veins: announce when the crew reaches, can't break, or exhausts one ---- */
const veinSeen = new Map(); let veinSite = '';
function watchVeins() {
  if (veinSite !== state.site.seed) { veinSeen.clear(); veinSite = state.site.seed; }
  for (const v of state.veins) {
    const st = veinStatus(state, v); const prev = veinSeen.get(v.id); veinSeen.set(v.id, st);
    if (prev === undefined || prev === st) continue;
    const o = ORES.find((q) => q.id === v.oreId); const spot = veinSpot(v.shaftNumber, v);
    if (st === 'mining') { addFx(spot[0], spot[1] - 12, `${o.name.toUpperCase()} VEIN!`, o.color); blip([523, 784, 1047]); toast(`Shaft ${v.shaftNumber} broke into a ${o.name} vein.`, 'success'); }
    else if (st === 'blocked') { addFx(spot[0], spot[1] - 12, 'PICK TOO WEAK', '#ff5a6e'); blip([220, 180]); toast(`Shaft ${v.shaftNumber} found ${o.name} but the pick can't break it. The crew keeps digging common ore.`, 'error'); }
    else if (st === 'empty') { addFx(spot[0], spot[1] - 12, 'VEIN DRY', '#b3a5d3'); toast(`The ${o.name} vein in shaft ${v.shaftNumber} ran dry.`); }
  }
}
const pickNeeded = (hardness) => { const sandbox = isNewEconomy(); const t = TIERS[sandbox ? 'pick' : 'dig'].tiers.find(([at]) => toolHardness(at, sandbox) >= hardness); return t ? t[1] : 'a better pick'; };
const oreRank = (id) => (id === 'mythic' ? 'Mythic' : ['lithium', 'sulfur', 'crystal', 'iridium'].includes(id) ? 'Rare' : 'Common');

function renderHud() {
  watchVeins();
  const rate = totalRate();
  $('#hCoin').textContent = fmt(state.coins);
  $('#hCoin').title = `Spendable ${state.coins.toLocaleString()} · refinery escrow ${(state.industry?.refinery?.budget ?? 0).toLocaleString()} · total owned ${(state.coins + (state.industry?.refinery?.budget ?? 0)).toLocaleString()}`;
  $('#hRate').textContent = `${fmtUnits(rate)} ore / min`;
  $('#hSurface').textContent = `${fmtUnits(surfaceTotal())} / ${fmtUnits(state.production.surface.capacityUnits)}`;
  $('#hEarned').textContent = fmt(state.totalExternalEarnings);
  if (state.remote) {
    const left = Math.max(0, Math.floor((state.online.monthEndsAtMs - state.online.serverNowMs - (Date.now() - state.online.receivedAtMs)) / 1000));
    $('#hTime').textContent = `${Math.floor(left / 86400)}d ${String(Math.floor(left / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(left / 60) % 60).padStart(2, '0')}m`;
    $('#hTime').previousElementSibling.textContent = 'Month ends';
  } else $('#hTime').textContent = formatClock(state.simSeconds);
  $('#hLive').textContent = state.remote ? 'ONLINE' : catchingUp ? 'CATCHING UP' : paused ? 'MINE PAUSED' : isNewEconomy() ? 'SANDBOX · NEW' : 'SANDBOX · ORIGINAL';
  $('#hLive').classList.toggle('off', !state.remote && (paused || catchingUp));
  for (const sel of ['#pauseBtn', '[data-forward="60"]']) { const el = document.querySelector(sel); if (el) el.hidden = !!state.remote; }
  const mb = $('#modeBtn'); if (mb) mb.textContent = state.remote ? 'Offline sandbox' : 'Play online ↗';
  $('#pauseBtn').textContent = paused ? 'Resume' : 'Pause';
  $('#pauseBtn').setAttribute('aria-pressed', String(paused));
  const tag = $('#stageTag');
  tag.innerHTML = `<b>${safeText(region().name.toUpperCase())}</b> · ${safeText(TERRAINS[region().terrain].label)} · ${state.remote ? 'ONLINE' : isNewEconomy() ? 'SANDBOX · NEW ECONOMY' : 'SANDBOX · ORIGINAL ECONOMY'} · ${state.production.shafts.length} shaft${state.production.shafts.length === 1 ? '' : 's'} · ${state.workersHired} miners · lift LV ${state.production.lift.level}`;
  const yard = state.production.surface.capacityUnits ? surfaceTotal() / state.production.surface.capacityUnits : 0;
  const buf = Math.max(0, ...state.production.shafts.map((s) => (s.bufferCapacityUnits ? s.bufferUnits / s.bufferCapacityUnits : 0)));
  const banner = $('#banner');
  const msg = catchingUp ? `CATCHING UP · ${fmt(catchupRemaining)} s left` : recovering || (yard >= 0.9 ? 'ORE YARD · near capacity' : buf >= 0.9 ? 'ORE WAITING BELOW · crews at work' : '');
  banner.hidden = !msg;
  banner.classList.toggle('bad', !catchingUp && !recovering && !!msg);
  banner.textContent = msg;
  renderGuide();
  const last = state.log.slice(-2).reverse();
  $('#ticker').innerHTML = last.length ? last.map((e) => `<div>${formatClock(e.atSecond)} · ${safeText(e.message)}</div>`).join('') : '<div>The mine is quiet. Dig deeper, keep the lift moving, sell the ore.</div>';
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.filter(([id]) => !['industry', 'colony'].includes(id) || isNewEconomy()).map(([id, label]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${tab === id}">${tabLabel(id, label)}</button>`).join('');
}

function shipStatus() {
  if (state.ship.readyAtSecond > state.simSeconds) return `Hauler away · back in ${formatClock(state.ship.readyAtSecond - state.simSeconds)}`;
  if (state.ship.cargoUnits >= state.ship.capacityUnits - 1e-9) return 'Hold full';
  if (state.ship.loading) return 'Loading ore from the yard';
  return state.ship.cargoUnits >= 1 ? 'Waiting for more ore' : 'Ready at the pad';
}

/** units (and their value) that "Launch now" would send this second */
function launchPreview() {
  const aboard = state.ship.cargoUnits;
  const id = state.ship.cargoOreId ?? state.production.surface.unitsByOre.filter((r) => isNewEconomy() ? Math.floor(r.units) >= 1 : r.units > 0).sort((a, b) => expectedUnitValue(state, b.oreId) - expectedUnitValue(state, a.oreId) || (a.oreId < b.oreId ? -1 : a.oreId > b.oreId ? 1 : 0))[0]?.oreId ?? null;
  const yardUnits = id ? (state.production.surface.unitsByOre.find((r) => r.oreId === id)?.units ?? 0) : 0;
  const loadable = isNewEconomy() ? Math.floor(yardUnits) : yardUnits;
  const units = aboard + Math.min(loadable, Math.max(0, state.ship.capacityUnits - aboard));
  return { units, id, pay: id ? Math.floor(units * expectedUnitValue(state, id) + 0.5) : 0 };
}

function tabSell() {
  const preview = launchPreview();
  const ready = state.ship.readyAtSecond <= state.simSeconds;
  const can = ready && preview.units >= 0.5 && !catchingUp;
  const holdPct = Math.round(Math.min(1, state.ship.cargoUnits / state.ship.capacityUnits) * 100);
  const rows = destinationsFor(state).map((d) => {
    const sel = d.id === state.selectedDestinationId;
    const oreId = preview.id || state.site.commonOreId;
    const price = expectedUnitValue({ ...state, selectedDestinationId: d.id }, oreId);
    const units = preview.units || state.ship.capacityUnits;
    const unload = isNewEconomy() ? d.unloadSeconds : units / d.unloadUnitsPerMinute * 60;
    const load = isNewEconomy() ? 0 : Math.ceil(Math.max(0, units - state.ship.cargoUnits) / state.ship.loadingUnitsPerMinute * 60);
    const trip = Math.ceil(2 * d.distance / state.ship.speedPerMinute * 60 + unload) + load;
    return `<div class="row ${sel ? 'sel' : ''}"><div><div class="t"><span class="pick"></span>${safeText(d.name)} <span class="own"${tip(GLOSSARY.bid)}>${fmt(price)} ◉ / ${safeText(oreById(oreId).name)} unit</span></div><div class="d"><span${tip(GLOSSARY.au)}>${d.distance} AU away</span> · ${formatClock(trip)} until ready again${preview.units ? ' at this load' : ' at full hold'}</div><div class="e"${tip(GLOSSARY.endless)}>Buys every unit · never runs out</div></div><button class="buy ${sel ? 'ok' : 'ghost'} sm" data-destination="${d.id}" type="button">${sel ? 'Selected' : 'Sell here'}</button></div>`;
  }).join('');
  return `<h2>Where to sell</h2><p class="lede">Ore is counted in <b${tip(GLOSSARY.unit)}>units</b> (one unit = one crate). Buyers pay <b>coin per unit</b> the moment the hauler takes off.</p>
    <h3>Hauler</h3>
    <div class="row"><div><div class="t">${safeText(shipStatus())}</div><div class="d"${tip(GLOSSARY.hold)}>Hold: ${fmtUnits(state.ship.cargoUnits)} / ${fmtUnits(state.ship.capacityUnits)} units · ${state.ship.speedPerMinute.toFixed(2)} AU/min</div><div class="meter" style="margin-top:6px"><i style="width:${holdPct}%"></i></div></div><button class="buy ready" data-act="launch" type="button"${can ? '' : ' disabled'}${tip(GLOSSARY.launch)}>LAUNCH NOW ↗<br>${preview.units >= 0.5 ? `${fmtUnits(preview.units)} u → ${fmt(preview.pay)} ◉` : 'no ore yet'}</button></div>
    <label class="toggle" style="margin:10px 0"${tip(GLOSSARY.auto)}><input type="checkbox" data-act="auto"${state.autoLaunch ? ' checked' : ''}${catchingUp ? ' disabled' : ''}> Take off automatically when the hold is full</label>
    <h3>Buyers</h3><div class="rows">${rows}</div>
    <div class="note"${tip(GLOSSARY.takeoff)}>You are paid at takeoff — never again on arrival. Prices are playtest fixtures, not certified balance.</div>`;
}

function tabUpgrades() {
  if (isNewEconomy()) return `<h2>Reinvest</h2><p class="lede">Three machines. One growing mine. Every level applies across all shafts.</p>
    <div class="rows compact-upgrades">${upgradeCard('pick', 1, { bulk: true })}${upgradeCard('lift', 1, { bulk: true })}${upgradeCard('hauler', 1, { bulk: true })}</div>
    <h3>Expand the mine</h3><div class="row"><div><div class="t">Open shaft ${String(state.production.shafts.length + 1).padStart(2, '0')}</div><div class="d">${state.production.shafts.length} / 30 open · includes 10 miners</div></div>${buyBtn('data-act="shaft"', '＋ Shaft', shaftCost())}</div>
    <div class="note">Single-player sandbox · local save. These three upgrade lines use a simplified economy, separate from the online game.</div>`;
  const hirePrice = hireCost(state.workersHired);
  const hireDisabled = state.workersHired >= crewCap() || state.coins < hirePrice;
  return `<h2>Reinvest</h2><p class="lede">Dig deeper. Keep the lift moving. Every upgrade is a local test curve, and each one changes how the mine looks.</p>
    <h3>Mine</h3><div class="rows">
      <div class="row"><div><div class="t">Open a new shaft</div><div class="d">${state.production.shafts.length} / 30 open · a new tunnel off the main shaft</div></div>${buyBtn('data-act="shaft"', '＋ Shaft', shaftCost())}</div>
      <div class="row"><div><div class="t">Hire a miner</div><div class="d">${state.workersHired} / ${crewCap()} crew</div><div class="meter" style="margin-top:6px"><i style="width:${fillFraction(state.workersHired, crewCap())}%"></i></div></div><button class="buy ok" data-act="hire" type="button"${hireDisabled ? ' disabled' : ''}>＋ Miner<br>${state.workersHired >= crewCap() ? 'NEEDS BUNKS' : `${fmt(hirePrice)} ◉`}</button></div>
    </div>
    <h3>The lift and the pick</h3><div class="rows">${upgradeCard('lift', 1, { bulk: true })}${upgradeCard('dig', 1, { bulk: true })}</div>
    <h3>Surface</h3><div class="rows">${upgradeCard('yard', 1, { bulk: true })}${upgradeCard('habitat')}</div>
    <h3>The hauler</h3><div class="rows">${upgradeCard('shipSpeed', 1, { bulk: true })}${upgradeCard('shipCapacity')}${upgradeCard('loading')}</div>`;
}

function veinRows(n) {
  const veins = state.veins.filter((v) => v.shaftNumber === n);
  const common = ORES.find((o) => o.id === state.site.commonOreId);
  const head = `<div class="d">Common ore here: <b style="color:${common.color}">${safeText(common.name)}</b> · endless</div>`;
  if (!veins.length) return `${head}<div class="d">No rare vein found in this shaft.</div>`;
  return head + veins.map((v) => {
    const o = ORES.find((q) => q.id === v.oreId); const st = veinStatus(state, v); const pct = Math.round(v.remainingUnits / v.sizeUnits * 100);
    const note = { ahead: 'Hidden in the rock ahead. Keep digging to reach it.', blocked: `⛏ Pick too weak. Needs hardness ${HARDNESS[v.oreId]} (${pickNeeded(HARDNESS[v.oreId])}).`, mining: 'The crew is mining it now.', empty: 'Dry. The shaft is back on the common ore.' }[st];
    return `<div class="vein ${st}"><div class="shead"><span class="swatch2" style="--ore:${o.color}"></span><b>${safeText(o.name)}</b><span class="pill ${oreRank(v.oreId) === 'Mythic' ? 'sp' : 'warn'}">${oreRank(v.oreId)}</span><span class="d" style="margin-left:auto">hardness ${HARDNESS[v.oreId]}</span></div><div class="meter ${pct < 20 ? 'warn' : ''}"><i style="width:${pct}%;background:${o.color}"></i></div><div class="d">${fmtUnits(v.remainingUnits)} / ${fmtUnits(v.sizeUnits)} units left · ${safeText(note)}</div></div>`;
  }).join('');
}

function tabShafts() {
  const rates = currentRates(state);
  const cards = state.production.shafts.map((shaft) => {
    const rate = rates.find((r) => r.shaftNumber === shaft.shaftNumber);
    const pct = fillFraction(shaft.bufferUnits, shaft.bufferCapacityUnits);
    const n = shaft.shaftNumber;
    return `<div class="shaft"><div class="shead"><b>SHAFT ${String(n).padStart(2, '0')}</b><span class="swatch2" style="--ore:${rate.ore.color}"></span><span>${safeText(rate.ore.name)}</span><span class="own" style="font-family:var(--f-mono);font-size:19px;color:var(--coin);margin-left:auto">${fmtUnits(rate.ratePerMinute)}/min</span></div>
      <div class="d">${shaft.workersAssigned} / ${10 + shaft.bunkhouseLevel * 5} crew · buffer ${fmtUnits(shaft.bufferUnits)} / ${fmtUnits(shaft.bufferCapacityUnits)}</div>
      <div class="meter ${pct >= 90 ? 'warn' : ''}"><i style="width:${pct}%"></i></div>
      ${veinRows(n)}
      <div class="rows">${!isNewEconomy() ? upgradeCard('dig', n) + upgradeCard('bunkhouse', n) + upgradeCard('cart', n) : '<div class="d">10 miners · uses your global Pick and Lift levels</div>'}</div></div>`;
  }).join('');
  return `<h2>Your shafts</h2><p class="lede">Each shaft digs its own ore. Follow your crews as the tunnels grow.</p><div class="rows">${cards}</div>`;
}

function tabPlanetRemote() {
  const th = planet.theme || { concept: '', motifs: [] };
  const rows = planet.regions.map((r) => `<div class="row ${r.id === regionId ? 'sel' : ''}"><div><div class="t"><span class="swatch2" style="--ore:${r.biome}"></span>${safeText(r.name)}</div><div class="d">${safeText(TERRAINS[r.terrain].label)} · ${safeText(r.blurb)}</div></div><span class="pill ${r.id === regionId ? 'ok' : ''}">${r.id === regionId ? 'Your mine' : 'Other guilds'}</span></div>`).join('');
  return `<h2>${safeText(planet.name)}</h2><p class="lede">${safeText(planet.tagline)}</p><div class="note"><b>THEME</b> · ${safeText(th.concept)}</div><p class="story">${safeText(planet.story)}</p>
    <h3>Regions</h3><div class="rows">${rows}</div><div class="note">Online, everyone shares one planet each month and starts at an equal site. The planet resets when the month ends.</div>`;
}

function tabPlanet() {
  if (state.remote) return tabPlanetRemote();
  const rows = planet.regions.map((r) => {
    const T = TERRAINS[r.terrain]; const sel = r.id === regionId;
    return `<div class="row ${sel ? 'sel' : ''}"><div><div class="t"><span class="swatch2" style="--ore:${r.biome}"></span>${safeText(r.name)}</div><div class="d">${safeText(T.label)}${T.group === 'alien' ? ' · alien' : ''} · ${safeText(r.blurb)}</div></div><button class="buy ${sel ? 'ok' : 'ghost'} sm" data-act="${sel ? 'noop' : 'relocate-ask'}" data-rid="${r.id}" type="button">${sel ? 'Your mine' : 'Mine here'}</button></div>`;
  }).join('');
  const ores = planet.ores.map((o, i) => { const id = ORES[i].id; const here = id === state.site.commonOreId || state.site.rareOreIds.includes(id) || (id === 'mythic' && state.site.mythic); const rank = oreRank(id); return `<div class="row${here ? '' : ' dim'}"><div><div class="t"><span class="swatch2" style="--ore:${o.color}"></span>${safeText(o.name)} <span class="pill ${rank === 'Common' ? 'ok' : rank === 'Rare' ? 'warn' : 'sp'}">${rank}</span></div><div class="d">Hardness ${HARDNESS[id]} · ${id === state.site.commonOreId ? 'the common ore of your site, endless' : here ? 'a vein may hide in your shafts' : rank === 'Common' ? 'the other common ore, found in other regions' : 'none at this site'}</div></div></div>`; }).join('');
  const confirm = pendingRelocate ? (() => { const r = planet.regions.find((q) => q.id === pendingRelocate); return `<div class="note"><b>Start a new mine in ${safeText(r.name)}?</b><br>A site's ore and veins belong to that site, so this replaces your current local mine. The legacy prototype is untouched.<div class="btnrow"><button class="buy danger sm" data-act="relocate-yes" type="button">Yes, start fresh</button><button class="buy ghost sm" data-act="relocate-no" type="button">Cancel</button></div></div>`; })() : '';
  const th = planet.theme || { concept: '', motifs: [] };
  const ready = aiReady();
  const past = loadHistory().slice(-5).reverse().map((e) => `<div class="d">${safeText(e.name)} · ${safeText(e.concept)}</div>`).join('');
  return `<h2>${safeText(planet.name)}</h2><p class="lede">${safeText(planet.tagline)}</p>
    <div class="note"><b>THEME</b> · ${safeText(th.concept)}${th.mood ? ` <i>(${safeText(th.mood)})</i>` : ''}${th.motifs && th.motifs.length ? `<br>${th.motifs.map((m) => `<span class="pill sp">${safeText(m)}</span>`).join(' ')}` : ''}</div>
    <p class="story">${safeText(planet.story)}</p>
    ${confirm}
    <h3>Ores · common, rare and mythic</h3><div class="rows">${ores}</div>
    <h3>Regions · each site has its own common ore and veins</h3><div class="rows">${rows}</div>
    <div class="note">Common ore is endless. Rare ores hide in finite veins you have to dig to and break. Vein sizes are provisional.</div>
    <h3>New planet</h3>
    <label class="f">What should the Maker build? (optional)<textarea id="planetPrompt" maxlength="400" placeholder="A cold, pink planet of floating ice and screaming moons">${safeText(planetPromptValue)}</textarea></label>
    ${pendingPlanet ? '<div class="note"><b>A new planet means a new mine.</b> Your current local mine is replaced.<div class="btnrow"><button class="buy danger sm" data-act="newplanet-go" type="button">Build the planet</button><button class="buy ghost sm" data-act="newplanet-no" type="button">Cancel</button></div></div>' : `<div class="btnrow"><button class="buy alt" data-act="newplanet-ask" type="button"${planetBusy ? ' disabled' : ''}>${planetBusy ? 'The Maker is thinking…' : ready ? 'Ask the Maker (AI)' : 'Ask the Maker'}</button></div>`}
    <p class="lede">${ready ? 'The Maker invents a theme, builds the whole planet from it, and reads the planets before it so this one is new.' : 'No AI key yet, so the Maker will improvise from a theme. Add your own Claude or OpenAI key under Tools for full AI planets.'}</p>
    ${past ? `<h3>Planets so far</h3><div class="rows">${past}</div>` : ''}`;
}
let planetPromptValue = '';
let pendingRelocate = null;
let pendingPlanet = false;

function tabRecords() {
  const ledger = state.ledger.slice().reverse().slice(0, 10).map((e) => `<div class="row"><div><div class="t">${safeText(e.description)}</div><div class="d">${formatClock(e.atSecond)} · ${safeText(e.type.replaceAll('_', ' '))}</div></div><div class="e" style="color:${e.ownerDelta > 0 ? 'var(--ok)' : 'var(--bad)'}">${e.ownerDelta > 0 ? '+' : '−'}${fmt(e.amount)} ◉</div></div>`).join('') || '<p class="lede">No records yet.</p>';
  const cargo = state.shipments.slice().reverse().slice(0, 8).map((s) => `<div class="row"><div><div class="t">${fmtUnits(s.units)} ${safeText(oreById(s.oreId).name)} → ${safeText(destinationById(s.destinationId).name)}</div><div class="d">${state.shipmentStatusById[s.id] === 'DELIVERED' ? 'Delivered' : `ETA ${formatClock(Math.max(0, s.arrivalAtSecond - state.simSeconds))}`} · paid at departure</div></div><div class="e">${fmt(s.payment)} ◉</div></div>`).join('') || '<p class="lede">The launch pad is waiting for its first cargo.</p>';
  const events = state.log.slice().reverse().slice(0, 10).map((e) => `<div>${formatClock(e.atSecond)} · ${safeText(e.message)}</div>`).join('') || '<p class="lede">No events yet.</p>';
  const archive = isNewEconomy() ? state.historyArchive : null;
  const archivedLedger = archive?.ledger;
  const archivedCargo = archive?.shipments;
  const olderLedger = archivedLedger?.count ? `<div class="note"><b>Older ledger · ${fmt(archivedLedger.count)} entries summarized</b><br>Buyer payments: ${fmt(archivedLedger.amountsByType.NPC_RAW_PURCHASE || 0)} ◉<br>Developer grants: ${fmt(archivedLedger.amountsByType.DEV_TEST_GRANT || 0)} ◉<br>Upgrade and shaft spending: ${fmt(archivedLedger.amountsByType.SYSTEM_PURCHASE || 0)} ◉<br>Net coin change: ${archivedLedger.ownerDelta >= 0 ? '+' : '−'}${fmt(Math.abs(archivedLedger.ownerDelta))} ◉</div>` : '';
  const olderCargo = archivedCargo?.count ? `<div class="note"><b>Older delivered cargo · ${fmt(archivedCargo.count)} shipments summarized</b><br>${fmt(archivedCargo.payment)} ◉ paid at departure<br>${archivedCargo.unitsByOre.map((r) => `${fmtUnits(r.units)} ${safeText(oreById(r.oreId).name)} units`).join(' · ')}</div>` : '';
  const recent = isNewEconomy();
  return `<h2>Paper trail</h2>${recent ? '<p class="lede">Recent entries are listed below. Older completed records are kept as totals; cargo in transit stays in the detailed history.</p>' : ''}<h3>Ledger · ${state.ledger.length} ${recent ? 'recent' : ''} entries</h3>${olderLedger}<div class="rows">${ledger}</div><h3>${recent ? 'Recent cargo' : 'Cargo'}</h3>${olderCargo}<div class="rows">${cargo}</div><h3>Events</h3><div class="feed">${events}</div>`;
}

function tabIndustry() {
  return renderIndustry(state, { fmt, ores: ORES });
}

function tabColony() {
  const f = state.frontier;
  if (!f) return '<h2>Colony operations</h2><p>Available in the new local sandbox.</p>';
  const maker = state.maker;
  const names = maker?.content?.facilities ?? [];
  const buyers = maker?.content?.buyers ?? [];
  const news = maker?.content?.news ?? [];
  return `<h2>Colony operations</h2><div class="note">Local sandbox: a playable preview of industry, safety and colony storytelling.</div>
    <h3>Home safety</h3><div class="devbox"><b>${safeText(f.status)}</b><p class="d">${f.infantry.troops} infantry on patrol${f.infantry.incoming ? ` · ${f.infantry.incoming.troops} arrive in ${f.infantry.incoming.arrivesAt - f.simSeconds}s` : ''}. Home always remains operational. Paid cargo is protected.</p>
    <button class="buy sm" data-frontier="recruit" type="button"${f.infantry.purchased || state.coins < FRONTIER_TUNE.infantryCost ? ' disabled' : ''}>${f.infantry.purchased ? 'Patrol ordered' : `Recruit ${FRONTIER_TUNE.infantryTroops} infantry · ${FRONTIER_TUNE.infantryCost} ◉`}</button></div>
    <h3>The Maker's dispatch desk</h3><p class="lede">Give your works and visiting buyers a personality. Dispatches use events that really happened.</p>
    <button class="buy" type="button" data-act="maker-create"${makerBusy ? ' disabled' : ''}>${makerBusy ? 'Writing the colony dispatch…' : aiReady() ? 'Ask the Maker · use my API key' : 'Build colony stories · no key needed'}</button>
    <p class="d">${safeText(maker?.status || 'Built-in chronicler ready. Configure Claude or OpenAI in Tools for AI-generated names and prose.')}</p>
    ${names.map(row => `<div class="row"><div class="t">${safeText(row.name)}</div></div>`).join('')}
    ${buyers.map(row => `<div class="devbox"><b>${safeText(row.name)}</b><p class="d">${safeText(row.personality)}</p></div>`).join('')}
    <h3>Colony dispatches</h3>${news.map(row => `<div class="devbox"><b>${safeText(row.headline)}</b><p>${safeText(row.text)}</p></div>`).join('') || '<p class="d">Mine, build and trade, then ask for a fresh dispatch.</p>'}
    <h3>Safety log</h3><div class="feed">${f.news.slice(-5).reverse().map(event => `<div>${formatClock(event.simSeconds)} · ${safeText(event.description)}</div>`).join('') || 'Home crews are on shift.'}</div>`;
}

async function refreshMaker() {
  if (makerBusy || state.remote || !isNewEconomy()) return;
  makerBusy = true; render();
  const seed = state.site.seed;
  const brief = createMakerBrief({ planet,
    facilities: ['refinery', 'station'].filter(id => state.industry?.[id]).map(id => ({ id, kind: id, name: id })),
    buyers: destinationsFor(state).map(row => ({ id: row.id, name: row.name })),
    events: state.log.slice(-5).map((event, index) => ({ id: `${seed}:${event.atSecond}:${index}`, text: event.message })),
  });
  try {
    const result = await generateMakerContent(brief, { userInitiated: true });
    if (!state.remote && state.site.seed === seed) { state = { ...state, maker: result }; save(); toast(result.how === 'ai' ? 'The Maker filed a colony dispatch.' : 'The built-in chronicler filed a colony dispatch.', 'success'); }
  } finally { makerBusy = false; render(); }
}

function tabAccount() {
  return `<h2>Account</h2><p class="lede">Signed in as <b>${safeText(state.online.email || 'guest')}</b>. Your mine runs on the server, so it keeps working while you are away.</p>
    <div class="devbox"><b>Motion</b><div class="btnrow"><button class="buy ghost sm" data-act="motion" type="button">${reducedMotion ? 'Reduced motion: on' : 'Reduced motion: off'}</button></div></div><div class="devbox"><b>Sound</b><p class="d">Little chimes when you buy upgrades.</p><div class="btnrow"><button class="buy ghost sm" data-act="sound" type="button">${soundOn ? 'Sound: on' : 'Sound: off'}</button></div></div>
    <div class="devbox"><b>Refresh from the server</b><p class="d">The browser animates and predicts locally. Server reconciliation runs about every 30 seconds, and immediately after commands or returning to the game.</p><div class="btnrow"><button class="buy ghost sm" data-act="resync" type="button">Refresh now</button></div></div>
    <div class="devbox"><b>Sign out</b><div class="btnrow"><button class="buy ghost sm" data-act="signout" type="button">Sign out</button></div></div>
    <div class="note">Online play counts toward this month's competition. Coin, ore and ships are decided by the server; this page only shows them.</div>`;
}

function tabTools() {
  if (state.remote) return tabAccount();
  const ai = aiSettings();
  return `<h2>Dev tools</h2><p class="lede">Local sandbox only. No server, no month competition.</p>
    <div class="devbox"><b>Fast-forward</b><p class="d">Runs the same one-second tick.</p><div class="btnrow"><button class="buy ghost sm" data-forward="60" type="button">1 min</button><button class="buy ghost sm" data-forward="600" type="button">10 min</button><button class="buy ghost sm" data-forward="3600" type="button">1 hour</button></div></div>
    <div class="devbox"><b>Test grant</b><p class="d">Creates an explicit local source entry.</p><div class="btnrow"><input id="grant-amount" type="number" min="1" step="1" value="${safeText(grantValue)}" aria-label="Test grant amount"><button class="buy sm" data-act="grant" type="button">Add test coins</button></div></div>
    <div class="devbox"><b>AI engine · bring your own key</b><p class="d">Designs planets, names your facilities and writes dispatches from recorded facts. Calls happen only when you ask. Your key stays in this browser and goes straight to the provider.</p>
      <label class="f">Engine<select id="aiProvider"><option value="off"${ai.provider === 'off' ? ' selected' : ''}>Off</option><option value="anthropic"${ai.provider === 'anthropic' ? ' selected' : ''}>My Claude API key</option><option value="openai"${ai.provider === 'openai' ? ' selected' : ''}>My OpenAI API key</option></select></label>
      <label class="f">API key<input type="password" id="aiKey" autocomplete="off" value="${safeText(ai.key || '')}" placeholder="paste key"></label>
      <div class="btnrow"><button class="buy sm" data-act="ai-save" type="button">Save</button><button class="buy ghost sm" data-act="ai-test" type="button">Test connection</button></div></div>
    <div class="devbox"><b>Motion</b><div class="btnrow"><button class="buy ghost sm" data-act="motion" type="button">${reducedMotion ? 'Reduced motion: on' : 'Reduced motion: off'}</button></div></div><div class="devbox"><b>Sound</b><p class="d">Little chimes when you buy upgrades.</p><div class="btnrow"><button class="buy ghost sm" data-act="sound" type="button">${soundOn ? 'Sound: on' : 'Sound: off'}</button></div></div>
    ${!isNewEconomy() ? `<div class="devbox"><b>Try the new economy</b><p class="d">Start with 10 miners and three global upgrades: Pick, Lift, Hauler. Your current save is backed up in this browser before starting fresh.</p><div class="btnrow">${newEconomyPrompt ? '<button class="buy sm" data-act="economy-new" type="button">Back up & start fresh</button><button class="buy ghost sm" data-act="economy-cancel" type="button">Keep this mine</button>' : '<button class="buy sm" data-act="economy-ask" type="button">Try new economy…</button>'}</div></div>` : ''}
    <div class="devbox"><b>Recovery copy</b><p class="d">An unreadable save is kept exactly as found. Download its original text for recovery.</p><div class="btnrow"><button class="buy ghost sm" data-act="export-corrupt" type="button">Download recovery text</button></div></div><div class="devbox"><b>Save a copy</b><p class="d">Download this local mine, or download the backup made before trying the new economy.</p><div class="btnrow"><button class="buy ghost sm" data-act="export-save" type="button">Download save</button><button class="buy ghost sm" data-act="export-backup" type="button">Download backup</button></div></div><div class="devbox"><b>Reset sandbox</b><p class="d">Starts a new local save. The legacy prototype is untouched.</p>${resetPromptOpen ? '<div class="btnrow"><button class="buy danger sm" data-act="confirm-reset" type="button">Reset mine</button><button class="buy ghost sm" data-act="cancel-reset" type="button">Keep playing</button></div>' : '<div class="btnrow"><button class="buy ghost sm" data-act="reset" type="button">Reset local save…</button></div>'}</div>
    <div class="note">Rates, offers, costs and buyer budgets are local test fixtures, not certified balance.</div>`;
}

function render() {
  renderHud();
  renderTabs();
  const body = $('#tabbody');
  const top = body.scrollTop;
  const active = document.activeElement;
  if (active && active.closest && active.closest('#tabbody') && active.matches('input[type=text],input[type=password],input[type=number],textarea,select')) { renderPending = true; return; }
  body.innerHTML = { sell: tabSell, upgrades: tabUpgrades, shafts: tabShafts, planet: tabPlanet, industry: tabIndustry, colony: tabColony, records: tabRecords, tools: tabTools }[tab]();
  body.scrollTop = top;
  syncTip();
  drawScene();
}
let renderPending = false;

function freshMine() {
  state = createGameState(siteOpts()); paused = false; catchupRemaining = 0; catchingUp = false; catchupKind = 'offline'; resetPromptOpen = false; recovering = '';
  veinSeen.clear(); effectCache.clear(); save();
}
let view = 'side';
const camSide = { auto: true, x: 490, y: 0, z: 1 };
const camMap = { auto: true, x: 500, y: 500, z: 1 };
let mapSel = null;
function drawScene() {
  if (!state) return;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(300, canvas.clientWidth); const H = Math.max(200, canvas.clientHeight || 400);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const t = reducedMotion || paused ? 0 : performance.now() / 1000;
  if (view === 'map') renderMap(canvas, ctx, { planet, regionId, t, cam: camMap, selected: mapSel });
  else renderScene(canvas, ctx, { state, planet, region: region(), t, frac: paused || reducedMotion ? 0 : Math.min(1, (performance.now() - lastTickMs) / 1000), oreIndex, cam: camSide });
  if (t - miniT > 0.5) { miniT = t; drawMini(); }
}
let miniT = 0;
function drawMini() {
  const mc = $('#mini'); if (!mc) return;
  const dpr = window.devicePixelRatio || 1; const W = Math.round(96 * dpr); const H = Math.round(76 * dpr);
  if (mc.width !== W) { mc.width = W; mc.height = H; }
  const g = mc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
  if (view === 'side') {
    g.drawImage(mapTerrain(planet), 0, 0, W, H);
    const r = region(); const X = Math.round(r.x / 1000 * W); const Y = Math.round(r.y / 1000 * H);
    g.fillStyle = '#ff8a3d'; g.fillRect(X - 3 * dpr, Y - 3 * dpr, 6 * dpr, 6 * dpr); g.fillStyle = '#fff'; g.fillRect(X - dpr, Y - dpr, 2 * dpr, 2 * dpr);
  } else {
    const q = Math.max(2, Math.round(3 * dpr)); g.fillStyle = planet.sky[0]; g.fillRect(0, 0, W, H * 0.45); g.fillStyle = planet.layers[0].color; g.fillRect(0, Math.round(H * 0.45), W, H);
    g.fillStyle = '#1d1228'; g.fillRect(Math.round(W / 2 - q), Math.round(H * 0.45), q * 2, Math.round(H * 0.5)); g.fillRect(Math.round(W * 0.2), Math.round(H * 0.65), Math.round(W * 0.6), q * 2); g.fillStyle = '#ffb347'; g.fillRect(Math.round(W / 2 - q * 1.5), Math.round(H * 0.6), q * 3, q * 2);
  }
  $('#mapBtnLbl').textContent = view === 'side' ? 'MAP' : 'MINE';
}

function mapCardHTML(r) {
  const T = TERRAINS[r.terrain]; const here = r.id === regionId;
  return `<button class="buy sm ghost close" data-act="mapclose" type="button">✕</button><h4>${safeText(r.name)}</h4><p class="lede">${safeText(T.label)}${T.group === 'alien' ? ' · alien' : ''}<br>${safeText(r.blurb)}</p>
    <div class="chips">${planet.ores.slice(0, 7).map((o) => `<span class="chip"><i style="background:${o.color}"></i>${safeText(o.name)}</span>`).join('')}</div>
    ${pendingRelocate === r.id ? '<div class="note"><b>Start a new mine here?</b> Your current local mine is replaced.</div><div class="btnrow"><button class="buy danger sm" data-act="relocate-yes" type="button">Yes, start fresh</button><button class="buy ghost sm" data-act="relocate-no" type="button">Cancel</button></div>' : `<div class="btnrow">${here ? '<button class="buy ok" data-act="mapback" type="button">Back to your mine</button>' : `<button class="buy" data-act="relocate-ask" data-rid="${r.id}" type="button">Open a mine here</button>`}</div>`}`;
}
function showMapCard() { const c = $('#mapcard'); c.hidden = view !== 'map' || !mapSel; if (!c.hidden) c.innerHTML = mapCardHTML(mapSel); }

async function catchUpBatch() {
  if (catchupInFlight) return;
  if (catchupRemaining <= 0) {
    catchingUp = false; save(); render();
    toast(catchupKind === 'fast-forward' ? 'Fast-forward complete.' : 'Offline sandbox catch-up complete.', 'success');
    catchupKind = 'offline';
    return;
  }
  try {
    catchupInFlight = true;
    const batch = await localRuntime.advance(state, catchupRemaining, 300);
    state = batch.state; catchupRemaining = batch.remainingSeconds;
    save(); render(); setTimeout(catchUpBatch, 0);
  } catch {
    catchingUp = false;
    recovering = `${catchupKind === 'fast-forward' ? 'Fast-forward' : 'Offline catch-up'} stopped on invalid local state. The latest valid checkpoint is still saved.`;
    save(); render();
  } finally { catchupInFlight = false; }
}

function startForward(seconds) {
  catchupRemaining += seconds; catchupKind = 'fast-forward'; catchingUp = true;
  save(); render(); setTimeout(catchUpBatch, 0);
}

if (REMOTE) {
  online = await import('./online.js');
  const boot = await online.startOnline();
  state = boot.state; planet = boot.planet; regionId = boot.regionId; skinOres();
  nextPollAt = Date.now() + POLL_MS_LOCAL;
} else state = loadSave();
renderTabs();
render();
if (recovering) toast(recovering, 'error');
if (catchupRemaining > 0) { catchingUp = true; render(); setTimeout(catchUpBatch, 0); }

window.setInterval(() => { if (REMOTE && Date.now() >= nextPollAt && pendingRemote === 0 && !document.hidden) { nextPollAt = Date.now() + POLL_MS_LOCAL; syncRemote(); } }, 1000);

window.setInterval(() => {
  if (catchingUp) return;
  if (paused) { save(); return; }
  lastTickMs = performance.now();
  try { state = stepGame(state); }
  catch { paused = true; recovering = 'The local simulation paused after invalid state was detected.'; render(); return; }
  save(); render();
}, 1000);

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'modeBtn') { try { localStorage.setItem('extraction_mode', REMOTE ? 'offline' : 'online'); } catch { /* ignore */ } const u = new URL(location.href); u.searchParams.delete('mode'); location.href = u.toString(); return; }
  if (button.id === 'pauseBtn') { paused = !paused; save(); render(); return; }
  if (catchingUp) return;
  if (button.dataset.tab) { tab = button.dataset.tab; render(); return; }
  if (button.dataset.forward) { startForward(Number(button.dataset.forward)); return; }
  if (button.dataset.industry) { const action = actionFromIndustryButton(button, state); if (action) apply(current => industryCommand(current, action), 'Industry order completed.'); return; }
  if (button.dataset.frontier) { apply(current => frontierCommand(current, 'recruit-infantry'), 'Supply shuttle dispatched.'); return; }
  if (button.dataset.destination) { apply((current) => selectDestination(current, button.dataset.destination)); return; }
  if (button.dataset.buy) { const raw = button.dataset.count || '1'; buyUpgrade(button.dataset.buy, Number(button.dataset.shaft || 1), raw === 'max' ? 'max' : Number(raw)); return; }
  if (button.dataset.zoom) { const cm = view === 'map' ? camMap : camSide; if (button.dataset.zoom === 'fit') { cm.auto = true; cm.z = 1; } else { cm.auto = false; cm.z *= button.dataset.zoom === 'in' ? 1.4 : 1 / 1.4; } return; }
  if (button.id === 'mapBtn') { view = view === 'map' ? 'side' : 'map'; showMapCard(); return; }
  switch (button.dataset.act) {
    case 'maker-create': void refreshMaker(); break;
    case 'motion': reducedMotion = !reducedMotion; document.documentElement.classList.toggle('reduce-motion', reducedMotion); try { localStorage.setItem('extraction_motion', reducedMotion ? 'reduced' : 'full'); } catch {} render(); break;
    case 'guide-dismiss': guideDismissed = true; try { localStorage.setItem('extraction_guide_done', 'yes'); } catch {} renderGuide(); break;
    case 'sound': soundOn = !soundOn; try { localStorage.setItem('extraction_sound', soundOn ? 'on' : 'off'); } catch { /* ignore */ } if (soundOn) blip([660, 880]); render(); break;
    case 'mapclose': mapSel = null; showMapCard(); break;
    case 'mapback': view = 'side'; mapSel = null; showMapCard(); break;
    case 'newplanet-ask': if (state.simSeconds > 120) { pendingPlanet = true; render(); break; } /* fall through: nothing to lose yet */
    case 'newplanet-go': {
      pendingPlanet = false;
      const prompt = ($('#planetPrompt') && $('#planetPrompt').value) || planetPromptValue; planetPromptValue = prompt; planetBusy = true; render();
      generatePlanet(prompt).then(({ planet: p, how, error }) => {
        planet = p; regionId = p.regions[0].id; skinOres(); savePlanet(planet, regionId); freshMine();
        toast(how === 'ai' ? `The Maker delivered ${planet.name}. A new mine is open.` : `The Maker improvised ${planet.name}${error ? ` (${error})` : ''}. A new mine is open.`, 'success');
      }).finally(() => { planetBusy = false; render(); });
      break;
    }
    case 'newplanet-no': pendingPlanet = false; render(); break;
    case 'relocate-ask': pendingRelocate = button.dataset.rid; if (view === 'map') showMapCard(); else render(); break;
    case 'relocate-no': pendingRelocate = null; if (view === 'map') showMapCard(); else render(); break;
    case 'relocate-yes': {
      regionId = pendingRelocate; pendingRelocate = null; savePlanet(planet, regionId); freshMine(); view = 'side'; camSide.auto = true; mapSel = null; showMapCard(); render();
      toast(`A new mine is open in ${region().name}. Common ore: ${ORES.find((o) => o.id === state.site.commonOreId).name}.`, 'success'); break;
    }
    case 'noop': break;
    case 'resync': syncRemote(); break;
    case 'signout': online.logout().then(() => location.reload()); break;
    case 'ai-save': { const key = $('#aiKey').value.trim(); saveAiSettings({ provider: $('#aiProvider').value, key, model: aiSettings().model }); toast('AI settings saved in this browser.', 'success'); render(); break; }
    case 'ai-test': {
      saveAiSettings({ provider: $('#aiProvider').value, key: $('#aiKey').value.trim(), model: aiSettings().model });
      askJSON('Reply with only this JSON: {"ok":true}').then((r) => toast(r && r.ok ? 'Connection works.' : 'Connected, but the reply was odd.', r && r.ok ? 'success' : 'error')).catch((e) => toast(e.message, 'error'));
      break;
    }
    case 'launch': apply(dispatchNow, 'Hauler launched — paid at takeoff.'); break;
    case 'shaft': if (apply(buyNextShaft, 'Shaft opened. A new tunnel is being dug.')) { addFx(...FX_SPOTS.shaft.slice(0, 2), 'NEW SHAFT', '#5ee6a8'); blip([392, 523, 659]); } else blip([140]); break;
    case 'hire': if (apply((current) => hireWorkers(current, 1), 'Miner hired and assigned.')) { addFx(80, -30, '+1 MINER', '#5ee6a8'); blip([587, 784]); } else blip([140]); break;
    case 'grant': {
      const amount = Number($('#grant-amount').value);
      if (!Number.isSafeInteger(amount) || amount < 1) { toast('Enter a positive whole coin amount.', 'error'); break; }
      grantValue = String(amount);
      apply((current) => grantDevCoins(current, amount), 'Local test grant recorded.');
      break;
    }
    case 'export-corrupt': {
      try {
        const raw = corruptRaw ?? JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null')?.raw;
        if (typeof raw !== 'string') { toast('No unreadable save is stored.'); break; }
        const url = URL.createObjectURL(new Blob([raw], { type: 'text/plain' }));
        const a = document.createElement('a'); a.href = url; a.download = 'extraction-unreadable-save.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch { toast('The recovery text could not be downloaded.', 'error'); }
      break;
    }
    case 'export-save':
    case 'export-backup': {
      try {
        save(); const backup = button.dataset.act === 'export-backup';
        const raw = localStorage.getItem(backup ? 'extraction_sandbox_backup' : SAVE_KEY);
        if (!raw) { toast('No backup is saved yet.'); break; }
        const data = backup ? JSON.stringify(JSON.parse(raw).save, null, 2) : raw;
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = backup ? 'extraction-mine-backup.json' : 'extraction-mine.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch { toast('The save could not be downloaded.', 'error'); }
      break;
    }
    case 'economy-ask': newEconomyPrompt = true; render(); break;
    case 'economy-cancel': newEconomyPrompt = false; render(); break;
    case 'economy-new': {
      try { save(); const old = localStorage.getItem(SAVE_KEY); if (!old) throw new Error('Save unavailable'); localStorage.setItem('extraction_sandbox_backup', JSON.stringify({ backedUpAtMs: Date.now(), save: JSON.parse(old) })); }
      catch { toast('Backup could not be saved. Your current mine is still open.', 'error'); break; }
      newEconomyPrompt = false; freshMine(); render(); toast('Original mine backed up. New economy ready.', 'success'); break;
    }
    case 'reset': resetPromptOpen = true; render(); break;
    case 'cancel-reset': resetPromptOpen = false; render(); break;
    case 'confirm-reset':
      saveBlocked = false;
      state = createGameState(siteOpts()); paused = false; catchupRemaining = 0; catchingUp = false; catchupKind = 'offline'; resetPromptOpen = false; recovering = '';
      save(); render(); toast('Fresh local mine opened.', 'success'); break;
    default:
  }
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-act="auto"]')) apply((current) => setAutoLaunch(current, event.target.checked));
});
document.addEventListener('input', (event) => { if (event.target.id === 'grant-amount') grantValue = event.target.value; if (event.target.id === 'planetPrompt') planetPromptValue = event.target.value; });
document.addEventListener('focusout', (event) => { if (renderPending) { renderPending = false; render(); } });
document.addEventListener('visibilitychange', () => {
  if (REMOTE) { if (document.visibilityState === 'visible') syncRemote(true); return; }
  if (document.visibilityState === 'visible' && !paused) {
    const elapsed = Math.floor((Date.now() - savedAtMs) / 1000);
    if (elapsed > 1 && Number.isSafeInteger(elapsed)) {
      catchupRemaining += elapsed;
      if (!catchingUp) { catchupKind = 'offline'; catchingUp = true; render(); setTimeout(catchUpBatch, 0); }
    }
  }
});

window.addEventListener('focus', () => { if (REMOTE && !document.hidden) syncRemote(true); });

function animate() { drawScene(); requestAnimationFrame(animate); }
requestAnimationFrame(animate);
window.addEventListener('resize', drawScene);

/* ---- zoom, pan and picking, like the original ---- */
const PTR = new Map(); let drag = null; let pinch = null;
const cur = () => (view === 'map' ? camMap : camSide);
const scaleOf = (z) => (view === 'map' ? mapScale(z) : sideScale(z));
const viewOf = () => (view === 'map' ? MAPVIEW : VIEW);
function toWorld(px, py) { const dpr = window.devicePixelRatio || 1; const v = viewOf(); const ps = v.ps; return { x: (px * dpr / ps - v.ox) / v.s, y: (py * dpr / ps - v.oy) / v.s }; }
function clampAny() { if (view === 'map') clampMapCam(camMap); else clampCam(camSide, state); }
function zoomAt(px, py, factor) {
  const cm = cur(); const before = toWorld(px, py); const dpr = window.devicePixelRatio || 1; const v = viewOf();
  cm.auto = false; cm.z *= factor; clampAny();
  const s2 = scaleOf(cm.z);
  cm.x = before.x - ((px * dpr / v.ps) - v.bw / 2) / s2; cm.y = before.y - ((py * dpr / v.ps) - v.bh / 2) / s2; clampAny();
}
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); PTR.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (PTR.size === 1) drag = { x: e.offsetX, y: e.offsetY, moved: 0 };
  else if (PTR.size === 2) { const [a, b] = [...PTR.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cur().z }; drag = null; }
});
canvas.addEventListener('pointermove', (e) => {
  if (!PTR.has(e.pointerId)) return; PTR.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinch && PTR.size === 2) { const [a, b] = [...PTR.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const cm = cur(); cm.auto = false; cm.z = pinch.z * d / pinch.d; clampAny(); return; }
  if (!drag) return;
  const dx = e.offsetX - drag.x; const dy = e.offsetY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.offsetX; drag.y = e.offsetY;
  if (drag.moved > 6) { const cm = cur(); cm.auto = false; canvas.classList.add('drag'); const dpr = window.devicePixelRatio || 1; const v = viewOf(); cm.x -= dx * dpr / (v.ps * v.s); cm.y -= dy * dpr / (v.ps * v.s); clampAny(); }
});
function endPtr(e) {
  PTR.delete(e.pointerId); canvas.classList.remove('drag'); if (PTR.size < 2) pinch = null;
  if (drag && drag.moved <= 6 && e.type === 'pointerup' && view === 'map') {
    const w = toWorld(e.offsetX, e.offsetY); mapSel = regionAtMap(planet, w.x, w.y); showMapCard();
  }
  drag = null;
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
window.addEventListener('keydown', (e) => { if (e.target.matches && e.target.matches('input,textarea,select')) return; if (e.key === '+' || e.key === '=') zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.25); else if (e.key === '-') zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 0.8); else if (e.key === '0') { cur().auto = true; cur().z = 1; } else if (e.key.toLowerCase() === 'm') { view = view === 'map' ? 'side' : 'map'; showMapCard(); } });
