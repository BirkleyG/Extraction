import {
  ORES, DESTINATIONS, SAVE_KEY, advanceGame, buyNextShaft, createGameState, currentLiftRate, currentRates, habitatCapacity, hireCost,
  dispatchNow, grantDevCoins, hireWorkers, purchaseUpgrade, selectDestination,
  setAutoLaunch, stepGame, upgradeCost, validateGameState,
} from './model.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#mine-scene');
const ctx = canvas.getContext('2d', { alpha: false });
const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
let state;
let paused = false;
let recovering = '';
let catchupRemaining = 0;
let catchingUp = false;
let catchupKind = 'offline';
let savedAtMs = Date.now();
let selectedRecordTab = 'ledger';
let moreOperationsOpen = false;
let resetPromptOpen = false;
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
  element.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.className = 'toast'; }, 2600);
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
  return cost === null ? `<span class="capped-label">CAPPED</span>` : `<span class="upgrade-cost">${fmt(cost)} <i>◉</i></span>`;
}

function renderMetrics() {
  $('#coin-value').textContent = fmt(state.coins);
  $('#earned-value').textContent = fmt(state.totalExternalEarnings);
  $('#surface-value').textContent = fmtUnits(surfaceTotal());
  $('#surface-capacity').textContent = `yard capacity · ${fmtUnits(state.production.surface.capacityUnits)}`;
  $('#production-value').textContent = fmtUnits(totalRate());
  $('#time-value').textContent = formatClock(state.simSeconds);
  $('#crew-value').textContent = `${state.workersHired} miners · ${state.production.shafts.length} shaft${state.production.shafts.length === 1 ? '' : 's'}`;
  $('#shaft-count').textContent = `${String(state.production.shafts.length).padStart(2, '0')} / 30`;
  $('#lift-label').textContent = `LV ${state.production.lift.level}`;
  $('#depth-label').textContent = String(Math.max(...state.production.shafts.map((shaft) => shaft.digLevel))).padStart(2, '0');
  $('#lift-rate').innerHTML = `${fmtUnits(liftRate())} <small>units/min</small>`;
  const yardRatio = state.production.surface.capacityUnits ? surfaceTotal() / state.production.surface.capacityUnits : 0;
  const maxBuffer = Math.max(0, ...state.production.shafts.map((shaft) => shaft.bufferCapacityUnits ? shaft.bufferUnits / shaft.bufferCapacityUnits : 0));
  $('#storage-alert').classList.toggle('hidden', yardRatio < 0.9);
  $('#buffer-alert').classList.toggle('hidden', maxBuffer < 0.9);
  $('#ship-status').innerHTML = state.ship.readyAtSecond > state.simSeconds
    ? `<i class="status-dot busy"></i> RETURNING · ${formatClock(state.ship.readyAtSecond - state.simSeconds)}`
    : state.ship.loading
      ? `<i class="status-dot busy"></i> LOADING · ${fmtUnits(state.ship.cargoUnits)} UNPAID`
      : state.ship.cargoUnits >= 1
        ? `<i class="status-dot busy"></i> ${fmtUnits(state.ship.cargoUnits)} UNPAID ABOARD`
        : `<i class="status-dot"></i> READY AT PAD`;
  $('#auto-ship-state').textContent = state.autoLaunch ? 'AUTO-LAUNCH ON' : 'MANUAL LAUNCH';
  $('#auto-launch').checked = state.autoLaunch;
  $('#crew-capacity').textContent = `${state.workersHired} / ${habitatCapacity(state.upgrades.habitat)}`;
  $('#crew-bar-fill').style.width = `${fillFraction(state.workersHired, habitatCapacity(state.upgrades.habitat))}%`;
  $('#record-count').textContent = `${state.ledger.length} ENTRIES`;
  const selectedBuyer = state.buyers.find((buyer) => buyer.id === state.selectedDestinationId);
  const canLoad = state.ship.cargoUnits >= 1 || state.production.surface.unitsByOre.some((row) => row.units > 0);
  const buyerCanReceive = selectedBuyer && selectedBuyer.capacityUnits - selectedBuyer.inventoryUnits - selectedBuyer.reservedUnits >= 1 && selectedBuyer.funds >= 1;
  $('#launch-button').disabled = state.ship.readyAtSecond > state.simSeconds || !canLoad || !buyerCanReceive || catchingUp;
  $('#launch-button').innerHTML = state.ship.readyAtSecond > state.simSeconds
    ? `Hauler returning · ${formatClock(state.ship.readyAtSecond - state.simSeconds)} <span>⌛</span>`
    : state.ship.cargoUnits >= 1
      ? `Launch loaded cargo · ${fmtUnits(state.ship.cargoUnits)} u <span>↗</span>`
      : state.ship.loading
        ? `Loading cargo… <span>⌛</span>`
        : state.autoLaunch
          ? `Auto-load begins at 1 unit <span>↗</span>`
          : `Load cargo to launch <span>↗</span>`;
  $('#run-state').textContent = catchingUp ? 'CATCHING UP' : paused ? 'MINE PAUSED' : 'MINE RUNNING';
  $('#pause-button').innerHTML = paused ? '▶ <span>Resume</span>' : 'Ⅱ <span>Pause</span>';
  $('#pause-button').setAttribute('aria-pressed', String(paused));
  $('#recovery-banner').textContent = recovering;
  $('#recovery-banner').classList.toggle('hidden', !recovering);
  $('#catchup-banner').classList.toggle('hidden', !catchingUp);
  $('#catchup-remaining').textContent = fmt(catchupRemaining);
  document.querySelectorAll('button').forEach((button) => { if (button.id !== 'pause-button') button.disabled = catchingUp; });
  $('#auto-launch').disabled = catchingUp;
  $('#reset-confirm').classList.toggle('hidden', !resetPromptOpen);
  $('#reset-button').classList.toggle('hidden', resetPromptOpen);
}

