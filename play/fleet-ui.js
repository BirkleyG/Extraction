const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderFleet(state, {fmt = n => Number(n).toLocaleString()} = {}) {
  const view = state.online;
  const fleet = view?.fleet;
  if (!fleet) return '';
  const button = (kind, text, attrs = '', disabled = false) => `<button type="button" class="buy sm ghost" data-fleet="${kind}" ${attrs}${disabled ? ' disabled' : ''}>${text}</button>`;
  const age = Math.max(0, (Date.now() - (view.receivedAtMs ?? Date.now())) / 1000);
  const readyIn = ship => Math.max(0, Math.ceil(ship.readyInSeconds - age));
  const pads = view.mine.pads;
  const weather = view.mine.weather;
  return `<h2>Fleet & buyers</h2><p class="lede">Live server quotes. Payment is final at departure; arrivals never pay twice.</p>
    <div class="note">${h(weather.kind)}${weather.grounded ? ' · takeoffs waiting for weather' : ' · flying conditions open'} · ${pads.count}/${pads.max} pads · ${fleet.count}/${fleet.max} ships${view.mine.workers.wasted ? ` · ! ${view.mine.workers.wasted} unassigned workers` : ''}</div>
    <div class="btnrow">${button('buyPad', `Add pad · ${pads.nextPrice == null ? 'MAX' : h(fmt(pads.nextPrice))+' ◉'}`, '', pads.nextPrice == null || state.coins < pads.nextPrice)}
    ${Object.entries(fleet.prices).map(([type,price]) => button('buyShip', `${h(type)} · ${h(fmt(price))} ◉`, `data-class="${h(type)}"`, fleet.count >= fleet.max || state.coins < price)).join('')}</div>
    ${fleet.ships.map(ship => `<div class="devbox"><b>${h(ship.class)} · ${h(ship.id)}</b><p class="d">${h(fmt(ship.capacity))} crates · ${h(fmt(ship.speedPerMinute))} AU/min · ${readyIn(ship) > 0 ? 'return in '+readyIn(ship)+'s' : 'ready'} · policy ${h(ship.policy.mode)}</p>
      <div class="btnrow">${button('dispatch','Launch now',`data-ship="${h(ship.id)}"`,readyIn(ship) > 0 || view.yard.units < 1 || weather.grounded)}
      ${button('auto',ship.policy.auto ? 'Auto: on' : 'Auto: off',`data-ship="${h(ship.id)}"`)}
      ${['best','nearest'].map(mode => button('policy',mode === 'best' ? 'Best coin/min' : 'Nearest',`data-ship="${h(ship.id)}" data-mode="${mode}"`)).join('')}</div>
      ${ship.hypothetical ? '<p class="d">Full-hold comparison: no whole cargo currently in the yard.</p>' : ''}
      ${ship.destinations.map(row => `<div class="row"><div><div class="t">${h(row.name)}${row.best ? ' · best quoted rate' : ''}</div><div class="d">${h(fmt(row.unitPrice))} ◉/crate · ${h(fmt(row.payment))} ◉ total · ${h(fmt(row.coinPerMinute))} ◉/min · ${row.tripSeconds}s trip${row.dockWaitSeconds ? ' · '+row.dockWaitSeconds+'s dock wait' : ''}</div></div>${button('fixed','Ship here',`data-ship="${h(ship.id)}" data-destination="${h(row.id)}"`)}</div>`).join('')}</div>`).join('')}`;
}
export function fleetCommand(button, state) {
  if (button?.disabled || !state.online?.fleet) return null;
  const d = button.dataset;
  if (d.fleet === 'buyPad') return ['buyPad', {}];
  if (d.fleet === 'buyShip' && Object.hasOwn(state.online.fleet.prices,d.class)) return ['buyShip', {class:d.class}];
  const ship = state.online.fleet.ships.find(s => s.id === d.ship);
  if (!ship) return null;
  if (d.fleet === 'dispatch') return ['dispatch',{shipId:ship.id}];
  if (d.fleet === 'auto') return ['setPolicy',{shipId:ship.id,auto:!ship.policy.auto}];
  if (d.fleet === 'policy' && ['best','nearest'].includes(d.mode)) return ['setPolicy',{shipId:ship.id,mode:d.mode,destinationId:null}];
  if (d.fleet === 'fixed' && ship.destinations.some(row => row.id === d.destination)) return ['setPolicy',{shipId:ship.id,mode:'fixed',destinationId:d.destination}];
  return null;
}
