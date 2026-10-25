import { createHash } from 'node:crypto';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATE_KEYS = ['schemaVersion', 'monthId', 'seed', 'data', 'pendingEvents', 'processed', 'cursor', 'rngCursors'];

export class EventKernelError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'EventKernelError';
    this.code = code;
  }
}

const fail = (code, message = code) => { throw new EventKernelError(code, message); };
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function assertJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_JSON', 'JSON numbers must be finite');
    return;
  }
  if (typeof value !== 'object') fail('INVALID_JSON', 'State and event payloads must contain only JSON values');
  if (seen.has(value)) fail('INVALID_JSON', 'Cyclic data is not JSON-compatible');
  if (!Array.isArray(value) && !isRecord(value)) fail('INVALID_JSON', 'Only plain objects and arrays are JSON-compatible');
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.keys(value).length !== value.length || Object.keys(value).some((key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) fail('INVALID_JSON', 'Arrays must contain only dense indexed values');
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('INVALID_JSON', 'Sparse arrays and accessors are not JSON-compatible');
      assertJson(descriptor.value, seen);
    }
  } else {
    const keys = Object.keys(value);
    if (Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== keys.length) fail('INVALID_JSON', 'Objects must contain only enumerable string keys');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('INVALID_JSON', 'Accessors are not JSON-compatible');
      assertJson(descriptor.value, seen);
    }
  }
  seen.delete(value);
}

function cloneJson(value) {
  assertJson(value);
  return JSON.parse(JSON.stringify(value));
}

function freezeJson(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, canonical(value[key])]));
  return value;
}

function stableJson(value) { return JSON.stringify(canonical(value)); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function fingerprint(event) { return hash(stableJson(event)); }

function validSeed(seed) {
  if (!((typeof seed === 'string' && seed.length > 0) || (Number.isSafeInteger(seed) && seed >= 0))) fail('INVALID_SEED');
  return seed;
}

function monthBounds(monthId) {
  if (typeof monthId !== 'string' || !MONTH_RE.test(monthId)) fail('INVALID_MONTH');
  const [year, month] = monthId.split('-').map(Number);
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || new Date(start).getUTCFullYear() !== year || new Date(start).getUTCMonth() + 1 !== month) fail('INVALID_MONTH');
  return { start, end };
}

function validateTimestamp(timestamp, monthId) {
  const { start, end } = monthBounds(monthId);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || !Number.isFinite(new Date(timestamp).getTime())) fail('INVALID_TIME');
  if (timestamp < start || timestamp >= end) fail('MONTH_MISMATCH');
}

function validateEventTime(timestamp, monthId) {
  const { start } = monthBounds(monthId);
  if (!Number.isSafeInteger(timestamp) || timestamp < start || !Number.isFinite(new Date(timestamp).getTime())) fail('INVALID_TIME');
}

function validateEvent(input, monthId) {
  assertJson(input);
  if (!isRecord(input)) fail('INVALID_EVENT');
  const keys = ['id', 'monthId', 'atMs', 'priority', 'type', 'siteId', 'payload'];
  if (Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) fail('INVALID_EVENT', 'Event fields must match the event schema');
  if (typeof input.id !== 'string' || input.id.length === 0 || input.id.length > 256) fail('INVALID_EVENT');
  if (input.monthId !== monthId) fail('MONTH_MISMATCH');
  // Paid commitments may have arrivals after the month boundary. They remain
  // pending under this old-month kernel because its horizon cannot pass B.
  validateEventTime(input.atMs, monthId);
  if (!Number.isSafeInteger(input.priority)) fail('INVALID_EVENT', 'Event priority must be an integer');
  if (typeof input.type !== 'string' || input.type.length === 0 || input.type.length > 128) fail('INVALID_EVENT');
  if (typeof input.siteId !== 'string' || input.siteId.length === 0 || input.siteId.length > 256) fail('INVALID_EVENT');
  assertJson(input.payload);
  return freezeJson({
    id: input.id,
    monthId: input.monthId,
    atMs: input.atMs,
    priority: input.priority,
    type: input.type,
    siteId: input.siteId,
    payload: cloneJson(input.payload),
  });
}

function eventOrder(a, b) {
  const compareNumber = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  return compareNumber(a.atMs, b.atMs) || compareNumber(a.priority, b.priority) || compareText(a.id, b.id);
}

