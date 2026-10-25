// Local end-to-end rig: game server on the emulators + static site. Run under `firebase emulators:exec`.
// Usage: node scripts/e2e-online.mjs  (keeps running until killed; prints the URL to open)
import { buildGameServer } from '../src/game-server.js';
const env = { ...process.env, WORLD_SEED_SECRET: 'local-dev-seed-secret-0123456789', INVITE_CODE: 'friends-2026', INTERNAL_TOKEN: 'local-internal-token', ALLOW_ORIGIN: process.env.ALLOW_ORIGIN || 'http://localhost:8765' };
const { server } = buildGameServer(env);
server.listen(8788, '127.0.0.1', () => process.stdout.write('READY game server http://127.0.0.1:8788 (invite code friends-2026)\n'));
setTimeout(() => process.exit(0), Number(process.env.E2E_SECONDS || 120) * 1000);
