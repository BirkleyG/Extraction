// Online mode for the pixel game: Firebase sign-in, the invite/join step, and an adapter that turns the server's
// filtered view of YOUR mine into the state shape the renderer and panels already use. The server is the only
// authority: the browser predicts the picture of the mine between polls and sends intents as commands.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { API_BASE, WORLD_ID } from '../online/config.js';
import { SAVE_VERSION, ORES, DESTINATIONS, validateGameState } from './model.js';
import { withdrawSurfaceUnits } from '../backend/src/production.js';
import { planetFromSeed } from './planet.js';

const params = new URLSearchParams(location.search);
const API = (params.get('api') || API_BASE || '').replace(/\/$/, '');
const WORLD = params.get('world') || WORLD_ID;
const MODE_KEY = 'extraction_mode';
export const POLL_MS = 15_000;

export function wantsOnline() {
  if (params.get('mode') === 'online') { try { localStorage.setItem(MODE_KEY, 'online'); } catch { /* ignore */ } return true; }
  if (params.get('mode') === 'offline') { try { localStorage.setItem(MODE_KEY, 'offline'); } catch { /* ignore */ } return false; }
  try { return localStorage.getItem(MODE_KEY) === 'online'; } catch { return false; }
}
export function setMode(mode) { try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ } const u = new URL(location.href); u.searchParams.delete('mode'); location.href = u.toString(); }

// ---- server ore ids -> the renderer's ore ids (same two-common / four-rare / one-mythic layout) ----
const ORE_MAP = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`ore-${i + 1}`, ORES[i].id]));
const mapOre = (id) => ORE_MAP[id] ?? id;
const mapRows = (rows) => (rows ?? []).map((r) => ({ ...r, oreId: mapOre(r.oreId) }));
const UPGRADE_LINE = { yard: 'surfaceStorage', loading: 'padLoading', habitat: 'habitat', shipCapacity: 'shipCapacity', shipSpeed: 'shipSpeed' };
const SHAFT_LINE = { digLevel: 'dig', cartLevel: 'carts', bunkhouseLevel: 'bunkhouse' };

let auth = null; let user = null; let version = 0; let chain = Promise.resolve();
const memo = { log: [], mined: {}, view: null };

class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
async function call(path, body) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${API}/v1/worlds/${encodeURIComponent(WORLD)}/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error || 'ERROR');
  return json;
}

// ---- adapter: server view -> renderer state ----
const monthStartSec = (monthId) => { const [y, m] = monthId.split('-').map(Number); return Date.UTC(y, m - 1, 1) / 1000; };
const shipCapacityUnits = (level) => Math.floor(150 * (1 + 0.04 * level));

