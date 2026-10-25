import test from 'node:test';
import assert from 'node:assert/strict';
import { EventKernelError, createEventState, createStepRng, runEventBatch } from '../src/events.js';

const monthId = '2026-10';
const start = Date.UTC(2026, 9, 1);
const boundary = Date.UTC(2026, 10, 1);
const code = (expected) => (error) => error instanceof EventKernelError && error.code === expected;
const event = (id, atMs, fields = {}) => ({
  id, monthId, atMs, priority: 0, type: 'tick', siteId: 'mine-a', payload: {}, ...fields,
});
const state = (pendingEvents, fields = {}) => createEventState({ monthId, seed: 'fixture-seed', data: { ticks: 0, draws: [] }, pendingEvents, ...fields });
const tickHandlers = {
  tick(data, _event, rng) {
    data.ticks += 1;
    data.draws.push(rng.nextUint32());
    return data;
  },
};
const tickEvents = (count) => Array.from({ length: count }, (_, index) => event(`tick-${String(index).padStart(4, '0')}`, start + 1000 * (index + 1)));

test('T17-01 fixture: 600 seeded one-second ticks match one batch, one-event batches, and reordered input', () => {
  const events = tickEvents(600);
  const oneBatch = runEventBatch({ state: state(events), handlers: tickHandlers, maxEvents: 600, beforeMs: boundary });
  let manyBatches = state([...events].reverse());
  for (let index = 0; index < 600; index += 1) {
    manyBatches = runEventBatch({ state: manyBatches, handlers: tickHandlers, maxEvents: 1, beforeMs: boundary }).state;
  }
  assert.deepEqual(manyBatches, oneBatch.state);
  assert.equal(oneBatch.appliedCount, 600);
  assert.equal(oneBatch.state.data.ticks, 600);
  assert.equal(Object.keys(oneBatch.state.processed).length, 600);
  assert.equal(oneBatch.state.pendingEvents.length, 0);
});

test('seeded RNG is stable and changes with seed, site, or absolute second step', () => {
  const base = createStepRng('seed-a', 'site-a', 100).nextUint32();
  assert.equal(createStepRng('seed-a', 'site-a', 100).nextUint32(), base);
  assert.notEqual(createStepRng('seed-b', 'site-a', 100).nextUint32(), base);
  assert.notEqual(createStepRng('seed-a', 'site-b', 100).nextUint32(), base);
  assert.notEqual(createStepRng('seed-a', 'site-a', 101).nextUint32(), base);
});

test('draw cursors continue across events in one step and across batch boundaries', () => {
  const sameStep = [
    event('draw-1', start + 1000, { siteId: 'one-site' }),
    event('draw-2', start + 1001, { siteId: 'one-site' }),
  ];
  const handler = { tick(data, _event, rng) { data.draws.push(rng.nextUint32()); return data; } };
  const all = runEventBatch({ state: state(sameStep), handlers: handler, maxEvents: 2, beforeMs: boundary }).state;
  let chunked = runEventBatch({ state: state(sameStep), handlers: handler, maxEvents: 1, beforeMs: boundary }).state;
  chunked = runEventBatch({ state: chunked, handlers: handler, maxEvents: 1, beforeMs: boundary }).state;
  assert.deepEqual(chunked, all);
  assert.notEqual(all.data.draws[0], all.data.draws[1]);
});

test('exact duplicates are no-ops; conflicting IDs are rejected', () => {
  const duplicate = event('same', start + 1000);
  const deduped = runEventBatch({ state: state([duplicate, { ...duplicate }]), handlers: tickHandlers, maxEvents: 5, beforeMs: boundary });
  assert.equal(deduped.appliedCount, 1);
  assert.equal(deduped.state.data.ticks, 1);

  const alreadyProcessed = createEventState({ ...deduped.state, pendingEvents: [duplicate] });
  const retried = runEventBatch({ state: alreadyProcessed, handlers: {}, maxEvents: 1, beforeMs: boundary });
  assert.equal(retried.noOpDuplicateCount, 1);
  assert.equal(retried.appliedCount, 0);
  assert.equal(retried.state.data.ticks, 1);

  assert.throws(() => state([duplicate, { ...duplicate, payload: { altered: true } }]), code('DUPLICATE_EVENT_CONFLICT'));
  assert.throws(() => createEventState({ ...deduped.state, pendingEvents: [{ ...duplicate, payload: { altered: true } }] }), code('DUPLICATE_EVENT_CONFLICT'));
});

test('equal-time events use integer priority then deterministic code-unit ID order', () => {
  const time = start + 1000;
  const events = [
    event('b', time, { priority: 1 }),
    event('z', time, { priority: 0 }),
    event('a', time, { priority: 0 }),
  ];
  const result = runEventBatch({
    state: state(events), maxEvents: 3, beforeMs: boundary,
    handlers: { tick(data, eventValue) { data.draws.push(`${eventValue.priority}:${eventValue.id}`); return data; } },
  });
  assert.deepEqual(result.state.data.draws, ['0:a', '0:z', '1:b']);
  assert.deepEqual(result.state.pendingEvents, []);
});

