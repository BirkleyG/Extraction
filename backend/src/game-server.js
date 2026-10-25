import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreGameRepository } from './firestore-game-repository.js';
import { GameService } from './game-service.js';
import { createGameHttpServer } from './game-http.js';
import { DEFAULT_NPC_BUYERS } from './npc.js';
import { generateWorld } from './world.js';
import { validateRuntimeEnvironment } from './server.js';

const monthOf = (ms) => `${new Date(ms).getUTCFullYear()}-${String(new Date(ms).getUTCMonth() + 1).padStart(2, '0')}`;

export function buildGameServer(env = process.env) {
  const runtime = validateRuntimeEnvironment(env);
  const app = initializeApp({ projectId: runtime.projectId, ...(runtime.emulator ? {} : { credential: applicationDefault() }) }, `extraction-game-${runtime.projectId}`);
  const firestore = getFirestore(app);
  const game = new GameService(new FirestoreGameRepository(firestore), { npcBuyers: DEFAULT_NPC_BUYERS });
  const server = createGameHttpServer({ auth: getAuth(app), game, allowOrigin: env.ALLOW_ORIGIN || null });
  return { server, game, firestore };
}

/** Idempotent month setup for a world: generated planet (server-only) and NPC buyer budgets. */
export async function prepareMonth(game, { worldId, monthId, seed, players, nowMs }) {
  await game.storePlanet({ worldId, monthId, planet: generateWorld({ seed, monthId, players }) });
  await game.seedNpcBuyers({ worldId, monthId, nowSec: Math.floor(nowMs / 1000) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { server, game } = buildGameServer();
    const worldId = process.env.WORLD_ID;
    if (worldId) await prepareMonth(game, { worldId, monthId: monthOf(Date.now()), seed: process.env.WORLD_SEED ?? `${worldId}-${monthOf(Date.now())}`, players: Number(process.env.WORLD_PLAYERS ?? 10), nowMs: Date.now() });
    const port = Number(process.env.PORT || 8788);
    server.listen(port, '127.0.0.1', () => process.stdout.write(`Game server listening on 127.0.0.1:${port}\n`));
  } catch (error) {
    process.stderr.write(`Game server startup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
