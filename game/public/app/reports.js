/* Reports tab: your coin/min and rank over the month, the leaderboard race, ore price history,
 * and the ledger (where every coin came from and went). History is fetched from /api/v2/history
 * when the tab opens; the ledger updates in place from the predicted colony. */
import { LEDGER_IN, LEDGER_OUT } from '/shared/engine/index.js';
import { $, $$, esc, fmt, oreIcon, DAY } from './util.js';
import { api } from './net.js';
import { lineChart } from './charts.js';

const IN_LABEL = { raw: 'Raw ore sales', refined: 'Refined goods', nukeCargo: 'Cargo after a nuke', grant: 'Catch-up grant' };
const IN_COL = { raw: '#c8a070', refined: '#ffd23f', nukeCargo: '#ff8a3d', grant: '#b892ff' };
const OUT_LABEL = { miners: 'Miners', shafts: 'Shafts', drill: 'Gear', lift: 'Lift', surface: 'Yard, belts, pads', ships: 'Ships', refinery: 'Refinery', safety: 'Safety' };
const OUT_COL = { miners: '#ff8a3d', shafts: '#c8a070', drill: '#aab4c4', lift: '#7ad1ff', surface: '#5ee6a8', ships: '#b892ff', refinery: '#ffd23f', safety: '#ff5a6e' };