function renderOffers() {
  $('#offer-list').innerHTML = DESTINATIONS.map((destination) => {
    const buyer = state.buyers.find((item) => item.id === destination.id);
    const selected = destination.id === state.selectedDestinationId;
    const price = Math.floor(destination.basePrice * oreById('ferrite').value + 0.5);
    const capacityFree = buyer.capacityUnits - buyer.inventoryUnits - buyer.reservedUnits;
    return `<button class="offer-card ${selected ? 'selected' : ''}" type="button" data-destination="${destination.id}" aria-pressed="${selected}">
      <span class="offer-radio"></span><span class="offer-main"><strong>${safeText(destination.name)}</strong><small>${safeText(destination.detail)} · ${destination.distance} AU</small></span>
      <span class="offer-price"><b>${fmt(price)}</b><small>coin / ferrite</small></span>
      <span class="offer-reserve"><i>◉ ${fmt(buyer.funds)}</i><small>${fmtUnits(Math.max(0, capacityFree))} units free</small></span>
    </button>`;
  }).join('');
}

function renderUpgrades() {
  const first = state.production.shafts[0];
  const rows = [
    ['dig', 'Dig rate', `Shaft 01 · LV ${first.digLevel}`, '╱'],
    ['lift', 'Lift throughput', `LV ${state.production.lift.level} · grows 1.0316×`, '⇧'],
    ['yard', 'Surface yard', `${fmtUnits(state.production.surface.capacityUnits)} unit capacity`, '▤'],
    ['shipSpeed', 'Hauler speed', `${state.ship.speedPerMinute.toFixed(2)} AU/min`, '↗'],
  ];
  $('#upgrade-list').innerHTML = rows.map(([type, title, detail, icon]) => `
    <div class="upgrade-row"><span class="upgrade-icon">${icon}</span><span class="upgrade-main"><strong>${title}</strong><small>${detail}</small></span><button class="buy-button" data-buy="${type}" data-shaft="1" type="button"><span>BUY 1</span>${costButton(type, 1)}</button></div>
    <div class="bulk-row">${['1', '10', 'max'].map((count) => `<button data-buy="${type}" data-count="${count}" data-shaft="1" type="button">${count === 'max' ? 'MAX' : `×${count}`}</button>`).join('')}</div>`).join('');
  $('#shaft-cost').textContent = state.production.shafts.length >= 30 ? 'CAPPED' : `${fmt(Math.floor(120 * 2.4 ** state.production.shafts.length + 0.5))} ◉`;
  const hireLabel = state.workersHired >= habitatCapacity(state.upgrades.habitat) ? 'NEEDS CAPACITY' : `${fmt(hireCost(state.workersHired))} ◉`;
  $('#hire-button').textContent = `Hire + miner · ${hireLabel}`;
  $('#more-upgrades').innerHTML = moreOperationsOpen ? 'Hide operations <span>↑</span>' : 'More operations <span>↓</span>';
  const operations = $('#operations-more');
  operations.classList.toggle('hidden', !moreOperationsOpen);
  if (moreOperationsOpen) renderOperations();
}

