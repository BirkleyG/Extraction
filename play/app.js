import {
  ORES, DESTINATIONS, SAVE_KEY, advanceGame, buyNextShaft, createGameState, currentLiftRate, currentRates, habitatCapacity, hireCost,
  dispatchNow, grantDevCoins, hireWorkers, purchaseUpgrade, selectDestination,
  setAutoLaunch, stepGame, upgradeCost, validateGameState,
} from './model.js';
import { renderScene } from './scene.js';
import { TERRAINS, aiReady, aiSettings, generatePlanet, loadHistory, loadPlanet, recordPlanet, saveAiSettings, savePlanet, askJSON } from './planet.js';

const $ = (selector) => document.querySelector(selector);
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
let grantValue = '10000';
let toastTimer;
let world = loadPlanet();
let planet = world.planet;
let regionId = world.regionId;
let planetBusy = false;
let lastTickMs = performance.now();
const region = () => planet.regions.find((r) => r.id === regionId) || planet.regions[0];
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
function destinationById(id) { return DESTINATIONS.find((item) => item.id === id); }
function surfaceTotal() { return state.production.surface.unitsByOre.reduce((sum, row) => sum + row.units, 0); }
function liftRate() { return currentLiftRate(state); }
function totalRate() { return currentRates(state).reduce((sum, row) => sum + row.ratePerMinute, 0); }
function safeText(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createGameState();
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
    recovering = 'This local save could not be read. A fresh sandbox was opened; the prototype save was left alone.';
    return createGameState();
  }
}

function save() {
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
    NOT_ENOUGH_STOCK: 'The yard needs at least 1 unit for a launch.',
    BUYER_FULL: 'That buyer has no free receiving capacity.',
    BUYER_OUT_OF_FUNDS: 'That buyer has spent its finite fixture budget.',
    INVALID_PAYMENT: 'The local transaction could not be balanced.',
  };
  return messages[error?.code] || error?.message || 'The action could not be completed.';
}

function apply(action, success) {
  try {
    state = validateGameState(action(state));
    save();
    render();
    if (success) toast(success, 'success');
  } catch (error) {
    toast(messageFor(error), 'error');
  }
}

function costButton(type, shaftNumber = 1) {
  const cost = upgradeCost(state, type, shaftNumber);
  return cost === null ? 'CAPPED' : `${fmt(cost)} ◉`;
}

const TABS = [['sell', 'Sell'], ['upgrades', 'Upgrades'], ['shafts', 'Shafts'], ['planet', 'Planet'], ['records', 'Records'], ['tools', 'Tools']];
const shaftCost = () => (state.production.shafts.length >= 30 ? null : Math.floor(120 * 2.4 ** state.production.shafts.length + 0.5));
const crewCap = () => habitatCapacity(state.upgrades.habitat);
const buyBtn = (attrs, label, cost, cls = '') => `<button class="buy ${cls}" ${attrs} type="button"${cost === null ? ' disabled' : ''}>${label}<br>${cost === null ? 'CAPPED' : `${fmt(cost)} ◉`}</button>`;

