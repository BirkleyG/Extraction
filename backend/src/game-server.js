import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreGameRepository } from './firestore-game-repository.js';
import { GameService } from './game-service.js';
import { createGameHttpServer } from './game-http.js';
import { DEFAULT_NPC_BUYERS } from './npc.js';
import { generateWorld } from './world.js';
import { validateRuntimeEnvironment } from './server.js';
import { WorldAdmin } from './world-admin.js';

const monthOf = (ms) => `${new Date(ms).getUTCFullYear()}-${String(new Date(ms).getUTCMonth() + 1).padStart(2, '0')}`;

export function buildGameServer(env = process.env) {
  const runtime = validateRuntimeEnvironment(env);
  const app = initializeApp({ projectId: runtime.projectId, ...(runtime.emulator ? {} : { credential: applicationDefault() }) }, `extraction-game-${runtime.projectId}`);
  const firestore = getFirestore(app);
  const repository = new FirestoreGameRepository(firestore);
  const game = new GameService(repository, { npcBuyers: DEFAULT_NPC_BUYERS });
  const admin = env.WORLD_SEED_SECRET ? new WorldAdmin({
    firestore, game, repository, inviteCode: env.INVITE_CODE || null, seedSecret: env.WORLD_SEED_SECRET,
    maxMembers: Number(env.MAX_MEMBERS || 10), players: Number(env.WORLD_PLAYERS || 10),
  }) : null;
  const server = createGameHttpServer({ auth: getAuth(app), game, admin, internalToken: env.INTERNAL_TOKEN || null, allowOrigin: env.ALLOW_ORIGIN || null });
  return { server, game, firestore, admin };
}

/** Idempotent month setup for a world: generated planet (server-only) and NPC buyer budgets. */
export async function prepareMonth(game, { worldId, monthId, seed, players, nowMs }) {
  await game.storePlanet({ worldId, monthId, planet: generateWorld({ seed, monthId, players }) });
  await game.seedNpcBuyers({ worldId, monthId, nowSec: Math.floor(nowMs / 1000) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { server } = buildGameServer();
    const port = Number(process.env.PORT || 8788);
    // Cloud Run requires listening on all interfaces; local development stays loopback-only.
    server.listen(port, process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1', () => process.stdout.write(`Game server listening on 127.0.0.1:${port}\n`));
  } catch (error) {
    process.stderr.write(`Game server startup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