export function adapt(view) {
  const sc = view.scene;
  const base = monthStartSec(view.monthId);
  const nowRel = Math.max(0, sc.nowSec - base);
  const prod = JSON.parse(JSON.stringify(sc.production));
  for (const s of prod.shafts) s.oreId = mapOre(s.oreId);
  for (const key of ['unitsByOre']) prod.surface[key] = mapRows(prod.surface[key]);
  prod.initialUnitsByOre = mapRows(prod.initialUnitsByOre);
  prod.cumulativeMinedByOre = mapRows(prod.cumulativeMinedByOre);
  prod.externalTransfersByOre = mapRows(prod.externalTransfersByOre);
  prod.syntheticDownstreamDrain.drainedByOre = mapRows(prod.syntheticDownstreamDrain.drainedByOre);
  const commonOreId = mapOre(sc.commonOreId);
  const ready = view.ship.readyInSeconds <= 0;
  const capacity = shipCapacityUnits(sc.levels.shipCapacity);
  // The hold is whatever the hauler would carry right now; show it aboard (crates on the pad) instead of in the yard.
  const stock = prod.surface.unitsByOre.find((r) => r.oreId === commonOreId)?.units ?? 0;
  const hold = ready ? Math.min(capacity, Math.floor(stock + 1e-6)) : 0;
  let production = prod;
  if (hold >= 1) production = withdrawSurfaceUnits(prod, commonOreId, hold);
  const planet = planetFromSeed(sc.cosmeticSeed);
  const region = planet.regions[sc.slot % planet.regions.length];
  // tunnel-face distance is cosmetic: spread what has been dug over the shafts by their output, never going backwards
  const totalMined = (prod.cumulativeMinedByOre.reduce((a, r) => a + r.units, 0)) || 0;
  const weight = prod.shafts.map((s) => s.workersAssigned * 2.2 ** (s.shaftNumber - 1) * (1 + 0.04 * s.digLevel));
  const wsum = weight.reduce((a, b) => a + b, 0) || 1;
  prod.shafts.forEach((s, i) => { memo.mined[s.shaftNumber] = Math.max(memo.mined[s.shaftNumber] ?? 0, totalMined * weight[i] / wsum); });
  const policy = sc.policy;
  const shipments = sc.shipments.map((x) => ({
    id: x.id, oreId: mapOre(x.oreId), units: x.units, unitPrice: x.unitPrice, payment: x.payment, destinationId: x.destinationId,
    departureAtSecond: Math.max(0, x.departureSecond - base), arrivalAtSecond: Math.max(0, x.arrivalSecond - base), shipReadyAtSecond: Math.max(0, x.departureSecond - base) + x.tripSeconds,
    tripSeconds: x.tripSeconds, state: 'PAID_AT_DEPARTURE',
  }));
  const state = {
    schemaVersion: SAVE_VERSION, remote: true, simSeconds: nowRel, coins: view.coin.spendable, sourceGrants: 0, totalExternalEarnings: view.earnings.grossExternal,
    workersHired: sc.workersHired,
    upgrades: { habitat: sc.levels.habitat, yard: sc.levels.surfaceStorage, shipCapacity: sc.levels.shipCapacity, shipSpeed: sc.levels.shipSpeed, loading: sc.levels.padLoading },
    production,
    ship: { capacityUnits: capacity, speedPerMinute: 0.5 * (1 + 0.04 * sc.levels.shipSpeed), loadingUnitsPerMinute: 60 * (1 + 0.04 * sc.levels.padLoading), readyAtSecond: nowRel + Math.max(0, view.ship.readyInSeconds), loading: false, cargoOreId: hold >= 1 ? commonOreId : null, cargoUnits: hold >= 1 ? hold : 0 },
    site: { seed: `${sc.cosmeticSeed}|${sc.slot}`, regionId: region.id, commonOreId, rareOreIds: [], mythic: false },
    veins: [], shaftMined: { ...memo.mined },
    selectedDestinationId: policy.destinationId && DESTINATIONS.some((d) => d.id === policy.destinationId) ? policy.destinationId : DESTINATIONS[0].id,
    autoLaunch: policy.auto, shipments, shipmentStatusById: Object.fromEntries(shipments.map((x) => [x.id, x.arrivalAtSecond <= nowRel ? 'DELIVERED' : 'IN_TRANSIT'])),
    ledger: [], nextRecordId: 1, log: memo.log.slice(-80),
    online: { version: view.version, monthId: view.monthId, monthEndsAtMs: view.monthEndsAtMs, serverNowMs: view.serverNowMs, receivedAtMs: Date.now(), autoInSeconds: view.ship.autoInSeconds, email: user?.email ?? user?.displayName ?? '', pinned: policy.destinationId },
    notice: '',
  };
  return { state: validateGameState(state), planet, regionId: region.id, autoTakeoffs: view.autoTakeoffs ?? 0 };
}

export function note(message, atSecond) { memo.log.push({ atSecond, message, type: 'event' }); if (memo.log.length > 200) memo.log.splice(0, memo.log.length - 200); }

// ---- commands: derive what the player did by comparing the optimistic state with the one before ----
const modeFor = (n) => (n === 1 || n === 10 || n === 100 ? n : 'max');
export function commandsFor(prev, next) {
  const out = [];
  if (next.shipments.length > prev.shipments.length) out.push(['dispatch', { destinationId: next.shipments.at(-1).destinationId }]);
  for (const [key, line] of Object.entries(UPGRADE_LINE)) { const d = next.upgrades[key] - prev.upgrades[key]; if (d > 0) out.push(['buyUpgrade', { line, mode: modeFor(d) }]); }
  const dl = next.production.lift.level - prev.production.lift.level; if (dl > 0) out.push(['buyUpgrade', { line: 'lift', mode: modeFor(dl) }]);
  for (const s of next.production.shafts) {
    const p = prev.production.shafts.find((q) => q.shaftNumber === s.shaftNumber);
    if (!p) continue;
    for (const [key, line] of Object.entries(SHAFT_LINE)) { const d = s[key] - p[key]; if (d > 0) out.push(['buyUpgrade', { line, shaftNumber: s.shaftNumber, mode: modeFor(d) }]); }
  }
  if (next.workersHired > prev.workersHired) out.push(['hire', { count: next.workersHired - prev.workersHired }]);
  if (next.production.shafts.length > prev.production.shafts.length) out.push(['buyShaft', {}]);
  if (next.autoLaunch !== prev.autoLaunch) out.push(['setPolicy', { auto: next.autoLaunch }]);
  if (next.selectedDestinationId !== prev.selectedDestinationId) out.push(['setPolicy', { destinationId: next.selectedDestinationId }]);
  return out;
}

/** Send commands one after another (each needs the version the previous one produced). */
export function send(cmds) {
  chain = chain.then(async () => {
    for (const [kind, payload] of cmds) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try { const r = await call(`commands/${kind}`, { requestId: crypto.randomUUID(), expectedVersion: version, ...payload }); version = r.version; break; }
        catch (e) { if (e.code === 'STALE_VERSION' && attempt === 0) { version = (await call('state')).version; continue; } throw e; }
      }
    }
  });
  const result = chain; chain = chain.catch(() => {});
  return result;
}
export const idle = () => chain;
export async function fetchView() { const view = await call('state'); version = view.version; memo.view = view; return adapt(view); }
export async function logout() { await signOut(auth); }
export const currentUser = () => user;

