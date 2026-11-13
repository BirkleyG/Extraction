// Buyer parties: seeded numbers, AI names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateParties, applyPartyNames, partiesPrompt, PARTY_TYPES } from '../shared/market/parties.js';
import { improvisePlanet } from '../shared/planet/index.js';

const planet = improvisePlanet('party-test', {});

test('24 seeded parties, four of each type, with sane hidden numbers', () => {
  const a = generateParties('s1', planet), b = generateParties('s1', planet);
  assert.deepEqual(a, b, 'deterministic');
  assert.equal(a.length, 24);
  for (const t of Object.keys(PARTY_TYPES)) assert.equal(a.filter(p => p.type === t).length, 4);
  assert.equal(new Set(a.map(p => p.name)).size, 24, 'unique names');
  for (const p of a) {
    assert.ok(p.sigma >= 1.5 && p.sigma <= 4 && p.cap >= 1.2 && p.cap <= 2.5 && p.ref >= 0.8 && p.ref <= 1.6 && p.demand > 0);
    assert.equal(Object.keys(p.wants).length, 7);
    assert.ok(Object.values(p.wants).filter(w => w >= 0.5).length >= 2, 'wants at least two ores');
  }
  assert.notDeepEqual(generateParties('s2', planet).map(p => p.name), a.map(p => p.name));
});

test('AI names are applied but never its numbers; garbage is ignored', () => {
  const ps = generateParties('s1', planet);
  assert.match(partiesPrompt(planet, ps), /ONLY JSON/);
  const named = applyPartyNames(ps, { parties: [{ id: 'pt0', name: 'The Bolt Popes', blurb: 'Buy anything shiny.', sigma: 99 }, { id: 'pt1', name: 'The Bolt Popes' }] });
  assert.equal(named[0].name, 'The Bolt Popes');
  assert.equal(named[0].sigma, ps[0].sigma);
  assert.equal(named[1].name, ps[1].name, 'duplicate names fall back');
  assert.deepEqual(applyPartyNames(ps, null), ps);
  assert.deepEqual(applyPartyNames(ps, { parties: 'nope' }), ps);
});