function renderOperations() {
  const controls = [
    ['habitat', 'Habitat', `Crew cap ${habitatCapacity(state.upgrades.habitat)}`, 0],
    ['shipCapacity', 'Cargo capacity', `${fmtUnits(state.ship.capacityUnits)} units`, 0],
    ['loading', 'Pad loading', `${fmtUnits(state.ship.loadingUnitsPerMinute)} units/min`, 0],
  ];
  $('#operations-list').innerHTML = controls.map(([type, name, detail]) => `<div class="upgrade-row"><span class="upgrade-icon">⌁</span><span class="upgrade-main"><strong>${name}</strong><small>${detail}</small></span><button class="buy-button" data-buy="${type}" type="button"><span>BUY 1</span>${costButton(type)}</button></div>`).join('') + `
    <div class="operation-note"><strong>Fixture curves</strong><span>Costs and capacity bases are local playtest values; they are not production defaults.</span></div>`;
}

function renderShafts() {
  const rates = currentRates(state);
  $('#shaft-list').innerHTML = state.production.shafts.map((shaft) => {
    const rate = rates.find((row) => row.shaftNumber === shaft.shaftNumber);
    const percent = fillFraction(shaft.bufferUnits, shaft.bufferCapacityUnits);
    const blocked = percent >= 90;
    return `<article class="shaft-card">
      <div class="shaft-card-top"><span class="shaft-index">${String(shaft.shaftNumber).padStart(2, '0')}</span><span class="ore-swatch" style="--ore:${rate.ore.color}"></span><strong>${rate.ore.name}</strong><span class="shaft-rate">${fmtUnits(rate.ratePerMinute)} <small>/ min</small></span></div>
      <div class="shaft-meta"><span>${shaft.workersAssigned} / ${10 + shaft.bunkhouseLevel * 5} crew</span><span>${shaft.digLevel} dig · ${shaft.cartLevel} carts</span></div>
      <div class="shaft-buffer"><span>BUFFER</span><div><i style="width:${percent}%"></i></div><b>${blocked ? '! ' : ''}${fmtUnits(shaft.bufferUnits)} / ${fmtUnits(shaft.bufferCapacityUnits)}</b></div>
      <div class="shaft-actions"><button data-buy="dig" data-shaft="${shaft.shaftNumber}" type="button">Dig +1 · ${costButton('dig', shaft.shaftNumber)}</button><button data-buy="bunkhouse" data-shaft="${shaft.shaftNumber}" type="button">Bunks +1 · ${costButton('bunkhouse', shaft.shaftNumber)}</button><button data-buy="cart" data-shaft="${shaft.shaftNumber}" type="button">Cart +1 · ${costButton('cart', shaft.shaftNumber)}</button></div>
    </article>`;
  }).join('');
}

