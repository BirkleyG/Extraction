import { createHash, randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createLedgerHttpServer } from '../src/http.js';
import { LedgerCommandService } from '../src/commands.js';
import { FirestoreLedgerRepository } from '../src/firestore-repository.js';
import { validateRuntimeEnvironment } from '../src/server.js';

const runtime = validateRuntimeEnvironment(process.env);
if (runtime.projectId !== 'demo-extraction' || !runtime.emulator) throw new Error('Demo requires the demo-extraction Auth and Firestore emulators');

const sha = (value) => createHash('sha256').update(value).digest('hex');
const monthId = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
const app = initializeApp({ projectId: runtime.projectId }, `ledger-demo-${randomUUID()}`);
const auth = getAuth(app);
const db = getFirestore(app);
let uid;
let server;

try {
  const signup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: 'demo-password-123', returnSecureToken: true }),
  });
  if (!signup.ok) throw new Error(`Demo Auth signup failed (HTTP ${signup.status})`);
  const { localId, idToken } = await signup.json();
  uid = localId;
  await auth.verifyIdToken(idToken, true);

  const worldId = `ledger-demo-${randomUUID()}`;
  const worldRef = db.collection('worlds').doc(sha(worldId));
  const ownerRef = worldRef.collection('owners').doc(sha(uid));
  await db.runTransaction(async (tx) => {
    const [world, owner] = await Promise.all([tx.get(worldRef), tx.get(ownerRef)]);
    if (world.exists || owner.exists) throw new Error('Demo bootstrap collision');
    tx.create(worldRef, { worldId, activeMonthId: monthId, status: 'active' });
    tx.create(ownerRef, { uid, status: 'active', role: 'owner' });
  });

  const service = new LedgerCommandService(new FirestoreLedgerRepository(db), { starterGrantAmount: 100 });
  server = createLedgerHttpServer({ auth, service, clock: Date.now });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1/worlds/${worldId}`;
  const send = async (path, body) => fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const grant = await send('grant', { monthId, requestId: 'demo-grant', expectedVersion: 0 });
  if (!grant.ok) throw new Error(`Demo grant failed (HTTP ${grant.status})`);
  process.stdout.write(`grant status: ${grant.status}\n`);

  const fundBody = { monthId, requestId: 'demo-fund', expectedVersion: 1, amount: 25 };
  const fund = await send('fund', fundBody);
  if (!fund.ok) throw new Error(`Demo fund failed (HTTP ${fund.status})`);
  process.stdout.write(`fund status: ${fund.status}\n`);

  const repeat = await send('fund', fundBody);
  if (!repeat.ok) throw new Error(`Demo idempotent retry failed (HTTP ${repeat.status})`);
  process.stdout.write(`repeat status: ${repeat.status}\n`);

  const freshService = new LedgerCommandService(new FirestoreLedgerRepository(getFirestore(app)), { starterGrantAmount: 100 });
  const wallet = await freshService.wallet(uid, monthId, { auth: { uid }, worldId, activeMonthId: monthId, now: Date.now() });
  if (wallet.spendable !== 75 || wallet.escrow !== 25 || wallet.totalOwned !== 100 || wallet.version !== 2) throw new Error('Demo wallet did not match expected totals');
  process.stdout.write(`wallet totals: spendable=${wallet.spendable} escrow=${wallet.escrow} total=${wallet.totalOwned} version=${wallet.version}\n`);
} finally {
  if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (uid) {
    try { await auth.deleteUser(uid); } catch { /* Emulator cleanup. */ }
  }
  await app.delete();
}
