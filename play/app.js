import {
  ORES, DESTINATIONS, SAVE_KEY, advanceGame, buyNextShaft, createGameState, currentLiftRate, currentRates,
  dispatchNow, grantDevCoins, hireWorkers, purchaseUpgrade, selectDestination,
  setAutoLaunch, stepGame, upgradeCost, validateGameState,
} from './model.js';

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

const TABS = [['sell', 'Sell'], ['upgrades', 'Upgrades'], ['shafts', 'Shafts'], ['records', 'Records'], ['tools', 'Tools']];
const shaftCost = () => (state.production.shafts.length >= 30 ? null : Math.floor(120 * 2.4 ** state.production.shafts.length + 0.5));
const crewCap = () => 10 + 5 * state.upgrades.habitat;
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
  tag.innerHTML = `<b>RUSTGLASS BASIN</b> · ${state.production.shafts.length} shaft${state.production.shafts.length === 1 ? '' : 's'} · ${state.workersHired} miners · lift LV ${state.production.lift.level}`;
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
  const hireDisabled = state.workersHired >= crewCap() || state.coins < 20;
  return `<h2>Reinvest</h2><p class="lede">Dig deeper. Keep the lift moving. Every upgrade here is a local test curve.</p>
    <h3>Mine</h3><div class="rows">
      <div class="row"><div><div class="t">Open a new shaft</div><div class="d">${state.production.shafts.length} / 30 open</div></div>${buyBtn('data-act="shaft"', '＋ Shaft', shaftCost())}</div>
      <div class="row"><div><div class="t">Hire a miner</div><div class="d">${state.workersHired} / ${crewCap()} crew</div><div class="meter" style="margin-top:6px"><i style="width:${fillFraction(state.workersHired, crewCap())}%"></i></div></div><button class="buy ok" data-act="hire" type="button"${hireDisabled ? ' disabled' : ''}>＋ Miner<br>${state.workersHired >= crewCap() ? 'NEEDS BUNKS' : '20 ◉'}</button></div>
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

function tabRecords() {
  const ledger = state.ledger.slice().reverse().slice(0, 10).map((e) => `<div class="row"><div><div class="t">${safeText(e.description)}</div><div class="d">${formatClock(e.atSecond)} · ${safeText(e.type.replaceAll('_', ' '))}</div></div><div class="e" style="color:${e.ownerDelta > 0 ? 'var(--ok)' : 'var(--bad)'}">${e.ownerDelta > 0 ? '+' : '−'}${fmt(e.amount)} ◉</div></div>`).join('') || '<p class="lede">No records yet.</p>';
  const cargo = state.shipments.slice().reverse().slice(0, 8).map((s) => `<div class="row"><div><div class="t">${fmtUnits(s.units)} ${safeText(oreById(s.oreId).name)} → ${safeText(destinationById(s.destinationId).name)}</div><div class="d">${state.shipmentStatusById[s.id] === 'DELIVERED' ? 'Delivered' : `ETA ${formatClock(Math.max(0, s.arrivalAtSecond - state.simSeconds))}`} · paid at departure</div></div><div class="e">${fmt(s.payment)} ◉</div></div>`).join('') || '<p class="lede">The launch pad is waiting for its first cargo.</p>';
  const events = state.log.slice().reverse().slice(0, 10).map((e) => `<div>${formatClock(e.atSecond)} · ${safeText(e.message)}</div>`).join('') || '<p class="lede">No events yet.</p>';
  return `<h2>Paper trail</h2><h3>Ledger · ${state.ledger.length} entries</h3><div class="rows">${ledger}</div><h3>Cargo</h3><div class="rows">${cargo}</div><h3>Events</h3><div class="feed">${events}</div>`;
}

function tabTools() {
  return `<h2>Dev tools</h2><p class="lede">Local sandbox only. No server, no month competition.</p>
    <div class="devbox"><b>Fast-forward</b><p class="d">Runs the same one-second tick.</p><div class="btnrow"><button class="buy ghost sm" data-forward="60" type="button">1 min</button><button class="buy ghost sm" data-forward="600" type="button">10 min</button><button class="buy ghost sm" data-forward="3600" type="button">1 hour</button></div></div>
    <div class="devbox"><b>Test grant</b><p class="d">Creates an explicit local source entry.</p><div class="btnrow"><input id="grant-amount" type="number" min="1" step="1" value="${safeText(grantValue)}" aria-label="Test grant amount"><button class="buy sm" data-act="grant" type="button">Add test coins</button></div></div>
    <div class="devbox"><b>Reset sandbox</b><p class="d">Starts a new local save. The legacy prototype is untouched.</p>${resetPromptOpen ? '<div class="btnrow"><button class="buy danger sm" data-act="confirm-reset" type="button">Reset mine</button><button class="buy ghost sm" data-act="cancel-reset" type="button">Keep playing</button></div>' : '<div class="btnrow"><button class="buy ghost sm" data-act="reset" type="button">Reset local save…</button></div>'}</div>
    <div class="note">Rates, offers, costs and buyer budgets are local test fixtures, not certified balance.</div>`;
}

function render() {
  renderHud();
  renderTabs();
  const body = $('#tabbody');
  const top = body.scrollTop;
  const active = document.activeElement;
  if (active && active.id === 'grant-amount') { renderPending = true; return; }
  body.innerHTML = { sell: tabSell, upgrades: tabUpgrades, shafts: tabShafts, records: tabRecords, tools: tabTools }[tab]();
  body.scrollTop = top;
  drawScene();
}
let renderPending = false;

function rect(x, y, width, height, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height)); }
function line(x1, y1, x2, y2, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function pixelText(text, x, y, color = '#b3a5d3', size = 9) { ctx.fillStyle = color; ctx.font = `${size}px Silkscreen, monospace`; ctx.fillText(text, x, y); }

function drawScene() {
  if (!ctx || !state) return;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(300, canvas.clientWidth);
  const H = Math.max(220, canvas.clientHeight || 400);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const s = Math.min(W / 960, H / 380);
  // backdrop outside the letterboxed scene: night sky above, rock below
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0714'; ctx.fillRect(0, 0, W, H);
  const topPad = Math.max(0, H / s - 440) * 0.4;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W - 960 * s) / 2, dpr * topPad * s);
  ctx.imageSmoothingEnabled = false;
  const ox = (W - 960 * s) / 2 / s, oy = topPad, oyBottom = H / s - 440 - topPad;
  const sky = ctx.createLinearGradient(0, -oy, 0, 218);
  sky.addColorStop(0, '#130d1f'); sky.addColorStop(0.6, '#3a1f5c'); sky.addColorStop(1, '#8a3d6e');
  ctx.fillStyle = sky; ctx.fillRect(-ox, -oy, 960 + 2 * ox, 218 + oy);
  for (let i = 0; i < 40; i += 1) { const x = (i * 173 + 37) % 940; const y = 10 + (i * 47 % 130); rect(x, y, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2, i % 3 === 0 ? '#ffd23f' : '#b892ff'); }
  rect(760, 26, 76, 76, '#c4571f'); rect(770, 36, 56, 56, '#ff8a3d'); rect(785, 50, 26, 26, '#ffd23f');
  rect(0, 160, 160, 50, '#2c1b46'); rect(120, 143, 70, 45, '#33214f'); rect(150, 125, 46, 62, '#3b2a5c');
  rect(505, 154, 165, 51, '#2c1b46'); rect(580, 135, 132, 69, '#3b2a5c'); rect(710, 167, 250, 45, '#2c1b46');
  rect(-ox, 206, 960 + 2 * ox, 15, '#b8522c'); rect(-ox, 219, 960 + 2 * ox, 10, '#7a3a2a');
  ['#4a2e3a', '#3b2a44', '#2e2340', '#251c38', '#1c1430'].forEach((color, band) => {
    rect(-ox, 229 + band * 42, 960 + 2 * ox, 42 + (band === 4 ? Math.max(0, oyBottom) : 0), color);
    for (let x = (band * 19) % 60; x < 960; x += 72) rect(x, 238 + band * 42, 20 + (x % 11), 4, band % 2 ? '#5b3b52' : '#3b2d5c');
  });
  // lift tower and cage
  rect(118, 139, 8, 69, '#ff8a3d'); rect(125, 139, 40, 6, '#ff8a3d'); rect(158, 139, 6, 69, '#c4571f');
  rect(130, 147, 5, 57, '#ffb347'); rect(148, 147, 5, 57, '#ffb347');
  line(139, 147, 139, 338, '#b3a5d3', 2);
  const phase = state.simSeconds % 18;
  const cageY = 225 + (phase < 9 ? phase : 18 - phase) * 11;
  rect(126, cageY, 28, 16, '#ffd23f'); rect(131, cageY + 4, 18, 7, '#130d1f');
  // shafts
  const shafts = state.production.shafts;
  const shown = Math.min(shafts.length, 9);
  shafts.slice(0, shown).forEach((shaft, index) => {
    const x = 230 + index * 40;
    rect(x - 9, 202, 20, 15, '#130d1f'); rect(x - 6, 207, 14, 8, '#ff8a3d');
    const depth = 248 + index * 16;
    rect(x - 3, 220, 7, depth - 220, '#0b0714'); rect(x + 4, 220, 2, depth - 220, '#7a5a8a'); rect(x - 8, depth, 18, 6, '#ff8a3d');
    if (shaft.workersAssigned > 0) {
      const walk = (state.simSeconds * (shaft.shaftNumber % 3 + 1) + shaft.shaftNumber * 17) % 62;
      const mx = x - 6 + walk, my = depth - 20;
      rect(mx, my, 5, 9, '#ff8a3d'); rect(mx + 1, my - 4, 4, 4, '#ffd9a8');
      rect(mx - 2, my + 9, 4, 3, '#130d1f'); rect(mx + 3, my + 9, 4, 3, '#130d1f');
      if (state.simSeconds % 3 === 0) rect(mx + 8, my + 1, 3, 3, '#ffd23f');
    }
    const buffer = shaft.bufferUnits / Math.max(1, shaft.bufferCapacityUnits);
    if (buffer > 0.05) rect(x + 13, depth - 3 - buffer * 16, 4, buffer * 16, oreById(shaft.oreId).color);
  });
  if (shafts.length > shown) pixelText(`+${shafts.length - shown} SHAFTS BELOW`, 223, 385, '#b3a5d3', 9);
  // ore yard
  rect(610, 175, 212, 25, '#4a2e3a'); rect(618, 157, 200, 40, '#7a3a2a'); rect(625, 162, 186, 31, '#251c38');
  const bins = state.production.surface.unitsByOre;
  const maxBin = Math.max(1, ...bins.map((b) => b.units));
  for (let i = 0; i < Math.min(5, ORES.length); i += 1) {
    const ore = ORES[i];
    const stock = bins.find((r) => r.oreId === ore.id)?.units ?? 0;
    const x = 631 + i * 35, h = Math.min(18, stock / maxBin * 18);
    rect(x, 169, 25, 22, '#130d1f'); rect(x + 2, 189 - h, 21, h, ore.color); rect(x, 191, 25, 3, '#ff8a3d');
  }
  rect(600, 200, 227, 8, '#ff8a3d');
  // launch pad and hauler
  rect(840, 157, 78, 7, '#ff8a3d'); rect(850, 164, 6, 45, '#ff8a3d'); rect(906, 164, 6, 45, '#ff8a3d'); rect(850, 202, 61, 6, '#ffb347');
  const busy = state.ship.readyAtSecond > state.simSeconds;
  const sx = busy ? 838 - ((state.simSeconds * 5) % 500) : 863;
  const sy = busy ? 124 + Math.sin(state.simSeconds / 4) * 3 : 180;
  rect(sx, sy, 46, 13, '#7ad1ff'); rect(sx + 7, sy - 7, 24, 7, '#b8e6ff'); rect(sx + 14, sy + 13, 20, 5, '#3a7fa8'); rect(sx + 37, sy + 4, 12, 4, '#ffd23f');
  if (busy) { line(sx - 10, sy + 8, sx - 3, sy + 8, '#ff8a3d', 2); pixelText('PAID CARGO IN TRANSIT', 700, 114, '#7ad1ff', 9); }
  pixelText('SHAFT / SURFACE', 27, 247, '#b3a5d3', 9);
  pixelText('ORE YARD', 650, 151, '#ffd23f', 9);
  pixelText('LAUNCH PAD 01', 841, 224, '#ffb347', 9);
  pixelText(`${fmtUnits(totalRate())} U / MIN`, 28, 271, '#ffd23f', 11);
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
  switch (button.dataset.act) {
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
document.addEventListener('input', (event) => { if (event.target.id === 'grant-amount') grantValue = event.target.value; });
document.addEventListener('focusout', (event) => { if (event.target.id === 'grant-amount' && renderPending) { renderPending = false; render(); } });
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