function renderRecords() {
  document.querySelectorAll('[data-record-tab]').forEach((button) => button.classList.toggle('active', button.dataset.recordTab === selectedRecordTab));
  if (selectedRecordTab === 'ledger') {
    const entries = state.ledger.slice().reverse().slice(0, 10);
    $('#record-list').innerHTML = entries.length ? entries.map((entry) => `<div class="record-row"><span class="record-mark ${entry.ownerDelta > 0 ? 'in' : 'out'}">${entry.ownerDelta > 0 ? '+' : '−'}</span><span class="record-text"><strong>${safeText(entry.description)}</strong><small>${formatClock(entry.atSecond)} · ${safeText(entry.type.replaceAll('_', ' '))}</small></span><b class="record-amount ${entry.ownerDelta > 0 ? 'positive' : ''}">${entry.ownerDelta > 0 ? '+' : '−'}${fmt(entry.amount)} ◉</b></div>`).join('') : '<p class="empty-state">No records yet.</p>';
  } else if (selectedRecordTab === 'shipments') {
    const shipments = state.shipments.slice().reverse().slice(0, 8);
    $('#record-list').innerHTML = shipments.length ? shipments.map((shipment) => `<div class="record-row"><span class="cargo-mark">▰</span><span class="record-text"><strong>${fmtUnits(shipment.units)} ${safeText(oreById(shipment.oreId).name)} → ${safeText(destinationById(shipment.destinationId).name)}</strong><small>${state.shipmentStatusById[shipment.id] === 'DELIVERED' ? 'Delivered' : `ETA ${formatClock(Math.max(0, shipment.arrivalAtSecond - state.simSeconds))}`} · paid at departure</small></span><b class="record-amount positive">${fmt(shipment.payment)} ◉</b></div>`).join('') : '<p class="empty-state">The launch pad is waiting for its first cargo.</p>';
  } else {
    const entries = state.log.slice().reverse().slice(0, 10);
    $('#record-list').innerHTML = entries.length ? entries.map((entry) => `<div class="record-row"><span class="event-mark">${entry.type === 'sale' ? '↗' : entry.type === 'arrival' ? '↓' : '·'}</span><span class="record-text"><strong>${safeText(entry.message)}</strong><small>${formatClock(entry.atSecond)}</small></span></div>`).join('') : '<p class="empty-state">No events yet.</p>';
  }
}

function render() {
  renderMetrics();
  renderOffers();
  renderUpgrades();
  renderShafts();
  renderRecords();
  drawScene();
}

