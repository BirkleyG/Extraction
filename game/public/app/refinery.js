/* Refinery tab: build on-planet or orbital, upgrade rows, the per-ore buy panel with the markup slider,
 * and the buyer parties. The slider is the star: drag it, let go, and ~300 ms later the command is
 * applied locally (prediction) and sent to the server; the readouts show what buyers do at that ask.
 * Every ask you try this session is kept as a dot on a small price axis, so the hidden demand curve
 * shows itself one experiment at a time. Hidden party numbers are never shown. */
import { quote, TUNING } from '/shared/engine/index.js';
import { $$, esc, fmt, oreIcon, TIER_COL, store, clamp } from './util.js';
import { sfx, bump } from './juice.js';

const SITES = ['planet', 'orbital'];
const SITE = {
  planet: { name: 'On-planet refinery', short: 'On-planet', what: 'Cheap and close. Its own belt takes ore straight off the yard, so ships carry less.' },
  orbital: { name: 'Orbital refinery', short: 'Orbital', what: 'Expensive but big, with better yield. Your ships fly ore up to it and dock while they unload.' },
};
const KINDS = [
  ['throughput', 'Throughput', 'Raw ore it can take per minute', 'Upgrade'],
  ['yield', 'Yield', 'Refined units per ore', 'Refine'],
  ['storage', 'Storage', 'Refined goods it holds while buyers decide', 'Expand'],
  ['docks', 'Docks', 'Ships that can unload at once', 'Build'],
];
const TYPE_LABEL = { industrial: 'Industrial', military: 'Military', research: 'Research', traders: 'Traders', political: 'Political', fringe: 'Fringe' };
const MK_MIN = TUNING.ref.markupMin, MK_MAX = TUNING.ref.markupMax;
const q05 = (x) => Math.round(x * 20) / 20;

