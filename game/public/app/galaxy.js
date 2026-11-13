/* Galaxy bulletin: every active world change (Maker deals and galactic events), who caused it and why.
 * Fetched from /api/v2/bulletin; refreshed when world2 changes arrive. New changes light the top-bar
 * indicator, and someone else's deal or a galactic event pops a toast. */
import { api } from './net.js';
import { $, esc, dur, store, oreIcon } from './util.js';
import { toast, sfx, bump } from './juice.js';

const multTxt = (m) => '×' + (Math.round(m * 100) / 100).toString();

// The effect in plain words, e.g. "Gumdrop Quartz demand ×1.6".
export function describeChange(c, S) {
  const ore = c.oreId && S.oreById[c.oreId];
  const buyer = c.buyerId && S.I?.buyer(c.buyerId);
  const oreName = ore ? ore.name : 'an ore';
  const up = c.kind === 'supply' ? c.mult < 1 : c.mult >= 1; // good for sellers?
  let text;
  if (c.kind === 'demand') text = `${oreName} demand ${multTxt(c.mult)}`;
  else if (c.kind === 'supply') text = `${oreName} outside supply ${multTxt(c.mult)} (price ${multTxt(1 / c.mult)})`;
  else if (c.kind === 'global') text = `All ore prices ${multTxt(c.mult)}`;
  else if (c.kind === 'buyer') text = `${buyer ? buyer.name : 'A buyer'} pays ${multTxt(c.mult)}`;
  else text = c.title || 'The market shifts';
  return { text, up, ore };
}

export function createGalaxy(S) {
  S.bulletin = { changes: [], nextEventAt: null, loaded: false };
  const seenKey = () => `msc2_galaxy_${S.me.id}_${S.world.month}`;
  let seen = new Set(store(seenKey()) || []);
  let unseen = 0;
  let inflight = null;

  function idsOfWorld() { return (S.world.changes || []).filter((c) => !c.until || c.until > S.now()).map((c) => c.id).sort().join(','); }

  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const r = await api('GET', '/api/v2/bulletin');
        const first = !S.bulletin.loaded;
        const known = new Set(S.bulletin.changes.map((c) => c.id));
        S.bulletin = { changes: r.body.changes || [], nextEventAt: r.body.nextEventAt || null, loaded: true };
        for (const c of S.bulletin.changes) {
          if (!first && !known.has(c.id) && c.by !== S.me.id) {
            const d = describeChange(c, S);
            if (c.source === 'maker') toast(`<b class="sp">The Maker ruled</b> for ${esc(c.byName || 'a General')}: ${esc(d.text)}`, 'galaxy', 6000);
            else toast(`<b class="sp">Galactic event:</b> ${esc(c.title)} · ${esc(d.text)}`, 'galaxy', 6000);
            sfx.warn();
          }
        }
        unseen = S.bulletin.changes.filter((c) => !seen.has(c.id) && c.by !== S.me.id).length;
        indicator();
      } catch { /* keep the old list */ }
      inflight = null;
    })();
    return inflight;
  }
  let lastIds = null;
  function onWorld() {
    const ids = idsOfWorld();
    if (ids !== lastIds) { lastIds = ids; refresh(); }
  }
  function markSeen() {
    for (const c of S.bulletin.changes) seen.add(c.id);
    store(seenKey(), [...seen]);
    unseen = 0;
    indicator();
  }
  function indicator() {
    const b = $('#galaxyBtn');
    if (!b) return;
    b.hidden = !S.bulletin.changes.length;
    b.classList.toggle('hot', unseen > 0);
    $('#galaxyN').textContent = S.bulletin.changes.length;
    if (unseen > 0) bump(b);
  }

  function panel() {
    const B = S.bulletin, now = S.now();
    let h = `<p class="lede">Every change to the galactic market, and who caused it. Changes apply to every colony on ${esc(S.world.planet.name)}. Maker deals last the month; galactic events pass in a day or three.</p>`;
    if (!B.loaded) return h + '<p class="lede">Reading the Guild wire…</p>';
    if (!B.changes.length) h += `<div class="gx empty"><b>The market is untouched.</b><p class="lede">Nuke your colony and argue with the Maker to bend it.</p></div>`;
    for (const c of [...B.changes].sort((a, b) => (b.at || 0) - (a.at || 0))) {
      const d = describeChange(c, S);
      const who = c.source === 'maker' ? `<span class="gx-who">${c.by === S.me.id ? 'Your Maker deal' : `Maker deal for <b>${esc(c.byName || 'a General')}</b>`}</span>` : '<span class="gx-who ev">Galactic event</span>';
      const left = c.until ? `<span class="pill warn">${esc(dur(c.until - now))} left</span>` : '<span class="pill mut">all month</span>';
      h += `<div class="gx ${c.source}">
        <div class="gx-h">${who}${left}</div>
        <div class="gx-t">${d.ore ? oreIcon(d.ore, 18) : ''}<b>${esc(d.text)}</b> <span class="pill ${d.up ? 'ok' : 'bad'}">${d.up ? 'prices up' : 'prices down'}</span></div>
        ${c.title && c.title !== d.text ? `<div class="gx-title">${esc(c.title)}</div>` : ''}
        ${c.reason ? `<p class="gx-r">“${esc(c.reason)}”</p>` : ''}
      </div>`;
    }
    if (B.nextEventAt && B.nextEventAt > now) h += `<p class="lede small">Next galactic event in about ${esc(dur(B.nextEventAt - now))}.</p>`;
    return h;
  }
  const key = () => S.bulletin.changes.map((c) => c.id).join(',') + '|' + S.bulletin.loaded + '|' + Math.floor(S.now() / 60000);

  return { refresh, onWorld, markSeen, panel, key, count: () => S.bulletin.changes.length };
}
