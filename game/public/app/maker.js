/* The Maker: a full-screen audience with the machine-god of the galactic economy. One session per nuke,
 * up to 3 rounds. The server writes the lines and decides; this file draws the presence and the ask builder. */
import { api } from './net.js';
import { esc, oreIcon, TIER_COL } from './util.js';
import { prefs, sfx, toast } from './juice.js';

const EXAMPLES = [
  'A war broke out in the Veyra system, so armor-grade ore demand should surge.',
  'The Choir of Kesh declared this ore holy; pilgrims will pay anything for it.',
  'A comet storm cut the outer supply lanes for a month. Nothing gets in.',
  'Our blast lit up three sectors. Every buyer wants a souvenir of the crater.',
  'The orbital banks are crashing. Hard ore is the only safe money left.',
];
const KINDS = [
  ['demand', 'Demand for an ore'],
  ['supply', 'Outside supply of an ore'],
  ['global', 'All ore prices'],
  ['buyer', 'One buyer\'s prices'],
];

export function openMaker(S, { sheet, onChange, onGranted }) {
  const planet = S.world.planet;
  const ores = planet.ores, buyers = planet.buyers;
  let sess = null, busy = false, raf = 0, mood = 0; // mood: 0 idle, 1 thinking, 2 granted, 3 refused
  const ask = { kind: 'demand', oreId: (ores.find((o) => o.tier === 'rare') || ores[0]).id, buyerId: buyers[0]?.id, direction: 'up' };

  const sh = sheet(`<div class="mk">
    <div class="mk-stage"><canvas class="mk-cv" width="160" height="90" aria-label="The Maker"></canvas><div class="mk-name"><small>The Maker Guild</small><b>THE MAKER</b></div></div>
    <div class="mk-body">
      <div class="mk-log" aria-live="polite"></div>
      <div class="mk-ask">
        <div class="mk-row">
          <label class="f">I ask the Maker to change <select data-k="kind">${KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="f mk-ore">Ore <select data-k="oreId">${ores.map((o) => `<option value="${esc(o.id)}">${esc(o.name)} (${o.tier})</option>`).join('')}</select></label>
          <label class="f mk-buyer">Buyer <select data-k="buyerId">${buyers.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>
        </div>
        <div class="chips mk-dir"><button class="chip" data-dir="up">Push it up</button><button class="chip" data-dir="down">Push it down</button><span class="mk-preview"></span></div>
        <label class="f">Why should the galaxy care? <textarea class="mk-reason" rows="2" maxlength="600" placeholder="${esc(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)])}"></textarea></label>
        <div class="btnrow mk-btns">
          <button class="buy big sp" data-argue="1">Argue</button>
          <button class="buy big" data-accept="1" hidden>Accept</button>
          <button class="buy ghost" data-leave="1">Leave</button>
        </div>
      </div>
    </div>
  </div>`, 'makersheet');
  const el = sh.el;
  const $ = (s) => el.querySelector(s);
  $('select[data-k="oreId"]').value = ask.oreId;
  const cv = $('.mk-cv');

  // ------------------------------------------------------------ ask builder
  function preview() {
    const o = ores.find((x) => x.id === ask.oreId), b = buyers.find((x) => x.id === ask.buyerId);
    $('.mk-ore').hidden = !(ask.kind === 'demand' || ask.kind === 'supply');
    $('.mk-buyer').hidden = ask.kind !== 'buyer';
    el.querySelectorAll('[data-dir]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.dir === ask.direction)));
    const up = ask.direction === 'up';
    let t;
    if (ask.kind === 'demand') t = `${oreIcon(o, 16)}<b style="color:${TIER_COL[o.tier]}">${esc(o.name)}</b> demand ${up ? 'up: it sells for more' : 'down: it sells for less'}`;
    else if (ask.kind === 'supply') t = `${oreIcon(o, 16)}<b style="color:${TIER_COL[o.tier]}">${esc(o.name)}</b> outside supply ${up ? 'up: its price falls' : 'down: its price rises'}`;
    else if (ask.kind === 'global') t = `Every ore price ${up ? 'up' : 'down'}, for everyone`;
    else t = `<b>${esc(b?.name || 'Buyer')}</b> pays ${up ? 'more' : 'less'} for everything`;
    $('.mk-preview').innerHTML = t;
  }
  el.addEventListener('change', (e) => { const s = e.target.closest('[data-k]'); if (s) { ask[s.dataset.k] = s.value; preview(); } });
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-dir]');
    if (d) { ask.direction = d.dataset.dir; sfx.tap(); preview(); }
    if (e.target.closest('[data-argue]')) argue();
    if (e.target.closest('[data-accept]')) act('accept');
    if (e.target.closest('[data-leave]')) { if (sess && ['granted', 'left', 'refused'].includes(sess.status)) close(); else act('leave'); }
  });
  const close = () => { cancelAnimationFrame(raf); sh.close(); };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-x]')) cancelAnimationFrame(raf); });

  // ------------------------------------------------------------ talking to the server
  let shown = 0;
  function renderLog() {
    const log = $('.mk-log');
    const lines = sess?.lines || [];
    for (let i = shown; i < lines.length; i++) {
      const l = lines[i];
      const d = document.createElement('div');
      d.className = 'mk-line ' + (l.who === 'maker' ? 'maker' : 'you');
      d.innerHTML = `<small>${l.who === 'maker' ? 'THE MAKER' : 'You'}</small><p>${esc(l.text)}</p>`;
      log.appendChild(d);
    }
    shown = lines.length;
    $('.mk-typing')?.remove();
    if (busy) { const t = document.createElement('div'); t.className = 'mk-line maker mk-typing'; t.innerHTML = '<small>THE MAKER</small><p><i></i><i></i><i></i></p>'; log.appendChild(t); }
    log.scrollTop = log.scrollHeight;
  }
  function renderControls() {
    const st = sess?.status || 'new', rounds = sess?.rounds || 0;
    const done = ['granted', 'left', 'refused'].includes(st);
    const argueB = $('[data-argue]'), acc = $('[data-accept]'), leave = $('[data-leave]');
    argueB.disabled = busy || done || rounds >= 3;
    argueB.textContent = rounds >= 3 ? 'No rounds left' : `Argue · round ${rounds + 1}/3`;
    acc.hidden = st !== 'offer' || !sess.offer;
    acc.disabled = busy;
    if (!acc.hidden) acc.textContent = `Accept: ${sess.offer.title}`;
    leave.textContent = done ? 'Close' : 'Leave with nothing';
    el.querySelectorAll('.mk-ask select, .mk-ask textarea, [data-dir]').forEach((x) => { x.disabled = done || busy; });
    $('.mk-ask').classList.toggle('done', done);
    mood = busy ? 1 : st === 'granted' ? 2 : st === 'refused' || st === 'left' ? 3 : 0;
  }
  function adopt(s) {
    sess = s;
    if (s.ask) { Object.assign(ask, { kind: s.ask.kind, direction: s.ask.direction }); if (s.ask.oreId) ask.oreId = s.ask.oreId; if (s.ask.buyerId) ask.buyerId = s.ask.buyerId; el.querySelectorAll('[data-k]').forEach((x) => { if (ask[x.dataset.k]) x.value = ask[x.dataset.k]; }); preview(); }
    renderLog(); renderControls();
    requestAnimationFrame(() => { const l = $('.mk-log'); l.scrollTop = l.scrollHeight; });
    onChange && onChange(s);
  }
  async function call(body) {
    busy = true; renderLog(); renderControls();
    try {
      const r = await api('POST', '/api/v2/maker', body);
      busy = false;
      adopt(r.body.session);
      return r.body.session;
    } catch (e) {
      busy = false; renderLog(); renderControls();
      toast(esc(e.message), 'bad'); sfx.error();
      return null;
    }
  }
  async function argue() {
    const reason = $('.mk-reason').value.trim();
    if (reason.length < 8) { toast('Give the Maker a reason. A sentence about the galaxy works best.', 'warn'); $('.mk-reason').focus(); sfx.error(); return; }
    sfx.maker();
    const s = await call({ action: 'argue', ask: { ...ask, oreId: ask.kind === 'demand' || ask.kind === 'supply' ? ask.oreId : undefined, buyerId: ask.kind === 'buyer' ? ask.buyerId : undefined }, reason });
    if (s) { $('.mk-reason').value = ''; if (s.status === 'offer') sfx.unlock(); if (s.status === 'refused') sfx.error(); }
  }
  async function act(action) {
    const s = await call({ action });
    if (s && action === 'accept' && s.status === 'granted') { sfx.big(); onGranted && onGranted(s); }
  }

  // ------------------------------------------------------------ the presence: rings of glyphs around one eye
  const GLYPHS = [0b111101111, 0b010111010, 0b101010101, 0b111001111, 0b100111001, 0b011110011, 0b110011110, 0b001111100, 0b101111101];
  const g = cv.getContext('2d');
  let blinkAt = 2;
  function draw(ms) {
    const t = ms / 1000, W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    const spin = prefs.reduced ? 0 : mood === 1 ? 2.4 : 0.35;
    g.fillStyle = '#07040d'; g.fillRect(0, 0, W, H);
    // stars
    for (let i = 0; i < 40; i++) { const x = (i * 97) % W, y = (i * 53) % H; g.fillStyle = (Math.floor(t * 2 + i) % 7) ? '#3b2d5c' : '#b892ff'; g.fillRect(x, y, 1, 1); }
    const hue = mood === 2 ? '#ffd23f' : mood === 3 ? '#ff5a6e' : '#b892ff';
    // rings
    const rings = [[18, 12, 1], [28, 16, -1], [39, 18, 1]];
    rings.forEach(([r, n, dir], k) => {
      const ph = t * spin * dir * (1 + k * 0.3);
      g.fillStyle = k === 1 ? '#5a3a8a' : '#3b2d5c';
      for (let a = 0; a < 64; a++) { const an = a / 64 * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(an) * r * 1.6), Math.round(cy + Math.sin(an) * r * 0.9), 1, 1); }
      for (let i = 0; i < n; i++) {
        const an = ph + i / n * Math.PI * 2, gx = Math.round(cx + Math.cos(an) * r * 1.6) - 1, gy = Math.round(cy + Math.sin(an) * r * 0.9) - 1;
        const glyph = GLYPHS[(i * 3 + k + Math.floor(t * (mood === 1 ? 6 : 0.5))) % GLYPHS.length];
        g.fillStyle = (i + k) % 4 === 0 ? hue : '#7a5aa8';
        for (let b = 0; b < 9; b++) if (glyph & (1 << b)) g.fillRect(gx + (b % 3), gy + Math.floor(b / 3), 1, 1);
      }
    });
    // the eye
    if (t > blinkAt + 0.18) blinkAt = t + 2 + Math.random() * 4;
    const open = t > blinkAt ? 0.15 : 1;
    const ew = 15, eh = Math.max(1, Math.round(8 * open));
    g.fillStyle = '#140c1c';
    for (let dy = -eh - 1; dy <= eh + 1; dy++) { const w = Math.round((ew + 2) * Math.sqrt(Math.max(0, 1 - (dy / (eh + 1.5)) ** 2))); g.fillRect(cx - w, cy + dy, w * 2, 1); }
    g.fillStyle = '#efe6ff';
    for (let dy = -eh; dy <= eh; dy++) { const w = Math.round(ew * Math.sqrt(Math.max(0, 1 - (dy / (eh + 0.5)) ** 2))); g.fillRect(cx - w, cy + dy, w * 2, 1); }
    if (open > 0.5) {
      const lx = Math.round(Math.sin(t * 0.7) * 4 + (mood === 1 ? Math.sin(t * 9) * 2 : 0)), ly = Math.round(Math.cos(t * 0.5) * 1.5);
      g.fillStyle = hue; for (let dy = -6; dy <= 6; dy++) { const w = Math.round(6 * Math.sqrt(1 - (dy / 6.5) ** 2)); g.fillRect(cx + lx - w, cy + ly + dy, w * 2, 1); }
      g.fillStyle = '#07040d'; g.fillRect(cx + lx - 1, cy + ly - 5, 2, 10);
      g.fillStyle = '#ffffff'; g.fillRect(cx + lx + 2, cy + ly - 4, 2, 2);
    }
    // glow pulse when it speaks or rules
    if (mood) { g.fillStyle = hue; g.globalAlpha = 0.08 + 0.06 * Math.sin(t * 6); g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);

  preview();
  renderControls();
  sfx.maker();
  call({ action: 'open' });
  return { close };
}