export function createRefinery(S, A, { row, bulkBar }) {
  const timers = new Map();   // slider key -> debounce timer
  const dragging = new Set(); // slider keys being held
  const shown = {};          // site -> ores listed so far (never shrinks, so cards don't jump)
  const prev = new Map();     // site:ore -> coin/min before the last ask change (for the delta readout)
  const sKey = () => `msc2_refx_${S.me.id}_${S.world.month}`;
  let samples = store(sKey()) || {}; // { 'site:ore': { [ask]: { cpm, sold, at } } }
  let sampleVer = 0, savedAt = 0;

  const ore = (id) => S.oreById[id];
  const R = () => S.colony.refinery || {};
  const has = (p) => S.unl.panels.includes(p);

  // Ores worth showing: what the mine digs now, what sits in the yard or in storage, anything set before.
  function oreList(site) {
    const c = S.colony, r = R()[site], set = shown[site] || (shown[site] = new Set());
    for (const s of c.shafts) set.add(s.ore);
    for (const k in r?.stock || {}) if (r.stock[k] > 0.5) set.add(k);
    for (const k in r?.ores || {}) set.add(k);
    const order = { mythic: 0, rare: 1, common: 2 };
    return [...set].map(ore).filter(Boolean).sort((a, b) => order[a.tier] - order[b.tier] || a.name.localeCompare(b.name));
  }
  const cfg = (site, id) => ({ on: true, markup: 1, ...(R()[site]?.ores?.[id] || {}) });

  // ------------------------------------------------------------ structure key (markup excluded: the slider lives)
  function key() {
    const rf = R();
    return SITES.map((s) => {
      const r = rf[s];
      if (!r) return s + ':none';
      return [s, JSON.stringify(r.lvl || {}), oreList(s).map((o) => o.id + (cfg(s, o.id).on ? '+' : '-')).join(',')].join(':');
    }).join('|') + '|' + S.unl.licenses.includes('refinery') + '|' + S.ui.bulk + '|' + (S.world.parties || []).length;
  }

  // ------------------------------------------------------------ panel
  function panel() {
    const c = S.colony, rf = R();
    let h = '';
    if (!S.unl.licenses.includes('refinery')) {
      const L = TUNING.licenses.refinery;
      return `<p class="lede">Refineries need the Guild's ${esc(L.label)}: day ${L.day} and ${fmt(L.coin)} earned.</p>`;
    }
    const built = SITES.filter((s) => rf[s]);
    h += `<p class="lede">Refined goods sell to the planet's buyers at <b>your</b> price. Ask too much and they walk away while your storage fills; ask too little and you give away margin. Nobody tells you the right number.</p>`;
    if (built.length < 2) {
      h += '<h3>Build a refinery</h3>';
      for (const s of SITES) if (!rf[s]) h += buildCard(s);
    }
    if (built.length) h += bulkBar();
    for (const s of built) h += siteBlock(s);
    h += buyers();
    return h;
  }
  function buildCard(site) {
    const art = site === 'planet'
      ? '<svg viewBox="0 0 16 12" width="48" height="36" shape-rendering="crispEdges"><path fill="#5a4a5a" d="M2 5h10v7H2z"/><path fill="#8a3a3a" d="M1 4h12v1H1z"/><path fill="#3a3a46" d="M10 0h2v4h-2z"/><path fill="#ffb347" d="M4 7h2v2H4zM8 7h2v2H8z"/><path fill="#7a8494" d="M12 9h4v1h-4z"/></svg>'
      : '<svg viewBox="0 0 16 12" width="48" height="36" shape-rendering="crispEdges"><path fill="#7a8494" d="M0 5h16v2H0z"/><path fill="#aab4c4" d="M5 3h6v6H5z"/><path fill="#7ad1ff" d="M7 5h2v2H7z"/><path fill="#3a3a46" d="M7 0h2v3H7zM7 9h2v3H7z"/><path fill="#ffd23f" d="M1 4h1v1H1zM14 7h1v1h-1z"/></svg>';
    return row({ type: 'buildRefinery', site }, `<span class="refart">${art}</span>${SITE[site].name}`, SITE[site].what, { cls: 'refcard', btn: 'Build' });
  }
  function siteBlock(site) {
    const r = R()[site];
    let h = `<div class="refsite" data-site="${site}"><div class="sh-h"><b>${SITE[site].name}</b> <span class="pill" data-rf="full"></span></div>`;
    h += `<div class="flow refflow"><span>In <b data-rf="in"></b></span>→<span>Out <b data-rf="out"></b></span>→<span>Sold <b data-rf="sold"></b></span><span class="gold">+<b data-rf="cpm" class="gold"></b> coin/min</span></div>`;
    h += `<div class="store"><span>Storage</span><span class="vein wide"><i data-rf="bar"></i></span><b data-rf="stock"></b></div>`;
    h += `<p class="lede small hint" data-rf="hint"></p>`;
    for (const [kind, label, sub, btn] of KINDS) {
      if (kind === 'docks' && site !== 'orbital') continue;
      h += row({ type: 'upgradeRefinery', site, kind }, `${label} <span class="lvl">Lv ${r.lvl?.[kind] || 0}</span>`, sub, { btn });
    }
    if (site === 'orbital') h += `<p class="lede small">Ships on <b>Best</b> fly here when it pays; set a ship's route to <b>Orbital refinery</b> in the Fleet tab to always deliver.</p>`;
    h += '<h3>Buy panel</h3><div class="orelist">';
    const list = oreList(site);
    if (!list.length) h += '<p class="lede">No ore yet.</p>';
    for (const o of list) h += oreCard(site, o);
    return h + '</div></div>';
  }
  function oreCard(site, o) {
    const cf = cfg(site, o.id), k = site + ':' + o.id;
    return `<div class="orecard ${cf.on ? '' : 'off'}${cf.markup >= 2 ? ' greedy' : ''}" data-ok="${esc(k)}">
      <div class="oc-h">${oreIcon(o, 20)}<b style="color:${TIER_COL[o.tier]}">${esc(o.name)}</b>
        <button class="tog" data-refon="${esc(k)}" aria-pressed="${cf.on}" title="Refine this ore">${cf.on ? 'Refining' : 'Off'}</button></div>
      ${cf.on ? `<div class="mkp"><label>Ask <b data-o="mk">${cf.markup.toFixed(2)}×</b> <small data-o="unit"></small></label>
        <input type="range" min="${MK_MIN}" max="${MK_MAX}" step="0.05" value="${cf.markup}" data-mk="${esc(k)}" aria-label="${esc(o.name)} asking price">
        <div class="mkscale"><span>cheap</span><span>1×</span><span>greedy</span></div></div>
      <div class="oc-r"><span><small>Sold</small><b data-o="sold"></b></span><span><small>Coin/min</small><b data-o="cpm" class="gold"></b><i data-o="delta"></i></span><span class="vs" data-o="vs"></span></div>
      <canvas class="spark" data-spark="${esc(k)}" height="46"></canvas><div class="sparkcap">Coin/min at every ask you've tried <small data-o="nsamp"></small></div>`
    : '<p class="lede small">Sold raw by your ships instead.</p>'}</div>`;
  }
  function buyers() {
    const P = S.world.parties || [];
    if (!P.length) return '<h3>Buyers</h3><p class="lede">No buyer parties this month: the Guild computer takes everything at a flat price.</p>';
    let h = `<h3>Buyers · ${P.length} parties</h3><p class="lede small">Who buys refined goods this month. Each has a secret maximum price; the dots on your price axis are how you find it.</p><div class="parties">`;
    for (const t of Object.keys(TYPE_LABEL)) {
      const g = P.filter((p) => p.type === t);
      if (!g.length) continue;
      h += `<details class="ptype" ${t === 'industrial' ? 'open' : ''}><summary><span class="pt pt-${t}">${TYPE_LABEL[t]}</span> <small>${g.length}</small></summary>`;
      for (const p of g) {
        const wants = Object.entries(p.wants || {}).filter(([, w]) => w > 0.05).sort((a, b) => b[1] - a[1]).map(([id]) => ore(id)).filter(Boolean).slice(0, 6);
        h += `<div class="party"><b>${esc(p.name)}</b> ${p.personality ? `<span class="pill mut">${esc(p.personality)}</span>` : ''}<p class="d">${esc(p.blurb || '')}</p>
          <div class="wants">${wants.map((o) => `<span class="orechip" style="border-color:${TIER_COL[o.tier]}">${oreIcon(o, 14)}${esc(o.name)}</span>`).join('')}</div></div>`;
      }
      h += '</details>';
    }
    return h + '</div>';
  }

  // ------------------------------------------------------------ live readouts (every tick, no rebuild)
  function vsText(v) {
    if (v == null) return ['', ''];
    if (v <= -0.999) return ['nothing sells', 'bad'];
    if (v < -0.005) return [`worse than raw (−${Math.round(-v * 100)}%)`, 'bad'];
    if (v < 0.005) return ['same as raw', 'mut'];
    return [`+${Math.round(v * 100)}% per ore vs raw`, 'ok'];
  }
  function live() {
    const rr = S.rates.refinery || {};
    for (const el of $$('.refsite')) {
      const site = el.dataset.site, x = rr[site], r = R()[site];
      if (!x || !r) continue;
      const f = clamp(x.stock / Math.max(1, x.cap), 0, 1);
      set(el, 'in', fmt(x.inPerMin)); set(el, 'out', fmt(x.outPerMin)); set(el, 'sold', fmt(x.soldPerMin)); set(el, 'cpm', fmt(x.coinPerMin));
      set(el, 'stock', `${fmt(x.stock)} / ${fmt(x.cap)}`);
      const bar = el.querySelector('[data-rf="bar"]');
      bar.style.width = (f * 100).toFixed(1) + '%';
      bar.style.background = x.full || f > 0.97 ? 'var(--bad)' : f > 0.7 ? 'var(--warn)' : 'var(--ok)';
      const full = el.querySelector('[data-rf="full"]');
      full.textContent = x.full ? 'storage full' : f > 0.7 ? 'filling up' : 'running';
      full.className = 'pill ' + (x.full ? 'bad' : f > 0.7 ? 'warn' : 'ok');
      el.classList.toggle('isfull', !!x.full);
      set(el, 'hint', x.full ? 'Storage is full and the refinery has stopped taking ore. Lower an ask or add storage.'
        : x.inPerMin <= 0.01 ? (site === 'orbital' ? 'Waiting for ships to deliver ore.' : 'No ore coming in: is anything set to refine?')
        : x.soldPerMin < x.outPerMin * 0.6 ? 'Buyers take less than you make: storage is filling. Lower an ask or add storage.' : '');
      for (const card of $$('.orecard', el)) {
        const id = card.dataset.ok.split(':')[1], b = x.byOre?.[id];
        if (!b || !b.on) continue;
        const k = site + ':' + id;
        const idle = b.inPerMin <= 1e-6 && b.stock <= 1e-6;
        card.classList.toggle('idle', idle);
        set(card, 'sold', idle ? 'no ore yet' : fmt(b.soldPerMin) + '/min');
        set(card, 'cpm', fmt(b.coinPerMin));
        const [t, cls] = vsText(b.vsRaw);
        const vs = card.querySelector('[data-o="vs"]');
        if (vs.textContent !== t) { vs.textContent = t; vs.className = 'vs ' + cls; }
        const dl = card.querySelector('[data-o="delta"]'), p0 = prev.get(k);
        if (p0 != null && Math.abs(b.coinPerMin - p0) > Math.max(1e-6, 0.005 * Math.max(p0, b.coinPerMin))) {
          const up = b.coinPerMin > p0;
          dl.className = up ? 'up' : 'down';
          dl.textContent = (up ? '▲ ' : '▼ ') + (p0 > 0 ? Math.round(Math.abs(b.coinPerMin / p0 - 1) * 100) + '%' : 'new');
        } else dl.textContent = '';
        const inp = card.querySelector('[data-mk]');
        const busy = dragging.has(k) || timers.has(k);
        if (inp && !busy && Math.abs(Number(inp.value) - b.ask) > 0.001) { inp.value = b.ask; showAsk(card, site, id, b.ask); }
        if (inp && !card.querySelector('[data-o="unit"]').textContent) showAsk(card, site, id, Number(inp.value));
        if (!busy && (b.inPerMin > 0 || b.stock > 0)) record(k, b);
        const n = Object.keys(samples[k] || {}).length;
        set(card, 'nsamp', n ? `· ${n} tried` : '· try a few');
        spark(card, k, busy ? Number(inp.value) : b.ask);
      }
    }
    if (performance.now() - savedAt > 5000 && sampleVer) { savedAt = performance.now(); store(sKey(), samples); }
  }
  const set = (root, k, v) => { const e = root.querySelector(`[data-rf="${k}"],[data-o="${k}"]`); if (e && e.textContent !== v) e.textContent = v; };
  function record(k, b) {
    const m = (samples[k] = samples[k] || {}), a = q05(b.ask).toFixed(2), old = m[a];
    if (old && Math.abs(old.cpm - b.coinPerMin) <= 1e-9 && Math.abs(old.sold - b.soldPerMin) <= 1e-9) return;
    m[a] = { cpm: b.coinPerMin, sold: b.soldPerMin, at: S.now() };
    sampleVer++;
  }
  function showAsk(card, site, id, mk) {
    const lab = card.querySelector('[data-o="mk"]'), u = card.querySelector('[data-o="unit"]');
    if (lab) lab.textContent = mk.toFixed(2) + '×';
    if (!u) return;
    const q = quote(S.colony, S.ew, { type: 'setRefine', site, oreId: id, markup: mk });
    const m = /\(([^ ]+) coin per refined unit\)/.exec(q.effect || '');
    u.textContent = m ? `${m[1]} coin per unit` : '';
  }

  // Sparkline: dots on a price axis (0.5x .. 3x), y = coin/min seen at that ask. The current ask is a gold line.
  function spark(card, k, cur) {
    const cv = card.querySelector('canvas.spark');
    if (!cv) return;
    const w = Math.max(120, Math.round(cv.clientWidth || 260));
    const ver = sampleVer + ':' + cur.toFixed(2) + ':' + w;
    if (cv._ver === ver) return;
    cv._ver = ver;
    if (cv.width !== w) cv.width = w;
    const H = cv.height, g = cv.getContext('2d');
    g.clearRect(0, 0, w, H);
    g.fillStyle = '#130d1f'; g.fillRect(0, 0, w, H);
    const X = (a) => Math.round(4 + (a - MK_MIN) / (MK_MAX - MK_MIN) * (w - 8));
    g.fillStyle = '#3b2d5c';
    g.fillRect(0, H - 9, w, 1);
    for (let a = 0.5; a <= 3.001; a += 0.5) g.fillRect(X(a), H - 9, 1, 3);
    g.fillStyle = '#ffffff22'; g.fillRect(X(1), 2, 1, H - 11);
    const m = samples[k] || {}, pts = Object.entries(m).map(([a, v]) => ({ a: Number(a), ...v }));
    const top = Math.max(1e-9, ...pts.map((p) => p.cpm));
    const Y = (v) => Math.round(H - 12 - (v / top) * (H - 18));
    g.fillStyle = '#ffd23f'; g.fillRect(X(cur), 2, 1, H - 11);
    const newest = pts.reduce((a, p) => Math.max(a, p.at || 0), 0);
    for (const p of pts) {
      const x = X(p.a), y = Y(p.cpm), dead = p.sold <= 1e-9;
      g.fillStyle = '#05030a'; g.fillRect(x - 3, y - 3, 7, 7);
      g.fillStyle = dead ? '#ff5a6e' : p.at === newest ? '#ffd23f' : Math.abs(p.a - cur) < 0.026 ? '#ffd23f' : '#5ee6a8';
      g.fillRect(x - 2, y - 2, 5, 5);
    }
    g.font = '8px Silkscreen, monospace'; g.fillStyle = '#b3a5d3'; g.textBaseline = 'bottom';
    g.fillText('0.5×', 2, H); g.textAlign = 'right'; g.fillText('3×', w - 2, H); g.textAlign = 'center'; g.fillText('1×', X(1), H); g.textAlign = 'left';
  }

  // ------------------------------------------------------------ slider + toggle
  function commit(site, id, mk) {
    const k = site + ':' + id;
    timers.delete(k);
    const b = S.rates.refinery?.[site]?.byOre?.[id];
    if (b) prev.set(k, b.coinPerMin);
    A.send({ type: 'setRefine', site, oreId: id, markup: mk });
  }
  let lastTick = 0;
  document.addEventListener('input', (e) => {
    const inp = e.target.closest?.('[data-mk]');
    if (!inp) return;
    const k = inp.dataset.mk, [site, id] = k.split(':'), mk = Number(inp.value);
    const card = inp.closest('.orecard');
    showAsk(card, site, id, mk);
    card.classList.toggle('greedy', mk >= 2);
    if (performance.now() - lastTick > 70) { lastTick = performance.now(); sfx.tap(); }
    clearTimeout(timers.get(k));
    timers.set(k, setTimeout(() => commit(site, id, mk), 300));
  });
  const down = (e) => { const inp = e.target.closest?.('[data-mk]'); if (inp) dragging.add(inp.dataset.mk); };
  const up = () => { if (dragging.size) dragging.clear(); };
  document.addEventListener('pointerdown', down);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-refon]');
    if (!b) return;
    const [site, id] = b.dataset.refon.split(':');
    sfx.tap(); bump(b);
    A.send({ type: 'setRefine', site, oreId: id, on: !cfg(site, id).on });
  });

  return { panel, key, live, busy: () => dragging.size > 0 || timers.size > 0 };
}
