/** Authenticated, serialized access to the one authoritative game. */
export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export function createCanonicalClient({ baseUrl, worldId, token, fetchImpl = globalThis.fetch, requestId = () => globalThis.crypto.randomUUID() }) {
  let version;
  let chain = Promise.resolve();
  let pendingRead;
  async function call(path = 'game', body) {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/worlds/${encodeURIComponent(worldId)}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${await token()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new ApiError(response.status, json.error || 'ERROR');
      error.snapshot = json;
      throw error;
    }
    return json;
  }
  function accept(result) {
    if (!result.state || !Number.isInteger(result.version)) throw new ApiError(502, 'INVALID_GAME_RESPONSE');
    version = result.version;
    return result;
  }
  async function read() { return accept(await call()); }
  function enqueue(work) {
    const result = chain.then(work);
    chain = result.catch(() => {});
    return result;
  }
  function fetchView() {
    if (!pendingRead) pendingRead = enqueue(read).finally(() => { pendingRead = undefined; });
    return pendingRead;
  }
  function send(commands) {
    return enqueue(async () => {
      let result;
      for (const command of commands) {
        const [kind, payload = {}] = Array.isArray(command) ? command : [command.kind, command.payload];
        const body = { requestId: requestId(), ...(version === undefined ? {} : { expectedVersion: version }), kind, payload };
        let refreshed = false;
        let retried = false;
        for (;;) {
          try { result = accept(await call('game', body)); break; }
          catch (error) {
            // The server advances bounded catch-up work but applies no command.
            // Return that authoritative snapshot so callers freeze actions and poll.
            if (error.code === 'CATCHING_UP' && error.snapshot?.state) return accept(error.snapshot);
            if (error.code === 'STALE_VERSION' && !refreshed) {
              await read(); body.expectedVersion = version; refreshed = true; continue;
            }
            // A lost response may follow a committed command. Keep its id and body.
            if ((!error.status || error.status >= 500) && !retried) { retried = true; continue; }
            throw error;
          }
        }
      }
      return result;
    });
  }
  return { call, fetchView, send, idle: () => chain };
}
