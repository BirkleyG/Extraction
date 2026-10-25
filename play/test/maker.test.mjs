import test from 'node:test';
import assert from 'node:assert/strict';
import { createMakerBrief, fallbackMakerContent, validateMakerContent, generateMakerContent } from '../maker.js';
import { askJSON } from '../planet.js';
const input = { planet: { name: 'Moss', key: 'secret' }, facilities: [{ id: 'f', kind: 'Refinery' }], buyers: [{ id: 'b' }], events: [{ id: 'e', text: 'Shipment departed with 20 units.' }], key: 'secret' };
const brief = createMakerBrief(input);
const settings = () => { globalThis.localStorage = { getItem: () => JSON.stringify({ provider: 'openai', key: 'secret' }) }; };
test('T19-02 no browser globals at import and deterministic no-key fallback', async () => {
  delete globalThis.localStorage;
  assert.deepEqual((await generateMakerContent(input)).content, fallbackMakerContent(brief));
  assert(!JSON.stringify(brief).includes('secret'));
});
test('T19-01/03 rejects invented quantities, outcomes, fields, duplicate names and changed factual news', () => {
  const good = fallbackMakerContent(brief);
  assert(validateMakerContent(good, brief));
  for (const edit of [x => x.news[0].text = 'Shipment arrived.', x => x.facilities[0].name = 'Profit doubled', x => x.buyers[0].personality = 'Guaranteed success', x => x.coins = 50, x => x.buyers[0].name = x.facilities[0].name]) {
    const bad = structuredClone(good); edit(bad); assert.equal(validateMakerContent(bad, brief), false);
  }
});
test('explicit action gates calls; malformed output retries once then falls back', async () => {
  settings(); let calls = 0;
  const request = async () => { calls++; return { bad: true }; };
  await generateMakerContent(input, { request }); assert.equal(calls, 0);
  assert.equal((await generateMakerContent(input, { userInitiated: true, request })).how, 'fallback'); assert.equal(calls, 2);
});
test('valid output succeeds; network failure uses safe fallback without leaking error', async () => {
  settings();
  assert.equal((await generateMakerContent(input, { userInitiated: true, request: async () => fallbackMakerContent(brief) })).how, 'ai');
  const result = await generateMakerContent(input, { userInitiated: true, request: async () => { throw Error('secret'); } });
  assert.equal(result.how, 'fallback'); assert(!JSON.stringify(result).includes('secret'));
});
test('slow provider has a hard timeout even when fetch ignores abort; provider errors hide bodies', async () => {
  settings(); globalThis.fetch = () => new Promise(() => {});
  await assert.rejects(askJSON('test', { timeoutMs: 5 }), /timed out/);
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'secret' });
  await assert.rejects(askJSON('test'), { message: 'AI provider returned HTTP 401' });
});
test('planet source validation rejects malformed data and authority fields', async () => {
  const { validatePlanetContent } = await import('../planet.js');
  assert.equal(validatePlanetContent(null), false);
  assert.equal(validatePlanetContent({ name: 'Moon', coins: 100 }), false);
});
