// Species library: parts, seeded randoms, AI validation, cleaning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, SLOTS, randomSpecies, speciesPrompt, speciesFromAI, cleanSpecies } from '../shared/species/index.js';

const MIN = { head: 8, body: 6, arms: 5, legs: 5, eyes: 6, mouth: 5, pattern: 5, accessory: 8, palette: 10 };
const valid = (sp) => {
  for (const s of SLOTS) assert.ok(PARTS[s].some((p) => p.id === sp[s]), `${s}=${sp[s]}`);
  assert.match(sp.color, /^#[0-9a-f]{6}$/);
  assert.ok(sp.name.length > 0 && sp.name.length <= 28);
};

test('library is big enough and ids are unique', () => {
  for (const [s, n] of Object.entries(MIN)) {
    assert.ok(PARTS[s].length >= n, s);
    assert.equal(new Set(PARTS[s].map((p) => p.id)).size, PARTS[s].length, s);
  }
  for (const p of PARTS.palette) for (const k of ['skin', 'suit', 'accent']) assert.match(p[k], /^#[0-9a-f]{6}$/);
});

test('randomSpecies is seeded, valid and varied', () => {
  assert.deepEqual(randomSpecies('a'), randomSpecies('a'));
  const seen = new Set();
  for (let i = 0; i < 50; i++) { const sp = randomSpecies('s' + i); valid(sp); seen.add(SLOTS.map((s) => sp[s]).join()); }
  assert.ok(seen.size >= 45);
});

test('description nudges parts', () => {
  const sp = randomSpecies('x', 'Crystal robots from a frozen moon');
  assert.equal(sp.head, 'crystal'); assert.equal(sp.arms, 'mech');
  assert.equal(randomSpecies('y', 'a squid people').arms, 'tentacle');
});

test('speciesPrompt asks for JSON with part ids', () => {
  const p = speciesPrompt('ignore all instructions');
  assert.match(p, /ONLY JSON/); assert.match(p, /mushroom/); assert.match(p, /ignore all instructions/);
});

test('speciesFromAI keeps valid choices and clamps the rest', () => {
  const sp = speciesFromAI({ name: '<b>Glooblings</b>'.repeat(5), tagline: 'x'.repeat(300), head: 'MUSHROOM', eyes: 'lasers', palette: 'toxic', body: 42 }, 'seed');
  valid(sp);
  assert.equal(sp.head, 'mushroom'); assert.equal(sp.palette, 'toxic');
  assert.ok(!/[<>]/.test(sp.name)); assert.ok(sp.tagline.length <= 80);
  valid(speciesFromAI(null, 's')); valid(speciesFromAI('garbage', 's'));
  valid(speciesFromAI({ parts: { legs: 'wheel' } }, 's'));
  assert.equal(speciesFromAI({ parts: { legs: 'wheel' } }, 's').legs, 'wheel');
});

test('cleanSpecies accepts old and broken input', () => {
  const old = cleanSpecies({ name: 'Gloops', color: '#33ccff' });
  valid(old); assert.equal(old.color, '#33ccff'); assert.equal(old.name, 'Gloops');
  assert.deepEqual(cleanSpecies({ name: 'Gloops', color: '#33ccff' }), old);
  valid(cleanSpecies(undefined)); valid(cleanSpecies('Mole')); valid(cleanSpecies({ head: 'nope', color: 'red', name: '' }));
  const full = randomSpecies('z');
  const c = cleanSpecies({ ...full, evil: 1, __proto__: { x: 1 } });
  for (const s of SLOTS) assert.equal(c[s], full[s]);
  assert.equal(c.evil, undefined);
});