export function createReports(S) {
  let H = null, ver = 0, loading = false, scope = 'month', ledgerAt = 0;

  async function load() {
    if (loading) return;
    loading = true;
    try { const r = await api('GET', '/api/v2/history'); H = r.body; ver++; } catch { H = H || { me: [], prices: {}, board: [] }; ver++; } finally { loading = false; }
  }
  const key = () => `${ver}|${scope}|${Object.keys(S.oreById).length}`;

  const dayOf = (t) => 1 + Math.floor((t - S.world.startedAt) / DAY);
  const xFmt = (t, long) => {
    const d = new Date(t);
    return long ? `Day ${dayOf(t)} ${String(d.getHours()).padStart(2, '0')}:00` : `D${dayOf(t)}`;
  };

  function panel() {
    let h = '<p class="lede small">Snapshots every hour. Hover or tap a chart to read it.</p>';
    if (!H) h += '<p class="lede">Loading history…</p>';
    h += `<h3>Your coin per minute</h3><canvas class="chart" data-chart="cpm"></canvas>`;
    h += `<h3>Your rank</h3><canvas class="chart" data-chart="rank"></canvas>`;
    h += `<h3>The race</h3><canvas class="chart" data-chart="race"></canvas><div class="legend" data-legend="race"></div>`;
    h += `<h3>Ore prices</h3><p class="lede small">Planet market index per ore: 100% is the normal price.</p><canvas class="chart" data-chart="price"></canvas><div class="legend" data-legend="price"></div>`;
    h += `<h3>Ledger</h3><div class="chips"><button class="chip" data-ledger="month" aria-pressed="${scope === 'month'}">This month</button><button class="chip" data-ledger="run" aria-pressed="${scope === 'run'}">This run</button></div><div class="ledger" data-ledgerbody></div>`;
    return h;
  }

  function mount() {
    const me = (H?.me || []).slice();
    // add "now" so the line reaches the present
    const rank = rankNow();
    if (S.colony) me.push([S.now(), S.colony.coin, S.rates.coinPerMin, rank || (me.at(-1)?.[3] ?? 1)]);
    const empty = 'Charts fill in hourly. Check back soon.';
    const c = (k) => $(`[data-chart="${k}"]`);
    if (c('cpm')) lineChart(c('cpm'), { series: [{ name: '', color: '#ffd23f', points: me.map((p) => [p[0], p[2]]), bold: true }], zero: true, yFmt: (v, l) => fmt(v) + (l ? '/min' : ''), xFmt, empty, height: 130 });
    if (c('rank')) lineChart(c('rank'), { series: [{ name: '', color: '#7ad1ff', points: me.filter((p) => p[3] > 0).map((p) => [p[0], p[3]]) }], invert: true, intTicks: true, yMin: 1, yFmt: (v, l) => (l ? '#' : '') + Math.round(v), xFmt, empty, height: 110 });
    const board = (H?.board || []).map((b) => ({ name: b.name, color: b.color || '#ff8a3d', points: b.points, bold: b.id === S.me.id }));
    if (c('race')) lineChart(c('race'), { series: board, zero: true, yFmt: (v) => fmt(v), xFmt, empty, height: 160 });
    const lr = $('[data-legend="race"]');
    if (lr) lr.innerHTML = board.map((b) => `<span class="${b.bold ? 'me' : ''}"><i style="background:${esc(b.color)}"></i>${esc(b.name)}</span>`).join('');
    const prices = Object.entries(H?.prices || {}).map(([id, pts]) => ({ id, o: S.oreById[id], pts })).filter((x) => x.o && x.pts.length);
    const ps = prices.map((x) => ({ name: x.o.name, color: x.o.color || '#c8d0d8', points: x.pts }));
    if (c('price')) lineChart(c('price'), { series: ps, yFmt: (v) => Math.round(v * 100) + '%', xFmt, empty, height: 140 });
    const lp = $('[data-legend="price"]');
    if (lp) lp.innerHTML = prices.map((x) => `<span>${oreIcon(x.o, 12)}<i style="background:${esc(x.o.color)}"></i>${esc(x.o.name)}</span>`).join('');
    ledgerAt = 0;
    live();
  }
  function rankNow() {
    const rows = [...S.board.values()].filter((b) => b.month === S.world.month && b.id !== S.me.id);
    return 1 + rows.filter((b) => b.coin > S.colony.coin).length;
  }

  function live() {
    const el = $('[data-ledgerbody]');
    if (!el || performance.now() - ledgerAt < 1000) return;
    ledgerAt = performance.now();
    const L = S.colony.ledger?.[scope];
    if (!L) { el.innerHTML = '<p class="lede">No ledger yet.</p>'; return; }
    const ins = LEDGER_IN.map((k) => [k, L.in?.[k] || 0]).filter(([, v]) => v > 0);
    const outs = LEDGER_OUT.map((k) => [k, L.out?.[k] || 0]).filter(([, v]) => v > 0);
    const tin = ins.reduce((a, [, v]) => a + v, 0), tout = outs.reduce((a, [, v]) => a + v, 0);
    const block = (title, rows, tot, lab, col) => (rows.sort((a, b) => b[1] - a[1]), 0) || `<div class="lg"><div class="lg-h"><b>${title}</b><span class="gold">${fmt(tot)}</span></div>
      <div class="stack">${rows.map(([k, v]) => `<i style="width:${(100 * v / Math.max(1e-9, tot)).toFixed(2)}%;background:${col[k]}" title="${esc(lab[k])}"></i>`).join('')}</div>
      ${rows.map(([k, v]) => `<div class="lr"><i style="background:${col[k]}"></i><span>${esc(lab[k])}</span><b>${fmt(v)}</b><small>${Math.round(100 * v / Math.max(1e-9, tot))}%</small></div>`).join('') || '<p class="lede small">Nothing yet.</p>'}</div>`;
    const html = block('Came in', ins, tin, IN_LABEL, IN_COL) + block('Went out', outs, tout, OUT_LABEL, OUT_COL)
      + `<p class="lede small">Net ${tin - tout >= 0 ? '<span class="ok">+' : '<span class="bad">−'}${fmt(Math.abs(tin - tout))}</span> ${scope === 'run' ? (S.colony.nukes ? 'since your last nuke' : 'this run') : 'this month'}.${(L.in?.nukeCargo || 0) > 0 ? ' Cargo after a nuke counts toward score but never lands in coin.' : ''}</p>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ledger]');
    if (!b) return;
    scope = b.dataset.ledger;
    $$('[data-ledger]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.ledger === scope)));
    ledgerAt = 0; live();
  });

  return { load, key, panel, mount, live };
}
