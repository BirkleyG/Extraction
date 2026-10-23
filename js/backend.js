/* Multiplayer backend adapter.
 *
 * The game talks to a tiny `db` / `user` interface (doc().get/set/onSnapshot, collection().add/orderBy/limit,
 * doc().acquire for a lock, user.id/profiles). This file implements that interface on top of Firebase
 * (Firestore + anonymous auth), loaded straight from Google's CDN, so there is no build step and no server to run.
 *
 * If js/config.js has no Firebase settings, connect() returns null and the game runs in single-player local mode.
 *
 * Every friend group gets its own "room" (?room=name in the URL), so one Firebase project can host many games.
 * All data lives under rooms/{room}/...
 */
(function () {
  'use strict';
  const FB_VER = '10.14.1';
  const CDN = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';

  function cleanRoom(r) { return String(r || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32); }

  function getRoom() {
    let room = '';
    try { room = cleanRoom(new URLSearchParams(location.search).get('room')); } catch (e) {}
    try {
      if (room) localStorage.setItem('msc_room', room);
      else room = cleanRoom(localStorage.getItem('msc_room'));
    } catch (e) {}
    return room || 'main';
  }

  /* Firestore rejects nested arrays and undefined, and the game state has both. Store each document as a JSON string
   * plus the few fields we need to query or secure on (t for ordering). */
  function encode(data) {
    const j = JSON.stringify(data);
    const out = { j, ts: Date.now() };
    if (data && typeof data.t === 'number') out.t = data.t;
    return out;
  }
  function decode(raw) {
    if (!raw || typeof raw.j !== 'string') return null;
    try { return JSON.parse(raw.j); } catch (e) { return null; }
  }

  function askName(initial) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.style.zIndex = 100;
      ov.innerHTML = '<div class="sheet"><h1>Who are you?</h1>' +
        '<p class="lede">Pick a name your friends will see on the leaderboard.</p>' +
        '<label class="f">Your name <input type="text" id="mscName" maxlength="24" autocomplete="nickname"></label>' +
        '<div class="btnrow"><button class="buy" id="mscNameGo">Join the colony network</button></div></div>';
      document.body.appendChild(ov);
      const inp = ov.querySelector('#mscName');
      inp.value = initial || '';
      inp.focus();
      const done = () => {
        const v = inp.value.trim().slice(0, 24);
        if (!v) { inp.focus(); return; }
        ov.remove();
        resolve(v);
      };
      ov.querySelector('#mscNameGo').addEventListener('click', done);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
    });
  }

  async function connect() {
    const cfg = window.MSC_CONFIG && window.MSC_CONFIG.firebase;
    if (!cfg || !cfg.apiKey || !cfg.projectId) return null;

    const [appMod, authMod, fsMod] = await Promise.all([
      import(CDN + 'firebase-app.js'),
      import(CDN + 'firebase-auth.js'),
      import(CDN + 'firebase-firestore.js')
    ]);
    const app = appMod.initializeApp(cfg);
    const auth = authMod.getAuth(app);
    const emu = window.MSC_CONFIG.emulator; // dev only: { host:'localhost', auth:9099, firestore:8080 }
    if (emu) authMod.connectAuthEmulator(auth, 'http://' + emu.host + ':' + emu.auth, { disableWarnings: true });
    await auth.authStateReady();
    if (!auth.currentUser) await authMod.signInAnonymously(auth);
    const uid = auth.currentUser.uid;

    const fs = fsMod;
    const fdb = fs.getFirestore(app);
    if (emu) fs.connectFirestoreEmulator(fdb, emu.host, emu.firestore);
    const room = getRoom();
    const base = 'rooms/' + room;

    /* display name (kept per device, mirrored to the room so everyone can see it) */
    let name = '';
    try { name = localStorage.getItem('msc_name') || ''; } catch (e) {}
    if (!name) {
      name = await askName('');
      try { localStorage.setItem('msc_name', name); } catch (e) {}
    }
    const profRef = fs.doc(fdb, base + '/profiles/' + uid);
    fs.setDoc(profRef, { name, ts: Date.now() }).catch(() => {});

    const docRef = path => fs.doc(fdb, base + '/' + path);
    const snapOf = s => ({ exists: s.exists(), data: () => decode(s.data()) });
    const qSnapOf = q => ({ docs: q.docs.map(d => ({ id: d.id, data: () => decode(d.data()) })) });

    function collection(name) {
      const state = { order: null, lim: null };
      const build = () => {
        const parts = [];
        if (state.order) parts.push(fs.orderBy(state.order[0], state.order[1]));
        if (state.lim) parts.push(fs.limit(state.lim));
        return fs.query(fs.collection(fdb, base + '/' + name), ...parts);
      };
      const api = {
        orderBy(f, dir) { state.order = [f, dir || 'asc']; return api; },
        limit(n) { state.lim = n; return api; },
        get: async () => qSnapOf(await fs.getDocs(build())),
        onSnapshot: (ok, err) => fs.onSnapshot(build(), q => ok(qSnapOf(q)), err),
        add: data => fs.addDoc(fs.collection(fdb, base + '/' + name), encode(data))
      };
      return api;
    }

    const db = {
      doc(path) {
        const ref = docRef(path);
        return {
          get: async () => snapOf(await fs.getDoc(ref)),
          set: data => fs.setDoc(ref, encode(data)),
          onSnapshot: (ok, err) => fs.onSnapshot(ref, s => ok(snapOf(s)), err),
          /* short-lived mutex so only one client at a time creates/rolls the world */
          acquire: ({ holder, ttlMs }) => fs.runTransaction(fdb, async tx => {
            const s = await tx.get(ref);
            const now = Date.now();
            const cur = s.exists() ? s.data() : null;
            if (cur && cur.holder !== holder && cur.expires > now) return { acquired: false };
            tx.set(ref, { holder, expires: now + ttlMs });
            return { acquired: true };
          })
        };
      },
      collection
    };

    const profileCache = {};
    const user = {
      id: async () => uid,
      isOwner: async () => /(^|[#&])admin\b/.test(location.hash),
      can: async () => true,
      async profiles(ids) {
        const out = {};
        await Promise.all(ids.map(async id => {
          if (profileCache[id]) { out[id] = profileCache[id]; return; }
          try {
            const s = await fs.getDoc(fs.doc(fdb, base + '/profiles/' + id));
            if (s.exists()) { profileCache[id] = { name: String(s.data().name || '').slice(0, 24) }; out[id] = profileCache[id]; }
          } catch (e) {}
        }));
        return out;
      }
    };

    return { db, user, room, name };
  }

  window.MSC = { connect, getRoom };
})();
