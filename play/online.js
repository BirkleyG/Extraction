// Firebase identity and the canonical server game; the browser never owns progress.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { API_BASE, WORLD_ID } from '../online/config.js';
import { validateGameState } from './model.js';
import { planetFromSeed } from './planet.js';
import { createCanonicalClient } from './canonical-client.js';
export { RECONCILE_MS as POLL_MS } from './sync-policy.js';
const params = new URLSearchParams(location.search);
const emulatorMode = ['127.0.0.1','localhost'].includes(location.hostname) && params.get('emulator') === '1';
const API = ((emulatorMode ? params.get('api') : '') || API_BASE || '').replace(/\/$/, '');
const WORLD = params.get('world') || WORLD_ID;
let auth = null;
let user = null;
const client = createCanonicalClient({ baseUrl: API, worldId: WORLD, token: () => auth.currentUser.getIdToken() });
export const wantsOnline = () => true;
export function adapt(view) {
  const state = validateGameState(view.state);
  const planet = planetFromSeed(view.cosmeticSeed ?? state.site.seed);
  const region = planet.regions[(view.regionIndex ?? 0) % planet.regions.length] || planet.regions.find(region => region.id === state.site.regionId) || planet.regions[0];
  state.catchingUp = Boolean(view.catchingUp);
  const [year, month] = String(view.monthId).split('-').map(Number);
  const monthEndsAtMs = view.monthEndsAtMs ?? Date.UTC(year, month, 1);
  state.online = { ...state.online, version: view.version, monthId: view.monthId, monthEndsAtMs, serverNowMs: view.serverNowMs, catchingUp: view.catchingUp, receivedAtMs: Date.now(), email: user?.email ?? user?.displayName ?? '' };
  return { state, planet, regionId: region.id, autoTakeoffs: 0, canonical: true };
}
export async function fetchView() { return adapt(await client.fetchView()); }
export const send = commands => client.send(commands);
export const idle = () => client.idle();
export function note() {} // Event history comes from the server state.
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
  overlay().innerHTML = `<div class="authcard"><h1>Extraction Tycoon</h1><p>Sign in to join the guild. Your mine, coin and ships live on the server, so they keep working while you're away.</p>
    <button id="aoG" class="buy" type="button">Continue with Google</button><div class="or">or</div>
    <form id="aoF"><input id="aoE" type="email" autocomplete="email" placeholder="Email" required><input id="aoP" type="password" autocomplete="current-password" placeholder="Password (6+ characters)" minlength="6" required>
    <div class="btnrow"><button class="buy" data-m="in" type="submit">Sign in</button><button class="buy ghost" data-m="up" type="submit">Create account</button></div></form>
    <p class="aoerr">${h(msg)}</p></div>`;
  document.getElementById('aoG').onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { showSignIn(e.message); } };
  document.getElementById('aoF').addEventListener('submit', async (e) => {
    e.preventDefault();
    const up = e.submitter?.dataset.m === 'up';
    try { await (up ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth, document.getElementById('aoE').value, document.getElementById('aoP').value); }
    catch (err) { showSignIn((err.code || err.message).replace('auth/', '').replaceAll('-', ' ')); }
  });
}
function showJoin(msg = '') {
  overlay().hidden = false;
  overlay().innerHTML = `<div class="authcard"><h1>Join the guild</h1><p>This world is invite-only. Enter the invite code you were given.</p>
    <form id="aoJ"><input id="aoC" placeholder="Invite code" autocomplete="off" required><button class="buy" type="submit">Join</button></form><p class="aoerr">${h(msg)}</p>
    <p class="aofoot"><a href="#" id="aoOut">Sign out</a></p></div>`;
  document.getElementById('aoJ').addEventListener('submit', (e) => { e.preventDefault(); joinWith(document.getElementById('aoC').value.trim()); });
  document.getElementById('aoOut').onclick = (e) => { e.preventDefault(); signOut(auth); };
}
function showBusy(text) { overlay().hidden = false; overlay().innerHTML = `<div class="authcard"><h1>${h(text)}</h1></div>`; }
let readyUid = null;
let resolveReady = null; let joinWith = () => {};

async function enter() {
  const enteringUser = user;
  if (!enteringUser) return;
  showBusy('Connecting to the colony…');
  try {
    const first = await fetchView();
    if (user !== enteringUser) return;
    if (readyUid && readyUid !== enteringUser.uid) { location.reload(); return; }
    readyUid = enteringUser.uid;
    overlay().hidden = true;
    resolveReady?.(first); resolveReady = null;
  } catch (e) {
    if (user !== enteringUser) return;
    if (e.status === 403 || e.code === 'WORLD_NOT_FOUND') { joinWith = async (code) => { try { showBusy('Joining…'); await client.call('join', { inviteCode: code }); await enter(); } catch (err) { showJoin(err.code === 'FORBIDDEN' ? 'That invite code is not right.' : err.code === 'WORLD_FULL' ? 'The guild is full.' : `Could not join (${err.code || err.message}).`); } }; showJoin(); return; }
    overlay().hidden = false;
    overlay().innerHTML = `<div class="authcard"><h1>Connection interrupted</h1><p>Your progress is saved on the server. Reconnect to continue playing.</p><p class="aoerr">${h(e.code || e.message)}</p><button class="buy" id="aoRetry">Retry connection</button><p><a href="#" id="aoOut">Sign out</a></p></div>`;
    document.getElementById('aoRetry').onclick = () => { if (user) enter(); };
    document.getElementById('aoOut').onclick = (event) => { event.preventDefault(); logout(); };
  }
}

/** Resolves with { state, planet, regionId } once signed in, joined and enrolled. */
export function startOnline() {
  if (!API) { document.body.insertAdjacentHTML('beforeend', '<div class="authov" style="display:grid;place-items:center"><div class="authcard"><h1>Server not configured</h1><p>Set API_BASE in online/config.js.</p></div></div>'); return new Promise(() => {}); }
  const app = initializeApp(emulatorMode ? { ...FIREBASE_CONFIG, projectId: 'demo-extraction' } : FIREBASE_CONFIG);
  auth = getAuth(app);
  if (emulatorMode) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return new Promise((resolve) => {
    resolveReady = resolve;
    onAuthStateChanged(auth, (u) => { user = u; if (!u) showSignIn(); else enter(); });
  });
}