test('exclusive horizon leaves boundary events pending and rejects processing beyond the month', () => {
  const events = [event('last-ms', boundary - 1), event('at-boundary', boundary), event('post-boundary', boundary + 1)];
  const beforeLast = runEventBatch({ state: state(events), handlers: tickHandlers, maxEvents: 5, beforeMs: boundary - 1 });
  assert.equal(beforeLast.appliedCount, 0);
  const atBoundary = runEventBatch({ state: beforeLast.state, handlers: tickHandlers, maxEvents: 5, beforeMs: boundary });
  assert.equal(atBoundary.appliedCount, 1);
  assert.deepEqual(atBoundary.state.pendingEvents.map(({ id }) => id), ['at-boundary', 'post-boundary']);
  assert.throws(() => runEventBatch({ state: atBoundary.state, handlers: tickHandlers, maxEvents: 5, beforeMs: boundary + 1 }), code('INVALID_TIME'));
});

test('maxEvents bounds work and repeated batches have no offline-time cap', () => {
  let checkpoint = state(tickEvents(600));
  const first = runEventBatch({ state: checkpoint, handlers: tickHandlers, maxEvents: 25, beforeMs: boundary });
  assert.equal(first.examinedCount, 25);
  assert.equal(first.state.pendingEvents.length, 575);
  checkpoint = first.state;
  for (let index = 1; index < 24; index += 1) checkpoint = runEventBatch({ state: checkpoint, handlers: tickHandlers, maxEvents: 25, beforeMs: boundary }).state;
  assert.equal(checkpoint.data.ticks, 600);
  assert.equal(checkpoint.pendingEvents.length, 0);
});

test('a thrown handler rolls back the complete local batch and leaves inputs unchanged', () => {
  const originalData = { ticks: 0, draws: [] };
  const events = [event('good', start + 1000), event('bad', start + 2000)];
  const input = createEventState({ monthId, seed: 'fixture-seed', data: originalData, pendingEvents: events });
  assert.throws(() => runEventBatch({
    state: input, maxEvents: 2, beforeMs: boundary,
    handlers: {
      tick(data, item, rng) {
        data.ticks += 1;
        data.draws.push(rng.nextUint32());
        if (item.id === 'bad') throw new Error('fixture failure');
        return data;
      },
    },
  }), code('HANDLER_FAILED'));
  assert.equal(originalData.ticks, 0);
  assert.deepEqual(originalData.draws, []);
  assert.equal(input.data.ticks, 0);
  assert.equal(input.pendingEvents.length, 2);
  assert.equal(Object.keys(input.processed).length, 0);
});

test('malformed JSON, unsafe time, month mismatch, late events, and unknown types fail closed', () => {
  assert.throws(() => createEventState({ monthId, seed: 's', data: { bad: NaN } }), code('INVALID_JSON'));
  assert.throws(() => createEventState({ monthId, seed: 's', data: { bad: () => 1 } }), code('INVALID_JSON'));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => createEventState({ monthId, seed: 's', data: cyclic }), code('INVALID_JSON'));
  assert.throws(() => state([event('unsafe', Number.MAX_SAFE_INTEGER + 1)]), code('INVALID_TIME'));
  assert.throws(() => state([{ ...event('wrong-month', start + 1000), monthId: '2026-11' }]), code('MONTH_MISMATCH'));
  assert.throws(() => createEventState({ monthId, seed: '', data: {} }), code('INVALID_SEED'));
  assert.throws(() => createEventState({ monthId, seed: 's', data: {}, schemaVersion: 2 }), code('UNSUPPORTED_SCHEMA_VERSION'));
  assert.throws(() => runEventBatch({ state: state([event('unknown', start + 50_000)]), handlers: {}, maxEvents: 1, beforeMs: start + 1000 }), code('UNKNOWN_EVENT_TYPE'));
  assert.throws(() => runEventBatch({ state: state([]), handlers: {}, maxEvents: 1, beforeMs: Number.NaN }), code('INVALID_TIME'));

  const late = event('late', start + 1000);
  const later = event('later', start + 2000);
  const processed = runEventBatch({ state: state([later]), handlers: tickHandlers, maxEvents: 1, beforeMs: boundary }).state;
  assert.throws(() => createEventState({ ...processed, pendingEvents: [late] }), code('LATE_EVENT'));

  const accessorOptions = { seed: 's', data: {} };
  Object.defineProperty(accessorOptions, 'monthId', { enumerable: true, get: () => monthId });
  assert.throws(() => createEventState(accessorOptions), code('INVALID_JSON'));
  const accessorEvent = event('accessor', start + 1000);
  Object.defineProperty(accessorEvent, 'priority', { enumerable: true, get: () => 0 });
  assert.throws(() => state([accessorEvent]), code('INVALID_JSON'));
});

test('RNG draw cursor overflow rolls back the event batch', () => {
  const item = event('overflow', start + 1000, { siteId: 'overflow-site' });
  const step = Math.floor(item.atMs / 1000);
  const cursorKey = JSON.stringify([item.siteId, step]);
  const input = state([item], { rngCursors: { [cursorKey]: Number.MAX_SAFE_INTEGER } });
  assert.throws(() => runEventBatch({ state: input, handlers: tickHandlers, maxEvents: 1, beforeMs: boundary }), code('RNG_DRAW_OVERFLOW'));
  assert.equal(input.data.ticks, 0);
  assert.equal(input.pendingEvents.length, 1);
});

test('pending events are returned in canonical order regardless of input order', () => {
  const events = [event('c', start + 3000), event('a', start + 1000), event('b', start + 2000)];
  const result = runEventBatch({ state: state(events), handlers: tickHandlers, maxEvents: 1, beforeMs: start + 2000 });
  assert.deepEqual(result.state.pendingEvents.map(({ id }) => id), ['b', 'c']);
});
