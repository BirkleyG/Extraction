import {
  ORES, DESTINATIONS, SAVE_KEY, advanceGame, buyNextShaft, createGameState, currentLiftRate, currentRates,
  fleetShips, grantDevCoins, hireWorkers, nextPadCost, nextShipCost, buyPad, buyShip,
  purchaseUpgrade, selectDestination, setAutoLaunch, dispatchShip, stepGame, upgradeCost, validateGameState, shipmentRows, coinRatePerMinute,
} from './model.js';
import { createLegacyScene } from './scene.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const unitFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const TABS = [['crew', 'Crew'], ['mine', 'Mine'], ['build', 'Build'], ['market', 'Market'], ['records', 'Records'], ['planet', 'Planet']];
const SPECIES = ['Mosskin', 'Cinderfolk', 'Tideborn', 'Glasswing', 'Ironroot', 'Starling'];
const SPECIES_LOOK = [
  { skin: '#c6df9c', accent: '#ffae54', head: 'dome' }, { skin: '#df9b72', accent: '#f4d164', head: 'horn' },
  { skin: '#7fc6ce', accent: '#73e0d0', head: 'visor' }, { skin: '#e5caef', accent: '#c29aff', head: 'antenna' },
  { skin: '#d7aa7c', accent: '#b8d18a', head: 'square' }, { skin: '#efcc75', accent: '#91c8ff', head: 'dome' },
];
let state;
let profile = { guild: 'New Guild', species: 'Mosskin' };
let paused = false;
let pendingCatchupSeconds = 0;
let catchupKind = 'offline';
let catchingUp = false;
let savedAtMs = Date.now();
let selectedTab = 'crew';
let selectedShaft = 1;
let selectedAmount = '1';
let recordsView = 'ledger';
let resetConfirm = false;
let mapView = false;
let inspectSite = null;
let toastTimer;
let scene;
let catchupTimer = null;
let lastError = '';