// ---- sign-in / join overlay ----
function overlay() {
  let el = document.getElementById('authOv');
  if (!el) { el = document.createElement('div'); el.id = 'authOv'; el.className = 'authov'; document.body.append(el); }
  return el;
}
const h = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showSignIn(msg = '') {
  overlay().hidden = false;
  overlay().innerHTML = `<div class="authcard"><h1>Land on the planet</h1><p>Sign in to join the guild. Your mine, coin and ships live on the server, so they keep working while you're away.</p>
    <button id="aoG" class="buy" type="button">Continue with Google</button><div class="or">or</div>
    <form id="aoF"><input id="aoE" type="email" autocomplete="email" placeholder="Email" required><input id="aoP" type="password" autocomplete="current-password" placeholder="Password (6+ characters)" minlength="6" required>
    <div class="btnrow"><button class="buy" data-m="in" type="submit">Sign in</button><button class="buy ghost" data-m="up" type="submit">Create account</button></div></form>
    <p class="aoerr">${h(msg)}</p><p class="aofoot"><a href="#" id="aoOff">Play the offline sandbox instead</a></p></div>`;
  document.getElementById('aoG').onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { showSignIn(e.message); } };
  document.getElementById('aoF').addEventListener('submit', async (e) => {
    e.preventDefault();
    const up = e.submitter?.dataset.m === 'up';
    try { await (up ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth, document.getElementById('aoE').value, document.getElementById('aoP').value); }
    catch (err) { showSignIn((err.code || err.message).replace('auth/', '').replaceAll('-', ' ')); }
  });
  document.getElementById('aoOff').onclick = (e) => { e.preventDefault(); setMode('offline'); };
}
function showJoin(msg = '') {
  overlay().hidden = false;
  overlay().innerHTML = `<div class="authcard"><h1>Join the guild</h1><p>This world is invite-only. Enter the invite code you were given.</p>
    <form id="aoJ"><input id="aoC" placeholder="Invite code" autocomplete="off" required><button class="buy" type="submit">Join</button></form><p class="aoerr">${h(msg)}</p>
    <p class="aofoot"><a href="#" id="aoOut">Sign out</a> · <a href="#" id="aoOff">Offline sandbox</a></p></div>`;
  document.getElementById('aoJ').addEventListener('submit', (e) => { e.preventDefault(); joinWith(document.getElementById('aoC').value.trim()); });
  document.getElementById('aoOut').onclick = (e) => { e.preventDefault(); signOut(auth); };
  document.getElementById('aoOff').onclick = (e) => { e.preventDefault(); setMode('offline'); };
}
function showBusy(text) { overlay().hidden = false; overlay().innerHTML = `<div class="authcard"><h1>${h(text)}</h1></div>`; }
let resolveReady = null; let joinWith = () => {};

async function enter() {
  showBusy('Connecting to the colony…');
  try {
    const first = await fetchView().catch(async (e) => {
      if (e.code === 'NOT_ENROLLED') { await call('commands/enroll', { requestId: crypto.randomUUID(), expectedVersion: 0 }); return fetchView(); }
      throw e;
    });
    overlay().hidden = true;
    resolveReady?.(first); resolveReady = null;
  } catch (e) {
    if (e.status === 403 || e.code === 'WORLD_NOT_FOUND') { joinWith = async (code) => { try { showBusy('Joining…'); await call('join', { inviteCode: code }); await enter(); } catch (err) { showJoin(err.code === 'FORBIDDEN' ? 'That invite code is not right.' : err.code === 'WORLD_FULL' ? 'The guild is full.' : `Could not join (${err.code || err.message}).`); } }; showJoin(); return; }
    showBusy(`Could not reach the colony (${e.code || e.message}). Retrying…`);
    setTimeout(enter, 5000);
  }
}

/** Resolves with { state, planet, regionId } once signed in, joined and enrolled. */
export function startOnline() {
  if (!API) { document.body.insertAdjacentHTML('beforeend', '<div class="authov" style="display:grid;place-items:center"><div class="authcard"><h1>Server not configured</h1><p>Set API_BASE in online/config.js.</p></div></div>'); return new Promise(() => {}); }
  const app = initializeApp(params.get('emulator') ? { ...FIREBASE_CONFIG, projectId: 'demo-extraction' } : FIREBASE_CONFIG);
  auth = getAuth(app);
  if (params.get('emulator')) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return new Promise((resolve) => {
    resolveReady = resolve;
    onAuthStateChanged(auth, (u) => { user = u; if (!u) showSignIn(); else enter(); });
  });
}
