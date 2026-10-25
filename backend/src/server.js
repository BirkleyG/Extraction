import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { LedgerCommandService } from './commands.js';
import { FirestoreLedgerRepository } from './firestore-repository.js';
import { createLedgerHttpServer } from './http.js';

function localLoopback(hostPort) {
  try {
    const parsed = new URL(`http://${hostPort}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !parsed.port) return false;
    const port = Number(parsed.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
    return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase());
  } catch { return false; }
}

export function validateRuntimeEnvironment(env = process.env) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID must be explicitly configured');
  const authEmulator = env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulator = env.FIRESTORE_EMULATOR_HOST;
  if (Boolean(authEmulator) !== Boolean(firestoreEmulator)) throw new Error('Auth and Firestore emulators must both be configured');
  if (authEmulator || firestoreEmulator) {
    if (!projectId.startsWith('demo-')) throw new Error('Emulator use requires a demo-* project ID');
    if (!localLoopback(authEmulator) || !localLoopback(firestoreEmulator)) throw new Error('Emulator endpoints must be loopback addresses');
    return { projectId, emulator: true };
  }
  if (projectId.startsWith('demo-')) throw new Error('A demo-* project must use explicitly configured local emulators');
  return { projectId, emulator: false };
}

export function parseGrantAmount(value) {
  if (!value || !/^[1-9]\d*$/.test(value)) throw new Error('STARTER_GRANT_AMOUNT must be explicitly configured as a positive safe integer');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new Error('STARTER_GRANT_AMOUNT must be a positive safe integer');
  return amount;
}

export function buildServer(env = process.env) {
  const runtime = validateRuntimeEnvironment(env);
  const starterGrantAmount = parseGrantAmount(env.STARTER_GRANT_AMOUNT);
  const app = initializeApp({ projectId: runtime.projectId, ...(runtime.emulator ? {} : { credential: applicationDefault() }) }, `extraction-ledger-${runtime.projectId}`);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const repository = new FirestoreLedgerRepository(firestore);
  const service = new LedgerCommandService(repository, { starterGrantAmount });
  return createLedgerHttpServer({ auth, service });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const server = buildServer();
    const port = Number(process.env.PORT || 8787);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
    server.listen(port, '127.0.0.1', () => process.stdout.write(`Ledger server listening on 127.0.0.1:${port}\n`));
  } catch (error) {
    process.stderr.write(`Ledger server startup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
