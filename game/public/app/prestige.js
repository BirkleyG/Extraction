/* Prestige: the nuke (two confirmations), the cinematic blast, the score screen, evolutions bought with SP,
 * and the way back to the Maker. The engine decides everything; this file only stages it. */
import { quote, TUNING } from '/shared/engine/index.js';
import { $, esc, fmt, clamp } from './util.js';
import { prefs, sfx, banner } from './juice.js';
import { api } from './net.js';
import { speciesPortrait } from './pixel/species.js';
import { openMaker } from './maker.js';

const EVO_DESC = { mine: 'Every miner digs faster, all month', ship: 'Every ship flies faster, all month', sell: 'Every sale pays more, all month', spectacle: 'Bigger Spectacle at your next nuke' };

export function createPrestige(S, A, ui) {
  const P = { maker: null, makerLoading: false };

  async function loadMaker() {
    if (!S.colony.lastNuke || P.makerLoading) return;
    P.makerLoading = true;
    try { const r = await api('POST', '/api/v2/maker', { action: 'state' }); P.maker = r.body.session; } catch { P.maker = null; }
    P.makerLoading = false;
    ui.render(true);
  }
  const makerOpen = () => P.maker && ['new', 'open', 'offer'].includes(P.maker.status);

  function panel() {
    const c = S.colony, q = quote(c, S.ew, { type: 'nuke' });
    const min = TUNING.nukeMin, run = c.runEarned || 0;
    const ok = !q.error;
    let h = '';
    if (makerOpen()) h += `<div class="maker-call"><b>The Maker is waiting.</b><p>Your last blast earned you an audience. Ask for one change to the galactic market.</p><button class="buy big sp" data-maker="1">Return to the Maker</button></div>`;
    h += `<div class="nukebox ${ok ? 'armed' : ''}">
      <div class="nk-h"><span class="nk-ic" aria-hidden="true"></span><div><small>Prestige</small><b>Nuke the colony</b></div></div>
      <div class="nk-stats">
        <div><small>Earned this run</small><b class="gold">${fmt(run)}</b></div>
        <div><small>Spectacle now</small><b class="sp">${ok ? q.spectacle.toFixed(1) : '–'}</b></div>
        <div><small>SP</small><b class="sp">${fmt(c.sp || 0)}</b></div>
        <div><small>Nukes this month</small><b>${c.nukes || 0}</b></div>
      </div>
      ${ok ? '' : `<p class="lede">The Guild signs off a nuke at <b>${fmt(min)}</b> earned this run.</p><span class="nextbar big"><i style="width:${clamp(100 * run / min, 0, 100).toFixed(1)}%"></i></span>`}
      <p class="strategy">Rank is coin on hand, so nuking drops you to zero. Early nukes compound; late ones waste the month.</p>
      <p class="lede small">Spectacle = coin earned this run<sup>1/7.5</sup>. It becomes SP for evolutions and sets how big a change the Maker can grant. Ships in flight get paid; everything else becomes a crater. You keep SP, evolutions and unlocked panels.</p>
      <button class="buy big danger nukebtn" data-nuke="1" ${ok ? '' : 'disabled'}>${ok ? `Arm the nuke · +${q.spectacle.toFixed(1)} SP` : 'Not enough earned yet'}</button>
    </div>`;
    h += `<h3>Evolutions <span class="pill sp">${fmt(c.sp || 0)} SP</span></h3><p class="lede">Bought with SP from nukes. They last the whole month, through every later nuke.</p>`;
    h += ui.bulkBar();
    for (const kind of ['mine', 'ship', 'sell', 'spectacle']) {
      const lv = c.evo?.[kind] || 0;
      h += ui.row({ type: 'evolve', kind }, `${esc(TUNING.evo[kind].label)} <span class="lvl">Lv ${lv}</span>`, EVO_DESC[kind], { btn: 'Evolve', cls: 'evo' });
    }
    return h;
  }
  const key = () => {
    const c = S.colony, q = quote(c, S.ew, { type: 'nuke' });
    return [q.error ? Math.floor(50 * (c.runEarned || 0) / TUNING.nukeMin) : 'ok' + Math.round((q.spectacle || 0) * 10), Math.round((c.sp || 0) * 10), c.nukes, JSON.stringify(c.evo || {}), P.maker?.status || '', P.maker?.rounds || 0].join(':');
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-nuke]') && !e.target.closest('[data-nuke]').disabled) { sfx.warn(); armSheet(); }
    if (e.target.closest('[data-maker]')) { sfx.tap(); maker(); }
  });

  // ---------------------------------------------------------------- the two confirmations
  function armSheet() {
    const c = S.colony, q = quote(c, S.ew, { type: 'nuke' });
    if (q.error) return;
    const sh = ui.sheet(`<div class="nuke1">
      <div class="hazard-stripe"></div>
      <h2 class="bad">Nuke your colony?</h2>
      <p>This blows up <b>everything</b>: ${c.shafts.length} shafts, ${c.miners} miners, ${c.ships.length} ships and <b class="gold">${fmt(c.coin)}</b> coin on hand. Your rank drops to zero.</p>
      <ul class="keeps"><li class="ok">You get <b>+${q.spectacle.toFixed(1)} SP</b> (Spectacle ${q.spectacle.toFixed(1)})</li><li class="ok">Ships in flight are paid for their cargo</li><li class="ok">You keep SP, evolutions and unlocked panels</li><li class="ok">The Maker grants you an audience</li><li class="bad">You restart from a starter mine</li></ul>
      <div class="btnrow"><button class="buy ghost" data-x="1">Keep mining</button><button class="buy danger" data-step2="1">I understand, continue</button></div>
      <div class="nuke2" hidden>
        <div class="hazard-stripe"></div>
        <h2 class="bad">Final confirmation</h2>
        <p>Type <b>NUKE</b>, or hold the button for 2 seconds.</p>
        <input type="text" class="nukein" maxlength="4" placeholder="NUKE" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Type NUKE">
        <button class="buy big danger hold" data-fire="1"><i class="holdfill"></i><span>Hold to detonate</span></button>
      </div>
    </div>`, 'nukesheet');
    const el = sh.el;
    el.querySelector('[data-step2]').addEventListener('click', (e) => {
      sfx.warn();
      e.target.closest('.btnrow').hidden = true;
      el.querySelector('.nuke2').hidden = false;
      el.querySelector('.nukein').focus();
    });
    const fire = el.querySelector('[data-fire]'), inp = el.querySelector('.nukein'), fill = el.querySelector('.holdfill');
    let fired = false;
    const go = () => { if (fired) return; fired = true; sh.close(); detonate(); };
    inp.addEventListener('input', () => {
      const ok = inp.value.trim().toUpperCase() === 'NUKE';
      fire.querySelector('span').textContent = ok ? 'DETONATE' : 'Hold to detonate';
      fire.classList.toggle('live', ok);
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim().toUpperCase() === 'NUKE') go(); });
    let t0 = 0, raf = 0;
    const step = () => {
      const p = clamp((performance.now() - t0) / 2000, 0, 1);
      fill.style.width = (p * 100) + '%';
      if (p >= 1) return go();
      raf = requestAnimationFrame(step);
    };
    const down = (e) => {
      e.preventDefault();
      if (inp.value.trim().toUpperCase() === 'NUKE') return go();
      t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(step); sfx.tap();
    };
    const up = () => { cancelAnimationFrame(raf); fill.style.width = '0%'; };
    fire.addEventListener('pointerdown', down);
    fire.addEventListener('pointerup', up);
    fire.addEventListener('pointerleave', up);
    fire.addEventListener('pointercancel', up);
    fire.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && inp.value.trim().toUpperCase() === 'NUKE') go(); });
  }

  // ---------------------------------------------------------------- detonate: blast -> score -> Maker
  async function detonate() {
    const before = S.colony;
    const q = quote(before, S.ew, { type: 'nuke' });
    const stats = { runEarned: before.runEarned || 0, spectacle: q.spectacle, spBefore: before.sp || 0 };
    A.send({ type: 'nuke', confirm: 'NUKE' });
    if (S.colony === before) return; // refused (the toast says why)
    await blast(stats.spectacle);
    const c = S.colony;
    const ok = await A.flush();
    stats.sp = c.sp || 0; stats.nukes = c.nukes || 1; stats.paid = c.lastNuke?.paid || 0;
    score(stats, ok !== false);
  }

  function score(st, synced) {
    const portrait = speciesPortrait(S.colony.species, 120, 0, 'cheer');
    const sh = ui.sheet(`<div class="score">
      <small class="kicker">Spectacle report · ${esc(S.colony.name)}</small>
      <h1 class="spect">${st.spectacle.toFixed(1)}</h1>
      <p class="lede">Spectacle. The Guild felt that one from orbit.</p>
      <div class="score-grid">
        <div><small>Run earned</small><b class="gold">${fmt(st.runEarned)}</b></div>
        <div><small>Spectacle</small><b class="sp">${st.spectacle.toFixed(1)}</b></div>
        <div><small>SP gained</small><b class="sp">+${st.spectacle.toFixed(1)}</b></div>
        <div><small>Total SP</small><b class="sp">${fmt(st.sp)}</b></div>
        <div><small>Nukes this month</small><b>${st.nukes}</b></div>
      </div>
      <div class="score-sp"></div>
      <p>The Maker has noticed you. Ask for one change to the galactic market, and give a reason the galaxy would believe.</p>
      <div class="btnrow"><button class="buy big sp" data-face="1">Face the Maker</button></div>
    </div>`, 'scoresheet');
    sh.el.querySelector('.score-sp').appendChild(portrait);
    sh.el.querySelector('[data-face]').addEventListener('click', () => { sh.close(); maker(); });
    sfx.unlock();
  }

  async function maker() {
    if (!S.colony.lastNuke) return;
    await A.flush();
    openMaker(S, {
      sheet: ui.sheet,
      onChange: (sess) => { P.maker = sess; ui.render(true); },
      onGranted: (sess) => { banner('The galaxy shifts', sess.offer?.title || '', 'galaxy'); A.galaxy.refresh(); },
    });
  }

  // ---------------------------------------------------------------- the blast
  function blast(spectacle) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'blast';
      const cv = document.createElement('canvas');
      ov.appendChild(cv);
      const label = document.createElement('div');
      label.className = 'blast-label';
      label.innerHTML = `<small>Spectacle</small><b>${spectacle.toFixed(1)}</b>`;
      ov.appendChild(label);
      document.body.appendChild(ov);
      S.ui.sheet = true;
      const done = () => { ov.classList.add('out'); setTimeout(() => { ov.remove(); S.ui.sheet = document.querySelectorAll('.overlay').length > 0; resolve(); }, 450); };
      sfx.boom();
      if (prefs.reduced) {
        ov.classList.add('calm');
        setTimeout(() => label.classList.add('show'), 600);
        setTimeout(done, 2200);
        return;
      }
      document.getElementById('app').classList.add('nukeshake');
      setTimeout(() => document.getElementById('app').classList.remove('nukeshake'), 2600);
      // low-res pixel canvas over the mine stage
      const stage = document.querySelector('.stage').getBoundingClientRect();
      const px = Math.max(3, Math.round(Math.min(innerWidth, innerHeight) / 140));
      const W = Math.ceil(innerWidth / px), H = Math.ceil(innerHeight / px);
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const gx = Math.round((stage.left + stage.width / 2) / px), gy = Math.round((stage.top + stage.height * 0.62) / px);
      const scale = Math.min(W, H * 1.4) / 120;
      const parts = [];
      for (let i = 0; i < 90; i++) {
        const a = -Math.PI * Math.random(), v = (30 + Math.random() * 90) * scale;
        parts.push({ x: gx, y: gy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20 * scale, s: Math.random() < 0.3 ? 2 : 1, c: ['#5a4a3a', '#8a6a4a', '#3a2f48', '#ffd23f', '#ff8a3d'][i % 5] });
      }
      const T0 = performance.now(), DUR = 4300;
      let last = T0;
      const fire = (k) => k < 0.15 ? '#ffffff' : k < 0.3 ? '#fff6a0' : k < 0.5 ? '#ffd23f' : k < 0.7 ? '#ff8a3d' : k < 0.85 ? '#c84a2a' : '#5a4a50';
      const puff = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.rect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1); } g.fill(); };
      const loop = (ms) => {
        const t = (ms - T0) / 1000, dt = Math.min(0.05, (ms - last) / 1000); last = ms;
        g.clearRect(0, 0, W, H);
        // sky tint
        g.fillStyle = `rgba(40,8,8,${Math.min(0.75, t * 0.6)})`; g.fillRect(0, 0, W, H);
        // shockwave along the ground
        const sw = t * 140 * scale;
        g.fillStyle = `rgba(255,220,160,${Math.max(0, 0.7 - t * 0.35)})`;
        g.fillRect(gx - sw, gy, sw * 2, Math.max(1, Math.round(2 * scale)));
        // cloud: stem + rolling cap, cooling from white to smoke
        const rise = Math.min(1, t / 1.6), cool = clamp((t - 0.2) / 3.2, 0, 1);
        const topY = gy - rise * 62 * scale;
        for (let i = 0; i < 14; i++) {
          const yy = gy - (i / 14) * (gy - topY), r = (5 + (i % 3)) * scale * (0.6 + rise * 0.4);
          puff(gx + Math.sin(t * 3 + i) * 1.5 * scale, yy, r, fire(clamp(cool + (1 - i / 14) * 0.25, 0, 1)));
        }
        const capR = (8 + rise * 16) * scale;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + t * 0.8;
          puff(gx + Math.cos(a) * capR * 0.9, topY + Math.sin(a) * capR * 0.35, capR * 0.5, fire(clamp(cool + (Math.sin(a) > 0 ? 0.12 : 0), 0, 1)));
        }
        puff(gx, topY, capR * 0.6, fire(clamp(cool - 0.15, 0, 1)));
        // ground fire ring
        for (let i = -6; i <= 6; i++) puff(gx + i * 4 * scale, gy, (3 + (i * 7 + Math.floor(t * 10)) % 3) * scale, fire(clamp(cool + 0.1 + Math.abs(i) * 0.03, 0, 1)));
        // debris
        for (const p of parts) {
          p.vy += 90 * scale * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > gy + 30 * scale) continue;
          g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s * Math.max(1, Math.round(scale)), p.s * Math.max(1, Math.round(scale)));
        }
        // white flash
        if (t < 0.7) { g.fillStyle = `rgba(255,255,255,${1 - t / 0.7})`; g.fillRect(0, 0, W, H); }
        if (t > 1.8) label.classList.add('show');
        if (ms - T0 < DUR) requestAnimationFrame(loop); else done();
      };
      requestAnimationFrame(loop);
    });
  }

  return { panel, key, loadMaker, maker, makerOpen };
}