function validateCursor(cursor, monthId, processed) {
  if (cursor === null) return null;
  if (!isRecord(cursor) || Object.keys(cursor).sort(compareText).join(',') !== 'atMs,id,priority') fail('INVALID_CURSOR');
  validateTimestamp(cursor.atMs, monthId);
  if (!Number.isSafeInteger(cursor.priority) || typeof cursor.id !== 'string' || cursor.id.length === 0 || cursor.id.length > 256 || !Object.hasOwn(processed, cursor.id)) fail('INVALID_CURSOR');
  return Object.freeze({ atMs: cursor.atMs, priority: cursor.priority, id: cursor.id });
}

function cursorEvent(cursor) { return cursor && { atMs: cursor.atMs, priority: cursor.priority, id: cursor.id }; }
function compareCursor(event, cursor) { return eventOrder(event, cursorEvent(cursor)); }
function stepKey(siteId, step) { return JSON.stringify([siteId, step]); }

function cloneJournal(value, name) {
  if (!isRecord(value)) fail('INVALID_STATE', `${name} must be a JSON object`);
  return Object.assign(Object.create(null), cloneJson(value));
}

function validateState(input) {
  assertJson(input);
  if (!isRecord(input) || Object.keys(input).sort(compareText).join(',') !== [...STATE_KEYS].sort(compareText).join(',')) fail('INVALID_STATE', 'State fields must match the event kernel schema');
  if (input.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA_VERSION');
  monthBounds(input.monthId);
  validSeed(input.seed);
  assertJson(input.data);
  const processed = cloneJournal(input.processed, 'processed journal');
  for (const [id, value] of Object.entries(processed)) {
    if (id.length === 0 || id.length > 256 || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID_STATE', 'Malformed processed event journal');
  }
  const cursor = validateCursor(input.cursor, input.monthId, processed);
  if (!Array.isArray(input.pendingEvents)) fail('INVALID_STATE', 'pendingEvents must be an array');
  const byId = new Map();
  for (const raw of input.pendingEvents) {
    const event = validateEvent(raw, input.monthId);
    const prior = byId.get(event.id);
    if (prior && fingerprint(prior) !== fingerprint(event)) fail('DUPLICATE_EVENT_CONFLICT');
    if (!prior) byId.set(event.id, event);
    const priorFingerprint = processed[event.id];
    if (priorFingerprint && priorFingerprint !== fingerprint(event)) fail('DUPLICATE_EVENT_CONFLICT');
    if (!priorFingerprint && cursor && compareCursor(event, cursor) < 0) fail('LATE_EVENT');
  }
  const pendingEvents = [...byId.values()].sort(eventOrder);

  const rngCursors = cloneJournal(input.rngCursors, 'rng cursors');
  for (const [key, drawIndex] of Object.entries(rngCursors)) {
    let parsed;
    try { parsed = JSON.parse(key); } catch { fail('INVALID_STATE', 'Malformed RNG cursor key'); }
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || parsed[0].length === 0 || parsed[0].length > 256 || !Number.isSafeInteger(parsed[1]) || parsed[1] < 0 || !Number.isSafeInteger(drawIndex) || drawIndex < 0) fail('INVALID_STATE', 'Malformed RNG cursor');
  }
  return {
    schemaVersion: 1,
    monthId: input.monthId,
    seed: input.seed,
    data: cloneJson(input.data),
    pendingEvents,
    processed,
    cursor,
    rngCursors,
  };
}

/** Build a validated, immutable event-kernel checkpoint. */
export function createEventState(options) {
  assertJson(options);
  if (!isRecord(options)) fail('INVALID_STATE');
  const { monthId, seed, data, pendingEvents = [], processed = {}, cursor = null, rngCursors = {}, schemaVersion = 1 } = options;
  return freezeJson(validateState({ schemaVersion, monthId, seed, data, pendingEvents, processed, cursor, rngCursors }));
}

/**
 * Make a deterministic RNG stream for one site and absolute UTC second.
 * A kernel checkpoint carries draw counts across events and batch boundaries.
 */
export function createStepRng(seed, siteId, step, drawIndex = 0) {
  validSeed(seed);
  if (typeof siteId !== 'string' || siteId.length === 0 || !Number.isSafeInteger(step) || step < 0 || !Number.isSafeInteger(drawIndex) || drawIndex < 0) fail('INVALID_RNG_SCOPE');
  let draws = 0;
  const nextUint32 = () => {
    if (!Number.isSafeInteger(drawIndex + draws)) fail('RNG_DRAW_OVERFLOW');
    const bytes = createHash('sha256').update(stableJson(['extraction-event-rng-v1', seed, siteId, step, drawIndex + draws])).digest();
    draws += 1;
    return bytes.readUInt32BE(0);
  };
  const rng = {
    nextUint32,
    next() { return nextUint32() / 0x100000000; },
    int(maxExclusive) {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) fail('INVALID_RNG_RANGE');
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
      let value;
      do { value = nextUint32(); } while (value >= limit);
      return value % maxExclusive;
    },
  };
  Object.defineProperty(rng, 'drawsUsed', { enumerable: true, get: () => draws });
  return Object.freeze(rng);
}