function rect(x, y, width, height, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height)); }
function line(x1, y1, x2, y2, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function pixelText(text, x, y, color = '#d7cdb7', size = 9) { ctx.fillStyle = color; ctx.font = `bold ${size}px ui-monospace, monospace`; ctx.fillText(text, x, y); }

function drawScene() {
  if (!ctx || !state) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(300, canvas.clientWidth);
  const height = Math.max(220, canvas.clientHeight || 370);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr * width / 960, 0, 0, dpr * height / 440, 0, 0);
  ctx.imageSmoothingEnabled = false;
  rect(0, 0, 960, 440, '#111a19');
  const sky = ctx.createLinearGradient(0, 0, 0, 218);
  sky.addColorStop(0, '#192725'); sky.addColorStop(1, '#29312b');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 218);
  for (let index = 0; index < 34; index += 1) {
    const x = (index * 173 + 37) % 940;
    const y = 18 + (index * 47 % 120);
    rect(x, y, index % 5 === 0 ? 3 : 2, index % 5 === 0 ? 3 : 2, index % 3 === 0 ? '#a8a17b' : '#64766b');
  }
  rect(760, 26, 76, 76, '#d38d50'); rect(770, 36, 56, 56, '#e6a461'); rect(785, 50, 26, 26, '#f0bd72');
  rect(0, 155, 150, 50, '#344039'); rect(0, 177, 200, 35, '#3b453e');
  rect(120, 143, 70, 45, '#3a453e'); rect(150, 125, 46, 62, '#465048');
  rect(505, 154, 165, 51, '#39443d'); rect(580, 135, 132, 69, '#465048'); rect(710, 167, 250, 45, '#354039');
  rect(0, 206, 960, 15, '#c07748'); rect(0, 219, 960, 10, '#8f5639');
  const strata = ['#42332a', '#342d27', '#2c3029', '#272a24', '#222722'];
  strata.forEach((color, band) => {
    rect(0, 229 + band * 42, 960, 42, color);
    for (let x = (band * 19) % 60; x < 960; x += 72) rect(x, 238 + band * 42, 20 + (x % 11), 4, band % 2 ? '#554335' : '#394036');
  });
  // Lift tower and cage.
  rect(118, 139, 8, 69, '#cf8750'); rect(125, 139, 40, 6, '#cf8750'); rect(158, 139, 6, 69, '#b16c45');
  rect(130, 147, 5, 57, '#ddaa68'); rect(148, 147, 5, 57, '#ddaa68');
  line(139, 147, 139, 338, '#8d8b70', 2);
  const liftPhase = state.simSeconds % 18;
  const cageY = 225 + (liftPhase < 9 ? liftPhase : 18 - liftPhase) * 11;
  rect(126, cageY, 28, 16, '#dea05b'); rect(131, cageY + 4, 18, 7, '#503a2b');
  // Tunnel mouths and descending shaft lines.
  const shafts = state.production.shafts;
  const shown = Math.min(shafts.length, 9);
  shafts.slice(0, shown).forEach((shaft, index) => {
    const x = 230 + index * 40;
    rect(x - 9, 202, 20, 15, '#181d19');
    rect(x - 6, 207, 14, 8, '#c07a47');
    const depth = 248 + index * 16;
    rect(x - 3, 220, 7, depth - 220, '#141b18');
    rect(x + 4, 220, 2, depth - 220, '#766046');
    rect(x - 8, depth, 18, 6, '#d18a4f');
    const isActive = shaft.workersAssigned > 0;
    if (isActive) {
      const walk = (state.simSeconds * (shaft.shaftNumber % 3 + 1) + shaft.shaftNumber * 17) % 62;
      const minerX = x - 6 + walk;
      const minerY = depth - 20;
      rect(minerX, minerY, 5, 9, '#e59b57'); rect(minerX + 1, minerY - 4, 4, 4, '#d7c5a0');
      rect(minerX - 2, minerY + 9, 4, 3, '#24221d'); rect(minerX + 3, minerY + 9, 4, 3, '#24221d');
      if (state.simSeconds % 3 === 0) rect(minerX + 8, minerY + 1, 3, 3, '#e8d56d');
    }
    const buffer = shaft.bufferUnits / Math.max(1, shaft.bufferCapacityUnits);
    if (buffer > 0.05) { rect(x + 13, depth - 3 - buffer * 16, 4, buffer * 16, oreById(shaft.oreId).color); }
  });
  if (shafts.length > shown) pixelText(`+${shafts.length - shown} SHAFTS BELOW`, 223, 385, '#b9ad94', 8);
  // Ore sorting yard, pixel bins.
  rect(610, 175, 212, 25, '#574434'); rect(618, 157, 200, 40, '#8b6544'); rect(625, 162, 186, 31, '#382f26');
  const bins = state.production.surface.unitsByOre;
  const maxBin = Math.max(1, ...bins.map((item) => item.units));
  for (let index = 0; index < Math.min(5, ORES.length); index += 1) {
    const item = ORES[index];
    const stock = bins.find((row) => row.oreId === item.id)?.units ?? 0;
    const x = 631 + index * 35;
    rect(x, 169, 25, 22, '#292a24');
    rect(x + 2, 189 - Math.min(18, stock / maxBin * 18), 21, Math.min(18, stock / maxBin * 18), item.color);
    rect(x, 191, 25, 3, '#c18d58');
  }
  rect(600, 200, 227, 8, '#d18b50');
  // Loading gantry and single hauler.
  rect(840, 157, 78, 7, '#c1794b'); rect(850, 164, 6, 45, '#c1794b'); rect(906, 164, 6, 45, '#c1794b');
  rect(850, 202, 61, 6, '#deaa69');
  const shipBusy = state.ship.readyAtSecond > state.simSeconds;
  const shipX = shipBusy ? 838 - ((state.simSeconds * 5) % 500) : 863;
  const shipY = shipBusy ? 124 + Math.sin(state.simSeconds / 4) * 3 : 180;
  rect(shipX, shipY, 46, 13, '#6bb9c3'); rect(shipX + 7, shipY - 7, 24, 7, '#95cbd0'); rect(shipX + 14, shipY + 13, 20, 5, '#376f75');
  rect(shipX + 37, shipY + 4, 12, 4, '#d99a59');
  if (shipBusy) { line(shipX - 10, shipY + 8, shipX - 3, shipY + 8, '#e4aa68', 2); pixelText('PAID CARGO IN TRANSIT', 707, 114, '#a9d4d3', 8); }
  pixelText('SHAFT / SURFACE', 27, 247, '#a9997e', 8);
  pixelText('ORE YARD', 650, 151, '#e5c990', 8);
  pixelText('LAUNCH PAD 01', 841, 224, '#d1b38b', 8);
  pixelText(`${fmtUnits(totalRate())} U / MIN`, 28, 271, '#eed6ad', 9);
}

