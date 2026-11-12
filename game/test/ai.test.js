import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAi, providerOf, parseJSON } from '../ai.js';

test('model IDs route to the right provider', () => {
  assert.equal(providerOf('claude-haiku-5-5'), 'anthropic');
  assert.equal(providerOf('gpt-5'), 'openai');
});

test('only models with a server key can be used', () => {
  const ai = createAi({ OPENAI_API_KEY: 'sk-test' });
  assert.equal(ai.canUse('gpt-5'), true);
  assert.equal(ai.canUse('claude-opus-5-5'), false);
  assert.equal(ai.defaultModel(), '');
  assert.equal(createAi({}).enabled, false);
  assert.equal(createAi({ ANTHROPIC_API_KEY: 'x' }).defaultModel(), 'claude-opus-5-5');
});

test('JSON is pulled out of chatty replies', () => {
  assert.deepEqual(parseJSON('Sure! {"a":1} hope that helps'), { a: 1 });
  assert.throws(() => parseJSON('no json here'));
});