/**
 * Apply at most maxEvents due records (`atMs < beforeMs`). Handler functions
 * are synchronous and must be pure apart from their returned JSON state and
 * supplied RNG. State persistence and retries belong to the caller.
 */
export function runEventBatch({ state: inputState, handlers, maxEvents, beforeMs }) {
  if (!Number.isSafeInteger(maxEvents) || maxEvents <= 0) fail('INVALID_BATCH_SIZE');
  if (!isRecord(handlers)) fail('INVALID_HANDLERS');
  const state = validateState(inputState);
  const { start, end } = monthBounds(state.monthId);
  if (!Number.isSafeInteger(beforeMs) || !Number.isFinite(new Date(beforeMs).getTime()) || beforeMs < start || beforeMs > end) fail('INVALID_TIME');
  for (const event of state.pendingEvents) {
    if (!Object.hasOwn(state.processed, event.id) && (!Object.hasOwn(handlers, event.type) || typeof handlers[event.type] !== 'function')) fail('UNKNOWN_EVENT_TYPE', `Unknown event type: ${event.type}`);
  }
  const dueCount = state.pendingEvents.findIndex((event) => event.atMs >= beforeMs);
  const eligibleCount = dueCount < 0 ? state.pendingEvents.length : dueCount;
  const takeCount = Math.min(maxEvents, eligibleCount);
  const selected = state.pendingEvents.slice(0, takeCount);
  const remaining = state.pendingEvents.slice(takeCount);
  const journal = state.processed;
  let data = state.data;
  let cursor = state.cursor;
  let appliedCount = 0;
  let noOpDuplicateCount = 0;
  const rngCursors = state.rngCursors;

  for (const event of selected) {
    const eventFingerprint = fingerprint(event);
    const priorFingerprint = journal[event.id];
    if (priorFingerprint) {
      if (priorFingerprint !== eventFingerprint) fail('DUPLICATE_EVENT_CONFLICT');
      noOpDuplicateCount += 1;
      continue;
    }
    if (cursor && compareCursor(event, cursor) < 0) fail('LATE_EVENT');
    const handler = Object.hasOwn(handlers, event.type) ? handlers[event.type] : undefined;
    if (typeof handler !== 'function') fail('UNKNOWN_EVENT_TYPE', `Unknown event type: ${event.type}`);
    const step = Math.floor(event.atMs / 1000);
    const key = stepKey(event.siteId, step);
    const rng = createStepRng(state.seed, event.siteId, step, rngCursors[key] ?? 0);
    let nextData;
    try {
      const handlerState = cloneJson(data);
      const result = handler(handlerState, event, rng);
      if (result && typeof result.then === 'function') fail('ASYNC_HANDLER');
      nextData = result === undefined ? handlerState : result;
      assertJson(nextData);
      nextData = cloneJson(nextData);
    } catch (error) {
      if (error instanceof EventKernelError) throw error;
      fail('HANDLER_FAILED', 'Event handler failed; batch was rolled back');
    }
    data = nextData;
    const nextDrawIndex = (rngCursors[key] ?? 0) + rng.drawsUsed;
    if (!Number.isSafeInteger(nextDrawIndex)) fail('RNG_DRAW_OVERFLOW');
    rngCursors[key] = nextDrawIndex;
    journal[event.id] = eventFingerprint;
    cursor = { atMs: event.atMs, priority: event.priority, id: event.id };
    appliedCount += 1;
  }

  const result = {
    state: freezeJson({
      schemaVersion: 1,
      monthId: state.monthId,
      seed: state.seed,
      data,
      pendingEvents: remaining,
      processed: journal,
      cursor,
      rngCursors,
    }),
    appliedCount,
    noOpDuplicateCount,
    examinedCount: selected.length,
  };
  return Object.freeze(result);
}
