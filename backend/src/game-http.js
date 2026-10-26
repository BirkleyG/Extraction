// HTTP transport for game commands and the filtered read model. Identity comes only from a verified Firebase ID
// token; the month and clock come from the server; request bodies are allowlisted by GameService.
import { createServer } from 'node:http';
import { LedgerError } from './ledger.js';
import { UpgradeError } from './upgrades.js';
import { safeEqual } from './world-admin.js';

const BODY_LIMIT = 8192;
const KINDS = new Set(['enroll', 'buyUpgrade', 'hire', 'buyShaft', 'buyPad', 'buyShip', 'dispatch', 'setPolicy']);
const monthAt = (ms) => `${new Date(ms).getUTCFullYear()}-${String(new Date(ms).getUTCMonth() + 1).padStart(2, '0')}`;

function statusFor(code) {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (['NOT_FOUND', 'WORLD_NOT_FOUND', 'NOT_ENROLLED'].includes(code)) return 404;
  if (['STALE_MONTH', 'MONTH_CLOSED', 'STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'INSUFFICIENT_FUNDS', 'SHIP_BUSY', 'WEATHER_GROUNDED', 'FLEET_FULL', 'NO_CARGO', 'BUYER_FULL', 'BUYER_OUT_OF_FUNDS', 'INSUFFICIENT_STOCK', 'EXCEEDS_SHIP_CAPACITY', 'WORLD_CLOSED', 'AT_CAP', 'ALREADY_ENROLLED', 'NO_HABITAT_CAPACITY', 'NO_SHAFT_CAPACITY', 'CATCHING_UP', 'WORLD_FULL', 'JOIN_DISABLED'].includes(code)) return 409;
  if (['METHOD_NOT_ALLOWED'].includes(code)) return 405;
  if (code === 'BODY_TOO_LARGE') return 413;
  if (['INVALID_COMMAND', 'INVALID_AMOUNT', 'INVALID_VERSION', 'INVALID_WORLD', 'INJECTED_FIELD', 'INVALID_PATH', 'UNKNOWN_UPGRADE', 'INVALID_MODE', 'INVALID_COUNT', 'INVALID_LEVEL', 'INVALID_SHAFT', 'INVALID_UNITS', 'UNKNOWN_DESTINATION', 'UNKNOWN_SHIP', 'UNKNOWN_SHIP_CLASS', 'INVALID_PAD', 'UNKNOWN_SHAFT', 'INVALID_FUNDS'].includes(code)) return 400;
  return 500;
}

async function readJson(req) {
  const type = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (type !== 'application/json') throw new LedgerError('INVALID_COMMAND');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > BODY_LIMIT) throw new LedgerError('BODY_TOO_LARGE'); chunks.push(chunk); }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new LedgerError('INVALID_COMMAND'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LedgerError('INVALID_COMMAND');
  return value;
}

async function uidOf(req, auth) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length < 20 || header.length > 16384) throw new LedgerError('UNAUTHENTICATED');
  try {
    const decoded = await auth.verifyIdToken(header.slice(7), true);
    if (!decoded?.uid || typeof decoded.uid !== 'string') throw new Error('bad');
    return decoded.uid;
  } catch { throw new LedgerError('UNAUTHENTICATED'); }
}

export function createGameHttpServer({ auth, game, clock = Date.now, allowOrigin = null, admin = null, internalToken = null }) {
  if (!auth?.verifyIdToken || !game) throw new TypeError('Verified Firebase Auth and a GameService are required');
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.search || url.hash) throw new LedgerError('INVALID_PATH');
      if (url.pathname === '/internal/tick') {
        // Cloud Scheduler: prepare the month and close finished ones. Guarded by a shared secret header.
        if (req.method !== 'POST') throw new LedgerError('METHOD_NOT_ALLOWED');
        if (!admin || !internalToken || typeof req.headers['x-internal-token'] !== 'string' || !safeEqual(req.headers['x-internal-token'], internalToken)) throw new LedgerError('UNAUTHENTICATED');
        const body = await readJson(req);
        if (typeof body.worldId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(body.worldId)) throw new LedgerError('INVALID_WORLD');
        const out = await admin.tick({ worldId: body.worldId, nowMs: clock() });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(out)); return;
      }
      const match = /^\/v1\/worlds\/([A-Za-z0-9_-]{1,160})\/(state|join|commands\/([A-Za-z]+))$/.exec(url.pathname);
      if (!match) throw new LedgerError('NOT_FOUND');
      const [, worldId, route, kind] = match;
      const uid = await uidOf(req, auth);
      const now = clock();
      if (!Number.isSafeInteger(now) || now < 0) throw new LedgerError('INVALID_CLOCK');
      const monthId = monthAt(now);
      const context = { auth: { uid }, worldId, activeMonthId: monthId, now };
      let result;
      if (route === 'join') {
        if (req.method !== 'POST') throw new LedgerError('METHOD_NOT_ALLOWED');
        if (!admin) throw new LedgerError('NOT_FOUND');
        const body = await readJson(req);
        for (const key of Object.keys(body)) if (key !== 'inviteCode') throw new LedgerError('INJECTED_FIELD');
        result = await admin.join({ worldId, uid, inviteCode: body.inviteCode, nowMs: now });
      } else if (route === 'state') {
        if (req.method !== 'GET') throw new LedgerError('METHOD_NOT_ALLOWED');
        result = await game.state(uid, monthId, context);
      } else {
        if (req.method !== 'POST') throw new LedgerError('METHOD_NOT_ALLOWED');
        if (!KINDS.has(kind)) throw new LedgerError('NOT_FOUND');
        const command = await readJson(req);
        if (command.monthId === undefined) command.monthId = monthId;
        result = await game[kind](command, context);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const code = error instanceof LedgerError || error instanceof UpgradeError ? error.code : 'INTERNAL_ERROR';
      const status = statusFor(code);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: status === 500 ? 'INTERNAL_ERROR' : code }));
    }
  });
}