const fmt = (value) => numberFormat.format(value);
const fmtUnits = (value) => unitFormat.format(value);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const clock = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = seconds % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};
const totalRate = () => currentRates(state).reduce((sum, row) => sum + row.ratePerMinute, 0);
const surfaceTotal = () => state.production.surface.unitsByOre.reduce((sum, row) => sum + row.units, 0);
const oreFor = (id) => ORES.find((ore) => ore.id === id) || ORES[0];
const destinationFor = (id) => DESTINATIONS.find((item) => item.id === id) || DESTINATIONS[0];
const sceneProfile = () => ({ name: profile.guild, species: SPECIES_LOOK[Math.max(0, SPECIES.indexOf(profile.species))] });
const shipStatus = (ship, index) => {
  if (index >= state.padCount) return 'PARKED · NEEDS PAD';
  if (ship.readyAtSecond > state.simSeconds) return `RETURNING · ${clock(ship.readyAtSecond - state.simSeconds)}`;
  if (ship.loading) return `LOADING · ${fmtUnits(ship.cargoUnits)} / ${fmtUnits(ship.capacityUnits)} U`;
  if (ship.cargoUnits > 0) return `${fmtUnits(ship.cargoUnits)} U UNPAID ABOARD`;
  return 'READY AT PAD';
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createGameState();
    const wrapper = JSON.parse(raw);
    if (!wrapper || wrapper.version !== 1 || !Number.isSafeInteger(wrapper.savedAtMs) || wrapper.savedAtMs < 0) throw new Error('Unsupported save');
    savedAtMs = wrapper.savedAtMs;
    profile = { guild: String(wrapper.profile?.guild || 'New Guild').slice(0, 32), species: SPECIES.includes(wrapper.profile?.species) ? wrapper.profile.species : 'Mosskin' };
    const loaded = validateGameState(wrapper.state);
    if (wrapper.pendingCatchupSeconds !== undefined && (!Number.isSafeInteger(wrapper.pendingCatchupSeconds) || wrapper.pendingCatchupSeconds < 0)) throw new Error('Invalid pending catch-up');
    pendingCatchupSeconds = wrapper.pendingCatchupSeconds || 0;
    if (wrapper.catchupKind === 'fast-forward' || wrapper.catchupKind === 'offline') catchupKind = wrapper.catchupKind;
    paused = wrapper.paused === true;
    const elapsed = Math.floor((Date.now() - savedAtMs) / 1000);
    if (!paused && elapsed > 0 && Number.isSafeInteger(elapsed)) pendingCatchupSeconds += elapsed;
    return loaded;
  } catch {
    lastError = 'The local test save could not be read. A fresh mine was opened; the prototype save remains untouched.';
    profile = { guild: 'New Guild', species: 'Mosskin' };
    pendingCatchupSeconds = 0;
    paused = false;
    return createGameState();
  }
}
function save() {
  try {
    savedAtMs = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAtMs, pendingCatchupSeconds, catchupKind, paused, state, profile }));
  } catch {
    lastError = 'Browser storage is unavailable. This session can continue, but changes may not survive reload.';
  }
}
function toast(message, tone = '') {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  element.className = `toast ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 2600);
}
function messageFor(error) {
  const messages = {
    INSUFFICIENT_FUNDS: 'Not enough coin for that purchase.', NO_WORKER_CAPACITY: 'Open habitat or shaft bunks before hiring more miners.',
    AT_CAP: 'That improvement is at its cap.', SHIP_BUSY: 'That hauler is still returning to the pad.',
    NOT_ENOUGH_STOCK: 'The yard needs ore before loading can begin.', BUYER_FULL: 'That buyer has no free receiving capacity.',
    BUYER_OUT_OF_FUNDS: 'That buyer has spent its finite fixture budget.', INVALID_PAYMENT: 'The local transaction could not be balanced.',
    SHIP_PARKED: 'Open another launch pad before sending this hauler.',
  };
  return messages[error?.code] || error?.message || 'The action could not be completed.';
}
function apply(action, success = '') {
  if (catchingUp) return toast('Let the current time update finish before changing the colony.', 'error');
  try {
    state = validateGameState(action(state));
    save(); render();
    if (success) toast(success, 'success');
  } catch (error) { toast(messageFor(error), 'error'); }
}
function amountBar() {
  return `<div class="amt bulk-row" aria-label="Purchase amount">${[['1', '1'], ['10', '10'], ['100', '100'], ['max', 'Max']].map(([v, label]) => `<button type="button" data-act="amount:${v}" aria-pressed="${selectedAmount === v}">${label}</button>`).join('')}</div>`;
}
function costForCount(type, shaft = 1, count = selectedAmount) {
  if (count === 'max') return 'Max affordable';
  let total = 0;
  let cursor = { ...state, upgrades: { ...state.upgrades }, production: { ...state.production, lift: { ...state.production.lift }, surface: { ...state.production.surface }, shafts: state.production.shafts.map((item) => ({ ...item })) } };
  for (let i = 0; i < Number(count); i += 1) {
    const cost = upgradeCost(cursor, type, shaft);
    if (cost === null) return i ? `${fmt(total)} ◉ · capped` : 'CAPPED';
    total += cost;
    if (type === 'dig') cursor.production.shafts[shaft - 1].digLevel += 1;
    else if (type === 'cart') cursor.production.shafts[shaft - 1].cartLevel += 1;
    else if (type === 'bunkhouse') cursor.production.shafts[shaft - 1].bunkhouseLevel += 1;
    else if (type === 'lift') cursor.production.lift.level += 1;
    else cursor.upgrades[type] += 1;
  }
  return `${fmt(total)} ◉`;
}
function upgradeRow(type, title, detail, shaft = 1, icon = '↑') {
  const cost = upgradeCost(state, type, shaft);
  const count = selectedAmount;
  const price = costForCount(type, shaft, count);
  const level = type === 'dig' ? state.production.shafts[shaft - 1].digLevel
    : type === 'cart' ? state.production.shafts[shaft - 1].cartLevel
      : type === 'bunkhouse' ? state.production.shafts[shaft - 1].bunkhouseLevel
        : type === 'lift' ? state.production.lift.level : state.upgrades[type];
  return `<div class="row"><div><div class="t">${icon} ${safe(title)} <span class="own">LV ${level}</span></div><div class="d">${safe(detail)} · Next ${cost === null ? 'at cap' : `${fmt(cost)} ◉`}</div></div><button class="buy" type="button" data-act="buy:${type}" data-shaft="${shaft}" data-count="${count}" ${!cost || catchingUp ? 'disabled' : ''}>${price}</button></div>`;
}
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([id, label]) => `<button class="tab" role="tab" type="button" aria-selected="${selectedTab === id}" data-act="tab:${id}">${label}</button>`).join('');
}
function renderMetrics() {
  const ships = fleetShips(state);
  $('#hCoin').textContent = fmt(state.coins);
  $('#hRate').textContent = `${fmtUnits(coinRatePerMinute(state))} / min`;
  $('#hShips').textContent = `${Math.min(ships.length, state.padCount)} / ${ships.length} active`;
  $('#hGuild').textContent = (profile.guild || 'New Guild').slice(0, 10).toUpperCase();
  $('#hOre').textContent = `${fmtUnits(surfaceTotal())} u`;
  $('#hTimer').textContent = clock(state.simSeconds);
  $('#stageTag').innerHTML = `Local colony · <b>${safe(profile.guild || 'New Guild')}</b> · single-player test`;
  $('#mapBtnLbl').textContent = mapView ? 'MINE' : 'MAP';
  $('#run-state').textContent = catchingUp ? 'CATCHING UP' : paused ? 'MINE PAUSED' : 'MINE RUNNING';
  $('#run-state').setAttribute('data-state', paused ? 'paused' : catchingUp ? 'catchup' : 'running');
  const catchup = $('#catchup-status');
  if (catchup) catchup.textContent = `${fmt(pendingCatchupSeconds)} seconds remaining`;
  $('#ticker').innerHTML = `<div>${safe(state.notice || 'The colony is ready for its next order.')} <span class="catchup-note">${catchingUp ? `Updating ${fmt(pendingCatchupSeconds)} sec…` : ''}</span></div><div>Ore is paid when a hauler departs · ${fmtUnits(totalRate())} units/min current production · buyer funds are finite.</div>`;
  if (scene) scene.setState(state, sceneProfile());
}
function renderCrew() {
  const capacity = 10 + 5 * state.upgrades.habitat;
  const assigned = state.production.shafts.reduce((sum, shaft) => sum + shaft.workersAssigned, 0);
  return `<h2>Colony crew</h2><p class="lede">Miners are assigned automatically to the shaft with the strongest visible expected sale value.</p>${amountBar()}
    <div class="row"><div><div class="t">Miners <span class="own">${state.workersHired}</span></div><div class="d">${assigned} assigned · crew capacity ${capacity}</div></div><button class="buy" type="button" data-act="hire" data-count="${selectedAmount}">Hire ${selectedAmount === 'max' ? 'max' : `×${selectedAmount}`} · ${selectedAmount === 'max' ? 'Max affordable' : `${fmt(Number(selectedAmount) * 20)} ◉`}</button></div>
    ${upgradeRow('habitat', 'Habitat', 'Adds 5 crew spaces', 1, '⌂')}
    <h3>Shaft bunks</h3><div class="rows">${state.production.shafts.map((shaft) => `<div class="row"><div><div class="t">Shaft ${String(shaft.shaftNumber).padStart(2, '0')} · ${oreFor(shaft.oreId).name}</div><div class="d">${shaft.workersAssigned} assigned · ${10 + 5 * shaft.bunkhouseLevel} bunks</div></div><button class="buy" type="button" data-act="buy:bunkhouse" data-shaft="${shaft.shaftNumber}" data-count="${selectedAmount}">${costForCount('bunkhouse', shaft.shaftNumber)} · bunkhouse</button></div>`).join('')}</div>`;
}
function renderMine() {
  const rates = currentRates(state);
  const maxShaft = Math.max(1, ...state.production.shafts.map((shaft) => shaft.shaftNumber));
  return `<h2>Mine</h2><p class="lede">Tune dig speed and ore carts. Lift throughput can become the bottleneck as the mine deepens.</p>${amountBar()}<div class="rows">${state.production.shafts.map((shaft) => {
    const rate = rates.find((item) => item.shaftNumber === shaft.shaftNumber);
    const selected = selectedShaft === shaft.shaftNumber;
    return `<div class="shaft" data-shaft-row="${shaft.shaftNumber}"><div class="shead"><b>SHAFT ${String(shaft.shaftNumber).padStart(2, '0')}</b><span class="chip"><i style="background:${oreFor(shaft.oreId).color}"></i>${oreFor(shaft.oreId).name}</span>${selected ? '<span class="pill ok">INSPECTED</span>' : ''}</div><div class="d">${shaft.workersAssigned} miners · dig LV ${shaft.digLevel} · cart LV ${shaft.cartLevel} · ${fmtUnits(rate.ratePerMinute)} u/min · buffer ${Math.round(rate.bufferPercent * 100)}%</div><div class="ups"><div class="up"><small>DIG RATE</small><b>LV ${shaft.digLevel}</b><div class="d">More ore from this line</div><button class="buy" type="button" data-act="buy:dig" data-shaft="${shaft.shaftNumber}" data-count="${selectedAmount}">${costForCount('dig', shaft.shaftNumber)}</button></div><div class="up"><small>ORE CART</small><b>LV ${shaft.cartLevel}</b><div class="d">Improves line handling</div><button class="buy" type="button" data-act="buy:cart" data-shaft="${shaft.shaftNumber}" data-count="${selectedAmount}">${costForCount('cart', shaft.shaftNumber)}</button></div><div class="up"><small>WORKERS</small><b>${shaft.workersAssigned}</b><div class="d">Bunks managed in Crew</div><button class="buy ghost" type="button" data-act="inspect:shaft" data-shaft="${shaft.shaftNumber}">Inspect</button></div></div></div>`;
  }).join('')}</div><h3>Mine works</h3><div class="rows">${upgradeRow('lift', 'Lift throughput', `Current ${fmtUnits(currentLiftRate(state))} units/min`, 1, '⇧')}${maxShaft < 30 ? `<div class="row"><div><div class="t">Open shaft ${String(maxShaft + 1).padStart(2, '0')}</div><div class="d">Unlock another ore line · up to 30 shafts</div></div><button class="buy" type="button" data-act="shaft:buy" data-count="${selectedAmount}">${selectedAmount === 'max' ? 'Max' : `${selectedAmount} shaft · ${fmt(Math.floor(120 * 2.4 ** maxShaft))} ◉`}</button></div>` : '<p class="note">All 30 shaft lines are open.</p>'}</div>`;
}
function renderBuild() {
  const ships = fleetShips(state);
  const shipCost = nextShipCost(state);
  const padCost = nextPadCost(state);
  return `<h2>Build</h2><p class="lede">Expand yard capacity and the lift, then add haulers and launch pads. Extra ships wait until a pad opens.</p>${amountBar()}
    <div class="rows">${upgradeRow('yard', 'Ore yard', `${fmtUnits(state.production.surface.capacityUnits)} unit surface capacity`, 1, '▤')}${upgradeRow('shipCapacity', 'Hauler capacity', `${fmtUnits(ships[0].capacityUnits)} units per ship`, 1, '□')}${upgradeRow('shipSpeed', 'Hauler speed', `${ships[0].speedPerMinute.toFixed(2)} AU/min fleet-wide`, 1, '↗')}${upgradeRow('loading', 'Loading rate', `${fmtUnits(ships[0].loadingUnitsPerMinute)} units/min fleet-wide`, 1, '⇧')}</div>
    <h3>Fleet and pads</h3><div class="rows"><div class="row"><div><div class="t">Buy hauler <span class="own">${ships.length} / 12</span></div><div class="d">${Math.min(ships.length, state.padCount)} active · ${Math.max(0, ships.length - state.padCount)} parked · extra craft need a pad</div></div><button class="buy" id="buy-ship" type="button" data-act="ship:buy" ${shipCost === null ? 'disabled' : ''}>${shipCost === null ? 'FLEET CAP' : `${fmt(shipCost)} ◉`}</button></div>
    <div class="row"><div><div class="t">Open launch pad <span class="own">${state.padCount} / 12</span></div><div class="d">One active hauler per pad</div></div><button class="buy" id="buy-pad" type="button" data-act="pad:buy" ${padCost === null ? 'disabled' : ''}>${padCost === null ? 'PAD CAP' : `${fmt(padCost)} ◉`}</button></div></div>`;
}
function renderMarket() {
  const ships = fleetShips(state);
  const activeShips = Math.min(state.padCount, ships.length);
  const offers = DESTINATIONS.map((destination) => {
    const buyer = state.buyers.find((item) => item.id === destination.id);
    const selected = state.selectedDestinationId === destination.id;
    return `<button type="button" class="row" data-act="destination:${destination.id}" aria-pressed="${selected}"><span><span class="t">${safe(destination.name)} ${selected ? '<span class="pill ok">SELECTED</span>' : ''}</span><span class="d">${safe(destination.detail)} · ${destination.distance} AU · ${fmt(buyer.funds)} ◉ funds · ${fmtUnits(Math.max(0, buyer.capacityUnits - buyer.inventoryUnits - buyer.reservedUnits))} u free</span></span><span class="e">${fmt(destination.basePrice)} ◉ / ferrite</span></button>`;
  }).join('');
  return `<h2>Market</h2><p class="lede">Buyers have finite funds and receiving space. The sale is recorded when the loaded ship departs.</p><label class="toggle"><input type="checkbox" data-act="auto" ${state.autoLaunch ? 'checked' : ''}><span>Auto-load and launch first partial cargo</span></label><h3>Buyer board</h3><div class="rows">${offers}</div><h3>Haulers · ${activeShips} active of ${ships.length}</h3>${ships.map((ship, index) => {
    const busy = ship.readyAtSecond > state.simSeconds;
    const parked = index >= state.padCount;
    const actionLabel = parked ? 'Needs a pad' : busy ? `Returning · ${clock(ship.readyAtSecond - state.simSeconds)}` : ship.cargoUnits > 0 ? `Launch ${fmtUnits(ship.cargoUnits)} u` : ship.loading ? 'Loading cargo…' : 'Load cargo';
    return `<div class="shipcard"><h4>HAULER ${String(index + 1).padStart(2, '0')} · PAD ${parked ? 'NONE' : String(index + 1).padStart(2, '0')}</h4><div class="d">${shipStatus(ship, index)} · ${fmtUnits(ship.capacityUnits)} u capacity · ${ship.speedPerMinute.toFixed(2)} AU/min · ${fmtUnits(ship.loadingUnitsPerMinute)} u/min loading</div><div class="btnrow"><button type="button" class="buy sm ${ship.cargoUnits > 0 ? 'ok' : ''}" data-act="ship:dispatch" data-ship="${index}" ${busy || parked ? 'disabled' : ''}>${actionLabel}</button></div></div>`;
  }).join('')}`;
}
function renderRecords() {
  if (recordsView === 'ledger') {
    const rows = state.ledger.slice().reverse().slice(0, 60);
    return `<h2>Records</h2><p class="lede">The local paper trail for colony income and purchases.</p><div class="chips">${[['ledger','Ledger'],['shipments','Shipments'],['events','Events']].map(([value,label])=>`<button class="chip" type="button" data-act="records:${value}" aria-pressed="${recordsView===value}">${label}</button>`).join('')}</div><h3>Ledger · ${state.ledger.length} entries</h3><div class="feed">${rows.length ? rows.map((row) => `<div><time>${clock(row.atSecond)}</time><b>${safe(row.description)}</b><span class="e">${row.ownerDelta >= 0 ? '+' : '−'}${fmt(row.amount)} ◉</span></div>`).join('') : '<p class="lede">No entries yet.</p>'}</div>`;
  }
  if (recordsView === 'shipments') {
    const rows = shipmentRows(state).slice(0, 60);
    return `<h2>Records</h2><div class="chips">${[['ledger','Ledger'],['shipments','Shipments'],['events','Events']].map(([value,label])=>`<button class="chip" type="button" data-act="records:${value}" aria-pressed="${recordsView===value}">${label}</button>`).join('')}</div><h3>Shipments · ${state.shipments.length}</h3><div class="feed">${rows.length ? rows.map((row) => `<div><time>${clock(row.departureAtSecond)}</time><b>${fmtUnits(row.units)} ${safe(oreFor(row.oreId).name)} → ${safe(destinationFor(row.destinationId).name)}</b><span class="e">+${fmt(row.payment)} ◉ · ${safe(row.status)}</span></div>`).join('') : '<p class="lede">No haulers have departed yet.</p>'}</div>`;
  }
  const logs = state.log.slice().reverse().slice(0, 60);
  return `<h2>Records</h2><div class="chips">${[['ledger','Ledger'],['shipments','Shipments'],['events','Events']].map(([value,label])=>`<button class="chip" type="button" data-act="records:${value}" aria-pressed="${recordsView===value}">${label}</button>`).join('')}</div><h3>Colony events</h3><div class="feed">${logs.length ? logs.map((row) => `<div><time>${clock(row.atSecond)}</time>${safe(row.message)}</div>`).join('') : '<p class="lede">Nothing recorded yet.</p>'}</div>`;
}
function renderPlanet() {
  const destination = destinationFor(state.selectedDestinationId);
  return `<h2>Planet</h2><p class="lede">Use the colony map to pan across the surface and inspect landing sites. Mining, offers, and cargo departure remain visible in the desk tabs.</p><div class="btnrow"><button class="buy" type="button" data-act="view:map">${mapView ? 'Planet map shown' : 'Open planet map'}</button><button class="buy ghost" type="button" data-act="view:side">Return to mine cutaway</button></div>${inspectSite ? `<div class="mapcard-inline"><h3>Inspected land</h3><p>Region ${safe(inspectSite.regionId ?? 'surface')} · map position ${Math.round(inspectSite.x || 0)}, ${Math.round(inspectSite.y || 0)}</p><p class="lede">This local map inspection does not reserve or claim land.</p></div>` : ''}<h3>Current sale route</h3><div class="row"><div><div class="t">${safe(destination.name)}</div><div class="d">${safe(destination.detail)} · ${destination.distance} AU · payment at departure</div></div><button class="buy ghost" type="button" data-act="tab:market">Market</button></div><h3>Colony map controls</h3><p class="lede">Drag to pan · scroll or pinch to zoom · use the map thumbnail to switch views.</p>`;
}
function renderTab() {
  const body = $('#tabbody');
  const renderers = { crew: renderCrew, mine: renderMine, build: renderBuild, market: renderMarket, records: renderRecords, planet: renderPlanet };
  if (!renderers[selectedTab]) selectedTab = 'crew';
  body.innerHTML = renderers[selectedTab]();
  $$('.tab', $('#tabs')).forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.act === `tab:${selectedTab}`)));
}
function render() {
  renderTabs();
  renderMetrics();
  const focusedInput = $('#tabbody').contains(document.activeElement) && document.activeElement.matches('input,select,textarea');
  if (!focusedInput) renderTab();
}
function renderOverlay() {
  const overlay = $('#ov');
  const body = $('#ovBody');
  if (!overlay.dataset.kind) { overlay.hidden = true; return; }
  overlay.hidden = false;
  if (overlay.dataset.kind === 'settings') {
    body.className = 'sheet';
    body.innerHTML = `<button class="buy ghost close" type="button" data-act="close">Close</button><h1>Settings</h1><p class="lede">Local save controls and simulation time.</p><div class="chips"><span class="chip"><i style="background:var(--ok)"></i>${paused ? 'Paused' : catchingUp ? 'Catching up' : 'Running'}</span><span class="chip">Saved in this browser</span></div>${lastError ? `<p class="note">${safe(lastError)}</p>` : ''}${catchingUp ? `<p class="note" id="catchup-status">${fmt(pendingCatchupSeconds)} seconds remaining</p>` : ''}<div class="btnrow"><button class="buy ${paused ? 'ok' : ''}" type="button" data-act="pause">${paused ? 'Resume mine' : 'Pause mine'}</button><button class="buy ghost" type="button" data-forward="60">Fast-forward 1 min</button><button class="buy ghost" type="button" data-forward="600">10 min</button><button class="buy ghost" type="button" data-forward="3600">1 hour</button></div><h3>Local test grant</h3><label class="f">Coin amount<input type="text" id="grant-amount" value="10000" inputmode="numeric"></label><button class="buy" type="button" data-act="grant">Add test coins to ledger</button><h3>Reset local save</h3>${resetConfirm ? `<p class="note">This replaces this browser's local playtest save.</p><div class="btnrow"><button class="buy danger" type="button" data-act="reset:confirm">Reset mine</button><button class="buy ghost" type="button" data-act="reset:cancel">Keep playing</button></div>` : `<button class="buy danger" type="button" data-act="reset:prompt">Reset local save…</button>`}<p class="lede">The original prototype is preserved at <a href="../prototype/">Legacy prototype ↗</a>. This playtest runs locally; multiplayer is not connected.</p>`;
  } else {
    body.className = 'sheet';
    body.innerHTML = `<button class="buy ghost close" type="button" data-act="close">Close</button><h1>Guild profile</h1><p class="lede">Change the colony name and portrait. These choices are cosmetic and saved with this local playtest.</p><label class="f">Guild name<input type="text" id="guild-name" maxlength="32" value="${safe(profile.guild)}"></label><h3>Portrait</h3><div class="profile-portraits">${SPECIES.map((species, index) => `<button type="button" data-act="species:${species}" aria-pressed="${profile.species === species}"><b>${['♧','♨','≈','✧','◆','☼'][index]}</b><small>${species}</small></button>`).join('')}</div><p class="lede">The colony is already landed. You can start playing immediately.</p><div class="btnrow"><button class="buy" type="button" data-act="close">Return to colony</button></div>`;
  }
}
function openOverlay(kind) { $('#ov').dataset.kind = kind; renderOverlay(); }
function closeOverlay() { delete $('#ov').dataset.kind; resetConfirm = false; renderOverlay(); }
function startCatchup(seconds, kind = 'fast-forward') {
  if (!Number.isSafeInteger(seconds) || seconds < 1) return;
  pendingCatchupSeconds += seconds;
  catchupKind = kind;
  catchingUp = true;
  save(); render();
  scheduleCatchup();
}
function scheduleCatchup() {
  if (catchupTimer !== null || paused || pendingCatchupSeconds <= 0) return;
  catchupTimer = setTimeout(catchupBatch, 0);
}
function catchupBatch() {
  catchupTimer = null;
  if (paused || pendingCatchupSeconds <= 0) {
    catchingUp = pendingCatchupSeconds > 0;
    save(); render();
    if (!pendingCatchupSeconds) toast(catchupKind === 'fast-forward' ? 'Fast-forward complete.' : 'Offline sandbox catch-up complete.', 'success');
    return;
  }
  try {
    const batch = advanceGame(state, pendingCatchupSeconds, 300);
    state = batch.state;
    pendingCatchupSeconds = batch.remainingSeconds;
    catchingUp = pendingCatchupSeconds > 0;
    save(); render();
    if (catchingUp) scheduleCatchup();
    else {
      catchupKind = 'offline';
      toast('Time update complete.', 'success');
    }
  } catch {
    catchingUp = false;
    lastError = 'Time update stopped because the local save failed validation. The latest valid checkpoint was kept.';
    save(); render();
  }
}

function selectTab(tab) {
  if (!TABS.some(([id]) => id === tab)) return;
  selectedTab = tab;
  $('#tabbody').scrollTop = 0;
  renderTab();
}
function handleInspect(hit) {
  if (!hit) return;
  if (hit.kind === 'shaft') {
    selectedShaft = hit.shaftNumber;
    selectTab('mine');
    toast(`Shaft ${String(selectedShaft).padStart(2, '0')} inspected.`);
  } else if (hit.kind === 'section' && hit.tab) selectTab(hit.tab);
  else if (hit.kind === 'site') {
    inspectSite = hit;
    mapView = true;
    scene?.setView('map');
    selectTab('planet');
  }
}
async function boot() {
  state = loadSave();
  try {
    scene = createLegacyScene({ canvas: $('#cv'), miniCanvas: $('#mini'), onInspect: handleInspect, onError: (error) => { lastError = `Colony view issue: ${String(error?.message || error)}`; } });
  } catch (error) {
    $('#stageTag').textContent = `The colony scene could not start: ${String(error.message || error)}`;
  }
  render();
  if (lastError) toast(lastError, 'error');
  if (pendingCatchupSeconds > 0) { catchingUp = true; render(); scheduleCatchup(); }

  setInterval(() => {
    if (catchingUp || paused) { if (paused) save(); return; }
    try { state = stepGame(state); save(); render(); }
    catch { paused = true; lastError = 'The local simulation paused after invalid state was detected.'; save(); render(); }
  }, 1000);

  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { save(); return; }
    if (!paused) {
      const elapsed = Math.floor((Date.now() - savedAtMs) / 1000);
      if (elapsed > 1 && Number.isSafeInteger(elapsed)) startCatchup(elapsed, 'offline');
    }
  });
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const act = button.dataset.act || '';
  if (act === 'settings') { openOverlay('settings'); return; }
  if (act === 'tree') { openOverlay('profile'); return; }
  if (act === 'close') { closeOverlay(); return; }
  if (act === 'pause') {
    paused = !paused;
    if (!paused && pendingCatchupSeconds > 0) { catchingUp = true; scheduleCatchup(); }
    save(); render(); renderOverlay(); return;
  }
  if (button.dataset.forward) { startCatchup(Number(button.dataset.forward), 'fast-forward'); return; }
  if (act === 'panel') {
    $('#layout').classList.toggle('wide');
    $('#panelBtn').textContent = $('#layout').classList.contains('wide') ? '⟨' : '⟩';
    return;
  }
  if (act === 'togglemap' || act === 'view:map') { mapView = true; scene?.setView('map'); if (act === 'view:map') selectTab('planet'); render(); return; }
  if (act === 'view:side') { mapView = false; scene?.setView('side'); render(); return; }
  if (act.startsWith('zoom:')) { scene?.zoom(act.slice(5)); return; }
  if (act.startsWith('tab:')) { selectTab(act.slice(4)); return; }
  if (act.startsWith('amount:')) { selectedAmount = act.slice(7); renderTab(); return; }
  if (act.startsWith('records:')) { recordsView = act.slice(8); renderTab(); return; }
  if (act.startsWith('species:')) {
    profile.species = act.slice(8); save(); renderOverlay(); if (scene) scene.setState(state, sceneProfile()); return;
  }
  if (act === 'reset:prompt') { resetConfirm = true; renderOverlay(); return; }
  if (act === 'reset:cancel') { resetConfirm = false; renderOverlay(); return; }
  if (act === 'reset:confirm') {
    state = createGameState(); profile = { guild: 'New Guild', species: 'Mosskin' }; paused = false; pendingCatchupSeconds = 0; catchingUp = false; catchupKind = 'offline'; resetConfirm = false; lastError = ''; save(); render(); renderOverlay(); toast('Fresh local mine opened.', 'success'); return;
  }
  if (act === 'grant') {
    const raw = $('#grant-amount')?.value || '';
    const amount = Number(raw.replaceAll(',', ''));
    if (!Number.isSafeInteger(amount) || amount < 1) { toast('Enter a positive whole coin amount.', 'error'); return; }
    apply((current) => grantDevCoins(current, amount), 'Local test grant recorded.'); renderOverlay(); return;
  }
  if (act.startsWith('buy:')) {
    const type = act.slice(4); const count = button.dataset.count === 'max' ? 'max' : Number(button.dataset.count || 1); const shaftNumber = Number(button.dataset.shaft || 1);
    apply((current) => purchaseUpgrade(current, type, { shaftNumber, count }), 'Upgrade purchased.'); return;
  }
  if (act === 'hire') {
    const count = button.dataset.count === 'max' ? 'max' : Number(button.dataset.count || 1);
    apply((current) => hireWorkers(current, count), 'Miners hired and assigned.'); return;
  }
  if (act === 'shaft:buy') {
    const limit = button.dataset.count === 'max' ? 30 : Number(button.dataset.count || 1);
    apply((current) => { let next = current; for (let i = 0; i < limit && next.production.shafts.length < 30; i += 1) { const cost = Math.floor(120 * 2.4 ** next.production.shafts.length + 0.5); if (next.coins < cost) break; next = buyNextShaft(next); } if (next === current) throw Object.assign(new Error('Not enough coin for another shaft.'), { code: 'INSUFFICIENT_FUNDS' }); return next; }, 'Shaft construction complete.'); return;
  }
  if (act === 'ship:buy') { apply(buyShip, 'Hauler added to the fleet.'); return; }
  if (act === 'pad:buy') { apply(buyPad, 'Launch pad opened.'); return; }
  if (act === 'ship:dispatch') {
    const index = Number(button.dataset.ship || 0);
    const ship = fleetShips(state)[index];
    const loaded = ship?.cargoUnits > 0;
    apply((current) => dispatchShip(current, index), loaded ? 'Cargo departed; payment recorded.' : 'Unpaid cargo loading started.'); return;
  }
  if (act.startsWith('destination:')) { apply((current) => selectDestination(current, act.slice(12))); return; }
  if (act === 'inspect:shaft') { selectedShaft = Number(button.dataset.shaft || 1); renderTab(); scene?.focus('mine'); return; }
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-act="auto"]')) apply((current) => setAutoLaunch(current, event.target.checked));
  if (event.target.id === 'guild-name') {
    profile.guild = event.target.value.trim().slice(0, 32) || 'New Guild';
    save(); renderMetrics(); scene?.setState(state, sceneProfile());
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'guild-name') {
    profile.guild = event.target.value.slice(0, 32) || 'New Guild';
    $('#hGuild').textContent = profile.guild.slice(0, 10).toUpperCase();
    save(); scene?.setState(state, sceneProfile());
  }
});

boot();
