import { createServer } from 'node:http';
import { LedgerError } from './ledger.js';

const BODY_LIMIT = 8192;
const allowedCommandKeys = new Set(['monthId', 'requestId', 'expectedVersion', 'amount']);

function monthAt(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new LedgerError('INVALID_CLOCK');
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function statusFor(code) {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'WORLD_NOT_FOUND' || code === 'NOT_FOUND') return 404;
  if (code === 'INVALID_COMMAND' || code === 'INVALID_AMOUNT' || code === 'INVALID_VERSION' || code === 'INVALID_WORLD' || code === 'INJECTED_FIELD') return 400;
  if (code === 'INVALID_PATH') return 400;
  if (code === 'STALE_MONTH' || code === 'STALE_VERSION' || code === 'IDEMPOTENCY_CONFLICT' || code === 'START_GRANT_ALREADY_CLAIMED' || code === 'INSUFFICIENT_FUNDS' || code === 'WORLD_CLOSED') return 409;
  return 500;
}

async function readJson(req) {
  const type = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (type !== 'application/json') throw new LedgerError('INVALID_COMMAND');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new LedgerError('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new LedgerError('INVALID_COMMAND'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LedgerError('INVALID_COMMAND');
  for (const key of Object.keys(value)) if (!allowedCommandKeys.has(key)) throw new LedgerError('INJECTED_FIELD');
  return value;
}

async function requireEmptyBody(req) {
  if (req.headers['content-length'] && req.headers['content-length'] !== '0') throw new LedgerError('INVALID_COMMAND');
  for await (const chunk of req) if (chunk.length) throw new LedgerError('INVALID_COMMAND');
}

async function authenticatedUid(req, auth) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length < 20 || header.length > 16384) throw new LedgerError('UNAUTHENTICATED');
  try {
    const decoded = await auth.verifyIdToken(header.slice(7), true);
    if (!decoded || typeof decoded.uid !== 'string' || !decoded.uid) throw new Error('invalid identity');
    return decoded.uid;
  } catch {
    throw new LedgerError('UNAUTHENTICATED');
  }
}

export function createLedgerHttpServer({ auth, service, clock = Date.now, maxBodyBytes = BODY_LIMIT }) {
  if (!auth?.verifyIdToken || !service) throw new TypeError('Verified Firebase Auth and a command service are required');
  if (maxBodyBytes !== BODY_LIMIT) throw new TypeError('Request size limit is fixed at 8192 bytes');
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.search || url.hash) throw new LedgerError('INVALID_PATH');
      const match = /^\/v1\/worlds\/([A-Za-z0-9_-]{1,160})\/(wallet|grant|fund|release)$/.exec(url.pathname);
      if (!match) throw new LedgerError('NOT_FOUND');
      const [, worldId, action] = match;
      const uid = await authenticatedUid(req, auth);
      const now = clock();
      if (!Number.isSafeInteger(now) || now < 0) throw new LedgerError('INVALID_CLOCK');
      const monthId = monthAt(now);
      const context = { auth: { uid }, worldId, activeMonthId: monthId, now };
      let result;
      if (action === 'wallet') {
        if (req.method !== 'GET') throw new LedgerError('METHOD_NOT_ALLOWED');
        await requireEmptyBody(req);
        result = await service.wallet(uid, monthId, context);
      } else {
        if (req.method !== 'POST') throw new LedgerError('METHOD_NOT_ALLOWED');
        const command = await readJson(req);
        if (!command.monthId) command.monthId = monthId;
        if (action === 'grant') {
          if ('amount' in command) throw new LedgerError('INJECTED_FIELD');
          result = await service.grantStarter(command, context);
        } else if (!('amount' in command)) throw new LedgerError('INVALID_AMOUNT');
        else if (action === 'fund') result = await service.fundEscrow(command, context);
        else result = await service.releaseEscrow(command, context);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const code = error instanceof LedgerError ? error.code : 'INTERNAL_ERROR';
      const status = code === 'BODY_TOO_LARGE' ? 413 : code === 'METHOD_NOT_ALLOWED' ? 405 : statusFor(code);
      const publicCode = status === 500 ? 'INTERNAL_ERROR' : code;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: publicCode }));
    }
  });
}