function renderHud() {
  const rate = totalRate();
  $('#hCoin').textContent = fmt(state.coins);
  $('#hRate').textContent = `${fmtUnits(rate)} ore / min`;
  $('#hSurface').textContent = `${fmtUnits(surfaceTotal())} / ${fmtUnits(state.production.surface.capacityUnits)}`;
  $('#hEarned').textContent = fmt(state.totalExternalEarnings);
  $('#hTime').textContent = formatClock(state.simSeconds);
  $('#hLive').textContent = catchingUp ? 'CATCHING UP' : paused ? 'MINE PAUSED' : 'MINE RUNNING';
  $('#hLive').classList.toggle('off', paused || catchingUp);
  $('#pauseBtn').textContent = paused ? 'Resume' : 'Pause';
  $('#pauseBtn').setAttribute('aria-pressed', String(paused));
  const tag = $('#stageTag');
  tag.innerHTML = `<b>${safeText(region().name.toUpperCase())}</b> · ${safeText(TERRAINS[region().terrain].label)} · ${state.production.shafts.length} shaft${state.production.shafts.length === 1 ? '' : 's'} · ${state.workersHired} miners · lift LV ${state.production.lift.level}`;
  const yard = state.production.surface.capacityUnits ? surfaceTotal() / state.production.surface.capacityUnits : 0;
  const buf = Math.max(0, ...state.production.shafts.map((s) => (s.bufferCapacityUnits ? s.bufferUnits / s.bufferCapacityUnits : 0)));
  const banner = $('#banner');
  const msg = catchingUp ? `CATCHING UP · ${fmt(catchupRemaining)} s left` : recovering || (yard >= 0.9 ? '! YARD FULL — launch cargo or expand the yard' : buf >= 0.9 ? '! SHAFT BUFFER FULL — upgrade the lift' : '');
  banner.hidden = !msg;
  banner.classList.toggle('bad', !catchingUp && !recovering && !!msg);
  banner.textContent = msg;
  const last = state.log.slice(-2).reverse();
  $('#ticker').innerHTML = last.length ? last.map((e) => `<div>${formatClock(e.atSecond)} · ${safeText(e.message)}</div>`).join('') : '<div>The mine is quiet. Dig deeper, keep the lift moving, sell the ore.</div>';
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([id, label]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${tab === id}">${label}</button>`).join('');
}

function shipStatus() {
  if (state.ship.readyAtSecond > state.simSeconds) return `Hauler returning · ${formatClock(state.ship.readyAtSecond - state.simSeconds)}`;
  if (state.ship.loading) return `Loading · ${fmtUnits(state.ship.cargoUnits)} u unpaid`;
  if (state.ship.cargoUnits >= 1) return `${fmtUnits(state.ship.cargoUnits)} u aboard, unpaid`;
  return 'Ready at pad';
}

function tabSell() {
  const buyer = state.buyers.find((b) => b.id === state.selectedDestinationId);
  const canLoad = state.ship.cargoUnits >= 1 || state.production.surface.unitsByOre.some((r) => r.units > 0);
  const free = buyer ? buyer.capacityUnits - buyer.inventoryUnits - buyer.reservedUnits : 0;
  const can = state.ship.readyAtSecond <= state.simSeconds && canLoad && buyer && free >= 1 && buyer.funds >= 1 && !catchingUp;
  const label = state.ship.cargoUnits >= 1 ? 'Launch loaded cargo' : state.ship.loading ? 'Loading…' : state.autoLaunch ? 'Launch now' : 'Load cargo & launch';
  const rows = DESTINATIONS.map((d) => {
    const b = state.buyers.find((x) => x.id === d.id);
    const sel = d.id === state.selectedDestinationId;
    const price = Math.floor(d.basePrice * oreById('ferrite').value + 0.5);
    return `<div class="row ${sel ? 'sel' : ''}"><div><div class="t"><span class="pick"></span>${safeText(d.name)} <span class="own">${fmt(price)}</span></div><div class="d">${safeText(d.detail)} · ${d.distance} AU · ${fmtUnits(Math.max(0, b.capacityUnits - b.inventoryUnits - b.reservedUnits))} u free</div><div class="e">◉ ${fmt(b.funds)} to spend</div></div><button class="buy ${sel ? 'ok' : 'ghost'} sm" data-destination="${d.id}" type="button">${sel ? 'Selected' : 'Sell here'}</button></div>`;
  }).join('');
  return `<h2>Where to sell</h2><p class="lede">Departure is the paid sale. Buyers have finite funds, so spread your cargo around.</p>
    <h3>Hauler</h3>
    <div class="row"><div><div class="t">${safeText(shipStatus())}</div><div class="d">${fmtUnits(state.ship.capacityUnits)} u hold · ${state.ship.speedPerMinute.toFixed(2)} AU/min</div></div><button class="buy" data-act="launch" type="button"${can ? '' : ' disabled'}>${label} ↗</button></div>
    <label class="toggle" style="margin:10px 0"><input type="checkbox" data-act="auto"${state.autoLaunch ? ' checked' : ''}${catchingUp ? ' disabled' : ''}> Auto-launch first partial load</label>
    <h3>Buyers</h3><div class="rows">${rows}</div>
    <div class="note">Offers and budgets are playtest fixtures, not certified balance.</div>`;
}

function tabUpgrades() {
  const first = state.production.shafts[0];
  const lines = [
    ['dig', 'Dig rate', `Shaft 01 · LV ${first.digLevel}`],
    ['lift', 'Lift throughput', `LV ${state.production.lift.level} · ${fmtUnits(liftRate())} units/min`],
    ['yard', 'Surface yard', `${fmtUnits(state.production.surface.capacityUnits)} unit capacity`],
    ['shipSpeed', 'Hauler speed', `${state.ship.speedPerMinute.toFixed(2)} AU/min`],
    ['habitat', 'Habitat', `Crew cap ${crewCap()}`],
    ['shipCapacity', 'Cargo capacity', `${fmtUnits(state.ship.capacityUnits)} units`],
    ['loading', 'Pad loading', `${fmtUnits(state.ship.loadingUnitsPerMinute)} units/min`],
  ];
  const bulk = new Set(['dig', 'lift', 'yard', 'shipSpeed']);
  const rows = lines.map(([type, name, detail]) => `<div class="row"><div><div class="t">${name}</div><div class="d">${detail}</div>${bulk.has(type) ? `<div class="bulk">${['10', 'max'].map((c) => `<button data-buy="${type}" data-count="${c}" data-shaft="1" type="button">${c === 'max' ? 'MAX' : `×${c}`}</button>`).join('')}</div>` : ''}</div>${buyBtn(`data-buy="${type}" data-shaft="1"`, 'BUY 1', upgradeCost(state, type, 1))}</div>`).join('');
  const hirePrice = hireCost(state.workersHired);
  const hireDisabled = state.workersHired >= crewCap() || state.coins < hirePrice;
  return `<h2>Reinvest</h2><p class="lede">Dig deeper. Keep the lift moving. Every upgrade here is a local test curve.</p>
    <h3>Mine</h3><div class="rows">
      <div class="row"><div><div class="t">Open a new shaft</div><div class="d">${state.production.shafts.length} / 30 open</div></div>${buyBtn('data-act="shaft"', '＋ Shaft', shaftCost())}</div>
      <div class="row"><div><div class="t">Hire a miner</div><div class="d">${state.workersHired} / ${crewCap()} crew</div><div class="meter" style="margin-top:6px"><i style="width:${fillFraction(state.workersHired, crewCap())}%"></i></div></div><button class="buy ok" data-act="hire" type="button"${hireDisabled ? ' disabled' : ''}>＋ Miner<br>${state.workersHired >= crewCap() ? 'NEEDS BUNKS' : `${fmt(hirePrice)} ◉`}</button></div>
    </div>
    <h3>Operations</h3><div class="rows">${rows}</div>`;
}

function tabShafts() {
  const rates = currentRates(state);
  const cards = state.production.shafts.map((shaft) => {
    const rate = rates.find((r) => r.shaftNumber === shaft.shaftNumber);
    const pct = fillFraction(shaft.bufferUnits, shaft.bufferCapacityUnits);
    const n = shaft.shaftNumber;
    const up = (type, name, lv) => `<div class="up"><small>${name}</small><b>LV ${lv}</b>${buyBtn(`data-buy="${type}" data-shaft="${n}"`, '+1', upgradeCost(state, type, n))}</div>`;
    return `<div class="shaft"><div class="shead"><b>SHAFT ${String(n).padStart(2, '0')}</b><span class="swatch2" style="--ore:${rate.ore.color}"></span><span>${safeText(rate.ore.name)}</span><span class="own" style="font-family:var(--f-mono);font-size:19px;color:var(--coin);margin-left:auto">${fmtUnits(rate.ratePerMinute)}/min</span></div>
      <div class="d">${shaft.workersAssigned} / ${10 + shaft.bunkhouseLevel * 5} crew · buffer ${fmtUnits(shaft.bufferUnits)} / ${fmtUnits(shaft.bufferCapacityUnits)}</div>
      <div class="meter ${pct >= 90 ? 'warn' : ''}"><i style="width:${pct}%"></i></div>
      <div class="ups">${up('dig', 'Dig', shaft.digLevel)}${up('bunkhouse', 'Bunks', shaft.bunkhouseLevel)}${up('cart', 'Carts', shaft.cartLevel)}</div></div>`;
  }).join('');
  return `<h2>Your shafts</h2><p class="lede">Each shaft digs its own ore. Watch the buffers: a full one stalls the shaft.</p><div class="rows">${cards}</div>`;
}

function tabPlanet() {
  const rows = planet.regions.map((r) => {
    const T = TERRAINS[r.terrain]; const sel = r.id === regionId;
    return `<div class="row ${sel ? 'sel' : ''}"><div><div class="t"><span class="swatch2" style="--ore:${r.biome}"></span>${safeText(r.name)}</div><div class="d">${safeText(T.label)}${T.group === 'alien' ? ' · alien' : ''} · ${safeText(r.blurb)}</div></div><button class="buy ${sel ? 'ok' : 'ghost'} sm" data-region="${r.id}" type="button">${sel ? 'Here' : 'Visit'}</button></div>`;
  }).join('');
  const ores = planet.ores.map((o) => `<span class="chip"><i style="background:${o.color}"></i>${safeText(o.name)}</span>`).join('');
  const th = planet.theme || { concept: '', motifs: [] };
  const ready = aiReady();
  const past = loadHistory().slice(-5).reverse().map((e) => `<div class="d">${safeText(e.name)} · ${safeText(e.concept)}</div>`).join('');
  return `<h2>${safeText(planet.name)}</h2><p class="lede">${safeText(planet.tagline)}</p>
    <div class="note"><b>THEME</b> · ${safeText(th.concept)}${th.mood ? ` <i>(${safeText(th.mood)})</i>` : ''}${th.motifs && th.motifs.length ? `<br>${th.motifs.map((m) => `<span class="pill sp">${safeText(m)}</span>`).join(' ')}` : ''}</div>
    <p class="story">${safeText(planet.story)}</p>
    <h3>Ores on this world</h3><div class="chips">${ores}</div>
    <h3>Regions · pick the ground your mine sits on</h3><div class="rows">${rows}</div>
    <div class="note">Regions change the landscape, weather and look. The sandbox's rates and prices don't depend on them yet.</div>
    <h3>New planet</h3>
    <label class="f">What should the Maker build? (optional)<textarea id="planetPrompt" maxlength="400" placeholder="A cold, pink planet of floating ice and screaming moons">${safeText(planetPromptValue)}</textarea></label>
    <div class="btnrow"><button class="buy alt" data-act="newplanet-ai" type="button"${planetBusy ? ' disabled' : ''}>${planetBusy ? 'The Maker is thinking…' : ready ? 'Ask the Maker (AI)' : 'Ask the Maker'}</button></div>
    <p class="lede">${ready ? 'The Maker invents a theme, builds the whole planet from it, and reads the planets before it so this one is new.' : 'No AI key yet, so the Maker will improvise from a theme. Add your own Claude or OpenAI key under Tools for full AI planets.'}</p>
    ${past ? `<h3>Planets so far</h3><div class="rows">${past}</div>` : ''}`;
}
let planetPromptValue = '';

function tabRecords() {
  const ledger = state.ledger.slice().reverse().slice(0, 10).map((e) => `<div class="row"><div><div class="t">${safeText(e.description)}</div><div class="d">${formatClock(e.atSecond)} · ${safeText(e.type.replaceAll('_', ' '))}</div></div><div class="e" style="color:${e.ownerDelta > 0 ? 'var(--ok)' : 'var(--bad)'}">${e.ownerDelta > 0 ? '+' : '−'}${fmt(e.amount)} ◉</div></div>`).join('') || '<p class="lede">No records yet.</p>';
  const cargo = state.shipments.slice().reverse().slice(0, 8).map((s) => `<div class="row"><div><div class="t">${fmtUnits(s.units)} ${safeText(oreById(s.oreId).name)} → ${safeText(destinationById(s.destinationId).name)}</div><div class="d">${state.shipmentStatusById[s.id] === 'DELIVERED' ? 'Delivered' : `ETA ${formatClock(Math.max(0, s.arrivalAtSecond - state.simSeconds))}`} · paid at departure</div></div><div class="e">${fmt(s.payment)} ◉</div></div>`).join('') || '<p class="lede">The launch pad is waiting for its first cargo.</p>';
  const events = state.log.slice().reverse().slice(0, 10).map((e) => `<div>${formatClock(e.atSecond)} · ${safeText(e.message)}</div>`).join('') || '<p class="lede">No events yet.</p>';
  return `<h2>Paper trail</h2><h3>Ledger · ${state.ledger.length} entries</h3><div class="rows">${ledger}</div><h3>Cargo</h3><div class="rows">${cargo}</div><h3>Events</h3><div class="feed">${events}</div>`;
}

function tabTools() {
  const ai = aiSettings();
  return `<h2>Dev tools</h2><p class="lede">Local sandbox only. No server, no month competition.</p>
    <div class="devbox"><b>Fast-forward</b><p class="d">Runs the same one-second tick.</p><div class="btnrow"><button class="buy ghost sm" data-forward="60" type="button">1 min</button><button class="buy ghost sm" data-forward="600" type="button">10 min</button><button class="buy ghost sm" data-forward="3600" type="button">1 hour</button></div></div>
    <div class="devbox"><b>Test grant</b><p class="d">Creates an explicit local source entry.</p><div class="btnrow"><input id="grant-amount" type="number" min="1" step="1" value="${safeText(grantValue)}" aria-label="Test grant amount"><button class="buy sm" data-act="grant" type="button">Add test coins</button></div></div>
    <div class="devbox"><b>AI engine · bring your own key</b><p class="d">Used only to design planets. Your key stays in this browser and goes straight to the provider.</p>
      <label class="f">Engine<select id="aiProvider"><option value="off"${ai.provider === 'off' ? ' selected' : ''}>Off</option><option value="anthropic"${ai.provider === 'anthropic' ? ' selected' : ''}>My Claude API key</option><option value="openai"${ai.provider === 'openai' ? ' selected' : ''}>My OpenAI API key</option></select></label>
      <label class="f">API key<input type="password" id="aiKey" autocomplete="off" value="${safeText(ai.key || '')}" placeholder="paste key"></label>
      <div class="btnrow"><button class="buy sm" data-act="ai-save" type="button">Save</button><button class="buy ghost sm" data-act="ai-test" type="button">Test connection</button></div></div>
    <div class="devbox"><b>Reset sandbox</b><p class="d">Starts a new local save. The legacy prototype is untouched.</p>${resetPromptOpen ? '<div class="btnrow"><button class="buy danger sm" data-act="confirm-reset" type="button">Reset mine</button><button class="buy ghost sm" data-act="cancel-reset" type="button">Keep playing</button></div>' : '<div class="btnrow"><button class="buy ghost sm" data-act="reset" type="button">Reset local save…</button></div>'}</div>
    <div class="note">Rates, offers, costs and buyer budgets are local test fixtures, not certified balance.</div>`;
}

function render() {
  renderHud();
  renderTabs();
  const body = $('#tabbody');
  const top = body.scrollTop;
  const active = document.activeElement;
  if (active && active.closest && active.closest('#tabbody') && active.matches('input[type=text],input[type=password],input[type=number],textarea,select')) { renderPending = true; return; }
  body.innerHTML = { sell: tabSell, upgrades: tabUpgrades, shafts: tabShafts, planet: tabPlanet, records: tabRecords, tools: tabTools }[tab]();
  body.scrollTop = top;
  drawScene();
}
let renderPending = false;

function drawScene() {
  if (!state) return;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(300, canvas.clientWidth); const H = Math.max(200, canvas.clientHeight || 400);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  renderScene(canvas, ctx, { state, planet, region: region(), t: performance.now() / 1000, frac: Math.min(1, (performance.now() - lastTickMs) / 1000), oreIndex });
}

function catchUpBatch() {
  if (catchupRemaining <= 0) {
    catchingUp = false; save(); render();
    toast(catchupKind === 'fast-forward' ? 'Fast-forward complete.' : 'Offline sandbox catch-up complete.', 'success');
    catchupKind = 'offline';
    return;
  }
  try {
    const batch = advanceGame(state, catchupRemaining, 300);
    state = batch.state; catchupRemaining = batch.remainingSeconds;
    save(); render(); setTimeout(catchUpBatch, 0);
  } catch {
    catchingUp = false;
    recovering = `${catchupKind === 'fast-forward' ? 'Fast-forward' : 'Offline catch-up'} stopped on invalid local state. The latest valid checkpoint is still saved.`;
    save(); render();
  }
}

function startForward(seconds) {
  catchupRemaining += seconds; catchupKind = 'fast-forward'; catchingUp = true;
  save(); render(); setTimeout(catchUpBatch, 0);
}

state = loadSave();
renderTabs();
render();
if (recovering) toast(recovering, 'error');
if (catchupRemaining > 0) { catchingUp = true; render(); setTimeout(catchUpBatch, 0); }

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
  if (button.id === 'pauseBtn') { paused = !paused; save(); render(); return; }
  if (catchingUp) return;
  if (button.dataset.tab) { tab = button.dataset.tab; render(); return; }
  if (button.dataset.forward) { startForward(Number(button.dataset.forward)); return; }
  if (button.dataset.destination) { apply((current) => selectDestination(current, button.dataset.destination)); return; }
  if (button.dataset.buy) {
    const raw = button.dataset.count || '1';
    apply((current) => purchaseUpgrade(current, button.dataset.buy, { shaftNumber: Number(button.dataset.shaft || 1), count: raw === 'max' ? 'max' : Number(raw) }), 'Upgrade purchased.');
    return;
  }
  if (button.dataset.region) { regionId = button.dataset.region; savePlanet(planet, regionId); render(); toast(`Now overlooking ${region().name}.`, 'success'); return; }
  switch (button.dataset.act) {
    case 'newplanet-ai': {
      const prompt = ($('#planetPrompt') && $('#planetPrompt').value) || planetPromptValue; planetPromptValue = prompt; planetBusy = true; render();
      generatePlanet(prompt).then(({ planet: p, how, error }) => {
        planet = p; regionId = p.regions[0].id; skinOres(); savePlanet(planet, regionId);
        toast(how === 'ai' ? `The Maker delivered ${planet.name}.` : `The Maker improvised ${planet.name}${error ? ` (${error})` : ''}.`, 'success');
      }).finally(() => { planetBusy = false; render(); });
      break;
    }
    case 'ai-save': { const key = $('#aiKey').value.trim(); saveAiSettings({ provider: $('#aiProvider').value, key, model: aiSettings().model }); toast('AI settings saved in this browser.', 'success'); render(); break; }
    case 'ai-test': {
      saveAiSettings({ provider: $('#aiProvider').value, key: $('#aiKey').value.trim(), model: aiSettings().model });
      askJSON('Reply with only this JSON: {"ok":true}').then((r) => toast(r && r.ok ? 'Connection works.' : 'Connected, but the reply was odd.', r && r.ok ? 'success' : 'error')).catch((e) => toast(e.message, 'error'));
      break;
    }
    case 'launch': apply(dispatchNow, state.ship.cargoUnits >= 1 ? 'Paid cargo left the pad.' : 'Unpaid cargo loading started.'); break;
    case 'shaft': apply(buyNextShaft, 'Shaft opened.'); break;
    case 'hire': apply((current) => hireWorkers(current, 1), 'Miner hired and assigned.'); break;
    case 'grant': {
      const amount = Number($('#grant-amount').value);
      if (!Number.isSafeInteger(amount) || amount < 1) { toast('Enter a positive whole coin amount.', 'error'); break; }
      grantValue = String(amount);
      apply((current) => grantDevCoins(current, amount), 'Local test grant recorded.');
      break;
    }
    case 'reset': resetPromptOpen = true; render(); break;
    case 'cancel-reset': resetPromptOpen = false; render(); break;
    case 'confirm-reset':
      state = createGameState(); paused = false; catchupRemaining = 0; catchingUp = false; catchupKind = 'offline'; resetPromptOpen = false; recovering = '';
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
  if (document.visibilityState === 'visible' && !paused) {
    const elapsed = Math.floor((Date.now() - savedAtMs) / 1000);
    if (elapsed > 1 && Number.isSafeInteger(elapsed)) {
      catchupRemaining += elapsed;
      if (!catchingUp) { catchupKind = 'offline'; catchingUp = true; render(); setTimeout(catchUpBatch, 0); }
    }
  }
});

function animate() { drawScene(); requestAnimationFrame(animate); }
requestAnimationFrame(animate);
window.addEventListener('resize', drawScene);
