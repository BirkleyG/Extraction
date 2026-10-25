import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { validateRuntimeEnvironment } from './server.js';

const [worldId, ownerUid, activeMonthId] = process.argv.slice(2);
if (!worldId || !ownerUid || !/^\d{4}-(0[1-9]|1[0-2])$/.test(activeMonthId || '')) {
  process.stderr.write('Usage: npm run bootstrap:world -- <world-id> <owner-uid> <YYYY-MM>\n');
  process.exit(2);
}
const runtime = validateRuntimeEnvironment(process.env);
if (!runtime.emulator || !runtime.projectId.startsWith('demo-')) throw new Error('World bootstrap is emulator-only');
const app = initializeApp({ projectId: runtime.projectId }, `extraction-bootstrap-${runtime.projectId}`);
const db = getFirestore(app);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const worldRef = db.collection('worlds').doc(sha(worldId));
const memberRef = worldRef.collection('owners').doc(sha(ownerUid));
await db.runTransaction(async (tx) => {
  const [world, member] = await Promise.all([
    tx.get(worldRef), tx.get(memberRef),
  ]);
  if (world.exists || member.exists) throw new Error('World or membership already exists; bootstrap refuses overwrite');
  tx.create(worldRef, { worldId, activeMonthId, status: 'active' });
  tx.create(memberRef, { uid: ownerUid, status: 'active', role: 'owner' });
});
process.stdout.write(`Bootstrapped world ${worldId} for owner ${ownerUid}\n`);
await app.delete();
