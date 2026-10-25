import { advanceGame } from './model.js';

self.onmessage = ({ data }) => {
  const id = data?.id;
  try {
    if (!Number.isSafeInteger(id) || id < 1 ||
        !Number.isSafeInteger(data.maxSteps) || data.maxSteps < 1 || data.maxSteps > 1000) {
      throw Object.assign(new Error('Invalid local simulation request'), { code: 'INVALID_WORKER_REQUEST' });
    }
    const result = advanceGame(data.state, data.seconds, data.maxSteps);
    self.postMessage({ id, result });
  } catch (cause) {
    self.postMessage({ id, error: { code: cause.code || 'LOCAL_WORKER_ERROR', message: cause.message } });
  }
};
