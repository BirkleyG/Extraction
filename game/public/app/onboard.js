/* Maker Guild onboarding: meet the planet, pick a landing region on the map, name your species, land. */
import { drawScene, personSprite } from './pixel/index.js';
import { color, TERRAINS, WEATHER } from '/shared/planet/index.js';
import { esc, fmt, dur, oreIcon, speciesLook, SPECIES_COLORS, TIER_COL, DAY, clamp } from './util.js';
import { api, net } from './net.js';
import { sfx } from './juice.js';

export function onboard(state) {
  const { world, grant, me } = state;
  const planet = world.planet;
  const now = state.serverNow;
  const day = Math.max(1, Math.floor((now - world.startedAt) / DAY) + 1);
  const days = Math.max(1, Math.round((world.endsAt - world.startedAt) / DAY));
  return new Promise((resolve) => {
    let region = planet.regions[0];
    let col = SPECIES_COLORS[Math.floor(Math.random() * SPECIES_COLORS.length)];
    const ov = document.createElement('div');
    ov.className = 'overlay onboard';
    ov.innerHTML = `<div class="sheet wide">
      <div class="ob-top"><div class="guild-seal">MG</div><div>
        <small class="kicker">The Maker Guild · Charter of Extraction · Day ${day} of ${days}</small>
        <p class="lore">By order of the Maker Guild, <b>General ${esc(me.name)}</b>, you are granted extraction rights on</p>
        <h1>${esc(planet.name)}</h1><p class="tagline">${esc(planet.tagline || '')}</p></div></div>
      <p class="story">${esc(planet.story || '')}</p>
      <div class="ores-strip">${planet.ores.map((o) => `<span title="${esc(o.description || '')}">${oreIcon(o, 20)}<span style="color:${TIER_COL[o.tier]}">${esc(o.name)}</span></span>`).join('')}</div>
      <h3>1 · Choose where to land</h3>
      <div class="ob-land">
        <div class="ob-map"><canvas id="obMap" width="200" height="200"></canvas></div>
        <div class="ob-region"><canvas id="obView" width="240" height="120"></canvas>
          <b id="obRName"></b><p class="lede" id="obRBlurb"></p>
          <div class="chips" id="obRegions">${planet.regions.map((r) => `<button class="chip" data-r="${esc(r.id)}"><i style="background:${esc(r.biomes[0])}"></i>${esc(r.name)}</button>`).join('')}</div>
        </div>
      </div>
      <h3>2 · Your species</h3>
      <div class="ob-species">
        <canvas id="obMiner" width="24" height="27"></canvas>
        <div style="flex:1;min-width:0">
          <label class="f">Species name <input type="text" id="obSp" maxlength="28" value="${esc(me.name)}'s Kin"></label>
          <div class="swatches">${SPECIES_COLORS.map((c) => `<button class="swatch" data-c="${c}" style="background:${c}" aria-label="colour ${c}"></button>`).join('')}</div>
          <small class="lede">The full species builder arrives in a later update.</small>
        </div>
      </div>
      ${grant > 0 ? `<div class="grant">Late to the rush? The Guild advances you <b>${fmt(grant)}</b> coin to catch up.</div>` : ''}
      <div class="btnrow landrow"><button class="buy big" id="obGo">Land</button></div>
      <p class="err" id="obErr" hidden></p>
      <p class="lede small">The month ends in ${esc(dur(world.endsAt - now))}. The richest colony at the closing bell enters the Hall of Fame.</p>
    </div>`;
    document.body.appendChild(ov);
    const mapCv = ov.querySelector('#obMap');
    const viewCv = ov.querySelector('#obView');
    const minerCv = ov.querySelector('#obMiner');
    const own = drawMap(mapCv, planet);
    let raf = 0;

    function pick(r) {
      region = r;
      ov.querySelector('#obRName').textContent = r.name;
      ov.querySelector('#obRBlurb').textContent = `${TERRAINS[r.terrain]?.label || r.terrain} · ${WEATHER[r.weather] || r.weather || ''}. ${r.blurb || ''}`;
      ov.querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === r.id)));
      ov.querySelector('#obGo').textContent = `Land in ${r.name}`;
      paintMap();
    }
    function paintMap() {
      const g = mapCv.getContext('2d');
      g.putImageData(own.img, 0, 0);
      const k = mapCv.width / 1000;
      for (const r of planet.regions) {
        const x = Math.round(r.x * k), y = Math.round(r.y * k);
        if (r.id === region.id) {
          g.fillStyle = '#140c1c'; g.fillRect(x - 5, y - 5, 11, 11);
          g.fillStyle = '#ffd23f'; g.fillRect(x - 4, y - 4, 9, 9);
          g.fillStyle = col; g.fillRect(x - 2, y - 2, 5, 5);
        } else { g.fillStyle = '#140c1c'; g.fillRect(x - 2, y - 2, 5, 5); g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - 1, 3, 3); }
      }
    }
    function paintMiner() {
      const L = speciesLook({ name: ov.querySelector('#obSp').value, color: col });
      const g = minerCv.getContext('2d');
      g.clearRect(0, 0, 24, 27);
      g.drawImage(personSprite({ role: 'miner', pose: 'cheer', frame: 0, color: L.color, head: L.head, skin: L.skin, tier: 1 }), 0, 0);
      ov.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === col)));
      paintMap();
    }
    const loop = (ms) => {
      const g = viewCv.getContext('2d');
      drawScene(g, planet, region, { x: (ms / 1000) * 6 % 4000, y: -96, scale: 1, w: viewCv.width, h: viewCv.height }, ms / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    mapCv.addEventListener('click', (e) => {
      const r = mapCv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * mapCv.width), y = Math.floor((e.clientY - r.top) / r.height * mapCv.height);
      const i = own.own[clamp(y, 0, mapCv.height - 1) * mapCv.width + clamp(x, 0, mapCv.width - 1)];
      if (i >= 0) { sfx.tap(); pick(planet.regions[i]); }
    });
    ov.querySelector('#obRegions').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { sfx.tap(); pick(planet.regions.find((r) => r.id === b.dataset.r)); } });
    ov.querySelector('.swatches').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { col = b.dataset.c; sfx.tap(); paintMiner(); } });
    ov.querySelector('#obSp').addEventListener('input', paintMiner);
    ov.querySelector('#obGo').addEventListener('click', async () => {
      const btn = ov.querySelector('#obGo'), err = ov.querySelector('#obErr');
      btn.disabled = true; err.hidden = true;
      try {
        const r = await api('POST', '/api/v2/start', { species: { name: ov.querySelector('#obSp').value.trim() || me.name + "'s Kin", color: col }, siteRegion: region.id });
        if (r.status !== 200) throw new Error(r.body?.error || 'Could not land');
        cancelAnimationFrame(raf);
        sfx.big();
        ov.classList.add('leaving');
        setTimeout(() => ov.remove(), 350);
        resolve(r.body);
      } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; sfx.error(); }
    });
    pick(planet.regions[0]);
    paintMiner();
  });
}

