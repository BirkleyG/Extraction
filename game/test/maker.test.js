// The Maker negotiation and galactic events (server side).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../store.js';
import { createMaker, offerFor, heuristicQuality, spectacleScore, validAsk } from '../v2/maker.js';
import { createEvents } from '../v2/events.js';
import { improvisePlanet } from '../shared/planet/index.js';

const planet = improvisePlanet('maker-test', {});
const rare = planet.ores.find(o => o.tier === 'rare');

function harness({ aiReply } = {}) {
  let T = Date.UTC(2026, 10, 5);
  const world = { month: '2026-11', planet, changes: [], endsAt: Date.UTC(2026, 11, 1) };
  const feed = [];
  const ai = aiReply ? { json: async () => aiReply() } : null;
  return {
    world, feed, tick: ms => { T += ms; }, clock: () => T,
    deps: async () => ({
      store: await createStore(null), ai, currentModel: async () => (ai ? 'test-model' : ''),
      getWorld: async () => world, saveWorld: async () => {}, addFeed: async (text) => feed.push(text), clock: () => T,
    }),
  };
}
const me = { id: 'u1', name: 'Ana' };
const nuked = (spectacle = 12) => ({ uid: 'u1', lastNuke: { at: 111, spectacle, runEarned: 2e7 } });

test('offers grow with Spectacle (85%) and argument quality (15%)', () => {
  const ask = { kind: 'demand', oreId: rare.id, direction: 'up' };
  const small = offerFor(ask, 9.4, 0.5).mult, big = offerFor(ask, 54, 0.5).mult;
  assert.ok(big > small && small > 1);
  assert.ok(offerFor(ask, 20, 1).mult > offerFor(ask, 20, 0).mult);
  assert.ok(offerFor({ ...ask, direction: 'down' }, 20, 0.5).mult < 1);
  assert.equal(spectacleScore(100), 1);
  assert.ok(heuristicQuality(`War broke out in Veyra, so ${rare.name} armor demand should surge because fleets need it`, planet) > heuristicQuality('make my ore worth more', planet));
  assert.equal(validAsk({ kind: 'demand', oreId: 'nope', direction: 'up' }, planet), false);
});

test('a nuked player argues, gets an offer and the change applies to the world', async () => {
  const h = harness();
  const mk = createMaker(await h.deps());
  await assert.rejects(mk.handle(me, { uid: 'u1' }, { action: 'open' }), /nuked/);
  let r = await mk.handle(me, nuked(), { action: 'open' });
  assert.equal(r.session.status, 'open');
  r = await mk.handle(me, nuked(), { action: 'argue', ask: { kind: 'demand', oreId: rare.id, direction: 'up' }, reason: `A cult festival on Morrow needs ${rare.name} for its idols, because the high priest said so` });
  assert.equal(r.session.status, 'offer');
  assert.ok(r.session.offer.mult > 1);
  r = await mk.handle(me, nuked(), { action: 'accept' });
  assert.equal(r.session.status, 'granted');
  assert.equal(h.world.changes.length, 1);
  assert.equal(h.world.changes[0].source, 'maker');
  assert.equal(h.world.changes[0].oreId, rare.id);
  assert.match(h.feed[0], /Maker granted Ana/);
  await assert.rejects(mk.handle(me, nuked(), { action: 'argue', ask: { kind: 'global', direction: 'up' }, reason: 'again please' }), /already ruled/);
});

test('nonsense is refused; three bad rounds end the session; AI lines are used when present', async () => {
  const h = harness({ aiReply: () => ({ quality: 0.02, line: 'You bore me, mortal.' }) });
  const mk = createMaker(await h.deps());
  await mk.handle(me, nuked(), { action: 'open' });
  let r;
  for (let i = 0; i < 3; i++) r = await mk.handle(me, nuked(), { action: 'argue', ask: { kind: 'global', direction: 'up' }, reason: 'asdf' });
  assert.equal(r.session.status, 'refused');
  assert.ok(r.session.lines.some(l => l.text === 'You bore me, mortal.'));
  assert.equal(h.world.changes.length, 0);
  // a new nuke opens a new session
  r = await mk.handle(me, { uid: 'u1', lastNuke: { at: 222, spectacle: 30 } }, { action: 'open' });
  assert.equal(r.session.status, 'open');
});

test('galactic events arrive on schedule, expire, and reach the news feed', async () => {
  const h = harness();
  const ev = createEvents(await h.deps());
  assert.equal(await ev.maybeEvent(), null, 'first call only schedules');
  assert.ok(h.world.nextEventAt > h.clock());
  h.tick(2 * 24 * 3600_000);
  assert.equal(await ev.maybeEvent(), null, 'nothing in the first days');
  h.tick(4 * 24 * 3600_000);
  const e = await ev.maybeEvent();
  assert.ok(e && e.until > e.at && e.source === 'event');
  assert.equal(h.world.changes.length, 1);
  assert.match(h.feed[0], /📰/);
  assert.ok(h.world.nextEventAt - h.clock() >= 6 * 24 * 3600_000, 'next one about a week later');
  for (let i = 0; i < 50; i++) { const x = ev.makeEvent(h.world, h.clock()); assert.ok(x.mult > 0.4 && x.mult < 2.1); }
});