function catchUpBatch() {
  if (catchupRemaining <= 0) {
    catchingUp = false;
    save();
    render();
    toast(catchupKind === 'fast-forward' ? 'Fast-forward complete.' : 'Offline sandbox catch-up complete.', 'success');
    catchupKind = 'offline';
    return;
  }
  try {
    const batch = advanceGame(state, catchupRemaining, 300);
    state = batch.state;
    catchupRemaining = batch.remainingSeconds;
    save();
    render();
    setTimeout(catchUpBatch, 0);
  } catch {
    catchingUp = false;
    recovering = `${catchupKind === 'fast-forward' ? 'Fast-forward' : 'Offline catch-up'} stopped on invalid local state. The latest valid checkpoint is still saved.`;
    save(); render();
  }
}

state = loadSave();
render();
if (recovering) toast(recovering, 'error');
if (catchupRemaining > 0) { catchingUp = true; render(); setTimeout(catchUpBatch, 0); }

let tickAccumulator = 0;
window.setInterval(() => {
  if (catchingUp) return;
  if (paused) { save(); return; }
  tickAccumulator += 1;
  try { state = stepGame(state); }
  catch { paused = true; recovering = 'The local simulation paused after invalid state was detected.'; render(); return; }
  if (tickAccumulator >= 1) {
    tickAccumulator = 0;
    save(); render();
  }
}, 1000);

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'pause-button') { paused = !paused; save(); render(); return; }
  if (button.id === 'launch-button') {
    const loaded = state.ship.cargoUnits >= 1;
    apply(dispatchNow, loaded ? 'Paid cargo left the pad.' : 'Unpaid cargo loading started.'); return;
  }
  if (button.id === 'open-shaft-button') { apply(buyNextShaft, 'Shaft opened.'); return; }
  if (button.id === 'hire-button') { apply((current) => hireWorkers(current, 1), 'Miner hired and assigned.'); return; }
  if (button.id === 'more-upgrades') { moreOperationsOpen = !moreOperationsOpen; render(); return; }
  if (button.id === 'grant-button') {
    const amount = Number($('#grant-amount').value);
    if (!Number.isSafeInteger(amount) || amount < 1) { toast('Enter a positive whole coin amount.', 'error'); return; }
    apply((current) => grantDevCoins(current, amount), 'Local test grant recorded.'); return;
  }
  if (button.id === 'reset-button') { resetPromptOpen = true; $('#reset-confirm').classList.remove('hidden'); button.classList.add('hidden'); return; }
  if (button.id === 'cancel-reset') { resetPromptOpen = false; $('#reset-confirm').classList.add('hidden'); $('#reset-button').classList.remove('hidden'); return; }
  if (button.id === 'confirm-reset' && resetPromptOpen) {
    state = createGameState(); paused = false; catchupRemaining = 0; catchingUp = false; catchupKind = 'offline'; resetPromptOpen = false; recovering = ''; save(); render(); toast('Fresh local mine opened.', 'success'); return;
  }
  if (button.dataset.destination) { apply((current) => selectDestination(current, button.dataset.destination)); return; }
  if (button.dataset.buy) {
    const rawCount = button.dataset.count || '1';
    const count = rawCount === 'max' ? 'max' : Number(rawCount);
    const shaftNumber = Number(button.dataset.shaft || 1);
    apply((current) => purchaseUpgrade(current, button.dataset.buy, { shaftNumber, count }), 'Upgrade purchased.'); return;
  }
  if (button.dataset.forward) {
    const seconds = Number(button.dataset.forward);
    catchupRemaining += seconds;
    catchupKind = 'fast-forward';
    catchingUp = true;
    save(); render(); setTimeout(catchUpBatch, 0);
    return;
  }
  if (button.dataset.recordTab) { selectedRecordTab = button.dataset.recordTab; renderRecords(); }
});

$('#auto-launch').addEventListener('change', (event) => apply((current) => setAutoLaunch(current, event.target.checked)));
document.addEventListener('change', (event) => {
  if (event.target.matches('#grant-amount')) return;
});
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