// Voronoi map of the regions on a round planet. Returns the owner index per pixel (-1 outside) and the image.
export function drawMap(cv, planet) {
  const g = cv.getContext('2d');
  const N = cv.width, k = 1000 / N, rs = planet.regions;
  const own = new Int16Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let best = 0, bd = 1e12;
    for (let i = 0; i < rs.length; i++) { const d = (rs[i].x - x * k) ** 2 + (rs[i].y - y * k) ** 2; if (d < bd) { bd = d; best = i; } }
    own[y * N + x] = best;
  }
  const img = g.createImageData(N, N);
  const rgb = (hex) => { const h = color.hexOr ? color.hexOr(hex, '#808080') : hex; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const pal = rs.map((r) => r.biomes.map(rgb));
  const c = N / 2, R = N / 2 - 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4, d = Math.hypot(x - c, y - c);
    if (d > R) { img.data[i + 3] = 0; own[y * N + x] = -1; continue; }
    const o = own[y * N + x];
    const edge = (x && own[y * N + x - 1] !== o && own[y * N + x - 1] >= 0) || (y && own[(y - 1) * N + x] !== o && own[(y - 1) * N + x] >= 0);
    let [r, gg, b] = edge ? [20, 12, 28] : pal[o][(x * 7 + y * 13) % 23 === 0 ? 1 : (x + y * 3) % 31 === 0 ? 2 : 0];
    const shade = d > R * 0.78 ? 1 - (d - R * 0.78) / (R * 0.22) * 0.6 : 1;
    const lit = 1 + 0.12 * ((c - x) + (c - y)) / N;
    img.data[i] = clamp(r * shade * lit, 0, 255); img.data[i + 1] = clamp(gg * shade * lit, 0, 255); img.data[i + 2] = clamp(b * shade * lit, 0, 255); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { own, img };
}
