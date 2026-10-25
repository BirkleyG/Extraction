import { advanceGame, validateGameState } from './model.js';

const MAX_STEPS = 1000;
const error = (code, message = code) => Object.assign(new Error(message), { code });

// This runtime computes local sandbox state only. Callers still validate and own
// applying results, including discarding results made stale by another action.
export function createLocalRuntime({ workerFactory, timeoutMs = 15000 } = {}) {
  let worker;
  let unavailable = false;
  let disposed = false;
  let nextId = 0;
  let receivedResponse = false;
  const pending = new Map();
  const stop = (reason, fallback = false) => {
    unavailable = true;
    worker?.terminate();
    worker = undefined;
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      if (fallback) job.fallback();
      else job.reject(reason);
    }
    pending.clear();
  };
  const receive = ({ data }) => {
    const job = pending.get(data?.id);
    if (!job) return;
    receivedResponse = true;
    pending.delete(data.id);
    clearTimeout(job.timer);
    if (data.error) {
      job.reject(error(data.error.code || 'LOCAL_WORKER_ERROR', data.error.message));
      return;
    }
    try {
      const result = data.result;
      if (!result || result.processedSeconds !== job.processedSeconds ||
          result.remainingSeconds !== job.remainingSeconds ||
          result.state?.simSeconds !== job.simSeconds + job.processedSeconds) {
        throw error('INVALID_WORKER_RESULT');
      }
      job.resolve({ ...result, state: validateGameState(result.state) });
    } catch (cause) {
      job.reject(cause);
      stop(error('INVALID_WORKER_RESULT'));
    }
  };
  const getWorker = () => {
    if (worker || unavailable) return worker;
    try {
      if (!workerFactory && typeof Worker === 'undefined') {
        unavailable = true;
        return undefined;
      }
      worker = workerFactory ? workerFactory() : new Worker(new URL('./simulation-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = receive;
      worker.onerror = () => stop(error('LOCAL_WORKER_ERROR'), !receivedResponse);
      worker.onmessageerror = () => stop(error('LOCAL_WORKER_ERROR'));
    } catch {
      unavailable = true;
      worker?.terminate();
      worker = undefined;
    }
    return worker;
  };
  return {
    async advance(inputState, seconds, maxSteps = 300) {
      if (disposed) throw error('LOCAL_RUNTIME_DISPOSED');
      // Delegate invalid arguments to the model to preserve its error codes.
      if (!Number.isSafeInteger(seconds) || seconds < 0 ||
          !Number.isSafeInteger(maxSteps) || maxSteps < 1) {
        return advanceGame(inputState, seconds, maxSteps);
      }
      const batch = Math.min(maxSteps, MAX_STEPS);
      const state = validateGameState(inputState);
      const activeWorker = getWorker();
      if (!activeWorker) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (disposed) throw error('LOCAL_RUNTIME_DISPOSED');
        return advanceGame(state, seconds, batch);
      }
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const processedSeconds = Math.min(seconds, batch);
        const timer = setTimeout(() => stop(error('LOCAL_WORKER_TIMEOUT')), timeoutMs);
        const fallback = () => setTimeout(() => {
          try {
            if (disposed) throw error('LOCAL_RUNTIME_DISPOSED');
            resolve(advanceGame(state, seconds, batch));
          } catch (cause) { reject(cause); }
        }, 0);
        pending.set(id, { resolve, reject, fallback, timer, processedSeconds, remainingSeconds: seconds - processedSeconds, simSeconds: state.simSeconds });
        try {
          activeWorker.postMessage({ id, state, seconds, maxSteps: batch });
        } catch {
          pending.delete(id);
          clearTimeout(timer);
          stop(error('LOCAL_WORKER_ERROR'));
          // A synchronous startup/clone failure has no delivered result.
          fallback();
        }
      });
    },
    dispose() {
      disposed = true;
      stop(error('LOCAL_RUNTIME_DISPOSED'));
    },
  };
}
