import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceGame, createGameState } from '../model.js';
import { createLocalRuntime } from '../local-runtime.js';

function fakeWorker() {
  return {
    requests: [], terminated: 0,
    postMessage(data) { this.requests.push(data); },
    terminate() { this.terminated++; },
    answer(index, overrides = {}) {
      const request = this.requests[index];
      this.onmessage({ data: { id: request.id, result: advanceGame(request.state, request.seconds, request.maxSteps), ...overrides } });
    },
  };
}

test('fallback exactly matches the model and preserves argument errors', async () => {
  const runtime = createLocalRuntime({ workerFactory() { throw new Error('unsupported'); } });
  const state = createGameState();
  assert.deepEqual(await runtime.advance(state, 4, 3), advanceGame(state, 4, 3));
  await assert.rejects(runtime.advance(state, -1), { code: 'INVALID_STATE' });
  await assert.rejects(runtime.advance(state, 1, 0), { code: 'INVALID_BATCH' });
  runtime.dispose();
});

test('worker results correlate by monotonic IDs, including out of order and unknown IDs', async () => {
  const worker = fakeWorker();
  const runtime = createLocalRuntime({ workerFactory: () => worker });
  const state = createGameState();
  const first = runtime.advance(state, 2);
  const second = runtime.advance(state, 3);
  assert(worker.requests[1].id > worker.requests[0].id);
  worker.onmessage({ data: { id: 9999, result: {} } });
  worker.answer(1);
  worker.answer(0);
  assert.deepEqual(await first, advanceGame(state, 2));
  assert.deepEqual(await second, advanceGame(state, 3));
  runtime.dispose();
  assert.equal(worker.terminated, 1);
});

test('worker error codes survive and malformed results terminate the worker', async () => {
  const worker = fakeWorker();
  const runtime = createLocalRuntime({ workerFactory: () => worker });
  const failed = runtime.advance(createGameState(), 1);
  worker.onmessage({ data: { id: worker.requests[0].id, error: { code: 'INVALID_SAVE', message: 'bad save' } } });
  await assert.rejects(failed, { code: 'INVALID_SAVE' });
  const malformed = runtime.advance(createGameState(), 2);
  worker.answer(1, { result: { processedSeconds: 1, remainingSeconds: 0, state: {} } });
  await assert.rejects(malformed, { code: 'INVALID_WORKER_RESULT' });
  assert.equal(worker.terminated, 1);
  runtime.dispose();
});

test('timeout rejects every pending request, terminates, then uses fallback', async () => {
  const worker = fakeWorker();
  const runtime = createLocalRuntime({ workerFactory: () => worker, timeoutMs: 5 });
  const state = createGameState();
  const results = await Promise.allSettled([runtime.advance(state, 1), runtime.advance(state, 2)]);
  assert(results.every((result) => result.status === 'rejected' && result.reason.code === 'LOCAL_WORKER_TIMEOUT'));
  assert.equal(worker.terminated, 1);
  assert.deepEqual(await runtime.advance(state, 1), advanceGame(state, 1));
  runtime.dispose();
});

test('dispose rejects pending and future work and ignores late replies', async () => {
  const worker = fakeWorker();
  const runtime = createLocalRuntime({ workerFactory: () => worker });
  const pending = runtime.advance(createGameState(), 1);
  runtime.dispose();
  await assert.rejects(pending, { code: 'LOCAL_RUNTIME_DISPOSED' });
  worker.answer(0);
  await assert.rejects(runtime.advance(createGameState(), 1), { code: 'LOCAL_RUNTIME_DISPOSED' });
  assert.equal(worker.terminated, 1);
});

test('synchronous post failure falls back and host validates before posting', async () => {
  const worker = fakeWorker();
  worker.postMessage = () => { throw new Error('clone failed'); };
  const runtime = createLocalRuntime({ workerFactory: () => worker });
  await assert.rejects(runtime.advance({}, 1), { code: 'INVALID_SAVE' });
  const state = createGameState();
  assert.deepEqual(await runtime.advance(state, 1), advanceGame(state, 1));
  assert.equal(worker.terminated, 1);
  runtime.dispose();
});

test('asynchronous worker startup failure falls back without applying twice', async () => {
  const worker = fakeWorker();
  const runtime = createLocalRuntime({ workerFactory: () => worker });
  const state = createGameState();
  const pending = runtime.advance(state, 2);
  worker.onerror({ message: 'module unavailable' });
  worker.answer(0);
  assert.deepEqual(await pending, advanceGame(state, 2));
  assert.equal(worker.terminated, 1);
  runtime.dispose();
});
