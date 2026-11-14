/* Maker Guild onboarding: meet the planet, design your species, land (the Guild drops you at a fair spot). */
import { renderPlanetMap } from './pixel/planetmap.js';
import { speciesSprite } from './pixel/species.js';
import { PARTS, SLOTS, SLOT_LABEL, randomSpecies, cleanSpecies } from '/shared/species/index.js';
import { esc, fmt, dur, oreIcon, TIER_COL, DAY } from './util.js';
import { api, net } from './net.js';
import { sfx } from './juice.js';

export function onboard(state) {
  const { world, grant, me } = state;
  const planet = world.planet;
  const now = state.serverNow;
  const day = Math.max(1, Math.floor((now - world.startedAt) / DAY) + 1);
  const days = Math.max(1, Math.round((world.endsAt - world.startedAt) / DAY));
  return new Promise((resolve) => {
    const region = planet.regions[0];
    let sp = randomSpecies(me.id + ':' + Date.now());
    const ov = document.createElement('div');
    ov.className = 'overlay onboard';
    ov.innerHTML = `<div class="sheet wide">
      <div class="ob-top"><div class="guild-seal">MG</div><div>
        <small class="kicker">The Maker Guild · Charter of Extraction · Day ${day} of ${days}</small>
        <p class="lore">By order of the Maker Guild, <b>General ${esc(me.name)}</b>, you are granted extraction rights on</p>
        <h1>${esc(planet.name)}</h1><p class="tagline">${esc(planet.tagline || '')}</p></div></div>
      <p class="story">${esc(planet.story || '')}</p>
      <div class="ores-strip">${planet.ores.map((o) => `<span title="${esc(o.description || '')}">${oreIcon(o, 20)}<span style="color:${TIER_COL[o.tier]}">${esc(o.name)}</span></span>`).join('')}</div>
      <h3>1 · Your landing</h3>
      <div class="ob-land">
        <div class="ob-map"><canvas id="obMap" width="360" height="360" aria-label="The planet"></canvas>${(state.colonies || []).length ? `<small class="mut">${state.colonies.length} colon${state.colonies.length === 1 ? 'y' : 'ies'} already down</small>` : ''}</div>
        <div class="ob-region"><b>The Guild will drop you at a fair spot.</b>
          <p class="lede">Every colony starts equally well off, clear of the others, with no hostile tribes nearby. What lies in the ground is hidden: you will find out by digging. Once you land, the map shows where you are.</p></div>
      </div>
      <h3>2 · Design your species</h3>
      <div class="sb">
        <div class="sb-prev"><canvas id="sbCv" width="192" height="224" aria-label="Your species"></canvas>
          <div class="sb-id"><b class="sb-name" id="sbNameShow"></b><i class="sb-tag" id="sbTagShow"></i></div></div>
        <div class="sb-ctl">
          <label class="f">Describe them in a sentence <textarea id="sbDesc" rows="2" maxlength="300" placeholder="e.g. Tiny crystal moles who sing to the rock. Or: rusty robot crabs with a fondness for hats."></textarea></label>
          <div class="btnrow"><button class="buy sm" id="sbAsk">Ask the Maker Guild to design it</button><button class="buy sm ghost" id="sbRoll">Reroll</button></div>
          <p class="lede small" id="sbMsg" hidden></p>
          <div class="sb-parts" id="sbParts"></div>
          <div class="sb-names"><label class="f">Species name <input type="text" id="sbName" maxlength="28"></label>
          <label class="f">Tagline <input type="text" id="sbTag" maxlength="80"></label></div>
        </div>
      </div>
      ${grant > 0 ? `<div class="grant">Late to the rush? The Guild advances you <b>${fmt(grant)}</b> coin to catch up.</div>` : ''}
      <div class="btnrow landrow"><button class="buy big" id="obGo">Land</button></div>
      <p class="err" id="obErr" hidden></p>
      <p class="lede small">The month ends in ${esc(dur(world.endsAt - now))}. The richest colony at the closing bell enters the Hall of Fame.</p>
    </div>`;
    document.body.appendChild(ov);
    const mapCv = ov.querySelector('#obMap');
    const sbCv = ov.querySelector('#sbCv');
    let raf = 0;
    try {
      renderPlanetMap(mapCv, planet, { labels: true });
      const g = mapCv.getContext('2d'), k = mapCv.width / 1000;
      for (const o of state.colonies || []) { g.fillStyle = '#140c1c'; g.fillRect(o.x * k - 3, o.y * k - 3, 7, 7); g.fillStyle = o.color || '#fff'; g.fillRect(o.x * k - 2, o.y * k - 2, 5, 5); }
    } catch (e) { console.error(e); }

    // ---- species builder
    const partsEl = ov.querySelector('#sbParts');
    function partLabel(slot) { return PARTS[slot].find((p) => p.id === sp[slot])?.label || sp[slot]; }
    function showSpecies(fromInputs) {
      if (!fromInputs) { ov.querySelector('#sbName').value = sp.name; ov.querySelector('#sbTag').value = sp.tagline || ''; }
      ov.querySelector('#sbNameShow').textContent = sp.name || '…';
      ov.querySelector('#sbTagShow').textContent = sp.tagline || '';
      partsEl.innerHTML = SLOTS.map((s) => `<div class="sbp"><button class="sbb" data-step="-1" data-slot="${s}" aria-label="Previous ${SLOT_LABEL[s]}">‹</button><span><small>${SLOT_LABEL[s]}</small>${esc(partLabel(s))}</span><button class="sbb" data-step="1" data-slot="${s}" aria-label="Next ${SLOT_LABEL[s]}">›</button></div>`).join('');
    }
    function setSpecies(next) { sp = cleanSpecies(next); showSpecies(); }
    partsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      const list = PARTS[b.dataset.slot], i = list.findIndex((p) => p.id === sp[b.dataset.slot]);
      const next = { ...sp, [b.dataset.slot]: list[(i + Number(b.dataset.step) + list.length) % list.length].id };
      if (b.dataset.slot === 'palette') next.color = list[(i + Number(b.dataset.step) + list.length) % list.length].suit;
      sfx.tap(); setSpecies(next);
    });
    ov.querySelector('#sbRoll').addEventListener('click', () => {
      sfx.tap();
      const r = randomSpecies(me.id + ':' + Math.random(), ov.querySelector('#sbDesc').value);
      setSpecies(r);
    });
    ov.querySelector('#sbAsk').addEventListener('click', async () => {
      const btn = ov.querySelector('#sbAsk'), msg = ov.querySelector('#sbMsg');
      const description = ov.querySelector('#sbDesc').value.trim();
      if (!description) { msg.hidden = false; msg.textContent = 'Describe your species first: a sentence is plenty.'; ov.querySelector('#sbDesc').focus(); sfx.error(); return; }
      btn.disabled = true; btn.textContent = 'The Guild is drafting…'; msg.hidden = true;
      try {
        const r = await api('POST', '/api/v2/species', { description });
        setSpecies(r.body.species); sfx.big();
        msg.hidden = false; msg.textContent = 'The Guild has drafted your species. Swap any part you like.';
      } catch (e) {
        setSpecies(randomSpecies(me.id + ':' + Math.random(), description));
        msg.hidden = false; msg.textContent = 'The Guild is busy, so here is a sketch from your description.';
      } finally { btn.disabled = false; btn.textContent = 'Ask the Maker Guild to design it'; }
    });
    ov.querySelector('#sbName').addEventListener('input', (e) => { sp = { ...sp, name: e.target.value }; showSpecies(true); });
    ov.querySelector('#sbTag').addEventListener('input', (e) => { sp = { ...sp, tagline: e.target.value }; showSpecies(true); });
    function paintSpecies(ms) {
      const g = sbCv.getContext('2d');
      g.imageSmoothingEnabled = false;
      const W = sbCv.width, H = sbCv.height;
      g.fillStyle = '#140c1c'; g.fillRect(0, 0, W, H);
      const t = ms / 1000;
      // rock backdrop + floor in the landing region's colours
      g.fillStyle = region.biomes?.[2] || '#2a2238'; g.globalAlpha = 0.25;
      for (let i = 0; i < 18; i++) g.fillRect((i * 53) % W, (i * 37) % (H - 40), 8, 8);
      g.globalAlpha = 1;
      g.fillStyle = region.biomes?.[0] || '#3b2d5c'; g.fillRect(0, H - 22, W, 22);
      g.fillStyle = '#140c1c'; g.fillRect(0, H - 22, W, 2);
      const phase = Math.floor(t / 2.4) % 3, pose = ['idle', 'swing', 'walk'][phase];
      const fr = pose === 'idle' ? (Math.floor(t * 2) % 2 ? 0 : 0) : Math.floor(t * (pose === 'swing' ? 5 : 6)) % 3;
      const bob = pose === 'idle' && Math.floor(t * 2) % 2 ? 1 : 0;
      g.drawImage(speciesSprite(sp, pose, fr), (W - 168) / 2, H - 22 - 24 * 7 + 2 + bob * 7 - 7, 168, 189);
    }
    const loop = (ms) => {
      paintSpecies(ms);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    ov.querySelector('#obGo').addEventListener('click', async () => {
      const btn = ov.querySelector('#obGo'), err = ov.querySelector('#obErr');
      btn.disabled = true; err.hidden = true;
      try {
        const r = await api('POST', '/api/v2/start', { species: { ...sp, name: (sp.name || '').trim() || me.name + "'s Kin" } });
        if (r.status !== 200) throw new Error(r.body?.error || 'Could not land');
        cancelAnimationFrame(raf);
        sfx.big();
        ov.classList.add('leaving');
        setTimeout(() => ov.remove(), 350);
        resolve(r.body);
      } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; sfx.error(); }
    });
    ov.querySelector('#obGo').textContent = 'Land';
    showSpecies();
  });
}
